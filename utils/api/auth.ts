/**
 * 🔐 认证系统API
 * 后端路由: routes/v4/auth/
 *
 * @file 天工餐厅积分系统 - 认证API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')

/** 用户登录 - POST /api/v4/auth/login */
async function userLogin(mobile: string, verification_code: string) {
  return apiClient.request('/auth/login', {
    method: 'POST',
    data: { mobile, verification_code },
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
 *   mobile: STRING(20) 手机号（脱敏136****7930 格式 *   nickname: STRING 昵称
 *   role_level: INT 角色等级= 100 为管理员 *   roles: Array 角色列表
 *   status: STRING 用户状态 *   consecutive_fail_count: INT 连续未中奖次数（保底机制 *   history_total_points: INT 历史累计积分（用于臻选空间解锁）
 *   created_at: ISO8601 创建时间（北京时间）
 *   last_login: ISO8601 最后登录时间（北京时间隔 *   login_count: INT 登录次数
 *
 * ⚠️ 后端不返user_level 字段，角色判断使role_level + roles
 */
async function getUserInfo() {
  return apiClient.request('/auth/profile', { method: 'GET', needAuth: true })
}

/**
 * 发送短信验证码 - POST /api/v4/auth/send-code
 * 🔴 开测试环境：后端支持万能验证码123456，无需实际发送短 */
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

/** 验证Token有效?- GET /api/v4/auth/verify */
async function verifyToken() {
  return apiClient.request('/auth/verify', { method: 'GET', needAuth: true })
}

module.exports = { userLogin, quickLogin, getUserInfo, sendVerificationCode, verifyToken }

export {}
