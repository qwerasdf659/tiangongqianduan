/**
 * V4.0 API客户端核心模块
 *
 * 职责: APIClient类、请求响应处理、Token管理、错误处理
 * 各业务API子模块通过 apiClient 单例发起请求
 *
 * @file 天工餐厅积分系统 - API客户端核心
 * @version 5.2.0
 * @since 2026-02-15
 */

const { createLogger } = require('../logger')
const log = createLogger('api')

// ===== 类型定义 =====

/** API请求选项 */
interface RequestOptions {
  /** HTTP方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** 请求数据 */
  data?: Record<string, any>
  /** 是否需要认证（默认true） */
  needAuth?: boolean
  /** 超时时间ms（默认15000） */
  timeout?: number
  /** 是否自动显示loading（默认true） */
  showLoading?: boolean
  /** loading文案（默认'加载中...'） */
  loadingText?: string
  /** 是否自动显示错误toast（默认true） */
  showError?: boolean
  /** 错误提示前缀 */
  errorPrefix?: string
  /** 自定义请求头 */
  header?: Record<string, string>
  /** 内部使用：409冲突重试标记 */
  _retried?: boolean
}

/** API错误对象 */
interface ApiError extends Error {
  code?: string
  statusCode?: number
  data?: any
  isAuthError?: boolean
}

/** V4.0统一API响应格式 */
interface ApiResponse<T = any> {
  success: boolean
  data?: T
  message?: string
  code?: string
}

// ===== 延迟获取App实例和Store =====

let app: any = null
function getAppInstance(): any {
  if (!app && typeof getApp !== 'undefined') {
    try {
      app = getApp()
    } catch (error) {
      log.warn('⚠️ 无法获取App实例:', error)
    }
  }
  return app
}

/**
 * 延迟获取 userStore（避免模块加载阶段的循环依赖）
 * APIClient在模块顶层创建单例，此时Store可能尚未初始化，
 * 因此必须在每次使用时延迟获取
 */
let _userStore: any = null
function getUserStore(): any {
  if (!_userStore) {
    try {
      _userStore = require('../../store/user').userStore
    } catch (error) {
      log.warn('⚠️ 无法获取userStore:', error)
    }
  }
  return _userStore
}

/**
 * 从 Store 获取 access_token（Store优先，Storage降级）
 * Store 是运行时唯一数据源，Storage 仅在 Store 尚未初始化时降级使用
 */
function getAccessToken(): string {
  const store = getUserStore()
  if (store && store.accessToken) {
    return store.accessToken
  }
  return wx.getStorageSync('access_token') || ''
}

/**
 * 从 Store 获取 refresh_token（Store优先，Storage降级）
 */
function getRefreshToken(): string {
  const store = getUserStore()
  if (store && store.refreshToken) {
    return store.refreshToken
  }
  return wx.getStorageSync('refresh_token') || ''
}

const { getApiConfig, getDevelopmentConfig, getSecurityConfig } = require('../../config/env')

/* 内部直接引用，避免循环依赖 */
const { validateJWTTokenIntegrity } = require('../util')
const wechatUtils = require('../wechat')

// ===== V4.0 API客户端类 =====

/**
 * V4.0 API客户端类
 * 基于V4统一引擎架构，JWT Token自动管理和刷新，统一响应格式处理
 */
class APIClient {
  /** API配置 */
  private config: ReturnType<typeof getApiConfig>
  /** 开发配置 */
  private devConfig: ReturnType<typeof getDevelopmentConfig>
  /** 安全配置 */
  private securityConfig: ReturnType<typeof getSecurityConfig>
  /** Token刷新状态（防止并发刷新） */
  private isRefreshing: boolean
  /** 等待Token刷新的请求队列 */
  private refreshSubscribers: Array<(_value: any) => void>

  constructor() {
    this.config = getApiConfig()
    this.devConfig = getDevelopmentConfig()
    this.securityConfig = getSecurityConfig()
    this.isRefreshing = false
    this.refreshSubscribers = []

    log.info('🚀 V4.0 API Client初始化完成', {
      baseURL: this.config.fullUrl,
      apiVersion: 'v4.0',
      isDevelopment: this.devConfig.enableUnifiedAuth
    })
  }

  /** 统一请求方法（集成自动loading和错误提示） */
  async request(url: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const {
      method = 'GET',
      data = {},
      needAuth = true,
      timeout = 15000,
      showLoading = true,
      loadingText = '加载中...',
      showError = true,
      errorPrefix = '',
      header: customHeaders = {}
    } = options

    const fullUrl: string = `${this.config.fullUrl}${url}`

    log.info('\n🚀=================== V4.0 API请求 ===================')
    log.info(`📤 ${method} ${fullUrl}`)
    log.info('📋 请求数据:', data)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders
    }

