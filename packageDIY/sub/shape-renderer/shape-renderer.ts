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

/** 构建宝石轮廓路径（circle/oval/square/heart，供填充/裁剪复用） */
function buildGemPath(ctx: any, x: number, y: number, radius: number, gemShape: string) {
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
}

/**
 * 绘制宝石（占位画法，后端未传宝石图片时使用）
 * 质感构成: 底部投影 → 深色宝石体渐变 → 明刻面(圆形限定) → 环形底部反光 → 月牙高光 → 星光点
 */
function drawGem(ctx: any, x: number, y: number, radius: number, color: string, gemShape: string) {
  ctx.save()

  /* 底部软投影（让宝石"坐"在底座上而非漂浮） */
  ctx.beginPath()
  ctx.ellipse(x, y + radius * 0.82, radius * 0.78, radius * 0.2, 0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(30, 20, 10, 0.18)'
  ctx.fill()

  /* 宝石体: 多段径向渐变（亮心→本色→深边缘），比单一渐变更通透 */
  buildGemPath(ctx, x, y, radius, gemShape)
  const gradient = ctx.createRadialGradient(
    x - radius * 0.35,
    y - radius * 0.35,
    radius * 0.05,
    x,
    y,
    radius * 1.05
  )
  gradient.addColorStop(0, lightenColor(color, 80))
  gradient.addColorStop(0.25, lightenColor(color, 30))
  gradient.addColorStop(0.6, color)
  gradient.addColorStop(0.88, darkenColor(color, 35))
  gradient.addColorStop(1, darkenColor(color, 55))
  ctx.fillStyle = gradient
  ctx.fill()

  /* 以下细节全部裁剪在宝石轮廓内 */
  ctx.save()
  buildGemPath(ctx, x, y, radius, gemShape)
  ctx.clip()

  /* 刻面（仅圆形: 内八边形台面 + 放射刻面线，模拟明亮式切工） */
  if (gemShape !== 'oval' && gemShape !== 'square' && gemShape !== 'heart') {
    const tableR = radius * 0.52
    const facets = 8
    ctx.lineWidth = 1
    /* 台面八边形 */
    ctx.beginPath()
    for (let i = 0; i <= facets; i++) {
      const a = (i / facets) * Math.PI * 2 - Math.PI / 8
      const px = x + tableR * Math.cos(a)
      const py = y + tableR * Math.sin(a)
      if (i === 0) {
        ctx.moveTo(px, py)
      } else {
        ctx.lineTo(px, py)
      }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.stroke()
    /* 台面顶点 → 外缘的放射刻面线（亮暗交替，制造折射感） */
    for (let i = 0; i < facets; i++) {
      const a = (i / facets) * Math.PI * 2 - Math.PI / 8
      ctx.beginPath()
      ctx.moveTo(x + tableR * Math.cos(a), y + tableR * Math.sin(a))
      ctx.lineTo(x + radius * Math.cos(a), y + radius * Math.sin(a))
      ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)'
      ctx.stroke()
    }
  }

  /* 底缘环形反光（光从下方透出，增强宝石通透感） */
  const rimGlow = ctx.createRadialGradient(x, y, radius * 0.55, x, y, radius)
  rimGlow.addColorStop(0, 'rgba(255,255,255,0)')
  rimGlow.addColorStop(0.8, 'rgba(255,255,255,0)')
  rimGlow.addColorStop(0.95, 'rgba(255,255,255,0.22)')
  rimGlow.addColorStop(1, 'rgba(255,255,255,0.05)')
  ctx.fillStyle = rimGlow
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)

  /* 左上月牙高光（大而柔的主反光） */
  ctx.beginPath()
  ctx.ellipse(
    x - radius * 0.3,
    y - radius * 0.42,
    radius * 0.42,
    radius * 0.2,
    -Math.PI / 5,
    0,
    Math.PI * 2
  )
  const crescent = ctx.createRadialGradient(
    x - radius * 0.3,
    y - radius * 0.42,
    0,
    x - radius * 0.3,
    y - radius * 0.42,
    radius * 0.42
  )
  crescent.addColorStop(0, 'rgba(255,255,255,0.75)')
  crescent.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = crescent
  ctx.fill()
  ctx.restore()

  /* 边缘描边（收边） */
  buildGemPath(ctx, x, y, radius, gemShape)
  ctx.strokeStyle = darkenColor(color, 60)
  ctx.lineWidth = 1
  ctx.stroke()

  /* 星光点（四芒星 + 小圆点，点睛） */
  const sx = x - radius * 0.28
  const sy = y - radius * 0.3
  const sLen = radius * 0.22
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(sx - sLen, sy)
  ctx.lineTo(sx + sLen, sy)
  ctx.moveTo(sx, sy - sLen)
  ctx.lineTo(sx, sy + sLen)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(sx, sy, radius * 0.07, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.95)'
  ctx.fill()

  ctx.restore()
}

