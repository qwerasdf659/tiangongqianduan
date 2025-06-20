// components/auth-modal/auth-modal.js - 权限验证弹窗组件逻辑
const app = getApp()

Component({
  properties: {
    // 是否显示弹窗
    visible: {
      type: Boolean,
      value: false
    },
    // 弹窗标题
    title: {
      type: String,
      value: '身份验证'
    },
    // 是否首次使用
    isFirstUse: {
      type: Boolean,
      value: false
    }
  },

  data: {
    // 验证方式：phone（手机验证码）、password（密码）
    authType: 'phone',
    
    // 手机验证相关
    phoneNumber: '',
    verificationCode: '',
    codeSending: false,
    countdown: 0,
    countdownTimer: null,
    
    // 密码验证相关
    username: '',
    password: '',
    showPassword: false,
    
    // 提交状态
    submitting: false
  },

  observers: {
    'visible': function(visible) {
      if (visible) {
        // 弹窗显示时初始化数据
        this.initData()
      } else {
        // 弹窗隐藏时清理数据
        this.clearData()
      }
    }
  },

  computed: {
    // 是否可以提交
    canSubmit() {
      const { authType, phoneNumber, verificationCode, username, password } = this.data
      
      if (authType === 'phone') {
        return phoneNumber.length === 11 && verificationCode.length === 6
      } else {
        return username.trim() && password.trim()
      }
    }
  },

  methods: {
    /**
     * 初始化数据
     */
    initData() {
      // 如果用户已有手机号，自动填入
      const userInfo = app.globalData.userInfo || app.globalData.mockUser
      if (userInfo && userInfo.phone) {
        this.setData({
          phoneNumber: userInfo.phone
        })
      }
      
      // 首次使用默认选择手机验证
      if (this.data.isFirstUse) {
        this.setData({
          authType: 'phone'
        })
      }
    },

    /**
     * 清理数据
     */
    clearData() {
      this.setData({
        phoneNumber: '',
        verificationCode: '',
        username: '',
        password: '',
        showPassword: false,
        submitting: false
      })
      
      // 清除倒计时
      if (this.data.countdownTimer) {
        clearInterval(this.data.countdownTimer)
        this.setData({
          countdown: 0,
          countdownTimer: null
        })
      }
    },

    /**
     * 切换验证方式
     */
    onAuthTypeChange(e) {
      const type = e.currentTarget.dataset.type
      this.setData({
        authType: type
      })
    },

    /**
     * 手机号输入
     */
    onPhoneInput(e) {
      this.setData({
        phoneNumber: e.detail.value
      })
    },

    /**
     * 验证码输入
     */
    onCodeInput(e) {
      this.setData({
        verificationCode: e.detail.value
      })
    },

    /**
     * 账号输入
     */
    onUsernameInput(e) {
      this.setData({
        username: e.detail.value
      })
    },

    /**
     * 密码输入
     */
    onPasswordInput(e) {
      this.setData({
        password: e.detail.value
      })
    },

    /**
     * 切换密码显示/隐藏
     */
    onTogglePassword() {
      this.setData({
        showPassword: !this.data.showPassword
      })
    },

    /**
     * 发送验证码
     */
    onSendCode() {
      const phoneNumber = this.data.phoneNumber.trim()
      
      if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
        this.showError('请输入正确的手机号码')
        return
      }

      if (this.data.countdown > 0) {
        return
      }

      this.setData({ sendingCode: true })

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟发送
        console.log('🔧 模拟发送验证码到:', phoneNumber)
        
        new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
          this.setData({
            sendingCode: false,
            countdown: 60,
            verificationCode: '123456' // 开发环境自动填入测试验证码
          })
          this.startCountdown()
          
          wx.showToast({
            title: '验证码已发送（测试：123456）',
            icon: 'success'
          })
        }).catch((error) => {
          this.setData({ sendingCode: false })
          this.showError('发送失败，请重试')
        })
      } else {
        authAPI.sendSmsCode(phoneNumber).then(() => {
          this.setData({
            sendingCode: false,
            countdown: 60
          })
          this.startCountdown()
          
          wx.showToast({
            title: '验证码已发送',
            icon: 'success'
          })
        }).catch((error) => {
          this.setData({ sendingCode: false })
          this.showError(error.msg || '发送验证码失败')
        })
      }
    },

    /**
     * 开始倒计时
     */
    startCountdown() {
      let countdown = 60
      this.setData({ countdown })

      const timer = setInterval(() => {
        countdown--
        if (countdown <= 0) {
          clearInterval(timer)
          this.setData({
            countdown: 0,
            countdownTimer: null
          })
        } else {
          this.setData({ countdown })
        }
      }, 1000)

      this.setData({ countdownTimer: timer })
    },

    /**
     * 忘记密码
     */
    onForgotPassword() {
      wx.showModal({
        title: '忘记密码',
        content: '请联系客服或使用手机验证码登录',
        showCancel: false
      })
    },

    /**
     * 确认验证
     */
    onConfirm() {
      if (this.data.verifying) return

      this.setData({ verifying: true })
      
      let verifyPromise
      
      if (this.data.verifyType === 'phone') {
        verifyPromise = this.verifyByPhone()
      } else {
        verifyPromise = this.verifyByPassword()
      }

      verifyPromise.then((result) => {
        this.setData({ verifying: false })
        
        if (result.success) {
          this.triggerEvent('success', result)
          this.hideModal()
        } else {
          this.showError(result.error || '验证失败')
        }
      }).catch((error) => {
        this.setData({ verifying: false })
        this.showError(error.msg || '验证失败，请重试')
      })
    },

    /**
     * 手机验证码验证
     */
    verifyByPhone() {
      const phoneNumber = this.data.phoneNumber.trim()
      const verificationCode = this.data.verificationCode.trim()

      if (!phoneNumber || !/^1[3-9]\d{9}$/.test(phoneNumber)) {
        this.showError('请输入正确的手机号码')
        return Promise.reject(new Error('手机号格式错误'))
      }

      if (!verificationCode || verificationCode.length !== 6) {
        this.showError('请输入6位验证码')
        return Promise.reject(new Error('验证码格式错误'))
      }

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟验证
        console.log('🔧 模拟手机验证码验证')
        
        return new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
          if (verificationCode === '123456') {
            return {
              success: true,
              data: {
                phone: phoneNumber,
                verified: true,
                method: 'phone'
              }
            }
          } else {
            return {
              success: false,
              error: '验证码错误（开发环境请使用123456）'
            }
          }
        })
      } else {
        return authAPI.verifySmsCode(phoneNumber, verificationCode).then((result) => {
          if (result.code === 0) {
            return {
              success: true,
              data: result.data
            }
          } else {
            return {
              success: false,
              error: result.msg || '验证失败'
            }
          }
        })
      }
    },

    /**
     * 密码验证
     */
    verifyByPassword() {
      const username = this.data.username.trim()
      const password = this.data.password.trim()

      if (!username) {
        this.showError('请输入用户名')
        return Promise.reject(new Error('用户名不能为空'))
      }

      if (!password) {
        this.showError('请输入密码')
        return Promise.reject(new Error('密码不能为空'))
      }

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟验证
        console.log('🔧 模拟密码验证')
        
        return new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
          if (username === 'admin' && password === '123456') {
            return {
              success: true,
              data: {
                username: username,
                verified: true,
                method: 'password'
              }
            }
          } else {
            return {
              success: false,
              error: '用户名或密码错误'
            }
          }
        })
      } else {
        return authAPI.login(username, password).then((result) => {
          if (result.code === 0) {
            return {
              success: true,
              data: result.data
            }
          } else {
            return {
              success: false,
              error: result.msg || '验证失败'
            }
          }
        })
      }
    },

    /**
     * 取消/关闭
     */
    onCancel() {
      this.triggerEvent('cancel')
      this.clearData()
    }
  },

  lifetimes: {
    detached() {
      // 组件销毁时清理倒计时
      if (this.data.countdownTimer) {
        clearInterval(this.data.countdownTimer)
      }
    }
  }
}) 