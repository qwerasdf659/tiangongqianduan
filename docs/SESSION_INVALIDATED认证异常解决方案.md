# SESSION_INVALIDATED 认证异常解决方案

## 一、问题定义

| 项目 | 内容 |
|------|------|
| **问题现象** | 后端返回 `401 SESSION_INVALIDATED`，JWT Token 本身有效且未过期 |
| **影响范围** | 所有走 `authenticateToken` 中间件的 REST API 请求 |
| **根本性质** | 后端会话管理系统存在架构缺陷，不是前端问题 |
| **排查时间** | 2026-02-19 |
| **排查方式** | Node.js 直连 restaurant_points_dev 数据库 + 后端源码逐行核对 |

---

## 二、后端认证架构现状（基于实际代码）

### 2.1 认证链路

```
请求 → authenticateToken 中间件
       ├─ jwt.verify(token, JWT_SECRET) → 解码 decoded
       ├─ if decoded.session_token 存在:
       │    └─ AuthenticationSession.findValidByToken(session_token)
       │         查询: session_token 匹配 AND is_active=true AND expires_at > NOW()
       │         结果为 null → 返回 401 SESSION_INVALIDATED
       ├─ User.findOne(user_id, status='active')
       ├─ getUserRoles(user_id) → 角色+权限
       └─ 构建 req.user → next()
```

来源：`middleware/auth.js` 第452-559行

### 2.2 登录流程（创建会话）

```
POST /api/v4/auth/login 或 /auth/quick-login
  ├─ 验证手机号+验证码
  ├─ 查找/注册用户
  ├─ AuthenticationSession.deactivateUserSessions(userType, user_id, null)
  │    → 将该用户所有已有会话 is_active 设为 false
  ├─ AuthenticationSession.createSession(session_token, user_id, expires_in_minutes=120)
  │    → 创建新会话，有效期2小时
  ├─ generateTokens(user, { session_token })
  │    → JWT Payload 中嵌入 session_token
  └─ 返回 access_token
```

来源：`routes/v4/auth/login.js` 第93-311行、第388-584行

### 2.3 Token 刷新流程

```
POST /api/v4/auth/refresh
  ├─ 从 HttpOnly Cookie 读取 refresh_token
  ├─ verifyRefreshToken(refresh_token)
  ├─ generateTokens(user)          ← 注意：未传 session_token
  └─ 返回新 access_token（不含 session_token）
```

来源：`routes/v4/auth/token.js` 第110-182行

### 2.4 TTL 配置

| 配置项 | 值 | 来源 |
|--------|-----|------|
| JWT access_token 有效期 | 2小时 | `.env` JWT_EXPIRES_IN=2h |
| JWT refresh_token 有效期 | 7天 | `.env` JWT_REFRESH_EXPIRES_IN=7d |
| AuthenticationSession 有效期 | 2小时 | `login.js` expires_in_minutes=120 |
| 敏感操作续期 | +30分钟 | `sensitiveOperation.js` extendExpiry(30) |
| 普通请求续期 | 无 | `updateActivity()` 只更新 last_activity，不延长 expires_at |

### 2.5 数据库实际数据（2026-02-19 实时查询）

authentication_sessions 表统计：

| 统计项 | 值 |
|--------|-----|
| 总记录数 | 34 |
| is_active=true | 1 |
| is_active=false | 33 |
| user_type='user' 的记录数 | 0 |
| user_type='admin' 的记录数 | 34 |
| 涉及用户 | 仅 user_id=31（管理员账户） |
| Session 有效期分布 | 全部为120分钟 |

来源IP分布：

| 来源IP | 会话数 | 含义 |
|--------|-------|------|
| 127.0.0.1 | 26 | Web管理后台从服务器本地登录 |
| ::ffff:127.0.0.1 | 7 | Web管理后台从服务器本地登录（IPv6映射） |
| 116.4.39.203 | 1 | 外网登录（小程序或外部浏览器） |

角色分布（全库）：

| 角色 | role_level | 用户数 |
|------|-----------|--------|
| admin | 100 | 4 |
| regional_manager | 80 | 0 |
| business_manager | 60 | 2 |
| merchant_manager | 40 | 1 |
| ops | 30 | 1 |
| user | 0 | 42 |

关键发现：数据库中没有任何 `user_type='user'` 的认证会话记录，说明42个普通用户（role_level=0）从未触发过带会话管理的登录流程，SESSION_INVALIDATED 问题目前仅在管理员账户上被观察到。

---

## 三、识别出的后端缺陷（4个，含1个安全漏洞）

