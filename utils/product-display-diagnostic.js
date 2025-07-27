// utils/product-display-diagnostic.js - 商品显示问题诊断工具（简化版）
// 专门用于解决管理员账号商品显示空白问题

/**
 * 商品显示问题诊断器 - 简化版
 * 
 * 根据后端程序员分析，问题特征：
 * - 后端数据库有商品数据（ID: 12, 玉石1）
 * - 后端API正常返回：{products: [商品数据], total: 1}
 * - 前端看到：{products: [], total: 0}
 */
class ProductDisplayDiagnostic {
  constructor() {
    this.diagnosticResults = []
    this.app = getApp()
  }

  /**
   * 运行完整诊断 - 简化版
   */
  async runFullDiagnostic() {
    console.log('🔍 启动商品显示问题诊断...')
    
    this.diagnosticResults = []
    
    // 1. 用户认证状态检查
    this.checkUserAuthStatus()
    
    // 2. Token有效性检查
    this.checkTokenValidity()
    
    // 3. 环境配置检查
    this.checkEnvironmentConfig()
    
    // 4. 生成诊断报告
    this.generateDiagnosticReport()
    
    return this.diagnosticResults
  }

  /**
   * 1. 用户认证状态检查
   */
  checkUserAuthStatus() {
    console.log('🔍 检查用户认证状态...')
    
    const userInfo = this.app.globalData.userInfo
    const isLoggedIn = this.app.globalData.isLoggedIn
    
    if (!userInfo) {
      this.addResult('FAIL', 'USER_AUTH', '用户信息缺失', '全局数据中没有用户信息')
      this.addSolution('重新登录获取用户信息')
      return
    }
    
    if (!isLoggedIn) {
      this.addResult('FAIL', 'USER_AUTH', '用户未登录', '登录状态为false')
      this.addSolution('确认登录状态，必要时重新登录')
      return
    }
    
    this.addResult('PASS', 'USER_AUTH', '用户认证状态正常', `用户: ${userInfo.username || userInfo.phone || '未知'}`)
  }

  /**
   * 2. Token有效性检查
   */
  checkTokenValidity() {
    console.log('🔍 检查Token有效性...')
    
    const accessToken = this.app.globalData.accessToken || wx.getStorageSync('access_token')
    
    if (!accessToken) {
      this.addResult('FAIL', 'TOKEN', 'Access Token缺失', '全局数据和本地存储都没有Token')
      this.addSolution('Token缺失是商品显示空白的常见原因，需要重新登录')
      return
    }
    
    // 检查JWT格式
    const tokenParts = accessToken.split('.')
    if (tokenParts.length !== 3) {
      this.addResult('FAIL', 'TOKEN', 'JWT格式错误', `Token部分数量: ${tokenParts.length}, 预期: 3`)
      this.addSolution('清除无效Token并重新登录')
      return
    }
    
    // 🔧 修复：使用微信小程序兼容的JWT解码函数
    try {
      const { decodeJWTPayload } = require('./util.js')
      const payload = decodeJWTPayload(accessToken)
      const now = Math.floor(Date.now() / 1000)
      
      if (payload.exp && payload.exp < now) {
        const expiredMinutes = Math.floor((now - payload.exp) / 60)
        this.addResult('FAIL', 'TOKEN', 'Token已过期', `过期时间: ${expiredMinutes}分钟前`)
        this.addSolution('Token过期是商品显示空白的常见原因，需要重新登录')
        return
      }
      
      this.addResult('PASS', 'TOKEN', 'Token格式和有效期正常', `用户ID: ${payload.user_id || payload.userId}`)
      
    } catch (error) {
      this.addResult('FAIL', 'TOKEN', 'Token解码失败', error.message)
      this.addSolution('Token可能已损坏，需要重新登录')
    }
  }

  /**
   * 3. 环境配置检查
   */
  checkEnvironmentConfig() {
    console.log('🔍 检查环境配置...')
    
    const config = require('../config/env.js').getConfig()
    
    if (!config) {
      this.addResult('FAIL', 'ENV_CONFIG', '环境配置缺失', '无法获取环境配置')
      return
    }
    
    this.addResult('INFO', 'ENV_CONFIG', `当前环境: ${require('../config/env.js').getCurrentEnv()}`, `API地址: ${config.baseUrl}`)
    
    // 检查是否为开发环境但连接生产API
    if (config.isDev && config.baseUrl && config.baseUrl.includes('omqktqrtntnn.sealosbja.site')) {
      this.addResult('WARN', 'ENV_CONFIG', '开发环境连接生产API', '可能导致认证问题')
    }
  }

  /**
   * 生成诊断报告
   */
  generateDiagnosticReport() {
    console.log('\n📋 商品显示问题诊断报告:')
    console.log('=' * 50)
    
    const failCount = this.diagnosticResults.filter(r => r.type === 'FAIL').length
    const warnCount = this.diagnosticResults.filter(r => r.type === 'WARN').length
    const passCount = this.diagnosticResults.filter(r => r.type === 'PASS').length
    
    console.log(`📊 诊断统计: ✅通过${passCount}项 ⚠️警告${warnCount}项 ❌失败${failCount}项`)
    
    this.diagnosticResults.forEach(result => {
      const icon = {
        'PASS': '✅',
        'FAIL': '❌',
        'WARN': '⚠️',
        'INFO': 'ℹ️',
        'SOLUTION': '🔧'
      }[result.type]
      
      console.log(`${icon} [${result.category}] ${result.message}`)
      if (result.details) {
        console.log(`   详情: ${result.details}`)
      }
    })
    
    if (failCount > 0) {
      console.log('\n🚨 发现关键问题，这可能是商品显示空白的原因')
      const solutions = this.diagnosticResults.filter(r => r.type === 'SOLUTION')
      if (solutions.length > 0) {
        console.log('🔧 建议解决方案:')
        solutions.forEach(solution => console.log(`   • ${solution.message}`))
      }
    } else {
      console.log('\n✅ 基础诊断通过，问题可能在数据处理或API响应')
    }
  }

  /**
   * 添加诊断结果
   */
  addResult(type, category, message, details) {
    this.diagnosticResults.push({
      type: type,  // PASS, FAIL, WARN, INFO
      category: category,
      message: message,
      details: details,
      timestamp: new Date().toLocaleString()
    })
  }

  /**
   * 添加解决方案
   */
  addSolution(solution) {
    this.diagnosticResults.push({
      type: 'SOLUTION',
      category: 'SOLUTION',
      message: solution,
      details: '',
      timestamp: new Date().toLocaleString()
    })
  }
}

module.exports = ProductDisplayDiagnostic 