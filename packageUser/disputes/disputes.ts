/**
 * 我的售后申诉列表页面
 *
 * 业务语义: 用户查看自己发起的售后申诉（交易纠纷）进度，替代原"我的工单"入口。
 * 工单是客服内部跟踪工具（运营语言），不再对用户暴露；用户只看"我申诉的订单到哪一步"。
 *
 * 后端API:
 * - GET /api/v4/system/disputes/my — 我的售后申诉列表（已脱敏，仅本人）
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   rows[] 每条含: trade_dispute_id / order_type / order_id / dispute_type /
 *                  status / title / resolution / created_at / resolved_at
 *   脱敏后不含 assigned_to（处理客服）/ approval_chain_instance_id（仲裁审批链）等内部字段。
 *
 * @file packageUser/disputes/disputes.ts
 * @version 5.2.0
 * @since 2026-06-04
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const disputesListLog = Logger.createLogger('disputes-list')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/** 申诉状态文案映射（对齐后端 trade_disputes.status 枚举） */
const DISPUTE_STATUS_MAP: Record<string, string> = {
  open: '待受理',
  reviewing: '处理中',
  arbitrating: '仲裁中',
  resolved: '已解决',
  rejected: '已驳回'
}

/** 纠纷类型文案映射（对齐后端 trade_disputes.dispute_type 枚举） */
const DISPUTE_TYPE_MAP: Record<string, string> = {
  item_not_received: '未收到物品',
  item_mismatch: '物品不符',
  quality_issue: '质量问题',
  fraud: '欺诈',
  other: '其他'
}

/** 关联订单类型文案映射（对齐后端 trade_disputes.order_type 枚举：redemption/consumption） */
const ORDER_TYPE_MAP: Record<string, string> = {
  redemption: '兑换订单',
  consumption: '消费订单'
}

Page({
  data: {
    disputes: [] as any[],
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
    disputesListLog.info('售后申诉列表页面加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    if (!checkAuth()) {
      disputesListLog.warn('用户未登录，已自动跳转')
      return
    }

    this.loadDisputes()
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  async onPullDownRefresh() {
    disputesListLog.info('下拉刷新售后申诉列表')
    this.setData({ currentPage: 1 })
    await this.loadDisputes()
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.loadMoreDisputes()
    }
  },

  /** 加载售后申诉列表（后端按JWT中的user_id做数据隔离，只返回本人申诉） */
  async loadDisputes() {
    this.setData({ loadStatus: 'loading' })

    try {
      const result = await API.getMyDisputes(this.data.currentPage, this.data.pageSize)

      if (result.success && result.data) {
        const rawDisputes = result.data.rows || []
        const totalCount = result.data.count || 0

        const processedDisputes = rawDisputes.map((dispute: any) =>
          this.processDisputeItem(dispute)
        )

        this.setData({
          disputes: processedDisputes,
          totalCount,
          hasMore: processedDisputes.length < totalCount,
          loadStatus: processedDisputes.length > 0 ? 'success' : 'empty'
        })

        disputesListLog.info('售后申诉列表加载成功:', processedDisputes.length, '条')
      } else {
        this.setData({ disputes: [], loadStatus: 'empty' })
      }
    } catch (error) {
      disputesListLog.error('加载售后申诉列表失败:', error)
      this.setData({ loadStatus: 'error' })
      showToast('加载售后申诉失败')
    }
  },

  /** 加载更多售后申诉（触底分页） */
  async loadMoreDisputes() {
    const nextPage = this.data.currentPage + 1

    try {
      const result = await API.getMyDisputes(nextPage, this.data.pageSize)

      if (result.success && result.data) {
        const moreDisputes = (result.data.rows || []).map((dispute: any) =>
          this.processDisputeItem(dispute)
        )

        this.setData({
          disputes: [...this.data.disputes, ...moreDisputes],
          currentPage: nextPage,
          hasMore: this.data.disputes.length + moreDisputes.length < (result.data.count || 0)
        })
      }
    } catch (error) {
      disputesListLog.error('加载更多售后申诉失败:', error)
      showToast('加载更多失败')
    }
  },

  /**
   * 处理单条申诉数据（后端snake_case → 页面展示格式）
   *
   * @param dispute - 后端返回的原始申诉数据（脱敏后）
   * @returns 处理后的展示数据
   */
  processDisputeItem(dispute: any) {
    const status = dispute.status || 'open'
    const disputeType = dispute.dispute_type || 'other'
    const orderType = dispute.order_type || 'consumption'

    return {
      tradeDisputeId: dispute.trade_dispute_id,
      title: dispute.title || '未知申诉',
      orderType,
      orderTypeText: ORDER_TYPE_MAP[orderType] || '订单',
      disputeType,
      disputeTypeText: DISPUTE_TYPE_MAP[disputeType] || '其他',
      status,
      statusText: DISPUTE_STATUS_MAP[status] || '未知',
      resolution: dispute.resolution || '',
      createdAt: dispute.created_at ? formatDateMessage(dispute.created_at) : '',
      resolvedAt: dispute.resolved_at ? formatDateMessage(dispute.resolved_at) : ''
    }
  },

  /** 跳转申诉详情 */
  onDisputeTap(e: any) {
    const tradeDisputeId = e.currentTarget.dataset.id
    if (!tradeDisputeId) {
      return
    }
    wx.navigateTo({
      url: `/packageUser/disputes/detail?id=${tradeDisputeId}`
    })
  },

  /** 重试加载 */
  retryLoad() {
    this.setData({ currentPage: 1 })
    this.loadDisputes()
  }
})
