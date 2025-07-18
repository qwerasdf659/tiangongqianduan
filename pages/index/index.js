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
    
    // 🔴 编译后启动优化：延迟初始化，避免立即产生大量检查
    setTimeout(() => {
      this.initPage()
    }, 500)
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
    
    // 🔴 优化：延迟检查用户状态，避免编译后立即检查
    setTimeout(() => {
      this.checkUserStatus()
    }, 800)
    
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
   * 检查用户登录状态（优化版）
   * 🔴 新增：支持自动跳转到抽奖页面
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
    
    // 🔴 新增：已登录用户自动跳转到抽奖页面（响应用户需求）
    if (actuallyLoggedIn) {
      // 🔧 修复：已登录时重置提示标记
      this.loginPromptShown = false
      console.log('✅ 用户已登录，准备自动跳转到抽奖页面')
      
      // 🔴 关键：自动跳转到抽奖页面
      this.autoRedirectToLotteryFromIndex()
      
      return // 已登录用户直接返回，不执行后续的登录提示逻辑
    }
    
    // 🔴 编译后优化：减少登录提示频率 - 只对未登录用户执行
    if (!actuallyLoggedIn && !this.loginPromptShown) {
      
      // 🔧 新增：检查当前页面路径，避免在登录相关页面弹出提示
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentRoute = currentPage ? currentPage.route : ''
      
      // 如果当前在登录、注册相关页面，则不弹出提示框
      if (currentRoute.includes('auth') || currentRoute.includes('login')) {
        console.log('🚫 当前在登录页面，跳过登录提示框')
        return
      }
      
      // 🔴 编译后优化：延迟显示登录提示，避免与页面加载冲突
      setTimeout(() => {
        // 再次检查状态，避免延迟期间状态变化
        if (!app.globalData.isLoggedIn && !this.loginPromptShown) {
          this.loginPromptShown = true
          
          console.log('📋 显示登录提示框')
          wx.showModal({
            title: '欢迎使用',
            content: '请先登录以享受完整功能\n\n🎰 抽奖赢积分\n📸 拍照获奖励\n🎁 积分换好礼',
            confirmText: '立即登录',
            cancelText: '稍后',
            confirmColor: '#FF6B35',
            success: (res) => {
              if (res.confirm) {
                wx.navigateTo({
                  url: '/pages/auth/auth'
                })
              }
            }
          })
        }
      }, 1500) // 延迟1.5秒显示，确保页面加载完成
    }
  },

  /**
   * 🔴 新增：从首页自动跳转到抽奖页面（响应用户需求）
   */
  autoRedirectToLotteryFromIndex() {
    console.log('🎰 首页检测到登录状态，准备自动跳转到抽奖页面')
    
    try {
      // 检查当前页面是否确实是首页
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentRoute = currentPage ? currentPage.route : ''
      
      if (currentRoute !== 'pages/index/index') {
        console.log('📍 当前页面不是首页，跳过自动跳转')
        return
      }
      
      console.log('🔄 从首页自动跳转到抽奖页面')
      
      // 🔴 关键：给用户一个短暂的提示，然后跳转
      wx.showToast({
        title: '检测到登录状态',
        icon: 'success',
        duration: 1000,
        mask: true
      })
      
      // 延迟跳转，让用户看到提示
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/lottery/lottery',
          success: () => {
            console.log('✅ 从首页成功自动跳转到抽奖页面')
            
            // 跳转成功后的提示
            setTimeout(() => {
              wx.showToast({
                title: '欢迎来到抽奖页面！',
                icon: 'success',
                duration: 2000
              })
            }, 500)
          },
          fail: (error) => {
            console.error('❌ 从首页跳转到抽奖页面失败:', error)
            
            // 跳转失败时尝试其他方式
            wx.switchTab({
              url: '/pages/lottery/lottery',
              success: () => {
                console.log('✅ 使用switchTab从首页跳转到抽奖页面成功')
              },
              fail: (switchError) => {
                console.error('❌ switchTab也失败:', switchError)
                
                // 最后尝试navigateTo
                wx.navigateTo({
                  url: '/pages/lottery/lottery',
                  success: () => {
                    console.log('✅ 使用navigateTo从首页跳转到抽奖页面成功')
                  },
                  fail: (navError) => {
                    console.error('❌ 首页所有跳转方式都失败:', navError)
                    
                    // 所有跳转都失败时，给用户手动选择
                    wx.showModal({
                      title: '自动跳转失败',
                      content: '检测到您已登录，但自动跳转到抽奖页面失败。\n\n是否手动前往抽奖页面？',
                      confirmText: '去抽奖',
                      cancelText: '稍后',
                      success: (res) => {
                        if (res.confirm) {
                          // 用户确认时，尝试最简单的方式
                          wx.redirectTo({
                            url: '/pages/lottery/lottery'
                          })
                        }
                      }
                    })
                  }
                })
              }
            })
          }
        })
      }, 1200) // 延迟1.2秒，让用户看到提示
      
    } catch (error) {
      console.error('❌ 从首页自动跳转到抽奖页面时出错:', error)
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