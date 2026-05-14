// components/login-popup/login-popup.ts - 登录弹窗组件

const {
  API,
  Validation,
  Wechat,
  Utils,
  Logger,
  ImageHelper
} = require('../../utils/index')
const log = Logger.createLogger('login-popup')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

// JWT解析
function parseAndValidateJWT(accessToken: string) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Token格式错误')
  }
  const tokenParts = accessToken.split('.')
  if (tokenParts.length !== 3) {
    throw new Error('JWT格式无效')
  }
  const { decodeJWTPayload } = Utils
  const payload = decodeJWTPayload(accessToken)
  const now = Math.floor(Date.now() / 1000)
  if (payload.exp && payload.exp < now) {
    throw new Error('Token已过期')
  }
  return {
    user_role: payload.user_role || 'user',
    role_level: payload.role_level || 0,
    iat: payload.iat,
    exp: payload.exp,
    user_id: payload.user_id
  }
}

// 构建用户信息对象
function buildUserInfoObject(rawUserInfo: any, jwtData: any) {
  if (!rawUserInfo) throw new Error('用户信息为空')
  return {
    user_id: rawUserInfo.user_id,
    mobile: rawUserInfo.mobile,
    nickname: rawUserInfo.nickname,
    status: rawUserInfo.status || 'active',
    user_role: jwtData.user_role,
    role_level: jwtData.role_level,
    iat: jwtData.iat,
    exp: jwtData.exp,
    avatar_url: rawUserInfo.avatar_url || ImageHelper.DEFAULT_AVATAR,
    points: parseInt(rawUserInfo.points || 0),
    last_login: rawUserInfo.last_login
  }
}

