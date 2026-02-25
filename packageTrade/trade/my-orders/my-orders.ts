/**
 * 买方订单管理页面 — 购买后的订单列表 + 担保码确认收货 + 取消交易
 *
 * 业务场景：
 *   用户在交易市场购买商品后，在此管理所有购买订单。
 *   实物交易（listing_kind='item'）需要输入卖家提供的6位担保码完成交易。
 *   资产交易（listing_kind='fungible_asset'）自动完成，无需担保码。
 *
 * 后端API:
 *   GET  /api/v4/market/my-orders                         → 买方订单列表
 *   GET  /api/v4/market/trade-orders/:id/escrow-status   → 查询担保码状态
 *   POST /api/v4/market/trade-orders/:id/confirm-delivery → 输入担保码确认收货
 *   POST /api/v4/market/trade-orders/:id/cancel           → 取消交易
 *
 * @file packageTrade/trade/my-orders/my-orders.ts
 * @version 5.2.0
 * @since 2026-02-25
 */

const { API, Logger: OrderLogger, Utils: OrderUtils, Wechat: OrderWechat } = require('../../../utils/index')
const orderLog = OrderLogger.createLogger('my-orders')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

/** 交易订单状态UI配置（对齐后端 trade_orders 状态机） */
const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  created: { label: '待确认', color: '#faad14' },
  frozen: { label: '待确认', color: '#faad14' },
  completed: { label: '已完成', color: '#52c41a' },
  cancelled: { label: '已取消', color: '#999999' },
  failed: { label: '交易失败', color: '#ff4d4f' }
}

