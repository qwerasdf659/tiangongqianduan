/**
 * 全面清理残留的 ? 字符（编码损坏的残留物）
 * 模式：中文字符后面紧跟?，如 '已结束?' → '已结束'
 */
let fs = require('fs')
let path = require('path')

let files = [
  'app.ts', 'utils/auth-helper.ts', 'utils/product-filter.ts',
  'utils/api/client.ts', 'utils/api/console.ts', 'utils/api/backpack.ts',
  'utils/api/shop.ts', 'utils/api/system.ts', 'utils/api/market.ts',
  'utils/api/auth.ts', 'utils/api/lottery.ts',
  'store/trade.ts', 'utils/index.ts', 'typings/index.d.ts',
  'pages/exchange/exchange-shop-handlers.ts',
  'pages/records/trade-upload-records/trade-upload-records.ts',
  'pages/trade/inventory/inventory.ts',
  'pages/trade/market/market.ts',
  'components/auth-modal/auth-modal.ts'
]

let totalFixes = 0

files.forEach(function (f) {
  let fullPath = path.join(__dirname, f)
  if (!fs.existsSync(fullPath)) { return }

  let content = fs.readFileSync(fullPath, 'utf8')
  let original = content

  // 清理中文后的残留 ? （非正常的问号）
  // 模式1: 中文字?'  → 中文字'（在闭合引号前的?）
  content = content.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\?'/g, "$1'")

  // 模式2: 中文字?,  → 中文字',（属性值后面的?）
  content = content.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\?,/g, "$1',")

  // 模式3: 中文字?)  → 中文字')（函数参数后面的?）
  content = content.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\?\)/g, "$1')")

  // 模式4: 在注释中 中文字?空格 → 中文字空格
  content = content.replace(/(\/\/[^\n]*[\u4e00-\u9fff])\?(\s)/g, "$1$2")

  // 模式5: 中文字?\n → 中文字\n （行尾注释的?）
  content = content.replace(/([\u4e00-\u9fff])\?$/gm, "$1")

  // 模式6: emoji后的? → 移除（如 '✅?' → '✅'）
  content = content.replace(/([✅❌⚠️🔍📱🎰🗑🔌📋📨🔐💡🔓🚨🔧⏳❓🎉🏷️✨🔄ℹ️🎁💎🎯🔥🌟🔒🔑👤🧹📊🚀🌊📷📦🛡️🎟️🎫🏪🔔🌐💬💰🎒🎰])\?/g, "$1")

  // 模式7: ） 后面不该有 ? 的情况
  content = content.replace(/）\?/g, "）")

  // 模式8: 修复 '已结束? → '已结束'（特定模式）  
  content = content.replace(/'已结束\?/g, "'已结束'")

  // 模式9: // 注释text    code → // 注释text\n    code（残留的行合并）
  // 更精确的行合并检测
  let lines = content.split('\n')
  let newLines = []
  let changed = false

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // 检测行合并模式: 注释后紧跟4+空格然后是代码关键词
    let mergedMatch = line.match(/^(\s*)(\/\/[^\n]*?\S)(\s{4,})((?:if|const|let|var|return|this\.|await|try|catch|throw|function|async |for\s|while|switch|else|break).*)$/)
    if (mergedMatch) {
      newLines.push(mergedMatch[1] + mergedMatch[2])
      newLines.push(mergedMatch[1] + mergedMatch[4])
      changed = true
      totalFixes++
      continue
    }

    // 检测 JSDoc 合并: * text    * text
    let docMatch = line.match(/^(\s*\*\s[^\n]*?\S)(\s{4,})(\*\s.*)$/)
    if (docMatch && line.length > 150) {
      newLines.push(docMatch[1])
      newLines.push(line.match(/^(\s*)/)[1] + ' ' + docMatch[3])
      changed = true
      totalFixes++
      continue
    }

    newLines.push(line)
  }

  if (changed) {
    content = newLines.join('\n')
  }

  if (content !== original) {
    let diff = original.length - content.length
    fs.writeFileSync(fullPath, content, 'utf8')
    totalFixes += Math.abs(diff)
    console.log('FIXED ' + f)
  }
})

console.log('\nTotal cleanup: ' + totalFixes + ' changes')

// Run ESLint-like check for remaining issues
files.forEach(function (f) {
  let fullPath = path.join(__dirname, f)
  if (!fs.existsSync(fullPath)) { return }
  let lines = fs.readFileSync(fullPath, 'utf8').split('\n')
  lines.forEach(function (line, idx) {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) { return }
    // Check for unbalanced quotes
    let q = 0
    for (let i = 0; i < line.length; i++) {
      if (line[i] === "'" && (i === 0 || line[i - 1] !== '\\')) { q++ }
    }
    if (q % 2 !== 0 && !line.includes('`')) {
      console.log('UNBALANCED: ' + f + ':' + (idx + 1) + ': ' + line.trim().substring(0, 120))
    }
  })
})

