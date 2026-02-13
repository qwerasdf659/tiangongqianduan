/**
 * 卡牌翻转 子组件 - 3张卡牌选1张翻转（增强动效版）
 * 支持单抽（3选1）和连翻（N张逐张翻开）两种模式
 * @file sub/card/card.ts
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
    /** 连翻张数（0=单抽模式） */
    multiDrawCount: { type: Number, value: 0 },
    /** 连翻结果数组（API返回的奖品） */
    multiDrawResults: { type: Array, value: [] }
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
    multiEntered: false
  },

  observers: {
    'prizes': function (prizes: any[]) {
      if (this.data.isMultiFlip) return
      if (prizes && prizes.length > 0) {
        this._initCards(prizes)
      }
    },
    'isInProgress': function (val: boolean) {
      if (this.data.isMultiFlip) return
      if (val && this.data.selectedIndex >= 0) {
        this._flipCard()
      }
      /* 抽奖失败/取消时，isInProgress 从外部变回 false，重置卡牌 */
      if (!val && this.data.waiting) {
        this.setData({ selectedIndex: -1, canSelect: true, waiting: false })
      }
    },
    'multiDrawCount, multiDrawResults': function (count: number, results: any[]) {
      if (count > 0 && results && results.length > 0) {
        this._initMultiFlipCards(count, results)
      }
    }
  },

  methods: {
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

      /* 交错入场：每张卡牌依次出现，全部入场后才可选择 */
      setTimeout(() => {
        this.setData({ entered: true })
      }, 50)

      /* 入场动画结束后开放选择 */
      setTimeout(() => {
        this.setData({ canSelect: true })
      }, 50 + cards.length * 150 + 500)
    },

    /** 选择卡牌 - 单抽模式 */
    onSelectCard(e: any) {
      if (!this.data.canSelect || this.data.flipped) return
      const index = e.currentTarget.dataset.index
      this.setData({ selectedIndex: index, canSelect: false, waiting: true })

      /* 触觉反馈 */
      wx.vibrateShort({ type: 'medium' })

      /* 触发抽奖 */
      this.triggerEvent('draw', { count: 1 })
    },

    /** 翻转选中的卡牌 - 单抽模式 */
    _flipCard() {
      const { selectedIndex, cards } = this.data
      if (selectedIndex < 0) return

      /* 第一步：翻转选中卡牌 */
      const step1 = cards.map((c: any, i: number) => ({
        ...c,
        flipped: i === selectedIndex
      }))
      this.setData({ cards: step1, flipped: true, waiting: false })

      /* 翻转完成后显示光晕 + 震动 */
      setTimeout(() => {
        this.setData({ showGlow: true })
        wx.vibrateShort({ type: 'heavy' })
      }, 800)

      /* 第二步：延迟翻开其他卡牌（揭晓它们背后的奖品） */
      setTimeout(() => {
        const allFlipped = cards.map((c: any) => ({ ...c, flipped: true }))
        this.setData({ cards: allFlipped })
      }, 1200)

      /* 动画全部结束后通知父组件 */
      setTimeout(() => {
        this.triggerEvent('animationEnd')
      }, 2200)
    },

    /* ===== 连翻模式方法 ===== */

    /** 初始化连翻卡牌 */
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

      /* 入场动画 */
      setTimeout(() => {
        this.setData({ multiEntered: true })
      }, 50)
    },

    /** 按布局规则分行：3→1排，5→1排，10→上5下5 */
    _buildRows(cards: any[], count: number): any[][] {
      if (count <= 5) {
        return [cards]
      }
      /* 10张：上5下5 */
      return [cards.slice(0, 5), cards.slice(5)]
    },

    /** 逐张点击翻开 */
    onTapMultiCard(e: any) {
      const rowIdx = e.currentTarget.dataset.row
      const colIdx = e.currentTarget.dataset.col
      const cardRows = this.data.cardRows
      const card = cardRows[rowIdx][colIdx]

      if (card.flipped) return

      /* 翻开这张卡 */
      cardRows[rowIdx][colIdx] = { ...card, flipped: true }
      const flippedCount = this.data.flippedCount + 1
      const allFlipped = flippedCount >= this.data.totalCards

      this.setData({
        cardRows,
        flippedCount,
        allFlipped
      })

      /* 触觉反馈 */
      wx.vibrateShort({ type: 'medium' })

      /* 全部翻完后通知父组件 */
      if (allFlipped) {
        setTimeout(() => {
          this.triggerEvent('animationEnd')
        }, 800)
      }
    },

    /** 一键全部翻开 */
    onFlipAll() {
      const cardRows = this.data.cardRows
      let delay = 0

      for (let r = 0; r < cardRows.length; r++) {
        for (let c = 0; c < cardRows[r].length; c++) {
          if (!cardRows[r][c].flipped) {
            /* 逐张翻开，间隔150ms */
            ((row, col, d) => {
              setTimeout(() => {
                const rows = this.data.cardRows
                rows[row][col] = { ...rows[row][col], flipped: true }
                const count = this.data.flippedCount + 1
                const all = count >= this.data.totalCards
                this.setData({ cardRows: rows, flippedCount: count, allFlipped: all })
                wx.vibrateShort({ type: 'light' })

                if (all) {
                  setTimeout(() => {
                    this.triggerEvent('animationEnd')
                  }, 800)
                }
              }, d)
            })(r, c, delay)
            delay += 150
          }
        }
      }
    },

    /** 重置卡牌 */
    resetCards() {
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

      /* 恢复单抽模式 */
      const prizes = this.properties.prizes as any[]
      if (prizes.length > 0) {
        this._initCards(prizes)
      }
    }
  }
})
