/**
 * 我的出价记录页（买方视角） — 查看所有参与过的拍卖出价
 *
 * 业务场景：
 *   买方查看自己在各个拍卖中的出价记录，了解出价状态（领先/被超越/中标/落选）。
 *
 * 后端API:
 *   GET /api/v4/marketplace/auctions/my-bids → 我的出价记录
 *
 * WebSocket:
 *   auction_outbid → 出价被超越
 *   auction_won    → 中标
 *   auction_lost   → 落选
 *
 * @file packageTrade/trade/my-auction-bids/my-auction-bids.ts
 * @version 5.2.0
 * @since 2026-03-25
 */

const { API, Logger: MyBidsLogger, AuctionHelpers: MyBidsHelpers } = require('../../../utils/index')
const myBidsLog = MyBidsLogger.createLogger('my-auction-bids')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

Page({
  data: {
    bids: [] as any[],

    loading: true,
    isEmpty: false,
    hasError: false,
    errorMessage: '',

    page: 1,
    pageSize: 20,
    hasMore: false
  },

  storeBindings: null as any,
  _wsSubscribed: false as boolean,
  _skipNextShow: false as boolean,

  onLoad() {
    myBidsLog.info('我的出价记录页面加载')

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this._skipNextShow = true
    this._loadMyBids()
    this._subscribeWebSocket()
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    this._loadMyBids()
  },

  onUnload() {
    this._unsubscribeWebSocket()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  onPullDownRefresh() {
    this._loadMyBids().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this._loadMore()
    }
  },

  async _loadMyBids() {
    this.setData({ loading: true, hasError: false, page: 1 })

    try {
      const result = await API.getMyAuctionBids({
        page: 1,
        page_size: this.data.pageSize
      })

      if (result.success && result.data) {
        const { bids = [], pagination } = result.data
        const processed = bids.map((b: any) => this._processBidItem(b))

        this.setData({
          bids: processed,
          loading: false,
          isEmpty: processed.length === 0,
          hasMore: pagination ? pagination.page < pagination.total_pages : false
        })
      } else {
        this.setData({
          loading: false,
          hasError: true,
          errorMessage: result.message || '加载失败'
        })
      }
    } catch (error: any) {
      myBidsLog.error('加载出价记录失败', error)
      this.setData({ loading: false, hasError: true, errorMessage: '网络错误' })
    }
  },

  async _loadMore() {
    const nextPage = this.data.page + 1
    this.setData({ loading: true })

    try {
      const result = await API.getMyAuctionBids({
        page: nextPage,
        page_size: this.data.pageSize
      })

      if (result.success && result.data) {
        const { bids = [], pagination } = result.data
        const processed = bids.map((b: any) => this._processBidItem(b))

        this.setData({
          bids: [...this.data.bids, ...processed],
          page: nextPage,
          loading: false,
          hasMore: pagination ? pagination.page < pagination.total_pages : false
        })
      } else {
        this.setData({ loading: false })
      }
    } catch (_error: any) {
      this.setData({ loading: false })
    }
  },

  /** 加工出价记录展示数据 */
  _processBidItem(bid: any) {
    const auctionInfo = bid.auction_info || {}
    const snapshot = auctionInfo.item_snapshot || {}

    let bidStatus: string
    if (bid.is_final_winner) {
      bidStatus = 'won'
    } else if (bid.is_winning) {
      bidStatus = 'winning'
    } else if (auctionInfo.status === 'settled' || auctionInfo.status === 'ended') {
      bidStatus = 'lost'
    } else {
      bidStatus = 'outbid'
    }

    const statusConfig = MyBidsHelpers.getBidStatusConfig(bidStatus)

    return {
      ...bid,
      _displayName: snapshot.item_name || '未知物品',
      _displayImage: MyBidsHelpers.getAuctionItemImage(snapshot),
      _bidStatusLabel: statusConfig.label,
      _bidStatusColor: statusConfig.color,
      _auctionStatus: auctionInfo.status || '',
      _auctionCurrentPrice: auctionInfo.current_price || 0,
      _priceAssetCode: auctionInfo.price_asset_code || '',
      _sellerNickname: auctionInfo.seller_nickname || '匿名',
      _endTime: auctionInfo.end_time || ''
    }
  },

  // ==================== WebSocket ====================

  _subscribeWebSocket() {
    const appInstance = getApp()
    if (!appInstance || !appInstance.subscribeWebSocketMessages) {
      return
    }

    appInstance.subscribeWebSocketMessages('my_auction_bids', (eventName: string) => {
      if (['auction_outbid', 'auction_won', 'auction_lost'].includes(eventName)) {
        this._loadMyBids()
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
      appInstance.unsubscribeWebSocketMessages('my_auction_bids')
    }
    this._wsSubscribed = false
  },

  // ==================== 用户交互 ====================

  /** 点击出价记录 → 跳转拍卖详情 */
  onBidTap(e: WechatMiniprogram.TouchEvent) {
    const bid = e.currentTarget.dataset.bid
    if (!bid || !bid.auction_listing_id) {
      return
    }

    wx.navigateTo({
      url: `/packageTrade/trade/auction-detail/auction-detail?auction_listing_id=${bid.auction_listing_id}`
    })
  },

  onRetry() {
    this._loadMyBids()
  }
})
