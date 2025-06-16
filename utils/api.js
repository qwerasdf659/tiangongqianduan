// utils/api.js - API接口请求封装
const app = getApp()

/**
 * 网络请求封装
 * @param {Object} options 请求配置
 * @param {String} options.url 请求地址
 * @param {String} options.method 请求方法
 * @param {Object} options.data 请求数据
 * @param {Boolean} options.needAuth 是否需要认证
 * @param {Boolean} options.showLoading 是否显示加载框
 */
const request = (options) => {
  return new Promise((resolve, reject) => {
    const {
      url,
      method = 'GET',
      data = {},
      needAuth = true,
      showLoading = true
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

    // TODO: 替换为实际API地址
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

        // 统一错误处理
        if (res.statusCode === 200) {
          if (res.data.code === 0) {
            resolve(res.data)
          } else if (res.data.code === 1002) {
            // Token过期，尝试刷新
            app.refreshToken().then(() => {
              // 重新发起请求
              request(options).then(resolve).catch(reject)
            }).catch(() => {
              app.logout()
              reject(res.data)
            })
          } else {
            wx.showToast({
              title: res.data.msg || '请求失败',
              icon: 'none'
            })
            reject(res.data)
          }
        } else {
          wx.showToast({
            title: '网络错误',
            icon: 'none'
          })
          reject({ code: res.statusCode, msg: '网络错误' })
        }
      },
      fail(err) {
        if (showLoading) {
          wx.hideLoading()
        }
        
        wx.showToast({
          title: '网络连接失败',
          icon: 'none'
        })
        reject({ code: -1, msg: '网络连接失败', error: err })
      }
    })
  })
}

// TODO: 对接后端认证接口
const authAPI = {
  // 发送验证码
  sendCode(phone) {
    return request({
      url: '/api/auth/send-code',
      method: 'POST',
      data: { phone },
      needAuth: false
    })
  },

  // 手机号登录/绑定
  login(phone, code) {
    return request({
      url: '/api/auth/login',
      method: 'POST',
      data: { phone, code },
      needAuth: false
    })
  },

  // Token刷新
  refresh(refreshToken) {
    return request({
      url: '/api/auth/refresh',
      method: 'POST',
      header: {
        'Authorization': `Bearer ${refreshToken}`
      },
      needAuth: false
    })
  }
}

