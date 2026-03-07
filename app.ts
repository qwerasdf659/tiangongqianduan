/**
 * 餐厅积分抽奖系统V5.2主入口 - TypeScript版
 * 基于V4.0统一引擎架构，JWT双Token机制，Socket.IO实时通信
 *
 * globalData只保留系统配置
 * 业务数据已迁移到MobX Store: store/user.ts, store/points.ts 等
 * WebSocket 使用 weapp.socket.io@3.0.0（心跳重连/事件路由全部由Socket.IO内建管理）
 * weapp.socket.io 内部用WebSocket传输适配wx.connectSocket()，微信小程序专用
 *
 * @file 天工餐厅积分系统 - 应用主入口
 * @version 5.2.0
 * @since 2026-02-15
 */

const {
  getApiConfig,
  getDevelopmentConfig,
  getWebSocketConfig,
  getCurrentEnv
} = require('./config/env')
const { initializeWechatEnvironment } = require('./utils/index').Wechat

// Socket.IO 客户端（weapp.socket.io 适配微信小程序环境）
const io = require('weapp.socket.io')

// MobX Store - 业务数据唯一来源
const { userStore } = require('./store/user')
const { pointsStore } = require('./store/points')
const { tradeStore } = require('./store/trade')
const { Logger, PopupFrequency, ThemeCache } = require('./utils/index')
const log = Logger.createLogger('app')

// ===== 类型定义 =====
// 用户信息结构统一使用 API.UserProfile（typings/api.d.ts），禁止在此重复定义

/** Socket.IO 连接数据（心跳重连接Socket.IO 内建，无需手动管理）*/
interface SocketIOData {
  /** Socket.IO 实例引用 */
  socket: any
  /** 是否已连接*/
  connected: boolean
  /** 页面消息订阅者（pageId ?callback）*/
  pageSubscribers: Map<string, (_eventName: string, _data: any) => void>
}

/** Token使用日志条目 */
interface TokenLogEntry {
  action: string
  timestamp: string
  details: Record<string, any>
}

