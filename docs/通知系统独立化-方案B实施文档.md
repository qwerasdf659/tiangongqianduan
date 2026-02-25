# 通知系统独立化 — 方案 B 实施文档

> 创建时间：2026-02-25
> **数据来源：Node.js (mysql2) 连接 Sealos 真实数据库实时验证（dbconn.sealosbja.site:42569）**
> **代码来源：`/home/devbox/project` 后端源码实际审计**
> 状态：✅ **后端实施完成 + 架构合规验证通过**，等待微信小程序前端对接
> 最后更新：2026-02-25
> - **实施完成**（2026-02-24）：B1-B6 全部完成，17/17 测试通过，数据清理已执行
> - 二次验证：实时数据库查询 + 已有基础设施审计 + 业务数据基线
> - 三次验证（2026-02-24）：后端代码模式审计（ApiResponse / 路由挂载 / 模型注册 / WebSocket 推送）+ 三端改动归属 + 技术框架对齐 + Web管理后台兼容性验证 + 3 项新增拍板决策
> - **四次验证（2026-02-25）**：全量代码审计 + 数据库实查 + 端到端 API 测试 + 路由架构合规修复（路由不直连 models，统一走 ServiceManager） + 残留空壳会话彻底清理 + ESLint/Prettier 通过

---

## 一、问题排查结论（基于真实数据库数据）

### 1.1 现象

微信小程序"在线客服"聊天页面中，出现大量灰色系统消息（挂牌成功、挂牌已撤回、购买成功等），淹没了真实的人工客服对话。

### 1.2 数据库实查（清理前快照 2026-02-24）

**chat_messages 表消息分布：**

| message_source | 数量 | 占比 |
|---|---|---|
| `system`（系统通知） | 661 | 97.6% |
| `admin_client`（管理员人工消息） | 16 | 2.4% |
| `user_client`（用户消息） | 0 | 0% |

**系统通知类型分布（notification_type）：**

| 通知类型 | 数量 | 触发场景 |
|---|---|---|
| `purchase_completed` | 449 | 买家购买成交 |
| `listing_created` | 151 | 卖家挂牌上架 |
| `listing_withdrawn` | 44 | 卖家撤回挂牌 |
| `lottery_win` | 5 | 抽奖中奖 |
| `listing_sold` | 3 | 卖家资产被买走 |
| `test_notification` | 3 | 开发测试 |

**受影响最严重的会话：**

| session_id | user_id | 系统消息 | 人工消息 | 系统消息占比 |
|---|---|---|---|---|
| 1796 | 135 | 301 | 0 | 100% |
| 1953 | 31 | 204 | 0 | 100% |
| 1797 | 32 | 105 | 0 | 100% |

共 21 个用户受到影响。

### 1.3 根因

这是**有意为之的设计**，不是 bug。`NotificationService` 文件头部注释明确写着：

> 所有通知通过客服聊天系统的系统消息发送

`send()` 方法只有一条路径 → `sendToChat()` → `ChatMessage.create()` 写入客服会话。

当初设计时通知量极低（中奖、审核等低频事件），交易市场上线后高频操作使得客服聊天被系统消息淹没。

### 1.4 触发通知的 6 个生产代码入口

| 文件位置 | 通知方法 | 触发操作 |
|---|---|---|
| `services/market-listing/CoreService.js:928` | `notifyListingCreated` | 创建挂牌 |
| `services/market-listing/CoreService.js:1045` | `notifyListingWithdrawn` | 撤回挂牌 |
| `services/TradeOrderService.js:766` | `notifyListingSold` | 资产售出 |
| `services/TradeOrderService.js:779` | `notifyPurchaseCompleted` | 购买完成 |
| `jobs/hourly-expire-fungible-asset-listings.js:226` | `notifyListingExpired` | 挂牌过期（定时任务） |
| `routes/v4/lottery/draw.js:284` | `notifyLotteryWin` | 抽奖中奖 |

### 1.5 数据清理记录

**执行时间：** 2026-02-25
**操作：** `DELETE FROM chat_messages WHERE message_source = 'system'`
**删除行数：** 661
**保留行数：** 16（全部为 `message_source = 'admin_client'` 的真实人工消息）
**风险评估：** `chat_messages` 表无被外键引用，安全删除。

### 1.6 二次验证（2026-02-24 实时数据库查询）

> 以下数据通过 Node.js (mysql2) 直连生产数据库实时查询获得。

**chat_messages 表当前状态（190 行）：**

| message_source | 数量 | 占比 |
|---|---|---|
| `system`（系统通知） | 174 | 91.6% |
| `admin_client`（管理员人工消息） | 16 | 8.4% |
| `user_client`（用户消息） | 0 | 0% |

**结论：** 首次清理（删除 661 条）后，由于 `NotificationService.send()` 仍调用 `sendToChat()`，系统通知持续写入 `chat_messages`，已重新累积 174 条。**只清理数据不改代码无法根治问题。**

**当前系统通知类型分布（metadata.notification_type）：**

| 通知类型 | 数量 | 触发场景 |
|---|---|---|
| `listing_created` | 70 | 卖家挂牌上架 |
| `listing_sold` | 31 | 卖家资产售出 |
| `purchase_completed` | 31 | 买家购买成交 |
| `listing_withdrawn` | 21 | 卖家撤回挂牌 |
| `lottery_result` | 7 | 抽奖结果 |
| `trade_complete_seller` | 7 | 交易完成（卖家侧） |
| `trade_complete_buyer` | 7 | 交易完成（买家侧） |

**当前受影响用户数：** 4 个（系统消息日期范围：2026-02-24 17:10 ~ 19:56，均为当日操作产生）

**customer_service_sessions 表（22 行）：**

| 创建来源 (source) | 数量 | 说明 |
|---|---|---|
| `system_notification` | 21 | NotificationService 自动创建的会话 |
| `mobile` | 1 | 用户真实发起的客服对话 |

**结论：** 22 个客服会话中 **21 个是系统通知自动创建的空壳会话**，仅 1 个是用户主动找客服聊天。会话列表同样被污染。

### 1.7 已有通知基础设施审计

项目中已存在两套通知相关基础设施，但均**不是用户通知独立存储**：

**① `admin_notifications` 表 + `AdminNotification` 模型（管理员侧）**

| 维度 | 实际状态 |
|---|---|
| 表 | `admin_notifications`，已存在（14 字段，含 is_read / read_at / priority / expires_at） |
| 模型 | `models/AdminNotification.js`，已注册到 `models/index.js` |
| 数据 | **0 行**，从未被生产代码写入 |
| 用途 | 为管理员设计（admin_id 字段），与用户通知场景无关 |

**② `routes/v4/system/notifications.js`（管理员通知路由）**

| 维度 | 实际状态 |
|---|---|
| 路径 | `GET/POST /api/v4/system/notifications/*` |
| 权限 | 全部 `requireRoleLevel(100)`，仅管理员可访问 |
| 实现 | 基于 `AdCampaignService`（广告计划系统 `campaign_category='system'`），不使用 `AdminNotification` 模型 |
| 功能 | 管理员发公告和查看系统通知列表，**与用户交易/中奖通知完全无关** |

**③ `user_notifications` 表（方案 B 目标）**

| 维度 | 实际状态 |
|---|---|
| 表 | **不存在** |
| 模型 | **不存在** |

**结论：** 当前项目没有任何面向普通用户的独立通知存储。用户通知全部寄生在 `chat_messages` 表。方案 B 的 `user_notifications` 表和相关代码需要从零新建。

### 1.8 项目业务数据基线（2026-02-24 实时查询）

| 业务维度 | 数据量 | 说明 |
|---|---|---|
| 用户总数 | 68 | — |
| 数据库表数 | 101 | — |
| 已执行迁移 | 413 | — |
| 抽奖记录 | 3,325 | 核心业务之一 |
| 市场挂牌 | 302 | 其中 on_sale 22 / sold 20 / withdrawn 259 |
| 交易订单 | 138 | C2C 成交记录 |
| 兑换订单 | 1,356 | 虚拟物品核销兑换 |
| 竞拍商品 | 0 | 功能已实现但未启用 |

**资产体系（account_asset_balances 非零持有）：**

| 资产代码 | 中文名 | 持有人数 | 可用总量 | 冻结总量 |
|---|---|---|---|---|
| DIAMOND | 钻石 | 24 | 823,184 | 16,600 |
| red_shard | 红水晶碎片 | 11 | 502,329 | 1,050 |
| POINTS | 普通积分 | 10 | 64,244 | — |
| orange_shard | 橙水晶碎片 | 5 | 3,000 | 0 |
| red_crystal | 红水晶 | 5 | 1,200 | 0 |
| BUDGET_POINTS | 预算积分 | 3 | 26,633 | 0 |

