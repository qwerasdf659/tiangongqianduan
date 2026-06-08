/**
 * 限时秒杀 子组件 V3 — 极限抢购体验
 *
 * 核心交互：
 *   1. 光束 + 火焰粒子双层氛围，紧急度越高氛围越强
 *   2. 霓虹横幅 + 翻牌倒计时（后端下发 countdown_seconds 时启用）+ 滚动播报（仅展示后端真实文案）
 *   3. 聚光灯主奖品（全息光效 + 呼吸光晕）+ 缩略奖品横排
 *   4. "已抢XX%" 百分比徽章 + 波浪进度条 + 分级紧急提示（后端下发 stock_total/stock_remaining 时展示）
 *   5. 脉冲环抢购按钮 + 按下涟漪 + 震动反馈
 *   6. 成功卡片弹层（全息揭晓 + 12粒子 + 文字动画）
 *
 * @file sub/flashsale/flashsale.ts
 * @version 6.0.0 — Skyline Worklet 动画升级
 */

const prizeImageBehavior = require('../../shared/prize-image-behavior')
const { shared, timing } = wx.worklet

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

    /**
     * 库存数据 — 业务数据，必须由后端权威提供（决策C）
     * 后端通过 config 下发 stock_total / stock_remaining 时才展示库存区，
     * 未下发则 hasStock=false，前端不显示、不伪造、不在前端计算扣减
     */
    hasStock: false,
    stockTotal: 0,
    stockRemaining: 0,
    stockPercent: 0,
    /** 已抢百分比（用于进度条和徽章，仅 hasStock 时有效） */
    grabbedPercent: 0,
    /** 是否售罄（仅 hasStock 且 stockRemaining<=0 时为真） */
    isSoldOut: false,

    /** 倒计时显示（仅后端下发 countdown_seconds 时启用，hasCountdown 控制） */
    hasCountdown: false,
    countdown: { hours: '00', minutes: '00', seconds: '00' },
    totalSeconds: 0,
    initialSeconds: 0,

    /** 聚光灯主奖品（第一个奖品，大卡展示） */
    spotlightPrize: null as any,
    /** 缩略奖品横排（其余奖品，小卡展示） */
    thumbnailPrizes: [] as any[],

    /**
     * 滚动播报消息列表 — 真实他人获得记录，必须由后端权威提供（决策C）
     * 后端通过 config 下发 broadcast_messages（已格式化的展示文案数组）时才滚动播报，
     * 未下发则为空、不显示，前端绝不伪造"XX刚刚抢到"等虚假社会证明
     */
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
      /* Worklet 驱动入场动画 */
      this._enterOpacity = shared(0)
      this._enterTranslateY = shared(20)

      this.applyAnimatedStyle('.fs', () => {
        'worklet'
        return {
          opacity: this._enterOpacity.value,
          transform: `translateY(${this._enterTranslateY.value}px)`
        }
      })

      this._enterOpacity.value = timing(
        1,
        { duration: 350, easing: (wx.worklet.Easing as any).ease },
        (() => {
          'worklet'
        }) as any
      )
      this._enterTranslateY.value = timing(
        0,
        { duration: 350, easing: (wx.worklet.Easing as any).ease },
        (() => {
          'worklet'
        }) as any
      )

      /* Worklet 驱动按钮涟漪缩放 */
      this._rippleScale = shared(0)
      this._rippleOpacity = shared(0)
      this.applyAnimatedStyle('.grab-ripple', () => {
        'worklet'
        return {
          transform: `scale(${this._rippleScale.value})`,
          opacity: this._rippleOpacity.value
        }
      })

      /* 低频状态标记保留 */
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
      const prizes = this.properties.prizes as any[]

      /* 聚光灯 = 第一个奖品，大卡展示 */
      const spotlightPrize = prizes[0] || null

      /* 缩略 = 其余奖品（最多5个），小卡展示 */
      const thumbnailPrizes = prizes.slice(1, 6).map((p: any, i: number) => ({
        ...p,
        index: i
      }))

      /**
       * 库存：仅当后端同时下发 stock_total 与 stock_remaining（均为数字）才展示
       * 不下发则 hasStock=false，前端不显示库存区、不伪造数字
       */
      const total = cfg?.stock_total
      const remaining = cfg?.stock_remaining
      const hasStock = typeof total === 'number' && typeof remaining === 'number' && total > 0
      const stockPct = hasStock ? Math.round((remaining / total) * 100) : 0
      const grabbedPct = hasStock ? 100 - stockPct : 0
      const isSoldOut = hasStock && remaining <= 0

      /**
       * 倒计时：仅当后端下发 countdown_seconds（数字）才启用
       */
      const initialSec = cfg?.countdown_seconds
      const hasCountdown = typeof initialSec === 'number' && initialSec > 0

      /**
       * 滚动播报：仅使用后端下发的 broadcast_messages（已格式化文案数组）
       * 后端字段格式约定：[{ text: '展示文案' }, ...]，前端不生成、不伪造
       */
      const backendMessages = Array.isArray(cfg?.broadcast_messages) ? cfg.broadcast_messages : []

      this.setData({
        hasStock,
        stockTotal: hasStock ? total : 0,
        stockRemaining: hasStock ? remaining : 0,
        stockPercent: stockPct,
        grabbedPercent: grabbedPct,
        isSoldOut,
        spotlightPrize,
        thumbnailPrizes,
        rollingMessages: backendMessages,
        currentMsgIndex: 0,
        msgSliding: false,
        hasCountdown,
        totalSeconds: hasCountdown ? initialSec : 0,
        initialSeconds: hasCountdown ? initialSec : 0,
        state: isSoldOut ? 'sold_out' : 'idle',
        stockUrgency: hasStock ? this._calcStockUrgency(stockPct) : 'normal',
        showSuccess: false,
        showRipple: false
      })

      if (hasCountdown) {
        this._startCountdown()
      }
      this._startBroadcast()
    },

    // ================================
    // 滚动播报（仅展示后端下发的真实文案，前端不生成）
    // ================================

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
      /* 仅当后端下发库存且已售罄时拦截；无库存概念（hasStock=false）正常放行 */
      if (this.data.isSoldOut) {
        return
      }

      this.setData({ state: 'grabbing' })

      /* Worklet 驱动涟漪动画，替代 showRipple setData */
      this._rippleScale.value = 0
      this._rippleOpacity.value = 0.6
      this._rippleScale.value = timing(
        2.5,
        { duration: 500, easing: (wx.worklet.Easing as any).ease },
        (() => {
          'worklet'
        }) as any
      )
      this._rippleOpacity.value = timing(
        0,
        { duration: 500, easing: (wx.worklet.Easing as any).ease },
        (() => {
          'worklet'
        }) as any
      )

      this.triggerEvent('draw', { count: 1 })

      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* 部分设备不支持震动API，静默降级 */
      }
    },

    _showGrabResult() {
      /**
       * 不在前端伪造库存扣减（业务数据以后端为准）。
       * 库存数字由后端在下次 config 下发时刷新（hasStock 时展示），
       * 这里仅切换到成功态并弹出结果，等待后端真实播报/库存接口接入。
       */
      this.setData({
        state: 'grabbed',
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