### 缺陷1（P0 安全漏洞）：Token 刷新完全绕过会话验证

**位置**：`routes/v4/auth/token.js` 第150行

**现状**：`generateTokens(user)` 第二参数 `options.session_token` 未传，刷新后的新 JWT 不含 `session_token` 字段。

**后果链路**：
1. 用户登录 → JWT 包含 session_token → 认证中间件正常检查会话
2. 2小时后 JWT 过期 → 前端用 refresh_token 刷新 → 新 JWT 不含 session_token
3. 新 JWT 走 authenticateToken → `decoded.session_token` 为 undefined → 第475行 `if (decoded.session_token)` 为 false → 跳过会话检查
4. 此后7天内所有请求均不再受会话保护

**影响**：单设备登录策略在首次 Token 刷新后完全失效。攻击者若获取 refresh_token，可绕过会话管理持续访问。

### 缺陷2（P0）：Session TTL 与 JWT TTL 相同，且无自动续期

**位置**：`routes/v4/auth/login.js` expires_in_minutes=120 + `models/AuthenticationSession.js` updateActivity()

**现状**：
- JWT 和 Session 均为2小时有效期
- `updateActivity()`（每次认证请求调用）只更新 `last_activity` 字段，不延长 `expires_at`
- 仅 `sensitiveOperation.js` 的 `extendExpiry(30)` 会续期，但仅在支付、挂牌等敏感操作时触发

**后果**：普通用户持续使用2小时后，Session 过期但 JWT 同时过期。如果 JWT 先通过 refresh 续期但 Session 没有续期（因为 Token 刷新不创建新 Session），就会出现 JWT 有效但 Session 无效的状态。

### 缺陷3（P1）：错误码不区分失效原因

**位置**：`middleware/auth.js` 第479-493行

**现状**：`findValidByToken` 返回 null 后，统一返回 `SESSION_INVALIDATED` + "会话已失效，请重新登录（可能是其他设备登录导致）"。

**问题**：前端无法区分以下三种场景：
- Session 存在但 `expires_at` 已过期 → 应自动续期或静默重登
- Session 存在但 `is_active=false`（被新登录覆盖）→ 应提示"账号已在其他设备登录"
- Session 不存在（已被清理任务删除）→ 应直接重登

### 缺陷4（P2）：REST API 与 Socket.IO 认证不一致

**位置**：`services/ChatWebSocketService.js` 握手中间件

**现状**：
- REST API（`middleware/auth.js`）：JWT 验证 + Session 有效性验证
- Socket.IO（`ChatWebSocketService.js`）：仅 JWT 验证，无 Session 检查

**后果**：同一个 Token，REST API 返回 401 但 Socket.IO 连接成功。

---

## 四、解决方案

### 方案A（P0 必修）：Token 刷新时携带 session_token

**修改文件**：`routes/v4/auth/token.js`（`POST /api/v4/auth/refresh` 端点）

**方案要点**：
1. 刷新时，从旧 JWT 中提取 `session_token`（如果有）
2. 如果旧 session_token 存在且对应会话仍有效 → 延长该会话的 `expires_at`，将同一个 session_token 传入 `generateTokens(user, { session_token })`
3. 如果旧 session_token 不存在或会话已失效 → 创建新的 AuthenticationSession → 将新 session_token 传入 `generateTokens`
4. 新 JWT 始终包含有效的 session_token，会话验证链不中断

**需要处理的边界情况**：
- 旧 JWT 没有 session_token（历史遗留 Token）：创建新会话
- 旧会话已被另一设备登录覆盖（is_active=false）：这属于正常的单设备登录策略，此时 refresh 也应被拒绝，返回 SESSION_REPLACED 提示重新登录
- 旧会话已过期：创建新会话

### 方案B（P0 必修）：延长 Session TTL 或增加自动续期

两个子方案选其一：

**B1（推荐 ✅ 已采纳）：Session TTL 延长为7天，与 refresh_token 生命周期对齐**

修改位置：`routes/v4/auth/login.js`（两处 `expires_in_minutes: 120`）和方案A中 Token 刷新创建新会话处

将 `expires_in_minutes` 从 120 改为 10080（7天）。

理由：Session 的安全价值在于"新设备登录使旧设备失效"（单设备策略），不在于短时间超时强制重登。2小时超时适用于银行场景，不适用于小程序日常使用场景。Session 的生命周期应与用户的认证周期（refresh_token 7天）一致。

**B2（备选，未采纳）：authenticateToken 中保持2小时 TTL 但增加自动续期**

