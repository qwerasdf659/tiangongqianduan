/**
 * 卡牌翻转 子组件 - 3张卡牌选1张翻转（增强动效版）
 * 支持单抽（3选1）、连翻（N张逐张翻开）和选牌（M选N）三种模式
 * @file sub/card/card.ts
 * @version 6.0.0 — Skyline Worklet 动画驱动
 */

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
    drawResult: { type: Object, value: null },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    /** 连翻张数（0=单抽模式） */
    multiDrawCount: { type: Number, value: 0 },
    /** 连翻结果数组（API返回的奖品） */
    multiDrawResults: { type: Array, value: [] },
    /** 展示配置（M选N模式使用 total_cards / pick_count） */
    displayConfig: { type: Object, value: {} }
  },

  data: {
    /** 展示的3张卡牌（单抽模式） */
    cards: [] as any[],
    /** 已选中的卡牌索引（-1=未选） */
    selectedIndex: -1,
    /** 是否已翻转 */
    flipped: false,
    /** 是否可以选择 */
    canSelect: true,
    /** 入场动画是否完成 */
    entered: false,
    /** 等待后端返回中（选中→翻转之间） */
    waiting: false,
    /** 揭晓光晕 */
    showGlow: false,

    /* ===== 连翻模式 ===== */
    /** 是否处于连翻模式 */
    isMultiFlip: false,
    /** 已翻开张数 */
    flippedCount: 0,
    /** 总卡牌数 */
    totalCards: 0,
    /** 是否全部翻完 */
    allFlipped: false,
    /** 行布局数组，每行包含卡牌数组 */
    cardRows: [] as any[][],
    /** 尺寸class：size-3 / size-5 / size-10 */
    sizeClass: 'size-3',
    /** 连翻入场动画 */
    multiEntered: false,

    /* ===== M选N 选牌模式 ===== */
    /** 是否处于 M选N 模式 */
    isPickMode: false,
    /** 需选择的卡牌数 */
    pickCount: 3,
    /** 已选中的卡牌索引 */
    selectedIndices: [] as number[],
    /** 选牌阶段：picking=选牌中 flipping=翻牌中 done=完成 */
    pickPhase: 'picking' as 'picking' | 'flipping' | 'done'
  },

  observers: {
    prizes(prizes: any[]) {
      if (this.data.isMultiFlip || this.data.isPickMode) {
        return
      }
      if (prizes && prizes.length > 0) {
        this._initCards(prizes)
      }
    },
    isInProgress(val: boolean) {
      if (this.data.isPickMode && this.data.pickPhase === 'flipping' && val) {
        this._flipPickedCards()
        return
      }
      if (this.data.isMultiFlip) {
        return
      }
      if (val && this.data.selectedIndex >= 0) {
        this._flipCard()
      }
      /* 抽奖失败/取消时，isInProgress 从外部变回 false，重置卡牌 */
      if (!val && this.data.waiting) {
        this.setData({ selectedIndex: -1, canSelect: true, waiting: false })
      }
    },
    'multiDrawCount, multiDrawResults'(count: number, results: any[]) {
      if (count > 0 && results && results.length > 0) {
        this._initMultiFlipCards(count, results)
      }
    },
    displayConfig(cfg: any) {
      if (cfg && cfg.total_cards && cfg.pick_count) {
        this._initPickModeCards()
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

    /** 初始化3张卡牌（带入场动画） - 单抽模式 */
    _initCards(prizes: any[]) {
      const shuffled = [...prizes].sort(() => Math.random() - 0.5)
      const cards = shuffled.slice(0, 3).map((p, i) => ({
        ...p,
        index: i,
        flipped: false,
        enterDelay: i * 150
      }))
      this.setData({
        cards,
        selectedIndex: -1,
        flipped: false,
        canSelect: false,
        entered: false,
        waiting: false,
        showGlow: false
      })

      // Worklet 驱动入场动画编排
      this._entryProgress = shared(0)
      const totalDelay = 50 + cards.length * 150 + 500
      this._entryProgress.value = timing(1, { duration: 50 }, () => {
        'worklet'
        runOnJS(this._onEntryStart.bind(this))()
      })

      // 入场动画结束后开放选择
      this._entryTimer = setTimeout(() => {
        this.setData({ canSelect: true })
      }, totalDelay)
    },

    /** 入场动画开始回调 */
    _onEntryStart() {
      this.setData({ entered: true })
    },

    /** 选择卡牌 - 单抽模式 */
    onSelectCard(e: any) {
      if (!this.data.canSelect || this.data.flipped) {
        return
      }
      const index = e.currentTarget.dataset.index
      this.setData({ selectedIndex: index, canSelect: false, waiting: true })

      /* 触觉反馈 */
      wx.vibrateShort({ type: 'medium' })

      /* 触发抽奖 */
      this.triggerEvent('draw', { count: 1 })
    },

    /** 翻转选中的卡牌 — Worklet timing 驱动 3D rotateY */
    _flipCard() {
      const { selectedIndex, cards } = this.data
      const drawResult = (this.properties.drawResult as any) || null
      if (selectedIndex < 0 || !drawResult) {
        return
      }

      const nextCards = cards.map((card: any, index: number) =>
        index === selectedIndex
          ? {
              ...card,
              ...drawResult,
              index,
              flipped: false,
              enterDelay: card.enterDelay
            }
          : card
      )

      // 先更新数据，再用 Worklet 驱动翻转
      const step1 = nextCards.map((c: any, i: number) => ({
        ...c,
        flipped: i === selectedIndex
      }))
      this.setData({ cards: step1, flipped: true, waiting: false })

      // Worklet 驱动光晕显示（替代 setTimeout 800ms）
      this._glowOpacity = shared(0)
      this._glowOpacity.value = timing(1, { duration: 800 }, () => {
        'worklet'
        runOnJS(this._onGlowReady.bind(this))()
      })

      // Worklet 驱动其余卡牌翻开（替代 setTimeout 1200ms）
      this._revealProgress = shared(0)
      this._revealProgress.value = timing(1, { duration: 1200 }, () => {
        'worklet'
        runOnJS(this._onAllCardsReveal.bind(this, nextCards))()
      })

      // Worklet 驱动动画结束通知（替代 setTimeout 2200ms）
      this._endProgress = shared(0)
      this._endProgress.value = timing(1, { duration: 2200 }, () => {
        'worklet'
        runOnJS(this._onFlipAnimationEnd.bind(this))()
      })
    },

    /** 光晕就绪回调 */
    _onGlowReady() {
      this.setData({ showGlow: true })
      wx.vibrateShort({ type: 'heavy' })
    },

    /** 所有卡牌翻开回调 */
    _onAllCardsReveal(nextCards: any[]) {
      const allFlipped = nextCards.map((c: any) => ({ ...c, flipped: true }))
      this.setData({ cards: allFlipped })
    },

    /** 翻转动画结束回调 */
    _onFlipAnimationEnd() {
      this.triggerEvent('animationEnd')
    },

    /* ===== 连翻模式方法 ===== */

    /** 初始化连翻卡牌 — Worklet 驱动入场 */
    _initMultiFlipCards(count: number, results: any[]) {
      const cards = results.map((prize: any, i: number) => ({
        ...prize,
        index: i,
        flipped: false,
        enterDelay: i * 100
      }))

      const sizeClass = count <= 3 ? 'size-3' : count <= 5 ? 'size-5' : 'size-10'
      const cardRows = this._buildRows(cards, count)

      this.setData({
        isMultiFlip: true,
        flippedCount: 0,
        totalCards: cards.length,
        allFlipped: false,
        cardRows,
        sizeClass,
        multiEntered: false
      })

      // Worklet 驱动入场动画（替代 setTimeout 50ms）
      this._multiEntryProgress = shared(0)
      this._multiEntryProgress.value = timing(1, { duration: 50 }, () => {
        'worklet'
        runOnJS(this._onMultiEntryReady.bind(this))()
      })
    },

    /** 连翻入场就绪回调 */
    _onMultiEntryReady() {
      this.setData({ multiEntered: true })
    },

    /** 按布局规则分行：3→1排，5→1排，10→上5下5 */
    _buildRows(cards: any[], count: number): any[][] {
      if (count <= 5) {
        return [cards]
      }
      /* 10张：上5下5 */
      return [cards.slice(0, 5), cards.slice(5)]
    },

    /** 逐张点击翻开 — Worklet 驱动完成通知 */
    onTapMultiCard(e: any) {
      const rowIdx = e.currentTarget.dataset.row
      const colIdx = e.currentTarget.dataset.col
      const cardRows = this.data.cardRows
      const card = cardRows[rowIdx][colIdx]

      if (card.flipped) {
        return
      }

      cardRows[rowIdx][colIdx] = { ...card, flipped: true }
      const flippedCount = this.data.flippedCount + 1
      const allFlipped = flippedCount >= this.data.totalCards

      this.setData({
        cardRows,
        flippedCount,
        allFlipped
      })

      wx.vibrateShort({ type: 'medium' })

      // 全部翻完后用 Worklet timing 延迟通知（替代 setTimeout 800ms）
      if (allFlipped) {
        this._multiDoneProgress = shared(0)
        this._multiDoneProgress.value = timing(1, { duration: 800 }, () => {
          'worklet'
          runOnJS(this._onFlipAnimationEnd.bind(this))()
        })
      }
    },

    /** 一键全部翻开 — Worklet timing 编排逐张翻开 */
    onFlipAll() {
      const cardRows = this.data.cardRows
      let delay = 0
      const unflippedCards: { row: number; col: number; delay: number }[] = []

      for (let r = 0; r < cardRows.length; r++) {
        for (let c = 0; c < cardRows[r].length; c++) {
          if (!cardRows[r][c].flipped) {
            unflippedCards.push({ row: r, col: c, delay })
            delay += 150
          }
        }
      }

      // 用 Worklet timing 逐张翻开
      unflippedCards.forEach(item => {
        const progress = shared(0)
        progress.value = timing(1, { duration: item.delay + 1 }, () => {
          'worklet'
          runOnJS(this._flipOneMultiCard.bind(this, item.row, item.col))()
        })
      })
    },

    /** 翻开连翻模式中的单张卡牌 */
    _flipOneMultiCard(row: number, col: number) {
      const rows = this.data.cardRows
      rows[row][col] = { ...rows[row][col], flipped: true }
      const count = this.data.flippedCount + 1
      const all = count >= this.data.totalCards
      this.setData({ cardRows: rows, flippedCount: count, allFlipped: all })
      wx.vibrateShort({ type: 'light' })

      if (all) {
        this._flipAllDone = shared(0)
        this._flipAllDone.value = timing(1, { duration: 800 }, () => {
          'worklet'
          runOnJS(this._onFlipAnimationEnd.bind(this))()
        })
      }
    },

    /* ===== M选N 选牌模式方法 ===== */

    /** 初始化 M选N 卡牌 */
    _initPickModeCards() {
      const cfg = this.properties.displayConfig as any
      const total = cfg?.total_cards || 9
      const pick = cfg?.pick_count || 3
      const prizes = this.properties.prizes as any[]
      if (!Array.isArray(prizes) || prizes.length === 0) {
        this.setData({
          isPickMode: true,
          cards: [],
          totalCards: total,
          pickCount: pick,
          selectedIndices: [],
          pickPhase: 'picking'
        })
        return
      }
      const cards = Array.from({ length: total }, (_, i) => ({
        index: i,
        prize: prizes[i % prizes.length],
        flipped: false,
        selected: false
      }))
      this.setData({
        isPickMode: true,
        cards,
        totalCards: total,
        pickCount: pick,
        selectedIndices: [],
        pickPhase: 'picking'
      })
    },

    /** 选牌模式：点击选/取消选 */
    onTapPickCard(e: any) {
      if (this.data.pickPhase !== 'picking') {
        return
      }
      const idx = e.currentTarget.dataset.index
      const selected = [...this.data.selectedIndices]
      const pos = selected.indexOf(idx)

      if (pos >= 0) {
        selected.splice(pos, 1)
      } else if (selected.length < this.data.pickCount) {
        selected.push(idx)
      } else {
        return
      }

      const cards = this.data.cards.map((c: any, i: number) => ({
        ...c,
        selected: selected.includes(i)
      }))
      this.setData({ cards, selectedIndices: selected })

      wx.vibrateShort({ type: 'medium' })

      if (selected.length === this.data.pickCount) {
        this.setData({ pickPhase: 'flipping' })
        this.triggerEvent('draw', { count: 1 })
      }
    },

    /** 选牌模式：依次翻开选中卡牌 — Worklet timing 编排 */
    _flipPickedCards() {
      const { selectedIndices } = this.data
      let delay = 0

      selectedIndices.forEach((idx: number) => {
        const progress = shared(0)
        progress.value = timing(1, { duration: delay + 1 }, () => {
          'worklet'
          runOnJS(this._flipOnePickCard.bind(this, idx))()
        })
        delay += 400
      })

      // 全部翻完后通知
      const doneProgress = shared(0)
      doneProgress.value = timing(1, { duration: delay + 800 }, () => {
        'worklet'
        runOnJS(this._onPickFlipDone.bind(this))()
      })
    },

    /** 翻开选牌模式中的单张卡牌 */
    _flipOnePickCard(idx: number) {
      const updated = this.data.cards.map((c: any, i: number) => ({
        ...c,
        flipped: c.flipped || i === idx
      }))
      this.setData({ cards: updated })
      wx.vibrateShort({ type: 'light' })
    },

    /** 选牌翻转完成回调 */
    _onPickFlipDone() {
      this.setData({ pickPhase: 'done' })
      this.triggerEvent('animationEnd')
    },

    /** 重置卡牌 */
    resetCards() {
      // 清理 Worklet 定时器
      if (this._entryTimer) {
        clearTimeout(this._entryTimer)
        this._entryTimer = null
      }

      /* 清除连翻状态 */
      this.setData({
        isMultiFlip: false,
        flippedCount: 0,
        totalCards: 0,
        allFlipped: false,
        cardRows: [],
        sizeClass: 'size-3',
        multiEntered: false
      })

      /* 清除选牌模式状态 */
      this.setData({
        isPickMode: false,
        pickCount: 3,
        selectedIndices: [],
        pickPhase: 'picking'
      })

      /* 恢复单抽模式或重新初始化选牌模式 */
      const cfg = this.properties.displayConfig as any
      if (cfg && cfg.total_cards && cfg.pick_count) {
        this._initPickModeCards()
      } else {
        const prizes = this.properties.prizes as any[]
        if (prizes.length > 0) {
          this._initCards(prizes)
        }
      }
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetCards()
    }
  }
})
