/**
 * 我的核销订单列表页面
 *
 * 业务语义: 用户查看自己的兑换/核销订单（仅本人）。对已核销（fulfilled）订单可自助发起售后申诉。
 * 议题三落地：售后链路（POST /system/disputes，order_type=redemption）已就绪，本页提供入口按钮。
 *
 * 后端API:
 * - GET /api/v4/shop/redemption/me — 我的核销订单列表（按 redeemer_user_id 过滤，仅本人）
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   records[] 每条含: redemption_order_id(UUID) / order_no / status /
 *                     fulfilled_at(北京时间对象) / created_at / item:{ item_id, item_name }
 *   pagination: { total, page, page_size, total_pages }
 *
 * @file packageUser/redemption-orders/redemption-orders.ts
 * @version 5.2.0
 * @since 2026-06-16
 */

const { API, Wechat, Logger, Utils } = require('../../utils/index')
const redemptionOrdersLog = Logger.createLogger('redemption-orders')
const { showToast } = Wechat
const { checkAuth } = Utils

/** 核销订单状态文案映射（对齐后端 redemption_orders.status 枚举） */
const STATUS_MAP: Record<string, { label: string; theme: string }> = {
  pending: { label: '待核销', theme: 'warning' },
  fulfilled: { label: '已核销', theme: 'success' },
  cancelled: { label: '已取消', theme: 'default' },
  expired: { label: '已过期', theme: 'default' }
}

/** 筛选Tab配置（status 直传后端，'all' 不传） */
const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'fulfilled', label: '已核销' },
  { key: 'pending', label: '待核销' }
]

/** 不同Tab的空状态文案 */
const EMPTY_TEXT_MAP: Record<string, string> = {
  all: '暂无核销订单',
  fulfilled: '暂无已核销订单',
  pending: '暂无待核销订单'
}

