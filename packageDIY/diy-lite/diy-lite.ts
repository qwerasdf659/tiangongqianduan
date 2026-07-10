/**
 * diy-lite 自由定制饰品设计台（生产页）
 *
 * 职责：选珠面板（素材类型Tab + 左侧竖分类 + 右侧网格 + 搜索 + 尺码切换）、珠子详情、
 *       尺码与容量限制（后端 sizing_rules/bead_rules/capacity_rules）、伪3D预览、背景切换、
 *       教程引导、撤销/重做30步历史栈、手串珠子多选批量删除、售罄禁购(stock)、
 *       保存草稿/完成设计 → diy-result 结果页 → 支付（三步状态机 draft→frozen→completed）。
 *       双模式（对齐 diy-design，按模板 layout.shape 自动切换）：
 *         串珠 — bracelet-tray 渲染 + 页面本地状态；
 *         镶嵌(slots) — shape-renderer 渲染（底图+槽位），槽位约束/填充/交换/撤销/缓存由 diyStore 管理。
 *
 * 后端API（与 diy-design 同一套 /api/v4/diy/ 体系）:
 *   GET  /api/v4/diy/templates — 模板列表（未传 templateId 时取第一个串珠模板）
 *   GET  /api/v4/diy/templates/:id — 模板详情（sizing_rules/bead_rules/capacity_rules）
 *   GET  /api/v4/diy/templates/:id/beads — 实物珠子素材（价格/库存/图片均为后端权威数据）
 *   POST /api/v4/diy/works — 保存作品草稿
 *   GET  /api/v4/diy/works/:id — 作品详情（分享还原）
 *
 * 容量模型（对齐 diyStore.maxDiameter 的 PRD 公式）:
 *   容量(mm) = size_option.circumference_mm - bead_rules.margin
 *   （后端未给 circumference_mm 时降级为 bead_count × default_diameter）
 *   珠子直径累加达容量则禁止继续添加。
 *
 * 待后端补充（见 docs/自由定制饰品diy-lite接口需求-给后端.md）:
 *   material_type/meaning/weight/energy/pairing/five_elements — 缺失时对应展示隐藏/空态
 *   异形珠几何元数据 — 缺失前所有珠子统一按圆珠渲染
 *
 * @file packageDIY/diy-lite/diy-lite.ts
 */

/* 统一工具函数导入 */
const { API, Utils } = require('../../utils/index')
const { checkAuth } = Utils
/* 复用 diyStore（镶嵌模式的槽位状态机/约束校验/撤销重做/草稿缓存）+ 费用分组纯函数 + 资产名映射 */
const { diyStore, buildCostBreakdown, ASSET_DISPLAY_NAME } = require('../../store/diy')
/* 本地演示模式数据源（后端不可用/暂无串珠模板时兜底展示，toast 告知切换原因） */
const {
  LITE_BEADS,
  LOCAL_TEMPLATE,
  LOCAL_MALA_TEMPLATE,
  LOCAL_SLOT_TEMPLATES,
  LOCAL_SLOT_GEMS
} = require('./bead-data')

/** 入口参数 local → 本地镶嵌演示模板 key（2 项链 / 3 戒指 / 4 吊坠 / 5 耳饰 / 6 手机链） */
const LOCAL_SLOT_ENTRY_MAP: Record<string, string> = {
  '2': 'necklace',
  '3': 'ring',
  '4': 'pendant',
  '5': 'earrings',
  '6': 'charm'
}

/** 撤销/重做历史栈上限（对齐 diy-design/diyStore 的 30 步，UI 常量前端自主决定） */
const HISTORY_LIMIT = 30

/** 素材类型 Tab（对齐 diy-design 的 饰品/配饰/吊坠；配饰与吊坠素材待后端提供，显示空态） */
const MATERIAL_TYPE_TABS = [
  { key: 'beads', label: '饰品' },
  { key: 'accessories', label: '配饰' },
  { key: 'pendants', label: '吊坠' }
]

/** 背景选项（纯 UI 常量，前端自主决定） */
const BG_OPTIONS = ['#F4F2EC', '#EAF0F0', '#F6EAF0', '#EEECF6']

/** 颜色分组 → 中文名映射（UI常量，与 diy-design 保持一致） */
const GROUP_NAME_MAP: Record<string, string> = {
  red: '红色系',
  orange: '橙色系',
  yellow: '黄色系',
  green: '绿色系',
  blue: '蓝色系',
  purple: '紫色系'
}

/** 本地草稿 key 前缀（按模板隔离，与 diyStore 的 DIY_DRAFT_ 前缀区分避免结构冲突） */
const DRAFT_KEY_PREFIX = 'DIY_LITE_DRAFT_'
/** 本地草稿有效期: 7天（对齐 diyStore CACHE_TTL） */
const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000

/**
 * 把珠子按"名称"聚合成款式组（每组含多个尺寸的 SKU），用于网格卡尺码 +/- 切换。
 * @param beads 页面视图模型珠子数组
 * @returns 款式组数组，每组: { name/category/... + skus[](按直径升序) + sizeIndex(默认0) }
 */
function buildBeadGroups(beads: any[]): any[] {
  const map: Record<string, any> = {}
  const order: string[] = []
  beads.forEach(bead => {
    if (!map[bead.name]) {
      map[bead.name] = {
        name: bead.name,
        category: bead.category,
        categoryLabel: bead.categoryLabel,
        skus: []
      }
      order.push(bead.name)
    }
    map[bead.name].skus.push(bead)
  })
  return order.map(name => {
    const group = map[name]
    group.skus.sort((a: any, b: any) => a.diameter - b.diameter)
    group.sizeIndex = 0
    return group
  })
}

