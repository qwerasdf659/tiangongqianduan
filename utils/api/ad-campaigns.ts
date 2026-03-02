/**
 * 广告系统API - 广告主自助投放 + 广告事件上报
 * 后端路由: routes/v4/user/ad-campaigns、routes/v4/system/ad-events
 *
 * P2: 广告主自助创建/管理广告（API 7-13）
 * P3: 广告曝光/点击事件上报（API 5-6）
 *
 * 状态流转: draft → pending_review → approved/rejected → active → completed/cancelled
 * 计费模式: fixed_daily（固定包天） / bidding（竞价排名） / cpm（CPM曝光计费）
 *
 * @file 天工餐厅积分系统 - 广告系统API模块
 * @version 5.2.0
 * @since 2026-02-19
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 广告主端（P2: 用户自助操作） ====================

/**
 * [API 7] 获取我的广告活动列表 - GET /api/v4/user/ad-campaigns
 * @param params.status - 筛选状态: draft/pending_review/approved/active/paused/completed/rejected/cancelled（不传返回全部）
 * @param params.page - 页码（默认1）
 * @param params.limit - 每页数量（默认20）
 */
async function getMyAdCampaigns(params: { status?: string; page?: number; limit?: number } = {}) {
  const qs = buildQueryString({
    status: params.status || undefined,
    page: params.page || 1,
    limit: params.limit || 20
  })
  return apiClient.request(`/user/ad-campaigns?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * [API 8] 创建广告活动 - POST /api/v4/user/ad-campaigns
 *
 * 业务规则:
 *   fixed_daily模式: 必须传 fixed_days，总价 = daily_price_diamond × fixed_days（后端计算）
 *   bidding模式: 必须传 daily_bid_diamond(≥50) + budget_total_diamond(≥500)
 *
 * @param campaignData - 广告计划数据
 */
async function createAdCampaign(campaignData: API.CreateAdCampaignParams) {
  if (!campaignData.campaign_name) {
    throw new Error('广告活动名称不能为空')
  }
  if (!campaignData.ad_slot_id) {
    throw new Error('请选择广告位')
  }
  if (!campaignData.billing_mode) {
    throw new Error('请选择计费模式')
  }

  return apiClient.request('/user/ad-campaigns', {
    method: 'POST',
    data: campaignData,
    needAuth: true,
    loadingText: '创建广告活动中...'
  })
}

/**
 * [API 9] 获取广告活动详情 - GET /api/v4/user/ad-campaigns/:id
 * 返回活动完整信息，含素材列表和计费记录
 * @param campaignId - 广告计划ID
 */
async function getAdCampaignDetail(campaignId: number) {
  if (!campaignId) {
    throw new Error('广告活动ID不能为空')
  }
  return apiClient.request(`/user/ad-campaigns/${campaignId}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * [API 10] 更新广告活动（仅 draft 状态可编辑）- PUT /api/v4/user/ad-campaigns/:id
 * @param campaignId - 广告计划ID
 * @param updateData - 更新数据（与创建字段相同）
 */
async function updateAdCampaign(
  campaignId: number,
  updateData: Partial<API.CreateAdCampaignParams>
) {
  if (!campaignId) {
    throw new Error('广告活动ID不能为空')
  }
  return apiClient.request(`/user/ad-campaigns/${campaignId}`, {
    method: 'PUT',
    data: updateData,
    needAuth: true,
    loadingText: '更新广告活动中...'
  })
}

/**
 * [API 11] 提交广告活动审核 - POST /api/v4/user/ad-campaigns/:id/submit
 *
 * 提交时后端自动冻结钻石:
 *   fixed_daily模式: 冻结 daily_price_diamond × fixed_days 钻石
 *   bidding模式: 冻结首日出价钻石
 * 余额不足时返回400错误
 *
 * @param campaignId - 广告计划ID
 */
async function submitAdCampaign(campaignId: number) {
  if (!campaignId) {
    throw new Error('广告活动ID不能为空')
  }
  return apiClient.request(`/user/ad-campaigns/${campaignId}/submit`, {
    method: 'POST',
    needAuth: true,
    loadingText: '提交审核中...'
  })
}

/**
 * [API 12] 取消广告活动 - POST /api/v4/user/ad-campaigns/:id/cancel
 * 冻结的钻石自动退回用户账户，状态变为 cancelled
 * @param campaignId - 广告计划ID
 */
async function cancelAdCampaign(campaignId: number) {
  if (!campaignId) {
    throw new Error('广告活动ID不能为空')
  }
  return apiClient.request(`/user/ad-campaigns/${campaignId}/cancel`, {
    method: 'POST',
    needAuth: true,
    loadingText: '取消广告活动中...'
  })
}

/**
 * [API 13] 获取广告活动数据报表 - GET /api/v4/user/ad-campaigns/:id/report
 * 返回曝光数、点击数、消耗钻石等统计数据
 * @param campaignId - 广告计划ID
 * @param params.start_date - 报表起始日期 YYYY-MM-DD（可选）
 * @param params.end_date - 报表结束日期 YYYY-MM-DD（可选）
 */
async function getAdCampaignReport(
  campaignId: number,
  params: { start_date?: string; end_date?: string } = {}
) {
  if (!campaignId) {
    throw new Error('广告活动ID不能为空')
  }
  const qs = buildQueryString(params)
  const url = qs
    ? `/user/ad-campaigns/${campaignId}/report?${qs}`
    : `/user/ad-campaigns/${campaignId}/report`
  return apiClient.request(url, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 广告事件上报（P3: 广告曝光/点击） ====================

/**
 * [API 5] 上报广告曝光事件 - POST /api/v4/system/ad-events/impression
 * 仅 user_ad 类型广告需要上报（运营内容由 show-log 接口处理）
 * 后端进行反作弊检查，无效曝光返回400
 *
 * @param data.ad_campaign_id - 广告活动ID（必填，后端弹窗/轮播数据中附带）
 * @param data.ad_slot_id - 广告位ID（必填）
 */
async function reportAdImpression(data: { ad_campaign_id: number; ad_slot_id: number }) {
  if (!data.ad_campaign_id || !data.ad_slot_id) {
    throw new Error('广告曝光上报参数不完整')
  }
  return apiClient.request('/system/ad-events/impression', {
    method: 'POST',
    data,
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * [API 6] 上报广告点击事件 - POST /api/v4/system/ad-events/click
 * 用户点击广告跳转后上报，后端记录并进行归因追踪
 *
 * @param data.ad_campaign_id - 广告活动ID（必填）
 * @param data.ad_slot_id - 广告位ID（必填）
 * @param data.click_target - 跳转目标URL（记录用户实际跳转到了哪里）
 */
async function reportAdClick(data: {
  ad_campaign_id: number
  ad_slot_id: number
  click_target?: string
}) {
  if (!data.ad_campaign_id || !data.ad_slot_id) {
    throw new Error('广告点击上报参数不完整')
  }
  return apiClient.request('/system/ad-events/click', {
    method: 'POST',
    data,
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

// ==================== 广告位查询 ====================

/**
 * 获取可投放的广告位列表（用户端 — 创建广告时选择广告位）
 * 后端API: GET /api/v4/user/ad-slots
 * 实现文件: routes/v4/user/ad-slots.js
 *
 * 后端仅返回 is_active=true 的广告位，含日价、最低竞价、最大展示数等配置
 * 认证方式: authenticateToken（JWT Bearer Token，普通用户可调用）
 *
 * @param params.slot_type - 可选筛选，仅允许 popup / carousel（传无效值返回 HTTP 400）
 * @param params.position - 可选筛选，如 home / lottery / profile
 *
 * 响应格式: { success, data: { slots: AdSlot[], total: number } }
 */
async function getAvailableAdSlots(params: { slot_type?: string; position?: string } = {}) {
  const qs = buildQueryString({
    slot_type: params.slot_type || undefined,
    position: params.position || undefined
  })
  const url = qs ? `/user/ad-slots?${qs}` : '/user/ad-slots'
  return apiClient.request(url, {
    method: 'GET',
    needAuth: true,
    showLoading: false
  })
}

// ==================== 广告定价预览 ====================

/**
 * 获取广告投放价格预览（含DAU系数 + 阶梯折扣）
 * 后端API: GET /api/v4/user/ad-pricing/preview
 *
 * 前端在用户输入投放天数时调用此接口获取真实定价
 * 后端计算: actual_daily_price = max(base_price × dau_coefficient, min_daily_price) × discount
 *
 * @param params.ad_slot_id - 广告位ID（必填）
 * @param params.days - 投放天数（fixed_daily模式，必填）
 * @param params.billing_mode - 计费模式（可选，默认 fixed_daily）
 */
async function getAdPricingPreview(params: {
  ad_slot_id: number
  days: number
  billing_mode?: string
}) {
  if (!params.ad_slot_id || !params.days) {
    throw new Error('广告位ID和投放天数不能为空')
  }
  const qs = buildQueryString({
    ad_slot_id: params.ad_slot_id,
    days: params.days,
    billing_mode: params.billing_mode || 'fixed_daily'
  })
  return apiClient.request(`/user/ad-pricing/preview?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  getMyAdCampaigns,
  createAdCampaign,
  getAdCampaignDetail,
  updateAdCampaign,
  submitAdCampaign,
  cancelAdCampaign,
  getAdCampaignReport,
  reportAdImpression,
  reportAdClick,
  getAvailableAdSlots,
  getAdPricingPreview
}
