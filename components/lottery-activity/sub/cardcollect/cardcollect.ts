/**
 * 集卡 子组件 - 收集卡片进度展示
 * @file sub/cardcollect/cardcollect.ts
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
    /** idle / flipping / revealed */
    state: 'idle' as string,
    totalCards: 6,
    cards: [] as any[],
    collectedCount: 0,
    newCardIndex: -1
  },

  observers: {
    'prizes, displayConfig': function () {
      this._initCards()
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.state === 'flipping') {
        this._revealNewCard()
      }
    }
  },

  methods: {
    _initCards() {
      const cfg = this.properties.displayConfig as any
      const total = cfg?.total_cards_in_set || 6
      const prizes = this.properties.prizes as any[]
      const cards = Array.from({ length: total }, (_, i) => ({
        index: i,
        prize: prizes[i % prizes.length] || { name: '卡片', icon: '🃏' },
        collected: false,
        isNew: false
      }))
      // 模拟已收集部分卡片
      const preCollected = Math.floor(total * 0.4)
      for (let i = 0; i < preCollected; i++) {
        cards[i].collected = true
      }
      const collectedCount = cards.filter((c: any) => c.collected).length
      this.setData({ cards, totalCards: total, collectedCount, state: 'idle', newCardIndex: -1 })
    },

    onDraw() {
      if (this.data.state !== 'idle') return
      this.setData({ state: 'flipping' })
      this.triggerEvent('draw', { count: 1 })
    },

    _revealNewCard() {
      const cards = [...this.data.cards] as any[]
      // 找一张未收集的卡
      const uncollected = cards.filter((c: any) => !c.collected)
      let targetIndex: number
      if (uncollected.length > 0) {
        const pick = uncollected[Math.floor(Math.random() * uncollected.length)]
        targetIndex = pick.index
      } else {
        // 全部已收集，随机选一张显示重复
        targetIndex = Math.floor(Math.random() * cards.length)
      }

      cards[targetIndex].collected = true
      cards[targetIndex].isNew = true
      const collectedCount = cards.filter((c: any) => c.collected).length

      this.setData({ cards, newCardIndex: targetIndex, collectedCount, state: 'revealed' })
      setTimeout(() => this.triggerEvent('animationEnd'), 1200)
    },

    resetCards() {
      this._initCards()
    }
  }
})
