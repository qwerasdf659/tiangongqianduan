/**
 * V4.0 API客户端核心模块
 *
 * 职责: APIClient类、请求响应处理、Token管理、错误处理
 * 各业务API子模块通过 apiClient 单例发起请求
 *
 * @file 天工平台 - API客户端核心
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
  /**
   * 可选认证（默认false）：用于后端 optionalAuth 中间件的公开接口。
   * 为 true 时：有 token 则携带 Authorization（登录态拿个性化/计费内容），
   * 无 token 也照常发请求（匿名拿公开内容），不像 needAuth 那样无 token 即早退。
   * 与 needAuth 互斥：optionalAuth=true 时 needAuth 视为 false。
   */
  optionalAuth?: boolean
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
  /** 内部使用：Token刷新后重试标记（防止 401→刷新→重试→401 无限循环） */
  _tokenRefreshed?: boolean
  /** 内部使用：429限流退避重试次数（仅幂等GET，防止无限重试） */
  _rateLimitRetryCount?: number
}

/** 文件上传选项 */
interface UploadFileOptions {
  /** 表单字段名 */
  name?: string
  /** 额外表单数据 */
  formData?: Record<string, any>
  /** 是否需要认证（默认true） */
  needAuth?: boolean
  /** 是否自动显示错误toast（默认true） */
  showError?: boolean
  /** 错误提示前缀 */
  errorPrefix?: string
  /** 自定义请求头 */
  header?: Record<string, string>
  /** 内部使用：Token刷新后重试标记 */
  _tokenRefreshed?: boolean
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
      log.warn('无法获取App实例:', error)
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
      log.warn('无法获取userStore:', error)
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
const { getDeviceId } = require('../device')

// ===== V4.0 API客户端类 =====

/**
 * V4.0 API客户端类
 * 基于V4统一引擎架构，JWT Token自动管理和刷新，统一响应格式处理
 */
class APIClient {
  /** 防止并发Token缺失弹窗（类级别锁） */
  static _tokenMissingModalShown: boolean = false
  /** API配置 */
  private config: ReturnType<typeof getApiConfig>
  /** 开发配置 */
  private devConfig: ReturnType<typeof getDevelopmentConfig>
  /** 安全配置 */
  private securityConfig: ReturnType<typeof getSecurityConfig>
  /** Token刷新状态（防止并发刷新） */
  private isRefreshing: boolean
  /** 等待Token刷新的请求队列（并发请求等待Token刷新后统一resolve） */
  private refreshSubscribers: Array<(_value: any) => void>
  /**
   * in-flight 请求去重表（治理项4）：仅幂等 GET 参与去重
   * key = method+url+序列化data；相同请求在途时后来者复用同一 Promise，避免冷启动重复并发
   */
  private inFlightRequests: Map<string, Promise<ApiResponse>>

  /** 429限流退避重试上限（仅幂等GET，超过则抛错，防止自伤洪峰） */
  private static readonly RATE_LIMIT_MAX_RETRY: number = 2
  /** 429退避基数（毫秒）：实际延迟 = base * 2^n + 抖动 */
  private static readonly RATE_LIMIT_BASE_DELAY: number = 500
  /** 429退避抖动上限（毫秒）：随机抖动避免一批客户端同步重试形成二次洪峰 */
  private static readonly RATE_LIMIT_JITTER: number = 300

  constructor() {
    this.config = getApiConfig()
    this.devConfig = getDevelopmentConfig()
    this.securityConfig = getSecurityConfig()
    this.isRefreshing = false
    this.refreshSubscribers = []
    this.inFlightRequests = new Map()

    log.info('V4.0 API Client初始化完成', {
      baseURL: this.config.fullUrl,
      apiVersion: 'v4.0',
      isDevelopment: this.devConfig.enableUnifiedAuth
    })
  }

