/**
 * 🔧 管理）控制台API
 * 后端路由: routes/v4/console/
 * 包含: 消费审核、管理员客服会话、管理员查看用户数据
 *
 * @file 天工餐厅积分系统 - 管理员API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 📋 消费审核 ====================

/** 获取待审核消费记录列表?- GET /api/v4/console/consumption/pending */
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

// ==================== 📦 批量审核 ====================

/** 批量审核请求参数 */
interface BatchReviewParams {
  /** 消费记录ID数组，最多100条 */
  record_ids: number[]
  /** 审核动作：approve=通过 reject=拒绝 */
  action: 'approve' | 'reject'
  /** 拒绝原因（action=reject时必填，5-500字符） */
  reason?: string
  /** 幂等键（防止重复提交，可选） */
  idempotency_key?: string
}

/**
 * 批量审核消费记录 - POST /api/v4/console/consumption/batch-review
 *
 * 后端路由: routes/v4/console/consumption.js (第244行)
 * 服务: ConsumptionBatchService.batchReview()
 * 权限: admin (role_level >= 100)
 *
 * 特性:
 *   - 每条记录独立事务，单条失败不影响其他
 *   - 支持幂等键防止重复提交
 *   - approve 时自动发放积分
 *   - 自动记录审计日志
 *
 * 响应格式:
 *   data.stats: { total, success_count, failed_count, skipped_count }
 *   data.processed: { success[], failed[], skipped[] }
 *   data.operation_id: 操作批次ID
 */
async function batchReviewConsumption(params: BatchReviewParams) {
  if (!params || !params.record_ids || params.record_ids.length === 0) {
    throw new Error('请选择要审核的记录')
  }
  if (params.record_ids.length > 100) {
    throw new Error('批量审核最多100条记录')
  }
  if (!params.action || !['approve', 'reject'].includes(params.action)) {
    throw new Error('审核动作必须是 approve 或 reject')
  }
  if (params.action === 'reject') {
    if (!params.reason || params.reason.trim().length < 5) {
      throw new Error('拒绝原因至少5个字符')
    }
    if (params.reason.length > 500) {
      throw new Error('拒绝原因不能超过500字')
    }
  }

  const requestData: Record<string, any> = {
    record_ids: params.record_ids,
    action: params.action
  }
  if (params.reason) {
    requestData.reason = params.reason
  }

  const headers: Record<string, string> = {}
  if (params.idempotency_key) {
    headers['Idempotency-Key'] = params.idempotency_key
  }

  return apiClient.request('/console/consumption/batch-review', {
    method: 'POST',
    data: requestData,
    header: Object.keys(headers).length > 0 ? headers : undefined,
    needAuth: true,
    showLoading: true,
    loadingText: params.action === 'approve' ? '批量审核通过中...' : '批量拒绝中...',
    showError: true,
    errorPrefix: '批量审核失败：'
  })
}

// ==================== 👨‍💼 管理员客服 ====================

/** 获取管理员客服会话列表?- GET /api/v4/console/customer-service/sessions */
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

/** 获取管理员客服会话消息历?- GET /api/v4/console/customer-service/sessions/:id/messages */
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

// ==================== 📊 管理员查看用户数据====================

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

