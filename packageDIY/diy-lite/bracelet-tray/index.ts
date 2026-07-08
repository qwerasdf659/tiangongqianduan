/**
 * bracelet-tray 手串渲染组件（Canvas 2D）
 *
 * 职责：接收已选珠子数组 → 等弦长布局 → 立体绘制（圆裁+径向渐变+高光）→ 触摸交互
 * 触摸：拖拽换位 / 拖出删除 / 轻点删除 / 空白拖拽旋转手串；伪3D预览；散珠物理。
 *
 * 物理朝向假设（离线演示，可调）：
 *   round 圆珠不旋转；paohuan 跑环长轴沿切向；yaopian 药片长轴沿径向。
 *
 * 与父页通信：
 *   properties.beads 变化 → 重新布局重绘
 *   triggerEvent('reorder'/'remove'/'tap') 通知父页更新数据源
 *
 * @file packageDIY/diy-lite/bracelet-tray/index.ts
 */

/** 异形珠实拍图去透明后的“宽:高”比例（sharp 实测：药片0.5 / 跑环0.28） */
const SPECIAL_IMG_RATIO: Record<string, number> = {
  yaopian: 0.5,
  paohuan: 0.28
}

/** 布局后的珠子（含坐标/角度/半径，供绘制与命中检测） */
interface TrayBead {
  uid: string
  id: string
  name: string
  diameter: number
  sizeText: string
  shape: string
  material: string
  image: string
  /** 画布像素坐标 */
  x: number
  y: number
  /** 在圆环上的角度（弧度） */
  angle: number
  /** 沿绳占用尺寸（mm） */
  alongCordMm: number
  /** 实物长边（mm，对应实拍图竖直方向） */
  imgLongMm: number
  /** 绘制旋转模式 */
  rotateMode: string
  /** 散珠物理：上一帧 x（Verlet 速度表达） */
  px?: number
  /** 散珠物理：上一帧 y */
  py?: number
  /** 散珠物理：珠子像素半径缓存 */
  beadR?: number
  /** 3D投影：屏幕 x */
  sx3d?: number
  /** 3D投影：屏幕 y */
  sy3d?: number
  /** 3D投影：透视缩放(近大远小) */
  scale3d?: number
  /** 3D投影：深度(排序用) */
  z3d?: number
  /** 布局目标 x（动画插值终点） */
  tx?: number
  /** 布局目标 y */
  ty?: number
  /** 入场缩放动画进度 0→1（新加珠从 0 放大到 1） */
  appear?: number
}

