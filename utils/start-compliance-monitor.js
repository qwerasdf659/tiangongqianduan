// utils/start-compliance-monitor.js - AI合规监督器启动脚本
// 🚀 启动AI合规监督自动运行程序的便捷脚本

const { startAICompliance, getComplianceStatus, stopAICompliance } = require('./ai-compliance-monitor')
const { ComplianceConfig, validateConfig, getEnabledRules } = require('./compliance-config')

/**
 * AI合规监督器启动器
 * 提供交互式启动、配置和管理功能
 */
class ComplianceMonitorStarter {
  constructor() {
    this.isRunning = false
    this.monitor = null
    this.startTime = null
  }

  /**
   * 🚀 主启动方法
   * @param {object} options - 启动选项
   */
  async start(options = {}) {
    console.log('🔍 AI合规监督器启动器')
    console.log('='.repeat(50))
    
    // 显示启动横幅
    this.showBanner()
    
    // 验证配置
    const configValidation = this.validateConfiguration()
    if (!configValidation.valid) {
      console.error('❌ 配置验证失败，无法启动监督器')
      configValidation.issues.forEach(issue => console.error(`  - ${issue}`))
      return false
    }
    
    // 显示配置摘要
    this.showConfigurationSummary()
    
    // 启动选项处理
    if (options.auto) {
      return this.autoStart(options)
    } else {
      return this.interactiveStart()
    }
  }

  /**
   * 🎨 显示启动横幅
   */
  showBanner() {
    console.log('╔════════════════════════════════════════════════╗')
    console.log('║         🤖 AI合规监督器 v1.0                  ║')
    console.log('║    实时监控AI遵守全局规则和项目规则            ║')
    console.log('║                                                ║')
    console.log('║ 功能特性:                                      ║')
    console.log('║ • PowerShell语法检查                           ║')
    console.log('║ • 用户全局规则监督                            ║')
    console.log('║ • 安全标准合规                                ║')
    console.log('║ • 问题防范机制                                ║')
    console.log('║ • 实时报告和分析                              ║')
    console.log('╚════════════════════════════════════════════════╝')
    console.log('')
  }

  /**
   * 🔧 验证配置
   */
  validateConfiguration() {
    console.log('🔧 验证配置文件...')
    
    try {
      const validation = validateConfig()
      
      if (validation.valid) {
        console.log('✅ 配置验证通过')
        
        if (validation.warnings.length > 0) {
          console.log('⚠️ 配置警告:')
          validation.warnings.forEach(warning => console.log(`  - ${warning}`))
        }
      } else {
        console.log('❌ 配置验证失败')
      }
      
      return validation
    } catch (error) {
      console.error('❌ 配置验证过程中出现错误:', error.message)
      return { valid: false, issues: [error.message], warnings: [] }
    }
  }

  /**
   * 📋 显示配置摘要
   */
  showConfigurationSummary() {
    const validation = validateConfig()
    const enabledRules = getEnabledRules()
    
    console.log('📋 配置摘要')
    console.log('-'.repeat(30))
    console.log(`规则类别总数: ${validation.summary.totalCategories}`)
    console.log(`启用规则数量: ${validation.summary.totalRules}`)
    console.log(`规则权重总和: ${validation.summary.totalWeight}`)
    console.log('')
    
    console.log('🔍 启用的规则类别:')
    Object.entries(ComplianceConfig).forEach(([category, config]) => {
      if (config.enabled && config.rules) {
        const categoryRules = Object.values(config.rules).filter(rule => rule.enabled)
        console.log(`  • ${category}: ${categoryRules.length}个规则 (权重: ${config.weight || 0})`)
      }
    })
    console.log('')
  }

  /**
   * 🤖 自动启动（无交互）
   * @param {object} options - 启动选项
   */
  autoStart(options) {
    console.log('🤖 自动启动AI合规监督器...')
    
    try {
      this.monitor = startAICompliance()
      this.isRunning = true
      this.startTime = Date.now()
      
      console.log('✅ AI合规监督器已自动启动')
      console.log(`📋 会话ID: ${this.monitor.sessionId}`)
      console.log('🔍 监督器正在后台运行，实时监控AI行为合规性')
      
      // 设置自动停止（如果指定）
      if (options.duration) {
        setTimeout(() => {
          console.log(`⏰ 达到指定运行时间 ${options.duration}ms，自动停止监督器`)
          this.stop()
        }, options.duration)
      }
      
      return true
    } catch (error) {
      console.error('❌ 自动启动失败:', error.message)
      return false
    }
  }

