// utils/api.js - API接口请求封装（完全符合接口对接规范文档标准）
const app = getApp()

/**
 * 🔴 增强版Token验证函数 - 修复商品显示空白问题
 * 🎯 解决JWT认证失败导致的401错误
 */
const validateToken = (token) => {
  console.log('🔍 开始Token验证...')
  
  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.error('❌ Token格式无效:', { 
      exists: !!token, 
      type: typeof token, 
      length: token ? token.length : 0 
    })
    return {
      isValid: false,
      error: 'TOKEN_INVALID',
      message: 'Token不存在或格式无效',
      needsRelogin: true
    }
  }
  
  // JWT格式检查
  const parts = token.split('.')
  if (parts.length !== 3) {
    console.error('❌ JWT格式错误，部分数量:', parts.length)
    return {
      isValid: false,
      error: 'TOKEN_INVALID_JWT',
      message: `Token不是有效的JWT格式 (${parts.length}/3)`,
      needsRelogin: true
    }
  }
  
  try {
    // 解码Header和Payload
    const header = JSON.parse(atob(parts[0]))
    const payload = JSON.parse(atob(parts[1]))
    const now = Math.floor(Date.now() / 1000)
    
    console.log('🔍 JWT解码成功:', {
      header: header,
      userId: payload.user_id || payload.userId || payload.sub,
      mobile: payload.mobile,
      isAdmin: payload.is_admin || payload.isAdmin,
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : '未设置',
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : '永不过期',
      currentTime: new Date().toLocaleString()
    })
    
    // 🔴 关键：检查Token是否过期
    if (payload.exp && payload.exp < now) {
      const expiredSeconds = now - payload.exp
      const expiredMinutes = Math.floor(expiredSeconds / 60)
      const expiredHours = Math.floor(expiredMinutes / 60)
      
      console.error('❌ Token已过期:', {
        过期时间: new Date(payload.exp * 1000).toLocaleString(),
        当前时间: new Date().toLocaleString(),
        过期时长: expiredHours > 0 ? `${expiredHours}小时${expiredMinutes % 60}分钟前` : `${expiredMinutes}分钟前`
      })
      
      return {
        isValid: false,
        error: 'TOKEN_EXPIRED',
        message: `Token已过期 (${expiredHours > 0 ? expiredHours + '小时' : expiredMinutes + '分钟'}前)`,
        expiredAt: new Date(payload.exp * 1000).toLocaleString(),
        expiredSeconds: expiredSeconds,
        needsRelogin: expiredSeconds > 1800, // 超过30分钟则需要重新登录
        canRefresh: expiredSeconds <= 1800    // 30分钟内可以尝试刷新
      }
    }
    
    // 🔴 增强：检查即将过期的Token (10分钟内)
    const secondsUntilExpiry = payload.exp ? payload.exp - now : null
    const willExpireSoon = secondsUntilExpiry && secondsUntilExpiry < 600
    
    if (willExpireSoon) {
      const minutesLeft = Math.floor(secondsUntilExpiry / 60)
      console.warn('⚠️ Token即将过期:', minutesLeft + '分钟后')
    }
    
    // 🔴 增强：检查必要的用户字段
    const hasUserId = !!(payload.user_id || payload.userId || payload.sub)
    if (!hasUserId) {
      console.error('❌ Token缺少用户ID字段')
      return {
        isValid: false,
        error: 'TOKEN_MISSING_USER_ID',
        message: 'Token缺少用户信息',
        needsRelogin: true
      }
    }
    
    console.log('✅ Token验证通过')
    return {
      isValid: true,
      token: token,
      header: header,
      payload: payload,
      userId: payload.user_id || payload.userId || payload.sub,
      mobile: payload.mobile,
      isAdmin: payload.is_admin || payload.isAdmin || false,
      issuedAt: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : null,
      expiresAt: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : '永不过期',
      willExpireSoon: willExpireSoon,
      secondsUntilExpiry: secondsUntilExpiry,
      message: `Token有效${payload.exp ? '，有效期至' + new Date(payload.exp * 1000).toLocaleString() : '，无过期时间'}`
    }
    
  } catch (decodeError) {
    console.error('❌ JWT解码失败:', decodeError.message)
    console.error('🔍 Token前100字符:', token.substring(0, 100))
    
    return {
      isValid: false,
      error: 'TOKEN_DECODE_ERROR',
      message: 'Token解码失败，可能已损坏',
      decodeError: decodeError.message,
      needsRelogin: true
    }
  }
}

