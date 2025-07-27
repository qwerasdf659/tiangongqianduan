// pages/exchange/exchange.js - 商品兑换页面逻辑
const app = getApp()
const { exchangeAPI, userAPI, tradeAPI } = require('../../utils/api')
const { debounce } = require('../../utils/validate')
const imageHandler = require('../../utils/image-handler')

Page({
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 🎯 内容切换控制
    currentTab: 'exchange', // 'exchange' | 'market'
    
    // 商品兑换相关数据
    products: [],
    filteredProducts: [],
    
    // 交易市场相关数据
    tradeList: [],
    
    // 图片加载状态管理
    imageStatus: {},
    filteredTrades: [],
    currentSpace: 'lucky', // 'lucky' | 'premium'
    luckySpaceStats: {
      new_count: 8,
      avg_discount: 15,
      flash_deals: 3
    },
    premiumSpaceStats: {
      hot_count: 0,
      avg_rating: 4.8,
      trending_count: 5
    },
    marketStats: {
      total_trades: 0,
      avg_price: 0,
      hot_categories: []
    },
    
    // 页面状态
    loading: true,
    refreshing: false,
    
    // 兑换确认弹窗
    showConfirm: false,
    selectedProduct: null,
    
    // 兑换结果弹窗
    showResult: false,
    resultData: null,
    
    // 🚨 已删除：mockProducts违规字段

    // 新增的兑换相关数据
    exchangeQuantity: 1,
    exchanging: false,

    // 搜索和筛选
    searchKeyword: '',
    currentFilter: 'all', // 'all', 'available', 'low-price'
    
    // 分页功能 - 2×2网格布局
    currentPage: 1,
    totalPages: 1,
    pageSize: 4, // 2×2=4个商品每页
    totalProducts: 0,
    
    // 高级筛选
    showAdvancedFilter: false,
    categoryFilter: 'all', // 'all', '优惠券', '实物商品', '虚拟物品'
    pointsRange: 'all', // 'all', '0-500', '500-1000', '1000-2000', '2000+'
    stockFilter: 'all', // 'all', 'in-stock', 'low-stock'
    sortBy: 'default', // 'default', 'points-asc', 'points-desc', 'stock-desc', 'rating-desc'

    // 🎯 简化：导航状态管理 - 移除所有状态变量，只保留内容切换
    // 所有导航相关状态变量已移除，确保无任何视觉反馈
    
    // 🏆 方案8：竞价热榜实时布局数据
    hotRankingList: [], // 实时热销榜数据
    biddingProducts: [], // 竞价区商品数据
    newProducts: [], // 新品区商品数据
    realTimeTimer: null, // 实时更新定时器
    
    // 🎮 竞价交互状态
    showBidModal: false, // 竞价弹窗显示状态
    selectedBidProduct: null, // 当前竞价商品
    userBidAmount: 0, // 用户出价金额
    bidHistory: [], // 竞价历史记录
    
    // 🏪 双空间系统数据
    currentSpace: 'lucky', // 当前空间：仅支持幸运空间
    spaceList: [
      {
        id: 'lucky',
        name: '🍀 幸运空间',
        subtitle: '幸运好物，与你相遇',
        layout: 'waterfall', // 使用方案1瀑布流布局
        color: '#FF6B35',
        bgGradient: 'linear-gradient(135deg, #FF6B35 0%, #F7931E 100%)'
      },
      {
        id: 'premium',
        name: '💎 臻选空间',
        subtitle: '精品汇聚，品质之选',
        layout: 'simple', // 使用简单布局
        color: '#667eea',
        bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        // 🔒 臻选空间解锁系统
        locked: true, // 默认锁定状态
        unlockRequirement: 500000, // 历史累计积分要求：50万积分
        unlockCost: 100, // 解锁消耗：100积分
        unlockDuration: 24 * 60 * 60 * 1000 // 解锁持续时间：24小时（毫秒）
      }
    ],
    
    // 🔒 臻选空间解锁状态管理
    premiumUnlockStatus: {
      isUnlocked: false, // 是否已解锁
      unlockTime: 0, // 解锁时间戳
      expiryTime: 0, // 过期时间戳
      cumulativePoints: 0, // 历史累计积分
      canUnlock: false // 是否满足解锁条件
    },
    
    // 🍀 方案1：幸运空间瀑布流布局数据
    waterfallProducts: [], // 瀑布流商品数据
    waterfallColumns: [0, 0], // 双列高度记录
    containerWidth: 375, // 容器宽度
    containerHeight: 0, // 容器总高度
    columnWidth: 0, // 列宽度
    visibleProducts: [], // 可见区域商品（虚拟滚动优化）
    renderOffset: 0, // 渲染偏移量
    
    // 臻选空间数据 - 混合展示布局（方案3）
    premiumProducts: [], // 精品商品数据（兼容性保留）
    
    // 混合布局三层数据结构
    carouselItems: [], // 轮播推荐区数据
    carouselActiveIndex: 0, // 当前轮播索引
    autoPlay: true, // 自动播放开关
    
    cardSections: [], // 卡片组区域数据
    listProducts: [], // 详细列表区数据
    
    // 混合布局配置
    mixedLayoutConfig: {
      carouselAutoPlay: true,
      carouselInterval: 4000,
      cardColumns: 2,
      listShowDetails: true
    }
  },

  onLoad(options) {
    console.log('🛒 兑换页面加载', options)
    
    // 🔧 关键修复：页面加载时强制恢复Token状态
    console.log('🔄 强制恢复Token状态...')
    const app = getApp()
    if (app) {
      try {
        const storedToken = wx.getStorageSync('access_token')
        const storedRefreshToken = wx.getStorageSync('refresh_token')
        const storedUserInfo = wx.getStorageSync('user_info')
        
        console.log('📦 兑换页面本地存储状态:', {
          hasStoredToken: !!storedToken,
          hasStoredUser: !!storedUserInfo,
          currentGlobalToken: !!app.globalData.accessToken,
          currentGlobalLogin: app.globalData.isLoggedIn
        })
        
        // 如果本地存储有数据但全局状态丢失，立即恢复
        if (storedToken && storedUserInfo && !app.globalData.accessToken) {
          console.log('🔧 检测到Token状态丢失，立即恢复')
          
          app.globalData.accessToken = storedToken
          app.globalData.refreshToken = storedRefreshToken
          app.globalData.userInfo = storedUserInfo
          app.globalData.isLoggedIn = true
          
          console.log('✅ 兑换页面Token状态已恢复')
        }
      } catch (error) {
        console.error('❌ Token状态恢复失败:', error)
      }
    }
    
    this.initPage()
    // 🔒 初始化臻选空间解锁状态
    this.initPremiumUnlockStatus()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('兑换页面显示')
    
    // 连接WebSocket监听库存变化
    this.connectWebSocket()
    
    // 检查商品数据是否需要同步更新
    this.checkAndRefreshProducts()
    
    // 设置兑换页面更新回调（用于接收商家管理的数据更新通知）
    const app = getApp()
    app.setExchangeUpdateCallback(() => {
      console.log('📢 收到商家管理数据更新通知，刷新商品列表')
      this.refreshProductsFromMerchant()
    })
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('兑换页面隐藏')
    this.disconnectWebSocket()
    
    // 🏆 清理竞价热榜定时器
    this.onHideMarket()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('兑换页面卸载')
    this.disconnectWebSocket()
    
    // 清理兑换页面更新回调
    const app = getApp()
    app.clearExchangeUpdateCallback()
  },

  onPullDownRefresh() {
    console.log('下拉刷新')
    this.refreshPage()
  },

  /**
   * 初始化页面
   */
  initPage() {
    // 获取用户信息
    this.refreshUserInfo()
    
    // 🚨 已删除：generateMockProducts()违规调用
    
    // 🔴 修复：先初始化筛选条件，再加载商品数据
    this.initFilters()
    
    // 加载商品数据
    this.loadProducts()
  },

  /**
   * 初始化筛选条件
   */
  initFilters() {
    // 设置默认筛选和排序
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
   * TODO: 后端对接 - 用户信息接口
   * 
   * 对接说明：
   * 接口：GET /api/user/info
   * 认证：需要Bearer Token
   * 返回：用户详细信息，主要获取最新的积分余额
   */
  refreshUserInfo() {
    console.log('📡 刷新用户信息...')
    return userAPI.getUserInfo().then((res) => {
      this.setData({
        userInfo: res.data,
        totalPoints: res.data.total_points
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = res.data
      console.log('✅ 用户信息刷新成功，当前积分:', res.data.total_points)
    }).catch((error) => {
      console.error('❌ 获取用户信息失败:', error)
      
      // 错误处理：使用全局缓存数据
      if (app.globalData.userInfo) {
        this.setData({
          userInfo: app.globalData.userInfo,
          totalPoints: app.globalData.userInfo.total_points
        })
      }
    })
  },

  /**
   * 🚨 已删除违规函数：generateMockProducts()
   * 🔴 原因：违反项目安全规则 - 严禁前端硬编码敏感业务数据
   * ✅ 正确做法：所有商品数据必须从后端API获取
   * 
   * 使用方式：exchangeAPI.getProducts()
   */

  /**
   * 🔴 增强版Token状态检查函数 - 修复商品显示空白问题的核心逻辑
   * 
   * 根据后端程序员分析，API返回401错误是商品显示空白的直接原因
   * 这个函数负责在API调用前检查Token有效性，避免无效请求
   */
  checkTokenStatus() {
    const app = getApp()
    
    // 检查app实例
    if (!app || !app.globalData) {
      console.error('❌ App实例未初始化')
      return {
        isValid: false,
        error: 'APP_NOT_INITIALIZED',
        message: '应用未初始化，请重新打开小程序',
        needsRelogin: false,
        isNormalUnauth: false
      }
    }
    
    // 🔴 关键修复：区分正常未登录和Token异常
    const isLoggedIn = app.globalData.isLoggedIn
    const accessToken = app.globalData.accessToken
    
    // 情况1：正常未登录状态
    if (!isLoggedIn || !accessToken) {
      console.log('📝 正常未登录状态')
      return {
        isValid: false,
        error: 'NOT_LOGGED_IN',
        message: '用户未登录',
        needsRelogin: false,
        isNormalUnauth: true  // 🔴 标记为正常未登录
      }
    }
    
    // 情况2：已登录但Token可能有问题
    if (typeof accessToken !== 'string' || accessToken.trim() === '' || accessToken === 'undefined') {
      console.error('❌ Token格式异常')
      return {
        isValid: false,
        error: 'TOKEN_INVALID_FORMAT',
        message: 'Token格式无效，需要重新登录',
        needsRelogin: true,
        isNormalUnauth: false
      }
    }
    
    // 🔴 使用utils/api.js中的validateToken函数，确保逻辑一致
    const { validateToken } = require('../../utils/api')
    const validationResult = validateToken(accessToken)
    
    if (!validationResult.isValid) {
      console.error('❌ Token验证失败:', validationResult.error, validationResult.message)
      return {
        isValid: false,
        error: validationResult.error,
        message: validationResult.message,
        needsRelogin: validationResult.needsRelogin || true,
        canRefresh: validationResult.canRefresh,
        expiredAt: validationResult.expiredAt,
        isNormalUnauth: false
      }
    }
    
    console.log('✅ Token验证通过')
    return {
      isValid: true,
      message: validationResult.message,
      info: {
        userId: validationResult.userId,
        mobile: validationResult.mobile,
        isAdmin: validationResult.isAdmin,
        expiresAt: validationResult.expiresAt,
        willExpireSoon: validationResult.willExpireSoon
      },
      isNormalUnauth: false
    }
  },

  /**
   * 🔴 处理Token错误 - 根据错误类型采取相应措施
   */
  handleTokenError(errorType) {
    const app = getApp()
    
    console.log('🚨 处理Token错误:', errorType)
    
    switch (errorType) {
      case 'TOKEN_MISSING':
        wx.showModal({
          title: '🔑 需要登录',
          content: '请登录后查看商品列表',
          showCancel: false,
          confirmText: '立即登录',
          success: () => {
            wx.reLaunch({ url: '/pages/auth/auth' })
          }
        })
        break
        
      case 'TOKEN_EXPIRED':
        console.log('🔄 尝试刷新过期Token...')
        const refreshToken = app.globalData.refreshToken || wx.getStorageSync('refresh_token')
        if (refreshToken) {
          // 这里应该调用refreshToken，但为了简化，直接重新登录
          this.clearTokenAndRedirectLogin('Token已过期，请重新登录')
        } else {
          this.clearTokenAndRedirectLogin('Token已过期且无法刷新，请重新登录')
        }
        break
        
      case 'TOKEN_INVALID_JWT':
      case 'TOKEN_DECODE_ERROR':
        this.clearTokenAndRedirectLogin('Token格式无效，请重新登录')
        break
        
      default:
        this.clearTokenAndRedirectLogin('认证异常，请重新登录')
    }
  },

  /**
   * 🔴 清理Token并跳转登录
   */
  clearTokenAndRedirectLogin(message) {
    const app = getApp()
    
    console.log('🧹 清理无效Token:', message)
    
    // 清理全局数据
    app.globalData.accessToken = null
    app.globalData.refreshToken = null
    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
    
    // 清理本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
    
    wx.showModal({
      title: '🔑 登录状态异常',
      content: message,
      showCancel: false,
      confirmText: '重新登录',
      success: () => {
        wx.reLaunch({ url: '/pages/auth/auth' })
      }
    })
  },

  /**
   * 🔴 加载商品数据 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据，强制后端依赖
   * 🔧 修复版：解决JWT认证问题和API调用问题
   * 🎯 修复商品显示空白问题 - 2025年01月19日
   * 
   * 接口：GET /api/exchange/products
   * 认证：需要Bearer Token
   * 返回：商品列表，支持分页和筛选
   */
  loadProducts() {
    console.log('🔄 开始加载商品列表...')
    const requestStartTime = Date.now()
    
    this.setData({ loading: true })
    
    // 🔴 修复：简化Token检查逻辑，避免误判
    const app = getApp()
    
    // 基本检查
    if (!app || !app.globalData) {
      console.error('❌ App未初始化')
      this.setData({ loading: false })
      wx.showToast({
        title: '应用初始化异常，请重启小程序',
        icon: 'none',
        duration: 3000
      })
      return
    }
    
    // 获取Token
    let token = app.globalData.accessToken
    if (!token) {
      token = wx.getStorageSync('access_token')
      if (token) {
        app.globalData.accessToken = token
        console.log('🔧 从本地存储恢复Token')
      }
    }
    
    // 🔴 修复：如果没有Token，直接提示登录，不进行复杂验证
    if (!token) {
      console.log('🔑 用户未登录，需要先登录')
      this.setData({ loading: false })
      
      wx.showModal({
        title: '🔑 需要登录',
        content: '请先登录后查看商品列表',
        showCancel: false,
        confirmText: '立即登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
      return
    }
    
    console.log('✅ Token存在，开始请求商品数据')
    
    // 🔴 修复：调整API调用方式，匹配utils/api.js中的方法签名
    // exchangeAPI.getProducts(page = 1, pageSize = 20, category = 'all', sort = 'points')
    const page = this.data.currentPage || 1
    const pageSize = this.data.pageSize || 20
    const category = (this.data.categoryFilter && this.data.categoryFilter !== 'all') ? this.data.categoryFilter : 'all'
    const sort = (this.data.sortBy && this.data.sortBy !== 'default') ? this.data.sortBy : 'points'
    
    console.log('📋 API调用参数:', { page, pageSize, category, sort })
    
    // 🔧 调用商品API - 使用正确的参数顺序
    exchangeAPI.getProducts(page, pageSize, category, sort).then((result) => {
      const requestEndTime = Date.now()
      const requestDuration = requestEndTime - requestStartTime
      
      console.log('\n✅ 商品加载成功!')
      console.log('⏱️ 请求耗时:', requestDuration + 'ms')
      console.log('📊 API返回数据:', result)
      
      // 🔴 修复：更严格的数据验证和错误处理
      if (!result || result.code !== 0) {
        console.error('❌ API返回业务错误:', result)
        this.setData({ loading: false })
        
        const errorMsg = result?.msg || '获取商品列表失败'
        wx.showModal({
          title: '🚨 商品加载失败',
          content: `${errorMsg}\n\n错误码: ${result?.code || '未知'}\n\n请尝试重新加载或联系客服`,
          showCancel: true,
          cancelText: '重试',
          confirmText: '知道了',
          success: (res) => {
            if (res.cancel) {
              setTimeout(() => this.loadProducts(), 1000)
            }
          }
        })
        return
      }
      
      // 🔴 修复：确保数据结构正确
      const data = result.data || {}
      const products = Array.isArray(data.products) ? data.products : []
      
      console.log('📦 商品数据处理:', {
        原始数据: data,
        商品数组长度: products.length,
        总数: data.total,
        页码信息: {
          page: data.page,
          limit: data.limit,
          has_more: data.has_more
        }
      })
      
      // 🔧 设置商品数据
      this.setData({
        loading: false,
        products: products,
        filteredProducts: products,
        totalCount: data.total || products.length,
        currentPage: data.page || 1,
        totalPages: Math.ceil((data.total || products.length) / (this.data.pageSize || 20))
      })
      
      // 显示加载结果
      if (products.length > 0) {
        console.log(`✅ 成功加载 ${products.length} 个商品`)
        wx.showToast({
          title: `加载了${products.length}个商品`,
          icon: 'success',
          duration: 1500
        })
      } else {
        console.log('⚠️ 商品列表为空')
        wx.showToast({
          title: '暂无商品数据',
          icon: 'none',
          duration: 2000
        })
      }
      
      console.log('=================== 商品加载完成 ===================\n')
      
    }).catch((error) => {
      const requestEndTime = Date.now()
      const requestDuration = requestEndTime - requestStartTime
      
      console.error('\n❌ 商品加载失败!')
      console.error('⏱️ 失败前耗时:', requestDuration + 'ms')
      console.error('🚨 错误详情:', error)
      
      this.setData({ 
        loading: false,
        products: [],
        filteredProducts: [],
        totalCount: 0
      })
      
      // 🔴 修复：改进错误处理逻辑
      if (error.statusCode === 401 || error.code === 4002) {
        console.error('🔑 认证失败，需要重新登录')
        
        wx.showModal({
          title: '🔑 登录状态异常',
          content: '登录状态已失效，请重新登录后查看商品',
          showCancel: false,
          confirmText: '重新登录',
          success: () => {
            // 清理认证信息
            app.globalData.accessToken = null
            app.globalData.refreshToken = null
            app.globalData.userInfo = null
            app.globalData.isLoggedIn = false
            
            wx.removeStorageSync('access_token')
            wx.removeStorageSync('refresh_token')
            wx.removeStorageSync('user_info')
            
            wx.reLaunch({ url: '/pages/auth/auth' })
          }
        })
      } else if (error.code === 4000) {
        console.error('🎯 检测到4000错误 - 用户反馈的核心问题!')
        
        wx.showModal({
          title: '🎯 商品加载问题',
          content: `无法获取商品列表\n\n错误详情: ${error.message || error.msg || '未知错误'}\n\n建议：\n1. 检查网络连接\n2. 重新登录\n3. 联系客服支持`,
          showCancel: true,
          cancelText: '重试',
          confirmText: '重新登录',
          success: (res) => {
            if (res.cancel) {
              setTimeout(() => this.loadProducts(), 1000)
            } else {
              wx.reLaunch({ url: '/pages/auth/auth' })
            }
          }
        })
      } else {
        // 其他错误
        console.error('🚨 其他类型错误:', error)
        
        wx.showModal({
          title: '🚨 网络错误',
          content: `网络请求失败\n\n错误信息: ${error.message || error.msg || '网络异常'}\n\n请检查网络连接后重试`,
          showCancel: true,
          cancelText: '重试',
          confirmText: '知道了',
          success: (res) => {
            if (res.cancel) {
              setTimeout(() => this.loadProducts(), 1000)
            }
          }
        })
      }
    })
  },

  /**
   * 🔴 新增：专门处理4000错误码 - 用户反馈的核心问题
   */
  handle4000Error(error) {
    console.error('🎯 4000错误专用处理程序启动')
    
    // 分析4000错误的具体原因
    let diagnosisContent = '🔍 4000错误诊断结果：\n\n'
    
    // 检查Token状态
    const app = getApp()
    const hasToken = !!(app.globalData?.accessToken)
    const isLoggedIn = !!(app.globalData?.isLoggedIn)
    
    if (!hasToken) {
      diagnosisContent += '❌ 未检测到访问令牌\n'
      diagnosisContent += '• 用户可能未登录\n'
      diagnosisContent += '• Token已被清除\n\n'
    } else {
      diagnosisContent += '✅ 检测到访问令牌\n'
      
      // 进一步验证Token
      const { validateToken } = require('../../utils/api')
      const validation = validateToken(app.globalData.accessToken)
      
      if (!validation.isValid) {
        diagnosisContent += `❌ Token验证失败: ${validation.error}\n`
        diagnosisContent += `• 详情: ${validation.message}\n\n`
      } else {
        diagnosisContent += '✅ Token格式验证通过\n\n'
      }
    }
    
    diagnosisContent += '🔧 推荐解决方案：\n'
    diagnosisContent += '1. 重新登录获取新Token\n'
    diagnosisContent += '2. 检查网络连接状态\n'
    diagnosisContent += '3. 清除缓存后重试\n\n'
    diagnosisContent += '🎯 这个解决方案专门针对您遇到的4000错误'
    
    wx.showModal({
      title: '🎯 4000错误解决方案',
      content: diagnosisContent,
      showCancel: true,
      cancelText: '稍后处理',
      confirmText: '立即修复',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          // 执行修复操作
          this.perform4000ErrorFix()
        }
      }
    })
  },

  /**
   * 🔴 新增：执行4000错误修复操作
   */
  perform4000ErrorFix() {
    console.log('🔧 开始执行4000错误修复...')
    
    const app = getApp()
    
    // 步骤1：清理可能损坏的认证信息
    console.log('🧹 步骤1：清理认证信息')
    app.globalData.accessToken = null
    app.globalData.refreshToken = null
    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
    
    // 步骤2：清理本地存储
    console.log('🧹 步骤2：清理本地存储')
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
    } catch (error) {
      console.warn('⚠️ 清理本地存储时出现警告:', error)
    }
    
    // 步骤3：显示修复进度
    wx.showToast({
      title: '正在修复4000错误...',
      icon: 'loading',
      duration: 2000
    })
    
    // 步骤4：延迟跳转，确保清理完成
    setTimeout(() => {
      console.log('🔄 步骤4：跳转到登录页面')
      
      wx.showModal({
        title: '✅ 4000错误修复完成',
        content: '已清理可能导致4000错误的认证数据\n\n请重新登录以解决商品显示空白问题',
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          this.redirectToLogin()
        }
      })
    }, 2000)
  },

  /**
   * 🔴 使用统一的Token状态检查函数 - 解决商品显示空白问题
   */
  checkTokenStatus() {
    const app = getApp()
    
    // 检查app实例
    if (!app || !app.globalData) {
      return {
        isValid: false,
        error: 'APP_NOT_INITIALIZED',
        message: '应用未初始化，请重新打开小程序',
        needsRelogin: true
      }
    }
    
    // 获取Token - 优先从全局数据，降级到本地存储
    let token = app.globalData.accessToken
    if (!token) {
      token = wx.getStorageSync('access_token')
      if (token) {
        // 同步到全局数据
        app.globalData.accessToken = token
        console.log('🔧 从本地存储恢复Token到全局数据')
      }
    }
    
    if (!token) {
      return {
        isValid: false,
        error: 'TOKEN_MISSING',
        message: '未找到访问令牌，需要重新登录',
        needsRelogin: true
      }
    }
    
    // 🔴 使用utils/api.js中的validateToken函数，确保逻辑一致
    const { validateToken } = require('../../utils/api')
    const validationResult = validateToken(token)
    
    if (!validationResult.isValid) {
      console.error('❌ Token验证失败:', validationResult.error, validationResult.message)
      return {
        isValid: false,
        error: validationResult.error,
        message: validationResult.message,
        needsRelogin: validationResult.needsRelogin,
        canRefresh: validationResult.canRefresh,
        expiredAt: validationResult.expiredAt
      }
    }
    
    console.log('✅ Token验证通过')
    return {
      isValid: true,
      message: validationResult.message,
      info: {
        userId: validationResult.userId,
        mobile: validationResult.mobile,
        isAdmin: validationResult.isAdmin,
        expiresAt: validationResult.expiresAt,
        willExpireSoon: validationResult.willExpireSoon
      }
    }
  },

  /**
   * 🔴 增强版Token错误处理函数 - 解决商品显示空白问题
   */
  handleTokenError(errorType, errorDetails) {
    this.setData({ loading: false })
    
    let title = '🔑 认证问题'
    let content = ''
    let showCancel = false
    let cancelText = '稍后处理'
    let confirmText = '重新登录'
    
    switch (errorType) {
      case 'APP_NOT_INITIALIZED':
        title = '🚨 系统错误'
        content = '应用初始化异常\n\n请重启小程序后重试'
        break
        
      case 'TOKEN_MISSING':
        title = '🔑 需要登录'
        content = '检测到您尚未登录\n\n这是商品显示空白的原因，请先登录后查看商品列表'
        break
        
      case 'TOKEN_EXPIRED':
        title = '🔑 登录已过期'
        content = `您的登录状态已过期\n\n${errorDetails?.expiredAt ? '过期时间: ' + errorDetails.expiredAt + '\n\n' : ''}这是商品显示空白的直接原因，请重新登录获取有效访问令牌`
        showCancel = true
        break
        
      case 'TOKEN_INVALID_FORMAT':
      case 'TOKEN_INVALID':
        title = '🔑 Token格式错误'
        content = '登录信息格式异常\n\n可能原因：\n• Token数据损坏\n• 存储异常\n• 网络传输错误\n\n请重新登录修复此问题'
        showCancel = true
        break
        
      case 'TOKEN_INVALID_JWT':
        title = '🔑 JWT格式错误'
        content = 'JWT Token格式不正确\n\n可能原因：\n• Token被意外修改\n• 格式不符合JWT标准\n• 数据传输错误\n\n请重新登录获取正确格式的Token'
        showCancel = true
        break
        
      case 'TOKEN_DECODE_ERROR':
      case 'TOKEN_DECODE_FAILED':
        title = '🔑 Token解码失败'
        content = 'Token解码失败，数据可能已损坏\n\n可能原因：\n• Token内容被篡改\n• 编码格式错误\n• 密钥不匹配\n\n请重新登录获取有效Token'
        showCancel = true
        break
        
      case 'TOKEN_MISSING_USER_ID':
        title = '🔑 Token缺少用户信息'
        content = 'Token中缺少必要的用户信息\n\n这可能是Token生成时的问题，请重新登录获取完整的用户Token'
        break
        
      default:
        title = '🔑 认证状态异常'
        content = `认证状态检查失败\n\n错误类型: ${errorType}\n\n这是商品显示空白的可能原因，请重新登录后查看商品`
        showCancel = true
    }
    
    wx.showModal({
      title: title,
      content: content,
      showCancel: showCancel,
      cancelText: cancelText,
      confirmText: confirmText,
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          this.redirectToLogin()
        }
      }
    })
  },

  /**
   * 🔴 新增：认证失败处理函数
   */
  handleAuthFailure() {
    console.log('🔑 处理认证失败...')
    
    // 清除无效的认证信息
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.accessToken = null
      app.globalData.refreshToken = null
      app.globalData.userInfo = null
      app.globalData.isLoggedIn = false
    }
    
    // 清除本地存储
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
    } catch (error) {
      console.warn('⚠️ 清除本地存储失败:', error)
    }
    
    // 显示用户友好提示
    wx.showModal({
      title: '🔑 登录过期',
      content: '您的登录状态已过期\n\n为了查看商品列表，请重新登录',
      showCancel: false,
      confirmText: '重新登录',
      confirmColor: '#FF6B35',
      success: () => {
        this.redirectToLogin()
      }
    })
  },

  /**
   * 🔴 新增：安全跳转登录页面
   */
  redirectToLogin() {
    console.log('🔄 跳转到登录页面...')
    
    // 尝试多种跳转方式确保成功
    wx.reLaunch({
      url: '/pages/auth/auth',
      success: () => {
        console.log('✅ 成功跳转到登录页面')
      },
      fail: (error) => {
        console.error('❌ reLaunch失败，尝试redirectTo:', error)
        
        wx.redirectTo({
          url: '/pages/auth/auth',
          success: () => {
            console.log('✅ redirectTo跳转成功')
          },
          fail: (redirectError) => {
            console.error('❌ redirectTo也失败:', redirectError)
            
            // 最后尝试navigateTo
            wx.navigateTo({
              url: '/pages/auth/auth',
              fail: (navigateError) => {
                console.error('❌ 所有跳转方式都失败:', navigateError)
                
                wx.showToast({
                  title: '跳转失败，请手动重新打开小程序',
                  icon: 'none',
                  duration: 3000
                })
              }
            })
          }
        })
      }
    })
  },

  /**
   * 🚨 已删除违规函数：setDefaultProducts()
   * 🔴 原因：使用Mock数据违反项目安全规则
   * ✅ 正确做法：出错时显示明确的后端服务异常提示
   */

  /**
   * 连接WebSocket监听库存变化
   * 🔴 根据后端文档实现库存实时同步
   */
  connectWebSocket() {
    if (!app.globalData.wsManager) {
      console.log('WebSocket管理器未初始化')
      return
    }

    // 监听库存更新推送
    app.globalData.wsManager.on('stock_update', (data) => {
      console.log('📦 收到库存更新推送:', data)
      this.updateProductStock(data.data.product_id, data.data.stock)
    })

    console.log('✅ 已连接WebSocket，监听库存变化')
  },

  /**
   * 断开WebSocket连接
   */
  disconnectWebSocket() {
    if (app.globalData.wsManager) {
      app.globalData.wsManager.off('stock_update')
      console.log('🔌 已断开WebSocket库存监听')
    }
  },

  /**
   * 更新商品库存
   * 🔴 根据后端WebSocket推送更新库存
   * @param {Number} productId 商品ID
   * @param {Number} newStock 新库存数量
   */
  updateProductStock(productId, newStock) {
    const products = this.data.products
    const productIndex = products.findIndex(p => p.id === productId || p.commodity_id === productId)
    
    if (productIndex !== -1) {
      products[productIndex].stock = newStock
      this.setData({ products })
      
      console.log(`📦 商品库存已更新: ID${productId} -> ${newStock}`)
      
      // 如果库存为0，显示缺货提示
      if (newStock === 0) {
        wx.showToast({
          title: `${products[productIndex].name} 已售罄`,
          icon: 'none',
          duration: 2000
        })
      }
    }
  },

  /**
   * 刷新页面数据
   */
  refreshPage() {
    this.setData({ refreshing: true })
    
    return Promise.all([
      this.refreshUserInfo(),
      this.loadProducts()
    ]).then(() => {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    }).catch(error => {
      console.error('❌ 刷新页面失败:', error)
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 🔧 图片加载错误处理 - 使用统一图片处理工具
   * 当商品图片加载失败时，使用默认图片替代并显示友好提示
   */
  onImageError(e) {
    const index = e.currentTarget.dataset.index
    const imageId = e.currentTarget.dataset.imageId || `product_${index}`
    const defaultSrc = imageHandler.handleImageError(e, {
      defaultType: 'product',
      callback: (result) => {
        console.log(`⚠️ 图片加载失败处理完成:`, result)
        // 显示友好提示
        wx.showToast({
          title: '图片加载失败，已使用默认图片',
          icon: 'none',
          duration: 2000
        })
      }
    })
    
    // 使用图片状态管理器更新状态
    const imageManager = imageHandler.createImageStatusManager(this)
    imageManager.setStatus(imageId, imageHandler.IMAGE_STATUS.ERROR, {
      defaultSrc,
      originalSrc: e.currentTarget.dataset.src
    })
    
    // 更新对应商品的图片为默认图片
    const filteredProducts = this.data.filteredProducts.map((product, i) => {
      if (i === index) {
        return { 
          ...product, 
          image: defaultSrc,
          imageStatus: imageHandler.IMAGE_STATUS.ERROR
        }
      }
      return product
    })
    
    this.setData({ filteredProducts })
    
    // 同时更新原始商品数据
    const products = this.data.products.map(product => {
      if (product.id === this.data.filteredProducts[index]?.id) {
        return { 
          ...product, 
          image: defaultSrc,
          imageStatus: imageHandler.IMAGE_STATUS.ERROR
        }
      }
      return product
    })
    
    this.setData({ products })
  },

  /**
   * 🎯 图片加载成功处理
   * 更新图片加载状态为成功
   */
  onImageLoad(e) {
    const index = e.currentTarget.dataset.index
    const imageId = e.currentTarget.dataset.imageId || `product_${index}`
    
    imageHandler.handleImageLoad(e, (result) => {
      console.log(`✅ 图片加载成功:`, result)
    })
    
    // 使用图片状态管理器更新状态
    const imageManager = imageHandler.createImageStatusManager(this)
    imageManager.setStatus(imageId, imageHandler.IMAGE_STATUS.SUCCESS, {
      src: e.currentTarget.src,
      width: e.detail?.width,
      height: e.detail?.height
    })
    
    // 更新产品图片状态
    const filteredProducts = this.data.filteredProducts.map((product, i) => {
      if (i === index) {
        return { 
          ...product, 
          imageStatus: imageHandler.IMAGE_STATUS.SUCCESS
        }
      }
      return product
    })
    
    this.setData({ filteredProducts })
  },

  /**
   * 商品点击事件
   */
  onProductTap(e) {
    const product = e.currentTarget.dataset.product
    console.log('点击商品:', product)

    // 检查库存
    if (product.stock <= 0) {
      wx.showToast({
        title: '商品已售罄',
        icon: 'none'
      })
      return
    }

    // 检查积分
    if (this.data.totalPoints < product.exchange_points) {
      wx.showToast({
        title: '积分不足',
        icon: 'none'
      })
      return
    }

    // 显示兑换确认弹窗
    this.setData({
      showConfirm: true,
      selectedProduct: product
    })
  },

  /**
   * 确认兑换
   */
  onConfirmExchange() {
    const selectedProduct = this.data.selectedProduct
    if (!selectedProduct) {
      wx.showToast({
        title: '未选择商品',
        icon: 'none'
      })
      return
    }

    // 再次检查积分和库存
    if (this.data.totalPoints < selectedProduct.exchange_points) {
      wx.showToast({
        title: '积分不足',
        icon: 'none'
      })
      return
    }

    if (selectedProduct.stock <= 0) {
      wx.showToast({
        title: '商品已售罄',
        icon: 'none'
      })
      return
    }

    // 关闭确认弹窗
    this.setData({
      showConfirm: false,
      exchanging: true
    })

    // 执行兑换
    this.performExchange(selectedProduct)
  },

  /**
   * 执行兑换操作
   */
  performExchange(product) {
    wx.showLoading({ title: '兑换中...' })

    // 🔴 删除违规代码：严禁使用模拟数据，所有兑换操作均通过后端真实API
    const exchangePromise = exchangeAPI.redeem(product.id, 1)

    exchangePromise.then((result) => {
      wx.hideLoading()
      
      // 更新用户积分
      const newPoints = result.data.remaining_points
      this.setData({
        totalPoints: newPoints,
        exchanging: false
      })
      
      // 更新全局积分
      if (app.globalData.userInfo) {
        app.globalData.userInfo.total_points = newPoints
      }
      // 🚨 已删除：mockUser违规代码 - 违反项目安全规则
      // ✅ 积分更新必须通过后端API同步
      
      // 🔴 删除违规代码：商品库存更新由后端API处理，前端不进行模拟操作
      
      // 显示成功提示
      wx.showToast({
        title: '兑换成功',
        icon: 'success'
      })
      
      // 刷新商品列表
      this.filterProducts()
      
    }).catch((error) => {
      wx.hideLoading()
      this.setData({ exchanging: false })
      console.error('❌ 商品兑换失败:', error)
      
      wx.showToast({
        title: error.msg || '兑换失败',
        icon: 'none'
      })
    })
  },

  /**
   * 取消兑换
   */
  onCancelExchange() {
    this.setData({
      showConfirm: false,
      selectedProduct: null
    })
  },

  /**
   * 关闭结果弹窗
   */
  onCloseResult() {
    this.setData({
      showResult: false,
      resultData: null
    })
  },

  /**
   * 查看兑换记录
   */
  onViewRecords() {
    wx.showModal({
      title: '兑换记录',
      content: '兑换记录功能正在开发中...\n\n您可以在个人中心查看积分明细了解兑换消费记录',
      confirmText: '去个人中心',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/user'
          })
        }
      }
    })
  },

  /**
   * 查看商品详情
   */
  onViewProductDetail(e) {
    const product = e.currentTarget.dataset.product
    wx.navigateTo({
      url: `/pages/product/product-detail?id=${product.id}`
    })
  },

  /**
   * 预览商品图片
   */
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '精美商品等你兑换！',
      path: '/pages/exchange/exchange'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '餐厅积分兑换 - 精美商品等你来'
    }
  },

  /**
   * 商品兑换流程 - 增强版实现
   */
  onExchangeProduct() {
    const selectedProduct = this.data.selectedProduct
    const exchangeQuantity = this.data.exchangeQuantity || 1
    const totalCost = selectedProduct.exchange_points * exchangeQuantity

    // 最终确认
    this.showExchangeConfirm(selectedProduct, exchangeQuantity, totalCost).then((confirmResult) => {
      if (!confirmResult.confirmed) {
        console.log('用户取消兑换')
        return
      }

      this.setData({ 
        exchanging: true,
        exchangeProgress: 0 
      })
      
      // 显示兑换进度
      this.showExchangeProgress()

      // 🔴 删除违规代码：严禁使用模拟数据，所有商品兑换均通过后端真实API
      const exchangePromise = exchangeAPI.redeem(selectedProduct.id, exchangeQuantity)

      exchangePromise.then((exchangeResult) => {
        console.log('🎉 商品兑换成功:', exchangeResult.data)
        
        // 更新用户积分
        const newPoints = exchangeResult.data.remaining_points
        this.setData({
          totalPoints: newPoints,
          exchanging: false,
          showExchangeModal: false,
          exchangeProgress: 100
        })
        
        // 更新全局积分
        if (app.globalData.userInfo) {
          app.globalData.userInfo.total_points = newPoints
        }
        // 🚨 已删除：mockUser违规代码 - 违反项目安全规则
        // ✅ 积分更新必须通过后端API同步
        
        // 显示成功结果
        this.showExchangeSuccess(exchangeResult.data)
        
      }).catch((error) => {
        this.setData({ 
          exchanging: false,
          exchangeProgress: 0 
        })
        console.error('❌ 商品兑换失败:', error)
        this.showExchangeError(error)
      })
    })
  },

  /**
   * 显示兑换确认对话框
   * @param {Object} product 商品信息
   * @param {Number} quantity 兑换数量
   * @param {Number} totalCost 总积分消耗
   */
  showExchangeConfirm(product, quantity, totalCost) {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认兑换',
        content: `商品：${product.name}\n数量：${quantity}件\n消耗积分：${totalCost}分\n剩余积分：${this.data.totalPoints - totalCost}分`,
        confirmText: '确认兑换',
        cancelText: '取消',
        success: (res) => {
          resolve(res.confirm)
        }
      })
    })
  },

  /**
   * 显示兑换成功结果
   * @param {Object} result 兑换结果数据
   */
  showExchangeResult(result) {
    let content = `订单号：${result.order_id}\n商品：${result.product_name}\n数量：${result.quantity}件\n`
    
    if (result.delivery_info) {
      content += `\n${result.delivery_info}`
    }
    
    wx.showModal({
      title: '兑换成功！',
      content,
      showCancel: false,
      confirmText: '查看订单',
      success: () => {
        // 可以跳转到兑换记录页面
        // wx.navigateTo({
        //   url: '/pages/records/exchange-records'
        // })
      }
    })
  },

  /**
   * 搜索输入处理
   */
  onSearchInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({
      searchKeyword: keyword
    })
    this.filterProducts()
  },

  /**
   * 筛选切换
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      currentFilter: filter
    })
    this.filterProducts()
  },

  /**
   * 筛选商品
   */
  filterProducts() {
    console.log('\n🔍 开始商品筛选过程...')
    console.log('📊 当前页面数据状态:', {
      'this.data.products': this.data.products?.length || 0,
      'this.data.filteredProducts': this.data.filteredProducts?.length || 0
    })
    
    // 🚨 已删除：mockProducts违规引用
    // ✅ 统一数据源：仅使用从后端API获取的products
    let sourceProducts = this.data.products || []
    console.log('🔄 复制源商品数据，数量:', sourceProducts.length)
    
    // 🔴 修复：更严格的数据检查，确保是有效数组
    if (!Array.isArray(sourceProducts) || sourceProducts.length === 0) {
      console.warn('⚠️ 源商品数据为空或无效，设置filteredProducts为空数组')
      this.setData({
        filteredProducts: [],
        totalProducts: 0,
        totalPages: 1
      })
      console.log('❌ filterProducts提前返回，原因：无源商品数据')
      return
    }
    
    // 🔴 修复：复制数组避免直接修改原数据
    sourceProducts = [...sourceProducts]
    
    let filtered = [...sourceProducts]
    
    // 搜索关键词筛选
    if (this.data.searchKeyword) {
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(this.data.searchKeyword.toLowerCase()) ||
        product.description.toLowerCase().includes(this.data.searchKeyword.toLowerCase())
      )
    }
    
    // 基础筛选条件
    switch (this.data.currentFilter) {
      case 'available':
        filtered = filtered.filter(product => 
          product.stock > 0 && this.data.totalPoints >= product.exchange_points
        )
        break
      case 'low-price':
        filtered = filtered.filter(product => product.exchange_points <= 1000)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    // 高级筛选 - 分类
    if (this.data.categoryFilter !== 'all') {
      filtered = filtered.filter(product => product.category === this.data.categoryFilter)
    }
    
    // 高级筛选 - 积分范围
    switch (this.data.pointsRange) {
      case '0-500':
        filtered = filtered.filter(product => product.exchange_points >= 0 && product.exchange_points <= 500)
        break
      case '500-1000':
        filtered = filtered.filter(product => product.exchange_points > 500 && product.exchange_points <= 1000)
        break
      case '1000-2000':
        filtered = filtered.filter(product => product.exchange_points > 1000 && product.exchange_points <= 2000)
        break
      case '2000+':
        filtered = filtered.filter(product => product.exchange_points > 2000)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    // 高级筛选 - 库存状态
    switch (this.data.stockFilter) {
      case 'in-stock':
        filtered = filtered.filter(product => product.stock > 5)
        break
      case 'low-stock':
        filtered = filtered.filter(product => product.stock <= 5 && product.stock > 0)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    // 排序
    switch (this.data.sortBy) {
      case 'points-asc':
        filtered.sort((a, b) => a.exchange_points - b.exchange_points)
        break
      case 'points-desc':
        filtered.sort((a, b) => b.exchange_points - a.exchange_points)
        break
      case 'stock-desc':
        filtered.sort((a, b) => b.stock - a.stock)
        break
      case 'rating-desc':
        filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
        break
      default:
        // 'default' - 按创建时间排序
        filtered.sort((a, b) => new Date(b.created_time || Date.now()) - new Date(a.created_time || Date.now()))
        break
    }
    
    // 计算总页数
    const totalPages = Math.ceil(filtered.length / this.data.pageSize)
    
    // 确保当前页码有效
    let currentPage = this.data.currentPage
    if (currentPage > totalPages) {
      currentPage = Math.max(1, totalPages)
      this.setData({ currentPage })
    }
    
    // 分页处理
    const startIndex = (currentPage - 1) * this.data.pageSize
    const endIndex = startIndex + this.data.pageSize
    const paginatedProducts = filtered.slice(startIndex, endIndex)
    
    this.setData({
      filteredProducts: paginatedProducts,
      totalPages,
      totalProducts: filtered.length
    })
    
    console.log('📦 商品筛选完成:', {
      total: sourceProducts.length,
      filtered: filtered.length,
      displayed: paginatedProducts.length,
      currentPage,
      totalPages
    })
  },

  /**
   * 页码变更
   */
  onPageChange(e) {
    const page = parseInt(e.currentTarget.dataset.page)
    
    if (page >= 1 && page <= this.data.totalPages) {
      this.setData({
        currentPage: page
      })
      this.filterProducts()
      
      // 滚动到顶部
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  /**
   * 上一页
   */
  onPrevPage() {
    if (this.data.currentPage > 1) {
      this.setData({
        currentPage: this.data.currentPage - 1
      })
      this.filterProducts()
      
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  /**
   * 下一页
   */
  onNextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({
        currentPage: this.data.currentPage + 1
      })
      this.filterProducts()
      
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  /**
   * 显示/隐藏高级筛选
   */
  onToggleAdvancedFilter() {
    this.setData({
      showAdvancedFilter: !this.data.showAdvancedFilter
    })
  },

  /**
   * 分类筛选变更
   */
  onCategoryFilterChange(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      categoryFilter: category,
      currentPage: 1 // 重置到第一页
    })
    this.filterProducts()
  },

  /**
   * 积分范围筛选变更
   */
  onPointsRangeChange(e) {
    const range = e.currentTarget.dataset.range
    this.setData({
      pointsRange: range,
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 库存状态筛选变更
   */
  onStockFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      stockFilter: filter,
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 排序方式变更
   */
  onSortByChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    this.setData({
      sortBy: sortBy,
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 重置筛选条件
   */
  onResetFilters() {
    this.setData({
      searchKeyword: '',
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      currentPage: 1
    })
    this.filterProducts()
    
    wx.showToast({
      title: '筛选条件已重置',
      icon: 'success'
    })
  },

  /**
   * 页面跳转输入变更
   */
  onPageInputChange(e) {
    this.setData({
      jumpPageNumber: e.detail.value
    })
  },

  /**
   * 页面跳转确认
   */
  onPageInputConfirm(e) {
    const pageNumber = parseInt(e.detail.value)
    
    if (pageNumber >= 1 && pageNumber <= this.data.totalPages) {
      this.setData({
        currentPage: pageNumber
      })
      this.filterProducts()
      
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    } else {
      wx.showToast({
        title: '页码超出范围',
        icon: 'none'
      })
    }
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      currentFilter: 'all'
    })
    this.applyFilters()
  },

  /**
   * 刷新商品列表
   */
  onRefreshProducts() {
    this.setData({ loading: true })
    this.loadProducts()
  },

  /**
   * 按积分排序
   */
  onSortByPoints() {
    this.setData({
      sortBy: 'points-asc',
      currentPage: 1
    })
    this.filterProducts()
    
    wx.showToast({
      title: '按积分排序完成',
      icon: 'success'
    })
  },

  /**
   * 筛选商品
   */
  applyFilters() {
    this.filterProducts()
  },

  /**
   * 检查并刷新商品数据
   * 实现与商家管理页面的数据联动
   */
  checkAndRefreshProducts() {
    try {
      const app = getApp()
      
      // 检查全局刷新标志
      if (app.globalData.needRefreshExchangeProducts) {
        console.log('🔄 检测到商品数据更新，刷新商品列表')
        this.refreshProductsFromMerchant()
        app.globalData.needRefreshExchangeProducts = false
      }
      
      // 检查商品更新时间戳
      const lastUpdate = app.globalData.merchantProductsLastUpdate || 0
      const currentTime = Date.now()
      if (currentTime - lastUpdate < 5000) { // 5秒内的更新
        console.log('🔄 检测到最近的商品更新，刷新商品列表')
        this.refreshProductsFromMerchant()
      }
    } catch (error) {
      console.warn('⚠️ 检查商品更新失败:', error)
    }
  },

  /**
   * 从商家管理同步商品数据
   * 当商家管理页面更新商品时，通过此方法同步最新数据
   */
  refreshProductsFromMerchant() {
    console.log('🔄 从商家管理同步商品数据...')
    
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 同步商家数据
      console.log('🔧 同步商家数据')
      return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
        // 重新加载商品列表
        return this.loadProducts()
      }).then(() => {
        console.log('✅ 商品数据同步完成')
        wx.showToast({
          title: '商品数据已更新',
          icon: 'success'
        })
      })
    } else {
      // 生产环境从后端同步
      return exchangeAPI.syncProducts().then((syncData) => {
        this.setData({
          products: syncData.data.products,
          totalCount: syncData.data.total
        })
        
        console.log('✅ 商品数据同步完成，共', syncData.data.products.length, '个商品')
        wx.showToast({
          title: '商品数据已更新',
          icon: 'success'
        })
      }).catch((error) => {
        console.error('❌ 商品数据同步失败:', error)
        // 降级方案：重新加载本地数据
        return this.loadProducts()
      })
    }
  },

  /**
   * 🔴 JWT认证诊断 - 帮助识别token问题
   */
  runJWTDiagnostics() {
    console.log('\n🔍=================== JWT认证诊断开始 ===================')    
    console.log('🕐 诊断时间:', new Date().toLocaleString())
    
    const app = getApp()
    
    // 1. 应用状态检查
    console.log('📱 应用状态:', {
      isAppReady: !!app,
      hasGlobalData: !!app.globalData,
      isLoggedIn: app.globalData ? app.globalData.isLoggedIn : false
    })
    
    // 2. Token存储检查
    const globalToken = app.globalData ? app.globalData.accessToken : null
    const storageToken = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const userInfo = wx.getStorageSync('user_info')
    
    console.log('🔑 Token存储状态:', {
      hasGlobalToken: !!globalToken,
      hasStorageToken: !!storageToken,
      hasRefreshToken: !!refreshToken,
      hasUserInfo: !!userInfo,
      globalTokenLength: globalToken ? globalToken.length : 0,
      storageTokenLength: storageToken ? storageToken.length : 0
    })
    
    // 3. 选择使用的token
    const activeToken = globalToken || storageToken
    
    if (!activeToken) {
      console.error('❌ 致命问题：没有任何可用的token！')
      console.log('🔄 建议：用户需要重新登录')
    } else {
      console.log('🔍 当前使用Token:', activeToken.substring(0, 30) + '...')
      
      // 4. JWT结构分析
      try {
        const parts = activeToken.split('.')
        console.log('🔍 JWT结构分析:', {
          totalParts: parts.length,
          isValidJWT: parts.length === 3,
          headerLength: parts[0] ? parts[0].length : 0,
          payloadLength: parts[1] ? parts[1].length : 0,
          signatureLength: parts[2] ? parts[2].length : 0
        })
        
        if (parts.length === 3) {
          // 🔧 修复：使用微信小程序兼容的JWT解码函数
          const { decodeJWTHeader, decodeJWTPayload } = require('../../utils/util.js')
          
          try {
            const header = decodeJWTHeader(activeToken)
            console.log('🔍 JWT Header:', header)
            
            const payload = decodeJWTPayload(activeToken)
            console.log('🔍 JWT Payload:', {
              userId: payload.userId || payload.user_id,
              mobile: payload.mobile,
              isAdmin: payload.is_admin,
              iat: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : 'N/A',
              exp: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'N/A',
              currentTime: new Date().toLocaleString()
            })
          } catch (decodeError) {
            console.error('❌ JWT解码失败:', decodeError.message)
            console.log('这可能是由于Token格式问题导致的')
          }
          
          // 检查过期状态
          const now = Math.floor(Date.now() / 1000)
          if (payload.exp) {
            const isExpired = payload.exp < now
            const timeLeft = payload.exp - now
            console.log('⏰ Token过期检查:', {
              isExpired: isExpired,
              timeLeft: isExpired ? `已过期${Math.abs(timeLeft)}秒` : `还有${timeLeft}秒`,
              expiresAt: new Date(payload.exp * 1000).toLocaleString()
            })
            
            if (isExpired) {
              console.error('🚨 Token已过期！这是401错误的直接原因')
            }
          }
        }
      } catch (error) {
        console.error('❌ JWT解析失败:', error.message)
        console.error('🚨 Token格式错误！这可能是401错误的原因')
      }
    }
    
    // 5. 环境配置检查
    console.log('🌍 环境配置:', {
      platform: 'wechat-miniprogram',
      apiBaseUrl: app.globalData ? app.globalData.apiBaseUrl : 'unknown'
    })
    
    console.log('=================== JWT认证诊断结束 ===================\n')
  },

  /**
   * 🔴 手动触发Token检查（调试用）
   */
  onDebugTokenCheck() {
    console.log('🔧 手动触发Token检查')
    
    const tokenStatus = this.checkTokenStatus()
    
    wx.showModal({
      title: '🔍 Token诊断结果',
      content: `Token状态：${tokenStatus.isValid ? '✅ 有效' : '❌ 无效'}\n\n${tokenStatus.message || tokenStatus.info}\n\n详细信息请查看控制台日志`,
      showCancel: false,
      confirmText: '知道了'
    })
    
    // 如果token无效，触发修复流程
    if (!tokenStatus.isValid) {
      setTimeout(() => {
        this.handleTokenError(tokenStatus.error)
      }, 1000)
    }
  },

  /**
   * 🔍 运行JWT诊断工具 - 解决商品显示空白问题
   */
  runJWTDiagnostics() {
    console.log('🔍 启动商品显示问题诊断工具...')
    
    // 引入诊断工具
    const ProductDisplayDiagnostic = require('../../utils/product-display-diagnostic.js')
    const diagnostic = new ProductDisplayDiagnostic()
    
    // 运行完整诊断
    diagnostic.runFullDiagnostic().then((results) => {
      console.log('🎯 诊断完成，结果数量:', results.length)
      
      // 检查是否有严重问题
      const criticalIssues = results.filter(r => r.type === 'FAIL' || r.type === 'ERROR')
      const solutions = results.filter(r => r.type === 'SOLUTION')
      
      if (criticalIssues.length > 0) {
        console.log('🚨 发现关键问题:', criticalIssues.length, '个')
        
        // 显示诊断结果给用户
        const issueMsg = criticalIssues.map(issue => `• ${issue.category}: ${issue.message}`).join('\n')
        const solutionMsg = solutions.length > 0 ? `\n\n🔧 建议解决方案:\n${solutions[0].message}` : ''
        
        wx.showModal({
          title: '🔍 商品显示问题诊断',
          content: `发现${criticalIssues.length}个问题:\n\n${issueMsg}${solutionMsg}`,
          showCancel: true,
          cancelText: '稍后处理',
          confirmText: '立即修复',
          success: (res) => {
            if (res.confirm && solutions.length > 0) {
              // 如果有自动修复方案，执行修复
              if (solutions[0].solution && solutions[0].solution.autoFix) {
                diagnostic.autoFixTokenIssue()
              } else {
                // 显示手动修复指导
                this.showManualFixGuide(solutions[0])
              }
            }
          }
        })
      } else {
        console.log('✅ 诊断通过，但商品仍显示异常，可能是数据处理问题')
        wx.showModal({
          title: '🔍 诊断结果',
          content: '未发现明显问题，可能是数据处理逻辑异常。\n\n建议：\n1. 检查API返回数据格式\n2. 验证数据映射逻辑\n3. 清除缓存重新加载',
          showCancel: true,
          cancelText: '手动处理',
          confirmText: '清除缓存',
          success: (res) => {
            if (res.confirm) {
              this.clearCacheAndReload()
            }
          }
        })
      }
      
    }).catch((error) => {
      console.error('❌ 诊断工具运行失败:', error)
      wx.showToast({
        title: '诊断工具异常',
        icon: 'none'
      })
    })
  },

  /**
   * 📋 显示手动修复指导
   */
  showManualFixGuide(solution) {
    const steps = solution.solution && solution.solution.steps ? 
      solution.solution.steps.join('\n') : '请参考诊断日志进行修复'
    
    wx.showModal({
      title: '🔧 修复指导',
      content: `${solution.message}\n\n修复步骤:\n${steps}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🧹 清除缓存并重新加载
   */
  clearCacheAndReload() {
    console.log('🧹 清除缓存并重新加载...')
    
    try {
      // 清除相关缓存
      wx.removeStorageSync('products_cache')
      wx.removeStorageSync('exchange_cache')
      
      // 设置需要刷新标志
      const app = getApp()
      app.globalData.needRefreshExchangeProducts = true
      
      wx.showLoading({ title: '清除缓存中...' })
      
      // 延迟重新加载
      setTimeout(() => {
        wx.hideLoading()
        this.loadProducts()
        wx.showToast({
          title: '缓存已清除',
          icon: 'success'
        })
      }, 1000)
      
    } catch (error) {
      console.error('❌ 清除缓存失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '清除缓存失败',
        icon: 'none'
      })
    }
  },

  /**
   * 🔍 测试Token状态和商品加载 - 验证修复效果
   * 这是一个调试用函数，用于验证Token认证修复是否生效
   */
  testTokenAndProductLoading() {
    console.log('\n🧪=================== 开始Token和商品加载测试 ===================')
    console.log('🕐 测试时间:', new Date().toLocaleString())
    
    // 1. 测试Token状态
    console.log('\n📊 第1步：测试Token状态检查')
    const tokenStatus = this.checkTokenStatus()
    console.log('🔍 Token检查结果:', {
      isValid: tokenStatus.isValid,
      error: tokenStatus.error,
      message: tokenStatus.message,
      userInfo: tokenStatus.info
    })
    
    if (!tokenStatus.isValid) {
      console.error('❌ Token状态异常，这会导致商品显示空白')
      console.error('🔧 建议修复方案：', {
        error: tokenStatus.error,
        needsRelogin: tokenStatus.needsRelogin,
        canRefresh: tokenStatus.canRefresh
      })
      
      wx.showModal({
        title: '🧪 Token测试结果',
        content: `Token状态：❌ 异常\n\n错误：${tokenStatus.error}\n消息：${tokenStatus.message}\n\n这就是商品显示空白的原因！`,
        showCancel: true,
        cancelText: '知道了',
        confirmText: '修复Token',
        success: (res) => {
          if (res.confirm) {
            this.handleTokenError(tokenStatus.error, {
              expiredAt: tokenStatus.expiredAt,
              canRefresh: tokenStatus.canRefresh,
              message: tokenStatus.message
            })
          }
        }
      })
      return
    }
    
    console.log('✅ Token状态正常，继续测试API调用')
    
    // 2. 测试商品API调用
    console.log('\n📊 第2步：测试商品API调用')
    const { exchangeAPI } = require('../../utils/api')
    
    exchangeAPI.getProducts(1, 20, undefined, 'points').then((result) => {
      console.log('✅ API调用成功!', result)
      
      const hasProducts = result && result.code === 0 && result.data && result.data.products && result.data.products.length > 0
      
      wx.showModal({
        title: '🧪 商品加载测试结果',
        content: `Token状态：✅ 正常\nAPI调用：✅ 成功\n商品数量：${hasProducts ? result.data.products.length : 0}\n\n${hasProducts ? '商品加载正常！' : '商品列表为空，请检查后端数据'}`,
        showCancel: false,
        confirmText: '知道了'
      })
      
      if (hasProducts) {
        console.log('🎉 测试完成：Token认证和商品加载都正常工作!')
      } else {
        console.warn('⚠️ API调用成功但商品列表为空，可能是后端数据问题')
      }
      
    }).catch((error) => {
      console.error('❌ API调用失败:', error)
      
      wx.showModal({
        title: '🧪 商品加载测试结果',
        content: `Token状态：✅ 正常\nAPI调用：❌ 失败\n\n错误：${error.msg || error.message}\n状态码：${error.statusCode || '未知'}\n\n这表明Token修复可能未完全解决问题`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
    
    console.log('=================== Token和商品加载测试完成 ===================\n')
  },

  /**
   * 🔧 重新加载商品 - 简化版测试函数
   */
  onReloadProducts() {
    console.log('\n🔄 手动重新加载商品...')
    
    // 重置状态
    this.setData({
      loading: true,
      products: [],
      filteredProducts: [],
      totalCount: 0
    })
    
    // 调用商品加载函数
    this.loadProducts().then(() => {
      console.log('✅ 手动重新加载完成')
    }).catch((error) => {
      console.error('❌ 手动重新加载失败:', error)
    })
  },

  /**
   * 🔧 调试：显示当前页面数据状态
   */
  onShowDebugInfo() {
    const debugInfo = {
      'Token状态': app.globalData.accessToken ? '已设置' : '未设置',
      'Loading状态': this.data.loading,
      'Products数量': this.data.products.length,
      'FilteredProducts数量': this.data.filteredProducts.length,
      'TotalCount': this.data.totalCount,
      '用户信息': this.data.userInfo ? '已加载' : '未加载',
      '用户积分': this.data.totalPoints
    }
    
    console.log('🔍 页面数据状态:', debugInfo)
    
    wx.showModal({
      title: '🔍 调试信息',
      content: Object.entries(debugInfo)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔍 API数据诊断 - 分析categories和products数据差异
   */
  diagnoseCategoriesVsProducts() {
    console.log('\n🔍 开始API数据诊断...')
    
    const { exchangeAPI } = require('../../utils/api')
    
    exchangeAPI.getProducts(1, 20, undefined, 'points').then((result) => {
      console.log('📊 API响应详细分析:')
      console.log('完整响应:', JSON.stringify(result, null, 2))
      
      if (result && result.code === 0 && result.data) {
        const data = result.data
        
        const diagnosis = {
          '✅ API调用': '成功',
          '📦 Products数组': data.products ? `存在，长度: ${data.products.length}` : '不存在',
          '📂 Categories数组': data.categories ? `存在，内容: [${data.categories.join(', ')}]` : '不存在',
          '🔢 Total字段': data.total !== undefined ? data.total : '未定义',
          '📄 Page字段': data.page !== undefined ? data.page : '未定义',
          '🔢 Limit字段': data.limit !== undefined ? data.limit : '未定义',
          '➡️ Has_more字段': data.has_more !== undefined ? data.has_more : '未定义'
        }
        
        console.log('🔍 诊断结果:', diagnosis)
        
        // 分析问题
        let problemAnalysis = '📋 问题分析:\n\n'
        
        if (data.categories && data.categories.length > 0 && (!data.products || data.products.length === 0)) {
          problemAnalysis += '🚨 发现关键问题：\n'
          problemAnalysis += '• Categories有数据但Products为空\n'
          problemAnalysis += '• 这表明后端分类查询正常，但商品查询有问题\n\n'
          
          problemAnalysis += '🔍 可能原因：\n'
          problemAnalysis += '1. 商品查询SQL条件过于严格\n'
          problemAnalysis += '2. 商品状态字段不是"active"\n'
          problemAnalysis += '3. 权限验证阻止了商品查询\n'
          problemAnalysis += '4. 商品和分类使用不同的数据源\n\n'
          
          problemAnalysis += '🔧 建议检查：\n'
          problemAnalysis += '• 后端商品查询的WHERE条件\n'
          problemAnalysis += '• 数据库中商品的status字段值\n'
          problemAnalysis += '• API接口的权限验证逻辑\n'
          problemAnalysis += '• 13612227930用户的权限配置'
        } else if (!data.categories || data.categories.length === 0) {
          problemAnalysis += '⚠️ Categories也为空，可能是全局API问题'
        } else if (data.products && data.products.length > 0) {
          problemAnalysis += '✅ Products和Categories都有数据，正常状态'
        }
        
        wx.showModal({
          title: '🔍 API数据诊断结果',
          content: Object.entries(diagnosis)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n') + '\n\n' + problemAnalysis,
          showCancel: true,
          cancelText: '知道了',
          confirmText: '查看日志',
          success: (res) => {
            if (res.confirm) {
              console.log('📋 详细诊断信息已输出到控制台')
            }
          }
        })
        
      } else {
        wx.showModal({
          title: '❌ API调用失败',
          content: `API返回异常:\n\nCode: ${result?.code}\nMessage: ${result?.msg || '未知错误'}`,
          showCancel: false,
          confirmText: '知道了'
        })
      }
    }).catch((error) => {
      console.error('❌ API诊断失败:', error)
      wx.showModal({
        title: '❌ API诊断失败',
        content: `网络或认证错误:\n\n${error.message || error}`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  /**
   * 🔴 修复：友好的未登录状态处理
   */
  handleNotLoggedIn() {
    console.log('🔑 处理正常未登录状态')
    
    this.setData({ loading: false })
    
    wx.showModal({
      title: '🔑 需要登录',
      content: '当前未登录，无法查看商品列表\n\n这是解决商品显示空白问题的关键步骤\n\n请先登录后再查看兑换商品',
      showCancel: false,
      confirmText: '立即登录',
      confirmColor: '#FF6B35',
      success: () => {
        this.redirectToLogin()
      }
    })
  },

  // 🔴 已删除：test4000ErrorFix() - 违反项目安全规则，删除模拟错误测试函数

  /**
   * 🔴 新增：快速重试商品加载（用于修复后测试）
   */
  quickRetryProductLoad() {
    console.log('⚡ 快速重试商品加载...')
    
    // 显示重试提示
    wx.showToast({
      title: '正在重新加载商品...',
      icon: 'loading',
      duration: 1500
    })
    
    // 重置页面状态
    this.setData({
      currentPage: 1,
      searchKeyword: '',
      currentFilter: 'all'
    })
    
    // 延迟加载，确保提示显示
    setTimeout(() => {
      this.loadProducts()
    }, 500)
  },

  /**
   * 🔴 增强版：页面错误恢复机制
   */
  handlePageErrorRecovery() {
    console.log('🔧 启动页面错误恢复机制...')
    
    try {
      // 检查基本状态
      const hasBasicData = this.data && typeof this.data === 'object'
      const hasProducts = Array.isArray(this.data.products)
      const hasFilteredProducts = Array.isArray(this.data.filteredProducts)
      
      if (!hasBasicData) {
        console.error('❌ 页面数据结构异常')
        this.initPage()
        return
      }
      
      if (!hasProducts || !hasFilteredProducts) {
        console.warn('⚠️ 商品数据缺失，重新加载')
        this.setData({
          products: [],
          filteredProducts: [],
          loading: false
        })
        this.loadProducts()
        return
      }
      
      console.log('✅ 页面状态检查正常')
      
    } catch (error) {
      console.error('❌ 页面错误恢复失败:', error)
      
      // 最后的安全措施：重新初始化页面
      wx.showModal({
        title: '🔧 页面恢复',
        content: '检测到页面状态异常，将重新初始化页面以确保功能正常',
        showCancel: false,
        confirmText: '确定',
        success: () => {
          this.initPage()
        }
      })
    }
  },



  /**
   * 🏪 切换到交易市场（修复版）
   * ✨ 进入双空间系统：幸运空间（默认）+ 臻选空间
   */
  async onGoToTradeMarket() {
    console.log('🏪 切换到交易市场')
    
    // 如果已经在交易市场标签，直接返回
    if (this.data.currentTab === 'market') {
      console.log('已在交易市场，无需切换')
      return
    }
    
    // 切换到交易市场内容
    this.setData({
      currentTab: 'market',
      currentSpace: 'lucky' // 默认进入幸运空间
    })
    
    // 获取系统信息，计算布局参数
    this.initLayoutParams()
    
    // 初始化幸运空间数据（方案1瀑布流布局）
    await this.initLuckySpaceData()
    
    // 预初始化臻选空间数据结构（确保数据字段存在）
    console.log('📦 预初始化臻选空间数据结构...')
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
    
    console.log('✅ 交易市场已激活，进入幸运空间')
  },

  /**
   * 🎯 简化版：切换回商品兑换内容 - 纯粹的内容切换
   * ✨ 移除所有视觉反馈，只保留按钮激活状态的颜色变化
   */
  onGoToExchange() {
    // 如果已经在商品兑换标签，直接返回
    if (this.data.currentTab === 'exchange') {
      return
    }
    
    // 直接切换内容，无任何动画或延迟
    this.setData({
      currentTab: 'exchange'
    })
  },

  /**
   * 🏪 加载交易市场数据 - 使用后端真实API
   */
  async loadMarketData() {
    try {
      console.log('🔄 开始从后端加载交易市场数据...')
      
      // 显示加载状态
      this.setData({
        loading: true,
        loadingText: '正在加载交易数据...'
      })
      
      // 初始化空间统计数据
      this.initSpaceStats()
      
      // 🔴 从后端API获取真实交易数据
      const response = await API.marketAPI.getTradeList({
        page: 1,
        limit: 20,
        space: this.data.currentSpace
      })
      
      if (!response || !response.data) {
        throw new Error('后端返回数据格式异常')
      }
      
      const tradeList = response.data.trades || []
      const marketStats = response.data.stats || {
        total_trades: 0,
        avg_price: 0,
        hot_categories: []
      }
      
      // 根据当前空间筛选商品
      const filteredTrades = this.filterTradesBySpace(tradeList, this.data.currentSpace)
      
      this.setData({
        tradeList: tradeList,
        filteredTrades: filteredTrades,
        marketStats: marketStats,
        loading: false,
        loadingText: ''
      })
      
      console.log('✅ 交易市场数据加载完成', {
        总数: tradeList.length,
        筛选后: filteredTrades.length
      })
      
      return Promise.resolve()
    } catch (error) {
      console.error('❌ 加载交易市场数据失败:', error)
      
      // 设置友好的错误提示
      let errorMessage = '加载交易数据失败'
      if (error.message && error.message.includes('网络')) {
        errorMessage = '网络连接异常，请检查网络后重试'
      } else if (error.message && error.message.includes('认证')) {
        errorMessage = '登录状态过期，请重新登录'
      } else if (error.message && error.message.includes('服务器')) {
        errorMessage = '服务器繁忙，请稍后重试'
      }
      
      this.setData({
        loading: false,
        loadingText: '',
        errorMessage: errorMessage,
        showError: true,
        tradeList: [],
        filteredTrades: [],
        marketStats: {
          total_trades: 0,
          avg_price: 0,
          hot_categories: []
        }
      })
      
      // 显示错误提示
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })
      
      return Promise.reject(error)
    }
  },

  /**
   * 🎯 初始化空间统计数据
   */
  initSpaceStats() {
    const luckyStats = {
      new_count: Math.floor(Math.random() * 10) + 5,
      avg_discount: Math.floor(Math.random() * 20) + 10,
      flash_deals: Math.floor(Math.random() * 5) + 1
    }
    
    const premiumStats = {
      hot_count: Math.floor(Math.random() * 3),
      avg_rating: (Math.random() * 0.5 + 4.5).toFixed(1),
      trending_count: Math.floor(Math.random() * 8) + 3
    }
    
    this.setData({
      luckySpaceStats: luckyStats,
      premiumSpaceStats: premiumStats
    })
  },

  /**
   * 🎯 根据空间类型筛选商品
   */
  filterTradesBySpace(trades, spaceType) {
    if (!trades || trades.length === 0) return []
    
    let filtered = [...trades]
    
    if (spaceType === 'lucky') {
      // 幸运空间：筛选特价、折扣商品
      filtered = trades.filter(trade => {
        const hasDiscount = trade.price_off_percent > 5
        const isAffordable = trade.price_points <= 1000
        const isSpecial = trade.trade_description?.includes('特价') || 
                         trade.trade_description?.includes('限时') ||
                         trade.price_off_percent > 10
        
        return hasDiscount || isAffordable || isSpecial
      })
      
      // 按折扣率排序
      filtered.sort((a, b) => (b.price_off_percent || 0) - (a.price_off_percent || 0))
    }
    
    return filtered
  },



  // 混合展示布局函数已移除（generateCarouselData）

  // 混合展示布局函数已移除（generateCardSections）

  // 混合展示布局函数已移除（generateListProducts）

  /**
   * 🏪 初始化布局参数
   */
  initLayoutParams() {
    const systemInfo = wx.getSystemInfoSync()
    const containerWidth = systemInfo.windowWidth - 40 // 减去左右边距
    const columnWidth = (containerWidth - 15) / 2 // 双列布局，减去中间间距
    
    this.setData({
      containerWidth: containerWidth,
      columnWidth: columnWidth
    })
    
    console.log('📐 布局参数初始化完成', {
      containerWidth,
      columnWidth
    })
  },

  /**
   * 🍀 初始化幸运空间数据（方案1：瀑布流布局）
   */
  async initLuckySpaceData() {
    console.log('🍀 开始初始化幸运空间瀑布流数据...')
    
    // 生成瀑布流商品数据
    const waterfallProducts = await this.loadWaterfallProducts()
    
    // 计算瀑布流布局
    this.calculateWaterfallLayout(waterfallProducts)
    
    console.log('✅ 幸运空间瀑布流数据初始化完成')
    console.log('📊 商品数量:', waterfallProducts.length)
  },

  /**
   * 💎 初始化臻选空间数据（方案3：混合展示布局）
   * 包含三层式布局结构：轮播推荐区 + 卡片组区 + 详细列表区
   */
  initPremiumSpaceData() {
    console.log('💎 开始初始化臻选空间混合展示布局数据...')
    
    try {
      // 初始化混合布局数据
      this.initMixedLayoutData()
      
      console.log('✅ 臻选空间混合展示布局数据初始化完成')
      console.log('📊 混合布局数据统计:', {
        轮播数量: this.data.carouselItems.length,
        卡片组数: this.data.cardSections.length,
        列表商品: this.data.listProducts.length
      })
    } catch (error) {
      console.error('❌ 臻选空间混合布局初始化失败:', error)
    }
  },

  /**
   * 🎨 初始化混合展示布局数据
   * 方案3核心实现：三层式布局架构
   */
  initMixedLayoutData() {
    console.log('🎨 构建混合展示布局三层架构...')
    
    // 生成基础商品数据
    const allProducts = this.generateMixedLayoutProducts()
    
    // 1. 生成轮播推荐区数据
    const carouselItems = this.generateCarouselData(allProducts)
    
    // 2. 生成卡片组区域数据  
    const cardSections = this.generateCardSections(allProducts)
    
    // 3. 生成详细列表区数据
    const listProducts = this.generateListProducts(allProducts)
    
    // 更新数据到页面
    console.log('📦 准备更新页面数据...')
    this.setData({
      // 轮播推荐区
      carouselItems: carouselItems,
      carouselActiveIndex: 0,
      autoPlay: true,
      
      // 卡片组区域
      cardSections: cardSections,
      
      // 详细列表区
      listProducts: listProducts,
      
      // 混合布局配置
      mixedLayoutConfig: {
        carouselAutoPlay: true,
        carouselInterval: 4000,
        cardColumns: 2,
        listShowDetails: true
      }
    })
    console.log('✅ 页面数据更新完成')
    
    console.log('📊 轮播区项目数:', carouselItems.length)
    console.log('📊 卡片组数量:', cardSections.length)  
    console.log('📊 列表商品数:', listProducts.length)
    
    // 调试输出：验证数据结构
    console.log('🔍 轮播数据预览:', carouselItems.slice(0, 2))
    console.log('🔍 卡片组数据预览:', cardSections.map(s => ({
      title: s.title,
      productCount: s.products.length
    })))
    console.log('🔍 列表数据预览:', listProducts.slice(0, 2).map(p => p.name))
  },

  /**
   * 🛍️ 生成混合布局专用商品数据
   * 为臻选空间提供高品质商品数据源
   */
  /**
   * 🛍️ 获取混合布局商品数据 - 从后端API获取
   * 🚨 严禁使用硬编码数据，必须从后端获取真实商品数据
   */
  async generateMixedLayoutProducts() {
    console.log('🛍️ 开始从后端获取混合布局商品数据...')
    
    try {
      // 🔴 从后端API获取真实商品数据
      const response = await exchangeAPI.getProducts({
        page: 1,
        limit: 20,
        category: 'premium'  // 获取精品商品
      })
      
      if (response.code === 0 && response.data && response.data.products) {
        const products = response.data.products
        console.log('✅ 成功获取后端商品数据，商品数量:', products.length)
        return products
      } else {
        console.error('❌ 后端商品API返回异常:', response)
        throw new Error('后端商品API返回数据格式不正确')
      }
    } catch (error) {
      console.error('❌ 获取后端商品数据失败:', error)
      
      // 🚨 严禁使用模拟数据 - 显示错误提示
      wx.showModal({
        title: '⚠️ 后端服务异常',
        content: '无法获取商品数据，请检查后端API服务是否正常运行。',
        showCancel: false,
        confirmText: '知道了'
      })
      
      // 返回空数组，避免页面崩溃
      return []
    }
  },

  /**
   * 🎠 生成轮播推荐区数据
   * 顶部轮播区：展示精选商品和热门推荐
   */
  generateCarouselData(allProducts) {
    console.log('🎠 生成轮播推荐区数据...')
    console.log('🎠 输入商品总数:', allProducts.length)
    
    // 筛选适合轮播展示的商品（精选 + 高评分）
    const featuredProducts = allProducts.filter(product => 
      product.isFeatured && product.rating >= 4.7
    ).slice(0, 5)
    
    console.log('🎠 筛选到精选商品:', featuredProducts.length, '个')

    const carouselItems = featuredProducts.map((product, index) => ({
      id: `carousel_${product.id}`,
      product_id: product.id,
      image: product.image,
      title: product.name,
      subtitle: product.sellPoint || '精选推荐',
      price: product.price,
      originalPrice: product.originalPrice,
      discount: product.discount,
      rating: product.rating,
      sales: product.sales,
      tags: product.tags,
      link: `/pages/product/detail?id=${product.id}`,
      background: this.getCarouselBackground(index)
    }))

    console.log('✅ 轮播推荐区数据生成完成，项目数:', carouselItems.length)
    return carouselItems
  },

  /**
   * 🎨 获取轮播背景渐变色
   */
  getCarouselBackground(index) {
    const backgrounds = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)'
    ]
    return backgrounds[index % backgrounds.length]
  },

  /**
   * 🎴 生成卡片组区域数据
   * 中部横向滑动卡片组：按类别或标签组织商品
   */
  generateCardSections(allProducts) {
    console.log('🎴 生成卡片组区域数据...')
    console.log('🎴 输入商品总数:', allProducts.length)
    
    const cardSections = [
      {
        id: 'hot_section',
        title: '🔥 热销榜单',
        type: 'hot',
        icon: '🔥',
        subtitle: '人气商品，抢购必备',
        displayStyle: 'horizontal-scroll',
        products: this.filterProductsByCondition(allProducts, 'hot', 6),
        backgroundColor: '#fff2e8',
        titleColor: '#ff6b35'
      },
      {
        id: 'new_section', 
        title: '✨ 新品上架',
        type: 'new',
        icon: '✨',
        subtitle: '最新好物，抢先体验',
        displayStyle: 'horizontal-scroll',
        products: this.filterProductsByCondition(allProducts, 'new', 6),
        backgroundColor: '#f0f8ff',
        titleColor: '#4facfe'
      },
      {
        id: 'discount_section',
        title: '💰 限时特价',
        type: 'discount',
        icon: '💰',
        subtitle: '超值优惠，错过后悔',
        displayStyle: 'horizontal-scroll', 
        products: this.filterProductsByCondition(allProducts, 'discount', 6),
        backgroundColor: '#f0fff4',
        titleColor: '#43e97b'
      }
    ]
    
    // 为每个卡片添加布局信息
    cardSections.forEach(section => {
      section.products = section.products.map((product, index) => ({
        ...product,
        cardIndex: index,
        sectionType: section.type
      }))
    })

    console.log('✅ 卡片组区域数据生成完成，组数:', cardSections.length)
    return cardSections
  },

  /**
   * 🔍 根据条件筛选商品
   */
  filterProductsByCondition(products, condition, limit = 6) {
    let filteredProducts = []
    
    switch (condition) {
      case 'hot':
        // 热销商品：销量高或评分高
        filteredProducts = products.filter(product => 
          product.isHot || product.sales >= 1000 || product.rating >= 4.7
        )
        break
      case 'new':
        // 新品商品：标记为新品
        filteredProducts = products.filter(product => product.isNew)
        // 如果新品不够，补充最近的商品
        if (filteredProducts.length < limit) {
          const remaining = products.filter(product => 
            !product.isNew && filteredProducts.findIndex(p => p.id === product.id) === -1
          ).slice(0, limit - filteredProducts.length)
          filteredProducts = [...filteredProducts, ...remaining]
        }
        break
      case 'discount':
        // 特价商品：折扣大于15%
        filteredProducts = products.filter(product => 
          product.discount && product.discount >= 15
        )
        break
      default:
        filteredProducts = products
    }

    // 排序：优先显示评分高的
    filteredProducts.sort((a, b) => b.rating - a.rating)
    
    return filteredProducts.slice(0, limit)
  },

  /**
   * 📝 生成详细列表区数据
   * 底部详细列表区：传统列表布局展示完整信息
   */
  generateListProducts(allProducts) {
    console.log('📝 生成详细列表区数据...')
    console.log('📝 输入商品总数:', allProducts.length)
    
    // 获取不在轮播和卡片组中显示的商品
    const carouselProductIds = new Set()
    const cardProductIds = new Set()
    
    // 收集已在其他区域显示的商品ID
    allProducts.forEach(product => {
      if (product.isFeatured && product.rating >= 4.7) {
        carouselProductIds.add(product.id)
      }
      if (product.isHot || product.isNew || (product.discount >= 15)) {
        cardProductIds.add(product.id)
      }
    })

    // 筛选剩余商品用于列表展示  
    let remainingProducts = allProducts.filter(product => 
      !carouselProductIds.has(product.id) && 
      !cardProductIds.has(product.id)
    )

    // 如果剩余商品不够，添加一些已展示的商品（避免空列表）
    if (remainingProducts.length < 3) {
      const additionalProducts = allProducts.filter(product => 
        cardProductIds.has(product.id)
      ).slice(0, 8)
      remainingProducts = [...remainingProducts, ...additionalProducts]
    }

    // 为列表商品添加详细信息
    const listProducts = remainingProducts.map((product, index) => ({
      ...product,
      listIndex: index,
      showDescription: true,
      showSeller: true,
      showDetailedRating: true,
      estimatedDelivery: this.calculateDeliveryTime(product),
      freeShipping: product.price >= 99, // 99元包邮
      hasWarranty: product.category === '数码手机' || product.category === '家电',
      returnPolicy: '7天无理由退换'
    }))

    // 按综合评分排序（评分 + 销量权重）
    listProducts.sort((a, b) => {
      const scoreA = a.rating * 0.7 + Math.log10(a.sales + 1) * 0.3
      const scoreB = b.rating * 0.7 + Math.log10(b.sales + 1) * 0.3
      return scoreB - scoreA
    })

    console.log('✅ 详细列表区数据生成完成，商品数:', listProducts.length)
    return listProducts.slice(0, 20) // 限制最多20个商品
  },

  /**
   * 🚚 计算预计配送时间
   */
  calculateDeliveryTime(product) {
    const deliveryOptions = [
      '当日达',
      '次日达', 
      '2-3天',
      '3-5天',
      '5-7天'
    ]
    
    // 根据商品类型和价格判断配送时间
    if (product.price >= 2000) {
      return deliveryOptions[0] // 高价商品当日达
    } else if (product.price >= 500) {
      return deliveryOptions[1] // 中价商品次日达
    } else {
      const randomIndex = Math.floor(Math.random() * 3) + 2
      return deliveryOptions[randomIndex] // 普通商品2-7天
    }
  },

  /**
   * 🎠 轮播图切换事件处理
   */
  onCarouselChange(e) {
    const current = e.detail.current
    this.setData({
      carouselActiveIndex: current
    })
    
    console.log('🎠 轮播切换到:', current)
  },

  /**
   * 🔧 臻选空间诊断工具
   * 系统性检查臻选空间显示问题
   */
  diagnosePremiumSpace() {
    console.log('🔧 === 臻选空间诊断工具启动 ===')
    
    const diagnostics = {
      timestamp: new Date().toLocaleString(),
      currentSpace: this.data.currentSpace,
      dataStatus: {},
      renderStatus: {},
      configStatus: {}
    }
    
    // 1. 检查当前空间状态
    console.log('📍 当前空间:', this.data.currentSpace)
    diagnostics.currentSpace = this.data.currentSpace
    
    // 2. 检查数据完整性
    console.log('📊 === 数据完整性检查 ===')
    diagnostics.dataStatus = {
      carouselItems: {
        exists: !!this.data.carouselItems,
        length: this.data.carouselItems?.length || 0,
        sample: this.data.carouselItems?.slice(0, 1) || []
      },
      cardSections: {
        exists: !!this.data.cardSections,
        length: this.data.cardSections?.length || 0,
        sample: this.data.cardSections?.map(s => ({title: s.title, count: s.products?.length})) || []
      },
      listProducts: {
        exists: !!this.data.listProducts,
        length: this.data.listProducts?.length || 0,
        sample: this.data.listProducts?.slice(0, 1)?.map(p => p.name) || []
      },
      mixedLayoutConfig: {
        exists: !!this.data.mixedLayoutConfig,
        config: this.data.mixedLayoutConfig || {}
      }
    }
    
    // 3. 检查渲染条件
    console.log('🎨 === 渲染条件检查 ===')
    const isPremiumSpace = this.data.currentSpace === 'premium'
    const hasCarouselData = this.data.carouselItems && this.data.carouselItems.length > 0
    const hasCardData = this.data.cardSections && this.data.cardSections.length > 0
    const hasListData = this.data.listProducts && this.data.listProducts.length > 0
    
    diagnostics.renderStatus = {
      isPremiumSpace,
      hasCarouselData,
      hasCardData,
      hasListData,
      shouldShowCarousel: isPremiumSpace && hasCarouselData,
      shouldShowCards: isPremiumSpace && hasCardData,
      shouldShowList: isPremiumSpace && hasListData,
      shouldShowEmpty: isPremiumSpace && !hasCarouselData && !hasCardData && !hasListData
    }
    
    // 4. 输出诊断结果
    console.log('📋 === 诊断结果 ===')
    console.table(diagnostics.dataStatus)
    console.table(diagnostics.renderStatus)
    
    // 5. 问题分析
    const issues = []
    if (isPremiumSpace && !hasCarouselData) issues.push('轮播数据缺失')
    if (isPremiumSpace && !hasCardData) issues.push('卡片组数据缺失')  
    if (isPremiumSpace && !hasListData) issues.push('列表数据缺失')
    if (!isPremiumSpace) issues.push('未切换到臻选空间')
    
    console.log('⚠️ 发现问题:', issues.length > 0 ? issues : '无问题')
    
    // 6. 修复建议
    if (issues.length > 0) {
      console.log('💡 修复建议:')
      if (!isPremiumSpace) console.log('- 请先切换到臻选空间')
      if (!hasCarouselData || !hasCardData || !hasListData) {
        console.log('- 重新初始化臻选空间数据')
        this.initPremiumSpaceData()
      }
    }
    
         // 7. 检查WXML渲染条件
     console.log('🎨 === WXML渲染条件分析 ===')
     const wxmlConditions = {
       premiumSpaceVisible: `currentSpace === 'premium'`,
       carouselSectionVisible: `carouselItems && carouselItems.length > 0`,
       cardSectionsVisible: `cardSections && cardSections.length > 0`, 
       listSectionVisible: `listProducts && listProducts.length > 0`,
       emptyStateVisible: `(!carouselItems || carouselItems.length === 0) && (!cardSections || cardSections.length === 0) && (!listProducts || listProducts.length === 0)`
     }
     
     console.log('WXML条件评估:')
     for (const [key, condition] of Object.entries(wxmlConditions)) {
       const result = this.evaluateWXMLCondition(condition)
       console.log(`${key}: ${condition} = ${result}`)
     }
     
     return diagnostics
   },

   /**
    * 📐 评估WXML条件表达式
    */
   evaluateWXMLCondition(condition) {
     try {
       // 简单的条件评估器
       const data = this.data
       return eval(condition.replace(/currentSpace/g, `'${data.currentSpace}'`)
                          .replace(/carouselItems/g, JSON.stringify(data.carouselItems))
                          .replace(/cardSections/g, JSON.stringify(data.cardSections))
                          .replace(/listProducts/g, JSON.stringify(data.listProducts)))
     } catch(e) {
       return `评估错误: ${e.message}`
     }
   },

   /**
    * 🧪 临时测试臻选空间按钮
    */
   onTestPremiumSpace() {
    console.log('🧪 === 临时测试臻选空间 ===')
    
    // 强制切换到臻选空间
    this.setData({ currentSpace: 'premium' })
    console.log('✅ 强制切换到臻选空间')
    
    // 延迟100ms后运行诊断
    setTimeout(() => {
      const result = this.diagnosePremiumSpace()
      
      // 如果数据有问题，强制重新初始化
      if (!result.renderStatus.hasCarouselData || 
          !result.renderStatus.hasCardData || 
          !result.renderStatus.hasListData) {
        console.log('🔄 强制重新初始化数据...')
        this.initPremiumSpaceData()
        
                 // 再次诊断
         setTimeout(() => {
           const finalResult = this.diagnosePremiumSpace()
           
           // 如果还是有问题，提供直接的解决方案
           if (!finalResult.renderStatus.hasCarouselData || 
               !finalResult.renderStatus.hasCardData || 
               !finalResult.renderStatus.hasListData) {
             console.log('🚨 === 紧急修复模式 ===')
             this.loadPremiumSpaceData()
           }
         }, 500)
       }
     }, 100)
   },

   /**
    * 🔒 加载臻选空间真实数据
    */
   async loadPremiumSpaceData() {
     console.log('🔒 从后端加载臻选空间数据...')
     
     try {
       wx.showLoading({ title: '加载中...', mask: true })
       
       const { exchangeAPI } = require('../../utils/api')
       
       // 并行获取轮播、卡片和列表数据
       const [carouselRes, cardRes, listRes] = await Promise.allSettled([
         exchangeAPI.getCarouselProducts(),
         exchangeAPI.getCardProducts(), 
         exchangeAPI.getListProducts()
       ])
       
       const updateData = {}
       
       // 处理轮播数据
       if (carouselRes.status === 'fulfilled' && carouselRes.value.code === 200) {
         updateData.carouselItems = carouselRes.value.data || []
       } else {
         console.warn('⚠️ 轮播数据加载失败')
         updateData.carouselItems = []
       }
       
       // 处理卡片数据
       if (cardRes.status === 'fulfilled' && cardRes.value.code === 200) {
         updateData.cardSections = cardRes.value.data || []
       } else {
         console.warn('⚠️ 卡片数据加载失败')
         updateData.cardSections = []
       }
       
       // 处理列表数据
       if (listRes.status === 'fulfilled' && listRes.value.code === 200) {
         updateData.listProducts = listRes.value.data || []
       } else {
         console.warn('⚠️ 列表数据加载失败')
         updateData.listProducts = []
       }
       
       // 更新页面数据
       this.setData(updateData)
       
       wx.hideLoading()
       
       console.log('✅ 臻选空间真实数据加载完成')
       
     } catch (error) {
       wx.hideLoading()
       console.error('❌ 臻选空间数据加载错误:', error)
       wx.showToast({
         title: '数据加载失败',
         icon: 'none'
       })
     }
   },

  /**
   * 🔒 加载瀑布流商品真实数据
   */
  async loadWaterfallProducts() {
    try {
      console.log('🔒 从后端加载瀑布流商品数据...')
      
      const { exchangeAPI } = require('../../utils/api')
      
      // 调用后端API获取瀑布流商品数据
      const response = await exchangeAPI.getProducts(1, 20, 'waterfall', 'popular')
      
      if (response.code === 200 && response.data && response.data.records) {
        // 处理后端返回的数据，确保包含瀑布流布局所需的字段
        const products = response.data.records.map(product => ({
          id: product.product_id || product.id,
          name: product.product_name || product.name,
          image: product.product_image || product.image || '/images/default-product.png',
          price: product.points_price || product.price || 0,
          originalPrice: product.original_price || product.price || 0,
          rating: product.rating || 4.5,
          sales: product.sales_count || product.sales || 0,
          isLucky: product.is_lucky || false,
          discount: product.discount || 0,
          tags: product.tags || [],
          height: 0 // 布局计算时会重新设置
        }))
        
        console.log('✅ 瀑布流商品数据加载成功:', products.length, '个商品')
        return products
        
      } else {
        console.warn('⚠️ 瀑布流商品数据加载失败:', response.msg)
        wx.showToast({
          title: '商品数据加载失败',
          icon: 'none'
        })
        return []
      }
      
    } catch (error) {
      console.error('❌ 瀑布流商品数据加载错误:', error)
      wx.showToast({
        title: '网络错误，请稍后重试',
        icon: 'none'
      })
      return []
    }
  },

  /**
   * 🌊 计算瀑布流布局
   */
  calculateWaterfallLayout(products) {
    console.log('🌊 开始计算瀑布流布局...')
    
    const columns = [0, 0] // 重置双列高度记录
    const { columnWidth } = this.data
    
    products.forEach((product, index) => {
      // 选择较短的列
      const shortestCol = columns[0] <= columns[1] ? 0 : 1
      
      // 计算商品卡片高度
      const imageHeight = 200 // 图片固定高度
      const contentHeight = this.calculateContentHeight(product)
      const cardHeight = imageHeight + contentHeight + 30 // 间距
      
      // 设置商品位置信息
      product.columnIndex = shortestCol
      product.left = shortestCol * (columnWidth + 15)
      product.top = columns[shortestCol]
      product.width = columnWidth
      product.height = cardHeight
      
      // 更新列高度
      columns[shortestCol] += cardHeight + 20
    })
    
    // 更新数据状态
    this.setData({
      waterfallProducts: products,
      waterfallColumns: columns,
      containerHeight: Math.max(columns[0], columns[1])
    })
    
    console.log('✅ 瀑布流布局计算完成', {
      productCount: products.length,
      containerHeight: Math.max(columns[0], columns[1])
    })
  },

  /**
   * 📏 计算商品卡片内容高度
   */
  calculateContentHeight(product) {
    // 基础内容高度
    let height = 40 // 商品名称
    height += 25 // 价格行
    height += 20 // 评分销量行
    
    // 根据标签数量增加高度
    if (product.tags && product.tags.length > 0) {
      height += 25
    }
    
    // 根据折扣标签增加高度
    if (product.discount > 0) {
      height += 5
    }
    
    return height
  },

  /**
   * 🔄 空间切换处理（修复版）
   */
  async onSpaceChange(e) {
    const spaceId = e.currentTarget.dataset.space
    const currentSpace = this.data.currentSpace
    
    console.log('🔄 空间切换:', currentSpace, '->', spaceId)
    
    // 如果是当前空间，直接返回
    if (currentSpace === spaceId) {
      console.log('已在当前空间，无需切换')
      return
    }
    
    // 🔒 臻选空间解锁检查
    if (spaceId === 'premium') {
      const unlockResult = this.checkPremiumUnlockStatus()
      if (!unlockResult.canAccess) {
        this.showPremiumUnlockModal(unlockResult)
        return
      }
    }
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' })
    
    // 切换空间
    this.setData({
      currentSpace: spaceId
    })
    
    // 根据空间类型初始化数据
    if (spaceId === 'lucky') {
      console.log('🍀 初始化幸运空间数据...')
      await this.initLuckySpaceData()
    } else if (spaceId === 'premium') {
      console.log('💎 初始化臻选空间数据...')
      this.initPremiumSpaceData()
    }
    
    // 显示切换提示
    wx.showToast({
      title: spaceId === 'lucky' ? '🍀 已进入幸运空间' : '💎 已进入臻选空间',
      icon: 'none',
      duration: 1500
    })
    
    console.log('✅ 空间切换完成')
  },





  // showNavigationFeedback函数已移除

  /**
   * 🔒 初始化臻选空间解锁状态
   */
  async initPremiumUnlockStatus() {
    console.log('🔒 初始化臻选空间解锁状态...')
    
    try {
      // 从本地存储获取解锁状态
      const storedUnlockStatus = wx.getStorageSync('premiumUnlockStatus') || {}
      
      // 获取用户积分信息
      const userInfo = this.data.userInfo
      const totalPoints = this.data.totalPoints
      
      // 模拟获取历史累计积分（实际应从后端获取）
      const cumulativePoints = await this.getCumulativePoints()
      
      // 检查解锁状态
      const currentTime = Date.now()
      const isUnlocked = storedUnlockStatus.unlockTime && 
                        storedUnlockStatus.expiryTime && 
                        currentTime < storedUnlockStatus.expiryTime
      
      // 检查是否满足解锁条件
      const canUnlock = cumulativePoints >= 500000 // 50万积分要求
      
      const unlockStatus = {
        isUnlocked: isUnlocked || false,
        unlockTime: storedUnlockStatus.unlockTime || 0,
        expiryTime: storedUnlockStatus.expiryTime || 0,
        cumulativePoints: cumulativePoints,
        canUnlock: canUnlock
      }
      
      this.setData({
        premiumUnlockStatus: unlockStatus
      })
      
      console.log('🔒 臻选空间解锁状态:', unlockStatus)
      
    } catch (error) {
      console.error('❌ 初始化臻选空间解锁状态失败:', error)
      
      // 设置默认状态
      this.setData({
        premiumUnlockStatus: {
          isUnlocked: false,
          unlockTime: 0,
          expiryTime: 0,
          cumulativePoints: 0,
          canUnlock: false
        }
      })
    }
  },

  /**
   * 🔒 获取用户历史累计积分（后端真实数据）
   * 从后端API获取用户真实的历史累计积分
   */
  async getCumulativePoints() {
    try {
      const { userAPI } = require('../../utils/api')
      
      // 调用后端API获取真实的历史累计积分
      const response = await userAPI.getCumulativePoints()
      
      if (response.code === 200 && response.data) {
        const cumulativePoints = response.data.cumulative_points || 0
        console.log('📊 获取真实历史累计积分:', cumulativePoints)
        return cumulativePoints
      } else {
        console.warn('⚠️ 获取历史累计积分失败:', response.msg)
        wx.showToast({
          title: '获取积分数据失败',
          icon: 'none'
        })
        return 0
      }
      
    } catch (error) {
      console.error('❌ 获取历史累计积分网络错误:', error)
      wx.showToast({
        title: '网络错误，请稍后重试',
        icon: 'none'
      })
      return 0
    }
  },

  /**
   * 🔒 检查臻选空间解锁状态
   */
  checkPremiumUnlockStatus() {
    const unlockStatus = this.data.premiumUnlockStatus
    const currentTime = Date.now()
    
    console.log('🔒 检查臻选空间解锁状态:', unlockStatus)
    
    // 检查是否已解锁且未过期
    if (unlockStatus.isUnlocked && currentTime < unlockStatus.expiryTime) {
      return {
        canAccess: true,
        status: 'unlocked',
        message: '✅ 臻选空间已解锁',
        remainingTime: unlockStatus.expiryTime - currentTime
      }
    }
    
    // 检查是否满足解锁条件
    if (!unlockStatus.canUnlock) {
      const remaining = 500000 - unlockStatus.cumulativePoints
      return {
        canAccess: false,
        status: 'requirement_not_met',
        message: `需要历史累计获得50万积分\n当前累计: ${unlockStatus.cumulativePoints.toLocaleString()}积分\n还需: ${remaining.toLocaleString()}积分`,
        requirement: 500000,
        current: unlockStatus.cumulativePoints,
        remaining: remaining
      }
    }
    
    // 满足条件但需要支付解锁费用
    const currentPoints = this.data.totalPoints
    if (currentPoints < 100) {
      return {
        canAccess: false,
        status: 'insufficient_points',
        message: `解锁需要消耗100积分\n当前积分: ${currentPoints}\n还需: ${100 - currentPoints}积分`,
        cost: 100,
        current: currentPoints,
        needed: 100 - currentPoints
      }
    }
    
    // 可以解锁
    return {
      canAccess: false,
      status: 'can_unlock',
      message: '满足解锁条件，是否支付100积分解锁臻选空间？',
      cost: 100,
      current: currentPoints
    }
  },

  /**
   * 🔒 显示臻选空间解锁弹窗
   */
  showPremiumUnlockModal(unlockResult) {
    console.log('🔒 显示解锁弹窗:', unlockResult)
    
    const { status, message } = unlockResult
    
    // 根据不同状态显示不同的弹窗
    switch (status) {
      case 'requirement_not_met':
        wx.showModal({
          title: '🔒 臻选空间未解锁',
          content: message,
          showCancel: false,
          confirmText: '我知道了',
          confirmColor: '#FF6B35'
        })
        break
        
      case 'insufficient_points':
        wx.showModal({
          title: '💰 积分不足',
          content: message,
          showCancel: true,
          cancelText: '稍后再试',
          confirmText: '去获取积分',
          confirmColor: '#FF6B35',
          success: (res) => {
            if (res.confirm) {
              // 跳转到积分获取页面（如上传页面）
              wx.navigateTo({
                url: '/pages/camera/camera'
              })
            }
          }
        })
        break
        
      case 'can_unlock':
        wx.showModal({
          title: '🔓 解锁臻选空间',
          content: `${message}\n\n解锁后可享受24小时访问权限`,
          showCancel: true,
          cancelText: '取消',
          confirmText: '立即解锁',
          confirmColor: '#FF6B35',
          success: (res) => {
            if (res.confirm) {
              this.unlockPremiumSpace()
            }
          }
        })
        break
        
      default:
        wx.showToast({
          title: '系统错误，请稍后重试',
          icon: 'none'
        })
    }
  },

  /**
   * 🔓 执行臻选空间解锁
   */
  async unlockPremiumSpace() {
    console.log('🔓 开始解锁臻选空间...')
    
    try {
      // 显示加载中
      wx.showLoading({
        title: '解锁中...',
        mask: true
      })
      
      const currentPoints = this.data.totalPoints
      const unlockCost = 100
      
      // 检查积分是否足够
      if (currentPoints < unlockCost) {
        wx.hideLoading()
        wx.showToast({
          title: '积分不足，解锁失败',
          icon: 'none'
        })
        return
      }
      
      // 模拟网络请求延迟
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // 扣除积分
      const newPoints = currentPoints - unlockCost
      
      // 设置解锁状态
      const currentTime = Date.now()
      const expiryTime = currentTime + (24 * 60 * 60 * 1000) // 24小时后过期
      
      const unlockStatus = {
        isUnlocked: true,
        unlockTime: currentTime,
        expiryTime: expiryTime,
        cumulativePoints: this.data.premiumUnlockStatus.cumulativePoints,
        canUnlock: true
      }
      
      // 保存到本地存储
      wx.setStorageSync('premiumUnlockStatus', unlockStatus)
      
      // 更新页面数据
      this.setData({
        totalPoints: newPoints,
        premiumUnlockStatus: unlockStatus
      })
      
      wx.hideLoading()
      
      // 显示成功提示
      wx.showModal({
        title: '🎉 解锁成功',
        content: `臻选空间已解锁！\n有效期：24小时\n剩余积分：${newPoints}`,
        showCancel: false,
        confirmText: '立即进入',
        confirmColor: '#FF6B35',
        success: (res) => {
          if (res.confirm) {
            // 自动切换到臻选空间
            this.setData({
              currentSpace: 'premium'
            })
            this.initPremiumSpaceData()
            
            wx.showToast({
              title: '💎 已进入臻选空间',
              icon: 'none',
              duration: 1500
            })
          }
        }
      })
      
      console.log('✅ 臻选空间解锁成功')
      
    } catch (error) {
      wx.hideLoading()
      console.error('❌ 臻选空间解锁失败:', error)
      
      wx.showToast({
        title: '解锁失败，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 🏆 初始化竞价热榜数据 - 从后端API获取真实数据
   */
  async initBiddingRankingData() {
    try {
      console.log('🎯 从后端加载竞价热榜数据...')
      
      // 显示加载状态
      this.setData({
        biddingLoading: true,
        biddingLoadingText: '正在加载竞价商品...'
      })
      
      // 🔴 从后端API获取真实竞价商品数据
      const response = await API.marketAPI.getBiddingProducts({
        page: 1,
        limit: 20
      })
      
      if (!response || !response.data) {
        throw new Error('后端返回竞价数据格式异常')
      }
      
      const allProducts = response.data.products || []
      
      // 根据后端返回的分类信息进行分配
      const hotRankingList = allProducts.filter(item => item.category === 'hot').slice(0, 8)
      const biddingProducts = allProducts.filter(item => item.category === 'bidding').slice(0, 7)
      const newProducts = allProducts.filter(item => item.category === 'new').slice(0, 5)
      
      this.setData({
        hotRankingList,
        biddingProducts,
        newProducts,
        biddingLoading: false,
        biddingLoadingText: ''
      })
      
      console.log('✅ 竞价热榜数据加载完成', {
        热销榜: hotRankingList.length,
        竞价区: biddingProducts.length,
        新品区: newProducts.length
      })
      
    } catch (error) {
      console.error('❌ 加载竞价热榜数据失败:', error)
      
      // 设置友好的错误提示
      let errorMessage = '加载竞价商品失败'
      if (error.message && error.message.includes('网络')) {
        errorMessage = '网络连接异常，请检查网络后重试'
      } else if (error.message && error.message.includes('认证')) {
        errorMessage = '登录状态过期，请重新登录'
      }
      
      this.setData({
        biddingLoading: false,
        biddingLoadingText: '',
        hotRankingList: [],
        biddingProducts: [],
        newProducts: [],
        biddingErrorMessage: errorMessage,
        showBiddingError: true
      })
      
      // 显示错误提示
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })
    }
  },

  // 🔴 已删除：generateMockBiddingProducts() - 违反项目安全规则，改为使用后端真实API

  /**
   * 🚀 启动实时更新定时器
   */
  startRealTimeUpdate() {
    console.log('🚀 启动竞价热榜实时更新')
    
    // 清除之前的定时器
    if (this.data.realTimeTimer) {
      clearInterval(this.data.realTimeTimer)
    }
    
    // 每30秒更新一次排行和价格
    const timer = setInterval(() => {
      this.updateRealTimeData()
    }, 30000)
    
    this.setData({ realTimeTimer: timer })
  },

  /**
   * 📊 更新实时排行和价格数据
   */
  updateRealTimeData() {
    console.log('📊 更新实时竞价数据')
    
    const { hotRankingList, biddingProducts } = this.data
    
    // 🔴 使用后端真实数据，严禁模拟价格变化
    const updatedHotRanking = hotRankingList // 直接使用后端数据，不做修改
    const updatedBiddingProducts = biddingProducts // 直接使用后端数据，不做修改
    
    // 重新排序热销榜
    updatedHotRanking.sort((a, b) => b.hot_score - a.hot_score)
    updatedHotRanking.forEach((product, index) => {
      product.ranking = index + 1
    })
    
    this.setData({
      hotRankingList: updatedHotRanking,
      biddingProducts: updatedBiddingProducts
    })
    
    console.log('✅ 实时数据更新完成')
  },

  /**
   * 💰 用户竞价操作
   */
  onBidProduct(e) {
    const product = e.currentTarget.dataset.product
    console.log('🎯 用户点击竞价:', product.name)
    
    // 检查用户积分是否足够
    const minBidAmount = product.current_price + product.min_bid_increment
    if (this.data.totalPoints < minBidAmount) {
      wx.showModal({
        title: '💰 积分不足',
        content: `竞价需要至少${minBidAmount}积分\n您当前积分：${this.data.totalPoints}`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    // 显示竞价弹窗
    this.setData({
      showBidModal: true,
      selectedBidProduct: product,
      userBidAmount: minBidAmount
    })
  },

  /**
   * 📈 确认竞价
   */
  onConfirmBid() {
    const { selectedBidProduct, userBidAmount } = this.data
    
    if (!selectedBidProduct || userBidAmount <= selectedBidProduct.current_price) {
      wx.showToast({
        title: '竞价金额无效',
        icon: 'none'
      })
      return
    }
    
    // 模拟竞价成功
    console.log(`🎉 竞价成功: ${selectedBidProduct.name} - ${userBidAmount}积分`)
    
    // 更新商品价格和竞价信息
    this.updateProductBidInfo(selectedBidProduct.product_id, userBidAmount)
    
    // 关闭弹窗
    this.setData({
      showBidModal: false,
      selectedBidProduct: null,
      userBidAmount: 0
    })
    
    wx.showToast({
      title: '🎉 竞价成功',
      icon: 'success'
    })
  },

  /**
   * 🔄 更新商品竞价信息
   */
  updateProductBidInfo(productId, bidAmount) {
    const updateProduct = (productList) => {
      return productList.map(product => {
        if (product.product_id === productId) {
          return {
            ...product,
            current_price: bidAmount,
            bid_count: product.bid_count + 1,
            highest_bidder: '我',
            hot_score: product.hot_score + 100, // 竞价增加热度
            updated_at: Date.now()
          }
        }
        return product
      })
    }
    
    this.setData({
      hotRankingList: updateProduct(this.data.hotRankingList),
      biddingProducts: updateProduct(this.data.biddingProducts)
    })
  },

  /**
   * ❌ 取消竞价
   */
  onCancelBid() {
    this.setData({
      showBidModal: false,
      selectedBidProduct: null,
      userBidAmount: 0
    })
  },

  /**
   * 🔢 竞价金额输入
   */
  onBidAmountInput(e) {
    const amount = parseInt(e.detail.value) || 0
    this.setData({ userBidAmount: amount })
  },

  /**
   * 🔌 页面隐藏时清理定时器
   */
  onHideMarket() {
    if (this.data.realTimeTimer) {
      clearInterval(this.data.realTimeTimer)
      this.setData({ realTimeTimer: null })
    }
  },

  // 未使用的导航相关函数已全部移除，保持代码简洁

  /**
   * 🛍️ 获取混合布局商品数据 - 从后端API获取
   * 严禁使用硬编码数据，必须从后端获取真实商品数据
   */
  async generateMixedLayoutProducts() {
    console.log('🛍️ 开始从后端获取混合布局商品数据...')
    
    try {
      // 🔴 从后端API获取真实商品数据
      const response = await exchangeAPI.getProducts({
        page: 1,
        limit: 20,
        category: 'premium'  // 获取精品商品
      })
      
      if (response.code === 0 && response.data && response.data.products) {
        const products = response.data.products
        console.log('✅ 成功获取后端商品数据，商品数量:', products.length)
        return products
      } else {
        console.error('❌ 后端商品API返回异常:', response)
        throw new Error('后端商品API返回数据格式不正确')
      }
    } catch (error) {
      console.error('❌ 获取后端商品数据失败:', error)
      
      // 🚨 严禁使用模拟数据 - 显示错误提示
      wx.showModal({
        title: '⚠️ 后端服务异常',
        content: '无法获取商品数据，请检测后端API服务是否正常运行。',
        showCancel: false,
        confirmText: '知道了'
      })
      
      // 返回空数组，避免页面崩溃
      return []
    }
  },
})