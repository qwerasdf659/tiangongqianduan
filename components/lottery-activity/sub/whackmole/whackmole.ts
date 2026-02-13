/**
 * 打地鼠 子组件 - 限时点击地鼠
 * @file sub/whackmole/whackmole.ts
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
    /** 状态: ready / playing / ended */
    gameState: 'ready',
    holes: [false, false, false, false, false, false, false, false, false],
    score: 0,
    timeLeft: 10,
    gameDuration: 10,
    moleInterval: 800
  },

  observers: {
    'displayConfig': function (cfg: any) {
      if (cfg) {
        const duration = Math.floor((cfg.game_duration || 10000) / 1000)
        this.setData({
          gameDuration: duration,
          timeLeft: duration,
          moleInterval: cfg.mole_interval || 800
        })
      }
    }
  },

  methods: {
    onStartGame() {
      if (this.data.gameState !== 'ready') return
      this.setData({ gameState: 'playing', score: 0, timeLeft: this.data.gameDuration })
      this._startMoles()
      this._startTimer()
      this.triggerEvent('draw', { count: 1 })
    },

    _startMoles() {
      this._moleTimer = setInterval(() => {
        const holes = [false, false, false, false, false, false, false, false, false]
        const active = Math.floor(Math.random() * 9)
        holes[active] = true
        this.setData({ holes })
      }, this.data.moleInterval)
    },

    _startTimer() {
      this._gameTimer = setInterval(() => {
        const left = this.data.timeLeft - 1
        if (left <= 0) {
          this._endGame()
          return
        }
        this.setData({ timeLeft: left })
      }, 1000)
    },

    onWhack(e: any) {
      if (this.data.gameState !== 'playing') return
      const idx = e.currentTarget.dataset.index
      if (this.data.holes[idx]) {
        const holes = [...this.data.holes]
        holes[idx] = false
        this.setData({ holes, score: this.data.score + 1 })
      }
    },

    _endGame() {
      clearInterval(this._moleTimer)
      clearInterval(this._gameTimer)
      this._moleTimer = null
      this._gameTimer = null
      this.setData({
        gameState: 'ended',
        timeLeft: 0,
        holes: [false, false, false, false, false, false, false, false, false]
      })
      setTimeout(() => this.triggerEvent('animationEnd'), 500)
    },

    resetGame() {
      if (this._moleTimer) clearInterval(this._moleTimer)
      if (this._gameTimer) clearInterval(this._gameTimer)
      this._moleTimer = null
      this._gameTimer = null
      this.setData({
        gameState: 'ready',
        score: 0,
        timeLeft: this.data.gameDuration,
        holes: [false, false, false, false, false, false, false, false, false]
      })
    }
  }
})
