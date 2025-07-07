// utils/upload-records-debug.js - 上传记录问题诊断工具
const { uploadAPI } = require('./api.js')

const UploadRecordsDebug = {
  
  /**
   * 完整的上传记录问题诊断
   */
  async diagnoseUploadRecords() {
    console.log('🔍 开始诊断上传记录问题...')
    
    const app = getApp()
    const diagnosticResults = {
      timestamp: new Date().toISOString(),
      tokenStatus: {},
      apiTests: {},
      dataStructure: {},
      recommendations: []
    }
    
    // 1. Token状态检查
    diagnosticResults.tokenStatus = {
      hasAccessToken: !!app.globalData.accessToken,
      hasRefreshToken: !!app.globalData.refreshToken,
      isLoggedIn: app.globalData.isLoggedIn,
      tokenPreview: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : null,
      baseUrl: app.globalData.baseUrl
    }
    
    console.log('🔑 Token状态:', diagnosticResults.tokenStatus)
    
    // 2. API调用测试
    try {
      console.log('📡 测试统计API...')
      const statsResponse = await uploadAPI.getStatistics()
      diagnosticResults.apiTests.statistics = {
        success: true,
        code: statsResponse.code,
        hasData: !!statsResponse.data,
        dataKeys: statsResponse.data ? Object.keys(statsResponse.data) : [],
        totalUploads: statsResponse.data?.total_uploads || 0
      }
      console.log('✅ 统计API测试成功:', diagnosticResults.apiTests.statistics)
    } catch (error) {
      diagnosticResults.apiTests.statistics = {
        success: false,
        error: error.message,
        code: error.code
      }
      console.error('❌ 统计API测试失败:', error)
    }
    
    try {
      console.log('📡 测试历史记录API...')
      const historyResponse = await uploadAPI.getRecords(1, 20, 'all', true)
      diagnosticResults.apiTests.history = {
        success: true,
        code: historyResponse.code,
        hasData: !!historyResponse.data,
        dataKeys: historyResponse.data ? Object.keys(historyResponse.data) : [],
        response: historyResponse
      }
      
      // 3. 数据结构分析
      if (historyResponse.data) {
        const data = historyResponse.data
        diagnosticResults.dataStructure = {
          availableFields: Object.keys(data),
          records: data.records || [],
          history: data.history || [],
          recent_uploads: data.recent_uploads || [],
          data: data.data || [],
          total: data.total,
          total_count: data.total_count
        }
        
        // 找到实际的记录数组
        let actualRecords = []
        if (data.records && Array.isArray(data.records)) {
          actualRecords = data.records
          diagnosticResults.dataStructure.detectedField = 'records'
        } else if (data.history && Array.isArray(data.history)) {
          actualRecords = data.history
          diagnosticResults.dataStructure.detectedField = 'history'
        } else if (data.recent_uploads && Array.isArray(data.recent_uploads)) {
          actualRecords = data.recent_uploads
          diagnosticResults.dataStructure.detectedField = 'recent_uploads'
        } else if (data.data && Array.isArray(data.data)) {
          actualRecords = data.data
          diagnosticResults.dataStructure.detectedField = 'data'
        }
        
        diagnosticResults.dataStructure.actualRecordsCount = actualRecords.length
        diagnosticResults.dataStructure.firstRecord = actualRecords[0] || null
      }
      
      console.log('✅ 历史记录API测试成功:', diagnosticResults.apiTests.history)
      console.log('📊 数据结构分析:', diagnosticResults.dataStructure)
    } catch (error) {
      diagnosticResults.apiTests.history = {
        success: false,
        error: error.message,
        code: error.code,
        isTokenError: error.code === 2001,
        needsRelogin: error.needsRelogin
      }
      console.error('❌ 历史记录API测试失败:', error)
    }
    
    // 4. 生成建议
    if (!diagnosticResults.tokenStatus.hasAccessToken) {
      diagnosticResults.recommendations.push('Token缺失 - 需要重新登录')
    }
    
    if (diagnosticResults.apiTests.history?.success && diagnosticResults.dataStructure.actualRecordsCount === 0) {
      diagnosticResults.recommendations.push('API调用成功但数据为空 - 可能是数据库问题')
    }
    
    if (diagnosticResults.apiTests.history?.isTokenError) {
      diagnosticResults.recommendations.push('Token认证失败 - 需要刷新Token或重新登录')
    }
    
    if (diagnosticResults.apiTests.statistics?.success && diagnosticResults.apiTests.history?.success) {
      if (diagnosticResults.apiTests.statistics.totalUploads > 0 && diagnosticResults.dataStructure.actualRecordsCount === 0) {
        diagnosticResults.recommendations.push('统计数据与历史记录不一致 - 后端数据同步问题')
      }
    }
    
    return diagnosticResults
  },
  
  /**
   * 显示诊断结果
   */
  showDiagnosticResults(results) {
    const summary = `
诊断时间：${results.timestamp}

Token状态：${results.tokenStatus.hasAccessToken ? '✅ 正常' : '❌ 缺失'}
统计API：${results.apiTests.statistics?.success ? '✅ 正常' : '❌ 失败'}
历史API：${results.apiTests.history?.success ? '✅ 正常' : '❌ 失败'}

数据字段：${results.dataStructure.detectedField || '未检测到'}
记录数量：${results.dataStructure.actualRecordsCount || 0}

建议：${results.recommendations.join(', ') || '无特殊建议'}
    `.trim()
    
    wx.showModal({
      title: '🔍 上传记录诊断报告',
      content: summary,
      showCancel: false,
      confirmText: '知道了'
    })
    
    console.log('📋 完整诊断报告:', results)
    return results
  },
  
  /**
   * 一键诊断并显示结果
   */
  async runFullDiagnosis() {
    try {
      const results = await this.diagnoseUploadRecords()
      this.showDiagnosticResults(results)
      return results
    } catch (error) {
      console.error('❌ 诊断过程失败:', error)
      wx.showModal({
        title: '❌ 诊断失败',
        content: `诊断过程中出现错误：${error.message}`,
        showCancel: false,
        confirmText: '知道了'
      })
      return null
    }
  }
}

module.exports = UploadRecordsDebug 