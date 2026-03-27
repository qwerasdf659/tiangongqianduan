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

/**
 * 处理JWT Token过期（统一通过 app.clearAuthData 清理WebSocket+Store+Storage + 跳转登录页）
 * 优先使用 App 实例的 clearAuthData()，降级直接操作 Store/Storage
 */
function handleJWTExpired(): void {
  wx.showModal({
    title: '登录已过期',
    content: '请重新登录',
    showCancel: false,
    success: () => {
      try {
        const appInstance = getApp()
        appInstance.clearAuthData()
      } catch (appError) {
        log.warn('App实例不可用，降级直接清理Store/Storage:', appError)
        try {
          const { userStore } = require('../store/user')
          const { pointsStore } = require('../store/points')
          userStore.clearLoginState()
          pointsStore.clearPoints()
        } catch (storeError) {
          log.warn('Store清理失败，降级直接清理Storage:', storeError)
          wx.removeStorageSync('access_token')
          wx.removeStorageSync('refresh_token')
          wx.removeStorageSync('user_info')
        }
      }
      wx.redirectTo({ url: '/packageUser/auth/auth' })
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
  log.error(`${context}失败:`, error)

  // 提取错误消息（兼容多种错误对象格式）
  const message =
    typeof error === 'string'
      ? error
      : (error as ErrorLike).message || (error as ErrorLike).msg || '未知错误'

  // 场景1：JWT Token过期或认证失败（通过 APIClient 设置的 isAuthError 标记精确判断）
  const errorObj = error as any
  if (
    errorObj.isAuthError === true ||
    errorObj.code === 'TOKEN_EXPIRED' ||
    errorObj.code === 'INVALID_TOKEN' ||
    errorObj.code === 'MISSING_TOKEN' ||
    errorObj.code === 'SESSION_EXPIRED'
  ) {
    return handleJWTExpired()
  }

  // 场景1.5：系统维护中（APIClient._showMaintenanceModal / 维护遮罩已处理，避免重复弹窗）
  if (errorObj.code === 'SYSTEM_MAINTENANCE') {
    return
  }

  // 场景2：网络连接错误（兼容 APIClient 返回的中文消息与微信原始英文 errMsg）
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('网络') ||
    message.includes('超时') ||
    message.includes('request:fail')
  ) {
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
