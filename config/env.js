// config/env.js - 环境配置管理
const ENV = {
  // 开发环境
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
    needAuth: false
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
    needAuth: true
  },
  
  // 生产环境
  production: {
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
    needAuth: true
  }
}

// 🔴 根据部署环境自动选择配置
// 开发环境: development
// 生产环境: production
let CURRENT_ENV = 'development'  

module.exports = {
  getConfig: () => ENV[CURRENT_ENV],
  setEnv: (env) => {
    if (ENV[env]) {
      CURRENT_ENV = env
      return true
    }
    return false
  },
  getAllEnvs: () => Object.keys(ENV),
  getCurrentEnv: () => CURRENT_ENV
} 