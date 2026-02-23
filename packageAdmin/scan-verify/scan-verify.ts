// packageAdmin/scan-verify/scan-verify.ts - 商家扫码核销页面（表单优先模式）+ MobX响应式状态
// 后端路由: POST /api/v4/shop/redemption/fulfill（商家域，需role_level>=20）

// 统一工具函数导入
const { API, Utils, Wechat, Logger } = require('../../utils/index')
const log = Logger.createLogger('scan-verify')
const { checkAuth } = Utils
const { showToast } = Wechat

// MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 商家扫码核销页面（表单优先模式）
 *
 * @description
 * 商家员工先确认核销信息，再扫描用户出示的核销码，完成线下核销操作。
 * 参照消费录入页（consume-submit）的"先填资料再扫码"设计模式。
 *
 * 业务流程（三步走）:
 * 1. 核销准备 → 确认门店（多门店场景）、阅读操作须知
 * 2. 扫码核销 → 扫描用户在"我的背包"中生成的核销二维码
 * 3. 核销完成 → 调用 POST /api/v4/shop/redemption/fulfill，展示核销结果
 *
 * 权限要求: 商家店员(role_level>=20)及以上
 *
 * @file packageAdmin/scan-verify/scan-verify.ts
 * @version 5.2.0
 * @since 2026-02-20
 */
