// pages/lottery/lottery.js - 抽奖页面逻辑
const app = getApp()
const { lotteryAPI, userAPI, mockRequest } = require('../../utils/api')
const { wsManager } = require('../../utils/ws')
const { SliderVerify, throttle } = require('../../utils/validate')

Page({
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 抽奖配置
    prizes: [],
    costPoints: 100,
    
    // 转盘状态
    isDrawing: false,
    currentAngle: 0,
    
    // 抽奖结果
    showResult: false,
    resultData: null,
    
    // 统计信息
    todayDrawCount: 0,
    
    // 滑块验证
    sliderVerify: null,
    
    // 开发环境模拟数据
    mockPrizes: [
      { id: 1, name: '八八折券', angle: 0, color: '#FF6B35', is_activity: true },
      { id: 2, name: '九八折券', angle: 45, color: '#4ECDC4', is_activity: false },
      { id: 3, name: '甜品1份', angle: 90, color: '#FFD93D', is_activity: false },
      { id: 4, name: '青菜1份', angle: 135, color: '#6BCF7F', is_activity: false },
      { id: 5, name: '虾1份', angle: 180, color: '#FF6B6B', is_activity: false },
      { id: 6, name: '花甲1份', angle: 225, color: '#4DABF7', is_activity: false },
      { id: 7, name: '鱿鱼1份', angle: 270, color: '#9775FA', is_activity: false },
      { id: 8, name: '生腌拼盘', angle: 315, color: '#FFB84D', is_activity: true }
    ]
  },

  onLoad() {
    console.log('抽奖页面加载')
    this.initPage()
  },

  onShow() {
    console.log('抽奖页面显示')
    this.refreshUserInfo()
    wsManager.connect() // 连接WebSocket
  },

  onHide() {
    console.log('抽奖页面隐藏')
  },

  onUnload() {
    console.log('抽奖页面卸载')
  },

  /**
   * 初始化页面
   */
  async initPage() {
    // 初始化用户信息
    const userInfo = app.globalData.userInfo || app.globalData.mockUser || {
      user_id: 1001,
      phone: '138****8000',
      total_points: 1500,
      is_merchant: false,
      nickname: '测试用户'
    }
    
    this.setData({
      userInfo: userInfo,
      totalPoints: userInfo.total_points || 1500
    })

    // 初始化滑块验证
    this.data.sliderVerify = new SliderVerify()

    // 初始化Canvas
    this.initCanvas()

    // 加载抽奖配置
    await this.loadLotteryConfig()
  },

  /**
   * 刷新用户信息
   * TODO: 后端对接 - 用户信息接口
   * 
   * 对接说明：
   * 接口：GET /api/user/info
   * 认证：需要Bearer Token
   * 返回：用户详细信息，主要获取最新的积分余额
   */
  async refreshUserInfo() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟用户数据')
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return
    }

    try {
      console.log('📡 刷新用户信息...')
      const res = await userAPI.getUserInfo()
      
      this.setData({
        userInfo: res.data,
        totalPoints: res.data.total_points
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = res.data
      console.log('✅ 用户信息刷新成功，当前积分:', res.data.total_points)
      
    } catch (error) {
      console.error('❌ 获取用户信息失败:', error)
      
      // 错误处理：使用全局缓存数据
      if (app.globalData.userInfo) {
        this.setData({
          userInfo: app.globalData.userInfo,
          totalPoints: app.globalData.userInfo.total_points
        })
      }
    }
  },

  /**
   * 加载抽奖配置
   * TODO: 后端对接 - 抽奖配置接口
   * 
   * 对接说明：
   * 接口：GET /api/lottery/config
   * 认证：需要Bearer Token
   * 返回：抽奖配置信息，包括奖品列表、消耗积分、抽奖规则等
   */
  async loadLotteryConfig() {
    try {
      let configData
      
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境使用模拟数据
        console.log('🔧 使用模拟抽奖配置')
        configData = await mockRequest('/api/lottery/config')
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求抽奖配置接口...')
        configData = await lotteryAPI.getConfig()
      }

      // 验证和处理配置数据
      if (configData && configData.data) {
        const prizes = configData.data.prizes || []
        
        // 确保奖品数据有效
        if (prizes.length > 0) {
          this.setData({
            prizes: prizes,
            costPoints: configData.data.cost_points || 100,
            dailyLimit: configData.data.daily_limit || 10,
            lotteryRules: configData.data.rules || '每次抽奖消耗积分，获得随机奖品'
          })
          
          console.log('✅ 抽奖配置加载成功，奖品数量:', prizes.length)
        } else {
          console.warn('⚠️ 服务器返回的奖品数据为空，使用默认配置')
          this.setDefaultLotteryConfig()
        }
      } else {
        console.warn('⚠️ 服务器返回数据格式异常，使用默认配置')
        this.setDefaultLotteryConfig()
      }

      // 安全绘制转盘
      setTimeout(() => {
        this.drawWheel()
      }, 100)
      
    } catch (error) {
      console.error('❌ 加载抽奖配置失败:', error)
      
      // 使用默认配置确保页面正常显示
      this.setDefaultLotteryConfig()
      
      // 安全绘制转盘
      setTimeout(() => {
        this.drawWheel()
      }, 100)
      
      wx.showToast({
        title: '抽奖配置加载失败',
        icon: 'none'
      })
    }
  },

  /**
   * 设置默认抽奖配置
   */
  setDefaultLotteryConfig() {
    const defaultPrizes = [
      { id: 1, name: '谢谢参与', angle: 0, color: '#FF6B35', type: 'none', value: 0, probability: 40 },
      { id: 2, name: '积分奖励', angle: 45, color: '#4ECDC4', type: 'points', value: 50, probability: 30 },
      { id: 3, name: '优惠券', angle: 90, color: '#FFD93D', type: 'coupon', value: 0.9, probability: 20 },
      { id: 4, name: '小礼品', angle: 135, color: '#6BCF7F', type: 'physical', value: 10, probability: 10 },
      { id: 5, name: '再来一次', angle: 180, color: '#FF6B6B', type: 'retry', value: 0, probability: 25 },
      { id: 6, name: '特别奖', angle: 225, color: '#4DABF7', type: 'special', value: 100, probability: 15 },
      { id: 7, name: '惊喜奖', angle: 270, color: '#9775FA', type: 'surprise', value: 200, probability: 10 },
      { id: 8, name: '幸运奖', angle: 315, color: '#FFB84D', type: 'lucky', value: 500, probability: 5 }
    ]
    
    this.setData({
      prizes: defaultPrizes,
      costPoints: 100,
      dailyLimit: 10,
      lotteryRules: '抽奖配置加载失败，使用默认配置'
    })
    
    console.log('🔧 已设置默认抽奖配置')
  },

  /**
   * 初始化Canvas - 微信小程序兼容版本
   */
  initCanvas() {
    try {
      // 尝试使用新版Canvas API (微信小程序基础库 2.7.0+)
      if (wx.createCanvasContext) {
        const ctx = wx.createCanvasContext('wheelCanvas', this)
        this.canvasCtx = ctx
        console.log('✅ Canvas初始化成功（兼容模式）')
      } else {
        console.error('❌ Canvas API不可用')
        wx.showToast({
          title: 'Canvas不支持',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('❌ Canvas初始化失败:', error)
      wx.showToast({
        title: 'Canvas初始化失败',
        icon: 'none'
      })
    }
  },

  /**
   * 绘制转盘 - 增强版本
   */
  drawWheel() {
    if (!this.canvasCtx) {
      console.warn('Canvas上下文未初始化')
      return
    }

    try {
      const ctx = this.canvasCtx
      const centerX = 150 // Canvas中心X
      const centerY = 150 // Canvas中心Y
      const radius = 140 // 转盘半径
      const prizes = this.data.prizes

      // 验证奖品数据
      if (!prizes || prizes.length === 0) {
        console.warn('奖品数据为空，使用默认数据')
        this.setDefaultPrizes()
        return
      }

      // 清空画布
      ctx.clearRect(0, 0, 300, 300)

      // 绘制转盘背景
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate(this.data.currentAngle * Math.PI / 180)

      // 计算每个扇形的角度
      const anglePerPrize = 360 / prizes.length

      // 绘制奖品扇形
      prizes.forEach((prize, index) => {
        try {
          const startAngle = (index * anglePerPrize) * Math.PI / 180
          const endAngle = ((index + 1) * anglePerPrize) * Math.PI / 180
          const midAngle = startAngle + (endAngle - startAngle) / 2

          // 绘制扇形
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.arc(0, 0, radius, startAngle, endAngle)
          ctx.closePath()
          ctx.fillStyle = prize.color || '#FF6B35'
          ctx.fill()

          // 绘制边框
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 2
          ctx.stroke()

          // 绘制文字 - 修复文字方向问题
          this.drawPrizeText(ctx, prize, midAngle, radius * 0.7)

        } catch (error) {
          console.warn(`绘制奖品${index}失败:`, error)
        }
      })

      ctx.restore()

      // 绘制指针
      this.drawPointer(ctx, centerX, centerY)

      // 绘制到屏幕
      ctx.draw()

    } catch (error) {
      console.error('❌ 绘制转盘失败:', error)
      // 降级处理：显示静态提示
      this.showStaticFallback()
    }
  },

  /**
   * 绘制奖品文字 - 修复文字方向，确保始终水平显示
   */
  drawPrizeText(ctx, prize, midAngle, textRadius) {
    try {
      ctx.save()
      
      // 计算文字位置
      const textX = Math.cos(midAngle) * textRadius
      const textY = Math.sin(midAngle) * textRadius
      
      // 移动到文字位置
      ctx.translate(textX, textY)
      
      // 重要修改：文字始终保持水平方向，不进行任何旋转
      // 移除所有旋转逻辑，确保文字从左到右、从上到下显示
      
      // 设置文字样式
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 14px Arial'  // 增大字体以提高可读性
      ctx.strokeStyle = '#000000'
      ctx.lineWidth = 0.8  // 加粗描边提高对比度
      
      // 绘制文字描边和填充
      const text = prize.name || '未知奖品'
      ctx.strokeText(text, 0, 0)
      ctx.fillText(text, 0, 0)
      
      ctx.restore()
    } catch (error) {
      console.warn('绘制文字失败:', error)
    }
  },

  /**
   * 设置默认奖品数据
   */
  setDefaultPrizes() {
    const defaultPrizes = [
      { id: 1, name: '谢谢参与', color: '#FF6B35' },
      { id: 2, name: '积分奖励', color: '#4ECDC4' },
      { id: 3, name: '优惠券', color: '#FFD93D' },
      { id: 4, name: '小礼品', color: '#6BCF7F' },
      { id: 5, name: '再来一次', color: '#FF6B6B' },
      { id: 6, name: '特别奖', color: '#4DABF7' },
      { id: 7, name: '惊喜奖', color: '#9775FA' },
      { id: 8, name: '幸运奖', color: '#FFB84D' }
    ]
    
    this.setData({ prizes: defaultPrizes })
    this.drawWheel()
  },

  /**
   * 静态降级显示
   */
  showStaticFallback() {
    wx.showModal({
      title: '转盘显示异常',
      content: '转盘渲染遇到问题，但抽奖功能正常。是否继续？',
      confirmText: '继续抽奖',
      cancelText: '刷新页面',
      success: (res) => {
        if (res.cancel) {
          // 刷新页面
          wx.redirectTo({
            url: '/pages/lottery/lottery'
          })
        }
      }
    })
  },

  /**
   * 绘制指针
   */
  drawPointer(ctx, centerX, centerY) {
    ctx.save()
    ctx.translate(centerX, centerY)
    
    // 指针三角形
    ctx.beginPath()
    ctx.moveTo(0, -120)
    ctx.lineTo(-15, -100)
    ctx.lineTo(15, -100)
    ctx.closePath()
    ctx.fillStyle = '#ff0000'
    ctx.fill()
    
    // 指针圆心
    ctx.beginPath()
    ctx.arc(0, 0, 8, 0, 2 * Math.PI)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 2
    ctx.stroke()
    
    ctx.restore()
  },

  /**
   * 单次抽奖
   */
  onSingleDraw: throttle(function() {
    this.handleDraw('single', 1)
  }, 1000),

  /**
   * 三连抽
   */
  onTripleDraw: throttle(function() {
    this.handleDraw('triple', 3)
  }, 1000),

  /**
   * 五连抽
   */
  onFiveDraw: throttle(function() {
    this.handleDraw('five', 5)
  }, 1000),

  /**
   * 十连抽
   */
  onTenDraw: throttle(function() {
    this.handleDraw('ten', 10)
  }, 1000),

  /**
   * 处理抽奖
   * TODO: 后端对接 - 抽奖接口
   * 
   * 对接说明：
   * 接口：POST /api/lottery/draw
   * 请求体：{ draw_type: "single", count: 1 }
   * 认证：需要Bearer Token
   * 返回：抽奖结果，包括中奖信息、剩余积分等
   */
  async handleDraw(drawType, count) {
    // 检查是否正在抽奖
    if (this.data.isDrawing) {
      wx.showToast({
        title: '正在抽奖中...',
        icon: 'none'
      })
      return
    }

    // 检查积分是否足够
    const needPoints = this.data.costPoints * count
    if (this.data.totalPoints < needPoints) {
      wx.showToast({
        title: `积分不足，需要${needPoints}积分`,
        icon: 'none'
      })
      return
    }

    // 检查每日抽奖次数限制
    if (this.data.todayDrawCount >= this.data.dailyLimit) {
      wx.showToast({
        title: '今日抽奖次数已用完',
        icon: 'none'
      })
      return
    }

    // 检查是否需要滑块验证（抽奖次数较多时）
    if (this.data.todayDrawCount >= 3) {
      try {
        // TODO: 实现滑块验证组件
        // await this.data.sliderVerify.show()
        console.log('🔐 滑块验证暂未实现，跳过验证')
      } catch (error) {
        console.log('滑块验证取消:', error)
        return
      }
    }

    // 开始抽奖
    this.setData({ isDrawing: true })
    wx.showLoading({ title: '抽奖中...' })

    try {
      let drawResult
      
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境使用模拟数据
        console.log('🔧 模拟抽奖，类型:', drawType, '次数:', count)
        drawResult = await mockRequest('/api/lottery/draw', { draw_type: drawType, count })
        console.log('🎰 模拟抽奖结果:', drawResult)
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求抽奖接口，类型:', drawType, '次数:', count)
        drawResult = await lotteryAPI.draw(drawType, count)
        console.log('✅ 抽奖接口调用成功')
      }

      wx.hideLoading()

      // 执行转盘动画
      if (drawResult.data.results && drawResult.data.results.length > 0) {
        await this.playAnimation(drawResult.data.results[0])
      } else {
        // 如果没有结果数据，使用默认动画
        const defaultResult = {
          angle: Math.floor(Math.random() * 360),
          is_near_miss: false
        }
        await this.playAnimation(defaultResult)
      }

      // 更新用户积分和抽奖次数
      this.setData({
        totalPoints: drawResult.data.remaining_points || (this.data.totalPoints - needPoints),
        todayDrawCount: drawResult.data.today_draw_count || (this.data.todayDrawCount + count)
      })

      // 更新全局用户积分
      const newPoints = drawResult.data.remaining_points || (this.data.totalPoints - needPoints)
      if (app.globalData.userInfo) {
        app.globalData.userInfo.total_points = newPoints
      }
      if (app.globalData.mockUser) {
        app.globalData.mockUser.total_points = newPoints
      }

      // 显示抽奖结果
      this.showDrawResult(drawResult.data.results || [])

      console.log('🎉 抽奖完成，剩余积分:', newPoints)

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 抽奖失败:', error)
      
      let errorMsg = '抽奖失败，请重试'
      
      // 根据错误码显示不同的错误信息
      switch (error.code) {
        case 1001:
          errorMsg = '积分不足'
          break
        case 1002:
          errorMsg = '今日抽奖次数已达上限'
          break
        case 1003:
          errorMsg = '抽奖活动已结束'
          break
        case 1004:
          errorMsg = '系统繁忙，请稍后重试'
          break
        default:
          errorMsg = error.msg || error.message || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      })
      
    } finally {
      this.setData({ isDrawing: false })
    }
  },

  /**
   * 播放转盘动画 - 微信小程序兼容版本
   */
  playAnimation(result) {
    return new Promise((resolve) => {
      const targetAngle = result.angle || 0
      const isNearMiss = result.is_near_miss || false
      const totalRotation = 5 * 360 + targetAngle // 5圈 + 目标角度
      const duration = 3000 // 动画时长3秒
      const frameRate = 60 // 帧率
      const frameDuration = 1000 / frameRate // 每帧间隔
      
      let startTime = Date.now()
      let startAngle = this.data.currentAngle
      let animationTimer = null

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // 缓动函数 easeOut
        const easeProgress = 1 - Math.pow(1 - progress, 3)
        
        let currentAngle = startAngle + totalRotation * easeProgress

        // 如果是差点中奖动效
        if (isNearMiss && progress > 0.8) {
          // 在目标角度附近±5度抖动
          const shakeRange = 5
          const shakeOffset = Math.sin((elapsed - duration * 0.8) * 0.05) * shakeRange
          currentAngle += shakeOffset
        }

        this.setData({ currentAngle: currentAngle % 360 })
        
        // 安全绘制转盘
        try {
          this.drawWheel()
        } catch (error) {
          console.warn('转盘绘制警告:', error)
        }

        if (progress < 1) {
          // 使用setTimeout替代requestAnimationFrame以兼容微信小程序
          animationTimer = setTimeout(animate, frameDuration)
        } else {
          // 动画结束
          if (animationTimer) {
            clearTimeout(animationTimer)
          }
          setTimeout(() => {
            resolve()
          }, 500)
        }
      }

      // 开始动画
      animate()
    })
  },

  /**
   * 显示抽奖结果
   */
  showDrawResult(results) {
    this.setData({
      showResult: true,
      resultData: results
    })

    // 3秒后自动关闭结果弹窗
    setTimeout(() => {
      this.setData({ showResult: false })
    }, 3000)
  },

  /**
   * 关闭结果弹窗
   */
  onCloseResult() {
    this.setData({ showResult: false })
  },

  /**
   * 查看抽奖记录
   */
  onViewRecords() {
    wx.showModal({
      title: '抽奖记录',
      content: '抽奖记录功能正在开发中...\n\n您可以在个人中心查看积分明细了解抽奖消费记录',
      confirmText: '去个人中心',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          wx.switchTab({
            url: '/pages/user/user'
          })
        }
      }
    })
  },

  /**
   * 联系客服
   */
  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服热线：400-8888-888\n在线时间：9:00-21:00\n\n您也可以通过微信直接联系我们的客服人员',
      confirmText: '拨打电话',
      cancelText: '知道了',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: '4008888888',
            fail: () => {
              wx.showToast({
                title: '拨号失败',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖 - 天天有惊喜！',
      path: '/pages/lottery/lottery'
    }
  }
}) 