// utils/api.js - API接口请求封装（完全符合接口对接规范文档标准）
const app = getApp()

/**
 * 🔴 统一网络请求封装 - 严格遵循接口对接规范文档标准
 * 🚨 严禁使用Mock数据 - 100%使用真实后端API
 * 🎯 版本：v2.2.0 权限简化版 - 完全符合接口对接规范文档
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
      const token = app.globalData.accessToken
      if (token && typeof token === 'string' && token.trim() !== '') {
        // 🔴 确保Bearer Token格式严格正确
        header['Authorization'] = `Bearer ${token.trim()}`
        console.log('🔐 已添加认证头部:', `Bearer ${token.substring(0, 20)}...`)
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

    // 构建完整URL地址
    const fullUrl = app.globalData.baseUrl + url

    console.log('📡 发起API请求:', { 
      url: fullUrl, 
      method, 
      needAuth, 
      hasAuthHeader: !!header['Authorization'],
      headers: header,
      tokenInfo: needAuth ? {
        hasToken: !!app.globalData.accessToken,
        tokenLength: app.globalData.accessToken ? app.globalData.accessToken.length : 0
      } : null
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

        console.log(`📡 API响应 ${method} ${url}:`, {
          request: data,
          response: res.data,
          status: res.statusCode
        })

        // 🔴 根据接口对接规范文档统一错误处理
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
            // 🔧 2001错误码的精确处理
            console.error('🚨 认证错误 2001 - 访问令牌不能为空:', {
              url: url,
              method: method,
              requestHeaders: header,
              hasGlobalToken: !!app.globalData.accessToken,
              globalTokenInfo: {
                token: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 30)}...` : null,
                isLoggedIn: app.globalData.isLoggedIn,
                userInfo: app.globalData.userInfo ? {
                  user_id: app.globalData.userInfo.user_id,
                  mobile: app.globalData.userInfo.mobile
                } : null
              }
            })
            
            // 🔧 智能Token修复机制
            if (retryCount < maxRetry) {
              console.log('🔄 检测到2001错误，尝试Token自动修复...')
              
              // 检查本地存储中的Token
              const storedToken = wx.getStorageSync('access_token')
              const storedUserInfo = wx.getStorageSync('user_info')
              
              if (storedToken && storedToken !== app.globalData.accessToken) {
                console.log('🔧 发现本地存储Token与全局Token不一致，尝试修复...')
                app.globalData.accessToken = storedToken
                if (storedUserInfo) {
                  app.globalData.userInfo = storedUserInfo
                  app.globalData.isLoggedIn = true
                }
                
                // 重新发起请求
                const newOptions = { ...options, retryCount: retryCount + 1 }
                request(newOptions).then(resolve).catch(reject)
                return
              }
              
              // 尝试Token刷新
              const refreshToken = app.globalData.refreshToken || wx.getStorageSync('refresh_token')
              if (refreshToken) {
                console.log('🔄 尝试使用refresh token重新获取访问令牌...')
                app.refreshToken().then(() => {
                  const newOptions = { ...options, retryCount: retryCount + 1 }
                  request(newOptions).then(resolve).catch(reject)
                }).catch((refreshError) => {
                  console.error('❌ Refresh token失败:', refreshError)
                  this.handleTokenFailure(fullUrl, reject)
                })
                return
              }
            }
            
            // 🔴 修复失败，显示用户友好提示
            this.handleTokenFailure(fullUrl, reject)
          } else if (res.data.code === 4005) {
            // 🔴 权限简化版：管理员权限不足错误
            console.error('🚨 管理员权限不足 4005:', {
              url: url,
              method: method,
              userInfo: app.globalData.userInfo ? {
                user_id: app.globalData.userInfo.user_id,
                is_admin: app.globalData.userInfo.is_admin
              } : null
            })
            
            if (showLoading) {
              wx.showModal({
                title: '🔐 权限不足',
                content: '此功能需要管理员权限才能访问。\n\n如果您是管理员，请检查：\n• 登录状态是否正常\n• 管理员权限是否生效\n\n建议重新登录或联系系统管理员。',
                showCancel: false,
                confirmText: '我知道了',
                confirmColor: '#ff4444'
              })
            }
            
            reject({
              code: res.data.code,
              msg: res.data.msg || '需要管理员权限',
              data: res.data.data || null,
              isPermissionError: true
            })
          } else {
            // 🔴 其他业务错误 - 根据接口对接规范文档增强错误处理
            const errorMessage = res.data.msg || res.data.message || '操作失败'
            console.log('📝 业务错误:', {
              code: res.data.code,
              message: errorMessage,
              url: url,
              method: method
            })
            
            if (showLoading) {
              // 🔴 根据接口对接规范文档，显示详细的后端服务异常信息
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
          // HTTP状态码非200
          const statusMessage = `HTTP ${res.statusCode} 错误`
          console.error('❌ HTTP状态错误:', {
            statusCode: res.statusCode,
            url: fullUrl,
            response: res.data
          })
          
          if (showLoading) {
            wx.showModal({
              title: '🚨 网络请求失败',
              content: `${statusMessage}\n\n🔗 API端点：${fullUrl}\n\n请检查网络连接和后端服务状态！`,
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#ff4444'
            })
          }
          
          reject({
            code: res.statusCode,
            msg: statusMessage,
            data: res.data || null,
            isNetworkError: true
          })
        }
      },
      fail(err) {
        if (showLoading) {
          wx.hideLoading()
        }

        console.error('❌ 网络请求失败:', {
          url: fullUrl,
          method: method,
          error: err
        })

        // 🔴 根据接口对接规范文档，增强网络错误处理
        const errorMessage = err.errMsg || '网络请求失败'
        
        // 判断是否是网络连接问题
        if (errorMessage.includes('timeout') || errorMessage.includes('fail')) {
          wx.showModal({
            title: '🌐 网络连接异常',
            content: `网络请求超时或失败\n\n🔗 API端点：${fullUrl}\n错误信息：${errorMessage}\n\n请检查网络连接状态！`,
            showCancel: true,
            cancelText: '稍后重试',
            confirmText: '重新请求',
            success: (modalRes) => {
              if (modalRes.confirm && retryCount < maxRetry) {
                // 重新发起请求
                const newOptions = { ...options, retryCount: retryCount + 1 }
                request(newOptions).then(resolve).catch(reject)
              } else {
                reject({
                  code: -1,
                  msg: '网络请求失败: ' + errorMessage,
                  data: null,
                  isNetworkError: true,
                  originalError: err
                })
              }
            }
          })
        } else {
          reject({
            code: -1,
            msg: '网络请求失败: ' + errorMessage,
            data: null,
            isNetworkError: true,
            originalError: err
          })
        }
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
   * 🔧 获取用户统计
   */
  getStatistics() {
    return request({
      url: '/user/statistics',
      method: 'GET',
      needAuth: true
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
      url: '/merchant/product-stats',  // 🔴 已修复路径
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
  authAPI,
  lotteryAPI,
  exchangeAPI,
  uploadAPI,
  userAPI,
  merchantAPI,
  handleTokenFailure  // 导出Token失效处理函数
} 