/**
 * 抽奖页面 - 薄壳页面（任务8瘦身后）
 *
 * 职责：
 *   1. 页面生命周期管理（onLoad/onShow/onReady/onUnload）
 *   2. V2动态身份二维码（生成、刷新、倒计时、放大）
 *   3. 管理员功能条（扫码核销、消费录入、审核详情跳转）
 *   4. 审核记录弹窗（消费记录查询）
 *   5. 弹窗横幅（popup-banner组件数据加载）
 *   6. 积分显示（格式化、响应式字体、MobX绑定）
 *
 * 抽奖核心逻辑已迁移到 lottery-activity 万能组件：
 *   <lottery-activity campaignCode="{{mainCampaign.campaign_code}}" size="full" />
 *
 * @file pages/lottery/lottery.ts
 * @version 5.2.0
 */

const {
  Wechat,
  API,
  Utils,
  Constants,
  ConfigCache,
  Logger,
  PopupFrequency,
  QRCode,
  TopBanner,
  Permission
} = require('../../utils/index')
const log = Logger.createLogger('lottery')
const { showToast } = Wechat
const { checkAuth, restoreUserInfo } = Utils
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

const DEFAULT_NAV_THEME = {
  navBg: '#5B7A5E',
  navText: '#ffffff',
  tabSelected: '#5B7A5E'
}

/** 积分千分位格式化 — 供MobX computed使用 */
const formatPointsDisplay = Utils.formatPoints

/**
 * 根据积分位数返回响应式字体CSS类名（独立函数，供MobX绑定的computed使用）
 * 位数 ≤7: 默认字号  |  ≤10: medium-number  |  ≤13: small-number  |  >13: tiny-number
 */
/**
 * 统一计算可用积分/待审核消费积分的响应式字号档位
 *
 * 方案A：取两个数字中位数最多者计算同一档字号，确保左右两个数字字号一致，
 * 避免「可用积分变小、待审核消费积分仍为大字」的视觉割裂。
 *
 * @param nums 参与比较的积分数值（可用积分、待审核消费积分）
 * @returns 字号档位 CSS 类名（''=大字 / medium-number / small-number / tiny-number）
 */
function getPointsDisplayClass(...nums: number[]): string {
  const maxLen = Math.max(0, ...nums.map(n => (n ? n.toString().length : 0)))
  if (maxLen <= 7) {
    return ''
  }
  if (maxLen <= 10) {
    return 'medium-number'
  }
  if (maxLen <= 13) {
    return 'small-number'
  }
  return 'tiny-number'
}

