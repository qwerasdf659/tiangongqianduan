// config/env.js - 环境配置管理
const ENV = {
  // 开发环境
  development: {
    baseUrl: 'https://your-backend-api.com',
    wsUrl: 'wss://your-websocket-server.com',
    sealosConfig: {
      endpoint: 'https://your-sealos-endpoint.com',
      bucket: 'restaurant-points-system'
    },
    isDev: true,
    needAuth: false
  },
  
  // 测试环境
  testing: {
    baseUrl: 'https://test-backend-api.com',
    wsUrl: 'wss://test-websocket-server.com',
    sealosConfig: {
      endpoint: 'https://test-sealos-endpoint.com',
      bucket: 'restaurant-points-system-test'
    },
    isDev: false,
    needAuth: true
  },
  
  // 生产环境
  production: {
    baseUrl: 'https://prod-backend-api.com',
    wsUrl: 'wss://prod-websocket-server.com',
    sealosConfig: {
      endpoint: 'https://prod-sealos-endpoint.com',
      bucket: 'restaurant-points-system-prod'
    },
    isDev: false,
    needAuth: true
  }
}

// 当前环境 - 根据需要修改
const CURRENT_ENV = 'development'

module.exports = {
  getConfig: () => ENV[CURRENT_ENV],
  setEnv: (env) => {
    if (ENV[env]) {
      CURRENT_ENV = env
      return true
    }
    return false
  },
  getAllEnvs: () => Object.keys(ENV)
} 