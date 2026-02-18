/**
 * 📋 我的挂单页面 - 管理当前用户在交易市场的所有挂单
 *
 * 功能说明：
 *   - 展示用户所有挂单记录（在售/已成交/已撤回）
 *   - 按状态筛选挂单
 *   - 撤回在售挂单（调用 withdrawMarketProduct）
 *   - 下拉刷新 + 触底加载更多
 *
 * 后端API:
 *   - GET /api/v4/market/manage/my-listings（获取挂单列表）
 *   - POST /api/v4/market/manage/listings/:id/withdraw（撤回挂单）
 *
 * 数据来源: 后端 market_listings 表（seller_user_id = 当前用户）
 *
 * @file pages/trade/my-listings/my-listings.ts
 * @version 1.0.0
 * @since 2026-02-18
 */

const { API, Logger, Utils } = require('../../../utils/index')
const log = Logger.createLogger('my-listings')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')
const { tradeStore } = require('../../../store/trade')

/** loading安全超时时间（毫秒），防止loading遮罩层永远不消失 */
const LOADING_SAFETY_TIMEOUT = 8000

/** 挂单状态对应的中文和颜色（纯前端UI常量） */
const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  on_sale: { label: '在售', color: '#52c41a' },
  locked: { label: '交易中', color: '#faad14' },
  sold: { label: '已成交', color: '#1890ff' },
  withdrawn: { label: '已撤回', color: '#999999' },
  admin_withdrawn: { label: '管理员撤回', color: '#ff4d4f' }
}

/** 挂单类型对应的中文（纯前端UI常量） */
const LISTING_KIND_LABEL: Record<string, string> = {
  item_instance: '物品',
  fungible_asset: '资产'
}

