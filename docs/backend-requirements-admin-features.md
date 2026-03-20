# 微信小程序前端 - 后端协助需求清单（管理后台功能差距）

> 生成日期: 2026-03-21
> 来源: 微信小程序前端项目对 docs/管理后台功能差距分析与优化方案.md 的工作内容检查
> 状态: 前端 M1-M7 功能代码开发已基本完成，以下为待后端确认或提供数据的事项

---

## 一、前端 M1-M7 功能完成度总览

| 编号 | 功能 | 完成状态 | 说明 |
|------|------|---------|------|
| M1 | 兑换商品规格选择器（SKU） | ✅ 已完成 | packageExchange/exchange-detail/ 完整实现，支持单品自动选中、多规格选择 |
| M2 | 物流轨迹查看页 | ✅ 已完成 | 内嵌在 exchange-order-detail 订单详情页，API: /backpack/exchange/orders/:order_no/track |
| M3 | 两级分类筛选 | ✅ 已完成 | components/category-cascade/ 两级联动选择器，API: getCategoryTree() |
| M4 | 交易市场排序选项 | ✅ 已完成 | packageTrade/trade/market/ 已支持 recommended / hot 排序 |
| M5 | 兑换商品排序选项 | 🟡 依赖后端配置 | 前端使用后端 product-filter 下发的排序选项，默认配置中含等价选项 |
| M6 | 订单详情完整状态 | ✅ 已完成 | 9种状态枚举全部适配（pending/approved/shipped/received/rated/rejected/refunded/cancelled/completed） |
| M7 | 竞价功能前端 | ✅ 已完成 | packageExchange/exchange-shelf/sub/bid-panel/ 竞价面板，集成在兑换货架 |

**结论: 前端 M1-M7 代码开发已基本完成，无重大待编码的前端任务。**

---

## 二、需要后端确认或提供的事项

### 事项1: 确认用户端物流查询路由是否已注册

**优先级**: P1（影响用户查看物流轨迹）

**现状**:
- 前端已实现 `getExchangeOrderTrack()` 函数，调用 `GET /api/v4/backpack/exchange/orders/:order_no/track`
- 管理端路由 `/console/marketplace/exchange_market/orders/:order_no/track` 文档中标注已实现
- 用户端路由 `/backpack/exchange/orders/:order_no/track` 需后端确认是否已注册

**前端期望的响应格式**:
```json
{
  "success": true,
  "data": {
    "has_shipping": true,
    "shipping_company_name": "顺丰速运",
    "shipping_no": "SF1234567890",
    "track": {
      "success": true,
      "state": "in_transit",
      "tracks": [
        { "time": "2026-03-16 14:30", "status": "delivered", "detail": "已签收" },
        { "time": "2026-03-16 09:15", "status": "delivering", "detail": "派送中" }
      ]
    }
  }
}
```

**请后端确认**:
- [ ] `GET /api/v4/backpack/exchange/orders/:order_no/track` 路由是否已注册
- [ ] 响应格式是否与上述一致
- [ ] ShippingTrackService（快递100+快递鸟双通道）是否已部署
- [ ] 快递100/快递鸟的 API Key 是否已配置在 .env 中

---

### 事项2: product-filter 排序选项配置确认

**优先级**: P2（兑换商品排序选项）

**现状**:
- 前端兑换商品排序选项由后端 `GET /api/v4/backpack/exchange/product-filter` 动态下发
- 前端 `exchange-config-cache.ts` 有默认降级配置:
  - `sort_order`（默认排序）
  - `cost_amount_asc`（价格从低到高）
  - `cost_amount_desc`（价格从高到低）
  - `created_at_desc`（最新上架）
  - `sold_count_desc`（销量最高）

**请后端确认**:
- [ ] product-filter 接口返回的排序选项列表是否包含上述5种
- [ ] 后端 ExchangeQueryService 是否支持以上 sort_by 参数

---

### 事项3: 竞价系统启用确认

