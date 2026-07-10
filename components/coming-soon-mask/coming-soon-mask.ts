/**
 * 「功能即将开放」蒙版组件（公共预留组件）
 *
 * 业务场景: 新功能页面先上线、业务尚未开放时，用本蒙版遮挡页面内容，
 * 防止用户触达未就绪的功能；业务开放后把 visible 置 false（或移除标签）即可放开。
 *
 * 交互约定:
 *   - 蒙版拦截所有点击/滑动（catchtap + catchtouchmove），阻止穿透到下层页面
 *   - 顶部留出状态栏 + 自定义导航栏高度，不遮返回按钮，保证用户可退出
 *   - 蒙版内提供「返回上一页」按钮（无上级页面时回退到 fallback_url）
 *
 * 历史来源: 以物易物 / 成长等级两页开放前的内联蒙版（2026-07-11 两功能正式开放后
 * 抽取为公共组件保留，供后续新功能页复用；lazyCodeLoading=requiredComponents，
 * 未被页面注册时不参与打包加载，零运行时成本）。
 *
 * 使用方式（页面 json 注册后）:
 *   <coming-soon-mask visible="{{true}}" icon="gift" desc="以物易物正在精心打磨，敬请期待" />
 *
 * @file components/coming-soon-mask/coming-soon-mask.ts
 * @version 1.0.0
 * @since 2026-07-11
 */

Component({
  properties: {
    /** 是否显示蒙版（业务开放后置 false 即放开页面） */
    visible: { type: Boolean, value: false },
    /** 蒙版图标（TDesign 图标名，按功能语义传入，如 gift / chart-bar） */
    icon: { type: String, value: 'gift' },
    /** 主标题 */
    title: { type: String, value: '功能即将开放' },
    /** 副文案（建议按功能名定制，如"XX功能正在精心打磨，敬请期待"） */
    desc: { type: String, value: '功能正在精心打磨，敬请期待' },
    /** 「返回上一页」失败（无上级页面）时的兜底跳转地址（须为 tabBar 页） */
    fallback_url: { type: String, value: '/pages/user/user' }
  },

  methods: {
    /** 蒙版拦截所有点击/滑动（功能未开放期间阻止穿透到下层页面），空实现即拦截 */
    onMaskTap() {},

    /** 蒙版「返回上一页」：功能未开放期间提供退出入口 */
    onBack() {
      const fallbackUrl = this.properties.fallback_url
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: fallbackUrl })
        }
      })
    }
  }
})
