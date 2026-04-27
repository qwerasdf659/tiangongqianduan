/**
 * 挂单详情页 — 展示挂单完整信息 + 购买入口 + 价格摘要
 *
 * 后端API:
 *   GET  /api/v4/marketplace/listings/:market_listing_id     → 挂单详情
 *   GET  /api/v4/marketplace/price/summary                   → 价格摘要
 *   POST /api/v4/marketplace/listings/:market_listing_id/purchase → 购买（Idempotency-Key）
 *
 * 路由参数: market_listing_id（BIGINT，来自市场列表或瀑布流卡片点击）
 *
 * 购买响应关键字段:
 *   requires_escrow_confirmation — true: 实物交易需担保码 → 弹出担保码说明
 *                                  false: 资产交易自动完成 → 直接显示成功
 *
 * @file packageTrade/trade/listing-detail/listing-detail.ts
 * @version 5.2.0
 * @since 2026-02-25
 */

const {
  API,
  Logger: DetailLogger,
  Utils: DetailUtils,
  Wechat: DetailWechat,
  ImageHelper: detailImageHelper
} = require('../../../utils/index')
const detailLog = DetailLogger.createLogger('listing-detail')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

Page({
  data: {
    /** 挂单ID（路由参数） */
    marketListingId: 0,

    /** 挂单详情数据（后端 GET /api/v4/marketplace/listings/:id 返回） */
    detail: null as any,

    /** 前端计算的展示字段 */
    displayName: '',
    displayImage: '',
    priceLabel: '',
    isFungibleAsset: false,
    offerAmount: 0,
    rarityCode: '',
    rarityStyle: null as any,

    /** 品质等级展示字段（后端 item_info.instance_attributes） */
    qualityGrade: '',
    qualityScore: null as number | null,
    qualityColorHex: '',
    qualityCssClass: '',
    patternId: null as number | null,
    /** 限量编号展示文本（格式 #0042 / 0100） */
    editionText: '',
    /** 交易冷却期状态 */
    hasCooldown: false,
    cooldownRemaining: '',

    /** 价格摘要（后端 GET /api/v4/marketplace/price/summary 返回） */
    priceSummary: null as any,

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: '',

    /** 购买操作状态 */
    purchasing: false,

    /** 购买结果弹窗 */
    showPurchaseResult: false,
    purchaseResult: null as any,

    /** 担保码说明弹窗（实物交易购买后） */
    showEscrowGuide: false,
    escrowExpiresAt: '',

    /** 价格走势图 */
    showPriceChart: false,

    /**
     * 价格历史数据（后端 GET /api/v4/marketplace/analytics/history 返回）
     * 卖家/买家定价参考 — 每日维度的历史均价、最低/最高价、成交笔数
     */
    priceHistoryList: [] as any[],
    priceHistoryLoading: false,
    showPriceHistory: false,

    /** 当前用户ID（用于判断是否自己的挂单） */
    currentUserId: 0,

    /** 图片加载失败 */
    imageError: false
  },

  storeBindings: null as any,

  async onLoad(options: Record<string, string | undefined>) {
    const marketListingIdText = options.market_listing_id || ''
    const marketListingId = Number(marketListingIdText)
    if (!marketListingIdText || !Number.isInteger(marketListingId) || marketListingId <= 0) {
      detailLog.error('缺少有效的 market_listing_id 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '商品信息无效' })
      return
    }

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo'],
      actions: []
    })

    const currentUserId = (userStore.userInfo && userStore.userInfo.user_id) || 0
    this.setData({ marketListingId, currentUserId })

    await this._loadDetail(marketListingId)
  },

  onUnload() {
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  /**
   * 加载挂单详情 + 价格摘要（并行请求）
   * 后端: GET /api/v4/marketplace/listings/:market_listing_id
   * 后端: GET /api/v4/marketplace/price/summary
   */
  async _loadDetail(marketListingId: number) {
    this.setData({ loading: true, hasError: false })

    try {
      const detailResult = await API.getMarketProductDetail(marketListingId)

      if (!detailResult || !detailResult.success || !detailResult.data) {
        throw new Error((detailResult && detailResult.message) || '获取商品详情失败')
      }

      const listing = detailResult.data
      const isFungible = listing.listing_kind === 'fungible_asset'

      /* 品质等级和限量编号（后端 item_info 中的实例属性） */
      const itemInfo = listing.item_info || {}
      const instanceAttrs = itemInfo.instance_attributes || {}
      const qualityGrade = instanceAttrs.quality_grade || ''
      const qualityStyle = qualityGrade
        ? detailImageHelper.getQualityGradeStyle(qualityGrade)
        : null
      const editionText = detailImageHelper.formatEdition(
        itemInfo.serial_number,
        itemInfo.edition_total
      )

      /* 冷却期信息（后端 item_info.holds 数组） */
      const cooldownInfo = detailImageHelper.getTradeCooldown(itemInfo.holds)

      this.setData({
        detail: listing,
        displayName: detailImageHelper.getListingDisplayName(listing),
        displayImage: detailImageHelper.getListingDisplayImage(listing),
        priceLabel: detailImageHelper.getAssetDisplayName(listing.price_asset_code),
        isFungibleAsset: isFungible,
        offerAmount: listing.asset_info ? listing.asset_info.amount : 0,
        rarityCode: itemInfo.rarity_code || '',
        rarityStyle: detailImageHelper.getRarityStyle(itemInfo.rarity_code || 'common'),
        qualityGrade,
        qualityScore: instanceAttrs.quality_score || null,
        qualityColorHex: qualityStyle ? qualityStyle.colorHex : '',
        qualityCssClass: qualityStyle ? qualityStyle.cssClass : '',
        patternId: instanceAttrs.pattern_id || null,
        editionText,
        hasCooldown: cooldownInfo ? cooldownInfo.isActive : false,
        cooldownRemaining: cooldownInfo ? cooldownInfo.remaining : '',
        loading: false
      })

      wx.setNavigationBarTitle({ title: detailImageHelper.getListingDisplayName(listing) })

      /* 非阻塞加载价格摘要 + 价格历史（失败不影响详情展示） */
      this._loadPriceSummary(listing)
      this._loadPriceHistory(listing)

      detailLog.info('挂单详情加载成功:', listing.market_listing_id)
    } catch (error: any) {
      detailLog.error('加载挂单详情失败:', error)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: error.message || '加载失败，请重试'
      })
    }
  },

  /**
   * 加载价格摘要（非阻塞，失败静默处理）
   * 后端: GET /api/v4/marketplace/price/summary
   */
  async _loadPriceSummary(listing: any) {
    try {
      const params: { asset_code?: string; template_id?: number } = {}
      if (listing.listing_kind === 'fungible_asset' && listing.asset_info) {
        params.asset_code = listing.asset_info.asset_code
      } else if (listing.item_info && listing.item_info.template_id) {
        params.template_id = listing.item_info.template_id
      }

      if (!params.asset_code && !params.template_id) {
        return
      }

      const summaryResult = await API.getPriceSummary(params)
      if (summaryResult && summaryResult.success && summaryResult.data) {
        this.setData({ priceSummary: summaryResult.data })
        detailLog.info('价格摘要加载成功')
      }
    } catch (summaryError: any) {
      detailLog.warn('价格摘要加载失败（不影响主流程）:', summaryError.message)
    }
  },

  /**
   * 加载价格历史数据（非阻塞，失败静默处理）
   * 后端: GET /api/v4/marketplace/analytics/history
   * 返回每日维度的均价、最低价、最高价、成交笔数
   */
  async _loadPriceHistory(listing: any) {
    try {
      let assetCode = ''
      if (listing.listing_kind === 'fungible_asset' && listing.asset_info) {
        assetCode = listing.asset_info.asset_code
      } else if (listing.item_info && listing.item_info.template_id) {
        assetCode = listing.asset_info ? listing.asset_info.asset_code : ''
      }

      if (!assetCode) {
        return
      }

      const historyResult = await API.getPriceHistory({ asset_code: assetCode, days: 30 })
      if (historyResult && historyResult.success && historyResult.data) {
        const historyPoints = Array.isArray(historyResult.data)
          ? historyResult.data
          : historyResult.data.history || []
        this.setData({ priceHistoryList: historyPoints })
        detailLog.info(`价格历史加载成功: ${historyPoints.length}天`)
      }
    } catch (historyError: any) {
      detailLog.warn('价格历史加载失败（不影响主流程）:', historyError.message)
    }
  },

  /** 切换价格历史面板显示/隐藏 */
  onTogglePriceHistory() {
    this.setData({ showPriceHistory: !this.data.showPriceHistory })
  },

  /** 商品图片加载失败降级 */
  onImageError() {
    this.setData({
      imageError: true,
      displayImage: detailImageHelper.DEFAULT_PRODUCT_IMAGE
    })
  },

  /** 切换价格走势图 */
  onTogglePriceChart() {
    this.setData({ showPriceChart: !this.data.showPriceChart })
  },

  /**
   * 购买商品 — 二次确认后调用购买API
   * 后端: POST /api/v4/marketplace/listings/:market_listing_id/purchase
   *
   * 防止重复提交: purchasing 状态锁 + Idempotency-Key
   * 自买自卖检测: 前端 seller_user_id === currentUserId 提示
   */
  async onPurchase() {
    const { detail, purchasing, currentUserId } = this.data
    if (!detail || purchasing) {
      return
    }

    if (detail.status !== 'on_sale') {
      DetailWechat.showToast('该商品已下架或已售出')
      return
    }

    if (detail.seller_user_id === currentUserId) {
      DetailWechat.showToast('不能购买自己的商品')
      return
    }

    const displayName = this.data.displayName
    const priceLabel = this.data.priceLabel

    const modalResult = await new Promise<{ confirmed: boolean; note: string }>(resolve => {
      wx.showModal({
        title: '确认购买',
        content: `确定要购买「${displayName}」吗？\n\n价格: ${detail.price_amount} ${priceLabel}\n\n确认后将从您的余额中扣除`,
        confirmText: '确认购买',
        confirmColor: '#ff6b35',
        cancelText: '取消',
        editable: true,
        placeholderText: '购买备注（选填）',
        success: (res: any) => resolve({ confirmed: res.confirm, note: res.content || '' })
      })
    })

    if (!modalResult.confirmed) {
      return
    }

    this.setData({ purchasing: true })

    try {
      const result = await API.purchaseMarketProduct(
        detail.market_listing_id,
        modalResult.note || undefined
      )

      if (result && result.success && result.data) {
        const orderData = result.data
        detailLog.info('购买成功:', orderData)

        if (orderData.requires_escrow_confirmation) {
          /* 实物交易 — 需要担保码确认收货 */
          let formattedExpires = ''
          if (orderData.escrow_expires_at) {
            const expiresDate = DetailUtils.safeParseDateString
              ? DetailUtils.safeParseDateString(orderData.escrow_expires_at)
              : new Date(orderData.escrow_expires_at)
            if (expiresDate && !isNaN(expiresDate.getTime())) {
              const y = expiresDate.getFullYear()
              const mo = String(expiresDate.getMonth() + 1).padStart(2, '0')
              const d = String(expiresDate.getDate()).padStart(2, '0')
              const h = String(expiresDate.getHours()).padStart(2, '0')
              const mi = String(expiresDate.getMinutes()).padStart(2, '0')
              formattedExpires = `${y}-${mo}-${d} ${h}:${mi}`
            }
          }
          this.setData({
            purchasing: false,
            showEscrowGuide: true,
            escrowExpiresAt: formattedExpires,
            purchaseResult: orderData
          })
        } else {
          /* 资产交易 — 自动完成 */
          this.setData({
            purchasing: false,
            showPurchaseResult: true,
            purchaseResult: orderData
          })
        }
      } else {
        throw new Error((result && result.message) || '购买失败')
      }
    } catch (purchaseError: any) {
      detailLog.error('购买失败:', purchaseError)
      this.setData({ purchasing: false })

      let errorTip = purchaseError.message || '购买失败，请重试'
      if (purchaseError.code === 'INSUFFICIENT_BALANCE') {
        errorTip = '余额不足，无法购买'
      } else if (purchaseError.code === 'INVALID_LISTING_STATUS') {
        errorTip = '该商品已下架或已售出'
      } else if (purchaseError.code === 'CANNOT_BUY_OWN_LISTING') {
        errorTip = '不能购买自己的商品'
      }

      wx.showModal({
        title: '购买失败',
        content: errorTip,
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  },

  /** 关闭购买成功弹窗 */
  onClosePurchaseResult() {
    this.setData({ showPurchaseResult: false, purchaseResult: null })
    wx.navigateBack()
  },

  /** 关闭担保码说明弹窗 */
  onCloseEscrowGuide() {
    this.setData({ showEscrowGuide: false })
  },

  /** 从担保码说明弹窗跳转到我的订单页面 */
  onGoToMyOrders() {
    this.setData({ showEscrowGuide: false })
    wx.navigateTo({
      url: `/packageTrade/trade/my-orders/my-orders`
    })
  },

  /** 返回市场列表 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({ url: '/packageTrade/trade/market/market' })
      }
    })
  },

  /** 分享 */
  onShareAppMessage() {
    const displayName = this.data.displayName || '精选商品'
    return {
      title: `${displayName} - 交易市场`,
      path: `/packageTrade/trade/listing-detail/listing-detail?market_listing_id=${this.data.marketListingId}`
    }
  }
})
