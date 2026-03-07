/**
 * 兑换页面 — 薄壳 Page Shell
 *
 * 组件化架构（对标 lottery 系统）：
 *   - exchange-shelf（packageExchange/）: 商品兑换 Tab（幸运空间/臻选空间/竞价）
 *   - exchange-market（packageExchange/）: 交易市场 Tab（C2C 挂单搜索/筛选/购买）
 *
 * Page 壳职责：
 *   1. 生命周期管理（onLoad/onShow/onHide/onUnload）
 *   2. MobX Store 绑定（userStore + pointsStore）
 *   3. 积分余额刷新（API → MobX → 下传 properties）
 *   4. Tab 切换（currentTab 控制 hidden 属性）
 *   5. 卡片主题配置（theme/effects/viewMode 由后端配置下发 → 下传 properties）
 *   6. WebSocket 订阅（refreshToken property 驱动子组件刷新）
 *   7. 兑换页面配置加载（4层降级策略）
 *
 * 决策D13: 使用 hidden 替代 wx:if，保留组件状态
 *
 * @file pages/exchange/exchange.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const app = getApp()

const { Utils, Logger, ExchangeConfig, ThemeCache, API, ImageHelper } = require('../../utils/index')
const log = Logger.createLogger('exchange')
const { checkAuth } = Utils

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

Page({
  data: {
    userInfo: {} as any,
    /** 可用积分（MobX + API 双源，保留用于兑换/购买余额校验） */
    totalPoints: 0,
    /** 冻结积分 */
    frozenPoints: 0,
    /** 钻石和水晶类资产余额列表（后端 GET /api/v4/assets/balances，过滤 DIAMOND + shard + crystal） */
    assetBalances: [] as any[],

    /** 当前 Tab 标识 'exchange' | 'market' */
    currentTab: 'exchange',
    /** 当前空间标识 'lucky' | 'premium'（传给 exchange-shelf） */
    currentSpace: 'lucky',

    /** Tab 配置列表（后端 exchange_page 配置下发） */
    tabs: [] as any[],

    /** 页面加载状态 */
    loading: true,
    refreshing: false,

    /** 卡片主题标识（全局氛围主题，由 ThemeCache 缓存管理器提供） */
    cardTheme: 'default',
    effects: {
      grain: true,
      holo: true,
      rotatingBorder: true,
      breathingGlow: true,
      ripple: true,
      fullbleed: true,
      listView: false
    } as any,
    viewMode: 'grid',

    /** 交易市场筛选配置（后端下发，传给 exchange-market） */
    marketTypeFilters: [] as any[],
    marketCategoryFilters: [] as any[],
    marketSortOptions: [] as any[],

    /** WebSocket 驱动的刷新令牌（值变化触发子组件 observer） */
    _shelfRefreshToken: 0,
    _marketRefreshToken: 0,
    _exchangeRateRefreshToken: 0
  },

  /** 页面加载 */
  async onLoad(_options: any) {
    log.info('兑换页面加载')

    this.userStoreBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })
    this.pointsStoreBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: { pointsBalance: () => pointsStore.availableAmount },
      actions: ['setBalance']
    })

    if (!checkAuth()) {
      return
    }

    Utils.restoreUserInfo()
    await this._loadExchangePageConfig()
    this._restoreThemePreferences()
    this.setData({ loading: false })
  },

  /** 页面显示（恢复积分 + WebSocket 连接 + 刷新主题） */
  async onShow() {
    log.info('兑换页面显示')

    if (!checkAuth()) {
      return
    }

    /* 每次 onShow 重新获取全局主题（后台静默更新或后端切换后生效） */
    const latestTheme = await ThemeCache.getThemeName()
    if (latestTheme !== this.data.cardTheme) {
      this.setData({ cardTheme: latestTheme })
    }

    const localUserInfo = userStore.ensureUserInfo()

    if (localUserInfo) {
      await this._refreshAllBalances(localUserInfo)
    } else {
      this.setData({ userInfo: {}, totalPoints: 0, assetBalances: [] })
    }

    this._connectWebSocket()
  },

  /** 页面隐藏 */
  onHide() {
    log.info('兑换页面隐藏')
    this._disconnectWebSocket()
  },

  /** 页面卸载 */
  onUnload() {
    log.info('兑换页面卸载')
    if ((this as any).userStoreBindings) {
      ;(this as any).userStoreBindings.destroyStoreBindings()
    }
    if ((this as any).pointsStoreBindings) {
      ;(this as any).pointsStoreBindings.destroyStoreBindings()
    }
    this._disconnectWebSocket()
  },

  /**
   * 加载兑换页面配置（4层降级：缓存→API→过期缓存→内置默认）
   * 配置来源: GET /api/v4/system/config/exchange-page
   */
  async _loadExchangePageConfig() {
    try {
      const exchangeConfig = await ExchangeConfig.ExchangeConfigCache.getConfig()
      log.info('兑换页面配置加载成功:', exchangeConfig.updated_at || '内置默认')

      const marketFilters = exchangeConfig.market_filters

      /* 全局氛围主题：异步获取（4层降级，确保首次加载也能拿到后端主题） */
      const globalThemeName = await ThemeCache.getThemeName()

      this.setData({
        tabs: exchangeConfig.tabs
          .filter((t: any) => t.enabled)
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
        marketTypeFilters: marketFilters.type_filters,
        marketCategoryFilters: marketFilters.category_filters,
        marketSortOptions: marketFilters.sort_options,
        cardTheme: globalThemeName,
        effects: exchangeConfig.card_display.effects,
        viewMode: exchangeConfig.card_display.default_view_mode || 'grid'
      })
    } catch (error) {
      log.error('加载兑换页面配置失败:', error)

      const fallback = ExchangeConfig.DEFAULT_EXCHANGE_CONFIG
      if (fallback) {
        const marketFilters = fallback.market_filters
        const fallbackTheme = await ThemeCache.getThemeName()
        this.setData({
          tabs: fallback.tabs.filter((t: any) => t.enabled),
          marketTypeFilters: marketFilters.type_filters,
          marketCategoryFilters: marketFilters.category_filters,
          marketSortOptions: marketFilters.sort_options,
          cardTheme: fallbackTheme,
          effects: fallback.card_display.effects,
          viewMode: fallback.card_display.default_view_mode || 'grid'
        })
      }
    }
  },

  /** 从后端 API 获取最新积分余额（委托 pointsStore.refreshFromAPI，消除重复逻辑） */
  async _refreshPointsBalance(localUserInfo: any) {
    try {
      const { available, frozen } = await pointsStore.refreshFromAPI()
      this.setData({ userInfo: localUserInfo, totalPoints: available, frozenPoints: frozen })
    } catch (error) {
      log.error('获取积分余额异常:', error)
      this.setData({ userInfo: localUserInfo, totalPoints: pointsStore.availableAmount || 0 })
    }
  },

  /**
   * 获取钻石和水晶类资产余额
   * 后端API: GET /api/v4/assets/balances
   * 过滤规则: DIAMOND + *_shard（碎片）+ *_crystal（水晶）
   */
  async _refreshAssetBalances() {
    try {
      const result = await API.getAssetBalances()
      if (result?.success && result.data) {
        /** 后端实际返回 { data: { balances: [...] } }，取 balances 数组 */
        const apiData = result.data
        const allBalances = apiData.balances || (Array.isArray(apiData) ? apiData : [])
        const diamondAndCrystalAssets = allBalances
          .filter((asset: any) => {
            const code = asset.asset_code || ''
            return code === 'DIAMOND' || code.endsWith('_shard') || code.endsWith('_crystal')
          })
          .map((asset: any) => ({
            asset_code: asset.asset_code,
            display_name:
              asset.display_name ||
              ImageHelper.getAssetDisplayName(asset.asset_code) ||
              asset.asset_code,
            available_amount: asset.available_amount || 0,
            frozen_amount: asset.frozen_amount || 0,
            total_amount: asset.total_amount || 0
          }))
        this.setData({ assetBalances: diamondAndCrystalAssets })
      }
    } catch (error) {
      log.error('获取资产余额失败:', error)
    }
  },

  /** 统一刷新所有余额（积分 + 钻石/水晶资产，并行请求） */
  async _refreshAllBalances(localUserInfo?: any) {
    const userInfo = localUserInfo || this.data.userInfo
    await Promise.all([this._refreshPointsBalance(userInfo), this._refreshAssetBalances()])
  },

  /** 连接 Socket.IO（订阅商品更新 → 递增 refreshToken 驱动子组件刷新） */
  _connectWebSocket() {
    const tokenStatus = Utils.checkTokenValidity()
    if (!tokenStatus.isValid) {
      log.warn('Token无效，跳过Socket.IO连接')
      return
    }

    try {
      app
        .connectWebSocket()
        .then(() => {
          app.subscribeWebSocketMessages('exchange', (eventName: string, _data: any) => {
            if (eventName === 'product_updated' || eventName === 'exchange_stock_changed') {
              log.info('收到商品更新通知')
              this.setData({
                _shelfRefreshToken: this.data._shelfRefreshToken + 1,
                _marketRefreshToken: this.data._marketRefreshToken + 1
              })
            }
            if (eventName === 'bid_outbid' || eventName === 'bid_won' || eventName === 'bid_lost') {
              log.info('收到竞价事件:', eventName)
              this.setData({ _shelfRefreshToken: this.data._shelfRefreshToken + 1 })
            }
          })
        })
        .catch((error: Error) => {
          log.warn('Socket.IO连接未就绪:', error.message)
        })
    } catch {
      log.warn('Socket.IO连接异常，不影响页面正常使用')
    }
  },

  /** 断开 Socket.IO */
  _disconnectWebSocket() {
    try {
      app.unsubscribeWebSocketMessages('exchange')
    } catch {
      log.warn('Socket.IO取消订阅异常')
    }
  },

  /** Tab 切换入口 */
  onTabChange(e: any) {
    const tabKey = e.currentTarget.dataset.tab
    if (!tabKey || tabKey === this.data.currentTab) {
      return
    }
    this.setData({ currentTab: tabKey })
    log.info('切换到Tab:', tabKey)
  },

  /** 下拉刷新 — 递增 refreshToken 驱动组件刷新 */
  onPullDownRefresh() {
    log.info('页面级下拉刷新')
    if (this.data.currentTab === 'exchange') {
      this.setData({ _shelfRefreshToken: this.data._shelfRefreshToken + 1 })
    } else if (this.data.currentTab === 'market') {
      this.setData({ _marketRefreshToken: this.data._marketRefreshToken + 1 })
    } else if (this.data.currentTab === 'exchange-rate') {
      this.setData({ _exchangeRateRefreshToken: this.data._exchangeRateRefreshToken + 1 })
    }
    this._refreshAllBalances(this.data.userInfo)
    wx.stopPullDownRefresh()
  },

  /** 兑换成功事件（exchange-shelf 触发） */
  async onExchangeSuccess(_e: any) {
    log.info('兑换成功，刷新余额')
    await this._refreshAllBalances()
  },

  /** 购买成功事件（exchange-market 触发） */
  async onPurchaseSuccess(_e: any) {
    log.info('购买成功，刷新余额')
    await this._refreshAllBalances()
  },

  /** 汇率兑换成功事件（exchange-rate 触发） */
  async onExchangeRateSuccess(_e: any) {
    log.info('汇率兑换成功，刷新余额')
    await this._refreshAllBalances()
  },

  /** 资产变动事件（两个组件共用） */
  async onPointsUpdate() {
    await this._refreshAllBalances()
  },

  /** 认证错误事件（组件遇401时触发） */
  onAuthError() {
    log.info('收到认证错误事件，清理Token并跳转登录')
    app.clearAuthData()
    wx.reLaunch({ url: '/packageUser/auth/auth' })
  },

  /** 视图模式切换事件（组件内联按钮触发） */
  onViewModeChange(e: any) {
    const targetMode = e.detail && e.detail.mode
    if (!targetMode || targetMode === this.data.viewMode) {
      return
    }
    this.setData({ viewMode: targetMode })
    try {
      wx.setStorageSync('exchange_view_mode', targetMode)
    } catch {
      log.warn('视图模式持久化失败')
    }
    log.info('视图模式切换:', targetMode)
  },

  /**
   * 从本地 Storage 恢复用户主题偏好
   * 优先使用用户本地偏好覆盖后端默认配置
   */
  _restoreThemePreferences() {
    try {
      const savedViewMode = wx.getStorageSync('exchange_view_mode')
      if (savedViewMode && (savedViewMode === 'grid' || savedViewMode === 'list')) {
        this.setData({ viewMode: savedViewMode })
        log.info('恢复用户视图模式偏好:', savedViewMode)
      }
    } catch {
      log.warn('恢复主题偏好失败，使用后端默认配置')
    }
  }
})
