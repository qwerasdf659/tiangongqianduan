// pages/user/user.js - 用户中心页面逻辑
const app = getApp()
const { userAPI, mockRequest } = require('../../utils/api')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 积分趋势
    todayEarned: 0,
    todayConsumed: 0,
    
    // 积分明细
    showPointsDetail: false,
    pointsRecords: [],
    filteredPointsRecords: [],
    pointsFilter: 'all', // 'all', 'earn', 'consume'
    hasMoreRecords: true,
    
    // 成就系统
    achievements: [],
    unlockedAchievements: 0,
    totalAchievements: 6,
    
    // 统计数据
    statistics: {
      totalLottery: 0,
      totalExchange: 0,
      totalUpload: 0,
      thisMonthPoints: 0,
      lotteryTrend: '↑',
      exchangeTrend: '→',
      uploadTrend: '↑',
      pointsTrend: '↑'
    },
    
    // 菜单项
    menuItems: [],
    
    // 页面状态
    loading: false,
    
    // 版本信息
    lastUpdateTime: '2024-01-15 10:30'
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('用户中心页面加载')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('用户中心页面显示')
    this.refreshUserData()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('用户中心页面隐藏')
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
    console.log('下拉刷新')
    this.refreshUserData()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 我的积分中心',
      path: '/pages/user/user'
    }
  },

  /**
   * 初始化页面
   */
  async initPage() {
    // 初始化数据
    this.initMenuItems()
    this.initAchievements()
    
    // 加载用户信息和统计数据
    await Promise.all([
      this.loadUserInfo(),
      this.loadStatistics(),
      this.loadPointsRecords()
    ])
  },

  /**
   * 刷新用户数据
   */
  async refreshUserData() {
    this.setData({ refreshing: true })
    await Promise.all([
      this.loadUserInfo(),
      this.loadStatistics(),
      this.loadPointsRecords()
    ])
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
  },

  /**
   * 加载用户数据
   */
  async loadUserData() {
    this.setData({ loading: true })
    
    await Promise.all([
      this.loadUserInfo(),
      this.loadStatistics(),
      this.loadPointsRecords()
    ])
    
    this.setData({ loading: false })
  },

  /**
   * 加载用户信息
   * TODO: 后端对接 - 用户信息接口
   * 
   * 对接说明：
   * 接口：GET /api/user/info
   * 认证：需要Bearer Token
   * 返回：用户详细信息，包括积分、等级等
   */
  async loadUserInfo() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟用户数据')
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return
    }

    try {
      console.log('📡 请求用户信息接口...')
      const res = await userAPI.getUserInfo()
      
      // 更新页面数据
      this.setData({
        userInfo: res.data,
        totalPoints: res.data.total_points
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = res.data
      console.log('✅ 用户信息加载成功')
      
    } catch (error) {
      console.error('❌ 获取用户信息失败:', error)
      
      // 错误处理：使用缓存数据或显示错误信息
      const cachedUserInfo = wx.getStorageSync('user_info')
      if (cachedUserInfo) {
        console.log('📦 使用缓存的用户信息')
        this.setData({
          userInfo: cachedUserInfo,
          totalPoints: cachedUserInfo.total_points
        })
      } else {
        wx.showToast({
          title: '获取用户信息失败',
          icon: 'none'
        })
      }
    }
  },

  /**
   * 加载统计数据
   * TODO: 后端对接 - 用户统计接口
   * 
   * 对接说明：
   * 接口：GET /api/user/statistics  
   * 认证：需要Bearer Token
   * 返回：用户活动统计数据（抽奖、兑换、上传次数等）
   */
  async loadStatistics() {
    try {
      let statisticsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟数据
        console.log('🔧 使用模拟统计数据')
        statisticsData = {
          code: 0,
          data: {
            total_lottery: 25,
            total_exchange: 8,
            total_upload: 12,
            this_month_points: 2400,
            total_earned_points: 15000,
            total_spent_points: 8500
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        console.log('📡 请求用户统计接口...')
        statisticsData = await userAPI.getStatistics()
      }

      this.setData({
        statistics: {
          totalLottery: statisticsData.data.total_lottery,
          totalExchange: statisticsData.data.total_exchange,
          totalUpload: statisticsData.data.total_upload,
          thisMonthPoints: statisticsData.data.this_month_points,
          totalEarnedPoints: statisticsData.data.total_earned_points || 0,
          totalSpentPoints: statisticsData.data.total_spent_points || 0
        }
      })
      
      console.log('✅ 用户统计数据加载成功')

    } catch (error) {
      console.error('❌ 获取统计数据失败:', error)
      
      // 使用默认数据，避免页面空白
      this.setData({
        statistics: {
          totalLottery: 0,
          totalExchange: 0, 
          totalUpload: 0,
          thisMonthPoints: 0,
          totalEarnedPoints: 0,
          totalSpentPoints: 0
        }
      })
    }
  },

  /**
   * 加载积分明细
   * TODO: 后端对接 - 积分明细接口
   * 
   * 对接说明：
   * 接口：GET /api/user/points-records?page=1&page_size=20&type=all
   * 认证：需要Bearer Token
   * 返回：积分收支记录列表
   */
  async loadPointsRecords() {
    try {
      let recordsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境使用模拟数据
        console.log('🔧 生成模拟积分记录数据')
        recordsData = this.generateMockPointsRecords()
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求积分记录接口...')
        recordsData = await userAPI.getPointsRecords()
      }

      this.setData({
        pointsRecords: recordsData
      })
      
      // 初始化筛选结果
      this.filterPointsRecords()

      console.log('✅ 积分记录加载成功，共', recordsData.length, '条记录')

    } catch (error) {
      console.error('❌ 获取积分记录失败:', error)
      this.setData({ pointsRecords: [] })
    }
  },

  /**
   * 生成模拟积分记录
   */
  generateMockPointsRecords(count = 10) {
    const types = ['earn', 'consume']
    const descriptions = {
      earn: ['签到奖励', '拍照上传', '邀请好友', '活动奖励', '系统赠送'],
      consume: ['抽奖消费', '商品兑换', '活动参与']
    }

    return Array.from({ length: count }, (_, i) => {
      const type = types[Math.floor(Math.random() * types.length)]
      const isEarn = type === 'earn'
      const points = isEarn ? 
        Math.floor(Math.random() * 100) + 10 : 
        -(Math.floor(Math.random() * 200) + 50)
      
      return {
        id: i + 1,
        type: type,
        points: points,
        description: descriptions[type][Math.floor(Math.random() * descriptions[type].length)],
        balance: 1500 - i * 20, // 模拟余额
        created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toLocaleDateString()
      }
    })
  },

  /**
   * 菜单项点击
   */
  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item
    console.log('点击菜单项:', item)

    if (item.action) {
      // 执行特定动作
      this[item.action]()
    } else if (item.path) {
      // 检查页面是否存在 - 包含所有新增的功能页面
      const existingPages = [
        '/pages/lottery/lottery',
        '/pages/exchange/exchange',
        '/pages/camera/camera',
        '/pages/user/user',
        '/pages/merchant/merchant',
        '/pages/auth/auth',
        '/pages/records/lottery-records',
        '/pages/records/exchange-records',
        '/pages/records/upload-records',
        '/pages/settings/settings',
        '/pages/about/about'
      ]
      
      if (existingPages.includes(item.path)) {
        // 跳转到存在的页面
        wx.navigateTo({
          url: item.path,
          fail: (error) => {
            console.error('页面跳转失败:', error)
            wx.showToast({
              title: '跳转失败',
              icon: 'none'
            })
          }
        })
      } else {
        // 显示功能开发中提示
        wx.showModal({
          title: item.name,
          content: `${item.description}\n\n该功能正在开发中，敬请期待！`,
          showCancel: false,
          confirmText: '知道了'
        })
      }
    }
  },

  /**
   * 切换积分明细显示
   */
  togglePointsDetail() {
    this.setData({
      showPointsDetail: !this.data.showPointsDetail
    })
  },

  /**
   * 头像点击 - 更换头像
   * TODO: 后端对接 - 头像上传功能
   * 
   * 对接说明：
   * 1. 选择图片后需要上传到服务器
   * 2. 接口：POST /api/user/upload-avatar (multipart/form-data)
   * 3. 认证：需要Bearer Token
   * 4. 返回：新的头像URL，需要更新用户信息
   */
  onAvatarTap() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        console.log('选择的头像:', tempFilePath)
        
        if (app.globalData.isDev && !app.globalData.needAuth) {
          // 开发环境模拟上传
          console.log('🔧 模拟头像上传')
          wx.showLoading({ title: '上传中...' })
          
          setTimeout(() => {
            wx.hideLoading()
            // 模拟更新头像
            const mockAvatarUrl = 'https://via.placeholder.com/100x100/4ECDC4/ffffff?text=头像'
            this.setData({
              'userInfo.avatar': mockAvatarUrl
            })
            
            // 更新全局数据
            if (app.globalData.mockUser) {
              app.globalData.mockUser.avatar = mockAvatarUrl
            }
            
            wx.showToast({
              title: '头像更新成功',
              icon: 'success'
            })
          }, 1500)
          
        } else {
          // 生产环境真实上传
          try {
            wx.showLoading({ title: '上传中...' })
            
            // TODO: 后端对接点 - 头像上传接口
            const uploadResult = await new Promise((resolve, reject) => {
              wx.uploadFile({
                url: app.globalData.baseUrl + '/api/user/upload-avatar',
                filePath: tempFilePath,
                name: 'avatar',
                header: {
                  'Authorization': `Bearer ${app.globalData.accessToken}`
                },
                success: (res) => {
                  const data = JSON.parse(res.data)
                  if (data.code === 0) {
                    resolve(data)
                  } else {
                    reject(new Error(data.msg || '上传失败'))
                  }
                },
                fail: reject
              })
            })
            
            wx.hideLoading()
            
            // 更新页面显示的头像
            this.setData({
              'userInfo.avatar': uploadResult.data.avatar_url
            })
            
            // 更新全局用户信息
            if (app.globalData.userInfo) {
              app.globalData.userInfo.avatar = uploadResult.data.avatar_url
            }
            
            // 更新本地缓存
            wx.setStorageSync('user_info', app.globalData.userInfo)
            
            wx.showToast({
              title: '头像更新成功',
              icon: 'success'
            })
            
          } catch (error) {
            wx.hideLoading()
            console.error('❌ 头像上传失败:', error)
            wx.showToast({
              title: error.message || '头像上传失败',
              icon: 'none'
            })
          }
        }
      },
      fail: (error) => {
        console.error('选择图片失败:', error)
      }
    })
  },

  /**
   * 手机号点击 - 更换手机号
   * TODO: 后端对接 - 手机号更换功能
   * 
   * 对接说明：
   * 需要实现手机号更换页面和相关接口
   * 1. 验证当前手机号
   * 2. 发送新手机号验证码
   * 3. 确认更换手机号
   */
  onPhoneTap() {
    wx.showModal({
      title: '更换手机号',
      content: '此功能需要验证身份，是否继续？',
      success: (res) => {
        if (res.confirm) {
          // TODO: 实现手机号更换页面
          wx.showToast({
            title: '手机号更换功能开发中',
            icon: 'none'
          })
          
          // 生产环境时跳转到手机号更换页面
          // wx.navigateTo({
          //   url: '/pages/auth/change-phone'
          // })
        }
      }
    })
  },

  /**
   * 积分余额点击
   */
  onPointsTap() {
    this.togglePointsDetail()
  },

  /**
   * 积分明细筛选切换
   */
  onPointsFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      pointsFilter: filter
    })
    this.filterPointsRecords()
  },

  /**
   * 筛选积分记录
   */
  filterPointsRecords() {
    let filtered = [...this.data.pointsRecords]
    
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
    
    this.setData({
      filteredPointsRecords: filtered
    })
  },

  /**
   * 加载更多积分记录
   */
  onLoadMoreRecords() {
    wx.showLoading({ title: '加载中...' })
    
    // 模拟加载更多数据
    setTimeout(() => {
      const newRecords = this.generateMockPointsRecords(5)
      const allRecords = [...this.data.pointsRecords, ...newRecords]
      
      this.setData({
        pointsRecords: allRecords,
        hasMoreRecords: allRecords.length < 50 // 假设最多50条记录
      })
      
      this.filterPointsRecords()
      wx.hideLoading()
    }, 1000)
  },

  /**
   * 刷新统计数据
   */
  onRefreshStats() {
    wx.showLoading({ title: '刷新中...' })
    
    // 模拟数据刷新
    setTimeout(() => {
      this.loadStatistics()
      wx.hideLoading()
      wx.showToast({
        title: '刷新完成',
        icon: 'success'
      })
    }, 1000)
  },

  /**
   * 意见反馈
   */
  onFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '感谢您的反馈！\n\n请通过以下方式联系我们：\n• 客服热线：400-8888-888\n• 在线客服：工作日9:00-18:00',
      confirmText: '联系客服',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          this.onContactService()
        }
      }
    })
  },

  /**
   * 初始化成就系统
   */
  initAchievements() {
    const achievements = [
      {
        id: 1,
        name: '新手上路',
        icon: '🌟',
        progress: 1,
        target: 1,
        unlocked: true,
        description: '完成首次登录'
      },
      {
        id: 2,
        name: '积分达人',
        icon: '💎',
        progress: this.data.totalPoints,
        target: 1000,
        unlocked: this.data.totalPoints >= 1000,
        description: '累计获得1000积分'
      },
      {
        id: 3,
        name: '抽奖狂人',
        icon: '🎰',
        progress: this.data.statistics.totalLottery,
        target: 10,
        unlocked: this.data.statistics.totalLottery >= 10,
        description: '累计抽奖10次'
      },
      {
        id: 4,
        name: '兑换专家',
        icon: '🛍️',
        progress: this.data.statistics.totalExchange,
        target: 5,
        unlocked: this.data.statistics.totalExchange >= 5,
        description: '累计兑换5次'
      },
      {
        id: 5,
        name: '拍照能手',
        icon: '📸',
        progress: this.data.statistics.totalUpload,
        target: 20,
        unlocked: this.data.statistics.totalUpload >= 20,
        description: '上传小票20次'
      },
      {
        id: 6,
        name: '忠实用户',
        icon: '👑',
        progress: 15, // 假设使用天数
        target: 30,
        unlocked: false,
        description: '连续使用30天'
      }
    ]

    const unlockedCount = achievements.filter(a => a.unlocked).length

    this.setData({
      achievements,
      unlockedAchievements: unlockedCount,
      totalAchievements: achievements.length
    })
  },

  /**
   * 更新成就进度
   */
  updateAchievements() {
    const achievements = this.data.achievements.map(achievement => {
      switch (achievement.id) {
        case 2: // 积分达人
          achievement.progress = this.data.totalPoints
          achievement.unlocked = this.data.totalPoints >= achievement.target
          break
        case 3: // 抽奖狂人
          achievement.progress = this.data.statistics.totalLottery
          achievement.unlocked = this.data.statistics.totalLottery >= achievement.target
          break
        case 4: // 兑换专家
          achievement.progress = this.data.statistics.totalExchange
          achievement.unlocked = this.data.statistics.totalExchange >= achievement.target
          break
        case 5: // 拍照能手
          achievement.progress = this.data.statistics.totalUpload
          achievement.unlocked = this.data.statistics.totalUpload >= achievement.target
          break
      }
      return achievement
    })

    const unlockedCount = achievements.filter(a => a.unlocked).length

    this.setData({
      achievements,
      unlockedAchievements: unlockedCount
    })
  },

  /**
   * 初始化菜单项
   */
  initMenuItems() {
    const menuItems = [
      { 
        id: 'lottery-records', 
        name: '抽奖记录', 
        description: '查看所有抽奖历史',
        icon: '🎰', 
        path: '/pages/records/lottery-records',
        color: '#FF6B35'
      },
      { 
        id: 'exchange-records', 
        name: '兑换记录', 
        description: '查看商品兑换历史',
        icon: '🛍️', 
        path: '/pages/records/exchange-records',
        color: '#4ECDC4'
      },
      { 
        id: 'upload-records', 
        name: '上传记录', 
        description: '查看小票上传历史',
        icon: '📸', 
        path: '/pages/records/upload-records',
        color: '#9C27B0'
      },
      { 
        id: 'points-detail', 
        name: '积分明细', 
        description: '详细的积分收支记录',
        icon: '💰', 
        action: 'togglePointsDetail',
        color: '#FFC107'
      },
      { 
        id: 'settings', 
        name: '设置', 
        description: '个人偏好设置',
        icon: '⚙️', 
        path: '/pages/settings/settings',
        color: '#607D8B'
      },
      { 
        id: 'about', 
        name: '关于我们', 
        description: '了解更多信息',
        icon: 'ℹ️', 
        path: '/pages/about/about',
        color: '#795548'
      }
    ]

    this.setData({ menuItems })
  },

  /**
   * 邀请好友
   */
  onInviteFriend() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    wx.showToast({
      title: '长按右上角分享',
      icon: 'none'
    })
  },

  /**
   * 客服联系
   */
  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-8888-888\n服务时间：9:00-18:00',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 退出登录
   */
  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout()
        }
      }
    })
  },

  /**
   * 商家管理入口
   */
  onMerchantEntrance() {
    wx.navigateTo({
      url: '/pages/merchant/merchant',
      fail: (error) => {
        console.error('跳转商家页面失败:', error)
        wx.showToast({
          title: '跳转失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 复制邀请码
   */
  onCopyInviteCode() {
    const inviteCode = 'RF' + String(Date.now()).slice(-6)
    wx.setClipboardData({
      data: inviteCode,
      success: () => {
        wx.showToast({
          title: '邀请码已复制',
          icon: 'success'
        })
      }
    })
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '餐厅积分系统 - 赚积分兑好礼'
    }
  },

  /**
   * 计算今日积分趋势
   */
  calculateTodayTrend() {
    const today = new Date().toDateString()
    const todayRecords = this.data.pointsRecords.filter(record => 
      new Date(record.created_at).toDateString() === today
    )

    const earned = todayRecords
      .filter(record => record.points > 0)
      .reduce((sum, record) => sum + record.points, 0)

    const consumed = Math.abs(todayRecords
      .filter(record => record.points < 0)
      .reduce((sum, record) => sum + record.points, 0))

    this.setData({
      todayEarned: earned,
      todayConsumed: consumed
    })
  }
})