  /**
   * 统一请求入口（治理项4：in-flight 去重层）
   *
   * 仅对幂等 GET 且非内部重试的请求做去重：相同 method+url+data 在途时，
   * 后来者复用同一个 Promise，避免冷启动多个组件同时请求同一份配置造成重复并发。
   * 写操作（POST/PUT/DELETE）与内部重试（携带 _retried/_tokenRefreshed/_rateLimitRetryCount）不去重，
   * 直接走 _performRequest，保证每次写都是独立业务意图、重试链路不被去重干扰。
   */
  async request(url: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const method = options.method || 'GET'
    const isInternalRetry =
      options._retried || options._tokenRefreshed || options._rateLimitRetryCount !== undefined
    if (method !== 'GET' || isInternalRetry) {
      return this._performRequest(url, options)
    }

    const dedupKey = `${method} ${url} ${JSON.stringify(options.data || {})}`
    const pending = this.inFlightRequests.get(dedupKey)
    if (pending) {
      log.info('[dedup] 复用在途请求，不重复发送:', dedupKey)
      return pending
    }

    const requestPromise = this._performRequest(url, options).finally(() => {
      this.inFlightRequests.delete(dedupKey)
    })
    this.inFlightRequests.set(dedupKey, requestPromise)
    return requestPromise
  }

  /** 统一请求方法（集成自动loading和错误提示） */
  async _performRequest(url: string, options: RequestOptions = {}): Promise<ApiResponse> {
    // 维护模式拦截（健康检查通过 wx.request 直接调用，不走此方法）
    if (APIClient._isMaintenanceMode && url !== '/system/status') {
      this._showMaintenanceModal()
      throw this._createApiError('系统维护中，请稍后重试', 'SYSTEM_MAINTENANCE', 503)
    }

    const {
      method = 'GET',
      data = {},
      needAuth = true,
      optionalAuth = false,
      timeout = 15000,
      showLoading = true,
      loadingText = '加载中...',
      showError = true,
      errorPrefix = '',
      header: customHeaders = {}
    } = options

    /**
     * optionalAuth 与 needAuth 互斥：声明可选认证时，强制关闭强制认证分支，
     * 否则 needAuth 默认 true 会先进入"无 token 即抛错"分支，optionalAuth 永远轮不到。
     * 调用方只需写 optionalAuth:true，无需再显式传 needAuth:false。
     */
    const effectiveNeedAuth = optionalAuth ? false : needAuth

    const fullUrl: string = `${this.config.fullUrl}${url}`

    log.info('\n=================== V4.0 API请求 ===================')
    log.info(`${method} ${fullUrl}`)
    log.info('请求数据:', data)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-platform': 'wechat_mp',
      /**
       * 设备会话标识（对接文档 3.1/5.5）：所有请求携带持久化设备 UUID，
       * 后端按 (user_id, device_id) 做会话隔离；与全项目会话体系对齐（管理端 localStorage 同方案）
       */
      'X-Device-Id': getDeviceId(),
      ...customHeaders
    }

