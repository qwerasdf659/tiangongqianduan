/**
 * DIY 我的作品列表页
 *
 * 展示当前用户所有 DIY 设计作品（draft/frozen/completed/cancelled）
 * 支持按状态筛选、下拉刷新、点击跳转到结果页继续操作
 *
 * 后端API: GET /api/v4/diy/works
 * 返回: 当前用户所有状态的作品列表（含关联模板数据）
 *
 * 用户操作:
 *   draft 状态 → 跳转设计页继续编辑（workId模式）
 *   frozen 状态 → 跳转结果页完成/取消
 *   completed 状态 → 跳转结果页查看/分享
 *   cancelled 状态 → 仅查看
 *
 * @file packageDIY/diy-works/diy-works.ts
 */

const { API: worksAPI } = require('../../utils/index')
/** 资产代码 → 中文名映射（费用明细展示用，与 diyStore/支付面板同一数据源） */
const { ASSET_DISPLAY_NAME } = require('../../store/diy')

/** 作品状态 → 中文标签映射 */
const STATUS_LABEL_MAP: Record<string, string> = {
  draft: '草稿',
  frozen: '已冻结',
  completed: '已完成',
  cancelled: '已取消'
}

/** 作品状态 → 状态色 CSS 类名映射 */
const STATUS_COLOR_MAP: Record<string, string> = {
  draft: 'status-draft',
  frozen: 'status-frozen',
  completed: 'status-completed',
  cancelled: 'status-cancelled'
}

