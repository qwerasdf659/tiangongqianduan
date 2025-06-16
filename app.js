// app.js - 餐厅积分抽奖系统全局配置
App({
  onLaunch() {
    console.log('餐厅积分抽奖系统启动')
    
    // 初始化日志
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)
    
    // TODO: 上线时需要替换为实际API地址
    this.globalData.baseUrl = 'https://your-backend-api.com'
    this.globalData.wsUrl = 'wss://your-websocket-server.com'
    
    // 初始化认证检查
    this.checkAuthStatus()
  },

  onShow() {
    // 每次前台时检查Token状态
    this.refreshTokenIfNeeded()
  },

  globalData: {
    // TODO: 上线时需要替换为实际服务地址
    baseUrl: 'https://your-backend-api.com',  // 后端API地址
    wsUrl: 'wss://your-websocket-server.com', // WebSocket地址
    
    // Sealos对象存储配置
    // TODO: 配置实际的Sealos存储服务
    sealosConfig: {
      endpoint: 'https://your-sealos-endpoint.com',
      bucket: 'restaurant-points-system'
    },
    
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 认证相关
    accessToken: null,
    refreshToken: null,
    tokenExpireTime: null,
    
    // 开发环境配置
    isDev: true,  // TODO: 生产环境设为false
    needAuth: false,  // TODO: 生产环境设为true，开发时跳过认证
    
    // 模拟用户数据（开发用）
    // TODO: 生产环境删除此部分
    mockUser: {
      user_id: 1001,
      phone: '138****8000',
      total_points: 1500,
      is_merchant: false
    }
  },

  // 检查认证状态
  checkAuthStatus() {
    // TODO: 生产环境恢复认证检查
    if (this.globalData.isDev) {
      console.log('开发环境，跳过认证检查')
      this.globalData.isLoggedIn = true
      this.globalData.userInfo = this.globalData.mockUser
      return
    }
    
    const token = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    
    if (token && refreshToken) {
      this.globalData.accessToken = token
      this.globalData.refreshToken = refreshToken
      this.globalData.isLoggedIn = true
      // TODO: 验证Token有效性
    } else {
      // 跳转到认证页面
      wx.navigateTo({
        url: '/pages/auth/auth'
      })
    }
  },

  // 刷新Token
  refreshTokenIfNeeded() {
    if (!this.globalData.isLoggedIn || this.globalData.isDev) return
    
    const now = Date.now()
    if (this.globalData.tokenExpireTime && now >= this.globalData.tokenExpireTime - 300000) {
      // Token将在5分钟内过期，提前刷新
      this.refreshToken()
    }
  },

  // TODO: 对接后端Token刷新接口
  refreshToken() {
    const that = this
    wx.request({
      url: this.globalData.baseUrl + '/api/auth/refresh',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + this.globalData.refreshToken
      },
      success(res) {
        if (res.data.code === 0) {
          that.globalData.accessToken = res.data.data.access_token
          that.globalData.refreshToken = res.data.data.refresh_token
          wx.setStorageSync('access_token', res.data.data.access_token)
          wx.setStorageSync('refresh_token', res.data.data.refresh_token)
        } else {
          // 刷新失败，重新登录
          that.logout()
        }
      },
      fail() {
        that.logout()
      }
    })
  },

  // 退出登录
  logout() {
    this.globalData.isLoggedIn = false
    this.globalData.accessToken = null
    this.globalData.refreshToken = null
    this.globalData.userInfo = null
    wx.clearStorageSync()
    
    wx.navigateTo({
      url: '/pages/auth/auth'
    })
  }
})