    // 认证处理 - JWT Token（Store优先，Storage降级）
    if (effectiveNeedAuth) {
      const token: string = getAccessToken()
      if (token) {
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error(' Token完整性检查失败', integrityCheck.error)
          return this.handleTokenInvalid()
        }
        headers.Authorization = `Bearer ${token}`
      } else {
        log.error('未找到access_token')
        return this.handleTokenMissing()
      }
    } else if (optionalAuth) {
      /**
       * 可选认证（对应后端 optionalAuth 中间件）：有 token 则带上（拿个性化/计费内容），
       * 无 token 也不早退、照常匿名请求（拿公开内容）。token 损坏时静默不带，按匿名处理，
       * 不走 handleTokenInvalid（公开接口不应因本地脏 token 触发全局登出）。
       */
      const optToken: string = getAccessToken()
      if (optToken && validateJWTTokenIntegrity(optToken).isValid) {
        headers.Authorization = `Bearer ${optToken}`
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
      log.info(`API请求成功，耗时: ${duration}ms`)
      log.info('响应数据:', response.data)
      log.info('=======================================================\n')

      return this.handleResponse(response, options, url)
    } catch (error: any) {
      const duration: number = Date.now() - startTime
      log.error(`API请求失败，耗时: ${duration}ms`, error)
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

  /** 统一文件上传方法（复用 JWT 校验、401 刷新、维护模式与错误模型） */
  async uploadFile(
    url: string,
    filePath: string,
    options: UploadFileOptions = {}
  ): Promise<ApiResponse> {
    if (APIClient._isMaintenanceMode && url !== '/system/status') {
      this._showMaintenanceModal()
      throw this._createApiError('系统维护中，请稍后重试', 'SYSTEM_MAINTENANCE', 503)
    }

    const {
      name = 'file',
      formData = {},
      needAuth = true,
      showError = true,
      errorPrefix = '',
      header: customHeaders = {},
      _tokenRefreshed = false
    } = options

    const fullUrl: string = `${this.config.fullUrl}${url}`
    const headers: Record<string, string> = {
      'x-platform': 'wechat_mp',
      /** 设备会话标识（对接文档 3.1/5.5）：与 request 一致，所有请求携带持久化设备 UUID */
      'X-Device-Id': getDeviceId(),
      ...customHeaders
    }

    if (needAuth) {
      const token: string = getAccessToken()
      if (token) {
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error('上传 Token完整性检查失败', integrityCheck.error)
          return this.handleTokenInvalid()
        }
        headers.Authorization = `Bearer ${token}`
      } else {
        log.error('上传未找到access_token')
        return this.handleTokenMissing()
      }
    }

    try {
      const response: any = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: fullUrl,
          filePath,
          name,
          formData,
          header: headers,
          success: resolve,
          fail: reject
        })
      })

      const parsedData = response.data ? JSON.parse(response.data) : null
      const uploadResponse = {
        statusCode: response.statusCode,
        data: parsedData
      }

      return await this._handleUploadResponse(uploadResponse, url, filePath, {
        name,
        formData,
        needAuth,
        showError,
        errorPrefix,
        header: customHeaders,
        _tokenRefreshed
      })
    } catch (error: any) {
      const normalizedError =
        error instanceof Error ? error : new Error(error?.errMsg || '文件上传网络错误')

      if (showError) {
        const errorMessage = errorPrefix
          ? `${errorPrefix}${normalizedError.message}`
          : normalizedError.message
        wechatUtils.showToast(errorMessage, 'none', 2000)
      }

      throw this.handleError(normalizedError)
    }
  }

  /**
   * 处理响应数据 - V4.0统一响应格式
   *
   * 空值保护: 服务端可能返回空响应体（data 为 null/undefined），
   * 所有 data 属性访问前统一通过 safeData 安全引用，防止 TypeError 崩溃
   */
  handleResponse(
    response: any,
    requestOptions?: RequestOptions,
    requestUrl?: string
  ): ApiResponse | Promise<ApiResponse> {
    const { statusCode } = response
    const safeData: Record<string, any> =
      response.data && typeof response.data === 'object' ? response.data : {}

    if (statusCode === 401) {
      const serverErrorCode: string = safeData.code || safeData.error || ''
      const serverMessage: string = safeData.message || ''
      log.error('认证失败(401):', { serverErrorCode, serverMessage })

      /**
       * needAuth:false 或 optionalAuth:true 的请求收到 401 时，不触发全局登录失效逻辑。
       * 这类请求本身不强制认证（公开/可选登录接口），后端返回 401 说明该接口尚未改为 optionalAuth
       * 或 token 已失效；只抛出错误让调用方 catch 处理，不弹窗不清 Token、不强制登出。
       */
      if (
        requestOptions &&
        (requestOptions.needAuth === false || requestOptions.optionalAuth === true)
      ) {
        throw this._createApiError(
          serverMessage || '认证失败',
          serverErrorCode || 'AUTH_FAILED',
          statusCode
        )
      }

      /**
       * 401 错误码分类处理（对齐后端 middleware/auth.js 细分错误码）
       *
       * TOKEN_EXPIRED    → JWT 过期，自动刷新 Token
       * SESSION_EXPIRED  → 会话超时（7天未使用），尝试刷新（后端会创建新会话）
       * SESSION_REPLACED → 同平台其他设备登录导致当前会话被替换（方案B平台隔离：跨平台不互踢）
       * SESSION_REVOKED / SESSION_NOT_FOUND / MISSING_TOKEN / INVALID_TOKEN → 清除Token，跳登录页
       */
      if (serverErrorCode === 'TOKEN_EXPIRED' || serverErrorCode === 'SESSION_EXPIRED') {
        if (requestOptions?._tokenRefreshed) {
          log.error('Token刷新后重试仍返回401，清除登录状态')
          return this.handleTokenInvalid(response.data)
        }
        log.info(
          serverErrorCode === 'TOKEN_EXPIRED'
            ? 'Token已过期，尝试自动刷新并重试原始请求'
            : '会话已过期，尝试刷新Token并重试原始请求'
        )
        return this.handleTokenExpired(requestUrl, requestOptions)
      }

      if (serverErrorCode === 'SESSION_REPLACED') {
        return this.handleSessionReplaced(serverMessage)
      }

      return this.handleTokenInvalid(response.data)
    }

    if (statusCode === 403) {
      log.error('权限不足(403):', safeData.code)
      throw this._createApiError(
        safeData.message || '权限不足',
        safeData.code || 'FORBIDDEN',
        statusCode
      )
    }

    if (statusCode === 404) {
      log.error('资源不存在(404)')
      throw this._createApiError(
        safeData.message || '请求的资源不存在',
        safeData.code || 'NOT_FOUND',
        statusCode
      )
    }

    if (statusCode === 409) {
      const errorCode: string = safeData.code || ''
      log.error('冲突(409):', errorCode)

      if (errorCode === 'CONCURRENT_CONFLICT' && requestOptions && !requestOptions._retried) {
        log.info('CONCURRENT_CONFLICT 自动重试（延迟500ms）')
        requestOptions._retried = true
        return new Promise<ApiResponse>(resolve => {
          setTimeout(() => resolve(this.request(requestUrl!, requestOptions)), 500)
        })
      }
      throw this._createApiError(
        safeData.message || '数据冲突',
        errorCode || 'CONFLICT',
        statusCode
      )
    }

    if (statusCode === 429) {
      log.error('频率限制(429)')

      /**
       * 治理项1：仅对幂等 GET 做指数退避+抖动重试（写操作绝不自动重试，防重复下单）
       * 退避延迟 = base * 2^n + 随机抖动；最多重试 RATE_LIMIT_MAX_RETRY 次，超过则抛错。
       * 优先采用后端 Retry-After 头 / data.retry_after_seconds（若提供），否则用退避公式。
       */
      const isGet = !requestOptions || (requestOptions.method || 'GET') === 'GET'
      const retryCount = requestOptions?._rateLimitRetryCount || 0
      if (isGet && requestUrl && retryCount < APIClient.RATE_LIMIT_MAX_RETRY) {
        const serverRetrySeconds =
          Number(response.header?.['Retry-After'] || safeData.retry_after_seconds) || 0
        const backoffDelay =
          serverRetrySeconds > 0
            ? serverRetrySeconds * 1000
            : APIClient.RATE_LIMIT_BASE_DELAY * Math.pow(2, retryCount) +
              Math.floor(Math.random() * APIClient.RATE_LIMIT_JITTER)
        log.info(`限流退避重试: 第${retryCount + 1}次，延迟${backoffDelay}ms`)
        return new Promise<ApiResponse>(resolve => {
          setTimeout(() => {
            resolve(
              this.request(requestUrl, {
                ...requestOptions,
                _rateLimitRetryCount: retryCount + 1
              })
            )
          }, backoffDelay)
        })
      }

      throw this._createApiError(
        safeData.message || '操作过于频繁，请稍后再试',
        safeData.code || 'RATE_LIMIT_EXCEEDED',
        statusCode,
        safeData.data || null
      )
    }

    if (statusCode === 500) {
      log.error('服务器错误(500)')
      throw this._createApiError(
        safeData.message || '服务器内部错误',
        safeData.code || 'INTERNAL_ERROR',
        statusCode
      )
    }

    if (statusCode === 503) {
      const maintenanceCode: string = safeData.code || 'SERVICE_UNAVAILABLE'
      log.error('服务不可用(503):', maintenanceCode)

      if (maintenanceCode === 'SYSTEM_MAINTENANCE') {
        this._showMaintenanceModal(safeData.message)
      }

      throw this._createApiError(
        safeData.message || '服务暂时不可用，请稍后重试',
        maintenanceCode,
        statusCode
      )
    }

    if (statusCode === 400) {
      log.error('请求错误(400):', safeData.code)
      throw this._createApiError(
        safeData.message || '请求参数错误',
        safeData.code || 'BAD_REQUEST',
        statusCode,
        safeData.data || null
      )
    }

    if (statusCode === 200 || statusCode === 201) {
      if (!response.data || typeof response.data !== 'object') {
        log.warn('API返回空响应体或非对象响应, statusCode:', statusCode)
        return { success: true, data: response.data ?? null }
      }

      if (safeData.success === true) {
        return response.data
      } else if (safeData.success === false) {
        throw this._createApiError(
          safeData.message || '操作失败',
          safeData.code || 'BUSINESS_ERROR',
          statusCode,
          safeData.data || null
        )
      } else {
        throw new Error('API响应格式错误：缺少success字段')
      }
    }

    throw this._createApiError(
      `HTTP ${statusCode}: ${safeData.message || '请求失败'}`,
      safeData.code || 'UNKNOWN_ERROR',
      statusCode
    )
  }

  private async _handleUploadResponse(
    response: any,
    requestUrl: string,
    filePath: string,
    uploadOptions: UploadFileOptions
  ): Promise<ApiResponse> {
    const safeData: Record<string, any> =
      response.data && typeof response.data === 'object' ? response.data : {}

    if (response.statusCode === 401) {
      const serverErrorCode: string = safeData.code || safeData.error || ''
      const serverMessage: string = safeData.message || ''

      if (serverErrorCode === 'TOKEN_EXPIRED' || serverErrorCode === 'SESSION_EXPIRED') {
        if (uploadOptions._tokenRefreshed) {
          return this.handleTokenInvalid(response.data)
        }
        await this.handleTokenExpired()
        return this.uploadFile(requestUrl, filePath, {
          ...uploadOptions,
          _tokenRefreshed: true
        })
      }

      if (serverErrorCode === 'SESSION_REPLACED') {
        return this.handleSessionReplaced(serverMessage)
      }

      return this.handleTokenInvalid(response.data)
    }

    if (response.statusCode === 413) {
      throw this._createApiError(
        safeData.message || '上传文件超过限制',
        safeData.code || 'PAYLOAD_TOO_LARGE',
        response.statusCode,
        safeData.data || null
      )
    }

    return this.handleResponse(response, undefined, requestUrl) as ApiResponse
  }

  /** 创建带业务错误码的Error对象 */
  private _createApiError(
    message: string,
    code: string,
    httpStatus: number,
    errorData?: any
  ): ApiError {
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

  /**
   * 处理Token缺失 - 静默抛出认证错误
   * 不再弹窗和跳转（未登录是正常状态，由页面级逻辑处理登录引导）
   */
  handleTokenMissing(): never {
    const error: ApiError = new Error('用户未登录') as ApiError
    error.isAuthError = true
    error.code = 'MISSING_TOKEN'
    throw error
  }

  /**
   * 处理Token无效 - 清除登录状态并引导重新登录
   * 使用静态标志防止并发请求导致多次弹窗
   */
  handleTokenInvalid(responseData?: any): never {
    const appInstance = getAppInstance()
    if (appInstance) {
      appInstance.clearAuthData()
    }

    const errorCode: string = (responseData && responseData.code) || 'TOKEN_INVALID'
    const errorMessage: string =
      (responseData && responseData.message) || '登录状态已失效，请重新登录'

    log.error('Token无效处理:', { errorCode, errorMessage })

    const error: ApiError = new Error(errorMessage) as ApiError
    error.isAuthError = true
    error.code = errorCode

    if (!APIClient._tokenMissingModalShown) {
      const pages = getCurrentPages()
      APIClient._tokenMissingModalShown = true
      wx.showModal({
        title: '登录已失效',
        content: errorMessage,
        showCancel: false,
        success: () => {
          APIClient._tokenMissingModalShown = false
          const currentPage: any = pages.length > 0 ? pages[pages.length - 1] : null
          if (currentPage && currentPage.onShowLoginPopup) {
            currentPage.onShowLoginPopup()
          }
        }
      })
    }

    throw error
  }

  /**
   * 处理会话被替换 — 同平台其他设备登录（方案B平台隔离）
   *
   * 后端采用按平台隔离会话（user_id + login_platform），同平台新登录会替换旧会话，
   * 跨平台（如Web登录）不会影响微信小程序会话。
   * 与 handleTokenInvalid 区别：向用户明确说明原因是"同平台其他设备登录"
   */
  handleSessionReplaced(serverMessage?: string): never {
    const appInstance = getAppInstance()
    if (appInstance) {
      appInstance.clearAuthData()
    }

    const displayMessage: string = serverMessage || '您的账号已在其他设备登录，请重新登录'

    if (!APIClient._tokenMissingModalShown) {
      const pages = getCurrentPages()
      APIClient._tokenMissingModalShown = true
      wx.showModal({
        title: '账号已在其他设备登录',
        content: displayMessage,
        showCancel: false,
        success: () => {
          APIClient._tokenMissingModalShown = false
          const currentPage: any = pages.length > 0 ? pages[pages.length - 1] : null
          if (currentPage && currentPage.onShowLoginPopup) {
            currentPage.onShowLoginPopup()
          }
        }
      })
    }

    const error: ApiError = new Error(displayMessage) as ApiError
    error.isAuthError = true
    error.code = 'SESSION_REPLACED'
    throw error
  }

  /**
   * 系统维护模式 — 持久阻止用户操作
   *
   * 后端返回 503 + code: SYSTEM_MAINTENANCE 时进入维护模式:
   *  1. 设置 _isMaintenanceMode = true，后续所有 API 请求立即拒绝
   *  2. 通过 App.enterMaintenanceMode() 显示全屏维护遮罩（降级为 wx.showModal）
   *  3. 启动健康检查定时器（每30秒轮询一次），维护结束后自动恢复
   */
  static _maintenanceModalShown: boolean = false
  static _isMaintenanceMode: boolean = false
  static _healthCheckTimer: ReturnType<typeof setInterval> | null = null
  /** 健康检查已执行次数（上限20次 = 10分钟后停止轮询） */
  static _healthCheckCount: number = 0
  /** 健康检查最大次数（30秒×20次 = 10分钟） */
  static readonly _healthCheckMaxAttempts: number = 20

  _showMaintenanceModal(serverMessage?: string): void {
    if (APIClient._maintenanceModalShown) {
      return
    }
    APIClient._isMaintenanceMode = true
    APIClient._maintenanceModalShown = true

    this._startHealthCheck()

    APIClient._healthCheckCount = 0

    const appRef = getAppInstance()
    if (appRef && typeof appRef.enterMaintenanceMode === 'function') {
      appRef.enterMaintenanceMode(serverMessage)
    } else {
      wx.showModal({
        title: '系统维护中',
        content: serverMessage || '系统正在进行数据维护，请稍后再试',
        showCancel: false
      })
    }
  }

  /**
   * 后台健康检查 — 每30秒向后端发送轻量请求判断维护是否结束
   * 使用无认证的 /system/status 端点，绕过维护模式拦截
   */
  private _startHealthCheck(): void {
    if (APIClient._healthCheckTimer) {
      return
    }

    const healthCheckInterval = 30000
    log.info('维护模式: 启动健康检查定时器，间隔', healthCheckInterval, 'ms')

    APIClient._healthCheckTimer = setInterval(() => {
      APIClient._healthCheckCount++
      if (APIClient._healthCheckCount > APIClient._healthCheckMaxAttempts) {
        log.warn('维护模式: 健康检查超过最大次数', APIClient._healthCheckMaxAttempts, '，停止轮询')
        if (APIClient._healthCheckTimer) {
          clearInterval(APIClient._healthCheckTimer)
          APIClient._healthCheckTimer = null
        }
        return
      }
      wx.request({
        url: `${this.config.fullUrl}/system/status`,
        method: 'GET',
        timeout: 5000,
        header: {
          'x-platform': 'wechat_mp'
          // 健康检查为未认证的系统探活请求，不携带设备标识（最小必要原则）
        },
        success: (res: any) => {
          if (res.statusCode === 200) {
            log.info('维护模式: 健康检查通过，服务已恢复')
            this._onMaintenanceRecovered()
          }
        },
        fail: () => {
          log.info('维护模式: 健康检查失败，服务仍在维护')
        }
      })
    }, healthCheckInterval)
  }

  /** 维护结束 — 恢复所有内部状态，通知 App 退出维护模式 */
  _onMaintenanceRecovered(): void {
    APIClient._isMaintenanceMode = false
    APIClient._maintenanceModalShown = false

    if (APIClient._healthCheckTimer) {
      clearInterval(APIClient._healthCheckTimer)
      APIClient._healthCheckTimer = null
    }

    const appRef = getAppInstance()
    if (appRef && typeof appRef.exitMaintenanceMode === 'function') {
      appRef.exitMaintenanceMode()
    }

    wx.showToast({ title: '系统已恢复', icon: 'success', duration: 2000 })
  }

  /**
   * 处理Token过期 - 自动刷新 + 重试原始请求
   *
   * 核心流程:
   * 1. 刷新 access_token（防止并发：仅第一个请求触发刷新，其余排队等待）
   * 2. 刷新成功后，用新 Token 重试触发刷新的那个原始请求
   * 3. 队列中等待的并发请求，各自用新 Token 重试自己的原始请求
   *
   * 防无限循环: 重试请求标记 _tokenRefreshed=true，若仍返回401则直接清除登录状态
   *
   * @param originalUrl - 触发401的原始请求路径（用于刷新后重试）
   * @param originalOptions - 触发401的原始请求选项
   */
  async handleTokenExpired(
    originalUrl?: string,
    originalOptions?: RequestOptions
  ): Promise<ApiResponse> {
    if (this.isRefreshing) {
      return new Promise<ApiResponse>((resolve, reject) => {
        this.refreshSubscribers.push((newToken: string | null) => {
          if (newToken && originalUrl) {
            this.request(originalUrl, { ...originalOptions, _tokenRefreshed: true })
              .then(resolve)
              .catch(reject)
          } else {
            const err: ApiError = new Error('Token刷新失败，请重新登录') as ApiError
            err.isAuthError = true
            err.code = 'TOKEN_REFRESH_FAILED'
            reject(err)
          }
        })
      })
    }

    this.isRefreshing = true

    try {
      const refreshToken: string = getRefreshToken()
      if (!refreshToken) {
        throw new Error('未找到refresh_token')
      }

      log.info('开始刷新Token...')

      /**
       * 刷新时携带旧 access_token（即使已过期）
       * 后端从旧 JWT 中提取 session_token 来复用会话并继承 login_platform，
       * 避免创建新会话导致同平台会话被误覆盖（方案B平台隔离策略）
       */
      const oldAccessToken: string = getAccessToken()
      const refreshHeaders: Record<string, string> = {}
      if (oldAccessToken) {
        refreshHeaders.Authorization = `Bearer ${oldAccessToken}`
      }

      const refreshResponse = await this.request('/auth/refresh', {
        method: 'POST',
        data: { refresh_token: refreshToken },
        needAuth: false,
        showLoading: false,
        showError: false,
        header: refreshHeaders
      })

      if (refreshResponse.success && refreshResponse.data) {
        const { access_token, refresh_token: newRefreshToken } = refreshResponse.data

        if (
          typeof access_token !== 'string' ||
          access_token.trim() === '' ||
          typeof newRefreshToken !== 'string' ||
          newRefreshToken.trim() === ''
        ) {
          throw new Error('刷新令牌响应缺少有效的 access_token 或 refresh_token')
        }

        const store = getUserStore()
        if (store) {
          store.updateAccessToken(access_token)
          store.updateRefreshToken(newRefreshToken)
        } else {
          wx.setStorageSync('access_token', access_token)
          wx.setStorageSync('refresh_token', newRefreshToken)
        }

        const appInstance = getAppInstance()
        if (appInstance) {
          appInstance.setAccessToken(access_token)
          appInstance.setRefreshToken(newRefreshToken)
        }

        log.info('Token刷新成功，通知', this.refreshSubscribers.length, '个等待请求重试')

        this.refreshSubscribers.forEach(callback => callback(access_token))
        this.refreshSubscribers = []

        if (originalUrl) {
          return this.request(originalUrl, { ...originalOptions, _tokenRefreshed: true })
        }
        return refreshResponse
      } else {
        throw new Error('Token刷新失败')
      }
    } catch (error) {
      log.error('Token刷新失败:', error)
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
