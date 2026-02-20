// packageUser/auth/auth.ts - V4.0认证页面 + MobX响应式状态

// 🔴 统一工具函数导入
const { Utils, API, Validation, Wechat, Constants, Logger } = require('../../utils/index')
const log = Logger.createLogger('auth')
const { DELAY, API_CONFIG } = Constants
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

// ====== 方案B重构：子函数1 - JWT解析和验证 ======
/**
 * 解析并验证JWT Token
 * accessToken - JWT Token
 *
 * 复杂度：~10
 */
function parseAndValidateJWT(accessToken: string) {
  // JWT格式预检查
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Token格式错误：Token为空或类型不正确')
  }

  const tokenParts = accessToken.split('.')
  if (tokenParts.length !== 3) {
    throw new Error('JWT格式无效：应包含3个部分')
  }

  try {
    // 使用微信小程序专用的JWT解码方法
    const { decodeJWTPayload } = Utils
    const payload = decodeJWTPayload(accessToken)

    // 检查Token是否过期
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      const expiredMinutes = Math.floor((now - payload.exp) / 60)
      throw new Error(`Token已过期：${expiredMinutes}分钟前过期`)
    }

    // 返回权限信息（保持snake_case命名）
    // ⚠️ 后端 JWT 不含 is_admin，管理员判断统一使用 role_level >= 100
    return {
      user_role: payload.user_role || 'user',
      role_level: payload.role_level || 0,
      iat: payload.iat,
      exp: payload.exp,
      user_id: payload.user_id
    }
  } catch (error: any) {
    log.error('JWT解析失败:', error.message)
    throw error
  }
}

// ====== 方案B重构：子函数2 - 用户信息对象构建 ======
/**
 * 构建标准化的用户信息对象
 * rawUserInfo - 原始用户数据
 * jwtData - JWT解析数据
 *
 * 复杂度：~12
 */
function buildUserInfoObject(rawUserInfo: any, jwtData: any) {
  if (!rawUserInfo) {
    throw new Error('用户信息为空')
  }

  // 基础字段映射（使用snake_case）- V4.0严格按照API文档
  return {
    // 基础信息字段（API文档Line 1324-1340）
    user_id: rawUserInfo.user_id,
    mobile: rawUserInfo.mobile,
    nickname: rawUserInfo.nickname,
    status: rawUserInfo.status || 'active',

    // 权限字段（从JWT Token Payload提取，不含 is_admin）
    user_role: jwtData.user_role,
    role_level: jwtData.role_level,

    // Token时间信息
    iat: jwtData.iat,
    exp: jwtData.exp,

    // 其他可选字段（V4.0统一snake_case）
    avatar: rawUserInfo.avatar || '/images/default-avatar.png',
    // 积分应通过 GET /api/v4/assets/balance 获取，此处仅为登录响应中的快照值
    points: parseInt(rawUserInfo.points || 0),
    last_login: rawUserInfo.last_login
  }
}

// ====== 方案B重构：子函数3 - 存储操作封装 ======
/**
 * 保存认证数据到存储
 * accessToken - 访问Token
 * refreshToken - 刷新Token
 * userInfo - 用户信息
 *
 * 复杂度：~8
 */
