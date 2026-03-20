# 图片资源管理迁移 — 后端待处理事项

> 生成日期：2026-03-21
> 来源：微信小程序前端代码审查
> 关联文档：docs/图片资源管理行业方案对比与最优选型.md
> 前端适配状态：阶段6已完成（字段重命名、类型定义、组件适配全部到位）

---

## 一、前端已完成的适配工作确认

| 检查项 | 状态 | 说明 |
|--------|------|------|
| `primary_image_id` → `primary_media_id` | 已完成 | 全局零残留 |
| `image_resource_id` → `media_id` | 已完成 | 全局零残留 |
| `primaryImage` → `primary_media` | 已完成 | 全局零残留 |
| `category`(字符串FK) → `category_def_id`(整数FK) | 已完成 | 15+文件正确使用 |
| TypeScript 类型定义 `typings/api.d.ts` | 已完成 | MediaObject/Prize/ExchangeProduct/AdCreative 全部对齐 |
| 图片URL获取 | 已完成 | 使用 `item.primary_media.public_url`，不做手动URL拼接 |
| 缩略图获取 | 已完成 | 使用 `item.primary_media.thumbnails.medium` |

---

## 二、后端需要确认/处理的事项

### B1：抽奖活动展示配置中的 `background_image_url` 字段

**当前状态**：

前端从后端返回的 `display` JSON配置对象中读取 `display.background_image_url` 作为活动背景图。

```
数据流（当前）:
后端 lottery_campaigns.display (JSON列) 
  → { ..., background_image_url: "popup-banners/xxx.jpg", ... }
  → 前端 lottery-activity.ts 读取 display.background_image_url
```

**前端代码位置**：

- `packageLottery/lottery-activity/lottery-activity.ts` 第 426 行
- `packageLottery/lottery-activity/lottery-activity.ts` 第 435 行

**需要后端确认**：

1. `display` JSON中的 `background_image_url` 是否需要迁移到 media_attachments 体系？
2. 如果迁移，后端返回的字段名改为什么？（建议：`display.background_media.public_url`）
3. 同样，`config.cover_image` 字段是否需要迁移？

**前端注释已标注**：代码中已标注 `待后端确认字段名`，后端确定后前端同步修改即可。

---

### B2：抽奖活动封面图 `cover_image` 字段

**当前状态**：

前端从 `config.cover_image` 读取抽奖活动的封面图URL。

```
前端代码：
coverImage: config.cover_image || display.background_image_url || ''
```

**前端代码位置**：

- `packageLottery/lottery-activity/lottery-activity.ts` 第 435 行

**需要后端确认**：

- 此字段是 `lottery_campaigns` 表的独立列还是 `config` JSON的内嵌字段？
- 是否需要迁移到 media_attachments（`attachable_type='lottery_campaign', role='cover'`）？

---

### B3：聊天图片上传接口是否已迁移到 MediaService

**当前状态**：

前端调用 `POST /api/v4/system/chat/sessions/:id/upload` 上传聊天图片。

```
前端代码（chat-message-handlers.ts 第743行）：
const imageUrl = uploadResult.data.public_url || uploadResult.data.image_url
```

前端已做兼容处理（优先 `public_url`，降级 `image_url`），但需要确认后端状态。

**需要后端确认**：

1. 聊天图片上传接口返回的响应格式是否已统一为 `{ public_url, object_key, media_id }` ？
2. 还是仍返回旧格式 `{ image_url }` ？

如果已迁移，前端会移除 `image_url` 降级逻辑。

---

### B4：兑换订单历史快照中的 `image_url` 字段

**当前状态**：

兑换订单的 `item_snapshot` JSON中，历史订单可能仍有旧格式字段。

```
前端代码（exchange-orders.ts 第252-255行）：
_productImage:
  itemSnapshot.primary_media?.public_url ||
  itemSnapshot.image_url ||           ← 历史订单兼容
  '/images/default-product.png'
```

**这是正常的历史数据兼容**，前端已在 `typings/api.d.ts` 中标注 `@deprecated`。

**需要后端确认**：

- 已有的历史订单快照数据是否有计划批量更新为新格式？
- 如果不更新，前端的降级逻辑将长期保留（这是合理的）。

---

### B5：运营数据补充（需运营人员操作）

以下数据需要运营人员通过管理后台上传，不是技术问题：

| 数据 | 数量 | 操作路径 |
|------|------|---------|
| 广告素材图片 | 3条（历史数据在迁移中丢失） | 管理后台 → 内容运营 → 内容投放管理 → 新建广告 |
| 抽奖奖品图片 | 37条（原始数据从未上传过图片） | 管理后台 → 抽奖运营 → 奖品管理 → 编辑 → 上传图片 |
| 物品模板图标 | 13条（原始数据从未上传过图片） | 管理后台 → 系统设置 → 物品模板 → 编辑 → 上传图标 |
| 商家 logo | 1条（logo_url=NULL） | 管理后台 → 用户门店 → 商家管理 → 编辑 → 上传 logo |

---

## 三、前端期望后端提供的信息

### 针对 B1/B2：

请确认 `lottery_campaigns` 相关的图片字段最终方案：

```
期望回复格式：

背景图：
  字段路径：display.background_image_url → [新路径]
  是否迁移到 media_attachments：是/否
  如果是，API 响应格式：{ ... display: { background_media: { public_url: "..." } } }

封面图：
  字段路径：config.cover_image → [新路径]
  是否迁移到 media_attachments：是/否
  如果是，API 响应格式：{ ... cover_media: { media_id: N, public_url: "..." } }
```

### 针对 B3：

请确认聊天图片上传接口的当前响应格式：

```
期望回复格式：

POST /api/v4/system/chat/sessions/:id/upload 的响应：
  {
    "success": true,
    "data": {
      "public_url": "https://...",     ← 是否返回？
      "object_key": "chat/...",        ← 是否返回？
      "media_id": 123,                 ← 是否返回？
      "image_url": "..."               ← 是否仍返回？
    }
  }
```

### 针对 B4：

请确认历史订单快照是否需要批量更新：

```
期望回复：
  历史订单快照 item_snapshot 中的 image_url 字段：
  □ 已批量更新为 primary_media 格式 → 前端可移除兼容代码
  □ 不更新，前端保留降级逻辑 → 前端保持当前代码不变
```

---

## 四、前端当前代码架构（供后端参考）

### API调用链路

```
前端页面 (.ts)
  → const { API } = require('../../utils/index')
  → API.getExchangeItems({ ... })
  → utils/api/backpack.ts :: getExchangeItems()
  → apiClient.request('/backpack/exchange/items?...', { needAuth: true })
  → wx.request → 后端 GET /api/v4/backpack/exchange/items
  → 后端返回 { success: true, data: { items: [...] } }
  → 前端直接使用后端字段名（primary_media_id, primary_media.public_url）
```

### Token 认证链路

```
登录成功 → 存储 access_token + refresh_token → Store + wx.setStorageSync
  ↓
每次API请求 → apiClient 从 Store 读 token → Authorization: Bearer <token>
  ↓
401 TOKEN_EXPIRED → 自动调用 POST /auth/refresh → 更新 token → 重试原请求
  ↓
401 SESSION_REPLACED → 踢出登录 → 跳转认证页
```

### 图片展示链路

```
后端返回 primary_media 对象
  → { media_id, public_url, thumbnails: { small, medium, large } }
  → 前端直接绑定 public_url 到 <image src="{{item.primary_media.public_url}}" />
  → 无图片时 primary_media = null → 前端使用本地占位图 /images/default-product.png
```
