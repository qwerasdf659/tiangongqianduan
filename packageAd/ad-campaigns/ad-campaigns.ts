/**
 * 📢 我的广告活动列表页
 *
 * 展示当前用户创建的所有广告活动，支持按状态筛选
 * 数据来源: GET /api/v4/user/ad-campaigns
 *
 * @file packageAd/ad-campaigns/ad-campaigns.ts
 * @version 5.2.0
 * @since 2026-02-19
 */

const { API, Logger, Wechat } = require('../../utils/index')
const log = Logger.createLogger('ad-campaigns')
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/** 广告状态Tab配置（label+value对照，枚举值对齐后端） */
const STATUS_TABS = [
  { label: '全部', value: '' },
  { label: '草稿', value: 'draft' },
  { label: '待审核', value: 'pending_review' },
  { label: '投放中', value: 'active' },
  { label: '已完成', value: 'completed' },
  { label: '已拒绝', value: 'rejected' },
  { label: '已取消', value: 'cancelled' }
]

/** 状态标签样式映射（对齐后端 ad_campaign_status 字典颜色） */
const STATUS_STYLE_MAP: Record<string, { text: string; color: string; bgColor: string }> = {
  draft: { text: '草稿', color: '#9E9E9E', bgColor: '#F5F5F5' },
  pending_review: { text: '待审核', color: '#FF9800', bgColor: '#FFF3E0' },
  approved: { text: '已通过', color: '#2196F3', bgColor: '#E3F2FD' },
  active: { text: '投放中', color: '#4CAF50', bgColor: '#E8F5E9' },
  paused: { text: '已暂停', color: '#FF5722', bgColor: '#FBE9E7' },
  completed: { text: '已完成', color: '#607D8B', bgColor: '#ECEFF1' },
  rejected: { text: '已拒绝', color: '#F44336', bgColor: '#FFEBEE' },
  cancelled: { text: '已取消', color: '#795548', bgColor: '#EFEBE9' }
}

Page({
  data: {
    /* ===== 列表数据 ===== */
    campaigns: [] as API.AdCampaign[],
    loading: true,
    refreshing: false,
    /** 是否还有更多数据 */
    hasMore: true,
    currentPage: 1,
    pageSize: 20,

    /* ===== 状态筛选 ===== */
    statusTabs: STATUS_TABS,
    currentStatusIndex: 0,
    currentStatus: '',

    /* ===== 空状态 ===== */
    isEmpty: false
  },

  onLoad() {
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })
    this.loadCampaigns(true)
  },

  onShow() {
    if (this._needRefresh) {
      this.loadCampaigns(true)
      this._needRefresh = false
    }
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  async onPullDownRefresh() {
    this.setData({ refreshing: true })
    await this.loadCampaigns(true)
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadCampaigns(false)
    }
  },

  /**
   * 加载广告活动列表
   * @param isRefresh - true=重新加载第一页, false=加载下一页
   */
  async loadCampaigns(isRefresh: boolean) {
    if (this.data.loading && !isRefresh) {
      return
    }

    const targetPage = isRefresh ? 1 : this.data.currentPage + 1

    this.setData({ loading: true })

    try {
      const result = await API.getMyAdCampaigns({
        status: this.data.currentStatus || undefined,
        page: targetPage,
        limit: this.data.pageSize
      })

      if (!result?.success || !result.data) {
        throw new Error(result?.message || '获取广告活动列表失败')
      }

      const newCampaigns = result.data.campaigns || []

      const styledCampaigns = newCampaigns.map((campaign: API.AdCampaign) => ({
        ...campaign,
        statusStyle: STATUS_STYLE_MAP[campaign.status] || STATUS_STYLE_MAP.draft,
        billingModeText: campaign.billing_mode === 'fixed_daily' ? '固定包天' : '竞价排名'
      }))

      const pagination = result.data.pagination
      const hasMoreData = pagination
        ? targetPage < pagination.total_pages
        : newCampaigns.length >= this.data.pageSize

      const mergedCampaigns = isRefresh
        ? styledCampaigns
        : [...this.data.campaigns, ...styledCampaigns]

      this.setData({
        campaigns: mergedCampaigns,
        currentPage: targetPage,
        hasMore: hasMoreData,
        isEmpty: mergedCampaigns.length === 0
      })

      log.info('[ad-campaigns] 加载完成:', mergedCampaigns.length, '条')
    } catch (error: any) {
      log.error('[ad-campaigns] 加载失败:', error)
      Wechat.showToast(error.message || '加载失败', 'none', 2000)
      if (isRefresh) {
        this.setData({ campaigns: [], isEmpty: true })
      }
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 切换状态Tab */
  onStatusTabTap(e: WechatMiniprogram.CustomEvent) {
    const tappedIndex = e.currentTarget.dataset.index as number
    if (tappedIndex === this.data.currentStatusIndex) {
      return
    }
    const selectedTab = STATUS_TABS[tappedIndex]
    this.setData({
      currentStatusIndex: tappedIndex,
      currentStatus: selectedTab.value,
      campaigns: [],
      currentPage: 0,
      hasMore: true,
      isEmpty: false
    })
    this.loadCampaigns(true)
  },

  /** 跳转到创建广告页 */
  goToCreate() {
    wx.navigateTo({
      url: '/packageAd/ad-create/ad-create',
      fail: (err: any) => {
        log.error('[ad-campaigns] 跳转创建页失败:', err)
        Wechat.showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  /** 跳转到广告详情页 */
  goToDetail(e: WechatMiniprogram.CustomEvent) {
    const campaignId = e.currentTarget.dataset.id as number
    if (!campaignId) {
      return
    }
    wx.navigateTo({
      url: `/packageAd/ad-detail/ad-detail?id=${campaignId}`,
      fail: (err: any) => {
        log.error('[ad-campaigns] 跳转详情页失败:', err)
        Wechat.showToast('页面跳转失败', 'none', 2000)
      }
    })
  },

  /** 快捷取消广告活动（列表页直接操作） */
  async onCancelCampaign(e: WechatMiniprogram.CustomEvent) {
    const campaignId = e.currentTarget.dataset.id as number
    if (!campaignId) {
      return
    }

    const confirmResult = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认取消',
        content: '取消后冻结的钻石将退回账户，确认取消此广告活动？',
        confirmText: '确认取消',
        cancelText: '再想想',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmResult) {
      return
    }

    try {
      const result = await API.cancelAdCampaign(campaignId)
      if (result?.success) {
        Wechat.showToast('已取消，钻石已退回', 'success', 2000)
        this.loadCampaigns(true)
      } else {
        throw new Error(result?.message || '取消失败')
      }
    } catch (error: any) {
      log.error('[ad-campaigns] 取消失败:', error)
      Wechat.showToast(error.message || '操作失败', 'none', 2000)
    }
  }
})
