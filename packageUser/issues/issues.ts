/**
 * 用户工单进度查看页面
 *
 * 功能: 用户查看自己的工单列表、工单状态和处理进度
 *
 * 后端API:
 * - GET /api/v4/system/chat/issues — 获取用户工单列表（已脱敏）
 *
 * 后端返回数据已脱敏: 不含 description / resolution / compensation_log / 内部备注
 * 仅返回: issue_id, issue_type, priority, status, title, created_at, resolved_at
 *
 * @file packageUser/issues/issues.ts
 * @version 1.0.0
 * @since 2026-02-23
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const log = Logger.createLogger('issues')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 工单状态文案映射（对应后端 customer_service_issues.status 字段）
 */
const ISSUE_STATUS_MAP: Record<string, string> = {
  open: '待处理',
  processing: '处理中',
  resolved: '已解决',
  closed: '已关闭'
}

/**
 * 工单类型文案映射（对应后端 customer_service_issues.issue_type 字段）
 */
const ISSUE_TYPE_MAP: Record<string, string> = {
  asset: '资产问题',
  trade: '交易纠纷',
  lottery: '抽奖问题',
  item: '物品问题',
  account: '账号问题',
  consumption: '消费问题',
  feedback: '反馈建议',
  other: '其他'
}

/**
 * 工单类型图标映射
 */
const ISSUE_TYPE_ICON_MAP: Record<string, string> = {
  asset: '💎',
  trade: '🔄',
  lottery: '🎰',
  item: '🎒',
  account: '👤',
  consumption: '💳',
  feedback: '📝',
  other: '📋'
}

/**
 * 优先级文案映射（对应后端 customer_service_issues.priority 字段）
 */
const ISSUE_PRIORITY_MAP: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急'
}

Page({
  data: {
    issues: [] as any[],
    loadStatus: 'loading' as 'loading' | 'success' | 'empty' | 'error',
    currentPage: 1,
    pageSize: 10,
    totalCount: 0,
    hasMore: false,
    /* MobX Store绑定字段 */
    isLoggedIn: false
  },

  /** MobX Store绑定实例（onUnload时销毁） */
  userBindings: null as any,

  onLoad() {
    log.info('工单列表页面加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    if (!checkAuth()) {
      log.warn('用户未登录，已自动跳转')
      return
    }

    this.loadIssues()
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  async onPullDownRefresh() {
    log.info('下拉刷新工单列表')
    this.setData({ currentPage: 1 })
    await this.loadIssues()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.loadMoreIssues()
    }
  },

  /**
   * 加载工单列表
   *
   * 后端API: GET /api/v4/system/chat/issues?page=1&page_size=10
   * 数据隔离: 后端根据JWT中的user_id，只返回该用户的工单
   *
   * 返回格式:
   * {
   *   rows: [{ issue_id, issue_type, priority, status, title, created_at, resolved_at }],
   *   count: 总数,
   *   page: 当前页,
   *   page_size: 每页数量
   * }
   */
  async loadIssues() {
    this.setData({ loadStatus: 'loading' })

    try {
      const result = await API.getUserIssues(this.data.currentPage, this.data.pageSize)

      if (result.success && result.data) {
        const rawIssues = result.data.rows || []
        const totalCount = result.data.count || 0

        const processedIssues = rawIssues.map((issue: any) => this.processIssueItem(issue))

        this.setData({
          issues: processedIssues,
          totalCount,
          hasMore: processedIssues.length < totalCount,
          loadStatus: processedIssues.length > 0 ? 'success' : 'empty'
        })

        log.info('工单列表加载成功:', processedIssues.length, '条')
      } else {
        this.setData({ issues: [], loadStatus: 'empty' })
      }
    } catch (error) {
      log.error('加载工单列表失败:', error)
      this.setData({ loadStatus: 'error' })
      showToast('加载工单列表失败')
    }
  },

  /** 加载更多工单（触底分页） */
  async loadMoreIssues() {
    const nextPage = this.data.currentPage + 1

    try {
      const result = await API.getUserIssues(nextPage, this.data.pageSize)

      if (result.success && result.data) {
        const moreIssues = (result.data.rows || []).map((issue: any) =>
          this.processIssueItem(issue)
        )

        this.setData({
          issues: [...this.data.issues, ...moreIssues],
          currentPage: nextPage,
          hasMore: this.data.issues.length + moreIssues.length < (result.data.count || 0)
        })
      }
    } catch (error) {
      log.error('加载更多工单失败:', error)
      showToast('加载更多失败')
    }
  },

  /**
   * 处理单条工单数据（后端snake_case → 前端展示格式）
   *
   * @param issue - 后端返回的原始工单数据
   * @returns 处理后的展示数据
   */
  processIssueItem(issue: any) {
    const issueType = issue.issue_type || 'other'
    const status = issue.status || 'open'
    const priority = issue.priority || 'medium'

    return {
      issueId: issue.issue_id,
      title: issue.title || '未知问题',
      issueType,
      issueTypeText: ISSUE_TYPE_MAP[issueType] || '其他',
      issueTypeIcon: ISSUE_TYPE_ICON_MAP[issueType] || '📋',
      status,
      statusText: ISSUE_STATUS_MAP[status] || '未知',
      priority,
      priorityText: ISSUE_PRIORITY_MAP[priority] || '中',
      createdAt: issue.created_at ? formatDateMessage(issue.created_at) : '',
      resolvedAt: issue.resolved_at ? formatDateMessage(issue.resolved_at) : ''
    }
  },

  /** 重试加载 */
  retryLoad() {
    this.setData({ currentPage: 1 })
    this.loadIssues()
  }
})
