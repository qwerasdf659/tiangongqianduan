/**
 * 虚拟资产代码常量定义 — 对齐后端 constants/AssetCode.js
 *
 * 🔴 此文件定义的是系统内部标识符（asset_code），不是业务数据
 * 用于前端条件判断、筛选逻辑中消除字符串字面量硬编码
 * 所有 asset_code 值均为 lower_snake_case，与后端数据库存储值一致
 *
 * 命名规范（对齐后端 Node.js/Sequelize 生态）：
 *   常量键：UPPER_SNAKE_CASE（如 AssetCode.STAR_STONE）
 *   常量值：lower_snake_case（如 'star_stone'）
 *
 * 映射关系（2026-04-03 虚拟资产命名重构）：
 *   - DIAMOND → star_stone（星石，主货币）
 *   - DIAMOND_QUOTA → star_stone_quota（星石配额）
 *   - POINTS → points（积分）
 *   - BUDGET_POINTS → budget_points（预算积分）
 *   - red_shard → red_core_shard（红源晶碎片），red_crystal → red_core_gem（红源晶）
 *   - 其余5色同理：orange/yellow/green/blue/purple
 *
 * @file 天工餐厅积分系统 - 虚拟资产代码常量
 * @version 1.0.0
 * @since 2026-04-07
 */

// ===== 系统货币（4个） =====

/** 星石 — 平台主货币，用于交易结算、商品定价（原 DIAMOND） */
const STAR_STONE = 'star_stone'

/** 星石配额 — 受限配额，不可交易（原 DIAMOND_QUOTA） */
const STAR_STONE_QUOTA = 'star_stone_quota'

/** 积分 — 用户积分，通过活动/消费获得（原 POINTS） */
const POINTS = 'points'

/** 预算积分 — 商家预算积分，受限使用（原 BUDGET_POINTS） */
const BUDGET_POINTS = 'budget_points'

// ===== 源晶材料（12个，6色 × 2形态） =====

/** 红源晶碎片（原 red_shard） */
const RED_CORE_SHARD = 'red_core_shard'
/** 红源晶（原 red_crystal） */
const RED_CORE_GEM = 'red_core_gem'

/** 橙源晶碎片（原 orange_shard） */
const ORANGE_CORE_SHARD = 'orange_core_shard'
/** 橙源晶（原 orange_crystal） */
const ORANGE_CORE_GEM = 'orange_core_gem'

/** 黄源晶碎片（原 yellow_shard） */
const YELLOW_CORE_SHARD = 'yellow_core_shard'
/** 黄源晶（原 yellow_crystal） */
const YELLOW_CORE_GEM = 'yellow_core_gem'

/** 绿源晶碎片（原 green_shard） */
const GREEN_CORE_SHARD = 'green_core_shard'
/** 绿源晶（原 green_crystal） */
const GREEN_CORE_GEM = 'green_core_gem'

/** 蓝源晶碎片（原 blue_shard） */
const BLUE_CORE_SHARD = 'blue_core_shard'
/** 蓝源晶（原 blue_crystal） */
const BLUE_CORE_GEM = 'blue_core_gem'

/** 紫源晶碎片（原 purple_shard） */
const PURPLE_CORE_SHARD = 'purple_core_shard'
/** 紫源晶（原 purple_crystal） */
const PURPLE_CORE_GEM = 'purple_core_gem'

// ===== 资产形态枚举（对齐后端 material_asset_types.form ENUM） =====

/**
 * 资产形态枚举
 * - shard: 碎片形态（可合成为完整宝石）
 * - gem: 完整宝石形态（原 crystal，2026-04-03 重构为 gem）
 * - currency: 自由流通货币（star_stone、points）
 * - quota: 受限配额（star_stone_quota、budget_points）
 */
const AssetForm = {
  SHARD: 'shard',
  GEM: 'gem',
  CURRENCY: 'currency',
  QUOTA: 'quota'
} as const

// ===== 资产分类辅助函数 =====

/**
 * 判断 asset_code 是否为源晶碎片（以 _core_shard 结尾）
 *
 * @param assetCode - 后端返回的 asset_code 字段值
 * @returns 是否为碎片形态资产
 */
function isCoreShard(assetCode: string): boolean {
  return typeof assetCode === 'string' && assetCode.endsWith('_core_shard')
}

/**
 * 判断 asset_code 是否为完整源晶（以 _core_gem 结尾）
 *
 * @param assetCode - 后端返回的 asset_code 字段值
 * @returns 是否为完整宝石形态资产
 */
function isCoreGem(assetCode: string): boolean {
  return typeof assetCode === 'string' && assetCode.endsWith('_core_gem')
}

/**
 * 判断 asset_code 是否为可在汇率兑换页面展示的资产
 * 包含：星石、所有碎片、所有完整源晶
 *
 * @param assetCode - 后端返回的 asset_code 字段值
 * @returns 是否为可兑换资产
 */
function isExchangeableAsset(assetCode: string): boolean {
  if (typeof assetCode !== 'string') {
    return false
  }
  return assetCode === STAR_STONE || isCoreShard(assetCode) || isCoreGem(assetCode)
}

// ===== 统一导出 =====

module.exports = {
  /* 系统货币 */
  STAR_STONE,
  STAR_STONE_QUOTA,
  POINTS,
  BUDGET_POINTS,
  /* 红色源晶 */
  RED_CORE_SHARD,
  RED_CORE_GEM,
  /* 橙色源晶 */
  ORANGE_CORE_SHARD,
  ORANGE_CORE_GEM,
  /* 黄色源晶 */
  YELLOW_CORE_SHARD,
  YELLOW_CORE_GEM,
  /* 绿色源晶 */
  GREEN_CORE_SHARD,
  GREEN_CORE_GEM,
  /* 蓝色源晶 */
  BLUE_CORE_SHARD,
  BLUE_CORE_GEM,
  /* 紫色源晶 */
  PURPLE_CORE_SHARD,
  PURPLE_CORE_GEM,
  /* 形态枚举 */
  AssetForm,
  /* 分类辅助函数 */
  isCoreShard,
  isCoreGem,
  isExchangeableAsset
}
