/**
 * 📝 创建广告活动页面
 *
 * 广告主自助创建投放计划:
 *   1. 选择广告位（弹窗/轮播图/公告/信息流）
 *   2. 设置计费模式（固定包天/竞价排名/CPM曝光计费）
 *   3. 配置投放参数（天数/出价/预算/日期）
 *   4. 保存草稿 或 直接提交审核（冻结钻石）
 *
 * 后端API:
 *   GET  /api/v4/user/ad-slots                — 获取可用广告位列表
 *   GET  /api/v4/user/ad-pricing/preview      — 定价预览（含DAU系数+阶梯折扣）
 *   POST /api/v4/user/ad-campaigns            — 创建广告活动
 *   PUT  /api/v4/user/ad-campaigns/:id        — 更新广告活动（仅draft状态）
 *   POST /api/v4/user/ad-campaigns/:id/submit — 提交审核（自动冻结钻石）
 *
 * @file packageAd/ad-create/ad-create.ts
 * @version 6.0.0
 * @since 2026-02-19
 */

const { API, Utils, Logger, Wechat } = require('../../utils/index')
const log = Logger.createLogger('ad-create')

/** 计费模式选项（对齐后端 billing_mode 枚举: fixed_daily / bidding / cpm） */
const BILLING_MODES = [
  {
    value: 'fixed_daily',
    label: '固定包天',
    desc: '选定天数，一次性支付钻石购买展示时段'
  },
  {
    value: 'bidding',
    label: '竞价排名',
    desc: '设定日出价和总预算，出价高者优先展示'
  },
  {
    value: 'cpm',
    label: 'CPM曝光计费',
    desc: '按千次曝光计费，适合信息流广告位'
  }
]

