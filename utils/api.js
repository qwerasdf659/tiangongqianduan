// utils/api.js - API接口请求封装
const app = getApp()

/**
 * 🔴 智能API调用机制 - 根据环境自动切换Mock/真实接口
 */
const shouldUseMock = () => {
  return app.globalData.isDev && !app.globalData.needAuth
}

/**
 * 🔴 统一网络请求封装 - 支持自动重试和错误处理
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
          // 显示用户友好的错误提示
          if (showLoading && retryCount === 0) {
            wx.showToast({
              title: errorMsg,
              icon: 'none',
              duration: 3000
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
 * 🔴 智能API调用 - 开发环境Mock，生产环境真实接口
 */
const smartApiCall = (realApiCall, mockData = {}) => {
  if (shouldUseMock()) {
    // 开发环境返回Mock数据
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          code: 0,
          message: 'success',
          data: mockData
        })
      }, Math.random() * 1000 + 200) // 模拟网络延迟
    })
  } else {
    // 生产环境调用真实API
    return realApiCall()
  }
}

/**
 * 🔴 Mock请求函数 - 用于开发环境模拟API调用
 */
const mockRequest = (url, data = {}) => {
  console.log('🔧 Mock请求:', url, data)
  
  // 根据URL返回不同的Mock数据
  let mockData = {}
  
  if (url.includes('/lottery/config')) {
    mockData = {
      prizes: [
        { id: 1, name: '八八折券', angle: 0, color: '#FF6B35', probability: 0.1500, is_activity: true, type: 'coupon', value: 0.88 },
        { id: 2, name: '九八折券', angle: 45, color: '#4ECDC4', probability: 0.2000, is_activity: false, type: 'coupon', value: 0.98 },
        { id: 3, name: '甜品1份', angle: 90, color: '#FFD93D', probability: 0.2500, is_activity: false, type: 'physical', value: 0 },
        { id: 4, name: '青菜1份', angle: 135, color: '#6BCF7F', probability: 0.1500, is_activity: false, type: 'physical', value: 0 },
        { id: 5, name: '虾1份', angle: 180, color: '#FF6B6B', probability: 0.1000, is_activity: false, type: 'physical', value: 0 },
        { id: 6, name: '花甲1份', angle: 225, color: '#4DABF7', probability: 0.0800, is_activity: false, type: 'physical', value: 0 },
        { id: 7, name: '鱿鱼1份', angle: 270, color: '#9775FA', probability: 0.0500, is_activity: false, type: 'physical', value: 0 },
        { id: 8, name: '生腌拼盘', angle: 315, color: '#FFB84D', probability: 0.0200, is_activity: true, type: 'physical', value: 0 }
      ],
      cost_points: 100,
      daily_limit: 10,
      rules: '每次抽奖消耗100积分，每日最多可抽奖10次'
    }
  } else if (url.includes('/lottery/draw')) {
    // 🔴 模拟真实的抽奖逻辑，根据配置的奖品返回结果
    const prizes = [
      { id: 1, name: '八八折券', angle: 0, probability: 0.15 },
      { id: 2, name: '九八折券', angle: 45, probability: 0.20 },
      { id: 3, name: '甜品1份', angle: 90, probability: 0.25 },
      { id: 4, name: '青菜1份', angle: 135, probability: 0.15 },
      { id: 5, name: '虾1份', angle: 180, probability: 0.10 },
      { id: 6, name: '花甲1份', angle: 225, probability: 0.08 },
      { id: 7, name: '鱿鱼1份', angle: 270, probability: 0.05 },
      { id: 8, name: '生腌拼盘', angle: 315, probability: 0.02 }
    ]
    
    // 按概率抽奖
    const random = Math.random()
    let cumulative = 0
    let selectedPrize = prizes[2] // 默认甜品1份
    
    for (const prize of prizes) {
      cumulative += prize.probability
      if (random <= cumulative) {
        selectedPrize = prize
        break
      }
    }
    
    mockData = {
      results: [
        {
          prize_id: selectedPrize.id,
          prize_name: selectedPrize.name,
          angle: selectedPrize.angle + Math.random() * 10 - 5, // 添加随机偏移
          is_near_miss: false,
          prize_value: 0
        }
      ],
      remaining_points: 1400, // 模拟扣除积分后的余额
      today_draw_count: 3
    }
  } else {
    mockData = { message: 'Mock data for ' + url }
  }
  
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        code: 0,
        message: 'success',
        data: mockData
      })
    }, Math.random() * 800 + 300) // 模拟网络延迟
  })
}

