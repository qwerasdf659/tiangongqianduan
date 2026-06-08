/**
 * 自定义 tabBar 组件 — 纯 view + image 实现
 * 使用本地 SVG 图标文件替代 iconfont，确保图标清晰精致
 *
 * @file custom-tab-bar/index.ts
 * @version 4.0.0
 * @since 2026-05-09
 */
Component({
  options: {
    virtualHost: true
  },

  data: {
    selected: 0,
    list: [
      {
        pagePath: '/pages/lottery/lottery',
        text: '回馈',
        icon: '/custom-tab-bar/icons/wheel.svg',
        iconActive: '/custom-tab-bar/icons/wheel-active.svg'
      },
      {
        pagePath: '/pages/camera/camera',
        text: '发现',
        icon: '/custom-tab-bar/icons/compass.svg',
        iconActive: '/custom-tab-bar/icons/compass-active.svg'
      },
      {
        pagePath: '/pages/exchange/exchange',
        text: '商城',
        icon: '/custom-tab-bar/icons/store.svg',
        iconActive: '/custom-tab-bar/icons/store-active.svg'
      },
      {
        pagePath: '/pages/diy/diy',
        text: 'DIY',
        icon: '/custom-tab-bar/icons/tag.svg',
        iconActive: '/custom-tab-bar/icons/tag-active.svg'
      },
      {
        pagePath: '/pages/user/user',
        text: '我的',
        icon: '/custom-tab-bar/icons/user.svg',
        iconActive: '/custom-tab-bar/icons/user-active.svg'
      }
    ] as any[]
  },

  methods: {
    onTabTap(e: WechatMiniprogram.BaseEvent) {
      const index = Number((e.currentTarget.dataset as { index: number }).index)
      this._switchTo(index)
    },

    onTabChange(e: WechatMiniprogram.CustomEvent) {
      const index = Number(e.detail.value)
      this._switchTo(index)
    },

    _switchTo(index: number) {
      const target = this.data.list[index]
      if (!target || this.data.selected === index) {
        return
      }
      wx.switchTab({ url: target.pagePath })
    }
  }
})
