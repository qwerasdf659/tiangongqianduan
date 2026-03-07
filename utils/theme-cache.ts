/**
 * 全局氛围主题缓存管理器
 *
 * 职责：
 *   1. 从后端 GET /api/v4/system/config/app-theme 拉取全局氛围主题配置
 *   2. 保存到微信小程序本地缓存（wx.setStorageSync）
 *   3. 提供 getThemeName() / getThemeStyle() 供所有 Tab 页读取
 *   4. 4 层降级策略：本地缓存 → 远程 API → 过期缓存 → 内置默认主题
 *
 * 使用方式（Page 级别）：
 *   const { ThemeCache } = require('../../utils/index')
 *   const themeName = await ThemeCache.getThemeName()       // 异步获取（4层降级）
 *   const themeSync = ThemeCache.getThemeNameSync()          // 同步获取（无网络请求）
 *   const themeStyle = ThemeCache.getThemeStyleSync()        // 同步获取 CSS 变量字符串
 *   this.setData({ globalThemeStyle: themeStyle })
 *
 * 导出方式：直接导出静态方法（与 utils/index.ts 的 spread 模式对齐，避免双层包裹）
 *
 * ⚠️ 内部模块，不通过 utils/index.ts 引用其他工具（避免循环依赖）
 *    外部页面统一从 utils/index.ts 导入 ThemeCache
 *
 * @file utils/theme-cache.ts
 * @version 6.0.0
 * @since 2026-03-06
 */

/* 直接引用内部模块，避免循环依赖 */
const themeCacheApi = require('./api/index')
const { createLogger: createThemeCacheLogger } = require('./logger')
const { getGlobalThemeStyle } = require('./global-themes')
const themeCacheLog = createThemeCacheLogger('theme-cache')

// ===== 缓存键名常量 =====

/** 主题名称缓存键（存储主题标识字符串，如 'gold_luxury'） */
const APP_THEME_CACHE_KEY = 'app_theme_name'
/** 最后更新时间戳缓存键 */
const APP_THEME_LAST_UPDATE_KEY = 'app_theme_last_update'

// ===== 缓存有效期常量 =====

/** 缓存有效期（毫秒）- 24 小时后视为过期，触发后台静默更新 */
const THEME_CACHE_EXPIRE = 24 * 60 * 60 * 1000

// ===== 内置默认主题 =====

/** 当后端 API 不可用且无缓存时，回退到此默认主题 */
const BUILTIN_DEFAULT_THEME = 'default'

// ===== 缓存管理类 =====

/**
 * 全局氛围主题缓存管理器（静态方法类）
 *
 * 加载流程（4 层降级，与 ConfigCacheManager / ExchangeConfigCache 架构一致）：
 *   1. 本地缓存（未过期）→ 立即返回，后台静默更新
 *   2. API 远程获取 → GET /api/v4/system/config/app-theme
 *   3. 过期缓存（兜底）
 *   4. 内置默认值 'default'（终极兜底）
 */
class ThemeCache {
  /**
   * 获取当前全局主题名称（4 层降级，保证始终返回有效主题标识）
   * @returns 主题标识字符串，如 'gold_luxury'
   */
  static async getThemeName(): Promise<string> {
    try {
      /* 层级 1：尝试读取本地缓存 */
      const cachedTheme = ThemeCache._getLocalCache()
      themeCacheLog.info('getThemeName 调用, 本地缓存:', cachedTheme || '无')

      if (cachedTheme) {
        themeCacheLog.info('使用本地缓存主题:', cachedTheme)

        const lastUpdate = wx.getStorageSync(APP_THEME_LAST_UPDATE_KEY) || 0
        if (Date.now() - lastUpdate > THEME_CACHE_EXPIRE) {
          themeCacheLog.info('主题缓存已过期（超过 24 小时），后台静默更新')
        }

        /* 后台静默更新（不阻塞当前渲染） */
        ThemeCache._silentUpdate()

        return cachedTheme
      }

      /* 层级 2：无缓存，同步请求后端 API */
      themeCacheLog.info('无本地缓存，从后端 API 获取全局主题...')
      const remoteTheme = await ThemeCache._fetchFromAPI()
      if (remoteTheme) {
        ThemeCache._saveToLocal(remoteTheme)
        return remoteTheme
      }

      /* 层级 3+4：降级到默认主题 */
      themeCacheLog.warn('API 获取失败，使用内置默认主题:', BUILTIN_DEFAULT_THEME)
      return BUILTIN_DEFAULT_THEME
    } catch (error) {
      themeCacheLog.error('获取全局主题异常:', error)

      /* 层级 3：尝试使用过期缓存 */
      const fallbackCache = ThemeCache._getLocalCache()
      if (fallbackCache) {
        themeCacheLog.warn('使用过期缓存主题作为降级:', fallbackCache)
        return fallbackCache
      }

      /* 层级 4：内置默认主题 */
      return BUILTIN_DEFAULT_THEME
    }
  }

