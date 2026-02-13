/**
 * 福袋 子组件 - 点击抢福袋+库存倒计时
 * @file sub/luckybag/luckybag.ts
 */

Component({
  properties: {
    prizes: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    displayConfig: { type: Object, value: {} }
  },

  data: {
    /** 状态: idle / grabbing / opened */
    bagState: 'idle',
    /** 库存 */
    stockTotal: 100,
    stockRemaining: 100
  },

  observers: {
    'displayConfig': function (cfg: any) {
      if (cfg) {
        this.setData({
          stockTotal: cfg.stock_total || 100,
          stockRemaining: cfg.stock_remaining || 100
        })
      }
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.bagState === 'grabbing') {
        this._openBag()
      }
    }
  },

  methods: {
    /** 点击抢福袋 */
    onGrabBag() {
      if (this.data.bagState !== 'idle') return
      if (this.data.stockRemaining <= 0) {
        wx.showToast({ title: '福袋已抢完', icon: 'none' })
        return
      }
      this.setData({ bagState: 'grabbing' })
      this.triggerEvent('draw', { count: 1 })
    },

    /** 打开福袋 */
    _openBag() {
      setTimeout(() => {
        this.setData({
          bagState: 'opened',
          stockRemaining: Math.max(0, this.data.stockRemaining - 1)
        })
        setTimeout(() => {
          this.triggerEvent('animationEnd')
        }, 800)
      }, 1000)
    },

    /** 重置 */
    resetBag() {
      this.setData({ bagState: 'idle' })
    }
  }
})
