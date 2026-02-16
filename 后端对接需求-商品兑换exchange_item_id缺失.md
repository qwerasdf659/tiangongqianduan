# 🚨 后端对接需求：商品兑换 API 响应缺少 exchange_item_id

**提交日期**: 2026-02-17  
**提交人**: 前端开发  
**优先级**: 🔴 高（阻塞商品兑换核心功能）  
**影响范围**: 臻选空间 + 幸运空间所有商品兑换操作

---

## 一、问题描述

### 现象

用户在臻选空间（premium）点击商品 → 弹出兑换确认弹窗 → 点击"确认兑换" → 前端报错 **"商品ID无效"**，兑换操作中断。

### 错误日志

```
[ERROR][exchange] ❌ 商品ID无效: {
  item_name: "",           ← 空字符串
  description: "15W快充无线充电板，兼容iPhone/Android，超薄设计，桌面百搭",
  image: "/images/products/default-product.png",
  cost_amount: "200",      ← 字符串，期望整数
  cost_asset_code: "red_shard",
  is_hot: true,
  is_new: true,
  original_price: "300",   ← 字符串，期望整数
  sell_point: "15W快充，全机型兼容",
  tags: ["跨空间", "快充", "热销"]
}
```

### 根因定位

前端调用 `GET /api/v4/backpack/exchange/items?space=premium` 获取商品列表，**API 响应中的每条商品数据缺少 `exchange_item_id` 字段**。前端执行兑换时需要将 `exchange_item_id` 传递给 `POST /api/v4/backpack/exchange`，导致兑换操作无法继续。

---

## 二、需要后端修复的问题（共3项）

### 🔴 问题1：响应缺少 exchange_item_id 字段（阻塞）

**涉及API**: `GET /api/v4/backpack/exchange/items`  
**涉及数据库表**: `exchange_items`

**当前情况**: API 响应的每条商品数据中**没有**包含 `exchange_item_id` 字段  
**期望情况**: 每条商品必须包含 `exchange_item_id`（表主键），前端依赖此字段执行兑换请求

**前端使用方式**:

```
前端调用: POST /api/v4/backpack/exchange
请求体: { exchange_item_id: <从列表获取>, quantity: 1 }
请求头: Idempotency-Key: <幂等键>
```

### 🟡 问题2：item_name 字段返回空字符串

**涉及API**: `GET /api/v4/backpack/exchange/items`  
**涉及数据库表**: `exchange_items.item_name`

**当前情况**: 部分商品的 `item_name` 返回空字符串 `""`  
**期望情况**: `item_name` 不应为空（用于前端展示商品名称）

**排查建议**:

- 检查 `exchange_items` 表中对应记录的 `item_name` 字段值
- 检查 SQL 查询是否正确 SELECT 了 `item_name` 列
- 是否存在字段别名映射错误

### 🟡 问题3：数值字段返回字符串类型

**涉及API**: `GET /api/v4/backpack/exchange/items`  
**涉及字段**: `cost_amount`、`original_price`

**当前情况**:

- `cost_amount: "200"` → 字符串
- `original_price: "300"` → 字符串

**期望情况**:

- `cost_amount: 200` → 整数（数据库 BIGINT）
- `original_price: 300` → 整数（数据库 BIGINT）

**影响**: 前端积分余额比较 `totalPoints < costAmount * quantity` 在字符串类型下可能出现类型转换问题

---

## 三、期望的 API 响应格式

### 请求

```
GET /api/v4/backpack/exchange/items?space=premium&page=1&page_size=30&status=active
Authorization: Bearer <access_token>
```

### 期望响应（每条商品必须包含的字段）

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "exchange_item_id": 1001,        // 🔴 必需 - 商品主键（BIGINT），前端兑换操作依赖
        "item_name": "15W快充无线充电板",  // 🔴 必需 - 商品名称（VARCHAR），前端展示
        "description": "兼容iPhone/Android，超薄设计", // 商品描述
        "cost_amount": 200,               // 🔴 必需 - 兑换价格（BIGINT 整数，非字符串）
        "cost_asset_code": "red_shard",   // 🔴 必需 - 支付资产类型代码
        "original_price": 300,            // 原价（BIGINT 整数，非字符串）
        "stock": 50,                      // 库存数量
        "category_code": "electronics",   // 分类代码
        "is_hot": true,                   // 是否热销
        "is_new": true,                   // 是否新品
        "is_lucky": false,                // 是否幸运商品
        "sell_point": "15W快充，全机型兼容", // 商品卖点
        "sold_count": 0,                  // 销量
        "tags": ["跨空间", "快充", "热销"], // 标签数组
        "primary_image_id": null,         // 主图ID
        "image_url": null,                // 商品图片URL
        "created_at": "2026-02-16T10:00:00+08:00" // 创建时间
      }
    ],
    "pagination": {
      "page": 1,
      "page_size": 30,
      "total": 100,
      "total_pages": 4
    }
  }
}
```

---

## 四、前端已完成的修复

| 修改文件 | 修改内容 |
|---------|---------|
| `pages/exchange/exchange-shop-handlers.ts` | 臻选空间数据加载增加 `exchange_item_id` 完整性校验，过滤缺少主键的商品 |
| `pages/exchange/exchange.ts` | 商品点击事件增加 `exchange_item_id` 前置校验，阻止无效商品进入兑换流程 |
| `pages/exchange/exchange-shop.wxml` | 清理旧字段 `price` 兼容性代码，统一使用 `cost_amount` |
| `utils/waterfall.ts` | 瀑布流高度计算统一使用 `item_name` / `cost_amount`（后端字段名） |
| `utils/product-filter.ts` | 筛选工具统一使用 `cost_amount` 作为价格字段 |

---

## 五、验证方法

后端修复后，前端验证步骤：

1. 打开微信小程序 → 进入"交易市场"页面 → 切换到"商品兑换"Tab
2. 切换到"臻选空间"（需解锁）
3. 点击任意商品卡片
4. 检查控制台日志 `🎁 点击商品:` 输出中是否包含 `exchange_item_id` 字段
5. 点击"确认兑换"按钮，应能成功调用 `POST /api/v4/backpack/exchange`

---

## 六、数据流全链路图

```
后端 exchange_items 表
  │
  ├─ GET /api/v4/backpack/exchange/items?space=premium
  │   └─ 响应: { items: [{ exchange_item_id: ?, item_name: ?, ... }] }
  │                          ↑                    ↑
  │                    🔴 当前缺失            🟡 当前为空
  │
  ├─ 前端 initPremiumSpaceData() → 校验 exchange_item_id 存在性
  │   └─ 过滤掉缺少 exchange_item_id 的商品（已添加防御逻辑）
  │
  ├─ 前端 loadPremiumCurrentPageProducts() → 渲染商品卡片
  │
  ├─ 用户点击商品 → onProductTap() → 校验 exchange_item_id
  │   └─ 缺少 exchange_item_id 时提示"商品数据异常，请刷新页面重试"
  │
  ├─ 用户确认兑换 → onConfirmShopExchange()
  │   └─ POST /api/v4/backpack/exchange
  │       请求体: { exchange_item_id, quantity }
  │       请求头: Idempotency-Key: exchange_{id}_{timestamp}_{random}
  │
  └─ 兑换成功 → 刷新积分余额 (GET /api/v4/assets/balance)
```
