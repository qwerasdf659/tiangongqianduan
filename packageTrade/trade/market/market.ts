/**
 * C2C交易市场页面 — 瀑布流卡片布局
 *
 * 后端API: GET /api/v4/market/listings
 * 后端响应结构（QueryService 嵌套格式）:
 *   products[]: {
 *     listing_id, listing_kind, seller_user_id, seller_nickname,
 *     price_asset_code, price_amount, status, created_at,
 *     item_info: { display_name, image_url, category_code, rarity_code },  // 物品类型
 *     asset_info: { asset_code, amount, display_name, icon_url }           // 资产类型
 *   }
 *
 * 图片策略（对齐图片管理体系设计方案 决策5）:
 *   - item 类型 → 后端 item_info.image_url（完整公网URL）→ 分类图标 → 占位图
 *   - fungible_asset 类型 → 本地材料图标（按 asset_code 映射）→ 占位图
 *   - C2C交易市场不支持用户上传图片
 *
 * @file packageTrade/trade/market/market.ts
 * @version 5.2.0
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
    errorMessage: '',

    /** 价格走势图（默认收起，用户手动展开） */
    showPriceChart: false,
    chartAssetCode: 'red_shard',
    /** 可选资产列表（用于走势图资产选择器，来自 facets 或 settlement-currencies） */
    chartAssetOptions: [] as any[],

    /** 最近成交列表（GET /api/v4/market/price/recent-trades） */
    recentTrades: [] as any[],
    recentTradesLoading: false,
    showRecentTrades: false,

    /** 市场总览数据（GET /api/v4/market/analytics/overview） */
    marketOverview: null as any,
    marketOverviewLoading: false,
    showMarketOverview: false,

    /** 服务端筛选参数（对齐 GET /api/v4/market/listings 全部查询参数） */
    filterListingKind: '' as string,
    filterSort: 'newest' as string,
    filterMinPrice: '' as string,
    filterMaxPrice: '' as string,
    filterCategoryCode: '' as string,
    filterRarityCode: '' as string,
    filterAssetGroupCode: '' as string,
    filterAssetCode: '' as string,

    /** 高级筛选面板是否展开 */
    showAdvancedFilter: false,

    /** 筛选维度数据（后端 GET /api/v4/market/listings/facets 返回） */
    facetsData: null as any,
    facetsLoaded: false,

    /** 筛选维度聚合计数（后端 with_counts=true 返回的 filters_count） */
    filtersCount: null as any,

    /** 挂牌类型标签（前端UI常量） */
    kindTabs: [
      { key: '', label: '全部' },
      { key: 'item', label: '物品' },
      { key: 'fungible_asset', label: '资产' }
    ],

    /** 排序选项（前端UI常量，对齐文档 sort 参数） */
    sortOptions: [
      { key: 'newest', label: '最新' },
      { key: 'price_asc', label: '价格↑' },
      { key: 'price_desc', label: '价格↓' }
    ]
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
      const listingsParams: Record<string, any> = {
        page,
        limit: this.data.pageSize,
        with_counts: true
      }
      if (this.data.filterListingKind) {
        listingsParams.listing_kind = this.data.filterListingKind
      }
      if (this.data.filterSort) {
        listingsParams.sort = this.data.filterSort
      }
      if (this.data.filterMinPrice) {
        const parsedMin = parseInt(this.data.filterMinPrice, 10)
        if (!isNaN(parsedMin) && parsedMin > 0) {
          listingsParams.min_price = parsedMin
        }
      }
      if (this.data.filterMaxPrice) {
        const parsedMax = parseInt(this.data.filterMaxPrice, 10)
        if (!isNaN(parsedMax) && parsedMax > 0) {
          listingsParams.max_price = parsedMax
        }
      }
      if (this.data.filterCategoryCode) {
        listingsParams.item_category_code = this.data.filterCategoryCode
      }
      if (this.data.filterRarityCode) {
        listingsParams.rarity_code = this.data.filterRarityCode
      }
      if (this.data.filterAssetGroupCode) {
        listingsParams.asset_group_code = this.data.filterAssetGroupCode
      }
      if (this.data.filterAssetCode) {
        listingsParams.asset_code = this.data.filterAssetCode
      }
      const listingsResult = await API.getMarketProducts(listingsParams)
      const { success: listingsSuccess, data: listingsData } = listingsResult

      if (listingsSuccess && listingsData && listingsData.products) {
        const rawProducts = listingsData.products

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
          hasError: false,
          filtersCount: listingsData.filters_count || null
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

  /** 切换价格走势图显示/隐藏，首次展开时加载可选资产列表 */
  onTogglePriceChart() {
    const willShow = !this.data.showPriceChart
    this.setData({ showPriceChart: willShow })
    if (willShow && this.data.chartAssetOptions.length === 0) {
      this._loadChartAssetOptions()
    }
  },

  /** 切换走势图资产 */
  onChartAssetChange(e: any) {
    const assetCode = e.currentTarget.dataset.code
    if (assetCode && assetCode !== this.data.chartAssetCode) {
      this.setData({ chartAssetCode: assetCode })
    }
  },

  /** 加载走势图可选资产列表（复用 settlement-currencies 或 facets） */
  async _loadChartAssetOptions() {
    try {
      const response = await API.getSettlementCurrencies()
      if (response && response.success && response.data) {
        const currencies = Array.isArray(response.data)
          ? response.data
          : response.data.currencies || []
        this.setData({ chartAssetOptions: currencies })
        marketLog.info(`走势图资产选项加载: ${currencies.length} 种`)
      }
    } catch (optError: any) {
      marketLog.warn('加载走势图资产选项失败:', optError.message)
    }
  },

  /** 切换最近成交列表显示/隐藏，首次展开时加载数据 */
  onToggleRecentTrades() {
    const willShow = !this.data.showRecentTrades
    this.setData({ showRecentTrades: willShow })
    if (willShow && this.data.recentTrades.length === 0) {
      this.loadRecentTrades()
    }
  },

  /**
   * 加载最近成交列表
   * 后端API: GET /api/v4/market/price/recent-trades
   * 响应: { data: [ { trade_order_id, price_amount, display_name, buyer_nickname, ... } ] }
   */
  async loadRecentTrades() {
    this.setData({ recentTradesLoading: true })
    try {
      const tradesResponse = await API.getRecentTrades({ limit: 15 })
      if (tradesResponse && tradesResponse.success && tradesResponse.data) {
        const tradesList = Array.isArray(tradesResponse.data)
          ? tradesResponse.data
          : tradesResponse.data.trades || []
        this.setData({ recentTrades: tradesList, recentTradesLoading: false })
        marketLog.info(`最近成交加载完成: ${tradesList.length}笔`)
      } else {
        this.setData({ recentTradesLoading: false })
      }
    } catch (tradesError) {
      marketLog.error('加载最近成交失败:', tradesError)
      this.setData({ recentTradesLoading: false })
    }
  },

  /** 切换市场总览面板显示/隐藏，首次展开时加载数据 */
  onToggleMarketOverview() {
    const willShow = !this.data.showMarketOverview
    this.setData({ showMarketOverview: willShow })
    if (willShow && !this.data.marketOverview) {
      this.loadMarketOverview()
    }
  },

  /**
   * 加载市场总览数据
   * 后端API: GET /api/v4/market/analytics/overview
   *
   * 响应 data 包含:
   *   active_listings - 在售挂单数
   *   total_trades    - 累计成交笔数
   *   trades_24h      - 24小时成交笔数（WXML引用，后端按需返回，缺失时显示0）
   *   volume_24h      - 24小时交易额（WXML引用，后端按需返回，缺失时显示0）
   *   asset_rankings  - 资产成交量排行数组
   */
  async loadMarketOverview() {
    this.setData({ marketOverviewLoading: true })
    try {
      const overviewResponse = await API.getMarketOverview()
      if (overviewResponse && overviewResponse.success && overviewResponse.data) {
        this.setData({ marketOverview: overviewResponse.data, marketOverviewLoading: false })
        marketLog.info('市场总览加载完成')
      } else {
        this.setData({ marketOverviewLoading: false })
      }
    } catch (overviewError) {
      marketLog.error('加载市场总览失败:', overviewError)
      this.setData({ marketOverviewLoading: false })
    }
  },

  /**
   * 切换挂牌类型筛选标签（全部 / 物品 / 资产）
   * 修改后重置分页并重新加载（服务端筛选）
   */
  onKindTabChange(e: WechatMiniprogram.TouchEvent) {
    const kindKey = e.currentTarget.dataset.kind
    if (kindKey === this.data.filterListingKind) {
      return
    }
    this.setData({
      filterListingKind: kindKey,
      products: [],
      currentPage: 1,
      hasMore: true,
      columnHeights: [0, 0]
    })
    this.loadProducts(1)
  },

  /**
   * 切换排序方式
   * 修改后重置分页并重新加载（服务端排序）
   */
  onSortChange(e: WechatMiniprogram.TouchEvent) {
    const sortKey = e.currentTarget.dataset.sort
    if (sortKey === this.data.filterSort) {
      return
    }
    this.setData({
      filterSort: sortKey,
      products: [],
      currentPage: 1,
      hasMore: true,
      columnHeights: [0, 0]
    })
    this.loadProducts(1)
  },

  /** 切换高级筛选面板，首次展开时加载分面数据 */
  onToggleAdvancedFilter() {
    const willShow = !this.data.showAdvancedFilter
    this.setData({ showAdvancedFilter: willShow })
    if (willShow && !this.data.facetsLoaded) {
      this._loadFacets()
    }
  },

  /**
   * 加载筛选维度数据
   * 后端API: GET /api/v4/market/listings/facets
   */
  async _loadFacets() {
    try {
      const facetsResponse = await API.getMarketFacets()
      if (facetsResponse && facetsResponse.success && facetsResponse.data) {
        this.setData({ facetsData: facetsResponse.data, facetsLoaded: true })
        marketLog.info('筛选维度加载成功')
      }
    } catch (facetsError) {
      marketLog.warn('加载筛选维度失败:', facetsError)
    }
  },

  /** 最低价格输入 */
  onMinPriceInput(e: any) {
    this.setData({ filterMinPrice: (e.detail.value || '').replace(/[^0-9]/g, '') })
  },

  /** 最高价格输入 */
  onMaxPriceInput(e: any) {
    this.setData({ filterMaxPrice: (e.detail.value || '').replace(/[^0-9]/g, '') })
  },

  /** 选择分类 */
  onCategorySelect(e: any) {
    const code = e.currentTarget.dataset.code || ''
    this.setData({
      filterCategoryCode: code === this.data.filterCategoryCode ? '' : code
    })
  },

  /** 选择稀有度 */
  onRaritySelect(e: any) {
    const code = e.currentTarget.dataset.code || ''
    this.setData({
      filterRarityCode: code === this.data.filterRarityCode ? '' : code
    })
  },

  /** 选择资产分组（对齐文档 asset_group_code 查询参数） */
  onAssetGroupSelect(e: any) {
    const code = e.currentTarget.dataset.code || ''
    this.setData({
      filterAssetGroupCode: code === this.data.filterAssetGroupCode ? '' : code
    })
  },

  /** 选择资产代码（对齐文档 asset_code 查询参数，仅 fungible_asset 有效） */
  onAssetCodeSelect(e: any) {
    const code = e.currentTarget.dataset.code || ''
    this.setData({
      filterAssetCode: code === this.data.filterAssetCode ? '' : code
    })
  },

  /** 应用高级筛选 — 关闭面板并重新加载 */
  onApplyAdvancedFilter() {
    this.setData({
      showAdvancedFilter: false,
      products: [],
      currentPage: 1,
      hasMore: true,
      columnHeights: [0, 0]
    })
    this.loadProducts(1)
  },

  /** 重置高级筛选 */
  onResetAdvancedFilter() {
    this.setData({
      filterMinPrice: '',
      filterMaxPrice: '',
      filterCategoryCode: '',
      filterRarityCode: '',
      filterAssetGroupCode: '',
      filterAssetCode: ''
    })
  },

  /** 跳转到我的订单页面 */
  onGoToMyOrders() {
    wx.navigateTo({ url: '/packageTrade/trade/my-orders/my-orders' })
  },

  /**
   * 商品点击 — 跳转到挂单详情
   * 使用后端字段 listing_id 作为路由参数
   */
  onProductClick(e: WechatMiniprogram.TouchEvent) {
    const product = e.currentTarget.dataset.product
    if (!product || !product.listing_id) {
      return
    }

    marketLog.info('点击挂单:', product._displayName)
    wx.reportAnalytics('product_click', {
      layout_type: 'waterfall',
      listing_id: product.listing_id,
      listing_kind: product.listing_kind
    })

    wx.navigateTo({
      url: `/packageTrade/trade/listing-detail/listing-detail?listing_id=${product.listing_id}`
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
