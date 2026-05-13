/**
 * 📊 广告活动详情页
 *
 * 展示单个广告活动的完整信息:
 *   - 活动基本信息（名称、状态、计费模式、投放周期）
 *   - 费用信息（已消耗/总预算、日出价）
 *   - 素材列表（图片、标题、审核状态）
 *   - 数据报表（曝光、点击、转化、消耗星石）
 *   - 操作按钮（提交审核/取消/编辑）
 *
 * 后端API:
 *   GET  /api/v4/user/ad-campaigns/:id         — 活动详情
 *   GET  /api/v4/user/ad-campaigns/:id/report   — 数据报表
 *   POST /api/v4/user/ad-campaigns/:id/submit   — 提交审核
 *   POST /api/v4/user/ad-campaigns/:id/cancel   — 取消活动
 *
 * @file packageAd/ad-detail/ad-detail.ts
 * @version 6.0.0
 * @since 2026-02-19
 */

const { API, Logger, Wechat, ImageHelper } = require('../../utils/index')
const log = Logger.createLogger('ad-detail')

/** 计费模式中文映射（对齐后端 billing_mode 枚举，含所有模式） */
const BILLING_MODE_TEXT: Record<string, string> = {
  free: '免费投放',
  fixed_daily: '固定包天',
  bidding: '竞价排名',
  cpm: 'CPM曝光计费'
}

/** 状态标签样式映射 */
const STATUS_STYLE_MAP: Record<
  string,
  { text: string; color: string; bgColor: string; icon: string }
> = {
  draft: { text: '草稿', color: '#9E9E9E', bgColor: '#F5F5F5', icon: '📝' },
  pending_review: { text: '待审核', color: '#FF9800', bgColor: '#FFF3E0', icon: '⏳' },
  approved: { text: '已通过', color: '#2196F3', bgColor: '#E3F2FD', icon: '✅' },
  active: { text: '投放中', color: '#4CAF50', bgColor: '#E8F5E9', icon: '🟢' },
  paused: { text: '已暂停', color: '#FF5722', bgColor: '#FBE9E7', icon: '⏸️' },
  completed: { text: '已完成', color: '#607D8B', bgColor: '#ECEFF1', icon: '🏁' },
  rejected: { text: '已拒绝', color: '#F44336', bgColor: '#FFEBEE', icon: '❌' },
  cancelled: { text: '已取消', color: '#795548', bgColor: '#EFEBE9', icon: '🚫' }
}

