/**
 * 消费积分系统 + 核销API
 * 用户端路由: routes/v4/user/consumption/（QR码生成，所有已登录用户）
 * 商家端路由: routes/v4/shop/consumption/（扫码获取用户信息、提交消费）
 * 核销路由: routes/v4/shop/redemption/
 *
 * @file 天工餐厅积分系统 - 消费与核销API模块
 * @version 5.3.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 用户端消====================

/**
 * 获取当前用户消费积分二维码 - GET /api/v4/user/consumption/qrcode
 *
 * DB-3修复后路径变更：/shop/consumption/qrcode → /user/consumption/qrcode
 * 所有已登录用户（含普通用户、商家员工、管理员）统一使用此端点
 * 响应字段: qr_code, user_id, user_uuid, nonce, expires_at, generated_at, validity, algorithm
 */
async function getUserQRCode() {
  return apiClient.request('/user/consumption/qrcode', {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '生成二维码中...',
    showError: true,
    errorPrefix: '二维码生成失败：'
  })
}

/** 获取当前用户的消费记?- GET /api/v4/shop/consumption/me */
async function getMyConsumptionRecords(
  params: { page?: number; page_size?: number; status?: string | null } = {}
) {
  const { page = 1, page_size = 20, status = null } = params
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/shop/consumption/me?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取单条消费记录详情 - GET /api/v4/shop/consumption/detail/:id */
async function getConsumptionDetail(record_id: number) {
  return apiClient.request(`/shop/consumption/detail/${record_id}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 商家端消====================

/**
 * 根据V2动态二维码获取用户信息（商家扫码后调用户 * GET /api/v4/shop/consumption/user-info?qr_code=xxx&store_id=xxx
 */
async function getUserInfoByQRCode(qr_code: string, store_id?: number) {
  if (!qr_code) {
    throw new Error('二维码不能为空')
  }
  if (!qr_code.startsWith('QRV2_')) {
    throw new Error('无效的二维码格式，请让用户刷新二维码')
  }

  const qs = buildQueryString({ qr_code, store_id })
  return apiClient.request(`/shop/consumption/user-info?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '获取用户信息中...',
    showError: true,
    errorPrefix: '获取用户信息失败：'
  })
}

/** 消费提交参数 */
interface SubmitConsumptionParams {
  qr_code: string
  consumption_amount: number
  store_id?: number
  merchant_notes?: string
}

/**
 * 商家提交消费记录（V2动态码 + 幂等键）
 * POST /api/v4/shop/consumption/submit
 */
async function submitConsumption(params: SubmitConsumptionParams) {
  if (!params || typeof params !== 'object') {
    throw new Error('参数格式错误')
  }
  if (!params.qr_code) {
    throw new Error('二维码不能为空')
  }
  if (!params.consumption_amount || params.consumption_amount <= 0) {
    throw new Error('消费金额必须大于0')
  }
  if (params.consumption_amount > 99999.99) {
    throw new Error('消费金额不能超过99999.99元')
  }
  if (params.merchant_notes && params.merchant_notes.length > 500) {
    throw new Error('商家备注不能超过500字')
  }

  const idempotencyKey: string = `consumption_submit_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

  return apiClient.request('/shop/consumption/submit', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: {
      qr_code: params.qr_code,
      consumption_amount: parseFloat(String(params.consumption_amount)),
      store_id: params.store_id || undefined,
      merchant_notes: params.merchant_notes || undefined
    },
    needAuth: true,
    showLoading: true,
    loadingText: '提交中...',
    showError: true,
    errorPrefix: '提交失败：'
  })
}

/** 商家查询门店消费记录 - GET /api/v4/shop/consumption/merchant/list */
async function getMerchantConsumptions(params: { page?: number; page_size?: number } = {}) {
  const { page = 1, page_size = 20 } = params
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/shop/consumption/merchant/list?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 商家门店消费统计 - GET /api/v4/shop/consumption/merchant/stats */
async function getMerchantConsumptionStats() {
  return apiClient.request('/shop/consumption/merchant/stats', { method: 'GET', needAuth: true })
}

// ==================== 商家核销 ====================

/** 商家创建核销订单 - POST /api/v4/shop/redemption/orders（需商家权限?*/
async function createRedemptionOrder(params: Record<string, any>) {
  return apiClient.request('/shop/redemption/orders', {
    method: 'POST',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '创建核销订单中...',
    showError: true,
    errorPrefix: '创建失败：'
  })
}

/**
 * 商家核销用户物品 - POST /api/v4/shop/redemption/fulfill
 * 需要商家权role_level>=20)
 */
async function fulfillRedemption(params: { redeem_code: string; store_id?: number }) {
  if (!params || !params.redeem_code) {
    throw new Error('核销码不能为空')
  }

  return apiClient.request('/shop/redemption/fulfill', {
    method: 'POST',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '核销中...',
    showError: true,
    errorPrefix: '核销失败：'
  })
}

module.exports = {
  getUserQRCode,
  getMyConsumptionRecords,
  getConsumptionDetail,
  getUserInfoByQRCode,
  submitConsumption,
  getMerchantConsumptions,
  getMerchantConsumptionStats,
  createRedemptionOrder,
  fulfillRedemption
}

export {}
