/**
 * 🎰 抽奖状态管理 - MobX Store
 *
 * 管理内容: 奖品列表、抽奖配置、抽奖进度
 * 数据来源: 后端 GET /api/v4/lottery/campaigns/:code/prizes、GET .../config、POST .../draw
 *
 * @file 天工餐厅积分系统 - 抽奖Store
 * @version 3.0.0
 * @since 2026-02-10
 */

import { observable, action } from 'mobx-miniprogram'

/**
 * 奖品结构（后端 DataSanitizer.sanitizePrizes 输出格式）
 * 字段来源: GET /api/v4/lottery/campaigns/:campaign_code/prizes
 * 注意: tier/probability/is_winner 后端不返回，已废弃
 */
interface Prize {
  /** 奖品ID（普通用户: id，管理员: lottery_prize_id） */
  id: number
  /** 奖品名称 */
  name: string
  /** 奖品类型（points/physical/virtual/coupon/service） */
  type: string
  /** 奖品图标（emoji字符串，由后端prize_type自动映射） */
  icon: string
  /** 稀有度（common/uncommon/rare/epic/legendary，后端自动生成） */
  rarity: string
  /** 是否有库存 */
  available: boolean
  /** 展示积分值 */
  display_points: number
  /** 展示价值文本（高价值/中价值/低价值） */
  display_value: string
  /** 奖品状态 */
  status: string
  /** 排序序号（从1开始） */
  sort_order: number
}

/** 抽奖按钮配置（后端返回的draw_buttons数组项） */
interface DrawButton {
  draw_count: number
  discount: number
  label: string
  per_draw: number
  total_cost: number
  original_cost: number
  saved_points: number
}

/** 抽奖配置结构 */
interface LotteryConfig {
  campaign_code: string
  campaign_name: string
  status: string
  cost_per_draw: number
  max_draws_per_user_daily: number
  draw_buttons: DrawButton[]
  guarantee_info: any
}

export const lotteryStore = observable({
  // ===== 可观察状态 =====

  /** 奖品列表（后端返回全部奖品，含正式奖品和fallback奖品） */
  prizes: [] as Prize[],

  /** 抽奖配置（含价格、连抽按钮、保底信息） */
  config: null as LotteryConfig | null,

  /** 是否正在抽奖中（动画进行时） */
  isDrawing: false as boolean,

  /** 当前高亮的奖品索引（转盘动画） */
  currentHighlight: -1 as number,

  /** 数据加载状态 */
  loading: false as boolean,

  // ===== 计算属性 =====

  /** 单抽消耗积分（从后端配置获取，不使用默认值） */
  get costPerDraw(): number {
    return this.config?.cost_per_draw || 0
  },

  /** 抽奖按钮配置列表 */
  get drawButtons(): DrawButton[] {
    return this.config?.draw_buttons || []
  },

  /** 活动代码 */
  get campaignCode(): string {
    return this.config?.campaign_code || ''
  },

  /** 是否有有效配置 */
  get hasValidConfig(): boolean {
    return this.config !== null && this.config.status === 'active'
  },

  // ===== 操作方法 =====

  /** 设置奖品列表 */
  setPrizes: action(function (this: any, prizes: Prize[]) {
    this.prizes = prizes
  }),

  /** 设置抽奖配置 */
  setConfig: action(function (this: any, config: LotteryConfig) {
    this.config = config
  }),

  /** 设置抽奖状态 */
  setDrawing: action(function (this: any, isDrawing: boolean) {
    this.isDrawing = isDrawing
  }),

  /** 设置当前高亮奖品索引（动画用） */
  setHighlight: action(function (this: any, index: number) {
    this.currentHighlight = index
  }),

  /** 设置加载状态 */
  setLoading: action(function (this: any, loading: boolean) {
    this.loading = loading
  }),

  /** 清空抽奖数据（退出登录时调用） */
  clearLottery: action(function (this: any) {
    this.prizes = []
    this.config = null
    this.isDrawing = false
    this.currentHighlight = -1
  })
})





