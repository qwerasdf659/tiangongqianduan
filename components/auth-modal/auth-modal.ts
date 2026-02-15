/**
 * 认证模态弹窗组件 - V4.0统一认证系统
 *
 * @component auth-modal
 * @description
 * 用户身份验证弹窗组件，支持手机号验证码登录和用户名密码登录两种方式。
 *
 * **核心功能**：
 * - 📱 手机号验证码登录（支持开发阶段万能验证码123456）
 * - 🔑 用户名密码登录
 * - ⏱️ 验证码倒计时（60秒）
 * - 🔄 表单验证和提交状态管理
 *
 * **业务场景**：
 * - 用户首次使用小程序时的登录引导
 * - 需要权限的页面强制登录提示
 * - Token过期后的重新登录
 *
 * **技术特点**：
 * - 完全依赖后端真实数据，不使用mock数据
 * - 统一使用utils/index.js导入工具函数
 * - 符合V4.0统一认证架构
 * - 自动清理定时器防止内存泄漏
 *
 * **使用示例**：
 * ```xml
 * <auth-modal
 *   visible="{{showAuthModal}}"
 *   title="请登录"
 *   isFirstUse="{{true}}"
 *   bind:success="onAuthSuccess"
 *   bind:cancel="onAuthCancel"
 * />
 * ```
 *
 * **事件**：
 * - `success` - 登录成功事件，返回用户信息和Token
 * - `cancel` - 取消登录事件
 * - `error` - 登录失败事件
 *
 * @file components/auth-modal/auth-modal.ts
 * @version 5.1.0
 * @since 2025-10-31
 */

// 🔴 V4.0规范：统一使用utils/index.js导入工具函数
const { Wechat, API, Logger } = require('../../utils/index')
const log = Logger.createLogger('auth-modal')
const { showToast } = Wechat

