/**
 * bracelet-tray 手串渲染组件（Canvas 2D）
 *
 * 职责：接收已选珠子数组 → 等弦长布局 → 立体绘制（圆裁+径向渐变+高光）→ 触摸交互
 * 触摸：拖拽换位 / 拖出删除 / 轻点多选 / 空白拖拽旋转手串；伪3D预览；散珠物理。
 *
 * 异形珠（shape='special'）几何权威来源（对接文档 13.1-A / 11.7-2）：
 *   穿绳朝向 = 后端 bore_orientation（along_length 管珠/跑环长轴沿切向躺排；
 *   along_width 药片长轴沿径向立排；none 圆珠不旋转），实物边 = size_length_mm/size_width_mm；
 *   实拍图宽高比 = 页面由 image_media.width/height 派生后经 imgRatio 透传（图已裁透明边）。
 *
 * 与父页通信：
 *   properties.beads 变化 → 重新布局重绘
 *   triggerEvent('reorder'/'remove'/'beadtap'/'selectionchange') 通知父页更新数据源与多选状态
 *
 * @file packageDIY/diy-lite/bracelet-tray/index.ts
 */

/**
 * 异形珠实拍图"宽:高"比例（<1 表示竖长图）：
 * 生产链路由页面从 image_media.width/height 派生（imgRatio 透传，11.7-2）；
 * 缺失时回退实物短边/长边比（几何近似）；再缺退 0.5 兜底
 */
