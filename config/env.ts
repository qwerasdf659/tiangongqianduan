/**
 * 环境配置管理v5.1 - V4统一引擎架构
 * 支持4种环境: development(开发)、mobile(真机)、testing(测试)、production(生产)
 *
 * v5.1优化: 提取 BASE_BUSINESS_CONFIG / BASE_SECURITY_CONFIG / BASE_DEVELOPMENT_CONFIG
 * 消除4个环境80%重复配置，各环境仅覆盖有差异的部分
 *
 * @file 天工餐厅积分系统 - 环境配置
 * @version 5.2.0
 * @since 2026-02-10
 */

// ===== 类型定义 =====

/** API服务配置 */
interface ApiConfig {
  baseUrl: string
  apiPrefix: string
  timeout: number
  retryTimes: number
  retryDelay: number
  healthCheckTimeout?: number
  enableNetworkDiagnostics?: boolean
  enableAutoRetry?: boolean
}

/** WebSocket服务配置（Socket.IO） */
interface WebSocketConfig {
  /** Socket.IO 服务地址（http/https，不拼 /ws） */
  url: string
  /** 重连延迟基础值（ms），Socket.IO 内部使用 */
  reconnectionDelay: number
  /** 最大重连次数，Socket.IO 内部使用 */
  reconnectionAttempts: number
  /**
   * 连接超时时间（ms），握手阶段超时后触发 connect_error
   * 微信开发者工具环境下代理链路较长，需要足够的握手时间
   */
  timeout: number
}

/** 开发阶段配置 */
interface DevelopmentConfig {
  enableUnifiedAuth: boolean
  devVerificationCode: string | null
  skipSmsVerification: boolean
  enableAdminAutoDetection: boolean
  disableSmsService: boolean
  preserveSmsFields: boolean
  enableDebugMode: boolean
  showDetailedErrors: boolean
}

/** 抽奖业务配置 */
interface LotteryBusinessConfig {
  enabled: boolean
  engineVersion: string
  supportMultipleDraw: boolean
}

/** 库存业务配置 */
interface InventoryBusinessConfig {
  enabled: boolean
  enableUserInventory: boolean
  supportTransfer: boolean
  supportVerification: boolean
}

/** 上传业务配置 */
interface UploadsBusinessConfig {
  enabled: boolean
  storageProvider: string
  manualReviewMode: boolean
  maxFileSize: number
  allowedTypes: string[]
}

/** 权限业务配置 */
interface PermissionsBusinessConfig {
  enabled: boolean
  enableRoleBasedAccess: boolean
  supportBatchCheck: boolean
}

/** 业务模块配置 */
interface BusinessConfig {
  lottery: LotteryBusinessConfig
  inventory: InventoryBusinessConfig
  uploads: UploadsBusinessConfig
  permissions: PermissionsBusinessConfig
}

/** 安全配置 */
interface SecurityConfig {
  enableDataValidation: boolean
  enableSafetyChecks: boolean
  apiVersion: string
}

/** 单个环境完整配置 */
interface EnvironmentConfig {
  api: ApiConfig
  websocket: WebSocketConfig
  development: DevelopmentConfig
  business: BusinessConfig
  security: SecurityConfig
}

/** 所有环境配置 */
interface AllEnvironmentConfig {
  [key: string]: EnvironmentConfig
}

/** getApiConfig 返回类型 */
interface ApiConfigResult {
  baseUrl: string
  apiPrefix: string
  fullUrl: string
  timeout: number
  retryTimes: number
  retryDelay: number
}

// ===== 基础配置（所有环境共享，各环境仅覆盖有差异的部分） =====

/** 业务模块基础配置 — 4个环境完全一致 */
const BASE_BUSINESS_CONFIG: BusinessConfig = {
  lottery: {
    enabled: true,
    engineVersion: '4.0.0',
    /* 单抽消耗由后端API /lottery/campaigns/:code/config 的 per_draw_cost 字段决定 */
    /* 保底功能开关由后端 pity_info.pity_enabled 控制，前端不做本地配置 */
    supportMultipleDraw: true
  },
  inventory: {
    enabled: true,
    enableUserInventory: true,
    supportTransfer: true,
    supportVerification: true
  },
  uploads: {
    enabled: true,
    storageProvider: 'sealos',
    manualReviewMode: true,
    maxFileSize: 10485760, // 10MB
    allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
  },
  permissions: {
    enabled: true,
    enableRoleBasedAccess: true,
    supportBatchCheck: true
  }
}

