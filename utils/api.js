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
            
            // 🔴 统一后端服务异常提示 - 符合最新接口对接规范
            if (showLoading) {
              wx.showModal({
                title: '🚨 后端服务异常',
                content: `访问令牌缺失或无效！\n\n🔗 API端点：${fullUrl}\n\n可能原因：\n• 用户未正确登录\n• Token设置时机错误\n• 认证头部未正确发送\n\n请重新登录后再试！`,
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
              debug: '前端认证流程存在问题',
              isBackendError: true
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
              errorMessage = '服务暂不可用'
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
   * 📱 用户登录
   * 🚧 开发阶段：跳过短信验证码，任意6位数字都通过验证
   * 🔮 生产环境：验证真实短信验证码
   * @param {string} phone - 手机号
   * @param {string} code - 验证码
   */
  login(formData) {
    // 🔧 修复：统一处理formData对象，提取phone和code
    const phone = formData.phone || formData.phoneNumber
    const code = formData.code || formData.verificationCode || formData.verify_code
    
    // 🔧 修复：添加详细的调试信息
    console.log('📡 登录API调用 - 参数验证:', {
      formData: formData,
      phone: phone,
      code: code,
      phoneType: typeof phone,
      codeType: typeof code,
      phoneLength: phone ? phone.length : 0,
      codeLength: code ? code.length : 0,
      phoneValid: /^1[3-9]\d{9}$/.test(phone),
      codeValid: /^\d{4,6}$/.test(code)
    })
    
    // 🔧 修复：确保参数格式正确
    const requestData = { 
      phone: String(phone).trim(), // 确保是字符串格式
      verify_code: String(code).trim(), // 确保是字符串格式
      dev_mode: app.globalData.isDev || false,
      skip_sms_verify: app.globalData.isDev || false
    }
    
    console.log('📡 登录API调用 - 请求数据:', requestData)
    
    return request({
      url: '/auth/login',
      method: 'POST',
      data: requestData,
      needAuth: false,
      showLoading: false, // 🔧 修复：登录页面自行控制loading状态
      timeout: 15000,     // 🔧 修复：增加超时时间到15秒
      maxRetry: 3         // 🔧 修复：增加重试次数到3次
    }).then((response) => {
      // 🔧 修复：详细记录后端返回的数据结构
      console.log('📡 登录API响应 - 完整数据结构:', {
        response: response,
        responseType: typeof response,
        hasCode: response.hasOwnProperty('code'),
        hasData: response.hasOwnProperty('data'),
        hasMsg: response.hasOwnProperty('msg'),
        code: response.code,
        msg: response.msg,
        data: response.data,
        dataType: typeof response.data,
        dataKeys: response.data ? Object.keys(response.data) : []
      })
      
      // 🔧 修复：返回完整的响应数据，让调用者处理
      return response
    }).catch((error) => {
      console.error('📡 登录API调用失败:', error)
      throw error
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
    // 🔧 修复：中文参数转英文映射，后端只支持英文参数
    const drawTypeMapping = {
      '单抽': 'single',
      '三连抽': 'triple', 
      '五连抽': 'five',
      '十连抽': 'ten',
      'single': 'single',
      'triple': 'triple',
      'five': 'five', 
      'ten': 'ten'
    }
    
    const mappedDrawType = drawTypeMapping[drawType] || drawType
    
    console.log('🔧 抽奖参数映射:', {
      '原始参数': drawType,
      '映射后参数': mappedDrawType,
      '抽奖数量': count
    })
    
    return request({
      url: '/lottery/draw',
      method: 'POST',
      data: { draw_type: mappedDrawType, count },
      needAuth: true
    }).catch(error => {
      console.error('🚨 抽奖API调用失败:', error)
      
      // 🔧 修复：区分网络错误和业务错误，避免重复错误提示
      // 只有真正的网络错误才显示通用错误提示
      // 业务错误（如每日限制、积分不足等）由业务逻辑层处理
      
      if (error && typeof error.code === 'number' && error.code >= 1000) {
        // 业务错误码（1000+），不显示通用错误，直接抛出让业务逻辑处理
        console.log('📝 业务错误，由业务逻辑层处理:', error)
        throw error
      } else if (error && (error.code === 'NETWORK_ERROR' || error.code < 0 || 
                         (typeof error.code === 'number' && (error.code >= 500 || error.code === 0)))) {
        // 网络错误或服务器错误，显示通用错误提示
        wx.showModal({
          title: '🚨 网络连接异常',
          content: '网络连接出现问题，请检查网络后重试。\n\n可能原因：\n1. 网络连接不稳定\n2. 服务器暂时无法访问\n3. 请求超时',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
        throw error
      } else {
        // 其他未知错误，显示通用提示但不阻断业务流程
        console.warn('⚠️ 未知错误类型，由业务逻辑层处理:', error)
        throw error
      }
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
  },

  // 🔴 新增：获取上传历史记录 - 符合接口规范v2.1.3
  getHistory(page = 1, pageSize = 10, status = 'all') {
    console.log('📡 获取上传历史请求:', { page, pageSize, status })
    
    return request({
      url: '/photo/history',
      method: 'GET',
      data: { page, limit: pageSize, status },
      needAuth: true,
      showLoading: false
    }).catch(error => {
      // 🔴 确保上传历史API错误也有完整的后端服务异常提示
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

  // 获取积分记录 - 🔴 更新接口路径符合规范v2.1.3
  getPointsRecords(page = 1, pageSize = 20, type = 'all', source = '') {
    console.log('📡 获取积分记录请求:', { page, pageSize, type, source })
    
    return request({
      url: '/user/points/records',
      method: 'GET',
      data: {
        page,
        limit: pageSize,
        type,
        source
      },
      needAuth: true,
      showLoading: false
    }).catch(error => {
      // 🔴 确保积分记录API错误也有完整的后端服务异常提示
      console.error('❌ 获取积分记录失败:', error)
      
      if (!error.isBackendError && !error.isNetworkError) {
        wx.showModal({
          title: '🚨 后端服务异常',
          content: `无法获取积分记录！\n\n🔗 API端点：${app.globalData.baseUrl}/user/points/records\n\n请检查后端API服务状态！`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
      }
      
      throw error
    })
  },

  // 🔴 新增：头像上传 - 符合接口规范v2.1.3
  uploadAvatar(filePath) {
    console.log('📡 上传头像请求:', filePath)
    
    return new Promise((resolve, reject) => {
      const header = {
        'Content-Type': 'multipart/form-data'
      }
      
      // 添加认证头
      if (app.globalData.accessToken) {
        header['Authorization'] = `Bearer ${app.globalData.accessToken}`
      }
      
      wx.uploadFile({
        url: app.globalData.baseUrl + '/user/avatar',
        filePath: filePath,
        name: 'avatar',
        header: header,
        success(res) {
          console.log('📡 头像上传响应:', res)
          
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data)
            } else {
              // 🔴 后端服务异常提示
              wx.showModal({
                title: '🚨 后端服务异常',
                content: `头像上传失败！\n\n🔗 API端点：${app.globalData.baseUrl}/user/avatar\n错误信息：${data.msg || '未知错误'}\n\n请检查后端API服务状态！`,
                showCancel: false,
                confirmText: '知道了',
                confirmColor: '#ff4444'
              })
              reject({
                code: data.code,
                msg: data.msg || '头像上传失败',
                isBackendError: true
              })
            }
          } catch (parseError) {
            console.error('❌ 解析上传响应失败:', parseError)
            wx.showModal({
              title: '🚨 后端服务异常',
              content: `头像上传响应解析失败！\n\n🔗 API端点：${app.globalData.baseUrl}/user/avatar\n响应内容：${res.data}\n\n请检查后端API服务状态！`,
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#ff4444'
            })
            reject({
              code: -1,
              msg: '响应解析失败',
              isBackendError: true
            })
          }
        },
        fail(err) {
          console.error('❌ 头像上传失败:', err)
          // 🔴 网络错误提示
          wx.showModal({
            title: '🚨 后端服务异常',
            content: `头像上传失败！\n\n🔗 API端点：${app.globalData.baseUrl}/user/avatar\n错误详情：${err.errMsg || '未知网络错误'}\n\n请检查后端API服务状态！`,
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#ff4444'
          })
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

  // 🔴 新增：获取商品统计 - 符合接口规范v2.1.3
  getProductStats() {
    console.log('📡 获取商品统计请求')
    
    return request({
      url: '/merchant/product-stats',
      method: 'GET',
      needAuth: true,
      showLoading: false
    }).catch(error => {
      // 🔴 确保商品统计API错误也有完整的后端服务异常提示
      console.error('❌ 获取商品统计失败:', error)
      
      if (!error.isBackendError && !error.isNetworkError) {
        wx.showModal({
          title: '🚨 后端服务异常',
          content: `无法获取商品统计！\n\n🔗 API端点：${app.globalData.baseUrl}/merchant/product-stats\n\n请检查后端API服务状态！`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
      }
      
      throw error
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