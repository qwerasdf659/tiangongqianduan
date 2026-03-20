/**
 * 📋 审核链状态管理 - MobX Store
 *
 * 管理内容: 审核链待办数量、上次刷新时间
 * 数据来源: 后端 GET /api/v4/console/approval-chain/my-pending
 *
 * 解决的问题:
 *   - 多页面共享审核链待办数量（user 页面角标、audit-list 页面、铃铛角标）
 *   - 页面销毁后待办数量不丢失
 *   - Socket.IO 审核链事件驱动自动刷新
 *
 * 权限:
 *   只有 role_level >= 60 (business_manager 及以上) 的用户才会调用审核链API，
 *   普通用户调用 refreshPendingCount 时静默跳过。
 *
 * @file 天工餐厅积分系统 - 审核链Store
 * @version 6.0.0
 * @since 2026-03-15
 */

import { action, observable } from 'mobx-miniprogram'

/** 刷新冷却时间（毫秒）：5秒内不重复请求后端 */
const REFRESH_COOLDOWN_MS = 5000

export const auditStore = observable({
  // ===== 可观察状态 =====

  /** 当前用户待审核步骤总数（角标显示用） */
  pendingCount: 0 as number,

  /** 上次刷新时间戳（用于冷却判断） */
  lastRefreshTime: 0 as number,

  /** 是否正在刷新 */
  refreshing: false as boolean,

  // ===== 计算属性 =====

  /** 是否有待办任务 */
  get hasPending(): boolean {
    return this.pendingCount > 0
  },

  /** 角标文本（超过99显示99+） */
  get badgeText(): string {
    if (this.pendingCount <= 0) {
      return ''
    }
    return this.pendingCount > 99 ? '99+' : String(this.pendingCount)
  },

  // ===== 操作方法 =====

  /**
   * 从后端刷新待审核数量（唯一入口）
   *
   * 流程:
   *   1. 检查用户角色是否有权限（role_level >= 60）
   *   2. 检查冷却时间（5秒内不重复请求）
   *   3. 调用 GET /api/v4/console/approval-chain/my-pending?page=1&page_size=1
   *   4. 从 pagination.total 提取待办数量
   *
   * @param force - 是否强制刷新（忽略冷却时间，Socket.IO事件触发时使用）
   */
  refreshPendingCount: action(async function (this: any, force: boolean = false): Promise<void> {
    /* 权限检查：从 Storage 读取 userInfo 判断角色 */
    const cachedUserInfo = wx.getStorageSync('user_info')
    if (!cachedUserInfo || !cachedUserInfo.user_id) {
      return
    }
    const localRoleLevel = cachedUserInfo.role_level || 0
    if (localRoleLevel < 60) {
      return
    }

    /* 冷却检查：5秒内不重复请求 */
    const now = Date.now()
    if (!force && now - this.lastRefreshTime < REFRESH_COOLDOWN_MS) {
      return
    }

    if (this.refreshing) {
      return
    }

    this.refreshing = true
    this.lastRefreshTime = now

    try {
      const { API: auditApi } = require('../utils/index')
      const pendingResult = await auditApi.getMyPendingApprovalSteps({
        page: 1,
        page_size: 1,
        showLoading: false
      })

      if (pendingResult?.success && pendingResult.data?.pagination) {
        this.pendingCount = pendingResult.data.pagination.total || 0
      }
    } catch (_refreshError) {
      /* 静默失败，保留上次缓存的数量 */
    } finally {
      this.refreshing = false
    }
  }),

  /** 直接设置待办数量（Socket.IO推送已知数量时使用） */
  setPendingCount: action(function (this: any, count: number) {
    this.pendingCount = Math.max(0, count)
  }),

  /** 清空审核数据（退出登录时调用） */
  clearAudit: action(function (this: any) {
    this.pendingCount = 0
    this.lastRefreshTime = 0
    this.refreshing = false
  })
})
