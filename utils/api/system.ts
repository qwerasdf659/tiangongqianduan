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

/**
 * 统一内容获取接口 - GET /api/v4/system/ad-delivery
 *
 * 合并原 popup-banners / carousel-items / announcements 三套独立接口
 * 后端通过 Ad System 统一管理弹窗、轮播、公告内容
 *
 * 认证方式: JWT Bearer Token（后端 authenticateToken 中间件）
 * 响应格式: { success, data: { items: AdDeliveryItem[], slot_type, position, total } }
 *
 * @param params.slot_type - 广告位类型（必填）: popup / carousel / announcement
 * @param params.position  - 位置（可选，默认 home）: home / lottery / profile
 */
async function getAdDelivery(params: { slot_type: string; position?: string }) {
  if (!params.slot_type) {
    throw new Error('slot_type 参数不能为空')
  }
  const qs = buildQueryString({
    slot_type: params.slot_type,
    position: params.position || 'home'
  })
  return apiClient.request(`/system/ad-delivery?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 统一交互日志上报 - POST /api/v4/system/ad-events/interaction-log
 *
 * 合并原 popup-banners/show-log + carousel-items/show-log 两个独立上报接口
 * 通过 interaction_type 区分交互类型，extra_data 携带场景特有数据
 *
 * @param data.ad_campaign_id   - 广告计划ID（必填，来自 ad-delivery 接口返回）
 * @param data.interaction_type - 交互类型: impression / click / close / swipe
 * @param data.extra_data       - 场景扩展数据（弹窗: show_duration_ms 等，轮播: exposure_duration_ms 等）
 */
async function reportInteractionLog(data: API.InteractionLogParams) {
  if (!data.ad_campaign_id) {
    throw new Error('ad_campaign_id 不能为空')
  }
  if (!data.interaction_type) {
    throw new Error('interaction_type 不能为空')
  }
  return apiClient.request('/system/ad-events/interaction-log', {
    method: 'POST',
    data,
    needAuth: true,
    showLoading: false,
    showError: false
  })
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
 * 获取兑换页面配置（公开接口，无需登录）
 * 后端API: GET /api/v4/system/config/exchange-page
 *
 * system_configs 表读取 config_key='exchange_page'
 * 返回: tabs / spaces / shop_filters / market_filters / card_display / ui 完整配置
 * 响应格式: { success, code: 'EXCHANGE_PAGE_CONFIG_SUCCESS', data: ExchangePageConfig }
 */
async function getExchangePageConfig() {
  return apiClient.request('/system/config/exchange-page', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取反馈表单配置（公开接口，无需登录）
 * 后端API: GET /api/v4/system/config/feedback
 *
 * system_configs 表读取 config_key='feedback_config'
 * 不存在时返回兜底默认配置（包含 max_length、min_length、max_images、categories 等字段）
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
 * ⚠️ 路径注意: 后端实际路径 /system/chat/sessions/search（遵循 RESTful 资源嵌套规范）
 *    前端文档中曾为 /system/chat/search，已对齐为后端实际路径
 *
 * 数据隔离: 用户端只能搜索自己会话中的消息，无法搜索其他用户的聊天内容
 *
 * @param keyword - 搜索关键词（必填）
 * @param page - 页码，默认 1
 * @param page_size - 每页数量，默认 20，最大 100
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

// ==================== ⭐ 满意度评分 ====================

/**
 * 用户提交会话满意度评分
 * 后端API: POST /api/v4/system/chat/sessions/:id/rate
 *
 * 触发时机:
 *   1. 会话关闭后 WebSocket 推送 satisfaction_request 事件，前端渲染内嵌评分卡片
 *   2. 用户点击评分后调用此接口
 *
 * @param session_id - 会话ID（customer_service_session_id）
 * @param score - 满意度评分（1-5 的整数）
 * @returns { success, data: { customer_service_session_id, satisfaction_score } }
 *
 * 错误场景:
 *   - score 不在 1-5 范围 → 400 BAD_REQUEST
 *   - 会话不存在 → 404 NOT_FOUND
 *   - 非本人会话 → 403 FORBIDDEN
 */
async function rateSession(session_id: number, score: number) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!score || score < 1 || score > 5 || !Number.isInteger(score)) {
    throw new Error('评分必须是1-5的整数')
  }
  return apiClient.request(`/system/chat/sessions/${session_id}/rate`, {
    method: 'POST',
    data: { score },
    needAuth: true,
    showLoading: true,
    loadingText: '提交评分...',
    showError: true,
    errorPrefix: '评分提交失败：'
  })
}

// ==================== 📋 用户工单 ====================

/**
 * 用户查看自己的工单进度
 * 后端API: GET /api/v4/system/chat/issues
 *
 * 数据隔离: 后端根据JWT解码user_id，只返回该用户的工单（已脱敏）
 * 脱敏规则: 不含 description / resolution / compensation_log / 内部备注
 *
 * @param page - 页码，默认1
 * @param page_size - 每页数量，默认10
 * @returns { success, data: { rows: Issue[], count, page, page_size } }
 */
async function getUserIssues(page: number = 1, page_size: number = 10) {
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/system/chat/issues?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载工单...',
    showError: true,
    errorPrefix: '工单加载失败：'
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

/**
 * 获取全局氛围主题配置（公开接口，无需登录）
 * 后端 API：GET /api/v4/system/config/app-theme
 *
 * system_configs 表读取 config_key='app_theme'
 * 响应格式：{ success: true, code: 'APP_THEME_CONFIG_SUCCESS', data: { theme: 'gold_luxury' } }
 *
 * ⚠️ 此 API 需要后端实现，详见 docs/后端对接需求-全局氛围主题.md
 */
async function getAppThemeConfig() {
  return apiClient.request('/system/config/app-theme', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  getSystemGlobalConfig,
  getPlacementConfig,
  getAdDelivery,
  reportInteractionLog,
  submitFeedback,
  getMyFeedbacks,
  getFeedbackDetail,
  getSystemStatus,
  getDictionaries,
  getNotifications,
  createChatSession,
  getChatSessions,
  getChatHistory,
  sendChatMessage,
  uploadChatImage,
  searchChatMessages,
  rateSession,
  getUserIssues,
  getExchangePageConfig,
  getFeedbackConfig,
  getAppThemeConfig,
  getUserMe,
  getActivities
}
