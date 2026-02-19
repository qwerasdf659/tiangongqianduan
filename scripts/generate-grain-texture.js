/**
 * 生成噪点纹理 PNG — 纯 Node.js 实现，无第三方依赖
 * 
 * 输出: images/ui/grain-texture.png (200x200, 半透明随机噪点)
 * 用法: node scripts/generate-grain-texture.js
 */

const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

const WIDTH = 100
const HEIGHT = 100

function crc32(buf) {
  let crcTable = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    crcTable[n] = c
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const lengthBuffer = Buffer.alloc(4)
  lengthBuffer.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([typeBuffer, data])
  const crcBuffer = Buffer.alloc(4)
  crcBuffer.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer])
}

const ihdrData = Buffer.alloc(13)
ihdrData.writeUInt32BE(WIDTH, 0)
ihdrData.writeUInt32BE(HEIGHT, 4)
ihdrData[8] = 8   // bit depth
ihdrData[9] = 6   // color type: RGBA
ihdrData[10] = 0  // compression
ihdrData[11] = 0  // filter
ihdrData[12] = 0  // interlace

const rawPixels = Buffer.alloc(HEIGHT * (1 + WIDTH * 4))

for (let y = 0; y < HEIGHT; y++) {
  const rowOffset = y * (1 + WIDTH * 4)
  rawPixels[rowOffset] = 0 // filter byte: None

  for (let x = 0; x < WIDTH; x++) {
    const pixelOffset = rowOffset + 1 + x * 4
    const grain = Math.floor(Math.random() * 200) + 55 // 55~255 灰度值
    rawPixels[pixelOffset] = grain     // R
    rawPixels[pixelOffset + 1] = grain // G
    rawPixels[pixelOffset + 2] = grain // B

    // 约25%的像素可见，透明度 8~22（非常微弱）
    if (Math.random() < 0.25) {
      rawPixels[pixelOffset + 3] = Math.floor(Math.random() * 14) + 8
    } else {
      rawPixels[pixelOffset + 3] = 0
    }
  }
}

const compressedData = zlib.deflateSync(rawPixels, { level: 9 })

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const ihdrChunk = makeChunk('IHDR', ihdrData)
const idatChunk = makeChunk('IDAT', compressedData)
const iendChunk = makeChunk('IEND', Buffer.alloc(0))

const pngBuffer = Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk])

const outputPath = path.join(__dirname, '..', 'images', 'ui', 'grain-texture.png')
fs.writeFileSync(outputPath, pngBuffer)

console.log(`Done: ${outputPath}`)
console.log(`Size: ${pngBuffer.length} bytes (${(pngBuffer.length / 1024).toFixed(1)} KB)`)
console.log(`Dimensions: ${WIDTH}x${HEIGHT}, RGBA, ~35% visible pixels, alpha 5-25`)