App({
  /**
   * 全局数据 - 仅保留系统级配置
   * 用户认证/积分等业务数据已迁移到MobX Store（store/user.ts、store/points.ts）
   * 页面通过 createStoreBindings 自动同步，不再读取 globalData 业务字段
   */
  globalData: {
    // 系统基础信息
    version: '5.2.0' as string,
    systemName: '餐厅积分抽奖系统' as string,
    buildTime: new Date().toISOString(),

    // 系统状态
    network_status: 'online' as string,
    current_page: '' as string,

    // Socket.IO 配置
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
    },

    /** 内容投放会话级已展示ID集合（每次冷启动重置，用于 once_per_session 规则，key为ad_campaign_id） */
    sessionSeenCampaigns: new Set<number>()
  },

  /** 应用启动初始化 */
  async onLaunch(options: WechatMiniprogram.App.LaunchShowOption): Promise<void> {
    log.info('餐厅积分抽奖系统v5.2.0启动中...')
    log.info('启动参数:', options)

    try {
      await this.initializeSystem()
      await this.checkAuthStatus()
      await initializeWechatEnvironment()

      // 预加载全局氛围主题到本地缓存（公开API，无需登录）
      // 页面 onLoad/onShow 中 getThemeNameSync() 依赖此处填充缓存
      await ThemeCache.getThemeName()

      // 冷启动时清理过期弹窗记录（90天以上），防止本地存储无限增长
      PopupFrequency.cleanExpiredRecords()

      log.info('系统初始化完成')
    } catch (error: any) {
      log.error('系统初始化失败', error)
      this.handleInitializationError(error)
    }
  },

  /** 初始化系统环境 */
  async initializeSystem(): Promise<void> {
    const apiConfig = getApiConfig()
    const devConfig = getDevelopmentConfig()
    const wsConfig = getWebSocketConfig()

    log.info('系统核心服务初始化完成')

    this.globalData.is_development = devConfig.enableUnifiedAuth
    this.globalData.ws_url = wsConfig.url
    this.globalData.ws_config = wsConfig

    log.info('系统环境配置:', {
      currentEnv: getCurrentEnv(),
      apiBaseUrl: apiConfig.baseUrl,
      webSocketUrl: wsConfig.url,
      is_development: this.globalData.is_development,
      version: this.globalData.version
    })
  },

  /**
   * 检查用户认证状态（应用启动初始化阶段）
   *
   * ⚠️ 此处直接读取 Storage 是设计意图：
   * 应用启动时 MobX Store 尚未持有数据，需要从 Storage 恢复上次会话。
   * 恢复成功后通过 userStore.setLoginState() 将数据同步到 Store，
   * 此后所有业务代码统一从 Store 读取，不再直接访问 Storage。
   */
  /**
   * 检查用户认证状态（应用启动初始化阶段）
   *
   * Token 校验优化：合并两个分支（有/无 userInfo）为单一流程，
   * 复用首次完整性验证结果，避免重复校验（从4次减少到1次）。
   *
   * 流程:
   *   Storage读取Token → 完整性校验(1次) → 过期检查(复用Payload) →
   *   无userInfo时从JWT恢复 → Store恢复 → 服务端验证
   */
  async checkAuthStatus(): Promise<void> {
    try {
      let token: string = wx.getStorageSync('access_token')
      let userInfo: API.UserProfile | null = wx.getStorageSync('user_info') || null

      log.info('检查认证状态', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenLength: token ? token.length : 0
      })

      if (!token) {
        log.info('未找到Token，跳过认证恢复')
        return
      }

      const { Utils } = require('./utils/index')
      const { decodeJWTPayload, validateJWTTokenIntegrity, mapJWTPayloadToUserProfile } = Utils

      // 统一完整性校验（仅此一次，后续不再重复调用 validateJWTTokenIntegrity）
      const integrityCheck = validateJWTTokenIntegrity(token)
      if (!integrityCheck.isValid) {
        log.error('Token完整性验证失败:', integrityCheck.error)
        if (integrityCheck.error && integrityCheck.error.includes('截断')) {
          wx.showModal({
            title: '认证令牌异常',
            content: `检测到认证令牌传输异常。\n\n问题：${integrityCheck.error}\n\n请重新登录。`,
            showCancel: true,
            cancelText: '稍后处理',
            confirmText: '立即修复',
            success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
              if (res.confirm) {
                this.clearAuthData()
                wx.redirectTo({ url: '/packageUser/auth/auth' })
              }
            }
          })
        } else {
          this.clearAuthData()
        }
        return
      }

      /**
       * 解码JWT Payload（decodeJWTPayload内部会再次校验完整性，
       * 但因token已通过上方校验，此处主要是Base64解码+JSON解析）
       */
      const jwtPayload = decodeJWTPayload(token)

      // 过期检查（直接使用已解码的payload.exp，避免重复解码）
      if (jwtPayload && jwtPayload.exp) {
        const isExpired = Math.floor(Date.now() / 1000) >= jwtPayload.exp
        if (isExpired) {
          log.warn('Token已过期，尝试自动刷新...')
          const refreshedToken = await this._tryRefreshToken(token)
          if (!refreshedToken) {
            return
          }
          token = refreshedToken
        }
      }

      // 无userInfo时从JWT Payload恢复临时用户信息
      if (!userInfo && jwtPayload) {
        log.info('检测到Token存在但userInfo缺失，从JWT Token中恢复')
        userInfo = mapJWTPayloadToUserProfile(jwtPayload) as API.UserProfile
        wx.setStorageSync('user_info', userInfo)
        log.info('从JWT Token恢复userInfo成功')
      }

      if (!userInfo) {
        log.warn('无法恢复用户信息，清除认证数据')
        this.clearAuthData()
        return
      }

      log.info('Token本地健康检查通过')

      // 恢复认证状态到 MobX Store（唯一数据源）
      const refreshToken: string = wx.getStorageSync('refresh_token') || ''
      userStore.setLoginState(userInfo, token, refreshToken)
      pointsStore.setBalance(0, 0)

      log.info('用户认证状态恢复成功', {
        user_id: userInfo.user_id,
        mobile: userInfo.mobile,
        role_level: userInfo.role_level,
        userRole: userStore.userRole
      })

      /**
       * 服务端认证会话验证：确认 authentication_sessions.is_active = true
       *
       * 本地 JWT 有效 ≠ 服务端会话有效（同平台新登录会使旧会话 is_active=false）
       * 后端采用方案B平台隔离（user_id + login_platform），Web登录不会影响小程序会话，
       * 仅同平台（如另一台手机的微信小程序）新登录才会替换当前会话。
       * 此处调用 GET /api/v4/auth/verify 做服务端确认，失败时静默清理而非自动重新登录，
       * 避免触发新的登录请求导致同平台其他设备的会话被连锁失效
       */
      try {
        const { API: AuthAPI } = require('./utils/index')
        const verifyResult = await AuthAPI.verifyToken()
        if (verifyResult && verifyResult.success) {
          log.info('服务端认证会话验证通过')
        }
      } catch (verifyError: any) {
        const errorCode: string = verifyError.code || ''
        log.warn('服务端认证会话验证失败:', errorCode, verifyError.message)

        const authErrorCodes: string[] = [
          'SESSION_REPLACED',
          'SESSION_EXPIRED',
          'SESSION_NOT_FOUND',
          'TOKEN_EXPIRED',
          'MISSING_TOKEN',
          'INVALID_TOKEN'
        ]

        if (authErrorCodes.includes(errorCode)) {
          log.warn('认证会话已失效，清理本地认证数据', { errorCode })
          this.clearAuthData()
          return
        }
        log.info('服务端验证异常但非认证问题，保留本地认证状态')
      }

      this.logTokenUsage('restore_success', {
        tokenLength: token.length,
        userType: userStore.userRole
      })
    } catch (error: any) {
      log.info('认证状态恢复失败', error.message)
      this.logTokenUsage('restore_error', { error: error.message })
      this.clearAuthData()
    }
  },

  /**
   * 清空认证数据（统一入口）
   * 清理顺序: 断开WebSocket → 清除MobX Store → Storage由Store内部自动同步清理
   * 所有需要清理认证状态的场景都应调用此方法，不要直接调用 userStore.clearLoginState()
   */
  clearAuthData(): void {
    this.disconnectWebSocket()
    userStore.clearLoginState()
    pointsStore.clearPoints()
    tradeStore.clearTrade()
  },

  /** 设置访问令牌（委托给 userStore，api.ts Token刷新时调用） */
  setAccessToken(token: string): void {
    userStore.updateAccessToken(token)
  },

  /** 设置刷新令牌（委托给 userStore，api.ts Token刷新时调用） */
  setRefreshToken(token: string): void {
    userStore.updateRefreshToken(token)
  },

  /** 处理初始化错误*/
  handleInitializationError(error: Error): void {
    log.error(' 系统初始化错误', error)

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

  /**
   * 尝试用 refresh_token 刷新 access_token（内部方法）
   * 成功时更新 Storage 并返回新 access_token；失败时清理认证数据并返回 null
   */
  async _tryRefreshToken(expiredToken: string): Promise<string | null> {
    const refreshTokenStr: string = wx.getStorageSync('refresh_token') || ''
    if (!refreshTokenStr) {
      log.warn('无refresh_token，需要重新登录')
      this.clearAuthData()
      return null
    }
    try {
      const { API: RefreshAPI } = require('./utils/index')
      const refreshResult = await RefreshAPI.refreshAccessToken(refreshTokenStr, expiredToken)
      if (refreshResult.success && refreshResult.data) {
        const newAccessToken: string = refreshResult.data.access_token
        const newRefreshToken: string = refreshResult.data.refresh_token || refreshTokenStr
        wx.setStorageSync('access_token', newAccessToken)
        wx.setStorageSync('refresh_token', newRefreshToken)
        log.info('启动时Token刷新成功')
        return newAccessToken
      }
      log.warn('Token刷新响应异常，需要重新登录')
      this.clearAuthData()
      return null
    } catch (refreshError: any) {
      log.error('启动时Token刷新失败:', refreshError.message)
      this.clearAuthData()
      return null
    }
  },

  /** 应用显示时触发 */
  onShow(): void {
    log.info('应用进入前台')
    const pages = getCurrentPages()
    this.globalData.current_page =
      pages.length > 0 && pages[pages.length - 1] ? pages[pages.length - 1].route || '' : ''
  },

  /** 应用隐藏时触发 */
  onHide(): void {
    log.info('应用进入后台')
  },

  /** 应用错误处理 */
  onError(error: string): void {
    log.error(' 应用发生错误:', error)
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

    log.error('错误记录:', errorInfo)

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
      log.error('获取系统信息失败:', error)
      throw new Error(`系统信息获取失败：${error.message}`)
    }
  },

  // ===== Socket.IO 统一管理（替代原WebSocket=====
  // 心跳：Socket.IO 内建5秒一次），无需手动管理
  // 重连：Socket.IO 内建（指数退避），无需手动管理
  // 消息路由：Socket.IO 按事件名自动路由，无需 JSON.parse + switch
  // 传输层：weapp.socket.io@3.0.0 WebSocket 适配置wx.connectSocket()（微信专用）

  /** Socket.IO 连接数据 */
  socketData: {
    socket: null,
    connected: false,
    pageSubscribers: new Map()
  } as SocketIOData,

  /**
   * 统一 Socket.IO 连接管理
   * 使用 weapp.socket.io@3.0.0 替代原生 wx.connectSocket
   * weapp.socket.io 内部用WebSocket 传输适配置wx.connectSocket()
   * Token 通过 auth 选项传递，不拼URL    */
  connectWebSocket(): Promise<void> {
    // 已连接则直接返回
    if (this.socketData.connected && this.socketData.socket) {
      log.info('Socket.IO 已连接')
      return Promise.resolve()
    }

    if (!userStore.isLoggedIn || !userStore.accessToken) {
      log.info(' 用户未登录，跳过Socket.IO连接')
      return Promise.reject(new Error('用户未登录'))
    }

    // Token 过期检查
    const { Utils } = require('./utils/index')
    const { isTokenExpired } = Utils
    if (isTokenExpired(userStore.accessToken)) {
      log.warn('Token已过期，跳过Socket.IO连接')
      return Promise.reject(new Error('Token已过期'))
    }

    const wsConfig = getWebSocketConfig()
    log.info('启动 Socket.IO 连接...', {
      url: wsConfig.url,
      timeout: wsConfig.timeout
    })

    return new Promise((resolve, reject) => {
      try {
        /**
         * 创建 Socket.IO 连接
         *
         * transports: ['websocket']
         *   微信小程序仅支持 WebSocket 传输（不支持 HTTP long-polling）
         *   weapp.socket.io@3.0.0 内部通过 wx-ws.js 适配器将标准 WebSocket API
         *   映射为 wx.connectSocket() / wx.sendSocketMessage() / wx.closeSocket()
         *
         * timeout: 30000ms
         *   握手超时时间，给 wss 连接经代理建立留足够时间（默认30s）
         *
         * auth: { token }
         *   JWT Token 通过 Socket.IO auth 选项传递，不拼在 URL 上
         */
        const socket = io(wsConfig.url, {
          transports: ['websocket'],
          auth: { token: userStore.accessToken },
          timeout: wsConfig.timeout || 30000,
          // Socket.IO 内建重连
          reconnection: true,
          reconnectionDelay: wsConfig.reconnectionDelay || 3000,
          reconnectionAttempts: wsConfig.reconnectionAttempts || 5
        })

        // 保存 socket 实例
        this.socketData.socket = socket

        // ===== Socket.IO 原生事件 =====

        // 连接成功（替代原 connection_established + wx.onSocketOpen）
        socket.on('connect', () => {
          log.info('Socket.IO 连接成功')
          this.socketData.connected = true
          this.globalData.ws_connected = true
          this.notifyPageSubscribers('websocket_connected', {})
          resolve()
        })

        // 连接错误（替代原 auth_verify_result 失败 + wx.onSocketError）
        socket.on('connect_error', (err: any) => {
          log.error('Socket.IO 连接错误:', err.message)
          this.socketData.connected = false
          this.globalData.ws_connected = false

          // Token 认证失败时清理认证数据
          if (err.message && err.message.includes('Authentication')) {
            log.warn('Token认证失败，清理认证数据')
            this.clearAuthData()
          }

          this.notifyPageSubscribers('websocket_error', { error: err })
          reject(err)
        })

        // 断开连接（替代原 wx.onSocketClose）
        socket.on('disconnect', (reason: string) => {
          log.info('Socket.IO 断开连接，原因:', reason)
          this.socketData.connected = false
          this.globalData.ws_connected = false

          /**
           * 会话失效导致的断连：后端主动断开时 reason 包含 "session"
           * 此时说明认证会话已失效（方案B平台隔离下，仅同平台其他设备登录会导致此断连，
           * Web端登录不会影响微信小程序的WebSocket连接）
           */
          if (reason && reason.toLowerCase().includes('session')) {
            log.warn('WebSocket因会话失效被服务端断开，清理认证数据')
            this.clearAuthData()
          }

          this.notifyPageSubscribers('websocket_closed', { reason })
        })

        // 重连失败（所有重连尝试耗尽）
        socket.on('reconnect_failed', () => {
          log.info('Socket.IO 重连次数已达上限')
          this.notifyPageSubscribers('websocket_max_reconnect_reached', {})
        })

        // 重连成功
        socket.on('reconnect', (attemptNumber: number) => {
          log.info(`Socket.IO 重连成功（第${attemptNumber}次尝试）`)
          this.socketData.connected = true
          this.globalData.ws_connected = true
          this.notifyPageSubscribers('websocket_connected', {})
        })

        // ===== 业务事件监听（对齐后端 ChatWebSocketService 事件协议） =====

        // 连接确认（后端连接成功后立即推送，含 user_id、socket_id、server_time）
        socket.on('connection_established', (data: any) => {
          log.info(' 收到后端连接确认:', data)
          this.notifyPageSubscribers('connection_established', data)
        })

        // 新消息（后端 ChatWebSocketService 推送，含 chat_message_id、content、sender_type 等）
        socket.on('new_message', (data: any) => {
          log.info('收到新消息', data)
          this.notifyPageSubscribers('new_message', data)
        })

        // 管理员系统通知（管理后台推送的系统级通知）
        socket.on('notification', (data: any) => {
          log.info('收到管理员系统通知:', data)
          if (data.level === 'urgent') {
            wx.showModal({ title: '🚨 紧急通知', content: data.content, showCancel: false })
          }
          this.notifyPageSubscribers('notification', data)
        })

        /**
         * 用户通知（方案B通知系统独立化 — 后端 ChatWebSocketService.pushNotificationToUser 推送）
         * 事件名 'new_notification' 与聊天 'new_message' 和管理员 'notification' 区分
         * 数据结构与 GET /api/v4/user/notifications 列表中单条通知一致:
         *   { notification_id, type, title, content, metadata, created_at }
         */
        socket.on('new_notification', (data: any) => {
          log.info('收到用户通知:', data)
          this.notifyPageSubscribers('new_notification', data)
        })

        // 商品更新
        socket.on('product_updated', (data: any) => {
          log.info('收到商品更新:', data)
          this.notifyPageSubscribers('product_updated', data)
        })

        // 库存变更
        socket.on('exchange_stock_changed', (data: any) => {
          log.info('收到库存变更:', data)
          this.notifyPageSubscribers('exchange_stock_changed', data)
        })

        // 核销状态变更（商家完成核销后，后端推送物品状态更新）
        socket.on('redemption_status_changed', (data: any) => {
          log.info('收到核销状态变更:', data)
          this.notifyPageSubscribers('redemption_status_changed', data)
        })

        // 会话状态变更
        socket.on('session_status', (data: any) => {
          log.info('收到会话状态变更', data)
          this.notifyPageSubscribers('session_status', data)
        })

        // 会话开始
        socket.on('session_started', (data: any) => {
          log.info('收到新会话通知:', data)
          this.notifyPageSubscribers('session_started', data)
        })

        // 会话关闭（后端 session_closed 事件，含 session_id、close_reason）
        socket.on('session_closed', (data: any) => {
          log.info('收到会话关闭通知:', data)
          this.notifyPageSubscribers('session_closed', data)
        })

        // 消息发送确认（后端收到 send_message 后写库成功回执）
        socket.on('message_sent', (data: any) => {
          log.info('消息发送确认', data)
          this.notifyPageSubscribers('message_sent', data)
        })

        // 消息发送失败（后端处理 send_message 时出错的回执）
        socket.on('message_error', (data: any) => {
          log.error('消息发送失败', data)
          this.notifyPageSubscribers('message_error', data)
        })

        // 用户输入状态
        socket.on('user_typing', (data: any) => {
          this.notifyPageSubscribers('user_typing', data)
        })

        // 认证状态变更
        socket.on('auth_status', (data: any) => {
          log.info('收到认证状态通知:', data)
          this.notifyPageSubscribers('auth_status', data)
        })
      } catch (error: any) {
        log.error('Socket.IO 初始化失败', error)
        reject(error)
      }
    })
  },

  /** 页面消息订阅（保持原有接口，页面无感知） */
  subscribeWebSocketMessages(
    pageId: string,
    callback: (_eventName: string, _data: any) => void
  ): void {
    log.info(`页面 ${pageId} 订阅Socket.IO消息`)
    this.socketData.pageSubscribers.set(pageId, callback)
  },

  /** 取消页面订阅 */
  unsubscribeWebSocketMessages(pageId: string): void {
    log.info(`页面 ${pageId} 取消Socket.IO消息订阅`)
    this.socketData.pageSubscribers.delete(pageId)
  },

  /** 通知所有订阅页面 */
  notifyPageSubscribers(eventName: string, data: any): void {
    this.socketData.pageSubscribers.forEach(
      (callback: (_evt: string, _payload: any) => void, pageId: string) => {
        try {
          callback(eventName, data)
        } catch (error) {
          log.error(`页面 ${pageId} 消息处理失败:`, error)
        }
      }
    )
  },

  /**
   * 发送 Socket.IO 消息
   *
   * @param eventName - 事件名称（如 'send_message'、'admin_register'）
   * @param data - 消息数据对象（无需手动 JSON.stringify）
   * @returns true=已发送, false=连接不可用未发送
   */
  emitSocketMessage(eventName: string, data: Record<string, any>): boolean {
    if (!this.socketData.connected || !this.socketData.socket) {
      log.warn('Socket.IO未连接，无法发送消息:', eventName)
      return false
    }

    this.socketData.socket.emit(eventName, data)
    log.info(`Socket.IO emit: ${eventName}`)
    return true
  },

  /** 断开 Socket.IO 连接 */
  disconnectWebSocket(): void {
    log.info('断开 Socket.IO 连接')

    if (this.socketData.socket) {
      this.socketData.socket.disconnect()
      this.socketData.socket = null
    }

    this.socketData.connected = false
    this.globalData.ws_connected = false
    this.socketData.pageSubscribers.clear()
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
      // 只保留最新50条记录
      if (logs.length > 50) {
        logs.shift()
      }

      wx.setStorageSync('token_usage_logs', logs)
      log.info('Token使用日志记录:', logEntry)
    } catch (error: any) {
      log.warn('Token日志记录失败:', error.message)
    }
  }
})
