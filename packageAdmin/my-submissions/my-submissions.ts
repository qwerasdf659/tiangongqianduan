/**
 * packageAdmin/my-submissions/my-submissions.ts - 我的提交（店员查看本人/本店提交的消费记录及审核状态）
 *
 * 业务背景（对接文档 2026-06-24《店员商家功能按钮显示不全问题》§四）：
 *   - 「审核详情」是管理员（role_level>=100）在 console 域审核 pending 记录的功能；
 *   - 店员（merchant_staff, role_level>=20）只负责「提交消费记录」，提交后需要能查看自己
 *     这些记录的审核进度（待审核/已通过/已拒绝），这与 admin 审核是两回事。
 *   - 本页即店员侧「查自己提交记录审核状态」入口，数据走商家域只读接口，不碰 console 审核接口。
 *
 * 数据来源（均为后端真实接口，零映射直读 snake_case）：
 *   - GET /api/v4/shop/consumption/merchant/stats  顶部状态概况（by_status/total/timeout）
 *   - GET /api/v4/shop/consumption/merchant/list    提交记录分页列表（按当前登录人范围隔离）
 *
 * 权限：role_level>=20（店员及以上）。后端按登录人范围隔离数据，前端只展示。
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const log = Logger.createLogger('my-submissions')
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { checkAuth } = Utils
const { showToast } = Wechat

/** 审核状态展示映射（与 consumption_records.status 四态对齐：pending/approved/rejected/expired） */
const STATUS_DISPLAY: Record<string, { text: string; color: string; bgColor: string }> = {
  pending: { text: '待审核', color: '#c5a572', bgColor: 'rgba(197, 165, 114, 0.12)' },
  approved: { text: '已通过', color: '#27ae60', bgColor: 'rgba(39, 174, 96, 0.12)' },
  rejected: { text: '已拒绝', color: '#e74c3c', bgColor: 'rgba(231, 76, 60, 0.12)' },
  expired: { text: '已过期', color: '#999999', bgColor: 'rgba(153, 153, 153, 0.12)' }
}

Page({
  data: {
    /** 是否已登录（MobX 绑定） */
    isLoggedIn: false,

    /** 顶部状态概况（来自 merchant/stats 的 by_status，前端零计算直读） */
    summaryReady: false,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,

    /** 提交记录列表（已附前端展示辅助字段，原始 snake_case 字段保留） */
    submissionRecords: [] as any[],

    /** 分页状态（后端真分页） */
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasMore: true,

    /** 页面状态 */
    loading: true,
    loadingMore: false,
    initialized: false
  },

  onLoad() {
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })
  },

  onShow() {
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })
    if (!this.data.initialized) {
      this.initializePage()
    } else {
      this.refreshAll()
    }
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  /** 首次进入：并行加载状态概况 + 首页记录 */
  async initializePage() {
    this.setData({ loading: true })
    try {
      await Promise.all([this.loadStats(), this.loadRecords(1, false)])
    } finally {
      this.setData({ loading: false, initialized: true })
    }
  },

  /** 刷新全部（返回本页/下拉刷新时调用） */
  async refreshAll() {
    await Promise.all([this.loadStats(), this.loadRecords(1, false)])
  },

  /**
   * 加载状态概况 - GET /api/v4/shop/consumption/merchant/stats
   * 直读后端 by_status.{pending,approved,rejected}.count，前端不自行累加计算。
   */
  async loadStats() {
    try {
      const apiResult = await API.getMerchantConsumptionStats()
      if (apiResult?.success && apiResult.data) {
        const byStatus = apiResult.data.by_status || {}
        this.setData({
          summaryReady: true,
          pendingCount: byStatus.pending?.count || 0,
          approvedCount: byStatus.approved?.count || 0,
          rejectedCount: byStatus.rejected?.count || 0
        })
      }
    } catch (statsError) {
      /* 概况加载失败不阻断列表展示，仅记录日志 */
      log.warn('提交状态概况加载失败（非阻断）:', statsError)
    }
  },

  /**
   * 加载提交记录 - GET /api/v4/shop/consumption/merchant/list
   *
   * @param page   目标页码（1 基）
   * @param append true=触底追加，false=首屏/下拉替换
   */
  async loadRecords(page: number = 1, append: boolean = false) {
    if (!this.data.isLoggedIn) {
      return
    }
    try {
      const apiResult = await API.getMerchantConsumptions({ page, page_size: this.data.pageSize })
      if (!apiResult?.success || !apiResult.data) {
        throw new Error(apiResult?.message || '提交记录加载失败')
      }

      const rawRecords = apiResult.data.records || []
      const pagination = apiResult.data.pagination || {}
      const totalPages =
        pagination.total_pages || (rawRecords.length === this.data.pageSize ? page + 1 : page)

      const formattedRecords = rawRecords.map((record: any) => this._formatRecord(record))
      const mergedRecords = append
        ? [...this.data.submissionRecords, ...formattedRecords]
        : formattedRecords

      this.setData({
        submissionRecords: mergedRecords,
        page,
        totalPages,
        hasMore: page < totalPages
      })
    } catch (loadError: any) {
      log.error('提交记录加载失败:', loadError)
      showToast(loadError.message || '提交记录加载失败', 'none', 2000)
    }
  },

  /** 为单条记录附加前端展示辅助字段（原始 snake_case 字段保留，前端零映射直读） */
  _formatRecord(record: any) {
    const amount = parseFloat(record.consumption_amount)
    return {
      ...record,
      statusDisplay: STATUS_DISPLAY[record.status] || STATUS_DISPLAY.pending,
      amountText: isNaN(amount) ? '0.00' : amount.toFixed(2),
      createdAtText: Utils.formatBeijingTimeField(record.created_at, 'relative')
    }
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    await this.refreshAll()
    wx.stopPullDownRefresh()
  },

  /** 触底加载更多 */
  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) {
      return
    }
    this.setData({ loadingMore: true })
    await this.loadRecords(this.data.page + 1, true)
    this.setData({ loadingMore: false })
  }
})
