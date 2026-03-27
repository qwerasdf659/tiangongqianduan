/**
 * C2C交易市场页面 — 瀑布流卡片布局
 *
 * 后端API: GET /api/v4/marketplace/listings
 * 后端响应结构（QueryService 嵌套格式）:
 *   products[]: {
 *     listing_id, listing_kind, seller_user_id, seller_nickname,
 *     price_asset_code, price_amount, status, created_at,
 *     item_info: { display_name, primary_media, category_code, rarity_code },  // 物品类型
 *     asset_info: { asset_code, amount, display_name, primary_media }        // 资产类型
 *   }
 *
 * 图片策略（对齐图片管理体系设计方案 决策5）:
 *   - item 类型 → 后端 item_info.primary_media.public_url（完整公网URL）→ 分类图标 → 占位图
 *   - fungible_asset 类型 → 本地材料图标（按 asset_code 映射）→ 占位图
 *   - C2C交易市场不支持用户上传图片
 *
 * @file packageTrade/trade/market/market.ts
 * @version 5.2.0
 * @since 2026-02-22
 */

const {
  API,
  Logger,
  Waterfall,
  Wechat,
  ImageHelper: imageHelper,
  Utils: marketUtils
} = require('../../../utils/index')
const marketLog = Logger.createLogger('market')

