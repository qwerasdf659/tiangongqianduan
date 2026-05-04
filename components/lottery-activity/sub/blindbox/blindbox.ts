/**
 * 扭蛋机组件 - 完整扭蛋机交互
 * @file sub/blindbox/blindbox.ts
 * @version 6.0.0 — Skyline Worklet 动画驱动
 */

const { shared, timing, runOnJS } = wx.worklet

/** 扭蛋配色方案 */
const EGG_COLORS = [
  { gradient: 'linear-gradient(135deg, #7A9E7E, #ee5a24)', bandColor: 'rgba(255,255,255,0.4)' },
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

const prizeImageBehavior = require('../../shared/prize-image-behavior')

Component({
  behaviors: [prizeImageBehavior],

  properties: {
    prizes: { type: Array, value: [] },
    prizesForPreview: { type: Array, value: [] },
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
    /** 奖品预览项点击 — 触发详情弹窗（冒泡到 lottery-activity 层） */
    onPrizeTap(e: any) {
      const prizeData = e.currentTarget.dataset.prize
      if (prizeData) {
        this.triggerEvent('prizedetail', { prize: prizeData })
      }
    },

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

    /** 出蛋动画 — Worklet timing 驱动多阶段编排 */
    _dispenseEgg() {
      const idx = Math.floor(Math.random() * this.data.eggs.length)
      const chosen = { ...this.data.eggs[idx] }
      const eggs = this.data.eggs.filter((_: any, i: number) => i !== idx)

      this.setData({
        eggs,
        dispensedEgg: chosen,
        dispensedState: 'dispensing'
      })

      // Worklet timing 驱动掉落阶段（替代 setTimeout 800ms）
      this._dispenseProgress = shared(0)
      this._dispenseProgress.value = timing(1, { duration: 800 }, () => {
        'worklet'
        runOnJS(this._onEggLanded.bind(this))()
      })
    },

    /** 扭蛋落地回调 */
    _onEggLanded() {
      this.setData({
        crankState: 'idle',
        dispensedState: 'landed'
      })
    },

    /** 点击掉出来的蛋 - 打开 — Worklet timing 编排开蛋序列 */
    onTapDispensed() {
      if (this.data.dispensedState !== 'landed') {
        return
      }

      this.setData({
        dispensedState: 'cracking',
        burstParticles: this._generateBurst()
      })

      // Worklet 驱动：cracking → opened（替代 setTimeout 800ms）
      this._crackProgress = shared(0)
      this._crackProgress.value = timing(1, { duration: 800 }, () => {
        'worklet'
        runOnJS(this._onEggOpened.bind(this))()
      })
    },

    /** 扭蛋打开回调 */
    _onEggOpened() {
      this.setData({ dispensedState: 'opened' })
      // Worklet 驱动动画结束通知（替代 setTimeout 600ms）
      this._openDoneProgress = shared(0)
      this._openDoneProgress.value = timing(1, { duration: 600 }, () => {
        'worklet'
        runOnJS(this._onOpenAnimationEnd.bind(this))()
      })
    },

    /** 开蛋动画结束回调 */
    _onOpenAnimationEnd() {
      this.triggerEvent('animationEnd')
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

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetBox()
    },

    _clearTimers() {
      // Worklet 共享变量重置（替代 clearTimeout）
      if (this._dispenseProgress) {
        this._dispenseProgress.value = 0
      }
      if (this._crackProgress) {
        this._crackProgress.value = 0
      }
      if (this._openDoneProgress) {
        this._openDoneProgress.value = 0
      }
    }
  }
})
