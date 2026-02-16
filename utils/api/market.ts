/**
 * 🏪 交易市场API（C2C用户交易 * 后端路由: routes/v4/market/
 *
 * 数据库表: market_listings（双模式: item_instance / fungible_asset *           trade_orders（状态机: created frozen completed / cancelled / failed *
 * 核心概念:
 *   - listing_kind: 'item_instance'（不可叠加物品） / 'fungible_asset'（可叠加资产 *   - price_asset_code: 定价币种（默DIAMOND *   - price_amount: 售价（BIGINT整数据 *   - 挂单状态 on_sale / locked / sold / withdrawn / admin_withdrawn
 *
 * @file 天工餐厅积分系统 - 交易市场API模块
 * @version 5.2.0
 * @since 2026-02-16
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/**
 * 获取交易市场挂单列表
 * GET /api/v4/market/listings
 *
 * 后端服务: market_listing_query（QueryService.getMarketListings *
 * 响应结构: { products: MarketListing[], pagination: { page, page_size, total } }
 *
 * 响应字段（基market_listings 表）:
 *   - market_listing_id: BIGINT PK 挂单ID
 *   - listing_kind: ENUM 'item_instance' / 'fungible_asset'
 *   - seller_user_id: INT FK 卖家用户ID
 *   - offer_item_instance_id: BIGINT NULL 物品实例ID（item_instance类型 *   - offer_item_display_name: VARCHAR(200) 物品显示名称
 *   - offer_item_rarity: VARCHAR(50) 物品稀有度编码
 *   - offer_item_category_code: VARCHAR(50) 物品分类编码
 *   - offer_asset_code: VARCHAR(50) NULL 资产代码（fungible_asset类型 *   - offer_asset_display_name: VARCHAR(100) 资产显示名称
 *   - offer_asset_group_code: VARCHAR(50) 资产分组代码
 *   - offer_amount: BIGINT NULL 上架数量（fungible_asset类型 *   - price_asset_code: VARCHAR(50) 定价币种（默DIAMOND *   - price_amount: BIGINT 售价
 *   - status: ENUM on_sale / locked / sold / withdrawn / admin_withdrawn
 *   - created_at: DATETIME
 *
 * @param params - 查询参数对象
 * @param params.page - 页码，默
 * @param params.limit - 每页数量，默0
 * @param params.listing_kind - 挂牌类型: 'item_instance' / 'fungible_asset'
 * @param params.asset_code - 资产代码筛选（fungible_asset 有效 * @param params.item_category_code - 物品类目代码（仅 item_instance 有效 * @param params.asset_group_code - 资产分组代码（仅 fungible_asset 有效 * @param params.rarity_code - 稀有度筛选（item_instance 有效 * @param params.min_price - 最低价格 * @param params.max_price - 最高价格 * @param params.sort - 排序方式: 'newest' / 'price_asc' / 'price_desc'
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
 * 🔴 携带 Idempotency-Key 请求头防止重复购买
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
 * 撤回市场挂单
 * POST /api/v4/market/manage/listings/:market_listing_id/withdraw
 *
 * @param market_listing_id - 挂单ID（BIGINT */
async function withdrawMarketProduct(market_listing_id: number) {
  if (!market_listing_id) {
    throw new Error('挂单ID不能为空')
  }
  return apiClient.request(`/market/manage/listings/${market_listing_id}/withdraw`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '撤回中...',
    showError: true,
    errorPrefix: '撤回失败：'
  })
}

/**
 * 上架不可叠加物品到交易市 * POST /api/v4/market/list
 * 🔴 携带 Idempotency-Key 请求头防止重复上 *
 * @param params.item_instance_id - 物品实例ID（BIGINT * @param params.price_amount - 售价（BIGINT整数据 * @param params.price_asset_code - 定价币种（如 'DIAMOND' */
async function sellToMarket(params: {
  item_instance_id: number
  price_amount: number
  price_asset_code: string
}) {
  if (!params.item_instance_id) {
    throw new Error('物品实例ID不能为空')
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
      item_instance_id: params.item_instance_id,
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

/** 获取市场分类筛选数据- GET /api/v4/market/listings/facets（✅ 后端已确认实现） */
async function getMarketFacets() {
  return apiClient.request('/market/listings/facets', { method: 'GET', needAuth: true })
}

/**
 * 上架可叠加资产到交易市场
 * POST /api/v4/market/fungible-assets/list
 * 🔴 携带 Idempotency-Key 请求头防止重复上 * 业务规则: 资产必须 is_tradable = true（material_asset_types 表控制）
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

module.exports = {
  getMarketProducts,
  getMarketProductDetail,
  purchaseMarketProduct,
  withdrawMarketProduct,
  sellToMarket,
  getMyListingStatus,
  getMarketFacets,
  sellFungibleAssets
}

export { }

