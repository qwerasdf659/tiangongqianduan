/**
 * 🏪 交易市场API
 * 后端路由: routes/v4/market/
 *
 * @file 天工餐厅积分系统 - 交易市场API模块
 * @version 5.1.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/** 获取交易市场商品列表 - GET /api/v4/market/listings */
async function getMarketProducts(
  page: number = 1,
  limit: number = 20,
  min_price: number | null = null,
  max_price: number | null = null
) {
  const qs = buildQueryString({ page, limit, min_price, max_price })
  return apiClient.request(`/market/listings?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取市场商品详情 - GET /api/v4/market/listings/:market_listing_id */
async function getMarketProductDetail(market_listing_id: number) {
  return apiClient.request(`/market/listings/${market_listing_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 购买市场商品 - POST /api/v4/market/listings/:market_listing_id/purchase */
async function purchaseMarketProduct(market_listing_id: number) {
  return apiClient.request(`/market/listings/${market_listing_id}/purchase`, {
    method: 'POST',
    needAuth: true
  })
}

/** 撤回市场挂单 - POST /api/v4/market/manage/listings/:market_listing_id/withdraw */
async function withdrawMarketProduct(market_listing_id: number) {
  return apiClient.request(`/market/manage/listings/${market_listing_id}/withdraw`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 上架物品到交易市场 - POST /api/v4/market/list
 * 🔴 携带 Idempotency-Key 防止重复上架
 */
async function sellToMarket(params: {
  item_instance_id: number
  price_amount: number
  price_asset_code: string
  condition?: string
}) {
  const idempotencyKey = `market_list_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/market/list', {
    method: 'POST',
    data: params,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '上架中...',
    showError: true,
    errorPrefix: '上架失败：'
  })
}

/** 查询我的挂单状态 - GET /api/v4/market/listing-status */
async function getMyListingStatus() {
  return apiClient.request('/market/listing-status', { method: 'GET', needAuth: true })
}

/** 获取市场分类筛选数据 - GET /api/v4/market/listings/facets */
async function getMarketFacets() {
  return apiClient.request('/market/listings/facets', { method: 'GET', needAuth: true })
}

/** 上架可叠加资产到交易市场 - POST /api/v4/market/fungible-assets/list */
async function sellFungibleAssets(params: Record<string, any>) {
  const idempotencyKey = `market_fungible_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/market/fungible-assets/list', {
    method: 'POST',
    data: params,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey }
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

export {}
