/**
 * 幸运空间子组件 — 决策D12: 子组件自行管理筛选/分页状态
 *
 * 包含：瀑布流布局、搜索筛选、分页、商品数据加载
 * 后端API: GET /api/v4/backpack/exchange/items?space=lucky
 *
 * @file packageExchange/exchange-shelf/sub/lucky-space/lucky-space.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

const {
  API: luckyAPI,
  Wechat: luckyWechat,
  Constants: luckyConstants,
  Logger: luckyLogger,
  Waterfall: luckyWaterfall,
  ProductFilter: luckyProductFilter,
  Utils: luckyUtils
} = require('../../../../utils/index')
const luckyLog = luckyLogger.createLogger('lucky-space')
const {
  getExchangeProducts: luckyGetExchangeProducts,
  getExchangeSpaceStats: luckyGetExchangeSpaceStats
} = luckyAPI
const { showToast: luckyShowToast } = luckyWechat
const { debounce: luckyDebounce } = luckyUtils
const { PAGINATION: LUCKY_PAGINATION } = luckyConstants
const { enrichProductDisplayFields } = require('../../../utils/product-display')

Component({
  properties: {
    /** 可用积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 增强效果配置 */
    effects: { type: Object, value: {} },
    /** 视图模式 'grid'|'list' */
    viewMode: { type: String, value: 'grid' },
    /** 基础筛选项（后端下发） */
    basicFilters: { type: Array, value: [] },
    /** 分类选项（后端下发） */
    categoryOptions: { type: Array, value: [] },
    /** 价格区间选项（后端下发） */
    costRangeOptions: { type: Array, value: [] },
    /** 库存状态选项（后端下发） */
    stockStatusOptions: { type: Array, value: [] },
    /** 排序方式选项（后端下发） */
    sortByOptions: { type: Array, value: [] }
  },

  data: {
    /** 加载状态 */
    loading: true,

    /** 搜索和筛选状态 */
    searchKeyword: '',
    currentFilter: 'all',
    showAdvancedFilter: false,
    categoryFilter: 'all',
    costRangeIndex: 0,
    stockStatus: 'all',
    sortBy: 'sort_order',

    /** 全部商品（用于前端筛选分页） */
    allProducts: [] as any[],
    /** 当前页展示商品（筛选+分页后） */
    filteredProducts: [] as any[],

    /** 分页 */
    currentPage: 1,
    totalPages: 1,
    pageSize: 0,
    totalProducts: 0,
    pageInputValue: '',

    /** 瀑布流布局 */
    waterfallPageSize: 0,
    containerWidth: 375,
    containerHeight: 0,
    columnHeights: [0, 0],
    columnWidth: 0,

    /** 空间统计 */
    spaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 }
  },

  lifetimes: {
    attached() {
      this.setData({
        pageSize: LUCKY_PAGINATION.GRID_SIZE,
        waterfallPageSize: LUCKY_PAGINATION.WATERFALL_SIZE
      })
      this.initData()
    }
  },

  methods: {
    /**
     * 初始化幸运空间数据
     * 后端API: GET /api/v4/backpack/exchange/items?space=lucky
     */
    async initData() {
      luckyLog.info('初始化幸运空间数据...')

      try {
        this.setData({ loading: true })
        await this._initWaterfallLayout()

        const waterfallPageSize = this.data.waterfallPageSize || LUCKY_PAGINATION.WATERFALL_SIZE

        const [response, statsResponse] = await Promise.all([
          luckyGetExchangeProducts({ space: 'lucky', page: 1, page_size: waterfallPageSize }),
          luckyGetExchangeSpaceStats('lucky')
        ])

        if (response && response.success && response.data) {
          const items = response.data.items || []
          luckyLog.info(`获取了 ${items.length} 个商品`)

          if (items.length < 1) {
            this.setData({ allProducts: [], filteredProducts: [], loading: false })
            return
          }

          const waterfallProducts = this._convertToWaterfallData(items) || []
          const layoutResult = this._calculateWaterfallLayout(waterfallProducts)
          const allLayoutProducts = layoutResult.layoutProducts || []

          const luckyStats =
            statsResponse && statsResponse.success && statsResponse.data
              ? {
                  new_count: statsResponse.data.new_count || 0,
                  avg_discount: statsResponse.data.avg_discount || 0,
                  flash_deals: statsResponse.data.flash_deals || 0
                }
              : { new_count: 0, avg_discount: 0, flash_deals: 0 }

          const enrichedProducts = enrichProductDisplayFields(allLayoutProducts)

          this.setData({
            allProducts: enrichedProducts,
            spaceStats: luckyStats,
            loading: false,
            searchKeyword: '',
            currentFilter: 'all',
            categoryFilter: 'all',
            costRangeIndex: 0,
            stockStatus: 'all',
            sortBy: 'sort_order',
            showAdvancedFilter: false,
            currentPage: 1,
            pageInputValue: ''
          })

          this._calculateTotalPages()
          this._loadCurrentPageProducts()
          luckyLog.info('幸运空间数据初始化完成')
        } else {
          luckyLog.info('API返回失败')
          this.setData({ loading: false })
        }
      } catch (error) {
        luckyLog.error('幸运空间初始化失败:', error)
        this.setData({ loading: false })
      }
    },

    /** 初始化瀑布流布局配置 */
    async _initWaterfallLayout() {
      try {
        let systemInfo: Record<string, any> = {}
        try {
          const deviceInfo = wx.getDeviceInfo()
          const windowInfo = wx.getWindowInfo()
          systemInfo = { ...deviceInfo, ...windowInfo }
        } catch (_error) {
          systemInfo = { windowWidth: 375, windowHeight: 667 }
        }
        const containerWidth = (systemInfo.windowWidth || 375) - 48
        this.setData({ containerWidth, columnHeights: [0, 0] })
      } catch (_error) {
        this.setData({ containerWidth: 327, columnHeights: [0, 0] })
      }
    },

    /** 计算瀑布流布局（委托 utils/waterfall.ts） */
    _calculateWaterfallLayout(products: any) {
      const result = luckyWaterfall.calculateWaterfallLayout(products, {
        containerWidth: this.data.containerWidth || 327,
        cardGap: 15
      })
      this.setData({ columnHeights: result.columnHeights })
      return result
    },

    /**
     * 转换后端商品数据为瀑布流格式
     * 后端 DataSanitizer 脱敏: exchange_item_id → id, item_name → name
     */
    _convertToWaterfallData(items: any[]) {
      if (!items || !Array.isArray(items)) {
        return []
      }
      try {
        return items
          .map((item: any) => {
            if (!item || !item.id) {
              return null
            }
            const imageUrl =
              (item.primary_image &&
                (item.primary_image.url || item.primary_image.thumbnail_url)) ||
              '/images/products/default-product.png'
            return {
              id: item.id,
              name: item.name || '',
              image: imageUrl,
              primary_image_id: item.primary_image_id || null,
              cost_amount: Number(item.cost_amount) || 0,
              cost_asset_code: item.cost_asset_code || 'POINTS',
              original_price: item.original_price ? Number(item.original_price) : null,
              sold_count: item.sold_count || 0,
              tags: item.tags || [],
              is_lucky: item.is_lucky || false,
              is_hot: item.is_hot || false,
              is_new: item.is_new || false,
              sell_point: item.sell_point || '',
              description: item.description || '',
              stock: item.stock || 0,
              sort_order: item.sort_order || 0,
              is_limited: item.is_limited || false,
              has_warranty: item.has_warranty || false,
              free_shipping: item.free_shipping || false
            }
          })
          .filter(Boolean)
      } catch (error) {
        luckyLog.error('数据转换失败:', error)
        return []
      }
    },

    /** 搜索输入处理（500ms防抖） */
    onSearchInput: luckyDebounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim() })
      this._applyFilters()
    }, 500),

    /** 基础筛选条件变更 */
    onFilterChange(e: any) {
      this.setData({ currentFilter: e.currentTarget.dataset.filter })
      this._applyFilters()
    },

    /** 切换高级筛选面板 */
    onToggleAdvancedFilter() {
      this.setData({ showAdvancedFilter: !this.data.showAdvancedFilter })
    },

    /** 分类筛选变更 */
    onCategoryFilterChange(e: any) {
      this.setData({ categoryFilter: e.currentTarget.dataset.category })
      this._applyFilters()
    },

    /** 价格区间筛选变更 */
    onCostRangeChange(e: any) {
      this.setData({ costRangeIndex: Number(e.currentTarget.dataset.index) || 0 })
      this._applyFilters()
    },

    /** 排序方式变更 */
    onSortByChange(e: any) {
      this.setData({ sortBy: e.currentTarget.dataset.sort })
      this._applyFilters()
    },

    /** 库存状态筛选 */
    onStockStatusChange(e: any) {
      this.setData({ stockStatus: e.currentTarget.dataset.status })
      this._applyFilters()
    },

    /** 重置所有筛选条件 */
    onResetFilters() {
      this.setData({
        searchKeyword: '',
        currentFilter: 'all',
        categoryFilter: 'all',
        costRangeIndex: 0,
        stockStatus: 'all',
        sortBy: 'sort_order',
        showAdvancedFilter: false
      })
      this._applyFilters()
      luckyShowToast('筛选已重置', 'success')
    },

    /** 按售价排序（外部调用） */
    sortByPrice() {
      const sorted = [...(this.data.filteredProducts || [])].sort(
        (a: any, b: any) => (a.cost_amount || 0) - (b.cost_amount || 0)
      )
      this.setData({ filteredProducts: sorted, sortBy: 'cost_amount_asc' })
      luckyShowToast('已按售价升序排列', 'success')
    },

    /** 应用筛选条件（委托 utils/product-filter.ts） */
    _applyFilters() {
      const {
        allProducts,
        searchKeyword,
        currentFilter,
        categoryFilter,
        costRangeIndex,
        stockStatus,
        sortBy
      } = this.data
      const costRangeOptions = this.properties.costRangeOptions as any[]
      const selectedRange = costRangeOptions[costRangeIndex] || {}

      const filterResult = luckyProductFilter.applyProductFilters(allProducts, {
        searchKeyword,
        currentFilter,
        categoryFilter,
        costRangeMin: selectedRange.min ?? null,
        costRangeMax: selectedRange.max ?? null,
        stockStatus,
        sortBy,
        totalPoints: this.properties.pointsBalance,
        priceField: 'cost_amount'
      })

      const allFiltered = filterResult.filtered || []
      this.setData({ allProducts: allFiltered })
      this._calculateTotalPages()
      this._loadCurrentPageProducts()
    },

    /** pagination组件统一分页事件处理 */
    onPaginationChange(e: any) {
      const targetPage = e.detail.page
      if (targetPage !== this.data.currentPage) {
        this.setData({ currentPage: targetPage, pageInputValue: '' })
        this._loadCurrentPageProducts()
      }
    },

    /** 计算总页数 */
    _calculateTotalPages() {
      const { allProducts, pageSize } = this.data
      const products = allProducts || []
      const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
      this.setData({ totalPages, totalProducts: products.length })
    },

    /** 加载当前页商品数据 */
    _loadCurrentPageProducts() {
      const { allProducts, currentPage, pageSize } = this.data
      const products = allProducts || []
      const startIndex = (currentPage - 1) * pageSize
      const endIndex = Math.min(startIndex + pageSize, products.length)
      const currentPageProducts = products.slice(startIndex, endIndex)

      const layoutResult = this._calculateWaterfallLayout(currentPageProducts)
      this.setData({
        filteredProducts: layoutResult.layoutProducts || [],
        containerHeight: layoutResult.containerHeight || 500,
        columnHeights: layoutResult.columnHeights || [0, 0]
      })
    },

    /** 涟漪效果（由父组件调用） */
    applyRipple(cardIndex: number, rippleX: number, rippleY: number) {
      const productList = [...(this.data.filteredProducts || [])]
      if (!productList[cardIndex]) {
        return
      }
      productList[cardIndex] = {
        ...productList[cardIndex],
        _rippleActive: true,
        _rippleX: rippleX,
        _rippleY: rippleY
      }
      this.setData({ filteredProducts: productList })
      setTimeout(() => {
        productList[cardIndex] = { ...productList[cardIndex], _rippleActive: false }
        this.setData({ filteredProducts: productList })
      }, 500)
    },

    /** 图片加载失败回调 */
    onImageError(e: any) {
      const index = e.currentTarget.dataset.index
      this.setData({
        [`filteredProducts[${index}].image`]: '/images/products/default-product.png',
        [`filteredProducts[${index}]._hasImage`]: false
      })
    },

    /** 商品点击（通知父组件打开确认弹窗） */
    onProductTap(e: any) {
      const product = e.currentTarget.dataset.product
      this.triggerEvent('producttap', { product })
    },

    /** 对外暴露的刷新方法 */
    refresh() {
      this.initData()
    }
  }
})

export {}
