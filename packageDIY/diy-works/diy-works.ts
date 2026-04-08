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

Page({
  data: {
    /** 作品列表（经前端转换后的展示数据） */
    works: [] as any[],
    /** 当前筛选状态（all=全部） */
    currentStatus: 'all',
    /** 状态筛选 Tab 列表 */
    statusTabs: STATUS_TABS,
    /** 加载中 */
    loading: true,
    /** 列表为空 */
    isEmpty: false,
    /** 加载失败 */
    hasError: false,
    /** 错误信息 */
    errorMessage: ''
  },

  onLoad() {
    this._loadWorks()
  },

  onShow() {
    /** 从结果页返回时刷新列表（状态可能已变更） */
    if (!this.data.loading) {
      this._loadWorks()
    }
  },

  onPullDownRefresh() {
    this._loadWorks().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载用户作品列表
   * 后端API: GET /api/v4/diy/works
   * 返回所有状态的作品，前端按 currentStatus 本地过滤
   */
  async _loadWorks() {
    this.setData({ loading: true, hasError: false })
    try {
      const res = await worksAPI.getDiyWorks()
      if (res.success && res.data) {
        /** 全量作品列表（后端返回） */
        const allWorks = (res.data as API.DiyWork[]).map((work: API.DiyWork) => ({
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
          _createdDate: work.created_at ? work.created_at.substring(0, 10) : ''
        }))
        /** 缓存全量列表，筛选时从缓存过滤 */
        this._allWorks = allWorks
        this._filterWorks()
        this.setData({ loading: false })
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

  /** 缓存的全量作品列表（不放 data 中，避免大数据序列化） */
  _allWorks: [] as any[],

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

  /** 按当前选中状态过滤作品列表 */
  _filterWorks() {
    const { currentStatus } = this.data
    const filtered =
      currentStatus === 'all'
        ? this._allWorks
        : this._allWorks.filter((w: any) => w.status === currentStatus)
    this.setData({
      works: filtered,
      isEmpty: filtered.length === 0
    })
  },

  /** 切换状态筛选 Tab */
  onStatusTabTap(e: WechatMiniprogram.BaseEvent) {
    const key = e.currentTarget.dataset.key as string
    if (key === this.data.currentStatus) {
      return
    }
    this.setData({ currentStatus: key })
    this._filterWorks()
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
      /** 草稿状态: 跳转设计页继续编辑 */
      wx.navigateTo({
        url: `/packageDIY/diy-design/diy-design?workId=${work.diy_work_id}`
      })
    } else {
      /** 其他状态: 跳转结果页查看/操作 */
      wx.navigateTo({
        url: `/packageDIY/diy-result/diy-result?workId=${work.diy_work_id}&totalPrice=${work.total_cost?.reduce((s: number, c: API.DiyTotalCostItem) => s + c.amount, 0) || 0}&templateName=${encodeURIComponent(work._templateName)}&templateId=${work.diy_template_id || 0}`
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
