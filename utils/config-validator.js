// utils/config-validator.js - 配置验证工具
const envConfig = require('../config/env.js')

/**
 * 🔧 配置验证工具 - 确保环境变量正确加载
 * 
 * 基于用户规则：
 * - 确认代码修改后是否需要重启服务
 * - 验证环境变量是否正确加载配置
 * - 检查项目是否可以正常运行
 */
class ConfigValidator {
  constructor() {
    this.validationResults = []
    this.criticalErrors = []
    this.warnings = []
  }

  /**
   * 🔴 运行完整配置验证
   */
  validateAllConfigs() {
    console.log('🔧 开始验证项目配置...')
    
    this.validationResults = []
    this.criticalErrors = []
    this.warnings = []
    
    // 1. 验证环境配置
    this.validateEnvironmentConfig()
    
    // 2. 验证网络配置
    this.validateNetworkConfig()
    
    // 3. 验证微信小程序配置
    this.validateWechatConfig()
    
    // 4. 验证开发模式配置
    this.validateDevelopmentMode()
    
    // 5. 生成验证报告
    this.generateValidationReport()
    
    return {
      isValid: this.criticalErrors.length === 0,
      criticalErrors: this.criticalErrors,
      warnings: this.warnings,
      results: this.validationResults
    }
  }

  /**
   * 验证环境配置
   */
  validateEnvironmentConfig() {
    try {
      const config = envConfig.getConfig()
      
      if (!config) {
        this.addCriticalError('环境配置', '无法获取环境配置')
        return
      }
      
      this.addResult('PASS', '环境配置', `当前环境：${envConfig.getCurrentEnv()}`)
      
      // 验证必要配置项
      const requiredKeys = ['baseUrl', 'wsUrl', 'isDev', 'needAuth']
      for (const key of requiredKeys) {
        if (config[key] === undefined) {
          this.addCriticalError('环境配置', `缺少必要配置项：${key}`)
        } else {
          this.addResult('PASS', '环境配置', `${key}: ${config[key]}`)
        }
      }
      
    } catch (error) {
      this.addCriticalError('环境配置', `配置加载失败：${error.message}`)
    }
  }

  /**
   * 验证网络配置
   */
  validateNetworkConfig() {
    try {
      const config = envConfig.getConfig()
      
      // 验证API地址
      if (!config.baseUrl) {
        this.addCriticalError('网络配置', 'API地址未配置')
      } else {
        const isLocalDev = config.baseUrl.includes('localhost')
        const isHttps = config.baseUrl.startsWith('https://')
        
        if (isLocalDev && !config.isDev) {
          this.addWarning('网络配置', '生产环境使用本地API地址')
        }
        
        if (!isLocalDev && !isHttps) {
          this.addWarning('网络配置', '远程API地址建议使用HTTPS')
        }
        
        this.addResult('PASS', '网络配置', `API地址：${config.baseUrl}`)
      }
      
      // 验证WebSocket地址
      if (!config.wsUrl) {
        this.addWarning('网络配置', 'WebSocket地址未配置')
      } else {
        const isLocalDev = config.wsUrl.includes('localhost')
        const isWss = config.wsUrl.startsWith('wss://')
        
        if (isLocalDev && !config.isDev) {
          this.addWarning('网络配置', '生产环境使用本地WebSocket地址')
        }
        
        if (!isLocalDev && !isWss) {
          this.addWarning('网络配置', '远程WebSocket地址建议使用WSS')
        }
        
        this.addResult('PASS', '网络配置', `WebSocket地址：${config.wsUrl}`)
      }
      
    } catch (error) {
      this.addCriticalError('网络配置', `网络配置验证失败：${error.message}`)
    }
  }

  /**
   * 验证微信小程序配置
   */
  validateWechatConfig() {
    try {
      const config = envConfig.getConfig()
      
      if (!config.wechat) {
        this.addCriticalError('微信配置', '微信小程序配置缺失')
        return
      }
      
      const { appId, appSecret } = config.wechat
      
      if (!appId) {
        this.addCriticalError('微信配置', '微信小程序AppID未配置')
      } else {
        this.addResult('PASS', '微信配置', `AppID: ${appId}`)
      }
      
      if (!appSecret) {
        this.addCriticalError('微信配置', '微信小程序AppSecret未配置')
      } else {
        const isProductionSecret = appSecret !== 'PRODUCTION_APP_SECRET'
        if (isProductionSecret) {
          this.addResult('PASS', '微信配置', 'AppSecret已配置')
        } else {
          this.addWarning('微信配置', '使用占位符AppSecret，需要配置真实值')
        }
      }
      
    } catch (error) {
      this.addCriticalError('微信配置', `微信配置验证失败：${error.message}`)
    }
  }