  /**
   * 💬 交互式启动
   */
  async interactiveStart() {
    console.log('💬 交互式启动模式')
    console.log('')
    
    // 显示启动菜单
    this.showStartupMenu()
    
    // 模拟用户选择（实际使用中需要readline）
    console.log('🚀 自动选择: 立即启动监督器')
    
    try {
      this.monitor = startAICompliance()
      this.isRunning = true
      this.startTime = Date.now()
      
      console.log('✅ AI合规监督器已启动')
      console.log(`📋 会话ID: ${this.monitor.sessionId}`)
      console.log('')
      
      // 显示管理菜单
      this.showManagementMenu()
      
      return true
    } catch (error) {
      console.error('❌ 交互式启动失败:', error.message)
      return false
    }
  }

  /**
   * 📋 显示启动菜单
   */
  showStartupMenu() {
    console.log('📋 请选择启动选项:')
    console.log('1. 立即启动监督器（推荐）')
    console.log('2. 自定义配置后启动')
    console.log('3. 查看详细配置')
    console.log('4. 测试模式启动')
    console.log('5. 退出')
    console.log('')
  }

  /**
   * 🎛️ 显示管理菜单
   */
  showManagementMenu() {
    console.log('🎛️ 监督器管理选项:')
    console.log('')
    console.log('可用命令:')
    console.log('  • status    - 查看当前状态')
    console.log('  • report    - 生成即时报告')
    console.log('  • rules     - 查看规则状态')
    console.log('  • stop      - 停止监督器')
    console.log('  • restart   - 重启监督器')
    console.log('  • config    - 修改配置')
    console.log('')
    console.log('📝 使用示例:')
    console.log('  const { getComplianceStatus } = require("./ai-compliance-monitor")')
    console.log('  console.log(getComplianceStatus())')
    console.log('')
  }

  /**
   * 📊 获取状态报告
   */
  getStatus() {
    if (!this.isRunning || !this.monitor) {
      return {
        status: 'inactive',
        message: 'AI合规监督器未运行',
        uptime: 0
      }
    }
    
    const status = getComplianceStatus()
    const uptime = Date.now() - this.startTime
    
    return {
      ...status,
      uptime,
      uptimeFormatted: this.formatUptime(uptime),
      performance: this.getPerformanceMetrics()
    }
  }

  /**
   * 📈 获取性能指标
   */
  getPerformanceMetrics() {
    if (!this.monitor) return null
    
    const counters = this.monitor.counters
    const uptime = Date.now() - this.startTime
    const uptimeMinutes = uptime / 60000
    
    return {
      actionsPerMinute: uptimeMinutes > 0 ? (counters.totalToolCalls / uptimeMinutes).toFixed(2) : 0,
      violationRate: counters.totalToolCalls > 0 ? ((counters.ruleViolations / counters.totalToolCalls) * 100).toFixed(1) : 0,
      avgResponseTime: 'N/A', // 需要实际测量
      healthScore: this.calculateHealthScore(counters)
    }
  }

  /**
   * 🏥 计算健康分数
   */
  calculateHealthScore(counters) {
    let score = 100
    
    // 违规率扣分
    const violationRate = counters.totalToolCalls > 0 ? 
      (counters.ruleViolations / counters.totalToolCalls) : 0
    score -= violationRate * 50
    
    // 严重错误扣分
    score -= counters.criticalErrors * 10
    
    // 警告扣分
    score -= counters.warnings * 2
    
    return Math.max(0, Math.min(100, score)).toFixed(1)
  }

