/**
 * 限时秒杀 子组件 V3 — 极限抢购体验
 *
 * 核心交互：
 *   1. 光束 + 火焰粒子双层氛围，紧急度越高氛围越强
 *   2. 霓虹横幅 + 翻牌倒计时 + 滚动播报"XX刚刚抢到"
 *   3. 聚光灯主奖品（全息光效 + 呼吸光晕）+ 缩略奖品横排
 *   4. "已抢XX%" 百分比徽章 + 波浪进度条 + 分级紧急提示
 *   5. 脉冲环抢购按钮 + 按下涟漪 + 震动反馈
 *   6. 成功卡片弹层（全息揭晓 + 12粒子 + 文字动画）
 *
 * @file sub/flashsale/flashsale.ts
 * @version 5.2.0
 */

const prizeImageBehavior = require('../../shared/prize-image-behavior')

Component({
  behaviors: [prizeImageBehavior],

  properties: {
    /** 奖品列表 */
    prizes: { type: Array, value: [] },
    prizesForPreview: { type: Array, value: [] },
    /** 单次抢购消耗积分 */
    costPoints: { type: Number, value: 0 },
    /** 用户当前积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 父组件抽奖API是否完成 */
    isInProgress: { type: Boolean, value: false },
    /** 特效主题 */
    effectTheme: { type: String, value: 'default' },
    /** 稀有度光效 */
    rarityEffects: { type: Boolean, value: false },
    /** 中奖动画风格 */
    winAnimation: { type: String, value: 'simple' },
    /** display配置 */
    displayConfig: { type: Object, value: {} }
  },

  data: {
    /** 入场动画已触发 */
    entered: false,

    /**
     * 状态机
     *  idle     → 可操作
     *  grabbing → 已点按钮，等API返回
     *  grabbed  → 抢购成功，展示庆祝
     *  sold_out → 库存售罄
     */
    state: 'idle' as string,

    /** 库存数据 */
    stockTotal: 50,
    stockRemaining: 23,
    stockPercent: 46,
    /** 已抢百分比（用于进度条和徽章） */
    grabbedPercent: 54,

    /** 倒计时显示 */
    countdown: { hours: '00', minutes: '15', seconds: '00' },
    totalSeconds: 900,
    initialSeconds: 900,

    /** 聚光灯主奖品（第一个奖品，大卡展示） */
    spotlightPrize: null as any,
    /** 缩略奖品横排（其余奖品，小卡展示） */
    thumbnailPrizes: [] as any[],

    /** 滚动播报消息列表 */
    rollingMessages: [] as any[],
    /** 当前播报索引 */
    currentMsgIndex: 0,
    /** 播报滑出动画中 */
    msgSliding: false,

    /** 时间紧急度: normal / urgent / critical */
    urgencyLevel: 'normal' as string,
    /** 库存紧急度: normal / low / critical */
    stockUrgency: 'normal' as string,

    /** 倒计时翻转动画切换 */
    countdownFlip: false,
    /** 按钮涟漪动画 */
    showRipple: false,
    /** 成功弹层 */
    showSuccess: false
  },

  observers: {
    'prizes, displayConfig'() {
      this._initSale()
    },
    isInProgress(val: boolean) {
      if (val && this.data.state === 'grabbing') {
        this._showGrabResult()
      }
    }
  },

  lifetimes: {
    attached() {
      setTimeout(() => this.setData({ entered: true }), 60)
    },
    detached() {
      this._clearTimers()
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

    // ================================
    // 定时器管理
    // ================================

    /** 清理所有定时器 */
    _clearTimers() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
        this._countdownTimer = null
      }
      if (this._broadcastTimer) {
        clearInterval(this._broadcastTimer)
        this._broadcastTimer = null
      }
    },

    // ================================
    // 初始化
    // ================================

    /** 初始化秒杀所有数据 */
    _initSale() {
      const cfg = this.properties.displayConfig as any
      const total = cfg?.stock_total || 50
      const remaining = cfg?.stock_remaining || 23
      const initialSec = cfg?.countdown_seconds || 900
      const prizes = this.properties.prizes as any[]

      /* 聚光灯 = 第一个奖品，大卡展示 */
      const spotlightPrize = prizes[0] || null

      /* 缩略 = 其余奖品（最多5个），小卡展示 */
      const thumbnailPrizes = prizes.slice(1, 6).map((p: any, i: number) => ({
        ...p,
        index: i
      }))

      const stockPct = Math.round((remaining / total) * 100)
      const grabbedPct = 100 - stockPct

      /* 生成滚动播报 */
      const rollingMessages = this._generateMessages(prizes)

      this.setData({
        stockTotal: total,
        stockRemaining: remaining,
        stockPercent: stockPct,
        grabbedPercent: grabbedPct,
        spotlightPrize,
        thumbnailPrizes,
        rollingMessages,
        currentMsgIndex: 0,
        msgSliding: false,
        totalSeconds: initialSec,
        initialSeconds: initialSec,
        state: remaining <= 0 ? 'sold_out' : 'idle',
        stockUrgency: this._calcStockUrgency(stockPct),
        showSuccess: false,
        showRipple: false
      })

      this._startCountdown()
      this._startBroadcast()
    },

    // ================================
    // 滚动播报
    // ================================

    /** 生成播报消息列表 */
    _generateMessages(prizes: any[]): any[] {
      const suffixes = ['8', '3', '6', '1', '9', '5', '7', '2']
      const verbs = ['刚刚抢到了', '成功秒杀', '幸运获得', '火速抢到']
      const prizeLen = Math.max(prizes.length, 1)

      return suffixes.map((s, i) => ({
        text: `用户***${s} ${verbs[i % verbs.length]} ${prizes[i % prizeLen]?.prize_name || ''}`
      }))
    },

    /** 启动播报轮播 */
    _startBroadcast() {
      if (this._broadcastTimer) {
        clearInterval(this._broadcastTimer)
      }
      if (this.data.rollingMessages.length === 0) {
        return
      }
      this._broadcastTimer = setInterval(() => {
        /* 先滑出 */
        this.setData({ msgSliding: true })
        /* 300ms后切换内容并滑入 */
        setTimeout(() => {
          const nextIdx = (this.data.currentMsgIndex + 1) % this.data.rollingMessages.length
          this.setData({ currentMsgIndex: nextIdx, msgSliding: false })
        }, 300)
      }, 3500)
    },

    // ================================
    // 倒计时
    // ================================

    _startCountdown() {
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
      }
      let seconds = this.data.totalSeconds
      const initialSec = this.data.initialSeconds
      this._updateCountdownDisplay(seconds, initialSec)

      this._countdownTimer = setInterval(() => {
        seconds--
        if (seconds <= 0) {
          clearInterval(this._countdownTimer)
          this._countdownTimer = null
          seconds = 0
        }
        this._updateCountdownDisplay(seconds, initialSec)
      }, 1000)
    },

    _updateCountdownDisplay(seconds: number, initialSec: number) {
      const h = Math.floor(seconds / 3600)
      const m = Math.floor((seconds % 3600) / 60)
      const s = seconds % 60
      const ratio = initialSec > 0 ? seconds / initialSec : 1

      let urgencyLevel = 'normal'
      if (ratio <= 0.1) {
        urgencyLevel = 'critical'
      } else if (ratio <= 0.3) {
        urgencyLevel = 'urgent'
      }

      this.setData({
        totalSeconds: seconds,
        countdown: {
          hours: String(h).padStart(2, '0'),
          minutes: String(m).padStart(2, '0'),
          seconds: String(s).padStart(2, '0')
        },
        urgencyLevel,
        countdownFlip: !this.data.countdownFlip
      })
    },

    // ================================
    // 抢购操作
    // ================================

    onGrab() {
      if (this.data.state !== 'idle') {
        return
      }
      if (this.data.stockRemaining <= 0) {
        return
      }

      this.setData({ state: 'grabbing', showRipple: true })
      /* 涟漪动画结束后隐藏 */
      setTimeout(() => this.setData({ showRipple: false }), 600)

      this.triggerEvent('draw', { count: 1 })

      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* 部分设备不支持震动API，静默降级 */
      }
    },

    _showGrabResult() {
      const remaining = Math.max(0, this.data.stockRemaining - 1)
      const stockPct = Math.round((remaining / this.data.stockTotal) * 100)

      this.setData({
        state: 'grabbed',
        stockRemaining: remaining,
        stockPercent: stockPct,
        grabbedPercent: 100 - stockPct,
        stockUrgency: this._calcStockUrgency(stockPct),
        showSuccess: true
      })

      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* 部分设备不支持震动API，静默降级 */
      }

      /* 2s后自动关闭弹层 */
      setTimeout(() => {
        if (this.data.showSuccess) {
          this.setData({ showSuccess: false })
          this.triggerEvent('animationEnd')
        }
      }, 2000)
    },

    /** 点击关闭成功弹层 */
    onCloseSuccess() {
      if (!this.data.showSuccess) {
        return
      }
      this.setData({ showSuccess: false })
      this.triggerEvent('animationEnd')
    },

    // ================================
    // 工具方法
    // ================================

    _calcStockUrgency(stockPct: number): string {
      if (stockPct <= 20) {
        return 'critical'
      }
      if (stockPct <= 50) {
        return 'low'
      }
      return 'normal'
    },

    resetSale() {
      this._clearTimers()
      this._initSale()
    },

    noop() {
      /* intentionally empty */
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.setData({ state: 'idle' })
    }
  }
})
