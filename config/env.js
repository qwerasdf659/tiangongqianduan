// config/env.js - 环境配置管理（基于产品功能结构文档v2.1.3优化）
const ENV = {
  // 🚧 开发环境 - v2.1.3开发阶段配置（完全符合最新产品功能结构文档）
  development: {
    baseUrl: 'http://localhost:3000/api',  // 🔧 恢复3000端口，按用户要求配置
    wsUrl: 'ws://localhost:3000/ws',        // 🔧 修复：与HTTP服务器共享3000端口
    sealosConfig: {
      endpoint: 'https://objectstorageapi.bja.sealos.run',
      bucket: 'tiangong',
      accessKeyId: 'br0za7uc',
      secretAccessKey: 'skxg8mk5gqfhf9xz',
      region: 'bja'
    },
    // 微信小程序配置
    wechat: {
      appId: 'wx0db69ddd264f9b81',
      appSecret: '414c5f5dc5404b4f7a1662dd26b532f9'
    },
    isDev: true,
    needAuth: false,
    
    // 🚧 v2.1.3开发阶段专用配置 - 基于最新产品功能结构文档
    developmentMode: {
      // 📱 v2.1.3 - 手机号码验证功能暂停开发
      skipSmsVerification: true,           // 跳过短信验证功能
      allowMockCode: true,                 // 允许使用模拟验证码
      mockCode: '123456',                  // 默认模拟验证码（任意6位数字都通过）
      acceptAnyCode: true,                 // 接受任意6位数字验证码
      
      // 🔐 管理员二次验证暂停 - v2.1.3要求
      skipAdminSmsVerification: true,      // 跳过管理员短信二次验证
      adminHiddenTrigger: 5,              // 管理员登录触发次数（连续点击5次）
      adminTriggerTimeout: 2000,          // 触发超时时间（2秒内有效）
      
      // 📞 短信相关服务暂停 - v2.1.3开发阶段限制
      disableSmsService: true,            // 禁用短信服务调用
      mockSmsResponse: true,              // 模拟短信发送成功响应
      
      // 🔧 WebSocket连接优化 - 基于用户规则修复
      enableWebSocket: false,             // 🔧 暂时禁用WebSocket连接，避免503错误
      webSocketReconnect: true,           // 启用自动重连
      silentWebSocketErrors: true,        // 静默处理WebSocket错误，避免不必要的错误提示
      webSocketTimeout: 10000,            // WebSocket连接超时10秒
      maxReconnectAttempts: 3,            // 最大重连次数（避免无限重连）
      webSocketHeartbeat: 30000,          // 心跳间隔30秒
      
      // 🗄️ 数据库设计预留 - v2.1.3规范要求
      preserveSmsFields: true,            // 保留短信验证相关字段结构
      autoCreateUser: true,               // 自动创建新用户
      // 🔴 删除违规配置：新用户初始积分应由后端决定，不应在前端配置
      // mockInitialPoints: 1000,         // 已删除：违反项目安全规则
      
      // 🔌 接口预留配置 - 便于后续集成
      reserveProductionApis: true,        // 预留生产环境接口
      debugMode: true,                    // 开启调试模式
      verboseLogging: true,               // 详细日志输出
      
      // 💡 开发建议实现 - v2.1.3优化
      mockResponseDelay: 300,             // 模拟响应延迟（优化到300ms）
      showDevelopmentTips: false,         // 🔧 已关闭开发阶段提示（根据用户要求）
      enableDevelopmentTools: true,       // 启用开发工具
      
      // 📸 v2.1.3拍照上传系统 - 纯人工审核模式
      photoReviewMode: 'manual',          // 纯人工审核模式
      disableOCR: true,                   // 禁用OCR功能
      disableAI: true,                    // 禁用AI自动识别
      manualAmountInput: true,            // 用户手动输入消费金额
      merchantManualReview: true,         // 商家人工审核确认
      
      // 🔴 v2.1.3新增API接口支持 - 基于接口对接规范文档
      supportNewApis: true,               // 支持新增API接口
      enableUploadHistory: true,          // 启用上传历史API
      enableProductStats: true,           // 启用商品统计API
      enableAvatarUpload: true,           // 启用头像上传API
      enablePointsRecordsPagination: true, // 启用积分记录分页API
      
      // 🔴 统一错误处理机制 - 基于接口对接规范文档
      enhancedErrorHandling: true,        // 启用增强错误处理
      showBackendErrorDetails: true,      // 显示后端服务异常详情
      backendErrorTimeout: 5000,          // 后端服务异常提示超时时间
      networkErrorRetry: 3,               // 网络错误重试次数
      
      // 🔴 WebSocket实时推送优化 - 基于后端技术规范文档
      webSocketEventSupport: true,        // 支持WebSocket事件推送
      supportPointsUpdate: true,          // 支持积分更新推送
      supportStockUpdate: true,           // 支持库存更新推送
      supportReviewCompleted: true,       // 支持审核完成推送
      supportLotteryConfigUpdate: true,   // 支持抽奖配置更新推送
      
      // 🔴 数据安全处理 - 基于数据库设计规范文档
      enableDataSafety: true,             // 启用数据安全处理
      strictFieldMapping: true,           // 严格字段映射
      filterUndefinedValues: true,        // 过滤undefined值
      validateApiResponseFormat: true,    // 验证API响应格式
      
      // 🔴 503错误处理优化 - 新增
      handle503Errors: true,              // 启用503错误特殊处理
      show503ErrorDetails: true,          // 显示503错误详细信息
      backend503RetryDelay: 5000,         // 503错误重试延迟5秒
      maxBackendRetries: 2                // 最大后端重试次数
    }
  },
  
  // 测试环境
  testing: {
    baseUrl: 'https://rqchrlqndora.sealosbja.site/api',
    wsUrl: 'wss://rqchrlqndora.sealosbja.site/ws',
    sealosConfig: {
      endpoint: 'https://objectstorageapi.bja.sealos.run',
      bucket: 'tiangong',
      accessKeyId: 'br0za7uc',
      secretAccessKey: 'skxg8mk5gqfhf9xz',
      region: 'bja'
    },
    // 微信小程序配置
    wechat: {
      appId: 'wx0db69ddd264f9b81',
      appSecret: '414c5f5dc5404b4f7a1662dd26b532f9'
    },
    isDev: false,
    needAuth: true,
    
    // 🧪 测试环境配置 - 部分开发阶段功能保留
    developmentMode: {
      skipSmsVerification: false,         // 测试环境启用短信验证
      allowMockCode: false,
      acceptAnyCode: false,
      skipAdminSmsVerification: false,    // 测试环境启用管理员二次验证
      disableSmsService: false,          // 测试环境启用短信服务
      enableWebSocket: false,             // 🔧 临时禁用WebSocket，避免503错误影响登录
      webSocketReconnect: true,
      silentWebSocketErrors: true,        // 🔧 静默WebSocket错误
      debugMode: false,
      verboseLogging: false,
      showDevelopmentTips: false,
      
      // 🔴 测试环境也支持新增API接口
      supportNewApis: true,
      enhancedErrorHandling: true,
      webSocketEventSupport: true,
      enableDataSafety: true,
      strictFieldMapping: true,
      filterUndefinedValues: true,
      validateApiResponseFormat: true
    }
  },
  
  // 🔴 生产环境 - 完整功能
  production: {
    baseUrl: 'https://rqchrlqndora.sealosbja.site/api',
    wsUrl: 'wss://rqchrlqndora.sealosbja.site/ws',
    sealosConfig: {
      endpoint: 'https://objectstorageapi.bja.sealos.run',
      bucket: 'tiangong',
      accessKeyId: 'PRODUCTION_ACCESS_KEY',       // 🚨 生产环境需要替换
      secretAccessKey: 'PRODUCTION_SECRET_KEY',   // 🚨 生产环境需要替换
      region: 'bja'
    },
    // 微信小程序配置
    wechat: {
      appId: 'wx0db69ddd264f9b81',
      appSecret: 'PRODUCTION_APP_SECRET'          // 🚨 生产环境需要替换
    },
    isDev: false,
    needAuth: true,
    
    // 🔮 生产环境配置 - 完整功能
    developmentMode: {
      skipSmsVerification: false,         // 生产环境强制短信验证
      allowMockCode: false,
      acceptAnyCode: false,
      skipAdminSmsVerification: false,    // 生产环境强制管理员二次验证
      disableSmsService: false,          // 生产环境启用完整短信服务
      enableWebSocket: true,              // 生产环境启用WebSocket
      webSocketReconnect: true,
      silentWebSocketErrors: false,       // 生产环境记录WebSocket错误
      debugMode: false,
      verboseLogging: false,
      showDevelopmentTips: false,
      enableProductionSecurity: true,     // 启用生产环境安全机制
      forceHttps: true,                  // 强制HTTPS传输
      enableAuditLog: true,              // 启用审计日志
      
      // 🔴 生产环境完整API支持
      supportNewApis: true,
      enhancedErrorHandling: true,
      webSocketEventSupport: true,
      enableDataSafety: true,
      strictFieldMapping: true,
      filterUndefinedValues: true,
      validateApiResponseFormat: true
    }
  }
}