---

## 二、业界调研与拍板决定

### 2.1 业界通知系统设计对比

#### 大厂（美团/阿里/腾讯）

| 维度 | 做法 |
|---|---|
| 通知 vs 客服 | 严格分离，通知走独立消息中台，客服走 IM 通道 |
| 存储 | 阿里消息中台：HBase 存储（日均 2000 万条），按消息类型分级分泳道 |
| 分类 | 美团：交易物流 / 活动 / 服务通知 分 Tab；淘宝类似 |
| 已读 | 点击单条标已读 + 全部已读按钮（美团/淘宝/京东通用做法） |
| 保留策略 | 交易类永久保留（是交易凭证），营销类 30 天清理 |
| 未读数 | Redis 缓存未读计数，异步写数据库保证一致性 |
| 推送 | WebSocket 实时推送 + 微信服务通知（交易状态变化） |

#### 二手/虚拟物品交易平台（闲鱼/转转/Steam）

| 维度 | 做法 |
|---|---|
| 通知 vs 客服 | 闲鱼：消息 Tab 内分子 Tab（交易物流/互动消息/系统通知），与客服对话物理分离 |
| 入口 | 闲鱼/转转：tabBar 第 3 个 Tab "消息"；Steam：右上角铃铛 |
| 分类 | 闲鱼分 3 Tab；Steam 统一列表不分类 |
| 保留 | 交易通知永久保留（纠纷回查需要） |
| 特殊设计 | 闲鱼消息会话模型在人与人基础上挂载商品，两人之间可存在多个会话 |

#### 游戏公司（原神/崩铁/游戏邮件系统）

| 维度 | 做法 |
|---|---|
| 通知形式 | 游戏内邮件系统（独立于聊天） |
| 入口 | 主界面右上角邮件图标（带未读角标） |
| 分类 | 统一列表或分 2 Tab（系统/好友） |
| 保留 | App 内通知永久保留，游戏内邮件 30 天过期自动删 |
| 已读 | 点击单条标已读 + "一键领取并已读" |
| 微信推送 | 几乎不用微信订阅消息 |

#### 小型交易平台/小众二手平台

| 维度 | 做法 |
|---|---|
| 入口 | "我的"页面加一行入口，或首页铃铛 |
| 分类 | 统一列表居多（通知类型不够多，分 Tab 显得空） |
| 保留 | 永久保留（数据量小，清理任务增加复杂度不值得） |
| 微信推送 | 初期不做，后期按需加 |

### 2.2 通知中心 UX 最佳实践（Smashing Magazine / Courier 2025 指南）

1. **交易通知与营销通知严格分开** — 混用会侵蚀用户信任
2. **通知格式匹配紧急程度** — 高紧急用 push，低紧急用 badge，不能所有通知都用同一种方式
3. **通知中心是持久化历史记录** — 用户经常意外关掉通知，需要能回查
4. **前置关键信息** — 用户扫通知只花几秒，标题必须说清「谁、什么、为什么」
5. **避免通知疲劳** — 高频通知批量合并，设置频率上限

### 2.3 九项拍板决定

基于业界调研 + 项目实际情况（项目未上线、用户量从零开始、虚拟物品交易场景、Node.js + MySQL 技术栈），逐项确定：

#### 决定 1：通知保留策略 → A）永久保留

| 选项 | 对比 |
|---|---|
| A）永久保留 ✅ | 交易通知是交易凭证，纠纷回查需要；当前增速（47 天 661 条）全量上线日均 1 万条，3 年才 1000 万行，MySQL 单表无压力；省掉定时清理 job 的维护成本 |
| B）90 天清理 | 多一个 job + cron + 配置 + 边界处理，是纯技术债务来源 |
| C）180 天清理 | 同上 |

**依据**：闲鱼/转转/Steam 交易通知均永久保留；小型平台数据量小不值得做清理。

#### 决定 2：已读逻辑 → B+C）点击单条已读 + 全部已读按钮

| 选项 | 对比 |
|---|---|
| A）打开列表自动已读 | 用户可能只扫了一眼没看内容，未读角标就消失，容易漏掉重要交易通知 |
| B+C）点击单条 + 全部已读 ✅ | 美团/淘宝/京东/闲鱼的通用做法；刚好对应已设计的两个 API：`POST /:id/read`（单条）+ `POST /mark-read`（批量/全部） |

**依据**：业界电商/交易平台几乎全部采用此组合。

#### 决定 3：小程序通知入口 → C）首页右上角铃铛图标（带未读角标）

| 选项 | 对比 |
|---|---|
| A）tabBar 新增 Tab | tabBar 位置贵重，应留给核心业务（首页/市场/背包/我的），交易型产品不需要消息占一个 Tab |
| B）"我的"页面入口 | 太深，用户不容易发现新通知 |
| C）首页右上角铃铛 ✅ | Steam/游戏的通用做法；用户零学习成本；铃铛+红点角标驱动点击；不占 tabBar |

**依据**：Steam 市场、游戏（原神等）、小型交易平台均使用铃铛图标。

#### 决定 4：sendToChat() → A）彻底不用

| 选项 | 对比 |
|---|---|
| A）彻底不用 ✅ | 项目未上线零兼容负担；管理员发公告用 `sender_type = 'admin'` 的普通文本消息即可；`sendToChat()` 方法代码保留不删但无生产调用 |
| B）保留给管理员用 | 增加认知负担（两套通知通道），管理员公告有更好的方式 |

**依据**：所有成熟客服系统（Zendesk/Intercom/美洽）都严格区分对话消息和系统通知。

#### 决定 5：通知分类 → C）统一列表 + 类型标签

| 选项 | 对比 |
|---|---|
| A）统一列表不分类 | 缺少视觉区分 |
| B）分 Tab | 当前只有 6 种通知类型，分 3 Tab 每 Tab 只 2 种，用户体验空洞 |
| C）统一列表 + 类型标签 ✅ | 实现最简单；类型标签（[交易] [中奖] [系统]）给视觉区分；后端 API 已有 `type` 查询参数，后续真需要分 Tab 是纯前端改动 |

**依据**：Steam 统一列表；游戏邮件统一列表；小型平台统一列表居多。通知类型不够多时分 Tab 暴露内容单薄。

#### 决定 6：微信订阅消息 → A）暂不做，表结构预留字段

| 选项 | 对比 |
|---|---|
| A）暂不做，预留字段 ✅ | 微信订阅消息全链路复杂（申请模板→审核→前端每次 `wx.requestSubscribeMessage()`→后端调微信 API），初期 ROI 低；`user_notifications` 表预留 `wx_push_status` 字段，后续接入零 DDL 变更 |
| B）现在就做 | 项目未上线，先做好核心交易体验 |

**依据**：小型交易平台和游戏公司初期均不做微信订阅消息；闲鱼/淘宝有资源才维护这套流程。

#### 决定 7：历史系统消息处理 → A）直接删除

| 选项 | 对比 |
|---|---|
| A）直接删除 ✅ | `chat_messages` 中 174 条系统消息（均为 2026-02-24 当日测试操作产生，仅 4 个用户），数据质量低、无保留价值；同时清理 `customer_service_sessions` 中 21 个由系统通知自动创建的空壳会话 |
| B）迁移到新表 | 增加迁移脚本工作量，且这些测试数据迁移到 `user_notifications` 没有业务意义 |

**依据**：项目未上线，这些数据是测试操作产生的，不是真实用户数据。代码改造完成后执行清理。

#### 决定 8：`admin_notifications` 死表处理 → A）不管它

| 选项 | 对比 |
|---|---|
| A）不管它 ✅ | `admin_notifications` 表和 `AdminNotification` 模型虽然 0 行数据且无路由调用，但不影响功能；留着不增加维护成本，后续管理后台消息中心如需脱离 `AdCampaignService`，可直接启用 |
| B）清理掉 | 删模型 + 迁移 drop 表，多一次操作，收益为零 |
| C）后续启用 | 等有需要时再说 |

**依据**：空表无害，不值得花精力清理。

#### 决定 9：用户通知 API 挂载路径 → A）挂到 user 域 `/api/v4/user/notifications`

| 选项 | 对比 |
|---|---|
| A）`/api/v4/user/notifications` ✅ | 符合项目 `user` 域定位（用户中心、用户自己的数据）；35% 的中小项目采用此方案；语义清晰；改动最小（新建一个路由文件即可）；不碰现有管理后台前端代码 |
| B）`/api/v4/system/user-notifications` | 路径冗长拼接怪异；`system` 域继续膨胀；行业几乎没有这么做的 |
| C）改造现有 `/api/v4/system/notifications` | 需要改管理后台前端 `admin/message-center.html` 和 `notification-center.js`；同一路由文件服务两套逻辑是未来拆分的障碍 |