/** 管理员查看指定用户抽奖历?- GET /api/v4/console/lottery-user-analysis/history/:user_id */
async function getAdminLotteryHistory(user_id: number, page: number = 1, limit: number = 20) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/console/lottery-user-analysis/history/${user_id}?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 管理员查看指定用户综合统?- GET /api/v4/console/lottery-user-analysis/points/:user_id */
async function getAdminUserStatistics(user_id: number) {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  return apiClient.request(`/console/lottery-user-analysis/points/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 管理员查看指定用户抽奖维度统?- GET /api/v4/console/lottery-user-analysis/statistics/:user_id */
async function getAdminLotteryUserStatistics(user_id: number) {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  return apiClient.request(`/console/lottery-user-analysis/statistics/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 📊 管理员客服统====================

/**
 * 获取管理员客服会话统 * 后端API: GET /api/v4/console/customer-service/sessions/stats
 *
 * ⚠️ 路径注意: 后端实际路径/sessions/stats（在sessions子路由下 *    前端文档中曾/customer-service/stats，已对齐为后端实际路 *
 * @param admin_id - 可选，筛选指定客服的统计
 * @returns 统计数据（total_sessions, completed_sessions, avg_response_time, customer_satisfaction */
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
 * 获取管理员客服响应时长统 * 后端API: GET /api/v4/console/customer-service/sessions/response-stats?days=7
 *
 * @param days - 统计天数（默天）
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

// ==================== 🟢 管理员在线状态====================

/**
 * 更新管理员在线状态 * 后端API: POST /api/v4/console/customer-service/sessions/status
 *
 * ⚠️ 路径注意: 后端实际路径/sessions/status（在sessions子路由下 *    前端文档中曾/customer-service/status，已对齐为后端实际路 *
 * 状态存储在 Redis 中（key: cs:admin_status:{admin_id}），4小时自动过期
 *
 * @param status - 在线状态枚举 'online' | 'busy' | 'offline'
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
 * 批量查询管理员在线状态 * 后端API: GET /api/v4/console/customer-service/sessions/status?admin_ids=31,32
 *
 * 未设置或已过期的管理员视'offline'（Redis 4小时自动过期 *
 * @param admin_ids - 管理员ID数组（如 [31, 32] * @returns data: [{ admin_id, status }]
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

// ==================== 🔗 审核链（Approval Chain） ====================

/**
 * 查询审核链实例列表
 * 后端路由: GET /api/v4/console/approval-chain/instances
 * 权限: business_manager(role_level>=60) 及以上
 *
 * 支持按 auditable_type（消费/商家积分）和 status（进行中/已完成/已拒绝）筛选
 * 支持按 auditable_id 精确查询某条业务记录的审核链实例
 *
 * @param params.auditable_type - 业务类型筛选（consumption / merchant_points）
 * @param params.auditable_id - 业务记录ID（精确查询某条记录的审核链）
 * @param params.status - 实例状态筛选（in_progress / completed / rejected / cancelled / timeout）
 * @param params.page - 页码（默认1）
 * @param params.page_size - 每页数量（默认20）
 */
async function getApprovalChainInstances(
  params: {
    auditable_type?: string
    auditable_id?: number
    status?: string
    page?: number
    page_size?: number
  } = {}
) {
  const { page = 1, page_size = 20, auditable_type, auditable_id, status } = params
  const qs = buildQueryString({
    page,
    page_size,
    auditable_type: auditable_type || null,
    auditable_id: auditable_id || null,
    status: status || null
  })
  return apiClient.request(`/console/approval-chain/instances?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载审核链...',
    showError: true
  })
}

/**
 * 查询审核链实例详情（含完整步骤和审核历史）
 * 后端路由: GET /api/v4/console/approval-chain/instances/:id
 * 权限: business_manager(role_level>=60) 及以上
 *
 * 返回数据包含: 实例信息 + 所有步骤(steps) + 每步的审核人和操作记录
 *
 * @param instanceId - 审核链实例ID（instance_id）
 */
async function getApprovalChainInstanceDetail(instanceId: number) {
  if (!instanceId) {
    throw new Error('审核链实例ID不能为空')
  }
  if (!Number.isInteger(instanceId) || instanceId <= 0) {
    throw new Error('审核链实例ID必须是正整数')
  }

  return apiClient.request(`/console/approval-chain/instances/${instanceId}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载详情...',
    showError: true
  })
}

/**
 * 查询当前登录人的待审核步骤
 * 后端路由: GET /api/v4/console/approval-chain/my-pending
 * 权限: business_manager(role_level>=60) 及以上
 *
 * 后端按当前用户的 user_id 和 role_id 匹配待处理的审核步骤
 * 返回: 步骤列表 + 关联的审核链实例和业务数据
 *
 * @param params.page - 页码（默认1）
 * @param params.page_size - 每页数量（默认20）
 * @param params.showLoading - 是否显示loading（默认true，角标计数等后台场景传false）
 */
async function getMyPendingApprovalSteps(
  params: { page?: number; page_size?: number; showLoading?: boolean } = {}
) {
  const { page = 1, page_size = 20, showLoading = true } = params
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/console/approval-chain/my-pending?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading,
    loadingText: '加载待办...',
    showError: !showLoading
  })
}