Page({
  data: {
    // 步骤控制（1=核销准备, 2=扫码核销, 3=核销完成）
    currentStep: 1,

    // 门店选择（多门店场景，与消费录入页保持一致的交互模式）
    storeId: null as number | null,
    storeList: [] as any[],
    storeIndex: 0,

    // 扫码结果
    scannedCode: '',

    // 核销结果（来自后端 POST /api/v4/shop/redemption/fulfill 响应）
    verifyResult: null,
    verifySuccess: false,

    // 页面状态
    loading: false
  },

  /**
   * 生命周期函数 - 监听页面加载
   *
   * 初始化流程：MobX绑定 → 权限校验 → 加载缓存门店列表
   */
  onLoad() {
    log.info('扫码核销页面加载')

    // MobX Store绑定 - 用户认证状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 权限检查：必须登录
    if (!checkAuth()) {
      return
    }

    // 权限检查：商家店员(role_level>=20)及以上（从MobX Store获取）
    const userInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const roleLevel = userInfo?.role_level || 0
    const hasAccess = roleLevel >= 20

    if (!hasAccess) {
      log.error('用户无商家权限，role_level:', roleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅商家员工和管理员可使用扫码核销功能。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    // 尝试从本地缓存加载门店列表
    this.loadCachedStoreList()
  },

  /**
   * 从本地缓存加载门店列表
   *
   * 门店列表来源于后端 MULTIPLE_STORES_REQUIRE_STORE_ID 错误响应中的 available_stores。
   * 首次使用时无缓存，多门店商家在消费录入或核销过程中触发后自动缓存。
   */
  loadCachedStoreList() {
    try {
      const cachedStores = wx.getStorageSync('merchant_store_list')
      if (cachedStores && Array.isArray(cachedStores) && cachedStores.length > 0) {
        log.info('加载缓存门店列表:', cachedStores.length, '家门店')
        this.setData({ storeList: cachedStores })
      }
    } catch (cacheError) {
      log.warn('加载缓存门店列表失败:', cacheError)
    }
  },

  /**
   * 门店选择变更事件
   */
  onStoreChange(e: any) {
    const index = parseInt(e.detail.value, 10)
    const store = this.data.storeList[index]
    log.info('选择门店:', store)

    this.setData({
      storeIndex: index,
      storeId: store.store_id
    })
  },

  /**
   * 从核销准备（步骤1）进入扫码步骤（步骤2）
   *
   * 多门店商家必须先选择门店才能进入扫码
   */
  onGoToScan() {
    if (this.data.storeList.length > 1 && !this.data.storeId) {
      showToast('请先选择门店')
      return
    }

    this.setData({ currentStep: 2 })
    log.info('进入扫码步骤')
  },

  /**
   * 从扫码步骤（步骤2）返回核销准备（步骤1）
   */
  onBackToPrepare() {
    this.setData({ currentStep: 1 })
    log.info('返回核销准备步骤')
  },

  /**
   * 启动扫码
   *
   * 调用微信扫码API扫描用户出示的核销码二维码。
   * 扫码结果按前缀自动分流：
   *   - RQRV1_ 开头 → 动态QR码核销（POST /api/v4/shop/redemption/scan）
   *   - 其他文本     → 文本码核销（POST /api/v4/shop/redemption/fulfill）
   */
  startScan() {
    log.info('启动扫码...')

    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: res => {
        log.info('扫码成功:', res.result)
        this.setData({ scannedCode: res.result })
        this.dispatchRedemption(res.result)
      },
      fail: error => {
        log.info('扫码取消或失败:', error)
      }
    })
  },

  /**
   * 手动输入文本码核销入口
   *
   * 扫码失败或用户无法出示QR码时的备用方案，
   * 让商家手动输入用户口述的12位Base32文本码（格式 XXXX-YYYY-ZZZZ）。
   */
  onManualInput() {
    wx.showModal({
      title: '手动输入核销码',
      content: '请输入用户提供的12位核销码（如 ABCD-1234-EFGH）',
      editable: true,
      placeholderText: '请输入核销码',
      success: (res: any) => {
        if (res.confirm && res.content) {
          const inputCode = res.content.trim().toUpperCase()
          if (!inputCode) {
            showToast('请输入核销码')
            return
          }
          log.info('手动输入核销码:', inputCode)
          this.setData({ scannedCode: inputCode })
          this.dispatchRedemption(inputCode)
        }
      }
    })
  },

  /**
   * 核销请求分流（根据码格式自动选择API端点）
   *
   * RQRV1_ 前缀 → 动态QR码核销（含HMAC签名验证，主要方式）
   * 其他格式     → 12位Base32文本码核销（备用方式）
   *
   * 两种方式共用后端 RedemptionService.fulfillOrder()，区别在于入参来源和签名验证。
   *
   * @param codeContent - 扫码结果或手动输入的核销码内容
   */
  async dispatchRedemption(codeContent: string) {
    if (!codeContent) {
      showToast('核销码不能为空')
      return
    }

    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      const isQRCode = codeContent.startsWith('RQRV1_')
      log.info('核销分流:', isQRCode ? 'QR码核销' : '文本码核销')

      let result: any = null

      if (isQRCode) {
        const scanParams: { qr_content: string; store_id?: number } = {
          qr_content: codeContent
        }
        if (this.data.storeId) {
          scanParams.store_id = this.data.storeId
        }
        result = await API.scanRedemptionQR(scanParams)
      } else {
        const fulfillParams: { redeem_code: string; store_id?: number } = {
          redeem_code: codeContent
        }
        if (this.data.storeId) {
          fulfillParams.store_id = this.data.storeId
        }
        result = await API.fulfillRedemption(fulfillParams)
      }

      if (result && result.success) {
        log.info('核销成功:', result.data)

        const responseData = result.data || {}
        const orderData = responseData.order || {}
        const itemData = responseData.item_instance || {}
        const redeemerData = responseData.redeemer || {}
        const storeData = responseData.store || {}

        const flatResult = {
          redemption_order_id: orderData.redemption_order_id,
          fulfilled_at: orderData.fulfilled_at,
          item_name: itemData.name,
          redeemer_nickname: redeemerData.nickname,
          store_name: storeData.store_name
        }

        this.setData({
          currentStep: 3,
          verifyResult: flatResult,
          verifySuccess: true,
          loading: false
        })

        showToast('核销成功', 'success')
      } else {
        throw new Error(result?.message || '核销失败')
      }
    } catch (error: any) {
      log.error('核销失败:', error)
      this.handleRedemptionError(error)
    }
  },

  /**
   * 核销错误统一处理（QR码核销和文本码核销共用）
   *
   * 后端错误码说明：
   *   BAD_REQUEST                        — 核销码无效
   *   EXPIRED                            — 核销码已过期
   *   CONFLICT                           — 核销码已被使用
   *   QR_SIGNATURE_INVALID               — QR码签名验证失败（可能被篡改）
   *   QR_EXPIRED                         — QR码已过期（超过5分钟，需用户刷新）
   *   MULTIPLE_STORES_REQUIRE_STORE_ID   — 多门店商家需先选择门店
   *
   * @param error - 后端返回的错误对象（含 code / message / data 字段）
   */
  handleRedemptionError(error: any) {
    if (error.code === 'MULTIPLE_STORES_REQUIRE_STORE_ID') {
      const availableStores = (error.data && error.data.available_stores) || []
      log.info('多门店商家需选择门店:', availableStores)

      if (availableStores.length > 0) {
        wx.setStorageSync('merchant_store_list', availableStores)

        this.setData({
          storeList: availableStores,
          currentStep: 1,
          loading: false,
          scannedCode: ''
        })

        showToast('请先选择门店')
        return
      }
    }

    const errorCode = error.code || ''
    const errorMessages: Record<string, string> = {
      BAD_REQUEST: '核销码无效，请检查后重试',
      EXPIRED: '核销码已过期，请联系用户重新生成',
      CONFLICT: '核销码已被使用',
      QR_SIGNATURE_INVALID: 'QR码签名无效，请让用户刷新二维码后重试',
      QR_EXPIRED: 'QR码已过期，请让用户刷新二维码后重新扫码'
    }

    const errorContent = errorMessages[errorCode] || error.message || '请检查核销码是否有效'

    this.setData({
      currentStep: 3,
      verifyResult: { error: errorContent },
      verifySuccess: false,
      loading: false
    })

    wx.showModal({
      title: '核销失败',
      content: errorContent,
      showCancel: true,
      cancelText: '返回',
      confirmText: '重新核销',
      success: res => {
        if (res.confirm) {
          this.onRescan()
        }
      }
    })
  },

  /**
   * 核销成功后继续核销 — 直接进入扫码步骤（保留门店选择）
   *
   * 连续核销场景：商家门店信息不变，无需每次重新选择
   */
  onContinueScan() {
    this.setData({
      currentStep: 2,
      scannedCode: '',
      verifyResult: null,
      verifySuccess: false
    })
    log.info('继续核销，直接进入扫码步骤')
  },

  /**
   * 重新核销 — 回到核销准备步骤（步骤1）
   *
   * 核销失败或需要重新选择门店时使用
   */
  onRescan() {
    this.setData({
      currentStep: 1,
      scannedCode: '',
      verifyResult: null,
      verifySuccess: false
    })
    log.info('重新核销，回到准备步骤')
  },

  /**
   * 生命周期函数 - 监听页面显示
   */
  onShow() {
    log.info('扫码核销页面显示')
  },

  /**
   * 生命周期函数 - 监听页面卸载
   */
  onUnload() {
    log.info('扫码核销页面卸载')
    // 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})
