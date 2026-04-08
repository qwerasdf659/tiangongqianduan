/**
 * C2C交易市场API（用户间交易）
 * 后端路由: routes/v4/marketplace/（Phase 3 迁移后新路径）
 *
 * 数据库表: market_listings（双模式: item / fungible_asset）
 *           trade_orders（状态机: created → frozen → completed / cancelled / failed）
 *
 * 核心概念:
 *   - listing_kind: 'item'（不可叠加物品） / 'fungible_asset'（可叠加资产）
 *   - price_asset_code: 定价币种（默认 star_stone）
 *   - price_amount: 售价（BIGINT整数）
 *   - 挂单状态 active / sold / withdrawn / expired（文档层枚举）
 *
 * QueryService 响应结构（2026-02-18 更新）:
 *   - 物品信息通过 JOIN item_templates 查询，封装在 item_info 嵌套对象中
 *   - 资产信息通过 JOIN material_asset_types 查询，封装在 asset_info 嵌套对象中
 *   - 图片通过 media_files 表 JOIN 返回 primary_media 对象（含 public_url）
 *
 * ⚠️ 资产转换API已迁移到 utils/api/assets.ts（对齐后端 /api/v4/assets/conversion/）
 *
 * @file 天工餐厅积分系统 - C2C交易市场API模块
 * @version 6.0.0
 * @since 2026-03-25（Phase 3 路径迁移: /market/ → /marketplace/）
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/**
 * 获取交易市场挂单列表
 * GET /api/v4/marketplace/listings
 *
 * 后端服务: QueryService.getMarketListings（含 ItemTemplate / MaterialAssetType 关联查询）
 *
 * 响应结构: { products: MarketListing[], pagination: { page, page_size, total } }
 *
 * 响应字段（根级 — 基于 market_listings 表）:
 *   - listing_id: BIGINT PK 挂单ID（API响应字段名）
 *   - listing_kind: ENUM 'item' / 'fungible_asset'
 *   - seller_user_id: INT FK 卖家用户ID
 *   - seller_nickname: VARCHAR 卖家昵称
 *   - seller_avatar_url: VARCHAR 卖家头像（可null）
 *   - price_asset_code: VARCHAR(50) 定价币种（默认 star_stone）
 *   - price_amount: BIGINT 售价
 *   - status: ENUM active / sold / withdrawn / expired（文档层枚举）
 *   - created_at: DATETIME
 *
 * 物品类型(item)嵌套对象 item_info:
 *   - item_id: BIGINT 物品ID（items表主键）
 *   - display_name: VARCHAR 物品显示名称（items表 item_name 正式列）
 *   - primary_media: MediaObject|null 物品图片（media_files JOIN，运营未上传时为null）
 *   - category_code: VARCHAR 物品分类编码（可null）
 *   - category_display_name: VARCHAR 分类中文显示名（可null）
 *   - rarity_code: VARCHAR 物品稀有度编码（可null）
 *   - template_id: BIGINT 物品模板ID（可null）
 *
 * 资产类型(fungible_asset)嵌套对象 asset_info:
 *   - asset_code: VARCHAR 资产代码（如 red_core_shard）
 *   - amount: BIGINT 上架数量
 *   - display_name: VARCHAR 资产显示名称（来自 material_asset_types）
 *   - primary_media: MediaObject|null 资产图标（media_files JOIN，运营未上传时为null）
 *   - group_code: VARCHAR 资产分组代码
 *
 * @param params - 查询参数对象
 * @param params.page - 页码，默认1
 * @param params.page_size - 每页数量，默认20
 * @param params.listing_kind - 挂牌类型: 'item' / 'fungible_asset'
 * @param params.asset_code - 资产代码筛选（仅 fungible_asset 有效）
 * @param params.category_id - 物品类目ID（整数，仅 item 有效）
 * @param params.asset_group_code - 资产分组代码（仅 fungible_asset 有效）
 * @param params.rarity_code - 稀有度筛选（仅 item 有效）
 * @param params.min_price - 最低价格
 * @param params.max_price - 最高价格
 * @param params.sort - 排序方式: 'recommended'(综合推荐,默认) / 'newest' / 'price_asc' / 'price_desc' / 'hot'(按成交量) / 'quality_score_desc' / 'quality_score_asc'
 * @param params.quality_grade - 品质等级筛选（完美无瑕/精良/良好/普通/微瑕）
 */
