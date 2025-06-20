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

        // 统一错误处理
        if (res.statusCode === 200) {
          if (res.data.code === 0) {
            resolve(res.data)
          } else if (res.data.code === 1002 || res.data.code === 2001) {
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
            // 其他业务错误
            if (showLoading) {
              wx.showToast({
                title: res.data.msg || '操作失败',
                icon: 'none',
                duration: 2000
              })
            }
            reject(res.data)
          }
        } else {
          // HTTP状态码错误
          if (showLoading) {
            wx.showToast({
              title: `网络错误 ${res.statusCode}`,
              icon: 'none'
            })
          }
          reject({ code: res.statusCode, msg: `网络错误 ${res.statusCode}` })
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
            msg: errorMsg, 
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
          msg: 'success',
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
 * 🔴 认证相关API接口 - 根据后端文档实现
 */
const authAPI = {
  /**
   * 发送验证码
   * 后端接口: POST /api/auth/send-code
   */
  sendCode(phone) {
    const realApiCall = () => request({
      url: '/api/auth/send-code',
      method: 'POST',
      data: { phone },
      needAuth: false
    })

    const mockData = {
      expire_time: 300,
      can_resend_after: 60
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 手机号登录/注册
   * 后端接口: POST /api/auth/login
   */
  login(phone, code) {
    const realApiCall = () => request({
      url: '/api/auth/login',
      method: 'POST',
      data: { phone, code },
      needAuth: false
    })

    const mockData = {
      access_token: 'mock_access_token_' + Date.now(),
      refresh_token: 'mock_refresh_token_' + Date.now(),
      expires_in: 7200,
      user_info: {
        user_id: 1001,
        mobile: phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        nickname: `用户${phone.slice(-4)}`,
        avatar: '/images/default-avatar.png',
        total_points: 1000,
        is_merchant: false,
        wx_openid: 'mock_openid_' + Date.now(),
        device_info: {},
        last_login: new Date().toISOString(),
        status: 'active',
        created_at: new Date().toISOString()
      }
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * Token刷新
   * 后端接口: POST /api/auth/refresh
   */
  refresh(refreshToken) {
    const realApiCall = () => request({
      url: '/api/auth/refresh',
      method: 'POST',
      data: {},
      header: {
        'Authorization': `Bearer ${refreshToken}`
      },
      needAuth: false
    })

    const mockData = {
      access_token: 'new_mock_access_token_' + Date.now(),
      refresh_token: 'new_mock_refresh_token_' + Date.now(),
      expires_in: 7200
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 验证Token有效性
   * 后端接口: GET /api/auth/verify-token
   */
  verifyToken() {
    const realApiCall = () => request({
      url: '/api/auth/verify-token',
      method: 'GET',
      needAuth: true
    })

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
      url: '/api/auth/logout',
      method: 'POST',
      needAuth: true
    })

    const mockData = { success: true }

    return smartApiCall(realApiCall, mockData)
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
      url: '/api/lottery/config',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      cost_points: 100,
      prizes: [
        { id: 1, name: '八八折券', type: 'coupon', value: 88, angle: 0, color: '#FF6B6B', probability: 0.05, is_activity: true },
        { id: 2, name: '50积分', type: 'points', value: 50, angle: 45, color: '#4ECDC4', probability: 0.20, is_activity: false },
        { id: 3, name: '九九折券', type: 'coupon', value: 99, angle: 90, color: '#45B7D1', probability: 0.10, is_activity: false },
        { id: 4, name: '100积分', type: 'points', value: 100, angle: 135, color: '#96CEB4', probability: 0.15, is_activity: false },
        { id: 5, name: '免费咖啡', type: 'physical', value: 25, angle: 180, color: '#FFEAA7', probability: 0.08, is_activity: true },
        { id: 6, name: '30积分', type: 'points', value: 30, angle: 225, color: '#DDA0DD', probability: 0.25, is_activity: false },
        { id: 7, name: '神秘大奖', type: 'physical', value: 500, angle: 270, color: '#FF7675', probability: 0.02, is_activity: true },
        { id: 8, name: '谢谢参与', type: 'empty', value: 0, angle: 315, color: '#74B9FF', probability: 0.15, is_activity: false }
      ]
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 执行抽奖
   * 后端接口: POST /api/lottery/draw
   */
  draw(drawType = 'single', count = 1) {
    const realApiCall = () => request({
      url: '/api/lottery/draw',
      method: 'POST',
      data: { draw_type: drawType, count },
      needAuth: true
    })

    // Mock抽奖结果
    const prizes = [
      { id: 2, name: '50积分', type: 'points', value: 50, angle: 45 },
      { id: 6, name: '30积分', type: 'points', value: 30, angle: 225 },
      { id: 8, name: '谢谢参与', type: 'empty', value: 0, angle: 315 }
    ]
    
    const results = []
    for (let i = 0; i < count; i++) {
      const randomPrize = prizes[Math.floor(Math.random() * prizes.length)]
      results.push({
        ...randomPrize,
        is_near_miss: Math.random() < 0.1 // 10%概率触发差点中奖
      })
    }

    const mockData = {
      results,
      points_cost: count * 100,
      remaining_points: (app.globalData.userInfo?.total_points || 1000) - count * 100
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取抽奖记录
   * 后端接口: GET /api/lottery/records
   */
  getRecords(page = 1, pageSize = 20) {
    const realApiCall = () => request({
      url: `/api/lottery/records?page=${page}&size=${pageSize}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          prize_name: '50积分',
          prize_type: 'points',
          prize_value: 50,
          points_cost: 100,
          created_at: '2024-12-19 14:30:00'
        }
      ],
      total: 1,
      page,
      pageSize,
      totalPages: 1
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取抽奖统计
   * 后端接口: GET /api/lottery/statistics
   */
  getStatistics() {
    const realApiCall = () => request({
      url: '/api/lottery/statistics',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      total_draws: 50,
      total_points_spent: 5000,
      total_points_won: 2500,
      win_rate: 0.6,
      favorite_prize: '50积分',
      recent_draws: 5
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 商品兑换API接口 - 根据后端文档实现
 */
const exchangeAPI = {
  /**
   * 获取商品分类
   * 后端接口: GET /api/exchange/categories
   */
  getCategories() {
    const realApiCall = () => request({
      url: '/api/exchange/categories',
      method: 'GET',
      needAuth: false
    })

    const mockData = {
      categories: [
        { id: 'all', name: '全部商品', count: 100 },
        { id: 'drinks', name: '饮品', count: 25 },
        { id: 'food', name: '美食', count: 30 },
        { id: 'snacks', name: '零食', count: 20 },
        { id: 'digital', name: '数码', count: 15 },
        { id: 'lifestyle', name: '生活用品', count: 10 }
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
      url: `/api/exchange/products?page=${page}&size=${pageSize}&category=${category}&sort=${sort}`,
      method: 'GET',
      needAuth: true
    })

    // 模拟商品数据
    const generateMockProducts = () => {
      const products = []
      const categories = ['drinks', 'food', 'snacks', 'digital', 'lifestyle']
      const names = {
        drinks: ['星巴克拿铁', '喜茶芝芝莓莓', '瑞幸咖啡', '奈雪的茶', '茶百道'],
        food: ['肯德基全家桶', '麦当劳套餐', '必胜客披萨', '海底捞火锅', '西贝莜面村'],
        snacks: ['三只松鼠坚果', '良品铺子零食', '百草味干果', '来伊份小食', '盐津铺子'],
        digital: ['华为蓝牙耳机', '小米充电宝', '苹果数据线', '罗技鼠标', '键盘'],
        lifestyle: ['洗发水套装', '面膜套装', '保温杯', '雨伞', '毛巾套装']
      }
      
      for (let i = 1; i <= 100; i++) {
        const cat = categories[Math.floor(Math.random() * categories.length)]
        const nameList = names[cat]
        const name = nameList[Math.floor(Math.random() * nameList.length)]
        
        products.push({
          commodity_id: i,
          name: `${name} #${i}`,
          description: `精品${name}，品质保证`,
          category: cat,
          exchange_points: Math.floor(Math.random() * 2000) + 200,
          stock: Math.floor(Math.random() * 100) + 1,
          image: `/images/products/${cat}/${i % 5 + 1}.jpg`,
          status: 'active',
          is_hot: Math.random() < 0.2,
          sort_order: i,
          rating: (Math.random() * 2 + 3).toFixed(1),
          sales_count: Math.floor(Math.random() * 500)
        })
      }
      
      return products
    }

    const allProducts = generateMockProducts()
    let filteredProducts = allProducts

    // 分类筛选
    if (category !== 'all') {
      filteredProducts = allProducts.filter(p => p.category === category)
    }

    // 排序
    if (sort === 'points') {
      filteredProducts.sort((a, b) => a.exchange_points - b.exchange_points)
    } else if (sort === 'sales') {
      filteredProducts.sort((a, b) => b.sales_count - a.sales_count)
    } else if (sort === 'rating') {
      filteredProducts.sort((a, b) => b.rating - a.rating)
    }

    // 分页
    const start = (page - 1) * pageSize
    const end = start + pageSize
    const pagedProducts = filteredProducts.slice(start, end)

    const mockData = {
      products: pagedProducts,
      total: filteredProducts.length,
      page,
      pageSize,
      totalPages: Math.ceil(filteredProducts.length / pageSize)
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 商品兑换
   * 后端接口: POST /api/exchange/redeem
   */
  redeem(productId, quantity = 1, deliveryInfo = {}) {
    const realApiCall = () => request({
      url: '/api/exchange/redeem',
      method: 'POST',
      data: {
        product_id: productId,
        quantity,
        delivery_address: deliveryInfo
      },
      needAuth: true
    })

    const mockData = {
      order_id: 'ORD' + Date.now(),
      product_id: productId,
      quantity,
      points_cost: quantity * 500,
      status: 'processing',
      estimated_delivery: '3-5个工作日',
      tracking_number: null
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取兑换记录
   * 后端接口: GET /api/exchange/records
   */
  getRecords(page = 1, pageSize = 20, status = 'all') {
    const realApiCall = () => request({
      url: `/api/exchange/records?page=${page}&size=${pageSize}&status=${status}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          order_id: 'ORD202412190001',
          product_name: '星巴克拿铁',
          quantity: 1,
          points_cost: 800,
          status: 'completed',
          created_at: '2024-12-19 14:30:00',
          completed_at: '2024-12-20 10:00:00'
        }
      ],
      total: 1,
      page,
      pageSize,
      totalPages: 1
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 拍照上传API接口 - 根据后端文档实现
 */
const photoAPI = {
  /**
   * 图片上传
   * 后端接口: POST /api/photo/upload
   */
  upload(filePath) {
    if (shouldUseMock()) {
      // 开发环境模拟上传
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            code: 0,
            msg: 'success',
            data: {
              upload_id: 'UP' + Date.now(),
              image_url: filePath,
              estimated_amount: (50 + Math.random() * 200).toFixed(2), // 预估金额
              points_awarded: 0, // 上传时不给积分，需要审核
              review_status: 'pending',
              estimated_review_time: '1-24小时'
            }
          })
        }, 2000)
      })
    } else {
      // 生产环境真实上传
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: app.globalData.baseUrl + '/api/photo/upload',
          filePath: filePath,
          name: 'file',
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
              reject({ code: -1, msg: '响应解析失败' })
            }
          },
          fail(err) {
            reject({ code: -1, msg: '上传失败', error: err })
          }
        })
      })
    }
  },

  /**
   * 获取上传记录
   * 后端接口: GET /api/photo/records
   */
  getRecords(page = 1, pageSize = 20, status = 'all') {
    const realApiCall = () => request({
      url: `/api/photo/records?page=${page}&size=${pageSize}&status=${status}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          upload_id: 'UP202412190001',
          image_url: '/temp/upload_image.jpg',
          estimated_amount: 58.50,
          actual_amount: 58.50,
          points_awarded: 585,
          review_status: 'approved',
          review_reason: '小票清晰，审核通过',
          upload_time: '2024-12-19 14:30:00',
          review_time: '2024-12-19 16:00:00'
        }
      ],
      total: 1,
      page,
      pageSize,
      totalPages: 1
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
      url: '/api/user/info',
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
      url: '/api/user/info',
      method: 'PUT',
      data: userInfo,
      needAuth: true
    })

    const mockData = {
      ...app.globalData.mockUser,
      ...userInfo,
      updated_at: new Date().toISOString()
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取用户统计
   * 后端接口: GET /api/user/statistics
   */
  getStatistics() {
    const realApiCall = () => request({
      url: '/api/user/statistics',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      total_points_earned: 5000,
      total_points_spent: 3500,
      current_points: 1500,
      total_draws: 35,
      total_exchanges: 7,
      total_uploads: 12,
      member_days: 365,
      achievement_count: 8
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取积分记录
   * 后端接口: GET /api/points/records
   */
  getPointsRecords(page = 1, pageSize = 20, type = 'all') {
    const realApiCall = () => request({
      url: `/api/points/records?page=${page}&size=${pageSize}&type=${type}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      records: [
        {
          id: 1,
          type: 'earn',
          points: 585,
          description: '拍照上传奖励',
          source: 'photo_upload',
          balance_after: 1585,
          created_at: '2024-12-19 14:30:00'
        },
        {
          id: 2,
          type: 'spend',
          points: -100,
          description: '单次抽奖',
          source: 'lottery',
          balance_after: 1485,
          created_at: '2024-12-19 15:00:00'
        }
      ],
      total: 2,
      page,
      pageSize,
      totalPages: 1
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 签到
   * 后端接口: POST /api/points/check-in
   */
  checkIn() {
    const realApiCall = () => request({
      url: '/api/points/check-in',
      method: 'POST',
      needAuth: true
    })

    const mockData = {
      success: true,
      points_awarded: 10,
      consecutive_days: 5,
      next_reward_points: 20,
      next_reward_days: 7
    }

    return smartApiCall(realApiCall, mockData)
  }
}

/**
 * 🔴 商家管理API接口 - 根据后端文档实现
 */
const merchantAPI = {
  /**
   * 申请商家权限
   * 后端接口: POST /api/merchant/apply
   */
  apply(authInfo = {}) {
    const realApiCall = () => request({
      url: '/api/merchant/apply',
      method: 'POST',
      data: {
        store_name: authInfo.storeName || '测试餐厅',
        business_license: authInfo.businessLicense || '123456789',
        contact_person: authInfo.contactPerson || '张经理',
        contact_phone: authInfo.contactPhone || '13800138000',
        description: authInfo.description || '申请商家权限'
      },
      needAuth: true
    })

    const mockData = {
      application_id: 'APP' + Date.now(),
      status: 'pending',
      estimated_review_time: '1-3个工作日',
      submitted_at: new Date().toISOString()
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取商家统计
   * 后端接口: GET /api/merchant/statistics
   */
  getStatistics() {
    const realApiCall = () => request({
      url: '/api/merchant/statistics',
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      pending_reviews: 15,
      approved_today: 8,
      rejected_today: 2,
      total_reviews: 156,
      avg_review_time: 2.5,
      approval_rate: 0.85
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 获取待审核列表
   * 后端接口: GET /api/merchant/pending-reviews
   */
  getPendingReviews(page = 1, pageSize = 20) {
    const realApiCall = () => request({
      url: `/api/merchant/pending-reviews?page=${page}&size=${pageSize}`,
      method: 'GET',
      needAuth: true
    })

    const mockData = {
      reviews: [
        {
          review_id: 1,
          user_id: 1001,
          upload_id: 'UP202412190001',
          image_url: '/temp/receipt1.jpg',
          input_amount: 58.50,
          recognized_amount: 58.00,
          match_status: 'matched',
          upload_time: '2024-12-19 14:30:00',
          user_info: {
            nickname: '用户8000',
            avatar: '/images/default-avatar.png'
          }
        }
      ],
      total: 1,
      page,
      pageSize,
      totalPages: 1
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 执行审核
   * 后端接口: POST /api/merchant/review
   */
  review(reviewId, action, points = 0, reason = '') {
    const realApiCall = () => request({
      url: '/api/merchant/review',
      method: 'POST',
      data: {
        review_id: reviewId,
        action,
        points,
        reason
      },
      needAuth: true
    })

    const mockData = {
      success: true,
      review_id: reviewId,
      action,
      points_awarded: points,
      review_time: new Date().toISOString()
    }

    return smartApiCall(realApiCall, mockData)
  },

  /**
   * 批量审核
   * 后端接口: POST /api/merchant/batch-review
   */
  batchReview(reviewIds, action, reason = '') {
    const realApiCall = () => request({
      url: '/api/merchant/batch-review',
      method: 'POST',
      data: {
        review_ids: reviewIds,
        action,
        reason
      },
      needAuth: true
    })

    const mockData = {
      success: true,
      processed_count: reviewIds.length,
      failed_count: 0,
      total_points_awarded: reviewIds.length * (action === 'approve' ? 500 : 0)
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
  mockRequest: smartApiCall
} 