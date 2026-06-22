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
  ProductDisplay: detailProductDisplay
} = require('../../utils/index')
const { formatAssetLabel, resolveSkuUnitCost } = detailProductDisplay

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

Page({
  data: {
    /** 路由参数: exchange_items.exchange_item_id */
    exchangeItemId: 0,

    /** 商品详情（API返回 + 前端展示字段） */
    product: null as any,

    /**
     * 轮播图数组
     * 数据源: product.images → 每项含 media_id / public_url / thumbnails
     * 无 images 时降级到 primary_image 单图（含 url / thumbnail_url）
     */
    swiperImages: [] as any[],
    swiperCurrent: 0,

    /**
     * 主图轮播自动播放间隔（毫秒）
     * 数据源: 后端详情 item.gallery_autoplay_interval_ms（运营全局配置，§8.7/§9.3）
     * 后端未下发时用前端默认 4000ms 兜底（不写死业务值到 WXML）
     */
    galleryInterval: 4000,

    /** SPU 主图轮播组（用户未选 SKU 或所选 SKU 无图时回退展示） */
    spuSwiperImages: [] as any[],

    /** 稀有度样式（优先 API rarity_def.color_hex，降级到本地 RARITY_STYLES） */
    rarityStyle: null as any,

    /** 是否显示「品质」属性行（暂按业务要求隐藏，后续需要时置 true 即可恢复） */
    showQuality: false,

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

    /**
     * 是否高价值档（后端 BE-2 字段 value_tier === 'high'），驱动"会员尊享"视觉
     * high 档做差异化展示，不按价格自行猜测档位
     */
    isHighValue: false,

    /**
     * 解锁条件清单（后端 BE-3 字段 redeem_requirement 展平后的可读项数组）
     * redeem_requirement 无门槛时后端返回 null → 清单为空数组，不渲染
     * 仅做"解锁条件清单"展示，不下发任何商业敏感数值
     */
    redeemRequirementList: [] as string[],

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: '',

    /**
     * 履约类型（后端 exchange_items.fulfillment_type）:
     *   physical=实物邮寄（下单前必选地址）/ virtual=虚拟即时 / voucher=卡券核销（后两者无需地址）
     */
    needAddress: false,
    /** 已选收货地址（实物商品下单用，来自地址页选择回传或默认地址） */
    selectedAddress: null as API.UserAddress | null,

    /** 兑换确认弹窗 */
    showConfirm: false,
    exchangeQuantity: 1,
    exchanging: false,

    /**
     * 确认弹窗合计计算（预计算数值，避免 WXML 对可能为 undefined 的 cost_amount 做乘法→NaN）
     * confirmUnitCost: 当前选中 SKU 的权威单价（channelPrices[0].cost_amount 优先）
     * confirmTotalCost: 单价 × 数量
     */
    confirmUnitCost: 0,
    confirmTotalCost: 0,

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

      /**
       * 方案二（已下架优雅处理）：记录仍在库（含 inactive）时详情接口返回 success=true，
       * status==='inactive' 表示已下架。提示「该商品已下架」并通知列表移除后返回，
       * 不展示无法兑换的下架商品。物理删除走 catch 的 EXCHANGE_ITEM_NOT_FOUND 分支。
       */
      if (productData.status === 'inactive') {
        edLog.info('商品已下架(inactive)，提示并返回:', itemId)
        this._handleItemUnavailable(itemId)
        return
      }

      /**
       * 计价资产码：后端详情接口已在顶层下发 cost_asset_code（对接文档 16.1/16.3），
       * 前端直读，不再顺 SKU channelPrices 兜底、不再 || 'points' 误兜底。
       * 无价商品后端返回 null，formatAssetLabel('') 返回空字符串，由展示层处理。
       */
      const priceCode: string = productData.cost_asset_code || ''

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
       *   无 images → 降级到 primary_image 单图（含 url / thumbnail_url）
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
      } else if (productData.primary_image) {
        const primaryImage = productData.primary_image
        swiperImages.push({
          media_id: primaryImage.primary_media_id || productData.primary_media_id,
          url: primaryImage.url || primaryImage.thumbnail_url || '',
          thumbnailUrl: primaryImage.thumbnail_url || primaryImage.url || ''
        })
      }

      /** 主图URL（确认弹窗和分享封面使用） */
      const mainImageUrl: string = swiperImages.length > 0 ? swiperImages[0].url : ''

      /**
       * 主图轮播自动播放间隔（运营全局配置 §8.7/§9.3）
       * 后端详情 item.gallery_autoplay_interval_ms 有值则用，否则前端默认 4000ms 兜底
       */
      const galleryInterval: number =
        typeof productData.gallery_autoplay_interval_ms === 'number' &&
        productData.gallery_autoplay_interval_ms > 0
          ? productData.gallery_autoplay_interval_ms
          : 4000

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

      /** ⑦ 使用说明（仅以后端 usage_rules 为准，缺失时明确为空） */
      const usageRules: string[] =
        Array.isArray(productData.usage_rules) && productData.usage_rules.length > 0
          ? productData.usage_rules
          : []

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
          processedDisplayTags.push({ text: '包邮', style_type: 'shipping', emoji: 'icon-package' })
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
        /** 计价资产中文名：优先后端 cost_asset_name，回退本地映射；前端不自维护资产码→中文表 */
        _priceLabel: formatAssetLabel(priceCode, productData.cost_asset_name),
        /** 计价资产图标：优先后端 cost_asset_icon_url（完整URL），空则由展示层兜底纯文字 */
        _priceIcon: productData.cost_asset_icon_url || '',
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
       * 价值档位与解锁条件（后端 BE-2/BE-3 字段）
       *   value_tier: 'low' | 'mid' | 'high'，high 档展示"会员尊享"
       *   redeem_requirement: 无门槛时后端返回 null
       */
      const isHighValue: boolean = (productData.value_tier || 'low') === 'high'
      const redeemRequirementList: string[] = this._buildRequirementList(
        productData.redeem_requirement || null
      )

      /**
       * SKU 规格数据处理（全量SKU模式）
       * 后端 GET /exchange/items/:exchange_item_id 返回 skus 数组（对接文档 16.1）:
       *   [{ sku_id, spec_values, stock, status, channelPrices: [{ cost_amount, cost_asset_code }] }]
       * 单品商品: skus.length === 1 且 spec_values 为 {}
       * 多规格商品: skus.length > 1，每个 SKU 的价格在各自 channelPrices 内
       */
      const rawSkus: any[] = Array.isArray(productData.skus) ? productData.skus : []
      const activeSkus = rawSkus
        .filter((sku: any) => sku.status === 'active')
        .map((sku: any) => {
          const specLabel =
            sku.spec_values && Object.keys(sku.spec_values).length > 0
              ? Object.values(sku.spec_values).join(' / ')
              : '默认'
          /** 权威单价：channelPrices[0].cost_amount 优先，回退 SKU/SPU cost_amount，绝不为 NaN */
          const unitCost = resolveSkuUnitCost(sku, productData.cost_amount)
          /**
           * SKU 子图多图（§8.7 方案二）：后端 sku.images[] 按 sort_order 排序，
           * 归一为与主图轮播一致的 { media_id, url, thumbnailUrl } 结构，供选规格时切换轮播。
           */
          const skuImages: any[] = Array.isArray(sku.images)
            ? sku.images.map((img: any) => ({
                media_id: img.media_id,
                url: img.url || img.public_url || (img.thumbnails && img.thumbnails.large) || '',
                thumbnailUrl:
                  img.thumbnail_url || (img.thumbnails && img.thumbnails.medium) || img.url || ''
              }))
            : []
          /** sku_id 归一为数字（后端可能以字符串下发），确保提交、比较、高亮全链路类型一致 */
          return Object.assign({}, sku, {
            sku_id: Number(sku.sku_id),
            _specLabel: specLabel,
            _unitCost: unitCost,
            _images: skuImages
          })
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
        selectedSkuId = Number(activeSkus[0].sku_id)
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
        throw new Error('商品信息加载异常，请返回重试')
      }

      /**
       * 余额是否不足：多规格时在用户未选规格前，用「有货 SKU 的最低单价」与余额比（仅展示提示，不替代后端扣款校验）
       * 单默认 SKU 或已选 SKU 时用对应 cost_amount
       */
      let referenceUnitCost = productData.cost_amount || 0
      if (hasMultiSku) {
        const inStockSkus = activeSkus.filter((s: any) => (s.stock || 0) > 0)
        const costs = inStockSkus
          .map((s: any) => (typeof s._unitCost === 'number' ? s._unitCost : null))
          .filter((c: number | null) => c !== null) as number[]
        if (costs.length > 0) {
          referenceUnitCost = Math.min(...costs)
        }
      } else if (selectedSkuInfo && typeof selectedSkuInfo._unitCost === 'number') {
        referenceUnitCost = selectedSkuInfo._unitCost
      } else if (activeSkus[0] && typeof activeSkus[0]._unitCost === 'number') {
        referenceUnitCost = activeSkus[0]._unitCost
      }
      const insufficient: boolean = assetBalance < referenceUnitCost

      /** 初始合计：单默认 SKU 时已选中，预算单价×数量(1)；多规格未选时为 0，选规格后再更新 */
      const initialUnitCost =
        selectedSkuInfo && typeof selectedSkuInfo._unitCost === 'number'
          ? selectedSkuInfo._unitCost
          : 0

      /**
       * 初始主图轮播：单默认 SKU 若自带子图则优先展示该 SKU 子图，否则用 SPU 主图组（§8.7）。
       * spuSwiperImages 始终保存 SPU 主图组，供"所选 SKU 无图"时回退。
       */
      const initialSwiperImages: any[] =
        selectedSkuInfo &&
        Array.isArray(selectedSkuInfo._images) &&
        selectedSkuInfo._images.length > 0
          ? selectedSkuInfo._images
          : swiperImages

      this.setData({
        product: enrichedProduct,
        swiperImages: initialSwiperImages,
        spuSwiperImages: swiperImages,
        galleryInterval,
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
        isHighValue,
        redeemRequirementList,
        skuList: activeSkus,
        selectedSkuId,
        selectedSkuInfo,
        hasMultiSku,
        specNames,
        specMatrix,
        confirmUnitCost: initialUnitCost,
        confirmTotalCost: initialUnitCost,
        loading: false
      })

      wx.setNavigationBarTitle({ title: productData.item_name || '商品详情' })
      edLog.info('商品详情加载成功:', productData.item_name)

      /**
       * 实物商品（fulfillment_type='physical'）下单前必须选收货地址：
       * 加载默认地址作为初始选择（用户可在确认弹窗点击切换）。
       * 虚拟/卡券类（virtual/voucher）无需地址。
       */
      const needAddress = productData.fulfillment_type === 'physical'
      this.setData({ needAddress })
      if (needAddress) {
        this._loadDefaultAddress()
      }

      /** 异步加载相关推荐（不阻塞主渲染，使用 category_id 整数查询） */
      const relatedCategoryId = productData.category_id || null
      this._loadRelatedProducts(relatedCategoryId, itemId)
    } catch (error: any) {
      edLog.error('商品详情加载失败:', error)
      /**
       * 方案二（已删除优雅处理）：商品被物理删除时后端返回 404 EXCHANGE_ITEM_NOT_FOUND，
       * 与 inactive 同样提示「该商品已下架」并通知列表移除后返回，不停留在报错页。
       */
      if (error && error.code === 'EXCHANGE_ITEM_NOT_FOUND') {
        edLog.info('商品已删除(EXCHANGE_ITEM_NOT_FOUND)，提示并返回:', itemId)
        this._handleItemUnavailable(itemId)
        return
      }
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: error.message || '加载失败，请重试'
      })
    }
  },

  /**
   * 方案二统一兜底：商品已下架(inactive)或已删除(404) → 提示「该商品已下架」，
   * 通过 globalData 标记让列表页 onShow 刷新移除该项，随后返回上一页。
   */
  _handleItemUnavailable(itemId: number) {
    const appInstance = getApp()
    if (appInstance && appInstance.globalData) {
      /* 标记需刷新列表：列表页 onShow 消费此标志重拉，已下架/删除商品自然消失 */
      appInstance.globalData._exchangeItemUnavailableId = itemId
    }
    wx.showToast({ title: '该商品已下架', icon: 'none', duration: 1500 })
    setTimeout(() => {
      wx.navigateBack({
        fail: () => {
          wx.switchTab({ url: '/pages/exchange/exchange' })
        }
      })
    }, 1500)
  },

  /**
   * 构建"解锁条件清单"可读数组（后端 redeem_requirement → 前端展示文案）
   *
   * 后端字段（snake_case 原名，前端不做映射层）:
   *   min_growth_level_key      最低成长等级 key（如 silver），null=不限
   *   extra_cost_assets[]       额外消耗资产 [{asset_code, amount}]
   *   required_consume_items[]  需消耗指定道具 [{item_template_id, quantity}]
   *
   * 成长等级名优先用后端可能下发的 min_growth_level_name；
   * 资产/道具仅展示后端给的标识与数量，不下发任何敏感数值，不前端计算。
   */
  _buildRequirementList(requirement: any): string[] {
    if (!requirement) {
      return []
    }
    const list: string[] = []

    const levelName = requirement.min_growth_level_name || requirement.min_growth_level_key
    if (levelName) {
      list.push(`需达成长等级：${levelName}`)
    }

    if (Array.isArray(requirement.extra_cost_assets)) {
      requirement.extra_cost_assets.forEach((asset: any) => {
        const assetLabel = formatAssetLabel(asset.asset_code) || asset.asset_code
        if (asset.amount !== null && asset.amount !== undefined) {
          list.push(`需额外消耗：${asset.amount} ${assetLabel}`)
        }
      })
    }

    if (Array.isArray(requirement.required_consume_items)) {
      requirement.required_consume_items.forEach((reqItem: any) => {
        const itemLabel = reqItem.item_name || `道具#${reqItem.item_template_id}`
        if (reqItem.quantity !== null && reqItem.quantity !== undefined) {
          list.push(`需消耗道具：${itemLabel} ×${reqItem.quantity}`)
        }
      })
    }

    return list
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
          /**
           * 方式二（§12.3）：相关推荐 2 列卡片，估算显示宽 ≈ (窗口宽 - 页边距 - 间距) / 2，按 DPR 裁剪。
           */
          let relatedCardWidthPx = 165
          try {
            const winWidth = wx.getWindowInfo().windowWidth || 375
            const gapsPx = ((48 + 16) * winWidth) / 750
            relatedCardWidthPx = Math.max(0, Math.floor((winWidth - gapsPx) / 2))
          } catch (_e) {
            relatedCardWidthPx = 165
          }
          const enrichedItems = items.map((item: any) => {
            const imgSrc = item.primary_image
              ? detailPageImageHelper.pickListImageUrl(item.primary_image, relatedCardWidthPx)
              : ''
            return Object.assign({}, item, {
              _priceLabel: formatAssetLabel(item.cost_asset_code || '', item.cost_asset_name),
              _priceIcon: item.cost_asset_icon_url || '',
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

  /**
   * 加载默认收货地址（实物商品初始选择）
   * GET /api/v4/user/addresses → 取 is_default 的地址；无默认则取第一条
   */
  async _loadDefaultAddress() {
    try {
      const result = await DetailPageAPI.getUserAddresses()
      // 该接口 data 本身即地址数组（无 addresses/list 包裹），直接判定数组
      const addresses = Array.isArray(result.data) ? result.data : []
      if (result && result.success && addresses.length > 0) {
        const defaultAddr = addresses.find((a: any) => a.is_default) || addresses[0]
        this.setData({ selectedAddress: defaultAddr })
      }
    } catch (error) {
      edLog.warn('加载默认地址失败（不阻断下单，用户可手动选）:', error)
    }
  },

  /**
   * 点击收货地址行 → 跳转地址页选择模式，通过 eventChannel 回传所选地址
   */
  onChooseAddress() {
    wx.navigateTo({
      url: '/packageUser/addresses/addresses?select=1',
      events: {
        selectAddress: (payload: { address: API.UserAddress }) => {
          if (payload && payload.address) {
            this.setData({ selectedAddress: payload.address })
          }
        }
      }
    })
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
    /**
     * 每单上限：优先读后端商品级 max_quantity_per_order（业务规则权威来源），
     * 后端未下发时回退接口契约硬上限（对接文档 16.2），再与库存取 Math.min。
     */
    const productData = this.data.product || {}
    const perOrderMax =
      typeof productData.max_quantity_per_order === 'number' &&
      productData.max_quantity_per_order > 0
        ? productData.max_quantity_per_order
        : DetailPageAPI.EXCHANGE_QUANTITY_CONTRACT_MAX
    const maxQty = Math.min(skuStock || 0, perOrderMax)

    if (action === 'increase') {
      exchangeQuantity = Math.min(exchangeQuantity + 1, maxQty)
    } else if (action === 'decrease') {
      exchangeQuantity = Math.max(exchangeQuantity - 1, 1)
    }

    /** 同步合计：单价取选中 SKU 的权威单价（_unitCost），无则回退 SPU 价 */
    const unitCost =
      this.data.selectedSkuInfo && typeof this.data.selectedSkuInfo._unitCost === 'number'
        ? this.data.selectedSkuInfo._unitCost
        : this.data.product.cost_amount || 0
    this.setData({
      exchangeQuantity,
      confirmUnitCost: unitCost,
      confirmTotalCost: unitCost * exchangeQuantity
    })
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
    /** 后端 sku_id 可能为字符串，用 Number() 归一后比较，避免 string===number 永远不等 */
    const matchedSku = this.data.skuList.find((sku: any) => Number(sku.sku_id) === skuId)
    if (matchedSku) {
      /** 权威单价：channelPrices 已算入 matchedSku._unitCost，回退 SPU 展示价 */
      const skuCost =
        typeof matchedSku._unitCost === 'number'
          ? matchedSku._unitCost
          : this.data.product.cost_amount || 0
      const insufficient = this.data.currentBalance < skuCost
      /**
       * SKU 子图多图轮播切换（§8.7）：所选 SKU 有子图则切换为该 SKU 图组，
       * 无子图回退 SPU 主图组（与天猫"选规格换该规格图组、无则用商品主图"一致）。
       */
      const skuImages =
        Array.isArray(matchedSku._images) && matchedSku._images.length > 0
          ? matchedSku._images
          : this.data.spuSwiperImages
      this.setData({
        selectedSkuId: skuId,
        selectedSkuInfo: matchedSku,
        balanceInsufficient: insufficient,
        swiperImages: skuImages,
        swiperCurrent: 0,
        confirmUnitCost: skuCost,
        confirmTotalCost: skuCost * this.data.exchangeQuantity
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

    /** SKU 权威单价（channelPrices 已算入 _unitCost），回退 SPU 展示价 */
    const unitCost =
      (selectedSkuInfo && typeof selectedSkuInfo._unitCost === 'number'
        ? selectedSkuInfo._unitCost
        : product.cost_amount) || 0
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

    /**
     * 实物商品（needAddress）下单前必须选收货地址（对接文档第三节）。
     * 未选地址时拦截并引导去选，避免后端返回 EXCHANGE_ADDRESS_REQUIRED。
     */
    if (this.data.needAddress && !this.data.selectedAddress) {
      wx.showToast({ title: '请先选择收货地址', icon: 'none' })
      return
    }

    this.setData({ exchanging: true })

    try {
      const addressId =
        this.data.needAddress && this.data.selectedAddress
          ? this.data.selectedAddress.address_id
          : undefined
      const response = await DetailPageAPI.exchangeProduct(
        product.exchange_item_id,
        exchangeQuantity,
        selectedSkuId,
        addressId
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
            title: '',
            content: mintedContent,
            showCancel: false,
            confirmText: '查看背包',
            success: () => {
              wx.navigateTo({ url: '/packageUser/backpack/inventory/inventory' })
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

      // 实物商品缺收货地址：后端返回 EXCHANGE_ADDRESS_REQUIRED 时，置 needAddress 并引导用户补选地址后重试
      if (error.code === 'EXCHANGE_ADDRESS_REQUIRED') {
        this.setData({ needAddress: true })
        wx.showModal({
          title: '需要收货地址',
          content: '该商品为实物商品，请先选择收货地址再兑换',
          showCancel: false,
          confirmText: '去选择',
          success: () => this.onChooseAddress()
        })
        return
      }

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
