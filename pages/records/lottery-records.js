// pages/records/lottery-records.js - 抽奖记录页面
const app = getApp()
const { lotteryAPI } = require('../../utils/api')

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
    filterType: 'all', // all全部/single单抽/five五连抽
    
    // 统计数据
    statistics: {
      totalCount: 0,
      totalPoints: 0,
      successRate: 0,
      bestPrize: ''
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('抽奖记录页面加载')
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
      title: '我的抽奖记录',
      path: '/pages/records/lottery-records'
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
   * 🔴 加载抽奖记录 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据，强制后端依赖
   * 
   * 接口：GET /api/lottery/records?page=1&page_size=20&type=all
   * 认证：需要Bearer Token
   * 返回：用户抽奖记录列表，包含奖品信息和状态
   */
  loadRecords() {
    console.log('📡 请求抽奖记录接口...')
    
    return lotteryAPI.getRecords(this.data.currentPage, this.data.pageSize, this.data.filterType).then((res) => {
      if (res.code === 0) {
        const newRecords = res.data.records || []
        
        // 处理抽奖记录数据
        const processedRecords = newRecords.map(record => {
          // 🔧 增强字段映射兼容性，处理后端返回的各种字段格式
          const prize_name = record.prize_name || record.name || record.title || record.prizeName || '未知奖品'
          const cost_points = record.cost_points || record.points || record.cost || 0
          
          console.log('🔧 处理抽奖记录:', {
            原始奖品名: record.prize_name,
            后备奖品名: record.name,
            最终显示: prize_name,
            消耗积分: cost_points
          })
          
          return {
            ...record,
            // 格式化时间显示
            created_at_formatted: this.formatTime(record.created_at),
            // 🔧 奖品显示名称 - 支持多种字段格式
            prize_display: prize_name,
            // 🔧 积分消耗显示 - 支持多种字段格式
            cost_display: `-${cost_points}`,
            // 状态文本
            status_text: this.getStatusText(record.status),
            status_class: this.getStatusClass(record.status)
          }
        })
        
        this.setData({
          records: this.data.currentPage === 1 ? processedRecords : [...this.data.records, ...processedRecords],
          hasMore: processedRecords.length === this.data.pageSize,
          totalRecords: res.data.total || 0
        })
        
        console.log('✅ 抽奖记录加载成功，共', processedRecords.length, '条记录')
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取抽奖记录失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取抽奖记录！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态：\nGET /api/lottery/records`,
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
   * 接口：GET /api/lottery/statistics
   * 认证：需要Bearer Token
   * 返回：用户抽奖统计信息
   */
  loadStatistics() {
    console.log('📊 加载抽奖统计数据...')
    
    return lotteryAPI.getStatistics().then((res) => {
      if (res.code === 0) {
        this.setData({
          statistics: {
            totalDraws: res.data.total_draws || 0,
            totalPointsSpent: res.data.total_points_spent || 0,
            totalPointsWon: res.data.total_points_won || 0,
            winRate: res.data.win_rate || 0,
            favoriteTime: res.data.favorite_time || '未知',
            luckiestDay: res.data.luckiest_day || '未知'
          }
        })
        console.log('✅ 抽奖统计数据加载成功')
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取抽奖统计失败:', error)
      
      // 设置安全的默认值
      this.setData({
        statistics: {
          totalDraws: 0,
          totalPointsSpent: 0,
          totalPointsWon: 0,
          winRate: 0,
          favoriteTime: '未知',
          luckiestDay: '未知'
        }
      })
    })
  },

  /**
   * 获取状态文本
   */
  getStatusText(status) {
    const statusMap = {
      'pending': '待开奖',
      'completed': '已开奖',
      'expired': '已过期',
      'processing': '处理中',
      'failed': '失败'
    }
    return statusMap[status] || '未知状态'
  },

  /**
   * 获取状态样式类
   */
  getStatusClass(status) {
    const classMap = {
      'pending': 'status-pending',
      'completed': 'status-completed',
      'expired': 'status-expired',
      'processing': 'status-processing',
      'failed': 'status-failed'
    }
    return classMap[status] || 'status-unknown'
  },

  /**
   * 获取抽奖类型文本
   */
  getDrawTypeText(type) {
    const typeMap = {
      'single': '单抽',
      'triple': '三连抽',
      'five': '五连抽',
      'ten': '十连抽'
    }
    return typeMap[type] || '未知'
  },

  /**
   * 获取奖品等级样式
   */
  getPrizeClass(level) {
    const classMap = {
      '1': 'prize-legendary',  // 传说
      '2': 'prize-epic',       // 史诗
      '3': 'prize-rare',       // 稀有
      '4': 'prize-common',     // 普通
      '5': 'prize-none'        // 谢谢参与
    }
    return classMap[level] || 'prize-unknown'
  },

  /**
   * 获取最好奖品
   */
  getBestPrize(records) {
    const prizes = records
      .filter(r => r.prize_name !== '谢谢参与')
      .sort((a, b) => (b.prize_value || 0) - (a.prize_value || 0))
    
    return prizes.length > 0 ? prizes[0].prize_name : '暂无中奖'
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
   * 筛选类型改变
   */
  onFilterChange(e) {
    const filterType = e.currentTarget.dataset.type
    this.setData({ 
      filterType,
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
      title: '抽奖详情',
      content: `抽奖类型：${record.draw_type === 'five' ? '五连抽' : '单抽'}\n中奖奖品：${record.prize_name}\n消费积分：${record.points_cost}\n抽奖时间：${record.created_at}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 去抽奖商品
   */
  onGoToLottery() {
    wx.switchTab({
      url: '/pages/lottery/lottery'
    })
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack()
  }
}) 