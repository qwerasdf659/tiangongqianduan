/**
 * 消费录入页面（V2动态码 + 门店选择 + 精细化错误处理）+ MobX响应式状态
 *
 * @file packageAdmin/consume-submit/consume-submit.ts
 * @description
 * 商家进入页面后，先看到操作说明和扫码按钮，点击扫码后识别用户，再录入消费金额。
 *
 * 业务流程：
 * 1. 商家进入页面 → 看到操作说明 + 扫码按钮
 * 2. 点击"扫描用户二维码" → 调用wx.scanCode识别顾客V2动态二维码
 * 3. 获取用户信息 → 多门店时弹出门店选择
 * 4. 填写消费金额（必填）+ 商家备注（选填）
 * 5. 确认提交 → POST /api/v4/shop/consumption/submit → 生成待审核记录
 *
 * @version 5.3.0
 * @since 2026-02-18
 */

const { API, Utils, Logger } = require('../../utils/index')
const log = Logger.createLogger('consume-submit')
const { checkAuth, formatPhoneNumber } = Utils

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    // 页面阶段：'scan' 扫码入口 | 'form' 填写表单
    pageStage: 'scan' as 'scan' | 'form',

    // 二维码信息
    qrCode: '',

    // 用户信息（从后端API获取）
    userInfo: null as any,
    userInfoLoading: false,

    // 门店选择（多门店场景）
    storeId: null as number | null,
    storeList: [] as any[],
    storeIndex: 0,

    // 表单数据
    consumeAmount: '',
    merchantNotes: '',

    // 页面状态
    loading: false,
    submitted: false
  },

  /**
   * 页面加载 - 不再要求必须携带qrCode参数，商家先看到操作说明页
   */
  onLoad(options) {
    log.info('📋 消费录入页面加载，参数:', options)

    if (!checkAuth()) {
      log.error('❌ 用户未登录，跳转到登录页')
      return
    }

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 权限检查：商家店员(role_level>=20)及以上可访问
    const currentUserInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const roleLevel = currentUserInfo?.role_level || 0
    const hasAccess = roleLevel >= 20

    if (!hasAccess) {
      log.error('❌ 用户无商家权限，role_level:', roleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅商家员工和管理员可录入消费。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    // 支持外部入口携带qrCode参数直接进入表单阶段（如管理员扫码跳转）
    if (options.qrCode) {
      const decodedQrCode = decodeURIComponent(options.qrCode)
      log.info('✅ 外部携带二维码参数，直接进入表单:', decodedQrCode)
      this.setData({ qrCode: decodedQrCode, pageStage: 'form' })
      this.loadUserInfo()
      return
    }

    // 默认显示扫码入口页面，商家可以看到操作说明
    this.setData({ pageStage: 'scan' })
  },

  /**
   * 商家点击扫码按钮 → 调用wx.scanCode → 识别用户V2动态二维码
   */
  startScan() {
    log.info('📷 商家点击扫码按钮')

    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'] as any,
      success: (res: any) => {
        log.info('📷 扫码成功:', res.result)
        this.setData({
          qrCode: res.result,
          pageStage: 'form',
          userInfo: null,
          submitted: false,
          consumeAmount: '',
          merchantNotes: '',
          storeId: null,
          storeList: [],
          storeIndex: 0
        })
        this.loadUserInfo()
      },
      fail: (scanError: any) => {
        log.info('📷 扫码取消或失败:', scanError)
      }
    })
  },

  /**
   * 重新扫码 — 清空当前数据，回到扫码入口
   */
  onRescanCode() {
    log.info('🔄 商家点击重新扫码')
    this.setData({
      pageStage: 'scan',
      qrCode: '',
      userInfo: null,
      userInfoLoading: false,
      submitted: false,
      consumeAmount: '',
      merchantNotes: '',
      storeId: null,
      storeList: [],
      storeIndex: 0,
      loading: false
    })
  },

  /**
   * 根据V2动态二维码加载用户信息
   *
   * 后端接口：GET /api/v4/shop/consumption/user-info?qr_code=xxx&store_id=xxx
   *
   * 门店判断逻辑：
   * - 首次不传 store_id
   * - 单门店员工：后端自动填充，直接返回用户信息
   * - 多门店员工：后端返回 MULTIPLE_STORES_REQUIRE_STORE_ID + data.available_stores
   *   前端弹出门店选择器，选择后重新请求
   */
  async loadUserInfo() {
    this.setData({ userInfoLoading: true })

    try {
      log.info('🔍 开始获取用户信息，二维码:', this.data.qrCode)

      // 调用后端API：传入 store_id（如果已选择门店）
      const result = await API.getUserInfoByQRCode(this.data.qrCode, this.data.storeId)

      if (result && result.success && result.data) {
        // 后端返回完整手机号，前端脱敏展示（如 138****5678）
        const userData = result.data
        const maskedUserInfo = {
          ...userData,
          mobile_display: formatPhoneNumber(userData.mobile)
        }

        this.setData({
          userInfo: maskedUserInfo,
          userInfoLoading: false
        })
        log.info('✅ 用户信息加载成功:', result.data)
      } else {
        throw new Error(result.message || '获取用户信息失败')
      }
    } catch (error: any) {
      log.error('❌ 加载用户信息失败:', error)

      // 处理 MULTIPLE_STORES_REQUIRE_STORE_ID 错误：弹出门店选择
      if (error.code === 'MULTIPLE_STORES_REQUIRE_STORE_ID') {
        const availableStores = (error.data && error.data.available_stores) || []
        log.info('🏪 多门店员工，需要选择门店:', availableStores)

        this.setData({
          storeList: availableStores,
          userInfoLoading: false
        })

        wx.showToast({ title: '请先选择门店', icon: 'none', duration: 2000 })
        return
      }

      this.setData({
        userInfo: null,
        userInfoLoading: false
      })

      // 精细化错误提示
      const errorContent = this.getErrorContent(error)

      wx.showModal({
        title: '加载失败',
        content: errorContent,
        showCancel: true,
        cancelText: '返回',
        confirmText: '重试',
        success: res => {
          if (res.confirm) {
            this.loadUserInfo()
          } else {
            wx.navigateBack()
          }
        }
      })
    }
  },

  /**
   * 门店选择变更事件
   *
   * e - picker事件对象
   */
  onStoreChange(e: any) {
    const index = parseInt(e.detail.value, 10)
    const store = this.data.storeList[index]
    log.info('🏪 选择门店:', store)

    this.setData({
      storeIndex: index,
      storeId: store.store_id
    })

    // 选择门店后重新加载用户信息（传入 store_id）
    if (this.data.qrCode && !this.data.userInfo) {
      this.loadUserInfo()
    }
  },

  /**
   * 消费金额输入事件
   *
   * e - 事件对象
   */
  onAmountInput(e: any) {
    this.setData({ consumeAmount: e.detail.value })
  },

  /**
   * 商家备注输入事件
   *
   * e - 事件对象
   */
  onNotesInput(e: any) {
    this.setData({ merchantNotes: e.detail.value })
  },

  /**
   * 提交消费记录
   *
   * V2升级要点：
   * - 传入 store_id（多门店场景必传）
   * - 幂等键在API层自动生成
   * - 备注限制升级为500字
   * - 精细化错误码处理
   *
   */
  async onSubmit() {
    // 防止重复提交
    if (this.data.loading || this.data.submitted) {
      log.warn('⚠️ 请勿重复提交')
      return
    }

    // 验证用户信息
    if (!this.data.userInfo) {
      wx.showToast({ title: '用户信息未加载', icon: 'none', duration: 2000 })
      return
    }

    // 验证消费金额
    const amount = parseFloat(this.data.consumeAmount)

    if (!this.data.consumeAmount || isNaN(amount)) {
      wx.showToast({ title: '请输入消费金额', icon: 'none', duration: 2000 })
      return
    }

    if (amount < 0.01) {
      wx.showToast({ title: '消费金额至少0.01元', icon: 'none', duration: 2000 })
      return
    }

    if (amount > 99999.99) {
      wx.showToast({ title: '消费金额不能超过99999.99元', icon: 'none', duration: 2000 })
      return
    }

    // 验证门店ID（多门店场景必传）
    if (this.data.storeList.length > 1 && !this.data.storeId) {
      wx.showToast({ title: '请先选择门店', icon: 'none', duration: 2000 })
      return
    }

    // 验证备注长度（V2：500字限制）
    if (this.data.merchantNotes && this.data.merchantNotes.length > 500) {
      wx.showToast({ title: '商家备注不能超过500字', icon: 'none', duration: 2000 })
      return
    }

    // 二次确认
    const confirmResult = await new Promise(resolve => {
      wx.showModal({
        title: '确认提交',
        content: `用户：${this.data.userInfo.nickname || this.data.userInfo.mobile}\n消费金额：¥${amount.toFixed(2)}元\n\n提交后将创建待审核记录，请确认信息无误。`,
        success: res => {
          resolve(res.confirm)
        }
      })
    })

    if (!confirmResult) {
      log.info('ℹ️ 用户取消提交')
      return
    }

    // 开始提交
    this.setData({ loading: true })

    try {
      log.info('📤 开始提交消费记录...')

      const result = await API.submitConsumption({
        qr_code: this.data.qrCode,
        consumption_amount: amount,
        store_id: this.data.storeId || undefined,
        merchant_notes: this.data.merchantNotes || undefined
      })

      log.info('✅ 提交成功:', result)

      // 标记已提交（防止重复提交）
      this.setData({ submitted: true })

      // 显示成功提示
      const resultData = result.data || {}
      wx.showModal({
        title: '提交成功',
        content: `消费记录已提交！\n\n预计奖励积分：${resultData.points_to_award || '待审核'}分\n记录状态：${resultData.status_name || '待审核'}\n\n管理员审核通过后，积分将自动发放给用户。`,
        showCancel: false,
        success: () => {
          setTimeout(() => {
            wx.navigateBack()
          }, 1000)
        }
      })
    } catch (error: any) {
      log.error('❌ 提交失败:', error)
      this.handleSubmitError(error)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 精细化提交错误处理（V2：12种错误码映射）
   *
   * error - 错误对象（包含 code 字段）
   */
  handleSubmitError(error: any) {
    /** 错误码 → 用户友好提示映射 */
    const errorMap = {
      QRCODE_EXPIRED: '二维码已过期，请让顾客刷新二维码',
      REPLAY_DETECTED: '该二维码已使用，请让顾客重新生成',
      INVALID_QRCODE_FORMAT: '二维码格式无效，请让顾客刷新',
      MISSING_IDEMPOTENCY_KEY: '系统异常（缺少幂等键），请重试',
      NO_STORE_BINDING: '您未绑定门店，请联系管理员',
      MULTIPLE_STORES_REQUIRE_STORE_ID: '请选择门店后重新提交',
      RATE_LIMIT_EXCEEDED: '操作过于频繁，请稍后再试',
      SERVICE_UNAVAILABLE: '服务暂时不可用，请稍后重试',
      CONCURRENT_CONFLICT: '数据冲突，请重试',
      USER_NOT_FOUND: '用户不存在',
      MERCHANT_DOMAIN_ACCESS_DENIED: '仅限商家员工使用此功能',
      UNAUTHENTICATED: '登录已过期，请重新登录'
    }

    const code: string = error.code || ''
    const content =
      (errorMap as Record<string, string>)[code] || error.message || '提交失败，请重试'

    // UNAUTHENTICATED 特殊处理：跳转登录
    if (code === 'UNAUTHENTICATED') {
      wx.redirectTo({ url: '/pages/auth/auth' })
      return
    }

    // MULTIPLE_STORES_REQUIRE_STORE_ID 特殊处理：弹出门店选择器
    if (code === 'MULTIPLE_STORES_REQUIRE_STORE_ID') {
      const availableStores = (error.data && error.data.available_stores) || []
      if (availableStores.length > 0) {
        this.setData({ storeList: availableStores })
      }
    }

    wx.showModal({
      title: '提交失败',
      content,
      showCancel: true,
      cancelText: '返回',
      confirmText: '重试',
      success: res => {
        if (!res.confirm) {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 根据错误码获取用户友好的错误内容
   *
   * error - 错误对象
   */
  getErrorContent(error: any) {
    const code: string = error.code || ''

    const contentMap: Record<string, string> = {
      INVALID_QRCODE_FORMAT: '二维码格式不支持，请让顾客刷新二维码后重试。',
      QRCODE_EXPIRED: '二维码已过期（5分钟有效），请让顾客刷新二维码后重试。',
      REPLAY_DETECTED: '该二维码已被使用（一次性），请让顾客重新生成二维码。',
      USER_NOT_FOUND: '二维码对应的用户不存在，请确认二维码来源。',
      NO_STORE_BINDING: '您未绑定任何门店，请联系管理员完成门店绑定。',
      MERCHANT_DOMAIN_ACCESS_DENIED: '您没有商家权限，仅商家员工可使用此功能。'
    }

    return (
      contentMap[code] ||
      `无法获取用户信息：${error.message}\n\n可能的原因：\n1. 二维码无效或已过期\n2. 用户不存在\n3. 网络连接异常`
    )
  },

  /**
   * 页面显示
   */
  onShow() {
    log.info('📋 消费录入页面显示')
  },

  /**
   * 页面隐藏
   */
  onHide() {
    log.info('📋 消费录入页面隐藏')
  },

  /**
   * 页面卸载
   */
  onUnload() {
    log.info('📋 消费录入页面卸载')
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})

export {}
