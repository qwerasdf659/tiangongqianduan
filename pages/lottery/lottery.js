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
    
    // 积分不足弹窗
    showPointsModal: false,
    pointsModalData: {
      drawType: '',
      needPoints: 0,
      currentPoints: 0
    },
    
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
    
    // 🔧 修复：检查关键的登录状态和token
    const hasValidLogin = app.globalData.isLoggedIn && app.globalData.accessToken && app.globalData.accessToken !== 'undefined'
    
    if (!hasValidLogin) {
      console.error('❌ 登录状态或访问令牌无效:', {
        isLoggedIn: app.globalData.isLoggedIn,
        hasToken: !!app.globalData.accessToken,
        tokenPreview: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : 'none'
      })
      
      wx.showModal({
        title: '登录状态异常',
        content: '检测到登录状态异常，请重新登录以确保正常使用。',
        showCancel: false,
        confirmText: '重新登录',
        confirmColor: '#ff4444',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return
    }
    
    // 🔧 修复：如果用户信息缺失，记录警告但不阻止页面加载
    if (!app.globalData.userInfo || Object.keys(app.globalData.userInfo).length === 0) {
      console.warn('⚠️ 用户信息缺失，将在页面加载时获取:', {
        userInfo: app.globalData.userInfo
      })
    }
    
    // 🔴 重置异常状态 - 防止页面卡死
    this.resetDrawingState()
    
    // 🔧 修复：添加防重复调用机制
    const now = Date.now()
    const lastRefreshTime = this.lastRefreshTime || 0
    const refreshCooldown = 2000 // 2秒冷却期
    
    if (now - lastRefreshTime > refreshCooldown) {
      console.log('🔄 执行数据刷新（冷却期已过）')
      this.lastRefreshTime = now
      
      // 🔧 修复：优先刷新用户信息，如果用户信息缺失
      if (!this.data.userInfo || this.data.userInfo.nickname === '加载中...' || 
          !app.globalData.userInfo || Object.keys(app.globalData.userInfo).length === 0) {
        this.refreshUserInfo().then(() => {
          // 用户信息获取成功后再加载抽奖配置
          if (!this.data.prizes || this.data.prizes.length === 0) {
            this.loadLotteryConfig()
          }
        }).catch((error) => {
          console.error('❌ 刷新用户信息失败:', error)
          // 即使用户信息获取失败，也尝试加载抽奖配置
          if (!this.data.prizes || this.data.prizes.length === 0) {
            this.loadLotteryConfig()
          }
        })
      } else {
        // 用户信息已存在，只在必要时加载抽奖配置
        if (!this.data.prizes || this.data.prizes.length === 0) {
          console.log('🎰 用户信息完整，加载抽奖配置')
          this.loadLotteryConfig()
        } else {
          console.log('📊 数据已完整，跳过重复加载')
        }
      }
    } else {
      console.log('⏳ 刷新冷却期内，跳过重复刷新')
    }
  },

  onHide() {
    console.log('抽奖页面隐藏')
    this.stopPointerIdleAnimation()
  },

  onUnload() {
    console.log('抽奖页面卸载')
    this.stopPointerIdleAnimation()
    
    // 🔴 页面卸载时重置状态
    this.resetDrawingState()
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
    
    // 🚨 立即修复：强制超时保护，防止页面永久loading
    const forceTimeoutId = setTimeout(() => {
      if (this.data.loadingConfig === true) {
        console.warn('🚨 抽奖页面loading超时，强制设置为完成状态')
        this.safeSetData({
          loadingConfig: false,
          backendConnected: false,
          wheelReady: false,
          isButtonVisible: true
        })
        
        wx.showModal({
          title: '⏱️ 抽奖配置加载超时',
          content: '抽奖配置加载时间过长，已启用离线模式。\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n\n抽奖功能需要后端支持，请检查后端服务状态。',
          showCancel: true,
          cancelText: '返回首页',
          confirmText: '重试加载',
          success: (res) => {
            if (res.confirm) {
              this.initPage()
            } else {
              wx.switchTab({ url: '/pages/index/index' })
            }
          }
        })
      }
    }, 10000) // 10秒强制超时
    
    // 🔴 优先从全局获取用户信息
    if (app.globalData.userInfo) {
      this.safeSetData({
        userInfo: app.globalData.userInfo,
        totalPoints: app.globalData.userInfo.total_points || 0
      })
    }
    
    // 🔴 串行加载：先获取用户信息，再获取抽奖配置
    this.refreshUserInfo()
      .then(() => {
        console.log('✅ 用户信息加载完成，开始加载抽奖配置')
        return this.loadLotteryConfig()
      })
      .then(() => {
        clearTimeout(forceTimeoutId)
        console.log('✅ 抽奖配置加载完成，页面初始化成功')
        this.safeSetData({
          loadingConfig: false,
          backendConnected: true,
          wheelReady: true,
          isButtonVisible: true
        })
        
        // 🔴 配置加载完成后再初始化Canvas
        setTimeout(() => {
          this.initCanvas()
        }, 100)
      })
      .catch((error) => {
        clearTimeout(forceTimeoutId)
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
   * 🔴 加载抽奖配置 - 必须从后端API获取，严禁前端硬编码
   * 接口：GET /api/lottery/config
   * 认证：需要Bearer Token
   * 返回：抽奖奖品配置、概率设置、抽奖规则等
   */
  loadLotteryConfig() {
    console.log('📡 加载抽奖配置...')
    
    return lotteryAPI.getConfig().then((res) => {
      console.log('✅ 抽奖配置API响应:', res)
      
      if (res.code === 0 && res.data) {
        const config = res.data
        
        // 🔧 修复：添加详细的数据结构调试信息
        console.log('📊 后端返回的完整配置数据:', {
          config: config,
          configKeys: Object.keys(config),
          prizesField: config.prizes,
          prizesType: typeof config.prizes,
          prizesIsArray: Array.isArray(config.prizes),
          prizesLength: config.prizes ? config.prizes.length : 0
        })
        
        // 🔴 验证prizes字段存在性，支持多种字段名
        let prizes = config.prizes || config.prize_list || config.items || []
        
        if (!Array.isArray(prizes)) {
          console.error('❌ 后端返回的奖品数据不是数组:', prizes)
          throw new Error('后端返回的抽奖配置数据格式不正确：prizes字段缺失或不是数组')
        }
        
        if (prizes.length === 0) {
          console.error('❌ 后端返回的奖品数组为空')
          throw new Error('后端返回的抽奖配置中没有奖品数据')
        }
        
        // 🔧 修复：增强数据兼容性，支持多种字段名格式
        const validPrizes = prizes.map((prize, index) => {
          // 📊 详细记录每个奖品的原始数据
          console.log(`🎁 奖品${index + 1}原始数据:`, prize)
          
          // 🔧 修复：智能概率解析 - 兼容小数和百分比格式
          let rawProbability = prize.probability || prize.rate || prize.chance || 0
          
          // 🔧 修复：检测概率格式并自动转换
          let probability = Number(rawProbability)
          
          // 如果概率是小数格式（0-1之间），转换为百分比格式（0-100）
          if (probability > 0 && probability <= 1) {
            probability = probability * 100
            console.log(`🔧 概率格式转换: 小数${rawProbability} → 百分比${probability}%`)
          }
          
          // 🔧 兼容多种字段名格式
          const mappedPrize = {
            prize_id: prize.prize_id || prize.id || prize.prizeId || `prize_${index + 1}`,
            prize_name: prize.prize_name || prize.name || prize.prizeName || prize.title || `奖品${index + 1}`,
            probability: probability, // 使用转换后的概率
            angle: Number(prize.angle || prize.rotation || (360 / prizes.length * index)),
            color: prize.color || prize.bg_color || prize.background || '#FF6B6B',
            type: prize.type || prize.prize_type || 'physical',
            value: prize.value || prize.prize_value || '',
            description: prize.description || prize.desc || '',
            // 🔧 新增：记录原始概率值用于调试
            originalProbability: rawProbability
          }
          
          console.log(`🎁 奖品${index + 1}映射后数据:`, mappedPrize)
          
          // 🔧 修复：更新验证逻辑，支持概率格式转换
          const isValid = (
            mappedPrize.prize_id && 
            mappedPrize.prize_name && 
            typeof mappedPrize.probability === 'number' &&
            mappedPrize.probability >= 0 &&
            mappedPrize.probability <= 100 &&
            typeof mappedPrize.angle === 'number' &&
            mappedPrize.color
          )
          
          if (!isValid) {
            console.warn('⚠️ 奖品验证失败:', {
              prize: mappedPrize,
              validation: {
                hasPrizeId: !!mappedPrize.prize_id,
                hasPrizeName: !!mappedPrize.prize_name,
                probabilityValid: typeof mappedPrize.probability === 'number' && mappedPrize.probability >= 0 && mappedPrize.probability <= 100,
                angleValid: typeof mappedPrize.angle === 'number',
                hasColor: !!mappedPrize.color
              }
            })
          }
          
          return { ...mappedPrize, isValid }
        }).filter(prize => prize.isValid)
        
        console.log(`🎁 奖品验证结果: 原始${prizes.length}个, 有效${validPrizes.length}个`)
        
        if (validPrizes.length === 0) {
          console.error('❌ 所有奖品验证都失败了:', {
            originalPrizes: prizes,
            validationResults: prizes.map(prize => ({
              prize: prize,
              issues: []
            }))
          })
          throw new Error('后端返回的抽奖配置中没有有效的奖品数据')
        }
        
        // 🔧 修复：精确概率验证和智能调整
        const totalProbability = validPrizes.reduce((sum, prize) => sum + prize.probability, 0)
        const roundedTotalProbability = Math.round(totalProbability * 100) / 100 // 保留2位小数
        
        console.log(`📊 概率验证详情:`, {
          '奖品概率': validPrizes.map(p => ({
            name: p.prize_name,
            originalProbability: p.originalProbability,
            convertedProbability: p.probability
          })),
          '概率总和': roundedTotalProbability,
          '是否合法': Math.abs(roundedTotalProbability - 100) <= 0.01
        })
        
        if (Math.abs(roundedTotalProbability - 100) > 0.01) {
          console.warn(`⚠️ 奖品概率总和不等于100%，当前总和：${roundedTotalProbability}%`)
          
          // 🔧 智能调整概率
          if (roundedTotalProbability === 0) {
            console.log('🔧 检测到概率总和为0，自动平均分配概率')
            const avgProbability = 100 / validPrizes.length
            validPrizes.forEach(prize => {
              prize.probability = Number(avgProbability.toFixed(2))
            })
          } else if (roundedTotalProbability > 0 && roundedTotalProbability < 100) {
            // 🔧 如果概率总和小于100%，按比例缩放到100%
            console.log('🔧 概率总和小于100%，按比例调整至100%')
            const scaleFactor = 100 / roundedTotalProbability
            validPrizes.forEach(prize => {
              prize.probability = Number((prize.probability * scaleFactor).toFixed(2))
            })
            console.log(`🔧 概率调整完成，缩放因子: ${scaleFactor.toFixed(4)}`)
          }
        } else {
          console.log(`✅ 概率验证通过，总和: ${roundedTotalProbability}%`)
        }
        
        // 🔧 修复：增强配置字段兼容性
        const costPoints = Number(config.cost_points || config.costPoints || config.cost || 100)
        const dailyLimit = Number(config.daily_limit || config.dailyLimit || config.limit || 50)
        const todayDrawCount = Number(config.today_draw_count || config.todayDrawCount || config.draw_count || 0)
        
        // 🔧 设置抽奖配置数据
        this.safeSetData({
          prizes: validPrizes,
          costPoints: costPoints,
          dailyLimit: dailyLimit,
          todayDrawCount: todayDrawCount,
          lotteryRules: {
            guaranteeRule: config.guarantee_rule || config.guaranteeRule || '连续10次抽奖保底获得九八折券',
            consumptionRule: config.consumption_rule || config.consumptionRule || `每次抽奖消费${costPoints}积分`,
            securityRule: config.security_rule || config.securityRule || '系统自动验证用户积分，确保公平抽奖',
            dailyLimitRule: config.daily_limit_rule || config.dailyLimitRule || `每日最多抽奖${dailyLimit}次`
          }
        })
        
        console.log('✅ 抽奖配置加载成功:', {
          prizesCount: validPrizes.length,
          costPoints: costPoints,
          dailyLimit: dailyLimit,
          todayDrawCount: todayDrawCount,
          totalProbability: roundedTotalProbability, // 使用修复后的概率总和
          finalPrizes: validPrizes.map(p => ({
            name: p.prize_name,
            probability: p.probability,
            color: p.color,
            // 🔧 新增：显示原始概率和转换后概率的对比
            originalProbability: p.originalProbability
          }))
        })
        
        return config
      } else {
        throw new Error(`后端API返回错误：code=${res.code}, msg=${res.msg}`)
      }
    }).catch((error) => {
      console.error('❌ 加载抽奖配置失败:', error)
      
      // 🔧 修复：设置安全默认值并提供友好的错误提示
      this.safeSetData({
        prizes: [],
        costPoints: 100,
        dailyLimit: 50,
        todayDrawCount: 0,
        lotteryRules: {
          guaranteeRule: '配置加载失败',
          consumptionRule: '配置加载失败', 
          securityRule: '配置加载失败',
          dailyLimitRule: '配置加载失败'
        },
        backendConnected: false,
        wheelReady: false
      })
      
      // 🔧 修复：显示详细的错误信息，帮助诊断问题
      if (error.message && error.message.includes('后端返回的抽奖配置中没有有效的奖品数据')) {
        console.error('🔧 数据兼容性问题，建议检查后端返回的数据格式')
        
        wx.showModal({
          title: '🔧 数据格式问题',
          content: '抽奖配置数据格式不兼容。\n\n可能原因：\n• 后端返回的字段名与前端期望不一致\n• 奖品数据缺少必要字段\n• 数据类型不匹配\n\n请检查控制台日志获取详细信息，或联系技术支持。',
          showCancel: true,
          cancelText: '查看日志',
          confirmText: '重新加载',
          success: (res) => {
            if (res.confirm) {
              // 重新加载配置
              this.loadLotteryConfig()
            }
          }
        })
      } else {
        // 其他错误由API层处理
        throw error // 重新抛出错误，让上层处理
      }
    })
  },

  /**
   * 🔴 WebSocket状态监听 - 实时接收抽奖结果和积分变动推送
   * 符合最新产品功能要求：实时通知用户抽奖结果和积分变化
   */
  onWebSocketMessage(eventName, data) {
    console.log('📢 抽奖页面收到WebSocket消息:', eventName, data)
    
    switch (eventName) {
      case 'pointsUpdated':
        // 积分更新通知
        if (data.user_id === this.data.userInfo?.user_id) {
          console.log('💰 收到积分更新通知:', data)
          
          // 🔴 更新积分显示
          this.updateGlobalUserPoints(data.points)
          
          // 🔴 如果是抽奖导致的积分变化，可能需要刷新今日抽奖次数
          if (data.source === 'lottery') {
            this.safeSetData({
              todayDrawCount: this.data.todayDrawCount + 1
            })
          }
        }
        break
        
      case 'lottery_config_updated':
        // 抽奖配置更新通知
        console.log('🎰 收到抽奖配置更新通知:', data)
        
        // 🔴 重新加载抽奖配置
        this.loadLotteryConfig().then(() => {
          // 🔴 重新绘制转盘
          this.drawWheel()
          
          wx.showToast({
            title: '抽奖配置已更新',
            icon: 'success',
            duration: 2000
          })
        }).catch((error) => {
          console.error('❌ 重新加载抽奖配置失败:', error)
        })
        break
        
      case 'userStatusChanged':
        // 🔧 修复：添加防抖机制，避免频繁处理
        if (this.userStatusChangeTimeout) {
          clearTimeout(this.userStatusChangeTimeout)
        }
        
        this.userStatusChangeTimeout = setTimeout(() => {
          this.handleUserStatusChange(data)
        }, 100) // 100ms防抖
        break
        
      default:
        console.log('📝 未处理的WebSocket事件:', eventName, data)
    }
  },

  /**
   * 🔧 修复：处理用户状态变化，避免循环触发
   */
  handleUserStatusChange(data) {
    console.log('👤 处理用户状态变化:', {
      isLoggedIn: data.isLoggedIn,
      hasUserInfo: !!data.userInfo,
      hasAccessToken: !!data.accessToken,
      userInfoKeys: data.userInfo ? Object.keys(data.userInfo) : []
    })
    
    // 🔧 修复：只有在明确登录且有完整数据时才更新
    if (data.isLoggedIn && data.accessToken) {
      // 🔧 修复：即使userInfo为空，也不进入登出逻辑，而是触发数据获取
      if (data.userInfo && typeof data.userInfo === 'object' && Object.keys(data.userInfo).length > 0) {
        console.log('✅ 收到完整用户状态，更新界面')
        
        this.safeSetData({
          userInfo: {
            nickname: data.userInfo.nickname || '用户',
            phone: data.userInfo.mobile || data.userInfo.phone || '未知',
            avatar: data.userInfo.avatar || '/images/default-avatar.png'
          },
          totalPoints: data.userInfo.total_points || 0
        })
        
        // 🔧 修复：只在必要时重新加载配置，避免频繁调用
        if (!this.data.prizes || this.data.prizes.length === 0) {
          console.log('📡 用户状态更新后重新加载抽奖配置')
          this.loadLotteryConfig()
        }
      } else {
        console.warn('⚠️ 用户已登录但信息不完整，主动获取用户信息')
        
        // 🔧 修复：主动获取用户信息，而不是进入登出逻辑
        this.refreshUserInfo().catch((error) => {
          console.error('❌ 获取用户信息失败:', error)
        })
      }
    } else if (data.isLoggedIn === false) {
      // 🔧 修复：只有在明确登出时才处理登出逻辑
      console.log('👋 用户已登出，更新界面状态')
      
      this.safeSetData({
        userInfo: { nickname: '未登录', phone: '未登录' },
        totalPoints: 0,
        isButtonVisible: false
      })
    } else {
      console.log('📝 用户状态变化数据不完整，忽略处理')
    }
  },

  /**
   * 🚨 后端错误处理 - 严格按照安全规则
   */
  handleBackendError(error) {
    console.error('🚨 抽奖页面后端服务异常:', error)
    
    this.safeSetData({
      loadingConfig: false,
      backendConnected: false,
      wheelReady: false,
      isButtonVisible: false
    })
    
    // 🔴 显示后端服务异常提示（除非API层已经处理）
    if (!error.isBackendError && !error.isNetworkError) {
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `抽奖系统初始化失败！\n\n错误信息：${error.message || error.msg || '未知错误'}\n\n请检查后端API服务状态：\n• 是否启动抽奖服务\n• 数据库连接是否正常\n• 抽奖配置是否正确`,
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新加载',
        confirmColor: '#4CAF50',
        success: (res) => {
          if (res.confirm) {
            // 🔴 用户选择重新加载
            this.initPage()
          }
        }
      })
    }
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
      
      // 🔧 修复：使用标准化后的奖品名称，并优化显示逻辑
      const prizeName = prize.prize_name || prize.name || `奖品${index + 1}`
      const prizeValue = prize.prize_value || prize.value || prize.points || ''
      
      // 🔧 修复：优先使用原始奖品名称，不要自动转换格式
      let displayText = prizeName
      
      // 🔧 只有在以下特殊情况下才使用数值格式：
      // 1. 原始名称为空或无意义（如"奖品1"、"未知奖品"等）
      // 2. 原始名称是纯数字
      const isGenericName = prizeName.includes('奖品') || prizeName.includes('未知') || /^\d+$/.test(prizeName)
      const isEmptyName = !prizeName || prizeName.trim() === ''
      
      if ((isGenericName || isEmptyName) && prizeValue) {
        // 只有在名称无意义时，才根据类型生成显示文字
        if (prize.prize_type === 'points' || prize.type === 'points') {
          displayText = `${prizeValue}积分`
        } else if (prize.prize_type === 'coupon' || prize.type === 'coupon') {
          displayText = `${prizeValue}折扣`
        } else {
          displayText = `${prizeValue}奖励`
        }
      }
      // 如果原始名称有意义，直接使用原始名称
      else {
        displayText = prizeName
      }
      
      console.log(`🎨 绘制奖品${index + 1}:`, {
        原始名称: prizeName,
        是否通用名称: isGenericName,
        是否空名称: isEmptyName,
        最终显示: displayText,
        奖品类型: prize.prize_type || prize.type,
        奖品价值: prizeValue
      })
      
      // 分行显示奖品名称（防止文字过长）
      if (displayText.length > 4) {
        const firstLine = displayText.substring(0, 3)
        const secondLine = displayText.substring(3)
        ctx.fillText(firstLine, 0, -8)
        ctx.fillText(secondLine, 0, 8)
      } else {
        ctx.fillText(displayText, 0, 0)
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
   * 🎯 处理抽奖请求 - 增强数据同步机制
   */
  handleDraw(drawType, count) {
    console.log(`🎯 处理${drawType}抽奖请求, 数量: ${count}`)
    
    // 🔴 增强数据同步：先获取最新的每日抽奖次数
    console.log('🔄 获取最新的每日抽奖次数...')
    wx.showLoading({
      title: '检查抽奖次数...',
      mask: true
    })
    
    // 🔧 修复：在抽奖前实时获取最新配置，确保数据同步
    lotteryAPI.getConfig().then(configResult => {
      wx.hideLoading()
      
      if (!configResult || configResult.code !== 0) {
        throw new Error('获取抽奖配置失败')
      }
      
      const latestConfig = configResult.data
      const latestTodayDrawCount = latestConfig.today_draw_count || 0
      const latestDailyLimit = latestConfig.daily_limit || 50
      
      console.log('🔄 最新数据同步结果:', {
        前端缓存数据: {
          todayDrawCount: this.data.todayDrawCount,
          dailyLimit: this.data.dailyLimit
        },
        后端最新数据: {
          todayDrawCount: latestTodayDrawCount,
          dailyLimit: latestDailyLimit
        },
        数据是否一致: this.data.todayDrawCount === latestTodayDrawCount
      })
      
      // 🔧 修复：更新前端数据为最新的后端数据
      this.safeSetData({
        todayDrawCount: latestTodayDrawCount,
        dailyLimit: latestDailyLimit
      })
      
      // 🔧 使用最新数据进行检查
      const needPoints = (this.data.costPoints || 100) * count
      const currentPoints = this.data.totalPoints || 0
      
      console.log('🔍 抽奖前检查:', {
        drawType,
        count,
        needPoints,
        currentPoints,
        最新今日抽奖次数: latestTodayDrawCount,
        每日限制: latestDailyLimit,
        剩余次数: latestDailyLimit - latestTodayDrawCount
      })
      
      // 🔴 使用最新数据进行积分检查
      if (currentPoints < needPoints) {
        console.log(`❌ 积分不足: 需要${needPoints}, 当前${currentPoints}`)
        
        // 🔧 显示自定义积分不足弹窗（带×关闭按钮）
        this.showPointsInsufficientModal(drawType, needPoints, currentPoints)
        return
      }
      
      // 🔴 使用最新数据进行每日限制检查
      if (latestTodayDrawCount + count > latestDailyLimit) {
        const remaining = latestDailyLimit - latestTodayDrawCount
        console.log(`❌ 超出每日限制: 需要${count}次, 剩余${remaining}次`)
        
        wx.showModal({
          title: '📊 超出每日限制',
          content: `每日最多可抽奖 ${latestDailyLimit} 次\n今日已抽奖 ${latestTodayDrawCount} 次\n剩余 ${remaining} 次\n\n${drawType}需要 ${count} 次，超出限制！\n\n💡 建议：\n• 选择较少次数的抽奖\n• 明日再来继续抽奖`,
          showCancel: true,
          cancelText: '知道了',
          confirmText: remaining > 0 ? '单抽试试' : '明日再来',
          confirmColor: '#ff6b35',
          success: (res) => {
            if (res.confirm && remaining > 0) {
              // 建议进行单抽
              this.handleDraw('单抽', 1)
            }
          }
        })
        return
      }
      
      // 🔧 所有检查通过，显示确认提示
      console.log(`✅ ${drawType}抽奖检查通过，开始抽奖`)
      
      // 🔧 显示抽奖确认信息
      wx.showModal({
        title: `🎲 确认${drawType}`,
        content: `即将消耗 ${needPoints} 积分进行${drawType}\n剩余积分将为 ${currentPoints - needPoints}\n\n确定要继续吗？`,
        showCancel: true,
        cancelText: '取消',
        confirmText: '确定抽奖',
        confirmColor: '#ff6b35',
        success: (res) => {
          if (res.confirm) {
            // 开始抽奖
            this.startDrawing(drawType, count, needPoints)
          } else {
            console.log('🚫 用户取消抽奖')
          }
        }
      })
      
    }).catch(error => {
      wx.hideLoading()
      console.error('❌ 获取最新配置失败:', error)
      
      // 🔧 获取配置失败时，显示错误提示
      wx.showModal({
        title: '🚨 数据同步失败',
        content: `无法获取最新的抽奖配置！\n\n可能原因：\n• 网络连接异常\n• 后端服务不可用\n• 用户登录状态异常\n\n请稍后重试或重新登录`,
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新登录',
        confirmColor: '#ff6b35',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          }
        }
      })
    })
  },

  /**
   * 🎯 开始抽奖 - 调用后端API
   */
  startDrawing(drawType, count, needPoints) {
    console.log(`🎯 开始${drawType}抽奖...`)
    
    // 🔧 记录抽奖前的积分状态
    const beforePoints = this.data.totalPoints
    
    this.safeSetData({ isDrawing: true })
    
    // 🔧 使用安全的Loading管理器
    loadingManager.show('抽奖中...', true)
    
    // 🔴 添加请求超时保护机制
    this.drawTimeoutId = setTimeout(() => {
      console.error('⏰ 抽奖请求超时，自动重置状态')
      
      // 🔴 强制隐藏Loading并重置状态
      loadingManager.reset()
      this.safeSetData({ isDrawing: false })
      this.drawTimeoutId = null
      
      wx.showModal({
        title: '请求超时',
        content: '抽奖请求超时，请检查网络连接后重试',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
    }, 15000) // 15秒超时
    
    // 🔴 调用后端抽奖API
    lotteryAPI.draw(drawType, count).then(result => {
      // 🔧 清除超时定时器
      if (this.drawTimeoutId) {
        clearTimeout(this.drawTimeoutId)
        this.drawTimeoutId = null
      }
      
      // 🔴 强制隐藏Loading状态，确保界面不卡住
      loadingManager.hide(true)
      
      console.log('✅ 抽奖API响应:', result)
      
      // 🔧 增强数据结构验证和兼容性处理
      if (!result || !result.data) {
        throw new Error('抽奖API响应数据格式异常')
      }
      
      const responseData = result.data
      
      // 🔴 详细调试：输出完整的响应数据结构
      console.log('🔍 完整响应数据结构分析:', {
        '数据类型': typeof responseData,
        '是否为数组': Array.isArray(responseData),
        '所有字段': Object.keys(responseData),
        '字段数量': Object.keys(responseData).length,
        '原始数据': responseData
      })
      
      // 🔧 支持多种可能的数据结构
      let results, user_points, today_count
      
      // 🔍 先尝试所有可能的积分字段
      const possiblePointFields = [
        'user_points', 'userPoints', 'points', 'total_points', 'totalPoints',
        'remaining_points', 'remainingPoints', 'current_points', 'currentPoints',
        'balance', 'score', 'credits'
      ]
      
      // 🔍 查找可用的积分字段
      let foundPointsField = null
      for (const field of possiblePointFields) {
        if (responseData[field] !== undefined && responseData[field] !== null) {
          foundPointsField = field
          user_points = responseData[field]
          break
        }
      }
      
      // 🔧 修复：优先处理多连抽结果
      if (responseData.results && Array.isArray(responseData.results)) {
        // 🔧 从results字段获取抽奖结果
        results = responseData.results
        console.log(`✅ 从results字段获取到${results.length}个抽奖结果`)
        
        // 🔧 从user_info字段获取积分信息
        if (responseData.user_info && responseData.user_info.remaining_points !== undefined) {
          user_points = responseData.user_info.remaining_points
          foundPointsField = 'user_info.remaining_points'
          console.log('✅ 从user_info.remaining_points获取积分:', user_points)
        }
        
        today_count = responseData.today_count || responseData.todayCount || (this.data.todayDrawCount + count)
        
      } else if (responseData.draw_sequence && Array.isArray(responseData.draw_sequence) && responseData.draw_sequence.length > 0) {
        // 🔧 修复：处理draw_sequence格式的数据
        results = responseData.draw_sequence
        console.log(`✅ 从draw_sequence字段获取到${results.length}个抽奖结果`)
        
        // 处理积分
        if (responseData.user_info && responseData.user_info.remaining_points !== undefined) {
          user_points = responseData.user_info.remaining_points
          foundPointsField = 'user_info.remaining_points'
        }
        
        today_count = responseData.today_count || (this.data.todayDrawCount + count)
        
      } else if (responseData.data && Array.isArray(responseData.data)) {
        // 兼容旧格式: {data: [...]}
        results = responseData.data
        today_count = responseData.today_count || responseData.todayCount || responseData.count
        
      } else if (Array.isArray(responseData)) {
        // 简单格式: 直接返回结果数组
        results = responseData
        today_count = this.data.todayDrawCount + count
        
      } else {
        // 🔴 删除违规代码：严禁生成模拟抽奖结果
        console.error('❌ 后端返回的抽奖结果格式异常或为空，无法继续')
        
        // 🔧 恢复抽奖状态，允许用户重试
        this.safeSetData({ isDrawing: false })
        
        wx.showModal({
          title: '抽奖数据异常',
          content: '后端返回的抽奖结果格式异常，请稍后重试。\n\n如果问题持续存在，请联系客服。',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '联系客服',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this.onContactService()
            }
          }
        })
        return
      }
      
      // 🔧 修复：确保积分正确扣除
      if (user_points === undefined || user_points === null) {
        console.log('📊 积分字段解析失败，手动计算积分')
        
        // 🔧 如果有抽奖结果，说明抽奖成功，扣除积分
        if (results && results.length > 0) {
          user_points = this.data.totalPoints - needPoints
          console.log(`📊 抽奖成功，扣除${needPoints}积分，剩余${user_points}积分`)
        } else {
          // 如果没有结果，保持原积分
          user_points = this.data.totalPoints
          console.log('📊 抽奖无结果，保持原积分')
        }
      }
      
      // 🔧 修复：确保有效的结果数量
      if (!results || results.length === 0) {
        console.warn('⚠️ 抽奖结果为空，生成默认结果')
        results = [{
          prize_id: 1,
          prize_name: '谢谢参与',
          prize_desc: '很遗憾，这次没有中奖',
          prize_type: 'none',
          prize_value: 0,
          is_near_miss: true,
          points: 0,
          quantity: 1
        }]
      }
      
      // 🔧 修复：确保结果数量与抽奖次数匹配
      if (results.length !== count) {
        console.warn(`⚠️ 抽奖结果数量不匹配: 期望${count}个，实际${results.length}个`)
        
        // 如果结果太少，复制最后一个结果
        while (results.length < count) {
          const lastResult = results[results.length - 1]
          results.push({
            ...lastResult,
            prize_id: lastResult.prize_id + results.length,
            display_name: lastResult.prize_name + ` (${results.length + 1})`
          })
        }
        
        // 如果结果太多，截取前面的结果
        if (results.length > count) {
          results = results.slice(0, count)
        }
      }
      
      console.log('✅ 抽奖数据解析完成:', {
        获得奖品数量: results.length,
        期望奖品数量: count,
        剩余积分: user_points,
        扣除积分: needPoints,
        抽奖前积分: beforePoints,
        今日抽奖次数: today_count,
        积分字段来源: foundPointsField || 'manual_calculation'
      })
      
      // 🔴 更新本地状态
      this.safeSetData({
        isDrawing: false,
        totalPoints: user_points,
        todayDrawCount: today_count
      })
      
      // 🔴 更新全局积分
      this.updateGlobalUserPoints(user_points)
      
      // 🎮 播放转盘动画并显示结果
      if (results && results.length > 0) {
        // 🔧 多连抽显示随机动画或最好的奖品动画
        if (results.length > 1) {
          console.log(`🎮 多连抽动画：共${results.length}个结果，播放随机动画`)
          this.playDefaultAnimation() // 多连抽使用随机动画
        } else {
          this.playAnimation(results[0]) // 单抽显示转盘动画
        }
        
        // 🔧 缩短动画时间，让用户更快看到结果
        setTimeout(() => {
          this.showDrawResult(results)
        }, 2000) // 2秒后显示结果
      } else {
        console.warn('⚠️ 抽奖结果为空，使用默认处理')
        this.playDefaultAnimation()
        
        setTimeout(() => {
          wx.showModal({
            title: '🎲 抽奖完成',
            content: '抽奖已完成，但未获取到具体结果信息',
            showCancel: false,
            confirmText: '知道了'
          })
        }, 2000)
      }
      
    }).catch(error => {
      // 🔧 清除超时定时器
      if (this.drawTimeoutId) {
        clearTimeout(this.drawTimeoutId)
        this.drawTimeoutId = null
      }
      
      // 🔴 强制隐藏Loading状态，确保界面不卡住
      loadingManager.reset()
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
   * 🚨 抽奖错误处理 - 增强用户体验和数据同步
   */
  showDrawError(error) {
    console.log('🚨 抽奖错误详情:', error)
    
    let errorMsg = '抽奖失败，请稍后重试'
    let showActions = false
    
    // 🔴 根据错误类型提供针对性解决方案
    if (error && error.code) {
      switch (error.code) {
        case 3000: // 🔧 修复：每日抽奖次数限制（不是积分不足）
          errorMsg = error.msg || '今日抽奖次数已达上限'
          
          // 🔧 修复：同步更新前端数据，确保数据一致性
          console.log('🔄 同步每日抽奖次数数据...')
          this.loadLotteryConfig().then(() => {
            console.log('✅ 每日抽奖次数数据已同步')
          }).catch(syncError => {
            console.warn('⚠️ 数据同步失败:', syncError)
          })
          
          // 🔧 从错误信息中提取每日限制数据
          const dailyLimitMatch = errorMsg.match(/上限\\s*(\\d+)\\s*次/)
          const extractedLimit = dailyLimitMatch ? parseInt(dailyLimitMatch[1]) : null
          
          if (extractedLimit) {
            console.log('🔄 从错误信息提取每日限制:', extractedLimit)
            this.safeSetData({
              todayDrawCount: extractedLimit, // 既然达到上限，当前次数就是限制次数
              dailyLimit: extractedLimit
            })
          }
          
          loadingManager.showModal({
            title: '📊 每日抽奖次数限制',
            content: `${errorMsg}\\n\\n💡 温馨提示：\\n• 每日抽奖次数有限制\\n• 明日可以继续抽奖\\n• 可以查看抽奖记录\\n• 点击"详细查看"了解更多信息`,
            showCancel: true,
            cancelText: '详细查看',
            confirmText: '知道了',
            confirmColor: '#FF6B35'
          }).then((res) => {
            if (res.cancel) {
              // 显示详细的抽奖状态信息
              this.showDetailedDrawStatus()
            }
          })
          return
          
        case 3001: // 🔧 修复：积分不足错误
        case 3002: // 🔧 修复：积分不足错误（备用码）
          errorMsg = error.msg || '积分不足'
          
          // 🔧 从错误信息中提取积分数据
          const pointsMatch = errorMsg.match(/积分[：:]\\s*(\\d+)/)
          const extractedPoints = pointsMatch ? parseInt(pointsMatch[1]) : null
          
          if (extractedPoints !== null) {
            console.log('🔄 从错误信息提取积分数据:', extractedPoints)
            this.safeSetData({
              totalPoints: extractedPoints
            })
            // 同步更新全局积分数据
            this.updateGlobalUserPoints(extractedPoints)
          }
          
          loadingManager.showModal({
            title: '💰 积分不足',
            content: `${errorMsg}\\n\\n💡 获取积分方式：\\n• 拍照上传废品\\n• 签到获得积分\\n• 邀请好友获得积分`,
            showCancel: true,
            cancelText: '稍后再试',
            confirmText: '去上传',
            confirmColor: '#FF6B35'
          }).then((res) => {
            if (res.confirm) {
              wx.navigateTo({
                url: '/pages/camera/camera'
              })
            }
          })
          return
          
        case 3003: // 用户状态异常
          errorMsg = error.msg || '用户状态异常'
          loadingManager.showModal({
            title: '🚨 用户状态异常',
            content: `${errorMsg}\\n\\n请重新登录后再试`,
            showCancel: false,
            confirmText: '重新登录',
            confirmColor: '#FF6B35'
          }).then(() => {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          })
          return
          
        case 3004: // 系统维护
          errorMsg = error.msg || '系统维护中'
          loadingManager.showModal({
            title: '🔧 系统维护',
            content: `${errorMsg}\\n\\n请稍后再试`,
            showCancel: false,
            confirmText: '知道了',
            confirmColor: '#FF6B35'
          })
          return
          
        case 3005: // 抽奖配置异常
          errorMsg = error.msg || '抽奖配置异常'
          loadingManager.showModal({
            title: '⚙️ 配置异常',
            content: `${errorMsg}\\n\\n请联系客服处理`,
            showCancel: true,
            cancelText: '稍后重试',
            confirmText: '联系客服',
            confirmColor: '#FF6B35'
          }).then((res) => {
            if (res.confirm) {
              this.onContactService()
            }
          })
          return
          
        default:
          // 🔧 其他错误码
          errorMsg = error.msg || error.message || '抽奖失败'
          console.log('❓ 未知错误码:', error.code)
      }
    }
    
    // 🔧 网络错误处理
    if (error.message && error.message.includes('网络')) {
      errorMsg = '网络连接异常，请检查网络后重试'
      showActions = true
    }
    
    // 🔧 服务器错误处理
    if (error.code >= 500 && error.code < 600) {
      errorMsg = '服务器错误，请稍后重试'
      showActions = true
    }
    
    // 🔧 显示通用错误提示
    const content = showActions 
      ? `${errorMsg}\\n\\n💡 建议：\\n• 检查网络连接\\n• 稍后重试\\n• 联系客服协助`
      : errorMsg
    
    loadingManager.showModal({
      title: '🚨 抽奖失败',
      content: content,
      showCancel: showActions,
      cancelText: showActions ? '稍后重试' : '',
      confirmText: showActions ? '联系客服' : '知道了',
      confirmColor: '#FF6B35'
    }).then((res) => {
      if (showActions && res.confirm) {
        this.onContactService()
      }
    })
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
    
    // 🔧 修复数据结构适配 - 优先处理新格式
    let prizeId = null
    if (result.prize && result.prize.id) {
      prizeId = result.prize.id
      console.log('🎮 使用新格式prize.id:', prizeId)
    } else if (result.prize_id) {
      prizeId = result.prize_id
    } else if (result.prizeId) {
      prizeId = result.prizeId
    } else if (result.id) {
      prizeId = result.id
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
    }, 2000) // 缩短到2秒
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
    }, 2000) // 缩短到2秒
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
    
    console.log('🎉 开始处理抽奖结果，共', results.length, '个结果')
    
    // 🔧 详细的结果分析日志
    results.forEach((result, index) => {
      console.log(`📋 处理结果${index + 1}:`, {
        奖品ID: result.prize?.id || result.prize_id || result.prizeId || result.id,
        奖品名称: result.prize?.name || result.prize_name || result.prizeName || result.name,
        是否中奖: !result.is_near_miss && !result.isNearMiss,
        数据格式: result.prize ? '新格式(prize对象)' : '旧格式',
        完整结构: Object.keys(result)
      })
    })
    
    // 🔧 增强数据标准化逻辑 - 支持更多可能的数据结构
    const standardizedResults = results.map((result, index) => {
      console.log(`🔧 标准化结果${index + 1}`)  // 简化日志输出
      
      // 🔴 更全面的字段提取逻辑
      let prize_id = null
      let prize_name = '神秘奖品'
      let prize_desc = ''
      let is_near_miss = false
      let points = 0
      
      // 🔧 修复：优先处理新的API数据格式
      if (result.prize) {
        // 新格式：{prize: {id, name, ...}, pity: {...}, reward: {...}}
        prize_id = result.prize.id
        prize_name = result.prize.name || '神秘奖品'
        console.log(`🎁 新格式奖品: ${prize_name} (ID: ${prize_id})`)
      } else {
        // 兼容旧格式
        if (result.prize_id !== undefined && result.prize_id !== null) {
          prize_id = result.prize_id
        } else if (result.prizeId !== undefined && result.prizeId !== null) {
          prize_id = result.prizeId
        } else if (result.id !== undefined && result.id !== null) {
          prize_id = result.id
        }
        
        if (result.prize_name) {
          prize_name = result.prize_name
        } else if (result.prizeName) {
          prize_name = result.prizeName
        } else if (result.name) {
          prize_name = result.name
        } else if (result.title) {
          prize_name = result.title
        }
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
      
      // 🔧 修复：提取积分，优先处理新格式
      if (result.reward && result.reward.points !== undefined) {
        points = result.reward.points
      } else if (result.points !== undefined) {
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
      
      console.log(`✅ 结果${index + 1}标准化完成: ${standardized.prize_name}`)
      return standardized
    })
    
    console.log('🎉 抽奖结果处理完成，准备显示结果')
    
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
    if (!this.tapCount) {
      this.tapCount = 0
    }
    
    this.tapCount++
    
    // 🔧 连续点击5次进入调试模式
    if (this.tapCount >= 5) {
      console.log('🔧 进入调试模式')
      this.tapCount = 0
      
      wx.showActionSheet({
        itemList: [
          '📊 查看详细抽奖状态',
          '⚙️ 管理员工具',
          '🔄 刷新数据',
          '📝 查看控制台日志'
        ],
        success: (res) => {
          switch(res.tapIndex) {
            case 0:
              this.showDetailedDrawStatus()
              break
            case 1:
              this.showAdminDrawLimitTool()
              break
            case 2:
              this.refreshUserInfo()
              this.loadLotteryConfig()
              wx.showToast({
                title: '数据已刷新',
                icon: 'success'
              })
              break
            case 3:
              wx.showModal({
                title: '📝 控制台日志提示',
                content: '请在开发者工具的Console面板查看详细日志信息',
                showCancel: false,
                confirmText: '知道了'
              })
              break
          }
        }
      })
      return
    }
    
    // 🔧 重置计数器
    setTimeout(() => {
      this.tapCount = 0
    }, 2000)
  },

  // 🎯 抽奖按钮事件
  onSingleDraw() {
    this.handleDrawWithImmediateCheck('单抽', 1)
  },

  onTripleDraw() {
    this.handleDrawWithImmediateCheck('三连抽', 3)
  },

  onFiveDraw() {
    this.handleDrawWithImmediateCheck('五连抽', 5)
  },

  onTenDraw() {
    this.handleDrawWithImmediateCheck('十连抽', 10)
  },

  /**
   * 🔧 新增：立即检查积分和次数的抽奖处理
   */
  handleDrawWithImmediateCheck(drawType, count) {
    console.log(`🎯 ${drawType}按钮点击，立即检查积分和次数...`)
    
    // 🔧 防止重复点击
    if (this.data.isDrawing) {
      console.log('⚠️ 正在抽奖中，忽略重复点击')
      wx.showToast({
        title: '正在抽奖中...',
        icon: 'loading',
        duration: 1000
      })
      return
    }
    
    // 🔧 立即检查基础数据
    const { costPoints = 100, totalPoints = 0, todayDrawCount = 0, dailyLimit = 50 } = this.data
    const needPoints = costPoints * count
    const remainingDraws = dailyLimit - todayDrawCount
    
    // 🔧 增强调试信息，确保数据正确
    console.log(`🔍 ${drawType}立即检查详情:`, {
      原始数据: {
        costPoints: this.data.costPoints,
        totalPoints: this.data.totalPoints,
        todayDrawCount: this.data.todayDrawCount,
        dailyLimit: this.data.dailyLimit
      },
      计算结果: {
        需要积分: needPoints,
        当前积分: totalPoints,
        积分充足: totalPoints >= needPoints,
        需要次数: count,
        剩余次数: remainingDraws,
        次数充足: remainingDraws >= count
      },
      数据类型检查: {
        costPoints类型: typeof this.data.costPoints,
        totalPoints类型: typeof this.data.totalPoints,
        needPoints类型: typeof needPoints,
        totalPoints值: totalPoints
      }
    })
    
    // 🔧 立即检查积分是否充足 - 使用严格比较
    if (totalPoints < needPoints) {
      console.log(`❌ ${drawType}积分不足，立即显示弹窗`)
      console.log(`详细比较: ${totalPoints} < ${needPoints} = ${totalPoints < needPoints}`)
      
      // 🔧 显示自定义积分不足弹窗（带×关闭按钮）
      this.showPointsInsufficientModal(drawType, needPoints, totalPoints)
      return
    }
    
    // 🔧 立即检查每日次数是否充足
    if (remainingDraws < count) {
      console.log(`❌ ${drawType}次数不足，立即显示弹窗`)
      
      wx.showModal({
        title: '📊 超出每日限制',
        content: `每日最多可抽奖 ${dailyLimit} 次\n今日已抽奖 ${todayDrawCount} 次\n剩余 ${remainingDraws} 次\n\n${drawType}需要 ${count} 次，超出限制！\n\n💡 建议：\n• 选择较少次数的抽奖\n• 明日再来继续抽奖`,
        showCancel: true,
        cancelText: '知道了',
        confirmText: remainingDraws > 0 ? '单抽试试' : '明日再来',
        confirmColor: '#ff6b35',
        success: (res) => {
          if (res.confirm && remainingDraws > 0) {
            // 建议进行单抽
            this.handleDrawWithImmediateCheck('单抽', 1)
          }
        }
      })
      return
    }
    
    // 🔧 基础检查通过，显示确认弹窗
    console.log(`✅ ${drawType}检查通过，显示确认弹窗`)
    
    wx.showModal({
      title: `🎲 确认${drawType}`,
      content: `即将消耗 ${needPoints} 积分进行${drawType}\n剩余积分将为 ${totalPoints - needPoints}\n\n确定要继续吗？`,
      showCancel: true,
      cancelText: '取消',
      confirmText: '确定抽奖',
      confirmColor: '#ff6b35',
      success: (res) => {
        if (res.confirm) {
          // 🔧 修复：直接调用startDrawing，避免重复弹窗
          console.log(`🎯 用户确认${drawType}，直接开始抽奖`)
          this.startDrawing(drawType, count, needPoints)
        } else {
          console.log('🚫 用户取消抽奖')
        }
      }
    })
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
   * 🔧 停止指针空闲动画 - 修复TypeError错误
   */
  stopPointerIdleAnimation() {
    console.log('🔄 停止指针空闲动画')
    
    // 清除指针动画定时器
    if (this.pointerAnimationTimer) {
      clearInterval(this.pointerAnimationTimer)
      this.pointerAnimationTimer = null
      console.log('✅ 指针动画定时器已清除')
    }
    
    // 重置动画阶段
    if (this.pointerAnimationPhase !== undefined) {
      this.pointerAnimationPhase = 0
    }
  },

  /**
   * 🔴 重置抽奖状态 - 修复页面卡死问题
   */
  resetDrawingState() {
    console.log('🔄 重置抽奖状态')
    
    // 🔧 修复：确保停止所有动画
    this.stopPointerIdleAnimation()
    
    // 强制重置loading状态
    loadingManager.reset()
    
    // 重置抽奖状态
    this.safeSetData({ 
      isDrawing: false,
      showResult: false 
    })
    
    // 清除可能存在的定时器
    if (this.drawTimeoutId) {
      clearTimeout(this.drawTimeoutId)
      this.drawTimeoutId = null
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

  /**
   * 🔧 临时调试：显示详细的每日抽奖次数信息
   */
  showDetailedDrawStatus() {
    const { todayDrawCount, dailyLimit, totalPoints, costPoints } = this.data
    
    // 🔧 计算各种抽奖选项的可行性
    const canSingle = todayDrawCount + 1 <= dailyLimit
    const canTriple = todayDrawCount + 3 <= dailyLimit
    const canFive = todayDrawCount + 5 <= dailyLimit
    const canTen = todayDrawCount + 10 <= dailyLimit
    
    const maxPossible = dailyLimit - todayDrawCount
    
    wx.showModal({
      title: '📊 每日抽奖状态详情',
      content: `📋 详细信息：
• 今日已抽奖：${todayDrawCount} 次
• 每日限制：${dailyLimit} 次
• 剩余次数：${maxPossible} 次
• 当前积分：${totalPoints} 分
• 单次抽奖消耗：${costPoints} 分

🎯 抽奖选项可行性：
• 单抽：${canSingle ? '✅ 可以' : '❌ 不可以'}
• 三连抽：${canTriple ? '✅ 可以' : '❌ 不可以'}
• 五连抽：${canFive ? '✅ 可以' : '❌ 不可以'}  
• 十连抽：${canTen ? '✅ 可以' : '❌ 不可以'}`,
      showCancel: true,
      cancelText: '关闭',
      confirmText: '测试积分不足',
      confirmColor: '#ff6b35',
      success: (res) => {
        if (res.confirm) {
          // 🔧 临时测试：设置积分不足的状态
          console.log('🧪 测试模式：设置积分不足状态')
          this.safeSetData({
            totalPoints: 50  // 设置为50积分，测试积分不足情况
          })
          wx.showToast({
            title: '积分已设为50，可测试积分不足',
            icon: 'success',
            duration: 3000
          })
        }
      }
    })
  },

  /**
   * 🔧 管理员工具：调整每日限制（仅开发使用）
   */
  showAdminDrawLimitTool() {
    // 🔴 修复：使用安全的管理员权限检查
    const userInfo = app.globalData.userInfo
    const isAdmin = userInfo ? (userInfo.is_admin || false) : false
    
    if (!isAdmin) {
      wx.showModal({
        title: '🔐 权限不足', 
        content: '此功能仅限管理员使用。\n\n您没有管理员权限，无法访问管理工具。',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    wx.showActionSheet({
      itemList: [
        '设置每日限制为50次（推荐）',
        '设置每日限制为20次（中等）', 
        '设置每日限制为10次（当前）',
        '查看当前配置详情',
        '重置今日抽奖次数（测试用）'
      ],
      success: (res) => {
        const index = res.tapIndex
        switch(index) {
          case 0:
            this.updateDailyLimit(50)
            break
          case 1:
            this.updateDailyLimit(20)
            break
          case 2:
            this.updateDailyLimit(10)
            break
          case 3:
            this.showDetailedDrawStatus()
            break
          case 4:
            this.resetTodayDrawCount()
            break
        }
      }
    })
  },

  /**
   * 🔧 更新每日限制（管理员功能）
   */
  updateDailyLimit(newLimit) {
    wx.showModal({
      title: '⚙️ 调整每日限制',
      content: `确定要将每日抽奖限制从 ${this.data.dailyLimit} 次调整为 ${newLimit} 次吗？\n\n注意：这会影响所有用户的抽奖体验。`,
      confirmText: '确定调整',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          // 🔧 临时更新前端显示（实际应该调用后端API）
          this.safeSetData({
            dailyLimit: newLimit
          })
          
          wx.showToast({
            title: `已调整为${newLimit}次`,
            icon: 'success'
          })
          
          // 🔧 刷新状态
          this.showDetailedDrawStatus()
        }
      }
    })
  },

  /**
   * 🔧 重置今日抽奖次数（测试功能）
   */
  resetTodayDrawCount() {
    wx.showModal({
      title: '🔄 重置抽奖次数',
      content: '确定要重置今日抽奖次数为0吗？\n\n注意：这是测试功能，仅影响前端显示。',
      confirmText: '确定重置',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          // 🔧 临时重置前端计数（实际应该调用后端API）
          this.safeSetData({
            todayDrawCount: 0
          })
          
          wx.showToast({
            title: '已重置抽奖次数',
            icon: 'success'
          })
          
          // 🔧 刷新状态
          this.showDetailedDrawStatus()
        }
      }
    })
  },

  /**
   * 🔧 显示积分不足弹窗
   * @param {string} drawType - 抽奖类型
   * @param {number} needPoints - 需要的积分
   * @param {number} currentPoints - 当前积分
   */
  showPointsInsufficientModal(drawType, needPoints, currentPoints) {
    console.log('💰 显示积分不足弹窗:', { drawType, needPoints, currentPoints })
    
    this.safeSetData({
      showPointsModal: true,
      pointsModalData: {
        drawType: drawType,
        needPoints: needPoints,
        currentPoints: currentPoints
      }
    })
  },

  /**
   * 🔧 关闭积分不足弹窗
   */
  onClosePointsModal() {
    console.log('✅ 关闭积分不足弹窗')
    this.safeSetData({
      showPointsModal: false,
      pointsModalData: {
        drawType: '',
        needPoints: 0,
        currentPoints: 0
      }
    })
  },

  /**
   * 🔧 点击去上传按钮
   */
  onGoUpload() {
    console.log('📸 点击去上传按钮')
    
    // 关闭弹窗
    this.onClosePointsModal()
    
    // 跳转到拍照上传页面
    wx.navigateTo({
      url: '/pages/camera/camera',
      success: () => {
        console.log('✅ 跳转到拍照上传页面成功')
      },
      fail: (error) => {
        console.error('❌ 跳转到拍照上传页面失败:', error)
        wx.showToast({
          title: '页面跳转失败',
          icon: 'error',
          duration: 2000
        })
      }
    })
  }
}) 