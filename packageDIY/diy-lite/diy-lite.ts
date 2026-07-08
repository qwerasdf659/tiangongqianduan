/**
 * diy-lite 手串设计台（离线演示页）
 *
 * 职责：选珠面板（左侧竖分类 + 右侧网格 + 搜索 + 尺码切换）、珠子详情、
 *       手围绳长与容量限制、伪3D预览、背景切换、教程引导、加入购物车（演示）。
 *       Canvas 渲染与触摸交互委托给 bracelet-tray 组件。
 *
 * 容量模型：用户选手围(cm) → 绳长/容量 = 手围×10×圈数(mm)。珠子按实际沿绳尺寸累加，
 *   累加达容量则禁止继续添加（提示先删除），从根本上避免珠子重叠。
 *
 * 🚨 违规知悉项：珠子价格/直径/材质/寓意、手围、绳长容量、圈数等业务数据来自本地
 *   bead-data.ts（前端写死），与「业务数据由后端提供」规则冲突，为用户明确同意的
 *   离线演示方案。正式版改为 API.getDiyTemplateBeads() 由后端下发（image 支持 CDN URL）。
 *
 * @file packageDIY/diy-lite/diy-lite.ts
 */

const { LITE_BEADS, LITE_CATEGORIES } = require('./bead-data')

/** 戴法选项（演示写死，正式版由后端手围规则下发） */
const WEAR_OPTIONS = [
  { key: 'single', label: '单圈', loops: 1 },
  { key: 'double', label: '双圈', loops: 2 },
  { key: 'triple', label: '三圈', loops: 3 }
]

/** 背景选项（纯 UI 常量，前端自主决定） */
const BG_OPTIONS = ['#F4F2EC', '#EAF0F0', '#F6EAF0', '#EEECF6']

