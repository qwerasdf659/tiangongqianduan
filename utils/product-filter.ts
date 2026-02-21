/**
 * 通用商品筛选工- 统一 exchange.ts 套重复筛选逻辑
 *
 * 原始代码中存在 applyFilters()、applyAdvancedFilters()、applyLuckyFilters() 三套几乎
 * 相同的筛选实现，本模块将三者合并为一个通用 applyProductFilters() 函数
 *
 * 后端对齐说明:
 *   - 统一使用后端 exchange_items 表字段 cost_amount 作为价格字段
 *   - 幸运空间和臻选空间均使用 cost_amount（不再映射为 price）
 *
 * 使用方式 *   const { applyProductFilters } = require('../../utils/product-filter')
 *   const filtered = applyProductFilters(products, filterOptions)
 *
 * @file 天工餐厅积分系统 - 通用商品筛选工 * @version 5.2.0
 * @since 2026-02-16
 */

const { createLogger } = require('./logger')
const log = createLogger('product-filter')

// ===== 类型定义 =====

/** 筛选条件配置（对齐后端 exchange_page 配置的字段格式） */
interface FilterOptions {
  /** 搜索关键词 */
  searchKeyword?: string
  /** 基础筛选类型（value: 'all' | 'available' | 'low-price'） */
  currentFilter?: string
  /** 分类筛选（value: 'all' 或具体分类名称如 '数码配件'） */
  categoryFilter?: string
  /**
   * 价格区间下限（对齐后端 cost_ranges.min）
   * null 表示无下限（"全部"时 min=null, max=null）
   */
  costRangeMin?: number | null
  /**
   * 价格区间上限（对齐后端 cost_ranges.max）
   * null 表示无上限（如 "500以上" 时 max=null）
   */
  costRangeMax?: number | null
  /** 库存状态（value: 'all' | 'in_stock' | 'low_stock'，对齐后端 stock_statuses） */
  stockStatus?: string
  /**
   * 排序方式（value 引用后端实际列名，对齐 sort_options）
   * 'sort_order' | 'cost_amount_asc' | 'cost_amount_desc' | 'created_at_desc' | 'sold_count_desc'
   */
  sortBy?: string
  /** 用户当前可用积分（用于 available 筛选） */
  totalPoints?: number
  /** 价格字段名（统一使用后端 exchange_items.cost_amount），默认 'cost_amount' */
  priceField?: string
  /**
   * 库存紧张阈值
   * 后端 exchange_page 配置的 ui.low_stock_threshold 提供
   */
  lowStockThreshold?: number
}

/** 筛选结果 */
interface FilterResult {
  /** 筛选后的商品数据*/
  filtered: any[]
  /** 筛选前的总数 */
  totalCount: number
  /** 筛选后的总数 */
  filteredCount: number
}

// ===== 核心筛选函=====

/**
 * 通用商品筛选与排序
 *
 * 将搜索、分类、价格范围、库存状态、排序等筛选条件统一应用到商品列表 * 兑换商品和幸运空间商品通过 priceField 参数区分价格字段名 *
 * @param products - 原始商品数组
 * @param options - 筛选条 * @returns 筛选结 *
 * @example
 * // 兑换商品筛选（价格字段: cost_amount，对齐后exchange_items 表）
 * const result = applyProductFilters(products, {
 *   searchKeyword: '咖啡',
 *   currentFilter: 'available',
 *   totalPoints: 1000,
 *   priceField: 'cost_amount'
 * })
 *
 * // 幸运空间瀑布流筛选（统一使用后端 cost_amount 字段）
 * const result = applyProductFilters(waterfallProducts, {
 *   searchKeyword: '',
 *   currentFilter: 'low-price',
 *   priceField: 'cost_amount'
 * })
 */
function applyProductFilters(products: any[], options: FilterOptions = {}): FilterResult {
  const {
    searchKeyword = '',
    currentFilter = 'all',
    categoryFilter = 'all',
    costRangeMin = null,
    costRangeMax = null,
    stockStatus = 'all',
    sortBy = 'sort_order',
    totalPoints = 0,
    priceField = 'cost_amount',
    lowStockThreshold = 10
  } = options

  if (!products || !Array.isArray(products)) {
    return { filtered: [], totalCount: 0, filteredCount: 0 }
  }

  const totalCount: number = products.length
  let filtered: any[] = [...products]

  // ===== 1. 搜索关键词筛选 =====
  // 搜索匹配: name（DataSanitizer 输出字段）+ description
  if (searchKeyword) {
    const keyword: string = searchKeyword.toLowerCase()
    filtered = filtered.filter(
      (product: any) =>
        (product.name && product.name.toLowerCase().includes(keyword)) ||
        (product.description && product.description.toLowerCase().includes(keyword))
    )
  }

  // ===== 2. 基础筛选（可用/低价格=====
  switch (currentFilter) {
    case 'available':
      filtered = filtered.filter(
        (product: any) => product.stock > 0 && totalPoints >= (product[priceField] || 0)
      )
      break
    case 'low-price':
      filtered = filtered.sort((a: any, b: any) => (a[priceField] || 0) - (b[priceField] || 0))
      break
    default:
      break
  }

  // ===== 3. 分类筛=====
  if (categoryFilter !== 'all') {
    filtered = filtered.filter(
      (product: any) =>
        product.category === categoryFilter ||
        (product.tags && product.tags.includes(categoryFilter))
    )
  }

  // ===== 4. 价格区间筛选（对齐后端 cost_ranges: {min, max} 格式） =====
  if (costRangeMin !== null || costRangeMax !== null) {
    const price = (product: any): number => Number(product[priceField]) || 0

    filtered = filtered.filter((p: any) => {
      const val = price(p)
      if (costRangeMin !== null && val < costRangeMin) {
        return false
      }
      if (costRangeMax !== null && val > costRangeMax) {
        return false
      }
      return true
    })
  }

  // ===== 5. 库存状态筛选（对齐后端 stock_statuses 的 value 字段） =====
  if (stockStatus !== 'all') {
    switch (stockStatus) {
      case 'in_stock':
        filtered = filtered.filter((product: any) => product.stock > lowStockThreshold)
        break
      case 'low_stock':
        filtered = filtered.filter(
          (product: any) => product.stock > 0 && product.stock <= lowStockThreshold
        )
        break
      default:
        break
    }
  }

  // ===== 6. 排序（value 引用后端实际列名，对齐 sort_options） =====
  switch (sortBy) {
    case 'cost_amount_asc':
      filtered = filtered.sort((a: any, b: any) => (a[priceField] || 0) - (b[priceField] || 0))
      break
    case 'cost_amount_desc':
      filtered = filtered.sort((a: any, b: any) => (b[priceField] || 0) - (a[priceField] || 0))
      break
    case 'created_at_desc':
      filtered = filtered.sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || 0).getTime()
        const dateB = new Date(b.created_at || 0).getTime()
        return dateB - dateA
      })
      break
    case 'sold_count_desc':
      filtered = filtered.sort((a: any, b: any) => (b.sold_count || 0) - (a.sold_count || 0))
      break
    default:
      break
  }

  log.info(`筛选完成，共${totalCount}个商品筛选出${filtered.length}个`)

  return { filtered, totalCount, filteredCount: filtered.length }
}

// ===== 导出 =====
module.exports = {
  applyProductFilters
}

export {}
