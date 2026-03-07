/**
 * 老虎机 子组件 - 经典拉斯维加斯风格
 * @file sub/slotmachine/slotmachine.ts
 *
 * 特性：
 * 1. CSS动画驱动的流畅卷轴滚动（旋转期间零setData开销）
 * 2. 逐轴停止 + 减速回弹效果
 * 3. 触觉反馈（震动）
 * 4. 跑马灯LED装饰灯
 * 5. 中奖庆祝特效 + 金币雨
 * 6. 完善的定时器清理
 */

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
    /** 状态机: idle → pulling → spinning → stopping → result */
    machineState: 'idle' as string,
    reelCount: 3,
    stopDelay: 600,
    /** 卷轴数据数组 */
    reels: [] as any[],
    /** 已停止的卷轴计数 */
    stoppedCount: 0,
    /** 背景粒子 */
    particles: [] as any[],
    /** 是否显示庆祝特效 */
    showCelebration: false
  },

  lifetimes: {
    attached() {
      this._initReels()
      this._initParticles()
    },
    detached() {
      this._cleanupTimers()
    }
  },

  observers: {
    'prizes, displayConfig'() {
      if (this.data.machineState === 'idle') {
        this._initReels()
      }
    },
    isInProgress(val: boolean) {
      if (val && this.data.machineState === 'spinning') {
        this._beginStopSequence()
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

    /** 初始化卷轴 - 三倍复制实现CSS无缝循环 */
    _initReels() {
      const cfg = this.properties.displayConfig as any
      const count = cfg?.reels || 3
      const delay = cfg?.stop_delay || 600
      const prizes = this.properties.prizes as any[]
      if (!prizes.length) {
        return
      }

      const reels = Array.from({ length: count }, (_, i) => {
        const shuffled = [...prizes].sort(() => Math.random() - 0.5)
        const items = [...shuffled, ...shuffled, ...shuffled]
        const spinDuration = Math.max(0.15, prizes.length * 0.04 + i * 0.02)
        return {
          items,
          spinDuration,
          spinning: false,
          stopping: false,
          stopped: false,
          reelIndex: i
        }
      })

      this.setData({ reels, reelCount: count, stopDelay: delay, stoppedCount: 0 })
    },

    /** 初始化背景粒子 */
    _initParticles() {
      const icons = ['*', '+', '$', '7', '#', '%']
      const particles = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        icon: icons[i % icons.length],
        x: Math.random() * 100,
        y: Math.random() * 100,
        delay: Math.random() * 5,
        duration: 8 + Math.random() * 6
      }))
      this.setData({ particles })
    },

    /** 拉动手柄 */
    onPullHandle() {
      if (this.data.machineState !== 'idle') {
        return
      }

      this._vibrate('heavy')
      this.setData({ machineState: 'pulling' })

      // 手柄动画完成后启动卷轴旋转
      this._pullTimer = setTimeout(() => {
        const prizes = this.properties.prizes as any[]
        const reels = this.data.reels.map((r: any, _i: number) => {
          const shuffled = [...prizes].sort(() => Math.random() - 0.5)
          const items = [...shuffled, ...shuffled, ...shuffled]
          return {
            ...r,
            items,
            spinning: true,
            stopping: false,
            stopped: false
          }
        })
        this.setData({ reels, machineState: 'spinning', stoppedCount: 0 })
        this._vibrate('light')

        // 触发父组件抽奖
        this.triggerEvent('draw', { count: 1 })
      }, 500)
    },

    /** 逐轴停止序列 */
    _beginStopSequence() {
      this.setData({ machineState: 'stopping' })
      const { reelCount, stopDelay } = this.data
      const prizes = this.properties.prizes as any[]

      this._stopTimers = []
      for (let i = 0; i < reelCount; i++) {
        this._stopTimers.push(
          setTimeout(
            () => {
              // 将结果奖品放在前3个位置（显示窗口区域）
              const shuffled = [...prizes].sort(() => Math.random() - 0.5)
              const resultItems = shuffled.slice(0, 3)
              const filler = [...prizes, ...prizes]
              const items = [...resultItems, ...filler]

              const reels = [...this.data.reels]
              reels[i] = {
                ...reels[i],
                items,
                spinning: false,
                stopping: true
              }
              const stopped = this.data.stoppedCount + 1
              this.setData({ reels, stoppedCount: stopped })
              this._vibrate('medium')

              // 回弹动画结束后标记为已停止
              const bounceTimer = setTimeout(() => {
                const reelsAfter = [...this.data.reels]
                reelsAfter[i] = { ...reelsAfter[i], stopping: false, stopped: true }
                this.setData({ reels: reelsAfter })
              }, 800)
              this._stopTimers.push(bounceTimer)

              // 全部卷轴停止
              if (stopped >= reelCount) {
                const doneTimer = setTimeout(() => this._onAllStopped(), 1000)
                this._stopTimers.push(doneTimer)
              }
            },
            stopDelay * (i + 1)
          )
        )
      }
    },

    /** 全部停止完成 - 展示结果 */
    _onAllStopped() {
      this.setData({ machineState: 'result' })
      this._vibrate('heavy')
      this._showCelebration()
      this.triggerEvent('animationEnd')
    },

    /** 显示庆祝特效 */
    _showCelebration() {
      this.setData({ showCelebration: true })
      this._celebrationTimer = setTimeout(() => {
        this.setData({ showCelebration: false })
      }, 2500)
    },

    /** 触觉反馈 */
    _vibrate(type: 'light' | 'medium' | 'heavy') {
      try {
        if (wx.vibrateShort) {
          wx.vibrateShort({ type })
        }
      } catch (_e) {
        // 静默处理
      }
    },

    /** 清理所有定时器 */
    _cleanupTimers() {
      if (this._pullTimer) {
        clearTimeout(this._pullTimer)
        this._pullTimer = null
      }
      if (this._stopTimers) {
        this._stopTimers.forEach((t: any) => clearTimeout(t))
        this._stopTimers = null
      }
      if (this._celebrationTimer) {
        clearTimeout(this._celebrationTimer)
        this._celebrationTimer = null
      }
    },

    /** 重置老虎机（供父组件调用） */
    resetMachine() {
      this._cleanupTimers()
      this._initReels()
      this.setData({ machineState: 'idle', showCelebration: false })
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetMachine()
    }
  }
})
