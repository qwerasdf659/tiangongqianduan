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
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🏠 首页显示')
    this.checkUserStatus()
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
    const isLoggedIn = app.globalData.isLoggedIn
    const userInfo = app.globalData.userInfo
    
    this.setData({
      isLoggedIn,
      userInfo
    })
    
    // 如果未登录，引导用户登录
    if (!isLoggedIn) {
      setTimeout(() => {
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
      }, 1000)
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
    wx.navigateTo({
      url: '/pages/auth/auth'
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