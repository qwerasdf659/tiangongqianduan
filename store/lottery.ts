/**
 * 🎰 抽奖状态管理 - MobX Store
 *
 * 管理内容: 奖品列表、抽奖配置、抽奖进度
 * 数据来源: 后端 GET /api/v4/lottery/campaigns/:code/prizes、GET .../config、POST .../draw
 *
 * 类型定义统一引用 typings/api.d.ts → API.Prize / API.LotteryConfig / API.DrawButton
 * 禁止在此重复定义与后端对齐的接口
 *
 * @file 天工餐厅积分系统 - 抽奖Store
 * @version 5.2.0
 * @since 2026-02-10
 */

import { action, observable } from 'mobx-miniprogram'

export const lotteryStore = observable({
  // ===== 可观察状态 =====

  /** 奖品列表（后端返回全部奖品，含正式奖品和fallback奖品） */
  prizes: [] as API.Prize[],

  /** 抽奖配置（含价格、连抽按钮、保底信息） */
  config: null as API.LotteryConfig | null,

  /** 是否正在抽奖中（动画进行时） */
  isDrawing: false as boolean,

  /** 当前高亮的奖品索引（转盘动画） */
  currentHighlight: -1 as number,

  /** 数据加载状态 */
  loading: false as boolean,

  // ===== 计算属性 =====

  /** 单抽实际消耗积分（折扣后，从后端配置per_draw_cost获取，不使用默认值） */
  get costPerDraw(): number {
    return this.config?.per_draw_cost || 0
  },

  /** 抽奖按钮配置列表 */
  get drawButtons(): API.DrawButton[] {
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
  setPrizes: action(function (this: any, prizes: API.Prize[]) {
    this.prizes = prizes
  }),

  /** 设置抽奖配置 */
  setConfig: action(function (this: any, config: API.LotteryConfig) {
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