/** 安全基础配置 — 4个环境完全一致 */
const BASE_SECURITY_CONFIG: SecurityConfig = {
  enableDataValidation: true,
  enableSafetyChecks: true,
  apiVersion: 'v4.0'
}

/** 开发阶段基础配置 — dev/mobile/testing共享，production 独立覆盖 */
const BASE_DEVELOPMENT_CONFIG: DevelopmentConfig = {
  enableUnifiedAuth: true,
  devVerificationCode: '123456', // 后端控制的开发验证码，非mock数据
  skipSmsVerification: true,
  enableAdminAutoDetection: true,
  disableSmsService: true,
  preserveSmsFields: true,
  enableDebugMode: true,
  showDetailedErrors: true
}

// ===== 环境配置数据 =====

const ENV_CONFIG: AllEnvironmentConfig = {
  /** 开发环境配置（微信开发者工具） */
  development: {
    api: {
      baseUrl: 'https://omqktqrtntnn.sealosbja.site',
      apiPrefix: '/api/v4',
      timeout: 30000,
      retryTimes: 3,
      retryDelay: 2000,
      healthCheckTimeout: 8000,
      enableNetworkDiagnostics: true,
      enableAutoRetry: true
    },
    websocket: {
      url: 'https://omqktqrtntnn.sealosbja.site',
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
      timeout: 30000
    },
    development: { ...BASE_DEVELOPMENT_CONFIG },
    business: { ...BASE_BUSINESS_CONFIG },
    security: { ...BASE_SECURITY_CONFIG }
  },

  /**
   * 真机调试环境
   * ⚠️ baseUrl 为本地 IP，换网络（WiFi/热点）时需要手动更新
   */
  mobile: {
    api: {
      baseUrl: 'http://192.168.43.12:3000',
      apiPrefix: '/api/v4',
      timeout: 30000,
      retryTimes: 3,
      retryDelay: 2000,
      healthCheckTimeout: 8000,
      enableNetworkDiagnostics: true,
      enableAutoRetry: true
    },
    websocket: {
      url: 'https://omqktqrtntnn.sealosbja.site',
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
      timeout: 30000
    },
    development: { ...BASE_DEVELOPMENT_CONFIG },
    business: { ...BASE_BUSINESS_CONFIG },
    security: { ...BASE_SECURITY_CONFIG }
  },

  /** 测试环境 - V4统一引擎架构 */
  testing: {
    api: {
      baseUrl: 'https://omqktqrtntnn.sealosbja.site',
      apiPrefix: '/api/v4',
      timeout: 15000,
      retryTimes: 3,
      retryDelay: 2000
    },
    websocket: {
      url: 'https://omqktqrtntnn.sealosbja.site',
      reconnectionDelay: 3000,
      reconnectionAttempts: 5,
      timeout: 30000
    },
    development: {
      ...BASE_DEVELOPMENT_CONFIG,
      disableSmsService: false,
      enableDebugMode: false
    },
    business: { ...BASE_BUSINESS_CONFIG },
    security: { ...BASE_SECURITY_CONFIG }
  },

  /** 生产环境 - V4统一引擎架构（安全严格设置） */
  production: {
    api: {
      baseUrl: 'https://omqktqrtntnn.sealosbja.site', // 🚨 部署时更新为正式域名
      apiPrefix: '/api/v4',
      timeout: 20000,
      retryTimes: 2,
      retryDelay: 3000,
      healthCheckTimeout: 10000,
      enableNetworkDiagnostics: false,
      enableAutoRetry: true
    },
    websocket: {
      url: 'https://omqktqrtntnn.sealosbja.site',
      reconnectionDelay: 5000,
      reconnectionAttempts: 3,
      timeout: 30000
    },
    development: {
      enableUnifiedAuth: false, // 🚨 生产环境禁用万能验证码
      devVerificationCode: null, // 🚨 生产环境无开发验证码
      skipSmsVerification: false,
      enableAdminAutoDetection: true,
      disableSmsService: false,
      preserveSmsFields: true,
      enableDebugMode: false, // 🚨 必须关闭调试模式
      showDetailedErrors: false // 🚨 隐藏详细错误信息
    },
    business: { ...BASE_BUSINESS_CONFIG },
    security: { ...BASE_SECURITY_CONFIG }
  }
}

// ===== 当前环境设置 =====

