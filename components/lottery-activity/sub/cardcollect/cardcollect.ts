/**
 * 集卡子组件 V2 — 魔法卡册
 *
 * 核心交互：
 *   1. 卡册式布局，自适应2/3列网格
 *   2. 点击「抽取卡片」→ API调用 → 中央舞台大卡揭晓（粒子爆炸）
 *   3. 揭晓弹层点击关闭后，卡片归位到卡册网格
 *   4. 点击已收集的卡片有轻微缩放反馈
 *   5. 环形进度 + 集齐彩蛋
 *
 * @file sub/cardcollect/cardcollect.ts
 * @version 5.0.0
 */

Component({
  properties: {
    /** 奖品列表 */
    prizes: { type: Array, value: [] },
    /** 单抽消耗积分 */
    costPoints: { type: Number, value: 0 },
    /** 用户当前积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 父组件抽奖API是否完成 */
    isInProgress: { type: Boolean, value: false },
    /** 主题 */
    effectTheme: { type: String, value: 'default' },
    /** 稀有度特效 */
    rarityEffects: { type: Boolean, value: false },
    /** 动画风格 */
    winAnimation: { type: String, value: 'simple' },
    /** display配置（含 total_cards_in_set 等） */
    displayConfig: { type: Object, value: {} }
  },

  data: {
    /**
     * 状态机
     *  idle     → 可操作
     *  flipping → 已点按钮，等API返回
     *  revealed → 中央揭晓弹层展示中
     */
    state: 'idle' as string,

    totalCards: 6,
    cards: [] as any[],
    collectedCount: 0,
    newCardIndex: -1,

    /** 进度环角度 (0-360) */
    progressDeg: 0,
    /** 网格列数 */
    gridCols: 3,
    /** 是否达到半数 / 全部 */
    halfReached: false,
    allCollected: false,
    /** 入场动画 */
    entered: false,

    /* ===== 中央揭晓弹层 ===== */
    /** 是否显示中央揭晓 */
    showReveal: false,
    /** 正在揭晓的奖品数据 */
    revealPrize: {} as any,
    /** 正在揭晓的卡片索引 */
    revealIndex: -1,
    /** 是否重复卡 */
    isRepeatCard: false,
    /** 正在揭晓中的索引（用于网格中对应卡高亮） */
    revealingIndex: -1,

    /* ===== 交互 ===== */
    /** 当前被点击的卡片索引（缩放反馈） */
    tappedIndex: -1
  },

  observers: {
    'prizes, displayConfig'() {
      this._initCards()
    },

    /** API返回后 → 进入中央揭晓 */
    isInProgress(val: boolean) {
      if (val && this.data.state === 'flipping') {
        this._startReveal()
      }
    }
  },

  lifetimes: {
    attached() {
      setTimeout(() => this.setData({ entered: true }), 80)
    }
  },

  methods: {
    // ================================
    // 初始化
    // ================================

    _initCards() {
      const cfg = this.properties.displayConfig as any
      const total = cfg?.total_cards_in_set || 6
      const prizes = this.properties.prizes as any[]

      /* 自适应列数：≤4张用2列，否则3列 */
      const gridCols = total <= 4 ? 2 : 3

      const cards = Array.from({ length: total }, (_, i) => ({
        index: i,
        prize: prizes[i % prizes.length] || { name: '卡片', icon: '🃏' },
        collected: false,
        isNew: false,
        enterDelay: i * 70
      }))

      /* 卡牌收集状态：基于抽奖结果展示，无需独立进度接口 */

      const collectedCount = cards.filter((c: any) => c.collected).length
      const progressDeg = Math.round((collectedCount / total) * 360)
      const halfMilestone = Math.ceil(total * 0.5)

      this.setData({
        cards,
        totalCards: total,
        gridCols,
        collectedCount,
        progressDeg,
        halfReached: collectedCount >= halfMilestone,
        allCollected: collectedCount >= total,
        state: 'idle',
        newCardIndex: -1,
        showReveal: false,
        revealingIndex: -1,
        tappedIndex: -1
      })
    },

    // ================================
    // 抽卡
    // ================================

    /** 点击抽卡按钮 */
    onDraw() {
      if (this.data.state !== 'idle') {
        return
      }
      this.setData({ state: 'flipping' })
      this.triggerEvent('draw', { count: 1 })
    },

    // ================================
    // 中央舞台揭晓
    // ================================

    /** API返回后启动中央揭晓 */
    _startReveal() {
      /* 复位所有卡的 isNew */
      const cards = this.data.cards.map((c: any) => ({ ...c, isNew: false }))

      /* 选取目标卡 */
      const uncollected = cards.filter((c: any) => !c.collected)
      let targetIndex: number
      let isRepeatCard = false

      if (uncollected.length > 0) {
        const pick = uncollected[Math.floor(Math.random() * uncollected.length)]
        targetIndex = pick.index
      } else {
        targetIndex = Math.floor(Math.random() * cards.length)
        isRepeatCard = true
      }

      cards[targetIndex].collected = true
      const targetPrize = cards[targetIndex].prize

      const collectedCount = cards.filter((c: any) => c.collected).length
      const totalCards = this.data.totalCards
      const progressDeg = Math.round((collectedCount / totalCards) * 360)
      const halfMilestone = Math.ceil(totalCards * 0.5)

      /* 先更新卡片数据，再弹出中央揭晓层 */
      this.setData({
        cards,
        newCardIndex: targetIndex,
        revealingIndex: targetIndex,
        collectedCount,
        progressDeg,
        halfReached: collectedCount >= halfMilestone,
        allCollected: collectedCount >= totalCards,
        revealPrize: targetPrize,
        revealIndex: targetIndex,
        isRepeatCard,
        state: 'revealed'
      })

      /* 延迟一帧后显示揭晓弹层（让数据先生效） */
      setTimeout(() => {
        this.setData({ showReveal: true })
      }, 50)

      /* 震动反馈 */
      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* */
      }
    },

    /** 关闭中央揭晓 → 卡片归位到网格 */
    onCloseReveal() {
      if (!this.data.showReveal) {
        return
      }

      const targetIndex = this.data.newCardIndex

      /* 先关弹层 */
      this.setData({ showReveal: false })

      /* 300ms后在网格中标记新卡 + 恢复idle */
      setTimeout(() => {
        const cards = this.data.cards.map((c: any, i: number) => ({
          ...c,
          isNew: i === targetIndex
        }))
        this.setData({
          cards,
          revealingIndex: -1,
          state: 'idle'
        })

        /* 通知父组件动画结束 */
        this.triggerEvent('animationEnd')

        /* 1.5s后清除NEW标记 */
        setTimeout(() => {
          const cleared = this.data.cards.map((c: any) => ({ ...c, isNew: false }))
          this.setData({ cards: cleared })
        }, 2000)
      }, 350)
    },

    // ================================
    // 卡片点击交互
    // ================================

    /** 点击卡片（已收集的缩放反馈） */
    onTapCard(e: any) {
      const idx = e.currentTarget.dataset.idx
      if (idx === undefined || idx === null) {
        return
      }

      /* 只对已收集的卡生效 */
      const card = this.data.cards[idx]
      if (!card || !card.collected) {
        return
      }

      this.setData({ tappedIndex: idx })
      setTimeout(() => this.setData({ tappedIndex: -1 }), 300)
    },

    /** 阻止弹层滚动穿透 */
    noop() {
      /* intentionally empty */
    },

    // ================================
    // 重置
    // ================================

    resetCards() {
      this._initCards()
    }
  }
})
