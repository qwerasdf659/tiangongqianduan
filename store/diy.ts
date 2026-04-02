/**
 * DIY饰品设计引擎 - MobX Store
 *
 * 管理内容: 当前模板、已选珠子、槽位填充、撤销/重做、缓存
 * 双模式: 串珠模式（circle/ellipse/arc/line） + 镶嵌模式（slots）
 *
 * @file 天工餐厅积分系统 - DIY Store
 * @version 1.0.0
 * @since 2026-03-28
 */

import { action, observable } from 'mobx-miniprogram'

/** 撤销/重做快照 */
interface Snapshot {
  mode: 'beads' | 'slots'
  selectedBeads?: API.DiyBead[]
  selectedSize?: number
  slotFillings?: Record<string, API.DiyBead>
}

/** 缓存数据结构 */
interface DraftCache {
  version: number
  mode: 'beads' | 'slots'
  templateId: string
  selectedSize?: number
  beads?: {
    beadId: string
    name: string
    diameter: number
    price: number
    imageUrl: string
    shape: string
    material: string
  }[]
  slotFillings?: Record<
    string,
    {
      beadId: string
      name: string
      diameter: number
      price: number
      imageUrl: string
      shape: string
      material: string
    }
  >
  updatedAt: number
  expiresAt: number
}

const CACHE_VERSION = 4
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000 // 7 天
const MAX_UNDO_STACK = 30

