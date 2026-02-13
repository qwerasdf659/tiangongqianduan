/**
 * 拆红包 子组件 - 点击/滑动拆开红包
 * @file sub/redpacket/redpacket.ts
 */

Component({
  properties: {
    prizes: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' }
  },

  data: {
    /** 状态: sealed / opening / opened */
    packetState: 'sealed',
    /** 开启进度 */
    openProgress: 0
  },

  observers: {
    'isInProgress': function (val: boolean) {
      if (val && this.data.packetState === 'opening') {
        this._openPacket()
      }
    }
  },

  methods: {
    /** 点击红包 */
    onTapPacket() {
      if (this.data.packetState !== 'sealed') return
      this.setData({ packetState: 'opening' })
      this.triggerEvent('draw', { count: 1 })
    },

    /** 拆开红包动画 */
    _openPacket() {
      let progress = 0
      this._openTimer = setInterval(() => {
        progress += 10
        this.setData({ openProgress: progress })
        if (progress >= 100) {
          clearInterval(this._openTimer)
          this._openTimer = null
          this.setData({ packetState: 'opened' })
          setTimeout(() => {
            this.triggerEvent('animationEnd')
          }, 800)
        }
      }, 80)
    },

    /** 重置 */
    resetPacket() {
      if (this._openTimer) {
        clearInterval(this._openTimer)
        this._openTimer = null
      }
      this.setData({ packetState: 'sealed', openProgress: 0 })
    }
  }
})
