/**
 * 🔐 认证系统API
 * 后端路由: routes/v4/auth/
 *
 * @file 天工餐厅积分系统 - 认证API模块
 * @version 5.1.0
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

/** 快速登录 - POST /api/v4/auth/quick-login */
async function quickLogin(mobile: string) {
  return apiClient.request('/auth/quick-login', {
    method: 'POST',
    data: { mobile },
    needAuth: false
  })
}

/** 获取当前用户信息 - GET /api/v4/auth/profile */
async function getUserInfo() {
  return apiClient.request('/auth/profile', { method: 'GET', needAuth: true })
}

/**
 * 发送短信验证码 - POST /api/v4/auth/send-code
 * 🔴 开发/测试环境：后端支持万能验证码123456，无需实际发送短信
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

module.exports = { userLogin, quickLogin, getUserInfo, sendVerificationCode, verifyToken }

export {}