/**
 * 🔴 Token自动刷新函数 - 增强版
 */
const attemptTokenRefresh = () => {
  return new Promise((resolve, reject) => {
    const app = getApp()
    const refreshToken = app.globalData.refreshToken || wx.getStorageSync('refresh_token')
    
    if (!refreshToken) {
      console.error('❌ 无refresh token，无法自动刷新')
      reject(new Error('REFRESH_TOKEN_MISSING'))
      return
    }
    
    console.log('🔄 开始Token刷新...')
    
    wx.request({
      url: 'https://omqktqrtntnn.sealosbja.site/api/auth/refresh',
      method: 'POST',
      data: { refreshToken },
      header: {
        'Content-Type': 'application/json'
      },
      timeout: 10000,
      success: (res) => {
        if (res.statusCode === 200 && res.data.code === 0) {
          const newTokens = res.data.data
          
          // 更新全局Token
          app.globalData.accessToken = newTokens.access_token
          app.globalData.refreshToken = newTokens.refresh_token
          
          // 更新本地存储
          wx.setStorageSync('access_token', newTokens.access_token)
          wx.setStorageSync('refresh_token', newTokens.refresh_token)
          
          console.log('✅ Token刷新成功')
          resolve(newTokens)
        } else {
          console.error('❌ Token刷新失败:', res.data)
          reject(new Error('REFRESH_FAILED'))
        }
      },
      fail: (error) => {
        console.error('❌ Token刷新请求失败:', error)
        reject(new Error('REFRESH_REQUEST_FAILED'))
      }
    })
  })
}

/**
 * 🔴 Token刷新失败处理函数 - 增强版
 */
const handleTokenRefreshFailure = () => {
  console.log('🔑 处理Token刷新失败...')
  
  const app = getApp()
  
  // 清理所有认证信息
  app.globalData.accessToken = null
  app.globalData.refreshToken = null
  app.globalData.userInfo = null
  app.globalData.isLoggedIn = false
  
  // 清理本地存储
  wx.removeStorageSync('access_token')
  wx.removeStorageSync('refresh_token')
  wx.removeStorageSync('user_info')
  
  // 显示提示并跳转登录
  wx.showModal({
    title: '🔑 认证已失效',
    content: '登录状态已失效，需要重新登录\n\n这是解决商品显示空白问题的必要步骤',
    showCancel: false,
    confirmText: '重新登录',
    confirmColor: '#FF6B35',
    success: () => {
      wx.reLaunch({
        url: '/pages/auth/auth'
      })
    }
  })
}

