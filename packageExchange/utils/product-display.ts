/**
 * 商品展示字段增强 — 纯函数（无 this 依赖）
 *
 * 为后端返回的商品/挂单数据附加前端展示用计算字段：
 *   _priceLabel:   资产代码中文化（DIAMOND→钻石）
 *   _rarityClass:  稀有度 CSS class（对齐 rarity-effects 组件）
 *   _isLegendary:  是否触发全息光效
 *   _isLimited:    是否限量（触发旋转边框）
 *   _hasImage:     是否有有效商品图片
 *
 * 资产映射数据统一从 utils/image-helper.ts 获取，避免多处硬编码
 *
 * @file packageExchange/utils/product-display.ts
 * @version 1.1.0
 * @since 2026-02-22
 */

const { ImageHelper } = require('../../utils/index')
const { ASSET_DISPLAY_NAMES, DEFAULT_PRODUCT_IMAGE, RARITY_STYLES } = ImageHelper

/** 触发全息光效的稀有度等级（epic + legendary） */
const HOLO_RARITIES = ['legendary', 'epic']

/**
 * 将 asset_code 转换为中文显示名
 *
 * @param assetCode - 后端资产代码（如 'DIAMOND', 'red_shard'）
 * @returns 中文显示名（如 '钻石'），未知代码原样返回
 */
function formatAssetLabel(assetCode: string): string {
  return ASSET_DISPLAY_NAMES[assetCode] || assetCode
}

/**
 * 为商品列表数据附加前端展示用计算字段
 *
 * @param productList - 后端返回的商品/挂单数据数组
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

    const rarityConfig = RARITY_STYLES[rarityValue]
    const rarityClass = rarityConfig ? rarityConfig.cssClass : ''

    return Object.assign({}, productItem, {
      _priceLabel: formatAssetLabel(priceCode),
      _rarityClass: rarityClass,
      _isLegendary: HOLO_RARITIES.includes(rarityValue),
      _isLimited: productItem.is_limited === true,
      _hasImage: validImage
    })
  })
}

module.exports = {
  enrichProductDisplayFields,
  formatAssetLabel,
  HOLO_RARITIES
}

export {}
