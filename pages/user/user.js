// pages/user/user.js - 用户中心页面逻辑
const app = getApp()
const { userAPI } = require('../../utils/api')
const { createPermissionManager } = require('../../utils/permission-manager')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: null,
    totalPoints: 0,
    
    // 🔐 权限控制 - 新增管理员权限判断
    isAdmin: false,        // 管理员权限标识
    isMerchant: false,     // 商家权限标识
    showMerchantEntrance: false, // 是否显示商家管理入口
    
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
   * 🔧 修复：正确的页面初始化 - 使用权限管理工具类
   */
  initPage() {
    console.log('🔄 开始初始化用户页面...')
    
    // 🚨 立即修复：强制超时保护，防止页面永久loading
    setTimeout(() => {
      if (this.data.loading === true) {
        console.warn('🚨 检测到页面loading超时，强制设置为完成状态')
        this.setData({ loading: false })
        
        // 设置安全的默认数据，确保页面能正常显示
        if (!this.data.userInfo || this.data.userInfo.nickname === '加载中...') {
          this.safeSetData({
            userInfo: {
              user_id: 'timeout_user',
              phone: '数据加载超时',
              nickname: '点击下拉刷新',
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
              this.refreshUserData()
            }
          }
        })
      }
    }, 8000) // 8秒强制超时

    // 🔧 修复：添加所有必要的初始化方法调用
    // 1. 初始化基础UI数据（这些不会失败）
    this.initMenuItems()
    this.initAchievements()
    this.calculateTodayTrend()
    
    // 2. 从全局获取用户信息并进行权限判断
    const globalUserInfo = app.globalData.userInfo
    if (globalUserInfo) {
      const permissionManager = createPermissionManager(globalUserInfo)
      const permissionStatus = permissionManager.getPermissionStatus()
      
      console.log('🔐 用户页面权限判断结果:', {
        userInfo: {
          user_id: globalUserInfo?.user_id,
          mobile: globalUserInfo?.mobile?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
          is_admin: globalUserInfo?.is_admin,
          is_merchant: globalUserInfo?.is_merchant,
          total_points: globalUserInfo?.total_points
        },
        permissionStatus: permissionStatus
      })
      
      this.setData({
        userInfo: globalUserInfo,
        totalPoints: globalUserInfo.total_points || 0,
        // 🔐 v2.0 权限状态
        isAdmin: permissionStatus.isAdmin,
        isMerchant: permissionStatus.isMerchant,
        showMerchantEntrance: permissionStatus.showMerchantEntrance
      })
      
      console.log('🔐 初始化权限判断 v2.0 (工具类):', permissionStatus)
    }
    
    // 3. 🚨 修复：限制API调用超时时间，加载完整用户数据（添加错误处理）
    const loadDataTimeout = setTimeout(() => {
      console.warn('🚨 API调用超时，停止loading状态')
      this.setData({ loading: false })
    }, 6000) // 6秒API超时
    
    this.loadUserData().then(() => {
      clearTimeout(loadDataTimeout)
    }).catch((error) => {
      clearTimeout(loadDataTimeout)
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
          title: '🚨 后端API请求超时',
          content: '【问题诊断】用户数据API请求超时\n\n【具体原因】\n• 后端API服务不可用 (最可能)\n• 网络连接断开\n• API响应时间过长\n\n【当前状态】\n✅ 页面功能菜单可正常使用\n⚠️ 用户数据显示默认值\n\n【解决方案】\n如果是后端问题请联系后端程序员检查API服务',
          showCancel: true,
          cancelText: '重新请求',
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
      
      // 🔐 v2.0 使用权限管理工具类
      const permissionManager = createPermissionManager(userInfo)
      const permissionStatus = permissionManager.getPermissionStatus()
      
      console.log('🔐 用户信息刷新 - 权限判断结果:', {
        userInfo: {
          user_id: userInfo?.user_id,
          mobile: userInfo?.mobile?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
          is_admin: userInfo?.is_admin,
          is_merchant: userInfo?.is_merchant,
          total_points: totalPoints
        },
        permissionStatus: permissionStatus
      })
      
      console.log('💰 用户页面数据验证结果:', { 
        originalPoints: userInfo.total_points,
        validatedPoints: totalPoints,
        userInfoValid: !!userInfo
      })
      
      this.safeSetData({
        userInfo: userInfo,
        totalPoints: totalPoints,
        // 🔐 更新权限状态
        isAdmin: permissionStatus.isAdmin,
        isMerchant: permissionStatus.isMerchant,
        showMerchantEntrance: permissionStatus.showMerchantEntrance
      })
      
      // 🔧 更新全局数据
      app.globalData.userInfo = {
        ...app.globalData.userInfo,
        ...userInfo
      }
      
      console.log('✅ 用户信息刷新完成，权限状态已更新')
      
      return userInfo
    }).catch((error) => {
      console.error('❌ 刷新用户信息失败:', error)
      
      // 🔧 增强错误处理 - 保留现有数据，只显示错误提示
      wx.showToast({
        title: '用户信息更新失败',
        icon: 'none'
      })
      
      throw error
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
   * 🔐 检查超级管理员权限
   * v2.0 二元权限模型：必须同时拥有is_admin=true和is_merchant=true
   */
  checkAdminPermission(userInfo) {
    if (!userInfo) {
      console.log('❌ 用户信息为空，拒绝权限')
      return false
    }
    
    // 🔐 二元权限验证：必须同时拥有管理员和商家权限
    const isSuperAdmin = (userInfo.is_admin === true && userInfo.is_merchant === true)
    
    if (isSuperAdmin) {
      console.log('✅ 超级管理员权限确认 - 同时拥有is_admin和is_merchant权限')
      return true
    }
    
    // 🔐 权限不足：记录详细的权限状态
    console.log('❌ 权限不足，二元权限验证失败:', {
      user_id: userInfo.user_id,
      is_admin: userInfo.is_admin,
      is_merchant: userInfo.is_merchant,
      isSuperAdmin: isSuperAdmin,
      mobile: userInfo.mobile ? userInfo.mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : '无',
      permissionModel: 'v2.0_binary_permission'
    })
    return false
  },

  /**
   * 商家管理入口
   */
  onMerchantEntrance() {
    console.log('🏪 用户点击商家管理入口')
    
    // 🔐 v2.0 使用权限管理工具类进行权限检查
    const permissionManager = createPermissionManager(this.data.userInfo)
    
    if (!permissionManager.checkFeatureAccess('商家管理')) {
      console.log('❌ 商家管理权限检查失败')
      return
    }
    
    console.log('✅ 商家管理权限检查通过，开始跳转...')
    
    // 🔧 添加loading提示，改善用户体验
    wx.showLoading({
      title: '正在进入商家管理...',
      mask: true
    })
    
    // 🔧 优化：设置较长的超时时间，并添加更详细的错误处理
    wx.navigateTo({
      url: '/pages/merchant/merchant',
      success: () => {
        wx.hideLoading()
        console.log('✅ 成功跳转到商家管理页面')
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('❌ 跳转商家页面失败:', error)
        
        // 🔧 根据不同错误类型提供不同的解决方案
        let errorMsg = '跳转失败，请重试'
        let retryAction = null
        
        if (error.errMsg.includes('timeout')) {
          errorMsg = '页面加载超时，可能是因为商家页面数据较多'
          retryAction = () => {
            // 延迟重试，给页面更多时间
            setTimeout(() => {
              this.retryMerchantNavigation()
            }, 1000)
          }
        } else if (error.errMsg.includes('fail')) {
          errorMsg = '页面跳转失败，请检查网络连接'
        }
        
        wx.showModal({
          title: '🚨 跳转商家管理失败',
          content: `${errorMsg}\n\n详细错误：${error.errMsg}\n\n建议：\n• 检查网络连接状态\n• 稍后重试\n• 如果持续失败，请联系技术支持`,
          showCancel: !!retryAction,
          cancelText: '稍后重试',
          confirmText: retryAction ? '立即重试' : '知道了',
          success: (res) => {
            if (res.confirm && retryAction) {
              retryAction()
            }
          }
        })
      }
    })
  },

  /**
   * 🔧 新增：重试商家页面跳转
   */
  retryMerchantNavigation() {
    console.log('🔄 重试跳转商家管理页面...')
    
    wx.showLoading({
      title: '重试中...',
      mask: true
    })
    
    // 给商家页面更多加载时间
    setTimeout(() => {
      wx.navigateTo({
        url: '/pages/merchant/merchant',
        success: () => {
          wx.hideLoading()
          console.log('✅ 重试成功，已进入商家管理页面')
          
          wx.showToast({
            title: '跳转成功',
            icon: 'success'
          })
        },
        fail: (error) => {
          wx.hideLoading()
          console.error('❌ 重试跳转仍然失败:', error)
          
          wx.showModal({
            title: '❌ 重试失败',
            content: '多次尝试跳转商家管理页面均失败。\n\n可能原因：\n• 页面代码存在问题\n• 设备性能不足\n• 网络环境不稳定\n\n请联系技术支持解决。',
            showCancel: false,
            confirmText: '知道了'
          })
        }
      })
    }, 500)
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
    // 🔴 删除违规代码：严禁设置测试数据
    console.log('🚨 测试功能已禁用 - 根据项目安全规则，严禁使用Mock数据')
    
    wx.showModal({
      title: '功能已禁用',
      content: '根据项目安全规则，已禁用测试数据功能。\n\n所有用户数据均来自后端真实API。\n\n如需获取数据，请下拉刷新页面。',
      showCancel: true,
      cancelText: '返回',
      confirmText: '刷新数据',
      success: (res) => {
        if (res.confirm) {
          // 重新加载真实数据
          this.refreshUserData()
        }
      }
    })
  }
})