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
      timeout = 12000
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

    // 🔧 修复：构建标准请求头，确保Bearer Token格式正确
    const header = {
      'Content-Type': 'application/json',
      'X-Client-Version': '2.1.4',
      'X-Platform': 'wechat-miniprogram'
    }

    // 🔧 修复：增强Token认证处理，确保格式严格符合后端要求
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
        
        // 🔧 修复：Token无效时立即提示用户
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
            // 🔧 修复：2001错误码的精确处理
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
            
            // 🔧 增强：智能Token修复机制
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

        console.error('❌ API请求失败:', {
          url: fullUrl,
          method,
          error: err,
          needAuth,
          hasToken: !!app.globalData.accessToken
        })

        // 🔧 修复：网络错误重试机制
        if (retryCount < maxRetry) {
          console.log(`🔄 网络错误重试 ${retryCount + 1}/${maxRetry}:`, fullUrl)
          setTimeout(() => {
            const newOptions = { ...options, retryCount: retryCount + 1 }
            request(newOptions).then(resolve).catch(reject)
          }, 1000 * (retryCount + 1))
        } else {
          // 🔴 重试次数用完，显示网络错误提示
          wx.showModal({
            title: '🚨 后端服务异常',
            content: `网络连接失败！\n\n🔗 API端点：${fullUrl}\n错误详情：${err.errMsg || '未知网络错误'}\n\n请检查：\n• 网络连接是否正常\n• 后端API服务是否启动\n• 服务器地址是否正确`,
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#ff4444'
          })
          
          reject({ 
            code: -1, 
            msg: '网络连接失败',
            data: null,
            isNetworkError: true,
            originalError: err
          })
        }
      }
    })
  })
}

