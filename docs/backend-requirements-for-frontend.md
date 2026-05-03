# 微信小程序前端 → 后端需求清单

> 发起方：微信小程序前端项目 v5.2.0
> 日期：2026-05-04
> 基于：`docs/前端功能求证-需后端确认.md` 确认结果
> 更新：2026-05-04 — 补充前端代码位置和类型定义信息

---

## 一、需要后端新增实现的接口

### 1.1 DIY 作品小程序码生成

| 项目 | 内容 |
|------|------|
| **接口路径** | `GET /api/v4/diy/works/:diy_work_id/qrcode` |
| **前端状态** | ✅ 调用逻辑已完成（`utils/api/diy.ts`） |
| **后端状态** | ❌ 未实现 |
| **优先级** | 中（DIY 分享海报功能依赖此接口） |

**前端期望返回格式：**

```json
{
  "success": true,
  "data": {
    "qrcode_url": "https://xxx.sealos.site/diy-qrcodes/work_123.png"
  }
}
```

**业务场景：** 用户在 `packageDIY/diy-result` 页面点击"生成海报"时，需要获取小程序码嵌入海报图片。

---

## 二、需要后端确认的字段返回

### 2.1 抽奖历史 `GET /api/v4/lottery/history`

前端已按后端实际字段开发，请确认以下字段在 Service 层 JOIN 后是否返回：

| 字段 | 说明 | 前端是否使用 |
|------|------|-------------|
| `lottery_draw_id` (VARCHAR) | 抽奖记录主键 | ✅ 已使用 |
| `reward_tier` | 奖品档位 high/mid/low/fallback | ✅ 已使用 |
| `campaign_code` | 活动编码 | ⚠️ 需确认 Service 层是否 JOIN lottery_campaigns 表返回 |
| `campaign_name` | 活动名称 | ⚠️ 需确认 Service 层是否 JOIN lottery_campaigns 表返回 |

**前端代码位置：**
- API 函数: `utils/api/lottery.ts` → `getLotteryHistory(page, page_size)`
- 类型定义: `typings/api.d.ts` → `LotteryHistoryRecord`（已新增，campaign_code/campaign_name 标记为可选字段）
- 业务场景: 用户查看抽奖记录列表时，需要展示"这次抽奖属于哪个活动"

**如果后端未 JOIN：** 请在 `LotteryQueryService.getUserHistory()` 中补充 JOIN `lottery_campaigns` 表，返回 `campaign_code` 和 `campaign_name`。

### 2.2 抽奖统计 `GET /api/v4/lottery/statistics`

请确认后端实际返回的字段结构：

```json
{
  "success": true,
  "data": {
    "total_draws": "总抽奖次数",
    "total_high_tier_wins": "高档奖励次数",
    "high_tier_rate": "高档奖励率（小数）",
    "today_draws": "今日抽奖次数",
    "reward_tier_distribution": {
      "high": "高档次数",
      "mid": "中档次数",
      "low": "低档次数",
      "fallback": "保底次数"
    }
  }
}
```

前端需要以上字段来展示用户抽奖统计面板。请确认字段名和结构是否准确。

**前端代码位置：**
- API 函数: `utils/api/lottery.ts` → `getLotteryUserStatistics()`
- 类型定义: `typings/api.d.ts` → `LotteryUserStatistics`（已新增）
- 业务场景: 用户个人中心展示抽奖统计数据（总次数、高档率、今日次数、档位分布）

### 2.3 DIY 材料分组 `GET /api/v4/diy/material-groups`

请确认 `DIYService.getMaterialGroups()` 返回的每个分组是否包含 `sample_name` 字段（示例材料名称）。

**前端代码位置：**
- API 函数: `utils/api/diy.ts` → `getDiyMaterialGroups()`
- 类型定义: `typings/api.d.ts` → `DiyMaterialGroup`（已有 sample_name 字段）
- 使用位置: `packageDIY/diy-design/diy-design.ts` → `_loadBeads()` 方法
- 备用方案: 当前前端从珠子数据（`getDiyTemplateBeads`）自行聚合生成 sample_name，但如果后端直接返回更好
- 业务场景: DIY 设计器中 Tab 栏显示每组的代表材料名（如"红宝石"、"蓝水晶"）

前端期望格式：

```json
{
  "success": true,
  "data": {
    "groups": [
      {
        "group_code": "red",
        "count": 3,
        "sample_name": "需确认是否返回"
      }
    ]
  }
}
```

### 2.4 消费记录详情 `GET /api/v4/shop/consumption/detail/:id`

请确认 Service 层是否通过 `store_id` JOIN `stores` 表返回 `store_name` 字段。

**前端代码位置：**
- API 函数: `utils/api/shop.ts` → `getConsumptionDetail(record_id)`
- 类型定义: `typings/api.d.ts` → `ConsumptionRecord`（已新增 store_name 可选字段和 reviewed_at 字段）
- 业务场景: 用户在消费记录列表中点击某条记录，详情页需要展示门店名称

前端需要展示门店名称，如果 Service 层未返回 `store_name`，请在 `ConsumptionQueryService.getConsumptionDetailWithAuth()` 中补充 JOIN `stores` 表的逻辑。

---

## 三、需要后端修复/补充的问题

### 3.1 核销订单幂等键

| 项目 | 内容 |
|------|------|
| **接口** | `POST /api/v4/shop/redemption/orders` |
| **问题** | 当前路由未读取 Header 中的 `Idempotency-Key` |
| **前端状态** | ✅ 已按 HTTP 标准在 Header 中发送 `Idempotency-Key` |
| **建议** | 后端补充读取 `req.headers['idempotency-key']` 的逻辑，防止网络重试导致重复创建 |

当前防重复依赖 `code_hash` 唯一约束（SHA-256），但 Header 级幂等键是更标准的做法。

---

## 四、环境配置确认

### 4.1 生产环境独立域名

当前 testing 和 production 共用 `omqktqrtntnn.sealosbja.site`。

如果需要独立生产域名，请在 Sealos 平台配置后通知前端更新 `config/env.ts` 中的：
- `baseUrl`（API 地址）
- WebSocket URL（当前与 API 共用域名，通过 `/ws` 路径区分）

---

## 五、前后端约定确认（已遵守，仅做备忘）

| 约定项 | 规范 |
|--------|------|
| 命名风格 | 数据库、API、后端、前端统一 `snake_case` |
| 主键命名 | `{table_name}_id` |
| 响应格式 | `{ success: boolean, data: T, message?: string }` |
| 认证方式 | JWT Bearer Token（`Authorization: Bearer xxx`） |
| 幂等键 | 请求头 `Idempotency-Key`（非请求体） |
| 时间格式 | 数据库 UTC 存储，API 返回北京时间 |
| 分页格式 | `{ page, page_size, total, total_pages }` |
| API 版本 | 统一 `/api/v4/` 前缀 |
