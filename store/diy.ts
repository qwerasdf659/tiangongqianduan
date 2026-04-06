/**
 * DIY饰品设计引擎 - MobX Store
 *
 * 管理内容: 当前模板、已选珠子、槽位填充、撤销/重做、缓存
 * 双模式: 串珠模式（circle/ellipse/arc/line） + 镶嵌模式（slots）
 *
 * 字段命名约定:
 *   前端业务逻辑: camelCase
 *   API交互字段: snake_case（直接使用后端返回的字段名，不做映射）
 *
 * 后端数据对齐:
 *   模板 → diy_templates 表（diy_template_id, display_name, layout, bead_rules, sizing_rules, capacity_rules）
 *   珠子 → diy_materials 表（diy_material_id, material_code, display_name, group_code, diameter, shape, price）
 *   材料分组 → asset_group_defs 表（group_code: red/orange/yellow/green/blue/purple）
 *
 * @file 天工餐厅积分系统 - DIY Store
 * @version 2.0.0
 * @since 2026-04-03
 */

import { action, observable } from 'mobx-miniprogram'

/** 虚拟资产代码常量（消除 'star_stone' 字符串字面量硬编码） */
const diyAssetCodes = require('../config/asset-codes')

/** 撤销/重做快照（按模式区分） */
interface Snapshot {
  /** 模式标识 */
  mode: 'beads' | 'slots'
  /** 串珠模式: 已选珠子列表 */
  selectedBeads?: API.DiyBead[]
  /** 串珠模式: 当前尺码标识 */
  selectedSizeLabel?: string
  /** 镶嵌模式: 槽位填充数据 */
  slotFillings?: Record<string, API.DiyBead>
}

/**
 * 本地缓存数据结构
 * 缓存Key: DIY_DRAFT_{diy_template_id}
 * 写入时机: 每次 addBead/removeBead/fillSlot/clearSlot 后自动写入
 * 恢复时机: 进入设计页 onLoad 时检查缓存
 * 清除时机: 清空设计 / 缓存过期 / 成功下单后
 */
interface DraftCache {
  /** 数据版本号（不匹配则丢弃） */
  version: number
  /** 模式标识 */
  mode: 'beads' | 'slots'
  /** 模板主键 */
  templateId: number
  /** 串珠模式: 当前尺码标识 */
  selectedSizeLabel?: string
  /** 串珠模式: 珠子列表 */
  beads?: {
    diy_material_id: number
    material_code: string
    display_name: string
    diameter: number
    price: number
    shape: string
    group_code: string
  }[]
  /** 镶嵌模式: 槽位填充 */
  slotFillings?: Record<
    string,
    {
      diy_material_id: number
      material_code: string
      display_name: string
      diameter: number
      price: number
      shape: string
      group_code: string
    }
  >
  /** 最后编辑时间戳 */
  updatedAt: number
  /** 过期时间 = updatedAt + 7天 */
  expiresAt: number
}

/** 缓存版本号（修改缓存结构时递增） */
const CACHE_VERSION = 5
/** 缓存有效期: 7天 */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
/** 撤销栈最大深度 */
const MAX_UNDO_STACK = 30

/**
 * 从模板layout中获取槽位定义列表
 * 后端数据: template.layout.slot_definitions（不是 .params.slots）
 */
function getSlotDefinitions(template: API.DiyTemplate | null): API.DiySlotDefinition[] {
  if (!template || !template.layout) {
    return []
  }
  return (template.layout as any).slot_definitions || []
}

/**
 * 获取可用珠子直径列表（mm）
 * 后端数据: template.bead_rules.allowed_diameters
 */
function getAllowedDiameters(template: API.DiyTemplate | null): number[] {
  return template?.bead_rules?.allowed_diameters || []
}

/**
 * 获取尺码选项列表
 * 后端数据: template.sizing_rules.size_options
 */
function getSizeOptions(template: API.DiyTemplate | null): API.DiySizeOption[] {
  return template?.sizing_rules?.size_options || []
}

