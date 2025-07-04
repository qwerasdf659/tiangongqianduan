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
      timeout = 10000  // 🔧 修复：允许自定义超时时间
    } = options

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
      timeout: timeout, // 🔧 修复：使用动态超时时间
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
            // 🔧 新增：专门处理2001错误码（访问令牌不能为空）
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
            
            // 显示认证错误提示
            if (showLoading) {
              wx.showModal({
                title: '🔐 认证错误',
                content: '访问令牌缺失或无效！\n\n可能原因：\n1. 用户未正确登录\n2. Token设置时机错误\n3. 认证头部未正确发送\n\n请重新登录！',
                showCancel: true,
                cancelText: '稍后重试',
                confirmText: '重新登录',
                confirmColor: '#ff4444',
                success: (modalRes) => {
                  if (modalRes.confirm) {
                    app.logout()
                  }
                }
              })
            }
            
            reject({
              code: 2001,
              msg: '访问令牌不能为空',
              data: res.data.data || null,
              debug: '前端认证流程存在问题'
            })
          } else {
            // 其他业务错误 - 统一错误提示
            const errorMessage = res.data.msg || res.data.message || '操作失败'
            console.log('📝 业务错误:', {
              code: res.data.code,
              message: errorMessage,
              url: url,
              method: method
            })
            
            if (showLoading) {
              wx.showToast({
                title: errorMessage,
                icon: 'none',
                duration: 2000
              })
            }
            reject({
              code: res.data.code,
              msg: errorMessage,
              data: res.data.data || null
            })
          }
        } else {
          // HTTP状态码错误 - 根据状态码给出具体提示
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
              errorMessage = '服务暂不可用'
              break
            default:
              errorMessage = `网络错误 ${res.statusCode}`
          }
          
          if (showLoading) {
            wx.showToast({
              title: errorMessage,
              icon: 'none',
              duration: 2000
            })
          }
          reject({ 
            code: res.statusCode, 
            msg: errorMessage,
            data: null
          })
        }
      },
      fail(err) {
        if (showLoading) {
          wx.hideLoading()
        }
        
        console.error(`❌ API请求失败 ${method} ${url}:`, err)
        
        // 🔧 修复：提供更详细的错误信息，帮助前端识别错误类型
        let errorMessage = '网络请求失败'
        let networkErrorCode = 'NETWORK_ERROR'
        
        // 根据微信小程序的错误码分类
        if (err.errMsg) {
          if (err.errMsg.includes('timeout')) {
            errorMessage = '请求超时，请检查网络连接'
            networkErrorCode = 'TIMEOUT'
          } else if (err.errMsg.includes('fail')) {
            errorMessage = '网络连接失败，请检查网络状态'
            networkErrorCode = 'CONNECTION_FAILED'
          } else if (err.errMsg.includes('abort')) {
            errorMessage = '请求被中断'
            networkErrorCode = 'REQUEST_ABORTED'
          } else {
            errorMessage = err.errMsg
            networkErrorCode = 'UNKNOWN_ERROR'
          }
        }
        
        // 🔧 修复：统一错误格式，便于前端识别和处理
        reject({
          code: networkErrorCode,
          msg: errorMessage,
          data: null,
          isNetworkError: true, // 标记为网络错误，便于重试逻辑判断
          originalError: err    // 保留原始错误信息用于调试
        })
        
        // 增强错误处理，防止小程序崩溃
        let errorCode = -1
        let errorMsg = '网络连接失败'
        
        // 安全解析错误信息
        try {
          if (err && typeof err === 'object') {
            if (err.errMsg) {
              if (err.errMsg.includes('timeout')) {
                errorMsg = '请求超时，请检查网络连接'
                errorCode = -2
              } else if (err.errMsg.includes('fail')) {
                errorMsg = '网络连接失败，请稍后重试'
                errorCode = -3
              } else if (err.errMsg.includes('abort')) {
                errorMsg = '请求被取消'
                errorCode = -4
              }
            }
          }
        } catch (parseError) {
          console.warn('解析错误信息失败:', parseError)
        }
        
        // 🔧 修复：网络错误重试机制 - 更精确的重试条件
        const shouldRetry = retryCount < maxRetry && (
          errorCode === -2 || // 超时
          errorCode === -3 || // 连接失败
          networkErrorCode === 'TIMEOUT' ||
          networkErrorCode === 'CONNECTION_FAILED'
        )
        
        if (shouldRetry) {
          console.log(`🔄 第${retryCount + 1}次重试请求: ${method} ${url}`)
          setTimeout(() => {
            const newOptions = { 
              ...options, 
              retryCount: retryCount + 1, 
              showLoading: false // 🔧 修复：重试时不显示loading
            }
            request(newOptions).then(resolve).catch(reject)
          }, 1000 * (retryCount + 1))
        } else {
          // 🚨 显示后端服务异常提示
          if (showLoading && retryCount === 0) {
            wx.showModal({
              title: '🚨 后端服务异常',
              content: `无法连接到后端服务！\n\n可能原因：\n1. 后端API服务未启动\n2. 网络连接问题\n3. 服务器维护中\n\n请立即检查后端服务状态！`,
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#ff4444'
            })
          }
          
          // 返回标准化的错误对象
          reject({ 
            code: errorCode, 
            message: errorMsg, 
            error: err,
            url: url,
            method: method
          })
        }
      }
    })
  })
}

