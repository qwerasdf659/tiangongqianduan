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
const { Utils } = require('../../utils/index')
const { checkAuth } = Utils

Page({
  data: {
    freeDesignIcon: '',
    designPlazaIcon: '',
    loginPopupVisible: false
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

  onLoginPopupClose() {
    this.setData({ loginPopupVisible: false })
  },

  onLoginSuccess() {
    this.setData({ loginPopupVisible: false })
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 设计你的专属饰品',
      path: '/pages/diy/diy'
    }
  }
})
