// pages/trade/inventory/inventory.js - 我的库存页面
const app = getApp()
const { tradeAPI, userAPI } = require('../../../utils/api')

Page({
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 库存商品
    inventory: [],
    filteredInventory: [],
    
    // 页面状态
    loading: true,
    refreshing: false,
    
    // 筛选条件
    currentStatus: 'all', // all, available, for_sale, sold, used
    searchKeyword: '',
    
    // 分页
    currentPage: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,
    
    // 发布交易弹窗
    showPublishModal: false,
    selectedInventory: null,
    publishForm: {
      pricePoints: 0,
      description: '',
      autoAccept: false,
      expiresDays: 7
    },
    
    // 批量操作
    editMode: false,
    selectedItems: [],
    
    // 商品详情弹窗
    showDetailModal: false,
    detailInventory: null,
    
    // 统计信息
    stats: {
      total: 0,
      available: 0,
      for_sale: 0,
      sold: 0
    }
  },

  onLoad(options) {
    console.log('📦 我的库存页面加载', options)
    this.checkAuthAndLoad()
  },

  onShow() {
    console.log('我的库存页面显示')
    
    // 连接WebSocket监听库存变化
    this.connectWebSocket()
    
    // 刷新数据
    this.refreshUserInfo()
  },

  onHide() {
    console.log('我的库存页面隐藏')
    this.disconnectWebSocket()
  },

  onPullDownRefresh() {
    console.log('下拉刷新库存')
    this.refreshPage()
  },

  onReachBottom() {
    console.log('上拉加载更多库存')
    this.loadMoreInventory()
  },

  /**
   * 检查认证状态并加载页面
   */
  checkAuthAndLoad() {
    const app = getApp()
    
    if (!app.globalData.isLoggedIn || !app.globalData.accessToken) {
      wx.showModal({
        title: '🔑 需要登录',
        content: '请先登录后查看库存',
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
        this.loadInventory()
      ])
      
      console.log('✅ 库存页面初始化完成')
    } catch (error) {
      console.error('❌ 库存页面初始化失败:', error)
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
      
      console.log('✅ 用户信息刷新成功')
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
   * 加载库存商品
   */
  async loadInventory(page = 1, append = false) {
    if (!append) {
      this.setData({ loading: true })
    } else {
      this.setData({ loadingMore: true })
    }
    
    try {
      const result = await tradeAPI.getInventory(
        this.data.currentStatus,
        '', // 分类暂时为空
        page,
        this.data.pageSize
      )
      
      if (result.code === 0) {
        const newInventory = result.data.inventory || []
        const stats = result.data.stats || {}
        
        let inventory
        if (append && page > 1) {
          // 追加数据
          inventory = [...this.data.inventory, ...newInventory]
        } else {
          // 替换数据
          inventory = newInventory
        }
        
        this.setData({
          inventory,
          filteredInventory: inventory,
          stats,
          currentPage: page,
          hasMore: result.data.pagination?.has_more || false,
          loading: false,
          loadingMore: false
        })
        
        console.log(`✅ 成功加载${newInventory.length}个库存商品`)
        
        if (newInventory.length === 0) {
          wx.showToast({
            title: page === 1 ? '暂无库存商品' : '没有更多商品了',
            icon: 'none'
          })
        }
      } else {
        throw new Error(result.msg || '获取库存失败')
      }
    } catch (error) {
      console.error('❌ 加载库存失败:', error)
      
      this.setData({
        loading: false,
        loadingMore: false
      })
      
      this.handleApiError(error, '获取库存失败')
    }
  },

  /**
   * 加载更多库存
   */
  loadMoreInventory() {
    if (this.data.loadingMore || !this.data.hasMore) {
      return
    }
    
    const nextPage = this.data.currentPage + 1
    this.loadInventory(nextPage, true)
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
        this.loadInventory(1, false)
      ])
    } catch (error) {
      console.error('❌ 刷新页面失败:', error)
    } finally {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    }
  },

  /**
   * 状态筛选切换
   */
  onStatusFilter(e) {
    const status = e.currentTarget.dataset.status
    
    this.setData({
      currentStatus: status,
      currentPage: 1
    })
    
    this.loadInventory(1, false)
    
    const statusNames = {
      'all': '全部',
      'available': '可用',
      'for_sale': '上架中',
      'sold': '已售出',
      'used': '已使用'
    }
    
    wx.showToast({
      title: `已筛选${statusNames[status]}商品`,
      icon: 'none'
    })
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
      const filtered = this.data.inventory.filter(item => 
        item.commodity.name.includes(keyword) ||
        item.commodity.category.includes(keyword)
      )
      
      this.setData({ filteredInventory: filtered })
      
      wx.showToast({
        title: `找到${filtered.length}个商品`,
        icon: 'none'
      })
    } else {
      this.setData({ filteredInventory: this.data.inventory })
    }
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      filteredInventory: this.data.inventory
    })
  },

  /**
   * 商品项点击 - 显示详情
   */
  onInventoryItemTap(e) {
    const item = e.currentTarget.dataset.item
    console.log('点击库存商品:', item.inventory_id)
    
    this.setData({
      detailInventory: item,
      showDetailModal: true
    })
  },

  /**
   * 发布交易按钮点击
   */
  onPublishTradeTap(e) {
    e.stopPropagation() // 阻止事件冒泡
    
    const item = e.currentTarget.dataset.item
    
    // 检查商品状态
    if (item.status !== 'available') {
      wx.showToast({
        title: '该商品当前状态不可发布交易',
        icon: 'none'
      })
      return
    }
    
    // 显示发布弹窗
    this.setData({
      selectedInventory: item,
      publishForm: {
        pricePoints: Math.floor(item.commodity.exchange_points * 0.8), // 默认8折
        description: `转让${item.commodity.name}，九成新`,
        autoAccept: false,
        expiresDays: 7
      },
      showPublishModal: true
    })
  },

  /**
   * 发布表单输入处理
   */
  onPublishFormInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    
    this.setData({
      [`publishForm.${field}`]: field === 'pricePoints' ? parseInt(value) || 0 : value
    })
  },

  /**
   * 自动接受开关
   */
  onAutoAcceptSwitch(e) {
    this.setData({
      'publishForm.autoAccept': e.detail.value
    })
  },

  /**
   * 过期天数选择
   */
  onExpireDaysChange(e) {
    const days = parseInt(e.currentTarget.dataset.days) || 7
    this.setData({
      'publishForm.expiresDays': days
    })
  },

  /**
   * 确认发布交易
   */
  async onConfirmPublish() {
    const { selectedInventory, publishForm } = this.data
    
    if (!selectedInventory) {
      wx.showToast({
        title: '请选择商品',
        icon: 'none'
      })
      return
    }
    
    // 验证表单
    if (publishForm.pricePoints <= 0) {
      wx.showToast({
        title: '请输入有效价格',
        icon: 'none'
      })
      return
    }
    
    if (!publishForm.description.trim()) {
      wx.showToast({
        title: '请输入商品描述',
        icon: 'none'
      })
      return
    }
    
    // 显示加载
    wx.showLoading({
      title: '发布中...',
      mask: true
    })
    
    try {
      const result = await tradeAPI.publishTrade(
        selectedInventory.inventory_id,
        publishForm.pricePoints,
        publishForm.description,
        publishForm.autoAccept,
        publishForm.expiresDays
      )
      
      wx.hideLoading()
      
      if (result.code === 0) {
        // 发布成功
        this.setData({
          showPublishModal: false,
          selectedInventory: null
        })
        
        // 刷新库存列表
        this.loadInventory(1, false)
        
        wx.showModal({
          title: '🎉 发布成功',
          content: `商品已成功发布到交易市场\n\n交易ID：${result.data.trade_id}\n售价：${publishForm.pricePoints}积分`,
          showCancel: true,
          cancelText: '知道了',
          confirmText: '查看市场',
          success: (res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/trade/market/market'
              })
            }
          }
        })
      } else {
        throw new Error(result.msg || '发布失败')
      }
    } catch (error) {
      wx.hideLoading()
      console.error('❌ 发布交易失败:', error)
      
      this.handleApiError(error, '发布交易失败')
    }
  },

  /**
   * 取消发布
   */
  onCancelPublish() {
    this.setData({
      showPublishModal: false,
      selectedInventory: null,
      publishForm: {
        pricePoints: 0,
        description: '',
        autoAccept: false,
        expiresDays: 7
      }
    })
  },

  /**
   * 关闭详情弹窗
   */
  onCloseDetail() {
    this.setData({
      showDetailModal: false,
      detailInventory: null
    })
  },

  /**
   * 使用商品
   */
  async onUseItem(e) {
    const item = e.currentTarget.dataset.item
    
    if (item.status !== 'available') {
      wx.showToast({
        title: '该商品当前状态不可使用',
        icon: 'none'
      })
      return
    }
    
    wx.showModal({
      title: '🎁 确认使用',
      content: `确定要使用"${item.commodity.name}"吗？\n\n使用后商品将标记为已使用状态，无法撤销。`,
      showCancel: true,
      cancelText: '取消',
      confirmText: '确认使用',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '处理中...' })
            
            // 调用使用商品的API（需要后端实现）
            // const result = await tradeAPI.useInventoryItem(item.inventory_id)
            
            wx.hideLoading()
            
            // 更新本地状态
            const inventory = this.data.inventory.map(inv => {
              if (inv.inventory_id === item.inventory_id) {
                return { ...inv, status: 'used' }
              }
              return inv
            })
            
            this.setData({ 
              inventory,
              filteredInventory: inventory
            })
            
            wx.showToast({
              title: '商品已使用',
              icon: 'success'
            })
            
          } catch (error) {
            wx.hideLoading()
            console.error('❌ 使用商品失败:', error)
            wx.showToast({
              title: '使用失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  /**
   * 编辑模式切换
   */
  onToggleEditMode() {
    this.setData({
      editMode: !this.data.editMode,
      selectedItems: []
    })
  },

  /**
   * 商品选择
   */
  onItemSelect(e) {
    const itemId = e.currentTarget.dataset.id
    const selectedItems = [...this.data.selectedItems]
    
    const index = selectedItems.indexOf(itemId)
    if (index > -1) {
      selectedItems.splice(index, 1)
    } else {
      selectedItems.push(itemId)
    }
    
    this.setData({ selectedItems })
  },

  /**
   * 全选/取消全选
   */
  onSelectAll() {
    const allSelected = this.data.selectedItems.length === this.data.filteredInventory.length
    
    this.setData({
      selectedItems: allSelected ? [] : this.data.filteredInventory.map(item => item.inventory_id)
    })
  },

  /**
   * 批量发布交易
   */
  onBatchPublish() {
    if (this.data.selectedItems.length === 0) {
      wx.showToast({
        title: '请选择商品',
        icon: 'none'
      })
      return
    }
    
    // TODO: 实现批量发布功能
    wx.showToast({
      title: '批量发布功能开发中',
      icon: 'none'
    })
  },

  /**
   * 批量使用
   */
  onBatchUse() {
    if (this.data.selectedItems.length === 0) {
      wx.showToast({
        title: '请选择商品',
        icon: 'none'
      })
      return
    }
    
    // TODO: 实现批量使用功能
    wx.showToast({
      title: '批量使用功能开发中',
      icon: 'none'
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
   * 跳转到交易市场
   */
  onGoToMarket() {
    wx.navigateTo({
      url: '/pages/trade/market/market'
    })
  },

  /**
   * 跳转到商品兑换
   */
  onGoToExchange() {
    wx.navigateBack()
  },

  /**
   * 连接WebSocket
   */
  connectWebSocket() {
    if (!app.globalData.wsManager) {
      console.log('WebSocket管理器未初始化')
      return
    }

    // 监听库存相关更新
    app.globalData.wsManager.on('inventory_updated', (data) => {
      console.log('📨 收到库存更新通知:', data)
      this.handleInventoryUpdate(data.data)
    })

    app.globalData.wsManager.on('trade_published', (data) => {
      console.log('📢 收到交易发布通知:', data)
      this.handleTradePublished(data.data)
    })
    
    console.log('✅ 已连接WebSocket，监听库存变化')
  },

  /**
   * 断开WebSocket
   */
  disconnectWebSocket() {
    if (app.globalData.wsManager) {
      app.globalData.wsManager.off('inventory_updated')
      app.globalData.wsManager.off('trade_published')
      console.log('🔌 已断开WebSocket库存监听')
    }
  },

  /**
   * 处理库存更新通知
   */
  handleInventoryUpdate(data) {
    // 更新对应的库存项状态
    const inventory = this.data.inventory.map(item => {
      if (item.inventory_id === data.inventory_id) {
        return { ...item, ...data }
      }
      return item
    })
    
    this.setData({
      inventory,
      filteredInventory: inventory
    })
  },

  /**
   * 处理交易发布通知
   */
  handleTradePublished(data) {
    wx.showToast({
      title: `${data.commodity_name}已发布到市场`,
      icon: 'success'
    })
    
    // 刷新库存状态
    this.loadInventory(1, false)
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
      title: '我的商品库存管理',
      path: '/pages/trade/inventory/inventory',
      imageUrl: '/images/inventory-share.png'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '商品库存管理 - 轻松管理你的物品'
    }
  }
}) 