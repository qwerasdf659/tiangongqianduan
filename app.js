// app.js - 餐厅积分抽奖系统全局配置（基于产品功能结构文档v2.1.2优化）

App({
  /**
   * 生命周期函数--监听小程序初始化
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   */
  onLaunch() {
    console.log('🚀 餐厅积分系统启动 - v2.1.2')
    
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
    
    console.log('✅ 系统初始化完成 - v2.1.2配置生效')
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
      // 🔴 v2.1.2版本标识
      version: 'v2.1.2',
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
    
    // 🔴 v2.1.2开发阶段配置
    this.globalData.developmentMode = envConfig.developmentMode || {}
    
    console.log('🔧 环境配置初始化完成 - v2.1.2:', {
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
          version: 'v2.1.2'
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
    // 每次前台时检查Token状态
    this.refreshTokenIfNeeded()
  },

  globalData: {
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 认证相关
    accessToken: null,
    refreshToken: null,
    tokenExpireTime: null,
    
    // 🔴 数据库字段映射 - 根据后端文档的8张核心表设计
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
      }
    },
    
    // 🔴 严禁硬编码用户数据 - 已移除mockUser违规代码
    // ✅ 所有用户数据必须通过后端API获取：userAPI.getUserInfo()

    // WebSocket管理
    wsManager: null,
    wsConnected: false,
    wsReconnectCount: 0,
    
    // 数据同步管理
    needRefreshExchangeProducts: false,
    merchantProductsLastUpdate: 0,
    productsCache: [],
    productsCacheTime: 0,
    updateExchangeProducts: null
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
    
    if (token && refreshToken && userInfo) {
      // 验证Token有效性
      this.verifyToken().then(() => {
        this.globalData.isLoggedIn = true
        this.globalData.accessToken = token
        this.globalData.refreshToken = refreshToken
        this.globalData.userInfo = userInfo
        
        console.log('✅ 登录状态验证成功')
        
        // 🔧 优化：延迟连接WebSocket，确保用户状态已就绪
        setTimeout(() => {
          this.connectWebSocket()
        }, 1000)
      }).catch((error) => {
        console.warn('⚠️ Token验证失败，需要重新登录:', error)
        this.logout()
      })
    } else {
      console.log('📝 用户未登录')
      this.globalData.isLoggedIn = false
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
    if (this.globalData.isDev && !this.globalData.needAuth) return
    
    const API = require('./utils/api.js')
    API.authAPI.verifyToken().then((res) => {
      if (res.code === 0 && res.data.valid) {
        this.globalData.userInfo = res.data.user_info
        this.globalData.isLoggedIn = true
        console.log('✅ Token验证成功')
        
        // 🔧 修复：安全连接WebSocket
        setTimeout(() => {
          this.connectWebSocket()
        }, 1000) // 延迟1秒连接，确保token设置完成
      } else {
        console.log('❌ Token验证失败，重新登录')
        this.logout()
      }
    }).catch((error) => {
      console.error('Token验证失败:', error)
      this.logout()
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

  // 刷新Token
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
   * 用户登录成功处理
   */
  onLoginSuccess(loginData) {
    const { access_token, refresh_token, expires_in, user_info } = loginData
    
    // 保存认证信息
    this.globalData.accessToken = access_token
    this.globalData.refreshToken = refresh_token
    this.globalData.tokenExpireTime = Date.now() + expires_in * 1000
    this.globalData.userInfo = user_info
    this.globalData.isLoggedIn = true
    
    // 保存到本地存储
    wx.setStorageSync('access_token', access_token)
    wx.setStorageSync('refresh_token', refresh_token)
    wx.setStorageSync('token_expire_time', this.globalData.tokenExpireTime)
    wx.setStorageSync('user_info', user_info)
    
    // 🔧 修复：登录成功后安全连接WebSocket
    setTimeout(() => {
      this.connectWebSocket()
    }, 1500) // 延迟连接，确保所有数据设置完成
    
    console.log('✅ 用户登录成功:', user_info)
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
    
    // 跳转到认证页面
    wx.reLaunch({
      url: '/pages/auth/auth'
    })
    
    console.log('✅ 用户已退出登录')
  }
})
