/**
 * DIY 3D预览页面
 *
 * 从 diyStore 读取当前设计的珠子数据，传递给 xr-bead-scene 组件渲染3D手串。
 * 支持全屏预览、触摸旋转、返回设计页。
 */

const { diyStore } = require('../../store/diy')

Page({
  data: {
    /** 逻辑像素宽高（CSS px） */
    width: 300,
    height: 500,
    /** 物理像素宽高（Canvas 渲染分辨率） */
    renderWidth: 600,
    renderHeight: 1000,
    /** 当前手串信息 */
    templateName: '',
    beadCount: 0,
    totalPrice: 0,
  },

  onLoad() {
    const info = wx.getWindowInfo()
    const width = info.windowWidth
    const height = info.windowHeight - 80
    const dpi = info.pixelRatio || 2

    const template = diyStore.currentTemplate
    const beads = diyStore.selectedBeads || []

    this.setData({
      width,
      height,
      renderWidth: Math.floor(width * dpi),
      renderHeight: Math.floor(height * dpi),
      templateName: template?.display_name || '手串预览',
      beadCount: beads.length,
      totalPrice: diyStore.totalPrice || 0,
    })
  },

  /** XR 场景就绪 */
  onSceneReady() {
    console.log('[3D Preview] scene ready, beads:', diyStore.selectedBeads?.length || 0)
  },

  /** 返回设计页 */
  onBack() {
    wx.navigateBack()
  },
})
