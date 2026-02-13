/**
 * 摇一摇 子组件 - 加速度计检测摇动
 * @file sub/shake/shake.ts
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
    /** 状态: ready / shaking / triggered / done */
    shakeState: 'ready',
    /** 摇动次数 */
    shakeCount: 0,
    /** 需要摇动次数 */
    shakeRequired: 5,
    /** 摇动阈值 */
    shakeThreshold: 15,
    /** 手机图标晃动 */
    phoneShaking: false
  },

  observers: {
    'displayConfig': function (cfg: any) {
      if (cfg) {
        this.setData({
          shakeThreshold: cfg.shake_threshold || 15,
          shakeRequired: cfg.shake_count_required || 5
        })
      }
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.shakeState === 'triggered') {
        this._showResult()
      }
    }
  },

  methods: {
    /** 开始监听摇一摇 */
    onStartShake() {
      if (this.data.shakeState !== 'ready') return
      this.setData({ shakeState: 'shaking', shakeCount: 0 })

      wx.startAccelerometer({
        interval: 'normal',
        success: () => {
          this._lastShakeTime = 0
          wx.onAccelerometerChange((res) => {
            this._onAccChange(res)
          })
        },
        fail: () => {
          /* 加速度计不可用时模拟点击摇动 */
          this._simulateShake()
        }
      })
    },

    /** 加速度变化回调 */
    _onAccChange(res: any) {
      if (this.data.shakeState !== 'shaking') return
      const { x, y, z } = res
      const magnitude = Math.sqrt(x * x + y * y + z * z)
      const now = Date.now()

      if (magnitude > this.data.shakeThreshold / 10 && now - (this._lastShakeTime || 0) > 300) {
        this._lastShakeTime = now
        const count = this.data.shakeCount + 1
        this.setData({ shakeCount: count, phoneShaking: true })

        setTimeout(() => this.setData({ phoneShaking: false }), 200)

        if (count >= this.data.shakeRequired) {
          this._triggerDraw()
        }
      }
    },

    /** 模拟摇动（点击替代） */
    _simulateShake() {
      const count = this.data.shakeCount + 1
      this.setData({ shakeCount: count, phoneShaking: true })
      setTimeout(() => this.setData({ phoneShaking: false }), 200)

      if (count >= this.data.shakeRequired) {
        this._triggerDraw()
      }
    },

    /** 点击模拟摇动 */
    onTapShake() {
      if (this.data.shakeState === 'ready') {
        this.onStartShake()
        return
      }
      if (this.data.shakeState === 'shaking') {
        this._simulateShake()
      }
    },

    /** 触发抽奖 */
    _triggerDraw() {
      wx.stopAccelerometer({})
      this.setData({ shakeState: 'triggered' })
      this.triggerEvent('draw', { count: 1 })
    },

    /** 显示结果 */
    _showResult() {
      this.setData({ shakeState: 'done' })
      setTimeout(() => {
        this.triggerEvent('animationEnd')
      }, 800)
    },

    /** 重置 */
    resetShake() {
      wx.stopAccelerometer({})
      this.setData({ shakeState: 'ready', shakeCount: 0, phoneShaking: false })
    }
  }
})
