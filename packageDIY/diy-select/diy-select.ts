/**
 * DIY 款式选择页
 *
 * 用户操作流程: 分类Tab → 选具体款式 → 进入设计页
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

/** category_id → 中文名映射（用于模板卡片展示） */
const CATEGORY_NAME_MAP: Record<number, string> = {
  191: '手链',
  192: '项链',
  193: '戒指',
  194: '吊坠'
}

/** layout.shape → 形状类型标签 */
const SHAPE_LABELS: Record<string, string> = {
  circle: '圆形排列',
  ellipse: '椭圆排列',
  arc: '弧线排列',
  line: '直线排列',
  slots: '镶嵌模式'
}

/** layout.shape → 模式标签（串珠 vs 镶嵌） */
const MODE_LABELS: Record<string, string> = {
  circle: '串珠模式',
  ellipse: '串珠模式',
  arc: '串珠模式',
  line: '串珠模式',
  slots: '镶嵌模式'
}

/**
 * 从模板数据中提取预览图 URL
 * 降级链: preview_media.thumbnails.medium → preview_media.public_url → 默认占位图
 */
function getTemplatePreviewUrl(tpl: API.DiyTemplate): string {
  const media = (tpl as any).preview_media
  if (media) {
    return media.thumbnails?.medium || media.public_url || ''
  }
  return ''
}

Page({
  data: {
    /** 分类 Tab 列表 */
    categoryTabs: CATEGORY_TABS,
    /** 当前选中的分类 category_id（0=全部） */
    activeCategoryId: 0,
    /** 全量模板列表（后端返回，不做前端筛选） */
    allTemplates: [] as any[],
    /** 当前分类下的模板列表（前端按 category_id 过滤） */
    templates: [] as any[],
    /** 加载中 */
    loading: true,
    /** 是否有错误 */
    hasError: false,
    /** 错误信息 */
    errorMessage: ''
  },

  onLoad() {
    this.loadTemplates()
  },

  onPullDownRefresh() {
    this.loadTemplates().then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 加载全部已发布的款式模板
   * 后端 API: GET /api/v4/diy/templates（不传 category_id，一次性加载全部）
   * 前端按分类 Tab 本地过滤（模板总量有限，无需每次请求后端）
   */
  async loadTemplates() {
    this.setData({ loading: true, hasError: false })

    try {
      const res = await API.getDiyTemplates()
      if (res.success && res.data) {
        /* 为每个模板附加前端展示字段 */
        const allTemplates = res.data.map((tpl: API.DiyTemplate) => {
          const shape = tpl.layout?.shape || 'circle'
          return {
            ...tpl,
            _typeLabel: CATEGORY_NAME_MAP[tpl.category_id] || '饰品',
            _shapeLabel: SHAPE_LABELS[shape] || '',
            _modeLabel: MODE_LABELS[shape] || '',
            _previewUrl: getTemplatePreviewUrl(tpl)
          }
        })
        this.setData({ allTemplates, loading: false })
        /* 按当前选中分类过滤 */
        this._filterTemplates()
      } else {
        this.setData({
          loading: false,
          hasError: true,
          errorMessage: res.message || '加载失败，请检查网络连接'
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

  /** 切换分类 Tab */
  onCategoryChange(e: WechatMiniprogram.BaseEvent) {
    const categoryId = Number(e.currentTarget.dataset.categoryId || 0)
    this.setData({ activeCategoryId: categoryId })
    this._filterTemplates()
  },

  /** 按当前选中分类过滤模板列表 */
  _filterTemplates() {
    const { allTemplates, activeCategoryId } = this.data
    if (activeCategoryId === 0) {
      /* 全部分类 */
      this.setData({ templates: allTemplates })
    } else {
      /* 按 category_id 过滤 */
      this.setData({
        templates: allTemplates.filter((t: any) => t.category_id === activeCategoryId)
      })
    }
  },

  /** 点击模板卡片 → 跳转设计页 */
  onSelectTemplate(e: WechatMiniprogram.BaseEvent) {
    const index = e.currentTarget.dataset.index as number
    const template = this.data.templates[index]
    if (!template) {
      return
    }

    /* 使用 diy_template_id 作为路由参数 */
    wx.navigateTo({
      url: `/packageDIY/diy-design/diy-design?templateId=${template.diy_template_id}`
    })
  },

  /** 跳转到我的设计作品列表页 */
  onGoToMyWorks() {
    wx.navigateTo({
      url: '/packageDIY/diy-works/diy-works'
    })
  },

  onShareAppMessage() {
    return {
      title: 'DIY 饰品工坊 - 设计你的专属饰品',
      path: '/packageDIY/diy-select/diy-select'
    }
  }
})