/**
 * 绘制槽位轮廓（对接文档 11.7-4: 后端标注器无 slot_shape 字段，
 * 按 width/height 像素比例画椭圆——两值相等即为正圆，支持绕中心旋转）
 * @param rotationRad 槽位旋转弧度（slot_definitions[].rotation 度数换算，0 不旋转）
 */
function drawSlotOutline(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  rotationRad: number = 0
) {
  ctx.beginPath()
  ctx.ellipse(x, y, w / 2, h / 2, rotationRad, 0, Math.PI * 2)
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
          /* 底图加载失败：画中性占位空框 + 提示（不再画金色几何饰品） */
          this.data._bgImage = null
          this._drawFallbackBackground(ctx, drawW, drawH, ox, oy, '底图待配置')
          this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
        }
        img.src = bgMediaUrl
        /* 加载中先画占位空框 + "加载中"提示 */
        this._drawFallbackBackground(ctx, drawW, drawH, ox, oy, '加载中…')
        this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
      } else {
        /* 无底图 URL：画中性占位空框 + "底图待配置"提示 */
        this._drawFallbackBackground(ctx, drawW, drawH, ox, oy, '底图待配置')
        this._drawSlotOverlay(ctx, slotDefs, drawW, drawH, ox, oy)
      }
    },

    /**
     * 从模板数据中提取底图 URL
     * 降级链（对接文档 11.7-1，后端衍生图档位 w375/w750/w1080）:
     *   base_image_media.thumbnails.w750 → base_image_media.public_url → 空
     */
    _getBaseImageUrl(template: API.DiyTemplate): string {
      const media = (template as any).base_image_media
      if (media) {
        return media.thumbnails?.w750 || media.public_url || ''
      }
      return ''
    },

    /**
     * 获取珠子/宝石图片 URL
     * 降级链（对接文档 11.7-1）: 镶嵌宝石图 thumbnails.w750 → public_url；
     * 串珠珠子小图 thumbnails.w375 → public_url（画布上直径仅数十px，w375 足够清晰）
     * @param variant 档位: 'w750'（镶嵌宝石）/ 'w375'（串珠珠子）
     */
    _getBeadImageUrl(bead: any, variant: 'w375' | 'w750' = 'w375'): string {
      const media = bead.image_media
      if (media) {
        return (media.thumbnails && media.thumbnails[variant]) || media.public_url || ''
      }
      return ''
    },

    /**
     * 预下载全量素材宝石图到缓存（外部在素材加载完成后调用）
     * 目的：用户点击填槽前图片已就绪，避免"先闪彩色占位、图片到位再覆盖"的过渡观感。
     * 复用 _loadBeadImage 的去重与缓存逻辑；镶嵌宝石用 w750 档，与填槽绘制档位一致。
     * @param beads diyStore 全量珠子原始对象数组（含 image_media）
     */
    prefetchBeadImages(beads: any[]) {
      if (!this.data._canvas || !Array.isArray(beads)) {
        return
      }
      for (const bead of beads) {
        const url = this._getBeadImageUrl(bead, 'w750')
        if (url) {
          this._loadBeadImage(url)
        }
      }
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
      /** 档位选择：镶嵌宝石图（有槽位尺寸）用 w750，串珠珠子小图用 w375（对接文档 11.7-1） */
      const url = this._getBeadImageUrl(bead, slotW && slotH ? 'w750' : 'w375')
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

    /**
     * 绘制宝石中性占位（图片异步加载未就绪时的过渡态）
     * 用中性浅灰圆填充 + 稍深描边，不使用宝石分组色，避免"先闪彩色再被真实图覆盖"的突兀观感。
     * 预下载（prefetchBeadImages）通常使点击时已缓存，本占位仅极短暂或弱网时出现。
     */
    _drawGemPlaceholder(ctx: any, cx: number, cy: number, radius: number) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fillStyle = '#ECECEC'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = '#D9D9D9'
      ctx.stroke()
      ctx.restore()
    },

    /**
     * 绘制底图占位（后端未上传底图 / 底图加载中或失败时的 fallback）
     *
     * 表现：干净的浅灰色圆角空框 + 居中状态文字，不再画金色几何饰品图形
     * （几何占位与真实底图槽位坐标对不上、观感突兀，故统一为中性占位）。
     * 真实底图（base_image_media）上传后走 drawImage 分支，本占位不再出现。
     *
     * @param statusText 占位区状态文案（加载中 / 底图待配置，由调用方按场景传入）
     */
    _drawFallbackBackground(
      ctx: any,
      drawW: number,
      drawH: number,
      ox: number,
      oy: number,
      statusText: string
    ) {
      const radius = Math.min(drawW, drawH) * 0.04
      /* 浅灰底 + 更浅描边的圆角空框 */
      ctx.save()
      ctx.beginPath()
      this._roundRectPath(ctx, ox, oy, drawW, drawH, radius)
      ctx.fillStyle = '#F5F5F5'
      ctx.fill()
      ctx.strokeStyle = '#E0E0E0'
      ctx.lineWidth = 1
      ctx.stroke()
      /* 居中状态文字 */
      ctx.fillStyle = '#9CA3AF'
      ctx.font = `${Math.max(12, Math.round(drawW * 0.045))}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(statusText, ox + drawW / 2, oy + drawH / 2)
      ctx.restore()
    },

    /** 画圆角矩形路径（占位空框用，兼容无原生 roundRect 的 Canvas 环境） */
    _roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w / 2, h / 2)
      ctx.moveTo(x + rr, y)
      ctx.arcTo(x + w, y, x + w, y + h, rr)
      ctx.arcTo(x + w, y + h, x, y + h, rr)
      ctx.arcTo(x, y + h, x, y, rr)
      ctx.arcTo(x, y, x + w, y, rr)
      ctx.closePath()
    },

    /**
     * 绘制槽位覆盖层（空槽位轮廓 / 已填宝石 / 激活高亮）
     *
     * 后端坐标语义（归一化 0~1，相对于底图原始尺寸，对接文档 10.3.1/11.7-4）:
     *   slot.x / slot.y   — 槽位【中心点】坐标
     *   slot.width / slot.height — 槽位宽高（分母分别为底图宽/高）
     *   slot.rotation     — 旋转角度（度，绕槽位中心），标注器输出
     *   slot.render_diameter — 渲染直径(mm)：有值时宝石按"素材直径/render_diameter"等比渲染
     *                          （render_diameter 即恰好填满槽位的毫米直径）；null 拉伸填满槽位
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
        /* 槽位旋转（度 → 弧度，绕槽位中心；标注器未设置时为 0 不旋转） */
        const rotationRad = slot.rotation ? (slot.rotation * Math.PI) / 180 : 0
        const gem = fillings[slot.slot_id]
        if (gem) {
          /**
           * 宝石绘制尺寸（render_diameter 等比模式，对接文档 11.7-4）:
           * render_diameter 有值且宝石有直径时，按 mm 比例缩放（素材直径/render_diameter），
           * 宝石居中放置在槽位区域内；否则拉伸填满整个槽位
           */
          let gemW = sw
          let gemH = sh
          if (slot.render_diameter && slot.render_diameter > 0 && gem.diameter > 0) {
            const scaleRatio = gem.diameter / slot.render_diameter
            gemW = sw * scaleRatio
            gemH = sh * scaleRatio
          }

          /* 旋转槽位：绕中心旋转画布后绘制宝石，保持与底图上的斜向槽位对齐 */
          if (rotationRad) {
            ctx.save()
            ctx.translate(centerX, centerY)
            ctx.rotate(rotationRad)
            ctx.translate(-centerX, -centerY)
          }
          const fillRadius = Math.min(gemW, gemH) / 2
          const drawnImage = this._drawBeadImage(ctx, gem, centerX, centerY, fillRadius, gemW, gemH)
          if (!drawnImage) {
            /* 图片尚未就绪：画中性浅灰占位圆而非彩色宝石，避免"先闪一下宝石颜色再被真实图覆盖"的突兀感 */
            this._drawGemPlaceholder(ctx, centerX, centerY, fillRadius)
          }
          if (rotationRad) {
            ctx.restore()
          }
        } else {
          /* 空槽位: 虚线椭圆轮廓（按 width/height 比例，含旋转）+ "+" 提示 */
          ctx.save()
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = '#9CA3AF'
          ctx.lineWidth = 1.5
          drawSlotOutline(ctx, centerX, centerY, sw, sh, rotationRad)
          ctx.restore()
          ctx.fillStyle = '#9CA3AF'
          ctx.font = `${Math.min(sw, sh) * 0.4}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('+', centerX, centerY)
        }

        /* 激活槽位高亮（品牌绿色实线边框，含旋转） */
        if (slot.slot_id === activeId) {
          ctx.save()
          ctx.strokeStyle = '#5B7A5E'
          ctx.lineWidth = 2.5
          ctx.setLineDash([])
          drawSlotOutline(ctx, centerX, centerY, sw + 4, sh + 4, rotationRad)
          ctx.restore()
        }
        slotPositions.push({ x: centerX, y: centerY, w: sw, h: sh, slotId: slot.slot_id })
      }
      this.data._slotPositions = slotPositions
    },

    /**
     * Canvas 点击事件（分发到珠子点击或槽位点击）
     *
     * 坐标系换算（关键）：canvas 的 bindtap 事件 e.detail.x/y 是相对【页面文档】的坐标，
     * 而 _slotPositions / _beadPositions 存的是相对【画布自身左上角】的坐标；
     * 两者原点不同（差画布上方所有元素的高度），必须换算否则命中检测永远落空。
     * 用画布 boundingClientRect 与触点 clientX/clientY（同为可视区坐标，滚动也一致）相减，
     * 得到相对画布左上角的本地坐标。
     */
    onCanvasTap(e: WechatMiniprogram.TouchEvent) {
      const template = diyStore.currentTemplate
      if (!template) {
        return
      }
      /* 触点可视区坐标：tap 源自 touchend，优先 changedTouches，其次 touches */
      const touch = e.changedTouches?.[0] || e.touches?.[0]
      this.createSelectorQuery()
        .select('#diy-canvas')
        .boundingClientRect((rect: any) => {
          if (!rect) {
            return
          }
          /* 换算为画布本地坐标（CSS px，与绘制坐标同一量纲）；无触点信息时兜底用 detail 直减 */
          const tx = touch ? touch.clientX - rect.left : (e.detail?.x || 0) - rect.left
          const ty = touch ? touch.clientY - rect.top : (e.detail?.y || 0) - rect.top
          this._dispatchCanvasHit(template, tx, ty)
        })
        .exec()
    },

    /** 命中分发：镶嵌模式取最近槽位、串珠模式取最近珠子（坐标已换算为画布本地坐标） */
    _dispatchCanvasHit(template: API.DiyTemplate, tx: number, ty: number) {
      if (template.layout.shape === 'slots') {
        /**
         * 镶嵌模式命中检测（取"最近"槽位而非遍历命中第一个）:
         * 槽位归一化尺寸可能很小（如手机链 height=0.097），折算像素后热区仅二三十像素，
         * 竖排多槽位手指难精准点中、且易误落相邻槽。故：
         *   1) 每个槽位命中热区在其自身半宽/半高基础上，保底 MIN_HIT_RADIUS（44px 触控友好尺寸的一半）；
         *   2) 命中候选中取"到点击点最近"的槽位，避免相邻槽误选。
         */
        const MIN_HIT_RADIUS = 22
        let nearest: { slotId: string; dist: number } | null = null
        for (const sp of this.data._slotPositions) {
          /* 各方向热区 = 槽位半尺寸与最小热区取较大值（保证小槽位也有足够可点面积） */
          const hitHalfW = Math.max(sp.w / 2, MIN_HIT_RADIUS)
          const hitHalfH = Math.max(sp.h / 2, MIN_HIT_RADIUS)
          if (Math.abs(tx - sp.x) <= hitHalfW && Math.abs(ty - sp.y) <= hitHalfH) {
            const dist = (tx - sp.x) ** 2 + (ty - sp.y) ** 2
            if (!nearest || dist < nearest.dist) {
              nearest = { slotId: sp.slotId, dist }
            }
          }
        }
        if (nearest) {
          this.triggerEvent('slottap', { slotId: nearest.slotId })
        }
      } else {
        /**
         * 串珠模式命中检测（取"最近"珠子）:
         * 小直径珠子热区不足时保底 MIN_HIT_RADIUS，避免点不中；
         * 珠子密排时取最近一颗，避免误选相邻珠。
         */
        const MIN_HIT_RADIUS = 22
        let nearest: { index: number; dist: number } | null = null
        for (const bp of this.data._beadPositions) {
          const dist = Math.sqrt((tx - bp.x) ** 2 + (ty - bp.y) ** 2)
          if (dist <= Math.max(bp.radius, MIN_HIT_RADIUS)) {
            if (!nearest || dist < nearest.dist) {
              nearest = { index: bp.index, dist }
            }
          }
        }
        if (nearest) {
          this.triggerEvent('beadtap', { index: nearest.index })
        }
      }
    }
  }
})
