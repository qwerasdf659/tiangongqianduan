/**
 * 图标 PNG → WebP 批量转换脚本
 *
 * 执行方案：WebP quality 90（视觉无损级别）
 * 决策依据：2026-02-22 《图标WebP优化方案》
 *
 * 转换范围：
 *   images/icons/materials/*.png → *.webp （15个材料资产图标）
 *   images/icons/categories/*.png → *.webp （9个商品分类图标）
 *
 * 不转换：
 *   images/icons/*.png — TabBar 图标（微信 tabBar.iconPath 仅支持 PNG）
 *   images/ui/grain-texture.png — 体积极小（20.6KB），无需优化
 *
 * 使用方法：
 *   1. 将 24 个 PNG 源文件放入对应目录
 *   2. node scripts/convert-icons-to-webp.js
 *   3. 转换完成后自动删除原始 PNG，WebP 文件就位
 *
 * @requires sharp — npm install --save-dev sharp --legacy-peer-deps
 */

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

/** WebP 压缩质量（90 = 视觉无损，60%体积压缩率） */
const WEBP_QUALITY = 90
/** Sharp effort 参数（6 = 高压缩效率，转换稍慢但体积更小） */
const WEBP_EFFORT = 6

/** 需要转换的目录列表（相对于项目根目录） */
const TARGET_DIRS = ['images/icons/materials', 'images/icons/categories']

/**
 * 转换单个 PNG 文件为 WebP
 *
 * @param {string} pngPath - PNG 文件绝对路径
 * @returns {Promise<{file: string, originalKB: number, webpKB: number, reduction: string}>}
 */
async function convertSingleFile(pngPath) {
  const dir = path.dirname(pngPath)
  const baseName = path.basename(pngPath, '.png')
  const webpPath = path.join(dir, baseName + '.webp')

  const originalStats = fs.statSync(pngPath)
  const originalKB = (originalStats.size / 1024).toFixed(1)

  await sharp(pngPath).webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT }).toFile(webpPath)

  const webpStats = fs.statSync(webpPath)
  const webpKB = (webpStats.size / 1024).toFixed(1)
  const reduction = ((1 - webpStats.size / originalStats.size) * 100).toFixed(1)

  return {
    file: baseName,
    originalKB: parseFloat(originalKB),
    webpKB: parseFloat(webpKB),
    reduction: reduction + '%'
  }
}

/**
 * 批量转换指定目录下所有 PNG → WebP，转换成功后删除原始 PNG
 */
async function main() {
  const projectRoot = path.resolve(__dirname, '..')
  let totalOriginal = 0
  let totalWebp = 0
  let totalFiles = 0

  console.log('=== 天工小程序图标 WebP 转换 ===')
  console.log(`质量参数: quality=${WEBP_QUALITY}, effort=${WEBP_EFFORT}`)
  console.log('')

  for (const relDir of TARGET_DIRS) {
    const absDir = path.join(projectRoot, relDir)

    if (!fs.existsSync(absDir)) {
      console.log(`[跳过] 目录不存在: ${relDir}`)
      continue
    }

    const pngFiles = fs.readdirSync(absDir).filter(f => f.endsWith('.png'))

    if (pngFiles.length === 0) {
      console.log(`[跳过] 目录无 PNG 文件: ${relDir}`)
      continue
    }

    console.log(`--- ${relDir} (${pngFiles.length} 个文件) ---`)

    for (const pngFile of pngFiles) {
      const pngPath = path.join(absDir, pngFile)
      const result = await convertSingleFile(pngPath)

      totalOriginal += result.originalKB
      totalWebp += result.webpKB
      totalFiles++

      console.log(
        `  ${result.file}: ${result.originalKB}KB → ${result.webpKB}KB (↓${result.reduction})`
      )

      fs.unlinkSync(pngPath)
    }

    console.log('')
  }

  if (totalFiles === 0) {
    console.log('')
    console.log('[错误] 未找到任何 PNG 文件！')
    console.log('请先将 24 个 PNG 源图标文件放入以下目录：')
    TARGET_DIRS.forEach(d => console.log(`  ${d}/`))
    console.log('')
    console.log('PNG 源文件来源：后端管理台项目 admin/public/assets/icons/')
    process.exit(1)
  }

  const totalReduction = ((1 - totalWebp / totalOriginal) * 100).toFixed(1)
  console.log('=== 转换完成 ===')
  console.log(`文件数: ${totalFiles}`)
  console.log(
    `总体积: ${totalOriginal.toFixed(1)}KB → ${totalWebp.toFixed(1)}KB (↓${totalReduction}%)`
  )
  console.log('原始 PNG 已删除（Git 历史可回溯）')
}

main().catch(err => {
  console.error('转换失败:', err)
  process.exit(1)
})
