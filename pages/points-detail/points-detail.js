// pages/points-detail/points-detail.js
const app = getApp()
const { userAPI } = require('../../utils/api')

Page({
  /**
   * 页面的初始数据
   */
  data: {
    loading: false,
    userInfo: null,
    totalPoints: 0,
    pointsRecords: [],
    filteredPointsRecords: [],
    pointsFilter: 'all',
    hasMoreRecords: false,
    currentPage: 1,
    pageSize: 20,
    lastUpdateTime: ''
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('💰 积分明细页面加载')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    wx.setNavigationBarTitle({
      title: '积分明细'
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('💰 积分明细页面显示')
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {

  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新积分明细')
    this.refreshPointsData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.hasMoreRecords && !this.data.loading) {
      this.loadMoreRecords()
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的积分明细 - 餐厅积分系统',
      path: '/pages/points-detail/points-detail'
    }
  },

  /**
   * 初始化页面
   */
  initPage() {
    console.log('🔄 开始初始化积分明细页面...')
    
    // 从全局获取用户信息
    const globalUserInfo = app.globalData.userInfo
    if (globalUserInfo) {
      this.setData({
        userInfo: globalUserInfo,
        totalPoints: globalUserInfo.total_points || 0
      })
    }
    
    // 加载积分记录
    this.loadPointsRecords()
    
    console.log('✅ 积分明细页面初始化完成')
  },

  /**
   * 🔴 加载积分记录 - 从后端API获取
   * 接口：GET /api/user/points/records
   * 认证：需要Bearer Token
   */
  loadPointsRecords() {
    console.log('📡 加载积分记录...')
    this.setData({ loading: true })
    
    return userAPI.getPointsRecords(
      this.data.currentPage,
      this.data.pageSize,
      this.data.pointsFilter === 'all' ? 'all' : this.data.pointsFilter,
      ''
    ).then((res) => {
      console.log('✅ 积分记录API响应:', res)
      
      if (!res || res.code !== 0) {
        throw new Error(`后端API返回错误: code=${res?.code}, msg=${res?.msg}`)
      }
      
      const records = res.data?.records || []
      const hasMore = res.data?.hasMore || false
      
      // 🔧 如果是第一页，替换数据；否则追加数据
      const allRecords = this.data.currentPage === 1 ? records : [...this.data.pointsRecords, ...records]
      
      this.setData({
        pointsRecords: allRecords,
        hasMoreRecords: hasMore,
        lastUpdateTime: new Date().toLocaleString(),
        loading: false
      })
      
      // 应用当前筛选条件
      this.filterPointsRecords()
      
      console.log('✅ 积分记录加载成功，共', allRecords.length, '条')
      
    }).catch((error) => {
      console.error('❌ 获取积分记录失败:', error)
      this.setData({ loading: false })
      
      // 🔧 后端服务异常提示
      wx.showModal({
        title: '🚨 数据加载失败',
        content: `积分记录获取失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 数据权限问题\n\n错误详情：${error.message || error.msg || '未知错误'}`,
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '返回上页',
        confirmColor: '#FF6B35',
        success: (res) => {
          if (res.confirm) {
            wx.navigateBack()
          } else {
            console.log('用户选择稍后重试，保持当前状态')
          }
        }
      })
    })
  },

  /**
   * 刷新积分数据
   */
  refreshPointsData() {
    this.setData({
      currentPage: 1,
      pointsRecords: []
    })
    return this.loadPointsRecords()
  },

  /**
   * 加载更多记录
   */
  loadMoreRecords() {
    if (this.data.loading || !this.data.hasMoreRecords) {
      return
    }
    
    console.log('📄 加载更多积分记录...')
    this.setData({
      currentPage: this.data.currentPage + 1
    })
    
    this.loadPointsRecords()
  },

  /**
   * 积分明细筛选切换
   */
  onPointsFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('🔍 切换积分筛选:', filter)
    
    this.setData({
      pointsFilter: filter,
      currentPage: 1,
      pointsRecords: []
    })
    
    this.loadPointsRecords()
  },

  /**
   * 筛选积分记录
   */
  filterPointsRecords() {
    const pointsRecords = this.data.pointsRecords || []
    console.log('🔍 筛选积分记录:', { 
      原始记录数量: pointsRecords.length, 
      筛选条件: this.data.pointsFilter 
    })
    
    let filtered = [...pointsRecords]
    
    switch (this.data.pointsFilter) {
      case 'earn':
        filtered = filtered.filter(record => record.points > 0)
        break
      case 'consume':
        filtered = filtered.filter(record => record.points < 0)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    console.log('✅ 筛选完成:', { 筛选后记录数量: filtered.length })
    
    this.setData({
      filteredPointsRecords: filtered
    })
    
    // 🔧 如果筛选后没有记录，显示提示
    if (pointsRecords.length > 0 && filtered.length === 0) {
      wx.showToast({
        title: `暂无${this.data.pointsFilter === 'earn' ? '获得' : '消费'}记录`,
        icon: 'none',
        duration: 2000
      })
    }
  },

  /**
   * 格式化时间显示
   */
  formatTime(timeString) {
    if (!timeString) return '未知时间'
    
    try {
      const date = new Date(timeString)
      const now = new Date()
      const diff = now - date
      
      if (diff < 60000) { // 1分钟内
        return '刚刚'
      } else if (diff < 3600000) { // 1小时内
        return Math.floor(diff / 60000) + '分钟前'
      } else if (diff < 86400000) { // 1天内
        return Math.floor(diff / 3600000) + '小时前'
      } else {
        return date.toLocaleDateString()
      }
    } catch (error) {
      return timeString
    }
  },

  /**
   * 返回上一页
   */
  onBackTap() {
    wx.navigateBack()
  },


}) 