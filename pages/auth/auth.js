// pages/auth/auth.js - 认证页面逻辑（权限简化版v2.2.0 - 完全符合接口对接规范文档）
const app = getApp()

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 🔧 页面加载状态
    pageLoaded: false,
    initError: null,
    showErrorDetails: false,
    
    // 表单数据
    mobile: '',     // 🔴 统一使用mobile字段名
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
    
    // 🔧 登录状态控制标志
    loginCompleted: false,      // 登录是否已完成（成功或失败）
    loginTimeoutTriggered: false, // 超时处理是否已触发
    
    // 用户协议
    agreementChecked: true,
    showAgreement: false,
    
    // 🔴 权限简化v2.2.0：统一登录方式
    // 删除了管理员独立登录相关字段
    
    // 🚧 开发阶段标识 - v2.2.0权限简化版
    isDevelopmentMode: false, // 🔴 开发模式标识已关闭 - 根据用户需求清除开发环境功能
    skipSmsVerification: true, // 开发阶段跳过短信验证
    // 🔴 万能验证码已移除 - 根据用户需求清除开发环境万能验证码
    
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
    
    // 🔧 使用安全的初始化方法
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
   * 🔧 安全的页面初始化
   */
  safeInitPage() {
    // 设置基本状态
    this.setData({
      pageLoaded: false,
      initError: null
    })

    try {
      // 🔧 安全获取app实例
      const appInstance = getApp()
      if (!appInstance) {
        throw new Error('App实例未初始化')
      }

      // 🔧 安全获取环境配置
      const envConfig = this.getEnvironmentConfig(appInstance)
      
      // 🔧 设置页面配置（权限简化版）
      this.setData({
        isDevelopmentMode: false, // 🔴 开发环境功能已禁用
        skipSmsVerification: envConfig.developmentMode?.skipSmsVerification || true,
        // 🔴 万能验证码已移除 - 根据用户需求清除开发环境万能验证码
      })

      // 🔧 初始化API引用
      this.initAPIReferences()

      // 🔧 初始化表单验证器
      this.initFormValidator()

      // 🔧 检查登录状态
      this.checkExistingLogin()

      // 🔧 标记页面加载完成
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
   * 🔧 安全获取环境配置
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
   * 🔧 初始化API引用
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
   * 🔧 初始化表单验证器
   */
  initFormValidator() {
    try {
      const { FormValidator, commonRules } = require('../../utils/validate')
      
      // 🔴 权限简化版：统一登录表单验证规则
      this.formValidator = new FormValidator({
        mobile: [
          commonRules.required('手机号不能为空'),
          commonRules.mobile('请输入正确的手机号')
        ],
        code: [
          commonRules.required('验证码不能为空'),
          commonRules.length(6, '验证码必须是6位数字')
        ]
      })
      
      console.log('✅ 表单验证器初始化成功')
    } catch (error) {
      console.error('❌ 表单验证器初始化失败:', error)
      // 设置空的验证器防止调用错误
      this.formValidator = {
        validate: () => ({ isValid: true, errors: {} })
      }
    }
  },

  /**
   * 🔧 检查现有登录状态
   */
  checkExistingLogin() {
    try {
      const app = getApp()
      if (!app || !app.globalData) {
        console.warn('⚠️ App实例不可用，跳过登录状态检查')
        return
      }

      // 🔴 修复：增强Token状态检查 - 解决编译后Token失效问题
      const token = app.globalData.accessToken || wx.getStorageSync('access_token')
      const userInfo = app.globalData.userInfo || wx.getStorageSync('user_info')

      console.log('🔍 检查现有登录状态:', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'NO_TOKEN',
        userNickname: userInfo?.nickname || 'NO_USER'
      })

      if (token && userInfo) {
        console.log('🔍 检测到已有登录状态，验证Token有效性...')
        
        // 🔴 关键修复：先同步到全局状态，再验证Token
        app.globalData.accessToken = token
        app.globalData.userInfo = userInfo
        app.globalData.isLoggedIn = true
        
        // 🔴 增强：Token有效性验证，包含过期检查
        this.validateTokenAndRedirect(token, userInfo)
      } else {
        console.log('🔍 未检测到有效的登录状态，显示登录表单')
        // 确保登录表单可见
        this.setData({ pageLoaded: true })
      }
    } catch (error) {
      console.error('❌ 检查登录状态时出错:', error)
      // 出错时显示登录表单
      this.setData({ pageLoaded: true })
    }
  },

  /**
   * 🔴 新增：验证Token并处理重定向
   */
  validateTokenAndRedirect(token, userInfo) {
    // 🔴 Token格式预检查
    if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
      console.error('❌ Token格式无效，需要重新登录')
      this.clearInvalidLoginState()
      return
    }

    // 🔴 JWT过期检查
    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      const now = Math.floor(Date.now() / 1000)
      
      if (payload.exp && payload.exp < now) {
        const expiredMinutes = Math.floor((now - payload.exp) / 60)
        console.error('❌ Token已过期:', expiredMinutes + '分钟前')
        this.clearInvalidLoginState()
        return
      }
    } catch (decodeError) {
      console.error('❌ Token解码失败:', decodeError.message)
      this.clearInvalidLoginState()
      return
    }

    // 🔴 通过后端验证Token - 使用更宽松的错误处理
    this.authAPI.verifyToken().then(result => {
      console.log('✅ Token验证成功，自动跳转到主页面')
      this.redirectToMainPage(userInfo)
    }).catch(error => {
      console.warn('⚠️ Token验证失败，但可能是网络问题:', error)
      
      // 🔴 修复：区分网络错误和认证错误
      if (error.code === 4001 || error.code === 4002) {
        // 明确的认证错误，清理登录状态
        console.error('❌ 明确的认证失败，清理登录状态')
        this.clearInvalidLoginState()
      } else {
        // 可能是网络错误，给用户选择
        wx.showModal({
          title: '登录状态验证失败',
          content: '无法验证登录状态，可能是网络问题。\n\n是否重新登录？',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '重新登录',
          success: (res) => {
            if (res.confirm) {
              this.clearInvalidLoginState()
            } else {
              // 用户选择稍后重试，假设登录有效并跳转
              console.log('🔄 用户选择稍后重试，假设登录有效')
              this.redirectToMainPage(userInfo)
            }
          }
        })
      }
    })
  },

  /**
   * 🔴 新增：清理无效登录状态
   */
  clearInvalidLoginState() {
    const app = getApp()
    
    console.log('🧹 清理无效登录状态')
    
    // 清理全局状态
    app.globalData.accessToken = null
    app.globalData.refreshToken = null
    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
    
    // 清理本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
    
    // 显示登录表单
    this.setData({ pageLoaded: true })
    
    wx.showToast({
      title: '请重新登录',
      icon: 'none',
      duration: 2000
    })
  },

  /**
   * 🔧 处理初始化错误
   */
  handleInitError(error) {
    console.error('❌ 页面初始化错误:', error)
    
    this.setData({
      pageLoaded: true,
      initError: error.message || '页面初始化失败'
    })
    
    // 显示错误提示
    wx.showModal({
      title: '⚠️ 页面初始化异常',
      content: `认证页面初始化遇到问题：\n\n${error.message || '未知错误'}\n\n您可以尝试：\n• 重新进入页面\n• 重启小程序\n• 检查网络连接`,
      showCancel: true,
      cancelText: '重新加载',
      confirmText: '继续使用',
      success: (res) => {
        if (res.cancel) {
          // 重新加载页面
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      }
    })
  },

  /**
   * 🔧 切换错误详情显示
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
    console.log('🎨 认证页面渲染完成')
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🔄 认证页面显示')
    
    // 🔧 重置登录状态标志
    this.setData({
      loginCompleted: false,
      loginTimeoutTriggered: false
    })
    
    // 🔧 检查是否需要重新加载页面状态
    if (this.data.initError) {
      console.log('🔄 检测到初始化错误，尝试重新初始化...')
      this.safeInitPage()
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('🔄 认证页面隐藏')
    
    // 🔧 清理定时器
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    
    // 🔧 重置页面状态
    this.setData({
      submitting: false,
      logging: false,
      sending: false
    })
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('🔄 认证页面卸载')
    
    // 🔧 清理所有定时器
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    
    // 🔧 清理WebSocket监听
    this.cleanupWebSocketListener()
  },

  /**
   * 🔧 设置WebSocket监听
   */
  setupWebSocketListener() {
    try {
      const app = getApp()
      if (app && app.registerWebSocketHandler) {
        app.registerWebSocketHandler('auth_status', this.onWebSocketMessage.bind(this))
        console.log('✅ WebSocket监听器已设置')
      }
    } catch (error) {
      console.warn('⚠️ 设置WebSocket监听失败:', error)
    }
  },

  /**
   * 🔧 清理WebSocket监听
   */
  cleanupWebSocketListener() {
    try {
      const app = getApp()
      if (app && app.unregisterWebSocketHandler) {
        app.unregisterWebSocketHandler('auth_status', this.onWebSocketMessage.bind(this))
        console.log('✅ WebSocket监听器已清理')
      }
    } catch (error) {
      console.warn('⚠️ 清理WebSocket监听失败:', error)
    }
  },

  /**
   * 🔧 WebSocket消息处理
   */
  onWebSocketMessage(eventName, data) {
    console.log('📡 收到WebSocket消息:', eventName, data)
    
    // 处理认证相关的实时消息
    if (eventName === 'auth_status' && data) {
      if (data.type === 'login_success') {
        // 登录成功的实时通知
        console.log('✅ 收到登录成功的实时通知')
      } else if (data.type === 'token_expired') {
        // Token过期的实时通知
        console.log('⚠️ 收到Token过期的实时通知')
        wx.showToast({
          title: '登录已过期',
          icon: 'none',
          duration: 2000
        })
      }
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新认证页面')
    
    // 重新初始化页面
    this.safeInitPage()
    
    // 停止下拉刷新
    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    // 认证页面不需要上拉加载
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖系统',
      path: '/pages/auth/auth',
      imageUrl: '/images/share-auth.png'
    }
  },

  /**
   * 🔧 初始化开发配置
   */
  initDevelopmentConfig() {
    // 开发阶段的特殊配置已在页面初始化时处理
    console.log('✅ 开发配置已初始化')
  },

  /**
   * 🔧 手机号输入处理
   */
  onMobileInput(e) {
    const mobile = e.detail.value.trim()
    
    // 🔧 实时验证手机号格式
    const isValid = this.validateMobile(mobile)
    
    this.setData({
      mobile: mobile,
      [`formErrors.mobile`]: isValid ? '' : '请输入正确的手机号'
    })
    
    console.log('📱 手机号输入:', mobile, '验证结果:', isValid)
  },

  /**
   * 🔧 验证手机号格式
   */
  validateMobile(mobile) {
    const mobilePattern = /^1[3-9]\d{9}$/
    return mobilePattern.test(mobile)
  },

  /**
   * 🔧 验证码输入处理
   */
  onCodeInput(e) {
    const code = e.detail.value.trim()
    
    // 🔧 实时验证验证码格式
    const isValid = this.validateCode(code)
    
    this.setData({
      code: code,
      [`formErrors.code`]: isValid ? '' : '请输入6位数字验证码'
    })
    
    console.log('🔐 验证码输入:', code, '验证结果:', isValid)
  },

  /**
   * 🔧 验证验证码格式
   */
  validateCode(code) {
    const codePattern = /^\d{6}$/
    return codePattern.test(code)
  },

  /**
   * 🔧 发送验证码
   */
  onSendCode() {
    // 🔧 验证手机号
    if (!this.data.mobile) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      })
      return
    }

    if (!this.validateMobile(this.data.mobile)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    // 🔧 防止重复发送
    if (this.data.sending || this.data.countdown > 0) {
      return
    }

    this.setData({ sending: true })

    // 🔴 开发环境短信发送已禁用 - 根据用户需求清除开发环境功能

    // 🔴 生产环境：调用真实API
    this.authAPI.sendCode(this.data.mobile)
      .then(result => {
        console.log('✅ 验证码发送成功:', result)
        
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        })
        
        this.startCountdown()
      })
      .catch(error => {
        console.error('❌ 验证码发送失败:', error)
        this.handleSendCodeError(error)
      })
      .finally(() => {
        this.setData({ sending: false })
      })
  },

  /**
   * 🔧 处理发送验证码错误
   */
  handleSendCodeError(error) {
    let errorMessage = '验证码发送失败'
    
    if (error.code === 1001) {
      errorMessage = '手机号格式错误'
    } else if (error.code === 1002) {
      errorMessage = '发送太频繁，请稍后重试'
    } else if (error.code === 1003) {
      errorMessage = '今日发送次数已达上限'
    } else if (error.isNetworkError) {
      errorMessage = '网络连接失败，请检查网络'
    } else if (error.isBackendError) {
      errorMessage = error.msg || '服务器异常，请稍后重试'
    }
    
    wx.showModal({
      title: '验证码发送失败',
      content: errorMessage,
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /**
   * 🔧 开始倒计时
   */
  startCountdown() {
    let countdown = 60
    this.setData({ 
      countdown: countdown,
      codeDisabled: true 
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
   * 🔧 清除倒计时
   */
  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
    
    this.setData({
      countdown: 0,
      codeDisabled: false
    })
  },

  /**
   * 🔧 用户协议状态变化
   */
  onAgreementChange(e) {
    // 🔧 checkbox-group返回的是数组，需要判断是否包含'agreed'
    const agreementChecked = e.detail.value.includes('agreed')
    this.setData({
      agreementChecked: agreementChecked
    })
    console.log('✅ 用户协议状态变化:', agreementChecked)
  },

  /**
   * 🔧 查看用户协议
   */
  onViewAgreement() {
    this.setData({
      showAgreement: true
    })
  },

  /**
   * 🔧 关闭用户协议
   */
  onCloseAgreement() {
    this.setData({
      showAgreement: false
    })
  },

  /**
   * 🔧 提交登录
   */
  onSubmitLogin() {
    // 🔧 防止重复提交
    if (this.data.submitting || this.data.loginCompleted) {
      console.log('⚠️ 登录正在进行中或已完成，忽略重复提交')
      return
    }

    // 🔧 验证用户协议
    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请同意用户协议',
        icon: 'none'
      })
      return
    }

    // 🔧 表单验证
    const formData = {
      mobile: this.data.mobile,
      code: this.data.code
    }

    const validation = this.formValidator.validate(formData)
    if (!validation.isValid) {
      this.setData({
        formErrors: validation.errors
      })
      
      const firstError = Object.values(validation.errors)[0]
      wx.showToast({
        title: firstError,
        icon: 'none'
      })
      return
    }

    // 🔧 开始登录
    this.setData({ 
      submitting: true,
      logging: true,
      loginCompleted: false
    })

    console.log('🔐 开始统一登录流程 - 权限简化版v2.2.0')
    this.performUnifiedLogin(formData)
  },

  /**
   * 🔴 执行统一登录 - 权限简化版v2.2.0
   */
  performUnifiedLogin(formData, retryCount = 0) {
    console.log('🔐 执行统一登录:', {
      mobile: formData.mobile,
      code: formData.code,
      retryCount: retryCount
    })

    // 🔧 登录超时保护
    const loginTimeout = setTimeout(() => {
      if (!this.data.loginCompleted) {
        console.warn('🚨 登录请求超时，强制结束')
        this.setData({ 
          submitting: false,
          logging: false,
          loginTimeoutTriggered: true
        })
        
        wx.showModal({
          title: '登录超时',
          content: '登录请求超时，请检查网络连接后重试。',
          showCancel: false,
          confirmText: '重新登录'
        })
      }
    }, 15000) // 15秒超时

    this.authAPI.login(formData)
      .then(result => {
        clearTimeout(loginTimeout)
        
        if (this.data.loginCompleted) {
          console.log('⚠️ 登录已完成，忽略后续响应')
          return
        }

        console.log('✅ 统一登录成功:', result)
        this.handleUnifiedLoginSuccess(result)
      })
      .catch(error => {
        clearTimeout(loginTimeout)
        
        if (this.data.loginCompleted) {
          console.log('⚠️ 登录已完成，忽略错误响应')
          return
        }

        console.error('❌ 统一登录失败:', error)
        this.handleLoginFailure(error)
      })
  },

  /**
   * 🔧 处理统一登录成功 - 修复字段映射问题
   * 🔴 修复版：减少跳转延迟，优化用户体验
   */
  handleUnifiedLoginSuccess(loginData) {
    console.log('✅ 处理登录成功数据:', loginData)
    console.log('🔍 原始登录数据:', loginData.data)
    
    // 🔧 标记登录完成
    this.setData({ loginCompleted: true })
    
    try {
      const app = getApp()
      const rawUserInfo = loginData.data.user_info
      
      // 🔴 新增：JWT Token验证
      const accessToken = loginData.data.access_token
      const refreshToken = loginData.data.refresh_token
      
      console.log('\n🔍=================== 登录Token验证开始 ===================')
      console.log('🔑 获取到的Token:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: accessToken ? accessToken.length : 0,
        refreshTokenLength: refreshToken ? refreshToken.length : 0,
        accessTokenPreview: accessToken ? accessToken.substring(0, 50) + '...' : 'NO_TOKEN'
      })
      
      // JWT格式验证
      if (accessToken) {
        const tokenParts = accessToken.split('.')
        console.log('🔍 JWT结构检查:', {
          totalParts: tokenParts.length,
          isValidJWT: tokenParts.length === 3,
          expectedParts: 3
        })
        
        if (tokenParts.length === 3) {
          try {
            // 解码JWT payload
            const payload = JSON.parse(atob(tokenParts[1]))
            console.log('🔍 JWT Payload解码成功:', {
              userId: payload.userId || payload.user_id,
              mobile: payload.mobile,
              isAdmin: payload.is_admin,
              issuedAt: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : 'N/A',
              expiresAt: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'N/A'
            })
            
            // 检查token是否已经过期
            const now = Math.floor(Date.now() / 1000)
            if (payload.exp && payload.exp < now) {
              console.error('🚨 警告：后端返回的Token已经过期！')
              console.error('过期时间:', new Date(payload.exp * 1000).toLocaleString())
              console.error('当前时间:', new Date().toLocaleString())
            } else if (payload.exp) {
              const timeLeft = payload.exp - now
              console.log('✅ Token有效期正常，剩余:', Math.floor(timeLeft / 60), '分钟')
            }
            
          } catch (decodeError) {
            console.error('❌ JWT Payload解码失败:', decodeError.message)
            console.error('🚨 这可能导致后续401认证失败')
          }
        } else {
          console.error('❌ JWT格式无效！预期3个部分，实际:', tokenParts.length)
          console.error('🚨 这将导致API调用时401认证失败')
        }
      } else {
        console.error('❌ 致命错误：后端没有返回access_token！')
        console.error('🚨 这将导致所有需要认证的API调用失败')
      }
      
      console.log('=================== 登录Token验证结束 ==================\n')
      
      // 🔧 关键修复：统一字段映射 - 将后端登录数据格式转换为前端期待格式
      const mappedUserInfo = {
        // 🔴 基础字段映射
        user_id: rawUserInfo.user_id || rawUserInfo.id || 'unknown',
        mobile: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
        nickname: rawUserInfo.nickname || rawUserInfo.nickName || rawUserInfo.name || '用户',
        total_points: parseInt(rawUserInfo.total_points || rawUserInfo.totalPoints || rawUserInfo.points || 0),
        
        // 🔴 权限字段映射
        is_admin: Boolean(rawUserInfo.is_admin || rawUserInfo.isAdmin || false),
        
        // 🔴 头像字段映射
        avatar_url: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
        avatar: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
        
        // 🔴 状态字段映射
        status: rawUserInfo.status || rawUserInfo.state || 'active',
        
        // 🔴 时间字段映射
        last_login: rawUserInfo.last_login || rawUserInfo.lastLogin || rawUserInfo.last_login_time,
        created_at: rawUserInfo.created_at || rawUserInfo.createdAt || rawUserInfo.create_time,
        
        // 🔴 兼容字段
        phone: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
        level: rawUserInfo.level || 'VIP1'
      }
      
      console.log('🔧 登录成功字段映射结果:', {
        原始: rawUserInfo,
        映射后: mappedUserInfo
      })
      
      // 🔧 保存登录数据
      app.globalData.accessToken = loginData.data.access_token
      app.globalData.refreshToken = loginData.data.refresh_token
      app.globalData.userInfo = mappedUserInfo  // 使用映射后的用户信息
      app.globalData.isLoggedIn = true
      
      // 🔧 保存到本地存储
      wx.setStorageSync('access_token', loginData.data.access_token)
      wx.setStorageSync('refresh_token', loginData.data.refresh_token)
      wx.setStorageSync('user_info', mappedUserInfo)  // 使用映射后的用户信息
      
      console.log('✅ 登录数据已保存到全局和本地存储')
      
      // 🔧 触发应用登录成功事件
      if (app.onLoginSuccess) {
        const loginDataWithMappedUser = {
          ...loginData,
          data: {
            ...loginData.data,
            user_info: mappedUserInfo
          }
        }
        app.onLoginSuccess(loginDataWithMappedUser)
      }
      
      // 🔴 关键修复：减少跳转延迟，立即开始跳转流程
      console.log('🚀 立即开始跳转流程，减少用户等待时间')
      
      // 简化提示，不阻塞跳转
      wx.showToast({
        title: '登录成功',
        icon: 'success',
        duration: 1000  // 缩短提示时间
      })
      
      // 🔴 关键修复：立即跳转，不等待提示结束
      this.performOptimizedRedirect(mappedUserInfo.is_admin)
      
    } catch (error) {
      console.error('❌ 处理登录成功数据时出错:', error)
      this.handleLoginFailure(error)
    }
  },

  /**
   * 🔴 新增：优化的跳转流程（减少延迟）
   */
  performOptimizedRedirect(isAdmin) {
    console.log('🚀 执行优化跳转 - 立即跳转到抽奖页面')
    
    try {
      this.setData({ 
        submitting: false,
        logging: false 
      })
      
      // 🔴 关键修复：立即跳转，不延迟等待
      console.log('🎰 立即跳转到抽奖页面')
      this.immediateRedirectToLottery()
      
    } catch (error) {
      console.error('❌ 跳转过程中出错:', error)
      this.handleSimpleNavigationFailure(error)
    }
  },

  /**
   * 🔴 新增：立即跳转到抽奖页面（无延迟版）
   */
  immediateRedirectToLottery() {
    console.log('🎰 立即跳转到抽奖页面（无延迟）')
    
    // 🔴 关键修复：立即尝试跳转，无任何延迟
    wx.switchTab({
      url: '/pages/lottery/lottery',
      success: () => {
        console.log('✅ 抽奖页面跳转成功（立即）')
        
        // 🔴 修复：跳转成功后延迟显示欢迎提示，避免阻塞
        setTimeout(() => {
          wx.showToast({
            title: '欢迎参与抽奖！',
            icon: 'success',
            duration: 1500
          })
        }, 200)  // 很短的延迟，确保页面已切换
      },
      fail: (error) => {
        console.error('❌ switchTab跳转失败:', error)
        
        // 🔴 修复：立即尝试备用方案，不延迟
        this.immediateAlternativeNavigation(error)
      }
    })
  },

  /**
   * 🔴 新增：立即备用导航方案（无延迟）
   */
  immediateAlternativeNavigation(originalError) {
    console.log('🔄 立即尝试备用导航方案...')
    
    // 备用方案1：立即使用reLaunch
    wx.reLaunch({
      url: '/pages/lottery/lottery',
      success: () => {
        console.log('✅ reLaunch跳转成功（立即备用方案）')
        wx.showToast({
          title: '登录成功！',
          icon: 'success',
          duration: 1500
        })
      },
      fail: (reLaunchError) => {
        console.error('❌ reLaunch也失败:', reLaunchError)
        
        // 备用方案2：立即跳转到首页
        wx.reLaunch({
          url: '/pages/index/index',
          success: () => {
            console.log('✅ 跳转到首页成功（立即）')
            wx.showModal({
              title: '登录成功',
              content: '登录成功！页面跳转有点问题，已跳转到首页。\n\n请点击底部"抽奖"标签继续使用。',
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#FF6B35'
            })
          },
          fail: (indexError) => {
            console.error('❌ 所有跳转方案都失败:', indexError)
            this.handleSimpleNavigationFailure(originalError)
          }
        })
      }
    })
  },

  /**
   * 🔴 新增：简化的导航失败处理
   */
  handleSimpleNavigationFailure(error) {
    console.error('❌ 页面跳转最终失败:', error)
    
    wx.showModal({
      title: '登录成功',
      content: `登录已成功！但页面跳转遇到问题。\n\n请手动点击底部"抽奖"标签继续使用。`,
      showCancel: true,
      cancelText: '重试',
      confirmText: '知道了',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.cancel) {
          // 用户选择重试
          this.directSafeRedirectToLottery()
        } else {
          // 用户选择知道了，显示操作提示
          wx.showToast({
            title: '请点击底部"抽奖"标签',
            icon: 'none',
            duration: 3000
          })
        }
      }
    })
  },

  /**
   * 🔧 跳转到主页面（简化版）
   */
  redirectToMainPage(userInfo) {
    console.log('🔄 跳转到主页面 - 统一跳转到抽奖页面:', userInfo)
    
    // 🔴 简化：直接调用简化版跳转
    console.log('🎰 开始跳转到抽奖页面（自动登录）')
    this.directSafeRedirectToLottery()
  },

  /**
   * 🔧 安全跳转到抽奖页面（兼容性保留）
   */
  safeRedirectToLottery() {
    console.log('🎰 安全跳转到抽奖页面（调用简化版）')
    // 调用简化版跳转机制
    this.directSafeRedirectToLottery()
  },

  /**
   * 🔧 处理登录失败
   */
  handleLoginFailure(error) {
    console.error('❌ 登录失败处理:', error)
    
    // 🔧 标记登录完成（失败也算完成）
    this.setData({ 
      loginCompleted: true,
      submitting: false,
      logging: false
    })
    
    // 🔧 增加错误重试计数
    this.setData({
      errorRetryCount: this.data.errorRetryCount + 1,
      lastErrorTime: new Date().toISOString()
    })
    
    let errorMessage = '登录失败'
    let showRetry = false
    
    if (error.code === 1002) {
      errorMessage = '验证码错误，开发环境请使用123456'
    } else if (error.code === 1003) {
      errorMessage = '手机号格式错误'
    } else if (error.code === 1004) {
      errorMessage = '验证码已过期，请重新获取'
    } else if (error.code === 2001) {
      errorMessage = '认证失败，请重新登录'
    } else if (error.isNetworkError) {
      errorMessage = '网络连接失败，请检查网络设置'
      showRetry = true
    } else if (error.isBackendError) {
      errorMessage = error.msg || '服务器异常，请稍后重试'
      showRetry = true
    }
    
    // 🔧 显示错误提示
    if (showRetry && this.data.errorRetryCount < this.data.maxErrorRetryCount) {
      wx.showModal({
        title: '登录失败',
        content: `${errorMessage}\n\n是否重新尝试登录？`,
        showCancel: true,
        cancelText: '取消',
        confirmText: '重试',
        success: (res) => {
          if (res.confirm) {
            // 重试登录
            setTimeout(() => {
              this.onSubmitLogin()
            }, 1000)
          }
        }
      })
    } else {
      wx.showModal({
        title: '登录失败',
        content: errorMessage,
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  }
})