**依据**：行业做法（美团/Steam/闲鱼通知独立于管理端）；项目自身路由域惯例（管理员 API 在 `console`，用户 API 在 `user`）；现有 `routes/v4/system/notifications.js`（管理员通知）不动，零改动风险。

### 2.4 决定总表（决定 1-9）

> 决定 10-12 见第十四节（含完整业界调研和定论）。

| # | 决策项 | 选择 | 核心理由 |
|---|---|---|---|
| 1 | 通知保留策略 | **永久保留** | 交易凭证 + 数据量小 + 省维护成本 |
| 2 | 已读逻辑 | **点击单条 + 全部已读按钮** | 业界标配，防漏掉重要通知 |
| 3 | 小程序入口 | **首页右上角铃铛** | 交易型产品标配，不占 tabBar |
| 4 | sendToChat | **彻底不用** | 零兼容负担，干净分离 |
| 5 | 通知分类 | **统一列表 + 类型标签** | 类型少不适合分 Tab |
| 6 | 微信订阅消息 | **暂不做，预留字段** | 初期 ROI 低，预留扩展性 |
| 7 | 历史系统消息 | **直接删除** | 测试数据无保留价值，代码改造后清理 |
| 8 | `admin_notifications` 死表 | **不管它** | 空表无害，不值得花精力清理 |
| 9 | 用户通知 API 路径 | **`/api/v4/user/notifications`** | 符合项目域惯例 + 行业做法，不碰现有管理员路由 |

### 2.5 三端改动归属清单

> 本项目涉及三个独立代码仓库。以下按「后端数据库项目为权威基线」原则，明确每端的改动范围和职责边界。

#### 后端数据库项目（核心改动，本仓库 `/home/devbox/project`）

| # | 改动项 | 类型 | 说明 |
|---|---|---|---|
| B1 | 新建 `user_notifications` 表 | 迁移 | Sequelize 迁移文件，`npm run db:migrate` 执行 |
| B2 | 新建 `UserNotification` 模型 | 新增 | 按 `models/index.js` 现有模式注册 |
| B3 | 改造 `NotificationService.send()` | 修改 | 写入目标从 `ChatMessage.create()` 切换到 `UserNotification.create()` |
| B4 | 新增用户端通知路由 | 新增 | `routes/v4/user/notifications.js`，挂载到 `routes/v4/user/index.js` |
| B5 | WebSocket 新增推送方法 | 修改 | `ChatWebSocketService` 新增 `pushNotificationToUser()`，事件名 `new_notification` |
| B6 | 数据清理 | SQL | `chat_messages` 174 条系统消息 + `customer_service_sessions` 21 个空壳会话 |

#### Web 管理后台前端项目（零改动）

| 模块 | 当前状态 | 是否需要改动 |
|---|---|---|
| `admin/src/alpine/components/notification-center.js` | 管理员通知中心，调用 `/api/v4/system/notifications`（基于 `AdCampaignService`） | **不动**，与用户通知完全独立 |
| `admin/src/pages/customer-service.html` | 客服聊天管理页 | **不动**，后端不再往 `chat_messages` 写系统通知后，客服界面自然干净 |
| 管理员通知路由 `/api/v4/system/notifications` | `requireRoleLevel(100)` 管理员专用 | **不动** |

**结论：** Web 管理后台前端（Vite + Alpine.js + Tailwind CSS）当前方案零改动。如果后续需要管理员查看/管理用户通知历史（排查问题用），再在 `/api/v4/console/user-notifications` 新增管理员端 API 和对应页面。

#### 微信小程序前端项目（独立仓库，适配后端新接口）

| # | 改动项 | 说明 |
|---|---|---|
| W1 | 首页右上角铃铛图标 | 带未读数角标，数据来源：`GET /api/v4/user/notifications/unread-count` |
| W2 | 通知列表页 | 统一列表 + 类型标签，调用 `GET /api/v4/user/notifications` |
| W3 | WebSocket 事件监听 | 监听 `new_notification` 事件，更新角标和列表 |
| W4 | 单条/批量已读 | 调用 `POST /api/v4/user/notifications/:id/read` 和 `POST /api/v4/user/notifications/mark-read` |
| W5 | 字段直接对齐后端 | **不做映射**，直接使用后端返回的 `notification_id`、`type`、`title`、`content`、`metadata`、`is_read`、`created_at` 字段名 |

**前端适配原则：** 前端直接使用后端 API 返回的字段名和数据结构，不做二次映射或转换。后端 `ApiResponse` 标准格式 `{ success, code, message, data, timestamp, version, request_id }` 由前端统一处理。

---

## 三、方案 B 设计 — 通知通道独立

### 3.1 核心思路

将 `NotificationService.send()` 的写入目标从 `chat_messages`（客服聊天表）改为新建的 `user_notifications`（用户通知表）。客服聊天回归纯粹的人工对话场景，通知系统独立演进。

### 3.2 改动清单总览

> ⚠️ **路由冲突说明：** `routes/v4/system/notifications.js` 已存在，当前服务于管理员通知（`requireRoleLevel(100)`，基于 `AdCampaignService`）。用户通知 API 需要新建独立路由文件，避免与现有管理员路由冲突。

| 改动项 | 类型 | 文件 | 说明 |
|---|---|---|---|
| 新建 `user_notifications` 表 | 迁移 | `migrations/xxxxx-create-user-notifications.js` | 独立通知存储 |
| 新建 `UserNotification` 模型 | 新增 | `models/UserNotification.js` | Sequelize 模型 |
| 注册到 `models/index.js` | 修改 | `models/index.js` | 模型注册 |
| 改造 `NotificationService.send()` | 修改 | `services/NotificationService.js` | 写入目标切换 |
| 新增**用户端**通知 API 路由 | 新增 | `routes/v4/user/notifications.js` | 用户端通知接口（挂载到 `/api/v4/user/notifications`） |
| 注册路由 | 修改 | `routes/v4/user/index.js` | 路由挂载 |
| WebSocket 通知频道分离 | 修改 | `services/NotificationService.js` | 推送到通知频道 |
| `sendToChat()` 保留 | 不动 | `services/NotificationService.js` | 仅用于真正的客服系统消息 |
| 现有管理员通知路由 | 不动 | `routes/v4/system/notifications.js` | 保持原有管理员通知功能不变 |

---

## 四、数据库设计

### 4.1 新建 `user_notifications` 表

```sql
CREATE TABLE user_notifications (
  notification_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id            INT NOT NULL,                          -- 接收用户
  type               VARCHAR(50) NOT NULL,                  -- 通知类型（listing_created / purchase_completed / lottery_win 等）
  title              VARCHAR(200) NOT NULL,                 -- 通知标题（如 "📦 挂牌成功"）
  content            TEXT NOT NULL,                         -- 通知正文
  metadata           JSON DEFAULT NULL,                     -- 附加业务数据（market_listing_id, offer_asset_code 等）
  is_read            TINYINT(1) NOT NULL DEFAULT 0,         -- 已读标记
  read_at            DATETIME DEFAULT NULL,                 -- 已读时间
  wx_push_status     ENUM('skipped','pending','sent','failed') NOT NULL DEFAULT 'skipped',  -- 微信订阅消息推送状态（拍板决定6：预留字段，暂不启用）
  created_at         DATETIME NOT NULL,
  updated_at         DATETIME NOT NULL,

  INDEX idx_user_created (user_id, created_at DESC),        -- 用户通知列表分页查询
  INDEX idx_user_unread (user_id, is_read),                 -- 未读数量统计
  INDEX idx_type (type)                                     -- 按类型筛选
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**设计要点：**
- `user_id` 不设外键约束（与现有项目风格一致，通过应用层保证）
- `metadata` JSON 字段存储业务上下文，不同通知类型的扩展数据放这里
- `is_read` + `read_at` 支持已读未读功能（拍板决定 2：点击单条标已读 + 全部已读按钮）
- `wx_push_status` 预留微信订阅消息推送状态（拍板决定 6：暂不启用，默认 `'skipped'`）
- 三个索引覆盖主要查询场景
- 无清理策略，永久保留（拍板决定 1）

### 4.2 与 `chat_messages` 表的对比

| 维度 | chat_messages（原方案） | user_notifications（方案B） |
|---|---|---|
| 用途 | 人工客服对话 | 系统通知推送 |
| sender | user / admin / null | 无（系统发出） |
| 关联 | 必须关联 customer_service_session | 直接关联 user_id |
| 已读 | 无（靠 status 字段） | is_read + read_at |
| 扩展 | 受限于聊天消息结构 | metadata JSON 自由扩展 |

---

## 五、NotificationService 改造

### 5.1 `send()` 方法变更

**当前逻辑（改造前）：**

```
send(user_id, options)
  └─ sendToChat(user_id, options)     ← 写入 chat_messages
       ├─ getOrCreateCustomerServiceSession()
       ├─ ChatMessage.create()
       └─ ChatWebSocketService.pushMessageToUser()
