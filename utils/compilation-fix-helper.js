/**
 * 🔧 编译后状态修复助手工具
 * 用于检测和修复编译后的缓存状态异常问题
 */

/**
 * 🔴 主要功能：检测编译后状态异常并自动修复
 */
function detectAndFixCompilationIssues() {
  console.log('🔍 开始编译后状态异常检测...')
  
  const app = getApp()
  if (!app) {
    console.error('❌ App实例不存在')
    return { success: false, error: 'APP_INSTANCE_MISSING' }
  }
  
  try {
    // 步骤1：检测异常
    const issues = detectCompilationIssues()
    
    // 步骤2：如果有异常，执行修复
    if (issues.length > 0) {
      console.warn('⚠️ 检测到编译后状态异常:', issues)
      const fixResult = performAutoFix(issues)
      
      if (fixResult.success) {
        console.log('✅ 编译后状态异常已自动修复')
        
        // 显示修复成功提示
        wx.showToast({
          title: '状态异常已修复',
          icon: 'success',
          duration: 2000
        })
        
        return { success: true, fixed: issues, message: '状态异常已自动修复' }
      } else {
        console.error('❌ 自动修复失败:', fixResult.error)
        return { success: false, error: fixResult.error, issues: issues }
      }
    } else {
      console.log('✅ 编译后状态检查正常，无需修复')
      return { success: true, message: '状态正常，无需修复' }
    }
  } catch (error) {
    console.error('❌ 编译后状态检测失败:', error)
    return { success: false, error: error.message || 'DETECTION_FAILED' }
  }
}

/**
 * 🔍 检测编译后状态异常
 */
function detectCompilationIssues() {
  const issues = []
  const app = getApp()
  
  try {
    // 检测1：全局数据异常
    const globalDataIssues = checkGlobalDataIssues(app)
    issues.push(...globalDataIssues)
    
    // 检测2：存储数据异常
    const storageIssues = checkStorageIssues()
    issues.push(...storageIssues)
    
    // 检测3：数据一致性问题
    const consistencyIssues = checkDataConsistency(app)
    issues.push(...consistencyIssues)
    
    // 检测4：Token格式问题
    const tokenIssues = checkTokenIssues(app)
    issues.push(...tokenIssues)
    
    return issues
  } catch (error) {
    console.error('❌ 异常检测过程出错:', error)
    return [{ type: 'DETECTION_ERROR', detail: error.message }]
  }
}

/**
 * 🔍 检查全局数据异常
 */
function checkGlobalDataIssues(app) {
  const issues = []
  
  if (!app.globalData) {
    issues.push({ type: 'GLOBAL_DATA_MISSING', detail: '全局数据对象不存在' })
    return issues
  }
  
  // 检查关键字段是否为异常字符串
  const checkFields = ['accessToken', 'refreshToken', 'userInfo']
  checkFields.forEach(field => {
    const value = app.globalData[field]
    if (value === 'undefined' || value === 'null' || 
        (typeof value === 'string' && (value === 'undefined' || value === 'null'))) {
      issues.push({ 
        type: 'INVALID_GLOBAL_FIELD', 
        field: field, 
        value: value,
        detail: `全局字段${field}值异常: ${value}` 
      })
    }
  })
  
  return issues
}

/**
 * 🔍 检查存储数据异常
 */
function checkStorageIssues() {
  const issues = []
  
  try {
    const storageFields = [
      { key: 'access_token', name: 'Token' },
      { key: 'user_info', name: '用户信息' },
      { key: 'refresh_token', name: '刷新Token' }
    ]
    
    storageFields.forEach(({ key, name }) => {
      try {
        const value = wx.getStorageSync(key)
        if (value === 'undefined' || value === 'null' || 
            (typeof value === 'string' && (value === 'undefined' || value === 'null'))) {
          issues.push({
            type: 'INVALID_STORAGE_VALUE',
            key: key,
            name: name,
            value: value,
            detail: `存储${name}值异常: ${value}`
          })
        }
      } catch (error) {
        issues.push({
          type: 'STORAGE_READ_ERROR',
          key: key,
          name: name,
          error: error.message,
          detail: `读取存储${name}失败: ${error.message}`
        })
      }
    })
  } catch (error) {
    issues.push({
      type: 'STORAGE_CHECK_ERROR',
      detail: `存储检查失败: ${error.message}`
    })
  }
  
  return issues
}

