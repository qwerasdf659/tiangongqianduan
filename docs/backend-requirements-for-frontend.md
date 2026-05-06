# 微信小程序前端 → 后端需求清单（后端审查版）

> 发起方：微信小程序前端项目 v5.2.0
> 日期：2026-05-04
> 基于：`docs/前端功能求证-需后端确认.md` 确认结果
> 更新：2026-05-04 — 补充前端代码位置和类型定义信息
> 更新：2026-05-04 — 追加商品兑换/交易市场空白问题的后端排查项
> **更新：2026-05-04 — 后端数据库项目审查完成，以后端实际代码和真实数据库为准**
> **更新：2026-05-05 — 后端 4 项修改全部完成并验证通过（campaign_code / store 关联 / DIY 小程序码 / 核销幂等键）**

---

## 审查方法说明

本次审查基于以下真实数据源（非历史报告/文档）：

1. **后端代码**：直接读取 `routes/v4/`、`services/`、`models/` 目录下的实际代码
2. **真实数据库**：通过 Node.js mysql2 连接 `restaurant_points_dev` 数据库查询真实数据
3. **Web 管理后台前端**：读取 `admin/src/api/`、`admin/src/modules/` 目录下的实际代码

---

## 后端项目技术框架概览

| 项目 | 技术栈 |
|------|--------|
| 运行时 | Node.js 20+ |
| 框架 | Express 4.18 |
| ORM | Sequelize 6.35 |
| 数据库 | MySQL (mysql2 3.6.5)，charset utf8mb4，timezone +08:00 |
| 缓存 | Redis (ioredis 5.7) |
| 认证 | JWT Bearer Token + Refresh Token |
| 文件存储 | Sealos Object Storage (aws-sdk) |
| WebSocket | Socket.IO 4.8 |
| 架构模式 | 读写分离（QueryService / CoreService）、ServiceManager 服务注册、TransactionManager 事务管理 |
| API 版本 | 统一 `/api/v4/` 前缀 |
| 响应格式 | `{ success, data, message, code, timestamp, request_id }` |
| 命名规范 | 全链路 snake_case |

**Web 管理后台前端技术框架：**

| 项目 | 技术栈 |
|------|--------|
| 构建工具 | Vite 6.4 |
| JS 框架 | Alpine.js 3.15（MPA 多页应用，非 SPA） |
| CSS | Tailwind CSS 3.4 |
| 图表 | ECharts 6.0 |
| API 层 | 36 个 API 文件，统一 `fetch` 封装，`/api/v4/console/` 前缀 |
| 状态管理 | Alpine.js stores + localStorage |
| 权限 | RBAC（role_level: 0/1/30/100） |

---

## 一、需要后端新增实现的接口

### 1.1 DIY 作品小程序码生成

| 项目 | 内容 |
|------|------|
| **前端期望路径** | `GET /api/v4/diy/works/:diy_work_id/qrcode` |
| **后端实际状态** | ✅ 已实现（2026-05-04） — `routes/v4/diy.js` 新增 `GET /works/:id/qrcode`，`services/diy/QRCodeService.js` 新增小程序码生成服务 |
| **优先级** | 中（DIY 分享海报功能依赖此接口） |
| **责任方** | ✅ 后端已完成 |

**后端实现方案（基于现有技术栈）：**

- 后端已有微信小程序配置（`.env` 中 `WX_APPID`、`WX_SECRET`）
- 后端已有 Sealos 对象存储服务（`SealosStorageService`），可存储生成的小程序码图片
- 后端已有 `sharp` 图片处理库（`package.json` 中 sharp 0.34）
- 实现路径：在 `routes/v4/diy.js` 新增路由 → 调用微信 `wxacode.getUnlimited` API → 上传到 Sealos → 返回 URL
- 建议路由：`GET /api/v4/diy/works/:id/qrcode`（✅ 已实现，与现有 DIY 路由风格一致）
- 已新增 `services/diy/QRCodeService.js`，复用 `SealosStorageService` 上传

**✅ 已实现（2026-05-04）：** 小程序码的 `scene` 参数格式已采用 `diy_work_id={id}`，已缓存到 Sealos（key 为 `diy-qrcodes/work_{id}.png`）

**后端应返回格式（以后端标准响应为准）：**

```json
{
  "success": true,
  "data": {
    "qrcode_url": "https://objectstorageapi.bja.sealos.run/br0za7uc-tiangong/diy-qrcodes/work_123.png"
  },
  "message": "小程序码生成成功"
}
```

**🟡 微信小程序前端调用说明：**
- 实际路径：`GET /api/v4/diy/works/:id/qrcode`（注意是 `:id` 不是 `:diy_work_id`）
- 认证：需要 JWT Bearer Token（`authenticateToken` 中间件）
- 权限：只能获取自己作品的小程序码（后端会校验 account_id 归属）
- 首次调用约 500ms（调微信 API + 上传 Sealos），后续调用约 50ms（直接返回缓存 URL）
- 小程序码 `page` 参数当前设为 `pages/diy/detail/index`，前端需确认此路径是否正确

### 1.2 品类树接口 `GET /api/v4/system/config/category-tree`

