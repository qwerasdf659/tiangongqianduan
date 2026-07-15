/**
 * diy-lite 自由定制饰品设计台（生产页）
 *
 * 职责：选珠面板（素材类型Tab + 左侧竖分类 + 右侧网格 + 搜索 + 尺码切换）、珠子详情、
 *       手围驱动全联动（手围档位/自定义手围估算 + 长度/重量/价格实时联动 + 成品尺寸前置提示）、
 *       尺码与容量限制（后端 sizing_rules/bead_rules/capacity_rules）、伪3D预览、背景切换、
 *       教程引导、撤销/重做30步历史栈、手串珠子多选批量删除、售罄禁购(stock)、
 *       保存草稿/完成设计 → diy-result 结果页 → 支付（三步状态机 draft→frozen→completed）。
 *       双模式（对齐 diy-design，按模板 layout.shape 自动切换）：
 *         串珠 — bracelet-tray 渲染 + 页面本地状态；
 *         镶嵌(slots) — shape-renderer 渲染（底图+槽位），槽位约束/填充/交换/撤销/缓存由 diyStore 管理。
 *
 * 后端API（与 diy-design 同一套 /api/v4/diy/ 体系）:
 *   GET  /api/v4/diy/templates — 模板列表（未传 templateId 时取第一个串珠模板）
 *   GET  /api/v4/diy/templates/:id — 模板详情（sizing_rules 含 wrist_size_mm/target_length_mm/elastic_margin_mm）
 *   GET  /api/v4/diy/templates/:id/estimate — 手围算珠（自定义手围 + 珠径 → 参考颗数，后端权威换算）
 *   GET  /api/v4/diy/templates/:id/beads — 实物素材（珠子/配饰/吊坠，价格/库存/图片均为后端权威数据；
 *        每颗素材含 cord_occupy_mm 沿绳占用毫米数（后端派生），长度联动直接累加；
 *        默认不传 item_type 返回全部大类，素材类型 Tab 按 item_type 字段前端过滤）
 *   POST /api/v4/diy/works — 保存作品草稿（design_data 携带 size: { label, wrist_size_mm }，§11.4 契约）
 *   GET  /api/v4/diy/works/:id — 作品详情（分享还原，非作者仅 frozen/completed 可读脱敏版）
 *
 * 容量模型（手围驱动方案拍板 Q1：长度为主、颗数退为兜底）:
 *   长度口径 = 累加后端下发的 cord_occupy_mm，对照当前档位 target_length_mm 实时联动展示；
 *   超出可戴上限（target + elastic_margin）时前置友好提示不硬拦截（§7-3），最终以后端 confirm 硬校验为准；
 *   颗数上限 = 当前尺码 size_options[].bead_count 保留为兜底防呆，配合 capacity_rules.min_beads/max_beads。
 *
 * 单位口径（§10.5-3）: 接口字段一律毫米(mm)，展示层 ÷10 保留 1 位小数（cm），文案统一带"约"（§7）。
 *
 * 素材展示字段（13.1-A 已落库随接口下发）:
 *   material_type/meaning/weight/energy/pairing/five_elements — 未录入(null)时对应展示隐藏/空态
 *   异形珠几何: bore_orientation/size_length_mm/size_width_mm + image_media.width/height 绘制比例（11.7-2）
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

/**
 * 素材类型 Tab（对齐后端 diy_materials.item_type 大类枚举，13.1-A）:
 * beads 珠子 / accessories 配饰（隔片/佛头/流苏）/ pendants 吊坠。
 * beads 接口默认返回全部大类，Tab 按素材 item_type 字段过滤；某大类无素材时显示空态。
 */
const MATERIAL_TYPE_TABS = [
  { key: 'beads', label: '饰品' },
  { key: 'accessories', label: '配饰' },
  { key: 'pendants', label: '吊坠' }
]

/** 素材大类 → 中文名（空态文案用） */
const MATERIAL_TYPE_LABELS: Record<string, string> = {
  beads: '饰品',
  accessories: '配饰',
  pendants: '吊坠'
}

/** 背景选项（纯 UI 常量，前端自主决定） */
const BG_OPTIONS = ['#F4F2EC', '#EAF0F0', '#F6EAF0', '#EEECF6']

/**
 * 本地演示分组 → 中文名兜底映射（仅本地演示模式用，与 bead-data.ts 的 white/pink/purple/yellow 一致）。
 * 后端真实链路的分组名以 GET /material-groups 下发的 display_name 为权威（见 _groupNameMap），
 * 此表只在本地演示（无后端）时兜底，不参与后端数据渲染。
 */