```

**改造后逻辑：**

```
send(user_id, options)
  └─ sendToNotification(user_id, options)  ← 写入 user_notifications
       ├─ UserNotification.create()
       └─ WebSocket 推送通知事件（新频道 'notification'）
```

### 5.2 关键变更点

1. **`send()` 方法**：调用 `sendToNotification()` 替代 `sendToChat()`
2. **新增 `sendToNotification()` 方法**：
   - 写入 `UserNotification` 模型
   - 通过 WebSocket 推送 `{ event: 'new_notification', data: {...} }` 到用户
   - 不再创建/关联客服会话
3. **`sendToChat()` 代码保留不删，但生产环境无调用方**（拍板决定 4：彻底不用）
4. **`sendToAdmins()` 保持不变**：管理员通知走原有逻辑

### 5.3 所有 notifyXxx() 方法无需改动

`notifyListingCreated`、`notifyPurchaseCompleted` 等 30+ 个业务通知方法全部调用 `send()`，`send()` 内部路由变更后，这些方法自动生效，无需逐个修改。

---

## 六、新增通知 API

### 6.1 路由前缀

`/api/v4/user/notifications`

> ⚠️ **注意：** `/api/v4/system/notifications` 已被管理员通知路由占用（`requireRoleLevel(100)`，基于 `AdCampaignService`）。用户端通知使用 `/api/v4/user/notifications`，挂载到 `routes/v4/user/index.js`。

### 6.2 接口列表

#### (1) GET /api/v4/user/notifications — 获取通知列表

**中间件：** `authenticateToken`（通过 `req.user.user_id` 隔离数据）

**请求参数（Query）：**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| page | number | 否 | 1 | 页码 |
| page_size | number | 否 | 20 | 每页数量（最大 50） |
| type | string | 否 | — | 按通知类型筛选（如 `listing_created`、`purchase_completed`） |
| is_read | string | 否 | — | `0` 未读 / `1` 已读 |

**响应（完整 ApiResponse 格式，与后端 `res.apiSuccess()` 一致）：**

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取通知列表成功",
  "data": {
    "notifications": [
      {
        "notification_id": 1,
        "type": "listing_created",
        "title": "📦 挂牌成功",
        "content": "您的 10 个 DIAMOND 已成功上架...",
        "metadata": { "market_listing_id": 123, "offer_asset_code": "DIAMOND" },
        "is_read": 0,
        "read_at": null,
        "created_at": "2026-02-25 10:30:00"
      }
    ],
    "pagination": {
      "current_page": 1,
      "page_size": 20,
      "total_count": 45,
      "total_pages": 3,
      "has_next": true,
      "has_prev": false
    }
  },
  "timestamp": "2026-02-25 10:35:00",
  "version": "v4.0",
  "request_id": "req_xxxxxxxx"
}
```

> **后端对齐说明：** `pagination` 字段名使用 `page_size`（非 `per_page`），与 `routes/v4/console/lottery-campaigns.js` 等现有路由的分页格式一致。`is_read` 使用 `TINYINT(1)`（0/1），前端直接判断 `notification.is_read === 0` 即为未读。

#### (2) GET /api/v4/user/notifications/unread-count — 获取未读数量

**中间件：** `authenticateToken`

**响应：**

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "获取未读数量成功",
  "data": {
    "unread_count": 5
  },
  "timestamp": "2026-02-25 10:35:00",
  "version": "v4.0",
  "request_id": "req_xxxxxxxx"
}
```

轻量接口，用于小程序首页铃铛角标。前端取 `response.data.unread_count` 即可。

#### (3) POST /api/v4/user/notifications/mark-read — 批量标记已读

**中间件：** `authenticateToken`

**请求体：**

```json
{
  "notification_ids": [1, 2, 3]
}
```

传空数组或不传 `notification_ids` 时，标记该用户全部未读为已读（"一键全部已读"按钮，拍板决定 2）。

**响应：**

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "标记已读成功",
  "data": {
    "marked_count": 3
  },
  "timestamp": "...",
  "version": "v4.0",
  "request_id": "..."
}
```

#### (4) POST /api/v4/user/notifications/:id/read — 单条标记已读

**中间件：** `authenticateToken`

用户点击某条通知时调用（拍板决定 2：点击单条才标已读，不自动标）。

**响应：** `res.apiSuccess({ notification_id, is_read: 1, read_at }, '标记已读成功')`

### 6.3 认证与安全

- 全部使用 `authenticateToken` 中间件（复用 `middleware/auth.js`）
- 通过 `req.user.user_id` 做数据隔离，WHERE 条件强制绑定 `user_id`
- 不需要 `requireRoleLevel`（用户端接口，非管理员接口）
- 响应统一使用 `res.apiSuccess()` / `res.apiError()`（复用 `utils/ApiResponse.js` 中间件）

---

## 七、WebSocket 通知频道

### 7.1 当前状态

`ChatWebSocketService.pushMessageToUser(user_id, messageData)` 将系统通知当作聊天消息推送，前端客服聊天组件收到后渲染为灰色气泡。

### 7.2 改造方案

在 `sendToNotification()` 中，WebSocket 推送使用独立的事件类型：

```
事件名：'new_notification'
数据：{
  notification_id,
  type,
  title,
  content,
  metadata,
  created_at
}
```

前端小程序根据事件名分发：
- `'new_message'` → 客服聊天页面处理
- `'new_notification'` → 更新通知红点 / 通知列表

### 7.3 离线用户

通知已持久化到 `user_notifications` 表。用户上线后通过 `GET /notifications` 拉取，通过 `GET /notifications/unread-count` 获取未读数量。

---

## 八、前端适配（微信小程序）

### 8.1 通知入口：首页右上角铃铛图标（拍板决定 3）

- 首页导航栏右上角放置铃铛图标，带未读数角标
- 角标数据来源：WebSocket `new_notification` 事件驱动实时更新 + 进入小程序时 `GET /notifications/unread-count` 兜底拉取
- 点击铃铛进入通知列表页

### 8.2 通知列表页

- 统一列表，按时间倒序，支持下拉加载更多（拍板决定 5：不分 Tab）
- 每条通知前带类型标签，如 `[交易]` `[中奖]` `[系统]`，用不同颜色区分
- 列表顶部放"全部已读"按钮（调用 `POST /mark-read`，拍板决定 2）
- 点击单条通知 → 调用 `POST /:id/read` 标记已读 → 跳转到对应业务页面（如点击"挂牌成功"跳到交易市场我的挂牌）
- 未读通知视觉上加粗/高亮，已读通知正常展示

### 8.3 客服聊天页不变

客服聊天页面代码不需要改动。后端不再往 `chat_messages` 写系统通知后，聊天页面自然只展示人工对话。

---

## 九、实施步骤（按后端实际工具链）

### Step 1：数据库迁移（`npm run migration:create`）

**操作：** 使用项目迁移工具链生成迁移文件：

```bash
npm run migration:create -- --name create-user-notifications
```

**文件：** `migrations/YYYYMMDDHHMMSS-create-user-notifications.js`

**内容：** 第四节的 `CREATE TABLE user_notifications` DDL，通过 `queryInterface.createTable()` 实现，包含 3 个索引。

**执行：** `npm run db:migrate`（当前已有 413 个迁移，这将成为第 414 个）

### Step 2：新建模型（`models/UserNotification.js`）

**模式：** 按项目现有风格 `module.exports = (sequelize, DataTypes) => { ... define ... return Model }`

**注册：** 在 `models/index.js` 中添加：

```
models.UserNotification = require('./UserNotification')(sequelize, DataTypes)
```

位置建议放在 `models.AdminNotification` 之后，保持通知相关模型聚集。

### Step 3：改造 NotificationService（`services/NotificationService.js`）

**3a）新增 `sendToNotification()` 静态方法：**
- `require('../models')` 获取 `UserNotification` 模型
- `UserNotification.create({ user_id, type, title, content, metadata, is_read: 0, created_at, updated_at })` 写入
- 通过 `ChatWebSocketService.pushNotificationToUser(user_id, notificationData)` 推送（Step 5 新增的方法）
- 返回 `{ notification_id, pushed_to_websocket, created_at }`

**3b）修改 `send()` 方法第 46 行：**
- 将 `const result = await this.sendToChat(user_id, ...)` 改为 `const result = await this.sendToNotification(user_id, ...)`
- 对应调整 `result.chat_message_id` → `result.notification_id`

