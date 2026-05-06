/**
 * 幸运空间子组服务端筛+ 瀑布流布局
 *
 * 筛选机制（C+++方案，对齐设计文档第3节） *   - 所有筛排序/搜索均通过 API 查询参数传递给后端
 *   - 后端 QueryService.getMarketItems() 执行 WHERE / ORDER BY / LIMIT
 *   - 不再在客户端内存中过滤商品数 *   - 支持 with_counts=true 返回各维度聚合计数（交叉排除 *
 * 后端API: GET /api/v4/exchange/items?space=lucky&category=xxx&...
 * 筛选配置API: GET /api/v4/system/config/product-filter
 *
 * @file components/exchange/exchange-shelf/sub/lucky-space/lucky-space.ts
 * @version 6.0.0
 * @since 2026-03-14
 */

const {
  API: luckyAPI,
  Wechat: luckyWechat,
  Constants: luckyConstants,
  Logger: luckyLogger,
  Waterfall: luckyWaterfall,
  Utils: luckyUtils,
  ImageHelper: luckyImageHelper,
  AssetCodes: luckyAssetCodes,
  ProductDisplay: luckyProductDisplay
} = require('../../../../../../utils/index')
const luckyLog = luckyLogger.createLogger('lucky-space')
const {
  getExchangeProducts: luckyGetExchangeProducts,
  getExchangeSpaceStats: luckyGetExchangeSpaceStats
} = luckyAPI
const { showToast: luckyShowToast } = luckyWechat
const { debounce: luckyDebounce } = luckyUtils
const { PAGINATION: LUCKY_PAGINATION } = luckyConstants
const { enrichProductDisplayFields } = luckyProductDisplay

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
    /** 加载状*/
    loading: true,
    loadingMore: false,
    categoryPopupVisible: false,
    categoryCascaderOptions: [] as any[],
    categoryDisplayLabel: '全部',

    /** 搜索和筛选状态（变更后触发服务端请求*/
    searchKeyword: '',
    currentFilter: 'all',
    showAdvancedFilter: false,
    categoryFilter: 'all',
    costRangeIndex: 0,
    stockStatus: 'all',
    sortBy: 'sort_order',

    /** 当前页商品（服务端分+ 瀑布流布局后） */
    filteredProducts: [] as any[],

    /** 分页（服务端分页*/
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
    spaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 },

    /** 筛选维度聚合计数（后端 with_counts=true 返回*/
    filtersCount: null as any
  },

  lifetimes: {
    attached() {
      this.setData({
        pageSize: LUCKY_PAGINATION.WATERFALL_SIZE,
        waterfallPageSize: LUCKY_PAGINATION.WATERFALL_SIZE
      })
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
    _debouncedLoadProducts: luckyDebounce(function (this: any) {
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
     * 初始化幸运空间数     * 并行请求商品列表和空间统     */
    async initData() {
      luckyLog.info('初始化幸运空间数..')

      try {
        this.setData({ loading: true })
        await this._initWaterfallLayout()

        const waterfallPageSize = this.data.waterfallPageSize || LUCKY_PAGINATION.WATERFALL_SIZE

        const [response, statsResponse] = await Promise.all([
          luckyGetExchangeProducts({
            space: 'lucky',
            page: 1,
            page_size: waterfallPageSize,
            with_counts: true
          }),
          luckyGetExchangeSpaceStats('lucky')
        ])

        if (response && response.success && response.data) {
          const items = response.data.items || []
          const pagination = response.data.pagination || {}
          luckyLog.info(`获取${items.length} 个商品`)

          if (items.length < 1) {
            this.setData({
              filteredProducts: [],
              loading: false,
              totalProducts: 0,
              totalPages: 1,
              filtersCount: this._transformFiltersCount(response.data.filters_count || null)
            })
            return
          }

          const waterfallProducts = this._convertToWaterfallData(items) || []
          const enrichedProducts = enrichProductDisplayFields(waterfallProducts)
          const layoutResult = this._calculateWaterfallLayout(enrichedProducts)

          const luckyStats =
            statsResponse && statsResponse.success && statsResponse.data
              ? {
                  new_count: statsResponse.data.new_count || 0,
                  avg_discount: statsResponse.data.avg_discount || 0,
                  flash_deals: statsResponse.data.flash_deals || 0
                }
              : { new_count: 0, avg_discount: 0, flash_deals: 0 }

          this.setData({
            filteredProducts: layoutResult.layoutProducts || [],
            containerHeight: layoutResult.containerHeight || 500,
            columnHeights: layoutResult.columnHeights || [0, 0],
            spaceStats: luckyStats,
            loading: false,
            searchKeyword: '',
            currentFilter: 'all',
            categoryFilter: 'all',
            categoryDisplayLabel: '全部',
            costRangeIndex: 0,
            stockStatus: 'all',
            sortBy: 'sort_order',
            showAdvancedFilter: false,
            currentPage: 1,
            pageInputValue: '',
            totalProducts: pagination.total || items.length,
            totalPages: pagination.total_pages || 1,
            filtersCount: this._transformFiltersCount(response.data.filters_count || null)
          })
          luckyLog.info('幸运空间数据初始化完')
        } else {
          luckyLog.info('API返回失败')
          this.setData({ loading: false })
        }
      } catch (error) {
        luckyLog.error('幸运空间初始化失', error)
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

    /** 计算瀑布流布局（委utils/waterfall.ts*/
    _calculateWaterfallLayout(products: any) {
      const result = luckyWaterfall.calculateWaterfallLayout(products, {
        containerWidth: this.data.containerWidth || 327,
        cardGap: 15
      })
      this.setData({ columnHeights: result.columnHeights })
      return result
    },

    /**
     * 转换后端商品数据为瀑布流格     * 后端字段: exchange_item_id（主键）、name（商品名称）
     */
    _convertToWaterfallData(items: any[]) {
      if (!items || !Array.isArray(items)) {
        return []
      }
      try {
        return items
          .map((item: any) => {
            if (!item || !item.exchange_item_id) {
              return null
            }
            const imageUrl =
              (item.primary_media &&
                (item.primary_media.public_url ||
                  (item.primary_media.thumbnails && item.primary_media.thumbnails.medium))) ||
              luckyImageHelper.DEFAULT_PRODUCT_IMAGE
            return {
              exchange_item_id: item.exchange_item_id,
              item_name: item.item_name || '',
              image: imageUrl,
              primary_media_id: item.primary_media_id || null,
              cost_amount: Number(item.cost_amount) || 0,
              cost_asset_code: item.cost_asset_code || luckyAssetCodes.POINTS,
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
      } catch (error) {
        luckyLog.error('数据转换失败:', error)
        return []
      }
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
    onSearchInput: luckyDebounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim() })
      this._loadFilteredProducts()
    }, 500),

    /** 基础筛选条件变防抖加载 */
    onFilterChange(e: any) {
      this.setData({ currentFilter: e.currentTarget.dataset.filter })
      this._debouncedLoadProducts()
    },

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
        currentFilter: 'all',
        categoryFilter: 'all',
        costRangeIndex: 0,
        stockStatus: 'all',
        sortBy: 'sort_order',
        showAdvancedFilter: false
      })
      this._loadFilteredProducts()
      luckyShowToast('筛选已重置', 'success')
    },

    /** 按售价排序（外部调用*/
    sortByPrice() {
      this.setData({ sortBy: 'cost_amount_asc' })
      this._loadFilteredProducts()
      luckyShowToast('已按售价升序排列', 'success')
    },

    /**
     * 核心方法：构建筛选参数并请求后端API
     *
     * 数据
     *   用户操作筛选UI setData更新筛选状_loadFilteredProducts()
     *   构建API参数 GET /api/v4/exchange/items?space=lucky&...
     *   后端 QueryService WHERE/ORDER BY 返回筛选结     *   瀑布流布局 setData渲染
     *
     * @param page - 请求页码，默认重置到     * @param append - 是否追加到当前列     */
    async _loadFilteredProducts(page: number = 1, append: boolean = false) {
      const {
        searchKeyword,
        categoryFilter,
        costRangeIndex,
        stockStatus,
        sortBy,
        waterfallPageSize
      } = this.data
      const costRangeOptions = this.properties.costRangeOptions as any[]
      const selectedRange = costRangeOptions[costRangeIndex] || {}

      this.setData(append ? { loadingMore: true } : { loading: true })

      try {
        /* 构建后端API查询参数（对QueryService 全部 12 个筛选参数） */
        const apiParams: Record<string, any> = {
          space: 'lucky',
          page,
          page_size: waterfallPageSize || LUCKY_PAGINATION.WATERFALL_SIZE,
          with_counts: true
        }

        if (searchKeyword) {
          apiParams.keyword = searchKeyword
        }
        if (categoryFilter && categoryFilter !== 'all') {
          apiParams.category_id = categoryFilter
        }

        /* 价格区间：使用后cost_ranges 配置中的 min/max */
        if (selectedRange.min !== undefined && selectedRange.min !== null) {
          apiParams.min_cost = selectedRange.min
        }
        if (selectedRange.max !== undefined && selectedRange.max !== null) {
          apiParams.max_cost = selectedRange.max
        }

        if (stockStatus && stockStatus !== 'all') {
          apiParams.stock_status = stockStatus
        }

        /* 排序参数拆分：后端接sort_by + sort_order 两个独立参数 */
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

        const response = await luckyGetExchangeProducts(apiParams)

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
              filtersCount: this._transformFiltersCount(response.data.filters_count || null),
              containerHeight: 200
            })
            return
          }

          const waterfallProducts = this._convertToWaterfallData(items) || []
          const enrichedProducts = enrichProductDisplayFields(waterfallProducts)
          const nextProducts = append
            ? [...(this.data.filteredProducts || []), ...enrichedProducts]
            : enrichedProducts
          const layoutResult = this._calculateWaterfallLayout(nextProducts)

          this.setData({
            filteredProducts: layoutResult.layoutProducts || [],
            containerHeight: layoutResult.containerHeight || 500,
            columnHeights: layoutResult.columnHeights || [0, 0],
            loading: false,
            loadingMore: false,
            currentPage: page,
            totalProducts: pagination.total || nextProducts.length,
            totalPages: pagination.total_pages || 1,
            pageInputValue: '',
            filtersCount: this._transformFiltersCount(response.data.filters_count || null)
          })
        } else {
          this.setData({ loading: false, loadingMore: false })
        }
      } catch (error) {
        luckyLog.error('筛选请求失', error)
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
        [`filteredProducts[${index}].image`]: luckyImageHelper.DEFAULT_PRODUCT_IMAGE,
        [`filteredProducts[${index}]._hasImage`]: false
      })
    },

    /**
     * 卡片按压涟漪效果
     * 通过 boundingClientRect 计算触点相对坐标
     */
    onCardTouchStart(e: any) {
      if (!this.properties.effects || !(this.properties.effects as any).ripple) {
        return
      }
      const touch = e.touches[0]
      if (!touch) {
        return
      }
      const cardIndex = e.currentTarget.dataset.cardIndex
      this.applyRipple(
        cardIndex,
        touch.clientX - (e.currentTarget.offsetLeft || 0),
        touch.clientY - (e.currentTarget.offsetTop || 0)
      )
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
