/**
 * 通用形状渲染引擎 - Canvas 2D 组件
 *
 * 根据款式模板的 layout.shape 分发到不同的坐标计算策略和绘制逻辑
 * 支持五种形状: circle / ellipse / arc / line / slots
 *
 * 串珠模式（circle/ellipse/arc/line）: 珠子沿几何形状等角度/等间距排列
 * 镶嵌模式（slots）: 加载后端底图 + 在预定义槽位上绘制宝石
 *
 * 后端数据对齐:
 *   模板 layout.shape — 形状类型
 *   模板 layout.slot_definitions — 镶嵌模式槽位列表
 *   模板 layout.background_width/height — 底图设计尺寸
 *   模板 base_image_media — 底图 MediaFile（含 public_url / thumbnails）
 *
 * @file shape-renderer 组件
 */

const { diyStore } = require('../../../store/diy')

/* ===== UI 常量（颜色映射，后端提供真实图片后仅作 fallback） ===== */

/** group_code → Canvas 绘制颜色映射（按后端 asset_group_defs 6色分组） */
const GROUP_COLOR_MAP: Record<string, string> = {
  red: '#E0115F',
  orange: '#FF8C00',
  yellow: '#FFC87C',
  green: '#50C878',
  blue: '#0F52BA',
  purple: '#9966CC'
}

/** 根据珠子 group_code 获取绘制颜色（优先 group_code，降级 material_name） */
function getGemColor(bead: any): string {
  if (bead.group_code && GROUP_COLOR_MAP[bead.group_code]) {
    return GROUP_COLOR_MAP[bead.group_code]
  }
  return '#999'
}

/** 颜色变亮（用于径向渐变高光） */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(2.55 * percent))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent))
  const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent))
  return `rgb(${r},${g},${b})`
}

/** 颜色变暗（用于径向渐变阴影） */
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(2.55 * percent))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * percent))
  const b = Math.max(0, (num & 0xff) - Math.round(2.55 * percent))
  return `rgb(${r},${g},${b})`
}

/** 绘制宝石（径向渐变 + 高光点，支持 circle/oval/square/heart 形状） */
function drawGem(ctx: any, x: number, y: number, radius: number, color: string, gemShape: string) {
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

/** 绘制槽位轮廓（circle/oval/square/rectangle） */
function drawSlotOutline(ctx: any, shape: string, x: number, y: number, w: number, h: number) {
  ctx.beginPath()
  switch (shape) {
    case 'oval':
      ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2)
      break
    case 'square':
    case 'rectangle':
      ctx.rect(x - w / 2, y - h / 2, w, h)
      break
    default:
      ctx.arc(x, y, Math.min(w, h) / 2, 0, Math.PI * 2)
  }
  ctx.stroke()
}

