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
 *   <lottery-activity campaignCode="BASIC_LOTTERY" size="full" />
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

/**
 * 积分千分位格式化（独立函数，供MobX绑定的computed使用）
 * 例: 807871 → "807,871"
 */
function formatPointsDisplay(num: number): string {
  if (!num && num !== 0) {
    return '0'
  }
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

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

    /* ===== 审核记录（后端 GET /api/v4/shop/consumption/me 返回） ===== */
    auditRecordsCount: 0,
    auditRecordsData: [] as API.ConsumptionRecord[],
    showAuditModal: false,
    auditRecordsLoading: false,

    /* ===== 弹窗横幅（后端 GET /api/v4/system/popup-banners 返回） ===== */
    showPopupBanner: false,
    popupBanners: [] as API.PopupBanner[],

    /* ===== 轮播图（后端 GET /api/v4/system/carousel-items 返回） ===== */
    carouselItems: [] as API.CarouselItem[],
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
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'isAdmin'],
      actions: []
    })
    this.pointsBindings = createStoreBindings(this, {
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
  },

  onReady() {
    /* Canvas就绪后生成用户身份二维码 */
    if (this.data.userInfo && this.data.userInfo.user_id && checkAuth({ redirect: false })) {
      this.generateUserQRCode()
    }
  },

  async onShow() {
    if (!this._isFirstLoad) {
      this.setData({ loading: false })
    }

    if (!checkAuth()) {
      return
    }

    const userInfo = restoreUserInfo()
    if (!userInfo) {
      return
    }

    const pointsBalance = pointsStore.availableAmount || 0
    const frozenPoints = pointsStore.frozenAmount || 0

    this.setData({ isLoggedIn: true, pointsBalance, userInfo })
    this.updatePointsDisplay(pointsBalance, frozenPoints)

    /* 非首次加载时单独刷新弹窗横幅 */
    if (!this._isFirstLoad) {
      this.loadPopupBanners()
    }

    await this.loadConsumptionRecordsCount()
    this.loadInventoryItemCount()

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
  },

  async onPullDownRefresh() {
    try {
      /* 并行刷新：积分数据 + 位置配置 + 活动列表 */
      await Promise.all([
        this._refreshPoints(),
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

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    if (this.pointsBindings) {
      this.pointsBindings.destroyStoreBindings()
    }
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
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
        this.setData({ loading: false })
        return
      }

      /* 并行加载：积分数据、弹窗横幅、轮播图 */
      await Promise.all([
        this._refreshPoints(),
        this.loadPopupBanners().catch((err: any) => {
          log.error('[lottery] 弹窗横幅加载失败（不影响主功能）:', err)
        }),
        this.loadCarouselItems().catch((err: any) => {
          log.error('[lottery] 轮播图加载失败（不影响主功能）:', err)
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
      const finalData: any = { loading: false }

      /* 弹窗横幅数据一并设置（同一帧显示） */
      if (this._preparedBanners?.length > 0) {
        finalData.popupBanners = this._preparedBanners
        finalData.showPopupBanner = true
        this._preparedBanners = null
        this._bannerShowStartTime = Date.now()
      }

      this.setData(finalData)
      this._isFirstLoad = false
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

      /* 根据位置配置处理活动列表 */
      const processedResult = this._processCampaignsWithPlacement(activeCampaigns, placementConfig)

      this.setData({
        mainCampaign: processedResult.mainCampaign,
        extraCampaigns: processedResult.extraCampaigns
      })

      log.info('✅ [lottery] 活动加载完成', {
        mainCampaign: processedResult.mainCampaign?.campaign_code || '无',
        extraCount: processedResult.extraCampaigns.length
      })
    } catch (loadError) {
      log.error('[lottery] 加载活动列表失败:', loadError)
      /* 降级兜底：使用默认 BASIC_LOTTERY，包含完整 placement 结构（WXML模板需要） */
      this.setData({
        mainCampaign: {
          campaign_code: 'BASIC_LOTTERY',
          placement: { page: 'lottery', position: 'main', size: 'full', priority: 100 }
        },
        extraCampaigns: []
      })
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

  async _refreshPoints() {
    if (!this.data.isLoggedIn) {
      return
    }
    try {
      const balanceResult = await API.getPointsBalance()
      if (balanceResult?.success && balanceResult.data) {
        const points = balanceResult.data.available_amount || 0
        const frozen = balanceResult.data.frozen_amount || 0
        pointsStore.setBalance(points, frozen)
        this.updatePointsDisplay(points, frozen)
      } else {
        this.updatePointsDisplay(pointsStore.availableAmount || 0, pointsStore.frozenAmount || 0)
      }
    } catch (err) {
      log.error('[lottery] 刷新积分失败:', err)
      this.updatePointsDisplay(pointsStore.availableAmount || 0, pointsStore.frozenAmount || 0)
    }
  },

  // ========================================
  // 积分显示（格式化 + 响应式字体）
  // ========================================

  /** 统一更新积分显示 */
  updatePointsDisplay(points: number, frozen: number) {
    this.setData({
      pointsBalance: points,
      frozenPoints: frozen,
      pointsClass: this._getNumberClass(points),
      frozenClass: this._getNumberClass(frozen),
      pointsBalanceFormatted: this._formatNumber(points),
      frozenPointsFormatted: this._formatNumber(frozen)
    })
  },

  /** 根据数字位数返回响应式字体CSS类 */
  _getNumberClass(num: number) {
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
  },

  /** 千分位格式化 */
  _formatNumber(num: number) {
    if (!num && num !== 0) {
      return '0'
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  },

  // ========================================
  // V2动态身份二维码
  // ========================================

  /** 生成V2动态身份二维码 */
  /**
   * 生成用户V2动态二维码（用户端，JWT解析身份）
   * 后端路由: GET /api/v4/shop/consumption/qrcode
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
                      wx.showToast({ title: '二维码生成失败', icon: 'none', duration: 2000 })
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
            userStore.clearLoginState()
            wx.redirectTo({ url: '/pages/auth/auth' })
          }
        })
        return
      }

      wx.showToast({ title: '二维码生成异常', icon: 'none', duration: 2000 })
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
      log.info('⚠️ 二维码自动刷新已达上限（' + MAX_AUTO_REFRESH + '次），请手动刷新')
      this.setData({ qrCountdown: 0, qrExpired: true, qrCountdownText: '已过期' })
      return
    }

    log.info('🔄 二维码过期，2秒后自动刷新（第' + (count + 1) + '次）')
    this._qrAutoRefreshCount = count + 1

    // 先显示"刷新中"状态
    this.setData({
      qrCountdown: 0,
      qrExpired: false,
      qrCodeImage: '',
      qrCountdownText: '刷新中...'
    })

    // 延迟2秒后自动刷新，避免频繁请求
    setTimeout(() => {
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
      wx.showToast({ title: '二维码尚未生成', icon: 'none', duration: 2000 })
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
      wx.showToast({ title: '无权限访问', icon: 'none', duration: 2000 })
      return
    }
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode'],
      success: res => this.handleScanResult(res.result),
      fail: err => {
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({ title: '扫码失败，请重试', icon: 'none', duration: 2000 })
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
        wx.showToast({ title: '页面跳转失败', icon: 'none', duration: 2000 })
      }
    })
  },

  /** 跳转到审核详情页（管理员） */
  onAuditTap() {
    if (!this.data.isAdmin) {
      wx.showToast({ title: '无权限访问', icon: 'none', duration: 2000 })
      return
    }
    wx.navigateTo({
      url: '/packageAdmin/audit-list/audit-list',
      fail: err => {
        log.error('[lottery] 跳转失败:', err)
        wx.showToast({ title: '页面跳转失败', icon: 'none', duration: 2000 })
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
        const totalItems = statsResult.data.total_items || statsResult.data.totalItems || 0
        this.setData({ inventoryItemCount: totalItems })
      }
    } catch (inventoryError) {
      log.warn('⚠️ 仓库物品数量加载失败（不影响主流程）:', inventoryError)
    }
  },

  /** 加载消费记录数量（徽章显示） */
  async loadConsumptionRecordsCount() {
    try {
      const result = await API.getMyConsumptionRecords({ page: 1, page_size: 1, status: 'pending' })
      if (result?.success && result.data) {
        this.setData({ auditRecordsCount: result.data.pagination?.total || 0 })
      }
    } catch (recordsError) {
      log.warn('⚠️ 消费记录数量加载失败（不影响主流程）:', recordsError)
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
            wx.navigateTo({ url: '/pages/auth/auth' })
          }
        }
      })
      return
    }

    this.setData({ auditRecordsLoading: true })
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
      this.setData({ auditRecordsLoading: false })
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

  /** 格式化相对时间 */
  _formatRelativeTime(timestamp: any) {
    if (!timestamp) {
      return '时间未知'
    }
    const parsedDate = Utils.safeParseDateString(timestamp)
    if (!parsedDate) {
      return '时间未知'
    }

    const parsedTime = parsedDate.getTime()
    const diff = Date.now() - parsedTime
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) {
      return '刚刚'
    }
    if (minutes < 60) {
      return `${minutes}分钟前`
    }
    if (hours < 24) {
      return `${hours}小时前`
    }
    if (days === 1) {
      return '昨天'
    }
    if (days < 7) {
      return `${days}天前`
    }

    return Utils.formatTime(parsedDate)
  },

  /** 关闭审核记录弹窗 */
  closeAuditModal() {
    this.setData({ showAuditModal: false, auditRecordsData: [] })
  },

  // ========================================
  // 弹窗横幅
  // ========================================

  /**
   * 加载弹窗横幅（含频率控制过滤）
   *
   * 数据流:
   * API获取活跃banners → 客户端频率过滤(shouldShowBanner) → priority降序排序 → 展示第一条
   * 频率规则由后端运营后台配置，前端只负责执行判断逻辑
   */
  async loadPopupBanners() {
    try {
      const app = getApp()

      const result = await API.getPopupBanners()
      if (!result?.success || !result.data) {
        return
      }

      const banners = result.data.banners || result.data || []
      if (!Array.isArray(banners) || banners.length === 0) {
        return
      }

      // 后端已过滤 is_active + 时间范围，前端再做客户端频率过滤
      const sessionSeenIds: Set<number> = app.globalData.sessionSeenPopups || new Set()
      const filteredBanners = PopupFrequency.filterBannersByFrequency(banners, sessionSeenIds)
      if (filteredBanners.length === 0) {
        return
      }

      // 只展示最高优先级的banner（filterBannersByFrequency已按priority降序排序）
      const topBanner = filteredBanners[0]
      const bannersToShow = [topBanner]

      await this._preloadBannerImages(bannersToShow)

      // 标记为已展示（更新本地存储 + 会话级集合）
      PopupFrequency.markBannerSeen(topBanner.popup_banner_id, sessionSeenIds)

      if (this._isFirstLoad) {
        this._preparedBanners = bannersToShow
      } else {
        this.setData({ popupBanners: bannersToShow, showPopupBanner: true })
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

  /** 弹窗横幅关闭（记录dismissed状态到本地存储） */
  onPopupBannerClose() {
    const currentBanners = this.data.popupBanners
    if (currentBanners && currentBanners.length > 0) {
      const closedBanner = currentBanners[0]
      if (closedBanner?.popup_banner_id) {
        PopupFrequency.markBannerDismissed(closedBanner.popup_banner_id)

        // 上报弹窗展示日志（静默上报，不阻塞关闭流程）
        const showDuration = this._bannerShowStartTime ? Date.now() - this._bannerShowStartTime : 0
        API.reportPopupBannerShowLog({
          popup_banner_id: closedBanner.popup_banner_id,
          show_duration_ms: showDuration,
          close_method: 'close_btn',
          queue_position: 1
        }).catch((err: any) => {
          log.warn('[lottery] 弹窗展示日志上报失败（不影响业务）:', err)
        })
      }
    }
    this._bannerShowStartTime = 0
    this.setData({ showPopupBanner: false })
  },

  /** 弹窗横幅操作按钮 */
  onPopupBannerAction(e: any) {
    const { banner } = e.detail
    if (banner?.link_url) {
      wx.navigateTo({
        url: banner.link_url,
        fail: () => {
          wx.switchTab({
            url: banner.link_url,
            fail: err => log.error('[lottery] 跳转失败:', err)
          })
        }
      })
    }
  },

  // ========================================
  // 轮播图（后端 GET /api/v4/system/carousel-items）
  // ========================================

  /**
   * 加载轮播图数据
   *
   * 数据流:
   * API获取carousel_items → 空数组则隐藏区域 → 有数据则渲染swiper
   * 轮播间隔由后端 slide_interval_ms 字段配置
   */
  async loadCarouselItems() {
    try {
      const apiResult = await API.getCarouselItems({ position: 'home' })
      if (!apiResult?.success || !apiResult.data) {
        return
      }

      const carouselList: API.CarouselItem[] = apiResult.data.carousel_items || []
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

      // 记录每张轮播图的曝光起始时间（用于展示日志上报）
      this._carouselExposureStart = Date.now()

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

  /** 轮播图点击事件 */
  onCarouselItemTap(e: WechatMiniprogram.CustomEvent) {
    const tappedIndex = e.currentTarget.dataset.index as number
    const tappedItem: API.CarouselItem = this.data.carouselItems[tappedIndex]
    if (!tappedItem) {
      return
    }

    // 上报点击展示日志
    this._reportCarouselExposure(tappedIndex, false, true)

    // 根据 link_type 执行跳转
    if (!tappedItem.link_url || tappedItem.link_type === 'none') {
      return
    }

    switch (tappedItem.link_type) {
      case 'page':
        wx.navigateTo({
          url: tappedItem.link_url,
          fail: () => {
            wx.switchTab({
              url: tappedItem.link_url,
              fail: err => log.error('[lottery] 轮播图跳转失败:', err)
            })
          }
        })
        break

      case 'miniprogram':
        wx.navigateToMiniProgram({
          appId: tappedItem.link_url,
          fail: err => log.error('[lottery] 轮播图跳转小程序失败:', err)
        })
        break

      case 'webview':
        wx.navigateTo({
          url: '/pages/webview/webview?url=' + encodeURIComponent(tappedItem.link_url),
          fail: err => log.error('[lottery] 轮播图跳转webview失败:', err)
        })
        break

      default:
        log.warn('[lottery] 未知的轮播图跳转类型:', tappedItem.link_type)
    }
  },

  /**
   * 上报轮播图曝光日志（静默上报，不阻塞UI）
   * @param slideIndex - 轮播图索引
   * @param isManualSwipe - 是否手动滑动
   * @param isClicked - 是否被点击
   */
  _reportCarouselExposure(slideIndex: number, isManualSwipe: boolean, isClicked: boolean) {
    const carouselItem: API.CarouselItem = this.data.carouselItems[slideIndex]
    if (!carouselItem?.carousel_item_id) {
      return
    }

    const exposureDuration = this._carouselExposureStart
      ? Date.now() - this._carouselExposureStart
      : 0

    API.reportCarouselShowLog({
      carousel_item_id: carouselItem.carousel_item_id,
      exposure_duration_ms: exposureDuration,
      is_manual_swipe: isManualSwipe,
      is_clicked: isClicked
    }).catch((err: any) => {
      log.warn('[lottery] 轮播展示日志上报失败（不影响业务）:', err)
    })
  },

  // ========================================
  // 页面导航
  // ========================================

  goToExchange() {
    wx.switchTab({ url: '/pages/exchange/exchange' })
  },

  /** 跳转到道具仓库/背包页面 */
  goToInventory() {
    wx.navigateTo({ url: '/pages/trade/inventory/inventory' })
  }
})

export { }