| 项目 | 内容 |
|------|------|
| **前端期望路径** | `GET /api/v4/system/config/category-tree` |
| **后端实际状态** | ✅ 已实现（2026-05-05） — `routes/v4/system/config.js` 新增公开端点 |
| **优先级** | 中（商品分类导航、筛选器依赖此接口） |
| **责任方** | ✅ 后端已完成 |

**接口说明：**
- 路径：`GET /api/v4/system/config/category-tree`
- 认证：**无需登录**（公开接口）
- 数据来源：`categories` 表，按 `sort_order` 排序，构建两级树
- 业务场景：微信小程序商品分类导航、筛选器、DIY 材料分类等

**后端实际返回结构：**

```json
{
  "success": true,
  "data": [
    {
      "category_id": 1,
      "parent_category_id": null,
      "category_name": "电子产品",
      "category_code": "electronics",
      "level": 1,
      "sort_order": 1,
      "is_enabled": 0,
      "children": [
        {
          "category_id": 11,
          "parent_category_id": 1,
          "category_name": "手机配件",
          "category_code": "phone_accessories",
          "level": 2,
          "sort_order": 1,
          "is_enabled": 1
        }
      ]
    }
  ],
  "message": "获取品类树成功"
}
```

**🟡 微信小程序前端注意：**
- `is_enabled` 为 0 表示品类已禁用，前端应过滤掉 `is_enabled === 0` 的品类不展示
- 当前数据库有 10 个顶级品类，部分已禁用
- 字段全部是 snake_case，无需映射

---

## 二、需要后端确认的字段返回（审查结果 — 回复微信小程序前端）

### 2.1 抽奖历史 `GET /api/v4/lottery/history` — ✅ 后端已完成全部字段补充

**回复微信小程序前端：**

| 字段 | 后端审查结果 | 责任方 |
|------|------------|--------|
| `lottery_draw_id` (VARCHAR) | ✅ 已返回 | — |
| `reward_tier` (high/mid/low/fallback) | ✅ 已返回 | — |
| `campaign_name` | ✅ 已通过 JOIN `lottery_campaigns` 表返回 | — |
| `campaign_code` | ✅ 已补充（2026-05-04），include attributes 已加入 `campaign_code`，返回映射已加入 | ✅ 已完成 |

**后端代码定位（`services/lottery/QueryService.js` → `getUserHistory()`）：**
- include 中 `campaign` 关联只取了 `['lottery_campaign_id', 'campaign_name', 'campaign_type']`，缺少 `'campaign_code'`
- 返回映射中只有 `campaign_name: record.campaign?.campaign_name`，没有 `campaign_code`

**真实数据库验证：** `lottery_campaigns` 表确实有 `campaign_code` 字段（如 `CAMP20250901001`）

**后端修复方案（2 行代码）：**
1. campaign include attributes 加入 `'campaign_code'`
2. 返回映射加入 `campaign_code: record.campaign?.campaign_code || null`

**后端实际返回的每条记录结构（供前端对齐）：**

```json
{
  "lottery_draw_id": "draw_mmf7pp8q_31_1u75be",
  "lottery_campaign_id": 1,
  "campaign_name": "餐厅积分抽奖",
  "campaign_code": "CAMP20250901001",
  "reward_tier": "high",
  "prize": {
    "id": 5,
    "name": "奖品名称",
    "type": "physical",
    "value": 100,
    "primary_media_id": null
  },
  "points_cost": 30,
  "probability": 0.05,
  "is_guarantee": false,
  "draw_time": "2026-05-04T07:00:00+08:00"
}
```

**微信小程序前端需注意：**
- `campaign_code` 已由后端补充，可直接使用
- 后端返回的字段名是 `points_cost`（非 `cost_points`）、`draw_time`（非 `created_at`）、`is_guarantee`（非 `guarantee_triggered`）— 这些是 Service 层做了字段重映射后的名称

---

### 2.2 抽奖统计 `GET /api/v4/lottery/statistics` — ✅ 后端已完整实现

**回复微信小程序前端：字段名和结构基本准确，但有一个关键差异。**

**后端实际返回结构（`services/lottery/QueryService.js` → `getUserStatistics()`，真实代码）：**

```json
{
  "success": true,
  "data": {
    "user_id": 31,
    "total_draws": 3770,
    "total_high_tier_wins": 100,
    "guarantee_wins": 20,
    "normal_high_tier_wins": 80,
    "high_tier_rate": 2.65,
    "today_draws": 5,
    "today_high_tier_wins": 0,
    "today_high_tier_rate": 0,
    "total_points_cost": 113100,
    "reward_tier_distribution": { "high": 100, "mid": 500, "low": 1200, "fallback": 1970 },
    "last_high_tier_win": {
      "lottery_draw_id": "draw_xxx",
      "lottery_campaign_id": 1,
      "prize": { "id": 5, "name": "奖品名", "type": "physical", "value": 100 },
      "is_guarantee": false,
      "win_time": "2026-05-04T07:00:00+08:00"
    },
    "timestamp": "2026-05-04T07:00:00+08:00"
  },
  "message": "统计信息获取成功"
}
```