/**
 * 🔍 检查数据一致性
 */
function checkDataConsistency(app) {
  const issues = []
  
  try {
    const globalToken = app.globalData.accessToken
    const storageToken = wx.getStorageSync('access_token')
    
    // Token一致性检查
    if (globalToken && storageToken && 
        globalToken !== 'undefined' && storageToken !== 'undefined' &&
        globalToken !== storageToken) {
      issues.push({
        type: 'TOKEN_INCONSISTENCY',
        detail: 'Token全局数据与存储数据不一致',
        globalPreview: globalToken?.substring(0, 20) + '...',
        storagePreview: storageToken?.substring(0, 20) + '...'
      })
    }
    
    // 用户信息一致性检查
    const globalUserInfo = app.globalData.userInfo
    const storageUserInfo = wx.getStorageSync('user_info')
    
    if (globalUserInfo && storageUserInfo && 
        typeof globalUserInfo === 'object' && typeof storageUserInfo === 'object') {
      const globalUserId = globalUserInfo.user_id || globalUserInfo.id
      const storageUserId = storageUserInfo.user_id || storageUserInfo.id
      
      if (globalUserId && storageUserId && globalUserId !== storageUserId) {
        issues.push({
          type: 'USER_INFO_INCONSISTENCY',
          detail: '用户信息全局数据与存储数据不一致',
          globalUserId: globalUserId,
          storageUserId: storageUserId
        })
      }
    }
  } catch (error) {
    issues.push({
      type: 'CONSISTENCY_CHECK_ERROR',
      detail: `一致性检查失败: ${error.message}`
    })
  }
  
  return issues
}

/**
 * 🔍 检查Token格式问题
 */
function checkTokenIssues(app) {
  const issues = []
  
  try {
    const token = app.globalData.accessToken
    
    if (token) {
      // Token格式检查
      if (typeof token !== 'string') {
        issues.push({
          type: 'TOKEN_TYPE_ERROR',
          detail: `Token类型错误: ${typeof token}`,
          value: token
        })
      } else if (token === 'undefined' || token === 'null') {
        issues.push({
          type: 'TOKEN_VALUE_ERROR',
          detail: `Token值异常: ${token}`,
          value: token
        })
      } else if (token.length < 10) {
        issues.push({
          type: 'TOKEN_LENGTH_ERROR',
          detail: `Token长度异常: ${token.length}`,
          length: token.length
        })
      } else if (!token.includes('.')) {
        issues.push({
          type: 'TOKEN_FORMAT_ERROR',
          detail: 'Token格式不符合JWT标准',
          preview: token.substring(0, 50) + '...'
        })
      }
    }
  } catch (error) {
    issues.push({
      type: 'TOKEN_CHECK_ERROR',
      detail: `Token检查失败: ${error.message}`
    })
  }
  
  return issues
}

/**
 * 🔧 执行自动修复
 */
function performAutoFix(issues) {
  console.log('🔧 开始自动修复编译后状态异常...')
  
  try {
    const app = getApp()
    let fixedCount = 0
    
    // 修复1：清理异常的全局数据
    const globalDataFixed = fixGlobalDataIssues(app, issues)
    fixedCount += globalDataFixed
    
    // 修复2：清理异常的存储数据
    const storageFixed = fixStorageIssues(issues)
    fixedCount += storageFixed
    
    // 修复3：重新同步数据
    const syncResult = performDataSync(app)
    if (syncResult) fixedCount++
    
    console.log(`✅ 自动修复完成，共修复 ${fixedCount} 个问题`)
    
    return { 
      success: true, 
      fixedCount: fixedCount,
      message: `成功修复 ${fixedCount} 个状态异常`
    }
  } catch (error) {
    console.error('❌ 自动修复失败:', error)
    return { 
      success: false, 
      error: error.message || 'AUTO_FIX_FAILED'
    }
  }
}

