/**
 * 兑换页面 — Page Shell + 生命周期 + 共享方法
 *
 * 业务方法已拆分到独立模块，通过展开运算符合并到 Page({})：
 * - exchange-market-handlers.ts → 交易市场 Tab（搜索、筛选、分页、兑换弹窗）
 * - exchange-shop-handlers.ts   → 商品兑换 Tab（双空间、瀑布流、竞价）
 *
 * 拆分后 WXML 完全不变，用户无感知。this 上下文自动绑定到 Page 实例。
 *
 * @file pages/exchange/exchange.ts
 * @version 5.0.0
 * @since 2026-02-15
 */

const app = getApp()

// 统一工具函数导入
const { Utils, API, Wechat, Constants, Logger } = require('../../utils/index')
const log = Logger.createLogger('exchange')
const { showToast } = Wechat
const { PAGINATION, DELAY } = Constants

// MobX Store 绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

// 拆分的业务方法模块
const marketHandlers = require('./exchange-market-handlers')
const shopHandlers = require('./exchange-shop-handlers')

Page({
  data: {
    // ========== 用户信息 ==========
    userInfo: {},
    totalPoints: 0, // 可用积分
    frozenPoints: 0, // 冻结积分（审核中）

    // ========== 内容切换控制 ==========
    // 'exchange' | 'market'
    currentTab: 'exchange',

    // ========== 交易市场相关数据 ==========
    products: [],
    filteredProducts: [],

    // ========== 商品兑换相关数据 ==========
    tradeList: [],

    // ========== 图片加载状态管理 ==========
    imageStatus: {},
    filteredTrades: [],
    // 'lucky' | 'premium'
    currentSpace: 'lucky',

    // 统计数据 - 仅从后端API获取，不使用模拟数据
    luckySpaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 },
    premiumSpaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 },
    marketStats: { total_trades: 0, avg_price: 0, hot_categories: [] },

    // ========== 页面状态 ==========
    loading: true,
    refreshing: false,

    // ========== 兑换确认弹窗 ==========
    showConfirm: false,
    selectedProduct: null,

    // ========== 兑换结果弹窗 ==========
    showResult: false,
    resultData: null,

    // ========== 兑换相关数据 ==========
    exchangeQuantity: 1,
    exchanging: false,

    // ========== 搜索和筛选 ==========
    searchKeyword: '',
    // 'all', 'available', 'low-price'
    currentFilter: 'all',

    // ========== 分页功能 ==========
    currentPage: 1,
    totalPages: 1,
    // 2×2网格布局（仅用于普通兑换模式）
    pageSize: PAGINATION.GRID_SIZE,
    totalProducts: 0,

    // ========== 瀑布流模式配置 ==========
    waterfallPageSize: PAGINATION.WATERFALL_SIZE,
    pageInputValue: '',

    // ========== 高级筛选 ==========
    showAdvancedFilter: false,
    categoryFilter: 'all',
    pointsRange: 'all',
    stockFilter: 'all',
    sortBy: 'default',

    // ========== 幸运空间搜索和筛选 ==========
    luckySearchKeyword: '',
    luckyCurrentFilter: 'all',
    showLuckyAdvancedFilter: false,
    luckyCategoryFilter: 'all',
    luckyPointsRange: 'all',
    luckyStockFilter: 'all',
    luckySortBy: 'default',
    luckyFilteredProducts: [],

    // ========== 双空间系统数据 ==========
    spaceList: [
      {
        id: 'lucky',
        name: '🎁 幸运空间',
        subtitle: '瀑布流卡片',
        description: '发现随机好物',
        layout: 'waterfall',
        color: '#52c41a',
        bgGradient: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
        locked: false
      },
      {
        id: 'premium',
        name: '💎 臻选空间',
        subtitle: '混合精品展示',
        description: '解锁高级商品',
        layout: 'simple',
        color: '#667eea',
        bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        locked: true
        // 🔴 解锁条件由后端API提供: GET /api/v4/backpack/exchange/premium-status
      }
    ],

    // 臻选空间解锁状态 - 全部由后端API返回
    premiumUnlockStatus: {
      isUnlocked: false,
      unlockTime: 0,
      expiryTime: 0,
      canUnlock: false,
      unlockCost: 0,
      unlockDuration: 0,
      failureReasons: [] as string[],
      lastCheckTime: 0
    },

    // ========== 瀑布流布局数据 ==========
    waterfallProducts: [],
    waterfallColumns: [0, 0],
    containerWidth: 375,
    containerHeight: 0,
    columnWidth: 0,
    visibleProducts: [],
    renderOffset: 0,

    // ========== 混合布局数据结构 ==========
    carouselItems: [],
    carouselActiveIndex: 0,
    autoPlay: true,
    cardSections: [],
    listProducts: [],
    mixedLayoutConfig: {
      carouselAutoPlay: true,
      carouselInterval: 4000,
      cardColumns: 2,
      listShowDetails: true
    },

    // ========== 竞价热销数据 ==========
    hotRankingList: [],
    biddingProducts: [],
    newProducts: [],
    realTimeTimer: null,

    // ========== 竞价交互状态 ==========
    showBidModal: false,
    selectedBidProduct: null,
    userBidAmount: 0,
    bidHistory: [],
    bidMinAmount: 0,         // 当前最低出价金额
    bidAmountValid: false,   // 出价金额是否有效
    bidSubmitting: false,    // 是否正在提交竞价
    showBidRules: false,     // 竞价规则是否展开
    bidModalCountdown: ''    // 弹窗内倒计时文本
  },

  // ============================================
  // 📦 拆分的业务方法合并（展开运算符，WXML不变）
  // ============================================

  /** 交易市场 Tab 全部方法（搜索、筛选、分页、兑换弹窗、图片处理） */
  ...marketHandlers,
  /** 商品兑换 Tab 全部方法（双空间、瀑布流、竞价、幸运空间筛选） */
  ...shopHandlers,

  // ============================================
  // 🔄 页面生命周期
  // ============================================

  /** 页面加载 */
  onLoad(_options: any) {
    log.info('📄 交易市场页面加载')

    // MobX Store 绑定
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })
    this.pointsBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: { pointsBalance: () => pointsStore.availableAmount },
      actions: ['setBalance']
    })

    // 恢复认证状态（统一由 auth-helper 处理）
    Utils.restoreUserInfo()
    this.initPage()
    this.initPremiumUnlockStatus()
  },

  /** 页面显示（恢复用户数据 + WebSocket + 刷新检查） */
  async onShow() {
    log.info('👁️ 兑换页面显示')

    // 从 MobX Store 获取用户信息，缺失时从 Storage 恢复（2级恢复，不跳转）
    let userInfo = userStore.userInfo
    if (!userInfo || !userInfo.user_id) {
      log.warn('⚠️ userStore.userInfo缺失，尝试从Storage恢复')
      userInfo = wx.getStorageSync('user_info')
      if (userInfo && userInfo.user_id) {
        userStore.updateUserInfo(userInfo)
        log.info('✅ 从Storage恢复userInfo到Store成功')
      }
    }

    // 调用API获取最新积分余额
    if (userInfo && userInfo.user_id) {
      try {
        log.info('💰 正在获取最新积分余额...')
        const { getPointsBalance } = API
        const balanceResult = await getPointsBalance()

        if (balanceResult && balanceResult.success && balanceResult.data) {
          const points = balanceResult.data.available_amount || 0
          const frozen = balanceResult.data.frozen_amount || 0
          log.info('✅ 最新积分余额:', { available: points, frozen })
          pointsStore.setBalance(points, frozen)
          this.setData({ userInfo, totalPoints: points, frozenPoints: frozen })
        } else {
          const storePoints = pointsStore.availableAmount || 0
          this.setData({ userInfo, totalPoints: storePoints })
          log.warn('⚠️ 积分余额API返回失败，使用MobX Store缓存值:', storePoints)
        }
      } catch (error) {
        log.error('❌ 获取积分余额异常:', error)
        const storePoints = pointsStore.availableAmount || 0
        this.setData({ userInfo, totalPoints: storePoints })
      }
    } else {
      this.setData({ userInfo: userInfo || {}, totalPoints: 0 })
    }

    this.connectWebSocket()
    this.checkAndRefreshProducts()
    this.checkPremiumUnlockStatus()
  },

  /** 页面隐藏 */
  onHide() {
    log.info('🙈 兑换页面隐藏')
    this.disconnectWebSocket()
    this.onHideMarket()
    /* 暂停竞价倒计时（节省性能） */
    if (this._bidListTimer) { clearInterval(this._bidListTimer); this._bidListTimer = null }
    if (this._bidModalTimer) { clearInterval(this._bidModalTimer); this._bidModalTimer = null }
  },

  /** 页面卸载 */
  onUnload() {
    log.info('🗑️ 兑换页面卸载')
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    if (this.pointsBindings) {
      this.pointsBindings.destroyStoreBindings()
    }
    this.disconnectWebSocket()
    /* 清理竞价倒计时定时器 */
    if (this._bidListTimer) { clearInterval(this._bidListTimer); this._bidListTimer = null }
    if (this._bidModalTimer) { clearInterval(this._bidModalTimer); this._bidModalTimer = null }
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    log.info('⬇️ 下拉刷新')
    this.refreshPage()
  },

  // ============================================
  // 🔧 共享方法（被两个 Tab 共同使用）
  // ============================================

  /** 初始化页面数据 */
  initPage() {
    this.refreshUserInfo()
    this.initFilters()
    // 只在交易市场模式下加载商品，商品兑换有独立的初始化
    if (this.data.currentTab !== 'market') {
      this.loadProducts()
    } else {
      log.info('🏪 商品兑换模式，跳过交易市场列表初始化')
    }
  },

  /** 刷新用户信息（从后端API获取最新数据） */
  async refreshUserInfo() {
    log.info('🔄 刷新用户信息...')

    try {
      const tokenStatus = Utils.checkTokenValidity()
      if (!tokenStatus.isValid) {
        log.warn('⚠️ Token状态异常，跳过用户信息刷新')
        return
      }

      const [userInfoResponse, balanceResponse] = await Promise.all([
        API.getUserInfo(),
        API.getPointsBalance()
      ])

      if (userInfoResponse.success && userInfoResponse.data) {
        const userInfo = userInfoResponse.data
        let points = 0
        let frozen = 0

        if (balanceResponse && balanceResponse.success && balanceResponse.data) {
          points = balanceResponse.data.available_amount || 0
          frozen = balanceResponse.data.frozen_amount || 0
          log.info('✅ 积分余额获取成功:', { available: points, frozen })
        } else {
          points = pointsStore.availableAmount || 0
          log.warn('⚠️ 积分余额API失败，使用MobX Store缓存积分:', points)
        }

        this.setData({ userInfo, totalPoints: points, frozenPoints: frozen })
        userStore.updateUserInfo(userInfo)
        pointsStore.setBalance(points, frozen)
        log.info('✅ 用户信息刷新成功，可用积分:', points)
      } else {
        throw new Error(userInfoResponse.message || '获取用户信息失败')
      }
    } catch (error) {
      log.error('❌ 用户信息刷新失败:', error)

      if (userStore.userInfo) {
        const storePoints = pointsStore.availableAmount || 0
        this.setData({ userInfo: userStore.userInfo, totalPoints: storePoints })
        log.info('💾 使用缓存的用户信息，积分:', storePoints)
      } else {
        this.setData({ userInfo: {}, totalPoints: 0, frozenPoints: 0 })
        log.warn('⚠️ 无可用用户数据，积分数据需从后端API获取')
        showToast({ title: '获取用户信息失败', icon: 'none', duration: DELAY.TOAST_LONG })
      }
    }
  },

  /** 清理Token并跳转登录页 */
  clearTokenAndRedirectLogin() {
    log.info('🗑️ 清理无效Token')
    userStore.clearLoginState()
    pointsStore.clearPoints()
    wx.reLaunch({ url: '/pages/auth/auth' })
  },

  /** 连接 Socket.IO（订阅商品更新消息，事件名由后端 emit 直接匹配） */
  connectWebSocket() {
    // 连接前先检查Token有效性
    const tokenStatus = Utils.checkTokenValidity()
    if (!tokenStatus.isValid) {
      log.warn('⚠️ Token无效，跳过Socket.IO连接:', tokenStatus.message)
      return
    }

    try {
      app
        .connectWebSocket()
        .then(() => {
          app.subscribeWebSocketMessages('exchange', (eventName: string, _data: any) => {
            /* Socket.IO 按事件名自动路由 */
            if (eventName === 'product_updated' || eventName === 'exchange_stock_changed') {
              log.info('📦 收到商品更新通知，刷新列表')
              this.loadProducts()
            }
            /* 竞价相关实时事件 */
            if (eventName === 'bid_outbid') {
              log.info('🔔 收到出价被超越通知')
              this.loadBidProducts()
            }
            if (eventName === 'bid_won' || eventName === 'bid_lost') {
              log.info('🏆 收到竞价结果通知:', eventName)
              this.loadBidProducts()
              this.loadBidHistory()
            }
          })
        })
        .catch((error: Error) => {
          log.warn('⚠️ Socket.IO连接未就绪:', error.message)
        })
    } catch {
      log.warn('⚠️ Socket.IO连接异常，不影响页面正常使用')
    }
  },

  /** 断开 Socket.IO 连接 */
  disconnectWebSocket() {
    try {
      app.unsubscribeWebSocketMessages('exchange')
    } catch {
      log.warn('⚠️ Socket.IO取消订阅异常')
    }
  },

  /**
   * 初始化臻选空间解锁状态
   * 后端API: GET /api/v4/backpack/exchange/premium-status
   * 业务规则: 100积分解锁费用、历史积分10万门槛、24小时有效期
   */
  initPremiumUnlockStatus() {
    log.info('🔒 检查臻选空间解锁状态...')
    this.checkPremiumUnlockStatus()
  },

  /** 刷新页面数据（根据当前Tab选择刷新逻辑） */
  refreshPage() {
    this.setData({ refreshing: true })

    const refreshPromises = [this.refreshUserInfo()]

    if (this.data.currentTab === 'market') {
      log.info('🏪 商品兑换模式刷新')
      refreshPromises.push(this.initLuckySpaceData())
    } else {
      log.info('📦 交易市场模式刷新')
      refreshPromises.push(this.loadProducts())
    }

    Promise.all(refreshPromises)
      .then(() => {
        this.setData({ refreshing: false })
        wx.stopPullDownRefresh()
      })
      .catch(error => {
        log.error('❌ 页面刷新失败:', error)
        this.setData({ refreshing: false })
        wx.stopPullDownRefresh()
      })
  },

  /** 隐藏商品兑换（功能占位） */
  onHideMarket() {
    log.info('🙈 市场隐藏功能待实现')
  },

  // ============================================
  // 🏪 Tab 切换
  // ============================================

  /** 切换到商品兑换 */
  async onGoToTradeMarket() {
    log.info('🏪 切换到商品兑换')

    if (this.data.currentTab === 'market') {
      log.info('已在商品兑换，无需切换')
      return
    }

    this.setData({ currentTab: 'market', currentSpace: 'lucky' })
    this.initLayoutParams()
    await this.initLuckySpaceData()

    // 预初始化臻选空间数据结构
    log.info('📝 预初始化臻选空间数据结构...')
    this.setData({
      carouselItems: [],
      cardSections: [],
      listProducts: [],
      mixedLayoutConfig: {
        carouselAutoPlay: true,
        carouselInterval: 4000,
        cardColumns: 2,
        listShowDetails: true
      }
    })

    log.info('✅ 商品兑换已激活，进入幸运空间')
  },

  /** 切换回交易市场模式 */
  onGoToExchange() {
    log.info('🎁 切换到交易市场')

    if (this.data.currentTab === 'exchange') {
      log.info('已在兑换模式，无需切换')
      return
    }

    this.setData({ currentTab: 'exchange' })
    this.loadProducts()
    log.info('✅ 交易市场模式已激活')
  },

  // ============================================
  // 🛒 共享交互
  // ============================================

  /** 商品点击事件（两个Tab共用） */
  onProductTap(e: any) {
    const product = e.currentTarget.dataset.product
    log.info('🎁 点击商品:', product)
    this.setData({ selectedProduct: product, showConfirm: true })
  },

  /** 设置错误状态（清空所有商品数据，不使用模拟数据） */
  setErrorState(errorMessage: string, errorDetail: string, specificData: Record<string, any> = {}) {
    log.info('⚠️ 设置错误状态:', errorMessage)

    const baseErrorData = {
      loading: false,
      refreshing: false,
      hasError: true,
      errorMessage,
      errorDetail,
      waterfallProducts: [],
      carouselItems: [],
      cardSections: [],
      listProducts: [],
      luckySpaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 },
      premiumSpaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 },
      containerHeight: 800,
      ...specificData
    }

    this.setData(baseErrorData)
    showToast({ title: errorMessage, icon: 'none', duration: DELAY.RETRY })
  }
})

export {}