// 🔧 新增：Token失败处理方法
request.handleTokenFailure = function(apiUrl, reject) {
  console.error('🚨 Token认证彻底失败')
  
  wx.showModal({
    title: '🔑 登录状态已失效',
    content: `您的登录状态已过期或无效！\n\n🔗 API：${apiUrl}\n\n为了继续使用应用，请重新登录获取新的访问令牌。`,
    showCancel: true,
    cancelText: '稍后重试',
    confirmText: '重新登录',
    confirmColor: '#ff4444',
    success: (modalRes) => {
      if (modalRes.confirm) {
        // 清理所有认证信息并跳转登录
        const app = getApp()
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
  
  reject({
    code: 2001,
    msg: '访问令牌已失效，请重新登录',
    data: null,
    needsRelogin: true
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

/**
 * 拍照上传相关API
 */
const uploadAPI = {
  /**
   * 🔴 权限简化v2.2.0：简化上传方法
   * 用户只需上传照片，管理员审核时设置消费金额
   */
  uploadSimplified(filePath) {
    return new Promise((resolve, reject) => {
      if (!filePath) {
        reject({
          code: 1001,
          msg: '文件路径不能为空',
          data: null
        })
        return
      }

      const app = getApp()
      
      // 🔧 修复：检查基础配置
      if (!app.globalData.baseUrl) {
        reject({
          code: 1004,
          msg: '系统配置错误：API地址未设置',
          data: null,
          isBusinessError: true
        })
        return
      }

      // 🔧 修复：检查用户登录状态
      if (!app.globalData.accessToken) {
        reject({
          code: 1005,
          msg: '用户未登录，请先登录',
          data: null,
          isBusinessError: true
        })
        return
      }

      const uploadUrl = app.globalData.baseUrl + '/photo/upload'
      console.log('📤 简化上传API地址:', uploadUrl)

      wx.uploadFile({
        url: uploadUrl,
        filePath: filePath,
        name: 'photo',
        header: {
          'Authorization': `Bearer ${app.globalData.accessToken}`,
          'X-Client-Version': '2.2.0',
          'X-Platform': 'wechat-miniprogram'
        },
        // 🔴 权限简化：不再发送amount参数
        formData: {
          // 可以添加其他非金额相关的参数
        },
        success(res) {
          console.log('📱 简化上传文件响应:', {
            statusCode: res.statusCode,
            data: res.data
          })

          if (res.statusCode === 200) {
            try {
              const responseData = JSON.parse(res.data)
              
              if (responseData.code === 0) {
                console.log('✅ 简化上传成功:', responseData)
                resolve(responseData)
              } else {
                console.error('❌ 简化上传业务错误:', responseData)
                reject({
                  code: responseData.code,
                  msg: responseData.msg || '上传失败',
                  data: responseData.data,
                  isBusinessError: true
                })
              }
            } catch (parseError) {
              console.error('❌ 简化上传响应解析失败:', parseError)
              reject({
                code: 1006,
                msg: '服务器响应格式错误',
                data: null,
                isBusinessError: true
              })
            }
          } else {
            console.error('❌ 简化上传HTTP状态错误:', res.statusCode)
            reject({
              code: res.statusCode,
              msg: `HTTP ${res.statusCode} 错误`,
              data: null,
              isBusinessError: true
            })
          }
        },
        fail(err) {
          console.error('❌ 简化上传请求失败:', err)
          
          // 🔧 修复：增强网络错误处理
          let errorMessage = '网络请求失败'
          let isNetworkError = true
          
          if (err.errMsg) {
            if (err.errMsg.includes('timeout')) {
              errorMessage = '上传超时，请检查网络连接'
            } else if (err.errMsg.includes('fail')) {
              errorMessage = '网络连接失败，请重试'
            } else {
              errorMessage = err.errMsg
            }
          }
          
          reject({
            code: -1,
            msg: errorMessage,
            data: null,
            isNetworkError: isNetworkError,
            errMsg: err.errMsg,
            uploadUrl: uploadUrl
          })
        }
      })
    })
  },

  /**
   * 🔴 保留原有上传方法（向后兼容）
   */
  upload(filePath, userAmount) {
    // 🔴 权限简化：重定向到简化上传方法
    console.warn('⚠️ 使用了已废弃的upload方法，自动重定向到简化上传')
    return this.uploadSimplified(filePath)
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

  getStatistics(period = 'today') {
    return request({
      url: '/merchant/statistics',
      method: 'GET',
      data: { period },
      needAuth: true
    })
  },

  // 🔧 修正：获取待审核列表 - 严格按照接口文档规范
  getPendingReviews(page = 1, limit = 20, status = 'pending') {
    return request({
      url: '/merchant/pending-reviews',
      method: 'GET',
      data: { page, limit, status },
      needAuth: true
    })
  },

  // 🔧 修正：审核单个小票 - 严格按照接口文档规范
  review(upload_id, action, amount = 0, review_reason = '') {
    return request({
      url: '/merchant/review',
      method: 'POST',
      data: { 
        upload_id: upload_id,
        action: action,
        amount: amount,
        review_reason: review_reason
      },
      needAuth: true
    })
  },

  // 🔧 修正：批量审核小票 - 严格按照接口文档规范
  batchReview(reviews) {
    return request({
      url: '/merchant/batch-review',
      method: 'POST',
      data: { reviews: reviews },
      needAuth: true
    })
  },

  // 🔧 新增：获取商品统计
  getProductStats() {
    return request({
      url: '/merchant/product-stats',
      method: 'GET',
      needAuth: true
    })
  },

  // 🔧 修正：获取商品列表 - 严格按照接口文档参数规范
  getProducts(page = 1, pageSize = 20, category = 'all', status = 'all', sortBy = 'sort_order', sortOrder = 'ASC') {
    return request({
      url: '/merchant/products',
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

  // 🔧 新增：创建商品
  createProduct(productData) {
    return request({
      url: '/merchant/products',
      method: 'POST',
      data: productData,
      needAuth: true
    })
  },

  // 🔧 新增：更新商品
  updateProduct(productId, productData) {
    return request({
      url: `/merchant/products/${productId}`,
      method: 'PUT',
      data: productData,
      needAuth: true
    })
  },

  // 🔧 修正：批量更新商品 - 严格按照接口文档数据结构
  batchUpdateProducts(products) {
    return request({
      url: '/merchant/products/batch-update',
      method: 'POST',
      data: { products: products },
      needAuth: true
    })
  },

  // 🔴 已删除：批量删除接口 - 接口文档中未定义此接口
  // batchDeleteProducts() 接口在当前接口规范中不存在

  // 🔧 新增：获取抽奖配置
  getLotteryConfig() {
    return request({
      url: '/merchant/lottery/config',
      method: 'GET',
      needAuth: true
    })
  },

  // 🔧 新增：获取抽奖统计
  getLotteryStats() {
    return request({
      url: '/merchant/lottery/stats',
      method: 'GET',
      needAuth: true
    })
  },

  // 🔧 新增：重置抽奖概率
  resetLotteryProbabilities() {
    return request({
      url: '/merchant/lottery/reset-probabilities',
      method: 'POST',
      needAuth: true
    })
  },

  // 🔧 新增：保存抽奖概率配置
  saveLotteryProbabilities(prizes) {
    return request({
      url: '/merchant/lottery/probabilities',
      method: 'POST',
      data: { prizes },
      needAuth: true
    })
  },

  // 🔍 注释：管理员查看所有用户上传记录的API需要后端实现
  // getAllUploadRecords() - 此接口需要后端程序员实现
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