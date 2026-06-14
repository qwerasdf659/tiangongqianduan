/**
 * 用户域 API（收货地址 CRUD）
 * 后端路由: routes/v4/user/addresses.js（挂载于 /api/v4/user，authenticateToken）
 *
 * 数据库表: user_addresses（AES-256-GCM 加密姓名/电话/详址虚拟字段 + 省市区明文 + is_default）
 * 字段命名一律 snake_case，前端直接使用后端字段，不做映射层。
 *
 * @file 天工平台 - 用户域API模块（收货地址）
 * @version 1.0.0
 * @since 2026-06-14（实物兑换发货链路：兑换前选/填收货地址）
 */

const { apiClient } = require('./client')

// ==================== 收货地址 ====================

/**
 * 获取当前用户收货地址列表
 * GET /api/v4/user/addresses
 *
 * 响应契约: data 本身即 UserAddress[] 数组（无 addresses/list/pagination 包裹，已线上实测确认）
 * 姓名/手机号默认脱敏，省市区+详址保留；后端按 JWT 中的 user_id 做数据隔离，仅返回本人地址
 */
async function getUserAddresses() {
  return apiClient.request('/user/addresses', {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 新增收货地址
 * POST /api/v4/user/addresses
 *
 * @param params - 地址字段（snake_case，与后端 user_addresses 一致）
 * @param params.receiver_name - 收货人姓名（后端 AES-256-GCM 加密存储）
 * @param params.receiver_phone - 收货人手机号（后端加密存储）
 * @param params.province - 省（明文）
 * @param params.city - 市（明文）
 * @param params.district - 区/县（明文）
 * @param params.detail_address - 详细地址（后端加密存储）
 * @param params.is_default - 是否设为默认地址
 */
async function createUserAddress(params: {
  receiver_name: string
  receiver_phone: string
  province: string
  city: string
  district: string
  detail_address: string
  is_default?: boolean
}) {
  return apiClient.request('/user/addresses', {
    method: 'POST',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '保存中...',
    showError: true,
    errorPrefix: '保存失败：'
  })
}

/**
 * 更新收货地址
 * PUT /api/v4/user/addresses/:address_id
 *
 * @param address_id - 地址主键（user_addresses.address_id）
 * @param params - 需更新的地址字段（snake_case）
 */
async function updateUserAddress(
  address_id: number,
  params: {
    receiver_name?: string
    receiver_phone?: string
    province?: string
    city?: string
    district?: string
    detail_address?: string
    is_default?: boolean
  }
) {
  if (!address_id) {
    throw new Error('地址ID不能为空')
  }
  return apiClient.request(`/user/addresses/${address_id}`, {
    method: 'PUT',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '保存中...',
    showError: true,
    errorPrefix: '保存失败：'
  })
}

/**
 * 删除收货地址
 * DELETE /api/v4/user/addresses/:address_id
 *
 * @param address_id - 地址主键
 */
async function deleteUserAddress(address_id: number) {
  if (!address_id) {
    throw new Error('地址ID不能为空')
  }
  return apiClient.request(`/user/addresses/${address_id}`, {
    method: 'DELETE',
    needAuth: true,
    showLoading: true,
    loadingText: '删除中...',
    showError: true,
    errorPrefix: '删除失败：'
  })
}

/**
 * 设为默认收货地址
 * PUT /api/v4/user/addresses/:address_id/default
 *
 * @param address_id - 地址主键
 */
async function setDefaultUserAddress(address_id: number) {
  if (!address_id) {
    throw new Error('地址ID不能为空')
  }
  return apiClient.request(`/user/addresses/${address_id}/default`, {
    method: 'PUT',
    needAuth: true,
    showLoading: true,
    loadingText: '设置中...',
    showError: true,
    errorPrefix: '设置失败：'
  })
}

module.exports = {
  getUserAddresses,
  createUserAddress,
  updateUserAddress,
  deleteUserAddress,
  setDefaultUserAddress
}