/**
 * 获取默认尺码
 * 后端数据: template.sizing_rules.default_size
 */
function getDefaultSize(template: API.DiyTemplate | null): string {
  return template?.sizing_rules?.default_size || ''
}

/**
 * 根据尺码标识获取对应珠子数量
 * 后端数据: sizing_rules.size_options[].bead_count
 */
function getBeadCountForSize(template: API.DiyTemplate | null, sizeLabel: string): number {
  const options = getSizeOptions(template)
  const found = options.find(o => o.label === sizeLabel)
  return found?.bead_count || 0
}

export const diyStore = observable({
  // ===== 通用状态 =====

  /** 当前款式模板（后端 diy_templates 表数据） */
  currentTemplate: null as API.DiyTemplate | null,

  /** 当前激活的材料分组 code（对应 asset_group_defs.group_code，如 "red"/"blue"） */
  activeGroupCode: '' as string,

  /** 材料分组列表（后端 GET /api/v4/diy/material-groups） */
  materialGroups: [] as API.DiyMaterialGroup[],

  /** 当前分组下的珠子列表（后端 GET /api/v4/diy/templates/:id/beads） */
  currentBeads: [] as API.DiyBead[],

  /** 全量珠子列表（一次性加载该模板所有可用珠子） */
  allBeads: [] as API.DiyBead[],

  /** 撤销栈（Snapshot快照，记录每次操作前的完整状态） */
  undoStack: [] as Snapshot[],

  /** 重做栈（撤销后可重做恢复） */
  redoStack: [] as Snapshot[],

  // ===== 串珠模式专用 =====

  /** 当前选择的尺码标识（如 "S"/"M"/"L"，对应 sizing_rules.size_options[].label） */
  selectedSizeLabel: '' as string,

  /** 已选珠子列表（有序，支持调整顺序） */
  selectedBeads: [] as API.DiyBead[],

  /** 预览区选中的珠子索引集合（多选删除用） */
  highlightedIndices: [] as number[],

  // ===== 镶嵌模式专用 =====

  /** 槽位填充状态（slot_id → DiyBead），空槽位不在此Map中 */
  slotFillings: {} as Record<string, API.DiyBead>,

  /** 当前激活的槽位ID（用户点击槽位后设置，选宝石时填入此槽位） */
  activeSlotId: '' as string,

  // ===== 计算属性 =====

  /** 是否为镶嵌模式（layout.shape === 'slots'） */
  get isSlotMode(): boolean {
    return this.currentTemplate?.layout?.shape === 'slots'
  },

  /** 已选珠子直径之和（串珠模式，用于容量校验） */
  get totalDiameter(): number {
    return this.selectedBeads.reduce((sum: number, b: API.DiyBead) => sum + b.diameter, 0)
  },

  /** 当前尺码对应的建议珠子数量（串珠模式，用于 UI 展示） */
  get currentBeadCount(): number {
    return getBeadCountForSize(this.currentTemplate, this.selectedSizeLabel)
  },

  /**
   * 当前尺码可容纳的最大直径之和（串珠模式）
   * PRD公式: 所有珠子直径之和 ≤ 尺寸(mm) - 弹性余量
   *
   * 后端数据:
   *   sizing_rules.size_options[].circumference_mm — 尺寸周长（mm）
   *   bead_rules.margin — 弹性余量（默认10mm）
   *
   * 如果后端未提供 circumference_mm，降级为 bead_count * default_diameter 估算
   */
  get maxDiameter(): number {
    const template = this.currentTemplate
    if (!template) {
      return 0
    }
    const sizeOptions = getSizeOptions(template)
    const currentOption = sizeOptions.find(o => o.label === this.selectedSizeLabel)
    /* 优先使用后端提供的周长值（mm） */
    if (currentOption && (currentOption as any).circumference_mm) {
      const margin = template.bead_rules?.margin || 10
      return (currentOption as any).circumference_mm - margin
    }
    /* 降级: bead_count * default_diameter */
    const count = currentOption?.bead_count || 0
    const defaultDiameter = template.bead_rules?.default_diameter || 8
    return count * defaultDiameter
  },

  /** 剩余可用空间 = 最大直径之和 - 已用直径之和（串珠模式） */
  get remainingSpace(): number {
    return this.maxDiameter - this.totalDiameter
  },

  /** 已填入宝石的槽位数（镶嵌模式） */
  get filledSlotCount(): number {
    return Object.keys(this.slotFillings).length
  },

  /** 总槽位数（镶嵌模式） */
  get totalSlotCount(): number {
    return getSlotDefinitions(this.currentTemplate).length
  },

  /** 下一个空槽位ID（按模板slots数组顺序查找第一个未填充的） */
  get nextEmptySlotId(): string {
    const slots = getSlotDefinitions(this.currentTemplate)
    for (const s of slots) {
      if (!this.slotFillings[s.slot_id]) {
        return s.slot_id
      }
    }
    return ''
  },

  /** 所有required槽位是否已填充（结算校验用） */
  get requiredSlotsFilled(): boolean {
    const slots = getSlotDefinitions(this.currentTemplate)
    return slots
      .filter((s: API.DiySlotDefinition) => s.required)
      .every((s: API.DiySlotDefinition) => !!this.slotFillings[s.slot_id])
  },

  /** 总价（串珠: sum(selectedBeads.price)，镶嵌: sum(slotFillings.values().price)） */
  get totalPrice(): number {
    if (this.isSlotMode) {
      return Object.values(this.slotFillings).reduce(
        (sum: number, b: API.DiyBead) => sum + b.price,
        0
      )
    }
    return this.selectedBeads.reduce((sum: number, b: API.DiyBead) => sum + b.price, 0)
  },

  /** 是否可撤销 */
  get canUndo(): boolean {
    return this.undoStack.length > 0
  },

  /** 是否可重做 */
  get canRedo(): boolean {
    return this.redoStack.length > 0
  },

  /**
   * 是否可提交
   * 串珠模式: 珠子数 >= min_beads
   * 镶嵌模式: 所有required槽位已填充
   */
  get canSubmit(): boolean {
    if (!this.currentTemplate) {
      return false
    }
    if (this.isSlotMode) {
      return this.requiredSlotsFilled
    }
    const minBeads = this.currentTemplate.capacity_rules?.min_beads || 1
    return this.selectedBeads.length >= minBeads
  },

  /**
   * 尺寸类型标签（串珠模式，从模板 sizing_rules 获取）
   * 如 "手围"/"颈围"/"指围"，用于设计页 UI 展示
   * 后端数据: sizing_rules.size_options[].display 中提取，或直接取 sizing_rules.label
   */
  get sizeLabel(): string {
    const template = this.currentTemplate
    if (!template || this.isSlotMode) {
      return ''
    }
    /* 优先使用 sizing_rules.label（后端直接提供的尺寸类型标签） */
    if ((template.sizing_rules as any)?.label) {
      return (template.sizing_rules as any).label
    }
    /* 降级: 根据分类推断 */
    const categoryCode = (template as any).category?.category_code || ''
    if (categoryCode === 'DIY_BRACELET') {
      return '手围'
    }
    if (categoryCode === 'DIY_NECKLACE') {
      return '颈围'
    }
    if (categoryCode === 'DIY_RING') {
      return '指围'
    }
    return '尺寸'
  },

  /**
   * 当前激活槽位的约束信息（镶嵌模式）
   * 用于素材列表过滤: 不匹配约束的宝石灰显不可选
   * 返回 null 表示无激活槽位或非镶嵌模式
   */
  get activeSlotConstraints(): {
    allowed_diameters: number[]
    allowed_shapes: string[]
    allowed_group_codes: string[]
  } | null {
    if (!this.isSlotMode || !this.activeSlotId) {
      return null
    }
    const slots = getSlotDefinitions(this.currentTemplate)
    const slot = slots.find((s: API.DiySlotDefinition) => s.slot_id === this.activeSlotId)
    if (!slot) {
      return null
    }
    return {
      allowed_diameters: slot.allowed_diameters || [],
      allowed_shapes: slot.allowed_shapes || [],
      allowed_group_codes: slot.allowed_group_codes || []
    }
  },

  /**
   * 当前款式的专属材料分组列表（从 materialGroups 中按模板 material_group_codes 过滤）
   * 空数组 material_group_codes 表示不限制，返回全部分组
   * 用于设计页分组 Tab 展示
   */
  get availableGroups(): API.DiyMaterialGroup[] {
    const groupCodes = this.currentTemplate?.material_group_codes || []
    if (groupCodes.length === 0) {
      return this.materialGroups
    }
    return this.materialGroups.filter((g: API.DiyMaterialGroup) =>
      groupCodes.includes(g.group_code)
    )
  },

  // ===== 通用方法 =====

  /**
   * 设置款式模板（从款式选择页传入）
   * 根据 layout.shape 初始化对应模式状态
   */
  setTemplate: action(function (this: any, template: API.DiyTemplate) {
    this.currentTemplate = template
    this.undoStack = []
    this.redoStack = []
    this.highlightedIndices = []
    this.allBeads = []
    this.currentBeads = []

    if (template.layout?.shape === 'slots') {
      /* 镶嵌模式初始化 */
      this.slotFillings = {}
      const slots = getSlotDefinitions(template)
      this.activeSlotId = slots[0]?.slot_id || ''
      this.selectedBeads = []
      this.selectedSizeLabel = ''
    } else {
      /* 串珠模式初始化 */
      this.selectedSizeLabel = getDefaultSize(template)
      this.selectedBeads = []
      this.slotFillings = {}
      this.activeSlotId = ''
    }

    /* 设置默认激活的材料分组 */
    const groupCodes = template.material_group_codes || []
    this.activeGroupCode = groupCodes.length > 0 ? groupCodes[0] : ''
  }),

  /** 设置材料分组列表（来自 GET /api/v4/diy/material-groups 或从模板 material_group_codes 构建） */
  setMaterialGroups: action(function (this: any, groups: API.DiyMaterialGroup[]) {
    this.materialGroups = groups
  }),

  /** 设置全量珠子列表（从 GET /api/v4/diy/templates/:id/beads 获取） */
  setAllBeads: action(function (this: any, beads: API.DiyBead[]) {
    this.allBeads = beads
    /* 按当前激活分组过滤 */
    this.currentBeads = this.activeGroupCode
      ? beads.filter((b: API.DiyBead) => b.group_code === this.activeGroupCode)
      : beads
  }),

  /** 切换激活的材料分组（点击分组Tab时触发） */
  setActiveGroupCode: action(function (this: any, groupCode: string) {
    this.activeGroupCode = groupCode
    /* 从全量列表过滤 */
    this.currentBeads = groupCode
      ? this.allBeads.filter((b: API.DiyBead) => b.group_code === groupCode)
      : this.allBeads
  }),

  /** 推入撤销快照（每次操作前调用） */
  _pushUndo: action(function (this: any) {
    const snapshot: Snapshot = this.isSlotMode
      ? { mode: 'slots', slotFillings: { ...this.slotFillings } }
      : {
          mode: 'beads',
          selectedBeads: [...this.selectedBeads],
          selectedSizeLabel: this.selectedSizeLabel
        }

    this.undoStack = [...this.undoStack.slice(-MAX_UNDO_STACK + 1), snapshot]
    this.redoStack = []
  }),

  /** 撤销：从 undoStack 弹出恢复，当前状态推入 redoStack */
  undo: action(function (this: any) {
    if (this.undoStack.length === 0) {
      return
    }
    const stack = [...this.undoStack]
    const snapshot = stack.pop()!
    this.undoStack = stack

    /* 当前状态存入重做栈 */
    const current: Snapshot =
      snapshot.mode === 'slots'
        ? { mode: 'slots', slotFillings: { ...this.slotFillings } }
        : {
            mode: 'beads',
            selectedBeads: [...this.selectedBeads],
            selectedSizeLabel: this.selectedSizeLabel
          }
    this.redoStack = [...this.redoStack, current]

    /* 恢复快照状态 */
    if (snapshot.mode === 'slots') {
      this.slotFillings = snapshot.slotFillings || {}
    } else {
      this.selectedBeads = snapshot.selectedBeads || []
      this.selectedSizeLabel = snapshot.selectedSizeLabel || ''
    }
    this.highlightedIndices = []
  }),

  /** 重做：从 redoStack 弹出恢复，当前状态推入 undoStack */
  redo: action(function (this: any) {
    if (this.redoStack.length === 0) {
      return
    }
    const stack = [...this.redoStack]
    const snapshot = stack.pop()!
    this.redoStack = stack

    const current: Snapshot =
      snapshot.mode === 'slots'
        ? { mode: 'slots', slotFillings: { ...this.slotFillings } }
        : {
            mode: 'beads',
            selectedBeads: [...this.selectedBeads],
            selectedSizeLabel: this.selectedSizeLabel
          }
    this.undoStack = [...this.undoStack, current]

    if (snapshot.mode === 'slots') {
      this.slotFillings = snapshot.slotFillings || {}
    } else {
      this.selectedBeads = snapshot.selectedBeads || []
      this.selectedSizeLabel = snapshot.selectedSizeLabel || ''
    }
    this.highlightedIndices = []
  }),

  /** 清空设计（串珠: 清空selectedBeads，镶嵌: 清空slotFillings） */
  clearDesign: action(function (this: any) {
    this._pushUndo()
    if (this.isSlotMode) {
      this.slotFillings = {}
      const slots = getSlotDefinitions(this.currentTemplate)
      this.activeSlotId = slots[0]?.slot_id || ''
    } else {
      this.selectedBeads = []
    }
    this.highlightedIndices = []
  }),

  // ===== 串珠模式方法 =====

  /**
   * 添加珠子（含容量校验）
   * PRD公式: 所有珠子直径之和 ≤ 尺寸(mm) - 弹性余量
   * 同时校验: 珠子数量不超过 bead_count 上限、直径在允许范围内
   * @returns true=添加成功, false=容量超限或直径不允许
   */
  addBead: action(function (this: any, bead: API.DiyBead): boolean {
    if (this.isSlotMode) {
      return false
    }
    /* 直径可用性校验 */
    const allowedDiameters = getAllowedDiameters(this.currentTemplate)
    if (allowedDiameters.length > 0 && !allowedDiameters.includes(bead.diameter)) {
      return false
    }
    /* 容量校验1: 珠子数量不超过 bead_count 上限 */
    const maxCount = this.currentBeadCount
    if (maxCount > 0 && this.selectedBeads.length >= maxCount) {
      return false
    }
    /* 容量校验2: 直径之和不超过可用周长（PRD公式） */
    if (this.maxDiameter > 0 && this.totalDiameter + bead.diameter > this.maxDiameter) {
      return false
    }
    this._pushUndo()
    this.selectedBeads = [...this.selectedBeads, bead]
    return true
  }),

  /** 删除指定位置珠子 */
  removeBead: action(function (this: any, index: number) {
    if (index < 0 || index >= this.selectedBeads.length) {
      return
    }
    this._pushUndo()
    const arr = [...this.selectedBeads]
    arr.splice(index, 1)
    this.selectedBeads = arr
    this.highlightedIndices = []
  }),

  /** 批量删除选中珠子（多选删除） */
  removeSelectedBeads: action(function (this: any) {
    if (this.highlightedIndices.length === 0) {
      return
    }
    this._pushUndo()
    const indices = new Set(this.highlightedIndices)
    this.selectedBeads = this.selectedBeads.filter((_: any, i: number) => !indices.has(i))
    this.highlightedIndices = []
  }),

  /** 调整珠子顺序（串珠模式） */
  moveBead: action(function (this: any, fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) {
      return
    }
    this._pushUndo()
    const arr = [...this.selectedBeads]
    const [item] = arr.splice(fromIndex, 1)
    arr.splice(toIndex, 0, item)
    this.selectedBeads = arr
  }),

  /** 切换珠子选中状态（支持多选） */
  toggleBeadSelection: action(function (this: any, index: number) {
    const set = new Set(this.highlightedIndices)
    if (set.has(index)) {
      set.delete(index)
    } else {
      set.add(index)
    }
    this.highlightedIndices = Array.from(set)
  }),

  /** 清空选中状态 */
  clearSelection: action(function (this: any) {
    this.highlightedIndices = []
  }),

  /** 修改尺码（如 "S"/"M"/"L"，对应 sizing_rules.size_options） */
  setSize: action(function (this: any, sizeLabel: string) {
    this.selectedSizeLabel = sizeLabel
  }),

  // ===== 镶嵌模式方法 =====

  /** 设置当前激活槽位（用户点击预览区槽位时触发） */
  setActiveSlot: action(function (this: any, slotId: string) {
    this.activeSlotId = slotId
  }),

  /**
   * 填入宝石到槽位（含三重约束校验）
   * 校验: allowedDiameters + allowedShapes + allowedGroupCodes
   * 填入后自动将 activeSlotId 移到下一个空槽位
   *
   * @param bead - 待填入的珠子/宝石
   * @param slotId - 目标槽位ID（不传时优先 activeSlotId，其次 nextEmptySlotId）
   * @returns true=填入成功, false=约束不匹配
   */
  fillSlot: action(function (this: any, bead: API.DiyBead, slotId?: string): boolean {
    const targetSlotId = slotId || this.activeSlotId || this.nextEmptySlotId
    if (!targetSlotId) {
      return false
    }

    const slots = getSlotDefinitions(this.currentTemplate)
    const slot = slots.find((s: API.DiySlotDefinition) => s.slot_id === targetSlotId)
    if (!slot) {
      return false
    }

    /* 约束1: 直径校验 */
    if (
      slot.allowed_diameters &&
      slot.allowed_diameters.length > 0 &&
      !slot.allowed_diameters.includes(bead.diameter)
    ) {
      return false
    }
    /* 约束2: 形状校验 */
    if (
      slot.allowed_shapes &&
      slot.allowed_shapes.length > 0 &&
      !slot.allowed_shapes.includes(bead.shape)
    ) {
      return false
    }
    /* 约束3: 分组校验（allowed_group_codes） */
    if (
      slot.allowed_group_codes &&
      slot.allowed_group_codes.length > 0 &&
      !slot.allowed_group_codes.includes(bead.group_code)
    ) {
      return false
    }

    this._pushUndo()
    this.slotFillings = { ...this.slotFillings, [targetSlotId]: bead }

    /* 自动移到下一个空槽位 */
    const nextEmpty = slots.find(
      (s: API.DiySlotDefinition) => s.slot_id !== targetSlotId && !this.slotFillings[s.slot_id]
    )
    this.activeSlotId = nextEmpty ? nextEmpty.slot_id : targetSlotId

    return true
  }),

  /** 清空指定槽位的宝石 */
  clearSlot: action(function (this: any, slotId: string) {
    if (!this.slotFillings[slotId]) {
      return
    }
    this._pushUndo()
    const next = { ...this.slotFillings }
    delete next[slotId]
    this.slotFillings = next
    this.activeSlotId = slotId
  }),

  /** 交换两个槽位的宝石（长按拖拽触发） */
  swapSlots: action(function (this: any, slotIdA: string, slotIdB: string) {
    if (slotIdA === slotIdB) {
      return
    }
    this._pushUndo()
    const next = { ...this.slotFillings }
    const a = next[slotIdA]
    const b = next[slotIdB]
    if (a) {
      next[slotIdB] = a
    } else {
      delete next[slotIdB]
    }
    if (b) {
      next[slotIdA] = b
    } else {
      delete next[slotIdA]
    }
    this.slotFillings = next
  }),

  // ===== 缓存方法 =====

  /** 保存到本地缓存（每次珠子增删/槽位填充后自动调用） */
  saveToCache: action(function (this: any) {
    if (!this.currentTemplate) {
      return
    }
    const templateId = this.currentTemplate.diy_template_id
    const now = Date.now()
    const cache: DraftCache = {
      version: CACHE_VERSION,
      mode: this.isSlotMode ? 'slots' : 'beads',
      templateId,
      updatedAt: now,
      expiresAt: now + CACHE_TTL
    }

    if (cache.mode === 'beads') {
      cache.selectedSizeLabel = this.selectedSizeLabel
      cache.beads = this.selectedBeads.map((b: API.DiyBead) => ({
        diy_material_id: b.diy_material_id,
        material_code: b.material_code,
        display_name: b.display_name,
        diameter: b.diameter,
        price: b.price,
        shape: b.shape,
        group_code: b.group_code
      }))
    } else {
      const fillings: DraftCache['slotFillings'] = {}
      for (const [slotId, b] of Object.entries(this.slotFillings)) {
        const bead = b as API.DiyBead
        fillings[slotId] = {
          diy_material_id: bead.diy_material_id,
          material_code: bead.material_code,
          display_name: bead.display_name,
          diameter: bead.diameter,
          price: bead.price,
          shape: bead.shape,
          group_code: bead.group_code
        }
      }
      cache.slotFillings = fillings
    }

    try {
      wx.setStorageSync(`DIY_DRAFT_${templateId}`, JSON.stringify(cache))
    } catch (_e) {
      /* 存储异常不影响主流程 */
    }
  }),

  /**
   * 从本地缓存恢复
   * @returns true=恢复成功, false=无缓存或已过期
   */
  restoreFromCache: action(function (this: any): boolean {
    if (!this.currentTemplate) {
      return false
    }
    const templateId = this.currentTemplate.diy_template_id
    try {
      const raw = wx.getStorageSync(`DIY_DRAFT_${templateId}`)
      if (!raw) {
        return false
      }
      const cache: DraftCache = JSON.parse(raw)
      /* 版本不匹配或已过期则丢弃 */
      if (cache.version !== CACHE_VERSION || cache.expiresAt < Date.now()) {
        wx.removeStorageSync(`DIY_DRAFT_${templateId}`)
        return false
      }

      if (cache.mode === 'beads' && cache.beads) {
        this.selectedSizeLabel = cache.selectedSizeLabel || getDefaultSize(this.currentTemplate)
        /* 从缓存恢复珠子对象（仅恢复关键展示字段，库存等实时数据需重新获取） */
        this.selectedBeads = cache.beads.map(
          (b: any) =>
            ({
              diy_material_id: b.diy_material_id,
              material_code: b.material_code,
              display_name: b.display_name,
              material_name: b.display_name,
              group_code: b.group_code,
              diameter: b.diameter,
              shape: b.shape,
              price: b.price,
              price_asset_code: diyAssetCodes.STAR_STONE,
              stock: -1,
              is_stackable: 1,
              sort_order: 0,
              is_enabled: 1
            }) as API.DiyBead
        )
      } else if (cache.mode === 'slots' && cache.slotFillings) {
        const fillings: Record<string, API.DiyBead> = {}
        for (const [slotId, b] of Object.entries(cache.slotFillings)) {
          fillings[slotId] = {
            diy_material_id: b.diy_material_id,
            material_code: b.material_code,
            display_name: b.display_name,
            material_name: b.display_name,
            group_code: b.group_code,
            diameter: b.diameter,
            shape: b.shape,
            price: b.price,
            price_asset_code: diyAssetCodes.STAR_STONE,
            stock: -1,
            is_stackable: 1,
            sort_order: 0,
            is_enabled: 1
          } as API.DiyBead
        }
        this.slotFillings = fillings
      }
      return true
    } catch (_e) {
      return false
    }
  }),

  /** 清除缓存（成功下单后调用） */
  clearCache: action(function (this: any) {
    if (!this.currentTemplate) {
      return
    }
    try {
      wx.removeStorageSync(`DIY_DRAFT_${this.currentTemplate.diy_template_id}`)
    } catch (_e) {
      /* 清除异常不影响主流程 */
    }
  })
})
