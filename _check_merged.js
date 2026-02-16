// 检测被合并的行（换行符丢失导致注释和代码在同一行）
let fs = require('fs')
let files = [
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

files.forEach(function (f) {
  if (!fs.existsSync(f)) { return }
  let lines = fs.readFileSync(f, 'utf8').split('\n')
  lines.forEach(function (l, i) {
    // 检测注释后紧跟代码（换行符丢失）
    if (/\/\/[^'"]*\s{3,}(if|const|let|var|return|this|await|try|catch|throw|function|async)[\s(]/.test(l)) {
      console.log('MERGED: ' + f + ':' + (i + 1) + ': ' + l.substring(0, 140))
    }
    // 检测多行注释合并到一行（包含多个 * 符号）
    if (/\*[^/]*\*[^/]*\*/.test(l) && l.trim().startsWith('*') && l.length > 200) {
      console.log('LONG_COMMENT: ' + f + ':' + (i + 1) + ': len=' + l.length)
    }
  })
})
console.log('Check complete')


