/**
 * 兑换页面配置缓存管理器
 *
 * 职责：
 *   1. 从后端 GET /api/v4/system/config/exchange-page 拉取兑换页面配置
 *   2. 保存到微信小程序本地缓存（wx.setStorageSync）
 *   3. 读取本地缓存，优先使用缓存保证加载速度
 *   4. 版本对比（updated_at 时间戳） + 后台静默更新
 *   5. 4层降级策略：本地缓存 → 远程API → 过期缓存 → 内置默认配置
 *
 * 使用方式：
 *   const { ExchangeConfigCache } = require('./exchange-config-cache')
 *   const config = await ExchangeConfigCache.getConfig()
 *
 * ⚠️ 内部模块，不通过 utils/index.ts 引用其他工具（避免循环依赖）
 *    外部页面统一从 utils/index.ts 导入 ExchangeConfigCache
 *
 * @file utils/exchange-config-cache.ts
 * @version 5.2.0
 * @since 2026-02-20
 */

/* 直接引用内部模块，避免循环依赖 */
const exchangeConfigApi = require('./api/index')
const { createLogger: createExchangeConfigLogger } = require('./logger')
const exchangeConfigLog = createExchangeConfigLogger('exchange-config-cache')

// ===== 缓存键名常量 =====

/** 配置数据缓存键 */
const EXCHANGE_CONFIG_CACHE_KEY = 'exchange_page_config'
/** 最后更新时间戳缓存键 */
const EXCHANGE_CONFIG_LAST_UPDATE_KEY = 'exchange_page_config_last_update'

// ===== 缓存有效期常量 =====

/** 缓存有效期（毫秒）- 24小时后视为过期，触发后台静默更新 */
const EXCHANGE_CONFIG_CACHE_EXPIRE = 24 * 60 * 60 * 1000

// ===== 类型定义（与后端 system_configs.config_value JSON 结构完全一致） =====

/** Tab 配置 */
interface TabConfig {
  key: string
  label: string
  icon?: string
  enabled: boolean
  sort_order: number
}

/** 空间配置 */
interface SpaceConfig {
  id: string
  name: string
  subtitle: string
  description?: string
  layout: 'waterfall' | 'grid' | 'list' | 'simple'
  color: string
  bgGradient?: string
  locked: boolean
  enabled: boolean
  sort_order: number
}

/** 通用筛选选项 — 统一 {value, label} 格式（对齐后端 exchange_page 配置） */
interface FilterOption {
  value: string
  label: string
  showCount?: boolean
}

/** 价格区间选项 — {label, min, max} 格式（对齐后端 cost_ranges） */
interface CostRangeOption {
  label: string
  min: number | null
  max: number | null
}

/**
 * 卡片视觉配置
 *
 * 主题由全局氛围主题系统管理（utils/global-themes.ts + utils/theme-cache.ts）
 * 后端已移除 card_display.theme 字段（B5-B7 完成），此处不再包含 theme 字段
 */
interface CardDisplayConfig {
  effects: {
    grain: boolean
    holo: boolean
    rotatingBorder: boolean
    breathingGlow: boolean
    ripple: boolean
    fullbleed: boolean
    listView: boolean
  }
  shop_cta_text: string
  market_cta_text: string
  show_stock_bar: boolean
  stock_display_mode: 'bar' | 'text' | 'badge'
  show_sold_count: boolean
  show_tags: boolean
  price_display_mode: 'normal' | 'highlight' | 'capsule'
  image_placeholder_style: 'gradient' | 'emoji' | 'icon'
  press_effect: 'scale' | 'ripple' | 'glow' | 'none'
  show_type_badge: boolean
  price_color_mode: 'fixed' | 'type_based'
  default_view_mode: 'grid' | 'list'
}

/**
 * 详情页配置（exchange_page.detail_page 子节点）
 *
 * 后端 system_configs 表 key='exchange_page' 的 JSON 中新增节点
 * 通过 GET /api/v4/system/config/exchange-page 返回
 * 后端在数据库缺少此节点时自动补充默认值
 */
