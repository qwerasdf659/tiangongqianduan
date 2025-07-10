// pages/index/index.js - 项目首页
const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 系统状态
    systemReady: false,
    backendConnected: false,
    
    // 快捷功能入口
    quickActions: [
      {
        name: '🎰 抽奖',
        path: '/pages/lottery/lottery',
        description: '每日抽奖赢积分'
      },
      {
        name: '📷 拍照',
        path: '/pages/camera/camera', 
        description: '上传照片获积分'
      },
      {
        name: '🎁 兑换',
        path: '/pages/exchange/exchange',
        description: '积分兑换好礼'
      },
      {
        name: '👤 我的',
        path: '/pages/user/user',
        description: '个人中心'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('🏠 首页加载')
    // 🔧 修复：初始化登录提示标记
    this.loginPromptShown = false
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🏠 首页显示')
    
    // 🔧 新增：检查是否从登录相关页面返回
    const pages = getCurrentPages()
    const prevPage = pages.length > 1 ? pages[pages.length - 2] : null
    const isFromAuthPage = prevPage && (prevPage.route.includes('auth') || prevPage.route.includes('login'))
    
    if (isFromAuthPage) {
      console.log('🔄 从登录页面返回，重置登录提示标记')
      // 从登录页面返回时，重置标记，允许重新检查
      this.loginPromptShown = false
    }
    
    this.checkUserStatus()
    
    // 🔧 修复：注册状态变化监听
    this.registerStatusListener()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    // 🔧 修复：移除状态变化监听
    this.unregisterStatusListener()
  },

  /**
   * 🔧 新增：注册状态变化监听
   */
  registerStatusListener() {
    if (this.statusChangeHandler) {
      return // 已经注册过
    }
    
    this.statusChangeHandler = (data) => {
      console.log('🔔 首页收到状态变化通知:', data)
      
      if (data.isLoggedIn) {
        // 用户登录成功，更新页面状态
        this.setData({
          isLoggedIn: true,
          userInfo: data.userInfo
        })
        
        // 重置登录提示标记
        this.loginPromptShown = false
        
        console.log('✅ 首页状态已更新为已登录')
      } else {
        // 用户退出登录，更新页面状态
        this.setData({
          isLoggedIn: false,
          userInfo: null
        })
        
        // 重置登录提示标记，允许再次提示
        this.loginPromptShown = false
        
        console.log('📝 首页状态已更新为未登录')
      }
    }
    
    // 通过全局事件总线监听状态变化
    if (app.statusListeners) {
      app.statusListeners.push(this.statusChangeHandler)
    } else {
      app.statusListeners = [this.statusChangeHandler]
    }
  },

  /**
   * 🔧 新增：移除状态变化监听
   */
  unregisterStatusListener() {
    if (this.statusChangeHandler && app.statusListeners) {
      const index = app.statusListeners.indexOf(this.statusChangeHandler)
      if (index > -1) {
        app.statusListeners.splice(index, 1)
      }
      this.statusChangeHandler = null
    }
  },

  /**
   * 初始化页面
   */
  initPage() {
    // 检查系统状态
    this.checkSystemStatus()
    
    // 检查用户登录状态
    this.checkUserStatus()
  },

  /**
   * 检查系统状态
   */
  checkSystemStatus() {
    const systemReady = !!app.globalData.baseUrl
    const backendConnected = systemReady // 简单检查
    
    this.setData({
      systemReady,
      backendConnected
    })
  },

  /**
   * 检查用户登录状态
   */
  checkUserStatus() {
    // 🔧 修复：增加状态检查的可靠性
    const isLoggedIn = app.globalData.isLoggedIn
    const userInfo = app.globalData.userInfo
    const accessToken = app.globalData.accessToken
    
    console.log('🔍 首页检查登录状态:', { 
      isLoggedIn, 
      hasUserInfo: !!userInfo, 
      hasToken: !!accessToken 
    })
    
    // 🔧 修复：综合判断登录状态，避免误判
    const actuallyLoggedIn = isLoggedIn && userInfo && accessToken
    
    this.setData({
      isLoggedIn: actuallyLoggedIn,
      userInfo: userInfo || null
    })
    
    // 🔧 修复：立即检查登录状态，与页面加载同步
    if (!actuallyLoggedIn && !this.loginPromptShown) {
      this.loginPromptShown = true // 标记已显示过提示
      
      // 🔧 新增：检查当前页面路径，避免在登录相关页面弹出提示
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentRoute = currentPage ? currentPage.route : ''
      
      // 如果当前在登录、注册相关页面，则不弹出提示框
      if (currentRoute.includes('auth') || currentRoute.includes('login')) {
        console.log('🚫 当前在登录页面，跳过登录提示框')
        return
      }
      
      // �� 修复：立即显示登录提示框，不再延迟
      console.log('📋 立即显示登录提示框')
      wx.showModal({
        title: '登录提示',
        content: '请先登录以享受完整功能',
        confirmText: '去登录',
        cancelText: '稍后',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          }
        }
      })
    } else if (actuallyLoggedIn) {
      // 🔧 修复：已登录时重置提示标记
      this.loginPromptShown = false
      console.log('✅ 用户已登录，首页状态正常')
    }
  },

  /**
   * 快捷功能点击
   */
  onQuickActionTap(e) {
    const action = e.currentTarget.dataset.action
    console.log('点击快捷功能:', action)
    
    // 检查是否需要登录
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '请先登录后使用此功能',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          }
        }
      })
      return
    }
    
    // 跳转到对应页面
    if (action.path) {
      wx.navigateTo({
        url: action.path,
        fail: (error) => {
          console.error('页面跳转失败:', error)
          wx.showToast({
            title: '跳转失败',
            icon: 'none'
          })
        }
      })
    }
  },

  /**
   * 登录按钮点击
   */
  navigateToLogin() {
    // 🔧 新增：用户主动点击登录时，设置标记避免重复弹框
    this.loginPromptShown = true
    console.log('👆 用户主动点击登录按钮，跳转到登录页面')
    
    wx.navigateTo({
      url: '/pages/auth/auth',
      success: () => {
        console.log('✅ 成功跳转到登录页面')
      },
      fail: (error) => {
        console.error('❌ 跳转登录页面失败:', error)
        // 跳转失败时重置标记
        this.loginPromptShown = false
        wx.showToast({
          title: '跳转失败，请重试',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 拍照赢积分',
      path: '/pages/index/index'
    }
  }
}) 