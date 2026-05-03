/**
 * 自定义 tabBar 组件
 * 使用 TDesign tab-bar 承接底部导航，图标继续复用项目 Iconfont
 *
 * @file custom-tab-bar/index.ts
 * @version 2.0.0
 * @since 2026-03-21
 */
Component({
  data: {
    /** 当前选中的 tab 索引 */
    selected: 0,
    /** tab 列表配置 */
    list: [
      {
        pagePath: '/pages/lottery/lottery',
        text: '抽奖',
        iconClass: 'icon-wheel'
      },
      {
        pagePath: '/pages/camera/camera',
        text: '发现',
        iconClass: 'icon-compass'
      },
      {
        pagePath: '/pages/exchange/exchange',
        text: '商城',
        iconClass: 'icon-store'
      },
      {
        pagePath: '/pages/diy/diy',
        text: 'DIY',
        iconClass: 'icon-tag'
      },
      {
        pagePath: '/pages/user/user',
        text: '我的',
        iconClass: 'icon-user'
      }
    ] as any[]
  },

  methods: {
    onTabChange(e: WechatMiniprogram.CustomEvent) {
      const targetIndex = e.detail.value
      const targetItem = this.data.list[targetIndex]
      if (!targetItem || this.data.selected === targetIndex) {
        return
      }
      wx.switchTab({ url: targetItem.pagePath })
    }
  }
})
