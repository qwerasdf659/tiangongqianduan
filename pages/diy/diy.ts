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
 * 引入 diyStore 确保主包包含对 store/diy 的引用
 * （消除编译器"主包未使用JS"警告）
 *
 * @file pages/diy/diy.ts
 */
const { diyStore } = require('../../store/diy')

Page({
  data: {
    /** 自由定制饰品图标URL（后端提供时替换） */
    freeDesignIcon: '',
    /** 设计广场图标URL（后端提供时替换） */
    designPlazaIcon: ''
  },

  onShow() {
    /* 同步 tabBar 选中态 */
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 3 })
    }
    /* 每次回到 tab 页时清除上次未完成的设计状态 */
    if (diyStore.currentTemplate) {
      diyStore.clearDesign()
    }
  },

  /** 跳转到我的设计作品列表页 */
  onGoToMyWorks() {
    wx.navigateTo({
      url: '/packageDIY/diy-works/diy-works'
    })
  },

  /** 自由定制饰品 — 进入工作台 */
  onFreeDesign() {
    wx.navigateTo({
      url: '/packageDIY/diy-design/diy-design'
    })
  },

  /**
   * 设计广场 — 浏览模板列表
   * ⚠️ 需要后端提供模板列表API后创建 diy-plaza 页面
   */
  onDesignPlaza() {
    wx.showToast({
      title: '设计广场即将上线',
      icon: 'none',
      duration: 2000
    })
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 设计你的专属饰品',
      path: '/pages/diy/diy'
    }
  }
})
