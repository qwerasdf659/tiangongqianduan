// utils/network-diagnostic.js - 网络诊断工具
const app = getApp()

/**
 * 🔍 网络诊断工具 - 快速识别前端/后端问题
 * 
 * 基于用户规则：
 * - 明确区分前端和后端问题
 * - 提供详细的错误信息和解决建议
 * - 不允许生成模拟结果
 */
class NetworkDiagnostic {
  constructor() {
    this.diagnosticResults = []
    this.isRunning = false
  }

  /**
   * 🔴 运行完整网络诊断
   */
  async runFullDiagnostic() {
    if (this.isRunning) {
      console.log('🔍 诊断正在运行中...')
      return
    }

    this.isRunning = true
    this.diagnosticResults = []

    wx.showLoading({
      title: '🔍 诊断网络问题...',
      mask: true
    })

    try {
      // 1. 检查网络连接
      await this.checkNetworkConnection()
      
      // 2. 检查API服务
      await this.checkAPIService()
      
      // 3. 检查WebSocket服务
      await this.checkWebSocketService()
      
      // 4. 生成诊断报告
      this.generateDiagnosticReport()
      
    } catch (error) {
      console.error('❌ 诊断过程出错:', error)
      this.addResult('ERROR', '诊断工具异常', error.message)
    } finally {
      this.isRunning = false
      wx.hideLoading()
    }
  }

