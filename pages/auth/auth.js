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
    showAgreement: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('认证页面加载')
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
   * 🔴 发送验证码 - 根据后端文档实现
   * 后端接口: POST /api/auth/send-code
   * 请求体: { phone: "13800138000" }
   * 响应: { code: 0, message: "验证码已发送", data: { phone, expires_in: 300 } }
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

    // 防止重复发送
    if (this.data.sending || this.data.countdown > 0) {
      return
    }

    this.setData({ sending: true })

    console.log('📡 发送验证码:', phone)

    authAPI.sendCode(phone).then((result) => {
      console.log('✅ 验证码发送成功:', result)
      
      this.setData({ sending: false })
      
      wx.showToast({
        title: '验证码已发送',
        icon: 'success'
      })
      
      // 开始倒计时
      this.startCountdown()
      
    }).catch((error) => {
      console.error('❌ 验证码发送失败:', error)
      
      this.setData({ sending: false })
      
      let errorMsg = '验证码发送失败'
      
      // 根据后端错误码处理
      switch (error.code) {
        case 400:
          errorMsg = '手机号格式不正确'
          break
        case 429:
          errorMsg = '发送过于频繁，请稍后再试'
          break
        case 500:
          errorMsg = '系统繁忙，请稍后再试'
          break
        default:
          errorMsg = error.message || '验证码发送失败'
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      })
    })
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
   * 🔴 用户登录 - 根据后端文档实现
   * 后端接口: POST /api/auth/login
   * 请求体: { phone: "13800138000", code: "123456" }
   * 响应: { 
   *   code: 0, 
   *   message: "登录成功", 
   *   data: { 
   *     access_token, refresh_token, expires_in, token_type: "Bearer",
   *     user_info: { user_id, phone, total_points, is_merchant, nickname, avatar, status }
   *   }
   * }
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

    console.log('📡 请求登录接口:', { phone: formData.phone })

    authAPI.login(formData.phone, formData.code).then((loginResult) => {
      wx.hideLoading()
      
      if (loginResult.code === 0) {
        console.log('✅ 登录成功，用户ID:', loginResult.data.user_info.user_id)
        
        // 🔴 使用app.js中的登录成功处理方法
        app.onLoginSuccess(loginResult.data)
        
        this.setData({ logging: false })
        
        wx.showToast({
          title: '登录成功！',
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
        
      } else {
        throw new Error(loginResult.message || '登录失败')
      }
    }).catch((error) => {
      wx.hideLoading()
      this.setData({ logging: false })
      console.error('❌ 登录失败:', error)
      
      let errorMsg = '登录失败，请重试'
      
      // 根据后端错误码处理
      switch (error.code) {
        case 400:
          errorMsg = '参数错误'
          break
        case 401:
          errorMsg = '验证码错误或已过期'
          break
        case 403:
          errorMsg = '用户账号被禁用'
          break
        case 404:
          errorMsg = '用户不存在'
          break
        case 429:
          errorMsg = '请求过于频繁'
          break
        case 500:
          errorMsg = '系统繁忙，请稍后再试'
          break
        default:
          errorMsg = error.message || '登录失败，请重试'
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none',
        duration: 3000
      })
    })
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
    app.globalData.userInfo = app.globalData.mockUser
    app.globalData.isLoggedIn = true
    
    wx.showToast({
      title: '已进入开发模式',
      icon: 'success'
    })
    
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/lottery/lottery' })
    }, 1000)
  }
})