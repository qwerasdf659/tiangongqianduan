/**
 * 连抽按钮组 共享组件
 *
 * @description 展示多连抽按钮（三连/五连/十连等），
 *   积分价格由后端 draw_buttons 数组提供，父组件通过 buttons 属性传入。
 *   单抽按钮由各子玩法组件自行处理，此组件仅展示 draw_count > 1 的连抽档位。
 *
 * 数据来源: 后端 GET /api/v4/lottery/campaigns/:code/config → draw_buttons[]
 * 父组件: lottery-activity.ts → initActivity() → 转换后传入 buttons 属性
 *
 * @file shared/draw-buttons/draw-buttons.ts
 */

/**
 * 连抽按钮渲染项（由父组件从后端 draw_buttons 转换而来）
 * 后端字段(snake_case) → 前端渲染字段(camelCase)
 */
interface DrawButtonItem {
  /** 连抽次数（后端 draw_count） */
  draw_count: number
  /** 按钮文案（后端 label，如 "3连抽"） */
  label: string
  /** 总花费积分（后端 total_cost，折扣后） */
  total_cost: number
  /** 原价积分（后端 original_cost，折扣前） */
  original_cost: number
  /** 节省积分（后端 saved_points，0=无折扣） */
  saved_points: number
  /** 折扣率（后端 discount，1=无折扣，0.8=8折） */
  discount: number
  /** 每抽均价（后端 per_draw，折扣后） */
  per_draw: number
  /** 按钮样式类名（父组件转换时附加） */
  btnClass: string
  /** 是否显示保底标签（10连抽显示） */
  showGuarantee: boolean
  /** 保底文案 */
  guaranteeText: string
  /** 是否占满整行（10连抽占满） */
  fullWidth: boolean
}

Component({
  properties: {
    /**
     * 连抽按钮配置列表
     * 由父组件 lottery-activity 从后端 draw_buttons 数组转换后传入
     * 仅包含 draw_count > 1 的连抽档位（单抽由子玩法组件处理）
     */
    buttons: {
      type: Array,
      value: [] as DrawButtonItem[]
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

  methods: {
    /**
     * 连抽按钮点击事件
     * 向父组件触发 draw 事件，携带连抽次数
     */
    onDraw(e: WechatMiniprogram.TouchEvent) {
      if (this.data.isInProgress) {
        return
      }
      const { count } = e.currentTarget.dataset
      const drawCount = Number(count)
      if (!drawCount || drawCount <= 0) {
        return
      }
      this.triggerEvent('draw', { count: drawCount })
    }
  }
})
