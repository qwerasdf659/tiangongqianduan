// pages/auth/auth.js - 认证页面逻辑（权限简化版v2.2.0）
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 🔧 修复：页面加载状态
    pageLoaded: false,
    initError: null,
    showErrorDetails: false,
    
    // 表单数据
    phone: '',
    code: '',
    
    // 验证状态
    formValidator: null,
    formErrors: {},
    
    // 验证码状态
    codeDisabled: false,
    countdown: 0,
    sending: false,
    
    // 页面状态
    submitting: false,
    logging: false,
    
    // 🔧 修复：新增登录状态控制标志
    loginCompleted: false,      // 登录是否已完成（成功或失败）
    loginTimeoutTriggered: false, // 超时处理是否已触发
    
    // 用户协议
    agreementChecked: true,
    showAgreement: false,
    
    // 🔴 权限简化v2.2.0：删除管理员独立登录相关字段
    // 删除：showAdminLogin, titleTapCount, adminForm 等字段
    
    // 🚧 开发阶段标识 - v2.2.0权限简化版
    isDevelopmentMode: true, // 开发模式标识
    skipSmsVerification: true, // 开发阶段跳过短信验证
    developmentVerifyCode: '123456', // 🔴 万能验证码
    
    // 🔴 v2.2.0新增：增强错误处理
    lastErrorTime: null,
    errorRetryCount: 0,
    maxErrorRetryCount: 3,
    
    // 🔴 v2.2.0新增：WebSocket状态监听
    webSocketConnected: false,
    webSocketRetryCount: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('🔧 认证页面开始加载 - 权限简化版v2.2.0')
    
    // 🚨 立即修复：强制超时保护，防止页面永久loading
    setTimeout(() => {
      if (!this.data.pageLoaded) {
        console.warn('🚨 认证页面loading超时，强制设置为完成状态')
        this.setData({ 
          pageLoaded: true,
          initError: null
        })
      }
    }, 5000) // 5秒强制超时
    
    // 🔧 修复：使用安全的初始化方法
    try {
      this.safeInitPage()
    } catch (error) {
      console.error('❌ 页面加载异常:', error)
      this.setData({ 
        pageLoaded: true,
        initError: '页面初始化异常：' + (error.message || error)
      })
    }
  },

  /**
   * 🔧 修复：安全的页面初始化
   */
  safeInitPage() {
    // 设置基本状态
    this.setData({
      pageLoaded: false,
      initError: null
    })

    try {
      // 🔧 修复：安全获取app实例
      const appInstance = getApp()
      if (!appInstance) {
        throw new Error('App实例未初始化')
      }

      // 🔧 修复：安全获取环境配置
      const envConfig = this.getEnvironmentConfig(appInstance)
      
      // 🔧 修复：设置页面配置（权限简化版）
      this.setData({
        isDevelopmentMode: envConfig.isDev || true,
        skipSmsVerification: envConfig.developmentMode?.skipSmsVerification || true,
        developmentVerifyCode: '123456' // 🔴 万能验证码
      })

      // 🔧 修复：初始化API引用
      this.initAPIReferences()

      // 🔧 修复：初始化表单验证器
      this.initFormValidator()

      // 🔧 修复：检查登录状态
      this.checkExistingLogin()

      // 🔧 修复：标记页面加载完成
      this.setData({
        pageLoaded: true
      })

      console.log('✅ 认证页面初始化完成 - 权限简化版v2.2.0')

    } catch (error) {
      console.error('❌ 页面初始化过程中出错:', error)
      this.handleInitError(error)
    }
  },

  /**
   * 🔧 修复：安全获取环境配置
   */
  getEnvironmentConfig(appInstance) {
    try {
      // 尝试从全局数据获取配置
      if (appInstance.globalData && appInstance.globalData.config) {
        return appInstance.globalData.config
      }

      // 尝试从全局数据获取基本配置
      if (appInstance.globalData) {
        return {
          isDev: appInstance.globalData.isDev || true,
          developmentMode: appInstance.globalData.developmentMode || {}
        }
      }

      // 返回默认配置
      return {
        isDev: true,
        developmentMode: {
          skipSmsVerification: true,
          adminHiddenTrigger: 5,
          adminTriggerTimeout: 2000
        }
      }
    } catch (error) {
      console.warn('⚠️ 获取环境配置失败，使用默认配置:', error)
      return {
        isDev: true,
        developmentMode: {
          skipSmsVerification: true,
          adminHiddenTrigger: 5,
          adminTriggerTimeout: 2000
        }
      }
    }
  },

  /**
   * 🔧 修复：初始化API引用
   */
  initAPIReferences() {
    try {
      const apiModule = require('../../utils/api')
      this.authAPI = apiModule.authAPI
      console.log('✅ API引用初始化成功')
    } catch (error) {
      console.error('❌ API引用初始化失败:', error)
      // 设置空的API对象防止调用错误
      this.authAPI = {
        sendCode: () => Promise.reject(new Error('API未初始化')),
        login: () => Promise.reject(new Error('API未初始化'))
      }
      throw new Error('API模块加载失败: ' + error.message)
    }
  },

  /**
   * 🔧 修复：初始化表单验证器
   */
  initFormValidator() {
    try {
      const { FormValidator, commonRules } = require('../../utils/validate')
      
      const validator = new FormValidator()
      validator.addRule('phone', commonRules.required)
      validator.addRule('phone', commonRules.phone)
      validator.addRule('code', commonRules.required)
      validator.addRule('code', commonRules.code)
      
      this.data.formValidator = validator
      console.log('✅ 表单验证器初始化成功')
    } catch (error) {
      console.warn('⚠️ 表单验证器初始化失败，使用简单验证:', error)
      // 设置简单的验证器
      this.data.formValidator = {
        validate: () => ({ isValid: true, errors: {} })
      }
    }
  },

  /**
   * 🔧 修复：检查现有登录状态
   */
  checkExistingLogin() {
    try {
      const appInstance = getApp()
      if (appInstance.globalData && appInstance.globalData.isLoggedIn && !appInstance.globalData.isDev) {
        console.log('✅ 检测到已登录状态，准备跳转')
        wx.redirectTo({
          url: '/pages/lottery/lottery'
        })
      }
    } catch (error) {
      console.warn('⚠️ 登录状态检查失败:', error)
      // 忽略错误，继续显示登录页面
    }
  },

  /**
   * 🔧 修复：处理初始化错误
   */
  handleInitError(error) {
    console.error('❌ 处理初始化错误:', error)
    
    this.setData({
      pageLoaded: true,  // 仍然显示页面
      initError: error.message || '页面初始化失败',
      showErrorDetails: false
    })

    // 显示用户友好的错误提示
    wx.showModal({
      title: '页面加载异常',
      content: '登录页面初始化遇到问题，但仍可正常使用基本功能。\n\n如果问题持续，请重启小程序。',
      showCancel: true,
      cancelText: '查看详情',
      confirmText: '知道了',
      success: (res) => {
        if (res.cancel) {
          this.setData({
            showErrorDetails: true
          })
        }
      }
    })
  },

  /**
   * 🔧 修复：切换错误详情显示
   */
  toggleErrorDetails() {
    this.setData({
      showErrorDetails: !this.data.showErrorDetails
    })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    console.log('🔧 认证页面渲染完成 - 权限简化版v2.2.0')
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🔧 认证页面显示 - 权限简化版v2.2.0')
    
    // 🔧 修复：只在没有正在进行的登录请求时重置状态
    if (!this.data.logging) {
      this.setData({
        logging: false,
        submitting: false,
        loginCompleted: false,
        loginTimeoutTriggered: false
      })
    } else {
      // 如果有正在进行的登录，保持状态但刷新loading显示
      console.log('⚠️ 有正在进行的登录请求，保持状态')
      wx.showLoading({ title: '登录中...', mask: true })
    }
    
    // 🔴 v2.1.3：设置WebSocket状态监听
    this.setupWebSocketListener()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('🔧 认证页面隐藏 - 权限简化版v2.2.0')
    this.clearCountdown()
    
    // 🔧 修复：清理登录状态标志
    this.loginCompleted = false
    this.loginTimeoutTriggered = false
    
    // 🔴 v2.1.3：清理WebSocket监听
    this.cleanupWebSocketListener()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('🔧 认证页面卸载 - 权限简化版v2.2.0')
    this.clearCountdown()
    
    // 🔧 修复：清理登录超时定时器
    if (this.loginTimeoutId) {
      clearTimeout(this.loginTimeoutId)
      this.loginTimeoutId = null
    }
    
    // 🔧 修复：清理登录状态标志
    this.loginCompleted = false
    this.loginTimeoutTriggered = false
    
    // 🔴 v2.1.3：清理WebSocket监听
    this.cleanupWebSocketListener()
  },

  /**
   * 🔴 v2.1.3新增：设置WebSocket状态监听
   */
  setupWebSocketListener() {
    // 监听WebSocket连接状态变化
    const app = getApp()
    if (app.wsManager) {
      this.setData({
        webSocketConnected: app.wsManager.connected || false
      })
    }
  },

  /**
   * 🔴 v2.1.3新增：清理WebSocket监听
   */
  cleanupWebSocketListener() {
    // 清理WebSocket相关的监听器
    this.setData({
      webSocketConnected: false,
      webSocketRetryCount: 0
    })
  },

  /**
   * 🔴 v2.1.3新增：WebSocket消息处理
   */
  onWebSocketMessage(eventName, data) {
    console.log('📨 认证页面收到WebSocket消息:', eventName, data)
    
    switch (eventName) {
      case 'userStatusChanged':
        // 用户状态变化（登录/登出）
        if (data.isLoggedIn) {
          console.log('✅ 收到用户登录成功WebSocket通知')
          // 可以在这里进行页面跳转
          wx.redirectTo({
            url: '/pages/lottery/lottery'
          })
        }
        break
      case 'connectionStatusChanged':
        // WebSocket连接状态变化
        this.setData({
          webSocketConnected: data.connected || false
        })
        break
      default:
        console.log('🔄 认证页面忽略WebSocket事件:', eventName)
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    wx.stopPullDownRefresh()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    // 可以在这里处理上拉加载更多
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖系统',
      path: '/pages/index/index'
    }
  },

  /**
   * 🔧 修复：初始化开发阶段配置
   */
  initDevelopmentConfig() {
    // 开发阶段特殊配置处理
    if (this.data.isDevelopmentMode && this.data.skipSmsVerification) {
      console.log('🚧 开发阶段：已启用短信验证跳过功能')
    }
  },

  /**
   * 手机号输入处理
   */
  onPhoneInput(e) {
    const phone = e.detail.value
    this.setData({ 
      phone: phone,
      formErrors: {
        ...this.data.formErrors,
        phone: null
      }
    })
    
    // 实时验证手机号
    if (phone.length === 11) {
      if (!this.validatePhone(phone)) {
        this.setData({
          formErrors: {
            ...this.data.formErrors,
            phone: '请输入正确的手机号'
          }
        })
      }
    }
  },

  /**
   * 验证手机号
   */
  validatePhone(phone) {
    if (!phone || phone.length !== 11) {
      return false
    }
    // 验证手机号格式（1开头，第二位是3-9，后面9位数字）
    return /^1[3-9]\d{9}$/.test(phone)
  },

  /**
   * 验证码输入处理
   */
  onCodeInput(e) {
    const code = e.detail.value
    this.setData({ 
      code: code,
      formErrors: {
        ...this.data.formErrors,
        code: null
      }
    })
    
    // 实时验证验证码
    if (code.length === 6) {
      if (!this.validateCode(code)) {
        this.setData({
          formErrors: {
            ...this.data.formErrors,
            code: '请输入6位数字验证码'
          }
        })
      }
    }
  },

  /**
   * 验证验证码
   */
  validateCode(code) {
    if (!code || code.length !== 6) {
      return false
    }
    // 验证码必须是6位数字
    return /^\d{6}$/.test(code)
  },

  /**
   * 🔧 修复：使用正确的API方法名
   */
  onSendCode() {
    // 防止重复发送
    if (this.data.sending || this.data.codeDisabled) {
      return
    }

    // 验证手机号
    if (!this.validatePhone(this.data.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    this.setData({ sending: true })

    // 🔧 修复：使用正确的API方法名
    this.authAPI.sendCode(this.data.phone).then((res) => {
      if (res.code === 0) {
        this.setData({ sending: false })
        this.startCountdown()
        
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        })
      } else {
        throw new Error(res.msg || '发送失败')
      }
    }).catch((error) => {
      this.setData({ sending: false })
      this.handleSendCodeError(error)
    })
  },

  /**
   * 🔧 修复：处理发送验证码错误
   */
  handleSendCodeError(error) {
    console.error('❌ 发送验证码失败:', error)
    
    let errorMessage = '发送验证码失败'
    
    if (error.isNetworkError) {
      errorMessage = '网络连接失败，请检查网络'
    } else if (error.code === 429) {
      errorMessage = '发送过于频繁，请稍后再试'
    } else if (error.code === 1001) {
      errorMessage = '手机号格式不正确'
    } else if (error.msg) {
      errorMessage = error.msg
    } else if (error.message) {
      errorMessage = error.message
    }
    
    wx.showModal({
      title: '发送失败',
      content: errorMessage,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff4444'
    })
  },

  /**
   * 开始倒计时
   */
  startCountdown() {
    let countdown = 60
    this.setData({ 
      codeDisabled: true,
      countdown: countdown
    })
    
    this.countdownTimer = setInterval(() => {
      countdown--
      this.setData({ countdown })
      
      if (countdown <= 0) {
        this.clearCountdown()
      }
    }, 1000)
  },

  /**
   * 清除倒计时
   */
  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    
    this.setData({
      codeDisabled: false,
      countdown: 0
    })
  },

  /**
   * 用户协议选择变化
   */
  onAgreementChange(e) {
    this.setData({
      agreementChecked: e.detail.value.length > 0
    })
  },

  /**
   * 查看用户协议
   */
  onViewAgreement() {
    this.setData({ showAgreement: true })
  },

  /**
   * 关闭用户协议
   */
  onCloseAgreement() {
    this.setData({ showAgreement: false })
  },

  /**
   * 🔴 权限简化v2.2.0：统一登录提交逻辑
   */
  onSubmitLogin() {
    console.log('🔑 开始统一登录流程 - 权限简化版v2.2.0')
    
    // 防止重复提交
    if (this.data.submitting || this.data.loginCompleted) {
      console.log('⚠️ 登录正在进行中或已完成，忽略重复提交')
      return
    }

    // 🔴 权限简化：统一验证逻辑
    const { phone, code } = this.data
    
    // 基础验证
    if (!phone) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      })
      return
    }

    if (!code) {
      wx.showToast({
        title: '请输入验证码',
        icon: 'none'
      })
      return
    }

    // 🔴 开发阶段：万能验证码验证
    if (this.data.isDevelopmentMode && code !== this.data.developmentVerifyCode) {
      wx.showToast({
        title: '开发环境请使用验证码123456',
        icon: 'none',
        duration: 2000
      })
      return
    }

    // 🔴 用户协议确认
    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请先同意用户协议',
        icon: 'none'
      })
      return
    }

    // 🔴 统一登录处理
    this.performUnifiedLogin({ phone, code })
  },

  /**
   * 🔴 权限简化v2.2.0：统一登录处理逻辑
   */
  performUnifiedLogin(formData, retryCount = 0) {
    console.log('🚀 执行统一登录请求:', { phone: formData.phone, retryCount })
    
    // 🔧 修复：引入loading管理器避免配对问题
    const { loadingManager } = require('../../utils/loading-manager')
    
    this.setData({
      submitting: true,
      logging: true
    })

    // 🔧 修复：使用安全的loading管理，避免showLoading/hideLoading配对错误
    loadingManager.show('登录中...', true)

    // 🔴 调用统一登录API
    this.authAPI.login(formData).then((res) => {
      console.log('✅ 统一登录成功:', res)
      
      // 🔴 权限简化：处理登录响应
      this.handleUnifiedLoginSuccess(res.data)
      
    }).catch((error) => {
      console.error('❌ 统一登录失败:', error)
      this.handleLoginFailure(error)
    }).finally(() => {
      // 🔧 修复：使用安全的loading管理
      loadingManager.hide()
      this.setData({
        submitting: false,
        logging: false
      })
    })
  },

  /**
   * 🔴 权限简化v2.2.0：处理统一登录成功
   */
  handleUnifiedLoginSuccess(loginData) {
    console.log('🎉 处理统一登录成功响应 - 权限简化版:', loginData)
    
    const { access_token, refresh_token, expires_in, user_info } = loginData

    if (!access_token || !user_info) {
      throw new Error('登录响应数据不完整')
    }

    // 🔴 权限简化：只检查is_admin字段
    const isAdmin = user_info.is_admin || false
    
    console.log('🔐 用户权限信息:', {
      user_id: user_info.user_id,
      mobile: user_info.mobile,
      is_admin: isAdmin,
      userType: isAdmin ? '管理员' : '普通用户'
    })

    // 🔴 保存认证信息
    try {
      // 保存到全局数据
      app.globalData.accessToken = access_token
      app.globalData.refreshToken = refresh_token
      app.globalData.userInfo = user_info
      app.globalData.isLoggedIn = true
      app.globalData.userType = isAdmin ? 'admin' : 'user' // 🔴 简化用户类型

      // 保存到本地存储
      wx.setStorageSync('access_token', access_token)
      wx.setStorageSync('refresh_token', refresh_token)
      wx.setStorageSync('user_info', user_info)
      wx.setStorageSync('login_time', Date.now())

      console.log('✅ 认证信息保存成功')

      // 🔴 权限简化：统一跳转逻辑
      this.performUnifiedRedirect(isAdmin)

    } catch (storageError) {
      console.error('❌ 保存认证信息失败:', storageError)
      wx.showToast({
        title: '登录状态保存失败',
        icon: 'none'
      })
    }
  },

  /**
   * 🔴 权限简化v2.2.0：统一页面跳转逻辑
   */
  performUnifiedRedirect(isAdmin) {
    console.log('🎯 执行统一页面跳转:', { isAdmin })
    
    this.setData({ loginCompleted: true })

    // 🔴 显示登录成功提示
    const userTypeText = isAdmin ? '管理员' : '普通用户'
    
    // 🔧 修复：使用更安全的页面跳转方式
    wx.showToast({
      title: `${userTypeText}登录成功！`,
      icon: 'success',
      duration: 1500,
      success: () => {
        // 🔧 修复：在Toast完成后再跳转，避免冲突
        setTimeout(() => {
          this.safeRedirectToLottery()
        }, 1600) // 比Toast稍长一点，确保Toast完全显示完毕
      },
      fail: () => {
        // 即使Toast失败也要跳转
        setTimeout(() => {
          this.safeRedirectToLottery()
        }, 1000)
      }
    })
  },

  /**
   * 🔧 新增：安全的页面跳转方法
   */
  safeRedirectToLottery() {
    console.log('🎯 开始安全页面跳转到抽奖页面')
    
    // 检查页面栈状态，避免重复跳转
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    
    if (currentPage && currentPage.route === 'pages/lottery/lottery') {
      console.log('⚠️ 已在抽奖页面，跳过跳转')
      return
    }
    
    // 🔧 增强：多重保障的页面跳转
    try {
      wx.redirectTo({
        url: '/pages/lottery/lottery',
        success: () => {
          console.log('✅ 页面跳转成功')
        },
        fail: (error) => {
          console.error('❌ redirectTo失败，尝试使用reLaunch:', error)
          
          // 🔧 备用方案：使用reLaunch
          wx.reLaunch({
            url: '/pages/lottery/lottery',
            success: () => {
              console.log('✅ 备用跳转成功（reLaunch）')
            },
            fail: (reLaunchError) => {
              console.error('❌ 所有跳转方式都失败:', reLaunchError)
              
              // 🔧 最后手段：显示手动导航提示
              wx.showModal({
                title: '页面跳转异常',
                content: '登录成功，但页面跳转遇到问题。请手动点击底部"🎰抽奖"标签进入抽奖页面。',
                showCancel: false,
                confirmText: '知道了',
                confirmColor: '#ff4444'
              })
            }
          })
        }
      })
    } catch (jumpError) {
      console.error('❌ 页面跳转代码执行异常:', jumpError)
      wx.showModal({
        title: '页面跳转异常',
        content: '登录成功，但页面跳转功能异常。请重启小程序或手动导航到抽奖页面。',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  /**
   * 🔧 修复：处理登录失败
   */
  handleLoginFailure(error) {
    console.error('❌ 处理登录失败:', error)
    
    // 🔧 修复：重置登录状态
    this.setData({
      logging: false,
      submitting: false
    })
    
    // 🔧 修复：移除重复的hideLoading调用，因为在finally块中已经调用
    // wx.hideLoading() // 已在 performUnifiedLogin 的 finally 块中处理
    
    // 🔧 修复：显示错误信息
    let errorMessage = '登录失败，请重试'
    
    // 🔴 v2.1.3：增强错误处理
    if (error.isBackendError) {
      errorMessage = '🚨 后端服务异常：' + (error.msg || error.message)
    } else if (error.isNetworkError) {
      errorMessage = '🌐 网络连接异常，请检查网络'
    } else if (error.code === 1001) {
      // 🔧 修复：专门处理1001错误码（手机号格式不正确）
      errorMessage = '手机号格式不正确，请检查输入'
      console.error('🚨 1001错误 - 手机号格式问题:', {
        inputPhone: this.data.phone,
        phoneType: typeof this.data.phone,
        phoneLength: this.data.phone ? this.data.phone.length : 0,
        phoneValid: /^1[3-9]\d{9}$/.test(this.data.phone),
        error: error
      })
    } else if (error.code === 2001) {
      errorMessage = '请提供有效的访问令牌'
    } else if (error.code === 401) {
      errorMessage = '验证码错误或已过期'
    } else if (error.code === 429) {
      errorMessage = '请求过于频繁，请稍后再试'
    } else if (error.msg) {
      errorMessage = error.msg
    } else if (error.message) {
      errorMessage = error.message
    }
    
    wx.showModal({
      title: '登录失败',
      content: errorMessage,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff4444'
    })
  },

  /**
   * 🔧 修复：判断是否应该重试登录
   */
  shouldRetryLogin(error) {
    // 🔧 修复：网络错误可以重试
    if (this.isNetworkError(error)) {
      return true
    }
    
    // 🔧 修复：服务器5xx错误可以重试
    if (error.code >= 500 && error.code < 600) {
      return true
    }
    
    // 🔧 修复：特定错误码可以重试
    const retryableCodes = [-1, -2, -3, 0, 'NETWORK_ERROR', 'TIMEOUT']
    if (retryableCodes.includes(error.code)) {
      return true
    }
    
    // 🔧 修复：包含网络相关关键词的错误可以重试
    if (error.message) {
      const networkKeywords = ['timeout', '超时', 'network', '网络', 'connection', '连接']
      const hasNetworkKeyword = networkKeywords.some(keyword => 
        error.message.toLowerCase().includes(keyword.toLowerCase())
      )
      if (hasNetworkKeyword) {
        return true
      }
    }
    
    // 🔧 修复：其他错误不重试
    return false
  },

  /**
   * 🔧 修复：判断是否为网络错误
   */
  isNetworkError(error) {
    // 🔧 修复：检查错误标记
    if (error.isNetworkError === true) {
      return true
    }
    
    // 🔧 修复：检查错误码
    const networkErrorCodes = [-1, -2, -3, 0, 'NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_FAILED']
    if (networkErrorCodes.includes(error.code)) {
      return true
    }
    
    // 🔧 修复：检查错误信息
    if (error.message) {
      const networkKeywords = ['timeout', '超时', 'network', '网络', 'connection', '连接', 'failed', '失败']
      return networkKeywords.some(keyword => 
        error.message.toLowerCase().includes(keyword.toLowerCase())
      )
    }
    
    return false
  },

  /**
   * 🚧 跳过登录（开发模式）
   */
  onSkipLogin() {
    // 🚨 严禁跳过登录 - 必须使用真实后端认证
    if (!app.globalData.isDev) {
      wx.showToast({
        title: '当前环境不支持跳过登录',
        icon: 'none'
      })
      return
    }
    
    // 🔴 删除违规代码：严禁使用Mock用户数据
    wx.showModal({
      title: '开发模式提示',
      content: '当前为开发模式，但根据项目安全规则，必须使用真实后端认证数据。\n\n请使用手机号码登录功能（支持123456万能验证码）。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 权限简化v2.2.0：删除管理员独立登录相关方法
   */
  // 删除以下方法：
  // onTitleTap(), showAdminLoginEntry(), onCloseAdminLogin()
  // onAdminUsernameInput(), onAdminPasswordInput(), onToggleAdminPassword()
  // onAdminRememberChange(), isAdminLocked(), onAdminLogin()
})