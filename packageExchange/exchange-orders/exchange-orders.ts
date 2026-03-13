/**
 * 兑换订单页面 — 独立全页面版（从exchange-shelf组件中迁移）
 *
 * 业务流程:
 *   pending(待审核) → approved(审核通过) → shipped(已发货)
 *   → received(已收货) → rated(已评价)
 *
 * 后端API:
 *   GET  /api/v4/backpack/exchange/orders                            — 获取兑换订单列表
 *   GET  /api/v4/backpack/exchange/orders/:order_no                  — 获取订单详情
 *   POST /api/v4/backpack/exchange/orders/:order_no/confirm-receipt  — 确认收货
 *   POST /api/v4/backpack/exchange/orders/:order_no/rate             — 评价订单
 *
 * @file packageExchange/exchange-orders/exchange-orders.ts
 */

const { API, Logger, Wechat, Utils } = require('../../utils/index')
const exchangeOrdersLog = Logger.createLogger('exchange-orders-page')
const { showToast } = Wechat

/**
 * 订单状态文案映射（后端权威字段 → 前端展示）
 * 数据库 ENUM 共9态（含 completed 历史兼容态），与后端 exchange_records.status 对齐
 */
const ORDER_STATUS_MAP: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: '待审核', color: '#FF9800', icon: '⏳' },
  approved: { label: '审核通过', color: '#2196F3', icon: '✓' },
  shipped: { label: '已发货', color: '#4CAF50', icon: '🚚' },
  received: { label: '已收货', color: '#00BCD4', icon: '📦' },
  rated: { label: '已评价', color: '#9C27B0', icon: '⭐' },
  rejected: { label: '审核拒绝', color: '#F44336', icon: '✕' },
  refunded: { label: '已退款', color: '#607D8B', icon: '↩' },
  cancelled: { label: '已取消', color: '#9E9E9E', icon: '—' },
  completed: { label: '已完成', color: '#4CAF50', icon: '✓' }
}

/** 筛选Tab配置 */
const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'shipped', label: '待收货' },
  { key: 'received', label: '待评价' },
  { key: 'pending', label: '处理中' }
]

/** 评价文案 */
const RATING_HINTS: Record<number, string> = {
  0: '请点击星星评分',
  1: '非常差',
  2: '较差',
  3: '一般',
  4: '满意',
  5: '非常满意'
}

/** 不同Tab的空状态文案 */
const EMPTY_TEXT_MAP: Record<string, string> = {
  all: '暂无兑换订单',
  shipped: '暂无待收货订单',
  received: '暂无待评价订单',
  pending: '暂无处理中订单'
}

