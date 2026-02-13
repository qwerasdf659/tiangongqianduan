/**
 * 进度条刮卡 子组件 - 横向长条刮卡，逐格揭晓
 * 支持 1/3/5/10 连抽，统一进度条形态
 * @file sub/scratch/scratch.ts
 */

interface CellData {
  index: number
  state: 'covered' | 'dissolving' | 'revealed'
  prize: any | null
}

Component({
  properties: {
    prizes: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    drawCount: { type: Number, value: 1 },
    drawResults: { type: Array, value: [] }
  },

  data: {
    cells: [] as CellData[],
    revealedCount: 0,
    scratching: false,
    allRevealed: false,
    apiCalled: false,
    pendingResults: [] as any[],
    resultsReady: false,
    revealedPrizes: [] as any[],
    showGuide: true,
    cardLeft: 0,
    cardWidth: 0,
    cellWidthPx: 0,
    /** 等待API结果的格子索引队列（放在data中确保可靠） */
    pendingCellQueue: [] as number[],
    /** 已触发溶解的格子数（用于判断是否需要自动补完） */
    dissolvedCount: 0
  },

  observers: {
    'drawCount': function (count: number) {
      this._buildCells(count || 1)
    },

    'isInProgress, drawResults': function (inProgress: boolean, results: any[]) {
      if (inProgress && results && results.length > 0 && this.data.apiCalled && !this.data.resultsReady) {
        this.setData({ pendingResults: results, resultsReady: true })
        this._flushPendingReveals()
      }
      if (!inProgress && this.data.allRevealed) {
        this.resetCard()
      }
    }
  },

  lifetimes: {
    attached() {
      this._buildCells(this.properties.drawCount || 1)
    },
    ready() {
      this._measureCard()
    }
  },

  methods: {
    _buildCells(count: number) {
      const cells: CellData[] = []
      for (let i = 0; i < count; i++) {
        cells.push({ index: i, state: 'covered', prize: null })
      }
      this.setData({ cells })
    },

    _measureCard() {
      const query = this.createSelectorQuery()
      query.select('.scratch-strip').boundingClientRect((rect: any) => {
        if (rect) {
          const count = this.data.cells.length
          this.setData({
            cardLeft: rect.left,
            cardWidth: rect.width,
            cellWidthPx: rect.width / count
          })
        }
      }).exec()
    },

    _getCellIndexByX(clientX: number): number {
      const { cardLeft, cardWidth, cellWidthPx } = this.data
      if (cellWidthPx <= 0) return -1
      const relX = clientX - cardLeft
      if (relX < 0 || relX > cardWidth) return -1
      return Math.min(Math.floor(relX / cellWidthPx), this.data.cells.length - 1)
    },

    onTouchStart(e: any) {
      if (this.data.allRevealed) return
      this.setData({ scratching: true, showGuide: false })
      const cellIndex = this._getCellIndexByX(e.touches[0].clientX)
      if (cellIndex >= 0) {
        this._tryRevealCell(cellIndex)
      }
    },

    onTouchMove(e: any) {
      if (!this.data.scratching || this.data.allRevealed) return
      const cellIndex = this._getCellIndexByX(e.touches[0].clientX)
      if (cellIndex >= 0) {
        this._tryRevealCell(cellIndex)
      }
    },

    onTouchEnd() {
      if (!this.data.scratching) return
      this.setData({ scratching: false })

      /* 只要已经开始刮（有格子进入dissolving/revealed），就自动补完剩余 */
      if (this.data.dissolvedCount > 0 && !this.data.allRevealed) {
        this._autoRevealRemaining()
      }
    },

    _tryRevealCell(cellIndex: number) {
      const cell = this.data.cells[cellIndex]
      if (!cell || cell.state !== 'covered') return

      if (!this.data.apiCalled) {
        this.setData({ apiCalled: true })
        this.triggerEvent('draw', { count: this.data.cells.length })
      }

      this.setData({
        [`cells[${cellIndex}].state`]: 'dissolving',
        dissolvedCount: this.data.dissolvedCount + 1
      })

      if (this.data.resultsReady && this.data.pendingResults[cellIndex]) {
        this._revealCellWithPrize(cellIndex)
      } else {
        /* 加入等待队列 */
        const queue = [...this.data.pendingCellQueue, cellIndex]
        this.setData({ pendingCellQueue: queue })
      }
    },

    _revealCellWithPrize(cellIndex: number) {
      const prize = this.data.pendingResults[cellIndex]
      if (!prize) return

      setTimeout(() => {
        const cells = this.data.cells
        if (!cells[cellIndex] || cells[cellIndex].state === 'revealed') return

        const revealedCount = this.data.revealedCount + 1
        const revealedPrizes = [...this.data.revealedPrizes, prize]
        const allRevealed = revealedCount >= cells.length

        this.setData({
          [`cells[${cellIndex}].state`]: 'revealed',
          [`cells[${cellIndex}].prize`]: prize,
          revealedCount,
          revealedPrizes,
          allRevealed
        })

        this._vibrate(prize)

        if (allRevealed) {
          setTimeout(() => {
            this.triggerEvent('animationEnd')
          }, 600)
        }
      }, 350)
    },

    _flushPendingReveals() {
      const queue = this.data.pendingCellQueue
      if (!queue || queue.length === 0) return
      this.setData({ pendingCellQueue: [] })
      queue.forEach((cellIndex: number) => {
        this._revealCellWithPrize(cellIndex)
      })
    },

    _autoRevealRemaining() {
      const remaining = this.data.cells
        .filter((c: CellData) => c.state === 'covered')
        .map((c: CellData) => c.index)

      remaining.forEach((cellIndex: number, i: number) => {
        setTimeout(() => {
          this._tryRevealCell(cellIndex)
        }, i * 150)
      })
    },

    _vibrate(prize: any) {
      try {
        const isRare = ['rare', 'epic', 'legendary'].includes(prize?.rarity)
        wx.vibrateShort({ type: isRare ? 'heavy' : 'light' })
      } catch (_e) { /* 静默失败 */ }
    },

    resetCard() {
      this._buildCells(this.properties.drawCount || 1)
      this.setData({
        revealedCount: 0,
        scratching: false,
        allRevealed: false,
        apiCalled: false,
        pendingResults: [],
        resultsReady: false,
        revealedPrizes: [],
        showGuide: true,
        pendingCellQueue: [],
        dissolvedCount: 0
      })
      setTimeout(() => this._measureCard(), 50)
    }
  }
})
