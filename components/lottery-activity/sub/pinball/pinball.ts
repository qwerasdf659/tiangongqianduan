/**
 * 弹珠机 子组件 - 弹珠掉落动画
 * @file sub/pinball/pinball.ts
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
    /** 状态: ready / dropping / landed */
    ballState: 'ready',
    pathCount: 8,
    slots: [] as any[],
    ballLeft: 50,
    ballTop: 0,
    landedSlot: -1
  },

  observers: {
    'prizes, displayConfig': function () {
      this._initSlots()
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.ballState === 'dropping') {
        this._animateDrop()
      }
    }
  },

  methods: {
    _initSlots() {
      const cfg = this.properties.displayConfig as any
      const count = cfg?.path_count || 8
      const prizes = this.properties.prizes as any[]
      const slots = Array.from({ length: count }, (_, i) => ({
        index: i,
        prize: prizes[i % prizes.length] || { name: '奖品', icon: '🎁' },
        active: false
      }))
      this.setData({ slots, pathCount: count, ballState: 'ready', landedSlot: -1, ballLeft: 50, ballTop: 0 })
    },

    onLaunch() {
      if (this.data.ballState !== 'ready') return
      this.setData({ ballState: 'dropping', ballLeft: 50, ballTop: 0 })
      this.triggerEvent('draw', { count: 1 })
    },

    _animateDrop() {
      const target = Math.floor(Math.random() * this.data.pathCount)
      const targetLeft = (target / (this.data.pathCount - 1)) * 80 + 10
      let step = 0
      const totalSteps = 20

      this._dropTimer = setInterval(() => {
        step++
        const progress = step / totalSteps
        const wobble = Math.sin(progress * Math.PI * 6) * 15 * (1 - progress)
        const currentLeft = 50 + (targetLeft - 50) * progress + wobble
        const currentTop = progress * 100

        this.setData({ ballLeft: currentLeft, ballTop: currentTop })

        if (step >= totalSteps) {
          clearInterval(this._dropTimer)
          this._dropTimer = null
          const slots = this.data.slots.map((s: any, i: number) => ({
            ...s,
            active: i === target
          }))
          this.setData({ slots, landedSlot: target, ballState: 'landed' })
          setTimeout(() => this.triggerEvent('animationEnd'), 800)
        }
      }, 80)
    },

    resetBall() {
      if (this._dropTimer) {
        clearInterval(this._dropTimer)
        this._dropTimer = null
      }
      this._initSlots()
    }
  }
})
