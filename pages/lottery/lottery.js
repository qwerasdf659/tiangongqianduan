// pages/lottery/lottery.js - 抽奖页面逻辑
const app = getApp()
const { lotteryAPI, userAPI } = require('../../utils/api')
const { SliderVerify, throttle } = require('../../utils/validate')
const { getTechnicalConfig } = require('./lottery-config')

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
    this.setData({ 
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
      this.setData({
        loadingConfig: false,
        backendConnected: true,
        wheelReady: true,
        isButtonVisible: true,
        forceUpdate: Date.now()
      })
      
      // 启动指针动画
      this.startPointerIdleAnimation()
      
    }).catch(error => {
      console.error('❌ 页面初始化失败:', error)
      this.handleBackendError(error)
    })
  },

  // 🔴 刷新用户信息 - 必须从后端获取
  refreshUserInfo() {
    console.log('🔄 开始刷新用户信息...')
    
    return userAPI.getUserInfo().then(result => {
      console.log('✅ 用户信息获取成功:', result.data)
      
      const userInfo = result.data
      this.setData({
        userInfo: {
          nickname: userInfo.nickname || '用户',
          phone: userInfo.phone || '未绑定'
        },
        totalPoints: userInfo.total_points || 0
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = userInfo
      
      return userInfo
    }).catch(error => {
      console.error('❌ 获取用户信息失败:', error)
      
      // 🚨 显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取用户信息！\n\n可能原因：\n1. 后端user服务未启动\n2. /user/info接口异常\n\n请立即检查后端服务状态！',
        showCancel: false,
        confirmColor: '#ff4444'
      })
      
      throw error
    })
  },

  // 🔴 加载抽奖配置 - 必须从后端获取
  loadLotteryConfig() {
    console.log('🔄 开始加载抽奖配置...')
    
    return lotteryAPI.getConfig().then(result => {
      console.log('✅ 抽奖配置获取成功:', result.data)
      
      const config = result.data
      
      // 验证后端数据完整性
      if (!config.prizes || !Array.isArray(config.prizes) || config.prizes.length === 0) {
        throw new Error('后端返回的奖品数据不完整')
      }
      
      if (!config.cost_points || !config.daily_limit) {
        throw new Error('后端返回的配置参数不完整')
      }
      
      // 设置抽奖配置
      this.setData({
        prizes: config.prizes,
        costPoints: config.cost_points,
        dailyLimit: config.daily_limit,
        todayDrawCount: config.today_draw_count || 0
      })
      
      // 重新绘制转盘
      this.drawWheel()
      
      return config
    }).catch(error => {
      console.error('❌ 获取抽奖配置失败:', error)
      
      // 🚨 显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取抽奖配置！\n\n可能原因：\n1. 后端lottery服务未启动\n2. /lottery/config接口异常\n3. 数据库连接问题\n\n请立即检查后端服务状态！',
        showCancel: false,
        confirmColor: '#ff4444'
      })
      
      throw error
    })
  },

  // 🚨 处理后端服务异常
  handleBackendError(error) {
    console.error('🚨 后端服务异常:', error)
    
    this.setData({
      loadingConfig: false,
      backendConnected: false,
      wheelReady: false,
      isButtonVisible: false,
      canvasError: true
    })
    
    // 显示错误状态的转盘
    this.useCanvasFallback()
  },

  // 🔴 Canvas初始化 - 使用技术配置
  initCanvas() {
    console.log('🎨 开始初始化Canvas...')
    
    // 检查是否有抽奖配置数据
    if (!this.data.prizes || this.data.prizes.length === 0) {
      console.log('⚠️ 等待抽奖配置加载...')
      return
    }
    
    try {
      this.drawWheel()
      console.log('✅ Canvas初始化成功')
    } catch (error) {
      console.error('❌ Canvas初始化失败:', error)
      this.useCanvasFallback()
    }
  },

  // Canvas降级处理
  useCanvasFallback() {
    console.log('⚠️ 使用Canvas降级方案')
    this.setData({
      canvasFallback: true,
      showStaticWheel: true,
      canvasError: true
    })
  },

  // 🔴 绘制转盘 - 使用后端数据
  drawWheel() {
    if (!this.data.prizes || this.data.prizes.length === 0) {
      console.log('⚠️ 无奖品数据，无法绘制转盘')
      return
    }
    
    const ctx = wx.createCanvasContext('wheel-canvas')
    const { canvasCompatibility, technicalConfig } = this.data
    const centerX = 300
    const centerY = 300
    const radius = 250
    
    // 清空画布
    ctx.clearRect(0, 0, 600, 600)
    
    // 绘制转盘背景
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
    ctx.fillStyle = '#1a1a1a'
    ctx.fill()
    
    // 绘制奖品扇形
    const anglePerSlice = technicalConfig.anglePerSlice * Math.PI / 180
    
    this.data.prizes.forEach((prize, index) => {
      const startAngle = index * anglePerSlice - Math.PI / 2
      const endAngle = (index + 1) * anglePerSlice - Math.PI / 2
      
      // 绘制扇形
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()
      
      // 使用后端提供的颜色，如果没有则使用技术配置的后备颜色
      const color = prize.color || technicalConfig.fallbackColors[index % technicalConfig.fallbackColors.length]
      ctx.fillStyle = color
      ctx.fill()
      
      // 绘制分割线
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.lineTo(
        centerX + Math.cos(endAngle) * radius,
        centerY + Math.sin(endAngle) * radius
      )
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 绘制奖品文字
      const textAngle = startAngle + anglePerSlice / 2
      const textRadius = radius * 0.7
      const textX = centerX + Math.cos(textAngle) * textRadius
      const textY = centerY + Math.sin(textAngle) * textRadius
      
      ctx.save()
      ctx.translate(textX, textY)
      ctx.rotate(textAngle + Math.PI / 2)
      ctx.fillStyle = '#fff'
      ctx.font = '16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText(prize.name, 0, 0)
      ctx.restore()
    })
    
    // 绘制中心圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, technicalConfig.centerSize, 0, 2 * Math.PI)
    ctx.fillStyle = '#ff4444'
    ctx.fill()
    
    // 绘制中心文字
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 18px Arial'
    ctx.textAlign = 'center'
    ctx.fillText('开始', centerX, centerY + 6)
    
    // 绘制指针
    this.drawBeautifulPointer(ctx, centerX, centerY)
    
    // 绘制科技感粒子
    this.drawTechParticles(ctx, canvasCompatibility)
    
    ctx.draw()
  },

  // 开始指针待机动画
  startPointerIdleAnimation() {
    if (this.pointerAnimationTimer) {
      clearInterval(this.pointerAnimationTimer)
    }
    
    this.pointerAnimationTimer = setInterval(() => {
      this.pointerAnimationPhase += 0.1
      if (this.pointerAnimationPhase > 2 * Math.PI) {
        this.pointerAnimationPhase = 0
      }
      
      // 更新粒子系统
      this.updateParticles()
      
      // 重绘转盘
      this.drawWheel()
    }, 50)
  },

  // 停止指针待机动画
  stopPointerIdleAnimation() {
    if (this.pointerAnimationTimer) {
      clearInterval(this.pointerAnimationTimer)
      this.pointerAnimationTimer = null
    }
  },

  // 更新粒子系统
  updateParticles() {
    const now = Date.now()
    const particles = this.particleSystem.particles
    
    // 生成新粒子
    if (now - this.particleSystem.lastParticleTime > 200) {
      if (particles.length < this.particleSystem.maxParticles) {
        const angle = Math.random() * 2 * Math.PI
        const radius = 100 + Math.random() * 50
        
        particles.push({
          x: 300 + Math.cos(angle) * radius,
          y: 300 + Math.sin(angle) * radius,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          life: 1.0,
          decay: 0.01 + Math.random() * 0.02
        })
      }
      this.particleSystem.lastParticleTime = now
    }
    
    // 更新现有粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i]
      particle.x += particle.vx
      particle.y += particle.vy
      particle.life -= particle.decay
      
      if (particle.life <= 0) {
        particles.splice(i, 1)
      }
    }
  },

  // 绘制科技感粒子
  drawTechParticles(ctx, compatibility) {
    const particles = this.particleSystem.particles
    
    particles.forEach(particle => {
      const alpha = particle.life
      const size = 2 + particle.life * 2
      
      ctx.save()
      ctx.globalAlpha = alpha
      
      // 绘制粒子核心
      ctx.beginPath()
      ctx.arc(particle.x, particle.y, size, 0, 2 * Math.PI)
      ctx.fillStyle = '#00ffff'
      ctx.fill()
      
      // 绘制粒子光晕
      if (compatibility.createRadialGradient) {
        const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, size * 3)
        gradient.addColorStop(0, 'rgba(0, 255, 255, 0.3)')
        gradient.addColorStop(1, 'rgba(0, 255, 255, 0)')
        
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, size * 3, 0, 2 * Math.PI)
        ctx.fillStyle = gradient
        ctx.fill()
      }
      
      ctx.restore()
    })
  },

  // 绘制3D指针底座
  draw3DPointerBase(ctx, centerX, centerY, compatibility, scale = 1, offsetY = 0) {
    const config = this.pointer3DConfig
    const depth = config.depth * scale
    const shadowIntensity = config.shadowIntensity
    
    // 绘制指针阴影
    ctx.save()
    ctx.globalAlpha = shadowIntensity
    ctx.fillStyle = '#000'
    
    // 主体阴影
    ctx.beginPath()
    ctx.moveTo(centerX + 2, centerY - 80 * scale + offsetY + 2)
    ctx.lineTo(centerX - 12 * scale + 2, centerY - 20 * scale + offsetY + 2)
    ctx.lineTo(centerX + 12 * scale + 2, centerY - 20 * scale + offsetY + 2)
    ctx.closePath()
    ctx.fill()
    
    ctx.restore()
    
    // 绘制指针立体效果
    for (let i = 0; i < depth; i++) {
      const progress = i / depth
      const brightness = 1 - progress * 0.3
      
      ctx.save()
      ctx.fillStyle = `rgba(255, 68, 68, ${brightness})`
      
      // 主体
      ctx.beginPath()
      ctx.moveTo(centerX - i, centerY - 80 * scale + offsetY - i)
      ctx.lineTo(centerX - 12 * scale - i, centerY - 20 * scale + offsetY - i)
      ctx.lineTo(centerX + 12 * scale - i, centerY - 20 * scale + offsetY - i)
      ctx.closePath()
      ctx.fill()
      
      ctx.restore()
    }
  },

  // 绘制美化指针
  drawBeautifulPointer(ctx, centerX, centerY) {
    const { canvasCompatibility } = this.data
    
    // 指针动画偏移
    const animationOffset = Math.sin(this.pointerAnimationPhase) * 3
    
    // 绘制3D底座
    this.draw3DPointerBase(ctx, centerX, centerY, canvasCompatibility, 1, animationOffset)
    
    // 绘制指针主体
    ctx.save()
    
    // 主指针
    ctx.beginPath()
    ctx.moveTo(centerX, centerY - 80 + animationOffset)
    ctx.lineTo(centerX - 12, centerY - 20 + animationOffset)
    ctx.lineTo(centerX + 12, centerY - 20 + animationOffset)
    ctx.closePath()
    
    // 渐变填充
    if (canvasCompatibility.createLinearGradient) {
      const gradient = ctx.createLinearGradient(centerX, centerY - 80 + animationOffset, centerX, centerY - 20 + animationOffset)
      gradient.addColorStop(0, '#ff6b6b')
      gradient.addColorStop(0.5, '#ff4444')
      gradient.addColorStop(1, '#cc0000')
      ctx.fillStyle = gradient
    } else {
      ctx.fillStyle = '#ff4444'
    }
    
    ctx.fill()
    
    // 指针边框
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 指针装饰
    ctx.beginPath()
    ctx.arc(centerX, centerY - 50 + animationOffset, 4, 0, 2 * Math.PI)
    ctx.fillStyle = '#fff'
    ctx.fill()
    
    ctx.restore()
  },

  // 🔴 执行抽奖 - 必须调用后端接口
  handleDraw(drawType, count) {
    console.log(`🎰 开始${drawType}抽奖，次数：${count}`)
    
    // 检查后端连接状态
    if (!this.data.backendConnected) {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '后端服务未连接！无法执行抽奖。\n\n请检查后端服务状态后重试。',
        showCancel: false,
        confirmColor: '#ff4444'
      })
      return
    }
    
    // 检查抽奖配置
    if (!this.data.prizes || this.data.prizes.length === 0) {
      wx.showModal({
        title: '⚠️ 配置异常',
        content: '抽奖配置未加载！请刷新页面重试。',
        showCancel: false
      })
      return
    }
    
    // 计算所需积分
    const needPoints = this.data.costPoints * count
    
    // 检查积分余额
    if (this.data.totalPoints < needPoints) {
      wx.showModal({
        title: '积分不足',
        content: `${drawType}需要${needPoints}积分，当前积分：${this.data.totalPoints}`,
        showCancel: false
      })
      return
    }
    
    // 检查每日限制
    if (this.data.todayDrawCount + count > this.data.dailyLimit) {
      wx.showModal({
        title: '次数超限',
        content: `今日还可抽奖${this.data.dailyLimit - this.data.todayDrawCount}次`,
        showCancel: false
      })
      return
    }
    
    // 开始抽奖
    this.startDrawing(drawType, count, needPoints)
  },

  // 开始抽奖动画和后端调用
  startDrawing(drawType, count, needPoints) {
    console.log(`🎰 开始执行抽奖: ${drawType}(${count}次)，消耗积分: ${needPoints}`)
    
    // 设置抽奖状态
    this.setData({ 
      isDrawing: true,
      wheelReady: false,
      isButtonVisible: false
    })
    
    // 停止待机动画
    this.stopPointerIdleAnimation()
    
    // 显示抽奖中状态
    wx.showLoading({
      title: '抽奖中...',
      mask: true
    })
    
    // 🔴 调用后端抽奖接口
    lotteryAPI.draw(drawType, count).then(result => {
      console.log('✅ 抽奖成功:', result.data)
      
      wx.hideLoading()
      
      // 更新用户积分
      this.updateGlobalUserPoints(result.data.remaining_points)
      
      // 更新今日抽奖次数
      this.setData({
        totalPoints: result.data.remaining_points,
        todayDrawCount: result.data.today_draw_count || this.data.todayDrawCount + count
      })
      
      // 播放抽奖动画
      this.playAnimation(result.data.results[0])
      
      // 显示抽奖结果
      setTimeout(() => {
        this.showDrawResult(result.data.results)
      }, 3000)
      
    }).catch(error => {
      console.error('❌ 抽奖失败:', error)
      wx.hideLoading()
      
      // 🚨 显示后端服务异常提示
      wx.showModal({
        title: '🚨 抽奖失败',
        content: '后端抽奖服务异常！\n\n可能原因：\n1. 后端lottery服务未启动\n2. /lottery/draw接口异常\n3. 服务器繁忙\n\n请检查后端服务状态！',
        showCancel: false,
        confirmColor: '#ff4444'
      })
      
      // 恢复抽奖状态
      this.setData({
        isDrawing: false,
        wheelReady: true,
        isButtonVisible: true
      })
      
      // 重新启动待机动画
      this.startPointerIdleAnimation()
    })
  },

  // 更新全局用户积分
  updateGlobalUserPoints(newPoints) {
    if (app.globalData.userInfo) {
      app.globalData.userInfo.total_points = newPoints
    }
  },

  // 显示抽奖错误
  showDrawError(error) {
    wx.showModal({
      title: '抽奖失败',
      content: error.message || '抽奖过程中发生错误',
      showCancel: false
    })
  },

  // 播放抽奖动画
  playAnimation(result) {
    console.log('🎬 播放抽奖动画:', result)
    
    if (!result || typeof result.angle !== 'number') {
      console.error('❌ 抽奖结果数据无效')
      return
    }
    
    // 计算目标角度
    const targetAngle = result.angle
    let currentAngle = 0
    let animationSpeed = 8
    
    const animate = () => {
      currentAngle += animationSpeed
      
      // 减速逻辑
      if (currentAngle > targetAngle + 1080) {
        animationSpeed *= 0.98
      }
      
      // 更新转盘角度
      this.setData({ currentAngle })
      
      // 继续动画
      if (animationSpeed > 0.5) {
        requestAnimationFrame(animate)
      } else {
        console.log('🎉 抽奖动画完成')
        this.setData({ 
          isDrawing: false,
          wheelReady: true,
          isButtonVisible: true,
          currentAngle: targetAngle
        })
        
        // 重新启动待机动画
        this.startPointerIdleAnimation()
      }
    }
    
    animate()
  },

  // 显示抽奖结果
  showDrawResult(results) {
    console.log('🎉 显示抽奖结果:', results)
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.error('❌ 抽奖结果数据无效')
      return
    }
    
    this.setData({
      showResult: true,
      resultData: {
        results: results,
        totalCount: results.length,
        prizeNames: results.map(r => r.prize_name).join('、')
      }
    })
  },

  // 关闭结果弹窗
  onCloseResult() {
    this.closeResultModal()
  },

  // 关闭结果弹窗
  closeResultModal() {
    this.setData({ 
      showResult: false, 
      resultData: null 
    })
  },

  // 🔴 单抽
  onSingleDraw() {
    this.handleDraw('单抽', 1)
  },

  // 🔴 三连抽
  onTripleDraw() {
    this.handleDraw('三连抽', 3)
  },

  // 🔴 五连抽
  onFiveDraw() {
    this.handleDraw('五连抽', 5)
  },

  // 🔴 十连抽
  onTenDraw() {
    this.handleDraw('十连抽', 10)
  },

  // 查看抽奖记录
  onViewRecords() {
    wx.navigateTo({
      url: '/pages/records/lottery-records'
    })
  },

  // 联系客服
  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '如有疑问请联系客服\n微信：tiangong-service\n电话：400-123-4567',
      showCancel: false
    })
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '天工积分抽奖 - 精彩大奖等你来拿！',
      path: '/pages/lottery/lottery',
      imageUrl: '/images/share-lottery.jpg'
    }
  },

  // 页面状态检查
  checkPageStatus() {
    console.log('🔍 页面状态检查:', {
      backendConnected: this.data.backendConnected,
      wheelReady: this.data.wheelReady,
      isDrawing: this.data.isDrawing,
      prizesCount: this.data.prizes.length,
      totalPoints: this.data.totalPoints,
      costPoints: this.data.costPoints
    })
  },

  // 重置页面状态
  resetPageStatus() {
    this.setData({
      isDrawing: false,
      showResult: false,
      resultData: null,
      currentAngle: 0
    })
    
    // 重新加载配置
    this.initPage()
  },

  // 页面点击事件
  onPageTap() {
    // 可以添加页面交互逻辑
  },

  // 检查中心按钮状态
  checkCenterButton() {
    const query = wx.createSelectorQuery()
    query.select('.center-button').boundingClientRect()
    query.exec((res) => {
      console.log('🔍 中心按钮状态:', res[0])
    })
  }
}) 