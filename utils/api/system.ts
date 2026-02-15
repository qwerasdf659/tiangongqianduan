/**
 * 🌐 系统通用API + 💬 用户客服会话API + 👤 用户API + 🔔 活动API
 * 后端路由: routes/v4/system/、routes/v4/user/、routes/v4/activities
 *
 * @file 天工餐厅积分系统 - 系统通用API模块
 * @version 5.1.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 🌐 系统配置 ====================

/** 获取活动位置配置（公开接口） - GET /api/v4/system/config/placement */
async function getPlacementConfig() {
  return apiClient.request('/system/config/placement', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取系统公告列表 - GET /api/v4/system/announcements */
async function getAnnouncements(
  page: number = 1,
  limit: number = 20,
  is_important: boolean | null = null
) {
  const qs = buildQueryString({ page, limit, is_important })
  return apiClient.request(`/system/announcements?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取首页公告 - GET /api/v4/system/announcements/home */
async function getHomeAnnouncements() {
  return apiClient.request('/system/announcements/home', { method: 'GET', needAuth: false })
}

/** 提交用户反馈 - POST /api/v4/system/feedback */
async function submitFeedback(
  category: string,
  content: string,
  priority: string = 'medium',
  attachments: any[] | null = null
) {
  return apiClient.request('/system/feedback', {
    method: 'POST',
    data: { category, content, priority, attachments },
    needAuth: true
  })
}

/** 获取用户反馈列表 - GET /api/v4/system/feedback/my */
async function getMyFeedbacks(page: number = 1, limit: number = 20) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/system/feedback/my?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取系统状态 - GET /api/v4/system/status */
async function getSystemStatus() {
  return apiClient.request('/system/status', { method: 'GET', needAuth: true })
}

/** 获取弹窗横幅列表 - GET /api/v4/system/popup-banners */
async function getPopupBanners() {
  return apiClient.request('/system/popup-banners', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取系统字典 - GET /api/v4/system/dictionaries */
async function getDictionaries(params: Record<string, any> = {}) {
  const qs = buildQueryString(params)
  const url: string = qs ? `/system/dictionaries?${qs}` : '/system/dictionaries'
  return apiClient.request(url, {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取系统通知列表 - GET /api/v4/system/notifications */
async function getNotifications(params: { page?: number; page_size?: number } = {}) {
  const { page = 1, page_size = 20 } = params
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/system/notifications?${qs}`, { method: 'GET', needAuth: true })
}

// ==================== 💬 用户客服会话 ====================

/** 创建客服会话 - POST /api/v4/system/chat/sessions */
async function createChatSession(data: { source?: string } = {}) {
  return apiClient.request('/system/chat/sessions', { method: 'POST', data, needAuth: true })
}

/** 获取用户会话列表 - GET /api/v4/system/chat/sessions */
async function getChatSessions() {
  return apiClient.request('/system/chat/sessions', { method: 'GET', needAuth: true })
}

/** 获取会话消息历史 - GET /api/v4/system/chat/sessions/:id/messages */
async function getChatHistory(session_id: number, page: number = 1, limit: number = 50) {
  const qs = buildQueryString({ page, limit })
  return apiClient.request(`/system/chat/sessions/${session_id}/messages?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 发送消息 - POST /api/v4/system/chat/sessions/:id/messages
 * @param session_id - 会话ID
 * @param params - { content: 消息内容, message_type?: 消息类型, sender_type?: 发送者类型 }
 */
async function sendChatMessage(
  session_id: number,
  params: { content: string; message_type?: string; sender_type?: string }
) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!params || !params.content) {
    throw new Error('消息内容不能为空')
  }

  return apiClient.request(`/system/chat/sessions/${session_id}/messages`, {
    method: 'POST',
    data: {
      content: params.content,
      message_type: params.message_type || 'text',
      sender_type: params.sender_type || undefined
    },
    needAuth: true
  })
}

// ==================== 🔍 聊天搜索 ====================

/**
 * 搜索聊天消息
 * 后端API: GET /api/v4/system/chat/sessions/search?keyword=xxx
 *
 * ⚠️ 路径注意: 后端实际路径是 /system/chat/sessions/search（遵循 RESTful 资源嵌套规范）
 *    前端文档中曾写 /system/chat/search，已对齐为后端实际路径
 *
 * 数据隔离: 用户端只能搜索自己会话中的消息，无法搜索其他用户的聊天内容
 *
 * @param keyword - 搜索关键词（必填）
 * @param page - 页码，默认1
 * @param page_size - 每页数量，默认20，最大50
 * @returns { messages: [...], pagination: { page, page_size, total, total_pages } }
 */
async function searchChatMessages(keyword: string, page: number = 1, page_size: number = 20) {
  if (!keyword || !keyword.trim()) {
    throw new Error('搜索关键词不能为空')
  }
  const qs = buildQueryString({ keyword: keyword.trim(), page, page_size })
  return apiClient.request(`/system/chat/sessions/search?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: '搜索失败：'
  })
}

// ==================== 👤 用户 ====================

/** 获取用户个人详细信息 - GET /api/v4/user/me */
async function getUserMe() {
  return apiClient.request('/user/me', { method: 'GET', needAuth: true })
}

// ==================== 🔔 活动 ====================

/** 获取活动列表 - GET /api/v4/activities */
async function getActivities(params: { page?: number; page_size?: number } = {}) {
  const { page = 1, page_size = 20 } = params
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/activities?${qs}`, { method: 'GET', needAuth: true })
}

module.exports = {
  getPlacementConfig,
  getAnnouncements,
  getHomeAnnouncements,
  submitFeedback,
  getMyFeedbacks,
  getSystemStatus,
  getPopupBanners,
  getDictionaries,
  getNotifications,
  createChatSession,
  getChatSessions,
  getChatHistory,
  sendChatMessage,
  searchChatMessages,
  getUserMe,
  getActivities
}

export {}
