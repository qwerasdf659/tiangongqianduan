/**
 * 臻选空间子组件 — 服务端筛选 + 双列网格布局
 *
 * 筛选机制（C+++方案，对齐幸运空间 lucky-space.ts）：
 *   - 所有筛选/排序/搜索均通过 API 查询参数传递给后端
 *   - 后端 QueryService.getMarketItems() 执行 WHERE / ORDER BY / LIMIT
 *   - 支持 with_counts=true 返回各维度聚合计数
 *
 * 后端API: GET /api/v4/backpack/exchange/items?space=premium&...
 *
 * @file packageExchange/exchange-shelf/sub/premium-space/premium-space.ts
 * @version 7.0.0
 * @since 2026-03-15
 */

const {
  API: premiumAPI,
  Wechat: premiumWechat,
  Logger: premiumLogger,
  Constants: premiumConstants,
  Utils: premiumUtils,
  ImageHelper: premiumImageHelper
} = require('../../../../utils/index')
const premiumLog = premiumLogger.createLogger('premium-space')
const {
  getExchangeProducts: premiumGetExchangeProducts,
  getExchangeSpaceStats: premiumGetExchangeSpaceStats
} = premiumAPI
const { showToast: premiumShowToast } = premiumWechat
const { debounce: premiumDebounce } = premiumUtils
const { PAGINATION: PREMIUM_PAGINATION } = premiumConstants
const { enrichProductDisplayFields } = require('../../../utils/product-display')

