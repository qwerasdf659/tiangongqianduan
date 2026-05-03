/**
 * 扭蛋机 子组件 - 扭动手柄+胶囊掉落（增强版）
 * @file sub/gashapon/gashapon.ts
 * @version 5.2.0
 *
 * 优化内容：
 * 1. 添加触觉反馈（震动）
 * 2. 增强动画流畅度
 * 3. 添加粒子特效
 * 4. 优化状态管理
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('gashapon')
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
      // 组件挂载时初始化
      this._initParticles()
    },
    detached() {
      // 组件卸载时清理定时器
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

    /** 胶囊掉落动画 - 复古简化版 */
    _dropCapsule() {
      // 第一阶段：手柄转动完成，胶囊开始掉落
      this._dropTimer1 = setTimeout(() => {
        this.setData({ machineState: 'dropping' })

        // 掉落时单次震动
        this._vibrate('medium')

        // 第二阶段：胶囊落到出口
        this._dropTimer2 = setTimeout(() => {
          this.setData({ machineState: 'done' })

          // 显示庆祝特效
          this._showCelebrationEffect()

          // 通知父组件动画结束
          this.triggerEvent('animationEnd')
        }, 1500)
      }, 800)
    },

    /** 显示庆祝特效 */
    _showCelebrationEffect() {
      this.setData({ showCelebration: true })

      // 2秒后隐藏特效
      this._celebrationTimer = setTimeout(() => {
        this.setData({ showCelebration: false })
      }, 2000)
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

    /** 清理定时器 */
    _cleanupTimers() {
      if (this._dropTimer1) {
        clearTimeout(this._dropTimer1)
        this._dropTimer1 = null
      }
      if (this._dropTimer2) {
        clearTimeout(this._dropTimer2)
        this._dropTimer2 = null
      }
      if (this._celebrationTimer) {
        clearTimeout(this._celebrationTimer)
        this._celebrationTimer = null
      }
      if (this._particleRefreshTimer) {
        clearInterval(this._particleRefreshTimer)
        this._particleRefreshTimer = null
      }
    },

    /** 重置扭蛋机状态 */
    resetMachine() {
      this._cleanupTimers()
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
