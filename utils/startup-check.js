// utils/startup-check.js - 启动检查脚本
const ConfigValidator = require('./config-validator.js')
const NetworkDiagnostic = require('./network-diagnostic.js')

/**
 * 🚀 启动检查工具 - 应用启动时自动验证
 * 
 * 基于用户规则：
 * - 确保项目可以正常运行
 * - 验证环境配置是否正确
 * - 检查是否需要重启服务
 */
class StartupCheck {
  constructor() {
    this.configValidator = new ConfigValidator()
    this.networkDiagnostic = new NetworkDiagnostic()
    this.startupResults = {
      configValid: false,
      networkHealthy: false,
      readyToRun: false,
      issues: [],
      recommendations: []
    }
  }

  /**
   * 🔴 运行完整启动检查
   */
  async runStartupCheck() {
    console.log('🚀 开始启动检查...')
    
    try {
      // 1. 验证项目配置
      await this.checkProjectConfiguration()
      
      // 2. 检查网络健康状态 (仅在需要时)
      if (this.shouldCheckNetwork()) {
        await this.checkNetworkHealth()
      }
      
      // 3. 生成启动报告
      this.generateStartupReport()
      
      // 4. 提供启动建议
      this.provideStartupRecommendations()
      
      return this.startupResults
      
    } catch (error) {
      console.error('❌ 启动检查失败:', error)
      this.startupResults.issues.push({
        type: 'STARTUP_ERROR',
        message: `启动检查失败: ${error.message}`
      })
      return this.startupResults
    }
  }

  /**
   * 检查项目配置
   */
  async checkProjectConfiguration() {
    console.log('🔧 检查项目配置...')
    
    try {
      const isHealthy = this.configValidator.checkProjectHealth()
      this.startupResults.configValid = isHealthy
      
      if (!isHealthy) {
        this.startupResults.issues.push({
          type: 'CONFIG_ERROR',
          message: '项目配置存在问题'
        })
        
        this.startupResults.recommendations.push({
          type: 'CONFIG_FIX',
          message: '请检查环境配置文件，确保所有必要配置项都已正确设置'
        })
      }
      
    } catch (error) {
      console.error('❌ 配置检查失败:', error)
      this.startupResults.issues.push({
        type: 'CONFIG_CHECK_ERROR',
        message: `配置检查失败: ${error.message}`
      })
    }
  }

  /**
   * 检查网络健康状态
   */
  async checkNetworkHealth() {
    console.log('🌐 检查网络健康状态...')
    
    try {
      // 这里只做简单的网络检查，不进行完整诊断
      // 完整诊断需要用户主动触发
      await this.simpleNetworkCheck()
      
    } catch (error) {
      console.error('❌ 网络检查失败:', error)
      this.startupResults.issues.push({
        type: 'NETWORK_CHECK_ERROR',
        message: `网络检查失败: ${error.message}`
      })
    }
  }

  /**
   * 简单网络检查
   */
  async simpleNetworkCheck() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          if (res.networkType === 'none') {
            this.startupResults.networkHealthy = false
            this.startupResults.issues.push({
              type: 'NETWORK_ERROR',
              message: '设备未连接到网络'
            })
            this.startupResults.recommendations.push({
              type: 'NETWORK_FIX',
              message: '请检查网络连接后重试'
            })
          } else {
            this.startupResults.networkHealthy = true
            console.log(`✅ 网络连接正常: ${res.networkType}`)
          }
          resolve()
        },
        fail: () => {
          this.startupResults.networkHealthy = false
          this.startupResults.issues.push({
            type: 'NETWORK_ERROR',
            message: '无法获取网络状态'
          })
          resolve()
        }
      })
    })
  }

  /**
   * 判断是否需要检查网络
   */
  shouldCheckNetwork() {
    // 开发环境可以跳过网络检查
    try {
      const app = getApp()
      if (app && app.globalData && app.globalData.isDev) {
        console.log('🔧 开发环境跳过网络检查')
        return false
      }
    } catch (error) {
      // 如果无法获取app实例，默认进行网络检查
      console.log('⚠️ 无法获取app实例，进行网络检查')
    }
    
    return true
  }

  /**
   * 生成启动报告
   */
  generateStartupReport() {
    const issueCount = this.startupResults.issues.length
    const recommendationCount = this.startupResults.recommendations.length
    
    // 判断是否准备就绪
    this.startupResults.readyToRun = this.startupResults.configValid && 
                                     (this.startupResults.networkHealthy || !this.shouldCheckNetwork()) &&
                                     issueCount === 0
    
    console.log('🚀 启动检查报告:', {
      配置状态: this.startupResults.configValid ? '✅ 正常' : '❌ 异常',
      网络状态: this.startupResults.networkHealthy ? '✅ 正常' : '❌ 异常',
      准备状态: this.startupResults.readyToRun ? '✅ 就绪' : '❌ 未就绪',
      问题数量: issueCount,
      建议数量: recommendationCount,
      timestamp: new Date().toISOString()
    })
    
    // 输出详细问题
    if (issueCount > 0) {
      console.log('🚨 发现问题:')
      this.startupResults.issues.forEach((issue, index) => {
        console.log(`${index + 1}. [${issue.type}] ${issue.message}`)
      })
    }
    
    // 输出建议
    if (recommendationCount > 0) {
      console.log('💡 建议:')
      this.startupResults.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. [${rec.type}] ${rec.message}`)
      })
    }
  }

  /**
   * 提供启动建议
   */
  provideStartupRecommendations() {
    if (this.startupResults.readyToRun) {
      console.log('🎉 应用启动检查完成，准备就绪！')
      return
    }
    
    console.log('⚠️ 应用启动检查发现问题，建议处理后再继续')
    
    // 根据问题类型提供具体建议
    const hasConfigIssues = this.startupResults.issues.some(issue => issue.type.includes('CONFIG'))
    const hasNetworkIssues = this.startupResults.issues.some(issue => issue.type.includes('NETWORK'))
    
    if (hasConfigIssues) {
      console.log('🔧 配置问题处理建议:')
      console.log('• 检查 config/env.js 配置文件')
      console.log('• 确认当前环境设置正确')
      console.log('• 验证API地址和WebSocket地址')
      console.log('• 检查微信小程序配置')
    }
    
    if (hasNetworkIssues) {
      console.log('🌐 网络问题处理建议:')
      console.log('• 检查设备网络连接')
      console.log('• 尝试切换网络环境')
      console.log('• 如果是503错误，联系后端程序员')
    }
  }

  /**
   * 静态方法：快速启动检查
   */
  static async quickCheck() {
    const checker = new StartupCheck()
    return await checker.runStartupCheck()
  }

  /**
   * 静态方法：显示503错误帮助
   */
  static show503Help() {
    NetworkDiagnostic.show503ErrorHelp()
  }

  /**
   * 静态方法：显示WebSocket错误帮助
   */
  static showWebSocketHelp() {
    NetworkDiagnostic.showWebSocketErrorHelp()
  }
}

// 导出启动检查工具
module.exports = StartupCheck 