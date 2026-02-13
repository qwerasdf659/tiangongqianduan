/**
 * 🏪 交易状态管理 - MobX Store
 *
 * 管理内容: 交易市场商品、用户库存/背包、上架管理
 * 数据来源: 后端 GET /api/v4/market/listings、GET /api/v4/backpack/
 *
 * @file 天工餐厅积分系统 - 交易Store
 * @version 3.0.0
 * @since 2026-02-10
 */

import { observable, action } from 'mobx-miniprogram'

/** 市场商品结构（后端返回格式） */
interface MarketListing {
  market_listing_id: number
  item_name: string
  price: number
  seller_nickname: string
  status: string
  listed_at: string
  description: string
}

/** 背包物品结构（后端返回格式） */
interface InventoryItem {
  item_instance_id: number
  item_type: string
  name: string
  status: string
  rarity: string
  description: string
  acquired_at: string
  expires_at: string | null
  is_owner: boolean
  has_redemption_code: boolean
}

/** 我的挂单结构 */
interface MyListing {
  market_listing_id: number
  item_name: string
  price: number
  status: string
  listed_at: string
}

export const tradeStore = observable({
  // ===== 可观察状态 =====

  /** 市场商品列表 */
  marketListings: [] as MarketListing[],

  /** 用户背包物品列表 */
  inventoryItems: [] as InventoryItem[],

  /** 我的挂单列表 */
  myListings: [] as MyListing[],

  /** 市场商品分页 */
  marketPagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: true
  },

  /** 市场加载状态 */
  marketLoading: false as boolean,

  /** 库存加载状态 */
  inventoryLoading: false as boolean,

  // ===== 操作方法 =====

  /** 设置市场商品列表（首页加载） */
  setMarketListings: action(function (
    this: any,
    listings: MarketListing[],
    pagination: { page: number; total: number; hasMore: boolean }
  ) {
    this.marketListings = listings
    this.marketPagination = {
      page: pagination.page,
      pageSize: 20,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  }),

  /** 追加市场商品列表（分页加载更多） */
  appendMarketListings: action(function (
    this: any,
    newListings: MarketListing[],
    pagination: { page: number; total: number; hasMore: boolean }
  ) {
    this.marketListings = [...this.marketListings, ...newListings]
    this.marketPagination = {
      page: pagination.page,
      pageSize: 20,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  }),

  /** 设置背包物品列表 */
  setInventoryItems: action(function (this: any, items: InventoryItem[]) {
    this.inventoryItems = items
  }),

  /** 设置我的挂单列表 */
  setMyListings: action(function (this: any, listings: MyListing[]) {
    this.myListings = listings
  }),

  /** 设置市场加载状态 */
  setMarketLoading: action(function (this: any, loading: boolean) {
    this.marketLoading = loading
  }),

  /** 设置库存加载状态 */
  setInventoryLoading: action(function (this: any, loading: boolean) {
    this.inventoryLoading = loading
  }),

  /** 清空交易数据（退出登录时调用） */
  clearTrade: action(function (this: any) {
    this.marketListings = []
    this.inventoryItems = []
    this.myListings = []
    this.marketPagination = { page: 1, pageSize: 20, total: 0, hasMore: true }
  })
})

