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
 * @version 1.0.0
 * @since 2026-02-21
 */

const { Constants: mktConstants } = require('../../utils/index')
const { getExchangeThemeStyle: getMarketThemeStyle } = require('../themes/exchange-themes')
const marketBehavior = require('./handlers/market-behavior')

const { PAGINATION: MKT_PAGINATION } = mktConstants

Component({
  behaviors: [marketBehavior],

  properties: {
    /** 可用积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 当前主题 */
    theme: { type: String, value: 'E' },
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
    /** 挂单数据 */
    products: [] as any[],
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
    myOnSaleCount: 0
  },

  lifetimes: {
    attached() {
      this.setData({
        pageSize: MKT_PAGINATION.GRID_SIZE || 20,
        marketThemeStyle: getMarketThemeStyle(this.properties.theme)
      })
    }
  },

  observers: {
    theme(themeName: string) {
      this.setData({ marketThemeStyle: getMarketThemeStyle(themeName) })
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
    }
  },

  methods: {}
})

export {}
