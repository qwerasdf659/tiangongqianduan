// pages/lottery/lottery.js - 抽奖页面逻辑
const app = getApp()
const { lotteryAPI, userAPI } = require('../../utils/api')
const { SliderVerify, throttle } = require('../../utils/validate')
const { getTechnicalConfig } = require('./lottery-config')
const { loadingManager } = require('../../utils/loading-manager')

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
    
    // 🔴 抽奖配置 - 必须从后端获取
    prizes: [],
    costPoints: 0,
    dailyLimit: 0,
    
    // 🔴 抽奖规则 - 从后端配置获取
    lotteryRules: {
      guaranteeRule: '',
      consumptionRule: '',
      securityRule: '',
      dailyLimitRule: ''
    },
    
    // 转盘状态
    isDrawing: false,
    currentAngle: 0,
    wheelReady: false,  // 默认false，等待后端数据加载
    
    // 抽奖结果
    showResult: false,
    resultData: null,
    
    // 统计信息
    todayDrawCount: 0,
    
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
    
    // 真机调试相关
    isButtonVisible: false, // 默认隐藏，等待数据加载完成
    forceUpdate: 0,
    
    // 🔴 后端服务状态
    backendConnected: false,
    loadingConfig: true,
    
    // 🔴 技术配置（仅用于Canvas绘制）
    technicalConfig: getTechnicalConfig(),
  },

  onLoad() {
    console.log('抽奖页面加载')
    
    // 🔍 首先进行Canvas兼容性检查
    console.log('🔧 开始Canvas兼容性检查...')
    try {
      const compatibility = quickCompatibilityCheck()
      this.safeSetData({ canvasCompatibility: compatibility })
      
      // 根据兼容性结果调整绘制策略
      if (!compatibility.createRadialGradient || !compatibility.filter) {
        console.log('⚠️ 检测到兼容性问题，已自动启用兼容模式')
      } else {
        console.log('✅ Canvas兼容性检查通过，可以使用高级特性')
      }
    } catch (error) {
      console.error('❌ 兼容性检查失败:', error)
      // 设置保守的兼容性配置
      this.safeSetData({
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
    
    // 🚀 科技感粒子系统初始化
    this.particleSystem = {
      particles: [], // 粒子数组
      maxParticles: 8, // 最大粒子数量
      particleSpeed: 0.02, // 粒子运动速度
      lastParticleTime: 0 // 上次生成粒子的时间
    }
    
    // 🎯 3D立体效果配置
    this.pointer3DConfig = {
      depth: 6, // 指针厚度
      shadowIntensity: 0.4, // 阴影强度
      lightAngle: -Math.PI / 4 // 光照角度
    }
  },

  onShow() {
    console.log('抽奖页面显示')
    this.refreshUserInfo()
    
    // 重新加载配置，确保数据最新
    this.loadLotteryConfig()
  },

  onHide() {
    console.log('抽奖页面隐藏')
    this.stopPointerIdleAnimation()
  },

  onUnload() {
    console.log('抽奖页面卸载')
    this.stopPointerIdleAnimation()
  },

  onReady() {
    console.log('抽奖页面就绪')
    
    // 页面准备就绪后初始化Canvas
    setTimeout(() => {
      this.initCanvas()
    }, 100)
  },

  // 🔴 页面初始化 - 优先加载后端配置
  initPage() {
    console.log('🔧 开始初始化页面...')
    
    // 显示加载状态
    this.safeSetData({ 
      loadingConfig: true,
      backendConnected: false,
      wheelReady: false,
      isButtonVisible: false
    })
    
    // 优先加载用户信息和抽奖配置
    Promise.all([
      this.refreshUserInfo(),
      this.loadLotteryConfig()
    ]).then(() => {
      console.log('✅ 页面初始化完成')
      
      // 数据加载完成后启用界面
      this.safeSetData({
        loadingConfig: false,
        backendConnected: true,
        wheelReady: true,
        isButtonVisible: true,
        forceUpdate: Date.now()
      })
      
      // 初始化Canvas（延迟确保数据已加载）
      setTimeout(() => {
        this.initCanvas()
      }, 300)
      
    }).catch(error => {
      console.error('❌ 页面初始化失败:', error)
      this.handleBackendError(error)
    })
  },

  /**
   * 🔴 刷新用户信息 - 必须从后端获取
   */
  refreshUserInfo() {
    return new Promise((resolve, reject) => {
      userAPI.getUserInfo().then(result => {
        console.log('✅ 用户信息获取成功:', result)
        
        // 🔧 增强数据安全验证 - 处理后端返回null或错误数据的情况
        if (!result || result.code !== 0) {
          throw new Error(`后端API返回错误: code=${result?.code}, msg=${result?.msg}`)
        }
        
        const userInfo = result.data
        
        // 🔧 严格验证数据完整性
        if (!userInfo || typeof userInfo !== 'object') {
          throw new Error('后端返回的用户数据为空或格式不正确')
        }
        
        // 🔧 修复undefined问题：确保totalPoints总是有有效值
        const totalPoints = (userInfo.total_points !== undefined && userInfo.total_points !== null && typeof userInfo.total_points === 'number') 
          ? userInfo.total_points 
          : 0
        
        console.log('💰 数据验证结果:', { 
          originalPoints: userInfo.total_points,
          validatedPoints: totalPoints,
          userInfoValid: !!userInfo
        })
        
        this.safeSetData({
          userInfo: {
            nickname: userInfo.nickname || '用户',
            phone: userInfo.mobile || '',
            avatar: userInfo.avatar || '/images/default-avatar.png'
          },
          totalPoints: totalPoints  // 确保不会是undefined
        })
        
        console.log('💰 积分数据更新:', { totalPoints, original: userInfo.total_points })
        
        // 更新全局用户信息
        app.globalData.userInfo = {
          ...app.globalData.userInfo,
          ...userInfo,
          total_points: totalPoints  // 确保全局数据也是安全的
        }
        
        resolve(userInfo)
        
      }).catch(error => {
        console.error('❌ 获取用户信息失败:', error)
        
        // 🔧 修复：API失败时确保字段不为undefined
        this.safeSetData({
          totalPoints: 0,  // 设置默认值，避免undefined
          userInfo: {
            nickname: '加载失败',
            phone: '请重试',
            avatar: '/images/default-avatar.png'
          }
        })
        
        // 🚨 显示详细错误信息，帮助开发调试
        wx.showModal({
          title: '🚨 数据加载失败',
          content: `用户信息获取失败！\n\n可能原因：\n1. 用户未登录或令牌过期\n2. 后端API服务异常\n3. 网络连接问题\n\n错误详情：${error.message || error.msg || '未知错误'}`,
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '重新登录',
          confirmColor: '#FF6B35',
          success: (res) => {
            if (res.confirm) {
              // 跳转到登录页面
              wx.navigateTo({
                url: '/pages/auth/auth'
              })
            }
          }
        })
        
        // 🚨 已删除：开发环境Mock数据 - 违反项目安全规则
        // ✅ 必须使用真实后端API获取用户信息
        reject(error)
      })
    })
  },

  /**
   * 🔴 加载抽奖配置 - 严禁前端硬编码，必须从后端获取
   * 根据产品文档：8区域转盘，奖品配置可由商家调整
   */
  loadLotteryConfig() {
    return new Promise((resolve, reject) => {
      console.log('🎰 开始加载抽奖配置...')
      
      lotteryAPI.getConfig().then(result => {
        console.log('✅ 抽奖配置获取成功:', result)
        
        // 🔧 增强数据安全验证 - 处理后端返回null或错误数据的情况
        if (!result || result.code !== 0) {
          throw new Error(`后端API返回错误: code=${result?.code}, msg=${result?.msg}`)
        }
        
        const config = result.data
        
        // 🔧 严格验证数据完整性
        if (!config || typeof config !== 'object') {
          throw new Error('后端返回的抽奖配置数据为空或格式不正确')
        }
        
        // 🔴 验证后端数据完整性
        if (!config.prizes || !Array.isArray(config.prizes) || config.prizes.length !== 8) {
          throw new Error('❌ 后端返回的奖品配置不符合8区域转盘要求')
        }
        
        // 🔧 修复undefined问题：确保todayDrawCount总是有有效值
        const todayDrawCount = (config.today_draw_count !== undefined && config.today_draw_count !== null && typeof config.today_draw_count === 'number') 
          ? config.today_draw_count 
          : 0
        
        console.log('🎯 配置数据验证结果:', { 
          originalCount: config.today_draw_count,
          validatedCount: todayDrawCount,
          prizesCount: config.prizes?.length,
          configValid: !!config
        })
        
        // 🔴 设置抽奖配置（严格按照产品文档）
        this.safeSetData({
          prizes: config.prizes.map((prize, index) => ({
            ...prize,
            angle: index * 45, // 8区域转盘，每个区域45度
            color: getTechnicalConfig().fallbackColors[index % 8] // 🔧 修复：直接调用导入函数
          })),
          costPoints: config.cost_points || 100,        // 抽奖消耗积分
          dailyLimit: config.daily_limit || 50,         // 每日限制次数
          isActive: config.is_active || true,           // 抽奖系统状态
          maintenanceInfo: config.maintenance_info || null, // 维护信息
          todayDrawCount: todayDrawCount,               // 🔧 修复：确保不会是undefined
          
          // 🔴 抽奖规则配置 - 从后端动态获取（符合项目安全规则）
          lotteryRules: {
            guaranteeRule: config.lottery_rules?.guarantee_rule || '十连抽保底获得好礼',
            consumptionRule: config.lottery_rules?.consumption_rule || '特殊奖品需要满足消费条件',
            securityRule: config.lottery_rules?.security_rule || '高频操作将触发安全验证',
            dailyLimitRule: config.lottery_rules?.daily_limit_rule || `单日积分消耗上限${(config.daily_limit || 50) * (config.cost_points || 100)}分`
          }
        })
        
        console.log('🎯 抽奖数据更新:', { todayDrawCount, original: config.today_draw_count })
        
        console.log('🎯 转盘配置已加载:', {
          prizesCount: config.prizes.length,
          costPoints: config.cost_points,
          isActive: config.is_active
        })
        
        resolve(config)
        
      }).catch(error => {
        console.error('❌ 获取抽奖配置失败:', error)
        
        // 🔧 修复：API失败时确保字段不为undefined
        this.safeSetData({
          todayDrawCount: 0,  // 设置默认值，避免undefined
          costPoints: 100,    // 设置默认积分消耗
          dailyLimit: 50,     // 设置默认每日限制
          prizes: [],         // 空奖品列表
          lotteryRules: {
            guaranteeRule: '配置加载失败，请重试',
            consumptionRule: '',
            securityRule: '',
            dailyLimitRule: ''
          }
        })
        
        // 🚨 显示详细错误信息，帮助开发调试
        wx.showModal({
          title: '🚨 抽奖配置加载失败',
          content: `无法获取抽奖配置！\n\n可能原因：\n1. 用户未登录或令牌过期\n2. 后端lottery服务异常\n3. 数据库连接问题\n\n错误详情：${error.message || error.msg || '未知错误'}\n\n请检查后端服务状态！`,
          showCancel: true,
          cancelText: '重新登录',
          confirmText: '立即重试',
          confirmColor: '#FF6B35',
          success: (res) => {
            if (res.confirm) {
              // 重新加载配置
              this.loadLotteryConfig()
            } else {
              // 跳转到登录页面
              wx.navigateTo({
                url: '/pages/auth/auth'
              })
            }
          }
        })
        
        // 🚨 后端服务异常 - 严禁使用前端备用数据
        reject(error)
      })
    })
  },

  /**
   * 🚨 后端错误处理 - 严格按照安全规则
   */
  handleBackendError(error) {
    console.error('🚨 后端服务异常:', error)
    
    this.safeSetData({
      loadingConfig: false,
      backendConnected: false,
      wheelReady: false,
      isButtonVisible: false
    })
    
    // 🚨 显示后端服务异常提示 - 严禁使用Mock数据
    wx.showModal({
      title: '🚨 后端服务异常',
      content: '无法获取抽奖配置！\n\n🔧 请检查：\n1. 后端API服务是否启动\n2. 网络连接是否正常\n3. 服务器是否维护中\n\n⚠️ 系统将无法正常运行！',
      showCancel: true,
      cancelText: '稍后重试',
      confirmText: '立即重试',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          // 重新初始化
          this.initPage()
        } else {
          // 跳转到用户中心
          wx.switchTab({
            url: '/pages/user/user'
          })
        }
      }
    })
  },

  /**
   * 🎨 初始化Canvas转盘绘制
   */
  initCanvas() {
    console.log('🎨 开始初始化Canvas转盘...')
    
    // 检查数据是否已加载
    if (!this.data.prizes || this.data.prizes.length !== 8) {
      console.warn('⚠️ 抽奖配置未加载完成，延迟初始化Canvas')
      setTimeout(() => {
        this.initCanvas()
      }, 500)
      return
    }
    
    try {
      // 获取Canvas上下文
      const ctx = wx.createCanvasContext('wheelCanvas', this)
      
      if (!ctx) {
        console.error('❌ Canvas上下文创建失败')
        this.useCanvasFallback()
        return
      }
      
      // 绘制8区域转盘
      this.drawWheel()
      
      console.log('✅ Canvas转盘初始化完成')
      
    } catch (error) {
      console.error('❌ Canvas初始化失败:', error)
      this.useCanvasFallback()
    }
  },

  /**
   * Canvas降级处理
   */
  useCanvasFallback() {
    console.log('🔄 启用Canvas降级方案')
    this.safeSetData({
      canvasFallback: true,
      showStaticWheel: true,
      canvasError: true
    })
  },

  /**
   * 🎨 绘制8区域转盘 - 严格按照产品文档要求
   */
  drawWheel() {
    const ctx = wx.createCanvasContext('wheelCanvas', this)
    const { prizes, canvasCompatibility, technicalConfig } = this.data
    
    if (!prizes || prizes.length !== 8) {
      console.error('❌ 奖品配置不符合8区域要求')
      return
    }
    
    const canvasSize = 260
    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    const radius = canvasSize / 2 - 10
    const centerRadius = 40
    
    console.log('🎨 开始绘制8区域转盘...')
    
    // 清空画布
    ctx.clearRect(0, 0, canvasSize, canvasSize)
    
    // 🎯 绘制8个奖品区域
    prizes.forEach((prize, index) => {
      const startAngle = (index * 45 - 90) * Math.PI / 180 // 从顶部开始
      const endAngle = ((index + 1) * 45 - 90) * Math.PI / 180
      
      // 🎨 绘制扇形背景
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()
      
      // 设置扇形颜色
      const color = prize.color || technicalConfig.fallbackColors[index % 8]
      
      // 🎨 渐变效果（兼容性处理）- 🔧 修复：增强兼容性检查
      if (canvasCompatibility.createLinearGradient && typeof ctx.createLinearGradient === 'function') {
        try {
          const gradient = ctx.createLinearGradient(
            centerX - radius/2, centerY - radius/2,
            centerX + radius/2, centerY + radius/2
          )
          gradient.addColorStop(0, color)
          gradient.addColorStop(1, this.lightenColor(color, 20))
          ctx.fillStyle = gradient
        } catch (error) {
          console.warn('⚠️ 渐变创建失败，使用纯色填充:', error)
          ctx.fillStyle = color
        }
      } else {
        console.log('ℹ️ 设备不支持渐变，使用纯色填充')
        ctx.fillStyle = color
      }
      
      ctx.fill()
      
      // 🎨 绘制扇形边框
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 🎨 绘制奖品文字
      const textAngle = startAngle + (endAngle - startAngle) / 2
      const textRadius = radius * 0.75
      const textX = centerX + Math.cos(textAngle) * textRadius
      const textY = centerY + Math.sin(textAngle) * textRadius
      
      ctx.save()
      ctx.translate(textX, textY)
      ctx.rotate(textAngle + Math.PI / 2)
      
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      // 分行显示奖品名称（防止文字过长）
      const prizeName = prize.prize_name || `奖品${index + 1}`
      if (prizeName.length > 4) {
        const firstLine = prizeName.substring(0, 3)
        const secondLine = prizeName.substring(3)
        ctx.fillText(firstLine, 0, -8)
        ctx.fillText(secondLine, 0, 8)
      } else {
        ctx.fillText(prizeName, 0, 0)
      }
      
      ctx.restore()
    })
    
    // 🎯 绘制中心圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI)
    ctx.fillStyle = '#FF6B35'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 🎯 绘制指针（科技感设计）
    this.drawBeautifulPointer(ctx, centerX, centerY)
    
    // 🎮 绘制科技粒子效果
    if (canvasCompatibility.filter !== false) {
      this.drawTechParticles(ctx, canvasCompatibility)
    }
    
    // 提交绘制
    ctx.draw()
    
    console.log('✅ 8区域转盘绘制完成')
  },

  /**
   * 🎨 颜色加亮工具函数
   */
  lightenColor(color, percent) {
    try {
      // 将十六进制颜色转换为 RGB
      const hex = color.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      
      // 加亮处理
      const lighten = (channel) => {
        const lightened = channel + (255 - channel) * (percent / 100)
        return Math.round(Math.min(255, lightened))
      }
      
      const newR = lighten(r).toString(16).padStart(2, '0')
      const newG = lighten(g).toString(16).padStart(2, '0')
      const newB = lighten(b).toString(16).padStart(2, '0')
      
      return `#${newR}${newG}${newB}`
    } catch (error) {
      console.warn('颜色加亮失败，返回原色:', error)
      return color
    }
  },

  /**
   * 🎯 绘制精美指针
   */
  drawBeautifulPointer(ctx, centerX, centerY) {
    try {
      const pointerLength = 20
      const pointerWidth = 8
      
      // 绘制指针三角形
      ctx.beginPath()
      ctx.moveTo(centerX, centerY - 45) // 指针顶点
      ctx.lineTo(centerX - pointerWidth, centerY - 45 + pointerLength) // 左下
      ctx.lineTo(centerX + pointerWidth, centerY - 45 + pointerLength) // 右下
      ctx.closePath()
      
      // 设置指针样式
      ctx.fillStyle = '#FFD700'
      ctx.fill()
      ctx.strokeStyle = '#FFA500'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 绘制指针中心圆
      ctx.beginPath()
      ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI)
      ctx.fillStyle = '#FFD700'
      ctx.fill()
      ctx.strokeStyle = '#FFA500'
      ctx.lineWidth = 2
      ctx.stroke()
    } catch (error) {
      console.warn('指针绘制失败:', error)
    }
  },

  /**
   * 🎮 绘制科技粒子效果（简化版）
   */
  drawTechParticles(ctx, compatibility) {
    try {
      // 简化的粒子效果，避免兼容性问题
      if (!compatibility.createRadialGradient) {
        return // 跳过粒子效果
      }
      
      // 绘制几个装饰性光点
      const particles = [
        { x: 50, y: 50, size: 3 },
        { x: 150, y: 80, size: 2 },
        { x: 200, y: 180, size: 4 },
        { x: 80, y: 200, size: 2 }
      ]
      
      particles.forEach(particle => {
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size, 0, 2 * Math.PI)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fill()
      })
    } catch (error) {
      console.warn('粒子效果绘制失败:', error)
    }
  },

  /**
   * 🎯 抽奖处理 - 严格按照业务规则
   */
  handleDraw(drawType, count) {
    console.log(`🎯 处理${drawType}抽奖, 数量:${count}`)
    
    // 🔴 检查后端连接状态
    if (!this.data.backendConnected) {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '抽奖系统无法连接后端服务！请检查服务状态。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      return
    }
    
    // 🔴 检查抽奖系统状态
    if (!this.data.isActive) {
      wx.showToast({
        title: this.data.maintenanceInfo?.reason || '抽奖系统维护中',
        icon: 'none',
        duration: 2000
      })
      return
    }
    
    // 🔴 验证积分余额
    const needPoints = (this.data.costPoints || 100) * count
    if (this.data.totalPoints < needPoints) {
      wx.showModal({
        title: '积分不足',
        content: `${drawType}需要${needPoints}积分，当前只有${this.data.totalPoints}积分`,
        showCancel: false,
        confirmText: '去赚积分'
      })
      return
    }
    
    // 🔴 检查每日限制
    if (this.data.todayDrawCount + count > this.data.dailyLimit) {
      const remaining = this.data.dailyLimit - this.data.todayDrawCount
      wx.showModal({
        title: '超出每日限制',
        content: `今日还可抽奖${remaining}次，无法进行${count}次抽奖`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    // 开始抽奖
    this.startDrawing(drawType, count, needPoints)
  },

  /**
   * 🎯 开始抽奖 - 调用后端API
   */
  startDrawing(drawType, count, needPoints) {
    console.log(`🎯 开始${drawType}抽奖...`)
    
    this.safeSetData({ isDrawing: true })
    
    // 🔧 使用安全的Loading管理器
    loadingManager.show('抽奖中...', true)
    
    // 🔴 调用后端抽奖API
    lotteryAPI.draw(drawType, count).then(result => {
      loadingManager.hide()
      
      console.log('✅ 抽奖API响应:', result)
      console.log('✅ 抽奖成功，响应数据结构:', result.data)
      
      // 🔧 增强数据结构验证和兼容性处理
      if (!result || !result.data) {
        throw new Error('抽奖API响应数据格式异常')
      }
      
      const responseData = result.data
      
      // 🔧 支持多种可能的数据结构
      let results, user_points, today_count
      
      if (responseData.results || responseData.data) {
        // 标准格式: {results: [...], user_points: 100, today_count: 5}
        results = responseData.results || responseData.data
        user_points = responseData.user_points || responseData.userPoints || responseData.points
        today_count = responseData.today_count || responseData.todayCount || responseData.count
      } else if (Array.isArray(responseData)) {
        // 简单格式: 直接返回结果数组
        results = responseData
        user_points = this.data.totalPoints // 保持当前积分
        today_count = this.data.todayDrawCount + count // 增加抽奖次数
      } else {
        // 其他格式的兼容处理
        results = [responseData] // 单个结果包装成数组
        user_points = responseData.user_points || this.data.totalPoints
        today_count = responseData.today_count || (this.data.todayDrawCount + count)
      }
      
      console.log('🔍 解析后的抽奖数据:', {
        results: results,
        user_points: user_points,
        today_count: today_count,
        resultsLength: results?.length
      })
      
      // 🔴 更新本地状态
      this.safeSetData({
        isDrawing: false,
        totalPoints: user_points,
        todayDrawCount: today_count
      })
      
      // 🔴 更新全局积分
      this.updateGlobalUserPoints(user_points)
      
      // 🎮 播放转盘动画
      if (results && results.length > 0) {
        this.playAnimation(results[0]) // 单抽显示转盘动画
        
        // 延迟显示结果
        setTimeout(() => {
          this.showDrawResult(results)
        }, 3000)
      } else {
        // 🔧 如果没有抽奖结果，显示提示并播放默认动画
        console.warn('⚠️ 抽奖结果为空，使用默认处理')
        this.playDefaultAnimation()
        
        setTimeout(() => {
          wx.showModal({
            title: '🎲 抽奖完成',
            content: '抽奖已完成，但未获取到具体结果信息',
            showCancel: false,
            confirmText: '知道了'
          })
        }, 3000)
      }
      
    }).catch(error => {
      loadingManager.hide()
      this.safeSetData({ isDrawing: false })
      
      console.error('❌ 抽奖失败:', error)
      this.showDrawError(error)
    })
  },

  /**
   * 🔴 更新全局用户积分
   */
  updateGlobalUserPoints(newPoints) {
    if (app.globalData.userInfo) {
      app.globalData.userInfo.total_points = newPoints
    }
  },

  /**
   * 🚨 抽奖错误处理 - 增强用户体验
   */
  showDrawError(error) {
    console.log('🚨 抽奖错误详情:', error)
    
    let errorMsg = '抽奖失败，请稍后重试'
    let showActions = false
    
    // 🔴 根据错误类型提供针对性解决方案
    if (error && error.code) {
      switch (error.code) {
        case 3000: // 积分不足
          const needPoints = this.extractPointsFromErrorMsg(error.msg) || 100
          const currentPoints = this.data.totalPoints || 0
          const shortfall = needPoints - currentPoints
          
                     loadingManager.showModal({
             title: '💰 积分不足',
             content: `本次抽奖需要 ${needPoints} 积分\n当前积分：${currentPoints}\n还需要：${shortfall} 积分\n\n💡 获取积分方式：\n📷 拍照上传消费凭证\n📅 每日签到领取积分`,
             showCancel: true,
             cancelText: '我知道了',
             confirmText: '去赚积分',
             confirmColor: '#FF6B35'
           }).then((res) => {
             if (res.confirm) {
               // 跳转到拍照页面
               wx.switchTab({
                 url: '/pages/camera/camera'
               })
             }
           })
          return
          
        case 3001: // 每日限制
          errorMsg = error.msg || '今日抽奖次数已达上限'
          break
          
        case 2002: // 令牌无效
          errorMsg = '登录状态已过期，请重新登录'
          showActions = true
          break
          
        case 4001: // 抽奖系统维护
          errorMsg = error.msg || '抽奖系统维护中，请稍后再试'
          break
          
        default:
          errorMsg = error.msg || error.message || '抽奖失败，请稍后重试'
      }
    } else if (error && error.msg) {
      errorMsg = error.msg
    } else if (error && error.message) {
      errorMsg = error.message
    }
    
         // 🔴 显示通用错误提示
     if (showActions && error.code === 2002) {
       // 登录过期的情况
       loadingManager.showModal({
         title: '🔐 登录过期',
         content: errorMsg + '\n\n请重新登录以继续使用',
         showCancel: false,
         confirmText: '去登录',
         confirmColor: '#FF6B35'
       }).then(() => {
         wx.navigateTo({
           url: '/pages/auth/auth'
         })
       })
     } else {
       // 普通错误提示
       loadingManager.showModal({
         title: '抽奖失败',
         content: errorMsg,
         showCancel: false,
         confirmText: '知道了'
       })
     }
  },

  /**
   * 🔧 从错误消息中提取所需积分数量
   */
  extractPointsFromErrorMsg(msg) {
    if (!msg) return null
    
    try {
      // 匹配 "需要 100 积分" 这样的格式
      const match = msg.match(/需要\s*(\d+)\s*积分/)
      return match ? parseInt(match[1]) : null
    } catch (error) {
      console.warn('提取积分数量失败:', error)
      return null
    }
  },

  /**
   * 🎮 播放转盘旋转动画
   */
  playAnimation(result) {
    console.log('🎮 开始播放转盘动画，抽奖结果数据:', result)
    
    // 🔧 增强数据验证 - 支持多种可能的数据结构
    if (!result) {
      console.warn('⚠️ 抽奖结果为空，跳过动画')
      return
    }
    
    // 🔧 修复数据结构适配 - 支持多种可能的字段名
    let prizeId = null
    if (result.prize_id) {
      prizeId = result.prize_id
    } else if (result.prizeId) {
      prizeId = result.prizeId
    } else if (result.id) {
      prizeId = result.id
    } else if (result.prize && result.prize.id) {
      prizeId = result.prize.id
    }
    
    console.log('🔍 提取的奖品ID:', prizeId, '数据类型:', typeof prizeId)
    console.log('🔍 当前奖品配置:', this.data.prizes)
    
    if (!prizeId) {
      console.warn('⚠️ 无法获取奖品ID，跳过动画。结果数据:', result)
      // 🔧 不跳过，而是使用默认动画
      this.playDefaultAnimation()
      return
    }
    
    // 🔧 增强奖品匹配逻辑 - 支持字符串和数字类型的转换
    const prizeIndex = this.data.prizes.findIndex(p => {
      // 严格匹配
      if (p.prize_id === prizeId) return true
      // 字符串数字转换匹配
      if (String(p.prize_id) === String(prizeId)) return true
      // 支持其他可能的字段名
      if (p.id === prizeId || p.prizeId === prizeId) return true
      if (String(p.id) === String(prizeId) || String(p.prizeId) === String(prizeId)) return true
      return false
    })
    
    console.log('🔍 奖品匹配结果 - 索引:', prizeIndex)
    
    if (prizeIndex === -1) {
      console.warn('⚠️ 未找到对应奖品，奖品ID:', prizeId)
      console.warn('📋 可用奖品列表:', this.data.prizes.map(p => ({
        index: this.data.prizes.indexOf(p),
        prize_id: p.prize_id,
        id: p.id,
        name: p.prize_name || p.name
      })))
      
      // 🔧 提供兜底方案 - 播放随机动画而不是跳过
      this.playDefaultAnimation()
      return
    }
    
    const targetAngle = prizeIndex * 45 + 22.5 // 指向扇形中心
    const spinAngle = 360 * 3 + targetAngle // 转3圈后停在目标位置
    
    console.log(`🎮 播放转盘动画，目标角度: ${targetAngle}，总旋转角度: ${spinAngle}`)
    
    // CSS动画实现转盘旋转
    this.safeSetData({
      currentAngle: spinAngle,
      isAnimating: true
    })
    
    // 🔧 动画完成后重置状态
    setTimeout(() => {
      this.safeSetData({
        isAnimating: false
      })
    }, 3000)
  },

  /**
   * 🎯 播放默认动画（兜底方案）
   */
  playDefaultAnimation() {
    console.log('🎯 播放默认转盘动画')
    
    // 随机选择一个目标位置
    const randomPrizeIndex = Math.floor(Math.random() * 8)
    const targetAngle = randomPrizeIndex * 45 + 22.5
    const spinAngle = 360 * 3 + targetAngle
    
    this.safeSetData({
      currentAngle: spinAngle,
      isAnimating: true
    })
    
    setTimeout(() => {
      this.safeSetData({
        isAnimating: false
      })
    }, 3000)
  },

  /**
   * 🎉 显示抽奖结果
   */
  showDrawResult(results) {
    if (!results || results.length === 0) {
      console.warn('⚠️ 抽奖结果为空')
      // 🔧 显示友好提示而不是静默失败
      wx.showModal({
        title: '🎲 抽奖异常',
        content: '抽奖结果数据异常，请重新尝试抽奖',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    console.log('🎉 原始抽奖结果数据:', results)
    
    // 🔧 详细分析每个结果对象的结构
    results.forEach((result, index) => {
      console.log(`🔍 结果${index + 1}详细信息:`, {
        全部字段: Object.keys(result),
        全部值: result,
        prize_id字段: result.prize_id,
        prizeId字段: result.prizeId, 
        id字段: result.id,
        prize_name字段: result.prize_name,
        prizeName字段: result.prizeName,
        name字段: result.name,
        奖品相关字段: {
          prize: result.prize,
          product: result.product,
          item: result.item,
          reward: result.reward
        }
      })
    })
    
    // 🔧 增强数据标准化逻辑 - 支持更多可能的数据结构
    const standardizedResults = results.map((result, index) => {
      console.log(`🔧 处理结果${index + 1}:`, result)
      
      // 🔴 更全面的字段提取逻辑
      let prize_id = null
      let prize_name = '神秘奖品'
      let prize_desc = ''
      let is_near_miss = false
      let points = 0
      
      // 提取奖品ID - 支持更多可能的字段名
      if (result.prize_id !== undefined && result.prize_id !== null) {
        prize_id = result.prize_id
      } else if (result.prizeId !== undefined && result.prizeId !== null) {
        prize_id = result.prizeId
      } else if (result.id !== undefined && result.id !== null) {
        prize_id = result.id
      } else if (result.prize && result.prize.id !== undefined) {
        prize_id = result.prize.id
      } else if (result.product && result.product.id !== undefined) {
        prize_id = result.product.id
      } else if (result.item_id !== undefined) {
        prize_id = result.item_id
      } else if (result.reward_id !== undefined) {
        prize_id = result.reward_id
      }
      
      // 提取奖品名称 - 支持更多可能的字段名
      if (result.prize_name) {
        prize_name = result.prize_name
      } else if (result.prizeName) {
        prize_name = result.prizeName
      } else if (result.name) {
        prize_name = result.name
      } else if (result.prize && result.prize.name) {
        prize_name = result.prize.name
      } else if (result.product && result.product.name) {
        prize_name = result.product.name
      } else if (result.item_name) {
        prize_name = result.item_name
      } else if (result.reward_name) {
        prize_name = result.reward_name
      } else if (result.title) {
        prize_name = result.title
      }
      
      // 提取描述信息
      if (result.prize_desc) {
        prize_desc = result.prize_desc
      } else if (result.prizeDesc) {
        prize_desc = result.prizeDesc
      } else if (result.description) {
        prize_desc = result.description
      } else if (result.desc) {
        prize_desc = result.desc
      }
      
      // 提取是否接近中奖
      if (result.is_near_miss !== undefined) {
        is_near_miss = result.is_near_miss
      } else if (result.isNearMiss !== undefined) {
        is_near_miss = result.isNearMiss
      } else if (result.near_miss !== undefined) {
        is_near_miss = result.near_miss
      }
      
      // 提取积分
      if (result.points !== undefined) {
        points = result.points
      } else if (result.point !== undefined) {
        points = result.point
      } else if (result.score !== undefined) {
        points = result.score
      }
      
      const standardized = {
        prize_id: prize_id,
        prize_name: prize_name,
        prize_desc: prize_desc,
        is_near_miss: is_near_miss,
        points: points,
        quantity: result.quantity || result.count || 1,
        // 🔧 为前端显示添加更多字段
        display_name: prize_name,
        display_desc: is_near_miss 
          ? '差一点就中了！下次再来试试运气吧~' 
          : '恭喜中奖！奖品将尽快发放到您的账户'
      }
      
      console.log(`✅ 结果${index + 1}标准化完成:`, standardized)
      return standardized
    })
    
    console.log('🎉 标准化后的抽奖结果:', standardizedResults)
    
    this.safeSetData({
      showResult: true,
      resultData: standardizedResults
    })
    
    // 🔧 播放中奖音效提示（如果有中奖的话）
    const hasWin = standardizedResults.some(r => !r.is_near_miss)
    if (hasWin) {
      wx.vibrateShort() // 震动反馈
    }
  },

  /**
   * 🔴 关闭结果弹窗
   */
  onCloseResult() {
    this.safeSetData({
      showResult: false,
      resultData: null
    })
  },

  /**
   * 关闭结果模态框
   */
  closeResultModal() {
    this.onCloseResult()
  },

  /**
   * 🔧 修复：添加缺失的页面点击事件处理方法
   * 用于处理页面点击，通常用于关闭弹窗或其他交互
   */
  onPageTap(event) {
    console.log('🖱️ 页面点击事件:', event)
    
    // 如果正在显示结果弹窗，点击页面其他区域可以关闭弹窗
    if (this.data.showResult) {
      // 检查点击的不是弹窗内容区域
      const target = event.target
      if (target && target.dataset && target.dataset.close !== 'false') {
        this.onCloseResult()
      }
    }
    
    // 可以在这里添加其他页面交互逻辑
  },

  // 🎯 抽奖按钮事件
  onSingleDraw() {
    this.handleDraw('单抽', 1)
  },

  onTripleDraw() {
    this.handleDraw('三连抽', 3)
  },

  onFiveDraw() {
    this.handleDraw('五连抽', 5)
  },

  onTenDraw() {
    this.handleDraw('十连抽', 10)
  },

  /**
   * 查看抽奖记录
   */
  onViewRecords() {
    wx.navigateTo({
      url: '/pages/records/lottery-records'
    })
  },

  /**
   * 联系客服
   */
  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '如需帮助，请通过以下方式联系我们：\n\n📞 客服电话：400-123-4567\n💬 在线客服：工作日 9:00-18:00',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分抽奖，豪华奖品等你拿！',
      path: '/pages/lottery/lottery',
      imageUrl: '/images/share-lottery.jpg'
    }
  },

  /**
   * 🔧 安全的setData方法 - 防止undefined值导致小程序崩溃
   */
  safeSetData(data) {
    const safeData = {}
    
    // 递归清理所有undefined值
    const cleanUndefined = (obj) => {
      if (obj === null || obj === undefined) {
        return null
      }
      
      if (typeof obj === 'object' && !Array.isArray(obj)) {
        const cleaned = {}
        for (const key in obj) {
          if (obj.hasOwnProperty(key)) {
            const value = obj[key]
            if (value !== undefined) {
              cleaned[key] = cleanUndefined(value)
            }
          }
        }
        return cleaned
      }
      
      if (Array.isArray(obj)) {
        return obj.filter(item => item !== undefined).map(item => cleanUndefined(item))
      }
      
      return obj
    }
    
    // 清理输入数据
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        const value = data[key]
        if (value !== undefined) {
          safeData[key] = cleanUndefined(value)
        } else {
          console.warn(`⚠️ 跳过undefined字段: ${key}`)
        }
      }
    }
    
    console.log('🔧 安全数据设置:', safeData)
    this.setData(safeData)
  },

  // ... existing helper methods ...
}) 