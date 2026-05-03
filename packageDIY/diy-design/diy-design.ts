/**
 * DIY 饰品设计页（核心页面）
 *
 * 根据模板 layout.shape 自动切换串珠/镶嵌渲染模式
 * 功能: 预览Canvas、素材选择、撤销/重做、多选删除、珠子排序、
 *       槽位交换、尺码选择、缓存恢复、保存/确认/完成、分享还原
 *
 * 后端API:
 *   GET /api/v4/diy/templates/:id — 模板详情
 *   GET /api/v4/diy/templates/:id/beads — 实物珠子素材
 *   POST /api/v4/diy/works — 保存设计草稿
 *   GET /api/v4/diy/works/:id — 作品详情（分享还原）
 *
 * 字段对齐后端（snake_case）:
 *   diy_template_id / display_name / layout.shape / layout.slot_definitions
 *   bead_rules / sizing_rules / capacity_rules / material_group_codes
 *   diy_material_id / material_code / group_code / diameter / price
 */

/* 统一工具函数导入 */
const { API } = require('../../utils/index')
const { diyStore } = require('../../store/diy')

/** 颜色分组 → 中文名映射（UI常量，用于分组Tab展示） */
const GROUP_NAME_MAP: Record<string, string> = {
  red: '红色系',
  orange: '橙色系',
  yellow: '黄色系',
  green: '绿色系',
  blue: '蓝色系',
  purple: '紫色系'
}

