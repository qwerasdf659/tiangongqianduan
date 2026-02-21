/**
 * C2C交易市场页面 — 瀑布流卡片布局
 *
 * 后端API: GET /api/v4/market/listings
 * 后端响应结构（QueryService 嵌套格式）:
 *   products[]: {
 *     market_listing_id, listing_kind, seller_user_id, seller_nickname,
 *     price_asset_code, price_amount, status, created_at,
 *     item_info: { display_name, image_url, category_code, rarity_code },  // 物品类型
 *     asset_info: { asset_code, amount, display_name, icon_url }           // 资产类型
 *   }
 *
 * 图片策略（对齐图片管理体系设计方案 决策5）:
 *   - item_instance 类型 → 后端 item_info.image_url（完整公网URL）→ 分类图标 → 占位图
 *   - fungible_asset 类型 → 本地材料图标（按 asset_code 映射）→ 占位图
 *   - C2C交易市场不支持用户上传图片
 *
 * @file packageTrade/trade/market/market.ts
 * @version 5.3.0
 * @since 2026-02-22
 */

const { API, Logger, Waterfall, Wechat, ImageHelper: imageHelper } = require('../../../utils/index')
const marketLog = Logger.createLogger('market')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { tradeStore } = require('../../../store/trade')

Page({
  data: {
    /** 处理后的挂单列表（带布局定位 + 展示字段） */
    products: [] as any[],
    loading: false,
    hasMore: true,
    currentPage: 1,
    pageSize: 20,

    /** 瀑布流布局配置 */
    containerWidth: 0,
    containerHeight: 0,
    columnHeights: [0, 0],
    cardGap: 15,
    cardPadding: 20,

    /** 错误状态 */
    hasError: false,
    errorMessage: ''
  },

  /** 页面生命周期 - 加载 */
  async onLoad(_options: Record<string, string | undefined>) {
    marketLog.info('C2C交易市场页面加载')

    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: ['marketListings', 'marketLoading'],
      actions: ['setMarketListings', 'appendMarketListings', 'setMarketLoading']
    })

    try {
      await this.initializeLayout()
      await this.loadProducts(1)
      marketLog.info('交易市场初始化完成')
    } catch (error) {
      marketLog.error('交易市场初始化失败', error)
      this.setData({ hasError: true, errorMessage: '页面加载失败，请重试' })
    }
  },

  /** 初始化瀑布流布局尺寸 */
  async initializeLayout() {
    const windowInfo = wx.getWindowInfo()
    const containerWidth = windowInfo.windowWidth - this.data.cardPadding * 2

    this.setData({ containerWidth, columnHeights: [0, 0] })
    marketLog.info('布局配置:', { screenWidth: windowInfo.windowWidth, containerWidth })
  },

  /**
   * 加载交易市场挂单数据
   *
   * 后端API: GET /api/v4/market/listings
   * 响应: { products: MarketListing[], pagination: { page, page_size, total } }
   *
   * 数据处理流程:
   *   1. 调用后端API获取原始挂单数据
   *   2. 为每条挂单计算展示字段（图片路径、显示名称、价格标签）
   *   3. 传入瀑布流工具计算定位
   *   4. 更新页面数据
   */
  async loadProducts(page: number = 1, append: boolean = false) {
    if (this.data.loading) {
      return
    }

    marketLog.info(`加载交易市场数据 - 第${page}页`)
    this.setData({ loading: true })

    try {
      const result = await API.getMarketProducts({ page, limit: this.data.pageSize })
      const { success, data } = result

      if (success && data && data.products) {
        const rawProducts = data.products

        /**
         * 适配后端 QueryService 嵌套响应，计算前端展示字段
         * 不做字段重命名，保留全部后端原始字段，仅追加以 _ 为前缀的展示字段
         */
        const processedProducts = rawProducts.map((listing: any) => ({
          ...listing,
          _displayName: imageHelper.getListingDisplayName(listing),
          _displayImage: imageHelper.getListingDisplayImage(listing),
          _priceLabel: imageHelper.getAssetDisplayName(listing.price_asset_code),
          _isFungibleAsset: listing.listing_kind === 'fungible_asset',
          _offerAmount: listing.asset_info && listing.asset_info.amount,
          _rarityCode: listing.item_info && listing.item_info.rarity_code,
          _rarityStyle: imageHelper.getRarityStyle(
            (listing.item_info && listing.item_info.rarity_code) || 'common'
          ),
          _imageError: false
        }))

        const allProducts = append
          ? [...this.data.products, ...processedProducts]
          : processedProducts

        const startTime = Date.now()
        const layoutResult = Waterfall.calculateWaterfallLayout(allProducts, {
          containerWidth: this.data.containerWidth,
          cardGap: this.data.cardGap,
          imageHeight: 180,
          cardPadding: 50
        })
        marketLog.info(`瀑布流计算耗时: ${Date.now() - startTime}ms`)

        this.setData({
          products: layoutResult.layoutProducts,
          currentPage: page,
          hasMore: rawProducts.length === this.data.pageSize,
          columnHeights: layoutResult.columnHeights,
          containerHeight: layoutResult.containerHeight,
          loading: false,
          hasError: false
        })

        marketLog.info(`加载完成 - ${layoutResult.layoutProducts.length}条挂单`)
      } else {
        this.setData({ loading: false })
      }
    } catch (error) {
      marketLog.error('交易市场数据加载失败:', error)
      this.setData({ loading: false })
    }
  },

  /**
   * 商品图片加载失败 — 降级到占位图
   * WXML绑定: binderror="onImageError"
   */
  onImageError(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    if (index === undefined || index === null) {
      return
    }
    this.setData({
      [`products[${index}]._displayImage`]: imageHelper.DEFAULT_PRODUCT_IMAGE,
      [`products[${index}]._imageError`]: true
    })
  },

  /**
   * 商品点击 — 跳转到挂单详情
   * 使用后端字段 market_listing_id 作为路由参数
   */
  onProductClick(e: WechatMiniprogram.TouchEvent) {
    const product = e.currentTarget.dataset.product
    if (!product || !product.market_listing_id) {
      return
    }

    marketLog.info('点击挂单:', product._displayName)
    wx.reportAnalytics('product_click', {
      layout_type: 'waterfall',
      market_listing_id: product.market_listing_id,
      listing_kind: product.listing_kind
    })

    wx.navigateTo({
      url: `/packageTrade/trade/market/market?market_listing_id=${product.market_listing_id}&source=waterfall_market`
    })
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    marketLog.info('下拉刷新')
    try {
      this.setData({ products: [], currentPage: 1, hasMore: true, columnHeights: [0, 0] })
      await this.loadProducts(1)
      wx.stopPullDownRefresh()
      Wechat.showToast('刷新成功', 'success', 1500)
    } catch (error) {
      marketLog.error('刷新失败:', error)
      wx.stopPullDownRefresh()
      Wechat.showToast('刷新失败')
    }
  },

  /** 上拉加载更多 */
  async onReachBottom() {
    if (!this.data.hasMore || this.data.loading) {
      return
    }
    await this.loadProducts(this.data.currentPage + 1, true)
  },

  /** 页面显示 */
  onShow() {
    if (this.data.products.length === 0) {
      this.loadProducts(1)
    }
  },

  /** 页面卸载 */
  onUnload() {
    if (this.tradeBindings) {
      this.tradeBindings.destroyStoreBindings()
    }
  },

  /** 分享 */
  onShareAppMessage() {
    return {
      title: '发现好物市场 - 精选商品等你来',
      path: '/packageTrade/trade/market/market',
      imageUrl: imageHelper.DEFAULT_PRODUCT_IMAGE
    }
  },

  /** 回到顶部 */
  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  }
})

export {}
