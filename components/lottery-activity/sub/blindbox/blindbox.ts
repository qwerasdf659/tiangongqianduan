/**
 * 扭蛋机组件 - 完整扭蛋机交互
 * @file sub/blindbox/blindbox.ts
 */

/** 扭蛋配色方案 */
const EGG_COLORS = [
  { gradient: 'linear-gradient(135deg, #ff6b6b, #ee5a24)', bandColor: 'rgba(255,255,255,0.4)' },
  { gradient: 'linear-gradient(135deg, #ffd93d, #f0932b)', bandColor: 'rgba(255,255,255,0.4)' },
  { gradient: 'linear-gradient(135deg, #6c5ce7, #a29bfe)', bandColor: 'rgba(255,255,255,0.35)' },
  { gradient: 'linear-gradient(135deg, #00cec9, #81ecec)', bandColor: 'rgba(255,255,255,0.4)' },
  { gradient: 'linear-gradient(135deg, #fd79a8, #e84393)', bandColor: 'rgba(255,255,255,0.35)' },
  { gradient: 'linear-gradient(135deg, #55efc4, #00b894)', bandColor: 'rgba(255,255,255,0.4)' },
  { gradient: 'linear-gradient(135deg, #74b9ff, #0984e3)', bandColor: 'rgba(255,255,255,0.35)' },
  { gradient: 'linear-gradient(135deg, #fdcb6e, #e17055)', bandColor: 'rgba(255,255,255,0.4)' }
]

/** 生成扭蛋机内的扭蛋堆 */
function generateEggs(count: number): any[] {
  const eggs: any[] = []
  for (let i = 0; i < count; i++) {
    const colorSet = EGG_COLORS[i % EGG_COLORS.length]
    const size = 52 + Math.floor(Math.random() * 20)
    eggs.push({
      id: i,
      ...colorSet,
      x: 8 + Math.floor(Math.random() * 68),
      y: 8 + Math.floor(Math.random() * 70),
      z: Math.floor(Math.random() * 10),
      size,
      wobbleDelay: (Math.random() * 3).toFixed(1),
      dropping: false,
      selected: false
    })
  }
  return eggs
}

/** 生成浮动装饰粒子 */
function generateParticles(): any[] {
  const icons = ['✨', '⭐', '🎁', '🎀', '💫', '🌟']
  const particles: any[] = []
  for (let i = 0; i < 8; i++) {
    particles.push({
      id: i,
      icon: icons[i % icons.length],
      left: Math.floor(Math.random() * 90) + 5,
      delay: (Math.random() * 4).toFixed(1),
      duration: (3 + Math.random() * 3).toFixed(1),
      size: Math.floor(20 + Math.random() * 20)
    })
  }
  return particles
}

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
    eggs: [] as any[],
    particles: [] as any[],
    /** idle / cranking */
    crankState: 'idle' as string,
    /** null / dispensing / landed / cracking / opened */
    dispensedState: '' as string,
    dispensedEgg: null as any,
    burstParticles: [] as any[],
    showScrollHint: true
  },

  lifetimes: {
    attached() {
      this.setData({
        eggs: generateEggs(15),
        particles: generateParticles()
      })
    },
    detached() {
      this._clearTimers()
    }
  },

  observers: {
    isInProgress(val: boolean) {
      if (val && this.data.crankState === 'cranking') {
        this._dispenseEgg()
      }
    }
  },

  methods: {
    /** 转动手柄 */
    onCrank() {
      if (this.data.crankState !== 'idle') {
        return
      }
      if (this.data.dispensedState === 'landed' || this.data.dispensedState === 'opened') {
        return
      }

      this.setData({ crankState: 'cranking' })

      // 扭蛋机内蛋晃动
      this._shakeEggs()

      // 触发抽奖
      this.triggerEvent('draw', { count: 1 })
    },

    /** 让蛋堆晃动 */
    _shakeEggs() {
      const eggs = this.data.eggs.map((egg: any) => ({
        ...egg,
        x: 8 + Math.floor(Math.random() * 68),
        y: 8 + Math.floor(Math.random() * 70)
      }))
      this.setData({ eggs })
    },

    /** 出蛋动画 */
    _dispenseEgg() {
      // 随机选一个蛋掉出来
      const idx = Math.floor(Math.random() * this.data.eggs.length)
      const chosen = { ...this.data.eggs[idx] }

      // 从蛋堆中移除
      const eggs = this.data.eggs.filter((_: any, i: number) => i !== idx)

      this.setData({
        eggs,
        dispensedEgg: chosen,
        dispensedState: 'dispensing'
      })

      // 蛋落到出口
      this._dispenseTimer1 = setTimeout(() => {
        this.setData({
          crankState: 'idle',
          dispensedState: 'landed'
        })
      }, 800)
    },

    /** 点击掉出来的蛋 - 打开 */
    onTapDispensed() {
      if (this.data.dispensedState !== 'landed') {
        return
      }

      this.setData({
        dispensedState: 'cracking',
        burstParticles: this._generateBurst()
      })

      this._openTimer1 = setTimeout(() => {
        this.setData({ dispensedState: 'opened' })
        this._openTimer2 = setTimeout(() => {
          this.triggerEvent('animationEnd')
        }, 600)
      }, 800)
    },

    /** 生成爆炸粒子 */
    _generateBurst(): any[] {
      const items = []
      const emojis = ['✨', '⭐', '💫', '🌟', '🎉', '🎊']
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * 360
        const distance = 80 + Math.random() * 60
        const rad = (angle * Math.PI) / 180
        items.push({
          id: i,
          emoji: emojis[i % emojis.length],
          x: Math.cos(rad) * distance,
          y: Math.sin(rad) * distance,
          delay: (Math.random() * 0.2).toFixed(2),
          scale: (0.6 + Math.random() * 0.8).toFixed(1)
        })
      }
      return items
    },

    onPrizesScroll() {
      if (this.data.showScrollHint) {
        this.setData({ showScrollHint: false })
      }
    },

    /** 重置（供父组件调用） */
    resetBox() {
      this._clearTimers()
      this.setData({
        eggs: generateEggs(15),
        crankState: 'idle',
        dispensedState: '',
        dispensedEgg: null,
        burstParticles: []
      })
    },

    _clearTimers() {
      if (this._dispenseTimer1) {
        clearTimeout(this._dispenseTimer1)
        this._dispenseTimer1 = null
      }
      if (this._openTimer1) {
        clearTimeout(this._openTimer1)
        this._openTimer1 = null
      }
      if (this._openTimer2) {
        clearTimeout(this._openTimer2)
        this._openTimer2 = null
      }
    }
  }
})

export {}
