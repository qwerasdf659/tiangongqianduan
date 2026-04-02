/**
 * 飞入动画浮动层组件
 *
 * 使用方式：
 *   调用 fly({ startX, startY, endX, endY, color, size }) 触发动画
 *   动画结束后自动隐藏并触发 complete 事件
 */
Component({
  data: {
    show: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    color: '#999',
    size: 30,
    animData: null as any
  },

  methods: {
    /**
     * 触发飞入动画
     */
    fly(params: {
      startX: number
      startY: number
      endX: number
      endY: number
      color?: string
      size?: number
    }) {
      this.setData({
        show: true,
        startX: params.startX,
        startY: params.startY,
        endX: params.endX,
        endY: params.endY,
        color: params.color || '#999',
        size: params.size || 30
      })

      // 动画结束后销毁
      setTimeout(() => {
        this.setData({ show: false })
        this.triggerEvent('complete')
      }, 380)
    }
  }
})
