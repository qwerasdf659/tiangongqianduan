/**
 * 图片资源助手模块 — 对齐后端图片管理体系设计方案
 *
 * 核心职责：
 *   1. 材料资产图标映射（15种，按 asset_code 映射本地 WebP）
 *   2. 商品分类图标映射（9种，按 category_code 映射本地 WebP）
 *   3. 稀有度视觉配置（5级，按 rarity_code 返回颜色和CSS类名）
 *   4. 图片降级链工具（后端实图 → 本地图标 → 占位图）
 *
 * 图标格式：WebP quality 90（视觉无损，体积比PNG减少60%）
 *   - 2026-02-22 由 PNG 迁移至 WebP，详见《图标WebP优化方案》
 *   - 微信小程序基础库 2.9.0+ 原生支持 WebP，<image> 组件可直接加载
 *
 * 设计决策依据（2026-02-21 拍板）：
 *   - 材料图标采用前端静态映射（游戏公司做法，零网络请求）
 *   - 分类图标采用前端静态映射（数量固定9个）
 *   - 稀有度视觉用纯CSS实现（后端 rarity_defs.color_hex 驱动）
 *   - C2C交易市场只显示系统资产图标，不支持用户上传图片（决策5）
 *
 * @file 天工餐厅积分系统 - 图片资源助手
 * @version 5.2.0
 * @since 2026-02-22
 */

// ===== 默认图片路径 =====

/** 默认商品占位图 */
const DEFAULT_PRODUCT_IMAGE = '/images/default-product.png'

/** 默认头像 */
const DEFAULT_AVATAR = '/images/default-avatar.png'

// ===== 材料资产图标映射（15种，对齐后端 material_asset_types 表） =====

/**
 * asset_code → 本地图标路径映射
 *
 * 图标规格：256×256 WebP（quality 90，视觉无损），暗黑奢华风
 * 存放目录：images/icons/materials/
 * 转换工具：scripts/convert-icons-to-webp.js（Sharp，quality 90, effort 6）
 */
const MATERIAL_ICONS: Record<string, string> = {
  /* tier 10 - 系统货币 */
  DIAMOND: '/images/icons/materials/diamond.webp',
  /* tier 0 - 基础货币 */
  POINTS: '/images/icons/materials/points.webp',
  BUDGET_POINTS: '/images/icons/materials/budget-points.webp',
  /* tier 1 - 碎片（6色） */
  red_shard: '/images/icons/materials/red-shard.webp',
  orange_shard: '/images/icons/materials/orange-shard.webp',
  yellow_shard: '/images/icons/materials/yellow-shard.webp',
  green_shard: '/images/icons/materials/green-shard.webp',
  blue_shard: '/images/icons/materials/blue-shard.webp',
  purple_shard: '/images/icons/materials/purple-shard.webp',
  /* tier 2 - 水晶（6色） */
  red_crystal: '/images/icons/materials/red-crystal.webp',
  orange_crystal: '/images/icons/materials/orange-crystal.webp',
  yellow_crystal: '/images/icons/materials/yellow-crystal.webp',
  green_crystal: '/images/icons/materials/green-crystal.webp',
  blue_crystal: '/images/icons/materials/blue-crystal.webp',
  purple_crystal: '/images/icons/materials/purple-crystal.webp'
}

// ===== 分类图标映射（9种，对齐后端 category_defs 表） =====

/**
 * category_code → 本地图标路径映射
 *
 * 图标规格：256×256 WebP（quality 90，视觉无损），暗黑奢华风
 * 存放目录：images/icons/categories/
 * 转换工具：scripts/convert-icons-to-webp.js（Sharp，quality 90, effort 6）
 */
const CATEGORY_ICONS: Record<string, string> = {
  electronics: '/images/icons/categories/electronics.webp',
  food_drink: '/images/icons/categories/food-drink.webp',
  voucher: '/images/icons/categories/voucher.webp',
  gift_card: '/images/icons/categories/gift-card.webp',
  home_life: '/images/icons/categories/home-life.webp',
  lifestyle: '/images/icons/categories/lifestyle.webp',
  food: '/images/icons/categories/food.webp',
  collectible: '/images/icons/categories/collectible.webp',
  other: '/images/icons/categories/other.webp'
}

// ===== 稀有度视觉配置（5级，对齐后端 rarity_defs 表 color_hex） =====

/** rarity_code → 颜色+CSS类名映射 */
const RARITY_STYLES: Record<string, { colorHex: string; cssClass: string; displayName: string }> = {
  common: { colorHex: '#9E9E9E', cssClass: 'rarity--common', displayName: '普通' },
  uncommon: { colorHex: '#4CAF50', cssClass: 'rarity--uncommon', displayName: '稀有' },
  rare: { colorHex: '#2196F3', cssClass: 'rarity--rare', displayName: '精良' },
  epic: { colorHex: '#9C27B0', cssClass: 'rarity--epic', displayName: '史诗' },
  legendary: { colorHex: '#FF9800', cssClass: 'rarity--legendary', displayName: '传说' }
}

