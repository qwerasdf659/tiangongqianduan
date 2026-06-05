/**
 * 🎒 背包状态管理 - MobX Store
 *
 * 管理内容: 用户库存背包（个人物品，非交易）
 * 数据来源: 后端 GET /api/v4/backpack/
 *
 * 类型定义统一引用 typings/api.d.ts API.BackpackItem
 * 禁止在此重复定义与后端对齐的接口
 *
 * @file 天工餐厅积分系统 - 背包Store
 * @version 5.2.0
 * @since 2026-02-15
 */

import { action, observable } from 'mobx-miniprogram'

export const backpackStore = observable({
  // ===== 可观察状态=====

  /** 用户背包物品列表（后端 GET /api/v4/backpack/ 的items[]返回） */
  inventoryItems: [] as API.BackpackItem[],

  /** 库存加载状态*/
  inventoryLoading: false as boolean,

  // ===== 操作方法 =====

  /** 设置背包物品列表 */
  setInventoryItems: action(function (this: any, items: API.BackpackItem[]) {
    this.inventoryItems = items
  }),

  /** 设置库存加载状态*/
  setInventoryLoading: action(function (this: any, loading: boolean) {
    this.inventoryLoading = loading
  }),

  /** 清空背包数据（退出登录时调用） */
  clearBackpack: action(function (this: any) {
    this.inventoryItems = []
  })
})
