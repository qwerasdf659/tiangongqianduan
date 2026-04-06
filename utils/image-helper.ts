/**
 * 图片资源助手模块 — 对齐后端图片管理体系设计方案
 *
 * 核心职责：
 *   1. 材料资产图标映射（16种，按 asset_code 映射本地 WebP）
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

// ===== 材料资产图标映射（16种，对齐后端 material_asset_types 表） =====

/**
 * asset_code → 本地图标路径映射
 *
 * 命名规则：全部 lower_snake_case（对齐后端 Node.js/Sequelize 生态）
 * 图标规格：256×256 WebP（quality 90，视觉无损），暗黑奢华风
 * 存放目录：images/icons/materials/
 * 转换工具：scripts/convert-icons-to-webp.js（Sharp，quality 90, effort 6）
 *
 * 2026-04-03 重构：对齐后端虚拟资产命名体系（星石与源晶）
 *   - DIAMOND → star_stone（星石，主货币）
 *   - POINTS → points（积分）
 *   - BUDGET_POINTS → budget_points（预算积分）
 *   - {color}_shard → {color}_core_shard（源晶碎片）
 *   - {color}_crystal → {color}_core_gem（源晶完整体）
 */
const MATERIAL_ICONS: Record<string, string> = {
  /* tier 10 - 系统货币（星石） */
  star_stone: '/images/icons/materials/star-stone.webp',
  /* tier 0 - 系统配额（星石配额） */
  star_stone_quota: '/images/icons/materials/star-stone-quota.webp',
  /* tier 0 - 基础货币 */
  points: '/images/icons/materials/points.webp',
  budget_points: '/images/icons/materials/budget-points.webp',
  /* tier 1 - 源晶碎片（6色） */
  red_core_shard: '/images/icons/materials/red-core-shard.webp',
  orange_core_shard: '/images/icons/materials/orange-core-shard.webp',
  yellow_core_shard: '/images/icons/materials/yellow-core-shard.webp',
  green_core_shard: '/images/icons/materials/green-core-shard.webp',
  blue_core_shard: '/images/icons/materials/blue-core-shard.webp',
  purple_core_shard: '/images/icons/materials/purple-core-shard.webp',
  /* tier 2 - 源晶完整体（6色） */
  red_core_gem: '/images/icons/materials/red-core-gem.webp',
  orange_core_gem: '/images/icons/materials/orange-core-gem.webp',
  yellow_core_gem: '/images/icons/materials/yellow-core-gem.webp',
  green_core_gem: '/images/icons/materials/green-core-gem.webp',
  blue_core_gem: '/images/icons/materials/blue-core-gem.webp',
  purple_core_gem: '/images/icons/materials/purple-core-gem.webp'
}

// ===== 分类图标映射（9种，对齐后端 categories 表） =====

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

// ===== 资产代码 → 中文显示名（备用映射，优先使用后端 display_name） =====

/**
 * 🔴 注意：此映射仅作为后端 display_name 不可用时的本地兜底
 * 主数据源是后端 GET /api/v4/assets/balances 返回的 display_name 字段
 * 对齐后端 material_asset_types.display_name（2026-04-03 重构）
 */
const ASSET_DISPLAY_NAMES: Record<string, string> = {
  star_stone: '星石',
  star_stone_quota: '星石配额',
  points: '积分',
  budget_points: '预算积分',
  red_core_shard: '红源晶碎片',
  orange_core_shard: '橙源晶碎片',
  yellow_core_shard: '黄源晶碎片',
  green_core_shard: '绿源晶碎片',
  blue_core_shard: '蓝源晶碎片',
  purple_core_shard: '紫源晶碎片',
  red_core_gem: '红源晶',
  orange_core_gem: '橙源晶',
  yellow_core_gem: '黄源晶',
  green_core_gem: '绿源晶',
  blue_core_gem: '蓝源晶',
  purple_core_gem: '紫源晶'
}

// ===== 品质等级视觉配置（对齐后端 item_templates.meta.attribute_rules 品质分分布） =====

/**
 * quality_grade → 颜色+CSS类名+中文名映射
 *
 * 后端铸造物品实例时，由 AttributeRuleEngine 根据概率分布生成：
 *   quality_score (0.00~100.00) → quality_grade (5档)
 * 前端读取 items.instance_attributes.quality_grade 字段展示
 */
