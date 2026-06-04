/**
 * 售后申诉详情页面
 *
 * 业务语义: 用户查看自己某一条售后申诉的完整进度与处理结果（仅本人可见）。
 *
 * 后端API:
 * - GET /api/v4/system/disputes/:id — 售后申诉详情（已脱敏，仅本人）
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   trade_dispute_id / order_type / order_id / dispute_type /
 *   status / title / resolution / created_at / resolved_at
 *   脱敏后不含 assigned_to（处理客服）/ approval_chain_instance_id（仲裁审批链）等内部字段。
 *
 * @file packageUser/disputes/detail.ts
 * @version 5.2.0
 * @since 2026-06-04
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const detailLog = Logger.createLogger('dispute-detail')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat

/** 申诉状态文案 + 配色（对齐后端 trade_disputes.status 枚举） */
const DISPUTE_STATUS_MAP: Record<string, { label: string; color: string; desc: string }> = {
  open: { label: '待受理', color: '#FF9800', desc: '申诉已提交，等待客服受理' },
  reviewing: { label: '处理中', color: '#2196F3', desc: '客服正在核实处理您的申诉' },
  arbitrating: { label: '仲裁中', color: '#7E57C2', desc: '申诉已升级仲裁，等待裁决' },
  resolved: { label: '已解决', color: '#4CAF50', desc: '申诉已处理完成，请查看结果' },
  rejected: { label: '已驳回', color: '#9E9E9E', desc: '申诉未通过，请查看说明' }
}

/** 纠纷类型文案映射（对齐后端 trade_disputes.dispute_type 枚举） */
const DISPUTE_TYPE_MAP: Record<string, string> = {
  item_not_received: '未收到物品',
  item_mismatch: '物品不符',
  quality_issue: '质量问题',
  fraud: '欺诈',
  other: '其他'
}

/** 关联订单类型文案映射（对齐后端 trade_disputes.order_type 枚举） */
const ORDER_TYPE_MAP: Record<string, string> = {
  trade: '交易订单',
  redemption: '兑换订单',
  consumption: '消费订单',
  auction: '拍卖订单'
}

Page({
  data: {
    /** 申诉ID（路由参数） */
    tradeDisputeId: 0,

    /** 申诉详情（后端原始字段，脱敏后） */
    dispute: null as any,

    /** 状态展示派生字段 */
    statusLabel: '',
    statusColor: '',
    statusDesc: '',
    orderTypeText: '',
    disputeTypeText: '',
    createdAtText: '',
    resolvedAtText: '',

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: ''
  },

  onLoad(options: Record<string, string | undefined>) {
    if (!checkAuth()) {
      detailLog.warn('用户未登录，已自动跳转')
      return
    }

    const idText = options.id || ''
    const tradeDisputeId = Number(idText)
    if (!idText || !Number.isInteger(tradeDisputeId) || tradeDisputeId <= 0) {
      detailLog.error('缺少有效的 id 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '申诉信息无效' })
      return
    }

    this.setData({ tradeDisputeId })
    this.loadDetail(tradeDisputeId)
  },

  /** 加载申诉详情 */
  async loadDetail(tradeDisputeId: number) {
    this.setData({ loading: true, hasError: false })

    try {
      const result = await API.getDisputeDetail(tradeDisputeId)

      if (result.success && result.data) {
        const dispute = result.data
        const status = dispute.status || 'open'
        const statusInfo = DISPUTE_STATUS_MAP[status] || {
          label: status,
          color: '#999999',
          desc: ''
        }

        this.setData({
          dispute,
          statusLabel: statusInfo.label,
          statusColor: statusInfo.color,
          statusDesc: statusInfo.desc,
          orderTypeText: ORDER_TYPE_MAP[dispute.order_type] || '订单',
          disputeTypeText: DISPUTE_TYPE_MAP[dispute.dispute_type] || '其他',
          createdAtText: dispute.created_at ? formatDateMessage(dispute.created_at) : '',
          resolvedAtText: dispute.resolved_at ? formatDateMessage(dispute.resolved_at) : '',
          loading: false
        })

        detailLog.info('售后申诉详情加载成功:', status)
      } else {
        this.setData({ loading: false, hasError: true, errorMessage: '未找到申诉记录' })
      }
    } catch (error: any) {
      detailLog.error('加载售后申诉详情失败:', error)
      const message =
        error && error.statusCode === 404
          ? '申诉记录不存在'
          : error && error.statusCode === 403
            ? '无权查看该申诉'
            : '加载失败，请重试'
      this.setData({ loading: false, hasError: true, errorMessage: message })
      showToast(message)
    }
  },

  /** 重试加载 */
  retryLoad() {
    this.loadDetail(this.data.tradeDisputeId)
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({ url: '/packageUser/disputes/disputes' })
      }
    })
  }
})