修改位置：`middleware/auth.js` 第496行附近

在 `session.updateActivity()` 后增加判断：如果 `session.expires_at` 距当前不足30分钟，自动调用 `session.extendExpiry(120)` 续期2小时。

效果：只要用户持续活跃（每次 API 请求都会触发），Session 永远不会过期。用户停止使用超过2小时后 Session 自动失效。

B2 相比 B1 更精细，但每次请求多一次条件判断和可能的写操作。对于小程序场景，B1 足够。

### 方案C（P1）：细分错误码

**修改文件**：`middleware/auth.js` 第475-493行

**方案要点**：当 `findValidByToken(session_token)` 返回 null 后，追加一次无条件查询确定具体原因：

| 查询结果 | 错误码 | 提示语 | 前端应对 |
|----------|--------|--------|---------|
| 记录存在，is_active=false | `SESSION_REPLACED` | "您的账号已在其他设备登录" | 弹窗提示，用户确认后重新登录 |
| 记录存在，is_active=true 但 expires_at 过期 | `SESSION_EXPIRED` | "会话已过期，请重新登录" | 静默尝试 Token 刷新，失败则重登 |
| 记录不存在 | `SESSION_NOT_FOUND` | "登录状态已失效，请重新登录" | 静默重新登录 |

追加查询：`AuthenticationSession.findOne({ where: { session_token } })`（不带 is_active 和 expires_at 条件）。

### 方案D（P2）：Socket.IO 补齐会话检查

**修改文件**：`services/ChatWebSocketService.js` 握手中间件

在 `jwt.verify()` 成功后、`socket.user` 赋值前，增加 `AuthenticationSession.findValidByToken(decoded.session_token)` 检查。会话无效时拒绝 WebSocket 连接。

### 方案E（P2 可选，不做）：同设备登录复用会话

**修改文件**：`routes/v4/auth/login.js`

当前策略：任何登录都 `deactivateUserSessions` → 杀掉所有旧会话。

优化为：
1. 登录时查询该用户的活跃会话列表
2. 如果存在来自同一 IP 的活跃会话 → 复用（更新 `last_activity` 和 `expires_at`），不创建新会话
3. 如果是不同 IP → 执行当前的失效+新建逻辑

效果：用户在同一设备/网络上重复登录不会杀掉自己的旧会话，减少不必要的 SESSION_INVALIDATED。

---

## 五、问题责任归属

### 后端数据库项目（主因 — 4项待修）

| 序号 | 问题 | 严重程度 | 修改位置 |
|------|------|---------|---------|
| B1 | Token 刷新不携带 session_token，会话验证被绕过 | P0 安全漏洞 | `routes/v4/auth/token.js` |
| B2 | Session TTL=2h 无自动续期，正常使用也会超时 | P0 | `routes/v4/auth/login.js` 或 `middleware/auth.js` |
| B3 | 错误码不区分失效原因，前端无法针对性处理 | P1 | `middleware/auth.js` |
| B4 | REST API 与 Socket.IO 认证标准不一致 | P2 | `services/ChatWebSocketService.js` |

结论：即使前端没有任何 Bug，用户正常使用2小时后 Session 过期 + Token 刷新后会话验证被绕过，这两个问题纯粹是后端架构设计缺陷。后端是主因。

### 微信小程序前端（次要 — 1项待查）

| 序号 | 问题 | 严重程度 | 说明 |
|------|------|---------|------|
| M1 | 启动流程可能触发多余的登录请求 | P1 | 数据库中短时间内连续创建多个会话，说明前端可能在冷启动/热启动时重复调用 login 接口而非 refresh 接口 |

正确的启动认证流程：
1. 读取本地缓存的 access_token
2. 解析 JWT 检查是否过期（本地判断，不发请求）
3. 未过期 → 直接使用
4. 已过期 → 调用 `POST /api/v4/auth/refresh`（Cookie 自动携带 refresh_token）
5. 刷新成功 → 使用新 access_token
6. 刷新失败 → 此时才调用 `POST /api/v4/auth/login` 或 `/auth/quick-login`

注意：即使前端完美实现上述流程，后端的 B1（Token 刷新不携带 session_token）和 B2（Session TTL 过短）问题仍会导致 401。前端优化可减少触发频率，但不能根治问题。

### Web管理后台前端（次要 — 1项待查）

| 序号 | 问题 | 严重程度 | 说明 |
|------|------|---------|------|
| W1 | 从 127.0.0.1 连续创建26个会话，存在重复登录 | P1 | 可能是页面刷新、路由守卫、或心跳机制重复触发登录接口 |

