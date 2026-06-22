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
 *
 * @file 天工平台 - 图片资源助手
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
 * 选取「列表卡片」用的清晰图 URL（对齐《兑换商城图片清晰度优化方案》§12.3 方式二，按 DPR 动态裁剪）
 *
 * 后端 primary_image / prize image 现已下发：
 *   - url：原图（走 /api/v4/images 代理，支持 ?width= 动态裁剪输出 WebP，§12.2）
 *   - thumbnails.{small=150, medium=300, large=800}：预生成多档
 *   - thumbnail_url：small(150)，过小、仅兜底
 *
 * 取图策略：
 *   1. 传入 displayWidthPx（卡片 CSS 显示宽，rpx 或 px 皆可按比例）→ 走方式二：
 *      对原图 url 追加 ?width=（= 显示宽 × 设备 DPR），后端按离散档 {375,560,750,1080} 向上取整、
 *      >1080 钳制 1200，返回 WebP（更清晰更省流）。保留原 url 上的 ?h= content_hash 不动。
 *   2. 未传 displayWidthPx 或无原图 url → 走方式一兜底：thumbnails.large(800) → medium → thumbnail_url → url。
 *   3. 全缺 → 默认占位图。
 *
 * 详情页主图请直接用 image.url（原图）或 image.url?width=1080，不要用本函数。
 *
 * @param imageObj       后端 primary_image / prize.image 对象
 * @param displayWidthPx 卡片显示宽度（px；传 0/省略则走方式一 large 档兜底）
 * @returns 列表卡片用图 URL，缺失时返回默认商品占位图
 */
function pickListImageUrl(imageObj: any, displayWidthPx?: number): string {
  if (!imageObj) {
    return DEFAULT_PRODUCT_IMAGE
  }
  const thumbnails = imageObj.thumbnails || {}
  const originUrl: string = imageObj.url || ''

  /* 方式二：原图代理 URL + ?width=（按 DPR），后端动态裁剪输出 WebP */
  if (displayWidthPx && displayWidthPx > 0 && originUrl) {
    const targetWidth = computeDprWidth(displayWidthPx)
    return appendQueryParam(originUrl, 'width', String(targetWidth))
  }

  /* 方式一兜底：large(800) 档 */
  return (
    thumbnails.large ||
    thumbnails.medium ||
    imageObj.thumbnail_url ||
    originUrl ||
    DEFAULT_PRODUCT_IMAGE
  )
}

/**
 * 按设备 DPR 计算请求像素宽（displayWidthPx × pixelRatio，上限 1200 与后端钳制一致）
 * DPR 获取失败时按 2 兜底；上限 1200 避免无意义超大请求（后端同样钳制 1200）
 */
function computeDprWidth(displayWidthPx: number): number {
  let dpr = 2
  try {
    dpr = wx.getWindowInfo().pixelRatio || 2
  } catch (_e) {
    dpr = 2
  }
  const width = Math.ceil(displayWidthPx * dpr)
  return Math.min(width, 1200)
}

/**
 * 安全地往 URL 追加/覆盖一个 query 参数（保留已有 ?h= 等参数）
 * 已存在同名参数时覆盖其值，否则按 ? / & 规则拼接
 */
function appendQueryParam(url: string, key: string, value: string): string {
  if (!url) {
    return url
  }
  const re = new RegExp(`([?&])${key}=[^&]*`)
  if (re.test(url)) {
    return url.replace(re, `$1${key}=${value}`)
  }
  return url + (url.indexOf('?') === -1 ? '?' : '&') + `${key}=${value}`
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
  getLocalIconFromMaterialUrl,
  formatEdition,
  pickListImageUrl
}