Component({
  properties: {
    canvasWidth: { type: Number, value: 300 },
    canvasHeight: { type: Number, value: 300 }
  },

  data: {
    _ctx: null as any,
    _canvas: null as any,
    _dpr: 1,
    /** 珠子位置信息（供点击检测） */
    _beadPositions: [] as { x: number; y: number; radius: number; index: number }[],
    /** 槽位位置信息（供点击检测） */
    _slotPositions: [] as { x: number; y: number; w: number; h: number; slotId: string }[],
    /** 镶嵌模式底图缓存（避免每次重绘重新加载） */
    _bgImage: null as any,
    /** 底图加载状态 */
    _bgImageLoaded: false,
    /** 珠子图片缓存（key: public_url → value: Image 对象） */
    _beadImageCache: {} as Record<string, any>,
    /** 珠子图片加载中的 URL 集合（防止重复加载，用对象模拟 Set） */
    _beadImageLoading: {} as Record<string, boolean>
  },

  lifetimes: {
    attached() {
      this.setData({ _dpr: wx.getWindowInfo().pixelRatio || 2 })
    },
    ready() {
      this._initCanvas()
    }
  },

  methods: {
    /** 初始化 Canvas 2D */
    _initCanvas() {
      const query = this.createSelectorQuery()
      query
        .select('#diy-canvas')
        .fields({ node: true, size: true })
        .exec((res: any) => {
          if (!res || !res[0] || !res[0].node) {
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = this.data._dpr
          canvas.width = this.properties.canvasWidth * dpr
          canvas.height = this.properties.canvasHeight * dpr
          ctx.scale(dpr, dpr)
          this.data._canvas = canvas
          this.data._ctx = ctx
          this.render()
        })
    },

    /** 外部调用: 触发重绘 */
    render() {
      const ctx = this.data._ctx
      if (!ctx) {
        return
      }
      const w = this.properties.canvasWidth
      const h = this.properties.canvasHeight
      ctx.clearRect(0, 0, w, h)
      const template = diyStore.currentTemplate
      if (!template) {
        return
      }
      const shape = template.layout.shape
      if (shape === 'slots') {
        this._renderSlots(ctx, w, h, template)
      } else {
        this._renderBeads(ctx, w, h, template, shape)
      }
    },

    /** 渲染串珠模式（circle/ellipse/arc/line） */
    _renderBeads(ctx: any, w: number, h: number, template: API.DiyTemplate, shape: string) {
      const beads = diyStore.selectedBeads
      const cx = w / 2
      const cy = h / 2
      const positions: any[] = []

      if (beads.length === 0) {
        /* 空状态: 虚线轮廓 + 占位圆点 + 引导文案 */
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#D1D5DB'
        ctx.lineWidth = 2
        ctx.beginPath()
        /* 占位圆点数量（暗示珠子排列位置） */
        const placeholderCount = 12
        if (shape === 'ellipse') {
          const rx =
            w * ((template.layout as any).radius_x ? (template.layout as any).radius_x / 400 : 0.4)
          const ry =
            h * ((template.layout as any).radius_y ? (template.layout as any).radius_y / 400 : 0.35)
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
          /* 沿椭圆等角度绘制占位圆点 */
          const pStep = (2 * Math.PI) / placeholderCount
          for (let i = 0; i < placeholderCount; i++) {
            const angle = i * pStep - Math.PI / 2
            ctx.beginPath()
            ctx.arc(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle), 4, 0, Math.PI * 2)
            ctx.fillStyle = '#D1D5DB'
            ctx.fill()
          }
        } else if (shape === 'arc') {
          const arcRad = (((template.layout as any).arc_angle || 180) * Math.PI) / 180
          const arcR = w * 0.38
          ctx.arc(cx, cy, arcR, -Math.PI / 2 - arcRad / 2, -Math.PI / 2 + arcRad / 2)
          ctx.stroke()
          ctx.setLineDash([])
          /* 沿弧线等角度绘制占位圆点 */
          const arcStart = -Math.PI / 2 - arcRad / 2
          const arcStep = arcRad / (placeholderCount - 1 || 1)
          for (let i = 0; i < placeholderCount; i++) {
            const angle = arcStart + i * arcStep
            ctx.beginPath()
            ctx.arc(cx + arcR * Math.cos(angle), cy + arcR * Math.sin(angle), 4, 0, Math.PI * 2)
            ctx.fillStyle = '#D1D5DB'
            ctx.fill()
          }
        } else {
          /* circle（默认） */
          const circleR = Math.min(w, h) * 0.35
          ctx.arc(cx, cy, circleR, 0, Math.PI * 2)
          ctx.stroke()
          ctx.setLineDash([])
          /* 沿圆环等角度绘制占位圆点 */
          const cStep = (2 * Math.PI) / placeholderCount
          for (let i = 0; i < placeholderCount; i++) {
            const angle = i * cStep - Math.PI / 2
            ctx.beginPath()
            ctx.arc(
              cx + circleR * Math.cos(angle),
              cy + circleR * Math.sin(angle),
              4,
              0,
              Math.PI * 2
            )
            ctx.fillStyle = '#D1D5DB'
            ctx.fill()
          }
        }
        /* 引导文案 */
        ctx.fillStyle = '#9CA3AF'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('点击下方素材开始设计', cx, cy)
        this.data._beadPositions = []
        return
      }

      /* 绘制导轨线（淡色虚线） */
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = 'rgba(200,200,200,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()

      /* 计算珠子坐标 */
      const coords: { x: number; y: number }[] = []
      const n = beads.length
      switch (shape) {
        case 'ellipse': {
          const rx =
            w * ((template.layout as any).radius_x ? (template.layout as any).radius_x / 400 : 0.4)
          const ry =
            h * ((template.layout as any).radius_y ? (template.layout as any).radius_y / 400 : 0.35)
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
          const step = (2 * Math.PI) / n
          for (let i = 0; i < n; i++) {
            const angle = i * step - Math.PI / 2
            coords.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
          }
          break
        }
        case 'arc': {
          const arcRad = (((template.layout as any).arc_angle || 180) * Math.PI) / 180
          const r = w * 0.38
          const startAngle = -Math.PI / 2 - arcRad / 2
          ctx.arc(cx, cy, r, startAngle, startAngle + arcRad)
          const step = arcRad / (n - 1 || 1)
          for (let i = 0; i < n; i++) {
            coords.push({
              x: cx + r * Math.cos(startAngle + i * step),
              y: cy + r * Math.sin(startAngle + i * step)
            })
          }
          break
        }
        case 'line': {
          const spacing = w / (n + 1)
          ctx.moveTo(spacing * 0.5, cy)
          ctx.lineTo(w - spacing * 0.5, cy)
          for (let i = 0; i < n; i++) {
            coords.push({ x: spacing * (i + 1), y: cy })
          }
          break
        }
        default: {
          const r = Math.min(w, h) * 0.35
          ctx.arc(cx, cy, r, 0, Math.PI * 2)
          const step = (2 * Math.PI) / n
          for (let i = 0; i < n; i++) {
            const angle = i * step - Math.PI / 2
            coords.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
          }
        }
      }
      ctx.stroke()
      ctx.setLineDash([])

      /* 绘制珠子（优先真实图片，无图降级颜色块） */
      const highlighted = new Set(diyStore.highlightedIndices)
      for (let i = 0; i < n; i++) {
        const bead = beads[i]
        const { x, y } = coords[i]
        const radius = Math.max(8, bead.diameter * 1.5)
        /* 尝试绘制真实图片，失败则用颜色块 */
        const drawnImage = this._drawBeadImage(ctx, bead, x, y, radius)
        if (!drawnImage) {
          const color = getGemColor(bead)
          drawGem(ctx, x, y, radius, color, bead.shape || 'circle')
        }
        /* 选中高亮（品牌橙色边框） */
        if (highlighted.has(i)) {
          ctx.beginPath()
          ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
          ctx.strokeStyle = '#5B7A5E'
          ctx.lineWidth = 2.5
          ctx.stroke()
        }
        positions.push({ x, y, radius: radius + 3, index: i })
      }
      this.data._beadPositions = positions
    },

    /**
     * 渲染镶嵌模式（slots）
     * 优先加载后端 base_image_media 真实底图，无底图时绘制几何占位
     */
    _renderSlots(ctx: any, w: number, h: number, template: API.DiyTemplate) {
      const layout = template.layout as any
      const slotDefs: API.DiySlotDefinition[] = layout.slot_definitions || []
      if (slotDefs.length === 0) {
        return
      }
      /**
       * 计算底图绘制区域（保持宽高比，居中）
       * background_width/height 由后端 diy_templates.layout 提供（底图原始像素尺寸）
       * 严格按后端数据等比缩放填满 Canvas，不做任何额外放大/缩小
       */
      const bgW = layout.background_width || 800
      const bgH = layout.background_height || 1000
      const bgAspect = bgW / bgH
      const canvasAspect = w / h
      let drawW: number
      let drawH: number
      if (bgAspect > canvasAspect) {
        drawW = w
        drawH = drawW / bgAspect
      } else {
        drawH = h
        drawW = drawH * bgAspect
      }
      const ox = (w - drawW) / 2
      const oy = (h - drawH) / 2

      /* 尝试加载后端真实底图 */
      const bgMediaUrl = this._getBaseImageUrl(template)
      if (bgMediaUrl && this.data._bgImageLoaded && this.data._bgImage) {
        /* 底图已缓存，直接绘制 */
        ctx.drawImage(this.data._bgImage, ox, oy, drawW, drawH)
        this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
      } else if (bgMediaUrl && !this.data._bgImageLoaded) {
        /* 首次加载底图 */
        this.data._bgImageLoaded = true
        const img = this.data._canvas.createImage()
        img.onload = () => {
          this.data._bgImage = img
          this.render()
        }
        img.onerror = () => {
          /* 底图加载失败，使用几何占位 */
          this.data._bgImage = null
          this._drawFallbackBackground(ctx, drawW, drawH, ox, oy, template.category_id)
          this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
        }
        img.src = bgMediaUrl
        /* 加载中先画占位 */
        this._drawFallbackBackground(ctx, drawW, drawH, ox, oy, template.category_id)
        this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
      } else {
        /* 无底图 URL，使用几何占位 */
        this._drawFallbackBackground(ctx, drawW, drawH, ox, oy, template.category_id)
        this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
      }
    },

    /**
     * 从模板数据中提取底图 URL
     * 降级链: base_image_media.thumbnails.large → base_image_media.public_url → 空
     */
    _getBaseImageUrl(template: API.DiyTemplate): string {
      const media = (template as any).base_image_media
      if (media) {
        return media.thumbnails?.large || media.public_url || ''
      }
      return ''
    },

    /**
     * 获取珠子图片 URL
     * 降级链: image_media.thumbnails.medium → image_media.public_url → 空
     */
    _getBeadImageUrl(bead: any): string {
      const media = bead.image_media
      if (media) {
        return media.thumbnails?.medium || media.public_url || ''
      }
      return ''
    },

    /**
     * 加载珠子图片到缓存（异步，加载完成后自动触发重绘）
     * 使用 _beadImageLoading 防止同一 URL 重复加载
     */
    _loadBeadImage(url: string) {
      if (!url || !this.data._canvas) {
        return
      }
      if (this.data._beadImageCache[url] || this.data._beadImageLoading[url]) {
        return
      }

      this.data._beadImageLoading[url] = true
      const img = this.data._canvas.createImage()
      img.onload = () => {
        this.data._beadImageCache[url] = img
        delete this.data._beadImageLoading[url]
        /* 图片加载完成，触发重绘让珠子显示真实图片 */
        this.render()
      }
      img.onerror = () => {
        delete this.data._beadImageLoading[url]
        /* 加载失败不缓存，下次重绘仍用颜色块 fallback */
      }
      img.src = url
    },

    /**
     * 在 Canvas 上绘制珠子图片（圆形裁剪）
     * 如果图片已缓存则直接绘制，否则触发异步加载并先用颜色块占位
     *
     * @returns true=已绘制图片, false=无图片需要 fallback
     */
    _drawBeadImage(
      ctx: any,
      bead: any,
      cx: number,
      cy: number,
      radius: number,
      slotW?: number,
      slotH?: number
    ): boolean {
      const url = this._getBeadImageUrl(bead)
      if (!url) {
        return false
      }

      const cachedImg = this.data._beadImageCache[url]
      if (!cachedImg) {
        /* 图片未缓存，触发异步加载，本次用颜色块 */
        this._loadBeadImage(url)
        return false
      }

      ctx.save()
      if (slotW && slotH) {
        /* 镶嵌模式: 按槽位矩形区域绘制，自动填满后端定义的 width × height */
        const halfW = slotW / 2
        const halfH = slotH / 2
        ctx.beginPath()
        ctx.ellipse(cx, cy, halfW, halfH, 0, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(cachedImg, cx - halfW, cy - halfH, slotW, slotH)
      } else {
        /* 串珠模式: 圆形裁剪绘制 */
        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(cachedImg, cx - radius, cy - radius, radius * 2, radius * 2)
      }
      ctx.restore()
      return true
    },

    /** 绘制几何占位底图（后端未上传底图时的 fallback） */
    _drawFallbackBackground(
      ctx: any,
      drawW: number,
      drawH: number,
      ox: number,
      oy: number,
      categoryId: number
    ) {
      const cxBg = ox + drawW / 2
      const cyBg = oy + drawH / 2
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
    },

    /**
     * 绘制槽位覆盖层（空槽位轮廓 / 已填宝石 / 激活高亮）
     *
     * 后端坐标语义（归一化 0~1，相对于底图原始尺寸）:
     *   slot.x / slot.y   — 槽位【中心点】坐标
     *   slot.width / slot.height — 槽位宽高
     *
     * 像素坐标转换:
     *   中心点 = (ox + slot.x * drawW, oy + slot.y * drawH)
     *   宝石绘制以中心点为基准，向四周扩展 width/2 和 height/2
     */
    _drawSlotOverlay(
      ctx: any,
      slotDefs: API.DiySlotDefinition[],
      drawW: number,
      drawH: number,
      ox: number,
      oy: number
    ) {
      const slotPositions: any[] = []
      const fillings = diyStore.slotFillings
      const activeId = diyStore.activeSlotId

      for (const slot of slotDefs) {
        /* 槽位中心点像素坐标（x,y 是归一化中心点） */
        const centerX = ox + slot.x * drawW
        const centerY = oy + slot.y * drawH
        /* 槽位像素尺寸 */
        const sw = slot.width * drawW
        const sh = slot.height * drawH
        const gem = fillings[slot.slot_id]
        if (gem) {
          /* 已填入宝石 — 以中心点为基准绘制 */
          const fillRadius = Math.min(sw, sh) / 2
          const drawnImage = this._drawBeadImage(ctx, gem, centerX, centerY, fillRadius, sw, sh)
          if (!drawnImage) {
            const color = getGemColor(gem)
            drawGem(ctx, centerX, centerY, fillRadius, color, gem.shape || 'circle')
          }
        } else {
          /* 空槽位: 虚线轮廓 + "+" 提示 */
          ctx.save()
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = '#9CA3AF'
          ctx.lineWidth = 1.5
          drawSlotOutline(ctx, slot.slot_shape || 'circle', centerX, centerY, sw, sh)
          ctx.restore()
          ctx.fillStyle = '#9CA3AF'
          ctx.font = `${Math.min(sw, sh) * 0.4}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('+', centerX, centerY)
        }

        /* 激活槽位高亮（品牌橙色实线边框） */
        if (slot.slot_id === activeId) {
          ctx.save()
          ctx.strokeStyle = '#5B7A5E'
          ctx.lineWidth = 2.5
          ctx.setLineDash([])
          drawSlotOutline(ctx, slot.slot_shape || 'circle', centerX, centerY, sw + 4, sh + 4)
          ctx.restore()
        }
        slotPositions.push({ x: centerX, y: centerY, w: sw, h: sh, slotId: slot.slot_id })
      }
      this.data._slotPositions = slotPositions
    },

    /** Canvas 点击事件（分发到珠子点击或槽位点击） */
    onCanvasTap(e: WechatMiniprogram.TouchEvent) {
      const touch = e.detail || e.touches?.[0]
      if (!touch) {
        return
      }
      const tx = touch.x
      const ty = touch.y
      const template = diyStore.currentTemplate
      if (!template) {
        return
      }
      if (template.layout.shape === 'slots') {
        /* 镶嵌模式: 检测槽位点击 */
        for (const sp of this.data._slotPositions) {
          if (Math.abs(tx - sp.x) < sp.w / 2 + 5 && Math.abs(ty - sp.y) < sp.h / 2 + 5) {
            this.triggerEvent('slottap', { slotId: sp.slotId })
            return
          }
        }
      } else {
        /* 串珠模式: 检测珠子点击 */
        for (const bp of this.data._beadPositions) {
          const dist = Math.sqrt((tx - bp.x) ** 2 + (ty - bp.y) ** 2)
          if (dist <= bp.radius + 5) {
            this.triggerEvent('beadtap', { index: bp.index })
            return
          }
        }
      }
    }
  }
})