/**
 * 🚨 已删除的违规函数（严禁使用）：
 * ❌ shouldUseMock() - 违规：Mock数据判断
 * ❌ smartApiCall() - 违规：Mock/真实API切换  
 * ❌ mockRequest() - 违规：模拟请求数据
 * ❌ generateMockProducts() - 违规：生成模拟商品
 * 
 * 所有业务数据必须从真实后端API获取！
 */

// 🔴 用户认证API - 必须调用真实后端接口
const authAPI = {
  /**
   * 🔴 发送验证码 - 必须调用真实API
   * 🚧 开发阶段：API返回成功但不实际发送短信
   * 🔮 生产环境：调用真实短信服务
   * @param {string} phone - 手机号
   */
  sendCode(phone) {
    return request({
      url: '/auth/send-code',
      method: 'POST',
      data: { 
        phone,
        dev_mode: app.globalData.isDev || false, // 🚧 开发模式标识
        skip_sms: app.globalData.isDev || false  // 🚧 开发阶段跳过真实短信
      },
      needAuth: false,
      showLoading: true
    })
  },

  /**
   * 🔴 用户登录 - 必须调用真实API
   * 🚧 开发阶段：验证码可以使用任意6位数字
   * 🔮 生产环境：验证真实短信验证码
   * @param {string} phone - 手机号
   * @param {string} code - 验证码
   */
  login(phone, code) {
    return request({
      url: '/auth/login',
      method: 'POST',
      data: { 
        phone, 
        verify_code: code,
        dev_mode: app.globalData.isDev || false,    // 🚧 开发模式标识
        skip_sms_verify: app.globalData.isDev || false // 🚧 开发阶段跳过短信验证
      },
      needAuth: false,
      showLoading: false, // 🔧 修复：登录页面自行控制loading状态
      timeout: 15000,     // 🔧 修复：增加超时时间到15秒
      maxRetry: 3         // 🔧 修复：增加重试次数到3次
    })
  },

  /**
   * 🔐 管理员登录 - 新增功能
   * 🚧 开发阶段：跳过短信二次验证
   * 🔮 生产环境：完整的账号密码+短信二次验证
   * @param {Object} loginData - 登录数据
   * @param {string} loginData.username - 管理员账号
   * @param {string} loginData.password - 登录密码
   * @param {boolean} loginData.skip_sms - 是否跳过短信验证（开发阶段使用）
   * @param {Object} loginData.device_info - 设备信息
   */
  adminLogin(loginData) {
    console.log('🔐 管理员登录API调用:', {
      username: loginData.username,
      skip_sms: loginData.skip_sms,
      dev_mode: loginData.dev_mode
    })
    
    return request({
      url: '/auth/admin-login',
      method: 'POST',
      data: {
        username: loginData.username,
        password: loginData.password,
        skip_sms: loginData.skip_sms || false,       // 🚧 开发阶段跳过短信验证
        dev_mode: loginData.dev_mode || false,       // 🚧 开发模式标识
        device_info: loginData.device_info || {},    // 设备信息
        timestamp: Date.now(),                       // 时间戳
        client_type: 'miniprogram'                   // 客户端类型
      },
      needAuth: false,
      showLoading: false // 登录界面自行控制loading状态
    })
  },

  /**
   * 🔐 管理员短信二次验证 - 生产环境使用
   * 🚧 开发阶段：此接口暂停调用
   * @param {string} admin_token - 临时管理员token
   * @param {string} sms_code - 短信验证码
   */
  adminSmsVerify(admin_token, sms_code) {
    return request({
      url: '/auth/admin-sms-verify',
      method: 'POST',
      data: {
        admin_token,
        sms_code,
        timestamp: Date.now()
      },
      needAuth: false,
      showLoading: true
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
      url: '/auth/verify',
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

// 🔴 抽奖API - 必须调用真实后端接口
const lotteryAPI = {
  // 获取抽奖配置
  getConfig() {
    return request({
      url: '/lottery/config',
      method: 'GET',
      needAuth: true
    }).catch(error => {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取抽奖配置！\n\n可能原因：\n1. 后端lottery服务未启动\n2. /lottery/config接口异常\n\n请立即检查后端服务状态！',
        showCancel: false,
        confirmColor: '#ff4444'
      })
      throw error
    })
  },

  // 执行抽奖
  draw(drawType = 'single', count = 1) {
    return request({
      url: '/lottery/draw',
      method: 'POST',
      data: { draw_type: drawType, count },
      needAuth: true
    }).catch(error => {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法执行抽奖！\n\n可能原因：\n1. 后端lottery服务未启动\n2. /lottery/draw接口异常\n3. 数据库连接问题\n\n请立即检查后端服务状态！',
        showCancel: false,
        confirmColor: '#ff4444'
      })
      throw error
    })
  },

  // 获取抽奖记录
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/lottery/records',
      method: 'GET',
      data: { page, page_size: pageSize },
      needAuth: true
    })
  },

  // 获取抽奖统计
  getStatistics() {
    return request({
      url: '/lottery/statistics',
      method: 'GET',
      needAuth: true
    })
  }
}

