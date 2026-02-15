/**
 * 🎰 抽奖系统API
 * 后端路由: routes/v4/lottery/
 *
 * @file 天工餐厅积分系统 - 抽奖API模块
 * @version 5.1.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/** 获取抽奖活动列表（通用查询） - GET /api/v4/lottery/campaigns */
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

/** 执行抽奖 - POST /api/v4/lottery/draw（携带幂等键） */
async function performLottery(campaign_code: string, draw_count: number = 1) {
  const idempotencyKey = `lottery_${campaign_code}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/lottery/draw', {
    method: 'POST',
    data: { campaign_code, draw_count },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey }
  })
}

/** 获取当前用户抽奖历史（JWT解析身份） - GET /api/v4/lottery/history */
async function getLotteryHistory(page: number = 1, limit: number = 20) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/lottery/history?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取当前用户综合统计 - GET /api/v4/lottery/points */
async function getUserStatistics() {
  return apiClient.request('/lottery/points', { method: 'GET', needAuth: true })
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
  getUserStatistics,
  getLotteryUserStatistics
}

export {}
