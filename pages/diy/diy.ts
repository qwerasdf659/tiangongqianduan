/**
 * DIY tab 入口页（tabBar 页面）
 *
 * 直接在 tabBar 页面内展示 DIY 设计入口内容，
 * 保持底部 5 个 tab 始终可见。
 *
 * 三个入口:
 *   1. 我的设计 → /packageDIY/diy-works/diy-works
 *   2. 自由定制饰品 → /packageDIY/diy-templates/diy-templates（先选款式/模式，再进 diy-lite 设计台）
 *   3. 设计广场 → 待上线
 *
 * 旧版工作台（packageDIY/diy-design）入口已关闭（2026-07-10），页面归档保留仅作参考。
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
    topBannerReady: false
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

  /**
   * 自由定制饰品 → 先进款式选择页（diy-templates，分类Tab 手链/项链/戒指/吊坠），
   * 用户选定款式后带 templateId 进入 diy-lite 设计台（按 layout.shape 自动切换串珠/镶嵌模式）。
   * 不直接跳 diy-lite：避免"自动取第一个模板"让用户莫名进入某个款式。
   */
  onGoToLite() {
    wx.navigateTo({
      url: '/packageDIY/diy-templates/diy-templates'
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
