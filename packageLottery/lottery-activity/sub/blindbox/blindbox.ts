/**
 * 虚拟盲盒组件 - 神秘礼盒开箱交互
 * @file sub/blindbox/blindbox.ts
 * @version 7.0.0 — 与扭蛋机(gashapon)区分，重做为真正的盲盒外观
 *
 * 业务语义：虚拟盲盒（blind_box 模式），用户点击神秘礼盒 → 礼盒抖动蓄力 →
 *           盒盖弹开 + 光束迸发 → 揭晓奖品。区别于扭蛋机的"转手柄出蛋"交互。
 *
 * 交互状态机：idle（待开）→ shaking（抖动蓄力）→ opening（开盖）→ opened（揭晓）
 */

const { shared, timing, runOnJS } = wx.worklet

/** 生成漂浮装饰星点（盲盒四周的微光氛围） */
function generateParticles(): any[] {
  const particles: any[] = []
  for (let i = 0; i < 8; i++) {
    particles.push({
      id: i,
      left: Math.floor(Math.random() * 90) + 5,
      delay: (Math.random() * 4).toFixed(1),
      duration: (3 + Math.random() * 3).toFixed(1),
      size: Math.floor(18 + Math.random() * 18)
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
    previewMarquee: { type: Boolean, value: false },
    previewMarqueeSpeed: { type: Number, value: 10 },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    displayConfig: { type: Object, value: {} }
  },

  data: {
    particles: [] as any[],
    /** idle / shaking / opening / opened */
    boxState: 'idle' as string,
    /** 揭晓奖品（开箱完成后冒泡由父层弹窗，本组件仅做视觉） */
    burstParticles: [] as any[]
  },

  lifetimes: {
    attached() {
      this.setData({ particles: generateParticles() })
    },
    detached() {
      this._clearTimers()
    }
  },

  observers: {
    isInProgress(val: boolean) {
      if (val && this.data.boxState === 'shaking') {
        this._openBox()
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

    /** 点击盲盒开箱 */
    onOpenBox() {
      if (this.data.boxState !== 'idle') {
        return
      }
      this.setData({ boxState: 'shaking' })
      this.triggerEvent('draw', { count: 1 })
    },

    /** 开盖动画 — Worklet timing 驱动多阶段编排 */
    _openBox() {
      this.setData({
        boxState: 'opening',
        burstParticles: this._generateBurst()
      })

      this._openProgress = shared(0)
      this._openProgress.value = timing(1, { duration: 700 }, () => {
        'worklet'
        runOnJS(this._onBoxOpened.bind(this))()
      })
    },

    /** 开盖完成回调 */
    _onBoxOpened() {
      this.setData({ boxState: 'opened' })
      this._openDoneProgress = shared(0)
      this._openDoneProgress.value = timing(1, { duration: 600 }, () => {
        'worklet'
        runOnJS(this._onOpenAnimationEnd.bind(this))()
      })
    },

    /** 开箱动画结束，通知父层揭晓奖品 */
    _onOpenAnimationEnd() {
      this.triggerEvent('animationEnd')
    },

    /** 生成开箱迸发粒子（环形向外飞散） */
    _generateBurst(): any[] {
      const items = []
      const emojis = [
        '/assets/icons/particles/sparkle-1.svg',
        '/assets/icons/particles/star-1.svg',
        '/assets/icons/particles/sparkle-2.svg',
        '/assets/icons/particles/star-2.svg',
        '/assets/icons/particles/confetti.svg',
        '/assets/icons/particles/ribbon.svg'
      ]
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

    /** 统一重置接口（父组件调用） */
    reset() {
      this._clearTimers()
      this.setData({
        boxState: 'idle',
        burstParticles: []
      })
    },

    _clearTimers() {
      if (this._openProgress) {
        this._openProgress.value = 0
      }
      if (this._openDoneProgress) {
        this._openDoneProgress.value = 0
      }
    }
  }
})
