// utils/ai-compliance-monitor.js - AI合规监督自动运行程序
// 🚨 监督AI遵守全局规则和项目规则的自动化系统

/**
 * AI合规监督器 - 实时监控AI是否遵循所有规则
 * 包括：用户全局规则、.cursor项目规则、安全规范等
 */
class AIComplianceMonitor {
  constructor() {
    this.sessionId = this.generateSessionId()
    this.startTime = Date.now()
    this.isActive = true
    
    // 监控计数器
    this.counters = {
      totalToolCalls: 0,
      ruleViolations: 0,
      autoFixes: 0,
      warnings: 0,
      criticalErrors: 0
    }
    
    // 违规历史
    this.violationHistory = []
    
    // 规则检查器集合
    this.ruleCheckers = this.initializeRuleCheckers()
    
    // 监控状态
    this.monitoringState = {
      powershellSyntax: true,
      globalUserRules: true,
      securityStandards: true,
      problemPrevention: true,
      developmentAutomation: true
    }
    
    console.log('🔍 AI合规监督器已启动')
    console.log(`📋 会话ID: ${this.sessionId}`)
    console.log(`🕐 启动时间: ${new Date().toLocaleString()}`)
    
    // 启动定期检查
    this.startPeriodicChecks()
  }

  /**
   * 🔴 初始化所有规则检查器
   */
  initializeRuleCheckers() {
    return {
      // PowerShell语法检查器
      powershell: {
        name: 'PowerShell语法合规',
        check: (action) => this.checkPowerShellSyntax(action),
        weight: 10,
        enabled: true
      },
      
      // 用户全局规则检查器
      globalRules: {
        name: '用户全局规则合规',
        check: (action) => this.checkGlobalUserRules(action),
        weight: 20,
        enabled: true
      },
      
      // 安全标准检查器
      security: {
        name: '安全标准合规',
        check: (action) => this.checkSecurityStandards(action),
        weight: 15,
        enabled: true
      },
      
      // 问题防范检查器
      prevention: {
        name: '问题防范合规',
        check: (action) => this.checkProblemPrevention(action),
        weight: 12,
        enabled: true
      },
      
      // 开发自动化检查器
      automation: {
        name: '开发自动化合规',
        check: (action) => this.checkDevelopmentAutomation(action),
        weight: 8,
        enabled: true
      }
    }
  }

  /**
   * 🔴 主要监督方法 - 检查每个AI行动
   * @param {object} action - AI行动对象
   * @returns {object} 合规检查结果
   */
  checkCompliance(action) {
    this.counters.totalToolCalls++
    
    const results = {
      actionType: action.type,
      timestamp: new Date().toISOString(),
      violations: [],
      warnings: [],
      score: 100,
      status: 'compliant'
    }
    
    // 运行所有启用的规则检查器
    Object.entries(this.ruleCheckers).forEach(([key, checker]) => {
      if (checker.enabled && this.monitoringState[key]) {
        try {
          const checkResult = checker.check(action)
          
          if (checkResult.violations.length > 0) {
            results.violations.push(...checkResult.violations)
            results.score -= checkResult.violations.length * checker.weight
            this.counters.ruleViolations += checkResult.violations.length
          }
          
          if (checkResult.warnings.length > 0) {
            results.warnings.push(...checkResult.warnings)
            this.counters.warnings += checkResult.warnings.length
          }
          
        } catch (error) {
          console.error(`❌ 规则检查器 ${checker.name} 执行失败:`, error)
        }
      }
    })
    
    // 确定合规状态
    if (results.violations.length > 0) {
      results.status = results.violations.some(v => v.severity === 'critical') ? 'critical' : 'violation'
      if (results.status === 'critical') {
        this.counters.criticalErrors++
      }
    } else if (results.warnings.length > 0) {
      results.status = 'warning'
    }
    
    // 记录违规历史
    if (results.status !== 'compliant') {
      this.violationHistory.push(results)
    }
    
    // 实时报告
    this.reportRealTime(results)
    
    return results
  }

