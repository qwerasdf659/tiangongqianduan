/**
 * DIY tab 入口页
 * 作为 tabBar 页面注册在主包中，onShow 时自动跳转到分包的款式选择页
 * 使用标记位避免从分包返回时重复跳转
 *
 * 引入 diyStore 确保主包包含对 store/diy 的引用（消除编译器"主包未使用JS"警告）
 * 分包 packageDIY 各页面通过此 Store 共享设计状态
 *
 * @file pages/diy/diy.ts
 */
const { diyStore } = require('../../store/diy')

Page({
  data: {
    loading: true
  },

  /** 是否由 navigateTo 跳转到分包（区分"切tab进入"和"从分包返回"） */
  _navigatedToSubpackage: false,

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 3 })
    }

    if (this._navigatedToSubpackage) {
      /* 从分包返回 → 切回首页tab，因为 DIY tab 页本身只是跳板无独立内容 */
      this._navigatedToSubpackage = false
      wx.switchTab({ url: '/pages/lottery/lottery' })
      return
    }

    /* 从其他 tab 切过来 或 首次加载 → 跳转到分包款式选择页 */
    if (diyStore.currentTemplate) {
      diyStore.clearDesign()
    }
    this._navigatedToSubpackage = true
    wx.navigateTo({
      url: '/packageDIY/diy-select/diy-select',
      fail: () => {
        this._navigatedToSubpackage = false
        this.setData({ loading: false })
      }
    })
  }
})
