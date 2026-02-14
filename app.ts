/**
 * 餐厅积分抽奖系统V4.0主入口 - TypeScript版
 * 基于V4.0统一引擎架构，JWT双Token机制
 *
 * globalData只保留系统配置和认证状态
 * 业务数据已迁移到MobX Store: store/user.ts, store/points.ts 等
 *
 * @file 天工餐厅积分系统 - 应用主入口
 * @version 5.0.0
 * @since 2026-02-10
 */

const {
  getApiConfig,
  getDevelopmentConfig,
  getWebSocketConfig,
  getCurrentEnv
} = require('./config/env')
const { initializeWechatEnvironment } = require('./utils/index').Wechat

// MobX Store - 业务数据唯一来源（决策3：废弃globalData业务字段）
const { userStore } = require('./store/user')
const { pointsStore } = require('./store/points')
const { Logger } = require('./utils/index')
const log = Logger.createLogger('app')

// ===== 类型定义 =====

/** 用户信息结构（后端返回的snake_case字段） */
interface AppUserInfo {
  user_id: number
  mobile: string
  nickname: string
  status: string
  is_admin: boolean
  user_role: string
  role_level: number
  avatar_url?: string
  points?: number
}

/** WebSocket连接数据 */
interface WebSocketData {
  connected: boolean
  connecting: boolean
  reconnectAttempts: number
  maxReconnectAttempts: number
  heartbeatTimer: ReturnType<typeof setInterval> | null
  reconnectTimer: ReturnType<typeof setTimeout> | null
  pageSubscribers: Map<string, (eventName: string, data: any) => void>
  lastHeartbeatTime: number | null
}

/** Token使用日志条目 */
interface TokenLogEntry {
  action: string
  timestamp: string
  details: Record<string, any>
}

