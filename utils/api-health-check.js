// utils/api-health-check.js - API健康检查工具
const envConfig = require('../config/env.js')

/**
 * 🔍 API健康检查工具 - 验证API服务状态
 * 
 * 基于用户规则：
 * - 明确区分前端和后端问题
 * - 快速诊断API服务可用性
 * - 提供问题解决建议
 */
class ApiHealthCheck {
  constructor() {
    this.config = envConfig.getConfig()
    this.checkResults = []
  }

  /**
   * 🔴 快速健康检查
   */
  async quickHealthCheck() {
    console.log('🔍 开始API健康检查...')
    
    wx.showLoading({
      title: '检查API状态...',
      mask: true
    })

    try {
      // 1. 检查配置API
      await this.checkConfigAPI()
      
      // 2. 检查上传历史API  
      await this.checkUploadHistoryAPI()
      
      // 3. 生成检查报告
      this.generateHealthReport()
      
    } catch (error) {
      console.error('❌ 健康检查失败:', error)
      this.handleCheckError(error)
    } finally {
      wx.hideLoading()
    }
  }

  /**
   * 检查配置API
   */
  async checkConfigAPI() {
    return new Promise((resolve) => {
      wx.request({
        url: this.config.baseUrl + '/config',
        method: 'GET',
        timeout: 5000,
        success: (res) => {
          if (res.statusCode === 200) {
            this.addCheckResult('PASS', '配置API', `API服务正常 (${res.statusCode})`)
          } else if (res.statusCode === 503) {
            this.addCheckResult('FAIL', '配置API', `🚨 后端服务不可用 (HTTP 503)\n\n这是后端问题！`)
          } else {
            this.addCheckResult('FAIL', '配置API', `API异常 (${res.statusCode})`)
          }
          resolve()
        },
        fail: (err) => {
          this.addCheckResult('FAIL', '配置API', `🚨 API连接失败: ${err.errMsg}`)
          resolve()
        }
      })
    })
  }

  /**
   * 检查上传历史API（需要认证）
   */
  async checkUploadHistoryAPI() {
    const app = getApp()
    
    if (!app.globalData.accessToken) {
      this.addCheckResult('SKIP', '上传历史API', '用户未登录，跳过认证API检查')
      return
    }

    return new Promise((resolve) => {
      wx.request({
        url: this.config.baseUrl + '/photo/history',
        method: 'GET',
        header: {
          'Authorization': `Bearer ${app.globalData.accessToken}`,
          'Content-Type': 'application/json'
        },
        data: { page: 1, limit: 1, status: 'all' },
        timeout: 5000,
        success: (res) => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(res.data)
              if (data.code === 0) {
                this.addCheckResult('PASS', '上传历史API', `API正常，返回${data.data?.records?.length || 0}条记录`)
              } else {
                this.addCheckResult('WARN', '上传历史API', `API返回业务错误: ${data.msg}`)
              }
            } catch (err) {
              this.addCheckResult('FAIL', '上传历史API', `API响应解析失败: ${err.message}`)
            }
          } else if (res.statusCode === 503) {
            this.addCheckResult('FAIL', '上传历史API', `🚨 后端服务不可用 (HTTP 503)\n\n这是后端问题！`)
          } else {
            this.addCheckResult('FAIL', '上传历史API', `API异常 (${res.statusCode})`)
          }
          resolve()
        },
        fail: (err) => {
          this.addCheckResult('FAIL', '上传历史API', `🚨 API连接失败: ${err.errMsg}`)
          resolve()
        }
      })
    })
  }

  /**
   * 添加检查结果
   */
  addCheckResult(status, category, message) {
    this.checkResults.push({
      status,
      category,
      message,
      timestamp: new Date().toLocaleString()
    })
  }

  /**
   * 生成健康检查报告
   */
  generateHealthReport() {
    const passCount = this.checkResults.filter(r => r.status === 'PASS').length
    const failCount = this.checkResults.filter(r => r.status === 'FAIL').length
    const warnCount = this.checkResults.filter(r => r.status === 'WARN').length
    const skipCount = this.checkResults.filter(r => r.status === 'SKIP').length

    // 判断是否有后端问题
    const hasBackendIssues = this.checkResults.some(r => 
      r.status === 'FAIL' && r.message.includes('后端问题')
    )

    let reportTitle = '🔍 API健康检查报告'
    let reportContent = `检查时间：${new Date().toLocaleString()}\n`
    reportContent += `API地址：${this.config.baseUrl}\n\n`
    
    // 统计信息
    reportContent += `📊 检查统计：\n✅ 正常：${passCount}项\n❌ 异常：${failCount}项\n⚠️ 警告：${warnCount}项\n⏭️ 跳过：${skipCount}项\n\n`
    
    // 详细结果
    reportContent += '📋 详细结果：\n'
    this.checkResults.forEach((result) => {
      const statusIcon = this.getStatusIcon(result.status)
      reportContent += `${statusIcon} ${result.category}：${result.message}\n\n`
    })

    // 问题诊断
    if (hasBackendIssues) {
      reportTitle += ' - 发现后端问题'
      reportContent += '🚨 诊断结论：后端API服务存在问题！\n\n'
      reportContent += '👨‍💻 建议联系后端程序员处理：\n'
      reportContent += '• 检查服务器状态\n'
      reportContent += '• 确认API服务是否正常运行\n'
      reportContent += '• 查看服务器日志\n'
      reportContent += '• 检查数据库连接\n'
    } else if (failCount === 0) {
      reportTitle += ' - API服务正常'
      reportContent += '✅ 诊断结论：API服务运行正常！\n\n'
      reportContent += '💡 上传记录问题可能的原因：\n'
      reportContent += '• 用户数据确实为空\n'
      reportContent += '• 数据库同步延迟\n'
      reportContent += '• 查询参数问题\n'
    } else {
      reportTitle += ' - 发现问题'
      reportContent += '⚠️ 诊断结论：API服务存在异常！\n'
    }

    // 显示报告
    wx.showModal({
      title: reportTitle,
      content: reportContent,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: hasBackendIssues ? '#ff4444' : '#007aff'
    })

    // 控制台输出
    console.log('🔍 API健康检查完成:', {
      summary: { passCount, failCount, warnCount, skipCount },
      hasBackendIssues,
      apiUrl: this.config.baseUrl,
      results: this.checkResults
    })
  }

  /**
   * 获取状态图标
   */
  getStatusIcon(status) {
    const icons = {
      'PASS': '✅',
      'FAIL': '❌', 
      'WARN': '⚠️',
      'SKIP': '⏭️'
    }
    return icons[status] || '❓'
  }

  /**
   * 处理检查错误
   */
  handleCheckError(error) {
    wx.showModal({
      title: '🚨 健康检查失败',
      content: `检查过程中出现错误：\n\n${error.message || '未知错误'}\n\n请稍后重试或联系技术支持。`,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff4444'
    })
  }

  /**
   * 静态方法：快速检查
   */
  static async quickCheck() {
    const checker = new ApiHealthCheck()
    await checker.quickHealthCheck()
  }
}

// 导出健康检查工具
module.exports = ApiHealthCheck 