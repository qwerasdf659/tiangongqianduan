/**
 * 商品展示字段增强 — 纯函数（无 this 依赖）
 *
 * 为后端返回的商品数据附加前端展示用计算字段：
 *   _priceLabel:   资产代码中文化（star_stone→星石）
 *   _rarityClass:  稀有度 CSS class（对齐 rarity-effects 组件）
 *   _isLegendary:  是否触发全息光效
 *   _isLimited:    是否限量（触发旋转边框）
 *   _hasImage:     是否有有效商品图片
 *
 * 资产映射数据统一从 utils/image-helper.ts 获取，避免多处硬编码
 *
 * 迁移说明：从 packageExchange/utils/product-display.ts 迁移至主包 utils/，
 * 解决主包组件跨分包 require 导致运行时 module not defined 的问题。
 *
 * @file utils/product-display.ts
 * @version 5.3.0
 * @since 2026-02-22
 */

const imageHelperModule = require('./image-helper')
const { DEFAULT_PRODUCT_IMAGE, RARITY_STYLES, getAssetDisplayName, MATERIAL_ICONS } =
  imageHelperModule

/** 触发全息光效的稀有度等级（epic + legendary） */
const HOLO_RARITIES = ['legendary', 'epic']

/**
 * 拼装商品等级门槛的展示文案（兑换商城等级区间门槛，拍板⑪橱窗效应）
 *
 * 后端字段 level_requirement（列表/详情接口下发，无门槛为 null，对接文档 §十一-M4）:
 *   min_level_name  最低等级展示名（如 黑金卡），null=不限下限
 *   max_level_name  最高等级展示名（如 银卡），null=不限上限
 *   satisfied       当前用户是否满足（后端实时计算，未登录恒 false）
 *
 * 组合语义（与后端 §2.5 一致）:
 *   仅 min          → "{min}及以上专享"（高价值商品门槛）
 *   仅 max          → "{max}及以下专享"（新人专享等场景）
 *   min = max       → "{min}专属"（仅某等级）
 *   min + max       → "{min}至{max}专享"（区间）
 *
 * @param levelRequirement - 后端 level_requirement 对象（可为 null）
 * @returns 展示文案；无门槛返回空字符串
 */
function formatLevelRequirementLabel(levelRequirement: any): string {
  if (!levelRequirement || typeof levelRequirement !== 'object') {
    return ''
  }
  const minLevelName = levelRequirement.min_level_name || ''
  const maxLevelName = levelRequirement.max_level_name || ''
  if (minLevelName && maxLevelName) {
    return minLevelName === maxLevelName
      ? `${minLevelName}专属`
      : `${minLevelName}至${maxLevelName}专享`
  }
  if (minLevelName) {
    return `${minLevelName}及以上专享`
  }
  if (maxLevelName) {
    return `${maxLevelName}及以下专享`
  }
  return ''
}

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
 *   - 物品实例（背包/兑换铸造）: rarity_code（来自 items → item_templates）
 *   - 兑换商品（exchange_items）: rarity_code（exchange_items 表直属列，B8 新增）
 *
 * @param productList - 后端返回的商品数据数组
 * @returns 附加了展示字段的商品数据数组
 */
