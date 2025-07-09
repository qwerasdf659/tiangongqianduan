# 🔍 AI合规监督器使用说明

## 📋 概述

AI合规监督器是一个自动运行程序，用于实时监控AI是否遵守您设定的全局规则和项目规则。它会在每次AI执行工具调用时进行检查，确保AI的行为符合预期标准。

## 🚀 快速启动

### 1. 自动启动（推荐）
```javascript
const { quickStart } = require('./start-compliance-monitor')

// 立即启动监督器
quickStart({ auto: true })
```

### 2. 交互式启动
```javascript
const { ComplianceMonitorStarter } = require('./start-compliance-monitor')

const starter = new ComplianceMonitorStarter()
starter.start()
```

### 3. 测试模式（运行1分钟）
```javascript
quickStart({ auto: true, duration: 60000 })
```

## 🔧 功能特性

### ✅ 监督的规则类别

1. **PowerShell语法检查**
   - 检测并修复bash语法错误（如`&&`、`||`、`echo`）
   - 预防控制台缓冲区溢出
   - 自动转换为正确的PowerShell语法

2. **用户全局规则监督**
   - 不准违反规则浪费Claude 4 Sonnet请求次数
   - 始终用中文回答
   - 深度思考理解项目代码
   - 完成任务后检查项目运行状态
   - 保护原有功能不被误删

3. **安全标准合规**
   - 禁止硬编码敏感配置
   - 阻止Mock数据在生产环境使用
   - 强制模块导入一致性检查
   - 要求真实API调用

4. **问题防范机制**
   - 120秒超时预防
   - 并行工具调用优化提醒
   - A级问题自动检测

5. **开发自动化规范**
   - 微信小程序项目识别
   - PowerShell环境适配
   - 自动化测试验证

## 📊 监督报告

### 实时监控
监督器会实时输出违规警告：
```
🚨 严重违规检测！
行动类型: run_terminal_cmd
违规数: 1
- PowerShell语法: 命令连接符&& (critical)
```

### 定期报告（每30秒）
```
📊 AI合规监督定期报告
运行时间: 5分钟
工具调用总数: 23
规则违规: 2
警告: 5
严重错误: 0
合规率: 91.3%
```

### 最终报告
停止监督器时会生成详细的会话报告，包含：
- 违规历史
- 最常见违规类型
- 改进建议
- 性能指标

## 🎛️ 管理操作

### 查看当前状态
```javascript
const { getComplianceStatus } = require('./ai-compliance-monitor')
console.log(getComplianceStatus())
```

### 手动检查合规性
```javascript
const { checkAICompliance } = require('./ai-compliance-monitor')

const action = {
  type: 'run_terminal_cmd',
  command: 'echo "hello" && echo "world"',
  explanation: '测试命令'
}

const result = checkAICompliance(action)
console.log('合规检查结果:', result)
```

### 停止监督器
```javascript
const { stopAICompliance } = require('./ai-compliance-monitor')
const finalReport = stopAICompliance()
```

## ⚙️ 配置管理

### 查看规则配置
```javascript
const { getRuleConfig, getEnabledRules } = require('./compliance-config')

// 查看PowerShell规则配置
const psConfig = getRuleConfig('powershellSyntax')

// 查看所有启用的规则
const enabledRules = getEnabledRules()
console.log('启用规则数量:', enabledRules.length)
```

### 启用/禁用规则
```javascript
const { updateRuleConfig } = require('./compliance-config')

// 禁用PowerShell语法检查
updateRuleConfig('powershellSyntax', 'bashSyntaxProhibition', { enabled: false })

// 调整违规阈值
updateRuleConfig('userGlobalRules', 'noWasteRequests', { maxViolations: 10 })
```

### 验证配置
```javascript
const { validateConfig } = require('./compliance-config')
const validation = validateConfig()

if (!validation.valid) {
  console.error('配置错误:', validation.issues)
}
```

## 🚨 违规处理机制

### 违规级别
- **Critical（严重）**: 立即停止并修复
- **Major（主要）**: 警告并继续
- **Minor（轻微）**: 记录并继续

### 自动修复
监督器会自动修复以下违规：
- PowerShell语法错误：`&&` → `;`，`echo` → `Write-Host`
- 简单的导入路径错误
- 基本的格式问题

### 升级机制
- 单次会话违规超过10次：发出警告
- 严重违规超过3次：建议停止对话
- 违规率超过30%：健康检查失败

## 📈 性能指标

### 监控指标
- **响应时间**: 工具调用执行时间
- **违规率**: 违规次数 / 总行动数
- **健康分数**: 综合评分（0-100）
- **行动频率**: 每分钟工具调用次数

### 健康分数计算
```
基础分数: 100
- 违规率扣分: 违规率 × 50
- 严重错误扣分: 严重错误数 × 10  
- 警告扣分: 警告数 × 2
```

## 🔧 故障排除

### 常见问题

#### Q: 监督器启动失败
**A**: 检查配置文件完整性
```javascript
const { validateConfig } = require('./compliance-config')
console.log(validateConfig())
```

#### Q: PowerShell语法检查不生效
**A**: 确认规则已启用
```javascript
const { isRuleEnabled } = require('./compliance-config')
console.log('PowerShell规则启用:', isRuleEnabled('powershellSyntax', 'bashSyntaxProhibition'))
```

#### Q: 监督器占用资源过高
**A**: 调整检查频率
```javascript
const { updateRuleConfig } = require('./compliance-config')
updateRuleConfig('global', null, { reportInterval: 60000 }) // 改为60秒
```

#### Q: 误报过多
**A**: 调整违规阈值或禁用特定规则
```javascript
// 提高违规阈值
updateRuleConfig('userGlobalRules', 'noWasteRequests', { maxViolations: 20 })

// 禁用误报规则
updateRuleConfig('securityStandards', 'mockDataViolation', { enabled: false })
```

### 调试模式
```javascript
// 启用详细日志
const starter = new ComplianceMonitorStarter()
starter.start({ debug: true, verbose: true })
```

## 📋 最佳实践

### 1. 监督器使用
- ✅ 在会话开始时立即启动监督器
- ✅ 定期查看合规报告
- ✅ 根据违规模式调整规则
- ❌ 不要在高频操作时禁用监督器

### 2. 规则配置
- ✅ 根据项目特点启用相关规则
- ✅ 为严重违规设置较低阈值
- ✅ 定期检查和更新规则配置
- ❌ 不要一次性禁用所有规则

### 3. 违规处理
- ✅ 优先处理严重违规
- ✅ 分析违规模式找出根本原因
- ✅ 利用自动修复功能
- ❌ 不要忽略频繁的轻微违规

## 📞 支持和反馈

如果您在使用过程中遇到问题或有改进建议，请：

1. 查看本文档的故障排除部分
2. 检查监督器生成的详细报告
3. 验证配置文件的完整性
4. 提供具体的错误信息和使用场景

## 🔄 版本更新

### v1.0 功能
- ✅ 基础规则监督
- ✅ PowerShell语法检查
- ✅ 实时报告
- ✅ 自动修复机制
- ✅ 配置管理

### 计划功能
- 🔜 机器学习优化规则权重
- 🔜 更智能的自动修复
- 🔜 Web界面管理
- 🔜 多语言支持
- 🔜 云端规则同步

---

*AI合规监督器 v1.0 - 让AI更好地遵守您的规则* 