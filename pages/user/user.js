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
    
    // 统计数据
    statistics: {
      totalLottery: 0,
      totalExchange: 0,
      totalUpload: 0,
      thisMonthPoints: 0
    },
    
    // 积分明细
    pointsRecords: [],
    showPointsDetail: false,
    
    // 页面状态
    loading: true,
    refreshing: false,
    
    // 功能菜单
    menuItems: [
      { 
        id: 'lottery-records', 
        name: '抽奖记录', 
        icon: '🎰', 
        path: '/pages/records/lottery-records',
        color: '#FF6B35'
      },
      { 
        id: 'exchange-records', 
        name: '兑换记录', 
        icon: '🛍️', 
        path: '/pages/records/exchange-records',
        color: '#4ECDC4'
      },
      { 
        id: 'upload-records', 
        name: '上传记录', 
        icon: '📸', 
        path: '/pages/records/upload-records',
        color: '#9C27B0'
      },
      { 
        id: 'points-detail', 
        name: '积分明细', 
        icon: '💰', 
        action: 'togglePointsDetail',
        color: '#FFC107'
      },
      { 
        id: 'settings', 
        name: '设置', 
        icon: '⚙️', 
        path: '/pages/settings/settings',
        color: '#607D8B'
      },
      { 
        id: 'about', 
        name: '关于我们', 
        icon: 'ℹ️', 
        path: '/pages/about/about',
        color: '#795548'
      }
    ]
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

  },

  /**
   * 初始化页面
   */
  async initPage() {
    // 初始化用户信息
    const userInfo = app.globalData.userInfo || app.globalData.mockUser || {
      user_id: 1001,
      phone: '138****8000',
      total_points: 1500,
      is_merchant: false,
      nickname: '测试用户'
    }
    
    this.setData({
      userInfo: userInfo,
      totalPoints: userInfo.total_points || 1500,
      loading: false
    })

    // 加载统计数据
    await this.loadStatistics()
    
    // 加载积分记录
    await this.loadPointsRecords()
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
   * TODO: 后端对接 - 积分记录接口
   * 
   * 对接说明：
   * 接口：GET /api/user/points-records?page=1&page_size=20
   * 认证：需要Bearer Token  
   * 返回：积分变动记录列表，支持分页
   */
  async loadPointsRecords() {
    try {
      let recordsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境使用模拟数据
        console.log('🔧 生成模拟积分明细数据')
        recordsData = {
          code: 0,
          data: {
            list: this.generateMockPointsRecords(),
            total: 50,
            page: 1,
            page_size: 20
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200))
      } else {
        console.log('📡 请求积分明细接口...')
        recordsData = await userAPI.getPointsRecords(1, 20)
      }

      this.setData({
        pointsRecords: recordsData.data.list
      })
      
      console.log('✅ 积分明细加载成功，共', recordsData.data.list.length, '条记录')

    } catch (error) {
      console.error('❌ 获取积分明细失败:', error)
      this.setData({ pointsRecords: [] })
    }
  },

  /**
   * 生成模拟积分明细
   */
  generateMockPointsRecords() {
    const types = [
      { type: 'earn', name: '小票审核通过', points: 500 },
      { type: 'consume', name: '抽奖消费', points: -100 },
      { type: 'consume', name: '商品兑换', points: -800 },
      { type: 'earn', name: '小票审核通过', points: 300 },
      { type: 'consume', name: '抽奖消费', points: -100 },
      { type: 'earn', name: '小票审核通过', points: 700 },
      { type: 'consume', name: '商品兑换', points: -1200 },
      { type: 'consume', name: '抽奖消费', points: -300 }
    ]

    return types.map((item, index) => ({
      id: index + 1,
      type: item.type,
      description: item.name,
      points: item.points,
      created_at: new Date(Date.now() - index * 2 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      balance: this.data.totalPoints + (types.length - index - 1) * 100
    }))
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
      // 跳转页面
      wx.navigateTo({
        url: item.path,
        fail: (error) => {
          console.error('页面跳转失败:', error)
          wx.showToast({
            title: '功能开发中',
            icon: 'none'
          })
        }
      })
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
   * 签到功能
   * TODO: 后端对接 - 签到接口
   * 
   * 对接说明：
   * 接口：POST /api/user/check-in
   * 认证：需要Bearer Token
   * 返回：签到结果，包括获得积分、连续签到天数等
   */
  async onCheckIn() {
    // 防重复点击
    if (this.checkingIn) return
    this.checkingIn = true
    
    try {
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟签到
        console.log('🔧 模拟用户签到')
        
        wx.showModal({
          title: '每日签到',
          content: '签到可获得10积分，是否立即签到？',
          success: async (res) => {
            if (res.confirm) {
              wx.showLoading({ title: '签到中...' })
              
              // 模拟网络延迟
              await new Promise(resolve => setTimeout(resolve, 1000))
              
              const checkInReward = 10 + Math.floor(Math.random() * 10) // 10-20积分随机奖励
              const newPoints = this.data.totalPoints + checkInReward
              const consecutiveDays = Math.floor(Math.random() * 7) + 1
              
              // 更新页面数据
              this.setData({ totalPoints: newPoints })
              
              // 更新全局数据
              if (app.globalData.mockUser) {
                app.globalData.mockUser.total_points = newPoints
              }
              
              wx.hideLoading()
              wx.showModal({
                title: '签到成功！',
                content: `获得${checkInReward}积分\n连续签到${consecutiveDays}天`,
                showCancel: false,
                confirmText: '太棒了'
              })
              
              // 刷新积分明细
              this.loadPointsRecords()
            }
          }
        })
        
      } else {
        // 生产环境调用真实签到接口
        console.log('📡 请求签到接口...')
        
        wx.showLoading({ title: '签到中...' })
        const checkInResult = await userAPI.checkIn()
        wx.hideLoading()
        
        // 更新页面积分显示
        this.setData({
          totalPoints: checkInResult.data.total_points
        })
        
        // 更新全局用户信息
        if (app.globalData.userInfo) {
          app.globalData.userInfo.total_points = checkInResult.data.total_points
        }
        
        // 显示签到成功信息
        wx.showModal({
          title: '签到成功！',
          content: `获得${checkInResult.data.points_earned}积分\n连续签到${checkInResult.data.consecutive_days}天`,
          showCancel: false,
          confirmText: '太棒了'
        })
        
        console.log('✅ 签到成功，获得积分:', checkInResult.data.points_earned)
        
        // 刷新相关数据
        this.loadUserInfo()
        this.loadStatistics()
        this.loadPointsRecords()
      }
      
    } catch (error) {
      wx.hideLoading()
      console.error('❌ 签到失败:', error)
      
      // 错误处理
      if (error.code === 1001) {
        wx.showToast({
          title: '今日已签到',
          icon: 'none'
        })
      } else {
        wx.showToast({
          title: error.msg || '签到失败，请稍后重试',
          icon: 'none'
        })
      }
    } finally {
      this.checkingIn = false
    }
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
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '快来餐厅积分系统赚积分！',
      path: '/pages/lottery/lottery',
      imageUrl: '/images/share-user.jpg'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '餐厅积分抽奖 - 我已经赚了' + this.data.totalPoints + '积分',
      imageUrl: '/images/share-user.jpg'
    }
  }
})