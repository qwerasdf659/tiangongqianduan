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

/** 筛选条件配置*/
interface FilterOptions {
  /** 搜索关键?*/
  searchKeyword?: string
  /** 基础筛选类型（'all' | 'available' | 'low-price'?*/
  currentFilter?: string
  /** 分类筛选（'all' 或具体分类名称?*/
  categoryFilter?: string
  /** 积分/价格范围?all' | '0-500' | '500-1000' | '1000-2000' | '2000+'?*/
  pointsRange?: string
  /** 库存状态（'all' | 'in-stock' | 'low-stock'?*/
  stockFilter?: string
  /** 排序方式?default' | 'points-asc' | 'points-desc' | 'rating-desc' | 'stock-desc'?*/
  sortBy?: string
  /** 用户当前可用积分（用于available筛选） */
  totalPoints?: number
  /** 价格字段名（统一使用后端 exchange_items.cost_amount），默认'cost_amount' */
  priceField?: string
  /**
   * 库存紧张阈   * 后端API: GET /api/v4/system/config/product-filter 提供配置
   * 调用方应先从 API.getProductFilterConfig() 获取阈值再传入
   */
  lowStockThreshold?: number
}

/** 筛选结?*/
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
    pointsRange = 'all',
    stockFilter = 'all',
    sortBy = 'default',
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

  // ===== 4. 价格范围筛选 =====
  // 积分范围由调用方从 API.getProductFilterConfig() 获取后以字符串传入
  if (pointsRange !== 'all') {
    const price = (product: any): number => product[priceField] || 0

    switch (pointsRange) {
      case '0-500':
        filtered = filtered.filter((p: any) => price(p) <= 500)
        break
      case '500-1000':
        filtered = filtered.filter((p: any) => price(p) > 500 && price(p) <= 1000)
        break
      case '1000-2000':
        filtered = filtered.filter((p: any) => price(p) > 1000 && price(p) <= 2000)
        break
      case '2000+':
        filtered = filtered.filter((p: any) => price(p) > 2000)
        break
      default:
        break
    }
  }

  // ===== 5. 库存状态筛=====
  // 库存阈值由调用方从 API.getProductFilterConfig() 获取后传lowStockThreshold
  if (stockFilter !== 'all') {
    switch (stockFilter) {
      case 'in-stock':
        filtered = filtered.filter((product: any) => product.stock > lowStockThreshold)
        break
      case 'low-stock':
        filtered = filtered.filter(
          (product: any) => product.stock > 0 && product.stock <= lowStockThreshold
        )
        break
      default:
        break
    }
  }

  // ===== 6. 排序 =====
  switch (sortBy) {
    case 'points-asc':
      filtered = filtered.sort((a: any, b: any) => (a[priceField] || 0) - (b[priceField] || 0))
      break
    case 'points-desc':
      filtered = filtered.sort((a: any, b: any) => (b[priceField] || 0) - (a[priceField] || 0))
      break
    case 'rating-desc':
      /* ⚠️ 后端 exchange_items 表无 rating 字段，此排序仅在后端扩展返回 rating 后生?*/
      filtered = filtered.sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
      break
    case 'stock-desc':
      filtered = filtered.sort((a: any, b: any) => (b.stock || 0) - (a.stock || 0))
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