Web管理后台和微信小程序共享同一用户的会话池（按 user_type+user_id 维度），任一端登录都会杀掉另一端的活跃会话。

---

## 六、实施状态（2026-02-18 完成）

| 方案 | 修改文件 | 状态 | 验证结果 |
|------|---------|------|---------|
| A (P0) | `routes/v4/auth/token.js` | ✅ 已完成 | Token 刷新后 JWT 始终包含 session_token |
| B1 (P0) | `routes/v4/auth/login.js` (两处) | ✅ 已完成 | Session TTL = 7天 (10080分钟) |
| C (P1) | `middleware/auth.js` | ✅ 已完成 | 3种错误码区分失效原因 |
| D (P2) | `services/ChatWebSocketService.js` | ✅ 已完成 | WebSocket 拒绝无 session_token 的连接 |
| W1 | `admin/src/api/base.js` + `admin/src/modules/system/pages/login.js` | ✅ 已完成 | 401 携带错误码跳转登录页并显示原因 |

---

## 七、微信小程序前端对接指南（M1）

### 7.1 后端已修复的内容（前端无需关心）

- Token 刷新时后端自动维持 session_token 连续性
- Session TTL 已延长至 7 天，正常使用不再频繁过期
- WebSocket 握手也做了会话有效性检查

### 7.2 前端需要处理的 401 错误码

后端 401 响应格式：
```json
{
  "success": false,
  "code": "SESSION_REPLACED",
  "message": "您的账号已在其他设备登录"
}
```

| 错误码 | 含义 | 前端建议处理 |
|--------|------|------------|
| `SESSION_REPLACED` | 账号在其他设备登录，旧设备会话被覆盖 | 弹窗提示"您的账号已在其他设备登录"，确认后跳登录页 |
| `SESSION_EXPIRED` | 会话超时（7天未使用） | 静默尝试 Token 刷新，失败则跳登录页 |
| `SESSION_NOT_FOUND` | 会话记录被清理任务删除 | 直接跳登录页 |
| `TOKEN_EXPIRED` | JWT Token 过期 | 调用 `POST /api/v4/auth/refresh` 刷新 |
| `MISSING_TOKEN` | 请求未携带 Authorization 头 | 跳登录页 |
| `INVALID_TOKEN` | Token 格式错误或签名无效 | 清除本地 Token，跳登录页 |

### 7.3 推荐的认证流程

```
小程序启动
  ├─ 读取本地 storage 中的 access_token
  ├─ 本地解析 JWT 判断是否过期（不发请求）
  │   ├─ 未过期 → 直接使用
  │   └─ 已过期 → POST /api/v4/auth/refresh（Cookie 自动携带 refresh_token）
  │       ├─ 刷新成功 → 使用新 access_token
  │       └─ 刷新失败（401 SESSION_REPLACED/INVALID_REFRESH_TOKEN）→ 重新登录
  └─ 无 Token → 登录流程
```

### 7.4 Token 刷新接口注意事项

`POST /api/v4/auth/refresh`

- refresh_token 通过 HttpOnly Cookie 自动携带（前端请求需 `credentials: 'include'`）
- 刷新时建议携带旧的 access_token 在 Authorization 头中（即使已过期），后端会从中提取 session_token 来复用会话
- 如果不携带旧 access_token，后端会创建新会话（功能正常但会触发单设备登录策略对旧会话的覆盖）
- 刷新成功后新 JWT 始终包含有效的 session_token

### 7.5 WebSocket 连接注意事项

- 连接时必须在 `auth.token` 中传递有效的 access_token
- Token 必须包含 session_token 字段，否则握手会被拒绝
- 如果 WebSocket 连接被服务端断开（reason 包含 "session"），说明会话已失效，需要重新登录后重连

### 7.6 避免重复登录的建议

数据库中观察到短时间内连续创建多个会话（每次登录会杀掉旧会话），前端应避免：
- 小程序冷启动/热启动时直接调用 login 而不先尝试 refresh
- 页面切换或路由守卫中重复触发登录请求
- 心跳机制中包含登录逻辑

---

**排查基准**：后端源码当前实际状态 + restaurant_points_dev 数据库实时查询（2026-02-19）
**修复日期**：2026-02-18
**技术栈**：Node.js + Express + Sequelize + MySQL + JWT + Socket.IO
**数据库**：restaurant_points_dev，host=dbconn.sealosbja.site:42569，timezone=+08:00
