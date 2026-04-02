/**
 * 通用形状渲染引擎 - Canvas 2D 组件
 *
 * 根据款式模板的 layout.shape 分发到不同的坐标计算策略和绘制逻辑
 * 支持: circle / ellipse / arc / line / slots
 *
 * @file shape-renderer 组件
 */

const { diyStore } = require('../../../store/diy')

/** 宝石材质 → Canvas 绘制颜色映射（UI常量，后端提供图片后此映射仅作 fallback） */
const GEM_COLOR_MAP: Record<string, string> = {
  红宝石: '#E0115F',
  蓝宝石: '#0F52BA',
  祖母绿: '#50C878',
  紫水晶: '#9966CC',
  黄玉: '#FFC87C',
  钻石: '#B9F2FF',
  粉晶: '#FF69B4',
  黑曜石: '#1C1C1C'
}

/** 根据材质名获取绘制颜色 */
function getGemColor(material: string): string {
  return GEM_COLOR_MAP[material] || '#999'
}

/** 颜色变亮 */
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(2.55 * percent))
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(2.55 * percent))
  const b = Math.min(255, (num & 0xff) + Math.round(2.55 * percent))
  return `rgb(${r},${g},${b})`
}

/** 颜色变暗 */
function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(2.55 * percent))
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(2.55 * percent))
  const b = Math.max(0, (num & 0xff) - Math.round(2.55 * percent))
  return `rgb(${r},${g},${b})`
}

/** 绘制宝石（优先使用图片，图片不可用时用颜色渐变绘制） */
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
    default: // circle
      ctx.arc(x, y, radius, 0, Math.PI * 2)
  }
  ctx.closePath()

  // 径向渐变
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

  // 边缘描边
  ctx.strokeStyle = darkenColor(color, 60)
  ctx.lineWidth = 1
  ctx.stroke()

  // 高光点
  ctx.beginPath()
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.15, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.fill()

  ctx.restore()
}

/** 绘制吊坠底图（后端提供 backgroundImage 后应替换为图片加载） */
function drawPendantBackground(ctx: any, drawW: number, drawH: number, ox: number, oy: number) {
  const cx = ox + drawW / 2
  const cy = oy + drawH / 2

  // 水滴形轮廓
  ctx.beginPath()
  ctx.moveTo(cx, oy + drawH * 0.05)
  ctx.bezierCurveTo(
    cx + drawW * 0.45,
    oy + drawH * 0.25,
    cx + drawW * 0.4,
    oy + drawH * 0.75,
    cx,
    oy + drawH * 0.92
  )
  ctx.bezierCurveTo(
    cx - drawW * 0.4,
    oy + drawH * 0.75,
    cx - drawW * 0.45,
    oy + drawH * 0.25,
    cx,
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

  // 顶部吊环
  ctx.beginPath()
  ctx.arc(cx, oy - drawH * 0.02, drawW * 0.06, 0, Math.PI * 2)
  ctx.strokeStyle = '#8B6914'
  ctx.lineWidth = 3
  ctx.stroke()

  // 装饰弧线
  ctx.strokeStyle = 'rgba(139, 105, 20, 0.3)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy + drawH * 0.1, drawW * 0.12 * i, -Math.PI * 0.8, -Math.PI * 0.2)
    ctx.stroke()
  }
}