/**
 * 🔴 统一网络请求封装 - 严格遵循接口对接规范文档标准
 * 🚨 严禁使用Mock数据 - 100%使用真实后端API
 * 🎯 版本：v2.2.0 权限简化版 - 完全符合接口对接规范文档
 * 🔧 增强版：完善调试信息和错误处理
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
      timeout = 12000
    } = options
    const app = getApp()
    
    // 🔧 确保app已初始化
    if (!app || !app.globalData) {
      console.error('❌ App未初始化，无法发起请求')
      reject({ code: -1, msg: '应用未初始化', data: null })
      return
    }

    // 🔧 调试信息：记录请求详情
    console.log('📡 发起API请求:', {
      url: url,
      method: method,
      needAuth: needAuth,
      hasToken: !!app.globalData.accessToken,
      dataParams: method === 'GET' ? data : '(POST data)'
    })

    // 显示加载框
    if (showLoading) {
      wx.showLoading({
        title: '加载中...',
        mask: true
      })
    }

    // 🔧 构建标准请求头，确保Bearer Token格式正确
    const header = {
      'Content-Type': 'application/json',
      'X-Client-Version': '2.2.0', // 🔴 版本更新为权限简化版
      'X-Platform': 'wechat-miniprogram'
    }

    // 🔧 增强Token认证处理，确保格式严格符合后端要求
    if (needAuth) {
      // 🔴 增强：优先从全局数据获取token，降级到本地存储
      let token = app.globalData.accessToken
      if (!token) {
        token = wx.getStorageSync('access_token')
        if (token) {
          // 同步到全局数据
          app.globalData.accessToken = token
          console.log('🔧 从本地存储恢复Token到全局数据')
        }
      }
      
      if (token && typeof token === 'string' && token.trim() !== '') {
        // 🔴 增强：Token有效性预检查 - 解决商品显示空白问题
        const tokenValidation = validateToken(token)
        
        if (!tokenValidation.isValid) {
          console.error('❌ Token预检查失败:', tokenValidation.error, tokenValidation.message)
          
          if (showLoading) {
            wx.hideLoading()
          }
          
          // 🔴 修复：根据Token错误类型采取不同策略
          if (tokenValidation.error === 'TOKEN_EXPIRED') {
            // Token过期，尝试刷新
            if (tokenValidation.canRefresh) {
              console.log('🔄 Token过期但可刷新，尝试自动刷新...')
              return attemptTokenRefresh().then((newTokens) => {
                console.log('✅ Token刷新成功，重新发起请求')
                // 刷新成功后重新发起请求
                return request(options)
              }).catch((refreshError) => {
                console.error('❌ Token刷新失败:', refreshError)
                // 刷新失败，清理并跳转登录
                handleTokenRefreshFailure()
                reject({
                  code: 4002,
                  msg: 'Token已过期且刷新失败，请重新登录',
                  data: null,
                  statusCode: 401,
                  isAuthError: true,
                  needsRelogin: true
                })
                return
              })
            } else {
              // Token过期太久，直接要求重新登录
              console.error('🚨 Token过期时间过长，需要重新登录')
              handleTokenRefreshFailure()
              reject({
                code: 4002,
                msg: 'Token过期时间过长，请重新登录',
                data: null,
                statusCode: 401,
                isAuthError: true,
                needsRelogin: true
              })
              return
            }
          } else {
            // 其他Token错误（格式错误、解码失败等），直接要求重新登录
            console.error('🚨 Token存在严重问题，需要重新登录:', tokenValidation.error)
            handleTokenRefreshFailure()
            reject({
              code: 4002,
              msg: tokenValidation.message || 'Token无效，请重新登录',
              data: null,
              statusCode: 401,
              isAuthError: true,
              needsRelogin: true
            })
            return
          }
        }
        
        // Token验证通过，添加认证头部
        header['Authorization'] = `Bearer ${token.trim()}`
        console.log('🔐 Token验证通过，已添加认证头部:', `Bearer ${token.substring(0, 20)}...`)
        console.log('🔍 Token信息:', {
          userId: tokenValidation.userId,
          isAdmin: tokenValidation.isAdmin,
          expiresAt: tokenValidation.expiresAt,
          willExpireSoon: tokenValidation.willExpireSoon
        })
      } else {
        console.error('⚠️ 需要认证但Token无效!', { 
          needAuth, 
          hasToken: !!token,
          tokenType: typeof token,
          tokenLength: token ? token.length : 0,
          isLoggedIn: app.globalData.isLoggedIn
        })
        
        // 🔧 Token无效时立即提示用户
        if (showLoading) {
          wx.hideLoading()
        }
        
        wx.showModal({
          title: '🔑 认证状态异常',
          content: '当前用户认证Token无效！\n\n可能原因：\n• Token已过期\n• 登录状态异常\n• 应用缓存问题\n\n建议立即重新登录。',
          showCancel: true,
          cancelText: '稍后处理',
          confirmText: '重新登录',
          confirmColor: '#ff4444',
          success: (modalRes) => {
            if (modalRes.confirm) {
              // 清理认证信息并跳转登录
              app.globalData.accessToken = null
              app.globalData.refreshToken = null
              app.globalData.userInfo = null
              app.globalData.isLoggedIn = false
              
              wx.removeStorageSync('access_token')
              wx.removeStorageSync('refresh_token')
              wx.removeStorageSync('user_info')
              
              wx.reLaunch({
                url: '/pages/auth/auth'
              })
            }
          }
        })
        
        reject({
          code: 2001,
          msg: '访问令牌不能为空',
          data: null,
          needsRelogin: true
        })
        return
      }
    }

    // 🔧 构建完整请求URL - 确保使用正确的baseURL
    const baseURL = 'https://omqktqrtntnn.sealosbja.site/api'
    const fullURL = url.startsWith('http') ? url : `${baseURL}${url}`
    
    console.log('🌐 完整请求URL:', fullURL)
    console.log('📋 请求头部:', header)

    // 🔧 发起请求
    const requestTime = Date.now()
    wx.request({
      url: fullURL,
      method: method.toUpperCase(),
      data: data,
      header: header,
      timeout: timeout,
      success: (res) => {
        const responseTime = Date.now() - requestTime
        console.log(`✅ API响应成功 [${responseTime}ms]:`, {
          url: url,
          statusCode: res.statusCode,
          dataSize: JSON.stringify(res.data).length
        })
        console.log('📦 响应数据预览:', JSON.stringify(res.data, null, 2).substring(0, 500) + '...')
        
        if (showLoading) {
          wx.hideLoading()
        }

        // 🔧 HTTP状态码处理 - 🔴 增强401认证失败处理
        if (res.statusCode !== 200) {
          console.error('❌ HTTP状态码异常:', res.statusCode, '完整响应:', res)
          
          // 🔴 特殊处理401认证失败 - 商品显示空白问题的关键诊断点
          if (res.statusCode === 401) {
            console.error('🔑 401认证失败详情 - 这是商品显示空白的直接原因:', {
              statusCode: res.statusCode,
              data: res.data,
              header: res.header,
              requestUrl: url,
              requestMethod: method,
              hasAuthHeader: !!header['Authorization'],
              authHeaderPreview: header['Authorization'] ? header['Authorization'].substring(0, 30) + '...' : 'NO_AUTH_HEADER'
            })
            
            // 🔴 根据后端程序员分析：这是JWT认证失败的明确标志
            const errorMessage = res.data && res.data.msg ? res.data.msg : '访问令牌无效或已过期'
            console.error('🚨 JWT认证失败原因 - 这会导致商品列表为空:', errorMessage)
            
            // 🔴 修复：详细分析401错误，帮助定位商品显示问题
            let detailedError = '管理员Token认证失败导致无法获取商品列表\n\n'
            
            if (header['Authorization']) {
              detailedError += '📊 Token状态分析:\n'
              detailedError += `• 请求携带了Authorization头部\n`
              detailedError += `• Token格式: ${header['Authorization'].substring(0, 20)}...\n`
              detailedError += `• 后端拒绝了此Token\n\n`
              
              detailedError += '🔍 可能原因:\n'
              detailedError += '• Token已过期\n'
              detailedError += '• Token格式错误\n'
              detailedError += '• JWT密钥不匹配\n'
              detailedError += '• 用户权限不足\n\n'
            } else {
              detailedError += '⚠️ 请求未携带Authorization头部\n\n'
              detailedError += '🔍 可能原因:\n'
              detailedError += '• 用户未登录\n'
              detailedError += '• Token丢失\n'
              detailedError += '• API调用配置错误\n\n'
            }
            
            detailedError += '🔧 建议解决方案:\n'
            detailedError += '1. 管理员重新登录\n'
            detailedError += '2. 检查Token有效期\n'
            detailedError += '3. 清除缓存重新登录\n'
            detailedError += '4. 联系技术支持'
            
            // 清理认证信息
            app.globalData.accessToken = null
            app.globalData.refreshToken = null
            app.globalData.userInfo = null
            app.globalData.isLoggedIn = false
            
            // 清理本地存储
            wx.removeStorageSync('access_token')
            wx.removeStorageSync('refresh_token')
            wx.removeStorageSync('user_info')
            
            // 隐藏加载框
            if (showLoading) {
              wx.hideLoading()
            }
            
            // 🔴 修复：显示更详细的JWT认证失败提示，帮助解决商品显示空白问题
            wx.showModal({
              title: '🔑 JWT认证失败',
              content: detailedError,
              showCancel: true,
              cancelText: '稍后处理',
              confirmText: '重新登录',
              confirmColor: '#ff4444',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.reLaunch({
                    url: '/pages/auth/auth'
                  })
                }
              }
            })
            
            reject({
              code: 4002,  // 🔴 使用后端标准错误码
              msg: errorMessage,
              data: res.data,
              statusCode: 401,
              isAuthError: true,
              needsRelogin: true,
              // 🔴 新增：商品显示问题诊断信息
              isProductDisplayIssue: true,
              troubleshooting: detailedError
            })
            return
          }
          
          // 🔧 其他HTTP错误处理
          const errorMsg = res.data && res.data.msg ? res.data.msg : `请求失败 (${res.statusCode})`
          
          if (showLoading) {
            wx.hideLoading()
          }
          
          reject({
            code: res.data ? res.data.code : res.statusCode,
            msg: errorMsg,
            data: res.data,
            statusCode: res.statusCode
          })
          return
        }

        // 🔧 响应数据处理 - 增强兼容性
        let responseData = res.data
        
        // 确保响应数据是对象
        if (typeof responseData === 'string') {
          try {
            responseData = JSON.parse(responseData)
          } catch (e) {
            console.error('❌ 响应数据解析失败:', e)
            reject({
              code: -2,
              msg: '响应数据格式错误',
              data: null,
              originalData: responseData
            })
            return
          }
        }

        // 🔧 业务状态码处理 - 兼容多种格式
        if (responseData.code !== undefined && responseData.code !== 0) {
          console.error('❌ 业务错误:', responseData.code, responseData.msg)
          reject({
            code: responseData.code,
            msg: responseData.msg || responseData.message || '请求失败',
            data: responseData.data || null
          })
          return
        }

        // 🎉 请求成功
        resolve(responseData)
      },
      fail: (err) => {
        const responseTime = Date.now() - requestTime
        console.error(`❌ API请求失败 [${responseTime}ms]:`, {
          url: url,
          error: err.errMsg,
          retryCount: retryCount
        })
        
        if (showLoading) {
          wx.hideLoading()
        }

        // 🔧 网络错误重试机制
        if (retryCount < maxRetry && (
          err.errMsg?.includes('timeout') || 
          err.errMsg?.includes('fail') ||
          err.errMsg?.includes('network')
        )) {
          console.log(`🔄 第${retryCount + 1}次重试请求:`, url)
          setTimeout(() => {
            request({
              ...options,
              retryCount: retryCount + 1,
              showLoading: false // 重试时不显示loading
            }).then(resolve).catch(reject)
          }, 1000 * (retryCount + 1)) // 递增延迟
          return
        }

        // 🔧 网络错误处理
        let errorMsg = '网络请求失败'
        if (err.errMsg?.includes('timeout')) {
          errorMsg = '请求超时，请检查网络连接'
        } else if (err.errMsg?.includes('fail')) {
          errorMsg = '网络连接失败'
        }

        reject({
          code: -1,
          msg: errorMsg,
          data: null,
          originalError: err
        })
      }
    })
  })
}

/**
 * 🔧 处理Token失效错误
 */
