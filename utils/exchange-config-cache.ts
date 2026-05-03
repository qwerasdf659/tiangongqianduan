/**
 * 兑换页面配置缓存管理器
 *
 * 职责：
 *   1. 从后端 GET /api/v4/system/config/exchange-page 拉取兑换页面配置
 *   2. 保存到微信小程序本地缓存（wx.setStorageSync）
 *   3. 读取本地缓存，优先使用缓存保证加载速度
 *   4. 版本对比（updated_at 时间戳） + 后台静默更新
 *   5. 仅保留真实配置缓存，不再回退到前端内置业务默认值
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
 * 货架与卡片视觉统一由 CSS 设计令牌控制（--td-* / --tg-*），
 * 后端已移除 card_display.theme 字段（B5-B7 完成），此处不再包含 theme 字段。
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

// ===== 缓存管理类 =====

/**
 * 兑换页面配置缓存管理器（静态方法类）
 *
 * 加载流程（收紧为真实配置优先，与当前页面错误策略一致）：
 *   1. 本地缓存（结构有效）→ 立即返回，后台静默更新
 *   2. API 远程获取 → GET /api/v4/system/config/exchange-page
 *   3. API失败时回退到本地缓存（即使缓存已过期，只要结构有效）
 *   4. 无真实缓存且API失败 → 抛出错误，由页面明确提示后端缺失真实配置
 */
class ExchangeConfigCache {
  /**
   * 获取兑换页面配置（仅接受后端真实配置或真实缓存）
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

      /* 无缓存，同步请求后端API */
      exchangeConfigLog.info('无本地缓存，从后端API获取兑换页面配置...')
      const remoteConfig = await ExchangeConfigCache._fetchFromAPI()
      if (remoteConfig) {
        ExchangeConfigCache._saveToLocal(remoteConfig)
        return remoteConfig
      }

      throw new Error('后端未提供兑换页面真实配置，请检查 /api/v4/system/config/exchange-page')
    } catch (error) {
      exchangeConfigLog.error('获取兑换页面配置异常:', error)

      /* API失败时回退到真实缓存（即使缓存已过期，只要结构有效） */
      const fallbackCache = ExchangeConfigCache._getLocalCache()
      if (fallbackCache) {
        exchangeConfigLog.warn('API失败，回退到本地真实缓存')
        return fallbackCache
      }

      throw error
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
    throw new Error('后端未返回兑换页面真实配置，无法完成强制刷新')
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
  ExchangeConfigCache
}
