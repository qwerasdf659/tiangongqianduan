/**
 * DIY tab 入口页（tabBar 页面）
 *
 * 直接在 tabBar 页面内展示 DIY 设计入口内容，
 * 保持底部 5 个 tab 始终可见。
 *
 * 三个入口:
 *   1. 我的设计 → /packageDIY/diy-works/diy-works
 *   2. 自由定制饰品 → /packageDIY/diy-design/diy-design
 *   3. 设计广场 → 待上线
 *
 * @file pages/diy/diy.ts
 */
const { diyStore } = require('../../store/diy')
const { Utils, TopBanner } = require('../../utils/index')
const { checkAuth } = Utils

Page({
  data: {
    freeDesignIcon: '',
    designPlazaIcon: '',
    loginPopupVisible: false,

    // 顶部沉浸式横幅（运营可配，后端 ad-delivery?slot_type=top_banner&position=diy）
    /** 顶部 Banner 投放项（空则显示占位框） */
    topBannerItems: [] as API.AdDeliveryItem[],
    /** 顶部 Banner 是否轮播（后端槽位级 is_carousel） */
    topBannerCarousel: false,
    /** 顶部 Banner 轮播间隔毫秒（后端槽位级 slide_interval_ms） */
    topBannerInterval: 3000,
    /** 是否有运营配置的顶部 Banner 图（false 时显示占位框） */
    topBannerReady: false,

    /** 功能后续开放蒙版：true 时整页遮挡，拦截所有交互（后续开放后改为 false 或接后端开关） */
    comingSoonVisible: true
  },

  onLoad() {
    /* 顶部 Banner 运营投放（失败/空则保持占位，不报错） */
    this.loadTopBanner()
  },

  /** 加载顶部 Banner（复用 TopBanner 共享逻辑） */
  async loadTopBanner() {
    const result = await TopBanner.loadTopBanner('diy')
    this.setData(result)
  },

  /** 顶部 Banner 点击（复用 TopBanner 跳转 + 上报） */
  onTopBannerTap(e: any) {
    if (!this.data.topBannerReady) {
      return
    }
    const tapIndex = Number(e?.currentTarget?.dataset?.index) || 0
    TopBanner.handleTopBannerTap(this.data.topBannerItems[tapIndex], 'diy')
  },

  /** 顶部 Banner 轮播切换（swiper bindchange）：对切入的当前张补报曝光 */
  onTopBannerChange(e: any) {
    const currentIndex = Number(e?.detail?.current) || 0
    TopBanner.handleTopBannerChange(this.data.topBannerItems, currentIndex, 'diy')
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      const tabBar = this.getTabBar()
      if (tabBar) {
        tabBar.setData({ selected: 3 })
      }
    }
    if (diyStore.currentTemplate) {
      diyStore.clearDesign()
    }
    if (checkAuth({ redirect: false }) && this.data.loginPopupVisible) {
      this.setData({ loginPopupVisible: false })
    }
  },

  onGoToMyWorks() {
    if (!checkAuth({ redirect: false })) {
      this.setData({ loginPopupVisible: true })
      return
    }
    wx.navigateTo({
      url: '/packageDIY/diy-works/diy-works'
    })
  },

  onFreeDesign() {
    wx.navigateTo({
      url: '/packageDIY/diy-design/diy-design'
    })
  },

  onDesignPlaza() {
    if (!checkAuth({ redirect: false })) {
      this.setData({ loginPopupVisible: true })
      return
    }
    wx.showToast({
      title: '设计广场即将上线',
      icon: 'none',
      duration: 2000
    })
  },

  onShowLoginPopup() {
    this.setData({ loginPopupVisible: true })
  },

  /** 拦截"功能后续开放"蒙版上的所有触摸，阻止穿透到下层页面（catch 绑定，无需逻辑） */
  onComingSoonMaskTap() {},

  onLoginPopupClose() {
    this.setData({ loginPopupVisible: false })
  },

  onLoginSuccess() {
    this.setData({ loginPopupVisible: false })
    /* 登录后补拉顶部 Banner：ad-delivery 需登录态，登出态进页面取不到 */
    this.loadTopBanner()
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 设计你的专属饰品',
      path: '/pages/diy/diy'
    }
  }
})
