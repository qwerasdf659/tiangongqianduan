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
   * 发送验证码
   * TODO: 后端对接 - 发送验证码接口
   * 
   * 对接说明：
   * 接口：POST /api/auth/send-code
   * 请求体：{ phone: "13800138000" }
   * 返回：{ code: 0, msg: "验证码已发送", data: { expire_time: 300 } }
   * 
   * 注意事项：
   * 1. 需要验证手机号格式
   * 2. 需要防刷验证（图形验证码或滑块验证）
   * 3. 需要限制发送频率（60秒间隔）
   */
  async onSendCode() {
    // 验证手机号
    const phone = this.data.phone.trim()
    if (!this.validatePhone(phone)) {
      wx.showToast({
        title: '请输入正确的手机号',
        icon: 'none'
      })
      return
    }

    // 防止重复发送
    if (this.data.codeDisabled) {
      wx.showToast({
        title: `${this.data.countdown}秒后可重新发送`,
        icon: 'none'
      })
      return
    }

    // 开始倒计时
    this.startCountdown()

    try {
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟发送
        console.log('🔧 模拟发送验证码到:', phone)
        wx.showLoading({ title: '发送中...' })
        
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        wx.hideLoading()
        wx.showToast({
          title: '验证码已发送（开发环境）',
          icon: 'success'
        })
        
        // 开发环境提示验证码
        setTimeout(() => {
          wx.showModal({
            title: '开发环境提示',
            content: '验证码：123456（开发环境固定验证码）',
            showCancel: false
          })
        }, 1500)
        
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求发送验证码接口...')
        wx.showLoading({ title: '发送中...' })
        
        const result = await authAPI.sendCode(phone)
        
        wx.hideLoading()
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        })
        
        console.log('✅ 验证码发送成功，有效期:', result.data.expire_time, '秒')
      }

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 发送验证码失败:', error)
      
      let errorMsg = '发送失败，请稍后重试'
      
      // 根据错误码显示不同的错误信息
      switch (error.code) {
        case 1001:
          errorMsg = '手机号格式不正确'
          break
        case 1002:
          errorMsg = '发送过于频繁，请稍后再试'
          break
        case 1003:
          errorMsg = '今日验证码发送次数已达上限'
          break
        default:
          errorMsg = error.msg || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
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
   * TODO: 后端对接 - 登录接口
   * 
   * 对接说明：
   * 接口：POST /api/auth/login
   * 请求体：{ phone: "13800138000", code: "123456" }
   * 返回：{ 
   *   code: 0, 
   *   msg: "登录成功", 
   *   data: { 
   *     access_token: "jwt_token",
   *     refresh_token: "refresh_token",
   *     expires_in: 7200,
   *     user_info: { ... }
   *   } 
   * }
   * 
   * 注意事项：
   * 1. 需要验证验证码有效性
   * 2. 首次登录自动注册用户
   * 3. 返回JWT Token，需要保存到本地存储
   * 4. 需要处理Token过期时间
   */
  async onSubmitLogin() {
    // 验证表单
    const formData = {
      phone: this.data.phone.trim(),
      code: this.data.code.trim()
    }

    // 使用现有的表单验证器
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

    // 防止重复提交
    if (this.data.submitting) return
    this.setData({ submitting: true })

    try {
      let loginResult

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟登录
        console.log('🔧 模拟用户登录，手机号:', formData.phone)
        wx.showLoading({ title: '登录中...' })
        
        // 开发环境验证码检查（可选）
        if (formData.code !== '123456' && formData.code !== '000000') {
          throw new Error('验证码错误（开发环境请使用123456）')
        }
        
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        loginResult = {
          code: 0,
          msg: '登录成功',
          data: {
            access_token: 'dev_access_token_' + Date.now(),
            refresh_token: 'dev_refresh_token_' + Date.now(),
            expires_in: 7200,
            user_info: {
              user_id: 1001,
              phone: formData.phone,
              nickname: '测试用户',
              avatar: 'https://via.placeholder.com/100x100/4ECDC4/ffffff?text=用户',
              total_points: 1500,
              is_merchant: false,
              created_at: new Date().toISOString()
            }
          }
        }
        
      } else {
        // 生产环境调用真实登录接口
        console.log('📡 请求登录接口，手机号:', formData.phone)
        wx.showLoading({ title: '登录中...' })
        
        loginResult = await authAPI.login(formData.phone, formData.code)
        console.log('✅ 登录接口调用成功')
      }

      wx.hideLoading()

      // 保存登录信息到全局状态
      app.globalData.isLoggedIn = true
      app.globalData.accessToken = loginResult.data.access_token
      app.globalData.refreshToken = loginResult.data.refresh_token
      app.globalData.userInfo = loginResult.data.user_info
      app.globalData.tokenExpireTime = Date.now() + loginResult.data.expires_in * 1000

      // 保存到本地存储
      wx.setStorageSync('access_token', loginResult.data.access_token)
      wx.setStorageSync('refresh_token', loginResult.data.refresh_token)
      wx.setStorageSync('token_expire_time', app.globalData.tokenExpireTime)
      wx.setStorageSync('user_info', loginResult.data.user_info)

      console.log('💾 用户信息已保存到本地存储')

      wx.showToast({
        title: '登录成功',
        icon: 'success'
      })

      // 登录成功后跳转到首页
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/lottery/lottery'
        })
      }, 1500)

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 登录失败:', error)
      
      let errorMsg = '登录失败，请重试'
      
      // 根据错误码显示不同的错误信息
      switch (error.code) {
        case 1001:
          errorMsg = '手机号格式不正确'
          break
        case 1002:
          errorMsg = '验证码错误'
          break
        case 1003:
          errorMsg = '验证码已过期，请重新获取'
          break
        case 1004:
          errorMsg = '用户已被禁用，请联系客服'
          break
        default:
          errorMsg = error.message || error.msg || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
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