Page({
  data: {
    statusTabs: STATUS_TABS,
    currentTab: 'all',
    orders: [] as any[],
    loadStatus: 'loading' as 'loading' | 'success' | 'empty' | 'error',
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    totalPages: 1,
    hasMore: false,
    loadingMore: false,
    emptyText: EMPTY_TEXT_MAP.all
  },

  onLoad() {
    redemptionOrdersLog.info('我的核销订单页面加载')
    if (!checkAuth()) {
      redemptionOrdersLog.warn('用户未登录，已自动跳转')
      return
    }
    this.loadOrders(1, false)
  },

  async onPullDownRefresh() {
    await this.loadOrders(1, false)
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadOrders(this.data.currentPage + 1, true)
    }
  },

  /** 页码翻页栏跳转（替换式加载，只展示目标页） */
  onPagerChange(e: any) {
    const page = e.detail && e.detail.page
    if (!page || this.data.loadingMore) {
      return
    }
    this.loadOrders(page, false)
  },

  /** 切换筛选Tab */
  onTabChange(e: any) {
    const tab = e.currentTarget?.dataset?.tab
    if (!tab || tab === this.data.currentTab) {
      return
    }
    this.setData({
      currentTab: tab,
      emptyText: EMPTY_TEXT_MAP[tab] || EMPTY_TEXT_MAP.all
    })
    this.loadOrders(1, false)
  },

  /**
   * 加载核销订单列表（后端按JWT中的user_id做数据隔离，只返回本人订单）
   *
   * @param page - 目标页码（1 基）
   * @param append - true=追加（触底加载），false=替换（首屏/下拉/Tab/页码跳转）
   */
  async loadOrders(page: number = 1, append: boolean = false) {
    if (append) {
      this.setData({ loadingMore: true })
    } else {
      this.setData({ loadStatus: 'loading' })
    }

    const statusFilter = this.data.currentTab === 'all' ? null : this.data.currentTab

    try {
      const result = await API.getMyRedemptionOrders({
        status: statusFilter,
        page,
        page_size: this.data.pageSize
      })

      if (result.success && result.data) {
        const rawRecords = result.data.records || []
        const pagination = result.data.pagination || {}
        const totalCount = pagination.total || 0
        const totalPages = pagination.total_pages || 1

        const processed = rawRecords.map((order: any) => this.processOrderItem(order))
        const merged = append ? [...this.data.orders, ...processed] : processed

        this.setData({
          orders: merged,
          currentPage: page,
          totalCount,
          totalPages,
          hasMore: page < totalPages,
          loadingMore: false,
          loadStatus: merged.length > 0 ? 'success' : 'empty'
        })

        redemptionOrdersLog.info('核销订单加载成功:', merged.length, '条，第', page, '页')
      } else {
        if (!append) {
          this.setData({ orders: [], loadStatus: 'empty' })
        }
        this.setData({ loadingMore: false })
      }
    } catch (error) {
      redemptionOrdersLog.error('加载核销订单失败:', error)
      this.setData({ loadingMore: false })
      if (!append) {
        this.setData({ loadStatus: 'error' })
      }
      showToast('加载核销订单失败')
    }
  },

  /** 重试加载 */
  retryLoad() {
    this.loadOrders(1, false)
  },

  /**
   * 处理单条核销订单（后端snake_case → 页面展示格式，保留原始字段供售后入口直读）
   */
  processOrderItem(order: any) {
    const status = order.status || 'pending'
    const statusInfo = STATUS_MAP[status] || { label: status, theme: 'default' }
    const itemName = order.item?.item_name || '核销物品'
    const orderNo = order.order_no || ''

    return {
      ...order,
      _itemName: itemName,
      _statusLabel: statusInfo.label,
      _statusTheme: statusInfo.theme,
      _fulfilledAt: this.formatBeijingTime(order.fulfilled_at),
      _createdAt: this.formatBeijingTime(order.created_at),
      _shortOrderNo:
        orderNo.length > 16 ? `${orderNo.slice(0, 8)}...${orderNo.slice(-4)}` : orderNo,
      /* 仅已核销订单可发起售后（对齐后端 TradeDisputeService 按 fulfilled 校验） */
      _canApplyAfterSale: status === 'fulfilled'
    }
  },

  /**
   * 格式化后端北京时间字段（formatForAPI 输出对象 { beijing, utc } 或字符串）
   * 优先取 .beijing 直显，降级用 safeParseDateString 解析。
   */
  formatBeijingTime(value: any): string {
    if (!value) {
      return ''
    }
    if (typeof value === 'object' && value.beijing) {
      return value.beijing
    }
    const raw = typeof value === 'object' ? value.utc || '' : value
    if (!raw) {
      return ''
    }
    const date = Utils.safeParseDateString ? Utils.safeParseDateString(raw) : new Date(raw)
    if (!date || isNaN(date.getTime())) {
      return String(raw)
    }
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
  },

  /**
   * 申请售后（兑换/核销订单自助发起，统一走 POST /system/disputes）
   * order_type=redemption，order_id=redemption_order_id（UUID 主键，前端不做映射）
   */
  onApplyAfterSale(e: any) {
    const orderId = e.currentTarget.dataset.orderId
    const orderTitle = e.currentTarget.dataset.orderTitle || ''
    if (orderId === undefined || orderId === null || orderId === '') {
      redemptionOrdersLog.error(
        '申请售后失败：核销订单缺少 redemption_order_id',
        e.currentTarget.dataset
      )
      showToast('订单信息缺失，无法发起售后')
      return
    }
    const titleParam = orderTitle ? `&order_title=${encodeURIComponent(orderTitle)}` : ''
    wx.navigateTo({
      url: `/packageUser/disputes/create?order_type=redemption&order_id=${orderId}${titleParam}`,
      fail: err => {
        redemptionOrdersLog.error('跳转售后申诉页失败:', err)
        showToast('页面跳转失败，请重试')
      }
    })
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

  onShareAppMessage() {
    return {
      title: '我的核销订单',
      path: '/packageUser/redemption-orders/redemption-orders'
    }
  }
})
