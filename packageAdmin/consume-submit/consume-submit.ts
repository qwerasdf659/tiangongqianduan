/**
 * 消费录入页面（V2动态码 + 门店选择 + 精细化错误处理）+ MobX响应式状态
 *
 * @file packageAdmin/consume-submit/consume-submit.ts
 * @description
 * 商家先填写消费金额/备注，再扫码识别顾客，最后确认提交。
 * 表单优先模式：商家可以提前录入金额和备注，顾客出示二维码后立刻扫码提交，提高效率。
 *
 * 业务流程：
 * 1. 商家进入页面 → 立即看到消费金额输入框和备注框
 * 2. 填写消费金额（必填）+ 商家备注（选填）
 * 3. 点击"扫描顾客二维码" → 调用wx.scanCode识别顾客V2动态二维码
 * 4. 获取用户信息 → 多门店时弹出门店选择
 * 5. 确认提交 → POST /api/v4/shop/consumption/submit → 生成待审核记录
 *
 * @version 6.0.0
 * @since 2026-02-20
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const consumeLog = Logger.createLogger('consume-submit')
const { checkAuth, formatPhoneNumber } = Utils
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
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
   * 页面加载 - 直接显示表单，商家先填写信息再扫码
   */
  onLoad(options) {
    consumeLog.info('消费录入页面加载，参数:', options)

    if (!checkAuth()) {
      consumeLog.error('用户未登录，跳转到登录页')
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
      consumeLog.error('用户无商家权限，role_level:', roleLevel)
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

    // 支持外部入口携带qrCode参数（如管理员扫码跳转）
    if (options.qrCode) {
      const decodedQrCode = decodeURIComponent(options.qrCode)
      consumeLog.info('外部携带二维码参数:', decodedQrCode)
      this.setData({ qrCode: decodedQrCode })
      this.loadUserInfo()
    }
  },

  /**
   * 商家点击扫码按钮 → 调用wx.scanCode → 识别用户V2动态二维码
   */
  startScan() {
    consumeLog.info('商家点击扫码按钮')

    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'] as any,
      success: (res: any) => {
        consumeLog.info('扫码成功:', res.result)
        this.setData({
          qrCode: res.result,
          userInfo: null,
          storeId: null,
          storeList: [],
          storeIndex: 0
        })
        this.loadUserInfo()
      },
      fail: (scanError: any) => {
        consumeLog.info('扫码取消或失败:', scanError)
      }
    })
  },

  /**
   * 重新扫码 — 清空顾客数据，保留已填写的金额和备注
   */
  onRescanCode() {
    consumeLog.info('商家点击重新扫码')
    this.setData({
      qrCode: '',
      userInfo: null,
      userInfoLoading: false,
      submitted: false,
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
      consumeLog.info('开始获取用户信息，二维码:', this.data.qrCode)

      const apiResult = await API.getUserInfoByQRCode(this.data.qrCode, this.data.storeId)

      if (apiResult && apiResult.success && apiResult.data) {
        const userData = apiResult.data
        const maskedUserInfo = {
          ...userData,
          mobile_display: formatPhoneNumber(userData.mobile)
        }

        this.setData({
          userInfo: maskedUserInfo,
          userInfoLoading: false
        })
        consumeLog.info('用户信息加载成功:', apiResult.data)
      } else {
        throw new Error(apiResult.message || '获取用户信息失败')
      }
    } catch (loadError: any) {
      consumeLog.error('加载用户信息失败:', loadError)

      if (loadError.code === 'MULTIPLE_STORES_REQUIRE_STORE_ID') {
        const availableStores = (loadError.data && loadError.data.available_stores) || []
        consumeLog.info('多门店员工，需要选择门店:', availableStores)

        this.setData({
          storeList: availableStores,
          userInfoLoading: false
        })

        showToast('请先选择门店')
        return
      }

      this.setData({
        userInfo: null,
        userInfoLoading: false
      })

      const errorContent = this.getErrorContent(loadError)

      wx.showModal({
        title: '加载失败',
        content: errorContent,
        showCancel: true,
        cancelText: '返回',
        confirmText: '重试',
        success: modalResult => {
          if (modalResult.confirm) {
            this.loadUserInfo()
          } else {
            this.setData({ qrCode: '' })
          }
        }
      })
    }
  },

  /**
   * 门店选择变更事件
   */
  onStoreChange(e: any) {
    const index = parseInt(e.detail.value, 10)
    const store = this.data.storeList[index]
    consumeLog.info('选择门店:', store)

    this.setData({
      storeIndex: index,
      storeId: store.store_id
    })

    if (this.data.qrCode && !this.data.userInfo) {
      this.loadUserInfo()
    }
  },

  /**
   * 消费金额输入事件
   */
  onAmountInput(e: any) {
    this.setData({ consumeAmount: e.detail.value })
  },

  /**
   * 商家备注输入事件
   */
  onNotesInput(e: any) {
    this.setData({ merchantNotes: e.detail.value })
  },

  /**
   * 提交消费记录
   *
   * V2升级要点：
   * - 传入 store_id（多门店场景必传）
   * - 幂等键在API层自动生成（放入请求Header Idempotency-Key）
   * - 备注限制升级为500字
   * - 精细化错误码处理
   */
  async onSubmit() {
    if (this.data.loading || this.data.submitted) {
      consumeLog.warn('请勿重复提交')
      return
    }

    if (!this.data.userInfo) {
      showToast('请先扫码识别顾客')
      return
    }

    const amount = parseFloat(this.data.consumeAmount)

    if (!this.data.consumeAmount || isNaN(amount)) {
      showToast('请输入消费金额')
      return
    }

    if (amount < 0.01) {
      showToast('消费金额至少0.01元')
      return
    }

    if (amount > 99999.99) {
      showToast('消费金额不能超过99999.99元')
      return
    }

    if (this.data.storeList.length > 1 && !this.data.storeId) {
      showToast('请先选择门店')
      return
    }

    if (this.data.merchantNotes && this.data.merchantNotes.length > 500) {
      showToast('商家备注不能超过500字')
      return
    }

    const confirmResult = await new Promise(resolve => {
      wx.showModal({
        title: '确认提交',
        content: `用户：${this.data.userInfo.nickname || this.data.userInfo.mobile}\n消费金额：¥${amount.toFixed(2)}元\n\n提交后将创建待审核记录，请确认信息无误。`,
        success: modalRes => {
          resolve(modalRes.confirm)
        }
      })
    })

    if (!confirmResult) {
      consumeLog.info('用户取消提交')
      return
    }

    this.setData({ loading: true })

    try {
      consumeLog.info('开始提交消费记录...')

      const submitResult = await API.submitConsumption({
        qr_code: this.data.qrCode,
        consumption_amount: amount,
        store_id: this.data.storeId || undefined,
        merchant_notes: this.data.merchantNotes || undefined
      })

      consumeLog.info('提交成功:', submitResult)

      this.setData({ submitted: true })

      const resultData = submitResult.data || {}
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
    } catch (submitError: any) {
      consumeLog.error('提交失败:', submitError)
      this.handleSubmitError(submitError)
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 精细化提交错误处理（V2：12种错误码映射）
   */
  handleSubmitError(submitError: any) {
    const errorMap: Record<string, string> = {
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

    const code: string = submitError.code || ''
    const content = errorMap[code] || submitError.message || '提交失败，请重试'

    if (code === 'UNAUTHENTICATED') {
      wx.redirectTo({ url: '/packageUser/auth/auth' })
      return
    }

    if (code === 'MULTIPLE_STORES_REQUIRE_STORE_ID') {
      const availableStores = (submitError.data && submitError.data.available_stores) || []
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
      success: modalRes => {
        if (!modalRes.confirm) {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 根据错误码获取用户友好的错误内容
   */
  getErrorContent(apiError: any) {
    const code: string = apiError.code || ''

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
      `无法获取用户信息：${apiError.message}\n\n可能的原因：\n1. 二维码无效或已过期\n2. 用户不存在\n3. 网络连接异常`
    )
  },

  onShow() {
    consumeLog.info('消费录入页面显示')
  },

  onHide() {
    consumeLog.info('消费录入页面隐藏')
  },

  onUnload() {
    consumeLog.info('消费录入页面卸载')
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})

export {}
