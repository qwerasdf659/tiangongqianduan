/**
 * 🌐 系统通用API + 💬 用户客服会话API + 👤 用户API + 🔔 活动API
 * 后端路由: routes/v4/system/、routes/v4/user/、routes/v4/activities
 *
 * @file 天工平台 - 系统通用API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString, generateIdempotencyKey } = require('../util')

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
 * 认证方式: optionalAuth（可选登录，后端 2026-06-21 改造）
 *   - 未登录匿名：返回 operational/system 公开内容（不含 commercial）
 *   - 已登录：额外含 commercial（计费/定向）。前端用 optionalAuth:true，
 *     有 token 自动携带、无 token 也照常请求，故未登录也能看见运营图片位。
 * 响应格式: { success, data: { items: AdDeliveryItem[], slot_type, position, total } }
 *
 * @param params.slot_type - 广告位类型（必填）: popup / carousel / announcement / feed / top_banner
 * @param params.position  - 位置（可选，默认 home）: home / lottery / profile / market_list / exchange_list
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
    optionalAuth: true,
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
async function getMyFeedbacks(page: number = 1, page_size: number = 20) {
  const qs = buildQueryString({ page, page_size })
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

/**
 * 获取系统状态（健康检查）- GET /api/v4/system/status
 *
 * 后端使用 optionalAuth 中间件 — 未登录也可调用
 * 已登录管理员（role_level >= 100）额外返回 statistics 字段
 * 前端判断 success: true 即表示服务正常
 *
 * 响应格式:
 *   { success, data: { system: { server_time, status, version, statistics? } } }
 */
