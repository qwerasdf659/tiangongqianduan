/**
 * 老虎机 子组件 - 3列卷轴滚动
 * @file sub/slotmachine/slotmachine.ts
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
    reelCount: 3,
    stopDelay: 500,
    reels: [] as any[],
    spinning: false,
    stoppedCount: 0
  },

  observers: {
    'prizes, displayConfig': function () {
      this._initReels()
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.spinning) {
        this._stopReels()
      }
    }
  },

  methods: {
    _initReels() {
      const cfg = this.properties.displayConfig as any
      const count = cfg?.reels || 3
      const delay = cfg?.stop_delay || 500
      const prizes = this.properties.prizes as any[]
      const reels = Array.from({ length: count }, () => ({
        items: [...prizes].sort(() => Math.random() - 0.5),
        offset: 0,
        stopped: false
      }))
      this.setData({ reels, reelCount: count, stopDelay: delay, stoppedCount: 0 })
    },

    onPullHandle() {
      if (this.data.spinning) return
      this.setData({ spinning: true, stoppedCount: 0 })
      const reels = this.data.reels.map((r: any) => ({ ...r, stopped: false, offset: 0 }))
      this.setData({ reels })
      this._startSpin()
      this.triggerEvent('draw', { count: 1 })
    },

    _startSpin() {
      this._spinTimer = setInterval(() => {
        const reels = this.data.reels.map((r: any) => {
          if (r.stopped) return r
          return { ...r, offset: (r.offset + 1) % r.items.length }
        })
        this.setData({ reels })
      }, 100)
    },

    _stopReels() {
      const { reelCount, stopDelay } = this.data
      for (let i = 0; i < reelCount; i++) {
        setTimeout(() => {
          const reels = [...this.data.reels]
          reels[i] = { ...reels[i], stopped: true }
          const stopped = this.data.stoppedCount + 1
          this.setData({ reels, stoppedCount: stopped })

          if (stopped >= reelCount) {
            clearInterval(this._spinTimer)
            this._spinTimer = null
            this.setData({ spinning: false })
            setTimeout(() => this.triggerEvent('animationEnd'), 500)
          }
        }, stopDelay * (i + 1))
      }
    },

    resetMachine() {
      if (this._spinTimer) {
        clearInterval(this._spinTimer)
        this._spinTimer = null
      }
      this._initReels()
      this.setData({ spinning: false })
    }
  }
})
