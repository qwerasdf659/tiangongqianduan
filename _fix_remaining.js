var fs = require('fs')
var path = require('path')

function fixLine(file, lineNum, oldText, newText) {
  var fullPath = path.join(__dirname, file)
  var lines = fs.readFileSync(fullPath, 'utf8').split('\n')
  var line = lines[lineNum - 1]
  if (line && line.includes(oldText)) {
    lines[lineNum - 1] = line.replace(oldText, newText)
    fs.writeFileSync(fullPath, lines.join('\n'), 'utf8')
    console.log('FIXED ' + file + ':' + lineNum)
    return true
  }
  console.log('SKIP ' + file + ':' + lineNum + ' (not found)')
  return false
}

// UNFIXED lines from previous pass
fixLine('pages/records/trade-upload-records/trade-upload-records.ts', 456, "confirmText: '\u77e5\u9053?", "confirmText: '\u77e5\u9053\u4e86'")
fixLine('pages/records/trade-upload-records/trade-upload-records.ts', 632, "confirmText: '\u77e5\u9053?", "confirmText: '\u77e5\u9053\u4e86'")
fixLine('pages/trade/inventory/inventory.ts', 780, "confirmText: '\u77e5\u9053?", "confirmText: '\u77e5\u9053\u4e86'")

// Fix icon fields with stray ?
fixLine('pages/records/trade-upload-records/trade-upload-records.ts', 91, "icon: '?", "icon: '\u2705'")
fixLine('pages/records/trade-upload-records/trade-upload-records.ts', 576, "icon: '?", "icon: '\u2705'")
fixLine('pages/records/trade-upload-records/trade-upload-records.ts', 580, "icon: '?", "icon: '\u2753'")

// Fix inventory multiline string
fixLine('pages/trade/inventory/inventory.ts', 502, "\u6838\u9500?", "\u6838\u9500\u3002")

// Fix stray ? in text (leftover from encoding corruption)
// These ? chars were originally the last byte of corrupted Chinese characters
var filesToCleanQ = [
  'app.ts',
  'pages/exchange/exchange-shop-handlers.ts',
  'pages/records/trade-upload-records/trade-upload-records.ts',
  'pages/trade/inventory/inventory.ts',
  'pages/trade/market/market.ts',
  'components/auth-modal/auth-modal.ts'
]

filesToCleanQ.forEach(function(f) {
  var fullPath = path.join(__dirname, f)
  if (!fs.existsSync(fullPath)) return
  var content = fs.readFileSync(fullPath, 'utf8')
  var original = content

  // Pattern: '中文text?' → '中文text' (remove stray ? at end of Chinese strings)
  // Only in specific known patterns
  content = content.replace(/提示\?'/g, "\u63d0\u793a'")
  content = content.replace(/即止\?'/g, "\u5373\u6b62'")
  content = content.replace(/体验\?'/g, "\u4f53\u9a8c'")
  content = content.replace(/臻选\?'/g, "\u81fb\u9009'")
  content = content.replace(/验证\?'/g, "\u9a8c\u8bc1\u7801'")
  content = content.replace(/复\?'/g, "\u590d\u5236'")
  content = content.replace(/核销\?'/g, "\u6838\u9500\u7801'")
  content = content.replace(/使\?'/g, "\u4f7f\u7528'")
  content = content.replace(/上\?'/g, "\u4e0a\u67b6'")
  content = content.replace(/页面\?'/g, "\u9875\u9762'")
  content = content.replace(/资\?'/g, "\u8d44\u6e90'")
  content = content.replace(/始\?'/g, "\u5f00\u59cb'")
  content = content.replace(/成功能'/g, "\u6210\u529f'")  // 成功能 → 成功
  content = content.replace(/加载入'/g, "\u52a0\u8f7d\u4e2d'")  // 加载入 → 加载中
  
  if (content !== original) {
    fs.writeFileSync(fullPath, content, 'utf8')
    console.log('CLEANED ' + f)
  }
})

console.log('Done')


