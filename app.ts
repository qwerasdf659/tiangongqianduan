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
const { Logger, PopupFrequency } = require('./utils/index')
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

    /** 弹窗横幅会话级已展示ID集合（每次冷启动重置，用于 once_per_session 规则） */
    sessionSeenPopups: new Set<number>()
  },

  /** 应用启动初始化 */
  async onLaunch(options: WechatMiniprogram.App.LaunchShowOption): Promise<void> {
    log.info('餐厅积分抽奖系统v5.0启动中...')
    log.info('启动参数:', options)

    try {
      await this.initializeSystem()
      await this.checkAuthStatus()
      await initializeWechatEnvironment()

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
  async checkAuthStatus(): Promise<void> {
    try {
      // 应用启动恢复：从 Storage 读取上次会话的Token和用户信息（token用let因刷新后需更新）
      let token: string = wx.getStorageSync('access_token')
      let userInfo: API.UserProfile | null = wx.getStorageSync('user_info') || null

      log.info('检查认证状态', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenLength: token ? token.length : 0
      })

      // 有token但没有userInfo，从JWT Token中解析恢复
      if (token && !userInfo) {
        log.info('检测到Token存在但userInfo缺失，尝试从JWT Token中恢复...')
        const { Utils, API: AuthAPI } = require('./utils/index')
        const { decodeJWTPayload, validateJWTTokenIntegrity, isTokenExpired } = Utils

        const integrityCheck = validateJWTTokenIntegrity(token)
        if (!integrityCheck.isValid) {
          log.error('Token完整性验证失败，需要重新登录')
          this.clearAuthData()
          return
        }

        /**
         * Token过期时尝试自动刷新（而非直接清除）
         * 正确启动流程: 过期 → refresh → 成功则继续 → 失败则重新登录
         */
        if (isTokenExpired(token)) {
          log.warn('Token已过期，尝试自动刷新...')
          const refreshToken: string = wx.getStorageSync('refresh_token') || ''
          if (refreshToken) {
            try {
              const refreshResult = await AuthAPI.refreshAccessToken(refreshToken, token)
              if (refreshResult.success && refreshResult.data) {
                token = refreshResult.data.access_token
                const newRefreshToken: string = refreshResult.data.refresh_token || refreshToken
                wx.setStorageSync('access_token', token)
                wx.setStorageSync('refresh_token', newRefreshToken)
                log.info('启动时Token刷新成功（无userInfo场景）')
              } else {
                log.warn('Token刷新响应异常，需要重新登录')
                this.clearAuthData()
                return
              }
            } catch (refreshError: any) {
              log.error('启动时Token刷新失败:', refreshError.message)
              this.clearAuthData()
              return
            }
          } else {
            log.warn('无refresh_token，需要重新登录')
            this.clearAuthData()
            return
          }
        }

        try {
          const jwtPayload = decodeJWTPayload(token)
          if (jwtPayload) {
            userInfo = {
              user_id: jwtPayload.user_id,
              mobile: jwtPayload.mobile,
              nickname: jwtPayload.nickname || '用户',
              status: jwtPayload.status,
              user_role: jwtPayload.user_role || 'user',
              role_level: jwtPayload.role_level || 0,
              created_at: jwtPayload.created_at || '',
              roles: jwtPayload.roles || [],
              consecutive_fail_count: jwtPayload.consecutive_fail_count || 0,
              history_total_points: jwtPayload.history_total_points || 0,
              last_login: jwtPayload.last_login || '',
              login_count: jwtPayload.login_count || 0
            } as API.UserProfile

            wx.setStorageSync('user_info', userInfo)
            log.info('从JWT Token恢复userInfo成功')
          }
        } catch (decodeError) {
          log.error('JWT Token解析失败:', decodeError)
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
          log.error(' 检测到Token完整性问题', integrityCheck.error)
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
                  wx.redirectTo({ url: '/packageUser/auth/auth' })
                }
              }
            })
            return
          } else {
            log.warn('Token格式问题，自动清除')
            this.clearAuthData()
            return
          }
        }

        /**
         * Token过期时尝试自动刷新（而非直接清除）
         * 正确启动流程: 过期 → refresh → 成功则继续 → 失败则重新登录
         */
        if (isTokenExpired(token)) {
          log.warn('Token已过期，尝试自动刷新...')
          const refreshTokenStr: string = wx.getStorageSync('refresh_token') || ''
          if (refreshTokenStr) {
            try {
              const { API: RefreshAPI } = require('./utils/index')
              const refreshResult = await RefreshAPI.refreshAccessToken(refreshTokenStr, token)
              if (refreshResult.success && refreshResult.data) {
                token = refreshResult.data.access_token
                const newRefreshToken: string = refreshResult.data.refresh_token || refreshTokenStr
                wx.setStorageSync('access_token', token)
                wx.setStorageSync('refresh_token', newRefreshToken)
                log.info('启动时Token刷新成功')
              } else {
                log.warn('Token刷新响应异常，需要重新登录')
                this.clearAuthData()
                return
              }
            } catch (refreshError: any) {
              log.error('启动时Token刷新失败:', refreshError.message)
              this.clearAuthData()
              return
            }
          } else {
            log.warn('无refresh_token，需要重新登录')
            this.clearAuthData()
            return
          }
        }

        log.info('Token本地健康检查通过')

        // 恢复认证状态到 MobX Store（唯一数据源）
        const refreshToken: string = wx.getStorageSync('refresh_token') || ''
        userStore.setLoginState(userInfo, token, refreshToken)
        // 积分余额应从 GET /api/v4/assets/balance 获取，不依赖 userInfo
        // 此处仅恢复为0，后续页面加载时会从后端刷新真实余额
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

          /**
           * 认证失败错误码分类处理（对齐后端 middleware/auth.js）
           *
           * SESSION_REPLACED  → 同平台其他设备登录，当前会话被替换（方案B平台隔离：跨平台不互踢）
           * SESSION_EXPIRED   → 会话超时（7天未使用），APIClient 会自动尝试刷新
           * SESSION_NOT_FOUND → 会话记录被清理任务删除
           * TOKEN_EXPIRED     → JWT过期，APIClient 会自动尝试刷新
           * MISSING_TOKEN     → 请求未携带 Authorization 头
           * INVALID_TOKEN     → Token格式错误或签名无效
           *
           * TOKEN_EXPIRED 和 SESSION_EXPIRED 在 APIClient.handleResponse 中
           * 已自动触发 handleTokenExpired 尝试刷新，如果刷新也失败才会走到这里
           */
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
          // 网络错误等非认证失败场景：保留本地状态，不阻断用户使用
          log.info('服务端验证异常但非认证问题，保留本地认证状态')
        }

        this.logTokenUsage('restore_success', {
          tokenLength: token.length,
          userType: userStore.userRole
        })
      } else {
        log.info('没有存储的认证信息')
      }
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

        // 系统通知（替代原 system_message）
        socket.on('notification', (data: any) => {
          log.info('收到系统通知:', data)
          if (data.level === 'urgent') {
            wx.showModal({ title: '🚨 紧急通知', content: data.content, showCancel: false })
          }
          this.notifyPageSubscribers('notification', data)
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

export {}
