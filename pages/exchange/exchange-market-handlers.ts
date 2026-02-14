/**
 * 交易市场 Tab 处理方法 — 从 exchange.ts 拆分
 *
 * 包含：商品加载、搜索筛选、分页、兑换弹窗、图片处理
 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * @file pages/exchange/exchange-market-handlers.ts
 * @version 5.0.0
 * @since 2026-02-15
 */

const { API, Wechat, Constants, Logger, ProductFilter, Utils } = require('../../utils/index')
const marketLog = Logger.createLogger('exchange-market')
const { getExchangeProducts, exchangeProduct } = API
const { showToast } = Wechat
const { debounce } = Utils
const { PAGINATION, DELAY } = Constants

// MobX Store 引用（用于 loadProducts 中的 Token 恢复和兑换后积分刷新）
const { userStore: marketUserStore } = require('../../store/user')
const { pointsStore: marketPointsStore } = require('../../store/points')

/**
 * 交易市场 Tab 全部处理方法
 * 在 exchange.ts 中通过 ...marketHandlers 合并到 Page({})
 */
const marketHandlers = {
  // ============================================
  // 📦 商品数据加载
  // ============================================

  /** 初始化筛选条件（重置所有筛选为默认值） */
  initFilters() {
    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1
    })
  },

  /** 从后端API加载交易市场商品列表 */
  async loadProducts() {
    marketLog.info('🔧 开始加载商品列表...')

    // 在商品兑换模式下不加载交易市场列表
    if (this.data.currentTab === 'market') {
      marketLog.info('🏪 当前在商品兑换模式，跳过交易市场列表加载')
      return
    }

    const requestStartTime = Date.now()
    this.setData({ loading: true })

    const appInstance = getApp()
    if (!appInstance || !appInstance.globalData) {
      marketLog.error('❌ App未初始化')
      this.setData({ loading: false })
      showToast({ title: '应用初始化异常，请重启小程序', icon: 'none', duration: DELAY.RETRY })
      return
    }

    // 获取Token（从 MobX Store 读取）
    let token = marketUserStore.accessToken
    if (!token) {
      token = wx.getStorageSync('access_token')
      if (token) {
        marketUserStore.updateAccessToken(token)
        marketLog.info('🔑 从本地存储恢复Token到Store')
      }
    }

    if (!token) {
      marketLog.info('🔐 用户未登录，需要先登录')
      this.setData({ loading: false })
      wx.showModal({
        title: '未登录',
        content: '请先登录后再查看商品',
        showCancel: false,
        confirmText: '立即登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
      return
    }

    marketLog.info('🎫 Token已准备，开始请求商品数据')

    try {
      const space = this.data.currentSpace || 'lucky'
      const page = this.data.currentPage || 1
      const pageSize =
        this.data.currentTab === 'market' && space === 'lucky'
          ? this.data.waterfallPageSize || PAGINATION.WATERFALL_SIZE
          : this.data.pageSize || PAGINATION.DEFAULT_PAGE_SIZE

      marketLog.info(`📦 请求参数: space=${space}, page=${page}, pageSize=${pageSize}`)

      // 参数顺序: getExchangeProducts(space, category, page, limit)
      const response = await getExchangeProducts(space, null, page, pageSize)
      const requestDuration = Date.now() - requestStartTime

      marketLog.info('✅ 商品加载成功!')
      marketLog.info('⏱️ 请求耗时:', requestDuration + 'ms')
      marketLog.info('📊 返回数据:', response)

      if (response && response.success && response.data) {
        const products = response.data.products || []

        // 使用后端API返回的snake_case字段，后端是数据权威来源
        const processedProducts = products.map((product: any) => ({
          id: product.id,
          name: product.name,
          description: product.description || '',
          image: product.image_url || product.image || '/images/default-product.png',
          exchange_points: product.exchange_points || 0,
          stock: product.stock || 0,
          category: product.category || '',
          rating: product.rating || null,
          sales: product.sales || 0,
          is_hot: product.is_hot || false,
          created_at: product.created_at || '',
          imageStatus: 'loading'
        }))

        this.setData({
          loading: false,
          products: processedProducts,
          filteredProducts: processedProducts,
          totalCount: response.data.total || processedProducts.length
        })

        this.calculateTotalPages()
        this.loadCurrentPageProducts()

        marketLog.info(`✅ 成功加载 ${processedProducts.length} 个商品`)
        showToast({
          title: `加载 ${processedProducts.length} 个商品`,
          icon: 'success',
          duration: DELAY.TOAST_SHORT
        })
      } else {
        throw new Error((response && response.msg) || '商品数据加载失败')
      }
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime
      marketLog.error('❌ 商品加载失败:', error)
      marketLog.info('⏱️ 失败请求耗时:', requestDuration + 'ms')
      this.setData({ loading: false })

      if (error.statusCode === 401) {
        this.clearTokenAndRedirectLogin()
      }
    }
  },

  /** 检查并刷新商品数据（距上次加载超60秒自动刷新） */
  checkAndRefreshProducts() {
    const lastLoadTime: number = (this as any)._lastProductLoadTime || 0
    const now: number = Date.now()
    if (now - lastLoadTime > 60000) {
      marketLog.info('🔄 商品数据已过期，自动刷新')
      this.loadProducts()
    }
  },

  // ============================================
  // 🔍 搜索和筛选
  // ============================================

  /** 搜索输入处理（500ms防抖） */
  onSearchInput: debounce(function (e: any) {
    const keyword = e.detail.value.trim()
    marketLog.info('🔍 搜索关键词:', keyword)
    this.setData({ searchKeyword: keyword, currentPage: 1 })
    this.applyFilters()
  }, 500),

  /** 筛选条件变更（全部/可兑换/低积分） */
  onFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    marketLog.info('🔍 切换筛选:', filter)
    this.setData({ currentFilter: filter, currentPage: 1 })
    this.applyFilters()
  },

  /** 切换高级筛选面板 */
  onToggleAdvancedFilter() {
    const { showAdvancedFilter } = this.data
    marketLog.info('🔍 切换高级筛选:', !showAdvancedFilter)
    this.setData({ showAdvancedFilter: !showAdvancedFilter })
  },

  /** 商品分类筛选变更 */
  onCategoryFilterChange(e: any) {
    const category = e.currentTarget.dataset.category
    marketLog.info('🔍 切换分类筛选:', category)
    this.setData({ categoryFilter: category, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 积分范围筛选变更 */
  onPointsRangeChange(e: any) {
    const range = e.currentTarget.dataset.range
    marketLog.info('🔍 切换积分范围:', range)
    this.setData({ pointsRange: range, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 库存状态筛选变更 */
  onStockFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    marketLog.info('🔍 切换库存筛选:', filter)
    this.setData({ stockFilter: filter, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 排序方式变更 */
  onSortByChange(e: any) {
    const sort = e.currentTarget.dataset.sort
    marketLog.info('🔍 切换排序:', sort)
    this.setData({ sortBy: sort, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 重置所有筛选条件 */
  onResetFilters() {
    marketLog.info('🔄 重置所有筛选条件')
    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1,
      showAdvancedFilter: false
    })
    this.applyFilters()
    showToast({ title: '✅ 筛选已重置', icon: 'success' })
  },

  /** 应用高级筛选条件（委托给 utils/product-filter.ts） */
  applyAdvancedFilters() {
    const {
      products,
      searchKeyword,
      currentFilter,
      categoryFilter,
      pointsRange,
      stockFilter,
      sortBy,
      totalPoints
    } = this.data
    const result = ProductFilter.applyProductFilters(products, {
      searchKeyword,
      currentFilter,
      categoryFilter,
      pointsRange,
      stockFilter,
      sortBy,
      totalPoints,
      priceField: 'exchange_points'
    })
    this.setData({ filteredProducts: result.filtered })
  },

  /** 应用基础筛选条件（委托给 utils/product-filter.ts） */
  applyFilters() {
    const { products, searchKeyword, currentFilter, totalPoints } = this.data
    const result = ProductFilter.applyProductFilters(products, {
      searchKeyword,
      currentFilter,
      totalPoints,
      priceField: 'exchange_points'
    })
    this.setData({ filteredProducts: result.filtered })
  },

  // ============================================
  // 🔄 刷新和排序
  // ============================================

  /** 手动刷新商品列表 */
  async onRefreshProducts() {
    marketLog.info('🔧 手动刷新商品列表')

    if (this.data.currentTab === 'market') {
      marketLog.info('🏪 商品兑换模式，刷新幸运空间数据')
      try {
        await this.initLuckySpaceData()
        showToast({ title: '✅ 刷新成功', icon: 'success' })
      } catch (error) {
        marketLog.error('❌ 刷新失败:', error)
      }
      return
    }

    try {
      await this.loadProducts()
      showToast({ title: '✅ 刷新成功', icon: 'success' })
    } catch (error) {
      marketLog.error('❌ 刷新失败:', error)
      showToast({ title: '刷新失败，请重试', icon: 'none' })
    }
  },

  /** 按积分升序排序 */
  onSortByPoints() {
    marketLog.info('🔍 按积分排序')
    const { filteredProducts } = this.data
    const sorted = [...filteredProducts].sort(
      (a: any, b: any) => a.exchange_points - b.exchange_points
    )
    this.setData({ filteredProducts: sorted, sortBy: 'points-asc' })
    showToast({ title: '已按积分升序排列', icon: 'success' })
  },

  // ============================================
  // 🖼️ 图片处理
  // ============================================

  /** 图片加载错误处理 */
  onImageError(e: any) {
    const { index } = e.currentTarget.dataset
    marketLog.info(`⚠️ 图片加载失败 [${index}]`)
    this.setData({
      [`filteredProducts[${index}].imageStatus`]: 'error',
      [`filteredProducts[${index}].image`]: '/images/default-product.png'
    })
  },

  /** 图片加载成功处理 */
  onImageLoad(e: any) {
    const { index } = e.currentTarget.dataset
    marketLog.info(`✅ 图片加载成功 [${index}]`)
    this.setData({ [`filteredProducts[${index}].imageStatus`]: 'loaded' })
  },

  /** 预览商品图片 */
  onPreviewImage(e: any) {
    const { url } = e.currentTarget.dataset
    marketLog.info('🖼️ 预览图片:', url)
    if (url && url !== '/images/default-product.png') {
      wx.previewImage({
        current: url,
        urls: [url],
        success: () => marketLog.info('✅ 图片预览成功'),
        fail: (error: any) => {
          marketLog.error('❌ 图片预览失败:', error)
          showToast({ title: '图片预览失败', icon: 'none' })
        }
      })
    }
  },

  // ============================================
  // 🎁 兑换弹窗
  // ============================================

  /** 取消兑换操作 */
  onCancelExchange() {
    marketLog.info('❌ 取消兑换操作')
    this.setData({ showConfirm: false, selectedProduct: null })
    marketLog.info('✅ 兑换确认弹窗已关闭')
  },

  /** 确认兑换操作 */
  async onConfirmExchange() {
    const { selectedProduct, totalPoints } = this.data

    if (!selectedProduct) {
      marketLog.error('❌ 未选择商品')
      showToast({ title: '请选择要兑换的商品', icon: 'none' })
      return
    }
    if (totalPoints < selectedProduct.exchange_points) {
      marketLog.error('❌ 积分不足')
      showToast({ title: '积分余额不足', icon: 'none' })
      return
    }
    if (selectedProduct.stock <= 0) {
      marketLog.error('❌ 商品缺货')
      showToast({ title: '商品库存不足', icon: 'none' })
      return
    }
    if (this.data.exchanging) {
      marketLog.info('⏳ 正在兑换中，请勿重复操作')
      return
    }

    this.setData({ exchanging: true })

    try {
      const response = await exchangeProduct(selectedProduct.id, 1)

      if (response && response.success && response.data) {
        marketLog.info('✅ 兑换成功:', response.data)

        // 从后端获取兑换后的真实积分余额
        const { getPointsBalance } = API
        let latestPoints = totalPoints
        try {
          const balanceResult = await getPointsBalance()
          if (balanceResult && balanceResult.success && balanceResult.data) {
            latestPoints = balanceResult.data.available_amount || 0
          }
        } catch (balanceError) {
          marketLog.warn('⚠️ 兑换后刷新积分失败，使用本地估算值:', balanceError)
          latestPoints = totalPoints - selectedProduct.exchange_points
        }

        this.setData({
          showConfirm: false,
          selectedProduct: null,
          exchanging: false,
          showResult: true,
          totalPoints: latestPoints,
          resultData: {
            product: selectedProduct,
            orderId: response.data.order_id || response.data.orderId,
            pointsDeducted: selectedProduct.exchange_points,
            remainingPoints: latestPoints
          }
        })

        marketPointsStore.setBalance(latestPoints, marketPointsStore.frozenAmount)
        marketLog.info('🎉 兑换流程完成')

        setTimeout(() => {
          this.loadProducts()
        }, 1000)
      } else {
        throw new Error((response && response.msg) || (response && response.message) || '兑换失败')
      }
    } catch (error: any) {
      marketLog.error('❌ 兑换失败:', error)
      this.setData({ exchanging: false })

      let errorMessage = '兑换失败，请重试'
      if (error.statusCode === 401) {
        errorMessage = '登录状态异常，请重新登录'
      } else if (error.statusCode === 400) {
        errorMessage = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        errorMessage = '商品库存不足或积分余额不足'
      } else if (error.message) {
        errorMessage = error.message
      }

      wx.showModal({
        title: '🚨 兑换失败',
        content: errorMessage,
        showCancel: true,
        cancelText: '重试',
        confirmText: '我知道了',
        success: (res: any) => {
          if (res.cancel) {
            setTimeout(() => {
              this.onConfirmExchange()
            }, 1000)
          }
        }
      })
    }
  },

  /** 关闭兑换结果弹窗 */
  onCloseResult() {
    marketLog.info('📝 关闭兑换结果弹窗')
    this.setData({ showResult: false, resultData: null })
    marketLog.info('✅ 兑换结果弹窗已关闭')
  },

  // ============================================
  // 📖 分页
  // ============================================

  /** 上一页 */
  onPrevPage() {
    const { currentPage } = this.data
    if (currentPage > 1) {
      this.setData({ currentPage: currentPage - 1 })
      this.loadCurrentPageProducts()
      marketLog.info(`📖 切换到第 ${currentPage - 1} 页`)
    }
  },

  /** 下一页 */
  onNextPage() {
    const { currentPage, totalPages } = this.data
    if (currentPage < totalPages) {
      this.setData({ currentPage: currentPage + 1 })
      this.loadCurrentPageProducts()
      marketLog.info(`📖 切换到第 ${currentPage + 1} 页`)
    }
  },

  /** 跳转到指定页 */
  onPageChange(e: any) {
    const { page } = e.currentTarget.dataset
    const targetPage = parseInt(page)
    if (targetPage !== this.data.currentPage) {
      this.setData({ currentPage: targetPage })
      this.loadCurrentPageProducts()
      marketLog.info(`📖 跳转到第 ${targetPage} 页`)
    }
  },

  /** 页码输入变更 */
  onPageInputChange(e: any) {
    this.setData({ pageInputValue: e.detail.value })
  },

  /** 页码输入确认 */
  onPageInputConfirm(e: any) {
    const { totalPages } = this.data
    const inputValue = e.detail.value || this.data.pageInputValue
    const targetPage = parseInt(inputValue)

    marketLog.info(`📖 输入跳转页码: ${targetPage}`)

    if (isNaN(targetPage)) {
      showToast({ title: '请输入有效页码', icon: 'none' })
      return
    }
    if (targetPage < 1 || targetPage > totalPages) {
      showToast({ title: `页码范围: 1 - ${totalPages}`, icon: 'none' })
      return
    }
    if (targetPage !== this.data.currentPage) {
      this.setData({ currentPage: targetPage, pageInputValue: '' })
      this.loadCurrentPageProducts()
      showToast({ title: `已跳转到第 ${targetPage} 页`, icon: 'success' })
    }
  },

  /** 加载当前页商品数据 */
  loadCurrentPageProducts() {
    const { products, currentPage, pageSize } = this.data
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, products.length)
    const currentPageProducts = products.slice(startIndex, endIndex)

    marketLog.info(
      `📖 加载第${currentPage}页商品 [${startIndex}-${endIndex - 1}], 共${currentPageProducts.length}个`
    )

    this.setData({ filteredProducts: currentPageProducts })
    this.applyFilters()
  },

  /** 计算总页数 */
  calculateTotalPages() {
    const { products, pageSize } = this.data
    const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
    this.setData({ totalPages, totalProducts: products.length })
    marketLog.info(
      `📊 计算分页信息: 共${products.length}个商品, 每页${pageSize}个, 共${totalPages}页`
    )
  },

  /** 清除搜索关键词 */
  onClearSearch() {
    this.setData({ searchKeyword: '', currentPage: 1 })
    this.applyFilters()
  }
}

module.exports = marketHandlers

export {}
