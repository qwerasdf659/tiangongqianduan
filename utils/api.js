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

/**
 * 认证相关API接口
 * TODO: 后端对接 - 认证服务接口实现
 * 
 * 后端需要实现的接口：
 * 1. POST /api/auth/send-code - 发送短信验证码
 * 2. POST /api/auth/login - 手机号登录/注册
 * 3. POST /api/auth/refresh - 刷新Token
 * 4. GET /api/auth/verify-token - 验证Token有效性
 */
const authAPI = {
  /**
   * 发送验证码
   * @param {String} phone 手机号
   * 
   * 后端接口规范:
   * POST /api/auth/send-code
   * 请求体: { phone: "13800138000" }
   * 返回: { 
   *   code: 0, 
   *   msg: "验证码已发送", 
   *   data: { 
   *     expire_time: 300,  // 验证码有效期(秒)
   *     can_resend_after: 60  // 多少秒后可重新发送
   *   } 
   * }
   */
  sendCode(phone) {
    return request({
      url: '/api/auth/send-code',
      method: 'POST',
      data: { phone },
      needAuth: false
    })
  },

  /**
   * 手机号登录/绑定
   * @param {String} phone 手机号
   * @param {String} code 验证码
   * 
   * 后端接口规范:
   * POST /api/auth/login
   * 请求体: { phone: "13800138000", code: "123456" }
   * 返回: { 
   *   code: 0, 
   *   msg: "登录成功", 
   *   data: { 
   *     access_token: "jwt_token_string",
   *     refresh_token: "refresh_token_string",
   *     expires_in: 7200,  // Token有效期(秒)
   *     user_info: {
   *       user_id: 123,
   *       phone: "13800138000",
   *       nickname: "用户昵称",
   *       avatar: "头像URL",
   *       total_points: 1000,
   *       is_merchant: false,
   *       created_at: "2024-01-01 00:00:00"
   *     }
   *   } 
   * }
   */
  login(phone, code) {
    return request({
      url: '/api/auth/login',
      method: 'POST',
      data: { phone, code },
      needAuth: false
    })
  },

  /**
   * Token刷新
   * @param {String} refreshToken 刷新令牌
   * 
   * 后端接口规范:
   * POST /api/auth/refresh
   * 请求头: Authorization: Bearer {refresh_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "Token刷新成功", 
   *   data: { 
   *     access_token: "new_jwt_token",
   *     refresh_token: "new_refresh_token",
   *     expires_in: 7200
   *   } 
   * }
   */
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

/**
 * 抽奖相关API接口
 * TODO: 后端对接 - 抽奖服务接口实现
 * 
 * 后端需要实现的接口：
 * 1. GET /api/lottery/config - 获取抽奖配置
 * 2. POST /api/lottery/draw - 执行抽奖
 * 3. GET /api/lottery/records - 获取抽奖记录
 */
const lotteryAPI = {
  /**
   * 获取抽奖配置
   * 
   * 后端接口规范:
   * GET /api/lottery/config
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     cost_points: 100,  // 单次抽奖消耗积分
   *     prizes: [
   *       {
   *         id: 1,
   *         name: "一等奖",
   *         type: "points",  // points积分/coupon优惠券/physical实物
   *         value: 1000,     // 奖品价值
   *         color: "#ff0000", // 转盘颜色
   *         probability: 0.01 // 中奖概率
   *       }
   *     ],
   *     daily_limit: 10,   // 每日抽奖次数限制
   *     rules: "抽奖规则说明"
   *   } 
   * }
   */
  getConfig() {
    return request({
      url: '/api/lottery/config',
      method: 'GET'
    })
  },

  /**
   * 执行抽奖
   * @param {String} drawType 抽奖类型: single/triple/five/ten
   * @param {Number} count 抽奖次数
   * 
   * 后端接口规范:
   * POST /api/lottery/draw
   * 请求体: { draw_type: "single", count: 1 }
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "抽奖成功", 
   *   data: { 
   *     results: [
   *       {
   *         prize_id: 1,
   *         prize_name: "一等奖",
   *         prize_type: "points",
   *         prize_value: 1000,
   *         is_winning: true
   *       }
   *     ],
   *     cost_points: 100,    // 消耗的积分
   *     remaining_points: 900, // 剩余积分
   *     today_draw_count: 5   // 今日已抽奖次数
   *   } 
   * }
   */
  draw(drawType = 'single', count = 1) {
    return request({
      url: '/api/lottery/draw',
      method: 'POST',
      data: { draw_type: drawType, count }
    })
  },

  /**
   * 获取抽奖记录
   * @param {Number} page 页码
   * @param {Number} pageSize 每页数量
   * 
   * 后端接口规范:
   * GET /api/lottery/records?page=1&page_size=20
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     list: [
   *       {
   *         id: 1,
   *         prize_name: "一等奖",
   *         prize_type: "points",
   *         prize_value: 1000,
   *         draw_time: "2024-01-01 12:00:00",
   *         status: "received"  // pending待领取/received已领取
   *       }
   *     ],
   *     total: 100,
   *     page: 1,
   *     page_size: 20
   *   } 
   * }
   */
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/lottery/records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

/**
 * 商品兑换相关API接口
 * TODO: 后端对接 - 商品兑换服务接口实现
 * 
 * 后端需要实现的接口：
 * 1. GET /api/exchange/products - 获取可兑换商品列表
 * 2. POST /api/exchange/redeem - 兑换商品
 * 3. GET /api/exchange/records - 获取兑换记录
 */
const exchangeAPI = {
  /**
   * 获取商品列表
   * 
   * 后端接口规范:
   * GET /api/exchange/products
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     categories: ["优惠券", "实物商品", "虚拟物品"],
   *     products: [
   *       {
   *         id: 1,
   *         name: "10元优惠券",
   *         description: "满50可用",
   *         category: "优惠券",
   *         points_cost: 1000,
   *         stock: 100,
   *         image: "商品图片URL",
   *         status: "available"  // available可兑换/sold_out售罄/disabled已下架
   *       }
   *     ]
   *   } 
   * }
   */
  getProducts() {
    return request({
      url: '/api/exchange/products',
      method: 'GET'
    })
  },

  /**
   * 兑换商品
   * @param {Number} productId 商品ID
   * @param {Number} quantity 兑换数量
   * 
   * 后端接口规范:
   * POST /api/exchange/redeem
   * 请求体: { product_id: 1, quantity: 1 }
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "兑换成功", 
   *   data: { 
   *     order_id: "ORD123456789",
   *     product_name: "10元优惠券",
   *     quantity: 1,
   *     points_cost: 1000,
   *     remaining_points: 500,
   *     redeem_time: "2024-01-01 12:00:00",
   *     delivery_info: "兑换码或快递信息"
   *   } 
   * }
   */
  redeem(productId, quantity = 1) {
    return request({
      url: '/api/exchange/redeem',
      method: 'POST',
      data: { product_id: productId, quantity }
    })
  },

  /**
   * 获取兑换记录
   * @param {Number} page 页码
   * @param {Number} pageSize 每页数量
   * 
   * 后端接口规范:
   * GET /api/exchange/records?page=1&page_size=20
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     list: [
   *       {
   *         id: 1,
   *         order_id: "ORD123456789",
   *         product_name: "10元优惠券",
   *         quantity: 1,
   *         points_cost: 1000,
   *         redeem_time: "2024-01-01 12:00:00",
   *         status: "completed",  // pending处理中/completed已完成/cancelled已取消
   *         delivery_info: "兑换码或快递信息"
   *       }
   *     ],
   *     total: 50,
   *     page: 1,
   *     page_size: 20
   *   } 
   * }
   */
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/exchange/records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

/**
 * 拍照上传相关API接口
 * TODO: 后端对接 - 图片上传和识别服务接口实现
 * 
 * 后端需要实现的接口：
 * 1. POST /api/photo/upload - 上传照片并识别金额
 * 2. GET /api/photo/records - 获取上传记录
 */
const photoAPI = {
  /**
   * 上传照片
   * @param {String} filePath 本地文件路径
   * @param {Number} amount 用户输入的金额（用于验证）
   * 
   * 后端接口规范:
   * POST /api/photo/upload
   * Content-Type: multipart/form-data
   * 请求体: 
   *   - file: 图片文件
   *   - amount: 用户输入金额
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "上传成功", 
   *   data: { 
   *     upload_id: "UP123456789",
   *     image_url: "存储的图片URL",
   *     recognized_amount: 58.50,  // AI识别的金额
   *     input_amount: 58.50,       // 用户输入的金额
   *     match_status: "matched",   // matched匹配/mismatched不匹配/unclear不清晰
   *     points_earned: 585,       // 获得的积分
   *     review_status: "pending", // auto_approved自动通过/pending待审核/rejected已拒绝
   *     upload_time: "2024-01-01 12:00:00"
   *   } 
   * }
   */
  upload(filePath, amount) {
    return new Promise((resolve, reject) => {
      wx.showLoading({
        title: '上传中...',
        mask: true
      })

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

  /**
   * 获取上传记录
   * @param {Number} page 页码
   * @param {Number} pageSize 每页数量
   * 
   * 后端接口规范:
   * GET /api/photo/records?page=1&page_size=20
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     list: [
   *       {
   *         id: 1,
   *         upload_id: "UP123456789",
   *         image_url: "图片URL",
   *         amount: 58.50,
   *         points_earned: 585,
   *         review_status: "approved",  // approved已通过/pending待审核/rejected已拒绝
   *         upload_time: "2024-01-01 12:00:00",
   *         review_time: "2024-01-01 13:00:00",
   *         review_reason: "审核备注"
   *       }
   *     ],
   *     total: 30,
   *     page: 1,
   *     page_size: 20
   *   } 
   * }
   */
  getRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/photo/records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  }
}

/**
 * 用户中心相关API接口  
 * TODO: 后端对接 - 用户信息和积分管理接口实现
 * 
 * 后端需要实现的接口：
 * 1. GET /api/user/info - 获取用户信息
 * 2. PUT /api/user/info - 更新用户信息
 * 3. GET /api/user/statistics - 获取用户统计数据
 * 4. GET /api/user/points-records - 获取积分明细
 * 5. POST /api/user/check-in - 每日签到
 */
const userAPI = {
  /**
   * 获取用户信息
   * 
   * 后端接口规范:
   * GET /api/user/info
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     user_id: 123,
   *     phone: "13800138000",
   *     nickname: "用户昵称",
   *     avatar: "头像URL",
   *     total_points: 1500,
   *     is_merchant: false,
   *     created_at: "2024-01-01 00:00:00",
   *     last_login: "2024-01-15 10:00:00"
   *   } 
   * }
   */
  getUserInfo() {
    return request({
      url: '/api/user/info',
      method: 'GET'
    })
  },

  /**
   * 更新用户信息
   * @param {Object} userInfo 用户信息
   * 
   * 后端接口规范:
   * PUT /api/user/info
   * 请求体: { nickname: "新昵称", avatar: "头像URL" }
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "更新成功", 
   *   data: { 
   *     // 更新后的用户信息
   *   } 
   * }
   */
  updateUserInfo(userInfo) {
    return request({
      url: '/api/user/info',
      method: 'PUT',
      data: userInfo
    })
  },

  /**
   * 获取用户统计数据
   * 
   * 后端接口规范:
   * GET /api/user/statistics
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     total_lottery: 25,      // 总抽奖次数
   *     total_exchange: 8,      // 总兑换次数
   *     total_upload: 12,       // 总上传次数
   *     this_month_points: 2400, // 本月获得积分
   *     total_earned_points: 15000, // 累计获得积分
   *     total_spent_points: 8500    // 累计消费积分
   *   } 
   * }
   */
  getStatistics() {
    return request({
      url: '/api/user/statistics',
      method: 'GET'
    })
  },

  /**
   * 获取积分明细
   * @param {Number} page 页码
   * @param {Number} pageSize 每页数量
   * 
   * 后端接口规范:
   * GET /api/user/points-records?page=1&page_size=20
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     list: [
   *       {
   *         id: 1,
   *         type: "earn",        // earn获得/spend消费
   *         points: 100,
   *         description: "上传小票获得",
   *         source: "photo_upload", // photo_upload拍照/lottery抽奖/exchange兑换/check_in签到
   *         created_at: "2024-01-01 12:00:00"
   *       }
   *     ],
   *     total: 200,
   *     page: 1,
   *     page_size: 20
   *   } 
   * }
   */
  getPointsRecords(page = 1, pageSize = 20) {
    return request({
      url: '/api/user/points-records',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  },

  /**
   * 每日签到
   * 
   * 后端接口规范:
   * POST /api/user/check-in
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "签到成功", 
   *   data: { 
   *     points_earned: 10,      // 签到获得积分
   *     consecutive_days: 5,    // 连续签到天数
   *     total_points: 1510,     // 签到后总积分
   *     next_reward_points: 20, // 下次签到奖励积分
   *     check_in_time: "2024-01-01 12:00:00"
   *   } 
   * }
   */
  checkIn() {
    return request({
      url: '/api/user/check-in',
      method: 'POST'
    })
  }
}

/**
 * 商家审核相关API接口
 * TODO: 后端对接 - 商家审核管理接口实现
 * 
 * 后端需要实现的接口：
 * 1. POST /api/merchant/auth - 申请商家权限
 * 2. GET /api/merchant/statistics - 获取审核统计
 * 3. GET /api/merchant/pending-reviews - 获取待审核列表
 * 4. POST /api/merchant/review - 审核上传记录
 * 5. POST /api/merchant/batch-review - 批量审核
 */
const merchantAPI = {
  /**
   * 申请商家权限
   * @param {Object} authInfo 申请信息
   * 
   * 后端接口规范:
   * POST /api/merchant/auth
   * 请求体: { 
   *   store_name: "餐厅名称",
   *   business_license: "营业执照号",
   *   contact_person: "联系人",
   *   contact_phone: "联系电话"
   * }
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "申请成功", 
   *   data: { 
   *     application_id: "APP123456",
   *     status: "pending",  // pending待审核/approved已通过/rejected已拒绝
   *     submit_time: "2024-01-01 12:00:00"
   *   } 
   * }
   */
  auth(authInfo = {}) {
    return request({
      url: '/api/merchant/auth',
      method: 'POST',
      data: authInfo
    })
  },

  /**
   * 获取审核统计
   * 
   * 后端接口规范:
   * GET /api/merchant/statistics
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     pending_count: 8,       // 待审核数量
   *     today_approved: 15,     // 今日已通过
   *     today_rejected: 3,      // 今日已拒绝
   *     total_processed: 256    // 累计处理数量
   *   } 
   * }
   */
  getStatistics() {
    return request({
      url: '/api/merchant/statistics',
      method: 'GET'
    })
  },

  /**
   * 获取待审核列表
   * @param {Number} page 页码
   * @param {Number} pageSize 每页数量
   * 
   * 后端接口规范:
   * GET /api/merchant/pending-reviews?page=1&page_size=20
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "success", 
   *   data: { 
   *     list: [
   *       {
   *         id: 1,
   *         upload_id: "UP123456789",
   *         user_id: 123,
   *         user_phone: "138****8000",
   *         image_url: "小票图片URL",
   *         input_amount: 58.50,
   *         recognized_amount: 58.50,
   *         expected_points: 585,
   *         upload_time: "2024-01-01 12:00:00",
   *         status: "pending"
   *       }
   *     ],
   *     total: 8,
   *     page: 1,
   *     page_size: 20
   *   } 
   * }
   */
  getPendingReviews(page = 1, pageSize = 20) {
    return request({
      url: '/api/merchant/pending-reviews',
      method: 'GET',
      data: { page, page_size: pageSize }
    })
  },

  /**
   * 审核上传记录
   * @param {Number} reviewId 审核ID
   * @param {String} action 审核动作: approve/reject
   * @param {Number} points 实际给予的积分
   * @param {String} reason 审核理由
   * 
   * 后端接口规范:
   * POST /api/merchant/review
   * 请求体: { 
   *   review_id: 1,
   *   action: "approve",  // approve通过/reject拒绝
   *   points: 585,        // 实际给予的积分（仅approve时需要）
   *   reason: "审核理由"   // 可选的审核理由
   * }
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "审核成功", 
   *   data: { 
   *     review_id: 1,
   *     final_status: "approved",
   *     points_awarded: 585,
   *     review_time: "2024-01-01 13:00:00"
   *   } 
   * }
   */
  review(reviewId, action, points = 0, reason = '') {
    return request({
      url: '/api/merchant/review',
      method: 'POST',
      data: { 
        review_id: reviewId,
        action,
        points,
        reason
      }
    })
  },

  /**
   * 批量审核
   * @param {Array} reviewIds 审核ID列表
   * @param {String} action 审核动作: approve/reject
   * @param {String} reason 批量审核理由
   * 
   * 后端接口规范:
   * POST /api/merchant/batch-review
   * 请求体: { 
   *   review_ids: [1, 2, 3],
   *   action: "approve",  // approve通过/reject拒绝
   *   reason: "批量审核理由"
   * }
   * 请求头: Authorization: Bearer {access_token}
   * 返回: { 
   *   code: 0, 
   *   msg: "批量审核成功", 
   *   data: { 
   *     success_count: 3,
   *     failed_count: 0,
   *     results: [
   *       { review_id: 1, status: "success" },
   *       { review_id: 2, status: "success" },
   *       { review_id: 3, status: "success" }
   *     ]
   *   } 
   * }
   */
  batchReview(reviewIds, action, reason = '') {
    return request({
      url: '/api/merchant/batch-review',
      method: 'POST',
      data: {
        review_ids: reviewIds,
        action,
        reason
      }
    })
  }
}

/**
 * 开发环境模拟数据
 * 生产环境时此部分数据仅作为接口格式参考，不会被实际使用
 * TODO: 生产环境优化 - 可考虑移除mock数据减少包体积
 */
const mockData = {
  // 模拟抽奖配置
  lotteryConfig: {
    code: 0,
    msg: 'success',
    data: {
      cost_points: 100,  // 单次抽奖消耗积分
      daily_limit: 10,   // 每日抽奖次数限制
      rules: "每次抽奖消耗100积分，每日最多可抽奖10次",
      prizes: [
        { id: 1, name: '八八折券', angle: 0, color: '#FF6B35', type: 'coupon', value: 0.88, probability: 5 },
        { id: 2, name: '九八折券', angle: 45, color: '#4ECDC4', type: 'coupon', value: 0.98, probability: 10 },
        { id: 3, name: '甜品1份', angle: 90, color: '#FFD93D', type: 'physical', value: 15, probability: 30 },
        { id: 4, name: '青菜1份', angle: 135, color: '#6BCF7F', type: 'physical', value: 8, probability: 30 },
        { id: 5, name: '虾1份', angle: 180, color: '#FF6B6B', type: 'physical', value: 25, probability: 5 },
        { id: 6, name: '花甲1份', angle: 225, color: '#4DABF7', type: 'physical', value: 18, probability: 15 },
        { id: 7, name: '鱿鱼1份', angle: 270, color: '#9775FA', type: 'physical', value: 22, probability: 4 },
        { id: 8, name: '生腌拼盘', angle: 315, color: '#FFB84D', type: 'physical', value: 35, probability: 1 }
      ]
    }
  },

  // 模拟商品兑换列表
  exchangeProducts: {
    code: 0,
    msg: 'success',
    data: {
      categories: ["优惠券", "实物商品", "虚拟物品"],
      products: [
        { 
          id: 1, 
          name: '10元优惠券', 
          category: '优惠券',
          description: '满50元可用，有效期30天',
          image: 'https://via.placeholder.com/200x200/FF6B35/ffffff?text=10元券',
          points_cost: 1000,
          stock: 100,
          status: 'available'
        },
        {
          id: 2,
          name: '20元优惠券',
          category: '优惠券', 
          description: '满100元可用，有效期30天',
          image: 'https://via.placeholder.com/200x200/4ECDC4/ffffff?text=20元券',
          points_cost: 1800,
          stock: 50,
          status: 'available'
        },
        {
          id: 3,
          name: '小海鲜拼盘',
          category: '实物商品',
          description: '新鲜海鲜拼盘，包含虾、花甲、鱿鱼',
          image: 'https://via.placeholder.com/200x200/FFD93D/000000?text=海鲜',
          points_cost: 2500,
          stock: 20,
          status: 'available'
        },
        {
          id: 4,
          name: '会员月卡',
          category: '虚拟物品',
          description: '30天会员特权，享受9折优惠',
          image: 'https://via.placeholder.com/200x200/9775FA/ffffff?text=会员卡',
          points_cost: 3000,
          stock: 999,
          status: 'available'
        }
      ]
    }
  },

  // 模拟用户统计数据
  userStatistics: {
    code: 0,
    msg: 'success',
    data: {
      total_lottery: 25,      // 总抽奖次数
      total_exchange: 8,      // 总兑换次数  
      total_upload: 12,       // 总上传次数
      this_month_points: 2400, // 本月获得积分
      total_earned_points: 15000, // 累计获得积分
      total_spent_points: 8500    // 累计消费积分
    }
  },

  // 模拟商家审核统计
  merchantStatistics: {
    code: 0,
    msg: 'success',
    data: {
      pending_count: 8,       // 待审核数量
      today_approved: 15,     // 今日已通过
      today_rejected: 3,      // 今日已拒绝  
      total_processed: 256    // 累计处理数量
    }
  }
}

/**
 * 开发环境API Mock拦截器
 * 根据请求URL返回对应的模拟数据
 * TODO: 生产环境移除 - 生产环境直接调用真实API
 */
const mockRequest = (url, data = {}) => {
  console.log('🔧 开发环境Mock API请求:', url, data)
  
  return new Promise((resolve, reject) => {
    // 模拟网络延迟
    setTimeout(() => {
      try {
        switch (url) {
          // 抽奖相关
          case '/api/lottery/config':
            resolve(mockData.lotteryConfig)
            break
            
          case '/api/lottery/draw':
            const prizes = mockData.lotteryConfig.data.prizes
            const randomPrize = prizes[Math.floor(Math.random() * prizes.length)]
            resolve({
              code: 0,
              msg: '抽奖成功',
              data: {
                results: [{
                  prize_id: randomPrize.id,
                  prize_name: randomPrize.name,
                  prize_type: randomPrize.type,
                  prize_value: randomPrize.value,
                  is_winning: true
                }],
                cost_points: 100,
                remaining_points: app.globalData.mockUser.total_points - 100,
                today_draw_count: Math.floor(Math.random() * 5) + 1
              }
            })
            break

          // 商品兑换相关  
          case '/api/exchange/products':
            resolve(mockData.exchangeProducts)
            break
            
          case '/api/exchange/redeem':
            resolve({
              code: 0,
              msg: '兑换成功',
              data: {
                order_id: 'ORD' + Date.now(),
                product_name: '模拟商品',
                quantity: data.quantity || 1,
                points_cost: 1000,
                remaining_points: app.globalData.mockUser.total_points - 1000,
                redeem_time: new Date().toLocaleString(),
                delivery_info: '兑换成功，请到店出示此信息'
              }
            })
            break

          // 用户相关
          case '/api/user/statistics':
            resolve(mockData.userStatistics)
            break
            
          case '/api/user/check-in':
            resolve({
              code: 0,
              msg: '签到成功',
              data: {
                points_earned: 10,
                consecutive_days: Math.floor(Math.random() * 7) + 1,
                total_points: app.globalData.mockUser.total_points + 10,
                next_reward_points: 20,
                check_in_time: new Date().toLocaleString()
              }
            })
            break

          // 商家审核相关
          case '/api/merchant/statistics':
            resolve(mockData.merchantStatistics)
            break

          // 默认成功响应
          default:
            resolve({ 
              code: 0, 
              msg: 'success', 
              data: {
                message: `Mock API响应 - ${url}`,
                timestamp: new Date().toISOString()
              }
            })
        }
      } catch (error) {
        console.error('Mock API错误:', error)
        reject({
          code: -1,
          msg: 'Mock API内部错误',
          error: error.message
        })
      }
    }, Math.random() * 300 + 200) // 200-500ms随机延迟，模拟真实网络
  })
}

/**
 * API接口状态检查器
 * 用于检测当前是否应该使用Mock数据
 */
const shouldUseMock = () => {
  return app.globalData.isDev && !app.globalData.needAuth
}

/**
 * 智能API调用器
 * 根据环境自动选择使用Mock数据还是真实API
 * @param {Function} realApiCall 真实API调用函数
 * @param {String} mockUrl Mock数据URL
 * @param {Object} mockData Mock数据参数
 */
const smartApiCall = async (realApiCall, mockUrl, mockData = {}) => {
  if (shouldUseMock()) {
    return await mockRequest(mockUrl, mockData)
  } else {
    return await realApiCall()
  }
}

// API模块导出
module.exports = {
  // 核心请求方法
  request,
  
  // 各功能模块API
  authAPI,
  lotteryAPI, 
  exchangeAPI,
  photoAPI,
  userAPI,
  merchantAPI,
  
  // 开发辅助工具
  mockRequest,
  mockData,
  shouldUseMock,
  smartApiCall,
  
  // 工具方法（供页面组件使用）
  utils: {
    // 格式化错误信息
    formatError: (error) => {
      if (typeof error === 'string') return error
      return error.msg || error.message || '未知错误'
    },
    
    // 检查网络状态
    checkNetwork: () => {
      return new Promise((resolve) => {
        wx.getNetworkType({
          success: (res) => {
            resolve(res.networkType !== 'none')
          },
          fail: () => {
            resolve(false)
          }
        })
      })
    },
    
    // 重试机制
    retry: async (apiCall, maxRetries = 3, delay = 1000) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await apiCall()
        } catch (error) {
          if (i === maxRetries - 1) throw error
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
  }
} 