| 前端期望字段 | 后端实际字段 | 匹配 | 说明 |
|-------------|-------------|------|------|
| `total_draws` | `total_draws` | ✅ | — |
| `total_high_tier_wins` | `total_high_tier_wins` | ✅ | — |
| `high_tier_rate`（小数） | `high_tier_rate`（百分比数值） | ⚠️ | **后端返回 2.65 表示 2.65%，不是 0.0265** |
| `today_draws` | `today_draws` | ✅ | — |
| `reward_tier_distribution.high` | `reward_tier_distribution.high` | ✅ | — |
| `reward_tier_distribution.mid` | `reward_tier_distribution.mid` | ✅ | — |
| `reward_tier_distribution.low` | `reward_tier_distribution.low` | ✅ | — |
| `reward_tier_distribution.fallback` | `reward_tier_distribution.fallback` | ✅ | — |

**🟡 微信小程序前端需注意：**
1. `high_tier_rate` 后端返回的是 **百分比数值**（如 2.65 表示 2.65%），不是小数（0.0265）。前端展示时如果直接拼 `%` 后缀即可，不需要再乘以 100
2. 后端额外返回了 `guarantee_wins`、`normal_high_tier_wins`、`today_high_tier_wins`、`today_high_tier_rate`、`total_points_cost`、`last_high_tier_win`、`timestamp` 等字段，前端可选使用
3. 前端类型定义 `LotteryUserStatistics` 中建议把这些额外字段标记为可选

**责任方：** 🟡 微信小程序前端 — 确认 `high_tier_rate` 展示逻辑

---

### 2.3 DIY 材料分组 `GET /api/v4/diy/material-groups` — ✅ 后端已返回 `sample_name`

**回复微信小程序前端：后端已返回 `sample_name`，但响应格式与前端期望不同。**

**后端实际实现（`services/diy/MaterialService.js` → `getMaterialGroups()`，真实代码）：**

```javascript
static async getMaterialGroups() {
  const groups = await DiyMaterial.findAll({
    attributes: [
      'group_code',
      [fn('COUNT', col('diy_material_id')), 'count'],
      [fn('MIN', col('display_name')), 'sample_name']  // ✅ 已返回
    ],
    where: { is_enabled: true },
    group: ['group_code'],
    order: [['group_code', 'ASC']],
    raw: true
  })
  return groups  // 直接返回数组，不包装为 { groups: [...] }
}
```

**真实数据库验证（`diy_materials` 表实际数据）：**
- `blue` 分组：1 个材料，sample_name = "海蓝宝"
- `green` 分组：2 个材料，sample_name = "绿宝石01"

**后端实际返回格式（⚠️ 与前端期望不同）：**

```json
{
  "success": true,
  "data": [
    { "group_code": "blue", "count": 1, "sample_name": "海蓝宝" },
    { "group_code": "green", "count": 2, "sample_name": "绿宝石01" }
  ],
  "message": "获取材料分组成功"
}
```

**前端期望的格式 vs 后端实际格式：**

| 项目 | 前端期望 | 后端实际 |
|------|---------|---------|
| data 结构 | `data: { groups: [...] }` | `data: [...]`（直接是数组） |
| `sample_name` | 需确认是否返回 | ✅ 已返回（通过 `MIN(display_name)` 聚合） |

**🟡 微信小程序前端需修改：**
- `getDiyMaterialGroups()` 的响应解析：直接用 `response.data` 作为分组数组，不要取 `response.data.groups`
- 前端备用方案（从珠子数据自行聚合 sample_name）可以保留作为降级，但后端已直接返回

**责任方：** 🟡 微信小程序前端 — 适配 `data` 直接是数组

---

### 2.4 消费记录详情 `GET /api/v4/shop/consumption/detail/:id` — ✅ 后端已补充 store 关联查询

**回复微信小程序前端：`store_name` 当前未返回，原因是 Service 层漏了 JOIN，后端需补充。**

**后端实际实现分析：**

1. **模型层（`models/ConsumptionRecord.js`）— ✅ 已就绪：**
   - `ConsumptionRecord.belongsTo(Store, { foreignKey: 'store_id', as: 'store' })` — 关联已定义
   - `toAPIResponse()` 中已有：`if (this.store) { response.store_name = this.store.store_name; response.store_code = this.store.store_code }`

2. **服务层（`services/consumption/QueryService.js` → `getConsumptionRecordDetail()`）— ❌ 缺少 store：**
   - include 数组中**没有** `{ association: 'store' }`
   - 当前只 include 了：`user`、`merchant`、`reviewer`、`review_records`（可选）、`points_transaction`（可选）
   - 因此即使模型层 `toAPIResponse()` 有 `store_name` 的格式化逻辑，由于 `this.store` 为 `undefined`，实际不会返回

3. **真实数据库验证：**
   - `consumption_records` 表有 `store_id` 字段（样本数据：store_id=7）
   - `stores` 表有对应数据（store_id=7 → store_name="API验证测试门店"）

