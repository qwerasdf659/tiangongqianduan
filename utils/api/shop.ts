/**
 * 消费积分系统 + 核销API
 * 用户端路由: routes/v4/user/consumption/（QR码生成，所有已登录用户）
 * 商家端路由: routes/v4/shop/consumption/（扫码获取用户信息、提交消费）
 * 核销路由: routes/v4/shop/redemption/
 *
 * @file 天工餐厅积分系统 - 消费与核销API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString, generateIdempotencyKey } = require('../util')

// ==================== 用户端消费 ====================

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

/** 获取当前用户的消费记录 - GET /api/v4/shop/consumption/me */
async function getMyConsumptionRecords(
  params: { page?: number; page_size?: number; status?: string | null } = {}
) {
  const { page = 1, page_size = 20, status = null } = params
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/shop/consumption/me?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 获取单条消费记录详情 - GET /api/v4/shop/consumption/detail/:id
 *
 * 后端路由: routes/v4/shop/consumption/query.js 第86行
 * 服务层: ConsumptionQueryService.getConsumptionDetailWithAuth(recordId, userId, isAdmin, options)
 * 数据库: consumption_records 表（当前48条真实数据）
 *
 * 注意: 路径参数名是 :id（不是 :record_id）
 * 权限: 支持三种身份 — 记录所有者(user_owner)、关联商家(merchant_owner)、管理员(admin_privilege)
 *
 * ⚠️ 需后端确认: Service 层是否通过 store_id JOIN stores 表返回 store_name
 *    前端详情页需要展示门店名称
 */
async function getConsumptionDetail(record_id: number) {
  return apiClient.request(`/shop/consumption/detail/${record_id}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 商家端消费 ====================

/**
 * 根据V2动态二维码获取用户信息（商家扫码后调用）
 * GET /api/v4/shop/consumption/user-info?qr_code=xxx&store_id=xxx
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

  const idempotencyKey: string = await generateIdempotencyKey('consumption_submit')

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

/**
 * 用户创建核销订单（为自己的物品生成核销码）- POST /api/v4/shop/redemption/orders
 *
 * ⚠️ 业务澄清: 是用户自己为自己的物品生成核销码，不是商家为用户创建
 * req.user.user_id 作为 creator_user_id
 *
 * 请求Body: 仅需 { item_id: number }（item_id 必须是正整数）
 * 返回: 12位Base32格式核销码 XXXX-YYYY-ZZZZ（仅返回一次，系统不存储明文，只存SHA-256哈希）
 * 有效期: 30天（expires_at 字段标记过期时间）
 * 防重复: 依赖 code_hash 唯一约束（SHA-256），当前路由未读取 Header 幂等键
 *
 * Idempotency-Key 仍通过 Header 发送（符合 HTTP 标准实践，待后端补充读取逻辑）
 */
async function createRedemptionOrder(item_id: number) {
  if (!item_id || item_id <= 0 || !Number.isInteger(item_id)) {
    throw new Error('物品ID必须是正整数')
  }

  const idempotencyKey: string = await generateIdempotencyKey('redemption_create')

  return apiClient.request('/shop/redemption/orders', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: { item_id },
    needAuth: true,
    showLoading: true,
    loadingText: '生成核销码中...',
    showError: true,
    errorPrefix: '生成失败：'
  })
}

/**
 * 商家核销用户物品 - POST /api/v4/shop/redemption/fulfill
 * 需要商家权限（role_level>=20）
 */
async function fulfillRedemption(params: { redeem_code: string; store_id?: number }) {
  if (!params || !params.redeem_code) {
    throw new Error('核销码不能为空')
  }

  const idempotencyKey: string = await generateIdempotencyKey('redemption_fulfill')

  return apiClient.request('/shop/redemption/fulfill', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '核销中...',
    showError: true,
    errorPrefix: '核销失败：'
  })
}

/**
 * 商家扫描QR码核销 - POST /api/v4/shop/redemption/scan
 *
 * 解析 RQRV1_ 前缀的动态QR码内容，验证HMAC签名后执行核销。
 * 与 fulfillRedemption 区别：
 *   - fulfillRedemption: 手动输入12位Base32文本码（备用方式）
 *   - scanRedemptionQR:  扫描动态QR码（主要方式，含签名验证）
 *
 * 两个接口共用后端 RedemptionService.fulfillOrder()，区别在于入参来源。
 *
 * 后端服务: RedemptionQRSigner.js 验签 → RedemptionService.fulfillOrder() 核销
 * 权限要求: role_level >= 20（商家店员及以上）+ store_staff 活跃绑定校验
 *
 * 请求参数:
 *   qr_content - 扫码获取的完整QR码字符串（RQRV1_前缀）
 *   store_id   - 门店ID（多门店商家必填，单门店自动识别）
 *
 * 响应格式（同 fulfillRedemption，三表模型迁移后 item_instance → item）:
 *   order:    { redemption_order_id, fulfilled_at, fulfilled_store_id, fulfilled_by_staff_id }
 *   item:     { item_id, item_name, status }（原 item_instance 字段）
 *   redeemer: { user_id, nickname }
 *   store:    { store_id, store_name }
 *
 * @param params.qr_content - RQRV1_ 前缀的QR码完整内容
 * @param params.store_id - 门店ID（可选，多门店场景必填）
 */
async function scanRedemptionQR(params: { qr_content: string; store_id?: number }) {
  if (!params || !params.qr_content) {
    throw new Error('QR码内容不能为空')
  }
  if (!params.qr_content.startsWith('RQRV1_')) {
    throw new Error('无效的核销QR码格式，请确认扫描的是核销二维码')
  }

  const idempotencyKey: string = await generateIdempotencyKey('redemption_scan')

  return apiClient.request('/shop/redemption/scan', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
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
  fulfillRedemption,
  scanRedemptionQR
}
