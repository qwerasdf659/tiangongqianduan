/**
 * 兑换订单管理组件（Phase 3：确认收货 + 评价）
 *
 * 业务流程:
 *   pending(待审核) → approved(审核通过) → shipped(已发货) → received(已收货) → rated(已评价)
 *   shipped → 用户点击"确认收货" → received
 *   received → 用户点击"评价" → rated
 *   shipped 且 shipped_at + 7天 → 系统自动确认（auto_confirmed=true）
 *
 * 后端API:
 *   GET  /api/v4/backpack/exchange/orders         — 获取兑换订单列表
 *   GET  /api/v4/backpack/exchange/orders/:order_no — 获取订单详情
 *   POST /api/v4/backpack/exchange/orders/:order_no/confirm-receipt — 确认收货
 *   POST /api/v4/backpack/exchange/orders/:order_no/rate — 评价订单
 *
 * ⚠️ confirm-receipt 和 rate 接口需要后端 Phase 3 实施完成后才可调用
 *    后端需完成: exchange_records ENUM 扩展 + 路由注册
 *
 * @file packageExchange/exchange-shelf/sub/exchange-orders/exchange-orders.ts
 * @version 5.2.0
 * @since 2026-02-22
 */

const { API, Logger, Wechat, Utils } = require('../../../../utils/index')
const ordersLog = Logger.createLogger('exchange-orders')
const { showToast } = Wechat

/**
 * 订单状态文案映射（后端权威字段 → 前端展示）
 * 数据库 ENUM 共9态（含 completed 历史兼容态），与后端 exchange_records.status 对齐
 */
const ORDER_STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: '#FF9800' },
  approved: { label: '审核通过', color: '#2196F3' },
  shipped: { label: '已发货', color: '#4CAF50' },
  received: { label: '已收货', color: '#00BCD4' },
  rated: { label: '已评价', color: '#9C27B0' },
  rejected: { label: '审核拒绝', color: '#F44336' },
  refunded: { label: '已退款', color: '#607D8B' },
  cancelled: { label: '已取消', color: '#9E9E9E' },
  completed: { label: '已完成', color: '#4CAF50' }
}

/** 筛选Tab配置 */
const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'shipped', label: '待收货' },
  { key: 'received', label: '待评价' },
  { key: 'pending', label: '处理中' }
]

