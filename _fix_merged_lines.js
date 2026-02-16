/**
 * 修复换行符丢失导致的行合并问题
 * 模式: "// 注释文本    代码" → "// 注释文本\n    代码"
 */
var fs = require('fs')
var path = require('path')

var files = [
  'app.ts', 'utils/auth-helper.ts', 'utils/product-filter.ts',
  'utils/api/client.ts', 'utils/api/console.ts', 'utils/api/backpack.ts',
  'utils/api/shop.ts', 'utils/api/system.ts', 'utils/api/market.ts',
  'utils/api/auth.ts', 'utils/api/lottery.ts', 'utils/api/assets.ts',
  'store/trade.ts', 'utils/index.ts', 'typings/index.d.ts',
  'pages/exchange/exchange-shop-handlers.ts',
  'pages/records/trade-upload-records/trade-upload-records.ts',
  'pages/trade/inventory/inventory.ts',
  'pages/trade/market/market.ts',
  'components/auth-modal/auth-modal.ts'
]

var totalFixes = 0

files.forEach(function(f) {
  var fullPath = path.join(__dirname, f)
  if (!fs.existsSync(fullPath)) return
  
  var content = fs.readFileSync(fullPath, 'utf8')
  var original = content
  var fixes = 0
  
  // 修复模式1: // 注释    代码语句
  // 在注释末尾和代码开始之间插入换行
  // 关键词列表：if, const, let, var, return, this, await, try, catch, throw, function, async, for, while
  content = content.replace(
    /(\/\/[^\n]*?)(\s{3,})((?:if|const|let|var|return|this\.|await|try|catch|throw|function|async\s|for|while|switch)\s*[\({]?)/g,
    function(match, comment, spaces, code) {
      // 计算原始缩进（从行首到 // 的缩进）
      var lineStart = content.lastIndexOf('\n', content.indexOf(match)) + 1
      var indent = ''
      for (var j = lineStart; j < content.indexOf(match); j++) {
        if (content[j] === ' ' || content[j] === '\t') {
          indent += content[j]
        } else {
          break
        }
      }
      fixes++
      return comment.trimEnd() + '\n' + indent + code
    }
  )
  
  // 修复模式2: 多行JSDoc注释合并（* 行1     * 行2）
  // 超长注释行拆分（包含多个 * 的注释行）
  var lines = content.split('\n')
  var fixedLines = []
  
  lines.forEach(function(line) {
    // 检测多个 * 注释合并到一行的情况
    if (line.trim().startsWith('*') && !line.trim().startsWith('*/') && line.length > 160) {
      // 尝试在 * 后面的空格处拆分
      var match = line.match(/^(\s*\*[^*]*?\S)\s{3,}(\*\s)/)
      if (match) {
        var indent = line.match(/^(\s*)/)[1]
        var parts = line.split(/\s{3,}(?=\*\s)/)
        if (parts.length > 1) {
          parts.forEach(function(part) {
            fixedLines.push(part.trim().startsWith('*') ? indent + part.trim() : part)
          })
          fixes++
          return
        }
      }
    }
    
    // 检测注释后面紧跟字段声明的情况（换行符丢失）
    // 如: "* 说明文字    字段名: 类型"
    if (line.trim().startsWith('*') && /\*[^/]*\S\s{4,}([\w]+\s*[:=])/.test(line) && line.length > 150) {
      var commentMatch = line.match(/^(\s*\*[^]*?\S)(\s{4,})([\w].*$)/)
      if (commentMatch) {
        var commentIndent = line.match(/^(\s*)/)[1]
        fixedLines.push(commentMatch[1])
        fixedLines.push(commentIndent + '* ' + commentMatch[3])
        fixes++
        return
      }
    }
    
    fixedLines.push(line)
  })
  
  content = fixedLines.join('\n')
  
  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8')
    totalFixes += fixes
    console.log('FIXED ' + f + ': ' + fixes + ' merged lines')
  }
})

console.log('\nTotal merged line fixes: ' + totalFixes)

// 删除自身


