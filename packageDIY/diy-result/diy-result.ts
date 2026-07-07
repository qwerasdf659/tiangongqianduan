/**
 * DIY 设计结果页
 *
 * 展示设计保存成功后的信息，提供三步结算流程:
 *   draft（草稿）→ frozen（已冻结材料）→ completed（已完成，铸造物品）
 *   frozen → cancelled（取消，解冻材料）
 *
 * 海报生成: 750x1334px @2x 三段式离屏Canvas渲染
 *   顶部 120px: 品牌Logo + 渐变背景
 *   中间 900px: 饰品渲染图 + 作品名称 + 材料标签，背景色 #F8F6F3
 *   底部 314px: 小程序码(200x200) + "扫码查看我的设计" + 用户昵称
 *
 * 后端API:
 *   GET  /api/v4/diy/works/:id — 获取作品详情（含模板+设计数据，用于海报渲染）
 *   GET  /api/v4/diy/works/:id/qrcode — 获取小程序码图片URL（海报底部展示）
 *   POST /api/v4/diy/works/:id/confirm — 确认设计（冻结材料）
 *   POST /api/v4/diy/works/:id/complete — 完成设计（铸造物品）
 *   POST /api/v4/diy/works/:id/cancel — 取消设计（解冻材料）
 */

/* 统一工具函数导入 */
const { API, Logger } = require('../../utils/index')
const { userStore } = require('../../store/user')
const log = Logger.createLogger('diy-result')

/* ===== 海报 UI 常量（代码写死，无需后端提供） ===== */

/** 海报尺寸（px，@2x 高清） */
const POSTER_WIDTH = 750
const POSTER_HEIGHT = 1334
/** 海报暖灰白背景色 */
const POSTER_BG_COLOR = '#F8F6F3'
/** 品牌橙色 */
const POSTER_BRAND_COLOR = '#5B7A5E'

/* ===== 海报饰品渲染用颜色映射（与 shape-renderer 保持一致） ===== */

/** group_code → Canvas 绘制颜色（按后端 asset_group_defs 6色分组） */
const GROUP_COLOR_MAP: Record<string, string> = {
  red: '#E0115F',
  orange: '#FF8C00',
  yellow: '#FFC87C',
  green: '#50C878',
  blue: '#0F52BA',
  purple: '#9966CC'
}

/** 根据珠子 group_code 获取绘制颜色 */
function getGemColor(bead: any): string {
  if (bead.group_code && GROUP_COLOR_MAP[bead.group_code]) {
    return GROUP_COLOR_MAP[bead.group_code]
  }
  return '#999'
}

/** 颜色变亮（径向渐变高光） */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(2.55 * percent))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent))
  const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent))
  return `rgb(${r},${g},${b})`
}

/** 颜色变暗（径向渐变阴影） */
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(2.55 * percent))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * percent))
  const b = Math.max(0, (num & 0xff) - Math.round(2.55 * percent))
  return `rgb(${r},${g},${b})`
}

/**
 * 在指定 Canvas context 上绘制宝石（径向渐变 + 高光点）
 * 复用 shape-renderer 的绘制逻辑，用于海报离屏渲染
 */
function drawGemOnCtx(
  ctx: any,
  x: number,
  y: number,
  radius: number,
  color: string,
  gemShape: string
) {
  ctx.save()
  ctx.beginPath()
  switch (gemShape) {
    case 'oval':
      ctx.ellipse(x, y, radius, radius * 0.7, 0, 0, Math.PI * 2)
      break
    case 'square': {
      const half = radius * 0.85
      ctx.rect(x - half, y - half, half * 2, half * 2)
      break
    }
    case 'heart':
      ctx.moveTo(x, y + radius * 0.6)
      ctx.bezierCurveTo(
        x - radius * 1.2,
        y - radius * 0.3,
        x - radius * 0.4,
        y - radius,
        x,
        y - radius * 0.4
      )
      ctx.bezierCurveTo(
        x + radius * 0.4,
        y - radius,
        x + radius * 1.2,
        y - radius * 0.3,
        x,
        y + radius * 0.6
      )
      break
    default:
      ctx.arc(x, y, radius, 0, Math.PI * 2)
  }
  ctx.closePath()
  /* 径向渐变 */
  const gradient = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.3,
    radius * 0.1,
    x,
    y,
    radius
  )
  gradient.addColorStop(0, lightenColor(color, 60))
  gradient.addColorStop(0.4, color)
  gradient.addColorStop(1, darkenColor(color, 40))
  ctx.fillStyle = gradient
  ctx.fill()
  /* 边缘描边 */
  ctx.strokeStyle = darkenColor(color, 60)
  ctx.lineWidth = 1
  ctx.stroke()
  /* 高光点 */
  ctx.beginPath()
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.15, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.fill()
  ctx.restore()
}

