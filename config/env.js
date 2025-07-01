// config/env.js - 环境配置管理
const ENV = {
  // 🚧 开发环境 - 开发阶段配置（基于最新产品功能结构文档）
  development: {
    baseUrl: 'http://localhost:3000/api',
    wsUrl: 'ws://localhost:8080',
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
    
    // 🚧 开发阶段专用配置 - 基于产品功能结构文档v2.1.1
    developmentMode: {
      // 📱 手机号码验证功能暂停开发
      skipSmsVerification: true,           // 跳过短信验证功能
      allowMockCode: true,                 // 允许使用模拟验证码
      mockCode: '123456',                  // 默认模拟验证码
      acceptAnyCode: true,                 // 接受任意6位数字验证码
      
      // 🔐 管理员二次验证暂停
      skipAdminSmsVerification: true,      // 跳过管理员短信二次验证
      adminHiddenTrigger: 5,              // 管理员登录触发次数
      adminTriggerTimeout: 2000,          // 触发超时时间（毫秒）
      
      // 📞 短信相关服务暂停
      disableSmsService: true,            // 禁用短信服务调用
      mockSmsResponse: true,              // 模拟短信发送成功响应
      
      // 🗄️ 数据库设计预留
      preserveSmsFields: true,            // 保留短信验证相关字段
      mockInitialPoints: 1000,            // 新用户初始积分
      autoCreateUser: true,               // 自动创建新用户
      
      // 🔌 接口预留配置
      reserveProductionApis: true,        // 预留生产环境接口
      debugMode: true,                    // 开启调试模式
      verboseLogging: true,               // 详细日志输出
      
      // 💡 开发建议实现
      mockResponseDelay: 1000,            // 模拟响应延迟（毫秒）
      showDevelopmentTips: true,          // 显示开发阶段提示
      enableDevelopmentTools: true        // 启用开发工具
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
      debugMode: false,
      verboseLogging: false,
      showDevelopmentTips: false
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
      debugMode: false,
      verboseLogging: false,
      showDevelopmentTips: false,
      enableProductionSecurity: true,     // 启用生产环境安全机制
      forceHttps: true,                  // 强制HTTPS传输
      enableAuditLog: true               // 启用审计日志
    }
  }
}

// 🚨 部署时必须修改此处 - 根据产品功能结构文档要求
let CURRENT_ENV = 'development'  // 🚧 开发阶段默认

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
        critical: ['accessKeyId不能为默认值', 'appSecret不能为默认值', 'skipSmsVerification必须为false']
      }
    }
  }
} 