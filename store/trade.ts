/**
 * 🏪 交易状态管理 - MobX Store
 *
 * 管理内容: 交易市场商品、用户库存/背包、上架管理
 * 数据来源: 后端 GET /api/v4/market/listings、GET /api/v4/backpack/
 *
 * @file 天工餐厅积分系统 - 交易Store
 * @version 5.1.0
 * @since 2026-02-15
 */

import { action, observable } from 'mobx-miniprogram'

import { createPaginationState, createPaginatedActions } from './helpers'

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

/**
 * 背包物品结构（后端返回格式）
 *
 * 状态枚举（来源：item_instances表 + system_dictionaries表）：
 *   available   - 可用（用户可操作：使用/核销/上架）
 *   locked      - 已锁定（交易/核销流程中，暂时不可操作）
 *   transferred - 已转移（已转让给其他用户）
 *   used        - 已使用（已消耗/核销完成）
 *   expired     - 已过期（超过有效期）
 *
 * 物品类型枚举（来源：system_dictionaries表 dict_type='item_type'）：
 *   prize         - 奖品
 *   product       - 商品
 *   voucher       - 兑换券
 *   tradable_item - 可交易物品
 *   service       - 服务
 */
interface InventoryItem {
  /** 物品实例唯一ID（bigint） */
  item_instance_id: number
  /** 物品类型编码 */
  item_type: string
  /** 物品类型中文名（后端自动附加） */
  item_type_display: string
  /** 物品名称 */
  name: string
  /** 物品状态编码 */
  status: string
  /** 物品状态中文名（后端自动附加） */
  status_display: string
  /** 稀有度编码 */
  rarity: string
  /** 稀有度中文名（后端自动附加） */
  rarity_display: string
  /** 物品描述 */
  description: string
  /** 是否已生成核销码 */
  has_redemption_code: boolean
  /** 获得时间（YYYY-MM-DD HH:mm:ss格式） */
  acquired_at: string
  /** 过期时间（可为null） */
  expires_at: string | null
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
  marketPagination: createPaginationState(20),

  /** 市场加载状态 */
  marketLoading: false as boolean,

  /** 库存加载状态 */
  inventoryLoading: false as boolean,

  // ===== 操作方法（分页操作由工厂函数统一生成） =====

  /** 设置市场商品列表（首页加载） */
  setMarketListings: createPaginatedActions<MarketListing>('marketListings', 'marketPagination')
    .setAction,

  /** 追加市场商品列表（分页加载更多） */
  appendMarketListings: createPaginatedActions<MarketListing>('marketListings', 'marketPagination')
    .appendAction,

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
    this.marketPagination = createPaginationState(20)
  })
})
