/**
 * exchange-pager 通用页码翻页栏组件（主包共享，全分包可引用）
 *
 * 业务定位：在列表（无限滚动）之上，额外提供「页码翻页 + 跳转指定页」能力，
 *           满足用户精确定位某一页的需求。
 *
 * 设计要点：
 *   - 单一来源：放在主包 components/，商品兑换 / 道具商城 / 我的订单 / 我的售后 /
 *               积分明细 / 积分活动记录 / 我的仓库 / 以物易物 等全分包共用，避免重复实现。
 *   - 受控组件：currentPage / totalPages 由父组件下传（以后端 pagination 为权威），
 *               本组件不自行计算业务分页，只负责交互与边界校验。
 *   - 事件契约：用户点上一页/下一页/跳转时，triggerEvent('pagechange', { page })，
 *               由父组件调用各自的「替换式加载」拉取目标页。
 *
 * @file components/exchange-pager/exchange-pager.ts
 * @version 2.0.0
 * @since 2026-06-13（从 packageExchange 迁移至主包，供全分包共享）
 */

Component({
  properties: {
    /** 当前页码（1 基，由父组件以后端 pagination.page 为权威下传） */
    currentPage: { type: Number, value: 1 },
    /** 总页数（由父组件以后端 pagination.total_pages 为权威下传） */
    totalPages: { type: Number, value: 1 }
  },

  data: {
    /** 跳转输入框的当前值（仅 UI 临时状态，不参与业务） */
    jumpValue: ''
  },

  methods: {
    /** 上一页：已在第一页则不动作 */
    onPrev() {
      const { currentPage } = this.properties
      if (currentPage <= 1) {
        return
      }
      this.triggerEvent('pagechange', { page: currentPage - 1 })
    },

    /** 下一页：已在末页则不动作 */
    onNext() {
      const { currentPage, totalPages } = this.properties
      if (currentPage >= totalPages) {
        return
      }
      this.triggerEvent('pagechange', { page: currentPage + 1 })
    },

    /** 跳转输入框输入：仅缓存到本地 UI 状态 */
    onJumpInput(e: any) {
      this.setData({ jumpValue: e.detail.value })
    },

    /**
     * 确认跳转：将输入值规整到 [1, totalPages] 合法区间后派发事件。
     * 空输入或非法值不动作；与当前页相同则不重复请求。
     */
    onJumpConfirm() {
      const { totalPages, currentPage } = this.properties
      const raw = parseInt(this.data.jumpValue, 10)
      if (isNaN(raw)) {
        this.setData({ jumpValue: '' })
        return
      }
      const target = Math.min(Math.max(raw, 1), totalPages)
      this.setData({ jumpValue: '' })
      if (target === currentPage) {
        return
      }
      this.triggerEvent('pagechange', { page: target })
    }
  }
})
