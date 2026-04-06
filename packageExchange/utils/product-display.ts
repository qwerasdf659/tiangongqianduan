/**
 * 商品展示字段增强 — 纯函数（无 this 依赖）
 *
 * 为后端返回的商品/挂单数据附加前端展示用计算字段：
 *   _priceLabel:   资产代码中文化（star_stone→星石）
 *   _rarityClass:  稀有度 CSS class（对齐 rarity-effects 组件）
 *   _isLegendary:  是否触发全息光效
 *   _isLimited:    是否限量（触发旋转边框）
 *   _hasImage:     是否有有效商品图片
 *
 * 资产映射数据统一从 utils/image-helper.ts 获取，避免多处硬编码
 *
 * @file packageExchange/utils/product-display.ts
 * @version 5.2.0
 * @since 2026-02-22
 */

const { ImageHelper, AssetCodes: displayAssetCodes } = require('../../utils/index')
const { DEFAULT_PRODUCT_IMAGE, RARITY_STYLES, getAssetDisplayName } = ImageHelper

/** 触发全息光效的稀有度等级（epic + legendary） */
const HOLO_RARITIES = ['legendary', 'epic']

/**
 * 将 asset_code 转换为中文显示名
 * 统一走 getAssetDisplayName 链路（后端 display_name 优先 → 本地映射兜底 → 原样返回）
 *
 * @param assetCode - 后端资产代码（如 'star_stone', 'red_core_shard'）
 * @param backendDisplayName - 后端返回的 display_name（可选，优先使用）
 * @returns 中文显示名（如 '星石'），未知代码原样返回
 */
function formatAssetLabel(assetCode: string, backendDisplayName?: string): string {
  return getAssetDisplayName(assetCode, backendDisplayName)
}

/**
 * 为商品列表数据附加前端展示用计算字段
 *
 * 稀有度来源优先级（两种业务场景）：
 *   - 交易市场挂单（C2C）: offer_item_rarity（来自 item_instances → item_templates）
 *   - 兑换商品（exchange_items）: rarity_code（exchange_items 表直属列，B8 新增）
 *
 * @param productList - 后端返回的商品/挂单数据数组
 * @returns 附加了展示字段的商品数据数组
 */
function enrichProductDisplayFields(productList: any[]): any[] {
  if (!Array.isArray(productList)) {
    return productList
  }

  return productList.map(function (productItem) {
    const priceCode =
      productItem.price_asset_code || productItem.cost_asset_code || displayAssetCodes.POINTS
    const rarityValue = productItem.offer_item_rarity || productItem.rarity_code || ''
    const imgSrc = productItem.image || ''
    const validImage = imgSrc && imgSrc !== DEFAULT_PRODUCT_IMAGE && !productItem._imageError

    const rarityConfig = RARITY_STYLES[rarityValue]
    const rarityClass = rarityConfig ? rarityConfig.cssClass : ''

    return Object.assign({}, productItem, {
      _priceLabel: formatAssetLabel(priceCode),
      _rarityClass: rarityClass,
      _isLegendary: HOLO_RARITIES.includes(rarityValue),
      _isLimited: productItem.is_limited === true,
      _hasImage: validImage,
      /** 铸造开关标识（后端 mint_instance 字段，true=兑换后自动铸造物品实例） */
      _mintInstance: productItem.mint_instance === true
    })
  })
}

/**
 * 判断 SKU 的 spec_values 是否为空对象（单品默认规格）
 *
 * @param specValues - 后端 exchange_item_skus.spec_values（JSON）
 */
function isEmptySkuSpecValues(specValues: any): boolean {
  return !specValues || Object.keys(specValues).length === 0
}

/**
 * 全量 SKU 模式下，从列表/货架卡片上的商品对象解析「一键兑换」是否可直接传 sku_id
 *
 * 业务规则（与兑换详情页一致，以后端下发的 skus[] 为唯一依据）：
 * - 无任何有效 SKU：不可兑换，需后端在列表/详情接口补齐 skus
 * - 仅 1 条上架 SKU 且 spec 为空：视为单品默认 SKU，可在货架直接传 sku_id
 * - 多条 SKU，或单条但带规格维度：必须到商品详情由用户选规格后再兑换
 *
 * @param productItem - GET /exchange/items 列表项或详情 item（须含 skus 数组时才可直兑）
 */
function resolveQuickExchangeSkuId(productItem: any): {
  ok: boolean
  sku_id?: number
  reason?: 'no_skus' | 'need_detail' | 'sold_out'
  /** 给用户看的说明（中文，不含敏感信息） */
  message?: string
} {
  if (!productItem || typeof productItem !== 'object') {
    return { ok: false, reason: 'no_skus', message: '商品数据异常，请稍后重试' }
  }

  const rawSkus: any[] = Array.isArray(productItem.skus) ? productItem.skus : []
  /** 与兑换详情页一致：仅 status === 'active' 的 SKU 参与售卖（缺省 status 视为非上架，由后端保证字段完整） */
  const activeSkus = rawSkus.filter((sku: any) => sku && sku.status === 'active')

  if (activeSkus.length === 0) {
    return {
      ok: false,
      reason: 'no_skus',
      message: '该商品未返回可售规格（SKU），请进入商品详情或联系运营检查后台配置'
    }
  }

  const hasMulti =
    activeSkus.length > 1 ||
    (activeSkus.length === 1 && !isEmptySkuSpecValues(activeSkus[0].spec_values))

  if (hasMulti) {
    return {
      ok: false,
      reason: 'need_detail',
      message: '该商品有多规格，请进入商品详情选择规格后再兑换'
    }
  }

  const only = activeSkus[0]
  const stock = typeof only.stock === 'number' ? only.stock : 0
  if (stock <= 0) {
    return { ok: false, reason: 'sold_out', message: '该规格暂时无货' }
  }

  const sid = parseInt(String(only.sku_id), 10)
  if (!sid) {
    return { ok: false, reason: 'no_skus', message: 'SKU 数据不完整，请进入商品详情重试' }
  }

  return { ok: true, sku_id: sid }
}

module.exports = {
  enrichProductDisplayFields,
  formatAssetLabel,
  HOLO_RARITIES,
  isEmptySkuSpecValues,
  resolveQuickExchangeSkuId
}
