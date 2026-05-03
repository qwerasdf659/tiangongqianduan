/**
 * 转盘 子组件 - conic-gradient扇区 + 极坐标文字定位
 * @file components/lottery-activity/sub/wheel/wheel.ts
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('wheel')

/** 转盘盘面半径（rpx），对应 scss 中 wheel-plate 的 width/2 */
const PLATE_RADIUS = 280

/** 奖品文字距圆心的距离比例（0~1，越大越靠外） */
const TEXT_RADIUS_RATIO = 0.65

/** 扇区配色（循环使用） */
const SECTOR_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#FFD93D',
  '#9775FA',
  '#FF8A5C',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7'
]

const prizeImageBehavior = require('../../shared/prize-image-behavior')

Component({
  behaviors: [prizeImageBehavior],

  properties: {
    prizes: { type: Array, value: [] },
    prizesForPreview: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    /** 中奖奖品在prizes数组中的索引（由父组件根据API结果计算） */
    targetPrizeIndex: { type: Number, value: -1 },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' }
  },

  data: {
    /** 转盘旋转角度 */
    rotateAngle: 0,
    /** 是否正在旋转 */
    spinning: false,
    /** 每个扇区角度（度） */
    sectorAngle: 0,
    /** conic-gradient 背景样式字符串 */
    conicGradient: '',
    /** 每个奖品的绝对定位样式（极坐标转直角坐标） */
    prizePositions: [] as string[]
  },

  observers: {
    prizes(prizes: any[]) {
      if (prizes && prizes.length > 0) {
        this._buildWheel(prizes)
      }
    },
    isInProgress(val: boolean) {
      if (val && !this.data.spinning) {
        this._startSpin()
      }
    }
  },

  methods: {
    /** 奖品预览项点击 — 触发详情弹窗（冒泡到 lottery-activity 层） */
    onPrizeTap(e: any) {
      const prizeData = e.currentTarget.dataset.prize
      if (prizeData) {
        this.triggerEvent('prizedetail', { prize: prizeData })
      }
    },

    /**
     * 构建转盘：生成 conic-gradient 背景 + 计算每个奖品的极坐标位置
     * @param prizes 奖品列表（后端数据）
     */
    _buildWheel(prizes: any[]) {
      const count = prizes.length
      if (count === 0) {
        return
      }

      const sectorAngle = 360 / count

      /* 生成 conic-gradient 扇区背景 */
      const gradientParts: string[] = []
      for (let i = 0; i < count; i++) {
        const color = SECTOR_COLORS[i % SECTOR_COLORS.length]
        const startDeg = sectorAngle * i
        const endDeg = sectorAngle * (i + 1)
        gradientParts.push(`${color} ${startDeg}deg ${endDeg}deg`)
      }
      /* from -90deg 让扇区0从12点方向（指针位置）开始，与旋转角度计算对齐 */
      const conicGradient = `conic-gradient(from -90deg, ${gradientParts.join(', ')})`

      /* 计算每个奖品文字的位置（极坐标 → 直角坐标） */
      const prizePositions: string[] = []
      const textRadius = PLATE_RADIUS * TEXT_RADIUS_RATIO

      for (let i = 0; i < count; i++) {
        /* 扇区中心角度（从12点方向顺时针，CSS角度0deg=3点方向，需偏移-90deg） */
        const midAngleDeg = sectorAngle * i + sectorAngle / 2 - 90
        const midAngleRad = (midAngleDeg * Math.PI) / 180

        /* 极坐标转直角坐标（圆心在 plate 中心） */
        const offsetX = textRadius * Math.cos(midAngleRad)
        const offsetY = textRadius * Math.sin(midAngleRad)

        /* 文字旋转角度：让文字沿径向朝外 */
        const textRotate = sectorAngle * i + sectorAngle / 2

        /* 偏移量对齐 .wheel-prize 容器尺寸 width:120rpx / height:90rpx 的一半 */
        prizePositions.push(
          `left: calc(50% + ${Math.round(offsetX)}rpx - 60rpx); ` +
            `top: calc(50% + ${Math.round(offsetY)}rpx - 45rpx); ` +
            `transform: rotate(${textRotate}deg);`
        )
      }

      this.setData({ sectorAngle, conicGradient, prizePositions })
    },

    /** 点击抽奖按钮 */
    onDraw() {
      if (this.data.spinning) {
        return
      }
      this.triggerEvent('draw', { count: 1 })
    },

    /**
     * 开始旋转动画
     * 转盘停止位置由父组件传入的 targetPrizeIndex 决定，与API中奖结果一致
     */
    _startSpin() {
      const prizes = this.properties.prizes as any[]
      if (!prizes || prizes.length === 0) {
        return
      }

      this.setData({ spinning: true })

      const count = prizes.length
      const targetIndex = this.properties.targetPrizeIndex as number
      if (targetIndex < 0 || targetIndex >= count) {
        log.error('[wheel] 父组件传入的 targetPrizeIndex 无效:', targetIndex, '奖品数量:', count)
        this.setData({ spinning: false })
        return
      }
      const finalIndex = targetIndex
      const sectorAngle = 360 / count
      /*
       * 扇区从12点方向顺时针排列（conic-gradient from -90deg）
       * 指针固定在12点方向
       * 盘面最终停止角度 R，指针指向扇区角度 = (360 - R % 360) % 360
       * 要指向扇区 finalIndex 中心 = finalIndex * sectorAngle + sectorAngle/2
       * 所以 R % 360 = (360 - finalIndex * sectorAngle - sectorAngle / 2) % 360
       *
       * 用绝对角度计算，避免累积误差：
       * 先将当前角度向上取整到360的倍数，再加额外圈数和目标偏移
       */
      const currentAngle = this.data.rotateAngle
      const baseAngle = Math.ceil(currentAngle / 360) * 360
      const extraRounds = (5 + Math.floor(Math.random() * 4)) * 360
      const stopOffset = (360 - finalIndex * sectorAngle - sectorAngle / 2 + 360) % 360
      const finalAngle = baseAngle + extraRounds + stopOffset

      this.setData({ rotateAngle: finalAngle })

      /* 动画持续约4秒（CSS transition控制），结束后通知父组件 */
      setTimeout(() => {
        this.setData({ spinning: false })
        this.triggerEvent('animationEnd')
      }, 4000)
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.setData({ spinning: false })
    }
  }
})
