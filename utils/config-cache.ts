/**
 * 活动位置配置缓存管理器
 *
 * 职责：
 *   1. 从后端 GET /api/v4/system/config/placement 拉取活动位置配置
 *   2. 保存到微信小程序本地缓存（wx.setStorageSync）
 *   3. 读取本地缓存，优先使用缓存保证加载速度
 *   4. 版本对比 + 后台静默更新
 *   5. 仅接受后端真实配置或本地真实缓存，不再使用前端内置业务默认配置
 *
 * 使用方式：
 *   const { configCache } = require('./config-cache')
 *   const placementConfig = await configCache.getConfig()
 *
 * ⚠️ 内部模块，不通过 utils/index.ts 引用其他工具
 *    外部页面统一从 utils/index.ts 导入 ConfigCache
 *
 * @file utils/config-cache.ts
 * @version 5.2.0
 * @since 2026-02-14
 */

/* 直接引用内部模块，避免循环依赖 */
const configCacheApi = require('./api/index')
const { createLogger } = require('./logger')
const log = createLogger('config-cache')

// ===== 缓存键名常量 =====

/** 配置数据缓存键 */
const PLACEMENT_CACHE_KEY = 'campaign_placement_config'
/** 配置版本号缓存键 */
const PLACEMENT_VERSION_KEY = 'campaign_placement_version'
/** 最后更新时间戳缓存键 */
const PLACEMENT_LAST_UPDATE_KEY = 'campaign_placement_last_update'

// ===== 缓存有效期常量 =====

/** 缓存有效期（毫秒）- 24小时后视为过期，触发后台静默更新 */
const CACHE_EXPIRE_TIME = 24 * 60 * 60 * 1000

// ===== 类型定义（与后端API响应格式一致，全部snake_case） =====

/** 单个活动的位置配置 */
interface PlacementItem {
  /** 活动唯一标识（后端数据库 lottery_campaigns.campaign_code，如 CAMP20250901001） */
  campaign_code: string
  /** 位置配置详情 */
  placement: {
    /** 展示页面（lottery | discover | user） */
    page: string
    /** 页面位置（main | secondary | floating | top | bottom） */
    position: string
    /** 组件尺寸（full | medium | small | mini） */
    size: string
    /** 优先级，数字越大越靠前（默认0） */
    priority: number
  }
}

/** 位置配置完整数据结构（对应后端 GET /api/v4/system/config/placement 响应） */
interface PlacementConfig {
  /** 配置版本号（语义化版本，如 "1.0.5"） */
  version: string
  /** 配置更新时间（ISO 8601 格式） */
  updated_at: string
  /** 活动位置配置列表 */
  placements: PlacementItem[]
}

/** 配置校验结果 */
interface ValidationResult {
  /** 是否校验通过 */
  valid: boolean
  /** 校验失败原因列表 */
  errors: string[]
}

// ===== 配置数据规范化 =====

/**
 * 规范化后端返回的配置数据
 * 后端可能缺少 version / updated_at 等非核心字段，前端自动补充默认值
 * 避免因元数据字段缺失导致整个配置加载失败
 *
 * @param rawConfig 后端原始配置数据
 * @returns 规范化后的配置数据（保证 version、updated_at 字段存在）
 */
function normalizePlacementConfig(rawConfig: any): any {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return rawConfig
  }

  const normalized = { ...rawConfig }

  /* 后端未返回 version 字段时，自动补充默认版本号 */
  if (!normalized.version) {
    normalized.version = '1.0.0-auto'
    log.warn('[配置缓存] 后端未返回 version 字段，已自动补充默认值: 1.0.0-auto')
  }

  /* 后端未返回 updated_at 字段时，使用当前时间 */
  if (!normalized.updated_at) {
    normalized.updated_at = new Date().toISOString()
    log.warn('[配置缓存] 后端未返回 updated_at 字段，已使用当前时间')
  }

  return normalized
}

// ===== 配置校验器 =====

