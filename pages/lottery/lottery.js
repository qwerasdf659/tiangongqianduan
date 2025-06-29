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
        console.log('✅ 用户信息获取成功:', result.data)
        
        const userInfo = result.data
        this.setData({
          userInfo: {
            nickname: userInfo.nickname || '用户',
            phone: userInfo.mobile || '',
            avatar: userInfo.avatar || '/images/default-avatar.png'
          },
          totalPoints: userInfo.total_points || 0
        })
        
        // 更新全局用户信息
        app.globalData.userInfo = {
          ...app.globalData.userInfo,
          ...userInfo
        }
        
        resolve(userInfo)
        
      }).catch(error => {
        console.error('❌ 获取用户信息失败:', error)
        
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
        console.log('✅ 抽奖配置获取成功:', result.data)
        
        const config = result.data
        
        // 🔴 验证后端数据完整性
        if (!config.prizes || !Array.isArray(config.prizes) || config.prizes.length !== 8) {
          throw new Error('❌ 后端返回的奖品配置不符合8区域转盘要求')
        }
        
        // 🔴 设置抽奖配置（严格按照产品文档）
        this.setData({
          prizes: config.prizes.map((prize, index) => ({
            ...prize,
            angle: index * 45, // 8区域转盘，每个区域45度
            color: getTechnicalConfig().fallbackColors[index % 8] // 🔧 修复：直接调用导入函数
          })),
          costPoints: config.cost_points || 100,        // 抽奖消耗积分
          dailyLimit: config.daily_limit || 50,         // 每日限制次数
          isActive: config.is_active || true,           // 抽奖系统状态
          maintenanceInfo: config.maintenance_info || null, // 维护信息
          todayDrawCount: config.today_draw_count || 0  // 今日已抽次数
        })
        
        console.log('🎯 转盘配置已加载:', {
          prizesCount: config.prizes.length,
          costPoints: config.cost_points,
          isActive: config.is_active
        })
        
        resolve(config)
        
      }).catch(error => {
        console.error('❌ 获取抽奖配置失败:', error)
        
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
    
    this.setData({
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
    this.setData({
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
    
    this.setData({ isDrawing: true })
    
    wx.showLoading({
      title: '抽奖中...',
      mask: true
    })
    
    // 🔴 调用后端抽奖API
    lotteryAPI.draw(drawType, count).then(result => {
      wx.hideLoading()
      
      console.log('✅ 抽奖成功:', result.data)
      
      const { results, user_points, today_count } = result.data
      
      // 🔴 更新本地状态
      this.setData({
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
      }
      
    }).catch(error => {
      wx.hideLoading()
      this.setData({ isDrawing: false })
      
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
   * 🚨 抽奖错误处理
   */
  showDrawError(error) {
    let errorMsg = '抽奖失败，请稍后重试'
    
    if (error && error.msg) {
      errorMsg = error.msg
    }
    
    wx.showModal({
      title: '抽奖失败',
      content: errorMsg,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🎮 播放转盘旋转动画
   */
  playAnimation(result) {
    if (!result || !result.prize_id) {
      console.warn('⚠️ 抽奖结果无效，跳过动画')
      return
    }
    
    // 根据中奖奖品计算目标角度
    const prizeIndex = this.data.prizes.findIndex(p => p.prize_id === result.prize_id)
    if (prizeIndex === -1) {
      console.warn('⚠️ 未找到对应奖品，跳过动画')
      return
    }
    
    const targetAngle = prizeIndex * 45 + 22.5 // 指向扇形中心
    const spinAngle = 360 * 3 + targetAngle // 转3圈后停在目标位置
    
    console.log(`🎮 播放转盘动画，目标角度: ${targetAngle}`)
    
    // CSS动画实现转盘旋转
    const animate = () => {
      this.setData({
        currentAngle: spinAngle
      })
    }
    
    animate()
  },

  /**
   * 🎉 显示抽奖结果
   */
  showDrawResult(results) {
    if (!results || results.length === 0) {
      console.warn('⚠️ 抽奖结果为空')
      return
    }
    
    console.log('🎉 显示抽奖结果:', results)
    
    this.setData({
      showResult: true,
      resultData: results
    })
  },

  /**
   * 🔴 关闭结果弹窗
   */
  onCloseResult() {
    this.setData({
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

  // ... existing helper methods ...
}) 