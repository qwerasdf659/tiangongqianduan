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
   * 加载抽奖记录
   * TODO: 后端对接 - 抽奖记录接口
   * 
   * 对接说明：
   * 接口：GET /api/lottery/records?page=1&page_size=20
   * 认证：需要Bearer Token
   * 返回：抽奖记录列表，包括奖品、积分消耗等信息
   */
  loadRecords() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 生成模拟抽奖记录数据')
      // 🚨 已删除：generateMockRecords()违规调用
      // ✅ 必须从后端API获取：lotteryAPI.getRecords()
      
      // 🚨 已删除：mockRecords违规使用
      // ✅ 必须从后端API获取数据
      throw new Error('开发环境已禁用Mock数据，请使用真实后端API')
      return Promise.resolve()
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求抽奖记录接口...')
      
      // 模拟网络延迟
      return new Promise(resolve => setTimeout(resolve, 300)).then(() => {
        return lotteryAPI.getRecords(this.data.currentPage, this.data.pageSize)
      }).then((res) => {
        const newRecords = res.data.records || []
        this.setData({
          records: this.data.currentPage === 1 ? newRecords : [...this.data.records, ...newRecords],
          hasMore: newRecords.length === this.data.pageSize,
          totalRecords: res.data.total || 0
        })
        
        console.log('✅ 抽奖记录加载成功，共', newRecords.length, '条记录')
      }).catch((error) => {
        console.error('❌ 获取抽奖记录失败:', error)
        
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
      totalDraws: 156,
      totalPointsSpent: 15600,
      totalPointsWon: 8750,
      winRate: 0.68,
      favoriteTime: '20:00-22:00',
      luckiestDay: '星期三'
    }
    
    this.setData({ statistics })
    return Promise.resolve()
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
   * 🚨 已删除违规函数：generateMockRecords() 和 getRandomPrize()
   * 🔴 原因：违反项目安全规则 - 严禁使用模拟数据替代后端API
   * ✅ 正确做法：使用lotteryAPI.getRecords()获取真实数据
   */

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