function saveAuthDataToStorage(accessToken: string, refreshToken: string, userInfo: any) {
  // 设置 MobX Store 登录状态（Store 内部自动同步到 Storage）
  userStore.setLoginState(userInfo, accessToken, refreshToken || '')

  log.info('认证数据已保存到 MobX Store 和本地存储')
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 🔧 页面加载状态
    pageLoaded: false,
    initError: null,
    showErrorDetails: false,

    // 表单数据
    // 🔴 统一使用mobile字段名
    mobile: '',
    // 🔴 V4.0: 使用verification_code字段名
    verification_code: '',

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

    // 🔧 登录状态控制标志
    // 登录是否已完成（成功或失败）
    loginCompleted: false,
    // 超时处理是否已触发
    loginTimeoutTriggered: false,

    // 用户协议
    agreementChecked: true,
    showAgreement: false
  },

  /**
   * 生命周期函数--监听页面加载
   *
   * @description
   * 页面初始化，检查登录状态并设置超时保护。
   *
   * **初始化流程**：
   * 1. 设置5秒超时保护，防止页面永久loading
   * 2. 调用safeInitPage()进行安全初始化
   * 3. 捕获并处理初始化异常
   *
   * **安全保障**：
   * - 超时保护：5秒后强制完成加载
   * - 异常捕获：初始化失败时显示友好提示
   * - 状态恢复：检查现有登录状态
   *
   */
  onLoad() {
    log.info('V4.0认证页面开始加载 - 统一引擎架构')

    // 🆕 MobX Store绑定 - 登录成功后自动同步用户状态到Store
    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: ['setLoginState', 'clearLoginState']
    })

    // 🚨 立即修复：强制超时保护，防止页面永久loading
    setTimeout(() => {
      if (!this.data.pageLoaded) {
        log.warn(' 认证页面loading超时，强制设置为完成状态')
        this.setData({
          pageLoaded: true,
          initError: null
        })
      }
      // 强制超时保护（约5秒）
    }, API_CONFIG.TIMEOUT / 6)

    // 🔧 使用安全的初始化方法
    try {
      this.safeInitPage()
    } catch (error: any) {
      log.error('页面加载异常:', error)
      this.setData({
        pageLoaded: true,
        initError: '页面初始化异常：' + (error.message || error)
      })
    }
  },

  /**
   * 🔧 安全的页面初始化
   *
   * @description
   * 执行页面的安全初始化流程，包括环境检查、API初始化、表单验证器初始化等。
   *
   * **初始化步骤**：
   * 1. 设置页面加载状态
   * 2. 安全获取App实例
   * 3. 初始化API引用
   * 4. 初始化表单验证器
   * 5. 检查现有登录状态（已登录则自动跳转）
   * 6. 标记页面加载完成
   *
   * **V4.0规范**：
   * - 开发环境由后端控制万能验证码123456
   * - 前端不做数据模拟处理
   * - 完全依赖后端真实数据
   *
   */
  safeInitPage() {
    this.setData({
      pageLoaded: false,
      initError: null
    })

    try {
      // 🔧 安全获取app实例
      const appInstance = getApp()
      if (!appInstance) {
        throw new Error('App实例未初始化')
      }

      // V4.0规范：开发环境由后端控制万能验证码123456，前端不做数据模拟

      this.initAPIReferences()

      this.initFormValidator()

      const isLoggedIn = this.checkExistingLogin()

      if (!isLoggedIn) {
        this.setData({
          pageLoaded: true
        })
        log.info('认证页面初始化完成 - 显示登录表单')
      } else {
        log.info('检测到已登录状态，准备自动跳转...')
      }

      log.info('认证页面初始化完成 - V4.0统一认证')
    } catch (error) {
      log.error('页面初始化过程中出错:', error)
      this.handleInitError(error)
    }
  },

  /**
   * 🔧 初始化API引用
   */
  initAPIReferences() {
    try {
      // 🔴 使用顶部统一导入的API模块（utils/index.js统一入口）
      const { userLogin, sendVerificationCode } = API
      this.userLogin = userLogin
      this.sendVerificationCode = sendVerificationCode
      log.info('API引用初始化成功')
    } catch (error) {
      log.error('API引用初始化失败:', error)
      this.userLogin = () => Promise.reject(new Error('API未初始化'))
      this.sendVerificationCode = () => Promise.reject(new Error('API未初始化'))
      throw new Error('API模块加载失败: ' + (error as any).message)
    }
  },

  /**
   * 🔧 初始化表单验证器
   */
  initFormValidator() {
    try {
      // 🔴 使用顶部统一导入的Validation模块
      const { FormValidator, commonRules } = Validation

      this.formValidator = new FormValidator({
        mobile: [commonRules.required('手机号不能为空'), commonRules.mobile('请输入正确的手机号')],
        verification_code: [
          commonRules.required('验证码不能为空'),
          commonRules.length(6, '验证码必须是6位数字')
        ]
      })

      log.info('表单验证器初始化成功')
    } catch (error) {
      log.error('表单验证器初始化失败:', error)
      this.formValidator = {
        validate: () => ({ isValid: true, errors: {} })
      }
    }
  },

  /**
   * 🔧 检查现有登录状态
   */
  checkExistingLogin() {
    try {
      const app = getApp()
      if (!app || !app.globalData) {
        log.warn('App实例不可用，跳过登录状态检查')
        return false
      }

      // 从 MobX Store 或 Storage 检查已有登录状态
      const token = userStore.accessToken || wx.getStorageSync('access_token')
      const userInfo = userStore.userInfo || wx.getStorageSync('user_info')

      log.info('检查现有登录状态:', {
        hasToken: !!token,
        hasUserInfo: !!userInfo,
        tokenPreview: token ? token.substring(0, 20) + '...' : 'NO_TOKEN',
        userNickname: (userInfo && userInfo.nickname) || 'NO_USER'
      })

      if (token && userInfo) {
        log.info('检测到已有登录状态，验证Token有效性...')

        if (!userStore.isLoggedIn) {
          userStore.setLoginState(userInfo, token, wx.getStorageSync('refresh_token') || '')
        }

        // 🔴 增强：Token有效性验证，包含过期检查
        // 不在这里设置pageLoaded，让页面保持loading状态直到跳转完成
        this.validateTokenAndRedirect(token, userInfo)
        return true
      } else {
        log.info('未检测到有效的登录状态，显示登录表单')
        return false
      }
    } catch (error) {
      log.error('检查登录状态时出错:', error)
      return false
    }
  },

  /**
   * 🔴 验证Token并处理重定向
   * 使用微信小程序专用的JWT解码方法
   */
  validateTokenAndRedirect(token: string, userInfo: any) {
    // 🔴 Token格式预检查
    if (!token || typeof token !== 'string' || token.split('.').length !== 3) {
      log.error('Token格式无效，需要重新登录')
      this.clearInvalidLoginState()
      return
    }

    // 🔴 JWT过期检查（使用微信小程序专用解码方法）
    try {
      const { decodeJWTPayload } = Utils
      const payload = decodeJWTPayload(token)
      const now = Math.floor(Date.now() / 1000)

      if (payload.exp && payload.exp < now) {
        const expiredMinutes = Math.floor((now - payload.exp) / 60)
        log.error('Token已过期:', expiredMinutes + '分钟前')
        this.clearInvalidLoginState()
        return
      }
    } catch (decodeError: any) {
      log.error('Token解码失败:', decodeError.message)
      this.clearInvalidLoginState()
      return
    }

    // 🔴 通过V4.0后端验证Token - 使用顶部统一导入的API模块
    const { verifyToken } = API
    verifyToken()
      .then((result: any) => {
        log.info('Token验证响应详细检查:', {
          success: result.success,
          hasData: !!result.data,
          dataKeys: result.data ? Object.keys(result.data) : [],
          hasValid: result.data ? 'valid' in result.data : false,
          validValue: result.data ? result.data.valid : undefined,
          fullData: result.data
        })

        // 🔴 按照文档规范验证：文档 Line 1846, 1870 - data.valid 是"关键验证字段"
        if (result.success && result.data && result.data.valid === true) {
          log.info('V4.0 Token验证成功（data.valid === true），自动跳转到主页面')
          this.redirectToMainPage(userInfo)
        } else {
          log.error('V4.0 Token验证失败，原因:', {
            success: result.success,
            hasData: !!result.data,
            hasValidField: result.data ? 'valid' in result.data : false,
            validValue: result.data ? result.data.valid : undefined,
            message: '后端响应缺少 data.valid 字段或值不为 true'
          })
          this.clearInvalidLoginState()
        }
      })
      .catch((error: any) => {
        log.warn('Token验证失败:', error)

        // 🔴 修复：通过 isAuthError 标记区分认证错误和网络错误（APIClient.handleTokenInvalid() 已设置 error.isAuthError = true）
        /**
         * 认证错误码判断（对齐后端 middleware/auth.js 细分错误码）
         * SESSION_REPLACED  → 同平台其他设备登录，当前会话被替换（方案B平台隔离：跨平台不互踢）
         * SESSION_EXPIRED   → 会话超时（7天未使用）
         * SESSION_NOT_FOUND → 会话记录被清理
         * TOKEN_EXPIRED     → JWT过期
         * INVALID_TOKEN     → Token格式错误或签名无效
         * MISSING_TOKEN     → 请求未携带 Authorization 头
         */
        const authErrorCodes: string[] = [
          'SESSION_REPLACED',
          'SESSION_EXPIRED',
          'SESSION_NOT_FOUND',
          'TOKEN_EXPIRED',
          'INVALID_TOKEN',
          'MISSING_TOKEN'
        ]
        const isAuthError = error.isAuthError === true || authErrorCodes.includes(error.code || '')

        if (isAuthError) {
          log.error('认证失败:', error.code, error.message)
          this.clearInvalidLoginState()
        } else {
          wx.showModal({
            title: '登录状态验证失败',
            content: '无法验证登录状态，可能是网络问题。\n\n是否重新登录？',
            showCancel: true,
            cancelText: '稍后重试',
            confirmText: '重新登录',
            success: res => {
              if (res.confirm) {
                this.clearInvalidLoginState()
              } else {
                log.info('用户选择稍后重试，假设登录有效')
                this.redirectToMainPage(userInfo)
              }
            }
          })
        }
      })
  },

  /** 清理无效登录状态（统一通过 app.clearAuthData 清理WebSocket+Store+Storage） */
  clearInvalidLoginState() {
    log.info('清理无效登录状态')

    try {
      const appInstance = getApp()
      appInstance.clearAuthData()
    } catch (appError) {
      log.warn('App实例不可用，降级直接清理Store:', appError)
      userStore.clearLoginState()
      pointsStore.clearPoints()
    }

    this.setData({ pageLoaded: true })

    wx.showToast({
      title: '请重新登录',
      icon: 'none',
      duration: DELAY.TOAST_LONG
    })
  },

  /**
   * 🔧 处理初始化错误
   */
  handleInitError(error: any) {
    log.error('页面初始化错误:', error)

    this.setData({
      pageLoaded: true,
      initError: error.message || '页面初始化失败'
    })

    wx.showModal({
      title: '⚠️ 页面初始化异常',
      content: `认证页面初始化遇到问题：\n\n${error.message || '未知错误'}\n\n您可以尝试：\n• 重新进入页面\n• 重启小程序\n• 检查网络连接`,
      showCancel: true,
      cancelText: '重新加载',
      confirmText: '继续使用',
      success: res => {
        if (res.cancel) {
          wx.reLaunch({
            url: '/packageUser/auth/auth'
          })
        }
      }
    })
  },

  /**
   * 🔧 切换错误详情显示
   */
  toggleErrorDetails() {
    this.setData({
      showErrorDetails: !this.data.showErrorDetails
    })
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    log.info('认证页面渲染完成')
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    log.info('认证页面显示')

    this.setData({
      loginCompleted: false,
      loginTimeoutTriggered: false
    })

    if (this.data.initError) {
      log.info('检测到初始化错误，尝试重新初始化...')
      this.safeInitPage()
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    log.info('认证页面隐藏')

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }

    this.setData({
      submitting: false,
      logging: false,
      sending: false
    })
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    log.info('认证页面卸载')

    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    log.info('下拉刷新认证页面')

    this.safeInitPage()

    setTimeout(() => {
      wx.stopPullDownRefresh()
    }, 1000)
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {},

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖系统',
      path: '/packageUser/auth/auth',
      imageUrl: '/images/share-auth.png'
    }
  },

  /**
   * 🔧 手机号输入处理
   */
  onMobileInput(e: WechatMiniprogram.CustomEvent) {
    const mobile = e.detail.value.trim()

    const isValid = this.validateMobile(mobile)

    this.setData({
      mobile,
      ['formErrors.mobile']: isValid ? '' : '请输入正确的手机号'
    })

    log.info('手机号输入:', mobile, '验证结果:', isValid)
  },

  /**
   * 🔧 验证手机号格式
   */
  validateMobile(mobile: string) {
    const mobilePattern = /^1[3-9]\d{9}$/
    return mobilePattern.test(mobile)
  },

  /**
   * 🔧 验证码输入处理
   */
  onCodeInput(e: WechatMiniprogram.CustomEvent) {
    const verification_code = e.detail.value.trim()

    // 🔴 V4.0: 万能验证码123456由后端统一处理（开发/测试环境）
    const isValid = this.validateCode(verification_code)

    this.setData({
      verification_code,
      ['formErrors.verification_code']: isValid ? '' : '请输入6位数字验证码'
    })

    log.info('验证码输入:', verification_code, '格式验证结果:', isValid)
  },

  /**
   * 🔧 验证验证码格式
   */
  validateCode(code: string) {
    const codePattern = /^\d{6}$/
    return codePattern.test(code)
  },

  /**
   * 🔧 发送验证码
   */
  onSendCode() {
    if (!this.data.mobile) {
      Wechat.showToast('请输入手机号')
      return
    }

    if (!this.validateMobile(this.data.mobile)) {
      Wechat.showToast('请输入正确的手机号')
      return
    }

    if (this.data.sending || this.data.countdown > 0) {
      return
    }

    this.setData({ sending: true })

    // 🔴 开发环境短信发送已禁用 - 根据用户需求清除开发环境功能

    // 🔴 V4.0：调用统一的发送验证码API方法
    this.sendVerificationCode(this.data.mobile)
      .then((result: any) => {
        log.info('验证码发送成功:', result)

        wx.showToast({
          title: result.success ? '验证码已发送' : result.message,
          icon: result.success ? 'success' : 'none'
        })

        if (result.success) {
          this.startCountdown()
        }
      })
      .catch((error: any) => {
        log.error('验证码发送失败:', error)
        this.handleSendCodeError(error)
      })
      .finally(() => {
        this.setData({ sending: false })
      })
  },

  /**
   * 🔧 处理发送验证码错误
   */
  handleSendCodeError(error: any) {
    let errorMessage = '验证码发送失败'

    if (error.code === 1001) {
      errorMessage = '手机号格式错误'
    } else if (error.code === 1002) {
      errorMessage = '发送太频繁，请稍后重试'
    } else if (error.code === 1003) {
      errorMessage = '今日发送次数已达上限'
    } else if (error.isNetworkError) {
      errorMessage = '网络连接失败，请检查网络'
    } else if (error.isBackendError) {
      errorMessage = error.msg || '服务器异常，请稍后重试'
    }

    wx.showModal({
      title: '验证码发送失败',
      content: errorMessage,
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /**
   * 🔧 开始倒计时
   */
  startCountdown() {
    let countdown = 60
    this.setData({
      countdown,
      codeDisabled: true
    })

    this.countdownTimer = setInterval(() => {
      countdown--
      this.setData({ countdown })

      if (countdown <= 0) {
        this.clearCountdown()
      }
    }, 1000)
  },

  /**
   * 🔧 清除倒计时
   */
  clearCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer)
      this.countdownTimer = null
    }

    this.setData({
      countdown: 0,
      codeDisabled: false
    })
  },

  /**
   * 🔧 用户协议状态变化
   */
  onAgreementChange(e: WechatMiniprogram.CustomEvent) {
    const agreementChecked = e.detail.value.includes('agreed')
    this.setData({
      agreementChecked
    })
    log.info('用户协议状态变化:', agreementChecked)
  },

  /**
   * 🔧 查看用户协议
   */
  onViewAgreement() {
    this.setData({
      showAgreement: true
    })
  },

  /**
   * 🔧 关闭用户协议
   */
  onCloseAgreement() {
    this.setData({
      showAgreement: false
    })
  },

  /**
   * 🔧 提交登录
   *
   * @description
   * 处理用户点击登录按钮的事件，执行表单验证并提交登录请求。
   *
   * **验证流程**：
   * 1. 防止重复提交（检查submitting和loginCompleted状态）
   * 2. 验证用户协议勾选状态
   * 3. 验证表单数据（手机号和验证码格式）
   * 4. 调用performUnifiedLogin执行登录
   *
   * **V4.0特性**：
   * - 使用verification_code字段名（snake_case）
   * - 统一错误提示机制
   * - 防重复提交保护
   *
   * **业务场景**：
   * - 用户点击"登录"按钮时触发
   * - 表单验证失败时显示Toast提示
   * - 验证成功后显示loading状态
   *
   *
   * @example
   * // WXML绑定
   * <button bindtap="onSubmitLogin">登录</button>
   */
  onSubmitLogin() {
    if (this.data.submitting || this.data.loginCompleted) {
      log.info('登录正在进行中或已完成，忽略重复提交')
      return
    }

    if (!this.data.agreementChecked) {
      Wechat.showToast('请同意用户协议')
      return
    }

    const formData = {
      mobile: this.data.mobile,
      verification_code: this.data.verification_code
    }

    const validation = this.formValidator.validate(formData)
    if (!validation.isValid) {
      this.setData({
        formErrors: validation.errors
      })

      const firstError = Object.values(validation.errors)[0] as string
      Wechat.showToast(firstError)
      return
    }

    this.setData({
      submitting: true,
      logging: true,
      loginCompleted: false
    })

    log.info('开始统一登录流程 - 权限简化版v2.2.0')
    this.performUnifiedLogin(formData)
  },

  /**
   * 🔴 执行统一登录 - V4.0统一认证系统
   *
   * formData - 登录表单数据
   * formData.mobile - 手机号（11位，1开头）
   * formData.verification_code - 验证码（6位数字）
   * [retryCount=0] - 重试次数（用于网络失败重试）
   *
   * @description
   * 执行V4.0统一登录流程，调用后端API进行身份验证。
   *
   * **登录流程**：
   * 1. 设置15秒超时保护
   * 2. 调用API.userLogin进行验证
   * 3. 验证成功：保存Token和用户信息，跳转到主页面
   * 4. 验证失败：显示错误提示，提供重试选项
   *
   * **V4.0特性**：
   * - 使用verification_code字段名（snake_case，符合后端API规范）
   * - 完全依赖后端真实数据
   * - 支持开发阶段万能验证码123456（由后端控制）
   * - 统一错误处理和超时保护
   *
   * **安全保障**：
   * - 15秒超时保护，防止请求永久等待
   * - 防重复提交检查（loginCompleted标志）
   * - 完整的错误处理和用户提示
   *
   * **后端API**：
   * - 路径：POST /api/v4/auth/login
   * - 请求参数：{ mobile, verification_code }
   * - 响应数据：{ success, data: { user, token, refresh_token } }
   *
   *
   * @example
   * // 调用示例
   * this.performUnifiedLogin({
   *   mobile: '13800138000',
   *   verification_code: '123456'
   * })
   */
  performUnifiedLogin(
    formData: { mobile: string; verification_code: string },
    retryCount: number = 0
  ) {
    log.info('执行V4.0统一登录:', {
      mobile: formData.mobile,
      verification_code: formData.verification_code,
      retryCount
    })

    const loginTimeout = setTimeout(() => {
      if (!this.data.loginCompleted) {
        log.warn(' 登录请求超时，强制结束')
        this.setData({
          submitting: false,
          logging: false,
          loginTimeoutTriggered: true
        })

        wx.showModal({
          title: '登录超时',
          content: '登录请求超时，请检查网络连接后重试。',
          showCancel: false,
          confirmText: '重新登录'
        })
      }
    }, 15000)

    // 🔴 V4.0: 使用userLogin函数，传入verification_code
    this.userLogin(formData.mobile, formData.verification_code)
      .then((result: any) => {
        clearTimeout(loginTimeout)

        if (this.data.loginCompleted) {
          log.info('登录已完成，忽略后续响应')
          return
        }

        if (result && result.success === true) {
          log.info('V4统一登录成功:', result)
          this.handleV4LoginSuccess(result)
        } else {
          log.info('V4统一登录失败:', result)
          this.handleLoginFailure(result || new Error('登录失败，未收到有效响应'))
        }
      })
      .catch((error: any) => {
        clearTimeout(loginTimeout)

        if (this.data.loginCompleted) {
          log.info('登录已完成，忽略错误响应')
          return
        }

        log.error('统一登录失败:', error)
        this.handleLoginFailure(error)
      })
  },

  /**
   * 🔧 处理V4统一登录成功 - 方案B重构版
   * 🔴 V4版：支持双Token机制和新的用户数据结构
   *
   * 优化后复杂度：显著降低
   * 复用子函数：parseAndValidateJWT(), buildUserInfoObject(), saveAuthDataToStorage()
   */
  async handleV4LoginSuccess(loginData: any) {
    log.info('处理V4登录成功数据 - 方案B重构版')

    if (!loginData || !loginData.data) {
      log.error('V4登录数据格式错误')
      this.handleLoginFailure(new Error('V4登录数据格式错误'))
      return
    }

    this.setData({ loginCompleted: true })

    try {
      const responseData = loginData.data

      const accessToken = responseData.access_token
      const refreshToken = responseData.refresh_token
      const rawUserInfo = responseData.user

      log.info('V4 Token信息:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresIn: responseData.expires_in
      })

      if (!accessToken || !rawUserInfo) {
        throw new Error('V4登录响应缺少必要数据')
      }

      log.info('步骤3：解析JWT Token...')
      const jwtData = parseAndValidateJWT(accessToken)
      log.info('JWT解析成功:', {
        user_role: jwtData.user_role,
        role_level: jwtData.role_level
      })

      log.info('步骤4：构建用户信息对象...')
      const userInfo = buildUserInfoObject(rawUserInfo, jwtData)
      log.info('用户信息构建完成:', {
        user_id: userInfo.user_id,
        mobile: userInfo.mobile,
        user_role: userInfo.user_role,
        role_level: userInfo.role_level
      })

      log.info('步骤5：保存认证数据...')
      saveAuthDataToStorage(accessToken, refreshToken, userInfo)

      log.info('验证存储的用户信息:', {
        storage_user_info: wx.getStorageSync('user_info'),
        store_user_info: userStore.userInfo
      })

      // ===== 步骤6：获取积分余额（V4.0规范） =====
      log.info('步骤6：获取用户积分余额...')
      try {
        const { getPointsBalance } = API
        const balanceResult = await getPointsBalance()

        if (balanceResult && balanceResult.success && balanceResult.data) {
          const availablePoints = balanceResult.data.available_amount || 0
          const frozenPoints = balanceResult.data.frozen_amount || 0
          log.info('积分余额获取成功:', { availablePoints, frozenPoints })

          pointsStore.setBalance(availablePoints, frozenPoints)
        } else {
          log.warn('积分余额获取失败，使用默认值0')
        }
      } catch (pointsError) {
        log.error('获取积分余额异常:', pointsError)
        log.warn('积分获取失败不影响登录流程，继续跳转')
      }

      log.info('V4登录处理完成，准备跳转到抽奖页面')

      log.info('登录后数据验证:', {
        storageToken: !!wx.getStorageSync('access_token'),
        storageUserInfo: !!wx.getStorageSync('user_info'),
        storeToken: !!userStore.accessToken,
        storeUserInfo: !!userStore.userInfo,
        storeIsLoggedIn: userStore.isLoggedIn,
        userInfoDetail: wx.getStorageSync('user_info')
      })

      wx.reLaunch({
        url: '/pages/lottery/lottery'
      })
    } catch (error) {
      log.error('V4登录处理异常:', error)
      this.handleLoginFailure(error)
    }
  },

  /**
   * 立即跳转到抽奖页面（无延迟版）
   * 🔧 优化：使用reLaunch避免在auth页面停留
   */
  immediateRedirectToLottery() {
    log.info('立即跳转到抽奖页面（无延迟）')

    wx.reLaunch({
      url: '/pages/lottery/lottery',
      success: () => {
        log.info('抽奖页面跳转成功（reLaunch）')
      },
      fail: error => {
        log.error('reLaunch跳转失败，尝试switchTab:', error)

        wx.switchTab({
          url: '/pages/lottery/lottery',
          success: () => {
            log.info('抽奖页面跳转成功（switchTab）')
          },
          fail: switchError => {
            log.error('switchTab也失败:', switchError)
            this.immediateAlternativeNavigation(error)
          }
        })
      }
    })
  },

  /**
   * 🔴 新增：立即备用导航方案（无延迟）
   */
  immediateAlternativeNavigation(originalError: any) {
    log.info('立即尝试备用导航方案...')

    wx.reLaunch({
      url: '/pages/lottery/lottery',
      success: () => {
        log.info('reLaunch跳转成功（立即备用方案）')
        wx.showToast({
          title: '登录成功！',
          icon: 'success',
          duration: DELAY.TOAST_SHORT
        })
      },
      fail: reLaunchError => {
        log.error('reLaunch也失败:', reLaunchError)

        wx.navigateTo({
          url: '/pages/lottery/lottery',
          success: () => {
            log.info('navigateTo跳转到抽奖页面成功（立即）')
            wx.showToast({
              title: '登录成功！',
              icon: 'success',
              duration: DELAY.TOAST_SHORT
            })
          },
          fail: navError => {
            log.error('所有跳转方案都失败:', navError)
            this.handleSimpleNavigationFailure(originalError)
          }
        })
      }
    })
  },

  /**
   * 🔴 新增：简化的导航失败处理
   */
  handleSimpleNavigationFailure(error: any) {
    log.error('页面跳转最终失败:', error)

    wx.showModal({
      title: '登录成功',
      content: '登录已成功！但页面跳转遇到问题。\n\n请手动点击底部"抽奖"标签继续使用。',
      showCancel: true,
      cancelText: '重试',
      confirmText: '知道了',
      confirmColor: '#FF6B35',
      success: res => {
        if (res.cancel) {
          // 用户选择重试
          this.directSafeRedirectToLottery()
        } else {
          // 用户选择知道了，显示操作提示
          wx.showToast({
            title: '请点击底部"抽奖"标签',
            icon: 'none',
            duration: DELAY.RETRY
          })
        }
      }
    })
  },

  /**
   * 🔧 跳转到主页面（简化版）
   */
  redirectToMainPage(userInfo: any) {
    log.info('跳转到主页面 - 统一跳转到抽奖页面:', userInfo)

    log.info('开始跳转到抽奖页面（自动登录）')
    this.directSafeRedirectToLottery()
  },

  /**
   * 🔧 安全跳转到抽奖页面
   */
  directSafeRedirectToLottery() {
    log.info('直接安全跳转到抽奖页面')
    this.immediateRedirectToLottery()
  },

  /**
   * 🔧 处理登录失败 - 增强版Token问题诊断
   */
  handleLoginFailure(error: any) {
    log.error('登录失败处理:', error)

    const tokenDiagnostics = this.diagnoseTokenIssues()

    let errorMessage = '登录失败'
    let showRetryOption = true
    let autoRetryDelay = 0

    if (error && error.message) {
      if (error.message.includes('Token传输异常') || error.message.includes('Token格式错误')) {
        errorMessage = '认证令牌传输异常，可能是网络问题导致'
        showRetryOption = true
        autoRetryDelay = DELAY.TOAST_LONG

        log.info('检测到Token传输问题，准备自动修复...')

        this.clearTokenCacheAndRetry()
        return
      } else if (error.message.includes('验证码错误')) {
        errorMessage = '验证码错误，请重新输入'
        showRetryOption = false
      } else if (error.message.includes('用户不存在')) {
        errorMessage = '用户不存在，请检查手机号'
        showRetryOption = false
      } else {
        errorMessage = error.message
      }
    }

    if (tokenDiagnostics.hasIssues) {
      log.info('Token问题诊断报告:', tokenDiagnostics)
      errorMessage += `\n\n技术诊断:\n${tokenDiagnostics.summary}`
    }

    this.setData({
      submitting: false,
      logging: false
    })

    const modalConfig: any = {
      content: errorMessage,
      showCancel: showRetryOption,
      cancelText: '取消',
      confirmText: showRetryOption ? '重试' : '确定'
    }

    if (showRetryOption) {
      modalConfig.success = (res: any) => {
        if (res.confirm) {
          log.info('用户选择重试登录')
          if (autoRetryDelay > 0) {
            setTimeout(() => {
              this.retryLoginWithTokenRepair()
            }, autoRetryDelay)
          } else {
            this.retryLoginWithTokenRepair()
          }
        }
      }
    }

    wx.showModal(modalConfig)
  },

  /**
   * 🔧 新增：Token问题诊断功能
   */
  diagnoseTokenIssues() {
    try {
      const storedToken = wx.getStorageSync('access_token')
      const issues: string[] = []
      const details: any = {
        storedTokenLength: storedToken ? storedToken.length : 0
      }

      if (storedToken) {
        const { validateJWTTokenIntegrity } = Utils
        const integrityCheck = validateJWTTokenIntegrity(storedToken)
        if (!integrityCheck.isValid) {
          issues.push(`Token异常: ${integrityCheck.error}`)
          details.storedTokenIssue = integrityCheck.error
        }
      }

      return {
        hasIssues: issues.length > 0,
        issues,
        details,
        summary: issues.length > 0 ? issues.join('; ') : 'Token状态正常'
      }
    } catch (error: any) {
      log.error('Token诊断失败:', error)
      return {
        hasIssues: true,
        issues: ['Token诊断失败'],
        details: { diagnosticError: error.message },
        summary: '无法完成Token诊断'
      }
    }
  },

  /** 清理Token缓存并重试登录（统一通过 app.clearAuthData 清理） */
  clearTokenCacheAndRetry() {
    log.info('清理Token缓存，准备重试...')

    try {
      const currentFormData = {
        mobile: this.data.mobile,
        verification_code: this.data.verification_code
      }

      try {
        const appInstance = getApp()
        appInstance.clearAuthData()
      } catch (appError) {
        log.warn('App实例不可用，降级直接清理Store:', appError)
        userStore.clearLoginState()
        pointsStore.clearPoints()
      }

      this.setData({
        submitting: false,
        logging: false,
        loginCompleted: false,
        loginTimeoutTriggered: false
      })

      wx.showToast({
        title: '正在重新获取令牌...',
        icon: 'loading',
        duration: DELAY.TOAST_SHORT
      })

      setTimeout(() => {
        log.info('开始重新登录...')
        this.performUnifiedLogin(currentFormData, 1)
      }, DELAY.TOAST_SHORT)
    } catch (error) {
      log.error('Token缓存清理失败:', error)
      wx.showModal({
        title: '重试失败',
        content: '无法清理缓存，请手动重新登录',
        showCancel: false
      })
    }
  },

  /**
   * 🔧 新增：带Token修复的重试登录
   */
  retryLoginWithTokenRepair() {
    log.info('启动Token修复重试流程...')

    const formData = {
      mobile: this.data.mobile,
      verification_code: this.data.verification_code
    }

    if (!formData.mobile || !formData.verification_code) {
      wx.showModal({
        title: '重试失败',
        content: '请重新输入手机号和验证码',
        showCancel: false
      })
      return
    }

    this.setData({
      submitting: true,
      logging: true,
      loginCompleted: false
    })

    log.info('执行修复性重试登录...')
    this.clearTokenCacheAndRetry()
  }
})

export {}
