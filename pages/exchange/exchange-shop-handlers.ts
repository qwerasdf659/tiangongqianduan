/**
 * 商品兑换/双空间 Tab 处理方法 — 从 exchange.ts 拆分
 *
 * 包含：幸运空间（瀑布流）、臻选空间（混合布局）、竞价、空间筛选
 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * @file pages/exchange/exchange-shop-handlers.ts
 * @version 5.0.0
 * @since 2026-02-15
 */

const {
  API: shopAPI,
  Wechat: shopWechat,
  Constants: shopConstants,
  Logger: shopLogger,
  Waterfall: shopWaterfall,
  ProductFilter: shopProductFilter,
  Utils: shopUtils
} = require('../../utils/index')
const shopLog = shopLogger.createLogger('exchange-shop')
const { getExchangeProducts: shopGetExchangeProducts } = shopAPI
const { showToast: shopShowToast } = shopWechat
const { debounce: shopDebounce } = shopUtils
const { PAGINATION: SHOP_PAGINATION } = shopConstants

/**
 * 商品兑换/双空间 Tab 全部处理方法
 * 在 exchange.ts 中通过 ...shopHandlers 合并到 Page({})
 */
const shopHandlers = {
  // ============================================
  // 🔄 空间切换
  // ============================================

  /** 切换幸运空间/臻选空间 */
  async onSpaceChange(e: any) {
    const targetSpace = e.currentTarget.dataset.space
    shopLog.info(`🔄 切换空间: ${targetSpace}`)

    // 检查臻选空间解锁状态
    if (targetSpace === 'premium' && !this.data.premiumUnlockStatus.isUnlocked) {
      shopLog.info('🔒 臻选空间未解锁，尝试解锁...')
      this.handlePremiumUnlock()
      return
    }

    if (targetSpace === this.data.currentSpace) {
      shopLog.info('当前已在目标空间，无需切换')
      return
    }

    this.setData({ currentSpace: targetSpace })

    if (targetSpace === 'lucky') {
      await this.initLuckySpaceData()
    } else if (targetSpace === 'premium') {
      await this.initPremiumSpaceData()
    }

    shopLog.info(`✅ 已切换到空间: ${targetSpace}`)
  },

  // ============================================
  // 🍀 幸运空间（瀑布流布局）
  // ============================================

  /** 初始化幸运空间数据 */
  async initLuckySpaceData() {
    shopLog.info('🎁 初始化幸运空间数据（方案1瀑布流布局）...')

    try {
      this.setData({ loading: true })
      await this.initWaterfallLayout()

      const waterfallPageSize = this.data.waterfallPageSize || SHOP_PAGINATION.WATERFALL_SIZE
      // 参数顺序: getExchangeProducts(space, category, page, limit)
      const response = await shopGetExchangeProducts('lucky', null, 1, waterfallPageSize)
      shopLog.info('📦 API返回数据:', { space: 'lucky', page: 1, pageSize: waterfallPageSize })

      if (response && response.success && response.data) {
        const products = response.data.products || []
        shopLog.info(`✅ 获取到 ${products.length} 个商品`)

        if (products.length < 1) {
          shopLog.info('⚠️ API返回商品数量不足')
          this.setData({
            luckySpaceProducts: [],
            errorMessage: '暂无商品数据',
            errorDetail: '后端商品数据不足，请联系管理员添加商品',
            hasError: true
          })
          return
        }

        const waterfallProducts = this.convertToWaterfallData(products) || []
        shopLog.info(`🌊 转换为瀑布流数据: ${waterfallProducts.length} 个`)
        const layoutProducts = this.calculateWaterfallLayout(waterfallProducts) || []
        shopLog.info(`📐 计算布局完成: ${layoutProducts.length} 个`)

        this.setData({
          waterfallProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckyFilteredProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckySpaceStats: {
            new_count: products.length,
            avg_discount: this.calculateAvgDiscount(products),
            flash_deals: products.filter((p: any) => p.is_hot).length
          },
          containerHeight: Math.max(...this.data.columnHeights) || 500,
          loading: false,
          luckySearchKeyword: '',
          luckyCurrentFilter: 'all',
          luckyCategoryFilter: 'all',
          luckyPointsRange: 'all',
          luckyStockFilter: 'all',
          luckySortBy: 'default',
          showLuckyAdvancedFilter: false
        })

        shopLog.info('✅ 幸运空间数据初始化完成')
      } else {
        shopLog.info('❌ API返回失败')
        this.setErrorState('加载商品失败', '幸运空间接口调用失败，请稍后重试')
      }
    } catch (error) {
      shopLog.error('❌ 幸运空间初始化失败:', error)
      this.setErrorState('系统错误', '幸运空间初始化失败，请联系开发者')
    }
  },

  /** 初始化瀑布流布局配置 */
  async initWaterfallLayout() {
    shopLog.info('🔑 初始化瀑布流布局配置')

    try {
      let systemInfo: Record<string, any> = {}
      try {
        const deviceInfo = wx.getDeviceInfo()
        const windowInfo = wx.getWindowInfo()
        const appBaseInfo = wx.getAppBaseInfo()
        systemInfo = { ...deviceInfo, ...windowInfo, ...appBaseInfo }
      } catch (error) {
        shopLog.error('❌ 获取系统信息失败:', error)
        systemInfo = { windowWidth: 375, windowHeight: 667 }
      }

      const containerWidth = (systemInfo.windowWidth || 375) - 48
      this.setData({ containerWidth, columnHeights: [0, 0], cardGap: 15, cardPadding: 24 })
      shopLog.info('✅ 瀑布流布局配置完成:', {
        screenWidth: systemInfo.windowWidth,
        containerWidth,
        cardGap: this.data.cardGap
      })
    } catch (error) {
      shopLog.error('❌ 初始化瀑布流布局失败:', error)
      this.setData({ containerWidth: 327, columnHeights: [0, 0], cardGap: 15, cardPadding: 24 })
    }
  },

  /** 计算瀑布流布局（委托给 utils/waterfall.ts） */
  calculateWaterfallLayout(products: any) {
    const result = shopWaterfall.calculateWaterfallLayout(products, {
      containerWidth: this.data.containerWidth || 327,
      cardGap: this.data.cardGap || 15
    })
    this.setData({ columnHeights: result.columnHeights })
    return result.layoutProducts
  },

  /** 计算商品卡片内容高度（委托给 utils/waterfall.ts） */
  calculateContentHeight(product: any) {
    return shopWaterfall.calculateContentHeight(product)
  },

  // ============================================
  // 💎 臻选空间（混合布局）
  // ============================================

  /** 初始化臻选空间数据 */
  async initPremiumSpaceData() {
    shopLog.info('💎 初始化臻选空间数据...')

    try {
      this.setData({ loading: true })
      // 参数顺序: getExchangeProducts(space, category, page, limit)
      const response = await shopGetExchangeProducts('premium', null, 1, 30)

      if (response && response.success && response.data) {
        const products = response.data.products || []

        const carouselItems = products.slice(0, 5).map((item: any, index: number) => ({
          id: item.id,
          title: item.name,
          subtitle: item.description,
          image: item.image,
          price: item.exchange_points,
          // 🔴 original_price、discount、rating 由后端返回，前端不自行计算
          originalPrice: item.original_price || null,
          discount: item.discount || 0,
          rating: item.rating || 0,
          background: this.getCarouselBackground(index),
          tags: item.tags || []
        }))

        const cardSections = this.createCardSections(products.slice(5, 20))
        const listProducts = products.slice(20).map((item: any) => ({
          ...item,
          showDescription: true,
          showSeller: !!item.seller
          // 🚨 seller、hasWarranty、freeShipping、estimatedDelivery、returnPolicy
          // 应由后端在商品详情中返回，前端不应硬编码
          // 📋 TODO: 后端在 products 数组每项中返回 seller 对象和服务标签
        }))

        this.setData({
          carouselItems,
          cardSections,
          listProducts,
          premiumSpaceStats: {
            hot_count: products.filter((p: any) => p.is_hot).length,
            // 🚨 avg_rating、trending_count 应由后端统计接口返回
            avg_rating: response.data.avg_rating || 0,
            trending_count: response.data.trending_count || products.length
          },
          loading: false
        })

        shopLog.info('✅ 臻选空间数据初始化完成')
      } else {
        shopLog.info('❌ API返回失败')
        this.setErrorState('加载失败', '臻选空间接口调用失败，请稍后重试')
      }
    } catch (error) {
      shopLog.error('❌ 臻选空间初始化失败:', error)
      this.setErrorState('系统错误', '臻选空间初始化失败，请联系开发者')
    }
  },

  /** 检查臻选空间解锁状态（后端API待实现） */
  async checkPremiumUnlockStatus() {
    // 🔴 后端尚未实现臻选空间解锁状态API
    // 📋 待后端实现: GET /api/v4/backpack/exchange/premium-status
    shopLog.info('🔍 臻选空间解锁状态检查（后端API待实现，当前保持默认状态）')
  },

  /** 处理臻选空间解锁（后端API待实现） */
  async handlePremiumUnlock() {
    // 🔴 后端尚未实现臻选空间解锁API
    // 📋 待后端实现: POST /api/v4/backpack/exchange/unlock-premium
    shopLog.info('🔍 臻选空间解锁功能（后端API待实现）')
    wx.showModal({
      title: '功能开发中',
      content: '臻选空间解锁功能正在开发中，敬请期待！',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /** 解锁臻选空间（后端API待实现） */
  async unlockPremiumSpace() {
    // 🚨 V4.0后端API暂未提供unlockPremiumSpace接口
    wx.showModal({
      title: '⚠️ 功能开发中',
      content: '臻选空间解锁功能正在开发中，敬请期待！',
      showCancel: false,
      confirmText: '我知道了'
    })
    shopLog.warn('⚠️ V4.0后端API暂未实现unlockPremiumSpace功能')
  },

  /** 初始化布局参数 */
  initLayoutParams() {
    try {
      const res = wx.getWindowInfo()
      const containerWidth = res.windowWidth - 40
      const columnWidth = Math.floor((containerWidth - 20) / 2)
      this.setData({ containerWidth, columnWidth })
      shopLog.info('✅ 布局参数初始化完成:', {
        windowWidth: res.windowWidth,
        containerWidth,
        columnWidth
      })
    } catch (err) {
      shopLog.error('❌ 获取窗口信息失败:', err)
      this.setData({ containerWidth: 335, columnWidth: 157 })
    }
  },

  /** 轮播图变化事件 */
  onCarouselChange(e: any) {
    this.setData({ carouselActiveIndex: e.detail.current })
  },

  // ============================================
  // 🎯 竞价功能
  // ============================================

  /** 竞价按钮点击 */
  onBidTap(e: any) {
    const product = e.currentTarget.dataset.product
    shopLog.info('🏷️ 点击竞价:', product)
    this.setData({
      selectedBidProduct: product,
      showBidModal: true,
      userBidAmount: product.current_price + product.min_bid_increment
    })
  },

  /** 竞价金额输入 */
  onBidAmountInput(e: any) {
    this.setData({ userBidAmount: parseFloat(e.detail.value) || 0 })
  },

  /**
   * 快捷加价按钮
   * 在当前出价基础上增加固定金额，提升竞价操作效率
   */
  onQuickBidAdd(e: any) {
    const addAmount = Number(e.currentTarget.dataset.amount) || 0
    const { selectedBidProduct, userBidAmount } = this.data
    if (!selectedBidProduct) {
      return
    }

    const baseAmount =
      userBidAmount > 0
        ? userBidAmount
        : selectedBidProduct.current_price + selectedBidProduct.min_bid_increment

    this.setData({ userBidAmount: baseAmount + addAmount })
  },

  /** 确认竞价（后端API待实现） */
  async onConfirmBid() {
    const { selectedBidProduct, userBidAmount } = this.data

    if (userBidAmount < selectedBidProduct.current_price + selectedBidProduct.min_bid_increment) {
      shopShowToast({ title: '出价金额不足', icon: 'none' })
      return
    }
    if (userBidAmount > this.data.totalPoints) {
      shopShowToast({ title: '积分余额不足', icon: 'none' })
      return
    }

    try {
      // 🔴 竞价功能暂未开放，等待后端API
      shopShowToast({ title: '竞价功能暂未开放', icon: 'none', duration: 2000 })
      this.setData({ showBidModal: false, selectedBidProduct: null, userBidAmount: 0 })
      shopLog.warn('⚠️ 竞价功能暂未实现，等待后端API开发')
      this.refreshMarketData()
    } catch (_error) {
      shopLog.error('❌ 竞价失败:', _error)
    }
  },

  /** 取消竞价 */
  onCancelBid() {
    this.setData({ showBidModal: false, selectedBidProduct: null, userBidAmount: 0 })
  },

  /** 刷新市场数据（根据当前空间类型） */
  async refreshMarketData() {
    if (this.data.currentSpace === 'lucky') {
      await this.initLuckySpaceData()
    } else if (this.data.currentSpace === 'premium') {
      await this.initPremiumSpaceData()
    }
  },

  // ============================================
  // 🛠️ 数据转换和工具方法
  // ============================================

  /** 转换商品数据为瀑布流格式（仅使用后端真实数据） */
  convertToWaterfallData(products: any) {
    if (!products || !Array.isArray(products)) {
      shopLog.warn('⚠️ convertToWaterfallData: 传入的products无效，返回空数组')
      return []
    }
    try {
      return products
        .map((item: any, index: number) => {
          if (!item || typeof item !== 'object') {
            shopLog.warn(`⚠️ convertToWaterfallData: 第${index}个商品数据无效:`, item)
            return null
          }
          if (!item.name || !item.id) {
            shopLog.warn(`⚠️ 商品数据不完整，缺少必要字段，跳过索引 ${index}: `, item)
            return null
          }
          // 从后端API读取snake_case字段 → 转换为前端展示层camelCase
          return {
            id: item.id,
            name: item.name,
            image: item.image_url || item.image || '/images/products/default-product.png',
            price: item.exchange_points || 0,
            originalPrice: item.original_price || null,
            discount: item.discount || 0,
            rating: item.rating || null,
            sales: item.sales || 0,
            tags: item.tags || [],
            isLucky: item.is_lucky || false,
            isHot: item.is_hot || false,
            isNew: item.is_new || false,
            seller: item.seller || null,
            imageRatio: item.image_ratio || 1.0,
            createdAt: item.created_at || '',
            description: item.description || '',
            stock: item.stock || 0,
            category: item.category || ''
          }
        })
        .filter(Boolean)
    } catch (error) {
      shopLog.error('❌ convertToWaterfallData 转换失败:', error)
      return []
    }
  },

  /**
   * 计算平均折扣
   * 🔴 折扣数据应由后端在商品列表接口中统计返回
   * 📋 待后端实现: GET /api/v4/backpack/exchange/items 响应中增加 avg_discount 字段
   */
  calculateAvgDiscount(products: any) {
    if (!products || products.length === 0) {
      return 0
    }
    // 使用后端返回的discount字段计算，不使用前端硬编码倍率
    const validProducts = products.filter((p: any) => p.discount && p.discount > 0)
    if (validProducts.length === 0) {
      return 0
    }
    const totalDiscount = validProducts.reduce(
      (sum: number, product: any) => sum + (product.discount || 0),
      0
    )
    return Math.floor(totalDiscount / validProducts.length)
  },

  /**
   * 创建卡片分组（使用后端返回的真实数据，不使用Math.random模拟数据）
   * 分组依据后端返回的 is_hot / is_new / category 等字段
   */
  createCardSections(products: any[]) {
    // UI常量: 分组展示配置（视觉呈现，前端可自主决定）
    const sections = [
      {
        id: 'hot',
        title: '🔥 热销爆款',
        subtitle: '限时特惠，抢完即止',
        icon: '🔥',
        backgroundColor: 'linear-gradient(135deg, #ff6b35, #f7931e)',
        titleColor: '#fff',
        products: products.slice(0, 5)
      },
      {
        id: 'new',
        title: '✨ 新品首发',
        subtitle: '新鲜上架，抢先体验',
        icon: '✨',
        backgroundColor: 'linear-gradient(135deg, #667eea, #764ba2)',
        titleColor: '#fff',
        products: products.slice(5, 10)
      },
      {
        id: 'premium',
        title: '💎 品质臻选',
        subtitle: '精心挑选，品质保证',
        icon: '💎',
        backgroundColor: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
        titleColor: '#fff',
        products: products.slice(10, 15)
      }
    ]
    // 直接使用后端返回的字段，不用Math.random()生成假数据
    return sections.map(section => ({
      ...section,
      products: section.products.map((product: any) => ({
        ...product,
        discount: product.discount || 0,
        isHot: product.is_hot || false,
        isNew: product.is_new || false,
        sellPoint: product.sell_point || ''
      }))
    }))
  },

  /** 获取轮播背景色 */
  getCarouselBackground(index: number) {
    const backgrounds = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)'
    ]
    return backgrounds[index % backgrounds.length]
  },

  // ============================================
  // 🔍 幸运空间搜索和筛选
  // ============================================

  /** 幸运空间搜索输入处理（500ms防抖） */
  onLuckySearchInput: shopDebounce(function (e: any) {
    const keyword = e.detail.value.trim()
    shopLog.info('🔍 幸运空间搜索关键词:', keyword)
    this.setData({ luckySearchKeyword: keyword })
    this.applyLuckyFilters()
  }, 500),

  /** 幸运空间筛选条件变更 */
  onLuckyFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    shopLog.info('🔍 幸运空间切换筛选:', filter)
    this.setData({ luckyCurrentFilter: filter })
    this.applyLuckyFilters()
  },

  /** 切换幸运空间高级筛选面板 */
  onToggleLuckyAdvancedFilter() {
    const { showLuckyAdvancedFilter } = this.data
    shopLog.info('🔍 切换幸运空间高级筛选:', !showLuckyAdvancedFilter)
    this.setData({ showLuckyAdvancedFilter: !showLuckyAdvancedFilter })
  },

  /** 幸运空间分类筛选变更 */
  onLuckyCategoryFilterChange(e: any) {
    const category = e.currentTarget.dataset.category
    shopLog.info('🔍 幸运空间切换分类筛选:', category)
    this.setData({ luckyCategoryFilter: category })
    this.applyLuckyFilters()
  },

  /** 幸运空间积分范围筛选变更 */
  onLuckyPointsRangeChange(e: any) {
    const range = e.currentTarget.dataset.range
    shopLog.info('🔍 幸运空间切换积分范围:', range)
    this.setData({ luckyPointsRange: range })
    this.applyLuckyFilters()
  },

  /** 幸运空间排序方式变更 */
  onLuckySortByChange(e: any) {
    const sort = e.currentTarget.dataset.sort
    shopLog.info('🔍 幸运空间切换排序:', sort)
    this.setData({ luckySortBy: sort })
    this.applyLuckyFilters()
  },

  /** 幸运空间库存状态筛选 */
  onLuckyStockFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    shopLog.info(`🔍 幸运空间库存状态筛选: ${filter}`)
    this.setData({ luckyStockFilter: filter })
    this.applyLuckyFilters()
  },

  /** 重置幸运空间所有筛选条件 */
  onResetLuckyFilters() {
    shopLog.info('🔄 重置幸运空间所有筛选条件')
    this.setData({
      luckySearchKeyword: '',
      luckyCurrentFilter: 'all',
      luckyCategoryFilter: 'all',
      luckyPointsRange: 'all',
      luckyStockFilter: 'all',
      luckySortBy: 'default',
      showLuckyAdvancedFilter: false
    })
    this.applyLuckyFilters()
    shopShowToast({ title: '✅ 筛选已重置', icon: 'success' })
  },

  /** 应用幸运空间筛选条件（委托给 utils/product-filter.ts + utils/waterfall.ts） */
  applyLuckyFilters() {
    const {
      waterfallProducts,
      luckySearchKeyword,
      luckyCurrentFilter,
      luckyCategoryFilter,
      luckyPointsRange,
      luckyStockFilter,
      luckySortBy,
      totalPoints
    } = this.data

    const filterResult = shopProductFilter.applyProductFilters(waterfallProducts, {
      searchKeyword: luckySearchKeyword,
      currentFilter: luckyCurrentFilter,
      categoryFilter: luckyCategoryFilter,
      pointsRange: luckyPointsRange,
      stockFilter: luckyStockFilter,
      sortBy: luckySortBy,
      totalPoints,
      priceField: 'price'
    })

    const layoutProducts = this.calculateWaterfallLayout(filterResult.filtered)
    this.setData({
      luckyFilteredProducts: layoutProducts,
      containerHeight: Math.max(...this.data.columnHeights) || 500
    })
  }
}

module.exports = shopHandlers

export {}
