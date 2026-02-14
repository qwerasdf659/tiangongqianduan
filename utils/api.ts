/**
 * V4.0 API工具类 - 对齐后端V4.7.0真实路由
 *
 * 核心原则:
 *   1. API路径严格按照后端真实路由 - /api/v4/{module}/{action}
 *   2. 统一使用snake_case命名 - user_id, access_token, verification_code
 *   3. JWT Token机制 - access_token + refresh_token双Token
 *   4. 不使用Mock数据 - 所有数据从后端真实API获取
 *   5. 统一错误处理 - 标准化错误响应格式
 *   6. 通过Token识别用户 - 不在路径中传user_id（后端通过JWT解析）
 *
 * @file 天工餐厅积分系统 - V4.0统一引擎API客户端
 * @version 5.0.0
 * @since 2026-02-10
 */

const { createLogger } = require('./logger')
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
  /** loading文案（默认"加载中..."） */
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

// ===== 延迟获取App实例 =====

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

const { getApiConfig, getDevelopmentConfig, getSecurityConfig } = require('../config/env')

// 导入工具函数（避免循环依赖，直接引用内部模块）
const { validateJWTTokenIntegrity } = require('./util')
// 导入微信工具函数（复用showLoading/hideLoading/showToast）
const wechatUtils = require('./wechat')

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
  /** 等待Token刷新的请求队列（存储resolve回调，Token刷新成功后依次调用） */
  private refreshSubscribers: Array<(value: any) => void>

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

    // 构建完整URL
    const fullUrl: string = `${this.config.fullUrl}${url}`

    log.info('\n🚀=================== V4.0 API请求 ===================')
    log.info(`📤 ${method} ${fullUrl}`)
    log.info('📋 请求数据:', data)

    // 构建请求头（支持自定义header合并，如Idempotency-Key）
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...customHeaders
    }

    // 认证处理 - JWT Token
    if (needAuth) {
      const token: string = wx.getStorageSync('access_token')
      if (token) {
        // Token完整性验证
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error('🚨 Token完整性检查失败:', integrityCheck.error)
          return this.handleTokenInvalid()
        }

        headers.Authorization = `Bearer ${token}`
      } else {
        // needAuth为true但Token不存在，触发Token缺失处理
        log.error('❌ 未找到access_token')
        return this.handleTokenMissing()
      }
    }

    // 自动显示loading
    if (showLoading) {
      wechatUtils.showLoading(loadingText)
    }

    const startTime: number = Date.now()

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

      // 处理响应
      return this.handleResponse(response, options, url)
    } catch (error: any) {
      const duration: number = Date.now() - startTime
      log.error(`❌ API请求失败，耗时: ${duration}ms`, error)
      log.info('=======================================================\n')

      // 自动显示错误toast
      if (showError) {
        const errorMessage: string = errorPrefix
          ? `${errorPrefix}${error.message || '请求失败'}`
          : error.message || '网络请求失败'

        wechatUtils.showToast(errorMessage, 'none', 2000)
      }

      throw this.handleError(error)
    } finally {
      // 自动隐藏loading
      if (showLoading) {
        wechatUtils.hideLoading()
      }
    }
  }

  /**
   * 处理响应数据 - V4.0统一响应格式
   * 增强: 429频率限制、503服务不可用、409自动重试
   */
  handleResponse(
    response: any,
    requestOptions?: RequestOptions,
    requestUrl?: string
  ): ApiResponse | Promise<ApiResponse> {
    const { statusCode, data } = response

    // 401认证失败
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

    // 403权限不足
    if (statusCode === 403) {
      log.error('🚫 权限不足(403):', data && data.code)
      throw this._createApiError(
        data.message || '权限不足',
        (data && data.code) || 'FORBIDDEN',
        statusCode
      )
    }

    // 404资源不存在
    if (statusCode === 404) {
      log.error('❌ 资源不存在(404)')
      throw this._createApiError(
        data.message || '请求的资源不存在',
        (data && data.code) || 'NOT_FOUND',
        statusCode
      )
    }

    // 409冲突 - CONCURRENT_CONFLICT自动重试1次
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

    // 429频率限制
    if (statusCode === 429) {
      log.error('🚦 频率限制(429)')
      throw this._createApiError(
        data.message || '操作过于频繁，请稍后再试',
        (data && data.code) || 'RATE_LIMIT_EXCEEDED',
        statusCode
      )
    }

    // 500服务器错误
    if (statusCode === 500) {
      log.error('🚨 服务器错误(500)')
      throw this._createApiError(
        data.message || '服务器内部错误',
        (data && data.code) || 'INTERNAL_ERROR',
        statusCode
      )
    }

    // 503服务不可用
    if (statusCode === 503) {
      log.error('🔧 服务不可用(503)')
      throw this._createApiError(
        data.message || '服务暂时不可用，请稍后重试',
        (data && data.code) || 'SERVICE_UNAVAILABLE',
        statusCode
      )
    }

    // 400请求错误
    if (statusCode === 400) {
      log.error('❌ 请求错误(400):', data && data.code)
      throw this._createApiError(
        data.message || '请求参数错误',
        (data && data.code) || 'BAD_REQUEST',
        statusCode,
        (data && data.data) || null
      )
    }

    // V4.0统一响应格式检查（200/201）
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

    // 其他状态码
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

    // 仅当不在认证页面时才弹窗引导重新登录
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
      const refreshToken: string = wx.getStorageSync('refresh_token')
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

        wx.setStorageSync('access_token', access_token)
        wx.setStorageSync('refresh_token', newRefreshToken)

        // 同步到 MobX Store（access_token + refresh_token 都需要更新）
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
      // 通知所有等待Token刷新的请求：刷新失败
      this.refreshSubscribers.forEach(callback => callback(null))
      this.refreshSubscribers = []
      this.handleTokenInvalid()
      throw error
    } finally {
      this.isRefreshing = false
    }
  }
}