async function getSystemStatus() {
  return apiClient.request('/system/status', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取小程序版本闸门配置（公开接口，无需登录）
 * GET /api/v4/system/app-version
 *
 * 用于前端强制更新：小程序冷启动时调用，将本地版本与返回的
 * min_version 比较，低于 min_version 则强制拦截，引导用户更新。
 *
 * 前端约束: 此接口必须 needAuth:false / showError:false，
 * 不能因为它失败而阻塞启动（接口异常时前端放行，不拦截用户）。
 *
 * 响应格式:
 *   { success, data: {
 *       latest_version,   // 当前线上最新版本，如 "5.3.0"
 *       min_version,      // 最低可用版本，低于此版本强制更新，如 "5.2.0"
 *       force_update,     // 是否开启强制更新闸门（总开关）
 *       update_message,   // 强制更新提示文案（可选）
 *       platform          // 平台标识（可选）: miniprogram
 *   } }
 */
async function getAppVersionGate() {
  return apiClient.request('/system/app-version', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取所有字典类型列表 - GET /api/v4/system/dictionaries/types
 *
 * 后端无 /system/dictionaries 根路径列表接口
 * 实际提供4个子接口: /types、/type/:dictType、/lookup、/:dictId
 * 此函数获取所有字典类型列表（无需认证）
 *
 * 数据库: system_dictionaries 表（412条数据，83种字典类型）
 */
async function getDictionaryTypes() {
  return apiClient.request('/system/dictionaries/types', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取指定类型的字典项 - GET /api/v4/system/dictionaries/type/:dictType
 *
 * @param dictType - 字典类型代码（如 user_status、campaign_status、prize_type、consumption_status 等）
 */
async function getDictionaryByType(dictType: string) {
  if (!dictType) {
    throw new Error('字典类型不能为空')
  }
  return apiClient.request(`/system/dictionaries/type/${dictType}`, {
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
async function getChatHistory(session_id: number, page: number = 1, page_size: number = 50) {
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/system/chat/sessions/${session_id}/messages?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 发送消息 - POST /api/v4/system/chat/sessions/:id/messages
 *
 * 富消息建模重构（对接文档 2026-06-25）：content 永远人类可读文本，URL/坐标/文件名进 metadata。
 * @param session_id - 会话ID
 * @param params - { content: 人类可读文本, message_type?: text/image/file/location,
 *                   sender_type?: 发送者类型, metadata?: 富消息负载对象 }
 */
async function sendChatMessage(
  session_id: number,
  params: {
    content: string
    message_type?: string
    sender_type?: string
    metadata?: Record<string, any>
  }
) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!params || !params.content) {
    throw new Error('消息内容不能为空')
  }

  const messageType = params.message_type || 'text'
  const requestData: Record<string, any> = {
    content: params.content,
    message_type: messageType,
    sender_type: params.sender_type || undefined
  }
  /* 富消息（image/file/location）：URL/坐标/文件名统一进 metadata，后端按 type 校验落库 */
  if (params.metadata && typeof params.metadata === 'object') {
    requestData.metadata = params.metadata
  }

  return apiClient.request(`/system/chat/sessions/${session_id}/messages`, {
    method: 'POST',
    data: requestData,
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
 * @param filePath - 微信小程序本地文件路径（wx.chooseMedia 返回tempFilePath）
 * @returns { success: true, data: { image_url: "https://...", object_key: "..." } }
 * 前端约束：聊天图片URL权威字段为 data.image_url（后端已是完整代理URL，前端直接用，勿二次拼接）
 */
async function uploadChatImage(session_id: number, filePath: string) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!filePath) {
    throw new Error('图片文件路径不能为空')
  }

  return apiClient.uploadFile(`/system/chat/sessions/${session_id}/upload`, filePath, {
    name: 'image',
    needAuth: true,
    showError: false,
    errorPrefix: '聊天图片上传失败：'
  })
}

// ==================== 🎧 简版客服座席回复端（cs-agent） ====================
//
// 准入基于「客服座席」身份（customer_service_agents 表 status=active），而非管理员等级。
// 非座席账号调用返回 HTTP 403 / code: FORBIDDEN。座席名单由 Web 后台维护、每次请求现查。
// 与 Web 后台客服工作台共用同一套 customer_service_sessions / chat_messages 表，天然数据互通。
// 本端只做三件事：看会话列表、看聊天记录、发文字/图片消息（不含统计/分配/工单/关闭等管理能力）。

/**
 * 获取待回复会话列表（座席端）
 * 后端API: GET /api/v4/system/cs-agent/sessions
 *
 * @param params.page - 页码（默认 1）
 * @param params.page_size - 每页数量（默认 20）
 * @param params.status - 会话状态筛选（可选: waiting/assigned/active/closed）
 * @param params.sort_by - 排序字段（可选）
 * @param params.sort_order - 排序方向（可选）
 * @returns { success, data: { sessions: [...], pagination: {...} } }
 */
async function getCsAgentSessions(
  params: {
    page?: number
    page_size?: number
    status?: string
    sort_by?: string
    sort_order?: string
  } = {}
) {
  const qs = buildQueryString({
    page: params.page || 1,
    page_size: params.page_size || 20,
    status: params.status || null,
    sort_by: params.sort_by || null,
    sort_order: params.sort_order || null
  })
  return apiClient.request(`/system/cs-agent/sessions?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取某会话聊天记录（座席端）
 * 后端API: GET /api/v4/system/cs-agent/sessions/:id/messages
 *
 * @param session_id - 会话ID（取自列表的 customer_service_session_id）
 * @param params.page_size - 每页数量（默认 50）
 * @param params.before_message_id - 向上翻历史的游标（可选）
 * @returns { success, data: { messages: [...] } }
 */
async function getCsAgentMessages(
  session_id: number,
  params: { page_size?: number; before_message_id?: number } = {}
) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  const qs = buildQueryString({
    page_size: params.page_size || 50,
    before_message_id: params.before_message_id || null
  })
  return apiClient.request(`/system/cs-agent/sessions/${session_id}/messages?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 座席发送文字/图片/文件消息
 * 后端API: POST /api/v4/system/cs-agent/sessions/:id/send
 *
 * @param session_id - 会话ID
 * @param params.content - 人类可读文本（text 正文 / image '[图片]' / file 文件名 / location 地址）
 * @param params.message_type - 'text'（默认）/ 'image' / 'file' / 'location'
 * @param params.metadata - 富消息负载（image_url / file_url+file_name+file_size / 坐标），后端按 type 校验
 * @returns { success, data: { chat_message_id, content, message_type, created_at } }
 */
async function sendCsAgentMessage(
  session_id: number,
  params: { content: string; message_type?: string; metadata?: Record<string, any> }
) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!params || !params.content) {
    throw new Error('消息内容不能为空')
  }
  const messageType = params.message_type || 'text'
  const requestData: Record<string, any> = {
    content: params.content,
    message_type: messageType
  }
  /* 富消息（image/file/location）：URL/坐标/文件名统一进 metadata，后端按 type 校验落库 */
  if (params.metadata && typeof params.metadata === 'object') {
    requestData.metadata = params.metadata
  }
  return apiClient.request(`/system/cs-agent/sessions/${session_id}/send`, {
    method: 'POST',
    data: requestData,
    needAuth: true,
    showError: false
  })
}

/**
 * 查询当前登录用户是否为客服座席（轻量身份接口）
 * 后端API: GET /api/v4/system/cs-agent/me
 *
 * 仅需登录鉴权，不被 requireCsAgent 拦截：非座席返回 HTTP 200 + is_agent:false（不会 403）。
 * 前端用法：进「我的」页调一次，data.is_agent===true 显示「客服回复台」入口，否则隐藏。
 *
 * @returns { success, data: { is_agent: boolean, status: string|null } }
 */
async function getCsAgentMe() {
  return apiClient.request('/system/cs-agent/me', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 座席打开会话时标记该会话用户消息已读（红点清零）
 * 后端API: POST /api/v4/system/cs-agent/sessions/:id/read
 *
 * 复用后端 markSessionAsRead：把该会话 sender_type='user' 的 sent/delivered 消息置 read。
 * 前端时机：座席打开会话时主动调一次，列表 unread_count 即清零。
 *
 * @param session_id - 会话ID
 * @returns { success, data: { updated_count: number } }
 */
async function markCsAgentSessionRead(session_id: number) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  return apiClient.request(`/system/cs-agent/sessions/${session_id}/read`, {
    method: 'POST',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 上传聊天文件（文档/压缩包等非图片附件）
 * 后端API: POST /api/v4/system/chat/sessions/:id/upload-file（form-data 字段名 file）
 *
 * 限制：最大 20MB；扩展名+MIME 双重白名单 pdf/doc/docx/xls/xlsx/ppt/pptx/txt/zip/rar。
 * 上传成功后，再调 send 接口发 message_type='file'、content=file_url，并带 file_name/file_size。
 *
 * @param session_id - 会话ID
 * @param filePath - 微信小程序本地文件路径（wx.chooseMessageFile 返回 path）
 * @returns { success, data: { file_url, file_name, file_size, object_key } }
 */
async function uploadChatFile(session_id: number, filePath: string) {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!filePath) {
    throw new Error('文件路径不能为空')
  }
  return apiClient.uploadFile(`/system/chat/sessions/${session_id}/upload-file`, filePath, {
    name: 'file',
    needAuth: true,
    showError: false,
    errorPrefix: '聊天文件上传失败：'
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

/**
 * 上传售后申诉证据图片
 * 后端API: POST /api/v4/user/images/upload（通用用户图片上传，multer + MediaService）
 *
 * 业务语义: 自助发起售后申诉时上传证据截图，取返回的 public_url 放入申诉的 evidence 数组。
 * 限制: 单图 2MB，jpg/png/gif/webp（与后端 MediaService 一致）。
 *
 * @param filePath - 微信本地文件路径（wx.chooseMedia 返回的 tempFilePath）
 * @returns { success, data: { media_id, object_key, public_url, ... } }
 */
async function uploadDisputeEvidence(filePath: string) {
  if (!filePath) {
    throw new Error('图片文件路径不能为空')
  }
  return apiClient.uploadFile('/user/images/upload', filePath, {
    name: 'image',
    needAuth: true,
    showError: false,
    errorPrefix: '证据图片上传失败：'
  })
}

// ==================== 🛡️ 售后申诉（交易纠纷）====================

/**
 * 用户自助发起售后申诉
 * 后端API: POST /api/v4/system/disputes
 *
 * 业务语义: 用户对自己的订单（兑换/消费）发起售后申诉，
 *           客服受理后进入处理流程，可升级仲裁、解决或驳回。
 *
 * 字段以后端为准（直接使用后端字段名，不做映射）:
 *   - order_type   关联订单类型: redemption / consumption（后端已收窄，C2C 下线后 trade/auction 已废除）
 *   - order_id     关联订单ID（字符串，兼容 BIGINT/UUID）
 *   - dispute_type 纠纷类型: item_not_received / item_mismatch / quality_issue / fraud / other
 *   - title        申诉标题（必填）
 *   - description  申诉描述（可选）
 *   - evidence     证据图片URL数组（可选）
 *
 * 幂等键: 按 RESTful 惯例放入请求头 Idempotency-Key（元数据与业务数据分离）
 *
 * @param disputeData - 申诉表单数据
 * @returns { success, data: { trade_dispute_id, order_type, order_id, dispute_type, status, deadline } }
 */
async function createSelfServiceDispute(disputeData: {
  order_type: string
  order_id: string
  dispute_type: string
  title: string
  description?: string
  evidence?: string[]
}) {
  if (!disputeData.order_type) {
    throw new Error('请选择关联订单类型')
  }
  if (!disputeData.order_id) {
    throw new Error('关联订单ID不能为空')
  }
  if (!disputeData.dispute_type) {
    throw new Error('请选择申诉类型')
  }
  if (!disputeData.title) {
    throw new Error('申诉标题不能为空')
  }

  const idempotencyKey = await generateIdempotencyKey(
    'system_dispute_self_create',
    disputeData.order_id
  )
  return apiClient.request('/system/disputes', {
    method: 'POST',
    data: disputeData,
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '提交申诉...',
    showError: true,
    errorPrefix: '申诉提交失败：'
  })
}

/**
 * 我的售后申诉列表（已脱敏，仅本人）
 * 后端API: GET /api/v4/system/disputes/my
 *
 * 数据隔离: 后端根据JWT中的user_id，只返回该用户的申诉。
 * 脱敏规则(public): 不含 assigned_to(处理客服) / approval_chain_instance_id(仲裁审批链) 等内部字段。
 *
 * @param page - 页码，默认1
 * @param page_size - 每页数量，默认10
 * @returns { success, data: { rows: TradeDispute[], count, page, page_size } }
 */
async function getMyDisputes(page: number = 1, page_size: number = 10) {
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/system/disputes/my?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载售后...',
    showError: true,
    errorPrefix: '售后列表加载失败：'
  })
}

/**
 * 售后申诉详情（已脱敏，仅本人可见）
 * 后端API: GET /api/v4/system/disputes/:id
 *
 * 权限控制: 仅申诉本人可见，非本人返回 403；不存在返回 404。
 *
 * @param trade_dispute_id - 申诉记录ID（trade_disputes.trade_dispute_id）
 * @returns { success, data: TradeDispute }
 */
async function getDisputeDetail(trade_dispute_id: number) {
  if (!trade_dispute_id) {
    throw new Error('申诉ID不能为空')
  }
  return apiClient.request(`/system/disputes/${trade_dispute_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载详情...',
    showError: true,
    errorPrefix: '售后详情加载失败：'
  })
}

// ==================== 🔔 活动 ====================

/**
 * 获取活动条件配置列表（管理员接口）- GET /api/v4/activities
 *
 * ⚠️ 此接口为管理员后台专用（authenticateToken + requireRoleLevel(100)）
 * 用于配置活动参与条件、测试用户资格等管理功能
 * 普通用户浏览活动请使用 lottery.ts 中的 getActiveCampaigns()
 *
 * 后端实际参数: status（可选筛选）、page_size（作为 limit 限制数量）
 * 后端不使用 page 参数（无分页偏移），返回格式: { activities: [...], total: number }
 * 底层查询 lottery_campaigns 表（当前4条活动）
 */
async function getActivities(params: { status?: string; page_size?: number } = {}) {
  const { status, page_size = 20 } = params
  const qs = buildQueryString({ status, page_size })
  return apiClient.request(`/activities?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取商品筛选配置（公开接口，无需登录）
 * 后端API: GET /api/v4/system/config/product-filter
 *
 * system_configs 表读取 config_key='product_filter'
 * 返回筛选维度: categories（分类列表）、cost_ranges（价格区间）、
 *               sort_options（排序选项）、stock_statuses（库存状态选项）
 *
 * 分类数据源: categories 表（is_enabled=1），使用 category_code 而非中文名
 * 价格区间: 统一为 100/500/1000 区间（已决策，以 product_filter 为准）
 *
 * 响应格式: { success, data: { categories, cost_ranges, sort_options, stock_statuses } }
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
 * 获取分类树形结构（两级分类）
 * GET /api/v4/system/config/category-tree
 *
 * 后端服务: Category.getTree()
 * 数据库表: categories（字段 category_id, category_code, category_name, parent_category_id, level, sort_order）
 *
 * 响应结构:
 *   { success, data: { categories: CategoryTreeNode[] } }
 *
 * CategoryTreeNode:
 *   - category_id: BIGINT 分类ID
 *   - category_code: VARCHAR 分类编码（如 'collectible'）
 *   - category_name: VARCHAR 分类显示名（如 '收藏品'）
 *   - parent_category_id: BIGINT|null 父分类ID（一级分类为 null）
 *   - level: INT 层级（1=一级, 2=二级）
 *   - sort_order: INT 排序权重
 *   - children: CategoryTreeNode[] 子分类数组（仅一级分类有值）
 */
async function getCategoryTree() {
  return apiClient.request('/system/config/category-tree', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取法律协议文档内容（用户协议 / 隐私政策）
 * GET /api/v4/system/agreement/:doc_type
 *
 * 后端 BE-6 接口已上线（公开只读，无需登录）。doc_type 取值: user_agreement / privacy_policy
 * 正文未录入时后端返 404（AGREEMENT_NOT_CONFIGURED），doc_type 非法返 400（AGREEMENT_DOC_TYPE_INVALID），
 * 前端据此明确报错提示，不展示假内容。
 *
 * 响应 data 结构（字段 snake_case 照后端原样）:
 *   title         — 文档标题（如"用户协议"）
 *   updated_at    — 更新日期（北京时间字符串）
 *   version       — 版本号（可空）
 *   sections[]    — 协议正文段落数组: { heading?: string, text: string }
 *
 * 法务正文由后端/运营在后台「协议管理」维护，前端不硬编码任何协议条款文本。
 */
async function getAgreementDocument(doc_type: string) {
  return apiClient.request(`/system/agreement/${doc_type}`, {
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
  getAppVersionGate,
  getDictionaryTypes,
  getDictionaryByType,
  getNotifications,
  createChatSession,
  getChatSessions,
  getChatHistory,
  sendChatMessage,
  uploadChatImage,
  uploadChatFile,
  getCsAgentSessions,
  getCsAgentMessages,
  sendCsAgentMessage,
  getCsAgentMe,
  markCsAgentSessionRead,
  searchChatMessages,
  rateSession,
  uploadDisputeEvidence,
  createSelfServiceDispute,
  getMyDisputes,
  getDisputeDetail,
  getExchangePageConfig,
  getFeedbackConfig,
  getActivities,
  getProductFilterConfig,
  getCategoryTree,
  getAgreementDocument
}
