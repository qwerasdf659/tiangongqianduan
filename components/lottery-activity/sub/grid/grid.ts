/**
 * 九宫格抽奖 子组件
 *
 * @description 从 lottery.wxml/ts 提取的3x3九宫格抽奖组件，
 *   包含8个奖品格子 + 中央抽奖按钮，支持高亮轮转动画和中奖停留效果。
 *   布局顺序: [0][1][2] / [7][BTN][3] / [6][5][4]
 *
 * @file sub/grid/grid.ts
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('grid')
const prizeImageBehavior = require('../../shared/prize-image-behavior')

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
    /** 当前高亮的格子索引（-1表示无高亮） */
    currentHighlight: -1 as number,
    /** 中奖格子索引（-1表示无中奖） */
    winningIndex: -1 as number,
    /** 高亮动画是否进行中 */
    highlightAnimation: false
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
     *
     * @param targetIndex - 目标停留索引（0-7）
     * @returns Promise - 动画结束后 resolve
     */
    startHighlightAnimation(targetIndex = 0): Promise<void> {
      /* 验证目标索引有效性 */
      if (targetIndex < 0 || targetIndex >= ANIMATION_CONFIG.gridSize) {
        log.error('无效的目标索引:', targetIndex)
        targetIndex = 0
      }

      return new Promise(resolve => {
        this.setData({ highlightAnimation: true, winningIndex: -1 })

        let currentIndex = 0
        let rounds = 0
        const { totalRounds, speed, slowDownSpeed, nearEndDelay, stopDelay, gridSize } =
          ANIMATION_CONFIG

        const animate = () => {
          this.setData({ currentHighlight: currentIndex })

          const nextIndex = (currentIndex + 1) % gridSize

          /* 完成基础轮数且到达目标位置时停止 */
          if (rounds >= totalRounds && currentIndex === targetIndex) {
            setTimeout(() => {
              this.setData({
                highlightAnimation: false,
                currentHighlight: targetIndex,
                winningIndex: targetIndex
              })
              resolve()
            }, stopDelay)
            return
          }

          /* 更新索引和轮数 */
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
      this.setData({
        currentHighlight: -1,
        winningIndex: -1,
        highlightAnimation: false
      })
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.setData({ currentHighlight: -1 })
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
