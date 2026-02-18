/**
 * 📦 MobX Store 分页操作工厂函数
 *
 * 抽取 trade.ts、points.ts 中完全相同的分页模式：
 *   - 初始分页状态对象
 *   - setXxx(items, pagination) — 首页加载
 *   - appendXxx(newItems, pagination) — 分页追加
 *
 * 工厂函数通过参数化 listKey / paginationKey 生成对应的 action，
 * 消除 Store 之间的代码重复。
 *
 * @file 天工餐厅积分系统 - Store分页工具
 * @version 5.2.0
 * @since 2026-02-10
 */

import { action } from 'mobx-miniprogram'

/** 分页状态结构（与 typings/store.d.ts - PaginationState 一致） */
interface PaginationState {
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

/** 分页参数（后端响应中的分页信息） */
interface PaginationParam {
  page: number
  total: number
  hasMore: boolean
}

/** 创建初始分页状态 */
function createPaginationState(pageSize: number = 20): PaginationState {
  return {
    page: 1,
    pageSize,
    total: 0,
    hasMore: true
  }
}

/**
 * 创建分页列表的 set / append 两个 action
 *
 * @param listKey - Store 中列表字段名（如 'marketListings'）
 * @param paginationKey - Store 中分页字段名（如 'marketPagination'）
 * @param pageSize - 每页条数（默认20）
 * @returns { setAction, appendAction } 两个 MobX action 函数
 *
 * @example
 * const { setAction, appendAction } = createPaginatedActions('products', 'productPagination')
 * // 在 observable({}) 中使用:
 * setProducts: setAction,
 * appendProducts: appendAction,
 */
function createPaginatedActions<T>(listKey: string, paginationKey: string, pageSize: number = 20) {
  /** 设置列表（首页加载，替换全部数据） */
  const setAction = action(function (this: any, items: T[], pagination: PaginationParam) {
    this[listKey] = items
    this[paginationKey] = {
      page: pagination.page,
      pageSize,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  })

  /** 追加列表（分页加载更多，在现有数据后追加） */
  const appendAction = action(function (this: any, newItems: T[], pagination: PaginationParam) {
    this[listKey] = [...this[listKey], ...newItems]
    this[paginationKey] = {
      page: pagination.page,
      pageSize,
      total: pagination.total,
      hasMore: pagination.hasMore
    }
  })

  return { setAction, appendAction }
}

export { createPaginationState, createPaginatedActions }
