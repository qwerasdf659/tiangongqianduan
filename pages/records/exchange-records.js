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
   * 🔴 加载兑换记录 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据，强制后端依赖
   * 
   * 接口：GET /api/exchange/records?page=1&page_size=20&status=all
   * 认证：需要Bearer Token
   * 返回：用户兑换记录列表，包含商品信息和兑换状态
   */
  loadRecords() {
    console.log('📡 请求兑换记录接口...')
    
    return exchangeAPI.getRecords(this.data.currentPage, this.data.pageSize, this.data.filterStatus).then((res) => {
      if (res.code === 0) {
        const newRecords = res.data.records || []
        
        // 处理兑换记录数据
        const processedRecords = newRecords.map(record => ({
          ...record,
          // 格式化时间显示
          created_at_formatted: this.formatTime(record.created_at),
          delivery_time_formatted: record.delivery_time ? this.formatTime(record.delivery_time) : null,
          // 商品显示信息
          product_display: record.product_name || '未知商品',
          // 积分消耗显示
          cost_display: `-${record.points_cost || 0}`,
          // 状态文本
          status_text: this.getStatusText(record.status),
          status_class: this.getStatusClass(record.status),
          // 配送信息
          delivery_info: record.delivery_address || '待填写'
        }))
        
        this.setData({
          records: this.data.currentPage === 1 ? processedRecords : [...this.data.records, ...processedRecords],
          hasMore: processedRecords.length === this.data.pageSize,
          totalRecords: res.data.total || 0
        })
        
        console.log('✅ 兑换记录加载成功，共', processedRecords.length, '条记录')
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取兑换记录失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取兑换记录！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态：\nGET /api/exchange/records\n\n商品兑换记录功能需要后端服务支持。`,
        showCancel: true,
        cancelText: '返回首页',
        confirmText: '重试',
        confirmColor: '#FF6B35',
        success: (res) => {
          if (res.confirm) {
            // 重新加载记录
            this.loadRecords()
          } else {
            // 返回首页
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }
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
   * 接口：GET /api/exchange/statistics
   * 认证：需要Bearer Token
   * 返回：用户兑换统计信息
   */
  loadStatistics() {
    console.log('📊 加载兑换统计数据...')
    
    return exchangeAPI.getStatistics().then((res) => {
      if (res.code === 0) {
        this.setData({
          statistics: {
            totalExchanges: res.data.total_exchanges || 0,
            totalPointsSpent: res.data.total_points_spent || 0,
            completedCount: res.data.completed_count || 0,
            pendingCount: res.data.pending_count || 0,
            failedCount: res.data.failed_count || 0,
            favoriteCategory: res.data.favorite_category || '暂无'
          }
        })
        console.log('✅ 兑换统计数据加载成功')
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取兑换统计失败:', error)
      
      // 设置安全的默认值
      this.setData({
        statistics: {
          totalExchanges: 0,
          totalPointsSpent: 0,
          completedCount: 0,
          pendingCount: 0,
          failedCount: 0,
          favoriteCategory: '暂无'
        }
      })
    })
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const statusMap = {
      'pending': '待发货',
      'shipped': '已发货',
      'delivered': '已收货',
      'completed': '已完成',
      'cancelled': '已取消',
      'failed': '兑换失败'
    }
    return statusMap[status] || '未知状态'
  },

  /**
   * 获取状态样式类
   */
  getStatusClass(status) {
    const classMap = {
      'pending': 'status-pending',
      'shipped': 'status-shipped',
      'delivered': 'status-delivered',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled',
      'failed': 'status-failed'
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