/**
 * 🔧 修复全局数据问题
 */
function fixGlobalDataIssues(app, issues) {
  let fixedCount = 0
  
  const globalDataIssues = issues.filter(issue => 
    issue.type === 'INVALID_GLOBAL_FIELD' || issue.type === 'GLOBAL_DATA_MISSING'
  )
  
  globalDataIssues.forEach(issue => {
    try {
      if (issue.type === 'INVALID_GLOBAL_FIELD') {
        console.log(`🧹 清理异常全局字段: ${issue.field}`)
        app.globalData[issue.field] = null
        fixedCount++
      }
    } catch (error) {
      console.error(`❌ 修复全局字段 ${issue.field} 失败:`, error)
    }
  })
  
  // 重置登录状态
  if (!app.globalData.accessToken || !app.globalData.userInfo) {
    app.globalData.isLoggedIn = false
    fixedCount++
  }
  
  return fixedCount
}

/**
 * 🔧 修复存储数据问题
 */
function fixStorageIssues(issues) {
  let fixedCount = 0
  
  const storageIssues = issues.filter(issue => 
    issue.type === 'INVALID_STORAGE_VALUE'
  )
  
  storageIssues.forEach(issue => {
    try {
      console.log(`🧹 清理异常存储数据: ${issue.key}`)
      wx.removeStorageSync(issue.key)
      fixedCount++
    } catch (error) {
      console.error(`❌ 清理存储 ${issue.key} 失败:`, error)
    }
  })
  
  return fixedCount
}

/**
 * 🔧 执行数据同步
 */
function performDataSync(app) {
  try {
    console.log('🔄 重新同步存储数据到全局...')
    
    // 调用App层的同步方法
    if (app && app.forceSyncStorageToGlobalData) {
      app.forceSyncStorageToGlobalData()
      return true
    } else {
      // 手动同步逻辑
      const storedToken = wx.getStorageSync('access_token')
      const storedUserInfo = wx.getStorageSync('user_info')
      
      if (storedToken && storedUserInfo && 
          storedToken !== 'undefined' && storedToken !== 'null' &&
          typeof storedUserInfo === 'object') {
        
        app.globalData.accessToken = storedToken
        app.globalData.userInfo = storedUserInfo
        app.globalData.isLoggedIn = true
        
        console.log('✅ 手动数据同步完成')
        return true
      }
    }
    
    return false
  } catch (error) {
    console.error('❌ 数据同步失败:', error)
    return false
  }
}

/**
 * 🚨 手动清理所有缓存（紧急模式）
 */
function emergencyClearAllCache() {
  console.log('🚨 执行紧急缓存清理...')
  
  try {
    const app = getApp()
    
    // 清理全局数据
    if (app && app.globalData) {
      app.globalData.isLoggedIn = false
      app.globalData.accessToken = null
      app.globalData.refreshToken = null
      app.globalData.userInfo = null
      app.globalData.lastLoginTime = null
    }
    
    // 清理本地存储
    const storageKeys = [
      'access_token',
      'refresh_token', 
      'user_info',
      'last_login_time'
    ]
    
    storageKeys.forEach(key => {
      try {
        wx.removeStorageSync(key)
      } catch (error) {
        console.error(`清理存储 ${key} 失败:`, error)
      }
    })
    
    console.log('✅ 紧急缓存清理完成')
    
    wx.showModal({
      title: '缓存清理完成',
      content: '所有登录状态已清理，请重新登录。',
      showCancel: false,
      confirmText: '重新登录',
      success: () => {
        wx.reLaunch({
          url: '/pages/auth/auth'
        })
      }
    })
    
    return { success: true, message: '紧急缓存清理完成' }
  } catch (error) {
    console.error('❌ 紧急缓存清理失败:', error)
    return { success: false, error: error.message }
  }
}

module.exports = {
  detectAndFixCompilationIssues,
  emergencyClearAllCache,
  detectCompilationIssues,
  performAutoFix
} 