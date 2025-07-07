// utils/cleanup-status-diagnostic.js - 清理状态筛选诊断工具
const fs = require('fs')
const path = require('path')

console.log('🧹 开始清理状态筛选诊断工具...')

// 1. 删除临时诊断工具文件
const filesToDelete = [
  'utils/upload-status-diagnostic.js',
  'utils/cleanup-status-diagnostic.js'
]

filesToDelete.forEach(file => {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file)
    console.log(`✅ 已删除: ${file}`)
  }
})

// 2. 清理上传记录页面中的诊断代码
const uploadRecordsJsFile = 'pages/records/upload-records.js'
if (fs.existsSync(uploadRecordsJsFile)) {
  let content = fs.readFileSync(uploadRecordsJsFile, 'utf8')
  
  // 移除诊断工具导入
  content = content.replace(/const UploadStatusDiagnostic = require\('\.\.\/\.\.\/utils\/upload-status-diagnostic'\) \/\/ 🔧 新增：状态筛选诊断工具\n/, '')
  
  // 移除诊断方法
  content = content.replace(/  \/\/ 🔧 新增：状态筛选功能诊断[\s\S]*?  \/\/ 🔧 新增：测试特定状态筛选[\s\S]*?  }\n/, '')
  
  fs.writeFileSync(uploadRecordsJsFile, content)
  console.log(`✅ 已清理: ${uploadRecordsJsFile}`)
}

// 3. 清理上传记录页面模板中的测试面板
const uploadRecordsWxmlFile = 'pages/records/upload-records.wxml'
if (fs.existsSync(uploadRecordsWxmlFile)) {
  let content = fs.readFileSync(uploadRecordsWxmlFile, 'utf8')
  
  // 移除状态筛选测试面板
  content = content.replace(/    <!-- 🔧 新增：状态筛选测试面板 -->[\s\S]*?    <\/view>\n/, '')
  
  fs.writeFileSync(uploadRecordsWxmlFile, content)
  console.log(`✅ 已清理: ${uploadRecordsWxmlFile}`)
}

console.log('\n🎉 状态筛选诊断工具清理完成！')
console.log('📋 已清理的内容:')
console.log('  • 删除了临时诊断工具文件')
console.log('  • 清理了上传记录页面中的诊断代码')
console.log('  • 移除了前端测试面板')
console.log('\n✅ 项目恢复到生产状态，保留了核心修复功能。') 