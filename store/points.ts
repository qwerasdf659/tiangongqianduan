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

import { createPaginationState, createPaginatedActions } from './helpers'

/**
 * 积分交易记录结构（对齐 typings/api.d.ts AssetTransaction）
 * 后端路由层 routes/v4/assets/transactions.js 第61-76行 map 输出
 * ⚠️ 注意：API响应字段名是 transaction_id（非数据库列名 asset_transaction_id）
 */
interface PointsTransaction {
  /** 交易流水ID — 后端API返回字段名是 transaction_id */
  transaction_id: number
  /** 资产代码（POINTS / DIAMOND / red_shard 等） */
  asset_code: string
  /** 变动金额（正数=获得/earn，负数=消费/consume） */
  delta_amount: number
  /** 变动前余额 */
  balance_before: number
  /** 变动后余额 */
  balance_after: number
  /** 业务类型枚举（lottery_consume / lottery_reward / exchange_debit 等） */
  business_type: string
  /** 交易描述（来自 meta.description，覆盖率91.2%，可为null） */
  description: string | null
  /** 交易标题（来自 meta.title，覆盖率79.2%，可为null） */
  title: string | null
  /** 创建时间（ISO 8601 格式） */
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
