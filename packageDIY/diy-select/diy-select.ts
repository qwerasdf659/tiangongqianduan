/**
 * DIY 设计入口页（页面-хаб）
 *
 * 三个入口:
 *   1. 我的设计 → /packageDIY/diy-works/diy-works
 *   2. 自由定制饰品 → /packageDIY/diy-design/diy-design（直接进入工作台）
 *   3. 设计广场 → /packageDIY/diy-plaza/diy-plaza（模板列表页，原款式选择逻辑迁移至此）
 *
 * 后端依赖: 无（本页面为纯前端导航页，不调用API）
 * 图标资源: freeDesignIcon / designPlazaIcon 由后端配置或本地资源提供
 *           当前使用占位图标，待后端提供真实图片URL后替换
 *
 * @file packageDIY/diy-select/diy-select.ts
 */

Page({
  data: {
    /** 自由定制饰品图标URL（后端提供时替换，当前为空使用占位样式） */
    freeDesignIcon: '',
    /** 设计广场图标URL（后端提供时替换，当前为空使用占位样式） */
    designPlazaIcon: ''
  },

  /** 跳转到我的设计作品列表页 */
  onGoToMyWorks() {
    wx.navigateTo({
      url: '/packageDIY/diy-works/diy-works'
    })
  },

  /** 自由定制饰品 — 直接进入工作台（工作台自动加载默认模板） */
  onFreeDesign() {
    wx.navigateTo({
      url: '/packageDIY/diy-design/diy-design'
    })
  },

  /**
   * 设计广场 — 浏览模板列表
   * ⚠️ 需要新建 /packageDIY/diy-plaza/diy-plaza 页面
   *    将原 diy-select 的模板列表+分类Tab逻辑迁移到该页面
   *    当前暂时跳转到 diy-design 页面，待 diy-plaza 页面创建后替换路由
   */
  onDesignPlaza() {
    /* TODO: 待创建 diy-plaza 页面后替换为正确路由 */
    wx.showToast({
      title: '设计广场即将上线',
      icon: 'none',
      duration: 2000
    })
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 设计你的专属饰品',
      path: '/packageDIY/diy-select/diy-select'
    }
  }
})
