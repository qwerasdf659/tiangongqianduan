/**
 * 通用自定义导航栏组件（Skyline 渲染模式必需）
 *
 * Skyline 不支持原生导航栏，所有页面需设置 navigationStyle: custom
 * 本组件自动获取状态栏高度和胶囊按钮位置，确保导航栏与系统UI对齐
 *
 * @file 天工餐厅积分系统 - 自定义导航栏
 * @version 5.2.0
 */

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    /** 导航栏标题 */
    title: {
      type: String,
      value: ''
    },
    /** 背景色（默认透明，由页面自行控制） */
    bgColor: {
      type: String,
      value: '#ffffff'
    },
    /** 文字颜色 */
    textColor: {
      type: String,
      value: '#000000'
    },
    /** 是否显示返回按钮（默认自动判断：页面栈 > 1 时显示） */
    showBack: {
      type: Boolean,
      value: false
    },
    /** 是否显示首页按钮（tabBar 页面不需要返回，可选显示首页图标） */
    showHome: {
      type: Boolean,
      value: false
    }
  },

  data: {
    /** 状态栏高度（px） */
    statusBarHeight: 20,
    /** 导航栏内容区高度（px），对齐微信胶囊按钮 */
    navBarHeight: 44
  },

  lifetimes: {
    attached() {
      this._calcNavBarLayout()
    }
  },

  methods: {
    /** 计算导航栏布局尺寸（状态栏 + 胶囊按钮对齐） */
    _calcNavBarLayout() {
      try {
        const windowInfo = wx.getWindowInfo()
        const statusBarHeight = windowInfo.statusBarHeight || 20

        /* 获取胶囊按钮位置，导航栏高度 = 胶囊上下间距对齐 */
        const menuRect = wx.getMenuButtonBoundingClientRect()
        const navBarHeight = (menuRect.top - statusBarHeight) * 2 + menuRect.height

        this.setData({ statusBarHeight, navBarHeight })
      } catch (_error) {
        /* 降级使用默认值 */
        this.setData({ statusBarHeight: 20, navBarHeight: 44 })
      }
    },

    /** 返回上一页 */
    onBack() {
      const pages = getCurrentPages()
      if (pages.length > 1) {
        wx.navigateBack()
      } else {
        wx.switchTab({ url: '/pages/lottery/lottery' })
      }
    },

    /** 回到首页 */
    onHome() {
      wx.switchTab({ url: '/pages/lottery/lottery' })
    }
  }
})