Page({
  data: {
    /* ===== 广告位列表（后端获取） ===== */
    adSlots: [] as API.AdSlot[],
    selectedSlotIndex: -1,
    selectedSlot: null as API.AdSlot | null,

    /* ===== 表单数据 ===== */
    campaignName: '',
    billingModes: BILLING_MODES,
    selectedBillingMode: 'fixed_daily',

    /** 固定包天参数 */
    fixedDays: 7,
    /** 总费用（后端定价预览返回的折后总价，API未就绪时显示为0并提示用户） */
    estimatedTotalDiamond: 0,
    /** 后端定价预览详情（含DAU系数、折扣信息，API可用时填充） */
    pricingPreview: null as API.AdPricingPreview | null,
    /** 定价预览加载中 */
    pricingLoading: false,

    /** 竞价参数 */
    dailyBidDiamond: 50,
    budgetTotalDiamond: 500,

    /** 投放日期 */
    startDate: '',
    endDate: '',
    /** 日期选择器起始值（今天） */
    minDate: '',

    /** 展示优先级 */
    priority: 50,

    /* ===== 页面状态 ===== */
    loading: true,
    submitting: false,

    /* ===== 编辑模式（ad-detail页面跳转过来时携带id参数） ===== */
    /** 编辑目标campaignId（0=新建模式，>0=编辑模式） */
    editCampaignId: 0,
    /** 页面标题（新建/编辑） */
    pageTitle: '创建广告活动'
  },

  onLoad(options: Record<string, string | undefined>) {
    const today = this._formatDate(new Date())
    this.setData({ minDate: today, startDate: today })

    const editId = parseInt(options.id || '0', 10)
    if (editId > 0) {
      this.setData({ editCampaignId: editId, pageTitle: '编辑广告活动' })
      wx.setNavigationBarTitle({ title: '编辑广告活动' })
    }

    this.loadAdSlots()
  },

  /** 加载可投放的广告位列表 */
  async loadAdSlots() {
    try {
      const result = await API.getAvailableAdSlots()
      if (!result?.success || !result.data) {
        throw new Error(result?.message || '获取广告位失败')
      }

      /** 后端响应格式: { data: { slots: AdSlot[], total: number } } */
      const slots: API.AdSlot[] = Array.isArray(result.data.slots) ? result.data.slots : []

      this.setData({ adSlots: slots })
      log.info('[ad-create] 广告位加载完成:', slots.length, '个可用')

      if (this.data.editCampaignId > 0) {
        await this._loadCampaignForEdit(slots)
      }

      this.setData({ loading: false })
    } catch (error: any) {
      log.error('[ad-create] 加载广告位失败:', error)
      this.setData({ loading: false })
      wx.showModal({
        title: '加载失败',
        content: '无法获取广告位信息，请稍后重试',
        showCancel: false,
        success: () => wx.navigateBack()
      })
    }
  },

  /** 选择广告位 */
  onSlotSelect(e: WechatMiniprogram.CustomEvent) {
    const slotIndex = e.currentTarget.dataset.index as number
    const selectedSlot = this.data.adSlots[slotIndex]
    if (!selectedSlot) {
      return
    }

    this.setData({
      selectedSlotIndex: slotIndex,
      selectedSlot,
      dailyBidDiamond: selectedSlot.min_bid_diamond || 50,
      budgetTotalDiamond: selectedSlot.min_budget_diamond || 500
    })
    this._recalculateEstimate()
  },

  /** 输入活动名称 */
  onNameInput(e: WechatMiniprogram.Input) {
    this.setData({ campaignName: e.detail.value.trim() })
  },

  /** 切换计费模式 */
  onBillingModeChange(e: WechatMiniprogram.CustomEvent) {
    const mode = e.currentTarget.dataset.mode as string
    this.setData({ selectedBillingMode: mode })
    this._recalculateEstimate()
  },

  /** 修改固定包天天数 */
  onFixedDaysInput(e: WechatMiniprogram.Input) {
    const days = parseInt(e.detail.value, 10)
    if (!isNaN(days) && days > 0) {
      this.setData({ fixedDays: days })
      this._recalculateEstimate()
    }
  },

  /** 修改竞价日出价 */
  onDailyBidInput(e: WechatMiniprogram.Input) {
    const bid = parseInt(e.detail.value, 10)
    if (!isNaN(bid) && bid > 0) {
      this.setData({ dailyBidDiamond: bid })
    }
  },

  /** 修改竞价总预算 */
  onBudgetInput(e: WechatMiniprogram.Input) {
    const budget = parseInt(e.detail.value, 10)
    if (!isNaN(budget) && budget > 0) {
      this.setData({ budgetTotalDiamond: budget })
    }
  },

  /** 选择开始日期 */
  onStartDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ startDate: e.detail.value as string })
  },

  /** 选择结束日期 */
  onEndDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ endDate: e.detail.value as string })
  },

  /**
   * 触发后端定价预览 — 所有价格计算由后端完成
   *
   * 数据流:
   *   用户修改天数/广告位 → 防抖500ms → 调用 GET /user/ad-pricing/preview
   *   → 成功: 显示后端真实定价（含DAU系数、阶梯折扣）
   *   → 失败: 清空费用显示，提示用户"定价服务暂不可用"
   */
  _recalculateEstimate() {
    if (this.data.selectedBillingMode !== 'fixed_daily' || !this.data.selectedSlot) {
      this.setData({ estimatedTotalDiamond: 0, pricingPreview: null })
      return
    }

    this._debouncedFetchPricing()
  },

  /** 防抖调用后端定价预览API（避免每次按键都发请求） */
  _debouncedFetchPricing: Utils.debounce(function (this: any) {
    this._fetchPricingPreview()
  }, 500),

  /**
   * 调用后端广告定价预览API
   * 后端API: GET /api/v4/user/ad-pricing/preview
   * 所有价格由后端计算（含DAU系数、阶梯折扣、最低日价下限），前端仅展示
   */
  async _fetchPricingPreview() {
    const currentSlot = this.data.selectedSlot
    if (!currentSlot || this.data.fixedDays < 1) {
      return
    }

    this.setData({ pricingLoading: true })

    try {
      const result = await API.getAdPricingPreview({
        ad_slot_id: currentSlot.ad_slot_id,
        days: this.data.fixedDays,
        billing_mode: 'fixed_daily'
      })

      if (result?.success && result.data) {
        const preview: API.AdPricingPreview = result.data
        this.setData({
          estimatedTotalDiamond: preview.total_price,
          pricingPreview: preview
        })
        log.info('[ad-create] 定价预览:', preview.total_price, '💎')
      } else {
        throw new Error(result?.message || '定价预览返回数据异常')
      }
    } catch (apiError: any) {
      log.error('[ad-create] 定价预览API不可用:', apiError.statusCode || apiError.message)
      this.setData({
        estimatedTotalDiamond: 0,
        pricingPreview: null
      })
      Wechat.showToast('定价服务暂不可用，请稍后重试', 'none', 2000)
    } finally {
      this.setData({ pricingLoading: false })
    }
  },

  /** 表单校验（按 billing_mode 分支验证对应参数） */
  _validateForm(): string | null {
    if (!this.data.campaignName) {
      return '请输入广告活动名称'
    }
    if (!this.data.selectedSlot) {
      return '请选择广告位'
    }
    if (this.data.selectedBillingMode === 'fixed_daily') {
      if (this.data.fixedDays < 1) {
        return '投放天数至少为1天'
      }
    } else if (this.data.selectedBillingMode === 'bidding') {
      const minBid = this.data.selectedSlot.min_bid_diamond || 50
      if (this.data.dailyBidDiamond < minBid) {
        return `日出价不能低于${minBid}钻石`
      }
      const minBudget = this.data.selectedSlot.min_budget_diamond || 500
      if (this.data.budgetTotalDiamond < minBudget) {
        return `总预算不能低于${minBudget}钻石`
      }
    } else if (this.data.selectedBillingMode === 'cpm') {
      const cpmMinBudget = this.data.selectedSlot.min_budget_diamond || 500
      if (this.data.budgetTotalDiamond < cpmMinBudget) {
        return `CPM模式总预算不能低于${cpmMinBudget}钻石`
      }
    }
    return null
  },

  /** 构建提交数据（按 billing_mode 分支组装不同参数） */
  _buildCampaignData(): API.CreateAdCampaignParams {
    const formData: API.CreateAdCampaignParams = {
      campaign_name: this.data.campaignName,
      ad_slot_id: this.data.selectedSlot!.ad_slot_id,
      billing_mode: this.data.selectedBillingMode,
      priority: this.data.priority
    }

    if (this.data.selectedBillingMode === 'fixed_daily') {
      formData.fixed_days = this.data.fixedDays
    } else if (this.data.selectedBillingMode === 'bidding') {
      formData.daily_bid_diamond = this.data.dailyBidDiamond
      formData.budget_total_diamond = this.data.budgetTotalDiamond
    } else if (this.data.selectedBillingMode === 'cpm') {
      formData.budget_total_diamond = this.data.budgetTotalDiamond
    }

    if (this.data.startDate) {
      formData.start_date = this.data.startDate
    }
    if (this.data.endDate) {
      formData.end_date = this.data.endDate
    }

    return formData
  },

  /** 保存为草稿（新建用create，编辑用update） */
  async onSaveDraft() {
    const validationError = this._validateForm()
    if (validationError) {
      Wechat.showToast(validationError, 'none', 2000)
      return
    }

    this.setData({ submitting: true })

    try {
      const campaignData = this._buildCampaignData()
      let result: any

      if (this.data.editCampaignId > 0) {
        result = await API.updateAdCampaign(this.data.editCampaignId, campaignData)
      } else {
        result = await API.createAdCampaign(campaignData)
      }

      if (result?.success) {
        Wechat.showToast('草稿已保存', 'success', 1500)
        const pages = getCurrentPages()
        const prevPage = pages[pages.length - 2]
        if (prevPage) {
          prevPage._needRefresh = true
        }
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        throw new Error(result?.message || '保存失败')
      }
    } catch (error: any) {
      log.error('[ad-create] 保存草稿失败:', error)
      Wechat.showToast(error.message || '保存失败', 'none', 2000)
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 创建并直接提交审核 */
  async onSubmitForReview() {
    const validationError = this._validateForm()
    if (validationError) {
      Wechat.showToast(validationError, 'none', 2000)
      return
    }

    let costDisplay = ''
    if (this.data.selectedBillingMode === 'fixed_daily') {
      costDisplay =
        this.data.estimatedTotalDiamond > 0
          ? `将冻结 ${this.data.estimatedTotalDiamond} 钻石`
          : `将冻结钻石（具体金额由后端计算）`
    } else if (this.data.selectedBillingMode === 'bidding') {
      costDisplay = `将冻结首日出价 ${this.data.dailyBidDiamond} 钻石`
    } else if (this.data.selectedBillingMode === 'cpm') {
      costDisplay = `将冻结预算 ${this.data.budgetTotalDiamond} 钻石`
    }

    const confirmResult = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认提交审核',
        content: `提交后${costDisplay}，审核通过后开始投放。余额不足将提交失败。`,
        confirmText: '确认提交',
        cancelText: '取消',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmResult) {
      return
    }

    this.setData({ submitting: true })

    try {
      const campaignData = this._buildCampaignData()
      let targetCampaignId: number

      if (this.data.editCampaignId > 0) {
        /* 编辑模式: 先更新草稿再提交审核 */
        const updateResult = await API.updateAdCampaign(this.data.editCampaignId, campaignData)
        if (!updateResult?.success) {
          throw new Error(updateResult?.message || '更新失败')
        }
        targetCampaignId = this.data.editCampaignId
      } else {
        /* 新建模式: 先创建再提交审核 */
        const createResult = await API.createAdCampaign(campaignData)
        if (!createResult?.success || !createResult.data) {
          throw new Error(createResult?.message || '创建失败')
        }
        targetCampaignId = createResult.data.ad_campaign_id
      }

      const submitResult = await API.submitAdCampaign(targetCampaignId)
      if (submitResult?.success) {
        Wechat.showToast('已提交审核', 'success', 1500)
        const pages = getCurrentPages()
        const prevPage = pages[pages.length - 2]
        if (prevPage) {
          prevPage._needRefresh = true
        }
        setTimeout(() => wx.navigateBack(), 1500)
      } else {
        throw new Error(submitResult?.message || '提交审核失败')
      }
    } catch (error: any) {
      log.error('[ad-create] 提交审核失败:', error)
      Wechat.showToast(error.message || '提交失败', 'none', 2000)
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 编辑模式: 从后端加载已有活动数据并回填表单 */
  async _loadCampaignForEdit(adSlots: API.AdSlot[]) {
    try {
      const result = await API.getAdCampaignDetail(this.data.editCampaignId)
      if (!result?.success || !result.data) {
        throw new Error(result?.message || '获取活动详情失败')
      }

      const campaign: API.AdCampaign = result.data.campaign || result.data

      /* 找到对应的广告位索引 */
      let matchedSlotIndex = -1
      let matchedSlot: API.AdSlot | null = null
      for (let i = 0; i < adSlots.length; i++) {
        if (adSlots[i].ad_slot_id === campaign.ad_slot_id) {
          matchedSlotIndex = i
          matchedSlot = adSlots[i]
          break
        }
      }

      this.setData({
        campaignName: campaign.campaign_name || '',
        selectedBillingMode: campaign.billing_mode || 'fixed_daily',
        selectedSlotIndex: matchedSlotIndex,
        selectedSlot: matchedSlot,
        fixedDays: campaign.fixed_days || 7,
        dailyBidDiamond: campaign.daily_bid_diamond || 50,
        budgetTotalDiamond: campaign.budget_total_diamond || 500,
        startDate: campaign.start_date || '',
        endDate: campaign.end_date || '',
        priority: campaign.priority || 50
      })

      this._recalculateEstimate()
      log.info('[ad-create] 编辑数据回填完成:', campaign.campaign_name)
    } catch (error: any) {
      log.error('[ad-create] 加载编辑数据失败:', error)
      Wechat.showToast('加载活动数据失败', 'none', 2000)
    }
  },

  /** 格式化日期为 YYYY-MM-DD */
  _formatDate(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
})
