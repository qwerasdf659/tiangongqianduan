// pages/records/lottery-records.js - 抽奖记录页面
const app = getApp()
const { lotteryAPI, mockRequest } = require('../../utils/api')

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
   * 加载抽奖记录
   * TODO: 后端对接 - 抽奖记录接口
   * 
   * 对接说明：
   * 接口：GET /api/lottery/records
   * 认证：需要Bearer Token
   * 参数：page, page_size, type（可选筛选类型）
   * 返回：抽奖记录列表
   */
  async loadRecords() {
    try {
      let recordsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟数据
        console.log('🔧 使用模拟抽奖记录数据')
        recordsData = this.generateMockRecords()
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        console.log('📡 请求抽奖记录接口...')
        const res = await lotteryAPI.getRecords(this.data.currentPage, this.data.pageSize)
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

      console.log('✅ 抽奖记录加载成功，共', recordsData.list.length, '条')

    } catch (error) {
      console.error('❌ 获取抽奖记录失败:', error)
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
          return sum + (record.points_cost || 0)
        }, 0),
        successRate: records.length > 0 ? 
          (records.filter(r => r.prize_name !== '谢谢参与').length / records.length * 100).toFixed(1) : 0,
        bestPrize: this.getBestPrize(records)
      }

      this.setData({ statistics })

    } catch (error) {
      console.error('❌ 计算统计数据失败:', error)
    }
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
   * 生成模拟数据
   */
  generateMockRecords() {
    const mockRecords = []
    const prizeTypes = [
      { name: '100积分', value: 100, probability: 0.3 },
      { name: '50积分', value: 50, probability: 0.25 },
      { name: '20积分', value: 20, probability: 0.2 },
      { name: '优惠券', value: 10, probability: 0.15 },
      { name: '谢谢参与', value: 0, probability: 0.1 }
    ]

    for (let i = 0; i < 15; i++) {
      const randomPrize = this.getRandomPrize(prizeTypes)
      const drawType = Math.random() > 0.7 ? 'five' : 'single'
      
      mockRecords.push({
        id: Date.now() + i,
        draw_type: drawType,
        draw_count: drawType === 'five' ? 5 : 1,
        prize_name: randomPrize.name,
        prize_value: randomPrize.value,
        points_cost: drawType === 'five' ? 100 : 20,
        created_at: new Date(Date.now() - i * 3600000).toLocaleString(),
        status: 'completed'
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
   * 随机获取奖品
   */
  getRandomPrize(prizeTypes) {
    const random = Math.random()
    let cumulative = 0
    
    for (const prize of prizeTypes) {
      cumulative += prize.probability
      if (random <= cumulative) {
        return prize
      }
    }
    
    return prizeTypes[prizeTypes.length - 1]
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