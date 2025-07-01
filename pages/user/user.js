// pages/user/user.js - 用户中心页面逻辑
const app = getApp()
const { userAPI } = require('../../utils/api')

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
   * 初始化页面 - 增强错误处理
   */
  initPage() {
    // 初始化数据
    this.initMenuItems()
    
    // 设置默认数据防止页面显示异常
    this.setData({
      totalPoints: 0,
      userInfo: { nickname: '加载中...', avatar: '/images/default-avatar.png' },
      statistics: {},
      pointsRecords: [],
      achievements: []
    })
    
    // 加载用户信息和统计数据，完成后初始化成就系统
    Promise.allSettled([
      this.loadUserInfo(),
      this.loadStatistics(),
      this.loadPointsRecords()
    ]).then((results) => {
      // 检查各个请求的结果
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const functionNames = ['loadUserInfo', 'loadStatistics', 'loadPointsRecords']
          console.warn(`${functionNames[index]}加载失败:`, result.reason)
        }
      })
      
      // 无论是否有错误，都初始化成就系统
      this.initAchievements()
      
      console.log('✅ 页面初始化完成')
    }).catch(error => {
      console.error('❌ 页面初始化失败:', error)
      // 即使加载失败也初始化成就系统，使用默认值
      this.initAchievements()
      
      // 显示友好的错误提示
      wx.showModal({
        title: '数据加载异常',
        content: '部分数据加载失败，功能可能受限。请检查网络连接后下拉刷新。',
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  /**
   * 刷新用户数据
   */
  refreshUserData() {
    this.setData({ refreshing: true })
    Promise.all([
      this.loadUserInfo(),
      this.loadStatistics(),
      this.loadPointsRecords()
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
   * 加载用户数据
   */
  loadUserData() {
    this.setData({ loading: true })
    
    Promise.all([
      this.loadUserInfo(),
      this.loadStatistics(),
      this.loadPointsRecords()
    ]).then(() => {
      this.setData({ loading: false })
    }).catch(error => {
      console.error('❌ 加载用户数据失败:', error)
      this.setData({ loading: false })
    })
  },

  /**
   * 加载用户信息 - 增强版本
   * TODO: 后端对接 - 用户信息接口
   * 
   * 对接说明：
   * 接口：GET /api/user/info
   * 认证：需要Bearer Token
   * 返回：用户详细信息，包括积分余额、基本信息等
   */
  loadUserInfo() {
    // 🚨 已删除：开发环境Mock数据 - 违反项目安全规则
    // ✅ 必须使用真实后端API获取用户信息
    
    {
      // 生产环境调用真实接口
      console.log('📡 请求用户信息接口...')
      return userAPI.getUserInfo().then((res) => {
        // 安全检查返回数据
        if (!res || !res.data) {
          throw new Error('用户信息数据格式异常')
        }
        
        const userInfo = res.data
        this.setData({
          userInfo: userInfo,
          totalPoints: userInfo.total_points || 0
        })
        
        // 更新全局用户信息
        app.globalData.userInfo = userInfo
        console.log('✅ 用户信息加载成功')
        
        return userInfo
      }).catch((error) => {
        console.error('❌ 获取用户信息失败:', error)
        
        // 使用全局缓存数据作为降级方案
        if (app.globalData.userInfo) {
          this.setData({
            userInfo: app.globalData.userInfo,
            totalPoints: app.globalData.userInfo.total_points || 0
          })
          console.log('🔄 使用缓存用户信息')
        } else {
          // 设置默认用户信息
          this.setData({
            userInfo: {
              nickname: '加载失败',
              avatar: '/images/default-avatar.png',
              phone: '未知',
              total_points: 0
            },
            totalPoints: 0
          })
        }
        
        throw error
      })
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
  loadStatistics() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟数据
      console.log('🔧 使用模拟统计数据')
      const statisticsData = {
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
      return new Promise(resolve => {
        setTimeout(() => {
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
          resolve()
        }, 300)
      })
    } else {
      console.log('📡 请求用户统计接口...')
      return userAPI.getStatistics().then((statisticsData) => {
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
      }).catch((error) => {
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
  /**
   * 🔴 加载积分记录 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据
   */
  loadPointsRecords() {
    console.log('📡 请求积分记录接口...')
    return userAPI.getPointsRecords().then((result) => {
      if (result.code === 0) {
        this.setData({
          pointsRecords: result.data || []
        })
        
        // 初始化筛选结果
        this.filterPointsRecords()

        // 计算今日积分趋势
        this.calculateTodayTrend()

        console.log('✅ 积分记录加载成功，共', result.data?.length || 0, '条记录')
      } else {
        throw new Error('⚠️ 后端服务异常：' + result.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取积分记录失败:', error)
      
      // 🚨 显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取积分记录！\n\n请检查后端API服务状态：\nGET /api/user/points-records',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      // 使用空数据，避免页面崩溃
      this.setData({
        pointsRecords: []
      })
      
      this.filterPointsRecords()
    })
  },

  /**
   * 菜单项点击
   */
  /**
   * 菜单项点击处理 - 根据产品功能结构文档调整
   */
  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item
    console.log('点击菜单项:', item)

    if (item.action) {
      // 执行特定动作
      if (typeof this[item.action] === 'function') {
        this[item.action]()
      } else {
        console.error(`❌ 菜单项动作不存在: ${item.action}`)
        wx.showToast({
          title: '功能暂未开放',
          icon: 'none'
        })
      }
    } else if (item.path) {
      // 检查页面是否存在 - 仅包含符合产品功能结构的页面
      const existingPages = [
        '/pages/index/index',
        '/pages/lottery/lottery',
        '/pages/exchange/exchange',
        '/pages/camera/camera',
        '/pages/user/user',
        '/pages/merchant/merchant',
        '/pages/auth/auth',
        '/pages/records/lottery-records',
        '/pages/records/exchange-records',
        '/pages/records/upload-records'
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
   * 点击头像 - 更换头像
   * TODO: 后端对接 - 头像上传接口
   * 
   * 对接说明：
   * 接口：POST /api/user/upload-avatar (multipart/form-data)
   * 认证：需要Bearer Token
   * 返回：新的头像URL
   */
  onAvatarTap() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        console.log('选择的头像:', tempFilePath)
        
        // 🔴 必须使用真实的头像上传API - 符合项目安全规则
        {
          // 🚨 已删除：开发环境Mock数据违规代码
          // ✅ 所有环境都使用真实后端API
          wx.showLoading({ title: '上传中...' })
          
          // TODO: 后端对接点 - 头像上传接口
          new Promise((resolve, reject) => {
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
          }).then((uploadResult) => {
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
          }).catch((error) => {
            wx.hideLoading()
            console.error('❌ 头像上传失败:', error)
            wx.showToast({
              title: error.message || '头像上传失败',
              icon: 'none'
            })
          })
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
   * 🔴 加载更多积分记录 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据，强制后端依赖
   */
  onLoadMoreRecords() {
    wx.showLoading({ title: '加载中...' })
    
    // 🔴 必须从后端API获取更多记录
    const currentPage = Math.floor(this.data.pointsRecords.length / 20) + 1
    
    userAPI.getPointsRecords(currentPage, 20).then((result) => {
      wx.hideLoading()
      
      if (result.code === 0) {
        const newRecords = result.data.records || []
        const allRecords = [...this.data.pointsRecords, ...newRecords]
        
        this.setData({
          pointsRecords: allRecords,
          hasMoreRecords: allRecords.length < result.data.total
        })
        
        this.filterPointsRecords()
        console.log('✅ 积分记录加载成功')
      } else {
        throw new Error('⚠️ 后端服务异常：' + result.msg)
      }
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 获取积分记录失败:', error)
      
      // 🚨 显示后端服务异常提示 - 严禁使用Mock数据
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取积分记录！\n\n请检查后端API服务状态：\nGET /api/user/points-records',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
    })
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
    const currentPoints = this.data.totalPoints || 0
    const currentStats = this.data.statistics || {}
    
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
        progress: currentPoints,
        target: 1000,
        unlocked: currentPoints >= 1000,
        description: '累计获得1000积分'
      },
      {
        id: 3,
        name: '抽奖狂人',
        icon: '🎰',
        progress: currentStats.totalLottery || 0,
        target: 10,
        unlocked: (currentStats.totalLottery || 0) >= 10,
        description: '累计抽奖10次'
      },
      {
        id: 4,
        name: '兑换专家',
        icon: '🛍️',
        progress: currentStats.totalExchange || 0,
        target: 5,
        unlocked: (currentStats.totalExchange || 0) >= 5,
        description: '累计兑换5次'
      },
      {
        id: 5,
        name: '拍照能手',
        icon: '📸',
        progress: currentStats.totalUpload || 0,
        target: 20,
        unlocked: (currentStats.totalUpload || 0) >= 20,
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
    
    console.log('🏆 成就系统初始化完成:', { unlockedCount, total: achievements.length })
  },

  /**
   * 更新成就进度
   */
  updateAchievements() {
    const currentPoints = this.data.totalPoints || 0
    const currentStats = this.data.statistics || {}
    
    const achievements = this.data.achievements.map(achievement => {
      switch (achievement.id) {
        case 2: // 积分达人
          achievement.progress = currentPoints
          achievement.unlocked = currentPoints >= achievement.target
          break
        case 3: // 抽奖狂人
          achievement.progress = currentStats.totalLottery || 0
          achievement.unlocked = (currentStats.totalLottery || 0) >= achievement.target
          break
        case 4: // 兑换专家
          achievement.progress = currentStats.totalExchange || 0
          achievement.unlocked = (currentStats.totalExchange || 0) >= achievement.target
          break
        case 5: // 拍照能手
          achievement.progress = currentStats.totalUpload || 0
          achievement.unlocked = (currentStats.totalUpload || 0) >= achievement.target
          break
      }
      return achievement
    })

    const unlockedCount = achievements.filter(a => a.unlocked).length

    this.setData({
      achievements,
      unlockedAchievements: unlockedCount
    })
    
    console.log('🏆 成就进度已更新:', { unlockedCount, total: achievements.length })
  },

  /**
   * 初始化菜单项 - 根据产品功能结构文档调整
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
        id: 'contact-service', 
        name: '联系客服', 
        description: '获取帮助和支持',
        icon: '💬', 
        action: 'onContactService',
        color: '#607D8B'
      },
      { 
        id: 'feedback', 
        name: '意见反馈', 
        description: '提交建议和问题反馈',
        icon: '📝', 
        action: 'onFeedback',
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
    
    console.log('📊 今日积分趋势:', { earned, consumed })
  }
})