/**
 * DIY 款式模板选择页
 *
 * 用户操作流程: 分类Tab → 选具体款式 → 进入设计工作台(diy-design)
 * 后端API: GET /api/v4/diy/templates?category_id=xxx
 *
 * 分类体系（后端 categories 表）:
 *   190 = DIY饰品（一级分类）
 *   191 = 手链 / 192 = 项链 / 193 = 戒指 / 194 = 吊坠（二级分类）
 *
 * 模板字段对齐后端:
 *   diy_template_id（主键） / display_name（名称） / category_id（分类）
 *   layout.shape（形状类型） / material_group_codes（材料分组）
 *   preview_media（关联的预览图 MediaFile，含 public_url / thumbnails）
 *
 * @file packageDIY/diy-templates/diy-templates.ts
 */

/* 统一工具函数导入 */
const { API } = require('../../utils/index')

/**
 * DIY 二级分类 Tab 列表（对齐后端 categories 表 id=191~194）
 * 「全部」Tab 的 category_id 为 0，表示不筛选
 */
const CATEGORY_TABS: { category_id: number; label: string }[] = [
  { category_id: 0, label: '全部' },
  { category_id: 191, label: '手链' },
  { category_id: 192, label: '项链' },
  { category_id: 193, label: '戒指' },
  { category_id: 194, label: '吊坠' }
]

/** category_id → 中文名映射（用于列表展示） */
const CATEGORY_NAME_MAP: Record<number, string> = {
  191: '手链', 192: '项链', 193: '戒指', 194: '吊坠'
}

Page({
  data: {
    /** 分类Tab列表 */
    categoryTabs: CATEGORY_TABS,
    /** 当前选中的分类ID（0=全部） */
    activeCategoryId: 0,
    /** 模板列表（后端返回） */
    templates: [] as any[],
    /** 加载状态 */
    loading: true,
    /** 错误状态 */
    hasError: false,
    /** 错误信息 */
    errorMessage: ''
  },

  onLoad() {
    this.loadTemplates()
  },

  /** 加载模板列表（调用后端真实API） */
  async loadTemplates() {
    this.setData({ loading: true, hasError: false })
    try {
      const categoryId = this.data.activeCategoryId || undefined
      const res = await API.getDiyTemplates(categoryId)
      if (!res || !res.data) {
        this.setData({ loading: false, hasError: true, errorMessage: '获取款式列表失败' })
        return
      }
      const list = (res.data || []).map((t: any) => ({
        ...t,
        category_name: CATEGORY_NAME_MAP[t.category_id] || ''
      }))
      this.setData({ templates: list, loading: false })
    } catch (err) {
      this.setData({ loading: false, hasError: true, errorMessage: '网络异常，请稍后重试' })
    }
  },

  /** 切换分类Tab */
  onCategoryChange(e: WechatMiniprogram.TouchEvent) {
    const categoryId = Number(e.currentTarget.dataset.categoryId)
    if (categoryId === this.data.activeCategoryId) return
    this.setData({ activeCategoryId: categoryId })
    this.loadTemplates()
  },

  /** 选择模板 → 进入设计工作台 */
  onSelectTemplate(e: WechatMiniprogram.TouchEvent) {
    const templateId = e.currentTarget.dataset.templateId
    if (!templateId) return
    wx.navigateTo({
      url: `/packageDIY/diy-design/diy-design?templateId=${templateId}`
    })
  },

  /** 重新加载 */
  onRetry() {
    this.loadTemplates()
  }
})