async function getMarketProducts(
  params: {
    page?: number
    page_size?: number
    listing_kind?: string | null
    asset_code?: string | null
    category_id?: number | null
    asset_group_code?: string | null
    rarity_code?: string | null
    min_price?: number | null
    max_price?: number | null
    sort?: string | null
    /** 品质等级筛选（后端 instance_attributes.quality_grade） */
    quality_grade?: string | null
    /** 是否返回筛选维度聚合计数（C+++联动计数），后端交叉排除逻辑 */
    with_counts?: boolean
  } = {}
) {
  const {
    page = 1,
    page_size = 20,
    listing_kind = null,
    asset_code = null,
    category_id = null,
    asset_group_code = null,
    rarity_code = null,
    min_price = null,
    max_price = null,
    sort = null,
    quality_grade = null,
    with_counts = false
  } = params

  const qs = buildQueryString({
    page,
    page_size,
    listing_kind,
    asset_code,
    category_id,
    asset_group_code,
    rarity_code,
    min_price,
    max_price,
    sort,
    quality_grade,
    with_counts: with_counts ? 'true' : null
  })
  return apiClient.request(`/marketplace/listings?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 获取市场商品详情
 * GET /api/v4/marketplace/listings/:listing_id
 *
 * @param listing_id - 挂单ID（BIGINT）
 */
async function getMarketProductDetail(listing_id: number) {
  if (!listing_id) {
    throw new Error('挂单ID不能为空')
  }
  return apiClient.request(`/marketplace/listings/${listing_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 购买市场商品
 * POST /api/v4/marketplace/listings/:listing_id/purchase
 * 携带 Idempotency-Key 请求头防止重复购买
 *
 * 后端服务: TradeOrderService
 * 业务流程:
 *   1. 验证挂单状态 = on_sale
 *   2. 禁止自买自卖
 *   3. 悲观锁 + 状态 locked
 *   4. 冻结买家资产（order_freeze_buyer）
 *   5. 创建 trade_orders 记录
 *   6. 结算: 扣减买家、扣平台手续费、入账卖家
 *   7. 物品/资产转移
 *   8. 挂单状态 sold
 *
 * 响应: { trade_order_id, market_listing_id, seller_id, asset_code,
 *          gross_amount, fee_amount, net_amount, requires_escrow_confirmation,
 *          escrow_expires_at, status }
 *
 * @param listing_id - 挂单ID（BIGINT）
 * @param purchase_note - 购买备注（可选）
 */
async function purchaseMarketProduct(listing_id: number, purchase_note?: string) {
  if (!listing_id) {
    throw new Error('挂单ID不能为空')
  }

  const requestData: Record<string, any> = {}
  if (purchase_note) {
    requestData.purchase_note = purchase_note
  }

  const idempotencyKey = `market_purchase_${listing_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request(`/marketplace/listings/${listing_id}/purchase`, {
    method: 'POST',
    data: requestData,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '购买中...',
    showError: true,
    errorPrefix: '购买失败：'
  })
}

/**
 * 撤回物品实例挂单
 * POST /api/v4/marketplace/listings/:listing_id/withdraw
 *
 * @param listing_id - 挂单ID（BIGINT）
 * @param withdraw_reason - 撤回原因（可选）
 */
async function withdrawMarketProduct(listing_id: number, withdraw_reason?: string) {
  if (!listing_id) {
    throw new Error('挂单ID不能为空')
  }

  const requestData: Record<string, any> = {}
  if (withdraw_reason) {
    requestData.withdraw_reason = withdraw_reason
  }

  const idempotencyKey = `market_withdraw_${listing_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request(`/marketplace/listings/${listing_id}/withdraw`, {
    method: 'POST',
    data: requestData,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '撤回中...',
    showError: true,
    errorPrefix: '撤回失败：'
  })
}

/**
 * 撤回可叠加资产挂单
 * POST /api/v4/marketplace/fungible-assets/:listing_id/withdraw
 *
 * @param listing_id - 挂单ID（BIGINT）
 * @param withdraw_reason - 撤回原因（可选）
 */
async function withdrawFungibleAsset(listing_id: number, withdraw_reason?: string) {
  if (!listing_id) {
    throw new Error('挂单ID不能为空')
  }

  const requestData: Record<string, any> = {}
  if (withdraw_reason) {
    requestData.withdraw_reason = withdraw_reason
  }

  const idempotencyKey = `market_fungible_withdraw_${listing_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request(`/marketplace/fungible-assets/${listing_id}/withdraw`, {
    method: 'POST',
    data: requestData,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '撤回中...',
    showError: true,
    errorPrefix: '撤回失败：'
  })
}

/**
 * 上架不可叠加物品到交易市场
 * POST /api/v4/marketplace/list
 * 携带 Idempotency-Key 请求头防止重复上架
 *
 * @param params.item_id - 物品ID（items表主键，BIGINT）
 * @param params.price_amount - 售价（BIGINT整数）
 * @param params.price_asset_code - 定价币种（如 'star_stone'）
 * @param params.condition - 物品状态描述（可选，对齐文档2.3节）
 */
async function sellToMarket(params: {
  item_id: number
  price_amount: number
  price_asset_code: string
  condition?: string
}) {
  if (!params.item_id) {
    throw new Error('物品ID不能为空')
  }
  if (!params.price_amount || params.price_amount <= 0) {
    throw new Error('售价必须大于0')
  }
  if (!params.price_asset_code) {
    throw new Error('定价币种不能为空')
  }

  const requestBody: Record<string, any> = {
    item_id: params.item_id,
    price_amount: params.price_amount,
    price_asset_code: params.price_asset_code
  }
  if (params.condition) {
    requestBody.condition = params.condition
  }

  const idempotencyKey = `market_list_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/marketplace/list', {
    method: 'POST',
    data: requestBody,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '上架中...',
    showError: true,
    errorPrefix: '上架失败：'
  })
}

/** 查询我的挂单状态 - GET /api/v4/marketplace/listing-status */
async function getMyListingStatus() {
  return apiClient.request('/marketplace/listing-status', { method: 'GET', needAuth: true })
}

/**
 * 获取当前用户的挂单列表（我的挂单）
 * GET /api/v4/marketplace/my-listings
 *
 * 后端通过JWT Token识别当前用户，返回该用户的所有挂单记录
 * 响应字段（基于 market_listings 表）:
 *   listing_id, listing_kind, offer_item_display_name, offer_asset_display_name,
 *   offer_asset_code, offer_amount, offer_item_rarity, price_asset_code, price_amount,
 *   status, created_at
 *
 * @param params.page - 页码，默认1
 * @param params.page_size - 每页数量，默认20
 * @param params.status - 挂单状态筛选: active / sold / withdrawn / expired（可选，不传返回全部）
 */
async function getMyListings(
  params: {
    page?: number
    page_size?: number
    status?: string | null
  } = {}
) {
  const { page = 1, page_size = 20, status = null } = params
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/marketplace/my-listings?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取结算币种列表（用户可选的定价币种）
 * GET /api/v4/marketplace/settlement-currencies
 *
 * 响应: { currencies: [{ asset_code: "star_stone", display_name: "星石" }, ...] }
 * 数据来源: system_settings.allowed_settlement_assets 白名单 + material_asset_types.display_name
 */
async function getSettlementCurrencies() {
  return apiClient.request('/marketplace/settlement-currencies', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/** 获取市场分类筛选数据 - GET /api/v4/marketplace/listings/facets（后端已确认实现） */
async function getMarketFacets() {
  return apiClient.request('/marketplace/listings/facets', { method: 'GET', needAuth: true })
}

/**
 * 上架可叠加资产到交易市场
 * POST /api/v4/marketplace/fungible-assets/list
 * 携带 Idempotency-Key 请求头防止重复上架
 * 业务规则: 资产必须 is_tradable = true（material_asset_types 表控制）
 *
 * @param params.offer_asset_code - 出售的资产代码（如 'star_stone'）
 * @param params.offer_amount - 出售数量
 * @param params.price_amount - 挂牌价格
 * @param params.price_asset_code - 结算币种代码（如 'red_core_shard'）
 */
async function sellFungibleAssets(params: {
  offer_asset_code: string
  offer_amount: number
  price_amount: number
  price_asset_code: string
}) {
  if (!params.offer_asset_code) {
    throw new Error('资产代码不能为空')
  }
  if (!params.offer_amount || params.offer_amount <= 0) {
    throw new Error('上架数量必须大于0')
  }
  if (!params.price_amount || params.price_amount <= 0) {
    throw new Error('售价必须大于0')
  }
  if (!params.price_asset_code) {
    throw new Error('定价币种不能为空')
  }

  const idempotencyKey = `market_fungible_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/marketplace/fungible-assets/list', {
    method: 'POST',
    data: {
      offer_asset_code: params.offer_asset_code,
      offer_amount: params.offer_amount,
      price_amount: params.price_amount,
      price_asset_code: params.price_asset_code
    },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '上架中...',
    showError: true,
    errorPrefix: '上架失败：'
  })
}

// ==================== C2C担保码（Phase 4：担保交易码） ====================

/**
 * 查询担保码状态（不返回明文担保码，仅返回状态信息）
 * GET /api/v4/marketplace/trade-orders/:trade_order_id/escrow-status
 *
 * 适用场景: listing_kind = 'item' 的实物交易
 * fungible_asset 交易自动完成，不需要担保码
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 */
async function getEscrowStatus(trade_order_id: number) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }
  return apiClient.request(`/marketplace/trade-orders/${trade_order_id}/escrow-status`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '查询担保状态...',
    showError: true,
    errorPrefix: '查询失败：'
  })
}

/**
 * 取消交易订单
 * POST /api/v4/marketplace/trade-orders/:trade_order_id/cancel
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 * @param cancel_reason - 取消原因（可选）
 */
async function cancelTradeOrder(trade_order_id: number, cancel_reason?: string) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }

  const requestData: Record<string, any> = {}
  if (cancel_reason) {
    requestData.cancel_reason = cancel_reason
  }

  const idempotencyKey = `market_cancel_${trade_order_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request(`/marketplace/trade-orders/${trade_order_id}/cancel`, {
    method: 'POST',
    data: requestData,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '取消中...',
    showError: true,
    errorPrefix: '取消失败：'
  })
}

/**
 * 买方输入担保码确认收货（释放冻结资产给卖方，完成交易）
 * POST /api/v4/marketplace/trade-orders/:trade_order_id/confirm-delivery
 *
 * 业务流程:
 *   1. 买方输入卖方提供的6位担保码
 *   2. 后端验证担保码（Redis查找 + 匹配trade_order_id）
 *   3. 冻结资产转给卖方
 *   4. 交易订单状态 → completed
 *   5. 清理Redis中的担保码
 *
 * 超时机制（阶梯式处理 — 决策P3）:
 *   4h未确认  → 系统推送提醒
 *   24h未确认 → 自动取消交易，退款给买方
 *   有异议    → 走管理员后台人工处理
 *
 * 响应字段:
 *   trade_order_id - 交易订单ID
 *   status         - 更新后状态（completed）
 *   completed_at   - 交易完成时间
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 * @param escrow_code - 6位数字担保码
 */
async function confirmDelivery(trade_order_id: number, escrow_code: string) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }
  if (!escrow_code) {
    throw new Error('担保码不能为空')
  }
  if (!/^\d{6}$/.test(escrow_code)) {
    throw new Error('担保码格式无效，请输入6位数字')
  }

  const idempotencyKey = `escrow_confirm_${trade_order_id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return apiClient.request(`/marketplace/trade-orders/${trade_order_id}/confirm-delivery`, {
    method: 'POST',
    data: { escrow_code },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '确认收货中...',
    showError: true,
    errorPrefix: '确认失败：'
  })
}

// ==================== 价格发现（需求一：价格走势 / 成交量 / 摘要 / 最近成交） ====================

/**
 * 获取价格走势数据
 * GET /api/v4/marketplace/price/trend
 *
 * 后端服务: PriceDiscoveryService.getPriceTrend()
 * 数据来源: trade_orders JOIN market_listings（按时间聚合）
 *
 * 响应 data.data_points 数组每项包含:
 *   time        - 时间标签（如 '2026-02-16'）
 *   avg_price   - 均价
 *   min_price   - 最低价
 *   max_price   - 最高价
 *   trade_count - 成交笔数
 *   total_volume - 总成交量
 *
 * @param params.asset_code - 资产代码（与 template_id 二选一）
 * @param params.template_id - 物品模板ID（与 asset_code 二选一）
 * @param params.period - 时间范围: '1d' / '7d' / '30d' / '90d'
 * @param params.granularity - 聚合粒度: '1h' / '1d' / '1w'
 */
async function getPriceTrend(params: {
  asset_code?: string
  template_id?: number
  period?: string
  granularity?: string
}) {
  const qs = buildQueryString({
    asset_code: params.asset_code || null,
    template_id: params.template_id || null,
    period: params.period || '7d',
    granularity: params.granularity || '1d'
  })
  return apiClient.request(`/marketplace/price/trend?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取成交量走势数据
 * GET /api/v4/marketplace/price/volume
 *
 * 后端服务: PriceDiscoveryService.getVolumeTrend()
 *
 * @param params.asset_code - 资产代码（与 template_id 二选一）
 * @param params.template_id - 物品模板ID（与 asset_code 二选一）
 * @param params.period - 时间范围
 * @param params.granularity - 聚合粒度
 */
async function getVolumeTrend(params: {
  asset_code?: string
  template_id?: number
  period?: string
  granularity?: string
}) {
  const qs = buildQueryString({
    asset_code: params.asset_code || null,
    template_id: params.template_id || null,
    period: params.period || '7d',
    granularity: params.granularity || '1d'
  })
  return apiClient.request(`/marketplace/price/volume?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取价格摘要（综合统计）
 * GET /api/v4/marketplace/price/summary
 *
 * 后端服务: PriceDiscoveryService.getPriceSummary()
 *
 * 响应 data 包含:
 *   total_trades  - 总成交笔数
 *   lowest_ever   - 历史最低价
 *   highest_ever  - 历史最高价
 *   median_price  - 中位数价
 *   avg_price_7d  - 近7天均价
 *   trades_7d     - 近7天成交笔数
 *
 * @param params.asset_code - 资产代码（与 template_id 二选一）
 * @param params.template_id - 物品模板ID（与 asset_code 二选一）
 */
async function getPriceSummary(params: { asset_code?: string; template_id?: number }) {
  const qs = buildQueryString({
    asset_code: params.asset_code || null,
    template_id: params.template_id || null
  })
  return apiClient.request(`/marketplace/price/summary?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取最近成交列表
 * GET /api/v4/marketplace/price/recent-trades
 *
 * 后端服务: PriceDiscoveryService.getLatestTrades()
 *
 * @param params.asset_code - 资产代码（与 template_id 二选一）
 * @param params.template_id - 物品模板ID（与 asset_code 二选一）
 * @param params.limit - 返回条数（默认10）
 */
async function getRecentTrades(params: {
  asset_code?: string
  template_id?: number
  limit?: number
}) {
  const qs = buildQueryString({
    asset_code: params.asset_code || null,
    template_id: params.template_id || null,
    limit: params.limit || 10
  })
  return apiClient.request(`/marketplace/price/recent-trades?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

// ==================== 市场分析（需求二：定价建议 / 市场总览 / 价格历史） ====================

/**
 * 获取定价建议（卖家定价参考）
 * GET /api/v4/marketplace/analytics/pricing-advice
 *
 * 后端服务: MarketAnalyticsService.getPricingAdvice()
 * 算法: 建议最低价 = 近7天均价×0.8, 建议参考价 = 近7天均价, 建议最高价 = 近7天均价×1.5
 *
 * 响应 data 包含:
 *   has_trade_data     - BOOLEAN 是否有成交数据
 *   suggested_min_price - BIGINT 建议最低价
 *   suggested_price    - BIGINT 建议参考价
 *   suggested_max_price - BIGINT 建议最高价
 *   lowest_on_sale     - BIGINT 当前在售最低价
 *   advice_text        - VARCHAR 定价建议文本
 *
 * @param params.asset_code - 资产代码（与 template_id 二选一）
 * @param params.template_id - 物品模板ID（与 asset_code 二选一）
 */
async function getPricingAdvice(params: { asset_code?: string; template_id?: number }) {
  const qs = buildQueryString({
    asset_code: params.asset_code || null,
    template_id: params.template_id || null
  })
  return apiClient.request(`/marketplace/analytics/pricing-advice?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取市场总览数据
 * GET /api/v4/marketplace/analytics/overview
 *
 * 后端服务: MarketAnalyticsService.getMarketOverview()
 * 数据: 各资产成交量排行、总交易额等
 */
async function getMarketOverview() {
  return apiClient.request('/marketplace/analytics/overview', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取价格历史
 * GET /api/v4/marketplace/analytics/history
 *
 * 后端服务: MarketAnalyticsService.getAssetPriceHistory()
 *
 * @param params.asset_code - 资产代码
 * @param params.days - 天数（默认30）
 */
async function getPriceHistory(params: { asset_code: string; days?: number }) {
  if (!params.asset_code) {
    throw new Error('资产代码不能为空')
  }
  const qs = buildQueryString({
    asset_code: params.asset_code,
    days: params.days || 30
  })
  return apiClient.request(`/marketplace/analytics/history?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取买方交易订单列表（我的订单 — 买方视角）
 * GET /api/v4/marketplace/my-orders
 *
 * 后端通过JWT Token识别当前用户（买方），返回该用户的所有购买订单
 *
 * 响应结构: { orders: TradeOrder[], pagination: { page, page_size, total, total_pages } }
 *
 * TradeOrder 字段:
 *   trade_order_id    - BIGINT 交易订单ID
 *   market_listing_id - BIGINT 关联挂单ID
 *   listing_kind      - ENUM 挂单类型 item / fungible_asset
 *   display_name      - VARCHAR 商品名称
 *   price_amount      - BIGINT 成交价格
 *   price_asset_code  - VARCHAR 结算币种
 *   gross_amount      - BIGINT 总金额
 *   fee_amount        - BIGINT 手续费
 *   net_amount        - BIGINT 卖家实收
 *   status            - ENUM created / frozen / completed / cancelled / failed
 *   requires_escrow   - BOOLEAN 是否需要担保码确认
 *   escrow_expires_at - DATETIME|null 担保码过期时间
 *   created_at        - DATETIME 下单时间
 *   completed_at      - DATETIME|null 完成时间
 *   seller_nickname   - VARCHAR 卖家昵称
 *
 * @param params.page - 页码，默认1
 * @param params.page_size - 每页数量，默认20
 * @param params.status - 状态筛选: all / pending / completed / cancelled（可选）
 */
async function getMyOrders(
  params: {
    page?: number
    page_size?: number
    status?: string | null
  } = {}
) {
  const { page = 1, page_size = 20, status = null } = params
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/marketplace/my-orders?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== P2P交易纠纷/申诉（文档 5.4） ====================

/**
 * 发起交易申诉
 * POST /api/v4/marketplace/trade-orders/:trade_order_id/dispute
 *
 * 适用条件: 交易订单 status=completed 且在完成后 N 天内（后端配置）
 *
 * 请求体:
 *   dispute_type  - 申诉类型: 'item_mismatch'(物品不符) / 'not_received'(未收到) / 'quality_issue'(质量问题) / 'other'(其他)
 *   description   - 申诉描述（必填，20-500字）
 *   evidence_urls - 证据图片URL数组（可选，最多5张）
 *
 * 响应:
 *   dispute_id     - 申诉记录ID
 *   status         - 申诉状态: submitted / processing / arbitrated
 *   created_at     - 提交时间
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 * @param disputeData - 申诉表单数据
 */
async function createTradeDispute(
  trade_order_id: number,
  disputeData: {
    dispute_type: string
    description: string
    evidence_urls?: string[]
  }
) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }
  if (!disputeData.dispute_type) {
    throw new Error('请选择申诉类型')
  }
  if (!disputeData.description || disputeData.description.length < 20) {
    throw new Error('申诉描述不能少于20字')
  }

  const idempotencyKey = `dispute_${trade_order_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/marketplace/trade-orders/${trade_order_id}/dispute`, {
    method: 'POST',
    data: disputeData,
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '提交申诉中...',
    showError: true,
    errorPrefix: '申诉提交失败：'
  })
}

/**
 * 查询交易申诉详情
 * GET /api/v4/marketplace/trade-orders/:trade_order_id/dispute
 *
 * 响应:
 *   dispute_id     - 申诉记录ID
 *   dispute_type   - 申诉类型
 *   description    - 申诉描述
 *   evidence_urls  - 证据图片URL数组
 *   status         - 申诉状态: submitted / processing / arbitrated
 *   result         - 仲裁结果: refund / rejected / partial_refund（仅 arbitrated 状态有值）
 *   result_note    - 仲裁说明（仅 arbitrated 状态有值）
 *   created_at     - 提交时间
 *   arbitrated_at  - 仲裁时间（仅 arbitrated 状态有值）
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 */
async function getTradeDispute(trade_order_id: number) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }
  return apiClient.request(`/marketplace/trade-orders/${trade_order_id}/dispute`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '查询申诉...',
    showError: true,
    errorPrefix: '查询失败：'
  })
}

module.exports = {
  getMarketProducts,
  getMarketProductDetail,
  purchaseMarketProduct,
  withdrawMarketProduct,
  withdrawFungibleAsset,
  sellToMarket,
  getMyListingStatus,
  getMyListings,
  getSettlementCurrencies,
  getMarketFacets,
  sellFungibleAssets,
  getEscrowStatus,
  confirmDelivery,
  cancelTradeOrder,
  getPriceTrend,
  getVolumeTrend,
  getPriceSummary,
  getRecentTrades,
  getPricingAdvice,
  getMarketOverview,
  getPriceHistory,
  getMyOrders,
  createTradeDispute,
  getTradeDispute
}
