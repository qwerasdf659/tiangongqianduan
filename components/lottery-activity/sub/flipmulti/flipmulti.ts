/**
 * 翻牌 子组件 - 9张牌选3张翻转
 * @file sub/flipmulti/flipmulti.ts
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
    cards: [] as any[],
    totalCards: 9,
    pickCount: 3,
    selectedIndices: [] as number[],
    flippedIndices: [] as number[],
    phase: 'picking' as 'picking' | 'flipping' | 'done'
  },

  observers: {
    'prizes, displayConfig': function () {
      this._initCards()
    },
    'isInProgress': function (val: boolean) {
      if (val && this.data.phase === 'flipping') {
        this._flipSelected()
      }
    }
  },

  methods: {
    _initCards() {
      const cfg = this.properties.displayConfig as any
      const total = cfg?.total_cards || 9
      const pick = cfg?.pick_count || 3
      const prizes = this.properties.prizes as any[]
      const cards = Array.from({ length: total }, (_, i) => ({
        index: i,
        prize: prizes[i % prizes.length] || { name: '奖品', icon: '🎁' },
        flipped: false,
        selected: false
      }))
      this.setData({ cards, totalCards: total, pickCount: pick, selectedIndices: [], flippedIndices: [], phase: 'picking' })
    },

    onTapCard(e: any) {
      if (this.data.phase !== 'picking') return
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

      if (selected.length === this.data.pickCount) {
        this.setData({ phase: 'flipping' })
        this.triggerEvent('draw', { count: 1 })
      }
    },

    _flipSelected() {
      const { selectedIndices, cards } = this.data
      let delay = 0
      selectedIndices.forEach((idx: number) => {
        setTimeout(() => {
          const updated = this.data.cards.map((c: any, i: number) => ({
            ...c,
            flipped: c.flipped || i === idx
          }))
          this.setData({ cards: updated })
        }, delay)
        delay += 400
      })

      setTimeout(() => {
        this.setData({ phase: 'done' })
        this.triggerEvent('animationEnd')
      }, delay + 800)
    },

    resetCards() {
      this._initCards()
    }
  }
})