  /**
   * ⏰ 格式化运行时间
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}小时${minutes % 60}分钟`
    } else if (minutes > 0) {
      return `${minutes}分钟${seconds % 60}秒`
    } else {
      return `${seconds}秒`
    }
  }

  /**
   * 📊 生成即时报告
   */
  generateInstantReport() {
    if (!this.isRunning || !this.monitor) {
      console.log('❌ 监督器未运行，无法生成报告')
      return null
    }
    
    console.log('📊 AI合规监督即时报告')
    console.log('='.repeat(40))
    
    const status = this.getStatus()
    const counters = this.monitor.counters
    
    console.log(`🕐 运行时间: ${status.uptimeFormatted}`)
    console.log(`📋 会话ID: ${status.sessionId}`)
    console.log('')
    
    console.log('📈 统计数据:')
    console.log(`  总行动数: ${counters.totalToolCalls}`)
    console.log(`  违规次数: ${counters.ruleViolations}`)
    console.log(`  警告次数: ${counters.warnings}`)
    console.log(`  严重错误: ${counters.criticalErrors}`)
    console.log(`  自动修复: ${counters.autoFixes}`)
    console.log('')
    
    console.log('🎯 性能指标:')
    const perf = status.performance
    console.log(`  平均行动频率: ${perf.actionsPerMinute}/分钟`)
    console.log(`  违规率: ${perf.violationRate}%`)
    console.log(`  健康分数: ${perf.healthScore}/100`)
    console.log('')
    
    // 最近违规
    if (this.monitor.violationHistory.length > 0) {
      console.log('🚨 最近违规 (最多5条):')
      this.monitor.violationHistory.slice(-5).forEach((violation, index) => {
        console.log(`  ${index + 1}. ${violation.actionType}: ${violation.violations.length}个违规`)
      })
    } else {
      console.log('✅ 当前会话无违规记录')
    }
    
    return status
  }

  /**
   * 🔄 重启监督器
   */
  restart() {
    console.log('🔄 重启AI合规监督器...')
    
    if (this.isRunning) {
      this.stop()
    }
    
    setTimeout(() => {
      this.autoStart({ auto: true })
    }, 1000)
  }

  /**
   * 🛑 停止监督器
   */
  stop() {
    if (!this.isRunning || !this.monitor) {
      console.log('⚠️ 监督器未运行')
      return null
    }
    
    console.log('🛑 停止AI合规监督器...')
    
    const finalReport = stopAICompliance()
    this.isRunning = false
    this.monitor = null
    this.startTime = null
    
    console.log('✅ AI合规监督器已停止')
    
    return finalReport
  }

  /**
   * 🧪 测试模式启动
   */
  testMode() {
    console.log('🧪 测试模式启动')
    console.log('该模式将运行1分钟并生成测试报告')
    
    const success = this.autoStart({ 
      auto: true, 
      duration: 60000 // 1分钟
    })
    
    if (success) {
      console.log('✅ 测试模式已启动，将在1分钟后自动停止')
    }
    
    return success
  }
}

/**
 * 🚀 快速启动函数
 * @param {object} options - 启动选项
 * @returns {ComplianceMonitorStarter} 启动器实例
 */
function quickStart(options = {}) {
  const starter = new ComplianceMonitorStarter()
  starter.start(options)
  return starter
}

/**
 * 📋 显示帮助信息
 */
function showHelp() {
  console.log('🔍 AI合规监督器帮助')
  console.log('='.repeat(30))
  console.log('')
  console.log('📖 使用方法:')
  console.log('')
  console.log('1. 快速启动:')
  console.log('   const { quickStart } = require("./start-compliance-monitor")')
  console.log('   quickStart({ auto: true })')
  console.log('')
  console.log('2. 交互式启动:')
  console.log('   const starter = new ComplianceMonitorStarter()')
  console.log('   starter.start()')
  console.log('')
  console.log('3. 测试模式:')
  console.log('   quickStart({ auto: true, duration: 60000 }) // 运行1分钟')
  console.log('')
  console.log('📋 可用选项:')
  console.log('  • auto: true     - 自动启动（无交互）')
  console.log('  • duration: ms   - 指定运行时间（毫秒）')
  console.log('  • silent: true   - 静默模式（减少输出）')
  console.log('')
  console.log('🎛️ 管理命令:')
  console.log('  • getComplianceStatus()  - 获取当前状态')
  console.log('  • stopAICompliance()     - 停止监督器')
  console.log('  • checkAICompliance(action) - 手动检查合规性')
  console.log('')
}

// 导出主要功能
module.exports = {
  ComplianceMonitorStarter,
  quickStart,
  showHelp
}

// 🔴 如果直接运行此脚本，启动交互式模式
if (require.main === module) {
  console.log('🚀 直接启动AI合规监督器')
  quickStart({ auto: true })
} 