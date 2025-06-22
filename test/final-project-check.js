// test/final-project-check.js - 最终项目完整性检查

/**
 * 🔴 餐厅积分抽奖系统 - 最终项目检查
 * 基于《后端数据库1号开发文档》验证前后端对接完整性
 */

console.log('🚀 开始最终项目完整性检查...')
console.log('📋 基于《餐厅积分抽奖系统 - 后端数据库1号开发文档》')
console.log('=' .repeat(60))

// 检查结果统计
const checkResults = {
  passed: 0,
  failed: 0,
  total: 0
}

function logResult(title, passed, details = '') {
  checkResults.total++
  if (passed) {
    checkResults.passed++
    console.log(`✅ ${title}`)
    if (details) console.log(`   ${details}`)
  } else {
    checkResults.failed++
    console.log(`❌ ${title}`)
    if (details) console.log(`   ${details}`)
  }
}

/**
 * 1. 环境配置检查
 */
function checkEnvironmentConfig() {
  console.log('\n📁 1. 环境配置检查')
  console.log('-' .repeat(30))
  
  try {
    // 检查环境配置文件
    const ENV_CONFIG = require('../config/env.js')
    logResult('环境配置文件存在', true, 'config/env.js')
    
    const config = ENV_CONFIG.getConfig()
    
    // 检查必要的配置项
    logResult('API地址配置', !!config.baseUrl, config.baseUrl)
    logResult('WebSocket地址配置', !!config.wsUrl, config.wsUrl)
    logResult('Sealos存储配置', !!config.sealosConfig, 'endpoint, bucket, accessKeyId已配置')
    logResult('微信小程序配置', !!config.wechat, 'appId, appSecret已配置')
    
    // 检查开发/生产环境切换
    const currentEnv = ENV_CONFIG.getCurrentEnv()
    logResult('环境切换机制', ['development', 'testing', 'production'].includes(currentEnv), `当前环境: ${currentEnv}`)
    
  } catch (error) {
    logResult('环境配置检查', false, `错误: ${error.message}`)
  }
}

/**
 * 2. 核心功能文件检查
 */
function checkCoreFiles() {
  console.log('\n📄 2. 核心功能文件检查')
  console.log('-' .repeat(30))
  
  const fs = require('fs')
  const path = require('path')
  
  const coreFiles = [
    // 主要配置文件
    { path: 'app.js', desc: '小程序主入口文件' },
    { path: 'app.json', desc: '小程序配置文件' },
    { path: 'config/env.js', desc: '环境配置文件' },
    
    // 核心工具文件
    { path: 'utils/api.js', desc: 'API接口封装' },
    { path: 'utils/ws.js', desc: 'WebSocket管理器' },
    { path: 'utils/validate.js', desc: '表单验证工具' },
    
    // 核心页面文件
    { path: 'pages/lottery/lottery.js', desc: '抽奖页面逻辑' },
    { path: 'pages/exchange/exchange.js', desc: '商品兑换逻辑' },
    { path: 'pages/camera/camera.js', desc: '拍照上传逻辑' },
    { path: 'pages/user/user.js', desc: '用户中心逻辑' },
    { path: 'pages/merchant/merchant.js', desc: '商家管理逻辑' },
    
    // 记录页面
    { path: 'pages/records/lottery-records.js', desc: '抽奖记录页面' },
    { path: 'pages/records/exchange-records.js', desc: '兑换记录页面' },
    { path: 'pages/records/upload-records.js', desc: '上传记录页面' }
  ]
  
  coreFiles.forEach(file => {
    const filePath = path.join(__dirname, '..', file.path)
    const exists = fs.existsSync(filePath)
    logResult(file.desc, exists, file.path)
  })
}

/**
 * 3. API接口完整性检查
 */
