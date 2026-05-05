/**
 * 九宫格抽奖 子组件
 *
 * @description 从 lottery.wxml/ts 提取的3x3九宫格抽奖组件，
 *   包含8个奖品格子 + 中央抽奖按钮，支持高亮轮转动画和中奖停留效果。
 *   布局顺序: [0][1][2] / [7][BTN][3] / [6][5][4]
 *   动画驱动: Skyline Worklet shared values，避免高频 setData
 *
 * @file sub/grid/grid.ts
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('grid')
const prizeImageBehavior = require('../../shared/prize-image-behavior')

const { shared } = wx.worklet

/** 动画配置常量 */
const ANIMATION_CONFIG = {
  /** 基础轮转圈数 */
  totalRounds: 2,
  /** 初始速度（ms） */
  speed: 120,
  /** 减速阶段速度（ms） */
  slowDownSpeed: 200,
  /** 倒数第二圈额外延迟（ms） */
  nearEndDelay: 30,
  /** 停留展示时间（ms） */
  stopDelay: 800,
  /** 格子总数（不含中央按钮） */
  gridSize: 8
}

/**
 * 高亮样式常量（与 .highlighted CSS 类对应）
 * 通过 worklet applyAnimatedStyle 在渲染线程直接应用，避免 setData 跨线程通信
 */
const HIGHLIGHT_STYLE = {
  background: 'linear-gradient(145deg, #5B7A5E 0%, #7A9E7E 50%, #B8CDB9 100%)',
  borderWidth: '3rpx',
  borderStyle: 'solid',
  borderColor: '#3D5940',
  boxShadow:
    '0 0 40rpx rgba(91,122,94,0.9), 0 0 80rpx rgba(91,122,94,0.6), 0 15rpx 35rpx rgba(91,122,94,0.4)',
  transform: 'translateY(-8rpx) scale(1.05)'
}

/**
 * 中奖样式常量（与 .winning CSS 类对应）
 */
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

Component({
  behaviors: [prizeImageBehavior],

  properties: {
    /** 奖品列表（8个，由父组件传入） */
    prizes: {
      type: Array,
      value: []
    },
    prizesForPreview: { type: Array, value: [] },
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
    /** 特效主题 */
    effectTheme: { type: String, value: 'default' },
    /** 是否启用稀有度光效 */
    rarityEffects: { type: Boolean, value: false },
    /** 中奖动画类型 */
    winAnimation: { type: String, value: 'simple' },
    /** 网格列数（3或4） */
    gridCols: { type: Number, value: 3 }
  },

  data: {
    /** 高亮动画是否进行中（仅用于按钮禁用判断） */
    highlightAnimation: false
  },

  lifetimes: {
    attached() {
      /* 创建 worklet shared values，在渲染线程驱动高亮/中奖样式 */
      this._highlightIndex = shared(-1)
      this._winningIndex = shared(-1)
      this._bindCellAnimatedStyles()
    }
  },

  methods: {
    /**
     * 为每个奖品格子绑定 worklet 动画样式
     * 通过 applyAnimatedStyle 在渲染线程直接响应 shared value 变化，
     * 避免 setData 跨线程通信开销
     */
    _bindCellAnimatedStyles() {
      const highlightIdx = this._highlightIndex
      const winningIdx = this._winningIndex

      for (let i = 0; i < ANIMATION_CONFIG.gridSize; i++) {
        this.applyAnimatedStyle(`#prize-cell-${i}`, () => {
          'worklet'
          if (winningIdx.value === i) {
            return WINNING_STYLE
          }
          if (highlightIdx.value === i) {
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
     * 启动高亮轮转动画
     * 由父组件在获取到抽奖结果后调用
     * 使用 worklet shared value 驱动高亮，setTimeout 仅控制离散步进时序
     *
     * @param targetIndex - 目标停留索引（0-7）
     * @returns Promise - 动画结束后 resolve
     */
    startHighlightAnimation(targetIndex = 0): Promise<void> {
      if (targetIndex < 0 || targetIndex >= ANIMATION_CONFIG.gridSize) {
        log.error('无效的目标索引:', targetIndex)
        targetIndex = 0
      }

      return new Promise(resolve => {
        this.setData({ highlightAnimation: true })
        this._winningIndex.value = -1

        let currentIndex = 0
        let rounds = 0
        const { totalRounds, speed, slowDownSpeed, nearEndDelay, stopDelay, gridSize } =
          ANIMATION_CONFIG

        const animate = () => {
          /* 直接更新 shared value，渲染线程即时响应，无需 setData */
          this._highlightIndex.value = currentIndex

          const nextIndex = (currentIndex + 1) % gridSize

          /* 完成基础轮数且到达目标位置时停止 */
          if (rounds >= totalRounds && currentIndex === targetIndex) {
            setTimeout(() => {
              this._winningIndex.value = targetIndex
              this._highlightIndex.value = -1
              this.setData({ highlightAnimation: false })
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
    },

    /** 九宫格奖品图片加载失败 — 降级为 emoji 兜底 */
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