function enrichProductDisplayFields(productList: any[]): any[] {
  if (!Array.isArray(productList)) {
    return productList
  }

  return productList.map(function (productItem) {
    const priceCode = productItem.cost_asset_code || ''
    const rarityValue = productItem.rarity_code || ''
    const imgSrc = productItem.image || ''
    const validImage = imgSrc && imgSrc !== DEFAULT_PRODUCT_IMAGE && !productItem._imageError

    const rarityConfig = RARITY_STYLES[rarityValue]
    const rarityClass = rarityConfig ? rarityConfig.cssClass : ''

    return Object.assign({}, productItem, {
      /**
       * 计价资产中文名：优先读后端字典下发的 cost_asset_name（material_asset_types.display_name），
       * 后端未下发时回退本地映射（兼容旧接口），前端不再单独维护资产码→中文映射表。
       */
      _priceLabel: formatAssetLabel(priceCode, productItem.cost_asset_name),
      /**
       * 计价资产图标：优先用后端下发的完整 URL cost_asset_icon_url（带内容哈希、可直接 <image> 加载），
       * 后端未下发（null/空）时回退本地静态图标；都没有则为空字符串，由 WXML 兜底为纯文字。
       */
      _priceIcon: productItem.cost_asset_icon_url || MATERIAL_ICONS[priceCode] || '',
      _rarityClass: rarityClass,
      _isLegendary: HOLO_RARITIES.includes(rarityValue),
      _isLimited: productItem.is_limited === true,
      _hasImage: validImage,
      /** 铸造开关标识（后端 mint_instance 字段，true=兑换后自动铸造物品实例） */
      _mintInstance: productItem.mint_instance === true,
      /** 等级门槛角标文案（后端 level_requirement，无门槛为空串不渲染，对接文档 §十一-M4） */
      _levelBadgeText: formatLevelRequirementLabel(productItem.level_requirement),
      /** 等级门槛未满足（satisfied=false 时专享角标 + 置灰兑换按钮，橱窗效应：锁住但可见） */
      _levelLocked: !!(
        productItem.level_requirement && productItem.level_requirement.satisfied === false
      )
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
 * 解析多规格 SKU 的选中单价（权威取 channelPrices[0].cost_amount，回退到 SPU 展示价）
 *
 * 后端契约（兑换对接文档 16.1）：每个 SKU 的真实单价在 channelPrices[].cost_amount，
 * 已由后端 DataSanitizer 出口归一为 number；多规格时 SPU 级 cost_amount 仅为"最低价"，
 * 不等于选中规格价，故选中规格的单价以该 SKU 的 channelPrices 为准。
 *
 * @param sku - 选中的 SKU 对象（含 channelPrices）
 * @param fallbackCost - SKU 无渠道价时的回退（通常传 SPU 的 cost_amount，已是 number）
 * @returns 数值单价（无法解析时返回 0）
 */
function resolveSkuUnitCost(sku: any, fallbackCost?: number): number {
  if (sku && Array.isArray(sku.channelPrices) && sku.channelPrices.length > 0) {
    const enabled = sku.channelPrices.find((p: any) => p && p.is_enabled !== false)
    const picked = enabled || sku.channelPrices[0]
    if (picked && typeof picked.cost_amount === 'number' && !isNaN(picked.cost_amount)) {
      return picked.cost_amount
    }
  }
  if (typeof fallbackCost === 'number' && !isNaN(fallbackCost)) {
    return fallbackCost
  }
  return 0
}

/**
 * 全量 SKU 模式下，从列表/货架卡片上的商品对象解析「一键兑换」是否可直接传 sku_id
 *
 * 取值优先级（对齐兑换对接文档：列表接口给 default_sku_id，详情接口给 skus[]）：
 * 1. default_sku_id 不为 null → 单 active SKU 商品，直接用它（列表/货架首选，轻量）
 * 2. 退而求其次：商品对象带完整 skus[] 时，按 active+单默认规格 解析
 * 3. 多规格（default_sku_id 为 null 或 skus 多条/带规格）→ 必须进详情选规格
 *
 * @param productItem - GET /exchange/items 列表项（含 default_sku_id）或详情 item（含 skus）
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

  // ① 列表接口权威字段：default_sku_id（单 active SKU 给值；多 SKU 为 null）
  const rawDefaultSkuId = productItem.default_sku_id
  if (rawDefaultSkuId !== null && rawDefaultSkuId !== undefined) {
    const defaultSid = parseInt(String(rawDefaultSkuId), 10)
    if (defaultSid > 0) {
      return { ok: true, sku_id: defaultSid }
    }
  }

  // ② 详情/含 skus[] 的对象：按 active + 单默认规格 解析
  const rawSkus: any[] = Array.isArray(productItem.skus) ? productItem.skus : []
  /** 与兑换详情页一致：仅 status === 'active' 的 SKU 参与售卖（缺省 status 视为非上架，由后端保证字段完整） */
  const activeSkus = rawSkus.filter((sku: any) => sku && sku.status === 'active')

  if (activeSkus.length === 0) {
    // default_sku_id 显式为 null 表示"多规格需进详情"，比"无 SKU"更准确
    if (rawDefaultSkuId === null) {
      return {
        ok: false,
        reason: 'need_detail',
        message: '该商品有多规格，请进入商品详情选择规格后再兑换'
      }
    }
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
  formatLevelRequirementLabel,
  HOLO_RARITIES,
  isEmptySkuSpecValues,
  resolveQuickExchangeSkuId,
  resolveSkuUnitCost
}