Page({
  data: {
    /** 是否加载中 */
    loading: true,
    /** 模板主键 */
    templateId: 0,

    /* 模板信息 */
    templateName: '',
    isSlotMode: false,

    /* 尺码选择（串珠模式） */
    sizeOptions: [] as { label: string; display: string }[],
    sizeIndex: 0,
    selectedSizeLabel: '',
    selectedSizeDisplay: '',

    /* Canvas 尺寸 */
    canvasWidth: 300,
    canvasHeight: 300,

    /* 串珠模式状态 */
    beadCount: 0,
    maxBeadCount: 0,
    highlightedCount: 0,

    /* 镶嵌模式状态 */
    filledSlotCount: 0,
    totalSlotCount: 0,
    activeSlotLabel: '',

    /* 素材选择 */
    materialGroups: [] as { group_code: string; display_name: string }[],
    activeGroupCode: '',
    filteredBeads: [] as any[],
    searchKeyword: '',
    /** 当前选中的素材类型Tab（饰品/配饰/吊坠） */
    activeMaterialType: 'beads',
    /** 是否显示搜索栏 */
    showSearch: false,
    /** 是否显示素材提示条 */
    showMaterialTip: true,

    /* 工具栏 */
    canUndo: false,
    canRedo: false,
    totalPrice: 0,
    canSubmit: false,
    /** 是否显示工具箱弹出面板 */
    showToolbox: false,
    /** 总重量（后端返回，前端仅展示） */
    totalWeight: '0.00g',
    /** 手围尺寸（后端返回） */
    braceletSize: '16cm',
    /** 戴法（后端返回） */
    wearStyle: '单圈',
    /** 最大周长（后端返回） */
    maxPerimeter: '17.6cm',

    /* 素材加载失败重试 */
    beadLoadError: false
  },

  _searchTimer: null as any,
  /** 当前作品ID（分享还原或保存后获得，用于 onShareAppMessage） */
  _currentWorkId: 0,

  onLoad(options: Record<string, string | undefined>) {
    /* 计算Canvas尺寸（屏幕宽度90%，高宽比0.85） */
    const sysInfo = wx.getWindowInfo()
    const canvasWidth = Math.floor(sysInfo.windowWidth * 0.9)
    const canvasHeight = Math.floor(canvasWidth * 0.85)

    /**
     * 两种入口模式:
     *   templateId — 从款式选择页进入，直接加载模板
     *   workId    — 从分享链接进入，先加载作品再还原设计
     */
    const workId = Number(options.workId || 0)
    const templateId = Number(options.templateId || 0)

    if (!templateId && !workId) {
      /* 未传模板ID — 自动获取模板列表，使用第一个可用模板 */
      this.setData({ canvasWidth, canvasHeight })
      this._initFromTemplateList()
      return
    }

    this.setData({ canvasWidth, canvasHeight })

    if (workId) {
      this._currentWorkId = workId
      this._initFromWork(workId)
    } else {
      this.setData({ templateId })
      this._initDesign(templateId)
    }
  },

  onUnload() {
    /* 离开页面自动保存缓存 */
    diyStore.saveToCache()
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
  },

  /**
   * 未传 templateId 时，自动获取模板列表并使用第一个可用模板
   * 后端API: GET /api/v4/diy/templates
   */
  async _initFromTemplateList() {
    try {
      const res = await API.getDiyTemplates()
      if (res.success && res.data && res.data.length > 0) {
        const firstTemplate = res.data[0]
        const templateId = firstTemplate.diy_template_id
        this.setData({ templateId })
        this._initDesign(templateId)
      } else {
        this.setData({ loading: false })
        wx.showToast({ title: '暂无可用模板', icon: 'none' })
      }
    } catch (_err) {
      this.setData({ loading: false })
      wx.showToast({ title: '获取模板失败，请稍后重试', icon: 'none' })
    }
  },

  /**
   * 初始化设计流程
   * 1. 加载模板 → 2. 设置Store → 3. 加载珠子素材 → 4. 恢复缓存 → 5. 渲染
   */
  async _initDesign(templateId: number) {
    try {
      /* 1. 加载模板详情 */
      const tplRes = await API.getDiyTemplateById(templateId)
      if (!tplRes.success || !tplRes.data) {
        wx.showToast({ title: tplRes.message || '模板加载失败', icon: 'none' })
        return
      }
      const template = tplRes.data as API.DiyTemplate
      diyStore.setTemplate(template)

      /* 2. 加载该模板可用的珠子素材 */
      await this._loadBeads(templateId)

      /* 3. 尝试恢复本地缓存 */
      const restored = diyStore.restoreFromCache()
      if (restored) {
        wx.showToast({ title: '已恢复上次未完成的设计', icon: 'none', duration: 2000 })
      }

      /* 4. 同步状态到页面data */
      this._syncState()
      this.setData({ loading: false })

      /* 5. 延迟触发首次Canvas绘制 */
      setTimeout(() => this._triggerRender(), 100)
    } catch (_err) {
      wx.showToast({ title: '初始化失败，请检查网络', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  /**
   * 加载珠子素材（抽取为独立方法，支持加载失败后重试）
   * 后端API: GET /api/v4/diy/templates/:id/beads
   */
  async _loadBeads(templateId: number) {
    this.setData({ beadLoadError: false })
    try {
      const beadsRes = await API.getDiyTemplateBeads(templateId)
      if (beadsRes.success && beadsRes.data) {
        diyStore.setAllBeads(beadsRes.data)
        /* 从珠子数据中提取实际的分组列表（统计每组数量和示例名称） */
        const groupMap = new Map<string, { count: number; sampleName: string }>()
        beadsRes.data.forEach((b: API.DiyBead) => {
          const existing = groupMap.get(b.group_code)
          if (existing) {
            existing.count += 1
          } else {
            groupMap.set(b.group_code, { count: 1, sampleName: b.display_name })
          }
        })
        /** 对齐后端 GET /api/v4/diy/material-groups 返回格式 */
        const apiGroups: API.DiyMaterialGroup[] = Array.from(groupMap.entries()).map(
          ([code, info]) => ({
            group_code: code,
            count: String(info.count),
            sample_name: info.sampleName
          })
        )
        diyStore.setMaterialGroups(apiGroups)
      } else {
        this.setData({ beadLoadError: true })
      }
    } catch (_err) {
      this.setData({ beadLoadError: true })
    }
  },

  /** 素材加载失败后重试 */
  async onRetryLoadBeads() {
    const templateId = this.data.templateId
    if (!templateId) {
      return
    }
    wx.showLoading({ title: '重新加载...' })
    await this._loadBeads(templateId)
    wx.hideLoading()
    this._syncState()
    this._applyBeadFilter()
  },

  /**
   * 从分享链接还原设计（workId模式）
   * 后端API: GET /api/v4/diy/works/:id
   * 返回: { template: { 完整模板含layout/rules }, design_data: { mode, beads/fillings } }
   */
  async _initFromWork(workId: number) {
    try {
      const workRes = await API.getDiyWorkById(workId)
      if (!workRes.success || !workRes.data) {
        wx.showToast({ title: workRes.message || '作品加载失败', icon: 'none' })
        this.setData({ loading: false })
        return
      }
      const work = workRes.data as API.DiyWork
      const template = work.template as API.DiyTemplate
      if (!template) {
        wx.showToast({ title: '作品关联的模板数据缺失', icon: 'none' })
        this.setData({ loading: false })
        return
      }
      this.setData({ templateId: template.diy_template_id })
      diyStore.setTemplate(template)

      /* 加载该模板可用的珠子素材 */
      await this._loadBeads(template.diy_template_id)

      /* 从 design_data 还原珠子/槽位 */
      const designData = work.design_data
      if (designData) {
        const allBeads = diyStore.allBeads
        if (designData.mode === 'beading' && designData.beads) {
          if (designData.selected_size) {
            diyStore.setSize(designData.selected_size)
          }
          for (const beadRef of designData.beads) {
            /* 使用 material_code 匹配珠子（对齐后端 diy_materials 表主键） */
            const matched = allBeads.find(
              (b: API.DiyBead) => b.material_code === beadRef.material_code
            )
            if (matched) {
              diyStore.addBead(matched)
            }
          }
        } else if (designData.mode === 'slots' && designData.fillings) {
          for (const [slotId, filling] of Object.entries(designData.fillings)) {
            /* 使用 material_code 匹配珠子（对齐后端 diy_materials 表主键） */
            const matched = allBeads.find(
              (b: API.DiyBead) => b.material_code === (filling as any).material_code
            )
            if (matched) {
              diyStore.fillSlot(matched, slotId)
            }
          }
        }
      }

      this._syncState()
      this.setData({ loading: false })
      wx.showToast({ title: '已加载分享的设计', icon: 'none', duration: 2000 })
      setTimeout(() => this._triggerRender(), 100)
    } catch (_err) {
      wx.showToast({ title: '作品加载失败，请检查网络', icon: 'none' })
      this.setData({ loading: false })
    }
  },

  /** 从 Store 同步状态到页面 data */
  _syncState() {
    const template = diyStore.currentTemplate
    if (!template) {
      return
    }
    const isSlotMode = template.layout?.shape === 'slots'
    const updates: Record<string, any> = {
      templateName: template.display_name,
      isSlotMode,
      materialGroups: diyStore.availableGroups.map((g: API.DiyMaterialGroup) => ({
        group_code: g.group_code,
        display_name: GROUP_NAME_MAP[g.group_code] || g.group_code
      })),
      activeGroupCode: diyStore.activeGroupCode,
      canUndo: diyStore.canUndo,
      canRedo: diyStore.canRedo,
      totalPrice: diyStore.totalPrice,
      canSubmit: diyStore.canSubmit
    }
    if (isSlotMode) {
      updates.filledSlotCount = diyStore.filledSlotCount
      updates.totalSlotCount = diyStore.totalSlotCount
      const slotDefs = (template.layout as any).slot_definitions || []
      const activeSlot = slotDefs.find(
        (s: API.DiySlotDefinition) => s.slot_id === diyStore.activeSlotId
      )
      updates.activeSlotLabel = activeSlot ? activeSlot.label : ''
    } else {
      updates.selectedSizeLabel = diyStore.selectedSizeLabel
      updates.beadCount = diyStore.selectedBeads.length
      updates.maxBeadCount = diyStore.currentBeadCount
      updates.highlightedCount = diyStore.highlightedIndices.length
      const sizeOptions = template.sizing_rules?.size_options || []
      updates.sizeOptions = sizeOptions.map((o: API.DiySizeOption) => ({
        label: o.label,
        display: o.display
      }))
      const currentIdx = sizeOptions.findIndex(
        (o: API.DiySizeOption) => o.label === diyStore.selectedSizeLabel
      )
      updates.sizeIndex = currentIdx >= 0 ? currentIdx : 0
      if (sizeOptions.length > 0) {
        updates.selectedSizeDisplay = sizeOptions[updates.sizeIndex]?.display || ''
      }
    }
    this.setData(updates)
    this._applyBeadFilter()
  },

  /**
   * 应用搜索过滤 + 槽位约束过滤
   * 搜索: 关键词匹配 display_name 和 material_name
   * 约束: 镶嵌模式下按激活槽位的 allowed_diameters/allowed_shapes/allowed_group_codes 过滤
   */
  _applyBeadFilter() {
    let beads = [...diyStore.currentBeads]
    const keyword = this.data.searchKeyword.trim().toLowerCase()
    const template = diyStore.currentTemplate
    /* 关键词搜索过滤 */
    if (keyword) {
      beads = beads.filter(
        (b: API.DiyBead) =>
          b.display_name.toLowerCase().includes(keyword) ||
          b.material_name.toLowerCase().includes(keyword)
      )
    }
    /* 镶嵌模式: 根据激活槽位约束标记不可选 */
    if (template?.layout?.shape === 'slots' && diyStore.activeSlotId) {
      const slotDefs = (template.layout as any).slot_definitions || []
      const slot = slotDefs.find((s: API.DiySlotDefinition) => s.slot_id === diyStore.activeSlotId)
      if (slot) {
        beads = beads.map((b: API.DiyBead) => {
          let disabled = false
          if (
            slot.allowed_diameters &&
            slot.allowed_diameters.length > 0 &&
            !slot.allowed_diameters.includes(b.diameter)
          ) {
            disabled = true
          }
          if (
            slot.allowed_shapes &&
            slot.allowed_shapes.length > 0 &&
            !slot.allowed_shapes.includes(b.shape)
          ) {
            disabled = true
          }
          if (
            slot.allowed_group_codes &&
            slot.allowed_group_codes.length > 0 &&
            !slot.allowed_group_codes.includes(b.group_code)
          ) {
            disabled = true
          }
          if (b.stock === 0) {
            disabled = true
          }
          return { ...b, _disabled: disabled }
        })
      }
    } else {
      beads = beads.map((b: API.DiyBead) => ({ ...b, _disabled: b.stock === 0 }))
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
      content: '确定要清空当前设计吗？此操作可以撤销。',
      success: res => {
        if (res.confirm) {
          diyStore.clearDesign()
          this._syncState()
          this._triggerRender()
        }
      }
    })
  },

  /** 尺码选择变更（Picker） */
  onSizeChange(e: WechatMiniprogram.PickerChange) {
    const index = Number(e.detail.value)
    const template = diyStore.currentTemplate
    if (!template?.sizing_rules) {
      return
    }
    const sizeOption = template.sizing_rules.size_options[index]
    if (sizeOption) {
      diyStore.setSize(sizeOption.label)
      this._syncState()
      this._triggerRender()
    }
  },

  /** 材料分组Tab切换 */
  onGroupChange(e: WechatMiniprogram.BaseEvent) {
    const groupCode = (e.currentTarget.dataset.groupCode ||
      e.currentTarget.dataset['group-code'] ||
      '') as string
    diyStore.setActiveGroupCode(groupCode)
    this.setData({ activeGroupCode: groupCode })
    this._applyBeadFilter()
  },

  /** 搜索输入（200ms防抖） */
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
    this._searchTimer = setTimeout(() => this._applyBeadFilter(), 200)
  },

  /** 选择素材（串珠: 添加珠子，镶嵌: 填入槽位） */
  onBeadSelect(e: WechatMiniprogram.CustomEvent) {
    const bead = e.detail.bead as API.DiyBead
    if (!bead || !diyStore.currentTemplate) {
      return
    }
    if (diyStore.isSlotMode) {
      const ok = diyStore.fillSlot(bead)
      if (!ok) {
        wx.showToast({ title: '该宝石不匹配当前槽位约束', icon: 'none' })
        return
      }
    } else {
      const ok = diyStore.addBead(bead)
      if (!ok) {
        wx.showToast({ title: '已达到容量上限', icon: 'none' })
        return
      }
    }
    this._triggerFlyAnimation(e)
    this._syncState()
    diyStore.saveToCache()
  },

  /** 触发飞入动画 */
  _triggerFlyAnimation(e: WechatMiniprogram.CustomEvent) {
    const flyAnim = this.selectComponent('#flyAnim') as any
    if (!flyAnim) {
      this._triggerRender()
      return
    }
    const touch = e.detail?.touch
    const startX = touch?.clientX ?? this.data.canvasWidth / 2
    const startY = touch?.clientY ?? this.data.canvasHeight
    const endX = this.data.canvasWidth / 2
    const endY = this.data.canvasHeight / 2 + 60
    flyAnim.fly({ startX, startY, endX, endY, color: '#FF6B35', size: 24 })
  },

  /** Canvas珠子点击（串珠模式 - 切换选中状态） */
  onBeadTap(e: WechatMiniprogram.CustomEvent) {
    const index = e.detail.index as number
    diyStore.toggleBeadSelection(index)
    this._syncState()
    this._triggerRender()
  },

  /** Canvas槽位点击（镶嵌模式） */
  onSlotTap(e: WechatMiniprogram.CustomEvent) {
    const slotId = e.detail.slotId as string
    if (diyStore.slotFillings[slotId]) {
      /* 槽位已有宝石: 提供清空/替换/交换选项 */
      wx.showActionSheet({
        itemList: ['清空此槽位', '选择其他宝石替换', '与其他槽位交换'],
        success: res => {
          if (res.tapIndex === 0) {
            diyStore.clearSlot(slotId)
            this._syncState()
            this._triggerRender()
            diyStore.saveToCache()
          } else if (res.tapIndex === 1) {
            diyStore.setActiveSlot(slotId)
            this._syncState()
            this._applyBeadFilter()
            this._triggerRender()
          } else if (res.tapIndex === 2) {
            /* 进入交换模式: 记录源槽位，等待用户点击目标槽位 */
            this._swapSourceSlotId = slotId
            wx.showToast({ title: '请点击要交换的槽位', icon: 'none', duration: 2000 })
          }
        }
      })
    } else {
      /* 空槽位: 检查是否在交换模式 */
      if (this._swapSourceSlotId) {
        diyStore.swapSlots(this._swapSourceSlotId, slotId)
        this._swapSourceSlotId = ''
        this._syncState()
        this._triggerRender()
        diyStore.saveToCache()
        return
      }
      /* 正常模式: 激活等待填入 */
      diyStore.setActiveSlot(slotId)
      this._syncState()
      this._applyBeadFilter()
      this._triggerRender()
    }
  },

  /** 交换模式的源槽位ID */
  _swapSourceSlotId: '' as string,

  /** 删除选中珠子（批量） */
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

  /** 珠子左移（串珠模式排序） */
  onMoveBeadLeft() {
    const indices = diyStore.highlightedIndices
    if (indices.length !== 1) {
      return
    }
    const fromIndex = indices[0]
    if (fromIndex <= 0) {
      return
    }
    diyStore.moveBead(fromIndex, fromIndex - 1)
    /* 更新选中索引跟随移动 */
    diyStore.clearSelection()
    diyStore.toggleBeadSelection(fromIndex - 1)
    this._syncState()
    this._triggerRender()
    diyStore.saveToCache()
  },

  /** 珠子右移（串珠模式排序） */
  onMoveBeadRight() {
    const indices = diyStore.highlightedIndices
    if (indices.length !== 1) {
      return
    }
    const fromIndex = indices[0]
    if (fromIndex >= diyStore.selectedBeads.length - 1) {
      return
    }
    diyStore.moveBead(fromIndex, fromIndex + 1)
    diyStore.clearSelection()
    diyStore.toggleBeadSelection(fromIndex + 1)
    this._syncState()
    this._triggerRender()
    diyStore.saveToCache()
  },

  /**
   * 完成设计 → 保存草稿 → 跳转结果页
   * 后端API: POST /api/v4/diy/works
   */
  async onSubmit() {
    if (!diyStore.canSubmit) {
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      const template = diyStore.currentTemplate!
      /**
       * 保存草稿请求体
       * 文档决策 F9: saveWork 不传 total_cost，由 confirmDesign 时后端服务端计算
       * design_data 只记录珠子选择（material_code），不记录支付信息
       */
      const workData: API.DiyWorkCreateRequest = {
        diy_template_id: template.diy_template_id,
        work_name: `我的${template.display_name}`,
        design_data: { mode: 'beading' }
      }
      if (diyStore.isSlotMode) {
        /* 镶嵌模式: 记录每个槽位填入的珠子 material_code */
        const fillings: Record<string, { material_code: string }> = {}
        for (const [slotId, bead] of Object.entries(diyStore.slotFillings)) {
          const beadObj = bead as API.DiyBead
          fillings[slotId] = { material_code: beadObj.material_code }
        }
        workData.design_data = { mode: 'slots', fillings }
      } else {
        /* 串珠模式: 记录每颗珠子的 material_code + 位置 + 直径 */
        const beads = diyStore.selectedBeads.map((b: API.DiyBead, i: number) => {
          return { slot_index: i, material_code: b.material_code, diameter: b.diameter }
        })
        workData.design_data = { mode: 'beading', selected_size: diyStore.selectedSizeLabel, beads }
      }
      const saveRes = await API.saveDiyWork(workData)
      wx.hideLoading()
      if (saveRes.success && saveRes.data) {
        const workId = saveRes.data.diy_work_id
        this._currentWorkId = workId
        diyStore.clearCache()
        /** 将费用明细 JSON 编码传递给结果页（支付面板需要） */
        const costBreakdownParam = encodeURIComponent(JSON.stringify(diyStore.costBreakdown))
        wx.navigateTo({
          url: `/packageDIY/diy-result/diy-result?workId=${workId}&totalPrice=${diyStore.totalPrice}&templateName=${encodeURIComponent(template.display_name)}&templateId=${template.diy_template_id}&costBreakdown=${costBreakdownParam}`
        })
      } else {
        wx.showToast({ title: saveRes.message || '保存失败', icon: 'none' })
      }
    } catch (_err) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常，请检查网络后重试', icon: 'none' })
    }
  },

  /**
   * 保存草稿（不跳转结果页，仅保存当前设计状态）
   * 后端API: POST /api/v4/diy/works
   */
  async onSaveDraft() {
    if (!diyStore.canSubmit) {
      wx.showToast({ title: '请先添加素材', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中...' })
    try {
      const template = diyStore.currentTemplate!
      const workData: API.DiyWorkCreateRequest = {
        diy_template_id: template.diy_template_id,
        work_name: `我的${template.display_name}`,
        design_data: { mode: 'beading' }
      }
      const saveRes = await API.saveDiyWork(workData)
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

  /** 切换工具箱面板显示/隐藏 */
  onToggleToolbox() {
    this.setData({ showToolbox: !this.data.showToolbox })
  },

  /** 切换素材类型Tab（饰品/配饰/吊坠） */
  onMaterialTypeChange(e: WechatMiniprogram.TouchEvent) {
    const materialType = e.currentTarget.dataset.type as string
    if (materialType === this.data.activeMaterialType) {
      return
    }
    this.setData({ activeMaterialType: materialType })
  },

  /** 切换搜索栏显示/隐藏 */
  onToggleSearch() {
    this.setData({ showSearch: !this.data.showSearch, searchKeyword: '' })
  },

  /** 显示购物车（⚠️ 需后端提供购物车API） */
  onShowCart() {
    wx.showToast({ title: '购物车功能即将上线', icon: 'none' })
  },

  /** 关闭素材提示条 */
  onCloseMaterialTip() {
    this.setData({ showMaterialTip: false })
  },

  /** 飞入动画完成回调 */
  onFlyComplete() {
    this._triggerRender()
  },

  /**
   * 分享设计（携带 workId，他人打开可还原设计）
   * 如果尚未保存过草稿，先静默保存再分享
   */
  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    if (this._currentWorkId) {
      return {
        title: `来看看我设计的${this.data.templateName}`,
        path: `/packageDIY/diy-design/diy-design?workId=${this._currentWorkId}`
      }
    }
    /* 未保存过，分享选择页入口 */
    return {
      title: `DIY ${this.data.templateName}`,
      path: '/packageDIY/diy-select/diy-select'
    }
  }
})
