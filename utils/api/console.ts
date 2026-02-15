/**
 * 🔧 管理员/控制台API
 * 后端路由: routes/v4/console/
 * 包含: 消费审核、管理员客服会话、管理员查看用户数据
 *
 * @file 天工餐厅积分系统 - 管理员API模块
 * @version 5.1.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 📋 消费审核 ====================

/** 获取待审核消费记录列表 - GET /api/v4/console/consumption/pending */
async function getPendingConsumption(params: { page?: number; page_size?: number } = {}) {
  const { page = 1, page_size = 20 } = params
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/console/consumption/pending?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载中...',
    showError: true
  })
}

/** 审核通过消费记录 - POST /api/v4/console/consumption/approve/:id */
async function approveConsumption(record_id: number, params: { admin_notes?: string } = {}) {
  if (!record_id) {
    throw new Error('消费记录ID不能为空')
  }
  return apiClient.request(`/console/consumption/approve/${record_id}`, {
    method: 'POST',
    data: { admin_notes: params.admin_notes || undefined },
    needAuth: true,
    showLoading: true,
    loadingText: '审核中...',
    showError: true,
    errorPrefix: '审核失败：'
  })
}

/** 审核拒绝消费记录 - POST /api/v4/console/consumption/reject/:id */
async function rejectConsumption(record_id: number, params: { admin_notes: string }) {
  if (!record_id) {
    throw new Error('消费记录ID不能为空')
  }
  if (!params || !params.admin_notes) {
    throw new Error('拒绝原因不能为空')
  }
  if (params.admin_notes.length < 5) {
    throw new Error('拒绝原因至少5个字符')
  }

  return apiClient.request(`/console/consumption/reject/${record_id}`, {
    method: 'POST',
    data: { admin_notes: params.admin_notes },
    needAuth: true,
    showLoading: true,
    loadingText: '处理中...',
    showError: true,
    errorPrefix: '拒绝失败：'
  })
}

// ==================== 👨‍💼 管理员客服 ====================

/** 获取管理员客服会话列表 - GET /api/v4/console/customer-service/sessions */
async function getAdminChatSessions(
  params: { page?: number; pageSize?: number; status?: string | null } = {}
) {
  const { page = 1, pageSize = 20, status = null } = params
  const qs = buildQueryString({
    page,
    limit: pageSize,
    status: status && status !== 'all' ? status : null
  })
  return apiClient.request(`/console/customer-service/sessions?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取管理员客服会话消息历史 - GET /api/v4/console/customer-service/sessions/:id/messages */
async function getAdminChatHistory(
  params: { sessionId?: number; page?: number; pageSize?: number } = {}
) {
  const { sessionId, page = 1, pageSize = 50 } = params
  if (!sessionId) {
    throw new Error('会话ID不能为空')
  }
  const qs = buildQueryString({ page, limit: pageSize })
  return apiClient.request(`/console/customer-service/sessions/${sessionId}/messages?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 关闭客服会话 - POST /api/v4/console/customer-service/sessions/:id/close */
async function closeAdminChatSession(session_id: number) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  return apiClient.request(`/console/customer-service/sessions/${session_id}/close`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '关闭会话中...',
    showError: true,
    errorPrefix: '关闭失败：'
  })
}

// ==================== 📊 管理员查看用户数据 ====================

