// components/login-popup/login-popup.ts - 登录弹窗组件

const { API, Wechat, Utils, Logger, ImageHelper } = require('../../utils/index')
const log = Logger.createLogger('login-popup')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')
const { getSecurityConfig, getCurrentEnv } = require('../../config/env')

// JWT解析（B1：Token 仅承载身份，只校验有效性 + 取 user_id/iat/exp，不再读 mobile/role_level）
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
    iat: payload.iat,
    exp: payload.exp,
    user_id: payload.user_id
  }
}

// 构建用户信息对象
// 角色/状态/资料一律取自登录响应体 user{}（后端权威下发），不从 JWT 解码（B1）
function buildUserInfoObject(rawUserInfo: any, jwtData: any) {
  if (!rawUserInfo) {
    throw new Error('用户信息为空')
  }
  return {
    user_id: rawUserInfo.user_id,
    mobile: rawUserInfo.mobile,
    nickname: rawUserInfo.nickname,
    status: rawUserInfo.status || 'active',
    user_role: rawUserInfo.user_role || 'user',
    role_level: rawUserInfo.role_level || 0,
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

  lifetimes: {
    // 组件挂载时注册隐私授权监听：隐私接口触发授权需求时改由本弹窗内的「同意」按钮处理，
    // 不再弹出微信官方「用户隐私保护提示」独立弹窗，实现隐私授权与登录弹窗合并（对齐主流小程序体验）
    attached(this: any) {
      if (wx.onNeedPrivacyAuthorization) {
        wx.onNeedPrivacyAuthorization((resolve: any) => {
          // 暂存 resolve，等用户在本弹窗点「同意」(open-type=agreePrivacyAuthorization) 后再放行
          this._privacyResolve = resolve
        })
      }
    },
    detached(this: any) {
      this._privacyResolve = null
    }
  },

  data: {
    mode: 'wechat' as 'wechat' | 'sms',
    /** 隐私协议勾选态：默认 false，用户须主动勾选才能登录（《个人信息保护法》第14条：自愿、明确同意） */
    agreementChecked: false,
    mobile: '',
    verificationCode: '',
    loggingType: '' as '' | 'sms' | 'wechat',
    loginCompleted: false,
    sending: false,
    countdown: 0,
    /** 腾讯云天御验证码 CaptchaAppId（取自 config/env，须与后端 CAPTCHA_APP_ID 一致） */
    captchaAppId: getSecurityConfig().captchaAppId
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

    /**
     * 点击右上角关闭按钮 — 显著有效的「取消登录」入口（微信审核合规：登录环节须提供
     * 可取消/拒绝/返回按钮，不得强制用户必须登录）。登录请求进行中时不可关闭，避免中断登录态写入。
     */
    onCloseTap() {
      if (this.data.loggingType) {
        return
      }
      this.onClose()
    },

    // 关闭弹窗
    onClose() {
      this.setData({
        mode: 'wechat',
        loggingType: '',
        loginCompleted: false,
        agreementChecked: false
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

    // 同意协议并完成微信隐私授权（绑定在 open-type=agreePrivacyAuthorization 的按钮上）
    // 微信会先校验该按钮被真实点击，再触发本回调；此处同步勾选态并放行 pending 中的隐私接口
    onAgreePrivacy(this: any, e: any) {
      this.setData({ agreementChecked: true })
      if (this._privacyResolve) {
        // buttonId 取实际被点击的按钮 id（区分微信/验证码两个视图），event:'agree' 放行原隐私接口继续执行
        const buttonId = e?.currentTarget?.id || 'agree-privacy-btn-wechat'
        this._privacyResolve({ buttonId, event: 'agree' })
        this._privacyResolve = null
      }
    },

    // 查看协议（type: user_agreement 用户协议 / privacy_policy 隐私政策）
    onViewAgreement(e: any) {
      const type = e?.currentTarget?.dataset?.type || 'user_agreement'
      wx.navigateTo({ url: `/packageUser/agreement/agreement?type=${type}` })
    },

    // 手机号输入
    onMobileInput(e: any) {
      this.setData({ mobile: e.detail.value })
    },

    // 验证码输入
    onCodeInput(e: any) {
      this.setData({ verificationCode: e.detail.value })
    },

    // 发送验证码（生产环境先过腾讯云天御人机验证，非生产直接发码）
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
      if (sending || countdown > 0) {
        return
      }

      // 生产环境：先弹天御验证码，回调拿 ticket 后再发码；非生产：后端放行，直接发码
      if (getCurrentEnv() === 'production') {
        const captcha = this.selectComponent('#captcha')
        if (!captcha) {
          log.error('天御验证码组件未就绪，无法发起人机验证')
          Wechat.showToast('验证码组件加载失败，请重试')
          return
        }
        this.setData({ sending: true })
        captcha.show()
        return
      }

      this._doSendCode()
    },

    // 天御验证成功回调（小程序插件仅返回 ticket，无 randstr）
    onCaptchaVerify(e: any) {
      const detail = e?.detail || (e?.mp && e.mp.detail) || {}
      if (detail.ret === 0 && detail.ticket) {
        this._doSendCode(detail.ticket)
      } else {
        this.setData({ sending: false })
        log.warn('天御验证未通过', detail)
        Wechat.showToast('请完成人机验证')
      }
    },

    // 天御验证组件异常回调
    onCaptchaError(e: any) {
      this.setData({ sending: false })
      log.error('天御验证码加载失败:', e?.detail)
      Wechat.showToast('人机验证加载失败，请重试')
    },

    // 实际调用发码接口（captchaTicket 仅生产环境从天御回调获得）
    _doSendCode(captchaTicket?: string) {
      this.setData({ sending: true })
      API.sendVerificationCode(this.data.mobile, captchaTicket)
        .then((result: any) => {
          this.setData({ sending: false })
          const data = result.data || {}
          // 后端如实下发短信发送结果：sms_sent=false 表示验证码已生成但短信未真正发出
          if (result.success && data.sms_sent === false) {
            Wechat.showToast(result.message || '短信下发失败，请稍后重试')
            // 短信未发出，不启动倒计时，允许用户立即重试
            return
          }
          if (result.success) {
            wx.showToast({ title: '验证码已发送', icon: 'success' })
            // 倒计时秒数以后端 cooldown_seconds 为准，缺省回退 60（不写死业务值）
            this.startCountdown(data.cooldown_seconds)
          } else {
            Wechat.showToast(result.message || '发送失败')
          }
        })
        .catch((error: any) => {
          this.setData({ sending: false })
          this._handleSendCodeError(error)
        })
    },

    // 发码错误按后端业务码精细提示
    _handleSendCodeError(error: any) {
      log.error('发送验证码失败:', error)
      const code = error && error.code
      const errData = (error && error.data) || {}
      // 天御票据校验失败：重置验证码，引导用户重新完成人机验证
      if (code === 'CAPTCHA_FAILED') {
        const captcha = this.selectComponent('#captcha')
        if (captcha) {
          captcha.refresh()
        }
        Wechat.showToast('人机验证失败，请重新完成验证')
        return
      }
      // 60s 冷却内重复发码：按后端剩余秒数提示
      if (code === 'SMS_RATE_LIMIT') {
        const remain = errData.remaining_seconds
        Wechat.showToast(
          remain ? `请 ${remain} 秒后再获取验证码` : '验证码发送过于频繁，请稍后再试'
        )
        return
      }
      // 当日发送达上限
      if (code === 'SMS_DAILY_LIMIT') {
        Wechat.showToast('今日验证码发送次数已达上限，请明天再试')
        return
      }
      Wechat.showToast(error?.message || '发送失败，请重试')
    },

    // 倒计时（秒数以后端 cooldown_seconds 为准，缺省 60）
    startCountdown(cooldownSeconds?: number) {
      const seconds =
        typeof cooldownSeconds === 'number' && cooldownSeconds > 0 ? cooldownSeconds : 60
      this.setData({ countdown: seconds })
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
      const { errMsg, errno } = e.detail || {}
      if (errMsg !== 'getPhoneNumber:ok') {
        // errno=112：手机号未在《用户隐私保护指引》中声明，组件被微信直接禁用（平台后台配置问题）
        // errno=104：用户在隐私授权弹窗中拒绝同意隐私协议
        // errno=103：用户在隐私授权弹窗中点击「拒绝」
        // 这三类均为隐私授权链路问题，记录真实 errno 便于真机 vConsole 定位
        if (errno === 112) {
          log.error('手机号未在隐私保护指引中声明(errno=112)，需在微信公众平台补充声明', e.detail)
          Wechat.showToast('一键登录暂不可用，请用验证码登录')
          this.setData({ mode: 'sms' })
          return
        }
        // 用户主动拒绝（授权弹窗 user deny / 隐私协议 errno=103/104）
        if ((errMsg && errMsg.indexOf('user deny') !== -1) || errno === 103 || errno === 104) {
          Wechat.showToast('需要授权手机号才能登录')
          return
        }
        // 其他失败：完整记录真实 errMsg/errno，降级到验证码登录保证业务可用
        log.error('获取手机号授权失败', { errMsg, errno })
        Wechat.showToast('获取手机号失败，请用验证码登录')
        this.setData({ mode: 'sms' })
        return
      }
      if (this.data.loggingType || this.data.loginCompleted) {
        return
      }
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
            this.handleLoginFailure('登录凭证获取失败')
            return
          }
          API.wxCodeLogin(res.code, phoneCode)
            .then((result: any) => {
              clearTimeout(loginTimeout)
              if (this.data.loginCompleted) {
                return
              }
              if (result && result.success === true) {
                this.handleLoginSuccess(result)
              } else {
                this.handleLoginFailure(result?.message || '登录失败')
              }
            })
            .catch((error: any) => {
              clearTimeout(loginTimeout)
              if (this.data.loginCompleted) {
                return
              }
              log.error('微信一键登录失败:', error)
              this.handleLoginFailure('登录失败，请重试')
            })
        },
        fail: () => {
          clearTimeout(loginTimeout)
          this.handleLoginFailure('登录失败')
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
      if (this.data.loggingType || this.data.loginCompleted) {
        return
      }

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
          if (this.data.loginCompleted) {
            return
          }
          if (result && result.success === true) {
            this.handleLoginSuccess(result)
          } else {
            this.handleLoginFailure(result?.message || '登录失败')
          }
        })
        .catch((error: any) => {
          clearTimeout(loginTimeout)
          if (this.data.loginCompleted) {
            return
          }
          log.error('验证码登录失败:', error)
          // 按后端业务码区分文案：过期 vs 输错（O3）
          if (error && error.code === 'VERIFICATION_CODE_EXPIRED') {
            this.handleLoginFailure('验证码已过期，请重新获取')
          } else if (error && error.code === 'INVALID_VERIFICATION_CODE') {
            this.handleLoginFailure('验证码错误，请重新输入')
          } else {
            this.handleLoginFailure(error?.message || '登录失败，请重试')
          }
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
        } catch (_e) {
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
