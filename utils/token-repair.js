// utils/token-repair.js - Token诊断和修复工具
const app = getApp()

class TokenRepair {
  constructor() {
    this.maxRetry = 3
    this.retryDelay = 1000
  }

  /**
   * 🔧 诊断Token状态
   */
  async diagnoseToken() {
    console.log('🔍 开始Token诊断...')
    
    const diagnosis = {
      hasToken: false,
      tokenValid: false,
      tokenExpired: false,
      needsRefresh: false,
      needsRelogin: false,
      storageStatus: {},
      globalDataStatus: {},
      recommendations: []
    }

    // 1. 检查本地存储
    const storageToken = wx.getStorageSync('access_token')
    const storageRefresh = wx.getStorageSync('refresh_token')
    const storageUserInfo = wx.getStorageSync('user_info')
    const storageExpireTime = wx.getStorageSync('token_expire_time')

    diagnosis.storageStatus = {
      access_token: !!storageToken,
      refresh_token: !!storageRefresh,
      user_info: !!storageUserInfo,
      token_expire_time: !!storageExpireTime
    }

    // 2. 检查全局数据
    diagnosis.globalDataStatus = {
      accessToken: !!app.globalData.accessToken,
      refreshToken: !!app.globalData.refreshToken,
      userInfo: !!app.globalData.userInfo,
      isLoggedIn: app.globalData.isLoggedIn
    }

    // 3. 检查Token是否存在
    diagnosis.hasToken = !!(storageToken && app.globalData.accessToken)

    // 4. 检查Token是否过期
    const now = Date.now()
    if (storageExpireTime && storageExpireTime < now) {
      diagnosis.tokenExpired = true
      diagnosis.needsRefresh = true
      diagnosis.recommendations.push('Token已过期，需要刷新')
    }

    // 5. 检查数据一致性
    if (storageToken !== app.globalData.accessToken) {
      diagnosis.recommendations.push('存储Token与全局Token不一致')
    }

    // 6. 生成修复建议
    if (!diagnosis.hasToken) {
      diagnosis.needsRelogin = true
      diagnosis.recommendations.push('缺少Token，需要重新登录')
    } else if (diagnosis.tokenExpired) {
      diagnosis.needsRefresh = true
      diagnosis.recommendations.push('Token过期，尝试刷新')
    }

    console.log('🔍 Token诊断结果:', diagnosis)
    return diagnosis
  }

  /**
   * 🔧 修复Token问题
   */
  async repairToken() {
    console.log('🔧 开始Token修复...')
    
    const diagnosis = await this.diagnoseToken()
    
    if (diagnosis.needsRelogin) {
      return this.forceRelogin('Token缺失，需要重新登录')
    }

    if (diagnosis.needsRefresh) {
      return this.attemptTokenRefresh()
    }

    if (diagnosis.hasToken && !diagnosis.tokenExpired) {
      return this.verifyTokenValidity()
    }

    throw new Error('无法确定Token状态')
  }

  /**
   * 🔧 尝试刷新Token
   */
  async attemptTokenRefresh() {
    console.log('🔄 尝试刷新Token...')
    
    const refreshToken = app.globalData.refreshToken || wx.getStorageSync('refresh_token')
    
    if (!refreshToken) {
      throw new Error('缺少refresh_token，需要重新登录')
    }

    try {
      const API = require('./api.js')
      const response = await API.authAPI.refresh(refreshToken)
      
      if (response.code === 0) {
        // 更新Token信息
        app.globalData.accessToken = response.data.access_token
        app.globalData.refreshToken = response.data.refresh_token
        app.globalData.tokenExpireTime = Date.now() + response.data.expires_in * 1000
        
        // 保存到本地存储
        wx.setStorageSync('access_token', response.data.access_token)
        wx.setStorageSync('refresh_token', response.data.refresh_token)
        wx.setStorageSync('token_expire_time', app.globalData.tokenExpireTime)
        
        console.log('✅ Token刷新成功')
        return {
          success: true,
          message: 'Token刷新成功',
          data: response.data
        }
      } else {
        throw new Error(response.msg || 'Token刷新失败')
      }
    } catch (error) {
      console.error('❌ Token刷新失败:', error)
      throw error
    }
  }

