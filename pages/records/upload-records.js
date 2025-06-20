// pages/records/upload-records.js - 上传记录页面
const app = getApp()
const { photoAPI, mockRequest } = require('../../utils/api')

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
    filterStatus: 'all', // all全部/pending待审核/approved已通过/rejected已拒绝
    
    // 统计数据
    statistics: {
      totalCount: 0,
      totalPoints: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('上传记录页面加载')
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
      title: '我的上传记录',
      path: '/pages/records/upload-records'
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
   * 加载上传记录
   * TODO: 后端对接 - 上传记录接口
   * 
   * 对接说明：
   * 接口：GET /api/photo/records?page=1&page_size=20&status=all
   * 认证：需要Bearer Token
   * 返回：上传记录列表，包括状态、积分等信息
   */
  loadRecords() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 生成模拟上传记录数据')
      const mockRecords = this.generateMockRecords()
      
      this.setData({
        records: this.data.currentPage === 1 ? mockRecords : [...this.data.records, ...mockRecords],
        hasMore: mockRecords.length === this.data.pageSize
      })
      
      console.log('✅ 上传记录加载成功，共', mockRecords.length, '条记录')
      return Promise.resolve()
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求上传记录接口...')
      
      // 模拟网络延迟
      return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
        return photoAPI.getRecords(this.data.currentPage, this.data.pageSize)
      }).then((res) => {
        const newRecords = res.data.records || []
        this.setData({
          records: this.data.currentPage === 1 ? newRecords : [...this.data.records, ...newRecords],
          hasMore: newRecords.length === this.data.pageSize,
          totalRecords: res.data.total || 0
        })
        
        console.log('✅ 上传记录加载成功，共', newRecords.length, '条记录')
      }).catch((error) => {
        console.error('❌ 获取上传记录失败:', error)
        
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
      totalUploads: 45,
      approvedCount: 38,
      pendingCount: 5,
      rejectedCount: 2,
      totalPointsEarned: 18500,
      avgPointsPerUpload: 412
    }
    
    this.setData({ statistics })
    return Promise.resolve()
  },

  /**
   * 生成模拟数据
   */
  generateMockRecords() {
    const mockRecords = []
    const statuses = ['pending', 'approved', 'rejected']
    const statusTexts = { pending: '待审核', approved: '已通过', rejected: '已拒绝' }
    
    for (let i = 0; i < 15; i++) {
      const randomStatus = statuses[Math.floor(Math.random() * statuses.length)]
      
      mockRecords.push({
        id: Date.now() + i,
        image_url: `https://via.placeholder.com/200x150/4ECDC4/ffffff?text=小票${i + 1}`,
        amount: (Math.random() * 200 + 50).toFixed(2),
        points_earned: randomStatus === 'approved' ? Math.floor(Math.random() * 50 + 10) : 0,
        status: randomStatus,
        status_text: statusTexts[randomStatus],
        created_at: new Date(Date.now() - i * 3600000).toLocaleString(),
        review_time: randomStatus !== 'pending' ? new Date(Date.now() - i * 3600000 + 1800000).toLocaleString() : null,
        review_reason: randomStatus === 'rejected' ? '小票模糊，无法识别' : (randomStatus === 'approved' ? '审核通过' : null)
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
    
    let content = `上传时间：${record.created_at}\n小票金额：￥${record.amount}\n审核状态：${record.status_text}`
    
    if (record.review_time) {
      content += `\n审核时间：${record.review_time}`
    }
    
    if (record.review_reason) {
      content += `\n审核说明：${record.review_reason}`
    }
    
    if (record.points_earned > 0) {
      content += `\n获得积分：${record.points_earned}`
    }
    
    wx.showModal({
      title: '上传详情',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const imageUrl = e.currentTarget.dataset.image
    wx.previewImage({
      current: imageUrl,
      urls: [imageUrl]
    })
  },

  /**
   * 去上传小票
   */
  onGoToUpload() {
    wx.switchTab({
      url: '/pages/camera/camera'
    })
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack()
  }
}) 