/**
 * 飞入动画浮动层组件
 *
 * 使用方式：
 *   调用 fly({ startX, startY, endX, endY, imageUrl, color, size }) 触发动画
 *   材料图片从起点（材料卡片位置）飞入终点（工作台锚点位置）
 *   动画结束后自动隐藏并触发 complete 事件
 */
Component({
  data: {
    show: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
    imageUrl: '',
    color: '#999',
    size: 40,
    animData: null as any
  },

  methods: {
    /**
     * 触发飞入动画
     * 从材料区（下方）飞入工作台锚点（上方）
     */
    fly(params: {
      startX: number
      startY: number
      endX: number
      endY: number
      imageUrl?: string
      color?: string
      size?: number
    }) {
      const size = params.size || 40

      this.setData({
        show: true,
        startX: params.startX - size / 2,
        startY: params.startY - size / 2,
        endX: params.endX,
        endY: params.endY,
        imageUrl: params.imageUrl || '',
        color: params.color || '#999',
        size
      })

      // 使用 wx.createAnimation 实现从下往上的飞入
      const deltaX = params.endX - params.startX
      const deltaY = params.endY - params.startY

      const anim = wx.createAnimation({
        duration: 500,
        timingFunction: 'ease-in-out'
      })

      // 先缩小 + 移动到目标位置
      anim
        .translateX(deltaX)
        .translateY(deltaY)
        .scale(0.6)
        .opacity(0.3)
        .step()

      setTimeout(() => {
        this.setData({ animData: anim.export() })
      }, 30)

      // 动画结束后销毁
      setTimeout(() => {
        this.setData({
          show: false,
          animData: null
        })
        this.triggerEvent('complete')
      }, 560)
    }
  }
})
