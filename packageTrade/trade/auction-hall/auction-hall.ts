/**
 * C2C拍卖大厅列表页 — 浏览所有进行中的拍卖
 *
 * 业务场景：
 *   用户浏览C2C拍卖大厅，查看所有active状态的拍卖商品，
 *   支持按出价资产类型筛选、排序，点击进入拍卖详情页出价。
 *
 * 后端API:
 *   GET /api/v4/marketplace/auctions → 拍卖列表（支持 status/sort_by/sort_order/price_asset_code 筛选）
 *
 * WebSocket实时事件:
 *   auction_outbid  → 被超越通知（刷新当前价格）
 *   auction_won     → 中标通知
 *   auction_lost    → 落选通知
 *
 * @file packageTrade/trade/auction-hall/auction-hall.ts
 * @version 5.2.0
 * @since 2026-03-25
 */

const { API, Logger: AuctionHallLogger, ImageHelper } = require('../../../utils/index')

/**
 * 根据物品快照获取展示图片
 * item_snapshot中的item_type/rarity_code → ImageHelper中已有的getMaterialIconPath/getCategoryIconPath
 */
function getAuctionItemImage(snapshot: any): string {
  if (!snapshot) {
    return ImageHelper.DEFAULT_PRODUCT_IMAGE
  }
  if (snapshot.item_type) {
    return ImageHelper.getMaterialIconPath(snapshot.item_type)
  }
  return ImageHelper.DEFAULT_PRODUCT_IMAGE
}

/** 根据稀有度编码获取中文显示名 */
function getAuctionRarityLabel(rarityCode: string | null): string {
  if (!rarityCode) {
    return ''
  }
  const style = ImageHelper.getRarityStyle(rarityCode)
  return style ? style.displayName : ''
}
const auctionHallLog = AuctionHallLogger.createLogger('auction-hall')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

/** 拍卖状态UI配置（对齐后端 auction_listings 7态状态机） */
const AUCTION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  pending: { label: '即将开始', color: '#faad14', icon: '⏳' },
  active: { label: '竞拍中', color: '#52c41a', icon: '🔥' },
  ended: { label: '已结束', color: '#999999', icon: '⏰' },
  settled: { label: '已成交', color: '#1890ff', icon: '✅' },
  no_bid: { label: '流拍', color: '#999999', icon: '😞' },
  cancelled: { label: '已取消', color: '#999999', icon: '❌' },
  settlement_failed: { label: '结算异常', color: '#ff4d4f', icon: '⚠️' }
}

/** 排序选项（对齐后端 AuctionQueryService 支持的排序字段） */
const SORT_OPTIONS = [
  { key: 'end_time_asc', label: '即将结束', sort_by: 'end_time', sort_order: 'asc' },
  { key: 'current_price_desc', label: '价格最高', sort_by: 'current_price', sort_order: 'desc' },
  { key: 'current_price_asc', label: '价格最低', sort_by: 'current_price', sort_order: 'asc' },
  { key: 'bid_count_desc', label: '最多出价', sort_by: 'bid_count', sort_order: 'desc' },
  { key: 'created_at_desc', label: '最新发布', sort_by: 'created_at', sort_order: 'desc' }
]