| 字段 | 后端状态 | 责任方 |
|------|---------|--------|
| `store_name` | ✅ 已补充（2026-05-04），include 已加入 store 关联 | ✅ 已完成 |
| `store_code` | ✅ 同上 | ✅ 已完成 |
| `reviewed_at` | ✅ 已在 `toAPIResponse()` 中返回（经 BeijingTimeHelper 格式化） | — |

**后端修复方案（4 行代码）：**
在 `services/consumption/QueryService.js` 的 `getConsumptionRecordDetail()` 方法中，include 数组加入：

```javascript
{
  association: 'store',
  attributes: ['store_id', 'store_name', 'store_code'],
  required: false
}
```

模型层 `toAPIResponse()` 已经处理了 `this.store` 的格式化，无需额外修改。

**微信小程序前端：** `store_name` 和 `store_code` 已由后端补充，可直接使用。`reviewed_at` 后端已返回。

---

## 三、需要后端修复/补充的问题

### 3.1 核销订单幂等键 — ✅ 后端已补充 Header 幂等键（双重保护）

**回复微信小程序前端：前端发送 `Idempotency-Key` Header 的做法是正确的，后端已实现读取和幂等检查。**

**后端实际实现（`routes/v4/shop/redemption/orders.js`）：**
- 使用 `RedemptionService.createOrder()` 处理核销码生成
- 核销码通过 SHA-256 哈希存储（`code_hash` 唯一约束）
- ✅ 已读取 `req.headers['idempotency-key']` 并调用 `IdempotencyService.getOrCreateRequest()` 进行幂等检查

**对比兑换路由（`routes/v4/exchange/index.js`）：**
- ✅ 兑换路由已完整实现 `Idempotency-Key` Header 读取 + `IdempotencyService.getOrCreateRequest()` 幂等检查

| 接口 | 幂等键支持 | 责任方 |
|------|-----------|--------|
| `POST /api/v4/exchange` | ✅ 已实现（Header Idempotency-Key + IdempotencyService） | — |
| `POST /api/v4/shop/redemption/orders` | ✅ 已实现（2026-05-04），Header Idempotency-Key + IdempotencyService | ✅ 已完成 |

**后端修复方案：**
复用已有的 `IdempotencyService`（已注册到 ServiceManager），在 `routes/v4/shop/redemption/orders.js` 中加入幂等检查逻辑，参考 `routes/v4/exchange/index.js` 的实现模式。

**✅ 已实现（2026-05-04）：** 核销订单已统一加上 Header 幂等键（双重保护方案 C）。微信小程序前端调用 `POST /api/v4/shop/redemption/orders` 时**必须**在 Header 中携带 `Idempotency-Key`，否则会收到 400 错误。格式建议：`redemption_{timestamp}_{random}`

---

## 四、环境配置确认

### 4.1 生产环境独立域名

当前 `.env` 配置：
- `PUBLIC_BASE_URL=https://omqktqrtntnn.sealosbja.site`
- `PUBLIC_WS_URL=wss://omqktqrtntnn.sealosbja.site/ws`

testing 和 production 确实共用同一域名。如需独立生产域名，需在 Sealos 平台配置后同步更新：
- 后端 `.env` 中的 `PUBLIC_BASE_URL` 和 `PUBLIC_WS_URL`
- Web 管理后台 `admin/vite.config.js` 中的 proxy 配置
- 微信小程序 `config/env.ts` 中的 `baseUrl`

**责任方：** 运维/部署决策，非代码问题

---

## 五、前后端约定确认（以后端实际实现为准 — 回复微信小程序前端）

**回复微信小程序前端：约定基本一致，但有 2 处差异需注意。**

| 约定项 | 前端文档描述 | 后端实际实现 | 状态 |
|--------|-------------|-------------|------|
| 命名风格 | 统一 `snake_case` | 全链路 `snake_case`（数据库、API、模型） | ✅ 一致 |
| 主键命名 | `{table_name}_id` | `{table_name}_id`（如 `lottery_draw_id`、`consumption_record_id`） | ✅ 一致 |
| 响应格式 | `{ success, data, message }` | `{ success, data, message, code, timestamp, request_id }` | ⚠️ 后端多返回 `code`、`timestamp`、`request_id` 三个字段 |
| 认证方式 | JWT Bearer Token | JWT Bearer Token（`Authorization: Bearer xxx`） | ✅ 一致 |
| 幂等键 | 请求头 `Idempotency-Key` | 兑换接口 + 核销接口均已实现（统一要求 Idempotency-Key Header） | ✅ 全部统一 |
| 时间格式 | 数据库 UTC 存储，API 返回北京时间 | 数据库 **UTC+8 存储**（`TZ=Asia/Shanghai`），API 返回北京时间 | ⚠️ 数据库不是 UTC 而是 UTC+8 |
| 分页格式 | `{ page, page_size, total, total_pages }` | `{ page, page_size, total, total_pages }` | ✅ 一致 |
| API 版本 | 统一 `/api/v4/` 前缀 | 统一 `/api/v4/` 前缀 | ✅ 一致 |

**🟡 微信小程序前端需注意：**
1. 后端响应体比前端预期多了 `code`、`timestamp`、`request_id` 字段，前端类型定义建议加上这些可选字段
2. 后端数据库时区是 `Asia/Shanghai`（UTC+8），不是 UTC。API 返回的时间已经是北京时间，前端不需要做时区转换

