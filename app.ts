/**
 * 餐厅积分抽奖系统V4.0主入口 - TypeScript版
 * 基于V4.0统一引擎架构，JWT双Token机制
 *
 * globalData只保留系统配置和认证状态
 * 业务数据已迁移到MobX Store: store/user.ts, store/points.ts 等
 *
 * @file 天工餐厅积分系统 - 应用主入口
 * @version 4.0.0
 * @since 2026-02-10
 */

const {
  getApiConfig,
  getDevelopmentConfig,
  getWebSocketConfig,
  getCurrentEnv
} = require('./config/env')
const { initializeWechatEnvironment } = require('./utils/index').Wechat

// MobX Store引用 - 积分变化时同步更新Store
const { pointsStore } = require('./store/points')

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
  globalData: {
    // 系统基础信息
    version: '4.0.0' as string,
    systemName: '餐厅积分抽奖系统' as string,
    buildTime: new Date().toISOString(),

    // 用户认证状态（snake_case与后端一致）
    isLoggedIn: false as boolean,
    userInfo: null as AppUserInfo | null,
    access_token: null as string | null,
    refresh_token: null as string | null,
    userRole: 'guest' as string, // 'guest' | 'user' | 'admin'

    // 业务数据缓存（与MobX Store同步，app内部方法使用）
    // 所有页面已通过MobX Store（store/points.ts）获取积分数据
    // 此处保留用于app.ts内部updatePointsBalance()等方法和auth-helper.ts清理
    points_balance: 0 as number,
    frozen_amount: 0 as number,

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
    console.log('🚀 餐厅积分抽奖系统v3.0启动中...')
    console.log('📱 启动参数:', options)

    try {
      await this.initializeSystem()
      await this.checkAuthStatus()
      await initializeWechatEnvironment()
      console.log('✅ 系统初始化完成')
    } catch (error: any) {
      console.error('❌ 系统初始化失败:', error)
      this.handleInitializationError(error)
    }
  },

  /** 初始化系统环境 */
  async initializeSystem(): Promise<void> {
    const apiConfig = getApiConfig()
    const devConfig = getDevelopmentConfig()
    const wsConfig = getWebSocketConfig()

    console.log('✅ 系统核心服务初始化完成')

    this.globalData.is_development = devConfig.enableUnifiedAuth
    this.globalData.ws_url = wsConfig.url
    this.globalData.ws_config = wsConfig

    console.log('🔧 系统环境配置:', {
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

      console.log('🔍 检查认证状态:', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenLength: token ? token.length : 0
      })

      // 有token但没有userInfo，从JWT Token中解析恢复
      if (token && !userInfo) {
        console.log('⚠️ 检测到Token存在但userInfo缺失，尝试从JWT Token中恢复...')
        const { Utils } = require('./utils/index')
        const { decodeJWTPayload, validateJWTTokenIntegrity, isTokenExpired } = Utils

        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          console.error('❌ Token完整性验证失败，需要重新登录')
          this.clearAuthData()
          return
        }

        if (isTokenExpired(token)) {
          console.warn('⚠️ Token已过期，需要重新登录')
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
            console.log('✅ 从JWT Token恢复userInfo成功')
          }
        } catch (decodeError) {
          console.error('❌ JWT Token解析失败:', decodeError)
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
          console.error('🚨 检测到Token完整性问题:', integrityCheck.error)
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
            console.warn('⚠️ Token格式问题，自动清理')
            this.clearAuthData()
            return
          }
        }

        // 过期检查
        if (isTokenExpired(token)) {
          console.warn('⚠️ Token已过期，清理认证数据')
          this.clearAuthData()
          return
        }

        console.log('✅ Token健康检查通过')

        // 恢复认证状态
        this.globalData.access_token = token
        this.globalData.userInfo = userInfo
        this.globalData.isLoggedIn = true
        this.globalData.userRole = this.getUserRoleFromV4(userInfo)
        this.globalData.points_balance = userInfo.points || 0

        console.log('✅ 用户认证状态恢复成功:', {
          user_id: userInfo.user_id,
          mobile: userInfo.mobile,
          is_admin: userInfo.is_admin,
          userRole: this.globalData.userRole
        })

        this.logTokenUsage('restore_success', {
          tokenLength: token.length,
          userType: this.globalData.userRole
        })
      } else {
        console.log('💡 没有存储的认证信息')
      }
    } catch (error: any) {
      console.log('⚠️ 认证状态恢复失败:', error.message)
      this.logTokenUsage('restore_error', { error: error.message })
      this.clearAuthData()
    }
  },

  /** 清空认证数据 */
  clearAuthData(): void {
    this.globalData.isLoggedIn = false
    this.globalData.userInfo = null
    this.globalData.access_token = null
    this.globalData.refresh_token = null
    this.globalData.userRole = 'guest'
    this.globalData.points_balance = 0
    this.globalData.frozen_amount = 0

    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
  },

  /** 更新用户信息 */
  updateUserInfo(userInfo: AppUserInfo): void {
    this.globalData.userInfo = userInfo
    this.globalData.isLoggedIn = true
    this.globalData.userRole = this.getUserRoleFromV4(userInfo)
    this.globalData.points_balance = userInfo.points || 0

    wx.setStorageSync('user_info', userInfo)

    console.log('✅ 用户信息已更新:', {
      user_id: userInfo.user_id,
      userRole: this.globalData.userRole,
      points: this.globalData.points_balance
    })
  },

  /** 更新积分余额（同步到MobX Store和globalData） */
  updatePointsBalance(points: number, frozen?: number): void {
    this.globalData.points_balance = points
    if (frozen !== undefined) {
      this.globalData.frozen_amount = frozen
    }
    if (this.globalData.userInfo) {
      this.globalData.userInfo.points = points
      wx.setStorageSync('user_info', this.globalData.userInfo)
    }
    // 同步到MobX Store - 确保所有绑定页面自动更新
    pointsStore.setBalance(points, frozen !== undefined ? frozen : this.globalData.frozen_amount)
  },

  /** 设置访问令牌 */
  setAccessToken(token: string): void {
    this.globalData.access_token = token
    wx.setStorageSync('access_token', token)
  },

  /** 设置刷新令牌 */
  setRefreshToken(token: string): void {
    this.globalData.refresh_token = token
    wx.setStorageSync('refresh_token', token)
  },

  /** 获取用户权限 */
  getUserRole(): string {
    return this.globalData.userRole
  },

  /**
   * 从JWT Token或用户信息中获取角色
   * 优先级: is_admin → user_role → role_level
   */
  getUserRoleFromV4(userInfo: AppUserInfo | null): string {
    if (!userInfo) {
      return 'guest'
    }

    console.log('🔍 getUserRoleFromV4 检查用户权限:', {
      is_admin: userInfo.is_admin,
      user_role: userInfo.user_role,
      role_level: userInfo.role_level
    })

    if (userInfo.is_admin === true) {
      return 'admin'
    }
    if (userInfo.user_role === 'admin') {
      return 'admin'
    }
    if (userInfo.role_level && userInfo.role_level >= 100) {
      return 'admin'
    }

    return 'user'
  },

  /** 处理初始化错误 */
  handleInitializationError(error: Error): void {
    console.error('🚨 系统初始化错误:', error)

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
    console.log('📱 应用进入前台')
    const pages = getCurrentPages()
    this.globalData.current_page =
      pages.length > 0 && pages[pages.length - 1] ? pages[pages.length - 1].route || '' : ''
  },

  /** 应用隐藏时触发 */
  onHide(): void {
    console.log('📱 应用进入后台')
  },

  /** 应用错误处理 */
  onError(error: string): void {
    console.error('🚨 应用发生错误:', error)
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

    console.error('📝 错误记录:', errorInfo)

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
      console.error('❌ 获取系统信息失败:', error)
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
    lastHeartbeatTime: null
  } as WebSocketData,

  /** 统一WebSocket连接管理 */
  connectWebSocket(): Promise<void> {
    if (this.websocketData.connected || this.websocketData.connecting) {
      console.log('🔌 WebSocket已连接或正在连接中')
      return Promise.resolve()
    }

    if (!this.globalData.isLoggedIn || !this.globalData.access_token) {
      console.log('🚫 用户未登录，跳过WebSocket连接')
      return Promise.reject(new Error('用户未登录'))
    }

    this.websocketData.connecting = true
    console.log('🔌 启动统一WebSocket连接...')

    return new Promise((resolve, reject) => {
      const wsUrl: string = `${this.globalData.ws_url}?token=${encodeURIComponent(this.globalData.access_token!)}`

      wx.connectSocket({
        url: wsUrl,
        protocols: ['websocket'],
        success: () => {
          console.log('✅ WebSocket连接请求已发送')
        },
        fail: (error: WechatMiniprogram.GeneralCallbackResult) => {
          console.error('❌ WebSocket连接失败:', error)
          this.websocketData.connecting = false
          reject(error)
        }
      })

      wx.onSocketOpen(() => {
        console.log('✅ 统一WebSocket连接已建立')
        this.websocketData.connected = true
        this.websocketData.connecting = false
        this.websocketData.reconnectAttempts = 0
        this.globalData.ws_connected = true

        this.startUnifiedHeartbeat()
        this.notifyPageSubscribers('websocket_connected', {})
        resolve()
      })

      wx.onSocketMessage((res: any) => {
        try {
          const message = JSON.parse(res.data as string)
          console.log('📨 统一WebSocket消息接收:', message)
          this.handleUnifiedWebSocketMessage(message)
        } catch (error) {
          console.error('❌ WebSocket消息解析失败:', error)
        }
      })

      wx.onSocketError((error: WechatMiniprogram.GeneralCallbackResult) => {
        console.error('❌ 统一WebSocket连接错误:', error)
        this.websocketData.connected = false
        this.websocketData.connecting = false
        this.globalData.ws_connected = false
        this.stopUnifiedHeartbeat()
        this.notifyPageSubscribers('websocket_error', { error })
        this.handleUnifiedReconnect()
      })

      wx.onSocketClose((res: any) => {
        console.log('🔌 统一WebSocket连接关闭，状态码:', res.code)
        this.websocketData.connected = false
        this.websocketData.connecting = false
        this.globalData.ws_connected = false
        this.stopUnifiedHeartbeat()
        this.notifyPageSubscribers('websocket_closed', { code: res.code })

        if (res.code !== 1000 && this.globalData.isLoggedIn) {
          this.handleUnifiedReconnect()
        }
      })
    })
  },

  /** 启动统一心跳机制（60秒间隔） */
  startUnifiedHeartbeat(): void {
    this.stopUnifiedHeartbeat()
    console.log('💓 启动统一WebSocket心跳机制')

    this.websocketData.heartbeatTimer = setInterval(() => {
      if (this.websocketData.connected) {
        const heartbeatMessage = {
          type: 'heartbeat',
          timestamp: Date.now(),
          clientId: this.globalData.userInfo?.user_id || 'unknown'
        }

        wx.sendSocketMessage({
          data: JSON.stringify(heartbeatMessage),
          success: () => {
            console.log('💓 统一心跳发送成功')
            this.websocketData.lastHeartbeatTime = Date.now()
          },
          fail: (error: WechatMiniprogram.GeneralCallbackResult) => {
            console.error('❌ 统一心跳发送失败:', error)
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
      console.log('🛑 统一心跳机制已停止')
    }
  },

  /** 统一重连机制（指数退避） */
  handleUnifiedReconnect(): void {
    if (this.websocketData.reconnectAttempts >= this.websocketData.maxReconnectAttempts) {
      console.log('❌ WebSocket重连次数已达上限')
      this.notifyPageSubscribers('websocket_max_reconnect_reached', {})
      return
    }

    const delay: number = Math.min(Math.pow(2, this.websocketData.reconnectAttempts) * 1000, 30000)
    this.websocketData.reconnectAttempts++

    console.log(
      `🔄 WebSocket重连 (${this.websocketData.reconnectAttempts}/${this.websocketData.maxReconnectAttempts})，延迟: ${delay}ms`
    )

    this.websocketData.reconnectTimer = setTimeout(() => {
      if (this.globalData.isLoggedIn && !this.websocketData.connected) {
        this.connectWebSocket().catch((error: Error) => {
          console.error('❌ 重连失败:', error)
        })
      }
    }, delay)
  },

  /** 统一消息处理分发 */
  handleUnifiedWebSocketMessage(message: { type?: string; data?: any; event_name?: string }): void {
    const eventName: string = message.event_name || message.type || 'unknown'
    const data = message.data || {}

    console.log(`📢 统一处理WebSocket消息: ${eventName}`)

    switch (eventName) {
      case 'auth_verify_result':
        if (data.status === 'success') {
          console.log('✅ WebSocket认证成功')
        } else {
          console.warn('⚠️ WebSocket认证失败')
          this.clearAuthData()
        }
        break
      case 'connection_established':
        console.log('✅ WebSocket连接确认')
        break
      case 'heartbeat_response':
        console.log('💓 收到心跳响应')
        break
      case 'system_message':
        if (data.level === 'urgent') {
          wx.showModal({ title: '🚨 紧急通知', content: data.content, showCancel: false })
        }
        break
      default:
        console.warn(`🚫 未知的WebSocket消息类型: ${eventName}`)
        break
    }

    this.notifyPageSubscribers(eventName, data)
  },

  /** 页面消息订阅 */
  subscribeWebSocketMessages(
    pageId: string,
    callback: (eventName: string, data: any) => void
  ): void {
    console.log(`📱 页面 ${pageId} 订阅WebSocket消息`)
    this.websocketData.pageSubscribers.set(pageId, callback)
  },

  /** 取消页面订阅 */
  unsubscribeWebSocketMessages(pageId: string): void {
    console.log(`📱 页面 ${pageId} 取消WebSocket消息订阅`)
    this.websocketData.pageSubscribers.delete(pageId)
  },

  /** 通知所有订阅页面 */
  notifyPageSubscribers(eventName: string, data: any): void {
    this.websocketData.pageSubscribers.forEach((callback, pageId) => {
      try {
        callback(eventName, data)
      } catch (error) {
        console.error(`❌ 页面 ${pageId} 消息处理失败:`, error)
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
    console.log('🔌 断开统一WebSocket连接')
    this.stopUnifiedHeartbeat()

    if (this.websocketData.reconnectTimer) {
      clearTimeout(this.websocketData.reconnectTimer)
      this.websocketData.reconnectTimer = null
    }

    this.websocketData.connected = false
    this.websocketData.connecting = false
    this.globalData.ws_connected = false
    this.websocketData.pageSubscribers.clear()

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
      console.log('📊 Token使用日志记录:', logEntry)
    } catch (error: any) {
      console.warn('⚠️ Token日志记录失败:', error.message)
    }
  }
})

export {}