/** 绘制戒指底图（后端提供 backgroundImage 后应替换为图片加载） */
function drawRingBackground(ctx: any, drawW: number, drawH: number, ox: number, oy: number) {
  const cx = ox + drawW / 2
  const cy = oy + drawH / 2

  // 外圈
  ctx.beginPath()
  ctx.ellipse(cx, cy + drawH * 0.1, drawW * 0.4, drawH * 0.35, 0, 0, Math.PI * 2)
  const g = ctx.createLinearGradient(ox, oy, ox + drawW, oy + drawH)
  g.addColorStop(0, '#E8E8E8')
  g.addColorStop(0.5, '#C0C0C0')
  g.addColorStop(1, '#A0A0A0')
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = '#808080'
  ctx.lineWidth = 2
  ctx.stroke()

  // 内圈镂空
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.ellipse(cx, cy + drawH * 0.1, drawW * 0.3, drawH * 0.25, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 戒托
  ctx.beginPath()
  ctx.moveTo(cx - drawW * 0.12, cy - drawH * 0.15)
  ctx.lineTo(cx - drawW * 0.08, cy - drawH * 0.3)
  ctx.lineTo(cx + drawW * 0.08, cy - drawH * 0.3)
  ctx.lineTo(cx + drawW * 0.12, cy - drawH * 0.15)
  ctx.closePath()
  ctx.fillStyle = '#C0C0C0'
  ctx.fill()
  ctx.strokeStyle = '#808080'
  ctx.lineWidth = 1.5
  ctx.stroke()
}

/** 绘制槽位轮廓 */
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
    default: // circle
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
    // 珠子位置信息（供点击检测）
    _beadPositions: [] as { x: number; y: number; radius: number; index: number }[],
    _slotPositions: [] as { x: number; y: number; w: number; h: number; slotId: string }[]
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

    /** 外部调用：触发重绘 */
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

    /** 渲染串珠模式 */
    _renderBeads(ctx: any, w: number, h: number, template: API.DiyTemplate, shape: string) {
      const beads = diyStore.selectedBeads
      const cx = w / 2
      const cy = h / 2
      const positions: any[] = []

      if (beads.length === 0) {
        // 空状态：虚线圆环 + 提示
        ctx.setLineDash([6, 4])
        ctx.strokeStyle = '#ddd'
        ctx.lineWidth = 2
        ctx.beginPath()
        if (shape === 'ellipse') {
          const rx = w * (template.layout.params.radius_ratio_x || 0.4)
          const ry = h * (template.layout.params.radius_ratio_y || 0.35)
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
        } else if (shape === 'arc') {
          const arcRad = ((template.layout.params.arc_angle || 180) * Math.PI) / 180
          const r = w * 0.38
          ctx.arc(cx, cy, r, -Math.PI / 2 - arcRad / 2, -Math.PI / 2 + arcRad / 2)
        } else {
          ctx.arc(cx, cy, Math.min(w, h) * 0.35, 0, Math.PI * 2)
        }
        ctx.stroke()
        ctx.setLineDash([])

        // 提示文字
        ctx.fillStyle = '#bbb'
        ctx.font = '14px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('点击下方素材添加珠子', cx, cy)
        this.data._beadPositions = []
        return
      }

      // 绘制导轨线（淡色）
      ctx.setLineDash([4, 3])
      ctx.strokeStyle = 'rgba(200,200,200,0.5)'
      ctx.lineWidth = 1
      ctx.beginPath()

      // 计算珠子坐标
      const coords: { x: number; y: number }[] = []
      const n = beads.length

      switch (shape) {
        case 'ellipse': {
          const rx = w * (template.layout.params.radius_ratio_x || 0.4)
          const ry = h * (template.layout.params.radius_ratio_y || 0.35)
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
          const step = (2 * Math.PI) / n
          for (let i = 0; i < n; i++) {
            const angle = i * step - Math.PI / 2
            coords.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
          }
          break
        }
        case 'arc': {
          const arcRad = ((template.layout.params.arc_angle || 180) * Math.PI) / 180
          const r = w * 0.38
          const startAngle = -Math.PI / 2 - arcRad / 2
          ctx.arc(cx, cy, r, startAngle, startAngle + arcRad)
          const step = arcRad / (n - 1 || 1)
          for (let i = 0; i < n; i++) {
            const angle = startAngle + i * step
            coords.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) })
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
          // circle
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

      // 绘制珠子
      const highlighted = new Set(diyStore.highlightedIndices)
      for (let i = 0; i < n; i++) {
        const bead = beads[i]
        const { x, y } = coords[i]
        // 珠子半径映射（直径mm → 画布px）
        const radius = Math.max(8, bead.diameter * 1.5)

        const color = getGemColor(bead.material)
        drawGem(ctx, x, y, radius, color, bead.shape || 'circle')

        // 选中高亮
        if (highlighted.has(i)) {
          ctx.beginPath()
          ctx.arc(x, y, radius + 3, 0, Math.PI * 2)
          ctx.strokeStyle = '#FF6B35'
          ctx.lineWidth = 2.5
          ctx.stroke()
        }

        positions.push({ x, y, radius: radius + 3, index: i })
      }

      this.data._beadPositions = positions
    },

    /** 渲染镶嵌模式 */
    _renderSlots(ctx: any, w: number, h: number, template: API.DiyTemplate) {
      const params = template.layout.params
      if (!params.slots) {
        return
      }

      // 计算底图绘制区域
      const bgW = params.background_width || 400
      const bgH = params.background_height || 500
      const bgAspect = bgW / bgH
      const canvasAspect = w / h
      let drawW: number, drawH: number
      if (bgAspect > canvasAspect) {
        drawW = w * 0.85
        drawH = drawW / bgAspect
      } else {
        drawH = h * 0.85
        drawW = drawH * bgAspect
      }
      const ox = (w - drawW) / 2
      const oy = (h - drawH) / 2

      // 绘制底图
      if (template.type === 'ring') {
        drawRingBackground(ctx, drawW, drawH, ox, oy)
      } else {
        drawPendantBackground(ctx, drawW, drawH, ox, oy)
      }

      // 绘制槽位
      const slotPositions: any[] = []
      const fillings = diyStore.slotFillings
      const activeId = diyStore.activeSlotId

      for (const slot of params.slots) {
        const sx = ox + slot.x * drawW
        const sy = oy + slot.y * drawH
        const sw = slot.width * drawW
        const sh = slot.height * drawH

        const gem = fillings[slot.slot_id]
        if (gem) {
          const r = Math.min(sw, sh) / 2
          const color = getGemColor(gem.material)
          drawGem(ctx, sx, sy, r, color, gem.shape || 'circle')
        } else {
          // 空槽位：虚线轮廓
          ctx.save()
          ctx.setLineDash([4, 4])
          ctx.strokeStyle = '#ccc'
          ctx.lineWidth = 1.5
          drawSlotOutline(ctx, slot.slot_shape, sx, sy, sw, sh)
          ctx.restore()

          // "+" 提示
          ctx.fillStyle = '#ccc'
          ctx.font = `${Math.min(sw, sh) * 0.4}px sans-serif`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('+', sx, sy)
        }

        // 高亮激活槽位
        if (slot.slot_id === activeId) {
          ctx.save()
          ctx.strokeStyle = '#FF6B35'
          ctx.lineWidth = 2.5
          ctx.setLineDash([])
          drawSlotOutline(ctx, slot.slot_shape, sx, sy, sw + 4, sh + 4)
          ctx.restore()
        }

        slotPositions.push({ x: sx, y: sy, w: sw, h: sh, slotId: slot.slot_id })
      }

      this.data._slotPositions = slotPositions
    },

    /** Canvas 点击事件 */
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
        // 镶嵌模式：检测槽位点击
        for (const sp of this.data._slotPositions) {
          if (Math.abs(tx - sp.x) < sp.w / 2 + 5 && Math.abs(ty - sp.y) < sp.h / 2 + 5) {
            this.triggerEvent('slottap', { slotId: sp.slotId })
            return
          }
        }
      } else {
        // 串珠模式：检测珠子点击
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
