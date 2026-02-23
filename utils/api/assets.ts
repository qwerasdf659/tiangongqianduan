/**
 * 资产系统API
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

/**
 * 获取今日资产汇总 - GET /api/v4/assets/today-summary
 *
 * 后端路由: routes/v4/assets/today-summary.js（决策D-1新增，资产域通用接口）
 * 后端服务: AssetQueryService.getTodaySummary({ user_id, asset_code })
 *
 * 响应字段:
 *   asset_code: 资产代码（如 'POINTS'）
 *   today_earned: 今日获得总额（delta_amount > 0 的交易合计）
 *   today_consumed: 今日消费总额（delta_amount < 0 的交易绝对值合计）
 *   transaction_count: 今日交易笔数
 *
 * 支持任意 asset_code（POINTS/DIAMOND/red_shard 等），前端只需更换查询参数
 *
 * @param asset_code - 资产代码，默认 'POINTS'（普通积分）
 */
async function getTodaySummary(asset_code: string = 'POINTS') {
  const qs = buildQueryString({ asset_code })
  return apiClient.request(`/assets/today-summary?${qs}`, { method: 'GET', needAuth: true })
}

module.exports = {
  getPointsBalance,
  getPointsTransactions,
  getAssetBalances,
  getConversionRules,
  getTodaySummary
}
