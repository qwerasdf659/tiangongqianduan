/**
 * 通用分页组件
 * 用于商品列表、交易记录等需要分页展示的场景
 * 支持上/下页切换、页码按钮、页码跳转输入
 */
Component({
  properties: {
    /** 当前页码（从1开始） */
    currentPage: {
      type: Number,
      value: 1
    },
    /** 总页数 */
    totalPages: {
      type: Number,
      value: 1
    },
    /** 总条目数 */
    totalItems: {
      type: Number,
      value: 0
    },
    /** 信息行文案（如"件商品"，拼接为"共 N 件商品"） */
    itemUnit: {
      type: String,
      value: '项'
    }
  },

  data: {
    pageInputValue: '' as string,
    /** 计算出的可见页码列表（含省略号占位） */
    visiblePages: [] as any[]
  },

  observers: {
    'currentPage, totalPages'(currentPage: number, totalPages: number) {
      this.setData({ visiblePages: this.buildVisiblePages(currentPage, totalPages) })
    }
  },

  lifetimes: {
    attached() {
      const props = this.properties as any
      this.setData({
        visiblePages: this.buildVisiblePages(props.currentPage, props.totalPages)
      })
    }
  },

  methods: {
    /**
     * 生成可见页码列表（带省略号）
     * 总页数 ≤ 7: 全部显示
     * 总页数 > 7: 首页 + 省略号 + 当前页附近 ± 2 + 省略号 + 尾页
     */
    buildVisiblePages(current: number, total: number): any[] {
      if (total <= 7) {
        return Array.from({ length: total }, (_, i) => ({ page: i + 1, type: 'page' }))
      }
      const pageItems: any[] = [{ page: 1, type: 'page' }]
      if (current > 4) {
        pageItems.push({ type: 'ellipsis' })
      }
      const rangeStart = Math.max(2, current - 2)
      const rangeEnd = Math.min(total - 1, current + 2)
      for (let pageNum = rangeStart; pageNum <= rangeEnd; pageNum++) {
        pageItems.push({ page: pageNum, type: 'page' })
      }
      if (current < total - 3) {
        pageItems.push({ type: 'ellipsis' })
      }
      if (total > 1) {
        pageItems.push({ page: total, type: 'page' })
      }
      return pageItems
    },

    onPrevPage() {
      if ((this.properties as any).currentPage <= 1) {
        return
      }
      this.triggerEvent('pagechange', { page: (this.properties as any).currentPage - 1 })
    },

    onNextPage() {
      const props = this.properties as any
      if (props.currentPage >= props.totalPages) {
        return
      }
      this.triggerEvent('pagechange', { page: props.currentPage + 1 })
    },

    /** 点击页码按钮 */
    onPageTap(e: WechatMiniprogram.BaseEvent) {
      const targetPage = e.currentTarget.dataset.page as number
      if (targetPage !== (this.properties as any).currentPage) {
        this.triggerEvent('pagechange', { page: targetPage })
      }
    },

    onPageInputChange(e: WechatMiniprogram.Input) {
      this.setData({ pageInputValue: e.detail.value })
    },

    onPageInputConfirm() {
      const inputVal = parseInt((this.data as any).pageInputValue, 10)
      const props = this.properties as any
      if (isNaN(inputVal) || inputVal < 1 || inputVal > props.totalPages) {
        this.setData({ pageInputValue: '' })
        return
      }
      if (inputVal !== props.currentPage) {
        this.triggerEvent('pagechange', { page: inputVal })
      }
      this.setData({ pageInputValue: '' })
    }
  }
})
