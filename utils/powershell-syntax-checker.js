// utils/powershell-syntax-checker.js - PowerShell语法实时检查器
// 🚨 用于防止AI违反PowerShell语法规则的自动化检查工具

/**
 * PowerShell语法检查器
 * 在调用run_terminal_cmd前进行语法验证，防止bash语法错误
 */
class PowerShellSyntaxChecker {
  constructor() {
    this.violationCount = 0
    this.violationHistory = []
    
    // 🔴 禁止的bash语法模式
    this.bashPatterns = [
      {
        regex: /&&/g,
        name: '命令连接符&&',
        bashExample: 'echo "a" && echo "b"',
        powershellFix: 'echo "a"; echo "b"',
        description: 'PowerShell使用分号(;)连接命令'
      },
      {
        regex: /\|\|/g,
        name: '或操作符||',
        bashExample: 'cmd1 || cmd2',
        powershellFix: 'cmd1; if (-not $?) { cmd2 }',
        description: 'PowerShell使用条件判断替代||'
      },
      {
        regex: /^echo\s+/,
        name: 'bash echo命令',
        bashExample: 'echo "message"',
        powershellFix: 'Write-Host "message"',
        description: 'PowerShell使用Write-Host输出文本'
      },
      {
        regex: /`[^`]*`/g,
        name: '反引号命令替换',
        bashExample: '`command`',
        powershellFix: '"command"',
        description: 'PowerShell使用双引号或$()替换'
      },
      {
        regex: /2>&1/g,
        name: 'bash重定向',
        bashExample: 'command 2>&1',
        powershellFix: 'command 2>$null',
        description: 'PowerShell使用不同的重定向语法'
      }
    ]
  }

  /**
   * 🔴 主要检查方法 - 必须在run_terminal_cmd前调用
   * @param {string} command - 要检查的命令
   * @returns {object} 检查结果
   */
  validateCommand(command) {
    const violations = []
    
    // 检查每个bash语法模式
    this.bashPatterns.forEach(pattern => {
      if (pattern.regex.test(command)) {
        violations.push({
          pattern: pattern.name,
          found: command.match(pattern.regex),
          bashExample: pattern.bashExample,
          powershellFix: pattern.powershellFix,
          description: pattern.description
        })
      }
    })
    
    if (violations.length > 0) {
      this.recordViolation(command, violations)
      return {
        valid: false,
        violations,
        autoFixed: this.autoFix(command),
        message: this.generateErrorMessage(command, violations)
      }
    }
    
    return {
      valid: true,
      message: `✅ PowerShell语法检查通过: "${command}"`
    }
  }

  /**
   * 🔴 自动修复bash语法为PowerShell语法
   * @param {string} command - 原始命令
   * @returns {string} 修复后的命令
   */
  autoFix(command) {
    let fixed = command
    
    // 按顺序应用修复规则
    fixed = fixed.replace(/&&/g, ';')
    fixed = fixed.replace(/\|\|/g, '; if (-not $?) {')
    fixed = fixed.replace(/^echo\s+/g, 'Write-Host ')
    fixed = fixed.replace(/`([^`]*)`/g, '"$1"')
    fixed = fixed.replace(/2>&1/g, '2>$null')
    
    // 处理长命令分割（避免缓冲区溢出）
    if (fixed.length > 100 && /[\u4e00-\u9fa5]/.test(fixed)) {
      console.warn('⚠️ 命令过长且包含中文，建议分割执行')
      // 可以在这里实现自动分割逻辑
    }
    
    return fixed
  }

  /**
   * 🔴 记录违规历史
   */
  recordViolation(command, violations) {
    this.violationCount++
    const violation = {
      timestamp: new Date().toISOString(),
      command,
      violations,
      count: this.violationCount
    }
    
    this.violationHistory.push(violation)
    
    // 违规次数警告
    if (this.violationCount >= 3) {
      console.error(`🚨 严重警告: PowerShell语法违规已达${this.violationCount}次！`)
      console.error('建议立即检查命令生成逻辑')
    }
  }

  /**
   * 🔴 生成详细错误信息
   */
  generateErrorMessage(command, violations) {
    const violationDetails = violations.map(v => 
      `- ${v.pattern}: ${v.found}\n  修复方案: ${v.powershellFix}\n  说明: ${v.description}`
    ).join('\n')
    
    return `🚨 PowerShell语法违规检测\n命令: "${command}"\n\n违规详情:\n${violationDetails}\n\n自动修复建议: ${this.autoFix(command)}`
  }

  /**
   * 🔴 命令长度和复杂度检查
   */
  checkCommandComplexity(command) {
    const issues = []
    
    // 长度检查
    if (command.length > 200) {
      issues.push('命令过长(>200字符)，可能导致显示问题')
    }
    
    // 中文字符检查
    if (/[\u4e00-\u9fa5]/.test(command) && command.length > 100) {
      issues.push('包含中文且长度>100字符，可能触发PSConsoleReadLine异常')
    }
    
    // 复杂管道检查
    const pipeCount = (command.match(/\|/g) || []).length
    if (pipeCount > 3) {
      issues.push(`管道操作过多(${pipeCount}个)，建议简化`)
    }
    
    return issues
  }

  /**
   * 🔴 生成违规报告
   */
  generateReport() {
    if (this.violationCount === 0) {
      return {
        status: 'clean',
        message: '✅ 本次会话无PowerShell语法违规',
        violations: 0
      }
    }
    
    const mostCommonViolation = this.getMostCommonViolation()
    
    return {
      status: 'violations_detected',
      totalViolations: this.violationCount,
      mostCommon: mostCommonViolation,
      history: this.violationHistory,
      recommendations: [
        '使用Write-Host代替echo',
        '使用分号(;)代替&&连接命令',  
        '避免过长的命令（特别是包含中文时）',
        '使用PowerShell原生命令和语法'
      ]
    }
  }

  /**
   * 获取最常见的违规类型
   */
  getMostCommonViolation() {
    const violationCounts = {}
    
    this.violationHistory.forEach(history => {
      history.violations.forEach(violation => {
        violationCounts[violation.pattern] = (violationCounts[violation.pattern] || 0) + 1
      })
    })
    
    const mostCommon = Object.entries(violationCounts)
      .sort(([,a], [,b]) => b - a)[0]
    
    return mostCommon ? { type: mostCommon[0], count: mostCommon[1] } : null
  }

  /**
   * 🔴 重置违规计数器（新会话时调用）
   */
  reset() {
    this.violationCount = 0
    this.violationHistory = []
    console.log('🔄 PowerShell语法检查器已重置')
  }
}

/**
 * 🔴 全局检查器实例
 */
const globalSyntaxChecker = new PowerShellSyntaxChecker()

/**
 * 🔴 便捷检查函数 - 在run_terminal_cmd前调用
 * @param {string} command - 要检查的命令
 * @returns {boolean} 是否通过检查
 */
function checkPowerShellSyntax(command) {
  const result = globalSyntaxChecker.validateCommand(command)
  
  if (!result.valid) {
    console.error(result.message)
    console.warn(`建议使用修复后的命令: ${result.autoFixed}`)
    return false
  }
  
  console.log(result.message)
  return true
}

/**
 * 🔴 自动修复函数
 * @param {string} command - 原始命令
 * @returns {string} 修复后的命令
 */
function fixPowerShellSyntax(command) {
  return globalSyntaxChecker.autoFix(command)
}

// 导出主要功能
module.exports = {
  PowerShellSyntaxChecker,
  checkPowerShellSyntax,
  fixPowerShellSyntax,
  globalSyntaxChecker
}

// 🔴 使用示例
/*
// 在调用run_terminal_cmd前使用：
const command = 'echo "hello" && echo "world"'
if (checkPowerShellSyntax(command)) {
  // 安全执行
  run_terminal_cmd(command)
} else {
  // 使用修复后的命令
  const fixedCommand = fixPowerShellSyntax(command)
  run_terminal_cmd(fixedCommand)
}
*/ 