Component({
  properties: {
    visible: {
      type: Boolean,
      value: false
    }
  },

  data: {
    mode: 'wechat' as 'wechat' | 'sms',
    agreementChecked: true,
    mobile: '',
    verificationCode: '',
    loggingType: '' as '' | 'sms' | 'wechat',
    loginCompleted: false,
    sending: false,
    countdown: 0
  },

  methods: {
    // 阻止滚动穿透
    preventScroll() {},

    // 阻止事件冒泡到遮罩层
    preventBubble() {},

    // 点击遮罩关闭
    onMaskTap() {
      if (!this.data.loggingType) {
        this.onClose()
      }
    },

    // 关闭弹窗
    onClose() {
      this.setData({
        mode: 'wechat',
        loggingType: '',
        loginCompleted: false
      })
      this.triggerEvent('close')
    },

    // 切换到验证码登录
    onSwitchToSms() {
      this.setData({ mode: 'sms' })
    },

    // 切换回微信登录
    onSwitchToWechat() {
      this.setData({ mode: 'wechat' })
    },

    // 勾选协议
    onToggleAgreement() {
      this.setData({ agreementChecked: !this.data.agreementChecked })
    },

    // 查看用户协议
    onViewAgreement() {
      wx.navigateTo({ url: '/packageUser/agreement/agreement' })
    },

    // 手机号输入
    onMobileInput(e: any) {
      this.setData({ mobile: e.detail.value })
    },

    // 验证码输入
    onCodeInput(e: any) {
      this.setData({ verificationCode: e.detail.value })
    },

    // 发送验证码
    onSendCode() {
      const { mobile, sending, countdown } = this.data
      if (!mobile) {
        Wechat.showToast('请输入手机号')
        return
      }
      if (!/^1[3-9]\d{9}$/.test(mobile)) {
        Wechat.showToast('请输入正确的手机号')
        return
      }
      if (sending || countdown > 0) return

      this.setData({ sending: true })

      API.sendVerificationCode(mobile)
        .then((result: any) => {
          this.setData({ sending: false })
          if (result.success) {
            wx.showToast({ title: '验证码已发送', icon: 'success' })
            this.startCountdown()
          } else {
            Wechat.showToast(result.message || '发送失败')
          }
        })
        .catch((error: any) => {
          this.setData({ sending: false })
          log.error('发送验证码失败:', error)
          Wechat.showToast('发送失败，请重试')
        })
    },

    // 倒计时
    startCountdown() {
      this.setData({ countdown: 60 })
      const timer = setInterval(() => {
        if (this.data.countdown <= 1) {
          clearInterval(timer)
          this.setData({ countdown: 0 })
        } else {
          this.setData({ countdown: this.data.countdown - 1 })
        }
      }, 1000)
    },

    // ========== 微信一键登录 ==========
    onGetPhoneNumber(e: any) {
      if (e.detail.errMsg !== 'getPhoneNumber:ok') {
        Wechat.showToast('需要授权手机号才能登录')
        return
      }
      if (this.data.loggingType || this.data.loginCompleted) return
      if (!this.data.agreementChecked) {
        Wechat.showToast('请同意用户协议')
        return
      }

      const phoneCode = e.detail.code
      if (!phoneCode) {
        Wechat.showToast('获取手机号失败，请重试')
        return
      }

      this.setData({ loggingType: 'wechat', loginCompleted: false })

      const loginTimeout = setTimeout(() => {
        if (!this.data.loginCompleted) {
          this.setData({ loggingType: '' })
          Wechat.showToast('登录超时，请重试')
        }
      }, 15000)

      wx.login({
        success: res => {
          if (!res.code) {
            clearTimeout(loginTimeout)
            this.handleLoginFailure('微信登录凭证获取失败')
            return
          }
          API.wxCodeLogin(res.code, phoneCode)
            .then((result: any) => {
              clearTimeout(loginTimeout)
              if (this.data.loginCompleted) return
              if (result && result.success === true) {
                this.handleLoginSuccess(result)
              } else {
                this.handleLoginFailure(result?.message || '登录失败')
              }
            })
            .catch((error: any) => {
              clearTimeout(loginTimeout)
              if (this.data.loginCompleted) return
              log.error('微信一键登录失败:', error)
              this.handleLoginFailure('登录失败，请重试')
            })
        },
        fail: () => {
          clearTimeout(loginTimeout)
          this.handleLoginFailure('微信登录失败')
        }
      })
    },

    // ========== 验证码登录 ==========
    onSmsLogin() {
      const { mobile, verificationCode, agreementChecked } = this.data
      if (!mobile) {
        Wechat.showToast('请输入手机号')
        return
      }
      if (!/^1[3-9]\d{9}$/.test(mobile)) {
        Wechat.showToast('请输入正确的手机号')
        return
      }
      if (!verificationCode || verificationCode.length !== 6) {
        Wechat.showToast('请输入6位验证码')
        return
      }
      if (!agreementChecked) {
        Wechat.showToast('请同意用户协议')
        return
      }
      if (this.data.loggingType || this.data.loginCompleted) return

      this.setData({ loggingType: 'sms', loginCompleted: false })

      const loginTimeout = setTimeout(() => {
        if (!this.data.loginCompleted) {
          this.setData({ loggingType: '' })
          Wechat.showToast('登录超时，请重试')
        }
      }, 15000)

      API.userLogin(mobile, verificationCode)
        .then((result: any) => {
          clearTimeout(loginTimeout)
          if (this.data.loginCompleted) return
          if (result && result.success === true) {
            this.handleLoginSuccess(result)
          } else {
            this.handleLoginFailure(result?.message || '登录失败')
          }
        })
        .catch((error: any) => {
          clearTimeout(loginTimeout)
          if (this.data.loginCompleted) return
          log.error('验证码登录失败:', error)
          this.handleLoginFailure('登录失败，请重试')
        })
    },

    // ========== 登录成功处理 ==========
    async handleLoginSuccess(loginData: any) {
      if (!loginData?.data) {
        this.handleLoginFailure('登录数据格式错误')
        return
      }

      this.setData({ loginCompleted: true })

      try {
        const responseData = loginData.data

        // 微信未绑定手机号的情况 → 切换到验证码模式让用户绑定
        if (responseData.need_bind === true) {
          this.setData({ loggingType: '', mode: 'sms' })
          Wechat.showToast('请先绑定手机号')
          return
        }

        const accessToken = responseData.access_token
        const rawUserInfo = responseData.user
        if (!accessToken || !rawUserInfo) {
          throw new Error('登录响应缺少必要数据')
        }

        // 解析JWT
        const jwtData = parseAndValidateJWT(accessToken)
        // 构建用户信息
        const userInfo = buildUserInfoObject(rawUserInfo, jwtData)
        // 保存到Store
        const refreshToken = responseData.refresh_token || ''
        userStore.setLoginState(userInfo, accessToken, refreshToken)

        // 获取积分余额
        try {
          const balanceResult = await API.getPointsBalance()
          if (balanceResult?.success) {
            const availablePoints = balanceResult.data.available_amount || 0
            const frozenPoints = balanceResult.data.frozen_amount || 0
            pointsStore.setBalance(availablePoints, frozenPoints)
          }
        } catch (e) {
          log.warn('积分获取失败，不影响登录')
        }

        log.info('登录弹窗：登录成功')
        this.setData({ loggingType: '' })

        // 通知父页面登录成功
        this.triggerEvent('loginsuccess', { userInfo })

        // 关闭弹窗
        setTimeout(() => {
          this.triggerEvent('close')
        }, 300)
      } catch (error: any) {
        log.error('登录处理异常:', error)
        this.handleLoginFailure(error.message || '登录处理失败')
      }
    },

    // ========== 登录失败处理 ==========
    handleLoginFailure(message: string) {
      this.setData({
        loggingType: '',
        loginCompleted: false
      })
      Wechat.showToast(message || '登录失败，请重试')
    }
  }
})
