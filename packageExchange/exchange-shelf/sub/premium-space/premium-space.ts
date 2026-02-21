/**
 * 臻选空间子组件 — 决策D12: 子组件自行管理分页状态
 *
 * 包含：臻选商品加载、双列网格布局、分页
 * 后端API: GET /api/v4/backpack/exchange/items?space=premium
 *
 * @file packageExchange/exchange-shelf/sub/premium-space/premium-space.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

const {
  API: premiumAPI,
  Logger: premiumLogger,
  Constants: premiumConstants
} = require('../../../../utils/index')
const premiumLog = premiumLogger.createLogger('premium-space')
const {
  getExchangeProducts: premiumGetExchangeProducts,
  getExchangeSpaceStats: premiumGetExchangeSpaceStats
} = premiumAPI
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
    premiumUnlocked: { type: Boolean, value: false }
  },

  data: {
    loading: true,
    /** 全部商品 */
    allProducts: [] as any[],
    /** 当前页展示商品 */
    filteredProducts: [] as any[],
    /** 分页 */
    currentPage: 1,
    totalPages: 1,
    pageSize: 0,
    totalProducts: 0,
    pageInputValue: '',
    /** 空间统计 */
    spaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 }
  },

  lifetimes: {
    attached() {
      this.setData({ pageSize: PREMIUM_PAGINATION.GRID_SIZE })
      this.initData()
    }
  },

  methods: {
    /**
     * 初始化臻选空间数据
     * 后端API: GET /api/v4/backpack/exchange/items?space=premium
     */
    async initData() {
      premiumLog.info('初始化臻选空间数据...')

      try {
        this.setData({ loading: true })

        const [exchangeResponse, premiumStatsResponse] = await Promise.all([
          premiumGetExchangeProducts({ space: 'premium', page: 1, page_size: 30 }),
          premiumGetExchangeSpaceStats('premium')
        ])

        if (exchangeResponse && exchangeResponse.success && exchangeResponse.data) {
          const rawItems = exchangeResponse.data.items || []

          const items = rawItems.filter((item: any, idx: number) => {
            if (!item || typeof item !== 'object') {
              return false
            }
            if (!item.id) {
              premiumLog.error(`第${idx}个商品缺少 id（DataSanitizer 脱敏后的主键）`)
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

          this.setData({
            allProducts: items,
            spaceStats: premiumStats,
            loading: false,
            currentPage: 1,
            pageInputValue: ''
          })

          this._calculateTotalPages()
          this._loadCurrentPageProducts()
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

    /** 计算总页数 */
    _calculateTotalPages() {
      const { allProducts, pageSize } = this.data
      const products = allProducts || []
      const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
      this.setData({ totalPages, totalProducts: products.length })
    },

    /** 加载当前页商品数据（双列网格布局） */
    _loadCurrentPageProducts() {
      const { allProducts, currentPage, pageSize } = this.data
      const products = allProducts || []
      const startIndex = (currentPage - 1) * pageSize
      const endIndex = Math.min(startIndex + pageSize, products.length)
      const currentPageProducts = products.slice(startIndex, endIndex)

      const enrichedProducts = enrichProductDisplayFields(
        currentPageProducts.map((item: any) => ({
          id: item.id,
          name: item.name || '',
          description: item.description || '',
          image:
            (item.primary_image && (item.primary_image.url || item.primary_image.thumbnail_url)) ||
            '/images/products/default-product.png',
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
          free_shipping: item.free_shipping || false
        }))
      )

      this.setData({ filteredProducts: enrichedProducts })
    },

    /** pagination组件统一分页事件处理 */
    onPaginationChange(e: any) {
      const targetPage = e.detail.page
      if (targetPage !== this.data.currentPage) {
        this.setData({ currentPage: targetPage, pageInputValue: '' })
        this._loadCurrentPageProducts()
      }
    },

    /** 按售价排序（外部调用） */
    sortByPrice() {
      const sorted = [...(this.data.filteredProducts || [])].sort(
        (a: any, b: any) => (a.cost_amount || 0) - (b.cost_amount || 0)
      )
      this.setData({ filteredProducts: sorted })
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
