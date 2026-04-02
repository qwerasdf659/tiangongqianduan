/**
 * DIY 款式选择页
 *
 * 用户在此页选择一个款式（手链/项链/戒指/吊坠），跳转到设计页
 */

// 🔴 统一工具函数导入
const { API } = require('../../utils/index')

const TYPE_LABELS: Record<string, string> = {
  bracelet: '手链',
  necklace: '项链',
  ring: '戒指',
  pendant: '吊坠'
}

const SHAPE_LABELS: Record<string, string> = {
  circle: '圆形排列',
  ellipse: '椭圆排列',
  arc: '弧线排列',
  line: '直线排列',
  slots: '镶嵌模式'
}

const MODE_LABELS: Record<string, string> = {
  circle: '串珠模式',
  ellipse: '串珠模式',
  arc: '串珠模式',
  line: '串珠模式',
  slots: '镶嵌模式'
}

Page({
  data: {
    templates: [] as any[],
    loading: true,
    hasError: false,
    errorMessage: ''
  },

  onLoad() {
    this.loadTemplates()
  },

  onPullDownRefresh() {
    this.loadTemplates().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  async loadTemplates() {
    this.setData({ loading: true, hasError: false })

    try {
      const res = await API.getDiyTemplates()
      if (res.success && res.data) {
        const templates = res.data.map((tpl: API.DiyTemplate) => ({
          ...tpl,
          _typeLabel: TYPE_LABELS[tpl.type] || tpl.type,
          _shapeLabel: SHAPE_LABELS[tpl.layout.shape] || '',
          _modeLabel: MODE_LABELS[tpl.layout.shape] || ''
        }))
        this.setData({ templates, loading: false })
      } else {
        this.setData({
          loading: false,
          hasError: true,
          errorMessage: res.message || '加载失败'
        })
      }
    } catch (_err) {
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: '网络异常，请重试'
      })
    }
  },

  onSelectTemplate(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number
    const template = this.data.templates[index]
    if (!template) {
      return
    }

    wx.navigateTo({
      url: `/packageDIY/diy-design/diy-design?templateId=${template.id}`
    })
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 设计你的专属饰品',
      path: '/pages/diy/diy'
    }
  }
})