Page({
  data: {
    /* ===== 用户状态 ===== */
    isLoggedIn: false,
    /**
     * 首页商家功能区四个按钮显隐 — 统一以后端 GET /api/v4/permissions/me 下发的
     * role_level / permissions 为唯一权威数据源（对接文档 2026-06-24 / 06-25），零映射直读。
     */
    /** 扫码核销：拥有 consumption:scan_user 权限（与后端 redemption/scan 同口径） */
    showScan: false,
    /** 消费录入：拥有 consumption:create 权限（店员/管理员均下发） */
    showConsumptionSubmit: false,
    /** 审核详情：审核链待办参与者（role_level>=20，店员/店长/管理员），与后端 my-pending 同口径 */
    showAudit: false,
    /** 我的提交：拥有 consumption:read 权限者可查看本人提交的消费记录及审核状态 */
    showMySubmissions: false,
    pointsBalance: 0,
    pendingConsumptionPoints: 0,
    userInfo: {},

    /* 登录弹窗 */
    loginPopupVisible: false,

    /* 响应式字体类（可用/待审核消费积分共用同一档字号，确保大小一致） */
    pointsClass: '',

    /* 格式化显示的积分（带千分位） */
    pointsBalanceFormatted: '0',
    pendingConsumptionPointsFormatted: '0',

    /* ===== V2动态二维码 ===== */
    qrCodeImage: '',
    qrCodeEnlarged: false,
    /** 开发者工具中Canvas不可用标记 */
    qrDevToolsUnavailable: false,
    qrCountdown: 300,
    qrExpired: false,
    qrCountdownText: '5:00',
    qrExpiresAt: 0,

    /* ===== 消费加成活动（后端 GET /api/v4/user/consumption-bonus，方案C §十 C 端展示） =====
       用户消费码为动态身份码、不绑定门店，故展示全平台生效活动（不传 store_id/merchant_id）。
       出示付款码时告知"当前消费多送 X% 积分"，激励消费；命中全自动，用户无需选活动。 */
    /** 是否有生效的消费加成活动（后端 active=true 时展示活动条） */
    bonusActivityActive: false,
    /** 活动展示名（后端 display_name，如"双11消费多送50%积分"，直接展示） */
    bonusActivityName: '',
    /** 加成百分比文案（bonus_rate×100，如"多送 50% 积分"） */
    bonusActivityRateText: '',

    /* ===== 仓库/背包未读物品数（后端 GET /api/v4/backpack/stats 的 unviewed_items，首页角标=未读提醒） ===== */
    inventoryUnviewedCount: 0,

    /* ===== 通知未读数（后端 GET /api/v4/user/notifications/unread-count 返回） ===== */
    notificationUnreadCount: 0,

    /* ===== 审核记录（后端 GET /api/v4/shop/consumption/me 返回） ===== */
    auditRecordsCount: 0,
    auditRecordsData: [] as API.ConsumptionRecord[],
    showAuditModal: false,

    /* ===== 系统公告（后端 GET /api/v4/system/ad-delivery?slot_type=announcement 返回） ===== */
    announcements: [] as API.AdDeliveryItem[],
    /** 公告区域是否可见（有数据时显示） */
    showAnnouncements: false,
    /** 当前公告索引（用于曝光日志上报） */
    announcementCurrent: 0,

    /* ===== 弹窗横幅（后端 GET /api/v4/system/ad-delivery?slot_type=popup 返回） ===== */
    showPopupBanner: false,
    popupBanners: [] as API.AdDeliveryItem[],

    /* ===== 顶部沉浸式横幅（运营可配，后端 ad-delivery?slot_type=top_banner&position=lottery） ===== */
    /** 顶部 Banner 投放项（空则回退本地兜底图） */
    topBannerItems: [] as API.AdDeliveryItem[],
    /** 顶部 Banner 是否轮播（后端槽位级 is_carousel） */
    topBannerCarousel: false,
    /** 顶部 Banner 轮播间隔毫秒（后端槽位级 slide_interval_ms） */
    topBannerInterval: 3000,
    /** 是否有运营配置的顶部 Banner 图（false 时用本地兜底图） */
    topBannerReady: false,

    /* ===== 轮播图（后端 GET /api/v4/system/ad-delivery?slot_type=carousel 返回） ===== */
    carouselItems: [] as API.AdDeliveryItem[],
    /** 轮播间隔毫秒（取首个轮播图配置或默认3000ms） */
    carouselInterval: 3000,
    /** 当前轮播索引（用于展示日志上报） */
    carouselCurrent: 0,
    /** 轮播区域是否可见（有数据时显示） */
    showCarousel: false,

    /* ===== 页面状态 ===== */
    loading: true,

    /* ===== 多活动（后端活动位置配置 GET /api/v4/system/config/placement） ===== */
    /** 主活动（position=main, size=full） */
    mainCampaign: null as API.PlacementItem | null,
    /** 其他活动列表（secondary/floating等） */
    extraCampaigns: [] as API.PlacementItem[]
  },

  // ========================================
  // 页面生命周期
  // ========================================

  onLoad() {
    /* MobX Store绑定 - 用户/积分状态自动同步 */
    this.userStoreBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })
    this.pointsStoreBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: {
        /* 原始积分值 */
        pointsBalance: () => pointsStore.availableAmount,
        pendingConsumptionPoints: () => pointsStore.pendingConsumptionPoints,
        /* 格式化积分显示（带千分位分隔符） - 当Store变化时自动重新计算 */
        pointsBalanceFormatted: () => formatPointsDisplay(pointsStore.availableAmount),
        pendingConsumptionPointsFormatted: () =>
          formatPointsDisplay(pointsStore.pendingConsumptionPoints),
        /* 响应式字体CSS类 - 取可用/待审核消费积分位数最多者，两数字共用同一档字号 */
        pointsClass: () =>
          getPointsDisplayClass(pointsStore.availableAmount, pointsStore.pendingConsumptionPoints)
      },
      actions: ['setBalance']
    })

    this._isFirstLoad = true
    this.checkAdminRole()
    this.initializePage()

    /** WebSocket 通知角标实时更新的页面订阅ID */
    this._wsPageId = 'lottery'
  },

  onReady() {
    /* 标记 Canvas 已就绪 */
    this._canvasReady = true

    /* Canvas就绪后生成用户身份二维码 */
    if (this.data.userInfo?.user_id && checkAuth({ redirect: false }) && !this.data.qrCodeImage) {
      this.generateUserQRCode()
    }
  },

  async onShow() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 0 })
      }
    }
    /* 首次加载由 initializePage() 统一处理认证和数据，onShow 不重复检查 */
    if (this._isFirstLoad) {
      return
    }

    if (!checkAuth({ redirect: false })) {
      return
    }

    const userInfo = restoreUserInfo()
    if (!userInfo) {
      return
    }

    /**
     * 防闪烁核心优化：将 onShow 中所有同步 setData 合并为单次调用
     *
     * 原问题：onShow 中 4 处独立 setData（loading/状态批量/主题/二维码过期），
     * 每次 setData 触发页面级 WXML 完整重新求值 → lottery-activity 子组件级联 diff
     * → egg 奖品预览区 CSS marquee 动画帧被中断 → 用户看到短暂空白/白闪
     *
     * 修复：合并为单次 setData，仅包含真正变化的字段，一帧内完成所有更新
     */
    const onShowPatch: Record<string, any> = {}

    if (this.data.loading) {
      onShowPatch.loading = false
    }
    if (!this.data.isLoggedIn) {
      onShowPatch.isLoggedIn = true
    }
    if (this.data.loginPopupVisible) {
      onShowPatch.loginPopupVisible = false
    }

    const currentBalance = pointsStore.availableAmount || 0
    const currentPending = pointsStore.pendingConsumptionPoints || 0
    if (currentBalance !== this.data.pointsBalance) {
      onShowPatch.pointsBalance = currentBalance
      onShowPatch.pointsBalanceFormatted = Utils.formatPoints(currentBalance)
    }
    if (currentPending !== this.data.pendingConsumptionPoints) {
      onShowPatch.pendingConsumptionPoints = currentPending
      onShowPatch.pendingConsumptionPointsFormatted = Utils.formatPoints(currentPending)
    }
    /* 可用/待审核任一变化都需重算共用字号（取两者位数最多者） */
    if (
      currentBalance !== this.data.pointsBalance ||
      currentPending !== this.data.pendingConsumptionPoints
    ) {
      onShowPatch.pointsClass = getPointsDisplayClass(currentBalance, currentPending)
    }
    if (userInfo !== this.data.userInfo) {
      onShowPatch.userInfo = userInfo
    }

    /* V2动态码：从后台恢复时检查二维码是否过期 → 自动刷新 */
    if (this.data.qrExpiresAt && Date.now() >= this.data.qrExpiresAt) {
      if (this._qrTimer) {
        clearInterval(this._qrTimer)
        this._qrTimer = null
      }
      onShowPatch.qrCountdown = 0
      onShowPatch.qrExpired = false
      onShowPatch.qrCodeImage = ''
      onShowPatch.qrCountdownText = '刷新中...'
      // 延迟触发自动刷新（等 setData 完成后）
      setTimeout(() => {
        this.generateUserQRCode()
      }, 500)
    } else if (this.data.qrCodeImage && !this._qrTimer) {
      // 二维码未过期但定时器已被 onHide 清除，重新计算剩余时间并重启倒计时
      const remaining = Math.max(0, Math.floor((this.data.qrExpiresAt - Date.now()) / 1000))
      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      onShowPatch.qrCountdown = remaining
      onShowPatch.qrCountdownText = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      setTimeout(() => {
        this.startQrCountdown()
      }, 100)
    }

    if (Object.keys(onShowPatch).length > 0) {
      this.setData(onShowPatch)
    }
    this.applyNativeThemeColors()

    /**
     * 治理项3：onShow 非关键刷新时间窗节流（削峰，避免频繁切 Tab 反复打接口）
     * 距上次刷新 < ONSHOW_REFRESH_THROTTLE 则跳过活动/公告/角标刷新；
     * 仅控刷新频率，业务数据仍以后端为准（下拉刷新 onPullDownRefresh 不受此节流限制）。
     */
    const nowTs = Date.now()
    const refreshThrottle = Constants.DELAY.ONSHOW_REFRESH_THROTTLE
    const shouldRefreshNonCritical =
      this._isFirstLoad ||
      !this._lastOnShowRefresh ||
      nowTs - this._lastOnShowRefresh >= refreshThrottle

    if (shouldRefreshNonCritical) {
      this._lastOnShowRefresh = nowTs

      /* 非首次加载时刷新弹窗横幅和系统公告 */
      if (!this._isFirstLoad) {
        this.loadPopupBanners()
        this.loadHomeAnnouncements()
      }

      /* 并行加载角标计数（消费记录/仓库物品/通知未读），合并为单次 setData */
      this._refreshBadgeCounts()

      /* 加载当前页面活动列表（任务27） */
      this._loadCampaigns()

      /* 加载当前生效的消费加成活动（方案C §十，付款码区展示"消费多送X%"） */
      this._loadConsumptionBonusActivity()
    } else {
      log.info('[lottery] onShow 距上次刷新过近，跳过活动/公告/角标刷新（节流削峰）')
    }

    /* 首次显示且尚未生成二维码时生成 */
    if (!this.data.qrCodeImage && this.data.userInfo?.user_id) {
      this.generateUserQRCode()
    }

    /* 刷新积分数据（关键数据，不受节流限制） */
    this._refreshPoints()

    /* Tab回前台时重新连接WebSocket并订阅通知事件 */
    this._setupWebSocketNotification()
  },

  async onPullDownRefresh() {
    try {
      /* 并行刷新：积分数据 + 系统公告 + 位置配置 + 活动列表 */
      await Promise.all([
        this._refreshPoints(),
        this.loadHomeAnnouncements().catch((announcementError: any) => {
          log.warn('[lottery] 公告刷新失败（不影响主功能）:', announcementError)
        }),
        ConfigCache.configCache.forceRefresh().catch((refreshError: any) => {
          log.warn('[lottery] 配置刷新失败（不影响主功能）:', refreshError)
        })
      ])
      /* 配置刷新后重新加载活动列表 */
      await this._loadCampaigns()
    } catch (pullError) {
      log.error('[lottery] 下拉刷新失败:', pullError)
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  /** TabBar页面切换时上报轮播/公告最后一次曝光 + 清理QR刷新定时器 + 取消WS订阅 */
  onHide() {
    this._flushCarouselExposure()
    this._flushAnnouncementExposure()
    if (this._qrRefreshTimer) {
      clearTimeout(this._qrRefreshTimer)
      this._qrRefreshTimer = null
    }
    /* 清理QR倒计时定时器（setInterval），防止TabBar切换后后台持续运行 */
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
    }
    const hideApp = getApp() as any
    hideApp.unsubscribeWebSocketMessages(this._wsPageId)
  },

  onUnload() {
    this._flushCarouselExposure()
    this._flushAnnouncementExposure()

    if (this.userStoreBindings) {
      this.userStoreBindings.destroyStoreBindings()
    }
    if (this.pointsStoreBindings) {
      this.pointsStoreBindings.destroyStoreBindings()
    }
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
    }
    if (this._qrRefreshTimer) {
      clearTimeout(this._qrRefreshTimer)
      this._qrRefreshTimer = null
    }
  },

  /** 上报当前可见轮播图的最后一次曝光（页面离开时调用，避免曝光数据丢失） */
  _flushCarouselExposure() {
    if (
      this.data.showCarousel &&
      this.data.carouselItems.length > 0 &&
      this._carouselExposureStart
    ) {
      this._reportCarouselExposure(this.data.carouselCurrent, false, false)
      this._carouselExposureStart = 0
    }
  },

  /** 上报当前可见公告条的最后一次曝光（页面离开时调用，避免曝光数据丢失） */
  _flushAnnouncementExposure() {
    if (
      this.data.showAnnouncements &&
      this.data.announcements.length > 0 &&
      this._announcementExposureStart
    ) {
      this._reportAnnouncementImpression(this.data.announcementCurrent)
      this._announcementExposureStart = 0
    }
  },

  onShareAppMessage() {
    return {
      title: '我在领消费回馈，一起来看看好礼！',
      path: '/pages/lottery/lottery'
    }
  },

  // ========== 登录弹窗控制 ==========

  /** 显示登录弹窗（用户主动点击页面「请登录」按钮时调用） */
  onShowLoginPopup() {
    this.setData({ loginPopupVisible: true })
  },

  /**
   * 游客点抽奖时的引导（lottery-activity 的 needlogin 事件）
   *
   * 合规要求：首页未完整体验前不得强制弹授权登录（微信审核规范）。
   * 故游客点抽奖不再自动弹登录弹窗，仅轻提示引导，由用户自主点击页面顶部
   * 「请登录」按钮再登录，把"是否登录"的选择权交还用户。
   */
  onGuestDraw() {
    showToast('登录后即可参与抽奖赚积分', 'none', 2000)
  },

  /** 关闭登录弹窗 */
  onLoginPopupClose() {
    this.setData({ loginPopupVisible: false })
  },

  /** 登录成功回调 - 刷新页面数据 */
  async onLoginSuccess() {
    this.setData({ loginPopupVisible: false })

    // 恢复用户信息并刷新页面
    const restoredUserInfo = restoreUserInfo()
    if (restoredUserInfo) {
      this.setData({ isLoggedIn: true, userInfo: restoredUserInfo })
      this.checkAdminRole()

      // 并行加载登录后才需要的数据
      await Promise.all([
        this._refreshPoints(),
        this._loadCampaigns().catch((err: any) => {
          log.error('[lottery] 活动列表刷新失败:', err)
        }),
        this.loadNotificationUnreadCount().catch(() => {}),
        this.loadInventoryItemCount().catch(() => {}),
        /**
         * 登录后补拉所有 ad-delivery 图片位：这些接口均需登录态，
         * 登出态进页面时被首屏的未登录早退分支跳过，登录成功后统一补拉，避免漏图。
         */
        this.loadTopBanner().catch(() => {}),
        this.loadCarouselItems().catch(() => {}),
        this.loadPopupBanners().catch(() => {}),
        this.loadHomeAnnouncements().catch(() => {})
      ])

      // 二维码单独生成（不放入 Promise.all，确保在数据加载完成后独立执行）
      if (restoredUserInfo.user_id && !this.data.qrCodeImage) {
        this._qrGenerating = false // 强制重置锁，确保可以执行
        this.generateUserQRCode()
      }
    }
  },

  /**
   * 将微信原生导航栏、TabBar 颜色同步为当前主题色
   * CSS 变量只能控制 WXML 内元素，导航栏和 TabBar 属于框架层需通过 JS API 设置
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

  // ========================================
  // 页面初始化
  // ========================================

  async initializePage() {
    let restoredUserInfo: any = null
    try {
      const isAuthenticated = checkAuth({ redirect: false })

      if (!isAuthenticated) {
        this.setData({ isLoggedIn: false, loading: false })
        this._isFirstLoad = false
        this.applyNativeThemeColors()
        /**
         * 未登录也加载公开内容：活动列表 + 运营图片位（ad-delivery 已改 optionalAuth，
         * 匿名可拿 operational/system 内容），实现"未登录也能看见运营图"。
         * 各 loader 已自带 try/catch 兜底，失败回退本地兜底图，不阻塞页面。
         */
        await Promise.all([
          this._loadCampaigns().catch((campaignErr: any) => {
            log.error('[lottery] 活动列表加载失败:', campaignErr)
          }),
          this.loadTopBanner().catch(() => {}),
          this.loadCarouselItems().catch(() => {}),
          this.loadHomeAnnouncements().catch(() => {})
        ])
        return
      }

      /* 首次加载时恢复用户信息（onShow 因 _isFirstLoad=true 会跳过） */
      restoredUserInfo = restoreUserInfo()
      if (restoredUserInfo) {
        this.setData({ isLoggedIn: true, userInfo: restoredUserInfo })
      }

      this.applyNativeThemeColors()

      /* 并行加载：积分数据、活动列表、系统公告、弹窗横幅、轮播图、通知未读数 */
      await Promise.all([
        this._refreshPoints(),
        this._loadCampaigns().catch((campaignErr: any) => {
          log.error('[lottery] 活动列表加载失败:', campaignErr)
        }),
        this.loadHomeAnnouncements().catch((err: any) => {
          log.error('[lottery] 系统公告加载失败（不影响主功能）:', err)
        }),
        this.loadPopupBanners().catch((err: any) => {
          log.error('[lottery] 弹窗横幅加载失败（不影响主功能）:', err)
        }),
        this.loadCarouselItems().catch((err: any) => {
          log.error('[lottery] 轮播图加载失败（不影响主功能）:', err)
        }),
        this.loadTopBanner().catch((err: any) => {
          log.error('[lottery] 顶部Banner加载失败（不影响主功能）:', err)
        }),
        this.loadNotificationUnreadCount().catch((err: any) => {
          log.warn('[lottery] 通知未读数加载失败（不影响主功能）:', err)
        })
      ])
    } catch (error) {
      log.error('[lottery] 页面初始化失败:', error)
      wx.showModal({
        title: '页面加载失败',
        content: '请检查网络连接后重试。',
        showCancel: true,
        cancelText: '稍后再试',
        confirmText: '重新加载',
        success: res => {
          if (res.confirm) {
            this.initializePage()
          }
        }
      })
    } finally {
      const finalData: any = {}

      /* 移除加载遮罩 */
      if (this.data.isLoggedIn || !this.data.loading) {
        finalData.loading = false
      }

      /* 弹窗横幅数据一并设置（同一帧显示） */
      if (this._preparedBanners?.length > 0) {
        finalData.popupBanners = this._preparedBanners
        finalData.showPopupBanner = true
        this._preparedBanners = null
        this._bannerShowStartTime = Date.now()
      }

      if (Object.keys(finalData).length > 0) {
        this.setData(finalData)
      }
      this._isFirstLoad = false

      /* 首次加载完成后连接WebSocket并订阅通知事件（修复隐患1+2：冷启动铃铛实时更新） */
      if (this.data.isLoggedIn) {
        this._setupWebSocketNotification()
      }

      /**
       * 二维码生成：使用离屏 Canvas，不依赖页面 DOM，可立即触发
       */
      const hasUserId = this.data.userInfo?.user_id || restoredUserInfo?.user_id
      if (this.data.isLoggedIn && hasUserId && !this.data.qrCodeImage && !this._qrGenerating) {
        this.generateUserQRCode()
      }
    }
  },

  // ========================================
  // 多活动加载（任务27 + 位置配置缓存）
  // ========================================

  /**
   * 加载当前页面的活动列表（集成位置配置缓存）
   *
   * 流程：
   *   1. 通过 ConfigCache 获取活动位置配置（缓存优先）
   *   2. 通过 API.getActiveCampaigns 获取后端 active 活动列表（文档接口B）
   *   3. 将活动列表与位置配置合并，按位置分组和优先级排序
   *   4. 设置 mainCampaign（position=main）和 extraCampaigns（其他位置）
   */
  async _loadCampaigns() {
    try {
      /* 并行获取：位置配置 + 进行中的活动列表（文档接口B: GET /lottery/campaigns/active） */
      const [placementConfig, campaignsResult] = await Promise.all([
        ConfigCache.configCache.getConfig(),
        API.getActiveCampaigns()
      ])

      /* 活动列表数据校验 */
      if (!campaignsResult?.success || !campaignsResult.data) {
        log.warn('[lottery] 活动列表获取失败或为空')
        return
      }

      const activeCampaigns = Array.isArray(campaignsResult.data) ? campaignsResult.data : []

      if (activeCampaigns.length === 0) {
        log.warn('[lottery] 后端无进行中的活动')
        this.setData({ mainCampaign: null, extraCampaigns: [] })
        return
      }

      /* 根据位置配置处理活动列表 */
      const processedResult = this._processCampaignsWithPlacement(activeCampaigns, placementConfig)

      /*
       * 降级策略：位置配置未匹配到任何活动时，使用后端返回的第一个active活动作为主活动
       * 避免因位置配置延迟或缓存过期导致抽奖区域空白
       */
      if (!processedResult.mainCampaign && activeCampaigns.length > 0) {
        log.warn(
          '[lottery] 位置配置未匹配到活动，使用第一个active活动作为主活动:',
          activeCampaigns[0].campaign_code
        )
        processedResult.mainCampaign = {
          ...activeCampaigns[0],
          placement: { page: 'lottery', position: 'main', size: 'full', priority: 100 }
        }
      }

      /*
       * 防止组件不必要的销毁重建：仅当 campaign_code 真正变化时才更新 mainCampaign
       * 相同活动只更新 extraCampaigns，避免 setData 替换对象引用导致
       * lottery-activity 组件被框架销毁→重建→重新 initActivity()→"加载中..."卡住
       */
      const existingCode = this.data.mainCampaign?.campaign_code
      const newCode = processedResult.mainCampaign?.campaign_code

      if (existingCode && existingCode === newCode) {
        /**
         * 防闪烁：extraCampaigns 内容相同时跳过 setData，
         * 避免页面级 WXML 重新求值波及 lottery-activity 组件
         */
        const existingExtraCodes = this.data.extraCampaigns
          .map((c: any) => c.campaign_code)
          .join(',')
        const newExtraCodes = processedResult.extraCampaigns
          .map((c: any) => c.campaign_code)
          .join(',')
        if (existingExtraCodes !== newExtraCodes) {
          this.setData({ extraCampaigns: processedResult.extraCampaigns })
        }
        log.info('[lottery] 活动未变化，跳过 mainCampaign 更新:', existingCode)

        /**
         * 玩法热更新：campaign_code 不变时不会触发组件 observer 重拉 config，
         * 而运营可能只改了玩法（display_mode），故主动通知组件重新拉取，
         * 使新玩法在「下次进页/下拉刷新」即时生效（无需重新编译、无需重登）。
         */
        const activityComp = this.selectComponent('#main-lottery-activity')
        if (activityComp && typeof activityComp.refreshActivity === 'function') {
          activityComp.refreshActivity(newCode)
        }
      } else {
        this.setData({
          mainCampaign: processedResult.mainCampaign,
          extraCampaigns: processedResult.extraCampaigns
        })
        log.info('[lottery] 活动加载完成', {
          mainCampaign: newCode || '无',
          extraCount: processedResult.extraCampaigns.length
        })
      }
    } catch (loadError: any) {
      log.error('[lottery] 加载活动列表失败:', loadError)

      /*
       * 容错保护：已有有效活动时不清空 mainCampaign，避免摧毁正在运行的抽奖组件
       * 仅在首次加载（mainCampaign 为空）时才设为 null，显示"暂无活动"占位
       * 未登录导致的失败不弹 toast（属于正常状态）
       */
      if (!this.data.mainCampaign) {
        this.setData({ mainCampaign: null, extraCampaigns: [] })
      }
      if (loadError?.isAuthError || loadError?.message === '用户未登录') {
        log.info('[lottery] 未登录，跳过活动加载提示')
      } else {
        wx.showToast({ title: '活动刷新失败，当前展示缓存数据', icon: 'none', duration: 2500 })
      }
    }
  },

  /**
   * 根据位置配置处理活动列表
   * 将后端返回的活动列表与位置配置合并，按位置分组和优先级排序
   *
   * @param activeCampaigns 后端返回的 active 活动列表
   * @param placementConfig 位置配置数据
   * @returns 分组后的主活动和其他活动
   */
  _processCampaignsWithPlacement(activeCampaigns: any[], placementConfig: any) {
    const nowMs = Date.now()
    const placements = (placementConfig && placementConfig.placements) || []

    /* 为每个活动附加位置信息 + 展示控制字段处理 */
    const campaignsWithPlacement = activeCampaigns
      .map((campaign: any) => {
        /**
         * 防御性过滤: is_hidden === true 的活动不展示
         * 后端 /lottery/campaigns/active 应已过滤，此处做二次防御
         */
        if (campaign.is_hidden === true) {
          return null
        }

        const matchedPlacement = placements.find(
          (p: any) => p.campaign_code === campaign.campaign_code
        )

        if (!matchedPlacement) {
          log.warn('[lottery] 活动未配置位置，已过滤:', campaign.campaign_code)
          return null
        }

        /**
         * 展示控制字段处理（文档 8.2 / 10.15.6）
         *
         * is_featured      - 精选活动高亮展示
         * display_tags     - 展示标签数组（如 ["限时","新活动","热门"]）
         * display_start_time - 预热展示开始时间（活动未开始但可展示倒计时）
         * display_end_time   - 收尾展示结束时间（活动已结束但仍可查看）
         */
        const startTimeMs = campaign.start_time ? new Date(campaign.start_time).getTime() : 0
        const endTimeMs = campaign.end_time ? new Date(campaign.end_time).getTime() : 0
        const displayStartMs = campaign.display_start_time
          ? new Date(campaign.display_start_time).getTime()
          : 0
        const displayEndMs = campaign.display_end_time
          ? new Date(campaign.display_end_time).getTime()
          : 0

        let displayPhase = 'active'
        let countdownTarget = 0

        if (startTimeMs && nowMs < startTimeMs) {
          if (displayStartMs && nowMs >= displayStartMs) {
            displayPhase = 'preview'
            countdownTarget = startTimeMs
          } else if (!displayStartMs) {
            displayPhase = 'upcoming'
          }
        } else if (endTimeMs && nowMs > endTimeMs) {
          if (displayEndMs && nowMs <= displayEndMs) {
            displayPhase = 'ended'
          } else if (!displayEndMs) {
            displayPhase = 'ended'
          }
        }

        const parsedDisplayTags: string[] = Array.isArray(campaign.display_tags)
          ? campaign.display_tags
          : []

        return {
          ...campaign,
          placement: matchedPlacement.placement,
          _isFeatured: campaign.is_featured === true,
          _displayTags: parsedDisplayTags,
          _displayPhase: displayPhase,
          _countdownTarget: countdownTarget
        }
      })
      .filter(Boolean)

    /* 筛选当前页面（lottery）的活动 */
    const lotteryPageCampaigns = campaignsWithPlacement.filter(
      (c: any) => c.placement.page === 'lottery'
    )

    /* 主活动：position=main 的第一个（is_featured 优先） */
    const featuredMain = lotteryPageCampaigns.find(
      (c: any) => c.placement.position === 'main' && c._isFeatured
    )
    const mainCampaign =
      featuredMain || lotteryPageCampaigns.find((c: any) => c.placement.position === 'main') || null

    /**
     * 其他活动：排除 main 位置
     * 排序规则: is_featured 优先 → placement.priority 降序
     */
    const extraCampaigns = lotteryPageCampaigns
      .filter((c: any) => c.placement.position !== 'main')
      .sort((a: any, b: any) => {
        if (a._isFeatured !== b._isFeatured) {
          return a._isFeatured ? -1 : 1
        }
        return (b.placement.priority || 0) - (a.placement.priority || 0)
      })

    return { mainCampaign, extraCampaigns }
  },

  // ========================================
  // 积分数据

  /**
   * 抽奖组件积分变更事件处理（bind:pointsupdate）
   *
   * lottery-activity 组件每次抽奖成功后触发此事件，
   * 页面收到后调用 _refreshPoints() 从后端获取最新余额并刷新显示
   *
   * 数据流：组件 triggerEvent('pointsupdate')
   *       → 页面 onPointsUpdate()
   *       → API.getPointsBalance()
   *       → pointsStore.setBalance()
   *       → updatePointsDisplay() → this.setData({ pointsBalanceFormatted })
   *       → 页面头部"可用积分"立即更新
   */
  onPointsUpdate() {
    this._refreshPoints()
  },

  /** 刷新积分余额（委托 pointsStore.refreshFromAPI，消除重复逻辑）
   *
   * 防闪烁优化：refreshFromAPI 更新 store 后，MobX binding（onLoad 中配置）
   * 会自动同步 pointsBalance/pendingConsumptionPoints/pointsBalanceFormatted/pointsClass 等全部字段，
   * 无需再手动调用 updatePointsDisplay()，避免同一帧内双重 setData
   * 导致 lottery-activity → egg 子组件级联 diff → 奖品预览区 marquee 动画中断
   */
  async _refreshPoints() {
    if (!this.data.isLoggedIn) {
      return
    }
    try {
      const { available, pendingConsumptionPoints } = await pointsStore.refreshFromAPI()
      this.setData({
        pointsBalance: available,
        pendingConsumptionPoints,
        pointsBalanceFormatted: Utils.formatPoints(available),
        pendingConsumptionPointsFormatted: Utils.formatPoints(pendingConsumptionPoints)
      })
    } catch (err) {
      log.error('[lottery] 刷新积分失败:', err)
    }
  },

  // ========================================
  // 积分显示（格式化 + 响应式字体）
  // ========================================

  /**
   * 统一更新积分显示（复用模块级 getPointsDisplayClass）
   * 防闪烁优化：仅当值真正变化时才 setData，避免页面级 WXML 重新求值
   * 导致 lottery-activity → egg 子组件级联 diff → 奖品预览区 marquee 动画中断
   */
  updatePointsDisplay(points: number, pendingConsumptionPoints: number) {
    const patch: Record<string, any> = {}
    if (points !== this.data.pointsBalance) {
      patch.pointsBalance = points
      patch.pointsBalanceFormatted = Utils.formatPoints(points)
    }
    if (pendingConsumptionPoints !== this.data.pendingConsumptionPoints) {
      patch.pendingConsumptionPoints = pendingConsumptionPoints
      patch.pendingConsumptionPointsFormatted = Utils.formatPoints(pendingConsumptionPoints)
    }
    /* 可用/待审核任一变化都需重算共用字号（取两者位数最多者） */
    if (
      points !== this.data.pointsBalance ||
      pendingConsumptionPoints !== this.data.pendingConsumptionPoints
    ) {
      patch.pointsClass = getPointsDisplayClass(points, pendingConsumptionPoints)
    }
    if (Object.keys(patch).length > 0) {
      this.setData(patch)
    }
  },

  // ========================================
  // V2动态身份二维码
  // ========================================

  /**
   * 生成用户V2动态二维码
   *
   * DB-3修复后，所有已登录用户统一调用用户域端点：
   *   GET /api/v4/user/consumption/qrcode（仅需 authenticateToken，无角色限制）
   *
   * 管理员为其他用户生成二维码时使用 console 端点：
   *   GET /api/v4/console/consumption/qrcode/:user_id（需 role_level >= 100）
   */
  async generateUserQRCode() {
    /* 防重入：避免多处同时触发导致重复请求 */
    if (this._qrGenerating) {
      return
    }
    this._qrGenerating = true

    try {
      const userInfo = this.data.userInfo || userStore.userInfo
      if (!userInfo?.user_id) {
        showToast('请先登录', 'none', 2000)
        return
      }

      /* 等待 Canvas 就绪（onReady 触发后 _canvasReady = true） */
      if (!this._canvasReady) {
        let waitCount = 0
        const maxWait = 20
        await new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            waitCount++
            if (this._canvasReady || waitCount >= maxWait) {
              clearInterval(checkInterval)
              resolve()
            }
          }, 100)
        })
        if (!this._canvasReady) {
          log.warn('[lottery] Canvas 等待超时，尝试直接生成')
        }
      }

      const qrCodeResult = await API.getUserQRCode()
      if (!qrCodeResult?.success) {
        showToast(qrCodeResult?.message || '生成二维码失败', 'none', 2000)
        return
      }

      const qrCodeData = qrCodeResult.data
      const qrContent = qrCodeData.qr_code

      /* 计算过期时间戳（倒计时数据源，对接文档 2026-06-25 §9.2 + B-2）：
         优先用后端 validity_seconds（数值秒）换算绝对过期时刻；
         缺失时回退解析 expires_at（已统一为单一 UTC ISO 字符串）。 */
      let expiresTimestamp = 0
      if (typeof qrCodeData.validity_seconds === 'number' && qrCodeData.validity_seconds > 0) {
        expiresTimestamp = Date.now() + qrCodeData.validity_seconds * 1000
      } else {
        expiresTimestamp = (
          Utils.safeParseDateString(qrCodeData.expires_at) || new Date()
        ).getTime()
      }

      QRCode.drawQrcodeToImage(this, '#qrcodeCanvas', {
        text: qrContent,
        width: 428,
        height: 428,
        typeNumber: -1,
        correctLevel: 2,
        background: '#ffffff',
        foreground: '#000000'
      })
        .then((tempFilePath: string) => {
          const remaining = Math.max(0, Math.floor((expiresTimestamp - Date.now()) / 1000))
          const minutes = Math.floor(remaining / 60)
          const seconds = remaining % 60
          this.setData({
            qrCodeImage: tempFilePath,
            qrCountdown: remaining,
            qrExpired: false,
            qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`,
            qrExpiresAt: expiresTimestamp
          })
          this.startQrCountdown()
        })
        .catch((canvasErr: any) => {
          log.warn('[lottery] Canvas生成失败，尝试使用后端图片URL:', canvasErr?.message)
          if (qrCodeData.qrcode_url || qrCodeData.image_url) {
            const remaining = Math.max(0, Math.floor((expiresTimestamp - Date.now()) / 1000))
            const minutes = Math.floor(remaining / 60)
            const seconds = remaining % 60
            this.setData({
              qrCodeImage: qrCodeData.qrcode_url || qrCodeData.image_url,
              qrCountdown: remaining,
              qrExpired: false,
              qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`,
              qrExpiresAt: expiresTimestamp
            })
            this.startQrCountdown()
          } else {
            log.error('[lottery] 所有二维码生成方式均失败')
            this.setData({ qrDevToolsUnavailable: true })
          }
        })
    } catch (error: any) {
      log.error('[lottery] 生成V2二维码异常:', error)

      if (error.code === 'USER_UUID_MISSING') {
        wx.showModal({
          title: '身份信息异常',
          content: '请重新登录以刷新身份信息',
          showCancel: false,
          confirmText: '重新登录',
          success: () => {
            const appInstance = getApp()
            appInstance.clearAuthData()
            this.setData({ isLoggedIn: false, loginPopupVisible: true })
          }
        })
        return
      }

      showToast('二维码生成异常', 'none', 2000)
    } finally {
      this._qrGenerating = false
    }
  },

  /**
   * V2二维码倒计时（临近过期自动预刷新，无需手动点击，也无需等到过期）
   *
   * 对接文档 2026-06-25 §9.1：后端有效期 5 分钟，前端刷新必须"早于过期"。
   * 取阈值 60 秒——5 分钟(300s)码在剩余 ≤60s（即第 4 分钟）时即自动换新码，
   * 既满足"每 4 分钟刷新"，又满足"早于 5 分钟过期"的硬约束，避免商家扫到即将
   * 过期的码导致提交时 QRCODE_EXPIRED。阈值随后端有效期自适应（基于真实剩余秒数判断）。
   */
  startQrCountdown() {
    /** 临近过期预刷新阈值（秒）：剩余 ≤ 此值即换新码。须 < 后端 5 分钟有效期，60s=第4分钟刷新 */
    const QR_PRE_REFRESH_SECONDS = 60

    if (this._qrTimer) {
      clearInterval(this._qrTimer)
    }

    this._qrTimer = setInterval(() => {
      const remaining = this.data.qrCountdown - 1
      if (remaining <= QR_PRE_REFRESH_SECONDS) {
        clearInterval(this._qrTimer)
        this._qrTimer = null
        // 第4分钟（剩60秒）即预刷新，早于后端5分钟过期，避免商家扫到过期码
        this._autoRefreshQR()
        return
      }
      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      this.setData({
        qrCountdown: remaining,
        qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      })
    }, 1000)
  },

  /**
   * 自动刷新二维码（临近过期预刷新触发，对接文档 2026-06-25 §9.1）
   * 在码仍有效（剩约60秒）时换新码，使下一笔消费用全新 nonce 提交，避免商家扫到过期码。
   * 安全机制：最多自动刷新50次（约4小时持续展示），超出后需手动刷新。
   */
  _autoRefreshQR() {
    const MAX_AUTO_REFRESH = 50
    const count = (this._qrAutoRefreshCount || 0) as number

    if (count >= MAX_AUTO_REFRESH) {
      log.info('二维码自动刷新已达上限（' + MAX_AUTO_REFRESH + '次），请手动刷新')
      this.setData({ qrCountdown: 0, qrExpired: true, qrCountdownText: '已过期' })
      return
    }

    log.info('二维码临近过期，预刷新换新码（第' + (count + 1) + '次）')
    this._qrAutoRefreshCount = count + 1

    // 先显示"刷新中"状态
    this.setData({
      qrCountdown: 0,
      qrExpired: false,
      qrCodeImage: '',
      qrCountdownText: '刷新中...'
    })

    // 延迟2秒后自动刷新，避免频繁请求（赋值到实例属性以便 onHide/onUnload 清理）
    this._qrRefreshTimer = setTimeout(() => {
      this._qrRefreshTimer = null
      this.generateUserQRCode()
    }, 2000)
  },

  /** 手动刷新V2动态二维码（重置自动刷新计数） */
  onRefreshQRCode() {
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
    }
    // 手动刷新时重置自动刷新计数
    this._qrAutoRefreshCount = 0
    this.setData({
      qrCodeImage: '',
      qrExpired: false,
      qrCountdown: 0,
      qrCountdownText: '--:--'
    })
    this.generateUserQRCode()
  },

  /** 放大二维码 */
  enlargeQRCode() {
    if (!this.data.qrCodeImage) {
      showToast('二维码尚未生成', 'none', 2000)
      return
    }
    this.setData({ qrCodeEnlarged: true })
  },

  /** 关闭放大的二维码 */
  closeEnlargedQRCode() {
    this.setData({ qrCodeEnlarged: false })
  },

  /** 阻止弹窗内容点击冒泡到遮罩层 */
  stopTap() {},

  // ========================================
  // 管理员功能
  // ========================================

  /**
   * 检查用户商家功能权限（首页四个按钮显隐的唯一入口）
   *
   * 统一以后端 GET /api/v4/permissions/me 下发的 permissions / role_level 为权威数据源
   * （对接文档 2026-06-24 §10.7、2026-06-25 §8.2），杜绝口径不一致：
   *   - 扫码核销 showScan：拥有 consumption:scan_user 权限
   *   - 消费录入 showConsumptionSubmit：拥有 consumption:create 权限
   *   - 我的提交 showMySubmissions：拥有 consumption:read 权限
   *   - 审核详情 showAudit：审核链待办参与者（role_level>=20，店员/店长/管理员）。
   *     审核链改为"店长审→管理员终审"两级后，店长(lv40)也是审核人，入口须对其可见；
   *     与后端 my-pending（requireRoleLevel(20)）+ audit-list 页准入(canReviewChain)同口径，
   *     具体能审哪一步由后端按节点角色 + 门店/区域隔离精校（前端只控入口可见）。
   */
  async checkAdminRole() {
    try {
      const apiResult = await API.getMyPermissions()
      if (!apiResult?.success || !apiResult.data) {
        throw new Error(apiResult?.message || '权限接口未返回有效数据')
      }

      const permissionData: API.PermissionsMeData = apiResult.data
      const rawPermissions = permissionData.permissions
      const roleLevel =
        typeof permissionData.role_level === 'number' ? permissionData.role_level : 0

      /* 统一权限判定（utils/permission.ts）：消费类按钮走 hasPermission(权限码)，
         审核详情走 canReviewChain(role_level>=20)，与后端审核链待办门槛同口径 */
      this.setData({
        showScan: Permission.canScan(rawPermissions),
        showConsumptionSubmit: Permission.canSubmitConsumption(rawPermissions),
        showAudit: Permission.canReviewChain(roleLevel),
        showMySubmissions: Permission.canViewMySubmissions(rawPermissions)
      })
    } catch (error) {
      /* 权限拉取失败一律按最小权限处理：所有按钮隐藏，避免无权限误显示 */
      log.error('[lottery] 商家功能权限检查失败:', error)
      this.setData({
        showScan: false,
        showConsumptionSubmit: false,
        showAudit: false,
        showMySubmissions: false
      })
    }
  },

  /** 扫码核销 — 扫描用户V2动态二维码后跳转消费录入页面（管理员/商家店员） */
  onScanTap() {
    if (!this.data.showScan) {
      showToast('无权限访问', 'none', 2000)
      return
    }
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: res => this.handleScanResult(res.result),
      fail: err => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          showToast('扫码失败，请重试', 'none', 2000)
        }
      }
    })
  },

  /** 消费录入 — 直接进入消费录入页面，手动填写消费信息后再扫码识别顾客 */
  onConsumeEntryTap() {
    if (!this.data.showConsumptionSubmit) {
      showToast('无权限访问', 'none', 2000)
      return
    }
    wx.navigateTo({
      url: '/packageAdmin/consume-submit/consume-submit',
      fail: navErr => {
        log.error('[lottery] 跳转消费录入页面失败:', navErr)
        showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  /** 处理扫码结果（V2动态码校验） */
  handleScanResult(qrCode: string) {
    if (!qrCode || !qrCode.startsWith('QRV2_')) {
      wx.showModal({
        title: '二维码无效',
        content: '该二维码不是有效的V2身份二维码。请让用户刷新二维码后重试。',
        showCancel: false
      })
      return
    }
    wx.navigateTo({
      url: `/packageAdmin/consume-submit/consume-submit?qrCode=${encodeURIComponent(qrCode)}`,
      fail: err => {
        log.error('[lottery] 跳转失败:', err)
        showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  /**
   * 跳转到审核详情页
   *
   * 权限判定全部交给后端（方案B，对接文档2026-06-24）：不做本地"是否门店店员"前置拦截，
   * 点击即跳转。审核页与后端接口按 role_level 统一判定——管理员/超管(role_level>=100)
   * 后端无条件放行，避免前端本地规则与后端漂移误伤管理员账号。
   */
  onAuditTap() {
    wx.navigateTo({
      url: '/packageAdmin/audit-list/audit-list',
      fail: err => {
        log.error('[lottery] 跳转失败:', err)
        showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  /**
   * 跳转到「我的提交」页（店员查看本人提交的消费记录及审核状态）
   *
   * 与「审核详情」区分（对接文档 §四）：本页走商家域只读接口（merchant/list + merchant/stats），
   * 仅展示提交者自己范围内的记录审核进度，不涉及 console 域审核操作。
   */
  onMySubmissionsTap() {
    if (!this.data.showMySubmissions) {
      showToast('无权限访问', 'none', 2000)
      return
    }
    wx.navigateTo({
      url: '/packageAdmin/my-submissions/my-submissions',
      fail: err => {
        log.error('[lottery] 跳转我的提交页失败:', err)
        showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  // ========================================
  // 审核记录弹窗
  // ========================================

  /**
   * 并行刷新角标计数（消费记录/仓库物品/通知未读），合并为单次 setData
   *
   * 防闪烁优化：替代 onShow 中三个独立的异步计数刷新，
   * 避免三次独立 setData 触发页面级 WXML 重新求值 → 子组件级联 diff
   *
   * 数据流:
   *   Promise.all([消费记录API, 仓库API, 通知API])
   *   → 值比较过滤未变化字段
   *   → 仅变化字段合并为单次 setData
   */
  async _refreshBadgeCounts() {
    try {
      const [recordsResult, statsResult, notifyResult] = await Promise.all([
        API.getMyConsumptionRecords({ page: 1, page_size: 1, status: 'pending' }).catch(() => null),
        API.getBackpackStats().catch(() => null),
        API.getUserNotificationUnreadCount().catch(() => null)
      ])

      const badgePatch: Record<string, any> = {}

      const latestRecordsCount = recordsResult?.success
        ? recordsResult.data?.pagination?.total || 0
        : this.data.auditRecordsCount
      if (latestRecordsCount !== this.data.auditRecordsCount) {
        badgePatch.auditRecordsCount = latestRecordsCount
      }

      const latestInventoryCount = statsResult?.success
        ? statsResult.data?.unviewed_items || 0
        : this.data.inventoryUnviewedCount
      if (latestInventoryCount !== this.data.inventoryUnviewedCount) {
        badgePatch.inventoryUnviewedCount = latestInventoryCount
      }

      const latestUnreadCount = notifyResult?.success
        ? notifyResult.data?.unread_count || 0
        : this.data.notificationUnreadCount
      if (latestUnreadCount !== this.data.notificationUnreadCount) {
        badgePatch.notificationUnreadCount = latestUnreadCount
      }

      if (Object.keys(badgePatch).length > 0) {
        this.setData(badgePatch)
      }
    } catch (badgeError) {
      log.warn('[lottery] 角标计数刷新失败（不影响主流程）:', badgeError)
    }
  },

  /**
   * 加载当前生效的消费加成活动（方案C §十 C 端展示）
   * 数据源: GET /api/v4/user/consumption-bonus（不传 store_id/merchant_id 查全平台活动）
   *
   * 用户消费码为动态身份码、出示前不绑定具体门店，故展示全平台生效活动。
   * bonus_rate（0.5）→ 百分比文案（"多送 50% 积分"）；无生效活动（active=false）时隐藏活动条。
   * 展示信息为后端脱敏下发，前端只做展示、不做人群/门店判定（命中全自动，§10.1/§10.6）。
   */
  async _loadConsumptionBonusActivity() {
    try {
      const bonusResult = await API.getConsumptionBonusActivity()
      if (bonusResult?.success && bonusResult.data?.active && bonusResult.data.activity) {
        const activity = bonusResult.data.activity
        /* bonus_rate=0.5 → "50"，去掉多余小数（0.5→50、0.05→5、0.155→15.5） */
        const ratePercent = Math.round(activity.bonus_rate * 100 * 10) / 10
        this.setData({
          bonusActivityActive: true,
          bonusActivityName: activity.display_name || '',
          bonusActivityRateText: `多送 ${ratePercent}% 积分`
        })
      } else {
        /* 无生效活动：隐藏活动条（不展示，§10.3） */
        this.setData({ bonusActivityActive: false })
      }
    } catch (bonusError) {
      /* 活动展示为非关键信息，加载失败静默隐藏，不影响付款码主功能 */
      log.warn('[lottery] 消费加成活动加载失败（不影响主流程）:', bonusError)
      this.setData({ bonusActivityActive: false })
    }
  },

  /** 加载仓库未读物品数（首页角标=未读提醒，数据源 GET /api/v4/backpack/stats 的 unviewed_items） */
  async loadInventoryItemCount() {
    try {
      const statsResult = await API.getBackpackStats()
      if (statsResult?.success && statsResult.data) {
        const unviewedItems = statsResult.data.unviewed_items || 0
        this.setData({ inventoryUnviewedCount: unviewedItems })
      }
    } catch (inventoryError) {
      log.warn('仓库未读物品数加载失败（不影响主流程）:', inventoryError)
    }
  },

  /** 加载通知未读数量（铃铛角标） — GET /api/v4/user/notifications/unread-count */
  async loadNotificationUnreadCount() {
    try {
      const countResult = await API.getUserNotificationUnreadCount()
      if (countResult?.success && countResult.data) {
        this.setData({
          notificationUnreadCount: countResult.data.unread_count || 0
        })
      }
    } catch (notifyError) {
      log.warn('通知未读数量加载失败（不影响主流程）:', notifyError)
    }
  },

  /** 跳转通知列表页 */
  goToNotifications() {
    wx.navigateTo({ url: '/packageUser/notifications/notifications' })
  },

  /** 加载消费记录数量（徽章显示） */
  async loadConsumptionRecordsCount() {
    try {
      const result = await API.getMyConsumptionRecords({ page: 1, page_size: 1, status: 'pending' })
      if (result?.success && result.data) {
        this.setData({ auditRecordsCount: result.data.pagination?.total || 0 })
      }
    } catch (recordsError) {
      log.warn('消费记录数量加载失败（不影响主流程）:', recordsError)
    }
  },

  /** 查看消费记录弹窗 */
  async viewRecentAudits() {
    if (!checkAuth({ redirect: false })) {
      this.onShowLoginPopup()
      return
    }

    wx.showLoading({ title: '加载中...', mask: true })

    try {
      const result = await API.getMyConsumptionRecords({ page: 1, page_size: 5 })
      wx.hideLoading()

      if (result?.success && result.data) {
        const records = result.data.records || []
        if (records.length === 0) {
          wx.showModal({ title: '暂无记录', content: '您还没有消费记录', showCancel: false })
          return
        }
        this.setData({
          auditRecordsData: this._formatAuditRecords(records),
          showAuditModal: true
        })
      } else {
        throw new Error(result?.message || '获取消费记录失败')
      }
    } catch (error: any) {
      wx.hideLoading()
      wx.showModal({
        title: '加载失败',
        content: `无法获取消费记录：${error.message}`,
        confirmText: '重试',
        cancelText: '取消',
        success: res => {
          if (res.confirm) {
            this.viewRecentAudits()
          }
        }
      })
    } finally {
      /* wx.hideLoading 已在 try/catch 分支中调用 */
    }
  },

  /** 格式化消费记录数据 */
  _formatAuditRecords(records: any[]) {
    if (!Array.isArray(records)) {
      return []
    }
    const statusMap: Record<string, any> = {
      pending: { text: '待审核', icon: '⏳', color: '#FF9800', bgColor: '#FFF3E0' },
      approved: { text: '已通过', icon: '✅', color: '#4CAF50', bgColor: '#E8F5E9' },
      rejected: { text: '已拒绝', icon: '❌', color: '#F44336', bgColor: '#FFEBEE' }
    }

    return records.map(record => {
      const amount = parseFloat(record.consumption_amount)
      return {
        ...record,
        formattedTime: Utils.formatBeijingTimeField(record.created_at, 'relative'),
        statusInfo: statusMap[record.status] || statusMap.pending,
        formattedAmount: isNaN(amount) ? '0.00' : amount.toFixed(2)
      }
    })
  },

  /** 关闭审核记录弹窗 */
  closeAuditModal() {
    this.setData({ showAuditModal: false, auditRecordsData: [] })
  },

  // ========================================
  // 系统公告（后端 GET /api/v4/system/ad-delivery?slot_type=announcement）
  // ========================================

  /**
   * 加载首页系统公告（需要登录认证）
   *
   * 数据流:
   * API获取活跃公告 → 空数组则隐藏区域 → 有数据则渲染滚动公告条
   * 后端按 priority DESC 排序，system 类型优先级 900-999
   */
  async loadHomeAnnouncements() {
    try {
      const result = await API.getAdDelivery({ slot_type: 'announcement' })
      if (!result?.success || !result.data) {
        return
      }

      const announcementList: API.AdDeliveryItem[] = result.data.items || []
      if (!Array.isArray(announcementList) || announcementList.length === 0) {
        this.setData({ showAnnouncements: false, announcements: [] })
        return
      }

      this.setData({
        announcements: announcementList,
        showAnnouncements: true,
        announcementCurrent: 0
      })

      /* 首条公告曝光：swiper首次渲染自动展示第一条 */
      this._announcementExposureStart = Date.now()
      this._reportAnnouncementImpression(0)

      log.info('[lottery] 系统公告加载成功:', announcementList.length, '条')
    } catch (error) {
      log.error('[lottery] 系统公告加载失败:', error)
    }
  },

  /**
   * 公告 swiper 切换事件 — 上报前一条曝光日志、记录新一条曝光开始时间
   * bindchange 触发源: autoplay 自动切换 / 用户手动滑动
   */
  onAnnouncementChange(e: WechatMiniprogram.SwiperChange) {
    const newIndex = e.detail.current
    const prevIndex = this.data.announcementCurrent

    this._reportAnnouncementImpression(prevIndex)

    this.setData({ announcementCurrent: newIndex })
    this._announcementExposureStart = Date.now()
  },

  /**
   * 上报公告曝光事件（按 campaign_category 分流，静默上报不阻塞UI）
   * @param slideIndex - 公告索引
   */
  _reportAnnouncementImpression(slideIndex: number) {
    const announcement: API.AdDeliveryItem = this.data.announcements[slideIndex]
    if (!announcement?.ad_campaign_id) {
      return
    }

    const exposureDuration = this._announcementExposureStart
      ? Date.now() - this._announcementExposureStart
      : 0

    this._reportAdEvent(announcement, 'impression', {
      exposure_duration_ms: exposureDuration,
      slot_type: 'announcement'
    })
  },

  /**
   * 公告条点击 — 上报点击日志 + 展示公告详情 + 按 link_type 执行跳转
   *
   * 交互流程:
   * 用户点击 → 上报 click 类型交互日志 → wx.showModal 展示 text_content
   *   → 有跳转链接时 confirmText 显示"查看详情"
   *   → 用户确认后按 link_type 执行 page/miniprogram/webview 跳转
   */
  onAnnouncementTap(e: WechatMiniprogram.CustomEvent) {
    const index = e.currentTarget.dataset.index as number
    const announcement: API.AdDeliveryItem = this.data.announcements[index]
    if (!announcement) {
      return
    }

    /* 上报点击事件（按 campaign_category 分流至计费系统或交互日志） */
    this._reportAdEvent(announcement, 'click', { slot_type: 'announcement' })

    /* 判断是否有跳转链接，决定弹窗按钮文案 */
    const hasLink =
      announcement.link_url && announcement.link_type && announcement.link_type !== 'none'

    wx.showModal({
      title: announcement.title,
      content: announcement.text_content || '',
      showCancel: hasLink ? true : false,
      cancelText: hasLink ? '关闭' : '',
      confirmText: hasLink ? '查看详情' : '我知道了',
      success: res => {
        if (res.confirm && hasLink) {
          this._handleAdLinkNavigation(announcement)
        }
      }
    })
  },

  // ========================================
  // 内容投放系统 — 共用工具函数
  // ========================================

  /**
   * 统一跳转处理 — 弹窗 / 轮播 / 公告共用
   * 根据 link_type 执行不同的跳转方式，避免三处重复代码
   *
   * @param item - 投放内容项（包含 link_url 和 link_type）
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
              fail: (err: any) => log.error('[lottery] 跳转页面失败:', err)
            })
          }
        })
        break

      case 'miniprogram':
        wx.navigateToMiniProgram({
          appId: item.link_url,
          fail: (err: any) => log.error('[lottery] 跳转小程序失败:', err)
        })
        break

      case 'webview':
        wx.navigateTo({
          url: '/pages/webview/webview?url=' + encodeURIComponent(item.link_url),
          fail: (err: any) => log.error('[lottery] 跳转webview失败:', err)
        })
        break

      default:
        log.warn('[lottery] 未知的跳转类型:', item.link_type)
    }
  },

  /**
   * 内容投放事件上报 — 按 campaign_category 分流
   *
   * 数据流:
   * ┌─────────────────────────────────────────────────────────────────┐
   * │ campaign_category === 'commercial'                             │
   * │   → reportAdImpression / reportAdClick                         │
   * │   → 写入 ad_impression_logs / ad_click_logs                    │
   * │   → AdBillingService 按日扣费 + AdAntifraudService 反作弊检测  │
   * ├─────────────────────────────────────────────────────────────────┤
   * │ campaign_category === 'operational' || 'system'                │
   * │   → reportInteractionLog                                       │
   * │   → 写入 ad_interaction_logs                                   │
   * │   → 运营数据统计                                               │
   * └─────────────────────────────────────────────────────────────────┘
   *
   * @param item - 投放内容项
   * @param eventType - 事件类型: 'impression' | 'click'
   * @param extraData - 扩展数据（弹窗/轮播/公告各自的场景数据）
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
      /* 商业广告 → 广告计费系统（ad_impression_logs / ad_click_logs） */
      if (!item.ad_slot_id) {
        log.error('[lottery] 商业广告缺少 ad_slot_id，无法上报计费事件:', item.ad_campaign_id)
        return
      }

      if (eventType === 'impression') {
        API.reportAdImpression({
          ad_campaign_id: item.ad_campaign_id,
          ad_slot_id: item.ad_slot_id
        }).catch((err: any) => {
          log.warn('[lottery] 商业广告曝光上报失败:', err)
        })
      } else {
        API.reportAdClick({
          ad_campaign_id: item.ad_campaign_id,
          ad_slot_id: item.ad_slot_id,
          click_target: item.link_url || undefined
        }).catch((err: any) => {
          log.warn('[lottery] 商业广告点击上报失败:', err)
        })
      }
    } else {
      /* 运营内容 / 系统通知 → 统一交互日志（ad_interaction_logs） */
      API.reportInteractionLog({
        ad_campaign_id: item.ad_campaign_id,
        interaction_type: eventType,
        extra_data: extraData
      }).catch((err: any) => {
        log.warn('[lottery] 交互日志上报失败（不影响业务）:', err)
      })
    }
  },

  // ========================================
  // 弹窗横幅
  // ========================================

  /**
   * 加载弹窗横幅（含频率控制过滤）
   *
   * 数据流:
   * API获取活跃投放内容 → 客户端频率过滤(shouldShowBanner) → priority降序排序 → 展示第一条
   * 频率规则由后端运营后台配置，前端只负责执行判断逻辑
   */
  async loadPopupBanners() {
    try {
      const app = getApp()

      /**
       * 同时加载 home + lottery 两个 position 的弹窗广告
       * home_popup (position='home') — 全站首页弹窗
       * lottery_popup (position='lottery') — 抽奖页专属弹窗
       */
      const [homeResult, lotteryResult] = await Promise.all([
        API.getAdDelivery({ slot_type: 'popup', position: 'home' }),
        API.getAdDelivery({ slot_type: 'popup', position: 'lottery' })
      ])

      const homeBanners: API.AdDeliveryItem[] =
        homeResult?.success && homeResult.data ? homeResult.data.items || [] : []
      const lotteryBanners: API.AdDeliveryItem[] =
        lotteryResult?.success && lotteryResult.data ? lotteryResult.data.items || [] : []

      const banners: API.AdDeliveryItem[] = [...homeBanners, ...lotteryBanners]
      if (banners.length === 0) {
        return
      }

      /* 后端已过滤 status=active + 时间范围 + 按priority DESC排序，前端再做客户端频率过滤 */
      const sessionSeenIds: Set<number> = app.globalData.sessionSeenCampaigns || new Set()
      const filteredBanners = PopupFrequency.filterBannersByFrequency(banners, sessionSeenIds)
      if (filteredBanners.length === 0) {
        return
      }

      /* 弹窗队列：后端最多返回5个，依次弹出，用户关闭一个再弹下一个 */
      await this._preloadBannerImages(filteredBanners)

      /* 存储完整队列到实例变量（不放data，避免大数组序列化开销） */
      this._popupQueue = filteredBanners
      this._popupQueueIndex = 0

      /* 立即标记第一个为已展示 */
      PopupFrequency.markBannerSeen(filteredBanners[0].ad_campaign_id, sessionSeenIds)

      /* 展示队列中的第一个弹窗 */
      const firstBanner = filteredBanners[0]
      if (this._isFirstLoad) {
        this._preparedBanners = [firstBanner]
      } else {
        this.setData({ popupBanners: [firstBanner], showPopupBanner: true })
        this._bannerShowStartTime = Date.now()
      }
    } catch (error) {
      log.error('[lottery] 加载弹窗横幅失败:', error)
    }
  },

  /** 预加载横幅图片 */
  async _preloadBannerImages(banners: any[]) {
    const TIMEOUT = Constants.LOTTERY.IMAGE_PRELOAD_TIMEOUT
    const promises = banners.map((banner, i) => {
      const mediaUrl = banner.image_url
      if (!mediaUrl || typeof mediaUrl !== 'string') {
        return Promise.resolve()
      }
      return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, TIMEOUT)
        wx.getImageInfo({
          src: mediaUrl,
          success: res => {
            clearTimeout(timer)
            if (banners[i]) {
              banners[i].image_url = res.path
            }
            resolve()
          },
          fail: () => {
            clearTimeout(timer)
            resolve()
          }
        })
      })
    })
    await Promise.all(promises)
  },

  /**
   * 弹窗横幅关闭（队列行为）
   * 关闭当前弹窗 → 按 campaign_category 分流上报 → 队列中有下一个则自动弹出
   */
  onPopupBannerClose(e: WechatMiniprogram.CustomEvent) {
    const closeMethod: string = e?.detail?.close_method || 'close_btn'
    const currentBanners = this.data.popupBanners
    const queueIndex: number = this._popupQueueIndex || 0

    /* 上报当前关闭的弹窗事件（按 campaign_category 分流至不同日志表） */
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

    /* 队列中取下一个弹窗 */
    const queue: API.AdDeliveryItem[] = this._popupQueue || []
    const nextIndex = queueIndex + 1

    if (nextIndex < queue.length) {
      /* 标记下一个为已展示 */
      const app = getApp()
      const sessionSeenIds: Set<number> = app.globalData.sessionSeenCampaigns || new Set()
      PopupFrequency.markBannerSeen(queue[nextIndex].ad_campaign_id, sessionSeenIds)

      this._popupQueueIndex = nextIndex

      /*
       * 队列衔接：先隐藏当前弹窗（visible: true → false），
       * 等组件 DOM 销毁后再重新显示下一个（visible: false → true），
       * 确保 popup-banner 组件的 visible observer 能正常触发入场动画。
       */
      this.setData({ showPopupBanner: false })
      setTimeout(() => {
        this._bannerShowStartTime = Date.now()
        this.setData({
          popupBanners: [queue[nextIndex]],
          showPopupBanner: true
        })
      }, 100)
      log.info('[lottery] 弹窗队列弹出第', nextIndex + 1, '个，共', queue.length, '个')
    } else {
      /* 队列已全部展示完毕 */
      this._bannerShowStartTime = 0
      this._popupQueue = null
      this._popupQueueIndex = 0
      this.setData({ showPopupBanner: false })
      log.info('[lottery] 弹窗队列全部展示完毕')
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

    /* 上报点击事件（商业广告 → reportAdClick，运营内容 → reportInteractionLog） */
    this._reportAdEvent(banner, 'click', { slot_type: 'popup' })

    this._handleAdLinkNavigation(banner)
  },

  // ========================================
  // 顶部沉浸式横幅（运营可配，slot_type=top_banner&position=lottery）
  // ========================================

  /** 加载顶部 Banner（复用 TopBanner 共享逻辑，失败/空回退本地兜底图） */
  async loadTopBanner() {
    const result = await TopBanner.loadTopBanner('lottery')
    this.setData(result)
  },

  /** 顶部 Banner 点击（复用 TopBanner 跳转 + 上报） */
  onTopBannerTap(e: any) {
    if (!this.data.topBannerReady) {
      return
    }
    const tapIndex = Number(e?.currentTarget?.dataset?.index) || 0
    const tappedItem = this.data.topBannerItems[tapIndex]
    TopBanner.handleTopBannerTap(tappedItem, 'lottery')
  },

  /** 顶部 Banner 轮播切换（swiper bindchange）：对切入的当前张补报曝光 */
  onTopBannerChange(e: any) {
    const currentIndex = Number(e?.detail?.current) || 0
    TopBanner.handleTopBannerChange(this.data.topBannerItems, currentIndex, 'lottery')
  },

  /** 顶部 Banner 图片加载失败（<image> binderror）：打印失败 URL 与错误详情，便于定位 */
  onTopBannerImageError(e: any) {
    const errIndex = Number(e?.currentTarget?.dataset?.index) || 0
    TopBanner.handleTopBannerImageError(this.data.topBannerItems[errIndex], 'lottery', e?.detail)
  },

  // ========================================
  // 轮播图（后端 GET /api/v4/system/ad-delivery?slot_type=carousel）
  // ========================================

  /**
   * 加载轮播图数据
   * API获取统一投放内容(slot_type=carousel) → 空数组则隐藏区域 → 有数据则渲染swiper
   * 轮播间隔由后端 slide_interval_ms 字段配置
   */
  async loadCarouselItems() {
    try {
      const apiResult = await API.getAdDelivery({ slot_type: 'carousel', position: 'home' })
      if (!apiResult?.success || !apiResult.data) {
        return
      }

      const carouselList: API.AdDeliveryItem[] = apiResult.data.items || []
      if (!Array.isArray(carouselList) || carouselList.length === 0) {
        this.setData({ showCarousel: false, carouselItems: [] })
        return
      }

      const firstInterval = carouselList[0].slide_interval_ms
      const safeInterval = firstInterval && firstInterval >= 1000 ? firstInterval : 3000

      this.setData({
        carouselItems: carouselList,
        carouselInterval: safeInterval,
        showCarousel: true,
        carouselCurrent: 0
      })

      this._carouselExposureStart = Date.now()

      /* 首条轮播图立即上报 impression（onCarouselChange 只在切换时触发，首条需主动上报） */
      if (carouselList.length > 0 && carouselList[0].ad_campaign_id) {
        this._reportAdEvent(carouselList[0], 'impression', {
          slot_type: 'carousel',
          slide_index: 0,
          is_initial_load: true
        })
      }

      log.info('[lottery] 轮播图加载成功:', carouselList.length, '条')
    } catch (error) {
      log.error('[lottery] 轮播图加载失败:', error)
    }
  },

  /** 轮播图切换事件（swiper bindchange） */
  onCarouselChange(e: WechatMiniprogram.SwiperChange) {
    const newIndex = e.detail.current
    const prevIndex = this.data.carouselCurrent
    const isManualSwipe = e.detail.source === 'touch'

    // 上报前一张轮播图的展示日志
    this._reportCarouselExposure(prevIndex, isManualSwipe, false)

    this.setData({ carouselCurrent: newIndex })
    this._carouselExposureStart = Date.now()
  },

  /**
   * 轮播图点击事件
   * 上报曝光（结束当前展示） + 上报点击（按 campaign_category 分流） + 执行跳转
   */
  onCarouselItemTap(e: WechatMiniprogram.CustomEvent) {
    const tappedIndex = e.currentTarget.dataset.index as number
    const tappedItem: API.AdDeliveryItem = this.data.carouselItems[tappedIndex]
    if (!tappedItem) {
      return
    }

    /* 上报本张轮播图的曝光日志（结束展示统计） */
    this._reportCarouselExposure(tappedIndex, false, true)

    /* 上报点击事件（商业广告 → reportAdClick，运营内容 → reportInteractionLog） */
    this._reportAdEvent(tappedItem, 'click', {
      slot_type: 'carousel',
      slide_index: tappedIndex
    })

    /* 执行跳转 */
    this._handleAdLinkNavigation(tappedItem)
  },

  /** 轮播图图片加载失败 — 隐藏该轮播项避免显示破图 */
  onCarouselImageError(e: WechatMiniprogram.TouchEvent) {
    const index = e.currentTarget.dataset.index
    if (index === undefined || index === null) {
      return
    }
    log.warn(`[lottery] 轮播图[${index}]图片加载失败`)
    const carouselItems = [...this.data.carouselItems]
    if (carouselItems[index]) {
      carouselItems[index] = { ...carouselItems[index], image_url: null }
      this.setData({ carouselItems })
    }
  },

  /**
   * 上报轮播图曝光事件（按 campaign_category 分流，静默上报不阻塞UI）
   * @param slideIndex - 轮播图索引
   * @param isManualSwipe - 是否手动滑动
   * @param isClicked - 是否被点击
   */
  _reportCarouselExposure(slideIndex: number, isManualSwipe: boolean, isClicked: boolean) {
    const carouselItem: API.AdDeliveryItem = this.data.carouselItems[slideIndex]
    if (!carouselItem?.ad_campaign_id) {
      return
    }

    const exposureDuration = this._carouselExposureStart
      ? Date.now() - this._carouselExposureStart
      : 0

    this._reportAdEvent(carouselItem, 'impression', {
      exposure_duration_ms: exposureDuration,
      is_manual_swipe: isManualSwipe,
      is_clicked: isClicked,
      slot_type: 'carousel'
    })
  },

  // ========================================
  // 页面导航
  // ========================================

  /**
   * 建立WebSocket连接并订阅通知事件（铃铛角标实时+1）
   *
   * 解决3个架构隐患:
   *   隐患1: initializePage首次加载也订阅WebSocket（不再仅依赖onShow）
   *   隐患2: 首页主动发起connectWebSocket（不再依赖用户先切到兑换/聊天Tab）
   *   隐患3: 连接建立后订阅 new_notification 事件
   *
   * 数据流: 后端 ChatWebSocketService.pushNotificationToUser()
   *        → Socket.IO 'new_notification' 事件
   *        → app.ts notifyPageSubscribers()
   *        → 本方法回调: notificationUnreadCount +1
   */
  _setupWebSocketNotification() {
    const wsApp = getApp() as any
    const tokenStatus = Utils.checkTokenValidity()
    if (!tokenStatus.isValid) {
      log.warn('[lottery] Token无效，跳过WebSocket连接')
      return
    }

    wsApp
      .connectWebSocket()
      .then(() => {
        wsApp.subscribeWebSocketMessages(this._wsPageId, (eventName: string, _eventData: any) => {
          if (eventName === 'new_notification') {
            this.setData({
              notificationUnreadCount: this.data.notificationUnreadCount + 1
            })
          }
        })
      })
      .catch((wsErr: any) => {
        log.warn('[lottery] WebSocket连接失败（铃铛角标回退API拉取）:', wsErr?.message)
        wsApp.subscribeWebSocketMessages(this._wsPageId, (eventName: string, _eventData: any) => {
          if (eventName === 'new_notification') {
            this.setData({
              notificationUnreadCount: this.data.notificationUnreadCount + 1
            })
          }
        })
      })
  },

  goToExchange() {
    wx.switchTab({ url: '/pages/exchange/exchange' })
  },

  /** 跳转到道具仓库/背包页面 */
  goToInventory() {
    wx.navigateTo({ url: '/packageUser/backpack/inventory/inventory' })
  }
})
