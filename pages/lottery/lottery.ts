/**
 * 抽奖页面 - 薄壳页面（任务8瘦身后）
 *
 * 职责：
 *   1. 页面生命周期管理（onLoad/onShow/onReady/onUnload）
 *   2. V2动态身份二维码（生成、刷新、倒计时、放大）
 *   3. 管理员功能条（扫码、审核详情跳转）
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
  QRCode
} = require('../../utils/index')
const log = Logger.createLogger('lottery')
const { showToast } = Wechat
const { checkAuth, restoreUserInfo } = Utils
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')

/** 积分千分位格式化 — 供MobX computed使用 */
const formatPointsDisplay = Utils.formatPoints

/**
 * 根据积分位数返回响应式字体CSS类名（独立函数，供MobX绑定的computed使用）
 * 位数 ≤7: 默认字号  |  ≤10: medium-number  |  ≤13: small-number  |  >13: tiny-number
 */
function getPointsDisplayClass(num: number): string {
  if (!num) {
    return ''
  }
  const len = num.toString().length
  if (len <= 7) {
    return ''
  }
  if (len <= 10) {
    return 'medium-number'
  }
  if (len <= 13) {
    return 'small-number'
  }
  return 'tiny-number'
}

Page({
  data: {
    /* ===== 用户状态 ===== */
    isLoggedIn: false,
    isAdmin: false,
    pointsBalance: 0,
    frozenPoints: 0,
    userInfo: {},

    /* 响应式字体类 */
    pointsClass: '',
    frozenClass: '',

    /* 格式化显示的积分（带千分位） */
    pointsBalanceFormatted: '0',
    frozenPointsFormatted: '0',

    /* ===== V2动态二维码 ===== */
    qrCodeImage: '',
    qrCodeEnlarged: false,
    qrCountdown: 300,
    qrExpired: false,
    qrCountdownText: '5:00',
    qrExpiresAt: 0,

    /* ===== 仓库/背包物品数量（后端 GET /api/v4/backpack/stats 返回） ===== */
    inventoryItemCount: 0,

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
      fields: ['isLoggedIn', 'isAdmin'],
      actions: []
    })
    this.pointsStoreBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: {
        /* 原始积分值 */
        pointsBalance: () => pointsStore.availableAmount,
        frozenPoints: () => pointsStore.frozenAmount,
        /* 格式化积分显示（带千分位分隔符） - 当Store变化时自动重新计算 */
        pointsBalanceFormatted: () => formatPointsDisplay(pointsStore.availableAmount),
        frozenPointsFormatted: () => formatPointsDisplay(pointsStore.frozenAmount),
        /* 响应式字体CSS类 - 根据积分位数自动切换字号 */
        pointsClass: () => getPointsDisplayClass(pointsStore.availableAmount),
        frozenClass: () => getPointsDisplayClass(pointsStore.frozenAmount)
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
    /* Canvas就绪后生成用户身份二维码 */
    if (this.data.userInfo && this.data.userInfo.user_id && checkAuth({ redirect: false })) {
      this.generateUserQRCode()
    }
  },

  async onShow() {
    /* 首次加载由 initializePage() 统一处理认证和数据，onShow 不重复检查 */
    if (this._isFirstLoad) {
      return
    }

    if (!checkAuth()) {
      return
    }

    this.setData({ loading: false })

    const userInfo = restoreUserInfo()
    if (!userInfo) {
      return
    }

    const pointsBalance = pointsStore.availableAmount || 0
    const frozenPoints = pointsStore.frozenAmount || 0

    this.setData({ isLoggedIn: true, pointsBalance, userInfo })
    this.updatePointsDisplay(pointsBalance, frozenPoints)

    /* 非首次加载时刷新弹窗横幅和系统公告 */
    if (!this._isFirstLoad) {
      this.loadPopupBanners()
      this.loadHomeAnnouncements()
    }

    await this.loadConsumptionRecordsCount()
    this.loadInventoryItemCount()
    this.loadNotificationUnreadCount()

    /* V2动态码：从后台恢复时检查二维码是否过期 */
    if (this.data.qrExpiresAt && Date.now() >= this.data.qrExpiresAt) {
      if (this._qrTimer) {
        clearInterval(this._qrTimer)
      }
      this.setData({ qrCountdown: 0, qrExpired: true, qrCountdownText: '已过期' })
    }

    /* 首次显示且尚未生成二维码时生成 */
    if (!this.data.qrCodeImage && this.data.userInfo?.user_id) {
      this.generateUserQRCode()
    }

    /* 刷新积分数据 */
    this._refreshPoints()

    /* 加载当前页面活动列表（任务27） */
    this._loadCampaigns()

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
      title: '我在抽奖，一起来试试手气！',
      path: '/pages/lottery/lottery'
    }
  },

  // ========================================
  // 页面初始化
  // ========================================

  async initializePage() {
    try {
      if (!checkAuth()) {
        /* 认证失败时保持 loading 遮罩，避免未登录内容闪现 */
        this._isFirstLoad = false
        return
      }

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

      /* 仅认证通过时才移除加载遮罩 */
      if (this.data.isLoggedIn) {
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

      this.setData({
        mainCampaign: processedResult.mainCampaign,
        extraCampaigns: processedResult.extraCampaigns
      })

      log.info('[lottery] 活动加载完成', {
        mainCampaign: processedResult.mainCampaign?.campaign_code || '无',
        extraCount: processedResult.extraCampaigns.length
      })
    } catch (loadError) {
      log.error('[lottery] 加载活动列表失败:', loadError)
      this.setData({
        mainCampaign: null,
        extraCampaigns: []
      })
      wx.showToast({ title: '活动加载失败，请下拉刷新重试', icon: 'none', duration: 2500 })
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
    /* 为每个活动附加位置信息 */
    const campaignsWithPlacement = activeCampaigns
      .map((campaign: any) => {
        const matchedPlacement = placementConfig.placements.find(
          (p: any) => p.campaign_code === campaign.campaign_code
        )

        if (!matchedPlacement) {
          log.warn('[lottery] 活动未配置位置，已过滤:', campaign.campaign_code)
          return null
        }

        return {
          ...campaign,
          placement: matchedPlacement.placement
        }
      })
      .filter(Boolean)

    /* 筛选当前页面（lottery）的活动 */
    const lotteryPageCampaigns = campaignsWithPlacement.filter(
      (c: any) => c.placement.page === 'lottery'
    )

    /* 主活动：position=main 的第一个 */
    const mainCampaign =
      lotteryPageCampaigns.find((c: any) => c.placement.position === 'main') || null

    /* 其他活动：排除 main 位置，按 priority 降序排列 */
    const extraCampaigns = lotteryPageCampaigns
      .filter((c: any) => c.placement.position !== 'main')
      .sort((a: any, b: any) => (b.placement.priority || 0) - (a.placement.priority || 0))

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

  /** 刷新积分余额（委托 pointsStore.refreshFromAPI，消除重复逻辑） */
  async _refreshPoints() {
    if (!this.data.isLoggedIn) {
      return
    }
    try {
      const { available, frozen } = await pointsStore.refreshFromAPI()
      this.updatePointsDisplay(available, frozen)
    } catch (err) {
      log.error('[lottery] 刷新积分失败:', err)
      this.updatePointsDisplay(pointsStore.availableAmount || 0, pointsStore.frozenAmount || 0)
    }
  },

  // ========================================
  // 积分显示（格式化 + 响应式字体）
  // ========================================

  /** 统一更新积分显示（复用模块级 getPointsDisplayClass） */
  updatePointsDisplay(points: number, frozen: number) {
    this.setData({
      pointsBalance: points,
      frozenPoints: frozen,
      pointsClass: getPointsDisplayClass(points),
      frozenClass: getPointsDisplayClass(frozen),
      pointsBalanceFormatted: Utils.formatPoints(points),
      frozenPointsFormatted: Utils.formatPoints(frozen)
    })
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
    try {
      const userInfo = this.data.userInfo || userStore.userInfo
      if (!userInfo?.user_id) {
        showToast('请先登录', 'none', 2000)
        return
      }

      const qrCodeResult = await API.getUserQRCode()
      if (!qrCodeResult?.success) {
        showToast(qrCodeResult?.message || '生成二维码失败', 'none', 2000)
        return
      }

      const qrCodeData = qrCodeResult.data
      const qrContent = qrCodeData.qr_code

      /* 计算过期时间戳 */
      let expiresTimestamp = 0
      if (qrCodeData.expires_at && typeof qrCodeData.expires_at === 'object') {
        expiresTimestamp = qrCodeData.expires_at.timestamp
      } else {
        expiresTimestamp = (
          Utils.safeParseDateString(qrCodeData.expires_at) || new Date()
        ).getTime()
      }

      QRCode.drawQrcode({
        canvasId: 'qrcodeCanvas',
        text: qrContent,
        width: 428,
        height: 428,
        typeNumber: -1,
        correctLevel: 2,
        background: '#ffffff',
        foreground: '#000000',
        callback: () => {
          const maxRetries = 3
          const tryExport = (attempt: number) => {
            const delay = attempt === 0 ? 500 : 1000 * attempt
            setTimeout(() => {
              wx.canvasToTempFilePath(
                {
                  canvasId: 'qrcodeCanvas',
                  width: 428,
                  height: 428,
                  destWidth: 428,
                  destHeight: 428,
                  success: tempRes => {
                    const remaining = Math.max(
                      0,
                      Math.floor((expiresTimestamp - Date.now()) / 1000)
                    )
                    const minutes = Math.floor(remaining / 60)
                    const seconds = remaining % 60
                    this.setData({
                      qrCodeImage: tempRes.tempFilePath,
                      qrCountdown: remaining,
                      qrExpired: false,
                      qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`,
                      qrExpiresAt: expiresTimestamp
                    })
                    this.startQrCountdown()
                  },
                  fail: err => {
                    if (attempt < maxRetries) {
                      log.info(
                        `[lottery] 二维码导出第${attempt + 1}次失败，${1000 * (attempt + 1)}ms后重试`
                      )
                      tryExport(attempt + 1)
                    } else {
                      log.error('[lottery] 二维码转图片失败(已重试3次):', err)
                      showToast('二维码生成失败', 'none', 2000)
                    }
                  }
                },
                this
              )
            }, delay)
          }
          tryExport(0)
        }
      })
    } catch (error: any) {
      log.error('[lottery] 生成V2二维码异常:', error)

      // USER_UUID_MISSING：后端用户记录异常，引导重新登录触发认证中间件重新查询用户信息
      if (error.code === 'USER_UUID_MISSING') {
        wx.showModal({
          title: '身份信息异常',
          content: '请重新登录以刷新身份信息',
          showCancel: false,
          confirmText: '重新登录',
          success: () => {
            const appInstance = getApp()
            appInstance.clearAuthData()
            wx.redirectTo({ url: '/packageUser/auth/auth' })
          }
        })
        return
      }

      showToast('二维码生成异常', 'none', 2000)
    }
  },

  /** V2二维码倒计时（到期后自动刷新，无需手动点击） */
  startQrCountdown() {
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
    }

    this._qrTimer = setInterval(() => {
      const remaining = this.data.qrCountdown - 1
      if (remaining <= 0) {
        clearInterval(this._qrTimer)
        this._qrTimer = null
        // 倒计时归零，触发自动刷新
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
   * 自动刷新二维码（过期后自动触发）
   * 安全机制：最多自动刷新50次（约4小时），超出后需手动刷新
   */
  _autoRefreshQR() {
    const MAX_AUTO_REFRESH = 50
    const count = (this._qrAutoRefreshCount || 0) as number

    if (count >= MAX_AUTO_REFRESH) {
      log.info('二维码自动刷新已达上限（' + MAX_AUTO_REFRESH + '次），请手动刷新')
      this.setData({ qrCountdown: 0, qrExpired: true, qrCountdownText: '已过期' })
      return
    }

    log.info('二维码过期，2秒后自动刷新（第' + (count + 1) + '次）')
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

  // ========================================
  // 管理员功能
  // ========================================

  /** 检查管理员角色 */
  checkAdminRole() {
    try {
      const userInfo = userStore.userInfo
      // 管理员判断统一标准：role_level >= 100（对齐后端 authenticateToken）
      const isAdmin = typeof userInfo?.role_level === 'number' && userInfo.role_level >= 100
      this.setData({ isAdmin })
    } catch (error) {
      log.error('[lottery] 权限检查失败:', error)
      this.setData({ isAdmin: false })
    }
  },

  /** 扫一扫功能（管理员） */
  onScanTap() {
    if (!this.data.isAdmin) {
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

  /** 跳转到审核详情页（管理员） */
  onAuditTap() {
    if (!this.data.isAdmin) {
      showToast('无权限访问', 'none', 2000)
      return
    }
    wx.navigateTo({
      url: '/packageAdmin/audit-list/audit-list',
      fail: err => {
        log.error('[lottery] 跳转失败:', err)
        showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  // ========================================
  // 审核记录弹窗
  // ========================================

  /** 加载仓库物品数量（徽章显示） */
  async loadInventoryItemCount() {
    try {
      const statsResult = await API.getBackpackStats()
      if (statsResult?.success && statsResult.data) {
        const totalItems = statsResult.data.total_items || 0
        this.setData({ inventoryItemCount: totalItems })
      }
    } catch (inventoryError) {
      log.warn('仓库物品数量加载失败（不影响主流程）:', inventoryError)
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
    if (!checkAuth()) {
      wx.showModal({
        title: '未登录',
        content: '请先登录后查看消费记录',
        confirmText: '去登录',
        success: res => {
          if (res.confirm) {
            wx.navigateTo({ url: '/packageUser/auth/auth' })
          }
        }
      })
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
        formattedTime: this._formatRelativeTime(record.created_at),
        statusInfo: statusMap[record.status] || statusMap.pending,
        formattedAmount: isNaN(amount) ? '0.00' : amount.toFixed(2)
      }
    })
  },

  /**
   * 格式化相对时间（统一委托 Utils.formatDateMessage，消除重复逻辑）
   * 增加空值保护：timestamp 为空或解析失败时返回 '时间未知'
   */
  _formatRelativeTime(timestamp: any) {
    if (!timestamp) {
      return '时间未知'
    }
    const parsedDate = Utils.safeParseDateString(timestamp)
    if (!parsedDate) {
      return '时间未知'
    }
    return Utils.formatDateMessage(parsedDate.getTime())
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

      const result = await API.getAdDelivery({ slot_type: 'popup', position: 'home' })
      if (!result?.success || !result.data) {
        return
      }

      const banners: API.AdDeliveryItem[] = result.data.items || []
      if (!Array.isArray(banners) || banners.length === 0) {
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
      if (!banner.image_url || typeof banner.image_url !== 'string') {
        return Promise.resolve()
      }
      return new Promise<void>(resolve => {
        const timer = setTimeout(resolve, TIMEOUT)
        wx.getImageInfo({
          src: banner.image_url,
          success: res => {
            clearTimeout(timer)
            banners[i].image_url = res.path
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
  // 轮播图（后端 GET /api/v4/system/ad-delivery?slot_type=carousel）
  // ========================================

  /**
   * 加载轮播图数据
   *
   * 数据流:
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
      carouselItems[index] = { ...carouselItems[index], image_url: '' }
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
    wx.navigateTo({ url: '/packageTrade/trade/inventory/inventory' })
  }
})
