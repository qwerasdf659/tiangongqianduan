/**
 * 通用筛选器组件 — 商品兑换/交易市场共用
 *
 * Properties 接口驱动：接收后端下发的筛选选项，通知父组件筛选变更
 * bind:filterchange → { keyword, filter, category, costRange, stockStatus, sortBy }
 *
 * @file packageExchange/shared/exchange-filter/exchange-filter.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

Component({
  properties: {
    /** 筛选器类型 'lucky'|'premium'|'market' */
    filterType: { type: String, value: 'lucky' },
    /** 基础筛选项 [{value, label}] */
    basicFilters: { type: Array, value: [] },
    /** 分类选项 [{value, label}] */
    categoryOptions: { type: Array, value: [] },
    /** 价格区间选项 [{label, min, max}] */
    costRangeOptions: { type: Array, value: [] },
    /** 库存状态选项 [{value, label}] */
    stockStatusOptions: { type: Array, value: [] },
    /** 排序方式选项 [{value, label}] */
    sortByOptions: { type: Array, value: [] },
    /** 当前选中的筛选条件 */
    currentFilter: { type: String, value: 'all' },
    /** 当前搜索词 */
    searchKeyword: { type: String, value: '' }
  },

  data: {
    showAdvanced: false
  },

  methods: {
    onSearchInput(e: any) {
      this.triggerEvent('filterchange', { type: 'search', value: e.detail.value.trim() })
    },

    onFilterTap(e: any) {
      this.triggerEvent('filterchange', { type: 'basic', value: e.currentTarget.dataset.filter })
    },

    onToggleAdvanced() {
      this.setData({ showAdvanced: !this.data.showAdvanced })
    },

    onCategoryTap(e: any) {
      this.triggerEvent('filterchange', {
        type: 'category',
        value: e.currentTarget.dataset.category
      })
    },

    onCostRangeTap(e: any) {
      this.triggerEvent('filterchange', {
        type: 'costRange',
        value: Number(e.currentTarget.dataset.index)
      })
    },

    onStockStatusTap(e: any) {
      this.triggerEvent('filterchange', {
        type: 'stockStatus',
        value: e.currentTarget.dataset.status
      })
    },

    onSortTap(e: any) {
      this.triggerEvent('filterchange', { type: 'sort', value: e.currentTarget.dataset.sort })
    },

    onReset() {
      this.triggerEvent('filterchange', { type: 'reset' })
    }
  }
})

export {}