Component({
  properties: {
    /** 组件是否可见 */
    visible: { type: Boolean, value: false }
  },

  data: {
    /** 筛选Tab列表 */
    statusTabs: STATUS_TABS,
    /** 当前筛选Tab */
    currentTab: 'all',

    /** 订单列表 */
    orders: [] as any[],
    /** 加载状态 */
    loading: false,
    /** 是否无更多数据 */
    noMore: false,
    /** 当前页码 */
    page: 1,
    /** 每页数量 */
    pageSize: 10,

    /** 评价弹窗 */
    showRatingModal: false,
    /** 当前评价的订单号 */
    ratingOrderNo: '',
    /** 当前评价的商品名 */
    ratingProductName: '',
    /** 评价星级（1-5） */
    ratingScore: 0,
    /** 评价提交中 */
    ratingSubmitting: false
  },

  observers: {
    visible(visible: boolean) {
      if (visible) {
        this.loadOrders(true)
      }
    }
  },

  methods: {
    /**
     * 加载兑换订单列表
     * GET /api/v4/backpack/exchange/orders
     *
     * @param reset - 是否重置列表（切换Tab或首次加载时为true）
     */
    async loadOrders(reset: boolean = false) {
      if (this.data.loading) {
        return
      }

      const page = reset ? 1 : this.data.page
      const statusFilter = this.data.currentTab === 'all' ? null : this.data.currentTab

      this.setData({ loading: true })
      if (reset) {
        this.setData({ orders: [], page: 1, noMore: false })
      }

      try {
        const result = await API.getExchangeRecords(page, this.data.pageSize, statusFilter)

        if (result.success && result.data) {
          /** 后端 QueryService.getUserOrders() 返回字段名为 orders（M1 适配） */
          const rawOrders = result.data.orders || []
          const enrichedOrders = rawOrders.map((order: any) => this.enrichOrderDisplay(order))

          const totalOrders = reset ? enrichedOrders : [...this.data.orders, ...enrichedOrders]
          const pagination = result.data.pagination || {}
          const hasMore = page < (pagination.total_pages || 1)

          this.setData({
            orders: totalOrders,
            page: page + 1,
            noMore: !hasMore,
            loading: false
          })

          ordersLog.info('兑换订单加载成功:', totalOrders.length, '条')
        } else {
          throw new Error(result.message || '加载订单失败')
        }
      } catch (error: any) {
        ordersLog.error('加载兑换订单失败:', error)
        this.setData({ loading: false })
        showToast(error.message || '加载订单失败')
      }
    },

    /**
     * 丰富订单展示字段（后端返回snake_case → 前端展示辅助字段）
     *
     * @param order - 后端返回的原始订单数据
     * @returns 附加了展示辅助字段的订单对象
     */
    enrichOrderDisplay(order: any) {
      const statusInfo = ORDER_STATUS_MAP[order.status] || { label: order.status, color: '#999' }
      const itemSnapshot = order.item_snapshot || {}

      return {
        ...order,
        _statusLabel: statusInfo.label,
        _statusColor: statusInfo.color,
        _productName: itemSnapshot.item_name || '兑换商品',
        _payInfo: order.pay_amount ? `${order.pay_amount} ${order.pay_asset_code || ''}` : '',
        _createTime: order.created_at ? this.formatTime(order.created_at) : '',
        _shippedTime: order.shipped_at ? this.formatTime(order.shipped_at) : '',
        _canConfirmReceipt: order.status === 'shipped',
        _canRate: order.status === 'received',
        _isAutoConfirmed: order.auto_confirmed === true,
        _ratingStars: order.rating ? this.generateStars(order.rating) : ''
      }
    },

    /**
     * 格式化时间（ISO8601 → YYYY-MM-DD HH:mm）
     */
    formatTime(isoString: string): string {
      try {
        const date = Utils.safeParseDateString
          ? Utils.safeParseDateString(isoString)
          : new Date(isoString)
        if (!date || isNaN(date.getTime())) {
          return isoString
        }
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        const h = String(date.getHours()).padStart(2, '0')
        const min = String(date.getMinutes()).padStart(2, '0')
        return `${y}-${m}-${d} ${h}:${min}`
      } catch {
        return isoString
      }
    },

    /**
     * 生成星级展示文本
     */
    generateStars(rating: number): string {
      return '★'.repeat(rating) + '☆'.repeat(5 - rating)
    },

    /**
     * 切换筛选Tab
     */
    onTabChange(e: any) {
      const tab = e.currentTarget.dataset.tab
      if (tab === this.data.currentTab) {
        return
      }

      this.setData({ currentTab: tab })
      this.loadOrders(true)
    },

    /**
     * 加载更多订单（滚动到底部触发）
     */
    onLoadMore() {
      if (this.data.loading || this.data.noMore) {
        return
      }
      this.loadOrders(false)
    },

    /**
     * 确认收货
     * POST /api/v4/backpack/exchange/orders/:order_no/confirm-receipt
     *
     * ⚠️ 需要后端 Phase 3 ENUM 扩展完成后才可调用
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
        success: async (res: any) => {
          if (!res.confirm) {
            return
          }
          await this.executeConfirmReceipt(order_no)
        }
      })
    },

    /**
     * 执行确认收货请求
     */
    async executeConfirmReceipt(order_no: string) {
      try {
        const result = await API.confirmExchangeReceipt(order_no)

        if (result.success) {
          ordersLog.info('确认收货成功:', order_no)
          showToast('确认收货成功', 'success')
          this.loadOrders(true)
        } else {
          throw new Error(result.message || '确认收货失败')
        }
      } catch (error: any) {
        ordersLog.error('确认收货失败:', error)
        showToast(error.message || '确认收货失败，请稍后重试')
      }
    },

    /**
     * 打开评价弹窗
     */
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
        ratingScore: 0
      })
    },

    /**
     * 选择评价星级
     */
    onSelectStar(e: any) {
      const score = parseInt(e.currentTarget.dataset.score, 10)
      if (score >= 1 && score <= 5) {
        this.setData({ ratingScore: score })
      }
    },

    /**
     * 提交评价
     * POST /api/v4/backpack/exchange/orders/:order_no/rate
     *
     * ⚠️ 需要后端 Phase 3 状态扩展完成后才可调用
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
          ordersLog.info('评价提交成功:', ratingOrderNo, ratingScore)
          showToast('评价成功', 'success')
          this.closeRatingModal()
          this.loadOrders(true)
        } else {
          throw new Error(result.message || '评价失败')
        }
      } catch (error: any) {
        ordersLog.error('评价提交失败:', error)
        showToast(error.message || '评价失败，请稍后重试')
      } finally {
        this.setData({ ratingSubmitting: false })
      }
    },

    /**
     * 关闭评价弹窗
     */
    closeRatingModal() {
      this.setData({
        showRatingModal: false,
        ratingOrderNo: '',
        ratingProductName: '',
        ratingScore: 0
      })
    },

    /**
     * 关闭订单面板
     */
    onClose() {
      this.triggerEvent('close')
    }
  }
})