Page({
  data: {
    /* ===== 活动详情 ===== */
    campaign: null as (API.AdCampaign & { statusStyle?: any; billingModeText?: string }) | null,
    campaignId: 0,
    loading: true,

    /* ===== 数据报表 ===== */
    report: null as API.AdCampaignReport | null,
    reportLoading: false,

    /* ===== 操作状态 ===== */
    submitting: false,

    /* ===== 竞价排名状态（仅bidding模式，后端有数据时展示） ===== */
    biddingStatus: null as API.AdBiddingStatus | null,

    /* ===== 显示控制 ===== */
    canEdit: false,
    canSubmit: false,
    canCancel: false,
    showReport: false
  },

  onLoad(options: Record<string, string | undefined>) {
    const campaignId = parseInt(options.id || '0', 10)
    if (!campaignId) {
      wx.showModal({
        title: '参数错误',
        content: '广告活动ID无效',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }
    this.setData({ campaignId })
    this.loadDetail()
  },

  async onPullDownRefresh() {
    await this.loadDetail()
    wx.stopPullDownRefresh()
  },

  /** 加载活动详情 */
  async loadDetail() {
    this.setData({ loading: true })

    try {
      const result = await API.getAdCampaignDetail(this.data.campaignId)
      if (!result?.success || !result.data) {
        throw new Error(result?.message || '获取活动详情失败')
      }

      const campaignData: API.AdCampaign = result.data.campaign || result.data
      const statusStyle = STATUS_STYLE_MAP[campaignData.status] || STATUS_STYLE_MAP.draft
      const billingModeText =
        BILLING_MODE_TEXT[campaignData.billing_mode] || campaignData.billing_mode

      const enrichedCampaign = {
        ...campaignData,
        statusStyle,
        billingModeText
      }

      const apiBiddingStatus: API.AdBiddingStatus | null =
        (campaignData as any).bidding_status || null

      this.setData({
        campaign: enrichedCampaign,
        biddingStatus: apiBiddingStatus,
        canEdit: campaignData.status === 'draft',
        canSubmit: campaignData.status === 'draft',
        canCancel: ['draft', 'pending_review', 'active'].indexOf(campaignData.status) !== -1,
        showReport: ['active', 'completed', 'paused'].indexOf(campaignData.status) !== -1
      })

      if (this.data.showReport) {
        this.loadReport()
      }

      log.info('[ad-detail] 详情加载完成:', campaignData.campaign_name, campaignData.status)
    } catch (error: any) {
      log.error('[ad-detail] 加载详情失败:', error)
      Wechat.showToast(error.message || '加载失败', 'none', 2000)
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 加载数据报表 */
  async loadReport() {
    this.setData({ reportLoading: true })

    try {
      const result = await API.getAdCampaignReport(this.data.campaignId)
      if (result?.success && result.data) {
        const reportData: API.AdCampaignReport = result.data.report || result.data
        this.setData({ report: reportData })
      }
    } catch (error: any) {
      log.warn('[ad-detail] 报表加载失败（不影响详情展示）:', error)
    } finally {
      this.setData({ reportLoading: false })
    }
  },

  /** 提交审核 */
  async onSubmitForReview() {
    if (!this.data.campaign) {
      return
    }

    let costDisplay = ''
    if (this.data.campaign.billing_mode === 'fixed_daily') {
      costDisplay = `将冻结 ${this.data.campaign.fixed_total_star_stone || 0} 星石`
    } else if (this.data.campaign.billing_mode === 'bidding') {
      costDisplay = `将冻结首日出价 ${this.data.campaign.daily_bid_star_stone || 0} 星石`
    } else if (this.data.campaign.billing_mode === 'cpm') {
      costDisplay = `将冻结预算 ${this.data.campaign.budget_total_star_stone || 0} 星石`
    }

    const confirmResult = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认提交审核',
        content: `提交后${costDisplay}，审核通过后开始投放。`,
        confirmText: '确认提交',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmResult) {
      return
    }

    this.setData({ submitting: true })

    try {
      const result = await API.submitAdCampaign(this.data.campaignId)
      if (result?.success) {
        Wechat.showToast('已提交审核', 'success', 1500)
        this.loadDetail()
      } else {
        throw new Error(result?.message || '提交失败')
      }
    } catch (error: any) {
      log.error('[ad-detail] 提交审核失败:', error)
      Wechat.showToast(error.message || '操作失败', 'none', 2000)
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 取消活动 */
  async onCancelCampaign() {
    const confirmResult = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认取消',
        content: '取消后冻结的星石将退回账户，此操作不可撤销。',
        confirmText: '确认取消',
        cancelText: '再想想',
        confirmColor: '#F44336',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmResult) {
      return
    }

    this.setData({ submitting: true })

    try {
      const result = await API.cancelAdCampaign(this.data.campaignId)
      if (result?.success) {
        Wechat.showToast('已取消，星石已退回', 'success', 1500)
        this.loadDetail()
      } else {
        throw new Error(result?.message || '取消失败')
      }
    } catch (error: any) {
      log.error('[ad-detail] 取消失败:', error)
      Wechat.showToast(error.message || '操作失败', 'none', 2000)
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 跳转到编辑页（复用创建页，传入campaignId） */
  goToEdit() {
    wx.navigateTo({
      url: `/packageAd/ad-create/ad-create?id=${this.data.campaignId}`,
      fail: (err: any) => {
        log.error('[ad-detail] 跳转编辑页失败:', err)
      }
    })
  },

  /** 广告素材图片加载失败 — 替换为占位图 */
  onCreativeImageError(e: any) {
    const index = e.currentTarget.dataset.index
    if (index !== undefined) {
      this.setData({
        [`campaign.creatives[${index}].primary_media.public_url`]: ImageHelper.DEFAULT_PRODUCT_IMAGE
      })
    }
  }
})
