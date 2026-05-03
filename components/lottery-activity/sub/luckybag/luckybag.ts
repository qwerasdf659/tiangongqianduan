/**
 * 福袋 子组件 - 参考砸金蛋模式
 * 单开/三连开：3个福袋选1个
 * 五连开：5个福袋一排，逐个拆开
 * 十连开：两排各5个，逐个拆开
 * @file sub/luckybag/luckybag.ts
 */

const DEFAULT_BAG_COUNT = 3

/** 生成浮动装饰粒子 */
function generateParticles(): any[] {
  const icons = ['✨', '🧧', '🎁', '💰', '🎀', '🌟', '💫', '🪙']
  const particles: any[] = []
  for (let i = 0; i < 8; i++) {
    particles.push({
      id: i,
      icon: icons[i % icons.length],
      left: Math.floor(Math.random() * 90) + 5,
      delay: (Math.random() * 4).toFixed(1),
      duration: (3 + Math.random() * 3).toFixed(1),
      size: Math.floor(20 + Math.random() * 20)
    })
  }
  return particles
}

const prizeImageBehavior = require('../../shared/prize-image-behavior')

Component({
  behaviors: [prizeImageBehavior],

  properties: {
    prizes: { type: Array, value: [] },
    prizesForPreview: { type: Array, value: [] },
    costPoints: { type: Number, value: 0 },
    pointsBalance: { type: Number, value: 0 },
    isInProgress: { type: Boolean, value: false },
    effectTheme: { type: String, value: 'default' },
    rarityEffects: { type: Boolean, value: false },
    winAnimation: { type: String, value: 'simple' },
    displayConfig: { type: Object, value: {} },
    /** 连开个数（0=单开模式，3选1） */
    multiDrawCount: { type: Number, value: 0 },
    /** 连开结果数组（API返回的奖品） */
    multiDrawResults: { type: Array, value: [] }
  },

  data: {
    /* ===== 单开模式（3选1） ===== */
    bags: [] as Array<{ id: number; shaking: boolean; opened: boolean }>,
    selectedBag: -1,
    canSelect: true,
    showFlash: false,
    particles: [] as any[],

    /* ===== 连开模式 ===== */
    isMultiOpen: false,
    openedCount: 0,
    totalBags: 0,
    allOpened: false,
    bagRows: [] as any[][],
    sizeClass: 'size-3',
    multiEntered: false
  },

  lifetimes: {
    attached() {
      this._initBags()
      this.setData({ particles: generateParticles() })
    }
  },

  observers: {
    isInProgress(val: boolean) {
      if (this.data.isMultiOpen) {
        return
      }
      if (val && this.data.selectedBag >= 0) {
        this._openBag()
      }
    },
    'multiDrawCount, multiDrawResults'(count: number, results: any[]) {
      if (count > 0 && results && results.length > 0) {
        this._initMultiOpen(count, results)
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

    /* ===== 单开模式（3选1） ===== */

    _initBags() {
      const bags = []
      for (let i = 0; i < DEFAULT_BAG_COUNT; i++) {
        bags.push({ id: i, shaking: false, opened: false })
      }
      this.setData({ bags, selectedBag: -1, canSelect: true, showFlash: false })
    },

    onTapBag(e: any) {
      if (!this.data.canSelect) {
        return
      }
      const bagId = e.currentTarget.dataset.id
      if (bagId === undefined || bagId === null) {
        return
      }

      try {
        wx.vibrateShort({ type: 'light' })
      } catch (_e) {
        /* */
      }
      this.setData({ selectedBag: bagId, canSelect: false })

      const bags = this.data.bags.map((bag: any) => ({
        ...bag,
        shaking: bag.id === bagId
      }))
      this.setData({ bags })

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

    _openBag() {
      const { selectedBag, bags } = this.data
      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* */
      }

      this.setData({ showFlash: true })
      setTimeout(() => {
        this.setData({ showFlash: false })
      }, 200)

      const updatedBags = bags.map((bag: any) => ({
        ...bag,
        shaking: false,
        opened: bag.id === selectedBag
      }))
      this.setData({ bags: updatedBags })

      setTimeout(() => {
        this.triggerEvent('animationEnd')
      }, 1600)
    },

    /* ===== 连开模式 ===== */

    _initMultiOpen(count: number, results: any[]) {
      const bagList = results.map((prize: any, i: number) => ({
        ...prize,
        index: i,
        opened: false,
        shaking: false,
        enterDelay: i * 80
      }))

      const sizeClass = count <= 3 ? 'size-3' : count <= 5 ? 'size-5' : 'size-10'
      const bagRows = this._buildRows(bagList, count)

      this.setData({
        isMultiOpen: true,
        openedCount: 0,
        totalBags: bagList.length,
        allOpened: false,
        bagRows,
        sizeClass,
        multiEntered: false,
        showFlash: false
      })

      setTimeout(() => {
        this.setData({ multiEntered: true })
      }, 50)
    },

    _buildRows(bags: any[], count: number): any[][] {
      if (count <= 5) {
        return [bags]
      }
      return [bags.slice(0, 5), bags.slice(5)]
    },

    /** 连开模式：点击单个福袋 */
    onTapMultiBag(e: any) {
      const rowIdx = e.currentTarget.dataset.row
      const colIdx = e.currentTarget.dataset.col
      const bagRows = this.data.bagRows
      const bag = bagRows[rowIdx][colIdx]
      if (bag.opened) {
        return
      }

      try {
        wx.vibrateShort({ type: 'medium' })
      } catch (_e) {
        /* */
      }

      bagRows[rowIdx][colIdx] = { ...bag, shaking: true }
      this.setData({ bagRows })

      setTimeout(() => {
        const rows = this.data.bagRows
        rows[rowIdx][colIdx] = { ...rows[rowIdx][colIdx], shaking: false, opened: true }
        const openedCount = this.data.openedCount + 1
        const allOpened = openedCount >= this.data.totalBags

        try {
          wx.vibrateShort({ type: 'heavy' })
        } catch (_e) {
          /* */
        }
        this.setData({ bagRows: rows, openedCount, allOpened, showFlash: true })
        setTimeout(() => {
          this.setData({ showFlash: false })
        }, 150)

        if (allOpened) {
          setTimeout(() => {
            this.triggerEvent('animationEnd')
          }, 800)
        }
      }, 600)
    },

    /** 一键全部拆开 */
    onOpenAll() {
      const bagRows = this.data.bagRows
      let delay = 0

      for (let r = 0; r < bagRows.length; r++) {
        for (let c = 0; c < bagRows[r].length; c++) {
          if (!bagRows[r][c].opened) {
            ;((row, col, d) => {
              setTimeout(() => {
                const rows = this.data.bagRows
                rows[row][col] = { ...rows[row][col], shaking: true }
                this.setData({ bagRows: rows })
              }, d)

              setTimeout(() => {
                const rows = this.data.bagRows
                rows[row][col] = { ...rows[row][col], shaking: false, opened: true }
                const count = this.data.openedCount + 1
                const all = count >= this.data.totalBags
                this.setData({ bagRows: rows, openedCount: count, allOpened: all, showFlash: true })
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
    resetBag() {
      this.setData({
        isMultiOpen: false,
        openedCount: 0,
        totalBags: 0,
        allOpened: false,
        bagRows: [],
        sizeClass: 'size-3',
        multiEntered: false
      })
      this._initBags()
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetBag()
    }
  }
})