/**
 * 配置校验器 - 防止后端返回的配置数据格式错误导致前端异常
 *
 * 校验规则：
 *   1. 必填字段完整性（placements 为核心必填，version 为可选）
 *   2. 每项 placement 结构完整性（campaign_code、page、position、size）
 *   3. 枚举值有效性（page/position/size字段）
 *   4. 业务规则（每个页面最多一个 main 位置活动）
 *
 * 注意：version 字段缺失不再视为校验错误，由 normalizePlacementConfig 自动补充
 */
function validatePlacementConfig(config: PlacementConfig): ValidationResult {
  const errors: string[] = []

  /* 1. 必填字段校验 */
  if (!config || typeof config !== 'object') {
    errors.push('配置数据为空或格式错误')
    return { valid: false, errors }
  }

  /* version 字段缺失仅记录警告，不阻塞配置加载（由 normalizePlacementConfig 补充） */
  if (!config.version) {
    log.warn('[配置校验] version 字段缺失，建议后端补充该字段')
  }

  if (!Array.isArray(config.placements)) {
    errors.push('配置缺少 placements 数组')
    return { valid: false, errors }
  }

  /* 2. 每项 placement 结构校验 */
  const validPages = ['lottery', 'discover', 'user']
  const validPositions = ['main', 'secondary', 'floating', 'top', 'bottom']
  const validSizes = ['full', 'medium', 'small', 'mini']

  config.placements.forEach((item: PlacementItem, index: number) => {
    if (!item.campaign_code) {
      errors.push(`第${index + 1}个活动缺少 campaign_code`)
    }

    if (!item.placement || typeof item.placement !== 'object') {
      errors.push(`第${index + 1}个活动缺少 placement 配置`)
      return
    }

    const placementData = item.placement

    if (!placementData.page || !validPages.includes(placementData.page)) {
      errors.push(`第${index + 1}个活动 page 字段无效: ${placementData.page}`)
    }

    if (!placementData.position || !validPositions.includes(placementData.position)) {
      errors.push(`第${index + 1}个活动 position 字段无效: ${placementData.position}`)
    }

    if (!placementData.size || !validSizes.includes(placementData.size)) {
      errors.push(`第${index + 1}个活动 size 字段无效: ${placementData.size}`)
    }

    /* priority 校验（可选字段，默认为0） */
    if (
      placementData.priority !== undefined &&
      (typeof placementData.priority !== 'number' ||
        placementData.priority < 0 ||
        placementData.priority > 1000)
    ) {
      errors.push(`第${index + 1}个活动 priority 值不合理: ${placementData.priority}`)
    }
  })

  /* 3. 业务规则校验：每个页面最多一个 main 位置活动 */
  const pageMainCount: Record<string, number> = {}
  config.placements.forEach((item: PlacementItem) => {
    if (item.placement && item.placement.position === 'main') {
      const pageName = item.placement.page
      pageMainCount[pageName] = (pageMainCount[pageName] || 0) + 1
    }
  })

  Object.entries(pageMainCount).forEach(([pageName, count]) => {
    if (count > 1) {
      errors.push(`页面 ${pageName} 存在 ${count} 个 main 位置活动（最多允许1个）`)
    }
  })

  return {
    valid: errors.length === 0,
    errors
  }
}

// ===== 配置缓存管理类 =====

/**
 * 活动位置配置缓存管理器（单例）
 *
 * 加载流程：
 *   1. 读取本地缓存 → 有缓存则立即返回，同时后台静默更新
 *   2. 无缓存 → 同步请求后端API → 成功则缓存并返回
 *   3. API失败 → 读取过期缓存（仍属后端真实缓存）
 *   4. 无任何真实缓存 → 抛出错误，由页面明确提示后端缺少真实配置
 */
