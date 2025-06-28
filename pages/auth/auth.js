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
    
    // 🔐 管理员登录相关
    showAdminLogin: false,
    titleTapCount: 0,
    titleTapTimer: null,
    adminForm: {
      username: '',
      password: '',
      rememberLogin: false
    },
    adminFormErrors: {},
    showAdminPassword: false,
    adminSubmitting: false,
    adminLoginFailCount: 0,
    adminLockUntil: null
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
   * 🔴 发送验证码 - 开发阶段简化版（跳过真实短信验证）
   * 开发阶段：模拟验证码发送，不调用真实短信服务
   * 生产环境：调用真实短信接口 POST /api/auth/send-code
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

    console.log('📡 发送验证码 - 开发阶段模拟:', phone)
    
    // 🚧 开发阶段：直接模拟成功发送，不调用真实短信服务
    setTimeout(() => {
      this.setData({ sending: false })
      
      wx.showToast({
        title: '验证码已发送（模拟）',
        icon: 'success',
        duration: 1500
      })
      
      // 显示开发提示
      setTimeout(() => {
        wx.showModal({
          title: '开发阶段提示',
          content: '当前为开发模式，可使用任意6位数字作为验证码进行登录（如：123456）',
          showCancel: false,
          confirmText: '知道了'
        })
      }, 1500)
      
      // 启动倒计时
      this.startCountdown()
    }, 1000)
    
    // 🔮 生产环境代码（当前已注释）：
    // authAPI.sendCode(phone).then((result) => {
    //   console.log('✅ 验证码发送成功:', result)
    //   this.setData({ sending: false })
    //   wx.showToast({ title: '验证码已发送', icon: 'success' })
    //   this.startCountdown()
    // }).catch((error) => {
    //   console.error('❌ 验证码发送失败:', error)
    //   this.setData({ sending: false })
    //   let errorMsg = error.message || '验证码发送失败'
    //   wx.showToast({ title: errorMsg, icon: 'none', duration: 3000 })
    // })
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
        access_token: 'mock_token_' + Date.now(),
        refresh_token: 'mock_refresh_' + Date.now(),
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
    app.globalData.userInfo = app.globalData.mockUser
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
   * 标题点击事件 - 连续点击5次显示管理员登录入口
   */
  onTitleTap() {
    const now = Date.now()
    const lastTapTime = this.lastTitleTapTime || 0
    
    // 如果距离上次点击超过2秒，重置计数
    if (now - lastTapTime > 2000) {
      this.setData({ titleTapCount: 1 })
    } else {
      const newCount = this.data.titleTapCount + 1
      this.setData({ titleTapCount: newCount })
      
      // 连续点击5次，显示管理员登录入口
      if (newCount >= 5) {
        this.showAdminLoginEntry()
        this.setData({ titleTapCount: 0 })
        return
      }
    }
    
    this.lastTitleTapTime = now
    
    // 3秒后自动重置计数
    clearTimeout(this.titleTapTimer)
    this.titleTapTimer = setTimeout(() => {
      this.setData({ titleTapCount: 0 })
    }, 3000)
  },

  /**
   * 显示管理员登录入口
   */
  showAdminLoginEntry() {
    // 检查是否被锁定
    if (this.isAdminLocked()) {
      const lockTime = this.data.adminLockUntil
      const remainingTime = Math.ceil((lockTime - Date.now()) / 60000)
      
      wx.showModal({
        title: '管理员登录已锁定',
        content: `账号已被锁定，请 ${remainingTime} 分钟后重试`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    // 轻微震动反馈
    wx.vibrateShort({
      type: 'light'
    })
    
    // 显示管理员登录弹窗
    this.setData({ 
      showAdminLogin: true,
      // 重置表单
      adminForm: {
        username: '',
        password: '',
        rememberLogin: this.data.adminForm.rememberLogin
      },
      adminFormErrors: {},
      showAdminPassword: false
    })
    
    console.log('🔓 管理员登录入口已激活')
  },

  /**
   * 关闭管理员登录弹窗
   */
  onCloseAdminLogin() {
    this.setData({ showAdminLogin: false })
  },

  /**
   * 管理员用户名输入
   */
  onAdminUsernameInput(e) {
    this.setData({
      'adminForm.username': e.detail.value,
      'adminFormErrors.username': ''
    })
  },

  /**
   * 管理员密码输入
   */
  onAdminPasswordInput(e) {
    this.setData({
      'adminForm.password': e.detail.value,
      'adminFormErrors.password': ''
    })
  },

  /**
   * 切换密码显示/隐藏
   */
  onToggleAdminPassword() {
    this.setData({
      showAdminPassword: !this.data.showAdminPassword
    })
  },

  /**
   * 记住登录状态选择
   */
  onAdminRememberChange(e) {
    this.setData({
      'adminForm.rememberLogin': e.detail.value.includes('remember')
    })
  },

  /**
   * 检查管理员账号是否被锁定
   */
  isAdminLocked() {
    const lockUntil = this.data.adminLockUntil
    if (!lockUntil) return false
    
    const now = Date.now()
    if (now < lockUntil) {
      return true
    } else {
      // 锁定时间已过，重置失败计数
      this.setData({
        adminLoginFailCount: 0,
        adminLockUntil: null
      })
      return false
    }
  },

  /**
   * 🔐 管理员登录 - 开发阶段简化版（跳过短信二次验证）
   */
  onAdminLogin() {
    const { username, password } = this.data.adminForm
    
    // 表单验证
    let errors = {}
    
    if (!username.trim()) {
      errors.username = '请输入管理员账号'
    }
    
    if (!password.trim()) {
      errors.password = '请输入登录密码'
    } else if (password.length < 6) {
      errors.password = '密码长度至少6位'
    }
    
    if (Object.keys(errors).length > 0) {
      this.setData({ adminFormErrors: errors })
      return
    }

    // 检查是否被锁定
    if (this.isAdminLocked()) {
      const lockTime = this.data.adminLockUntil
      const remainingTime = Math.ceil((lockTime - Date.now()) / 60000)
      
      wx.showToast({
        title: `账号已锁定 ${remainingTime} 分钟`,
        icon: 'none',
        duration: 3000
      })
      return
    }

    // 防止重复提交
    if (this.data.adminSubmitting) {
      return
    }

    this.setData({ adminSubmitting: true })
    wx.showLoading({ title: '管理员登录中...' })

    console.log('🔐 管理员登录请求 - 开发阶段:', { username })

    // 🚧 开发阶段：模拟管理员登录验证
    setTimeout(() => {
      wx.hideLoading()
      this.setData({ adminSubmitting: false })
      
      // 模拟简单的账号密码验证（开发阶段）
      const mockAdminAccounts = [
        { username: 'admin', password: 'admin123', role: 'admin' },
        { username: 'superadmin', password: 'super123', role: 'super_admin' },
        { username: 'merchant', password: 'merchant123', role: 'merchant' }
      ]
      
      const adminAccount = mockAdminAccounts.find(
        acc => acc.username === username && acc.password === password
      )
      
      if (adminAccount) {
        // 登录成功
        console.log('✅ 管理员登录成功（开发模式）:', adminAccount)
        
        // 重置失败计数
        this.setData({
          adminLoginFailCount: 0,
          adminLockUntil: null
        })
        
        // 模拟管理员登录数据
        const mockAdminLoginData = {
          access_token: 'admin_token_' + Date.now(),
          refresh_token: 'admin_refresh_' + Date.now(),
          expires_in: 86400,
          token_type: 'Bearer',
          user_info: {
            user_id: 'admin_' + Date.now(),
            username: adminAccount.username,
            role: adminAccount.role,
            nickname: '管理员',
            avatar: '/images/default-avatar.png',
            is_admin: true,
            is_merchant: true, // 管理员也拥有商家权限
            permissions: ['lottery_control', 'review_uploads', 'user_management'],
            created_at: new Date().toISOString()
          }
        }
        
        // 使用app.js中的登录成功处理
        app.onLoginSuccess(mockAdminLoginData)
        
        // 关闭弹窗
        this.setData({ showAdminLogin: false })
        
        wx.showToast({
          title: '管理员登录成功',
          icon: 'success'
        })
        
        // 跳转到管理页面
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/merchant/merchant' })
        }, 1500)
        
      } else {
        // 登录失败
        const failCount = this.data.adminLoginFailCount + 1
        console.log(`❌ 管理员登录失败，第${failCount}次`)
        
        if (failCount >= 3) {
          // 锁定账号30分钟
          const lockUntil = Date.now() + 30 * 60 * 1000
          this.setData({
            adminLoginFailCount: failCount,
            adminLockUntil: lockUntil
          })
          
          wx.showModal({
            title: '账号已锁定',
            content: '登录失败3次，账号已锁定30分钟',
            showCancel: false,
            confirmText: '知道了'
          })
          
          // 关闭登录弹窗
          this.setData({ showAdminLogin: false })
          
        } else {
          // 显示失败提示
          this.setData({ adminLoginFailCount: failCount })
          
          wx.showToast({
            title: `账号或密码错误，还有${3-failCount}次机会`,
            icon: 'none',
            duration: 3000
          })
          
          // 清空密码
          this.setData({
            'adminForm.password': '',
            adminFormErrors: { password: '请重新输入密码' }
          })
        }
      }
      
    }, 1500) // 模拟网络延迟
    
    // 🔮 生产环境代码（当前已注释）：
    // adminAPI.login(username, password).then((result) => {
    //   // 处理登录成功逻辑
    // }).catch((error) => {
    //   // 处理登录失败逻辑
    // })
  }
})