    // 认证处理 - JWT Token（Store优先，Storage降级）
    if (needAuth) {
      const token: string = getAccessToken()
      if (token) {
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error('🚨 Token完整性检查失败', integrityCheck.error)
          return this.handleTokenInvalid()
        }
        headers.Authorization = `Bearer ${token}`
      } else {
        log.error('❌ 未找到access_token')
        return this.handleTokenMissing()
      }
    }

    if (showLoading) {
      wechatUtils.showLoading(loadingText)
    }

    const startTime: number = Date.now()
    /**
     * Loading隐藏标志：防止 catch + finally 重复调用 hideLoading
     * 微信小程序中 hideLoading 会同时关闭 showToast，
     * 必须保证 hideLoading 在 showToast 之前调用，且只调用一次
     */
    let loadingHidden = false

    try {
      const response: any = await new Promise((resolve, reject) => {
        wx.request({
          url: fullUrl,
          method: method as any,
          data,
          header: headers,
          timeout,
          success: resolve,
          fail: reject
        })
      })

      const duration: number = Date.now() - startTime
      log.info(`✅ API请求成功，耗时: ${duration}ms`)
      log.info('📦 响应数据:', response.data)
      log.info('=======================================================\n')

      return this.handleResponse(response, options, url)
    } catch (error: any) {
      const duration: number = Date.now() - startTime
      log.error(`❌ API请求失败，耗时: ${duration}ms`, error)
      log.info('=======================================================\n')

      /**
       * ⚠️ hideLoading 必须在 showToast 之前（微信小程序框架要求）
       * hideLoading 会关闭所有浮层（包括 showToast），
       * 所以必须先关闭 Loading，再显示错误 Toast
       */
      if (showLoading && !loadingHidden) {
        wechatUtils.hideLoading()
        loadingHidden = true
      }

      if (showError) {
        const errorMessage: string = errorPrefix
          ? `${errorPrefix}${error.message || '请求失败'}`
          : error.message || '网络请求失败'
        wechatUtils.showToast(errorMessage, 'none', 2000)
      }

      throw this.handleError(error)
    } finally {
      /* 正常返回 / handleResponse 内部 throw 时隐藏 Loading */
      if (showLoading && !loadingHidden) {
        wechatUtils.hideLoading()
      }
    }
  }

  /** 处理响应数据 - V4.0统一响应格式 */
  handleResponse(
    response: any,
    requestOptions?: RequestOptions,
    requestUrl?: string
  ): ApiResponse | Promise<ApiResponse> {
    const { statusCode, data } = response

    if (statusCode === 401) {
      const serverErrorCode: string = data && (data.code || data.error)
      const serverMessage: string = data && data.message
      log.error('🔒 认证失败(401):', { serverErrorCode, serverMessage })

      if (serverErrorCode === 'TOKEN_EXPIRED') {
        log.info('🔄 Token已过期，尝试自动刷新')
        return this.handleTokenExpired()
      }
      return this.handleTokenInvalid(data)
    }

    if (statusCode === 403) {
      log.error('🚫 权限不足(403):', data && data.code)
      throw this._createApiError(
        data.message || '权限不足',
        (data && data.code) || 'FORBIDDEN',
        statusCode
      )
    }

    if (statusCode === 404) {
      log.error('❌ 资源不存在(404)')
      throw this._createApiError(
        data.message || '请求的资源不存在',
        (data && data.code) || 'NOT_FOUND',
        statusCode
      )
    }

    if (statusCode === 409) {
      const errorCode: string = data && data.code
      log.error('⚠️ 冲突(409):', errorCode)

      if (errorCode === 'CONCURRENT_CONFLICT' && requestOptions && !requestOptions._retried) {
        log.info('🔄 CONCURRENT_CONFLICT 自动重试')
        requestOptions._retried = true
        return this.request(requestUrl!, requestOptions)
      }
      throw this._createApiError(data.message || '数据冲突', errorCode || 'CONFLICT', statusCode)
    }

    if (statusCode === 429) {
      log.error('🚦 频率限制(429)')
      throw this._createApiError(
        data.message || '操作过于频繁，请稍后再试',
        (data && data.code) || 'RATE_LIMIT_EXCEEDED',
        statusCode
      )
    }

    if (statusCode === 500) {
      log.error('🚨 服务器错误(500)')
      throw this._createApiError(
        data.message || '服务器内部错误',
        (data && data.code) || 'INTERNAL_ERROR',
        statusCode
      )
    }

    if (statusCode === 503) {
      log.error('🔧 服务不可用(503)')
      throw this._createApiError(
        data.message || '服务暂时不可用，请稍后重试',
        (data && data.code) || 'SERVICE_UNAVAILABLE',
        statusCode
      )
    }

    if (statusCode === 400) {
      log.error('❌ 请求错误(400):', data && data.code)
      throw this._createApiError(
        data.message || '请求参数错误',
        (data && data.code) || 'BAD_REQUEST',
        statusCode,
        (data && data.data) || null
      )
    }

    if (statusCode === 200 || statusCode === 201) {
      if (data && typeof data === 'object') {
        if (data.success === true) {
          return data
        } else if (data.success === false) {
          throw this._createApiError(
            data.message || '操作失败',
            data.code || 'BUSINESS_ERROR',
            statusCode,
            data.data || null
          )
        } else {
          throw new Error('API响应格式错误：缺少success字段')
        }
      }
      return data
    }

    throw this._createApiError(
      `HTTP ${statusCode}: ${(data && data.message) || '请求失败'}`,
      (data && data.code) || 'UNKNOWN_ERROR',
      statusCode
    )
  }

  /** 创建带业务错误码的Error对象 */
  _createApiError(message: string, code: string, httpStatus: number, errorData?: any): ApiError {
    const apiError: ApiError = new Error(message) as ApiError
    apiError.code = code
    apiError.statusCode = httpStatus
    if (errorData !== undefined && errorData !== null) {
      apiError.data = errorData
    }
    return apiError
  }

  /** 处理网络错误 */
  handleError(networkError: any): Error {
    if (networkError.errMsg) {
      if (networkError.errMsg.includes('timeout')) {
        return new Error('请求超时，请检查网络连接')
      } else if (networkError.errMsg.includes('fail')) {
        return new Error('网络请求失败，请检查网络连接')
      }
    }
    return networkError
  }

  /** 处理Token缺失 - 引导用户登录 */
  handleTokenMissing(): never {
    wx.showModal({
      title: '未登录',
      content: '请先登录后再进行操作',
      showCancel: false,
      success: () => {
        wx.redirectTo({ url: '/pages/auth/auth' })
      }
    })
    throw new Error('未登录')
  }

  /** 处理Token无效 - 清除登录状态并引导重新登录 */
  handleTokenInvalid(responseData?: any): never {
    const appInstance = getAppInstance()
    if (appInstance) {
      appInstance.clearAuthData()
    }

    const errorCode: string = (responseData && responseData.code) || 'TOKEN_INVALID'
    const errorMessage: string =
      (responseData && responseData.message) || '登录状态已失效，请重新登录'

    log.error('🔒 Token无效处理:', { errorCode, errorMessage })

    const error: ApiError = new Error(errorMessage) as ApiError
    error.isAuthError = true
    error.code = errorCode

    const pages = getCurrentPages()
    const currentRoute: string = pages.length > 0 ? pages[pages.length - 1].route || '' : ''
    if (currentRoute !== 'pages/auth/auth') {
      wx.showModal({
        title: '登录已失效',
        content: errorMessage,
        showCancel: false,
        success: () => {
          wx.redirectTo({ url: '/pages/auth/auth' })
        }
      })
    }

    throw error
  }

  /** 处理Token过期 - 自动刷新机制（防止并发刷新） */
  async handleTokenExpired(): Promise<any> {
    if (this.isRefreshing) {
      return new Promise(resolve => {
        this.refreshSubscribers.push(resolve)
      })
    }

    this.isRefreshing = true

    try {
      const refreshToken: string = getRefreshToken()
      if (!refreshToken) {
        throw new Error('未找到refresh_token')
      }

      log.info('🔄 开始刷新Token...')

      const response = await this.request('/auth/refresh', {
        method: 'POST',
        data: { refresh_token: refreshToken },
        needAuth: false
      })

      if (response.success && response.data) {
        const { access_token, refresh_token: newRefreshToken } = response.data

        // 通过 Store 统一更新Token（Store内部自动同步到Storage）
        const store = getUserStore()
        if (store) {
          store.updateAccessToken(access_token)
          store.updateRefreshToken(newRefreshToken)
        } else {
          // Store 尚未初始化时降级直接写 Storage（仅在启动早期可能发生）
          wx.setStorageSync('access_token', access_token)
          wx.setStorageSync('refresh_token', newRefreshToken)
        }

        // 通知App实例（兼容其他需要Token的组件）
        const appInstance = getAppInstance()
        if (appInstance) {
          appInstance.setAccessToken(access_token)
          appInstance.setRefreshToken(newRefreshToken)
        }

        log.info('✅ Token刷新成功')

        this.refreshSubscribers.forEach(callback => callback(access_token))
        this.refreshSubscribers = []

        return response
      } else {
        throw new Error('Token刷新失败')
      }
    } catch (error) {
      log.error('❌ Token刷新失败:', error)
      this.refreshSubscribers.forEach(callback => callback(null))
      this.refreshSubscribers = []
      this.handleTokenInvalid()
      throw error
    } finally {
      this.isRefreshing = false
    }
  }
}

// 创建全局单例
const apiClient = new APIClient()

module.exports = { APIClient, apiClient }

export {}