const handleTokenFailure = (url, reject) => {
  wx.showModal({
    title: '🔑 认证失败',
    content: `访问令牌验证失败，请重新登录。\n\n请求地址：${url}\n\n点击"重新登录"将清除本地数据并跳转到登录页面。`,
    showCancel: true,
    cancelText: '稍后处理',
    confirmText: '重新登录',
    confirmColor: '#ff4444',
    success: (modalRes) => {
      if (modalRes.confirm) {
        // 清理认证信息
        const app = getApp()
        app.globalData.accessToken = null
        app.globalData.refreshToken = null
        app.globalData.userInfo = null
        app.globalData.isLoggedIn = false
        
        wx.removeStorageSync('access_token')
        wx.removeStorageSync('refresh_token')
        wx.removeStorageSync('user_info')
        
        wx.reLaunch({
          url: '/pages/auth/auth'
        })
      }
    }
  })
  
  reject({
    code: 2001,
    msg: '访问令牌验证失败',
    data: null,
    needsRelogin: true
  })
}

// 🔴 用户认证API（权限简化版v2.2.0）
const authAPI = {
  /**
   * 🔧 发送验证码 - 开发环境跳过实际短信发送
   */
  sendCode(phone) {
    return request({
      url: '/auth/send-code',
      method: 'POST',
      data: { mobile: phone }, // 🔴 参数名统一为mobile
      needAuth: false
    })
  },

  /**
   * 🔴 统一登录接口 - 所有用户使用相同方式登录（权限简化版）
   */
  login(formData) {
    return request({
      url: '/auth/login',
      method: 'POST',
      data: {
        mobile: formData.mobile,   // 🔴 手机号（管理员也使用手机号）
        code: formData.code        // 🔴 验证码（开发环境固定123456）
      },
      needAuth: false
    })
  },

  /**
   * 🔧 刷新Token
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
   * 🔧 验证Token有效性
   */
  verifyToken() {
    return request({
      url: '/auth/verify-token',
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 用户登出
   */
  logout() {
    return request({
      url: '/auth/logout',
      method: 'POST',
      needAuth: true
    })
  }
}

// 🎰 抽奖系统API
const lotteryAPI = {
  /**
   * 🔧 获取抽奖配置
   */
  getConfig() {
    return request({
      url: '/lottery/config',
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 执行抽奖
   */
  draw(drawType = 'single', count = 1) {
    return request({
      url: '/lottery/draw',
      method: 'POST',
      data: { draw_type: drawType, count: count },
      needAuth: true
    })
  },

  /**
   * 🔧 获取抽奖记录
   */
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/lottery/records',
      method: 'GET',
      data: { page, page_size: pageSize },
      needAuth: true
    })
  },

  /**
   * 🔧 获取抽奖统计
   */
  getStatistics() {
    return request({
      url: '/lottery/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 🛍️ 商品兑换API
const exchangeAPI = {
  /**
   * 🔧 获取商品分类
   */
  getCategories() {
    return request({
      url: '/exchange/categories',
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 获取商品列表
   */
  getProducts(page = 1, pageSize = 20, category = 'all', sort = 'points') {
    return request({
      url: '/exchange/products',
      method: 'GET',
      data: { page, page_size: pageSize, category, sort },
      needAuth: true
    })
  },

  /**
   * 🔧 商品兑换
   */
  redeem(productId, quantity = 1) {
    return request({
      url: '/exchange/redeem',
      method: 'POST',
      data: { product_id: productId, quantity },
      needAuth: true
    })
  },

  /**
   * 🔧 获取兑换记录
   */
  getRecords(page = 1, pageSize = 20, status = 'all') {
    return request({
      url: '/exchange/records',
      method: 'GET',
      data: { page, page_size: pageSize, status },
      needAuth: true
    })
  },

  /**
   * 🔧 获取兑换统计
   */
  getStatistics() {
    return request({
      url: '/exchange/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 📸 拍照上传API
const uploadAPI = {
  /**
   * 🔴 简化上传接口 - 用户只需上传照片（权限简化版）
   */
  uploadSimplified(filePath) {
    return new Promise((resolve, reject) => {
      const app = getApp()
      
      // 🔧 检查Token
      const token = app.globalData.accessToken
      if (!token) {
        reject({
          code: 2001,
          msg: '需要登录才能上传照片',
          needsRelogin: true
        })
        return
      }

      // 🔧 显示上传进度
      wx.showLoading({
        title: '正在上传...',
        mask: true
      })

      wx.uploadFile({
        url: app.globalData.baseUrl + '/photo/upload',
        filePath: filePath,
        name: 'photo',
        header: {
          'Authorization': `Bearer ${token}`
        },
        success(res) {
          wx.hideLoading()
          
          console.log('📸 照片上传响应:', res.data)
          
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data)
            } else {
              reject({
                code: data.code,
                msg: data.msg || '照片上传失败',
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
          wx.hideLoading()
          
          console.error('📸 照片上传失败:', err)
          reject({
            code: -1,
            msg: '照片上传失败: ' + (err.errMsg || '未知错误'),
            isNetworkError: true,
            originalError: err
          })
        }
      })
    })
  },

  /**
   * 🔴 已废弃：原上传接口（用户输入金额） - 权限简化版已移除
   */
  upload(filePath, userAmount) {
    console.warn('⚠️ upload接口已废弃，请使用uploadSimplified接口')
    return this.uploadSimplified(filePath)
  },

  /**
   * 🔧 获取上传记录
   */
  getRecords(page = 1, pageSize = 20, status = 'all', forceRefresh = false) {
    return request({
      url: '/photo/records',
      method: 'GET',
      data: { page, page_size: pageSize, status, force_refresh: forceRefresh },
      needAuth: true
    })
  },

  /**
   * 🔧 获取上传历史
   */
  getHistory(page = 1, pageSize = 10, status = 'all') {
    return request({
      url: '/photo/history',
      method: 'GET',
      data: { page, page_size: pageSize, status },
      needAuth: true
    })
  },

  /**
   * 🔧 获取上传统计
   */
  getStatistics() {
    return request({
      url: '/photo/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 👤 用户信息API
const userAPI = {
  /**
   * 🔧 获取用户信息
   */
  getUserInfo() {
    return request({
      url: '/user/info',
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 更新用户信息
   */
  updateUserInfo(userInfo) {
    return request({
      url: '/user/info',
      method: 'PUT',
      data: userInfo,
      needAuth: true
    })
  },

  /**
   * 🔧 获取用户统计 - 修复：使用正确的API路径
   */
  getStatistics() {
    return request({
      url: '/user/statistics',  // 🔴 修复：对应后端 /api/user/statistics
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 获取用户综合统计 - 新增：调用三个统计接口获取完整数据
   */
  getComprehensiveStatistics() {
    // 🔧 并行调用三个统计接口
    return Promise.all([
      this.getStatistics(),           // 用户基本统计
      lotteryAPI.getStatistics(),     // 抽奖统计  
      uploadAPI.getStatistics()       // 拍照统计
    ]).then(([userStats, lotteryStats, photoStats]) => {
      console.log('📊 综合统计数据获取成功:', {
        userStats: userStats.data,
        lotteryStats: lotteryStats.data, 
        photoStats: photoStats.data
      })

      // 🔧 数据整合和字段映射
      return {
        code: 0,
        msg: 'success',
        data: {
          // 🔴 根据后端实际数据结构映射
          totalLottery: lotteryStats.data?.total_draws || 0,
          totalUpload: photoStats.data?.total_uploads || 0,
          approvedUpload: photoStats.data?.approved_uploads || 0,
          currentPoints: userStats.data?.points_statistics?.current_points || 0,
          totalEarned: userStats.data?.points_statistics?.total_earned || 0,
          totalSpent: userStats.data?.points_statistics?.total_spent || 0,
          registrationDays: userStats.data?.user_info?.registration_days || 0,
          
          // 🔧 计算本月积分 (使用当前积分作为本月积分)
          thisMonthPoints: userStats.data?.points_statistics?.current_points || 0,
          
          // 🔧 趋势数据 (暂时使用默认值)
          lotteryTrend: '→',
          exchangeTrend: '→', 
          uploadTrend: '→',
          pointsTrend: '→'
        }
      }
    })
  },

  /**
   * 🔧 获取今日积分趋势 - 修复：支持真实的今日积分数据获取
   */
  getTodayPointsTrend() {
    return request({
      url: '/user/points/today-trend',
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 获取积分记录 - 修复API路径符合接口对接规范文档
   */
  getPointsRecords(page = 1, pageSize = 20, type = 'all', source = '') {
    return request({
      url: '/user/points/records',  // 🔴 修复：符合接口对接规范文档的路径
      method: 'GET',
      data: { page, page_size: pageSize, type, source },
      needAuth: true
    })
  },

  /**
   * 🔧 上传头像
   */
  uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
      const app = getApp()
      
      // 🔧 检查Token
      const token = app.globalData.accessToken
      if (!token) {
        reject({
          code: 2001,
          msg: '需要登录才能上传头像',
          needsRelogin: true
        })
        return
      }

      // 🔧 显示上传进度
      wx.showLoading({
        title: '正在上传头像...',
        mask: true
      })

      wx.uploadFile({
        url: app.globalData.baseUrl + '/user/avatar',
        filePath: filePath,
        name: 'avatar',
        header: {
          'Authorization': `Bearer ${token}`
        },
        success(res) {
          wx.hideLoading()
          
          console.log('🖼️ 头像上传响应:', res.data)
          
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
          wx.hideLoading()
          
          console.error('🖼️ 头像上传失败:', err)
          reject({
            code: -1,
            msg: '头像上传失败: ' + (err.errMsg || '未知错误'),
            isNetworkError: true,
            originalError: err
          })
        }
      })
    })
  },

  /**
   * 🔧 每日签到
   */
  checkIn() {
    return request({
      url: '/user/check-in',
      method: 'POST',
      needAuth: true
    })
  }
}

// 🔴 管理员功能API（权限简化版v2.2.0）
const merchantAPI = {
  /**
   * 🔧 申请商家权限（已废弃 - 权限简化版）
   */
  apply(authInfo = {}) {
    console.warn('⚠️ 商家申请功能已废弃（权限简化版），请使用管理员功能')
    return request({
      url: '/merchant/apply',
      method: 'POST',
      data: authInfo,
      needAuth: true
    })
  },

  /**
   * 🔧 获取管理员统计数据 - 修复API路径符合接口对接规范文档
   */
  getStatistics(period = 'today') {
    return request({
      url: '/merchant/statistics',  // 🔴 修复：符合接口对接规范文档的路径
      method: 'GET',
      data: { period },
      needAuth: true
    })
  },

  /**
   * 🔧 获取待审核列表 - 修复API路径符合接口对接规范文档
   */
  getPendingReviews(page = 1, limit = 20, status = 'pending') {
    return request({
      url: '/merchant/pending-reviews',  // 🔴 修复：符合接口对接规范文档的路径
      method: 'GET',
      data: { page, limit, status },
      needAuth: true
    })
  },

  /**
   * 🔧 审核单个小票 - 修复API路径符合接口对接规范文档
   */
  review(upload_id, action, amount = 0, review_reason = '') {
    return request({
      url: '/merchant/review',  // 🔴 修复：符合接口对接规范文档的路径
      method: 'POST',
      data: { 
        upload_id: upload_id,
        action: action,
        amount: amount,          // 🔴 管理员设置的消费金额
        review_reason: review_reason
      },
      needAuth: true
    })
  },

  /**
   * 🔧 批量审核小票 - 修复API路径符合接口对接规范文档
   */
  batchReview(reviews) {
    return request({
      url: '/merchant/batch-review',  // 🔴 修复：符合接口对接规范文档的路径
      method: 'POST',
      data: { reviews: reviews },
      needAuth: true
    })
  },

  /**
   * 🔴 获取商品统计 - 修复API路径符合接口对接规范文档
   */
  getProductStats() {
    return request({
      url: '/merchant/product-stats',  // �� 已修复路径
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 获取商品列表 - 修复API路径符合接口对接规范文档
   */
  getProducts(page = 1, pageSize = 20, category = 'all', status = 'all', sortBy = 'sort_order', sortOrder = 'ASC') {
    return request({
      url: '/merchant/products',  // 🔴 已修复路径
      method: 'GET',
      data: { 
        page, 
        page_size: pageSize, 
        category, 
        status,
        sort_by: sortBy,
        sort_order: sortOrder
      },
      needAuth: true
    })
  },

  /**
   * 🔴 创建商品 - 修复API路径符合接口对接规范文档
   */
  createProduct(productData) {
    return request({
      url: '/merchant/products',  // 🔴 已修复路径
      method: 'POST',
      data: productData,
      needAuth: true
    })
  },

  /**
   * 🔴 更新商品 - 修复API路径符合接口对接规范文档
   */
  updateProduct(productId, productData) {
    return request({
      url: `/merchant/products/${productId}`,  // 🔴 已修复路径
      method: 'PUT',
      data: productData,
      needAuth: true
    })
  },

  /**
   * 🔴 删除商品 - 修复API路径符合接口对接规范文档
   */
  deleteProduct(productId) {
    return request({
      url: `/merchant/products/${productId}`,  // 🔴 已修复路径
      method: 'DELETE',
      needAuth: true
    })
  },

  /**
   * 🔧 批量更新商品 - 修复API路径符合接口对接规范文档
   */
  batchUpdateProducts(products) {
    return request({
      url: '/merchant/products/batch-update',  // 🔴 已修复路径
      method: 'POST',
      data: { products: products },
      needAuth: true
    })
  },

  /**
   * 🔧 获取抽奖配置 - 修复API路径符合接口对接规范文档
   */
  getLotteryConfig() {
    return request({
      url: '/merchant/lottery/config',  // 🔴 已修复路径
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 获取抽奖统计 - 修复API路径符合接口对接规范文档
   */
  getLotteryStats() {
    return request({
      url: '/merchant/lottery/stats',  // 🔴 已修复路径
      method: 'GET',
      needAuth: true
    })
  },

  /**
   * 🔧 重置抽奖概率 - 修复API路径符合接口对接规范文档
   */
  resetLotteryProbabilities() {
    return request({
      url: '/merchant/lottery/reset-probabilities',  // 🔴 已修复路径
      method: 'POST',
      needAuth: true
    })
  },

  /**
   * 🔧 保存抽奖概率配置 - 修复API路径符合接口对接规范文档
   */
  saveLotteryProbabilities(prizes) {
    return request({
      url: '/merchant/lottery/probabilities',  // 🔴 已修复路径
      method: 'POST',
      data: { prizes },
      needAuth: true
    })
  }
}

// 🔧 导出所有API模块
module.exports = {
  request,
  validateToken,      // 🔴 新增：导出Token验证函数
  authAPI,
  lotteryAPI,
  exchangeAPI,
  uploadAPI,
  userAPI,
  merchantAPI,
  handleTokenFailure  // 导出Token失效处理函数
} 