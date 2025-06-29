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
    
    // 初始化环境配置
    this.initEnvironmentConfig()
    
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
      userInfo: this.globalData.userInfo || null
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
    
    console.log('🔧 环境配置初始化完成:', {
      env: require('./config/env.js').getCurrentEnv(),
      isDev: this.globalData.isDev,
      baseUrl: this.globalData.baseUrl,
      wsUrl: this.globalData.wsUrl
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
    const WSManager = require('./utils/ws.js')
    this.globalData.wsManager = new WSManager()
    
    // 监听WebSocket事件
    this.setupWebSocketListeners()
  },

  /**
   * 🔴 设置WebSocket事件监听 - 根据后端文档实现
   */
  setupWebSocketListeners() {
    if (!this.globalData.wsManager) {
      console.warn('WebSocket管理器未初始化')
      return
    }

    // 监听连接事件
    this.globalData.wsManager.on('connected', () => {
      console.log('✅ WebSocket连接成功')
      this.globalData.wsConnected = true
    })

    this.globalData.wsManager.on('disconnected', () => {
      console.log('🔌 WebSocket连接断开')
      this.globalData.wsConnected = false
    })

    // 🔴 监听积分更新推送 - 根据后端文档实现
    this.globalData.wsManager.on('points_update', (event) => {
      console.log('💰 收到积分更新推送:', event)
      
      const { user_id, total_points, change_points, reason_text } = event.data
      
      // 更新全局用户积分
      if (this.globalData.userInfo && this.globalData.userInfo.user_id === user_id) {
        this.globalData.userInfo.total_points = total_points
        
        // 显示积分变更提示
        if (change_points !== 0) {
          const changeText = change_points > 0 ? `+${change_points}` : `${change_points}`
          wx.showToast({
            title: `积分${changeText} (${reason_text})`,
            icon: 'none',
            duration: 3000
          })
        }
      }
      
      // 通知所有页面更新积分显示
      this.notifyAllPages('onPointsUpdate', { total_points, change_points, reason_text })
    })

    // 🔴 监听库存更新推送 - 根据后端文档实现
    this.globalData.wsManager.on('stock_update', (event) => {
      console.log('📦 收到库存更新推送:', event)
      
      const { product_id, stock, product_name } = event.data
      
      // 更新本地商品库存缓存
      this.updateProductStock(product_id, stock)
      
      // 通知所有页面更新库存显示
      this.notifyAllPages('onStockUpdate', { product_id, stock, product_name })
      
      // 显示库存变更提示
      if (stock <= 5 && stock > 0) {
        wx.showToast({
          title: `${product_name} 库存不足`,
          icon: 'none',
          duration: 2000
        })
      } else if (stock === 0) {
        wx.showToast({
          title: `${product_name} 已售罄`,
          icon: 'none',
          duration: 2000
        })
      }
    })

    // 🔴 监听审核结果推送 - 根据后端文档实现
    this.globalData.wsManager.on('review_result', (event) => {
      console.log('📋 收到审核结果推送:', event)
      
      const { upload_id, status, points_awarded, review_reason } = event.data
      
      // 显示审核结果弹窗
      let title, content
      
      if (status === 'approved') {
        title = '审核通过！'
        content = `恭喜！您的小票审核通过\n获得积分：${points_awarded}分\n审核说明：${review_reason}`
        
        // 更新用户积分
        if (this.globalData.userInfo) {
          this.globalData.userInfo.total_points += points_awarded
        }
      } else if (status === 'rejected') {
        title = '审核未通过'
        content = `很抱歉，您的小票审核未通过\n审核说明：${review_reason}\n请重新上传清晰的小票图片`
      } else {
        title = '审核状态更新'
        content = `上传ID：${upload_id}\n状态：${status}\n说明：${review_reason}`
      }
      
      wx.showModal({
        title,
        content,
        showCancel: false,
        confirmText: status === 'approved' ? '太好了' : '知道了'
      })
      
      // 通知所有页面更新审核状态
      this.notifyAllPages('onReviewResult', { upload_id, status, points_awarded, review_reason })
    })

    console.log('✅ WebSocket事件监听已设置完成')
  },

  /**
   * 通知所有页面更新数据
   */
  notifyAllPages(eventName, data) {
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (page[eventName] && typeof page[eventName] === 'function') {
        page[eventName](data)
      }
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
   * 连接WebSocket - 根据后端文档格式
   */
  connectWebSocket() {
    if (this.globalData.wsManager && this.globalData.accessToken) {
      // 🔴 根据后端文档，直接使用wsUrl + token参数
      const wsUrl = `${this.globalData.wsUrl}?token=${this.globalData.accessToken}&client_type=miniprogram`
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
        this.globalData.isLoggedIn = true
        console.log('✅ Token验证成功')
        
        // 连接WebSocket
        this.connectWebSocket()
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
        
        // 重新连接WebSocket
        this.connectWebSocket()
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
    
    console.log('✅ 用户已退出登录')
  }
})
