/**
 * 抽奖结果弹窗 共享组件
 *
 * @description 从 lottery.wxml 提取的结果弹窗，支持单抽中奖、
 *   多连抽逐个揭晓、错误状态三种展示模式。
 *   业务规则：每次抽奖100%中奖（所有 reward_tier 均为中奖），不存在"未中奖"概念。
 *
 * @file shared/result-modal/result-modal.ts
 */

/**
 * 卡牌翻转动画延迟常量（毫秒）
 * 弹窗出现后延迟触发翻转，给用户看到卡牌背面的时间
 */
const CARD_FLIP_DELAY = 800

Component({
  properties: {
    /** 是否显示弹窗 */
    visible: {
      type: Boolean,
      value: false
    },
    /** 抽奖结果数据（由父组件传入） */
    drawResult: {
      type: Object,
      value: null
    },
    /** 中奖动画类型：simple / card_flip / fireworks（由父组件从display.win_animation传入） */
    winAnimation: {
      type: String,
      value: 'simple'
    },
    /** 是否启用稀有度光效 */
    rarityEffects: {
      type: Boolean,
      value: false
    }
  },

  data: {
    /** 多连抽当前揭晓索引 */
    multiDrawCurrentIndex: 0,
    /** 多连抽揭晓动画进行中 */
    multiDrawRevealing: false,

    /** 卡牌翻转状态：false=背面，true=正面 */
    cardFlipped: false,
    /** 卡牌入场动画完成（scale 0→1） */
    cardEntered: false
  },

  observers: {
    /* 弹窗显示时重置揭晓状态，并根据winAnimation启动对应动画 */
    visible(val: boolean) {
      if (val) {
        this.setData({
          multiDrawCurrentIndex: 0,
          multiDrawRevealing: false,
          cardFlipped: false,
          cardEntered: false
        })

        /* card_flip模式：延迟触发卡牌入场和翻转 */
        if (this.properties.winAnimation === 'card_flip') {
          this._startCardFlipSequence()
        }
      }
    }
  },

  methods: {
    /**
     * 卡牌翻转动画序列（任务9核心逻辑）
     * 第1步：卡牌入场（scale 0→1），展示背面花纹
     * 第2步：延迟后自动翻转（rotateY 0°→180°），揭晓正面奖品
     */
    _startCardFlipSequence() {
      /* 第1步：100ms后卡牌入场 */
      setTimeout(() => {
        this.setData({ cardEntered: true })
      }, 100)

      /* 第2步：入场完成后延迟翻转 */
      setTimeout(() => {
        this.setData({ cardFlipped: true })
      }, CARD_FLIP_DELAY)
    },

    /**
     * 用户手动点击卡牌触发翻转（未自动翻转时可手动触发）
     */
    onCardTap() {
      if (this.data.cardFlipped || !this.data.cardEntered) {
        return
      }
      this.setData({ cardFlipped: true })
    },

    /**
     * 揭晓下一个奖品（多连抽逐个揭晓）
     * 播放缩放动画后切换到下一个奖品
     */
    revealNextPrize() {
      const { multiDrawCurrentIndex, drawResult } = this.data as any
      if (!drawResult || !drawResult.prizes) {
        return
      }

      const nextIndex = multiDrawCurrentIndex + 1
      if (nextIndex >= drawResult.prizes.length) {
        return
      }

      /* card_flip模式：先重置翻转状态，再切换奖品后重新翻转 */
      if (this.properties.winAnimation === 'card_flip') {
        this.setData(
          {
            multiDrawRevealing: true,
            cardFlipped: false,
            cardEntered: false
          },
          () => {
            setTimeout(() => {
              this.setData({
                multiDrawCurrentIndex: nextIndex,
                multiDrawRevealing: false
              })
              /* 新卡牌入场+翻转 */
              this._startCardFlipSequence()
            }, 400)
          }
        )
        return
      }

      /* simple模式：原有缩放切换逻辑 */
      this.setData({ multiDrawRevealing: true }, () => {
        setTimeout(() => {
          this.setData({
            multiDrawCurrentIndex: nextIndex,
            multiDrawRevealing: false
          })
        }, 400)
      })
    },

    /**
     * 切换查看已揭晓的奖品
     * 只能查看已揭晓的（index <= multiDrawCurrentIndex）
     */
    switchToRevealedPrize(e: WechatMiniprogram.TouchEvent) {
      const index = Number(e.currentTarget.dataset.index)
      if (index > this.data.multiDrawCurrentIndex) {
        return
      }
      this.setData({
        multiDrawCurrentIndex: index,
        /* 已揭晓的奖品直接显示正面 */
        cardFlipped: true,
        cardEntered: true
      })
    },

    /** 中奖结果图片加载失败 — 降级为 emoji 兜底 */
    onResultImageError() {
      const localDrawResult = this.data.drawResult
      if (localDrawResult && localDrawResult.prize) {
        this.setData({
          'drawResult.prize.prize_image_url': ''
        })
      }
    },

    /** 多连抽揭晓区图片加载失败 */
    onMultiResultImageError(e: WechatMiniprogram.ImageError) {
      const revealIdx = e.currentTarget.dataset.revealIdx
      if (typeof revealIdx === 'number') {
        this.setData({
          [`drawResult.prizes[${revealIdx}].prize_image_url`]: ''
        })
      }
    },

    /**
     * 关闭弹窗
     * 重置内部状态并通知父组件
     */
    onClose() {
      this.setData({
        multiDrawCurrentIndex: 0,
        multiDrawRevealing: false,
        cardFlipped: false,
        cardEntered: false
      })
      this.triggerEvent('close')
    }
  }
})