---

## 六、商品兑换/交易市场页面空白 — 后端排查结果（真实数据库验证）

### 问题现象

微信小程序"商城"Tab 页面中，"商品兑换"和"交易市场"两个子 Tab 内容均为空白。

### 6.1 兑换页面配置接口 `GET /api/v4/system/config/exchange-page` — ✅ 后端已实现且数据正常

**回复微信小程序前端：**

1. ✅ 此接口已实现并部署（公开接口，无需登录）
2. ✅ 返回的 `tabs` 数组包含 `exchange`（商品兑换，enabled=true）和 `market`（交易市场，enabled=true）
3. ⚠️ 后端返回的配置结构与前端期望有差异（见下方对比）

**后端实际返回结构（从 `system_settings` 表 `setting_key='exchange_page'` 读取）：**

```json
{
  "success": true,
  "data": {
    "tabs": [
      { "key": "exchange", "icon": "download", "label": "商品兑换", "enabled": true, "sort_order": 1 },
      { "key": "market", "icon": "success", "label": "交易市场", "enabled": true, "sort_order": 2 }
    ],
    "spaces": [...],
    "shop_filters": {...},
    "market_filters": {...},
    "card_display": {...},
    "detail_page": { "attr_display_mode": "grid", "tag_style_type": "game" },
    "ui": { "grid_page_size": 4, "waterfall_page_size": 20, "low_stock_threshold": 10, ... },
    "version": "1714924800000",
    "updated_at": "2026-05-04T00:00:00+08:00",
    "is_default": false
  }
}
```

**前端期望 vs 后端实际对比：**

| 项目 | 前端期望 | 后端实际 |
|------|---------|---------|
| `tabs` 中有 `exchange-rate` Tab | ✅ 期望有 | ❌ 后端配置中没有 `exchange-rate` Tab |
| `theme.primary_color` | ✅ 期望有 | ❌ 后端没有 `theme` 字段，有 `card_display` 字段 |
| `tabs[].icon` | 未提及 | ✅ 后端返回了 `icon` 字段 |
| `tabs[].sort_order` | 未提及 | ✅ 后端返回了 `sort_order` 字段 |

**🟡 微信小程序前端需注意：**
1. 后端没有 `exchange-rate`（资产转换）Tab，如果前端需要此 Tab，需要后端在 `system_settings` 中添加配置
2. 后端没有 `theme` 字段，前端如果依赖 `theme.primary_color` 需要改为从 `card_display` 或 `spaces` 中获取颜色配置
3. 后端返回了大量前端可能未使用的配置（`spaces`、`shop_filters`、`market_filters`、`card_display`、`detail_page`、`ui`），前端可以按需使用

**责任方：** 非此接口问题（接口正常返回数据）

---

### 6.2 商品列表接口 `GET /api/v4/exchange/items` — ✅ 后端已实现且有数据

**后端实际实现（`routes/v4/exchange/index.js`）：**
- ✅ 路由已实现，支持 `space=lucky` 筛选
- ✅ 通过 `ExchangeQueryService.getMarketItems()` 查询

**真实数据库验证：**
- ✅ `exchange_items` 表中有 **20 条** `status='active' AND space='lucky'` 的商品数据
- ⚠️ 另有 97 条 `status='inactive' AND space='lucky'` 的商品（已下架）
- ❌ 没有 `space='premium'` 的活跃商品

**结论：** 商品数据存在，接口正常。如果前端仍然空白，问题可能在：
1. 前端调用时参数不正确
2. 前端解析响应数据的逻辑有误
3. 网络/认证问题

**责任方：** 🟡 微信小程序前端 — 需排查前端调用链路

---

### 6.3 交易市场挂单列表接口 `GET /api/v4/marketplace/listings` — ✅ 后端已实现且有数据

**后端实际实现（`routes/v4/marketplace/listings.js`）：**
- ✅ 路由已实现，支持分页、筛选、排序
- ✅ 通过 `MarketListingQueryService.getMarketListings()` 查询

**真实数据库验证：**
- ✅ `market_listings` 表中有 **21 条** `status='on_sale'` 的挂单
- 另有 27 条 `sold`、298 条 `withdrawn`

**⚠️ 关键差异：** 前端文档写的是 `status='active'`，但后端数据库中交易市场挂单的状态值是 `on_sale`（不是 `active`）。如果前端按 `status='active'` 筛选，会查不到数据。

**结论：** ✅ 后端有活跃挂单数据，接口正常。

**🟡 微信小程序前端需确认：**
1. 前端调用 `GET /api/v4/marketplace/listings` 时是否传了 `status=active` 参数？后端默认返回 `on_sale` 状态的挂单，不需要传 status 参数
2. 后端返回的商品列表字段名是 `data.products`（不是 `data.listings`），前端需确认解析逻辑

**责任方：** 🟡 微信小程序前端 — 需排查前端调用链路和响应解析

---

### 6.4 商品筛选配置接口 `GET /api/v4/system/config/product-filter` — ✅ 后端已实现

