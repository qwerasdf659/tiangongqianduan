/**
 * 兑换商品详情页 — 游戏商城风格轻量详情
 *
 * 当前阶段: 使用模拟数据渲染，后续对接 API.getExchangeItemDetail
 * 后端API (已就绪): GET /api/v4/backpack/exchange/items/:exchange_item_id
 *
 * 路由参数: exchange_item_id（exchange_items 表主键）
 * 来源: exchange-shelf 商品卡片点击跳转
 *
 * @file packageExchange/exchange-detail/exchange-detail.ts
 * @version 1.0.0
 * @since 2026-03-13
 */

const {
  Logger: DetailPageLogger,
  ImageHelper: detailPageImageHelper
} = require('../../utils/index')
const { formatAssetLabel } = require('../utils/product-display')

const edLog = DetailPageLogger.createLogger('exchange-detail')

/** 模拟数据模板池（基于 ID 取模动态组合，覆盖全部稀有度和资产类型） */
const MOCK_NAMES = [
  '幸运宝箱·黄金版', '传说之翼·炫彩飞行挂件', '经验加速卡·7天',
  '星辰碎片·限定礼包', '暗夜守护者铠甲', '凤凰涅槃·头像框',
  '万能材料包·大', '幸运四叶草挂坠', '时空裂隙钥匙', '极光之心宝石'
]
const MOCK_DESCS = [
  '打开后可随机获得1-3件稀有道具，包含限定皮肤碎片、高级材料等珍贵物品。每位用户每日限兑换2次，宝箱内容每周更新。',
  '限量发售的传说级飞行挂件，佩戴后角色移动时会留下炫彩光轨。自带专属称号「追光者」，全服限量500件。',
  '激活后7天内所有活动获得的经验值提升50%，与其他加成效果叠加计算。适合冲榜期间使用。',
  '包含10种高级合成材料，可用于锻造史诗级以上装备。开启后材料直接进入背包，不可交易。',
  '暗夜系列限定铠甲，穿戴后防御力+120，暗属性抗性+25%。附带专属暗影拖尾特效。',
  '活动限定头像框，采用凤凰涅槃主题设计，动态火焰环绕效果，彰显尊贵身份。',
  '包含各类常用合成材料各5份，适合日常消耗补充，性价比之选。',
  '佩戴后每日登录额外获得幸运值+5，幸运值影响抽奖概率和掉落品质。',
  '开启时空裂隙副本的钥匙，副本内可获得大量经验和稀有掉落，每周限入3次。',
  '镶嵌后永久提升角色暴击率2%，可与其他宝石效果叠加，最多镶嵌3颗。'
]
const MOCK_SELL_POINTS = [
  '开箱必出稀有道具，欧皇必备',
  '全服限量500件，错过不再',
  '经验提升50%，升级快人一步',
  '一包顶十包，锻造必备',
  '暗夜限定，防御拉满',
  '动态火焰特效，全场最靓',
  '日常补给首选，超高性价比',
  '运气加成，日积月累',
  '稀有副本入场券，产出丰厚',
  '永久暴击提升，战力飞跃'
]
const MOCK_CATEGORIES = ['宝箱', '挂件', '道具', '礼包', '装备', '头像框', '材料', '饰品', '钥匙', '宝石']
const MOCK_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']
const MOCK_ASSETS = ['red_shard', 'DIAMOND', 'POINTS', 'orange_shard']
const MOCK_PRICES = [10, 50, 100, 200, 500, 800, 1200, 30, 80, 300]
const MOCK_TAG_POOL = [
  ['热销', '每周更新', '必出稀有'],
  ['传说品质', '限量版', '专属称号', '炫彩光效'],
  ['常驻', '可叠加'],
  ['高性价比', '日常推荐'],
  ['暗夜系列', '限定皮肤', '属性加成'],
  ['动态特效', '限时活动', '身份象征'],
  ['材料补给', '新手推荐'],
  ['幸运加成', '日常签到'],
  ['副本钥匙', '稀有掉落', '每周限入'],
  ['永久属性', '战力提升', '可叠加']
]

/**
 * 基于商品 ID 动态生成模拟详情（确保同一 ID 每次生成一致的结果）
 * 后续替换为 API.getExchangeItemDetail
 */
function generateMockProduct(itemId: number): any {
  const idx = itemId % 10
  const rarityIdx = itemId % MOCK_RARITIES.length
  const assetIdx = itemId % MOCK_ASSETS.length
  const priceBase = MOCK_PRICES[idx]
  const hasDiscount = itemId % 3 === 0
  const stockBase = [992, 3, 9999, 500, 120, 88, 2000, 666, 45, 300][idx]
  const soldBase = [8, 497, 1234, 200, 80, 12, 800, 334, 55, 150][idx]

  return {
    exchange_item_id: itemId,
    name: MOCK_NAMES[idx],
    description: MOCK_DESCS[idx],
    sell_point: MOCK_SELL_POINTS[idx],
    cost_asset_code: MOCK_ASSETS[assetIdx],
    cost_amount: priceBase,
    original_price: hasDiscount ? Math.round(priceBase * 1.5) : null,
    stock: stockBase,
    sold_count: soldBase,
    category: MOCK_CATEGORIES[idx],
    space: rarityIdx >= 3 ? 'premium' : 'lucky',
    status: 'active',
    tags: MOCK_TAG_POOL[idx],
    is_hot: itemId % 2 === 0,
    is_new: itemId % 5 === 0,
    is_lucky: rarityIdx < 3,
    is_limited: rarityIdx >= 4,
    rarity_code: MOCK_RARITIES[rarityIdx],
    has_warranty: rarityIdx >= 3,
    free_shipping: true,
    image: '',
    primary_image_id: null
  }
}

