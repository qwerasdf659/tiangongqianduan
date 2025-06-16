// app.js - 餐厅积分抽奖系统全局配置
App({
  onLaunch() {
    // 初始化日志
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
    
    // 初始化环境配置
    this.initEnvironmentConfig()
    
    // 初始化认证检查
    this.checkAuthStatus()
  },

  onShow() {
    // 每次前台时检查Token状态
    this.refreshTokenIfNeeded()
  },

  globalData: {
    // 环境配置 - 生产环境时需要修改为false
    isDev: true,  // 开发环境标志，生产环境设为false
    needAuth: false,  // 是否需要强制认证，生产环境设为true
    
    // API服务地址配置
    // 生产环境部署时需要替换以下地址为实际的后端服务地址
    api: {
      // 开发环境和生产环境的API地址
      dev: {
        baseUrl: 'https://dev-api.restaurant-points.com',  // 开发环境API地址
        wsUrl: 'wss://dev-ws.restaurant-points.com'        // 开发环境WebSocket地址
      },
      prod: {
        baseUrl: 'https://api.restaurant-points.com',      // 生产环境API地址 - 需要后端提供
        wsUrl: 'wss://ws.restaurant-points.com'            // 生产环境WebSocket地址 - 需要后端提供
      }
    },
    
    // 当前使用的API地址 - 在initEnvironmentConfig中设置
    baseUrl: '',
    wsUrl: '',
    
    // Sealos对象存储配置
    // 生产环境部署时需要配置实际的Sealos存储服务参数
    sealosConfig: {
      endpoint: 'https://objectstorageapi.sealos.io',     // Sealos存储API端点 - 需要运维配置
      bucket: 'restaurant-points-system',                  // 存储桶名称 - 需要运维创建
      region: 'cn-east-1',                                // 存储区域 - 根据实际部署确定
      accessKeyId: '',                                     // 访问密钥ID - 需要运维提供
      secretAccessKey: ''                                  // 访问密钥 - 需要运维提供
    },
    
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 认证相关
    accessToken: null,
    refreshToken: null,
    tokenExpireTime: null,
    
    // 开发环境模拟用户数据
    // 生产环境时此部分数据不会被使用
    mockUser: {
      user_id: 1001,
      phone: '138****8000',
      total_points: 1500,
      is_merchant: false,
      nickname: '测试用户',
      avatar: '/images/default-avatar.png',
      created_at: '2024-01-01 00:00:00'
    },

    // 商品数据联动相关
    needRefreshExchangeProducts: false, // 是否需要刷新兑换页面商品
    merchantProductsLastUpdate: 0, // 商家管理页面最后更新时间戳
    
    // 全局商品缓存
    productsCache: [],
    productsCacheTime: 0,
    
    // 页面间数据同步回调
    updateExchangeProducts: null, // 兑换页面更新回调函数
    
    // WebSocket连接状态
    wsConnected: false,
    wsReconnectCount: 0,
    wsHeartbeatTimer: null
  },

  /**
   * 初始化环境配置
   * 根据isDev标志设置相应的API地址
   */
  initEnvironmentConfig() {
    const config = this.globalData.isDev ? this.globalData.api.dev : this.globalData.api.prod
    this.globalData.baseUrl = config.baseUrl
    this.globalData.wsUrl = config.wsUrl
  },

  // 检查认证状态
  checkAuthStatus() {
    if (this.globalData.isDev && !this.globalData.needAuth) {
      // 开发环境且不需要强制认证时，使用模拟用户数据
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = this.globalData.mockUser
      return
    }
    
    // 生产环境或需要强制认证时，检查本地存储的Token
    const token = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const tokenExpireTime = wx.getStorageSync('token_expire_time')
    
    if (token && refreshToken) {
      this.globalData.accessToken = token
      this.globalData.refreshToken = refreshToken
      this.globalData.tokenExpireTime = tokenExpireTime
      this.globalData.isLoggedIn = true
      
      // TODO: 后端对接 - 验证Token有效性
      // 这里需要调用后端接口验证Token是否仍然有效
      // 后端接口: GET /api/auth/verify-token
      // 请求头: Authorization: Bearer {access_token}
      // 返回: { code: 0, data: { valid: true, user_info: {...} } }
      this.verifyToken()
    } else {
      // 没有Token时跳转到认证页面
      this.redirectToAuth()
    }
  },

  /**
   * 验证Token有效性
   * TODO: 后端对接 - 需要后端提供Token验证接口
   */
  async verifyToken() {
    if (this.globalData.isDev && !this.globalData.needAuth) return
    
    try {
      // TODO: 后端对接点
      // const res = await wx.request({
      //   url: this.globalData.baseUrl + '/api/auth/verify-token',
      //   method: 'GET',
      //   header: {
      //     'Authorization': `Bearer ${this.globalData.accessToken}`
      //   }
      // })
      // 
      // if (res.data.code === 0 && res.data.data.valid) {
      //   this.globalData.userInfo = res.data.data.user_info
      // } else {
      //   this.logout()
      // }
      
      console.log('Token验证功能需要后端接口支持')
    } catch (error) {
      console.error('Token验证失败:', error)
      this.logout()
    }
  },

  /**
   * 跳转到认证页面
   */
  redirectToAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    })
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
   * TODO: 后端对接 - Token刷新接口
   */
  async refreshToken() {
    const that = this
    
    try {
      // TODO: 后端对接点 - Token刷新接口
      // 后端接口规范:
      // POST /api/auth/refresh
      // 请求头: Authorization: Bearer {refresh_token}
      // 返回: {
      //   code: 0,
      //   data: {
      //     access_token: "new_access_token",
      //     refresh_token: "new_refresh_token", 
      //     expires_in: 7200
      //   }
      // }
      
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: this.globalData.baseUrl + '/api/auth/refresh',
          method: 'POST',
          header: {
            'Authorization': 'Bearer ' + this.globalData.refreshToken,
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        })
      })

      if (res.data.code === 0) {
        // 更新Token信息
        that.globalData.accessToken = res.data.data.access_token
        that.globalData.refreshToken = res.data.data.refresh_token
        that.globalData.tokenExpireTime = Date.now() + res.data.data.expires_in * 1000
        
        // 本地存储更新
        wx.setStorageSync('access_token', res.data.data.access_token)
        wx.setStorageSync('refresh_token', res.data.data.refresh_token)
        wx.setStorageSync('token_expire_time', that.globalData.tokenExpireTime)
        
        console.log('Token刷新成功')
      } else {
        // 刷新失败，重新登录
        that.logout()
      }
    } catch (error) {
      console.error('Token刷新失败:', error)
      that.logout()
    }
  },

  // 退出登录
  logout() {
    this.globalData.isLoggedIn = false
    this.globalData.accessToken = null
    this.globalData.refreshToken = null
    this.globalData.userInfo = null
    this.globalData.tokenExpireTime = null
    
    // 清除本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('token_expire_time')
    wx.removeStorageSync('user_info')
    
    wx.showToast({
      title: '已退出登录',
      icon: 'none'
    })
    
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/auth/auth'
      })
    }, 1000)
  }
})
