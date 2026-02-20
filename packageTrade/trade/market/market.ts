/**
 * 🌊 V4.0交易市场页面 - 瀑布流卡片布局
 *
 * 核心特性：双列瀑布流、图片优先展示、智能懒加载、无限滚 * 布局计算委托给共享工utils/waterfall.ts，消除重复实 *
 * @file 天工餐厅积分系统 - 交易市场页面
 * @version 5.2.0
 * @since 2026-02-15
 */

// 🔴 统一工具函数导入（外部页面统一从utils/index导入）
const { API, Logger, Waterfall, Wechat } = require('../../../utils/index')
const marketLog = Logger.createLogger('market')

// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { tradeStore } = require('../../../store/trade')

Page({
  data: {
    // 🎨 瀑布流布局数据
    products: [] as API.MarketListing[],
    loading: false,
    hasMore: true,
    currentPage: 1,
    pageSize: 20,

    // 🌊 瀑布流布局配置
    containerWidth: 0,
    containerHeight: 0,
    /** 双列高度记录 */
    columnHeights: [0, 0],
    /** 卡片间距（px?*/
    cardGap: 15,
    /** 容器内边距（px?*/
    cardPadding: 20,

    // 🖼图片懒加载配置    /** 懒加载阈值（px*/
    lazyLoadThreshold: 100,
    /** 预加载数据*/
    preloadCount: 10,
    /** 图片加载状态映?*/
    imageLoadedMap: {} as Record<string, boolean>,

    // 错误状态管理
    hasError: false,
    errorMessage: '',
    errorDetail: '',

    // 📊 性能监控数据
    performanceStats: {
      renderTime: 0,
      layoutCalculationTime: 0,
      totalProducts: 0,
      memoryUsage: 0
    },

    // 📊 性能统计弹窗
    showStatsModal: false
  },

  /** 📍 页面生命周期 - 加载 */
  async onLoad(_options: Record<string, string | undefined>) {
    marketLog.info('🌊 瀑布流卡片布局页面加载开开始')

    // 🆕 MobX Store绑定 - 交易市场状态自动同
    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: ['marketListings', 'marketLoading'],
      actions: ['setMarketListings', 'appendMarketListings', 'setMarketLoading']
    })

    try {
      // 获取系统信息和容器尺
      await this.initializeLayout()

      // 设置图片懒加
      this.setupLazyLoading()

      // 加载初始商品数据
      await this.loadProducts(1)

      marketLog.info('?瀑布流布局初始化完成')
    } catch (error) {
      marketLog.error('?瀑布流布局初始化失败', error)
      this.handleShowError('页面加载失败，请重试')
    }
  },

  /** 🔧 初始化瀑布流布局 */
  async initializeLayout() {
    marketLog.info('初始化瀑布流布局配置')

    const windowInfo = wx.getWindowInfo()
    const containerWidth = windowInfo.windowWidth - this.data.cardPadding * 2

    this.setData({
      containerWidth,
      columnHeights: [0, 0]
    })

    marketLog.info('📐 布局配置完成:', {
      screenWidth: windowInfo.windowWidth,
      containerWidth,
      cardGap: this.data.cardGap
    })
  },

  /** 🖼?设置图片懒加载观察器 */
  setupLazyLoading() {
    marketLog.info('🖼?设置图片懒加载观察器')

    this.intersectionObserver = wx.createIntersectionObserver(this, {
      rootMargin: `${this.data.lazyLoadThreshold}px`
    } as any)

    this.intersectionObserver.relativeToViewport().observe('.product-image', (res: any) => {
      if (res.intersectionRatio > 0) {
        const productId = res.dataset.productId
        if (productId && !this.data.imageLoadedMap[productId]) {
          this.loadProductImage(productId)
        }
      }
    })
  },

  /**
   * 加载商品数据 - 调用后端 GET /api/v4/market/listings
   *
   * 后端响应: { products: MarketListing[], pagination: { page, page_size, total } }
   * 响应字段（market_listings 表）: market_listing_id, listing_kind, seller_user_id,
   *   offer_item_display_name, offer_asset_display_name, price_asset_code, price_amount, status, ...
   *
   * @param page - 页码（从1开始）
   * @param append - 是否追加到现有列表（上拉加载更多时为true   */
  async loadProducts(page: number = 1, append: boolean = false) {
    if (this.data.loading) {
      marketLog.info('正在加载中，跳过重复请求')
      return
    }

    marketLog.info(`开始加载商品数据- ?{page}页`)
    this.setData({ loading: true })

    try {
      /* 参数已改为对象形式，对齐后端 getMarketProducts 新签?*/
      const result = await API.getMarketProducts({ page, limit: this.data.pageSize })
      const { success, data } = result

      if (success && data && data.products) {
        const newProducts = data.products
        marketLog.info('?市场商品数据加载成功')

        const allProducts = append ? [...this.data.products, ...newProducts] : newProducts

        // 🌊 使用共享瀑布流工具计算布局（utils/waterfall.ts
        const startTime = Date.now()
        const layoutResult = Waterfall.calculateWaterfallLayout(allProducts, {
          containerWidth: this.data.containerWidth,
          cardGap: this.data.cardGap,
          imageHeight: 200,
          cardPadding: 40
        })
        const layoutTime = Date.now() - startTime

        // 📊 更新性能统计
        this.updatePerformanceStats(layoutTime, layoutResult.layoutProducts.length)

        this.setData({
          products: layoutResult.layoutProducts,
          currentPage: page,
          hasMore: newProducts.length === this.data.pageSize,
          columnHeights: layoutResult.columnHeights,
          containerHeight: layoutResult.containerHeight,
          loading: false
        })

        marketLog.info(`?商品数据加载完成 - ?{layoutResult.layoutProducts.length}个商品`)
      } else {
        this.setData({ loading: false })
      }
    } catch (error) {
      marketLog.error('?商品数据加载失败:', error)
      this.setData({ loading: false })
    }
  },

  /** 🖼?加载单个商品图片 */
  loadProductImage(productId: string) {
    marketLog.info(`🖼?开始加载商品图? ${productId}`)

    const imageLoadedMap = { ...this.data.imageLoadedMap }
    imageLoadedMap[productId] = true

    this.setData({ imageLoadedMap })
  },

  /** 📊 更新性能统计数据 */
  updatePerformanceStats(layoutTime: number, productCount: number) {
    const performanceStats = {
      ...this.data.performanceStats,
      layoutCalculationTime: layoutTime,
      totalProducts: productCount,
      renderTime: Date.now()
    }

    this.setData({ performanceStats })
    marketLog.info('性能统计更新:', performanceStats)
  },

  /**
   * 🎯 商品点击事件处理
   * 后端字段: market_listing_id（挂单ID），offer_item_display_name（商品名称）
   */
  onProductClick(e: WechatMiniprogram.TouchEvent) {
    const product = e.currentTarget.dataset.product

    marketLog.info(
      '🎯 商品点击:',
      product.offer_item_display_name || product.offer_asset_display_name
    )

    // 埋点统计 使用后端字段 market_listing_id
    wx.reportAnalytics('product_click', {
      layout_type: 'waterfall',
      market_listing_id: product.market_listing_id,
      listing_kind: product.listing_kind,
      position: product.layoutInfo && product.layoutInfo.columnIndex,
      page: this.data.currentPage
    })

    // 跳转商品详情使用 market_listing_id
    wx.navigateTo({
      url: `/packageTrade/trade/market/market?market_listing_id=${product.market_listing_id}&source=waterfall_market`
    })
  },

  /** 🔄 下拉刷新 */
  async onPullDownRefresh() {
    marketLog.info('执行下拉刷新')

    try {
      // 重置数据
      this.setData({
        products: [],
        currentPage: 1,
        hasMore: true,
        columnHeights: [0, 0]
      })

      // 重新加载数据
      await this.loadProducts(1)

      wx.stopPullDownRefresh()
      Wechat.showToast('刷新成功', 'success', 1500)
    } catch (error) {
      marketLog.error('?下拉刷新失败:', error)
      wx.stopPullDownRefresh()
      Wechat.showToast('刷新失败')
    }
  },

  /** ⬆️ 上拉加载更多 */
  async onReachBottom() {
    marketLog.info('⬆️ 触发上拉加载更多')

    if (!this.data.hasMore || this.data.loading) {
      marketLog.info('无更多数据或正在加载中')
      return
    }

    const nextPage = this.data.currentPage + 1
    await this.loadProducts(nextPage, true)
  },

  /** 👁?页面显示时处?*/
  onShow() {
    if (this.data.products.length === 0) {
      this.loadProducts(1)
    }
  },

  /** 🗑页面卸载清理 */
  onUnload() {
    marketLog.info('🗑瀑布流布局页面卸载，清理资源')

    // 🆕 销毁MobX Store绑定
    if (this.tradeBindings) {
      this.tradeBindings.destroyStoreBindings()
    }

    // 清理图片懒加载观察器
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }

    // 清理定时间
    if (this.preloadTimer) {
      clearTimeout(this.preloadTimer)
    }
  },

  /** 🚨 显示错误信息 */
  handleShowError(message: string) {
    wx.showModal({
      title: '提示',
      content: message,
      showCancel: false,
      confirmText: '确定'
    })
  },

  /** 📱 处理分享 */
  onShareAppMessage() {
    return {
      title: '发现好物市场 - 精选商品等你来',
      path: '/packageTrade/trade/market/market',
      imageUrl: '/images/default-product.png'
    }
  },

  /** 🔝 回到顶部 */
  scrollToTop() {
    wx.pageScrollTo({ scrollTop: 0, duration: 300 })
  },

  /** 📊 显示性能统计 */
  showStats() {
    this.setData({ showStatsModal: true })
  },

  /** 🙈 隐藏性能统计 */
  hideStats() {
    this.setData({ showStatsModal: false })
  }
})

export {}
