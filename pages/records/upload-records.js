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
  async initPage() {
    this.setData({ loading: true })
    await Promise.all([
      this.loadRecords(),
      this.loadStatistics()
    ])
    this.setData({ loading: false })
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    this.setData({ 
      refreshing: true,
      currentPage: 1,
      records: []
    })
    
    await Promise.all([
      this.loadRecords(),
      this.loadStatistics()
    ])
    
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
  },

  /**
   * 加载上传记录
   * TODO: 后端对接 - 上传记录接口
   * 
   * 对接说明：
   * 接口：GET /api/photo/records
   * 认证：需要Bearer Token
   * 参数：page, page_size, status（可选筛选状态）
   * 返回：上传记录列表
   */
  async loadRecords() {
    try {
      let recordsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟数据
        console.log('🔧 使用模拟上传记录数据')
        recordsData = this.generateMockRecords()
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        console.log('📡 请求上传记录接口...')
        const res = await photoAPI.getRecords(this.data.currentPage, this.data.pageSize)
        recordsData = res.data
      }

      const newRecords = this.data.currentPage === 1 ? 
        recordsData.list : 
        [...this.data.records, ...recordsData.list]

      this.setData({
        records: newRecords,
        total: recordsData.total,
        hasMore: newRecords.length < recordsData.total
      })

      console.log('✅ 上传记录加载成功，共', recordsData.list.length, '条')

    } catch (error) {
      console.error('❌ 获取上传记录失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 加载更多记录
   */
  async loadMoreRecords() {
    this.setData({ 
      loading: true,
      currentPage: this.data.currentPage + 1
    })
    
    await this.loadRecords()
    this.setData({ loading: false })
  },

  /**
   * 加载统计数据
   */
  async loadStatistics() {
    try {
      // 基于记录计算统计数据
      const records = this.data.records
      
      const statistics = {
        totalCount: records.length,
        totalPoints: records.reduce((sum, record) => {
          return sum + (record.points_earned || 0)
        }, 0),
        pendingCount: records.filter(r => r.status === 'pending').length,
        approvedCount: records.filter(r => r.status === 'approved').length,
        rejectedCount: records.filter(r => r.status === 'rejected').length
      }

      this.setData({ statistics })

    } catch (error) {
      console.error('❌ 计算统计数据失败:', error)
    }
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