/** 状态筛选 Tab 列表 */
const STATUS_TABS = [
  { key: 'all', label: '全部' },
  { key: 'draft', label: '草稿' },
  { key: 'frozen', label: '已冻结' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' }
]

/**
 * 每页条数（三端落地方案 F.7-⑦：后端默认 20 条）。
 * 前端显式传 page_size 与后端默认对齐，避免依赖后端隐式默认值。
 */
const PAGE_SIZE = 20

Page({
  data: {
    /** 作品列表（经前端转换后的展示数据，翻页累加） */
    works: [] as any[],
    /** 当前筛选状态（all=全部） */
    currentStatus: 'all',
    /** 状态筛选 Tab 列表 */
    statusTabs: STATUS_TABS,
    /** 首屏加载中 */
    loading: true,
    /** 列表为空 */
    isEmpty: false,
    /** 加载失败 */
    hasError: false,
    /** 错误信息 */
    errorMessage: '',
    /** 是否还有下一页（已加载数 < 总数 count） */
    hasMore: false,
    /** 是否正在加载下一页（触底加载中，防重复请求） */
    loadingMore: false
  },

  /** 当前已加载到的页码（1 起，翻页自增） */
  _page: 1,
  /** 后端返回的符合条件作品总数（用于判断是否到底） */
  _total: 0,

  onLoad() {
    this._loadWorks()
  },

  onShow() {
    /** 从结果页返回时刷新列表（状态可能已变更），回到第一页重新拉 */
    if (!this.data.loading) {
      this._loadWorks()
    }
  },

  onPullDownRefresh() {
    this._loadWorks().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /** 触底加载下一页（scroll-view bindscrolltolower 触发） */
  onReachBottom() {
    this._loadMore()
  },

  /**
   * 加载用户作品列表（首页 / 刷新，重置到第 1 页）
   * 后端API: GET /api/v4/diy/works（三端落地方案 F.7-⑦，响应 data={ rows, count }，默认每页 20）
   * 状态筛选走后端 status 查询参数（服务端筛选，前端不做本地二次过滤）
   */
  async _loadWorks() {
    this._page = 1
    this.setData({ loading: true, hasError: false })
    try {
      const res = await this._fetchPage(1)
      if (res.success && res.data) {
        const rawList: API.DiyWork[] = Array.isArray(res.data.rows) ? res.data.rows : []
        this._total = Number(res.data.count) || rawList.length
        const works = rawList.map((work: API.DiyWork) => this._decorateWork(work))
        this.setData({
          works,
          isEmpty: works.length === 0,
          hasMore: works.length < this._total,
          loading: false
        })
      } else {
        this.setData({
          loading: false,
          hasError: true,
          errorMessage: res.message || '加载失败'
        })
      }
    } catch (_err) {
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: '网络异常，请检查网络后重试'
      })
    }
  },

  /**
   * 加载下一页并追加到列表（触底触发）
   * 到底 / 加载中 / 首屏加载中 / 错误态 均不触发，防重复与竞态
   */
  async _loadMore() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading || this.data.hasError) {
      return
    }
    const nextPage = this._page + 1
    this.setData({ loadingMore: true })
    try {
      const res = await this._fetchPage(nextPage)
      if (res.success && res.data) {
        const rawList: API.DiyWork[] = Array.isArray(res.data.rows) ? res.data.rows : []
        this._page = nextPage
        this._total = Number(res.data.count) || this._total
        const appended = this.data.works.concat(
          rawList.map((work: API.DiyWork) => this._decorateWork(work))
        )
        this.setData({
          works: appended,
          hasMore: appended.length < this._total,
          loadingMore: false
        })
      } else {
        /** 下一页失败不覆盖已展示数据，仅结束加载态（用户可再次触底重试） */
        this.setData({ loadingMore: false })
        wx.showToast({ title: res.message || '加载更多失败', icon: 'none' })
      }
    } catch (_err) {
      this.setData({ loadingMore: false })
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    }
  },

  /**
   * 按页码请求后端（统一拼装分页 + 状态筛选参数）
   * @param page - 页码（1 起）
   */
  _fetchPage(page: number): Promise<API.ApiResponse<API.DiyWorksListResult>> {
    const { currentStatus } = this.data
    const params: { page: number; page_size: number; status?: string } = {
      page,
      page_size: PAGE_SIZE
    }
    /** 「全部」Tab 不传 status；其余 Tab 传后端支持的 status 筛选参数 */
    if (currentStatus !== 'all') {
      params.status = currentStatus
    }
    return worksAPI.getDiyWorks(params)
  },

  /**
   * 作品对象 → 列表展示视图模型（状态标签/费用/珠数等 TS 预计算，WXML 不做映射）
   * @param work - 后端作品对象
   */
  _decorateWork(work: API.DiyWork): any {
    return {
      ...work,
      /** 状态中文标签 */
      _statusLabel: STATUS_LABEL_MAP[work.status] || work.status,
      /** 状态色 CSS 类名 */
      _statusColor: STATUS_COLOR_MAP[work.status] || '',
      /** 模板名称（从关联模板中取） */
      _templateName: work.template?.display_name || work.work_name,
      /** 珠子数量（从 design_data 中提取） */
      _beadCount: this._getBeadCount(work.design_data),
      /** 格式化创建时间（截取日期部分） */
      _createdDate: work.created_at ? work.created_at.substring(0, 10) : '',
      /**
       * 费用明细（对接文档 4.7）: total_cost 为 confirm 后写入的对象，
       * payments = 实冻/实扣明细（[{ asset_code, amount }]）；draft 阶段为空数组。
       */
      _payments: (work.total_cost?.payments || []).map((p: API.DiyTotalCostItem) => ({
        asset_code: p.asset_code,
        amount: p.amount,
        asset_name: ASSET_DISPLAY_NAME[p.asset_code] || p.asset_code
      }))
    }
  },

  /** 从 design_data 中提取珠子数量 */
  _getBeadCount(designData: API.DiyDesignData): number {
    if (!designData) {
      return 0
    }
    if (designData.mode === 'beading' && designData.beads) {
      return designData.beads.length
    }
    if (designData.mode === 'slots' && designData.fillings) {
      return Object.keys(designData.fillings).length
    }
    return 0
  },

  /** 切换状态筛选 Tab（服务端筛选：切换后重新请求，携带 status 查询参数） */
  onStatusTabTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as string
    if (key === this.data.currentStatus) {
      return
    }
    /** 切换筛选后回到第 1 页重新拉（清空累加列表，避免跨状态残留） */
    this.setData({ currentStatus: key, works: [], hasMore: false })
    this._loadWorks()
  },

  /**
   * 点击作品卡片 → 根据状态跳转到不同页面
   * draft: 跳转设计页（workId模式，继续编辑）
   * frozen/completed/cancelled: 跳转结果页（查看/操作）
   */
  onWorkTap(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number
    const work = this.data.works[index]
    if (!work) {
      return
    }
    if (work.status === 'draft') {
      /** 草稿状态: 跳转手串设计台继续编辑（diy-lite 已支持串珠/镶嵌双模式还原） */
      wx.navigateTo({
        url: `/packageDIY/diy-lite/diy-lite?workId=${work.diy_work_id}`
      })
    } else {
      /**
       * 其他状态: 跳转结果页查看/操作。
       * totalPrice = total_cost.payments 实冻明细金额合计（后端权威数据，对接文档 4.7）
       */
      const totalPrice = (work.total_cost?.payments || []).reduce(
        (s: number, c: API.DiyTotalCostItem) => s + c.amount,
        0
      )
      wx.navigateTo({
        url: `/packageDIY/diy-result/diy-result?workId=${work.diy_work_id}&totalPrice=${totalPrice}&templateName=${encodeURIComponent(work._templateName)}&templateId=${work.diy_template_id || 0}&workStatus=${work.status}`
      })
    }
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 我的设计',
      path: '/packageDIY/diy-select/diy-select'
    }
  }
})
