/**
 * API调用统一包装器
 * 提取 try/catch + API响应检查 + 错误处理 的公共模式
 * 减少各页面中重复的错误处理样板代码
 *
 * @file 天工餐厅积分系统 - API调用包装器
 * @version 5.2.0
 * @since 2026-02-19
 */

const { createLogger } = require('./logger')
const { handleError: handleGlobalError } = require('./simple-error')
const { showLoading, hideLoading } = require('./wechat')
const log = createLogger('api-wrapper')

/** API统一响应格式 */
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  code?: string
}

/** safeApiCall 配置选项 */
interface SafeApiCallOptions {
  /** 操作描述（用于日志和错误提示） */
  context?: string
  /** 自定义错误处理（返回true表示已处理，不再走默认逻辑） */
  onError?: (_error: any) => boolean | void
  /** 静默模式（不弹出错误提示，仅记录日志） */
  silent?: boolean
}

/**
 * 安全API调用封装
 * 自动处理 try/catch、API响应检查、错误日志和用户提示
 *
 * @param apiFn - 返回 ApiResponse 的异步函数
 * @param options - 配置选项
 * @returns 成功时返回 result.data，失败时返回 null
 *
 * 使用示例:
 *   const userData = await safeApiCall(
 *     () => API.getUserInfo(),
 *     { context: '获取用户信息' }
 *   )
 *   if (userData) { this.setData({ userInfo: userData }) }
 */
async function safeApiCall<T = any>(
  apiFn: () => Promise<ApiResponse<T>>,
  options: SafeApiCallOptions = {}
): Promise<T | null> {
  const { context = '操作', onError, silent = false } = options

  try {
    const result = await apiFn()

    if (result && result.success && result.data !== undefined) {
      return result.data
    }

    const apiMessage = (result && result.message) || `${context}失败`
    log.warn(`${context} - API返回非成功状态:`, apiMessage)

    if (!silent) {
      wx.showToast({ title: apiMessage, icon: 'none', duration: 2000 })
    }

    return null
  } catch (error: any) {
    if (onError) {
      const handled = onError(error)
      if (handled) {
        return null
      }
    }

    if (error?.isAuthError === true) {
      log.warn(`${context}中断：认证状态已由APIClient处理`, error.code || '')
      return null
    }

    if (!silent) {
      handleGlobalError(error, context)
    } else {
      log.error(`${context}失败:`, error)
    }

    return null
  }
}

/**
 * 带Loading的安全API调用
 * 自动在调用前显示Loading，调用完成后隐藏
 *
 * @param apiFn - 返回 ApiResponse 的异步函数
 * @param options - 配置选项（context同时作为Loading提示文案）
 * @returns 成功时返回 result.data，失败时返回 null
 */
async function safeApiCallWithLoading<T = any>(
  apiFn: () => Promise<ApiResponse<T>>,
  options: SafeApiCallOptions = {}
): Promise<T | null> {
  const loadingTitle = options.context ? `${options.context}中...` : '加载中...'

  showLoading(loadingTitle)
  try {
    return await safeApiCall<T>(apiFn, options)
  } finally {
    hideLoading()
  }
}

module.exports = {
  safeApiCall,
  safeApiCallWithLoading
}
