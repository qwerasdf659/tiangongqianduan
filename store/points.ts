/**
 * 💰 资产状态管理 - MobX Store
 *
 * 管理内容: 可用积分、冻结积分、积分交易记录
 * 数据来源: 后端 GET /api/v4/assets/balance、GET /api/v4/assets/transactions
 *
 * 类型定义统一引用 typings/api.d.ts → API.AssetTransaction
 * 禁止在此重复定义与后端对齐的接口
 *
 * @file 天工餐厅积分系统 - 资产Store
 * @version 5.2.0
 * @since 2026-02-10
 */

import { action, observable } from 'mobx-miniprogram'

import { createPaginatedActions, createPaginationState } from './helpers'

const { Utils, Logger } = require('../utils/index')
const { formatPoints } = Utils
const log = Logger.createLogger('points-store')

export const pointsStore = observable({
  // ===== 可观察状态 =====

  /** 可用积分余额（后端字段: available_amount） */
  availableAmount: 0 as number,

  /** 冻结积分余额（后端字段: frozen_amount，审核中的积分） */
  frozenAmount: 0 as number,

  /** 积分交易记录列表（后端 GET /api/v4/assets/transactions 返回） */
  transactions: [] as API.AssetTransaction[],

  /** 交易记录分页信息 */
  transactionPagination: createPaginationState(20),

  /** 余额加载状态 */
  balanceLoading: false as boolean,

  /** 交易记录加载状态 */
  transactionsLoading: false as boolean,

  // ===== 计算属性 =====

  /** 总积分余额 = 可用 + 冻结 */
  get totalAmount(): number {
    return this.availableAmount + this.frozenAmount
  },

  /** 积分格式化显示 — 千分位完整数字（统一调用 utils/util.ts formatPoints） */
  get formattedBalance(): string {
    return formatPoints(this.availableAmount)
  },

  // ===== 操作方法 =====

  /** 设置积分余额（从后端获取余额后调用） */
  setBalance: action(function (this: any, availableAmount: number, frozenAmount: number) {
    this.availableAmount = availableAmount
    this.frozenAmount = frozenAmount
  }),

  /** 设置余额加载状态 */
  setBalanceLoading: action(function (this: any, loading: boolean) {
    this.balanceLoading = loading
  }),

  /** 设置交易记录（首页加载） */
  setTransactions: createPaginatedActions<API.AssetTransaction>(
    'transactions',
    'transactionPagination'
  ).setAction,

  /** 追加交易记录（分页加载更多） */
  appendTransactions: createPaginatedActions<API.AssetTransaction>(
    'transactions',
    'transactionPagination'
  ).appendAction,

  /** 设置交易记录加载状态 */
  setTransactionsLoading: action(function (this: any, loading: boolean) {
    this.transactionsLoading = loading
  }),

  /**
   * 从后端 API 刷新积分余额（唯一入口）
   *
   * 收敛 user.ts / lottery.ts / exchange.ts 三处重复的积分刷新逻辑：
   *   调用 API.getPointsBalance()
   *   → 校验 success && data
   *   → 提取 available_amount / frozen_amount
   *   → 更新 pointsStore.setBalance()
   *   → catch 中降级读取 pointsStore 缓存值
   *
   * 后端路由: GET /api/v4/assets/balance
   * @returns {{ available: number, frozen: number }} 余额数据
   */
  refreshFromAPI: action(async function (
    this: any
  ): Promise<{ available: number; frozen: number }> {
    this.balanceLoading = true
    try {
      const { API: pointsApi } = require('../utils/index')
      const balanceResult = await pointsApi.getPointsBalance()

      if (balanceResult?.success && balanceResult.data) {
        const available = balanceResult.data.available_amount ?? 0
        const frozen = balanceResult.data.frozen_amount ?? 0
        // 使用已定义的同步 action 更新值，确保 MobX 响应式更新
        pointsStore.setBalance(available, frozen)
        pointsStore.setBalanceLoading(false)
        return { available, frozen }
      }

      pointsStore.setBalanceLoading(false)
      return { available: this.availableAmount, frozen: this.frozenAmount }
    } catch (refreshError) {
      log.error('refreshFromAPI 异常:', refreshError)
      pointsStore.setBalanceLoading(false)
      return { available: this.availableAmount, frozen: this.frozenAmount }
    }
  }),

  /** 清空资产数据（退出登录时调用） */
  clearPoints: action(function (this: any) {
    this.availableAmount = 0
    this.frozenAmount = 0
    this.transactions = []
    this.transactionPagination = createPaginationState(20)
  })
})