Component({
  properties: {
    /** 可用积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 增强效果配置 */
    effects: { type: Object, value: {} },
    /** 视图模式 */
    viewMode: { type: String, value: 'grid' },
    /** 臻选空间是否已解锁 */
    premiumUnlocked: { type: Boolean, value: false },
    /** 分类选项（后端 product-filter API 下发，使用 category_code） */
    categoryOptions: { type: Array, value: [] },
    /** 价格区间选项（后端下发，统一 100/500/1000 区间） */
    costRangeOptions: { type: Array, value: [] },
    /** 库存状态选项（后端下发） */
    stockStatusOptions: { type: Array, value: [] },
    /** 排序方式选项（后端下发） */
    sortByOptions: { type: Array, value: [] }
  },

  data: {
    loading: true,

    /** 搜索和筛选状态（变更后触发服务端请求） */
    searchKeyword: '',
    showAdvancedFilter: false,
    categoryFilter: 'all',
    costRangeIndex: 0,
    stockStatus: 'all',
    sortBy: 'sort_order',

    /** 当前页展示商品（服务端分页） */
    filteredProducts: [] as any[],
    /** 分页（服务端分页） */
    currentPage: 1,
    totalPages: 1,
    pageSize: 0,
    totalProducts: 0,
    pageInputValue: '',
    /** 空间统计 */
    spaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 },

    /** 筛选维度聚合计数（后端 with_counts=true 返回） */
    filtersCount: null as any
  },

  lifetimes: {
    attached() {
      this.setData({ pageSize: PREMIUM_PAGINATION.GRID_SIZE })
      this.initData()
    }
  },

  methods: {
    /** 筛选操作防抖加载（300ms），避免用户快速连续点击触发多次API请求 */
    _debouncedLoadProducts: premiumDebounce(function (this: any) {
      this._loadFilteredProducts()
    }, 300),

    /**
     * 初始化臻选空间数据（服务端分页 + with_counts）
     * 后端API: GET /api/v4/backpack/exchange/items?space=premium
     */
    async initData() {
      premiumLog.info('初始化臻选空间数据...')

      try {
        this.setData({ loading: true })

        const pageSize = this.data.pageSize || PREMIUM_PAGINATION.GRID_SIZE

        const [exchangeResponse, premiumStatsResponse] = await Promise.all([
          premiumGetExchangeProducts({
            space: 'premium',
            page: 1,
            page_size: pageSize,
            with_counts: true
          }),
          premiumGetExchangeSpaceStats('premium')
        ])

        if (exchangeResponse && exchangeResponse.success && exchangeResponse.data) {
          const rawItems = exchangeResponse.data.items || []
          const pagination = exchangeResponse.data.pagination || {}

          const items = rawItems.filter((item: any, idx: number) => {
            if (!item || typeof item !== 'object') {
              return false
            }
            if (!item.exchange_item_id) {
              premiumLog.error(`第${idx}个商品缺少 exchange_item_id（主键）`)
              return false
            }
            return true
          })

          const premiumStats =
            premiumStatsResponse && premiumStatsResponse.success && premiumStatsResponse.data
              ? {
                  hot_count: premiumStatsResponse.data.hot_count || 0,
                  avg_rating: premiumStatsResponse.data.avg_rating || 0,
                  trending_count: premiumStatsResponse.data.trending_count || 0
                }
              : { hot_count: 0, avg_rating: 0, trending_count: 0 }

          const enrichedProducts = enrichProductDisplayFields(this._convertToGridData(items))

          this.setData({
            filteredProducts: enrichedProducts,
            spaceStats: premiumStats,
            loading: false,
            currentPage: 1,
            pageInputValue: '',
            totalProducts: pagination.total || items.length,
            totalPages: pagination.total_pages || 1,
            filtersCount: this._transformFiltersCount(exchangeResponse.data.filters_count || null),
            searchKeyword: '',
            categoryFilter: 'all',
            costRangeIndex: 0,
            stockStatus: 'all',
            sortBy: 'sort_order',
            showAdvancedFilter: false
          })
          premiumLog.info('臻选空间数据初始化完成')
        } else {
          premiumLog.info('臻选空间商品为空')
          this.setData({ loading: false })
        }
      } catch (error) {
        premiumLog.error('臻选空间初始化失败:', error)
        this.setData({ loading: false })
      }
    },

    /** 转换后端商品数据为网格格式 */
    _convertToGridData(items: any[]) {
      if (!items || !Array.isArray(items)) {
        return []
      }
      return items
        .map((item: any) => {
          if (!item || !item.exchange_item_id) {
            return null
          }
          return {
            exchange_item_id: item.exchange_item_id,
            item_name: item.item_name || '',
            description: item.description || '',
            image:
              (item.primary_media &&
                (item.primary_media.public_url ||
                  (item.primary_media.thumbnails && item.primary_media.thumbnails.medium))) ||
              premiumImageHelper.DEFAULT_PRODUCT_IMAGE,
            cost_amount: Number(item.cost_amount) || 0,
            cost_asset_code: item.cost_asset_code || 'POINTS',
            original_price: item.original_price ? Number(item.original_price) : null,
            stock: item.stock || 0,
            sold_count: item.sold_count || 0,
            tags: item.tags || [],
            is_hot: item.is_hot || false,
            is_new: item.is_new || false,
            sell_point: item.sell_point || '',
            is_limited: item.is_limited || false,
            has_warranty: item.has_warranty || false,
            free_shipping: item.free_shipping || false,
            rarity_code: item.rarity_code || 'common',
            category_def_id: item.category_def_id || null,
            category_code: (item.category_def && item.category_def.category_code) || null
          }
        })
        .filter(Boolean)
    },

    /**
     * 转换 filters_count.cost_ranges 从后端字符串键对象为前端数组格式
     * 后端返回: { "0-100": 1, "100-500": 3, "500-1000": 1, "1000+": 0, "total": 5 }
     * 前端需要: [total, 1, 3, 1, 0]（索引对齐 costRangeOptions 数组）
     */
    _transformFiltersCount(rawFiltersCount: any): any {
      if (
        !rawFiltersCount ||
        !rawFiltersCount.cost_ranges ||
        Array.isArray(rawFiltersCount.cost_ranges)
      ) {
        return rawFiltersCount
      }

      const costRangeOptions = this.properties.costRangeOptions as any[]
      const rawRanges = rawFiltersCount.cost_ranges
      const costRangesArray: (number | undefined)[] = []

      costRangeOptions.forEach((option: any, idx: number) => {
        if (idx === 0) {
          costRangesArray.push(rawRanges.total)
          return
        }
        const rangeKey =
          option.max !== null && option.max !== undefined
            ? `${option.min || 0}-${option.max}`
            : `${option.min || 0}+`
        costRangesArray.push(rawRanges[rangeKey])
      })

      return { ...rawFiltersCount, cost_ranges: costRangesArray }
    },

    /** 搜索输入处理（500ms防抖）→ 调用服务端筛选 */
    onSearchInput: premiumDebounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim() })
      this._loadFilteredProducts()
    }, 500),

    /** 切换高级筛选面板 */
    onToggleAdvancedFilter() {
      this.setData({ showAdvancedFilter: !this.data.showAdvancedFilter })
    },

    /** 分类筛选变更 → 防抖加载 */
    onCategoryFilterChange(e: any) {
      this.setData({ categoryFilter: e.currentTarget.dataset.category })
      this._debouncedLoadProducts()
    },

    /** 价格区间筛选变更 → 防抖加载 */
    onCostRangeChange(e: any) {
      this.setData({ costRangeIndex: Number(e.currentTarget.dataset.index) || 0 })
      this._debouncedLoadProducts()
    },

    /** 排序方式变更 → 防抖加载 */
    onSortByChange(e: any) {
      this.setData({ sortBy: e.currentTarget.dataset.sort })
      this._debouncedLoadProducts()
    },

    /** 库存状态筛选 → 防抖加载 */
    onStockStatusChange(e: any) {
      this.setData({ stockStatus: e.currentTarget.dataset.status })
      this._debouncedLoadProducts()
    },

    /** 重置所有筛选条件 → 调用服务端筛选 */
    onResetFilters() {
      this.setData({
        searchKeyword: '',
        categoryFilter: 'all',
        costRangeIndex: 0,
        stockStatus: 'all',
        sortBy: 'sort_order',
        showAdvancedFilter: false
      })
      this._loadFilteredProducts()
      premiumShowToast('筛选已重置', 'success')
    },

    /** 按售价排序（外部调用） */
    sortByPrice() {
      this.setData({ sortBy: 'cost_amount_asc' })
      this._loadFilteredProducts()
      premiumShowToast('已按售价升序排列', 'success')
    },

    /**
     * 核心方法：构建筛选参数并请求后端API（对齐 lucky-space.ts）
     * @param page - 请求页码，默认重置到第1页
     */
    async _loadFilteredProducts(page: number = 1) {
      const { searchKeyword, categoryFilter, costRangeIndex, stockStatus, sortBy, pageSize } =
        this.data
      const costRangeOptions = this.properties.costRangeOptions as any[]
      const selectedRange = costRangeOptions[costRangeIndex] || {}

      this.setData({ loading: true })

      try {
        const apiParams: Record<string, any> = {
          space: 'premium',
          page,
          page_size: pageSize || PREMIUM_PAGINATION.GRID_SIZE,
          with_counts: true
        }

        if (searchKeyword) {
          apiParams.keyword = searchKeyword
        }
        if (categoryFilter && categoryFilter !== 'all') {
          apiParams.category_code = categoryFilter
        }
        if (selectedRange.min !== undefined && selectedRange.min !== null) {
          apiParams.min_cost = selectedRange.min
        }
        if (selectedRange.max !== undefined && selectedRange.max !== null) {
          apiParams.max_cost = selectedRange.max
        }
        if (stockStatus && stockStatus !== 'all') {
          apiParams.stock_status = stockStatus
        }

        if (sortBy && sortBy !== 'sort_order') {
          if (sortBy === 'cost_amount_asc') {
            apiParams.sort_by = 'cost_amount'
            apiParams.sort_order = 'ASC'
          } else if (sortBy === 'cost_amount_desc') {
            apiParams.sort_by = 'cost_amount'
            apiParams.sort_order = 'DESC'
          } else if (sortBy === 'created_at_desc') {
            apiParams.sort_by = 'created_at'
            apiParams.sort_order = 'DESC'
          } else if (sortBy === 'sold_count_desc') {
            apiParams.sort_by = 'sold_count'
            apiParams.sort_order = 'DESC'
          }
        }

        const response = await premiumGetExchangeProducts(apiParams)

        if (response && response.success && response.data) {
          const items = response.data.items || []
          const pagination = response.data.pagination || {}

          if (items.length < 1) {
            this.setData({
              filteredProducts: [],
              loading: false,
              currentPage: page,
              totalProducts: pagination.total || 0,
              totalPages: pagination.total_pages || 1,
              pageInputValue: '',
              filtersCount: this._transformFiltersCount(response.data.filters_count || null)
            })
            return
          }

          const gridProducts = this._convertToGridData(items) || []
          const enrichedProducts = enrichProductDisplayFields(gridProducts)

          this.setData({
            filteredProducts: enrichedProducts,
            loading: false,
            currentPage: page,
            totalProducts: pagination.total || items.length,
            totalPages: pagination.total_pages || 1,
            pageInputValue: '',
            filtersCount: this._transformFiltersCount(response.data.filters_count || null)
          })
        } else {
          this.setData({ loading: false })
        }
      } catch (error) {
        premiumLog.error('筛选请求失败:', error)
        this.setData({ loading: false })
      }
    },

    /** pagination组件统一分页事件处理 */
    onPaginationChange(e: any) {
      const targetPage = e.detail.page
      if (targetPage !== this.data.currentPage) {
        this.setData({ pageInputValue: '' })
        this._loadFilteredProducts(targetPage)
      }
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
        [`filteredProducts[${index}].image`]: premiumImageHelper.DEFAULT_PRODUCT_IMAGE,
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
