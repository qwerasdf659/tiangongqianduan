// utils/compliance-config.js - AI合规监督配置文件
// 🔧 定义所有规则的权重、级别、检查频率等配置

/**
 * 合规监督配置 - 集中管理所有规则设置
 */
const ComplianceConfig = {
  // 🔴 监督器全局设置
  global: {
    enabled: true,
    autoStart: true,
    reportInterval: 30000,        // 30秒报告间隔
    healthCheckInterval: 300000,  // 5分钟健康检查
    maxViolationHistory: 100,     // 最大违规历史记录数
    criticalThreshold: 5,         // 严重错误阈值
    violationRateThreshold: 0.3   // 违规率阈值(30%)
  },

  // 🔴 用户全局规则配置
  userGlobalRules: {
    enabled: true,
    weight: 20,
    rules: {
      // 规则1：不准违反规则浪费Claude 4 Sonnet请求次数
      noWasteRequests: {
        enabled: true,
        severity: 'critical',
        maxViolations: 5,
        description: '不准违反规则浪费Claude 4 Sonnet请求次数',
        checkFrequency: 'every_action'
      },

      // 规则2：统一测试数据管理
      unifiedTestData: {
        enabled: true,
        severity: 'major',
        description: '统一配置强制数据存在性检查',
        patterns: [
          'mock', 'fake', 'shouldUseMock', 'testData'
        ]
      },

      // 规则3：始终用中文回答
      chineseResponse: {
        enabled: true,
        severity: 'major',
        description: 'Always respond in Chinese-simplified',
        checkFrequency: 'every_response'
      },

      // 规则4：深度思考理解项目
      deepThinking: {
        enabled: true,
        severity: 'major',
        minExplanationLength: 20,
        description: '深度思考理解这个项目的所有代码和文档和注释',
        requiredForActions: ['edit_file', 'search_replace', 'delete_file']
      },

      // 规则5：完成任务后检查项目运行
      postTaskCheck: {
        enabled: true,
        severity: 'minor',
        description: '完成任务后检查项目是否可以正常运行',
        requiredForActions: ['task_completion']
      },

      // 规则6：不准删除原有功能
      preserveExistingFeatures: {
        enabled: true,
        severity: 'critical',
        description: '注意编写项目代码时不要乱删除乱添加原来正常的功能需求',
        checkPatterns: ['delete', 'remove', 'comment out']
      },

      // 规则7：微信小程序开发标准
      wechatMiniProgramStandards: {
        enabled: true,
        severity: 'major',
        description: '编写的代码、使用的方法符合微信小程序的开发标准',
        prohibitedCommands: ['npm start', 'npm run dev', 'node server.js']
      },

      // 规则8：自动清理临时文件
      autoCleanup: {
        enabled: true,
        severity: 'minor',
        description: '每次完成任务后创建的临时文件、测试文件都要自行删除',
        patterns: ['.tmp', '.test', '.debug', '.backup']
      }
    }
  },

  // 🔴 PowerShell语法规则配置
  powershellSyntax: {
    enabled: true,
    weight: 15,
    rules: {
      // 禁止bash语法
      bashSyntaxProhibition: {
        enabled: true,
        severity: 'critical',
        patterns: [
          { regex: /&&/, name: '命令连接符&&', fix: '使用分号(;)连接命令' },
          { regex: /\|\|/, name: '或操作符||', fix: '使用if (-not $?) {...}条件判断' },
          { regex: /^echo\s/, name: 'bash echo命令', fix: '使用Write-Host输出文本' },
          { regex: /`[^`]*`/, name: '反引号', fix: '使用双引号或$()替换' },
          { regex: /2>&1/, name: 'bash重定向', fix: '使用PowerShell重定向语法' },
          { regex: /\/dev\/null/, name: 'Linux null设备', fix: '使用$null或>$null' }
        ]
      },

      // 控制台缓冲区溢出预防
      bufferOverflowPrevention: {
        enabled: true,
        severity: 'minor',
        maxCommandLength: 100,
        chineseCharacterWarning: true,
        description: '预防PowerShell控制台缓冲区溢出'
      }
    }
  },

  // 🔴 安全标准规则配置
  securityStandards: {
    enabled: true,
    weight: 18,
    rules: {
      // 硬编码数据检查
      hardcodedDataCheck: {
        enabled: true,
        severity: 'critical',
        patterns: [
          'const PRIZES =',
          'const LOTTERY_CONFIG =',
          'const API_KEYS =',
          'const TOKENS ='
        ],
        description: '禁止硬编码敏感配置数据'
      },

      // Mock数据违规检查
      mockDataViolation: {
        enabled: true,
        severity: 'major',
        patterns: [
          /shouldUseMock/i,
          /mockData/i,
          /fakeResponse/i,
          /testData.*generate/i
        ],
        description: '禁止在生产代码中使用Mock数据'
      },

      // 模块导入一致性检查
      moduleImportConsistency: {
        enabled: true,
        severity: 'critical',
        description: '统一导入路径和错误处理',
        requiredChecks: ['file_exists', 'path_validation']
      },

      // 强制后端依赖检查
      backendDependencyCheck: {
        enabled: true,
        severity: 'major',
        description: '强制后端依赖检查与错误处理',
        requireRealAPI: true,
        noSimulatedResults: true
      }
    }
  },

  // 🔴 问题防范规则配置
  problemPrevention: {
    enabled: true,
    weight: 12,
    rules: {
      // 120秒超时预防
      timeoutPrevention: {
        enabled: true,
        severity: 'major',
        maxExecutionTime: 120000, // 120秒
        riskyCommands: [
          'git log', 'git show', 'cat large_file',
          'grep -r', 'find /', 'npm install'
        ],
        requiredFlags: ['--no-pager', '| head', '| tail']
      },

      // 并行工具调用优化
      parallelOptimization: {
        enabled: true,
        severity: 'minor',
        parallelableTools: [
          'read_file', 'grep_search', 'list_dir', 
          'codebase_search', 'file_search'
        ],
        minParallelCount: 2,
        estimatedTimeSaving: 3000 // 3秒每个工具
      },

      // A级问题预防
      criticalProblemPrevention: {
        enabled: true,
        severity: 'critical',
        problemTypes: [
          'module_not_found',
          'syntax_error',
          'infinite_loop',
          'memory_leak',
          'api_crash'
        ]
      }
    }
  },

  // 🔴 开发自动化规则配置
  developmentAutomation: {
    enabled: true,
    weight: 10,
    rules: {
      // 微信小程序项目识别
      wechatMiniProgramDetection: {
        enabled: true,
        severity: 'major',
        identifiers: ['app.js', 'app.json', 'pages/', 'components/'],
        prohibitedCommands: [
          'npm start', 'npm run dev', 'npm run build',
          'node server.js', 'python manage.py',
          'mvn spring-boot:run', 'gradle bootRun'
        ],
        correctApproach: '通过微信开发者工具启动项目'
      },

      // PowerShell环境适配
      powershellEnvironmentAdaptation: {
        enabled: true,
        severity: 'major',
        osDetection: 'win32',
        shellType: 'PowerShell',
        syntaxRules: 'strict'
      },

      // 自动化测试和验证
      automatedTesting: {
        enabled: true,
        severity: 'minor',
        requiredAfterActions: [
          'edit_file', 'search_replace', 'delete_file'
        ],
        testTypes: ['syntax_check', 'linter_check', 'compile_check']
      }
    }
  },

  // 🔴 违规处理配置
  violationHandling: {
    immediate: {
      critical: 'stop_and_fix',      // 严重违规：立即停止并修复
      major: 'warn_and_continue',    // 主要违规：警告并继续
      minor: 'log_and_continue'      // 轻微违规：记录并继续
    },

    escalation: {
      maxViolationsPerSession: 10,
      criticalViolationLimit: 3,
      autoStopThreshold: 15,
      userNotificationThreshold: 5
    },

    autoFix: {
      enabled: true,
      powershellSyntax: true,        // 自动修复PowerShell语法
      simpleImports: true,           // 自动修复简单导入错误
      codeFormatting: false          // 不自动修复代码格式
    }
  },

  // 🔴 报告配置
  reporting: {
    realTimeReporting: {
      enabled: true,
      levels: ['critical', 'major'],
      includeStackTrace: true,
      includeActionContext: true
    },

    periodicReporting: {
      enabled: true,
      interval: 30000,              // 30秒
      includeStatistics: true,
      includeTrends: true
    },

    finalReporting: {
      enabled: true,
      includeViolationHistory: true,
      includeRecommendations: true,
      includePerformanceMetrics: true,
      exportFormat: 'json'
    }
  },

  // 🔴 性能监控配置
  performance: {
    enabled: true,
    metrics: {
      responseTime: true,           // 响应时间
      toolCallDuration: true,       // 工具调用耗时
      memoryUsage: false,           // 内存使用（暂不支持）
      violationRate: true           // 违规率
    },

    thresholds: {
      slowResponseTime: 5000,       // 慢响应阈值：5秒
      tooManyToolCalls: 20,         // 工具调用过多阈值
      highViolationRate: 0.2        // 高违规率阈值：20%
    }
  }
}

/**
 * 🔴 获取规则配置
 * @param {string} ruleCategory - 规则类别
 * @param {string} ruleName - 规则名称
 * @returns {object} 规则配置
 */
function getRuleConfig(ruleCategory, ruleName = null) {
  const category = ComplianceConfig[ruleCategory]
  if (!category) {
    throw new Error(`规则类别 '${ruleCategory}' 不存在`)
  }

  if (ruleName) {
    const rule = category.rules && category.rules[ruleName]
    if (!rule) {
      throw new Error(`规则 '${ruleName}' 在类别 '${ruleCategory}' 中不存在`)
    }
    return rule
  }

  return category
}

/**
 * 🔴 检查规则是否启用
 * @param {string} ruleCategory - 规则类别
 * @param {string} ruleName - 规则名称
 * @returns {boolean} 是否启用
 */
function isRuleEnabled(ruleCategory, ruleName = null) {
  try {
    const config = getRuleConfig(ruleCategory, ruleName)
    return config.enabled === true
  } catch (error) {
    console.warn(`检查规则启用状态时出错: ${error.message}`)
    return false
  }
}

/**
 * 🔴 更新规则配置
 * @param {string} ruleCategory - 规则类别
 * @param {string} ruleName - 规则名称
 * @param {object} newConfig - 新配置
 */
function updateRuleConfig(ruleCategory, ruleName, newConfig) {
  try {
    if (!ComplianceConfig[ruleCategory]) {
      throw new Error(`规则类别 '${ruleCategory}' 不存在`)
    }

    if (ruleName) {
      if (!ComplianceConfig[ruleCategory].rules) {
        ComplianceConfig[ruleCategory].rules = {}
      }
      
      ComplianceConfig[ruleCategory].rules[ruleName] = {
        ...ComplianceConfig[ruleCategory].rules[ruleName],
        ...newConfig
      }
    } else {
      ComplianceConfig[ruleCategory] = {
        ...ComplianceConfig[ruleCategory],
        ...newConfig
      }
    }

    console.log(`✅ 规则配置已更新: ${ruleCategory}.${ruleName || 'global'}`)
  } catch (error) {
    console.error(`❌ 更新规则配置失败: ${error.message}`)
  }
}

/**
 * 🔴 获取所有启用的规则
 * @returns {Array} 启用的规则列表
 */
function getEnabledRules() {
  const enabledRules = []

  Object.entries(ComplianceConfig).forEach(([category, config]) => {
    if (config.enabled && config.rules) {
      Object.entries(config.rules).forEach(([ruleName, ruleConfig]) => {
        if (ruleConfig.enabled) {
          enabledRules.push({
            category,
            name: ruleName,
            severity: ruleConfig.severity,
            weight: config.weight,
            description: ruleConfig.description
          })
        }
      })
    }
  })

  return enabledRules
}

/**
 * 🔴 验证配置完整性
 * @returns {object} 验证结果
 */
function validateConfig() {
  const issues = []
  const warnings = []

  // 检查必需的配置项
  const requiredGlobalFields = ['enabled', 'reportInterval', 'healthCheckInterval']
  requiredGlobalFields.forEach(field => {
    if (ComplianceConfig.global[field] === undefined) {
      issues.push(`缺少全局配置项: ${field}`)
    }
  })

  // 检查规则权重总和
  const totalWeight = Object.values(ComplianceConfig)
    .filter(config => config.weight)
    .reduce((sum, config) => sum + config.weight, 0)

  if (totalWeight > 100) {
    warnings.push(`规则权重总和过高: ${totalWeight}`)
  }

  // 检查每个规则类别的完整性
  Object.entries(ComplianceConfig).forEach(([category, config]) => {
    if (config.rules) {
      Object.entries(config.rules).forEach(([ruleName, ruleConfig]) => {
        if (!ruleConfig.enabled !== undefined && !ruleConfig.severity) {
          issues.push(`规则 ${category}.${ruleName} 缺少严重性级别`)
        }
      })
    }
  })

  return {
    valid: issues.length === 0,
    issues,
    warnings,
    summary: {
      totalCategories: Object.keys(ComplianceConfig).length,
      totalRules: getEnabledRules().length,
      totalWeight
    }
  }
}

// 导出配置和工具函数
module.exports = {
  ComplianceConfig,
  getRuleConfig,
  isRuleEnabled,
  updateRuleConfig,
  getEnabledRules,
  validateConfig
}

// 🔴 使用示例
/*
const { ComplianceConfig, getRuleConfig, isRuleEnabled } = require('./compliance-config')

// 检查规则是否启用
const isPowerShellEnabled = isRuleEnabled('powershellSyntax', 'bashSyntaxProhibition')

// 获取规则配置
const userRulesConfig = getRuleConfig('userGlobalRules')

// 验证配置
const validation = validateConfig()
console.log('配置验证结果:', validation)
*/ 