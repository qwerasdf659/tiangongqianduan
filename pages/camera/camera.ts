/**
 * pages/camera/camera.ts - 发现页面 - 抽奖活动聚合入口 + MobX响应式状态
 *
 * ⚠️ 目录命名历史遗留：pages/camera/ 实际承载"发现"功能（活动聚合），
 * 非相机功能。因涉及 app.json tabBar、全项目跳转路径变更，暂保留目录名，
 * 后续统一重构时再改为 pages/discover/。
 *
 * 🔴 数据来源：
 * 后端路由: GET /api/v4/lottery/campaigns/active（需登录）
 * API方法: API.getActiveCampaigns()（utils/api/lottery.ts）
 * 返回字段: campaign_code, campaign_name, campaign_type, status,
 *           start_time, end_time, is_featured, display_tags 等
 */

// 统一工具函数导入
const { Wechat, API, Logger, Utils } = require('../../utils/index')
const log = Logger.createLogger('camera')
const { showToast } = Wechat
const { checkAuth } = Utils
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
Page({
  data: {
    // 用户信息
    isLoggedIn: false,
    userInfo: {},

    // 搜索关键词
    searchKeyword: '',

    // 活动列表（后端 GET /api/v4/lottery/campaigns/active 返回）
    campaigns: [] as any[],
    filteredCampaigns: [] as any[],

    // 页面状态
    loading: false,
    refreshing: false,
    isEmpty: false,
    errorMessage: ''
  },

  onLoad(options) {
    log.info('发现页面（活动聚合）加载', options)

    // 🆕 MobX Store绑定
    this.userStoreBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this.initializePage()
  },

  /** 页面卸载时清理定时器 + 销毁Store绑定 */
  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    if (this.userStoreBindings) {
      this.userStoreBindings.destroyStoreBindings()
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 1 })
    }
    log.info('发现页面（活动聚合）显示')

    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#5B7A5E',
      animation: { duration: 300, timingFunc: 'easeIn' }
    })
    wx.setTabBarStyle({ selectedColor: '#5B7A5E' })

    // 检查登录状态（活动页面可以未登录浏览，不跳转登录页）
    const isLoggedIn = checkAuth({ redirect: false })

    this.setData({
      isLoggedIn,
      userInfo: isLoggedIn ? userStore.userInfo || {} : {}
    })
  },

  /**
   * 初始化页面 — 加载进行中的抽奖活动列表
   *
   * 后端路由: GET /api/v4/lottery/campaigns/active（需登录）
   * API方法: API.getActiveCampaigns()
   */
  async initializePage() {
    wx.setNavigationBarColor({
      frontColor: '#ffffff',
      backgroundColor: '#5B7A5E',
      animation: { duration: 300, timingFunc: 'easeIn' }
    })
    wx.setTabBarStyle({ selectedColor: '#5B7A5E' })

    // 未登录时不请求需认证的接口，仅显示空状态引导登录
    if (!checkAuth({ redirect: false })) {
      this.setData({ campaigns: [], filteredCampaigns: [], isEmpty: true, loading: false })
      return
    }

    this.setData({ loading: true, campaigns: [] })

    try {
      const result = await API.getActiveCampaigns()

      if (result && result.success && result.data) {
        const campaignList = Array.isArray(result.data) ? result.data : []

        this.setData({
          campaigns: campaignList,
          loading: false
        })

        this.filterCampaigns()
        log.info('活动数据加载完成，共', campaignList.length, '个活动')
      } else {
        this.setData({ campaigns: [], loading: false })
        this.filterCampaigns()
        log.warn('活动API返回无数据')
      }
    } catch (error: any) {
      log.error('初始化失败:', error)
      this.setData({ loading: false, errorMessage: '加载失败，请重试' })
      showToast('加载失败，请重试')
    }
  },

  /**
   * 筛选活动列表
   * 按搜索关键词筛选（campaign_name 匹配）
   */
  filterCampaigns() {
    const { campaigns, searchKeyword } = this.data

    let filtered = campaigns

    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(
        (item: any) =>
          (item.campaign_name || '').toLowerCase().includes(keyword) ||
          (item.campaign_type || '').toLowerCase().includes(keyword)
      )
    }

    // is_featured 优先排序
    filtered.sort((a: any, b: any) => {
      if (a.is_featured !== b.is_featured) {
        return a.is_featured ? -1 : 1
      }
      return 0
    })

    this.setData({
      filteredCampaigns: filtered,
      isEmpty: filtered.length === 0
    })

    log.info('筛选完成，共', filtered.length, '个活动')
  },

  /** 搜索输入（防抖300ms） */
  onSearchInput(e: any) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }

    this.searchTimer = setTimeout(() => {
      this.filterCampaigns()
    }, 300)
  },

  /** 清空搜索 */
  onClearSearch() {
    this.setData({ searchKeyword: '' })
    this.filterCampaigns()
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    log.info('下拉刷新')

    this.setData({ refreshing: true })

    try {
      // 重新加载活动数据
      await this.initializePage()
      showToast('刷新成功')
    } catch (error: any) {
      log.error('刷新失败:', error)
      showToast('刷新失败，请重试')
    } finally {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    }
  },

  /** 活动卡片点击 — 跳转到抽奖页面 */
  onActivityTap(e: any) {
    const campaign = e.currentTarget.dataset.campaign

    if (!campaign || !campaign.campaign_code) {
      return
    }

    log.info('点击活动:', campaign.campaign_name, campaign.campaign_code)

    // 直接跳转到抽奖页面（lottery-activity 组件会根据 campaign_code 加载）
    wx.switchTab({
      url: '/pages/lottery/lottery'
    })
  },

  /**
   * 获取活动状态文本
   * 对齐后端 lottery_campaigns.status 枚举值
   */
  getStatusText(status: string) {
    const statusMap: Record<string, string> = {
      active: '进行中',
      upcoming: '即将开始',
      ended: '已结束',
      paused: '已暂停'
    }
    return statusMap[status] || '未知'
  },

  /** 跳转登录页 */
  goLogin() {
    wx.navigateTo({ url: '/packageUser/auth/auth' })
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '发现精彩活动，快来参与！',
      path: '/pages/camera/camera'
    }
  }
})
