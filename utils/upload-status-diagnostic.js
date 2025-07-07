// utils/upload-status-diagnostic.js - 上传记录状态筛选诊断工具
const { uploadAPI } = require('./api')

const UploadStatusDiagnostic = {
  
  /**
   * 🔍 完整的状态筛选功能诊断
   */
  async runFullDiagnosis() {
    console.log('🔍 开始上传记录状态筛选功能诊断...')
    
    const results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        issues: []
      }
    }
    
    // 测试1：全部记录
    await this.testStatusFilter('all', '全部记录', results)
    
    // 测试2：待审核记录
    await this.testStatusFilter('pending', '待审核记录', results)
    
    // 测试3：已通过记录 - 重点测试
    await this.testStatusFilter('approved', '已通过记录', results)
    
    // 测试4：已拒绝记录 - 重点测试
    await this.testStatusFilter('rejected', '已拒绝记录', results)
    
    // 测试5：统计数据验证
    await this.testStatistics(results)
    
    // 生成诊断报告
    this.generateReport(results)
    
    return results
  },
  
  /**
   * 🧪 测试特定状态的筛选功能
   */
  async testStatusFilter(status, description, results) {
    console.log(`🧪 测试 ${description} (status: ${status})...`)
    
    const test = {
      name: description,
      status: status,
      success: false,
      error: null,
      data: null,
      analysis: {}
    }
    
    try {
      // 调用API获取数据
      const response = await uploadAPI.getRecords(1, 20, status, true)
      
      test.data = response.data
      test.success = response.code === 0
      
      if (test.success) {
        // 分析返回数据
        const records = response.data.records || response.data.history || response.data.recent_uploads || response.data.data || []
        
        test.analysis = {
          totalRecords: records.length,
          statusDistribution: this.analyzeStatusDistribution(records),
          sampleRecord: records[0] || null,
          filterAccuracy: this.checkFilterAccuracy(records, status)
        }
        
        console.log(`✅ ${description} 测试通过:`, test.analysis)
        results.summary.passedTests++
      } else {
        test.error = response.msg || '未知错误'
        console.error(`❌ ${description} 测试失败:`, test.error)
        results.summary.failedTests++
        results.summary.issues.push(`${description}: ${test.error}`)
      }
      
    } catch (error) {
      test.success = false
      test.error = error.msg || error.message || '请求失败'
      console.error(`❌ ${description} 测试异常:`, error)
      results.summary.failedTests++
      results.summary.issues.push(`${description}: ${test.error}`)
    }
    
    results.tests.push(test)
    results.summary.totalTests++
  },
  
  /**
   * 📊 分析记录的状态分布
   */
  analyzeStatusDistribution(records) {
    const distribution = {}
    
    records.forEach(record => {
      const status = record.status || 'unknown'
      distribution[status] = (distribution[status] || 0) + 1
    })
    
    return distribution
  },
  
  /**
   * 🎯 检查筛选结果的准确性
   */
  checkFilterAccuracy(records, expectedStatus) {
    if (expectedStatus === 'all') {
      return { accurate: true, message: '全部记录不需要筛选验证' }
    }
    
    const wrongRecords = records.filter(record => record.status !== expectedStatus)
    
    if (wrongRecords.length === 0) {
      return { accurate: true, message: '筛选结果完全准确' }
    } else {
      return { 
        accurate: false, 
        message: `发现 ${wrongRecords.length} 条不符合筛选条件的记录`,
        wrongRecords: wrongRecords.map(r => ({
          id: r.id,
          expected: expectedStatus,
          actual: r.status
        }))
      }
    }
  },
  
  /**
   * 📊 测试统计数据
   */
  async testStatistics(results) {
    console.log('📊 测试统计数据...')
    
    const test = {
      name: '统计数据验证',
      success: false,
      error: null,
      data: null,
      analysis: {}
    }
    
    try {
      const response = await uploadAPI.getStatistics()
      
      test.data = response.data
      test.success = response.code === 0
      
      if (test.success) {
        test.analysis = {
          totalCount: response.data.total_count || 0,
          pendingCount: response.data.pending_count || 0,
          approvedCount: response.data.approved_count || 0,
          rejectedCount: response.data.rejected_count || 0,
          hasValidData: (response.data.total_count || 0) > 0
        }
        
        console.log('✅ 统计数据测试通过:', test.analysis)
        results.summary.passedTests++
      } else {
        test.error = response.msg || '统计数据获取失败'
        console.error('❌ 统计数据测试失败:', test.error)
        results.summary.failedTests++
        results.summary.issues.push(`统计数据: ${test.error}`)
      }
      
    } catch (error) {
      test.success = false
      test.error = error.msg || error.message || '统计数据请求失败'
      console.error('❌ 统计数据测试异常:', error)
      results.summary.failedTests++
      results.summary.issues.push(`统计数据: ${test.error}`)
    }
    
    results.tests.push(test)
    results.summary.totalTests++
  },
  
  /**
   * 📋 生成诊断报告
   */
  generateReport(results) {
    const { summary } = results
    
    console.log('\n📋 ===== 上传记录状态筛选诊断报告 =====')
    console.log(`🕐 诊断时间: ${results.timestamp}`)
    console.log(`🧪 总测试数: ${summary.totalTests}`)
    console.log(`✅ 通过测试: ${summary.passedTests}`)
    console.log(`❌ 失败测试: ${summary.failedTests}`)
    console.log(`📊 成功率: ${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%`)
    
    if (summary.issues.length > 0) {
      console.log('\n🚨 发现的问题:')
      summary.issues.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`)
      })
    }
    
    // 🔍 深度分析：问题根源判断
    this.analyzeRootCause(results)
  },
  
  /**
   * 🔍 分析问题根源
   */
  analyzeRootCause(results) {
    console.log('\n🔍 ===== 问题根源分析 =====')
    
    const approvedTest = results.tests.find(t => t.status === 'approved')
    const rejectedTest = results.tests.find(t => t.status === 'rejected')
    
    // 分析"已通过"功能
    if (approvedTest && !approvedTest.success) {
      console.log('❌ "已通过"功能异常:')
      console.log(`   错误: ${approvedTest.error}`)
      this.diagnoseProblemType(approvedTest.error, 'approved')
    } else if (approvedTest && approvedTest.success) {
      console.log('✅ "已通过"功能正常')
      if (approvedTest.analysis.filterAccuracy && !approvedTest.analysis.filterAccuracy.accurate) {
        console.log('⚠️  但筛选准确性存在问题:', approvedTest.analysis.filterAccuracy.message)
      }
    }
    
    // 分析"已拒绝"功能
    if (rejectedTest && !rejectedTest.success) {
      console.log('❌ "已拒绝"功能异常:')
      console.log(`   错误: ${rejectedTest.error}`)
      this.diagnoseProblemType(rejectedTest.error, 'rejected')
    } else if (rejectedTest && rejectedTest.success) {
      console.log('✅ "已拒绝"功能正常')
      if (rejectedTest.analysis.filterAccuracy && !rejectedTest.analysis.filterAccuracy.accurate) {
        console.log('⚠️  但筛选准确性存在问题:', rejectedTest.analysis.filterAccuracy.message)
      }
    }
  },
  
  /**
   * 🔧 诊断问题类型
   */
  diagnoseProblemType(error, status) {
    console.log(`\n🔧 "${status}"状态筛选问题诊断:`)
    
    if (error.includes('Token') || error.includes('2001') || error.includes('401')) {
      console.log('   🔑 问题类型: 认证问题')
      console.log('   🏷️  责任方: 前端 + 后端')
      console.log('   💡 解决方案: 检查Token状态和认证流程')
    } else if (error.includes('404') || error.includes('接口不存在')) {
      console.log('   🔗 问题类型: API路径错误')
      console.log('   🏷️  责任方: 后端')
      console.log('   💡 解决方案: 检查后端API路由配置')
    } else if (error.includes('500') || error.includes('服务器内部错误')) {
      console.log('   🚨 问题类型: 后端服务错误')
      console.log('   🏷️  责任方: 后端')
      console.log('   💡 解决方案: 检查后端服务和数据库')
    } else if (error.includes('参数') || error.includes('status')) {
      console.log('   📝 问题类型: 参数传递问题')
      console.log('   🏷️  责任方: 前端 + 后端')
      console.log('   💡 解决方案: 检查前端参数传递和后端参数解析')
    } else {
      console.log('   ❓ 问题类型: 未知错误')
      console.log('   🏷️  责任方: 需要进一步诊断')
      console.log('   💡 解决方案: 查看详细错误日志')
    }
  },
  
  /**
   * 🚀 一键修复常见问题
   */
  async quickFix() {
    console.log('🚀 开始一键修复常见问题...')
    
    // 清理缓存
    try {
      wx.removeStorageSync('upload_records_cache')
      console.log('✅ 已清理上传记录缓存')
    } catch (error) {
      console.log('⚠️  清理缓存失败:', error)
    }
    
    // 强制刷新Token
    try {
      const app = getApp()
      if (app.globalData.refreshToken) {
        await app.refreshToken()
        console.log('✅ 已刷新访问令牌')
      } else {
        console.log('⚠️  没有刷新令牌，跳过Token刷新')
      }
    } catch (error) {
      console.log('⚠️  Token刷新失败:', error)
    }
    
    console.log('🎯 一键修复完成，请重新测试功能')
  }
}

module.exports = UploadStatusDiagnostic 