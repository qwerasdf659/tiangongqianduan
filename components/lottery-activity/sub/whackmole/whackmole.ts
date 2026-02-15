/**
 * 打地鼠 子组件 - 趣味性全面增强版
 * @file sub/whackmole/whackmole.ts
 * @version 5.0.0
 *
 * 核心流程（先扣积分）：
 *   1. 用户点"开始游戏" → 调用抽奖接口扣积分 → 后端返回奖品数据
 *   2. 前端缓存奖品数据（不展示）
 *   3. 开始打地鼠游戏（10秒基础 + 连锤加时）
 *   4. 游戏结束 → 播放结算动画 → 揭晓奖品
 *
 * 趣味性增强：
 *   1. 🎨 特殊地鼠类型：
 *      - 金色地鼠：全屏特效 + 连击不断
 *      - 炸弹地鼠：-3秒 + 断连击
 *      - 彩虹地鼠：触发狂欢模式（3秒减速）
 *   2. 🔥 Combo系统：
 *      - 连击飘字 x2、x3...
 *      - 锤子外观变化（普通→火焰→雷电）
 *   3. 📈 节奏变化：
 *      - 前8秒：慢速单洞
 *      - 8-15秒：加速双洞
 *      - 15秒后：高速3洞 + 特殊地鼠
 *   4. 📊 结算表演：
 *      - 总命中数、最高连击、命中率
 *      - 趣味评价（地鼠克星/手速一般/下次加油）
 *   5. ⚠️ Miss惩罚：
 *      - 点空地 -1秒
 *      - 灰尘动画提示
 */

const { Logger } = require('../../../../utils/index')
const log = Logger.createLogger('whackmole')