interface DetailPageConfig {
  /** 属性区展示模式: 'grid'(网格卡片) / 'list'(文字列表) */
  attr_display_mode: 'grid' | 'list'
  /** 标签样式类型: 'game'(游戏风彩色圆角) / 'plain'(灰底黑字) */
  tag_style_type: 'game' | 'plain'
}

/** 运营参数配置 */
interface UIConfig {
  low_stock_threshold: number
  grid_page_size: number
  waterfall_page_size: number
  default_api_page_size: number
  search_debounce_ms: number
}

/** 兑换页面完整配置（与后端 system_configs.config_value JSON 结构一致） */
interface ExchangePageConfig {
  version?: string
  updated_at?: string
  tabs: TabConfig[]
  spaces: SpaceConfig[]
  shop_filters: {
    categories: FilterOption[]
    cost_ranges: CostRangeOption[]
    basic_filters: FilterOption[]
    stock_statuses: FilterOption[]
    sort_options: FilterOption[]
  }
  market_filters: {
    type_filters: FilterOption[]
    category_filters: FilterOption[]
    sort_options: FilterOption[]
  }
  card_display: CardDisplayConfig
  /** 详情页配置（属性展示模式 + 标签样式类型） */
  detail_page?: DetailPageConfig
  ui: UIConfig
}

// ===== 内置默认配置（降级层级4 — 代码写死，永不失效） =====
// 数据来源：后端 system_configs 的初始 JSON（B8 修正后），确保后端不可用时页面表现一致

const DEFAULT_EXCHANGE_CONFIG: ExchangePageConfig = {
  tabs: [
    { key: 'exchange', label: '商品兑换', icon: 'download', enabled: true, sort_order: 1 },
    { key: 'market', label: '交易市场', icon: 'success', enabled: true, sort_order: 2 },
    { key: 'exchange-rate', label: '汇率兑换', icon: 'waiting', enabled: true, sort_order: 3 }
  ],
  spaces: [
    {
      id: 'lucky',
      name: '🎁 幸运空间',
      subtitle: '瀑布流卡片',
      description: '发现随机好物',
      layout: 'waterfall',
      color: '#52c41a',
      bgGradient: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
      locked: false,
      enabled: true,
      sort_order: 1
    },
    {
      id: 'premium',
      name: '💎 臻选空间',
      subtitle: '混合精品展示',
      description: '解锁高级商品',
      layout: 'simple',
      color: '#ff6b35',
      bgGradient: 'linear-gradient(135deg, #f7931e 0%, #e67e22 100%)',
      locked: true,
      enabled: true,
      sort_order: 2
    }
  ],
  shop_filters: {
    basic_filters: [
      { value: 'all', label: '全部', showCount: true },
      { value: 'available', label: '可兑换', showCount: false },
      { value: 'low-price', label: '低价好物', showCount: false }
    ],
    categories: [
      { value: 'all', label: '全部' },
      { value: 'home_life', label: '品质生活' },
      { value: 'lifestyle', label: '日用百货' },
      { value: 'food', label: '美食特产' },
      { value: 'collectible', label: '收藏精品' },
      { value: 'other', label: '其他' }
    ],
    cost_ranges: [
      { label: '全部', min: null, max: null },
      { label: '100以内', min: 0, max: 100 },
      { label: '100-500', min: 100, max: 500 },
      { label: '500-1000', min: 500, max: 1000 },
      { label: '1000以上', min: 1000, max: null }
    ],
    stock_statuses: [
      { value: 'all', label: '全部' },
      { value: 'in_stock', label: '库存充足' },
      { value: 'low_stock', label: '即将售罄' }
    ],
    sort_options: [
      { value: 'sort_order', label: '默认排序' },
      { value: 'cost_amount_asc', label: '价格从低到高' },
      { value: 'cost_amount_desc', label: '价格从高到低' },
      { value: 'created_at_desc', label: '最新上架' },
      { value: 'sold_count_desc', label: '销量最高' }
    ]
  },
  market_filters: {
    type_filters: [
      { value: 'all', label: '全部', showCount: true },
      { value: 'item', label: '物品', showCount: false },
      { value: 'fungible_asset', label: '资产', showCount: false }
    ],
    category_filters: [
      { value: 'all', label: '全部' },
      { value: 'item', label: '物品' },
      { value: 'fungible_asset', label: '资产' }
    ],
    sort_options: [
      { value: 'default', label: '默认' },
      { value: 'created_at_desc', label: '最新上架' },
      { value: 'price_amount_asc', label: '价格升序' },
      { value: 'price_amount_desc', label: '价格降序' }
    ]
  },
  card_display: {
    effects: {
      grain: true,
      holo: true,
      rotatingBorder: true,
      breathingGlow: true,
      ripple: true,
      fullbleed: true,
      listView: false
    },
    shop_cta_text: '立即兑换',
    market_cta_text: '立即购买',
    show_stock_bar: true,
    stock_display_mode: 'bar' as const,
    show_sold_count: true,
    show_tags: true,
    price_display_mode: 'highlight' as const,
    image_placeholder_style: 'gradient' as const,
    press_effect: 'ripple' as const,
    show_type_badge: true,
    price_color_mode: 'type_based' as const,
    default_view_mode: 'grid' as const
  },
  ui: {
    low_stock_threshold: 10,
    grid_page_size: 4,
    waterfall_page_size: 20,
    default_api_page_size: 20,
    search_debounce_ms: 500
  }
}

