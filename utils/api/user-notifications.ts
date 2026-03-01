/**
 * 用户通知API模块 — 对接通知系统独立化方案B
 * 后端路由: routes/v4/user/notifications.js
 * API路径: /api/v4/user/notifications
 *
 * 4个端点:
 *   GET  /user/notifications          — 通知列表（分页+筛选）
 *   GET  /user/notifications/unread-count — 未读数量（铃铛角标）
 *   POST /user/notifications/mark-read    — 批量/全部标记已读
 *   POST /user/notifications/:id/read     — 单条标记已读
 *
 * 认证方式: JWT Bearer Token（authenticateToken 中间件，通过 req.user.user_id 隔离数据）
 * 响应格式: ApiResponse { success, code, message, data, timestamp, version, request_id }
 * 字段命名: 100% snake_case（直接使用后端返回字段，不做映射）
 *
 * @file 天工餐厅积分系统 - 用户通知API
 * @version 5.2.0
 * @since 2026-02-25
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

/**
 * 获取用户通知列表
 * GET /api/v4/user/notifications
 *
 * 统一列表 + 类型标签，按时间倒序，支持分页和类型筛选
 *
 * @param params.page      - 页码，默认1
 * @param params.page_size - 每页数量，默认20，最大50
 * @param params.type      - 按通知类型筛选（如 listing_created, purchase_completed, lottery_win）
 * @param params.is_read   - 筛选已读状态: '0'=未读, '1'=已读
 *
 * @returns {
 *   notifications: Array<{
 *     notification_id: string,  // BIGINT主键
 *     type: string,             // 通知类型
 *     title: string,            // 通知标题（可直接展示）
 *     content: string,          // 通知正文
 *     metadata: object|null,    // 业务数据（用于跳转对应页面）
 *     is_read: number,          // 0=未读, 1=已读
 *     read_at: string|null,     // 已读时间（北京时间）
 *     created_at: string        // 创建时间（北京时间）
 *   }>,
 *   pagination: {
 *     current_page: number,
 *     page_size: number,
 *     total_count: number,
 *     total_pages: number,
 *     has_next: boolean,
 *     has_prev: boolean
 *   }
 * }
 */
async function getUserNotifications(
  params: {
    page?: number
    page_size?: number
    type?: string
    is_read?: string
  } = {}
) {
  const queryParams: Record<string, any> = {
    page: params.page || 1,
    page_size: params.page_size || 20
  }
  if (params.type) {
    queryParams.type = params.type
  }
  if (params.is_read !== undefined && params.is_read !== null && params.is_read !== '') {
    queryParams.is_read = params.is_read
  }
  const qs = buildQueryString(queryParams)
  return apiClient.request(`/user/notifications?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取用户未读通知数量
 * GET /api/v4/user/notifications/unread-count
 *
 * 轻量接口，用于首页铃铛角标
 * 前端取 response.data.unread_count 即可
 *
 * @returns { unread_count: number }
 */
async function getUserNotificationUnreadCount() {
  return apiClient.request('/user/notifications/unread-count', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 批量/全部标记通知已读
 * POST /api/v4/user/notifications/mark-read
 *
 * notification_ids 为空数组或不传时，标记该用户全部未读通知为已读（"一键全部已读"）
 *
 * @param notificationIds - 要标记的通知ID数组（空数组=全部已读）
 * @returns { marked_count: number }
 */
async function markNotificationsAsRead(notificationIds: (number | string)[] = []) {
  const requestData: Record<string, any> = {}
  if (notificationIds.length > 0) {
    requestData.notification_ids = notificationIds
  }
  return apiClient.request('/user/notifications/mark-read', {
    method: 'POST',
    data: requestData,
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: '标记已读失败：'
  })
}

/**
 * 单条标记通知已读
 * POST /api/v4/user/notifications/:id/read
 *
 * 用户点击某条通知时调用（点击才标已读，不自动标）
 *
 * @param notificationId - 通知ID（notification_id）
 * @returns { notification_id, is_read: 1, read_at: string }
 */
async function markSingleNotificationAsRead(notificationId: number | string) {
  if (!notificationId) {
    throw new Error('通知ID不能为空')
  }
  return apiClient.request(`/user/notifications/${notificationId}/read`, {
    method: 'POST',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  getUserNotifications,
  getUserNotificationUnreadCount,
  markNotificationsAsRead,
  markSingleNotificationAsRead
}