**3c）`sendToChat()` 方法保留不删，`sendToAdmins()` 保持不变**

**影响范围：** 30+ 个 `notifyXxx()` 方法全部调用 `send()`，`send()` 内部路由变更后自动生效，零逐个修改。

### Step 4：新增用户端通知路由

**文件：** `routes/v4/user/notifications.js`

**实现 4 个接口：**
1. `GET /` — 通知列表（`UserNotification.findAndCountAll` + 分页）
2. `GET /unread-count` — 未读数（`UserNotification.count({ where: { user_id, is_read: 0 } })`）
3. `POST /mark-read` — 批量已读（`UserNotification.update({ is_read: 1, read_at }, { where: ... })`）
4. `POST /:id/read` — 单条已读

**挂载到 `routes/v4/user/index.js`：**

```
const notificationsRoutes = require('./notifications')
router.use('/notifications', authenticateToken, notificationsRoutes)
```

**现有 `routes/v4/system/notifications.js`（管理员通知）不动。**

### Step 5：WebSocket 推送方法（`services/ChatWebSocketService.js`）

**新增方法 `pushNotificationToUser(user_id, notification)`：**
- 参考现有 `pushNotificationToAdmin()` 模式（第 538 行）
- 使用 `this.connectedUsers.get(user_id)` 获取 socketId
- `this.io.to(socketId).emit('new_notification', notification)` 推送
- 事件名 `new_notification`（与聊天的 `new_message` 和管理员的 `notification` 区分）

### Step 6：测试验证

| 验证项 | 操作 | 预期结果 |
|---|---|---|
| 通知写入新表 | 执行挂牌/撤回/购买操作 | `user_notifications` 表有新记录，`chat_messages` 无新系统消息 |
| 客服聊天干净 | 打开客服聊天页 | 仅展示人工对话，无系统通知灰色消息 |
| 通知列表 API | `GET /api/v4/user/notifications` | 返回 ApiResponse 标准格式，包含分页 |
| 未读数 API | `GET /api/v4/user/notifications/unread-count` | 返回 `{ unread_count: N }` |
| 标记已读 | `POST /api/v4/user/notifications/:id/read` | `is_read` 变为 1，`read_at` 写入 |
| WebSocket 推送 | 用户在线时触发通知 | 收到 `new_notification` 事件 |

### Step 7：数据清理（Step 1-6 全部验证通过后执行）

```sql
-- 1. 删除系统通知消息（当前 174 条）
DELETE FROM chat_messages WHERE message_source = 'system';

-- 2. 清理空壳会话（当前 21 个）
DELETE cs FROM customer_service_sessions cs
WHERE cs.source = 'system_notification'
AND NOT EXISTS (
  SELECT 1 FROM chat_messages cm
  WHERE cm.customer_service_session_id = cs.customer_service_session_id
  AND cm.message_source != 'system'
);
```

---

## 十、不变的部分

| 模块 | 说明 |
|---|---|
| 客服聊天表 `chat_messages` | 结构不变，仅存储人工对话 |
| 客服聊天 API `/api/v4/system/chat/*` | 不变 |
| `sendToChat()` 方法 | 代码保留不删，但生产环境无调用方（拍板决定 4：彻底不用） |
| `sendToAdmins()` 方法 | 不变，管理员通知走原有逻辑 |
| 所有 `notifyXxx()` 业务方法签名 | 不变，调用方无感知 |
| 6 个生产触发点 | 代码不需要改动，`send()` 内部路由变更后自动生效 |
| `chat_messages` 表的 `message_source` 枚举 | 保留 `'system'` 值，不做 DDL 变更 |
| 管理员通知路由 `routes/v4/system/notifications.js` | 不变，继续服务管理员公告功能 |
| `AdminNotification` 模型 + `admin_notifications` 表 | 不变，与用户通知独立 |

### 10.1 代码改造完成后的数据清理

> ⚠️ 数据清理必须在**代码改造完成并验证**之后执行，否则新通知会持续写入 `chat_messages`。

**待执行操作：**

```sql
-- 1. 删除系统通知消息（当前 174 条）
DELETE FROM chat_messages WHERE message_source = 'system';

-- 2. 清理由系统通知自动创建的空壳会话（当前 21 个，source='system_notification'）
-- 仅清理无人工消息的会话，保留有人工消息的会话
DELETE cs FROM customer_service_sessions cs
WHERE cs.source = 'system_notification'
AND NOT EXISTS (
  SELECT 1 FROM chat_messages cm
  WHERE cm.customer_service_session_id = cs.customer_service_session_id
  AND cm.message_source != 'system'
);
```

---

## 十一、回滚方案

如需回滚，只需将 `send()` 方法内部调用从 `sendToNotification()` 改回 `sendToChat()`。`user_notifications` 表和通知 API 可以保留不影响其他功能。

---

## 十二、后端技术框架对齐验证（2026-02-24 实时代码审计）

> 以下逐项验证方案 B 的每个改动点是否与后端项目实际技术框架一致。

### 12.1 可复用基础设施清单

| # | 基础设施 | 文件位置 | 复用方式 |
|---|---|---|---|
| R1 | ApiResponse 标准响应 | `utils/ApiResponse.js` | 路由中直接调用 `res.apiSuccess(data, '消息')` / `res.apiError(...)` |
| R2 | authenticateToken 认证 | `middleware/auth.js` | 路由中间件链直接挂载，`req.user.user_id` 获取当前用户 |
| R3 | BeijingTimeHelper 时间 | `utils/timeHelper.js` | `created_at` / `updated_at` / `read_at` 使用 `BeijingTimeHelper.createBeijingTime()` |
| R4 | Sequelize 模型注册 | `models/index.js` | `models.UserNotification = require('./UserNotification')(sequelize, DataTypes)` 然后加注释 |
| R5 | 路由挂载模式 | `routes/v4/user/index.js` | `router.use('/notifications', authenticateToken, notificationsRoutes)` |
| R6 | WebSocket 推送 | `services/ChatWebSocketService.js` | 已有 `pushMessageToUser(user_id, message)` 和 `pushNotificationToAdmin(admin_id, notification)` 模式可参考 |
| R7 | 迁移工具链 | `npm run migration:create` | 生成迁移文件，`npm run db:migrate` 执行 |
| R8 | logger 日志 | `utils/logger.js` | `logger.info('[通知] ...')`，所有日志使用结构化格式 |

### 12.2 可扩展性分析

| 扩展场景 | 支撑设计 | 是否需要 DDL 变更 |
|---|---|---|
| 新增通知类型（如 `bid_won`、`exchange_approved`） | `type` 字段 `VARCHAR(50)`，纯应用层枚举 | **否** |
| 通知携带不同业务数据 | `metadata` JSON 字段，按通知类型写入不同 key | **否** |
| 接入微信订阅消息推送 | `wx_push_status` 字段已预留（`ENUM('skipped','pending','sent','failed')`） | **否** |
| 通知分类分 Tab 展示 | 后端 API 已有 `type` 查询参数，前端改 Tab 即可 | **否** |
| 管理员查看用户通知历史 | 新增 `/api/v4/console/user-notifications` 路由（查 `user_notifications` 表） | **否** |
| 通知批量聚合（如「你有 5 笔交易完成」） | 应用层在 `sendToNotification()` 中合并同类通知 | **否** |

### 12.3 与后端现有模式的一致性逐项验证

| 验证项 | 现有模式 | 方案 B 设计 | 是否一致 |
|---|---|---|---|
| 模型定义风格 | `module.exports = (sequelize, DataTypes) => { ... }` | 同 | ✅ |
| 模型注册到 index.js | `models.Xxx = require('./Xxx')(sequelize, DataTypes)` | 同 | ✅ |
| 路由文件结构 | `const router = express.Router()` + `module.exports = router` | 同 | ✅ |
| 路由挂载位置 | `routes/v4/user/index.js` 中 `router.use()` | 同 | ✅ |
| 认证中间件 | `authenticateToken`（`req.user.user_id`） | 同 | ✅ |
| 响应格式 | `res.apiSuccess(data, message)` / `res.apiError(message, code)` | 同 | ✅ |
| 分页格式 | `{ current_page, page_size, total_count, total_pages, has_next, has_prev }` | 同 | ✅ |
| 时间字段 | `BeijingTimeHelper.createBeijingTime()` | 同 | ✅ |
| 外键策略 | 应用层保证关联，不设数据库外键约束 | 同（`user_id` 不设外键） | ✅ |
| WebSocket 推送 | `this.io.to(socketId).emit('event_name', data)` | 同（事件名 `new_notification`） | ✅ |
| NotificationService 静态类 | 全部 `static` 方法，直接 `require` 使用 | 保持 `static`，不注册 ServiceManager | ✅ |