/**
 * 按业务记录查询审核链实例
 * 后端路由: GET /api/v4/console/approval-chain/instances/by-auditable
 * 权限: business_manager(role_level>=60) 及以上
 *
 * 用于「消费记录列表」等场景：根据 auditable_type + auditable_id 精确查询
 * 某条业务记录所关联的审核链实例，获取 current_step / total_steps / status 等进度信息
 *
 * @param auditableType - 业务类型（consumption / merchant_points）
 * @param auditableId - 业务记录ID（如 consumption_record_id）
 */
async function getInstanceByAuditable(auditableType: string, auditableId: number) {
  if (!auditableType) {
    throw new Error('业务类型不能为空')
  }
  if (!auditableId || !Number.isInteger(auditableId) || auditableId <= 0) {
    throw new Error('业务记录ID必须是正整数')
  }

  const qs = buildQueryString({
    auditable_type: auditableType,
    auditable_id: auditableId
  })
  return apiClient.request(`/console/approval-chain/instances/by-auditable?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 审核链步骤 — 审核通过
 * 后端路由: POST /api/v4/console/approval-chain/steps/:id/approve
 * 权限: business_manager(role_level>=60) 及以上（Service层精确鉴权：验证是否为该步骤的合法审核人）
 *
 * 通过后:
 *   - 如果是终审(is_final=true): 整个审核链完成 → 触发业务回调（如积分发放）
 *   - 如果不是终审: 推进到下一步审核人
 *
 * @param stepId - 审核步骤ID（step_id）
 * @param params.reason - 审核意见（可选）
 */
async function approveApprovalStep(stepId: number, params: { reason?: string } = {}) {
  if (!stepId) {
    throw new Error('审核步骤ID不能为空')
  }
  if (!Number.isInteger(stepId) || stepId <= 0) {
    throw new Error('审核步骤ID必须是正整数')
  }

  return apiClient.request(`/console/approval-chain/steps/${stepId}/approve`, {
    method: 'POST',
    data: { reason: params.reason || undefined },
    needAuth: true,
    showLoading: true,
    loadingText: '审核中...',
    showError: true,
    errorPrefix: '审核通过失败：'
  })
}

/**
 * 审核链步骤 — 审核拒绝
 * 后端路由: POST /api/v4/console/approval-chain/steps/:id/reject
 * 权限: business_manager(role_level>=60) 及以上（Service层精确鉴权）
 *
 * 拒绝后: 整个审核链标记为 rejected → 触发拒绝回调
 *
 * @param stepId - 审核步骤ID（step_id）
 * @param params.reason - 拒绝原因（必填，至少5个字符）
 */
async function rejectApprovalStep(stepId: number, params: { reason: string }) {
  if (!stepId) {
    throw new Error('审核步骤ID不能为空')
  }
  if (!Number.isInteger(stepId) || stepId <= 0) {
    throw new Error('审核步骤ID必须是正整数')
  }
  if (!params || !params.reason) {
    throw new Error('拒绝原因不能为空')
  }
  if (params.reason.trim().length < 5) {
    throw new Error('拒绝原因至少5个字符')
  }

  return apiClient.request(`/console/approval-chain/steps/${stepId}/reject`, {
    method: 'POST',
    data: { reason: params.reason },
    needAuth: true,
    showLoading: true,
    loadingText: '处理中...',
    showError: true,
    errorPrefix: '审核拒绝失败：'
  })
}

module.exports = {
  getPendingConsumption,
  approveConsumption,
  rejectConsumption,
  batchReviewConsumption,
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
  getAdminOnlineStatus,
  getApprovalChainInstances,
  getApprovalChainInstanceDetail,
  getInstanceByAuditable,
  getMyPendingApprovalSteps,
  approveApprovalStep,
  rejectApprovalStep
}
