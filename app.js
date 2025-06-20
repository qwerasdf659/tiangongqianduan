// app.js - 餐厅积分抽奖系统全局配置

App({
  /**
   * 生命周期函数--监听小程序初始化
   * 当小程序初始化完成时，会触发 onLaunch（全局只触发一次）
   */
  onLaunch() {
    console.log('🚀 餐厅积分系统启动')
    
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
    
    // 初始化WebSocket管理器
    this.initWebSocket()
    
    // 设置全局错误处理
    this.setupGlobalErrorHandler()
    
    // 检查登录状态
    this.checkLoginStatus()
    
    console.log('✅ 系统初始化完成')
  },

  /**
   * 初始化全局数据
   */
  initGlobalData() {
    // 确保全局数据结构完整
    this.globalData = {
      ...this.globalData,
      // 确保关键字段有默认值
      isDev: this.globalData.isDev || false,
      needAuth: this.globalData.needAuth !== false, // 默认需要认证
      userInfo: this.globalData.userInfo || null,
      mockUser: this.globalData.mockUser || {
        user_id: 1001,
        nickname: '测试用户',
        avatar: '/images/default-avatar.png',
        total_points: 1500,
        phone: '138****8000',
        is_merchant: false,
        created_at: new Date().toISOString()
      }
    }
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
          path: getCurrentPages().length > 0 ? getCurrentPages()[getCurrentPages().length - 1].route : 'unknown'
        }
        
        // 可以发送到错误监控服务
        this.reportError(errorInfo)
      } catch (reportError) {
        console.warn('错误上报失败:', reportError)
      }
    })

    // 监听未处理的Promise拒绝
    wx.onUnhandledRejection((res) => {
      console.error('🚨 未处理的Promise拒绝:', res)
      
      // 防止因未捕获的Promise导致小程序崩溃
      res.reason && console.error('拒绝原因:', res.reason)
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
    // 🔴 环境配置 - 生产环境时需要修改
    isDev: true,        // 开发环境标志，生产环境设为false
    needAuth: false,    // 是否需要强制认证，生产环境设为true
    
    // 🔴 API服务地址配置 - 根据后端文档配置
    api: {
      dev: {
        // 开发环境使用mock数据
        baseUrl: 'https://dev-api.restaurant-points.com',
        wsUrl: 'wss://dev-ws.restaurant-points.com'
      },
      prod: {
        // 🔴 生产环境API地址 - 根据后端文档配置
        baseUrl: 'https://rqchrlqndora.sealosbja.site',     // 后端服务地址
        wsUrl: 'wss://rqchrlqndora.sealosbja.site:8080'     // WebSocket地址
      }
    },
    
    // 当前使用的API地址
    baseUrl: '',
    wsUrl: '',
    
    // 🔴 Sealos对象存储配置 - 根据后端文档配置
    sealosConfig: {
      endpoint: 'https://objectstorageapi.bja.sealos.run',  // 后端文档中的真实地址
      bucket: 'tiangong',                                    // 后端文档中的存储桶
      accessKeyId: 'br0za7uc',                              // 后端文档中的访问密钥
      secretAccessKey: 'skxg8mk5gqfhf9xz',                  // 后端文档中的密钥
      region: 'bja'                                          // 区域配置
    },
    
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 认证相关
    accessToken: null,
    refreshToken: null,
    tokenExpireTime: null,
    
    // 🔴 数据库字段映射 - 根据后端文档的数据库设计
    dbFieldMapping: {
      user: {
        id: 'user_id',
        mobile: 'mobile',
        points: 'total_points',
        isMerchant: 'is_merchant',
        nickname: 'nickname',
        avatar: 'avatar',
        wxOpenid: 'wx_openid',
        deviceInfo: 'device_info',
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
      commodity: {
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
        rating: 'rating',
        salesCount: 'sales_count'
      }
    },
    
    // 开发环境模拟用户数据
    mockUser: {
      user_id: 1001,
      mobile: '138****8000',
      total_points: 1500,
      is_merchant: false,
      nickname: '测试用户',
      avatar: '/images/default-avatar.png',
      wx_openid: 'mock_openid_123',
      device_info: {},
      last_login: new Date().toISOString(),
      status: 'active',
      created_at: '2024-01-01 00:00:00'
    },

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
   * 初始化环境配置
   */
  initEnvironmentConfig() {
    const config = this.globalData.isDev ? this.globalData.api.dev : this.globalData.api.prod
    this.globalData.baseUrl = config.baseUrl
    this.globalData.wsUrl = config.wsUrl
    
    console.log('🔧 环境配置初始化完成:', {
      isDev: this.globalData.isDev,
      baseUrl: this.globalData.baseUrl,
      wsUrl: this.globalData.wsUrl
    })
  },

  /**
   * 初始化WebSocket管理器
   */
  initWebSocket() {
    const WSManager = require('./utils/ws.js')
    this.globalData.wsManager = new WSManager()
    
    // 监听WebSocket事件
    this.setupWebSocketListeners()
  },

  /**
   * 设置WebSocket事件监听
   */
  setupWebSocketListeners() {
    const wsManager = this.globalData.wsManager
    
    // 连接成功
    wsManager.on('connected', () => {
      this.globalData.wsConnected = true
      console.log('✅ WebSocket连接成功')
    })
    
    // 连接断开
    wsManager.on('disconnected', () => {
      this.globalData.wsConnected = false
      console.log('🔌 WebSocket连接断开')
    })
    
    // 🔴 库存更新推送 - 根据后端文档实现
    wsManager.on('stock_update', (event) => {
      const { product_id, stock, operation } = event.data
      console.log('📦 收到库存更新:', { product_id, stock, operation })
      
      // 更新本地缓存
      this.updateProductStock(product_id, stock)
      
      // 通知兑换页面更新
      if (this.globalData.updateExchangeProducts) {
        this.globalData.updateExchangeProducts()
      }
    })
    
    // 🔴 积分更新推送 - 根据后端文档实现
    wsManager.on('points_update', (event) => {
      const { user_id, total_points, change_points, reason } = event.data
      console.log('💰 收到积分更新:', { user_id, total_points, change_points, reason })
      
      // 更新用户积分
      if (this.globalData.userInfo && this.globalData.userInfo.user_id === user_id) {
        this.globalData.userInfo.total_points = total_points
        
        // 显示积分变动提示
        const title = change_points > 0 ? `+${change_points}积分` : `${change_points}积分`
        wx.showToast({
          title,
          icon: 'none',
          duration: 2000
        })
      }
    })
    
    // 🔴 审核结果推送 - 根据后端文档实现
    wsManager.on('review_result', (event) => {
      const { upload_id, status, points_awarded, review_reason } = event.data
      console.log('📋 收到审核结果:', { upload_id, status, points_awarded, review_reason })
      
      // 显示审核结果通知
      const title = status === 'approved' ? '审核通过' : '审核未通过'
      const content = `上传ID: ${upload_id}\n${review_reason}`
      if (points_awarded > 0) {
        content += `\n获得积分: ${points_awarded}`
      }
      
      wx.showModal({
        title,
        content,
        showCancel: false
      })
    })
  },

  /**
   * 更新商品库存
   */
  updateProductStock(productId, newStock) {
    // 更新缓存中的商品库存
    const cacheIndex = this.globalData.productsCache.findIndex(p => p.commodity_id === productId)
    if (cacheIndex !== -1) {
      this.globalData.productsCache[cacheIndex].stock = newStock
    }
    
    // 标记需要刷新商品列表
    this.globalData.needRefreshExchangeProducts = true
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    console.log('🔐 检查用户登录状态')
    
    // 开发环境跳过认证检查
    if (this.globalData.isDev && !this.globalData.needAuth) {
      console.log('🔧 开发环境，跳过登录检查')
      return
    }

    // 检查是否有有效的Token
    const accessToken = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const tokenExpireTime = wx.getStorageSync('token_expire_time')

    if (accessToken && refreshToken) {
      // 设置全局Token
      this.globalData.accessToken = accessToken
      this.globalData.refreshToken = refreshToken
      this.globalData.tokenExpireTime = tokenExpireTime

      // 检查Token是否过期
      if (tokenExpireTime && Date.now() < tokenExpireTime) {
        console.log('✅ Token有效')
        this.verifyToken()
      } else {
        console.log('⏰ Token已过期，尝试刷新')
        this.refreshToken()
      }
    } else {
      console.log('❌ 未找到有效Token，需要重新登录')
      // 不自动跳转登录页，让用户自然使用应用
    }
  },

  /**
   * 连接WebSocket
   */
  connectWebSocket() {
    if (this.globalData.wsManager && this.globalData.accessToken) {
      const wsUrl = `${this.globalData.wsUrl}?token=${this.globalData.accessToken}&version=1.0`
      this.globalData.wsManager.connect(wsUrl)
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
        console.log('✅ Token验证成功')
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
    
    // 连接WebSocket
    this.connectWebSocket()
    
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
    
    console.log('�� 用户已退出登录')
  }
})