// ============================================================================
// V4.0 API方法集合 - 严格对齐后端真实路由
// ============================================================================

const apiClient = new APIClient()

// ==================== 🔐 认证系统API ====================
// 后端路由: routes/v4/auth/

/** 用户登录 - 后端路由: POST /api/v4/auth/login */
async function userLogin(mobile: string, verification_code: string): Promise<ApiResponse> {
  return apiClient.request('/auth/login', {
    method: 'POST',
    data: { mobile, verification_code },
    needAuth: false
  })
}

/** 快速登录 - 后端路由: POST /api/v4/auth/quick-login */
async function quickLogin(mobile: string): Promise<ApiResponse> {
  return apiClient.request('/auth/quick-login', {
    method: 'POST',
    data: { mobile },
    needAuth: false
  })
}

/** 获取当前用户信息 - 后端路由: GET /api/v4/auth/profile */
async function getUserInfo(): Promise<ApiResponse> {
  return apiClient.request('/auth/profile', { method: 'GET', needAuth: true })
}

/**
 * 发送短信验证码 - 后端路由: POST /api/v4/auth/send-code
 * 🔴 开发/测试环境：后端支持万能验证码123456，无需实际发送短信
 */
async function sendVerificationCode(mobile: string): Promise<ApiResponse> {
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

/** 验证Token有效性 - 后端路由: GET /api/v4/auth/verify */
async function verifyToken(): Promise<ApiResponse> {
  return apiClient.request('/auth/verify', { method: 'GET', needAuth: true })
}

// ==================== 🎰 抽奖系统API ====================
// 后端路由: routes/v4/lottery/

/** 获取抽奖活动列表（通用查询） - 后端路由: GET /api/v4/lottery/campaigns */
async function getLotteryCampaigns(status: string = 'active'): Promise<ApiResponse> {
  return apiClient.request(`/lottery/campaigns?status=${status}`, { method: 'GET', needAuth: true })
}

/**
 * 获取进行中的活动列表（专用端点，需登录）
 * 后端路由: GET /api/v4/lottery/campaigns/active
 *
 * 响应示例：
 * {
 *   success: true,
 *   data: [{
 *     campaign_code: "BASIC_LOTTERY",
 *     campaign_name: "餐厅积分抽奖",
 *     campaign_type: "permanent",
 *     status: "active",
 *     display: { mode: "grid_3x3", effect_theme: "default" },
 *     banner_image_url: null,
 *     start_time: "2025-08-19 00:00:00",
 *     end_time: "2026-12-28 23:59:59"
 *   }]
 * }
 */
async function getActiveCampaigns(): Promise<ApiResponse> {
  return apiClient.request('/lottery/campaigns/active', { method: 'GET', needAuth: true })
}

/** 获取抽奖奖品列表 - 后端路由: GET /api/v4/lottery/campaigns/:campaign_code/prizes */
async function getLotteryPrizes(campaign_code: string): Promise<ApiResponse> {
  return apiClient.request(`/lottery/campaigns/${campaign_code}/prizes`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取抽奖配置 - 后端路由: GET /api/v4/lottery/campaigns/:campaign_code/config
 * 后端返回draw_buttons为数组格式:
 *   draw_buttons: [{ draw_count, discount, label, per_draw, total_cost, original_cost, saved_points }]
 */
async function getLotteryConfig(campaign_code: string): Promise<ApiResponse> {
  return apiClient.request(`/lottery/campaigns/${campaign_code}/config`, {
    method: 'GET',
    needAuth: true
  })
}

/** 执行抽奖 - 后端路由: POST /api/v4/lottery/draw */
async function performLottery(campaign_code: string, draw_count: number = 1): Promise<ApiResponse> {
  const idempotencyKey = `lottery_${campaign_code}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return apiClient.request('/lottery/draw', {
    method: 'POST',
    data: { campaign_code, draw_count },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey }
  })
}

/**
 * 获取当前用户抽奖历史（用户端，JWT解析身份）
 * 后端路由: GET /api/v4/lottery/history
 */
async function getLotteryHistory(page: number = 1, limit: number = 20): Promise<ApiResponse> {
  return apiClient.request(`/lottery/history?page=${page}&limit=${limit}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 管理员查看指定用户抽奖历史（管理端，需admin权限）
 * 后端路由: GET /api/v4/console/lottery-user-analysis/history/:user_id
 */
async function getAdminLotteryHistory(
  user_id: number,
  page: number = 1,
  limit: number = 20
): Promise<ApiResponse> {
  return apiClient.request(
    `/console/lottery-user-analysis/history/${user_id}?page=${page}&limit=${limit}`,
    {
      method: 'GET',
      needAuth: true
    }
  )
}

// ==================== 💰 资产系统API ====================
// 后端路由: routes/v4/assets/ （通过Token识别用户）

/**
 * 获取当前用户积分余额 - 后端路由: GET /api/v4/assets/balance
 * 响应字段: asset_code, available_amount, frozen_amount, total_amount
 */
async function getPointsBalance(asset_code: string = 'POINTS'): Promise<ApiResponse> {
  return apiClient.request(`/assets/balance?asset_code=${asset_code}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取用户资产流水 - 后端路由: GET /api/v4/assets/transactions */
async function getPointsTransactions(
  page: number = 1,
  page_size: number = 20,
  asset_code: string | null = null,
  business_type: string | null = null
): Promise<ApiResponse> {
  let url: string = `/assets/transactions?page=${page}&page_size=${page_size}`
  if (asset_code) {
    url += `&asset_code=${asset_code}`
  }
  if (business_type) {
    url += `&business_type=${business_type}`
  }

  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 获取多种资产余额明细 - 后端路由: GET /api/v4/assets/balances */
async function getAssetBalances(): Promise<ApiResponse> {
  return apiClient.request('/assets/balances', { method: 'GET', needAuth: true })
}

/** 获取资产转换规则 - 后端路由: GET /api/v4/assets/conversion-rules */
async function getConversionRules(): Promise<ApiResponse> {
  return apiClient.request('/assets/conversion-rules', { method: 'GET', needAuth: true })
}

// ==================== 🎒 背包系统API ====================
// 后端路由: routes/v4/backpack/ （双轨结构: assets[] + items[]）

/** 获取用户背包 - 后端路由: GET /api/v4/backpack/ */
async function getUserInventory(): Promise<ApiResponse> {
  return apiClient.request('/backpack', { method: 'GET', needAuth: true })
}

/** 获取背包统计 - 后端路由: GET /api/v4/backpack/stats */
async function getBackpackStats(): Promise<ApiResponse> {
  return apiClient.request('/backpack/stats', { method: 'GET', needAuth: true })
}

/** 获取物品详情 - 后端路由: GET /api/v4/backpack/items/:item_instance_id */
async function getInventoryItem(item_instance_id: number): Promise<ApiResponse> {
  return apiClient.request(`/backpack/items/${item_instance_id}`, { method: 'GET', needAuth: true })
}

/** 使用物品 - 后端路由: POST /api/v4/backpack/items/:item_instance_id/use */
async function useInventoryItem(item_instance_id: number): Promise<ApiResponse> {
  return apiClient.request(`/backpack/items/${item_instance_id}/use`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 生成核销码（到店出示，商家扫码核销）
 * 后端路由: POST /api/v4/backpack/items/:item_instance_id/redeem
 * 业务流程: 用户在背包点击"使用" → 生成核销码 → 到店出示 → 商家扫码核销
 */
async function redeemInventoryItem(item_instance_id: number): Promise<ApiResponse> {
  return apiClient.request(`/backpack/items/${item_instance_id}/redeem`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '生成核销码中...',
    showError: true,
    errorPrefix: '生成失败：'
  })
}

// ==================== 🎁 兑换系统API ====================
// 后端路由: routes/v4/backpack/exchange/ （用户域）

/** 获取兑换商品列表 - 后端路由: GET /api/v4/backpack/exchange/items */
async function getExchangeProducts(
  space: string | null = null,
  category: string | null = null,
  page: number = 1,
  limit: number = 20
): Promise<ApiResponse> {
  let url: string = `/backpack/exchange/items?page=${page}&limit=${limit}`
  if (space) {
    url += `&space=${space}`
  }
  if (category) {
    url += `&category=${category}`
  }

  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 兑换商品 - 后端路由: POST /api/v4/backpack/exchange/ */
async function exchangeProduct(product_id: number, quantity: number = 1): Promise<ApiResponse> {
  return apiClient.request('/backpack/exchange', {
    method: 'POST',
    data: { product_id, quantity },
    needAuth: true
  })
}

/** 获取兑换订单记录 - 后端路由: GET /api/v4/backpack/exchange/orders */
async function getExchangeRecords(
  page: number = 1,
  limit: number = 20,
  status: string | null = null
): Promise<ApiResponse> {
  let url: string = `/backpack/exchange/orders?page=${page}&limit=${limit}`
  if (status) {
    url += `&status=${status}`
  }

  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 取消兑换订单 - 后端路由: POST /api/v4/backpack/exchange/orders/:order_id/cancel */
async function cancelExchange(order_id: string): Promise<ApiResponse> {
  return apiClient.request(`/backpack/exchange/orders/${order_id}/cancel`, {
    method: 'POST',
    needAuth: true
  })
}

/** 获取兑换商品详情 - 后端路由: GET /api/v4/backpack/exchange/items/:exchange_item_id */
async function getExchangeItemDetail(exchange_item_id: string): Promise<ApiResponse> {
  return apiClient.request(`/backpack/exchange/items/${exchange_item_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取兑换订单详情 - 后端路由: GET /api/v4/backpack/exchange/orders/:order_no */
async function getExchangeOrderDetail(order_no: string): Promise<ApiResponse> {
  return apiClient.request(`/backpack/exchange/orders/${order_no}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 商家创建核销订单 - 后端路由: POST /api/v4/shop/redemption/orders（需商家权限） */
async function createRedemptionOrder(params: Record<string, any>): Promise<ApiResponse> {
  return apiClient.request('/shop/redemption/orders', {
    method: 'POST',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '创建核销订单中...',
    showError: true,
    errorPrefix: '创建失败：'
  })
}

// ==================== 🏪 交易市场API ====================
// 后端路由: routes/v4/market/

/** 获取交易市场商品列表 - 后端路由: GET /api/v4/market/listings */
async function getMarketProducts(
  page: number = 1,
  limit: number = 20,
  min_price: number | null = null,
  max_price: number | null = null
): Promise<ApiResponse> {
  let url: string = `/market/listings?page=${page}&limit=${limit}`
  if (min_price !== null) {
    url += `&min_price=${min_price}`
  }
  if (max_price !== null) {
    url += `&max_price=${max_price}`
  }

  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 获取市场商品详情 - 后端路由: GET /api/v4/market/listings/:market_listing_id */
async function getMarketProductDetail(market_listing_id: number): Promise<ApiResponse> {
  return apiClient.request(`/market/listings/${market_listing_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 购买市场商品 - 后端路由: POST /api/v4/market/listings/:market_listing_id/purchase */
async function purchaseMarketProduct(market_listing_id: number): Promise<ApiResponse> {
  return apiClient.request(`/market/listings/${market_listing_id}/purchase`, {
    method: 'POST',
    needAuth: true
  })
}

/** 撤回市场挂单 - 后端路由: POST /api/v4/market/manage/listings/:market_listing_id/withdraw */
async function withdrawMarketProduct(market_listing_id: number): Promise<ApiResponse> {
  return apiClient.request(`/market/manage/listings/${market_listing_id}/withdraw`, {
    method: 'POST',
    needAuth: true
  })
}

/** 上架物品到交易市场 - 后端路由: POST /api/v4/market/sell/list */
async function sellToMarket(params: Record<string, any>): Promise<ApiResponse> {
  return apiClient.request('/market/sell/list', {
    method: 'POST',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '上架中...',
    showError: true,
    errorPrefix: '上架失败：'
  })
}

/** 查询我的挂单状态 - 后端路由: GET /api/v4/market/listing-status */
async function getMyListingStatus(): Promise<ApiResponse> {
  return apiClient.request('/market/listing-status', { method: 'GET', needAuth: true })
}

/** 获取市场分类筛选数据 - 后端路由: GET /api/v4/market/listings/facets */
async function getMarketFacets(): Promise<ApiResponse> {
  return apiClient.request('/market/listings/facets', { method: 'GET', needAuth: true })
}

/** 上架可叠加资产到交易市场 - 后端路由: POST /api/v4/market/sell/fungible-assets/list */
async function sellFungibleAssets(params: Record<string, any>): Promise<ApiResponse> {
  return apiClient.request('/market/sell/fungible-assets/list', {
    method: 'POST',
    data: params,
    needAuth: true
  })
}

// ==================== 🎫 消费积分系统API ====================
// 后端路由: routes/v4/shop/consumption/

/**
 * 获取当前用户消费积分二维码（用户端，JWT解析身份）
 * 后端路由: GET /api/v4/shop/consumption/qrcode
 */
async function getUserQRCode(): Promise<ApiResponse> {
  return apiClient.request('/shop/consumption/qrcode', {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '生成二维码中...',
    showError: true,
    errorPrefix: '二维码生成失败：'
  })
}

/**
 * 管理员查看指定用户消费积分二维码（管理端，需admin权限）
 * 后端路由: GET /api/v4/console/consumption/qrcode/:user_id
 */
async function getAdminUserQRCode(user_id: number): Promise<ApiResponse> {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  if (!Number.isInteger(user_id) || user_id <= 0) {
    throw new Error('用户ID必须是正整数')
  }

  return apiClient.request(`/console/consumption/qrcode/${user_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '生成二维码中...',
    showError: true,
    errorPrefix: '二维码生成失败：'
  })
}

/**
 * 根据V2动态二维码获取用户信息（商家扫码后调用）
 * 后端路由: GET /api/v4/shop/consumption/user-info?qr_code=xxx&store_id=xxx
 * V2改造: 前缀校验从 QR_ 改为 QRV2_，新增 store_id 可选参数
 */
async function getUserInfoByQRCode(qr_code: string, store_id?: number): Promise<ApiResponse> {
  if (!qr_code) {
    throw new Error('二维码不能为空')
  }
  if (!qr_code.startsWith('QRV2_')) {
    throw new Error('无效的二维码格式，请让用户刷新二维码')
  }

  let url: string = `/shop/consumption/user-info?qr_code=${encodeURIComponent(qr_code)}`
  if (store_id) {
    url += `&store_id=${store_id}`
  }

  return apiClient.request(url, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '获取用户信息中...',
    showError: true,
    errorPrefix: '获取用户信息失败：'
  })
}

/** 消费提交参数 */
interface SubmitConsumptionParams {
  qr_code: string
  consumption_amount: number
  store_id?: number
  merchant_notes?: string
}

/**
 * 商家提交消费记录（V2动态码 + 幂等键）
 * 后端路由: POST /api/v4/shop/consumption/submit
 * V2改造: 自动生成Idempotency-Key防重复提交
 */
async function submitConsumption(params: SubmitConsumptionParams): Promise<ApiResponse> {
  if (!params || typeof params !== 'object') {
    throw new Error('参数格式错误')
  }
  if (!params.qr_code) {
    throw new Error('二维码不能为空')
  }
  if (!params.consumption_amount || params.consumption_amount <= 0) {
    throw new Error('消费金额必须大于0')
  }
  if (params.consumption_amount > 99999.99) {
    throw new Error('消费金额不能超过99999.99元')
  }
  if (params.merchant_notes && params.merchant_notes.length > 500) {
    throw new Error('商家备注不能超过500字')
  }

  // 生成幂等键（防重复提交，7天内相同Key返回首次结果）
  const idempotencyKey: string = `consumption_submit_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

  return apiClient.request('/shop/consumption/submit', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: {
      qr_code: params.qr_code,
      consumption_amount: parseFloat(String(params.consumption_amount)),
      store_id: params.store_id || undefined,
      merchant_notes: params.merchant_notes || undefined
    },
    needAuth: true,
    showLoading: true,
    loadingText: '提交中...',
    showError: true,
    errorPrefix: '提交失败：'
  })
}

/** 获取当前用户的消费记录 - 后端路由: GET /api/v4/shop/consumption/me */
async function getMyConsumptionRecords(
  params: { page?: number; page_size?: number; status?: string | null } = {}
): Promise<ApiResponse> {
  const { page = 1, page_size = 20, status = null } = params
  let url: string = `/shop/consumption/me?page=${page}&page_size=${page_size}`
  if (status) {
    url += `&status=${status}`
  }

  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 获取单条消费记录详情 - 后端路由: GET /api/v4/shop/consumption/detail/:id */
async function getConsumptionDetail(record_id: number): Promise<ApiResponse> {
  return apiClient.request(`/shop/consumption/detail/${record_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 商家查询门店消费记录 - 后端路由: GET /api/v4/shop/consumption/merchant/list */
async function getMerchantConsumptions(
  params: { page?: number; page_size?: number } = {}
): Promise<ApiResponse> {
  const { page = 1, page_size = 20 } = params
  return apiClient.request(`/shop/consumption/merchant/list?page=${page}&page_size=${page_size}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 商家门店消费统计 - 后端路由: GET /api/v4/shop/consumption/merchant/stats */
async function getMerchantConsumptionStats(): Promise<ApiResponse> {
  return apiClient.request('/shop/consumption/merchant/stats', { method: 'GET', needAuth: true })
}

// ==================== 📋 消费审核API（管理员）====================
// 后端路由: routes/v4/console/consumption/（console域，需admin权限）

/** 获取待审核消费记录列表 - 后端路由: GET /api/v4/console/consumption/pending */
async function getPendingConsumption(
  params: { page?: number; page_size?: number } = {}
): Promise<ApiResponse> {
  const { page = 1, page_size = 20 } = params
  return apiClient.request(`/console/consumption/pending?page=${page}&page_size=${page_size}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载中...',
    showError: true
  })
}

/** 审核通过消费记录 - 后端路由: POST /api/v4/console/consumption/approve/:record_id */
async function approveConsumption(
  record_id: number,
  params: { admin_notes?: string } = {}
): Promise<ApiResponse> {
  if (!record_id) {
    throw new Error('消费记录ID不能为空')
  }

  return apiClient.request(`/console/consumption/approve/${record_id}`, {
    method: 'POST',
    data: { admin_notes: params.admin_notes || undefined },
    needAuth: true,
    showLoading: true,
    loadingText: '审核中...',
    showError: true,
    errorPrefix: '审核失败：'
  })
}

/** 审核拒绝消费记录 - 后端路由: POST /api/v4/console/consumption/reject/:record_id */
async function rejectConsumption(
  record_id: number,
  params: { admin_notes: string }
): Promise<ApiResponse> {
  if (!record_id) {
    throw new Error('消费记录ID不能为空')
  }
  if (!params || !params.admin_notes) {
    throw new Error('拒绝原因不能为空')
  }
  if (params.admin_notes.length < 5) {
    throw new Error('拒绝原因至少5个字符')
  }

  return apiClient.request(`/console/consumption/reject/${record_id}`, {
    method: 'POST',
    data: { admin_notes: params.admin_notes },
    needAuth: true,
    showLoading: true,
    loadingText: '处理中...',
    showError: true,
    errorPrefix: '拒绝失败：'
  })
}

// ==================== 🌐 系统通用API ====================
// 后端路由: routes/v4/system/

/**
 * 获取活动位置配置 - 后端路由: GET /api/v4/system/config/placement
 * 用于前端根据后端配置动态控制活动在页面中的展示位置
 * 无需登录即可获取（公开接口）
 *
 * 响应格式：
 * {
 *   success: true,
 *   data: {
 *     version: "1.0.5",
 *     updated_at: "2026-02-14T10:30:00+08:00",
 *     placements: [
 *       {
 *         campaign_code: "BASIC_LOTTERY",
 *         placement: { page: "lottery", position: "main", size: "full", priority: 100 }
 *       }
 *     ]
 *   }
 * }
 */
async function getPlacementConfig(): Promise<ApiResponse> {
  return apiClient.request('/system/config/placement', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取系统公告列表 - 后端路由: GET /api/v4/system/announcements */
async function getAnnouncements(
  page: number = 1,
  limit: number = 20,
  is_important: boolean | null = null
): Promise<ApiResponse> {
  let url: string = `/system/announcements?page=${page}&limit=${limit}`
  if (is_important !== null) {
    url += `&is_important=${is_important}`
  }
  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 获取首页公告 - 后端路由: GET /api/v4/system/announcements/home */
async function getHomeAnnouncements(): Promise<ApiResponse> {
  return apiClient.request('/system/announcements/home', { method: 'GET', needAuth: false })
}

/** 提交用户反馈 - 后端路由: POST /api/v4/system/feedback */
async function submitFeedback(
  category: string,
  content: string,
  priority: string = 'medium',
  attachments: any[] | null = null
): Promise<ApiResponse> {
  return apiClient.request('/system/feedback', {
    method: 'POST',
    data: { category, content, priority, attachments },
    needAuth: true
  })
}

/** 获取用户反馈列表 - 后端路由: GET /api/v4/system/feedback/my */
async function getMyFeedbacks(page: number = 1, limit: number = 20): Promise<ApiResponse> {
  return apiClient.request(`/system/feedback/my?page=${page}&limit=${limit}`, {
    method: 'GET',
    needAuth: true
  })
}

/** 获取系统状态 - 后端路由: GET /api/v4/system/status */
async function getSystemStatus(): Promise<ApiResponse> {
  return apiClient.request('/system/status', { method: 'GET', needAuth: true })
}

/** 获取弹窗横幅列表 - 后端路由: GET /api/v4/system/popup-banners */
async function getPopupBanners(): Promise<ApiResponse> {
  return apiClient.request('/system/popup-banners', {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取系统字典 - 后端路由: GET /api/v4/system/dictionaries */
async function getDictionaries(params: Record<string, any> = {}): Promise<ApiResponse> {
  const queryString: string = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
    .join('&')

  const url: string = queryString ? `/system/dictionaries?${queryString}` : '/system/dictionaries'
  return apiClient.request(url, {
    method: 'GET',
    needAuth: false,
    showLoading: false,
    showError: false
  })
}

/** 获取系统通知列表 - 后端路由: GET /api/v4/system/notifications */
async function getNotifications(
  params: { page?: number; page_size?: number } = {}
): Promise<ApiResponse> {
  const { page = 1, page_size = 20 } = params
  return apiClient.request(`/system/notifications?page=${page}&page_size=${page_size}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 💬 客服会话API ====================
// 后端路由: routes/v4/system/chat.js

/** 创建客服会话 - 后端路由: POST /api/v4/system/chat/create */
async function createChatSession(data: { source?: string } = {}): Promise<ApiResponse> {
  return apiClient.request('/system/chat/create', {
    method: 'POST',
    data,
    needAuth: true
  })
}

/** 获取用户会话列表 - 后端路由: GET /api/v4/system/chat/sessions */
async function getChatSessions(): Promise<ApiResponse> {
  return apiClient.request('/system/chat/sessions', { method: 'GET', needAuth: true })
}

/** 获取会话消息历史 - 后端路由: GET /api/v4/system/chat/history/:session_id */
async function getChatHistory(
  session_id: number,
  page: number = 1,
  limit: number = 50
): Promise<ApiResponse> {
  return apiClient.request(`/system/chat/history/${session_id}?page=${page}&limit=${limit}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 发送消息 - 后端路由: POST /api/v4/system/chat/send
 *
 * 支持两种调用方式:
 * 1. 位置参数: sendChatMessage(session_id, content)
 * 2. 对象参数: sendChatMessage({ sessionId, content, messageType, senderType })
 *
 * 后端期望字段: session_id, content
 */
async function sendChatMessage(
  sessionIdOrParams: number | Record<string, any>,
  content?: string
): Promise<ApiResponse> {
  let requestData: Record<string, any>

  if (typeof sessionIdOrParams === 'object' && sessionIdOrParams !== null) {
    // 对象参数模式（管理员客服/用户聊天页面使用）
    requestData = {
      session_id: sessionIdOrParams.sessionId || sessionIdOrParams.session_id,
      content: sessionIdOrParams.content,
      message_type: sessionIdOrParams.messageType || 'text',
      sender_type: sessionIdOrParams.senderType || undefined
    }
  } else {
    // 位置参数模式
    requestData = {
      session_id: sessionIdOrParams,
      content
    }
  }

  if (!requestData.session_id) {
    throw new Error('会话ID不能为空')
  }
  if (!requestData.content) {
    throw new Error('消息内容不能为空')
  }

  return apiClient.request('/system/chat/send', {
    method: 'POST',
    data: requestData,
    needAuth: true
  })
}

// ==================== 👤 用户API ====================

/** 获取用户个人详细信息 - 后端路由: GET /api/v4/user/me */
async function getUserMe(): Promise<ApiResponse> {
  return apiClient.request('/user/me', { method: 'GET', needAuth: true })
}

// ==================== 📊 用户统计API ====================

/**
 * 获取当前用户综合统计数据（用户端，JWT解析身份）
 * 后端路由: GET /api/v4/lottery/points
 */
async function getUserStatistics(): Promise<ApiResponse> {
  return apiClient.request('/lottery/points', { method: 'GET', needAuth: true })
}

/**
 * 管理员查看指定用户综合统计（管理端，需admin权限）
 * 后端路由: GET /api/v4/console/lottery-user-analysis/points/:user_id
 */
async function getAdminUserStatistics(user_id: number): Promise<ApiResponse> {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  return apiClient.request(`/console/lottery-user-analysis/points/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取当前用户抽奖维度统计（用户端，JWT解析身份）
 * 后端路由: GET /api/v4/lottery/statistics
 */
async function getLotteryUserStatistics(): Promise<ApiResponse> {
  return apiClient.request('/lottery/statistics', { method: 'GET', needAuth: true })
}

/**
 * 管理员查看指定用户抽奖维度统计（管理端，需admin权限）
 * 后端路由: GET /api/v4/console/lottery-user-analysis/statistics/:user_id
 */
async function getAdminLotteryUserStatistics(user_id: number): Promise<ApiResponse> {
  if (!user_id) {
    throw new Error('用户ID不能为空')
  }
  return apiClient.request(`/console/lottery-user-analysis/statistics/${user_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 商家核销用户物品 - 后端路由: POST /api/v4/shop/redemption/fulfill
 * 🔴 注意: 此接口在shop域下，需要商家权限(role_level>=20)
 */
async function fulfillRedemption(params: {
  code: string
  store_id?: number
}): Promise<ApiResponse> {
  if (!params || !params.code) {
    throw new Error('核销码不能为空')
  }

  return apiClient.request('/shop/redemption/fulfill', {
    method: 'POST',
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '核销中...',
    showError: true,
    errorPrefix: '核销失败：'
  })
}

// ==================== 🔧 管理员API ====================
// 后端路由: routes/v4/console/

/** 获取管理员客服会话列表 - 后端路由: GET /api/v4/console/customer-service/sessions */
async function getAdminChatSessions(
  params: { page?: number; pageSize?: number; status?: string | null } = {}
): Promise<ApiResponse> {
  const { page = 1, pageSize = 20, status = null } = params
  let url: string = `/console/customer-service/sessions?page=${page}&limit=${pageSize}`
  if (status && status !== 'all') {
    url += `&status=${status}`
  }

  return apiClient.request(url, { method: 'GET', needAuth: true })
}

/** 获取管理员客服会话消息历史 - 后端路由: GET /api/v4/console/customer-service/sessions/:id/messages */
async function getAdminChatHistory(
  params: { sessionId?: number; page?: number; pageSize?: number } = {}
): Promise<ApiResponse> {
  const { sessionId, page = 1, pageSize = 50 } = params
  if (!sessionId) {
    throw new Error('会话ID不能为空')
  }

  return apiClient.request(
    `/console/customer-service/sessions/${sessionId}/messages?page=${page}&limit=${pageSize}`,
    {
      method: 'GET',
      needAuth: true
    }
  )
}

/** 关闭客服会话 - 后端路由: POST /api/v4/console/customer-service/sessions/:id/close */
async function closeAdminChatSession(session_id: number): Promise<ApiResponse> {
  if (!session_id) {
    throw new Error('会话ID不能为空')
  }

  return apiClient.request(`/console/customer-service/sessions/${session_id}/close`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '关闭会话中...',
    showError: true,
    errorPrefix: '关闭失败：'
  })
}

// ==================== 🔔 活动API ====================

/** 获取活动列表 - 后端路由: GET /api/v4/activities */
async function getActivities(
  params: { page?: number; page_size?: number } = {}
): Promise<ApiResponse> {
  const { page = 1, page_size = 20 } = params
  return apiClient.request(`/activities?page=${page}&page_size=${page_size}`, {
    method: 'GET',
    needAuth: true
  })
}

// ============================================================================
// 导出模块
// ✅ utils/index.ts 使用展开运算符自动同步，新增方法只需在此处 module.exports 中添加即可
// ============================================================================

module.exports = {
  APIClient,

  // 认证系统
  userLogin,
  quickLogin,
  sendVerificationCode,
  getUserInfo,
  verifyToken,

  // 抽奖系统
  getLotteryCampaigns,
  getActiveCampaigns,
  getLotteryPrizes,
  getLotteryConfig,
  performLottery,
  getLotteryHistory,

  // 资产系统
  getPointsBalance,
  getPointsTransactions,
  getAssetBalances,
  getConversionRules,

  // 背包系统
  getUserInventory,
  getBackpackStats,
  getInventoryItem,
  useInventoryItem,
  redeemInventoryItem,

  // 兑换系统（backpack域）
  getExchangeProducts,
  exchangeProduct,
  getExchangeRecords,
  cancelExchange,
  getExchangeItemDetail,
  getExchangeOrderDetail,
  createRedemptionOrder,

  // 交易市场
  getMarketProducts,
  getMarketProductDetail,
  purchaseMarketProduct,
  withdrawMarketProduct,
  sellToMarket,
  getMyListingStatus,
  getMarketFacets,
  sellFungibleAssets,

  // 消费积分系统（用户端）
  getUserQRCode,
  // 消费积分系统（管理端）
  getAdminUserQRCode,
  getUserInfoByQRCode,
  submitConsumption,
  getMyConsumptionRecords,
  getConsumptionDetail,
  getMerchantConsumptions,
  getMerchantConsumptionStats,

  // 消费审核（管理员）
  getPendingConsumption,
  approveConsumption,
  rejectConsumption,

  // 系统通用 - 位置配置
  getPlacementConfig,

  // 系统通用 - 公告
  getAnnouncements,
  getHomeAnnouncements,
  submitFeedback,
  getMyFeedbacks,
  getSystemStatus,
  getPopupBanners,
  getDictionaries,
  getNotifications,

  // 客服会话
  createChatSession,
  getChatSessions,
  getChatHistory,
  sendChatMessage,

  // 用户
  getUserMe,

  // 用户统计（用户端，JWT解析身份）
  getUserStatistics,
  getLotteryUserStatistics,

  // 管理员查看用户数据（console域，需admin权限）
  getAdminLotteryHistory,
  getAdminUserStatistics,
  getAdminLotteryUserStatistics,

  // 商家核销
  fulfillRedemption,

  // 管理员（console域）
  getAdminChatSessions,
  getAdminChatHistory,
  closeAdminChatSession,

  // 活动
  getActivities,

  // API版本信息
  version: '5.0.0',
  lastUpdated: '2026-02-15T00:00:00+08:00',
  apiCompatibility: 'V4.7.0后端对齐+V2动态二维码+幂等键+门店选择+精细化错误码+活动位置配置'
}

export {}
