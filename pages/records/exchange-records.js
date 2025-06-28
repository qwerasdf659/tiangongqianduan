// pages/records/exchange-records.js - 兑换记录页面
const app = getApp()
const { exchangeAPI } = require('../../utils/api')

Page({
  
  /**
   * 页面的初始数据
   */
  data: {
    // 记录列表
    records: [],
    
    // 分页信息
    currentPage: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    
    // 页面状态
    loading: false,
    refreshing: false,
    
    // 筛选条件
    filterStatus: 'all', // all全部/pending待发货/shipped已发货/completed已完成
    
    // 统计数据
    statistics: {
      totalCount: 0,
      totalPoints: 0,
      pendingCount: 0,
      completedCount: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('兑换记录页面加载')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.refreshData()
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.refreshData()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMoreRecords()
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的兑换记录',
      path: '/pages/records/exchange-records'
    }
  },

  /**
   * 初始化页面
   */
  initPage() {
    this.setData({ loading: true })
    Promise.all([
      this.loadRecords(),
      this.loadStatistics()
    ]).then(() => {
      this.setData({ loading: false })
    }).catch(error => {
      console.error('❌ 页面初始化失败:', error)
      this.setData({ loading: false })
    })
  },

  /**
   * 刷新数据
   */
  refreshData() {
    this.setData({ 
      refreshing: true,
      currentPage: 1,
      hasMore: true
    })
    Promise.all([
      this.loadRecords(),
      this.loadStatistics()
    ]).then(() => {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    }).catch(error => {
      console.error('❌ 刷新数据失败:', error)
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载兑换记录
   * TODO: 后端对接 - 兑换记录接口
   * 
   * 对接说明：
   * 接口：GET /api/exchange/records?page=1&page_size=20&status=all
   * 认证：需要Bearer Token
   * 返回：兑换记录列表，包括商品、状态、物流等信息
   */
  loadRecords() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 生成模拟兑换记录数据')
      const mockRecords = this.generateMockRecords()
      
      this.setData({
        records: this.data.currentPage === 1 ? mockRecords : [...this.data.records, ...mockRecords],
        hasMore: mockRecords.length === this.data.pageSize
      })
      
      console.log('✅ 兑换记录加载成功，共', mockRecords.length, '条记录')
      return Promise.resolve()
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求兑换记录接口...')
      
      // 模拟网络延迟
      return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
        return exchangeAPI.getRecords(this.data.currentPage, this.data.pageSize)
      }).then((res) => {
        const newRecords = res.data.records || []
        this.setData({
          records: this.data.currentPage === 1 ? newRecords : [...this.data.records, ...newRecords],
          hasMore: newRecords.length === this.data.pageSize,
          totalRecords: res.data.total || 0
        })
        
        console.log('✅ 兑换记录加载成功，共', newRecords.length, '条记录')
      }).catch((error) => {
        console.error('❌ 获取兑换记录失败:', error)
        
        // 使用默认数据，避免页面空白
        if (this.data.currentPage === 1) {
          this.setData({
            records: [],
            hasMore: false
          })
        }
      })
    }
  },

  /**
   * 加载更多记录
   */
  loadMoreRecords() {
    if (!this.data.hasMore || this.data.loadingMore) return
    
    this.setData({ 
      loadingMore: true,
      currentPage: this.data.currentPage + 1
    })
    
    this.loadRecords().then(() => {
      this.setData({ loadingMore: false })
    }).catch(error => {
      console.error('❌ 加载更多失败:', error)
      this.setData({ loadingMore: false })
    })
  },

  /**
   * 加载统计数据
   */
  loadStatistics() {
    // 模拟统计数据
    const statistics = {
      totalExchanges: 28,
      totalPointsSpent: 22400,
      completedCount: 25,
      pendingCount: 2,
      failedCount: 1,
      favoriteCategory: '饮品券'
    }
    
    this.setData({ statistics })
    return Promise.resolve()
  },

  /**
   * 生成模拟数据
   */
  generateMockRecords() {
    const mockRecords = []
    const products = [
      { name: '星巴克咖啡券', points: 500, image: 'https://via.placeholder.com/120x120/4ECDC4/ffffff?text=☕' },
      { name: '优惠券10元', points: 200, image: 'https://via.placeholder.com/120x120/FF6B35/ffffff?text=💰' },
      { name: '免费甜品券', points: 300, image: 'https://via.placeholder.com/120x120/9C27B0/ffffff?text=🍰' },
      { name: '会员升级卡', points: 800, image: 'https://via.placeholder.com/120x120/FFC107/ffffff?text=⭐' },
      { name: '积分双倍卡', points: 600, image: 'https://via.placeholder.com/120x120/795548/ffffff?text=2️⃣' }
    ]

    const statuses = ['pending', 'shipped', 'completed']

    for (let i = 0; i < 12; i++) {
      const randomProduct = products[Math.floor(Math.random() * products.length)]
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
      
      mockRecords.push({
        id: Date.now() + i,
        product_name: randomProduct.name,
        product_image: randomProduct.image,
        quantity: Math.floor(Math.random() * 3) + 1,
        points_cost: randomProduct.points,
        status: randomStatus,
        order_no: 'EX' + String(Date.now() + i).slice(-8),
        created_at: new Date(Date.now() - i * 3600000).toLocaleString(),
        address: '北京市朝阳区xxx街道xxx号'
      })
    }

    return {
      list: mockRecords,
      total: mockRecords.length,
      page: 1,
      page_size: 20
    }
  },

  /**
   * 筛选状态改变
   */
  onFilterChange(e) {
    const filterStatus = e.currentTarget.dataset.status
    this.setData({ 
      filterStatus,
      currentPage: 1,
      records: []
    })
    this.loadRecords()
  },

  /**
   * 查看详情
   */
  onViewDetail(e) {
    const record = e.currentTarget.dataset.record
    
    wx.showModal({
      title: '兑换详情',
      content: `商品名称：${record.product_name}\n兑换数量：${record.quantity}\n消费积分：${record.points_cost}\n订单号：${record.order_no}\n兑换时间：${record.created_at}\n配送地址：${record.address}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 联系客服
   */
  onContactService(e) {
    const record = e.currentTarget.dataset.record
    wx.showModal({
      title: '联系客服',
      content: `如有疑问请联系客服\n\n订单号：${record.order_no}\n客服电话：400-8888-888\n服务时间：9:00-18:00`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 去兑换商品
   */
  onGoToExchange() {
    wx.switchTab({
      url: '/pages/exchange/exchange'
    })
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack()
  }
}) 