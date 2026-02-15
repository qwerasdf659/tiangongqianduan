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
  getExchangeOrderDetail
}

export {}