  /**
   * 验证开发模式配置
   */
  validateDevelopmentMode() {
    try {
      const config = envConfig.getConfig()
      
      if (!config.developmentMode) {
        this.addWarning('开发模式', '开发模式配置缺失')
        return
      }
      
      const devMode = config.developmentMode
      
      // 验证WebSocket配置
      if (devMode.enableWebSocket === false) {
        this.addResult('INFO', '开发模式', 'WebSocket已禁用（避免503错误）')
      } else {
        this.addResult('INFO', '开发模式', 'WebSocket已启用')
      }
      
      // 验证错误处理配置
      if (devMode.enhancedErrorHandling) {
        this.addResult('PASS', '开发模式', '增强错误处理已启用')
      }
      
      // 验证503错误处理
      if (devMode.handle503Errors) {
        this.addResult('PASS', '开发模式', '503错误特殊处理已启用')
      }
      
    } catch (error) {
      this.addCriticalError('开发模式', `开发模式配置验证失败：${error.message}`)
    }
  }

  /**
   * 添加验证结果
   */
  addResult(status, category, message) {
    this.validationResults.push({
      status,
      category,
      message,
      timestamp: new Date().toLocaleString()
    })
  }

  /**
   * 添加关键错误
   */
  addCriticalError(category, message) {
    this.criticalErrors.push({ category, message })
    this.addResult('FAIL', category, `❌ ${message}`)
  }

  /**
   * 添加警告
   */
  addWarning(category, message) {
    this.warnings.push({ category, message })
    this.addResult('WARN', category, `⚠️ ${message}`)
  }

  /**
   * 生成验证报告
   */
  generateValidationReport() {
    const passCount = this.validationResults.filter(r => r.status === 'PASS').length
    const failCount = this.validationResults.filter(r => r.status === 'FAIL').length
    const warnCount = this.validationResults.filter(r => r.status === 'WARN').length
    const infoCount = this.validationResults.filter(r => r.status === 'INFO').length

    console.log('🔧 配置验证报告:', {
      summary: {
        总计: this.validationResults.length,
        正常: passCount,
        错误: failCount,
        警告: warnCount,
        信息: infoCount
      },
      criticalErrors: this.criticalErrors,
      warnings: this.warnings,
      needRestart: this.determineIfRestartNeeded(),
      timestamp: new Date().toISOString()
    })

    // 输出详细结果
    console.log('📋 详细验证结果:')
    this.validationResults.forEach((result, index) => {
      const statusIcon = this.getStatusIcon(result.status)
      console.log(`${statusIcon} ${result.category}: ${result.message}`)
    })

    // 输出重启建议
    if (this.determineIfRestartNeeded()) {
      console.log('\n🔄 建议重启服务：')
      console.log('• 前端：刷新微信开发者工具')
      console.log('• 后端：如果修改了后端配置，需要重启后端服务')
    }
  }

  /**
   * 获取状态图标
   */
  getStatusIcon(status) {
    const icons = {
      'PASS': '✅',
      'FAIL': '❌',
      'WARN': '⚠️',
      'INFO': 'ℹ️'
    }
    return icons[status] || '❓'
  }

  /**
   * 判断是否需要重启服务
   */
  determineIfRestartNeeded() {
    // 如果有关键错误，建议重启
    if (this.criticalErrors.length > 0) {
      return true
    }
    
    // 如果修改了环境配置，建议重启
    const config = envConfig.getConfig()
    if (config && config.isDev) {
      return false // 开发环境通常不需要重启
    }
    
    return false
  }

  /**
   * 检查项目是否可以正常运行
   */
  checkProjectHealth() {
    const validation = this.validateAllConfigs()
    
    if (!validation.isValid) {
      console.error('❌ 项目配置存在问题，可能无法正常运行')
      console.error('关键错误:', validation.criticalErrors)
      return false
    }
    
    if (validation.warnings.length > 0) {
      console.warn('⚠️ 项目配置存在警告，建议检查')
      console.warn('警告信息:', validation.warnings)
    }
    
    console.log('✅ 项目配置验证通过，可以正常运行')
    return true
  }
}

// 导出验证工具
module.exports = ConfigValidator 