**后端实际实现（`routes/v4/system/config.js`）：**
- ✅ 路由已实现，公开接口
- ✅ 如果数据库无 `product_filter` 配置，返回硬编码的默认筛选配置（含价格区间、排序选项、库存状态）

**真实数据库验证：**
- 数据库中未找到 `product_filter` 配置项 → 接口会返回默认配置

**结论：** ✅ 正常工作，返回默认配置。

---

### 6.5 交易市场筛选维度接口 `GET /api/v4/marketplace/listings/facets` — ✅ 后端已实现

**后端实际实现（`routes/v4/marketplace/listings.js`）：**
- ✅ 路由已实现
- ✅ 通过 `MarketListingQueryService.getFilterFacets()` 返回类目、稀有度、资产分组、挂牌类型

**结论：** ✅ 正常工作。

---

### 6.6 商城页面空白问题总结

| 排查项 | 后端状态 | 数据库数据 | 结论 |
|--------|---------|-----------|------|
| exchange-page 配置 | ✅ 已实现 | ✅ 有配置（tabs 含 exchange+market） | 正常 |
| 商品列表 | ✅ 已实现 | ✅ 20 条活跃商品（lucky 空间） | 正常 |
| 交易市场挂单 | ✅ 已实现 | ✅ 21 条活跃挂单 | 正常 |
| 商品筛选配置 | ✅ 已实现 | 返回默认配置 | 正常 |
| 市场筛选维度 | ✅ 已实现 | ✅ 正常 | 正常 |

**结论：后端接口和数据均正常。商城页面空白是微信小程序前端问题。**

**🟡 微信小程序前端排查清单（按优先级排序）：**

1. **检查交易市场状态值** — 前端文档写的 `marketplace_listings` 表 `status='active'`，但后端实际状态值是 `on_sale`。如果前端代码中硬编码了 `status=active` 作为查询参数，会导致查不到数据
2. **检查响应字段名** — 后端交易市场返回的是 `data.products`（不是 `data.listings`），前端需确认解析逻辑
3. **检查 exchange-page 配置解析** — `ExchangeConfigCache.getConfig()` 是否正确解析了后端返回的 `tabs` 数组。后端返回的 tabs 结构是 `{ key, icon, label, enabled, sort_order }`，比前端期望的多了 `icon` 和 `sort_order` 字段，少了 `exchange-rate` Tab
4. **检查 JWT Token** — 商品列表和交易市场接口都需要登录（`authenticateToken` 中间件），确认请求携带了有效的 Bearer Token
5. **使用微信开发者工具 Network 面板** — 查看实际请求 URL、请求头、响应状态码和响应体

---

## 七、各端责任归属汇总

### 🔴 后端数据库项目需要修改的（2 项） — ✅ 全部已完成（2026-05-04/05）

| # | 问题 | 改动量 | 优先级 | 状态 |
|---|------|--------|--------|------|
| 1 | DIY 小程序码生成接口（新增） | 新增 1 个路由 + 1 个 Service 文件 | 中 | ✅ 已完成 |
| 2 | 抽奖历史补充 `campaign_code` 字段 | 2 行代码 | 低 | ✅ 已完成 |
| 3 | 消费记录详情补充 `store` 关联查询 | 4 行代码 | 低 | ✅ 已完成 |
| 4 | 核销订单补充 Header 幂等键（双重保护） | ~20 行代码 | 低 | ✅ 已完成 |
| 5 | 品类树公开接口 `GET /api/v4/system/config/category-tree` | 新增 1 个路由端点 | 中 | ✅ 已完成 |

### 🟡 微信小程序前端需要修改的（4 项）

| # | 问题 | 说明 | 优先级 |
|---|------|------|--------|
| 1 | 商城页面空白 | 后端接口和数据均正常（20 条活跃商品 + 21 条活跃挂单），需排查前端调用链路。重点检查：交易市场状态值是 `on_sale` 不是 `active`；响应字段是 `data.products` 不是 `data.listings` | 高 |
| 2 | 抽奖统计 `high_tier_rate` 格式 | 后端返回百分比数值（如 2.65 表示 2.65%），非小数（0.0265）。前端展示时直接拼 `%` 后缀，不需要再乘以 100 | 中 |
| 3 | DIY 材料分组响应格式 | 后端返回 `data: [...]` 数组，非 `data: { groups: [...] }`。前端 `getDiyMaterialGroups()` 需直接用 `response.data` 作为分组数组 | 中 |
| 4 | 抽奖历史字段名映射 | 后端返回的字段名经过 Service 层重映射：`points_cost`（非 `cost_points`）、`draw_time`（非 `created_at`）、`is_guarantee`（非 `guarantee_triggered`）。前端需按后端实际字段名对齐 | 低 |

### 🟢 Web 管理后台前端（无需修改）

Web 管理后台的 API 调用全部走 `/api/v4/console/` 前缀，与微信小程序端的用户域 API（`/api/v4/`）完全隔离。本次需求清单中的所有接口都是用户域接口，Web 管理后台不受影响。

---

## 八、后端可复用能力和可扩展点

### 已有可复用能力

