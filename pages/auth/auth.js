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
   * TODO: 后端对接 - 发送短信验证码接口
   * 
   * 对接说明：
   * 接口：POST /api/auth/send-code
   * 请求体：{ phone: "13800138000" }
   * 认证：无需认证（公开接口）
   * 返回：发送结果，成功时不返回验证码内容（安全考虑）
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

    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟发送验证码
      console.log('🔧 模拟发送验证码到:', phone)
      
      new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
        this.setData({ 
          sending: false,
          countdown: 60,
          code: '123456' // 开发环境自动填入测试验证码
        })
        
        // 开始倒计时
        this.startCountdown()
        
        wx.showToast({
          title: '验证码已发送（测试：123456）',
          icon: 'success'
        })
        
        console.log('✅ 模拟验证码发送成功，测试验证码: 123456')
      }).catch((error) => {
        this.setData({ sending: false })
        console.error('❌ 模拟发送验证码失败:', error)
        
        wx.showToast({
          title: '发送失败，请重试',
          icon: 'none'
        })
      })
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求发送验证码接口，手机号:', phone)
      
      authAPI.sendCode(phone).then((result) => {
        this.setData({ 
          sending: false,
          countdown: 60 
        })
        
        // 开始倒计时
        this.startCountdown()
        
        wx.showToast({
          title: '验证码已发送',
          icon: 'success'
        })
        
        console.log('✅ 验证码发送成功')
      }).catch((error) => {
        this.setData({ sending: false })
        console.error('❌ 发送验证码失败:', error)
        
        let errorMsg = '发送失败，请重试'
        
        switch (error.code) {
          case 1001:
            errorMsg = '手机号格式不正确'
            break
          case 1002:
            errorMsg = '发送过于频繁，请稍后再试'
            break
          case 1003:
            errorMsg = '今日发送次数已达上限'
            break
          case 1004:
            errorMsg = '短信服务暂时不可用'
            break
          default:
            errorMsg = error.msg || error.message || errorMsg
        }
        
        wx.showToast({
          title: errorMsg,
          icon: 'none'
        })
      })
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
   * TODO: 后端对接 - 用户登录接口
   * 
   * 对接说明：
   * 接口：POST /api/auth/login
   * 请求体：{ phone: "13800138000", code: "123456", nickname: "用户昵称" }
   * 认证：无需认证（公开接口）
   * 返回：登录结果，包括用户信息和access_token
   */
  onSubmitLogin() {
    // 表单验证
    const { phone, code, nickname } = this.data
    
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
    
    if (!nickname.trim()) {
      wx.showToast({
        title: '请输入昵称',
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
      code: code.trim(),
      nickname: nickname.trim()
    }

    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟登录
      console.log('🔧 模拟用户登录:', formData)
      
      new Promise(resolve => setTimeout(resolve, 1500)).then(() => {
        // 生成模拟用户数据
        const mockUser = {
          user_id: Date.now(),
          phone: formData.phone,
          nickname: formData.nickname,
          avatar: 'https://via.placeholder.com/100x100/FF6B35/ffffff?text=' + encodeURIComponent(formData.nickname.charAt(0)),
          total_points: 1500,
          is_merchant: false,
          is_vip: false,
          register_time: new Date().toISOString(),
          last_login_time: new Date().toISOString()
        }
        
        const loginResult = {
          code: 0,
          data: {
            user_info: mockUser,
            access_token: 'mock_token_' + Date.now(),
            refresh_token: 'mock_refresh_' + Date.now(),
            expires_in: 86400 // 24小时
          }
        }
        
        wx.hideLoading()
        
        // 保存用户信息到全局
        app.globalData.userInfo = mockUser
        app.globalData.mockUser = mockUser
        app.globalData.token = loginResult.data.access_token
        
        // 保存到本地存储
        try {
          wx.setStorageSync('userInfo', mockUser)
          wx.setStorageSync('token', loginResult.data.access_token)
        } catch (error) {
          console.warn('保存用户信息到本地失败:', error)
        }
        
        this.setData({ logging: false })
        
        wx.showToast({
          title: '登录成功！',
          icon: 'success'
        })
        
        console.log('✅ 模拟登录成功，用户ID:', mockUser.user_id)
        
        // 延迟跳转，让用户看到成功提示
        setTimeout(() => {
          // 跳转到主页或返回上一页
          const pages = getCurrentPages()
          if (pages.length > 1) {
            wx.navigateBack()
          } else {
            wx.redirectTo({ url: '/pages/lottery/lottery' })
          }
        }, 1500)
      }).catch((error) => {
        wx.hideLoading()
        this.setData({ logging: false })
        console.error('❌ 模拟登录失败:', error)
        
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        })
      })
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求登录接口:', { phone: formData.phone, nickname: formData.nickname })
      
      authAPI.login(formData.phone, formData.code).then((loginResult) => {
        wx.hideLoading()
        
        if (loginResult.code === 0) {
          console.log('✅ 登录成功，用户ID:', loginResult.data.user_info.user_id)
          
          // 保存用户信息到全局
          app.globalData.userInfo = loginResult.data.user_info
          app.globalData.token = loginResult.data.access_token
          
          // 保存到本地存储
          try {
            wx.setStorageSync('userInfo', loginResult.data.user_info)
            wx.setStorageSync('token', loginResult.data.access_token)
          } catch (error) {
            console.warn('保存用户信息到本地失败:', error)
          }
          
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
          throw new Error(loginResult.msg || '登录失败')
        }
      }).catch((error) => {
        wx.hideLoading()
        this.setData({ logging: false })
        console.error('❌ 登录失败:', error)
        
        let errorMsg = '登录失败，请重试'
        
        switch (error.code) {
          case 1001:
            errorMsg = '手机号不存在'
            break
          case 1002:
            errorMsg = '验证码错误或已过期'
            break
          case 1003:
            errorMsg = '验证码输入次数过多'
            break
          case 1004:
            errorMsg = '用户账号被禁用'
            break
          case 1005:
            errorMsg = '昵称包含敏感词汇'
            break
          default:
            errorMsg = error.msg || error.message || errorMsg
        }
        
        wx.showToast({
          title: errorMsg,
          icon: 'none'
        })
      })
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