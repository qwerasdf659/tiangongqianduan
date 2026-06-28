// pages/user/user.ts - 用户中心页面 + MobX响应式状态
const app = getApp()
// 统一工具函数导入（从utils/index.ts）
const {
  API,
  Wechat,
  Logger,
  ApiWrapper,
  PopupFrequency,
  TopBanner,
  Permission
} = require('../../utils/index')
const log = Logger.createLogger('user')
const { showToast } = Wechat
const { safeApiCall } = ApiWrapper

const DEFAULT_NAV_THEME = {
  navBg: '#5B7A5E',
  navText: '#ffffff',
  tabSelected: '#5B7A5E'
}
// MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')
const { auditStore } = require('../../store/audit')

/** loading安全超时时间（毫秒），防止loading遮罩层永远不消失导致页面无法操作 */
const LOADING_SAFETY_TIMEOUT = 8000

/** 用户中心功能菜单项（纯前端UI配置） */
interface MenuItem {
  /** 菜单项唯一标识 */
  id: string
  /** 菜单项显示名称 */
  name: string
  /** 菜单项描述文字 */
  description: string
  /** Iconfont CSS class（如 'icon-coin'），app.scss 中定义 ::before 伪元素渲染字形 */
  iconClass: string
  /** TDesign 图标名（用于 <t-icon name="xxx"> 渲染） */
  tdIcon: string
  /** 菜单项主题色（用于快捷入口圆形底色） */
  color: string
  /** 类型: page=页面跳转, action=执行方法 */
  type: 'page' | 'action'
  /** 跳转URL（type='page' 时使用） */
  url?: string
  /** 执行方法名（type='action' 时使用） */
  action?: string
}

/**
 * 用户中心页面 - 天工平台
 * 功能说明：
 * - 我的积分（完整的积分展示和趋势）
 * - 功能菜单（积分明细、我的库存、交易记录、消费记录、我的售后、意见反馈、联系客服、退出登录）
 * - 多角色权限（普通用户/商家店员/商家店长/超级管理员）
 */
