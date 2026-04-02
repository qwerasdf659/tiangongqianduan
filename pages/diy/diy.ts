/**
 * DIY tab 入口页
 * 作为 tabBar 页面注册在主包中，onShow 时自动跳转到分包的款式选择页
 * 使用标记位避免从分包返回时重复跳转
 *
 * @file pages/diy/diy.ts
 */
Page({
  data: {
    loading: true
  },

  /** 是否需要跳转到分包（避免返回时死循环） */
  _shouldNavigate: true,

  onShow() {
    // 设置自定义 tabBar 选中态
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 3 })
    }

    if (this._shouldNavigate) {
      this._shouldNavigate = false
      // 跳转到分包的 DIY 款式选择页
      wx.navigateTo({
        url: '/packageDIY/diy-select/diy-select',
        fail: () => {
          this.setData({ loading: false })
        }
      })
    }
  },

  onHide() {
    // 页面隐藏时重置标记，下次从其他 tab 切过来时重新跳转
    this._shouldNavigate = true
    this.setData({ loading: true })
  }
})