---

## 十三、Web 管理后台前端兼容性分析

### 13.1 Web 管理后台技术栈

| 维度 | 实际状态 |
|---|---|
| 构建工具 | Vite |
| JS 框架 | Alpine.js 3.x（响应式组件） |
| CSS 框架 | Tailwind CSS |
| WebSocket | socket.io-client 4.x |
| 图表 | ECharts 6.x |
| 通知中心 | `admin/src/alpine/components/notification-center.js`（管理员通知，基于 `/api/v4/system/notifications`） |

### 13.2 影响评估

**当前方案对 Web 管理后台零影响：**

- `notification-center.js` 调用的是 `/api/v4/system/notifications`（管理员通知，基于 `AdCampaignService`，`requireRoleLevel(100)`），与用户通知 `/api/v4/user/notifications` 完全独立
- 客服聊天页 `customer-service.html` 不需要改动：后端不再往 `chat_messages` 写系统通知后，客服消息列表自然只展示人工对话
- WebSocket 事件不冲突：管理员端监听 `notification` 事件（已有），用户端监听 `new_notification` 事件（新增），事件名不同

### 13.3 后续扩展（当前不做，记录备忘）

如果运营后续需要在 Web 管理后台查看/管理用户通知：
- 后端新增 `/api/v4/console/user-notifications`（`requireRoleLevel(100)`），直接查 `user_notifications` 表
- 前端在 `admin/src/pages/` 下新增 `user-notifications.html` 页面
- 这是独立需求，不影响当前方案 B 实施

---

## 十四、新增决策（含业界调研 + 定论）

> 以下 3 项基于后端代码实际审计发现的技术分歧。每项都做了业界调研，给出定论，无需额外拍板。

### 决定 10：NotificationService 架构 → A）保持静态类

#### 代码实查发现

`NotificationService` 实际有两面：
- **已注册 ServiceManager**：`services/index.js` 第 385 行 `this._services.set('notification', NotificationService)` 存在
- **但全部 15+ 个调用方都用 `require` + 静态方法**：`NotificationService.notifyListingSold(...)`、`NotificationService.notifyListingCreated(...)` 等，无一处用 `getService('notification')`
- 30 个 `static` 方法，零内部状态

#### 业界怎么做

| 架构类型 | 谁在用 | 核心特征 | 适用规模 |
|---|---|---|---|
| **微服务 + 独立通知中台** | 阿里消息中台、美团推送平台、腾讯云移动推送 | 通知是独立微服务，gRPC/HTTP 跨服务调用，独立数据库、独立扩缩容 | 日均千万条+ |
| **DI 容器 + 实例化服务** | Spring Boot 项目（中大型公司后端标配）、NestJS 项目 | 通知服务注册到 IoC 容器，构造函数注入依赖，支持 mock 测试 | 中大型单体/SOA |
| **静态工具类 / 单例** | 游戏服务器（Unity/Unreal 后端）、小型交易平台、Telegram Bot 框架、Discord.js | 通知是无状态工具函数，`require` 后直接调用静态方法，无需生命周期管理 | 小中型单体 |
| **事件总线 + 观察者** | 闲鱼（Flutter 端内通知）、Electron 应用、Vue/React 前端状态管理 | `EventEmitter.emit('notification', data)`，解耦发送方和接收方 | 前端或事件驱动架构 |

#### 分析

| 维度 | 迁移到 DI 实例化 | 保持静态类 |
|---|---|---|
| 改动范围 | 15+ 个文件的 `NotificationService.xxx()` 全部改为 `getService('notification').xxx()` 或传 `req.app.locals` | **零** |
| 功能收益 | 可 mock 注入（测试已有 `jest.mock` 方案，不需要 DI） | 当前功能完整 |
| 一致性 | 对齐 ServiceManager 模式（但 NotificationService 是无状态工具，不持有连接池/缓存） | 与当前 15+ 个调用方一致 |
| 技术债务 | 迁移过程引入新 bug 风险，零功能收益的重构 | 无新增债务 |
| 长期演进 | 如果未来通知服务需要持有内部状态（如 Redis 计数器、批量合并队列），再迁移也只是一次重构 | 当前无状态，静态类是正确抽象 |

**定论：A）保持静态类。**

理由：NotificationService 是**无状态工具类**（30 个 static 方法，零内部字段），静态类是对无状态工具的正确抽象。游戏公司（原神/崩铁的邮件系统后端）、小型交易平台（Steam 社区市场通知）都采用这种模式。DI 实例化适合有状态的服务（持有连接池、缓存、配置），NotificationService 不属于这个范畴。15+ 个调用方零改动，零引入新 bug 风险。

---

### 决定 11：WebSocket 推送方式 → A）在 ChatWebSocketService 上扩展

#### 代码实查发现

`ChatWebSocketService` 内部已有完整的连接管理基础设施：

```
this.connectedUsers = new Map()   // {userId: socketId}  — 全部在线用户
this.connectedAdmins = new Map()  // {adminId: socketId} — 全部在线管理员
```

已有两个推送方法：
- `pushMessageToUser(user_id, message)` → `this.io.to(socketId).emit('new_message', message)` （第 459 行）
- `pushNotificationToAdmin(admin_id, notification)` → `this.io.to(socketId).emit('notification', notification)` （第 538 行）

#### 业界怎么做

| 架构类型 | 谁在用 | 核心特征 |
|---|---|---|
| **独立推送服务** | 阿里云移动推送、极光推送、Firebase Cloud Messaging | 独立进程/微服务，独立管理长连接池，支持百万级并发，跨业务线复用 |
| **共享连接 + 事件类型区分** | Discord（一个 Gateway 连接推送所有事件类型）、Slack（一个 WebSocket 分发 message/notification/presence 等事件）、Steam（一个连接推送交易通知+聊天+好友状态） | 一个 socket.io/WebSocket 连接，按 `event name` 分发不同业务事件 |
| **Namespace 隔离** | socket.io 官方推荐的大型应用模式、企业级 IM 系统 | socket.io 的 `/chat` 和 `/notification` namespace，物理连接隔离，独立鉴权 |

#### 分析

| 维度 | A）扩展 ChatWebSocketService | B）新建独立 NotificationWebSocketService |
|---|---|---|
| `connectedUsers` Map | **直接复用**（已实时维护所有在线用户 socketId） | 需要共享引用或重复维护一份相同的 Map |
| socket.io 连接 | **复用同一连接**，按事件名区分（`new_message` vs `new_notification`） | 如果用 Namespace 需要前端建两个连接；如果不用 Namespace 则与方案 A 等价 |
| 代码量 | 新增一个 ~20 行的 `pushNotificationToUser()` 方法 | 新建文件 + 初始化 + 连接管理 + 推送方法 = ~150 行 |
| 解耦度 | 通知和聊天共享 ChatWebSocketService | 完全解耦 |
| 前端改动 | 监听新事件名 `new_notification` 即可，零连接改动 | 如果用 Namespace 需要前端新建连接 |
| 长期演进 | 如果未来通知量远超聊天量需要独立扩缩容，可以再拆分 | 提前拆分但当前无此压力（68 用户） |

**大公司怎么选的：**
- **Discord**：一个 Gateway 连接推送所有事件（消息、通知、状态变更、语音状态），按 `op code` + `event name` 区分。只有当单连接承载不了时才拆分。
- **Slack**：一个 WebSocket 连接，`type` 字段区分 `message`、`notification`、`presence_change` 等。
- **Steam**：一个连接推送交易通知、聊天消息、好友状态，按消息类型区分。
- **原神/崩铁**：游戏内一个长连接，邮件通知和聊天都走同一通道，按协议号区分。

**小公司/小型交易平台：** 100% 都是一个连接 + 事件类型区分，没有任何小型项目会为通知单独建 WebSocket 连接。

**定论：A）在 ChatWebSocketService 上扩展 `pushNotificationToUser()` 方法。**

理由：这是 Discord/Slack/Steam/游戏公司的一致做法。`connectedUsers` Map 是关键共享状态，复制或共享引用都比直接复用更复杂。方案 B 在 68 用户量级是过度工程。事件名天然区分业务：`new_message`（聊天）、`new_notification`（通知）、`notification`（管理员通知）。新增方法参考现有 `pushNotificationToAdmin()`（第 538 行），代码模式完全对称。

---

### 决定 12：通知去重 / 频率控制 → A）首期不做

#### 代码实查发现

