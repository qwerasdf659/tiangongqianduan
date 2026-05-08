/**
 * 自定义 tabBar 组件 — 纯 view 实现（不依赖 t-tab-bar）
 * 原因：TDesign t-tab-bar 在 Skyline + shadow DOM 下 slot="icon" 被 :empty 规则隐藏，
 *      且 --td-tab-bar-active-color 无法穿透，导致图标丢失 + 激活色退化为默认蓝。
 *
 * @file custom-tab-bar/index.ts
 * @version 3.0.0
 * @since 2026-05-07
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
    onTabTap(e: WechatMiniprogram.BaseEvent) {
      const index = Number((e.currentTarget.dataset as { index: number }).index)
      this._switchTo(index)
    },

    /** 兼容旧 wxml 缓存：如果编译器还在用旧 t-tab-bar 的 bind:change="onTabChange" */
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
