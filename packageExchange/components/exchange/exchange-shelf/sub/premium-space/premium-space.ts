/**
 * 臻选空间子组件 服务端筛+ 双列网格布局
 *
 * 筛选机制（C+++方案，对齐幸运空lucky-space.ts）：
 *   - 所有筛排序/搜索均通过 API 查询参数传递给后端
 *   - 后端 QueryService.getMarketItems() 执行 WHERE / ORDER BY / LIMIT
 *   - 支持 with_counts=true 返回各维度聚合计 *
 * 后端API: GET /api/v4/exchange/items?space=premium&...
 *
 * @file components/exchange/exchange-shelf/sub/premium-space/premium-space.ts
 * @version 7.0.0
 * @since 2026-03-15
 */

const {
  API: premiumAPI,
  Wechat: premiumWechat,
  Logger: premiumLogger,
  Constants: premiumConstants,
  Utils: premiumUtils,
  ImageHelper: premiumImageHelper,
  AssetCodes: premiumAssetCodes,
  ProductDisplay: premiumProductDisplay
} = require('../../../../../../utils/index')
const premiumLog = premiumLogger.createLogger('premium-space')
const {
  getExchangeProducts: premiumGetExchangeProducts,
  getExchangeSpaceStats: premiumGetExchangeSpaceStats
} = premiumAPI
const { showToast: premiumShowToast } = premiumWechat
const { debounce: premiumDebounce } = premiumUtils
const { PAGINATION: PREMIUM_PAGINATION } = premiumConstants
const { enrichProductDisplayFields } = premiumProductDisplay

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
    /** 分类选项（后product-filter API 下发的扁平分类） */
    categoryOptions: { type: Array, value: [] },
    /** 分类树（后端 category-tree*/
    categoryTree: { type: Array, value: [] },
    /** 分类树加载状态（父组件统一控制*/
    categoryTreeLoading: { type: Boolean, value: false },
    /** 价格区间选项（后端下发，统一 100/500/1000 区间*/
    costRangeOptions: { type: Array, value: [] },
    /** 库存状态选项（后端下发） */
    stockStatusOptions: { type: Array, value: [] },
    /** 排序方式选项（后端下发） */
    sortByOptions: { type: Array, value: [] }
  },

  data: {
    cascaderKeys: { label: 'label', value: 'value', children: 'children' },
    loading: true,
    loadingMore: false,
    categoryPopupVisible: false,
    categoryCascaderOptions: [] as any[],
    categoryDisplayLabel: '全部',

    /** 搜索和筛选状态（变更后触发服务端请求*/
    searchKeyword: '',
    showAdvancedFilter: false,
    categoryFilter: 'all',
    costRangeIndex: 0,
    stockStatus: 'all',
    sortBy: 'sort_order',

    /** 当前页展示商品（服务端分页） */
    filteredProducts: [] as any[],
    /** 分页（服务端分页*/
    currentPage: 1,
    totalPages: 1,
    pageSize: 0,
    totalProducts: 0,
    pageInputValue: '',
    /** 空间统计 */
    spaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 },

    /** 筛选维度聚合计数（后端 with_counts=true 返回*/
    filtersCount: null as any
  },

  lifetimes: {
    attached() {
      this.setData({ pageSize: PREMIUM_PAGINATION.GRID_SIZE })
      this._syncCategoryOptions(
        this.properties.categoryTree as any[],
        this.properties.categoryOptions as any[]
      )
      this.initData()
    }
  },

  observers: {
    'categoryTree, categoryOptions'(categoryTree: any[], categoryOptions: any[]) {
      this._syncCategoryOptions(categoryTree, categoryOptions)
    }
  },

  methods: {
    /** 筛选操作防抖加载（300ms），避免用户快速连续点击触发多次API请求 */
    _debouncedLoadProducts: premiumDebounce(function (this: any) {
      this._loadFilteredProducts()
    }, 300),

    _buildCategoryTreeOptions(options: any[]): any[] {
      return (options || []).map((item: any) => ({
        label: item.category_name,
        value: item.category_id,
        category_id: item.category_id,
        category_code: item.category_code,
        children: Array.isArray(item.children)
          ? item.children.map((child: any) => ({
              label: child.category_name,
              value: child.category_id,
              category_id: child.category_id,
              category_code: child.category_code,
              parent_category_id: item.category_id,
              parent_code: item.category_code
            }))
          : []
      }))
    },

    _buildCategoryFlatOptions(flatOptions: any[]): any[] {
      return (flatOptions || []).map((item: any) => ({
        label: item.category_name || item.label,
        value: item.category_id,
        category_id: item.category_id,
        category_code: item.category_code
      }))
    },

    _syncCategoryOptions(categoryTree: any[], categoryOptions: any[]) {
      const cascaderOptions =
        Array.isArray(categoryTree) && categoryTree.length > 0
          ? this._buildCategoryTreeOptions(categoryTree)
          : this._buildCategoryFlatOptions(categoryOptions)
      this.setData({ categoryCascaderOptions: cascaderOptions })
      this._syncCategoryDisplayLabel(this.data.categoryFilter, cascaderOptions)
    },

    _findCategoryLabel(targetValue: string, cascaderOptions: any[]): string {
      if (targetValue === 'all') {
        return '全部'
      }
      for (const option of cascaderOptions || []) {
        if (String(option.value) === targetValue) {
          return option.label || '全部'
        }
        const children = option.children || []
        for (const child of children) {
          if (String(child.value) === targetValue) {
            return child.label || '全部'
          }
        }
      }
      return '全部'
    },

    _syncCategoryDisplayLabel(categoryValue: string, cascaderOptions: any[]) {
      const categoryDisplayLabel = this._findCategoryLabel(categoryValue, cascaderOptions)
      if (categoryDisplayLabel !== this.data.categoryDisplayLabel) {
        this.setData({ categoryDisplayLabel })
      }
    },

    onOpenCategoryPopup() {
      if (this.properties.categoryTreeLoading) {
        return
      }
      this.setData({ categoryPopupVisible: true })
    },

    onCloseCategoryPopup() {
      this.setData({ categoryPopupVisible: false })
    },

    onSelectAllCategory() {
      this.setData({
        categoryFilter: 'all',
        categoryPopupVisible: false,
        categoryDisplayLabel: '全部'
      })
      this._debouncedLoadProducts()
    },

    onCategoryCascaderChange(e: any) {
      const selectedOptions = e.detail?.selectedOptions || []
      const selectedValue = e.detail?.value
      const normalizedValue =
        selectedValue === null || selectedValue === undefined || selectedValue === ''
          ? 'all'
          : String(selectedValue)
      const targetOption = selectedOptions[selectedOptions.length - 1]
      this.setData({
        categoryFilter: normalizedValue,
        categoryPopupVisible: false,
        categoryDisplayLabel: targetOption?.label || '全部'
      })
      this._debouncedLoadProducts()
    },

    /**
     * 初始化臻选空间数据（服务端分+ with_counts     * 后端API: GET /api/v4/exchange/items?space=premium
     */
    async initData() {
      premiumLog.info('初始化臻选空间数..')

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
              premiumLog.error(`{idx}个商品缺exchange_item_id（主键）`)
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
            categoryDisplayLabel: '全部',
            costRangeIndex: 0,
            stockStatus: 'all',
            sortBy: 'sort_order',
            showAdvancedFilter: false
          })
          premiumLog.info('臻选空间数据初始化完成')
        } else {
          premiumLog.info('臻选空间商品为')
          this.setData({ loading: false })
        }
      } catch (error) {
        premiumLog.error('臻选空间初始化失败:', error)
        this.setData({ loading: false })
      }
    },

    /** 转换后端商品数据为网格格*/
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
            cost_asset_code: item.cost_asset_code || premiumAssetCodes.POINTS,
            original_price: item.original_price ? Number(item.original_price) : null,
            stock: item.stock || 0,
            sold_count: item.sold_count || 0,
            tags: item.tags || [],
            is_hot: item.is_hot || false,
            is_new: item.is_new || false,
            sell_point: item.sell_point || '',
            is_limited: item.is_limited || false,
            is_pinned: item.is_pinned || false,
            is_recommended: item.is_recommended || false,
            has_warranty: item.has_warranty || false,
            free_shipping: item.free_shipping || false,
            rarity_code: item.rarity_code || 'common',
            category_id: item.category_id || null,
            category_code: (item.category && item.category.category_code) || null
          }
        })
        .filter(Boolean)
    },

    /**
     * 转换 filters_count.cost_ranges 从后端字符串键对象为前端数组格式
     * 后端返回: { "0-100": 1, "100-500": 3, "500-1000": 1, "1000+": 0, "total": 5 }
     * 前端需 [total, 1, 3, 1, 0]（索引对costRangeOptions 数组     */
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

    /** 搜索输入处理00ms防抖）→ 调用服务端筛*/
    onSearchInput: premiumDebounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim() })
      this._loadFilteredProducts()
    }, 500),

    /** 切换高级筛选面*/
    onToggleAdvancedFilter() {
      this.setData({ showAdvancedFilter: !this.data.showAdvancedFilter })
    },

    /** 价格区间筛选变防抖加载 */
    onCostRangeChange(e: any) {
      this.setData({ costRangeIndex: Number(e.currentTarget.dataset.index) || 0 })
      this._debouncedLoadProducts()
    },

    /** 排序方式变更 防抖加载 */
    onSortByChange(e: any) {
      this.setData({ sortBy: e.currentTarget.dataset.sort })
      this._debouncedLoadProducts()
    },

    /** 库存状态筛防抖加载 */
    onStockStatusChange(e: any) {
      this.setData({ stockStatus: e.currentTarget.dataset.status })
      this._debouncedLoadProducts()
    },

    /** 重置所有筛选条调用服务端筛*/
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

    /** 按售价排序（外部调用*/
    sortByPrice() {
      this.setData({ sortBy: 'cost_amount_asc' })
      this._loadFilteredProducts()
      premiumShowToast('已按售价升序排列', 'success')
    },

    /** 核心方法：构建筛选参数并请求后端API（对lucky-space.ts     * @param page - 请求页码，默认重置到     * @param append - 是否追加到当前列     */
    async _loadFilteredProducts(page: number = 1, append: boolean = false) {
      const { searchKeyword, categoryFilter, costRangeIndex, stockStatus, sortBy, pageSize } =
        this.data
      const costRangeOptions = this.properties.costRangeOptions as any[]
      const selectedRange = costRangeOptions[costRangeIndex] || {}

      this.setData(append ? { loadingMore: true } : { loading: true })

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
          apiParams.category_id = categoryFilter
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

          if (items.length < 1 && !append) {
            this.setData({
              filteredProducts: [],
              loading: false,
              loadingMore: false,
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
          const mergedProducts = append
            ? [...(this.data.filteredProducts || []), ...enrichedProducts]
            : enrichedProducts

          this.setData({
            filteredProducts: mergedProducts,
            loading: false,
            loadingMore: false,
            currentPage: page,
            totalProducts: pagination.total || mergedProducts.length,
            totalPages: pagination.total_pages || 1,
            pageInputValue: '',
            filtersCount: this._transformFiltersCount(response.data.filters_count || null)
          })
        } else {
          this.setData({ loading: false, loadingMore: false })
        }
      } catch (error) {
        premiumLog.error('筛选请求失', error)
        this.setData({ loading: false, loadingMore: false })
      }
    },

    loadMore() {
      if (
        this.data.loading ||
        this.data.loadingMore ||
        this.data.currentPage >= this.data.totalPages
      ) {
        return
      }
      this._loadFilteredProducts(this.data.currentPage + 1, true)
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

    /** 商品点击（通知父组件打开确认弹窗*/
    onProductTap(e: any) {
      const product = e.currentTarget.dataset.product
      this.triggerEvent('producttap', { product })
    },

    /** 对外暴露的刷新方*/
    refresh() {
      this.initData()
    }
  }
})
