/**
 * 网页浏览器页面 - 用于在小程序内打开外部链接
 *
 * 使用场景: 轮播图广告跳转外部URL (link_type = 'webview')
 * 接收参数: url（经 encodeURIComponent 编码的完整URL）
 *
 * @file 天工餐厅积分系统 - WebView页面
 * @version 5.2.0
 * @since 2026-02-19
 */

const { Logger } = require('../../utils/index')
const webviewLog = Logger.createLogger('webview')

Page({
  data: {
    /** web-view 加载的目标URL */
    webviewUrl: '' as string,
    /** 页面标题（从URL参数或web-view bindload事件获取） */
    pageTitle: '加载中...' as string
  },

  onLoad(options: Record<string, string | undefined>) {
    const rawUrl = options.url || ''
    if (!rawUrl) {
      webviewLog.error('缺少 url 参数')
      wx.showModal({
        title: '链接无效',
        content: '未提供有效的网页地址',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }

    const decodedUrl = decodeURIComponent(rawUrl)

    if (!decodedUrl.startsWith('https://')) {
      webviewLog.error('非HTTPS链接，拒绝加载:', decodedUrl)
      wx.showModal({
        title: '安全提示',
        content: '仅支持 HTTPS 安全链接',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }

    webviewLog.info('加载网页:', decodedUrl)

    const titleFromOptions = options.title ? decodeURIComponent(options.title) : ''
    this.setData({
      webviewUrl: decodedUrl,
      pageTitle: titleFromOptions || '网页浏览'
    })

    if (titleFromOptions) {
      wx.setNavigationBarTitle({ title: titleFromOptions })
    }
  },

  /** web-view 加载完成回调 */
  onWebviewLoad() {
    webviewLog.info('网页加载完成')
  },

  /** web-view 加载失败回调 */
  onWebviewError(e: any) {
    webviewLog.error('网页加载失败:', e.detail)
    wx.showToast({ title: '网页加载失败', icon: 'none' })
  },

  onShareAppMessage() {
    return {
      title: this.data.pageTitle,
      path: `/pages/webview/webview?url=${encodeURIComponent(this.data.webviewUrl)}`
    }
  }
})

export {}
