/**
 * DIY 款式模板选择页（自由定制饰品的第一步）
 *
 * 用户操作流程: 分类Tab（手链/项链/戒指/吊坠）→ 选具体款式 → 带 templateId 进入设计台(diy-lite)
 * 后端API: GET /api/v4/diy/templates（对接文档 3.3-①: 无查询参数，
 *          仅返回 published+启用 模板；前端按返回的 category_id 本地分组筛选）
 *
 * 分类体系（后端 categories 表，parent=190 DIY饰品）:
 *   191 = 手链 / 192 = 项链 / 193 = 戒指 / 194 = 吊坠
 *   291 = 耳饰(DIY_EARRING) / 292 = 手机链包挂(DIY_CHARM) / 293 = 108佛珠(DIY_MALA)
 *   （291~293 为 2026-07-10 seeder 实际落库 ID，对接文档 13.1-F；空分类只显示演示卡，
 *   后端 getUserTemplates 只返回 published 模板，运营录入后自动出现）
 *
 * 模板字段对齐后端:
 *   diy_template_id（主键） / display_name（名称） / category_id（分类）
 *   layout.shape（形状类型） / material_group_codes（材料分组）
 *   preview_media（toSafeJSON 5 字段最小集: media_id/width/height/public_url/thumbnails{w375,w750,w1080}）
 *
 * @file packageDIY/diy-templates/diy-templates.ts
 */

/* 统一工具函数导入 */
const { API } = require('../../utils/index')

/**
 * DIY 二级分类 Tab 列表（对齐后端 categories 表 id=191~194 + 291~293 真实落库 ID）
 * 「全部」Tab 的 category_id 为 0，表示不筛选
 */
const CATEGORY_TABS: { category_id: number; label: string }[] = [
  { category_id: 0, label: '全部' },
  { category_id: 191, label: '手链' },
  { category_id: 192, label: '项链' },
  { category_id: 193, label: '戒指' },
  { category_id: 194, label: '吊坠' },
  { category_id: 291, label: '耳饰' },
  { category_id: 292, label: '手机链' },
  { category_id: 293, label: '108佛珠' }
]

/** category_id → 中文名映射（用于列表展示） */
const CATEGORY_NAME_MAP: Record<number, string> = {
  191: '手链',
  192: '项链',
  193: '戒指',
  194: '吊坠',
  291: '耳饰',
  292: '手机链包挂',
  293: '108佛珠'
}

/**
 * 本地演示入口卡片清单（前端本地数据，不依赖后端；均明确标注演示、保存/下单禁用）
 * local 对应 diy-lite 入口参数（1 手串串珠 / 2~6 镶嵌换宝石 / 7 佛珠串珠）；
 * categories 控制在哪些分类 Tab 下显示（0=全部；耳饰291/手机链292/佛珠293 用真实落库分类 ID）。
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
    categories: [0, 293]
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
    categories: [0, 291]
  },
  {
    local: 6,
    name: '手机链包挂（本地演示）',
    desc: '三珠位镶嵌体验 · 不依赖后端 · 演示价不可下单',
    thumb: '/packageDIY/diy-lite/assets/demo-charm-base.jpg',
    emoji: '',
    tags: ['本地演示', '镶嵌'],
    categories: [0, 292]
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

  /** 后端返回的全量模板缓存（对接文档 3.3-①：一次拉全量，分类切换本地过滤，不重复请求） */
  _allTemplates: [] as any[],

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

  /**
   * 加载模板列表（调用后端真实API）
   * GET /templates 无查询参数（对接文档 3.3-①），返回全量已发布模板；
   * 分类筛选由前端按 category_id 本地完成（_filterTemplates）
   */
  async loadTemplates() {
    this.setData({ loading: true, hasError: false })
    try {
      const res = await API.getDiyTemplates()
      if (!res || !res.data) {
        this.setData({ loading: false, hasError: true, errorMessage: '获取款式列表失败' })
        return
      }
      this._allTemplates = (res.data || []).map((t: any) => ({
        ...t,
        category_name: CATEGORY_NAME_MAP[t.category_id] || ''
      }))
      this._filterTemplates()
      this.setData({ loading: false })
    } catch (_err) {
      this.setData({ loading: false, hasError: true, errorMessage: '网络异常，请稍后重试' })
    }
  },

  /** 按当前分类本地过滤模板列表（activeCategoryId=0 表示全部） */
  _filterTemplates() {
    const id = this.data.activeCategoryId
    const filtered =
      id === 0 ? this._allTemplates : this._allTemplates.filter((t: any) => t.category_id === id)
    this.setData({ templates: filtered })
  },

  /** 切换分类Tab（本地过滤，不重复请求后端） */
  onCategoryChange(e: WechatMiniprogram.TouchEvent) {
    const categoryId = Number(e.currentTarget.dataset.categoryId)
    if (categoryId === this.data.activeCategoryId) {
      return
    }
    this.setData({ activeCategoryId: categoryId }, () => {
      this._refreshDemoCards()
      this._filterTemplates()
    })
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
