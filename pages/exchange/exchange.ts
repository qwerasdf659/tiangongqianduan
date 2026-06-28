/**
 * 兑换页面 — 薄壳 Page Shell
 *
 * 组件化架构（对标 lottery 系统）：
 *   - exchange-shelf（packageExchange/）: 商品兑换 Tab（幸运空间/臻选空间/竞价）
 *   - asset-conversion（packageExchange/）: 资产转换 Tab（后端tab key仍为exchange-rate）
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

const {
  Utils,
  Logger,
  ExchangeConfig,
  API,
  ImageHelper,
  AssetCodes,
  TopBanner
} = require('../../utils/index')
const log = Logger.createLogger('exchange')
const { checkAuth } = Utils
/** 资产分类辅助函数 — 判断 asset_code 是否为可兑换资产 */
const assetCodesHelper = AssetCodes

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

Page({
  data: {
    userInfo: {} as any,
    /** 可用积分（MobX + API 双源，保留用于兑换/购买余额校验） */
    totalPoints: 0,
    /** 登录弹窗 */
    loginPopupVisible: false,

    // 顶部沉浸式横幅（运营可配，后端 ad-delivery?slot_type=top_banner&position=exchange）
    // 仅当运营配置了内容时才显示，无配置则不占位、商城页布局保持原样（零布局冲击）
    /** 顶部 Banner 投放项 */
    topBannerItems: [] as API.AdDeliveryItem[],
    /** 顶部 Banner 是否轮播（后端槽位级 is_carousel） */
    topBannerCarousel: false,
    /** 顶部 Banner 轮播间隔毫秒（后端槽位级 slide_interval_ms） */
    topBannerInterval: 3000,
    /** 是否有运营配置的顶部 Banner 图（false 时不渲染该区域） */
    topBannerReady: false,
    /** 星石和源晶类资产余额列表（后端 GET /api/v4/assets/balances，过滤 star_stone + core_shard + core_gem） */
    assetBalances: [] as any[],

    /** 当前 Tab 标识 'exchange'(商品兑换) | 'exchange-rate'(资产转换) | 'prop'(道具商城·星石轨) */
    currentTab: 'exchange',
    /** 当前空间标识 'lucky' | 'premium'（传给 exchange-shelf） */
    currentSpace: 'lucky',

    /** Tab 配置列表（后端 exchange_page 配置下发） */
    tabs: [] as any[],

    /** 页面加载状态 */
    loading: true,
    refreshing: false,
    hasConfigError: false,
    configErrorMessage: '',

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

    /** WebSocket 驱动的刷新令牌（值变化触发子组件 observer） */
    _shelfRefreshToken: 0,
    _exchangeRateRefreshToken: 0,
    /** 道具商城（星石轨）刷新令牌 */
    _propsMallRefreshToken: 0,

    /** 回到顶部：道具商城 Tab 滚动超阈值时显示按钮；scrollIntoView 锚点驱动归零 */
    showBackToTop: false,
    pageScrollIntoView: ''
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

    // 未登录也允许浏览，加载页面配置
    if (checkAuth({ redirect: false })) {
      Utils.restoreUserInfo()
    }
    try {
      await this._loadExchangePageConfig()
      this._restoreThemePreferences()
    } catch (configError) {
      log.error('兑换页面配置加载异常，页面将显示错误提示:', configError)
    }
    this.setData({ loading: false })

    /* 顶部 Banner 运营投放（独立加载，失败/空不影响商城主功能与布局） */
    this.loadTopBanner()
  },

  /** 加载顶部 Banner（复用 TopBanner 共享逻辑，无配置则不渲染该区域） */
  async loadTopBanner() {
    const result = await TopBanner.loadTopBanner('exchange')
    this.setData(result)
  },

  /** 顶部 Banner 点击（复用 TopBanner 跳转 + 上报） */
  onTopBannerTap(e: any) {
    if (!this.data.topBannerReady) {
      return
    }
    const tapIndex = Number(e?.currentTarget?.dataset?.index) || 0
    TopBanner.handleTopBannerTap(this.data.topBannerItems[tapIndex], 'exchange')
  },

  /** 顶部 Banner 轮播切换（swiper bindchange）：对切入的当前张补报曝光 */
  onTopBannerChange(e: any) {
    const currentIndex = Number(e?.detail?.current) || 0
    TopBanner.handleTopBannerChange(this.data.topBannerItems, currentIndex, 'exchange')
  },

  /** 顶部 Banner 图片加载失败（<image> binderror）：打印失败 URL 与错误详情，便于定位 */
  onTopBannerImageError(e: any) {
    const errIndex = Number(e?.currentTarget?.dataset?.index) || 0
    TopBanner.handleTopBannerImageError(this.data.topBannerItems[errIndex], 'exchange', e?.detail)
  },

  /** 页面显示（恢复积分 + WebSocket 连接 + 刷新样式配置） */
  async onShow() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 2 })
      }
    }
    log.info('兑换页面显示')

    // 未登录允许浏览，不强制跳转
    if (!checkAuth({ redirect: false })) {
      this.applyNativeThemeColors()
      return
    }

    if (this.data.loginPopupVisible) {
      this.setData({ loginPopupVisible: false })
    }

    this.applyNativeThemeColors()

    const localUserInfo = userStore.ensureUserInfo()

    if (localUserInfo) {
      await this._refreshAllBalances(localUserInfo)
    } else {
      this.setData({ userInfo: {}, totalPoints: 0, assetBalances: [] })
    }

    /**
     * 兑换详情页返回后刷新商品列表
     * exchange-detail 兑换成功时设置 globalData._exchangeOccurred = true
     * 此处消费标志并递增 refreshToken 触发 exchange-shelf 刷新商品数据
     */
    const appInstance = getApp()
    if (appInstance && appInstance.globalData && appInstance.globalData._exchangeOccurred) {
      appInstance.globalData._exchangeOccurred = false
      this.setData({
        _shelfRefreshToken: this.data._shelfRefreshToken + 1,
        _propsMallRefreshToken: this.data._propsMallRefreshToken + 1
      })
      this._lastListRefreshAt = Date.now()
      log.info('检测到兑换详情页返回，刷新商品列表')
    } else if (
      appInstance &&
      appInstance.globalData &&
      appInstance.globalData._exchangeItemUnavailableId
    ) {
      /**
       * 方案二：详情页发现商品已下架/删除时设置 _exchangeItemUnavailableId，
       * 返回列表后强制刷新（refresh=true 跳后端缓存），该商品自然从列表消失。
       */
      appInstance.globalData._exchangeItemUnavailableId = 0
      const shelf = this.selectComponent('#exchange-shelf')
      if (shelf && typeof shelf.forceRefresh === 'function') {
        shelf.forceRefresh()
      } else {
        this.setData({ _shelfRefreshToken: this.data._shelfRefreshToken + 1 })
      }
      this._lastListRefreshAt = Date.now()
      log.info('检测到商品已下架/删除，强制刷新列表移除该项')
    } else {
      /**
       * 方案一：每次回到列表页自动拉最新（已下架/删除商品自动消失）。
       * 节流 10s：onShow 距上次刷新很近则跳过，避免频繁请求；走后端 60s 缓存即可。
       */
      const now = Date.now()
      if (!this._lastListRefreshAt || now - this._lastListRefreshAt >= 10000) {
        this.setData({ _shelfRefreshToken: this.data._shelfRefreshToken + 1 })
        this._lastListRefreshAt = now
        log.info('返回兑换列表，自动刷新最新商品')
      }
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
   * 加载兑换页面配置（仅接受后端真实配置或已缓存的真实配置）
   * 配置来源: GET /api/v4/system/config/exchange-page
   */
  async _loadExchangePageConfig() {
    try {
      const exchangeConfig = await ExchangeConfig.ExchangeConfigCache.getConfig()
      const isBuiltInFallback = !exchangeConfig.updated_at

      if (isBuiltInFallback) {
        throw new Error(
          '后端未提供兑换页面真实配置，请后端检查 /api/v4/system/config/exchange-page'
        )
      }

      log.info('兑换页面配置加载成功:', exchangeConfig.updated_at)

      this.setData({
        hasConfigError: false,
        configErrorMessage: '',
        tabs: exchangeConfig.tabs
          .filter((t: any) => t.enabled)
          .sort((a: any, b: any) => a.sort_order - b.sort_order),
        effects: exchangeConfig.card_display.effects,
        viewMode: exchangeConfig.card_display.default_view_mode || 'grid'
      })
      this.applyNativeThemeColors()
    } catch (error: any) {
      log.error('加载兑换页面配置失败:', error)
      this.setData({
        hasConfigError: true,
        configErrorMessage: error.message || '兑换页面配置加载失败，请后端检查真实配置是否已提供',
        tabs: []
      })
      throw error
    }
  },

  /** 从后端 API 获取最新积分余额（委托 pointsStore.refreshFromAPI，消除重复逻辑） */
  async _refreshPointsBalance(localUserInfo: any) {
    try {
      const { available } = await pointsStore.refreshFromAPI()
      this.setData({ userInfo: localUserInfo, totalPoints: available })
    } catch (error) {
      log.error('获取积分余额异常:', error)
      this.setData({ userInfo: localUserInfo, totalPoints: pointsStore.availableAmount || 0 })
    }
  },

  /**
   * 获取星石和源晶类资产余额
   * 后端API: GET /api/v4/assets/balances
   * 过滤规则: star_stone + *_core_shard（碎片）+ *_core_gem（源晶）
   */
  async _refreshAssetBalances() {
    try {
      const result = await API.getAssetBalances()
      if (result?.success && result.data) {
        /** 后端实际返回 { data: { balances: [...] } }，取 balances 数组 */
        const apiData = result.data
        const allBalances = apiData.balances || (Array.isArray(apiData) ? apiData : [])
        const starStoneAndGemAssets = allBalances
          .filter((asset: any) => {
            const code = asset.asset_code || ''
            /** 使用 AssetCodes 辅助函数判断是否为可兑换资产（星石 + 碎片 + 完整源晶） */
            return assetCodesHelper.isExchangeableAsset(code)
          })
          .map((asset: any) => ({
            asset_code: asset.asset_code,
            /** 后端 display_name 为权威数据源，本地映射仅作兜底 */
            display_name:
              asset.display_name ||
              ImageHelper.getAssetDisplayName(asset.asset_code) ||
              asset.asset_code,
            /** 后端返回的图标完整 URL（走图片代理路由） */
            icon_url: asset.icon_url || null,
            available_amount: asset.available_amount || 0,
            frozen_amount: asset.frozen_amount || 0,
            total_amount: asset.total_amount || 0
          }))
        this.setData({ assetBalances: starStoneAndGemAssets })
      }
    } catch (error) {
      log.error('获取资产余额失败:', error)
    }
  },

  /** 统一刷新所有余额（积分 + 星石/源晶资产，并行请求） */
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
                _propsMallRefreshToken: this.data._propsMallRefreshToken + 1
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

  // ========== 登录弹窗 ==========

  onShowLoginPopup() {
    this.setData({ loginPopupVisible: true })
  },

  onLoginPopupClose() {
    this.setData({ loginPopupVisible: false })
  },

  async onLoginSuccess() {
    this.setData({ loginPopupVisible: false })
    Utils.restoreUserInfo()
    try {
      await this._loadExchangePageConfig()
      this._restoreThemePreferences()
    } catch (e) {
      log.error('登录后配置加载失败:', e)
    }
    await this._refreshAllBalances(userStore.ensureUserInfo())
    /* 登录后补拉顶部 Banner：ad-delivery 需登录态，登出态进页面取不到 */
    this.loadTopBanner()
  },

  /** Tab 切换入口 */
  onTabChange(e: any) {
    const tabKey = e.detail?.value || e.currentTarget?.dataset?.tab
    if (!tabKey || tabKey === this.data.currentTab) {
      return
    }
    this.setData({ currentTab: tabKey })
    log.info('切换到Tab:', tabKey)
  },

  /**
   * 页面级滚动触底 — 仅道具商城（prop Tab）走页面滚动容器加载更多。
   * 商品兑换（exchange）/资产转换（exchange-rate）由 exchange-shelf 内部
   * 自带 scroll-view 处理触底，无需页面壳转发。
   */
  onPageScrollToLower() {
    if (this.data.currentTab !== 'prop') {
      return
    }
    const propsMall = this.selectComponent('#props-mall')
    if (propsMall && typeof propsMall.loadMore === 'function') {
      propsMall.loadMore()
    }
  },

  /**
   * 页面级滚动监听：道具商城 Tab 下滚动超阈值（300px）时显示「回到顶部」按钮。
   * 仅在跨阈值时 setData，避免每帧刷新。
   */
  onPageScroll(e: any) {
    const top = (e.detail && e.detail.scrollTop) || 0
    const shouldShow = top > 300
    if (shouldShow !== this.data.showBackToTop) {
      this.setData({ showBackToTop: shouldShow })
    }
  },

  /** 点击「回到顶部」：scroll-into-view 锚点滚回顶部，随后清空以便下次复用 */
  onPageBackToTop() {
    this.setData({ pageScrollIntoView: 'page-top' })
    setTimeout(() => {
      this.setData({ pageScrollIntoView: '', showBackToTop: false })
    }, 300)
  },

  /** 下拉刷新 — 配置缺失时优先重拉后端配置，其余场景刷新子组件与余额 */
  async onPullDownRefresh() {
    log.info('页面级下拉刷新')

    try {
      if (this.data.hasConfigError) {
        this.setData({ loading: true })
        await this._loadExchangePageConfig()
        this._restoreThemePreferences()
        this.setData({ loading: false })
        return
      }

      if (this.data.currentTab === 'exchange') {
        /* 方案一：下拉刷新强制跳后端 60s 缓存（refresh=true），确保拿到最新商品 */
        const shelf = this.selectComponent('#exchange-shelf')
        if (shelf && typeof shelf.forceRefresh === 'function') {
          shelf.forceRefresh()
        } else {
          this.setData({ _shelfRefreshToken: this.data._shelfRefreshToken + 1 })
        }
        this._lastListRefreshAt = Date.now()
      } else if (this.data.currentTab === 'exchange-rate') {
        this.setData({ _exchangeRateRefreshToken: this.data._exchangeRateRefreshToken + 1 })
      } else if (this.data.currentTab === 'prop') {
        this.setData({ _propsMallRefreshToken: this.data._propsMallRefreshToken + 1 })
      }

      await this._refreshAllBalances(this.data.userInfo)
    } catch (error) {
      log.error('页面级下拉刷新失败:', error)
    } finally {
      this.setData({ loading: false })
      wx.stopPullDownRefresh()
    }
  },

  /** 兑换成功事件（exchange-shelf 触发） */
  async onExchangeSuccess(_e: any) {
    log.info('兑换成功，刷新余额')
    await this._refreshAllBalances()
  },

  /** 资产转换成功事件（asset-conversion 组件触发） */
  async onConversionSuccess(_e: any) {
    log.info('资产转换成功，刷新余额')
    await this._refreshAllBalances()
  },

  /** 资产变动事件（两个组件共用） */
  async onPointsUpdate() {
    await this._refreshAllBalances()
  },

  /** 认证错误事件（组件遇401时触发） */
  onAuthError() {
    log.info('收到认证错误事件，清理Token并弹出登录弹窗')
    app.clearAuthData()
    this.setData({ isLoggedIn: false, loginPopupVisible: true })
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
   * 将微信原生导航栏、TabBar 颜色同步为当前品牌色
   * CSS 变量只能控制 WXML 内元素，导航栏和 TabBar 属于框架层需通过 JS API 设置
   */
  applyNativeThemeColors() {
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#5B7A5E',
      animation: { duration: 300, timingFunc: 'easeIn' }
    })
    wx.setTabBarStyle({
      selectedColor: '#5B7A5E'
    })
  },

  /**
   * 从本地 Storage 恢复用户视图偏好
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
      log.warn('恢复视图偏好失败，使用后端默认配置')
    }
  }
})
