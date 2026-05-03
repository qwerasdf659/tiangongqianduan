/**
 * 扭蛋机 子组件 - 扭动手柄+胶囊掉落（增强版）
 * @file sub/gashapon/gashapon.ts
 * @version 6.0.0 — Skyline Worklet 动画驱动
 *
 * 优化内容：
 * 1. 添加触觉反馈（震动）
 * 2. 增强动画流畅度
 * 3. 添加粒子特效
 * 4. 优化状态管理
 * 5. Worklet 驱动动画状态切换，减少 setData 调用
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('gashapon')
const prizeImageBehavior = require('../../shared/prize-image-behavior')

const { shared, timing, runOnJS } = wx.worklet

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
    /** 状态: idle / turning / dropping / done */
    machineState: 'idle',
    /** 胶囊颜色列表 - 更丰富的配色 */
    capsuleColors: [
      '#FF6B6B', // 红色
      '#4ECDC4', // 青色
      '#FFD93D', // 金色
      '#9775FA', // 紫色
      '#FF8C42', // 橙色
      '#6BCF7F', // 绿色
      '#FF6AC1', // 粉色
      '#5DADE2' // 蓝色
    ],
    /** 当前掉落胶囊颜色 */
    currentCapsuleColor: '#FF6B6B',
    /** 粒子特效数组 - 多层粒子 */
    particles: [] as any[],
    /** 显示庆祝特效 */
    showCelebration: false,
    /** 能量蓄积进度 (0-100) */
    energyProgress: 0,
    /** 显示能量条 */
    showEnergyBar: false,
    /** 能量粒子数组 */
    energyParticles: [] as any[]
  },

  lifetimes: {
    attached() {
      this._initParticles()
      this._initWorklet()
    },
    detached() {
      this._cleanupTimers()
    }
  },

  observers: {
    displayConfig(cfg: any) {
      if (cfg?.capsule_colors?.length) {
        this.setData({ capsuleColors: cfg.capsule_colors })
      }
    },
    isInProgress(val: boolean) {
      if (val && this.data.machineState === 'turning') {
        this._dropCapsule()
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

    /** 初始化粒子特效 - 复古简化版 */
    _initParticles() {
      const particles = []
      const icons = ['⭐', '✨', '💫'] // 简化图标

      // 生成8个粒子（减少数量）
      for (let i = 0; i < 8; i++) {
        particles.push({
          id: i,
          icon: icons[i % icons.length],
          x: Math.random() * 100,
          y: Math.random() * 100,
          delay: Math.random() * 3,
          duration: 10 + Math.random() * 4
        })
      }

      this.setData({ particles })
    },

    /** 点击手柄扭动 - 复古简化版 */
    onTurnHandle() {
      // 防止重复点击
      if (this.data.machineState !== 'idle') {
        log.info('[gashapon] 扭蛋进行中，忽略重复点击')
        return
      }

      // 触觉反馈 - 单次震动
      this._vibrate('medium')

      // 随机选择胶囊颜色
      const colors = this.data.capsuleColors
      const color = colors[Math.floor(Math.random() * colors.length)]

      // 更新状态
      this.setData({
        machineState: 'turning',
        currentCapsuleColor: color
      })

      // 触发抽奖事件
      this.triggerEvent('draw', { count: 1 })
    },

    /** 初始化 Worklet 共享变量与动画样式绑定 */
    _initWorklet() {
      // 手柄旋转角度（Worklet 驱动）
      this._handleRotation = shared(0)
      // 胶囊掉落进度 0→1（Worklet 驱动）
      this._capsuleProgress = shared(0)
      // 庆祝特效透明度（Worklet 驱动）
      this._celebrationOpacity = shared(0)

      // 绑定手柄旋转动画
      this.applyAnimatedStyle('.machine-handle', () => {
        'worklet'
        return {
          transform: `rotate(${this._handleRotation.value}deg)`
        }
      })

      // 绑定胶囊掉落动画
      this.applyAnimatedStyle('.capsule-dropping', () => {
        'worklet'
        const p = this._capsuleProgress.value
        const translateY = -80 + p * 80
        const scale = 0.8 + p * 0.2
        const opacity = Math.min(p * 3, 1)
        return {
          transform: `translateY(${translateY}rpx) scale(${scale})`,
          opacity: `${opacity}`
        }
      })

      // 绑定庆祝特效透明度
      this.applyAnimatedStyle('.celebration-effect', () => {
        'worklet'
        return { opacity: `${this._celebrationOpacity.value}` }
      })
    },

    /** 胶囊掉落动画 — Worklet 驱动 */
    _dropCapsule() {
      const self = this

      // 第一阶段：手柄转动（Worklet timing 驱动旋转）
      this._handleRotation.value = timing(360, { duration: 800 }, () => {
        'worklet'
        // 手柄转完后重置角度
        self._handleRotation.value = 0

        // 通知主线程切换到 dropping 状态
        runOnJS(self._onHandleTurnDone.bind(self))()
      })
    },

    /** 手柄转动完成回调（主线程） */
    _onHandleTurnDone() {
      this.setData({ machineState: 'dropping' })
      this._vibrate('medium')

      // 第二阶段：胶囊掉落动画（Worklet timing）
      this._capsuleProgress.value = 0
      this._capsuleProgress.value = timing(1, { duration: 1500 }, () => {
        'worklet'
        runOnJS(this._onCapsuleLanded.bind(this))()
      })
    },

    /** 胶囊落地回调（主线程） */
    _onCapsuleLanded() {
      this.setData({ machineState: 'done' })
      this._showCelebrationEffect()
      this.triggerEvent('animationEnd')
    },

    /** 显示庆祝特效 — Worklet 驱动淡入淡出 */
    _showCelebrationEffect() {
      this.setData({ showCelebration: true })

      // Worklet 驱动淡入
      this._celebrationOpacity.value = timing(1, { duration: 300 }, () => {
        'worklet'
        // 淡入完成后延迟淡出
        this._celebrationOpacity.value = timing(0, { duration: 500 }, () => {
          'worklet'
          runOnJS(this._onCelebrationDone.bind(this))()
        })
      })
    },

    /** 庆祝特效结束回调 */
    _onCelebrationDone() {
      this.setData({ showCelebration: false })
    },

    /** 触觉反馈封装 */
    _vibrate(type: 'light' | 'medium' | 'heavy') {
      try {
        if (wx.vibrateShort) {
          switch (type) {
            case 'light':
              wx.vibrateShort({ type: 'light' })
              break
            case 'medium':
              wx.vibrateShort({ type: 'medium' })
              break
            case 'heavy':
              wx.vibrateShort({ type: 'heavy' })
              break
          }
        }
      } catch (error) {
        log.warn('[gashapon] 触觉反馈不可用:', error)
      }
    },

    /** 清理定时器和 Worklet 共享变量 */
    _cleanupTimers() {
      // 重置 Worklet 共享变量
      if (this._handleRotation) {
        this._handleRotation.value = 0
      }
      if (this._capsuleProgress) {
        this._capsuleProgress.value = 0
      }
      if (this._celebrationOpacity) {
        this._celebrationOpacity.value = 0
      }
      // 清理遗留的粒子刷新定时器
      if (this._particleRefreshTimer) {
        clearInterval(this._particleRefreshTimer)
        this._particleRefreshTimer = null
      }
    },

    /** 重置扭蛋机状态 */
    resetMachine() {
      this._cleanupTimers()
      // 重置 Worklet 共享变量
      if (this._handleRotation) {
        this._handleRotation.value = 0
      }
      if (this._capsuleProgress) {
        this._capsuleProgress.value = 0
      }
      if (this._celebrationOpacity) {
        this._celebrationOpacity.value = 0
      }
      this.setData({
        machineState: 'idle',
        showCelebration: false
      })
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetMachine()
    }
  }
})
