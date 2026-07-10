/**
 * DIY 款式模板选择页（自由定制饰品的第一步）
 *
 * 用户操作流程: 分类Tab（手链/项链/戒指/吊坠）→ 选具体款式 → 带 templateId 进入设计台(diy-lite)
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
  191: '手链',
  192: '项链',
  193: '戒指',
  194: '吊坠'
}

/**
 * 本地演示入口卡片清单（前端本地数据，不依赖后端；均明确标注演示、保存/下单禁用）
 * local 对应 diy-lite 入口参数（1 手串串珠 / 2~6 镶嵌换宝石 / 7 佛珠串珠）；
 * categories 控制在哪些分类 Tab 下显示（0=全部；耳饰/手机链暂无后端分类仅在「全部」展示）。
 */
const LOCAL_DEMO_CARDS = [
  {
    local: 1,
    name: '手串（本地演示）',
    desc: '前端本地数据 · 不依赖后端 · 演示价不可下单',
    thumb: '',
    emoji: '📦',
    tags: ['本地演示'],
    categories: [0, 191]
  },
  {
    local: 7,
    name: '108佛珠（本地演示）',
    desc: '串珠大围长体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-mala-thumb.jpg',
    emoji: '',
    tags: ['本地演示', '串珠'],
    categories: [0, 191]
  },
  {
    local: 2,
    name: '托帕石项链（本地演示）',
    desc: '镶嵌换宝石体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-necklace-base.jpg',
    emoji: '',
    tags: ['本地演示', '镶嵌'],
    categories: [0, 192]
  },
  {
    local: 3,
    name: '主石戒指（本地演示）',
    desc: '镶嵌换宝石体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-ring-base.jpg',
    emoji: '',
    tags: ['本地演示', '镶嵌'],
    categories: [0, 193]
  },
  {
    local: 4,
    name: '水滴吊坠（本地演示）',
    desc: '镶嵌换宝石体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-pendant-base.jpg',
    emoji: '',
    tags: ['本地演示', '镶嵌'],
    categories: [0, 194]
  },
  {
    local: 5,
    name: '一对耳钉（本地演示）',
    desc: '双槽位镶嵌体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-earrings-base.jpg',
    emoji: '',
    tags: ['本地演示', '镶嵌'],
    categories: [0]
  },
  {
    local: 6,
    name: '手机链包挂（本地演示）',
    desc: '三珠位镶嵌体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-charm-base.jpg',
    emoji: '',
    tags: ['本地演示', '镶嵌'],
    categories: [0]
  }
]

Page({
  data: {
    /** 分类Tab列表 */
    categoryTabs: CATEGORY_TABS,
    /** 当前选中的分类ID（0=全部） */
    activeCategoryId: 0,
    /** 当前分类下可见的本地演示卡片 */
    visibleDemoCards: [] as any[],
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
    this._refreshDemoCards()
    this.loadTemplates()
  },

  /** 按当前分类过滤本地演示卡片 */
  _refreshDemoCards() {
    const id = this.data.activeCategoryId
    this.setData({
      visibleDemoCards: LOCAL_DEMO_CARDS.filter(c => c.categories.indexOf(id) >= 0)
    })
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
    } catch (_err) {
      this.setData({ loading: false, hasError: true, errorMessage: '网络异常，请稍后重试' })
    }
  },

  /** 切换分类Tab */
  onCategoryChange(e: WechatMiniprogram.TouchEvent) {
    const categoryId = Number(e.currentTarget.dataset.categoryId)
    if (categoryId === this.data.activeCategoryId) {
      return
    }
    this.setData({ activeCategoryId: categoryId }, () => this._refreshDemoCards())
    this.loadTemplates()
  },

  /** 选择模板 → 进入手串设计台（diy-lite，按模板 layout.shape 自动切换串珠/镶嵌模式） */
  onSelectTemplate(e: WechatMiniprogram.TouchEvent) {
    const templateId = e.currentTarget.dataset.templateId
    if (!templateId) {
      return
    }
    wx.navigateTo({
      url: `/packageDIY/diy-lite/diy-lite?templateId=${templateId}`
    })
  },

  /**
   * 本地演示款 → diy-lite 本地演示（data-local 区分演示模板，见 LOCAL_DEMO_CARDS）：
   *   1 手串 / 7 佛珠 — 串珠模式；2 项链 / 3 戒指 / 4 吊坠 / 5 耳饰 / 6 手机链 — 镶嵌模式
   * 均走与后端模板相同的渲染链路；保存/下单禁用。
   */
  onSelectLocalDemoEntry(e: WechatMiniprogram.TouchEvent) {
    const local = Number(e.currentTarget.dataset.local) || 1
    wx.navigateTo({
      url: `/packageDIY/diy-lite/diy-lite?local=${local}`
    })
  },

  /** 重新加载 */
  onRetry() {
    this.loadTemplates()
  }
})