const QUALITY_GRADE_STYLES: Record<
  string,
  { colorHex: string; cssClass: string; displayName: string; glowClass: string }
> = {
  完美无瑕: {
    colorHex: '#FFD700',
    cssClass: 'quality--perfect',
    displayName: '完美无瑕',
    glowClass: 'quality-glow-gold'
  },
  精良: {
    colorHex: '#9B59B6',
    cssClass: 'quality--excellent',
    displayName: '精良',
    glowClass: 'quality-glow-purple'
  },
  良好: {
    colorHex: '#3498DB',
    cssClass: 'quality--good',
    displayName: '良好',
    glowClass: 'quality-glow-blue'
  },
  普通: {
    colorHex: '#FFFFFF',
    cssClass: 'quality--normal',
    displayName: '普通',
    glowClass: 'quality-glow-white'
  },
  微瑕: {
    colorHex: '#95A5A6',
    cssClass: 'quality--flawed',
    displayName: '微瑕',
    glowClass: 'quality-glow-gray'
  }
}

/**
 * 获取品质等级视觉配置
 *
 * @param qualityGrade - 后端 instance_attributes.quality_grade（完美无瑕/精良/良好/普通/微瑕）
 * @returns 颜色、CSS类名、中文名、光效类名
 */
function getQualityGradeStyle(qualityGrade: string): {
  colorHex: string
  cssClass: string
  displayName: string
  glowClass: string
} {
  return QUALITY_GRADE_STYLES[qualityGrade] || QUALITY_GRADE_STYLES['普通']
}

/**
 * 格式化限量编号展示文本
 *
 * 后端字段: items.serial_number + items.edition_total
 * 展示格式: #0042 / 0100（补零到 edition_total 位数）
 *
 * @param serialNumber - 限量编号（如 42）
 * @param editionTotal - 限量总数（如 100）
 * @returns 格式化文本（如 "#0042 / 0100"），数据缺失时返回空字符串
 */
function formatEdition(serialNumber: number | null, editionTotal: number | null): string {
  if (!serialNumber || !editionTotal) {
    return ''
  }
  const digits = String(editionTotal).length
  return `#${String(serialNumber).padStart(digits, '0')} / ${String(editionTotal).padStart(digits, '0')}`
}

/**
 * 计算冷却期剩余时间文本
 *
 * 后端字段: item_holds[].expires_at（ISO8601，hold_type='trade_cooldown'）
 * 前端计算倒计时，展示"X天Y小时"或"已结束"
 *
 * @param expiresAt - 冷却期结束时间（ISO8601 字符串）
 * @returns { remaining: string, isActive: boolean }
 */
function formatCooldownRemaining(expiresAt: string): {
  remaining: string
  isActive: boolean
} {
  if (!expiresAt) {
    return { remaining: '', isActive: false }
  }

  const now = Date.now()
  const expiresTime = new Date(expiresAt).getTime()
  if (isNaN(expiresTime)) {
    return { remaining: '', isActive: false }
  }

  const diffMs = expiresTime - now
  if (diffMs <= 0) {
    return { remaining: '已结束', isActive: false }
  }

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

  if (days > 0) {
    return { remaining: `${days}天${hours}小时`, isActive: true }
  }
  if (hours > 0) {
    return { remaining: `${hours}小时${minutes}分钟`, isActive: true }
  }
  return { remaining: `${minutes}分钟`, isActive: true }
}

/**
 * 从物品数据中提取交易冷却期信息
 *
 * 后端返回物品详情时，holds 数组中包含 hold_type='trade_cooldown' 的记录
 * 冷却期内物品可见可用但不可上架交易
 *
 * @param holds - 后端返回的 holds 数组
 * @returns 活跃的冷却期信息，无冷却时返回 null
 */
function getTradeCooldown(
  holds: any[]
): { remaining: string; isActive: boolean; expiresAt: string } | null {
  if (!Array.isArray(holds)) {
    return null
  }
  const cooldownHold = holds.find(
    (h: any) => h.hold_type === 'trade_cooldown' && h.status === 'active'
  )
  if (!cooldownHold || !cooldownHold.expires_at) {
    return null
  }
  const { remaining, isActive } = formatCooldownRemaining(cooldownHold.expires_at)
  return { remaining, isActive, expiresAt: cooldownHold.expires_at }
}

