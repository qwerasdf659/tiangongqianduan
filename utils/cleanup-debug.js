// utils/cleanup-debug.js - 清理调试工具脚本
const fs = require('fs')
const path = require('path')

class DebugCleanup {
  constructor() {
    this.cleanupItems = [
      {
        file: 'utils/token-repair.js',
        action: 'delete',
        description: 'Token修复工具（临时）'
      },
      {
        file: 'utils/api-health-check.js',
        action: 'delete',
        description: 'API健康检查工具（临时）'
      },
      {
        file: 'utils/network-diagnostic.js',
        action: 'delete',
        description: '网络诊断工具（临时）'
      },
      {
        file: 'utils/config-validator.js',
        action: 'delete',
        description: '配置验证工具（临时）'
      },
      {
        file: 'utils/startup-check.js',
        action: 'delete',
        description: '启动检查脚本（临时）'
      },
      {
        file: 'utils/cleanup-debug.js',
        action: 'delete',
        description: '清理工具本身（临时）'
      },
      {
        file: 'utils/check-restart-needed.js',
        action: 'delete',
        description: '重启检查工具（临时）'
      }
    ]
  }

  /**
   * 执行清理操作
   */
  cleanup() {
    console.log('🧹 开始清理临时调试工具...')
    
    let deletedCount = 0
    let skippedCount = 0
    
    this.cleanupItems.forEach(item => {
      try {
        if (fs.existsSync(item.file)) {
          fs.unlinkSync(item.file)
          console.log(`✅ 已删除: ${item.file} (${item.description})`)
          deletedCount++
        } else {
          console.log(`⚠️ 文件不存在: ${item.file}`)
          skippedCount++
        }
      } catch (error) {
        console.error(`❌ 删除失败: ${item.file} - ${error.message}`)
        skippedCount++
      }
    })
    
    console.log(`\n🧹 清理完成:`)
    console.log(`   删除文件: ${deletedCount}`)
    console.log(`   跳过文件: ${skippedCount}`)
    console.log(`   总计处理: ${this.cleanupItems.length}`)
  }

  /**
   * 移除调试界面代码
   */
  removeDebugUI() {
    console.log('🧹 清理调试界面代码...')
    
    // 清理拍照页面的调试按钮
    const cameraWxmlPath = 'pages/camera/camera.wxml'
    const cameraJsPath = 'pages/camera/camera.js'
    
    try {
      // 从wxml移除调试面板
      if (fs.existsSync(cameraWxmlPath)) {
        let wxmlContent = fs.readFileSync(cameraWxmlPath, 'utf8')
        
        // 移除调试面板
        const debugPanelStart = '<!-- 🔧 临时调试面板 -->'
        const debugPanelEnd = '</view>\n  </view>'
        
        const startIndex = wxmlContent.indexOf(debugPanelStart)
        if (startIndex !== -1) {
          const endIndex = wxmlContent.indexOf(debugPanelEnd, startIndex)
          if (endIndex !== -1) {
            wxmlContent = wxmlContent.substring(0, startIndex) + 
                         wxmlContent.substring(endIndex + debugPanelEnd.length)
            
            fs.writeFileSync(cameraWxmlPath, wxmlContent)
            console.log('✅ 已从camera.wxml移除调试面板')
          }
        }
      }
      
      // 从js移除调试方法
      if (fs.existsSync(cameraJsPath)) {
        let jsContent = fs.readFileSync(cameraJsPath, 'utf8')
        
        // 移除TokenRepair引用
        jsContent = jsContent.replace(/const TokenRepair = require\('\.\.\/\.\.\/utils\/token-repair'\)[^\n]*/g, '')
        
        // 移除调试方法
        const debugMethods = [
          'onDebugApiCheck',
          'onDebugRefreshHistory', 
          'onDebugShowEnvironment',
          'onDebugTokenRepair',
          'handleTokenError'
        ]
        
        debugMethods.forEach(method => {
          const methodRegex = new RegExp(`\\s*\\/\\*\\*[\\s\\S]*?\\*\\/\\s*${method}\\([\\s\\S]*?\\},?`, 'g')
          jsContent = jsContent.replace(methodRegex, '')
        })
        
        fs.writeFileSync(cameraJsPath, jsContent)
        console.log('✅ 已从camera.js移除调试方法')
      }
      
    } catch (error) {
      console.error('❌ 清理调试界面失败:', error.message)
    }
  }

  /**
   * 完整清理
   */
  fullCleanup() {
    this.cleanup()
    this.removeDebugUI()
    console.log('\n🎉 调试工具清理完成！系统已恢复正常状态。')
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const cleanup = new DebugCleanup()
  cleanup.fullCleanup()
}

module.exports = DebugCleanup 