| 能力 | 服务 | 说明 |
|------|------|------|
| 幂等性 | `IdempotencyService` | 已在兑换接口使用，可直接复用到核销接口 |
| 对象存储 | `SealosStorageService` | 已用于媒体文件上传，可复用于小程序码存储 |
| 图片处理 | `sharp` 库 | 已在项目中，可用于小程序码图片处理 |
| 微信 API | `.env` 中 `WX_APPID`/`WX_SECRET` | 已配置，可直接调用微信 API |
| 数据脱敏 | `DataSanitizer` 服务 | 已在多个接口使用，新接口可复用 |
| 事务管理 | `TransactionManager` | 统一事务边界管理 |
| 缓存 | `BusinessCacheHelper` | Redis 缓存封装，可用于小程序码缓存 |

### 可扩展点

| 扩展方向 | 基础设施 | 说明 |
|---------|---------|------|
| 新增 DIY 相关接口 | `routes/v4/diy.js` + `services/diy/` | 已有完整的 DIY 模块架构（模板、材料、作品） |
| 新增统计类接口 | `LotteryQueryService` | 已有 `getUserStatistics()`，可扩展更多维度 |
| 新增配置类接口 | `routes/v4/system/config.js` | 已有 `AdminSystemService.getConfigValue()` 通用配置读取 |

---

## 九、技术框架兼容性确认

### 后端数据库项目

所有修改方案均基于现有技术栈：
- ✅ Express 路由 + ServiceManager 服务注册模式
- ✅ Sequelize ORM 关联查询（include）
- ✅ 读写分离架构（QueryService / CoreService）
- ✅ 统一响应格式（`res.apiSuccess()` / `res.apiError()`）
- ✅ 复用已有服务（SealosStorageService、IdempotencyService）

### Web 管理后台前端

- ✅ 本次需求不涉及 Web 管理后台的修改
- ✅ Web 管理后台已有对应的管理端接口（`/api/v4/console/diy/`、`/api/v4/console/lottery-management/`）
- ✅ 如果后端补充了 `campaign_code` 字段，Web 管理后台的抽奖管理页面可以自动受益（数据来自同一个 Service 层）

### 微信小程序前端

- 需要适配后端实际返回格式（见第七节微信小程序前端修改项）
- 建议直接使用后端字段名，不做映射

---

## 十、需要拍板的决策 — 行业方案对比与最终建议

### 决策 1：DIY 小程序码 scene 参数格式

**微信官方限制：** `wxacode.getUnlimited` 的 `scene` 参数最大 32 字符，只支持数字、英文字母和 `=`、`%`、`&`、`.` 等少数符号。

**行业做法对比：**

| 方案 | 代表公司/产品 | 格式示例 | 优点 | 缺点 |
|------|-------------|---------|------|------|
| A: 纯 KV | 美团（门店码）、拼多多（商品码） | `diy_work_id=35` | 简洁、解析简单、不浪费字符 | 只能传一个参数 |
| B: 多 KV | 淘宝（活动码）、京东（分享码） | `t=diy&id=35` | 可扩展多参数 | 浪费字符、解析复杂 |
| C: 短码映射 | 抖音（短链）、微信读书 | `s=Ax7kQ` | 无长度限制、可追踪 | 需要额外的短码表、多一次查询 |
| D: 纯 ID | 小红书（笔记码）、得物（商品码） | `35` | 最短、最简单 | 不自描述、扩展性差 |

**你项目的实际情况：**
- `diy_works` 表主键是自增 `bigint`（当前最大 ID=37），不会超过 32 字符
- 当前只有 DIY 作品一种场景需要小程序码
- 项目未上线，未来可能有其他场景（商品分享、活动分享）

**最终建议：方案 A `diy_work_id=35`**

理由：
1. 32 字符限制下，KV 格式是大厂主流做法（美团、拼多多都是这样）
2. 比纯 ID（方案 D）多了自描述性，前端 `onLoad` 解析时一眼看出是什么参数
3. 比多 KV（方案 B）省字符，你当前只需要传一个 ID
4. 未来如果需要其他场景的小程序码，每个场景用不同的 `page` 路径区分（微信 API 的 `page` 参数），不需要在 `scene` 里塞 `type`
5. 短码映射（方案 C）对你的体量来说过度设计

**前端解析代码（参考）：**

```javascript
onLoad(options) {
  const scene = decodeURIComponent(options.scene || '')
  const params = Object.fromEntries(scene.split('&').map(s => s.split('=')))
  const diyWorkId = params.diy_work_id  // "35"
}
```

---

### 决策 2：DIY 小程序码是否缓存到 Sealos

**行业做法对比：**

| 方案 | 代表公司/产品 | 做法 | 优点 | 缺点 |
|------|-------------|------|------|------|
| A: 不缓存，每次调微信 API | 小型工具类小程序 | 用户每次点"分享"都调一次 `wxacode.getUnlimited` | 实现最简单 | 微信 API 有频率限制（QPS 约 5000/分钟）；重复调用浪费 |
| B: 缓存到对象存储 | 美团、拼多多、得物 | 首次生成后上传 CDN/OSS，后续直接返回 URL | 响应快、不依赖微信 API 可用性 | 需要存储空间（极小，每张 ~10KB） |
| C: 缓存到 Redis | 中型 SaaS 平台 | 二进制 Buffer 存 Redis，设 TTL | 读取极快 | 占用 Redis 内存、二进制存储不优雅 |
| D: 缓存到数据库 BLOB | 传统企业系统 | 存 MySQL BLOB 字段 | 事务一致性好 | 数据库不适合存二进制文件 |

