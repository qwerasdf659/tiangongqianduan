/**
 * 权限和审核问题诊断工具
 * 专门用于诊断13612227930账号的权限和审核管理问题
 */

const { request } = require('./api')

class PermissionDiagnostic {
  constructor() {
    this.app = getApp()
    this.results = []
  }

  /**
   * 完整诊断流程
   */
  async runFullDiagnostic() {
    console.log('🔍 开始权限和审核问题完整诊断...')
    
    this.results = []
    
    try {
      // 1. 检查用户基础信息
      await this.checkUserInfo()
      
      // 2. 检查权限状态
      await this.checkPermissionStatus()
      
      // 3. 检查审核管理API权限
      await this.checkMerchantApiPermission()
      
      // 4. 检查待审核列表API
      await this.checkPendingReviewsApi()
      
      // 5. 检查上传记录API
      await this.checkUploadRecordsApi()
      
      // 6. 生成诊断报告
      return this.generateDiagnosticReport()
      
    } catch (error) {
      console.error('❌ 诊断过程中出现错误:', error)
      this.addResult('FAIL', '诊断流程', `诊断过程失败: ${error.message}`)
      return this.generateDiagnosticReport()
    }
  }

  /**
   * 1. 检查用户基础信息
   */
  async checkUserInfo() {
    console.log('📋 1. 检查用户基础信息...')
    
    try {
      const userInfo = this.app.globalData.userInfo
      
      if (!userInfo) {
        this.addResult('FAIL', '用户信息', '全局用户信息为空，需要重新登录')
        return
      }
      
      const phone = userInfo.mobile || '未知'
      const maskedPhone = phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
      
      this.addResult('PASS', '用户基础信息', 
        `用户ID: ${userInfo.user_id}\n` +
        `手机号: ${maskedPhone}\n` +
        `积分: ${userInfo.total_points || 0}\n` +
        `is_admin: ${userInfo.is_admin}\n` +
        `is_merchant: ${userInfo.is_merchant}`
      )
      
      // 特别检查13612227930账号
      if (phone === '13612227930') {
        this.addResult('INFO', '目标账号确认', '✅ 确认是13612227930账号，继续深度诊断...')
      }
      
    } catch (error) {
      this.addResult('FAIL', '用户信息检查', `获取用户信息失败: ${error.message}`)
    }
  }

  /**
   * 2. 检查权限状态
   */
  async checkPermissionStatus() {
    console.log('🔐 2. 检查权限状态...')
    
    try {
      const userInfo = this.app.globalData.userInfo
      if (!userInfo) {
        this.addResult('FAIL', '权限检查', '用户信息缺失，无法检查权限')
        return
      }
      
      const { createPermissionManager } = require('./permission-manager')
      const permissionManager = createPermissionManager(userInfo)
      const permissionStatus = permissionManager.getPermissionStatus()
      
      let statusDetail = `权限模型: v2.0二元权限\n` +
        `is_admin: ${userInfo.is_admin}\n` +
        `is_merchant: ${userInfo.is_merchant}\n` +
        `isSuperAdmin: ${permissionStatus.isSuperAdmin}\n` +
        `可访问商家管理: ${permissionStatus.showMerchantEntrance}`
      
      if (permissionStatus.isSuperAdmin) {
        this.addResult('PASS', '权限状态', `✅ 超级管理员权限正常\n${statusDetail}`)
      } else {
        let missingPerms = []
        if (!userInfo.is_admin) missingPerms.push('管理员权限(is_admin)')
        if (!userInfo.is_merchant) missingPerms.push('商家权限(is_merchant)')
        
        this.addResult('FAIL', '权限状态', 
          `❌ 权限不足，缺少: ${missingPerms.join(', ')}\n${statusDetail}\n\n` +
          `🔧 解决方案: 需要后端设置该用户的 is_admin=true 和 is_merchant=true`
        )
      }
      
    } catch (error) {
      this.addResult('FAIL', '权限状态检查', `权限检查失败: ${error.message}`)
    }
  }

  /**
   * 3. 检查商家API权限
   */
  async checkMerchantApiPermission() {
    console.log('📡 3. 检查商家API权限...')
    
    try {
      const response = await request({
        url: '/merchant/statistics',
        method: 'GET',
        needAuth: true,
        showLoading: false
      })
      
      this.addResult('PASS', '商家API权限', '✅ 商家API权限正常，可以访问商家功能')
      
    } catch (error) {
      if (error.code === 403) {
        this.addResult('FAIL', '商家API权限', 
          `❌ 商家API权限不足 (HTTP 403)\n\n` +
          `原因: 后端验证该用户没有商家权限\n` +
          `解决方案: 需要后端设置该用户的 is_merchant=true`
        )
      } else if (error.code === 401) {
        this.addResult('FAIL', '商家API权限', 
          `❌ 用户认证失败 (HTTP 401)\n\n` +
          `原因: Token无效或过期\n` +
          `解决方案: 重新登录获取新Token`
        )
      } else {
        this.addResult('WARN', '商家API权限', `API调用异常: ${error.message}`)
      }
    }
  }