// ===== 工具函数 =====

/**
 * 后端材料图片 URL 文件名 → 本地 asset_code 反向映射
 *
 * 后端 material_icon URL 格式: .../images/materials/{filename}.png
 * 本地 MATERIAL_ICONS key 格式: star_stone / red_core_shard / points 等
 * 文件名与 key 的对应关系: star-stone → star_stone, red-core-shard → red_core_shard
 *
 * 构建方式：遍历 MATERIAL_ICONS，从本地路径提取文件名（不含扩展名），建立反向索引
 */
const URL_FILENAME_TO_ASSET_CODE: Record<string, string> = {}
for (const assetCode of Object.keys(MATERIAL_ICONS)) {
  /* 从本地路径 /images/icons/materials/star-stone.webp 提取 star-stone */
  const localPath = MATERIAL_ICONS[assetCode]
  const match = localPath.match(/\/([^/]+)\.\w+$/)
  if (match) {
    URL_FILENAME_TO_ASSET_CODE[match[1]] = assetCode
  }
}

/**
 * 从后端材料图片 URL 中提取文件名，反向查找本地 WebP 图标路径
 *
 * 适用场景：后端 image.source === 'material_icon' 但 prize.material_asset_code 为空时，
 * 通过 URL 路径反向匹配本地图标，避免使用网络 URL（规避域名白名单问题）
 *
 * @param imageUrl - 后端返回的材料图片 URL（如 https://xxx/api/v4/images/materials/star-stone.png）
 * @returns 本地 WebP 路径，未匹配时返回空字符串
 */
function getLocalIconFromMaterialUrl(imageUrl: string): string {
  if (!imageUrl) {
    return ''
  }
  /* 从 URL 提取最后一段文件名（不含扩展名）: .../materials/star-stone.png → star-stone */
  const match = imageUrl.match(/\/([^/]+)\.\w+$/)
  if (!match) {
    return ''
  }
  const filename = match[1]
  const assetCode = URL_FILENAME_TO_ASSET_CODE[filename]
  if (assetCode) {
    return MATERIAL_ICONS[assetCode]
  }
  return ''
}

/**
 * 获取材料资产的本地图标路径
 *
 * @param assetCode - 后端 asset_code（如 'star_stone', 'red_core_shard'）
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
 * 数据源优先级（对齐文档第十四节原则：优先使用后端返回的 display_name）：
 *   1. 调用方传入的 backendDisplayName（后端 API 返回的 display_name 字段）
 *   2. 本地 ASSET_DISPLAY_NAMES 映射表（兜底，仅在后端数据不可用时使用）
 *   3. 原样返回 assetCode（未知资产代码）
 *
 * @param assetCode - 后端 asset_code（如 'star_stone'、'red_core_shard'）
 * @param backendDisplayName - 后端 API 返回的 display_name 字段值（可选，优先使用）
 * @returns 中文名称，未知代码原样返回
 */
function getAssetDisplayName(assetCode: string, backendDisplayName?: string): string {
  if (!assetCode) {
    return ''
  }
  /** 优先使用后端返回的 display_name（数据权威来源） */
  if (backendDisplayName) {
    return backendDisplayName
  }
  /** 兜底：本地映射表（后端 display_name 不可用时） */
  return ASSET_DISPLAY_NAMES[assetCode] || assetCode
}

/**
 * 为交易市场挂单计算展示图片路径
 *
 * 降级链：
 *   item 类型 → item_info.primary_media.public_url（后端完整URL）→ 分类图标 → 占位图
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

  const primaryMediaUrl =
    listing.item_info?.primary_media?.public_url ||
    listing.item_info?.primary_media?.thumbnails?.medium
  if (primaryMediaUrl) {
    return primaryMediaUrl
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
  QUALITY_GRADE_STYLES,
  ASSET_DISPLAY_NAMES,
  DEFAULT_PRODUCT_IMAGE,
  DEFAULT_AVATAR,
  getMaterialIconPath,
  getCategoryIconPath,
  getRarityStyle,
  getQualityGradeStyle,
  getAssetDisplayName,
  getListingDisplayImage,
  getListingDisplayName,
  getLocalIconFromMaterialUrl,
  formatEdition,
  formatCooldownRemaining,
  getTradeCooldown
}