  /**
   * 🔧 验证Token有效性
   */
  async verifyTokenValidity() {
    console.log('🔍 验证Token有效性...')
    
    try {
      const API = require('./api.js')
      const response = await API.authAPI.verifyToken()
      
      if (response.code === 0 && response.data.valid) {
        console.log('✅ Token验证成功')
        return {
          success: true,
          message: 'Token有效',
          data: response.data
        }
      } else {
        throw new Error('Token验证失败')
      }
    } catch (error) {
      console.error('❌ Token验证失败:', error)
      
      // Token验证失败，尝试刷新
      if (error.code === 2001 || error.code === 401) {
        return this.attemptTokenRefresh()
      }
      
      throw error
    }
  }

  /**
   * 🔧 清理缓存并重新登录
   */
  async forceRelogin(reason = '需要重新登录') {
    console.log('🔄 强制重新登录:', reason)
    
    // 清理所有认证信息
    app.globalData.accessToken = null
    app.globalData.refreshToken = null
    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
    
    // 清理本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
    wx.removeStorageSync('token_expire_time')
    
    // 清理请求缓存
    this.clearRequestCache()
    
    return new Promise((resolve) => {
      wx.showModal({
        title: '需要重新登录',
        content: reason,
        showCancel: false,
        confirmText: '去登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth',
            success: () => {
              resolve({
                success: true,
                message: '已跳转到登录页面',
                action: 'redirect'
              })
            }
          })
        }
      })
    })
  }

  /**
   * 🔧 清理请求缓存
   */
  clearRequestCache() {
    console.log('🧹 清理请求缓存...')
    
    // 清理微信请求缓存
    try {
      wx.clearStorageSync()
    } catch (error) {
      console.warn('⚠️ 清理存储失败:', error)
    }
  }

  /**
   * 🔧 智能Token修复（带重试）
   */
  async smartRepair(retryCount = 0) {
    console.log(`🔧 智能Token修复 (第${retryCount + 1}次)`)
    
    try {
      const result = await this.repairToken()
      console.log('✅ Token修复成功:', result)
      return result
    } catch (error) {
      console.warn(`⚠️ Token修复失败 (第${retryCount + 1}次):`, error)
      
      if (retryCount < this.maxRetry) {
        // 延迟重试
        await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retryCount + 1)))
        return this.smartRepair(retryCount + 1)
      } else {
        // 重试次数用完，强制重新登录
        return this.forceRelogin('Token修复失败，需要重新登录')
      }
    }
  }

  /**
   * 🔧 检查并修复上传记录问题
   */
  async repairUploadHistory() {
    console.log('🔧 修复上传记录问题...')
    
    try {
      // 1. 先修复Token
      const tokenResult = await this.smartRepair()
      
      if (!tokenResult.success || tokenResult.action === 'redirect') {
        return tokenResult
      }
      
      // 2. 清理缓存
      this.clearRequestCache()
      
      // 3. 重新获取上传记录
      const API = require('./api.js')
      const historyResponse = await API.uploadAPI.getHistory(1, 10, 'all')
      
      if (historyResponse.code === 0) {
        console.log('✅ 上传记录获取成功:', historyResponse.data)
        return {
          success: true,
          message: '上传记录修复成功',
          data: historyResponse.data
        }
      } else {
        throw new Error(historyResponse.msg || '获取上传记录失败')
      }
    } catch (error) {
      console.error('❌ 上传记录修复失败:', error)
      throw error
    }
  }

  /**
   * 🔧 用户友好的修复界面
   */
  async showRepairDialog() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '🔧 Token修复工具',
        content: '检测到Token问题，是否立即修复？\n\n这将清理缓存并尝试刷新Token',
        showCancel: true,
        cancelText: '稍后处理',
        confirmText: '立即修复',
        success: async (res) => {
          if (res.confirm) {
            try {
              wx.showLoading({ title: '修复中...', mask: true })
              const result = await this.smartRepair()
              wx.hideLoading()
              
              if (result.success) {
                wx.showToast({
                  title: '修复成功',
                  icon: 'success'
                })
                resolve(result)
              } else {
                throw new Error(result.message || '修复失败')
              }
            } catch (error) {
              wx.hideLoading()
              wx.showToast({
                title: '修复失败',
                icon: 'none'
              })
              resolve({ success: false, error: error.message })
            }
          } else {
            resolve({ success: false, message: '用户取消修复' })
          }
        }
      })
    })
  }
}

module.exports = new TokenRepair() 