  /**
   * 检查网络连接
   */
  async checkNetworkConnection() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          if (res.networkType === 'none') {
            this.addResult('FAIL', '网络连接', '设备未连接到网络')
          } else {
            this.addResult('PASS', '网络连接', `网络类型：${res.networkType}`)
          }
          resolve()
        },
        fail: () => {
          this.addResult('FAIL', '网络连接', '无法获取网络状态')
          resolve()
        }
      })
    })
  }

  /**
   * 检查API服务
   */
  async checkAPIService() {
    const config = app.globalData
    const apiUrl = config.baseUrl

    return new Promise((resolve) => {
      wx.request({
        url: apiUrl + '/config',
        method: 'GET',
        timeout: 5000,
        success: (res) => {
          if (res.statusCode === 200) {
            this.addResult('PASS', 'API服务', `API服务正常 (${res.statusCode})`)
          } else if (res.statusCode === 503) {
            this.addResult('FAIL', 'API服务', `🚨 后端服务不可用 (HTTP 503)\n\n这是后端问题！需要联系后端程序员处理：\n• 检查服务器状态\n• 确认API服务是否启动\n• 检查服务器负载`)
          } else {
            this.addResult('FAIL', 'API服务', `API服务异常 (${res.statusCode})`)
          }
          resolve()
        },
        fail: (err) => {
          if (err.errMsg && err.errMsg.includes('timeout')) {
            this.addResult('FAIL', 'API服务', `🚨 API服务超时\n\n这是后端问题！可能原因：\n• 服务器响应慢\n• 网络连接问题\n• 服务器过载`)
          } else {
            this.addResult('FAIL', 'API服务', `🚨 API服务连接失败\n\n这是后端问题！错误信息：${err.errMsg}`)
          }
          resolve()
        }
      })
    })
  }

  /**
   * 检查WebSocket服务
   */
  async checkWebSocketService() {
    const config = app.globalData
    const wsUrl = config.wsUrl

    if (!wsUrl) {
      this.addResult('SKIP', 'WebSocket服务', 'WebSocket服务未配置')
      return
    }

    return new Promise((resolve) => {
      let ws = null
      let timeout = null

      // 设置超时
      timeout = setTimeout(() => {
        if (ws) {
          ws.close()
        }
        this.addResult('FAIL', 'WebSocket服务', `🚨 WebSocket服务连接超时\n\n这是后端问题！可能原因：\n• WebSocket服务未启动\n• 防火墙阻塞\n• 网络连接问题`)
        resolve()
      }, 5000)

      try {
        ws = wx.connectSocket({
          url: wsUrl + '?test=1',
          protocols: ['wss']
        })

        ws.onOpen(() => {
          clearTimeout(timeout)
          this.addResult('PASS', 'WebSocket服务', 'WebSocket服务正常')
          ws.close()
          resolve()
        })

        ws.onError((err) => {
          clearTimeout(timeout)
          this.addResult('FAIL', 'WebSocket服务', `🚨 WebSocket服务连接失败\n\n这是后端问题！错误信息：${err.errMsg}`)
          resolve()
        })

        ws.onClose((res) => {
          clearTimeout(timeout)
          if (res.code === 1000) {
            // 正常关闭
            this.addResult('PASS', 'WebSocket服务', 'WebSocket服务正常')
          } else {
            this.addResult('FAIL', 'WebSocket服务', `🚨 WebSocket服务异常关闭 (${res.code})\n\n这是后端问题！`)
          }
          resolve()
        })

      } catch (error) {
        clearTimeout(timeout)
        this.addResult('FAIL', 'WebSocket服务', `🚨 WebSocket服务创建失败\n\n这是后端问题！错误信息：${error.message}`)
        resolve()
      }
    })
  }

  /**
   * 添加诊断结果
   */
  addResult(status, category, message) {
    this.diagnosticResults.push({
      status,
      category,
      message,
      timestamp: new Date().toLocaleString()
    })
  }

  /**
   * 生成诊断报告
   */
  generateDiagnosticReport() {
    const passCount = this.diagnosticResults.filter(r => r.status === 'PASS').length
    const failCount = this.diagnosticResults.filter(r => r.status === 'FAIL').length
    const skipCount = this.diagnosticResults.filter(r => r.status === 'SKIP').length

    let reportTitle = '🔍 网络诊断报告'
    let reportContent = `诊断时间：${new Date().toLocaleString()}\n\n`
    
    // 统计信息
    reportContent += `📊 诊断统计：\n✅ 正常：${passCount}项\n❌ 异常：${failCount}项\n⏭️ 跳过：${skipCount}项\n\n`
    
    // 详细结果
    reportContent += '📋 详细结果：\n'
    this.diagnosticResults.forEach((result, index) => {
      const statusIcon = result.status === 'PASS' ? '✅' : 
                        result.status === 'FAIL' ? '❌' : '⏭️'
      reportContent += `${statusIcon} ${result.category}：\n${result.message}\n\n`
    })

    // 问题判断
    const hasBackendIssues = this.diagnosticResults.some(r => 
      r.status === 'FAIL' && r.message.includes('后端问题')
    )

    if (hasBackendIssues) {
      reportTitle += ' - 发现后端问题'
      reportContent += '🚨 结论：这是后端服务问题！\n\n'
      reportContent += '👨‍💻 建议联系后端程序员：\n'
      reportContent += '• 检查服务器状态\n'
      reportContent += '• 确认API和WebSocket服务是否正常运行\n'
      reportContent += '• 检查服务器负载和配置\n'
      reportContent += '• 查看服务器日志\n'
    } else if (failCount === 0) {
      reportTitle += ' - 网络正常'
      reportContent += '✅ 结论：网络连接正常！\n'
    } else {
      reportTitle += ' - 需要进一步排查'
      reportContent += '⚠️ 结论：发现网络问题，需要进一步排查\n'
    }

    // 显示报告
    wx.showModal({
      title: reportTitle,
      content: reportContent,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: hasBackendIssues ? '#ff4444' : '#007aff'
    })

    // 控制台输出详细报告
    console.log('🔍 完整诊断报告:', {
      summary: { passCount, failCount, skipCount },
      results: this.diagnosticResults,
      hasBackendIssues,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * 快速503错误诊断
   */
  static show503ErrorHelp() {
    wx.showModal({
      title: '🚨 HTTP 503 错误说明',
      content: `这是后端服务器问题！\n\n🔍 问题分析：\n• HTTP 503 = Service Unavailable\n• 服务器暂时无法处理请求\n\n💡 可能原因：\n• 服务器维护中\n• 服务器过载\n• 后端API服务未启动\n• 数据库连接问题\n\n👨‍💻 解决方案：\n请联系后端程序员检查服务器状态！`,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff4444'
    })
  }

  /**
   * 快速WebSocket错误诊断
   */
  static showWebSocketErrorHelp() {
    wx.showModal({
      title: '🚨 WebSocket 连接错误说明',
      content: `这是后端服务器问题！\n\n🔍 问题分析：\n• WebSocket连接失败\n• 可能是后端WebSocket服务问题\n\n💡 可能原因：\n• WebSocket服务未启动\n• 防火墙阻塞\n• 网络连接问题\n• 服务器配置错误\n\n👨‍💻 解决方案：\n请联系后端程序员检查WebSocket服务状态！`,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff4444'
    })
  }
}

// 导出诊断工具
module.exports = NetworkDiagnostic 