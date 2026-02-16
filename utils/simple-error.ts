/**
 * 极简错误处理工具 - TypeScript版
 * 功能：显示错误提示 + JWT过期处理 + 错误日志
 * 适用场景：小型项目（DAU<5000），微信小程序
 * 设计原则：简单、直接、零学习成本
 *
 * @file 天工餐厅积分系统 - 极简错误处理工具
 * @version 5.2.0
 * @since 2026-02-10
 */

const { createLogger } = require('./logger')
const log = createLogger('error')

/** 显示错误提示（微信小程序弹窗） */
function showError(message: string, title: string = '操作失败'): void {
  wx.showModal({
    title,
    content: message || '操作失败，请稍后重试',
    showCancel: false,
    confirmText: '知道了'
  })
}

/** 显示成功提示（微信小程序Toast） */
function showSuccess(message: string): void {
  wx.showToast({
    title: message || '操作成功',
    icon: 'success',
    duration: 2000
  })
}

/** 处理JWT Token过期（自动清理+跳转登录页） */
function handleJWTExpired(): void {
  wx.showModal({
    title: '登录已过期',
    content: '请重新登录',
    showCancel: false,
    success: () => {
      // 清理本地存储的认证数据
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
      // 跳转到登录页
      wx.redirectTo({ url: '/pages/auth/auth' })
    }
  })
}

/** 错误对象类型（兼容多种错误格式） */
interface ErrorLike {
  message?: string
  msg?: string
  [key: string]: any
}

/**
 * 统一错误处理（核心函数，推荐使用）
 * 自动识别JWT错误、网络错误和普通业务错误
 */
function handleError(error: ErrorLike | Error | string, context: string = '操作'): void {
  // 记录错误日志（方便调试）
  log.error(`❌ ${context}失败:`, error)

  // 提取错误消息（兼容多种错误对象格式）
  const message =
    typeof error === 'string'
      ? error
      : (error as ErrorLike).message || (error as ErrorLike).msg || '未知错误'

  // 场景1：JWT Token过期或认证失败
  if (message.includes('jwt') || message.includes('token') || message.includes('认证')) {
    return handleJWTExpired()
  }

  // 场景2：网络连接错误
  if (message.includes('network') || message.includes('timeout')) {
    return showError('网络连接失败，请检查网络设置', '网络错误')
  }

  // 场景3：默认业务错误
  showError(`${context}失败：${message}`)
}

module.exports = {
  showError,
  showSuccess,
  handleJWTExpired,
  handleError
}