Component({
  /**
   * 组件的属性列表
   *
   * @property {boolean} visible - 是否显示弹窗
   * @property {string} title - 弹窗标题
   * @property {boolean} isFirstUse - 是否首次使用（用于区分提示文案）
   */
  properties: {
    visible: {
      type: Boolean,
      value: false
    },
    title: {
      type: String,
      value: '身份验证'
    },
    isFirstUse: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件的内部数据
   *
   * @property {string} authType - 验证方式（phone/password）
   * @property {string} phoneNumber - 手机号
   * @property {string} verificationCode - 验证码
   * @property {boolean} codeSending - 验证码发送状态
   * @property {number} countdown - 验证码倒计时（秒）
   * @property {string} username - 用户名
   * @property {string} password - 密码
   * @property {boolean} showPassword - 是否显示密码明文
   * @property {boolean} submitting - 提交状态
   * @property {boolean} canSubmit - 是否可以提交（表单验证通过）
   */
  data: {
    authType: 'phone',
    phoneNumber: '',
    verificationCode: '',
    codeSending: false,
    countdown: 0,
    username: '',
    password: '',
    showPassword: false,
    submitting: false,
    canSubmit: false
  },

  observers: {
    'phoneNumber, verificationCode, username, password, authType'() {
      this.updateCanSubmit()
    }
  },

  /** 组件的方法列表 */
  methods: {
    /**
     * 切换验证方式（手机号/密码）
     *
     * e - 微信小程序事件对象
     * e.currentTarget.dataset.type - 验证方式类型（phone/password）
     *
     * @description
     * 切换验证方式时自动清空所有输入数据和状态
     */
    onAuthTypeChange(e: WechatMiniprogram.CustomEvent) {
      const type = e.currentTarget.dataset.type
      this.setData({
        authType: type,
        phoneNumber: '',
        verificationCode: '',
        username: '',
        password: '',
        countdown: 0,
        codeSending: false
      })
    },

    /**
     * 手机号输入事件
     *
     * e.detail.value - 输入的手机号
     */
    onPhoneInput(e: WechatMiniprogram.Input) {
      this.setData({ phoneNumber: e.detail.value })
    },

    /**
     * 验证码输入事件
     *
     * e.detail.value - 输入的验证码
     */
    onCodeInput(e: WechatMiniprogram.Input) {
      this.setData({ verificationCode: e.detail.value })
    },

    /**
     * 用户名输入事件
     *
     * e.detail.value - 输入的用户名
     */
    onUsernameInput(e: WechatMiniprogram.Input) {
      this.setData({ username: e.detail.value })
    },

    /**
     * 密码输入事件
     *
     * e.detail.value - 输入的密码
     */
    onPasswordInput(e: WechatMiniprogram.Input) {
      this.setData({ password: e.detail.value })
    },

    /** 切换密码显示/隐藏状态 */
    onTogglePassword() {
      this.setData({ showPassword: !this.data.showPassword })
    },

    /**
     * 发送验证码
     *
     * @description
     * 发送短信验证码到用户手机。
     *
     * **验证流程**：
     * 1. 检查手机号格式（11位，1开头）
     * 2. 调用后端API发送验证码
     * 3. 开始60秒倒计时
     *
     * **开发阶段**：
     * - 支持万能验证码123456（由后端完全控制）
     * - 不实际发送短信，降低开发成本
     */
    async onSendCode() {
      if (this.data.codeSending || this.data.countdown > 0) {
        return
      }

      const { phoneNumber } = this.data

      if (!phoneNumber) {
        showToast('请输入手机号')
        return
      }

      // 验证手机号格式
      const phoneReg = /^1[3-9]\d{9}$/
      if (!phoneReg.test(phoneNumber)) {
        showToast('手机号格式不正确')
        return
      }

      // 决策8：发送验证码功能暂不支持，后端尚未实现短信发送路由
      // 测试阶段使用万能验证码123456
      wx.showToast({
        title: '暂不支持，请输入验证码',
        icon: 'none',
        duration: 2000
      })

      log.info('ℹ️ 发送验证码暂不支持（决策8），测试阶段请使用万能验证码：123456')
      // TODO: 等后端接入短信服务后恢复发送功能
      this.startCountdown()
    },

    /**
     * 开始验证码倒计时
     *
     * @description
     * 60秒倒计时，期间禁用发送按钮。
     * 自动清理定时器防止内存泄漏。
     */
    startCountdown() {
      this.setData({ countdown: 60 })

      const timer = setInterval(() => {
        const countdown = this.data.countdown - 1
        if (countdown <= 0) {
          clearInterval(timer)
          this.setData({ countdown: 0 })
        } else {
          this.setData({ countdown })
        }
      }, 1000)

        // 保存定时器引用以便清理
        ; (this as any).countdownTimer = timer
    },

    /**
     * 更新提交按钮状态
     *
     * @description
     * 根据当前验证方式和输入内容，动态更新提交按钮的可用状态。
     *
     * **验证规则**：
     * - 手机号方式：必须填写手机号和验证码
     * - 密码方式：必须填写用户名和密码
     */
    updateCanSubmit() {
      let canSubmit = false

      if (this.data.authType === 'phone') {
        canSubmit = !!(this.data.phoneNumber && this.data.verificationCode)
      } else if (this.data.authType === 'password') {
        canSubmit = !!(this.data.username && this.data.password)
      }

      this.setData({ canSubmit })
    },

    /**
     * 确认验证（主方法）
     *
     * @description
     * 根据当前验证方式调用对应的验证方法
     */
    async onConfirm() {
      if (!this.data.canSubmit || this.data.submitting) {
        return
      }

      if (this.data.authType === 'phone') {
        await this.performPhoneAuth()
      } else {
        await this.performPasswordAuth()
      }
    },

    /**
     * 执行手机验证码登录
     *
     * @description
     * 使用手机号和验证码登录系统。
     *
     * **V4.0特性**：
     * - 调用utils/api的userLogin方法
     * - 完全使用后端真实数据，不生成mock数据
     * - 支持开发阶段万能验证码123456（由后端控制）
     * - 统一错误处理和提示
     */
    async performPhoneAuth() {
      const { phoneNumber, verificationCode } = this.data

      try {
        this.setData({ submitting: true })

        // 🔴 使用API工具中的登录方法，不再生成模拟数据
        const result = await API.userLogin(phoneNumber, verificationCode)

        if (result.success) {
          // 🔴 使用后端返回的真实用户数据，不再生成模拟数据
          this.handleAuthSuccess(result.data)
        } else {
          throw new Error(result.message || '验证失败')
        }
      } catch (error: any) {
        log.error('❌ 手机验证失败:', error)
        showToast(error.message || '验证失败，请重试')
      } finally {
        this.setData({ submitting: false })
      }
    },

    /**
     * 执行密码登录
     *
     * @description
     * 使用用户名和密码登录系统。
     *
     * **V4.0特性**：
     * - 调用统一的API接口
     * - 完全使用后端真实数据
     * - 统一错误处理
     */
    async performPasswordAuth() {
      const { username, password } = this.data

      try {
        this.setData({ submitting: true })

        // 使用统一的API接口
        const result = await API.userLogin(username, password)

        if (result.success) {
          this.handleAuthSuccess(result.data)
        } else {
          throw new Error(result.message || '登录失败')
        }
      } catch (error: any) {
        log.error('❌ 密码验证失败:', error)
        showToast(error.message || '登录失败，请重试')
      } finally {
        this.setData({ submitting: false })
      }
    },

    /**
     * 处理验证成功
     *
     * data - 后端返回的登录数据
     * data.user - 用户信息
     * data.token - 访问令牌
     *
     * @description
     * 登录成功后触发success事件，通知父组件更新状态。
     * 1秒后自动关闭弹窗。
     */
    handleAuthSuccess(data: any) {
      showToast('验证成功')

      // 通知父组件
      this.triggerEvent('success', {
        user: data.user,
        token: data.token
      })

      // 延迟关闭弹窗
      setTimeout(() => {
        this.onCancel()
      }, 1000)
    },

    /**
     * 忘记密码点击事件
     *
     * @description
     * 忘记密码功能（预留接口）
     */
    onForgotPassword() {
      showToast('忘记密码功能开发中')
    },

    /**
     * 取消登录
     *
     * @description
     * 触发cancel事件并重置所有数据
     */
    onCancel() {
      this.triggerEvent('cancel')
      this.resetData()
    },

    /**
     * 重置组件数据
     *
     * @description
     * 清空所有输入数据、定时器和状态，恢复初始状态。
     * 防止内存泄漏。
     */
    resetData() {
      // 清理定时器
      if ((this as any).countdownTimer) {
        clearInterval((this as any).countdownTimer)
          ; (this as any).countdownTimer = null
      }

      this.setData({
        authType: 'phone',
        phoneNumber: '',
        verificationCode: '',
        username: '',
        password: '',
        showPassword: false,
        codeSending: false,
        countdown: 0,
        submitting: false,
        canSubmit: false
      })
    },

    /**
     * 阻止事件冒泡
     *
     * @description
     * 阻止弹窗内部点击事件冒泡到父组件
     */
    preventBubble() {
      // 空函数，阻止事件冒泡
    }
  },

  /** 组件生命周期 */
  lifetimes: {
    /**
     * 组件销毁时的清理工作
     *
     * @description
     * 清理定时器，防止内存泄漏
     */
    detached() {
      // 组件销毁时清理定时器
      if ((this as any).countdownTimer) {
        clearInterval((this as any).countdownTimer)
      }
    }
  }
})

export { }
