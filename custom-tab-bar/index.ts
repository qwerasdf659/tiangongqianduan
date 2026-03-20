/**
 * 自定义 tabBar 组件
 * 替代原生 tabBar，支持 6 套主题动态变色
 * 图标使用 Unicode 字符占位（后续替换为 Iconfont）
 *
 * @file custom-tab-bar/index.ts
 * @version 1.0.0
 * @since 2026-03-21
 */
Component({
  data: {
    /** 当前选中的 tab 索引 */
    selected: 0,
    /** 未选中态文字颜色 */
    color: '#999999',
    /** tab 列表配置 */
    list: [
      {
        pagePath: '/pages/lottery/lottery',
        text: '抽奖',
        iconText: '🎰'
      },
      {
        pagePath: '/pages/camera/camera',
        text: '发现',
        iconText: '🧭'
      },
      {
        pagePath: '/pages/exchange/exchange',
        text: '商城',
        iconText: '🏪'
      },
      {
        pagePath: '/pages/user/user',
        text: '我的',
        iconText: '👤'
      }
    ] as any[],
    /** 主题样式字符串（从页面传入） */
    themeStyle: ''
  },

  methods: {
    /**
     * 切换 tab 页面
     * 注意：不在此方法内 setData({ selected })，由各 tab 页面 onShow 驱动（防闪烁）
     */
    switchTab(e: WechatMiniprogram.TouchEvent) {
      const dataset = e.currentTarget.dataset
      const url = dataset.path
      const index = dataset.index
      if (this.data.selected === index) {
        return
      }
      wx.switchTab({ url })
    },

    /**
     * 更新主题样式（由各 tab 页面在 onShow 中调用）
     */
    updateTheme(themeStyle: string) {
      if (themeStyle !== this.data.themeStyle) {
        this.setData({ themeStyle })
      }
    }
  }
})
