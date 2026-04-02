/**
 * DIY 饰品设计页（核心页面）
 *
 * 根据模板动态渲染，支持串珠模式和镶嵌模式
 * 功能：预览 Canvas、素材选择、撤销/重做、多选删除、尺寸选择、缓存恢复
 */

// 🔴 统一工具函数导入
const { API } = require('../../utils/index')
const { diyStore } = require('../../store/diy')

Page({
  data: {
    loading: true,
    templateId: '',

    // 模板信息
    templateName: '',
    isSlotMode: false,
    sizing: null as any,
    sizeOptions: [] as { label: string; value: number }[],
    sizeIndex: 0,
    selectedSize: 0,

    // Canvas 尺寸
    canvasWidth: 300,
    canvasHeight: 300,

    // 串珠模式
    remainingSpace: 0,
    usedPercent: 0,
    highlightedCount: 0,

    // 镶嵌模式
    filledSlotCount: 0,
    totalSlotCount: 0,
    activeSlotLabel: '',

    // 素材
    categories: [] as API.DiyCategory[],
    activeCategory: '',
    currentBeads: [] as API.DiyBead[],
    filteredBeads: [] as any[],
    searchKeyword: '',

    // 工具栏
    canUndo: false,
    canRedo: false,
    totalPrice: 0,
    canSubmit: false
  },

  _searchTimer: null as any,

  onLoad(options: Record<string, string | undefined>) {
    const templateId = options.templateId || ''
    if (!templateId) {
      wx.showToast({ title: '缺少模板参数', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
      return
    }

    // 计算 Canvas 尺寸
    const sysInfo = wx.getWindowInfo()
    const canvasWidth = Math.floor(sysInfo.windowWidth * 0.9)
    const canvasHeight = Math.floor(canvasWidth * 0.85)

    this.setData({ templateId, canvasWidth, canvasHeight })
    this._initDesign(templateId)
  },

  onUnload() {
    // 自动保存缓存
    diyStore.saveToCache()
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
  },

  async _initDesign(templateId: string) {
    try {
      // 1. 加载模板
      const tplRes = await API.getDiyTemplateById(templateId)
      if (!tplRes.success || !tplRes.data) {
        wx.showToast({ title: '模板加载失败', icon: 'none' })
        return
      }
      const template = tplRes.data as API.DiyTemplate
      diyStore.setTemplate(template)

      // 2. 加载分类
      const catRes = await API.getDiyCategories(templateId)
      if (catRes.success && catRes.data) {
        diyStore.setCategories(catRes.data)
      }

      // 3. 尝试恢复缓存
      const restored = diyStore.restoreFromCache()
      if (restored) {
        wx.showToast({ title: '已恢复上次设计', icon: 'none' })
      }

      // 4. 加载第一个分类的素材
      if (diyStore.activeCategory) {
        await this._loadBeads(diyStore.activeCategory)
      }

      // 5. 同步状态到 data
      this._syncState()
      this.setData({ loading: false })

      // 6. 延迟触发首次绘制
      setTimeout(() => this._triggerRender(), 100)
    } catch (_err) {
      wx.showToast({ title: '初始化失败', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  /** 从 Store 同步状态到页面 data */
  _syncState() {
    const template = diyStore.currentTemplate
    if (!template) {
      return
    }

    const isSlotMode = template.layout.shape === 'slots'

    const updates: Record<string, any> = {
      templateName: template.name,
      isSlotMode,
      categories: diyStore.categories,
      activeCategory: diyStore.activeCategory,
      canUndo: diyStore.canUndo,
      canRedo: diyStore.canRedo,
      totalPrice: diyStore.totalPrice,
      canSubmit: diyStore.canSubmit
    }

    if (isSlotMode) {
      updates.filledSlotCount = diyStore.filledSlotCount
      updates.totalSlotCount = diyStore.totalSlotCount
      const slots = template.layout.params.slots || []
      const activeSlot = slots.find(
        (s: API.DiySlotDefinition) => s.slot_id === diyStore.activeSlotId
      )
      updates.activeSlotLabel = activeSlot ? activeSlot.label : ''
    } else {
      updates.sizing = template.sizing
      updates.selectedSize = diyStore.selectedSize
      updates.remainingSpace = Math.max(0, diyStore.remainingSpace)
      const maxD = diyStore.maxDiameter
      updates.usedPercent =
        maxD > 0 ? Math.min(100, Math.round((diyStore.totalDiameter / maxD) * 100)) : 0
      updates.highlightedCount = diyStore.highlightedIndices.length

      if (template.sizing) {
        updates.sizeOptions = template.sizing.options.map((v: number) => ({
          label: `${v}${template.sizing!.unit}`,
          value: v
        }))
        updates.sizeIndex = template.sizing.options.indexOf(diyStore.selectedSize)
        if (updates.sizeIndex < 0) {
          updates.sizeIndex = 0
        }
      }
    }

    this.setData(updates)
    this._applyBeadFilter()
  },

  /** 加载分类素材 */
  async _loadBeads(categoryId: string) {
    // 检查缓存
    if (diyStore._beadCache[categoryId]) {
      diyStore.setCurrentBeads(diyStore._beadCache[categoryId], categoryId)
      this._applyBeadFilter()
      return
    }

    const res = await API.getDiyBeadsByCategory(categoryId)
    if (res.success && res.data) {
      diyStore.setCurrentBeads(res.data, categoryId)
      this._applyBeadFilter()
    }
  },

  /** 应用搜索过滤和槽位约束 */
  _applyBeadFilter() {
    let beads = [...diyStore.currentBeads]
    const keyword = this.data.searchKeyword.trim().toLowerCase()
    const template = diyStore.currentTemplate

    // 搜索过滤
    if (keyword) {
      beads = beads.filter(
        b => b.name.toLowerCase().includes(keyword) || b.material.toLowerCase().includes(keyword)
      )
    }

    // 镶嵌模式：根据激活槽位约束标记不可选
    if (template?.layout.shape === 'slots' && diyStore.activeSlotId) {
      const slots = template.layout.params.slots || []
      const slot = slots.find((s: API.DiySlotDefinition) => s.slot_id === diyStore.activeSlotId)
      if (slot) {
        beads = beads.map(b => {
          let disabled = false
          if (slot.allowed_diameters.length > 0 && !slot.allowed_diameters.includes(b.diameter)) {
            disabled = true
          }
          if (
            slot.allowed_shapes &&
            slot.allowed_shapes.length > 0 &&
            !slot.allowed_shapes.includes(b.shape)
          ) {
            disabled = true
          }
          return { ...b, _disabled: disabled }
        })
      }
    } else {
      beads = beads.map(b => ({ ...b, _disabled: false }))
    }

    this.setData({ filteredBeads: beads })
  },

  /** 触发 Canvas 重绘 */
  _triggerRender() {
    const renderer = this.selectComponent('#shapeRenderer') as any
    if (renderer) {
      renderer.render()
    }
  },

  // ===== 事件处理 =====

  /** 撤销 */
  onUndo() {
    if (!diyStore.canUndo) {
      return
    }
    diyStore.undo()
    this._syncState()
    this._triggerRender()
  },

  /** 重做 */
  onRedo() {
    if (!diyStore.canRedo) {
      return
    }
    diyStore.redo()
    this._syncState()
    this._triggerRender()
  },

  /** 清空设计 */
  onClearDesign() {
    wx.showModal({
      title: '确认清空',
      content: '确定要清空当前设计吗？',
      success: res => {
        if (res.confirm) {
          diyStore.clearDesign()
          this._syncState()
          this._triggerRender()
        }
      }
    })
  },

  /** 尺寸选择变更 */
  onSizeChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    const template = diyStore.currentTemplate
    if (!template?.sizing) {
      return
    }
    const size = template.sizing.options[index]
    diyStore.setSize(size)
    this._syncState()
    this._triggerRender()
  },

  /** 分类切换 */
  async onCategoryChange(e: WechatMiniprogram.CustomEvent) {
    const categoryId = e.detail.categoryId as string
    diyStore.setActiveCategory(categoryId)
    this.setData({ activeCategory: categoryId })
    await this._loadBeads(categoryId)
  },

  /** 搜索输入（防抖） */
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
    this._searchTimer = setTimeout(() => this._applyBeadFilter(), 200)
  },

  /** 选择素材 */
  onBeadSelect(e: WechatMiniprogram.CustomEvent) {
    const bead = e.detail.bead as API.DiyBead
    if (!bead) {
      return
    }

    const template = diyStore.currentTemplate
    if (!template) {
      return
    }

    if (template.layout.shape === 'slots') {
      // 镶嵌模式：填入槽位
      const ok = diyStore.fillSlot(bead)
      if (!ok) {
        wx.showToast({ title: '该宝石不匹配当前槽位', icon: 'none' })
        return
      }
    } else {
      // 串珠模式：添加珠子
      const ok = diyStore.addBead(bead)
      if (!ok) {
        wx.showToast({ title: '空间不足，无法添加', icon: 'none' })
        return
      }
    }

    // 触发飞入动画（简化版：直接重绘）
    this._syncState()
    this._triggerRender()
    diyStore.saveToCache()
  },

  /** Canvas 珠子点击（串珠模式） */
  onBeadTap(e: WechatMiniprogram.CustomEvent) {
    const index = e.detail.index as number
    diyStore.toggleBeadSelection(index)
    this._syncState()
    this._triggerRender()
  },

  /** Canvas 槽位点击（镶嵌模式） */
  onSlotTap(e: WechatMiniprogram.CustomEvent) {
    const slotId = e.detail.slotId as string

    // 如果槽位已有宝石，提供清空选项
    if (diyStore.slotFillings[slotId]) {
      wx.showActionSheet({
        itemList: ['清空此槽位', '选择其他宝石替换'],
        success: res => {
          if (res.tapIndex === 0) {
            diyStore.clearSlot(slotId)
            this._syncState()
            this._triggerRender()
            diyStore.saveToCache()
          } else {
            diyStore.setActiveSlot(slotId)
            this._syncState()
            this._applyBeadFilter()
            this._triggerRender()
          }
        }
      })
    } else {
      diyStore.setActiveSlot(slotId)
      this._syncState()
      this._applyBeadFilter()
      this._triggerRender()
    }
  },

  /** 删除选中珠子 */
  onDeleteSelected() {
    diyStore.removeSelectedBeads()
    this._syncState()
    this._triggerRender()
    diyStore.saveToCache()
  },

  /** 取消选中 */
  onClearSelection() {
    diyStore.clearSelection()
    this._syncState()
    this._triggerRender()
  },

  /** 完成设计 */
  async onSubmit() {
    if (!diyStore.canSubmit) {
      return
    }

    wx.showLoading({ title: '保存中...' })

    try {
      const template = diyStore.currentTemplate!
      let designData: any

      if (template.layout.shape === 'slots') {
        const slotFillings = Object.entries(diyStore.slotFillings).map(
          ([slotId, bead]: [string, any]) => ({
            slot_id: slotId,
            bead_id: bead.id
          })
        )
        designData = {
          template_id: template.id,
          mode: 'slots',
          slot_fillings: slotFillings,
          total_price: diyStore.totalPrice
        }
      } else {
        const beads = diyStore.selectedBeads.map((b: API.DiyBead, i: number) => ({
          bead_id: b.id,
          position: i
        }))
        designData = {
          template_id: template.id,
          mode: 'beads',
          selected_size: diyStore.selectedSize,
          beads,
          total_price: diyStore.totalPrice
        }
      }

      const res = await API.saveDiyDesign(designData)
      wx.hideLoading()

      if (res.success && res.data) {
        diyStore.clearCache()
        wx.navigateTo({
          url: `/packageDIY/diy-result/diy-result?designId=${res.data.design_id}&totalPrice=${diyStore.totalPrice}&templateName=${encodeURIComponent(template.name)}`
        })
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' })
      }
    } catch (_err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  },

  /** 飞入动画完成 */
  onFlyComplete() {
    this._triggerRender()
  },

  onShareAppMessage() {
    return {
      title: `DIY ${this.data.templateName}`,
      path: `/pages/diy/diy`
    }
  }
})
