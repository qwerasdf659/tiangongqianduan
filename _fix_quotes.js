/**
 * 全面修复所有缺少闭合单引号的字符串
 * 扫描所有代码行，找出 'text 后面没有匹配的 ' 的情况
 */
var fs = require('fs')
var path = require('path')

var files = [
  'app.ts',
  'utils/api/client.ts',
  'utils/api/backpack.ts',
  'utils/api/shop.ts',
  'utils/api/system.ts',
  'utils/api/console.ts',
  'utils/api/market.ts',
  'utils/api/auth.ts',
  'utils/api/lottery.ts',
  'utils/auth-helper.ts',
  'utils/product-filter.ts',
  'pages/exchange/exchange-shop-handlers.ts',
  'pages/records/trade-upload-records/trade-upload-records.ts',
  'pages/trade/inventory/inventory.ts',
  'pages/trade/market/market.ts',
  'components/auth-modal/auth-modal.ts',
  'store/trade.ts'
]

var totalFixes = 0

files.forEach(function(f) {
  var fullPath = path.join(__dirname, f)
  if (!fs.existsSync(fullPath)) return
  
  var lines = fs.readFileSync(fullPath, 'utf8').split('\n')
  var fixes = 0
  
  lines.forEach(function(line, idx) {
    // 跳过注释行
    if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('/*')) return
    // 跳过模板字面量行（包含反引号）
    if (line.includes('`')) return
    
    // 检查单引号字符串是否闭合
    // 简单策略：计算非转义的单引号数量，如果是奇数，则有未闭合的字符串
    var inString = false
    var quoteCount = 0
    for (var i = 0; i < line.length; i++) {
      if (line[i] === "'" && (i === 0 || line[i-1] !== '\\')) {
        quoteCount++
        inString = !inString
      }
    }
    
    if (quoteCount % 2 !== 0) {
      // 奇数个引号 = 有未闭合字符串
      // 常见模式修复
      var fixed = line
      
      // 模式1: 'text) → 'text')  (缺少闭合引号在括号前)
      fixed = fixed.replace(/((?:log\.\w+|throw new Error|showToast|wx\.showToast)\(['"](?:[^'"]*[^\\]))\)/g, function(m, p1) {
        return p1 + "')"
      })
      
      // 模式2: 'text, → 'text',  (缺少闭合引号在逗号前)
      // 检查是否是属性赋值中的未闭合字符串
      if (fixed === line) {
        // 找到最后一个未闭合的引号
        var lastQuoteIdx = -1
        var open = false
        for (var j = 0; j < line.length; j++) {
          if (line[j] === "'" && (j === 0 || line[j-1] !== '\\')) {
            if (!open) {
              lastQuoteIdx = j
              open = true
            } else {
              open = false
            }
          }
        }
        
        if (open && lastQuoteIdx >= 0) {
          // 找到未闭合的引号起始位置
          var stringContent = line.substring(lastQuoteIdx + 1)
          
          // 在下列位置插入闭合引号：
          // 1. ')' 之前
          var closeIdx = stringContent.indexOf(')')
          if (closeIdx >= 0 && !stringContent.substring(0, closeIdx).includes("'")) {
            fixed = line.substring(0, lastQuoteIdx + 1 + closeIdx) + "'" + line.substring(lastQuoteIdx + 1 + closeIdx)
          }
          // 2. ', ' 之前 (属性值)
          else {
            var commaIdx = stringContent.indexOf(',')
            if (commaIdx >= 0 && !stringContent.substring(0, commaIdx).includes("'")) {
              fixed = line.substring(0, lastQuoteIdx + 1 + commaIdx) + "'" + line.substring(lastQuoteIdx + 1 + commaIdx)
            }
          }
        }
      }
      
      if (fixed !== line) {
        lines[idx] = fixed
        fixes++
        console.log('FIX ' + f + ':' + (idx+1) + ': ' + line.trim().substring(0, 100) + ' → ' + fixed.trim().substring(0, 100))
      } else {
        console.log('UNFIXED ' + f + ':' + (idx+1) + ': ' + line.trim().substring(0, 120))
      }
    }
  })
  
  if (fixes > 0) {
    fs.writeFileSync(fullPath, lines.join('\n'), 'utf8')
    totalFixes += fixes
  }
})

console.log('\nTotal quote fixes: ' + totalFixes)