// TODO: 对接后端抽奖接口
const lotteryAPI = {
  // 获取抽奖配置
  getConfig() {
    return request({
      url: '/api/lottery/config',
      method: 'GET'
    })
  },

  // 执行抽奖
  draw(drawType = 'single', count = 1) {
    return request({
      url: '/api/lottery/draw',
      method: 'POST',
      data: { draw_type: drawType, count }
    })
  },

  // 获取抽奖记录
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/lottery/records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

// TODO: 对接后端商品兑换接口
const exchangeAPI = {
  // 获取商品列表
  getProducts() {
    return request({
      url: '/api/exchange/products',
      method: 'GET'
    })
  },

  // 兑换商品
  redeem(productId, quantity = 1) {
    return request({
      url: '/api/exchange/redeem',
      method: 'POST',
      data: { product_id: productId, quantity }
    })
  },

  // 获取兑换记录
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/exchange/records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

// TODO: 对接后端拍照上传接口
const photoAPI = {
  // 上传照片
  upload(filePath, amount) {
    return new Promise((resolve, reject) => {
      wx.showLoading({
        title: '上传中...',
        mask: true
      })

      // TODO: 替换为实际上传地址
      wx.uploadFile({
        url: app.globalData.baseUrl + '/api/photo/upload',
        filePath,
        name: 'file',
        formData: {
          amount: amount
        },
        header: {
          'Authorization': `Bearer ${app.globalData.accessToken}`
        },
        success(res) {
          wx.hideLoading()
          const data = JSON.parse(res.data)
          if (data.code === 0) {
            resolve(data)
          } else {
            wx.showToast({
              title: data.msg || '上传失败',
              icon: 'none'
            })
            reject(data)
          }
        },
        fail(err) {
          wx.hideLoading()
          wx.showToast({
            title: '上传失败',
            icon: 'none'
          })
          reject(err)
        }
      })
    })
  },

  // 获取上传记录
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/photo/records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

// TODO: 对接后端用户中心接口
const userAPI = {
  // 获取用户信息
  getUserInfo() {
    return request({
      url: '/api/user/info',
      method: 'GET'
    })
  },

  // 获取用户统计
  getStatistics() {
    return request({
      url: '/api/user/statistics',
      method: 'GET'
    })
  },

  // 获取积分明细
  getPointsRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/user/points-records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

// TODO: 对接后端商家服务接口
const merchantAPI = {
  // 商家认证
  auth() {
    return request({
      url: '/api/merchant/auth',
      method: 'POST'
    })
  },

  // 获取审核统计
  getStatistics() {
    return request({
      url: '/api/merchant/statistics',
      method: 'GET'
    })
  },

  // 获取待审核列表
  getPendingReviews(page = 1, pageSize = 20) {
    return request({
      url: '/api/merchant/pending-reviews',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  },

  // 审核操作
  review(reviewId, action, points = 0, reason = '') {
    return request({
      url: '/api/merchant/review',
      method: 'POST',
      data: { review_id: reviewId, action, points, reason }
    })
  }
}

// 模拟数据（开发阶段使用）
// TODO: 生产环境删除此部分
const mockData = {
  // 模拟抽奖配置
  lotteryConfig: {
    code: 0,
    msg: 'success',
    data: {
      cost_points: 100,
      prizes: [
        { id: 1, name: '八八折券', angle: 0, color: '#FF6B35', is_activity: true, probability: 0 },
        { id: 2, name: '九八折券', angle: 45, color: '#4ECDC4', is_activity: false, probability: 10 },
        { id: 3, name: '甜品1份', angle: 90, color: '#FFD93D', is_activity: false, probability: 30 },
        { id: 4, name: '青菜1份', angle: 135, color: '#6BCF7F', is_activity: false, probability: 30 },
        { id: 5, name: '虾1份', angle: 180, color: '#FF6B6B', is_activity: false, probability: 5 },
        { id: 6, name: '花甲1份', angle: 225, color: '#4DABF7', is_activity: false, probability: 20 },
        { id: 7, name: '鱿鱼1份', angle: 270, color: '#9775FA', is_activity: false, probability: 5 },
        { id: 8, name: '生腌拼盘', angle: 315, color: '#FFB84D', is_activity: true, probability: 0 }
      ]
    }
  },

  // 模拟商品列表
  products: {
    code: 0,
    msg: 'success',
    data: {
      products: Array.from({ length: 20 }, (_, i) => ({
        id: i + 1,
        name: `商品${i + 1}`,
        image: 'https://via.placeholder.com/200x200',
        exchange_points: 800 + i * 100,
        stock: Math.floor(Math.random() * 20) + 1,
        description: `这是商品${i + 1}的描述`
      }))
    }
  }
}

// 开发环境Mock拦截器
const mockRequest = (url, data) => {
  console.log('Mock请求:', url, data)
  
  return new Promise((resolve) => {
    setTimeout(() => {
      switch (url) {
        case '/api/lottery/config':
          resolve(mockData.lotteryConfig)
          break
        case '/api/lottery/draw':
          resolve({
            code: 0,
            msg: '抽奖成功',
            data: {
              results: [{
                prize_id: 3,
                prize_name: '甜品1份',
                angle: 90,
                is_near_miss: false,
                points_deducted: 100
              }],
              remaining_points: app.globalData.mockUser.total_points - 100,
              need_slider_verify: false
            }
          })
          break
        case '/api/exchange/products':
          resolve(mockData.products)
          break
        default:
          resolve({ code: 0, msg: 'success', data: {} })
      }
    }, 500) // 模拟网络延迟
  })
}

// 导出API
module.exports = {
  request,
  authAPI,
  lotteryAPI,
  exchangeAPI,
  photoAPI,
  userAPI,
  merchantAPI,
  mockRequest,
  mockData
} 