// 🔴 商品兑换API - 必须调用真实后端接口
const exchangeAPI = {
  // 获取商品分类
  getCategories() {
    return request({
      url: '/exchange/categories',
      method: 'GET',
      needAuth: true
    })
  },

  // 获取商品列表
  getProducts(page = 1, pageSize = 20, category = 'all', sort = 'points') {
    return request({
      url: '/exchange/products',
      method: 'GET',
      data: { page, page_size: pageSize, category, sort },
      needAuth: true
    }).catch(error => {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取商品列表！请检查后端API服务状态。',
        showCancel: false
      })
      throw error
    })
  },

  // 兑换商品
  redeem(productId, quantity = 1) {
    return request({
      url: '/exchange/redeem',
      method: 'POST',
      data: { product_id: productId, quantity },
      needAuth: true
    })
  },

  // 获取兑换记录
  getRecords(page = 1, pageSize = 20, status = 'all') {
    return request({
      url: '/exchange/records',
      method: 'GET',
      data: { page, page_size: pageSize, status },
      needAuth: true
    })
  }
}

// 🔴 上传API - 必须调用真实后端接口
const uploadAPI = {
  // 上传文件
  upload(filePath, userAmount) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: app.globalData.baseUrl + '/upload',
        filePath,
        name: 'file',
        formData: {
          user_amount: userAmount.toString(),
          access_token: app.globalData.accessToken
        },
        success(res) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data)
            } else {
              reject(data)
            }
          } catch (err) {
            reject({ code: -1, message: '响应解析失败' })
          }
        },
        fail(err) {
          wx.showModal({
            title: '🚨 后端服务异常',
            content: '无法上传文件！请检查后端API服务状态。',
            showCancel: false
          })
          reject(err)
        }
      })
    })
  },

  // 获取上传记录
  getRecords(page = 1, pageSize = 20, status = 'all') {
    return request({
      url: '/upload/records',
      method: 'GET',
      data: { page, page_size: pageSize, status },
      needAuth: true
    })
  }
}