/**
 * 根据微信小程序运行环境自动判断当前环境
 *
 * wx.getAccountInfoSync().miniProgram.envVersion 返回值:
 *   'develop'  → 开发者工具 → 映射到 development
 *   'trial'    → 体验版    → 映射到 testing
 *   'release'  → 正式版    → 映射到 production
 *
 * 降级策略: 获取失败时默认 development（最安全）
 */
function detectEnv(): string {
  try {
    const accountInfo = wx.getAccountInfoSync()
    const envVersion = accountInfo.miniProgram.envVersion
    const envMap: Record<string, string> = {
      develop: 'development',
      trial: 'testing',
      release: 'production'
    }
    return envMap[envVersion] || 'development'
  } catch (_err) {
    return 'development'
  }
}

let CURRENT_ENV: string = detectEnv()

// ===== 配置获取函数 =====

/** 获取当前环境的完整配置（无效环境自动降级到development） */
function getConfig(): EnvironmentConfig {
  const config = ENV_CONFIG[CURRENT_ENV]
  if (!config) {
    console.error(` 无效的环境配置: ${CURRENT_ENV}`)
    return ENV_CONFIG.development
  }
  return config
}

/** 获取API服务配置（含fullUrl完整地址） */
function getApiConfig(): ApiConfigResult {
  const config = getConfig()
  return {
    baseUrl: config.api.baseUrl,
    apiPrefix: config.api.apiPrefix,
    fullUrl: `${config.api.baseUrl}${config.api.apiPrefix}`,
    timeout: config.api.timeout,
    retryTimes: config.api.retryTimes,
    retryDelay: config.api.retryDelay
  }
}

/**
 * 获取开发阶段特殊配置
 * ⚠️ 安全提示: 万能验证码123456仅用于开发和测试环境
 */
function getDevelopmentConfig(): DevelopmentConfig {
  const config = getConfig()
  return config.development
}

/** 获取业务模块配置（传入模块名返回单个，不传返回全部） */
function getBusinessConfig(
  businessType?: string
):
  | BusinessConfig
  | LotteryBusinessConfig
  | InventoryBusinessConfig
  | UploadsBusinessConfig
  | PermissionsBusinessConfig {
  const config = getConfig()
  if (businessType) {
    return (config.business as any)[businessType] || {}
  }
  return config.business
}

/** 获取V4数据安全配置 */
function getSecurityConfig(): SecurityConfig {
  const config = getConfig()
  return config.security
}

/** 获取WebSocket服务配置 */
function getWebSocketConfig(): WebSocketConfig {
  const config = getConfig()
  return config.websocket
}

/** 快速获取WebSocket服务地址 */
function getWsUrl(): string {
  const wsConfig = getWebSocketConfig()
  return wsConfig.url
}

/** 检查是否为开发阶段（启用了万能验证码） */
function isDevelopmentPhase(): boolean {
  const devConfig = getDevelopmentConfig()
  return devConfig.enableUnifiedAuth && devConfig.skipSmsVerification
}

/** 获取当前运行环境名称 */
function getCurrentEnv(): string {
  return CURRENT_ENV
}

/** 切换运行环境（⚠️ 仅开发调试使用） */
function setEnv(envName: string): boolean {
  if (ENV_CONFIG[envName]) {
    CURRENT_ENV = envName
    /* config/env 是 Logger 的上游依赖（Logger → config/env），此处使用 console 避免循环引用 */
    console.log(` 环境已切换到: ${envName}`)
    return true
  }
  console.error(` 无效的环境名称: ${envName}`)
  return false
}

/** 快速切换到开发者工具环境 */
function switchToDevTools(): boolean {
  return setEnv('development')
}

/** 快速切换到真机调试环境 */
function switchToMobile(): boolean {
  return setEnv('mobile')
}

/** 检查当前是否为真机调试环境 */
function isMobileDebug(): boolean {
  return CURRENT_ENV === 'mobile'
}

// ===== 导出配置 =====
module.exports = {
  getConfig,
  getCurrentEnv,
  setEnv,
  isDevelopmentPhase,
  getDevelopmentConfig,
  getApiConfig,
  getBusinessConfig,
  getSecurityConfig,
  getWebSocketConfig,
  getWsUrl,
  switchToDevTools,
  switchToMobile,
  isMobileDebug,
  version: '5.2.0',
  lastUpdated: '2026-02-16T00:00:00+08:00'
}
