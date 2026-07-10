const fs = require('fs')
const path = require('path')

const srcDir = path.join(__dirname, 'src-icons')
const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.svg'))

files.forEach(file => {
  let svg = fs.readFileSync(path.join(srcDir, file), 'utf8')

  // Extract viewBox
  const vbMatch = svg.match(/viewBox="([^"]+)"/)
  if (!vbMatch) return

  const [, vb] = vbMatch
  const [minX, minY, width, height] = vb.split(/\s+/).map(Number)

  if (width === 1024 && height === 1024) return // already correct

  const scale = 1024 / Math.max(width, height)

  // Scale all numbers in path d attributes
  svg = svg.replace(/viewBox="[^"]+"/, 'viewBox="0 0 1024 1024"')
  svg = svg.replace(/width="\d+"/, 'width="1024"')
  svg = svg.replace(/height="\d+"/, 'height="1024"')

  // Scale path data numbers
  svg = svg.replace(/<path[^>]*d="([^"]+)"[^>]*\/?>/g, (match, d) => {
    const scaledD = d.replace(/-?[\d.]+/g, num => {
      return (parseFloat(num) * scale).toFixed(2).replace(/\.?0+$/, '')
    })
    return match.replace(d, scaledD)
  })

  fs.writeFileSync(path.join(srcDir, file), svg)
  console.log(`Scaled: ${file} (${width}x${height} -> 1024x1024)`)
})

console.log('Done!')