Page({
  data: {
    /** 筛选Tab列表 */
    statusTabs: STATUS_TABS,
    /** 当前筛选Tab */
    currentTab: 'all',

    /** 订单列表（经enrichOrderDisplay处理后的展示数据） */
    orders: [] as any[],
    /** 首屏加载状态 */
    loading: true,
    /** 加载更多状态 */
    loadingMore: false,
    /** 是否无更多数据 */
    noMore: false,
    /** 当前页码 */
    currentPage: 1,
    /** 每页数量 */
    pageSize: 10,

    /** 订单数量统计（各状态计数，由后端返回或前端统计） */
    orderStats: {
      total: 0,
      shipped: 0,
      received: 0,
      pending: 0
    },

    /** 空状态文案 */
    emptyText: EMPTY_TEXT_MAP.all,

    /** 是否展示使用引导 */
    showGuide: false,

    /** 评价弹窗相关 */
    showRatingModal: false,
    ratingOrderNo: '',
    ratingProductName: '',
    ratingScore: 0,
    ratingHint: RATING_HINTS[0],
    ratingSubmitting: false
  },

  onLoad(options: any) {
    exchangeOrdersLog.info('兑换订单页面加载', options)

    const initialTab = options?.tab || 'all'
    if (initialTab !== 'all' && STATUS_TABS.some(t => t.key === initialTab)) {
      this.setData({ currentTab: initialTab })
    }

    const hasSeenGuide = wx.getStorageSync('exchange_orders_guide_seen')
    if (!hasSeenGuide) {
      this.setData({ showGuide: true })
    }

    this.loadOrders(true)
  },

  onShow() {
    exchangeOrdersLog.info('兑换订单页面显示')
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.loadOrders(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /** 触底加载更多 */
  onReachBottom() {
    if (this.data.loadingMore || this.data.noMore) {
      return
    }
    this.loadOrders(false)
  },

  /**
   * 加载兑换订单列表
   * GET /api/v4/backpack/exchange/orders
   *
   * @param reset - 是否重置列表（切换Tab或下拉刷新时为true）
   */
  async loadOrders(reset: boolean = false) {
    if (reset) {
      this.setData({ loading: true, orders: [], currentPage: 1, noMore: false })
    } else {
      this.setData({ loadingMore: true })
    }

    const targetPage = reset ? 1 : this.data.currentPage
    const statusFilter = this.data.currentTab === 'all' ? null : this.data.currentTab

    try {
      const result = await API.getExchangeRecords(targetPage, this.data.pageSize, statusFilter)

      if (result.success && result.data) {
        /** 后端 QueryService.getUserOrders() 返回字段名为 orders（M1 适配） */
        const rawOrders = result.data.orders || []
        const enrichedOrders = rawOrders.map((order: any) => this.enrichOrderDisplay(order))

        const mergedOrders = reset ? enrichedOrders : [...this.data.orders, ...enrichedOrders]
        const pagination = result.data.pagination || {}
        const hasMore = targetPage < (pagination.total_pages || 1)

        this.setData({
          orders: mergedOrders,
          currentPage: targetPage + 1,
          noMore: !hasMore,
          loading: false,
          loadingMore: false
        })

        if (reset) {
          this.updateOrderStats(result.data)
        }

        exchangeOrdersLog.info('兑换订单加载成功:', mergedOrders.length, '条')
      } else {
        throw new Error(result.message || '加载订单失败')
      }
    } catch (error: any) {
      exchangeOrdersLog.error('加载兑换订单失败:', error)
      this.setData({ loading: false, loadingMore: false })
      showToast(error.message || '加载订单失败')
    }
  },

  /**
   * 更新订单数量统计
   * 优先使用后端返回的statistics字段，否则从列表数据统计
   */
  updateOrderStats(responseData: any) {
    const stats = responseData.statistics || responseData.stats
    if (stats) {
      this.setData({
        orderStats: {
          total: stats.total || 0,
          shipped: stats.shipped || 0,
          received: stats.received || 0,
          pending: (stats.pending || 0) + (stats.approved || 0)
        }
      })
    }
  },

  /**
   * 丰富订单展示字段（后端snake_case → 前端展示辅助字段）
   * 以 _ 前缀标记为纯展示辅助字段，与后端业务字段区分
   *
   * M4 适配: 后端 item_snapshot 脱敏后结构为 { item_name, description, image_url }
   *   - 取商品名用 .item_name（不是 .name）
   *   - image_url 可能为 null（商品无图时），用占位图兜底
   */
  enrichOrderDisplay(order: any) {
    const statusInfo = ORDER_STATUS_MAP[order.status] || {
      label: order.status,
      color: '#999',
      icon: '?'
    }
    const itemSnapshot = order.item_snapshot || {}
    const orderNo = order.order_no || ''

    return {
      ...order,
      _statusLabel: statusInfo.label,
      _statusColor: statusInfo.color,
      _statusIcon: statusInfo.icon,
      _productName: itemSnapshot.item_name || '兑换商品',
      _productImage: itemSnapshot.image_url || '/images/default-product.png',
      _hasProductImage: !!itemSnapshot.image_url,
      _payInfo: order.pay_amount ? `${order.pay_amount} ${order.pay_asset_code || ''}` : '',
      _createTime: order.created_at ? this.formatTime(order.created_at) : '',
      _shippedTime: order.shipped_at ? this.formatTime(order.shipped_at) : '',
      _receivedTime: order.received_at ? this.formatTime(order.received_at) : '',
      _approvedTime: order.approved_at ? this.formatTime(order.approved_at) : '',
      _rejectedTime: order.rejected_at ? this.formatTime(order.rejected_at) : '',
      _shortOrderNo:
        orderNo.length > 16 ? `${orderNo.slice(0, 8)}...${orderNo.slice(-4)}` : orderNo,
      _canConfirmReceipt: order.status === 'shipped',
      _canRate: order.status === 'received',
      _canCancel: order.status === 'pending',
      _isAutoConfirmed: order.auto_confirmed === true,
      _ratingStars: order.rating ? '★'.repeat(order.rating) + '☆'.repeat(5 - order.rating) : '',
      _statusDisplayName: order.status_display_name || statusInfo.label
    }
  },

  /** 格式化时间（后端返回 YYYY-MM-DD HH:mm:ss 北京时间 → MM-DD HH:mm） */
  formatTime(isoString: string): string {
    try {
      const date = Utils.safeParseDateString
        ? Utils.safeParseDateString(isoString)
        : new Date(isoString)
      if (!date || isNaN(date.getTime())) {
        return isoString
      }
      const m = String(date.getMonth() + 1).padStart(2, '0')
      const d = String(date.getDate()).padStart(2, '0')
      const h = String(date.getHours()).padStart(2, '0')
      const min = String(date.getMinutes()).padStart(2, '0')
      return `${m}-${d} ${h}:${min}`
    } catch {
      return isoString
    }
  },

  /** 切换筛选Tab */
  onTabChange(e: any) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.currentTab) {
      return
    }

    this.setData({
      currentTab: tab,
      emptyText: EMPTY_TEXT_MAP[tab] || EMPTY_TEXT_MAP.all
    })
    this.loadOrders(true)
  },

  /** 复制订单号 */
  onCopyOrderNo(e: any) {
    const orderNo = e.currentTarget.dataset.no
    if (!orderNo) {
      return
    }
    wx.setClipboardData({
      data: orderNo,
      success: () => showToast('订单号已复制', 'success')
    })
  },

  /** 关闭使用引导 */
  onCloseGuide() {
    this.setData({ showGuide: false })
    wx.setStorageSync('exchange_orders_guide_seen', true)
  },

  /** 跳转商城 */
  goToExchange() {
    wx.switchTab({ url: '/pages/exchange/exchange' })
  },

  /**
   * 确认收货
   * POST /api/v4/backpack/exchange/orders/:order_no/confirm-receipt
   */
  onConfirmReceipt(e: any) {
    const { order_no, product_name } = e.currentTarget.dataset

    if (!order_no) {
      showToast('订单号无效')
      return
    }

    wx.showModal({
      title: '确认收货',
      content: `确认已收到「${product_name || '商品'}」？确认后将无法撤销。`,
      confirmText: '确认收货',
      cancelText: '取消',
      success: async (modalResult: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!modalResult.confirm) {
          return
        }
        await this.executeConfirmReceipt(order_no)
      }
    })
  },

  /** 执行确认收货请求 */
  async executeConfirmReceipt(targetOrderNo: string) {
    try {
      const result = await API.confirmExchangeReceipt(targetOrderNo)

      if (result.success) {
        exchangeOrdersLog.info('确认收货成功:', targetOrderNo)
        showToast('确认收货成功', 'success')
        this.loadOrders(true)
      } else {
        throw new Error(result.message || '确认收货失败')
      }
    } catch (error: any) {
      exchangeOrdersLog.error('确认收货失败:', error)
      showToast(error.message || '确认收货失败，请稍后重试')
    }
  },

  /**
   * 取消订单（仅 pending 状态可取消，后端自动退还资产）
   * POST /api/v4/backpack/exchange/orders/:order_no/cancel
   */
  onCancelOrder(e: any) {
    const { order_no, product_name } = e.currentTarget.dataset

    if (!order_no) {
      showToast('订单号无效')
      return
    }

    wx.showModal({
      title: '取消订单',
      content: `确认取消「${product_name || '商品'}」的兑换订单？取消后已扣除的资产将原路退还。`,
      confirmText: '确认取消',
      confirmColor: '#F44336',
      cancelText: '再想想',
      success: async (modalResult: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!modalResult.confirm) {
          return
        }
        await this.executeCancelOrder(order_no)
      }
    })
  },

  /** 执行取消订单请求 */
  async executeCancelOrder(targetOrderNo: string) {
    try {
      const cancelResult = await API.cancelExchange(targetOrderNo)

      if (cancelResult.success) {
        exchangeOrdersLog.info('取消订单成功:', targetOrderNo)
        showToast('订单已取消，资产已退还', 'success')
        this.loadOrders(true)
      } else {
        throw new Error(cancelResult.message || '取消订单失败')
      }
    } catch (cancelError: any) {
      exchangeOrdersLog.error('取消订单失败:', cancelError)
      showToast(cancelError.message || '取消订单失败，请稍后重试')
    }
  },

  /** 打开评价弹窗 */
  onOpenRating(e: any) {
    const { order_no, product_name } = e.currentTarget.dataset

    if (!order_no) {
      showToast('订单号无效')
      return
    }

    this.setData({
      showRatingModal: true,
      ratingOrderNo: order_no,
      ratingProductName: product_name || '兑换商品',
      ratingScore: 0,
      ratingHint: RATING_HINTS[0]
    })
  },

  /** 选择评价星级 */
  onSelectStar(e: any) {
    const score = parseInt(e.currentTarget.dataset.score, 10)
    if (score >= 1 && score <= 5) {
      this.setData({
        ratingScore: score,
        ratingHint: RATING_HINTS[score] || ''
      })
    }
  },

  /**
   * 提交评价
   * POST /api/v4/backpack/exchange/orders/:order_no/rate
   */
  async onSubmitRating() {
    const { ratingOrderNo, ratingScore } = this.data

    if (!ratingOrderNo) {
      showToast('订单号无效')
      return
    }
    if (!ratingScore || ratingScore < 1 || ratingScore > 5) {
      showToast('请选择评价星级')
      return
    }
    if (this.data.ratingSubmitting) {
      return
    }

    this.setData({ ratingSubmitting: true })

    try {
      const result = await API.rateExchangeOrder(ratingOrderNo, ratingScore)

      if (result.success) {
        exchangeOrdersLog.info('评价提交成功:', ratingOrderNo, ratingScore)
        showToast('评价成功', 'success')
        this.onCloseRatingModal()
        this.loadOrders(true)
      } else {
        throw new Error(result.message || '评价失败')
      }
    } catch (error: any) {
      exchangeOrdersLog.error('评价提交失败:', error)
      showToast(error.message || '评价失败，请稍后重试')
    } finally {
      this.setData({ ratingSubmitting: false })
    }
  },

  /** 关闭评价弹窗 */
  onCloseRatingModal() {
    this.setData({
      showRatingModal: false,
      ratingOrderNo: '',
      ratingProductName: '',
      ratingScore: 0,
      ratingHint: RATING_HINTS[0]
    })
  },

  onShareAppMessage() {
    return {
      title: '我的兑换订单',
      path: '/packageExchange/exchange-orders/exchange-orders'
    }
  }
})