/** 模拟资产余额 */
const MOCK_BALANCES: Record<string, number> = {
  DIAMOND: 1308,
  red_shard: 898,
  POINTS: 5200,
  orange_shard: 120
}

Page({
  data: {
    /** 路由参数 */
    exchangeItemId: 0,

    /** 商品详情（模拟数据或 API 返回） */
    product: null as any,

    /** 稀有度样式配置 */
    rarityStyle: null as any,

    /** 库存剩余百分比 */
    stockPercent: 100,

    /** 当前资产余额 */
    currentBalance: 0,

    /** 余额是否不足 */
    balanceInsufficient: false,

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: '',

    /** 兑换确认弹窗 */
    showConfirm: false,
    exchangeQuantity: 1,
    exchanging: false
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = parseInt(options.exchange_item_id || '0', 10)
    if (!itemId) {
      edLog.error('缺少 exchange_item_id 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '商品信息无效' })
      return
    }

    this.setData({ exchangeItemId: itemId })
    this._loadProductDetail(itemId)
  },

  /**
   * 加载商品详情（当前使用动态模拟数据）
   * TODO: 替换为 const result = await API.getExchangeItemDetail(itemId)
   */
  _loadProductDetail(itemId: number) {
    this.setData({ loading: true, hasError: false })

    const HOLO_RARITY_LIST = ['legendary', 'epic']

    setTimeout(() => {
      const mockData = generateMockProduct(itemId)
      const priceCode = mockData.cost_asset_code || 'POINTS'
      const rarityConfig = detailPageImageHelper.getRarityStyle(mockData.rarity_code || 'common')

      const imgSrc = mockData.image || ''
      const validImage = imgSrc && imgSrc !== detailPageImageHelper.DEFAULT_PRODUCT_IMAGE

      const enrichedProduct = Object.assign({}, mockData, {
        _priceLabel: formatAssetLabel(priceCode),
        _rarityClass: rarityConfig ? rarityConfig.cssClass : '',
        _isLegendary: HOLO_RARITY_LIST.includes(mockData.rarity_code),
        _isLimited: mockData.is_limited === true,
        _hasImage: validImage
      })

      const totalSupply = mockData.stock + mockData.sold_count
      const remainPercent = totalSupply > 0
        ? Math.round((mockData.stock / totalSupply) * 100)
        : 100

      const assetBalance = MOCK_BALANCES[priceCode] || 0
      const insufficient = assetBalance < mockData.cost_amount

      this.setData({
        product: enrichedProduct,
        rarityStyle: rarityConfig,
        stockPercent: remainPercent,
        currentBalance: assetBalance,
        balanceInsufficient: insufficient,
        loading: false
      })

      wx.setNavigationBarTitle({ title: mockData.name })
      edLog.info('商品详情加载成功（模拟数据）:', mockData.name)
    }, 600)
  },

  /** 商品图片加载失败 */
  onImageError() {
    const { product } = this.data
    if (product) {
      this.setData({
        'product._hasImage': false
      })
    }
  },

  /** 点击立即兑换 → 打开确认弹窗 */
  onExchange() {
    const { product } = this.data
    if (!product || product.stock <= 0 || this.data.balanceInsufficient) {
      return
    }

    this.setData({
      showConfirm: true,
      exchangeQuantity: 1,
      exchanging: false
    })
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
    const maxQty = Math.min(this.data.product.stock, 99)

    if (action === 'increase') {
      exchangeQuantity = Math.min(exchangeQuantity + 1, maxQty)
    } else if (action === 'decrease') {
      exchangeQuantity = Math.max(exchangeQuantity - 1, 1)
    }

    this.setData({ exchangeQuantity })
  },

  /**
   * 确认兑换（模拟）
   * TODO: 替换为 API.exchangeProduct(exchange_item_id, quantity)
   */
  async onConfirmExchange() {
    const { product, exchangeQuantity, exchanging, currentBalance } = this.data

    if (!product || exchanging) {
      return
    }

    const totalCost = product.cost_amount * exchangeQuantity
    if (currentBalance < totalCost) {
      wx.showToast({ title: '余额不足', icon: 'none' })
      return
    }

    this.setData({ exchanging: true })

    setTimeout(() => {
      edLog.info('模拟兑换成功:', {
        exchangeItemId: product.exchange_item_id,
        quantity: exchangeQuantity,
        totalCost
      })

      this.setData({
        exchanging: false,
        showConfirm: false
      })

      wx.showToast({ title: '兑换成功！', icon: 'success', duration: 2000 })

      setTimeout(() => {
        wx.navigateBack()
      }, 2000)
    }, 1500)
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/exchange/exchange' })
      }
    })
  },

  /** 分享 */
  onShareAppMessage() {
    const productName = this.data.product ? this.data.product.name : '精选商品'
    return {
      title: `${productName} - 积分商城`,
      path: `/packageExchange/exchange-detail/exchange-detail?exchange_item_id=${this.data.exchangeItemId}`
    }
  }
})