  /**
   * 🔴 检查PowerShell语法合规
   */
  checkPowerShellSyntax(action) {
    const violations = []
    const warnings = []
    
    if (action.type === 'run_terminal_cmd') {
      const command = action.command || ''
      
      // 检查bash语法违规
      const bashPatterns = [
        { pattern: /&&/, name: '命令连接符&&', severity: 'critical' },
        { pattern: /\|\|/, name: '或操作符||', severity: 'critical' },
        { pattern: /^echo\s/, name: 'bash echo命令', severity: 'major' },
        { pattern: /`[^`]*`/, name: '反引号', severity: 'minor' }
      ]
      
      bashPatterns.forEach(({ pattern, name, severity }) => {
        if (pattern.test(command)) {
          violations.push({
            rule: 'PowerShell语法',
            type: name,
            severity,
            command,
            fix: this.getPowerShellFix(name),
            ruleFile: 'development-automation-unified.mdc'
          })
        }
      })
      
      // 检查命令长度（避免缓冲区溢出）
      if (command.length > 100 && /[\u4e00-\u9fa5]/.test(command)) {
        warnings.push({
          rule: 'PowerShell复杂度',
          type: '长命令+中文字符',
          reason: '可能触发PSConsoleReadLine缓冲区溢出',
          suggestion: '分割命令或简化输出'
        })
      }
    }
    
    return { violations, warnings }
  }

  /**
   * 🔴 检查用户全局规则合规
   */
  checkGlobalUserRules(action) {
    const violations = []
    const warnings = []
    
    // 用户规则1：不准违反规则浪费Claude 4 Sonnet请求次数
    if (this.counters.ruleViolations > 5) {
      violations.push({
        rule: '用户全局规则1',
        type: '频繁违规浪费请求',
        severity: 'critical',
        count: this.counters.ruleViolations,
        action: '立即停止违规行为'
      })
    }
    
    // 用户规则2：深度思考理解项目代码
    if (action.type === 'edit_file' || action.type === 'search_replace') {
      if (!action.explanation || action.explanation.length < 20) {
        violations.push({
          rule: '用户全局规则2',
          type: '缺乏深度思考说明',
          severity: 'major',
          action: '提供详细的修改原因和影响分析'
        })
      }
    }
    
    // 用户规则3：使用中文回答
    if (action.type === 'response' && action.language !== 'chinese') {
      violations.push({
        rule: '用户全局规则3',
        type: '未使用中文回答',
        severity: 'major',
        language: action.language
      })
    }
    
    // 用户规则4：完成任务后检查项目运行
    if (action.type === 'task_completion' && !action.projectRunCheck) {
      warnings.push({
        rule: '用户全局规则4',
        type: '未检查项目运行状态',
        suggestion: '验证修改后项目是否可以正常运行'
      })
    }
    
    return { violations, warnings }
  }

  /**
   * 🔴 检查安全标准合规
   */
  checkSecurityStandards(action) {
    const violations = []
    const warnings = []
    
    // 检查硬编码数据违规
    if (action.type === 'edit_file' && action.code_edit) {
      const code = action.code_edit
      
      // 检查硬编码奖品配置
      if (/const\s+PRIZES\s*=\s*\[/.test(code)) {
        violations.push({
          rule: '安全标准',
          type: '硬编码奖品配置',
          severity: 'critical',
          ruleFile: 'tiangong-security-standards.mdc',
          fix: '从后端API获取奖品配置'
        })
      }
      
      // 检查Mock数据违规
      const mockPatterns = [
        /mock/i, /fake/i, /test.*data/i, /shouldUseMock/i
      ]
      
      mockPatterns.forEach(pattern => {
        if (pattern.test(code)) {
          violations.push({
            rule: '安全标准',
            type: 'Mock数据违规',
            severity: 'major',
            pattern: pattern.toString(),
            fix: '使用真实后端API'
          })
        }
      })
    }
    
    return { violations, warnings }
  }

  /**
   * 🔴 检查问题防范合规
   */
  checkProblemPrevention(action) {
    const violations = []
    const warnings = []
    
    // 检查120秒超时规则
    if (action.type === 'run_terminal_cmd') {
      const startTime = action.startTime || Date.now()
      
      // 模拟检查长时间运行的命令
      if (action.command && action.command.includes('git log') && !action.command.includes('--no-pager')) {
        warnings.push({
          rule: '120秒超时规则',
          type: '可能触发分页器卡死',
          command: action.command,
          fix: '使用 git --no-pager log 或添加输出限制'
        })
      }
    }
    
    // 检查并行工具调用优化
    if (action.type === 'tool_sequence' && action.tools) {
      const parallelableTools = ['read_file', 'grep_search', 'list_dir', 'codebase_search']
      const canParallel = action.tools.filter(tool => 
        parallelableTools.includes(tool.type) && !tool.dependsOnPrevious
      )
      
      if (canParallel.length > 1) {
        warnings.push({
          rule: '并行优化',
          type: '未充分利用并行工具调用',
          count: canParallel.length,
          timeSaving: (canParallel.length - 1) * 3000,
          suggestion: '使用Promise.all()并行执行'
        })
      }
    }
    
    return { violations, warnings }
  }

  /**
   * 🔴 检查开发自动化合规
   */
  checkDevelopmentAutomation(action) {
    const violations = []
    const warnings = []
    
    // 检查微信小程序项目识别
    if (action.type === 'run_terminal_cmd') {
      const prohibitedCommands = ['npm start', 'npm run dev', 'node server.js']
      const command = action.command || ''
      
      prohibitedCommands.forEach(prohibited => {
        if (command.includes(prohibited)) {
          violations.push({
            rule: '微信小程序项目规范',
            type: '错误的启动命令',
            severity: 'major',
            command: prohibited,
            fix: '微信小程序只能通过开发者工具启动'
          })
        }
      })
    }
    
    return { violations, warnings }
  }

  /**
   * 🔴 实时报告方法
   */
  reportRealTime(results) {
    if (results.status === 'critical') {
      console.error('🚨 严重违规检测！')
      console.error(`行动类型: ${results.actionType}`)
      console.error(`违规数: ${results.violations.length}`)
      results.violations.forEach(v => {
        console.error(`- ${v.rule}: ${v.type} (${v.severity})`)
      })
    } else if (results.status === 'violation') {
      console.warn('⚠️ 规则违规检测')
      console.warn(`合规评分: ${results.score}/100`)
    } else if (results.status === 'warning') {
      console.info('💡 改进建议')
      results.warnings.forEach(w => {
        console.info(`- ${w.rule}: ${w.type}`)
      })
    }
  }

  /**
   * 🔴 启动定期检查
   */
  startPeriodicChecks() {
    // 每30秒生成合规报告
    this.periodicInterval = setInterval(() => {
      if (this.isActive) {
        this.generatePeriodicReport()
      }
    }, 30000)
    
    // 每5分钟检查会话健康度
    this.healthCheckInterval = setInterval(() => {
      if (this.isActive) {
        this.performHealthCheck()
      }
    }, 300000)
  }

  /**
   * 🔴 生成定期报告
   */
  generatePeriodicReport() {
    const runtime = Date.now() - this.startTime
    const runtimeMinutes = Math.floor(runtime / 60000)
    
    console.log('📊 AI合规监督定期报告')
    console.log(`运行时间: ${runtimeMinutes}分钟`)
    console.log(`工具调用总数: ${this.counters.totalToolCalls}`)
    console.log(`规则违规: ${this.counters.ruleViolations}`)
    console.log(`警告: ${this.counters.warnings}`)
    console.log(`严重错误: ${this.counters.criticalErrors}`)
    
    // 计算合规率
    const complianceRate = this.counters.totalToolCalls > 0 ? 
      ((this.counters.totalToolCalls - this.counters.ruleViolations) / this.counters.totalToolCalls * 100).toFixed(1) : 100
    
    console.log(`合规率: ${complianceRate}%`)
    
    if (this.counters.criticalErrors > 0) {
      console.error('🚨 检测到严重违规，建议立即处理')
    }
  }

  /**
   * 🔴 执行健康检查
   */
  performHealthCheck() {
    const issues = []
    
    // 检查违规频率
    if (this.counters.ruleViolations > this.counters.totalToolCalls * 0.3) {
      issues.push('违规率过高(>30%)')
    }
    
    // 检查严重错误
    if (this.counters.criticalErrors > 5) {
      issues.push('严重错误过多(>5次)')
    }
    
    // 检查规则检查器状态
    const disabledCheckers = Object.entries(this.ruleCheckers)
      .filter(([_, checker]) => !checker.enabled)
    
    if (disabledCheckers.length > 0) {
      issues.push(`${disabledCheckers.length}个规则检查器已禁用`)
    }
    
    if (issues.length > 0) {
      console.warn('⚠️ AI合规健康检查发现问题:')
      issues.forEach(issue => console.warn(`- ${issue}`))
    } else {
      console.log('✅ AI合规健康检查正常')
    }
  }

  /**
   * 🔴 生成最终合规报告
   */
  generateFinalReport() {
    const runtime = Date.now() - this.startTime
    const runtimeMinutes = Math.floor(runtime / 60000)
    
    const report = {
      sessionId: this.sessionId,
      duration: runtimeMinutes,
      totalActions: this.counters.totalToolCalls,
      violations: this.counters.ruleViolations,
      warnings: this.counters.warnings,
      criticalErrors: this.counters.criticalErrors,
      complianceRate: this.counters.totalToolCalls > 0 ? 
        ((this.counters.totalToolCalls - this.counters.ruleViolations) / this.counters.totalToolCalls * 100).toFixed(1) : 100,
      mostCommonViolations: this.getMostCommonViolations(),
      recommendations: this.generateRecommendations(),
      violationHistory: this.violationHistory
    }
    
    console.log('📋 AI合规最终报告')
    console.log('='.repeat(50))
    console.log(`会话ID: ${report.sessionId}`)
    console.log(`持续时间: ${report.duration}分钟`)
    console.log(`总行动数: ${report.totalActions}`)
    console.log(`违规次数: ${report.violations}`)
    console.log(`警告次数: ${report.warnings}`)
    console.log(`严重错误: ${report.criticalErrors}`)
    console.log(`合规率: ${report.complianceRate}%`)
    
    if (report.mostCommonViolations.length > 0) {
      console.log('\n最常见违规:')
      report.mostCommonViolations.forEach((violation, index) => {
        console.log(`${index + 1}. ${violation.type} (${violation.count}次)`)
      })
    }
    
    if (report.recommendations.length > 0) {
      console.log('\n改进建议:')
      report.recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`)
      })
    }
    
    return report
  }

  /**
   * 🔴 获取最常见违规
   */
  getMostCommonViolations() {
    const violationCounts = {}
    
    this.violationHistory.forEach(history => {
      history.violations.forEach(violation => {
        const key = `${violation.rule}:${violation.type}`
        violationCounts[key] = (violationCounts[key] || 0) + 1
      })
    })
    
    return Object.entries(violationCounts)
      .map(([key, count]) => {
        const [rule, type] = key.split(':')
        return { rule, type, count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  /**
   * 🔴 生成改进建议
   */
  generateRecommendations() {
    const recommendations = []
    
    if (this.counters.ruleViolations > 0) {
      recommendations.push('加强规则学习，减少违规行为')
    }
    
    if (this.counters.criticalErrors > 0) {
      recommendations.push('重点关注严重违规，优先修复关键问题')
    }
    
    const powershellViolations = this.violationHistory.filter(h => 
      h.violations.some(v => v.rule === 'PowerShell语法')
    ).length
    
    if (powershellViolations > 2) {
      recommendations.push('强化PowerShell语法学习，避免bash语法混用')
    }
    
    const parallelOpportunities = this.violationHistory.filter(h =>
      h.warnings.some(w => w.rule === '并行优化')
    ).length
    
    if (parallelOpportunities > 3) {
      recommendations.push('提高并行工具调用意识，优化执行效率')
    }
    
    return recommendations
  }

  /**
   * 🔴 获取PowerShell修复建议
   */
  getPowerShellFix(violationType) {
    const fixes = {
      '命令连接符&&': '使用分号(;)连接命令',
      '或操作符||': '使用if (-not $?) {...}条件判断',
      'bash echo命令': '使用Write-Host输出文本',
      '反引号': '使用双引号或$()替换'
    }
    
    return fixes[violationType] || '请参考PowerShell语法规范'
  }

  /**
   * 🔴 生成会话ID
   */
  generateSessionId() {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substr(2, 5)
    return `monitor_${timestamp}_${random}`
  }

  /**
   * 🔴 停止监督
   */
  stop() {
    this.isActive = false
    
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval)
    }
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    
    console.log('🔍 AI合规监督器已停止')
    return this.generateFinalReport()
  }

  /**
   * 🔴 手动触发合规检查
   */
  manualCheck(action) {
    return this.checkCompliance(action)
  }

  /**
   * 🔴 启用/禁用特定规则检查
   */
  toggleRuleChecker(checkerName, enabled) {
    if (this.ruleCheckers[checkerName]) {
      this.ruleCheckers[checkerName].enabled = enabled
      this.monitoringState[checkerName] = enabled
      console.log(`${enabled ? '✅ 启用' : '❌ 禁用'} 规则检查器: ${this.ruleCheckers[checkerName].name}`)
    }
  }
}

// 🔴 全局监督器实例
let globalComplianceMonitor = null

/**
 * 🔴 启动AI合规监督
 * @returns {AIComplianceMonitor} 监督器实例
 */
function startAICompliance() {
  if (globalComplianceMonitor) {
    console.warn('⚠️ AI合规监督器已经在运行')
    return globalComplianceMonitor
  }
  
  globalComplianceMonitor = new AIComplianceMonitor()
  return globalComplianceMonitor
}

/**
 * 🔴 检查AI行动合规性
 * @param {object} action - AI行动对象
 * @returns {object} 合规检查结果
 */
function checkAICompliance(action) {
  if (!globalComplianceMonitor) {
    console.warn('⚠️ AI合规监督器未启动，自动启动...')
    startAICompliance()
  }
  
  return globalComplianceMonitor.checkCompliance(action)
}

/**
 * 🔴 停止AI合规监督
 * @returns {object} 最终报告
 */
function stopAICompliance() {
  if (!globalComplianceMonitor) {
    console.warn('⚠️ AI合规监督器未运行')
    return null
  }
  
  const report = globalComplianceMonitor.stop()
  globalComplianceMonitor = null
  return report
}

/**
 * 🔴 获取当前合规状态
 * @returns {object} 当前状态
 */
function getComplianceStatus() {
  if (!globalComplianceMonitor) {
    return { status: 'inactive', message: 'AI合规监督器未运行' }
  }
  
  return {
    status: 'active',
    sessionId: globalComplianceMonitor.sessionId,
    runtime: Date.now() - globalComplianceMonitor.startTime,
    counters: globalComplianceMonitor.counters,
    violationCount: globalComplianceMonitor.violationHistory.length
  }
}

// 导出主要功能
module.exports = {
  AIComplianceMonitor,
  startAICompliance,
  checkAICompliance,
  stopAICompliance,
  getComplianceStatus,
  globalComplianceMonitor
}

// 🔴 使用示例和说明
/*
// 启动监督器
const monitor = startAICompliance()

// 检查特定行动
const action = {
  type: 'run_terminal_cmd',
  command: 'echo "hello" && echo "world"',
  explanation: '测试命令'
}
const result = checkAICompliance(action)

// 获取当前状态
const status = getComplianceStatus()

// 停止监督并获取报告
const finalReport = stopAICompliance()
*/ 