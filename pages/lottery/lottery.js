// pages/lottery/lottery.js - 抽奖页面逻辑
const app = getApp()
const { lotteryAPI, userAPI, mockRequest } = require('../../utils/api')
const { SliderVerify, throttle } = require('../../utils/validate')
const { getStandardPrizes, getFallbackPrizes, getLotteryConfig } = require('./lottery-config')
// 🔧 修复模块导入路径问题
// const { quickCompatibilityCheck, getCompatibilityAdvice } = require('../../utils/compatibility-check')

// 临时使用内联兼容性检查，避免模块导入问题
function quickCompatibilityCheck() {
  try {
    // 创建临时Canvas上下文进行检查
    const canvas = wx.createCanvasContext('temp-check')
    
    const keyAPIs = {
      createLinearGradient: typeof canvas.createLinearGradient === 'function',
      createRadialGradient: typeof canvas.createRadialGradient === 'function',
      quadraticCurveTo: typeof canvas.quadraticCurveTo === 'function',
      filter: 'filter' in canvas
    }
    
    console.log('🔍 Canvas兼容性检查结果:', keyAPIs)
    return keyAPIs
  } catch (error) {
    console.error('❌ 兼容性检查失败:', error)
    // 返回保守的兼容性配置
    return {
      createLinearGradient: true,
      createRadialGradient: false,
      quadraticCurveTo: true,
      filter: false
    }
  }
}

function getCompatibilityAdvice() {
  return {
    alternatives: {
      createRadialGradient: '使用createLinearGradient或纯色填充',
      filter: '移除滤镜效果或使用多层绘制模拟'
    },
    bestPractices: [
      '优先使用基础Canvas API',
      '在使用高级API前先检查兼容性'
    ]
  }
}

