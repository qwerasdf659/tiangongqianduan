// pages/auth/auth.js - 认证页面逻辑
const app = getApp()
const { authAPI, mockRequest } = require('../../utils/api')
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
    
    // 页面状态
    submitting: false,
    
    // 用户协议
    agreementChecked: false,
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
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖 - 快来注册赚积分！',
      path: '/pages/auth/auth',
      imageUrl: '/images/share-auth.jpg'
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
   * 发送验证码
   */
  async onSendCode() {
    // 验证手机号
    if (!this.validatePhone(this.data.phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    // 开始倒计时
    this.startCountdown()

    try {
      if (app.globalData.isDev) {
        // 开发环境模拟发送
        console.log('模拟发送验证码到:', this.data.phone)
        wx.showToast({
          title: '验证码已发送（开发环境）',
          icon: 'success'
        })
      } else {
        // TODO: 对接真实发送验证码接口
        await authAPI.sendCode(this.data.phone)
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        })
      }

    } catch (error) {
      console.error('发送验证码失败:', error)
      wx.showToast({
        title: error.msg || '发送失败',
        icon: 'none'
      })
      
      // 发送失败时重置倒计时
      this.clearCountdown()
    }
  },

  /**
   * 开始倒计时
   */
  startCountdown() {
    this.setData({
      codeDisabled: true,
      countdown: 60
    })

    this.countdownTimer = setInterval(() => {
      const countdown = this.data.countdown - 1
      
      if (countdown <= 0) {
        this.clearCountdown()
      } else {
        this.setData({ countdown })
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
   * 协议勾选
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
   * 关闭协议弹窗
   */
  onCloseAgreement() {
    this.setData({ showAgreement: false })
  },

  /**
   * 提交登录
   */
  async onSubmitLogin() {
    // 验证表单
    const formData = {
      phone: this.data.phone,
      code: this.data.code
    }

    if (!this.data.formValidator.validate(formData)) {
      const firstError = this.data.formValidator.getFirstError()
      wx.showToast({
        title: firstError || '请填写正确信息',
        icon: 'none'
      })
      
      this.setData({
        formErrors: this.data.formValidator.getErrors()
      })
      return
    }

    // 检查协议勾选
    if (!this.data.agreementChecked) {
      wx.showToast({
        title: '请同意用户协议',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      let loginResult

      if (app.globalData.isDev) {
        // 开发环境模拟登录
        loginResult = {
          code: 0,
          msg: '登录成功',
          data: {
            access_token: 'mock_access_token_' + Date.now(),
            refresh_token: 'mock_refresh_token_' + Date.now(),
            expires_in: 7200,
            user_info: {
              user_id: 1001,
              phone: this.data.phone,
              total_points: 1500,
              is_merchant: false
            }
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 1500))
      } else {
        // TODO: 对接真实登录接口
        loginResult = await authAPI.login(this.data.phone, this.data.code)
      }

      // 保存登录信息
      app.globalData.isLoggedIn = true
      app.globalData.accessToken = loginResult.data.access_token
      app.globalData.refreshToken = loginResult.data.refresh_token
      app.globalData.userInfo = loginResult.data.user_info

      // 本地存储
      wx.setStorageSync('access_token', loginResult.data.access_token)
      wx.setStorageSync('refresh_token', loginResult.data.refresh_token)
      wx.setStorageSync('user_info', loginResult.data.user_info)

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })

      // 跳转到首页
      setTimeout(() => {
        wx.redirectTo({
          url: '/pages/lottery/lottery'
        })
      }, 1500)

    } catch (error) {
      console.error('登录失败:', error)
      wx.showToast({
        title: error.msg || '登录失败',
        icon: 'none'
      })
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 跳过登录（开发环境）
   */
  onSkipLogin() {
    if (!app.globalData.isDev) return

    // 设置模拟登录状态
    app.globalData.isLoggedIn = true
    app.globalData.userInfo = app.globalData.mockUser

    wx.showToast({
      title: '已跳过登录（开发环境）',
      icon: 'success'
    })

    setTimeout(() => {
      wx.redirectTo({
        url: '/pages/lottery/lottery'
      })
    }, 1000)
  }
})