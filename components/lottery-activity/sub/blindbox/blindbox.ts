/**
 * 虚拟盲盒 子组件 - 晃动+开盒动画
 * @file sub/blindbox/blindbox.ts
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
    /** 盲盒状态: idle / shaking / opening / opened */
    boxState: 'idle',
    /** 晃动次数 */
    shakeCount: 0,
    /** 盒子样式（cube/round） */
    boxStyle: 'cube'
  },

  observers: {
    'displayConfig': function (cfg: any) {
      if (cfg?.box_style) {
        this.setData({ boxStyle: cfg.box_style })
      }
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.boxState === 'shaking') {
        this._openBox()
      }
    }
  },

  methods: {
    /** 点击盲盒 - 开始晃动 */
    onTapBox() {
      const { boxState } = this.data
      if (boxState === 'opening' || boxState === 'opened') return

      if (boxState === 'idle') {
        this.setData({ boxState: 'shaking', shakeCount: 0 })
        this._shakeSequence()
        return
      }
    },

    /** 晃动序列 */
    _shakeSequence() {
      const shakeNeeded = this.properties.displayConfig?.shake_before_open ? 3 : 1
      let count = 0
      this._shakeTimer = setInterval(() => {
        count++
        this.setData({ shakeCount: count })
        if (count >= shakeNeeded) {
          clearInterval(this._shakeTimer)
          this._shakeTimer = null
          /* 晃动完成，触发抽奖 */
          this.triggerEvent('draw', { count: 1 })
        }
      }, 500)
    },

    /** 开盒动画 */
    _openBox() {
      this.setData({ boxState: 'opening' })

      setTimeout(() => {
        this.setData({ boxState: 'opened' })
        setTimeout(() => {
          this.triggerEvent('animationEnd')
        }, 800)
      }, 1000)
    },

    /** 重置盲盒 */
    resetBox() {
      if (this._shakeTimer) {
        clearInterval(this._shakeTimer)
        this._shakeTimer = null
      }
      this.setData({ boxState: 'idle', shakeCount: 0 })
    }
  }
})
