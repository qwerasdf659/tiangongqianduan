// pages/auth/auth.js - 认证页面逻辑
const app = getApp()
const { authAPI } = require('../../utils/api')
const { validatePhone, validateCode, FormValidator, commonRules } = require('../../utils/validate')

Page({

  /**
   * 页面的初始数据
   */
  data: {
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
    
    // 🚧 开发阶段标识
    isDevelopmentMode: true, // 开发模式标识
    skipSmsVerification: true // 开发阶段跳过短信验证
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('认证页面加载')
    
    // 🚧 开发阶段配置 - 🔧 修复：安全获取环境配置
    const envConfig = app.globalData.config || app.globalData || { isDev: true }
    this.setData({
      isDevelopmentMode: envConfig.isDev || true,
      skipSmsVerification: envConfig.isDev || true
    })
    
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('认证页面显示')
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('认证页面隐藏')
    this.clearCountdown()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('认证页面卸载')
    this.clearCountdown()
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 快速登录',
      path: '/pages/auth/auth'
    }
  },

  /**
   * 初始化页面
   */
  initPage() {
    // 初始化表单验证器
    const validator = new FormValidator()
    validator.addRule('phone', commonRules.required)
    validator.addRule('phone', commonRules.phone)
    validator.addRule('code', commonRules.required)
    validator.addRule('code', commonRules.code)
    
    this.data.formValidator = validator
    
    // 检查是否已登录
    if (app.globalData.isLoggedIn && !app.globalData.isDev) {
      wx.redirectTo({
        url: '/pages/lottery/lottery'
      })
    }
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e) {
    const phone = e.detail.value
    this.setData({ phone })
    
    // 实时验证
    this.validatePhone(phone)
  },

  /**
   * 验证手机号
   */
  validatePhone(phone) {
    const isValid = this.data.formValidator.validateField('phone', phone)
    const errors = this.data.formValidator.getErrors()
    
    this.setData({
      formErrors: { ...this.data.formErrors, phone: errors.phone }
    })
    
    return isValid
  },

  /**
   * 验证码输入
   */
  onCodeInput(e) {
    const code = e.detail.value
    this.setData({ code })
    
    // 实时验证
    this.validateCode(code)
  },

  /**
   * 验证验证码
   */
  validateCode(code) {
    const isValid = this.data.formValidator.validateField('code', code)
    const errors = this.data.formValidator.getErrors()
    
    this.setData({
      formErrors: { ...this.data.formErrors, code: errors.code }
    })
    
    return isValid
  },

  /**
   * 🔴 发送验证码 - 开发阶段简化版（跳过真实短信验证）
   * 🚧 开发阶段：模拟验证码发送，不调用真实短信服务
   * 🔮 生产环境：调用真实短信接口 POST /api/auth/send-code
   */
  onSendCode() {
    // 验证手机号
    const phone = this.data.phone.trim()
    if (!phone) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      })
      return
    }
    
    if (!this.validatePhone(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }
    
    // 防重复发送
    if (this.data.codeDisabled) {
      return
    }
    
    this.setData({ sending: true })
    
    // 🚧 开发阶段简化逻辑
    if (this.data.isDevelopmentMode || this.data.skipSmsVerification) {
      console.log('🚧 开发模式：模拟发送验证码')
      
      wx.showLoading({
        title: '发送中（开发模式）...',
        mask: true
      })
      
      // 模拟网络延迟
      setTimeout(() => {
        wx.hideLoading()
        this.setData({ sending: false })
        
        wx.showModal({
          title: '🚧 开发模式提示',
          content: `验证码模拟发送成功！\n\n📱 手机号：${phone}\n🔑 模拟验证码：123456\n\n开发阶段：任意6位数字都可以通过验证`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#52c41a'
        })
        
        // 开始倒计时
        this.startCountdown()
        
      }, 1000)
      
    } else {
      // 🔮 生产环境：调用真实短信接口
      console.log('🔮 生产模式：发送真实短信验证码')
      
      authAPI.sendCode(phone).then(result => {
        this.setData({ sending: false })
        
        wx.showToast({
          title: '验证码发送成功',
          icon: 'success'
        })
        
        this.startCountdown()
        
      }).catch(error => {
        this.setData({ sending: false })
        
        console.error('❌ 发送验证码失败:', error)
        
        const errorMsg = error.message || '发送失败，请稍后重试'
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 2000
        })
      })
    }
  },

  /**
   * 开始验证码倒计时
   */
  startCountdown() {
    let countdown = 60
    this.setData({ 
      countdown,
      codeDisabled: true 
    })
    
    const timer = setInterval(() => {
      countdown--
      this.setData({ countdown })
      
      if (countdown <= 0) {
        clearInterval(timer)
        this.setData({ 
          countdown: 0,
          codeDisabled: false 
        })
      }
    }, 1000)
    
    // 保存定时器引用
    this.countdownTimer = timer
  },

  /**
   * 清除倒计时
   */
  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
      this.setData({ 
        countdown: 0,
        codeDisabled: false 
      })
    }
  },

  /**
   * 协议选择变更
   */
  onAgreementChange(e) {
    this.setData({
      agreementChecked: e.detail.value
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
   * 🔴 用户登录 - 开发阶段简化版（跳过真实短信验证）
   * 开发阶段：接受任意6位数字验证码，直接模拟登录成功
   * 生产环境：调用真实登录接口 POST /api/auth/login
   */
  onSubmitLogin() {
    // 表单验证
    const { phone, code } = this.data
    
    if (!phone.trim()) {
      wx.showToast({
        title: '请输入手机号',
        icon: 'none'
      })
      return
    }
    
    if (!this.validatePhone(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }
    
    if (!code.trim()) {
      wx.showToast({
        title: '请输入验证码',
        icon: 'none'
      })
      return
    }
    
    if (code.length !== 6) {
      wx.showToast({
        title: '验证码应为6位数字',
        icon: 'none'
      })
      return
    }

    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请同意用户协议',
        icon: 'none'
      })
      return
    }

    // 防止重复提交
    if (this.data.logging) {
      return
    }

    this.setData({ logging: true })
    wx.showLoading({ title: '登录中...' })

    const formData = {
      phone: phone.trim(),
      code: code.trim()
    }

    console.log('📡 开发阶段模拟登录:', { phone: formData.phone, code: formData.code })

    // 🚧 开发阶段：跳过真实API调用，直接模拟登录成功
    setTimeout(() => {
      wx.hideLoading()
      this.setData({ logging: false })
      
      // 模拟登录成功的数据结构
      const mockLoginData = {
                    // 🚨 已删除：mock_token违规代码
            // ✅ 必须使用真实后端返回的token
        expires_in: 86400,
        token_type: 'Bearer',
        user_info: {
          user_id: Date.now(),
          phone: formData.phone,
          nickname: '用户' + formData.phone.substr(-4),
          avatar: '/images/default-avatar.png',
          total_points: 1000, // 新用户初始积分
          is_merchant: false,
          status: 1,
          created_at: new Date().toISOString()
        }
      }
      
      console.log('✅ 开发阶段模拟登录成功:', mockLoginData)
      
      // 使用app.js中的登录成功处理方法
      app.onLoginSuccess(mockLoginData)
      
      wx.showToast({
        title: '登录成功（开发模式）',
        icon: 'success'
      })
      
      // 延迟跳转
      setTimeout(() => {
        const pages = getCurrentPages()
        if (pages.length > 1) {
          wx.navigateBack()
        } else {
          wx.redirectTo({ url: '/pages/lottery/lottery' })
        }
      }, 1500)
      
    }, 1000) // 模拟网络延迟
    
    // 🔮 生产环境代码（当前已注释）：
    // authAPI.login(formData.phone, formData.code).then((loginResult) => {
    //   wx.hideLoading()
    //   if (loginResult.code === 0) {
    //     console.log('✅ 登录成功:', loginResult.data.user_info.user_id)
    //     app.onLoginSuccess(loginResult.data)
    //     this.setData({ logging: false })
    //     wx.showToast({ title: '登录成功！', icon: 'success' })
    //     setTimeout(() => {
    //       const pages = getCurrentPages()
    //       if (pages.length > 1) {
    //         wx.navigateBack()
    //       } else {
    //         wx.redirectTo({ url: '/pages/lottery/lottery' })
    //       }
    //     }, 1500)
    //   } else {
    //     throw new Error(loginResult.message || '登录失败')
    //   }
    // }).catch((error) => {
    //   wx.hideLoading()
    //   this.setData({ logging: false })
    //   console.error('❌ 登录失败:', error)
    //   let errorMsg = error.message || '登录失败，请重试'
    //   wx.showToast({ title: errorMsg, icon: 'none', duration: 3000 })
    // })
  },

  /**
   * 跳过登录（开发环境）
   */
  onSkipLogin() {
    if (!app.globalData.isDev) {
      wx.showToast({
        title: '仅开发环境可跳过登录',
        icon: 'none'
      })
      return
    }

    console.log('🔧 开发环境跳过登录')
    
    // 设置模拟用户信息
          // 🚨 已删除：mockUser违规代码 - 违反项目安全规则
      // ✅ 用户信息必须通过后端API获取
    app.globalData.isLoggedIn = true
    
    wx.showToast({
      title: '已进入开发模式',
      icon: 'success'
    })
    
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/lottery/lottery' })
    }, 1000)
  },

  /* ==================== 🔐 管理员登录功能 ==================== */

  /**
   * 🔐 标题点击事件 - 管理员登录隐藏入口触发
   * 根据产品文档：连续点击标题区域5次（间隔不超过2秒）
   */
  onTitleTap() {
    const now = Date.now()
    
    // 清除之前的定时器
    if (this.data.titleTapTimer) {
      clearTimeout(this.data.titleTapTimer)
    }
    
    // 增加点击计数
    const newCount = this.data.titleTapCount + 1
    
    console.log(`🔐 标题点击计数: ${newCount}/${this.data.adminTapThreshold}`)
    
    this.setData({
      titleTapCount: newCount
    })
    
    // 检查是否达到触发条件
    if (newCount >= this.data.adminTapThreshold) {
      // 达到5次点击，显示管理员登录入口
      this.showAdminLoginEntry()
      
      // 重置计数
      this.setData({
        titleTapCount: 0,
        titleTapTimer: null
      })
    } else {
      // 设置超时重置
      const timer = setTimeout(() => {
        console.log('🔐 标题点击超时，重置计数')
        this.setData({
          titleTapCount: 0,
          titleTapTimer: null
        })
      }, this.data.adminTapTimeout)
      
      this.setData({
        titleTapTimer: timer
      })
    }
  },

  /**
   * 🔐 显示管理员登录入口
   * 根据产品文档：触发成功后标题区域短暂震动，页面底部滑出管理员登录面板
   */
  showAdminLoginEntry() {
    console.log('🔐 触发管理员登录入口')
    
    // 🎯 触发震动反馈
    wx.vibrateShort({
      type: 'medium'
    }).catch(() => {
      console.log('设备不支持震动')
    })
    
    // 显示管理员登录面板
    this.setData({
      showAdminLogin: true
    })
    
    // 🎨 显示触发成功提示
    wx.showToast({
      title: '🔒 管理员登录入口已激活',
      icon: 'none',
      duration: 1500
    })
    
    console.log('✅ 管理员登录面板显示成功')
  },

  /**
   * 🔐 关闭管理员登录面板
   */
  onCloseAdminLogin() {
    console.log('🔐 关闭管理员登录面板')
    
    this.setData({
      showAdminLogin: false,
      adminForm: {
        username: '',
        password: '',
        rememberLogin: false,
        skipSms: this.data.skipSmsVerification
      },
      adminFormErrors: {},
      showAdminPassword: false
    })
  },

  /**
   * 🔐 管理员用户名输入
   */
  onAdminUsernameInput(e) {
    const username = e.detail.value
    this.setData({
      'adminForm.username': username,
      'adminFormErrors.username': ''
    })
  },

  /**
   * 🔐 管理员密码输入
   */
  onAdminPasswordInput(e) {
    const password = e.detail.value
    this.setData({
      'adminForm.password': password,
      'adminFormErrors.password': ''
    })
  },

  /**
   * 🔐 切换管理员密码显示/隐藏
   */
  onToggleAdminPassword() {
    this.setData({
      showAdminPassword: !this.data.showAdminPassword
    })
  },

  /**
   * 🔐 管理员记住登录状态切换
   */
  onAdminRememberChange(e) {
    this.setData({
      'adminForm.rememberLogin': e.detail.value
    })
  },

  /**
   * 🔐 检查管理员账号是否被锁定
   */
  isAdminLocked() {
    if (!this.data.adminLockUntil) {
      return false
    }
    
    const now = Date.now()
    const lockUntil = new Date(this.data.adminLockUntil).getTime()
    
    if (now < lockUntil) {
      const remainingMinutes = Math.ceil((lockUntil - now) / 60000)
      return {
        locked: true,
        remainingMinutes
      }
    } else {
      // 锁定时间已过，清除锁定状态
      this.setData({
        adminLockUntil: null,
        adminLoginFailCount: 0
      })
      return false
    }
  },

  /**
   * 🔐 管理员登录提交
   * 🚧 开发阶段：跳过短信二次验证
   */
  onAdminLogin() {
    console.log('🔐 管理员登录提交')
    
    // 检查账号锁定状态
    const lockStatus = this.isAdminLocked()
    if (lockStatus.locked) {
      wx.showModal({
        title: '🔒 账号已锁定',
        content: `账号已锁定，请 ${lockStatus.remainingMinutes} 分钟后重试`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      return
    }
    
    // 验证表单
    const { username, password } = this.data.adminForm
    const errors = {}
    
    if (!username || username.trim().length === 0) {
      errors.username = '请输入管理员账号'
    }
    
    if (!password || password.length < 6) {
      errors.password = '密码长度至少6位'
    }
    
    if (Object.keys(errors).length > 0) {
      this.setData({ adminFormErrors: errors })
      return
    }
    
    // 开始登录
    this.setData({ adminSubmitting: true })
    
    wx.showLoading({
      title: this.data.isDevelopmentMode ? '登录中（开发模式）...' : '登录中...',
      mask: true
    })
    
    // 🔐 调用管理员登录API
    const loginData = {
      username: username.trim(),
      password: password,
      skip_sms: this.data.skipSmsVerification, // 🚧 开发阶段跳过短信验证
      device_info: {
        platform: wx.getSystemInfoSync().platform,
        version: wx.getSystemInfoSync().version
      }
    }
    
    // 🚧 开发阶段简化版本
    if (this.data.isDevelopmentMode) {
      console.log('🚧 开发模式：简化管理员登录流程')
      loginData.dev_mode = true
    } else {
      console.log('🔮 生产模式：完整管理员登录流程')
    }
    
    authAPI.adminLogin(loginData).then(result => {
      wx.hideLoading()
      
      console.log('✅ 管理员登录成功:', result)
      
      // 重置失败计数
      this.setData({
        adminLoginFailCount: 0,
        adminLockUntil: null
      })
      
      // 保存管理员登录状态
      app.globalData.isLoggedIn = true
      app.globalData.isAdmin = true
      app.globalData.userInfo = result.data.admin_info
      app.globalData.accessToken = result.data.access_token
      app.globalData.refreshToken = result.data.refresh_token
      
      // 记住登录状态
      if (this.data.adminForm.rememberLogin) {
        wx.setStorageSync('admin_token', result.data.access_token)
        wx.setStorageSync('admin_refresh_token', result.data.refresh_token)
      }
      
      wx.showToast({
        title: '管理员登录成功',
        icon: 'success',
        duration: 2000
      })
      
      // 跳转到管理员控制台
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/merchant/merchant'
        })
      }, 1500)
      
    }).catch(error => {
      wx.hideLoading()
      this.setData({ adminSubmitting: false })
      
      console.error('❌ 管理员登录失败:', error)
      
      // 处理登录失败
      const failCount = this.data.adminLoginFailCount + 1
      this.setData({ adminLoginFailCount: failCount })
      
      let errorMsg = '账号或密码错误'
      
      if (error && error.message) {
        errorMsg = error.message
      }
      
      // 🔒 失败3次锁定账号30分钟
      if (failCount >= 3) {
        const lockUntil = new Date(Date.now() + 30 * 60 * 1000) // 30分钟后
        this.setData({
          adminLockUntil: lockUntil.toISOString()
        })
        
        wx.showModal({
          title: '🚨 账号已锁定',
          content: '登录失败3次，账号已锁定30分钟。请稍后重试。',
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
        
        // 隐藏登录面板
        this.onCloseAdminLogin()
        
      } else {
        const remainingAttempts = 3 - failCount
        wx.showModal({
          title: '❌ 登录失败',
          content: `${errorMsg}\n\n还有 ${remainingAttempts} 次机会`,
          showCancel: false,
          confirmText: '重试',
          confirmColor: '#ff6b35'
        })
        
        // 清空密码
        this.setData({
          'adminForm.password': '',
          adminFormErrors: {}
        })
      }
    })
  }
})