  /**
   * 4. 检查待审核列表API
   */
  async checkPendingReviewsApi() {
    console.log('📋 4. 检查待审核列表API...')
    
    try {
      const response = await request({
        url: '/merchant/pending-reviews',
        method: 'GET',
        data: { page: 1, page_size: 20 },
        needAuth: true,
        showLoading: false
      })
      
      if (response.code === 0) {
        const reviewsCount = response.data?.reviews?.length || 0
        const totalCount = response.data?.pagination?.total || 0
        
        this.addResult('PASS', '待审核列表API', 
          `✅ 待审核列表API正常\n` +
          `当前页记录数: ${reviewsCount}\n` +
          `总待审核数: ${totalCount}`
        )
        
        if (totalCount === 0) {
          this.addResult('INFO', '待审核数据', 
            `📝 当前没有待审核记录\n\n` +
            `可能原因:\n` +
            `1. 13612227930上传的照片确实还在等待审核\n` +
            `2. 照片上传失败，没有进入审核队列\n` +
            `3. 后端数据库中没有该用户的上传记录`
          )
        }
      } else {
        this.addResult('FAIL', '待审核列表API', `API返回错误: ${response.msg}`)
      }
      
    } catch (error) {
      if (error.code === 403) {
        this.addResult('FAIL', '待审核列表API', 
          `❌ 待审核列表API权限不足\n\n` +
          `这确认了权限问题：该用户无法访问商家审核功能`
        )
      } else {
        this.addResult('FAIL', '待审核列表API', `API调用失败: ${error.message}`)
      }
    }
  }

  /**
   * 5. 检查上传记录API
   */
  async checkUploadRecordsApi() {
    console.log('📷 5. 检查上传记录API...')
    
    try {
      const response = await request({
        url: '/photo/history',
        method: 'GET',
        data: { page: 1, limit: 20, status: 'all' },
        needAuth: true,
        showLoading: false
      })
      
      if (response.code === 0) {
        const records = response.data?.records || []
        const totalCount = response.data?.pagination?.total || 0
        
        this.addResult('PASS', '上传记录API', 
          `✅ 上传记录API正常\n` +
          `当前页记录数: ${records.length}\n` +
          `总上传记录数: ${totalCount}`
        )
        
        // 分析上传记录状态
        if (records.length > 0) {
          const statusCounts = records.reduce((acc, record) => {
            const status = record.review_status || record.status || 'unknown'
            acc[status] = (acc[status] || 0) + 1
            return acc
          }, {})
          
          let statusInfo = '📊 上传记录状态统计:\n'
          Object.entries(statusCounts).forEach(([status, count]) => {
            statusInfo += `${status}: ${count}条\n`
          })
          
          this.addResult('INFO', '上传记录分析', statusInfo)
          
          // 检查是否有pending状态的记录
          const pendingRecords = records.filter(r => 
            (r.review_status === 'pending' || r.status === 'pending')
          )
          
          if (pendingRecords.length > 0) {
            this.addResult('INFO', '待审核记录发现', 
              `🔍 发现${pendingRecords.length}条待审核记录\n\n` +
              `这说明用户确实上传了照片，问题可能是:\n` +
              `1. 商家管理页面权限不足，无法显示\n` +
              `2. 商家API权限问题，无法获取待审核列表`
            )
          }
        } else {
          this.addResult('INFO', '上传记录分析', 
            `📝 该用户没有上传记录\n\n` +
            `这说明:\n` +
            `1. 用户可能没有成功上传照片\n` +
            `2. 或者上传失败，没有保存到数据库`
          )
        }
      } else {
        this.addResult('FAIL', '上传记录API', `API返回错误: ${response.msg}`)
      }
      
    } catch (error) {
      this.addResult('FAIL', '上传记录API', `API调用失败: ${error.message}`)
    }
  }

  /**
   * 生成诊断报告
   */
  generateDiagnosticReport() {
    console.log('📋 生成诊断报告...')
    
    const report = {
      timestamp: new Date().toISOString(),
      results: this.results,
      summary: this.generateSummary()
    }
    
    return report
  }