// ===== 资产代码 → 中文显示名（完整15种，对齐后端 material_asset_types.display_name） =====

const ASSET_DISPLAY_NAMES: Record<string, string> = {
  DIAMOND: '钻石',
  POINTS: '普通积分',
  BUDGET_POINTS: '预算积分',
  red_shard: '红水晶碎片',
  orange_shard: '橙水晶碎片',
  yellow_shard: '黄水晶碎片',
  green_shard: '绿水晶碎片',
  blue_shard: '蓝水晶碎片',
  purple_shard: '紫水晶碎片',
  red_crystal: '红水晶',
  orange_crystal: '橙水晶',
  yellow_crystal: '黄水晶',
  green_crystal: '绿水晶',
  blue_crystal: '蓝水晶',
  purple_crystal: '紫水晶'
}

// ===== 工具函数 =====

/**
 * 获取材料资产的本地图标路径
 *
 * @param assetCode - 后端 asset_code（如 'DIAMOND', 'red_shard'）
 * @returns 本地图标路径，未匹配时返回默认商品图
 */
function getMaterialIconPath(assetCode: string): string {
  if (!assetCode) {
    return DEFAULT_PRODUCT_IMAGE
  }
  return MATERIAL_ICONS[assetCode] || DEFAULT_PRODUCT_IMAGE
}

/**
 * 获取商品分类的本地图标路径
 *
 * @param categoryCode - 后端 category_code（如 'electronics', 'food_drink'）
 * @returns 本地图标路径，未匹配时返回默认商品图
 */
function getCategoryIconPath(categoryCode: string): string {
  if (!categoryCode) {
    return DEFAULT_PRODUCT_IMAGE
  }
  return CATEGORY_ICONS[categoryCode] || DEFAULT_PRODUCT_IMAGE
}

/**
 * 获取稀有度视觉配置
 *
 * @param rarityCode - 后端 rarity_code（common/uncommon/rare/epic/legendary）
 * @returns 颜色、CSS类名、中文名
 */
function getRarityStyle(rarityCode: string): {
  colorHex: string
  cssClass: string
  displayName: string
} {
  return RARITY_STYLES[rarityCode] || RARITY_STYLES.common
}

/**
 * 获取资产代码的中文显示名
 *
 * @param assetCode - 后端 asset_code
 * @returns 中文名称，未知代码原样返回
 */
function getAssetDisplayName(assetCode: string): string {
  if (!assetCode) {
    return ''
  }
  return ASSET_DISPLAY_NAMES[assetCode] || assetCode
}

/**
 * 为交易市场挂单计算展示图片路径
 *
 * 降级链：
 *   item_instance 类型 → item_info.image_url（后端完整URL）→ 分类图标 → 占位图
 *   fungible_asset 类型 → 本地材料图标（按 asset_code 映射）→ 占位图
 *
 * @param listing - 后端返回的 market_listing 对象
 * @returns 可直接绑定到 <image src> 的路径
 */
function getListingDisplayImage(listing: any): string {
  if (!listing) {
    return DEFAULT_PRODUCT_IMAGE
  }

  if (listing.listing_kind === 'fungible_asset') {
    const assetCode =
      (listing.asset_info && listing.asset_info.asset_code) || listing.offer_asset_code
    return getMaterialIconPath(assetCode)
  }

  const imageUrl = listing.item_info && listing.item_info.image_url
  if (imageUrl) {
    return imageUrl
  }

  const categoryCode = listing.item_info && listing.item_info.category_code
  if (categoryCode) {
    return getCategoryIconPath(categoryCode)
  }

  return DEFAULT_PRODUCT_IMAGE
}

/**
 * 为交易市场挂单计算展示名称
 *
 * @param listing - 后端返回的 market_listing 对象
 * @returns 商品/资产展示名称
 */
function getListingDisplayName(listing: any): string {
  if (!listing) {
    return '未知商品'
  }

  if (listing.listing_kind === 'fungible_asset') {
    return (
      (listing.asset_info && listing.asset_info.display_name) ||
      listing.offer_asset_display_name ||
      getAssetDisplayName(
        (listing.asset_info && listing.asset_info.asset_code) || listing.offer_asset_code || ''
      ) ||
      '未知资产'
    )
  }

  return (
    (listing.item_info && listing.item_info.display_name) ||
    listing.offer_item_display_name ||
    '未知物品'
  )
}

module.exports = {
  MATERIAL_ICONS,
  CATEGORY_ICONS,
  RARITY_STYLES,
  ASSET_DISPLAY_NAMES,
  DEFAULT_PRODUCT_IMAGE,
  DEFAULT_AVATAR,
  getMaterialIconPath,
  getCategoryIconPath,
  getRarityStyle,
  getAssetDisplayName,
  getListingDisplayImage,
  getListingDisplayName
}