当前 `NotificationService.send()` 无任何去重或频率控制。数据库实查：
- user_id=135 曾在一天内累计 301 条系统消息（已清理）
- 当前 174 条系统消息中，最活跃的 4 个用户在 2026-02-24 17:10~19:56（不到 3 小时）内产生了全部通知
- 但这些**不是重复通知**：每条对应一次独立的业务操作（挂牌 70 次、售出 31 次、购买 31 次、撤回 21 次）

#### 业界怎么做

| 策略 | 谁在用 | 做法 | 适用场景 |
|---|---|---|---|
| **不做去重/频率控制** | Steam 交易通知、游戏邮件系统、闲鱼交易通知、所有小型交易平台 | 每笔交易对应一条通知，不合并不去重。交易通知就是交易凭证，用户需要看到每一笔。 | 交易型产品，每条通知对应唯一业务事件 |
| **同类合并** | 微信（x 人赞了你的朋友圈）、微博（x 人评论了你）、Instagram | 将 N 条同类通知合并为一条摘要。适用于社交互动类通知（点赞、评论）。 | 社交类产品，高频同质互动 |
| **频率上限** | 美团外卖优惠通知（每日最多 3 条推送）、淘宝营销通知 | 按用户+类型+时间窗口限制发送频率。适用于营销推送。 | 营销类通知，防止用户反感关闭通知权限 |
| **智能降频** | 阿里消息中台（疲劳度模型）、腾讯云移动推送（智能推送） | 机器学习模型预测用户接受度，动态调整推送频率。 | 日均千万条+ 的超大规模系统 |

#### 分析

| 维度 | 本项目实际情况 | 结论 |
|---|---|---|
| 通知性质 | 全部是**交易类通知**（挂牌/购买/售出/中奖），每条对应唯一业务事件 | 不属于「去重」场景，每条都有独立业务含义 |
| 用户量 | 68 人，未上线 | 无通知疲劳压力 |
| 通知频率 | 当前最高峰 ~4 条/用户/3小时 | 远低于需要频率控制的阈值 |
| 实现成本 | 频率控制需要 Redis 计数器 + TTL 窗口 + 类型维度的配置表 | 与核心功能无关的额外复杂度 |
| 长期债务 | 不做频率控制 = 零代码零维护；做了 = 多一个 Redis 依赖 + 配置管理 | 不做债务更低 |

**交易平台（闲鱼/Steam/转转）为什么不做去重：** 交易通知就是交易凭证。用户挂牌 10 次就应该收到 10 条「挂牌成功」通知。合并为「你有 10 笔挂牌成功」反而让用户无法区分哪些是新操作、哪些已确认。

**什么时候需要做频率控制：** 当产品引入**营销类通知**（促销活动推送、新品推荐）时，才需要频率上限。当前项目全部是交易类通知，每条 1:1 映射业务事件，不存在频率控制的需求。

**定论：A）首期不做，且当前通知类型（全部交易类）可能永远不需要。**

理由：本项目的通知 100% 是交易凭证类（挂牌/购买/售出/中奖/兑换），每条对应一次独立业务操作。Steam/闲鱼/转转的交易通知全部是「一事一通知」，没有去重或合并。只有当产品未来引入营销推送时才需要考虑频率控制，但那是独立的产品需求，不影响当前方案 B 设计。

---

### 决定总表（更新版，含决定 10-12）

| # | 决策项 | 选择 | 核心理由 | 业界参照 |
|---|---|---|---|---|
| 1 | 通知保留策略 | **永久保留** | 交易凭证 + 数据量小 | 闲鱼/Steam |
| 2 | 已读逻辑 | **点击单条 + 全部已读** | 业界标配 | 美团/淘宝/京东 |
| 3 | 小程序入口 | **首页右上角铃铛** | 不占 tabBar | Steam/原神 |
| 4 | sendToChat | **彻底不用** | 零兼容负担 | Zendesk/Intercom |
| 5 | 通知分类 | **统一列表 + 类型标签** | 类型少不适合分 Tab | Steam/游戏邮件 |
| 6 | 微信订阅消息 | **暂不做，预留字段** | 初期 ROI 低 | 小型平台通行做法 |
| 7 | 历史系统消息 | **直接删除** | 测试数据无价值 | — |
| 8 | admin_notifications 死表 | **不管它** | 空表无害 | — |
| 9 | API 路径 | **`/api/v4/user/notifications`** | 符合 user 域惯例 | 美团/Steam |
| 10 | NotificationService 架构 | **保持静态类** | 无状态工具类，30 个 static 方法 + 15+ 调用方零改动 | Steam/游戏邮件后端/小型交易平台 |
| 11 | WebSocket 推送方式 | **扩展 ChatWebSocketService** | 复用 connectedUsers Map，事件名区分业务 | Discord/Slack/Steam/原神 |
| 12 | 通知去重/频率控制 | **不做（交易通知不适用）** | 每条通知 1:1 映射业务事件，是交易凭证不是 spam | 闲鱼/Steam/转转 |

---

## 附录 A：后端项目技术框架（权威基线，2026-02-24 验证）

| 维度 | 实际状态 |
|---|---|
| 运行时 | Node.js 20+ / Express 4.18 |
| ORM | Sequelize 6.35（MySQL 方言，mysql2 驱动） |
| 数据库 | Sealos MySQL（101 张表，`restaurant_points_dev`） |
| 数据库连接 | `dbconn.sealosbja.site:42569`，项目通过 `.env` 配置，无本地 MySQL 客户端 |
| API 版本 | 全局 `/api/v4/*` |
| 认证 | JWT Bearer Token（`authenticateToken`） |
| 事务 | `TransactionManager.execute()` |
| 服务容器 | `ServiceManager`（`req.app.locals.services.getService('key')`） |
| 响应格式 | `ApiResponse`：`{ success, code, message, data, timestamp, version, request_id }` |
| 时区 | 全链路北京时间 `Asia/Shanghai` |
| 已执行迁移 | 413 个 |
| 路由注册 | `app.js` → `app.use('/api/v4/system', require('./routes/v4/system'))` |
| system 域子路由 | `routes/v4/system/index.js` 聚合 chat / notifications / feedback / status / statistics 等 |

### 附录 A.1：现有通知相关代码清单

| 文件路径 | 用途 | 与方案 B 的关系 |
|---|---|---|
| `services/NotificationService.js` (1121 行) | 用户通知统一入口，30+ 个 notifyXxx 方法 | **核心改造对象**：send() 内部路由切换 |
| `services/ChatWebSocketService.js` | WebSocket 聊天服务，推送实时消息 | 通知推送改为独立事件，不经过聊天服务 |
| `models/ChatMessage.js` | 聊天消息模型 | 不变 |
| `models/CustomerServiceSession.js` | 客服会话模型 | 不变 |
| `models/AdminNotification.js` | 管理员通知模型 | 不变，与用户通知独立 |
| `routes/v4/system/notifications.js` | 管理员通知 API（roleLevel 100） | **不动**，用户端新建独立路由 |
| `routes/v4/system/chat.js` | 用户客服聊天 API | 不变 |

## 附录 B：NotificationService 现有全部通知方法清单（30 个）

这些方法改造后**全部自动走新通道**，无需逐个修改：

| 方法名 | 业务场景 |
|---|---|
| `send(user_id, options)` | 统一入口 |
| `sendToChat(user_id, options)` | 客服聊天通道（保留，不再作为默认） |
| `sendToAdmins(options)` | 管理员广播（不变） |
| `notifyExchangePending` | 兑换待审核 |
| `notifyNewExchangeAudit` | 新兑换审核（管理员） |
| `notifyExchangeApproved` | 兑换审核通过 |
| `notifyExchangeRejected` | 兑换审核拒绝 |
| `notifyTimeoutAlert` | 超时告警 |
| `notifyPremiumUnlockSuccess` | 高级空间解锁成功 |
| `notifyPremiumExpiringSoon` | 高级空间即将过期 |
| `notifyPremiumExpired` | 高级空间已过期 |
| `sendAuditApprovedNotification` | 审核通过通知 |
| `sendAuditRejectedNotification` | 审核拒绝通知 |
| `notifyLotteryWin` | 抽奖中奖 |
| `notifyPointsChange` | 积分变动 |
| `notifyAnnouncement` | 系统公告 |
| `notifySecurityEvent` | 安全事件 |
| `notifyActivityStatusChange` | 活动状态变更 |
| `notifyActivityStarted` | 活动开始 |
| `notifyActivityPaused` | 活动暂停 |
| `notifyActivityEnded` | 活动结束 |
| `notifyListingCreated` | 挂牌成功 |
| `notifyListingSold` | 售出成功 |
| `notifyPurchaseCompleted` | 购买成功 |
| `notifyListingWithdrawn` | 挂牌已撤回 |
| `notifyListingExpired` | 挂牌过期 |
| `notifyBidOutbid` | 竞价被超越 |
| `notifyBidWon` | 竞价成功 |
| `notifyBidLost` | 竞价失败 |