**优先级**: P2（竞价功能依赖运营创建竞价商品）

**现状**:
- 前端竞价面板 bid-panel 已完整实现
- API: `GET /api/v4/backpack/bid/products` / `POST /api/v4/backpack/bid`
- `bid_products` 表当前 0 条数据，`bid_records` 表 0 条数据

**请后端/运营确认**:
- [ ] 竞价系统是否准备启用
- [ ] 如需启用，请通过管理后台 bid-management.html 创建首批竞价商品
- [ ] 前端竞价出价 POST /api/v4/backpack/bid 是否支持 Idempotency-Key 头（前端已添加）

---

### 事项4: 客服快捷回复模板 API

**优先级**: P3（客服功能增强）

**现状**:
- `packageAdmin/customer-service/customer-service.ts` 第81-86行存在临时硬编码的快捷回复模板
- 代码中已标注 `@todo 后端接口就绪后改为: await API.getQuickReplyTemplates()`

**临时硬编码数据（需后端提供真实数据接口后替换）**:
```
id:1 欢迎 → "您好！很高兴为您服务，请问有什么可以帮助您的吗？"
id:2 稍等 → "好的，请您稍等片刻，我来为您查询处理。"
id:3 核实信息 → "为了更好的为您处理，请提供您的订单号或联系方式。"
id:4 感谢 → "感谢您的耐心等待，如还有其他问题请随时联系我们。"
id:5 结束 → "本次服务到此结束，祝您生活愉快！如有问题请随时联系。"
```

**前端期望的 API 设计**:
- 端点: `GET /api/v4/console/customer-service/gm-tools/templates`
- 权限: `requireRoleLevel(50)` 以上
- 响应格式:

```json
{
  "success": true,
  "data": {
    "templates": [
      { "template_id": 1, "title": "欢迎", "content": "您好！很高兴为您服务..." },
      { "template_id": 2, "title": "稍等", "content": "好的，请您稍等片刻..." }
    ]
  }
}
```

**请后端确认**:
- [ ] 是否计划提供快捷回复模板管理 API
- [ ] 如暂不提供，前端当前硬编码数据可继续使用

---

### 事项5: 幂等键（Idempotency-Key）后端支持确认

**优先级**: P1（防止重复提交）

**现状**: 前端已为所有关键写操作添加 `Idempotency-Key` 请求头，格式为 `{业务类型}_{业务ID}_{时间戳}_{随机数}`

**已添加幂等键的接口清单**:

| 模块 | 函数 | 请求路径 | Idempotency-Key 格式 |
|------|------|----------|---------------------|
| backpack | exchangeProduct | POST /backpack/exchange | `exchange_{id}_{ts}_{rand}` |
| backpack | placeBid | POST /backpack/bid | `bid_{id}_{ts}_{rand}` |
| backpack | cancelExchange | POST /backpack/exchange/orders/:no/cancel | `exchange_cancel_{no}_{ts}_{rand}` |
| backpack | confirmExchangeReceipt | POST /backpack/exchange/orders/:no/confirm-receipt | `exchange_confirm_{no}_{ts}_{rand}` |
| backpack | rateExchangeOrder | POST /backpack/exchange/orders/:no/rate | `exchange_rate_{no}_{ts}_{rand}` |
| backpack | unlockPremium | POST /backpack/exchange/unlock-premium | `unlock_premium_{ts}_{rand}` |
| market | purchaseMarketProduct | POST /market/listings/:id/purchase | `market_purchase_{id}_{ts}_{rand}` |
| market | withdrawMarketProduct | POST /market/listings/:id/withdraw | `market_withdraw_{id}_{ts}_{rand}` |
| market | sellToMarket | POST /market/list | `market_list_{ts}_{rand}` |
| market | sellFungibleAssets | POST /market/fungible-assets/list | `market_fungible_{ts}_{rand}` |
| market | cancelTradeOrder | POST /market/trade-orders/:id/cancel | `market_cancel_{id}_{ts}_{rand}` |
| market | confirmDelivery | POST /market/trade-orders/:id/confirm | `escrow_confirm_{id}_{ts}_{rand}` |
| market | executeExchangeRate | POST /market/exchange-rates/convert | `exchange_rate_{ts}_{rand}` |
| market | createTradeDispute | POST /market/trade-orders/:id/dispute | `dispute_{id}_{ts}_{rand}` |
| shop | submitConsumption | POST /shop/consumption/submit | `consumption_submit_{ts}_{rand}` |

