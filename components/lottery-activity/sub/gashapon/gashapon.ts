/**
 * 扭蛋机 子组件 - 扭动手柄+胶囊掉落
 * @file sub/gashapon/gashapon.ts
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
    /** 状态: idle / turning / dropping / done */
    machineState: 'idle',
    /** 胶囊颜色列表 */
    capsuleColors: ['#FF6B6B', '#4ECDC4', '#FFD93D', '#9775FA'],
    /** 当前掉落胶囊颜色 */
    currentCapsuleColor: '#FF6B6B'
  },

  observers: {
    'displayConfig': function (cfg: any) {
      if (cfg?.capsule_colors?.length) {
        this.setData({ capsuleColors: cfg.capsule_colors })
      }
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.machineState === 'turning') {
        this._dropCapsule()
      }
    }
  },

  methods: {
    /** 点击手柄扭动 */
    onTurnHandle() {
      if (this.data.machineState !== 'idle') return
      const colors = this.data.capsuleColors
      const color = colors[Math.floor(Math.random() * colors.length)]
      this.setData({ machineState: 'turning', currentCapsuleColor: color })
      this.triggerEvent('draw', { count: 1 })
    },

    /** 胶囊掉落动画 */
    _dropCapsule() {
      setTimeout(() => {
        this.setData({ machineState: 'dropping' })
        setTimeout(() => {
          this.setData({ machineState: 'done' })
          this.triggerEvent('animationEnd')
        }, 1200)
      }, 800)
    },

    /** 重置 */
    resetMachine() {
      this.setData({ machineState: 'idle' })
    }
  }
})
