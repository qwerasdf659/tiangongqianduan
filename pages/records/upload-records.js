// pages/records/upload-records.js - 上传记录页面
const app = getApp()
const { uploadAPI } = require('../../utils/api')

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
   * 🔴 加载上传记录 - 必须从后端API获取
   * 接口：GET /api/photo/records?page=1&page_size=20&status=all
   * 认证：需要Bearer Token
   * 返回：v2.1.2纯人工审核模式的上传记录列表
   */
  loadRecords() {
    console.log('📡 请求上传记录接口...')
    
    return uploadAPI.getRecords(this.data.currentPage, this.data.pageSize, this.data.filterStatus).then((res) => {
      if (res.code === 0) {
        const newRecords = res.data.records || []
        
        // 🔴 v2.1.2数据处理：纯人工审核模式
        const processedRecords = newRecords.map(record => ({
          ...record,
          // 格式化时间显示
          created_at_formatted: this.formatTime(record.created_at),
          review_time_formatted: record.review_time ? this.formatTime(record.review_time) : null,
          // 状态文本映射
          status_text: this.getStatusText(record.status),
          status_class: this.getStatusClass(record.status),
          // 金额显示
          amount_display: `￥${record.amount || 0}`,
          // 积分显示
          points_display: record.points_earned > 0 ? `+${record.points_earned}` : '0'
        }))
        
        this.setData({
          records: this.data.currentPage === 1 ? processedRecords : [...this.data.records, ...processedRecords],
          hasMore: processedRecords.length === this.data.pageSize,
          totalRecords: res.data.total || 0
        })
        
        console.log('✅ 上传记录加载成功，共', processedRecords.length, '条记录')
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取上传记录失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取上传记录！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态。`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      // 设置安全的默认值
      if (this.data.currentPage === 1) {
        this.setData({
          records: [],
          hasMore: false,
          totalRecords: 0
        })
      }
    })
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
   * 🔴 加载统计数据 - 必须从后端API获取
   * 接口：GET /api/photo/statistics
   * 认证：需要Bearer Token
   * 返回：用户上传统计信息
   */
  loadStatistics() {
    console.log('📊 请求上传统计接口...')
    
    return uploadAPI.getStatistics().then((res) => {
      if (res.code === 0) {
        this.setData({
          statistics: {
            totalCount: res.data.total_count || 0,
            totalPoints: res.data.total_points || 0,
            pendingCount: res.data.pending_count || 0,
            approvedCount: res.data.approved_count || 0,
            rejectedCount: res.data.rejected_count || 0
          }
        })
        console.log('✅ 统计数据加载成功:', res.data)
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取统计数据失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取统计数据！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态：\nGET /api/photo/statistics`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      // 设置安全的默认值
      this.setData({
        statistics: {
          totalCount: 0,
          totalPoints: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0
        }
      })
    })
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const statusMap = {
      'pending': '待审核',
      'approved': '已通过',
      'rejected': '已拒绝',
      'processing': '审核中'
    }
    return statusMap[status] || '未知状态'
  },

  /**
   * 获取状态样式类
   */
  getStatusClass(status) {
    const classMap = {
      'pending': 'status-pending',
      'approved': 'status-approved',
      'rejected': 'status-rejected',
      'processing': 'status-processing'
    }
    return classMap[status] || 'status-unknown'
  },

  /**
   * 格式化时间显示
   */
  formatTime(timeString) {
    if (!timeString) return '未知时间'
    
    try {
      const date = new Date(timeString)
      return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
    } catch (error) {
      return '时间格式错误'
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