/**
 * 🎁 兑换状态管理 - MobX Store
 *
 * 管理内容: 兑换商品列表、兑换记录
 * 数据来源: 后端 GET /api/v4/backpack/exchange/items、GET .../orders
 *
 * @file 天工餐厅积分系统 - 兑换Store
 * @version 3.0.0
 * @since 2026-02-10
 */

import { observable, action } from 'mobx-miniprogram'

/** 兑换商品结构（后端返回格式） */
interface ExchangeProduct {
  id: number
  name: string
  description: string
  cost_points: number
  category: string
  stock: number
  image_url: string
  space: string
}

/** 兑换订单记录结构 */
interface ExchangeRecord {
  order_id: string
  order_no: string
  product_name: string
  cost_points: number
  quantity: number
  status: string
  created_at: string
}

export const exchangeStore = observable({
  // ===== 可观察状态 =====

  /** 商品列表 */
  products: [] as ExchangeProduct[],

  /** 兑换记录列表 */
  records: [] as ExchangeRecord[],

  /** 当前筛选的商品空间: 'lucky' | 'premium' | null */
  currentSpace: null as string | null,

  /** 当前筛选的商品分类 */
  currentCategory: null as string | null,

  /** 商品列表分页 */
  productPagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true
  },

  /** 记录列表分页 */
  recordPagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true
  },

  /** 商品列表加载状态 */
  productsLoading: false as boolean,

  /** 记录列表加载状态 */
  recordsLoading: false as boolean,

  // ===== 操作方法 =====

  /** 设置商品列表（首页加载） */
  setProducts: action(function (
    this: any,
    products: ExchangeProduct[],
    pagination: { page: number; total: number; hasMore: boolean }
  ) {
    this.products = products
    this.productPagination = {
      page: pagination.page,
      pageSize: 20,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  }),

  /** 追加商品列表（分页加载更多） */
  appendProducts: action(function (
    this: any,
    newProducts: ExchangeProduct[],
    pagination: { page: number; total: number; hasMore: boolean }
  ) {
    this.products = [...this.products, ...newProducts]
    this.productPagination = {
      page: pagination.page,
      pageSize: 20,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  }),

  /** 设置兑换记录（首页加载） */
  setRecords: action(function (
    this: any,
    records: ExchangeRecord[],
    pagination: { page: number; total: number; hasMore: boolean }
  ) {
    this.records = records
    this.recordPagination = {
      page: pagination.page,
      pageSize: 20,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  }),

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
    this.productPagination = { page: 1, pageSize: 20, total: 0, hasMore: true }
    this.recordPagination = { page: 1, pageSize: 20, total: 0, hasMore: true }
  })
})

