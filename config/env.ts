/**
 * 环境配置管理v4.0 - V4统一引擎架构
 * 支持4种环境: development(开发)、mobile(真机)、testing(测试)、production(生产)
 *
 * @file 天工餐厅积分系统 - 环境配置
 * @version 5.0.0
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

/** WebSocket服务配置 */
interface WebSocketConfig {
  url: string
  reconnectInterval: number
  maxReconnectAttempts: number
  heartbeatInterval: number
  enableHeartbeat: boolean
}

/** 开发阶段配置 */
interface DevelopmentConfig {
  enableUnifiedAuth: boolean
  devVerificationCode: string | null
  skipSmsVerification: boolean
  enableAdminAutoDetection: boolean
  adminFieldMapping: string
  disableSmsService: boolean
  preserveSmsFields: boolean
  enableDebugMode: boolean
  showDetailedErrors: boolean
}

/** 抽奖业务配置 */
interface LotteryBusinessConfig {
  enabled: boolean
  engineVersion: string
  defaultStrategy: string
  supportMultipleDraw: boolean
  enableGuarantee: boolean
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
  enableFieldMapping: boolean
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

// ===== 环境配置数据 =====

const ENV_CONFIG: AllEnvironmentConfig = {
  // 开发环境配置（微信开发者工具）
  development: {
    api: {
      baseUrl: 'http://localhost:3000',
      apiPrefix: '/api/v4',
      timeout: 30000,
      retryTimes: 3,
      retryDelay: 2000,
      healthCheckTimeout: 8000,
      enableNetworkDiagnostics: true,
      enableAutoRetry: true
    },
    websocket: {
      url: 'ws://localhost:3000/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    },
    development: {
      enableUnifiedAuth: true,
      devVerificationCode: '123456', // 后端控制的开发验证码，非mock数据
      skipSmsVerification: true,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: true,
      preserveSmsFields: true,
      enableDebugMode: true,
      showDetailedErrors: true
    },
    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        // 单抽消耗由后端API /lottery/campaigns/:code/config 的 per_draw_cost（折扣后）/ base_cost（折扣前）字段决定
        supportMultipleDraw: true,
        enableGuarantee: true
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
    },
    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  },

  // 真机调试环境
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
      url: 'ws://192.168.43.12:3000/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    },
    development: {
      enableUnifiedAuth: true,
      devVerificationCode: '123456',
      skipSmsVerification: true,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: true,
      preserveSmsFields: true,
      enableDebugMode: true,
      showDetailedErrors: true
    },
    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        supportMultipleDraw: true,
        enableGuarantee: true
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
        maxFileSize: 10485760,
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },
    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  },

  // 测试环境 - V4统一引擎架构
  testing: {
    api: {
      baseUrl: 'https://omqktqrtntnn.sealosbja.site',
      apiPrefix: '/api/v4',
      timeout: 15000,
      retryTimes: 3,
      retryDelay: 2000
    },
    websocket: {
      url: 'wss://omqktqrtntnn.sealosbja.site/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    },
    development: {
      enableUnifiedAuth: true,
      devVerificationCode: '123456',
      skipSmsVerification: true,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: false,
      preserveSmsFields: true,
      enableDebugMode: false,
      showDetailedErrors: true
    },
    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        supportMultipleDraw: true,
        enableGuarantee: true
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
        maxFileSize: 10485760,
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },
    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  },

  // 生产环境 - V4统一引擎架构（安全严格设置）
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
      url: 'wss://omqktqrtntnn.sealosbja.site/ws',
      reconnectInterval: 5000,
      maxReconnectAttempts: 3,
      heartbeatInterval: 60000,
      enableHeartbeat: true
    },
    development: {
      enableUnifiedAuth: false, // 🚨 生产环境禁用万能验证码
      devVerificationCode: null, // 🚨 生产环境无开发验证码
      skipSmsVerification: false,
      enableAdminAutoDetection: true,
      adminFieldMapping: 'is_admin',
      disableSmsService: false,
      preserveSmsFields: true,
      enableDebugMode: false, // 🚨 必须关闭调试模式
      showDetailedErrors: false // 🚨 隐藏详细错误信息
    },
    business: {
      lottery: {
        enabled: true,
        engineVersion: '4.0.0',
        defaultStrategy: 'basic_guarantee',
        supportMultipleDraw: true,
        enableGuarantee: true
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
        maxFileSize: 10485760,
        allowedTypes: ['jpg', 'jpeg', 'png', 'gif']
      },
      permissions: {
        enabled: true,
        enableRoleBasedAccess: true,
        supportBatchCheck: true
      }
    },
    security: {
      enableFieldMapping: true,
      enableDataValidation: true,
      enableSafetyChecks: true,
      apiVersion: 'v4.0'
    }
  }
}

// ===== 当前环境设置 =====

/** 当前环境: development | mobile | testing | production */
let CURRENT_ENV: string = 'testing'

// ===== 配置获取函数 =====

/** 获取当前环境的完整配置（无效环境自动降级到development） */
function getConfig(): EnvironmentConfig {
  const config = ENV_CONFIG[CURRENT_ENV]
  if (!config) {
    console.error(`❌ 无效的环境配置: ${CURRENT_ENV}`)
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

/** 获取WebSocket服务配置（无配置时返回默认值） */
function getWebSocketConfig(): WebSocketConfig {
  const config = getConfig()
  return (
    config.websocket || {
      url: 'ws://localhost:3000/ws',
      reconnectInterval: 3000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      enableHeartbeat: true
    }
  )
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
    console.log(`🔧 环境已切换到: ${envName}`)
    return true
  }
  console.error(`❌ 无效的环境名称: ${envName}`)
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
  version: '5.0.0',
  lastUpdated: '2026-02-10T00:00:00+08:00'
}

export {}