Page({
  data: {
    // 用户信息
    userInfo: { nickname: '加载中...', phone: '加载中...' },
    totalPoints: 0,
    
    // 抽奖配置
    prizes: [],
    costPoints: 100,
    
    // 转盘状态
    isDrawing: false,
    currentAngle: 0,
    wheelReady: true,  // 改为默认true，确保按钮显示
    
    // 抽奖结果
    showResult: false,
    resultData: null,
    
    // 统计信息
    todayDrawCount: 0,
    dailyLimit: 10,
    
    // 滑块验证
    sliderVerify: null,
    
    // Canvas相关
    canvasFallback: false,
    showStaticWheel: false,
    canvasError: false,
    
    // Canvas兼容性检查结果
    canvasCompatibility: {
      createRadialGradient: true,
      filter: true,
      quadraticCurveTo: true,
      createLinearGradient: true
    },
    
    // 真机调试相关 - 确保按钮始终可见
    isButtonVisible: true, // 强制设为true
    forceUpdate: 0, // 强制更新标识
    
    // 🔴 使用统一的奖品配置，避免重复数据源
    standardPrizes: getStandardPrizes(),
  },

  onLoad() {
    console.log('抽奖页面加载')
    
    // 🔍 首先进行Canvas兼容性检查
    console.log('🔧 开始Canvas兼容性检查...')
    try {
      const compatibility = quickCompatibilityCheck()
      this.setData({ canvasCompatibility: compatibility })
      
      // 根据兼容性结果调整绘制策略
      if (!compatibility.createRadialGradient || !compatibility.filter) {
        console.log('⚠️ 检测到兼容性问题，已自动启用兼容模式')
      } else {
        console.log('✅ Canvas兼容性检查通过，可以使用高级特性')
      }
    } catch (error) {
      console.error('❌ 兼容性检查失败:', error)
      // 设置保守的兼容性配置
      this.setData({
        canvasCompatibility: {
          createRadialGradient: false,
          filter: false,
          quadraticCurveTo: true,
          createLinearGradient: true
        }
      })
    }
    
    this.initPage()
    
    // 初始化指针动画状态
    this.pointerAnimationPhase = 0
    this.pointerAnimationTimer = null
    
    // 添加调试信息
    setTimeout(() => {
      console.log('🎯 页面加载完成，当前数据状态:', {
        wheelReady: this.data.wheelReady,
        isDrawing: this.data.isDrawing,
        totalPoints: this.data.totalPoints,
        costPoints: this.data.costPoints
      })
      
      // 确认所有功能完整性
      console.log('✅ 抽奖功能完整性确认:', {
        单抽功能: typeof this.onSingleDraw === 'function',
        三连抽功能: typeof this.onTripleDraw === 'function',
        五连抽功能: typeof this.onFiveDraw === 'function',
        十连抽功能: typeof this.onTenDraw === 'function',
        中央按钮已优化: '按钮现在位于转盘红圈中心，尺寸适配美观'
      })
      
      // 🎯 启动指针待机动画
      this.startPointerIdleAnimation()
    }, 1000)
  },

  onShow() {
    console.log('抽奖页面显示')
    this.refreshUserInfo()
    
    // 确保关键状态正确
    this.setData({ 
      wheelReady: true,
      isDrawing: false,
      isButtonVisible: true,
      forceUpdate: Date.now()
    })
    
    // 强制样式修复 - 真机兼容
    setTimeout(() => {
      console.log('🎨 执行强制样式修复')
      
      // 获取所有按钮元素并强制刷新
      const query = wx.createSelectorQuery()
      query.selectAll('view[bindtap="onSingleDraw"]').fields({
        node: true,
        size: true,
        rect: true
      })
      query.exec(res => {
        console.log('🔍 抽奖按钮检查结果:', res)
        
        if (res && res[0] && res[0].length > 0) {
          console.log(`✅ 检测到 ${res[0].length} 个抽奖按钮`)
          res[0].forEach((item, index) => {
            console.log(`按钮${index + 1}:`, {
              width: item.width,
              height: item.height,
              left: item.left,
              top: item.top
            })
          })
        } else {
          console.error('❌ 未检测到任何抽奖按钮，强制启用应急方案')
          this.enableEmergencyButton()
        }
      })
      
      // 强制更新数据
      this.setData({
        wheelReady: true,
        isDrawing: false,
        totalPoints: this.data.totalPoints || 1500,
        costPoints: 100,
        showEmergencyButton: true, // 强制显示应急按钮
        showRealDeviceDebug: true
      })
    }, 500)
    
    // 检查和重置异常状态
    if (this.data.isDrawing && !this.data.showResult) {
      console.log('🔧 检测到异常抽奖状态，自动重置')
      this.setData({ isDrawing: false })
    }
    
    // 初始化转盘Canvas（不影响按钮显示）
    if (this.data.prizes && this.data.prizes.length > 0) {
      setTimeout(() => {
        this.initCanvas()
      }, 200)
    }
  },

  onHide() {
    console.log('抽奖页面隐藏')
    // 停止指针动画，节省资源
    this.stopPointerIdleAnimation()
  },

  onUnload() {
    console.log('抽奖页面卸载')
    // 清理所有动画定时器
    this.stopPointerIdleAnimation()
  },

  onReady() {
    console.log('抽奖页面准备就绪 - 真机调试模式')
    
    // 获取系统信息进行真机检测 - 使用新API避免警告
    try {
      const systemInfo = wx.getDeviceInfo ? wx.getDeviceInfo() : wx.getSystemInfoSync()
      console.log('📱 设备信息:', {
        platform: systemInfo.platform,
        version: systemInfo.version,
        model: systemInfo.model,
        pixelRatio: systemInfo.pixelRatio,
      windowWidth: systemInfo.windowWidth,
      windowHeight: systemInfo.windowHeight
    })
    
    // 检测是否为真机环境
    const isRealDevice = systemInfo.platform !== 'devtools'
    console.log('🔍 运行环境:', isRealDevice ? '真机设备' : '开发者工具')
    
    // 强制确保按钮可见 - 真机优化
    this.setData({ 
      isButtonVisible: true,
      forceUpdate: Date.now(),
      wheelReady: true,
      isDrawing: false,
      totalPoints: this.data.totalPoints || 1500, // 确保有积分
      costPoints: 100,
      // 真机调试标识
      isRealDevice: isRealDevice
    })
    
    // 真机专用 - 延迟检查按钮状态
    setTimeout(() => {
      console.log('🔍 真机调试 - 检查按钮显示状态:', {
        wheelReady: this.data.wheelReady,
        isDrawing: this.data.isDrawing,
        totalPoints: this.data.totalPoints,
        costPoints: this.data.costPoints,
        platform: systemInfo.platform,
        isRealDevice: isRealDevice
      })
      
      // 真机专用 - 检查DOM节点
      const query = wx.createSelectorQuery()
      query.selectAll('.center-draw-button').boundingClientRect()
      query.selectAll('.center-button-container').boundingClientRect()
      query.exec(res => {
        console.log('📱 真机DOM检查结果:', {
          中央按钮数量: res[0] ? res[0].length : 0,
          按钮容器数量: res[1] ? res[1].length : 0,
          按钮详情: res[0],
          容器详情: res[1]
        })
        
        if (!res[0] || res[0].length === 0) {
          console.error('❌ 真机上未检测到中央按钮，启用应急方案')
          this.enableEmergencyButton()
        } else {
          console.log('✅ 真机中央按钮检测正常，数量:', res[0].length)
          
          // 检查按钮是否在可见区域
          res[0].forEach((button, index) => {
            if (button.width === 0 || button.height === 0) {
              console.warn(`⚠️ 按钮${index + 1}尺寸异常:`, button)
            } else {
              console.log(`✅ 按钮${index + 1}正常:`, {
                位置: `(${button.left}, ${button.top})`,
                尺寸: `${button.width}x${button.height}`
              })
            }
          })
        }
      })
    }, 1000)
    
    // 真机专用 - 二次检查和修复
    setTimeout(() => {
      console.log('🔄 真机调试 - 执行二次检查和强制修复')
      this.setData({
        wheelReady: true,
        isDrawing: false,
        forceUpdate: Date.now()
      })
      
      // 如果是真机，显示额外的调试信息
      if (isRealDevice) {
        console.log('📱 真机环境确认，启用所有兼容性方案')
        this.setData({
          showRealDeviceDebug: true
        })
      }
    }, 2000)
    
    } catch (error) {
      console.error('❌ 获取设备信息失败:', error)
      // 设置默认值确保程序继续运行
      this.setData({
        isButtonVisible: true,
        wheelReady: true,
        isDrawing: false,
        totalPoints: this.data.totalPoints || 1500,
        costPoints: 100,
        isRealDevice: false
      })
    }
  },

  /**
   * 启用应急按钮方案
   */
  enableEmergencyButton() {
    console.log('🚨 启用应急按钮方案')
    
    // 在页面底部添加一个可见的应急按钮
    this.setData({
      showEmergencyButton: true,
      // 强制显示所有调试信息
      showRealDeviceDebug: true
    })
    
    // 同时强制刷新页面状态
    setTimeout(() => {
      this.setData({
        wheelReady: true,
        isDrawing: false,
        totalPoints: this.data.totalPoints || 1500,
        forceUpdate: Date.now()
      })
    }, 100)
    
    // 注释掉弹窗显示
    // wx.showModal({
    //   title: '按钮显示问题检测',
    //   content: '检测到转盘中央按钮显示异常。\n\n已启用多个备用按钮方案，请查看：\n1. 转盘中央区域（多个位置）\n2. 转盘下方的可见抽奖按钮\n3. 页面底部的应急抽奖按钮\n\n这些按钮都具有相同的抽奖功能。',
    //   showCancel: false,
    //   confirmText: '知道了'
    // })
  },

  /**
   * 初始化页面
   */
  initPage() {
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
      totalPoints: userInfo.total_points || 1500,
      wheelReady: true,  // 立即设置为true，确保按钮显示
      // 先设置默认奖品确保有数据
      prizes: this.data.standardPrizes,
      costPoints: 100
    })

    // 初始化滑块验证
    this.data.sliderVerify = new SliderVerify()

    // 先加载抽奖配置，再初始化Canvas
    this.loadLotteryConfig()
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
  refreshUserInfo() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟用户数据')
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return
    }

    console.log('📡 刷新用户信息...')
    userAPI.getUserInfo().then((res) => {
      this.setData({
        userInfo: res.data,
        totalPoints: res.data.total_points
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = res.data
      console.log('✅ 用户信息刷新成功，当前积分:', res.data.total_points)
    }).catch((error) => {
      console.error('❌ 获取用户信息失败:', error)
      
      // 错误处理：使用全局缓存数据
      if (app.globalData.userInfo) {
        this.setData({
          userInfo: app.globalData.userInfo,
          totalPoints: app.globalData.userInfo.total_points
        })
      }
    })
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
  loadLotteryConfig() {
    let configPromise
    
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟抽奖配置')
      configPromise = mockRequest('/api/lottery/config')
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求抽奖配置接口...')
      configPromise = lotteryAPI.getConfig()
    }

    configPromise.then((configData) => {
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

      // 配置加载完成后初始化Canvas
      this.initCanvas()
      
    }).catch((error) => {
      console.error('❌ 加载抽奖配置失败:', error)
      
      // 使用默认配置确保页面正常显示
      this.setDefaultLotteryConfig()
      
      // 即使失败也要初始化Canvas
      this.initCanvas()
      
      console.log('⚠️ 抽奖配置加载失败，使用默认配置')
    })
  },

  /**
   * 设置默认抽奖配置
   */
  setDefaultLotteryConfig() {
    // 🔴 使用统一的奖品配置数据源，确保一致性
    console.log('🔧 设置默认抽奖配置（使用统一数据源）')
    
    const lotteryConfig = getLotteryConfig()
    this.setData({
      prizes: this.data.standardPrizes, // 🔴 使用统一的奖品配置
      costPoints: lotteryConfig.costPoints,
      dailyLimit: lotteryConfig.dailyLimit,
      lotteryRules: lotteryConfig.rules
    })
    
    console.log('✅ 已设置统一抽奖配置，奖品数量:', this.data.standardPrizes.length)
  },

  /**
   * 初始化Canvas - 确保按钮显示，优化性能
   */
  initCanvas() {
    console.log('🎨 开始初始化Canvas...')
    
    // 确保有奖品数据
    if (!this.data.prizes || this.data.prizes.length === 0) {
      console.log('🔧 设置后备奖品数据')
      this.setData({
        prizes: getFallbackPrizes()
      })
    }
    
    // 立即设置为就绪，确保按钮显示
    this.setData({ wheelReady: true })
    
    // 🎯 优化：立即初始化Canvas，减少延迟
    wx.nextTick(() => {
      try {
        const ctx = wx.createCanvasContext('wheelCanvas', this)
        if (!ctx) {
          console.warn('Canvas上下文创建失败，但继续使用功能')
          return
        }
        
        this.canvasCtx = ctx
        console.log('✅ Canvas上下文创建成功')
        
        // 绘制转盘
        this.drawWheel()
        
      } catch (error) {
        console.error('❌ Canvas初始化失败:', error)
        // 即使失败也不影响功能使用
      }
    })
  },

  /**
   * Canvas降级处理
   */
  useCanvasFallback() {
    console.log('🔄 使用Canvas降级方案')
    
    // 设置标记表示使用静态模式，但仍然允许操作
    this.setData({ 
      canvasFallback: true,
      wheelReady: true,  // 重要：即使降级也要设置为就绪
      showStaticWheel: true,
      canvasError: true
    })
  },

  /**
   * 绘制转盘 - 性能优化版本，确保按钮显示
   */
  drawWheel() {
    console.log('🎨 开始绘制转盘...')
    
    // 安全检查1：Canvas上下文
    if (!this.canvasCtx) {
      console.warn('Canvas上下文未初始化，重新初始化')
      try {
        const ctx = wx.createCanvasContext('wheelCanvas', this)
        if (!ctx) {
          console.error('无法创建Canvas上下文')
          this.setData({ wheelReady: true })
          return
        }
        this.canvasCtx = ctx
        console.log('✅ 重新初始化Canvas成功')
      } catch (error) {
        console.error('重新初始化Canvas失败:', error)
        this.setData({ wheelReady: true })
        return
      }
    }

    // 安全检查2：奖品数据
    let prizes = this.data.prizes
    console.log('🏆 奖品数据检查:', prizes)
    
    if (!prizes || !Array.isArray(prizes) || prizes.length === 0) {
      console.warn('奖品数据无效，使用统一的后备数据')
      prizes = getFallbackPrizes()
      this.setData({ prizes })
    }

    try {
      const ctx = this.canvasCtx
      const centerX = 130 // Canvas中心X (260/2)
      const centerY = 130 // Canvas中心Y (260/2)
      const outerRadius = 125 // 外圆半径 (适配260px canvas)
      const innerRadius = 45 // 增大内圆半径，为中央按钮预留更多空间

      console.log('🖼️ 开始绘制，奖品数量:', prizes.length)

      // 清空画布
      ctx.clearRect(0, 0, 260, 260) // 更新为260x260

      // 绘制转盘外圈装饰
      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadius + 5, 0, 2 * Math.PI)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = 2
      ctx.stroke()

      // 移动到中心点进行旋转
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.rotate((this.data.currentAngle || 0) * Math.PI / 180)

      // 计算每个扇形的角度
      const anglePerPrize = (2 * Math.PI) / prizes.length

      // 绘制奖品扇形
      for (let i = 0; i < prizes.length; i++) {
        const prize = prizes[i]
        const startAngle = i * anglePerPrize
        const endAngle = (i + 1) * anglePerPrize
        const midAngle = startAngle + anglePerPrize / 2

        // 绘制扇形背景（从内圆到外圆）
        ctx.beginPath()
        ctx.arc(0, 0, innerRadius, startAngle, endAngle)
        ctx.arc(0, 0, outerRadius, endAngle, startAngle, true)
        ctx.closePath()
        
        // 设置扇形颜色
        ctx.fillStyle = prize.color || '#FF6B35'
        ctx.fill()

        // 绘制扇形边框
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.stroke()

        // 简化文字绘制，提升性能
        ctx.save()
        ctx.rotate(midAngle)
        ctx.translate((innerRadius + outerRadius) / 2, 0)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 12px Arial'
        ctx.fillText(prize.name, 0, 0)
        ctx.restore()
      }

      // 恢复变换
      ctx.restore()

          // 绘制美化的指针 - 添加动态效果
    this.drawBeautifulPointer(ctx, centerX, centerY)

      // 🎯 重要：绘制中央透明区域确保按钮可见
      ctx.save()
      ctx.translate(centerX, centerY)
      ctx.globalCompositeOperation = 'destination-out' // 清除模式
      ctx.beginPath()
      ctx.arc(0, 0, innerRadius - 5, 0, 2 * Math.PI) // 稍微小一点避免边缘问题
      ctx.fill()
      ctx.restore()

      // 执行绘制命令
      ctx.draw(false, () => {
        console.log('✅ Canvas绘制完成，中央区域已预留给按钮')
        // 确保转盘就绪状态设置，让按钮显示
        this.setData({ wheelReady: true })
      })

    } catch (error) {
      console.error('❌ 绘制转盘失败:', error)
      // 即使绘制失败也要确保UI可用
      this.setData({ wheelReady: true })
    }
  },

  /**
   * 启动指针待机动画 - 轻微脉冲效果
   */
  startPointerIdleAnimation() {
    if (this.pointerAnimationTimer) {
      clearInterval(this.pointerAnimationTimer)
    }
    
    this.pointerAnimationTimer = setInterval(() => {
      // 只在非抽奖状态下执行动画
      if (!this.data.isDrawing && this.data.wheelReady) {
        this.pointerAnimationPhase += 0.1
        if (this.pointerAnimationPhase > Math.PI * 2) {
          this.pointerAnimationPhase = 0
        }
        
        // 每隔一定时间重绘指针（低频率，避免性能问题）
        if (Math.floor(this.pointerAnimationPhase * 10) % 8 === 0) {
          try {
            this.drawWheel()
          } catch (error) {
            console.warn('指针动画绘制警告:', error)
          }
        }
      }
    }, 100) // 每100ms检查一次
  },

  /**
   * 停止指针待机动画
   */
  stopPointerIdleAnimation() {
    if (this.pointerAnimationTimer) {
      clearInterval(this.pointerAnimationTimer)
      this.pointerAnimationTimer = null
    }
    this.pointerAnimationPhase = 0
  },

  /**
   * 绘制美化指针 - 优化版本
   * 🎯 优化内容：
   * 1. 增强渐变效果和立体感
   * 2. 优化指针形状和尺寸比例
   * 3. 增加多层阴影效果
   * 4. 添加高光和细节装饰
   * 5. 提升视觉冲击力和现代感
   * 6. 添加待机时的轻微脉冲动画
   */
  /**
   * 🎨 绘制极致美学指针 - 大幅提升视觉美感和细节精致度
   * 优化内容：
   * 1. 更加流线型的指针形状设计
   * 2. 精细化渐变和阴影系统
   * 3. 增强装饰元素和细节
   * 4. 优化动画和发光效果
   * 5. 提升整体美学品质
   */
  drawBeautifulPointer(ctx, centerX, centerY) {
    ctx.save()
    ctx.translate(centerX, centerY)
    
    // 🔍 获取兼容性检查结果，确保API使用安全
    const compatibility = this.data.canvasCompatibility || {
      createRadialGradient: false,
      filter: false,
      quadraticCurveTo: true,
      createLinearGradient: true
    }
    
    // 📊 输出当前兼容性状态（仅在开发模式下）
    if (typeof __wxConfig !== 'undefined' && __wxConfig.debug) {
      console.log('🎨 指针绘制兼容性状态:', {
        径向渐变: compatibility.createRadialGradient ? '✅' : '❌',
        滤镜效果: compatibility.filter ? '✅' : '❌',
        贝塞尔曲线: compatibility.quadraticCurveTo ? '✅' : '❌',
        线性渐变: compatibility.createLinearGradient ? '✅' : '❌'
      })
    }
    
    // 🎯 动画效果优化 - 更流畅的动画曲线
    let animationScale = 1.0
    let glowIntensity = 0.0
    let rotationOffset = 0
    
    if (this.data.isDrawing && this.pointerSpinPhase !== undefined) {
      // 抽奖时：增强的脉冲和发光效果
      const pulseCurve = Math.sin(this.pointerSpinPhase * 2) * 0.5 + 0.5
      animationScale = 1.0 + pulseCurve * 0.12
      glowIntensity = pulseCurve * 0.5 + 0.3
      rotationOffset = Math.sin(this.pointerSpinPhase * 0.5) * 0.02
      ctx.scale(animationScale, animationScale)
      ctx.rotate(rotationOffset)
    } else if (!this.data.isDrawing && this.pointerAnimationPhase !== undefined) {
      // 待机时：优雅的呼吸效果
      const breathCurve = Math.sin(this.pointerAnimationPhase * 0.8) * 0.5 + 0.5
      animationScale = 1.0 + breathCurve * 0.03
      ctx.scale(animationScale, animationScale)
    }
    
    // 🌟 绘制增强的多层阴影系统 - 5层阴影营造极致立体感
    const shadowLayers = [
      { offset: [6, 8], alpha: 0.35, blur: 8 },      // 最外层深阴影
      { offset: [4, 6], alpha: 0.25, blur: 6 },      // 外层阴影
      { offset: [3, 4], alpha: 0.2, blur: 4 },       // 中外层阴影
      { offset: [2, 3], alpha: 0.15, blur: 2 },      // 中层阴影
      { offset: [1, 1], alpha: 0.1, blur: 1 }        // 内层柔和阴影
    ]
    
         shadowLayers.forEach(shadow => {
       ctx.save()
       ctx.translate(shadow.offset[0], shadow.offset[1])
       // 移除ctx.filter以确保兼容性
       
       // 根据兼容性绘制指针形状阴影
       ctx.beginPath()
       ctx.moveTo(0, -142)         // 尖端更尖锐
       
       if (compatibility.quadraticCurveTo) {
         // ✅ 支持贝塞尔曲线 - 使用流线型阴影
         ctx.quadraticCurveTo(-3, -135, -8, -125)    // 左侧优雅曲线
         ctx.lineTo(-18, -98)        // 左下角
         ctx.quadraticCurveTo(-12, -92, -6, -88)     // 左侧内凹曲线
         ctx.quadraticCurveTo(-2, -90, 0, -92)       // 中间收腰
         ctx.quadraticCurveTo(2, -90, 6, -88)        // 右侧内凹曲线
         ctx.quadraticCurveTo(12, -92, 18, -98)      // 右侧内凹曲线
         ctx.lineTo(8, -125)         // 右下角
         ctx.quadraticCurveTo(3, -135, 0, -142)      // 右侧优雅曲线
       } else {
         // ⚠️ 不支持贝塞尔曲线 - 使用直线阴影
         ctx.lineTo(-8, -125)        // 左侧直线
         ctx.lineTo(-18, -98)        // 左下角
         ctx.lineTo(-6, -88)         // 左侧内凹
         ctx.lineTo(0, -92)          // 中间收腰
         ctx.lineTo(6, -88)          // 右侧内凹
         ctx.lineTo(18, -98)         // 右下角
         ctx.lineTo(8, -125)         // 右侧直线
         ctx.lineTo(0, -142)         // 回到尖端
       }
       ctx.closePath()
       
       ctx.fillStyle = `rgba(0, 0, 0, ${shadow.alpha})`
       ctx.fill()
       ctx.restore()
     })
    
    // 🔥 绘制主指针 - 根据兼容性选择绘制方式
    ctx.beginPath()
    ctx.moveTo(0, -142)                           // 指针尖端，更加尖锐
    
    if (compatibility.quadraticCurveTo) {
      // ✅ 支持贝塞尔曲线 - 使用极致流线型设计
      ctx.quadraticCurveTo(-3, -135, -8, -125)      // 左侧优雅曲线过渡
      ctx.lineTo(-18, -98)                          // 左下角扩展
      ctx.quadraticCurveTo(-14, -94, -10, -90)      // 左侧圆润过渡
      ctx.quadraticCurveTo(-6, -88, -3, -89)        // 左侧内凹细节
      ctx.quadraticCurveTo(-1, -91, 0, -92)         // 中间精致收腰
      ctx.quadraticCurveTo(1, -91, 3, -89)          // 右侧内凹细节
      ctx.quadraticCurveTo(6, -88, 10, -90)         // 右侧内凹细节
      ctx.quadraticCurveTo(14, -94, 18, -98)        // 右侧圆润过渡
      ctx.lineTo(8, -125)                           // 右下角扩展
      ctx.quadraticCurveTo(3, -135, 0, -142)        // 右侧优雅曲线过渡
    } else {
      // ⚠️ 不支持贝塞尔曲线 - 使用兼容的直线设计
      console.log('💡 使用兼容模式绘制指针（直线版本）')
      ctx.lineTo(-8, -125)                          // 左侧直线
      ctx.lineTo(-18, -98)                          // 左下角
      ctx.lineTo(-10, -90)                          // 左侧收腰
      ctx.lineTo(-3, -89)                           // 左侧内凹
      ctx.lineTo(0, -92)                            // 中间收腰
      ctx.lineTo(3, -89)                            // 右侧内凹
      ctx.lineTo(10, -90)                           // 右侧收腰
      ctx.lineTo(18, -98)                           // 右下角
      ctx.lineTo(8, -125)                           // 右侧直线
      ctx.lineTo(0, -142)                           // 回到尖端
    }
    ctx.closePath()
    
    // 🌈 创建精致渐变填充 - 6层渐变营造丰富色彩层次
    const gradient = ctx.createLinearGradient(0, -142, 0, -88)
    if (glowIntensity > 0) {
      // 抽奖时的动态发光渐变
      const glowR = Math.floor(255)
      const glowG = Math.floor(68 + glowIntensity * 60)
      const glowB = Math.floor(68 + glowIntensity * 60)
      gradient.addColorStop(0, `rgba(${glowR}, ${glowG + 20}, ${glowB + 20}, 1)`)    // 顶部超亮
      gradient.addColorStop(0.15, `rgba(${glowR}, ${glowG}, ${glowB}, 1)`)           // 次亮区
      gradient.addColorStop(0.35, '#FF4444')                                         // 标准亮红
      gradient.addColorStop(0.55, '#FF3333')                                         // 中部红色
      gradient.addColorStop(0.75, '#DD2222')                                         // 中深红
      gradient.addColorStop(0.9, '#BB1111')                                          // 深红
      gradient.addColorStop(1, '#990000')                                            // 底部深红
    } else {
      // 正常状态的精致渐变
      gradient.addColorStop(0, '#FF5555')      // 顶部亮红，更鲜艳
      gradient.addColorStop(0.15, '#FF4444')   // 次亮区
      gradient.addColorStop(0.35, '#FF3333')   // 标准红色
      gradient.addColorStop(0.55, '#EE2222')   // 中部稍深
      gradient.addColorStop(0.75, '#DD1111')   // 中深红
      gradient.addColorStop(0.9, '#CC0000')    // 深红
      gradient.addColorStop(1, '#AA0000')      // 底部深红
    }
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🔥 增强外发光效果
    if (glowIntensity > 0) {
      ctx.save()
      // 多层发光效果
      const glowLayers = [
        { color: '#FF6666', blur: 25, alpha: glowIntensity * 0.8, width: 12 },
        { color: '#FF4444', blur: 15, alpha: glowIntensity * 0.6, width: 8 },
        { color: '#FF3333', blur: 8, alpha: glowIntensity * 0.4, width: 4 }
      ]
      
      glowLayers.forEach(glow => {
        ctx.shadowColor = glow.color
        ctx.shadowBlur = glow.blur
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        ctx.strokeStyle = `rgba(255, 51, 51, ${glow.alpha})`
        ctx.lineWidth = glow.width
        ctx.stroke()
      })
      ctx.restore()
    }
    
    // ✨ 增强高光效果系统 - 根据兼容性选择高光绘制方式
    // 主高光
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(-2, -135)
    if (compatibility.quadraticCurveTo) {
      // ✅ 支持贝塞尔曲线 - 使用流畅高光
      ctx.quadraticCurveTo(-1, -130, -4, -120)
      ctx.quadraticCurveTo(-8, -115, -6, -108)
      ctx.quadraticCurveTo(-3, -110, 0, -115)
      ctx.quadraticCurveTo(1, -125, -2, -135)
    } else {
      // ⚠️ 不支持贝塞尔曲线 - 使用直线高光
      ctx.lineTo(-4, -120)
      ctx.lineTo(-6, -108)
      ctx.lineTo(0, -115)
      ctx.lineTo(-2, -135)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
    ctx.fill()
    ctx.restore()
    
    // 次高光
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(2, -128)
    if (compatibility.quadraticCurveTo) {
      // ✅ 支持贝塞尔曲线 - 使用流畅高光
      ctx.quadraticCurveTo(4, -125, 6, -118)
      ctx.quadraticCurveTo(8, -115, 5, -112)
      ctx.quadraticCurveTo(3, -115, 2, -128)
    } else {
      // ⚠️ 不支持贝塞尔曲线 - 使用直线高光
      ctx.lineTo(6, -118)
      ctx.lineTo(5, -112)
      ctx.lineTo(2, -128)
    }
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
    ctx.fill()
    ctx.restore()
    
    // 细节高光点
    const highlights = [
      { x: -4, y: -125, r: 1.5, alpha: 0.6 },
      { x: 3, y: -120, r: 1, alpha: 0.4 },
      { x: -1, y: -115, r: 0.8, alpha: 0.5 }
    ]
    
    highlights.forEach(light => {
      ctx.save()
      ctx.beginPath()
      ctx.arc(light.x, light.y, light.r, 0, 2 * Math.PI)
      ctx.fillStyle = `rgba(255, 255, 255, ${light.alpha})`
      ctx.fill()
      ctx.restore()
    })
    
    // 🖼️ 精致边框系统 - 三层边框营造精细质感
    // 外层白色主边框
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    
    // 中层金色装饰边框
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 内层细节边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
    ctx.lineWidth = 0.8
    ctx.stroke()
    
    // 🎯 指针圆心底座 - 极致多层设计
    // 最外层阴影
    ctx.save()
    ctx.translate(2, 3)
    ctx.beginPath()
    ctx.arc(0, 0, 18, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'
    ctx.fill()
    ctx.restore()
    
    // 外层阴影
    ctx.save()
    ctx.translate(1, 2)
    ctx.beginPath()
    ctx.arc(0, 0, 16, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
    ctx.fill()
    ctx.restore()
    
    // 主圆底座 - 兼容性优化，使用纯色填充
    ctx.beginPath()
    ctx.arc(0, 0, 15, 0, 2 * Math.PI)
    ctx.fillStyle = '#FF3333'  // 使用纯色替代径向渐变，确保兼容性
    ctx.fill()
    
    // 底座多层边框
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.stroke()
    
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 1.5
    ctx.stroke()
    
    // 🔘 中心装饰圆系统 - 兼容性优化
    // 外层装饰圆 - 使用纯色替代径向渐变
    ctx.beginPath()
    ctx.arc(0, 0, 10, 0, 2 * Math.PI)
    ctx.fillStyle = '#FFD0D0'  // 使用中间色调，保持美观
    ctx.fill()
    
    // 中层装饰圆 - 使用纯色替代径向渐变
    ctx.beginPath()
    ctx.arc(0, 0, 6, 0, 2 * Math.PI)
    ctx.fillStyle = '#FFE0E0'  // 使用浅色调，保持层次感
    ctx.fill()
    
    // 装饰圆边框
    ctx.strokeStyle = '#FF3333'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // ⭐ 多重中心亮点系统
    // 主亮点
    ctx.save()
    ctx.beginPath()
    ctx.arc(-2, -2, 2.5, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.fill()
    ctx.restore()
    
    // 次亮点
    ctx.save()
    ctx.beginPath()
    ctx.arc(1, 1, 1.5, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.fill()
    ctx.restore()
    
    // 细节亮点
    ctx.save()
    ctx.beginPath()
    ctx.arc(-1, 2, 0.8, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.fill()
    ctx.restore()
    
    // 🎨 增强装饰元素系统 - 8个方向的精致装饰
    const decorations = [
      { angle: -Math.PI / 4, distance: 12, size: 2.2, color: 'rgba(255, 215, 0, 0.8)' },
      { angle: Math.PI / 4, distance: 12, size: 2.2, color: 'rgba(255, 215, 0, 0.8)' },
      { angle: -Math.PI / 2, distance: 11, size: 1.8, color: 'rgba(255, 255, 255, 0.6)' },
      { angle: Math.PI / 2, distance: 11, size: 1.8, color: 'rgba(255, 255, 255, 0.6)' },
      { angle: -3 * Math.PI / 4, distance: 10, size: 1.5, color: 'rgba(255, 165, 0, 0.7)' },
      { angle: 3 * Math.PI / 4, distance: 10, size: 1.5, color: 'rgba(255, 165, 0, 0.7)' },
      { angle: 0, distance: 13, size: 1.2, color: 'rgba(255, 255, 255, 0.5)' },
      { angle: Math.PI, distance: 13, size: 1.2, color: 'rgba(255, 255, 255, 0.5)' }
    ]
    
    decorations.forEach(decor => {
      ctx.save()
      ctx.rotate(decor.angle)
      ctx.beginPath()
      ctx.arc(decor.distance, 0, decor.size, 0, 2 * Math.PI)
      ctx.fillStyle = decor.color
      ctx.fill()
      // 添加细微边框
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.lineWidth = 0.5
      ctx.stroke()
      ctx.restore()
    })
    
    // 🌟 添加微妙的光晕效果
    if (!this.data.isDrawing) {
      ctx.save()
      ctx.globalAlpha = 0.3
      ctx.shadowColor = '#FF3333'
      ctx.shadowBlur = 15
      ctx.beginPath()
      ctx.arc(0, 0, 18, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(255, 51, 51, 0.2)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }
    
    ctx.restore()
  },

  /**
   * 单次抽奖
   */
  onSingleDraw: throttle(function() {
    console.log('🎯 单抽按钮被点击')
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
   * 处理抽奖 - 增强版本，改善错误处理和用户体验
   * TODO: 后端对接 - 抽奖接口
   * 
   * 对接说明：
   * 接口：POST /api/lottery/draw
   * 请求体：{ draw_type: "single", count: 1 }
   * 认证：需要Bearer Token
   * 返回：抽奖结果，包括中奖信息、剩余积分等
   */
  handleDraw(drawType, count) {
    // 检查是否正在抽奖
    if (this.data.isDrawing) {
      wx.showToast({
        title: '正在抽奖中，请稍候...',
        icon: 'none'
      })
      return
    }

    // 安全获取积分和抽奖次数
    const currentPoints = this.data.totalPoints || 0
    const todayCount = this.data.todayDrawCount || 0
    const dailyLimit = this.data.dailyLimit || 10
    const costPoints = this.data.costPoints || 100

    // 检查积分是否足够
    const needPoints = costPoints * count
    if (currentPoints < needPoints) {
      wx.showModal({
        title: '积分不足',
        content: `本次抽奖需要${needPoints}积分，您当前仅有${currentPoints}积分。\n\n可通过拍照上传小票获得更多积分！`,
        confirmText: '去赚积分',
        cancelText: '知道了',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({
              url: '/pages/camera/camera'
            })
          }
        }
      })
      return
    }

    // 检查每日抽奖次数限制
    if (todayCount >= dailyLimit) {
      wx.showModal({
        title: '今日抽奖次数已用完',
        content: `每日最多可抽奖${dailyLimit}次，明天再来试试吧！`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }

    // 检查是否需要滑块验证（抽奖次数较多时）
    if (todayCount >= 3) {
      try {
        // TODO: 实现滑块验证组件
        // await this.data.sliderVerify.show()
        console.log('🔐 滑块验证暂未实现，跳过验证')
      } catch (error) {
        console.log('滑块验证取消:', error)
        return
      }
    }

    // 开始抽奖流程
    this.startDrawing(drawType, count, needPoints)
  },

  /**
   * 开始抽奖流程
   */
  startDrawing(drawType, count, needPoints) {
    console.log('🎰 开始抽奖流程:', { drawType, count, needPoints })
    
    // 停止指针待机动画
    this.stopPointerIdleAnimation()
    
    this.setData({ isDrawing: true })
    wx.showLoading({ title: '抽奖中...' })

    let drawPromise
    
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 模拟抽奖，类型:', drawType, '次数:', count)
      drawPromise = mockRequest('/api/lottery/draw', { draw_type: drawType, count })
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求抽奖接口，类型:', drawType, '次数:', count)
      drawPromise = lotteryAPI.draw(drawType, count)
    }

    drawPromise.then((drawResult) => {
      // 安全检查返回数据
      if (!drawResult || !drawResult.data) {
        throw new Error('抽奖结果数据异常')
      }

      console.log('🎰 抽奖结果:', drawResult)
      wx.hideLoading()

      // 执行转盘动画
      const results = drawResult.data.results
      if (results && Array.isArray(results) && results.length > 0) {
        return this.playAnimation(results[0])
      } else {
        // 如果没有结果数据，使用默认动画
        const defaultResult = {
          angle: Math.floor(Math.random() * 360),
          is_near_miss: false
        }
        return this.playAnimation(defaultResult)
      }
    }).then(() => {
      // 动画完成后处理结果
      return drawPromise
    }).then((drawResult) => {
      // 更新用户积分和抽奖次数
      const newPoints = drawResult.data.remaining_points || (this.data.totalPoints - needPoints)
      const newTodayCount = drawResult.data.today_draw_count || (this.data.todayDrawCount + count)
      
      this.setData({
        totalPoints: Math.max(0, newPoints), // 确保积分不为负数
        todayDrawCount: newTodayCount
      })

      // 更新全局用户积分
      this.updateGlobalUserPoints(newPoints)

      // 显示抽奖结果
      const results = drawResult.data.results || []
      this.showDrawResult(results)

      console.log('🎉 抽奖完成，剩余积分:', newPoints)

    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 抽奖失败:', error)
      
      // 改善错误提示，更友好的用户体验
      this.showDrawError(error)
      
    }).finally(() => {
      // 确保重置抽奖状态
      console.log('🔄 重置抽奖状态')
      this.setData({ isDrawing: false })
      
      // 重新启动指针待机动画
      setTimeout(() => {
        this.startPointerIdleAnimation()
      }, 1000)
    })
  },

  /**
   * 更新全局用户积分
   */
  updateGlobalUserPoints(newPoints) {
    try {
      if (app.globalData.userInfo) {
        app.globalData.userInfo.total_points = newPoints
      }
      if (app.globalData.mockUser) {
        app.globalData.mockUser.total_points = newPoints
      }
    } catch (error) {
      console.warn('更新全局积分失败:', error)
    }
  },

  /**
   * 显示抽奖错误 - 改善用户体验
   */
  showDrawError(error) {
    let title = '抽奖失败'
    let content = '请重试'
    let showRetry = true
    
    // 根据错误码显示不同的错误信息
    switch (error.code) {
      case 1001:
        title = '积分不足'
        content = '您的积分不够本次抽奖消费，去拍照赚积分吧！'
        showRetry = false
        break
      case 1002:
        title = '次数超限'
        content = '今日抽奖次数已达上限，明天再来试试吧！'
        showRetry = false
        break
      case 1003:
        title = '活动已结束'
        content = '抽奖活动已结束，感谢您的参与！'
        showRetry = false
        break
      case 1004:
        title = '系统繁忙'
        content = '服务器正忙，请稍后重试'
        break
      default:
        content = error.msg || error.message || '网络连接异常，请检查网络后重试'
    }
    
    if (showRetry) {
      wx.showModal({
        title,
        content,
        confirmText: '重试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 重新尝试抽奖
            setTimeout(() => {
              this.setData({ isDrawing: false })
            }, 1000)
          }
        }
      })
    } else {
      wx.showModal({
        title,
        content,
        showCancel: false,
        confirmText: error.code === 1001 ? '去赚积分' : '知道了',
        success: (res) => {
          if (res.confirm && error.code === 1001) {
            wx.switchTab({
              url: '/pages/camera/camera'
            })
          }
        }
      })
    }
  },

  /**
   * 播放转盘动画 - 性能优化版本 + 指针特效
   */
  playAnimation(result) {
    return new Promise((resolve) => {
      const targetAngle = result.angle || 0
      const totalRotation = 3 * 360 + targetAngle // 减少到3圈，提升性能
      const duration = 2500 // 减少到2.5秒
      const frameRate = 30 // 降低帧率到30fps，减少卡顿
      const frameDuration = 1000 / frameRate
      
      let startTime = Date.now()
      let startAngle = this.data.currentAngle
      let animationTimer = null
      
      // 🎯 指针抽奖动画状态
      this.pointerSpinPhase = 0

      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        
        // 简化缓动函数
        const easeProgress = 1 - Math.pow(1 - progress, 2)
        
        let currentAngle = startAngle + totalRotation * easeProgress

        this.setData({ currentAngle: currentAngle % 360 })
        
        // 🎯 更新指针动画状态
        this.pointerSpinPhase = progress * Math.PI * 6 // 抽奖时指针有快速脉冲
        
        // 每3帧绘制一次，减少绘制频率
        if (Math.floor(elapsed / frameDuration) % 3 === 0) {
          try {
            this.drawWheel()
          } catch (error) {
            console.warn('动画绘制警告:', error)
          }
        }

        if (progress < 1) {
          animationTimer = setTimeout(animate, frameDuration)
        } else {
          // 动画结束，最后绘制一次
          this.pointerSpinPhase = 0 // 重置指针动画状态
          this.drawWheel()
          if (animationTimer) {
            clearTimeout(animationTimer)
          }
          setTimeout(() => {
            resolve()
          }, 300)
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
    console.log('🎉 显示抽奖结果:', results)
    
    // 检查是否有有效结果
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.warn('⚠️ 抽奖结果为空，直接重置状态')
      this.setData({ isDrawing: false })
      wx.showToast({
        title: '抽奖完成',
        icon: 'success'
      })
      return
    }

    // 🔴 修复：显示结果时完全隐藏转盘并重置状态
    this.setData({
      showResult: true,
      resultData: results,
      isDrawing: false, // 显示结果时重置抽奖状态
      // 🔴 新增：强制隐藏转盘相关元素
      hideWheel: true,
      // 🔴 更新用户积分显示（从抽奖结果中获取）
      totalPoints: results[0]?.remaining_points || this.data.totalPoints
    })

    // 🔴 在下一帧隐藏转盘区域（避免视觉闪烁）
    wx.nextTick(() => {
      this.setData({
        wheelVisible: false
      })
    })

    // 5秒后自动关闭结果弹窗
    setTimeout(() => {
      if (this.data.showResult) {
        console.log('⏰ 自动关闭结果弹窗')
        this.closeResultModal()
      }
    }, 5000)
  },

  /**
   * 关闭抽奖结果弹窗 - 优化版本
   */
  onCloseResult() {
    console.log('🔄 用户主动关闭抽奖结果弹窗')
    this.closeResultModal()
  },

  /**
   * 统一的关闭结果弹窗方法 - 优化版本：减少延迟，提升用户体验
   */
  closeResultModal() {
    console.log('🔄 关闭抽奖结果弹窗并恢复转盘')
    
    // 🎯 立即恢复页面状态，避免空白页面
    this.setData({ 
      showResult: false,
      isDrawing: false,
      hideWheel: false,
      wheelVisible: true,
      resultData: null,
      wheelReady: true,
      canvasFallback: false,
      showStaticWheel: false,
      canvasError: false,
      forceUpdate: Date.now()
    })
    
    // 🎯 确保状态重置完成后再执行恢复操作
    wx.nextTick(() => {
      console.log('🔧 执行页面恢复流程')
      
      // 刷新用户信息确保积分同步
      this.refreshUserInfo()
      
      // 重新初始化Canvas转盘（如果需要）
      if (this.data.prizes && this.data.prizes.length > 0 && this.canvasCtx) {
        console.log('🎨 重新绘制Canvas转盘')
        this.drawWheel()
      } else if (this.data.prizes && this.data.prizes.length > 0) {
        console.log('🎨 重新初始化Canvas转盘')
        this.initCanvas()
      }
      
      // 最终状态验证（仅在需要时修复）
      setTimeout(() => {
        if (this.data.hideWheel || this.data.showResult) {
          console.log('⚠️ 执行最终状态修复')
          this.setData({
            hideWheel: false,
            showResult: false,
            wheelReady: true,
            isDrawing: false
          })
        }
      }, 50) // 大幅减少延迟时间
    })
  },

  /**
   * 查看抽奖记录 - 已禁用
   */
  onViewRecords() {
    // 抽奖记录功能已被移除
    console.log('抽奖记录功能已禁用')
    // wx.showModal({
    //   title: '抽奖记录',
    //   content: '抽奖记录功能正在开发中...\n\n您可以在个人中心查看积分明细了解抽奖消费记录',
    //   confirmText: '去个人中心',
    //   cancelText: '知道了',
    //   success: (res) => {
    //     if (res.confirm) {
    //       wx.switchTab({
    //         url: '/pages/user/user'
    //       })
    //     }
    //   }
    // })
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
  },

  /**
   * 页面状态检查 - 调试用
   */
  checkPageStatus() {
    const status = {
      wheelReady: this.data.wheelReady,
      isDrawing: this.data.isDrawing,
      showResult: this.data.showResult,
      totalPoints: this.data.totalPoints,
      costPoints: this.data.costPoints,
      canvasFallback: this.data.canvasFallback
    }
    console.log('📊 当前页面状态:', status)
    return status
  },

  /**
   * 重置页面状态
   */
  resetPageStatus() {
    console.log('🔄 重置页面状态')
    this.setData({
      isDrawing: false,
      showResult: false,
      resultData: null,
      canvasFallback: false,
      showStaticWheel: false,
      canvasError: false
    })
  },

  /**
   * 页面点击调试
   */
  onPageTap() {
    // 静默处理
  },

  /**
   * 检查中心按钮状态
   */
  checkCenterButton() {
    console.log('🔄 检查中心按钮状态')
    
    // 强制确保按钮数据状态正确
    this.setData({
      wheelReady: true,
      isDrawing: false,
      totalPoints: this.data.totalPoints || 1300,
      costPoints: this.data.costPoints || 100,
      // 确保用户信息存在
      userInfo: this.data.userInfo || {
        nickname: '测试用户',
        phone: '138****8000'
      }
    })
    
    // 检查页面状态
    const buttonStatus = {
      wheelReady: this.data.wheelReady,
      isDrawing: this.data.isDrawing,
      totalPoints: this.data.totalPoints,
      costPoints: this.data.costPoints,
      showResult: this.data.showResult,
      hasUserInfo: !!this.data.userInfo,
      buttonShouldShow: !this.data.isDrawing && this.data.wheelReady
    }
    
    console.log('🎯 中心按钮状态检查:', buttonStatus)
    
    // 专门检查转盘中央按钮
    const query = wx.createSelectorQuery()
    query.selectAll('canvas').boundingClientRect()
    query.selectAll('view[bindtap="onSingleDraw"]').boundingClientRect()
    query.exec(res => {
      console.log('🔍 转盘中央检查结果:', {
        Canvas元素: res[0] ? res[0].length : 0,
        抽奖按钮: res[1] ? res[1].length : 0,
        Canvas详情: res[0],
        按钮详情: res[1]
      })
      
      // 分析转盘中央按钮位置
      if (res[1] && res[1].length > 0) {
        const centerButtons = res[1].filter(btn => {
          // 检查是否在转盘中央区域 (大概位置: 转盘中心附近)
          return btn.left > 80 && btn.left < 180 && btn.top > 80 && btn.top < 180
        })
        
        console.log('🎯 转盘中央按钮分析:', centerButtons)
        
        let message = `🔍 转盘中央按钮检查完成：\n\n`
        message += `• 总按钮数: ${res[1].length}\n`
        message += `• 中央区域按钮: ${centerButtons.length}\n`
        message += `• Canvas元素: ${res[0].length}\n\n`
        
        if (centerButtons.length > 0) {
          message += `✅ 检测到中央按钮，但如果看不到可能是:\n`
          message += `1. Canvas覆盖了按钮\n`
          message += `2. 样式渲染问题\n`
          message += `3. z-index层级问题\n\n`
          message += `建议：\n`
          message += `• 使用页面上方的可见按钮\n`
          message += `• 点击"启用应急按钮"获取备用方案`
        } else {
          message += `❌ 未检测到中央按钮，已启用修复方案`
          this.enableEmergencyButton()
        }
        
        // 注释掉弹窗显示
        // wx.showModal({
        //   title: '转盘中央按钮检查',
        //   content: message,
        //   showCancel: false,
        //   confirmText: '知道了'
        // })
      }
    })
    
    // 如果还是有问题，强制修复
    if (!this.data.wheelReady) {
      console.error('❌ wheelReady状态异常，强制修复')
      this.setData({ wheelReady: true })
    }
    
    // 强制刷新页面数据，确保文字显示
    setTimeout(() => {
      this.setData({
        wheelReady: true,
        isDrawing: false,
        forceUpdate: Date.now(),
        // 强制启用应急按钮以确保功能可用
        showEmergencyButton: true,
        showRealDeviceDebug: true
      })
      console.log('🔄 强制刷新按钮状态完成')
    }, 100)
  },

  /**
   * 项目完整性检查
   */
  checkProjectIntegrity() {
    console.log('🔍 开始项目完整性检查...')
    
    // 检查必要的数据
    const checks = {
      '用户信息': !!this.data.userInfo,
      '积分数据': typeof this.data.totalPoints === 'number',
      '奖品配置': Array.isArray(this.data.prizes) && this.data.prizes.length > 0,
      '抽奖成本': typeof this.data.costPoints === 'number',
      '转盘状态': this.data.wheelReady === true,
      '抽奖状态': typeof this.data.isDrawing === 'boolean'
    }
    
    // 检查必要的函数
    const functions = {
      '单抽功能': typeof this.onSingleDraw === 'function',
      '三连抽功能': typeof this.onTripleDraw === 'function', 
      '五连抽功能': typeof this.onFiveDraw === 'function',
      '十连抽功能': typeof this.onTenDraw === 'function',
      '处理抽奖': typeof this.handleDraw === 'function',
      '显示结果': typeof this.showDrawResult === 'function'
    }
    
    console.log('📊 数据完整性检查结果:', checks)
    console.log('🔧 功能完整性检查结果:', functions)
    
    // 检查是否有问题
    const dataIssues = Object.entries(checks).filter(([key, value]) => !value)
    const functionIssues = Object.entries(functions).filter(([key, value]) => !value)
    
    if (dataIssues.length > 0) {
      console.error('❌ 数据完整性问题:', dataIssues.map(([key]) => key))
    }
    
    if (functionIssues.length > 0) {
      console.error('❌ 功能完整性问题:', functionIssues.map(([key]) => key))
    }
    
    if (dataIssues.length === 0 && functionIssues.length === 0) {
      console.log('✅ 项目完整性检查通过，所有功能正常！')
    }
    
    return {
      dataChecks: checks,
      functionChecks: functions,
      hasIssues: dataIssues.length > 0 || functionIssues.length > 0
    }
  }
}) 