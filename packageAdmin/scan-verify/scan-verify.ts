// packageAdmin/scan-verify/scan-verify.ts - 商家扫码核销页面 + MobX响应式状态
// 后端路由: POST /api/v4/shop/redemption/fulfill（商家域，需role_level>=20）

// 统一工具函数导入
const { API, Utils, Logger } = require('../../utils/index')
const log = Logger.createLogger('scan-verify')
const { checkAuth } = Utils

// 🆕 MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 商家扫码核销页面
 *
 * @description
 * 商家员工扫描用户出示的核销码，完成线下核销操作。
 *
 * 业务流程（美团模式）:
 * 1. 用户在背包中点击物品"使用" → 生成核销码（二维码/数字码）
 * 2. 用户到店出示核销码
 * 3. 商家员工在此页面扫码
 * 4. 调用 POST /api/v4/shop/redemption/fulfill 完成核销
 * 5. 核销成功后物品状态变为 used
 *
 * 权限要求: 商家店员(role_level>=20)及以上
 *
 * @file packageAdmin/scan-verify/scan-verify.ts
 * @version 5.2.0
 * @since 2026-02-10
 */
Page({
  data: {
    // 扫码结果
    scannedCode: '',

    // 核销结果
    verifyResult: null,
    verifySuccess: false,

    // 页面状态
    loading: false,
    hasScanned: false
  },

  /**
   * 生命周期函数 - 监听页面加载
   */
  onLoad() {
    log.info('📱 扫码核销页面加载')

    // 🆕 MobX Store绑定 - 用户认证状态自动同步
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
    const hasAccess = roleLevel >= 20 || userInfo?.is_admin === true

    if (!hasAccess) {
      log.error('❌ 用户无商家权限，role_level:', roleLevel)
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

    // 自动启动扫码
    this.startScan()
  },

  /**
   * 启动扫码
   *
   * @description
   * 调用微信扫码API扫描用户的核销码二维码
   */
  startScan() {
    log.info('📷 启动扫码...')

    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success: res => {
        log.info('✅ 扫码成功:', res.result)
        this.setData({
          scannedCode: res.result,
          hasScanned: true
        })

        // 自动执行核销
        this.handleFulfill(res.result)
      },
      fail: error => {
        log.info('📷 扫码取消或失败:', error)
        // 用户取消扫码，不做任何处理
      }
    })
  },

  /**
   * 执行核销操作
   *
   * @description
   * 调用后端API完成核销。
   * 后端路由: POST /api/v4/shop/redemption/fulfill
   * 请求参数: { redeem_code: "XXXX-YYYY-ZZZZ" }
   *
   * 后端响应格式:
   * {
   *   order: { order_id, fulfilled_at },
   *   item_instance: { item_instance_id, name, status },
   *   redeemer: { user_id, nickname }
   * }
   *
   * 后端错误码: BAD_REQUEST(无效) / EXPIRED(过期) / CONFLICT(已使用)
   *
   * @param redeemCode - 扫描到的核销码字符串
   */
  async handleFulfill(redeemCode: string) {
    if (!redeemCode) {
      wx.showToast({ title: '核销码不能为空', icon: 'none' })
      return
    }

    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      log.info('📤 开始核销，核销码:', redeemCode)

      // 后端要求参数名为 redeem_code
      const result = await API.fulfillRedemption({ redeem_code: redeemCode })

      if (result && result.success) {
        log.info('✅ 核销成功:', result.data)

        // 将嵌套的后端响应数据展平为模板需要的格式
        const responseData = result.data || {}
        const flatResult = {
          order_id: responseData.order && responseData.order.order_id,
          fulfilled_at: responseData.order && responseData.order.fulfilled_at,
          item_name: responseData.item_instance && responseData.item_instance.name,
          redeemer_nickname: responseData.redeemer && responseData.redeemer.nickname
        }

        this.setData({
          verifyResult: flatResult,
          verifySuccess: true,
          loading: false
        })

        wx.showToast({
          title: '核销成功',
          icon: 'success',
          duration: 2000
        })
      } else {
        throw new Error(result?.message || '核销失败')
      }
    } catch (error: any) {
      log.error('❌ 核销失败:', error)

      // 后端错误码映射为用户友好提示
      const errorCode = error.code || ''
      const errorMessages = {
        BAD_REQUEST: '核销码无效，请检查后重试',
        EXPIRED: '核销码已过期，请联系用户重新生成',
        CONFLICT: '核销码已被使用'
      }

      const errorContent =
        (errorMessages as Record<string, string>)[errorCode] ||
        error.message ||
        '请检查核销码是否有效'

      this.setData({
        verifyResult: { error: errorContent },
        verifySuccess: false,
        loading: false
      })

      wx.showModal({
        title: '核销失败',
        content: errorContent,
        showCancel: true,
        cancelText: '返回',
        confirmText: '重新扫码',
        success: res => {
          if (res.confirm) {
            this.startScan()
          }
        }
      })
    }
  },

  /**
   * 重新扫码
   */
  onRescan() {
    this.setData({
      scannedCode: '',
      verifyResult: null,
      verifySuccess: false,
      hasScanned: false
    })
    this.startScan()
  },

  /**
   * 生命周期函数 - 监听页面显示
   */
  onShow() {
    log.info('📱 扫码核销页面显示')
  },

  /**
   * 生命周期函数 - 监听页面卸载
   */
  onUnload() {
    log.info('📱 扫码核销页面卸载')
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})

export {}
