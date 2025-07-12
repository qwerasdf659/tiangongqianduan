// utils/field-mapping-validator.js - 前端数据字段映射验证工具
// 用于验证前端数据字段映射修复是否成功

/**
 * 🔧 字段映射验证器
 * 用于验证前端各页面的数据字段映射是否正确
 */
class FieldMappingValidator {
  constructor() {
    this.testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      testDetails: []
    }
  }

  /**
   * 🔍 验证用户信息字段映射
   */
  validateUserInfoMapping(rawData, mappedData) {
    const testResult = {
      testName: '用户信息字段映射',
      passed: true,
      issues: []
    }

    // 必需字段检查
    const requiredFields = [
      { mapped: 'user_id', raw: ['user_id', 'id'] },
      { mapped: 'mobile', raw: ['mobile', 'phone', 'phone_number'] },
      { mapped: 'nickname', raw: ['nickname', 'nickName', 'name'] },
      { mapped: 'total_points', raw: ['total_points', 'totalPoints', 'points'] },
      { mapped: 'is_admin', raw: ['is_admin', 'isAdmin'] },
      { mapped: 'avatar_url', raw: ['avatar_url', 'avatarUrl', 'avatar'] }
    ]

    requiredFields.forEach(field => {
      // 检查映射后的数据是否包含必需字段
      if (!mappedData.hasOwnProperty(field.mapped)) {
        testResult.passed = false
        testResult.issues.push(`缺少映射字段: ${field.mapped}`)
        return
      }

      // 检查映射是否正确（原始数据中至少有一个对应字段）
      const hasSourceField = field.raw.some(rawField => 
        rawData && rawData.hasOwnProperty(rawField)
      )
      
      if (hasSourceField) {
        const sourceValue = field.raw.find(rawField => 
          rawData.hasOwnProperty(rawField)
        )
        
        // 验证映射逻辑是否正确
        if (field.mapped === 'total_points') {
          // 积分字段特殊验证
          if (typeof mappedData[field.mapped] !== 'number') {
            testResult.passed = false
            testResult.issues.push(`${field.mapped}字段类型错误，应为number`)
          }
        } else if (field.mapped === 'is_admin') {
          // 权限字段特殊验证
          if (typeof mappedData[field.mapped] !== 'boolean') {
            testResult.passed = false
            testResult.issues.push(`${field.mapped}字段类型错误，应为boolean`)
          }
        }
      }
    })

    // 兼容字段检查
    const compatibilityFields = ['phone', 'avatar']
    compatibilityFields.forEach(field => {
      if (!mappedData.hasOwnProperty(field)) {
        testResult.issues.push(`建议添加兼容字段: ${field}`)
      }
    })

    this.addTestResult(testResult)
    return testResult
  }

  /**
   * 🔍 验证审核记录字段映射
   */
  validateReviewRecordMapping(rawData, mappedData) {
    const testResult = {
      testName: '审核记录字段映射',
      passed: true,
      issues: []
    }

    const requiredFields = [
      { mapped: 'upload_id', raw: ['upload_id', 'id'] },
      { mapped: 'user_phone', raw: ['user_info.mobile', 'mobile', 'phone'] },
      { mapped: 'user_id', raw: ['user_info.user_id', 'user_id'] },
      { mapped: 'receipt_image', raw: ['image_url', 'receipt_image'] },
      { mapped: 'upload_time', raw: ['uploaded_at', 'upload_time', 'created_at'] },
      { mapped: 'status', raw: ['status', 'review_status'] }
    ]

    requiredFields.forEach(field => {
      if (!mappedData.hasOwnProperty(field.mapped)) {
        testResult.passed = false
        testResult.issues.push(`缺少映射字段: ${field.mapped}`)
      }
    })

    this.addTestResult(testResult)
    return testResult
  }

  /**
   * 🔍 验证商品信息字段映射
   */
  validateProductMapping(rawData, mappedData) {
    const testResult = {
      testName: '商品信息字段映射',
      passed: true,
      issues: []
    }

    const requiredFields = [
      { mapped: 'id', raw: ['commodity_id', 'product_id', 'id'] },
      { mapped: 'name', raw: ['name', 'product_name'] },
      { mapped: 'exchange_points', raw: ['exchange_points', 'points', 'cost_points'] },
      { mapped: 'stock', raw: ['stock', 'inventory', 'quantity'] },
      { mapped: 'status', raw: ['status', 'state'] }
    ]

    requiredFields.forEach(field => {
      if (!mappedData.hasOwnProperty(field.mapped)) {
        testResult.passed = false
        testResult.issues.push(`缺少映射字段: ${field.mapped}`)
      }
    })

    this.addTestResult(testResult)
    return testResult
  }

  /**
   * 🔍 验证积分记录字段映射
   */
  validatePointsRecordMapping(rawData, mappedData) {
    const testResult = {
      testName: '积分记录字段映射',
      passed: true,
      issues: []
    }

    const requiredFields = [
      { mapped: 'id', raw: ['id', 'record_id'] },
      { mapped: 'points', raw: ['points', 'amount', 'point_amount'] },
      { mapped: 'type', raw: ['type', 'operation_type'] },
      { mapped: 'source', raw: ['source', 'source_type'] },
      { mapped: 'created_at', raw: ['created_at', 'createdAt', 'timestamp'] }
    ]

    requiredFields.forEach(field => {
      if (!mappedData.hasOwnProperty(field.mapped)) {
        testResult.passed = false
        testResult.issues.push(`缺少映射字段: ${field.mapped}`)
      }
    })

    this.addTestResult(testResult)
    return testResult
  }

  /**
   * 🔍 验证API响应数据结构
   */
  validateApiResponseStructure(apiResponse, expectedStructure) {
    const testResult = {
      testName: 'API响应数据结构验证',
      passed: true,
      issues: []
    }

    // 检查基本响应结构
    if (!apiResponse.hasOwnProperty('code')) {
      testResult.passed = false
      testResult.issues.push('缺少code字段')
    }

    if (!apiResponse.hasOwnProperty('msg')) {
      testResult.passed = false
      testResult.issues.push('缺少msg字段')
    }

    if (!apiResponse.hasOwnProperty('data')) {
      testResult.passed = false
      testResult.issues.push('缺少data字段')
    }

    // 检查数据字段结构
    if (expectedStructure && apiResponse.data) {
      expectedStructure.forEach(field => {
        if (!apiResponse.data.hasOwnProperty(field)) {
          testResult.issues.push(`data中缺少字段: ${field}`)
        }
      })
    }

    this.addTestResult(testResult)
    return testResult
  }

  /**
   * 🔍 验证数据过滤机制
   */
  validateDataFiltering(originalData, filteredData) {
    const testResult = {
      testName: '数据过滤机制验证',
      passed: true,
      issues: []
    }

    // 检查是否过度过滤
    Object.keys(originalData).forEach(key => {
      const originalValue = originalData[key]
      const filteredValue = filteredData[key]

      // 检查有效值是否被误过滤
      if (originalValue !== undefined && originalValue !== null) {
        if (filteredData.hasOwnProperty(key)) {
          // 值存在，检查是否正确保留
          if (originalValue === 0 || originalValue === false || originalValue === '') {
            // 这些是有效值，应该保留
            if (filteredValue !== originalValue) {
              testResult.issues.push(`有效值被错误修改: ${key} (${originalValue} -> ${filteredValue})`)
            }
          }
        } else {
          // 值被过滤了，检查是否应该保留
          if (originalValue !== undefined) {
            testResult.issues.push(`有效值被错误过滤: ${key} = ${originalValue}`)
          }
        }
      }
    })

    // 检查undefined值是否被正确过滤
    Object.keys(originalData).forEach(key => {
      if (originalData[key] === undefined && filteredData.hasOwnProperty(key)) {
        testResult.issues.push(`undefined值未被过滤: ${key}`)
      }
    })

    this.addTestResult(testResult)
    return testResult
  }

  /**
   * 📊 运行完整的字段映射测试
   */
  runCompleteTest(testData) {
    console.log('🔍 开始运行完整的字段映射测试...')
    
    this.resetResults()

    // 用户信息映射测试
    if (testData.userInfo) {
      this.validateUserInfoMapping(testData.userInfo.raw, testData.userInfo.mapped)
    }

    // 审核记录映射测试
    if (testData.reviewRecords) {
      testData.reviewRecords.forEach((record, index) => {
        this.validateReviewRecordMapping(record.raw, record.mapped)
      })
    }

    // 商品信息映射测试
    if (testData.products) {
      testData.products.forEach((product, index) => {
        this.validateProductMapping(product.raw, product.mapped)
      })
    }

    // 积分记录映射测试
    if (testData.pointsRecords) {
      testData.pointsRecords.forEach((record, index) => {
        this.validatePointsRecordMapping(record.raw, record.mapped)
      })
    }

    return this.generateReport()
  }

  /**
   * 📋 添加测试结果
   */
  addTestResult(testResult) {
    this.testResults.totalTests++
    if (testResult.passed) {
      this.testResults.passedTests++
    } else {
      this.testResults.failedTests++
    }
    this.testResults.testDetails.push(testResult)
  }

  /**
   * 🔄 重置测试结果
   */
  resetResults() {
    this.testResults = {
      totalTests: 0,
      passedTests: 0,
      failedTests: 0,
      testDetails: []
    }
  }

  /**
   * 📊 生成测试报告
   */
  generateReport() {
    const successRate = this.testResults.totalTests > 0 
      ? Math.round((this.testResults.passedTests / this.testResults.totalTests) * 100) 
      : 0

    const report = {
      summary: {
        totalTests: this.testResults.totalTests,
        passedTests: this.testResults.passedTests,
        failedTests: this.testResults.failedTests,
        successRate: successRate,
        overallStatus: successRate >= 90 ? 'EXCELLENT' : successRate >= 70 ? 'GOOD' : 'NEEDS_IMPROVEMENT'
      },
      details: this.testResults.testDetails,
      recommendations: this.generateRecommendations()
    }

    console.log('📊 字段映射测试报告:', report)
    return report
  }

  /**
   * 💡 生成修复建议
   */
  generateRecommendations() {
    const recommendations = []
    
    const failedTests = this.testResults.testDetails.filter(test => !test.passed)
    
    if (failedTests.length > 0) {
      recommendations.push('🔧 建议立即修复失败的字段映射测试')
      
      failedTests.forEach(test => {
        recommendations.push(`   - ${test.testName}: ${test.issues.join(', ')}`)
      })
    }

    const testsWithIssues = this.testResults.testDetails.filter(test => test.issues.length > 0)
    if (testsWithIssues.length > 0) {
      recommendations.push('⚠️ 建议关注以下潜在问题:')
      
      testsWithIssues.forEach(test => {
        test.issues.forEach(issue => {
          if (!issue.includes('缺少映射字段')) {
            recommendations.push(`   - ${issue}`)
          }
        })
      })
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ 所有字段映射测试通过，无需修复')
    }

    return recommendations
  }
}

// 导出验证器
module.exports = {
  FieldMappingValidator
} 