class ConfigCacheManager {
  /**
   * 获取活动位置配置（缓存优先策略）
   *
   * @returns 位置配置数据（仅后端真实配置或本地真实缓存）
   */
  async getConfig(): Promise<PlacementConfig> {
    try {
      /* 层级1：尝试读取本地缓存 */
      const cachedConfig = this._getCachedConfig()

      if (cachedConfig) {
        log.info('[配置缓存] 使用本地缓存, 版本:', cachedConfig.version)

        /* 检查缓存是否过期 */
        const lastUpdateTime = wx.getStorageSync(PLACEMENT_LAST_UPDATE_KEY) || 0
        const isExpired = Date.now() - lastUpdateTime > CACHE_EXPIRE_TIME

        if (isExpired) {
          log.info('[配置缓存] 缓存已过期（超过24小时），后台静默更新中...')
        }

        /* 后台静默更新（不阻塞当前渲染） */
        this._updateConfigInBackground()

        return cachedConfig
      }

      /* 层级2：无缓存，同步请求后端API */
      log.info('[配置缓存] 无本地缓存，从后端API获取...')
      return await this._fetchAndCacheConfig()
    } catch (fetchError) {
      log.error('[配置缓存] API请求失败:', fetchError)

      /* 层级3：API失败，尝试使用过期缓存 */
      const fallbackCachedConfig = this._getCachedConfig()
      if (fallbackCachedConfig) {
        log.warn('[配置缓存] 使用过期缓存作为降级（层级3）')
        return fallbackCachedConfig
      }

      throw new Error('后端未提供活动位置真实配置，请检查 /api/v4/system/config/placement')
    }
  }

  /**
   * 强制刷新配置（用于下拉刷新场景）
   * 绕过缓存，直接请求后端API并更新缓存
   *
   * @returns 最新的位置配置数据
   * @throws 网络或API错误
   */
  async forceRefresh(): Promise<PlacementConfig> {
    log.info('[配置缓存] 强制刷新配置...')
    return await this._fetchAndCacheConfig()
  }

  /**
   * 获取指定页面的活动配置列表
   * 从完整配置中筛选出指定页面的活动，并按priority降序排序
   *
   * @param pageName 页面名称（lottery | discover | user）
   * @returns 该页面的活动配置列表（已排序）
   */
  async getPagePlacements(pageName: string): Promise<PlacementItem[]> {
    const fullConfig = await this.getConfig()

    return fullConfig.placements
      .filter((item: PlacementItem) => item.placement.page === pageName)
      .sort(
        (a: PlacementItem, b: PlacementItem) =>
          (b.placement.priority || 0) - (a.placement.priority || 0)
      )
  }

  /**
   * 清除本地缓存（用于调试或登出场景）
   */
  clearCache(): void {
    try {
      wx.removeStorageSync(PLACEMENT_CACHE_KEY)
      wx.removeStorageSync(PLACEMENT_VERSION_KEY)
      wx.removeStorageSync(PLACEMENT_LAST_UPDATE_KEY)
      log.info('[配置缓存] 缓存已清除')
    } catch (clearError) {
      log.error('[配置缓存] 清除缓存失败:', clearError)
    }
  }

  /**
   * 获取缓存状态信息（用于调试）
   */
  getCacheInfo(): { version: string; lastUpdate: number; hasCache: boolean } {
    return {
      version: wx.getStorageSync(PLACEMENT_VERSION_KEY) || '无缓存',
      lastUpdate: wx.getStorageSync(PLACEMENT_LAST_UPDATE_KEY) || 0,
      hasCache: !!wx.getStorageSync(PLACEMENT_CACHE_KEY)
    }
  }

  // ===== 私有方法 =====

  /**
   * 从微信本地缓存读取配置
   * @returns 缓存的配置数据，无缓存返回null
   */
  _getCachedConfig(): PlacementConfig | null {
    try {
      const configStr = wx.getStorageSync(PLACEMENT_CACHE_KEY)
      if (!configStr) {
        return null
      }

      const parsedConfig: PlacementConfig = JSON.parse(configStr)

      /* 校验缓存数据的完整性 */
      const validationResult = validatePlacementConfig(parsedConfig)
      if (!validationResult.valid) {
        log.warn('[配置缓存] 缓存数据校验失败，将重新获取:', validationResult.errors)
        this.clearCache()
        return null
      }

      return parsedConfig
    } catch (parseError) {
      log.error('[配置缓存] 读取/解析缓存失败:', parseError)
      this.clearCache()
      return null
    }
  }

