// pages/trade/market/market.js - 交易市场页面
const app = getApp()
const { tradeAPI, userAPI } = require('../../../utils/api')

Page({
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 🎯 交易空间相关
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
    
    // 商品列表
    tradeList: [],
    filteredTrades: [],
    
    // 页面状态
    loading: true,
    refreshing: false,
    loadingMore: false,
    hasMore: true,
    
    // 搜索和筛选
    searchKeyword: '',
    showFilter: false,
    currentFilter: {
      category: 'all',
      priceMin: 0,
      priceMax: 0,
      sort: 'time_desc'
    },
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    totalCount: 0,
    
    // 商品分类
    categories: ['全部', '优惠券', '数码产品', '生活用品', '美食'],
    
    // 购买确认弹窗
    showPurchaseModal: false,
    selectedTrade: null,
    purchaseQuantity: 1,
    buyerMessage: '',
    
    // 商品详情弹窗
    showDetailModal: false,
    detailTrade: null,
    
    // 市场统计
    marketStats: {
      total_trades: 0,
      avg_price: 0,
      hot_categories: []
    }
  },

  onLoad(options) {
    console.log('🏪 交易市场页面加载', options)
    
    // 初始化空间统计数据
    this.initSpaceStats()
    
    // 检查登录状态
    this.checkAuthAndLoad()
  },

  onShow() {
    console.log('交易市场页面显示')
    
    // 连接WebSocket监听交易更新
    this.connectWebSocket()
    
    // 刷新用户积分
    this.refreshUserInfo()
  },

  onHide() {
    console.log('交易市场页面隐藏')
    this.disconnectWebSocket()
  },

  onPullDownRefresh() {
    console.log('下拉刷新交易市场')
    this.refreshPage()
  },

  onReachBottom() {
    console.log('上拉加载更多交易')
    this.loadMoreTrades()
  },

  /**
   * 检查认证状态并加载页面
   */
  checkAuthAndLoad() {
    const app = getApp()
    
    if (!app.globalData.isLoggedIn || !app.globalData.accessToken) {
      wx.showModal({
        title: '🔑 需要登录',
        content: '请先登录后查看交易市场',
        showCancel: false,
        confirmText: '立即登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
      return
    }
    
    this.initPage()
  },

  /**
   * 初始化页面
   */
  async initPage() {
    try {
      // 并行加载数据
      await Promise.all([
        this.refreshUserInfo(),
        this.loadMarketTrades()
      ])
      
      console.log('✅ 交易市场页面初始化完成')
    } catch (error) {
      console.error('❌ 交易市场页面初始化失败:', error)
      this.handleInitError(error)
    }
  },

  /**
   * 刷新用户信息
   */
  async refreshUserInfo() {
    try {
      const result = await userAPI.getUserInfo()
      
      this.setData({
        userInfo: result.data,
        totalPoints: result.data.total_points
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = result.data
      
      console.log('✅ 用户信息刷新成功，当前积分:', result.data.total_points)
    } catch (error) {
      console.error('❌ 获取用户信息失败:', error)
      
      // 使用全局缓存数据
      if (app.globalData.userInfo) {
        this.setData({
          userInfo: app.globalData.userInfo,
          totalPoints: app.globalData.userInfo.total_points
        })
      }
    }
  },

  /**
   * 🎯 初始化空间统计数据 - 从后端API获取真实数据
   */
  async initSpaceStats() {
    try {
      console.log('🎯 从后端加载空间统计数据...')
      
      // 显示加载状态
      this.setData({
        statsLoading: true,
        statsLoadingText: '正在加载统计数据...'
      })
      
      // 🔴 从后端API获取真实空间统计数据
      const response = await API.marketAPI.getSpaceStats()
      
      if (!response || !response.data) {
        throw new Error('后端返回统计数据格式异常')
      }
      
      const luckyStats = response.data.lucky_space || {
        new_count: 0,
        avg_discount: 0,
        flash_deals: 0
      }
      
      const premiumStats = response.data.premium_space || {
        hot_count: 0,
        avg_rating: '0.0',
        trending_count: 0
      }
      
      this.setData({
        luckySpaceStats: luckyStats,
        premiumSpaceStats: premiumStats,
        statsLoading: false,
        statsLoadingText: ''
      })
      
      console.log('✅ 空间统计数据加载完成', { 
        幸运空间: luckyStats, 
        优质空间: premiumStats 
      })
      
    } catch (error) {
      console.error('❌ 加载空间统计数据失败:', error)
      
      // 设置友好的错误提示
      let errorMessage = '加载统计数据失败'
      if (error.message && error.message.includes('网络')) {
        errorMessage = '网络连接异常，请检查网络后重试'
      } else if (error.message && error.message.includes('认证')) {
        errorMessage = '登录状态过期，请重新登录'
      }
      
      // 设置默认值，避免页面显示空白
      this.setData({
        luckySpaceStats: {
          new_count: 0,
          avg_discount: 0,
          flash_deals: 0
        },
        premiumSpaceStats: {
          hot_count: 0,
          avg_rating: '0.0',
          trending_count: 0
        },
        statsLoading: false,
        statsLoadingText: '',
        statsErrorMessage: errorMessage,
        showStatsError: true
      })
      
      // 显示错误提示
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 3000
      })
    }
  },

  /**
   * 🍀 空间切换处理
   */
  onSpaceChange(e) {
    const newSpace = e.currentTarget.dataset.space
    const oldSpace = this.data.currentSpace
    
    if (newSpace === oldSpace) {
      console.log('🔄 当前已在', newSpace, '空间')
      return
    }
    
    console.log(`🎯 切换空间: ${oldSpace} → ${newSpace}`)
    
    // 显示切换动画
    wx.showLoading({
      title: newSpace === 'lucky' ? '进入幸运空间...' : '进入臻选空间...',
      mask: true
    })
    
    // 震动反馈
    wx.vibrateShort({ type: 'light' })
    
    this.setData({
      currentSpace: newSpace,
      currentPage: 1,
      loading: true
    })
    
    // 重新加载数据（带有空间筛选）
    setTimeout(() => {
      this.loadMarketTrades(1, false)
      wx.hideLoading()
      
      wx.showToast({
        title: newSpace === 'lucky' ? '🍀 已进入幸运空间' : '💎 已进入臻选空间',
        icon: 'none',
        duration: 1500
      })
    }, 800)
  },

  /**
   * 📊 更新空间统计数据 - 从后端API获取真实数据
   */
  async refreshSpaceStats() {
    try {
      console.log('📊 从后端刷新空间统计数据...')
      
      // 🔴 从后端API获取指定空间的真实统计数据
      const response = await API.marketAPI.getSpaceStats({
        space: this.data.currentSpace
      })
      
      if (!response || !response.data) {
        throw new Error('后端返回统计数据格式异常')
      }
      
      // 根据当前空间类型更新对应的统计数据
      if (this.data.currentSpace === 'lucky') {
        const luckyStats = response.data.lucky_space || {
          new_count: 0,
          avg_discount: 0,
          flash_deals: 0
        }
        this.setData({ luckySpaceStats: luckyStats })
        console.log('✅ 幸运空间统计数据已更新', luckyStats)
      } else {
        const premiumStats = response.data.premium_space || {
          hot_count: 0,
          avg_rating: '0.0',
          trending_count: 0
        }
        this.setData({ premiumSpaceStats: premiumStats })
        console.log('✅ 优质空间统计数据已更新', premiumStats)
      }
      
    } catch (error) {
      console.error('❌ 更新空间统计失败:', error)
      
      // 设置友好的错误提示
      let errorMessage = '更新统计数据失败'
      if (error.message && error.message.includes('网络')) {
        errorMessage = '网络连接异常，无法更新数据'
      } else if (error.message && error.message.includes('认证')) {
        errorMessage = '登录状态过期，请重新登录'
      }
      
      // 显示错误提示但不清空现有数据
      wx.showToast({
        title: errorMessage,
        icon: 'none',
        duration: 2000
      })
    }
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
        const hasDiscount = trade.price_off_percent > 5 // 至少5%折扣
        const isAffordable = trade.price_points <= 1000 // 价格不超过1000积分
        const isSpecial = trade.trade_description?.includes('特价') || 
                         trade.trade_description?.includes('限时') ||
                         trade.trade_description?.includes('闪购') ||
                         trade.price_off_percent > 10
        
        return hasDiscount || isAffordable || isSpecial
      })
      
      // 按折扣率排序
      filtered.sort((a, b) => (b.price_off_percent || 0) - (a.price_off_percent || 0))
    } else if (spaceType === 'premium') {
      // 臻选空间：筛选高品质、热门商品
      filtered = trades.filter(trade => {
        const isHighEnd = trade.price_points >= 200 // 价格不低于200积分
        const isPopular = trade.view_count > 50 || trade.favorite_count > 3
        const isQuality = trade.seller_info?.credit_score >= 4.5 ||
                         trade.trade_description?.includes('精选') ||
                         trade.trade_description?.includes('品质') ||
                         trade.trade_description?.includes('热门')
        
        return isHighEnd || isPopular || isQuality
      })
      
      // 按信用分数和浏览量排序
      filtered.sort((a, b) => {
        const scoreA = (a.seller_info?.credit_score || 0) * 0.7 + (a.view_count || 0) * 0.3
        const scoreB = (b.seller_info?.credit_score || 0) * 0.7 + (b.view_count || 0) * 0.3
        return scoreB - scoreA
      })
    }
    
    console.log(`🎯 ${spaceType}空间筛选: ${trades.length} → ${filtered.length}个商品`)
    return filtered
  },

  /**
   * 加载交易市场商品
   */
  async loadMarketTrades(page = 1, append = false) {
    if (!append) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }
    
    try {
      const { category, priceMin, priceMax, sort } = this.data.currentFilter
      const { currentSpace } = this.data
      
      // 🎯 根据空间类型调整筛选参数
      let spaceFilter = {}
      if (currentSpace === 'lucky') {
        // 幸运空间：特价商品、折扣商品
        spaceFilter = {
          min_discount: 5, // 至少5%折扣
          max_price: 1000, // 价格不超过1000积分
          tags: ['特价', '限时', '闪购']
        }
      } else if (currentSpace === 'premium') {
        // 臻选空间：高品质商品、热门推荐
        spaceFilter = {
          min_rating: 4.5, // 至少4.5星评分
          min_price: 200, // 价格不低于200积分
          tags: ['精选', '品质', '热门']
        }
      }
      
      const result = await tradeAPI.getMarketTrades(
        category === 'all' ? '' : category,
        priceMin,
        priceMax,
        sort,
        true, // 排除自己的商品
        page,
        this.data.pageSize
      )
      
      if (result.code === 0) {
        const newTrades = result.data.trades || []
        const marketStats = result.data.market_stats || {}
        
        // 🎯 根据空间类型进一步筛选数据
        const filteredBySpace = this.filterTradesBySpace(newTrades, this.data.currentSpace)
        
        let tradeList
        if (append && page > 1) {
          // 追加数据
          tradeList = [...this.data.tradeList, ...filteredBySpace]
        } else {
          // 替换数据
          tradeList = filteredBySpace
        }
        
        this.setData({
          tradeList,
          filteredTrades: tradeList,
          totalCount: result.data.pagination?.total || 0,
          currentPage: page,
          hasMore: result.data.pagination?.has_more || false,
          marketStats,
          loading: false,
          loadingMore: false
        })
        
        console.log(`✅ 成功加载${filteredBySpace.length}个${this.data.currentSpace === 'lucky' ? '幸运空间' : '臻选空间'}商品`)
        
        if (filteredBySpace.length === 0) {
          wx.showToast({
            title: page === 1 ? `暂无${this.data.currentSpace === 'lucky' ? '幸运空间' : '臻选空间'}商品` : '没有更多商品了',
            icon: 'none'
          })
        }
      } else {
        throw new Error(result.msg || '获取交易列表失败')
      }
    } catch (error) {
      console.error('❌ 加载交易市场失败:', error)
      
      this.setData({
        loading: false,
        loadingMore: false
      })
      
      this.handleApiError(error, '获取交易列表失败')
    }
  },

  /**
   * 加载更多交易
   */
  loadMoreTrades() {
    if (this.data.loadingMore || !this.data.hasMore) {
      return
    }
    
    const nextPage = this.data.currentPage + 1
    this.loadMarketTrades(nextPage, true)
  },

  /**
   * 刷新页面
   */
  async refreshPage() {
    this.setData({ 
      refreshing: true,
      currentPage: 1
    })
    
    try {
      await Promise.all([
        this.refreshUserInfo(),
        this.loadMarketTrades(1, false),
        this.refreshSpaceStats()
      ])
    } catch (error) {
      console.error('❌ 刷新页面失败:', error)
    } finally {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    }
  },

  /**
   * 搜索输入处理
   */
  onSearchInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({ searchKeyword: keyword })
    
    // 防抖搜索
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.performSearch()
    }, 500)
  },

  /**
   * 执行搜索
   */
  performSearch() {
    const keyword = this.data.searchKeyword
    
    if (keyword) {
      // 过滤本地数据
      const filtered = this.data.tradeList.filter(trade => 
        trade.commodity.name.includes(keyword) ||
        trade.trade_description.includes(keyword)
      )
      
      this.setData({ filteredTrades: filtered })
      
      wx.showToast({
        title: `找到${filtered.length}个商品`,
        icon: 'none'
      })
    } else {
      this.setData({ filteredTrades: this.data.tradeList })
    }
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      filteredTrades: this.data.tradeList
    })
  },

  /**
   * 显示/隐藏筛选
   */
  onToggleFilter() {
    this.setData({
      showFilter: !this.data.showFilter
    })
  },

  /**
   * 分类筛选
   */
  onCategoryFilter(e) {
    const category = e.currentTarget.dataset.category
    
    this.setData({
      'currentFilter.category': category,
      currentPage: 1
    })
    
    this.loadMarketTrades(1, false)
    
    wx.showToast({
      title: `已筛选${category === 'all' ? '全部' : category}分类`,
      icon: 'none'
    })
  },

  /**
   * 价格区间筛选
   */
  onPriceFilter(e) {
    const { min, max } = e.currentTarget.dataset
    
    this.setData({
      'currentFilter.priceMin': min || 0,
      'currentFilter.priceMax': max || 0,
      currentPage: 1
    })
    
    this.loadMarketTrades(1, false)
  },

  /**
   * 排序方式切换
   */
  onSortChange(e) {
    const sort = e.currentTarget.dataset.sort
    
    this.setData({
      'currentFilter.sort': sort,
      currentPage: 1
    })
    
    this.loadMarketTrades(1, false)
    
    const sortNames = {
      'time_desc': '最新发布',
      'price_asc': '价格从低到高',
      'price_desc': '价格从高到低',
      'rating_desc': '评分从高到低'
    }
    
    wx.showToast({
      title: `已按${sortNames[sort]}排序`,
      icon: 'none'
    })
  },

  /**
   * 重置筛选条件
   */
  onResetFilter() {
    this.setData({
      searchKeyword: '',
      currentFilter: {
        category: 'all',
        priceMin: 0,
        priceMax: 0,
        sort: 'time_desc'
      },
      currentPage: 1,
      showFilter: false
    })
    
    this.loadMarketTrades(1, false)
    
    wx.showToast({
      title: '筛选条件已重置',
      icon: 'success'
    })
  },

  /**
   * 商品点击 - 显示详情
   */
  onTradeItemTap(e) {
    const trade = e.currentTarget.dataset.trade
    console.log('点击商品:', trade.trade_id)
    
    this.setData({
      detailTrade: trade,
      showDetailModal: true
    })
    
    // 增加浏览次数（后端实现）
    this.incrementViewCount(trade.trade_id)
  },

  /**
   * 增加商品浏览次数
   */
  async incrementViewCount(tradeId) {
    try {
      // 调用后端API增加浏览次数
      // 这里可以调用一个专门的接口
      console.log('📈 增加商品浏览次数:', tradeId)
    } catch (error) {
      console.warn('⚠️ 增加浏览次数失败:', error)
    }
  },

  /**
   * 购买按钮点击
   */
  onBuyButtonTap(e) {
    e.stopPropagation() // 阻止事件冒泡
    
    const trade = e.currentTarget.dataset.trade
    console.log('点击购买按钮:', trade.trade_id)
    
    // 检查积分
    if (this.data.totalPoints < trade.price_points) {
      wx.showModal({
        title: '💰 积分不足',
        content: `购买此商品需要${trade.price_points}积分\n您当前积分：${this.data.totalPoints}\n还需要：${trade.price_points - this.data.totalPoints}积分`,
        showCancel: true,
        cancelText: '知道了',
        confirmText: '去获取积分',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/camera/camera'
            })
          }
        }
      })
      return
    }
    
    // 显示购买确认弹窗
    this.setData({
      selectedTrade: trade,
      purchaseQuantity: 1,
      buyerMessage: '',
      showPurchaseModal: true
    })
  },

  /**
   * 购买数量调整
   */
  onQuantityChange(e) {
    const action = e.currentTarget.dataset.action
    let quantity = this.data.purchaseQuantity
    
    if (action === 'minus' && quantity > 1) {
      quantity--
    } else if (action === 'plus' && quantity < 10) {
      quantity++
    }
    
    this.setData({ purchaseQuantity: quantity })
  },

  /**
   * 买家留言输入
   */
  onMessageInput(e) {
    this.setData({
      buyerMessage: e.detail.value
    })
  },

  /**
   * 确认购买
   */
  async onConfirmPurchase() {
    const { selectedTrade, purchaseQuantity, buyerMessage } = this.data
    
    if (!selectedTrade) {
      wx.showToast({
        title: '请选择商品',
        icon: 'none'
      })
      return
    }
    
    // 显示加载
    wx.showLoading({
      title: '正在下单...',
      mask: true
    })
    
    try {
      const result = await tradeAPI.purchaseTrade(
        selectedTrade.trade_id,
        purchaseQuantity,
        buyerMessage,
        null // 收货地址暂时为空
      )
      
      wx.hideLoading()
      
      if (result.code === 0) {
        // 购买成功
        const orderData = result.data
        
        this.setData({
          showPurchaseModal: false,
          selectedTrade: null,
          totalPoints: orderData.payment_info.points_after
        })
        
        // 更新全局积分
        if (app.globalData.userInfo) {
          app.globalData.userInfo.total_points = orderData.payment_info.points_after
        }
        
        // 刷新商品列表
        this.loadMarketTrades(1, false)
        
        wx.showModal({
          title: '🎉 购买成功',
          content: `订单号：${orderData.order_id}\n商品：${orderData.trade_info.commodity_name}\n消费积分：${orderData.payment_info.points_used}\n剩余积分：${orderData.payment_info.points_after}`,
          showCancel: true,
          cancelText: '知道了',
          confirmText: '查看订单',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/trade/orders/orders'
              })
            }
          }
        })
      } else {
        throw new Error(result.msg || '购买失败')
      }
    } catch (error) {
      wx.hideLoading()
      console.error('❌ 购买失败:', error)
      
      this.handleApiError(error, '购买失败')
    }
  },

  /**
   * 取消购买
   */
  onCancelPurchase() {
    this.setData({
      showPurchaseModal: false,
      selectedTrade: null,
      purchaseQuantity: 1,
      buyerMessage: ''
    })
  },

  /**
   * 关闭商品详情
   */
  onCloseDetail() {
    this.setData({
      showDetailModal: false,
      detailTrade: null
    })
  },

  /**
   * 查看卖家信息
   */
  onViewSellerInfo(e) {
    const sellerId = e.currentTarget.dataset.sellerId
    console.log('查看卖家信息:', sellerId)
    
    // TODO: 跳转到卖家信息页面
    wx.showToast({
      title: '卖家信息功能开发中',
      icon: 'none'
    })
  },

  /**
   * 收藏/取消收藏
   */
  async onToggleFavorite(e) {
    e.stopPropagation()
    
    const trade = e.currentTarget.dataset.trade
    const isFavorite = !trade.is_favorite
    
    try {
      await tradeAPI.toggleFavorite(trade.trade_id, isFavorite)
      
      // 更新本地数据
      const tradeList = this.data.tradeList.map(item => {
        if (item.trade_id === trade.trade_id) {
          return { ...item, is_favorite: isFavorite }
        }
        return item
      })
      
      this.setData({
        tradeList,
        filteredTrades: tradeList
      })
      
      wx.showToast({
        title: isFavorite ? '已收藏' : '已取消收藏',
        icon: 'success'
      })
    } catch (error) {
      console.error('❌ 收藏操作失败:', error)
      wx.showToast({
        title: '操作失败',
        icon: 'none'
      })
    }
  },

  /**
   * 预览商品图片
   */
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    const urls = e.currentTarget.dataset.urls || [url]
    
    wx.previewImage({
      current: url,
      urls: urls
    })
  },

  /**
   * 连接WebSocket
   */
  connectWebSocket() {
    if (!app.globalData.wsManager) {
      console.log('WebSocket管理器未初始化')
      return
    }

    // 监听交易相关更新
    app.globalData.wsManager.on('trade_sold', (data) => {
      console.log('📦 收到交易售出通知:', data)
      this.handleTradeSold(data.data)
    })

    app.globalData.wsManager.on('trade_cancelled', (data) => {
      console.log('❌ 收到交易取消通知:', data)
      this.handleTradeCancelled(data.data)
    })

    console.log('✅ 已连接WebSocket，监听交易变化')
  },

  /**
   * 断开WebSocket
   */
  disconnectWebSocket() {
    if (app.globalData.wsManager) {
      app.globalData.wsManager.off('trade_sold')
      app.globalData.wsManager.off('trade_cancelled')
      console.log('🔌 已断开WebSocket交易监听')
    }
  },

  /**
   * 处理交易售出通知
   */
  handleTradeSold(data) {
    // 从列表中移除已售出的商品
    const tradeList = this.data.tradeList.filter(trade => 
      trade.trade_id !== data.trade_id
    )
    
    this.setData({
      tradeList,
      filteredTrades: tradeList
    })
    
    wx.showToast({
      title: `${data.commodity_name}已被抢购`,
      icon: 'none'
    })
  },

  /**
   * 处理交易取消通知
   */
  handleTradeCancelled(data) {
    // 从列表中移除已取消的商品
    const tradeList = this.data.tradeList.filter(trade => 
      trade.trade_id !== data.trade_id
    )
    
    this.setData({
      tradeList,
      filteredTrades: tradeList
    })
  },

  /**
   * 处理初始化错误
   */
  handleInitError(error) {
    console.error('❌ 页面初始化错误:', error)
    
    this.setData({ loading: false })
    
    if (error.code === 4001 || error.code === 4002) {
      // 认证错误
      wx.showModal({
        title: '🔑 认证失效',
        content: '登录状态已失效，请重新登录',
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
    } else {
      wx.showModal({
        title: '📶 加载失败',
        content: `页面加载失败：${error.msg || error.message}\n\n请检查网络连接后重试`,
        showCancel: true,
        cancelText: '取消',
        confirmText: '重试',
        success: (res) => {
          if (res.confirm) {
            this.initPage()
          }
        }
      })
    }
  },

  /**
   * 处理API错误
   */
  handleApiError(error, operation = '操作') {
    console.error(`❌ ${operation}错误:`, error)
    
    if (error.code === 4001 || error.code === 4002) {
      // 认证错误
      wx.showModal({
        title: '🔑 认证失效',
        content: '登录状态已失效，请重新登录',
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
    } else {
      wx.showModal({
        title: `❌ ${operation}失败`,
        content: error.msg || error.message || '网络异常，请稍后重试',
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '发现好物！快来交易市场看看',
      path: '/pages/trade/market/market',
      imageUrl: '/images/trade-market-share.png'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '商品交易市场 - 好物等你来交换'
    }
  }
}) 