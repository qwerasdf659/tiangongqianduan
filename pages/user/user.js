// pages/user/user.js - 用户中心页面逻辑
const app = getApp()
const { userAPI } = require('../../utils/api')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: null,
    totalPoints: 0,
    
    // 统计信息
    userStats: {
      totalUploads: 0,
      approvedUploads: 0,
      totalLotteries: 0,
      totalExchanges: 0,
      joinDays: 0
    },
    
    // 🔧 修复：添加缺失的统计数据初始化
    statistics: {
      totalLottery: 0,
      totalExchange: 0,
      totalUpload: 0,
      thisMonthPoints: 0,
      lotteryTrend: '→',
      exchangeTrend: '→',
      uploadTrend: '→',
      pointsTrend: '→'
    },
    
    // 🔧 修复：添加缺失的菜单项初始化
    menuItems: [],
    
    // 🔧 修复：添加缺失的成就系统初始化
    achievements: [],
    unlockedAchievements: 0,
    totalAchievements: 0,
    
    // 积分记录
    pointsRecords: [],
    
    // 积分趋势数据
    todayEarned: 0,
    todayConsumed: 0,
    
    // 页面状态
    loading: true,
    refreshing: false,
    
    // 设置相关
    settings: {
      notifications: true,
      soundEffects: true,
      autoRefresh: true
    },
    
    // 功能快捷入口
    quickActions: [
      {
        id: 'lottery-records',
        name: '抽奖记录',
        icon: '🎰',
        url: '/pages/records/lottery-records'
      },
      {
        id: 'exchange-records',
        name: '兑换记录',
        icon: '🎁',
        url: '/pages/records/exchange-records'
      },
      {
        id: 'upload-records',
        name: '上传记录',
        icon: '📷',
        url: '/pages/records/upload-records'
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
    this.refreshUserData().finally(() => {
      wx.stopPullDownRefresh()
    })
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
  initPage() {
    console.log('🔄 开始初始化用户页面...')
    
    // 🔧 修复：添加所有必要的初始化方法调用
    // 1. 初始化基础UI数据（这些不会失败）
    this.initMenuItems()
    this.initAchievements()
    this.calculateTodayTrend()
    
    // 2. 从全局获取用户信息
    const globalUserInfo = app.globalData.userInfo
    if (globalUserInfo) {
      this.setData({
        userInfo: globalUserInfo,
        totalPoints: globalUserInfo.total_points || 0
      })
    }
    
    // 3. 加载完整用户数据（添加错误处理）
    this.loadUserData().catch((error) => {
      console.error('❌ 页面初始化失败:', error)
      
      // 🔧 修复：即使数据加载失败，也要确保页面能正常使用
      // 页面已经有了基础UI（菜单、成就等），用户可以正常使用
      console.log('✅ 页面基础功能已可用，数据加载失败不影响核心功能')
    })
    
    console.log('✅ 用户页面初始化完成')
  },

  /**
   * 🔴 加载用户数据 - 必须从后端API获取
   * 接口：GET /api/user/info, GET /api/user/statistics
   * 认证：需要Bearer Token
   * 返回：用户详细信息和统计数据
   */
  loadUserData() {
    this.setData({ loading: true })
    
    // 🔧 修复：添加超时机制，防止loading一直为true
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('数据加载超时'))
      }, 10000) // 10秒超时
    })
    
    // 🔧 修复：确保返回Promise对象，添加超时保护
    return Promise.race([
      Promise.all([
        this.refreshUserInfo(),
        this.loadUserStatistics(),
        this.loadRecentPointsRecords()
      ]),
      timeoutPromise
    ]).then(() => {
      console.log('✅ 用户数据加载完成')
      this.setData({ loading: false })
    }).catch((error) => {
      console.error('❌ 用户数据加载失败:', error)
      
      // 🔧 修复：确保loading状态被正确设置为false
      this.setData({ loading: false })
      
      // 🔧 修复：显示友好的错误提示
      if (error.message === '数据加载超时') {
        wx.showModal({
          title: '⏱️ 加载超时',
          content: '数据加载时间过长，已自动取消。\n\n页面将显示默认状态，您可以：\n1. 点击功能菜单正常使用\n2. 下拉刷新重新加载数据\n3. 检查网络连接',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '继续使用',
          success: (res) => {
            if (res.cancel) {
              // 用户选择重试
              setTimeout(() => {
                this.refreshUserData()
              }, 1000)
            }
          }
        })
      }
      
      // 🔧 修复：设置安全的默认值，确保页面能正常使用
      this.safeSetData({
        userInfo: {
          user_id: 'loading_failed',
          phone: '数据加载失败',
          nickname: '点击重试',
          level: 'VIP1',
          avatar: '/images/default-avatar.png'
        },
        totalPoints: 0,
        statistics: {
          totalLottery: 0,
          totalExchange: 0,
          totalUpload: 0,
          thisMonthPoints: 0,
          lotteryTrend: '→',
          exchangeTrend: '→',
          uploadTrend: '→',
          pointsTrend: '→'
        },
        todayEarned: 0,
        todayConsumed: 0,
        pointsRecords: []
      })
    })
  },

  /**
   * 🔴 刷新用户信息 - 从后端API获取
   */
  refreshUserInfo() {
    console.log('📡 刷新用户信息...')
    
    return userAPI.getUserInfo().then((res) => {
      console.log('✅ 用户信息API响应:', res)
      
      // 🔧 增强数据安全验证 - 处理后端返回null或错误数据的情况
      if (!res || res.code !== 0) {
        throw new Error(`后端API返回错误: code=${res?.code}, msg=${res?.msg}`)
      }
      
      const userInfo = res.data
      
      // 🔧 严格验证数据完整性
      if (!userInfo || typeof userInfo !== 'object') {
        throw new Error('后端返回的用户数据为空或格式不正确')
      }
      
      // 🔧 修复undefined问题：确保totalPoints总是有有效值
      const totalPoints = (userInfo.total_points !== undefined && userInfo.total_points !== null && typeof userInfo.total_points === 'number') 
        ? userInfo.total_points 
        : 0
      
      console.log('💰 用户页面数据验证结果:', { 
        originalPoints: userInfo.total_points,
        validatedPoints: totalPoints,
        userInfoValid: !!userInfo
      })
      
      this.safeSetData({
        userInfo: userInfo,
        totalPoints: totalPoints
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = {
        ...userInfo,
        total_points: totalPoints  // 确保全局数据也是安全的
      }
      console.log('✅ 用户信息刷新成功，当前积分:', totalPoints)
      
    }).catch((error) => {
      console.error('❌ 获取用户信息失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 数据加载失败',
        content: `用户信息获取失败！\n\n可能原因：\n1. 用户未登录或令牌过期\n2. 后端API服务异常\n3. 网络连接问题\n\n错误详情：${error.message || error.msg || '未知错误'}`,
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新登录',
        confirmColor: '#FF6B35',
        success: (res) => {
          if (res.confirm) {
            // 跳转到登录页面
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          }
        }
      })
      
      // 错误处理：使用全局缓存数据
      if (app.globalData.userInfo) {
        const cachedPoints = (app.globalData.userInfo.total_points !== undefined && app.globalData.userInfo.total_points !== null && typeof app.globalData.userInfo.total_points === 'number') 
          ? app.globalData.userInfo.total_points 
          : 0
          
        this.safeSetData({
          userInfo: app.globalData.userInfo,
          totalPoints: cachedPoints
        })
      } else {
        // 设置安全的默认值
        this.safeSetData({
          userInfo: {
            nickname: '加载失败',
            mobile: '请重试',
            avatar: '/images/default-avatar.png'
          },
          totalPoints: 0
        })
      }
    })
  },

  /**
   * 🔴 加载用户统计数据 - 从后端API获取
   * 接口：GET /api/user/statistics
   * 认证：需要Bearer Token
   * 返回：用户统计信息，包括上传次数、抽奖次数、兑换次数等
   */
  loadUserStatistics() {
    console.log('📊 加载用户统计数据...')
    
    return userAPI.getStatistics().then((res) => {
      if (res.code === 0) {
        const statsData = res.data
        
        // 🔧 修复：同步设置userStats和statistics，确保WXML能正确显示
        this.setData({
          userStats: statsData,
          statistics: {
            totalLottery: statsData.totalLotteries || 0,
            totalExchange: statsData.totalExchanges || 0,
            totalUpload: statsData.totalUploads || 0,
            thisMonthPoints: statsData.thisMonthPoints || 0,
            lotteryTrend: statsData.lotteryTrend || '→',
            exchangeTrend: statsData.exchangeTrend || '→',
            uploadTrend: statsData.uploadTrend || '→',
            pointsTrend: statsData.pointsTrend || '→'
          }
        })
        
        // 🔧 修复：更新成就系统
        this.updateAchievements()
        
        console.log('✅ 用户统计数据加载成功:', statsData)
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取用户统计数据失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取统计数据！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态：\nGET /api/user/statistics`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      // 🔧 修复：设置安全的默认值，确保页面能正常显示
      this.setData({
        userStats: {
          totalUploads: 0,
          approvedUploads: 0,
          totalLotteries: 0,
          totalExchanges: 0,
          joinDays: 0
        },
        statistics: {
          totalLottery: 0,
          totalExchange: 0,
          totalUpload: 0,
          thisMonthPoints: 0,
          lotteryTrend: '→',
          exchangeTrend: '→',
          uploadTrend: '→',
          pointsTrend: '→'
        }
      })
    })
  },

  /**
   * 🔴 加载最近积分记录 - 从后端API获取
   * 接口：GET /api/user/points/records?page=1&pageSize=10
   * 认证：需要Bearer Token
   * 返回：最近的积分变动记录
   */
  loadRecentPointsRecords() {
    console.log('💰 加载积分记录...')
    
    return userAPI.getPointsRecords(1, 10, 'all').then((res) => {
      if (res.code === 0) {
        const records = res.data.records || []
        
        // 🔧 修复：设置积分记录并立即筛选
        this.setData({
          pointsRecords: records,
          hasMoreRecords: res.data.hasMore || false
        })
        
        // 🔧 修复：计算今日趋势
        this.calculateTodayTrend()
        
        console.log('✅ 积分记录加载成功，共', records.length, '条记录')
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取积分记录失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取积分记录！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态：\nGET /api/user/points/records`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      // 🔧 修复：设置安全的默认值并立即筛选
      this.setData({
        pointsRecords: [],
        hasMoreRecords: false,
        todayEarned: 0,
        todayConsumed: 0
      })
      
      // 🔧 设置安全的默认值
    })
  },

  /**
   * 刷新用户数据
   */
  refreshUserData() {
    this.setData({ refreshing: true })
    
    return this.loadUserData().catch((error) => {
      console.error('❌ 刷新用户数据失败:', error)
      // 🔧 修复：刷新失败不影响页面正常使用
      wx.showToast({
        title: '刷新失败，请检查网络',
        icon: 'none',
        duration: 2000
      })
    }).finally(() => {
      this.setData({ refreshing: false })
    })
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
        '/pages/points-detail/points-detail',
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


  /**
   * 🔴 头像点击事件 - 符合最新接口对接规范
   * 支持头像上传到Sealos云存储
   */
  onAvatarTap() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const filePath = res.tempFiles[0].tempFilePath
        that.uploadAvatar(filePath)
      },
      fail: (error) => {
        console.error('❌ 选择头像失败:', error)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 🔴 上传头像 - 必须使用后端API
   * 接口：POST /api/user/avatar
   * 认证：需要Bearer Token
   * 存储：Sealos云存储
   */
  uploadAvatar(filePath) {
    console.log('📡 开始上传头像...')
    
    wx.showLoading({
      title: '上传中...',
      mask: true
    })
    
    return userAPI.uploadAvatar(filePath).then((result) => {
      wx.hideLoading()
      console.log('✅ 头像上传成功:', result)
      
      if (result.code === 0 && result.data && result.data.avatarUrl) {
        // 🔴 更新本地用户信息
        const updatedUserInfo = {
          ...this.data.userInfo,
          avatar: result.data.avatarUrl
        }
        
        this.setData({
          userInfo: updatedUserInfo
        })
        
        // 🔴 更新全局用户信息
        app.globalData.userInfo = updatedUserInfo
        
        wx.showToast({
          title: '头像更新成功',
          icon: 'success'
        })
      } else {
        throw new Error('头像上传响应数据异常')
      }
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 头像上传失败:', error)
      
      // 🔴 后端服务异常已在API层处理，这里只显示简要提示
      if (!error.isBackendError && !error.isNetworkError) {
        wx.showToast({
          title: '头像上传失败',
          icon: 'none'
        })
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
   * 积分余额点击 - 跳转到积分明细页面
   */
  onPointsTap() {
    console.log('💰 跳转到积分明细页面')
    wx.navigateTo({
      url: '/pages/points-detail/points-detail',
      success: () => {
        console.log('✅ 积分明细页面跳转成功')
      },
      fail: (error) => {
        console.error('❌ 积分明细页面跳转失败:', error)
        wx.showToast({
          title: '页面跳转失败',
          icon: 'none'
        })
      }
    })
  },



  /**
   * 🔴 加载更多积分记录 - 符合最新接口对接规范
   * 接口：GET /api/user/points/records
   * 支持分页查询和类型筛选
   */
  onLoadMoreRecords() {
    console.log('📡 加载更多积分记录...')
    
    // 🔴 计算下一页页码
    const currentRecords = this.data.pointsRecords || []
    const nextPage = Math.floor(currentRecords.length / 20) + 1
    
    // 🔴 获取当前筛选条件
    const currentFilter = this.data.pointsFilter || 'all'
    const typeFilter = currentFilter === 'all' ? 'all' : currentFilter
    
    wx.showLoading({
      title: '加载中...',
      mask: true
    })
    
    return userAPI.getPointsRecords(nextPage, 20, typeFilter, '').then((result) => {
      wx.hideLoading()
      console.log('✅ 积分记录加载成功:', result)
      
      if (result.code === 0 && result.data && result.data.records) {
        const newRecords = result.data.records
        
        if (newRecords.length > 0) {
          // 🔴 追加新记录到现有列表
          const allRecords = [...currentRecords, ...newRecords]
          
          this.setData({
            pointsRecords: allRecords
          })
          
          wx.showToast({
            title: `加载了${newRecords.length}条记录`,
            icon: 'success'
          })
          
          console.log('✅ 积分记录追加成功，总记录数:', allRecords.length)
        } else {
          wx.showToast({
            title: '没有更多记录了',
            icon: 'none'
          })
        }
        
        // 🔴 如果有总页数信息，检查是否还有更多页
        if (result.data.totalPages && nextPage >= result.data.totalPages) {
          console.log('📝 已加载所有积分记录')
        }
      } else {
        throw new Error('积分记录数据格式异常')
      }
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 加载更多积分记录失败:', error)
      
      // 🔴 后端服务异常已在API层处理，这里只显示简要提示
      if (!error.isBackendError && !error.isNetworkError) {
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 🔴 WebSocket状态监听 - 实时接收积分变动推送
   * 符合最新产品功能要求：实时更新用户积分和统计数据
   */
  onWebSocketMessage(eventName, data) {
    console.log('📢 用户中心页面收到WebSocket消息:', eventName, data)
    
    switch (eventName) {
      case 'pointsUpdated':
        // 积分更新通知
        if (data.user_id === this.data.userInfo?.user_id) {
          console.log('💰 收到积分更新通知:', data)
          
          // 🔴 更新积分显示
          this.setData({
            totalPoints: data.points
          })
          
          // 🔴 更新全局用户信息
          if (app.globalData.userInfo) {
            app.globalData.userInfo.total_points = data.points
          }
          
          // 🔴 刷新积分记录（最新的积分变动）
          this.loadRecentPointsRecords()
          
          // 🔴 显示积分变动通知
          const changeAmount = data.change || 0
          const changeText = changeAmount > 0 ? `+${changeAmount}` : `${changeAmount}`
          
          wx.showToast({
            title: `积分${changeText}`,
            icon: changeAmount > 0 ? 'success' : 'none',
            duration: 2000
          })
        }
        break
        
      case 'reviewCompleted':
        // 审核完成通知
        if (data.user_id === this.data.userInfo?.user_id) {
          console.log('📋 收到审核完成通知:', data)
          
          // 🔴 刷新用户统计数据
          this.loadUserStatistics()
          
          // 🔴 如果审核通过，刷新积分记录
          if (data.status === 'approved') {
            this.loadRecentPointsRecords()
          }
          
          // 🔴 显示审核结果通知
          const statusText = data.status === 'approved' ? '审核通过' : '审核拒绝'
          const statusIcon = data.status === 'approved' ? '✅' : '❌'
          
          wx.showToast({
            title: `${statusIcon} ${statusText}`,
            icon: data.status === 'approved' ? 'success' : 'none',
            duration: 2000
          })
        }
        break
        
      case 'userStatusChanged':
        // 用户状态变化通知（如登录状态改变）
        console.log('👤 收到用户状态变化通知:', data)
        
        if (data.isLoggedIn) {
          // 🔴 用户重新登录，刷新所有数据
          this.refreshUserData()
        } else {
          // 🔴 用户登出，清空数据
          this.setData({
            userInfo: null,
            totalPoints: 0,
            pointsRecords: [],
            userStats: {}
          })
        }
        break
        
      default:
        console.log('📝 未处理的WebSocket事件:', eventName, data)
    }
  },

  /**
   * 刷新统计数据
   */
  onRefreshStats() {
    console.log('🔄 刷新统计数据...')
    wx.showLoading({ title: '刷新中...' })
    
    // 🔧 修复：调用正确的方法名 loadUserStatistics
    this.loadUserStatistics().then(() => {
      wx.hideLoading()
      wx.showToast({
        title: '刷新完成',
        icon: 'success'
      })
    }).catch((error) => {
      console.error('❌ 刷新统计数据失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      })
    })
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
        path: '/pages/points-detail/points-detail',
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
  },

  /**
   * 🔧 安全的setData方法 - 防止undefined值导致小程序崩溃
   */
  safeSetData(data) {
    // 🔴 递归清理undefined值
    const cleanUndefined = (obj) => {
      if (obj === null || obj === undefined) {
        return null
      }
      
      if (Array.isArray(obj)) {
        return obj.map(cleanUndefined).filter(item => item !== undefined)
      }
      
      if (typeof obj === 'object') {
        const cleaned = {}
        Object.keys(obj).forEach(key => {
          const value = cleanUndefined(obj[key])
          if (value !== undefined) {
            cleaned[key] = value
          }
        })
        return cleaned
      }
      
      return obj
    }
    
    const cleanedData = cleanUndefined(data)
    console.log('🔧 用户页面安全数据设置:', cleanedData)
    this.setData(cleanedData)
  },



  /**
   * 🔧 紧急修复方法：立即解除loading状态
   * 用于用户紧急使用功能菜单
   */
  emergencyFixLoading() {
    console.log('🚨 用户触发紧急修复loading状态')
    
    // 立即设置loading为false
    this.setData({ loading: false })
    
    // 设置基础数据，确保页面能正常显示
    this.safeSetData({
      userInfo: {
        user_id: 'emergency_user',
        phone: '紧急修复模式',
        nickname: '点击重新加载',
        level: 'VIP1',
        avatar: '/images/default-avatar.png'
      },
      totalPoints: 0,
      statistics: {
        totalLottery: 0,
        totalExchange: 0,
        totalUpload: 0,
        thisMonthPoints: 0,
        lotteryTrend: '→',
        exchangeTrend: '→',
        uploadTrend: '→',
        pointsTrend: '→'
      },
      todayEarned: 0,
      todayConsumed: 0,
      pointsRecords: []
    })
    
    wx.showModal({
      title: '✅ 功能菜单已可用',
      content: '页面已进入紧急修复模式！\n\n✅ 所有功能菜单现在都可以正常点击使用\n✅ 抽奖记录、兑换记录、上传记录、积分明细都可以访问\n\n💡 稍后可以下拉刷新重新加载完整数据',
      showCancel: true,
      cancelText: '重新加载',
      confirmText: '开始使用',
      success: (res) => {
        if (res.cancel) {
          // 用户选择重新加载
          this.refreshUserData()
        }
      }
    })
  },

  /**
   * 🔧 测试方法：验证页面修复效果
   * 用于开发测试，确保页面能正常显示
   */
  testPageDisplay() {
    console.log('🧪 开始测试页面显示...')
    
    // 设置测试数据
    this.setData({
      loading: false,
      userInfo: {
        user_id: 'test_123',
        phone: '138****8888',
        nickname: '测试用户',
        level: 'VIP2',
        total_points: 1250
      },
      totalPoints: 1250,
      statistics: {
        totalLottery: 5,
        totalExchange: 3,
        totalUpload: 8,
        thisMonthPoints: 450,
        lotteryTrend: '↑',
        exchangeTrend: '→',
        uploadTrend: '↑',
        pointsTrend: '↑'
      },
      todayEarned: 120,
      todayConsumed: 80,
      pointsRecords: [
        {
          id: 1,
          description: '上传小票奖励',
          points: 50,
          type: 'earn',
          balance_after: 1250,
          created_at: '2024-01-20 10:30:00'
        },
        {
          id: 2,
          description: '抽奖消费',
          points: -30,
          type: 'consume',
          balance_after: 1200,
          created_at: '2024-01-20 09:15:00'
        }
      ]
    })
    
    // 更新成就
    this.updateAchievements()
    
    console.log('✅ 测试数据设置完成')
    
    // 显示测试结果
    wx.showModal({
      title: '🧪 页面测试完成',
      content: `测试数据已加载：\n\n✅ 用户信息：已显示\n✅ 积分余额：1250分\n✅ 统计数据：已显示\n✅ 成就系统：已显示\n✅ 菜单项：已显示\n\n页面应该能正常显示了！`,
      showCancel: true,
      cancelText: '清除测试',
      confirmText: '知道了',
      success: (res) => {
        if (res.cancel) {
          // 清除测试数据，恢复loading状态
          this.setData({
            loading: true,
            userInfo: null,
            totalPoints: 0
          })
          // 重新加载真实数据
          this.initPage()
        }
      }
    })
  }
})