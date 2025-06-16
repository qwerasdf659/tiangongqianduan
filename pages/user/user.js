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
    this.setData({
      userInfo: app.globalData.userInfo || app.globalData.mockUser,
      totalPoints: app.globalData.userInfo?.total_points || app.globalData.mockUser.total_points
    })

    // 加载用户数据
    await this.loadUserData()
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
   */
  async loadUserInfo() {
    if (app.globalData.isDev) {
      // 开发环境使用模拟数据
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return
    }

    // TODO: 对接用户信息接口
    try {
      const res = await userAPI.getUserInfo()
      this.setData({
        userInfo: res.data,
        totalPoints: res.data.total_points
      })
      app.globalData.userInfo = res.data
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },

  /**
   * 加载统计数据
   */
  async loadStatistics() {
    try {
      let statisticsData

      if (app.globalData.isDev) {
        // 开发环境模拟数据
        statisticsData = {
          code: 0,
          data: {
            total_lottery: 25,
            total_exchange: 8,
            total_upload: 12,
            this_month_points: 2400
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        // TODO: 对接真实统计接口
        statisticsData = await userAPI.getStatistics()
      }

      this.setData({
        statistics: {
          totalLottery: statisticsData.data.total_lottery,
          totalExchange: statisticsData.data.total_exchange,
          totalUpload: statisticsData.data.total_upload,
          thisMonthPoints: statisticsData.data.this_month_points
        }
      })

    } catch (error) {
      console.error('获取统计数据失败:', error)
    }
  },

  /**
   * 加载积分明细
   */
  async loadPointsRecords() {
    try {
      let recordsData

      if (app.globalData.isDev) {
        // 开发环境模拟数据
        recordsData = this.generateMockPointsRecords()
      } else {
        // TODO: 对接真实积分明细接口
        const res = await userAPI.getPointsRecords()
        recordsData = res.data.list
      }

      this.setData({
        pointsRecords: recordsData
      })

    } catch (error) {
      console.error('获取积分明细失败:', error)
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
   */
  onAvatarTap() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        // TODO: 上传头像到服务器
        console.log('选择的头像:', res.tempFilePaths[0])
        wx.showToast({
          title: '头像上传功能开发中',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 手机号点击 - 更换手机号
   */
  onPhoneTap() {
    wx.showModal({
      title: '更换手机号',
      content: '此功能需要验证身份，是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/auth/change-phone'
          })
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
   */
  onCheckIn() {
    // TODO: 对接签到接口
    wx.showModal({
      title: '每日签到',
      content: '签到可获得10积分，是否立即签到？',
      success: (res) => {
        if (res.confirm) {
          // 模拟签到
          const newPoints = this.data.totalPoints + 10
          this.setData({ totalPoints: newPoints })
          
          wx.showToast({
            title: '签到成功，获得10积分',
            icon: 'success'
          })
          
          // 更新全局数据
          if (app.globalData.mockUser) {
            app.globalData.mockUser.total_points = newPoints
          }
        }
      }
    })
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