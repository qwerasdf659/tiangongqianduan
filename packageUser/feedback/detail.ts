/**
 * 反馈详情页面 - 查看单条反馈的详细信息和客服回复
 *
 * 入口: packageUser/feedback/feedback.ts → viewFeedbackDetail()
 * 参数: id（feedback_id）
 * 数据来源: GET /api/v4/system/feedback/:id（后端直接返回单条记录）
 *
 * @file 天工餐厅积分系统 - 反馈详情页
 * @version 5.2.0
 * @since 2026-02-19
 */

const { API, Logger, Wechat, Utils } = require('../../utils/index')
const detailLog = Logger.createLogger('feedback-detail')
const { showToast } = Wechat
const { checkAuth } = Utils
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 反馈ID（从页面参数获取） */
    feedbackId: 0 as number,
    /** 反馈详情数据（后端 GET /api/v4/system/feedback/:id 返回） */
    feedbackDetail: null as any,
    /** 页面加载状态 */
    loading: true as boolean,
    /** 加载失败 */
    loadError: false as boolean,

    /** 反馈状态中文映射（对齐后端枚举: pending / processing / replied / closed） */
    statusMap: {
      pending: '待处理',
      processing: '处理中',
      replied: '已回复',
      closed: '已关闭'
    } as Record<string, string>
  },

  onLoad(options: Record<string, string | undefined>) {
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    const feedbackId = parseInt(options.id || '0', 10)
    if (!feedbackId) {
      detailLog.error('缺少反馈ID参数')
      showToast('参数错误')
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    this.setData({ feedbackId })
    this.loadFeedbackDetail(feedbackId)
  },

  /**
   * 加载反馈详情（直接调用后端单条查询接口）
   * 后端API: GET /api/v4/system/feedback/:id
   * 权限: 普通用户只能查看自己的反馈，管理员可查看所有
   */
  async loadFeedbackDetail(feedbackId: number) {
    if (!checkAuth()) {
      return
    }

    try {
      this.setData({ loading: true, loadError: false })

      const result = await API.getFeedbackDetail(feedbackId)
      if (result.success && result.data) {
        this.setData({ feedbackDetail: result.data })
        wx.setNavigationBarTitle({ title: `反馈 #${feedbackId}` })
        detailLog.info('反馈详情加载成功:', feedbackId)
      } else {
        this.setData({ loadError: true })
        detailLog.error('获取反馈详情失败:', result.message)
        showToast(result.message || '获取反馈详情失败')
      }
    } catch (error: any) {
      detailLog.error('加载反馈详情失败:', error)
      this.setData({ loadError: true })

      const errorMsg =
        error.code === 'NOT_FOUND'
          ? '未找到该反馈记录'
          : error.code === 'FORBIDDEN'
            ? '无权查看该反馈'
            : '加载失败，请重试'
      showToast(errorMsg)
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 预览附件图片 */
  onPreviewImage(e: any) {
    const currentUrl = e.currentTarget.dataset.url
    const attachments = this.data.feedbackDetail?.attachments || []
    const urls = attachments.map((item: any) => item.url || item)
    wx.previewImage({ current: currentUrl, urls })
  },

  /** 返回反馈列表 */
  onGoBack() {
    wx.navigateBack()
  },

  /** 重新加载 */
  onRetry() {
    this.loadFeedbackDetail(this.data.feedbackId)
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 反馈详情',
      path: '/packageUser/feedback/feedback'
    }
  }
})

export { }