  /**
   * 同步获取当前主题的 CSS 变量样式字符串（不触发网络请求）
   *
   * 适用场景：Page.onShow() 等需要快速获取主题的场景
   * 首次访问前需确保已调用过 getThemeName()（App.onLaunch 中初始化）
   *
   * @returns CSS 内联样式字符串（--theme-* + --shelf-* 变量），无缓存时返回 default 主题
   */
  static getThemeStyleSync(): string {
    const themeName = ThemeCache._getLocalCache() || BUILTIN_DEFAULT_THEME
    return getGlobalThemeStyle(themeName)
  }

  /**
   * 同步获取当前主题名称（不触发网络请求）
   * @returns 主题标识字符串，无缓存时返回 'default'
   */
  static getThemeNameSync(): string {
    return ThemeCache._getLocalCache() || BUILTIN_DEFAULT_THEME
  }

  /**
   * 强制刷新主题（用于下拉刷新或管理后台切换主题后通知前端）
   * @returns 最新的主题标识
   */
  static async forceRefresh(): Promise<string> {
    themeCacheLog.info('强制刷新全局主题...')
    const theme = await ThemeCache._fetchFromAPI()
    if (theme) {
      ThemeCache._saveToLocal(theme)
      return theme
    }
    return ThemeCache._getLocalCache() || BUILTIN_DEFAULT_THEME
  }

  /**
   * 清除本地缓存（用于调试或登出场景）
   */
  static clearCache(): void {
    try {
      wx.removeStorageSync(APP_THEME_CACHE_KEY)
      wx.removeStorageSync(APP_THEME_LAST_UPDATE_KEY)
      themeCacheLog.info('主题缓存已清除')
    } catch (error) {
      themeCacheLog.error('清除主题缓存失败:', error)
    }
  }

  // ===== 私有方法 =====

  /**
   * 从后端 API 获取全局主题配置
   *
   * 后端 API：GET /api/v4/system/config/app-theme
   * 响应格式：{ success: true, data: { theme: 'gold_luxury' } }
   *
   * ⚠️ 此 API 需要后端实现，详见 docs/后端对接需求-全局氛围主题.md
   */
  static async _fetchFromAPI(): Promise<string | null> {
    try {
      themeCacheLog.info('正在请求后端主题 API: /system/config/app-theme')
      const response = await themeCacheApi.getAppThemeConfig()
      themeCacheLog.info('后端主题 API 原始响应:', JSON.stringify(response))

      if (!response || !response.success || !response.data) {
        themeCacheLog.warn('后端主题 API 返回无效:', response?.code || '空响应')
        return null
      }

      const themeName: string = response.data.theme
      if (!themeName || typeof themeName !== 'string') {
        themeCacheLog.warn('后端返回的 theme 字段无效:', themeName)
        return null
      }

      themeCacheLog.info('后端主题获取成功:', themeName)
      return themeName
    } catch (error) {
      themeCacheLog.error('后端主题 API 请求失败:', error)
      return null
    }
  }

  /**
   * 从微信本地缓存读取主题名称
   * @returns 缓存的主题标识，无缓存返回 null
   */
  static _getLocalCache(): string | null {
    try {
      const cached = wx.getStorageSync(APP_THEME_CACHE_KEY)
      return cached || null
    } catch (error) {
      themeCacheLog.error('读取主题缓存失败:', error)
      return null
    }
  }

  /**
   * 保存主题名称到微信本地缓存
   */
  static _saveToLocal(themeName: string): void {
    try {
      wx.setStorageSync(APP_THEME_CACHE_KEY, themeName)
      wx.setStorageSync(APP_THEME_LAST_UPDATE_KEY, Date.now())
      themeCacheLog.info('主题已缓存:', themeName)
    } catch (error) {
      themeCacheLog.error('保存主题缓存失败:', error)
    }
  }

  /**
   * 后台静默更新主题（不阻塞主流程，失败不影响用户使用）
   */
  static _silentUpdate(): void {
    ;(async () => {
      try {
        const remoteTheme = await ThemeCache._fetchFromAPI()
        if (!remoteTheme) {
          return
        }

        const cachedTheme = ThemeCache._getLocalCache()
        if (cachedTheme === remoteTheme) {
          themeCacheLog.info('后台检查: 主题已是最新:', cachedTheme)
          return
        }

        themeCacheLog.info(`发现新主题: ${cachedTheme} → ${remoteTheme}，静默更新`)
        ThemeCache._saveToLocal(remoteTheme)
      } catch (error) {
        themeCacheLog.warn('后台静默更新主题失败（不影响使用）:', error)
      }
    })()
  }
}

module.exports = {
  getThemeName: ThemeCache.getThemeName,
  getThemeNameSync: ThemeCache.getThemeNameSync,
  getThemeStyleSync: ThemeCache.getThemeStyleSync,
  forceRefresh: ThemeCache.forceRefresh,
  clearCache: ThemeCache.clearCache
}