// 🚨 部署时必须修改此处 - 根据产品功能结构文档要求
let CURRENT_ENV = 'testing'  // 🔧 修复：切换到测试环境，连接线上API服务

module.exports = {
  // 获取当前环境配置
  getConfig: () => {
    const config = ENV[CURRENT_ENV]
    if (!config) {
      console.error(`❌ 环境配置错误: ${CURRENT_ENV}`)
      return ENV.development // 降级到开发环境
    }
    return config
  },
  
  // 获取当前环境名称
  getCurrentEnv: () => {
    return CURRENT_ENV
  },
  
  // 设置环境
  setEnv: (env) => {
    if (ENV[env]) {
      CURRENT_ENV = env
      console.log(`🔧 环境已切换到: ${env}`)
      return true
    }
    console.error(`❌ 无效的环境: ${env}`)
    return false
  },
  
  // 获取所有可用环境
  getAllEnvs: () => Object.keys(ENV),
  
  // 获取当前环境名称
  getCurrentEnv: () => CURRENT_ENV,
  
  // 🚧 检查是否为开发阶段
  isDevelopmentPhase: () => {
    const config = ENV[CURRENT_ENV]
    return config && config.developmentMode && config.developmentMode.skipSmsVerification
  },
  
  // 🔧 获取开发阶段配置
  getDevelopmentConfig: () => {
    const config = ENV[CURRENT_ENV]
    return config ? config.developmentMode : {}
  },
  
  // 🔴 新增：获取API配置支持
  getApiConfig: () => {
    const config = ENV[CURRENT_ENV]
    const devConfig = config ? config.developmentMode : {}
    return {
      supportNewApis: devConfig.supportNewApis || false,
      enhancedErrorHandling: devConfig.enhancedErrorHandling || false,
      webSocketEventSupport: devConfig.webSocketEventSupport || false,
      enableDataSafety: devConfig.enableDataSafety || false,
      strictFieldMapping: devConfig.strictFieldMapping || false,
      filterUndefinedValues: devConfig.filterUndefinedValues || false,
      validateApiResponseFormat: devConfig.validateApiResponseFormat || false
    }
  },
  
  // 🔴 新增：获取WebSocket配置
  getWebSocketConfig: () => {
    const config = ENV[CURRENT_ENV]
    const devConfig = config ? config.developmentMode : {}
    return {
      enableWebSocket: devConfig.enableWebSocket !== false,
      webSocketReconnect: devConfig.webSocketReconnect !== false,
      silentWebSocketErrors: devConfig.silentWebSocketErrors || false,
      webSocketTimeout: devConfig.webSocketTimeout || 10000,
      maxReconnectAttempts: devConfig.maxReconnectAttempts || 3,
      webSocketHeartbeat: devConfig.webSocketHeartbeat || 30000,
      webSocketEventSupport: devConfig.webSocketEventSupport || false
    }
  },
  
  // 📝 部署检查清单
  getDeploymentChecklist: () => {
    return {
      development: {
        required: ['baseUrl', 'isDev', 'skipSmsVerification'],
        optional: ['mockCode', 'debugMode']
      },
      testing: {
        required: ['baseUrl', 'wsUrl', 'needAuth'],
        warnings: ['skipSmsVerification应为false']
      },
      production: {
        required: ['baseUrl', 'wsUrl', 'needAuth'],
        critical: ['需要更新生产环境密钥', '需要启用HTTPS', '需要配置监控']
      }
    }
  }
} 