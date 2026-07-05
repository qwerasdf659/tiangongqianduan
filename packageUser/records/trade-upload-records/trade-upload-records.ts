/**
 * 📊 trade-upload-records.ts - 资产明细页面（多资产流水，按资产 Tab 切换）
 *
 * 业务定位（资产/积分/消费三页分家后）：
 *   本页只管「非积分资产」流水（星石 / 红源晶碎片 / 各色源晶等），按资产 Tab 切换，
 *   每个 Tab 调 GET /assets/transactions?asset_code=xxx 只显示该资产流水。
 *   - 积分流水 → 「积分明细」页（points-detail）
 *   - 消费记录 → 「消费记录」页（consumption-records）
 *
 * 资产名/图标读后端字典 display_name/icon_url（对接文档《资产明细页-资产区分》§4.3，零映射）。
 *
 * API依赖:
 *   - API.getAssetBalances()      GET /api/v4/assets/balances（资产 Tab 数据源 + 余额）
 *   - API.getPointsTransactions() GET /api/v4/assets/transactions?asset_code=xxx（资产流水）
 *
 * @since 2026-06-29（资产/积分/消费三页分家）
 */

const { API, Utils, Wechat, Logger } = require('../../../utils/index')
const log = Logger.createLogger('asset-detail')
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')
const { checkAuth, getBeijingDateRange } = Utils
const { showToast } = Wechat

/**
 * 内部记账资产 + 积分黑名单（资产明细页只展示非积分用户资产）：
 *   budget_points / star_stone_quota 为系统内部记账资产，禁止前端展示；
 *   points（积分）有独立「积分明细」页，本页不重复展示。
 */
const EXCLUDED_ASSET_CODES = ['budget_points', 'star_stone_quota', 'points']

/**
 * 安全转换时间字段为字符串（防止 Sequelize Date 对象导致 [object Object]）
 */
function safeTimeString(value: any): string {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'object') {
    if (typeof value.toISOString === 'function') {
      return value.toISOString()
    }
    if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
      return value.toString()
    }
    if (value.val) {
      return String(value.val)
    }
    if (value.date) {
      return String(value.date)
    }
  }
  return String(value)
}