/**
 * 在海报 Canvas 上绘制串珠模式饰品图
 * 根据 design_data.beads 和模板 layout.shape 计算坐标并绘制
 *
 * @param ctx - Canvas 2D 上下文
 * @param areaX - 绘制区域左上角 X
 * @param areaY - 绘制区域左上角 Y
 * @param areaW - 绘制区域宽度
 * @param areaH - 绘制区域高度
 * @param beads - 珠子列表（来自 design_data.beads）
 * @param layout - 模板 layout 配置
 */
function drawBeadingOnPoster(
  ctx: any,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
  beads: any[],
  layout: any
) {
  if (!beads || beads.length === 0) {
    return
  }
  const cx = areaX + areaW / 2
  const cy = areaY + areaH / 2
  const n = beads.length
  const shape = layout.shape || 'circle'
  const coords: { x: number; y: number }[] = []

  switch (shape) {
    case 'ellipse': {
      const rx = areaW * (layout.radius_x ? layout.radius_x / 400 : 0.4)
      const ry = areaH * (layout.radius_y ? layout.radius_y / 400 : 0.35)
      const step = (2 * Math.PI) / n
      for (let i = 0; i < n; i++) {
        const angle = i * step - Math.PI / 2
        coords.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
      }
      break
    }
    case 'arc': {
      const arcRad = ((layout.arc_angle || 180) * Math.PI) / 180
      const r = areaW * 0.38
      const startAngle = -Math.PI / 2 - arcRad / 2
      const step = arcRad / (n - 1 || 1)
      for (let i = 0; i < n; i++) {
        const angle = startAngle + i * step
        coords.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
      }
      break
    }
    case 'line': {
      const spacing = areaW / (n + 1)
      for (let i = 0; i < n; i++) {
        coords.push({ x: areaX + spacing * (i + 1), y: cy })
      }
      break
    }
    default: {
      /* circle（默认） */
      const r = Math.min(areaW, areaH) * 0.35
      const step = (2 * Math.PI) / n
      for (let i = 0; i < n; i++) {
        const angle = i * step - Math.PI / 2
        coords.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
      }
    }
  }

  /* 绘制导轨线（淡色虚线） */
  ctx.save()
  ctx.setLineDash([6, 4])
  ctx.strokeStyle = 'rgba(200,200,200,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath()
  if (shape === 'ellipse') {
    const rx = areaW * (layout.radius_x ? layout.radius_x / 400 : 0.4)
    const ry = areaH * (layout.radius_y ? layout.radius_y / 400 : 0.35)
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  } else if (shape === 'arc') {
    const arcRad = ((layout.arc_angle || 180) * Math.PI) / 180
    ctx.arc(cx, cy, areaW * 0.38, -Math.PI / 2 - arcRad / 2, -Math.PI / 2 + arcRad / 2)
  } else if (shape === 'line') {
    const spacing = areaW / (n + 1)
    ctx.moveTo(areaX + spacing * 0.5, cy)
    ctx.lineTo(areaX + areaW - spacing * 0.5, cy)
  } else {
    ctx.arc(cx, cy, Math.min(areaW, areaH) * 0.35, 0, Math.PI * 2)
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()

  /* 绘制每颗珠子 */
  for (let i = 0; i < n; i++) {
    const bead = beads[i]
    const { x, y } = coords[i]
    /* 海报上珠子半径按直径等比放大（海报尺寸 750px，设计页约 300px） */
    const radius = Math.max(12, (bead.diameter || 8) * 2.5)
    const color = getGemColor(bead)
    drawGemOnCtx(ctx, x, y, radius, color, bead.shape || 'circle')
  }
}

/**
 * 在海报 Canvas 上绘制镶嵌模式饰品图（无底图时绘制几何占位 + 槽位宝石）
 *
 * @param ctx - Canvas 2D 上下文
 * @param areaX - 绘制区域左上角 X
 * @param areaY - 绘制区域左上角 Y
 * @param areaW - 绘制区域宽度
 * @param areaH - 绘制区域高度
 * @param fillings - 槽位填充数据（slotId → bead）
 * @param layout - 模板 layout 配置
 * @param categoryId - 分类ID（用于几何占位形状选择）
 */
function drawSlotsOnPoster(
  ctx: any,
  areaX: number,
  areaY: number,
  areaW: number,
  areaH: number,
  fillings: Record<string, any>,
  layout: any,
  categoryId: number
) {
  const slotDefs: any[] = layout.slot_definitions || []
  if (slotDefs.length === 0) {
    return
  }

  /* 计算底图绘制区域（保持宽高比，居中） */
  const bgW = layout.background_width || 400
  const bgH = layout.background_height || 500
  const bgAspect = bgW / bgH
  const canvasAspect = areaW / areaH
  let drawW: number
  let drawH: number
  if (bgAspect > canvasAspect) {
    drawW = areaW * 0.85
    drawH = drawW / bgAspect
  } else {
    drawH = areaH * 0.85
    drawW = drawH * bgAspect
  }
  const ox = areaX + (areaW - drawW) / 2
  const oy = areaY + (areaH - drawH) / 2
  const cxBg = ox + drawW / 2
  const cyBg = oy + drawH / 2

  /* 绘制几何占位底图（海报中不加载网络图片，用几何形状代替） */
  if (categoryId === 193) {
    /* 戒指: 银色环形 */
    ctx.beginPath()
    ctx.ellipse(cxBg, cyBg + drawH * 0.1, drawW * 0.4, drawH * 0.35, 0, 0, Math.PI * 2)
    const g = ctx.createLinearGradient(ox, oy, ox + drawW, oy + drawH)
    g.addColorStop(0, '#E8E8E8')
    g.addColorStop(0.5, '#C0C0C0')
    g.addColorStop(1, '#A0A0A0')
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = '#808080'
    ctx.lineWidth = 2
    ctx.stroke()
  } else {
    /* 吊坠: 水滴形金色轮廓 */
    ctx.beginPath()
    ctx.moveTo(cxBg, oy + drawH * 0.05)
    ctx.bezierCurveTo(
      cxBg + drawW * 0.45,
      oy + drawH * 0.25,
      cxBg + drawW * 0.4,
      oy + drawH * 0.75,
      cxBg,
      oy + drawH * 0.92
    )
    ctx.bezierCurveTo(
      cxBg - drawW * 0.4,
      oy + drawH * 0.75,
      cxBg - drawW * 0.45,
      oy + drawH * 0.25,
      cxBg,
      oy + drawH * 0.05
    )
    ctx.closePath()
    const gradient = ctx.createLinearGradient(ox, oy, ox, oy + drawH)
    gradient.addColorStop(0, '#F5E6CC')
    gradient.addColorStop(0.5, '#D4AF37')
    gradient.addColorStop(1, '#B8860B')
    ctx.fillStyle = gradient
    ctx.fill()
    ctx.strokeStyle = '#8B6914'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  /* 绘制槽位宝石 */
  for (const slot of slotDefs) {
    const sx = ox + slot.x * drawW
    const sy = oy + slot.y * drawH
    const sw = slot.width * drawW
    const sh = slot.height * drawH
    const gem = fillings[slot.slot_id]
    if (gem) {
      /* 已填入宝石 */
      const r = Math.min(sw, sh) / 2
      const color = getGemColor(gem)
      drawGemOnCtx(ctx, sx, sy, r, color, gem.shape || 'circle')
    } else {
      /* 空槽位: 虚线轮廓 */
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = '#CCCCCC'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(sx, sy, Math.min(sw, sh) / 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
    }
  }
}

Page({
  data: {
    /** 作品主键（后端 diy_work_id） */
    workId: 0,
    /** 设计总价（所有珠子价格之和，单一币种时直接展示） */
    totalPrice: 0,
    /** 模板名称 */
    templateName: '',
    /** 作品状态（draft/frozen/completed/cancelled） */
    workStatus: 'draft' as string,
    /** 是否正在处理中 */
    processing: false,
    /** 海报生成中 */
    posterGenerating: false,
    /** 作品完整数据（从后端获取，用于海报渲染） */
    _workData: null as any,
    /** 按 price_asset_code 分组的费用明细（从设计页传入，用于支付面板） */
    costBreakdown: [] as any[],
    /** 支付确认面板是否可见 */
    paymentPanelVisible: false,
    /** 模板ID（用于支付面板获取资产余额） */
    templateId: 0
  },

  onLoad(options: Record<string, string | undefined>) {
    const workId = Number(options.workId || 0)
    /**
     * costBreakdown 通过 URL 参数 JSON 编码传入
     * 格式: [{ asset_code, amount, bead_count }]
     * 来源: diy-design.ts onSubmit → diyStore.costBreakdown
     */
    let costBreakdown: any[] = []
    if (options.costBreakdown) {
      try {
        costBreakdown = JSON.parse(decodeURIComponent(options.costBreakdown))
      } catch (_e) {
        /* 解析失败使用空数组，支付面板会从后端重新计算 */
      }
    }
    this.setData({
      workId,
      totalPrice: Number(options.totalPrice || 0),
      templateName: decodeURIComponent(options.templateName || ''),
      templateId: Number(options.templateId || 0),
      costBreakdown
    })
    /* 异步获取作品完整数据（含模板+设计数据，用于海报饰品渲染） */
    if (workId) {
      this._fetchWorkData(workId)
    }
  },

  /**
   * 获取作品完整数据（含关联模板和设计数据）
   * 后端API: GET /api/v4/diy/works/:id
   * 用于海报中渲染饰品图 + 提取材料标签
   */
  async _fetchWorkData(workId: number) {
    try {
      const res = await API.getDiyWorkById(workId)
      if (res.success && res.data) {
        this.data._workData = res.data
        /* 如果 templateId 未通过 URL 传入，从作品数据中获取 */
        if (!this.data.templateId && res.data.diy_template_id) {
          this.setData({ templateId: res.data.diy_template_id })
        }
      }
    } catch (_err) {
      /* 获取失败不阻塞页面，海报渲染时降级为纯文字 */
    }
  },

  /**
   * 确认设计 — 打开支付确认面板
   * 用户点击"确认设计"按钮 → 弹出支付面板展示费用明细和资产余额
   * 实际冻结操作在 onPaymentConfirm 中执行
   */
  onConfirmDesign() {
    if (this.data.processing || !this.data.workId) {
      return
    }
    if (this.data.costBreakdown.length === 0) {
      wx.showToast({ title: '费用明细为空，请返回重新设计', icon: 'none' })
      return
    }
    this.setData({ paymentPanelVisible: true })
  },

  /** 关闭支付确认面板 */
  onPaymentPanelClose() {
    this.setData({ paymentPanelVisible: false })
  },

  /**
   * 支付面板确认回调 — 执行冻结操作（draft → frozen）
   * 后端API: POST /api/v4/diy/works/:id/confirm
   * 携带 payments 数组（从支付面板组件 triggerEvent 传入）
   */
  async onPaymentConfirm(e: WechatMiniprogram.CustomEvent) {
    const payments = e.detail.payments as API.DiyTotalCostItem[]
    if (!payments || payments.length === 0) {
      wx.showToast({ title: '支付明细为空', icon: 'none' })
      return
    }
    this.setData({ processing: true, paymentPanelVisible: false })
    wx.showLoading({ title: '确认中...' })
    try {
      const res = await API.confirmDiyWork(this.data.workId, payments)
      wx.hideLoading()
      if (res.success && res.data) {
        this.setData({ workStatus: res.data.status, processing: false })
        wx.showToast({ title: '材料已冻结', icon: 'success' })
      } else {
        this.setData({ processing: false })
        wx.showToast({ title: res.message || '确认失败', icon: 'none' })
      }
    } catch (_err) {
      wx.hideLoading()
      this.setData({ processing: false })
      wx.showToast({ title: '网络异常，请重试', icon: 'none' })
    }
  },

  /**
   * 完成设计 — 从冻结扣减 + 铸造物品（frozen → completed）
   * 后端API: POST /api/v4/diy/works/:id/complete
   */
  async onCompleteDesign() {
    if (this.data.processing || this.data.workStatus !== 'frozen') {
      return
    }
    this.setData({ processing: true })
    wx.showModal({
      title: '完成设计',
      content: '确认后将从冻结余额中扣除材料并铸造饰品，此操作不可撤销。',
      confirmText: '完成',
      cancelText: '取消',
      success: async modalRes => {
        if (!modalRes.confirm) {
          this.setData({ processing: false })
          return
        }
        wx.showLoading({ title: '铸造中...' })
        try {
          const res = await API.completeDiyWork(this.data.workId)
          wx.hideLoading()
          if (res.success && res.data) {
            this.setData({ workStatus: res.data.status, processing: false })
            wx.showToast({ title: '饰品铸造成功', icon: 'success' })
          } else {
            this.setData({ processing: false })
            wx.showToast({ title: res.message || '铸造失败', icon: 'none' })
          }
        } catch (_err) {
          wx.hideLoading()
          this.setData({ processing: false })
          wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        }
      }
    })
  },

  /**
   * 取消设计 — 解冻材料（frozen → cancelled）
   * 后端API: POST /api/v4/diy/works/:id/cancel
   */
  async onCancelDesign() {
    if (this.data.processing || this.data.workStatus !== 'frozen') {
      return
    }
    wx.showModal({
      title: '取消设计',
      content: '取消后冻结的材料将被解冻归还。',
      confirmText: '确认取消',
      cancelText: '暂不取消',
      success: async modalRes => {
        if (!modalRes.confirm) {
          return
        }
        this.setData({ processing: true })
        wx.showLoading({ title: '取消中...' })
        try {
          const res = await API.cancelDiyWork(this.data.workId)
          wx.hideLoading()
          if (res.success && res.data) {
            this.setData({ workStatus: res.data.status, processing: false })
            wx.showToast({ title: '已取消，材料已解冻', icon: 'none' })
          } else {
            this.setData({ processing: false })
            wx.showToast({ title: res.message || '取消失败', icon: 'none' })
          }
        } catch (_err) {
          wx.hideLoading()
          this.setData({ processing: false })
          wx.showToast({ title: '网络异常', icon: 'none' })
        }
      }
    })
  },

  /** 删除草稿（仅 draft 状态可删） */
  async onDeleteDraft() {
    if (this.data.workStatus !== 'draft' || !this.data.workId) {
      return
    }
    wx.showModal({
      title: '删除草稿',
      content: '确定要删除这个设计草稿吗？此操作不可撤销。',
      confirmText: '删除',
      confirmColor: '#ff4d4f',
      success: async modalRes => {
        if (!modalRes.confirm) {
          return
        }
        wx.showLoading({ title: '删除中...' })
        try {
          const res = await API.deleteDiyWork(this.data.workId)
          wx.hideLoading()
          if (res.success) {
            wx.showToast({ title: '已删除', icon: 'success' })
            setTimeout(() => wx.navigateBack({ delta: 2 }), 1500)
          } else {
            wx.showToast({ title: res.message || '删除失败', icon: 'none' })
          }
        } catch (_err) {
          wx.hideLoading()
          wx.showToast({ title: '网络异常', icon: 'none' })
        }
      }
    })
  },

  /** 分享给朋友 */
  onShare() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage'] as any[] })
  },

  /**
   * 保存海报 — 750x1334 @2x 三段式离屏Canvas渲染
   *
   * 布局:
   *   顶部 120px: 品牌渐变背景 + "养个石头" 品牌名
   *   中间 900px: 饰品渲染图(500px) + 作品名称 + 材料标签 + 总价，背景色 #F8F6F3
   *   底部 314px: 小程序码(200x200) + "扫码查看我的设计" + 用户昵称
   *
   * 注意: 小程序码需要后端提供 GET /api/v4/diy/works/:id/qrcode 接口
   *       该接口尚未实现，海报中小程序码区域暂显示占位提示
   */
  async onSavePoster() {
    if (this.data.posterGenerating) {
      return
    }
    this.setData({ posterGenerating: true })
    wx.showLoading({ title: '生成海报中...' })
    try {
      await this._generatePoster()
    } catch (_err) {
      wx.hideLoading()
      this.setData({ posterGenerating: false })
      wx.showToast({ title: '海报生成失败', icon: 'none' })
    }
  },

  /**
   * 从作品数据中提取去重的材料名称列表（用于海报材料标签展示）
   * 串珠模式: 从 design_data.beads 提取 display_name
   * 镶嵌模式: 从 design_data.fillings 提取 display_name
   */
  _extractMaterialTags(workData: any): string[] {
    if (!workData || !workData.design_data) {
      return []
    }
    const designData = workData.design_data
    const names = new Set<string>()
    if (designData.mode === 'beading' && Array.isArray(designData.beads)) {
      for (const bead of designData.beads) {
        if (bead.display_name) {
          names.add(bead.display_name)
        }
      }
    } else if (designData.mode === 'slots' && designData.fillings) {
      for (const slotId of Object.keys(designData.fillings)) {
        const gem = designData.fillings[slotId]
        if (gem && gem.display_name) {
          names.add(gem.display_name)
        }
      }
    }
    return Array.from(names)
  },

  /** 离屏Canvas海报渲染（含饰品图 + 材料标签 + 用户昵称） */
  async _generatePoster() {
    const query = this.createSelectorQuery()
    query
      .select('#posterCanvas')
      .fields({ node: true, size: true })
      .exec(async (res: any) => {
        if (!res || !res[0] || !res[0].node) {
          wx.hideLoading()
          this.setData({ posterGenerating: false })
          wx.showToast({ title: '海报画布初始化失败', icon: 'none' })
          return
        }
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        /* 设置画布物理尺寸（@2x） */
        canvas.width = POSTER_WIDTH
        canvas.height = POSTER_HEIGHT

        /* ===== 顶部 120px: 品牌渐变背景 ===== */
        const topGradient = ctx.createLinearGradient(0, 0, POSTER_WIDTH, 120)
        topGradient.addColorStop(0, POSTER_BRAND_COLOR)
        topGradient.addColorStop(1, '#FF8F5E')
        ctx.fillStyle = topGradient
        ctx.fillRect(0, 0, POSTER_WIDTH, 120)
        /* 品牌名 */
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 36px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('养个石头', POSTER_WIDTH / 2, 60)

        /* ===== 中间 900px: 饰品渲染图 + 作品信息 ===== */
        ctx.fillStyle = POSTER_BG_COLOR
        ctx.fillRect(0, 120, POSTER_WIDTH, 900)

        /* 饰品渲染区域（中间区域上半部分 500px，留 50px 上下边距） */
        const workData = this.data._workData
        const jewelryAreaX = 75
        const jewelryAreaY = 170
        const jewelryAreaW = 600
        const jewelryAreaH = 500
        if (workData && workData.design_data && workData.template) {
          const designData = workData.design_data
          const template = workData.template
          const layout = template.layout || {}
          if (designData.mode === 'beading' && Array.isArray(designData.beads)) {
            /* 串珠模式: 绘制珠子排列 */
            drawBeadingOnPoster(
              ctx,
              jewelryAreaX,
              jewelryAreaY,
              jewelryAreaW,
              jewelryAreaH,
              designData.beads,
              layout
            )
          } else if (designData.mode === 'slots' && designData.fillings) {
            /* 镶嵌模式: 绘制底图占位 + 槽位宝石 */
            drawSlotsOnPoster(
              ctx,
              jewelryAreaX,
              jewelryAreaY,
              jewelryAreaW,
              jewelryAreaH,
              designData.fillings,
              layout,
              template.category_id || 194
            )
          }
        }

        /* 作品名称（饰品图下方） */
        ctx.fillStyle = '#333333'
        ctx.font = 'bold 40px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(this.data.templateName || '我的设计', POSTER_WIDTH / 2, 720)

        /* 材料标签（作品名称下方，去重展示使用的材料种类） */
        const materialTags = this._extractMaterialTags(workData)
        if (materialTags.length > 0) {
          ctx.fillStyle = '#888888'
          ctx.font = '22px sans-serif'
          /* 最多展示 6 个标签，超出显示省略 */
          const displayTags = materialTags.slice(0, 6)
          const tagText = displayTags.join(' · ') + (materialTags.length > 6 ? ' ...' : '')
          ctx.fillText(tagText, POSTER_WIDTH / 2, 770)
        }

        /* 总价标签 */
        ctx.fillStyle = POSTER_BRAND_COLOR
        ctx.font = '28px sans-serif'
        ctx.fillText(`${this.data.totalPrice} 星石`, POSTER_WIDTH / 2, 820)

        /* 装饰线 */
        ctx.strokeStyle = '#E0E0E0'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(250, 870)
        ctx.lineTo(500, 870)
        ctx.stroke()

        /* ===== 底部 314px: 小程序码 + 引导文案 + 用户昵称 ===== */
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 1020, POSTER_WIDTH, 314)

        /*
         * 小程序码（200x200）
         * 调用 GET /api/v4/diy/works/:id/qrcode 获取小程序码图片URL
         * 若后端接口未开通，前端明确提示并显示占位区，不生成伪二维码
         */
        let qrcodeDrawn = false
        try {
          const qrcodeRes = await API.getDiyWorkQrcode(this.data.workId)
          if (qrcodeRes?.data?.qrcode_url) {
            /* 下载小程序码图片到本地临时路径 */
            const downloadRes =
              await new Promise<WechatMiniprogram.DownloadFileSuccessCallbackResult>(
                (resolve, reject) => {
                  wx.downloadFile({
                    url: qrcodeRes.data.qrcode_url,
                    success: resolve,
                    fail: reject
                  })
                }
              )
            if (downloadRes.statusCode === 200 && downloadRes.tempFilePath) {
              const qrcodeImg = canvas.createImage()
              await new Promise<void>((resolve, reject) => {
                qrcodeImg.onload = () => {
                  resolve()
                }
                qrcodeImg.onerror = () => {
                  reject(new Error('小程序码图片加载失败'))
                }
                qrcodeImg.src = downloadRes.tempFilePath
              })
              /* 绘制小程序码（居中，200x200） */
              const qrcodeSize = 200
              const qrcodeX = (POSTER_WIDTH - qrcodeSize) / 2
              const qrcodeY = 1020
              ctx.drawImage(qrcodeImg, qrcodeX, qrcodeY, qrcodeSize, qrcodeSize)
              qrcodeDrawn = true
            }
          }
        } catch (qrcodeError: any) {
          /* 小程序码获取失败不阻塞海报生成，明确区分接口未开通与普通下载失败 */
          if (qrcodeError?.code === 'DIY_QRCODE_API_UNAVAILABLE') {
            wx.showToast({ title: '小程序码接口未开通', icon: 'none' })
          } else {
            log.warn('海报小程序码获取失败，使用占位提示')
          }
        }
        /* 小程序码获取失败时的降级占位 */
        if (!qrcodeDrawn) {
          ctx.strokeStyle = '#E0E0E0'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(POSTER_WIDTH / 2, 1120, 60, 0, Math.PI * 2)
          ctx.stroke()
          ctx.fillStyle = '#CCCCCC'
          ctx.font = '20px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('小程序码', POSTER_WIDTH / 2, 1120)
        }

        /* 引导文案 */
        ctx.fillStyle = '#666666'
        ctx.font = '24px sans-serif'
        ctx.fillText('扫码查看我的设计', POSTER_WIDTH / 2, 1210)

        /* 用户昵称（从 userStore 获取） */
        const nickname = userStore.nickname || '用户'
        ctx.fillStyle = '#999999'
        ctx.font = '22px sans-serif'
        ctx.fillText(nickname, POSTER_WIDTH / 2, 1255)

        /* 底部品牌标识 */
        ctx.fillStyle = '#BBBBBB'
        ctx.font = '20px sans-serif'
        ctx.fillText('养个石头 DIY 饰品工坊', POSTER_WIDTH / 2, 1300)

        /* 导出图片并保存到相册 */
        wx.canvasToTempFilePath({
          canvas,
          width: POSTER_WIDTH,
          height: POSTER_HEIGHT,
          destWidth: POSTER_WIDTH,
          destHeight: POSTER_HEIGHT,
          fileType: 'png',
          success: tempRes => {
            wx.hideLoading()
            wx.saveImageToPhotosAlbum({
              filePath: tempRes.tempFilePath,
              success: () => {
                this.setData({ posterGenerating: false })
                wx.showToast({ title: '海报已保存到相册', icon: 'success' })
              },
              fail: saveErr => {
                this.setData({ posterGenerating: false })
                if (
                  (saveErr as any).errMsg?.includes('deny') ||
                  (saveErr as any).errMsg?.includes('auth')
                ) {
                  wx.showToast({ title: '请授权相册权限后重试', icon: 'none' })
                } else {
                  wx.showToast({ title: '保存失败', icon: 'none' })
                }
              }
            })
          },
          fail: () => {
            wx.hideLoading()
            this.setData({ posterGenerating: false })
            wx.showToast({ title: '海报导出失败', icon: 'none' })
          }
        })
      })
  },

  /** 继续编辑（返回设计页） */
  onBackToDesign() {
    wx.navigateBack()
  },

  /** 设计新款式（返回选择页） */
  onBackToSelect() {
    wx.navigateBack({ delta: 2 })
  },

  onShareAppMessage() {
    return {
      title: `来看看我设计的${this.data.templateName}`,
      path: `/packageDIY/diy-design/diy-design?workId=${this.data.workId}`
    }
  }
})
