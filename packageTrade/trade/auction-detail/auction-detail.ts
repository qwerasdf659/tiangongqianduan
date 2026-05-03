/**
 * C2C拍卖详情页 — 查看拍卖信息 + 出价交互
 *
 * 业务场景：
 *   用户查看拍卖详情（物品快照、出价排行、倒计时），进行出价操作。
 *   支持一口价即时成交（buyout_price），出价被超越时WebSocket实时通知。
 *
 * 后端API:
 *   GET  /api/v4/marketplace/auctions/:auction_listing_id → 拍卖详情（含top_bids、my_bids）
 *   POST /api/v4/marketplace/auctions/:auction_listing_id/bid → 出价
 *   POST /api/v4/marketplace/auctions/:auction_listing_id/dispute → 争议（仅settled+中标者）
 *
 * WebSocket:
 *   auction_outbid  → 出价被超越（刷新详情）
 *   auction_won     → 中标通知
 *   auction_lost    → 落选通知
 *   auction_new_bid → 卖方收到新出价通知
 *
 * @file packageTrade/trade/auction-detail/auction-detail.ts
 * @version 5.2.0
 * @since 2026-03-25
 */

const {
  API,
  Logger: AuctionDetailLogger,
  Wechat: AuctionDetailWechat,
  AuctionHelpers: AuctionDetailHelpers,
  ImageHelper: auctionDetailImageHelper
} = require('../../../utils/index')
const auctionDetailLog = AuctionDetailLogger.createLogger('auction-detail')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

