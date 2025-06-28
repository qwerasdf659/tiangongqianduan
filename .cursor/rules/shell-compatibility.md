# 🔧 Shell跨平台兼容性规则 - 防止命令语法错误

## 🚨 核心问题识别

### 严禁混用不同Shell语法
```bash
# ❌ 错误：在PowerShell中使用Bash语法
git add . && git status
npm install && npm start
command1 && command2

# ❌ 错误：在Bash中使用PowerShell语法  
git add .; git status (在某些Bash版本中可能有问题)
```

## ✅ 强制规范

### 1. PowerShell环境 (Windows)
```powershell
# ✅ 正确：使用分号或分行
git add .
git status

# ✅ 正确：使用分号连接
git add .; git status

# ✅ 正确：使用PowerShell条件执行
git add .; if ($LASTEXITCODE -eq 0) { git status }
```

### 2. Bash环境 (Linux/macOS)
```bash
# ✅ 正确：使用&&连接
git add . && git status

# ✅ 正确：使用||处理错误
git add . && git status || echo "命令执行失败"
```

### 3. 跨平台通用方案
```bash
# ✅ 最安全：分别执行命令
git add .
git status

# ✅ 使用跨平台脚本工具
npm run build
npm run start
```

## 🔍 自动检测规则

### 拒绝以下模式的命令：
1. **Windows PowerShell环境中的Bash语法**:
   - 包含 `&&` 的命令组合
   - 包含 `||` 的错误处理（除非确认支持）
   - 包含 `$()` 命令替换语法

2. **跨平台命令混用**:
   - 同时使用 `&&` 和 `;` 的命令
   - 不明确环境的复杂命令链

3. **长命令字符串问题**:
   - 单行超过200字符的命令
   - 包含大量Unicode字符的命令

## ⚠️ 环境检测要求

### 执行命令前必须确认：
```javascript
// 检测当前Shell环境
const isWindows = process.platform === 'win32'
const isPowerShell = process.env.ComSpec?.includes('powershell') || 
                     process.env.PSModulePath !== undefined

if (isWindows && isPowerShell) {
  // 使用PowerShell语法: 分号或分行
  console.log('使用PowerShell语法')
} else {
  // 使用Bash语法: && 和 ||
  console.log('使用Bash语法') 
}
```

## 🚨 错误处理模板

### 发现语法不兼容时显示：
```
🚨 Shell语法兼容性错误！

错误类型：[PowerShell环境使用Bash语法/Bash环境使用PowerShell语法]
错误命令：{命令内容}
当前环境：{环境信息}

修正建议：
PowerShell: 使用 ';' 分隔命令或分行执行
Bash: 使用 '&&' 和 '||' 连接命令
通用: 分别执行每个命令

请根据当前Shell环境使用正确语法！
```

## 📝 最佳实践

### 推荐的跨平台命令模式：
1. **简单命令**: 一行一个命令
2. **复杂操作**: 使用脚本文件
3. **条件执行**: 使用各环境原生语法
4. **错误处理**: 分别处理每个命令的结果

### 特殊情况处理：
- **长提交信息**: 分段输入或使用文件
- **Unicode字符**: 确保终端编码正确
- **路径分隔符**: 使用环境变量或库处理

## 🎯 强制执行

违反此规则时：
1. **立即停止命令执行**
2. **显示环境和语法信息**  
3. **提供正确的命令示例**
4. **要求确认Shell环境**

每次执行跨Shell命令前必须验证语法兼容性！ 