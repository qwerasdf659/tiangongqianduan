/**
 * 交易市场API（C2C用户交易）
 * 后端路由: routes/v4/market/
 *
 * 数据库表: market_listings（双模式: item / fungible_asset）
 *           trade_orders（状态机: created → frozen → completed / cancelled / failed）
 *
 * 核心概念:
 *   - listing_kind: 'item'（不可叠加物品） / 'fungible_asset'（可叠加资产）
 *   - price_asset_code: 定价币种（默认 DIAMOND）
 *   - price_amount: 售价（BIGINT整数）
 *   - 挂单状态 on_sale / locked / sold / withdrawn / admin_withdrawn
 *
 * QueryService 响应结构（2026-02-18 更新）:
 *   - 物品信息通过 JOIN item_templates 查询，封装在 item_info 嵌套对象中
 *   - 资产信息通过 JOIN material_asset_types 查询，封装在 asset_info 嵌套对象中
 *   - 图片URL通过 ImageUrlHelper.getImageUrl(object_key) 自动转换为完整公网URL
 *
 * @file 天工餐厅积分系统 - 交易市场API模块
 * @version 5.2.0
 * @since 2026-02-18
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/**
 * 获取交易市场挂单列表
 * GET /api/v4/market/listings
 *
 * 后端服务: QueryService.getMarketListings（含 ItemTemplate / MaterialAssetType 关联查询）
 *
 * 响应结构: { products: MarketListing[], pagination: { page, page_size, total } }
 *
 * 响应字段（根级 — 基于 market_listings 表）:
 *   - market_listing_id: BIGINT PK 挂单ID
 *   - listing_kind: ENUM 'item' / 'fungible_asset'
 *   - seller_user_id: INT FK 卖家用户ID
 *   - seller_nickname: VARCHAR 卖家昵称
 *   - seller_avatar_url: VARCHAR 卖家头像（可null）
 *   - price_asset_code: VARCHAR(50) 定价币种（默认 DIAMOND）
 *   - price_amount: BIGINT 售价
 *   - status: ENUM on_sale / locked / sold / withdrawn / admin_withdrawn
 *   - created_at: DATETIME
 *
 * 物品类型(item)嵌套对象 item_info:
 *   - item_id: BIGINT 物品ID（items表主键）
 *   - display_name: VARCHAR 物品显示名称（items表 item_name 正式列）
 *   - image_url: VARCHAR 物品图片URL（ImageUrlHelper 转完整公网URL，运营未上传时为null）
 *   - category_code: VARCHAR 物品分类编码（可null）
 *   - rarity_code: VARCHAR 物品稀有度编码（可null）
 *   - template_id: BIGINT 物品模板ID（可null）
 *
 * 资产类型(fungible_asset)嵌套对象 asset_info:
 *   - asset_code: VARCHAR 资产代码（如 red_shard）
 *   - amount: BIGINT 上架数量
 *   - display_name: VARCHAR 资产显示名称（来自 material_asset_types）
 *   - icon_url: VARCHAR 资产图标URL（ImageUrlHelper 转完整公网URL，运营未上传时为null）
 *   - group_code: VARCHAR 资产分组代码
 *
 * @param params - 查询参数对象
 * @param params.page - 页码，默认1
 * @param params.limit - 每页数量，默认20
 * @param params.listing_kind - 挂牌类型: 'item' / 'fungible_asset'
 * @param params.asset_code - 资产代码筛选（仅 fungible_asset 有效）
 * @param params.item_category_code - 物品类目代码（仅 item 有效）
 * @param params.asset_group_code - 资产分组代码（仅 fungible_asset 有效）
 * @param params.rarity_code - 稀有度筛选（仅 item 有效）
 * @param params.min_price - 最低价格
 * @param params.max_price - 最高价格
 * @param params.sort - 排序方式: 'newest' / 'price_asc' / 'price_desc'
 */
