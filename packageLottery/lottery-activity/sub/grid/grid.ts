/**
 * 网格抽奖 子组件（支持 3×3 / 4×3 / 4×4 动态格位）
 *
 * @description 按后端 display.mode 对应的 gridCols + 奖品数动态渲染格位：
 *   - grid_3x3：8 个奖品格 + 中央按钮（经典九宫格，3 列）
 *   - grid_4x3：12 个奖品格 + 底部按钮（4 列 3 行）
 *   - grid_4x4：16 个奖品格 + 底部按钮（4 列 4 行）
 *   外圈高亮轮转动画按实际格位数 cellCount 适配，停在中奖格（targetPrizeIndex）。
 *
 * 驱动模式（对齐 wheel 子组件标准）：
 *   父组件设置 targetPrizeIndex（中奖格索引）+ isInProgress=true →
 *   observer 监听 isInProgress 自动启动轮转 → 结束 triggerEvent('animationEnd')。
 *
 * @file sub/grid/grid.ts
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('grid')
const prizeImageBehavior = require('../../shared/prize-image-behavior')

const { shared } = wx.worklet

/** 动画时序配置（与格位数无关，按圈数 + 速度控制） */
const ANIMATION_CONFIG = {
  /** 基础轮转圈数 */
  totalRounds: 2,
  /** 初始速度（ms/格） */
  speed: 120,
  /** 减速阶段速度（ms/格） */
  slowDownSpeed: 200,
  /** 倒数第二圈额外延迟（ms） */
  nearEndDelay: 30,
  /** 停留展示时间（ms） */
  stopDelay: 800
}

/** 高亮样式常量（与 .highlighted CSS 类对应） */
const HIGHLIGHT_STYLE = {
  background: 'linear-gradient(145deg, #5B7A5E 0%, #7A9E7E 50%, #B8CDB9 100%)',
  borderWidth: '3rpx',
  borderStyle: 'solid',
  borderColor: '#3D5940',
  boxShadow:
    '0 0 40rpx rgba(91,122,94,0.9), 0 0 80rpx rgba(91,122,94,0.6), 0 15rpx 35rpx rgba(91,122,94,0.4)',
  transform: 'translateY(-8rpx) scale(1.05)'
}

/** 中奖样式常量（与 .winning CSS 类对应） */
const WINNING_STYLE = {
  background: 'linear-gradient(145deg, #C5A572 0%, #D4C4A0 30%, #E5D9C0 70%, #C5A572 100%)',
  borderWidth: '4rpx',
  borderStyle: 'solid',
  borderColor: '#f59e0b',
  boxShadow:
    '0 0 60rpx rgba(197,165,114,1), 0 0 120rpx rgba(197,165,114,0.8), 0 20rpx 40rpx rgba(197,165,114,0.5)',
  transform: 'translateY(-12rpx) scale(1.1)'
}

/** 默认（无高亮）样式 */
const DEFAULT_STYLE = {
  background: 'linear-gradient(145deg, #ffffff 0%, #f8f9ff 50%, #ffffff 100%)',
  borderWidth: '2rpx',
  borderStyle: 'solid',
  borderColor: 'rgba(102, 126, 234, 0.1)',
  boxShadow: '0 8rpx 25rpx rgba(0,0,0,0.1), 0 3rpx 12rpx rgba(0,0,0,0.06)',
  transform: 'translateY(0) scale(1)'
}

/**
 * 网格布局规格表（key = gridCols-cellCount 的派生）：
 * 经典 3×3 把中央按钮嵌在网格中间（环形 8 格）；4 列网格按钮独立放在网格下方（线性格位）。
 */
const GRID_LAYOUT = {
  /** grid_3x3：8 格环形，中央嵌按钮 */
  grid_3x3: { cols: 3, cellCount: 8, centerButton: true },
  /** grid_4x3：12 格线性，按钮在下方 */
  grid_4x3: { cols: 4, cellCount: 12, centerButton: false },
  /** grid_4x4：16 格线性，按钮在下方 */
  grid_4x4: { cols: 4, cellCount: 16, centerButton: false }
} as const

