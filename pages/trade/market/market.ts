// pages/trade/market/market.ts - V4.0交易市场页面 + MobX响应式状态
// 🔴 统一工具函数导入
const { API } = require('../../../utils/index')
const { APIClient, getMarketProducts } = API
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { tradeStore } = require('../../../store/trade')

/**
 * 🌊 V4.0瀑布流卡片布局页面
 * 🎯 完全符合V4.0统一引擎架构
 * 核心特性：双列瀑布流、图片优先展示、智能懒加载、无限滚动
 */
Page({
  data: {
    // 🎨 瀑布流布局数据
    products: [],
    loading: false,
    hasMore: true,
    currentPage: 1,
    pageSize: 20,

    // 🌊 瀑布流布局配置
    containerWidth: 0,
    containerHeight: 0,
    // 双列高度记录
    columnHeights: [0, 0],
    // 卡片间距
    cardGap: 15,
    // 容器内边距
    cardPadding: 20,

    // 🖼️ 图片懒加载配置
    // 懒加载阈值
    lazyLoadThreshold: 100,
    // 预加载数量
    preloadCount: 10,
    // 图片加载状态映射
    imageLoadedMap: {},

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

  /**
   * 📍 页面生命周期 - 加载
   */
  async onLoad(_options) {
    console.log('🌊 瀑布流卡片布局页面加载开始')

    // 🆕 MobX Store绑定 - 交易市场状态自动同步
    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: ['marketListings', 'marketLoading'],
      actions: ['setMarketListings', 'appendMarketListings', 'setMarketLoading']
    })

    try {
      // 初始化API客户端
      this.apiClient = new APIClient()

      // 获取系统信息和容器尺寸
      await this.initializeLayout()

      // 设置图片懒加载
      this.setupLazyLoading()

      // 加载初始商品数据
      await this.loadProducts(1)

      console.log('✅ 瀑布流布局初始化完成')
    } catch (error) {
      console.error('❌ 瀑布流布局初始化失败:', error)
      this.showError('页面加载失败，请重试')
    }
  },

  /**
   * 🔧 初始化瀑布流布局
   */
  async initializeLayout() {
    console.log('🔧 初始化瀑布流布局配置')

    // 🔧 获取系统信息 - 使用新的API替代过时的wx.getSystemInfoSync
    let systemInfo = {}
    try {
      const deviceInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : {}
      const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : {}
      const appBaseInfo = wx.getAppBaseInfo ? wx.getAppBaseInfo() : {}

      systemInfo = {
        ...deviceInfo,
        ...windowInfo,
        ...appBaseInfo
      }
    } catch (error) {
      console.warn('⚠️ 获取系统信息失败，使用降级方案:', error)
      try {
        systemInfo = wx.getSystemInfoSync()
      } catch (fallbackError) {
        console.error('❌ 系统信息获取完全失败:', fallbackError)
        systemInfo = {}
      }
    }
    const containerWidth = systemInfo.windowWidth - this.data.cardPadding * 2

    this.setData({
      containerWidth,
      // 重置列高度
      columnHeights: [0, 0]
    })

    console.log('📐 布局配置完成:', {
      screenWidth: systemInfo.windowWidth,
      containerWidth,
      cardGap: this.data.cardGap
    })
  },

  /**
   * 🖼️ 设置图片懒加载观察器
   */
  setupLazyLoading() {
    console.log('🖼️ 设置图片懒加载观察器')

    this.intersectionObserver = wx.createIntersectionObserver(this, {
      rootMargin: `${this.data.lazyLoadThreshold}px`
    })

    this.intersectionObserver.relativeToViewport().observe('.product-image', res => {
      if (res.intersectionRatio > 0) {
        const productId = res.dataset.productId
        if (productId && !this.data.imageLoadedMap[productId]) {
          this.loadProductImage(productId)
        }
      }
    })
  },

  /**
   * ✅ 加载商品数据 - V4.2直接调用API方法
   */
  async loadProducts(page = 1, append = false) {
    if (this.data.loading) {
      console.log('⚠️ 正在加载中，跳过重复请求')
      return
    }

    console.log(`📦 开始加载商品数据 - 第${page}页`)

    this.setData({ loading: true })

    // ✅ V4.2: 直接调用API方法
    const result = await getMarketProducts(page, this.data.pageSize, 'all', 'default')
    const { success, data } = result

    if (success && data && data.products) {
      const newProducts = data.products
      console.log('✅ 使用真实API数据')

      const allProducts = append ? [...this.data.products, ...newProducts] : newProducts

      // 🌊 计算瀑布流布局
      const startTime = Date.now()
      const layoutProducts = this.calculateWaterfallLayout(allProducts)
      const layoutTime = Date.now() - startTime

      // 📊 更新性能统计
      this.updatePerformanceStats(layoutTime, layoutProducts.length)

      this.setData({
        products: layoutProducts,
        currentPage: page,
        hasMore: newProducts.length === this.data.pageSize,
        containerHeight: Math.max(...this.data.columnHeights),
        loading: false
      })

      console.log(`✅ 商品数据加载完成 - 共${layoutProducts.length}个商品`)
    } else {
      this.setData({ loading: false })
    }
  },

  /**
   * 🌊 计算瀑布流布局算法 - 核心功能
   */
  calculateWaterfallLayout(products) {
    console.log('🌊 开始计算瀑布流布局')

    // 重置列高度（当不是追加数据时）
    const columnHeights = [0, 0]
    const columnWidth = (this.data.containerWidth - this.data.cardGap) / 2

    const layoutProducts = products.map((product, _index) => {
      // 选择较短的列
      const shortestCol = columnHeights[0] <= columnHeights[1] ? 0 : 1

      // 计算商品卡片高度
      // 图片固定高度
      const imageHeight = 200
      const contentHeight = this.calculateContentHeight(product)
      // 包含内边距
      const cardHeight = imageHeight + contentHeight + 40

      // 设置商品布局信息
      const layoutProduct = {
        ...product,
        layoutInfo: {
          columnIndex: shortestCol,
          left: shortestCol * (columnWidth + this.data.cardGap),
          top: columnHeights[shortestCol],
          width: columnWidth,
          height: cardHeight,
          zIndex: 1
        }
      }

      // 更新列高度
      // 卡片间距
      columnHeights[shortestCol] += cardHeight + 20

      return layoutProduct
    })

    // 保存列高度状态
    this.setData({ columnHeights })

    console.log('✅ 瀑布流布局计算完成:', {
      totalProducts: layoutProducts.length,
      leftColumnHeight: columnHeights[0],
      rightColumnHeight: columnHeights[1],
      containerHeight: Math.max(...columnHeights)
    })

    return layoutProducts
  },

  /**
   * 📏 计算内容区域高度
   */
  calculateContentHeight(product) {
    // 基础内容高度：标题 + 价格 + 内边距
    let baseHeight = 80

    // 根据标题长度调整高度
    const titleLength = product.name ? product.name.length : 0
    if (titleLength > 20) {
      // 长标题增加一行高度
      baseHeight += 20
    }

    // 根据价格信息调整高度
    if (product.originalPrice && product.originalPrice !== product.currentPrice) {
      // 有原价的话增加高度
      baseHeight += 15
    }

    return baseHeight
  },

  /**
   * 🖼️ 加载单个商品图片
   */
  loadProductImage(productId) {
    console.log(`🖼️ 开始加载商品图片: ${productId}`)

    const imageLoadedMap = { ...this.data.imageLoadedMap }
    imageLoadedMap[productId] = true

    this.setData({ imageLoadedMap })
  },

  /**
   * 📊 更新性能统计数据
   */
  updatePerformanceStats(layoutTime, productCount) {
    const performanceStats = {
      ...this.data.performanceStats,
      layoutCalculationTime: layoutTime,
      totalProducts: productCount,
      renderTime: Date.now()
    }

    this.setData({ performanceStats })

    console.log('📊 性能统计更新:', performanceStats)
  },

  /**
   * 🎯 商品点击事件处理
   */
  onProductClick(e) {
    const product = e.currentTarget.dataset.product

    console.log('🎯 商品点击:', product.name)

    // 埋点统计
    wx.reportAnalytics('product_click', {
      layout_type: 'waterfall',
      product_id: product.productId,
      position: product.layoutInfo && product.layoutInfo.columnIndex,
      page: this.data.currentPage
    })

    // 跳转商品详情页
    wx.navigateTo({
      url: `/pages/product/detail?id=${product.productId}&source=waterfall_market`
    })
  },

  /**
   * 🔄 下拉刷新
   */
  async onPullDownRefresh() {
    console.log('🔄 执行下拉刷新')

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

      wx.showToast({
        title: '刷新成功',
        icon: 'success',
        duration: 1500
      })
    } catch (error) {
      console.error('❌ 下拉刷新失败:', error)
      wx.stopPullDownRefresh()
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      })
    }
  },

  /**
   * ⬆️ 上拉加载更多
   */
  async onReachBottom() {
    console.log('⬆️ 触发上拉加载更多')

    if (!this.data.hasMore || this.data.loading) {
      console.log('⚠️ 无更多数据或正在加载中')
      return
    }

    const nextPage = this.data.currentPage + 1
    await this.loadProducts(nextPage, true)
  },

  /**
   * 👁️ 页面显示时处理
   */
  onShow() {
    // 检查是否有新数据需要更新
    if (this.data.products.length === 0) {
      this.loadProducts(1)
    }
  },

  /**
   * 🗑️ 页面卸载清理
   */
  onUnload() {
    console.log('🗑️ 瀑布流布局页面卸载，清理资源')

    // 🆕 销毁MobX Store绑定
    if (this.tradeBindings) {
      this.tradeBindings.destroyStoreBindings()
    }

    // 清理图片懒加载观察器
    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
    }

    // 清理定时器（如果有的话）
    if (this.preloadTimer) {
      clearTimeout(this.preloadTimer)
    }
  },

  /**
   * 🚨 显示错误信息
   */
  showError(message) {
    wx.showModal({
      title: '提示',
      content: message,
      showCancel: false,
      confirmText: '确定'
    })
  },

  /**
   * 📱 处理分享
   */
  onShareAppMessage() {
    return {
      title: '发现好物市场 - 精选商品等你来',
      path: '/pages/trade/market/market',
      imageUrl: '/images/default-product.png'
    }
  },

  /**
   * 🔝 回到顶部
   */
  scrollToTop() {
    wx.pageScrollTo({
      scrollTop: 0,
      duration: 300
    })
  },

  /**
   * 📊 显示性能统计
   */
  showStats() {
    this.setData({ showStatsModal: true })
  },

  /**
   * 🙈 隐藏性能统计
   */
  hideStats() {
    this.setData({ showStatsModal: false })
  }
})
