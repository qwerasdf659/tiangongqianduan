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
      maxRetry = 2
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
    }

    // 构建完整URL地址
    const fullUrl = app.globalData.baseUrl + url

    wx.request({
      url: fullUrl,
      method,
      data,
      header,
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
          } else {
            // 其他业务错误 - 统一错误提示
            const errorMessage = res.data.msg || res.data.message || '操作失败'
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
        
        // 网络错误重试机制 - 增强版本
        if (retryCount < maxRetry && errorCode === -2) {
          console.log(`🔄 第${retryCount + 1}次重试请求: ${method} ${url}`)
          setTimeout(() => {
            const newOptions = { 
              ...options, 
              retryCount: retryCount + 1, 
              showLoading: retryCount === 0 // 重试时不显示loading
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
  // 发送验证码
  sendCode(phone) {
    return request({
      url: '/auth/send-code',
      method: 'POST',
      data: { phone },
      needAuth: false,
      showLoading: true
    }).catch(error => {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法发送验证码！请检查后端API服务状态。',
        showCancel: false
      })
      throw error
    })
  },

  // 用户登录
  login(phone, code) {
    return request({
      url: '/auth/login',
      method: 'POST',
      data: { phone, code },
      needAuth: false,
      showLoading: true
    }).catch(error => {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法完成登录！请检查后端API服务状态。',
        showCancel: false
      })
      throw error
    })
  },

  // 刷新Token
  refresh(refreshToken) {
    return request({
      url: '/auth/refresh',
      method: 'POST',
      data: { refresh_token: refreshToken },
      needAuth: false,
      showLoading: false
    })
  },

  // 验证Token
  verifyToken() {
    return request({
      url: '/auth/verify',
      method: 'GET',
      needAuth: true,
      showLoading: false
    })
  },

  // 登出
  logout() {
    return request({
      url: '/auth/logout',
      method: 'POST',
      needAuth: true,
      showLoading: false
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