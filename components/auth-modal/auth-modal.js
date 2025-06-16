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
    async onSendCode() {
      const { phoneNumber } = this.data
      
      // 验证手机号
      if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
        wx.showToast({
          title: '请输入正确的手机号',
          icon: 'none'
        })
        return
      }

      this.setData({ codeSending: true })

      try {
        if (app.globalData.isDev) {
          // 开发环境模拟发送验证码
          console.log('🔧 模拟发送验证码到:', phoneNumber)
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          wx.showToast({
            title: '验证码已发送',
            icon: 'success'
          })
          
          // 开发模式下自动填入验证码
          this.setData({
            verificationCode: '123456'
          })
          
        } else {
          // 生产环境调用真实接口
          const { authAPI } = require('../../utils/api')
          await authAPI.sendSmsCode(phoneNumber)
          
          wx.showToast({
            title: '验证码已发送',
            icon: 'success'
          })
        }

        // 开始倒计时
        this.startCountdown()

      } catch (error) {
        console.error('发送验证码失败:', error)
        wx.showToast({
          title: error.message || '发送失败，请重试',
          icon: 'none'
        })
      } finally {
        this.setData({ codeSending: false })
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
    async onConfirm() {
      if (!this.canSubmit() || this.data.submitting) return

      this.setData({ submitting: true })

      try {
        const { authType } = this.data
        let result

        if (authType === 'phone') {
          result = await this.verifyByPhone()
        } else {
          result = await this.verifyByPassword()
        }

        // 验证成功
        this.triggerEvent('success', {
          authType,
          result,
          phoneNumber: this.data.phoneNumber
        })

        // 关闭弹窗
        this.onCancel()

      } catch (error) {
        console.error('验证失败:', error)
        wx.showToast({
          title: error.message || '验证失败，请重试',
          icon: 'none'
        })
      } finally {
        this.setData({ submitting: false })
      }
    },

    /**
     * 手机验证码验证
     */
    async verifyByPhone() {
      const { phoneNumber, verificationCode } = this.data

      if (app.globalData.isDev) {
        // 开发环境模拟验证
        console.log('🔧 模拟手机验证码验证:', phoneNumber, verificationCode)
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        if (verificationCode !== '123456') {
          throw new Error('验证码错误')
        }
        
        return {
          success: true,
          phone: phoneNumber,
          verified: true
        }
        
      } else {
        // 生产环境调用真实接口
        const { authAPI } = require('../../utils/api')
        return await authAPI.verifySmsCode(phoneNumber, verificationCode)
      }
    },

    /**
     * 密码验证
     */
    async verifyByPassword() {
      const { username, password } = this.data

      if (app.globalData.isDev) {
        // 开发环境模拟验证
        console.log('🔧 模拟密码验证:', username, password)
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // 简单的演示验证逻辑
        if (username === 'admin' && password === '123456') {
          return {
            success: true,
            username,
            verified: true
          }
        } else {
          throw new Error('账号或密码错误')
        }
        
      } else {
        // 生产环境调用真实接口
        const { authAPI } = require('../../utils/api')
        return await authAPI.login(username, password)
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