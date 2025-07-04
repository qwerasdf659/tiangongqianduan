// app.js - 餐厅积分抽奖系统全局配置（基于产品功能结构文档v2.1.3优化）

App({
  /**
   * 生命周期函数--监听小程序初始化
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   */
  onLaunch() {
    console.log('🚀 餐厅积分系统启动 - v2.1.3')
    
    // 安全初始化
    try {
      this.initSystem()
    } catch (error) {
      console.error('❌ 系统初始化失败:', error)
      // 即使初始化失败，也要确保基本功能可用
      this.initFallback()
    }
  },

  /**
   * 系统初始化
   */
  initSystem() {
    // 初始化全局数据
    this.initGlobalData()
    
    // 初始化环境配置
    this.initEnvironmentConfig()
    
    // 初始化WebSocket管理器
    this.initWebSocket()
    
    // 设置全局错误处理
    this.setupGlobalErrorHandler()
    
    // 检查登录状态
    this.checkLoginStatus()
    
    console.log('✅ 系统初始化完成 - v2.1.3配置生效')
  },

  /**
   * 初始化全局数据
   */
  initGlobalData() {
    // 引入环境配置
    const ENV_CONFIG = require('./config/env.js')
    const envConfig = ENV_CONFIG.getConfig()
    
    // 确保全局数据结构完整
    this.globalData = {
      ...this.globalData,
      // 环境配置
      ...envConfig,
      // 添加config引用方便其他地方使用
      config: envConfig,
      // 确保关键字段有默认值
      userInfo: this.globalData.userInfo || null,
      // 🔴 v2.1.3版本标识
      version: 'v2.1.3',
      // 🔴 严禁硬编码用户数据 - 已移除mockUser违规代码
      // ✅ 所有用户数据必须通过后端API获取：userAPI.getUserInfo()
    }
  },

  /**
   * 初始化环境配置
   */
  initEnvironmentConfig() {
    const ENV_CONFIG = require('./config/env.js')
    const envConfig = ENV_CONFIG.getConfig()
    
    // 设置API地址
    this.globalData.baseUrl = envConfig.baseUrl
    this.globalData.wsUrl = envConfig.wsUrl
    this.globalData.sealosConfig = envConfig.sealosConfig
    this.globalData.isDev = envConfig.isDev
    this.globalData.needAuth = envConfig.needAuth
    
    // 🔴 v2.1.3开发阶段配置
    this.globalData.developmentMode = envConfig.developmentMode || {}
    
    console.log('🔧 环境配置初始化完成 - v2.1.3:', {
      env: require('./config/env.js').getCurrentEnv(),
      isDev: this.globalData.isDev,
      baseUrl: this.globalData.baseUrl,
      wsUrl: this.globalData.wsUrl,
      photoReviewMode: this.globalData.developmentMode.photoReviewMode || 'manual'
    })
  },

  /**
   * 设置全局错误处理
   */
  setupGlobalErrorHandler() {
    // 监听小程序错误
    wx.onError((error) => {
      console.error('🚨 小程序全局错误:', error)
      
      // 记录错误信息
      try {
        const errorInfo = {
          error: error,
          timestamp: new Date().toISOString(),
          userAgent: wx.getSystemInfoSync(),
          path: getCurrentPages().length > 0 ? getCurrentPages()[getCurrentPages().length - 1].route : 'unknown',
          version: 'v2.1.3'
        }
        
        // 可以发送到错误监控服务
        this.reportError(errorInfo)
      } catch (reportError) {
        console.warn('错误上报失败:', reportError)
      }
    })

    // 🔧 修复：增强未处理的Promise拒绝处理
    wx.onUnhandledRejection((res) => {
      console.error('🚨 未处理的Promise拒绝:', res)
      
      // 防止因未捕获的Promise导致小程序崩溃
      if (res.reason) {
        console.error('拒绝原因:', res.reason)
        
        // 🔧 特殊处理WebSocket连接错误（基于用户规则修复[[memory:427681]]）
        if (res.reason && typeof res.reason === 'object') {
          if (res.reason.errMsg && res.reason.errMsg.includes('WebSocket')) {
            console.warn('⚠️ WebSocket连接Promise被拒绝，这是正常的，不影响应用使用')
            return // 不需要进一步处理WebSocket错误
          }
          
          if (res.reason.message && res.reason.message.includes('连接超时')) {
            console.warn('⚠️ 网络连接Promise被拒绝，可能是网络问题')
            return
          }
        }
      }
      
      // 🔧 记录其他类型的Promise错误
      if (this.globalData && this.globalData.isDev) {
        console.log('📊 开发环境Promise错误详情:', res)
      }
    })
  },

  /**
   * 错误上报
   */
  reportError(errorInfo) {
    // 开发环境下只打印，不上报
    if (this.globalData.isDev) {
      console.log('📊 错误信息:', errorInfo)
      return
    }
    
    // 生产环境可以上报到监控服务
    // TODO: 接入错误监控服务
    console.log('📊 错误信息已记录')
  },

  /**
   * 降级初始化 - 当主初始化失败时使用
   */
  initFallback() {
    console.log('🔄 启用降级初始化')
    
    // 确保最基本的全局数据存在
    if (!this.globalData) {
      this.globalData = {}
    }
    
    // 设置最基本的配置
    this.globalData.isDev = true
    this.globalData.needAuth = false
    
    // 显示系统异常提示
    setTimeout(() => {
      wx.showModal({
        title: '系统提示',
        content: '系统初始化遇到问题，已启用兼容模式。部分功能可能受限。',
        showCancel: false,
        confirmText: '知道了'
      })
    }, 1000)
  },

  onShow() {
    // 🔧 优化：避免在登录成功后立即验证Token
    // 每次前台时检查Token状态，但增加冷却期防止误操作
    this.refreshTokenIfNeededWithCooldown()
  },

  globalData: {
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 认证相关
    accessToken: null,
    refreshToken: null,
    
    // 🔧 新增：Token验证冷却期
    lastLoginTime: null,
    tokenVerifyCooldown: 10000, // 登录成功后10秒内不验证Token
    lastTokenVerifyTime: null,
    tokenVerifyInterval: 30000, // Token验证间隔30秒
    
    // 🔴 数据库字段映射 - 根据数据库设计规范文档v2.1.3的7张核心表设计
    dbFieldMapping: {
      user: {
        id: 'user_id',
        mobile: 'mobile',
        points: 'total_points',
        isMerchant: 'is_merchant',
        nickname: 'nickname',
        avatar: 'avatar',
        wxOpenid: 'wx_openid',
        lastLogin: 'last_login',
        status: 'status',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      lottery: {
        prizeId: 'prize_id',
        prizeName: 'prize_name',
        prizeType: 'prize_type',
        prizeValue: 'prize_value',
        angle: 'angle',
        color: 'color',
        probability: 'probability',
        isActivity: 'is_activity',
        costPoints: 'cost_points',
        status: 'status'
      },
      product: {
        id: 'commodity_id',
        name: 'name',
        description: 'description',
        category: 'category',
        exchangePoints: 'exchange_points',
        stock: 'stock',
        image: 'image',
        status: 'status',
        isHot: 'is_hot',
        sortOrder: 'sort_order',
        salesCount: 'sales_count'
      },
      uploadReview: {
        uploadId: 'upload_id',
        userId: 'user_id',
        imageUrl: 'image_url',
        amount: 'amount',
        userAmount: 'user_amount',
        pointsAwarded: 'points_awarded',
        reviewStatus: 'review_status',
        reviewerId: 'reviewer_id',
        reviewReason: 'review_reason',
        reviewTime: 'review_time',
        createdAt: 'created_at'
      },
      // 🔴 v2.1.3新增：积分记录字段映射
      pointsRecord: {
        id: 'id',
        userId: 'user_id',
        type: 'type',
        points: 'points',
        balanceAfter: 'balance_after',
        description: 'description',
        source: 'source',
        relatedId: 'related_id',
        createdAt: 'created_at'
      },
      // 🔴 v2.1.3新增：抽奖记录字段映射
      lotteryRecord: {
        id: 'id',
        userId: 'user_id',
        prizeId: 'prize_id',
        prizeName: 'prize_name',
        prizeType: 'prize_type',
        drawType: 'draw_type',
        pointsCost: 'points_cost',
        isPityDraw: 'is_pity_draw',
        createdAt: 'created_at'
      }
    },
    
    // 🔴 严禁硬编码用户数据 - 已移除mockUser违规代码
    // ✅ 所有用户数据必须通过后端API获取：userAPI.getUserInfo()

    // 🔴 v2.1.3 WebSocket管理 - 基于后端技术规范文档优化
    wsManager: null,
    wsConnected: false,
    wsReconnectCount: 0,
    
    // 🔴 v2.1.3新增：WebSocket事件监听器
    statusListeners: [],
    webSocketMessageHandlers: new Map(),
    
    // 数据同步管理
    needRefreshExchangeProducts: false,
    merchantProductsLastUpdate: 0,
    productsCache: [],
    productsCacheTime: 0,
    updateExchangeProducts: null,
    
    // 🔴 v2.1.3新增：数据安全处理配置
    dataProcessing: {
      enableSafeSetData: true,
      filterUndefinedValues: true,
      validateApiResponseFormat: true,
      strictFieldMapping: true
    }
  },

  /**
   * 初始化WebSocket管理器
   */
  initWebSocket() {
    // 🔧 修复：检查环境配置，确定是否启用WebSocket
    const envConfig = this.globalData.config || this.globalData
    const devConfig = envConfig.developmentMode || {}
    
    if (devConfig.enableWebSocket === false) {
      console.log('🔧 WebSocket已禁用，跳过初始化')
      return
    }
    
    // 🔧 优化：创建WebSocket管理器
    this.wsManager = {
      socket: null,
      connected: false,
      reconnectAttempts: 0,
      maxReconnectAttempts: devConfig.maxReconnectAttempts || 3,
      reconnectDelay: 1000,
      heartbeatInterval: null,
      messageQueue: [],
      silentErrors: devConfig.silentWebSocketErrors || false
    }
    
    // 设置WebSocket事件监听器
    this.setupWebSocketListeners()
    
    // 🔧 延迟连接，避免初始化过程中的连接错误
    setTimeout(() => {
      if (this.globalData.isLoggedIn) {
        this.connectWebSocket()
      }
    }, 2000)
  },

  /**
   * 设置WebSocket事件监听器
   */
  setupWebSocketListeners() {
    // 实时数据监听器
    this.wsEventListeners = {
      'point_updated': (data) => {
        console.log('💰 收到积分更新推送:', data)
        
        // 更新全局积分
        if (this.globalData.userInfo) {
          this.globalData.userInfo.total_points = data.points
        }
        
        // 通知所有页面更新积分显示
        this.notifyAllPages('pointsUpdated', data)
      },
      
      'stock_updated': (data) => {
        console.log('📦 收到库存更新推送:', data)
        this.updateProductStock(data.product_id, data.stock)
      },
      
      'review_completed': (data) => {
        console.log('📋 收到审核完成推送:', data)
        this.notifyAllPages('reviewCompleted', data)
      },
      
      'lottery_config_updated': (data) => {
        console.log('🎰 收到抽奖配置更新推送:', data)
        this.notifyAllPages('lotteryConfigUpdated', data)
      }
    }
  },

  /**
   * 通知所有页面数据更新
   */
  notifyAllPages(eventName, data) {
    console.log(`📢 全局通知事件: ${eventName}`, data)
    
    // 🔧 修复：通知注册的状态监听器
    if (this.statusListeners && this.statusListeners.length > 0) {
      this.statusListeners.forEach(listener => {
        try {
          listener(data)
        } catch (error) {
          console.warn('⚠️ 状态监听器执行失败:', error)
        }
      })
    }
    
    // 获取当前页面栈
    const pages = getCurrentPages()
    
    // 通知所有页面
    pages.forEach(page => {
      if (page.onWebSocketMessage && typeof page.onWebSocketMessage === 'function') {
        page.onWebSocketMessage(eventName, data)
      }
    })
  },

  /**
   * 更新商品库存
   */
  updateProductStock(productId, newStock) {
    // 通知相关页面更新库存显示
    this.notifyAllPages('productStockUpdated', {
      productId,
      newStock
    })
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    const token = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const userInfo = wx.getStorageSync('user_info')
    const lastLoginTime = wx.getStorageSync('last_login_time')
    
    if (token && refreshToken && userInfo) {
      // 🔧 修复：在验证之前先设置token，确保API请求有Authorization头部
      this.globalData.accessToken = token
      this.globalData.refreshToken = refreshToken
      this.globalData.userInfo = userInfo
      this.globalData.lastLoginTime = lastLoginTime || null
      this.globalData.isLoggedIn = true // 先设置为已登录状态
      
      console.log('🔧 已预设认证信息，开始智能验证Token有效性')
      
      // 🔧 使用带冷却期的验证逻辑
      const now = Date.now()
      
      // 如果是刚登录不久，跳过验证直接认为有效
      if (this.globalData.lastLoginTime && (now - this.globalData.lastLoginTime) < this.globalData.tokenVerifyCooldown) {
        console.log('🔧 最近刚登录，跳过初始验证')
        
        // 🔧 延迟连接WebSocket，确保用户状态已就绪
        setTimeout(() => {
          this.connectWebSocket()
        }, 1000)
        
        return
      }
      
      // 🔧 使用带重试的验证逻辑
      this.verifyTokenWithRetry().then(() => {
        console.log('✅ 登录状态验证成功')
        
        // 🔧 优化：延迟连接WebSocket，确保用户状态已就绪
        setTimeout(() => {
          this.connectWebSocket()
        }, 1000)
      }).catch((error) => {
        console.warn('⚠️ Token验证最终失败，需要重新登录:', error)
        // 🔧 验证失败时清除预设的认证信息
        this.logout()
      })
    } else {
      console.log('📝 用户未登录')
      this.globalData.isLoggedIn = false
      this.globalData.accessToken = null
      this.globalData.refreshToken = null
      this.globalData.userInfo = null
      this.globalData.lastLoginTime = null
    }
  },

  /**
   * 连接WebSocket
   */
  connectWebSocket() {
    // 🔧 检查环境配置
    const envConfig = this.globalData.config || this.globalData
    const devConfig = envConfig.developmentMode || {}
    
    if (devConfig.enableWebSocket === false) {
      console.log('🔧 WebSocket已禁用，跳过连接')
      return
    }
    
    if (!this.globalData.wsUrl) {
      console.warn('⚠️ WebSocket URL未配置')
      return
    }
    
    if (!this.globalData.accessToken) {
      console.warn('⚠️ 未登录，无法连接WebSocket')
      return
    }
    
    // 🔧 防止重复连接
    if (this.wsManager && this.wsManager.connected) {
      console.log('🔄 WebSocket已连接，跳过重复连接')
      return
    }
    
    const wsUrl = `${this.globalData.wsUrl}?token=${this.globalData.accessToken}`
    console.log('🔌 正在连接WebSocket:', wsUrl)
    
    try {
      const socketTask = wx.connectSocket({
        url: wsUrl,
        protocols: ['websocket']
      })
      
      // 🔧 优化：添加连接超时处理
      const connectionTimeout = setTimeout(() => {
        if (this.wsManager && !this.wsManager.connected) {
          console.warn('⚠️ WebSocket连接超时')
          this.handleWebSocketError('连接超时')
        }
      }, devConfig.webSocketTimeout || 10000)
      
      socketTask.onOpen(() => {
        clearTimeout(connectionTimeout)
        console.log('✅ WebSocket连接成功')
        
        if (this.wsManager) {
          this.wsManager.socket = socketTask
          this.wsManager.connected = true
          this.wsManager.reconnectAttempts = 0
          
          // 启动心跳
          this.startHeartbeat()
          
          // 发送队列中的消息
          this.sendQueuedMessages()
        }
      })
      
      socketTask.onMessage((message) => {
        console.log('📨 收到WebSocket消息:', message)
        this.handleWebSocketMessage(message.data)
      })
      
      socketTask.onError((error) => {
        clearTimeout(connectionTimeout)
        console.error('❌ WebSocket连接错误:', error)
        this.handleWebSocketError(error)
      })
      
      socketTask.onClose((close) => {
        clearTimeout(connectionTimeout)
        console.log('🔌 WebSocket连接关闭:', close)
        this.handleWebSocketClose(close)
      })
      
    } catch (error) {
      console.error('❌ WebSocket连接异常:', error)
      this.handleWebSocketError(error)
    }
  },

  /**
   * 🔧 优化：处理WebSocket错误
   */
  handleWebSocketError(error) {
    const envConfig = this.globalData.config || this.globalData
    const devConfig = envConfig.developmentMode || {}
    
    if (this.wsManager) {
      this.wsManager.connected = false
      this.wsManager.socket = null
      
      // 停止心跳
      if (this.wsManager.heartbeatInterval) {
        clearInterval(this.wsManager.heartbeatInterval)
        this.wsManager.heartbeatInterval = null
      }
    }
    
    // 🔧 根据配置决定是否静默处理错误
    if (devConfig.silentWebSocketErrors) {
      console.log('⚠️ WebSocket错误已静默处理:', error)
      return
    }
    
    // 🔧 智能重连
    if (devConfig.webSocketReconnect && this.wsManager && 
        this.wsManager.reconnectAttempts < this.wsManager.maxReconnectAttempts) {
      
      this.wsManager.reconnectAttempts++
      const delay = this.wsManager.reconnectDelay * this.wsManager.reconnectAttempts
      
      console.log(`🔄 WebSocket重连 (${this.wsManager.reconnectAttempts}/${this.wsManager.maxReconnectAttempts})，${delay}ms后重试`)
      
      setTimeout(() => {
        this.connectWebSocket()
      }, delay)
    } else {
      console.warn('⚠️ WebSocket重连次数已达上限，停止重连')
    }
  },

  /**
   * 🔧 优化：处理WebSocket关闭
   */
  handleWebSocketClose(close) {
    const envConfig = this.globalData.config || this.globalData
    const devConfig = envConfig.developmentMode || {}
    
    if (this.wsManager) {
      this.wsManager.connected = false
      this.wsManager.socket = null
      
      // 停止心跳
      if (this.wsManager.heartbeatInterval) {
        clearInterval(this.wsManager.heartbeatInterval)
        this.wsManager.heartbeatInterval = null
      }
    }
    
    // 🔧 正常关闭不重连
    if (close.code === 1000) {
      console.log('✅ WebSocket正常关闭')
      return
    }
    
    // 🔧 异常关闭尝试重连
    if (devConfig.webSocketReconnect && this.wsManager && 
        this.wsManager.reconnectAttempts < this.wsManager.maxReconnectAttempts) {
      
      this.wsManager.reconnectAttempts++
      const delay = this.wsManager.reconnectDelay * this.wsManager.reconnectAttempts
      
      console.log(`🔄 WebSocket异常关闭，${delay}ms后重连`)
      
      setTimeout(() => {
        this.connectWebSocket()
      }, delay)
    }
  },

  /**
   * 🔧 新增：处理WebSocket消息
   */
  handleWebSocketMessage(data) {
    try {
      const message = JSON.parse(data)
      const { event, data: eventData } = message
      
      // 处理特定事件
      if (this.wsEventListeners[event]) {
        this.wsEventListeners[event](eventData)
      } else {
        console.log('📨 未处理的WebSocket事件:', event, eventData)
      }
    } catch (error) {
      console.error('❌ 解析WebSocket消息失败:', error, data)
    }
  },

  /**
   * 🔧 新增：启动心跳
   */
  startHeartbeat() {
    if (this.wsManager && this.wsManager.heartbeatInterval) {
      clearInterval(this.wsManager.heartbeatInterval)
    }
    
    if (this.wsManager) {
      this.wsManager.heartbeatInterval = setInterval(() => {
        if (this.wsManager.connected && this.wsManager.socket) {
          this.wsManager.socket.send({
            data: JSON.stringify({ type: 'heartbeat' })
          })
        }
      }, 30000) // 每30秒发送一次心跳
    }
  },

  /**
   * 🔧 新增：发送队列中的消息
   */
  sendQueuedMessages() {
    if (this.wsManager && this.wsManager.messageQueue.length > 0) {
      this.wsManager.messageQueue.forEach(message => {
        if (this.wsManager.socket) {
          this.wsManager.socket.send({ data: JSON.stringify(message) })
        }
      })
      this.wsManager.messageQueue = []
    }
  },

  /**
   * 验证Token有效性
   */
  verifyToken() {
    // 🔧 修复：开发环境跳过认证时返回resolved Promise
    if (this.globalData.isDev && !this.globalData.needAuth) {
      console.log('🔧 开发环境跳过Token验证')
      return Promise.resolve({ code: 0, data: { valid: true, user_info: this.globalData.userInfo } })
    }
    
    // 🔧 修复：正确返回Promise
    const API = require('./utils/api.js')
    return API.authAPI.verifyToken().then((res) => {
      if (res.code === 0 && res.data.valid) {
        // 🔧 更新用户信息
        if (res.data.user_info) {
        this.globalData.userInfo = res.data.user_info
        }
        this.globalData.isLoggedIn = true
        console.log('✅ Token验证成功')
        
        return res // 返回成功结果
      } else {
        console.log('❌ Token验证失败，后端返回无效状态')
        throw new Error('Token验证失败')
      }
    }).catch((error) => {
      console.error('❌ Token验证失败:', error)
      throw error // 重新抛出错误，让调用者处理
    })
  },

  /**
   * 跳转到认证页面
   */
  redirectToAuth() {
    // 检查当前页面是否已经是认证页面
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    
    if (currentPage && currentPage.route !== 'pages/auth/auth') {
      wx.navigateTo({
        url: '/pages/auth/auth'
      })
    }
  },

  // 🔧 优化：带冷却期的Token检查
  refreshTokenIfNeededWithCooldown() {
    if (!this.globalData.isLoggedIn || (this.globalData.isDev && !this.globalData.needAuth)) return
    
    const now = Date.now()
    
    // 🔧 登录成功后的冷却期检查
    if (this.globalData.lastLoginTime && (now - this.globalData.lastLoginTime) < this.globalData.tokenVerifyCooldown) {
      console.log('🔧 登录冷却期内，跳过Token验证')
      return
    }
    
    // 🔧 避免频繁验证
    if (this.globalData.lastTokenVerifyTime && (now - this.globalData.lastTokenVerifyTime) < this.globalData.tokenVerifyInterval) {
      console.log('🔧 Token验证间隔未到，跳过验证')
      return
    }
    
    // 🔧 记录验证时间
    this.globalData.lastTokenVerifyTime = now
    
    // 检查Token过期时间
    if (this.globalData.tokenExpireTime && now >= this.globalData.tokenExpireTime - 300000) {
      // Token将在5分钟内过期，提前刷新
      console.log('🔧 Token即将过期，开始刷新')
      this.refreshToken()
    } else {
      // 🔧 定期验证Token有效性，但增加容错机制
      console.log('🔧 开始验证Token有效性（带容错）')
      this.verifyTokenWithRetry()
    }
  },

  // 🔧 新增：带重试的Token验证
  verifyTokenWithRetry(retryCount = 0) {
    const maxRetries = 2
    
    return new Promise((resolve, reject) => {
      this.verifyToken().then(() => {
        console.log('✅ Token验证成功')
        resolve()
      }).catch((error) => {
        console.warn(`⚠️ Token验证失败 (第${retryCount + 1}次):`, error)
        
        // 🔧 网络错误或临时故障时重试
        if (retryCount < maxRetries && this.isNetworkOrTemporaryError(error)) {
          console.log(`🔄 Token验证重试 (${retryCount + 1}/${maxRetries})`)
          setTimeout(() => {
            this.verifyTokenWithRetry(retryCount + 1).then(resolve).catch(reject)
          }, (retryCount + 1) * 2000) // 递增延迟
        } else {
          // 🔧 真正的认证失败才执行logout
          if (retryCount >= maxRetries || this.isAuthenticationError(error)) {
            console.error('❌ Token验证彻底失败，执行登出')
            reject(error)
          } else {
            console.warn('⚠️ Token验证失败但不影响使用，忽略此次验证')
            resolve() // 容错处理，继续使用
          }
        }
      })
    })
  },

  // 🔧 新增：判断是否为网络或临时错误
  isNetworkOrTemporaryError(error) {
    if (!error) return false
    
    // 网络错误
    if (error.isNetworkError === true) return true
    
    // 常见的临时错误码
    const temporaryErrorCodes = [
      'NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_FAILED', 
      500, 502, 503, 504, -1, -2, -3
    ]
    
    if (temporaryErrorCodes.includes(error.code)) return true
    
    // 错误消息包含网络相关关键词
    if (error.message) {
      const networkKeywords = ['timeout', '超时', '网络', 'network', 'connection', '连接']
      return networkKeywords.some(keyword => 
        error.message.toLowerCase().includes(keyword.toLowerCase())
      )
    }
    
    return false
  },

  // 🔧 新增：判断是否为认证错误
  isAuthenticationError(error) {
    if (!error) return false
    
    // 明确的认证错误码
    const authErrorCodes = [401, 403, 2001]
    if (authErrorCodes.includes(error.code)) return true
    
    // 错误消息包含认证相关关键词
    if (error.message) {
      const authKeywords = ['unauthorized', 'forbidden', 'token', 'auth', '认证', '授权', '令牌']
      return authKeywords.some(keyword => 
        error.message.toLowerCase().includes(keyword.toLowerCase())
      )
    }
    
    return false
  },

  // 刷新Token（保持原有逻辑）
  refreshTokenIfNeeded() {
    if (!this.globalData.isLoggedIn || (this.globalData.isDev && !this.globalData.needAuth)) return
    
    const now = Date.now()
    if (this.globalData.tokenExpireTime && now >= this.globalData.tokenExpireTime - 300000) {
      // Token将在5分钟内过期，提前刷新
      this.refreshToken()
    }
  },

  /**
   * 刷新Token
   */
  refreshToken() {
    const API = require('./utils/api.js')
    API.authAPI.refresh(this.globalData.refreshToken).then((res) => {
      if (res.code === 0) {
        // 更新Token信息
        this.globalData.accessToken = res.data.access_token
        this.globalData.refreshToken = res.data.refresh_token
        this.globalData.tokenExpireTime = Date.now() + res.data.expires_in * 1000
        
        // 保存到本地存储
        wx.setStorageSync('access_token', res.data.access_token)
        wx.setStorageSync('refresh_token', res.data.refresh_token)
        wx.setStorageSync('token_expire_time', this.globalData.tokenExpireTime)
        
        console.log('✅ Token刷新成功')
        
        // 🔧 修复：重新连接WebSocket（有错误处理）
        setTimeout(() => {
          this.connectWebSocket()
        }, 500)
      } else {
        console.log('❌ Token刷新失败，重新登录')
        this.logout()
      }
    }).catch((error) => {
      console.error('Token刷新失败:', error)
      this.logout()
    })
  },

  /**
   * 🔴 v2.1.3新增：数据安全处理方法
   */
  safeSetData(data) {
    if (!this.globalData.dataProcessing.enableSafeSetData) {
      return data
    }
    
    // 递归过滤undefined值
    const filterUndefined = (obj) => {
      if (obj === null || obj === undefined) {
        return null
      }
      
      if (Array.isArray(obj)) {
        return obj.map(item => filterUndefined(item)).filter(item => item !== undefined)
      }
      
      if (typeof obj === 'object') {
        const filtered = {}
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            filtered[key] = filterUndefined(value)
          }
        }
        return filtered
      }
      
      return obj
    }
    
    return this.globalData.dataProcessing.filterUndefinedValues ? filterUndefined(data) : data
  },

  /**
   * 🔴 v2.1.3新增：API响应格式验证
   */
  validateApiResponse(response) {
    if (!this.globalData.dataProcessing.validateApiResponseFormat) {
      return true
    }
    
    // 检查基本格式
    if (!response || typeof response !== 'object') {
      console.warn('⚠️ API响应格式异常：不是对象')
      return false
    }
    
    // 检查必需字段
    if (!response.hasOwnProperty('code')) {
      console.warn('⚠️ API响应格式异常：缺少code字段')
      return false
    }
    
    if (!response.hasOwnProperty('msg') && !response.hasOwnProperty('message')) {
      console.warn('⚠️ API响应格式异常：缺少msg或message字段')
      return false
    }
    
    return true
  },

  /**
   * 🔴 v2.1.3新增：字段映射处理
   */
  mapFieldsToFrontend(data, entityType) {
    if (!this.globalData.dataProcessing.strictFieldMapping || !data) {
      return data
    }
    
    const mapping = this.globalData.dbFieldMapping[entityType]
    if (!mapping) {
      console.warn(`⚠️ 未找到${entityType}的字段映射配置`)
      return data
    }
    
    // 如果是数组，递归处理每个元素
    if (Array.isArray(data)) {
      return data.map(item => this.mapFieldsToFrontend(item, entityType))
    }
    
    // 对象字段映射
    const mappedData = {}
    for (const [frontendField, backendField] of Object.entries(mapping)) {
      if (data.hasOwnProperty(backendField)) {
        mappedData[frontendField] = data[backendField]
      }
    }
    
    return mappedData
  },

  /**
   * 🔴 v2.1.3新增：注册状态监听器
   */
  addStatusListener(listener) {
    if (typeof listener === 'function') {
      this.globalData.statusListeners.push(listener)
      console.log('✅ 状态监听器已注册，当前数量:', this.globalData.statusListeners.length)
    }
  },

  /**
   * 🔴 v2.1.3新增：移除状态监听器
   */
  removeStatusListener(listener) {
    const index = this.globalData.statusListeners.indexOf(listener)
    if (index > -1) {
      this.globalData.statusListeners.splice(index, 1)
      console.log('✅ 状态监听器已移除，当前数量:', this.globalData.statusListeners.length)
    }
  },

  /**
   * 🔴 v2.1.3新增：WebSocket消息处理器注册
   */
  registerWebSocketHandler(eventName, handler) {
    if (!this.globalData.webSocketMessageHandlers.has(eventName)) {
      this.globalData.webSocketMessageHandlers.set(eventName, [])
    }
    this.globalData.webSocketMessageHandlers.get(eventName).push(handler)
    console.log(`✅ WebSocket事件处理器已注册: ${eventName}`)
  },

  /**
   * 🔴 v2.1.3新增：WebSocket消息处理器移除
   */
  unregisterWebSocketHandler(eventName, handler) {
    if (this.globalData.webSocketMessageHandlers.has(eventName)) {
      const handlers = this.globalData.webSocketMessageHandlers.get(eventName)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
        console.log(`✅ WebSocket事件处理器已移除: ${eventName}`)
      }
    }
  },

  /**
   * 用户登录成功处理
   */
  onLoginSuccess(loginData) {
    const { access_token, refresh_token, expires_in, user_info } = loginData
    
    // 🔧 设置登录时间，启动验证冷却期
    const now = Date.now()
    
    // 保存认证信息
    this.globalData.accessToken = access_token
    this.globalData.refreshToken = refresh_token
    this.globalData.tokenExpireTime = now + expires_in * 1000
    this.globalData.userInfo = user_info
    this.globalData.isLoggedIn = true
    
    // 🔧 新增：设置登录冷却期，防止立即验证Token
    this.globalData.lastLoginTime = now
    this.globalData.lastTokenVerifyTime = null // 重置验证时间
    
    // 保存到本地存储
    wx.setStorageSync('access_token', access_token)
    wx.setStorageSync('refresh_token', refresh_token)
    wx.setStorageSync('token_expire_time', this.globalData.tokenExpireTime)
    wx.setStorageSync('user_info', user_info)
    wx.setStorageSync('last_login_time', now) // 保存登录时间
    
    // 🔧 修复：登录成功后通知所有页面更新状态
    this.notifyAllPages('userStatusChanged', {
      isLoggedIn: true,
      userInfo: user_info,
      accessToken: access_token
    })
    
    // 🔧 修复：登录成功后安全连接WebSocket
    setTimeout(() => {
      this.connectWebSocket()
    }, 1500) // 延迟连接，确保所有数据设置完成
    
    console.log('✅ 用户登录成功，已设置验证冷却期:', {
      user: user_info.nickname || user_info.mobile,
      cooldownTime: this.globalData.tokenVerifyCooldown / 1000 + '秒'
    })
  },

  // 退出登录
  logout() {
    // 断开WebSocket连接
    if (this.globalData.wsManager) {
      this.globalData.wsManager.disconnect()
    }
    
    // 清除用户数据
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    this.globalData.accessToken = null
    this.globalData.refreshToken = null
    this.globalData.tokenExpireTime = null
    this.globalData.wsConnected = false
    
    // 清除本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('token_expire_time')
    wx.removeStorageSync('user_info')
    
    // 🔧 修复：退出登录时通知所有页面更新状态
    this.notifyAllPages('userStatusChanged', {
      isLoggedIn: false,
      userInfo: null,
      accessToken: null
    })
    
    // 跳转到认证页面
    wx.reLaunch({
      url: '/pages/auth/auth'
    })
    
    console.log('✅ 用户已退出登录')
  }
})