Page({
  data: {
    /** 拍卖列表（后端 auction_listings 表） */
    auctions: [] as any[],

    /** 当前筛选状态: active（默认只看竞拍中） */
    currentStatus: 'active',

    /** 状态筛选标签 */
    statusTabs: [
      { key: 'active', label: '竞拍中' },
      { key: 'pending', label: '即将开始' },
      { key: 'ended', label: '已结束' },
      { key: 'settled', label: '已成交' }
    ],

    /** 当前排序 */
    currentSort: 'end_time_asc',
    sortOptions: SORT_OPTIONS,
    showSortPicker: false,

    /** 页面状态 */
    loading: true,
    isEmpty: false,
    hasError: false,
    errorMessage: '',

    /** 分页 */
    page: 1,
    pageSize: 20,
    hasMore: false,

    /** 倒计时刷新定时器标记（用于页面销毁时清理） */
    _countdownTimer: 0
  },

  storeBindings: null as any,
  _wsSubscribed: false as boolean,
  _skipNextShow: false as boolean,

  onLoad() {
    auctionHallLog.info('拍卖大厅页面加载')

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this._skipNextShow = true
    this._loadAuctions()
    this._subscribeWebSocket()
    this._startCountdownRefresh()
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    this._loadAuctions()
  },

  onHide() {
    this._stopCountdownRefresh()
  },

  onUnload() {
    this._stopCountdownRefresh()
    this._unsubscribeWebSocket()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  onPullDownRefresh() {
    this._loadAuctions().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this._loadMore()
    }
  },

  onShareAppMessage() {
    return {
      title: '🔨 C2C拍卖大厅 — 价高者得',
      path: '/packageTrade/trade/auction-hall/auction-hall'
    }
  },

  /** 加载拍卖列表（首页） */
  async _loadAuctions() {
    this.setData({ loading: true, hasError: false, page: 1 })

    try {
      const sortConfig = SORT_OPTIONS.find(s => s.key === this.data.currentSort) || SORT_OPTIONS[0]

      const result = await API.getAuctionListings({
        page: 1,
        page_size: this.data.pageSize,
        status: this.data.currentStatus,
        sort_by: sortConfig.sort_by,
        sort_order: sortConfig.sort_order
      })

      if (result.success && result.data) {
        const { auctions = [], pagination } = result.data
        const processedAuctions = auctions.map((auction: any) => this._processAuctionItem(auction))

        this.setData({
          auctions: processedAuctions,
          loading: false,
          isEmpty: processedAuctions.length === 0,
          hasMore: pagination ? pagination.page < pagination.total_pages : false
        })
      } else {
        this.setData({
          loading: false,
          hasError: true,
          errorMessage: result.message || '加载拍卖列表失败'
        })
      }
    } catch (error: any) {
      auctionHallLog.error('加载拍卖列表失败', error)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: '网络错误，请稍后重试'
      })
    }
  },

  /** 加载更多（分页） */
  async _loadMore() {
    const nextPage = this.data.page + 1
    this.setData({ loading: true })

    try {
      const sortConfig = SORT_OPTIONS.find(s => s.key === this.data.currentSort) || SORT_OPTIONS[0]

      const result = await API.getAuctionListings({
        page: nextPage,
        page_size: this.data.pageSize,
        status: this.data.currentStatus,
        sort_by: sortConfig.sort_by,
        sort_order: sortConfig.sort_order
      })

      if (result.success && result.data) {
        const { auctions = [], pagination } = result.data
        const processedAuctions = auctions.map((auction: any) => this._processAuctionItem(auction))

        this.setData({
          auctions: [...this.data.auctions, ...processedAuctions],
          page: nextPage,
          loading: false,
          hasMore: pagination ? pagination.page < pagination.total_pages : false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (error: any) {
      auctionHallLog.error('加载更多拍卖失败', error)
      this.setData({ loading: false })
    }
  },

  /**
   * 加工拍卖数据为展示格式
   * 后端字段（snake_case）直接保留，前端展示字段以 _ 前缀标识
   */
  _processAuctionItem(auction: any) {
    const snapshot = auction.item_snapshot || {}
    const statusConfig = AUCTION_STATUS_CONFIG[auction.status] || AUCTION_STATUS_CONFIG.active

    return {
      ...auction,
      _displayName: snapshot.item_name || '未知物品',
      _displayImage: getAuctionItemImage(snapshot),
      _rarityLabel: getAuctionRarityLabel(snapshot.rarity_code),
      _statusLabel: statusConfig.label,
      _statusColor: statusConfig.color,
      _statusIcon: statusConfig.icon,
      _displayPrice: auction.current_price > 0 ? auction.current_price : auction.start_price,
      _priceLabel: auction.current_price > 0 ? '当前价' : '起拍价',
      _hasBuyout: auction.buyout_price !== null && auction.buyout_price > 0,
      _countdownText: this._calcCountdown(auction.end_time, auction.status),
      _isActive: auction.status === 'active'
    }
  },

  /** 计算倒计时文本 */
  _calcCountdown(endTime: string, status: string): string {
    if (status !== 'active') {
      return ''
    }

    const now = Date.now()
    const end = new Date(endTime).getTime()
    const diff = end - now

    if (diff <= 0) {
      return '已结束'
    }

    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `剩余${days}天${hours % 24}小时`
    }
    if (hours > 0) {
      return `剩余${hours}小时${minutes}分`
    }
    return `剩余${minutes}分${seconds}秒`
  },

  /** 每秒刷新倒计时（仅active状态拍卖） */
  _startCountdownRefresh() {
    this._stopCountdownRefresh()
    const timer = setInterval(() => {
      const { auctions } = this.data
      if (auctions.length === 0) {
        return
      }

      let hasActiveAuction = false
      const updated: Record<string, string> = {}

      auctions.forEach((auction: any, index: number) => {
        if (auction.status === 'active') {
          hasActiveAuction = true
          updated[`auctions[${index}]._countdownText`] = this._calcCountdown(
            auction.end_time,
            auction.status
          )
        }
      })

      if (hasActiveAuction && Object.keys(updated).length > 0) {
        this.setData(updated)
      }
    }, 1000)
    this.setData({ _countdownTimer: timer as unknown as number })
  },

  _stopCountdownRefresh() {
    if (this.data._countdownTimer) {
      clearInterval(this.data._countdownTimer)
      this.setData({ _countdownTimer: 0 })
    }
  },

  // ==================== WebSocket实时推送 ====================

  _subscribeWebSocket() {
    const appInstance = getApp()
    if (!appInstance || !appInstance.subscribeWebSocketMessages) {
      return
    }

    appInstance.subscribeWebSocketMessages('auction_hall', (eventName: string, data: any) => {
      switch (eventName) {
        case 'auction_outbid':
        case 'auction_new_bid':
          this._handleAuctionPriceUpdate(data)
          break
        case 'auction_won':
        case 'auction_lost':
          this._loadAuctions()
          break
      }
    })
    this._wsSubscribed = true
  },

  _unsubscribeWebSocket() {
    if (!this._wsSubscribed) {
      return
    }
    const appInstance = getApp()
    if (appInstance && appInstance.unsubscribeWebSocketMessages) {
      appInstance.unsubscribeWebSocketMessages('auction_hall')
    }
    this._wsSubscribed = false
  },

  /** 实时出价更新 → 局部刷新列表中对应拍卖的价格 */
  _handleAuctionPriceUpdate(data: any) {
    const { auction_listing_id } = data
    if (!auction_listing_id) {
      return
    }

    const { auctions } = this.data
    const index = auctions.findIndex((a: any) => a.auction_listing_id === auction_listing_id)
    if (index === -1) {
      return
    }

    this._loadAuctions()
  },

  // ==================== 用户交互 ====================

  /** 切换状态筛选标签 */
  onStatusTabChange(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) {
      return
    }

    this.setData({ currentStatus: status })
    this._loadAuctions()
  },

  /** 切换排序 */
  onSortChange(e: WechatMiniprogram.TouchEvent) {
    const sortKey = e.currentTarget.dataset.sort
    if (sortKey === this.data.currentSort) {
      this.setData({ showSortPicker: false })
      return
    }

    this.setData({ currentSort: sortKey, showSortPicker: false })
    this._loadAuctions()
  },

  /** 显示/隐藏排序选择器 */
  onToggleSortPicker() {
    this.setData({ showSortPicker: !this.data.showSortPicker })
  },

  /** 点击拍卖商品 → 跳转详情页 */
  onAuctionItemTap(e: WechatMiniprogram.TouchEvent) {
    const auction = e.currentTarget.dataset.auction
    if (!auction || !auction.auction_listing_id) {
      return
    }

    wx.navigateTo({
      url: `/packageTrade/trade/auction-detail/auction-detail?auction_listing_id=${auction.auction_listing_id}`
    })
  },

  /** 跳转到创建拍卖页（从背包选物品） */
  onCreateAuction() {
    wx.navigateTo({
      url: '/packageTrade/trade/auction-create/auction-create'
    })
  },

  /** 跳转到我的拍卖（卖方） */
  onGoMyAuctions() {
    wx.navigateTo({
      url: '/packageTrade/trade/my-auctions/my-auctions'
    })
  },

  /** 跳转到我的出价记录（买方） */
  onGoMyBids() {
    wx.navigateTo({
      url: '/packageTrade/trade/my-auction-bids/my-auction-bids'
    })
  },

  /** 重试加载 */
  onRetry() {
    this._loadAuctions()
  }
})