function getSpecialRatio(bead: TrayBead): number {
  if (bead.imgRatio && bead.imgRatio > 0) {
    return bead.imgRatio
  }
  if (bead.sizeWidthMm > 0 && bead.sizeLengthMm > 0) {
    return bead.sizeWidthMm / bead.sizeLengthMm
  }
  return 0.5
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
  /** 穿绳方向（后端 bore_orientation 透传：along_length/along_width/none） */
  boreOrientation: string
  /** 异形珠实物长边 mm（后端 size_length_mm，圆珠 0） */
  sizeLengthMm: number
  /** 异形珠实物短边 mm（后端 size_width_mm，圆珠 0） */
  sizeWidthMm: number
  /** 实拍图宽:高比例（页面由 image_media.width/height 派生，圆珠 1） */
  imgRatio: number
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
     * 绳圈周长（mm）：决定绳圈固定大小（周长=容量），珠子沿圈填一段弧。
     * 由页面根据后端 sizing_rules/bead_rules 计算传入（无规则时页面传渲染兜底值）。
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
    isEmpty: true,
    /**
     * DOM 飞入动画项（借鉴 diy3 useBeadAnimation）：
     * 每项 { uid, image, x, y, size, opacity, scale, rotate, moving }，
     * moving=false 为起点态(无过渡)，setData 后下一 tick 置 true 触发 CSS 回弹过渡。
     */
    flyingBeads: [] as any[]
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
      this._stopRotateInertia()
      // @ts-ignore 清理 DOM 飞入定时器(对齐 diy3 onUnmounted)，防止组件销毁后回调报错
      if (this._flyTimers) {
        // @ts-ignore
        this._flyTimers.forEach((t: any) => clearTimeout(t))
        // @ts-ignore
        this._flyTimers = []
      }
      // @ts-ignore
      if (this._spinOnceRafId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._spinOnceRafId)
      }
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
          this._selectedIndices = []
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
      /** 数据变化时清除选中态，避免选中下标指向错位的珠子 */
      this._clearSelection()

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
          /* 异形珠几何（后端 bore_orientation/size 边长 + 页面派生 imgRatio 透传） */
          boreOrientation: bead.bore_orientation || 'none',
          sizeLengthMm: bead.size_length_mm || 0,
          sizeWidthMm: bead.size_width_mm || 0,
          imgRatio: bead.imgRatio || 0,
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
      /**
       * 平面态：新增珠子走 DOM 飞入层(diy3 方案)，其余老珠仍用 canvas 补间归位；
       * 3D/散珠态直接渲染（各自有循环，且飞入无意义）。
       */
      if (!this.properties.preview3d && !this.properties.scattered) {
        this._launchDomFlyForNewBeads()
        this._animateToLayout()
      } else {
        this._render()
      }
    },

    /**
     * 为本次新增的珠子(appear=0)启动 DOM 飞入动画：
     *   ① 该珠 canvas 端 appear 保持 0(_drawBead 跳过不画)；
     *   ② 往 flyingBeads push 一条起点态(底部中央)动画项；
     *   ③ setData 触发 DOM 渲染；
     *   ④ 双 setTimeout：20ms 后设终点(tx/ty)+moving 触发 CSS 过渡，
     *      520ms 后移除该项并把 canvas 端 appear=1 重绘(对齐 diy3 双 setTimeout)。
     */
    _launchDomFlyForNewBeads() {
      const beads = (this._trayBeads || []) as TrayBead[]
      const cx = this._cssWidth / 2
      const newItems: any[] = []
      beads.forEach(bead => {
        /** appear<1 即本次新增；已在飞行中的(uid 已登记)跳过 */
        if ((bead.appear === undefined ? 1 : bead.appear) >= 1) {
          return
        }
        if (this._flyingUidSet && this._flyingUidSet[bead.uid]) {
          return
        }
        const size = (bead.imgLongMm || bead.diameter) * this._pixelPerMm
        if (!this._flyingUidSet) {
          this._flyingUidSet = {}
        }
        this._flyingUidSet[bead.uid] = true
        newItems.push({
          uid: bead.uid,
          image: bead.image,
          /** 起点：画布底部中央(素材栏在下方)，与原 canvas 飞入起点一致 */
          x: cx,
          y: this._cssHeight + 20,
          tx: bead.tx || cx,
          ty: bead.ty || this._cssHeight / 2,
          size: size || 40,
          opacity: 0.2,
          scale: 0.4,
          rotate: -30,
          moving: false
        })
      })
      if (newItems.length === 0) {
        return
      }
      const flyingBeads = (this.data.flyingBeads || []).concat(newItems)
      this.setData({ flyingBeads })
      /** 双 setTimeout：先触发过渡到终点，再在过渡结束后落位 */
      newItems.forEach(item => {
        const enterTimer = setTimeout(() => {
          const list = (this.data.flyingBeads || []).map((f: any) =>
            f.uid === item.uid
              ? { ...f, x: item.tx, y: item.ty, opacity: 1, scale: 1, rotate: 0, moving: true }
              : f
          )
          this.setData({ flyingBeads: list })
        }, 20)
        const settleTimer = setTimeout(() => {
          this._settleFlyingBead(item.uid)
        }, 520)
        if (!this._flyTimers) {
          this._flyTimers = []
        }
        this._flyTimers.push(enterTimer, settleTimer)
      })
    },

    /**
     * 落位单颗飞入珠：从 flyingBeads 移除，并把 canvas 端该珠 appear 置 1 后重绘，
     * 实现“DOM 飞入 → canvas 接管”的无缝交接。
     */
    _settleFlyingBead(uid: string) {
      const beads = (this._trayBeads || []) as TrayBead[]
      const bead = beads.find(b => b.uid === uid)
      if (bead) {
        bead.appear = 1
        /** 确保落到布局终点(飞行期间可能有其它重排) */
        bead.x = bead.tx || bead.x
        bead.y = bead.ty || bead.y
      }
      if (this._flyingUidSet) {
        delete this._flyingUidSet[uid]
      }
      const list = (this.data.flyingBeads || []).filter((f: any) => f.uid !== uid)
      this.setData({ flyingBeads: list })
      this._render()
    },

    /**
     * 立即清空所有进行中的 DOM 飞入(切 3D/散珠/销毁时调用)：
     * 清定时器、把仍在飞的珠子 canvas 端 appear 置 1 直接落位、清空 flyingBeads。
     */
    _flushDomFly() {
      if (this._flyTimers) {
        this._flyTimers.forEach((t: any) => clearTimeout(t))
        this._flyTimers = []
      }
      const beads = (this._trayBeads || []) as TrayBead[]
      beads.forEach(bead => {
        if ((bead.appear === undefined ? 1 : bead.appear) < 1) {
          bead.appear = 1
        }
      })
      this._flyingUidSet = {}
      if ((this.data.flyingBeads || []).length > 0) {
        this.setData({ flyingBeads: [] })
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
      /** easeOutBack 过冲回弹(终点附近略微越过再弹回)，s 控制过冲幅度 */
      const easeOutBack = (x: number): number => {
        const s = 1.7
        const p = x - 1
        return 1 + (s + 1) * p * p * p + s * p * p
      }
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / dur)
        /** 老珠平滑归位用 easeOutCubic(不过冲，避免整串抖动) */
        const e = 1 - Math.pow(1 - t, 3)
        /** 新珠入场用 easeOutBack 过冲回弹，落位更有弹性 */
        const eBack = easeOutBack(t)
        beads.forEach((b, i) => {
          /** 正在 DOM 飞入的珠子：canvas 端不参与补间(保持隐藏在终点)，由 DOM 层负责 */
          if (this._flyingUidSet && this._flyingUidSet[b.uid]) {
            b.x = b.tx || b.x
            b.y = b.ty || b.y
            b.appear = 0
            return
          }
          const fx = from[i].x
          const fy = from[i].y
          const tx = b.tx || 0
          const ty = b.ty || 0
          const isNew = from[i].appear < 1
          const ease = isNew ? eBack : e
          b.x = fx + (tx - fx) * ease
          b.y = fy + (ty - fy) * ease
          /** 新珠加抛物线弧度：中途抬高，形成飞入曲线（仅非 DOM 飞入的兜底路径） */
          if (isNew) {
            b.y -= Math.sin(Math.min(1, t) * Math.PI) * 60
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

    /**
     * 解析珠子实物几何（沿绳尺寸 + 长边 + 旋转模式）
     * 权威依据 = 后端 bore_orientation + size_length_mm/size_width_mm（13.1-A，透传字段）：
     *   along_length 管珠/跑环 → 绳穿长轴，长轴沿切向躺排，沿绳占长边
     *   along_width  药片     → 绳穿短边，长轴沿径向立排，沿绳占短边
     *   none         圆珠     → 沿绳占直径，不旋转
     */
    _parseGeometry(bead: TrayBead) {
      const longMm = bead.sizeLengthMm || bead.diameter
      const shortMm = bead.sizeWidthMm || bead.diameter
      if (bead.boreOrientation === 'along_length') {
        bead.alongCordMm = longMm
        bead.imgLongMm = longMm
        bead.rotateMode = 'tangentLong'
        return
      }
      if (bead.boreOrientation === 'along_width') {
        bead.alongCordMm = shortMm
        bead.imgLongMm = longMm
        bead.rotateMode = 'radialLong'
        return
      }
      bead.alongCordMm = bead.diameter
      bead.imgLongMm = bead.diameter
      bead.rotateMode = 'none'
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
      this._recomputeScale()
      const ringRadius = this._ringRadius
      const capacityMm = this.properties.capacityMm || 150

      /**
       * 角度分配基数：正常按容量(周长)分配，保证首尾相切排满一圈。
       * 兜底缩放：当珠子沿绳总长超过容量(理论上父页已拦截，此处双保险)，
       * 改用“总长”作分母，使全部珠子仍均匀挤在一圈内而不溢出重叠，
       * 借鉴 H5 ymBuildNonOccupyingItems 的 scale=周长/总长 思路。
       */
      const totalAlongMm = beads.reduce((sum, b) => sum + b.alongCordMm, 0)
      const angleBaseMm = totalAlongMm > capacityMm ? totalAlongMm : capacityMm

      /** 每颗珠子占角 = 自身沿绳mm / 分配基数 × 2π；从正上方开始顺时针填弧 */
      let accMm = 0
      const baseOffset = -Math.PI / 2 + (this._globalRot || 0)
      beads.forEach(bead => {
        const midMm = accMm + bead.alongCordMm / 2
        const a = (midMm / angleBaseMm) * 2 * Math.PI + baseOffset
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

    /**
     * 计算绳圈半径与 mm→px 比例（_layout 与用户缩放共用）：
     * 基础比例 fitBase = 恰好不溢出画布的适配值（含默认留白系数 DEFAULT_FIT_RATIO）；
     * 再乘用户缩放系数 _userScale（＋/－按钮与双指捏合），最终缩放的上下限统一由
     * _setUserScale 收在 0.4~2.5。
     * ⚠️ 此处不再对 fit 施加 avail/outer 封顶——旧封顶会把"放大超过填满画布"压回，
     *    导致初始已填满画布时 ＋ 按钮完全无效（放大方向被锁死）。放大允许超出可视区，
     *    上限交给 _setUserScale 的 2.5 兜底；拍照导出不受用户缩放影响。
     */
    _recomputeScale() {
      const beads = (this._trayBeads || []) as TrayBead[]
      const centerX = this._cssWidth / 2
      const centerY = this._cssHeight / 2
      const capacityMm = this.properties.capacityMm || 150
      const maxLongMm = Math.max(...beads.map(b => b.imgLongMm), 12)

      /** 绳圈半径：周长=容量 → R=容量/2π，先按 basePxPerMm 再缩放适配画布 */
      const basePxPerMm = 6
      const ringBase = (capacityMm * basePxPerMm) / (2 * Math.PI)
      /** 拍照模式留白更少（珠子放大填满），普通模式留 8px 边距 */
      const margin = this._photoMode ? 2 : 8
      const avail = Math.min(centerX, centerY) - margin
      const outer = ringBase + (maxLongMm * basePxPerMm) / 2
      /**
       * 基础适配：不溢出画布的最大比例，再乘默认留白系数（普通模式 0.8 留出上下留白，
       * 拍照模式 1 填满不留白）。用户缩放在此基础上叠加。
       */
      const fitToCanvas = outer > avail ? avail / outer : 1
      const defaultRatio = this._photoMode ? 1 : 0.8
      const fitBase = fitToCanvas * defaultRatio
      const userScale = this._photoMode ? 1 : this._userScale || 1
      const fit = fitBase * userScale
      this._ringRadius = ringBase * fit
      this._pixelPerMm = basePxPerMm * fit
    },

    /** 外部调用：步进缩放（右下角＋/－按钮） */
    adjustZoom(delta: number) {
      this._setUserScale((this._userScale || 1) + delta)
    },

    /** 应用用户缩放：平面/3D 重排落位；散珠态保留物理现场只更新比例 */
    _setUserScale(scale: number) {
      const next = Math.max(0.4, Math.min(2.5, scale))
      if (Math.abs(next - (this._userScale || 1)) < 0.005) {
        return
      }
      this._userScale = next
      if (this.properties.scattered) {
        this._recomputeScale()
        this._render()
        /** 珠径变化后可能重叠，唤醒物理循环重新推开 */
        if (!this._physicsRafId) {
          this._startPhysics()
        }
      } else {
        this._layout()
        this._render()
      }
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
      if (!this._photoMode) {
        /** 多选高亮：每颗选中珠画品牌色描边圈（对齐 diy-design 的多选删除交互） */
        const selected = this._selectedIndices || []
        selected.forEach((idx: number) => {
          if (beads[idx]) {
            this._drawSelectionRing(ctx, beads[idx])
          }
        })
        /** 恰好选中一颗时，头顶画 × 快捷删除按钮（多选时走页面批量删除栏） */
        if (selected.length === 1 && beads[selected[0]]) {
          this._drawDeleteButton(ctx, beads[selected[0]])
        }
      }
    },

    /** 画选中珠子的高亮描边圈（多选删除的视觉反馈） */
    _drawSelectionRing(ctx: any, bead: TrayBead) {
      const r = (bead.imgLongMm * this._pixelPerMm) / 2
      ctx.save()
      ctx.beginPath()
      ctx.arc(bead.x, bead.y, r + 5, 0, Math.PI * 2)
      ctx.strokeStyle = '#C44569'
      ctx.lineWidth = 3
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.restore()
    },

    /** 当前单选下标（恰好选中一颗时返回该下标，否则 -1；供 × 按钮逻辑复用） */
    _singleSelectedIndex(): number {
      const selected = this._selectedIndices || []
      return selected.length === 1 ? selected[0] : -1
    },

    /** 清空选中态并通知父页（selectioncount 归零，父页隐藏批量删除栏） */
    _clearSelection() {
      const had = (this._selectedIndices || []).length > 0
      this._selectedIndices = []
      if (had) {
        this.triggerEvent('selectionchange', { indices: [] })
      }
    },

    /** 供父页调用：清空选中并重绘（批量删除完成后复位） */
    clearSelection() {
      this._clearSelection()
      this._render()
    },

    /** 供父页调用：读取当前选中下标数组（批量删除用） */
    getSelectedIndices(): number[] {
      return (this._selectedIndices || []).slice()
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

    /** 判断点是否落在（单选）选中珠子的 × 按钮上 */
    _hitDeleteButton(x: number, y: number): boolean {
      const beads = (this._trayBeads || []) as TrayBead[]
      const bead = beads[this._singleSelectedIndex()]
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
      /** 异形珠(药片/跑环)用带朝向的轮廓阴影，而非圆形阴影 */
      if (bead.shape === 'special') {
        this._drawSpecialShadow(ctx, bead)
        return
      }
      /**
       * 设备分级降质(借鉴 diy2 renderQualityMode)：
       *   运动中(拖拽/惯性/散珠/3D自转) 或 低端机 → 只画单层接触阴影，省去扩散层的
       *   大半径径向渐变(最耗填充率的一步)，保证运动流畅；静止满帧后自动恢复双层高质量。
       */
      const lowQuality = this._motionMode || this._tier === 'low'
      if (lowQuality) {
        this._drawContactShadow(ctx, bead, r)
        return
      }
      /**
       * 静止高质量态：优先用离屏模板 blit(借鉴 diy2 getBeadShadowTemplate)，
       *   把“扩散+接触”双层渐变预渲染到固定尺寸离屏 canvas，主图一次 drawImage 即可，
       *   省去每帧两次 createRadialGradient(珠子多时静止帧开销显著下降)。
       *   模板不可用(离屏创建失败)时回退实时双层绘制。
       */
      const tpl = this._getRoundShadowTemplate()
      if (tpl) {
        /**
         * 模板内单位半径 _shadowTplUnitR(CSS) 对应珠半径 1，模板总 CSS 边长
         * = 2×_shadowTplHalfCss。要让 blit 后阴影有效半径 = 真实 r，则整张模板
         * 目标 CSS 边长 w = r / unitR × 模板CSS边长；模板珠心在正中，故居中对齐珠心。
         */
        const boxCss = this._shadowTplHalfCss * 2
        const w = (r / this._shadowTplUnitR) * boxCss
        ctx.save()
        ctx.drawImage(tpl, bead.x - w / 2, bead.y - w / 2, w, w)
        ctx.restore()
        return
      }
      /** 回退·第1层扩散软阴影 */
      ctx.save()
      ctx.translate(bead.x + r * 0.16, bead.y + r * 0.34)
      ctx.scale(1, 0.66)
      const diffuse = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.25)
      diffuse.addColorStop(0, 'rgba(0,0,0,0.2)')
      diffuse.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = diffuse
      ctx.beginPath()
      ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      /** 回退·第2层接触硬阴影 */
      this._drawContactShadow(ctx, bead, r)
    },

    /**
     * 圆珠“扩散+接触”双层阴影离屏模板(缓存)。
     * 以固定单位半径 _shadowTplUnitR 预渲染，绘制时按 (真实半径/单位半径) 缩放 blit。
     * 圆珠阴影与材质无关(只是黑色渐变)，故全体共用一张模板，key 固定。
     * @returns 离屏 canvas 或 null
     */
    _getRoundShadowTemplate(): any {
      if (this._roundShadowTpl) {
        return this._roundShadowTpl
      }
      /** 单位珠半径(模板坐标)，取 60；模板总尺寸需容纳扩散层(半径1.25+偏移)与纵向压扁 */
      const unitR = 60
      const dpr = this._dpr || 1
      /** 阴影向右下偏移，需右/下留更多余量；用 3.4×unitR 见方够放 */
      const box = Math.ceil(unitR * 3.4 * dpr)
      let off: any
      try {
        off = wx.createOffscreenCanvas({ type: '2d', width: box, height: box })
      } catch (_e) {
        return null
      }
      const octx = off.getContext('2d')
      octx.scale(dpr, dpr)
      const boxCss = box / dpr
      /** 模板内“珠心”放在正中 */
      const cx = boxCss / 2
      const cy = boxCss / 2
      const r = unitR
      /** 第1层·扩散软阴影 */
      octx.save()
      octx.translate(cx + r * 0.16, cy + r * 0.34)
      octx.scale(1, 0.66)
      const diffuse = octx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.25)
      diffuse.addColorStop(0, 'rgba(0,0,0,0.2)')
      diffuse.addColorStop(1, 'rgba(0,0,0,0)')
      octx.fillStyle = diffuse
      octx.beginPath()
      octx.arc(0, 0, r * 1.25, 0, Math.PI * 2)
      octx.fill()
      octx.restore()
      /** 第2层·接触硬阴影 */
      octx.save()
      octx.translate(cx + r * 0.1, cy + r * 0.32)
      octx.scale(1, 0.5)
      const contact = octx.createRadialGradient(0, 0, 0, 0, 0, r * 0.72)
      contact.addColorStop(0, 'rgba(0,0,0,0.28)')
      contact.addColorStop(1, 'rgba(0,0,0,0)')
      octx.fillStyle = contact
      octx.beginPath()
      octx.arc(0, 0, r * 0.72, 0, Math.PI * 2)
      octx.fill()
      octx.restore()
      /** 记录模板“珠心到边”的 CSS 半径(=boxCss/2)，绘制时 scale = 真实r / unitR */
      this._shadowTplUnitR = unitR
      this._shadowTplHalfCss = boxCss / 2
      this._roundShadowTpl = off
      return off
    },

    /**
     * 异形珠轮廓阴影：按珠子真实长/短边(imgLongMm × 视觉短边比例)绘制带朝向的
     * 圆角矩形阴影，随珠子 rotateMode 旋转，比圆形阴影更贴合药片/跑环的真实外形。
     */
    _drawSpecialShadow(ctx: any, bead: TrayBead) {
      const longPx = bead.imgLongMm * this._pixelPerMm
      const shortPx = longPx * getSpecialRatio(bead)
      let rotation = 0
      if (bead.rotateMode === 'radialLong') {
        rotation = bead.angle + Math.PI / 2
      } else if (bead.rotateMode === 'tangentLong') {
        rotation = bead.angle + Math.PI
      }
      /**
       * 优先用实拍图算出的“模糊轮廓剪影”当阴影(借鉴 diy2 soft-contour)，
       * 比圆角矩形更贴合药片/跑环真实外形；图未加载完成则回退圆角矩形近似。
       */
      const contour = this._getContourShadow(bead)
      if (contour) {
        ctx.save()
        /** 阴影相对珠体向右下偏移，模拟光从左上来 */
        ctx.translate(bead.x + longPx * 0.08, bead.y + longPx * 0.12)
        if (rotation !== 0) {
          ctx.rotate(rotation)
        }
        ctx.globalAlpha = 0.28
        ctx.drawImage(contour, -shortPx / 2, -longPx / 2, shortPx, longPx)
        ctx.restore()
        return
      }
      const halfLong = longPx / 2
      const halfShort = shortPx / 2
      const radius = Math.min(halfShort, halfLong) * 0.9
      ctx.save()
      /** 回退：圆角矩形近似阴影，向右下偏移 */
      ctx.translate(bead.x + longPx * 0.08, bead.y + longPx * 0.12)
      if (rotation !== 0) {
        ctx.rotate(rotation)
      }
      ctx.fillStyle = 'rgba(0,0,0,0.22)'
      this._roundRectPath(ctx, -halfShort, -halfLong, shortPx, longPx, radius)
      ctx.fill()
      ctx.restore()
    },

    /**
     * 异形珠轮廓剪影阴影模板(离屏缓存)：
     *   1. 把实拍图画到离屏 canvas
     *   2. globalCompositeOperation='source-in' 用黑色填充 → 得到珠子形状的纯黑剪影
     *   3. 小程序 Canvas 无 filter:blur，用多次半透明偏移叠加模拟模糊边缘
     * 缓存 key = 图片 url，与 _tplCache 同生命周期(组件销毁即回收)，图未加载返回 null。
     * @returns 离屏 canvas 或 null
     */
    _getContourShadow(bead: TrayBead): any {
      const image = this._loadImage(bead.image)
      if (!image) {
        return null
      }
      if (!this._contourCache) {
        this._contourCache = {}
      }
      const key = bead.image
      if (this._contourCache[key]) {
        return this._contourCache[key]
      }
      /** 模板分辨率固定 120px × dpr，短边按实拍图宽高比收窄贴合（image_media 宽高派生） */
      const ratio = getSpecialRatio(bead)
      const H = 120 * (this._dpr || 1)
      const W = Math.max(2, Math.round(H * ratio))
      let off: any
      try {
        off = wx.createOffscreenCanvas({ type: '2d', width: W, height: H })
      } catch (_e) {
        return null
      }
      const octx = off.getContext('2d')
      /**
       * 阶段1·累积柔化边缘：把实拍图按 9 个方向微小偏移、低透明各画一遍，
       *   非透明区域的 alpha 在中心累积到最高、边缘渐弱，形成“模糊边”的 alpha 分布。
       */
      const OFFSETS = [
        [0, 0],
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
        [1.5, 1.5],
        [-1.5, 1.5],
        [1.5, -1.5],
        [-1.5, -1.5]
      ]
      octx.globalAlpha = 0.2
      OFFSETS.forEach(([dx, dy]) => {
        octx.drawImage(image, dx, dy, W, H)
      })
      /**
       * 阶段2·染黑成剪影：source-in 只在已绘制(非透明)区域填充黑色，
       *   保留阶段1 累积的 alpha 作为剪影浓淡，得到贴合外形的柔边黑色剪影。
       */
      octx.globalAlpha = 1
      octx.globalCompositeOperation = 'source-in'
      octx.fillStyle = '#000000'
      octx.fillRect(0, 0, W, H)
      this._contourCache[key] = off
      return off
    },

    /** 圆角矩形路径(异形阴影用)：兼容无 roundRect 的旧 Canvas 实现 */
    _roundRectPath(ctx: any, x: number, y: number, w: number, h: number, r: number) {
      const rr = Math.min(r, w / 2, h / 2)
      ctx.beginPath()
      ctx.moveTo(x + rr, y)
      ctx.arcTo(x + w, y, x + w, y + h, rr)
      ctx.arcTo(x + w, y + h, x, y + h, rr)
      ctx.arcTo(x, y + h, x, y, rr)
      ctx.arcTo(x, y, x + w, y, rr)
      ctx.closePath()
    },

    /** 接触阴影(多层阴影第2层)：珠子正下方偏深的小椭圆径向渐变 */
    _drawContactShadow(ctx: any, bead: TrayBead, r: number) {
      ctx.save()
      ctx.translate(bead.x + r * 0.1, bead.y + r * 0.32)
      ctx.scale(1, 0.5)
      const contact = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.72)
      contact.addColorStop(0, 'rgba(0,0,0,0.28)')
      contact.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = contact
      ctx.beginPath()
      ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2)
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
      const shortBase = bead.shape === 'special' ? base * getSpecialRatio(bead) : base
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
      const shortPx = bead.shape === 'special' ? longPx * getSpecialRatio(bead) : longPx

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
    /** 双指捏合开始/更新：记录起始指距与起始缩放（所有模式通用，优先级高于拖拽/旋转） */
    _tryHandlePinch(e: any): boolean {
      const touches = e.touches || []
      if (touches.length < 2) {
        return false
      }
      const dist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y)
      if (!this._pinching) {
        this._pinching = true
        this._pinchStartDist = dist || 1
        this._pinchStartScale = this._userScale || 1
        /** 第二根手指落下即取消进行中的拖珠/旋转/3D翻转，避免手势打架 */
        this._dragIndex = -1
        this._rotating = false
        this._drag3d = false
      } else {
        this._setUserScale(this._pinchStartScale * (dist / this._pinchStartDist))
      }
      return true
    },

    /** 触摸开始：双指=捏合缩放；3D 态记录起点用于翻转；平面态命中珠子准备拖拽/轻点，空白旋转 */
    onTouchStart(e: any) {
      if (this._tryHandlePinch(e)) {
        return
      }
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
      /** 若恰好选中一颗珠且点中了它头顶的 × 按钮：直接删除 */
      const singleIdx = this._singleSelectedIndex()
      if (singleIdx >= 0 && this._hitDeleteButton(point.x, point.y)) {
        this._clearSelection()
        this._emitRemove(singleIdx)
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
        /** 按下即停止上一轮惯性旋转，避免手指与飞轮抢方向 */
        this._stopRotateInertia()
        const cx = this._cssWidth / 2
        const cy = this._cssHeight / 2
        this._lastAngle = Math.atan2(point.y - cy, point.x - cx)
        /** 重置角速度采样（惯性飞轮的初速度来源） */
        this._angVel = 0
      }
    },

    /** 触摸移动：双指=捏合缩放；3D 态左右拖=yaw 上下拖=pitch；平面态拖珠/旋转 */
    onTouchMove(e: any) {
      if (this._pinching || (e.touches && e.touches.length >= 2)) {
        this._tryHandlePinch(e)
        return
      }
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
        /** 拖拽中降阴影质量保跟手流畅 */
        this._motionMode = true
        /** 让位散开：其余珠子朝拖拽落点腾出的插入位平滑靠拢，营造“让路”感 */
        this._applyMakeWaySpread(point)
        this._render()
      } else if (this._rotating) {
        const cx = this._cssWidth / 2
        const cy = this._cssHeight / 2
        const ang = Math.atan2(point.y - cy, point.x - cx)
        const delta = this._angleDiff(ang, this._lastAngle)
        this._globalRot = (this._globalRot || 0) + delta
        /** 记录本帧角速度(弧度/帧)，抬手后作为惯性飞轮初速度 */
        this._angVel = delta
        this._lastAngle = ang
        /** 旋转拖动中降阴影质量 */
        this._motionMode = true
        this._layout()
        this._render()
      }
      this._lastPoint = point
    },
    /**
     * 触摸结束：判定 轻点删除 / 拖出删除 / 拖拽换位 / 旋转结束
     * 通过事件通知父页更新数据源（组件不直接改 properties.beads）
     */
    onTouchEnd(e: any) {
      /** 捏合结束：剩余触点不足两指即退出捏合态；本轮手势不再触发拖拽/轻点判定 */
      if (this._pinching) {
        if (!e || !e.touches || e.touches.length < 2) {
          this._pinching = false
        }
        return
      }
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
      /** 珠子拖拽结束：退出运动态(旋转分支下方另行处理飞轮) */
      if (dragIndex >= 0) {
        this._motionMode = false
      }

      if (dragIndex < 0) {
        /** 空白处旋转抬手：角速度足够则启动惯性飞轮(飞轮内部维持 motionMode)，
         *  否则立即退出运动态并重绘一帧高质量阴影。 */
        if (this._rotating && Math.abs(this._angVel || 0) >= 0.004) {
          this._startRotateInertia()
        } else {
          this._motionMode = false
          this._render()
        }
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
        /**
         * 轻点：切换该珠的选中态（支持多选，对齐 diy-design 的多选批量删除）。
         * 单选时头顶浮出 × 快捷删除按钮；多选时由父页批量删除栏统一操作。
         */
        const selected = (this._selectedIndices || []).slice()
        const pos = selected.indexOf(dragIndex)
        if (pos >= 0) {
          selected.splice(pos, 1)
        } else {
          selected.push(dragIndex)
        }
        this._selectedIndices = selected
        this.triggerEvent('selectionchange', { indices: selected.slice() })
        this._layout()
        if (selected.length === 1) {
          this._xAlpha = 0
          this._animateDeleteButton()
        } else {
          this._render()
        }
        return
      }
      /** 拖动后取消选中态 */
      this._clearSelection()

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
    /**
     * 让位散开：拖拽某颗珠子时，其余珠子按“拖拽落点角度”重新分布到环上，
     * 空出被拖珠原本的位置(其他珠依次让路)，并用缓动朝新目标位靠拢。
     * 仅平面态生效；被拖珠本身不参与重排(跟随手指)。
     * @param point 当前手指落点(CSS 像素)
     */
    _applyMakeWaySpread(point: { x: number; y: number }) {
      const beads = (this._trayBeads || []) as TrayBead[]
      const dragIndex = this._dragIndex
      if (dragIndex < 0 || beads.length <= 1) {
        return
      }
      const centerX = this._cssWidth / 2
      const centerY = this._cssHeight / 2
      const capacityMm = this.properties.capacityMm || 150
      const totalAlongMm = beads.reduce((sum, b) => sum + b.alongCordMm, 0)
      const angleBaseMm = totalAlongMm > capacityMm ? totalAlongMm : capacityMm
      /** 拖拽落点的角度，决定被拖珠“想插入”的位置 */
      const dropAngle = Math.atan2(point.y - centerY, point.x - centerX)
      const baseOffset = -Math.PI / 2 + (this._globalRot || 0)
      /** 其余珠子按原顺序重新累加角度，遇到拖珠目标插入点则跳过一个身位 */
      const others = beads.filter((_b, i) => i !== dragIndex)
      const dragMm = beads[dragIndex].alongCordMm
      let accMm = 0
      /** 先估算被拖珠应插入到 others 的哪个位置(按落点角度最近) */
      let insertAt = others.length
      let minDiff = Infinity
      others.forEach((b, i) => {
        const midMm = accMm + b.alongCordMm / 2
        const a = (midMm / angleBaseMm) * 2 * Math.PI + baseOffset
        const diff = Math.abs(this._angleDiff(dropAngle, a))
        if (diff < minDiff) {
          minDiff = diff
          insertAt = i
        }
        accMm += b.alongCordMm
      })
      /** 再按“插入点前后留出被拖珠身位”重排其余珠目标角度并缓动靠拢 */
      accMm = 0
      const lerp = 0.25
      others.forEach((b, i) => {
        if (i === insertAt) {
          accMm += dragMm
        }
        const midMm = accMm + b.alongCordMm / 2
        const a = (midMm / angleBaseMm) * 2 * Math.PI + baseOffset
        b.angle = a
        const tx = centerX + this._ringRadius * Math.cos(a)
        const ty = centerY + this._ringRadius * Math.sin(a)
        b.x += (tx - b.x) * lerp
        b.y += (ty - b.y) * lerp
        accMm += b.alongCordMm
      })
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

    /**
     * 启动整串惯性旋转(飞轮手感)：抬手后按最后角速度 _angVel 逐帧衰减(×0.95)继续转，
     * 角速度衰减到极小(<0.0005 rad/帧)即停止并复位循环句柄，避免空转耗电。
     * 仅平面态生效(3D/散珠有各自循环)。
     */
    _startRotateInertia() {
      if (!this._canvas) {
        return
      }
      const initialVel = this._angVel || 0
      /** 初速度太小视为“慢慢松手”，不触发飞轮，避免误转 */
      if (Math.abs(initialVel) < 0.004) {
        return
      }
      this._stopRotateInertia()
      /** 进入运动态：降阴影质量保流畅 */
      this._motionMode = true
      const decay = 0.95
      const minVel = 0.0005
      const spin = () => {
        this._angVel = (this._angVel || 0) * decay
        this._globalRot = (this._globalRot || 0) + this._angVel
        this._layout()
        this._render()
        if (Math.abs(this._angVel) > minVel) {
          this._inertiaRafId = this._canvas.requestAnimationFrame(spin)
        } else {
          this._inertiaRafId = 0
          /** 飞轮停下：恢复高质量并重绘一帧精致阴影 */
          this._motionMode = false
          this._render()
        }
      }
      this._inertiaRafId = this._canvas.requestAnimationFrame(spin)
    },

    /** 停止惯性旋转飞轮 */
    _stopRotateInertia() {
      if (this._inertiaRafId && this._canvas) {
        this._canvas.cancelAnimationFrame(this._inertiaRafId)
      }
      this._inertiaRafId = 0
    },

    /**
     * 供父页调用：整串平滑转一圈展示(借鉴 diy3 spinBracelet)。
     * 平面态下从当前角度缓动 +2π 回到原位，约 900ms，easeInOutCubic。
     * 3D/散珠态忽略(各有自己的展示动画)。拍照前给用户一个“转一圈欣赏”的动作。
     */
    spinOnce() {
      if (!this._canvas || this.properties.preview3d || this.properties.scattered) {
        return
      }
      /** 已在转一圈则忽略重复触发 */
      if (this._spinOnceRafId) {
        return
      }
      this._stopRotateInertia()
      this._motionMode = true
      const startRot = this._globalRot || 0
      const start = Date.now()
      const dur = 900
      const easeInOutCubic = (x: number): number =>
        x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
      const step = () => {
        const t = Math.min(1, (Date.now() - start) / dur)
        this._globalRot = startRot + easeInOutCubic(t) * 2 * Math.PI
        this._layout()
        this._render()
        if (t < 1) {
          this._spinOnceRafId = this._canvas.requestAnimationFrame(step)
        } else {
          /** 归一到起点角度，收尾恢复高质量阴影 */
          this._globalRot = startRot
          this._spinOnceRafId = 0
          this._motionMode = false
          this._layout()
          this._render()
        }
      }
      this._spinOnceRafId = this._canvas.requestAnimationFrame(step)
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
      /** 切到 3D 前先停平面惯性飞轮，flush 进行中的 DOM 飞入，并清多选(3D 态无高亮圈，避免不可见选中被误删) */
      this._stopRotateInertia()
      this._flushDomFly()
      this._clearSelection()
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
     * 播放音效（加珠/删除/换位）——WebAudio 实时合成，零音频文件依赖。
     * 用振荡器 + 增益包络 + 低通滤波实时合成三种短音：
     *   add    加珠：明亮上扬(三角波 660→990Hz)
     *   remove 删除：低沉下降(正弦波 440→220Hz)
     *   click  换位：清脆短促(方波 880Hz 极短)
     * WebAudio 不可用时静默降级，不影响主流程。音效属 UI 反馈，前端自主决定。
     */
    _playSound(key: string) {
      const audioCtx = this._ensureAudioContext()
      if (!audioCtx) {
        return
      }
      /** 三种音效的合成参数(UI 常量，非业务数据) */
      const PRESETS: Record<string, any> = {
        add: { type: 'triangle', freq: 660, toFreq: 990, dur: 0.12, gain: 0.18, cutoff: 3200 },
        remove: { type: 'sine', freq: 440, toFreq: 220, dur: 0.16, gain: 0.16, cutoff: 1600 },
        click: { type: 'square', freq: 880, toFreq: 880, dur: 0.05, gain: 0.1, cutoff: 2600 }
      }
      const preset = PRESETS[key] || PRESETS.click
      try {
        const now = audioCtx.currentTime
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        const filter = audioCtx.createBiquadFilter()
        osc.type = preset.type
        osc.frequency.setValueAtTime(preset.freq, now)
        osc.frequency.linearRampToValueAtTime(preset.toFreq, now + preset.dur)
        filter.type = 'lowpass'
        filter.frequency.setValueAtTime(preset.cutoff, now)
        /** 增益包络：瞬起 + 指数衰减，模拟敲击音尾 */
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(preset.gain, now + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + preset.dur)
        osc.connect(filter)
        filter.connect(gain)
        gain.connect(audioCtx.destination)
        osc.start(now)
        osc.stop(now + preset.dur + 0.02)
      } catch (_e) {
        /* 合成失败时静默降级 */
      }
    },

    /** 惰性创建并缓存 WebAudioContext(小程序 wx.createWebAudioContext) */
    _ensureAudioContext(): any {
      if (this._audioCtx !== undefined) {
        return this._audioCtx
      }
      try {
        this._audioCtx = wx.createWebAudioContext ? wx.createWebAudioContext() : null
      } catch (_e) {
        this._audioCtx = null
      }
      return this._audioCtx
    },

    /** 散珠/收拢切换：进入散珠启动物理循环，收拢则平滑飞回圆环 */
    _onScatterChange() {
      /** 切散珠前先停平面惯性飞轮，flush 进行中的 DOM 飞入，并清多选(散珠位置随物理变化，选中圈会错位) */
      this._stopRotateInertia()
      this._flushDomFly()
      this._clearSelection()
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

    /**
     * 启动散珠物理循环。
     * 静止停帧省电：当整体动能连续多帧低于阈值(珠子基本不动)时，暂停 rAF 循环，
     * 直到下次交互(抖一抖/拖拽/加删珠)再唤醒，避免散珠稳定后仍空转耗电。
     */
    _startPhysics() {
      if (this._physicsRafId || !this._canvas) {
        return
      }
      this._settleFrames = 0
      /** 散珠运动中降阴影质量 */
      this._motionMode = true
      const loop = () => {
        const energy = this._stepPhysics()
        this._render()
        /** 累计低能量帧数：连续 30 帧近静止则停循环 */
        if (energy < 0.08) {
          this._settleFrames = (this._settleFrames || 0) + 1
        } else {
          this._settleFrames = 0
        }
        if (this._settleFrames >= 30) {
          this._physicsRafId = 0
          /** 散珠稳定：恢复高质量并重绘一帧精致阴影 */
          this._motionMode = false
          this._render()
          return
        }
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
      /** 若物理循环已因静止停帧而暂停，抖一抖后重新唤醒 */
      if (this.properties.scattered && !this._physicsRafId) {
        this._startPhysics()
      }
    },
    /**
     * 单步散珠物理（Verlet 积分）：
     *   1. 向画布中心的弱重力（把珠子聚拢到托盘中央，避免散飞）
     *   2. Verlet 更新：pos += (pos - prevPos)·摩擦 + 加速度
     *   3. 圆形边界约束（限制在托盘内，撞壁反弹衰减）
     *   4. 珠子间碰撞（两两推开，避免重叠）
     * 低端机减少碰撞迭代次数保流畅。
     */
    _stepPhysics(): number {
      const beads = (this._trayBeads || []) as TrayBead[]
      if (beads.length === 0) {
        return 0
      }
      const cx = this._cssWidth / 2
      const cy = this._cssHeight / 2
      const trayR = Math.min(cx, cy) - 8
      const friction = 0.92
      const gravity = 0.12
      /** 累计整体动能(各珠速度平方和)，供静止停帧判定 */
      let totalEnergy = 0

      beads.forEach(bead => {
        const r = (bead.imgLongMm * this._pixelPerMm) / 2
        const vx = (bead.x - (bead.px || bead.x)) * friction
        const vy = (bead.y - (bead.py || bead.y)) * friction
        totalEnergy += vx * vx + vy * vy
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
      return totalEnergy
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

      /** 导出完成后统一恢复原渲染状态(3D自转/散珠物理) */
      const restore = () => {
        this._photoMode = false
        this._layout()
        this._render()
        if (was3d) {
          this._start3dSpin()
        } else if (wasScattered) {
          this._startPhysics()
        }
      }

      /** 等一帧确保绘制完成再截图 */
      this._canvas.requestAnimationFrame(() => {
        wx.canvasToTempFilePath({
          canvas: this._canvas,
          success: (res: any) => {
            callback(res.tempFilePath)
            restore()
          },
          /** 主方案失败：降级重绘后二次导出(双保险)，仍失败才回调空串 */
          fail: () => this._exportFallback(callback, restore)
        })
      })
    },

    /**
     * 导出兜底方案：主导出失败时(常见于高 DPR 大画布内存不足)，
     * 缩小采样倍率重绘一帧再导出，牺牲清晰度换取成功率。
     * @param callback 回调 tempFilePath，兜底仍失败回调空串
     * @param restore 恢复原渲染状态的清理函数
     */
    _exportFallback(callback: (_path: string) => void, restore: () => void) {
      if (!this._canvas) {
        callback('')
        restore()
        return
      }
      this._render()
      this._canvas.requestAnimationFrame(() => {
        wx.canvasToTempFilePath({
          canvas: this._canvas,
          /** 兜底降采样到 0.6，减小导出尺寸提升成功率 */
          destWidth: Math.round(this._cssWidth * 0.6),
          destHeight: Math.round(this._cssHeight * 0.6),
          success: (res: any) => {
            callback(res.tempFilePath)
            restore()
          },
          fail: () => {
            callback('')
            restore()
          }
        })
      })
    }
  }
})
