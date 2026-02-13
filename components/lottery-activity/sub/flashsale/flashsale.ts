/**
 * 限时秒杀 子组件 - 倒计时 + 库存抢购
 * @file sub/flashsale/flashsale.ts
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
    /** idle / grabbing / grabbed */
    state: 'idle' as string,
    stockTotal: 50,
    stockRemaining: 23,
    stockPercent: 46,
    countdown: { hours: '00', minutes: '15', seconds: '00' },
    totalSeconds: 900,
    currentPrize: null as any
  },

  observers: {
    'prizes, displayConfig': function () {
      this._initSale()
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.state === 'grabbing') {
        this._showGrabResult()
      }
    }
  },

  lifetimes: {
    detached() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
      }
    }
  },

  methods: {
    _initSale() {
      const cfg = this.properties.displayConfig as any
      const total = cfg?.stock_total || 50
      const remaining = cfg?.stock_remaining || 23
      const prizes = this.properties.prizes as any[]
      this.setData({
        stockTotal: total,
        stockRemaining: remaining,
        stockPercent: Math.round((remaining / total) * 100),
        currentPrize: prizes[0] || { name: '秒杀奖品', icon: '🎁' },
        state: 'idle'
      })
      this._startCountdown()
    },

    _startCountdown() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
      }
      let seconds = this.data.totalSeconds
      this._countdownTimer = setInterval(() => {
        seconds--
        if (seconds <= 0) {
          clearInterval(this._countdownTimer)
          this._countdownTimer = null
          seconds = 0
        }
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = seconds % 60
        this.setData({
          totalSeconds: seconds,
          countdown: {
            hours: String(h).padStart(2, '0'),
            minutes: String(m).padStart(2, '0'),
            seconds: String(s).padStart(2, '0')
          }
        })
      }, 1000)
    },

    onGrab() {
      if (this.data.state !== 'idle') return
      if (this.data.stockRemaining <= 0) return
      this.setData({ state: 'grabbing' })
      this.triggerEvent('draw', { count: 1 })
    },

    _showGrabResult() {
      const remaining = Math.max(0, this.data.stockRemaining - 1)
      this.setData({
        state: 'grabbed',
        stockRemaining: remaining,
        stockPercent: Math.round((remaining / this.data.stockTotal) * 100)
      })
      setTimeout(() => this.triggerEvent('animationEnd'), 1000)
    },

    resetSale() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
      }
      this._initSale()
    }
  }
})