/**
 * 🔴 认证相关API接口 - 根据后端文档实现
 */
const authAPI = {
  /**
   * 发送验证码
   * 后端接口: POST /api/auth/send-code
   */
  sendCode(phone) {
    const realApiCall = () => request({
      url: '/auth/send-code',
      method: 'POST',
      data: { phone },
      needAuth: false,
      showLoading: true
    })

    // Mock数据
    const mockData = {
      phone: phone,
      expires_in: 300,
      verification_code: '123456'
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 登录注册
   * 后端接口: POST /api/auth/login
   */
  login(phone, code) {
    const realApiCall = () => request({
      url: '/auth/login',
      method: 'POST',
      data: { phone, code },
      needAuth: false,
      showLoading: true
    })

    // Mock数据 - 根据后端文档格式
    const mockData = {
      access_token: 'mock_access_token_123456',
      refresh_token: 'mock_refresh_token_123456',
      expires_in: 7200,
      token_type: 'Bearer',
      user_info: {
        user_id: 1001,
        phone: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        total_points: 1500,
        is_merchant: false,
        nickname: '测试用户',
        avatar: '/images/default-avatar.png',
        status: 'active'
      }
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 刷新Token
   * 后端接口: POST /api/auth/refresh
   */
  refresh(refreshToken) {
    const realApiCall = () => request({
      url: '/auth/refresh',
      method: 'POST',
      data: { refresh_token: refreshToken },
      needAuth: false,
      showLoading: false
    })

    // Mock数据
    const mockData = {
      access_token: 'new_mock_access_token_123456',
      refresh_token: 'new_mock_refresh_token_123456',
      expires_in: 7200
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 验证Token
   * 后端接口: GET /api/auth/verify
   */
  verifyToken() {
    const realApiCall = () => request({
      url: '/auth/verify',
      method: 'GET',
      needAuth: true,
      showLoading: false
    })

    // Mock数据
    const mockData = {
      valid: true,
      user_info: app.globalData.mockUser
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 退出登录
   * 后端接口: POST /api/auth/logout
   */
  logout() {
    const realApiCall = () => request({
      url: '/auth/logout',
      method: 'POST',
      needAuth: true,
      showLoading: false
    })

    return smartApiCall(realApiCall, {})
  }
}

/**
 * 🔴 抽奖相关API接口 - 根据后端文档实现
 */
const lotteryAPI = {
  /**
   * 获取抽奖配置
   * 后端接口: GET /api/lottery/config
   */
  getConfig() {
    const realApiCall = () => request({
      url: '/lottery/config',
      method: 'GET',
      needAuth: true
    })

    // Mock数据 - 根据后端文档格式
    const mockData = {
      prizes: [
        { id: 1, name: '八八折券', angle: 0, color: '#FF6B35', probability: 0.1500, is_activity: true, type: 'coupon', value: 0.88 },
        { id: 2, name: '九八折券', angle: 45, color: '#4ECDC4', probability: 0.2000, is_activity: false, type: 'coupon', value: 0.98 },
        { id: 3, name: '甜品1份', angle: 90, color: '#FFD93D', probability: 0.2500, is_activity: false, type: 'physical', value: 0 },
        { id: 4, name: '青菜1份', angle: 135, color: '#6BCF7F', probability: 0.1500, is_activity: false, type: 'physical', value: 0 },
        { id: 5, name: '虾1份', angle: 180, color: '#FF6B6B', probability: 0.1000, is_activity: false, type: 'physical', value: 0 },
        { id: 6, name: '花甲1份', angle: 225, color: '#4DABF7', probability: 0.0800, is_activity: false, type: 'physical', value: 0 },
        { id: 7, name: '鱿鱼1份', angle: 270, color: '#9775FA', probability: 0.0500, is_activity: false, type: 'physical', value: 0 },
        { id: 8, name: '生腌拼盘', angle: 315, color: '#FFB84D', probability: 0.0200, is_activity: true, type: 'physical', value: 0 }
      ],
      cost_points: 100,
      daily_limit: 10,
      rules: '每次抽奖消耗100积分，每日最多可抽奖10次'
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 执行抽奖
   * 后端接口: POST /api/lottery/draw
   */
  draw(drawType = 'single', count = 1) {
    const realApiCall = () => request({
      url: '/lottery/draw',
      method: 'POST',
      data: { draw_type: drawType, count },
      needAuth: true
    })

    // Mock数据 - 根据后端文档格式，使用统一的奖品配置
    const prizes = [
      { id: 1, name: '八八折券', angle: 0, probability: 0.15 },
      { id: 2, name: '九八折券', angle: 45, probability: 0.20 },
      { id: 3, name: '甜品1份', angle: 90, probability: 0.25 },
      { id: 4, name: '青菜1份', angle: 135, probability: 0.15 },
      { id: 5, name: '虾1份', angle: 180, probability: 0.10 },
      { id: 6, name: '花甲1份', angle: 225, probability: 0.08 },
      { id: 7, name: '鱿鱼1份', angle: 270, probability: 0.05 },
      { id: 8, name: '生腌拼盘', angle: 315, probability: 0.02 }
    ]
    
    // 按概率抽奖
    const random = Math.random()
    let cumulative = 0
    let selectedPrize = prizes[2] // 默认甜品1份
    
    for (const prize of prizes) {
      cumulative += prize.probability
      if (random <= cumulative) {
        selectedPrize = prize
        break
      }
    }
    
    const mockData = {
      results: [
        {
          prize_id: selectedPrize.id,
          prize_name: selectedPrize.name,
          angle: selectedPrize.angle,
          is_near_miss: false,
          prize_value: 0,
          remaining_points: 1400 // 🔴 确保返回剩余积分
        }
      ],
      remaining_points: 1400,
      today_draw_count: 3
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取抽奖记录
   * 后端接口: GET /api/lottery/records
   */
  getRecords(page = 1, pageSize = 20) {
    const realApiCall = () => request({
      url: `/lottery/records?page=${page}&size=${pageSize}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          prize_name: '100积分',
          prize_value: 100,
          created_at: '2024-12-19T14:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        size: 20,
        total: 1,
        has_more: false
      }
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取抽奖统计
   * 后端接口: GET /api/lottery/statistics
   */
  getStatistics() {
    const realApiCall = () => request({
      url: '/lottery/statistics',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      total_draws: 10,
      total_prizes: 8,
      total_points_won: 560,
      today_draws: 3,
      win_rate: 0.8
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 商品兑换相关API接口 - 根据后端文档实现
 */
const exchangeAPI = {
  /**
   * 获取商品分类
   * 后端接口: GET /api/exchange/categories
   */
  getCategories() {
    const realApiCall = () => request({
      url: '/exchange/categories',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      categories: [
        { id: 'all', name: '全部', count: 50 },
        { id: 'coupon', name: '优惠券', count: 20 },
        { id: 'physical', name: '实物商品', count: 15 },
        { id: 'virtual', name: '虚拟商品', count: 15 }
      ]
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取商品列表
   * 后端接口: GET /api/exchange/products
   */
  getProducts(page = 1, pageSize = 20, category = 'all', sort = 'points') {
    const realApiCall = () => request({
      url: `/exchange/products?page=${page}&size=${pageSize}&category=${category}&sort=${sort}`,
      method: 'GET',
      needAuth: true
    })

    // 生成Mock商品数据
    const generateMockProducts = () => {
      const categories = ['优惠券', '实物商品', '虚拟商品']
      const productNames = [
        '星巴克50元券', '麦当劳套餐券', '肯德基全家桶', '喜茶饮品券',
        '小米手机壳', '无线耳机', 'iPad保护套', '充电宝',
        '腾讯视频会员', '爱奇艺会员', '网易云音乐会员', 'QQ音乐绿钻'
      ]
      
      const products = []
      for (let i = 1; i <= 20; i++) {
        const randomCategory = categories[Math.floor(Math.random() * categories.length)]
        const randomName = productNames[Math.floor(Math.random() * productNames.length)]
        const basePoints = Math.floor(Math.random() * 5000) + 500
        
        products.push({
          commodity_id: i,
          name: `${randomName} #${i}`,
          description: `这是一个${randomCategory}商品，具有很高的性价比和实用价值。`,
          category: randomCategory,
          exchange_points: basePoints,
          stock: Math.floor(Math.random() * 100) + 10,
          image: `/images/products/product-${i % 8 + 1}.jpg`,
          status: 'active',
          is_hot: Math.random() > 0.7,
          sort_order: Math.floor(Math.random() * 1000)
        })
      }
      return products
    }

    const mockData = {
      products: generateMockProducts(),
      pagination: {
        page: 1,
        size: 20,
        total: 100,
        has_more: true
      }
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 商品兑换
   * 后端接口: POST /api/exchange/redeem
   */
  redeem(productId, quantity = 1) {
    const realApiCall = () => request({
      url: '/exchange/redeem',
      method: 'POST',
      data: { product_id: productId, quantity },
      needAuth: true
    })

    const mockData = {
      record_id: `EX${Date.now()}`,
      product_name: '星巴克50元券',
      points_cost: 4500,
      remaining_points: 1000,
      exchange_time: new Date().toISOString()
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取兑换记录
   * 后端接口: GET /api/exchange/records
   */
  getRecords(page = 1, pageSize = 20, status = 'all') {
    const realApiCall = () => request({
      url: `/exchange/records?page=${page}&size=${pageSize}&status=${status}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          product_name: '星巴克50元券',
          points_cost: 4500,
          status: 'completed',
          created_at: '2024-12-19T14:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        size: 20,
        total: 1,
        has_more: false
      }
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 图片上传相关API接口 - 根据后端文档实现
 */
const photoAPI = {
  /**
   * 上传图片
   * 后端接口: POST /api/photo/upload
   */
  upload(filePath, userAmount) {
    return new Promise((resolve, reject) => {
      if (shouldUseMock()) {
        // Mock数据
        setTimeout(() => {
          resolve({
            code: 0,
            message: '上传成功',
            data: {
              upload_id: `UP${Date.now()}`,
              image_url: 'https://mock-image-url.com/image.jpg',
              amount: userAmount,
              status: 'pending'
            }
          })
        }, 2000)
        return
      }

      // 真实上传
      wx.uploadFile({
        url: app.globalData.baseUrl + '/photo/upload',
        filePath,
        name: 'image',
        formData: {
          user_amount: userAmount
        },
        header: {
          'Authorization': `Bearer ${app.globalData.accessToken}`
        },
        success(res) {
          try {
            const data = JSON.parse(res.data)
            if (data.code === 0) {
              resolve(data)
            } else {
              reject(data)
            }
          } catch (error) {
            reject({ code: -1, message: '响应解析失败' })
          }
        },
        fail(err) {
          reject({ code: -1, message: '上传失败', error: err })
        }
      })
    })
  },

  /**
   * 获取上传记录
   * 后端接口: GET /api/photo/records
   */
  getRecords(page = 1, pageSize = 20, status = 'all') {
    const realApiCall = () => request({
      url: `/photo/records?page=${page}&size=${pageSize}&status=${status}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          upload_id: 'UP123456789',
          image_url: 'https://mock-image-url.com/image.jpg',
          amount: 58.5,
          user_amount: 60.0,
          points_awarded: 585,
          review_status: 'approved',
          review_reason: '审核通过',
          created_at: '2024-12-19T14:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        size: 20,
        total: 1,
        has_more: false
      }
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 用户相关API接口 - 根据后端文档实现
 */
const userAPI = {
  /**
   * 获取用户信息
   * 后端接口: GET /api/user/info
   */
  getUserInfo() {
    const realApiCall = () => request({
      url: '/user/info',
      method: 'GET',
      needAuth: true
    })

    const mockData = app.globalData.mockUser

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 更新用户信息
   * 后端接口: PUT /api/user/info
   */
  updateUserInfo(userInfo) {
    const realApiCall = () => request({
      url: '/user/info',
      method: 'PUT',
      data: userInfo,
      needAuth: true
    })

    const mockData = { ...app.globalData.mockUser, ...userInfo }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取用户统计
   * 后端接口: GET /api/user/statistics
   */
  getStatistics() {
    const realApiCall = () => request({
      url: '/user/statistics',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      total_points: 1500,
      total_draws: 25,
      total_exchanges: 5,
      total_uploads: 10,
      total_points_earned: 5000,
      total_points_spent: 3500,
      level: 3,
      next_level_points: 2000
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取积分记录
   * 后端接口: GET /api/user/points-records
   */
  getPointsRecords(page = 1, pageSize = 20, type = 'all') {
    const realApiCall = () => request({
      url: `/user/points-records?page=${page}&size=${pageSize}&type=${type}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          change_points: -100,
          reason: 'lottery_draw',
          reason_text: '抽奖消费',
          balance_after: 1400,
          created_at: '2024-12-19T14:30:00Z'
        },
        {
          id: 2,
          change_points: 585,
          reason: 'photo_upload',
          reason_text: '图片上传奖励',
          balance_after: 1500,
          created_at: '2024-12-19T13:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        size: 20,
        total: 2,
        has_more: false
      }
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 签到
   * 后端接口: POST /api/user/check-in
   */
  checkIn() {
    const realApiCall = () => request({
      url: '/user/check-in',
      method: 'POST',
      needAuth: true
    })

    const mockData = {
      points_awarded: 50,
      continuous_days: 3,
      is_double_reward: false,
      total_points: 1550
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 商家相关API接口 - 根据后端文档实现
 */
const merchantAPI = {
  /**
   * 申请商家权限
   * 后端接口: POST /api/merchant/apply
   */
  apply(authInfo = {}) {
    const realApiCall = () => request({
      url: '/merchant/apply',
      method: 'POST',
      data: authInfo,
      needAuth: true
    })

    const mockData = {
      application_id: `APP${Date.now()}`,
      status: 'pending',
      estimated_review_time: '3-5个工作日'
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取商家统计
   * 后端接口: GET /api/merchant/statistics
   */
  getStatistics() {
    const realApiCall = () => request({
      url: '/merchant/statistics',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      pending_reviews: 5,
      approved_today: 8,
      rejected_today: 2,
      total_reviews: 150,
      total_points_awarded: 50000
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取待审核列表
   * 后端接口: GET /api/merchant/pending-reviews
   */
  getPendingReviews(page = 1, pageSize = 20) {
    const realApiCall = () => request({
      url: `/merchant/pending-reviews?page=${page}&size=${pageSize}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      reviews: [
        {
          upload_id: 'UP123456789',
          user_id: 1001,
          image_url: 'https://mock-image-url.com/image.jpg',
          amount: 58.5,
          user_amount: 60.0,
          created_at: '2024-12-19T14:30:00Z'
        }
      ],
      pagination: {
        page: 1,
        size: 20,
        total: 5,
        has_more: false
      }
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 审核上传
   * 后端接口: POST /api/merchant/review
   */
  review(uploadId, action, points = 0, reason = '') {
    const realApiCall = () => request({
      url: '/merchant/review',
      method: 'POST',
      data: { 
        upload_id: uploadId, 
        action, 
        points_awarded: points, 
        review_reason: reason 
      },
      needAuth: true
    })

    const mockData = {
      upload_id: uploadId,
      action,
      points_awarded: points,
      review_reason: reason,
      review_time: new Date().toISOString()
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 批量审核
   * 后端接口: POST /api/merchant/batch-review
   */
  batchReview(uploadIds, action, reason = '') {
    const realApiCall = () => request({
      url: '/merchant/batch-review',
      method: 'POST',
      data: { 
        upload_ids: uploadIds, 
        action, 
        review_reason: reason 
      },
      needAuth: true
    })

    const mockData = {
      processed_count: uploadIds.length,
      success_count: uploadIds.length,
      failed_count: 0
    }

    return smartApiCall(realApiCall, mockData)
  }
}

module.exports = {
  authAPI,
  lotteryAPI,
  exchangeAPI,
  photoAPI,
  userAPI,
  merchantAPI,
  request,
  smartApiCall,
  mockRequest
} 