Page({
  data: {
    // 用户基础信息
    isLoggedIn: false,
    userInfo: null as API.UserProfile | null,
    /** 当前小程序版本号（动态取自 wx.getAccountInfoSync，展示于页面底部） */
    appVersion: '',
    // 登录弹窗
    loginPopupVisible: false,

    // 顶部沉浸式横幅（运营可配，后端 ad-delivery?slot_type=top_banner&position=profile）
    /** 顶部 Banner 投放项（空则回退本地兜底图） */
    topBannerItems: [] as API.AdDeliveryItem[],
    /** 顶部 Banner 是否轮播（后端槽位级 is_carousel） */
    topBannerCarousel: false,
    /** 顶部 Banner 轮播间隔毫秒（后端槽位级 slide_interval_ms） */
    topBannerInterval: 3000,
    /** 是否有运营配置的顶部 Banner 图（false 时用本地兜底图） */
    topBannerReady: false,

    // 多角色权限标识（从JWT Token中的role_level判断）
    // isManager  = role_level >= 40（商家店长及以上）
    // isReviewer = role_level >= 20（店员及以上即可进审批管理；后端审核链门槛已降 lv60→lv20，
    //              "能审哪些"由后端按节点角色 + 门店/区域隔离精校，前端只控入口可见）
    // isAdmin    = role_level >= 100（超级管理员，可批量审核 + 审核链配置）
    // 注：商家工作台三个按钮（扫码核销/消费录入/我的提交）显隐已改用权限码（showScan 等），
    //     不再用 role_level 判断，与金蛋页同口径（§10.7）。
    isManager: false,
    isReviewer: false,
    isAdmin: false,

    // 商家工作台三个按钮显隐：以后端 GET /api/v4/permissions/me 下发的 permissions 权限码判定，
    // 与金蛋页(lottery.ts)完全同口径（§10.7），不再用 role_level 整段显隐，杜绝口径漂移。
    /** 扫码核销卡片显隐：拥有 consumption:scan_user 权限 */
    showScan: false,
    /** 消费录入卡片显隐：拥有 consumption:create 权限 */
    showConsumptionSubmit: false,
    /** 我的提交卡片显隐：拥有 consumption:read 权限 */
    showMySubmissions: false,
    /**
     * 是否客服座席（与 role_level 解耦，由后端 customer_service_agents 表权威判定）
     * 进页调一次轻量身份接口 GET /api/v4/system/cs-agent/me，data.is_agent===true 显示「客服回复台」入口
     */
    isCsAgent: false,
    roleLevel: 0,

    // 积分信息
    // totalPoints: GET /api/v4/assets/balance?asset_code=points → available_amount
    // pendingConsumptionPoints: 同接口 → pending_consumption_points（待审核消费积分）
    // todayEarned/todayConsumed: GET /api/v4/assets/today-summary?asset_code=points → today_earned / today_consumed
    totalPoints: 0,
    pendingConsumptionPoints: 0,
    todayEarned: 0,
    todayConsumed: 0,

    /** 审核链待办数量（MobX绑定自 auditStore.pendingCount，role_level>=20 时加载） */
    approvalPendingCount: 0,

    // 系统配置（从 GET /api/v4/system/config 动态获取）
    customerWechat: '' as string,

    // 功能菜单配置
    menuItems: [
      {
        id: 'points-detail',
        name: '积分明细',
        description: '查看积分获得和消费记录',
        iconClass: 'icon-coin',
        tdIcon: 'wallet-filled',
        color: '#C5A572',
        type: 'page',
        url: '/packageUser/points-detail/points-detail'
      },
      {
        id: 'my-inventory',
        name: '我的仓库',
        description: '管理我的所有物品',
        iconClass: 'icon-box',
        tdIcon: 'layers-filled',
        color: '#8B7355',
        type: 'page',
        url: '/packageUser/backpack/inventory/inventory'
      },
      {
        id: 'my-orders',
        name: '我的订单',
        description: '查看兑换订单和物流进度',
        iconClass: 'icon-shopping-bag',
        tdIcon: 'task-filled',
        color: '#A08B6E',
        type: 'page',
        url: '/packageExchange/exchange-orders/exchange-orders'
      },
      {
        id: 'my-redemption-orders',
        name: '核销订单',
        description: '查看核销记录与申请售后',
        iconClass: 'icon-qrcode',
        tdIcon: 'qrcode',
        color: '#C5A572',
        type: 'page',
        url: '/packageUser/redemption-orders/redemption-orders'
      },
      {
        id: 'trade-records',
        name: '资产明细',
        description: '查看星石、源晶等资产流水',
        iconClass: 'icon-chart',
        tdIcon: 'chart-filled',
        color: '#8B7355',
        type: 'page',
        url: '/packageUser/records/trade-upload-records/trade-upload-records'
      },
      {
        id: 'consumption-records',
        name: '消费记录',
        description: '查看消费积分记录',
        iconClass: 'icon-receipt',
        tdIcon: 'file-paste-filled',
        color: '#A08B6E',
        type: 'page',
        url: '/packageUser/records/consumption-records/consumption-records'
      },
      {
        id: 'my-disputes',
        name: '我的售后',
        description: '查看订单售后申诉进度',
        iconClass: 'icon-chat',
        tdIcon: 'service-filled',
        color: '#8B7355',
        type: 'page',
        url: '/packageUser/disputes/disputes'
      },
      {
        id: 'my-feedback',
        name: '意见反馈',
        description: '提交建议与问题反馈',
        iconClass: 'icon-edit',
        tdIcon: 'edit-1-filled',
        color: '#C5A572',
        type: 'page',
        url: '/packageUser/feedback/feedback'
      },
      {
        id: 'contact-service',
        name: '联系客服',
        description: '在线客服服务支持',
        iconClass: 'icon-headset',
        tdIcon: 'service-filled',
        color: '#A08B6E',
        type: 'action',
        action: 'onContactService'
      },
      {
        id: 'my-addresses',
        name: '地址管理',
        description: '管理我的收货地址',
        iconClass: 'icon-location',
        tdIcon: 'location-filled',
        color: '#A08B6E',
        type: 'page',
        url: '/packageUser/addresses/addresses'
      },
      {
        id: 'logout',
        name: '退出登录',
        description: '安全退出当前账号',
        iconClass: 'icon-logout',
        tdIcon: 'logout',
        color: '#c44569',
        type: 'action',
        action: 'logout'
      }
    ] as MenuItem[],

    /* ===== 弹窗横幅（后端 GET /api/v4/system/ad-delivery?slot_type=popup&position=profile 返回） ===== */
    showPopupBanner: false,
    popupBanners: [] as API.AdDeliveryItem[],

    // 页面状态
    loading: true,
    refreshing: false
  },

  /** 弹窗横幅队列（不放 data，避免大数组序列化开销） */
  _popupQueue: null as API.AdDeliveryItem[] | null,
  _popupQueueIndex: 0,
  _bannerShowStartTime: 0,

  /** loading安全超时定时器ID */
  loadingSafetyTimer: null as any,

  /** 首次onShow跳过标记（onLoad已初始化，防止微信生命周期 onLoad→onShow 连续触发导致重复请求） */
  _skipNextShow: false as boolean,

  /** MobX Store绑定实例引用 */
  userStoreBindings: null as any,
  pointsStoreBindings: null as any,
  auditStoreBindings: null as any,

  /**
   * 生命周期函数 - 监听页面加载
   * 页面首次加载时调用，执行用户中心页面初始化操作
   */
  onLoad() {
    log.info('用户中心页面加载')

    // 展示当前小程序版本号（开发版/体验版 version 为空，降级显示"开发版"）
    try {
      this.setData({
        appVersion: wx.getAccountInfoSync().miniProgram.version || '开发版'
      })
    } catch (_err) {
      this.setData({ appVersion: '开发版' })
    }

    // MobX Store绑定 - 用户状态和积分余额自动同步
    this.userStoreBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: ['setLoginState', 'clearLoginState', 'updateUserInfo']
    })
    this.pointsStoreBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: {
        totalPoints: () => pointsStore.availableAmount,
        pendingConsumptionPoints: () => pointsStore.pendingConsumptionPoints
      },
      actions: ['setBalance']
    })
    this.auditStoreBindings = createStoreBindings(this, {
      store: auditStore,
      fields: {
        approvalPendingCount: () => auditStore.pendingCount
      },
      actions: []
    })

    this._skipNextShow = true
    this.initializePage()
  },

  /**
   * 生命周期函数 - 监听页面显示
   * 从其他页面返回 / 从后台切回前台时刷新数据（首次进入由 onLoad 处理，跳过）
   */
  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 3 })
      }
    }
    if (this._skipNextShow) {
      this._skipNextShow = false
      return
    }
    log.info('用户中心页面显示')

    this.applyNativeThemeColors()

    this.updateUserStatus()
    if (this.data.isLoggedIn) {
      if (this.data.loginPopupVisible) {
        this.setData({ loginPopupVisible: false })
      }
      this.refreshUserData()
      this.loadProfilePopup()
    }
  },

  /** 页面卸载时销毁Store绑定和定时器，避免内存泄漏 */
  onUnload() {
    this.clearLoadingSafetyTimer()
    if (this.userStoreBindings) {
      this.userStoreBindings.destroyStoreBindings()
    }
    if (this.pointsStoreBindings) {
      this.pointsStoreBindings.destroyStoreBindings()
    }
    if (this.auditStoreBindings) {
      this.auditStoreBindings.destroyStoreBindings()
    }
  },

  /**
   * 将微信原生导航栏、TabBar 颜色同步为当前主题色
   *
   * CSS 变量只能控制 WXML 内元素，微信原生导航栏和 TabBar 属于框架层，
   * 必须通过 wx.setNavigationBarColor / wx.setTabBarStyle 两个 JS API 动态设置。
   * app.json 中的 #5B7A5E 仅作为主题未加载前的兜底色。
   */
  applyNativeThemeColors() {
    wx.setNavigationBarColor({
      frontColor: DEFAULT_NAV_THEME.navText as '#ffffff' | '#000000',
      backgroundColor: DEFAULT_NAV_THEME.navBg,
      animation: { duration: 300, timingFunc: 'easeIn' }
    })

    wx.setTabBarStyle({
      selectedColor: DEFAULT_NAV_THEME.tabSelected
    })
  },

  /** 启动loading安全超时定时器，防止loading遮罩层永远不消失 */
  startLoadingSafetyTimer() {
    this.clearLoadingSafetyTimer()
    this.loadingSafetyTimer = setTimeout(() => {
      if (this.data.loading) {
        log.warn('loading安全超时触发，强制关闭loading遮罩层')
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

    this.applyNativeThemeColors()

    try {
      this.updateUserStatus()

      // 用户未登录：跳过需登录数据，但仍加载公开的顶部 Banner（ad-delivery 已 optionalAuth，匿名可见运营图）
      if (!this.data.isLoggedIn) {
        log.info('用户未登录，仅加载公开顶部 Banner')
        this.loadTopBanner().catch(() => {})
        this.setData({ loading: false })
        this.clearLoadingSafetyTimer()
        return
      }

      log.info('用户已登录，开始加载用户数据')

      // 并行加载用户信息、积分趋势、系统配置、审核待办、弹窗横幅、顶部Banner（Promise.allSettled保证部分失败不影响整体）
      const results = await Promise.allSettled([
        this.safeLoadUserInfo(),
        this.safeLoadPointsTrend(),
        this.safeLoadSystemConfig(),
        this.loadApprovalPendingCount(),
        this.loadProfilePopup(),
        this.loadTopBanner()
      ])

      const taskNames = ['用户信息', '积分趋势', '系统配置', '审核待办', '弹窗广告', '顶部Banner']
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          log.warn(`${taskNames[index]}加载失败:`, result.reason)
        } else {
          log.info(`${taskNames[index]}加载成功`)
        }
      })

      log.info('用户中心页面初始化完成')
    } catch (error) {
      log.error('用户中心页面初始化失败', error)
      showToast('页面加载失败，请下拉刷新', 'none', 3000)
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
      log.warn('用户信息加载失败:', error.message)
      return null
    }
  },

  /** 安全加载积分趋势（捕获异常，失败时使用默认值） */
  async safeLoadPointsTrend() {
    try {
      return await this.loadPointsTrend()
    } catch (error: any) {
      log.warn('积分趋势加载失败:', error.message)
      this.setData({ todayEarned: 0, todayConsumed: 0 })
      return null
    }
  },

  /**
   * 安全加载系统配置（客服微信号等）
   * 后端路由: GET /api/v4/system/config
   * 响应: { success: true, data: { customer_wechat, customer_phone, customer_email, ... } }
   */
  async safeLoadSystemConfig() {
    const configData = await safeApiCall(() => API.getSystemGlobalConfig(), {
      context: '系统配置',
      silent: true
    })
    if (configData) {
      this.setData({ customerWechat: configData.customer_wechat || '' })
      log.info(
        '系统配置加载成功, customer_wechat:',
        configData.customer_wechat ? '已配置' : '未配置'
      )
    }
  },

  /**
   * 刷新用户数据
   * 用于页面显示时或下拉刷新时更新用户信息和积分趋势
   */
  async refreshUserData() {
    log.info('刷新用户数据开始...')

    try {
      if (!this.data.isLoggedIn) {
        log.info('用户未登录，跳过数据刷新')
        return
      }

      this.setData({ refreshing: true })
      this.updateUserStatus()

      // updateUserStatus可能发现Token失效导致isLoggedIn变为false
      if (!this.data.isLoggedIn) {
        log.info('用户状态更新后发现未登录，停止数据刷新')
        return
      }

      // 并行刷新用户信息、积分趋势、审核待办
      const results = await Promise.allSettled([
        this.safeLoadUserInfo(),
        this.safeLoadPointsTrend(),
        this.loadApprovalPendingCount()
      ])

      const taskNames = ['用户信息', '积分趋势', '审核待办']
      let successCount = 0
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successCount++
          log.info(`${taskNames[index]}刷新成功`)
        } else {
          log.warn(`${taskNames[index]}刷新失败:`, result.reason)
        }
      })

      log.info(`用户数据刷新完成，成功项: ${successCount}/3`)

      // 全部失败时提示用户检查网络
      if (successCount === 0) {
        showToast('刷新失败，请检查网络', 'none', 2000)
      }
    } catch (error) {
      log.error('刷新用户数据时发生错误:', error)
      showToast('数据刷新失败', 'none', 2000)
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
    const userInfo = userStore.ensureUserInfo()

    const isLoggedIn = userStore.isLoggedIn && !!userStore.accessToken

    // 四级角色判断统一走 utils/permission.ts（门槛集中维护，不再页面内裸写 role_level>=X）
    // 注：商家工作台三个按钮显隐已改由 loadMerchantPermissions 按权限码判定（§10.7），
    //     此处仅保留店长/审核链待办/管理员等仍按 role_level 的角色标识。
    const roleLevel = userInfo?.role_level || 0
    const isManager = Permission.isManager(roleLevel)
    const isReviewer = Permission.canReviewChain(roleLevel)
    const isAdmin = Permission.isAdmin(userInfo)

    this.setData({
      isLoggedIn,
      userInfo,
      roleLevel,
      isManager,
      isReviewer,
      isAdmin
    })

    log.info('用户状态更新:', {
      isLoggedIn,
      roleLevel,
      isManager,
      isReviewer,
      isAdmin,
      userId: userInfo?.user_id
    })

    /* 登录后静默探测座席身份（后端权威），决定是否展示「客服回复台」入口 */
    if (isLoggedIn) {
      this.probeCsAgent()
    } else if (this.data.isCsAgent) {
      this.setData({ isCsAgent: false })
    }

    /* 登录后拉取权限码，决定商家工作台三个按钮显隐（与金蛋页同口径） */
    if (isLoggedIn) {
      this.loadMerchantPermissions()
    } else {
      this.setData({ showScan: false, showConsumptionSubmit: false, showMySubmissions: false })
    }
  },

  /**
   * 加载商家功能权限（工作台三个按钮显隐的唯一入口）
   *
   * 统一以后端 GET /api/v4/permissions/me 下发的 permissions 为权威数据源（§10.7），
   * 三张卡片用同一份扁平权限数组按权限码独立显隐，与金蛋页(lottery.ts)完全同口径：
   *   - 扫码核销 showScan：拥有 consumption:scan_user 权限
   *   - 消费录入 showConsumptionSubmit：拥有 consumption:create 权限
   *   - 我的提交 showMySubmissions：拥有 consumption:read 权限
   * 与后端 requireMerchantPermission 同构（支持通配 *:*），管理员据此自动放行。
   * 拉取失败一律按无权限处理（隐藏全部），真正鉴权由后端兜底。
   */
  async loadMerchantPermissions() {
    try {
      const apiResult = await API.getMyPermissions()
      if (!apiResult?.success || !apiResult.data) {
        throw new Error(apiResult?.message || '权限接口未返回有效数据')
      }
      const rawPermissions = (apiResult.data as API.PermissionsMeData).permissions
      this.setData({
        showScan: Permission.canScan(rawPermissions),
        showConsumptionSubmit: Permission.canSubmitConsumption(rawPermissions),
        showMySubmissions: Permission.canViewMySubmissions(rawPermissions)
      })
    } catch (error) {
      log.error('[user] 商家功能权限检查失败:', error)
      this.setData({ showScan: false, showConsumptionSubmit: false, showMySubmissions: false })
    }
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
        log.info('用户信息加载成功')
      }

      // 第2步：获取用户积分余额（委托 pointsStore.refreshFromAPI）
      try {
        const { available, pendingConsumptionPoints } = await pointsStore.refreshFromAPI()
        // 双保险：MobX绑定 + 手动setData，确保页面一定能更新
        this.setData({
          totalPoints: available,
          pendingConsumptionPoints
        })
      } catch (pointsError) {
        log.error('获取积分余额异常:', pointsError)
      }
    } catch (error) {
      log.error('加载用户信息失败', error)
    }
  },

  /**
   * 加载积分趋势数据（今日获得/消费）
   *
   * 后端路由: GET /api/v4/assets/today-summary?asset_code=points（决策D-1，资产域通用接口）
   * 后端服务: AssetQueryService.getTodaySummary({ user_id, asset_code })
   * 响应: { success: true, data: { asset_code, today_earned, today_consumed, transaction_count } }
   *
   * 统计范围: 北京时间当日所有 business_type 的 points 交易
   */
  async loadPointsTrend() {
    const data = await safeApiCall(() => API.getTodaySummary('points'), {
      context: '今日积分汇总',
      silent: true
    })
    if (data) {
      this.setData({
        todayEarned: data.today_earned ?? 0,
        todayConsumed: data.today_consumed ?? 0
      })
    } else {
      this.setData({ todayEarned: 0, todayConsumed: 0 })
    }
  },

  /**
   * 刷新审核链待办数量（通过 auditStore 全局管理）
   * 数据通过 MobX binding 自动同步到 this.data.approvalPendingCount
   */
  async loadApprovalPendingCount() {
    if (!this.data.isReviewer) {
      return
    }
    await auditStore.refreshPendingCount()
  },

  /** 加载顶部 Banner（复用 TopBanner 共享逻辑，失败/空回退本地兜底图，position=profile 对齐后端口径） */
  async loadTopBanner() {
    const result = await TopBanner.loadTopBanner('profile')
    this.setData(result)
  },

  /** 顶部 Banner 点击（复用 TopBanner 跳转 + 上报） */
  onTopBannerTap(e: any) {
    if (!this.data.topBannerReady) {
      return
    }
    const tapIndex = Number(e?.currentTarget?.dataset?.index) || 0
    const tappedItem = this.data.topBannerItems[tapIndex]
    TopBanner.handleTopBannerTap(tappedItem, 'profile')
  },

  /** 顶部 Banner 轮播切换（swiper bindchange）：对切入的当前张补报曝光 */
  onTopBannerChange(e: any) {
    const currentIndex = Number(e?.detail?.current) || 0
    TopBanner.handleTopBannerChange(this.data.topBannerItems, currentIndex, 'profile')
  },

  /** 顶部 Banner 图片加载失败（<image> binderror）：打印失败 URL 与错误详情，便于定位 */
  onTopBannerImageError(e: any) {
    const errIndex = Number(e?.currentTarget?.dataset?.index) || 0
    TopBanner.handleTopBannerImageError(this.data.topBannerItems[errIndex], 'profile', e?.detail)
  },

  /** 点击积分区域，跳转到积分明细页面 */
  onPointsTap() {
    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    wx.navigateTo({
      url: '/packageUser/points-detail/points-detail'
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
      log.warn('菜单项数据为空')
      return
    }

    log.info('菜单项点击:', { id: item.id, name: item.name, type: item.type })

    if (!this.data.isLoggedIn) {
      this.redirectToAuth()
      return
    }

    if (item.type === 'page') {
      wx.navigateTo({
        url: item.url,
        fail: (error: any) => {
          log.error('页面跳转失败:', { url: item.url, error })
          showToast('页面跳转失败')
        }
      })
    } else if (
      item.type === 'action' &&
      item.action &&
      typeof (this as any)[item.action] === 'function'
    ) {
      ;(this as any)[item.action]()
    } else {
      log.warn('未知的菜单类型或方法不存在:', { type: item.type, action: item.action })
    }
  },

  /**
   * 退出登录 - 通知后端释放会话 + 清除本地认证数据 + 跳转登录页
   *
   * 数据流：
   *   用户确认退出
   *   → POST /api/v4/auth/logout（后端将 authentication_sessions.is_active 设为 false）
   *   → 清理本地 MobX Store + Storage
   *   → 跳转到登录页
   *
   * 即使后端调用失败（网络异常等），仍然清理本地数据并跳转，保证用户能正常退出
   */
  logout() {
    log.info('退出登录')

    wx.showModal({
      title: '确认退出',
      content: '是否确认退出登录？',
      showCancel: true,
      cancelText: '取消',
      confirmText: '退出',
      success: async (modalResult: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (modalResult.confirm) {
          try {
            await API.logout()
            log.info('后端会话注销成功')
          } catch (logoutError: any) {
            log.warn('后端会话注销失败（不影响本地退出）:', logoutError.message)
          }

          app.clearAuthData()

          // 退出后回到抽奖首页（未登录态）
          wx.reLaunch({
            url: '/pages/lottery/lottery'
          })

          log.info('用户已退出登录')
        }
      }
    })
  },

  /** 显示登录弹窗 */
  redirectToAuth() {
    this.setData({ loginPopupVisible: true })
  },

  onShowLoginPopup() {
    this.setData({ loginPopupVisible: true })
  },

  onLoginPopupClose() {
    this.setData({ loginPopupVisible: false })
  },

  async onLoginSuccess() {
    this.setData({ loginPopupVisible: false })
    await this.initializePage()
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
    log.info('联系客服功能')

    if (!this.data.isLoggedIn) {
      showToast('请先登录后使用客服功能')
      return
    }

    wx.showActionSheet({
      itemList: ['💬 在线聊天', '💬 复制微信号'],
      success: (res: any) => {
        switch (res.tapIndex) {
          case 0:
            // 跳转到实时聊天页面
            log.info('跳转到实时聊天页面')
            wx.navigateTo({
              url: '/packageUser/chat/chat',
              fail: (error: any) => {
                log.error('跳转聊天页面失败:', error)
                showToast('页面跳转失败')
              }
            })
            break
          case 1:
            if (this.data.customerWechat) {
              wx.setClipboardData({
                data: this.data.customerWechat,
                success: () => {
                  showToast('微信号已复制', 'success')
                }
              })
            } else {
              showToast('暂无客服微信号，请使用在线聊天')
            }
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

  // ========================================
  // 弹窗横幅（个人中心弹窗广告 position=profile）
  // ========================================

  /**
   * 加载个人中心弹窗横幅（含频率控制过滤）
   *
   * 后端API: GET /api/v4/system/ad-delivery?slot_type=popup&position=profile
   * 对应广告位: profile_popup（ID:4，日价50星石）
   *
   * 数据流:
   *   API获取活跃投放内容 → 客户端频率过滤 → priority降序排序 → 展示第一条
   */
  async loadProfilePopup() {
    try {
      const result = await API.getAdDelivery({ slot_type: 'popup', position: 'profile' })
      if (!result?.success || !result.data) {
        return
      }

      const bannerItems: API.AdDeliveryItem[] = result.data.items || []
      if (!Array.isArray(bannerItems) || bannerItems.length === 0) {
        return
      }

      const sessionSeenIds: Set<number> = app.globalData.sessionSeenCampaigns || new Set()
      const filteredBanners = PopupFrequency.filterBannersByFrequency(bannerItems, sessionSeenIds)
      if (filteredBanners.length === 0) {
        return
      }

      this._popupQueue = filteredBanners
      this._popupQueueIndex = 0

      PopupFrequency.markBannerSeen(filteredBanners[0].ad_campaign_id, sessionSeenIds)

      this._bannerShowStartTime = Date.now()
      this.setData({
        popupBanners: [filteredBanners[0]],
        showPopupBanner: true
      })

      log.info('个人中心弹窗广告加载成功:', filteredBanners.length, '条通过频率过滤')
    } catch (error) {
      log.warn('个人中心弹窗广告加载失败（不影响主流程）:', error)
    }
  },

  /**
   * 弹窗横幅关闭（队列行为）
   * 关闭当前弹窗 → 按 campaign_category 分流上报 → 队列中有下一个则自动弹出
   */
  onPopupBannerClose(e: WechatMiniprogram.CustomEvent) {
    const closeMethod: string = e?.detail?.close_method || 'close_btn'
    const currentBanners = this.data.popupBanners
    const queueIndex: number = this._popupQueueIndex || 0

    if (currentBanners && currentBanners.length > 0) {
      const closedBanner = currentBanners[0]
      if (closedBanner?.ad_campaign_id) {
        PopupFrequency.markBannerDismissed(closedBanner.ad_campaign_id)

        const showDuration = this._bannerShowStartTime ? Date.now() - this._bannerShowStartTime : 0
        this._reportAdEvent(closedBanner, 'impression', {
          show_duration_ms: showDuration,
          close_method: closeMethod,
          queue_position: queueIndex + 1,
          slot_type: 'popup'
        })
      }
    }

    const queue: API.AdDeliveryItem[] = this._popupQueue || []
    const nextIndex = queueIndex + 1

    if (nextIndex < queue.length) {
      const sessionSeenIds: Set<number> = app.globalData.sessionSeenCampaigns || new Set()
      PopupFrequency.markBannerSeen(queue[nextIndex].ad_campaign_id, sessionSeenIds)

      this._popupQueueIndex = nextIndex
      this.setData({ showPopupBanner: false })
      setTimeout(() => {
        this._bannerShowStartTime = Date.now()
        this.setData({
          popupBanners: [queue[nextIndex]],
          showPopupBanner: true
        })
      }, 100)
    } else {
      this._bannerShowStartTime = 0
      this._popupQueue = null
      this._popupQueueIndex = 0
      this.setData({ showPopupBanner: false })
    }
  },

  /**
   * 弹窗横幅操作按钮点击
   * 上报 click 事件（按 campaign_category 分流） → 执行跳转
   */
  onPopupBannerAction(e: any) {
    const { banner } = e.detail
    if (!banner?.link_url || banner.link_type === 'none') {
      return
    }

    this._reportAdEvent(banner, 'click', { slot_type: 'popup' })
    this._handleAdLinkNavigation(banner)
  },

  /**
   * 内容投放事件上报 — 按 campaign_category 分流
   *
   * commercial → reportAdImpression / reportAdClick（计费系统）
   * operational / system → reportInteractionLog（交互日志）
   */
  _reportAdEvent(
    item: API.AdDeliveryItem,
    eventType: 'impression' | 'click',
    extraData?: Record<string, any>
  ) {
    if (!item?.ad_campaign_id) {
      return
    }

    if (item.campaign_category === 'commercial') {
      if (!item.ad_slot_id) {
        log.error('商业广告缺少 ad_slot_id，无法上报计费事件:', item.ad_campaign_id)
        return
      }

      if (eventType === 'impression') {
        API.reportAdImpression({
          ad_campaign_id: item.ad_campaign_id,
          ad_slot_id: item.ad_slot_id
        }).catch((err: any) => {
          log.warn('商业广告曝光上报失败:', err)
        })
      } else {
        API.reportAdClick({
          ad_campaign_id: item.ad_campaign_id,
          ad_slot_id: item.ad_slot_id,
          click_target: item.link_url || undefined
        }).catch((err: any) => {
          log.warn('商业广告点击上报失败:', err)
        })
      }
    } else {
      API.reportInteractionLog({
        ad_campaign_id: item.ad_campaign_id,
        interaction_type: eventType,
        extra_data: extraData
      }).catch((err: any) => {
        log.warn('交互日志上报失败（不影响业务）:', err)
      })
    }
  },

  /**
   * 统一跳转处理 — 根据 link_type 执行不同的跳转方式
   */
  _handleAdLinkNavigation(item: API.AdDeliveryItem) {
    if (!item.link_url || !item.link_type || item.link_type === 'none') {
      return
    }

    switch (item.link_type) {
      case 'page':
        wx.navigateTo({
          url: item.link_url,
          fail: () => {
            wx.switchTab({
              url: item.link_url!,
              fail: (err: any) => log.error('跳转页面失败:', err)
            })
          }
        })
        break

      case 'miniprogram':
        wx.navigateToMiniProgram({
          appId: item.link_url,
          fail: (err: any) => log.error('跳转小程序失败:', err)
        })
        break

      case 'webview':
        wx.navigateTo({
          url: '/pages/webview/webview?url=' + encodeURIComponent(item.link_url),
          fail: (err: any) => log.error('跳转webview失败:', err)
        })
        break

      default:
        log.warn('未知的跳转类型:', item.link_type)
    }
  },

  /** 分享小程序 */
  onShareAppMessage() {
    return {
      title: '天工平台 - 我的积分中心',
      path: '/pages/user/user'
    }
  },

  /** 跳转到扫码核销页面（拥有 consumption:scan_user 权限可用） */
  goToScanVerify() {
    if (!this.data.showScan) {
      showToast('需要商家权限')
      return
    }

    wx.navigateTo({
      url: '/packageAdmin/scan-verify/scan-verify'
    })
  },

  /** 跳转到消费录入页面（拥有 consumption:create 权限可用） */
  goToConsumeSubmit() {
    if (!this.data.showConsumptionSubmit) {
      showToast('需要商家权限')
      return
    }

    wx.navigateTo({
      url: '/packageAdmin/consume-submit/consume-submit'
    })
  },

  /**
   * 跳转到「我的提交」页（拥有 consumption:read 权限可用）
   *
   * 店员查看本人提交的消费记录及审核状态，走商家域只读接口，与管理员审核区分。
   */
  goToMySubmissions() {
    if (!this.data.showMySubmissions) {
      showToast('需要商家权限')
      return
    }

    wx.navigateTo({
      url: '/packageAdmin/my-submissions/my-submissions'
    })
  },

  /**
   * 查询客服座席身份（后端权威，决定是否展示「客服回复台」入口）
   *
   * 座席与 role_level 解耦，由后端 customer_service_agents 表权威判定。
   * 调用轻量身份接口 GET /api/v4/system/cs-agent/me（仅登录鉴权、非座席不会 403）：
   *   data.is_agent===true → 在岗座席，显示入口；否则隐藏。
   * 比"拿会话列表当探针"更干净省流量（只读一行座席状态，不拉会话列表）。
   */
  async probeCsAgent() {
    try {
      const result = await API.getCsAgentMe()
      const isAgent = !!(result && result.success && result.data && result.data.is_agent)
      if (this.data.isCsAgent !== isAgent) {
        this.setData({ isCsAgent: isAgent })
      }
    } catch (_error: any) {
      /* 任何失败都按"非座席"处理，不展示入口 */
      if (this.data.isCsAgent) {
        this.setData({ isCsAgent: false })
      }
    }
  },

  /** 跳转到客服回复台（座席端，后端按座席身份 403 兜底校验） */
  goToCsAgent() {
    wx.navigateTo({
      url: '/packageAdmin/customer-service/customer-service'
    })
  },

  /**
   * 跳转到审批管理页面
   *
   * 权限判定全部交给后端（方案B，对接文档2026-06-24）：不做本地"是否门店店员"前置拦截，
   * 点击即跳转。审核页与后端接口按 role_level 统一判定——管理员/超管(role_level>=100)
   * 后端无条件放行，避免前端本地规则与后端漂移误伤管理员账号。
   */
  goToAuditList() {
    wx.navigateTo({
      url: '/packageAdmin/audit-list/audit-list'
    })
  }
})