Page({
  data: {
    isLoggedIn: false,

    // ===== 资产 Tab（来自 /balances，过滤内部记账资产 + 积分）=====
    /** 资产 Tab 列表（元素含 asset_code/display_name/icon_url/available_amount） */
    assetTabs: [] as any[],
    /** 当前选中资产代码（小写，如 star_stone/red_core_shard） */
    currentAssetCode: '',
    /** 当前资产中文名（金额后缀/余额卡用，读 display_name） */
    currentAssetName: '',
    /** 当前资产图标 URL（余额卡展示，空则不渲染） */
    currentAssetIconUrl: '',
    /** 当前资产可用余额（按 Tab 对应资产） */
    currentAssetBalance: 0,

    // ===== 交易记录（按当前资产 asset_code 过滤，后端分页 + 后端日期筛选）=====
    transactionRecords: [] as any[],
    /** 交易记录-当前页展示数据（后端分页 + 本页内方向/关键词本地过滤后） */
    filteredRecords: [] as any[],
    /** 交易记录-当前页码（后端分页，1 基） */
    tradePage: 1,
    /** 交易记录-总页数（以后端 pagination.total_pages 为准） */
    tradeTotalPages: 1,
    /** 交易记录-总条数（以后端 pagination.total 为准，渲染「共 N 条」） */
    tradeTotal: 0,
    /** 交易记录-每页条数 */
    tradePageSize: 20,
    // 筛选条件
    currentTimeFilter: 'all',
    currentTypeFilter: 'all',
    searchKeyword: '',

    /** 来源页面筛选（如 asset_convert → 仅显示资产转换相关流水） */
    sourceFilter: '' as string,

    // 页面状态
    loading: true,
    refreshing: false,
    initialized: false
  },

  onLoad(options: Record<string, string>) {
    log.info('资产明细页面加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userId'],
      actions: []
    })

    /**
     * 来源筛选: source=asset_convert 时仅显示资产转换相关的交易流水
     * 对应后端 business_type: asset_convert_debit / asset_convert_credit
     */
    if (options.source) {
      this.setData({ sourceFilter: options.source })
    }

    const titleMap: Record<string, string> = {
      asset_convert: '转换记录'
    }
    wx.setNavigationBarTitle({
      title: titleMap[options.source || ''] || '资产明细'
    })
  },

  onShow() {
    log.info('资产明细页面显示')
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })

    if (!this.data.initialized) {
      this.initializePage()
    } else {
      this.refreshCurrentAsset()
    }
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  /** 首次进入：加载资产 Tab → 加载当前资产流水 */
  async initializePage() {
    try {
      await this.loadAssetTabs()
      await this.loadTransactionData()
    } catch (error) {
      log.error('资产明细页面初始化失败', error)
      showToast('页面加载失败')
    } finally {
      this.setData({ loading: false, initialized: true })
    }
  },

  /** 静默刷新当前资产（返回本页/下拉刷新时调用） */
  async refreshCurrentAsset() {
    this.setData({ refreshing: true })
    try {
      await this.loadAssetTabs()
      await this.loadTransactionData()
    } finally {
      this.setData({ refreshing: false })
    }
  },

  /**
   * 加载资产 Tab 数据源 - GET /api/v4/assets/balances
   *
   * 过滤内部记账资产 + 积分，资产名/图标读后端 display_name/icon_url（零映射）。
   * 默认选第一个可展示资产；刷新时保留当前已选资产。
   */
  async loadAssetTabs() {
    try {
      const result = await API.getAssetBalances()
      if (!result?.success || !result.data) {
        return
      }
      const apiBalances = result.data.balances || []
      const visibleTabs = apiBalances
        .filter((asset: any) => !EXCLUDED_ASSET_CODES.includes(asset.asset_code))
        .map((asset: any) => ({
          asset_code: asset.asset_code,
          display_name: asset.display_name || asset.asset_code,
          icon_url: asset.icon_url || '',
          available_amount: asset.available_amount || 0
        }))

      if (visibleTabs.length === 0) {
        this.setData({ assetTabs: [] })
        return
      }

      // 保留当前已选资产（刷新场景）；首次进入默认第一个
      const keepCode = this.data.currentAssetCode
      const selectedTab = visibleTabs.find((t: any) => t.asset_code === keepCode) || visibleTabs[0]

      this.setData({
        assetTabs: visibleTabs,
        currentAssetCode: selectedTab.asset_code,
        currentAssetName: selectedTab.display_name,
        currentAssetIconUrl: selectedTab.icon_url,
        currentAssetBalance: selectedTab.available_amount
      })
    } catch (tabError: any) {
      log.warn('加载资产 Tab 失败:', tabError?.message)
    }
  },

  /**
   * 资产 Tab 切换（顶部「星石/红源晶碎片...」）
   * 切换后更新当前资产信息 → 重置筛选/分页 → 重拉该资产流水。
   */
  onAssetTabChange(e: any) {
    const nextAssetCode = e.detail?.value ?? e.currentTarget?.dataset?.code
    if (!nextAssetCode || nextAssetCode === this.data.currentAssetCode) {
      return
    }
    const matchedTab = this.data.assetTabs.find((t: any) => t.asset_code === nextAssetCode)
    if (!matchedTab) {
      return
    }
    this.setData({
      currentAssetCode: matchedTab.asset_code,
      currentAssetName: matchedTab.display_name,
      currentAssetIconUrl: matchedTab.icon_url,
      currentAssetBalance: matchedTab.available_amount,
      currentTimeFilter: 'all',
      currentTypeFilter: 'all',
      searchKeyword: '',
      tradePage: 1,
      transactionRecords: [],
      filteredRecords: []
    })
    this.loadTransactionData(1)
  },

  /**
   * 加载交易数据 - GET /api/v4/assets/transactions?asset_code=xxx
   *
   * 按当前资产 asset_code + 时间区间（北京时区换算的 UTC start_date/end_date）筛选，
   * 由后端在 DB 层范围筛选 + 分页（跨页准确）。日期/分页完全交给后端，前端不再本地日期过滤。
   *
   * @param page 目标页码（默认 1；翻页时传入）
   */
  async loadTransactionData(page: number = 1) {
    if (!this.data.currentAssetCode) {
      // 无可展示资产时清空
      this.setData({
        transactionRecords: [],
        filteredRecords: [],
        tradeTotal: 0,
        tradeTotalPages: 1
      })
      return
    }
    try {
      const sourceBusinessTypeMap: Record<string, string> = {
        asset_convert: 'asset_convert_debit,asset_convert_credit'
      }
      const businessTypeParam = sourceBusinessTypeMap[this.data.sourceFilter] || null
      /* 当前时间 Tab 换算成北京时区的 UTC 区间（'all' 返回 {}，不传日期=全部） */
      const { start_date = null, end_date = null } = getBeijingDateRange(
        this.data.currentTimeFilter
      )
      // 按资产 + 时间区间 + 页码请求（后端 DB 层筛选 + 分页）
      const result = await API.getPointsTransactions(
        page,
        this.data.tradePageSize,
        this.data.currentAssetCode,
        businessTypeParam,
        start_date,
        end_date
      )
      const { success, data } = result

      if (success && data) {
        const { transactions = [], pagination = {} } = data

        const processedRecords = transactions.map((record: any) => {
          const rawDeltaAmount = record.delta_amount || 0
          return {
            ...record,
            /**
             * 列表项标题：优先后端中文业务类型 business_type_display（后端已映射、必有值），
             * 回退 description（meta 描述，大量为 null 不可作主依赖），最终兜底「交易记录」。
             * snake_case 零映射，直读后端字段，前端不再自维护机器码→中文表（避免与后端漂移）。
             */
            displayTitle: record.business_type_display || record.description || '交易记录',
            // 资产中文名直接用当前 Tab 资产名（本页已按 asset_code 过滤，同资产同名）
            displayAssetName: this.data.currentAssetName || record.asset_code || '',
            category: rawDeltaAmount > 0 ? 'income' : 'expense',
            created_at: safeTimeString(record.created_at)
          }
        })

        /* 分页信息以后端 pagination 为准（该时间范围内的真实总数/页数） */
        this.setData({
          transactionRecords: processedRecords,
          tradePage: pagination.page || page,
          tradeTotal: pagination.total || 0,
          tradeTotalPages: pagination.total_pages || 1
        })
        this.applyFilters()
      } else {
        this.setData({
          transactionRecords: [],
          filteredRecords: [],
          tradeTotal: 0,
          tradeTotalPages: 1
        })
        showToast('交易记录加载失败')
      }
    } catch (error) {
      log.error('加载交易记录失败:', error)
      this.setData({
        transactionRecords: [],
        filteredRecords: [],
        tradeTotal: 0,
        tradeTotalPages: 1
      })
      showToast('交易记录加载失败')
    }
  },

  /**
   * 应用「当前页内」的本地辅助过滤（方向 / 关键词）
   *
   * ⚠️ 时间筛选与分页已完全交给后端（start_date/end_date + DB 层分页），此处不再做任何本地日期过滤。
   * 方向(income/expense)与关键词后端接口暂无对应参数，仅对「后端返回的当前页」做展示层过滤，
   * 不改变后端分页 total（共 N 条仍以后端为准）。
   */
  applyFilters() {
    let filteredRecords = [...this.data.transactionRecords]

    if (this.data.currentTypeFilter !== 'all') {
      if (this.data.currentTypeFilter === 'income') {
        filteredRecords = filteredRecords.filter((record: any) => record.category === 'income')
      } else if (this.data.currentTypeFilter === 'expense') {
        filteredRecords = filteredRecords.filter((record: any) => record.category === 'expense')
      } else {
        filteredRecords = filteredRecords.filter(
          (record: any) => record.business_type === this.data.currentTypeFilter
        )
      }
    }

    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredRecords = filteredRecords.filter(
        (record: any) =>
          (record.displayTitle && record.displayTitle.toLowerCase().includes(keyword)) ||
          (record.description && record.description.toLowerCase().includes(keyword)) ||
          (record.asset_transaction_id && String(record.asset_transaction_id).includes(keyword))
      )
    }

    this.setData({ filteredRecords })
  },

  /** 交易记录翻页（后端分页）：带当前时间区间请求目标页 */
  onTradePagerChange(e: any) {
    const page = e.detail && e.detail.page
    if (!page) {
      return
    }
    this.loadTransactionData(page)
  },

  /** 时间筛选事件：切「全部/今天/本周/本月」→ 回到第 1 页、带新时间区间重新请求后端 */
  onTimeFilter(e: WechatMiniprogram.BaseEvent) {
    const timeFilter = e.currentTarget.dataset.filter
    if (timeFilter === this.data.currentTimeFilter) {
      return
    }
    this.setData({ currentTimeFilter: timeFilter, tradePage: 1 })
    this.loadTransactionData(1)
  },

  /** 🔴 搜索输入（防抖500ms） */
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.applyFilters()
    }, 500)
  },

  /** 🔴 重置筛选条件：时间回「全部」需重新请求后端，方向/关键词本地清除 */
  onResetFilters() {
    const needReload = this.data.currentTimeFilter !== 'all'
    this.setData({
      currentTimeFilter: 'all',
      currentTypeFilter: 'all',
      searchKeyword: '',
      tradePage: 1
    })
    if (needReload) {
      this.loadTransactionData(1)
    } else {
      this.applyFilters()
    }
  },

  /** 🔴 查看交易详情 */
  onViewDetail(e: WechatMiniprogram.BaseEvent) {
    const record = e.currentTarget.dataset.record
    if (!record) {
      return
    }
    const deltaAmount = record.delta_amount || 0
    const amountDisplay = deltaAmount > 0 ? `+${deltaAmount}` : `${deltaAmount}`
    const assetName = record.displayAssetName || record.asset_code || ''

    wx.showModal({
      title: '交易详情',
      content: `交易类型：${record.displayTitle || '交易记录'}\n交易金额：${amountDisplay} ${assetName}\n交易时间：${record.created_at || '未知'}\n交易ID：${record.asset_transaction_id || '无'}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /** 跳转到活动页面（空状态引导） */
  goToActivity() {
    wx.switchTab({ url: '/pages/lottery/lottery' })
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    await this.refreshCurrentAsset()
    wx.stopPullDownRefresh()
  },

  onShareAppMessage() {
    return {
      title: '我的资产明细',
      path: '/packageUser/records/trade-upload-records/trade-upload-records'
    }
  }
})