// ===== 缓存管理类 =====

/**
 * 兑换页面配置缓存管理器（静态方法类）
 *
 * 加载流程（4层降级，与 ConfigCacheManager 架构一致）：
 *   1. 本地缓存（未过期）→ 立即返回，后台静默更新
 *   2. API 远程获取 → GET /api/v4/system/config/exchange-page
 *   3. 过期缓存（兜底）
 *   4. 内置默认值（终极兜底，= 后端初始JSON的拷贝）
 */
class ExchangeConfigCache {
  /**
   * 获取兑换页面配置（4层降级，保证始终返回有效配置）
   */
  static async getConfig(): Promise<ExchangePageConfig> {
    try {
      /* 层级1：尝试读取未过期的本地缓存 */
      const cachedConfig = ExchangeConfigCache._getLocalCache()

      if (cachedConfig) {
        exchangeConfigLog.info('使用本地缓存配置')

        const lastUpdate = wx.getStorageSync(EXCHANGE_CONFIG_LAST_UPDATE_KEY) || 0
        const isExpired = Date.now() - lastUpdate > EXCHANGE_CONFIG_CACHE_EXPIRE

        if (isExpired) {
          exchangeConfigLog.info('缓存已过期（超过24小时），后台静默更新')
        }

        /* 后台静默更新（不阻塞当前渲染） */
        ExchangeConfigCache._silentUpdate()

        return cachedConfig
      }

      /* 层级2：无缓存，同步请求后端API */
      exchangeConfigLog.info('无本地缓存，从后端API获取兑换页面配置...')
      const remoteConfig = await ExchangeConfigCache._fetchFromAPI()
      if (remoteConfig) {
        ExchangeConfigCache._saveToLocal(remoteConfig)
        return remoteConfig
      }

      /* 层级3+4 降级到默认值 */
      exchangeConfigLog.warn('API获取失败，使用内置默认配置')
      return DEFAULT_EXCHANGE_CONFIG
    } catch (error) {
      exchangeConfigLog.error('获取兑换页面配置异常:', error)

      /* 层级3：尝试使用过期缓存 */
      const fallbackCache = ExchangeConfigCache._getLocalCache()
      if (fallbackCache) {
        exchangeConfigLog.warn('使用过期缓存作为降级（层级3）')
        return fallbackCache
      }

      /* 层级4：内置默认配置 */
      exchangeConfigLog.warn('使用内置默认配置（降级层级4）')
      return DEFAULT_EXCHANGE_CONFIG
    }
  }