async function getMarketProducts(
  params: {
    page?: number
    limit?: number
    listing_kind?: string | null
    asset_code?: string | null
    item_category_code?: string | null
    asset_group_code?: string | null
    rarity_code?: string | null
    min_price?: number | null
    max_price?: number | null
    sort?: string | null
  } = {}
) {
  const {
    page = 1,
    limit = 20,
    listing_kind = null,
    asset_code = null,
    item_category_code = null,
    asset_group_code = null,
    rarity_code = null,
    min_price = null,
    max_price = null,
    sort = null
  } = params

  const qs = buildQueryString({
    page,
    limit,
    listing_kind,
    asset_code,
    item_category_code,
    asset_group_code,
    rarity_code,
    min_price,
    max_price,
    sort
  })
  return apiClient.request(`/market/listings?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 获取市场商品详情
 * GET /api/v4/market/listings/:market_listing_id
 *
 * @param market_listing_id - 挂单ID（BIGINT */
async function getMarketProductDetail(market_listing_id: number) {
  if (!market_listing_id) {
    throw new Error('挂单ID不能为空')
  }
  return apiClient.request(`/market/listings/${market_listing_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 购买市场商品
 * POST /api/v4/market/listings/:market_listing_id/purchase
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
 * 响应: { trade_order_id, business_id, market_listing_id, buyer_user_id, seller_user_id,
 *          asset_code, gross_amount, fee_amount, net_amount, status }
 *
 * @param market_listing_id - 挂单ID（BIGINT）
 */
async function purchaseMarketProduct(market_listing_id: number) {
  if (!market_listing_id) {
    throw new Error('挂单ID不能为空')
  }

  // 生成唯一幂等键：防止网络重试、用户重复点击导致重复购买
  const idempotencyKey = `market_purchase_${market_listing_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request(`/market/listings/${market_listing_id}/purchase`, {
    method: 'POST',
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
 * POST /api/v4/market/listings/:market_listing_id/withdraw
 *
 * @param market_listing_id - 挂单ID（BIGINT）
 */
async function withdrawMarketProduct(market_listing_id: number) {
  if (!market_listing_id) {
    throw new Error('挂单ID不能为空')
  }
  return apiClient.request(`/market/listings/${market_listing_id}/withdraw`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '撤回中...',
    showError: true,
    errorPrefix: '撤回失败：'
  })
}

/**
 * 撤回可叠加资产挂单
 * POST /api/v4/market/fungible-assets/:market_listing_id/withdraw
 *
 * @param market_listing_id - 挂单ID（BIGINT）
 */
async function withdrawFungibleAsset(market_listing_id: number) {
  if (!market_listing_id) {
    throw new Error('挂单ID不能为空')
  }
  return apiClient.request(`/market/fungible-assets/${market_listing_id}/withdraw`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '撤回中...',
    showError: true,
    errorPrefix: '撤回失败：'
  })
}

/**
 * 上架不可叠加物品到交易市场
 * POST /api/v4/market/list
 * 携带 Idempotency-Key 请求头防止重复上架
 *
 * @param params.item_id - 物品ID（items表主键，BIGINT）
 * @param params.price_amount - 售价（BIGINT整数）
 * @param params.price_asset_code - 定价币种（如 'DIAMOND'）
 */
async function sellToMarket(params: {
  item_id: number
  price_amount: number
  price_asset_code: string
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

  const idempotencyKey = `market_list_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/market/list', {
    method: 'POST',
    data: {
      item_id: params.item_id,
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

/** 查询我的挂单状态- GET /api/v4/market/listing-status */
async function getMyListingStatus() {
  return apiClient.request('/market/listing-status', { method: 'GET', needAuth: true })
}

/**
 * 获取当前用户的挂单列表（我的挂单）
 * GET /api/v4/market/my-listings
 *
 * 后端通过JWT Token识别当前用户，返回该用户的所有挂单记录
 * 响应字段（基于 market_listings 表）:
 *   market_listing_id, listing_kind, offer_item_display_name, offer_asset_display_name,
 *   offer_asset_code, offer_amount, offer_item_rarity, price_asset_code, price_amount,
 *   status, created_at
 *
 * @param params.page - 页码，默认1
 * @param params.limit - 每页数量，默认20
 * @param params.status - 挂单状态筛选: on_sale / sold / withdrawn（可选，不传返回全部）
 */
async function getMyListings(
  params: {
    page?: number
    limit?: number
    status?: string | null
  } = {}
) {
  const { page = 1, limit = 20, status = null } = params
  const qs = buildQueryString({ page, limit, status })
  return apiClient.request(`/market/my-listings?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取结算币种列表（用户可选的定价币种）
 * GET /api/v4/market/settlement-currencies
 *
 * 响应: { currencies: [{ asset_code: "DIAMOND", display_name: "钻石" }, ...] }
 * 数据来源: system_settings.allowed_settlement_assets 白名单 + material_asset_types.display_name
 */
async function getSettlementCurrencies() {
  return apiClient.request('/market/settlement-currencies', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/** 获取市场分类筛选数据- GET /api/v4/market/listings/facets（ 后端已确认实现） */
async function getMarketFacets() {
  return apiClient.request('/market/listings/facets', { method: 'GET', needAuth: true })
}

/**
 * 上架可叠加资产到交易市场
 * POST /api/v4/market/fungible-assets/list
 * 携带 Idempotency-Key 请求头防止重复上 * 业务规则: 资产必须 is_tradable = true（material_asset_types 表控制）
 *
 * @param params.asset_code - 资产代码（如 'DIAMOND' * @param params.amount - 上架数量
 * @param params.price_amount - 售价
 * @param params.price_asset_code - 定价币种（如 'red_shard' */
async function sellFungibleAssets(params: {
  asset_code: string
  amount: number
  price_amount: number
  price_asset_code: string
}) {
  if (!params.asset_code) {
    throw new Error('资产代码不能为空')
  }
  if (!params.amount || params.amount <= 0) {
    throw new Error('上架数量必须大于0')
  }
  if (!params.price_amount || params.price_amount <= 0) {
    throw new Error('售价必须大于0')
  }
  if (!params.price_asset_code) {
    throw new Error('定价币种不能为空')
  }

  const idempotencyKey = `market_fungible_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/market/fungible-assets/list', {
    method: 'POST',
    data: {
      asset_code: params.asset_code,
      amount: params.amount,
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
 * 获取交易担保码（卖方查看，买方付款后系统生成）
 * GET /api/v4/market/trade-orders/:trade_order_id/escrow-code
 *
 * 适用场景: listing_kind = 'item' 的实物交易
 * fungible_asset 交易自动完成，不需要担保码
 *
 * 担保码规格:
 *   格式: 6位纯数字短码（如 582917）
 *   存储: Redis 短期存储（30分钟有效）
 *   触发: 买方付款（资产冻结）→ 系统生成担保码
 *   用途: 卖方交付物品后告知买方担保码 → 买方输入确认收货 → 冻结资产转给卖方
 *
 * 响应字段:
 *   escrow_code   - 6位数字担保码
 *   expires_at    - 担保码过期时间（ISO8601，30分钟有效）
 *   trade_order_id - 交易订单ID
 *   status        - 交易订单状态
 *
 * ⚠️ 此API需要后端 Phase 4 实施完成后才可调用
 *    后端需完成: EscrowCodeService + Redis存储 + 交易流程集成
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 */
async function getEscrowCode(trade_order_id: number) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }
  return apiClient.request(`/market/trade-orders/${trade_order_id}/escrow-code`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '获取担保码...',
    showError: true,
    errorPrefix: '获取担保码失败：'
  })
}

/**
 * 买方输入担保码确认收货（释放冻结资产给卖方，完成交易）
 * POST /api/v4/market/trade-orders/:trade_order_id/confirm-escrow
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
 * ⚠️ 此API需要后端 Phase 4 实施完成后才可调用
 *
 * @param trade_order_id - 交易订单ID（BIGINT）
 * @param escrow_code - 6位数字担保码
 */
async function confirmEscrowCode(trade_order_id: number, escrow_code: string) {
  if (!trade_order_id) {
    throw new Error('交易订单ID不能为空')
  }
  if (!escrow_code) {
    throw new Error('担保码不能为空')
  }
  if (!/^\d{6}$/.test(escrow_code)) {
    throw new Error('担保码格式无效，请输入6位数字')
  }

  return apiClient.request(`/market/trade-orders/${trade_order_id}/confirm-escrow`, {
    method: 'POST',
    data: { escrow_code },
    needAuth: true,
    showLoading: true,
    loadingText: '确认收货中...',
    showError: true,
    errorPrefix: '确认失败：'
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
  getEscrowCode,
  confirmEscrowCode
}
