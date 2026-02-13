// pages/exchange/exchange.ts - 兑换页面 + MobX响应式状态
const app = getApp()

// 🔴 统一工具函数导入
const { Utils, API, Wechat, Constants } = require('../../utils/index')
const { getExchangeProducts, exchangeProduct } = API
const { showToast } = Wechat
const { debounce } = Utils
const { PAGINATION, DELAY } = Constants
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

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

    // 🔴 统计数据 - 仅从后端API获取，不使用模拟数据
    luckySpaceStats: {
      new_count: 0,
      avg_discount: 0,
      flash_deals: 0
    },
    premiumSpaceStats: {
      hot_count: 0,
      avg_rating: 0,
      trending_count: 0
    },
    marketStats: {
      total_trades: 0,
      avg_price: 0,
      hot_categories: []
    },

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
    // 瀑布流显示20个商品
    waterfallPageSize: PAGINATION.WATERFALL_SIZE,
    // 页面跳转输入框的值
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
    luckyStockFilter: 'all', // 新增：库存状态筛选
    luckySortBy: 'default',
    luckyFilteredProducts: [],

    // ========== 双空间系统数据 ==========
    spaceList: [
      {
        id: 'lucky',
        name: '🎁 幸运空间',
        subtitle: '幸运好物，与你相遇',
        layout: 'waterfall',
        color: '#FF6B35',
        bgGradient: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)'
      },
      {
        id: 'premium',
        name: '💎 臻选空间',
        subtitle: '精品汇聚，品质之选',
        layout: 'simple',
        color: '#667eea',
        bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        locked: true,
        // 🔴 修复：更新臻选空间解锁条件（仅前端配置，实际数据以后端API为准）
        unlockRequirement: {
          // 用户历史总积分达到10万积分
          historyTotalPoints: 100000,
          // 可用积分不低于1万积分
          currentPoints: 10000,
          // 解锁需要支付1000积分
          unlockCost: 1000
        },
        // 48小时解锁时间
        unlockDuration: 48 * 60 * 60 * 1000
      }
    ],

    // 🔴 修复：臻选空间解锁状态管理 - 使用后端真实数据
    premiumUnlockStatus: {
      isUnlocked: false,
      unlockTime: 0,
      expiryTime: 0,
      // 用户历史总积分
      historyTotalPoints: 0,
      // 可用积分余额
      currentPoints: 0,
      // 是否满足解锁条件
      canUnlock: false,
      // 解锁费用
      unlockCost: 1000,
      // 解锁小时数
      unlockDuration: 48,
      // 不满足条件的原因
      failureReasons: [],
      // 最后检查时间
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

    // ========== 混合布局配置 ==========
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
    bidHistory: []
  },

  /**
   * 生命周期函数 - 监听页面加载
   *
   * @description
   * 交易市场页面首次加载时调用，执行初始化流程：
   * 1. 恢复Token状态（防止页面跳转后Token丢失）
   * 2. 初始化页面数据（用户信息、商品列表、筛选条件）
   * 3. 初始化臻选空间解锁状态
   *
   * _options - 页面参数对象（当前未使用，用下划线前缀标记）
   *
   * @example
   * // 微信小程序自动调用
   * onLoad({})
   */
  onLoad(_options) {
    console.log('📄 交易市场页面加载')

    // 🆕 MobX Store绑定
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

    // 关键修复：页面加载时强制恢复Token状态
    this.restoreTokenState()
    this.initPage()
    this.initPremiumUnlockStatus()
  },

  /**
   * 恢复Token状态
   *
   * @description
   * 解决页面跳转后Token丢失问题。从本地存储恢复Token到全局状态。
   *
   * 执行流程：
   * 1. 从本地存储读取access_token、refresh_token、user_info
   * 2. 检查全局状态中是否缺失Token
   * 3. 如果本地有Token但全局没有，立即恢复
   *
   *
   * @example
   * // 页面加载时调用
   * this.restoreTokenState()
   */
  restoreTokenState() {
    console.log('🔧 强制恢复Token状态...')
    const appInstance = getApp()
    if (appInstance) {
      try {
        const storedToken = wx.getStorageSync('access_token')
        const storedRefreshToken = wx.getStorageSync('refresh_token')
        const storedUserInfo = wx.getStorageSync('user_info')

        console.log('🔍 检查Token状态:', {
          hasStoredToken: !!storedToken,
          hasStoredUser: !!storedUserInfo,
          currentGlobalToken: !!appInstance.globalData.access_token,
          currentGlobalLogin: appInstance.globalData.isLoggedIn
        })

        if (storedToken && storedUserInfo && !appInstance.globalData.access_token) {
          console.log('🔑 检测到Token状态丢失，立即恢复')

          appInstance.globalData.access_token = storedToken
          // 🔴 V4.0规范
          appInstance.globalData.refresh_token = storedRefreshToken
          appInstance.globalData.userInfo = storedUserInfo
          appInstance.globalData.isLoggedIn = true

          console.log('✅ 兑换页面Token状态已恢复')
        }
      } catch (error) {
        console.error('❌ Token恢复失败:', error)
      }
    }
  },

  /**
   * 生命周期函数 - 监听页面显示
   *
   * @description
   * 每次页面显示时调用（从其他页面返回、从后台切换到前台）。
   *
   * 执行流程：
   * 1. 恢复用户信息和积分数据
   * 2. 连接WebSocket（实时更新）
   * 3. 检查并刷新商品列表
   * 4. 检查臻选空间解锁状态（48小时过期检查）
   * 5. 设置商户数据更新回调
   *
   *
   * @example
   * // 微信小程序自动调用
   * onShow()
   */
  async onShow() {
    console.log('👁️ 兑换页面显示')

    // 🔧 修复：确保用户信息和积分数据正确恢复
    const appInstance = getApp()
    let userInfo = appInstance.globalData.userInfo

    // 如果globalData.userInfo为空，尝试从Storage恢复
    if (!userInfo || !userInfo.user_id) {
      console.warn('⚠️ globalData.userInfo缺失，尝试从Storage恢复')
      userInfo = wx.getStorageSync('user_info')

      if (userInfo && userInfo.user_id) {
        // 恢复到globalData
        appInstance.globalData.userInfo = userInfo
        console.log('✅ 从Storage恢复userInfo成功')
      }
    }

    // 🔧 修复：调用API获取最新积分余额
    if (userInfo && userInfo.user_id) {
      try {
        console.log('💰 正在获取最新积分余额...')
        const { getPointsBalance } = API
        const balanceResult = await getPointsBalance()

        if (balanceResult && balanceResult.success && balanceResult.data) {
          // 后端资产余额API返回字段：available_amount（可用余额）、frozen_amount（冻结余额）
          const points = balanceResult.data.available_amount || 0
          const frozen = balanceResult.data.frozen_amount || 0
          console.log('✅ 最新积分余额:', { available: points, frozen })

          // 更新全局积分
          appInstance.updatePointsBalance(points)

          // 更新页面显示
          this.setData({
            userInfo,
            totalPoints: points,
            frozenPoints: frozen
          })
        } else {
          // API失败，使用MobX Store缓存值
          const storePoints = pointsStore.availableAmount || 0
          this.setData({
            userInfo,
            totalPoints: storePoints
          })
          console.warn('⚠️ 积分余额API返回失败，使用MobX Store缓存值:', storePoints)
        }
      } catch (error) {
        console.error('❌ 获取积分余额异常:', error)
        // 异常时使用MobX Store缓存值
        const storePoints = pointsStore.availableAmount || 0
        this.setData({
          userInfo,
          totalPoints: storePoints
        })
      }
    } else {
      // 没有用户信息，设置为0
      this.setData({
        userInfo: userInfo || {},
        totalPoints: 0
      })
    }

    this.connectWebSocket()
    this.checkAndRefreshProducts()

    // 🔴 修复：每次页面显示时检查臻选空间解锁状态（48小时过期检查）
    this.checkPremiumUnlockStatus()

    appInstance.setExchangeUpdateCallback &&
      appInstance.setExchangeUpdateCallback(() => {
        console.log('📦 商户数据更新通知，刷新商品列表')
        this.refreshProductsFromMerchant()
      })
  },

  /**
   * 生命周期函数 - 监听页面隐藏
   *
   * @description
   * 页面切换到后台或被其他页面覆盖时调用。
   * 断开WebSocket连接，隐藏商品兑换相关内容。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onHide()
   */
  onHide() {
    console.log('🙈 兑换页面隐藏')
    this.disconnectWebSocket()
    this.onHideMarket()
  },

  /**
   * 生命周期函数 - 监听页面卸载
   *
   * @description
   * 页面被销毁时调用。清理资源，断开WebSocket，清除回调。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onUnload()
   */
  onUnload() {
    console.log('🗑️ 兑换页面卸载')
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    if (this.pointsBindings) {
      this.pointsBindings.destroyStoreBindings()
    }
    this.disconnectWebSocket()

    const appInstance = getApp()
    appInstance.clearExchangeUpdateCallback && appInstance.clearExchangeUpdateCallback()
  },

  /**
   * 生命周期函数 - 监听用户下拉刷新
   *
   * @description
   * 用户下拉页面时触发，刷新商品列表和用户信息。
   * 刷新完成后自动停止下拉刷新动画。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onPullDownRefresh()
   */
  onPullDownRefresh() {
    console.log('⬇️ 下拉刷新')
    this.refreshPage()
  },

  /**
   * 初始化页面数据
   *
   * @description
   * 页面加载时执行的初始化逻辑：
   * 1. 刷新用户信息（积分余额等）
   * 2. 初始化筛选条件
   * 3. 加载商品列表（仅在交易市场模式下）
   *
   * 商品兑换模式有独立的初始化流程，不在此处加载。
   *
   *
   * @example
   * // 页面加载时调用
   * this.initPage()
   */
  initPage() {
    this.refreshUserInfo()
    this.initFilters()

    // 🚨 修复：只在交易市场模式下加载商品，商品兑换有独立的初始化
    if (this.data.currentTab !== 'market') {
      this.loadProducts()
    } else {
      console.log('🏪 商品兑换模式，跳过交易市场列表初始化')
    }
  },

  /**
   * 初始化筛选条件
   *
   * @description
   * 重置所有商品筛选条件为默认值：
   * - 分类筛选：全部
   * - 积分范围：全部
   * - 库存筛选：全部
   * - 排序方式：默认
   * - 搜索关键词：空
   * - 当前页码：第1页
   *
   *
   * @example
   * // 页面初始化或重置筛选时调用
   * this.initFilters()
   */
  initFilters() {
    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1
    })
  },

  /**
   * 刷新用户信息
   *
   * @description
   * 从后端API获取最新的用户信息并更新页面显示。
   * 使用V4.0统一引擎架构（getUserInfo接口）。
   *
   * 执行流程：
   * 1. 检查Token状态（是否有效）
   * 2. 调用getUserInfo API
   * 3. 更新全局状态和页面显示
   * 4. 异常处理：Token过期自动跳转登录
   *
   *
   * @example
   * // 页面初始化时调用
   * await this.refreshUserInfo()
   *
   * @example
   * // 下拉刷新时调用
   * await this.refreshUserInfo()
   */
  async refreshUserInfo() {
    console.log('🔄 刷新用户信息...')

    try {
      // 检查Token状态
      const tokenStatus = this.checkTokenStatus()
      if (!tokenStatus.isValid) {
        console.warn('⚠️ Token状态异常，跳过用户信息刷新')
        return
      }

      // 🔴 修复：分别获取用户信息和积分余额
      const [userInfoResponse, balanceResponse] = await Promise.all([
        API.getUserInfo(),
        API.getPointsBalance()
      ])

      if (userInfoResponse.success && userInfoResponse.data) {
        const userInfo = userInfoResponse.data

        // 🔴 修复：优先使用积分API的数据
        let points = 0
        let frozen = 0
        if (balanceResponse && balanceResponse.success && balanceResponse.data) {
          // 后端资产余额API返回字段：available_amount（可用余额）、frozen_amount（冻结余额）
          points = balanceResponse.data.available_amount || 0
          frozen = balanceResponse.data.frozen_amount || 0
          console.log('✅ 积分余额获取成功:', { available: points, frozen })
        } else {
          // 积分余额API失败时使用MobX Store缓存值
          points = pointsStore.availableAmount || 0
          console.warn('⚠️ 积分余额API失败，使用MobX Store缓存积分:', points)
        }

        this.setData({
          userInfo,
          totalPoints: points,
          frozenPoints: frozen
        })

        // 更新全局数据
        app.globalData.userInfo = userInfo
        app.updatePointsBalance(points)

        console.log('✅ 用户信息刷新成功，可用积分:', points)
      } else {
        throw new Error(userInfoResponse.message || '获取用户信息失败')
      }
    } catch (error) {
      console.error('❌ 用户信息刷新失败:', error)

      // 🔑 增强错误处理：使用MobX Store缓存数据
      if (app.globalData.userInfo) {
        const storePoints = pointsStore.availableAmount || 0
        this.setData({
          userInfo: app.globalData.userInfo,
          totalPoints: storePoints
        })
        console.log('💾 使用缓存的用户信息，积分:', storePoints)
      } else {
        // 🔑 如果没有缓存数据，设置默认值（积分以后端API为准）
        this.setData({
          userInfo: {},
          totalPoints: 0,
          frozenPoints: 0
        })
        console.warn('⚠️ 无可用用户数据，积分数据需从后端API获取')

        // 🔑 用户友好提示
        showToast({
          title: '获取用户信息失败',
          icon: 'none',
          duration: DELAY.TOAST_LONG
        })
      }
    }
  },

  /**
   * 检查Token状态
   *
   * @description
   * 全面检查用户Token的有效性，包括：
   * 1. 应用是否已初始化
   * 2. 用户是否已登录
   * 3. Token格式是否有效
   * 4. Token是否已过期
   *
   * 根据不同错误类型返回不同的处理建议（是否需要重新登录）。
   *
   *
   * @example
   * const tokenStatus = this.checkTokenStatus()
   * if (!tokenStatus.isValid) {
   *   if (tokenStatus.needsRelogin) {
   *     // 跳转登录页
   *   }
   * }
   *
   * @example
   * // 返回值示例 - Token有效
   * { isValid: true, message: 'Token有效' }
   *
   * @example
   * // 返回值示例 - Token过期
   * { isValid: false, error: 'TOKEN_EXPIRED', message: 'Token已过期', needsRelogin: true, isNormalUnauth: false }
   */
  checkTokenStatus() {
    const appInstance = getApp()

    if (!appInstance || !appInstance.globalData) {
      return {
        isValid: false,
        error: 'APP_NOT_INITIALIZED',
        message: '应用未初始化',
        needsRelogin: false,
        isNormalUnauth: false
      }
    }

    const isLoggedIn = app.globalData.isLoggedIn
    const accessToken = app.globalData.access_token

    if (!isLoggedIn || !accessToken) {
      console.log('🔓 用户未登录')
      return {
        isValid: false,
        error: 'NOT_LOGGED_IN',
        message: '用户未登录',
        needsRelogin: false,
        isNormalUnauth: true
      }
    }

    if (
      typeof accessToken !== 'string' ||
      accessToken.trim() === '' ||
      accessToken === 'undefined'
    ) {
      console.error('❌ Token格式异常')
      return {
        isValid: false,
        error: 'TOKEN_INVALID_FORMAT',
        message: 'Token格式无效',
        needsRelogin: true,
        isNormalUnauth: false
      }
    }

    // 简化Token验证：使用统一导入的工具函数
    const { decodeJWTPayload, isTokenExpired } = Utils

    try {
      const payload = decodeJWTPayload(accessToken)

      if (!payload) {
        console.error('❌ Token解码失败')
        return {
          isValid: false,
          error: 'TOKEN_INVALID',
          message: 'Token无效',
          needsRelogin: true,
          isNormalUnauth: false
        }
      }

      // 检查Token是否过期
      if (isTokenExpired(accessToken)) {
        console.error('⏰ Token已过期')
        return {
          isValid: false,
          error: 'TOKEN_EXPIRED',
          message: 'Token已过期',
          needsRelogin: true,
          isNormalUnauth: false
        }
      }

      console.log('✅ Token验证通过')
      return {
        isValid: true,
        message: 'Token有效',
        info: {
          userId: payload.user_id,
          mobile: payload.mobile,
          // V4.0: JWT Token权限字段
          roleBasedAdmin: payload.is_admin || false,
          roles: payload.roles || ['user'],
          expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
        },
        isNormalUnauth: false
      }
    } catch (error) {
      console.error('❌ Token验证异常:', error)
      return {
        isValid: false,
        error: 'TOKEN_VALIDATION_ERROR',
        message: 'Token验证失败',
        needsRelogin: true,
        isNormalUnauth: false
      }
    }
  },

  /**
   * 加载商品数据
   *
   * @description
   * 从后端API加载交易市场列表（使用V4.0统一引擎架构）。
   *
   * 执行流程：
   * 1. 检查当前模式（商品兑换模式不加载兑换商品）
   * 2. 验证Token状态（未登录自动跳转登录页）
   * 3. 调用getExchangeProducts API
   * 4. 数据处理：字段转换（productId→id, pointsPrice→exchange_points等）
   * 5. 更新页面显示：商品列表、分页信息
   * 6. 异常处理：Token过期自动清理并跳转登录
   *
   *
   * @example
   * // 页面初始化时调用
   * await this.loadProducts()
   *
   * @example
   * // 下拉刷新时调用
   * await this.loadProducts()
   */
  async loadProducts() {
    console.log('🔧 开始加载商品列表...')

    // 🚨 修复：在商品兑换模式下不调用loadProducts，避免认证跳转
    if (this.data.currentTab === 'market') {
      console.log('🏪 当前在商品兑换模式，跳过交易市场列表加载')
      return
    }

    const requestStartTime = Date.now()

    // 💡 loading由API调用自动处理，只需维护页面loading状态
    this.setData({ loading: true })

    const appInstance = getApp()

    // 基本检查
    if (!appInstance || !appInstance.globalData) {
      console.error('❌ App未初始化')
      this.setData({ loading: false })
      showToast({
        title: '应用初始化异常，请重启小程序',
        icon: 'none',
        duration: DELAY.RETRY
      })
      return
    }

    // 获取Token
    let token = appInstance.globalData.access_token
    if (!token) {
      token = wx.getStorageSync('access_token')
      if (token) {
        appInstance.globalData.access_token = token
        console.log('🔑 从本地存储恢复Token')
      }
    }

    if (!token) {
      console.log('🔐 用户未登录，需要先登录')
      this.setData({ loading: false })

      wx.showModal({
        title: '未登录',
        content: '请先登录后再查看商品',
        showCancel: false,
        confirmText: '立即登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
      return
    }

    console.log('🎫 Token已准备，开始请求商品数据')

    try {
      // 调用V4.0统一引擎API获取商品数据
      const space = this.data.currentSpace || 'lucky'
      const page = this.data.currentPage || 1
      // 🌊 瀑布流模式使用更大的pageSize，普通模式使用小的pageSize
      const pageSize =
        this.data.currentTab === 'market' && space === 'lucky'
          ? this.data.waterfallPageSize || PAGINATION.WATERFALL_SIZE
          : this.data.pageSize || PAGINATION.DEFAULT_PAGE_SIZE

      console.log(`📦 请求参数: space=${space}, page=${page}, pageSize=${pageSize}`)

      const response = await getExchangeProducts(space, page, pageSize)

      const requestEndTime = Date.now()
      const requestDuration = requestEndTime - requestStartTime

      console.log('✅ 商品加载成功!')
      console.log('⏱️ 请求耗时:', requestDuration + 'ms')
      console.log('📊 返回数据:', response)

      if (response && response.success && response.data) {
        const products = response.data.products || []

        // 字段转换：将v2.0 API返回的字段转换为页面需要的格式
        const processedProducts = products.map(product => ({
          id: product.productId || product.id,
          name: product.productName || product.name,
          description: product.description,
          image: product.imageUrl || product.image || '/images/default-product.png',
          exchange_points: product.pointsPrice || product.exchangePoints || product.points || 0,
          stock: product.stock || 0,
          category: product.category,
          rating: product.rating || null,
          sales: product.sales || 0,
          is_hot: product.isHot || false,
          created_time: product.createdAt || product.created_at,
          imageStatus: 'loading'
        }))

        this.setData({
          loading: false,
          products: processedProducts,
          filteredProducts: processedProducts,
          totalCount: response.data.total || processedProducts.length
        })

        // 计算分页信息
        this.calculateTotalPages()
        // 加载当前页商品
        this.loadCurrentPageProducts()

        console.log(`✅ 成功加载 ${processedProducts.length} 个商品`)
        showToast({
          title: `加载 ${processedProducts.length} 个商品`,
          icon: 'success',
          duration: DELAY.TOAST_SHORT
        })
      } else {
        throw new Error((response && response.msg) || '商品数据加载失败')
      }
    } catch (error) {
      const requestEndTime = Date.now()
      const requestDuration = requestEndTime - requestStartTime

      console.error('❌ 商品加载失败:', error)
      console.log('⏱️ 失败请求耗时:', requestDuration + 'ms')

      this.setData({ loading: false })

      // 根据错误类型执行不同处理
      if (error.statusCode === 401) {
        this.clearTokenAndRedirectLogin()
        return
      }

      // 💡 错误提示由APIClient自动显示,无需手动toast
    }
  },

  /**
   * 清理Token并跳转登录页
   *
   * @description
   * 当Token过期或无效时，清理所有认证数据并跳转到登录页。
   *
   * 清理内容：
   * 1. 全局状态：access_token, refresh_token, userInfo, isLoggedIn
   * 2. 本地存储：所有Token和用户信息
   *
   *
   * @example
   * // Token过期时调用
   * if (error.statusCode === 401) {
   *   this.clearTokenAndRedirectLogin()
   * }
   */
  clearTokenAndRedirectLogin() {
    const appInstance = getApp()

    console.log('🗑️ 清理无效Token')

    // 清理全局数据
    appInstance.globalData.access_token = null
    appInstance.globalData.refreshToken = null
    appInstance.globalData.userInfo = null
    appInstance.globalData.isLoggedIn = false

    // 清理本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')

    wx.reLaunch({ url: '/pages/auth/auth' })
  },

  /** 建立WebSocket连接 - 使用app级统一WebSocket管理 */
  connectWebSocket() {
    try {
      app
        .connectWebSocket()
        .then(() => {
          // 订阅兑换页面关心的WebSocket消息（商品更新、库存变化）
          app.subscribeWebSocketMessages('exchange', (eventName: string, _data: any) => {
            if (eventName === 'product_updated' || eventName === 'exchange_stock_changed') {
              console.log('📦 收到商品更新通知，刷新列表')
              this.loadProducts()
            }
          })
        })
        .catch((error: Error) => {
          console.warn('⚠️ WebSocket连接未就绪:', error.message)
        })
    } catch {
      // WebSocket连接失败不影响页面正常使用，用户可通过下拉刷新获取最新数据
      console.warn('⚠️ WebSocket连接异常，不影响页面正常使用')
    }
  },

  /** 断开WebSocket连接 - 取消兑换页面的消息订阅 */
  disconnectWebSocket() {
    try {
      app.unsubscribeWebSocketMessages('exchange')
    } catch {
      console.warn('⚠️ WebSocket取消订阅异常')
    }
  },

  /** 检查并刷新商品数据（页面重新显示时调用，距上次加载超60秒自动刷新） */
  checkAndRefreshProducts() {
    const lastLoadTime: number = (this as any)._lastProductLoadTime || 0
    const now: number = Date.now()
    if (now - lastLoadTime > 60000) {
      console.log('🔄 商品数据已过期，自动刷新')
      this.loadProducts()
    }
  },

  /**
   * 初始化臻选空间解锁状态
   * 🔴 后端需提供: GET /api/v4/backpack/exchange/premium-status
   * 期望返回: { unlocked, unlock_time, expires_at }
   */
  initPremiumUnlockStatus() {
    // 🔴 后端需提供: GET /api/v4/backpack/exchange/premium-status
    // 当前为空实现，等待后端API就绪后接入
    console.log('⏳ 臻选空间解锁状态：等待后端API /api/v4/backpack/exchange/premium-status')
  },

  /**
   * 刷新页面数据
   *
   * @description
   * 下拉刷新时调用，根据当前模式刷新不同的数据：
   * - 交易市场模式：刷新用户信息 + 商品列表
   * - 商品兑换模式：刷新用户信息 + 幸运空间数据
   *
   *
   * @example
   * // 下拉刷新时调用
   * onPullDownRefresh() {
   *   this.refreshPage()
   * }
   */
  refreshPage() {
    this.setData({ refreshing: true })

    // 🚨 修复：根据当前模式选择不同的刷新逻辑
    const refreshPromises = [this.refreshUserInfo()]

    if (this.data.currentTab === 'market') {
      // 商品兑换模式：刷新幸运空间数据
      console.log('🏪 商品兑换模式刷新')
      refreshPromises.push(this.initLuckySpaceData())
    } else {
      // 交易市场模式：刷新商品列表
      console.log('📦 交易市场模式刷新')
      refreshPromises.push(this.loadProducts())
    }

    Promise.all(refreshPromises)
      .then(() => {
        this.setData({ refreshing: false })
        wx.stopPullDownRefresh()
      })
      .catch(error => {
        console.error('❌ 页面刷新失败:', error)
        this.setData({ refreshing: false })
        wx.stopPullDownRefresh()
      })
  },

  /**
   * 隐藏商品兑换
   *
   * @description
   * 隐藏商品兑换相关内容。
   * （功能待实现，当前为占位方法）
   *
   *
   * @example
   * // 页面隐藏时调用
   * onHide() {
   *   this.onHideMarket()
   * }
   */
  onHideMarket() {
    // 市场隐藏功能暂时占位
    console.log('🙈 市场隐藏功能待实现')
  },

  // ============================================
  // 🏪 商品兑换功能实现 - 基于v2.0 API标准
  // ============================================

  /**
   * 切换到商品兑换
   *
   * @description
   * 从交易市场模式切换到商品兑换模式。
   * 商品兑换包含双空间系统：
   * - 幸运空间（默认）：瀑布流布局
   * - 臻选空间：混合布局（轮播+卡片+列表）
   *
   * 执行流程：
   * 1. 检查是否已在交易市场
   * 2. 切换标签页到market
   * 3. 初始化布局参数（屏幕宽度、列宽等）
   * 4. 加载幸运空间数据（默认空间）
   * 5. 预初始化臻选空间数据结构
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onGoToTradeMarket">进入商品兑换</button>
   */
  async onGoToTradeMarket() {
    console.log('🏪 切换到商品兑换')

    // 如果已经在商品兑换标签，直接返回
    if (this.data.currentTab === 'market') {
      console.log('已在商品兑换，无需切换')
      return
    }

    // 切换到商品兑换内容
    this.setData({
      currentTab: 'market',
      // 默认进入幸运空间
      currentSpace: 'lucky'
    })

    // 获取系统信息，计算布局参数
    this.initLayoutParams()

    // 初始化幸运空间数据（瀑布流布局）
    await this.initLuckySpaceData()

    // 预初始化臻选空间数据结构（确保数据字段存在）
    console.log('📝 预初始化臻选空间数据结构...')
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

    console.log('✅ 商品兑换已激活，进入幸运空间')
  },

  /**
   * 切换回交易市场模式
   *
   * @description
   * 从商品兑换切换回交易市场模式。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onGoToExchange">交易市场</button>
   */
  onGoToExchange() {
    console.log('🎁 切换到交易市场')

    if (this.data.currentTab === 'exchange') {
      console.log('已在兑换模式，无需切换')
      return
    }

    this.setData({
      currentTab: 'exchange'
    })
  },

  /**
   * 双空间切换事件处理
   *
   * @description
   * 在商品兑换中切换幸运空间和臻选空间。
   *
   * 切换逻辑：
   * 1. 获取目标空间标识（lucky/premium）
   * 2. 检查臻选空间解锁状态（切换到premium时）
   * 3. 未解锁：触发解锁流程
   * 4. 已解锁：切换空间并加载对应数据
   *
   * e - 事件对象
   * e.currentTarget - 当前触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.space - 目标空间标识（'lucky'|'premium'）
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onSpaceChange" data-space="lucky">幸运空间</button>
   * <button bindtap="onSpaceChange" data-space="premium">臻选空间</button>
   */
  async onSpaceChange(e) {
    const targetSpace = e.currentTarget.dataset.space

    console.log(`🔄 切换空间: ${targetSpace}`)

    // 检查臻选空间解锁状态
    if (targetSpace === 'premium' && !this.data.premiumUnlockStatus.isUnlocked) {
      console.log('🔒 臻选空间未解锁，尝试解锁...')
      this.handlePremiumUnlock()
      return
    }

    if (targetSpace === this.data.currentSpace) {
      console.log('当前已在目标空间，无需切换')
      return
    }

    this.setData({ currentSpace: targetSpace })

    // 根据目标空间加载数据
    if (targetSpace === 'lucky') {
      await this.initLuckySpaceData()
    } else if (targetSpace === 'premium') {
      await this.initPremiumSpaceData()
    }

    console.log(`✅ 已切换到空间: ${targetSpace}`)
  },

  /**
   * 初始化幸运空间数据
   *
   * @description
   * 加载幸运空间的商品数据并使用瀑布流布局展示。
   * 基于商品兑换UI布局优化方案技术文档 - 方案1：瀑布流卡片布局。
   *
   * 执行流程：
   * 1. 初始化瀑布流布局配置（屏幕宽度、列宽、间距）
   * 2. 调用V2.0 API获取lucky空间商品数据
   * 3. 数据转换：后端数据 → 瀑布流格式
   * 4. 布局计算：商品分配到左右两列，保持高度平衡
   * 5. 更新页面显示：商品列表、统计数据、容器高度
   * 6. 初始化筛选数据：设置初始筛选条件
   * 7. 异常处理：API失败、数据不足等情况
   *
   *
   * @example
   * // 切换到幸运空间时调用
   * await this.initLuckySpaceData()
   */
  async initLuckySpaceData() {
    console.log('🎁 初始化幸运空间数据（方案1瀑布流布局）...')

    try {
      this.setData({ loading: true })

      // 🔑 获取系统信息用于布局计算
      await this.initWaterfallLayout()

      // 🔧 仅使用真实API数据，不使用任何模拟数据

      // 使用v2.0 API获取幸运空间商品数据
      // 由于接口文档中没有专门的商品兑换API，我们使用交易市场API并进行适配
      const waterfallPageSize = this.data.waterfallPageSize || PAGINATION.WATERFALL_SIZE
      const response = await getExchangeProducts('lucky', 1, waterfallPageSize)
      console.log('📦 API返回数据:', {
        space: 'lucky',
        page: 1,
        pageSize: waterfallPageSize
      })

      if (response && response.success && response.data) {
        const products = response.data.products || []
        console.log(`✅ 获取到 ${products.length} 个商品`)
        console.log('📊 商品数据:', products)

        // 如果API返回的商品太少，显示错误信息而非模拟数据
        if (products.length < 1) {
          console.log('⚠️ API返回商品数量不足')
          this.setData({
            luckySpaceProducts: [],
            errorMessage: '暂无商品数据',
            errorDetail: '后端商品数据不足，请联系管理员添加商品',
            hasError: true
          })
          return
        }

        // 🌊 安全地转换为瀑布流数据格式并计算布局
        const waterfallProducts = this.convertToWaterfallData(products) || []
        console.log(`🌊 转换为瀑布流数据: ${waterfallProducts.length} 个`)
        const layoutProducts = this.calculateWaterfallLayout(waterfallProducts) || []
        console.log(`📐 计算布局完成: ${layoutProducts.length} 个`)

        this.setData({
          waterfallProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckyFilteredProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckySpaceStats: {
            new_count: products.length,
            avg_discount: this.calculateAvgDiscount(products),
            flash_deals: products.filter(p => p.is_hot).length
          },
          containerHeight: Math.max(...this.data.columnHeights) || 500,
          loading: false,
          // 初始化筛选条件
          luckySearchKeyword: '',
          luckyCurrentFilter: 'all',
          luckyCategoryFilter: 'all',
          luckyPointsRange: 'all',
          luckyStockFilter: 'all', // 初始化库存状态筛选
          luckySortBy: 'default',
          showLuckyAdvancedFilter: false
        })

        console.log('✅ 幸运空间数据初始化完成')
      } else {
        console.log('❌ API返回失败')
        this.setErrorState('加载商品失败', '幸运空间接口调用失败，请稍后重试')
      }
    } catch (error) {
      console.error('❌ 幸运空间初始化失败:', error)
      this.setErrorState('系统错误', '幸运空间初始化失败，请联系开发者')
    }
  },

  /**
   * 初始化瀑布流布局配置
   *
   * @description
   * 获取系统信息并计算瀑布流布局参数。
   *
   * 计算内容：
   * - containerWidth：容器宽度（屏幕宽度 - 左右padding）
   * - columnHeights：双列高度数组[0, 0]
   * - cardGap：卡片间距（12px）
   *
   * 使用新的微信API（wx.getDeviceInfo/getWindowInfo/getAppBaseInfo）
   * 替代已废弃的wx.getSystemInfoSync。
   *
   *
   * @example
   * // 初始化幸运空间前调用
   * await this.initWaterfallLayout()
   */
  async initWaterfallLayout() {
    console.log('🔑 初始化瀑布流布局配置')

    try {
      // 🔑 使用新的API替代过时的wx.getSystemInfoSync - 获取系统信息
      let systemInfo: Record<string, any> = {}
      try {
        const deviceInfo = wx.getDeviceInfo()
        const windowInfo = wx.getWindowInfo()
        const appBaseInfo = wx.getAppBaseInfo()

        systemInfo = {
          ...deviceInfo,
          ...windowInfo,
          ...appBaseInfo
        }
      } catch (error) {
        console.error('❌ 获取系统信息失败:', error)
        systemInfo = { windowWidth: 375, windowHeight: 667 }
      }

      // 24rpx * 2 padding
      const containerWidth = (systemInfo.windowWidth || 375) - 48

      this.setData({
        containerWidth,
        // 重置双列高度
        columnHeights: [0, 0],
        // 卡片间距
        cardGap: 15,
        // 容器内边距
        cardPadding: 24
      })

      console.log('✅ 瀑布流布局配置完成:', {
        screenWidth: systemInfo.windowWidth,
        containerWidth,
        cardGap: this.data.cardGap
      })
    } catch (error) {
      console.error('❌ 初始化瀑布流布局失败:', error)
      // 使用默认配置
      this.setData({
        // 375 - 48
        containerWidth: 327,
        columnHeights: [0, 0],
        cardGap: 15,
        cardPadding: 24
      })
    }
  },

  /**
   * 计算瀑布流布局
   *
   * @description
   * 将商品数据分配到左右两列，保持两列高度平衡。
   * 每次将新商品添加到高度较低的列，实现瀑布流效果。
   *
   * 计算流程：
   * 1. 初始化左右两列高度为0
   * 2. 遍历每个商品
   * 3. 计算商品卡片高度（图片+标题+价格+padding）
   * 4. 将商品添加到高度较低的列
   * 5. 更新该列的累计高度
   * 6. 返回带有列标识和位置信息的商品数组
   *
   * products - 商品数组
   *
   * @example
   * const layoutProducts = this.calculateWaterfallLayout(products)
   * // 返回数组中每个商品包含：
   * // - layoutInfo.columnIndex: 0 | 1（所在列）
   * // - layoutInfo.top: Number（距离顶部的距离）
   */
  calculateWaterfallLayout(products) {
    console.log(`📐 计算瀑布流布局: ${products ? products.length : 0} 个商品`)

    // 🔑 安全性检查
    if (!products || !Array.isArray(products) || products.length === 0) {
      console.log('⚠️ 商品数据为空或无效')
      return []
    }

    try {
      // 重置列高度
      const columnHeights = [0, 0]
      const containerWidth = this.data.containerWidth || 327
      const cardGap = this.data.cardGap || 15
      const columnWidth = (containerWidth - cardGap) / 2

      const layoutProducts = products
        .map((product, index) => {
          try {
            // 🔑 确保product是有效对象
            if (!product || typeof product !== 'object') {
              console.warn(`⚠️ 商品数据无效 [${index}]:`, product)
              return null
            }

            // 选择较短的列
            const shortestCol = columnHeights[0] <= columnHeights[1] ? 0 : 1

            // 🔑 修复：精确计算商品卡片高度 - 单位匹配
            // 图片高度：100rpx ≈ 100px
            const imageHeight = 100
            const contentHeight = this.calculateContentHeight(product)
            // 修复：进一步减少内边距
            const cardHeight = imageHeight + contentHeight + 20

            // 设置商品布局信息
            const layoutProduct = {
              ...product,
              layoutInfo: {
                columnIndex: shortestCol,
                left: shortestCol * (columnWidth + cardGap),
                top: columnHeights[shortestCol],
                width: columnWidth,
                height: cardHeight,
                zIndex: 1
              }
            }

            // 更新列高度
            // 🔑 极致优化：最小间距，打造紧凑布局
            columnHeights[shortestCol] += cardHeight + 2

            return layoutProduct
          } catch (productError) {
            console.error(`❌ 处理商品布局失败 [${index}]:`, productError)
            return null
          }
        })
        // 过滤掉null值
        .filter(Boolean)

      // 保存列高度状态
      this.setData({
        columnHeights
      })

      console.log('✅ 瀑布流布局计算完成:', {
        totalProducts: layoutProducts.length,
        leftColumnHeight: columnHeights[0],
        rightColumnHeight: columnHeights[1],
        containerHeight: Math.max(...columnHeights)
      })

      return layoutProducts
    } catch (error) {
      console.error('❌ 瀑布流布局计算失败:', error)
      return []
    }
  },

  /**
   * 计算商品卡片内容高度
   *
   * @description
   * 根据商品内容，计算卡片的内容区域高度（不含图片）。
   * 用于瀑布流布局的高度计算。
   *
   * 高度构成：
   * - 基础高度：70px
   * - 长标题：+10px（超过20字）
   * - 原价显示：+8px
   * - 评分信息：+15px
   * - 标签区域：+12px
   * - 商家信息：+10px
   *
   * product - 商品对象
   * [product.name] - 商品名称
   * [product.price] - 当前价格
   * [product.originalPrice] - 原价
   * [product.rating] - 评分
   * [product.tags] - 标签数组
   * [product.seller] - 商家信息
   *
   * @example
   * const height = this.calculateContentHeight(product)
   * // 返回值示例：70（基础）+ 10（长标题）= 80
   */
  calculateContentHeight(product) {
    // 🔑 安全性检查
    if (!product || typeof product !== 'object') {
      // 修复：返回极致紧凑的默认高度
      return 70
    }

    try {
      // 🔑 修复：大幅减少基础内容高度，解决间距过大问题
      // 修复：从100进一步减少到70
      let baseHeight = 70

      // 🔑 修复：根据标题长度调整高度
      const titleLength = product.name ? String(product.name).length : 0
      if (titleLength > 20) {
        // 修复：进一步减少长标题额外高度
        baseHeight += 10
      }

      // 🔑 修复：根据价格信息调整高度
      if (product.originalPrice && product.originalPrice !== product.price) {
        // 修复：进一步减少原价显示高度
        baseHeight += 8
      }

      // 🔑 修复：如果有评分信息
      if (product.rating) {
        // 修复：进一步减少评分区域高度
        baseHeight += 15
      }

      // 🔑 修复：如果有标签
      if (product.tags && product.tags.length > 0) {
        // 修复：进一步减少标签区域高度
        baseHeight += 12
      }

      // 🔑 修复：如果有商家信息
      if (product.seller) {
        // 修复：进一步减少商家信息区域高度
        baseHeight += 10
      }

      return baseHeight
    } catch (error) {
      console.error('❌ 计算内容高度失败:', error)
      // 修复：返回极致紧凑的默认高度
      return 70
    }
  },

  /**
   * 初始化臻选空间数据
   *
   * @description
   * 加载臻选空间的商品数据并使用混合布局展示。
   * 混合布局包含三个层次：
   * 1. 轮播推荐区（前5个商品）
   * 2. 横向卡片区（6-20个商品）
   * 3. 详细列表区（21+商品）
   *
   * 执行流程：
   * 1. 调用V2.0 API获取premium空间商品数据
   * 2. 数据分层处理：轮播、卡片、列表
   * 3. 添加额外展示信息（评分、商家、配送等）
   * 4. 更新页面显示：三个区域数据、统计数据
   * 5. 异常处理：API失败、数据异常等情况
   *
   *
   * @example
   * // 切换到臻选空间时调用
   * await this.initPremiumSpaceData()
   */
  async initPremiumSpaceData() {
    console.log('💎 初始化臻选空间数据...')

    try {
      this.setData({ loading: true })

      // 使用v2.0 API获取臻选空间商品数据
      const response = await getExchangeProducts('premium', 1, 30)

      if (response && response.success && response.data) {
        const products = response.data.products || []

        // 分层展示：轮播推荐 + 横向卡片 + 详细列表
        const carouselItems = products.slice(0, 5).map((item, index) => ({
          id: item.id,
          title: item.name,
          subtitle: item.description,
          image: item.image,
          price: item.exchange_points,
          originalPrice: item.exchange_points * 1.2,
          discount: 20,
          rating: 4.5 + Math.random() * 0.5,
          background: this.getCarouselBackground(index),
          tags: ['精选', '推荐']
        }))

        const cardSections = this.createCardSections(products.slice(5, 20))
        const listProducts = products.slice(20).map(item => ({
          ...item,
          showDescription: true,
          showSeller: true,
          seller: {
            name: '官方商城',
            rating: 4.8,
            sales: '10k+'
          },
          hasWarranty: true,
          freeShipping: true,
          estimatedDelivery: '当日达',
          returnPolicy: '7天无理由退换'
        }))

        this.setData({
          carouselItems,
          cardSections,
          listProducts,
          premiumSpaceStats: {
            hot_count: products.filter(p => p.is_hot).length,
            avg_rating: 4.8,
            trending_count: products.length
          },
          loading: false
        })

        console.log('✅ 臻选空间数据初始化完成')
      } else {
        console.log('❌ API返回失败')
        this.setErrorState('加载失败', '臻选空间接口调用失败，请稍后重试')
      }
    } catch (error) {
      console.error('❌ 臻选空间初始化失败:', error)
      this.setErrorState('系统错误', '臻选空间初始化失败，请联系开发者')
    }
  },

  /**
   * 检查臻选空间解锁状态
   *
   * @description
   * 调用后端API检查用户臻选空间的解锁状态和过期时间。
   * 如果当前在臻选空间且已过期，自动切换回幸运空间。
   *
   * 检查内容：
   * - isUnlocked: 是否已解锁
   * - unlockTime: 解锁时间戳
   * - expiryTime: 过期时间戳
   * - unlockCost: 解锁费用
   * - unlockDuration: 解锁时长（小时）
   * - failureReasons: 不满足条件的原因
   *
   *
   * @example
   * // 页面加载时检查
   * await this.checkPremiumUnlockStatus()
   */
  async checkPremiumUnlockStatus() {
    // 🔴 后端尚未实现臻选空间解锁状态API
    // 📋 待后端实现: GET /api/v4/backpack/exchange/premium-status
    // 当前保持默认未解锁状态，不调用不存在的API
    console.log('🔍 臻选空间解锁状态检查（后端API待实现，当前保持默认状态）')
  },

  /**
   * 处理臻选空间解锁
   *
   * @description
   * 检查用户是否满足解锁条件，如果满足则显示解锁确认弹窗。
   *
   * 解锁条件（后端检查）：
   * 1. 历史累计积分 ≥ 10000
   * 2. 可用积分余额 ≥ 1000（解锁费用）
   * 3. 账号状态正常
   *
   * 执行流程：
   * 1. 调用后端API获取解锁状态
   * 2. 检查canUnlock标识
   * 3. 不满足：显示具体原因和赚积分入口
   * 4. 满足：显示解锁确认弹窗
   * 5. 确认后调用unlockPremiumSpace()执行解锁
   *
   *
   * @example
   * // 用户点击臻选空间时调用
   * await this.handlePremiumUnlock()
   */
  async handlePremiumUnlock() {
    // 🔴 后端尚未实现臻选空间解锁API
    // 📋 待后端实现: POST /api/v4/backpack/exchange/unlock-premium
    console.log('🔍 臻选空间解锁功能（后端API待实现）')

    wx.showModal({
      title: '功能开发中',
      content: '臻选空间解锁功能正在开发中，敬请期待！',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /**
   * 解锁臻选空间
   *
   * @description
   * 调用后端API执行臻选空间解锁操作（扣除积分并设置48小时有效期）。
   *
   * ⚠️ 注意：V4.0后端API暂未实现此功能，当前显示开发中提示。
   *
   * 预期API：
   * - 路径：/api/v4/unified-engine/inventory/unlock-premium
   * - 功能：用户支付积分解锁高级商品空间
   * - 费用：1000积分
   * - 时长：48小时
   *
   *
   * @example
   * // 用户确认解锁后调用
   * await this.unlockPremiumSpace()
   */
  async unlockPremiumSpace() {
    // 🚨 V4.0后端API暂未提供unlockPremiumSpace接口
    wx.showModal({
      title: '⚠️ 功能开发中',
      content: '臻选空间解锁功能正在开发中，敬请期待！',
      showCancel: false,
      confirmText: '我知道了'
    })

    console.warn('⚠️ V4.0后端API暂未实现unlockPremiumSpace功能')
    console.warn('📋 待实现的API路径: /api/v4/unified-engine/inventory/unlock-premium')
    console.warn('📋 预期功能: 用户支付积分解锁高级商品空间')
  },

  /**
   * 初始化布局参数
   *
   * @description
   * 获取系统窗口信息并计算瀑布流布局参数。
   * 使用wx.getWindowInfo替代已弃用的wx.getSystemInfo。
   *
   * 计算内容：
   * - containerWidth：容器宽度（窗口宽度 - 40px padding）
   * - columnWidth：列宽度（容器宽度 - 20px gap）/ 2
   *
   *
   * @example
   * // 切换到商品兑换时调用
   * this.initLayoutParams()
   */
  initLayoutParams() {
    // 🔑 wx.getWindowInfo是同步API，直接返回结果
    try {
      const res = wx.getWindowInfo()
      // 减去padding
      const containerWidth = res.windowWidth - 40
      // 两列，减去gap
      const columnWidth = Math.floor((containerWidth - 20) / 2)

      this.setData({
        containerWidth,
        columnWidth
      })

      console.log('✅ 布局参数初始化完成:', {
        windowWidth: res.windowWidth,
        containerWidth,
        columnWidth
      })
    } catch (err) {
      console.error('❌ 获取窗口信息失败:', err)
      // 🔑 提供fallback默认值
      this.setData({
        // 默认容器宽度
        containerWidth: 335,
        // 默认列宽
        columnWidth: 157
      })
    }
  },

  /**
   * 计算瀑布流布局（安全版本）
   *
   * @description
   * 安全版本的瀑布流布局计算，包含完整的错误处理。
   *
   * 计算逻辑：
   * 1. 验证商品数据有效性
   * 2. 遍历商品并计算位置
   * 3. 根据图片比例计算高度
   * 4. 分配到高度较低的列
   * 5. 更新列高度
   * 6. 过滤无效商品（null）
   *
   *
   * @example
   * // 数据加载完成后调用
   * this.calculateWaterfallLayoutSafe()
   */
  calculateWaterfallLayoutSafe() {
    try {
      const products = this.data.waterfallProducts || []
      const columnWidth = this.data.columnWidth || 157

      // 🔑 安全性检查
      if (!Array.isArray(products) || products.length === 0) {
        console.warn('⚠️ 商品数据为空或无效')
        this.setData({
          waterfallProducts: [],
          containerHeight: 300
        })
        return
      }

      let leftHeight = 0
      let rightHeight = 0

      const layoutProducts = products
        .map((product, index) => {
          try {
            if (!product || typeof product !== 'object') {
              console.warn(`⚠️ 商品${index}数据无效，跳过`)
              return null
            }

            const imageRatio = product.imageRatio || 1.2
            const itemHeight = Math.floor(columnWidth * imageRatio) + 120

            // 选择较短的列
            const useLeft = leftHeight <= rightHeight
            const left = useLeft ? 10 : columnWidth + 20
            const top = useLeft ? leftHeight : rightHeight

            if (useLeft) {
              leftHeight += itemHeight + 20
            } else {
              rightHeight += itemHeight + 20
            }

            return {
              ...product,
              left,
              top,
              width: columnWidth,
              height: itemHeight
            }
          } catch (itemError) {
            console.error(`❌ 处理商品${index}布局时出错:`, itemError)
            return null
          }
        })
        // 过滤掉null值
        .filter(Boolean)

      this.setData({
        waterfallProducts: layoutProducts,
        containerHeight: Math.max(leftHeight, rightHeight) || 300
      })
    } catch (error) {
      console.error('❌ 瀑布流布局计算失败:', error)
      this.setData({
        waterfallProducts: [],
        containerHeight: 300
      })
    }
  },

  /**
   * 轮播图变化事件
   *
   * @description
   * 当臻选空间的轮播图切换时触发，更新当前索引。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.current - 当前轮播图索引
   *
   * @example
   * // WXML中绑定
   * <swiper bindchange="onCarouselChange">
   */
  onCarouselChange(e) {
    this.setData({
      carouselActiveIndex: e.detail.current
    })
  },

  /**
   * 商品点击事件
   *
   * @description
   * 用户点击商品卡片时触发，显示兑换确认弹窗。
   *
   * 执行流程：
   * 1. 获取商品数据
   * 2. 记录选中商品
   * 3. 显示兑换确认弹窗
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.product - 商品对象
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onProductTap" data-product="{{item}}">
   */
  onProductTap(e) {
    const product = e.currentTarget.dataset.product
    console.log('🎁 点击商品:', product)

    // 显示商品详情或执行兑换逻辑
    this.setData({
      selectedProduct: product,
      showConfirm: true
    })
  },

  /**
   * 竞价按钮点击
   *
   * @description
   * 用户点击竞价按钮，显示竞价输入弹窗。
   * 自动设置起始竞价金额（当前价格 + 最小加价）。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.product - 商品对象
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onBidTap" data-product="{{item}}">竞价</button>
   */
  onBidTap(e) {
    const product = e.currentTarget.dataset.product
    console.log('🏷️ 点击竞价:', product)

    this.setData({
      selectedBidProduct: product,
      showBidModal: true,
      userBidAmount: product.current_price + product.min_bid_increment
    })
  },

  /**
   * 竞价金额输入
   *
   * @description
   * 用户输入竞价金额时触发，更新竞价金额状态。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 输入的金额值
   *
   * @example
   * // WXML中绑定
   * <input bindinput="onBidAmountInput" type="digit" />
   */
  onBidAmountInput(e) {
    this.setData({
      userBidAmount: parseFloat(e.detail.value) || 0
    })
  },

  /**
   * 确认竞价
   *
   * @description
   * 用户确认竞价操作，验证并提交竞价。
   *
   * 验证规则：
   * 1. 竞价金额 ≥ 当前价格 + 最小加价
   * 2. 竞价金额 ≤ 用户积分余额
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onConfirmBid">确认竞价</button>
   */
  async onConfirmBid() {
    const { selectedBidProduct, userBidAmount } = this.data

    if (userBidAmount < selectedBidProduct.current_price + selectedBidProduct.min_bid_increment) {
      showToast({
        title: '出价金额不足',
        icon: 'none'
      })
      return
    }

    if (userBidAmount > this.data.totalPoints) {
      showToast({
        title: '积分余额不足',
        icon: 'none'
      })
      return
    }

    try {
      // 🔴 V4.0修正: 删除模拟竞价API调用，明确提示功能未开放
      // 原代码使用setTimeout模拟API，违反项目规则
      showToast({
        title: '竞价功能暂未开放',
        icon: 'none',
        duration: 2000
      })

      this.setData({
        showBidModal: false,
        selectedBidProduct: null,
        userBidAmount: 0
      })

      console.warn('⚠️ 竞价功能暂未实现，等待后端API开发')

      // 刷新商品数据
      this.refreshMarketData()
    } catch (_error) {
      // 💡 错误提示由APIClient自动处理，无需手动hideLoading和showToast
      console.error('❌ 竞价失败:', _error)
    }
  },

  /**
   * 取消竞价
   *
   * @description
   * 用户点击取消按钮，关闭竞价弹窗并清空输入。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onCancelBid">取消</button>
   */
  onCancelBid() {
    this.setData({
      showBidModal: false,
      selectedBidProduct: null,
      userBidAmount: 0
    })
  },

  /**
   * 刷新市场数据
   *
   * @description
   * 根据当前空间类型刷新对应的市场数据。
   * - 幸运空间：调用initLuckySpaceData
   * - 臻选空间：调用initPremiumSpaceData
   *
   *
   * @example
   * // 竞价成功后刷新
   * await this.refreshMarketData()
   */
  async refreshMarketData() {
    if (this.data.currentSpace === 'lucky') {
      await this.initLuckySpaceData()
    } else if (this.data.currentSpace === 'premium') {
      await this.initPremiumSpaceData()
    }
  },

  // ============================================
  // 🛠️ 数据转换和工具方法
  // ============================================

  /**
   * 转换商品数据为瀑布流格式
   *
   * @description
   * 将后端返回的商品数据转换为瀑布流组件所需的格式。
   * 仅使用后端真实数据，不生成任何模拟数据。
   *
   * 数据转换：
   * - id, name：必须字段，缺失则跳过
   * - image：默认使用default-product.png
   * - price：使用exchange_points字段
   * - 其他字段：保持原值或使用默认值
   *
   * products - 后端返回的商品数组
   *
   * @example
   * const waterfallData = this.convertToWaterfallData(products)
   * this.setData({ waterfallProducts: waterfallData })
   */
  convertToWaterfallData(products) {
    // 🔑 安全性检查
    if (!products || !Array.isArray(products)) {
      console.warn('⚠️ convertToWaterfallData: 传入的products无效，返回空数组')
      return []
    }

    try {
      return (
        products
          .map((item, index) => {
            // 🔑 确保每个item都是有效对象
            if (!item || typeof item !== 'object') {
              console.warn(`⚠️ convertToWaterfallData: 第${index}个商品数据无效:`, item)
              return null
            }

            // 🔴 只使用后端真实数据，不生成任何模拟数据
            if (!item.name || !item.id) {
              console.warn(`⚠️ 商品数据不完整，缺少必要字段，跳过索引 ${index}: `, item)
              return null
            }

            return {
              // 🔴 使用后端真实数据，不设置默认值
              id: item.id,
              name: item.name,
              image: item.image || '/images/products/default-product.png',
              price: item.exchange_points || 0,
              originalPrice: item.originalPrice || null,
              discount: item.discount || 0,
              rating: item.rating || null,
              sales: item.sales || 0,
              tags: item.tags || [],
              isLucky: item.isLucky || false,
              isHot: item.is_hot || false,
              isNew: item.isNew || false,
              seller: item.seller || null,
              imageRatio: item.imageRatio || 1.0,
              createdAt: item.createdAt || item.created_time || null,
              description: item.description || '',
              stock: item.stock || 0,
              category: item.category || ''
            }
          })
          // 过滤掉null值
          .filter(Boolean)
      )
    } catch (error) {
      console.error('❌ convertToWaterfallData 转换失败:', error)
      return []
    }
  },

  /**
   * 计算平均折扣
   *
   * @description
   * 根据商品原价和现价计算平均折扣率。
   * 用于商品列表的营销展示。
   *
   * products - 商品数组
   *
   * @example
   * const avgDiscount = this.calculateAvgDiscount(products)
   * // 15 (表示平均15%的折扣)
   */
  calculateAvgDiscount(products) {
    if (!products || products.length === 0) {
      return 15
    }

    const validProducts = products.filter(p => p.exchange_points)
    if (validProducts.length === 0) {
      return 0
    }

    const totalDiscount = validProducts.reduce((sum, product) => {
      const originalPrice = product.exchange_points * 1.3
      const currentPrice = product.exchange_points
      const discount = ((originalPrice - currentPrice) / originalPrice) * 100
      return sum + discount
    }, 0)

    return Math.floor(totalDiscount / validProducts.length)
  },

  /**
   * 创建卡片分组
   *
   * @description
   * 将商品数据分组为不同的主题卡片：
   * - 热销爆款（前5个商品）
   * - 新品首发（第6-10个商品）
   * - 品质臻选（第11-15个商品）
   *
   * 每个分组有独立的样式和营销文案。
   *
   * products - 商品数组
   *
   * @example
   * const sections = this.createCardSections(products)
   * this.setData({ cardSections: sections })
   */
  createCardSections(products) {
    const sections = [
      {
        id: 'hot',
        title: '🔥 热销爆款',
        subtitle: '限时特惠，抢完即止',
        icon: '🔥',
        backgroundColor: 'linear-gradient(135deg, #ff6b35, #f7931e)',
        titleColor: '#fff',
        products: products.slice(0, 5)
      },
      {
        id: 'new',
        title: '✨ 新品首发',
        subtitle: '新鲜上架，抢先体验',
        icon: '✨',
        backgroundColor: 'linear-gradient(135deg, #667eea, #764ba2)',
        titleColor: '#fff',
        products: products.slice(5, 10)
      },
      {
        id: 'premium',
        title: '💎 品质臻选',
        subtitle: '精心挑选，品质保证',
        icon: '💎',
        backgroundColor: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
        titleColor: '#fff',
        products: products.slice(10, 15)
      }
    ]

    return sections.map(section => ({
      ...section,
      products: section.products.map(product => ({
        ...product,
        discount: Math.floor(Math.random() * 25) + 5,
        isHot: Math.random() > 0.6,
        isNew: Math.random() > 0.7,
        sellPoint: this.generateSellPoint()
      }))
    }))
  },

  /**
   * 获取轮播背景色
   *
   * @description
   * 根据索引返回预定义的渐变背景色，用于轮播图背景。
   * 使用取模运算循环使用5种背景色。
   *
   * index - 轮播图索引
   *
   * @example
   * const bg = this.getCarouselBackground(0)
   * // 'linear-gradient(135deg, #667eea, #764ba2)'
   */
  getCarouselBackground(index) {
    const backgrounds = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)'
    ]
    return backgrounds[index % backgrounds.length]
  },

  /**
   * 生成随机营销标语
   *
   * @description
   * 从预定义的5个营销标语中随机选择一个。
   * 用于商品卡片的卖点展示。
   *
   *
   * @example
   * const sellPoint = this.generateSellPoint()
   * // '限时特价，抢完即止' 或其他随机标语
   */
  generateSellPoint() {
    const sellPoints = [
      '限时特价，抢完即止',
      '品质保证，售后无忧',
      '新品首发，抢先体验',
      '热销爆款，人气之选',
      '精选推荐，不容错过'
    ]
    return sellPoints[Math.floor(Math.random() * sellPoints.length)]
  },

  // ============================================
  // 🔧 错误处理和状态管理方法
  // ============================================

  /**
   * 设置错误状态
   *
   * @description
   * 当数据加载失败时，设置页面错误状态并清空所有商品数据。
   * 不使用任何模拟数据，完全依赖后端API。
   *
   * 设置内容：
   * - 清空所有商品数据（瀑布流、轮播、卡片、列表）
   * - 显示错误信息和详情
   * - 重置统计数据
   * - 显示用户友好的Toast提示
   *
   * errorMessage - 错误消息（简短）
   * errorDetail - 错误详情（详细说明）
   * [specificData={}] - 额外的特定数据（可选）
   *
   * @example
   * this.setErrorState('加载失败', '后端服务不可用，请稍后重试')
   *
   * @example
   * this.setErrorState('数据异常', '商品数据格式错误', { errorCode: 500 })
   */
  setErrorState(errorMessage, errorDetail, specificData = {}) {
    console.log('⚠️ 设置错误状态:', errorMessage)

    // 🔴 完全不使用任何模拟数据，只设置错误状态
    const baseErrorData = {
      loading: false,
      refreshing: false,
      hasError: true,
      errorMessage,
      errorDetail,
      // 清空所有商品数据，仅依赖真实后端API
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

    // 显示用户友好的错误提示
    showToast({
      title: errorMessage,
      icon: 'none',
      duration: DELAY.RETRY
    })
  },

  // ============================================
  // 🔍 搜索和筛选功能方法（修复缺失的UI交互方法）
  // ============================================

  /**
   * 搜索输入处理（防抖）
   *
   * @description
   * 用户输入搜索关键词时触发，使用500ms防抖延迟。
   * 重置页码到第1页并应用筛选。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 输入的搜索关键词
   *
   * @example
   * // WXML中绑定
   * <input bindinput="onSearchInput" placeholder="搜索商品" />
   */
  onSearchInput: debounce(function (e) {
    const keyword = e.detail.value.trim()
    console.log('🔍 搜索关键词:', keyword)

    this.setData({
      searchKeyword: keyword,
      currentPage: 1
    })

    this.applyFilters()
  }, 500),

  /**
   * 筛选条件变更事件
   *
   * @description
   * 用户点击筛选按钮（全部/热门/新品/特惠）时触发。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.filter - 筛选类型（'all'|'hot'|'new'|'sale'）
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onFilterChange" data-filter="hot">热门</button>
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('🔍 切换筛选:', filter)

    this.setData({
      currentFilter: filter,
      currentPage: 1
    })

    this.applyFilters()
  },

  /**
   * 切换高级筛选面板
   *
   * @description
   * 显示或隐藏高级筛选面板（分类、积分范围、库存、排序）。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onToggleAdvancedFilter">高级筛选</button>
   */
  onToggleAdvancedFilter() {
    const { showAdvancedFilter } = this.data
    console.log('🔍 切换高级筛选:', !showAdvancedFilter)

    this.setData({
      showAdvancedFilter: !showAdvancedFilter
    })
  },

  /**
   * 商品分类筛选变更
   *
   * @description
   * 用户选择商品分类（全部/食品/饮料/日用品等）时触发。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.category - 分类标识
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onCategoryFilterChange" data-category="food">食品</button>
   */
  onCategoryFilterChange(e) {
    const category = e.currentTarget.dataset.category
    console.log('🔍 切换分类筛选:', category)

    this.setData({
      categoryFilter: category,
      currentPage: 1
    })

    this.applyAdvancedFilters()
  },

  /**
   * 积分范围筛选变更
   *
   * @description
   * 用户选择积分范围（全部/0-100/100-500/500+）时触发。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.range - 积分范围标识
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onPointsRangeChange" data-range="0-100">0-100积分</button>
   */
  onPointsRangeChange(e) {
    const range = e.currentTarget.dataset.range
    console.log('🔍 切换积分范围:', range)

    this.setData({
      pointsRange: range,
      currentPage: 1
    })

    this.applyAdvancedFilters()
  },

  /**
   * 库存状态筛选变更
   *
   * @description
   * 用户选择库存状态（全部/有货/缺货）时触发。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.filter - 库存筛选标识（'all'|'in_stock'|'out_of_stock'）
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onStockFilterChange" data-filter="in_stock">有货</button>
   */
  onStockFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('🔍 切换库存筛选:', filter)

    this.setData({
      stockFilter: filter,
      currentPage: 1
    })

    this.applyAdvancedFilters()
  },

  /**
   * 排序方式变更
   *
   * @description
   * 用户选择排序方式（默认/积分升序/积分降序/销量）时触发。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.sort - 排序方式（'default'|'points_asc'|'points_desc'|'sales'）
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onSortByChange" data-sort="points_asc">积分升序</button>
   */
  onSortByChange(e) {
    const sort = e.currentTarget.dataset.sort
    console.log('🔍 切换排序:', sort)

    this.setData({
      sortBy: sort,
      currentPage: 1
    })

    this.applyAdvancedFilters()
  },

  /**
   * 重置所有筛选条件
   *
   * @description
   * 将所有筛选条件重置为默认值，包括：
   * - 基础筛选：全部
   * - 分类：全部
   * - 积分范围：全部
   * - 库存：全部
   * - 排序：默认
   * - 搜索关键词：清空
   * - 页码：第1页
   * - 高级筛选面板：关闭
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onResetFilters">重置筛选</button>
   */
  onResetFilters() {
    console.log('🔄 重置所有筛选条件')

    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1,
      showAdvancedFilter: false
    })

    this.applyFilters()

    showToast({
      title: '✅ 筛选已重置',
      icon: 'success'
    })
  },

  /**
   * 应用高级筛选条件
   *
   * @description
   * 根据所有筛选条件（搜索、分类、积分范围、库存、排序）过滤商品列表。
   *
   * 筛选逻辑：
   * 1. 搜索关键词匹配（商品名称、描述）
   * 2. 基础筛选（可兑换、低价优先等）
   * 3. 分类筛选
   * 4. 积分范围筛选
   * 5. 库存筛选
   * 6. 排序处理
   * 7. 更新分页信息
   *
   *
   * @example
   * // 筛选条件变更后调用
   * this.applyAdvancedFilters()
   */
  applyAdvancedFilters() {
    const {
      products,
      searchKeyword,
      currentFilter,
      categoryFilter,
      pointsRange,
      stockFilter,
      sortBy,
      totalPoints
    } = this.data

    let filtered = [...products]

    // 基础搜索筛选
    if (searchKeyword) {
      filtered = filtered.filter(
        product =>
          product.name.includes(searchKeyword) ||
          (product.description && product.description.includes(searchKeyword))
      )
    }

    // 基础筛选
    switch (currentFilter) {
      case 'available':
        filtered = filtered.filter(
          product => product.stock > 0 && totalPoints >= product.exchange_points
        )
        break
      case 'low-price':
        filtered = filtered.sort((a, b) => a.exchange_points - b.exchange_points)
        break
      default:
        break
    }

    // 分类筛选
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(
        product =>
          product.category === categoryFilter ||
          (product.tags && product.tags.includes(categoryFilter))
      )
    }

    // 积分范围筛选
    // 🚨 警告：以下积分范围是硬编码的业务数据，应从后端获取
    // 📋 TODO: 实现 API.getProductFilterConfig() 接口
    // 📄 参考文档：docs/后端API需求文档_系统配置和筛选配置.md
    if (pointsRange !== 'all') {
      console.warn('⚠️ 使用硬编码的积分范围筛选，建议后端提供配置')

      switch (pointsRange) {
        case '0-500':
          filtered = filtered.filter(product => product.exchange_points <= 500)
          break
        case '500-1000':
          filtered = filtered.filter(
            product => product.exchange_points > 500 && product.exchange_points <= 1000
          )
          break
        case '1000-2000':
          filtered = filtered.filter(
            product => product.exchange_points > 1000 && product.exchange_points <= 2000
          )
          break
        case '2000+':
          filtered = filtered.filter(product => product.exchange_points > 2000)
          break
        default:
          // 保持默认筛选
          break
      }
    }

    // 库存状态筛选
    // 🚨 警告：以下库存阈值是硬编码的业务数据，应从后端获取
    // 📋 TODO: 实现 API.getProductFilterConfig() 接口
    // 📄 参考文档：docs/后端API需求文档_系统配置和筛选配置.md
    if (stockFilter !== 'all') {
      console.warn('⚠️ 使用硬编码的库存阈值（10件），建议后端提供配置')

      // ⚠️ 临时硬编码值（等待后端提供配置）
      const LOW_STOCK_THRESHOLD = 10
      const IN_STOCK_THRESHOLD = 10

      switch (stockFilter) {
        case 'in-stock':
          filtered = filtered.filter(product => product.stock > IN_STOCK_THRESHOLD)
          break
        case 'low-stock':
          filtered = filtered.filter(
            product => product.stock > 0 && product.stock <= LOW_STOCK_THRESHOLD
          )
          break
        default:
          // 保持默认筛选
          break
      }
    }

    // 排序
    switch (sortBy) {
      case 'points-asc':
        filtered = filtered.sort((a, b) => a.exchange_points - b.exchange_points)
        break
      case 'points-desc':
        filtered = filtered.sort((a, b) => b.exchange_points - a.exchange_points)
        break
      case 'rating-desc':
        filtered = filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0))
        break
      case 'stock-desc':
        filtered = filtered.sort((a, b) => (b.stock || 0) - (a.stock || 0))
        break
      default:
        // 保持默认排序
        break
    }

    this.setData({
      filteredProducts: filtered
    })

    console.log(`✅ 高级筛选完成，从${products.length}个商品筛选出${filtered.length}个`)
  },

  /**
   * 应用筛选条件
   */
  applyFilters() {
    const { products, searchKeyword, currentFilter, totalPoints } = this.data
    let filtered = [...products]

    // 搜索筛选
    if (searchKeyword) {
      filtered = filtered.filter(
        product =>
          product.name.includes(searchKeyword) ||
          (product.description && product.description.includes(searchKeyword))
      )
    }

    // 基础筛选
    switch (currentFilter) {
      case 'available':
        filtered = filtered.filter(
          product => product.stock > 0 && totalPoints >= product.exchange_points
        )
        break
      case 'low-price':
        filtered = filtered.sort((a, b) => a.exchange_points - b.exchange_points)
        break
      default:
        // 保持原有顺序
        break
    }

    this.setData({
      filteredProducts: filtered
    })

    console.log(`✅ 筛选完成，从${products.length}个商品筛选出${filtered.length}个`)
  },

  /**
   * 刷新商品列表
   */
  async onRefreshProducts() {
    console.log('🔧 手动刷新商品列表')

    // 🚨 修复：在商品兑换模式下刷新幸运空间数据而非商品列表
    if (this.data.currentTab === 'market') {
      console.log('🏪 商品兑换模式，刷新幸运空间数据')

      try {
        // 💡 loading由APIClient自动处理
        await this.initLuckySpaceData()
        showToast({
          title: '✅ 刷新成功',
          icon: 'success'
        })
      } catch (error) {
        // 💡 错误提示由APIClient自动处理
        console.error('❌ 刷新失败:', error)
      }
      return
    }

    try {
      // 💡 loading由APIClient自动处理
      await this.loadProducts()
      showToast({
        title: '✅ 刷新成功',
        icon: 'success'
      })
    } catch (error) {
      // 💡 错误提示由APIClient自动处理
      console.error('❌ 刷新失败:', error)
      showToast({
        title: '刷新失败，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 按积分升序排序
   *
   * @description
   * 将商品列表按照兑换积分从低到高排序。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onSortByPoints">积分升序</button>
   */
  onSortByPoints() {
    console.log('🔍 按积分排序')

    const { filteredProducts } = this.data
    const sorted = [...filteredProducts].sort((a, b) => a.exchange_points - b.exchange_points)

    this.setData({
      filteredProducts: sorted,
      sortBy: 'points-asc'
    })

    showToast({
      title: '已按积分升序排列',
      icon: 'success'
    })
  },

  /**
   * 图片加载错误处理
   *
   * @description
   * 当商品图片加载失败时，替换为默认图片并标记错误状态。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.index - 商品索引
   *
   * @example
   * // WXML中绑定
   * <image src="{{item.image}}" binderror="onImageError" data-index="{{index}}" />
   */
  onImageError(e) {
    const { index } = e.currentTarget.dataset
    console.log(`⚠️ 图片加载失败 [${index}]`)

    // 更新对应商品的图片状态
    this.setData({
      [`filteredProducts[${index}].imageStatus`]: 'error',
      [`filteredProducts[${index}].image`]: '/images/default-product.png'
    })
  },

  /**
   * 图片加载成功处理
   *
   * @description
   * 当商品图片加载成功时，标记为已加载状态。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.index - 商品索引
   *
   * @example
   * // WXML中绑定
   * <image src="{{item.image}}" bindload="onImageLoad" data-index="{{index}}" />
   */
  onImageLoad(e) {
    const { index } = e.currentTarget.dataset
    console.log(`✅ 图片加载成功 [${index}]`)

    // 更新对应商品的图片状态
    this.setData({
      [`filteredProducts[${index}].imageStatus`]: 'loaded'
    })
  },

  /**
   * 预览商品图片
   *
   * @description
   * 点击商品图片时，调用微信API预览大图。
   * 不预览默认图片。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.url - 图片URL
   *
   * @example
   * // WXML中绑定
   * <image bindtap="onPreviewImage" data-url="{{item.image}}" />
   */
  onPreviewImage(e) {
    const { url } = e.currentTarget.dataset
    console.log('🖼️ 预览图片:', url)

    if (url && url !== '/images/default-product.png') {
      wx.previewImage({
        current: url,
        urls: [url],
        success: () => {
          console.log('✅ 图片预览成功')
        },
        fail: error => {
          console.error('❌ 图片预览失败:', error)
          showToast({
            title: '图片预览失败',
            icon: 'none'
          })
        }
      })
    }
  },

  // ============================================
  // 🎁 兑换弹窗事件处理方法（修复缺失的方法）
  // ============================================

  /**
   * 取消兑换操作
   *
   * @description
   * 用户点击"取消"按钮，关闭兑换确认弹窗并清空选中商品。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onCancelExchange">取消</button>
   */
  onCancelExchange() {
    console.log('❌ 取消兑换操作')

    // 关闭确认弹窗，清空选中商品
    this.setData({
      showConfirm: false,
      selectedProduct: null
    })

    console.log('✅ 兑换确认弹窗已关闭')
  },

  /**
   * 确认兑换操作
   *
   * @description
   * 用户点击"确认兑换"按钮，执行交易流程。
   *
   * 执行流程：
   * 1. 验证商品是否选中
   * 2. 验证用户积分是否充足
   * 3. 验证商品库存是否充足
   * 4. 防止重复提交（exchanging状态锁）
   * 5. 调用V4.0兑换API（exchangeProduct）
   * 6. 更新用户积分余额
   * 7. 显示兑换结果弹窗
   * 8. 刷新商品列表（更新库存）
   * 9. 异常处理：根据错误类型显示不同提示
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onConfirmExchange">确认兑换</button>
   */
  async onConfirmExchange() {
    console.log('✅ 确认兑换操作')

    const { selectedProduct, totalPoints } = this.data

    // 基础验证
    if (!selectedProduct) {
      console.error('❌ 未选择商品')
      showToast({
        title: '请选择要兑换的商品',
        icon: 'none'
      })
      return
    }

    // 积分验证
    if (totalPoints < selectedProduct.exchange_points) {
      console.error('❌ 积分不足')
      showToast({
        title: '积分余额不足',
        icon: 'none'
      })
      return
    }

    // 库存验证
    if (selectedProduct.stock <= 0) {
      console.error('❌ 商品缺货')
      showToast({
        title: '商品库存不足',
        icon: 'none'
      })
      return
    }

    // 设置兑换中状态，防止重复点击
    if (this.data.exchanging) {
      console.log('⏳ 正在兑换中，请勿重复操作')
      return
    }

    this.setData({ exchanging: true })
    // 💡 loading由APIClient自动处理，无需手动showLoading

    try {
      // 🔴 V4.0 调用兑换API（loading自动处理）
      const response = await exchangeProduct(selectedProduct.id, 1)

      if (response && response.success && response.data) {
        // 兑换成功 - 使用后端返回的真实数据
        console.log('✅ 兑换成功:', response.data)

        // 🔴 从后端响应获取兑换后的真实积分，不在前端本地计算
        const { getPointsBalance } = API
        let latestPoints = totalPoints
        try {
          const balanceResult = await getPointsBalance()
          if (balanceResult && balanceResult.success && balanceResult.data) {
            latestPoints = balanceResult.data.available_amount || 0
          }
        } catch (balanceError) {
          console.warn('⚠️ 兑换后刷新积分失败，使用本地估算值:', balanceError)
          latestPoints = totalPoints - selectedProduct.exchange_points
        }

        // 显示兑换结果（积分以后端API返回为准）
        this.setData({
          showConfirm: false,
          selectedProduct: null,
          exchanging: false,
          showResult: true,
          totalPoints: latestPoints,
          resultData: {
            product: selectedProduct,
            orderId: response.data.order_id || response.data.orderId,
            pointsDeducted: selectedProduct.exchange_points,
            remainingPoints: latestPoints
          }
        })

        // 更新全局积分缓存
        const appInstance = getApp()
        if (appInstance) {
          appInstance.updatePointsBalance(latestPoints)
        }

        console.log('🎉 兑换流程完成')

        // 刷新商品列表（更新库存）
        setTimeout(() => {
          this.loadProducts()
        }, 1000)
      } else {
        throw new Error((response && response.msg) || (response && response.message) || '兑换失败')
      }
    } catch (error) {
      console.error('❌ 兑换失败:', error)

      this.setData({ exchanging: false })
      // 💡 loading由APIClient自动处理，无需手动hideLoading

      // 根据错误类型显示不同的提示
      let errorMessage = '兑换失败，请重试'

      if (error.statusCode === 401) {
        errorMessage = '登录状态异常，请重新登录'
      } else if (error.statusCode === 400) {
        errorMessage = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        errorMessage = '商品库存不足或积分余额不足'
      } else if (error.message) {
        errorMessage = error.message
      }

      wx.showModal({
        title: '🚨 兑换失败',
        content: errorMessage,
        showCancel: true,
        cancelText: '重试',
        confirmText: '我知道了',
        success: res => {
          if (res.cancel) {
            // 用户选择重试
            setTimeout(() => {
              this.onConfirmExchange()
            }, 1000)
          }
        }
      })
    }
  },

  /**
   * 关闭兑换结果弹窗
   *
   * @description
   * 关闭兑换成功后的结果弹窗，清空结果数据。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onCloseResult">关闭</button>
   */
  onCloseResult() {
    console.log('📝 关闭兑换结果弹窗')

    // 关闭结果弹窗，清空结果数据
    this.setData({
      showResult: false,
      resultData: null
    })

    console.log('✅ 兑换结果弹窗已关闭')
  },

  /**
   * 上一页
   *
   * @description
   * 跳转到上一页商品列表。
   * 当前页大于1时才能跳转。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onPrevPage">上一页</button>
   */
  onPrevPage() {
    const { currentPage } = this.data
    if (currentPage > 1) {
      this.setData({
        currentPage: currentPage - 1
      })
      this.loadCurrentPageProducts()
      console.log(`📖 切换到第 ${currentPage - 1} 页`)
    }
  },

  /**
   * 下一页
   *
   * @description
   * 跳转到下一页商品列表。
   * 当前页小于总页数时才能跳转。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onNextPage">下一页</button>
   */
  onNextPage() {
    const { currentPage, totalPages } = this.data
    if (currentPage < totalPages) {
      this.setData({
        currentPage: currentPage + 1
      })
      this.loadCurrentPageProducts()
      console.log(`📖 切换到第 ${currentPage + 1} 页`)
    }
  },

  /**
   * 跳转到指定页
   *
   * @description
   * 用户点击页码按钮，跳转到指定页。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素数据集
   * e.currentTarget.dataset.page - 目标页码（字符串）
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onPageChange" data-page="{{index}}">{{index}}</button>
   */
  onPageChange(e) {
    const { page } = e.currentTarget.dataset
    const targetPage = parseInt(page)

    if (targetPage !== this.data.currentPage) {
      this.setData({
        currentPage: targetPage
      })
      this.loadCurrentPageProducts()
      console.log(`📖 跳转到第 ${targetPage} 页`)
    }
  },

  /**
   * 页码输入框变化
   *
   * @description
   * 用户在页码输入框中输入时触发，保存输入的页码。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 输入的页码值
   *
   * @example
   * // WXML中绑定
   * <input bindinput="onPageInputChange" type="number" />
   */
  onPageInputChange(e) {
    this.setData({
      pageInputValue: e.detail.value
    })
  },

  /**
   * 页码输入确认
   *
   * @description
   * 用户按下回车或点击"确定"，跳转到输入的页码。
   * 验证页码有效性（1~总页数）并显示友好提示。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 输入的页码值
   *
   * @example
   * // WXML中绑定
   * <input bindconfirm="onPageInputConfirm" type="number" />
   */
  onPageInputConfirm(e) {
    const { totalPages } = this.data
    const inputValue = e.detail.value || this.data.pageInputValue
    const targetPage = parseInt(inputValue)

    console.log(`📖 输入跳转页码: ${targetPage}`)

    if (isNaN(targetPage)) {
      showToast({
        title: '请输入有效页码',
        icon: 'none'
      })
      return
    }

    if (targetPage < 1 || targetPage > totalPages) {
      showToast({
        title: `页码范围: 1 - ${totalPages}`,
        icon: 'none'
      })
      return
    }

    if (targetPage !== this.data.currentPage) {
      this.setData({
        currentPage: targetPage,
        // 清空输入框
        pageInputValue: ''
      })
      this.loadCurrentPageProducts()

      showToast({
        title: `已跳转到第 ${targetPage} 页`,
        icon: 'success'
      })
    }
  },

  /**
   * 加载当前页商品数据
   *
   * @description
   * 根据当前页码和每页显示数量，从全部商品中提取当前页的商品。
   *
   * 计算逻辑：
   * - startIndex = (currentPage - 1) × pageSize
   * - endIndex = min(startIndex + pageSize, 总商品数)
   * - 提取products[startIndex : endIndex]
   *
   *
   * @example
   * // 切换页码后调用
   * this.setData({ currentPage: 2 })
   * this.loadCurrentPageProducts()
   */
  loadCurrentPageProducts() {
    const { products, currentPage, pageSize } = this.data

    // 计算当前页的商品范围
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, products.length)

    // 提取当前页的商品
    const currentPageProducts = products.slice(startIndex, endIndex)

    console.log(
      `📖 加载第${currentPage}页商品 [${startIndex}-${endIndex - 1}], 共${currentPageProducts.length}个`
    )

    // 更新显示的商品列表
    this.setData({
      filteredProducts: currentPageProducts
    })

    // 重新应用筛选条件（如果需要的话）
    this.applyFilters()
  },

  /**
   * 计算总页数
   *
   * @description
   * 根据商品总数和每页显示数量，计算总页数。
   *
   * 计算公式：
   * - totalPages = Math.ceil(商品总数 / 每页数量)
   * - 最小为1页（即使没有商品）
   *
   *
   * @example
   * // 商品加载完成后调用
   * this.setData({ products: loadedProducts })
   * this.calculateTotalPages()
   */
  calculateTotalPages() {
    const { products, pageSize } = this.data
    const totalPages = Math.max(1, Math.ceil(products.length / pageSize))

    this.setData({
      totalPages,
      totalProducts: products.length
    })

    console.log(`📊 计算分页信息: 共${products.length}个商品, 每页${pageSize}个, 共${totalPages}页`)
  },

  // ============================================
  // 🔍 幸运空间搜索和筛选功能方法
  // ============================================

  /**
   * 幸运空间搜索输入处理（防抖）
   *
   * @description
   * 用户输入搜索关键词时触发，使用500ms防抖延迟。
   * 应用搜索到幸运空间的商品列表。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 输入的搜索关键词
   */
  onLuckySearchInput: debounce(function (e) {
    const keyword = e.detail.value.trim()
    console.log('🔍 幸运空间搜索关键词:', keyword)

    this.setData({
      luckySearchKeyword: keyword
    })

    this.applyLuckyFilters()
  }, 500),

  /**
   * 幸运空间筛选条件变更事件
   *
   * @description
   * 用户点击筛选按钮（全部/可兑换/低积分）时触发。
   *
   * e - 事件对象
   */
  onLuckyFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('🔍 幸运空间切换筛选:', filter)

    this.setData({
      luckyCurrentFilter: filter
    })

    this.applyLuckyFilters()
  },

  /**
   * 切换幸运空间高级筛选面板
   *
   * @description
   * 显示或隐藏高级筛选面板（分类、积分范围、排序）。
   *
   */
  onToggleLuckyAdvancedFilter() {
    const { showLuckyAdvancedFilter } = this.data
    console.log('🔍 切换幸运空间高级筛选:', !showLuckyAdvancedFilter)

    this.setData({
      showLuckyAdvancedFilter: !showLuckyAdvancedFilter
    })
  },

  /**
   * 幸运空间商品分类筛选变更
   *
   * @description
   * 用户选择商品分类时触发。
   *
   * e - 事件对象
   */
  onLuckyCategoryFilterChange(e) {
    const category = e.currentTarget.dataset.category
    console.log('🔍 幸运空间切换分类筛选:', category)

    this.setData({
      luckyCategoryFilter: category
    })

    this.applyLuckyFilters()
  },

  /**
   * 幸运空间积分范围筛选变更
   *
   * @description
   * 用户选择积分范围时触发。
   *
   * e - 事件对象
   */
  onLuckyPointsRangeChange(e) {
    const range = e.currentTarget.dataset.range
    console.log('🔍 幸运空间切换积分范围:', range)

    this.setData({
      luckyPointsRange: range
    })

    this.applyLuckyFilters()
  },

  /**
   * 幸运空间排序方式变更
   *
   * @description
   * 用户选择排序方式时触发。
   *
   * e - 事件对象
   */
  onLuckySortByChange(e) {
    const sort = e.currentTarget.dataset.sort
    console.log('🔍 幸运空间切换排序:', sort)

    this.setData({
      luckySortBy: sort
    })

    this.applyLuckyFilters()
  },

  /**
   * 🍀 幸运空间库存状态筛选
   *
   * @description
   * 根据库存状态筛选商品（全部/库存充足/库存紧张）。
   *
   * e - 事件对象
   */
  onLuckyStockFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log(`🔍 幸运空间库存状态筛选: ${filter}`)

    this.setData({
      luckyStockFilter: filter
    })

    this.applyLuckyFilters()
  },

  /**
   * 重置幸运空间所有筛选条件
   *
   * @description
   * 将所有筛选条件重置为默认值。
   *
   */
  onResetLuckyFilters() {
    console.log('🔄 重置幸运空间所有筛选条件')

    this.setData({
      luckySearchKeyword: '',
      luckyCurrentFilter: 'all',
      luckyCategoryFilter: 'all',
      luckyPointsRange: 'all',
      luckyStockFilter: 'all', // 重置库存状态筛选
      luckySortBy: 'default',
      showLuckyAdvancedFilter: false
    })

    this.applyLuckyFilters()

    showToast({
      title: '✅ 筛选已重置',
      icon: 'success'
    })
  },

  /**
   * 应用幸运空间筛选条件
   *
   * @description
   * 根据所有筛选条件过滤和排序幸运空间的商品列表。
   *
   */
  applyLuckyFilters() {
    const {
      waterfallProducts,
      luckySearchKeyword,
      luckyCurrentFilter,
      luckyCategoryFilter,
      luckyPointsRange,
      luckyStockFilter, // 新增：库存状态筛选
      luckySortBy,
      totalPoints
    } = this.data

    let filtered = [...waterfallProducts]

    // 搜索筛选
    if (luckySearchKeyword) {
      filtered = filtered.filter(
        product =>
          product.name.includes(luckySearchKeyword) ||
          (product.description && product.description.includes(luckySearchKeyword))
      )
    }

    // 基础筛选
    switch (luckyCurrentFilter) {
      case 'available':
        filtered = filtered.filter(product => product.stock > 0 && totalPoints >= product.price)
        break
      case 'low-price':
        filtered = filtered.sort((a, b) => a.price - b.price)
        break
      default:
        break
    }

    // 分类筛选
    if (luckyCategoryFilter !== 'all') {
      filtered = filtered.filter(
        product =>
          product.category === luckyCategoryFilter ||
          (product.tags && product.tags.includes(luckyCategoryFilter))
      )
    }

    // 积分范围筛选
    if (luckyPointsRange !== 'all') {
      switch (luckyPointsRange) {
        case '0-500':
          filtered = filtered.filter(product => product.price <= 500)
          break
        case '500-1000':
          filtered = filtered.filter(product => product.price > 500 && product.price <= 1000)
          break
        case '1000-2000':
          filtered = filtered.filter(product => product.price > 1000 && product.price <= 2000)
          break
        case '2000+':
          filtered = filtered.filter(product => product.price > 2000)
          break
        default:
          break
      }
    }

    // 库存状态筛选（新增）
    if (luckyStockFilter !== 'all') {
      switch (luckyStockFilter) {
        case 'in-stock':
          filtered = filtered.filter(product => product.stock > 10)
          break
        case 'low-stock':
          filtered = filtered.filter(product => product.stock > 0 && product.stock <= 10)
          break
        default:
          break
      }
    }

    // 排序
    switch (luckySortBy) {
      case 'points-asc':
        filtered = filtered.sort((a, b) => a.price - b.price)
        break
      case 'points-desc':
        filtered = filtered.sort((a, b) => b.price - a.price)
        break
      case 'rating-desc':
        filtered = filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0))
        break
      case 'stock-desc': // 新增：库存降序
        filtered = filtered.sort((a, b) => b.stock - a.stock)
        break
      default:
        break
    }

    // 重新计算瀑布流布局
    const layoutProducts = this.calculateWaterfallLayout(filtered)

    this.setData({
      luckyFilteredProducts: layoutProducts,
      containerHeight: Math.max(...this.data.columnHeights) || 500
    })

    console.log(
      `✅ 幸运空间筛选完成，从${waterfallProducts.length}个商品筛选出${filtered.length}个`
    )
  }
})

export {}