/**
 * 把珠子按“名称”聚合成款式组（每组含多个尺寸的 SKU），用于网格卡尺码 +/- 切换。
 * @param beads 原始珠子数组
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
        material: bead.material,
        meaning: bead.meaning,
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
    /** 分类清单（左侧竖分类） */
    categories: LITE_CATEGORIES,
    /** 当前选中分类键 */
    activeCategory: LITE_CATEGORIES[0].key as string,
    /** 搜索关键词 */
    keyword: '',
    /** 当前展示的款式组（按分类+搜索过滤，含尺码切换） */
    groups: [] as any[],

    /** 已选珠子（传给 bracelet-tray 渲染） */
    selectedBeads: [] as any[],
    /** 总价展示文本 */
    totalPriceText: '0.0',
    /** 已选颗数 */
    beadCount: 0,
    /** 当前串长（mm，四舍五入展示） */
    lengthText: '0',
    /** 容量占用百分比（0-100，用于进度条） */
    capacityPercent: 0,
    /** 容量提示文案 */
    capacityTip: '',
    /** 是否已满（满则禁止添加） */
    isFull: false,
    /** 是否快满（≥85%，容量条警示色） */
    nearFull: false,
    /** 每个珠子 id 的已选数量（网格角标用） */
    usedCountMap: {} as Record<string, number>,

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

    /** 手围设置弹窗 */
    wristVisible: false,
    wearOptions: WEAR_OPTIONS,
    wearIndex: 0,
    /** 手围（cm）—— ⚠️ 演示写死默认值，正式版由后端/用户量取 */
    wristSize: 15,
    /** 绳长/容量（mm）= 手围×10×圈数，珠子沿绳总长的硬上限 */
    capacityMm: 150,

    /** 教程引导弹窗 */
    guideVisible: false,

    /** 购物车已加入数量（演示，正式版对接后端购物车） */
    cartCount: 0
  },

  onLoad() {
    this._refreshGroups()
    this._recalcCapacity()
    this._restoreDraft()
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
  },

  /** 页面隐藏/卸载时保存草稿（本地演示，正式版用后端 saveDiyWork） */
  onHide() {
    this._saveDraft()
  },
  onUnload() {
    this._saveDraft()
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
  /** 点击网格卡：把当前选中尺寸的 SKU 加入手串（受容量限制） */
  onSelectBead(e: any) {
    const groupIndex = Number(e.currentTarget.dataset.group)
    const group = this.data.groups[groupIndex]
    if (!group) {
      return
    }
    const sku = group.skus[group.sizeIndex]
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

  /** 详情弹窗内“加入手串” */
  onDetailAdd() {
    const bead = this.data.detailBead
    if (bead && this._tryAddBead(bead)) {
      this.setData({ detailVisible: false })
    }
  },

  /**
   * 尝试添加一颗珠子：先校验容量，满则拦截提示，否则加入。
   * @returns 是否添加成功
   */
  _tryAddBead(sku: any): boolean {
    const used = this._usedLengthMm(this.data.selectedBeads)
    const next = used + this._alongCordMm(sku)
    if (next > this.data.capacityMm) {
      wx.vibrateShort({ type: 'heavy' })
      /** 满容量不是死路：弹框引导「增大手围」或删珠 */
      wx.showModal({
        title: '绳长已满',
        content: '当前手围放不下更多珠子了。可以增大手围，或删除已有珠子后再添加。',
        confirmText: '增大手围',
        cancelText: '知道了',
        confirmColor: '#8b7355',
        success: (res: any) => {
          if (res.confirm) {
            this.setData({ wristVisible: true })
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
  /** bracelet-tray 事件：移除某颗 */
  onTrayRemove(e: any) {
    const index = e.detail.index
    const nextSelected = this.data.selectedBeads.slice()
    if (index >= 0 && index < nextSelected.length) {
      nextSelected.splice(index, 1)
      this._applySelection(nextSelected)
    }
  },

  /** bracelet-tray 事件：轻点手串上的珠子 → 查看详情（不删除） */
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

  /** 撤销最后一颗 */
  onRemoveLast() {
    if (this.data.selectedBeads.length === 0) {
      return
    }
    this._applySelection(this.data.selectedBeads.slice(0, -1))
  },

  /** 清空 */
  onClearAll() {
    if (this.data.selectedBeads.length === 0) {
      return
    }
    this._applySelection([])
  },

  /**
   * 一键成串（随机搭配/盲盒）：从全部珠子里随机挑，按沿绳尺寸累加到接近容量为止。
   * 空态引导用，降低新用户上手门槛。演示随机逻辑，非业务规则。
   */
  onRandomFill() {
    const pool = LITE_BEADS.filter((b: any) => b.shape !== 'special')
    if (pool.length === 0) {
      return
    }
    const capacityMm = this.data.capacityMm
    const picked: any[] = []
    let used = 0
    /** 最多尝试 60 次，凑到 ≥90% 容量或放不下为止 */
    for (let i = 0; i < 60 && used < capacityMm * 0.9; i++) {
      const sku = pool[Math.floor(Math.random() * pool.length)]
      const need = this._alongCordMm(sku)
      if (used + need > capacityMm) {
        continue
      }
      picked.push({ ...sku })
      used += need
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

  /** 打开教程引导 */
  onOpenGuide() {
    this.setData({ guideVisible: true })
  },

  /** 关闭教程引导 */
  onCloseGuide() {
    this.setData({ guideVisible: false })
  },

  /** 加入购物车（演示：仅计数并提示；正式版对接后端购物车） */
  onAddToCart() {
    if (this.data.beadCount === 0) {
      wx.showToast({ title: '请先设计手串', icon: 'none' })
      return
    }
    this.setData({ cartCount: this.data.cartCount + 1 })
    wx.showToast({ title: '已加入购物车（演示）', icon: 'success' })
    wx.vibrateShort({ type: 'medium' })
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
  /** 打开手围设置 */
  onOpenWrist() {
    this.setData({ wristVisible: true })
  },

  /** 关闭手围设置 */
  onCloseWrist() {
    this.setData({ wristVisible: false })
  },

  /** 手围滑块变化 */
  onWristChange(e: any) {
    this.setData({ wristSize: e.detail.value }, () => this._recalcCapacity())
  },

  /** 选择戴法 */
  onSelectWear(e: any) {
    this.setData({ wearIndex: Number(e.currentTarget.dataset.index) }, () => this._recalcCapacity())
  },
  /** 刷新款式组：按当前分类 + 搜索关键词过滤，再按名称聚合 */
  _refreshGroups() {
    const kw = this.data.keyword.trim()
    let list = LITE_BEADS.filter((b: any) => b.category === this.data.activeCategory)
    if (kw) {
      /** 搜索跨分类：关键词匹配名称 */
      list = LITE_BEADS.filter((b: any) => b.name.indexOf(kw) >= 0)
    }
    this.setData({ groups: buildBeadGroups(list) }, () =>
      this._refreshGroupCounts(this.data.usedCountMap)
    )
  },

  /**
   * 重算绳长/容量：容量(mm) = 手围cm × 10 × 圈数
   * 变更后同步刷新已选珠子的容量占用与是否超限
   */
  _recalcCapacity() {
    const loops = WEAR_OPTIONS[this.data.wearIndex].loops
    const capacityMm = Math.round(this.data.wristSize * 10 * loops)
    this.setData({ capacityMm }, () => this._applySelection(this.data.selectedBeads))
  },

  /**
   * 统一应用选择变更：更新总价/颗数/串长/容量占用/是否满
   * selectedBeads 通过属性下发给 bracelet-tray，由组件负责布局与重绘
   */
  _applySelection(nextSelected: any[]) {
    const totalPrice = nextSelected.reduce((sum, b) => sum + b.price, 0)
    const usedMm = this._usedLengthMm(nextSelected)
    const capacityMm = this.data.capacityMm
    const percent = Math.min(100, Math.round((usedMm / capacityMm) * 100))
    const isFull = usedMm >= capacityMm
    /** 快满阈值：占用 ≥85% 且未满时，容量条变警示色（语义化提示 #5） */
    const nearFull = !isFull && percent >= 85

    /** 统计每个珠子 id 的已选数量（网格角标 #6） */
    const countMap: Record<string, number> = {}
    nextSelected.forEach(b => {
      countMap[b.id] = (countMap[b.id] || 0) + 1
    })

    this.setData({
      selectedBeads: nextSelected,
      totalPriceText: totalPrice.toFixed(1),
      beadCount: nextSelected.length,
      lengthText: String(Math.round(usedMm)),
      capacityPercent: percent,
      isFull,
      nearFull,
      usedCountMap: countMap,
      capacityTip: isFull ? '已达绳长上限，删除珠子可继续添加' : ''
    })
    this._refreshGroupCounts(countMap)
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

  /**
   * 保存草稿到本地（⚠️ 离线演示：仅 wx.setStorage 本地存，正式版用后端 saveDiyWork）
   * 存已选珠子 id 列表 + 手围/戴法，下次进入还原。
   */
  _saveDraft() {
    try {
      wx.setStorageSync('diy_lite_draft', {
        beadIds: this.data.selectedBeads.map((b: any) => b.id),
        wristSize: this.data.wristSize,
        wearIndex: this.data.wearIndex
      })
    } catch (_e) {
      /* storage 不可用时忽略 */
    }
  },

  /** 从本地还原草稿（按 id 从 LITE_BEADS 重建珠子对象） */
  _restoreDraft() {
    try {
      const draft = wx.getStorageSync('diy_lite_draft')
      if (!draft || !draft.beadIds || draft.beadIds.length === 0) {
        return
      }
      const restored = draft.beadIds
        .map((id: string) => LITE_BEADS.find((b: any) => b.id === id))
        .filter((b: any) => !!b)
        .map((b: any) => ({ ...b }))
      const wearIndex = typeof draft.wearIndex === 'number' ? draft.wearIndex : this.data.wearIndex
      this.setData({ wristSize: draft.wristSize || this.data.wristSize, wearIndex }, () => {
        this._recalcCapacity()
        this._applySelection(restored)
      })
    } catch (_e) {
      /* 还原失败不影响进入 */
    }
  },

  /** 分享给好友（带上珠子数与总价；正式版应带 workId 还原真实作品） */
  onShareAppMessage() {
    const count = this.data.beadCount
    return {
      title: count > 0 ? `我设计了一串 ${count} 颗的手串，快来看看` : 'DIY 手串设计台',
      path: '/packageDIY/diy-lite/diy-lite'
    }
  },

  /** 已选珠子沿绳总长（mm） */
  _usedLengthMm(beads: any[]): number {
    return beads.reduce((sum, b) => sum + this._alongCordMm(b), 0)
  },

  /** 单颗沿绳尺寸（圆珠=直径，异形取薄边或长边，与组件保持一致） */
  _alongCordMm(bead: any): number {
    if (bead.shape !== 'special') {
      return bead.diameter
    }
    const nums = bead.sizeText.replace(/mm/gi, '').split(/x/i).map(Number)
    const shortMm = Math.min(nums[0], nums[1])
    const longMm = Math.max(nums[0], nums[1])
    return bead.id.indexOf('paohuan') >= 0 ? longMm : shortMm
  }
})
