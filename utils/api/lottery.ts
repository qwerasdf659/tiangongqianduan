/**
 * 抽奖系统API
 * 后端路由: routes/v4/lottery/
 *
 * @file 天工餐厅积分系统 - 抽奖API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/** 获取抽奖活动列表（通用查询）- GET /api/v4/lottery/campaigns */
async function getLotteryCampaigns(status: string = 'active') {
  const qs = buildQueryString({ status })
  return apiClient.request(`/lottery/campaigns?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取进行中的活动列表（专用端点） - GET /api/v4/lottery/campaigns/active */
async function getActiveCampaigns() {
  return apiClient.request('/lottery/campaigns/active', { method: 'GET', needAuth: true })
}

/** 获取抽奖奖品列表 - GET /api/v4/lottery/campaigns/:campaign_code/prizes */
async function getLotteryPrizes(campaign_code: string) {
  return apiClient.request(`/lottery/campaigns/${campaign_code}/prizes`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取抽奖配置 - GET /api/v4/lottery/campaigns/:campaign_code/config */
async function getLotteryConfig(campaign_code: string) {
  return apiClient.request(`/lottery/campaigns/${campaign_code}/config`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 执行抽奖 - POST /api/v4/lottery/draw
 *
 * 后端路由: routes/v4/lottery/draw.js
 * campaign_code 通过 Body 传参（非 URL 路径参数）
 * Idempotency-Key 通过 Header 必传（缺失返回 400 MISSING_IDEMPOTENCY_KEY）
 *
 * 响应: data.prizes[] 数组（单抽 length=1，连抽 length=N）
 *       data.remaining_balance 扣除后的可用积分
 *       data.total_points_cost / data.discount / data.saved_points 消费和折扣信息
 */
async function performLottery(campaign_code: string, draw_count: number = 1) {
  const idempotencyKey = `lottery_${campaign_code}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/lottery/draw', {
    method: 'POST',
    data: { campaign_code, draw_count },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey }
  })
}

/** 获取当前用户抽奖历史（JWT解析身份）- GET /api/v4/lottery/history */
async function getLotteryHistory(page: number = 1, limit: number = 20) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/lottery/history?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取当前用户抽奖维度统计 - GET /api/v4/lottery/statistics */
async function getLotteryUserStatistics() {
  return apiClient.request('/lottery/statistics', { method: 'GET', needAuth: true })
}

module.exports = {
  getLotteryCampaigns,
  getActiveCampaigns,
  getLotteryPrizes,
  getLotteryConfig,
  performLottery,
  getLotteryHistory,
  getLotteryUserStatistics
}