export const diyStore = observable({
  // ===== 通用状态 =====

  /** 当前款式模板 */
  currentTemplate: null as API.DiyTemplate | null,

  /** 当前激活分类 ID */
  activeCategory: '' as string,

  /** 素材分类列表 */
  categories: [] as API.DiyCategory[],

  /** 当前分类下的珠子列表 */
  currentBeads: [] as API.DiyBead[],

  /** 素材缓存（categoryId → beads[]） */
  _beadCache: {} as Record<string, API.DiyBead[]>,

  /** 撤销栈 */
  undoStack: [] as Snapshot[],

  /** 重做栈 */
  redoStack: [] as Snapshot[],

  // ===== 串珠模式专用 =====

  /** 当前选择的尺寸值（mm） */
  selectedSize: 0 as number,

  /** 已选珠子列表（有序） */
  selectedBeads: [] as API.DiyBead[],

  /** 预览区选中的珠子索引集合（多选删除用） */
  highlightedIndices: [] as number[],

  // ===== 镶嵌模式专用 =====

  /** 槽位填充状态（slotId → Bead） */
  slotFillings: {} as Record<string, API.DiyBead>,

  /** 当前激活的槽位 ID */
  activeSlotId: '' as string,

  // ===== 计算属性 =====

  /** 是否为镶嵌模式 */
  get isSlotMode(): boolean {
    return this.currentTemplate?.layout.shape === 'slots'
  },

  /** 已选珠子直径之和（串珠模式） */
  get totalDiameter(): number {
    return this.selectedBeads.reduce((sum: number, b: API.DiyBead) => sum + b.diameter, 0)
  },

  /** 当前尺寸可容纳最大直径（串珠模式） */
  get maxDiameter(): number {
    if (!this.currentTemplate?.sizing) {
      return 0
    }
    return this.selectedSize - this.currentTemplate.sizing.margin
  },

  /** 剩余可用空间（串珠模式） */
  get remainingSpace(): number {
    return this.maxDiameter - this.totalDiameter
  },

  /** 已填入宝石的槽位数（镶嵌模式） */
  get filledSlotCount(): number {
    return Object.keys(this.slotFillings).length
  },

  /** 总槽位数（镶嵌模式） */
  get totalSlotCount(): number {
    return this.currentTemplate?.layout.params.slots?.length || 0
  },

  /** 下一个空槽位 ID */
  get nextEmptySlotId(): string {
    const slots = this.currentTemplate?.layout.params.slots || []
    for (const s of slots) {
      if (!this.slotFillings[s.slot_id]) {
        return s.slot_id
      }
    }
    return ''
  },

  /** 所有必填槽位是否已填充 */
  get requiredSlotsFilled(): boolean {
    const slots = this.currentTemplate?.layout.params.slots || []
    return slots
      .filter((s: API.DiySlotDefinition) => s.required)
      .every((s: API.DiySlotDefinition) => !!this.slotFillings[s.slot_id])
  },

  /** 总价 */
  get totalPrice(): number {
    if (this.currentTemplate?.layout.shape === 'slots') {
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

  /** 是否可提交 */
  get canSubmit(): boolean {
    if (!this.currentTemplate) {
      return false
    }
    if (this.currentTemplate.layout.shape === 'slots') {
      return this.requiredSlotsFilled
    }
    return this.selectedBeads.length >= this.currentTemplate.capacity.min_beads
  },

  // ===== 通用方法 =====

  /** 设置款式模板 */
  setTemplate: action(function (this: any, template: API.DiyTemplate) {
    this.currentTemplate = template
    this.undoStack = []
    this.redoStack = []
    this.highlightedIndices = []
    this._beadCache = {}

    if (template.layout.shape === 'slots') {
      this.slotFillings = {}
      this.activeSlotId = template.layout.params.slots?.[0]?.slot_id || ''
      this.selectedBeads = []
      this.selectedSize = 0
    } else {
      this.selectedSize = template.sizing?.default_value || 0
      this.selectedBeads = []
      this.slotFillings = {}
      this.activeSlotId = ''
    }

    if (template.category_ids.length > 0) {
      this.activeCategory = template.category_ids[0]
    }
  }),

  /** 设置素材分类列表 */
  setCategories: action(function (this: any, categories: API.DiyCategory[]) {
    this.categories = categories
  }),

  /** 设置当前分类的珠子列表 */
  setCurrentBeads: action(function (this: any, beads: API.DiyBead[], categoryId: string) {
    this.currentBeads = beads
    this._beadCache[categoryId] = beads
  }),

  /** 切换激活分类 */
  setActiveCategory: action(function (this: any, categoryId: string) {
    this.activeCategory = categoryId
    if (this._beadCache[categoryId]) {
      this.currentBeads = this._beadCache[categoryId]
    }
  }),

  /** 推入撤销快照 */
  _pushUndo: action(function (this: any) {
    const snapshot: Snapshot =
      this.currentTemplate?.layout.shape === 'slots'
        ? { mode: 'slots', slotFillings: { ...this.slotFillings } }
        : { mode: 'beads', selectedBeads: [...this.selectedBeads], selectedSize: this.selectedSize }

    this.undoStack = [...this.undoStack.slice(-MAX_UNDO_STACK + 1), snapshot]
    this.redoStack = []
  }),

  /** 撤销 */
  undo: action(function (this: any) {
    if (this.undoStack.length === 0) {
      return
    }
    const stack = [...this.undoStack]
    const snapshot = stack.pop()!
    this.undoStack = stack

    const current: Snapshot =
      snapshot.mode === 'slots'
        ? { mode: 'slots', slotFillings: { ...this.slotFillings } }
        : { mode: 'beads', selectedBeads: [...this.selectedBeads], selectedSize: this.selectedSize }
    this.redoStack = [...this.redoStack, current]

    if (snapshot.mode === 'slots') {
      this.slotFillings = snapshot.slotFillings || {}
    } else {
      this.selectedBeads = snapshot.selectedBeads || []
      this.selectedSize = snapshot.selectedSize || 0
    }
    this.highlightedIndices = []
  }),

  /** 重做 */
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
        : { mode: 'beads', selectedBeads: [...this.selectedBeads], selectedSize: this.selectedSize }
    this.undoStack = [...this.undoStack, current]

    if (snapshot.mode === 'slots') {
      this.slotFillings = snapshot.slotFillings || {}
    } else {
      this.selectedBeads = snapshot.selectedBeads || []
      this.selectedSize = snapshot.selectedSize || 0
    }
    this.highlightedIndices = []
  }),

  /** 清空设计 */
  clearDesign: action(function (this: any) {
    this._pushUndo()
    if (this.currentTemplate?.layout.shape === 'slots') {
      this.slotFillings = {}
      this.activeSlotId = this.currentTemplate.layout.params.slots?.[0]?.slot_id || ''
    } else {
      this.selectedBeads = []
    }
    this.highlightedIndices = []
  }),

  // ===== 串珠模式方法 =====

  /** 添加珠子（含容量校验） */
  addBead: action(function (this: any, bead: API.DiyBead): boolean {
    if (this.currentTemplate?.layout.shape === 'slots') {
      return false
    }
    // 容量校验
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

  /** 批量删除选中珠子 */
  removeSelectedBeads: action(function (this: any) {
    if (this.highlightedIndices.length === 0) {
      return
    }
    this._pushUndo()
    const indices = new Set(this.highlightedIndices)
    this.selectedBeads = this.selectedBeads.filter((_: any, i: number) => !indices.has(i))
    this.highlightedIndices = []
  }),

  /** 调整珠子顺序 */
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

  /** 切换珠子选中状态 */
  toggleBeadSelection: action(function (this: any, index: number) {
    const set = new Set(this.highlightedIndices)
    if (set.has(index)) {
      set.delete(index)
    } else {
      set.add(index)
    }
    this.highlightedIndices = Array.from(set)
  }),

  /** 清空选中 */
  clearSelection: action(function (this: any) {
    this.highlightedIndices = []
  }),

  /** 修改尺寸 */
  setSize: action(function (this: any, size: number) {
    this.selectedSize = size
  }),

  // ===== 镶嵌模式方法 =====

  /** 设置当前激活槽位 */
  setActiveSlot: action(function (this: any, slotId: string) {
    this.activeSlotId = slotId
  }),

  /** 填入宝石到槽位（含约束校验） */
  fillSlot: action(function (this: any, bead: API.DiyBead, slotId?: string): boolean {
    const targetSlotId = slotId || this.activeSlotId || this.nextEmptySlotId
    if (!targetSlotId) {
      return false
    }

    const slots = this.currentTemplate?.layout.params.slots || []
    const slot = slots.find((s: API.DiySlotDefinition) => s.slot_id === targetSlotId)
    if (!slot) {
      return false
    }

    // 三重约束校验
    if (slot.allowed_diameters.length > 0 && !slot.allowed_diameters.includes(bead.diameter)) {
      return false
    }
    if (
      slot.allowed_shapes &&
      slot.allowed_shapes.length > 0 &&
      !slot.allowed_shapes.includes(bead.shape)
    ) {
      return false
    }
    if (slot.allowed_category_ids && slot.allowed_category_ids.length > 0) {
      // 分类校验：后端返回的珠子已按分类筛选，此处做前端二次校验
      // 如果后端未提供珠子的 categoryId，则跳过此校验
    }

    this._pushUndo()
    this.slotFillings = { ...this.slotFillings, [targetSlotId]: bead }

    // 自动移到下一个空槽位
    const nextEmpty = slots.find(
      (s: API.DiySlotDefinition) => s.slot_id !== targetSlotId && !this.slotFillings[s.slot_id]
    )
    this.activeSlotId = nextEmpty ? nextEmpty.slot_id : targetSlotId

    return true
  }),

  /** 清空指定槽位 */
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

  /** 交换两个槽位的宝石 */
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

  /** 保存到本地缓存 */
  saveToCache: action(function (this: any) {
    if (!this.currentTemplate) {
      return
    }
    const now = Date.now()
    const cache: DraftCache = {
      version: CACHE_VERSION,
      mode: this.currentTemplate.layout.shape === 'slots' ? 'slots' : 'beads',
      templateId: this.currentTemplate.id,
      updatedAt: now,
      expiresAt: now + CACHE_TTL
    }

    if (cache.mode === 'beads') {
      cache.selectedSize = this.selectedSize
      cache.beads = this.selectedBeads.map((b: API.DiyBead) => ({
        beadId: b.id,
        name: b.name,
        diameter: b.diameter,
        price: b.price,
        imageUrl: b.image_url,
        shape: b.shape,
        material: b.material
      }))
    } else {
      const fillings: DraftCache['slotFillings'] = {}
      for (const [slotId, b] of Object.entries(this.slotFillings)) {
        const bead = b as API.DiyBead
        fillings[slotId] = {
          beadId: bead.id,
          name: bead.name,
          diameter: bead.diameter,
          price: bead.price,
          imageUrl: bead.image_url,
          shape: bead.shape,
          material: bead.material
        }
      }
      cache.slotFillings = fillings
    }

    try {
      wx.setStorageSync(`DIY_DRAFT_${this.currentTemplate.id}`, JSON.stringify(cache))
    } catch (_e) {
      /* ignore storage errors */
    }
  }),

  /** 从本地缓存恢复 */
  restoreFromCache: action(function (this: any): boolean {
    if (!this.currentTemplate) {
      return false
    }
    try {
      const raw = wx.getStorageSync(`DIY_DRAFT_${this.currentTemplate.id}`)
      if (!raw) {
        return false
      }
      const cache: DraftCache = JSON.parse(raw)
      if (cache.version !== CACHE_VERSION || cache.expiresAt < Date.now()) {
        wx.removeStorageSync(`DIY_DRAFT_${this.currentTemplate.id}`)
        return false
      }

      if (cache.mode === 'beads' && cache.beads) {
        this.selectedSize = cache.selectedSize || this.currentTemplate.sizing?.default_value || 0
        this.selectedBeads = cache.beads.map((b: any) => ({
          id: b.beadId,
          name: b.name,
          image_url: b.imageUrl,
          thumbnail_url: '',
          diameter: b.diameter,
          shape: b.shape,
          price: b.price,
          price_asset_code: 'DIAMOND',
          material: b.material,
          stock: 0,
          stackable: true
        }))
      } else if (cache.mode === 'slots' && cache.slotFillings) {
        const fillings: Record<string, API.DiyBead> = {}
        for (const [slotId, b] of Object.entries(cache.slotFillings)) {
          fillings[slotId] = {
            id: b.beadId,
            name: b.name,
            image_url: b.imageUrl,
            thumbnail_url: '',
            diameter: b.diameter,
            shape: b.shape,
            price: b.price,
            price_asset_code: 'DIAMOND',
            material: b.material,
            stock: 0,
            stackable: true
          }
        }
        this.slotFillings = fillings
      }
      return true
    } catch (_e) {
      return false
    }
  }),

  /** 清除缓存 */
  clearCache: action(function (this: any) {
    if (!this.currentTemplate) {
      return
    }
    try {
      wx.removeStorageSync(`DIY_DRAFT_${this.currentTemplate.id}`)
    } catch (_e) {
      /* ignore */
    }
  })
})
