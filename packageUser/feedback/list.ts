/**
 * 反馈列表页面 - 查看用户全部反馈历史
 *
 * 入口: packageUser/feedback/feedback.ts → onViewHistory()
 * 数据来源: GET /api/v4/system/feedback/my（分页）
 *
 * @file 天工餐厅积分系统 - 反馈列表页
 * @version 5.2.0
 * @since 2026-02-19
 */

const { API, Logger, Wechat, Utils } = require('../../utils/index')
const listLog = Logger.createLogger('feedback-list')
const { showToast } = Wechat
const { checkAuth } = Utils
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 反馈列表 */
    feedbacks: [] as any[],
    /** 当前页码 */
    currentPage: 1 as number,
    /** 每页条数 */
    pageSize: 10 as number,
    /** 是否还有更多数据 */
    hasMore: true as boolean,
    /** 加载状态 */
    loading: false as boolean,
    /** 下拉刷新状态 */
    refreshing: false as boolean,

    /** 反馈状态中文映射（对齐后端枚举: pending / processing / replied / closed） */
    statusMap: {
      pending: '待处理',
      processing: '处理中',
      replied: '已回复',
      closed: '已关闭'
    } as Record<string, string>
  },

  onLoad() {
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this.loadFeedbacks(true)
  },

  /** 加载反馈列表 */
  async loadFeedbacks(isRefresh: boolean = false) {
    if (!checkAuth()) {
      return
    }

    if (this.data.loading) {
      return
    }

    const targetPage = isRefresh ? 1 : this.data.currentPage

    try {
      this.setData({ loading: true })

      const result = await API.getMyFeedbacks(targetPage, this.data.pageSize)
      if (result.success && result.data) {
        const newFeedbacks = result.data.feedbacks || []
        const totalCount = result.data.total || 0

        if (isRefresh) {
          this.setData({
            feedbacks: newFeedbacks,
            currentPage: 2,
            hasMore: newFeedbacks.length < totalCount
          })
        } else {
          this.setData({
            feedbacks: [...this.data.feedbacks, ...newFeedbacks],
            currentPage: this.data.currentPage + 1,
            hasMore: this.data.feedbacks.length + newFeedbacks.length < totalCount
          })
        }

        listLog.info('反馈列表加载成功:', {
          page: targetPage,
          count: newFeedbacks.length,
          total: totalCount
        })
      }
    } catch (error: any) {
      listLog.error('加载反馈列表失败:', error)
      showToast('加载失败，请重试')
    } finally {
      this.setData({ loading: false, refreshing: false })
    }
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadFeedbacks(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /** 触底加载更多 */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadFeedbacks(false)
    }
  },

  /** 跳转反馈详情 */
  onFeedbackTap(e: any) {
    const feedbackId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/packageUser/feedback/detail?id=${feedbackId}`
    })
  },

  /** 跳转提交新反馈 */
  onNewFeedback() {
    wx.navigateTo({
      url: '/packageUser/feedback/feedback'
    })
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 我的反馈',
      path: '/packageUser/feedback/feedback'
    }
  }
})

export { }
