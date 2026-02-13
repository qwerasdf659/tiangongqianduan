/**
 * 连抽按钮组 共享组件
 *
 * @description 从 lottery.wxml 提取的多连抽按钮（三连/五连/十连），
 *   积分价格从后端 drawPricing 获取，按钮禁用状态由父组件控制。
 *
 * @file shared/draw-buttons/draw-buttons.ts
 */

/** 连抽按钮配置项 */
interface DrawButton {
  /** 连抽次数 */
  count: number
  /** 按钮文案 */
  label: string
  /** 总花费积分（后端返回） */
  totalCost: number
  /** 按钮样式类名 */
  btnClass: string
  /** 是否显示保底标签 */
  showGuarantee: boolean
  /** 保底文案 */
  guaranteeText: string
  /** 是否占满整行 */
  fullWidth: boolean
}

/** 默认连抽按钮配置 */
const DEFAULT_BUTTONS: DrawButton[] = [
  {
    count: 3,
    label: '三连抽',
    totalCost: 300,
    btnClass: 'triple-btn',
    showGuarantee: false,
    guaranteeText: '',
    fullWidth: false
  },
  {
    count: 5,
    label: '五连抽',
    totalCost: 500,
    btnClass: 'five-btn',
    showGuarantee: false,
    guaranteeText: '',
    fullWidth: false
  },
  {
    count: 10,
    label: '十连抽',
    totalCost: 1000,
    btnClass: 'ten-btn special full-width',
    showGuarantee: true,
    guaranteeText: '保底好礼',
    fullWidth: true
  }
]

Component({
  properties: {
    /** 连抽按钮配置列表（可由父组件覆盖） */
    buttons: {
      type: Array,
      value: DEFAULT_BUTTONS
    },
    /** 后端返回的连抽定价信息 */
    drawPricing: {
      type: Object,
      value: null
    },
    /** 用户当前积分余额 */
    pointsBalance: {
      type: Number,
      value: 0
    },
    /** 是否正在抽奖中（禁用所有按钮） */
    isInProgress: {
      type: Boolean,
      value: false
    },
    /** 当前玩法模式（用于适配按钮文案） */
    displayMode: {
      type: String,
      value: ''
    }
  },

  observers: {
    /* 当后端定价数据变化时，更新按钮显示的积分 */
    'drawPricing': function(pricing: any) {
      if (!pricing) return
      const pricingMap: Record<number, string> = {
        3: 'three',
        5: 'five',
        10: 'ten'
      }
      const buttons = (this.data.buttons as DrawButton[]).map(btn => {
        const btnCount = btn.count || (btn as any).draw_count
        const key = pricingMap[btnCount]
        if (key && pricing[key] && pricing[key].total_cost != null) {
          return { ...btn, totalCost: pricing[key].total_cost }
        }
        return btn
      })
      this.setData({ buttons })
    },
    /* 按钮文案适配已移至 wxml WXS 层（渲染时同步计算，无时序问题） */
  },

  methods: {
    /**
     * 连抽按钮点击事件
     * 向父组件触发 draw 事件，携带连抽次数
     */
    onDraw(e: WechatMiniprogram.TouchEvent) {
      if (this.data.isInProgress) return
      const { count } = e.currentTarget.dataset
      const drawCount = Number(count)
      if (!drawCount || drawCount <= 0) return
      this.triggerEvent('draw', { count: drawCount })
    }
  }
})