Component({
  properties: {
    /** 已选珠子（父页数据源，含 material/shape/sizeText 等） */
    beads: {
      type: Array,
      value: [] as any[],
      observer() {
        // @ts-ignore 组件方法在 methods 中定义
        this._syncAndRender()
      }
    },
    /** 是否处于伪3D预览态 */
    preview3d: {
      type: Boolean,
      value: false,
      observer() {
        // @ts-ignore
        this._onPreviewChange()
      }
    },
    /**
     * 绳长容量（mm）：决定绳圈固定大小（周长=容量），珠子沿圈填一段弧。
     * ⚠️ 演示布局参数，正式版由后端手围规则决定。
     */
    capacityMm: {
      type: Number,
      value: 150,
      observer() {
        // @ts-ignore
        this._syncAndRender()
      }
    },
    /**
     * 散珠态：true 时珠子散开自由落体+碰撞（Verlet 物理），false 时收拢成串。
     */
    scattered: {
      type: Boolean,
      value: false,
      observer() {
        // @ts-ignore
        this._onScatterChange()
      }
    }
  },

  data: {
    /** 是否空态（无珠子） */
    isEmpty: true
  },

  lifetimes: {
    ready() {
      // @ts-ignore
      this._initCanvas()
    },
    detached() {
      // @ts-ignore
      this._stopPhysics()
      // @ts-ignore
      this._stop3dSpin()
      // @ts-ignore
      if (this._xFadeRafId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._xFadeRafId)
      }
    }
  },

  methods: {
    /** 初始化 Canvas（Skyline node 方式，高清适配） */
    _initCanvas() {
      const query = this.createSelectorQuery()
      query
        .select('#braceletCanvas')
        .fields({ node: true, size: true })
        .exec((res: any) => {
          if (!res || !res[0] || !res[0].node) {
            return
          }
          const canvasNode = res[0].node
          const ctx = canvasNode.getContext('2d')
          /**
           * 设备分档：按 benchmarkLevel 决定采样倍率与 3D 帧率，低端机降 DPR 保流畅。
           *   high(≥40 或未知强机): DPR 原值, 3D 每帧
           *   mid: DPR≤2, 3D 每帧
           *   low(<20): DPR≤1.5, 3D 隔帧渲染
           */
          const rawDpr = wx.getWindowInfo().pixelRatio || 1
          const tier = this._detectTier()
          this._tier = tier
          const dpr =
            tier === 'low' ? Math.min(rawDpr, 1.5) : tier === 'mid' ? Math.min(rawDpr, 2) : rawDpr
          canvasNode.width = res[0].width * dpr
          canvasNode.height = res[0].height * dpr
          ctx.scale(dpr, dpr)
          this._canvas = canvasNode
          this._ctx = ctx
          this._dpr = dpr
          this._cssWidth = res[0].width
          this._cssHeight = res[0].height
          this._selectedIndex = -1
          this._syncAndRender()
        })
    },

    /** 检测设备性能档位（基于 benchmarkLevel，取不到按 mid 保守处理） */
    _detectTier(): string {
      try {
        const info: any = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
        const level = typeof info.benchmarkLevel === 'number' ? info.benchmarkLevel : -1
        if (level < 0) {
          return 'mid'
        }
        if (level < 20) {
          return 'low'
        }
        if (level < 40) {
          return 'mid'
        }
        return 'high'
      } catch (_err) {
        return 'mid'
      }
    },
    /** 同步 properties.beads → 内部布局数组 → 重绘 */
    _syncAndRender() {
      if (!this._ctx) {
        return
      }
      const source = (this.properties.beads || []) as any[]
      this.setData({ isEmpty: source.length === 0 })
      /** 数据变化时清除选中态，避免 × 指向错位的珠子 */
      this._selectedIndex = -1

      /** 为每颗生成/复用 uid（用于拖拽命中与换位） */
      const prev = (this._trayBeads || []) as TrayBead[]
      const cx = this._cssWidth / 2
      this._trayBeads = source.map((bead, index) => {
        const existed = prev[index]
        const isSame = existed && existed.id === bead.id
        return {
          uid: isSame ? existed.uid : `b_${Date.now()}_${index}`,
          id: bead.id,
          name: bead.name,
          diameter: bead.diameter,
          sizeText: bead.sizeText,
          shape: bead.shape,
          material: bead.material || 'crystal',
          image: bead.image,
          /** 保留旧位置用于补间；新珠从画布底部中央“飞入”(素材栏在下方) */
          x: isSame ? existed.x : cx,
          y: isSame ? existed.y : this._cssHeight + 40,
          angle: 0,
          alongCordMm: 0,
          imgLongMm: 0,
          rotateMode: 'none',
          appear: isSame ? 1 : 0
        } as TrayBead
      })
      this._layout()
      /** 平面态用补间动画归位；3D/散珠态直接渲染（各自有循环） */
      if (!this.properties.preview3d && !this.properties.scattered) {
        this._animateToLayout()
      } else {
        this._render()
      }
    },

    /**
     * 补间动画：把每颗珠子从当前 x/y 平滑插值到布局目标 tx/ty，
     * 同时把 appear 从 0→1（新珠放大入场）。约 260ms，缓动 easeOutCubic。
     */
    _animateToLayout() {
      if (!this._canvas) {
        this._render()
        return
      }
      if (this._tweenRafId) {
        this._canvas.cancelAnimationFrame(this._tweenRafId)
        this._tweenRafId = 0
      }
      const beads = (this._trayBeads || []) as TrayBead[]
      const start = Date.now()
      const dur = 260
      const from = beads.map(b => ({ x: b.x, y: b.y, appear: b.appear || 0 }))
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / dur)
        const e = 1 - Math.pow(1 - t, 3)
        beads.forEach((b, i) => {
          const fx = from[i].x
          const fy = from[i].y
          const tx = b.tx || 0
          const ty = b.ty || 0
          b.x = fx + (tx - fx) * e
          b.y = fy + (ty - fy) * e
          /** 新珠(入场appear<1)加抛物线弧度：中途抬高，形成飞入曲线 */
          if (from[i].appear < 1) {
            b.y -= Math.sin(e * Math.PI) * 60
          }
          b.appear = from[i].appear + (1 - from[i].appear) * e
        })
        this._render()
        if (t < 1) {
          this._tweenRafId = this._canvas.requestAnimationFrame(tick)
        } else {
          this._tweenRafId = 0
        }
      }
      this._tweenRafId = this._canvas.requestAnimationFrame(tick)
    },

    /** 解析珠子实物几何（沿绳尺寸 + 长边 + 旋转模式） */
    _parseGeometry(bead: TrayBead) {
      if (bead.shape !== 'special') {
        bead.alongCordMm = bead.diameter
        bead.imgLongMm = bead.diameter
        bead.rotateMode = 'none'
        return
      }
      const nums = bead.sizeText.replace(/mm/gi, '').split(/x/i).map(Number)
      const shortMm = Math.min(nums[0], nums[1])
      const longMm = Math.max(nums[0], nums[1])
      if (bead.id.indexOf('paohuan') >= 0) {
        bead.alongCordMm = longMm
        bead.imgLongMm = longMm
        bead.rotateMode = 'tangentLong'
      } else {
        bead.alongCordMm = shortMm
        bead.imgLongMm = longMm
        bead.rotateMode = 'radialLong'
      }
    },
    /**
     * 闭合手串布局：珠子始终首尾相切排满一整圈（真实手串是闭合环）。
     *
     * 核心：每颗珠子占的圆心角按“沿绳尺寸占总周长的比例”分配，累加恰好 2π，
     * 绳圈大小由容量(手围绳长)固定决定，空串也可见；珠子沿圈填一段弧。
     * 全局旋转角 _globalRot 可拖拽调整。
     */
    _layout() {
      const beads = (this._trayBeads || []) as TrayBead[]
      if (!this._cssWidth) {
        return
      }
      beads.forEach(bead => this._parseGeometry(bead))

      const centerX = this._cssWidth / 2
      const centerY = this._cssHeight / 2

      /**
       * 固定绳圈：周长 = 容量(绳长)，绳圈大小由手围决定、与珠子多少无关，
       * 所以空串/少珠时绳圈始终可见（修复“加跑环才出现手串线”的 bug）。
       * 珠子按各自沿绳尺寸占容量的比例分配角度，从正上方顺时针填一段弧。
       */
      const capacityMm = this.properties.capacityMm || 150
      const maxLongMm = Math.max(...beads.map(b => b.imgLongMm), 12)

      /** 绳圈半径：周长=容量 → R=容量/2π，先按 basePxPerMm 再缩放适配画布 */
      const basePxPerMm = 6
      let ringRadius = (capacityMm * basePxPerMm) / (2 * Math.PI)
      /** 拍照模式留白更少（珠子放大填满），普通模式留 8px 边距 */
      const margin = this._photoMode ? 2 : 8
      const avail = Math.min(centerX, centerY) - margin
      const outer = ringRadius + (maxLongMm * basePxPerMm) / 2
      const fit = outer > avail ? avail / outer : 1
      ringRadius *= fit
      const pixelPerMm = basePxPerMm * fit
      this._pixelPerMm = pixelPerMm
      this._ringRadius = ringRadius

      /** 每颗珠子占角 = 自身沿绳mm / 容量 × 2π；从正上方开始顺时针填弧 */
      let accMm = 0
      const baseOffset = -Math.PI / 2 + (this._globalRot || 0)
      beads.forEach(bead => {
        const midMm = accMm + bead.alongCordMm / 2
        const a = (midMm / capacityMm) * 2 * Math.PI + baseOffset
        bead.angle = a
        /** 目标位置(补间终点) */
        bead.tx = centerX + ringRadius * Math.cos(a)
        bead.ty = centerY + ringRadius * Math.sin(a)
        /** 3D/散珠/拖拽等即时场景直接落位；平面态由 _animateToLayout 补间覆盖 */
        bead.x = bead.tx
        bead.y = bead.ty
        accMm += bead.alongCordMm
      })
    },
    /** 主渲染：清屏 → 绳圈 → 逐颗立体珠（伪3D时按zIndex排序） */
    _render() {
      const ctx = this._ctx
      if (!ctx) {
        return
      }
      ctx.clearRect(0, 0, this._cssWidth, this._cssHeight)
      const beads = (this._trayBeads || []) as TrayBead[]
      /** 拍照模式强制平面渲染（去掉3D翻转，导出正面美图） */
      const is3d = this.properties.preview3d && !this._photoMode

      if (is3d) {
        /** 3D：计算每颗珠子的三维投影(含绳圈)，按深度排序绘制 */
        this._compute3dProjection(beads)
        this._draw3dRing(ctx)
        if (beads.length === 0) {
          return
        }
        const order3d = beads.map((b, i) => i).sort((a, b) => beads[a].z3d! - beads[b].z3d!)
        order3d.forEach(i => this._draw3dBead(ctx, beads[i]))
        return
      }

      /** 平面态：绳圈始终可见(含空串)，拍照模式不画圈 */
      if (!this._photoMode) {
        this._drawRing(ctx)
      }
      if (beads.length === 0) {
        return
      }
      const order = beads.map((b, i) => i)
      /** 先整体画一层投影（珠子落影），再画珠子，营造悬浮实物感 */
      order.forEach(i => this._drawBeadShadow(ctx, beads[i]))
      order.forEach(i => this._drawBead(ctx, beads[i]))
      /** 选中珠子头顶画 × 删除按钮（可发现性：拖出圈外不易发现，这里给明确入口） */
      if (this._selectedIndex >= 0 && beads[this._selectedIndex] && !this._photoMode) {
        this._drawDeleteButton(ctx, beads[this._selectedIndex])
      }
    },

    /** 计算选中珠子的 × 按钮中心坐标（珠子右上方） */
    _deleteButtonPos(bead: TrayBead) {
      const r = (bead.imgLongMm * this._pixelPerMm) / 2
      return { x: bead.x + r * 0.85, y: bead.y - r * 0.85, br: 20 }
    },

    /** 画 × 删除按钮（红底白叉，带淡入 + 轻微放大动画） */
    _drawDeleteButton(ctx: any, bead: TrayBead) {
      const alpha = this._xAlpha === undefined ? 1 : this._xAlpha
      if (alpha <= 0) {
        return
      }
      const pos = this._deleteButtonPos(bead)
      /** 淡入时同步从 0.6 放大到 1.0，更有弹出感 */
      const scale = 0.6 + 0.4 * alpha
      const br = pos.br * scale
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, br, 0, Math.PI * 2)
      ctx.fillStyle = '#C44569'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 3
      const d = br * 0.42
      ctx.beginPath()
      ctx.moveTo(pos.x - d, pos.y - d)
      ctx.lineTo(pos.x + d, pos.y + d)
      ctx.moveTo(pos.x + d, pos.y - d)
      ctx.lineTo(pos.x - d, pos.y + d)
      ctx.stroke()
      ctx.restore()
    },

    /** 启动 × 按钮淡入动画（选中珠子时调用） */
    _animateDeleteButton() {
      if (!this._canvas) {
        return
      }
      if (this._xFadeRafId) {
        this._canvas.cancelAnimationFrame(this._xFadeRafId)
      }
      const start = Date.now()
      const dur = 180
      const step = () => {
        this._xAlpha = Math.min(1, (Date.now() - start) / dur)
        this._render()
        if (this._xAlpha < 1) {
          this._xFadeRafId = this._canvas.requestAnimationFrame(step)
        } else {
          this._xFadeRafId = 0
        }
      }
      this._xFadeRafId = this._canvas.requestAnimationFrame(step)
    },

    /** 判断点是否落在选中珠子的 × 按钮上 */
    _hitDeleteButton(x: number, y: number): boolean {
      const beads = (this._trayBeads || []) as TrayBead[]
      const bead = beads[this._selectedIndex]
      if (!bead) {
        return false
      }
      const pos = this._deleteButtonPos(bead)
      return Math.hypot(x - pos.x, y - pos.y) <= pos.br + 6
    },

    /**
     * 计算 3D 投影：把圆环上每颗珠子当成 XY 平面上的点，
     * 先绕 Y 轴转 yaw（左右），再绕 X 轴转 pitch（上下），透视投影到屏幕。
     * 结果写入 bead.sx3d/sy3d（屏幕坐标）、scale3d（近大远小）、z3d（深度排序）。
     */
    _compute3dProjection(beads: TrayBead[]) {
      const cx = this._cssWidth / 2
      const cy = this._cssHeight / 2
      const R = this._ringRadius
      const yaw = this._yaw || 0
      const pitch = this._pitch || 0
      const cosY = Math.cos(yaw)
      const sinY = Math.sin(yaw)
      const cosP = Math.cos(pitch)
      const sinP = Math.sin(pitch)
      /** 透视焦距（越大越弱透视），取画布尺寸量级 */
      const focal = Math.max(this._cssWidth, this._cssHeight) * 1.4

      beads.forEach(bead => {
        /** 圆环平面点(z=0) */
        const x0 = R * Math.cos(bead.angle)
        const y0 = R * Math.sin(bead.angle)
        /** 绕 Y 轴(yaw)：x,z 旋转 */
        const x1 = x0 * cosY
        const z1 = x0 * sinY
        /** 绕 X 轴(pitch)：y,z 旋转 */
        const y2 = y0 * cosP - z1 * sinP
        const z2 = y0 * sinP + z1 * cosP
        /** 透视：近大远小 */
        const persp = focal / (focal - z2)
        bead.sx3d = cx + x1 * persp
        bead.sy3d = cy + y2 * persp
        bead.scale3d = persp
        bead.z3d = z2
      })
    },

    /**
     * 画珠子落影：珠心右下方偏移的半透明阴影，模拟托盘投影。
     * ellipse 不支持时降级为 scale+arc（Skyline 兼容三层保护）。
     */
    _drawBeadShadow(ctx: any, bead: TrayBead) {
      const r = (bead.imgLongMm * this._pixelPerMm) / 2
      const offset = r * 0.28
      ctx.save()
      ctx.fillStyle = 'rgba(0,0,0,0.16)'
      ctx.beginPath()
      if (typeof ctx.ellipse === 'function') {
        ctx.ellipse(bead.x + offset, bead.y + offset, r * 0.92, r * 0.78, 0, 0, Math.PI * 2)
      } else {
        /** 降级：平移+纵向压扁+圆，等效椭圆 */
        ctx.translate(bead.x + offset, bead.y + offset)
        ctx.scale(1, 0.82)
        ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2)
      }
      ctx.fill()
      ctx.restore()
    },

    /** 画手串绳圈（浅灰细线） */
    _drawRing(ctx: any) {
      const cx = this._cssWidth / 2
      const cy = this._cssHeight / 2
      ctx.save()
      ctx.beginPath()
      ctx.arc(cx, cy, this._ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = '#E0E0E0'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    },

    /**
     * 画 3D 手串绳圈：把圆环采样成多点，各点做同样的 yaw/pitch 投影后连线，
     * 得到随手串一起翻转的立体绳线（修复“3D 没有绳子”）。
     */
    _draw3dRing(ctx: any) {
      const cx = this._cssWidth / 2
      const cy = this._cssHeight / 2
      const R = this._ringRadius
      const yaw = this._yaw || 0
      const pitch = this._pitch || 0
      const cosY = Math.cos(yaw)
      const sinY = Math.sin(yaw)
      const cosP = Math.cos(pitch)
      const sinP = Math.sin(pitch)
      const focal = Math.max(this._cssWidth, this._cssHeight) * 1.4
      const steps = 60
      ctx.save()
      ctx.beginPath()
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * 2 * Math.PI
        const x0 = R * Math.cos(a)
        const y0 = R * Math.sin(a)
        const x1 = x0 * cosY
        const z1 = x0 * sinY
        const y2 = y0 * cosP - z1 * sinP
        const z2 = y0 * sinP + z1 * cosP
        const persp = focal / (focal - z2)
        const sx = cx + x1 * persp
        const sy = cy + y2 * persp
        if (i === 0) {
          ctx.moveTo(sx, sy)
        } else {
          ctx.lineTo(sx, sy)
        }
      }
      ctx.strokeStyle = '#D8D2C8'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    },

    /** 画 3D 珠子：用投影后的屏幕坐标与透视缩放绘制，保留立体光影 */
    _draw3dBead(ctx: any, bead: TrayBead) {
      const image = this._loadImage(bead.image)
      const base = bead.imgLongMm * this._pixelPerMm
      const ratioKey = bead.id.indexOf('paohuan') >= 0 ? 'paohuan' : 'yaopian'
      const shortBase = bead.shape === 'special' ? base * (SPECIAL_IMG_RATIO[ratioKey] || 1) : base
      const scale = bead.scale3d || 1
      const drawLong = base * scale
      const drawShort = shortBase * scale
      const sx = bead.sx3d || bead.x
      const sy = bead.sy3d || bead.y

      let rotation = 0
      if (bead.rotateMode === 'radialLong') {
        rotation = bead.angle + Math.PI / 2
      } else if (bead.rotateMode === 'tangentLong') {
        rotation = bead.angle + Math.PI
      }

      /** 圆珠优先用离屏模板 blit（3D 每帧重绘，缓存收益最大） */
      if (bead.shape !== 'special') {
        const tpl = this._getRoundTemplate(bead)
        if (tpl) {
          ctx.save()
          ctx.translate(sx, sy)
          ctx.drawImage(tpl, -drawLong / 2, -drawLong / 2, drawLong, drawLong)
          ctx.restore()
          return
        }
      }

      ctx.save()
      ctx.translate(sx, sy)
      if (rotation !== 0) {
        ctx.rotate(rotation)
      }
      if (image) {
        ctx.drawImage(image, -drawShort / 2, -drawLong / 2, drawShort, drawLong)
      } else {
        ctx.fillStyle = '#E8E8EC'
        ctx.beginPath()
        ctx.arc(0, 0, drawLong / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      if (bead.shape !== 'special') {
        this._drawSphereShading(ctx, drawLong / 2, bead.material)
      }
      ctx.restore()
    },
    /**
     * 获取圆珠离屏模板（缓存）：预渲染「实拍图圆形裁剪 + 立体光影」到离屏 canvas，
     * 主图只需一次 drawImage blit，省去每帧的 clip + 3 段 createRadialGradient。
     * 缓存 key = 珠子图片 url + 固定模板直径（TEMPLATE_PX），未加载完成返回 null。
     * @returns 离屏 canvas 或 null
     */
    _getRoundTemplate(bead: TrayBead): any {
      const image = this._loadImage(bead.image)
      if (!image) {
        return null
      }
      if (!this._tplCache) {
        this._tplCache = {}
      }
      const key = bead.image
      if (this._tplCache[key]) {
        return this._tplCache[key]
      }
      /** 模板分辨率：固定 120px（够清晰，主图按需缩放），乘 dpr 保清晰 */
      const TEMPLATE_PX = 120
      const px = TEMPLATE_PX * (this._dpr || 1)
      let off: any
      try {
        off = wx.createOffscreenCanvas({ type: '2d', width: px, height: px })
      } catch (_e) {
        return null
      }
      const octx = off.getContext('2d')
      const r = px / 2
      octx.save()
      octx.beginPath()
      octx.arc(r, r, r, 0, Math.PI * 2)
      octx.clip()
      octx.drawImage(image, 0, 0, px, px)
      octx.restore()
      /** 在模板坐标系(中心 r,r)叠加光影 */
      octx.save()
      octx.translate(r, r)
      this._drawSphereShading(octx, r, bead.material)
      octx.restore()
      this._tplCache[key] = off
      return off
    },

    /** 画单颗立体珠：优先用离屏模板 blit，回退到实时裁剪+光影 */
    _drawBead(ctx: any, bead: TrayBead) {
      const image = this._loadImage(bead.image)
      const longPx = bead.imgLongMm * this._pixelPerMm
      const ratioKey = bead.id.indexOf('paohuan') >= 0 ? 'paohuan' : 'yaopian'
      const shortPx =
        bead.shape === 'special' ? longPx * (SPECIAL_IMG_RATIO[ratioKey] || 1) : longPx

      /** 入场缩放：新珠 appear 从 0→1 放大冒出 */
      const appear = bead.appear === undefined ? 1 : bead.appear
      const drawLong = longPx * appear
      const drawShort = shortPx * appear

      /** 圆珠优先走离屏模板 blit（性能优化） */
      if (bead.shape !== 'special') {
        const tpl = this._getRoundTemplate(bead)
        if (tpl) {
          ctx.save()
          ctx.translate(bead.x, bead.y)
          ctx.drawImage(tpl, -drawLong / 2, -drawLong / 2, drawLong, drawLong)
          ctx.restore()
          return
        }
      }

      let rotation = 0
      if (bead.rotateMode === 'radialLong') {
        rotation = bead.angle + Math.PI / 2
      } else if (bead.rotateMode === 'tangentLong') {
        rotation = bead.angle + Math.PI
      }

      ctx.save()
      ctx.translate(bead.x, bead.y)
      if (rotation !== 0) {
        ctx.rotate(rotation)
      }
      if (image) {
        ctx.drawImage(image, -drawShort / 2, -drawLong / 2, drawShort, drawLong)
      } else {
        ctx.fillStyle = '#E8E8EC'
        ctx.beginPath()
        if (bead.shape === 'special') {
          ctx.rect(-drawShort / 2, -drawLong / 2, drawShort, drawLong)
        } else {
          ctx.arc(0, 0, drawLong / 2, 0, Math.PI * 2)
        }
        ctx.fill()
      }
      /** 圆珠叠加立体光影（异形珠跳过，避免破坏形状） */
      if (bead.shape !== 'special') {
        this._drawSphereShading(ctx, drawLong / 2, bead.material)
      }
      ctx.restore()
    },
    /**
     * 绘制球体光影（在已裁剪的圆珠上叠加），按材质细分参数：
     *   1. 径向暗角（边缘变暗）营造球面
     *   2. 主高光点（左上）营造光泽，size/alpha 随材质
     *   3. 底部反光（右下暗环内的微亮）增强通透感（crystal/metal 才有）
     * 材质档位：
     *   crystal 水晶：高光大而亮 + 底部反光（通透）
     *   metal   金属：高光小而锐（镜面感）
     *   stone   玉石：高光柔和、暗角轻（温润）
     *   matte   哑光：几乎无高光（漫反射）
     */
    _drawSphereShading(ctx: any, r: number, material: string) {
      const P: Record<string, any> = {
        crystal: { edge: 0.3, hi: 0.6, hiR: 0.55, rim: 0.22 },
        metal: { edge: 0.42, hi: 0.75, hiR: 0.32, rim: 0 },
        stone: { edge: 0.2, hi: 0.32, hiR: 0.6, rim: 0 },
        matte: { edge: 0.16, hi: 0.14, hiR: 0.5, rim: 0 }
      }
      const p = P[material] || P.crystal

      /** 1. 边缘暗角 */
      const edge = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r)
      edge.addColorStop(0, 'rgba(0,0,0,0)')
      edge.addColorStop(1, `rgba(0,0,0,${p.edge})`)
      ctx.beginPath()
      ctx.arc(0, 0, r, 0, Math.PI * 2)
      ctx.fillStyle = edge
      ctx.fill()

      /** 2. 主高光点（左上） */
      const hx = -r * 0.32
      const hy = -r * 0.32
      const hr = r * p.hiR
      const hi = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr)
      hi.addColorStop(0, `rgba(255,255,255,${p.hi})`)
      hi.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.beginPath()
      ctx.arc(hx, hy, hr, 0, Math.PI * 2)
      ctx.fillStyle = hi
      ctx.fill()

      /** 3. 底部反光（右下），仅通透材质 */
      if (p.rim > 0) {
        const rx = r * 0.34
        const ry = r * 0.36
        const rr = r * 0.4
        const rim = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr)
        rim.addColorStop(0, `rgba(255,255,255,${p.rim})`)
        rim.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.beginPath()
        ctx.arc(rx, ry, rr, 0, Math.PI * 2)
        ctx.fillStyle = rim
        ctx.fill()
      }
    },

    /** 图片加载（本地路径 / http URL 通用 + 缓存 + 失败降级） */
    _loadImage(url: string): any {
      if (!url) {
        return null
      }
      if (!this._imageCache) {
        this._imageCache = {}
        this._imageLoading = {}
      }
      if (this._imageCache[url]) {
        return this._imageCache[url]
      }
      if (this._imageLoading[url] || !this._canvas) {
        return null
      }
      this._imageLoading[url] = true
      const img = this._canvas.createImage()
      /** 网络图超时兜底（本地图基本瞬时；http URL 5s 未加载则放弃，下次重绘用占位） */
      const isRemote = url.indexOf('http') === 0
      let settled = false
      const timer = isRemote
        ? setTimeout(() => {
            if (!settled) {
              settled = true
              delete this._imageLoading[url]
            }
          }, 5000)
        : null
      img.onload = () => {
        if (settled) {
          return
        }
        settled = true
        if (timer) {
          clearTimeout(timer)
        }
        this._imageCache[url] = img
        delete this._imageLoading[url]
        this._render()
      }
      img.onerror = () => {
        if (settled) {
          return
        }
        settled = true
        if (timer) {
          clearTimeout(timer)
        }
        delete this._imageLoading[url]
      }
      img.src = url
      return null
    },
    /** 触摸开始：3D 态记录起点用于翻转；平面态命中珠子准备拖拽/轻点，空白旋转 */
    onTouchStart(e: any) {
      const point = this._touchPoint(e)
      if (!point) {
        return
      }
      if (this.properties.preview3d) {
        this._drag3d = true
        this._last3dX = point.x
        this._last3dY = point.y
        /** 记录起点与时间，用于区分“翻转拖动”与“轻点看详情” */
        this._down3dX = point.x
        this._down3dY = point.y
        this._touch3dTs = Date.now()
        this._moved3d = 0
        return
      }
      /** 散珠态：点击画布 = 抖一抖所有珠子（趣味交互） */
      if (this.properties.scattered) {
        this._shakeBeads()
        return
      }
      /** 若已选中某珠且点中了它头顶的 × 按钮：直接删除 */
      if (this._selectedIndex >= 0 && this._hitDeleteButton(point.x, point.y)) {
        const delIdx = this._selectedIndex
        this._selectedIndex = -1
        this._emitRemove(delIdx)
        wx.vibrateShort({ type: 'medium' })
        this._dragIndex = -1
        this._rotating = false
        return
      }
      const hitIndex = this._hitBead(point.x, point.y)
      this._touchStartTs = Date.now()
      this._dragIndex = hitIndex
      this._rotating = hitIndex < 0
      this._lastPoint = point
      this._downX = point.x
      this._downY = point.y
      if (this._rotating) {
        const cx = this._cssWidth / 2
        const cy = this._cssHeight / 2
        this._lastAngle = Math.atan2(point.y - cy, point.x - cx)
      }
    },

    /** 触摸移动：3D 态左右拖=yaw 上下拖=pitch；平面态拖珠/旋转 */
    onTouchMove(e: any) {
      const point = this._touchPoint(e)
      if (!point) {
        return
      }
      if (this.properties.preview3d) {
        if (!this._drag3d) {
          return
        }
        const dx = point.x - (this._last3dX || point.x)
        const dy = point.y - (this._last3dY || point.y)
        this._moved3d = (this._moved3d || 0) + Math.abs(dx) + Math.abs(dy)
        /** 左右拖动改 yaw(绕Y轴)，上下拖动改 pitch(绕X轴)，pitch 夹在 ±80° */
        this._yaw = (this._yaw || 0) + dx * 0.01
        let pitch = (this._pitch || 0) + dy * 0.01
        const limit = (80 * Math.PI) / 180
        pitch = Math.max(-limit, Math.min(limit, pitch))
        this._pitch = pitch
        this._last3dX = point.x
        this._last3dY = point.y
        this._render()
        return
      }
      const beads = (this._trayBeads || []) as TrayBead[]
      if (this._dragIndex >= 0 && beads[this._dragIndex]) {
        beads[this._dragIndex].x = point.x
        beads[this._dragIndex].y = point.y
        this._render()
      } else if (this._rotating) {
        const cx = this._cssWidth / 2
        const cy = this._cssHeight / 2
        const ang = Math.atan2(point.y - cy, point.x - cx)
        this._globalRot = (this._globalRot || 0) + (ang - this._lastAngle)
        this._lastAngle = ang
        this._layout()
        this._render()
      }
      this._lastPoint = point
    },
    /**
     * 触摸结束：判定 轻点删除 / 拖出删除 / 拖拽换位 / 旋转结束
     * 通过事件通知父页更新数据源（组件不直接改 properties.beads）
     */
    onTouchEnd() {
      if (this.properties.preview3d) {
        this._drag3d = false
        /** 3D 下轻点(几乎没拖动、时间短)：命中珠子看详情，不影响翻转 */
        const dur3d = Date.now() - (this._touch3dTs || 0)
        if ((this._moved3d || 0) < 10 && dur3d < 250) {
          const idx = this._hitBead3d(this._down3dX || 0, this._down3dY || 0)
          if (idx >= 0) {
            const tappedBead = (this._trayBeads || [])[idx]
            this.triggerEvent('beadtap', { index: idx, id: tappedBead.id })
          }
        }
        return
      }
      const beads = (this._trayBeads || []) as TrayBead[]
      const dragIndex = this._dragIndex
      const duration = Date.now() - (this._touchStartTs || 0)
      this._dragIndex = -1

      if (dragIndex < 0) {
        this._rotating = false
        return
      }
      const bead = beads[dragIndex]
      if (!bead) {
        return
      }

      /**
       * 轻点（<200ms 且几乎没移动）：查看该珠详情，不删除（避免误删）。
       * 删除只通过“拖出绳圈外”这一个明确手势触发。
       */
      const cx = this._cssWidth / 2
      const cy = this._cssHeight / 2
      const movedDist = Math.hypot(
        bead.x - (this._downX || bead.x),
        bead.y - (this._downY || bead.y)
      )
      if (duration < 200 && movedDist < 12) {
        /** 轻点：选中该珠(头顶浮出 × 删除按钮)，再点一次同颗则取消选中 */
        this._selectedIndex = this._selectedIndex === dragIndex ? -1 : dragIndex
        this._layout()
        if (this._selectedIndex >= 0) {
          this._xAlpha = 0
          this._animateDeleteButton()
        } else {
          this._render()
        }
        this.triggerEvent('beadtap', { index: dragIndex, id: bead.id })
        return
      }
      /** 拖动后取消选中态 */
      this._selectedIndex = -1

      /** 拖出绳圈外一定距离：删除 */
      const dist = Math.hypot(bead.x - cx, bead.y - cy)
      const removeDist = this._ringRadius + 48
      if (dist > removeDist) {
        this._emitRemove(dragIndex)
        wx.vibrateShort({ type: 'medium' })
        return
      }

      /** 否则换位：按当前拖放角度找最近插入位，重排后通知父页 */
      const dropAngle = Math.atan2(bead.y - cy, bead.x - cx)
      let nearest = dragIndex
      let minDiff = Infinity
      beads.forEach((b, i) => {
        if (i === dragIndex) {
          return
        }
        const diff = Math.abs(this._angleDiff(dropAngle, b.angle))
        if (diff < minDiff) {
          minDiff = diff
          nearest = i
        }
      })
      if (nearest !== dragIndex) {
        this._emitReorder(dragIndex, nearest)
        wx.vibrateShort({ type: 'light' })
      } else {
        this._layout()
        this._render()
      }
    },
    /** 取触摸点相对画布的 CSS 像素坐标 */
    _touchPoint(e: any) {
      const t = e.touches && e.touches[0] ? e.touches[0] : e.changedTouches && e.changedTouches[0]
      if (!t) {
        return null
      }
      return { x: t.x, y: t.y }
    },

    /** 命中检测：返回被点中的珠子下标，无则 -1（从上层往下查） */
    _hitBead(x: number, y: number): number {
      const beads = (this._trayBeads || []) as TrayBead[]
      for (let i = beads.length - 1; i >= 0; i--) {
        const b = beads[i]
        const r = (b.imgLongMm * this._pixelPerMm) / 2
        if (Math.hypot(x - b.x, y - b.y) <= r) {
          return i
        }
      }
      return -1
    },

    /**
     * 3D 命中检测：用投影后的屏幕坐标(sx3d/sy3d)与透视缩放半径判断，
     * 按深度从最靠前(z 大)的珠子优先命中，返回下标，无则 -1。
     */
    _hitBead3d(x: number, y: number): number {
      const beads = (this._trayBeads || []) as TrayBead[]
      let best = -1
      let bestZ = -Infinity
      beads.forEach((b, i) => {
        if (b.sx3d === undefined || b.sy3d === undefined) {
          return
        }
        const r = ((b.imgLongMm * this._pixelPerMm) / 2) * (b.scale3d || 1)
        if (Math.hypot(x - b.sx3d, y - b.sy3d) <= r && (b.z3d || 0) > bestZ) {
          best = i
          bestZ = b.z3d || 0
        }
      })
      return best
    },

    /** 归一化两角度差到 [-π, π] */
    _angleDiff(a: number, b: number): number {
      let d = a - b
      while (d > Math.PI) {
        d -= 2 * Math.PI
      }
      while (d < -Math.PI) {
        d += 2 * Math.PI
      }
      return d
    },

    /** 通知父页：移除某颗（伴随删除音效） */
    _emitRemove(index: number) {
      this._playSound('remove')
      this.triggerEvent('remove', { index })
    },

    /** 通知父页：把 from 移动到 to 位置（伴随点击音效） */
    _emitReorder(from: number, to: number) {
      this._playSound('click')
      this.triggerEvent('reorder', { from, to })
    },
    /**
     * preview3d 属性变化：
     *   开启 → 给一个初始俯视倾角(pitch)，让手串一进入就有立体感；用户可拖拽 360° 翻转。
     *   关闭 → 回到平面布局。
     */
    _onPreviewChange() {
      if (this.properties.preview3d) {
        if (this._pitch === undefined || this._pitch === 0) {
          this._pitch = (55 * Math.PI) / 180
        }
        this._start3dSpin()
      } else {
        this._stop3dSpin()
        this._layout()
        this._render()
      }
    },

    /**
     * 3D 自动慢转循环：持续自增 yaw（绕Y轴慢转），拖拽时暂停（_drag3d=true 跳过）。
     * 低端机隔帧渲染，转速通过步进补偿保持一致。
     */
    _start3dSpin() {
      if (this._spinRafId || !this._canvas) {
        return
      }
      const skip = this._tier === 'low' ? 2 : 1
      const step = 0.006 * skip
      let frame = 0
      const loop = () => {
        frame++
        if (frame % skip === 0) {
          if (!this._drag3d) {
            this._yaw = (this._yaw || 0) + step
          }
          this._render()
        }
        this._spinRafId = this._canvas.requestAnimationFrame(loop)
      }
      this._spinRafId = this._canvas.requestAnimationFrame(loop)
    },

    /** 停止 3D 自动转 */
    _stop3dSpin() {
      if (this._spinRafId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._spinRafId)
      }
      this._spinRafId = 0
    },

    /**
     * 播放音效（加珠/删除/碰撞）。
     * ⚠️ 需在 assets/sounds/ 放入音频文件（add.mp3 / remove.mp3 / click.mp3）。
     * 文件缺失时静默不报错（onError 忽略），不影响其它功能。音效资源须由用户/设计提供。
     */
    _playSound(key: string) {
      if (!this._audioPool) {
        this._audioPool = {}
      }
      const url = `/packageDIY/diy-lite/assets/sounds/${key}.mp3`
      try {
        let audio = this._audioPool[key]
        if (!audio) {
          audio = wx.createInnerAudioContext()
          audio.src = url
          audio.onError(() => {})
          this._audioPool[key] = audio
        }
        audio.stop()
        audio.play()
      } catch (_e) {
        /* 音效不可用时静默降级 */
      }
    },

    /** 散珠/收拢切换：进入散珠启动物理循环，收拢则平滑飞回圆环 */
    _onScatterChange() {
      if (this.properties.scattered) {
        this._initPhysics()
        this._startPhysics()
      } else {
        this._stopPhysics()
        /** 收拢：从散珠当前位置补间飞回圆环布局（平滑归位，非瞬间跳回） */
        this._layout()
        this._animateToLayout()
      }
    },

    /** 初始化散珠物理状态：给每颗珠子随机初速度与当前位置（Verlet 用 prev 位置表达速度） */
    _initPhysics() {
      const beads = (this._trayBeads || []) as TrayBead[]
      beads.forEach(bead => {
        bead.px = bead.x - (Math.random() - 0.5) * 4
        bead.py = bead.y - (Math.random() - 0.5) * 4
      })
    },

    /** 启动散珠物理循环 */
    _startPhysics() {
      if (this._physicsRafId || !this._canvas) {
        return
      }
      const loop = () => {
        this._stepPhysics()
        this._render()
        this._physicsRafId = this._canvas.requestAnimationFrame(loop)
      }
      this._physicsRafId = this._canvas.requestAnimationFrame(loop)
    },

    /** 停止散珠物理循环 */
    _stopPhysics() {
      if (this._physicsRafId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._physicsRafId)
      }
      this._physicsRafId = 0
    },

    /** 供父页调用：播放加珠音效 */
    playAddSound() {
      this._playSound('add')
    },

    /** 散珠态下给所有珠子一个随机冲量（抖一抖，增加趣味） */
    _shakeBeads() {
      const beads = (this._trayBeads || []) as TrayBead[]
      beads.forEach(bead => {
        bead.px = bead.x + (Math.random() - 0.5) * 24
        bead.py = bead.y + (Math.random() - 0.5) * 24
      })
      wx.vibrateShort({ type: 'light' })
    },
    /**
     * 单步散珠物理（Verlet 积分）：
     *   1. 向画布中心的弱重力（把珠子聚拢到托盘中央，避免散飞）
     *   2. Verlet 更新：pos += (pos - prevPos)·摩擦 + 加速度
     *   3. 圆形边界约束（限制在托盘内，撞壁反弹衰减）
     *   4. 珠子间碰撞（两两推开，避免重叠）
     * 低端机减少碰撞迭代次数保流畅。
     */
    _stepPhysics() {
      const beads = (this._trayBeads || []) as TrayBead[]
      if (beads.length === 0) {
        return
      }
      const cx = this._cssWidth / 2
      const cy = this._cssHeight / 2
      const trayR = Math.min(cx, cy) - 8
      const friction = 0.92
      const gravity = 0.12

      beads.forEach(bead => {
        const r = (bead.imgLongMm * this._pixelPerMm) / 2
        const vx = (bead.x - (bead.px || bead.x)) * friction
        const vy = (bead.y - (bead.py || bead.y)) * friction
        /** 指向中心的弱重力 + 微小随机抖动(让散珠更“活”) */
        const gx = (cx - bead.x) * 0.002 + (Math.random() - 0.5) * 0.3
        const gy = (cy - bead.y) * 0.002 + gravity + (Math.random() - 0.5) * 0.3
        bead.px = bead.x
        bead.py = bead.y
        bead.x += vx + gx
        bead.y += vy + gy
        /** 圆形边界约束 */
        const dx = bead.x - cx
        const dy = bead.y - cy
        const dist = Math.hypot(dx, dy)
        if (dist + r > trayR) {
          const k = (trayR - r) / (dist || 1)
          bead.x = cx + dx * k
          bead.y = cy + dy * k
        }
        bead.beadR = r
      })

      /** 碰撞求解（迭代推开重叠珠子） */
      const iterations = this._tier === 'low' ? 1 : 2
      for (let it = 0; it < iterations; it++) {
        for (let i = 0; i < beads.length; i++) {
          for (let j = i + 1; j < beads.length; j++) {
            const a = beads[i]
            const b = beads[j]
            const dx = b.x - a.x
            const dy = b.y - a.y
            const dist = Math.hypot(dx, dy) || 0.01
            const minDist = (a.beadR || 0) + (b.beadR || 0)
            if (dist < minDist) {
              const overlap = (minDist - dist) / 2
              const ox = (dx / dist) * overlap
              const oy = (dy / dist) * overlap
              a.x -= ox
              a.y -= oy
              b.x += ox
              b.y += oy
            }
          }
        }
      }
    },

    /**
     * 导出当前手串为临时图片路径（供父页保存相册）
     *
     * 拍照模式：先暂停 3D/物理，做一帧“美图渲染”——珠子居中放大填满画布，
     * 关闭平面绳圈只留珠子，导出后恢复原状态。保证导出图精致且不含 UI 辅助线。
     * @param callback 回调 tempFilePath，失败回调空串
     */
    exportImage(callback: (_path: string) => void) {
      if (!this._canvas) {
        callback('')
        return
      }
      /** 记录并临时进入拍照渲染态（暂停散珠物理与3D自转，强制平面正面渲染） */
      const wasScattered = this.properties.scattered
      const was3d = this.properties.preview3d
      this._stopPhysics()
      this._stop3dSpin()

      this._photoMode = true
      this._layout()
      this._render()

      /** 等一帧确保绘制完成再截图 */
      this._canvas.requestAnimationFrame(() => {
        wx.canvasToTempFilePath({
          canvas: this._canvas,
          success: (res: any) => callback(res.tempFilePath),
          fail: () => callback(''),
          complete: () => {
            /** 恢复原状态 */
            this._photoMode = false
            this._layout()
            this._render()
            if (was3d) {
              this._start3dSpin()
            } else if (wasScattered) {
              this._startPhysics()
            }
          }
        })
      })
    }
  }
})
