/**
 * 我的拍卖页面（卖方视角） — 查看我发起的所有拍卖 + 取消操作
 *
 * 业务场景：
 *   卖方查看自己发起的所有拍卖记录，支持按状态筛选。
 *   无人出价时可以取消拍卖（bid_count === 0）。
 *
 * 后端API:
 *   GET  /api/v4/marketplace/auctions/my     → 我的拍卖列表（卖方视角）
 *   POST /api/v4/marketplace/auctions/:id/cancel → 卖方取消拍卖
 *
 * @file packageTrade/trade/my-auctions/my-auctions.ts
 * @version 5.2.0
 * @since 2026-03-25
 */

const {
  API,
  Logger: MyAuctionsLogger,
  Wechat: MyAuctionsWechat,
  AuctionHelpers: MyAuctionsHelpers
} = require('../../../utils/index')
const myAuctionsLog = MyAuctionsLogger.createLogger('my-auctions')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

Page({
  data: {
    auctions: [] as any[],

    /** 状态筛选 */
    currentStatus: 'all',
    statusTabs: [
      { key: 'all', label: '全部' },
      { key: 'active', label: '竞拍中' },
      { key: 'pending', label: '待开始' },
      { key: 'settled', label: '已成交' },
      { key: 'cancelled', label: '已取消' },
      { key: 'no_bid', label: '流拍' }
    ],

    loading: true,
    isEmpty: false,
    hasError: false,
    errorMessage: '',

    page: 1,
    pageSize: 20,
    hasMore: false
  },

  storeBindings: null as any,
  _skipNextShow: false as boolean,
  _wsSubscribed: false as boolean,

  onLoad() {
    myAuctionsLog.info('我的拍卖页面加载')

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this._skipNextShow = true
    this._loadMyAuctions()
    this._subscribeWebSocket()
  },

  onShow() {
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    this._loadMyAuctions()
  },

  onUnload() {
    this._unsubscribeWebSocket()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  onPullDownRefresh() {
    this._loadMyAuctions().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this._loadMore()
    }
  },

  async _loadMyAuctions() {
    this.setData({ loading: true, hasError: false, page: 1 })

    try {
      const statusParam = this.data.currentStatus === 'all' ? null : this.data.currentStatus
      const result = await API.getMyAuctions({
        page: 1,
        page_size: this.data.pageSize,
        status: statusParam
      })

      if (result.success && result.data) {
        const { auctions = [], pagination } = result.data
        const processed = auctions.map((a: any) => this._processItem(a))

        this.setData({
          auctions: processed,
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
      myAuctionsLog.error('加载我的拍卖失败', error)
      this.setData({ loading: false, hasError: true, errorMessage: '网络错误' })
    }
  },

  async _loadMore() {
    const nextPage = this.data.page + 1
    this.setData({ loading: true })

    try {
      const statusParam = this.data.currentStatus === 'all' ? null : this.data.currentStatus
      const result = await API.getMyAuctions({
        page: nextPage,
        page_size: this.data.pageSize,
        status: statusParam
      })

      if (result.success && result.data) {
        const { auctions = [], pagination } = result.data
        const processed = auctions.map((a: any) => this._processItem(a))

        this.setData({
          auctions: [...this.data.auctions, ...processed],
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

  _processItem(auction: any) {
    const snapshot = auction.item_snapshot || {}
    const config = MyAuctionsHelpers.getAuctionStatusConfig(auction.status)

    return {
      ...auction,
      _displayName: snapshot.item_name || '未知物品',
      _displayImage: MyAuctionsHelpers.getAuctionItemImage(snapshot),
      _statusLabel: config.label,
      _statusColor: config.color,
      _displayPrice: auction.current_price > 0 ? auction.current_price : auction.start_price,
      _priceLabel: auction.current_price > 0 ? '当前价' : '起拍价',
      _canCancel:
        (auction.status === 'pending' || auction.status === 'active') && auction.bid_count === 0
    }
  },

  // ==================== 用户交互 ====================

  onStatusTabChange(e: WechatMiniprogram.TouchEvent) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.currentStatus) {
      return
    }
    this.setData({ currentStatus: status })
    this._loadMyAuctions()
  },

  onAuctionTap(e: WechatMiniprogram.TouchEvent) {
    const auction = e.currentTarget.dataset.auction
    if (!auction) {
      return
    }
    wx.navigateTo({
      url: `/packageTrade/trade/auction-detail/auction-detail?auction_listing_id=${auction.auction_listing_id}`
    })
  },

  /** 卖方取消拍卖（仅 bid_count === 0 时允许） */
  async onCancelAuction(e: WechatMiniprogram.TouchEvent) {
    const auction = e.currentTarget.dataset.auction
    if (!auction || !auction._canCancel) {
      MyAuctionsWechat.showToast('有出价后不可取消，请联系管理员', 'none')
      return
    }

    const confirmed = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认取消拍卖',
        content: `确定取消「${auction._displayName}」的拍卖吗？\n取消后物品将返回背包。`,
        confirmText: '确认取消',
        confirmColor: '#ff4d4f',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmed) {
      return
    }

    try {
      const result = await API.cancelAuction(auction.auction_listing_id)
      if (result.success) {
        MyAuctionsWechat.showToast('拍卖已取消，物品已返回背包', 'success')
        this._loadMyAuctions()
      } else {
        MyAuctionsWechat.showToast(result.message || '取消失败', 'none')
      }
    } catch (error: any) {
      myAuctionsLog.error('取消拍卖失败', error)
      MyAuctionsWechat.showToast('网络错误', 'none')
    }
  },

  onCreateAuction() {
    wx.navigateTo({
      url: '/packageTrade/trade/auction-create/auction-create'
    })
  },

  onRetry() {
    this._loadMyAuctions()
  },

  // ==================== WebSocket实时推送（卖方收到新出价） ====================

  _subscribeWebSocket() {
    const appInstance = getApp()
    if (!appInstance || !appInstance.subscribeWebSocketMessages) {
      return
    }

    appInstance.subscribeWebSocketMessages('my_auctions', (eventName: string) => {
      if (eventName === 'auction_new_bid') {
        this._loadMyAuctions()
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
      appInstance.unsubscribeWebSocketMessages('my_auctions')
    }
    this._wsSubscribed = false
  }
})
