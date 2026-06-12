/**
 * 🔧 管理员控制台API
 * 后端路由: routes/v4/console/
 * 包含: 消费审核、管理员客服会话、管理员查看用户数据
 *
 * @file 天工平台 - 管理员API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 📋 消费记录查询（审核链进度展示用） ====================

/**
 * 按业务记录查询审核链实例（消费记录查进度/金额详情）
 * 见下方"审核链"区块的 getInstanceByAuditable —— 审批列表统一以审核链步骤为数据源，
 * 不再有"消费记录待审列表"旧接口（后端方案①已删除 /consumption/pending 审批入口，
 * 审批面向"我的待办步骤"my-pending）。
 */

// ==================== 👨‍💼 管理员客服 ====================

/** 获取管理员客服会话列表 - GET /api/v4/console/customer-service/sessions */
async function getAdminChatSessions(
  params: { page?: number; pageSize?: number; status?: string | null } = {}
) {
  const { page = 1, pageSize = 20, status = null } = params
  const qs = buildQueryString({
    page,
    page_size: pageSize,
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
  const qs = buildQueryString({ page, page_size: pageSize })
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

/** 管理员查看指定用户抽奖历史 - GET /api/v4/console/lottery-user-analysis/history/:user_id */
async function getAdminLotteryHistory(user_id: number, page: number = 1, page_size: number = 20) {
  const qs = buildQueryString({ page, page_size })
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
 * @param days - 统计天数（默认30天）
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
 * @param instanceId - 审核链实例ID（instance_id；后端 BIGINT 以字符串下发，请求前数值归一）
 */
async function getApprovalChainInstanceDetail(instanceId: number | string) {
  /** 主键值保持字符串语义，请求时数值归一（后端 instance_id 为 BIGINT，下发为字符串） */
  const instanceIdNum = typeof instanceId === 'string' ? parseInt(instanceId, 10) : instanceId
  if (!Number.isInteger(instanceIdNum) || instanceIdNum <= 0) {
    throw new Error('审核链实例ID必须是正整数')
  }

  return apiClient.request(`/console/approval-chain/instances/${instanceIdNum}`, {
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
 * @param auditableType - 业务类型（consumption / merchant_points / trade_dispute）
 * @param auditableId - 业务记录ID（后端 BIGINT 以字符串下发，请求前数值归一）
 */
async function getInstanceByAuditable(auditableType: string, auditableId: number | string) {
  if (!auditableType) {
    throw new Error('业务类型不能为空')
  }
  /** 主键值保持字符串语义，请求时数值归一（后端 auditable_id 为 BIGINT，下发为字符串） */
  const auditableIdNum = typeof auditableId === 'string' ? parseInt(auditableId, 10) : auditableId
  if (!Number.isInteger(auditableIdNum) || auditableIdNum <= 0) {
    throw new Error('业务记录ID必须是正整数')
  }

  const qs = buildQueryString({
    auditable_type: auditableType,
    auditable_id: auditableIdNum
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
 * @param stepId - 审核步骤ID（step_id；后端 BIGINT 以字符串下发，提交前数值归一）
 * @param params.reason - 审核意见（可选）
 */
async function approveApprovalStep(stepId: number | string, params: { reason?: string } = {}) {
  /** 主键值保持字符串语义，提交时数值归一（后端 step_id 为 BIGINT，下发为字符串如 "414"） */
  const stepIdNum = typeof stepId === 'string' ? parseInt(stepId, 10) : stepId
  if (!Number.isInteger(stepIdNum) || stepIdNum <= 0) {
    throw new Error('审核步骤ID必须是正整数')
  }

  return apiClient.request(`/console/approval-chain/steps/${stepIdNum}/approve`, {
    method: 'POST',
    data: { reason: params.reason || undefined },
    needAuth: true,
    showLoading: true,
    loadingText: '审核中...',
    /**
     * 失败提示交由页面层统一处理：审批失败（含「当事人回避」等后端 message）
     * 由 audit-list 的 catch 如实弹出后端原始 message，避免 apiClient 再弹一次（双 Toast），
     * 也避免 errorPrefix 前缀稀释回避提示的清晰度。
     */
    showError: false
  })
}

/**
 * 审核链步骤 — 审核拒绝
 * 后端路由: POST /api/v4/console/approval-chain/steps/:id/reject
 * 权限: business_manager(role_level>=60) 及以上（Service层精确鉴权）
 *
 * 拒绝后: 整个审核链标记为 rejected → 触发拒绝回调
 *
 * @param stepId - 审核步骤ID（step_id；后端 BIGINT 以字符串下发，提交前数值归一）
 * @param params.reason - 拒绝原因（必填，至少5个字符）
 */
async function rejectApprovalStep(stepId: number | string, params: { reason: string }) {
  /** 主键值保持字符串语义，提交时数值归一（后端 step_id 为 BIGINT，下发为字符串如 "414"） */
  const stepIdNum = typeof stepId === 'string' ? parseInt(stepId, 10) : stepId
  if (!Number.isInteger(stepIdNum) || stepIdNum <= 0) {
    throw new Error('审核步骤ID必须是正整数')
  }
  if (!params || !params.reason) {
    throw new Error('拒绝原因不能为空')
  }
  if (params.reason.trim().length < 5) {
    throw new Error('拒绝原因至少5个字符')
  }

  return apiClient.request(`/console/approval-chain/steps/${stepIdNum}/reject`, {
    method: 'POST',
    data: { reason: params.reason },
    needAuth: true,
    showLoading: true,
    loadingText: '处理中...',
    /** 失败提示交由页面层统一如实弹出后端原始 message（含回避提示），避免双 Toast + 前缀稀释 */
    showError: false
  })
}

/** 批量审核步骤请求参数 */
interface BatchApprovalStepsParams {
  /** 待审步骤ID数组（来自 my-pending；后端 BIGINT 以字符串下发，提交前数值归一），最多100条 */
  step_ids: (number | string)[]
  /** 审核动作：approve=通过 reject=拒绝 */
  action: 'approve' | 'reject'
  /** 拒绝原因（action=reject时必填，至少5字符） */
  reason?: string
}

/**
 * 批量审核步骤 — POST /api/v4/console/approval-chain/steps/batch
 *
 * 后端逐条复用 processStep（每条独立事务、独立鉴权、单条失败不影响其它），
 * 仅推进"当前轮到当前登录人的步骤"，不绕过审核链流程，终审条会发积分。
 *
 * 响应 data:
 *   results[]: 逐条结果 { step_id, success, is_chain_completed?, final_result?, error_code?, message? }
 *   stats:     { total, success_count, failed_count }
 *
 * @param params.step_ids - 待审步骤ID数组
 * @param params.action - approve | reject
 * @param params.reason - 拒绝原因（reject 必填，≥5字符）
 */
async function batchApprovalSteps(params: BatchApprovalStepsParams) {
  if (!params || !params.step_ids || params.step_ids.length === 0) {
    throw new Error('请选择要审核的步骤')
  }
  if (params.step_ids.length > 100) {
    throw new Error('批量审核最多100条')
  }
  if (!params.action || !['approve', 'reject'].includes(params.action)) {
    throw new Error('审核动作必须是 approve 或 reject')
  }
  if (params.action === 'reject' && (!params.reason || params.reason.trim().length < 5)) {
    throw new Error('拒绝原因至少5个字符')
  }

  /** 主键值保持字符串语义，提交时数值归一（后端 step_id 为 BIGINT，下发为字符串） */
  const normalizedStepIds = params.step_ids.map(id =>
    typeof id === 'string' ? parseInt(id, 10) : id
  )
  if (normalizedStepIds.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new Error('审核步骤ID必须是正整数')
  }

  const requestData: Record<string, any> = {
    step_ids: normalizedStepIds,
    action: params.action
  }
  if (params.reason) {
    requestData.reason = params.reason
  }

  return apiClient.request('/console/approval-chain/steps/batch', {
    method: 'POST',
    data: requestData,
    needAuth: true,
    showLoading: true,
    loadingText: params.action === 'approve' ? '批量审核通过中...' : '批量拒绝中...',
    showError: true,
    errorPrefix: '批量审核失败：'
  })
}

module.exports = {
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
  rejectApprovalStep,
  batchApprovalSteps
}
