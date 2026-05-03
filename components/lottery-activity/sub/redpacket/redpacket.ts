/**
 * 拆红包 子组件（Skyline Worklet 优化版）
 *
 * @description 支持单拆（3选1）和连拆（N个逐个拆开）两种模式。
 *   单拆: 3个红包选1个 → 触发抽奖API → 播放拆开动画 → 通知父组件
 *   连拆: 父组件传入结果 → 展示N个红包 → 逐个/全部拆开 → 通知父组件
 *
 * 优化点：
 *   - 连拆 onOpenAll 批量操作改为合并 setData，减少高频调用
 *   - 微小延迟用 wx.nextTick 替代 setTimeout
 *
 * @file sub/redpacket/redpacket.ts
 */

/** 默认红包数量（单拆模式） */
const DEFAULT_PACKET_COUNT = 3
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
    /** 连拆个数（0=单拆模式） */
    multiDrawCount: { type: Number, value: 0 },
    /** 连拆结果数组（API返回的奖品） */
    multiDrawResults: { type: Array, value: [] }
  },

  data: {
    /* ===== 单拆模式 ===== */
    packets: [] as Array<{ id: number; shaking: boolean; opened: boolean }>,
    selectedPacket: -1,
    canSelect: true,

    /* ===== 连拆模式 ===== */
    isMultiOpen: false,
    openedCount: 0,
    totalPackets: 0,
    allOpened: false,
    /** 行布局数组 */
    packetRows: [] as any[][],
    /** 尺寸class：size-3 / size-5 / size-10 */
    sizeClass: 'size-3',
    /** 连拆入场动画 */
    multiEntered: false
  },

  lifetimes: {
    attached() {
      this._initPackets()
    }
  },

  observers: {
    isInProgress(val: boolean) {
      if (this.data.isMultiOpen) {
        return
      }
      if (val && this.data.selectedPacket >= 0) {
        this._openSelectedPacket()
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

    /* ===== 单拆模式 ===== */

    _initPackets() {
      const packets = []
      for (let i = 0; i < DEFAULT_PACKET_COUNT; i++) {
        packets.push({ id: i, shaking: false, opened: false })
      }
      this.setData({ packets, selectedPacket: -1, canSelect: true })
    },

    /** 选择一个红包 */
    onTapPacket(e: any) {
      if (!this.data.canSelect) {
        return
      }
      const id = e.currentTarget.dataset.id
      if (id === undefined || id === null) {
        return
      }

      try {
        wx.vibrateShort({ type: 'light' })
      } catch (_e) {
        /* */
      }
      this.setData({ selectedPacket: id, canSelect: false })

      const packets = this.data.packets.map((p: any) => ({
        ...p,
        shaking: p.id === id
      }))
      this.setData({ packets })

      setTimeout(() => {
        this.triggerEvent('draw', { count: 1 })
      }, 600)
    },

    /** 拆开选中的红包 */
    _openSelectedPacket() {
      const { selectedPacket, packets } = this.data
      try {
        wx.vibrateShort({ type: 'heavy' })
      } catch (_e) {
        /* */
      }

      const updated = packets.map((p: any) => ({
        ...p,
        shaking: false,
        opened: p.id === selectedPacket
      }))
      this.setData({ packets: updated })

      setTimeout(() => {
        this.triggerEvent('animationEnd')
      }, 1200)
    },

    /* ===== 连拆模式 ===== */

    _initMultiOpen(count: number, results: any[]) {
      const list = results.map((prize: any, i: number) => ({
        ...prize,
        index: i,
        opened: false,
        shaking: false,
        enterDelay: i * 80
      }))

      const sizeClass = count <= 3 ? 'size-3' : count <= 5 ? 'size-5' : 'size-10'
      const packetRows = this._buildRows(list, count)

      this.setData({
        isMultiOpen: true,
        openedCount: 0,
        totalPackets: list.length,
        allOpened: false,
        packetRows,
        sizeClass,
        multiEntered: false
      })

      /* 入场动画：用 wx.nextTick 替代 setTimeout(50ms)，减少不必要的延迟 */
      wx.nextTick(() => {
        this.setData({ multiEntered: true })
      })
    },

    /** 按布局规则分行：3→1排，5→1排，10→上5下5 */
    _buildRows(packets: any[], count: number): any[][] {
      if (count <= 5) {
        return [packets]
      }
      return [packets.slice(0, 5), packets.slice(5)]
    },

    /** 连拆模式：点击单个红包 */
    onTapMultiPacket(e: any) {
      const rowIdx = e.currentTarget.dataset.row
      const colIdx = e.currentTarget.dataset.col
      const packetRows = this.data.packetRows
      const packet = packetRows[rowIdx][colIdx]
      if (packet.opened) {
        return
      }

      try {
        wx.vibrateShort({ type: 'medium' })
      } catch (_e) {
        /* */
      }

      /* 先晃动 */
      packetRows[rowIdx][colIdx] = { ...packet, shaking: true }
      this.setData({ packetRows })

      /* 晃动后拆开 */
      setTimeout(() => {
        const rows = this.data.packetRows
        rows[rowIdx][colIdx] = { ...rows[rowIdx][colIdx], shaking: false, opened: true }
        const openedCount = this.data.openedCount + 1
        const allOpened = openedCount >= this.data.totalPackets

        try {
          wx.vibrateShort({ type: 'heavy' })
        } catch (_e) {
          /* */
        }
        this.setData({ packetRows: rows, openedCount, allOpened })

        if (allOpened) {
          setTimeout(() => {
            this.triggerEvent('animationEnd')
          }, 800)
        }
      }, 500)
    },

    /**
     * 一键全部拆开（Skyline 优化版）
     * 优化：将每个红包的 shaking→opened 两步合并为批量 setData，
     * 每批只触发 2 次 setData（晃动 + 拆开），大幅减少渲染压力
     */
    onOpenAll() {
      const packetRows = this.data.packetRows
      /* 收集所有未拆开的红包坐标 */
      const pending: Array<{ row: number; col: number }> = []
      for (let r = 0; r < packetRows.length; r++) {
        for (let c = 0; c < packetRows[r].length; c++) {
          if (!packetRows[r][c].opened) {
            pending.push({ row: r, col: c })
          }
        }
      }
      if (pending.length === 0) {
        return
      }

      let batchIdx = 0
      const batchSize = 3
      const batchInterval = 300

      const processBatch = () => {
        const start = batchIdx * batchSize
        const batch = pending.slice(start, start + batchSize)
        if (batch.length === 0) {
          return
        }

        /* 第一步：批量设置晃动 */
        const rows = this.data.packetRows
        batch.forEach(({ row, col }) => {
          rows[row][col] = { ...rows[row][col], shaking: true }
        })
        this.setData({ packetRows: rows })

        /* 第二步：批量拆开 */
        setTimeout(() => {
          const rows2 = this.data.packetRows
          batch.forEach(({ row, col }) => {
            rows2[row][col] = { ...rows2[row][col], shaking: false, opened: true }
          })
          const count = this.data.openedCount + batch.length
          const all = count >= this.data.totalPackets
          this.setData({ packetRows: rows2, openedCount: count, allOpened: all })

          try {
            wx.vibrateShort({ type: 'light' })
          } catch (_e) {
            /* */
          }

          if (all) {
            setTimeout(() => {
              this.triggerEvent('animationEnd')
            }, 800)
          } else {
            batchIdx++
            setTimeout(processBatch, batchInterval)
          }
        }, 400)
      }

      processBatch()
    },

    /** 重置 */
    resetPacket() {
      this.setData({
        isMultiOpen: false,
        openedCount: 0,
        totalPackets: 0,
        allOpened: false,
        packetRows: [],
        sizeClass: 'size-3',
        multiEntered: false
      })
      this._initPackets()
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetPacket()
    }
  }
})
