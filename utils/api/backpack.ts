/**
 * 🎒 背包系统 + 🎁 兑换系统API
 * 后端路由: routes/v4/backpack/（双轨结构: assets[] + items[]）
 * 兑换路由: routes/v4/backpack/exchange/（用户域）
 *
 * @file 天工餐厅积分系统 - 背包与兑换API模块
 * @version 5.1.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 🎒 背包 ====================

/** 获取用户背包 - GET /api/v4/backpack/ */
async function getUserInventory() {
  return apiClient.request('/backpack', { method: 'GET', needAuth: true })
}

/** 获取背包统计 - GET /api/v4/backpack/stats */
async function getBackpackStats() {
  return apiClient.request('/backpack/stats', { method: 'GET', needAuth: true })
}

/** 获取物品详情 - GET /api/v4/backpack/items/:item_instance_id */
async function getInventoryItem(item_instance_id: number) {
  return apiClient.request(`/backpack/items/${item_instance_id}`, { method: 'GET', needAuth: true })
}

/** 使用物品 - POST /api/v4/backpack/items/:item_instance_id/use */
async function useInventoryItem(item_instance_id: number) {
  return apiClient.request(`/backpack/items/${item_instance_id}/use`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 生成核销码（到店出示，商家扫码核销）
 * POST /api/v4/backpack/items/:item_instance_id/redeem
 */
async function redeemInventoryItem(item_instance_id: number) {
  return apiClient.request(`/backpack/items/${item_instance_id}/redeem`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '生成核销码中...',
    showError: true,
    errorPrefix: '生成失败：'
  })
}

// ==================== 🎁 兑换 ====================

/** 获取兑换商品列表 - GET /api/v4/backpack/exchange/items */
async function getExchangeProducts(
  space: string | null = null,
  category: string | null = null,
  page: number = 1,
  limit: number = 20
) {
  const qs = buildQueryString({ page, limit, space, category })
  return apiClient.request(`/backpack/exchange/items?${qs}`, { method: 'GET', needAuth: true })
}

/** 兑换商品 - POST /api/v4/backpack/exchange/ */
async function exchangeProduct(product_id: number, quantity: number = 1) {
  return apiClient.request('/backpack/exchange', {
    method: 'POST',
    data: { product_id, quantity },
    needAuth: true
  })
}

/** 获取兑换订单记录 - GET /api/v4/backpack/exchange/orders */
async function getExchangeRecords(
  page: number = 1,
  limit: number = 20,
  status: string | null = null
) {
  const qs = buildQueryString({ page, limit, status })
  return apiClient.request(`/backpack/exchange/orders?${qs}`, { method: 'GET', needAuth: true })
}

/** 取消兑换订单 - POST /api/v4/backpack/exchange/orders/:order_id/cancel */
async function cancelExchange(order_id: string) {
  return apiClient.request(`/backpack/exchange/orders/${order_id}/cancel`, {
    method: 'POST',
    needAuth: true
  })
}

/** 获取兑换商品详情 - GET /api/v4/backpack/exchange/items/:exchange_item_id */
async function getExchangeItemDetail(exchange_item_id: string) {
  return apiClient.request(`/backpack/exchange/items/${exchange_item_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取兑换订单详情 - GET /api/v4/backpack/exchange/orders/:order_no */
async function getExchangeOrderDetail(order_no: string) {
  return apiClient.request(`/backpack/exchange/orders/${order_no}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 🌟 臻选空间（高级兑换） ====================

/**
 * 查询臻选空间解锁状态
 * 后端API: GET /api/v4/backpack/exchange/premium-status
 *
 * 业务规则:
 *   - 100积分解锁费用
 *   - 历史积分10万门槛
 *   - 24小时有效期
 *
 * @returns { is_unlocked: boolean, unlock_expires_at?: string, required_total_points: number, current_total_points: number, unlock_cost: number }
 */
async function getPremiumStatus() {
  return apiClient.request('/backpack/exchange/premium-status', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 解锁臻选空间
 * 后端API: POST /api/v4/backpack/exchange/unlock-premium
 *
 * 业务规则:
 *   - 扣除100积分
 *   - 需历史积分达到10万门槛
 *   - 解锁后24小时有效
 *
 * @returns { is_unlocked: true, unlock_expires_at: string, points_deducted: number, remaining_points: number }
 */
async function unlockPremium() {
  return apiClient.request('/backpack/exchange/unlock-premium', {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '解锁中...',
    showError: true,
    errorPrefix: '解锁失败：'
  })
}

// ==================== 🎯 竞价系统（bid域） ====================

/**
 * 获取竞价商品列表
 * 后端API: GET /api/v4/backpack/bid/products
 *
 * 业务说明:
 *   - 返回当前处于 active 状态的竞价商品
 *   - 竞价商品关联 exchange_items 记录
 *   - 竞价使用 DIAMOND（钻石）或 red_shard（红色碎片）等可交易资产
 *
 * @param page - 页码（默认1）
 * @param limit - 每页数量（默认20）
 * @param status - 竞价状态筛选（可选: active/pending/settled/cancelled）
 * @returns { products: BidProduct[], total: number, page: number, limit: number }
 */
async function getBidProducts(page: number = 1, limit: number = 20, status: string | null = null) {
  const qs = buildQueryString({ page, limit, status })
  return apiClient.request(`/backpack/bid/products?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取竞价商品详情
 * 后端API: GET /api/v4/backpack/bid/products/:bid_product_id
 *
 * 业务说明:
 *   - 返回竞价商品详细信息（含当前最高出价、出价记录等）
 *   - 7态状态机: pending → active → settled/no_bid/cancelled
 *
 * @param bid_product_id - 竞价商品ID
 * @returns BidProductDetail
 */
async function getBidProductDetail(bid_product_id: number) {
  if (!bid_product_id) {
    throw new Error('竞价商品ID不能为空')
  }
  return apiClient.request(`/backpack/bid/products/${bid_product_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载竞价详情...',
    showError: true,
    errorPrefix: '获取详情失败：'
  })
}

/**
 * 提交竞价出价
 * 后端API: POST /api/v4/backpack/bid
 *
 * 业务流程（后端 placeBid 完整流程）:
 *   1. 资产白名单校验（仅 DIAMOND/red_shard 等 is_tradable 资产可用）
 *   2. 悲观锁定竞价商品
 *   3. 金额校验（≥ 当前最高价 + 最小加价幅度）
 *   4. 旧冻结解冻（如果用户之前出过价）
 *   5. 新金额冻结
 *   6. 更新出价记录（含幂等键防重复）
 *   7. 更新最高价
 *
 * @param bid_product_id - 竞价商品ID
 * @param bid_amount - 出价金额
 * @param asset_code - 竞价使用的资产类型（默认 DIAMOND）
 * @returns { bid_record_id, bid_amount, frozen_amount, message }
 */
async function placeBid(
  bid_product_id: number,
  bid_amount: number,
  asset_code: string = 'DIAMOND'
) {
  if (!bid_product_id) {
    throw new Error('竞价商品ID不能为空')
  }
  if (!bid_amount || bid_amount <= 0) {
    throw new Error('出价金额必须大于0')
  }
  return apiClient.request('/backpack/bid', {
    method: 'POST',
    data: { bid_product_id, bid_amount, asset_code },
    needAuth: true,
    showLoading: true,
    loadingText: '提交竞价中...',
    showError: true,
    errorPrefix: '竞价失败：'
  })
}

/**
 * 获取用户竞价历史
 * 后端API: GET /api/v4/backpack/bid/history
 *
 * 业务说明:
 *   - 返回当前用户的所有竞价记录
 *   - 包含出价金额、冻结流水、竞价状态等
 *
 * @param page - 页码（默认1）
 * @param limit - 每页数量（默认20）
 * @returns { records: BidRecord[], total: number }
 */
async function getBidHistory(page: number = 1, limit: number = 20) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/backpack/bid/history?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  getUserInventory,
  getBackpackStats,
  getInventoryItem,
  useInventoryItem,
  redeemInventoryItem,
  getExchangeProducts,
  exchangeProduct,
  getExchangeRecords,
  cancelExchange,
  getExchangeItemDetail,
  getExchangeOrderDetail,
  getPremiumStatus,
  unlockPremium,
  // 竞价系统
  getBidProducts,
  getBidProductDetail,
  placeBid,
  getBidHistory
}

export { }

