// pages/auth/auth.js - 认证页面逻辑（基于产品功能结构文档v2.1.3优化）
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
    
    // 🔐 管理员登录相关 - 根据产品文档要求实现
    showAdminLogin: false,
    titleTapCount: 0,
    titleTapTimer: null,
    adminTapThreshold: 5, // 需要连续点击5次
    adminTapTimeout: 2000, // 2秒内有效
    adminForm: {
      username: '',
      password: '',
      rememberLogin: false,
      skipSms: true // 🚧 开发阶段：跳过短信二次验证
    },
    adminFormErrors: {},
    showAdminPassword: false,
    adminSubmitting: false,
    adminLoginFailCount: 0,
    adminLockUntil: null,
    
    // 🚧 开发阶段标识 - v2.1.3配置
    isDevelopmentMode: true, // 开发模式标识
    skipSmsVerification: true, // 开发阶段跳过短信验证
    
    // 🔴 v2.1.3新增：增强错误处理
    lastErrorTime: null,
    errorRetryCount: 0,
    maxErrorRetryCount: 3,
    
    // 🔴 v2.1.3新增：WebSocket状态监听
    webSocketConnected: false,
    webSocketRetryCount: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('🔧 认证页面开始加载 - v2.1.3')
    
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
      
      // 🔧 修复：设置页面配置
      this.setData({
        isDevelopmentMode: envConfig.isDev || true,
        skipSmsVerification: envConfig.developmentMode?.skipSmsVerification || true,
        adminTapThreshold: envConfig.developmentMode?.adminHiddenTrigger || 5,
        adminTapTimeout: envConfig.developmentMode?.adminTriggerTimeout || 2000
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

      console.log('✅ 认证页面初始化完成 - v2.1.3')

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
    console.log('🔧 认证页面渲染完成 - v2.1.3')
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🔧 认证页面显示 - v2.1.3')
    
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
    console.log('🔧 认证页面隐藏 - v2.1.3')
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
    console.log('🔧 认证页面卸载 - v2.1.3')
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
   * 提交登录
   */
  onSubmitLogin() {
    // 🔧 修复：防止重复提交
    if (this.data.logging || this.data.submitting) {
      console.log('⚠️ 正在登录中，忽略重复提交')
      return
    }

    // 🔧 修复：添加详细的前端数据验证
    console.log('📱 提交登录 - 数据验证:', {
      phone: this.data.phone,
      code: this.data.code,
      phoneType: typeof this.data.phone,
      codeType: typeof this.data.code,
      phoneLength: this.data.phone ? this.data.phone.length : 0,
      codeLength: this.data.code ? this.data.code.length : 0,
      phoneRaw: JSON.stringify(this.data.phone),
      codeRaw: JSON.stringify(this.data.code)
    })

    // 验证表单
    if (!this.validatePhone(this.data.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    if (!this.validateCode(this.data.code)) {
      wx.showToast({
        title: '请输入验证码',
        icon: 'none'
      })
      return
    }

    // 检查用户协议
    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请同意用户协议',
        icon: 'none'
      })
      return
    }

    // 🔧 修复：设置登录状态
    this.setData({
      logging: true,
      submitting: true,
      loginCompleted: false,
      loginTimeoutTriggered: false
    })

    // 🔧 修复：设置登录超时保护
    this.loginTimeoutId = setTimeout(() => {
      if (!this.loginCompleted && !this.loginTimeoutTriggered) {
        this.loginTimeoutTriggered = true
        console.warn('⚠️ 登录请求超时，强制重置状态')
        
        this.setData({
          logging: false,
          submitting: false
        })
        
        wx.hideLoading()
        wx.showModal({
          title: '登录超时',
          content: '登录请求超时，请重试',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    }, 15000) // 15秒超时

    // 显示loading
    wx.showLoading({
      title: '登录中...',
      mask: true
    })

    // 🔧 修复：确保数据格式正确
    const formData = {
      phone: String(this.data.phone).trim(),
      code: String(this.data.code).trim()
    }

    console.log('📱 提交登录 - 最终数据:', formData)

    // 🔧 修复：带重试机制的登录
    this.performLogin(formData).then(() => {
      // 登录成功在performLogin中处理
      console.log('✅ 登录流程完成')
    }).catch((error) => {
      console.error('❌ 登录最终失败:', error)
      
      // 🔧 修复：确保清理登录状态
      if (!this.loginCompleted) {
        this.loginCompleted = true
        this.setData({
          logging: false,
          submitting: false
        })
        wx.hideLoading()
      }
    })
  },

  /**
   * 🔧 修复：执行登录（带重试机制）
   */
  performLogin(formData, retryCount = 0) {
    const maxRetries = 2
    console.log(`🔄 执行登录请求 (第${retryCount + 1}次)`)
    
    return new Promise((resolve, reject) => {
      // 🔧 修复：设置单次请求超时
      const singleRequestTimeout = setTimeout(() => {
        console.warn('⚠️ 单次登录请求超时')
        // 不在这里处理超时，让外层统一处理
      }, 10000)
      
      // 🔧 修复：正确传递参数 - 传递整个formData对象，让API方法内部处理
      this.authAPI.login(formData).then((res) => {
        clearTimeout(singleRequestTimeout)
        
        if (res.code === 0) {
          console.log('✅ 登录请求成功')
          
          // 🔧 修复：标记登录完成
          this.loginCompleted = true
          
          // 🔧 修复：清理超时定时器
          if (this.loginTimeoutId) {
            clearTimeout(this.loginTimeoutId)
            this.loginTimeoutId = null
          }
          
          // 处理登录成功
          this.handleLoginSuccess(res.data)
          resolve(res.data)
        } else {
          console.warn('⚠️ 登录请求失败:', res.msg)
          throw new Error(res.msg || '登录失败')
        }
      }).catch((error) => {
        clearTimeout(singleRequestTimeout)
        console.error(`❌ 登录请求失败 (第${retryCount + 1}次):`, error)
        
        // 🔧 修复：智能重试逻辑
        if (retryCount < maxRetries && this.shouldRetryLogin(error)) {
          console.log(`🔄 准备重试登录 (${retryCount + 1}/${maxRetries})`)
          
          // 🔧 修复：递增延迟重试
          setTimeout(() => {
            this.performLogin(formData, retryCount + 1).then(resolve).catch(reject)
          }, (retryCount + 1) * 1000)
        } else {
          // 🔧 修复：重试次数用完或不需要重试
          console.error('❌ 登录彻底失败，停止重试')
          
          // 🔧 修复：标记登录完成
          this.loginCompleted = true
          
          // 🔧 修复：清理超时定时器
          if (this.loginTimeoutId) {
            clearTimeout(this.loginTimeoutId)
            this.loginTimeoutId = null
          }
          
          // 处理登录失败
          this.handleLoginFailure(error)
          reject(error)
        }
      })
    })
  },

  /**
   * 处理登录成功
   */
  handleLoginSuccess(loginData) {
    console.log('✅ 处理登录成功:', loginData)
    
    // 🔧 修复：设置登录状态
    this.setData({
      logging: false,
      submitting: false
    })
    
    wx.hideLoading()
    
    // 🔧 修复：先调用全局登录成功处理，等待数据设置完成
    try {
      app.onLoginSuccess(loginData)
      
      // 🔧 修复：验证必要数据是否设置成功
      const hasValidToken = app.globalData.accessToken && app.globalData.accessToken !== 'undefined'
      const hasValidUserInfo = app.globalData.userInfo && typeof app.globalData.userInfo === 'object' && Object.keys(app.globalData.userInfo).length > 0
      
      console.log('🔧 登录数据验证结果:', {
        hasValidToken,
        hasValidUserInfo,
        tokenPreview: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : 'undefined',
        userInfo: app.globalData.userInfo,
        userInfoKeys: app.globalData.userInfo ? Object.keys(app.globalData.userInfo) : []
      })
      
      // 🔧 修复：只要有有效token就允许跳转，用户信息可以后续获取
      if (hasValidToken) {
        console.log('✅ 检测到有效token，准备跳转')
        
        if (hasValidUserInfo) {
          wx.showToast({
            title: '登录成功！',
            icon: 'success',
            duration: 1000
          })
          
          setTimeout(() => {
            this.performPageRedirect()
          }, 1000)
        } else {
          console.warn('⚠️ 用户信息缺失，但token有效，直接跳转')
          
          wx.showToast({
            title: '登录成功！正在加载...',
            icon: 'loading',
            duration: 1000
          })
          
          setTimeout(() => {
            this.performPageRedirect()
          }, 1000)
        }
      } else {
        console.error('❌ 没有有效的访问令牌，无法跳转')
        
        wx.showModal({
          title: '登录异常',
          content: '登录过程中未获取到有效的访问令牌，请重新登录',
          showCancel: false,
          confirmText: '重新登录',
          success: () => {
            this.setData({
              phone: '',
              code: '',
              logging: false,
              submitting: false
            })
          }
        })
      }
      
    } catch (error) {
      console.error('❌ 登录成功处理出错:', error)
      
      // 🔧 修复：处理失败时的降级处理
      wx.showModal({
        title: '登录异常',
        content: '登录过程中出现异常，请重新登录',
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          this.setData({
            phone: '',
            code: '',
            logging: false,
            submitting: false
          })
        }
      })
    }
    
    // 🔧 修复：添加备用强制跳转机制，确保登录成功一定能跳转
    setTimeout(() => {
      if (app.globalData.isLoggedIn && app.globalData.accessToken && app.globalData.accessToken !== 'undefined') {
        console.log('🔧 备用跳转机制触发 - 强制跳转到抽奖页面')
        
        wx.reLaunch({
          url: '/pages/lottery/lottery'
        })
      }
    }, 3000) // 3秒后强制检查并跳转
  },

  /**
   * 🔧 修复：执行页面跳转
   */
  performPageRedirect() {
    console.log('🔧 执行页面跳转')
    
    // 🔧 修复：只验证最关键的登录状态和token
    const hasValidLogin = app.globalData.isLoggedIn && app.globalData.accessToken && app.globalData.accessToken !== 'undefined'
    
    console.log('🔧 跳转前最终验证:', {
      isLoggedIn: app.globalData.isLoggedIn,
      hasToken: !!app.globalData.accessToken,
      tokenPreview: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : 'none',
      hasValidLogin: hasValidLogin
    })
    
    if (hasValidLogin) {
      console.log('✅ 登录状态验证通过，跳转到抽奖页面')
      
      wx.reLaunch({
        url: '/pages/lottery/lottery'
      })
    } else {
      console.error('❌ 登录状态验证失败，无法跳转')
      
      wx.showModal({
        title: '登录状态异常',
        content: '登录状态验证失败，请重新登录',
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          this.setData({
            phone: '',
            code: '',
            logging: false,
            submitting: false
          })
        }
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
    
    wx.hideLoading()
    
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
   * 🔐 管理员登录：标题点击事件
   */
  onTitleTap() {
    const now = Date.now()
    
    // 🔧 修复：清理过期的点击记录
    if (this.data.titleTapTimer) {
      clearTimeout(this.data.titleTapTimer)
    }
    
    // 🔧 修复：增加点击计数
    const newTapCount = this.data.titleTapCount + 1
    this.setData({ titleTapCount: newTapCount })
    
    console.log(`🔐 管理员登录触发进度: ${newTapCount}/${this.data.adminTapThreshold}`)
    
    // 🔧 修复：检查是否达到触发条件
    if (newTapCount >= this.data.adminTapThreshold) {
      console.log('🔐 管理员登录触发成功')
      this.showAdminLoginEntry()
      this.setData({ titleTapCount: 0 })
      return
    }
    
    // 🔧 修复：设置重置计时器
    this.data.titleTapTimer = setTimeout(() => {
      this.setData({ titleTapCount: 0 })
      console.log('🔐 管理员登录触发超时，重置计数')
    }, this.data.adminTapTimeout)
  },

  /**
   * 🔐 显示管理员登录入口
   */
  showAdminLoginEntry() {
    this.setData({
      showAdminLogin: true,
      adminForm: {
        username: '',
        password: '',
        rememberLogin: false,
        skipSms: true // 🚧 开发阶段默认跳过短信验证
      },
      adminFormErrors: {}
    })
    
    wx.showToast({
      title: '🔐 管理员登录已激活',
      icon: 'success',
      duration: 2000
    })
  },

  /**
   * 🔐 关闭管理员登录
   */
  onCloseAdminLogin() {
    this.setData({
      showAdminLogin: false,
      adminSubmitting: false,
      adminForm: {
        username: '',
        password: '',
        rememberLogin: false,
        skipSms: true
      },
      adminFormErrors: {}
    })
  },

  /**
   * 🔐 管理员用户名输入
   */
  onAdminUsernameInput(e) {
    this.setData({
      'adminForm.username': e.detail.value
    })
  },

  /**
   * 🔐 管理员密码输入
   */
  onAdminPasswordInput(e) {
    this.setData({
      'adminForm.password': e.detail.value
    })
  },

  /**
   * 🔐 切换管理员密码显示
   */
  onToggleAdminPassword() {
    this.setData({
      showAdminPassword: !this.data.showAdminPassword
    })
  },

  /**
   * 🔐 管理员记住登录状态
   */
  onAdminRememberChange(e) {
    this.setData({
      'adminForm.rememberLogin': e.detail.value
    })
  },

  /**
   * 🔐 检查管理员是否被锁定
   */
  isAdminLocked() {
    if (this.data.adminLockUntil) {
      const now = Date.now()
      if (now < this.data.adminLockUntil) {
        const remainingTime = Math.ceil((this.data.adminLockUntil - now) / 1000)
        return remainingTime
      } else {
        // 🔧 修复：解锁
        this.setData({
          adminLockUntil: null,
          adminLoginFailCount: 0
        })
      }
    }
    return 0
  },

  /**
   * 🔐 管理员登录
   */
  onAdminLogin() {
    // 🔧 修复：检查是否被锁定
    const lockTime = this.isAdminLocked()
    if (lockTime > 0) {
      wx.showModal({
        title: '账户已锁定',
        content: `连续登录失败过多，请${lockTime}秒后再试`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    // 🔧 修复：防止重复提交
    if (this.data.adminSubmitting) {
      return
    }
    
    // 🔧 修复：验证表单
    if (!this.data.adminForm.username || !this.data.adminForm.password) {
      wx.showToast({
        title: '请输入用户名和密码',
        icon: 'none'
      })
      return
    }
    
    this.setData({ adminSubmitting: true })
    
    wx.showLoading({
      title: '管理员登录中...',
      mask: true
    })
    
    // 🔧 修复：调用管理员登录API
    const adminLoginData = {
      username: this.data.adminForm.username,
      password: this.data.adminForm.password,
      skipSms: this.data.adminForm.skipSms
    }
    
    this.authAPI.adminLogin(adminLoginData).then((res) => {
      if (res.code === 0) {
        console.log('✅ 管理员登录成功')
        
        // 🔧 修复：重置失败计数
        this.setData({
          adminLoginFailCount: 0,
          adminLockUntil: null
        })
        
        // 🔧 修复：处理登录成功
        this.handleLoginSuccess(res.data)
      } else {
        throw new Error(res.msg || '管理员登录失败')
      }
    }).catch((error) => {
      console.error('❌ 管理员登录失败:', error)
      
      // 🔧 修复：增加失败计数
      const failCount = this.data.adminLoginFailCount + 1
      this.setData({ adminLoginFailCount: failCount })
      
      // 🔧 修复：检查是否需要锁定
      if (failCount >= 5) {
        const lockUntil = Date.now() + 15 * 60 * 1000 // 锁定15分钟
        this.setData({ adminLockUntil: lockUntil })
      }
      
      // 🔧 修复：显示错误信息
      let errorMessage = '管理员登录失败'
      if (error.isBackendError) {
        errorMessage = '🚨 后端服务异常：' + error.message
      } else if (error.isNetworkError) {
        errorMessage = '🌐 网络连接异常，请检查网络'
      } else if (error.message) {
        errorMessage = error.message
      }
      
      wx.showModal({
        title: '管理员登录失败',
        content: errorMessage,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      this.setData({ adminSubmitting: false })
      wx.hideLoading()
    })
  }
})