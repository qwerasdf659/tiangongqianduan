/**
 * 💰 资产系统API
 * 后端路由: routes/v4/assets/（通过Token识别用户 *
 * @file 天工餐厅积分系统 - 资产API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/**
 * 获取当前用户积分余额 - GET /api/v4/assets/balance
 * 响应字段: asset_code, available_amount, frozen_amount, total_amount
 */
async function getPointsBalance(asset_code: string = 'POINTS') {
  const qs = buildQueryString({ asset_code })
  return apiClient.request(`/assets/balance?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取用户资产流水 - GET /api/v4/assets/transactions */
async function getPointsTransactions(
  page: number = 1,
  page_size: number = 20,
  asset_code: string | null = null,
  business_type: string | null = null
) {
  const qs = buildQueryString({ page, page_size, asset_code, business_type })
  return apiClient.request(`/assets/transactions?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取多种资产余额明细 - GET /api/v4/assets/balances */
async function getAssetBalances() {
  return apiClient.request('/assets/balances', { method: 'GET', needAuth: true })
}

/** 获取资产转换规则 - GET /api/v4/assets/conversion-rules */
async function getConversionRules() {
  return apiClient.request('/assets/conversion-rules', { method: 'GET', needAuth: true })
}

module.exports = { getPointsBalance, getPointsTransactions, getAssetBalances, getConversionRules }

export {}