Component({
  behaviors: [prizeImageBehavior],

  properties: {
    /** 奖品列表（已按格位数截取，由父组件传入） */
    prizes: {
      type: Array,
      value: []
    },
    prizesForPreview: { type: Array, value: [] },
    /** 跑马灯启用（父组件预计算，与转盘/砸金蛋一致） */
    previewMarquee: { type: Boolean, value: false },
    /** 跑马灯滚动一圈时长（秒） */
    previewMarqueeSpeed: { type: Number, value: 10 },
    /** 单次抽奖消耗积分 */
    costPoints: {
      type: Number,
      value: 0
    },
    /** 用户当前积分余额 */
    pointsBalance: {
      type: Number,
      value: 0
    },
    /** 是否正在抽奖中 */
    isInProgress: {
      type: Boolean,
      value: false
    },
    /** 中奖奖品在格位中的索引（由父组件根据 API 结果计算，对齐 wheel 驱动模式） */
    targetPrizeIndex: { type: Number, value: -1 },
    /** 特效主题 */
    effectTheme: { type: String, value: 'default' },
    /** 是否启用稀有度光效 */
    rarityEffects: { type: Boolean, value: false },
    /** 中奖动画类型 */
    winAnimation: { type: String, value: 'simple' },
    /** 网格列数（3 或 4），决定布局规格 */
    gridCols: { type: Number, value: 3 },
    /** 展示模式（grid_3x3/grid_4x3/grid_4x4），布局权威来源，优先于 gridCols 推导 */
    displayMode: { type: String, value: '' }
  },

  data: {
    /** 高亮动画是否进行中（仅用于按钮禁用判断） */
    highlightAnimation: false,
    /** 实际格位数（8/12/16，由 gridCols + 奖品数推导） */
    cellCount: 8,
    /** 是否经典九宫格（中央嵌按钮）；false 时按钮独立在网格下方 */
    centerButton: true,
    /** 渲染用格位索引数组（[0..cellCount-1]，供 wx:for 动态生成格位） */
    cellIndexes: [0, 1, 2, 3, 4, 5, 6, 7] as number[]
  },

  observers: {
    /** displayMode/gridCols 或奖品数变化时，重算布局规格并重绑动画样式 */
    'displayMode, gridCols, prizes'() {
      this._resolveLayout()
    },
    /** 监听抽奖开始（对齐 wheel）：父组件设 isInProgress=true 时自动启动轮转 */
    isInProgress(val: boolean) {
      if (val && !this.data.highlightAnimation) {
        const targetIndex = this.properties.targetPrizeIndex as number
        this.startHighlightAnimation(targetIndex)
      }
    }
  },

  lifetimes: {
    attached() {
      /* 创建 worklet shared values，在渲染线程驱动高亮/中奖样式 */
      this._highlightIndex = shared(-1)
      this._winningIndex = shared(-1)
      this._resolveLayout()
    }
  },

  methods: {
    /**
     * 推导布局规格：按 gridCols + 奖品数确定格位数（8/12/16），
     * 生成 cellIndexes 供 WXML 动态渲染，并重绑每格的 worklet 动画样式。
     */
    _resolveLayout() {
      const mode = String(this.properties.displayMode || '')
      const cols = Number(this.properties.gridCols) || 3
      const prizeCount = (this.properties.prizes || []).length

      /**
       * 布局权威来源：优先按后端 display.mode 精确匹配（grid_3x3/grid_4x3/grid_4x4），
       * 缺失时回退按 gridCols + 奖品数推导，避免 grid_3x3 被误判成 4 列布局而出现空格 + 底部按钮。
       */
      let layout: { cols: number; cellCount: number; centerButton: boolean }
      if (mode === 'grid_3x3' || mode === 'grid_4x3' || mode === 'grid_4x4') {
        layout = GRID_LAYOUT[mode]
      } else if (cols >= 4) {
        layout = prizeCount > 12 ? GRID_LAYOUT.grid_4x4 : GRID_LAYOUT.grid_4x3
      } else {
        layout = GRID_LAYOUT.grid_3x3
      }

      /**
       * 实际渲染格位数 = 布局上限与实际奖品数的较小值，
       * 避免奖品不足布局格位（如 4×4 仅 12 个奖品）时渲染出多余空白格。
       */
      const effectiveCellCount = Math.min(layout.cellCount, prizeCount)

      const cellIndexes: number[] = []
      for (let i = 0; i < effectiveCellCount; i++) {
        cellIndexes.push(i)
      }

      this.setData(
        {
          cellCount: effectiveCellCount,
          centerButton: layout.centerButton,
          cellIndexes
        },
        () => {
          this._bindCellAnimatedStyles(effectiveCellCount)
        }
      )
    },

    /**
     * 为每个奖品格位绑定 worklet 动画样式（按实际格位数循环）
     * 通过 applyAnimatedStyle 在渲染线程直接响应 shared value 变化，避免 setData 跨线程通信
     */
    _bindCellAnimatedStyles(cellCount: number) {
      if (!this._highlightIndex || !this._winningIndex) {
        return
      }
      const highlightIdx = this._highlightIndex
      const winningIdx = this._winningIndex

      for (let i = 0; i < cellCount; i++) {
        const cellIndex = i
        this.applyAnimatedStyle(`#prize-cell-${cellIndex}`, () => {
          'worklet'
          if (winningIdx.value === cellIndex) {
            return WINNING_STYLE
          }
          if (highlightIdx.value === cellIndex) {
            return HIGHLIGHT_STYLE
          }
          return DEFAULT_STYLE
        })
      }
    },

    /** 奖品预览项点击 — 触发详情弹窗（冒泡到 lottery-activity 层） */
    onPrizeTap(e: any) {
      const prizeData = e.currentTarget.dataset.prize
      if (prizeData) {
        this.triggerEvent('prizedetail', { prize: prizeData })
      }
    },

    /**
     * 单抽按钮点击
     * 向父组件触发 draw 事件
     */
    onDraw() {
      if (this.data.isInProgress || this.data.highlightAnimation) {
        return
      }
      this.triggerEvent('draw', { count: 1 })
    },

    /**
     * 启动高亮轮转动画（按实际格位数 cellCount 适配，停在中奖格）
     * 由 isInProgress observer 自动调用（对齐 wheel 驱动模式）
     *
     * @param targetIndex - 目标停留索引（0 ~ cellCount-1）
     * @returns Promise - 动画结束后 resolve 并触发 animationEnd
     */
    startHighlightAnimation(targetIndex = 0): Promise<void> {
      const cellCount = this.data.cellCount || 8
      if (targetIndex < 0 || targetIndex >= cellCount) {
        log.error('[grid] 无效的目标索引:', targetIndex, '格位数:', cellCount)
        targetIndex = 0
      }

      return new Promise(resolve => {
        this.setData({ highlightAnimation: true })
        this._winningIndex.value = -1

        let currentIndex = 0
        let rounds = 0
        const { totalRounds, speed, slowDownSpeed, nearEndDelay, stopDelay } = ANIMATION_CONFIG

        const animate = () => {
          /* 直接更新 shared value，渲染线程即时响应，无需 setData */
          this._highlightIndex.value = currentIndex

          const nextIndex = (currentIndex + 1) % cellCount

          /* 完成基础轮数且到达目标位置时停止 */
          if (rounds >= totalRounds && currentIndex === targetIndex) {
            setTimeout(() => {
              this._winningIndex.value = targetIndex
              this._highlightIndex.value = -1
              this.setData({ highlightAnimation: false })
              this.triggerEvent('animationEnd')
              resolve()
            }, stopDelay)
            return
          }

          currentIndex = nextIndex
          if (currentIndex === 0) {
            rounds++
          }

          /* 动态调整速度：最后一圈减速 */
          let currentSpeed = speed
          if (rounds >= totalRounds) {
            currentSpeed = slowDownSpeed
          } else if (rounds >= totalRounds - 1) {
            currentSpeed = speed + nearEndDelay
          }

          setTimeout(animate, currentSpeed)
        }

        animate()
      })
    },

    /**
     * 重置组件状态
     * 由父组件在关闭结果弹窗后调用
     */
    resetState() {
      this._highlightIndex.value = -1
      this._winningIndex.value = -1
      this.setData({ highlightAnimation: false })
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this._highlightIndex.value = -1
      this._winningIndex.value = -1
      this.setData({ highlightAnimation: false })
    },

    /** 网格奖品图片加载失败 — 降级为 emoji 兜底 */
    onGridPrizeImageError(e: WechatMiniprogram.ImageError) {
      const gridIdx = e.currentTarget.dataset.gridIdx
      if (typeof gridIdx === 'number') {
        this.setData({
          [`prizes[${gridIdx}].prize_image_url`]: ''
        })
      }
    }
  }
})