Component({
  properties: {
    prizes: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    displayConfig: { type: Object, value: {} },
    /** 连锤次数（由父组件 draw-buttons 设置，1=单锤，3/5/10=连锤加时） */
    drawCount: { type: Number, value: 1 }
  },

  data: {
    /** 状态: ready / playing / carnival / ended */
    gameState: 'ready' as string,
    /** 每次连锤额外加时（秒） */
    bonusTimePerCount: 5,
    /** 当前局实际游戏时长（含加时） */
    actualDuration: 10,
    /** 9个洞的状态: false=空, 'normal'=普通鼠, 'golden'=金色鼠, 'bomb'=炸弹鼠, 'rainbow'=彩虹鼠 */
    holes: [false, false, false, false, false, false, false, false, false] as any[],
    /** 被锤击的洞索引（用于播放锤击动画） */
    whackedHoles: [false, false, false, false, false, false, false, false, false] as boolean[],
    /** 得分 */
    score: 0,
    /** 剩余时间（秒） */
    timeLeft: 10,
    /** 时间进度百分比 */
    timePercent: 100,
    /** 游戏总时长（秒） */
    gameDuration: 10,
    /** 基础游戏时长（秒） */
    baseGameDuration: 10,
    /** 地鼠出现间隔（ms） */
    moleInterval: 800,
    /** 地鼠停留时间（ms） */
    moleStayTime: 1200,
    /** 连击计数 */
    comboCount: 0,
    /** 是否显示combo提示 */
    showCombo: false,
    /** 最大同时出现地鼠数 */
    maxActiveMoles: 1,
    /** 粒子特效数组 */
    particles: [] as any[],
    /** 显示庆祝特效 */
    showCelebration: false,
    /** 锤子位置（跟随最后点击） */
    hammerX: 0,
    hammerY: 0,
    /** 是否显示锤子动画 */
    showHammer: false,
    /** 锤子类型: normal / fire / thunder */
    hammerType: 'normal' as string,
    /** 地鼠警觉索引（即将消失前显示警告） */
    moleAlertIndex: -1,
    /** 最高连击数 */
    maxCombo: 0,
    /** 总击中次数 */
    totalHits: 0,
    /** 总点击次数 */
    totalClicks: 0,
    /** Miss 次数 */
    missCount: 0,
    /** 命中率 */
    hitRate: 0,
    /** 狂欢模式倒计时 */
    carnivalTimeLeft: 0,
    /** 是否在狂欢模式 */
    isCarnival: false,
    /** 已消耗的秒数（用于节奏控制） */
    elapsedTime: 0,
    /** 趣味评价 */
    funnyComment: '',
    /** 缓存的奖品数据 */
    cachedPrizeData: null as any,
    /** 是否显示Miss动画 */
    showMissEffect: false,
    /** Miss动画位置 */
    missEffectX: 0,
    missEffectY: 0
  },

  lifetimes: {
    attached() {
      this._initParticles()
    },
    detached() {
      this._cleanupAllTimers()
    }
  },

  observers: {
    displayConfig(cfg: any) {
      if (cfg) {
        const duration = Math.floor((cfg.game_duration || 10000) / 1000)
        this.setData({
          gameDuration: duration,
          timeLeft: duration,
          moleInterval: cfg.mole_interval || 800,
          moleStayTime: cfg.mole_stay_time || 1200
        })
      }
    }
  },

  methods: {
    /** 初始化背景粒子 */
    _initParticles() {
      const particles = []
      const icons = ['🌿', '🍃', '☘️', '🌱', '✨']
      for (let i = 0; i < 10; i++) {
        particles.push({
          id: i,
          icon: icons[i % icons.length],
          x: Math.random() * 100,
          y: Math.random() * 100,
          delay: Math.random() * 4,
          duration: 8 + Math.random() * 6
        })
      }
      this.setData({ particles })
    },

    /** 开始游戏 - 先扣积分流程 */
    onStartGame() {
      if (this.data.gameState !== 'ready') {
        return
      }

      this._vibrate('medium')

      // 通知父组件触发抽奖（先扣积分）
      this.triggerEvent('draw', { count: 1 })

      // 父组件会在抽奖成功后调用 startGameWithPrize 方法
    },

    /**
     * 开始游戏（由父组件调用，传入奖品数据）
     * @param prizeData 后端返回的奖品数据
     */
    startGameWithPrize(prizeData: any) {
      log.info('[打地鼠] 缓存奖品数据，开始游戏', prizeData)

      const baseDuration = this.data.baseGameDuration

      this.setData({
        gameState: 'playing',
        score: 0,
        comboCount: 0,
        showCombo: false,
        timeLeft: baseDuration,
        timePercent: 100,
        gameDuration: baseDuration,
        maxActiveMoles: 1,
        maxCombo: 0,
        totalHits: 0,
        totalClicks: 0,
        missCount: 0,
        hitRate: 0,
        moleAlertIndex: -1,
        hammerType: 'normal',
        isCarnival: false,
        carnivalTimeLeft: 0,
        elapsedTime: 0,
        cachedPrizeData: prizeData, // 缓存奖品数据
        holes: [false, false, false, false, false, false, false, false, false],
        whackedHoles: [false, false, false, false, false, false, false, false, false]
      })

      this._startMoleSpawner()
      this._startCountdown()
    },

    /** 触摸开始 - 显示锤子 */
    onTouchStart(e: any) {
      if (this.data.gameState !== 'playing') {
        return
      }

      const touch = e.touches[0]
      this.setData({
        hammerX: touch.clientX || touch.x,
        hammerY: touch.clientY || touch.y,
        showHammer: true
      })
    },

    /** 触摸结束 - 隐藏锤子 */
    onTouchEnd() {
      if (this.data.gameState !== 'playing') {
        return
      }

      setTimeout(() => {
        this.setData({ showHammer: false })
      }, 200)
    },

    /** 地鼠生成器 - 节奏变化 + 特殊地鼠 */
    _startMoleSpawner() {
      const spawn = () => {
        if (this.data.gameState !== 'playing' && !this.data.isCarnival) {
          return
        }

        const holes = [...this.data.holes]
        const activeCount = holes.filter(h => h).length
        const elapsed = this.data.elapsedTime

        // 节奏变化系统
        let maxMoles = 1
        let spawnInterval = this.data.moleInterval
        let specialMoleChance = 0.05 // 特殊地鼠基础概率

        if (elapsed >= 15) {
          // 15秒后：高速，最多3洞
          maxMoles = 3
          spawnInterval = Math.max(400, this.data.moleInterval - 400)
          specialMoleChance = 0.15
        } else if (elapsed >= 8) {
          // 8-15秒：加速，最多2洞
          maxMoles = 2
          spawnInterval = Math.max(500, this.data.moleInterval - 200)
          specialMoleChance = 0.1
        } else {
          // 前8秒：慢速单洞
          maxMoles = 1
          spawnInterval = this.data.moleInterval
          specialMoleChance = 0.05
        }

        // 狂欢模式：减速50%
        if (this.data.isCarnival) {
          spawnInterval = spawnInterval * 1.5
        }

        this.setData({ maxActiveMoles: maxMoles })

        // 生成新地鼠
        if (activeCount < maxMoles) {
          const emptySlots = holes.map((h, i) => (h ? -1 : i)).filter(i => i >= 0)
          if (emptySlots.length > 0) {
            const slot = emptySlots[Math.floor(Math.random() * emptySlots.length)]

            // 地鼠类型判定
            const rand = Math.random()
            let moleType: string = 'normal'

            if (rand < 0.001 && elapsed >= 5) {
              // 0.1% 概率彩虹地鼠（5秒后才出现）
              moleType = 'rainbow'
            } else if (rand < 0.05 + specialMoleChance * 0.3) {
              // 炸弹地鼠
              moleType = 'bomb'
            } else if (rand < 0.1 + specialMoleChance) {
              // 金色地鼠
              moleType = 'golden'
            }

            holes[slot] = moleType
            this.setData({ holes })

            // 地鼠自动消失 - 增加警告效果
            const stayTime = this._getMoleStayTime(moleType)

            // 消失前500ms显示警告
            if (moleType === 'normal') {
              const alertTimer = setTimeout(() => {
                if (this.data.gameState !== 'playing') {
                  return
                }
                this.setData({ moleAlertIndex: slot })

                setTimeout(() => {
                  this.setData({ moleAlertIndex: -1 })
                }, 200)
              }, stayTime - 500)
              this._moleHideTimers.push(alertTimer)
            }

            const hideTimer = setTimeout(() => {
              if (this.data.gameState !== 'playing') {
                return
              }
              const currentHoles = [...this.data.holes]
              if (currentHoles[slot]) {
                currentHoles[slot] = false
                this.setData({ holes: currentHoles })
                // 普通鼠没打到，连击中断
                if (moleType === 'normal') {
                  this._updateHammerType(0)
                  this.setData({ comboCount: 0, showCombo: false })
                }
              }
            }, stayTime)
            this._moleHideTimers.push(hideTimer)
          }
        }

        // 动态调整间隔
        this._spawnTimer = setTimeout(spawn, spawnInterval)
      }

      this._moleHideTimers = []
      spawn()
    },

    /** 获取地鼠停留时间 */
    _getMoleStayTime(moleType: string): number {
      const base = this.data.moleStayTime

      if (this.data.isCarnival) {
        // 狂欢模式：所有地鼠减速50%
        return base * 1.5
      }

      switch (moleType) {
        case 'golden':
          return base * 0.7 // 金色鼠更快
        case 'rainbow':
          return base * 0.8 // 彩虹鼠略快
        case 'bomb':
          return base * 1.2 // 炸弹鼠略慢
        default:
          return base
      }
    },

    /** 倒计时 + 狂欢模式倒计时 */
    _startCountdown() {
      this._countdownTimer = setInterval(() => {
        const left = this.data.timeLeft - 1
        const elapsed = this.data.elapsedTime + 1
        const percent = (left / this.data.gameDuration) * 100

        if (left <= 0) {
          this._endGame()
          return
        }

        // 最后3秒震动提醒
        if (left <= 3) {
          this._vibrate('light')
        }

        // 更新狂欢模式倒计时
        if (this.data.isCarnival) {
          const carnivalLeft = this.data.carnivalTimeLeft - 1
          if (carnivalLeft <= 0) {
            this.setData({
              isCarnival: false,
              carnivalTimeLeft: 0
            })
            log.info('[打地鼠] 狂欢模式结束')
          } else {
            this.setData({ carnivalTimeLeft: carnivalLeft })
          }
        }

        this.setData({
          timeLeft: left,
          timePercent: percent,
          elapsedTime: elapsed
        })
      }, 1000)
    },

    /** 锤击地鼠 - 包含特殊效果和Miss惩罚 */
    onWhack(e: any) {
      if (this.data.gameState !== 'playing' && !this.data.isCarnival) {
        return
      }

      const idx = e.currentTarget.dataset.index
      const moleType = this.data.holes[idx]
      const totalClicks = this.data.totalClicks + 1

      // 更新锤子位置
      const touch = e.detail || e.touches?.[0] || { x: 0, y: 0 }
      const hammerX = touch.x || touch.clientX || 0
      const hammerY = touch.y || touch.clientY || 0

      this.setData({
        hammerX,
        hammerY,
        showHammer: true,
        totalClicks
      })

      // 延迟隐藏锤子
      if (this._hammerTimer) {
        clearTimeout(this._hammerTimer)
      }
      this._hammerTimer = setTimeout(() => {
        this.setData({ showHammer: false })
      }, 300)

      // Miss 惩罚：点空地
      if (!moleType) {
        const missCount = this.data.missCount + 1
        const missTimeLeft = Math.max(0, this.data.timeLeft - 1) // -1秒

        this.setData({
          missCount,
          totalClicks,
          timeLeft: missTimeLeft,
          showMissEffect: true,
          missEffectX: hammerX,
          missEffectY: hammerY
        })

        this._vibrate('light')

        // Miss动画消失
        setTimeout(() => {
          this.setData({ showMissEffect: false })
        }, 600)

        log.info('[打地鼠] Miss！-1秒，剩余:', newTimeLeft)
        return
      }

      // 打中地鼠
      const holes = [...this.data.holes]
      const whackedHoles = [...this.data.whackedHoles]
      holes[idx] = false
      whackedHoles[idx] = true

      let scoreAdd = 0
      let combo = this.data.comboCount
      let totalHits = this.data.totalHits + 1
      let timeChange = 0

      // 特殊地鼠效果
      switch (moleType) {
        case 'rainbow':
          // 彩虹地鼠：触发狂欢模式3秒
          scoreAdd = 5
          combo += 1
          this.setData({
            isCarnival: true,
            carnivalTimeLeft: 3
          })
          this._vibrate('heavy')
          log.info('[打地鼠] 彩虹地鼠！触发狂欢模式3秒')
          break

        case 'golden': {
          // 金色地鼠：全屏特效 + 连击不断 + 高分
          combo += 1
          const comboBonus = Math.min(combo, 10) // 最高10倍
          scoreAdd = 3 * comboBonus
          this._vibrate('medium')
          this._triggerFullScreenEffect() // 全屏特效
          log.info('[打地鼠] 金色地鼠！x', comboBonus)
          break
        }

        case 'bomb':
          // 炸弹地鼠：-3秒 + 断连击 + 扣分
          scoreAdd = -3
          timeChange = -3
          combo = 0
          this._vibrate('heavy')
          log.info('[打地鼠] 炸弹地鼠！-3秒')
          break

        default: {
          // 普通地鼠
          combo += 1
          const normalBonus = Math.min(combo, 5)
          scoreAdd = 1 * normalBonus
          this._vibrate('light')
          break
        }
      }

      // 更新时间（炸弹效果）
      let newTimeLeft = this.data.timeLeft
      if (timeChange !== 0) {
        newTimeLeft = Math.max(0, newTimeLeft + timeChange)
      }

      const newScore = Math.max(0, this.data.score + scoreAdd)
      const maxCombo = Math.max(this.data.maxCombo, combo)
      const hitRate = Math.round((totalHits / totalClicks) * 100)

      // 更新锤子外观
      this._updateHammerType(combo)

      this.setData({
        holes,
        whackedHoles,
        score: newScore,
        comboCount: combo,
        showCombo: combo >= 2,
        maxCombo,
        totalHits,
        totalClicks,
        hitRate,
        timeLeft: newTimeLeft,
        moleAlertIndex: -1 // 清除警告
      })

      // 锤击动画结束后重置
      setTimeout(() => {
        const wh = [...this.data.whackedHoles]
        wh[idx] = false
        this.setData({ whackedHoles: wh })
      }, 600)

      // combo提示自动消失
      if (combo >= 2) {
        if (this._comboTimer) {
          clearTimeout(this._comboTimer)
        }
        this._comboTimer = setTimeout(() => {
          this.setData({ showCombo: false })
        }, 1000)
      }
    },

    /** 更新锤子外观（根据连击数） */
    _updateHammerType(combo: number) {
      let hammerType = 'normal'

      if (combo >= 10) {
        hammerType = 'thunder' // 雷电锤
      } else if (combo >= 5) {
        hammerType = 'fire' // 火焰锤
      }

      if (hammerType !== this.data.hammerType) {
        this.setData({ hammerType })
        log.info('[打地鼠] 锤子升级:', hammerType)
      }
    },

    /** 触发全屏特效（金色地鼠） */
    _triggerFullScreenEffect() {
      // 全屏闪光效果
      this.setData({ showCelebration: true })

      if (this._fullScreenTimer) {
        clearTimeout(this._fullScreenTimer)
      }
      this._fullScreenTimer = setTimeout(() => {
        this.setData({ showCelebration: false })
      }, 800)
    },

    /** 游戏结束 - 计算趣味评价 */
    _endGame() {
      this._cleanupGameTimers()

      this._vibrate('heavy')

      // 计算趣味评价
      const funnyComment = this._getFunnyComment()

      this.setData({
        gameState: 'ended',
        timeLeft: 0,
        timePercent: 0,
        funnyComment,
        isCarnival: false,
        holes: [false, false, false, false, false, false, false, false, false],
        whackedHoles: [false, false, false, false, false, false, false, false, false]
      })

      // 显示庆祝特效
      this._showCelebration()

      // 延迟后通知父组件展示奖品
      this._endTimer = setTimeout(() => {
        log.info('[打地鼠] 游戏结束，展示奖品:', this.data.cachedPrizeData)
        this.triggerEvent('animationEnd', {
          prizeData: this.data.cachedPrizeData,
          gameStats: {
            score: this.data.score,
            totalHits: this.data.totalHits,
            totalClicks: this.data.totalClicks,
            maxCombo: this.data.maxCombo,
            hitRate: this.data.hitRate,
            missCount: this.data.missCount,
            funnyComment
          }
        })
      }, 2000) // 2秒后展示奖品
    },

    /** 获取趣味评价 */
    _getFunnyComment(): string {
      const { hitRate, maxCombo, totalHits } = this.data

      // 根据命中率和连击数给出评价
      if (hitRate >= 90 && maxCombo >= 10) {
        return '🏆 地鼠克星！传说中的打地鼠大师！'
      } else if (hitRate >= 80 && maxCombo >= 8) {
        return '⭐ 手速如飞！地鼠都害怕你了！'
      } else if (hitRate >= 70 || maxCombo >= 5) {
        return '👍 表现不错！再练练就是高手！'
      } else if (hitRate >= 50) {
        return '😊 手速一般，但贵在坚持！'
      } else if (totalHits >= 5) {
        return '💪 虽然手抖，但精神可嘉！'
      } else {
        return '🎯 下次加油！地鼠不会跑的！'
      }
    },

    /** 庆祝特效 */
    _showCelebration() {
      this.setData({ showCelebration: true })
      this._celebrationTimer = setTimeout(() => {
        this.setData({ showCelebration: false })
      }, 2000)
    },

    /** 触觉反馈 */
    _vibrate(type: 'light' | 'medium' | 'heavy') {
      try {
        if (wx.vibrateShort) {
          wx.vibrateShort({ type })
        }
      } catch (_e) {
        /* 静默 */
      }
    },

    /** 清理游戏定时器 */
    _cleanupGameTimers() {
      if (this._spawnTimer) {
        clearTimeout(this._spawnTimer)
        this._spawnTimer = null
      }
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
      }
      if (this._moleHideTimers) {
        this._moleHideTimers.forEach((t: any) => clearTimeout(t))
        this._moleHideTimers = []
      }
      if (this._comboTimer) {
        clearTimeout(this._comboTimer)
        this._comboTimer = null
      }
      if (this._hammerTimer) {
        clearTimeout(this._hammerTimer)
        this._hammerTimer = null
      }
      if (this._fullScreenTimer) {
        clearTimeout(this._fullScreenTimer)
        this._fullScreenTimer = null
      }
    },

    /** 清理所有定时器 */
    _cleanupAllTimers() {
      this._cleanupGameTimers()
      if (this._endTimer) {
        clearTimeout(this._endTimer)
        this._endTimer = null
      }
      if (this._celebrationTimer) {
        clearTimeout(this._celebrationTimer)
        this._celebrationTimer = null
      }
    },

    /** 重置游戏（父组件调用） */
    resetGame() {
      this._cleanupAllTimers()
      this.setData({
        gameState: 'ready',
        score: 0,
        comboCount: 0,
        showCombo: false,
        timeLeft: this.data.baseGameDuration,
        timePercent: 100,
        gameDuration: this.data.baseGameDuration,
        maxActiveMoles: 1,
        showCelebration: false,
        showHammer: false,
        hammerType: 'normal',
        moleAlertIndex: -1,
        maxCombo: 0,
        totalHits: 0,
        totalClicks: 0,
        missCount: 0,
        hitRate: 0,
        isCarnival: false,
        carnivalTimeLeft: 0,
        elapsedTime: 0,
        funnyComment: '',
        cachedPrizeData: null,
        showMissEffect: false,
        holes: [false, false, false, false, false, false, false, false, false],
        whackedHoles: [false, false, false, false, false, false, false, false, false]
      })
    }
  }
})

export {}
