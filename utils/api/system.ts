/**
 * 🌐 系统通用API + 💬 用户客服会话API + 👤 用户API + 🔔 活动API
 * 后端路由: routes/v4/system/、routes/v4/user/、routes/v4/activities
 *
 * @file 天工餐厅积分系统 - 系统通用API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 🌐 系统配置 ====================

/**
 * 获取系统全局配置（客服信息等）
 * GET /api/v4/system/config
 *
 * 响应字段: system_name, customer_phone, customer_email, customer_wechat 等
 * 数据来源: system_settings 表
 */
async function getSystemGlobalConfig() {
  return apiClient.request('/system/config', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取活动位置配置（公开接口）- GET /api/v4/system/config/placement */
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

/**
 * 获取单条反馈详情 - GET /api/v4/system/feedback/:id
 *
 * 认证方式: JWT Bearer Token（authenticateToken 中间件）
 * 权限控制: 普通用户只能查看自己的反馈，role_level >= 100 的管理员可查看所有
 * 错误响应: 404 NOT_FOUND（反馈不存在）/ 403 FORBIDDEN（无权访问他人反馈）
 *
 * @param feedbackId - 反馈记录ID
 */
async function getFeedbackDetail(feedbackId: number) {
  if (!feedbackId) {
    throw new Error('反馈ID不能为空')
  }
  return apiClient.request(`/system/feedback/${feedbackId}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取系统状态- GET /api/v4/system/status */
async function getSystemStatus() {
  return apiClient.request('/system/status', { method: 'GET', needAuth: true })
}

/**
 * 获取弹窗横幅列表 - GET /api/v4/system/popup-banners
 * @param params.status - 弹窗状态，普通用户只能传 'active'（默认）
 * @param params.position - 显示位置: 'home' / 'profile'（默认 'home'）
 * @param params.limit - 返回数量上限 1-10（默认 10）
 */
async function getPopupBanners(
  params: { status?: string; position?: string; limit?: number } = {}
) {
  const qs = buildQueryString({
    status: params.status || 'active',
    position: params.position || 'home',
    limit: params.limit || 10
  })
  return apiClient.request(`/system/popup-banners?${qs}`, {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取轮播图列表 - GET /api/v4/system/carousel-items
 * @param params.position - 显示位置: 'home'（默认）
 * @param params.limit - 返回数量上限 1-20（默认 10）
 */
async function getCarouselItems(params: { position?: string; limit?: number } = {}) {
  const qs = buildQueryString({
    position: params.position || 'home',
    limit: params.limit || 10
  })
  return apiClient.request(`/system/carousel-items?${qs}`, {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 上报弹窗展示日志 - POST /api/v4/system/ad-events/popup-banners/show-log
 * @param data.popup_banner_id - 弹窗ID（必填）
 * @param data.show_duration_ms - 展示时长毫秒（弹出到关闭的时间差）
 * @param data.close_method - 关闭方式: close_btn / overlay / confirm_btn / auto_timeout
 * @param data.queue_position - 弹出队列位置（从1开始）
 */
async function reportPopupBannerShowLog(data: {
  popup_banner_id: number
  show_duration_ms?: number
  close_method?: string
  queue_position?: number
}) {
  return apiClient.request('/system/ad-events/popup-banners/show-log', {
    method: 'POST',
    data,
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 上报轮播图展示日志 - POST /api/v4/system/ad-events/carousel-items/show-log
 * @param data.carousel_item_id - 轮播图ID（必填）
 * @param data.exposure_duration_ms - 曝光时长毫秒
 * @param data.is_manual_swipe - 是否手动滑动触发展示
 * @param data.is_clicked - 用户是否点击了该轮播图
 */
async function reportCarouselShowLog(data: {
  carousel_item_id: number
  exposure_duration_ms?: number
  is_manual_swipe?: boolean
  is_clicked?: boolean
}) {
  return apiClient.request('/system/ad-events/carousel-items/show-log', {
    method: 'POST',
    data,
    needAuth: true,
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
 * 发送消- POST /api/v4/system/chat/sessions/:id/messages
 * @param session_id - 会话ID
 * @param params - { content: 消息内容, message_type?: 消息类型, sender_type?: 发送者类}
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

// ==================== 📷 聊天图片上传 ====================

/**
 * 上传聊天图片
 * 后端API: POST /api/v4/system/chat/sessions/:id/upload
 *
 * 实现方式: multer内存存储 Sealos对象存储上传 返回公网URL
 * 安全策略: authenticateToken + 会话归属校验 + 5MB大小限制 + jpg/png/gif/webp类型限制
 *
 * 上传成功后，需再调sendChatMessage() 发message_type='image'、content=图片URL
 *
 * @param session_id - 会话ID
 * @param filePath - 微信小程序本地文件路径（wx.chooseMedia 返回tempFilePath * @returns { success: true, data: { image_url: "https://...", object_key: "..." } }
 */
async function uploadChatImage(session_id: number, filePath: string) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!filePath) {
    throw new Error('图片文件路径不能为空')
  }

  const { getApiConfig: _getApiConfig } = require('../../config/env')
  const { getAccessToken: _getToken } = require('../auth-helper')
  const config = _getApiConfig()
  const token = _getToken()

  if (!token) {
    throw new Error('未登录，请先登录后再上传图片')
  }

  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${config.fullUrl}/system/chat/sessions/${session_id}/upload`,
      filePath,
      name: 'image',
      header: {
        Authorization: `Bearer ${token}`
      },
      success: (res: WechatMiniprogram.UploadFileSuccessCallbackResult) => {
        try {
          const data = JSON.parse(res.data)
          if (data.success) {
            resolve(data)
          } else {
            reject(new Error(data.message || '图片上传失败'))
          }
        } catch (_parseError) {
          reject(new Error('图片上传响应解析失败'))
        }
      },
      fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
        reject(new Error(err.errMsg || '图片上传网络错误'))
      }
    })
  })
}

