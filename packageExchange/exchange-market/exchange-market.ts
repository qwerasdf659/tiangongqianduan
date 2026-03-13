/**
 * 交易市场组件 — C2C 用户交易市场
 *
 * 职责：
 *   1. 管理交易市场挂单列表的搜索/筛选/分页
 *   2. 处理购买确认和结果弹窗
 *   3. 通过 CSS 变量注入主题
 *   4. 通过 triggerEvent 通知 Page 壳
 *
 * 后端API: GET /api/v4/market/listings
 *
 * @file packageExchange/exchange-market/exchange-market.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const { Constants: mktConstants, GlobalTheme: mktGlobalTheme } = require('../../utils/index')
const marketBehavior = require('./handlers/market-behavior')

const { PAGINATION: MKT_PAGINATION } = mktConstants

Component({
  behaviors: [marketBehavior],

  properties: {
    /** 可用积分余额（保留用于购买校验） */
    pointsBalance: { type: Number, value: 0 },
    /** 钻石和水晶类资产余额列表（Page 壳从 API.getAssetBalances 获取后下传） */
    assetBalances: { type: Array, value: [] },
    /** 全局氛围主题标识（如 'default' / 'gold_luxury'，由 Page 壳从 ThemeCache 获取后下传） */
    theme: { type: String, value: 'default' },
    /** 增强效果配置 */
    effects: { type: Object, value: {} },
    /** 视图模式 */
    viewMode: { type: String, value: 'grid' },
    /** 刷新令牌 */
    refreshToken: { type: Number, value: 0 },
    /** 组件是否激活 */
    active: { type: Boolean, value: false },
    /** 交易市场筛选项（后端下发） */
    marketTypeFilters: { type: Array, value: [] },
    marketCategoryFilters: { type: Array, value: [] },
    marketSortOptions: { type: Array, value: [] }
  },

  data: {
    /** CSS 变量主题样式 */
    marketThemeStyle: '',
    /** 挂单数据（服务端筛选结果） */
    filteredProducts: [] as any[],
    /** 筛选状态 */
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
    /** 加载状态 */
    loading: true,
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

    /** 我的交易管理 — 在售挂单数量（来自 GET /api/v4/market/listing-status） */
    myOnSaleCount: 0,

    /** 价格走势图（默认收起，用户手动展开） */
    showPriceChart: false,
    chartAssetCode: 'red_shard',

    /** 购买确认弹窗：选中商品对应的资产余额 */
    selectedProductBalance: 0,
    /** 购买确认弹窗：选中商品对应的资产名称 */
    selectedProductBalanceLabel: ''
  },

  lifetimes: {
    attached() {
      this.setData({
        pageSize: MKT_PAGINATION.GRID_SIZE || 20,
        marketThemeStyle: mktGlobalTheme.getGlobalThemeStyle(this.properties.theme)
      })
    }
  },

  observers: {
    theme(themeName: string) {
      this.setData({ marketThemeStyle: mktGlobalTheme.getGlobalThemeStyle(themeName) })
    },
    refreshToken(val: number) {
      if (val > 0) {
        this.loadProducts()
        this.loadMyListingStatus()
      }
    },
    active(isActive: boolean) {
      if (isActive && (!this.data.products || this.data.products.length === 0)) {
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
    /** 切换价格走势图显示/隐藏 */
    onTogglePriceChart() {
      this.setData({ showPriceChart: !this.data.showPriceChart })
    },

    /**
     * 根据选中商品的 price_asset_code 从 assetBalances 中查找对应资产余额
     * 用于购买确认弹窗展示 "当前余额: X 钻石" 而非固定的 "X 积分"
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
      } else if (product.price_asset_code === 'POINTS') {
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
