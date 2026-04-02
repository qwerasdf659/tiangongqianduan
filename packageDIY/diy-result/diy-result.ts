/**
 * DIY 设计结果页
 *
 * 展示设计保存成功信息，提供分享、保存海报、继续编辑等操作
 */

Page({
  data: {
    designId: '',
    totalPrice: 0,
    templateName: ''
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({
      designId: options.designId || '',
      totalPrice: Number(options.totalPrice || 0),
      templateName: decodeURIComponent(options.templateName || '')
    })
  },

  /** 分享给朋友 */
  onShare() {
    // 触发微信分享
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage']
    })
  },

  /** 保存海报（占位功能，待设计稿确认后完善） */
  onSavePoster() {
    wx.showToast({
      title: '海报功能开发中',
      icon: 'none'
    })
  },

  /** 继续编辑 */
  onBackToDesign() {
    wx.navigateBack()
  },

  /** 设计新款式 */
  onBackToSelect() {
    wx.navigateBack({ delta: 2 })
  },

  onShareAppMessage() {
    return {
      title: `来看看我设计的${this.data.templateName}！`,
      path: `/packageDIY/diy-design/diy-design?designId=${this.data.designId}`
    }
  }
})