Page({
  data: {
    /** 是否加载中（模板+珠子数据） */
    loading: true,
    /**
     * 本地演示模式：后端不可用/暂无串珠模板时自动启用，用本地归档数据展示。
     * 兜底切换时 toast 告知原因，重新进入页面即重试后端；
     * 本地模式下保存/下单禁用（不伪造业务提交）。
     */
    localMode: false,
    /** 登录弹窗（保存/提交前鉴权，对齐 diy-design checkAuth） */
    loginPopupVisible: false,

    /* 模板信息 */
    templateId: 0,
    templateName: '',
    /**
     * 是否镶嵌模式（模板 layout.shape === 'slots'）：
     * 舞台切换为 shape-renderer（底图+槽位），状态由 diyStore 管理（填槽/约束/撤销/缓存）；
     * 串珠模式仍走 bracelet-tray + 页面本地状态。
     */
    isSlotMode: false,
    /* 镶嵌模式状态（同步自 diyStore） */
    filledSlotCount: 0,
    totalSlotCount: 0,
    activeSlotLabel: '',
    /* shape-renderer 画布尺寸（CSS px，镶嵌模式用） */
    canvasWidth: 300,
    canvasHeight: 300,

    /** 素材类型 Tab（饰品/配饰/吊坠，对齐 diy-design） */
    materialTypeTabs: MATERIAL_TYPE_TABS,
    /** 当前素材类型（beads 有后端素材；accessories/pendants 待后端提供，显示空态） */
    activeMaterialType: 'beads',
    /** 分类清单（左侧竖分类，从后端珠子的 group_code 聚合而来） */
    categories: [] as { key: string; label: string }[],
    /** 当前选中分类键（group_code） */
    activeCategory: '',
    /** 搜索关键词 */
    keyword: '',
    /** 当前展示的款式组（按分类+搜索过滤，含尺码切换） */
    groups: [] as any[],
    /** 网格空态文案（TS 预计算，避免 WXML 内跨行三元表达式） */
    gridEmptyText: '没有匹配的珠子',
    /** 是否显示素材提示条（"长按珠子可查看详情"，可关闭，对齐旧版工作台） */
    showMaterialTip: true,

    /** 已选珠子（传给 bracelet-tray 渲染） */
    selectedBeads: [] as any[],
    /** 费用文本（按 price_asset_code 分组，如 "320 星石" 或 "320 星石 + 20 红源晶"） */
    costText: '0',
    /** 已选颗数 */
    beadCount: 0,
    /** 当前串长（mm，四舍五入展示） */
    lengthText: '0',
    /** 容量占用百分比（0-100，用于进度条） */
    capacityPercent: 0,
    /** 是否存在容量上限（后端规则齐备时 true；缺失时不限容，对齐 diyStore maxDiameter=0 语义） */
    capacityLimited: false,
    /** 容量上限（mm，后端 sizing_rules/bead_rules 计算而来） */
    capacityMm: 0,
    /** 传给 bracelet-tray 的绳圈周长（无容量上限时用渲染兜底值，纯 UI） */
    trayCapacityMm: 150,
    /** 容量提示文案 */
    capacityTip: '',
    /** 实时数量引导文案（结合后端 min_beads 与剩余容量） */
    fillHint: '从下方挑一颗珠子开始吧',
    /** 是否已满（满则禁止添加） */
    isFull: false,
    /** 是否快满（≥85%，容量条警示色） */
    nearFull: false,
    /** 每个珠子 id(material_code) 的已选数量（网格角标用） */
    usedCountMap: {} as Record<string, number>,

    /** 撤销/重做可用态（30 步历史栈，对齐 diy-design） */
    canUndo: false,
    canRedo: false,
    /** 手串上已多选的珠子数（>0 时显示批量删除栏，对齐 diy-design 多选删除） */
    selectedCount: 0,
    /** 是否可提交（珠子数 ≥ capacity_rules.min_beads，对齐 diyStore.canSubmit） */
    canSubmit: false,

    /** 伪3D预览开关 */
    preview3d: false,
    /** 散珠态开关（true 散开自由物理，false 收拢成串） */
    scattered: false,
    /** 画布背景色 */
    bgColor: BG_OPTIONS[0],
    bgOptions: BG_OPTIONS,

    /** 珠子详情弹窗 */
    detailVisible: false,
    detailBead: null as any,

    /** 尺码选择弹窗（后端 sizing_rules.size_options） */
    sizeVisible: false,
    /** 尺码选项列表（label/display，来自后端） */
    sizeOptions: [] as { label: string; display: string }[],
    /** 当前尺码下标 */
    sizeIndex: 0,
    /** 当前尺码展示文案（如 "小号 (约15cm)"） */
    selectedSizeDisplay: '',

    /** 五行雷达图弹窗（数据依赖后端 five_elements，缺失显示空态） */
    wuxingVisible: false,
    /** 五行数据是否就绪（已选珠子中存在 five_elements 字段才为 true） */
    wuxingHasData: false,
    /** 五行统计结果文本（各元素占比，供无障碍/降级展示） */
    wuxingSummary: '',

    /** 教程引导弹窗 */
    guideVisible: false,
    /** 使用指南当前 Tab 下标（0玩法/1量手围/2珠子尺寸/3天然瑕疵） */
    guideTabIndex: 0,
    /** 使用指南四 Tab 定义（纯 UI 文案，前端自主决定；不含任何后端业务数据） */
    guideTabs: [
      {
        key: 'howto',
        title: '怎么玩',
        items: [
          '1. 先点顶部尺码，选择适合的手围尺码',
          '2. 下方选分类、用 +/- 切尺寸，点珠子加入手串',
          '3. 手串上拖动珠子可换位，拖出圈外可删除；轻点可多选批量删',
          '4. 空白处拖动可旋转手串，松手有惯性；点 3D 看立体预览',
          '5. 满意后拍照保存，或点「完成设计」进入结算'
        ]
      },
      {
        key: 'measure',
        title: '量手围',
        items: [
          '用软尺贴合手腕最细处绕一圈，读取周长即手围',
          '没有软尺可用细绳绕一圈，再用直尺量绳长',
          '手围决定该选哪个尺码，量准更贴合',
          '偏好宽松可选大一号，偏好贴合按实测值选'
        ]
      },
      {
        key: 'size',
        title: '珠子尺寸',
        items: [
          '珠子直径以毫米(mm)标注，如 8mm、10mm、12mm',
          '同款珠子可用卡片上的 +/- 切换不同尺寸',
          '大珠更显眼、小珠更秀气，可混搭出层次',
          '每个尺码可容纳的珠子数量不同，以页面提示为准'
        ]
      },
      {
        key: 'natural',
        title: '天然瑕疵',
        items: [
          '天然水晶含棉絮、冰裂、色带属正常现象，非质量问题',
          '每颗天然珠子纹理独一无二，实物与展示图会有差异',
          '通透度、颜色深浅因产地批次略有不同',
          '介意瑕疵者建议选净体或刻面款'
        ]
      }
    ]
  },

  /** 当前模板（后端 diy_templates 完整数据） */
  _template: null as any,
  /** 全量珠子视图模型（后端 beads 映射而来） */
  _allBeads: [] as any[],
  /** 当前尺码标识（如 "S"/"M"/"L"，对应 sizing_rules.size_options[].label） */
  _selectedSizeLabel: '',
  /** 当前费用明细（按 price_asset_code 分组，提交时传给结果页支付面板） */
  _costBreakdown: [] as any[],
  /** 当前作品ID（保存草稿/提交后获得，用于分享还原） */
  _currentWorkId: 0,
  /** 撤销/重做历史栈（每项为一份已选珠子快照；上限 HISTORY_LIMIT） */
  _history: [[]] as any[][],
  /** 历史栈当前位置 */
  _histIndex: 0,
  /** onLoad 入参缓存（加载失败重试用） */
  _entryOptions: {} as Record<string, string | undefined>,

  /** 镶嵌模式：槽位交换的源槽位ID（选「与其他槽位交换」后等待点击目标槽位） */
  _swapSourceSlotId: '',

  onLoad(options: Record<string, string | undefined>) {
    this._entryOptions = options || {}
    /* shape-renderer 画布尺寸：屏宽90%、高宽比1.0（竖幅底图尽量占满加高后的舞台） */
    const sysInfo = wx.getWindowInfo()
    const canvasWidth = Math.floor(sysInfo.windowWidth * 0.9)
    this.setData({ canvasWidth, canvasHeight: canvasWidth })
    /** 开启分享菜单（右上角 ... 可转发给好友） */
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] })
    }
    /** 首次进入自动弹教程（storage 标记，仅第一次；再次进入不打扰） */
    try {
      if (!wx.getStorageSync('diy_lite_guide_shown')) {
        this.setData({ guideVisible: true })
        wx.setStorageSync('diy_lite_guide_shown', 1)
      }
    } catch (_e) {
      /* storage 不可用时忽略，不影响主流程 */
    }
    this._startInit()
  },

  /** 页面隐藏/卸载时保存本地草稿（串珠：页面本地草稿；镶嵌：diyStore.saveToCache） */
  onHide() {
    if (this.data.isSlotMode) {
      diyStore.saveToCache()
      return
    }
    this._saveDraft()
  },
  onUnload() {
    if (this.data.isSlotMode) {
      diyStore.saveToCache()
      return
    }
    this._saveDraft()
  },

  /**
   * 初始化入口（onLoad 触发；后端不可用时兜底进本地演示，重新进入页面即重试后端）:
   *   local=1 — 款式选择页的「手串（本地演示）」入口，直接进本地演示模式
   *   local=2~6 — 款式选择页的镶嵌本地演示入口（2 项链 / 3 戒指 / 4 吊坠 / 5 耳饰 / 6 手机链）
   *   local=7 — 款式选择页的「108佛珠（本地演示）」入口（串珠模式大围长档位）
   *   workId — 从分享链接进入，先加载作品再还原设计
   *   templateId — 指定模板进入
   *   均未传 — 取模板列表第一个串珠模板（旧分享链接/后端不可用兜底通道）
   */
  _startInit() {
    const options = this._entryOptions
    const workId = Number(options.workId || 0)
    const templateId = Number(options.templateId || 0)
    this.setData({ loading: true, localMode: false })
    if (options.local === '1') {
      /** 显式本地演示入口：不请求后端，无需失败提示 */
      this._enterLocalMode('')
      return
    }
    if (options.local === '7') {
      /** 显式本地佛珠演示入口：串珠链路 + 108 颗大围长尺码口径 */
      this._enterLocalMode('', LOCAL_MALA_TEMPLATE)
      return
    }
    if (options.local && LOCAL_SLOT_ENTRY_MAP[options.local]) {
      /** 显式本地镶嵌演示入口：底图+槽位换宝石完整体验，不请求后端 */
      this._enterLocalSlotMode(LOCAL_SLOT_ENTRY_MAP[options.local])
      return
    }
    if (workId) {
      this._currentWorkId = workId
      this._initFromWork(workId)
    } else {
      this._initDesign(templateId)
    }
  },

  /**
   * 初始化设计流程:
   * 1. 定模板（未传 templateId 则取列表第一个串珠模板）→ 2. 加载珠子 → 3. 尺码/容量 → 4. 恢复草稿
   */
  async _initDesign(templateId: number) {
    try {
      let template: any = null
      if (templateId) {
        const tplRes = await API.getDiyTemplateById(templateId)
        if (!tplRes.success || !tplRes.data) {
          this._enterLocalMode(tplRes.message || '模板加载失败')
          return
        }
        template = tplRes.data
      } else {
        const listRes = await API.getDiyTemplates()
        if (!listRes.success || !listRes.data || listRes.data.length === 0) {
          this._enterLocalMode('后端暂无可用模板')
          return
        }
        /** 串珠/镶嵌均支持；未指定模板时优先串珠模板（设计台主打玩法），无串珠则取第一个 */
        template = listRes.data.find((t: any) => t.layout?.shape !== 'slots') || listRes.data[0]
      }
      this._template = template
      this.setData({
        templateId: template.diy_template_id,
        templateName: template.display_name,
        isSlotMode: template.layout?.shape === 'slots'
      })

      const ok = await this._loadBeads(template.diy_template_id)
      if (!ok) {
        return
      }
      if (this.data.isSlotMode) {
        /** 镶嵌模式：状态交给 diyStore（槽位约束/撤销/缓存），恢复缓存后同步渲染 */
        this._enterSlotMode(template)
        if (diyStore.restoreFromCache()) {
          wx.showToast({ title: '已恢复上次未完成的设计', icon: 'none', duration: 2000 })
        }
        this._syncSlotState()
        this.setData({ loading: false })
        setTimeout(() => this._renderSlots(), 100)
      } else {
        this._setupSizing()
        this._restoreDraft()
        this.setData({ loading: false })
      }
    } catch (_err) {
      this._enterLocalMode('网络异常')
    }
  },

  /**
   * 从分享链接还原设计（workId 模式，对齐 diy-design 的 _initFromWork）
   * 后端API: GET /api/v4/diy/works/:id（返回含完整 template 与 design_data）
   */
  async _initFromWork(workId: number) {
    try {
      const workRes = await API.getDiyWorkById(workId)
      if (!workRes.success || !workRes.data) {
        this._enterLocalMode(workRes.message || '分享的作品加载失败')
        return
      }
      const work = workRes.data
      const template = work.template
      if (!template) {
        this._enterLocalMode('作品关联的模板数据缺失')
        return
      }
      this._template = template
      this.setData({
        templateId: template.diy_template_id,
        templateName: template.display_name,
        isSlotMode: template.layout?.shape === 'slots'
      })

      const ok = await this._loadBeads(template.diy_template_id)
      if (!ok) {
        return
      }

      const designData = work.design_data
      if (this.data.isSlotMode) {
        /** 镶嵌作品：进入槽位模式并按 design_data.fillings 逐槽还原（material_code 匹配素材库） */
        this._enterSlotMode(template)
        if (designData && designData.mode === 'slots' && designData.fillings) {
          for (const [slotId, filling] of Object.entries(designData.fillings)) {
            const matched = this._allBeads.find(
              (b: any) => b.material_code === (filling as any).material_code
            )
            if (matched) {
              diyStore.fillSlot(matched.raw, slotId)
            }
          }
        }
        this._syncSlotState()
        this.setData({ loading: false })
        wx.showToast({ title: '已加载分享的设计', icon: 'none', duration: 2000 })
        setTimeout(() => this._renderSlots(), 100)
        return
      }

      /** 串珠作品：从 design_data 还原珠子（material_code 匹配当前素材库） */
      const restored: any[] = []
      if (designData && designData.mode === 'beading' && designData.beads) {
        if (designData.selected_size) {
          this._selectedSizeLabel = designData.selected_size
        }
        for (const beadRef of designData.beads) {
          const matched = this._allBeads.find((b: any) => b.material_code === beadRef.material_code)
          if (matched) {
            restored.push({ ...matched })
          }
        }
      }
      this._setupSizing()
      this._applyRestoredBeads(restored)
      this.setData({ loading: false })
      wx.showToast({ title: '已加载分享的设计', icon: 'none', duration: 2000 })
    } catch (_err) {
      this._enterLocalMode('分享的作品加载失败')
    }
  },

  /**
   * 加载珠子素材并构建视图模型/分类
   * 后端API: GET /api/v4/diy/templates/:id/beads
   * @returns 是否加载成功（失败时已展示错误态）
   */
  async _loadBeads(templateId: number): Promise<boolean> {
    try {
      const beadsRes = await API.getDiyTemplateBeads(templateId)
      if (!beadsRes.success || !beadsRes.data) {
        this._enterLocalMode(beadsRes.message || '珠子素材加载失败')
        return false
      }
      /** 过滤未启用素材后映射为视图模型 */
      this._allBeads = beadsRes.data
        .filter((b: any) => b.is_enabled !== 0)
        .map((b: any) => this._mapBead(b))
      if (this._allBeads.length === 0) {
        this._enterLocalMode('该款式暂无可用珠子素材')
        return false
      }
      this._applyBeadsToPanel()
      return true
    } catch (_err) {
      this._enterLocalMode('珠子素材加载失败')
      return false
    }
  },

  /** 把 _allBeads 聚合出左侧分类并刷新网格（后端/本地两种数据源共用） */
  _applyBeadsToPanel() {
    const seen: Record<string, boolean> = {}
    const categories: { key: string; label: string }[] = []
    this._allBeads.forEach((b: any) => {
      if (!seen[b.category]) {
        seen[b.category] = true
        categories.push({ key: b.category, label: b.categoryLabel })
      }
    })
    this.setData(
      { categories, activeCategory: categories[0]?.key || '', activeMaterialType: 'beads' },
      () => this._refreshGroups()
    )
  },

  /**
   * 进入本地演示模式：显式入口（款式页本地演示卡片 local=1/7）或后端不可用时兜底。
   * 兜底场景 toast 告知切换原因，重新进入页面即重试后端；
   * 本地模式下保存/下单被拦截（见 onSaveDraft/onSubmit），绝不伪造业务提交。
   * @param reason 切换原因（兜底场景 toast 告知用户；显式入口传空串不提示）
   * @param template 串珠形态的本地模板（默认手串 LOCAL_TEMPLATE；佛珠演示传 LOCAL_MALA_TEMPLATE）
   */
  _enterLocalMode(reason: string, template: any = LOCAL_TEMPLATE) {
    this._template = template
    this._allBeads = LITE_BEADS.map((b: any) => this._mapLocalBead(b))
    this._selectedSizeLabel = ''
    this.setData({
      localMode: true,
      /** 本地串珠模板强制退出镶嵌模式（镶嵌演示走 _enterLocalSlotMode 独立通道） */
      isSlotMode: false,
      templateId: template.diy_template_id,
      templateName: template.display_name
    })
    this._applyBeadsToPanel()
    this._setupSizing()
    this._restoreDraft()
    this.setData({ loading: false })
    if (reason) {
      wx.showToast({ title: `${reason}，已切换本地演示数据`, icon: 'none', duration: 2500 })
    }
  },

  /**
   * 进入本地镶嵌演示模式（diy-lite?local=2/3/4，款式页项链/戒指/吊坠本地演示入口）：
   * 用 LOCAL_SLOT_TEMPLATES[key]（空托底图 + 1 个主石槽位）+ LOCAL_SLOT_GEMS（3 颗宝石图，共用）
   * 走与后端镶嵌模板完全相同的渲染/交互链路（diyStore 槽位状态机 + shape-renderer 贴图），
   * 仅数据来源为本地。保存/下单仍被 localMode 拦截，不伪造业务提交。
   * @param key 演示模板键（necklace 项链 / ring 戒指 / pendant 吊坠）
   */
  _enterLocalSlotMode(key: string) {
    const template = LOCAL_SLOT_TEMPLATES[key] || LOCAL_SLOT_TEMPLATES.necklace
    this._template = template
    /** 宝石结构对齐后端 DiyBead，直接复用生产映射 _mapBead（image_media → image 等） */
    this._allBeads = LOCAL_SLOT_GEMS.map((b: any) => this._mapBead(b))
    this.setData({
      localMode: true,
      isSlotMode: true,
      templateId: template.diy_template_id,
      templateName: template.display_name
    })
    this._applyBeadsToPanel()
    this._enterSlotMode(template)
    if (diyStore.restoreFromCache()) {
      /** 缓存快照不含 image_media，按 material_code 换回全量素材对象保证真图渲染 */
      for (const [slotId, bead] of Object.entries(diyStore.slotFillings)) {
        const matched = this._allBeads.find(
          (x: any) => x.material_code === (bead as any).material_code
        )
        if (matched) {
          diyStore.fillSlot(matched.raw, slotId)
        }
      }
      wx.showToast({ title: '已恢复上次未完成的设计', icon: 'none', duration: 2000 })
    }
    this._syncSlotState()
    this.setData({ loading: false })
    setTimeout(() => this._renderSlots(), 100)
  },

  /**
   * 本地珠子 → 页面视图模型（字段与 _mapBead 输出对齐，本地数据已是展示形态）
   * 本地演示价为"元"计价（后端真实数据为资产计价 price_asset_code）。
   */
  _mapLocalBead(b: any): any {
    return {
      ...b,
      /** 本地无后端主键，material_code 用本地 id（草稿/还原按此匹配） */
      diy_material_id: 0,
      material_code: b.id,
      group_code: b.category,
      price_asset_code: '',
      priceLabel: '元'
    }
  },

  // ===== 镶嵌模式（slots，状态由 diyStore 管理，渲染复用 shape-renderer） =====

  /**
   * 进入镶嵌模式：模板与全量珠子写入 diyStore（槽位约束/填充/撤销/缓存全由 store 负责），
   * 页面仅做事件转发与状态同步。
   */
  _enterSlotMode(template: any) {
    diyStore.setTemplate(template)
    diyStore.setAllBeads(this._allBeads.map((b: any) => b.raw))
    this._swapSourceSlotId = ''
  },

  /** 同步 diyStore 槽位状态 → 页面 data（填充数/激活槽位/费用/可提交/撤销重做） */
  _syncSlotState() {
    const template = diyStore.currentTemplate
    const slotDefs = (template?.layout as any)?.slot_definitions || []
    const activeSlot = slotDefs.find((s: any) => s.slot_id === diyStore.activeSlotId)
    const fillingBeads = Object.values(diyStore.slotFillings)
    const breakdown = buildCostBreakdown(fillingBeads as any[])
    this._costBreakdown = breakdown
    const filled = diyStore.filledSlotCount
    const total = diyStore.totalSlotCount
    this.setData({
      filledSlotCount: filled,
      totalSlotCount: total,
      activeSlotLabel: activeSlot ? activeSlot.label || activeSlot.slot_id : '',
      costText:
        breakdown.length === 0
          ? '0'
          : breakdown.map((i: any) => `${i.amount} ${i.asset_name}`).join(' + '),
      beadCount: filled,
      canUndo: diyStore.canUndo,
      canRedo: diyStore.canRedo,
      canSubmit: diyStore.canSubmit,
      fillHint:
        filled >= total
          ? '✓ 全部槽位已镶好，可以完成了'
          : `已镶 ${filled}/${total} 个槽位，点击空槽位或直接选宝石`
    })
    this._refreshGroups()
  },

  /** 触发 shape-renderer 重绘（镶嵌模式舞台） */
  _renderSlots() {
    const renderer = this.selectComponent('#shapeRenderer') as any
    if (renderer) {
      renderer.render()
    }
  },

  /**
   * shape-renderer 槽位点击：
   *   已填槽位 → 操作菜单（清空/替换/与其他槽位交换，对齐 diy-design.onSlotTap）
   *   空槽位 → 交换模式则执行交换，否则激活该槽位等待填入
   */
  onSlotTap(e: any) {
    const slotId = e.detail.slotId as string
    if (diyStore.slotFillings[slotId]) {
      wx.showActionSheet({
        itemList: ['清空此槽位', '选择其他宝石替换', '与其他槽位交换'],
        success: res => {
          if (res.tapIndex === 0) {
            diyStore.clearSlot(slotId)
            this._syncSlotState()
            this._renderSlots()
            diyStore.saveToCache()
          } else if (res.tapIndex === 1) {
            diyStore.setActiveSlot(slotId)
            this._syncSlotState()
            this._renderSlots()
          } else if (res.tapIndex === 2) {
            this._swapSourceSlotId = slotId
            wx.showToast({ title: '请点击要交换的槽位', icon: 'none', duration: 2000 })
          }
        }
      })
      return
    }
    /** 空槽位：交换模式优先 */
    if (this._swapSourceSlotId) {
      diyStore.swapSlots(this._swapSourceSlotId, slotId)
      this._swapSourceSlotId = ''
      this._syncSlotState()
      this._renderSlots()
      diyStore.saveToCache()
      return
    }
    diyStore.setActiveSlot(slotId)
    this._syncSlotState()
    this._renderSlots()
  },

  /**
   * 镶嵌模式加宝石：交给 diyStore.fillSlot（三重约束校验 diameter/shape/group_code），
   * 不匹配当前槽位约束时明确提示；成功后播放素材卡→舞台的飞入动画。
   * @param sku 珠子视图模型
   * @param tapEvent 点击事件（取起点坐标，详情弹窗加入时无坐标用兜底起点）
   * @returns 是否填入成功
   */
  _trySlotFill(sku: any, tapEvent?: any): boolean {
    if (sku.stock === 0) {
      wx.showToast({ title: '该宝石已售罄', icon: 'none' })
      return false
    }
    const ok = diyStore.fillSlot(sku.raw)
    if (!ok) {
      wx.showToast({ title: '该宝石不匹配当前槽位约束', icon: 'none' })
      return false
    }
    this._launchSlotFly(sku, tapEvent)
    this._syncSlotState()
    this._renderSlots()
    diyStore.saveToCache()
    wx.vibrateShort({ type: 'light' })
    return true
  },

  /**
   * 镶嵌填槽飞入动画：素材图从点击位置飞向槽位舞台中心（复用 sub/fly-animation 组件）。
   * 纯装饰动画，失败/组件缺失不影响填槽结果。
   */
  _launchSlotFly(sku: any, tapEvent?: any) {
    const flyAnim = this.selectComponent('#flyAnim') as any
    if (!flyAnim) {
      return
    }
    const win = wx.getWindowInfo()
    /** 起点：点击坐标；详情弹窗加入无坐标时从屏幕下方中央起飞 */
    const startX = tapEvent?.detail?.x ?? win.windowWidth / 2
    const startY = tapEvent?.detail?.y ?? win.windowHeight - 200
    this.createSelectorQuery()
      .select('.slot-stage')
      .boundingClientRect((rect: any) => {
        const endX = rect ? rect.left + rect.width / 2 : win.windowWidth / 2
        const endY = rect ? rect.top + rect.height / 2 : win.windowHeight * 0.3
        flyAnim.fly({
          startX,
          startY,
          endX,
          endY,
          imageUrl: sku.image,
          color: '#8b7355',
          size: 44
        })
      })
      .exec()
  },

  /** 飞入动画完成：重绘槽位舞台（确保新宝石入槽视觉落定） */
  onFlyComplete() {
    if (this.data.isSlotMode) {
      this._renderSlots()
    }
  },

  /**
   * 后端 DiyBead → 页面视图模型（snake_case 计费字段透传 + camelCase 展示字段）
   * material_type/meaning/weight/energy/pairing/five_elements 为待后端补充字段：
   * 存在则透传展示，缺失则 undefined（详情行隐藏/五行空态），不做前端默认值。
   */
  _mapBead(b: any): any {
    const media = b.image_media || null
    const image =
      (media && ((media.thumbnails && media.thumbnails.medium) || media.public_url)) || ''
    return {
      /** 后端原始对象引用（镶嵌模式 diyStore.fillSlot 约束校验/渲染需要原始 shape 等字段） */
      raw: b,
      /* 后端原始字段透传（提交/计费/库存用） */
      diy_material_id: b.diy_material_id,
      material_code: b.material_code,
      group_code: b.group_code,
      price_asset_code: b.price_asset_code,
      stock: b.stock,
      /* 展示字段 */
      id: b.material_code,
      name: b.display_name,
      category: b.group_code,
      categoryLabel: GROUP_NAME_MAP[b.group_code] || b.group_code,
      diameter: b.diameter,
      sizeText: `${b.diameter}mm`,
      price: b.price,
      priceLabel: ASSET_DISPLAY_NAME[b.price_asset_code] || b.price_asset_code,
      /** 无异形几何元数据前统一按圆珠渲染（见接口需求文档第3节） */
      shape: 'round',
      /** 材质光影档位：后端 material_type 未下发时按 crystal 渲染（文档 2.1 已约定） */
      material: b.material_type || 'crystal',
      image,
      meaning: b.meaning,
      weight: b.weight,
      energy: b.energy,
      pairing: b.pairing,
      five_elements: b.five_elements
    }
  },

  // ===== 尺码/容量（后端 sizing_rules/bead_rules/capacity_rules，本地模式用 LOCAL_TEMPLATE 同结构） =====

  /** 初始化尺码选项与当前尺码（后端 sizing_rules），并计算容量 */
  _setupSizing() {
    const template = this._template
    const options = template?.sizing_rules?.size_options || []
    const defaultLabel = template?.sizing_rules?.default_size || options[0]?.label || ''
    if (!this._selectedSizeLabel) {
      this._selectedSizeLabel = defaultLabel
    }
    let sizeIndex = options.findIndex((o: any) => o.label === this._selectedSizeLabel)
    if (sizeIndex < 0) {
      sizeIndex = 0
      this._selectedSizeLabel = options[0]?.label || ''
    }
    this.setData({
      sizeOptions: options.map((o: any) => ({ label: o.label, display: o.display })),
      sizeIndex,
      selectedSizeDisplay: options[sizeIndex]?.display || ''
    })
    this._recalcCapacity()
  },

  /**
   * 当前尺码容量（mm），对齐 diyStore.maxDiameter 的 PRD 公式:
   *   优先 circumference_mm - margin；降级 bead_count × default_diameter；无规则返回 0(不限容)
   */
  _capacityForCurrentSize(): number {
    const template = this._template
    const options = template?.sizing_rules?.size_options || []
    const current = options.find((o: any) => o.label === this._selectedSizeLabel)
    if (!current) {
      return 0
    }
    if (current.circumference_mm) {
      const margin = template?.bead_rules?.margin ?? 10
      return current.circumference_mm - margin
    }
    const defaultDiameter = template?.bead_rules?.default_diameter || 8
    return (current.bead_count || 0) * defaultDiameter
  },

  /** 重算容量并刷新已选珠子的占用展示（尺码变化/初始化时调用） */
  _recalcCapacity() {
    const capacityMm = Math.round(this._capacityForCurrentSize())
    const capacityLimited = capacityMm > 0
    this.setData({ capacityMm, capacityLimited }, () =>
      this._applySelection(this.data.selectedBeads, false)
    )
  },

  /** 打开尺码选择弹窗 */
  onOpenSize() {
    this.setData({ sizeVisible: true })
  },

  /** 关闭尺码选择弹窗 */
  onCloseSize() {
    this.setData({ sizeVisible: false })
  },

  /** 选择尺码（后端 size_options 内取值） */
  onSelectSize(e: any) {
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.sizeOptions[index]
    if (!option) {
      return
    }
    this._selectedSizeLabel = option.label
    this.setData({ sizeIndex: index, selectedSizeDisplay: option.display })
    this._recalcCapacity()
  },

  // ===== 素材面板 =====

  /**
   * 切换素材类型 Tab（饰品/配饰/吊坠，对齐 diy-design）
   * ⚠️ 配饰/吊坠素材属后端业务数据，未接入前显示空态提示，绝不用假素材填充。
   */
  onMaterialTypeChange(e: any) {
    const materialType = e.currentTarget.dataset.type as string
    if (materialType === this.data.activeMaterialType) {
      return
    }
    this.setData({ activeMaterialType: materialType }, () => this._refreshGroups())
  },

  /** 切换主分类 */
  onSwitchCategory(e: any) {
    const categoryKey = e.currentTarget.dataset.key
    if (categoryKey === this.data.activeCategory) {
      return
    }
    this.setData({ activeCategory: categoryKey }, () => this._refreshGroups())
  },

  /** 搜索输入 */
  onSearchInput(e: any) {
    this.setData({ keyword: e.detail.value }, () => this._refreshGroups())
  },

  /** 清空搜索 */
  onSearchClear() {
    this.setData({ keyword: '' }, () => this._refreshGroups())
  },

  /** 关闭素材提示条（对齐旧版工作台 onCloseMaterialTip） */
  onCloseMaterialTip() {
    this.setData({ showMaterialTip: false })
  },

  /** 刷新款式组：按素材类型 + 当前分类 + 搜索关键词过滤，再按名称聚合 */
  _refreshGroups() {
    /** 配饰/吊坠：素材待后端提供，直接空列表并给出对应空态文案 */
    if (this.data.activeMaterialType !== 'beads') {
      const typeLabel = this.data.activeMaterialType === 'accessories' ? '配饰' : '吊坠'
      this.setData({ groups: [], gridEmptyText: `${typeLabel}素材待后端提供，敬请期待` })
      return
    }
    const kw = this.data.keyword.trim()
    let list = this._allBeads.filter((b: any) => b.category === this.data.activeCategory)
    if (kw) {
      /** 搜索跨分类：关键词匹配名称 */
      list = this._allBeads.filter((b: any) => b.name.indexOf(kw) >= 0)
    }
    /** 镶嵌模式：按激活槽位约束标记不可选（对齐 diy-design 的 _applyBeadFilter） */
    if (this.data.isSlotMode) {
      const constraints = diyStore.activeSlotConstraints
      list = list.map((b: any) => {
        let disabled = b.stock === 0
        if (constraints) {
          if (
            constraints.allowed_diameters.length > 0 &&
            !constraints.allowed_diameters.includes(b.diameter)
          ) {
            disabled = true
          }
          if (
            constraints.allowed_shapes.length > 0 &&
            !constraints.allowed_shapes.includes(b.raw?.shape)
          ) {
            disabled = true
          }
          if (
            constraints.allowed_group_codes.length > 0 &&
            !constraints.allowed_group_codes.includes(b.group_code)
          ) {
            disabled = true
          }
        }
        return { ...b, _disabled: disabled }
      })
    }
    this.setData({ groups: buildBeadGroups(list), gridEmptyText: '没有匹配的珠子' }, () =>
      this._refreshGroupCounts(this.data.usedCountMap)
    )
  },

  /** 网格卡尺码切换：+/- 改变该款式组当前选中尺寸 */
  onSwitchSize(e: any) {
    const groupIndex = Number(e.currentTarget.dataset.group)
    const dir = Number(e.currentTarget.dataset.dir)
    const groups = this.data.groups.slice()
    const group = groups[groupIndex]
    if (!group) {
      return
    }
    const next = group.sizeIndex + dir
    if (next < 0 || next >= group.skus.length) {
      return
    }
    group.sizeIndex = next
    this.setData({ groups })
  },

  /** 点击网格卡：串珠模式加入手串（容量/库存校验），镶嵌模式填入激活槽位（约束校验+飞入动画） */
  onSelectBead(e: any) {
    const groupIndex = Number(e.currentTarget.dataset.group)
    const group = this.data.groups[groupIndex]
    if (!group) {
      return
    }
    const sku = group.skus[group.sizeIndex]
    if (this.data.isSlotMode) {
      this._trySlotFill(sku, e)
      return
    }
    this._tryAddBead(sku)
  },

  /** 长按网格卡：查看该款式当前尺寸详情 */
  onBeadLongPress(e: any) {
    const groupIndex = Number(e.currentTarget.dataset.group)
    const group = this.data.groups[groupIndex]
    if (group) {
      this.setData({ detailVisible: true, detailBead: group.skus[group.sizeIndex] })
    }
  },

  /** 关闭详情弹窗 */
  onCloseDetail() {
    this.setData({ detailVisible: false })
  },

  /** 详情弹窗内"加入手串/镶入槽位" */
  onDetailAdd() {
    const bead = this.data.detailBead
    if (!bead) {
      return
    }
    const ok = this.data.isSlotMode ? this._trySlotFill(bead) : this._tryAddBead(bead)
    if (ok) {
      this.setData({ detailVisible: false })
    }
  },

  /**
   * 尝试添加一颗珠子：库存/允许直径/最大颗数/容量四重校验（对齐 diyStore.addBead），
   * 满容量弹框引导「更换尺码」或删珠。
   * @returns 是否添加成功
   */
  _tryAddBead(sku: any): boolean {
    /** 校验1: 库存（后端 stock，0=售罄；-1=无限） */
    if (sku.stock === 0) {
      wx.showToast({ title: '该珠子已售罄', icon: 'none' })
      return false
    }
    const template = this._template
    /** 校验2: 直径在模板允许范围内（bead_rules.allowed_diameters） */
    const allowedDiameters = template?.bead_rules?.allowed_diameters || []
    if (allowedDiameters.length > 0 && !allowedDiameters.includes(sku.diameter)) {
      wx.showToast({ title: '该尺寸不适用于当前款式', icon: 'none' })
      return false
    }
    /** 校验3: 最大颗数（capacity_rules.max_beads，0=不限） */
    const maxBeads = template?.capacity_rules?.max_beads || 0
    if (maxBeads > 0 && this.data.selectedBeads.length >= maxBeads) {
      wx.showToast({ title: `最多可放 ${maxBeads} 颗珠子`, icon: 'none' })
      return false
    }
    /** 校验4: 容量（直径累加 ≤ 容量 mm；capacityMm=0 表示后端未给规则，不限容） */
    if (this.data.capacityLimited) {
      const used = this._usedLengthMm(this.data.selectedBeads)
      if (used + sku.diameter > this.data.capacityMm) {
        wx.vibrateShort({ type: 'heavy' })
        wx.showModal({
          title: '当前尺码已排满',
          content: '这个尺码放不下更多珠子了。可以换大一号尺码，或删除已有珠子后再添加。',
          confirmText: '更换尺码',
          cancelText: '知道了',
          confirmColor: '#8b7355',
          success: (res: any) => {
            if (res.confirm) {
              this.setData({ sizeVisible: true })
            }
          }
        })
        return false
      }
    }
    this._applySelection(this.data.selectedBeads.concat({ ...sku }))
    wx.vibrateShort({ type: 'light' })
    const tray = this.selectComponent('#braceletTray')
    if (tray) {
      tray.playAddSound()
    }
    return true
  },

  // ===== bracelet-tray 事件 =====

  /** bracelet-tray 事件：移除某颗 */
  onTrayRemove(e: any) {
    const index = e.detail.index
    const nextSelected = this.data.selectedBeads.slice()
    if (index >= 0 && index < nextSelected.length) {
      nextSelected.splice(index, 1)
      this._applySelection(nextSelected)
    }
  },

  /**
   * bracelet-tray 事件：3D 态轻点手串上的珠子 → 查看详情。
   * （平面态轻点为多选选中，由组件 selectionchange 事件走 onTraySelectionChange，不触发本方法）
   */
  onTrayBeadTap(e: any) {
    const bead = this.data.selectedBeads[e.detail.index]
    if (bead) {
      this.setData({ detailVisible: true, detailBead: bead })
    }
  },

  /** bracelet-tray 事件：换位（from → to） */
  onTrayReorder(e: any) {
    const { from, to } = e.detail
    const nextSelected = this.data.selectedBeads.slice()
    if (from < 0 || from >= nextSelected.length) {
      return
    }
    const moved = nextSelected.splice(from, 1)[0]
    nextSelected.splice(to, 0, moved)
    this._applySelection(nextSelected)
  },

  /** bracelet-tray 事件：手串上多选珠子数变化（>0 显示批量删除栏） */
  onTraySelectionChange(e: any) {
    const indices = (e.detail && e.detail.indices) || []
    this.setData({ selectedCount: indices.length })
  },

  // ===== 撤销/重做/多选删除 =====

  /** 撤销（串珠：页面历史栈；镶嵌：diyStore.undo，均 30 步上限） */
  onUndo() {
    if (this.data.isSlotMode) {
      if (!diyStore.canUndo) {
        return
      }
      diyStore.undo()
      this._syncSlotState()
      this._renderSlots()
      return
    }
    if (this._histIndex <= 0) {
      return
    }
    this._histIndex -= 1
    const snapshot = this._history[this._histIndex].map((b: any) => ({ ...b }))
    this._applySelection(snapshot, false)
  },

  /** 重做（串珠：页面历史栈；镶嵌：diyStore.redo） */
  onRedo() {
    if (this.data.isSlotMode) {
      if (!diyStore.canRedo) {
        return
      }
      diyStore.redo()
      this._syncSlotState()
      this._renderSlots()
      return
    }
    if (this._histIndex >= this._history.length - 1) {
      return
    }
    this._histIndex += 1
    const snapshot = this._history[this._histIndex].map((b: any) => ({ ...b }))
    this._applySelection(snapshot, false)
  },

  /**
   * 清空（串珠：清本地数组；镶嵌：diyStore.clearDesign 清全部槽位）
   * 二次确认弹窗防误触（对齐旧版工作台 onClearDesign），且清空后仍可撤销恢复。
   */
  onClearAll() {
    const hasContent = this.data.isSlotMode
      ? diyStore.filledSlotCount > 0
      : this.data.selectedBeads.length > 0
    if (!hasContent) {
      return
    }
    wx.showModal({
      title: '确认清空',
      content: '确定要清空当前设计吗？此操作可以撤销。',
      confirmColor: '#8b7355',
      success: res => {
        if (!res.confirm) {
          return
        }
        if (this.data.isSlotMode) {
          diyStore.clearDesign()
          this._syncSlotState()
          this._renderSlots()
          diyStore.saveToCache()
        } else {
          this._applySelection([])
        }
      }
    })
  },

  /** 批量删除选中的珠子（对齐 diy-design 的多选删除） */
  onDeleteSelected() {
    const tray = this.selectComponent('#braceletTray')
    if (!tray) {
      return
    }
    const indices: number[] = tray.getSelectedIndices()
    if (indices.length === 0) {
      return
    }
    const nextSelected = this.data.selectedBeads.filter(
      (_b: any, i: number) => indices.indexOf(i) < 0
    )
    tray.clearSelection()
    this._applySelection(nextSelected)
    wx.vibrateShort({ type: 'medium' })
  },

  /** 取消手串上的多选 */
  onClearSelection() {
    const tray = this.selectComponent('#braceletTray')
    if (tray) {
      tray.clearSelection()
    }
  },

  // ===== 舞台工具 =====

  /**
   * 一键成串（随机搭配）：从可售珠子里随机挑，累加到接近容量为止。
   * 空态引导用，降低新用户上手门槛。随机为 UX 逻辑，价格/容量均为后端数据。
   */
  onRandomFill() {
    const pool = this._allBeads.filter((b: any) => b.stock !== 0)
    if (pool.length === 0) {
      return
    }
    const capacityMm = this.data.capacityLimited ? this.data.capacityMm : 150
    const maxBeads = this._template?.capacity_rules?.max_beads || 0
    const picked: any[] = []
    let used = 0
    /** 最多尝试 60 次，凑到 ≥90% 容量或放不下为止 */
    for (let i = 0; i < 60 && used < capacityMm * 0.9; i++) {
      if (maxBeads > 0 && picked.length >= maxBeads) {
        break
      }
      const sku = pool[Math.floor(Math.random() * pool.length)]
      if (used + sku.diameter > capacityMm) {
        continue
      }
      picked.push({ ...sku })
      used += sku.diameter
    }
    if (picked.length > 0) {
      this._applySelection(picked)
      wx.vibrateShort({ type: 'medium' })
    }
  },

  /** 切换伪3D预览（散珠态下不允许开3D，先收拢） */
  onToggle3d() {
    if (this.data.scattered) {
      return
    }
    this.setData({ preview3d: !this.data.preview3d })
  },

  /** 放大手串展示（步进 +0.15，组件内部收 0.4~2.5 且不超画布；画布上双指捏合亦可） */
  onZoomIn() {
    const tray = this.selectComponent('#braceletTray') as any
    if (tray) {
      tray.adjustZoom(0.15)
    }
  },

  /** 缩小手串展示（步进 -0.15） */
  onZoomOut() {
    const tray = this.selectComponent('#braceletTray') as any
    if (tray) {
      tray.adjustZoom(-0.15)
    }
  },

  /** 切换散珠/收拢（3D 态下先关闭 3D） */
  onToggleScatter() {
    if (this.data.beadCount === 0) {
      return
    }
    const scattered = !this.data.scattered
    this.setData({ scattered, preview3d: false })
    wx.vibrateShort({ type: 'light' })
  },

  /** 切换画布背景色 */
  onSwitchBg(e: any) {
    this.setData({ bgColor: e.currentTarget.dataset.color })
  },

  /** 拍照导出：让 bracelet-tray 生成图片并保存相册 */
  onExportPhoto() {
    if (this.data.beadCount === 0) {
      return
    }
    const tray = this.selectComponent('#braceletTray')
    if (!tray) {
      wx.showToast({ title: '预览未就绪', icon: 'none' })
      return
    }
    tray.exportImage((tempPath: string) => {
      if (!tempPath) {
        wx.showToast({ title: '导出失败', icon: 'none' })
        return
      }
      wx.saveImageToPhotosAlbum({
        filePath: tempPath,
        success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
      })
    })
  },

  /** 转一圈展示：让 bracelet-tray 平滑转一圈欣赏（拍照前的展示动作） */
  onSpinShow() {
    if (this.data.beadCount === 0) {
      return
    }
    const tray = this.selectComponent('#braceletTray')
    if (tray) {
      tray.spinOnce()
      wx.vibrateShort({ type: 'light' })
    }
  },

  // ===== 教程 / 五行 =====

  /** 打开教程引导（默认回到第一个 Tab） */
  onOpenGuide() {
    this.setData({ guideVisible: true, guideTabIndex: 0 })
  },

  /** 关闭教程引导 */
  onCloseGuide() {
    this.setData({ guideVisible: false })
  },

  /** 切换使用指南 Tab */
  onSwitchGuideTab(e: any) {
    this.setData({ guideTabIndex: Number(e.currentTarget.dataset.index) })
  },

  /**
   * 打开五行雷达图：统计已选珠子的金木水火土占比并绘制雷达图。
   * ⚠️ 五行属性是命理业务数据，仅来自后端 `five_elements`；后端未下发时
   *   显示空态提示「五行数据待后端提供」，绝不用假数据填充。
   */
  onOpenWuxing() {
    const stats = this._computeWuxingStats(this.data.selectedBeads)
    const hasData = stats.total > 0
    this.setData(
      {
        wuxingVisible: true,
        wuxingHasData: hasData,
        wuxingSummary: hasData ? this._buildWuxingSummary(stats) : ''
      },
      () => {
        if (hasData) {
          this._drawWuxingRadar(stats)
        }
      }
    )
  },

  /** 关闭五行雷达图 */
  onCloseWuxing() {
    this.setData({ wuxingVisible: false })
  },

  /**
   * 统计已选珠子的五行分布（仅统计后端下发了 five_elements 的珠子）。
   * @param beads 已选珠子
   * @returns { counts: {金木水火土计数}, total: 有效珠子五行计数总和 }
   */
  _computeWuxingStats(beads: any[]): { counts: Record<string, number>; total: number } {
    const counts: Record<string, number> = { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 }
    let total = 0
    beads.forEach(bead => {
      if (!bead.five_elements) {
        return
      }
      String(bead.five_elements)
        .split(',')
        .map((s: string) => s.trim())
        .forEach((el: string) => {
          if (counts[el] !== undefined) {
            counts[el] += 1
            total += 1
          }
        })
    })
    return { counts, total }
  },

  /** 生成五行占比文本摘要（如「金2 木1 水3」，无障碍与降级展示用） */
  _buildWuxingSummary(stats: { counts: Record<string, number>; total: number }): string {
    const LABELS: Record<string, string> = {
      metal: '金',
      wood: '木',
      water: '水',
      fire: '火',
      earth: '土'
    }
    return ['metal', 'wood', 'water', 'fire', 'earth']
      .map(el => `${LABELS[el]}${stats.counts[el]}`)
      .join('  ')
  },

  /**
   * Canvas 手绘五行雷达图（不引第三方图表库）：五边形网格 + 数据多边形填充。
   * 五轴顺序按相生：木→火→土→金→水。半径按各元素计数占最大计数的比例。
   * @param stats 五行统计结果
   */
  _drawWuxingRadar(stats: { counts: Record<string, number>; total: number }) {
    const query = this.createSelectorQuery()
    query
      .select('#wuxingCanvas')
      .fields({ node: true, size: true })
      .exec((res: any) => {
        if (!res || !res[0] || !res[0].node) {
          return
        }
        const canvasNode = res[0].node
        const ctx = canvasNode.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio || 1
        const size = res[0].width
        canvasNode.width = size * dpr
        canvasNode.height = size * dpr
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, size, size)

        const cx = size / 2
        const cy = size / 2
        const radius = size * 0.36
        /** 五行按相生顺序排轴（木火土金水），从正上方起顺时针 */
        const axes = ['wood', 'fire', 'earth', 'metal', 'water']
        const labels: Record<string, string> = {
          wood: '木',
          fire: '火',
          earth: '土',
          metal: '金',
          water: '水'
        }
        const maxCount = Math.max(1, ...axes.map(el => stats.counts[el]))
        const angleOf = (i: number) => -Math.PI / 2 + (i / axes.length) * 2 * Math.PI

        /** 背景网格：3 层五边形 */
        for (let layer = 1; layer <= 3; layer++) {
          const rr = (radius * layer) / 3
          ctx.beginPath()
          axes.forEach((_el, i) => {
            const a = angleOf(i)
            const x = cx + rr * Math.cos(a)
            const y = cy + rr * Math.sin(a)
            if (i === 0) {
              ctx.moveTo(x, y)
            } else {
              ctx.lineTo(x, y)
            }
          })
          ctx.closePath()
          ctx.strokeStyle = 'rgba(139,115,85,0.25)'
          ctx.lineWidth = 1
          ctx.stroke()
        }

        /** 轴线 + 轴标签 */
        axes.forEach((el, i) => {
          const a = angleOf(i)
          const x = cx + radius * Math.cos(a)
          const y = cy + radius * Math.sin(a)
          ctx.beginPath()
          ctx.moveTo(cx, cy)
          ctx.lineTo(x, y)
          ctx.strokeStyle = 'rgba(139,115,85,0.2)'
          ctx.stroke()
          ctx.fillStyle = '#8b7355'
          ctx.font = '14px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(
            labels[el],
            cx + (radius + 16) * Math.cos(a),
            cy + (radius + 16) * Math.sin(a)
          )
        })

        /** 数据多边形 */
        ctx.beginPath()
        axes.forEach((el, i) => {
          const ratio = stats.counts[el] / maxCount
          const rr = radius * ratio
          const a = angleOf(i)
          const x = cx + rr * Math.cos(a)
          const y = cy + rr * Math.sin(a)
          if (i === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.closePath()
        ctx.fillStyle = 'rgba(139,115,85,0.35)'
        ctx.fill()
        ctx.strokeStyle = '#8b7355'
        ctx.lineWidth = 2
        ctx.stroke()
      })
  },

  // ===== 保存草稿 / 完成设计（生产闭环，对齐 diy-design） =====

  /** 构造保存作品请求体（串珠/镶嵌两种 design_data，material_code 对齐后端 diy_materials 表） */
  _buildWorkData(): any {
    const workData: any = {
      diy_template_id: this.data.templateId,
      work_name: `我的${this.data.templateName}`,
      design_data: { mode: 'beading' }
    }
    if (this.data.isSlotMode) {
      /** 镶嵌模式：记录每个槽位填入的 material_code（对齐 diy-design.onSubmit） */
      const fillings: Record<string, { material_code: string }> = {}
      for (const [slotId, bead] of Object.entries(diyStore.slotFillings)) {
        fillings[slotId] = { material_code: (bead as any).material_code }
      }
      workData.design_data = { mode: 'slots', fillings }
    } else {
      const beads = this.data.selectedBeads.map((b: any, i: number) => ({
        slot_index: i,
        material_code: b.material_code,
        diameter: b.diameter
      }))
      workData.design_data = { mode: 'beading', selected_size: this._selectedSizeLabel, beads }
    }
    return workData
  },

  /**
   * 保存草稿（不跳转结果页，仅保存当前设计到后端）
   * 后端API: POST /api/v4/diy/works
   */
  async onSaveDraft() {
    /** 本地演示模式：无后端不能保存作品（本地 storage 已自动保草稿），明确告知不伪造提交 */
    if (this.data.localMode) {
      wx.showModal({
        title: '本地演示模式',
        content:
          '当前展示的是本地演示数据（未接入后端），设计会自动留在本机，接入后端后才能保存作品。',
        showCancel: false,
        confirmColor: '#8b7355'
      })
      return
    }
    if (!checkAuth({ redirect: false })) {
      this.setData({ loginPopupVisible: true })
      return
    }
    if (this.data.beadCount === 0) {
      wx.showToast({ title: '请先添加珠子', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      const saveRes = await API.saveDiyWork(this._buildWorkData())
      wx.hideLoading()
      if (saveRes.success && saveRes.data) {
        this._currentWorkId = saveRes.data.diy_work_id
        wx.showToast({ title: '保存成功', icon: 'success' })
      } else {
        wx.showToast({ title: saveRes.message || '保存失败', icon: 'none' })
      }
    } catch (_err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常，请稍后重试', icon: 'none' })
    }
  },

  /**
   * 完成设计 → 保存作品 → 跳转结果页进入支付流程（draft→frozen→completed 三步状态机）
   * 后端API: POST /api/v4/diy/works；结果页复用 diy-result（含支付面板/海报分享）
   */
  async onSubmit() {
    /** 本地演示模式：无后端不能下单，明确告知不伪造订单/支付 */
    if (this.data.localMode) {
      wx.showModal({
        title: '本地演示模式',
        content: '当前展示的是本地演示数据（未接入后端），暂不能提交订单。重新进入页面即可重试连接后端。',
        showCancel: false,
        confirmColor: '#8b7355'
      })
      return
    }
    if (!checkAuth({ redirect: false })) {
      this.setData({ loginPopupVisible: true })
      return
    }
    if (!this.data.canSubmit) {
      if (this.data.isSlotMode) {
        wx.showToast({ title: '请先填满必填槽位', icon: 'none' })
      } else {
        const minBeads = this._template?.capacity_rules?.min_beads || 1
        wx.showToast({ title: `至少需要 ${minBeads} 颗珠子`, icon: 'none' })
      }
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      const saveRes = await API.saveDiyWork(this._buildWorkData())
      wx.hideLoading()
      if (saveRes.success && saveRes.data) {
        const workId = saveRes.data.diy_work_id
        this._currentWorkId = workId
        /** 清除对应模式的本地草稿（正式作品已入后端） */
        if (this.data.isSlotMode) {
          diyStore.clearCache()
        } else {
          this._clearDraft()
        }
        /** 总价 = 所有已选珠子/宝石 price 之和；费用明细按 price_asset_code 分组传给结果页支付面板 */
        const priceSource: any[] = this.data.isSlotMode
          ? (Object.values(diyStore.slotFillings) as any[])
          : this.data.selectedBeads
        const totalPrice = priceSource.reduce((sum: number, b: any) => sum + b.price, 0)
        const costBreakdownParam = encodeURIComponent(JSON.stringify(this._costBreakdown))
        wx.navigateTo({
          url: `/packageDIY/diy-result/diy-result?workId=${workId}&totalPrice=${totalPrice}&templateName=${encodeURIComponent(this.data.templateName)}&templateId=${this.data.templateId}&costBreakdown=${costBreakdownParam}`
        })
      } else {
        wx.showToast({ title: saveRes.message || '保存失败', icon: 'none' })
      }
    } catch (_err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常，请检查网络后重试', icon: 'none' })
    }
  },

  /** 关闭登录弹窗 */
  onLoginPopupClose() {
    this.setData({ loginPopupVisible: false })
  },

  /** 登录成功：关闭弹窗（用户可重新点击保存/完成继续） */
  onLoginSuccess() {
    this.setData({ loginPopupVisible: false })
    wx.showToast({ title: '登录成功，请继续操作', icon: 'none' })
  },

  // ===== 状态应用 / 历史栈 =====

  /**
   * 把一份已选珠子快照写入撤销历史栈（截断前进分支 + 上限裁剪，对齐 diyStore 30 步）
   * @param beads 当前已选珠子
   */
  _pushHistory(beads: any[]) {
    /** 在历史中间撤销后再操作：丢弃"重做"分支 */
    this._history = this._history.slice(0, this._histIndex + 1)
    this._history.push(beads.map((b: any) => ({ ...b })))
    if (this._history.length > HISTORY_LIMIT + 1) {
      this._history.shift()
    }
    this._histIndex = this._history.length - 1
  },

  /**
   * 统一应用选择变更：更新费用/颗数/串长/容量占用/可提交态
   * selectedBeads 通过属性下发给 bracelet-tray，由组件负责布局与重绘
   * @param nextSelected 新的已选珠子
   * @param recordHistory 是否记入撤销历史（撤销/重做本身与尺码重算不记，默认记）
   */
  _applySelection(nextSelected: any[], recordHistory: boolean = true) {
    if (recordHistory) {
      this._pushHistory(nextSelected)
    }
    /** 费用明细按 price_asset_code 分组（复用 diyStore 同款纯函数）；本地演示模式按"元"直加 */
    let costText = '0'
    if (this.data.localMode) {
      const totalYuan = nextSelected.reduce((sum: number, b: any) => sum + b.price, 0)
      this._costBreakdown = []
      /** 顶部信息条空间有限，演示价不带后缀（本地模式已由保存/下单拦截明确告知） */
      costText = totalYuan > 0 ? `¥${totalYuan.toFixed(1)}` : '0'
    } else {
      const breakdown = buildCostBreakdown(nextSelected)
      this._costBreakdown = breakdown
      costText =
        breakdown.length === 0
          ? '0'
          : breakdown.map((i: any) => `${i.amount} ${i.asset_name}`).join(' + ')
    }

    const usedMm = this._usedLengthMm(nextSelected)
    const capacityMm = this.data.capacityMm
    const capacityLimited = this.data.capacityLimited
    const percent = capacityLimited ? Math.min(100, Math.round((usedMm / capacityMm) * 100)) : 0
    const isFull = capacityLimited && usedMm >= capacityMm
    /** 快满阈值：占用 ≥85% 且未满时，容量条变警示色 */
    const nearFull = capacityLimited && !isFull && percent >= 85

    /** 可提交：颗数 ≥ capacity_rules.min_beads（对齐 diyStore.canSubmit） */
    const minBeads = this._template?.capacity_rules?.min_beads || 1
    const canSubmit = nextSelected.length >= minBeads

    /** 统计每个珠子 id 的已选数量（网格角标） */
    const countMap: Record<string, number> = {}
    nextSelected.forEach(b => {
      countMap[b.id] = (countMap[b.id] || 0) + 1
    })

    this.setData({
      selectedBeads: nextSelected,
      costText,
      beadCount: nextSelected.length,
      lengthText: String(Math.round(usedMm)),
      capacityPercent: percent,
      isFull,
      nearFull,
      canSubmit,
      usedCountMap: countMap,
      capacityTip: isFull ? '已排满，删除珠子或换大尺码可继续' : '',
      fillHint: this._buildFillHint(nextSelected, usedMm, capacityMm, isFull, percent),
      canUndo: this._histIndex > 0,
      canRedo: this._histIndex < this._history.length - 1,
      /** 数据源变化时组件会清空多选，这里同步复位批量删除栏 */
      selectedCount: 0,
      /** 绳圈渲染周长：无容量规则时用渲染兜底值（纯 UI，不影响业务校验） */
      trayCapacityMm: this.data.capacityLimited
        ? this.data.capacityMm
        : Math.max(150, Math.round(usedMm) + 20)
    })
    this._refreshGroupCounts(countMap)
  },

  /**
   * 生成实时数量反馈文案（结合后端 min_beads 规则与剩余容量的引导）。
   * @param beads 已选珠子
   * @param usedMm 已用长度(mm)
   * @param capacityMm 容量(mm)
   * @param isFull 是否已满
   * @param percent 容量占用百分比
   * @returns 引导文案(空态/未达最少颗数/快满/已满各不同)
   */
  _buildFillHint(
    beads: any[],
    usedMm: number,
    capacityMm: number,
    isFull: boolean,
    percent: number
  ): string {
    if (beads.length === 0) {
      return '从下方挑一颗珠子开始吧'
    }
    /** 未达后端最少颗数：明确提示还差几颗才能提交 */
    const minBeads = this._template?.capacity_rules?.min_beads || 1
    if (beads.length < minBeads) {
      return `至少需要 ${minBeads} 颗（还差 ${minBeads - beads.length} 颗）`
    }
    if (isFull) {
      return '✓ 已排满一圈，可以完成了'
    }
    if (!this.data.capacityLimited) {
      return `已选 ${beads.length} 颗`
    }
    if (percent >= 85) {
      return '就快满了，再加一两颗即可'
    }
    const remainMm = capacityMm - usedMm
    /** 用已选珠子平均直径估算还能放几颗(纯展示引导，非业务定量) */
    const avgMm = usedMm / beads.length || 10
    const remainCount = Math.floor(remainMm / avgMm)
    if (remainCount <= 0) {
      return '✓ 数量差不多了'
    }
    return `约还能再加 ${remainCount} 颗`
  },

  /** 把已选数量写回当前 groups（供网格卡角标显示） */
  _refreshGroupCounts(countMap: Record<string, number>) {
    const groups = this.data.groups
    if (!groups || groups.length === 0) {
      return
    }
    const updated = groups.map((g: any) => {
      let used = 0
      g.skus.forEach((sku: any) => {
        used += countMap[sku.id] || 0
      })
      return { ...g, usedCount: used }
    })
    this.setData({ groups: updated })
  },

  /** 应用还原的珠子并把历史栈重置为「还原态为起点」（还原本身不可撤销成空串） */
  _applyRestoredBeads(restored: any[]) {
    this._applySelection(restored, false)
    this._history = [restored.map((b: any) => ({ ...b }))]
    this._histIndex = 0
  },

  // ===== 本地草稿（编辑现场保护，与 diy-design 的 diyStore 本地缓存同策略） =====

  /**
   * 保存草稿到本地（按模板隔离 + 7天TTL；存 material_code 列表 + 尺码）
   * 正式提交后由 _clearDraft 清除。
   */
  _saveDraft() {
    /** 本地模板 id 为 0，同样允许保草稿（key 按模板隔离，本地=DIY_LITE_DRAFT_0） */
    if (this.data.selectedBeads.length === 0) {
      return
    }
    try {
      const now = Date.now()
      wx.setStorageSync(`${DRAFT_KEY_PREFIX}${this.data.templateId}`, {
        materialCodes: this.data.selectedBeads.map((b: any) => b.material_code),
        sizeLabel: this._selectedSizeLabel,
        updatedAt: now,
        expiresAt: now + DRAFT_TTL
      })
    } catch (_e) {
      /* storage 不可用时忽略 */
    }
  },

  /** 从本地还原草稿（按 material_code 从已加载素材重建珠子对象） */
  _restoreDraft() {
    try {
      const draft = wx.getStorageSync(`${DRAFT_KEY_PREFIX}${this.data.templateId}`)
      if (!draft || !draft.materialCodes || draft.materialCodes.length === 0) {
        return
      }
      /** 过期草稿丢弃 */
      if (draft.expiresAt && draft.expiresAt < Date.now()) {
        this._clearDraft()
        return
      }
      const restored = draft.materialCodes
        .map((code: string) => this._allBeads.find((b: any) => b.material_code === code))
        .filter((b: any) => !!b)
        .map((b: any) => ({ ...b }))
      if (restored.length === 0) {
        return
      }
      if (draft.sizeLabel) {
        this._selectedSizeLabel = draft.sizeLabel
        this._setupSizing()
      }
      this._applyRestoredBeads(restored)
      wx.showToast({ title: '已恢复上次未完成的设计', icon: 'none', duration: 2000 })
    } catch (_e) {
      /* 还原失败不影响进入 */
    }
  },

  /** 清除本地草稿（成功提交后调用） */
  _clearDraft() {
    try {
      wx.removeStorageSync(`${DRAFT_KEY_PREFIX}${this.data.templateId}`)
    } catch (_e) {
      /* 清除异常不影响主流程 */
    }
  },

  /**
   * 分享给好友：已保存过作品则带 workId，好友打开走后端还原（对齐 diy-design）；
   * 未保存过则分享落地页。
   */
  onShareAppMessage() {
    const count = this.data.beadCount
    /** 本地演示模式无后端作品，仅分享落地页 */
    if (this._currentWorkId && !this.data.localMode) {
      return {
        title: `我设计了一串 ${count} 颗的手串，快来看看`,
        path: `/packageDIY/diy-lite/diy-lite?workId=${this._currentWorkId}`
      }
    }
    return {
      title: '自由定制饰品',
      path: '/packageDIY/diy-lite/diy-lite'
    }
  },

  /** 已选珠子长度之和（mm，圆珠按直径累加，对齐 diyStore.totalDiameter） */
  _usedLengthMm(beads: any[]): number {
    return beads.reduce((sum, b) => sum + b.diameter, 0)
  }
})
