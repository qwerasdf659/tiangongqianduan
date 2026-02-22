/**
 * 🏪 交易状态管理 - MobX Store
 *
 * 管理内容: 交易市场商品、用户库存背包、上架管理
 * 数据来源: 后端 GET /api/v4/market/listings、GET /api/v4/backpack/
 *
 * 类型定义统一引用 typings/api.d.ts API.MarketListing / API.BackpackItem
 * 类型定义统一引用 typings/api.d.ts API.MarketListing / API.BackpackItem / API.MyListing
 * 禁止在此重复定义与后端对齐的接口
 *
 * @file 天工餐厅积分系统 - 交易Store
 * @version 5.2.0
 * @since 2026-02-15
 */

import { action, observable } from 'mobx-miniprogram'

import { createPaginatedActions, createPaginationState } from './helpers'

export const tradeStore = observable({
  // ===== 可观察状态=====

  /** 市场商品列表（后端 GET /api/v4/market/listings 返回） */
  marketListings: [] as API.MarketListing[],

  /** 用户背包物品列表（后端 GET /api/v4/backpack/ 的items[]返回） */
  inventoryItems: [] as API.BackpackItem[],

  /** 我的挂单列表 */
  myListings: [] as API.MyListing[],

  /** 市场商品分页 */
  marketPagination: createPaginationState(20),

  /** 市场加载状态*/
  marketLoading: false as boolean,

  /** 库存加载状态*/
  inventoryLoading: false as boolean,

  // ===== 操作方法（分页操作由工厂函数统一生成） =====

  /** 设置市场商品列表（首页加载） */
  setMarketListings: createPaginatedActions<API.MarketListing>('marketListings', 'marketPagination')
    .setAction,

  /** 追加市场商品列表（分页加载更多） */
  appendMarketListings: createPaginatedActions<API.MarketListing>(
    'marketListings',
    'marketPagination'
  ).appendAction,

  /** 设置背包物品列表 */
  setInventoryItems: action(function (this: any, items: API.BackpackItem[]) {
    this.inventoryItems = items
  }),

  /** 设置我的挂单列表 */
  setMyListings: action(function (this: any, listings: API.MyListing[]) {
    this.myListings = listings
  }),

  /** 设置市场加载状态*/
  setMarketLoading: action(function (this: any, loading: boolean) {
    this.marketLoading = loading
  }),

  /** 设置库存加载状态*/
  setInventoryLoading: action(function (this: any, loading: boolean) {
    this.inventoryLoading = loading
  }),

  /** 清空交易数据（退出登录时调用） */
  clearTrade: action(function (this: any) {
    this.marketListings = []
    this.inventoryItems = []
    this.myListings = []
    this.marketPagination = createPaginationState(20)
  })
})