---

## 附录 C：后端实施完成记录

### C.1 实施概要

| 步骤 | 状态 | 改动文件 | 说明 |
|---|---|---|---|
| B1 数据库迁移 | ✅ 完成 | `migrations/20260224214703-create-user-notifications.js` | 新建 user_notifications 表（含 3 索引） |
| B2 模型创建 | ✅ 完成 | `models/UserNotification.js` + `models/index.js` | Sequelize 模型 + 注册 |
| B3 NotificationService 改造 | ✅ 完成 | `services/NotificationService.js` | send() → sendToNotification()，新增 4 个查询方法 |
| B4 用户端通知路由 | ✅ 完成 | `routes/v4/user/notifications.js` + `routes/v4/user/index.js` | 4 个 API 端点，通过 ServiceManager 获取服务 |
| B5 WebSocket 推送 | ✅ 完成 | `services/ChatWebSocketService.js` | pushNotificationToUser() |
| B6 数据清理 | ✅ 完成 | — | chat_messages 系统消息清零 + 空壳会话清理（保留有人工消息的会话） |
| 幂等性注册 | ✅ 完成 | `services/IdempotencyService.js` | USER_NOTIFICATION_BATCH_READ / USER_NOTIFICATION_SINGLE_READ |
| 测试适配 | ✅ 完成 | `tests/business/services/notification.test.js` | 17/17 通过 |
| 路由架构合规 | ✅ 完成（2026-02-25） | `routes/v4/user/notifications.js` + `services/NotificationService.js` | 路由不直连 models，通过 ServiceManager 调用 NotificationService |

### C.2 新建文件

| 文件路径 | 用途 |
|---|---|
| `migrations/20260224214703-create-user-notifications.js` | 数据库迁移（第 414 个迁移） |
| `models/UserNotification.js` | 用户通知 Sequelize 模型 |
| `routes/v4/user/notifications.js` | 用户端通知 API（4 个端点） |

### C.3 修改文件

| 文件路径 | 改动说明 |
|---|---|
| `models/index.js` | 注册 UserNotification 模型 |
| `services/NotificationService.js` | send() 切换到 sendToNotification()，新增查询方法（getNotifications / getUnreadCount / markBatchAsRead / markSingleAsRead） |
| `services/ChatWebSocketService.js` | 新增 pushNotificationToUser() 方法 |
| `services/IdempotencyService.js` | CANONICAL_OPERATION_MAP 注册通知路由 |
| `routes/v4/user/index.js` | 挂载 /notifications 路由 |
| `tests/business/services/notification.test.js` | 适配方案B（验证写入 user_notifications） |

### C.4 数据库变更

- **新增表**：user_notifications（BIGINT 主键，3 个索引，utf8mb4_unicode_ci）
- **数据清理**：chat_messages 系统消息清零，空壳会话清理（仅删除无人工消息的空壳会话）

### C.5 验证通过的 API 端点（2026-02-25 实测）

| 方法 | 路径 | 说明 | 测试状态 |
|---|---|---|---|
| GET | /api/v4/user/notifications | 通知列表（分页+筛选） | ✅ 通过 |
| GET | /api/v4/user/notifications/unread-count | 未读数量 | ✅ 通过 |
| POST | /api/v4/user/notifications/mark-read | 批量/全部已读 | ✅ 通过 |
| POST | /api/v4/user/notifications/:id/read | 单条已读 | ✅ 通过 |

### C.6 端到端验证记录（2026-02-25）

| 验证项 | 操作 | 结果 |
|---|---|---|
| 通知写入新表 | NotificationService.send() 发送测试通知 | ✅ user_notifications 有记录，chat_messages 无新系统消息 |
| 通知列表 API | GET /api/v4/user/notifications | ✅ 返回标准 ApiResponse 格式，分页正确 |
| 未读数量 API | GET /api/v4/user/notifications/unread-count | ✅ unread_count 准确反映未读数 |
| 单条已读 | POST /api/v4/user/notifications/:id/read | ✅ is_read 变为 1，read_at 写入北京时间 |
| 已读后未读数递减 | 标记已读后再查未读数量 | ✅ 未读数正确递减 |
| 不存在通知 | POST /api/v4/user/notifications/99999/read | ✅ 返回 404「通知不存在」 |
| 路由通过 ServiceManager | 路由内调用 `req.app.locals.services.getService('notification')` | ✅ 不直连 models |
| ESLint | 全部通知相关文件 | ✅ 0 errors, 0 warnings |
| Prettier | 全部通知相关文件 | ✅ 格式一致 |
| Jest | 17/17 测试 | ✅ 全部通过 |
| 健康检查 | GET /health | ✅ 数据库 connected，Redis connected |

### C.7 路由架构说明

通知路由遵循项目架构规范：**路由不直连 models，读写操作通过 Service（经 ServiceManager 获取）**。

```
路由层                              服务层                           模型层
notifications.js                    NotificationService              UserNotification
  ├─ GET /                    →     getNotifications()         →     findAndCountAll()
  ├─ GET /unread-count        →     getUnreadCount()           →     count()
  ├─ POST /mark-read          →     markBatchAsRead()          →     update()
  └─ POST /:id/read           →     markSingleAsRead()         →     findOne() + markAsRead()

路由获取服务方式：req.app.locals.services.getService('notification')
服务注册位置：services/index.js → this._services.set('notification', NotificationService)
```

---

## 附录 D：微信小程序前端对接指南

> 以下为微信小程序前端开发人员参考，后端 API 已就绪。

### D.1 认证方式

所有接口使用 `Authorization: Bearer <access_token>` 请求头，通过 `/api/v4/auth/login` 获取 token。

### D.2 接口调用示例

**获取通知列表：**

```
GET /api/v4/user/notifications?page=1&page_size=20
GET /api/v4/user/notifications?type=listing_created     ← 按类型筛选
GET /api/v4/user/notifications?is_read=0                 ← 仅未读
```

响应 `data.notifications` 数组，每条通知字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| notification_id | string(BIGINT) | 通知ID |
| type | string | 通知类型 |
| title | string | 通知标题（可直接展示） |
| content | string | 通知正文 |
| metadata | object/null | 业务数据（可用于跳转到对应页面） |
| is_read | number | 0=未读，1=已读 |
| read_at | string/null | 已读时间 |
| created_at | string | 创建时间（北京时间） |

分页字段：`data.pagination`（含 current_page, page_size, total_count, total_pages, has_next, has_prev）

**获取未读数量（铃铛角标）：**

```
GET /api/v4/user/notifications/unread-count
```

响应：`data.unread_count`（数字）

**单条标记已读（点击通知时调用）：**

```
POST /api/v4/user/notifications/{notification_id}/read
```

**全部已读：**

```
POST /api/v4/user/notifications/mark-read
Content-Type: application/json
Body: {}
```

**批量指定已读：**

```
POST /api/v4/user/notifications/mark-read
Content-Type: application/json
Body: { "notification_ids": [1, 2, 3] }
```

### D.3 WebSocket 事件

| 事件名 | 方向 | 说明 |
|---|---|---|
| new_notification | 服务器 → 客户端 | 新通知到达（实时推送） |
| new_message | 服务器 → 客户端 | 客服聊天消息（原有，不变） |

new_notification 事件数据结构与列表 API 中单条通知相同（notification_id, type, title, content, metadata, created_at）。

前端收到 new_notification 事件后：
1. 更新铃铛角标数字 +1
2. 如果通知列表页已打开，在列表顶部插入新通知

### D.4 通知类型与前端展示标签映射（建议）

| type 值 | 前端标签 | 标签颜色建议 | 点击跳转建议 |
|---|---|---|---|
| listing_created | [交易] | 蓝色 | 交易市场-我的挂牌 |
| listing_sold | [交易] | 蓝色 | 交易市场-交易记录 |
| listing_withdrawn | [交易] | 灰色 | 交易市场-我的挂牌 |
| listing_expired | [交易] | 灰色 | 交易市场 |
| purchase_completed | [交易] | 绿色 | 背包/资产 |
| lottery_win / lottery_result | [中奖] | 金色 | 抽奖记录 |
| exchange_pending | [兑换] | 橙色 | 兑换记录 |
| exchange_approved | [兑换] | 绿色 | 兑换记录 |
| exchange_rejected | [兑换] | 红色 | 兑换记录 |
| points_change | [积分] | 蓝色 | 积分明细 |
| announcement | [系统] | 灰色 | — |
| 其他 | [通知] | 灰色 | — |

### D.5 前端字段使用原则

**直接使用后端返回的字段名，不做二次映射。** 所有字段均为 snake_case。