const LOCAL_GROUP_NAME_MAP: Record<string, string> = {
  white: '白水晶系',
  pink: '粉晶系',
  purple: '紫水晶系',
  yellow: '黄水晶系',
  red: '红水晶系',
  orange: '橙水晶系',
  green: '绿水晶系',
  blue: '蓝水晶系'
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
    /** 容量占用百分比（0-100，用于进度条，按颗数计算） */
    capacityPercent: 0,
    /** 是否存在容量上限（当前尺码 bead_count > 0 时 true；后端未给颗数规则时不限容） */
    capacityLimited: false,
    /** 容量上限（颗数，兜底防呆口径 = 当前尺码 size_options[].bead_count，拍板 Q1 长度为主颗数兜底） */
    capacityBeads: 0,
    /** 传给 bracelet-tray 的绳圈周长（mm，纯渲染几何：颗数×默认珠径估算，不参与业务校验） */
    trayCapacityMm: 150,
    /** 容量提示文案 */
    capacityTip: '',
    /** 实时数量引导文案（结合后端 min_beads 与剩余可加颗数） */
    fillHint: '从下方挑一颗珠子开始吧',
    /** 是否已满（满则禁止添加） */
    isFull: false,
    /** 是否快满（≥85%，容量条警示色） */
    nearFull: false,
    /** 每个珠子 id(material_code) 的已选数量（网格角标用） */
    usedCountMap: {} as Record<string, number>,

    /* ===== 长度/重量实时联动（手围驱动方案 §3.3/§3.4，累加后端 cord_occupy_mm / weight） ===== */

    /** 已排长度展示文案（如 "约11.2cm"，估算值统一带"约"，§7-1） */
    usedLengthText: '',
    /** 目标长度展示文案（当前档位 target_length_mm，如 "约15.5cm"；后端未配置时为空） */
    targetLengthText: '',
    /** 长度差值文案（"还差约3.8cm" / "已超出约0.6cm"；无目标长度时为空） */
    lengthDiffText: '',
    /** 已排长度是否超出目标（差值文案警示色用） */
    lengthOver: false,
    /** 累计重量文案（如 "约86.0g"，累加后端 weight；无克重数据时为空） */
    weightText: '',
    /**
     * 物理数据不完整标注（TS 预计算，避免 WXML 跨行表达式）:
     * 存在 cord_occupy_mm 为 null 的素材 → "部分素材信息完善中，未计入串长"（§10.5-2）；
     * 存在 weight 为 null 的素材 → "部分素材暂无克重"（§3.4）；均无缺失时为空串（该行隐藏）
     */
    physicalNote: '',
    /** 是否展示长度/重量联动行（串珠模式且已有珠子时展示） */
    showLengthRow: false,

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

    /** 尺码选择弹窗（后端 sizing_rules.size_options，手围驱动方案 §3.1 手围入口） */
    sizeVisible: false,
    /**
     * 尺码选项列表（来自后端 size_options）:
     * display 运营文案 + metaText（手围/目标串长毫米字段换算的 cm 文案，字段缺失时为空）
     */
    sizeOptions: [] as { label: string; display: string; metaText: string }[],
    /** 当前尺码下标（自定义手围生效时为 -1） */
    sizeIndex: 0,
    /** 当前尺码展示文案（如 "小号 (约15cm)" 或 "自定义 手围约15.2cm"） */
    selectedSizeDisplay: '',
    /** 尺寸入口用语（手链品类="手围"，项链等品类="佩戴长度"，§11.1 品类差异） */
    sizeTermLabel: '手围',
    /** 自定义手围输入值（cm 字符串，用户键入） */
    customWristInput: '',
    /** 自定义估算的主珠径选项（mm，来自模板 bead_rules.allowed_diameters / default_diameter） */
    customDiameterOptions: [] as number[],
    /** 当前选中的主珠径下标 */
    customDiameterIndex: 0,
    /** 估算结果文案（后端 estimate 返回，如 "约需 18 颗 8mm 珠 · 目标串长约15.5cm"） */
    estimateText: '',
    /** 估算请求进行中（防重复点击） */
    estimating: false,
    /** 是否已有可应用的估算结果（"使用该手围"按钮可用态） */
    estimateReady: false,
    /** 当前是否为自定义手围模式（尺码列表全部非选中态） */
    customSizeActive: false,

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
  /**
   * 分组 group_code → 中文名映射（后端 /material-groups 下发的 display_name，拍板 1/16）:
   * 后端链路以此为权威；本地演示模式为空，回退 LOCAL_GROUP_NAME_MAP。
   */
  _groupNameMap: {} as Record<string, string>,
  /** 全量珠子视图模型（后端 beads 映射而来） */
  _allBeads: [] as any[],
  /** 当前尺码标识（如 "S"/"M"/"L"，对应 sizing_rules.size_options[].label；自定义手围为 "custom"） */
  _selectedSizeLabel: '',
  /**
   * 自定义手围（后端 estimate 接口返回，_selectedSizeLabel === 'custom' 时生效）:
   * 字段与 API.DiyEstimateResult 一致（wrist_size_mm/target_length_mm/max_length_mm/recommend_bead_count 等）
   */
  _customSize: null as any,
  /** 尺码弹窗内待应用的估算结果（点"使用该手围"后写入 _customSize 或命中档位） */
  _pendingEstimate: null as any,
  /** 超出可戴上限的前置提示是否已弹过（回到上限内自动复位，避免每加一颗都 toast） */
  _overLimitNotified: false,
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

      /** 串珠作品：从 design_data 还原珠子与手围档位（material_code 匹配当前素材库，size 契约 §11.4） */
      const restored: any[] = []
      let restoredCustomWristMm = 0
      if (designData && designData.mode === 'beading' && designData.beads) {
        if (designData.size && designData.size.label) {
          if (designData.size.label === 'custom' && Number(designData.size.wrist_size_mm) > 0) {
            /** 自定义手围：契约只存 wrist_size_mm，目标长度需重调 estimate 补齐 */
            restoredCustomWristMm = Number(designData.size.wrist_size_mm)
          } else {
            this._selectedSizeLabel = designData.size.label
          }
        }
        for (const beadRef of designData.beads) {
          const matched = this._allBeads.find((b: any) => b.material_code === beadRef.material_code)
          if (matched) {
            restored.push({ ...matched })
          }
        }
      }
      if (restoredCustomWristMm > 0) {
        await this._restoreCustomSize(restoredCustomWristMm)
      } else {
        this._setupSizing()
      }
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
      /**
       * 素材与分组并行拉取（三端落地方案 拍板 1/16）:
       * 分组名从后端 /material-groups 的 display_name 取（DIY 自有字典），不做本地映射。
       * 分组接口异常不阻断（左侧分类回退用 group_code 原值），素材接口失败才走本地演示兜底。
       */
      const [beadsRes, groupsRes] = await Promise.all([
        API.getDiyTemplateBeads(templateId),
        API.getDiyMaterialGroups()
      ])
      if (!beadsRes.success || !beadsRes.data) {
        this._enterLocalMode(beadsRes.message || '珠子素材加载失败')
        return false
      }
      /** 建立 group_code → display_name 权威映射（后端字典下发） */
      this._groupNameMap = {}
      if (groupsRes.success && Array.isArray(groupsRes.data)) {
        groupsRes.data.forEach((g: API.DiyMaterialGroup) => {
          if (g.display_name) {
            this._groupNameMap[g.group_code] = g.display_name
          }
        })
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

  /**
   * 分组 group_code → 中文名：后端 /material-groups 下发的 display_name 优先（权威），
   * 本地演示模式（无后端字典）回退 LOCAL_GROUP_NAME_MAP，再退原始 group_code。
   */
  _groupLabel(groupCode: string): string {
    return this._groupNameMap[groupCode] || LOCAL_GROUP_NAME_MAP[groupCode] || groupCode
  },

  /**
   * 按素材大类聚合左侧分类（group_code 维度，仅统计该大类下有素材的分组）
   * @param materialType 素材大类（beads/accessories/pendants）
   */
  _categoriesForType(materialType: string): { key: string; label: string }[] {
    const seen: Record<string, boolean> = {}
    const categories: { key: string; label: string }[] = []
    this._allBeads.forEach((b: any) => {
      if ((b.item_type || 'beads') !== materialType) {
        return
      }
      if (!seen[b.category]) {
        seen[b.category] = true
        categories.push({ key: b.category, label: b.categoryLabel })
      }
    })
    return categories
  },

  /** 把 _allBeads 聚合出左侧分类并刷新网格（后端/本地两种数据源共用，数据重载时回到饰品Tab） */
  _applyBeadsToPanel() {
    const categories = this._categoriesForType('beads')
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
    this._customSize = null
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
   * cord_occupy_mm 按与后端 deriveCordOccupyMm 相同规则在演示数据源补齐（bead-data.ts），
   * 生产链路该字段仅由后端派生下发，此处不承担业务口径。
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
   * material_type/meaning/weight/energy/pairing/five_elements 已随接口下发（13.1-A 落库）:
   * 有值则透传展示，未录入(null)则详情行隐藏/五行空态，不做前端默认值。
   */
  _mapBead(b: any): any {
    /** 图片降级链（11.7-1）：珠子网格/手串小图用 w375 档 → public_url（媒体对象为 5 字段最小集） */
    const media = b.image_media || null
    const image = (media && ((media.thumbnails && media.thumbnails.w375) || media.public_url)) || ''
    /** 异形珠判定：后端 bore_orientation ≠ none 即异形（管珠/药片），圆珠为 none */
    const isSpecial = !!b.bore_orientation && b.bore_orientation !== 'none'
    /**
     * 异形珠实拍图"宽:高"比例（11.7-2）：用 image_media.width/height 计算（图已裁透明边），
     * 图片尺寸缺失时回退实物短边/长边比（几何近似），再缺退 1（按圆渲染）
     */
    let imgRatio = 1
    if (media && media.width > 0 && media.height > 0) {
      imgRatio = media.width / media.height
    } else if (b.size_width_mm > 0 && b.size_length_mm > 0) {
      imgRatio = b.size_width_mm / b.size_length_mm
    }
    return {
      /** 后端原始对象引用（镶嵌模式 diyStore.fillSlot 约束校验/渲染需要原始 shape 等字段） */
      raw: b,
      /* 后端原始字段透传（提交/计费/库存/几何用） */
      diy_material_id: b.diy_material_id,
      material_code: b.material_code,
      group_code: b.group_code,
      price_asset_code: b.price_asset_code,
      /** 库存掩码三值（拍板③）：-1 无限 / 0 售罄 / 1 有货，勿依赖精确数量 */
      stock: b.stock,
      /** 素材大类（beads/accessories/pendants，素材类型 Tab 过滤依据；缺省归入珠子） */
      item_type: b.item_type || 'beads',
      /* 异形珠几何（13.1-A 三列透传，bracelet-tray 布局朝向依据） */
      bore_orientation: b.bore_orientation || 'none',
      size_length_mm: b.size_length_mm,
      size_width_mm: b.size_width_mm,
      /**
       * 单颗沿绳占用长度（mm，后端序列化派生字段，拍板 Q3，§11.2）:
       * 长度联动直接累加此字段，前端不按形状分支推算；
       * null = 物理数据不完整，不计入累加并提示"信息完善中"。
       * undefined（后端字段缺失）与 null 同语义归一为 null
       */
      cord_occupy_mm: b.cord_occupy_mm ?? null,
      /* 展示字段 */
      id: b.material_code,
      name: b.display_name,
      category: b.group_code,
      categoryLabel: this._groupLabel(b.group_code),
      diameter: b.diameter,
      sizeText: isSpecial ? `${b.size_width_mm}mmx${b.size_length_mm}mm` : `${b.diameter}mm`,
      price: b.price,
      priceLabel: ASSET_DISPLAY_NAME[b.price_asset_code] || b.price_asset_code,
      /** 形状：异形珠（bore_orientation≠none）走 special 渲染分支，其余按圆珠 */
      shape: isSpecial ? 'special' : 'round',
      /** 异形珠实拍图宽高比（special 渲染用，圆珠为 1） */
      imgRatio,
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

  // ===== 尺码/手围/容量（手围驱动方案：长度为主、颗数兜底；本地模式用 LOCAL_TEMPLATE 同结构） =====

  /**
   * 尺寸入口用语（§11.1 品类差异）:
   * 手链品类（DIY_BRACELET / 档位含 wrist_size_mm）= "手围"；
   * 项链等品类（档位只配 target_length_mm）= "佩戴长度"（§16.3-1 入口文案口径）。
   */
  _resolveSizeTermLabel(): string {
    const template = this._template
    const options = template?.sizing_rules?.size_options || []
    if (template?.category?.category_code === 'DIY_BRACELET') {
      return '手围'
    }
    const hasWrist = options.some((o: any) => Number(o.wrist_size_mm) > 0)
    return hasWrist ? '手围' : '佩戴长度'
  },

  /**
   * 单个尺码档位的手围/目标串长补充文案（后端毫米字段 ÷10 展示 cm，§10.5-3）:
   * 字段缺失时如实返回空串（后端未配置数据，不编造，§7-4）。
   */
  _buildSizeMetaText(option: any, termLabel: string): string {
    const parts: string[] = []
    if (Number(option.wrist_size_mm) > 0) {
      parts.push(`${termLabel}约${(option.wrist_size_mm / 10).toFixed(1)}cm`)
    }
    if (Number(option.target_length_mm) > 0) {
      parts.push(`目标串长约${(option.target_length_mm / 10).toFixed(1)}cm`)
    }
    return parts.join(' · ')
  },

  /** 初始化尺码选项与当前尺码（后端 sizing_rules），并计算颗数容量与自定义估算珠径选项 */
  _setupSizing() {
    const template = this._template
    const options = template?.sizing_rules?.size_options || []
    const termLabel = this._resolveSizeTermLabel()
    /** 自定义估算的主珠径选项：allowed_diameters（后端权威）→ 单值 default_diameter → 空（隐藏估算区） */
    const allowedDiameters: number[] = template?.bead_rules?.allowed_diameters || []
    const defaultDiameter: number = template?.bead_rules?.default_diameter || 0
    const diameterOptions =
      allowedDiameters.length > 0 ? allowedDiameters : defaultDiameter > 0 ? [defaultDiameter] : []
    let diameterIndex = diameterOptions.indexOf(defaultDiameter)
    if (diameterIndex < 0) {
      diameterIndex = 0
    }

    /** 自定义手围模式：尺码列表全部非选中（sizeIndex=-1），展示文案用 _customSize 的手围毫米值 */
    if (this._selectedSizeLabel === 'custom' && this._customSize) {
      this.setData({
        sizeTermLabel: termLabel,
        sizeOptions: options.map((o: any) => ({
          label: o.label,
          display: o.display,
          metaText: this._buildSizeMetaText(o, termLabel)
        })),
        sizeIndex: -1,
        customSizeActive: true,
        customDiameterOptions: diameterOptions,
        customDiameterIndex: diameterIndex,
        selectedSizeDisplay: `自定义 ${termLabel}约${(this._customSize.wrist_size_mm / 10).toFixed(1)}cm`
      })
      this._recalcCapacity()
      return
    }

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
      sizeTermLabel: termLabel,
      sizeOptions: options.map((o: any) => ({
        label: o.label,
        display: o.display,
        metaText: this._buildSizeMetaText(o, termLabel)
      })),
      sizeIndex,
      customSizeActive: false,
      customDiameterOptions: diameterOptions,
      customDiameterIndex: diameterIndex,
      selectedSizeDisplay: options[sizeIndex]?.display || ''
    })
    this._recalcCapacity()
  },

  /**
   * 当前尺寸上下文（长度联动/保存契约的统一取数口径）:
   *   档位模式 — 取当前 size_options 档位的 wrist_size_mm/target_length_mm + 模板级 elastic_margin_mm；
   *   自定义模式 — 取后端 estimate 返回的毫米字段。
   * wristSizeMm 用于 design_data.size 契约（§16.3-4：项链档位无手围时填 target_length_mm，双字段命中）；
   * 后端未配置的字段返回 0（展示层据此隐藏对应文案，不编造默认值）。
   */
  _currentSizeInfo(): {
    label: string
    wristSizeMm: number
    targetLengthMm: number
    maxLengthMm: number
  } {
    if (this._selectedSizeLabel === 'custom' && this._customSize) {
      return {
        label: 'custom',
        wristSizeMm: Number(this._customSize.wrist_size_mm) || 0,
        targetLengthMm: Number(this._customSize.target_length_mm) || 0,
        maxLengthMm: Number(this._customSize.max_length_mm) || 0
      }
    }
    const template = this._template
    const options = template?.sizing_rules?.size_options || []
    const current = options.find((o: any) => o.label === this._selectedSizeLabel)
    if (!current) {
      return { label: this._selectedSizeLabel, wristSizeMm: 0, targetLengthMm: 0, maxLengthMm: 0 }
    }
    const targetLengthMm = Number(current.target_length_mm) || 0
    /** 项链品类档位无手围：契约字段填佩戴长度毫米值（§16.3-4 后端按 target_length_mm 命中） */
    const wristSizeMm = Number(current.wrist_size_mm) || targetLengthMm
    const elasticMarginMm = Number(template?.sizing_rules?.elastic_margin_mm) || 0
    return {
      label: current.label,
      wristSizeMm,
      targetLengthMm,
      /** 可戴上限 = 目标周长 + 弹力余量（两者均为后端数据，缺一则不做上限提示） */
      maxLengthMm: targetLengthMm > 0 && elasticMarginMm > 0 ? targetLengthMm + elasticMarginMm : 0
    }
  },

  /**
   * 当前尺码颗数兜底上限（拍板 Q1：长度为主、颗数退为兜底防呆）:
   *   档位模式 = size_options[].bead_count；自定义手围 = estimate 无档位颗数，返回 0 不限
   *   （自定义模式仍受 capacity_rules.max_beads 全局防呆与后端 confirm 硬校验约束）。
   */
  _capacityForCurrentSize(): number {
    if (this._selectedSizeLabel === 'custom') {
      return 0
    }
    const template = this._template
    const options = template?.sizing_rules?.size_options || []
    const current = options.find((o: any) => o.label === this._selectedSizeLabel)
    if (!current) {
      return 0
    }
    return current.bead_count || 0
  },

  /** 重算颗数容量并刷新已选珠子的占用展示（尺码变化/初始化时调用） */
  _recalcCapacity() {
    const capacityBeads = this._capacityForCurrentSize()
    const capacityLimited = capacityBeads > 0
    /** 尺码变化后目标长度随之变化，超限提示复位重新判定 */
    this._overLimitNotified = false
    this.setData({ capacityBeads, capacityLimited }, () =>
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

  /** 选择尺码档位（后端 size_options 内取值，退出自定义手围模式） */
  onSelectSize(e: any) {
    const index = Number(e.currentTarget.dataset.index)
    const option = this.data.sizeOptions[index]
    if (!option) {
      return
    }
    this._selectedSizeLabel = option.label
    this._customSize = null
    this.setData({
      sizeIndex: index,
      customSizeActive: false,
      selectedSizeDisplay: option.display
    })
    this._recalcCapacity()
  },

  // ===== 自定义手围估算（§3.1 自定义输入 + §3.2 珠径智能算珠，后端 estimate 权威换算） =====

  /** 自定义手围输入（cm，如 "15.5"；输入变化后旧估算结果失效） */
  onCustomWristInput(e: any) {
    this.setData({ customWristInput: e.detail.value, estimateText: '', estimateReady: false })
    this._pendingEstimate = null
  },

  /** 切换估算主珠径（选项来自模板 bead_rules，后端权威数据） */
  onSelectCustomDiameter(e: any) {
    const index = Number(e.currentTarget.dataset.index)
    if (index === this.data.customDiameterIndex) {
      return
    }
    this.setData({ customDiameterIndex: index, estimateText: '', estimateReady: false })
    this._pendingEstimate = null
  },

  /**
   * 调后端估算参考颗数（GET /diy/templates/:id/estimate，拍板 Q2 方案甲）:
   * 前端只做入参合法性检查与结果展示，换算规则完全在后端（§11.8-2 前端不写换算公式）。
   */
  async onEstimateSize() {
    if (this.data.estimating) {
      return
    }
    const termLabel = this.data.sizeTermLabel
    const wristCm = Number(this.data.customWristInput)
    if (!Number.isFinite(wristCm) || wristCm <= 0) {
      wx.showToast({ title: `请输入有效的${termLabel}（cm）`, icon: 'none' })
      return
    }
    const diameter = this.data.customDiameterOptions[this.data.customDiameterIndex]
    if (!diameter) {
      wx.showToast({ title: '该款式暂无可用珠径数据', icon: 'none' })
      return
    }
    /** cm → mm（接口单位统一毫米，§10.5-3） */
    const wristSizeMm = Math.round(wristCm * 10)
    this.setData({ estimating: true })
    try {
      const estimateRes = await API.getDiyEstimate(this.data.templateId, {
        wrist_size_mm: wristSizeMm,
        diameter
      })
      if (!estimateRes.success || !estimateRes.data) {
        this.setData({ estimating: false })
        wx.showToast({ title: estimateRes.message || '估算失败，请稍后重试', icon: 'none' })
        return
      }
      const estimate = estimateRes.data
      this._pendingEstimate = estimate
      /** 展示均为估算值带"约"（§7-1）；可戴范围 = 后端 min_length_mm ~ max_length_mm */
      const targetCm = (estimate.target_length_mm / 10).toFixed(1)
      const minCm = (estimate.min_length_mm / 10).toFixed(1)
      const maxCm = (estimate.max_length_mm / 10).toFixed(1)
      this.setData({
        estimating: false,
        estimateReady: true,
        estimateText: `约需 ${estimate.recommend_bead_count} 颗 ${estimate.diameter}mm 珠 · 目标串长约${targetCm}cm（可戴范围约${minCm}~${maxCm}cm）`
      })
    } catch (err: any) {
      this.setData({ estimating: false })
      /** 后端业务错误码（响应顶层 code）：模板未配置尺寸规则等，如实提示 */
      if (err?.code === 'DIY_SIZING_RULES_MISSING' || err?.code === 'DIY_TEMPLATE_NOT_BEADING') {
        wx.showToast({ title: err.message || '该款式暂不支持手围估算', icon: 'none' })
      } else {
        wx.showToast({ title: '网络异常，估算失败', icon: 'none' })
      }
    }
  },

  /**
   * 应用估算结果（"使用该手围"）:
   * 命中既有档位（matched_size_label）→ 直接选中该档位（颗数兜底/目标长度走档位配置）；
   * 未命中 → 进入自定义手围模式（label='custom'，长度口径用 estimate 毫米字段，颗数兜底不限）。
   */
  onUseEstimate() {
    const estimate = this._pendingEstimate
    if (!estimate) {
      return
    }
    const options = this._template?.sizing_rules?.size_options || []
    const matchedIndex = estimate.matched_size_label
      ? options.findIndex((o: any) => o.label === estimate.matched_size_label)
      : -1
    if (matchedIndex >= 0) {
      this._selectedSizeLabel = options[matchedIndex].label
      this._customSize = null
      this.setData({
        sizeIndex: matchedIndex,
        customSizeActive: false,
        selectedSizeDisplay: options[matchedIndex].display,
        sizeVisible: false
      })
    } else {
      this._selectedSizeLabel = 'custom'
      this._customSize = estimate
      this.setData({
        sizeIndex: -1,
        customSizeActive: true,
        selectedSizeDisplay: `自定义 ${this.data.sizeTermLabel}约${(estimate.wrist_size_mm / 10).toFixed(1)}cm`,
        sizeVisible: false
      })
    }
    this._recalcCapacity()
  },

  /**
   * 还原自定义手围（分享/本地草稿还原时只存了 wrist_size_mm）:
   * 重新调后端 estimate 补齐目标长度/可戴范围口径；失败不阻塞（长度行降级只展示已排长度）。
   */
  async _restoreCustomSize(wristSizeMm: number) {
    const diameter =
      this._template?.bead_rules?.default_diameter ||
      this._template?.bead_rules?.allowed_diameters?.[0] ||
      0
    /** 先落最小可用状态（label=custom + 手围值），估算结果回来后补全目标长度 */
    this._selectedSizeLabel = 'custom'
    this._customSize = { wrist_size_mm: wristSizeMm, target_length_mm: 0, max_length_mm: 0 }
    if (!diameter || !this.data.templateId) {
      this._setupSizing()
      return
    }
    try {
      const estimateRes = await API.getDiyEstimate(this.data.templateId, {
        wrist_size_mm: wristSizeMm,
        diameter
      })
      if (estimateRes.success && estimateRes.data) {
        this._customSize = estimateRes.data
      }
    } catch (_err) {
      /* 估算失败保持最小状态：长度联动降级为只展示已排长度 */
    }
    this._setupSizing()
  },

  // ===== 素材面板 =====

  /**
   * 切换素材类型 Tab（饰品/配饰/吊坠，按后端 diy_materials.item_type 大类过滤）
   * beads 接口默认返回全部大类，切换 Tab 为纯前端过滤；该大类无素材时显示空态提示，
   * 绝不用假素材填充（配饰/吊坠素材由运营在管理台录入后自动出现）。
   */
  onMaterialTypeChange(e: any) {
    const materialType = e.currentTarget.dataset.type as string
    if (materialType === this.data.activeMaterialType) {
      return
    }
    /** 左侧分类按该大类下实际存在的分组重建，默认选中第一个分类 */
    const categories = this._categoriesForType(materialType)
    this.setData(
      {
        activeMaterialType: materialType,
        categories,
        activeCategory: categories[0]?.key || '',
        keyword: ''
      },
      () => this._refreshGroups()
    )
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

  /** 刷新款式组：按素材大类（item_type）+ 当前分类 + 搜索关键词过滤，再按名称聚合 */
  _refreshGroups() {
    const activeType = this.data.activeMaterialType
    const typeLabel = MATERIAL_TYPE_LABELS[activeType] || '素材'
    /** 第一层过滤：素材大类（后端 item_type，缺省归入珠子） */
    const typeBeads = this._allBeads.filter((b: any) => (b.item_type || 'beads') === activeType)
    if (typeBeads.length === 0) {
      /** 该大类暂无素材：如实空态（素材由运营在管理台录入后自动出现），绝不用假素材填充 */
      this.setData({ groups: [], gridEmptyText: `暂无${typeLabel}素材，运营上架后即可选用` })
      return
    }
    const kw = this.data.keyword.trim()
    let list = typeBeads.filter((b: any) => b.category === this.data.activeCategory)
    if (kw) {
      /** 搜索跨分类（限当前大类）：关键词匹配名称 */
      list = typeBeads.filter((b: any) => b.name.indexOf(kw) >= 0)
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
    this.setData({ groups: buildBeadGroups(list), gridEmptyText: `没有匹配的${typeLabel}` }, () =>
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
   * 尝试添加一颗珠子：库存/允许直径/最大颗数/尺码颗数容量四重校验（拍板①颗数制），
   * 满容量弹框引导「更换尺码」或删珠。
   * @returns 是否添加成功
   */
  _tryAddBead(sku: any): boolean {
    /** 校验1: 库存（后端掩码三值：0=售罄；-1=无限；1=有货，拍板③） */
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
    /** 校验3: 全局最大颗数（capacity_rules.max_beads，0=不限） */
    const maxBeads = template?.capacity_rules?.max_beads || 0
    if (maxBeads > 0 && this.data.selectedBeads.length >= maxBeads) {
      wx.showToast({ title: `最多可放 ${maxBeads} 颗珠子`, icon: 'none' })
      return false
    }
    /** 校验4: 尺码颗数容量（已选颗数 < 当前尺码 bead_count；capacityBeads=0 表示后端未给规则，不限容） */
    if (this.data.capacityLimited && this.data.selectedBeads.length >= this.data.capacityBeads) {
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
   * 一键成串（随机搭配）：从可售珠子里随机挑，凑满当前尺码颗数为止（颗数制）。
   * 空态引导用，降低新用户上手门槛。随机为 UX 逻辑，价格/颗数容量均为后端数据；
   * 后端未给颗数规则（不限容）时用前端渲染兜底颗数 12（纯 UX 数量，非业务数据）。
   */
  onRandomFill() {
    const pool = this._allBeads.filter(
      (b: any) => b.stock !== 0 && (b.item_type || 'beads') === 'beads'
    )
    if (pool.length === 0) {
      return
    }
    const maxBeads = this._template?.capacity_rules?.max_beads || 0
    /** 自定义手围模式：优先用后端 estimate 的参考颗数（recommend_bead_count） */
    const recommendCount =
      this._selectedSizeLabel === 'custom' && this._customSize
        ? Number(this._customSize.recommend_bead_count) || 0
        : 0
    /** 目标颗数：尺码 bead_count → estimate 参考颗数 → 全局 max_beads → UX 兜底 12 颗 */
    let targetCount = this.data.capacityLimited
      ? this.data.capacityBeads
      : recommendCount || maxBeads || 12
    if (maxBeads > 0 && maxBeads < targetCount) {
      targetCount = maxBeads
    }
    const picked: any[] = []
    for (let i = 0; i < targetCount; i++) {
      const sku = pool[Math.floor(Math.random() * pool.length)]
      picked.push({ ...sku })
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

  /** 尺码弹窗内"查看测量方法"：关弹窗并打开教程的「量手围」Tab（前端静态图文，§3.1 测量引导） */
  onOpenMeasureGuide() {
    this.setData({ sizeVisible: false, guideVisible: true, guideTabIndex: 1 })
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
  _buildWorkData(): API.DiyWorkCreateRequest {
    const workData: API.DiyWorkCreateRequest = {
      diy_template_id: this.data.templateId,
      work_name: `我的${this.data.templateName}`,
      design_data: { mode: 'beading' }
    }
    /**
     * 草稿更新契约（对接文档 3.3-⑨）：已保存过的作品携带 diy_work_id = 更新该草稿，
     * 不传 = 新建草稿。避免重复点击"保存草稿"在后端落多条重复草稿。
     */
    if (this._currentWorkId) {
      workData.diy_work_id = this._currentWorkId
    }
    if (this.data.isSlotMode) {
      /** 镶嵌模式：以 slot_id 为 key 记录每槽填充的 material_code，空槽不放 key（对接文档 4.5） */
      const fillings: Record<string, { material_code: string }> = {}
      for (const [slotId, bead] of Object.entries(diyStore.slotFillings)) {
        fillings[slotId] = { material_code: (bead as any).material_code }
      }
      workData.design_data = { mode: 'slots', fillings }
    } else {
      /** 串珠模式：position = 绳上排列顺序（对接文档 4.5 契约字段，数组顺序即排列顺序） */
      const beads = this.data.selectedBeads.map((b: any, i: number) => ({
        position: i,
        material_code: b.material_code
      }))
      workData.design_data = { mode: 'beading', beads }
      /**
       * 手围档位契约（§11.4/§16.3-4）：size: { label, wrist_size_mm } 是后端 confirm 长度硬校验依据；
       * 项链品类 wrist_size_mm 已在 _currentSizeInfo 中按佩戴长度口径填充。
       * 档位未配置毫米数据（wristSizeMm=0）时不携带 size，后端按契约跳过长度校验、仅颗数兜底
       */
      const sizeInfo = this._currentSizeInfo()
      if (sizeInfo.wristSizeMm > 0) {
        workData.design_data.size = {
          label: sizeInfo.label,
          wrist_size_mm: sizeInfo.wristSizeMm
        }
      }
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
        content:
          '当前展示的是本地演示数据（未接入后端），暂不能提交订单。重新进入页面即可重试连接后端。',
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

    /** 颗数兜底容量占用（拍板 Q1 长度为主、颗数兜底）：进度/满/快满按"已选颗数 / 尺码 bead_count"计算 */
    const count = nextSelected.length
    const capacityBeads = this.data.capacityBeads
    const capacityLimited = this.data.capacityLimited
    const percent = capacityLimited ? Math.min(100, Math.round((count / capacityBeads) * 100)) : 0
    const isFull = capacityLimited && count >= capacityBeads
    /** 快满阈值：占用 ≥85% 且未满时，容量条变警示色 */
    const nearFull = capacityLimited && !isFull && percent >= 85

    /** 可提交：颗数 ≥ capacity_rules.min_beads（对齐 diyStore.canSubmit） */
    const minBeads = this._template?.capacity_rules?.min_beads || 1
    const canSubmit = count >= minBeads

    /** 统计每个珠子 id 的已选数量（网格角标） */
    const countMap: Record<string, number> = {}
    nextSelected.forEach(b => {
      countMap[b.id] = (countMap[b.id] || 0) + 1
    })

    /**
     * 长度实时联动（§3.3 三段：已排长度 / 目标长度 / 差值）:
     * 已排 = 累加后端 cord_occupy_mm；目标 = 当前档位 target_length_mm（或自定义估算值）；
     * 所有文案带"约"（估算值，§7-1），mm ÷10 保留 1 位小数展示 cm（§10.5-3）
     */
    const lengthStats = this._lengthStats(nextSelected)
    const usedMm = lengthStats.totalMm
    const sizeInfo = this._currentSizeInfo()
    const targetLengthMm = sizeInfo.targetLengthMm
    let lengthDiffText = ''
    let lengthOver = false
    if (targetLengthMm > 0 && count > 0) {
      const diffMm = targetLengthMm - usedMm
      if (diffMm >= 0) {
        lengthDiffText = `还差约${(diffMm / 10).toFixed(1)}cm`
      } else {
        lengthDiffText = `已超出约${(-diffMm / 10).toFixed(1)}cm`
        lengthOver = true
      }
    }

    /** 重量实时联动（§3.4）：累加后端 weight，缺失素材不计入并如实标注 */
    const weightStats = this._weightStats(nextSelected)

    /** 物理数据不完整标注文案（TS 预计算，避免 WXML 跨行表达式） */
    const noteParts: string[] = []
    if (lengthStats.missingCount > 0) {
      noteParts.push('部分素材信息完善中，未计入串长')
    }
    if (count > 0 && weightStats.missingCount > 0) {
      noteParts.push('部分素材暂无克重')
    }

    /** 超出可戴上限（target + elastic_margin）的前置友好提示：不硬拦截（§7-3），最终以后端校验为准 */
    if (sizeInfo.maxLengthMm > 0 && usedMm > sizeInfo.maxLengthMm) {
      if (!this._overLimitNotified) {
        this._overLimitNotified = true
        wx.showToast({
          title: `当前偏长，建议换大${this.data.sizeTermLabel}或减珠`,
          icon: 'none',
          duration: 2500
        })
      }
    } else {
      this._overLimitNotified = false
    }

    /** 绳圈渲染周长（纯渲染几何，非业务校验）：优先目标周长，随已排长度自适应放大 */
    const defaultDiameter = this._template?.bead_rules?.default_diameter || 8
    let trayCapacityMm: number
    if (targetLengthMm > 0) {
      trayCapacityMm = Math.max(targetLengthMm, Math.round(usedMm) + 10)
    } else if (capacityLimited) {
      trayCapacityMm = Math.max(capacityBeads * defaultDiameter, Math.round(usedMm) + 10)
    } else {
      trayCapacityMm = Math.max(150, Math.round(usedMm) + 20)
    }

    this.setData({
      selectedBeads: nextSelected,
      costText,
      beadCount: count,
      capacityPercent: percent,
      isFull,
      nearFull,
      canSubmit,
      usedCountMap: countMap,
      capacityTip: isFull ? '已排满，删除珠子或换大尺码可继续' : '',
      fillHint: this._buildFillHint(nextSelected, capacityBeads, isFull),
      canUndo: this._histIndex > 0,
      canRedo: this._histIndex < this._history.length - 1,
      /** 数据源变化时组件会清空多选，这里同步复位批量删除栏 */
      selectedCount: 0,
      trayCapacityMm,
      /* 长度/重量联动展示（估算值文案统一带"约"） */
      showLengthRow: count > 0,
      usedLengthText: count > 0 ? `约${(usedMm / 10).toFixed(1)}cm` : '',
      targetLengthText: targetLengthMm > 0 ? `约${(targetLengthMm / 10).toFixed(1)}cm` : '',
      lengthDiffText,
      lengthOver,
      weightText: weightStats.totalG > 0 ? `约${weightStats.totalG.toFixed(1)}g` : '',
      physicalNote: noteParts.join('；')
    })
    this._refreshGroupCounts(countMap)
  },

  /**
   * 生成实时数量反馈文案（结合后端 min_beads 规则与剩余可加颗数的引导，颗数制）。
   * @param beads 已选珠子
   * @param capacityBeads 当前尺码颗数容量（0=不限容）
   * @param isFull 是否已满
   * @returns 引导文案(空态/未达最少颗数/快满/已满各不同)
   */
  _buildFillHint(beads: any[], capacityBeads: number, isFull: boolean): string {
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
    const remainCount = capacityBeads - beads.length
    if (remainCount <= 2) {
      return `就快满了，还能再加 ${remainCount} 颗`
    }
    return `还能再加 ${remainCount} 颗`
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
   * 保存草稿到本地（按模板隔离 + 7天TTL；存 material_code 列表 + 尺码 + 自定义手围毫米值）
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
        /** 自定义手围模式（label='custom'）需额外记手围毫米值，还原时重调 estimate 补齐口径 */
        customWristMm:
          this._selectedSizeLabel === 'custom' && this._customSize
            ? Number(this._customSize.wrist_size_mm) || 0
            : 0,
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
      if (draft.sizeLabel === 'custom' && Number(draft.customWristMm) > 0) {
        /** 自定义手围草稿：异步重调 estimate 补齐目标长度（失败降级只展示已排长度，不阻塞还原） */
        this._restoreCustomSize(Number(draft.customWristMm))
      } else if (draft.sizeLabel) {
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

  /**
   * 已排长度统计（mm，长度联动权威口径，§11.8-3）:
   * 直接累加后端 beads 接口下发的 cord_occupy_mm 派生字段（拍板 Q3），
   * 前端不按形状分支推算（消除业务逻辑下沉，§13-3）；
   * cord_occupy_mm 为 null 的素材不计入累加并计数（提示"部分素材信息完善中"，§10.5-2）。
   * @param beads 已选珠子
   * @returns totalMm 已排长度合计 / missingCount 缺沿绳占用数据的颗数
   */
  _lengthStats(beads: any[]): { totalMm: number; missingCount: number } {
    let totalMm = 0
    let missingCount = 0
    beads.forEach(bead => {
      const occupy = bead.cord_occupy_mm
      if (typeof occupy === 'number' && occupy > 0) {
        totalMm += occupy
      } else {
        missingCount += 1
      }
    })
    return { totalMm, missingCount }
  },

  /**
   * 累计重量统计（g，重量联动 §3.4）:
   * 累加后端 weight 字段；weight 为 null 的素材不计入并计数（提示"部分素材暂无克重"），
   * 前端不按体积估算兜底（避免与实物出入，§3.4）。
   * @param beads 已选珠子
   * @returns totalG 克重合计（1位小数原始值） / missingCount 缺克重的颗数
   */
  _weightStats(beads: any[]): { totalG: number; missingCount: number } {
    let totalG = 0
    let missingCount = 0
    beads.forEach(bead => {
      const beadWeight = bead.weight
      if (typeof beadWeight === 'number' && beadWeight > 0) {
        totalG += beadWeight
      } else {
        missingCount += 1
      }
    })
    return { totalG, missingCount }
  }
})
