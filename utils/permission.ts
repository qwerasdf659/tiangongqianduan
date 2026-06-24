/**
 * 🔐 权限判定统一模块 - 商家/管理类能力的单一事实源（Single Source of Truth）
 *
 * 背景（对接文档 2026-06-24《店员商家功能按钮显示不全问题》复盘）：
 *   此前各页面用裸 `role_level >= 20/40/100` 硬编码判断同一业务能力，口径分散、易写歪
 *   （如"审核管理"误用店员门槛、permissions 判定逻辑只活在 lottery.ts）。本模块把所有
 *   商家/管理类能力判定收口到一处，页面只调语义化函数，不再各自写魔法数字。
 *
 * 设计原则：
 *   1. 门槛数值对齐后端契约（非前端自定义业务规则），集中常量维护，后端调整只改这里；
 *   2. 管理员判断不重复造轮子，复用 utils/util.ts 的 determineUserRole（≥100）；
 *   3. 基于 role_level 的能力为纯函数（入参 role_level），便于单测与复用；
 *   4. 基于 permissions 的能力与后端 requireMerchantPermission 同构（扁平数组 + 通配符判定）。
 *
 * @file 天工平台 - 权限判定统一模块
 * @version 5.2.0
 */

const { determineUserRole } = require('./util')

/**
 * 角色等级门槛（对齐后端 authenticateToken / requireRoleLevel 中间件口径）
 *
 * ⚠️ 这些是"后端权限契约"，不是前端自定义业务规则；前端零映射对齐，后端调整时同步此处。
 */
const ROLE_LEVEL = {
  /** 商家店员：扫码核销 / 消费录入 / 我的提交 / 审核链待办（后端审核链已降 lv60→lv20） */
  STAFF: 20,
  /** 商家店长 */
  MANAGER: 40,
  /** 业务经理（部分 console 接口仍要求 lv60，未随审核链降门槛） */
  BUSINESS: 60,
  /** 区域负责人：跨门店辖区数据范围（对齐后端 roles 表 regional_manager=80，非前端自定义） */
  REGIONAL: 80,
  /** 平台管理员：console 域审核 / 跨店特权 */
  ADMIN: 100
} as const

/**
 * 判断是否拥有某项细粒度权限位（与后端 requireMerchantPermission 逐字同构）
 *
 * 后端 GET /api/v4/permissions/me 的 permissions 已拍平为「扁平字符串数组」单一形态，
 * 前端零映射直读（对接文档 §9.4.1）。判定逻辑必须与后端中间件
 * middleware/auth.js requireMerchantPermission（L1224-1227）完全同构，支持通配符：
 *   - "*:*"          超级管理员通配（admin/super_admin 的 permissions 即 ["*:*"]）
 *   - "resource:*"   资源级通配（如 "consumption:*"）
 *   - "domain:action" 精确权限码（如 "consumption:scan_user"）
 *
 * ⚠️ 必须支持通配（对接文档 §14.1 定稿项5）：admin 经 /me 拿到的是 ["*:*"]，
 *    若只做精确匹配，管理员的商家按钮会全部判 false 而消失。这不是给脏数据打补丁，
 *    而是后端权限模型本就是通配模型，前端对齐后端同一套判定 = 单一口径、零漂移。
 *
 * @param permissions 后端下发的 permissions 扁平字符串数组
 * @param permissionKey 权限位，格式 "domain:action"，如 "consumption:scan_user"
 * @returns 是否拥有该权限
 */
function hasPermission(permissions: string[] | null | undefined, permissionKey: string): boolean {
  if (!Array.isArray(permissions)) {
    return false
  }
  const [resource] = permissionKey.split(':')
  return (
    permissions.includes('*:*') ||
    permissions.includes(`${resource}:*`) ||
    permissions.includes(permissionKey)
  )
}

/**
 * 从 role_level 安全取整数（缺失/非法时按 0 处理，等同未授权）
 *
 * @param roleLevel 任意来源的角色等级值
 */
function normalizeRoleLevel(roleLevel: unknown): number {
  return typeof roleLevel === 'number' && !isNaN(roleLevel) ? roleLevel : 0
}

/**
 * 权限判定统一对象
 *
 * 基于 role_level 的能力：入参为角色等级（页面从 userStore.userInfo.role_level 取）。
 * 基于 permissions 的能力：入参为 GET /permissions/me 的 permissions 字段。
 */
const Permission = {
  /** 角色门槛常量（供页面引用，消灭魔法数字） */
  ROLE_LEVEL,

  /** 细粒度权限位判定（扁平数组 + 通配符，与后端 requireMerchantPermission 同构） */
  hasPermission,

  // ===== 基于 role_level 的能力判定 =====

  /** 是否商家店员及以上（≥20）：扫码核销 / 消费录入 / 我的提交入口准入 */
  isMerchant(roleLevel: unknown): boolean {
    return normalizeRoleLevel(roleLevel) >= ROLE_LEVEL.STAFF
  },

  /** 是否店长及以上（≥40） */
  isManager(roleLevel: unknown): boolean {
    return normalizeRoleLevel(roleLevel) >= ROLE_LEVEL.MANAGER
  },

  /**
   * 扫码核销准入：拥有 consumption:scan_user 权限（§10.7 统一权限码口径）
   *
   * 对接文档 §10 选项A：后端 redemption/scan、redemption/fulfill 已统一改用
   * requireMerchantPermission('consumption:scan_user') 校验，前端与之同口径——
   * 入参由 roleLevel 改为 permissions，与 canSubmitConsumption / canViewMySubmissions
   * 同形态，三个商家按钮全部走 hasPermission(权限码)，不再为扫码核销保留 role_level 特例。
   */
  canScan(permissions: string[] | null | undefined): boolean {
    return hasPermission(permissions, 'consumption:scan_user')
  },

  /**
   * 审核链待办准入（≥20）：可进审批管理页、查看/审核"我的待办步骤"、批量审核。
   * ⚠️ 这是审核链待办流程（lv20，店员可参与），与 isAdmin（lv100 的 console 审核）不同。
   */
  canReviewChain(roleLevel: unknown): boolean {
    return normalizeRoleLevel(roleLevel) >= ROLE_LEVEL.STAFF
  },

  /**
   * 是否平台管理员（≥100）：console 域审核（审核详情）/ 跨店特权。
   * 复用 determineUserRole 统一逻辑，避免重复编写管理员判断。
   */
  isAdmin(userInfo: { role_level?: number } | null | undefined): boolean {
    return !!userInfo && determineUserRole(userInfo) === 'admin'
  },

  // ===== 基于 permissions 的能力判定（入参为 /me 下发的扁平权限数组） =====

  /** 消费录入准入：拥有 consumption:create 权限（后端 POST /shop/consumption/submit 同口径） */
  canSubmitConsumption(permissions: string[] | null | undefined): boolean {
    return hasPermission(permissions, 'consumption:create')
  },

  /**
   * 我的提交准入：拥有 consumption:read 权限
   *
   * 对接文档 §10.5：后端「我的提交」接口 GET /api/v4/shop/consumption/merchant
   * 的权限口径为 consumption:read（merchant_staff 角色本就具备），与"消费录入"的
   * consumption:create 区分——读列表用 read、录入用 create，对齐后端实际契约。
   */
  canViewMySubmissions(permissions: string[] | null | undefined): boolean {
    return hasPermission(permissions, 'consumption:read')
  }
}

module.exports = { Permission, ROLE_LEVEL, hasPermission }
