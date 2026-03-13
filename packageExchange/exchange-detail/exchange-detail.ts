/**
 * 兑换商品详情页 — 游戏商城风格轻量详情
 *
 * 后端API: GET /api/v4/backpack/exchange/items/:exchange_item_id
 * 兑换API: POST /api/v4/backpack/exchange（body: { exchange_item_id, quantity }）
 * 余额API: GET /api/v4/assets/balances
 *
 * 路由参数: exchange_item_id（exchange_items 表主键）
 * 来源: exchange-shelf 商品卡片点击跳转
 *
 * @file packageExchange/exchange-detail/exchange-detail.ts
 * @version 2.0.0
 * @since 2026-03-14
 */

const {
  API: DetailPageAPI,
  Logger: DetailPageLogger,
  ImageHelper: detailPageImageHelper
} = require('../../utils/index')
const { formatAssetLabel } = require('../utils/product-display')

const edLog = DetailPageLogger.createLogger('exchange-detail')

/** 全息效果稀有度白名单 */
const HOLO_RARITY_LIST = ['legendary', 'epic']

Page({
  data: {
    /** 路由参数 */
    exchangeItemId: 0,

    /** 商品详情（API 返回） */
    product: null as any,

    /** 稀有度样式配置 */
    rarityStyle: null as any,

    /** 库存剩余百分比 */
    stockPercent: 100,

    /** 当前资产余额 */
    currentBalance: 0,

    /** 余额是否不足 */
    balanceInsufficient: false,

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: '',

    /** 兑换确认弹窗 */
    showConfirm: false,
    exchangeQuantity: 1,
    exchanging: false
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = parseInt(options.exchange_item_id || '0', 10)
    if (!itemId) {
      edLog.error('缺少 exchange_item_id 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '商品信息无效' })
      return
    }

    this.setData({ exchangeItemId: itemId })
    this._loadProductDetail(itemId)
  },

  /**
   * 加载商品详情（对接真实API）
   *
   * 数据流:
   *   GET /api/v4/backpack/exchange/items/:id → 商品详情
   *   GET /api/v4/assets/balances → 用户资产余额
   *   并行请求后合并渲染
   */
  async _loadProductDetail(itemId: number) {
    this.setData({ loading: true, hasError: false })

    try {
      const [detailResponse, balanceResponse] = await Promise.all([
        DetailPageAPI.getExchangeItemDetail(itemId),
        DetailPageAPI.getAssetBalances()
      ])

      if (!detailResponse || !detailResponse.success || !detailResponse.data) {
        throw new Error(detailResponse?.message || '商品不存在或已下架')
      }

      const productData = detailResponse.data
      const priceCode: string = productData.cost_asset_code || 'POINTS'

      /**
       * 商品名称字段兼容：
       * 列表API GET /backpack/exchange/items 返回 name
       * 详情API可能返回 item_name（数据库字段名）或 name（别名）
       * exchange-orders 的 item_snapshot 使用 item_name
       * 此处统一为 item_name，确保 WXML 绑定一致
       */
      const productDisplayName: string = productData.item_name || productData.name || ''

      const rarityConfig = detailPageImageHelper.getRarityStyle(productData.rarity_code || 'common')

      const imgSrc: string =
        (productData.primary_image &&
          (productData.primary_image.url || productData.primary_image.thumbnail_url)) ||
        productData.image ||
        ''
      const validImage: boolean = !!imgSrc && imgSrc !== detailPageImageHelper.DEFAULT_PRODUCT_IMAGE

      const enrichedProduct = Object.assign({}, productData, {
        item_name: productDisplayName,
        _priceLabel: formatAssetLabel(priceCode),
        _rarityClass: rarityConfig ? rarityConfig.cssClass : '',
        _isLegendary: HOLO_RARITY_LIST.includes(productData.rarity_code),
        _isLimited: productData.is_limited === true,
        _hasImage: validImage,
        image: imgSrc || ''
      })

      const totalSupply: number = (productData.stock || 0) + (productData.sold_count || 0)
      const remainPercent: number =
        totalSupply > 0 ? Math.round(((productData.stock || 0) / totalSupply) * 100) : 100

      /* 从余额API提取对应资产的可用余额 */
      let assetBalance = 0
      if (balanceResponse && balanceResponse.success && balanceResponse.data) {
        const allBalances =
          balanceResponse.data.balances ||
          (Array.isArray(balanceResponse.data) ? balanceResponse.data : [])
        const matchedAsset = allBalances.find(
          (balanceItem: any) => balanceItem.asset_code === priceCode
        )
        assetBalance = matchedAsset ? matchedAsset.available_amount || 0 : 0
      }

      const insufficient: boolean = assetBalance < (productData.cost_amount || 0)

      this.setData({
        product: enrichedProduct,
        rarityStyle: rarityConfig,
        stockPercent: remainPercent,
        currentBalance: assetBalance,
        balanceInsufficient: insufficient,
        loading: false
      })

      wx.setNavigationBarTitle({ title: productDisplayName || '商品详情' })
      edLog.info('商品详情加载成功:', productDisplayName)
    } catch (error: any) {
      edLog.error('商品详情加载失败:', error)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: error.message || '加载失败，请重试'
      })
    }
  },

  /** 商品图片加载失败 */
  onImageError() {
    const { product } = this.data
    if (product) {
      this.setData({
        'product._hasImage': false
      })
    }
  },

  /** 点击立即兑换 → 打开确认弹窗 */
  onExchange() {
    const { product } = this.data
    if (!product || product.stock <= 0 || this.data.balanceInsufficient) {
      return
    }

    this.setData({
      showConfirm: true,
      exchangeQuantity: 1,
      exchanging: false
    })
  },

  /** 关闭确认弹窗 */
  onCloseConfirm() {
    if (this.data.exchanging) {
      return
    }
    this.setData({ showConfirm: false })
  },

  /** 数量增减 */
  onQuantityChange(e: any) {
    const action = e.currentTarget.dataset.action
    let { exchangeQuantity } = this.data
    const maxQty = Math.min(this.data.product.stock, 99)

    if (action === 'increase') {
      exchangeQuantity = Math.min(exchangeQuantity + 1, maxQty)
    } else if (action === 'decrease') {
      exchangeQuantity = Math.max(exchangeQuantity - 1, 1)
    }

    this.setData({ exchangeQuantity })
  },

  /**
   * 确认兑换（调用真实API）
   * POST /api/v4/backpack/exchange
   * body: { exchange_item_id, quantity }
   * header: Idempotency-Key
   */
  async onConfirmExchange() {
    const { product, exchangeQuantity, exchanging, currentBalance } = this.data

    if (!product || exchanging) {
      return
    }

    const totalCost = product.cost_amount * exchangeQuantity
    if (currentBalance < totalCost) {
      wx.showToast({ title: '余额不足', icon: 'none' })
      return
    }

    this.setData({ exchanging: true })

    try {
      const response = await DetailPageAPI.exchangeProduct(
        product.exchange_item_id,
        exchangeQuantity
      )

      if (response && response.success && response.data) {
        edLog.info('兑换成功:', response.data)

        this.setData({
          exchanging: false,
          showConfirm: false
        })

        wx.showToast({ title: '兑换成功！', icon: 'success', duration: 2000 })

        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      } else {
        throw new Error((response && response.message) || '兑换失败')
      }
    } catch (error: any) {
      edLog.error('兑换失败:', error)
      this.setData({ exchanging: false })

      let errorMessage = '兑换失败，请重试'
      if (error.statusCode === 400) {
        errorMessage = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        errorMessage = error.message || '库存不足或余额不足'
      } else if (error.message) {
        errorMessage = error.message
      }

      wx.showModal({
        title: '兑换失败',
        content: errorMessage,
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/exchange/exchange' })
      }
    })
  },

  /** 分享 */
  onShareAppMessage() {
    const productName = this.data.product ? this.data.product.item_name : '精选商品'
    return {
      title: `${productName} - 积分商城`,
      path: `/packageExchange/exchange-detail/exchange-detail?exchange_item_id=${this.data.exchangeItemId}`
    }
  }
})
