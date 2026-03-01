/**
 * 砸金蛋 子组件
 *
 * @description 支持单敲（3选1）和连敲（N个逐个砸开）两种模式。
 *   单敲: 选蛋 → 触发抽奖API → 播放砸蛋动画 → 通知父组件动画结束
 *   连敲: 父组件传入结果 → 展示N个蛋 → 逐个/全部砸开 → 通知父组件
 *
 * @file sub/egg/egg.ts
 */

/** 默认金蛋数量（单敲模式） */
const DEFAULT_EGG_COUNT = 3

Component({
  properties: {
    prizes: { type: Array, value: [] },
    prizesForPreview: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    /** 连敲个数（0=单敲模式） */
    multiDrawCount: { type: Number, value: 0 },
    /** 连敲结果数组（API返回的奖品） */
    multiDrawResults: { type: Array, value: [] }
  },

  data: {
    /* ===== 单敲模式 ===== */
    eggs: [] as Array<{ id: number; shaking: boolean; cracked: boolean }>,
    selectedEgg: -1,
    canSelect: true,
    showFlash: false,

    /* ===== 连敲模式 ===== */
    isMultiSmash: false,
    crackedCount: 0,
    totalEggs: 0,
    allCracked: false,
    /** 行布局数组 */
    eggRows: [] as any[][],
    /** 尺寸class：size-3 / size-5 / size-10 */
    sizeClass: 'size-3',
    /** 连敲入场动画 */
    multiEntered: false
  },

  lifetimes: {
    attached() {
      this._initEggs()
    }
  },

  observers: {
    isInProgress(val: boolean) {
      if (this.data.isMultiSmash) {
        return
      }
      if (val && this.data.selectedEgg >= 0) {
        this._crackEgg()
      }
    },
    'multiDrawCount, multiDrawResults'(count: number, results: any[]) {
      if (count > 0 && results && results.length > 0) {
        this._initMultiSmash(count, results)
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

    /* ===== 单敲模式 ===== */

    _initEggs() {
      const eggs = []
      for (let i = 0; i < DEFAULT_EGG_COUNT; i++) {
        eggs.push({ id: i, shaking: false, cracked: false })
      }
      this.setData({ eggs, selectedEgg: -1, canSelect: true, showFlash: false })
    },

    onTapEgg(e: any) {
      if (!this.data.canSelect) {
        return
      }
      const eggId = e.currentTarget.dataset.id
      if (eggId === undefined || eggId === null) {
        return
      }

      try {
        wx.vibrateShort({ type: 'light' })
      } catch (_e) {
        /* */
      }
      this.setData({ selectedEgg: eggId, canSelect: false })

      const eggs = this.data.eggs.map((egg: any) => ({
        ...egg,
        shaking: egg.id === eggId
      }))
      this.setData({ eggs })

      setTimeout(() => {
        try {
          wx.vibrateShort({ type: 'medium' })
        } catch (_e) {
          /* */
        }
      }, 400)

      setTimeout(() => {
        this.triggerEvent('draw', { count: 1 })
      }, 900)
    },

    _crackEgg() {
      const { selectedEgg, eggs } = this.data
      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* */
      }

      this.setData({ showFlash: true })
      setTimeout(() => {
        this.setData({ showFlash: false })
      }, 200)

      const updatedEggs = eggs.map((egg: any) => ({
        ...egg,
        shaking: false,
        cracked: egg.id === selectedEgg
      }))
      this.setData({ eggs: updatedEggs })

      setTimeout(() => {
        this.triggerEvent('animationEnd')
      }, 1600)
    },

    /* ===== 连敲模式 ===== */

    _initMultiSmash(count: number, results: any[]) {
      const eggList = results.map((prize: any, i: number) => ({
        ...prize,
        index: i,
        cracked: false,
        shaking: false,
        enterDelay: i * 80
      }))

      const sizeClass = count <= 3 ? 'size-3' : count <= 5 ? 'size-5' : 'size-10'
      const eggRows = this._buildRows(eggList, count)

      this.setData({
        isMultiSmash: true,
        crackedCount: 0,
        totalEggs: eggList.length,
        allCracked: false,
        eggRows,
        sizeClass,
        multiEntered: false,
        showFlash: false
      })

      setTimeout(() => {
        this.setData({ multiEntered: true })
      }, 50)
    },

    /** 按布局规则分行：3→1排，5→1排，10→上5下5 */
    _buildRows(eggs: any[], count: number): any[][] {
      if (count <= 5) {
        return [eggs]
      }
      return [eggs.slice(0, 5), eggs.slice(5)]
    },

    /** 连敲模式：点击单个蛋 */
    onTapMultiEgg(e: any) {
      const rowIdx = e.currentTarget.dataset.row
      const colIdx = e.currentTarget.dataset.col
      const eggRows = this.data.eggRows
      const egg = eggRows[rowIdx][colIdx]
      if (egg.cracked) {
        return
      }

      try {
        wx.vibrateShort({ type: 'medium' })
      } catch (_e) {
        /* */
      }

      /* 先晃动 */
      eggRows[rowIdx][colIdx] = { ...egg, shaking: true }
      this.setData({ eggRows })

      /* 晃动后砸碎 */
      setTimeout(() => {
        const rows = this.data.eggRows
        rows[rowIdx][colIdx] = { ...rows[rowIdx][colIdx], shaking: false, cracked: true }
        const crackedCount = this.data.crackedCount + 1
        const allCracked = crackedCount >= this.data.totalEggs

        try {
          wx.vibrateShort({ type: 'heavy' })
        } catch (_e) {
          /* */
        }
        this.setData({ eggRows: rows, crackedCount, allCracked, showFlash: true })
        setTimeout(() => {
          this.setData({ showFlash: false })
        }, 150)

        if (allCracked) {
          setTimeout(() => {
            this.triggerEvent('animationEnd')
          }, 800)
        }
      }, 600)
    },

    /** 一键全部砸开 */
    onSmashAll() {
      const eggRows = this.data.eggRows
      let delay = 0

      for (let r = 0; r < eggRows.length; r++) {
        for (let c = 0; c < eggRows[r].length; c++) {
          if (!eggRows[r][c].cracked) {
            ;((row, col, d) => {
              /* 先晃动 */
              setTimeout(() => {
                const rows = this.data.eggRows
                rows[row][col] = { ...rows[row][col], shaking: true }
                this.setData({ eggRows: rows })
              }, d)

              /* 再砸碎 */
              setTimeout(() => {
                const rows = this.data.eggRows
                rows[row][col] = { ...rows[row][col], shaking: false, cracked: true }
                const count = this.data.crackedCount + 1
                const all = count >= this.data.totalEggs
                this.setData({
                  eggRows: rows,
                  crackedCount: count,
                  allCracked: all,
                  showFlash: true
                })
                setTimeout(() => {
                  this.setData({ showFlash: false })
                }, 100)
                try {
                  wx.vibrateShort({ type: 'light' })
                } catch (_e) {
                  /* */
                }

                if (all) {
                  setTimeout(() => {
                    this.triggerEvent('animationEnd')
                  }, 800)
                }
              }, d + 400)
            })(r, c, delay)
            delay += 300
          }
        }
      }
    },

    /** 重置 */
    resetEggs() {
      this.setData({
        isMultiSmash: false,
        crackedCount: 0,
        totalEggs: 0,
        allCracked: false,
        eggRows: [],
        sizeClass: 'size-3',
        multiEntered: false
      })
      this._initEggs()
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetEggs()
    }
  }
})