// ==================== 📋 系统配置查询 ====================

/**
 * 获取商品筛选配置（公开接口，无需登录 * 后端API: GET /api/v4/system/config/product-filter
 *
 * system_configs 表读取config_key='product_filter'
 * 不存在时返回兜底默认配置
 *
 * @returns 筛选配置（积分范围选项、库存阈值、分类选项等）
 */
async function getProductFilterConfig() {
  return apiClient.request('/system/config/product-filter', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取反馈表单配置（公开接口，无需登录 * 后端API: GET /api/v4/system/config/feedback
 *
 * system_configs 表读取config_key='feedback_config'
 * 不存在时返回兜底默认配置（包max_length、min_length、max_images、categories 等字段）
 *
 * @returns 反馈配置（最大字数、最小字数、最大图片数、分类选项等）
 */
async function getFeedbackConfig() {
  return apiClient.request('/system/config/feedback', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

// ==================== 🔍 聊天搜索 ====================

/**
 * 搜索聊天消息
 * 后端API: GET /api/v4/system/chat/sessions/search?keyword=xxx
 *
 * ⚠️ 路径注意: 后端实际路径/system/chat/sessions/search（遵RESTful 资源嵌套规范 *    前端文档中曾/system/chat/search，已对齐为后端实际路 *
 * 数据隔离: 用户端只能搜索自己会话中的消息，无法搜索其他用户的聊天内 *
 * @param keyword - 搜索关键词（必填 * @param page - 页码，默
 * @param page_size - 每页数量，默0，最0
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
  getSystemGlobalConfig,
  getPlacementConfig,
  getAnnouncements,
  getHomeAnnouncements,
  submitFeedback,
  getMyFeedbacks,
  getFeedbackDetail,
  getSystemStatus,
  getPopupBanners,
  getCarouselItems,
  reportPopupBannerShowLog,
  reportCarouselShowLog,
  getDictionaries,
  getNotifications,
  createChatSession,
  getChatSessions,
  getChatHistory,
  sendChatMessage,
  uploadChatImage,
  searchChatMessages,
  getProductFilterConfig,
  getFeedbackConfig,
  getUserMe,
  getActivities
}

export { }