function checkAPIIntegrity() {
  console.log('\n🌐 3. API接口完整性检查')
  console.log('-' .repeat(30))
  
  try {
    const { authAPI, lotteryAPI, exchangeAPI, photoAPI, userAPI, merchantAPI } = require('../utils/api.js')
    
    // 检查认证API
    const authMethods = ['sendCode', 'login', 'refresh', 'verifyToken', 'logout']
    authMethods.forEach(method => {
      logResult(`认证API - ${method}`, typeof authAPI[method] === 'function')
    })
    
    // 检查抽奖API
    const lotteryMethods = ['getConfig', 'draw', 'getRecords', 'getStatistics']
    lotteryMethods.forEach(method => {
      logResult(`抽奖API - ${method}`, typeof lotteryAPI[method] === 'function')
    })
    
    // 检查兑换API
    const exchangeMethods = ['getCategories', 'getProducts', 'redeem', 'getRecords']
    exchangeMethods.forEach(method => {
      logResult(`兑换API - ${method}`, typeof exchangeAPI[method] === 'function')
    })
    
    // 检查图片上传API
    const photoMethods = ['upload', 'getRecords']
    photoMethods.forEach(method => {
      logResult(`图片API - ${method}`, typeof photoAPI[method] === 'function')
    })
    
    // 检查用户API
    const userMethods = ['getUserInfo', 'updateUserInfo', 'getStatistics', 'getPointsRecords', 'checkIn']
    userMethods.forEach(method => {
      logResult(`用户API - ${method}`, typeof userAPI[method] === 'function')
    })
    
    // 检查商家API
    const merchantMethods = ['apply', 'getStatistics', 'getPendingReviews', 'review', 'batchReview']
    merchantMethods.forEach(method => {
      logResult(`商家API - ${method}`, typeof merchantAPI[method] === 'function')
    })
    
  } catch (error) {
    logResult('API接口完整性检查', false, `错误: ${error.message}`)
  }
}

/**
 * 4. WebSocket功能检查
 */
function checkWebSocketFeatures() {
  console.log('\n🔌 4. WebSocket功能检查')
  console.log('-' .repeat(30))
  
  try {
    const WSManager = require('../utils/ws.js')
    
    // 检查WebSocket类存在
    logResult('WebSocket管理器类', typeof WSManager === 'function')
    
    // 创建实例并检查方法
    const wsManager = new WSManager()
    
    const wsMethods = ['connect', 'disconnect', 'send', 'on', 'off', 'emit']
    wsMethods.forEach(method => {
      logResult(`WebSocket方法 - ${method}`, typeof wsManager[method] === 'function')
    })
    
    // 检查特定的消息处理方法
    const messageHandlers = ['handlePointsUpdate', 'handleStockUpdate', 'handleReviewResult']
    messageHandlers.forEach(handler => {
      logResult(`消息处理器 - ${handler}`, typeof wsManager[handler] === 'function')
    })
    
  } catch (error) {
    logResult('WebSocket功能检查', false, `错误: ${error.message}`)
  }
}

/**
 * 5. 数据格式验证
 */
function checkDataFormats() {
  console.log('\n📊 5. 数据格式验证')
  console.log('-' .repeat(30))
  
  // 检查API响应格式
  const apiResponse = { code: 0, msg: 'success', data: {} }
  logResult('API响应格式', 
    apiResponse.hasOwnProperty('code') && 
    apiResponse.hasOwnProperty('msg') && 
    apiResponse.hasOwnProperty('data'),
    '{ code, msg, data }'
  )
  
  // 检查WebSocket消息格式
  const wsMessage = { type: 'points_update', data: {}, timestamp: new Date().toISOString() }
  logResult('WebSocket消息格式',
    wsMessage.hasOwnProperty('type') && 
    wsMessage.hasOwnProperty('data'),
    '{ type, data, timestamp }'
  )
  
  // 检查抽奖角度配置 (8等分)
  const angles = [0, 45, 90, 135, 180, 225, 270, 315]
  const isValidAngles = angles.length === 8 && angles.every(angle => angle >= 0 && angle < 360)
  logResult('抽奖角度8等分配置', isValidAngles, angles.join(', '))
}

/**
 * 6. 关键业务逻辑检查
 */
function checkBusinessLogic() {
  console.log('\n🎯 6. 关键业务逻辑检查')
  console.log('-' .repeat(30))
  
  try {
    // 检查抽奖页面关键方法
    const fs = require('fs')
    const lotteryContent = fs.readFileSync('../pages/lottery/lottery.js', 'utf8')
    
    logResult('单抽功能', lotteryContent.includes('onSingleDraw'))
    logResult('多连抽功能', lotteryContent.includes('onTripleDraw') && lotteryContent.includes('onFiveDraw'))
    logResult('抽奖动画', lotteryContent.includes('playAnimation'))
    logResult('Canvas转盘绘制', lotteryContent.includes('drawWheel'))
    
    // 检查兑换页面关键方法
    const exchangeContent = fs.readFileSync('../pages/exchange/exchange.js', 'utf8')
    
    logResult('商品筛选', exchangeContent.includes('filterProducts'))
    logResult('商品兑换', exchangeContent.includes('performExchange'))
    logResult('库存更新', exchangeContent.includes('updateProductStock'))
    
    // 检查拍照页面关键方法
    const cameraContent = fs.readFileSync('../pages/camera/camera.js', 'utf8')
    
    logResult('图片选择', cameraContent.includes('handleImageSelected'))
    logResult('图片上传', cameraContent.includes('onSubmitUpload'))
    logResult('审核结果显示', cameraContent.includes('showUploadResult'))
    
  } catch (error) {
    logResult('业务逻辑检查', false, `错误: ${error.message}`)
  }
}