  /**
   * 从后端API获取配置
   * 响应结构: { success, code: 'EXCHANGE_PAGE_CONFIG_SUCCESS', data: ExchangePageConfig }
   */
  static async _fetchFromAPI(): Promise<ExchangePageConfig | null> {
    try {
      const response = await exchangeConfigApi.getExchangePageConfig()

      if (!response || !response.success || !response.data) {
        exchangeConfigLog.warn('后端API返回数据无效:', response?.code || '空响应')
        return null
      }

      const config: ExchangePageConfig = response.data
      exchangeConfigLog.info('后端配置获取成功, updated_at:', config.updated_at)
      return config
    } catch (error) {
      exchangeConfigLog.error('后端API请求失败:', error)
      return null
    }
  }

  /**
   * 从微信本地缓存读取配置
   */
  static _getLocalCache(): ExchangePageConfig | null {
    try {
      const cacheStr = wx.getStorageSync(EXCHANGE_CONFIG_CACHE_KEY)
      if (!cacheStr) {
        return null
      }

      const parsed: ExchangePageConfig = JSON.parse(cacheStr)

      /* 基础完整性校验：tabs 和 shop_filters 是核心必填 */
      if (!Array.isArray(parsed.tabs) || !parsed.shop_filters) {
        exchangeConfigLog.warn('缓存数据结构不完整，已清除')
        ExchangeConfigCache.clearCache()
        return null
      }

      return parsed
    } catch (error) {
      exchangeConfigLog.error('读取本地缓存失败:', error)
      ExchangeConfigCache.clearCache()
      return null
    }
  }

  /**
   * 保存配置到微信本地缓存
   */
  static _saveToLocal(config: ExchangePageConfig): void {
    try {
      wx.setStorageSync(EXCHANGE_CONFIG_CACHE_KEY, JSON.stringify(config))
      wx.setStorageSync(EXCHANGE_CONFIG_LAST_UPDATE_KEY, Date.now())
      exchangeConfigLog.info('配置已保存到本地缓存')
    } catch (error) {
      exchangeConfigLog.error('保存本地缓存失败:', error)
    }
  }

  /**
   * 后台静默更新配置（不阻塞主流程，失败不影响用户使用）
   */
  static _silentUpdate(): void {
    ;(async () => {
      try {
        const remoteConfig = await ExchangeConfigCache._fetchFromAPI()
        if (!remoteConfig) {
          return
        }

        /* 版本对比：通过 updated_at 判断是否有更新 */
        const cachedStr = wx.getStorageSync(EXCHANGE_CONFIG_CACHE_KEY)
        if (cachedStr) {
          const cached: ExchangePageConfig = JSON.parse(cachedStr)
          if (cached.updated_at === remoteConfig.updated_at) {
            exchangeConfigLog.info('后台检查: 已是最新版本')
            return
          }
        }

        exchangeConfigLog.info('发现新版本配置，静默更新')
        ExchangeConfigCache._saveToLocal(remoteConfig)
      } catch (error) {
        exchangeConfigLog.warn('后台静默更新失败（不影响使用）:', error)
      }
    })()
  }

  /**
   * 强制刷新配置（用于下拉刷新场景）
   */
  static async forceRefresh(): Promise<ExchangePageConfig> {
    exchangeConfigLog.info('强制刷新兑换页面配置...')
    const config = await ExchangeConfigCache._fetchFromAPI()
    if (config) {
      ExchangeConfigCache._saveToLocal(config)
      return config
    }
    return DEFAULT_EXCHANGE_CONFIG
  }

  /**
   * 清除本地缓存
   */
  static clearCache(): void {
    try {
      wx.removeStorageSync(EXCHANGE_CONFIG_CACHE_KEY)
      wx.removeStorageSync(EXCHANGE_CONFIG_LAST_UPDATE_KEY)
      exchangeConfigLog.info('兑换页面配置缓存已清除')
    } catch (error) {
      exchangeConfigLog.error('清除缓存失败:', error)
    }
  }
}

module.exports = {
  ExchangeConfigCache,
  DEFAULT_EXCHANGE_CONFIG
}
