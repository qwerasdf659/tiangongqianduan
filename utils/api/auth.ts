/**
 * 认证系统API
 * 后端路由: routes/v4/auth/
 *
 * @file 天工餐厅积分系统 - 认证API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')

/**
 * 用户登录 - POST /api/v4/auth/login
 *
 * 请求体携带 platform: 'wechat_mp' 标识当前登录来源为微信小程序，
 * 后端据此实现多平台会话隔离（Web/微信/抖音各平台登录互不踢出）
 */
async function userLogin(mobile: string, verification_code: string) {
  return apiClient.request('/auth/login', {
    method: 'POST',
    data: { mobile, verification_code, platform: 'wechat_mp' },
    needAuth: false
  })
}

/** 快速登录- POST /api/v4/auth/quick-login */
async function quickLogin(mobile: string) {
  return apiClient.request('/auth/quick-login', {
    method: 'POST',
    data: { mobile },
    needAuth: false
  })
}

/**
 * 获取当前登录用户基本信息
 * GET /api/v4/auth/profile
 *
 * 后端路由: routes/v4/auth/profile.js router.get('/profile', ...)
 * 挂载入口: routes/v4/auth/index.js router.use('/', profileRoutes)
 *
 * 响应字段（基users + RBAC角色系统）：
 *   user_id: INT PK 用户ID
 *   mobile: STRING(20) 手机号（脱敏 136****7930 格式）
 *   nickname: STRING 昵称
 *   role_level: INT 角色等级（>= 100 为管理员）
 *   roles: Array 角色列表
 *   status: STRING 用户状态
 *   consecutive_fail_count: INT 连续低档次数（保底机制计数器）
 *   history_total_points: INT 历史累计积分（用于臻选空间解锁）
 *   created_at: ISO8601 创建时间（北京时间）
 *   last_login: ISO8601 最后登录时间（北京时间）
 *   login_count: INT 登录次数
 *
 * ⚠️ 后端不返回 user_level 字段，角色判断使用 role_level + roles
 */
async function getUserInfo() {
  return apiClient.request('/auth/profile', { method: 'GET', needAuth: true })
}

/**
 * 发送短信验证码 - POST /api/v4/auth/send-code
 * 开发测试环境：后端支持万能验证码123456，无需实际发送短信
 */
async function sendVerificationCode(mobile: string) {
  if (!mobile || !/^1[3-9]\d{9}$/.test(mobile)) {
    throw new Error('请输入正确的11位手机号')
  }
  return apiClient.request('/auth/send-code', {
    method: 'POST',
    data: { mobile },
    needAuth: false,
    showLoading: true,
    loadingText: '发送中...',
    showError: true,
    errorPrefix: '验证码发送失败：'
  })
}

/** 验证Token有效性 - GET /api/v4/auth/verify */
async function verifyToken() {
  return apiClient.request('/auth/verify', { method: 'GET', needAuth: true })
}

/**
 * 刷新 access_token - POST /api/v4/auth/refresh
 *
 * 携带旧 access_token（即使已过期）在 Authorization 头中，
 * 后端从旧 JWT 提取 session_token 来复用会话并继承 login_platform，
 * 避免创建新会话导致同平台会话被误覆盖（方案B平台隔离策略）
 *
 * @param refreshToken - 刷新令牌
 * @param oldAccessToken - 旧的 access_token（可选，用于会话复用和平台继承）
 */
async function refreshAccessToken(refreshToken: string, oldAccessToken?: string) {
  const refreshHeaders: Record<string, string> = {}
  if (oldAccessToken) {
    refreshHeaders.Authorization = `Bearer ${oldAccessToken}`
  }
  return apiClient.request('/auth/refresh', {
    method: 'POST',
    data: { refresh_token: refreshToken },
    needAuth: false,
    showLoading: false,
    showError: false,
    header: refreshHeaders
  })
}

/**
 * 退出登录 - POST /api/v4/auth/logout
 * 通知后端将当前会话标记为 is_active=false，释放认证会话资源
 * 前端在调用成功或失败后都应清理本地认证数据
 */
async function logout() {
  return apiClient.request('/auth/logout', {
    method: 'POST',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  userLogin,
  quickLogin,
  getUserInfo,
  sendVerificationCode,
  verifyToken,
  refreshAccessToken,
  logout
}
