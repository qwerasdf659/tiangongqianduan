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
 * @version 5.2.0
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

    // ========== 交易市场购买确认弹窗 ==========
    showConfirm: false,
    selectedProduct: null,

    // ========== 交易市场购买结果弹窗 ==========
    showResult: false,
    resultData: null,

    // ========== 商品兑换确认弹窗（幸运空间/臻选空间专用） ==========
    showShopConfirm: false,
    selectedShopProduct: null,
    shopExchangeQuantity: 1,
    shopExchanging: false,
    showShopResult: false,
    shopResultData: null,

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

    // ========== 幸运空间分页 ==========
    luckyCurrentPage: 1,
    luckyTotalPages: 1,
    luckyPageSize: PAGINATION.GRID_SIZE,
    luckyTotalProducts: 0,
    luckyAllProducts: [], // 幸运空间全部商品（用于前端分页）
    luckyPageInputValue: '',

    // ========== 臻选空间分页 ==========
    premiumCurrentPage: 1,
    premiumTotalPages: 1,
    premiumPageSize: PAGINATION.GRID_SIZE,
    premiumTotalProducts: 0,
    premiumAllProducts: [], // 臻选空间全部商品（用于前端分页）
    premiumPageInputValue: '',

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

    // 臻选空间解锁状态 - 全部由后端 GET /api/v4/backpack/exchange/premium-status 返回
    premiumUnlocked: false,
    premiumRemainingHours: 0, // 剩余有效时间（小时），后端字段 remaining_hours
    premiumIsValid: false,
    premiumTotalUnlockCount: 0,
    premiumCanUnlock: false, // 是否满足解锁条件（未解锁时后端返回）
    premiumIsExpired: false, // 是否已过期（未解锁时后端返回）
    premiumConditions: null as any, // 解锁条件详情（未解锁时后端返回）
    premiumUnlockCost: 0, // 解锁花费（积分）
    premiumValidityHours: 24, // 有效期（小时）

    // ========== 瀑布流布局数据 ==========
    waterfallProducts: [],
    waterfallColumns: [0, 0],
    containerWidth: 375,
    containerHeight: 0,
    columnWidth: 0,
    visibleProducts: [],
    renderOffset: 0,

    // ========== 臻选空间商品列表（双列网格布局，与幸运空间一致） ==========
    premiumFilteredProducts: [],

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
    bidMinAmount: 0, // 当前最低出价金额
    bidAmountValid: false, // 出价金额是否有效
    bidSubmitting: false, // 是否正在提交竞价
    showBidRules: false, // 竞价规则是否展开
    bidModalCountdown: '' // 弹窗内倒计时文本
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
    if (this._bidListTimer) {
      clearInterval(this._bidListTimer)
      this._bidListTimer = null
    }
    if (this._bidModalTimer) {
      clearInterval(this._bidModalTimer)
      this._bidModalTimer = null
    }
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
    if (this._bidListTimer) {
      clearInterval(this._bidListTimer)
      this._bidListTimer = null
    }
    if (this._bidModalTimer) {
      clearInterval(this._bidModalTimer)
      this._bidModalTimer = null
    }
  },

  /** 下拉刷新（页面级 - 已禁用，保留兼容） */
  onPullDownRefresh() {
    log.info('⬇️ 页面级下拉刷新')
    this.refreshPage()
  },

  /** scroll-view 下拉刷新（替代页面级下拉刷新） */
  onScrollViewRefresh() {
    log.info('⬇️ scroll-view 下拉刷新')
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
   * 后端返回 unlocked + remaining_hours（已解锁）或 can_unlock + conditions（未解锁）
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
      premiumFilteredProducts: []
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

  /**
   * 商品点击事件（两个Tab共用，根据当前Tab打开不同弹窗）
   * - 交易市场Tab（currentTab === 'exchange'）：打开购买确认弹窗（showConfirm）
   * - 商品兑换Tab（currentTab === 'market'）：打开兑换确认弹窗（showShopConfirm）
   */
  onProductTap(e: any) {
    const product = e.currentTarget.dataset.product
    log.info('🎁 点击商品:', product)

    if (this.data.currentTab === 'market') {
      /**
       * 🔒 前置校验: 商品兑换Tab必须有 id（DataSanitizer 脱敏后的商品主键）
       * 缺少此字段时无法执行 POST /api/v4/backpack/exchange 兑换请求
       */
      if (!product || !product.id) {
        log.error('❌ 商品数据缺少 id（DataSanitizer 脱敏后的主键），无法兑换:', product)
        showToast({ title: '商品数据异常，请刷新页面重试', icon: 'none' })
        return
      }

      log.info('🛒 商品兑换模式 - 打开兑换确认弹窗')
      this.setData({
        selectedShopProduct: product,
        showShopConfirm: true,
        shopExchangeQuantity: 1,
        shopExchanging: false
      })
    } else {
      // 交易市场Tab → 打开购买确认弹窗
      log.info('🏪 交易市场模式 - 打开购买确认弹窗')
      this.setData({ selectedProduct: product, showConfirm: true })
    }
  },

  /** 取消商品兑换操作（幸运空间/臻选空间专用） */
  onCancelShopExchange() {
    log.info('❌ 取消商品兑换操作')
    this.setData({ showShopConfirm: false, selectedShopProduct: null, shopExchangeQuantity: 1 })
  },

  /**
   * 确认商品兑换操作（幸运空间/臻选空间专用）
   * 后端API: POST /api/v4/backpack/exchange
   * 请求体: { exchange_item_id: number, quantity: number }
   * 请求头: Idempotency-Key（幂等键，防止重复提交）
   * 响应: { order_no, exchange_item_id, quantity, pay_asset_code, pay_amount, status, exchange_time }
   *
   * ⚠️ 字段映射关系:
   *   列表 API 返回 id（string "958"，DataSanitizer 脱敏）
   *   POST 接口 body 要求 exchange_item_id（number 958）
   *   取值用 id，传参时 Number(id) 转为数字传给 exchange_item_id
   */
  async onConfirmShopExchange() {
    const { selectedShopProduct, shopExchangeQuantity, shopExchanging, totalPoints } = this.data

    if (!selectedShopProduct) {
      log.error('❌ 未选择兑换商品')
      showToast({ title: '请选择要兑换的商品', icon: 'none' })
      return
    }

    if (shopExchanging) {
      log.info('⏳ 正在兑换中，请勿重复操作')
      return
    }

    /**
     * 获取商品兑换所需的ID和价格（DataSanitizer 脱敏后的字段）
     * id: string — 商品主键（原 exchange_item_id，BIGINT→string）
     * cost_amount: string — 兑换价格（BIGINT→string，bigNumberStrings: true）
     */
    const shopProductId = selectedShopProduct.id
    const costAmount = Number(selectedShopProduct.cost_amount) || 0
    const costAssetCode = selectedShopProduct.cost_asset_code || 'POINTS'

    if (!shopProductId) {
      log.error('❌ 商品ID无效（id 字段缺失）:', selectedShopProduct)
      showToast({ title: '商品数据异常，请重试', icon: 'none' })
      return
    }

    // 积分余额检查（仅当使用积分支付时）
    if (
      costAssetCode === 'POINTS' &&
      costAmount > 0 &&
      totalPoints < costAmount * shopExchangeQuantity
    ) {
      showToast({ title: '积分不足，无法兑换', icon: 'none' })
      return
    }

    this.setData({ shopExchanging: true })

    try {
      /**
       * POST /api/v4/backpack/exchange 的 body 参数名是 exchange_item_id（number）
       * 值从列表 API 的 id（string）字段获取，Number() 转为数字
       */
      const exchangeItemIdNum = Number(shopProductId)
      log.info('🛒 执行商品兑换:', {
        exchangeItemId: exchangeItemIdNum,
        quantity: shopExchangeQuantity
      })
      const response = await API.exchangeProduct(exchangeItemIdNum, shopExchangeQuantity)

      if (response && response.success && response.data) {
        log.info('✅ 兑换成功:', response.data)

        this.setData({
          showShopConfirm: false,
          selectedShopProduct: null,
          shopExchanging: false,
          showShopResult: true,
          shopResultData: {
            product: selectedShopProduct,
            orderNo: response.data.order_no || '',
            payAssetCode: response.data.pay_asset_code || costAssetCode,
            payAmount: response.data.pay_amount || costAmount,
            quantity: response.data.quantity || shopExchangeQuantity,
            exchangeTime: response.data.exchange_time || ''
          }
        })

        // 刷新积分余额
        try {
          const balanceResult = await API.getPointsBalance()
          if (balanceResult && balanceResult.success && balanceResult.data) {
            const points = balanceResult.data.available_amount || 0
            const frozen = balanceResult.data.frozen_amount || 0
            pointsStore.setBalance(points, frozen)
            this.setData({ totalPoints: points, frozenPoints: frozen })
            log.info('💰 兑换后积分余额更新:', { available: points, frozen })
          }
        } catch (balanceError) {
          log.warn('⚠️ 兑换后积分余额刷新失败:', balanceError)
        }

        // 延迟刷新商品列表
        setTimeout(() => {
          this.refreshMarketData()
        }, 1000)
      } else {
        throw new Error((response && response.message) || '兑换失败')
      }
    } catch (error: any) {
      log.error('❌ 商品兑换失败:', error)
      this.setData({ shopExchanging: false })

      let errorMessage = '兑换失败，请重试'
      if (error.statusCode === 401) {
        errorMessage = '登录状态异常，请重新登录'
      } else if (error.statusCode === 400) {
        errorMessage = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        errorMessage = error.message || '库存不足或余额不足'
      } else if (error.message) {
        errorMessage = error.message
      }

      wx.showModal({
        title: '🚨 兑换失败',
        content: errorMessage,
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  },

  /** 商品兑换数量增减（幸运空间/臻选空间专用） */
  onShopQuantityChange(e: any) {
    const action = e.currentTarget.dataset.action
    let { shopExchangeQuantity } = this.data
    if (action === 'increase') {
      shopExchangeQuantity = Math.min(shopExchangeQuantity + 1, 99)
    } else if (action === 'decrease') {
      shopExchangeQuantity = Math.max(shopExchangeQuantity - 1, 1)
    }
    this.setData({ shopExchangeQuantity })
  },

  /** 关闭商品兑换结果弹窗 */
  onCloseShopResult() {
    log.info('📝 关闭商品兑换结果弹窗')
    this.setData({ showShopResult: false, shopResultData: null })
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
      premiumFilteredProducts: [],
      luckySpaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 },
      premiumSpaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 },
      containerHeight: 800,
      ...specificData
    }

    this.setData(baseErrorData)
    showToast({ title: errorMessage, icon: 'none', duration: DELAY.RETRY })
  }
})

export { }

