// utils/wechat.js - 微信小程序相关工具函数

/**
 * 微信小程序工具类
 * 处理微信登录、获取用户信息等功能
 */
class WechatUtils {
  constructor() {
    // 从全局配置获取微信配置
    const app = getApp()
    this.config = app.globalData.wechat
    console.log('🔑 微信配置初始化:', {
      appId: this.config.appId,
      hasAppSecret: !!this.config.appSecret
    })
  }

  /**
   * 获取微信配置信息
   * @returns {Object} 微信配置
   */
  getConfig() {
    return this.config
  }

  /**
   * 微信登录
   * @returns {Promise} 登录结果
   */
  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            console.log('✅ 微信登录成功，code:', res.code)
            resolve({
              code: res.code,
              appId: this.config.appId
            })
          } else {
            console.error('❌ 微信登录失败:', res.errMsg)
            reject(new Error('微信登录失败: ' + res.errMsg))
          }
        },
        fail: (err) => {
          console.error('❌ 微信登录调用失败:', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 获取用户信息
   * @returns {Promise} 用户信息
   */
  getUserProfile() {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善用户资料',
        success: (res) => {
          console.log('✅ 获取用户信息成功:', res.userInfo)
          resolve(res.userInfo)
        },
        fail: (err) => {
          console.error('❌ 获取用户信息失败:', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 检查登录状态
   * @returns {Promise} 登录状态检查结果
   */
  checkSession() {
    return new Promise((resolve, reject) => {
      wx.checkSession({
        success: () => {
          console.log('✅ 登录状态有效')
          resolve(true)
        },
        fail: () => {
          console.log('⚠️ 登录状态已过期')
          resolve(false)
        }
      })
    })
  }

  /**
   * 获取系统信息
   * @returns {Promise} 系统信息
   */
  getSystemInfo() {
    return new Promise((resolve, reject) => {
      wx.getSystemInfo({
        success: (res) => {
          console.log('📱 系统信息:', res)
          resolve(res)
        },
        fail: (err) => {
          console.error('❌ 获取系统信息失败:', err)
          reject(err)
        }
      })
    })
  }

  /**
   * 向后端发送登录请求
   * @param {string} code 微信登录code
   * @param {Object} userInfo 用户信息
   * @returns {Promise} 后端登录结果
   */
  async loginToBackend(code, userInfo = null) {
    const app = getApp()
    
    try {
      const systemInfo = await this.getSystemInfo()
      
      const loginData = {
        code: code,
        appId: this.config.appId,
        userInfo: userInfo,
        deviceInfo: {
          platform: systemInfo.platform,
          version: systemInfo.version,
          brand: systemInfo.brand,
          model: systemInfo.model
        }
      }

      // 调用后端登录接口
      const response = await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/api/auth/wechat-login`,
          method: 'POST',
          data: loginData,
          header: {
            'Content-Type': 'application/json'
          },
          success: resolve,
          fail: reject
        })
      })

      if (response.statusCode === 200 && response.data.success) {
        console.log('✅ 后端登录成功:', response.data)
        return response.data
      } else {
        throw new Error(response.data.message || '登录失败')
      }
    } catch (error) {
      console.error('❌ 后端登录失败:', error)
      throw error
    }
  }

  /**
   * 完整的登录流程
   * @param {boolean} needUserInfo 是否需要获取用户信息
   * @returns {Promise} 登录结果
   */
  async fullLogin(needUserInfo = false) {
    try {
      // 1. 检查当前登录状态
      const isSessionValid = await this.checkSession()
      
      // 2. 如果会话无效或需要重新登录，执行微信登录
      const loginResult = await this.login()
      
      // 3. 获取用户信息（如果需要）
      let userInfo = null
      if (needUserInfo) {
        try {
          userInfo = await this.getUserProfile()
        } catch (err) {
          console.warn('⚠️ 用户拒绝授权用户信息，继续登录流程')
        }
      }
      
      // 4. 向后端发送登录请求
      const backendResult = await this.loginToBackend(loginResult.code, userInfo)
      
      // 5. 保存登录信息到全局状态
      const app = getApp()
      app.onLoginSuccess(backendResult)
      
      return {
        success: true,
        data: backendResult,
        userInfo: userInfo
      }
    } catch (error) {
      console.error('❌ 完整登录流程失败:', error)
      throw error
    }
  }
}

module.exports = WechatUtils 