Page({
  data: {
    /** 挂单列表（后端 GET /api/v4/market/manage/my-listings 返回） */
    listings: [] as API.MyListing[],

    /** 当前筛选状态: all / on_sale / sold / withdrawn */
    currentStatus: 'all',

    /** 状态筛选标签页配置 */
    statusTabs: [
      { key: 'all', label: '全部', count: 0 },
      { key: 'on_sale', label: '在售', count: 0 },
      { key: 'sold', label: '已成交', count: 0 },
      { key: 'withdrawn', label: '已撤回', count: 0 }
    ],

    /** 页面状态 */
    loading: true,
    refreshing: false,
    isEmpty: false,

    /** 分页参数 */
    page: 1,
    pageSize: 20,
    hasMore: false,
    totalCount: 0,

    /** 撤回操作进行中的挂单ID（防止重复点击） */
    withdrawingId: 0
  },

  /** loading安全超时定时器ID */
  loadingSafetyTimer: null as any,

  /** MobX Store绑定实例引用 */
  storeBindings: null as any,
  tradeBindings: null as any,

  onLoad() {
    log.info('📋 我的挂单页面加载')

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'accessToken'],
      actions: []
    })
    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: [],
      actions: ['setMyListings']
    })

    this.loadMyListings()
  },

  onShow() {
    if (userStore.isLoggedIn) {
      this.loadMyListings()
    }
  },

  onUnload() {
    this.clearLoadingSafetyTimer()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
    if (this.tradeBindings) {
      this.tradeBindings.destroyStoreBindings()
    }
  },

  /** 启动loading安全超时定时器 */
  startLoadingSafetyTimer() {
    this.clearLoadingSafetyTimer()
    this.loadingSafetyTimer = setTimeout(() => {
      if (this.data.loading) {
        log.warn('⚠️ loading安全超时触发，强制关闭')
        this.setData({ loading: false })
      }
    }, LOADING_SAFETY_TIMEOUT)
  },

  /** 清除loading安全超时定时器 */
  clearLoadingSafetyTimer() {
    if (this.loadingSafetyTimer) {
      clearTimeout(this.loadingSafetyTimer)
      this.loadingSafetyTimer = null
    }
  },

  /**
   * 加载我的挂单列表
   * 后端API: GET /api/v4/market/manage/my-listings
   * 🔴 需后端实现此接口，当前调用可能返回404
   */
  async loadMyListings() {
    if (!userStore.isLoggedIn) {
      log.info('👤 用户未登录，跳转登录页')
      this.setData({ loading: false })
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/auth/auth' })
      }, 1500)
      return
    }

    this.startLoadingSafetyTimer()

    try {
      const { page, pageSize, currentStatus } = this.data
      const params: { page: number; limit: number; status?: string } = { page, limit: pageSize }
      if (currentStatus !== 'all') {
        params.status = currentStatus
      }

      log.info('📋 加载我的挂单列表:', params)
      const result = await API.getMyListings(params)

      if (result && result.success && result.data) {
        const rawListings: any[] = result.data.listings || []
        const pagination = result.data.pagination || {}
        const statusCounts = result.data.status_counts || {}

        const listings = rawListings.map((item: any) => ({
          market_listing_id: item.market_listing_id,
          listing_kind: item.listing_kind || 'item_instance',
          display_name:
            item.display_name ||
            item.offer_item_display_name ||
            item.offer_asset_display_name ||
            '未知商品',
          offer_item_rarity: item.offer_item_rarity || '',
          offer_asset_code: item.offer_asset_code || '',
          offer_amount: item.offer_amount || 0,
          price_asset_code: item.price_asset_code || 'DIAMOND',
          price_amount: item.price_amount || 0,
          status: item.status || 'on_sale',
          status_display:
            item.status_display || (STATUS_CONFIG[item.status] || {}).label || item.status,
          created_at: item.created_at || '',
          // 前端展示用辅助字段（camelCase）
          statusColor: (STATUS_CONFIG[item.status] || STATUS_CONFIG.on_sale).color,
          kindLabel: LISTING_KIND_LABEL[item.listing_kind] || '未知',
          formattedTime:
            item.created_at && Utils.formatTime
              ? Utils.formatTime(new Date(item.created_at))
              : item.created_at || ''
        }))

        const newListings = page === 1 ? listings : [...this.data.listings, ...listings]

        const statusTabs = this.data.statusTabs.map((tab: any) => ({
          ...tab,
          count: tab.key === 'all' ? pagination.total || 0 : statusCounts[tab.key] || 0
        }))

        this.setData({
          listings: newListings,
          statusTabs,
          totalCount: pagination.total || 0,
          hasMore: page * pageSize < (pagination.total || 0),
          isEmpty: newListings.length === 0
        })

        tradeStore.setMyListings(newListings)
        log.info(`✅ 加载成功，共 ${newListings.length} 条挂单`)
      } else {
        throw new Error((result && result.message) || '加载我的挂单失败')
      }
    } catch (error: any) {
      log.error('❌ 加载我的挂单失败:', error)

      if (error.statusCode === 401) {
        wx.showToast({ title: '登录已过期，请重新登录', icon: 'none' })
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/auth/auth' })
        }, 1500)
        return
      }

      if (error.statusCode === 404) {
        log.warn('⚠️ 后端尚未实现 GET /api/v4/market/manage/my-listings 接口')
        wx.showToast({ title: '功能开发中，敬请期待', icon: 'none', duration: 3000 })
        this.setData({ isEmpty: true, listings: [] })
        return
      }

      wx.showToast({ title: '加载失败，请下拉刷新', icon: 'none' })
    } finally {
      this.setData({ loading: false, refreshing: false })
      this.clearLoadingSafetyTimer()
    }
  },

  /** 切换状态筛选标签 */
  onStatusTabTap(e: any) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) {
      return
    }

    log.info('📋 切换挂单状态筛选:', status)
    this.setData({ currentStatus: status, page: 1, listings: [] })
    this.loadMyListings()
  },

  /**
   * 撤回挂单操作
   * 后端API: POST /api/v4/market/manage/listings/:market_listing_id/withdraw
   */
  onWithdrawListing(e: any) {
    const listing = e.currentTarget.dataset.listing
    if (!listing || !listing.market_listing_id) {
      log.warn('⚠️ 挂单数据为空')
      return
    }

    if (listing.status !== 'on_sale') {
      wx.showToast({ title: '仅在售挂单可撤回', icon: 'none' })
      return
    }

    if (this.data.withdrawingId) {
      wx.showToast({ title: '操作进行中，请稍候', icon: 'none' })
      return
    }

    wx.showModal({
      title: '确认撤回',
      content: `确定要撤回「${listing.display_name}」的挂单吗？撤回后商品/资产将返回您的背包。`,
      confirmText: '确认撤回',
      confirmColor: '#ff4d4f',
      success: (res: any) => {
        if (res.confirm) {
          this.executeWithdraw(listing.market_listing_id)
        }
      }
    })
  },

  /** 执行撤回操作 */
  async executeWithdraw(marketListingId: number) {
    this.setData({ withdrawingId: marketListingId })
    log.info('📋 撤回挂单:', marketListingId)

    try {
      const result = await API.withdrawMarketProduct(marketListingId)

      if (result && result.success) {
        log.info('✅ 挂单撤回成功')
        wx.showToast({ title: '撤回成功', icon: 'success' })

        this.setData({ page: 1, listings: [] })
        await this.loadMyListings()
      } else {
        throw new Error((result && result.message) || '撤回失败')
      }
    } catch (error: any) {
      log.error('❌ 撤回挂单失败:', error)
      wx.showToast({ title: error.message || '撤回失败，请重试', icon: 'none' })
    } finally {
      this.setData({ withdrawingId: 0 })
    }
  },

  /** 跳转到交易市场页面 */
  goToMarket() {
    wx.switchTab({ url: '/pages/exchange/exchange' })
  },

  /** 跳转到我的仓库（去上架） */
  goToInventory() {
    wx.navigateTo({ url: '/pages/trade/inventory/inventory' })
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    log.info('🔄 下拉刷新我的挂单')
    this.setData({ page: 1, refreshing: true, listings: [] })
    this.loadMyListings().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /** 触底加载更多 */
  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) {
      return
    }

    log.info('📋 加载更多挂单，当前页:', this.data.page)
    this.setData({ page: this.data.page + 1 })
    this.loadMyListings()
  },

  /** 分享 */
  onShareAppMessage() {
    return {
      title: '我的挂单 - 天工交易市场',
      path: '/pages/trade/my-listings/my-listings'
    }
  }
})

export { }

