/**
 * TDesign 按需打包清理脚本
 *
 * 微信开发者工具"构建 npm"后运行此脚本，
 * 删除 miniprogram_npm/tdesign-miniprogram 中未使用的组件目录，
 * 大幅减小主包体积。
 *
 * 使用方法：node scripts/clean-tdesign.js
 *
 * 原理：扫描项目中所有 .json 文件的 usingComponents，
 * 收集实际引用的 TDesign 组件及其内部依赖，删除其余组件。
 *
 * @file scripts/clean-tdesign.js
 */

const fs = require('fs')
const path = require('path')

const TD_NPM_DIR = path.join(__dirname, '..', 'miniprogram_npm', 'tdesign-miniprogram')

/** 始终保留的公共模块（非组件目录，TDesign 内部基础设施） */
const ALWAYS_KEEP = new Set(['common', 'miniprogram_npm', 'locale'])

/**
 * 递归扫描项目中所有 .json 文件，收集引用的 TDesign 组件名
 */
function scanUsedComponents(dir, results) {
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
    for (const item of items) {
      if (['node_modules', '.git', '.cursor', '.claude', 'miniprogram_npm'].includes(item.name)) continue
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        scanUsedComponents(full, results)
      } else if (item.name.endsWith('.json')) {
        try {
          const json = JSON.parse(fs.readFileSync(full, 'utf8'))
          if (json.usingComponents) {
            for (const v of Object.values(json.usingComponents)) {
              if (typeof v === 'string' && v.includes('tdesign-miniprogram')) {
                const match = v.match(/tdesign-miniprogram\/([^/]+)/)
                if (match) results.add(match[1])
              }
            }
          }
        } catch (e) { /* 非 JSON 文件跳过 */ }
      }
    }
  } catch (e) { /* 目录不可读跳过 */ }
}

/**
 * 递归收集 TDesign 组件的内部依赖（通过组件 JSON 的 usingComponents）
 */
function collectDependencies(compName, collected) {
  if (collected.has(compName)) return
  collected.add(compName)

  const jsonPath = path.join(TD_NPM_DIR, compName, compName + '.json')
  if (!fs.existsSync(jsonPath)) return

  try {
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    if (json.usingComponents) {
      for (const v of Object.values(json.usingComponents)) {
        if (typeof v === 'string') {
          const match = v.match(/\/([^/]+)\/[^/]+$/)
          if (match) collectDependencies(match[1], collected)
        }
      }
    }
  } catch (e) { /* 解析失败跳过 */ }
}

function rmDirRecursive(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) rmDirRecursive(full)
    else fs.unlinkSync(full)
  }
  fs.rmdirSync(dir)
}

function dirSize(dir) {
  let total = 0
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) total += dirSize(full)
      else if (item.isFile()) total += fs.statSync(full).size
    }
  } catch (e) { /* 忽略 */ }
  return total
}

// ===== 主流程 =====

if (!fs.existsSync(TD_NPM_DIR)) {
  console.log('miniprogram_npm/tdesign-miniprogram 不存在，请先执行"构建 npm"')
  process.exit(1)
}

const projectRoot = path.join(__dirname, '..')

// 1. 扫描项目中实际使用的 TDesign 组件
const usedComponents = new Set()
scanUsedComponents(projectRoot, usedComponents)
console.log('项目中直接引用的 TDesign 组件:', [...usedComponents].sort().join(', '))

// 2. 递归收集所有依赖
const allNeeded = new Set([...ALWAYS_KEEP])
for (const comp of usedComponents) {
  collectDependencies(comp, allNeeded)
}
console.log('含依赖共需保留:', [...allNeeded].sort().join(', '))

// 3. 删除未使用的组件目录
const allDirs = fs.readdirSync(TD_NPM_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name)

let savedBytes = 0
let removedCount = 0
for (const d of allDirs) {
  if (!allNeeded.has(d)) {
    const full = path.join(TD_NPM_DIR, d)
    const size = dirSize(full)
    savedBytes += size
    rmDirRecursive(full)
    removedCount++
  }
}

// 4. 删除 .d.ts 和 .map 文件
let extraSaved = 0
function cleanExtras(dir) {
  try {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) cleanExtras(full)
      else if (item.name.endsWith('.d.ts') || item.name.endsWith('.map')) {
        extraSaved += fs.statSync(full).size
        fs.unlinkSync(full)
      }
    }
  } catch (e) { /* 忽略 */ }
}
cleanExtras(path.join(projectRoot, 'miniprogram_npm'))

console.log('\n===== 清理完成 =====')
console.log('删除未使用组件: ' + removedCount + ' 个')
console.log('节省体积: ' + (savedBytes / 1024).toFixed(1) + ' KB')
console.log('额外清理(.d.ts/.map): ' + (extraSaved / 1024).toFixed(1) + ' KB')
console.log('总节省: ' + ((savedBytes + extraSaved) / 1024).toFixed(1) + ' KB')
