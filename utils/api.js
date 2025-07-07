// utils/api.js - API接口请求封装
const app = getApp()

/**
 * 🔴 统一网络请求封装 - 仅支持真实后端API调用
 * 🚨 严禁使用Mock数据 - 违反项目安全规则
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    const {
      url,
      method = 'GET',
      data = {},
      needAuth = true,
      showLoading = true,
      retryCount = 0,
      maxRetry = 2,
      timeout = 12000  // 🔧 修复：调整默认超时时间为12秒，与登录逻辑保持一致
    } = options
    const app = getApp()
    
    // 🔧 修复：确保app已初始化
    if (!app || !app.globalData) {
      console.error('❌ App未初始化，无法发起请求')
      reject({ code: -1, msg: '应用未初始化', data: null })
      return
    }

    // 显示加载框
    if (showLoading) {
      wx.showLoading({
        title: '加载中...',
        mask: true
      })
    }

    // 构建请求头
    const header = {
      'Content-Type': 'application/json'
    }

    // 添加认证头
    if (needAuth && app.globalData.accessToken) {
      header['Authorization'] = `Bearer ${app.globalData.accessToken}`
      console.log('🔐 已添加认证头部:', `Bearer ${app.globalData.accessToken.substring(0, 20)}...`)
    } else if (needAuth && !app.globalData.accessToken) {
      console.warn('⚠️ 需要认证但缺少访问令牌!', { 
        needAuth, 
        hasToken: !!app.globalData.accessToken,
        globalData: app.globalData
      })
    }

    // 构建完整URL地址
    const fullUrl = app.globalData.baseUrl + url

    console.log('📡 发起API请求:', { 
      url: fullUrl, 
      method, 
      needAuth, 
      hasAuthHeader: !!header['Authorization'],
      headers: header
    })

    wx.request({
      url: fullUrl,
      method,
      data,
      header,
      timeout: timeout,
      success(res) {
        if (showLoading) {
          wx.hideLoading()
        }

        console.log(`📡 API请求 ${method} ${url}:`, {
          request: data,
          response: res.data,
          status: res.statusCode
        })

        // 🔴 根据后端文档统一错误处理
        if (res.statusCode === 200) {
          if (res.data.code === 0) {
            resolve(res.data)
          } else if (res.data.code === 401) {
            // Token过期或无效，尝试刷新
            if (retryCount < maxRetry) {
              app.refreshToken().then(() => {
                // 重新发起请求
                const newOptions = { ...options, retryCount: retryCount + 1 }
                request(newOptions).then(resolve).catch(reject)
              }).catch(() => {
                app.logout()
                reject(res.data)
              })
            } else {
              app.logout()
              reject(res.data)
            }
          } else if (res.data.code === 2001) {
            // 🔧 增强：2001错误码的智能处理
            console.error('🚨 认证错误 2001:', {
              error: '访问令牌不能为空',
              url: url,
              method: method,
              hasGlobalToken: !!app.globalData.accessToken,
              hasAuthHeader: !!header['Authorization'],
              requestHeaders: header,
              globalData: {
                isLoggedIn: app.globalData.isLoggedIn,
                accessToken: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : null,
                userInfo: app.globalData.userInfo
              }
            })
            
            // 🔧 新增：自动Token修复机制
            if (retryCount < maxRetry) {
              console.log('🔄 检测到Token问题，尝试自动修复...')
              
              try {
                const TokenRepair = require('./token-repair.js')
                TokenRepair.smartRepair().then((repairResult) => {
                  if (repairResult.success && repairResult.action !== 'redirect') {
                    console.log('✅ Token修复成功，重新发起请求')
                    // 重新发起请求
                    const newOptions = { ...options, retryCount: retryCount + 1 }
                    request(newOptions).then(resolve).catch(reject)
                    return
                  }
                }).catch((repairError) => {
                  console.error('❌ Token自动修复失败:', repairError)
                })
              } catch (repairError) {
                console.error('❌ Token自动修复失败:', repairError)
              }
            }
            
            // 🔴 Token修复失败或重试次数用完，显示用户友好提示
            if (showLoading) {
              wx.showModal({
                title: '🔑 登录状态异常',
                content: `Token已过期或无效！\n\n🔗 API：${fullUrl}\n\n解决方案：\n• 点击"重新登录"清理缓存\n• 或稍后重试让系统自动修复`,
                showCancel: true,
                cancelText: '稍后重试',
                confirmText: '重新登录',
                confirmColor: '#ff4444',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    // 清理所有认证信息并跳转登录
                    app.globalData.accessToken = null
                    app.globalData.refreshToken = null
                    app.globalData.userInfo = null
                    app.globalData.isLoggedIn = false
                    
                    wx.removeStorageSync('access_token')
                    wx.removeStorageSync('refresh_token')
                    wx.removeStorageSync('user_info')
                    wx.removeStorageSync('token_expire_time')
                    
                    wx.reLaunch({
                      url: '/pages/auth/auth'
                    })
                  }
                }
              })
            }
            
            reject({
              code: 2001,
              msg: '访问令牌无效，请重新登录',
              data: res.data.data || null,
              debug: 'Token过期或无效',
              isBackendError: true,
              needsRelogin: true
            })
          } else {
            // 🔴 其他业务错误 - 增强后端服务异常提示
            const errorMessage = res.data.msg || res.data.message || '操作失败'
            console.log('📝 业务错误:', {
              code: res.data.code,
              message: errorMessage,
              url: url,
              method: method
            })
            
            if (showLoading) {
              // 🔴 根据最新接口对接规范，显示详细的后端服务异常信息
              wx.showModal({
                title: '🚨 后端服务异常',
                content: `${errorMessage}\n\n🔗 API端点：${fullUrl}\n错误码：${res.data.code}\n\n请检查后端API服务状态！`,
                showCancel: false,
                confirmText: '知道了',
                confirmColor: '#ff4444'
              })
            }
            
            reject({
              code: res.data.code,
              msg: errorMessage,
              data: res.data.data || null,
              isBackendError: true
            })
          }
        } else {
          // 🔴 HTTP状态码错误 - 增强后端服务异常提示
          let errorMessage = '网络错误'
          
          switch (res.statusCode) {
            case 400:
              errorMessage = '请求参数错误'
              break
            case 403:
              errorMessage = '权限不足'
              break
            case 404:
              errorMessage = '接口不存在'
              break
            case 500:
              errorMessage = '服务器内部错误'
              break
            case 502:
              errorMessage = '网关错误'
              break
            case 503:
              errorMessage = '🚨 后端服务暂不可用\n\n可能原因：\n• 服务器维护中\n• 服务器过载\n• 后端API服务未启动\n\n请联系后端程序员检查服务器状态！'
              break
            default:
              errorMessage = `网络错误 ${res.statusCode}`
          }
          
          if (showLoading) {
            // 🔴 根据最新接口对接规范，显示详细的HTTP错误信息
            wx.showModal({
              title: '🚨 后端服务异常',
              content: `${errorMessage}\n\n🔗 API端点：${fullUrl}\nHTTP状态码：${res.statusCode}\n\n请检查后端API服务状态！`,
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#ff4444'
            })
          }
          
          reject({ 
            code: res.statusCode, 
            msg: errorMessage,
            data: null,
            isBackendError: true,
            httpStatus: res.statusCode
          })
        }
      },
      fail(err) {
        if (showLoading) {
          wx.hideLoading()
        }
        
        // 🔴 网络错误处理 - 增强后端服务异常提示
        const errorMessage = '网络连接失败'
        console.error('❌ 网络错误:', { 
          error: err, 
          url: fullUrl, 
          method: method,
          timeout: timeout
        })
        
        // 🔴 根据最新接口对接规范，显示详细的网络错误信息
        if (showLoading) {
          wx.showModal({
            title: '🚨 后端服务异常',
            content: `网络连接失败！\n\n🔗 API端点：${fullUrl}\n错误详情：${err.errMsg || '未知网络错误'}\n\n请检查：\n• 网络连接是否正常\n• 后端API服务是否启动\n• 服务器地址是否正确`,
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#ff4444'
          })
        }
        
        reject({ 
          code: -1, 
          msg: errorMessage,
          data: null,
          isNetworkError: true,
          originalError: err
        })
      }
    })
  })
}

// 🔴 用户认证API - 必须调用真实后端接口
const authAPI = {
  /**
   * 🔴 发送验证码 - 必须调用真实API
   */
  sendCode(phone) {
    return request({
      url: '/auth/send-code',
      method: 'POST',
      data: { 
        phone,
        dev_mode: app.globalData.isDev || false,
        skip_sms: app.globalData.isDev || false
      },
      needAuth: false,
      showLoading: true
    })
  },

  /**
   * 📱 用户登录
   */
  login(formData) {
    const phone = formData.phone || formData.phoneNumber
    const code = formData.code || formData.verificationCode || formData.verify_code
    
    const requestData = { 
      phone: String(phone).trim(),
      verify_code: String(code).trim(),
      dev_mode: app.globalData.isDev || false,
      skip_sms_verify: app.globalData.isDev || false
    }
    
    return request({
      url: '/auth/login',
      method: 'POST',
      data: requestData,
      needAuth: false,
      showLoading: false,
      timeout: 15000,
      maxRetry: 3
    })
  },

  /**
   * 刷新Token
   */
  refresh(refreshToken) {
    return request({
      url: '/auth/refresh',
      method: 'POST',
      data: { refresh_token: refreshToken },
      needAuth: false
    })
  },

  /**
   * 验证Token有效性
   */
  verifyToken() {
    return request({
      url: '/auth/verify-token',
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 用户退出登录
   */
  logout() {
    return request({
      url: '/auth/logout',
      method: 'POST',
      needAuth: true
    })
  }
}

// 🔴 抽奖API
const lotteryAPI = {
  getConfig() {
    return request({
      url: '/lottery/config',
      method: 'GET',
      needAuth: true
    })
  },

  draw(drawType = 'single', count = 1) {
    return request({
      url: '/lottery/draw',
      method: 'POST',
      data: { type: drawType, count },
      needAuth: true
    })
  },

  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/lottery/records',
      method: 'GET',
      data: { page, page_size: pageSize },
      needAuth: true
    })
  },

  getStatistics() {
    return request({
      url: '/lottery/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 🔴 兑换API
const exchangeAPI = {
  getCategories() {
    return request({
      url: '/exchange/categories',
      method: 'GET',
      needAuth: true
    })
  },

  getProducts(page = 1, pageSize = 20, category = 'all', sort = 'points') {
    return request({
      url: '/exchange/products',
      method: 'GET',
      data: { page, page_size: pageSize, category, sort },
      needAuth: true
    })
  },

  redeem(productId, quantity = 1) {
    return request({
      url: '/exchange/redeem',
      method: 'POST',
      data: { product_id: productId, quantity },
      needAuth: true
    })
  },

  getRecords(page = 1, pageSize = 20, status = 'all') {
    return request({
      url: '/exchange/records',
      method: 'GET',
      data: { page, page_size: pageSize, status },
      needAuth: true
    })
  },

  getStatistics() {
    return request({
      url: '/exchange/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 🔴 上传API
const uploadAPI = {
  upload(filePath, userAmount) {
    return new Promise((resolve, reject) => {
      const app = getApp()
      
      if (!app.globalData.accessToken) {
        reject({
          code: 2001,
          msg: '访问令牌缺失，请重新登录',
          needsRelogin: true
        })
        return
      }

      const header = {}
      if (app.globalData.accessToken) {
        header['Authorization'] = `Bearer ${app.globalData.accessToken}`
      }

      wx.uploadFile({
        url: app.globalData.baseUrl + '/photo/upload',
        filePath: filePath,
        name: 'photo',
        formData: {
          amount: userAmount
        },
        header: header,
        success(res) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data)
            } else {
              reject({
                code: data.code,
                msg: data.msg || '上传失败',
                isBackendError: true
              })
            }
          } catch (parseError) {
            reject({
              code: -1,
              msg: '响应解析失败',
              isBackendError: true
            })
          }
        },
        fail(err) {
          reject({
            code: -1,
            msg: '上传失败',
            isNetworkError: true,
            originalError: err
          })
        }
      })
    })
  },

  getRecords(page = 1, pageSize = 20, status = 'all', forceRefresh = false) {
    return request({
      url: '/photo/history',
      method: 'GET',
      data: { 
        page, 
        limit: pageSize, 
        status,
        // 🔧 新增：添加时间戳强制刷新缓存
        _t: forceRefresh ? Date.now() : undefined
      },
      needAuth: true,
      // 🔧 修复：强制显示加载，避免缓存问题
      showLoading: true
    })
  },

  getHistory(page = 1, pageSize = 10, status = 'all') {
    console.log('📡 获取上传历史请求:', { page, pageSize, status })
    
    return request({
      url: '/photo/history',
      method: 'GET',
      data: { page, limit: pageSize, status },
      needAuth: true,
      showLoading: false
    }).catch(error => {
      console.error('❌ 获取上传历史失败:', error)
      
      if (!error.isBackendError && !error.isNetworkError) {
        wx.showModal({
          title: '🚨 后端服务异常',
          content: `无法获取上传历史！\n\n🔗 API端点：${app.globalData.baseUrl}/photo/history\n\n请检查后端API服务状态！`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
      }
      
      throw error
    })
  },

  getStatistics() {
    return request({
      url: '/photo/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 🔴 用户API
const userAPI = {
  getUserInfo() {
    return request({
      url: '/user/info',
      method: 'GET',
      needAuth: true
    })
  },

  updateUserInfo(userInfo) {
    return request({
      url: '/user/info',
      method: 'PUT',
      data: userInfo,
      needAuth: true
    })
  },

  getStatistics() {
    return request({
      url: '/user/statistics',
      method: 'GET',
      needAuth: true
    })
  },

  getPointsRecords(page = 1, pageSize = 20, type = 'all', source = '') {
    return request({
      url: '/user/points/records',
      method: 'GET',
      data: { page, page_size: pageSize, type, source },
      needAuth: true
    })
  },

  // 🔧 修复：添加缺失的uploadAvatar方法
  uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
      const app = getApp()
      
      if (!app.globalData.accessToken) {
        reject({
          code: 2001,
          msg: '访问令牌缺失，请重新登录',
          needsRelogin: true
        })
        return
      }

      const header = {}
      if (app.globalData.accessToken) {
        header['Authorization'] = `Bearer ${app.globalData.accessToken}`
      }

      wx.uploadFile({
        url: app.globalData.baseUrl + '/user/avatar',
        filePath: filePath,
        name: 'avatar',
        header: header,
        success(res) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data)
            } else {
              reject({
                code: data.code,
                msg: data.msg || '头像上传失败',
                isBackendError: true
              })
            }
          } catch (parseError) {
            reject({
              code: -1,
              msg: '响应解析失败',
              isBackendError: true
            })
          }
        },
        fail(err) {
          reject({
            code: -1,
            msg: '头像上传失败',
            isNetworkError: true,
            originalError: err
          })
        }
      })
    })
  },

  checkIn() {
    return request({
      url: '/user/check-in',
      method: 'POST',
      needAuth: true
    })
  }
}

// 🔴 商家API
const merchantAPI = {
  apply(authInfo = {}) {
    return request({
      url: '/merchant/apply',
      method: 'POST',
      data: authInfo,
      needAuth: true
    })
  },

  getStatistics() {
    return request({
      url: '/merchant/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

module.exports = {
  request,
  authAPI,
  lotteryAPI,
  exchangeAPI,
  uploadAPI,
  userAPI,
  merchantAPI
} 