/** 管理员查看指定用户消费积分二维码 - GET /api/v4/console/consumption/qrcode/:user_id */
async function getAdminUserQRCode(user_id: number) {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  if (!Number.isInteger(user_id) || user_id <= 0) {
    throw new Error('用户ID必须是正整数')
  }

  return apiClient.request(`/console/consumption/qrcode/${user_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '生成二维码中...',
    showError: true,
    errorPrefix: '二维码生成失败：'
  })
}

/** 管理员查看指定用户抽奖历史 - GET /api/v4/console/lottery-user-analysis/history/:user_id */
async function getAdminLotteryHistory(user_id: number, page: number = 1, limit: number = 20) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/console/lottery-user-analysis/history/${user_id}?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 管理员查看指定用户综合统计 - GET /api/v4/console/lottery-user-analysis/points/:user_id */
async function getAdminUserStatistics(user_id: number) {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  return apiClient.request(`/console/lottery-user-analysis/points/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 管理员查看指定用户抽奖维度统计 - GET /api/v4/console/lottery-user-analysis/statistics/:user_id */
async function getAdminLotteryUserStatistics(user_id: number) {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  return apiClient.request(`/console/lottery-user-analysis/statistics/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 📊 管理员客服统计 ====================

/**
 * 获取管理员客服会话统计
 * 后端API: GET /api/v4/console/customer-service/sessions/stats
 *
 * ⚠️ 路径注意: 后端实际路径是 /sessions/stats（在sessions子路由下）
 *    前端文档中曾写 /customer-service/stats，已对齐为后端实际路径
 *
 * @param admin_id - 可选，筛选指定客服的统计
 * @returns 统计数据（total_sessions, completed_sessions, avg_response_time, customer_satisfaction）
 */
async function getAdminSessionStats(admin_id?: number) {
  const qs = buildQueryString({ admin_id: admin_id || null })
  const url: string = qs
    ? `/console/customer-service/sessions/stats?${qs}`
    : '/console/customer-service/sessions/stats'
  return apiClient.request(url, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取管理员客服响应时长统计
 * 后端API: GET /api/v4/console/customer-service/sessions/response-stats?days=7
 *
 * @param days - 统计天数（默认7天）
 * @returns { summary, distribution, trend, admin_ranking }
 */
async function getAdminResponseStats(days: number = 7) {
  const qs = buildQueryString({ days })
  return apiClient.request(`/console/customer-service/sessions/response-stats?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

// ==================== 🟢 管理员在线状态 ====================

/**
 * 更新管理员在线状态
 * 后端API: POST /api/v4/console/customer-service/sessions/status
 *
 * ⚠️ 路径注意: 后端实际路径是 /sessions/status（在sessions子路由下）
 *    前端文档中曾写 /customer-service/status，已对齐为后端实际路径
 *
 * 状态存储在 Redis 中（key: cs:admin_status:{admin_id}），4小时自动过期
 *
 * @param status - 在线状态枚举值: 'online' | 'busy' | 'offline'
 * @returns { admin_id, status, updated_at }
 */
async function updateAdminOnlineStatus(status: 'online' | 'busy' | 'offline') {
  if (!status || !['online', 'busy', 'offline'].includes(status)) {
    throw new Error('在线状态必须是 online / busy / offline 之一')
  }
  return apiClient.request('/console/customer-service/sessions/status', {
    method: 'POST',
    data: { status },
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: '更新状态失败：'
  })
}

/**
 * 批量查询管理员在线状态
 * 后端API: GET /api/v4/console/customer-service/sessions/status?admin_ids=31,32
 *
 * 未设置或已过期的管理员视为 'offline'（Redis 4小时自动过期）
 *
 * @param admin_ids - 管理员ID数组（如 [31, 32]）
 * @returns data: [{ admin_id, status }]
 */
async function getAdminOnlineStatus(admin_ids: number[]) {
  if (!admin_ids || admin_ids.length === 0) {
    throw new Error('管理员ID列表不能为空')
  }
  const idsParam = admin_ids.join(',')
  return apiClient.request(`/console/customer-service/sessions/status?admin_ids=${idsParam}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  getPendingConsumption,
  approveConsumption,
  rejectConsumption,
  getAdminChatSessions,
  getAdminChatHistory,
  closeAdminChatSession,
  getAdminUserQRCode,
  getAdminLotteryHistory,
  getAdminUserStatistics,
  getAdminLotteryUserStatistics,
  getAdminSessionStats,
  getAdminResponseStats,
  updateAdminOnlineStatus,
  getAdminOnlineStatus
}

export {}
