/**
 * 兑换商品详情页 — B+C混合方案（白底密排信息骨架 + 游戏化视觉外衣）
 *
 * 十大区块:
 *   ① 图片区（轮播/单图/emoji占位）
 *   ② 标签区（game风彩色 / plain灰底，由页面配置控制）
 *   ③ 价格区（大号渐变数字 + 划线原价 + 省XX标签）
 *   ④ 属性区（grid网格卡片 / list文字列表，由页面配置控制）
 *   ⑤ 商品介绍区（纯文字 / 长图 / 混排）
 *   ⑥ 展示图区（0张隐藏 / 1张单图 / 多张网格或横滚）
 *   ⑦ 使用说明区（后端配置 / 前端通用规则兜底）
 *   ⑧ 相关推荐区（同分类商品2列卡片）
 *   ⑨ 标签云（# 前缀水平流式排列）
 *   ⑩ 吸底操作栏（余额 + 客服 + 兑换按钮）
 *
 * 后端API:
 *   商品详情: GET /api/v4/exchange/items/:exchange_item_id
 *   执行兑换: POST /api/v4/exchange（body: { exchange_item_id, quantity, sku_id }，sku_id 全量 SKU 模式必填）
 *   用户余额: GET /api/v4/assets/balances
 *   页面配置: GET /api/v4/system/config/exchange-page
 *   相关推荐: GET /api/v4/exchange/items?category_id=xxx&exclude_id=xxx&page_size=4
 *
 * 响应层级: detailResponse.data.item（后端统一 ApiResponse 包装）
 *
 * @file packageExchange/exchange-detail/exchange-detail.ts
 * @version 3.0.0
 * @since 2026-03-15
 */

const {
  API: DetailPageAPI,
  Logger: DetailPageLogger,
  ImageHelper: detailPageImageHelper,
  ExchangeConfig: DetailPageExchangeConfig,
  AssetCodes: detailAssetCodes
} = require('../../utils/index')
const { formatAssetLabel } = require('../utils/product-display')

const edLog = DetailPageLogger.createLogger('exchange-detail')

/** 全息效果稀有度白名单（epic / legendary 触发脉冲光效） */
const HOLO_RARITY_LIST = ['legendary', 'epic']

/** 已售数量展示阈值（< 此值不展示"已售X件"文字，库存进度条不受影响） */
const SOLD_COUNT_DISPLAY_THRESHOLD = 10

/** 空间名称映射（space 字段值域: lucky / premium / both） */
const SPACE_LABELS: Record<string, string> = {
  lucky: '幸运空间',
  premium: '臻选空间',
  both: '全空间'
}

/** 前端通用兑换规则（后端 usage_rules 为空时的兜底文案） */
const DEFAULT_USAGE_RULES: string[] = [
  '兑换后物品自动进入背包',
  '虚拟物品一经兑换不可退还',
  '实物商品以实际发货为准'
]

