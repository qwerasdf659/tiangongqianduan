/**
 * 💰 资产状态管理 - MobX Store
 *
 * 管理内容: 可用积分、冻结积分、积分交易记录
 * 数据来源: 后端 GET /api/v4/assets/balance、GET /api/v4/assets/transactions
 *
 * @file 天工餐厅积分系统 - 资产Store
 * @version 5.1.0
 * @since 2026-02-15
 */

import { observable, action } from 'mobx-miniprogram'

const { createPaginationState, createPaginatedActions } = require('./helpers')

/** 积分交易记录结构 */
interface PointsTransaction {
  transaction_id: number
  asset_code: string
  amount: number
  business_type: string
  description: string
  balance_after: number
  created_at: string
}

export const pointsStore = observable({
  // ===== 可观察状态 =====

  /** 可用积分余额（后端字段: available_amount） */
  availableAmount: 0 as number,

  /** 冻结积分余额（后端字段: frozen_amount，审核中的积分） */
  frozenAmount: 0 as number,

  /** 积分交易记录列表 */
  transactions: [] as PointsTransaction[],

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

  /** 积分格式化显示（超1万显示为X.X万） */
  get formattedBalance(): string {
    const pts = this.availableAmount
    if (pts >= 10000) {
      return (pts / 10000).toFixed(1) + '万'
    }
    if (pts >= 1000) {
      return (pts / 1000).toFixed(1) + 'k'
    }
    return pts.toString()
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
  setTransactions: createPaginatedActions<PointsTransaction>(
    'transactions',
    'transactionPagination'
  ).setAction,

  /** 追加交易记录（分页加载更多） */
  appendTransactions: createPaginatedActions<PointsTransaction>(
    'transactions',
    'transactionPagination'
  ).appendAction,

  /** 设置交易记录加载状态 */
  setTransactionsLoading: action(function (this: any, loading: boolean) {
    this.transactionsLoading = loading
  }),

  /** 清空资产数据（退出登录时调用） */
  clearPoints: action(function (this: any) {
    this.availableAmount = 0
    this.frozenAmount = 0
    this.transactions = []
    this.transactionPagination = createPaginationState(20)
  })
})
