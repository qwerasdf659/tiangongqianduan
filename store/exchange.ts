/**
 * 🎁 兑换状态管理 - MobX Store
 *
 * 管理内容: 兑换商品列表、兑换记录
 * 数据来源: 后端 GET /api/v4/backpack/exchange/items、GET .../orders
 *
 * 类型定义统一引用 typings/api.d.ts → API.ExchangeProduct / API.ExchangeOrder
 * 禁止在此重复定义与后端对齐的接口
 *
 * @file 天工餐厅积分系统 - 兑换Store
 * @version 5.2.0
 * @since 2026-02-10
 */

import { action, observable } from 'mobx-miniprogram'

import { createPaginatedActions, createPaginationState } from './helpers'

export const exchangeStore = observable({
  // ===== 可观察状态 =====

  /** 商品列表（后端 GET /api/v4/backpack/exchange/items 返回） */
  products: [] as API.ExchangeProduct[],

  /** 兑换记录列表（后端 GET /api/v4/backpack/exchange/orders 返回） */
  records: [] as API.ExchangeOrder[],

  /** 当前筛选的商品空间: 'lucky' | 'premium' | null */
  currentSpace: null as string | null,

  /** 当前筛选的商品分类 */
  currentCategory: null as string | null,

  /** 商品列表分页 */
  productPagination: createPaginationState(20),

  /** 记录列表分页 */
  recordPagination: createPaginationState(20),

  /** 商品列表加载状态 */
  productsLoading: false as boolean,

  /** 记录列表加载状态 */
  recordsLoading: false as boolean,

  // ===== 操作方法（分页操作由工厂函数统一生成） =====

  /** 设置商品列表（首页加载） */
  setProducts: createPaginatedActions<API.ExchangeProduct>('products', 'productPagination')
    .setAction,

  /** 追加商品列表（分页加载更多） */
  appendProducts: createPaginatedActions<API.ExchangeProduct>('products', 'productPagination')
    .appendAction,

  /** 设置兑换记录（首页加载） */
  setRecords: createPaginatedActions<API.ExchangeOrder>('records', 'recordPagination').setAction,

  /** 设置筛选条件 */
  setFilter: action(function (this: any, space: string | null, category: string | null) {
    this.currentSpace = space
    this.currentCategory = category
  }),

  /** 设置商品加载状态 */
  setProductsLoading: action(function (this: any, loading: boolean) {
    this.productsLoading = loading
  }),

  /** 设置记录加载状态 */
  setRecordsLoading: action(function (this: any, loading: boolean) {
    this.recordsLoading = loading
  }),

  /** 清空兑换数据 */
  clearExchange: action(function (this: any) {
    this.products = []
    this.records = []
    this.currentSpace = null
    this.currentCategory = null
    this.productPagination = createPaginationState(20)
    this.recordPagination = createPaginationState(20)
  })
})