  /**
   * 从后端API获取配置并保存到缓存
   * @returns 最新的位置配置数据
   * @throws API请求错误或响应格式错误
   */
  async _fetchAndCacheConfig(): Promise<PlacementConfig> {
    const apiResponse = await configCacheApi.getPlacementConfig()

    if (!apiResponse.success || !apiResponse.data) {
      throw new Error('获取位置配置失败: ' + (apiResponse.message || '后端返回数据为空'))
    }

    /* 规范化后端数据：自动补充缺失的 version / updated_at 字段 */
    const remoteConfig: PlacementConfig = normalizePlacementConfig(apiResponse.data)

    /* 校验后端返回的配置数据（核心字段：placements） */
    const validationResult = validatePlacementConfig(remoteConfig)
    if (!validationResult.valid) {
      log.error('[配置缓存] 后端返回的配置校验失败:', validationResult.errors)
      throw new Error('后端配置数据格式错误: ' + validationResult.errors.join('; '))
    }

    /* 保存到本地缓存 */
    this._saveToCache(remoteConfig)

    log.info('[配置缓存] 配置已从后端获取并缓存, 版本:', remoteConfig.version)

    return remoteConfig
  }

  /**
   * 后台静默更新配置（不阻塞主流程，失败不影响用户使用）
   */
  _updateConfigInBackground(): void {
    /* 异步执行，catch防止未处理的Promise rejection */
    ;(async () => {
      try {
        const cachedVersion = wx.getStorageSync(PLACEMENT_VERSION_KEY) || '0.0.0'
        const apiResponse = await configCacheApi.getPlacementConfig()

        if (!apiResponse.success || !apiResponse.data) {
          return
        }

        /* 规范化后端数据：自动补充缺失的 version / updated_at 字段 */
        const remoteConfig: PlacementConfig = normalizePlacementConfig(apiResponse.data)
        const remoteVersion = remoteConfig.version

        /* 版本对比：仅新版本时才更新缓存 */
        if (this._isNewerVersion(remoteVersion, cachedVersion)) {
          /* 校验新配置 */
          const validationResult = validatePlacementConfig(remoteConfig)
          if (!validationResult.valid) {
            log.warn('[配置缓存] 后台更新: 新版本配置校验失败，保留旧缓存')
            return
          }

          log.info(`[配置缓存] 发现新版本: ${cachedVersion} → ${remoteVersion}，静默更新`)
          this._saveToCache(remoteConfig)
        } else {
          log.info('[配置缓存] 后台检查: 已是最新版本', cachedVersion)
        }
      } catch (bgError) {
        /* 静默失败，不影响用户使用 */
        log.warn('[配置缓存] 后台静默更新失败（不影响使用）:', bgError)
      }
    })()
  }

  /**
   * 保存配置到微信本地缓存
   * @param config 待缓存的配置数据
   */
  _saveToCache(config: PlacementConfig): void {
    try {
      wx.setStorageSync(PLACEMENT_CACHE_KEY, JSON.stringify(config))
      wx.setStorageSync(PLACEMENT_VERSION_KEY, config.version)
      wx.setStorageSync(PLACEMENT_LAST_UPDATE_KEY, Date.now())
      log.info('[配置缓存] 缓存已保存, 版本:', config.version)
    } catch (saveError) {
      log.error('[配置缓存] 保存缓存失败:', saveError)
    }
  }

  /**
   * 语义化版本号比较
   * @param newVersion 新版本号（如 "1.0.5"）
   * @param oldVersion 旧版本号（如 "1.0.3"）
   * @returns true 表示 newVersion > oldVersion
   */
  _isNewerVersion(newVersion: string, oldVersion: string): boolean {
    const newParts = newVersion.split('.').map(Number)
    const oldParts = oldVersion.split('.').map(Number)

    for (let i = 0; i < 3; i++) {
      const newPart = newParts[i] || 0
      const oldPart = oldParts[i] || 0

      if (newPart > oldPart) {
        return true
      }
      if (newPart < oldPart) {
        return false
      }
    }

    return false
  }
}

// ===== 导出单例实例 =====

/** 配置缓存管理器单例（全局共享同一实例） */
const configCache = new ConfigCacheManager()

module.exports = {
  configCache,
  ConfigCacheManager,
  validatePlacementConfig
}