Page({
  data: {
    /** 订单列表（后端 trade_orders 表） */
    orders: [] as any[],

    /** 页面状态 */
    loading: true,
    isEmpty: false,
    hasError: false,
    errorMessage: '',

    /** 担保码输入弹窗 */
    showEscrowInput: false,
    escrowInputValue: '',
    escrowInputFocused: false,
    escrowOrderId: 0,
    escrowConfirming: false,

    /** 取消交易弹窗 */
    cancellingOrderId: 0,

    /** 担保码状态查询中 */
    escrowStatusLoading: false,
    escrowStatusData: null as any,
    showEscrowStatus: false
  },

  storeBindings: null as any,

  onLoad() {
    orderLog.info('买方订单页面加载')

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this._loadOrders()
  },

  onShow() {
    if (!this.data.loading && userStore.isLoggedIn) {
      this._loadOrders()
    }
  },

  onUnload() {
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  /**
   * 加载买方订单列表
   * 后端API: GET /api/v4/market/my-orders
   * 响应: { orders: TradeOrder[], pagination: { page, limit, total, total_pages } }
   */
  async _loadOrders() {
    if (!userStore.isLoggedIn) {
      orderLog.info('用户未登录')
      this.setData({ loading: false })
      OrderWechat.showToast('请先登录')
      setTimeout(() => { wx.navigateTo({ url: '/packageUser/auth/auth' }) }, 1500)
      return
    }

    this.setData({ loading: true, hasError: false })

    try {
      const ordersResponse = await API.getMyOrders({ page: 1, limit: 50 })

      if (ordersResponse && ordersResponse.success && ordersResponse.data) {
        const rawOrders: any[] = ordersResponse.data.orders || []

        const orderList = rawOrders.map((order: any) => {
          const statusConfig = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.created
          const parsedDate = OrderUtils.safeParseDateString
            ? OrderUtils.safeParseDateString(order.created_at)
            : new Date(order.created_at)

          return {
            ...order,
            statusLabel: statusConfig.label,
            statusColor: statusConfig.color,
            kindLabel: order.listing_kind === 'fungible_asset' ? '资产' : '物品',
            formattedTime: parsedDate ? OrderUtils.formatTime(parsedDate) : (order.created_at || ''),
            display_name: order.display_name || '商品'
          }
        })

        this.setData({
          orders: orderList,
          isEmpty: orderList.length === 0,
          loading: false
        })

        orderLog.info(`订单加载完成: ${orderList.length} 条`)
      } else {
        this.setData({ orders: [], isEmpty: true, loading: false })
      }
    } catch (loadError: any) {
      orderLog.error('加载订单失败:', loadError)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: loadError.message || '加载失败，请重试'
      })
    }
  },

  /**
   * 打开担保码输入弹窗（买方侧）
   * 用户输入卖家提供的6位担保码完成收货确认
   */
  onOpenEscrowInput(e: any) {
    const tradeOrderId = e.currentTarget.dataset.orderId
    if (!tradeOrderId) {
      return
    }
    this.setData({
      showEscrowInput: true,
      escrowInputValue: '',
      escrowInputFocused: true,
      escrowOrderId: tradeOrderId
    })
  },

  /** 担保码输入值变化 — 仅允许6位数字 */
  onEscrowInputChange(e: any) {
    const rawValue = (e.detail.value || '').replace(/[^0-9]/g, '').slice(0, 6)
    this.setData({ escrowInputValue: rawValue })
  },

  /** 关闭担保码输入弹窗 */
  onCloseEscrowInput() {
    this.setData({
      showEscrowInput: false,
      escrowInputValue: '',
      escrowInputFocused: false,
      escrowOrderId: 0
    })
  },

  /** 点击圆点区域重新聚焦输入框 */
  onFocusEscrowInput() {
    this.setData({ escrowInputFocused: false }, () => {
      this.setData({ escrowInputFocused: true })
    })
  },

  /**
   * 提交担保码确认收货
   * 后端: POST /api/v4/market/trade-orders/:trade_order_id/confirm-delivery
   */
  async onSubmitEscrowCode() {
    const { escrowOrderId, escrowInputValue, escrowConfirming } = this.data
    if (!escrowOrderId || escrowConfirming) {
      return
    }

    if (!/^\d{6}$/.test(escrowInputValue)) {
      OrderWechat.showToast('请输入6位数字担保码')
      return
    }

    this.setData({ escrowConfirming: true })

    try {
      const result = await API.confirmDelivery(escrowOrderId, escrowInputValue)

      if (result && result.success) {
        orderLog.info('担保码确认成功:', escrowOrderId)
        this.setData({
          escrowConfirming: false,
          showEscrowInput: false,
          escrowInputValue: '',
          escrowInputFocused: false,
          escrowOrderId: 0
        })
        wx.showModal({
          title: '交易完成',
          content: '收货确认成功！资产已转给卖家。',
          showCancel: false,
          confirmText: '好的'
        })
        this._loadOrders()
      } else {
        throw new Error((result && result.message) || '确认失败')
      }
    } catch (confirmError: any) {
      orderLog.error('担保码确认失败:', confirmError)
      this.setData({ escrowConfirming: false })

      let errorTip = confirmError.message || '确认失败，请重试'
      if (confirmError.code === 'INVALID_ESCROW_CODE') {
        errorTip = '担保码错误，请核对后重新输入'
      } else if (confirmError.code === 'ESCROW_EXPIRED') {
        errorTip = '担保码已过期，交易已自动取消'
      }

      OrderWechat.showToast(errorTip)
    }
  },

  /**
   * 查询担保码状态
   * 后端: GET /api/v4/market/trade-orders/:trade_order_id/escrow-status
   */
  async onViewEscrowStatus(e: any) {
    const tradeOrderId = e.currentTarget.dataset.orderId
    if (!tradeOrderId || this.data.escrowStatusLoading) {
      return
    }

    this.setData({ escrowStatusLoading: true, showEscrowStatus: true })

    try {
      const result = await API.getEscrowStatus(tradeOrderId)
      if (result && result.success && result.data) {
        this.setData({
          escrowStatusData: result.data,
          escrowStatusLoading: false
        })
      } else {
        throw new Error((result && result.message) || '查询失败')
      }
    } catch (statusError: any) {
      orderLog.error('查询担保状态失败:', statusError)
      this.setData({
        escrowStatusLoading: false,
        showEscrowStatus: false
      })
      OrderWechat.showToast(statusError.message || '查询失败')
    }
  },

  /** 关闭担保码状态弹窗 */
  onCloseEscrowStatus() {
    this.setData({ showEscrowStatus: false, escrowStatusData: null })
  },

  /**
   * 取消交易
   * 后端: POST /api/v4/market/trade-orders/:trade_order_id/cancel
   */
  onCancelOrder(e: any) {
    const tradeOrderId = e.currentTarget.dataset.orderId
    if (!tradeOrderId) {
      return
    }

    wx.showModal({
      title: '确认取消',
      content: '确定要取消此交易吗？取消后冻结的资产将返还。',
      confirmText: '确认取消',
      confirmColor: '#ff4d4f',
      success: async (res: any) => {
        if (!res.confirm) {
          return
        }

        this.setData({ cancellingOrderId: tradeOrderId })
        try {
          const cancelResult = await API.cancelTradeOrder(tradeOrderId)
          if (cancelResult && cancelResult.success) {
            orderLog.info('交易取消成功:', tradeOrderId)
            OrderWechat.showToast('交易已取消', 'success')
            this._loadOrders()
          } else {
            throw new Error((cancelResult && cancelResult.message) || '取消失败')
          }
        } catch (cancelError: any) {
          orderLog.error('取消交易失败:', cancelError)
          OrderWechat.showToast(cancelError.message || '取消失败，请重试')
        } finally {
          this.setData({ cancellingOrderId: 0 })
        }
      }
    })
  },

  /** 跳转到挂单详情 */
  onViewListing(e: any) {
    const listingId = e.currentTarget.dataset.listingId
    if (listingId) {
      wx.navigateTo({
        url: `/packageTrade/trade/listing-detail/listing-detail?listing_id=${listingId}`
      })
    }
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this._loadOrders().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /** 分享 */
  onShareAppMessage() {
    return {
      title: '我的交易订单 - 天工交易市场',
      path: '/packageTrade/trade/my-orders/my-orders'
    }
  }
})