Page({
  data: {
    /** 拍卖主信息 */
    auction: null as any,
    /** 出价排行前10 */
    topBids: [] as any[],
    /** 当前用户的出价记录 */
    myBids: [] as any[],

    /** 物品快照展示字段 */
    displayName: '',
    displayImage: '',
    rarityLabel: '',

    /** 状态展示 */
    statusLabel: '',
    statusColor: '',

    /** 倒计时 */
    countdownText: '',

    /** 结算资产中文名（用于UI展示，如"星石"） */
    priceAssetLabel: '',

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: '',

    /** 出价表单 */
    showBidInput: false,
    bidInputValue: '',
    minBidAmount: 0,
    bidding: false,

    /** 当前用户是否为卖方 */
    isSeller: false,
    /** 当前用户是否为中标者 */
    isWinner: false,
    /** 当前用户是否有活跃出价 */
    hasActiveBid: false,
    /** 当前用户最高出价 */
    myHighestBid: 0,

    /** 拍卖ID（路由参数） */
    auctionListingId: 0,

    /** 倒计时定时器 */
    _countdownTimer: 0
  },

  storeBindings: null as any,
  _wsSubscribed: false as boolean,

  onLoad(options: Record<string, string | undefined>) {
    const auctionListingIdText = options.auction_listing_id || ''
    const auctionListingId = Number(auctionListingIdText)
    if (!auctionListingIdText || !Number.isInteger(auctionListingId) || auctionListingId <= 0) {
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: '无效的拍卖ID'
      })
      return
    }

    this.setData({ auctionListingId })

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo'],
      actions: []
    })

    this._loadDetail(auctionListingId)
    this._subscribeWebSocket()
  },

  onUnload() {
    this._stopCountdown()
    this._unsubscribeWebSocket()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  /** 页面隐藏时暂停倒计时定时器，防止后台持续运行 */
  onHide() {
    this._stopCountdown()
  },

  /** 页面重新显示时恢复倒计时 */
  onShow() {
    if (this.data.auctionListingId) {
      this._startCountdown()
    }
  },

  onPullDownRefresh() {
    this._loadDetail(this.data.auctionListingId).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onShareAppMessage() {
    const { auction, displayName } = this.data
    return {
      title: `🔨 ${displayName} — C2C竞拍`,
      path: `/packageTrade/trade/auction-detail/auction-detail?auction_listing_id=${auction?.auction_listing_id || ''}`
    }
  },

  /** 加载拍卖详情 */
  async _loadDetail(auctionListingId: number) {
    this.setData({ loading: true, hasError: false })

    try {
      const result = await API.getAuctionDetail(auctionListingId)

      if (result.success && result.data) {
        const { auction, top_bids = [], my_bids = [] } = result.data
        this._processDetailData(auction, top_bids, my_bids)
      } else {
        this.setData({
          loading: false,
          hasError: true,
          errorMessage: result.message || '加载拍卖详情失败'
        })
      }
    } catch (error: any) {
      auctionDetailLog.error('加载拍卖详情失败', error)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: '网络错误，请稍后重试'
      })
    }
  },

  /** 处理并设置详情数据 */
  _processDetailData(auction: any, topBids: any[], myBids: any[]) {
    const snapshot = auction.item_snapshot || {}
    const statusConfig = AuctionDetailHelpers.getAuctionStatusConfig(auction.status)
    const currentUserId = (this.data as any).userInfo?.user_id

    const isSeller = currentUserId && auction.seller_user_id === currentUserId
    const isWinner = currentUserId && auction.winner_user_id === currentUserId

    const myHighestBid = myBids.length > 0 ? Math.max(...myBids.map((b: any) => b.bid_amount)) : 0
    const hasActiveBid = myBids.some((b: any) => b.is_winning)

    const minBidAmount =
      auction.current_price > 0
        ? auction.current_price + auction.min_bid_increment
        : auction.start_price

    this.setData({
      auction,
      /** 结算资产中文名（用于UI展示，如"星石"） */
      priceAssetLabel: auctionDetailImageHelper.getAssetDisplayName(auction.price_asset_code || ''),
      topBids,
      myBids,
      displayName: snapshot.name || '未知物品',
      displayImage: AuctionDetailHelpers.getAuctionItemImage(snapshot),
      rarityLabel: AuctionDetailHelpers.getAuctionRarityLabel(snapshot.rarity_code),
      statusLabel: statusConfig.label,
      statusColor: statusConfig.color,
      countdownText: AuctionDetailHelpers.calcAuctionCountdown(
        auction.end_time,
        auction.status,
        auction.start_time
      ),
      isSeller,
      isWinner,
      hasActiveBid,
      myHighestBid,
      minBidAmount,
      loading: false
    })

    this._startCountdown()
  },

  /** 计算倒计时（委托公共模块） */
  _calcCountdown(endTime: string, status: string): string {
    return AuctionDetailHelpers.calcAuctionCountdown(endTime, status, this.data.auction?.start_time)
  },

  _startCountdown() {
    this._stopCountdown()
    const timer = setInterval(() => {
      const { auction } = this.data
      if (!auction) {
        return
      }

      const countdownText = this._calcCountdown(auction.end_time, auction.status)
      this.setData({ countdownText })

      if (!countdownText || countdownText === '已结束') {
        this._stopCountdown()
        this._loadDetail(this.data.auctionListingId)
      }
    }, 1000)
    this.setData({ _countdownTimer: timer as unknown as number })
  },

  _stopCountdown() {
    if (this.data._countdownTimer) {
      clearInterval(this.data._countdownTimer)
      this.setData({ _countdownTimer: 0 })
    }
  },

  // ==================== 出价操作 ====================

  /** 打开出价弹窗 */
  onShowBidInput() {
    const { auction, isSeller } = this.data
    if (!auction) {
      return
    }

    if (isSeller) {
      AuctionDetailWechat.showToast('不能出价自己的拍卖', 'none')
      return
    }

    if (auction.status !== 'active') {
      AuctionDetailWechat.showToast('该拍卖不在竞拍状态', 'none')
      return
    }

    if (!(this.data as any).isLoggedIn) {
      wx.navigateTo({ url: '/packageUser/auth/auth' })
      return
    }

    this.setData({
      showBidInput: true,
      bidInputValue: String(this.data.minBidAmount)
    })
  },

  /** 关闭出价弹窗 */
  onCloseBidInput() {
    this.setData({ showBidInput: false, bidInputValue: '' })
  },

  /** 出价金额输入 */
  onBidInputChange(e: WechatMiniprogram.Input) {
    this.setData({ bidInputValue: e.detail.value })
  },

  /** 提交出价 */
  async onSubmitBid() {
    const { auctionListingId, bidInputValue, minBidAmount, auction } = this.data
    const bidAmount = parseInt(bidInputValue, 10)

    if (isNaN(bidAmount) || bidAmount <= 0) {
      AuctionDetailWechat.showToast('请输入有效的出价金额', 'none')
      return
    }

    if (bidAmount < minBidAmount) {
      AuctionDetailWechat.showToast(`出价不能低于${minBidAmount}`, 'none')
      return
    }

    const isBuyout = auction.buyout_price && bidAmount >= auction.buyout_price
    const priceLabel = auctionDetailImageHelper.getAssetDisplayName(auction.price_asset_code || '')
    const confirmMessage = isBuyout
      ? `确认以一口价 ${bidAmount} ${priceLabel} 立即购买？`
      : `确认出价 ${bidAmount} ${priceLabel}？\n出价成功后对应金额将被冻结`

    const confirmResult = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: isBuyout ? '一口价购买' : '确认出价',
        content: confirmMessage,
        confirmText: isBuyout ? '立即购买' : '确认出价',
        confirmColor: '#FF6B35',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmResult) {
      return
    }

    this.setData({ bidding: true })

    try {
      const result = await API.placeAuctionBid(auctionListingId, bidAmount)

      if (result.success) {
        this.setData({ showBidInput: false, bidInputValue: '', bidding: false })

        const toastText = isBuyout ? '一口价购买成功！' : '出价成功！'
        AuctionDetailWechat.showToast(toastText, 'success')

        this._loadDetail(auctionListingId)
      } else {
        this.setData({ bidding: false })
        AuctionDetailWechat.showToast(result.message || '出价失败', 'none')
      }
    } catch (error: any) {
      auctionDetailLog.error('出价失败', error)
      this.setData({ bidding: false })
      AuctionDetailWechat.showToast('网络错误，请稍后重试', 'none')
    }
  },

  /** 快速加价按钮 */
  onQuickBid(e: WechatMiniprogram.TouchEvent) {
    const increment = e.currentTarget.dataset.increment
    const current = parseInt(this.data.bidInputValue, 10) || this.data.minBidAmount
    this.setData({ bidInputValue: String(current + increment) })
  },

  /** 一口价按钮 — 自动填入一口价金额并打开出价弹窗 */
  onBuyoutBid() {
    const { auction, isSeller } = this.data
    if (!auction || !auction.buyout_price) {
      return
    }

    if (isSeller) {
      AuctionDetailWechat.showToast('不能出价自己的拍卖', 'none')
      return
    }

    if (auction.status !== 'active') {
      AuctionDetailWechat.showToast('该拍卖不在竞拍状态', 'none')
      return
    }

    if (!(this.data as any).isLoggedIn) {
      wx.navigateTo({ url: '/packageUser/auth/auth' })
      return
    }

    this.setData({
      showBidInput: true,
      bidInputValue: String(auction.buyout_price)
    })
  },

  // ==================== 争议操作（仅settled+中标者） ====================

  /** 发起争议 */
  async onCreateDispute() {
    const { auction, isWinner, auctionListingId } = this.data
    if (!auction || auction.status !== 'settled' || !isWinner) {
      AuctionDetailWechat.showToast('当前状态不支持发起争议', 'none')
      return
    }

    wx.navigateTo({
      url: `/packageTrade/trade/dispute/dispute?source=auction&auction_listing_id=${auctionListingId}`
    })
  },

  // ==================== WebSocket实时推送 ====================

  _subscribeWebSocket() {
    const appInstance = getApp()
    if (!appInstance || !appInstance.subscribeWebSocketMessages) {
      return
    }

    appInstance.subscribeWebSocketMessages('auction_detail', (eventName: string, data: any) => {
      if (data.auction_listing_id !== this.data.auctionListingId) {
        return
      }

      switch (eventName) {
        case 'auction_outbid':
          AuctionDetailWechat.showToast('你的出价已被超越！', 'none')
          this._loadDetail(this.data.auctionListingId)
          break
        case 'auction_won':
          AuctionDetailWechat.showToast('恭喜你中标了！🎉', 'success')
          this._loadDetail(this.data.auctionListingId)
          break
        case 'auction_lost':
          AuctionDetailWechat.showToast('很遗憾，你未能中标', 'none')
          this._loadDetail(this.data.auctionListingId)
          break
        case 'auction_new_bid':
          this._loadDetail(this.data.auctionListingId)
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
      appInstance.unsubscribeWebSocketMessages('auction_detail')
    }
    this._wsSubscribed = false
  },

  /** 重试加载 */
  onRetry() {
    this._loadDetail(this.data.auctionListingId)
  }
})
