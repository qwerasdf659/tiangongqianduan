// pages/user/user.js - 用户中心页面逻辑（权限简化版v2.2.0 - 完全符合接口对接规范文档）
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
    
    // 🔴 权限简化v2.2.0：简化权限控制字段
    isAdmin: false,               // 🔴 唯一权限标识
    showAdminEntrance: false,     // 🔴 是否显示管理员功能入口
    
    // 统计信息
    userStats: {
      totalUploads: 0,
      approvedUploads: 0,
      totalLotteries: 0,
      totalExchanges: 0,
      joinDays: 0
    },
    
    // 🔧 统计数据
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
    
    // 🔧 菜单项
    menuItems: [],
    
    // 🔧 成就系统
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
    console.log('🔄 用户中心页面加载 - 权限简化版v2.2.0')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    console.log('🎨 用户中心页面渲染完成')
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🔄 用户中心页面显示 - 权限简化版v2.2.0')
    
    // 🔴 权限简化：每次页面显示时检查权限状态
    const userInfo = app.globalData.userInfo
    if (userInfo) {
      this.checkAdminPermission(userInfo)
    }
    
    this.refreshUserData()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('🔄 用户中心页面隐藏')
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('🔄 用户中心页面卸载')
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新用户中心')
    this.refreshUserData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    console.log('🔄 上拉触底，加载更多积分记录')
    this.onLoadMoreRecords()
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
   * 🔴 权限简化v2.2.0：页面初始化逻辑
   */
  initPage() {
    console.log('🔄 开始初始化用户页面 - 权限简化版v2.2.0')
    
    // 🚨 强制超时保护，防止页面永久loading
    setTimeout(() => {
      if (this.data.loading === true) {
        console.warn('🚨 检测到页面loading超时，强制设置为完成状态')
        this.setData({ loading: false })
        
        // 设置安全的默认数据，确保页面能正常显示
        if (!this.data.userInfo || this.data.userInfo.nickname === '加载中...') {
          this.safeSetData({
            userInfo: {
              user_id: 'timeout_user',
              mobile: '数据加载超时',
              nickname: '点击下拉刷新',
              level: 'VIP1',
              avatar_url: '/images/default-avatar.png'
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
            }
          })
        }
        
        wx.showModal({
          title: '🚨 前端页面加载超时',
          content: '【问题诊断】用户页面数据加载超时\n\n【具体原因】\n1. 后端API服务异常 (主要原因)\n2. 网络连接超时\n3. 前端请求卡住\n\n【解决方案】\n• 立即可用：点击"继续使用"正常操作\n• 重新加载：下拉刷新页面\n• 联系支持：如果是后端API问题请联系后端程序员',
          showCancel: true,
          cancelText: '重新加载',
          confirmText: '继续使用',
          success: (res) => {
            if (res.cancel) {
              // 重新加载页面
              this.loadUserData()
            }
          }
        })
      }
    }, 8000) // 8秒超时
    
    // 🔧 开始异步加载数据
    this.loadUserData()
  },

  /**
   * 🔧 加载用户数据
   */
  loadUserData() {
    console.log('📡 开始加载用户数据')
    
    // 🔧 显示加载状态
    this.setData({ loading: true })
    
    // 🔧 并行加载多个数据源 - 修复：正确返回Promise
    return Promise.all([
      this.refreshUserInfo(),
      this.loadUserStatistics(),
      this.loadRecentPointsRecords(),
      this.initMenuItems(),
      this.initAchievements()
    ]).then(() => {
      console.log('✅ 用户数据加载完成')
      this.setData({ loading: false })
    }).catch(error => {
      console.error('❌ 用户数据加载失败:', error)
      this.setData({ loading: false })
      
      // 🔧 显示友好的错误提示
      wx.showModal({
        title: '🚨 数据加载失败',
        content: `用户数据加载遇到问题：\n\n${error.msg || error.message || '未知错误'}\n\n请检查网络连接或稍后重试。`,
        showCancel: true,
        cancelText: '重试',
        confirmText: '知道了',
        success: (res) => {
          if (res.cancel) {
            // 重试加载
            this.loadUserData()
          }
        }
      })
    })
  },

  /**
   * 🔧 刷新用户信息 - 修复字段映射问题
   */
  refreshUserInfo() {
    console.log('📡 获取用户信息')
    
    return userAPI.getUserInfo().then(result => {
      console.log('✅ 用户信息获取成功:', result)
      console.log('🔍 原始用户数据:', result.data)
      
      if (result.code === 0 && result.data) {
        const rawUserInfo = result.data
        
        // 🔧 关键修复：统一字段映射 - 将后端数据格式转换为前端期待格式
        const mappedUserInfo = {
          // 🔴 基础字段映射
          user_id: rawUserInfo.user_id || rawUserInfo.id || 'unknown',
          mobile: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
          nickname: rawUserInfo.nickname || rawUserInfo.nickName || rawUserInfo.name || '匿名用户',
          total_points: parseInt(rawUserInfo.total_points || rawUserInfo.totalPoints || rawUserInfo.points || 0),
          
          // 🔴 权限字段映射
          is_admin: Boolean(rawUserInfo.is_admin || rawUserInfo.isAdmin || false),
          
          // 🔴 头像字段映射
          avatar_url: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
          
          // 🔴 状态字段映射
          status: rawUserInfo.status || rawUserInfo.state || 'active',
          
          // 🔴 时间字段映射
          last_login: rawUserInfo.last_login || rawUserInfo.lastLogin || rawUserInfo.last_login_time,
          created_at: rawUserInfo.created_at || rawUserInfo.createdAt || rawUserInfo.create_time,
          
          // 🔴 额外字段兼容
          level: rawUserInfo.level || 'VIP1',
          avatar: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
          phone: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知'
        }
        
        console.log('🔧 用户信息字段映射结果:', {
          原始: rawUserInfo,
          映射后: mappedUserInfo
        })
        
        // 🔴 权限简化：检查管理员权限
        this.checkAdminPermission(mappedUserInfo)
        
        // 🔧 使用标准setData，确保数据不被过滤
        this.setData({
          userInfo: mappedUserInfo,
          totalPoints: mappedUserInfo.total_points,
          isAdmin: mappedUserInfo.is_admin
        })
        
        // 🔧 更新全局数据
        app.globalData.userInfo = mappedUserInfo
        wx.setStorageSync('user_info', mappedUserInfo)
        
        console.log('✅ 用户信息已更新，映射完成')
      } else {
        throw new Error(result.msg || '用户信息获取失败')
      }
    }).catch(error => {
      console.error('❌ 获取用户信息失败:', error)
      
      // 🔧 尝试使用本地缓存
      const cachedUserInfo = wx.getStorageSync('user_info')
      if (cachedUserInfo) {
        console.log('📦 使用本地缓存的用户信息')
        this.setData({
          userInfo: cachedUserInfo,
          totalPoints: cachedUserInfo.total_points || 0,
          isAdmin: cachedUserInfo.is_admin || false
        })
        this.checkAdminPermission(cachedUserInfo)
      } else {
        // 🔧 设置默认用户信息
        this.setData({
          userInfo: {
            user_id: 'unknown',
            mobile: '未知',
            nickname: '用户信息加载失败',
            avatar_url: '/images/default-avatar.png',
            avatar: '/images/default-avatar.png',
            phone: '未知',
            is_admin: false,
            total_points: 0,
            level: 'VIP1'
          },
          totalPoints: 0,
          isAdmin: false
        })
      }
      
      throw error
    })
  },

  /**
   * 🔧 加载用户统计数据
   */
  loadUserStatistics() {
    console.log('📡 获取用户统计数据')
    
    return userAPI.getStatistics().then(result => {
      console.log('✅ 用户统计数据获取成功:', result)
      
      if (result.code === 0 && result.data) {
        const stats = result.data
        
        // 🔧 更新统计数据
        this.safeSetData({
          statistics: {
            totalLottery: stats.total_lottery || 0,
            totalExchange: stats.total_exchange || 0,
            totalUpload: stats.total_upload || 0,
            thisMonthPoints: stats.this_month_points || 0,
            lotteryTrend: stats.lottery_trend || '→',
            exchangeTrend: stats.exchange_trend || '→',
            uploadTrend: stats.upload_trend || '→',
            pointsTrend: stats.points_trend || '→'
          },
          userStats: {
            totalUploads: stats.total_upload || 0,
            approvedUploads: stats.approved_upload || 0,
            totalLotteries: stats.total_lottery || 0,
            totalExchanges: stats.total_exchange || 0,
            joinDays: stats.join_days || 0
          }
        })
        
        // 🔧 计算今日趋势
        this.calculateTodayTrend()
        
        console.log('✅ 用户统计数据已更新')
      } else {
        throw new Error(result.msg || '统计数据获取失败')
      }
    }).catch(error => {
      console.error('❌ 获取用户统计数据失败:', error)
      
      // 🔧 设置默认统计数据
      this.safeSetData({
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
        userStats: {
          totalUploads: 0,
          approvedUploads: 0,
          totalLotteries: 0,
          totalExchanges: 0,
          joinDays: 0
        }
      })
      
      throw error
    })
  },

  /**
   * 🔧 加载最近积分记录
   */
  loadRecentPointsRecords() {
    console.log('📡 获取最近积分记录')
    
    return userAPI.getPointsRecords(1, 10).then(result => {
      console.log('✅ 积分记录获取成功:', result)
      
      if (result.code === 0 && result.data) {
        this.safeSetData({
          pointsRecords: result.data.records || []
        })
        
        console.log('✅ 积分记录已更新')
      } else {
        throw new Error(result.msg || '积分记录获取失败')
      }
    }).catch(error => {
      console.error('❌ 获取积分记录失败:', error)
      
      // 🔧 设置空的积分记录
      this.safeSetData({
        pointsRecords: []
      })
      
      throw error
    })
  },

  /**
   * 🔧 刷新用户数据
   */
  refreshUserData() {
    console.log('🔄 刷新用户数据')
    
    // 🔧 设置刷新状态
    this.setData({ refreshing: true })
    
    // 🔧 重新加载所有数据 - 修复：正确返回Promise
    return this.loadUserData().finally(() => {
      this.setData({ refreshing: false })
    })
  },

  /**
   * 🔧 格式化时间
   */
  formatTime(timeString) {
    if (!timeString) return '未知时间'
    
    try {
      const date = new Date(timeString)
      const now = new Date()
      const diff = now - date
      
      if (diff < 60000) {
        return '刚刚'
      } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}分钟前`
      } else if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`
      } else {
        return `${Math.floor(diff / 86400000)}天前`
      }
    } catch (error) {
      console.error('❌ 时间格式化失败:', error)
      return '时间格式错误'
    }
  },

  /**
   * 🔧 菜单项点击处理
   */
  onMenuItemTap(e) {
    const menuId = e.currentTarget.dataset.id
    const menuItem = this.data.menuItems.find(item => item.id === menuId)
    
    if (!menuItem) {
      console.error('❌ 菜单项不存在:', menuId)
      return
    }
    
    console.log('🔄 菜单项点击:', menuItem.name)
    
    // 🔧 处理不同类型的菜单项
    if (menuItem.type === 'page') {
      // 页面跳转
      wx.navigateTo({
        url: menuItem.url,
        fail: (error) => {
          console.error('❌ 页面跳转失败:', error)
          wx.showToast({
            title: '页面跳转失败',
            icon: 'none'
          })
        }
      })
    } else if (menuItem.type === 'action') {
      // 执行动作
      if (menuItem.action && typeof this[menuItem.action] === 'function') {
        this[menuItem.action]()
      } else {
        console.error('❌ 动作方法不存在:', menuItem.action)
      }
    } else if (menuItem.type === 'external') {
      // 外部链接
      wx.showModal({
        title: '外部链接',
        content: `是否打开外部链接：${menuItem.name}？`,
        showCancel: true,
        success: (res) => {
          if (res.confirm) {
            // 这里可以处理外部链接
            console.log('打开外部链接:', menuItem.url)
          }
        }
      })
    }
  },

  /**
   * 🔧 头像点击处理
   */
  onAvatarTap() {
    console.log('🔄 头像点击')
    
    wx.showActionSheet({
      itemList: ['拍照', '从相册选择'],
      success: (res) => {
        if (res.tapIndex === 0) {
          // 拍照
          this.chooseAvatar('camera')
        } else if (res.tapIndex === 1) {
          // 从相册选择
          this.chooseAvatar('album')
        }
      }
    })
  },

  /**
   * 🔧 选择头像
   */
  chooseAvatar(sourceType) {
    console.log('📷 选择头像:', sourceType)
    
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: sourceType === 'camera' ? ['camera'] : ['album'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.uploadAvatar(tempFilePath)
      },
      fail: (error) => {
        console.error('❌ 选择头像失败:', error)
        wx.showToast({
          title: '选择头像失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 🔧 上传头像
   */
  uploadAvatar(filePath) {
    console.log('📡 上传头像:', filePath)
    
    wx.showLoading({
      title: '上传中...',
      mask: true
    })
    
    userAPI.uploadAvatar(filePath).then(result => {
      wx.hideLoading()
      
      console.log('✅ 头像上传成功:', result)
      
      if (result.code === 0 && result.data) {
        // 🔧 更新用户头像
        const userInfo = { ...this.data.userInfo }
        userInfo.avatar_url = result.data.avatar_url
        
        this.safeSetData({
          userInfo: userInfo
        })
        
        // 🔧 更新全局数据
        app.globalData.userInfo = userInfo
        wx.setStorageSync('user_info', userInfo)
        
        wx.showToast({
          title: '头像更新成功',
          icon: 'success'
        })
      } else {
        throw new Error(result.msg || '头像上传失败')
      }
    }).catch(error => {
      wx.hideLoading()
      
      console.error('❌ 头像上传失败:', error)
      
      let errorMessage = '头像上传失败'
      if (error.isNetworkError) {
        errorMessage = '网络连接失败，请重试'
      } else if (error.isBackendError) {
        errorMessage = error.msg || '服务器异常，请稍后重试'
      }
      
      wx.showModal({
        title: '头像上传失败',
        content: errorMessage,
        showCancel: false,
        confirmText: '我知道了'
      })
    })
  },

  /**
   * 🔧 手机号点击处理
   */
  onMobileTap() {
    console.log('🔄 手机号点击')
    
    wx.showModal({
      title: '联系客服',
      content: '如需更换手机号，请联系客服处理。',
      showCancel: true,
      cancelText: '取消',
      confirmText: '联系客服',
      success: (res) => {
        if (res.confirm) {
          this.onContactService()
        }
      }
    })
  },

  /**
   * 🔧 积分点击处理
   */
  onPointsTap() {
    console.log('🔄 积分点击')
    
    wx.navigateTo({
      url: '/pages/points-detail/points-detail'
    })
  },

  /**
   * 🔧 加载更多积分记录
   */
  onLoadMoreRecords() {
    console.log('📡 加载更多积分记录')
    
    // 🔧 这里可以实现分页加载更多积分记录
    const currentPage = Math.floor(this.data.pointsRecords.length / 10) + 1
    
    userAPI.getPointsRecords(currentPage, 10).then(result => {
      console.log('✅ 更多积分记录加载成功:', result)
      
      if (result.code === 0 && result.data && result.data.records.length > 0) {
        // 🔧 合并新的记录
        const newRecords = [...this.data.pointsRecords, ...result.data.records]
        this.safeSetData({
          pointsRecords: newRecords
        })
        
        wx.showToast({
          title: `加载了${result.data.records.length}条记录`,
          icon: 'none'
        })
      } else {
        wx.showToast({
          title: '没有更多记录了',
          icon: 'none'
        })
      }
    }).catch(error => {
      console.error('❌ 加载更多积分记录失败:', error)
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    })
  },

  /**
   * 🔧 WebSocket消息处理
   */
  onWebSocketMessage(eventName, data) {
    console.log('📡 用户中心收到WebSocket消息:', eventName, data)
    
    // 🔧 处理用户相关的实时消息
    if (eventName === 'points_update' && data) {
      // 积分更新
      console.log('💰 收到积分更新通知:', data)
      
      if (data.user_id === this.data.userInfo?.user_id) {
        // 🔧 更新积分显示
        this.safeSetData({
          totalPoints: data.total_points || this.data.totalPoints
        })
        
        // 🔧 显示积分变化提示
        if (data.change_amount) {
          const changeText = data.change_amount > 0 ? `+${data.change_amount}` : `${data.change_amount}`
          wx.showToast({
            title: `积分${changeText}`,
            icon: 'none',
            duration: 2000
          })
        }
        
        // 🔧 刷新积分记录
        this.loadRecentPointsRecords()
      }
    } else if (eventName === 'user_info_update' && data) {
      // 用户信息更新
      console.log('👤 收到用户信息更新通知:', data)
      
      if (data.user_id === this.data.userInfo?.user_id) {
        // 🔧 刷新用户信息
        this.refreshUserInfo()
      }
    } else if (eventName === 'review_completed' && data) {
      // 审核完成
      console.log('📷 收到审核完成通知:', data)
      
      if (data.user_id === this.data.userInfo?.user_id) {
        // 🔧 显示审核结果
        const statusText = data.status === 'approved' ? '审核通过' : '审核未通过'
        wx.showToast({
          title: `照片${statusText}`,
          icon: data.status === 'approved' ? 'success' : 'none',
          duration: 2000
        })
        
        // 🔧 刷新数据
        this.refreshUserData()
      }
    }
  },

  /**
   * 🔧 刷新统计数据
   */
  onRefreshStats() {
    console.log('🔄 手动刷新统计数据')
    
    wx.showLoading({
      title: '刷新中...',
      mask: true
    })
    
    this.loadUserStatistics().then(() => {
      wx.hideLoading()
      wx.showToast({
        title: '刷新成功',
        icon: 'success'
      })
    }).catch(error => {
      wx.hideLoading()
      console.error('❌ 刷新统计数据失败:', error)
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      })
    })
  },

  /**
   * 🔧 意见反馈
   */
  onFeedback() {
    console.log('💬 意见反馈')
    
    wx.showModal({
      title: '意见反馈',
      content: '感谢您的反馈！请通过以下方式联系我们：\n\n• 客服热线：400-123-4567\n• 邮箱：feedback@example.com\n• 微信群：扫描二维码加入',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /**
   * 🔧 初始化成就系统
   */
  initAchievements() {
    console.log('🏆 初始化成就系统')
    
    // 🔧 设置成就数据
    const achievements = [
      {
        id: 'first_login',
        name: '初来乍到',
        description: '首次登录系统',
        icon: '🎉',
        unlocked: true,
        progress: 100
      },
      {
        id: 'first_lottery',
        name: '抽奖新手',
        description: '完成首次抽奖',
        icon: '🎰',
        unlocked: this.data.statistics.totalLottery > 0,
        progress: this.data.statistics.totalLottery > 0 ? 100 : 0
      },
      {
        id: 'lottery_master',
        name: '抽奖达人',
        description: '累计抽奖10次',
        icon: '🎯',
        unlocked: this.data.statistics.totalLottery >= 10,
        progress: Math.min(this.data.statistics.totalLottery * 10, 100)
      },
      {
        id: 'first_exchange',
        name: '兑换新手',
        description: '完成首次兑换',
        icon: '🎁',
        unlocked: this.data.statistics.totalExchange > 0,
        progress: this.data.statistics.totalExchange > 0 ? 100 : 0
      },
      {
        id: 'upload_rookie',
        name: '上传新手',
        description: '完成首次照片上传',
        icon: '📷',
        unlocked: this.data.statistics.totalUpload > 0,
        progress: this.data.statistics.totalUpload > 0 ? 100 : 0
      },
      {
        id: 'points_collector',
        name: '积分收集者',
        description: '累计获得1000积分',
        icon: '💰',
        unlocked: this.data.totalPoints >= 1000,
        progress: Math.min(this.data.totalPoints / 10, 100)
      }
    ]
    
    const unlockedCount = achievements.filter(a => a.unlocked).length
    
    this.safeSetData({
      achievements: achievements,
      unlockedAchievements: unlockedCount,
      totalAchievements: achievements.length
    })
    
    return Promise.resolve()
  },

  /**
   * 🔧 更新成就状态
   */
  updateAchievements() {
    console.log('🏆 更新成就状态')
    
    // 🔧 检查成就解锁条件
    const achievements = this.data.achievements.map(achievement => {
      let unlocked = achievement.unlocked
      let progress = achievement.progress
      
      switch (achievement.id) {
        case 'first_lottery':
          unlocked = this.data.statistics.totalLottery > 0
          progress = unlocked ? 100 : 0
          break
        case 'lottery_master':
          unlocked = this.data.statistics.totalLottery >= 10
          progress = Math.min(this.data.statistics.totalLottery * 10, 100)
          break
        case 'first_exchange':
          unlocked = this.data.statistics.totalExchange > 0
          progress = unlocked ? 100 : 0
          break
        case 'upload_rookie':
          unlocked = this.data.statistics.totalUpload > 0
          progress = unlocked ? 100 : 0
          break
        case 'points_collector':
          unlocked = this.data.totalPoints >= 1000
          progress = Math.min(this.data.totalPoints / 10, 100)
          break
      }
      
      return { ...achievement, unlocked, progress }
    })
    
    const unlockedCount = achievements.filter(a => a.unlocked).length
    
    this.safeSetData({
      achievements: achievements,
      unlockedAchievements: unlockedCount
    })
  },

  /**
   * 🔧 初始化菜单项
   */
  initMenuItems() {
    console.log('📋 初始化菜单项')
    
    // 🔧 基础菜单项
    const menuItems = [
      {
        id: 'points-detail',
        name: '积分明细',
        icon: '💰',
        type: 'page',
        url: '/pages/points-detail/points-detail'
      },
      {
        id: 'lottery-records',
        name: '抽奖记录',
        icon: '🎰',
        type: 'page',
        url: '/pages/records/lottery-records'
      },
      {
        id: 'exchange-records',
        name: '兑换记录',
        icon: '🎁',
        type: 'page',
        url: '/pages/records/exchange-records'
      },
      {
        id: 'upload-records',
        name: '上传记录',
        icon: '📷',
        type: 'page',
        url: '/pages/records/upload-records'
      },
      {
        id: 'invite-friend',
        name: '邀请好友',
        icon: '👥',
        type: 'action',
        action: 'onInviteFriend'
      },
      {
        id: 'contact-service',
        name: '联系客服',
        icon: '📞',
        type: 'action',
        action: 'onContactService'
      },
      {
        id: 'feedback',
        name: '意见反馈',
        icon: '💬',
        type: 'action',
        action: 'onFeedback'
      }
    ]
    
    // 🔴 功能菜单中的管理员入口已移除 - 保留底部单独的管理员功能入口
    
    this.safeSetData({
      menuItems: menuItems
    })
    
    return Promise.resolve()
  },

  /**
   * 🔧 邀请好友
   */
  onInviteFriend() {
    console.log('👥 邀请好友')
    
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    
    wx.showModal({
      title: '邀请好友',
      content: '点击右上角分享按钮，邀请好友一起参与积分抽奖！',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔧 联系客服
   */
  onContactService() {
    console.log('📞 联系客服')
    
    wx.showModal({
      title: '联系客服',
      content: '客服热线：400-123-4567\n\n工作时间：周一至周日 9:00-18:00\n\n您也可以通过小程序内的意见反馈功能联系我们。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔧 退出登录
   */
  onLogout() {
    console.log('🔄 退出登录')
    
    wx.showModal({
      title: '确认退出',
      content: '是否确认退出登录？',
      showCancel: true,
      cancelText: '取消',
      confirmText: '退出',
      success: (res) => {
        if (res.confirm) {
          // 🔧 清理用户数据
          app.logout()
          
          // 🔧 跳转到登录页
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      }
    })
  },

  /**
   * 🔴 权限简化v2.2.0：检查管理员权限
   */
  checkAdminPermission(userInfo) {
    console.log('🔐 检查管理员权限 - 权限简化版v2.2.0:', {
      user_id: userInfo.user_id,
      is_admin: userInfo.is_admin
    })
    
    // 🔴 权限简化：只检查is_admin字段
    const isAdmin = userInfo.is_admin || false
    
    this.safeSetData({
      isAdmin: isAdmin,
      showAdminEntrance: isAdmin
    })
    
    // 🔧 如果权限状态发生变化，重新初始化菜单
    if (this.data.isAdmin !== isAdmin) {
      this.initMenuItems()
    }
    
    console.log('🔐 权限检查完成:', {
      isAdmin: isAdmin,
      showAdminEntrance: isAdmin
    })
  },

  /**
   * 🔴 权限简化v2.2.0：管理员功能入口
   */
  onAdminEntrance() {
    console.log('👑 管理员功能入口点击 - 权限简化版v2.2.0')
    
    // 🔧 再次验证管理员权限
    if (!this.data.isAdmin) {
      wx.showModal({
        title: '🔐 权限不足',
        content: '您没有管理员权限，无法访问管理功能。',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }
    
    // 🔧 跳转到管理员功能页面
    wx.switchTab({
      url: '/pages/merchant/merchant',
      success: () => {
        console.log('✅ 成功跳转到管理员功能页面')
      },
      fail: (error) => {
        console.error('❌ 跳转管理员功能页面失败:', error)
        this.retryAdminNavigation()
      }
    })
  },

  /**
   * 🔧 重试管理员页面跳转
   */
  retryAdminNavigation() {
    console.log('🔄 重试管理员页面跳转')
    
    wx.showModal({
      title: '跳转失败',
      content: '管理员功能页面跳转失败，是否重试？',
      showCancel: true,
      cancelText: '取消',
      confirmText: '重试',
      success: (res) => {
        if (res.confirm) {
          // 🔧 尝试使用reLaunch
          wx.reLaunch({
            url: '/pages/merchant/merchant',
            success: () => {
              console.log('✅ 重试跳转成功')
            },
            fail: (error) => {
              console.error('❌ 重试跳转也失败:', error)
              wx.showModal({
                title: '跳转失败',
                content: '管理员功能页面跳转失败，请尝试重启小程序。',
                showCancel: false,
                confirmText: '我知道了'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 🔧 复制邀请码
   */
  onCopyInviteCode() {
    console.log('📋 复制邀请码')
    
    const inviteCode = `INVITE_${this.data.userInfo?.user_id || 'UNKNOWN'}`
    
    wx.setClipboardData({
      data: inviteCode,
      success: () => {
        wx.showToast({
          title: '邀请码已复制',
          icon: 'success'
        })
      },
      fail: (error) => {
        console.error('❌ 复制邀请码失败:', error)
        wx.showToast({
          title: '复制失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 🔧 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '餐厅积分抽奖系统',
      query: `invite_code=INVITE_${this.data.userInfo?.user_id || 'UNKNOWN'}`,
      imageUrl: '/images/share-timeline.png'
    }
  },

  /**
   * 🔧 计算今日趋势 - 修复：从后端获取真实数据
   */
  calculateTodayTrend() {
    console.log('📊 计算今日趋势 - 开始调用API')
    
    // 🔴 修复：从后端API获取真实的今日积分数据，而不是使用硬编码示例数据
    return userAPI.getTodayPointsTrend().then(result => {
      console.log('✅ 今日积分趋势API响应:', JSON.stringify(result, null, 2))
      
      if (result.code === 0 && result.data) {
        const trendData = result.data
        
        console.log('🔍 后端返回的积分数据:', {
          today_earned: trendData.today_earned,
          today_consumed: trendData.today_consumed,
          原始数据: trendData
        })
        
        const earnedValue = trendData.today_earned || 0
        const consumedValue = trendData.today_consumed || 0
        
        this.safeSetData({
          todayEarned: earnedValue,
          todayConsumed: consumedValue
        })
        
        console.log('✅ 今日积分趋势已更新 - 实际设置的值:', {
          todayEarned: earnedValue,
          todayConsumed: consumedValue
        })
        
        // 🔧 显示用户提示，确认数据正确
        if (earnedValue === 0 && consumedValue === 0) {
          console.log('✅ 确认：今日无积分变动，显示0是正确的')
        }
      } else {
        console.error('❌ API返回错误:', result.msg || '今日积分趋势获取失败')
        throw new Error(result.msg || '今日积分趋势获取失败')
      }
    }).catch(error => {
      console.error('❌ 获取今日积分趋势失败:', error)
      
      // 🔧 API调用失败时设置为0，确保显示正确
      this.safeSetData({
        todayEarned: 0,
        todayConsumed: 0
      })
      
      console.log('⚠️ 今日积分趋势设置为默认值（API调用失败）')
      
      // 🔧 显示错误提示给用户
      wx.showToast({
        title: '积分数据获取失败',
        icon: 'none',
        duration: 2000
      })
    })
  },

  /**
   * 🔧 安全的setData方法 - 修复过度过滤问题
   */
  safeSetData(data) {
    const cleanUndefined = (obj) => {
      // 🔧 修复：对于null值不要过滤，只过滤undefined
      if (obj === undefined) {
        return undefined // 让上层决定是否过滤
      }
      if (obj === null) {
        return null // 保留null值
      }
      
      if (Array.isArray(obj)) {
        return obj.filter(item => item !== undefined).map(cleanUndefined)
      } else if (obj && typeof obj === 'object') {
        const cleaned = {}
        Object.keys(obj).forEach(key => {
          const value = obj[key]
          // 🔧 修复：只过滤undefined，保留null、0、false、空字符串等有效值
          if (value !== undefined) {
            const cleanedValue = cleanUndefined(value)
            if (cleanedValue !== undefined) {
              cleaned[key] = cleanedValue
            }
          }
        })
        return cleaned
      }
      return obj
    }
    
    const cleanData = cleanUndefined(data)
    console.log('🔧 安全数据设置:', { 
      原始: Object.keys(data), 
      清理后: Object.keys(cleanData || {}),
      保留的有效值: cleanData
    })
    
    // 🔧 修复：如果清理后的数据为空对象或undefined，不要设置
    if (cleanData && typeof cleanData === 'object' && Object.keys(cleanData).length > 0) {
      this.setData(cleanData)
    } else {
      console.warn('⚠️ 清理后的数据为空，跳过setData操作')
    }
  },

  /**
   * 🔧 紧急修复loading状态
   */
  emergencyFixLoading() {
    console.warn('🚨 紧急修复loading状态')
    
    this.setData({
      loading: false,
      refreshing: false
    })
    
    // 🔧 设置最基本的用户信息
    if (!this.data.userInfo) {
      this.safeSetData({
        userInfo: {
          user_id: 'emergency_user',
          mobile: '紧急修复模式',
          nickname: '请下拉刷新',
          avatar_url: '/images/default-avatar.png',
          is_admin: false
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
        }
      })
    }
    
    wx.showToast({
      title: '已修复页面状态',
      icon: 'none'
    })
  },

  /**
   * 🔧 测试页面显示
   */
  testPageDisplay() {
    console.log('🧪 测试页面显示')
    
    // 🔧 显示当前页面状态
    const currentState = {
      loading: this.data.loading,
      userInfo: this.data.userInfo ? '已加载' : '未加载',
      totalPoints: this.data.totalPoints,
      isAdmin: this.data.isAdmin,
      menuItems: this.data.menuItems.length,
      pointsRecords: this.data.pointsRecords.length
    }
    
    console.log('📊 当前页面状态:', currentState)
    
    wx.showModal({
      title: '页面状态测试',
      content: JSON.stringify(currentState, null, 2),
      showCancel: false,
      confirmText: '确定'
    })
  },

  /**
   * 🔧 调试积分显示问题 - 手动触发积分数据刷新和诊断
   */
  debugPointsDisplay() {
    console.log('🔍 开始调试积分显示问题')
    
    // 1. 检查当前数据状态
    console.log('📊 当前页面数据状态:', {
      todayEarned: this.data.todayEarned,
      todayConsumed: this.data.todayConsumed,
      totalPoints: this.data.totalPoints
    })
    
    // 2. 检查用户信息
    const userInfo = wx.getStorageSync('userInfo')
    console.log('👤 用户信息:', {
      phone: userInfo?.phone,
      is_admin: userInfo?.is_admin,
      total_points: userInfo?.total_points
    })
    
    // 3. 手动重新调用API
    console.log('🔄 手动重新调用积分趋势API...')
    
    wx.showLoading({
      title: '调试中...',
      mask: true
    })
    
    return this.calculateTodayTrend().then(() => {
      wx.hideLoading()
      
      console.log('✅ 调试完成，当前数据状态:', {
        todayEarned: this.data.todayEarned,
        todayConsumed: this.data.todayConsumed
      })
      
      // 显示调试结果
      wx.showModal({
        title: '积分调试结果',
        content: `今日获得：${this.data.todayEarned || 0}积分\n今日消费：${this.data.todayConsumed || 0}积分\n\n如果显示0是正确的，说明您今日确实无积分变动。\n\n请查看控制台日志了解详细信息。`,
        showCancel: false,
        confirmText: '知道了'
      })
    }).catch(error => {
      wx.hideLoading()
      
      console.error('❌ 调试失败:', error)
      
      wx.showModal({
        title: '调试失败',
        content: `调试过程中发生错误：${error.message}\n\n请查看控制台日志了解详细信息。`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  /**
   * 🔧 诊断权限状态
   */
  diagnosePermissionStatus() {
    console.log('🔍 诊断权限状态')
    
    const userInfo = app.globalData.userInfo
    const localUserInfo = wx.getStorageSync('user_info')
    
    const diagnosis = {
      globalUserInfo: userInfo ? {
        user_id: userInfo.user_id,
        is_admin: userInfo.is_admin,
        mobile: userInfo.mobile
      } : null,
      localUserInfo: localUserInfo ? {
        user_id: localUserInfo.user_id,
        is_admin: localUserInfo.is_admin,
        mobile: localUserInfo.mobile
      } : null,
      pageIsAdmin: this.data.isAdmin,
      showAdminEntrance: this.data.showAdminEntrance
    }
    
    console.log('🔍 权限状态诊断:', diagnosis)
    
    wx.showModal({
      title: '权限状态诊断',
      content: JSON.stringify(diagnosis, null, 2),
      showCancel: false,
      confirmText: '确定'
    })
  }
})