// 🔴 用户API - 必须调用真实后端接口
const userAPI = {
  // 获取用户信息
  getUserInfo() {
    return request({
      url: '/user/info',
      method: 'GET',
      needAuth: true
    }).catch(error => {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取用户信息！请检查后端API服务状态。',
        showCancel: false
      })
      throw error
    })
  },

  // 更新用户信息
  updateUserInfo(userInfo) {
    return request({
      url: '/user/info',
      method: 'PUT',
      data: userInfo,
      needAuth: true
    })
  },

  // 获取用户统计
  getStatistics() {
    return request({
      url: '/user/statistics',
      method: 'GET',
      needAuth: true
    })
  },

  // 获取积分记录
  getPointsRecords(page = 1, pageSize = 20, type = 'all') {
    return request({
      url: '/user/points-records',
      method: 'GET',
      data: { page, page_size: pageSize, type },
      needAuth: true
    })
  },

  // 签到
  checkIn() {
    return request({
      url: '/user/check-in',
      method: 'POST',
      needAuth: true
    })
  }
}

// 🔴 商家API - 必须调用真实后端接口
const merchantAPI = {
  // 申请商家权限
  apply(authInfo = {}) {
    return request({
      url: '/merchant/apply',
      method: 'POST',
      data: authInfo,
      needAuth: true
    })
  },

  // 获取商家统计
  getStatistics() {
    return request({
      url: '/merchant/statistics',
      method: 'GET',
      needAuth: true
    })
  },

  // 获取待审核上传
  getPendingReviews(page = 1, pageSize = 20) {
    return request({
      url: '/merchant/pending-reviews',
      method: 'GET',
      data: { page, page_size: pageSize },
      needAuth: true
    })
  },

  // 审核上传
  review(uploadId, action, points = 0, reason = '') {
    return request({
      url: '/merchant/review',
      method: 'POST',
      data: { upload_id: uploadId, action, points, reason },
      needAuth: true
    })
  },

  // 批量审核
  batchReview(uploadIds, action, reason = '') {
    return request({
      url: '/merchant/batch-review',
      method: 'POST',
      data: { upload_ids: uploadIds, action, reason },
      needAuth: true
    })
  },

  // 获取抽奖配置（商家管理）
  getLotteryConfig() {
    return request({
      url: '/merchant/lottery-config',
      method: 'GET',
      needAuth: true
    })
  },

  // 获取抽奖统计（商家管理）
  getLotteryStats() {
    return request({
      url: '/merchant/lottery-stats',
      method: 'GET',
      needAuth: true
    })
  },

  // 保存抽奖概率设置
  saveLotteryProbabilities(prizes) {
    return request({
      url: '/merchant/lottery-probabilities',
      method: 'POST',
      data: { prizes },
      needAuth: true
    })
  },

  // 重置抽奖概率
  resetLotteryProbabilities() {
    return request({
      url: '/merchant/reset-lottery-probabilities',
      method: 'POST',
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