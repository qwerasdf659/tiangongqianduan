// utils/cleanup-upload-debug.js - 清理上传记录调试工具
const fs = require('fs')
const path = require('path')

const CleanupUploadDebug = {
  
  /**
   * 清理所有上传记录调试相关的临时代码和文件
   */
  cleanup() {
    console.log('🧹 开始清理上传记录调试工具...')
    
    const cleanupTasks = [
      // 1. 删除调试工具文件
      {
        file: 'utils/upload-records-debug.js',
        action: 'delete'
      },
      
      // 2. 从页面JS文件中移除调试代码
      {
        file: 'pages/records/upload-records.js',
        action: 'edit',
        remove: [
          'const UploadRecordsDebug = require(\'../../utils/upload-records-debug\')', // 移除导入
          'async onDebugDiagnose()',  // 移除调试方法
          'async onDebugForceRefresh()',
          'onDebugShowToken()',
          '// 🔧 临时：诊断工具方法'
        ]
      },
      
      // 3. 从WXML文件中移除调试面板
      {
        file: 'pages/records/upload-records.wxml',
        action: 'edit',
        remove: [
          '<!-- 🔧 临时：调试工具面板 -->',
          '<view class="debug-panel"',
          'onDebugDiagnose',
          'onDebugForceRefresh', 
          'onDebugShowToken'
        ]
      }
    ]
    
    console.log('📋 清理任务列表:', cleanupTasks.map(task => ({
      file: task.file,
      action: task.action
    })))
    
    return cleanupTasks
  },
  
  /**
   * 显示清理说明
   */
  showCleanupInstructions() {
    const instructions = `
🧹 上传记录调试工具清理说明

问题修复完成后，请执行以下清理操作：

1. 删除调试工具文件：
   - utils/upload-records-debug.js
   - utils/cleanup-upload-debug.js

2. 从 pages/records/upload-records.js 中移除：
   - 第3行：const UploadRecordsDebug = require(...)
   - 底部的调试方法：onDebugDiagnose, onDebugForceRefresh, onDebugShowToken

3. 从 pages/records/upload-records.wxml 中移除：
   - 调试工具面板整个 <view class="debug-panel"> 区块

4. 保留的修复代码（请保留）：
   ✅ 多字段名支持：res.data.records || res.data.history || ...
   ✅ 强制刷新机制：forceRefresh 参数
   ✅ Token认证增强：详细错误处理
   ✅ 诊断日志：console.log 相关代码

清理完成后，功能将正常运行且代码更加简洁。
    `.trim()
    
    console.log('📖 清理说明:')
    console.log(instructions)
    
    return instructions
  }
}

module.exports = CleanupUploadDebug 