/** 每隔多少条商品穿插一条 feed 广告（前端穿插逻辑，后端只负责下发广告内容） */
const FEED_AD_INTERVAL = 5

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

    /** 最近成交列表（GET /api/v4/marketplace/price/recent-trades） */
    recentTrades: [] as any[],
    recentTradesLoading: false,
    showRecentTrades: false,

    /** 市场总览数据（GET /api/v4/marketplace/analytics/overview） */
    marketOverview: null as any,
    marketOverviewLoading: false,
    showMarketOverview: false,

    /** 服务端筛选参数（对齐 GET /api/v4/marketplace/listings 全部查询参数） */
    filterListingKind: '' as string,
    filterSort: 'recommended' as string,
    filterMinPrice: '' as string,
    filterMaxPrice: '' as string,
    filterCategoryCode: '' as string,
    filterRarityCode: '' as string,
    filterAssetGroupCode: '' as string,
    filterAssetCode: '' as string,

    /** Feed 信息流广告（后端 GET /api/v4/system/ad-delivery?slot_type=feed&position=market_list 返回） */
    feedAdItems: [] as API.AdDeliveryItem[],

    /** 高级筛选面板是否展开 */
    showAdvancedFilter: false,

    /** 筛选维度数据（后端 GET /api/v4/marketplace/listings/facets 返回） */
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

    /** 排序选项（对齐后端 sort 参数，含品质分排序） */
    sortOptions: [
      { key: 'recommended', label: '推荐' },
      { key: 'newest', label: '最新' },
      { key: 'hot', label: '热门' },
      { key: 'price_asc', label: '价格↑' },
      { key: 'price_desc', label: '价格↓' },
      { key: 'quality_score_desc', label: '品质↓' },
      { key: 'quality_score_asc', label: '品质↑' }
    ],

    /** 品质等级筛选（后端 quality_grade 参数，对齐 AttributeRuleEngine 的 5 档等级） */
    filterQualityGrade: '' as string,
    qualityGradeOptions: [
      { key: '', label: '全部品质' },
      { key: '完美无瑕', label: '完美无瑕', color: '#FFD700' },
      { key: '精良', label: '精良', color: '#9B59B6' },
      { key: '良好', label: '良好', color: '#3498DB' },
      { key: '普通', label: '普通', color: '#FFFFFF' },
      { key: '微瑕', label: '微瑕', color: '#95A5A6' }
    ]
  },

  /** 页面生命周期 - 加载 */
  async onLoad(_options: Record<string, string | undefined>) {
    marketLog.info('C2C交易市场页面加载')

    try {
      await this.initializeLayout()
      await this._loadFeedAds()
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
   * 后端API: GET /api/v4/marketplace/listings
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
        page_size: this.data.pageSize,
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
        listingsParams.category_id = this.data.filterCategoryCode
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
      if (this.data.filterQualityGrade) {
        listingsParams.quality_grade = this.data.filterQualityGrade
      }
      const listingsResult = await API.getMarketProducts(listingsParams)
      const { success: listingsSuccess, data: listingsData } = listingsResult

      if (listingsSuccess && listingsData && listingsData.products) {
        const rawProducts = listingsData.products

        /**
         * 适配后端 QueryService 嵌套响应，计算前端展示字段
         * 不做字段重命名，保留全部后端原始字段，仅追加以 _ 为前缀的展示字段
         */
        const processedProducts = rawProducts.map((listing: any) => {
          const itemInfo = listing.item_info || {}
          const instanceAttrs = itemInfo.instance_attributes || {}

          /* 品质等级视觉配置（后端 item_info.instance_attributes） */
          const qualityGrade = instanceAttrs.quality_grade || ''
          const qualityStyle = qualityGrade ? imageHelper.getQualityGradeStyle(qualityGrade) : null

          /* 限量编号（后端 item_info.serial_number + item_info.edition_total） */
          const editionText = imageHelper.formatEdition(
            itemInfo.serial_number,
            itemInfo.edition_total
          )

          return {
            ...listing,
            _displayName: imageHelper.getListingDisplayName(listing),
            _displayImage: imageHelper.getListingDisplayImage(listing),
            _priceLabel: imageHelper.getAssetDisplayName(listing.price_asset_code),
            _isFungibleAsset: listing.listing_kind === 'fungible_asset',
            _offerAmount: listing.asset_info && listing.asset_info.amount,
            _rarityCode: itemInfo.rarity_code,
            _rarityStyle: imageHelper.getRarityStyle(itemInfo.rarity_code || 'common'),
            _isRecommended: listing.is_recommended === true,
            _isPinned: listing.is_pinned === true,
            _imageError: false,
            _qualityGrade: qualityGrade,
            _qualityScore: instanceAttrs.quality_score || null,
            _qualityColorHex: qualityStyle ? qualityStyle.colorHex : '',
            _qualityCssClass: qualityStyle ? qualityStyle.cssClass : '',
            _patternId: instanceAttrs.pattern_id || null,
            _editionText: editionText
          }
        })

        const interleavedProducts = this._interleaveFeedAds(processedProducts)

        const allProducts = append
          ? [...this.data.products, ...interleavedProducts]
          : interleavedProducts

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
   * 后端API: GET /api/v4/marketplace/price/recent-trades
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
   * 后端API: GET /api/v4/marketplace/analytics/overview
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

  /** 防抖重载（300ms），避免快速连续切换筛选触发多次API请求 */
  _debouncedReload: marketUtils.debounce(function (this: any) {
    this.loadProducts(1)
  }, 300),

  /**
   * 切换挂牌类型筛选标签（全部 / 物品 / 资产）
   * 修改后重置分页并防抖加载
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
    this._debouncedReload()
  },

  /**
   * 切换排序方式
   * 修改后重置分页并防抖加载
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
    this._debouncedReload()
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
   * 后端API: GET /api/v4/marketplace/listings/facets
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

  /** 选择品质等级筛选（后端 quality_grade 参数） */
  onQualityGradeSelect(e: any) {
    const grade = e.currentTarget.dataset.grade || ''
    this.setData({
      filterQualityGrade: grade === this.data.filterQualityGrade ? '' : grade
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
      filterAssetCode: '',
      filterQualityGrade: ''
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
      await this._loadFeedAds()
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

  // ========================================
  // Feed 信息流广告（后端 GET /api/v4/system/ad-delivery?slot_type=feed&position=market_list）
  // ========================================

  /**
   * 加载 feed 信息流广告
   *
   * 后端API: GET /api/v4/system/ad-delivery?slot_type=feed&position=market_list
   * 对应广告位: market_list_feed（ID:14，日价30钻石，CPM 5钻石）
   *
   * 广告穿插由前端控制（每隔 FEED_AD_INTERVAL 条商品插入1条广告），后端只负责下发广告内容
   */
  async _loadFeedAds() {
    try {
      const feedResult = await API.getAdDelivery({ slot_type: 'feed', position: 'market_list' })
      if (!feedResult?.success || !feedResult.data) {
        return
      }

      const feedItems: API.AdDeliveryItem[] = feedResult.data.items || []
      if (!Array.isArray(feedItems) || feedItems.length === 0) {
        this.setData({ feedAdItems: [] })
        return
      }

      this.setData({ feedAdItems: feedItems })
      marketLog.info('Feed广告加载成功:', feedItems.length, '条')
    } catch (feedError) {
      marketLog.warn('Feed广告加载失败（不影响商品列表）:', feedError)
    }
  },

  /**
   * 将 feed 广告穿插到商品列表中
   * 穿插规则: 每隔 FEED_AD_INTERVAL 条商品插入一条广告
   * 广告项使用 _isAdItem=true 标记，WXML 通过此标记渲染不同的卡片样式
   */
  _interleaveFeedAds(products: any[]): any[] {
    const feedAds = this.data.feedAdItems
    if (!feedAds || feedAds.length === 0) {
      return products
    }

    const interleavedList: any[] = []
    let adIndex = 0

    for (let i = 0; i < products.length; i++) {
      interleavedList.push(products[i])

      if ((i + 1) % FEED_AD_INTERVAL === 0 && adIndex < feedAds.length) {
        const adItem = feedAds[adIndex]
        interleavedList.push({
          listing_id: `ad_${adItem.ad_campaign_id}`,
          _isAdItem: true,
          _adData: adItem,
          _displayName: adItem.title || '推荐',
          _displayImage: adItem.primary_media?.public_url || '',
          _imageError: false
        })
        adIndex++
      }
    }

    return interleavedList
  },

  /**
   * Feed 广告点击 — 上报 click 事件 + 执行跳转
   */
  onFeedAdTap(e: WechatMiniprogram.CustomEvent) {
    const adData: API.AdDeliveryItem = e.currentTarget.dataset.ad
    if (!adData) {
      return
    }

    this._reportFeedAdEvent(adData, 'click')

    if (adData.link_url && adData.link_type && adData.link_type !== 'none') {
      switch (adData.link_type) {
        case 'page':
          wx.navigateTo({
            url: adData.link_url,
            fail: () => {
              wx.switchTab({
                url: adData.link_url!,
                fail: (err: any) => marketLog.error('广告跳转页面失败:', err)
              })
            }
          })
          break

        case 'miniprogram':
          wx.navigateToMiniProgram({
            appId: adData.link_url,
            fail: (err: any) => marketLog.error('广告跳转小程序失败:', err)
          })
          break

        case 'webview':
          wx.navigateTo({
            url: '/pages/webview/webview?url=' + encodeURIComponent(adData.link_url),
            fail: (err: any) => marketLog.error('广告跳转webview失败:', err)
          })
          break

        default:
          marketLog.warn('未知的广告跳转类型:', adData.link_type)
      }
    }
  },

  /**
   * Feed 广告事件上报 — 按 campaign_category 分流
   * commercial → reportAdImpression / reportAdClick（计费系统）
   * operational / system → reportInteractionLog（交互日志）
   */
  _reportFeedAdEvent(adItem: API.AdDeliveryItem, eventType: 'impression' | 'click') {
    if (!adItem?.ad_campaign_id) {
      return
    }

    if (adItem.campaign_category === 'commercial') {
      if (!adItem.ad_slot_id) {
        marketLog.error('商业Feed广告缺少 ad_slot_id:', adItem.ad_campaign_id)
        return
      }

      if (eventType === 'impression') {
        API.reportAdImpression({
          ad_campaign_id: adItem.ad_campaign_id,
          ad_slot_id: adItem.ad_slot_id
        }).catch((err: any) => {
          marketLog.warn('Feed广告曝光上报失败:', err)
        })
      } else {
        API.reportAdClick({
          ad_campaign_id: adItem.ad_campaign_id,
          ad_slot_id: adItem.ad_slot_id,
          click_target: adItem.link_url || undefined
        }).catch((err: any) => {
          marketLog.warn('Feed广告点击上报失败:', err)
        })
      }
    } else {
      API.reportInteractionLog({
        ad_campaign_id: adItem.ad_campaign_id,
        interaction_type: eventType,
        extra_data: { slot_type: 'feed', position: 'market_list' }
      }).catch((err: any) => {
        marketLog.warn('Feed交互日志上报失败:', err)
      })
    }
  },

  onUnload() {},

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