Page({
  data: {
    /** 路由参数: exchange_items.exchange_item_id */
    exchangeItemId: 0,

    /** 商品详情（API返回 + 前端展示字段） */
    product: null as any,

    /**
     * 轮播图数组
     * 数据源: product.images → 每项含 media_id / public_url / thumbnails
     * 无 images 时降级到 primary_media 单图
     */
    swiperImages: [] as any[],
    swiperCurrent: 0,

    /** 稀有度样式（优先 API rarity_def.color_hex，降级到本地 RARITY_STYLES） */
    rarityStyle: null as any,

    /** 库存剩余百分比（进度条宽度） */
    stockPercent: 100,

    /** 当前资产余额（对应 cost_asset_code 的可用余额） */
    currentBalance: 0,
    /** 余额 < cost_amount 时为 true */
    balanceInsufficient: false,

    /** 标签样式类型: 'game'(游戏风彩色) / 'plain'(灰底文字) — 来自页面配置 */
    tagStyleType: 'game' as string,
    /** 属性展示模式: 'grid'(网格卡片) / 'list'(文字列表) — 来自页面配置 */
    attrDisplayMode: 'grid' as string,

    /** 详情长图（后端 detail_images 数组，category='detail'） */
    detailImages: [] as any[],
    /** 展示图（后端 showcase_images 数组，category='showcase'） */
    showcaseImages: [] as any[],
    /** 使用说明（后端 usage_rules JSON数组，或前端通用规则） */
    usageRules: [] as string[],
    /** 相关推荐商品（同分类排除当前，最多4条） */
    relatedProducts: [] as any[],

    /**
     * 标签数组（统一渲染源）
     * 优先后端 label_tags 数组（每项含 text + style_type）
     * 后端不传时从布尔字段（is_hot / is_new 等）自动生成
     */
    displayTags: [] as any[],

    /** Phase 4: 可领取优惠券（后端 coupons 数组，空数组时不渲染） */
    coupons: [] as any[],
    /** Phase 4: 满减/活动信息（后端 promotions 数组） */
    promotions: [] as any[],
    /** Phase 4: 预计到手价（后端 estimated_price，0 时不渲染） */
    estimatedPrice: 0,

    /** sold_count >= 10 时才展示"已售X件"文字 */
    showSoldCount: false,

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: '',

    /** 兑换确认弹窗 */
    showConfirm: false,
    exchangeQuantity: 1,
    exchanging: false,

    /**
     * SKU 规格选择（全量SKU模式，v4.0 Phase 0）
     * 所有商品统一走 exchange_item_skus 表
     * - 单品（1个SKU，spec_values={}）: 自动选中，不显示选择器
     * - 多规格: 显示规格选择器，用户点选后确定 sku_id
     */
    skuList: [] as any[],
    selectedSkuId: 0,
    selectedSkuInfo: null as any,
    hasMultiSku: false,
    specNames: [] as string[],
    specMatrix: {} as Record<string, string[]>
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = parseInt(options.exchange_item_id || '0', 10)
    if (!itemId) {
      edLog.error('缺少 exchange_item_id 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '商品信息无效' })
      return
    }

    this.setData({ exchangeItemId: itemId })
    this._loadPageConfig()
    this._loadProductDetail(itemId)
  },

  /**
   * 加载页面配置（标签样式 + 属性展示模式）
   *
   * 数据源: exchange_page_config.detail_page（system_configs 表 key='exchange_page'）
   * 降级: 配置不存在时保持默认值（game + grid）
   */
  async _loadPageConfig() {
    try {
      const config = await DetailPageExchangeConfig.ExchangeConfigCache.getConfig()
      const detailPageConfig = config && config.detail_page
      if (detailPageConfig) {
        this.setData({
          tagStyleType: detailPageConfig.tag_style_type || 'game',
          attrDisplayMode: detailPageConfig.attr_display_mode || 'grid'
        })
        edLog.info('页面配置加载成功:', detailPageConfig)
      }
    } catch (error) {
      edLog.warn('页面配置加载失败，使用默认值:', error)
    }
  },

  /**
   * 加载商品详情 + 用户余额（并行请求）
   *
   * 数据流:
   *   GET /api/v4/exchange/items/:id → res.data.item（后端 ApiResponse 包装）
   *   GET /api/v4/assets/balances → 用户多资产余额
   */
  async _loadProductDetail(itemId: number) {
    this.setData({ loading: true, hasError: false })

    try {
      const [detailResponse, balanceResponse] = await Promise.all([
        DetailPageAPI.getExchangeItemDetail(itemId),
        DetailPageAPI.getAssetBalances()
      ])

      if (!detailResponse || !detailResponse.success || !detailResponse.data) {
        throw new Error(detailResponse?.message || '商品不存在或已下架')
      }

      /**
       * 后端统一响应: { success, code, data: { item: {...} } }
       * 仅使用 data.item，与 ApiResponse 契约一致（不做旧版扁平 data 兼容）
       */
      const productData = detailResponse.data.item
      if (!productData || !productData.exchange_item_id) {
        throw new Error('商品数据格式异常：缺少 data.item 或 exchange_item_id')
      }

      const priceCode: string = productData.cost_asset_code || detailAssetCodes.POINTS

      /**
       * 稀有度视觉配置优先级:
       *   1. 后端 rarity_def 联查结果（权威数据: color_hex + display_name）
       *   2. 本地 RARITY_STYLES 映射（降级兜底）
       */
      let rarityConfig: any
      if (productData.rarity_def && productData.rarity_def.color_hex) {
        rarityConfig = {
          colorHex: productData.rarity_def.color_hex,
          displayName: productData.rarity_def.display_name,
          cssClass: 'rarity--' + (productData.rarity_code || 'common')
        }
      } else {
        rarityConfig = detailPageImageHelper.getRarityStyle(productData.rarity_code || 'common')
      }

      /**
       * 光效类型（SCSS 通过子选择器区分颜色）:
       *   epic → 紫色脉冲  legendary → 金色脉冲  其他 → 无光效
       */
      const glowType: string =
        productData.rarity_code === 'epic'
          ? 'epic'
          : productData.rarity_code === 'legendary'
            ? 'legendary'
            : 'none'

      /**
       * 分类显示名:
       *   优先 category.category_name（后端联查）
       *   降级 category.category_code
       */
      const categoryDisplayName: string =
        (productData.category && productData.category.category_name) ||
        (productData.category && productData.category.category_code) ||
        ''

      /** 空间显示名（lucky / premium / both） */
      const spaceLabel: string = SPACE_LABELS[productData.space] || '幸运空间'

      /**
       * 轮播图处理:
       *   images 数组有值 → 多图轮播（后端通过 media_attachments 返回）
       *   无 images → 降级到 primary_media 单图
       *   都无 → emoji 占位
       */
      const swiperImages: any[] = []
      if (Array.isArray(productData.images) && productData.images.length > 0) {
        productData.images.forEach((img: any) => {
          swiperImages.push({
            media_id: img.media_id,
            url: img.public_url || (img.thumbnails && img.thumbnails.large) || '',
            thumbnailUrl: (img.thumbnails && img.thumbnails.medium) || img.public_url || ''
          })
        })
      } else if (productData.primary_media) {
        const primaryMedia = productData.primary_media
        swiperImages.push({
          media_id: primaryMedia.media_id,
          url:
            primaryMedia.public_url ||
            (primaryMedia.thumbnails && primaryMedia.thumbnails.large) ||
            '',
          thumbnailUrl:
            (primaryMedia.thumbnails && primaryMedia.thumbnails.medium) ||
            primaryMedia.public_url ||
            ''
        })
      }

      /** 主图URL（确认弹窗和分享封面使用） */
      const mainImageUrl: string = swiperImages.length > 0 ? swiperImages[0].url : ''

      /** ⑤ 详情长图（后端 detail_images，role='detail'，含可选 caption 图片说明） */
      const detailImages: any[] = Array.isArray(productData.detail_images)
        ? productData.detail_images.map((img: any) => ({
            media_id: img.media_id,
            url: img.public_url || (img.thumbnails && img.thumbnails.large) || '',
            caption: img.caption || ''
          }))
        : []

      /** ⑥ 展示图（后端 showcase_images，role='showcase'） */
      const showcaseImages: any[] = Array.isArray(productData.showcase_images)
        ? productData.showcase_images.map((img: any) => ({
            media_id: img.media_id,
            url: img.public_url || (img.thumbnails && img.thumbnails.large) || ''
          }))
        : []

      /** ⑦ 使用说明（后端 usage_rules 或前端通用规则兜底） */
      const usageRules: string[] =
        Array.isArray(productData.usage_rules) && productData.usage_rules.length > 0
          ? productData.usage_rules
          : DEFAULT_USAGE_RULES

      /**
       * ② 标签数组统一处理:
       *   优先: 后端 label_tags 数组（每项含 {text, style_type, emoji?}）
       *   降级: 从布尔字段（is_hot / is_new 等）自动生成
       */
      const processedDisplayTags: any[] = []
      if (Array.isArray(productData.label_tags) && productData.label_tags.length > 0) {
        productData.label_tags.forEach((tagItem: any) => {
          processedDisplayTags.push({
            text: tagItem.text || '',
            style_type: tagItem.style_type || 'default',
            emoji: tagItem.emoji || ''
          })
        })
      } else {
        if (productData.is_pinned) {
          processedDisplayTags.push({ text: '置顶', style_type: 'pinned', emoji: '📌' })
        }
        if (productData.is_recommended) {
          processedDisplayTags.push({ text: '推荐', style_type: 'recommended', emoji: '👍' })
        }
        if (productData.is_hot) {
          processedDisplayTags.push({ text: '热门', style_type: 'hot', emoji: '🔥' })
        }
        if (productData.is_limited) {
          processedDisplayTags.push({ text: '限量', style_type: 'limited', emoji: '⏰' })
        }
        if (productData.is_new) {
          processedDisplayTags.push({ text: '新品', style_type: 'new', emoji: '🆕' })
        }
        if (productData.has_warranty) {
          processedDisplayTags.push({ text: '保修', style_type: 'warranty', emoji: '🛡️' })
        }
        if (productData.free_shipping) {
          processedDisplayTags.push({ text: '包邮', style_type: 'shipping', emoji: '📦' })
        }
      }

      /** Phase 4: 营销数据提取（后端下发时渲染，不下发时自动隐藏） */
      const productCoupons: any[] = Array.isArray(productData.coupons) ? productData.coupons : []
      const productPromotions: any[] = Array.isArray(productData.promotions)
        ? productData.promotions
        : []
      const productEstimatedPrice: number = productData.estimated_price || 0

      /**
       * 单品级配置覆盖（优先级: 商品字段 > 页面配置 > 默认值）
       * 后端为不同商品设置不同展示模式时，前端自动响应
       */
      const itemAttrMode: string = productData.attr_display_mode || this.data.attrDisplayMode
      const itemTagStyle: string = productData.tag_style_type || this.data.tagStyleType

      /** 附加前端展示计算字段（下划线前缀，区分后端原始字段） */
      const enrichedProduct = Object.assign({}, productData, {
        _priceLabel: formatAssetLabel(priceCode),
        _rarityClass: rarityConfig.cssClass || '',
        _isLegendary: HOLO_RARITY_LIST.includes(productData.rarity_code),
        _glowType: glowType,
        _isLimited: productData.is_limited === true,
        _hasImage: swiperImages.length > 0,
        _mainImage: mainImageUrl,
        _spaceLabel: spaceLabel,
        _categoryDisplayName: categoryDisplayName,
        /** 铸造开关标识（后端 mint_instance 字段，true=兑换后自动铸造物品实例进入背包） */
        _mintInstance: productData.mint_instance === true,
        /** 关联物品模板ID（后端 item_template_id 字段） */
        _hasItemTemplate: !!productData.item_template_id
      })

      /** 库存进度条: 剩余百分比 = stock / (stock + sold_count) */
      const totalSupply: number = (productData.stock || 0) + (productData.sold_count || 0)
      const remainPercent: number =
        totalSupply > 0 ? Math.round(((productData.stock || 0) / totalSupply) * 100) : 100

      /** 从余额API提取 cost_asset_code 对应的可用余额 */
      let assetBalance = 0
      if (balanceResponse && balanceResponse.success && balanceResponse.data) {
        const allBalances =
          balanceResponse.data.balances ||
          (Array.isArray(balanceResponse.data) ? balanceResponse.data : [])
        const matchedAsset = allBalances.find(
          (balanceItem: any) => balanceItem.asset_code === priceCode
        )
        assetBalance = matchedAsset ? matchedAsset.available_amount || 0 : 0
      }

      const showSoldCount: boolean = (productData.sold_count || 0) >= SOLD_COUNT_DISPLAY_THRESHOLD

      /**
       * SKU 规格数据处理（全量SKU模式）
       * 后端 GET /exchange/items/:id 返回 skus 数组:
       *   [{ sku_id, spec_values, cost_amount, stock, status }]
       * 单品商品: skus.length === 1 且 spec_values 为 {}
       * 多规格商品: skus.length > 1，每个 SKU 有独立价格和库存
       */
      const rawSkus: any[] = Array.isArray(productData.skus) ? productData.skus : []
      const activeSkus = rawSkus
        .filter((sku: any) => sku.status === 'active')
        .map((sku: any) => {
          const specLabel =
            sku.spec_values && Object.keys(sku.spec_values).length > 0
              ? Object.values(sku.spec_values).join(' / ')
              : '默认'
          return Object.assign({}, sku, { _specLabel: specLabel })
        })
      const isEmptySpec = (sv: any) => !sv || Object.keys(sv).length === 0
      const hasMultiSku =
        activeSkus.length > 1 ||
        (activeSkus.length === 1 && !isEmptySpec(activeSkus[0].spec_values))

      let selectedSkuId = 0
      let selectedSkuInfo: any = null
      let specNames: string[] = []
      let specMatrix: Record<string, string[]> = {}

      if (activeSkus.length === 1 && isEmptySpec(activeSkus[0].spec_values)) {
        selectedSkuId = activeSkus[0].sku_id
        selectedSkuInfo = activeSkus[0]
      }

      if (hasMultiSku && Array.isArray(productData.spec_names)) {
        specNames = productData.spec_names
        specNames.forEach((specName: string) => {
          const values = new Set<string>()
          activeSkus.forEach((sku: any) => {
            if (sku.spec_values && sku.spec_values[specName]) {
              values.add(sku.spec_values[specName])
            }
          })
          specMatrix[specName] = Array.from(values)
        })
      }

      /** 全量 SKU：无可用上架规格则不可兑换（避免前端假装有库存） */
      if (activeSkus.length === 0) {
        throw new Error('该商品暂无可售规格（SKU），请稍后再试或联系客服')
      }

      /**
       * 余额是否不足：多规格时在用户未选规格前，用「有货 SKU 的最低单价」与余额比（仅展示提示，不替代后端扣款校验）
       * 单默认 SKU 或已选 SKU 时用对应 cost_amount
       */
      let referenceUnitCost = productData.cost_amount || 0
      if (hasMultiSku) {
        const inStockSkus = activeSkus.filter((s: any) => (s.stock || 0) > 0)
        const costs = inStockSkus
          .map((s: any) => (typeof s.cost_amount === 'number' ? s.cost_amount : null))
          .filter((c: number | null) => c !== null) as number[]
        if (costs.length > 0) {
          referenceUnitCost = Math.min(...costs)
        }
      } else if (selectedSkuInfo && typeof selectedSkuInfo.cost_amount === 'number') {
        referenceUnitCost = selectedSkuInfo.cost_amount
      } else if (activeSkus[0] && typeof activeSkus[0].cost_amount === 'number') {
        referenceUnitCost = activeSkus[0].cost_amount
      }
      const insufficient: boolean = assetBalance < referenceUnitCost

      this.setData({
        product: enrichedProduct,
        swiperImages,
        swiperCurrent: 0,
        rarityStyle: rarityConfig,
        stockPercent: remainPercent,
        currentBalance: assetBalance,
        balanceInsufficient: insufficient,
        detailImages,
        showcaseImages,
        usageRules,
        displayTags: processedDisplayTags,
        coupons: productCoupons,
        promotions: productPromotions,
        estimatedPrice: productEstimatedPrice,
        attrDisplayMode: itemAttrMode,
        tagStyleType: itemTagStyle,
        showSoldCount,
        skuList: activeSkus,
        selectedSkuId,
        selectedSkuInfo,
        hasMultiSku,
        specNames,
        specMatrix,
        loading: false
      })

      wx.setNavigationBarTitle({ title: productData.item_name || '商品详情' })
      edLog.info('商品详情加载成功:', productData.item_name)

      /** 异步加载相关推荐（不阻塞主渲染，使用 category_id 整数查询） */
      const relatedCategoryId = productData.category_id || null
      this._loadRelatedProducts(relatedCategoryId, itemId)
    } catch (error: any) {
      edLog.error('商品详情加载失败:', error)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: error.message || '加载失败，请重试'
      })
    }
  },

  /**
   * ⑧ 加载相关推荐（异步，不阻塞主渲染）
   *
   * API: GET /api/v4/exchange/items?category_id=xxx&exclude_id=xxx&page_size=4&status=active
   */
  async _loadRelatedProducts(categoryId: number | null, excludeId: number) {
    if (!categoryId) {
      edLog.info('商品无分类，跳过相关推荐')
      return
    }

    try {
      const response = await DetailPageAPI.getExchangeProducts({
        category_id: categoryId,
        exclude_id: excludeId,
        page_size: 4,
        status: 'active'
      })

      if (response && response.success && response.data) {
        const items = response.data.items || []
        if (items.length > 0) {
          const enrichedItems = items.map((item: any) => {
            const imgSrc =
              (item.primary_media &&
                (item.primary_media.public_url ||
                  (item.primary_media.thumbnails && item.primary_media.thumbnails.medium))) ||
              ''
            return Object.assign({}, item, {
              _priceLabel: formatAssetLabel(item.cost_asset_code || detailAssetCodes.POINTS),
              _hasImage: !!imgSrc,
              _mainImage: imgSrc
            })
          })
          this.setData({ relatedProducts: enrichedItems })
          edLog.info('相关推荐加载成功:', enrichedItems.length, '条')
        }
      }
    } catch (error) {
      edLog.warn('相关推荐加载失败（不影响主页面）:', error)
    }
  },

  /** 轮播图切换事件 */
  onSwiperChange(e: any) {
    this.setData({ swiperCurrent: e.detail.current })
  },

  /** 预览轮播图（wx.previewImage 大图预览） */
  onPreviewImage(e: any) {
    const { index } = e.currentTarget.dataset
    const urls = this.data.swiperImages.map((img: any) => img.url).filter(Boolean)
    if (urls.length > 0) {
      wx.previewImage({ current: urls[index] || urls[0], urls })
    }
  },

  /** 预览详情长图 */
  onPreviewDetailImage(e: any) {
    const { index } = e.currentTarget.dataset
    const urls = this.data.detailImages.map((img: any) => img.url).filter(Boolean)
    if (urls.length > 0) {
      wx.previewImage({ current: urls[index] || urls[0], urls })
    }
  },

  /** 预览展示图 */
  onPreviewShowcaseImage(e: any) {
    const { index } = e.currentTarget.dataset
    const urls = this.data.showcaseImages.map((img: any) => img.url).filter(Boolean)
    if (urls.length > 0) {
      wx.previewImage({ current: urls[index] || urls[0], urls })
    }
  },

  /** 商品图片加载失败降级 */
  onImageError() {
    if (this.data.product) {
      this.setData({ 'product._hasImage': false })
    }
  },

  /** ⑧ 点击相关推荐商品 → 跳转详情（redirectTo 替换当前页，避免页面栈溢出） */
  onTapRelatedProduct(e: any) {
    const itemId = e.currentTarget.dataset.itemId
    if (itemId) {
      wx.redirectTo({
        url: '/packageExchange/exchange-detail/exchange-detail?exchange_item_id=' + itemId
      })
    }
  },

  /** ⑩ 点击立即兑换 → 打开确认弹窗 */
  onExchange() {
    const { product, hasMultiSku, selectedSkuInfo, skuList } = this.data
    if (!product || this.data.balanceInsufficient) {
      return
    }
    /** 多规格须先选 SKU；单默认 SKU 用选中行或唯一行的 stock，与后端 skus[].stock 对齐 */
    let effStock = 0
    if (hasMultiSku) {
      effStock =
        selectedSkuInfo && typeof selectedSkuInfo.stock === 'number' ? selectedSkuInfo.stock : 0
    } else if (selectedSkuInfo && typeof selectedSkuInfo.stock === 'number') {
      effStock = selectedSkuInfo.stock
    } else if (skuList.length === 1 && typeof skuList[0].stock === 'number') {
      effStock = skuList[0].stock
    } else if (typeof product.stock === 'number') {
      effStock = product.stock
    }
    if (effStock <= 0) {
      return
    }
    this.setData({ showConfirm: true, exchangeQuantity: 1, exchanging: false })
  },

  /** 关闭确认弹窗 */
  onCloseConfirm() {
    if (this.data.exchanging) {
      return
    }
    this.setData({ showConfirm: false })
  },

  /** 数量增减 */
  onQuantityChange(e: any) {
    const action = e.currentTarget.dataset.action
    let { exchangeQuantity } = this.data
    const skuStock =
      this.data.selectedSkuInfo && typeof this.data.selectedSkuInfo.stock === 'number'
        ? this.data.selectedSkuInfo.stock
        : this.data.product.stock
    const maxQty = Math.min(skuStock || 0, 99)

    if (action === 'increase') {
      exchangeQuantity = Math.min(exchangeQuantity + 1, maxQty)
    } else if (action === 'decrease') {
      exchangeQuantity = Math.max(exchangeQuantity - 1, 1)
    }

    this.setData({ exchangeQuantity })
  },

  /**
   * 选择SKU规格（多规格商品用户点选）
   *
   * 根据用户选择的规格值匹配对应的 SKU 记录
   * 匹配成功后更新 selectedSkuId、selectedSkuInfo 和显示价格
   */
  onSelectSku(e: any) {
    const skuId = parseInt(e.currentTarget.dataset.skuId, 10)
    if (!skuId) {
      return
    }
    const matchedSku = this.data.skuList.find((sku: any) => sku.sku_id === skuId)
    if (matchedSku) {
      const skuCost = matchedSku.cost_amount || this.data.product.cost_amount
      const insufficient = this.data.currentBalance < skuCost
      this.setData({
        selectedSkuId: skuId,
        selectedSkuInfo: matchedSku,
        balanceInsufficient: insufficient
      })
    }
  },

  /**
   * 确认兑换（全量SKU模式）
   *
   * POST /api/v4/exchange
   * body: { exchange_item_id, quantity, sku_id }
   * header: Idempotency-Key（API层 exchangeProduct 自动生成）
   */
  async onConfirmExchange() {
    const {
      product,
      exchangeQuantity,
      exchanging,
      currentBalance,
      selectedSkuId,
      selectedSkuInfo
    } = this.data

    if (!product || exchanging) {
      return
    }

    /** SKU价格优先于SPU价格（多规格商品每个SKU独立价格） */
    const unitCost = (selectedSkuInfo && selectedSkuInfo.cost_amount) || product.cost_amount
    const totalCost = unitCost * exchangeQuantity
    if (currentBalance < totalCost) {
      wx.showToast({ title: '余额不足', icon: 'none' })
      return
    }

    /** 多规格商品必须先选择规格 */
    if (this.data.hasMultiSku && !selectedSkuId) {
      wx.showToast({ title: '请先选择商品规格', icon: 'none' })
      return
    }

    /** 全量 SKU：列表非空则必须带 sku_id 提交（单品默认 SKU 在加载时已自动选中） */
    if (this.data.skuList.length > 0 && (!selectedSkuId || selectedSkuId <= 0)) {
      wx.showToast({ title: '缺少商品规格信息，请刷新页面重试', icon: 'none' })
      return
    }

    this.setData({ exchanging: true })

    try {
      const response = await DetailPageAPI.exchangeProduct(
        product.exchange_item_id,
        exchangeQuantity,
        selectedSkuId
      )

      if (response && response.success) {
        edLog.info('兑换成功:', response.data)
        this.setData({ exchanging: false, showConfirm: false })

        /** 通知 Page 壳刷新余额 + 商品列表（onShow 读取此标志后清除） */
        const appInstance = getApp()
        if (appInstance && appInstance.globalData) {
          appInstance.globalData._exchangeOccurred = true
        }

        /**
         * 铸造物品展示（mint_instance=true 时后端返回 minted_item）
         * 包含: item_id, tracking_code, serial_number, edition_total, instance_attributes
         */
        const mintedItem = response.data && response.data.minted_item
        if (mintedItem) {
          const { formatEdition: edFormatEdition } = detailPageImageHelper
          const attrs = mintedItem.instance_attributes || {}
          const editionDisplay = edFormatEdition(mintedItem.serial_number, mintedItem.edition_total)

          let mintedContent = '兑换成功！物品已进入背包'
          if (editionDisplay) {
            mintedContent += `\n限量编号: ${editionDisplay}`
          }
          if (attrs.quality_grade) {
            mintedContent += `\n品质等级: ${attrs.quality_grade}`
          }
          if (attrs.quality_score) {
            mintedContent += ` (${attrs.quality_score}分)`
          }
          if (attrs.pattern_id) {
            mintedContent += `\n纹理编号: #${attrs.pattern_id}`
          }

          wx.showModal({
            title: '🎉 铸造成功',
            content: mintedContent,
            showCancel: false,
            confirmText: '查看背包',
            success: () => {
              wx.navigateTo({ url: '/packageTrade/trade/inventory/inventory' })
            }
          })
        } else {
          wx.showToast({ title: '兑换成功！', icon: 'success', duration: 2000 })
          setTimeout(() => {
            wx.navigateBack()
          }, 2000)
        }
      } else {
        throw new Error((response && response.message) || '兑换失败')
      }
    } catch (error: any) {
      edLog.error('兑换失败:', error)
      this.setData({ exchanging: false })

      let exchangeErrorMsg = '兑换失败，请重试'
      if (error.statusCode === 400) {
        exchangeErrorMsg = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        exchangeErrorMsg = error.message || '库存不足或余额不足'
      } else if (error.message) {
        exchangeErrorMsg = error.message
      }

      wx.showModal({
        title: '兑换失败',
        content: exchangeErrorMsg,
        showCancel: false,
        confirmText: '我知道了'
      })
    }
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/exchange/exchange' })
      }
    })
  },

  /** 分享给好友（含商品主图，提升分享卡片点击率） */
  onShareAppMessage() {
    const productName = this.data.product ? this.data.product.item_name : '精选商品'
    const shareImageUrl = this.data.product ? this.data.product._mainImage : ''
    return {
      title: productName + ' - 积分商城',
      path:
        '/packageExchange/exchange-detail/exchange-detail?exchange_item_id=' +
        this.data.exchangeItemId,
      imageUrl: shareImageUrl
    }
  }
})