  /**
   * 生成问题总结
   */
  generateSummary() {
    const failCount = this.results.filter(r => r.status === 'FAIL').length
    const passCount = this.results.filter(r => r.status === 'PASS').length
    
    let summary = {
      isPrimaryFrontendIssue: false,
      isPrimaryBackendIssue: false,
      isPermissionIssue: false,
      isDataIssue: false,
      recommendations: []
    }
    
    // 分析权限问题
    const permissionFailures = this.results.filter(r => 
      r.category.includes('权限') && r.status === 'FAIL'
    )
    
    if (permissionFailures.length > 0) {
      summary.isPermissionIssue = true
      summary.isPrimaryBackendIssue = true
      summary.recommendations.push(
        '🔧 后端解决方案: 设置用户13612227930的权限字段 is_admin=true 和 is_merchant=true'
      )
    }
    
    // 分析API权限问题
    const apiFailures = this.results.filter(r => 
      r.category.includes('API') && r.status === 'FAIL'
    )
    
    if (apiFailures.length > 0) {
      summary.isPrimaryBackendIssue = true
      summary.recommendations.push(
        '📡 后端解决方案: 检查商家权限验证逻辑，确保用户有正确的API访问权限'
      )
    }
    
    // 分析数据问题
    const noUploadRecords = this.results.some(r => 
      r.category.includes('上传记录') && r.message.includes('没有上传记录')
    )
    
    if (noUploadRecords) {
      summary.isDataIssue = true
      summary.isPrimaryBackendIssue = true
      summary.recommendations.push(
        '🗄️ 数据库解决方案: 检查upload_reviews表，确认用户的上传记录是否正确保存'
      )
    }
    
    // 总结结论
    if (summary.isPrimaryBackendIssue) {
      summary.conclusion = '🚨 这是后端/数据库问题，需要后端程序员处理'
    } else if (summary.isPrimaryFrontendIssue) {
      summary.conclusion = '🔧 这是前端问题，可以在当前项目中修复'
    } else {
      summary.conclusion = '🔍 需要进一步分析，建议检查后端服务状态'
    }
    
    return summary
  }

  /**
   * 添加诊断结果
   */
  addResult(status, category, message) {
    this.results.push({
      status,      // PASS, FAIL, WARN, INFO
      category,
      message,
      timestamp: new Date().toISOString()
    })
    
    const icon = {
      'PASS': '✅',
      'FAIL': '❌', 
      'WARN': '⚠️',
      'INFO': 'ℹ️'
    }[status]
    
    console.log(`${icon} [${category}] ${message}`)
  }

  /**
   * 显示诊断结果对话框
   */
  showDiagnosticDialog(report) {
    const { summary } = report
    
    let title = '🔍 权限诊断报告'
    let content = summary.conclusion + '\n\n'
    
    if (summary.recommendations.length > 0) {
      content += '解决建议:\n'
      summary.recommendations.forEach(rec => {
        content += rec + '\n'
      })
    }
    
    const failCount = report.results.filter(r => r.status === 'FAIL').length
    const passCount = report.results.filter(r => r.status === 'PASS').length
    
    content += `\n检查统计: ${passCount}项通过, ${failCount}项失败`
    
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '查看详细报告',
      success: () => {
        this.showDetailedReport(report)
      }
    })
  }

  /**
   * 显示详细报告
   */
  showDetailedReport(report) {
    let content = '📋 详细诊断结果:\n\n'
    
    report.results.forEach((result, index) => {
      const icon = {
        'PASS': '✅',
        'FAIL': '❌',
        'WARN': '⚠️', 
        'INFO': 'ℹ️'
      }[result.status]
      
      content += `${icon} ${result.category}\n${result.message}\n\n`
    })
    
    wx.showModal({
      title: '📊 完整诊断报告',
      content: content.length > 1000 ? content.substring(0, 1000) + '...' : content,
      showCancel: false,
      confirmText: '知道了'
    })
  }
}

/**
 * 快速诊断13612227930账号问题
 */
const diagnosePage = {
  /**
   * 在商家管理页面运行诊断
   */
  async runMerchantPageDiagnostic() {
    const diagnostic = new PermissionDiagnostic()
    
    wx.showLoading({
      title: '正在诊断问题...',
      mask: true
    })
    
    try {
      const report = await diagnostic.runFullDiagnostic()
      
      wx.hideLoading()
      diagnostic.showDiagnosticDialog(report)
      
      return report
      
    } catch (error) {
      wx.hideLoading()
      
      wx.showModal({
        title: '🚨 诊断失败',
        content: `诊断过程中出现错误:\n${error.message}\n\n请检查网络连接和后端服务状态`,
        showCancel: false
      })
      
      console.error('❌ 诊断失败:', error)
      return null
    }
  }
}

module.exports = {
  PermissionDiagnostic,
  diagnosePage
} 