App({
  /**
   * 全局数据 - 仅保留系统配置和认证状态
   * 业务数据（积分、商品、抽奖配置等）使用MobX Store管理
   */
  /**
   * 全局数据 - 仅保留系统级配置
   * 用户认证/积分等业务数据已迁移到 MobX Store（store/user.ts、store/points.ts）
   * 页面通过 createStoreBindings 自动同步，不再读取 globalData 业务字段
   */
  globalData: {
    // 系统基础信息
    version: '5.0.0' as string,
    systemName: '餐厅积分抽奖系统' as string,
    buildTime: new Date().toISOString(),

    // 系统状态
    network_status: 'online' as string,
    current_page: '' as string,

    // WebSocket配置
    ws_url: null as string | null,
    ws_connected: false as boolean,
    ws_config: null as any,

    // 开发阶段配置
    is_development: false as boolean,

    // 多业务线存储配置
    storage_config: {
      max_image_size: 20 * 1024 * 1024, // 20MB
      allowed_image_types: ['jpg', 'jpeg', 'png', 'webp'],
      business_types: ['lottery', 'exchange', 'trade', 'uploads']
    }
  },

  /** 应用启动初始化 */
  async onLaunch(options: WechatMiniprogram.App.LaunchShowOption): Promise<void> {
    log.info('🚀 餐厅积分抽奖系统v5.0启动中...')
    log.info('📱 启动参数:', options)

    try {
      await this.initializeSystem()
      await this.checkAuthStatus()
      await initializeWechatEnvironment()
      log.info('✅ 系统初始化完成')
    } catch (error: any) {
      log.error('❌ 系统初始化失败:', error)
      this.handleInitializationError(error)
    }
  },

  /** 初始化系统环境 */
  async initializeSystem(): Promise<void> {
    const apiConfig = getApiConfig()
    const devConfig = getDevelopmentConfig()
    const wsConfig = getWebSocketConfig()

    log.info('✅ 系统核心服务初始化完成')

    this.globalData.is_development = devConfig.enableUnifiedAuth
    this.globalData.ws_url = wsConfig.url
    this.globalData.ws_config = wsConfig

    log.info('🔧 系统环境配置:', {
      currentEnv: getCurrentEnv(),
      apiBaseUrl: apiConfig.baseUrl,
      webSocketUrl: wsConfig.url,
      is_development: this.globalData.is_development,
      version: this.globalData.version
    })
  },

  /** 检查用户认证状态 */
  async checkAuthStatus(): Promise<void> {
    try {
      const token: string = wx.getStorageSync('access_token')
      let userInfo: AppUserInfo | null = wx.getStorageSync('user_info') || null

      log.info('🔍 检查认证状态:', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenLength: token ? token.length : 0
      })

      // 有token但没有userInfo，从JWT Token中解析恢复
      if (token && !userInfo) {
        log.info('⚠️ 检测到Token存在但userInfo缺失，尝试从JWT Token中恢复...')
        const { Utils } = require('./utils/index')
        const { decodeJWTPayload, validateJWTTokenIntegrity, isTokenExpired } = Utils

        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error('❌ Token完整性验证失败，需要重新登录')
          this.clearAuthData()
          return
        }

        if (isTokenExpired(token)) {
          log.warn('⚠️ Token已过期，需要重新登录')
          this.clearAuthData()
          return
        }

        try {
          const jwtPayload = decodeJWTPayload(token)
          if (jwtPayload) {
            userInfo = {
              user_id: jwtPayload.user_id,
              mobile: jwtPayload.mobile,
              nickname: jwtPayload.nickname || '用户',
              status: jwtPayload.status,
              is_admin: jwtPayload.is_admin || false,
              user_role: jwtPayload.user_role || 'user',
              role_level: jwtPayload.role_level || 0
            }

            wx.setStorageSync('user_info', userInfo)
            log.info('✅ 从JWT Token恢复userInfo成功')
          }
        } catch (decodeError) {
          log.error('❌ JWT Token解析失败:', decodeError)
          this.clearAuthData()
          return
        }
      }

      if (token && userInfo) {
        const { Utils } = require('./utils/index')
        const { validateJWTTokenIntegrity, isTokenExpired } = Utils

        // 完整性验证
        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error('🚨 检测到Token完整性问题:', integrityCheck.error)
          if (integrityCheck.error.includes('截断')) {
            wx.showModal({
              title: '认证令牌异常',
              content: `检测到认证令牌传输异常。\n\n问题：${integrityCheck.error}\n\n请重新登录。`,
              showCancel: true,
              cancelText: '稍后处理',
              confirmText: '立即修复',
              success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
                if (res.confirm) {
                  this.clearAuthData()
                  wx.redirectTo({ url: '/pages/auth/auth' })
                }
              }
            })
            return
          } else {
            log.warn('⚠️ Token格式问题，自动清理')
            this.clearAuthData()
            return
          }
        }

        // 过期检查
        if (isTokenExpired(token)) {
          log.warn('⚠️ Token已过期，清理认证数据')
          this.clearAuthData()
          return
        }

        log.info('✅ Token健康检查通过')

        // 恢复认证状态到 MobX Store（唯一数据源）
        const refreshToken: string = wx.getStorageSync('refresh_token') || ''
        userStore.setLoginState(userInfo, token, refreshToken)
        pointsStore.setBalance(userInfo.points || 0, 0)

        log.info('✅ 用户认证状态恢复成功:', {
          user_id: userInfo.user_id,
          mobile: userInfo.mobile,
          is_admin: userInfo.is_admin,
          userRole: userStore.userRole
        })

        this.logTokenUsage('restore_success', {
          tokenLength: token.length,
          userType: userStore.userRole
        })
      } else {
        log.info('💡 没有存储的认证信息')
      }
    } catch (error: any) {
      log.info('⚠️ 认证状态恢复失败:', error.message)
      this.logTokenUsage('restore_error', { error: error.message })
      this.clearAuthData()
    }
  },

  /** 清空认证数据（委托给 MobX Store，Store 内部同步清理 Storage） */
  clearAuthData(): void {
    userStore.clearLoginState()
    pointsStore.clearPoints()
  },

  /** 设置访问令牌（委托给 userStore，api.ts Token刷新时调用） */
  setAccessToken(token: string): void {
    userStore.updateAccessToken(token)
  },

  /** 设置刷新令牌（委托给 userStore，api.ts Token刷新时调用） */
  setRefreshToken(token: string): void {
    userStore.updateRefreshToken(token)
  },

  /** 处理初始化错误 */
  handleInitializationError(error: Error): void {
    log.error('🚨 系统初始化错误:', error)

    wx.showModal({
      title: '系统初始化失败',
      content: '系统启动时发生错误，请重启小程序',
      showCancel: false,
      confirmText: '重启',
      success: () => {
        wx.reLaunch({ url: '/pages/lottery/lottery' })
      }
    })
  },

  /** 应用显示时触发 */
  onShow(): void {
    log.info('📱 应用进入前台')
    const pages = getCurrentPages()
    this.globalData.current_page =
      pages.length > 0 && pages[pages.length - 1] ? pages[pages.length - 1].route || '' : ''
  },

  /** 应用隐藏时触发 */
  onHide(): void {
    log.info('📱 应用进入后台')
  },

  /** 应用错误处理 */
  onError(error: string): void {
    log.error('🚨 应用发生错误:', error)
    this.logError(error)
  },

  /** 记录错误信息 */
  logError(error: string | Error): void {
    const errorInfo = {
      message: typeof error === 'string' ? error : error.message || String(error),
      stack: typeof error === 'object' ? (error as Error).stack : undefined,
      timestamp: new Date().toISOString(),
      page: this.globalData.current_page,
      userAgent: this.getSafeSystemInfo()
    }

    log.error('📝 错误记录:', errorInfo)

    if (this.globalData.is_development) {
      wx.showModal({
        title: '开发错误提示',
        content: `错误信息: ${errorInfo.message}`,
        showCancel: false
      })
    }
  },

  /** 获取微信系统信息（基础库2.20.1+新版API） */
  getSafeSystemInfo(): Record<string, any> {
    try {
      const windowInfo = wx.getWindowInfo()
      const deviceInfo = wx.getDeviceInfo()
      const appBaseInfo = wx.getAppBaseInfo()

      return { ...windowInfo, ...deviceInfo, ...appBaseInfo }
    } catch (error: any) {
      log.error('❌ 获取系统信息失败:', error)
      throw new Error(`系统信息获取失败：${error.message}`)
    }
  },

  // ===== WebSocket统一管理 =====

  /** WebSocket连接数据 */
  websocketData: {
    connected: false,
    connecting: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    heartbeatTimer: null,
    reconnectTimer: null,
    pageSubscribers: new Map(),
    lastHeartbeatTime: null,
    /** 全局事件监听器是否已注册（防止重复注册导致事件处理器堆叠） */
    listenersRegistered: false,
    /** 当前连接的Promise回调（仅当前连接有效，重连时更新） */
    connectResolve: null as ((value?: any) => void) | null,
    connectReject: null as ((reason?: any) => void) | null,
    /** 重连锁（防止onSocketError和onSocketClose同时触发重连） */
    reconnectLocked: false
  } as WebSocketData & {
    listenersRegistered: boolean
    connectResolve: ((value?: any) => void) | null
    connectReject: ((reason?: any) => void) | null
    reconnectLocked: boolean
  },

  /**
   * 注册全局WebSocket事件监听器（仅注册一次）
   * wx.onSocketOpen/Message/Error/Close 是全局单例监听器，
   * 重复调用会堆叠多个处理器，导致事件触发多次
   */
  registerWebSocketListeners(): void {
    if (this.websocketData.listenersRegistered) {
      return
    }

    log.info('🔧 注册全局WebSocket事件监听器（仅一次）')

    wx.onSocketOpen(() => {
      log.info('✅ 统一WebSocket连接已建立')
      this.websocketData.connected = true
      this.websocketData.connecting = false
      this.websocketData.reconnectAttempts = 0
      this.websocketData.reconnectLocked = false
      this.globalData.ws_connected = true

      this.startUnifiedHeartbeat()
      this.notifyPageSubscribers('websocket_connected', {})

      // 回调当前连接的Promise
      if (this.websocketData.connectResolve) {
        this.websocketData.connectResolve()
        this.websocketData.connectResolve = null
        this.websocketData.connectReject = null
      }
    })

    wx.onSocketMessage((res: any) => {
      try {
        const message = JSON.parse(res.data as string)
        log.info('📨 统一WebSocket消息接收:', message)
        this.handleUnifiedWebSocketMessage(message)
      } catch (error) {
        log.error('❌ WebSocket消息解析失败:', error)
      }
    })

    wx.onSocketError((error: WechatMiniprogram.GeneralCallbackResult) => {
      log.error('❌ 统一WebSocket连接错误:', error)
      this.websocketData.connected = false
      this.websocketData.connecting = false
      this.globalData.ws_connected = false
      this.stopUnifiedHeartbeat()
      this.notifyPageSubscribers('websocket_error', { error })

      // 回调当前连接的Promise（仅在首次连接时reject，重连不走这里）
      if (this.websocketData.connectReject) {
        this.websocketData.connectReject(error)
        this.websocketData.connectResolve = null
        this.websocketData.connectReject = null
      }

      // 使用重连锁防止onSocketError和onSocketClose同时触发重连
      this.handleUnifiedReconnect()
    })

    wx.onSocketClose((res: any) => {
      log.info('🔌 统一WebSocket连接关闭，状态码:', res.code)
      this.websocketData.connected = false
      this.websocketData.connecting = false
      this.globalData.ws_connected = false
      this.stopUnifiedHeartbeat()
      this.notifyPageSubscribers('websocket_closed', { code: res.code })

      // onSocketError已经触发了重连，onSocketClose不再重复触发
      // 仅当正常关闭后需要重连（非用户主动关闭）时才触发
      if (res.code !== 1000 && userStore.isLoggedIn) {
        this.handleUnifiedReconnect()
      }
    })

    this.websocketData.listenersRegistered = true
  },

  /** 统一WebSocket连接管理 */
  connectWebSocket(): Promise<void> {
    if (this.websocketData.connected || this.websocketData.connecting) {
      log.info('🔌 WebSocket已连接或正在连接中')
      return Promise.resolve()
    }

    if (!userStore.isLoggedIn || !userStore.accessToken) {
      log.info('🚫 用户未登录，跳过WebSocket连接')
      return Promise.reject(new Error('用户未登录'))
    }

    // 确保全局事件监听器仅注册一次
    this.registerWebSocketListeners()

    // 重置重连锁
    this.websocketData.reconnectLocked = false
    this.websocketData.connecting = true
    log.info('🔌 启动统一WebSocket连接...')

    return new Promise((resolve, reject) => {
      // 保存当前连接的Promise回调
      this.websocketData.connectResolve = resolve
      this.websocketData.connectReject = reject

      const wsUrl: string = `${this.globalData.ws_url}?token=${encodeURIComponent(userStore.accessToken)}`

      wx.connectSocket({
        url: wsUrl,
        protocols: ['websocket'],
        success: () => {
          log.info('✅ WebSocket连接请求已发送')
        },
        fail: (error: WechatMiniprogram.GeneralCallbackResult) => {
          log.error('❌ WebSocket连接失败:', error)
          this.websocketData.connecting = false
          this.websocketData.connectResolve = null
          this.websocketData.connectReject = null
          reject(error)
        }
      })
    })
  },

  /** 启动统一心跳机制（60秒间隔） */
  startUnifiedHeartbeat(): void {
    this.stopUnifiedHeartbeat()
    log.info('💓 启动统一WebSocket心跳机制')

    this.websocketData.heartbeatTimer = setInterval(() => {
      if (this.websocketData.connected) {
        const heartbeatMessage = {
          type: 'heartbeat',
          timestamp: Date.now(),
          clientId: userStore.userInfo?.user_id || 'unknown'
        }

        wx.sendSocketMessage({
          data: JSON.stringify(heartbeatMessage),
          success: () => {
            log.info('💓 统一心跳发送成功')
            this.websocketData.lastHeartbeatTime = Date.now()
          },
          fail: (error: WechatMiniprogram.GeneralCallbackResult) => {
            log.error('❌ 统一心跳发送失败:', error)
            this.websocketData.connected = false
            this.globalData.ws_connected = false
          }
        })
      }
    }, 60000)
  },

  /** 停止心跳机制 */
  stopUnifiedHeartbeat(): void {
    if (this.websocketData.heartbeatTimer) {
      clearInterval(this.websocketData.heartbeatTimer)
      this.websocketData.heartbeatTimer = null
      log.info('🛑 统一心跳机制已停止')
    }
  },

  /**
   * 统一重连机制（指数退避 + 重连锁）
   * 重连锁机制: 同一次断连中onSocketError和onSocketClose都会触发此方法，
   * 但只有第一次调用会真正执行重连，第二次调用被锁拦截
   */
  handleUnifiedReconnect(): void {
    // 重连锁: 防止同一次断连中error和close事件同时触发两次重连
    if (this.websocketData.reconnectLocked) {
      log.info('🔒 重连锁生效，跳过重复重连')
      return
    }
    this.websocketData.reconnectLocked = true

    if (this.websocketData.reconnectAttempts >= this.websocketData.maxReconnectAttempts) {
      log.info('❌ WebSocket重连次数已达上限')
      this.notifyPageSubscribers('websocket_max_reconnect_reached', {})
      return
    }

    const delay: number = Math.min(Math.pow(2, this.websocketData.reconnectAttempts) * 1000, 30000)
    this.websocketData.reconnectAttempts++

    log.info(
      `🔄 WebSocket重连 (${this.websocketData.reconnectAttempts}/${this.websocketData.maxReconnectAttempts})，延迟: ${delay}ms`
    )

    // 清理旧的重连定时器
    if (this.websocketData.reconnectTimer) {
      clearTimeout(this.websocketData.reconnectTimer)
    }

    this.websocketData.reconnectTimer = setTimeout(() => {
      // 重连前重置锁，允许下一次断连触发重连
      this.websocketData.reconnectLocked = false

      if (userStore.isLoggedIn && !this.websocketData.connected) {
        this.connectWebSocket().catch((error: Error) => {
          log.error('❌ 重连失败:', error)
        })
      }
    }, delay)
  },

  /** 统一消息处理分发 */
  handleUnifiedWebSocketMessage(message: { type?: string; data?: any; event_name?: string }): void {
    const eventName: string = message.event_name || message.type || 'unknown'
    const data = message.data || {}

    log.info(`📢 统一处理WebSocket消息: ${eventName}`)

    switch (eventName) {
      case 'auth_verify_result':
        if (data.status === 'success') {
          log.info('✅ WebSocket认证成功')
        } else {
          log.warn('⚠️ WebSocket认证失败')
          this.clearAuthData()
        }
        break
      case 'connection_established':
        log.info('✅ WebSocket连接确认')
        break
      case 'heartbeat_response':
        log.info('💓 收到心跳响应')
        break
      case 'system_message':
        if (data.level === 'urgent') {
          wx.showModal({ title: '🚨 紧急通知', content: data.content, showCancel: false })
        }
        break
      default:
        log.warn(`🚫 未知的WebSocket消息类型: ${eventName}`)
        break
    }

    this.notifyPageSubscribers(eventName, data)
  },

  /** 页面消息订阅 */
  subscribeWebSocketMessages(
    pageId: string,
    callback: (eventName: string, data: any) => void
  ): void {
    log.info(`📱 页面 ${pageId} 订阅WebSocket消息`)
    this.websocketData.pageSubscribers.set(pageId, callback)
  },

  /** 取消页面订阅 */
  unsubscribeWebSocketMessages(pageId: string): void {
    log.info(`📱 页面 ${pageId} 取消WebSocket消息订阅`)
    this.websocketData.pageSubscribers.delete(pageId)
  },

  /** 通知所有订阅页面 */
  notifyPageSubscribers(eventName: string, data: any): void {
    this.websocketData.pageSubscribers.forEach((callback, pageId) => {
      try {
        callback(eventName, data)
      } catch (error) {
        log.error(`❌ 页面 ${pageId} 消息处理失败:`, error)
      }
    })
  },

  /** 发送WebSocket消息 */
  sendWebSocketMessage(message: Record<string, any>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.websocketData.connected) {
        reject(new Error('WebSocket未连接'))
        return
      }

      wx.sendSocketMessage({
        data: JSON.stringify(message),
        success: () => resolve(),
        fail: (error: WechatMiniprogram.GeneralCallbackResult) => reject(error)
      })
    })
  },

  /** 断开WebSocket连接 */
  disconnectWebSocket(): void {
    log.info('🔌 断开统一WebSocket连接')
    this.stopUnifiedHeartbeat()

    // 清理重连定时器
    if (this.websocketData.reconnectTimer) {
      clearTimeout(this.websocketData.reconnectTimer)
      this.websocketData.reconnectTimer = null
    }

    // 重置连接状态
    this.websocketData.connected = false
    this.websocketData.connecting = false
    this.websocketData.reconnectLocked = false
    this.websocketData.reconnectAttempts = 0
    this.globalData.ws_connected = false
    this.websocketData.pageSubscribers.clear()

    // 清理挂起的Promise回调
    this.websocketData.connectResolve = null
    this.websocketData.connectReject = null

    wx.closeSocket()
  },

  /** Token使用日志记录（分析Token问题的发生频率和模式） */
  logTokenUsage(action: string, details: Record<string, any>): void {
    try {
      const logs: TokenLogEntry[] = wx.getStorageSync('token_usage_logs') || []
      const logEntry: TokenLogEntry = {
        action,
        timestamp: new Date().toISOString(),
        details
      }

      logs.push(logEntry)
      // 只保留最近50条记录
      if (logs.length > 50) {
        logs.shift()
      }

      wx.setStorageSync('token_usage_logs', logs)
      log.info('📊 Token使用日志记录:', logEntry)
    } catch (error: any) {
      log.warn('⚠️ Token日志记录失败:', error.message)
    }
  }
})

export {}
