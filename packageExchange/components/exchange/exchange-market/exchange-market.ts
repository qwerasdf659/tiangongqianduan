/**
 * 交易市场组件 C2C 用户交易市场
 *
 * 职责 *   1. 管理交易市场挂单列表的搜筛分页
 *   2. 处理购买确认和结果弹 *   3. 通过 CSS 变量注入样式配置
 *   4. 通过 triggerEvent 通知 Page  *
 * 后端API: GET /api/v4/marketplace/listings
 *
 * @file components/exchange/exchange-market/exchange-market.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const { Constants: mktConstants, AssetCodes: mktAssetCodes } = require('../../../../utils/index')
const marketBehavior = require('./handlers/market-behavior')

const { PAGINATION: MKT_PAGINATION } = mktConstants

Component({
  behaviors: [marketBehavior],

  properties: {
    /** 可用积分余额（保留用于购买校验） */
    pointsBalance: { type: Number, value: 0 },
    /** 星石和源晶类资产余额列表（Page 壳从 API.getAssetBalances 获取后下传） */
    assetBalances: { type: Array, value: [] },
    /** 增强效果配置 */
    effects: { type: Object, value: {} },
    /** 视图模式 */
    viewMode: { type: String, value: 'grid' },
    /** 刷新令牌 */
    refreshToken: { type: Number, value: 0 },
    /** 组件是否激*/
    active: { type: Boolean, value: false },
    /** 交易市场筛选项（后端下发） */
    marketTypeFilters: { type: Array, value: [] },
    marketCategoryFilters: { type: Array, value: [] },
    marketSortOptions: { type: Array, value: [] }
  },

  data: {
    /** 挂单数据（服务端筛选结果） */
    filteredProducts: [] as any[],
    /** 筛选状*/
    searchKeyword: '',
    currentFilter: 'all',
    categoryFilter: 'all',
    sortBy: 'default',
    showAdvancedFilter: false,
    /** 分页 */
    currentPage: 1,
    totalPages: 1,
    pageSize: 0,
    totalCount: 0,
    /** 加载状*/
    loading: true,
    loadingMore: false,
    /** 购买弹窗 */
    showConfirm: false,
    selectedProduct: null as any,
    purchasing: false,
    /** 购买结果弹窗 */
    showResult: false,
    resultData: null as any,
    /** 担保码输入弹窗（Phase 4：买方确认收货） */
    showEscrowInput: false,
    escrowInputCode: '',
    escrowTradeOrderId: 0,
    escrowSubmitting: false,

    /** 我的交易管理 在售挂单数量（来GET /api/v4/marketplace/listing-status*/
    myOnSaleCount: 0,

    /** 价格走势图（默认收起，用户手动展开*/
    showPriceChart: false,
    chartAssetCode: mktAssetCodes.RED_CORE_SHARD,

    /** 高级筛选参数（对齐独立市场页面 market.ts*/
    filterCategoryCode: '',
    filterRarityCode: '',
    filterAssetGroupCode: '',
    filterAssetCode: '',
    filterMinPrice: '',
    filterMaxPrice: '',
    filterQualityGrade: '',

    /** 筛选维度数据（后端 GET /api/v4/marketplace/listings/facets 返回*/
    facetsData: null as any,
    facetsLoaded: false,

    /** 筛选维度聚合计数（后端 with_counts=true 返回filters_count*/
    filtersCount: null as any,

    /** 购买确认弹窗：选中商品对应的资产余*/
    selectedProductBalance: 0,
    /** 购买确认弹窗：选中商品对应的资产名*/
    selectedProductBalanceLabel: ''
  },

  lifetimes: {
    attached() {
      this.setData({
        pageSize: MKT_PAGINATION.GRID_SIZE || 20
      })
    }
  },

  observers: {
    refreshToken(val: number) {
      if (val > 0) {
        this.loadProducts()
        this.loadMyListingStatus()
      }
    },
    active(isActive: boolean) {
      if (isActive && (!this.data.filteredProducts || this.data.filteredProducts.length === 0)) {
        this.initFilters()
        this.loadProducts()
      }
      if (isActive) {
        this.loadMyListingStatus()
      }
    },
    /** 选中商品变更时，查找对应资产余额用于购买确认弹窗展示 */
    selectedProduct(product: any) {
      this._computeSelectedProductBalance(product)
    }
  },

  methods: {
    /** 切换价格走势图显隐藏 */
    onTogglePriceChart() {
      this.setData({ showPriceChart: !this.data.showPriceChart })
    },

    /**
     * 根据选中商品price_asset_code assetBalances 中查找对应资产余     * 用于购买确认弹窗展示 "当前余额: X 星石" 而非固定"X 积分"
     */
    _computeSelectedProductBalance(product: any) {
      if (!product || !product.price_asset_code) {
        return
      }
      const balances = this.data.assetBalances || []
      const match = (balances as any[]).find((a: any) => a.asset_code === product.price_asset_code)
      if (match) {
        this.setData({
          selectedProductBalance: match.available_amount,
          selectedProductBalanceLabel: match.display_name
        })
      } else if (product.price_asset_code === mktAssetCodes.POINTS) {
        this.setData({
          selectedProductBalance: this.properties.pointsBalance,
          selectedProductBalanceLabel: '积分'
        })
      } else {
        this.setData({
          selectedProductBalance: 0,
          selectedProductBalanceLabel: product._priceLabel || product.price_asset_code
        })
      }
    }
  }
})
