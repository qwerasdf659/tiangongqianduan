/**
 * 兑换商品展示字段增强 — 纯函数（无 this 依赖）
 *
 * 为后端返回的商品数据附加前端展示用计算字段：
 *   _priceLabel: 资产代码中文化（POINTS→积分）
 *   _rarityClass: 稀有度 CSS class（仅交易市场有值）
 *   _isLegendary: 是否触发全息光效
 *   _isLimited: 是否限量（触发旋转边框）
 *   _hasImage: 是否有有效商品图片（触发全图叠字模式）
 *
 * @file packageExchange/utils/product-display.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

/** 资产代码→中文显示名映射（后端 asset_code → 前端展示文案） */
const ASSET_DISPLAY_MAP: Record<string, string> = {
  POINTS: '积分',
  red_shard: '红色碎片',
  blue_shard: '蓝色碎片',
  gold_coin: '金币',
  diamond: '钻石'
}

/** 稀有度值→CSS class 映射 */
const RARITY_CLASS_MAP: Record<string, string> = {
  普通: 'common',
  稀有: 'rare',
  史诗: 'epic',
  传说: 'legend',
  common: 'common',
  rare: 'rare',
  epic: 'epic',
  legendary: 'legend'
}

/** 触发全息光效的稀有度等级 */
const HOLO_RARITIES = ['legendary', 'epic', '传说', '史诗']

/** 默认商品图片路径 */
const DEFAULT_PRODUCT_IMAGE = '/images/products/default-product.png'

/**
 * 将 asset_code 转换为中文显示名
 * @param assetCode 后端资产代码（如 'POINTS'）
 * @returns 中文显示名（如 '积分'），未知代码原样返回
 */
function formatAssetLabel(assetCode: string): string {
  return ASSET_DISPLAY_MAP[assetCode] || assetCode
}

/**
 * 为商品列表数据附加前端展示用计算字段
 *
 * @param productList 后端返回的商品数据数组
 * @returns 附加了展示字段的商品数据数组
 */
function enrichProductDisplayFields(productList: any[]): any[] {
  if (!Array.isArray(productList)) {
    return productList
  }

  return productList.map(function (productItem) {
    const priceCode = productItem.price_asset_code || productItem.cost_asset_code || 'POINTS'
    const rarityValue = productItem.offer_item_rarity || ''
    const imgSrc = productItem.image || ''
    const validImage = imgSrc && imgSrc !== DEFAULT_PRODUCT_IMAGE && !productItem._imageError

    return Object.assign({}, productItem, {
      _priceLabel: formatAssetLabel(priceCode),
      _rarityClass: RARITY_CLASS_MAP[rarityValue] || '',
      _isLegendary: HOLO_RARITIES.includes(rarityValue),
      _isLimited: productItem.is_limited === true,
      _hasImage: validImage
    })
  })
}

module.exports = {
  enrichProductDisplayFields,
  formatAssetLabel,
  ASSET_DISPLAY_MAP,
  RARITY_CLASS_MAP,
  HOLO_RARITIES
}

export {}