**请后端确认**:
- [ ] 后端 IdempotencyService 是否已覆盖上述所有路由
- [ ] 对于 cancelExchange / confirmExchangeReceipt / rateExchangeOrder 等新增幂等键的接口，后端是否需要在 CANONICAL_OPERATION_MAP 中注册映射
- [ ] placeBid / createTradeDispute 的幂等键是否需要在后端添加支持

---

### 事项6: 门店数据初始化

**优先级**: P1（影响消费积分链路）

**现状（来自管理后台功能差距分析文档 10.9 决策6）**:
- 5个门店全部为测试数据（"API验证测试门店"、"测试门店1"等）
- 5个门店 `merchant_id = null`，未关联商户
- 消费积分链路依赖门店: 用户到门店消费 → 扫码 → 获得POINTS

**请后端/运营执行**:
- [ ] 清理5个测试门店（标记为inactive或删除）
- [ ] 创建老良记实际经营的正式门店记录
- [ ] 将正式门店关联商户: `UPDATE stores SET merchant_id = 6 WHERE ...`
- [ ] 前端无需代码改动，Schema已支持

---

### 事项7: 测试数据清理

**优先级**: P2（上线前必须完成）

**现状（来自管理后台功能差距分析文档 10.9 决策5）**:
- `trade_orders` 表 126 笔取消订单中 70% 来自 1 个测试账号（user_id:32）
- `market_listings` 表 262 条 fungible_asset 撤回来自 1 个卖家（测试）
- `asset_transactions` 表有 4,000+ 条 `test_*` 类型的流水
- 85% 取消率是测试数据造成的假象

**请后端执行**:
- [ ] 使用已有的 `data-management` 服务标记/清理测试订单和流水
- [ ] 清理后重新统计市场健康指标
- [ ] 前端不涉及，纯数据操作

---

## 三、前端代码质量检查结果

| 检查项 | 结果 |
|--------|------|
| ESLint 代码质量 | ✅ 通过（utils/ 全部 .ts 文件零错误） |
| Prettier 格式化 | ✅ 通过（修改的文件均符合代码风格） |
| APIClient 健康度 | ✅ 正常（JWT Token自动管理、401刷新重试、503维护模式、并发Token刷新队列） |
| utils/index.ts 统一导出 | ✅ 规范（展开运算符自动同步，16个功能模块分类导出） |
| API路径验证 | ✅ 全部符合文档（/backpack/exchange/ 用户端兑换、/market/ 交易市场） |
| 认证头处理 | ✅ 正常（Bearer Token自动附加，完整性校验validateJWTTokenIntegrity） |
| Token有效性检查 | ✅ 正常（401自动刷新、SESSION_REPLACED检测、并发刷新队列） |
| 错误处理逻辑 | ✅ 完善（400/401/403/404/409/429/500/503全覆盖，业务错误码分类处理） |
| Mock数据检查 | ✅ 无mock数据（仅1处客服快捷回复临时硬编码，已标注@todo） |
| 兼容性代码检查 | ✅ 合理（iOS日期兼容、历史订单字段兼容均为业务必要，已保留） |

---

## 四、本次前端修改清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | utils/api/backpack.ts | 为 placeBid / cancelExchange / confirmExchangeReceipt / rateExchangeOrder / unlockPremium 添加 Idempotency-Key |
| 修改 | utils/api/market.ts | 为 createTradeDispute 添加 Idempotency-Key |
| 删除 | _tmp_write.js | 清理临时脚本文件（211字节） |