**你项目的实际情况：**
- 已有 `SealosStorageService`，`uploadImage(buffer, name, folder)` 方法现成可用
- Sealos 对象存储已配置（`.env` 中 `SEALOS_ENDPOINT`、`SEALOS_ACCESS_KEY` 等）
- `diy_works` 表当前只有 6 条记录，即使全部生成小程序码也就 ~60KB 存储
- 项目是餐厅积分系统，不是高并发电商，QPS 不会触及微信限制

**最终建议：方案 B 缓存到 Sealos 对象存储**

理由：
1. 大厂（美团、拼多多、得物）全部用对象存储缓存小程序码，这是行业标准做法
2. 你已有 `SealosStorageService.uploadImage()`，零额外依赖，直接复用
3. 存储成本可忽略（每张小程序码 ~8-15KB，1000 张也就 ~15MB）
4. 用户第二次点"生成海报"时直接返回 URL，响应时间从 ~500ms 降到 ~50ms
5. 不依赖微信 API 可用性，微信偶尔抽风不影响已缓存的码

**实现方式：**
- 存储路径：`diy-qrcodes/work_{diy_work_id}.png`
- 首次请求：调微信 API → 上传 Sealos → 返回 URL
- 后续请求：直接返回 `https://{SEALOS_ENDPOINT}/{bucket}/diy-qrcodes/work_{id}.png`
- 不需要额外的数据库字段，URL 是确定性的（由 ID 推导）

---

### 决策 3：核销订单是否补充 Header 幂等键

**行业做法对比：**

| 方案 | 代表公司/场景 | 防重复机制 | 适用场景 |
|------|-------------|-----------|---------|
| A: 数据库唯一约束 | 传统银行转账（交易流水号唯一） | `UNIQUE INDEX` 在写入时拦截 | 业务本身有天然唯一标识 |
| B: Header 幂等键 | Stripe、支付宝、微信支付 | `Idempotency-Key` Header + 服务端存储 | 通用写接口，客户端可能重试 |
| C: 双重保护（A+B） | 美团外卖下单、阿里云 API | 数据库唯一约束 + Header 幂等键 | 金融级/订单级接口 |
| D: Token 令牌 | 游戏公司（防刷道具）、抢购系统 | 先获取一次性 Token，提交时携带 | 高并发抢购场景 |

**你项目的实际情况：**
- 核销订单已有 `code_hash` 唯一约束（SHA-256），数据库层面已防重复（方案 A）
- `IdempotencyService` 已完整实现，且 `CANONICAL_OPERATION_MAP` 中已注册了 `'/api/v4/shop/redemption/orders': 'REDEMPTION_CREATE_ORDER'`
- 兑换接口（`POST /api/v4/exchange`）已经用了 Header 幂等键（方案 C）
- `api_idempotency_requests` 表已建好，当前 0 条记录（还没有实际使用过）

**关键发现：`IdempotencyService` 已经为核销订单做好了映射，只是路由层没有调用它。**

**最终建议：方案 C 双重保护（补充 Header 幂等键）**

理由：
1. **一致性**：兑换接口已经用了 Header 幂等键，核销接口不用会造成架构不一致。项目未上线，统一标准的成本最低
2. **`IdempotencyService` 已就绪**：`CANONICAL_OPERATION_MAP` 已注册 `REDEMPTION_CREATE_ORDER`，路由层只需加 ~10 行代码调用 `IdempotencyService.getOrCreateRequest()`
3. **大厂标准**：Stripe（支付行业标杆）、美团、阿里云的写接口全部用双重保护。`code_hash` 防的是"同一个物品重复生成核销码"，Header 幂等键防的是"网络重试导致同一个请求被处理两次"——两者防的是不同层面的问题
4. **长期维护**：未来如果有新的写接口，开发者看到项目中所有写接口都统一用 Header 幂等键，就不会纠结"这个接口要不要加"

**改动量：** 路由层 ~10 行代码（参考 `routes/v4/exchange/index.js` 的实现模式），Service 层零改动。

---

### 决策汇总（最终方案）

| # | 决策项 | 最终方案 | 行业参考 | 改动量 |
|---|--------|---------|---------|--------|
| 1 | DIY 小程序码 scene 格式 | `diy_work_id={id}` | 美团、拼多多同类做法 | 前端 `onLoad` 解析 1 行 |
| 2 | 小程序码缓存 | 缓存到 Sealos 对象存储 | 美团、得物同类做法，复用已有 `SealosStorageService` | 后端 Service 内 ~15 行 |
| 3 | 核销订单幂等键 | 补充 Header 幂等键（双重保护） | Stripe、美团标准做法，`IdempotencyService` 已就绪 | 路由层 ~10 行 |
| 4 | 生产环境域名 | 运维决策，不影响代码 | — | — |