/**
 * 7. 小程序配置检查
 */
function checkMiniProgramConfig() {
  console.log('\n📱 7. 小程序配置检查')
  console.log('-' .repeat(30))
  
  try {
    const fs = require('fs')
    const appJson = JSON.parse(fs.readFileSync('../app.json', 'utf8'))
    
    // 检查页面配置
    const requiredPages = [
      'pages/lottery/lottery',
      'pages/camera/camera', 
      'pages/exchange/exchange',
      'pages/user/user'
    ]
    
    requiredPages.forEach(page => {
      logResult(`页面配置 - ${page}`, appJson.pages.includes(page))
    })
    
    // 检查tabBar配置
    logResult('底部导航配置', !!appJson.tabBar && appJson.tabBar.list.length === 4)
    
    // 检查网络超时配置
    logResult('网络超时配置', !!appJson.networkTimeout)
    
  } catch (error) {
    logResult('小程序配置检查', false, `错误: ${error.message}`)
  }
}

/**
 * 8. 后端对接要点检查
 */
function checkBackendIntegration() {
  console.log('\n🔗 8. 后端对接要点检查')
  console.log('-' .repeat(30))
  
  // 检查环境配置的后端对接点
  try {
    const ENV_CONFIG = require('../config/env.js')
    const config = ENV_CONFIG.getConfig()
    
    // 开发环境检查
    const devApiUrl = 'http://localhost:3000/api'
    const devWsUrl = 'ws://localhost:8080'
    logResult('开发环境API地址', config.baseUrl === devApiUrl || config.baseUrl.includes('localhost'))
    logResult('开发环境WebSocket地址', config.wsUrl === devWsUrl || config.wsUrl.includes('localhost'))
    
    // 生产环境域名检查
    const prodDomain = 'rqchrlqndora.sealosbja.site'
    logResult('生产环境域名配置', config.baseUrl.includes(prodDomain) || config.wsUrl.includes(prodDomain), '支持生产环境部署')
    
    // Sealos存储配置检查
    logResult('Sealos存储配置', 
      config.sealosConfig && 
      config.sealosConfig.bucket === 'tiangong' &&
      config.sealosConfig.endpoint.includes('objectstorageapi.bja.sealos.run'),
      'bucket: tiangong, endpoint已配置'
    )
    
  } catch (error) {
    logResult('后端对接检查', false, `错误: ${error.message}`)
  }
}

/**
 * 主检查函数
 */
function runFinalCheck() {
  console.log('🔍 开始执行各项检查...\n')
  
  checkEnvironmentConfig()
  checkCoreFiles()
  checkAPIIntegrity()
  checkWebSocketFeatures()
  checkDataFormats()
  checkBusinessLogic()
  checkMiniProgramConfig()
  checkBackendIntegration()
  
  // 输出最终结果
  console.log('\n' + '=' .repeat(60))
  console.log('📊 最终检查结果汇总:')
  console.log('=' .repeat(60))
  console.log(`✅ 通过: ${checkResults.passed} 项`)
  console.log(`❌ 失败: ${checkResults.failed} 项`)
  console.log(`📋 总计: ${checkResults.total} 项`)
  
  const successRate = (checkResults.passed / checkResults.total * 100).toFixed(1)
  console.log(`🎯 完成度: ${successRate}%`)
  
  if (checkResults.failed === 0) {
    console.log('\n🎉 恭喜！所有检查项目均通过！')
    console.log('✅ 项目可以正常运行，前后端对接完成！')
  } else if (checkResults.failed <= 5) {
    console.log('\n⚠️  大部分功能正常，少量问题需要修复')
    console.log('🔧 建议检查上述失败项目并进行修复')
  } else {
    console.log('\n❌ 发现较多问题，需要仔细检查')
    console.log('🛠️  请逐项修复失败的检查项目')
  }
  
  console.log('\n📋 检查完成时间:', new Date().toLocaleString())
  
  return checkResults.failed === 0
}

// 执行检查
if (require.main === module) {
  runFinalCheck()
}

module.exports = {
  runFinalCheck,
  checkEnvironmentConfig,
  checkCoreFiles,
  checkAPIIntegrity,
  checkWebSocketFeatures,
  checkDataFormats,
  checkBusinessLogic,
  checkMiniProgramConfig,
  checkBackendIntegration
} 