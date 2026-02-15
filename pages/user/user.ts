// pages/user/user.ts - 用户中心页面 + MobX响应式状态
const app = getApp()
// 统一工具函数导入（从utils/index.ts）
const { API, Logger } = require('../../utils/index')
const log = Logger.createLogger('user')
// MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

/** loading安全超时时间（毫秒），防止loading遮罩层永远不消失导致页面无法操作 */
const LOADING_SAFETY_TIMEOUT = 8000

/**
 * 用户中心页面 - 餐厅积分抽奖系统
 * 功能说明：
 * - 我的积分（完整的积分展示和趋势）
 * - 功能菜单（积分明细、我的库存、交易记录、消费记录、联系客服、退出登录）
 * - 多角色权限（普通用户/商家店员/商家店长/超级管理员）
 */
Page({
  data: {
    // 用户基础信息
    isLoggedIn: false,
    userInfo: null as any,

    // 多角色权限标识（从JWT Token中的role_level判断）
    // isMerchant = role_level >= 20（商家店员及以上，可访问消费录入、扫码核销）
    // isManager  = role_level >= 40（商家店长及以上）
    // isAdmin    = role_level >= 100（管理员，可访问审批管理 - 后端console域限制）
    isMerchant: false,
    isManager: false,
    isAdmin: false,
    roleLevel: 0,

    // 积分信息（后端API字段: available_amount, today_earned, today_consumed）
    totalPoints: 0,
    todayEarned: 0,
    todayConsumed: 0,

    // 功能菜单配置
    menuItems: [
      {
        id: 'points-detail',
        name: '积分明细',
        description: '查看积分获得和消费记录',
        icon: '💰',
        color: '#4CAF50',
        type: 'page',
        url: '/pages/points-detail/points-detail'
      },
      {
        id: 'my-inventory',
        name: '我的库存',
        description: '管理已兑换商品库存',
        icon: '📦',
        color: '#00BCD4',
        type: 'page',
        url: '/pages/trade/inventory/inventory'
      },
      {
        id: 'trade-records',
        name: '交易记录',
        description: '查看完整交易历史记录',
        icon: '📊',
        color: '#3F51B5',
        type: 'page',
        url: '/pages/records/trade-upload-records/trade-upload-records?tab=0'
      },
      {
        id: 'consumption-records',
        name: '消费记录',
        description: '查看消费积分记录',
        icon: '🧾',
        color: '#9C27B0',
        type: 'page',
        url: '/pages/records/trade-upload-records/trade-upload-records?tab=1'
      },
      {
        id: 'contact-service',
        name: '联系客服',
        description: '在线客服服务支持',
        icon: '📞',
        color: '#607D8B',
        type: 'action',
        action: 'onContactService'
      },
      {
        id: 'logout',
        name: '退出登录',
        description: '安全退出当前账号',
        icon: '🚪',
        color: '#F44336',
        type: 'action',
        action: 'logout'
      }
    ] as any[],

    // 页面状态
    loading: true,
    refreshing: false
  },

  /** loading安全超时定时器ID */
  loadingSafetyTimer: null as any,

  /**
   * 生命周期函数 - 监听页面加载
   * 页面首次加载时调用，执行用户中心页面初始化操作
   */
  onLoad() {
    log.info('👤 用户中心页面加载')

    // MobX Store绑定 - 用户状态和积分余额自动同步
    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: ['setLoginState', 'clearLoginState', 'updateUserInfo']
    })
    this.pointsBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: {
        totalPoints: () => pointsStore.availableAmount,
        frozenPoints: () => pointsStore.frozenAmount
      },
      actions: ['setBalance']
    })

    this.initializePage()
  },

  /**
   * 生命周期函数 - 监听页面显示
   * 每次页面显示时调用（包括从其他页面返回、从后台切换到前台）
   */
  onShow() {
    log.info('👤 用户中心页面显示')
    this.updateUserStatus()
    if (this.data.isLoggedIn) {
      this.refreshUserData()
    }
  },

  /** 页面卸载时销毁Store绑定和定时器，避免内存泄漏 */
  onUnload() {
    this.clearLoadingSafetyTimer()
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
    if (this.pointsBindings) {
      this.pointsBindings.destroyStoreBindings()
    }
  },

  /** 启动loading安全超时定时器，防止loading遮罩层永远不消失 */
  startLoadingSafetyTimer() {
    this.clearLoadingSafetyTimer()
    this.loadingSafetyTimer = setTimeout(() => {
      if (this.data.loading) {
        log.warn('⚠️ loading安全超时触发，强制关闭loading遮罩层')
        this.setData({ loading: false })
      }
    }, LOADING_SAFETY_TIMEOUT)
  },

  /** 清除loading安全超时定时器 */
  clearLoadingSafetyTimer() {
    if (this.loadingSafetyTimer) {
      clearTimeout(this.loadingSafetyTimer)
      this.loadingSafetyTimer = null
    }
  },

  /**
   * 初始化用户中心页面
   * 流程：更新登录状态 → 并行加载用户信息和积分趋势 → 关闭loading
   */
  async initializePage() {
    // 启动安全超时，确保loading不会永远阻塞页面
    this.startLoadingSafetyTimer()

    try {
      this.updateUserStatus()

      // 用户未登录，直接关闭loading，显示未登录UI
      if (!this.data.isLoggedIn) {
        log.info('👤 用户未登录，跳过数据加载')
        this.setData({ loading: false })
        this.clearLoadingSafetyTimer()
        return
      }

      log.info('👤 用户已登录，开始加载用户数据')

      // 并行加载用户信息和积分趋势（Promise.allSettled保证部分失败不影响整体）
      const results = await Promise.allSettled([
        this.safeLoadUserInfo(),
        this.safeLoadPointsTrend()
      ])

      const taskNames = ['用户信息', '积分趋势']
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          log.warn(`⚠️ ${taskNames[index]}加载失败:`, result.reason)
        } else {
          log.info(`✅ ${taskNames[index]}加载成功`)
        }
      })

      log.info('✅ 用户中心页面初始化完成')
    } catch (error) {
      log.error('❌ 用户中心页面初始化失败', error)
      wx.showToast({
        title: '页面加载失败，请下拉刷新',
        icon: 'none',
        duration: 3000
      })
    } finally {
      // 确保loading一定被关闭，避免遮罩层阻挡用户操作
      this.setData({ loading: false })
      this.clearLoadingSafetyTimer()
    }
  },

  /** 安全加载用户信息（捕获异常，不影响其他并行任务） */
  async safeLoadUserInfo() {
    try {
      return await this.loadUserInfo()
    } catch (error: any) {
      log.warn('⚠️ 用户信息加载失败:', error.message)
      return null
    }
  },

  /** 安全加载积分趋势（捕获异常，失败时使用默认值） */
  async safeLoadPointsTrend() {
    try {
      return await this.loadPointsTrend()
    } catch (error: any) {
      log.warn('⚠️ 积分趋势加载失败:', error.message)
      this.setData({ todayEarned: 0, todayConsumed: 0 })
      return null
    }
  },

  /**
   * 刷新用户数据
   * 用于页面显示时或下拉刷新时更新用户信息和积分趋势
   */
  async refreshUserData() {
    log.info('🔄 刷新用户数据开始...')

    try {
      if (!this.data.isLoggedIn) {
        log.info('👤 用户未登录，跳过数据刷新')
        return
      }

      this.setData({ refreshing: true })
      this.updateUserStatus()

      // updateUserStatus可能发现Token失效导致isLoggedIn变为false
      if (!this.data.isLoggedIn) {
        log.info('👤 用户状态更新后发现未登录，停止数据刷新')
        return
      }

      // 并行刷新用户信息和积分趋势
      const results = await Promise.allSettled([
        this.safeLoadUserInfo(),
        this.safeLoadPointsTrend()
      ])

      const taskNames = ['用户信息', '积分趋势']
      let successCount = 0
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++
          log.info(`✅ ${taskNames[index]}刷新成功`)
        } else {
          log.warn(`⚠️ ${taskNames[index]}刷新失败:`, result.reason)
        }
      })

      log.info(`✅ 用户数据刷新完成，成功项: ${successCount}/2`)

      // 全部失败时提示用户检查网络
      if (successCount === 0) {
        wx.showToast({
          title: '刷新失败，请检查网络',
          icon: 'none',
          duration: 2000
        })
      }
    } catch (error) {
      log.error('❌ 刷新用户数据时发生错误:', error)
      wx.showToast({
        title: '数据刷新失败',
        icon: 'none',
        duration: 2000
      })
    } finally {
      // 确保loading和refreshing状态被清除
      this.setData({ refreshing: false, loading: false })
    }
  },

  /**
   * 更新用户登录状态
   * 从MobX Store获取用户信息，缺失时从Storage恢复
   * 不使用auth-helper.restoreUserInfo()，因为该方法会在未登录时强制跳转登录页
   */
  updateUserStatus() {
    // 从MobX Store获取用户信息，缺失时从Storage恢复（不跳转登录页）
    let userInfo = userStore.userInfo
    if (!userInfo || !userInfo.user_id) {
      userInfo = wx.getStorageSync('user_info')
      if (userInfo && userInfo.user_id) {
        userStore.updateUserInfo(userInfo)
      }
    }

    const isLoggedIn = userStore.isLoggedIn && !!userStore.accessToken

    // 三级角色判断（基于JWT Token中的role_level字段）
    const roleLevel = userInfo?.role_level || 0
    const isMerchant = roleLevel >= 20
    const isManager = roleLevel >= 40
    const isAdmin = roleLevel >= 100 || userInfo?.is_admin === true

    this.setData({
      isLoggedIn,
      userInfo,
      roleLevel,
      isMerchant,
      isManager,
      isAdmin,
      totalPoints: pointsStore.availableAmount || 0
    })

    log.info('👤 用户状态更新:', {
      isLoggedIn,
      roleLevel,
      isMerchant,
      isManager,
      isAdmin,
      userId: userInfo?.user_id,
      totalPoints: this.data.totalPoints
    })
  },

  /**
   * 加载用户信息和积分余额
   * 后端路由: GET /api/v4/auth/profile（用户信息）
   * 后端路由: GET /api/v4/assets/balance（积分余额）
   */
  async loadUserInfo() {
    try {
      // 第1步：获取用户基本信息
      const result = await API.getUserInfo()

      if (result.success && result.data) {
        // API返回: {success: true, data: {user: {...}, timestamp: ...}}
        const userInfo = result.data.user || result.data
        this.setData({ userInfo })
        log.info('✅ 用户信息加载成功')
      }

      // 第2步：获取用户积分余额
      try {
        const balanceResult = await API.getPointsBalance()

        if (balanceResult && balanceResult.success && balanceResult.data) {
          // 后端资产余额API返回字段：available_amount（可用余额）、frozen_amount（冻结余额）
          const availablePoints = balanceResult.data.available_amount || 0
          const frozenPoints = balanceResult.data.frozen_amount || 0
          log.info('✅ 积分余额获取成功:', { availablePoints, frozenPoints })

          // 更新MobX Store
          pointsStore.setBalance(availablePoints, frozenPoints)
          this.setData({ totalPoints: availablePoints })
        } else {
          log.warn('⚠️ 积分余额API返回失败，使用MobX Store缓存值')
          this.setData({ totalPoints: pointsStore.availableAmount || 0 })
        }
      } catch (pointsError) {
        log.error('❌ 获取积分余额异常:', pointsError)
        this.setData({ totalPoints: pointsStore.availableAmount || 0 })
      }
    } catch (error) {
      log.error('❌ 加载用户信息失败', error)
    }
  },

  /**
   * 加载积分趋势数据（今日获得/消费）
   * 后端路由: GET /api/v4/lottery/points
   */
  async loadPointsTrend() {
    try {
      const result = await API.getUserStatistics()

      if (result && result.success && result.data) {
        const statisticsData = result.data
        this.setData({
          todayEarned: statisticsData.asset_summary?.today_earned || 0,
          todayConsumed: statisticsData.asset_summary?.today_consumed || 0
        })
      } else {
        this.setData({ todayEarned: 0, todayConsumed: 0 })
      }
    } catch (error) {
      log.error('❌ 加载积分趋势失败:', error)
      this.setData({ todayEarned: 0, todayConsumed: 0 })
    }
  },

  /** 点击手机号区域，显示完整手机号 */
  onPhoneTap() {
    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    wx.showModal({
      title: '手机号码',
      content: this.data.userInfo.mobile || this.data.userInfo.phone || '未设置',
      showCancel: false
    })
  },

  /** 点击积分区域，跳转到积分明细页面 */
  onPointsTap() {
    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    wx.navigateTo({
      url: '/pages/points-detail/points-detail'
    })
  },

  /**
   * 点击功能菜单项
   * 根据菜单类型执行不同操作：
   * - type='page'：跳转到指定页面
   * - type='action'：执行指定方法（如退出登录、联系客服）
   */
  onMenuItemTap(e: any) {
    const item = e.currentTarget.dataset.item
    if (!item) {
      log.warn('⚠️ 菜单项数据为空')
      return
    }

    log.info('📌 菜单项点击:', { id: item.id, name: item.name, type: item.type })

    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    if (item.type === 'page') {
      wx.navigateTo({
        url: item.url,
        fail: (error: any) => {
          log.error('❌ 页面跳转失败:', { url: item.url, error })
          wx.showToast({ title: '页面跳转失败', icon: 'none' })
        }
      })
    } else if (
      item.type === 'action' &&
      item.action &&
      typeof (this as any)[item.action] === 'function'
    ) {
      ;(this as any)[item.action]()
    } else {
      log.warn('⚠️ 未知的菜单类型或方法不存在:', { type: item.type, action: item.action })
    }
  },

  /** 退出登录 - 清除认证数据并跳转到登录页 */
  logout() {
    log.info('🔄 退出登录')

    wx.showModal({
      title: '确认退出',
      content: '是否确认退出登录？',
      showCancel: true,
      cancelText: '取消',
      confirmText: '退出',
      success: res => {
        if (res.confirm) {
          // 🔴 清理用户数据（使用新项目的清理方法）
          app.clearAuthData()

          // 🔴 跳转到登录页（与旧项目保持一致）
          wx.reLaunch({
            url: '/pages/auth/auth'
          })

          log.info('✅ 用户已退出登录')
        }
      }
    })
  },

  /** 跳转到登录页面 */
  redirectToAuth() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    })
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.refreshUserData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 联系客服
   * 显示客服选择列表：在线聊天 / 复制客服微信号
   */
  onContactService() {
    log.info('📞 联系客服功能')

    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录后使用客服功能', icon: 'none' })
      return
    }

    wx.showActionSheet({
      itemList: ['💬 在线聊天', '💬 复制微信号'],
      success: (res: any) => {
        switch (res.tapIndex) {
          case 0:
            // 跳转到实时聊天页面
            log.info('🚀 跳转到实时聊天页面')
            wx.navigateTo({
              url: '/pages/chat/chat',
              fail: (error: any) => {
                log.error('❌ 跳转聊天页面失败:', error)
                wx.showToast({ title: '页面跳转失败', icon: 'none' })
              }
            })
            break
          case 1:
            /**
             * 复制客服微信号
             * ⚠️ 需后端在 system_settings 表插入 customer_wechat 配置项
             * 当前临时使用硬编码值，后续应从系统配置API获取
             * 详见: docs/后端需求-前端对接问题.md #16
             *
             * 🔴 需运营人员确认实际客服微信号后替换此处硬编码值
             */
            wx.setClipboardData({
              data: 'tg15818387910',
              success: () => {
                wx.showToast({ title: '微信号已复制', icon: 'success' })
              }
            })
            break
          default:
            break
        }
      },
      fail: () => {
        log.info('用户取消了客服选择')
      }
    })
  },

  /** 分享小程序 */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 我的积分中心',
      path: '/pages/user/user'
    }
  },

  /** 跳转到扫码核销页面（商家店员 level>=20 可用） */
  goToScanVerify() {
    if (!this.data.isMerchant) {
      wx.showToast({ title: '需要商家权限', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: '/packageAdmin/scan-verify/scan-verify'
    })
  },

  /** 跳转到消费录入页面（商家店员 level>=20 可用，先扫码获取用户二维码） */
  goToConsumeSubmit() {
    if (!this.data.isMerchant) {
      wx.showToast({ title: '需要商家权限', icon: 'none' })
      return
    }

    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'] as any,
      success: (res: any) => {
        log.info('📷 扫码成功:', res.result)
        const qrCode = encodeURIComponent(res.result)
        wx.navigateTo({
          url: `/packageAdmin/consume-submit/consume-submit?qrCode=${qrCode}`
        })
      },
      fail: (error: any) => {
        log.info('📷 扫码取消或失败:', error)
      }
    })
  },

  /** 跳转到审批管理页面（仅管理员 role_level>=100 可用，后端console域限制） */
  goToAuditList() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' })
      return
    }

    wx.navigateTo({
      url: '/packageAdmin/audit-list/audit-list'
    })
  },

  /** 跳转到管理员仪表板（超级管理员 level>=100 可用） */
  goToAdminDashboard() {
    if (!this.data.isLoggedIn) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      return
    }

    if (!this.data.isAdmin) {
      wx.showToast({ title: '需要管理员权限', icon: 'none' })
      return
    }

    log.info('🎛️ 跳转到管理员仪表板')

    wx.navigateTo({
      url: '/packageAdmin/admin-dashboard/admin-dashboard?from=user',
      success: () => {
        log.info('✅ 管理员仪表板跳转成功')
      },
      fail: (error: any) => {
        log.error('❌ 管理员仪表板跳转失败:', error)
        wx.showToast({ title: '跳转失败，请重试', icon: 'none' })
      }
    })
  }
})

export {}
