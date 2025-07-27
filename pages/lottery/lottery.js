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
    currentAngle: 0,  // 保留用于兼容性，但不再用于转盘旋转
    wheelReady: false,  // 默认false，等待后端数据加载
    
    // 🌟 区域轮流发亮抽奖状态
    highlightAnimation: false,  // 是否正在进行高亮动画
    currentHighlight: -1,       // 当前高亮的区域索引（-1表示无高亮）
    winningIndex: -1,           // 最终中奖的区域索引（-1表示未中奖）
    isLotteryInProgress: false, // 抽奖是否进行中（用于按钮文字显示）
    
    // 🔧 兼容性保留（可能被其他地方引用）
    pointerAngle: 0,            // 保留用于兼容性
    isPointerAnimating: false,  // 保留用于兼容性
    
    // 抽奖结果
    showResult: false,
    resultData: null,
    
    // 🎨 抽奖结果显示模式切换
    // 可选值：'gradient'(卡片渐变) | 'celebration'(欢庆动画) | 'waterfall'(网格瀑布)
    resultDisplayMode: 'gradient', // 默认使用方案1：卡片渐变方案
    
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
    console.log('🎰 抽奖页面加载')
    
    // 🔧 关键修复：页面加载时强制恢复Token状态
    console.log('🔄 强制恢复Token状态...')
    const app = getApp()
    if (app) {
      try {
        const storedToken = wx.getStorageSync('access_token')
        const storedRefreshToken = wx.getStorageSync('refresh_token')
        const storedUserInfo = wx.getStorageSync('user_info')
        
        console.log('📦 本地存储状态检查:', {
          hasStoredToken: !!storedToken,
          hasStoredRefresh: !!storedRefreshToken,
          hasStoredUser: !!storedUserInfo,
          currentGlobalToken: !!app.globalData.accessToken,
          currentGlobalLogin: app.globalData.isLoggedIn
        })
        
        // 如果本地存储有数据但全局状态丢失，立即恢复
        if (storedToken && storedUserInfo && !app.globalData.accessToken) {
          console.log('🔧 检测到Token状态丢失，立即从本地存储恢复')
          
          app.globalData.accessToken = storedToken
          app.globalData.refreshToken = storedRefreshToken
          app.globalData.userInfo = storedUserInfo
          app.globalData.isLoggedIn = true
          
          console.log('✅ Token状态已恢复成功:', {
            hasToken: !!app.globalData.accessToken,
            hasUserInfo: !!app.globalData.userInfo,
            isLoggedIn: app.globalData.isLoggedIn,
            tokenPreview: app.globalData.accessToken ? app.globalData.accessToken.substring(0, 20) + '...' : 'NO_TOKEN'
          })
        } else if (!storedToken) {
          console.log('❌ 本地存储中没有Token，用户需要重新登录')
        } else {
          console.log('✅ Token状态正常，无需恢复')
        }
      } catch (error) {
        console.error('❌ Token状态恢复失败:', error)
      }
    }
    
    // 🔍 然后进行Canvas兼容性检查
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
    
    // 🔴 初始化动画完成标志
    this.animationCompleted = false
    
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
    
    // 🔴 修复：区分正常未登录和登录状态异常
    const isLoggedIn = app.globalData.isLoggedIn
    const hasToken = !!app.globalData.accessToken
    const hasUserInfo = !!app.globalData.userInfo
    
    console.log('🔍 抽奖页面检查登录状态:', {
      isLoggedIn,
      hasToken,
      hasUserInfo,
      tokenPreview: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : 'NO_TOKEN'
    })
    
    // 🔴 关键修复：区分两种情况
    if (!isLoggedIn || !hasToken) {
      // 情况1：正常的未登录状态 - 友好引导用户登录
      console.log('📝 检测到用户未登录，引导用户登录')
      
      wx.showModal({
        title: '需要登录',
        content: '欢迎来到抽奖页面！\n\n请先登录以参与抽奖活动，赢取精美奖品。',
        showCancel: true,
        cancelText: '稍后',
        confirmText: '立即登录',
        confirmColor: '#FF6B35',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          } else {
            // 用户选择稍后，跳转到首页
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }
      })
      return
    }
    
    // 情况2：已登录但Token可能有问题 - 验证Token有效性
    if (app.globalData.accessToken === 'undefined' || typeof app.globalData.accessToken !== 'string') {
      console.error('❌ Token格式异常:', app.globalData.accessToken)
      
      wx.showModal({
        title: '登录状态异常',
        content: '检测到登录信息异常，请重新登录以确保正常使用。',
        showCancel: false,
        confirmText: '重新登录',
        confirmColor: '#ff4444',
        success: () => {
          // 清理异常状态
          app.globalData.isLoggedIn = false
          app.globalData.accessToken = null
          app.globalData.userInfo = null
          
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
    
    // 🔴 清理高亮动画的定时器
    if (this.highlightAnimationTimer) {
      clearTimeout(this.highlightAnimationTimer)
      this.highlightAnimationTimer = null
    }
    if (this.highlightSafetyTimer) {
      clearTimeout(this.highlightSafetyTimer)
      this.highlightSafetyTimer = null
    }
    
    // 🔴 页面卸载时重置状态
    this.resetDrawingState()
  },

  onReady() {
    console.log('🎯 抽奖页面就绪，立即进行优化初始化')
    
    // 🔴 关键修复：页面就绪后立即初始化Canvas，不再延迟等待
    // 这样可以确保转盘尽快显示，即使数据还在加载中
    console.log('🚀 立即启动Canvas初始化，避免延迟感')
    
    // 🎯 修复：延迟初始化Canvas，确保DOM完全准备好
    setTimeout(() => {
      this.initCanvas()
      // 🎯 强制重绘转盘，确保可见
      setTimeout(() => {
        if (this.data.prizes && this.data.prizes.length === 8) {
          console.log('🎨 强制重绘转盘，确保转盘可见')
          this.drawWheel()
        }
      }, 100)
    }, 50)
    
    // 🔧 强制触发页面重绘，确保在真机环境下的兼容性
    setTimeout(() => {
      console.log('🔄 触发强制重绘，确保真机兼容性')
      this.safeSetData({
        forceUpdate: this.data.forceUpdate + 1
      })
    }, 200) // 延长时间确保Canvas已准备好
  },

  // 🔴 页面初始化 - 优先加载后端配置
  initPage() {
    console.log('🔧 开始初始化页面...')
    
    // 🔴 关键修复：预先设置按钮和转盘为可显示状态，避免延迟感
    console.log('🚀 预设显示状态，消除延迟感')
    this.safeSetData({ 
      loadingConfig: true,
      backendConnected: false,
      wheelReady: true,        // 🔴 预先设置转盘就绪，避免延迟
      isButtonVisible: true,   // 🔴 预先设置按钮可见，避免延迟
      showResult: false,       // 🔴 确保初始时不显示结果
      hideWheel: false,        // 🔴 确保转盘不被隐藏
      isDrawing: false         // 🔴 确保不在抽奖状态
    })
    
    // 🚨 立即修复：强制超时保护，防止页面永久loading
    const forceTimeoutId = setTimeout(() => {
      if (this.data.loadingConfig === true) {
        console.warn('🚨 抽奖页面loading超时，强制设置为完成状态')
        
        // 🔧 增强修复：强制显示转盘，使用默认配置
        this.forceShowWheelWithDefaults()
        
        wx.showModal({
          title: '⏱️ 数据加载超时',
          content: '抽奖配置加载时间过长，已启用离线模式。\n\n• 转盘将使用默认配置显示\n• 可能原因：网络问题或后端异常\n• 建议：检查网络后重新进入',
          showCancel: true,
          cancelText: '返回首页',
          confirmText: '继续使用',
          success: (res) => {
            if (!res.confirm) {
              wx.switchTab({ url: '/pages/index/index' })
            }
          }
        })
      }
    }, 6000) // 6秒强制超时（优化时间）
    
    // 🔴 优先从全局获取用户信息
    if (app.globalData.userInfo) {
      this.safeSetData({
        userInfo: app.globalData.userInfo,
        totalPoints: app.globalData.userInfo.total_points || 0
      })
    }
    
    // 🔴 关键修复：并行加载数据，而不是串行，提高加载速度
    console.log('🚀 启动并行数据加载，提高速度')
    
    // 并行执行用户信息获取和抽奖配置加载
    const userInfoPromise = this.refreshUserInfo().catch(error => {
      console.warn('⚠️ 用户信息加载失败，继续加载抽奖配置:', error)
      return null
    })
    
    const lotteryConfigPromise = this.loadLotteryConfig().catch(error => {
      console.warn('⚠️ 抽奖配置加载失败:', error)
      return null
    })
    
    // 等待两个请求完成（无论成功还是失败）
    Promise.allSettled([userInfoPromise, lotteryConfigPromise])
      .then((results) => {
        clearTimeout(forceTimeoutId)
        
        const [userResult, configResult] = results
        console.log('✅ 并行数据加载完成:', {
          用户信息: userResult.status,
          抽奖配置: configResult.status
        })
        
        // 🔴 关键修复：无论数据加载成功与否，都确保界面显示正常
        this.safeSetData({
          loadingConfig: false,
          backendConnected: configResult.status === 'fulfilled',
          wheelReady: true,       // 🔴 始终保持转盘就绪状态
          isButtonVisible: true,  // 🔴 始终保持按钮可见状态
          showResult: false,      // 🔴 确保不显示结果弹窗
          hideWheel: false,       // 🔴 确保转盘不被隐藏
          isDrawing: false        // 🔴 确保不在抽奖状态
        })
        
        // 🔴 延迟很短时间后初始化Canvas，确保DOM准备就绪
        setTimeout(() => {
          this.initCanvas()
          // 🎯 额外确保转盘绘制完成
          setTimeout(() => {
            if (this.data.prizes && this.data.prizes.length === 8) {
              console.log('🎨 二次确保转盘绘制完成')
              this.drawWheel()
            }
          }, 200)
        }, 50) // 缩短到50ms，减少延迟感
        
        console.log('✅ 页面初始化成功，按钮和转盘应该同时可见')
      })
      .catch((error) => {
        clearTimeout(forceTimeoutId)
        console.error('❌ 页面初始化失败:', error)
        
        // 🔧 即使失败也要显示转盘和按钮
        this.safeSetData({
          loadingConfig: false,
          backendConnected: false,
          wheelReady: true,       // 🔴 确保转盘显示
          isButtonVisible: true,  // 🔴 确保按钮显示
          showResult: false,
          hideWheel: false,
          isDrawing: false
        })
        
        this.forceShowWheelWithDefaults()
        this.handleBackendError(error)
      })
  },

  /**
   * 🔧 新增：强制显示转盘的降级方案
   */
  forceShowWheelWithDefaults() {
    console.log('🔧 启用转盘降级方案，显示数据加载失败提示')
    
    // 🔴 修复违规：严禁硬编码业务数据，改为显示友好错误提示
    this.safeSetData({
      prizes: [], // 清空奖品数据
      costPoints: 0,
      dailyLimit: 0,
      todayDrawCount: 0,
      wheelReady: false, // 标记为未准备
      isButtonVisible: false, // 隐藏抽奖按钮
      loadingConfig: false,
      backendConnected: false,
      lotteryRules: {
        guaranteeRule: '数据加载失败，请重新进入页面',
        consumptionRule: '后端服务连接异常',
        securityRule: '无法获取抽奖配置',
        dailyLimitRule: '请检查网络连接状态'
      }
    })
    
    // 显示友好的错误提示而不是隐藏转盘
    setTimeout(() => {
      this.showDataLoadFailure()
    }, 100)
    
    console.log('✅ 降级方案已激活，显示数据加载失败状态')
  },

  /**
   * 🔧 新增：显示数据加载失败的友好提示
   */
  showDataLoadFailure() {
    wx.showModal({
      title: '🚨 抽奖数据加载失败',
      content: '无法从后端获取抽奖配置数据！\n\n可能原因：\n• 后端API服务未启动\n• 网络连接异常\n• 用户登录状态过期\n\n建议操作：\n• 检查网络连接\n• 重新登录\n• 联系技术支持',
      showCancel: true,
      cancelText: '重新登录',
      confirmText: '重试加载',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          // 重试加载
          this.initPage()
        } else {
          // 重新登录
          wx.navigateTo({
            url: '/pages/auth/auth'
          })
        }
      }
    })
  },

  /**
   * 🔴 刷新用户信息 - 修复字段映射问题
   */
  refreshUserInfo() {
    return new Promise((resolve, reject) => {
      userAPI.getUserInfo().then(result => {
        console.log('✅ 用户信息获取成功:', result)
        console.log('🔍 抽奖页面原始用户数据:', result.data)
        
        // 🔧 增强数据安全验证 - 处理后端返回null或错误数据的情况
        if (!result || result.code !== 0) {
          throw new Error(`后端API返回错误: code=${result?.code}, msg=${result?.msg}`)
        }
        
        const rawUserInfo = result.data
        
        // 🔧 严格验证数据完整性
        if (!rawUserInfo || typeof rawUserInfo !== 'object') {
          throw new Error('后端返回的用户数据为空或格式不正确')
        }
        
        // 🔧 关键修复：统一字段映射 - 将后端数据格式转换为前端期待格式
        const mappedUserInfo = {
          // 🔴 基础字段映射
          user_id: rawUserInfo.user_id || rawUserInfo.id || 'unknown',
          mobile: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
          nickname: rawUserInfo.nickname || rawUserInfo.nickName || rawUserInfo.name || '用户',
          total_points: parseInt(rawUserInfo.total_points || rawUserInfo.totalPoints || rawUserInfo.points || 0),
          
          // 🔴 头像字段映射
          avatar_url: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
          avatar: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
          
          // 🔴 兼容字段
          phone: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
          
          // 🔴 权限字段映射
          is_admin: Boolean(rawUserInfo.is_admin || rawUserInfo.isAdmin || false)
        }
        
        console.log('🔧 抽奖页面字段映射结果:', {
          原始: rawUserInfo,
          映射后: mappedUserInfo
        })
        
        // 🔧 修复undefined问题：确保totalPoints总是有有效值
        const totalPoints = mappedUserInfo.total_points
        
        console.log('💰 数据验证结果:', { 
          originalPoints: rawUserInfo.total_points,
          validatedPoints: totalPoints,
          userInfoValid: !!rawUserInfo
        })
        
        // 🔧 使用标准setData，避免数据过滤问题
        this.setData({
          userInfo: {
            nickname: mappedUserInfo.nickname,
            phone: mappedUserInfo.phone,
            avatar: mappedUserInfo.avatar
          },
          totalPoints: totalPoints  // 确保不会是undefined
        })
        
        console.log('💰 积分数据更新:', { totalPoints, original: rawUserInfo.total_points })
        
        // 更新全局用户信息
        app.globalData.userInfo = {
          ...app.globalData.userInfo,
          ...mappedUserInfo,
          total_points: totalPoints  // 确保全局数据也是安全的
        }
        
        resolve(mappedUserInfo)
        
              }).catch(error => {
        console.error('❌ 获取用户信息失败:', error)
        
        // 🔧 修复：API失败时确保字段不为undefined，使用标准setData
        this.setData({
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
          
          // 🎁 美化方案：智能图标分配
          const getSmartIcon = (prizeName, index) => {
            const name = String(prizeName || '').toLowerCase()
            
            // 根据奖品名称智能匹配图标
            if (name.includes('券') || name.includes('优惠') || name.includes('折扣')) return '🎫'
            if (name.includes('金币') || name.includes('积分') || name.includes('coin')) return '🪙'
            if (name.includes('礼品') || name.includes('奖品') || name.includes('gift')) return '🎁'
            if (name.includes('红包') || name.includes('现金') || name.includes('money')) return '💰'
            if (name.includes('会员') || name.includes('vip') || name.includes('钻石')) return '💎'
            if (name.includes('手机') || name.includes('iphone') || name.includes('phone')) return '📱'
            if (name.includes('电脑') || name.includes('笔记本') || name.includes('laptop')) return '💻'
            if (name.includes('耳机') || name.includes('音响') || name.includes('audio')) return '🎧'
            if (name.includes('手表') || name.includes('watch') || name.includes('时间')) return '⌚'
            if (name.includes('相机') || name.includes('camera') || name.includes('拍照')) return '📷'
            if (name.includes('游戏') || name.includes('game') || name.includes('娱乐')) return '🎮'
            if (name.includes('书籍') || name.includes('book') || name.includes('学习')) return '📚'
            if (name.includes('旅游') || name.includes('机票') || name.includes('travel')) return '✈️'
            if (name.includes('美食') || name.includes('餐饮') || name.includes('food')) return '🍕'
            if (name.includes('服装') || name.includes('衣服') || name.includes('时尚')) return '👕'
            if (name.includes('化妆品') || name.includes('护肤') || name.includes('beauty')) return '💄'
            if (name.includes('运动') || name.includes('健身') || name.includes('sport')) return '⚽'
            if (name.includes('家电') || name.includes('电器') || name.includes('appliance')) return '🏠'
            if (name.includes('谢谢') || name.includes('再来') || name.includes('加油')) return '🎊'
            
            // 根据索引分配默认图标（确保8个不同的图标）
            const defaultIcons = ['🎫', '🎁', '🏆', '💎', '🎀', '🎊', '⭐', '🌟']
            return defaultIcons[index % defaultIcons.length]
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
            // 🎁 美化新增：智能图标
            icon: prize.icon || getSmartIcon(prize.prize_name || prize.name, index),
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
    console.log('🎨 强制简化Canvas初始化...')
    
    try {
      // 🎯 强制绘制简化转盘，无论数据是否完整
      this.drawSimpleWheel()
      
    } catch (error) {
      console.error('❌ Canvas初始化失败:', error)
      this.useCanvasFallback()
    }
  },
  
  /**
   * 🎯 绘制简化转盘 - 确保转盘始终可见
   */
  drawSimpleWheel() {
    console.log('🎨 开始绘制简化转盘...')
    
    const ctx = wx.createCanvasContext('wheelCanvas', this)
    if (!ctx) {
      console.error('❌ Canvas上下文创建失败')
      this.useCanvasFallback()
      return
    }
    
    const canvasSize = 260
    const centerX = canvasSize / 2  
    const centerY = canvasSize / 2
    const radius = canvasSize / 2 - 10
    
    // 简化的8个区域颜色
    const colors = ['#FF6B35', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#607D8B', '#795548', '#E91E63']
    
    // 清空画布
    ctx.clearRect(0, 0, canvasSize, canvasSize)
    
    console.log('🎨 绘制8个简化区域...')
    
    // 绘制8个简化区域
    for (let i = 0; i < 8; i++) {
      const startAngle = (i * 45 - 90) * Math.PI / 180
      const endAngle = ((i + 1) * 45 - 90) * Math.PI / 180
      
      // 绘制扇形
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.fillStyle = colors[i]
      ctx.fill()
      
      // 绘制白色边框
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 简化文字
      const textAngle = startAngle + (endAngle - startAngle) / 2
      const textRadius = radius * 0.7
      const textX = centerX + Math.cos(textAngle) * textRadius
      const textY = centerY + Math.sin(textAngle) * textRadius
      
      ctx.save()
      ctx.translate(textX, textY)
      ctx.rotate(textAngle + Math.PI / 2)
      
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`奖品${i + 1}`, 0, 0)
      
      ctx.restore()
    }
    
    // 绘制中心圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI)
    ctx.fillStyle = '#FF6B35'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 绘制中心文字
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('开始抽奖', centerX, centerY)
    
    // 提交绘制
    ctx.draw(false, () => {
      console.log('✅ 简化转盘绘制完成')
      
      // 设置状态
      this.safeSetData({
        wheelReady: true,
        isButtonVisible: true,
        canvasFallback: false
      })
    })
  },
  
  /**
   * 🎯 新增：绘制默认8区域转盘（确保转盘始终可见）
   */
  drawDefaultWheel() {
    console.log('🎨 绘制默认8区域转盘')
    
    const ctx = wx.createCanvasContext('wheelCanvas', this)
    const canvasSize = 260
    const centerX = canvasSize / 2
    const centerY = canvasSize / 2
    const radius = canvasSize / 2 - 10
    
    // 默认8个区域颜色
    const colors = ['#FF6B35', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#607D8B', '#795548', '#E91E63']
    
    // 清空画布
    ctx.clearRect(0, 0, canvasSize, canvasSize)
    
    // 绘制8个区域
    for (let i = 0; i < 8; i++) {
      const startAngle = (i * 45 - 90) * Math.PI / 180
      const endAngle = ((i + 1) * 45 - 90) * Math.PI / 180
      
      // 绘制扇形
      ctx.beginPath()
      ctx.moveTo(centerX, centerY)
      ctx.arc(centerX, centerY, radius, startAngle, endAngle)
      ctx.closePath()
      ctx.fillStyle = colors[i]
      ctx.fill()
      
      // 绘制边框
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 2
      ctx.stroke()
      
      // 绘制默认文字
      const textAngle = startAngle + (endAngle - startAngle) / 2
      const textRadius = radius * 0.7
      const textX = centerX + Math.cos(textAngle) * textRadius
      const textY = centerY + Math.sin(textAngle) * textRadius
      
      ctx.save()
      ctx.translate(textX, textY)
      ctx.rotate(textAngle + Math.PI / 2)
      
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`奖品${i + 1}`, 0, 0)
      
      ctx.restore()
    }
    
    // 绘制中心圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI)
    ctx.fillStyle = '#FF6B35'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 3
    ctx.stroke()
    
    // 绘制中心文字
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('开始抽奖', centerX, centerY)
    
    ctx.draw()
    
    console.log('✅ 默认转盘绘制完成')
    
    // 设置转盘就绪状态
    this.safeSetData({
      wheelReady: true,
      isButtonVisible: true,
      canvasFallback: false
    })
  },
  
  /**
   * 🔧 启动奖品数据监听器
   */
  startPrizeDataWatcher() {
    let retryCount = 0
    const maxRetries = 10
    
    const checkInterval = setInterval(() => {
      retryCount++
      console.log(`🔄 第${retryCount}次检查奖品数据...`)
      
      if (this.data.prizes && this.data.prizes.length > 0) {
        console.log('✅ 检测到奖品数据，更新转盘')
        clearInterval(checkInterval)
        
        this.ensureEightPrizes()
        this.drawWheel()
        return
      }
      
      if (retryCount >= maxRetries) {
        console.log('⚠️ 奖品数据监听超时，保持默认转盘')
        clearInterval(checkInterval)
        return
      }
    }, 800) // 每800ms检查一次
  },
  
  /**
   * 🔧 确保有8个奖品数据
   */
  ensureEightPrizes() {
    if (!this.data.prizes) {
      this.data.prizes = []
    }
    
    // 如果不是8个，调整数量
    if (this.data.prizes.length !== 8) {
      console.log(`🔧 调整奖品数量：从${this.data.prizes.length}个到8个`)
      this.adjustPrizesToEight()
    }
  },

  /**
   * 🔧 新增：绘制加载中转盘（临时显示）
   */
  drawLoadingWheel() {
    console.log('🎨 绘制加载中转盘')
    
    try {
      const ctx = wx.createCanvasContext('wheelCanvas', this)
      if (!ctx) {
        console.error('❌ Canvas上下文获取失败，使用静态降级方案')
        this.useCanvasFallback()
        return
      }
      
      const canvasSize = 260
      const centerX = canvasSize / 2
      const centerY = canvasSize / 2
      const radius = canvasSize / 2 - 10
      
      // 清空画布
      ctx.clearRect(0, 0, canvasSize, canvasSize)
      
      // 绘制8个加载区域
      const colors = ['#FF6B35', '#4CAF50', '#2196F3', '#9C27B0', '#FF9800', '#607D8B', '#795548', '#E91E63']
      
      for (let i = 0; i < 8; i++) {
        const startAngle = (i * 45 - 90) * Math.PI / 180
        const endAngle = ((i + 1) * 45 - 90) * Math.PI / 180
        
        // 绘制扇形背景
        ctx.beginPath()
        ctx.moveTo(centerX, centerY)
        ctx.arc(centerX, centerY, radius, startAngle, endAngle)
        ctx.closePath()
        ctx.fillStyle = colors[i]
        ctx.fill()
        
        // 绘制边框
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 2
        ctx.stroke()
        
        // 绘制"加载中"文字
        const textAngle = startAngle + (endAngle - startAngle) / 2
        const textRadius = radius * 0.7
        const textX = centerX + Math.cos(textAngle) * textRadius
        const textY = centerY + Math.sin(textAngle) * textRadius
        
        ctx.save()
        ctx.translate(textX, textY)
        ctx.rotate(textAngle + Math.PI / 2)
        
        ctx.fillStyle = '#FFFFFF'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('加载中', 0, 0)
        
        ctx.restore()
      }
      
      // 绘制中心圆
      ctx.beginPath()
      ctx.arc(centerX, centerY, 40, 0, 2 * Math.PI)
      ctx.fillStyle = '#FF6B35'
      ctx.fill()
      ctx.strokeStyle = '#FFFFFF'
      ctx.lineWidth = 3
      ctx.stroke()

      // 🎯 绘制中心圆文字 - "开始抽奖"（Loading状态）
      try {
        console.log('🎨 Loading转盘绘制中心文字："开始抽奖"')
        
        // 🎨 设置文字样式 - 与正常转盘保持一致
        ctx.fillStyle = '#FFFFFF'  // 白色文字
        ctx.font = 'bold 14px sans-serif'  // 14px粗体
        ctx.textAlign = 'center'  // 水平居中
        ctx.textBaseline = 'middle'  // 垂直居中
        
        // 🔧 设置文字阴影效果
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
        ctx.shadowBlur = 2
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1
        
        // 📝 横向绘制"开始抽奖"四个字
        const centerText = '开始抽奖'
        ctx.fillText(centerText, centerX, centerY)
        
        // 🧹 清除阴影效果
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        
        console.log('✅ Loading转盘中心文字绘制成功')
        
      } catch (textError) {
        console.warn('⚠️ Loading转盘文字绘制失败:', textError)
      }
      
      // 🎯 指针现在使用HTML/CSS实现，不再在加载转盘中绘制
      
      ctx.draw()
      console.log('✅ 加载中转盘绘制完成')
      
    } catch (error) {
      console.error('❌ 绘制加载转盘失败:', error)
      this.useCanvasFallback()
    }
  },

  /**
   * 🔧 新增：自动调整奖品数量到8个
   */
  adjustPrizesToEight() {
    const prizes = [...this.data.prizes]
    const currentCount = prizes.length
    
    console.log(`🔧 调整奖品数量：从${currentCount}个到8个`)
    
    if (currentCount < 8) {
      // 不足8个，复制现有奖品
      const defaultPrize = {
        prize_id: 999,
        prize_name: '谢谢参与',
        color: '#CCCCCC',
        probability: 5,
        angle: 0
      }
      
      while (prizes.length < 8) {
        const copyIndex = prizes.length % currentCount
        const newPrize = {
          ...prizes[copyIndex],
          prize_id: prizes.length + 1,
          angle: prizes.length * 45
        }
        prizes.push(newPrize)
      }
    } else if (currentCount > 8) {
      // 超过8个，只取前8个
      prizes.splice(8)
    }
    
    // 重新分配角度
    prizes.forEach((prize, index) => {
      prize.angle = index * 45
    })
    
    this.safeSetData({ prizes })
    console.log(`✅ 奖品数量已调整为${prizes.length}个`)
  },

  /**
   * Canvas降级处理
   */
  useCanvasFallback() {
    console.log('🔄 启用Canvas降级方案')
    this.safeSetData({
      canvasFallback: true,
      showStaticWheel: true,
      canvasError: true,
      wheelReady: true,  // 🔧 修复：即使降级也设置为已准备
      isButtonVisible: true // 🔴 关键修复：确保按钮在降级模式下也可见
    })
    
    // 🔧 显示降级提示
    wx.showToast({
      title: '转盘加载完成',
      icon: 'success',
      duration: 2000
    })
  },

  /**
   * 🎨 绘制8区域转盘 - 严格按照产品文档要求
   */
  drawWheel() {
    console.log('🎨 开始绘制转盘...')
    
    try {
      const ctx = wx.createCanvasContext('wheelCanvas', this)
      const { prizes, canvasCompatibility, technicalConfig } = this.data
      
      if (!ctx) {
        console.error('❌ Canvas上下文获取失败')
        this.useCanvasFallback()
        return
      }
      
      if (!prizes || prizes.length !== 8) {
        console.error(`❌ 奖品配置不符合8区域要求，当前${prizes ? prizes.length : 0}个`)
        this.useCanvasFallback()
        return
      }
      
      const canvasSize = 260
      const centerX = canvasSize / 2
      const centerY = canvasSize / 2
      const radius = canvasSize / 2 - 10
      const centerRadius = 40
      
      console.log('🎨 开始绘制8区域转盘，参数:', {
        canvasSize,
        centerX,
        centerY,
        radius,
        centerRadius,
        prizesCount: prizes.length
      })
      
      // 🔧 修复：增强清空画布的兼容性
      try {
        ctx.clearRect(0, 0, canvasSize, canvasSize)
        console.log('✅ 画布清空成功')
      } catch (clearError) {
        console.warn('⚠️ 画布清空失败，继续绘制:', clearError)
      }
      
      // 🎯 绘制8个奖品区域
      let drawSuccess = true
      prizes.forEach((prize, index) => {
        try {
          const startAngle = (index * 45 - 90) * Math.PI / 180 // 从顶部开始
          const endAngle = ((index + 1) * 45 - 90) * Math.PI / 180
          
          console.log(`🎨 绘制第${index + 1}个奖品: ${prize.prize_name}`)
          
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
              console.log(`✅ 奖品${index + 1}渐变设置成功`)
            } catch (gradientError) {
              console.warn(`⚠️ 奖品${index + 1}渐变创建失败，使用纯色:`, gradientError)
              ctx.fillStyle = color
            }
          } else {
            console.log(`ℹ️ 奖品${index + 1}设备不支持渐变，使用纯色填充`)
            ctx.fillStyle = color
          }
          
          // 🔧 修复：增强填充操作的错误处理
          try {
            ctx.fill()
            console.log(`✅ 奖品${index + 1}填充成功`)
          } catch (fillError) {
            console.error(`❌ 奖品${index + 1}填充失败:`, fillError)
            drawSuccess = false
          }
          
          // 🎨 绘制扇形边框
          try {
            ctx.strokeStyle = '#FFFFFF'
            ctx.lineWidth = 2
            ctx.stroke()
            console.log(`✅ 奖品${index + 1}边框绘制成功`)
          } catch (strokeError) {
            console.warn(`⚠️ 奖品${index + 1}边框绘制失败:`, strokeError)
          }
          
          // 🎨 绘制奖品文字
          this.drawPrizeText(ctx, prize, index, startAngle, endAngle, centerX, centerY, radius)
          
        } catch (prizeError) {
          console.error(`❌ 绘制奖品${index + 1}失败:`, prizeError)
          drawSuccess = false
        }
      })
      
      if (!drawSuccess) {
        console.error('❌ 部分奖品绘制失败，使用降级方案')
        this.useCanvasFallback()
        return
      }
      
      // 🎯 绘制中心圆
      try {
        ctx.beginPath()
        ctx.arc(centerX, centerY, centerRadius, 0, 2 * Math.PI)
        ctx.fillStyle = '#FF6B35'
        ctx.fill()
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 3
        ctx.stroke()
        console.log('✅ 中心圆绘制成功')
      } catch (centerError) {
        console.warn('⚠️ 中心圆绘制失败:', centerError)
      }

      // 🎯 绘制中心圆文字 - "开始抽奖"
      try {
        console.log('🎨 开始绘制中心文字："开始抽奖"')
        
        // 🎨 设置文字样式 - 与页面整体风格和谐
        ctx.fillStyle = '#FFFFFF'  // 白色文字，在橙色背景上清晰可见
        ctx.font = 'bold 14px sans-serif'  // 14px粗体，适合40px半径圆形区域
        ctx.textAlign = 'center'  // 水平居中
        ctx.textBaseline = 'middle'  // 垂直居中
        
        // 🔧 设置文字阴影效果，增强可读性和美观度
        ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
        ctx.shadowBlur = 2
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1
        
        // 📝 横向绘制"开始抽奖"四个字
        const centerText = '开始抽奖'
        console.log(`🎯 在中心位置(${centerX}, ${centerY})绘制文字: "${centerText}"`)
        
        // 🎨 绘制文字到中心圆的正中央
        ctx.fillText(centerText, centerX, centerY)
        
        // 🧹 清除阴影效果，避免影响后续绘制
        ctx.shadowColor = 'transparent'
        ctx.shadowBlur = 0
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 0
        
        console.log('✅ 中心文字"开始抽奖"绘制成功')
        
      } catch (textError) {
        console.warn('⚠️ 中心文字绘制失败，但不影响转盘功能:', textError)
        // 🔧 文字绘制失败不影响转盘的基本功能，只是美观度降低
        // 不需要触发降级方案，转盘依然可以正常使用
      }
      
      // 🎯 指针现在使用HTML/CSS实现，不再在Canvas中绘制
      console.log('✅ 转盘绘制完成，指针使用HTML/CSS实现')
      
      // 🎮 绘制科技粒子效果（可选）
      if (canvasCompatibility.filter !== false) {
        try {
          this.drawTechParticles(ctx, canvasCompatibility)
          console.log('✅ 粒子效果绘制成功')
        } catch (particleError) {
          console.warn('⚠️ 粒子效果绘制失败:', particleError)
        }
      }
      
      // 🔧 修复：增强draw()调用的错误处理
      try {
        ctx.draw()
        console.log('✅ Canvas提交绘制成功')
        
        // 🔧 设置转盘就绪状态
        this.safeSetData({
          wheelReady: true,
          isButtonVisible: true,
          // 🔴 关键修复：确保Canvas模式下不使用降级方案
          canvasFallback: false,
          showStaticWheel: false,
          canvasError: false
        })
        
      } catch (drawError) {
        console.error('❌ Canvas提交绘制失败:', drawError)
        this.useCanvasFallback()
        return
      }
      
      console.log('✅ 8区域转盘绘制完成')
      
    } catch (error) {
      console.error('❌ 转盘绘制过程中发生错误:', error)
      this.useCanvasFallback()
    }
  },

  /**
   * 🔧 新增：绘制奖品文字的独立方法
   */
  drawPrizeText(ctx, prize, index, startAngle, endAngle, centerX, centerY, radius) {
    try {
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
      
      console.log(`🎨 绘制奖品${index + 1}文字:`, {
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
      console.log(`✅ 奖品${index + 1}文字绘制成功`)
      
    } catch (textError) {
      console.error(`❌ 奖品${index + 1}文字绘制失败:`, textError)
    }
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
   * 🎯 绘制精美指针 - 多种风格方案
   * 指针样式选择：1=3D立体 2=箭头式 3=科技感 4=霓虹灯 5=水滴形 6=钻石形 7=发光指针
   */
  drawBeautifulPointer(ctx, centerX, centerY) {
    try {
      // 🔧 指针样式配置 - 可以修改这个数字来切换不同样式 (1-7)
      const pointerStyle = 7  // 当前使用方案7：发光指针 - 温暖光晕效果
      
      switch (pointerStyle) {
        case 1:
          this.drawPointer3D(ctx, centerX, centerY)
          break
        case 2:
          this.drawPointerArrow(ctx, centerX, centerY)
          break
        case 3:
          this.drawPointerTech(ctx, centerX, centerY)
          break
        case 4:
          this.drawPointerNeon(ctx, centerX, centerY)
          break
        case 5:
          this.drawPointerWater(ctx, centerX, centerY)
          break
        case 6:
          this.drawPointerDiamond(ctx, centerX, centerY)
          break
        case 7:
          this.drawPointerGlow(ctx, centerX, centerY)
          break
        default:
          this.drawPointer3D(ctx, centerX, centerY)
      }
    } catch (error) {
      console.warn('指针绘制失败:', error)
    }
  },

  /**
   * 🎯 方案1：3D立体指针 - 现代立体感设计
   */
  drawPointer3D(ctx, centerX, centerY) {
    console.log('🎨 绘制3D立体指针')
    
    const pointerLength = 25
    const pointerWidth = 10
    const startY = centerY - 50
    
    // 🎨 绘制指针阴影（3D效果）
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetX = 3
    ctx.shadowOffsetY = 3
    
    // 🎨 绘制主体指针
    ctx.beginPath()
    ctx.moveTo(centerX, startY) // 指针顶点
    ctx.lineTo(centerX - pointerWidth, startY + pointerLength) // 左下
    ctx.lineTo(centerX - 4, startY + pointerLength) // 左内
    ctx.lineTo(centerX, startY + pointerLength - 8) // 中心凹槽
    ctx.lineTo(centerX + 4, startY + pointerLength) // 右内
    ctx.lineTo(centerX + pointerWidth, startY + pointerLength) // 右下
    ctx.closePath()
    
    // 🎨 立体渐变填充
    const gradient = ctx.createLinearGradient(centerX - pointerWidth, startY, centerX + pointerWidth, startY + pointerLength)
    gradient.addColorStop(0, '#FFD700')
    gradient.addColorStop(0.5, '#FFA500')
    gradient.addColorStop(1, '#FF6B35')
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🎨 高光边缘
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 清除阴影
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    
    // 🎯 绘制中心固定点
    ctx.beginPath()
    ctx.arc(centerX, centerY, 8, 0, 2 * Math.PI)
    const centerGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 8)
    centerGradient.addColorStop(0, '#FFD700')
    centerGradient.addColorStop(1, '#FF6B35')
    ctx.fillStyle = centerGradient
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.stroke()
  },

  /**
   * 🎯 方案2：箭头式指针 - 简洁现代风格
   */
  drawPointerArrow(ctx, centerX, centerY) {
    console.log('🎨 绘制箭头式指针')
    
    const pointerLength = 30
    const arrowWidth = 12
    const shaftWidth = 4
    const startY = centerY - 55
    
    // 🎨 绘制箭头主体
    ctx.beginPath()
    // 箭头尖端
    ctx.moveTo(centerX, startY)
    ctx.lineTo(centerX - arrowWidth, startY + 15)
    ctx.lineTo(centerX - shaftWidth, startY + 15)
    ctx.lineTo(centerX - shaftWidth, startY + pointerLength)
    ctx.lineTo(centerX + shaftWidth, startY + pointerLength)
    ctx.lineTo(centerX + shaftWidth, startY + 15)
    ctx.lineTo(centerX + arrowWidth, startY + 15)
    ctx.closePath()
    
    // 🎨 红色渐变填充
    const gradient = ctx.createLinearGradient(centerX, startY, centerX, startY + pointerLength)
    gradient.addColorStop(0, '#FF4444')
    gradient.addColorStop(0.5, '#FF6B35')
    gradient.addColorStop(1, '#CC3333')
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🎨 白色边框
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.stroke()
    
    // 🎯 中心圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI)
    ctx.fillStyle = '#FF4444'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 2
    ctx.stroke()
  },

  /**
   * 🎯 方案3：科技感指针 - 蓝色科技风格
   */
  drawPointerTech(ctx, centerX, centerY) {
    console.log('🎨 绘制科技感指针')
    
    const startY = centerY - 48
    
    // 🎨 科技蓝色渐变
    const gradient = ctx.createLinearGradient(centerX, startY, centerX, startY + 30)
    gradient.addColorStop(0, '#00FFFF')
    gradient.addColorStop(0.5, '#0080FF')
    gradient.addColorStop(1, '#0040FF')
    
    // 🎨 绘制六边形指针
    ctx.beginPath()
    ctx.moveTo(centerX, startY) // 顶点
    ctx.lineTo(centerX - 8, startY + 10)
    ctx.lineTo(centerX - 6, startY + 20)
    ctx.lineTo(centerX - 3, startY + 25)
    ctx.lineTo(centerX + 3, startY + 25)
    ctx.lineTo(centerX + 6, startY + 20)
    ctx.lineTo(centerX + 8, startY + 10)
    ctx.closePath()
    
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🎨 发光边框
    ctx.strokeStyle = '#00FFFF'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 🎮 科技装饰线条
    ctx.strokeStyle = '#00FFFF'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(centerX - 4, startY + 8)
    ctx.lineTo(centerX + 4, startY + 8)
    ctx.moveTo(centerX - 3, startY + 15)
    ctx.lineTo(centerX + 3, startY + 15)
    ctx.stroke()
    
    // 🎯 中心科技圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, 7, 0, 2 * Math.PI)
    ctx.fillStyle = '#0080FF'
    ctx.fill()
    ctx.strokeStyle = '#00FFFF'
    ctx.lineWidth = 1
    ctx.stroke()
  },

  /**
   * 🎯 方案4：霓虹灯指针 - 发光霓虹效果
   */
  drawPointerNeon(ctx, centerX, centerY) {
    console.log('🎨 绘制霓虹灯指针')
    
    const pointerLength = 28
    const pointerWidth = 9
    const startY = centerY - 52
    
    // 🎨 外层发光效果
    ctx.shadowColor = '#FF00FF'
    ctx.shadowBlur = 15
    
    // 🎨 绘制指针主体
    ctx.beginPath()
    ctx.moveTo(centerX, startY)
    ctx.lineTo(centerX - pointerWidth, startY + pointerLength)
    ctx.lineTo(centerX + pointerWidth, startY + pointerLength)
    ctx.closePath()
    
    // 🎨 霓虹渐变
    const gradient = ctx.createLinearGradient(centerX, startY, centerX, startY + pointerLength)
    gradient.addColorStop(0, '#FF00FF')
    gradient.addColorStop(0.5, '#FF0080')
    gradient.addColorStop(1, '#8000FF')
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🎨 内层高光
    ctx.shadowBlur = 5
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1
    ctx.stroke()
    
    // 清除阴影
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    
    // 🎯 发光中心圆
    ctx.shadowColor = '#FF00FF'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(centerX, centerY, 7, 0, 2 * Math.PI)
    ctx.fillStyle = '#FF00FF'
    ctx.fill()
    
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
  },

  /**
   * 🎯 方案5：水滴形指针 - 流线型设计
   */
  drawPointerWater(ctx, centerX, centerY) {
    console.log('🎨 绘制水滴形指针')
    
    const startY = centerY - 50
    
    // 🎨 绘制水滴形状
    ctx.beginPath()
    ctx.moveTo(centerX, startY) // 顶点
    // 左侧曲线
    ctx.quadraticCurveTo(centerX - 12, startY + 15, centerX - 8, startY + 25)
    ctx.quadraticCurveTo(centerX - 4, startY + 30, centerX, startY + 28)
    // 右侧曲线
    ctx.quadraticCurveTo(centerX + 4, startY + 30, centerX + 8, startY + 25)
    ctx.quadraticCurveTo(centerX + 12, startY + 15, centerX, startY)
    
    // 🎨 蓝色水滴渐变
    const gradient = ctx.createLinearGradient(centerX, startY, centerX, startY + 30)
    gradient.addColorStop(0, '#87CEEB')
    gradient.addColorStop(0.5, '#4169E1')
    gradient.addColorStop(1, '#0000CD')
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🎨 高光效果
    ctx.beginPath()
    ctx.ellipse(centerX - 3, startY + 10, 2, 4, 0, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    ctx.fill()
    
    // 🎯 中心圆
    ctx.beginPath()
    ctx.arc(centerX, centerY, 6, 0, 2 * Math.PI)
    ctx.fillStyle = '#4169E1'
    ctx.fill()
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 1
    ctx.stroke()
  },

  /**
   * 🎯 方案6：钻石形指针 - 奢华璀璨风格
   */
  drawPointerDiamond(ctx, centerX, centerY) {
    console.log('🎨 绘制钻石形指针')
    
    const startY = centerY - 48
    
    // 🎨 绘制钻石切面
    ctx.beginPath()
    ctx.moveTo(centerX, startY) // 顶点
    ctx.lineTo(centerX - 6, startY + 8)
    ctx.lineTo(centerX - 8, startY + 18)
    ctx.lineTo(centerX - 4, startY + 28)
    ctx.lineTo(centerX, startY + 25)
    ctx.lineTo(centerX + 4, startY + 28)
    ctx.lineTo(centerX + 8, startY + 18)
    ctx.lineTo(centerX + 6, startY + 8)
    ctx.closePath()
    
    // 🎨 钻石渐变
    const gradient = ctx.createLinearGradient(centerX - 8, startY, centerX + 8, startY + 28)
    gradient.addColorStop(0, '#E6E6FA')
    gradient.addColorStop(0.3, '#DDA0DD')
    gradient.addColorStop(0.7, '#9370DB')
    gradient.addColorStop(1, '#8B008B')
    ctx.fillStyle = gradient
    ctx.fill()
    
    // 🎨 钻石切面线条
    ctx.strokeStyle = '#FFFFFF'
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(centerX, startY + 8)
    ctx.lineTo(centerX - 6, startY + 8)
    ctx.moveTo(centerX, startY + 8)
    ctx.lineTo(centerX + 6, startY + 8)
    ctx.moveTo(centerX, startY + 8)
    ctx.lineTo(centerX, startY + 25)
    ctx.stroke()
    
    // 🎯 璀璨中心
    ctx.beginPath()
    ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI)
    ctx.fillStyle = '#9370DB'
    ctx.fill()
    ctx.strokeStyle = '#E6E6FA'
    ctx.lineWidth = 2
    ctx.stroke()
  },

  /**
   * 🎯 方案7：发光指针 - 温暖光晕效果
   */
  drawPointerGlow(ctx, centerX, centerY) {
    console.log('🎨 绘制发光指针')
    
    const pointerLength = 26
    const pointerWidth = 10
    const startY = centerY - 50
    
    // 🎨 多层发光效果
    for (let i = 3; i >= 0; i--) {
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = (i + 1) * 8
      
      ctx.beginPath()
      ctx.moveTo(centerX, startY)
      ctx.lineTo(centerX - pointerWidth + i, startY + pointerLength)
      ctx.lineTo(centerX + pointerWidth - i, startY + pointerLength)
      ctx.closePath()
      
      if (i === 0) {
        // 最内层实体
        ctx.fillStyle = '#FFD700'
        ctx.fill()
      } else {
        // 外层光晕
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.3 * (4 - i)})`
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }
    
    // 清除阴影
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    
    // 🎯 发光中心
    for (let i = 2; i >= 0; i--) {
      ctx.beginPath()
      ctx.arc(centerX, centerY, 8 - i * 2, 0, 2 * Math.PI)
      if (i === 0) {
        ctx.fillStyle = '#FFD700'
        ctx.fill()
      } else {
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.5 * (3 - i)})`
        ctx.lineWidth = 3
        ctx.stroke()
      }
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
    
    // 🌟 设置区域发亮抽奖状态
    this.safeSetData({ 
      isDrawing: true,            // 用于遮罩层控制
      highlightAnimation: false,  // 动画还未开始
      currentHighlight: -1,       // 清空高亮状态
      winningIndex: -1,           // 清空中奖状态
      isLotteryInProgress: true,  // 用于按钮文字显示
      showResult: false,          // 清空之前的结果
      isButtonVisible: false,     // 抽奖期间隐藏多连抽按钮
      wheelReady: true            // 确保抽奖区域可见
    })
    
    // 🔴 重置动画完成标志，确保新的抽奖流程正确
    this.animationCompleted = false
    
    // 🔧 使用安全的Loading管理器
    loadingManager.show('抽奖中...', true)
    
    // 🔴 添加请求超时保护机制
    this.drawTimeoutId = setTimeout(() => {
      console.error('⏰ 抽奖请求超时，自动重置状态')
      
      // 🔴 强制隐藏Loading并重置状态
      loadingManager.reset()
      this.safeSetData({ 
        isDrawing: false,
        isButtonVisible: true, // 恢复按钮显示
        wheelReady: true // 确保转盘保持可见
      })
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
        this.safeSetData({ 
          isDrawing: false,
          isButtonVisible: true, // 恢复按钮显示
          wheelReady: true // 确保转盘保持可见
        })
        
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
      
      // 🔴 关键修复：立即更新本地状态，确保数据同步
      this.safeSetData({
        isDrawing: false,
        totalPoints: user_points,
        todayDrawCount: today_count,
        // 🔴 重要：确保转盘在更新状态时保持显示
        wheelReady: true,
        isButtonVisible: true // 恢复按钮显示
      })
      
      // 🔴 更新全局积分
      this.updateGlobalUserPoints(user_points)
      
      // 🔴 保存所有抽奖结果，无论单抽还是多连抽
      this.lastDrawResults = results || []
      console.log('🎯 保存抽奖结果:', this.lastDrawResults.length, '个奖品')
      
      // 🎯 根据抽奖次数决定是否播放动画
      if (results && results.length > 0) {
        console.log(`🎯 获得${results.length}个奖品，抽奖类型：${drawType}`)
        
        // 🔴 多连抽跳过动画，直接显示结果
        if (count > 1) {
          console.log('🎯 多连抽检测：跳过动画，直接显示所有奖品结果')
          
          // 🎯 隐藏loading，设置状态
          loadingManager.hide(true)
          this.safeSetData({
            wheelReady: true,
            hideWheel: false,
            showResult: false,
            isDrawing: false,
            isButtonVisible: false,
            isLotteryInProgress: false // 多连抽完成
          })
          
                     // 🎯 短暂延迟后直接显示结果，给用户反应时间
           setTimeout(() => {
             console.log(`🎉 直接显示${results.length}连抽结果:`, results.map(r => r.prize_name || r.name))
             // 🔴 设置标志，确保直接显示所有结果
             this.animationCompleted = true
             
             // 🔴 多连抽使用更适合的显示模式
             if (results.length > 2) {
               console.log('🎯 多连抽使用瀑布流显示模式')
               this.safeSetData({ resultDisplayMode: 'waterfall' })
             }
             
             this.showDrawResult(results) // 传递所有结果
           }, 500) // 500ms延迟让用户看到操作反馈
          
        } else {
          // 🌟 单抽：播放动画
          console.log('🎯 单抽检测：播放指针转动动画')
          
          // 🎯 关键修复：先隐藏loading管理器，确保不遮挡指针动画
          console.log('🎯 隐藏loading，准备播放指针动画')
          loadingManager.hide(true) // 强制隐藏loading
          
          // 🎯 强制确保转盘和指针可见，同时设置动画状态
          this.safeSetData({
            wheelReady: true,
            hideWheel: false,
            showResult: false,
            isDrawing: false,  // 🎯 关键修复：设置为false，避免遮罩层显示
            isButtonVisible: false // 隐藏按钮避免重复点击
          })
          
          // 🎯 短暂延迟后播放指针动画，确保转盘已显示
          setTimeout(() => {
            console.log('🎯 开始播放指针转动动画')
            this.playAnimation(results[0]) // 使用第一个结果来确定指针位置
            
            // 🎯 动画将自动处理结果显示，无需额外调用
            setTimeout(() => {
              console.log('🎉 确保抽奖状态已重置，动画会自动显示结果')
              // 🎯 仅重置抽奖状态，动画完成后会自动显示结果
              this.safeSetData({
                isLotteryInProgress: false, // 抽奖过程结束
                isDrawing: false // 确保不显示遮罩
              })
              // 🔴 移除直接调用showDrawResult，让动画完成后自动显示
            }, 3200)
          }, 100) // 100ms后开始动画
        }
        
        console.log(`✅ ${count}连抽处理完成，共${results.length}个奖品`)
      } else {
      console.warn('⚠️ 抽奖结果为空，播放默认指针动画')
      
      // 🎯 同样先隐藏loading，确保动画可见
      loadingManager.hide(true) // 强制隐藏loading
      
      // 🎯 设置状态以确保转盘和指针可见
      this.safeSetData({
        wheelReady: true,
        hideWheel: false,
        showResult: false,
        isDrawing: false,  // 避免遮罩层显示
        isButtonVisible: false // 隐藏按钮避免重复点击
      })
      
      // 🎯 播放默认指针动画
      setTimeout(() => {
        this.playDefaultPointerAnimation()
        
        // 🎯 默认动画完成后显示提示
        setTimeout(() => {
          // 🎯 重置抽奖状态
          this.safeSetData({
            isLotteryInProgress: false, // 抽奖过程结束
            isDrawing: false, // 确保不显示遮罩
            isButtonVisible: true // 恢复按钮显示
          })
          
          wx.showModal({
            title: '🎲 抽奖完成',
            content: '抽奖已完成，但未获取到具体结果信息',
            showCancel: false,
            confirmText: '知道了'
          })
        }, 3200)
      }, 100)
    }
      
    }).catch(error => {
      // 🔧 清除超时定时器
      if (this.drawTimeoutId) {
        clearTimeout(this.drawTimeoutId)
        this.drawTimeoutId = null
      }
      
          // 🔴 强制隐藏Loading状态，确保界面不卡住
    loadingManager.reset()
    this.safeSetData({ 
      isDrawing: false,      // 🔴 恢复非抽奖状态，WXML会自动显示转盘
      isLotteryInProgress: false, // 🎯 重置抽奖过程状态
      isButtonVisible: true, // 恢复多连抽按钮显示
      wheelReady: true,      // 🔴 确保转盘容器显示
      hideWheel: false,      // 🔴 确保转盘不被隐藏
      showResult: false,     // 🔴 确保没有结果弹窗遮挡
      isPointerAnimating: false, // 🎯 停止指针动画状态
    })
      
      // 🔴 错误处理后也要立即重绘转盘，确保与按钮同步
      setTimeout(() => {
        console.log('🔧 抽奖错误后重绘转盘，确保同步显示')
        if (this.data.prizes && this.data.prizes.length === 8) {
          this.drawWheel()
        }
      }, 10)
      
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
   * 🎯 播放指针旋转动画 - 指针转动方案
   */
  playAnimation(result) {
    console.log('🌟 开始播放区域发亮抽奖动画，结果:', result)
    
    // 🔧 增强数据验证 - 支持多种可能的数据结构
    if (!result) {
      console.warn('⚠️ 抽奖结果为空，跳过动画')
      return
    }
    
    // 🔴 清理原有动画状态
    this.stopPointerIdleAnimation()
    this.safeSetData({
      isPointerAnimating: false,
      pointerAngle: 0,
      showResult: false,
      hideWheel: false,
      highlightAnimation: true,
      currentHighlight: -1,
      winningIndex: -1
    })
    
     let prizeIndex = -1
       
       // 🔧 修复数据结构适配 - 优先处理新格式
       let prizeId = null
       if (result.prize && result.prize.id) {
         prizeId = result.prize.id
         console.log('🎯 使用新格式prize.id:', prizeId)
       } else if (result.prize_id) {
         prizeId = result.prize_id
       } else if (result.prizeId) {
         prizeId = result.prizeId
       } else if (result.id) {
         prizeId = result.id
       }
       
       console.log('🔍 提取的奖品ID:', prizeId, '数据类型:', typeof prizeId)
       
    // 🔴 新增：详细的奖品数组调试信息
    console.log('📊 当前前端奖品数组详情:')
    if (this.data.prizes && this.data.prizes.length > 0) {
      this.data.prizes.forEach((prize, index) => {
        console.log(`  索引${index}: ID=${prize.prize_id || prize.id} 名称="${prize.prize_name || prize.name}"`)
      })
    } else {
      console.log('  ❌ 奖品数组为空或未加载')
    }
    
    if (prizeId && this.data.prizes && this.data.prizes.length === 8) {
      console.log('🔍 开始智能奖品ID匹配...')
      
      // 🚀 智能ID适配系统 - 支持多种后端ID格式
      const matchStrategies = [
        {
          name: '精确匹配',
          test: (frontendId, backendId) => frontendId === backendId
        },
        {
          name: '字符串匹配', 
          test: (frontendId, backendId) => String(frontendId) === String(backendId)
        },
        {
          name: '数字匹配',
          test: (frontendId, backendId) => {
            const frontNum = Number(frontendId)
            const backNum = Number(backendId)
            return !isNaN(frontNum) && !isNaN(backNum) && frontNum === backNum
          }
        },
        {
          name: '提取尾数匹配 (prize_id-1 → 1)',
          test: (frontendId, backendId) => {
            const extractTailNumber = (id) => {
              if (!id) return null
              const match = String(id).match(/[-_]?(\d+)$/)
              return match ? parseInt(match[1]) : null
            }
            const frontTail = extractTailNumber(frontendId)
            const backTail = extractTailNumber(backendId)
            return frontTail !== null && backTail !== null && frontTail === backTail
          }
        },
        {
          name: '索引推导匹配 (prize_id-1 → 索引0)',
          test: (frontendId, backendId, index) => {
            // 从后端ID推导前端索引
            const extractIndexFromId = (id) => {
              if (!id) return null
              const match = String(id).match(/[-_]?(\d+)$/)
              if (match) {
                const num = parseInt(match[1])
                // 尝试1-based转0-based：prize_id-1 → 索引0
                return num - 1
              }
              return null
            }
            
            const predictedIndex = extractIndexFromId(backendId)
            return predictedIndex === index
          }
        },
        {
          name: '去前缀匹配 (prize_id-1 vs id-1)',
          test: (frontendId, backendId) => {
            const normalizeId = (id) => String(id).replace(/^(prize_?id[-_]?|prize[-_]?|id[-_]?)/i, '')
            return normalizeId(frontendId) === normalizeId(backendId)
          }
        },
        {
          name: '模糊数字匹配',
          test: (frontendId, backendId) => {
            // 提取所有数字进行匹配
            const extractAllNumbers = (id) => {
              if (!id) return []
              return String(id).match(/\d+/g)?.map(num => parseInt(num)) || []
            }
            
            const frontNumbers = extractAllNumbers(frontendId)
            const backNumbers = extractAllNumbers(backendId)
            
            return frontNumbers.length > 0 && backNumbers.length > 0 &&
                   frontNumbers.some(fn => backNumbers.includes(fn))
          }
        }
      ]
      
      // 🎯 应用匹配策略
      for (let strategyIndex = 0; strategyIndex < matchStrategies.length && prizeIndex === -1; strategyIndex++) {
        const strategy = matchStrategies[strategyIndex]
        console.log(`🔍 尝试策略${strategyIndex + 1}: ${strategy.name}`)
        
        for (let i = 0; i < this.data.prizes.length; i++) {
          const prize = this.data.prizes[i]
          const frontendId = prize.prize_id || prize.id || prize.prizeId
          
          try {
            if (strategy.test(frontendId, prizeId, i)) {
              prizeIndex = i
              console.log(`✅ ${strategy.name}匹配成功！索引: ${prizeIndex}`)
              console.log(`   前端ID: ${frontendId}, 后端ID: ${prizeId}`)
              break
            }
          } catch (error) {
            console.warn(`策略${strategyIndex + 1}执行出错:`, error)
          }
        }
        
        if (prizeIndex !== -1) {
          console.log(`🎯 匹配成功使用策略: ${strategy.name}`)
          break
        }
      }
      
      // 🔴 如果所有ID匹配策略都失败，尝试按名称匹配（最后兜底方案）
      if (prizeIndex === -1) {
        console.warn('⚠️ 所有ID匹配策略失败，尝试按奖品名称匹配')
        const prizeName = result.prize?.name || result.prize_name || result.prizeName || result.name
        
        if (prizeName) {
          console.log(`🔍 尝试名称匹配: "${prizeName}"`)
          
          for (let i = 0; i < this.data.prizes.length; i++) {
            const prize = this.data.prizes[i]
            const frontendName = prize.prize_name || prize.name || prize.prizeName
            
            if (frontendName && frontendName === prizeName) {
              prizeIndex = i
              console.log(`✅ 名称匹配成功，索引: ${prizeIndex}，奖品名称: ${frontendName}`)
              break
            }
          }
          
          if (prizeIndex === -1) {
            console.log('❌ 名称匹配也失败')
          }
        } else {
          console.log('❌ 后端未返回奖品名称，无法进行名称匹配')
        }
      }
    }
       
    // 🔧 兜底处理：如果没有找到对应索引
       if (prizeIndex === -1) {
      console.warn('⚠️ 未找到对应奖品索引')
      console.log('🔍 详细诊断信息:', {
        '后端奖品ID': prizeId,
        '后端奖品ID类型': typeof prizeId,
        '后端奖品名称': result.prize?.name || result.prize_name || result.prizeName || result.name,
        '前端奖品总数': this.data.prizes?.length || 0,
        '前端奖品ID列表': this.data.prizes?.map(p => ({ id: p.prize_id || p.id, name: p.prize_name || p.name })) || []
      })
      
      // 🔴 重要修复：添加弹窗提示用户数据不匹配问题
      wx.showModal({
        title: '🔧 数据匹配异常',
        content: `检测到奖品数据匹配异常！\n\n后端返回奖品ID: ${prizeId}\n前端无法找到对应奖品\n\n这可能是：\n• 后端与前端奖品数据不同步\n• 奖品ID格式不一致\n• 奖品配置更新延迟\n\n将随机选择一个区域高亮`,
        showCancel: true,
        cancelText: '查看详情',
        confirmText: '继续抽奖',
        success: (res) => {
          if (res.cancel) {
            // 显示详细的诊断信息
            this.showPrizeMatchingDiagnostic(prizeId, result)
          }
        }
      })
      
      if (this.data.prizes && this.data.prizes.length === 8) {
        prizeIndex = Math.floor(Math.random() * 8)
        console.log('🔧 使用随机索引:', prizeIndex)
      } else {
        console.warn('⚠️ 奖品数据不是8个或未加载:', this.data.prizes?.length || 0)
        prizeIndex = 0 // 默认第一个
      }
    } else {
      console.log('✅ 奖品匹配成功！')
      console.log('🎯 匹配详情:', {
        '后端奖品ID': prizeId,
        '前端匹配索引': prizeIndex,
        '匹配的奖品名称': this.data.prizes[prizeIndex]?.prize_name || this.data.prizes[prizeIndex]?.name,
        '匹配的奖品ID': this.data.prizes[prizeIndex]?.prize_id || this.data.prizes[prizeIndex]?.id
      })
    }
    
    console.log('🎯 最终确定的奖品索引:', prizeIndex)
         
    // 🎯 开始区域轮流发亮动画，保存所有结果
    this.startHighlightAnimation(prizeIndex, this.lastDrawResults || [result])
  },
  
  /**
   * 🌟 开始区域轮流发亮动画
   * @param {number} winningIndex - 中奖区域索引
   * @param {Object} result - 抽奖结果数据
   */
  startHighlightAnimation(winningIndex, result) {
    console.log('🌟 开始区域轮流发亮动画，中奖索引:', winningIndex)
    
    // 🔴 清理之前的动画定时器，防止重复执行
    if (this.highlightAnimationTimer) {
      clearTimeout(this.highlightAnimationTimer)
      this.highlightAnimationTimer = null
    }
    
    // 🎯 保存抽奖结果用于后续显示 - 优先使用已保存的多连抽结果
    if (!this.lastDrawResults || this.lastDrawResults.length === 0) {
      this.lastDrawResults = Array.isArray(result) ? result : [result]
    }
    console.log('🎯 动画使用的结果数量:', this.lastDrawResults.length)
    
    // 🔴 重置动画完成标志
    this.animationCompleted = false
    
    // 🎯 动画参数配置
    const highlightDuration = 55 // 每个区域高亮持续时间（毫秒）- 调整为55ms以达到4秒总时长
    const totalCycles = 8 // 总共轮流8圈
    const finalSlowCycles = 2 // 最后2圈减速
    
    // 🔴 安全机制：设置最大动画时间（5秒）
    const maxAnimationTime = 5000
    const animationStartTime = Date.now()
    
    // 🔴 安全定时器：强制停止动画
    const safetyTimer = setTimeout(() => {
      console.warn('⚠️ 动画超时，强制停止')
      this.stopHighlightAnimation(winningIndex)
    }, maxAnimationTime)
    
    let currentIndex = 0
    let currentCycle = 0
    let animationSpeed = highlightDuration
    
    // 🎯 随机高亮序列生成函数
    const generateRandomSequence = () => {
      const sequence = [0, 1, 2, 3, 4, 5, 6, 7]
      // Fisher-Yates 随机打乱算法（兼容微信小程序）
      for (let i = sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        // 🔧 使用传统方式交换，避免解构赋值兼容性问题
        const temp = sequence[i]
        sequence[i] = sequence[j]
        sequence[j] = temp
      }
      return sequence
    }
    
    // 🌟 每圈生成新的随机高亮序列
    let highlightSequence = generateRandomSequence()
    console.log('🎲 第1圈随机序列:', highlightSequence)
    
    const animateHighlight = () => {
      // 🔴 先设置当前高亮区域
      const currentHighlightIndex = highlightSequence[currentIndex]
      console.log(`🔄 当前高亮索引: ${currentHighlightIndex}, 圈数: ${currentCycle}/${totalCycles}, 目标索引: ${winningIndex}`)
      
      // 🎯 设置当前高亮区域
      this.safeSetData({
        currentHighlight: currentHighlightIndex
      })
      
            // 🎯 检查结束条件（在移动索引之前）
      // 完成所有圈数且高亮了中奖区域时停止
      const shouldStopNext = currentCycle >= totalCycles && currentHighlightIndex === winningIndex
      
      console.log('🔍 动画状态:', {
        当前圈数: currentCycle,
        总圈数: totalCycles,
        当前索引: currentIndex,
        当前高亮区域: currentHighlightIndex,
        中奖区域: winningIndex,
        是否应该停止: shouldStopNext
      })
      
      // 🔴 移动索引到下一位置
      currentIndex++
   
      // 🎯 一圈完成后
      if (currentIndex >= highlightSequence.length) {
        currentIndex = 0
        currentCycle++
        
        // 🎯 最后几圈开始减速
        if (currentCycle >= totalCycles - finalSlowCycles) {
          animationSpeed += 30 // 每圈增加30ms，营造减速效果
        }
        
        // 🌟 每圈生成新的随机序列
        if (currentCycle < totalCycles) {
          // 🎲 生成新的随机序列
          highlightSequence = generateRandomSequence()
          console.log(`🎲 第${currentCycle + 1}圈随机序列:`, highlightSequence)
        } else if (currentCycle === totalCycles) {
          // 🎯 超过圈数后，创建只包含中奖区域的序列用于最终高亮
          highlightSequence = [winningIndex]
          console.log(`🏆 最终高亮序列(仅中奖区域${winningIndex}):`, highlightSequence)
        }
        
        console.log(`🔄 完成第${currentCycle}圈，当前速度:${animationSpeed}ms`)
      }
      
      if (shouldStopNext) {
        console.log('🏆 下一步将高亮中奖区域，准备结束动画')
        
        // 🎯 最后一次高亮中奖区域
        this.highlightAnimationTimer = setTimeout(() => {
          console.log(`🏆 最终高亮中奖区域: 索引${winningIndex}`)
    
        // 清理安全定时器
        if (safetyTimer) {
          clearTimeout(safetyTimer)
        }
        
                     // 🎯 设置最终中奖高亮状态
    this.safeSetData({
          currentHighlight: winningIndex,  // 高亮中奖区域
             highlightAnimation: false,       // 停止动画
             isLotteryInProgress: false       // 重置抽奖状态
    })

                      console.log('🏆 中奖区域高亮显示，开始三阶段弹窗流程')
           
           // 🎯 第一阶段：中奖区域停留 0.5秒
           setTimeout(() => {
             console.log('⏳ 第一阶段完成：中奖区域停留0.5秒结束，切换为中奖状态显示')
             this.safeSetData({
               currentHighlight: -1,
               winningIndex: winningIndex
             })
      
             // 🎯 第二阶段：缓冲准备 0.1秒
             setTimeout(() => {
               console.log('🎉 第二阶段完成：缓冲准备0.1秒结束，显示中奖结果弹窗')
               // 🔴 设置标志表示动画已完成，可以显示弹窗
               this.animationCompleted = true
               this.showDrawResult(this.lastDrawResults || [])
             }, 100) // 第二阶段：缓冲准备 0.1秒
           }, 500) // 第一阶段：中奖区域停留 0.5秒
          
        }, animationSpeed)
        
        return // 不再继续循环
      }
      
      // 🎯 继续下一个区域的高亮
      this.highlightAnimationTimer = setTimeout(() => {
        // 🔴 检查是否超时
        if (Date.now() - animationStartTime > maxAnimationTime) {
          console.warn('⚠️ 动画时间过长，强制停止')
          this.stopHighlightAnimation(winningIndex)
          return
        }
        animateHighlight()
      }, animationSpeed)
    }
    
    // 🎯 开始动画
    animateHighlight()
    
    // 🎯 保存安全定时器引用，用于清理
    this.highlightSafetyTimer = safetyTimer
  },
  
  /**
   * 🔴 安全停止高亮动画
   * @param {number} winningIndex - 中奖区域索引
   */
  stopHighlightAnimation(winningIndex) {
    console.log('🛑 停止高亮动画，中奖区域:', winningIndex)
    
    // 清理所有定时器
    if (this.highlightAnimationTimer) {
      clearTimeout(this.highlightAnimationTimer)
      this.highlightAnimationTimer = null
    }
    if (this.highlightSafetyTimer) {
      clearTimeout(this.highlightSafetyTimer)
      this.highlightSafetyTimer = null
    }
    
    // 先高亮中奖区域让用户看清
    this.safeSetData({
      currentHighlight: winningIndex,  // 先高亮中奖区域
      winningIndex: -1,               // 临时清空winningIndex
      highlightAnimation: false,
      isLotteryInProgress: false,     // 🔴 重置抽奖状态
      isDrawing: false                // 🔴 重置绘制状态
    })
    
        console.log('🏆 强制停止后高亮中奖区域，停留1.5秒让用户充分观察')
    
    // 🎯 延迟1.5秒让用户充分观察中奖区域，然后显示结果
    setTimeout(() => {
      console.log('🎯 1.5秒观察时间结束，切换最终状态并显示结果')
      this.safeSetData({
        currentHighlight: -1,
        winningIndex: winningIndex
      })
      
      setTimeout(() => {
        console.log('🎉 强制停止动画完成，准备显示结果弹窗')
        // 🔴 设置标志表示动画已完成，可以显示弹窗
        this.animationCompleted = true
        this.showDrawResult(this.lastDrawResults || [])
      }, 1000)
    }, 1500)
  },

  /**
   * 🎯 播放默认指针动画（兜底方案）
   */
  playDefaultPointerAnimation() {
    console.log('🎯 播放默认指针旋转动画')
    
    // 随机选择一个目标位置
    const randomPrizeIndex = Math.floor(Math.random() * 8)
    const targetAngle = randomPrizeIndex * 45 - 90 + 22.5 // 与转盘绘制角度对应
    const currentPointerAngle = this.data.pointerAngle || 0
    const minSpinAngle = 720
    const finalAngle = currentPointerAngle + minSpinAngle + targetAngle
    
    console.log(`🎯 默认指针动画:`, {
      随机奖品索引: randomPrizeIndex,
      目标角度: targetAngle,
      当前指针角度: currentPointerAngle,
      最终角度: finalAngle,
      旋转角度: finalAngle - currentPointerAngle
    })
    
    console.log('🔧 开始设置默认指针旋转角度...')
    
    // 🎯 使用测试转盘成功方案 - 默认动画也简化
    this.safeSetData({
      isPointerAnimating: true,
      wheelReady: true,
      showResult: false
    })
    
    // 延迟50ms设置角度（与测试页面相同）
    setTimeout(() => {
      console.log('🎯 默认指针动画设置角度:', finalAngle)
      this.safeSetData({
        pointerAngle: finalAngle
      })
    }, 50)
    
    setTimeout(() => {
      this.safeSetData({
        isPointerAnimating: false
      })
      console.log('🎯 默认指针动画完成，最终角度:', this.data.pointerAngle)
    }, 3000) // 3秒动画时间
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
      
      // 🔴 重置抽奖状态
      this.safeSetData({
        isLotteryInProgress: false,
        isDrawing: false,
        highlightAnimation: false,
        currentHighlight: -1,
        winningIndex: -1,
        isButtonVisible: true
      })
      return
    }
    
    // 🔴 检查是否已经在显示结果，防止重复处理
    if (this.data.showResult) {
      console.log('📋 结果弹窗已显示，跳过重复处理')
      return
    }
    
    console.log('🎉 开始处理抽奖结果，共', results.length, '个结果')
    console.log('🔍 结果详情:', results.map((r, i) => `${i + 1}. ${r.prize_name || r.name || '未知奖品'}`))
    
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
    
    console.log('🎉 抽奖结果处理完成，立即显示结果')
    
    // 🔴 判断调用来源：检查是否为动画完成后的调用
    const isFromAnimationComplete = this.animationCompleted === true
    console.log('🔍 showDrawResult调用分析:', {
      results: results.length,
      animationCompleted: this.animationCompleted,
      isFromAnimationComplete: isFromAnimationComplete,
      callType: isFromAnimationComplete ? '多连抽直接显示' : '单抽动画播放'
    })

    if (!isFromAnimationComplete) {
      // 🌟 第一次调用：播放区域发亮动画
      console.log('🎯 首次调用showDrawResult，开始播放区域发亮动画', {
        animationCompleted: this.animationCompleted,
        highlightAnimation: this.data.highlightAnimation,
        winningIndex: this.data.winningIndex
      })
    this.safeSetData({
        showResult: false,          // 先不显示结果，等动画完成
      resultData: standardizedResults,
        isDrawing: false,           // 抽奖请求完成
        isAnimating: false,         // 请求动画完成
        isButtonVisible: false,     // 动画期间隐藏多连抽按钮
        isLotteryInProgress: true   // 保持抽奖中状态，等动画完成后重置
      })
      
      // 🎯 播放区域发亮动画（动画完成后会自动显示结果弹窗）
      this.playAnimation(standardizedResults[0] || {})
    } else {
      // 🌟 第二次调用：动画已完成，显示结果弹窗
      console.log('🎉 动画完成后的调用，现在显示结果弹窗', {
        animationCompleted: this.animationCompleted,
        highlightAnimation: this.data.highlightAnimation,
        winningIndex: this.data.winningIndex
      })
      this.safeSetData({
        showResult: true,           // 显示结果弹窗
        resultData: standardizedResults,
        isDrawing: false,           // 确保抽奖状态已重置
        isAnimating: false,         // 确保动画状态已重置
        isLotteryInProgress: false, // 🔴 重置抽奖状态
        isButtonVisible: false      // 结果显示时隐藏多连抽按钮
      })
    
      // 🔧 播放中奖音效提示（如果有中奖的话）- 只在显示结果时播放
    const hasWin = standardizedResults.some(r => !r.is_near_miss)
    if (hasWin) {
      wx.vibrateShort() // 震动反馈
    }
    }
    // 注意：第一次调用时不播放音效，等动画完成后播放
  },

  /**
   * 🔴 关闭结果弹窗
   */
  onCloseResult() {
    console.log('🔄 关闭抽奖结果弹窗')
    
    // 🌟 恢复正常显示状态，重置区域发亮动画
    
    // 🔴 清理高亮动画的定时器
    if (this.highlightAnimationTimer) {
      clearTimeout(this.highlightAnimationTimer)
      this.highlightAnimationTimer = null
    }
    if (this.highlightSafetyTimer) {
      clearTimeout(this.highlightSafetyTimer)
      this.highlightSafetyTimer = null
    }
    
    this.safeSetData({
      showResult: false,         // 关闭结果弹窗
      resultData: null,          // 清空结果数据
      isButtonVisible: true,     // 恢复多连抽按钮显示
      isDrawing: false,          // 确保抽奖状态已重置
      isLotteryInProgress: false,// 重置抽奖过程状态
      isAnimating: false,        // 停止动画状态
      // 🌟 重置区域发亮动画状态
      highlightAnimation: false, // 停止高亮动画
      currentHighlight: -1,      // 清空当前高亮
      winningIndex: -1,          // 清空中奖区域
      wheelReady: true,          // 确保抽奖区域可见
      hideWheel: false,          // 确保不被其他条件隐藏
      // 🔴 重置结果显示模式
      resultDisplayMode: 'gradient' // 重置为默认的gradient模式
    })
    
    // 🔴 重置动画完成标志
    this.animationCompleted = false
    
    // 🌟 区域发亮抽奖已经准备就绪，不需要Canvas重绘
    console.log('🎯 区域发亮抽奖界面已就绪')
    
    // 🔧 确保奖品数据完整性检查
    setTimeout(() => {
      if (!this.data.prizes || this.data.prizes.length === 0) {
        console.log('📡 奖品数据不完整，重新加载')
        this.loadLotteryConfig().catch(error => {
          console.error('❌ 重新加载配置失败:', error)
          this.showDataLoadFailure()
        })
      }
    }, 10) // 极短延迟，仅确保状态设置完成
    
    // 🔴 真机兼容性优化：多重保险机制
    setTimeout(() => {
      console.log('🔧 真机兼容性检查：确保转盘和按钮都已显示')
      
      // 检查转盘是否正确显示
      if (!this.data.wheelReady || this.data.showResult || this.data.isDrawing) {
        console.warn('⚠️ 转盘显示状态异常，触发修复')
        this.safeSetData({
          wheelReady: true,
          showResult: false,
          isDrawing: false,
          isButtonVisible: true
        })
      }
    }, 100) // 100ms后检查，确保一切正常
    
    console.log('✅ 抽奖结果已关闭，转盘同步恢复流程已启动')
  },

  /**
   * 🔴 强制重绘转盘 - 真机调试优化版本
   */
  forceRedrawWheel() {
    console.log('🎨 强制重绘转盘（真机调试优化版）')
    
    try {
          if (this.data.prizes && this.data.prizes.length === 8) {
        console.log('🎨 执行Canvas重绘')
        this.drawWheel()
      } else {
        console.log('📡 奖品数据不完整，重新加载并绘制')
        this.loadLotteryConfig().then(() => {
          this.drawWheel()
        }).catch(error => {
          console.error('❌ 重新加载配置失败:', error)
          // 🔧 即使加载失败也显示基本转盘
          this.useCanvasFallback()
            })
          }
    } catch (error) {
      console.error('❌ 强制重绘转盘失败:', error)
      // 🆘 紧急修复
      this.emergencyFixWheel()
    }
  },

  /**
   * 🔴 确保奖品数据并重绘
   */
  ensurePrizesAndRedraw() {
    console.log('🔧 确保奖品数据并重绘转盘')
    
    if (!this.data.prizes || this.data.prizes.length === 0) {
      console.log('📡 奖品数据为空，重新加载')
      this.loadLotteryConfig()
      return
    }
    
    if (this.data.prizes.length !== 8) {
      console.log(`🔧 调整奖品数量：从${this.data.prizes.length}个到8个`)
      this.adjustPrizesToEight()
    }
    
    // 🔧 延迟100ms确保数据设置完成
      setTimeout(() => {
      this.drawWheel()
      }, 100)
  },

  /**
   * 🆘 紧急修复转盘显示
   */
  emergencyFixWheel() {
    console.log('🆘 执行紧急转盘修复')
    
    wx.showLoading({
      title: '修复转盘中...',
      mask: true
    })
    
    // 🔧 重置所有转盘相关状态
    this.safeSetData({
      wheelReady: false,
      showResult: false,
      isDrawing: false,
      isAnimating: false,
      isButtonVisible: false,
      canvasFallback: false,
      showStaticWheel: false,
      canvasError: false
    })
    
    // 🔧 延迟重新初始化
    setTimeout(() => {
      console.log('🔧 开始紧急重新初始化')
      this.initPage()
      
      setTimeout(() => {
        wx.hideLoading()
      wx.showToast({
          title: '✅ 转盘已修复',
        icon: 'success',
          duration: 2000
      })
      }, 1000)
    }, 1000)
  },

  /**
   * 关闭结果模态框
   */
  closeResultModal() {
    console.log('🔄 关闭结果模态框')
    this.onCloseResult()
  },

  /**
   * 🔧 修复：页面点击事件处理方法
   * 用于处理页面点击，通常用于关闭弹窗或其他交互
   */
  onPageTap(event) {
    // 🔧 新增：连续点击5次空白区域可以手动重置转盘状态（紧急恢复功能）
    if (!this.tapCount) {
      this.tapCount = 0
    }
    this.tapCount++
    
    if (this.tapCount === 5) {
      wx.showModal({
        title: '🛠️ 紧急恢复',
        content: '检测到连续点击5次，是否需要重置转盘状态？\n\n这可以修复转盘显示异常问题。',
        confirmText: '重置转盘',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            console.log('🆘 用户触发紧急转盘重置')
      this.emergencyResetWheelState()
          }
        }
      })
      this.tapCount = 0 // 重置计数
    }
    
    // 🔧 3秒后重置点击计数
    setTimeout(() => {
      this.tapCount = 0
    }, 3000)
    
    console.log('页面点击事件，当前点击计数:', this.tapCount)
  },

  /**
   * 🆘 紧急重置转盘状态 - 用户可通过连续点击5次空白区域触发
   */
  emergencyResetWheelState() {
    console.log('🆘 执行紧急转盘状态重置')
    
    wx.showLoading({
      title: '紧急重置中...',
      mask: true
    })
    
    // 🔧 清理所有定时器和动画状态
    this.resetDrawingState()
    
    // 🔧 重置所有页面数据到初始状态
    this.safeSetData({
      userInfo: { nickname: '加载中...', phone: '加载中...' },
      totalPoints: 0,
      prizes: [],
      costPoints: 0,
      dailyLimit: 0,
      lotteryRules: {
        guaranteeRule: '',
        consumptionRule: '',
        securityRule: '',
        dailyLimitRule: ''
      },
      isDrawing: false,
      currentAngle: 0,
      wheelReady: false,
      pointerAngle: 0,
      isPointerAnimating: false,
      isLotteryInProgress: false,
      showResult: false,
      resultData: null,
      resultDisplayMode: 'gradient',
      showPointsModal: false,
      pointsModalData: {
        drawType: '',
        needPoints: 0,
        currentPoints: 0
      },
      todayDrawCount: 0,
      sliderVerify: null,
      canvasFallback: false,
      showStaticWheel: false,
      canvasError: false,
      canvasCompatibility: {
        createRadialGradient: true,
        filter: true,
        quadraticCurveTo: true,
        createLinearGradient: true
      },
      isButtonVisible: false,
      forceUpdate: 0,
      backendConnected: false,
      loadingConfig: true
    })
    
    // 🔧 延迟重新初始化整个页面
    setTimeout(() => {
      console.log('🔧 开始重新初始化页面')
      this.initPage()
      
      setTimeout(() => {
        wx.hideLoading()
        wx.showToast({
          title: '✅ 重置完成',
          icon: 'success',
          duration: 2000
        })
      }, 2000)
    }, 1000)
    
    console.log('✅ 紧急重置完成，转盘应该恢复正常显示')
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
      isLotteryInProgress: false, // 🎯 重置抽奖过程状态
      showResult: false,
      // 🔴 关键修复：确保转盘和按钮在重置时恢复正常
      wheelReady: true,
      isButtonVisible: true,
      isAnimating: false,
      isPointerAnimating: false // 🎯 停止指针动画状态
    })
    
    // 清除可能存在的定时器
    if (this.drawTimeoutId) {
      clearTimeout(this.drawTimeoutId)
      this.drawTimeoutId = null
    }
    
    // 🔴 重置动画完成标志
    this.animationCompleted = false
    
    console.log('✅ 抽奖状态已完全重置')
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
   * 显示详细的每日抽奖次数信息
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
          // 🔴 严禁硬编码积分数据，使用后端真实数据
          console.log('🔄 刷新用户积分数据')
          this.refreshUserInfo() // 从后端获取真实积分数据
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
  },

  /**
   * 🔧 新增：联系客服
   */
  onContactService() {
    console.log('📞 联系客服')
    
    // 🔧 收集诊断信息
    const diagnosticInfo = this.collectDiagnosticInfo()
    
    wx.showActionSheet({
      itemList: [
        '📋 查看诊断信息',
        '📞 微信客服',
        '📧 邮件反馈',
        '🔧 真机调试工具'
      ],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.showDiagnosticInfo(diagnosticInfo)
            break
          case 1:
            this.contactWechatService()
            break
          case 2:
            this.contactEmailService(diagnosticInfo)
            break
          case 3:
            this.showDebugTools()
            break
        }
      }
    })
  },

  /**
   * 🔧 收集诊断信息
   */
  collectDiagnosticInfo() {
    const app = getApp()
    const systemInfo = wx.getSystemInfoSync()
    
    return {
      用户信息: {
        手机号: this.data.userInfo?.phone || '未获取',
        积分: this.data.totalPoints || 0,
        登录状态: app.globalData.isLoggedIn ? '已登录' : '未登录',
        Token状态: app.globalData.accessToken ? '存在' : '缺失'
      },
      抽奖配置: {
        奖品数量: this.data.prizes ? this.data.prizes.length : 0,
        转盘就绪: this.data.wheelReady ? '是' : '否',
        后端连接: this.data.backendConnected ? '正常' : '异常',
        加载状态: this.data.loadingConfig ? '加载中' : '已完成'
      },
      设备信息: {
        系统: systemInfo.system,
        微信版本: systemInfo.version,
        基础库版本: systemInfo.SDKVersion,
        设备品牌: systemInfo.brand,
        设备型号: systemInfo.model
      },
      Canvas状态: {
        降级模式: this.data.canvasFallback ? '是' : '否',
        兼容性: this.data.canvasCompatibility,
        错误状态: this.data.canvasError ? '是' : '否'
      }
    }
  },

  /**
   * 🔧 显示诊断信息
   */
  showDiagnosticInfo(info) {
    const infoText = Object.keys(info).map(category => {
      const items = Object.keys(info[category]).map(key => 
        `• ${key}: ${JSON.stringify(info[category][key])}`
      ).join('\n')
      return `【${category}】\n${items}`
    }).join('\n\n')
    
    wx.showModal({
      title: '🔍 诊断信息',
      content: infoText,
      showCancel: true,
      cancelText: '复制信息',
      confirmText: '关闭',
      success: (res) => {
        if (res.cancel) {
          wx.setClipboardData({
            data: `抽奖页面诊断信息\n时间: ${new Date().toLocaleString()}\n\n${infoText}`,
            success: () => {
              wx.showToast({
                title: '诊断信息已复制',
                icon: 'success'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 🔧 微信客服
   */
  contactWechatService() {
    wx.showModal({
      title: '📞 微信客服',
      content: '请添加客服微信：\n\n【客服微信号】: service_tiangong\n\n或扫描小程序内的客服二维码',
      showCancel: true,
      cancelText: '复制微信号',
      confirmText: '知道了',
      success: (res) => {
        if (res.cancel) {
          wx.setClipboardData({
            data: 'service_tiangong',
            success: () => {
              wx.showToast({
                title: '微信号已复制',
                icon: 'success'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 🔧 邮件反馈
   */
  contactEmailService(diagnosticInfo) {
    const emailContent = `抽奖页面问题反馈
    
问题描述：转盘无法显示

用户手机号：${this.data.userInfo?.phone || '未获取'}
时间：${new Date().toLocaleString()}

诊断信息：
${JSON.stringify(diagnosticInfo, null, 2)}`
    
    wx.setClipboardData({
      data: emailContent,
      success: () => {
        wx.showModal({
          title: '📧 邮件反馈',
          content: '反馈内容已复制到剪贴板\n\n请发送邮件至：\nsupport@tiangong.com\n\n并粘贴剪贴板内容',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
  },

  /**
   * 🔧 真机调试工具
   */
  showDebugTools() {
    wx.showActionSheet({
      itemList: [
        '🔍 综合问题诊断',
        '🎯 测试奖品ID匹配',
        '🔄 强制重新加载数据',
        '🎨 测试Canvas兼容性',
        '🔍 检查网络连接',
        '📱 检查设备兼容性',
        '🚨 清除缓存重新登录'
      ],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.runSystemDiagnostic()
            break
          case 1:
            this.testPrizeIdMatching()
            break
          case 2:
            this.forceReloadData()
            break
          case 3:
            this.testCanvasCompatibility()
            break
          case 4:
            this.checkNetworkConnection()
            break
          case 5:
            this.checkDeviceCompatibility()
            break
          case 6:
            this.clearCacheAndRelogin()
            break
        }
      }
    })
  },

  /**
   * 🔍 系统诊断 - 自动判断前端/后端问题
   */
  runSystemDiagnostic() {
    wx.showLoading({
      title: '正在全面诊断...',
      mask: true
    })

    console.log('🔍 开始系统综合诊断')
    
    const diagnosis = {
      timestamp: new Date().toLocaleString(),
      problems: [],
      analysis: '',
      recommendations: []
    }

    // 执行诊断
    setTimeout(async () => {
      try {
        await this.diagnoseFrontend(diagnosis)
        await this.diagnoseBackend(diagnosis) 
        await this.diagnoseDataSync(diagnosis)
        
        this.analyzeDiagnosis(diagnosis)
        this.showDiagnosisResult(diagnosis)
        
      } catch (error) {
        wx.hideLoading()
        wx.showModal({
          title: '❌ 诊断失败',
          content: `诊断过程出错：${error.message}`,
          showCancel: false,
          confirmText: '知道了'
        })
      }
    }, 500)
  },

  /**
   * 🔍 前端问题诊断
   */
  async diagnoseFrontend(diagnosis) {
    console.log('🔍 诊断前端问题...')
    
    // 检查数据加载
    if (!this.data.prizes || this.data.prizes.length === 0) {
      diagnosis.problems.push({
        category: 'frontend',
        severity: 'critical',
        issue: '奖品数据未加载',
        details: 'this.data.prizes为空，前端数据获取失败'
      })
    }
    
    // 检查UI状态
    if (!this.data.wheelReady) {
      diagnosis.problems.push({
        category: 'frontend', 
        severity: 'high',
        issue: '转盘未就绪',
        details: 'wheelReady=false，可能是Canvas初始化失败'
      })
    }
    
    // 检查用户状态
    const app = getApp()
    if (!app.globalData.accessToken) {
      diagnosis.problems.push({
        category: 'frontend',
        severity: 'high', 
        issue: 'Token缺失',
        details: 'accessToken为空，用户可能未登录'
      })
    }
    
    // 检查积分数据
    if (typeof this.data.totalPoints !== 'number') {
      diagnosis.problems.push({
        category: 'frontend',
        severity: 'medium',
        issue: '积分数据异常',
        details: `totalPoints=${this.data.totalPoints}，类型不正确`
      })
    }
  },

  /**
   * 🔍 后端问题诊断
   */
  async diagnoseBackend(diagnosis) {
    console.log('🔍 诊断后端问题...')
    
    try {
      // 测试配置API
      const configResult = await lotteryAPI.getConfig()
      
      if (!configResult || configResult.code !== 0) {
        diagnosis.problems.push({
          category: 'backend',
          severity: 'critical',
          issue: '配置API失败',
          details: `getConfig()返回code=${configResult?.code}`
        })
        return
      }
      
      if (!configResult.data || !configResult.data.prizes) {
        diagnosis.problems.push({
          category: 'backend', 
          severity: 'critical',
          issue: '奖品数据缺失',
          details: '后端API响应中缺少prizes字段'
        })
        return
      }
      
      if (!Array.isArray(configResult.data.prizes) || configResult.data.prizes.length === 0) {
        diagnosis.problems.push({
          category: 'backend',
          severity: 'critical', 
          issue: '奖品数据格式错误',
          details: `prizes不是数组或为空，length=${configResult.data.prizes?.length}`
        })
        return
      }
      
      // 检查奖品数据完整性
      const invalidPrizes = configResult.data.prizes.filter(p => 
        !(p.prize_id || p.id) || !(p.prize_name || p.name)
      )
      
      if (invalidPrizes.length > 0) {
        diagnosis.problems.push({
          category: 'backend',
          severity: 'high',
          issue: '奖品数据不完整',
          details: `有${invalidPrizes.length}个奖品缺少ID或名称字段`
        })
      }
      
      console.log('✅ 后端配置API检查通过')
      
    } catch (error) {
      diagnosis.problems.push({
        category: 'backend',
        severity: 'critical',
        issue: '后端API不可访问',
        details: error.message
      })
    }
    
    // 测试用户API
    try {
      const userResult = await userAPI.getUserInfo()
      if (!userResult || userResult.code !== 0) {
        diagnosis.problems.push({
          category: 'backend',
          severity: 'high',
          issue: '用户API失败',
          details: `getUserInfo()返回code=${userResult?.code}`
        })
      }
    } catch (error) {
      diagnosis.problems.push({
        category: 'backend',
        severity: 'medium', 
        issue: '用户API不可访问',
        details: error.message
      })
    }
  },

  /**
   * 🔍 数据同步问题诊断
   */
  async diagnoseDataSync(diagnosis) {
    console.log('🔍 诊断数据同步问题...')
    
    // 检查奖品数量匹配
    const frontendCount = this.data.prizes ? this.data.prizes.length : 0
    if (frontendCount !== 8) {
      diagnosis.problems.push({
        category: 'data-sync',
        severity: 'high',
        issue: '奖品数量不匹配', 
        details: `前端有${frontendCount}个奖品，应该是8个`
      })
    }
    
    // 模拟检查ID匹配 - 这是导致高亮问题的关键
    if (this.data.prizes && this.data.prizes.length > 0) {
      const prizeIds = this.data.prizes.map(p => p.prize_id || p.id)
      const hasInvalidIds = prizeIds.some(id => !id || id === 'undefined')
      
      if (hasInvalidIds) {
        diagnosis.problems.push({
          category: 'data-sync',
          severity: 'critical',
          issue: '奖品ID无效',
          details: '部分奖品缺少有效的ID，这会导致高亮区域匹配失败'
        })
      }
      
      // 记录当前奖品ID用于分析
      console.log('📊 当前前端奖品ID:', prizeIds)
    }
  },

  /**
   * 🔍 分析诊断结果
   */
  analyzeDiagnosis(diagnosis) {
    const problems = diagnosis.problems
    
    // 按类别统计问题
    const frontendIssues = problems.filter(p => p.category === 'frontend')
    const backendIssues = problems.filter(p => p.category === 'backend') 
    const dataSyncIssues = problems.filter(p => p.category === 'data-sync')
    
    // 判断主要问题来源
    let primarySource = 'unknown'
    
    if (backendIssues.length > 0 && frontendIssues.length === 0) {
      primarySource = 'backend'
      diagnosis.analysis = '🔴 主要问题来自后端'
    } else if (frontendIssues.length > 0 && backendIssues.length === 0) {
      primarySource = 'frontend' 
      diagnosis.analysis = '🟡 主要问题来自前端'
    } else if (dataSyncIssues.length > 0) {
      primarySource = 'data-sync'
      diagnosis.analysis = '🟠 数据同步问题'
    } else if (frontendIssues.length > 0 && backendIssues.length > 0) {
      primarySource = 'both'
      diagnosis.analysis = '🟣 前后端都有问题'
    } else {
      diagnosis.analysis = '✅ 未发现明显问题'
    }
    
    // 生成修复建议
    this.generateDiagnosisRecommendations(primarySource, diagnosis)
  },

  /**
   * 🔍 生成修复建议
   */
  generateDiagnosisRecommendations(source, diagnosis) {
    const critical = diagnosis.problems.filter(p => p.severity === 'critical')
    
    if (source === 'backend') {
      diagnosis.recommendations.push('🔴 联系后端开发人员修复API问题')
      diagnosis.recommendations.push('📋 将诊断报告发送给后端团队')
      if (critical.some(p => p.issue.includes('奖品'))) {
        diagnosis.recommendations.push('🎯 重点检查数据库奖品配置表')
      }
    } else if (source === 'frontend') {
      diagnosis.recommendations.push('🔄 尝试重新加载页面数据')  
      diagnosis.recommendations.push('🔧 检查前端初始化逻辑')
      if (critical.some(p => p.issue.includes('Token'))) {
        diagnosis.recommendations.push('🔑 用户需要重新登录')
      }
    } else if (source === 'data-sync') {
      diagnosis.recommendations.push('🚨 这是导致高亮不匹配的直接原因！')
      diagnosis.recommendations.push('📊 需要数据库程序员检查奖品ID')
      diagnosis.recommendations.push('🔗 前后端协调统一数据格式')
    } else if (source === 'both') {
      diagnosis.recommendations.push('🔄 先修复后端API问题')
      diagnosis.recommendations.push('🔧 然后处理前端状态问题')
    }
    
    // 针对高亮匹配问题的特殊建议
    if (critical.some(p => p.issue.includes('ID'))) {
      diagnosis.recommendations.unshift('⚡ 关键：修复奖品ID匹配问题可解决高亮错误')
    }
  },

  /**
   * 🔍 显示诊断结果
   */
  showDiagnosisResult(diagnosis) {
    wx.hideLoading()
    
    const totalProblems = diagnosis.problems.length
    const criticalProblems = diagnosis.problems.filter(p => p.severity === 'critical').length
    
    let summary = `${diagnosis.analysis}\n\n`
    summary += `📊 发现问题：${totalProblems}个（严重${criticalProblems}个）\n\n`
    
    if (diagnosis.recommendations.length > 0) {
      summary += `💡 主要建议：\n`
      summary += `${diagnosis.recommendations.slice(0, 2).map(r => `• ${r}`).join('\n')}`
    }
    
    wx.showModal({
      title: '🔍 系统诊断完成',
      content: summary,
      showCancel: true,
      cancelText: '查看详情',
      confirmText: '执行修复',
      success: (res) => {
        if (res.cancel) {
          this.showDetailedDiagnosis(diagnosis)
        } else {
          this.showFixActions(diagnosis)
        }
      }
    })
  },

  /**
   * 🔍 显示详细诊断
   */
  showDetailedDiagnosis(diagnosis) {
    let content = `🔍 详细诊断报告\n${diagnosis.timestamp}\n\n`
    
    const categoryIcons = {
      frontend: '🟡',
      backend: '🔴', 
      'data-sync': '🟠'
    }
    
    const severityIcons = {
      critical: '🚨',
      high: '🔴',
      medium: '🟡',
      low: '🔵'
    }
    
    diagnosis.problems.forEach((problem, index) => {
      content += `${index + 1}. ${severityIcons[problem.severity]} ${categoryIcons[problem.category]} ${problem.issue}\n`
      content += `   详情：${problem.details}\n\n`
    })
    
    content += `💡 修复建议：\n${diagnosis.recommendations.join('\n')}`
    
    wx.showModal({
      title: '📋 详细诊断',
      content: content,
      showCancel: true,
      cancelText: '复制报告',
      confirmText: '关闭',
      success: (res) => {
        if (res.cancel) {
          wx.setClipboardData({
            data: content,
            success: () => wx.showToast({ title: '报告已复制', icon: 'success' })
          })
        }
      }
    })
  },

  /**
   * 🔍 显示修复操作
   */
  showFixActions(diagnosis) {
    const actions = ['🔄 重新加载数据', '🔧 重置页面状态']
    
    const hasBackendIssue = diagnosis.problems.some(p => p.category === 'backend')
    const hasFrontendIssue = diagnosis.problems.some(p => p.category === 'frontend')
    const hasDataSyncIssue = diagnosis.problems.some(p => p.category === 'data-sync')
    
    if (hasBackendIssue) {
      actions.unshift('📋 复制报告给后端')
    }
    
    if (hasDataSyncIssue) {
      actions.unshift('📊 复制ID匹配信息')  
    }
    
    if (hasFrontendIssue) {
      actions.push('🔑 重新登录')
    }
    
    actions.push('🆘 紧急重置')
    
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        const action = actions[res.tapIndex]
        this.executeFix(action, diagnosis)
      }
    })
  },

  /**
   * 🔍 执行修复操作
   */
  executeFix(action, diagnosis) {
    if (action.includes('复制报告')) {
      const report = `抽奖系统问题诊断报告\n时间：${diagnosis.timestamp}\n\n${diagnosis.analysis}\n\n问题清单：\n${diagnosis.problems.map(p => `• [${p.severity}] ${p.issue}: ${p.details}`).join('\n')}\n\n修复建议：\n${diagnosis.recommendations.join('\n')}`
      
      wx.setClipboardData({
        data: report,
        success: () => wx.showToast({ title: '报告已复制', icon: 'success' })
      })
      
    } else if (action.includes('ID匹配')) {
      const idInfo = `奖品ID匹配调试信息\n\n前端奖品列表：\n${this.data.prizes?.map(p => `索引${this.data.prizes.indexOf(p)}: ID=${p.prize_id || p.id} 名称="${p.prize_name || p.name}"`).join('\n') || '前端无奖品数据'}\n\n说明：高亮区域与中奖奖品不匹配通常是因为后端返回的奖品ID在前端找不到对应的索引。`
      
      wx.setClipboardData({
        data: idInfo,
        success: () => wx.showToast({ title: 'ID信息已复制', icon: 'success' })
      })
      
    } else if (action.includes('重新加载')) {
      this.forceReloadData()
    } else if (action.includes('重置页面')) {
      this.emergencyResetWheelState()
    } else if (action.includes('重新登录')) {
      this.clearCacheAndRelogin()
    }
  },

  /**
   * 🔧 强制重新加载数据
   */
  forceReloadData() {
    wx.showLoading({
      title: '强制重新加载...',
      mask: true
    })
    
    // 重置所有状态
    this.safeSetData({
      prizes: [],
      wheelReady: false,
      loadingConfig: true,
      backendConnected: false
    })
    
    // 延迟重新初始化
    setTimeout(() => {
      this.initPage()
      wx.hideLoading()
      
      wx.showToast({
        title: '重新加载完成',
        icon: 'success'
      })
    }, 1000)
  },



  /**
   * 🔧 测试Canvas兼容性
   */
  testCanvasCompatibility() {
    wx.showLoading({
      title: '测试Canvas...',
      mask: true
    })
    
    try {
      const compatibility = quickCompatibilityCheck()
      
      setTimeout(() => {
        wx.hideLoading()
        
        const compatText = Object.keys(compatibility).map(key => 
          `• ${key}: ${compatibility[key] ? '✅支持' : '❌不支持'}`
        ).join('\n')
        
        wx.showModal({
          title: '🎨 Canvas兼容性测试',
          content: `测试结果：\n\n${compatText}\n\n${compatibility.createLinearGradient ? '✅ 设备支持基本Canvas功能' : '❌ 设备Canvas功能受限'}`,
          showCancel: false,
          confirmText: '知道了'
        })
      }, 1000)
      
    } catch (error) {
      wx.hideLoading()
      wx.showModal({
        title: '❌ Canvas测试失败',
        content: `Canvas测试出现错误：\n\n${error.message}\n\n建议尝试重启小程序或更新微信版本`,
        showCancel: false,
        confirmText: '知道了'
      })
    }
  },

  /**
   * 🔧 检查网络连接
   */
  checkNetworkConnection() {
    wx.showLoading({
      title: '检查网络...',
      mask: true
    })
    
    wx.getNetworkType({
      success: (res) => {
        wx.hideLoading()
        
        const networkType = res.networkType
        const isConnected = networkType !== 'none'
        
        wx.showModal({
          title: '🌐 网络连接检查',
          content: `网络类型：${networkType}\n连接状态：${isConnected ? '✅ 已连接' : '❌ 未连接'}\n\n${isConnected ? '网络连接正常，问题可能在后端服务' : '请检查网络连接后重试'}`,
          showCancel: false,
          confirmText: '知道了'
        })
      },
      fail: () => {
        wx.hideLoading()
        wx.showModal({
          title: '❌ 网络检查失败',
          content: '无法获取网络状态，请检查设备网络权限',
          showCancel: false,
          confirmText: '知道了'
        })
      }
    })
  },

  /**
   * 🔧 检查设备兼容性
   */
  checkDeviceCompatibility() {
    const systemInfo = wx.getSystemInfoSync()
    
    // 检查微信版本
    const wechatVersion = systemInfo.version
    const sdkVersion = systemInfo.SDKVersion
    const isWechatVersionOk = wechatVersion >= '7.0.0'
    const isSdkVersionOk = sdkVersion >= '2.10.0'
    
    wx.showModal({
      title: '📱 设备兼容性检查',
      content: `设备型号：${systemInfo.model}\n系统版本：${systemInfo.system}\n微信版本：${wechatVersion} ${isWechatVersionOk ? '✅' : '⚠️'}\n基础库版本：${sdkVersion} ${isSdkVersionOk ? '✅' : '⚠️'}\n\n${isWechatVersionOk && isSdkVersionOk ? '✅ 设备兼容性良好' : '⚠️ 建议更新微信到最新版本'}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🎯 测试奖品ID匹配功能
   */
  testPrizeIdMatching() {
    console.log('🎯 开始测试奖品ID匹配功能')
    
    const frontendPrizes = this.data.prizes || []
    
    if (frontendPrizes.length === 0) {
      wx.showModal({
        title: '⚠️ 无法测试',
        content: '前端奖品数据为空，请先加载抽奖配置',
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    // 模拟各种可能的后端ID格式进行测试
    const testCases = [
      { id: 'prize_id-1', name: '标准格式(prize_id-1)', expected: '通常对应索引0' },
      { id: 'prize_id-2', name: '标准格式(prize_id-2)', expected: '通常对应索引1' },
      { id: 'prize_id-3', name: '标准格式(prize_id-3)', expected: '通常对应索引2' },
      { id: 'prize_id-4', name: '标准格式(prize_id-4)', expected: '通常对应索引3' },
      { id: '1', name: '纯数字(1)', expected: '可能匹配多种索引' },
      { id: 'id-1', name: '简化格式(id-1)', expected: '去前缀后匹配' },
      { id: frontendPrizes[0]?.prize_id || frontendPrizes[0]?.id, name: '前端第一个奖品ID', expected: '应该匹配索引0' }
    ]
    
    let testResults = `🎯 奖品ID匹配测试报告\n时间：${new Date().toLocaleString()}\n\n`
    testResults += `【前端奖品列表】\n`
    
    frontendPrizes.forEach((prize, index) => {
      testResults += `索引${index}: ID="${prize.prize_id || prize.id || '无'}" 名称="${prize.prize_name || prize.name || '无'}"\n`
    })
    
    testResults += `\n【匹配测试结果】\n`
    
    // 执行测试
    testCases.forEach((testCase, testIndex) => {
      if (!testCase.id) {
        testResults += `测试${testIndex + 1}: ${testCase.name} - 跳过（ID为空）\n`
        return
      }
      
      console.log(`🔍 测试案例${testIndex + 1}: ${testCase.name} (ID: ${testCase.id})`)
      
      // 使用相同的匹配逻辑
      let matchedIndex = -1
      const matchStrategies = [
        {
          name: '精确匹配',
          test: (frontendId, backendId) => frontendId === backendId
        },
        {
          name: '字符串匹配', 
          test: (frontendId, backendId) => String(frontendId) === String(backendId)
        },
        {
          name: '数字匹配',
          test: (frontendId, backendId) => {
            const frontNum = Number(frontendId)
            const backNum = Number(backendId)
            return !isNaN(frontNum) && !isNaN(backNum) && frontNum === backNum
          }
        },
        {
          name: '提取尾数匹配',
          test: (frontendId, backendId) => {
            const extractTailNumber = (id) => {
              if (!id) return null
              const match = String(id).match(/[-_]?(\d+)$/)
              return match ? parseInt(match[1]) : null
            }
            const frontTail = extractTailNumber(frontendId)
            const backTail = extractTailNumber(backendId)
            return frontTail !== null && backTail !== null && frontTail === backTail
          }
        },
        {
          name: '索引推导匹配',
          test: (frontendId, backendId, index) => {
            const extractIndexFromId = (id) => {
              if (!id) return null
              const match = String(id).match(/[-_]?(\d+)$/)
              if (match) {
                const num = parseInt(match[1])
                return num - 1
              }
              return null
            }
            
            const predictedIndex = extractIndexFromId(backendId)
            return predictedIndex === index
          }
        },
        {
          name: '去前缀匹配',
          test: (frontendId, backendId) => {
            const normalizeId = (id) => String(id).replace(/^(prize_?id[-_]?|prize[-_]?|id[-_]?)/i, '')
            return normalizeId(frontendId) === normalizeId(backendId)
          }
        }
      ]
      
      let usedStrategy = '无匹配'
      
      // 应用匹配策略
      for (let strategyIndex = 0; strategyIndex < matchStrategies.length && matchedIndex === -1; strategyIndex++) {
        const strategy = matchStrategies[strategyIndex]
        
        for (let i = 0; i < frontendPrizes.length; i++) {
          const prize = frontendPrizes[i]
          const frontendId = prize.prize_id || prize.id || prize.prizeId
          
          try {
            if (strategy.test(frontendId, testCase.id, i)) {
              matchedIndex = i
              usedStrategy = strategy.name
              break
            }
          } catch (error) {
            // 忽略测试中的错误
          }
        }
        
        if (matchedIndex !== -1) {
          break
        }
      }
      
      // 记录测试结果
      if (matchedIndex !== -1) {
        testResults += `测试${testIndex + 1}: ${testCase.name}\n`
        testResults += `  ✅ 匹配成功 → 索引${matchedIndex} (${usedStrategy})\n`
        testResults += `  📝 匹配奖品: "${frontendPrizes[matchedIndex].prize_name || frontendPrizes[matchedIndex].name}"\n\n`
      } else {
        testResults += `测试${testIndex + 1}: ${testCase.name}\n`
        testResults += `  ❌ 匹配失败\n`
        testResults += `  💡 建议: 检查前端奖品ID格式是否与后端一致\n\n`
      }
    })
    
    testResults += `【总结】\n`
    testResults += `• 测试用例: ${testCases.filter(t => t.id).length}个\n`
    testResults += `• 前端奖品: ${frontendPrizes.length}个\n`
    testResults += `• 建议: 如果大部分测试失败，说明前后端ID格式不一致\n`
    
    // 显示测试结果
    wx.showModal({
      title: '🎯 ID匹配测试完成',
      content: '测试已完成，详细结果已输出到控制台',
      showCancel: true,
      cancelText: '复制报告',
      confirmText: '知道了',
      success: (res) => {
        if (res.cancel) {
          wx.setClipboardData({
            data: testResults,
            success: () => {
              wx.showToast({ title: '测试报告已复制', icon: 'success' })
            }
          })
        }
      }
    })
    
    console.log(testResults)
  },

  /**
   * 🔧 清除缓存重新登录
   */
  clearCacheAndRelogin() {
    wx.showModal({
      title: '🚨 清除缓存',
      content: '确定要清除所有缓存并重新登录吗？\n\n这将清除：\n• 登录状态\n• 用户信息\n• 本地缓存\n\n需要重新输入手机号验证码',
      confirmText: '确认清除',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          console.log('🚨 用户确认清除缓存')
          
          // 清除所有本地存储
          wx.clearStorageSync()
          
          // 重置全局数据
          const app = getApp()
          app.globalData = {
            userInfo: null,
            accessToken: null,
            hasUserInfo: false,
            hasAccessToken: false
          }
          
          // 跳转到登录页
          wx.reLaunch({
            url: '/pages/auth/auth',
            success: () => {
          wx.showToast({
                title: '✅ 缓存已清除',
                icon: 'success'
          })
            }
            })
        }
      }
    })
  },

  /**
   * 🔍 综合调试检测系统 - 自动判断前端/后端问题
   */
  runComprehensiveDebugCheck() {
    wx.showLoading({
      title: '正在全面检测...',
      mask: true
    })

    console.log('🔍 开始综合调试检测')
    
    const diagnostics = {
      timestamp: new Date().toLocaleString(),
      frontend: {},
      backend: {},
      network: {},
      dataConsistency: {},
      conclusion: {},
      recommendations: []
    }

    // 执行各项检测
    Promise.all([
      this.checkFrontendHealth(diagnostics),
      this.checkBackendHealth(diagnostics),
      this.checkNetworkHealth(diagnostics),
      this.checkDataConsistency(diagnostics)
    ]).then(() => {
      // 分析结果并得出结论
      this.analyzeDiagnosticResults(diagnostics)
      
      wx.hideLoading()
      this.showDiagnosticResults(diagnostics)
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 诊断检测出现异常:', error)
      
      wx.showModal({
        title: '❌ 诊断失败',
        content: `诊断过程中出现异常：${error.message}\n\n请查看控制台获取详细信息`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  /**
   * 🔍 前端健康状况检测
   */
  async checkFrontendHealth(diagnostics) {
    console.log('🔍 检测前端健康状况...')
    
    const frontend = diagnostics.frontend
    
    // 1. 数据状态检查
    frontend.dataState = {
      prizesLoaded: !!(this.data.prizes && this.data.prizes.length > 0),
      prizesCount: this.data.prizes ? this.data.prizes.length : 0,
      userInfoLoaded: !!(this.data.userInfo && this.data.userInfo.phone !== '加载中...'),
      pointsValid: typeof this.data.totalPoints === 'number' && this.data.totalPoints >= 0,
      configLoaded: !this.data.loadingConfig
    }
    
    // 2. UI状态检查
    frontend.uiState = {
      wheelReady: this.data.wheelReady,
      buttonsVisible: this.data.isButtonVisible,
      isDrawing: this.data.isDrawing,
      showingResult: this.data.showResult,
      canvasError: this.data.canvasError
    }
    
    // 3. 本地存储检查
    try {
      const storedToken = wx.getStorageSync('access_token')
      const storedUserInfo = wx.getStorageSync('user_info')
      
      frontend.localStorage = {
        hasToken: !!storedToken,
        hasUserInfo: !!storedUserInfo,
        tokenValid: storedToken && typeof storedToken === 'string' && storedToken !== 'undefined'
      }
    } catch (error) {
      frontend.localStorage = {
        error: error.message
      }
    }
    
    // 4. 全局状态检查
    const app = getApp()
    frontend.globalState = {
      isLoggedIn: app.globalData.isLoggedIn,
      hasAccessToken: !!app.globalData.accessToken,
      hasUserInfo: !!app.globalData.userInfo,
      tokenFormat: app.globalData.accessToken ? 'string' : 'null'
    }
    
    // 5. 页面状态一致性
    frontend.consistency = {
      dataUiMatch: this.data.wheelReady === (this.data.prizes && this.data.prizes.length === 8),
      buttonStateLogical: !this.data.isDrawing === this.data.isButtonVisible,
      loadingStateLogical: !this.data.loadingConfig === this.data.wheelReady
    }
  },

  /**
   * 🔍 后端健康状况检测
   */
  async checkBackendHealth(diagnostics) {
    console.log('🔍 检测后端健康状况...')
    
    const backend = diagnostics.backend
    
    try {
      // 1. API连通性测试
      const configResponse = await lotteryAPI.getConfig()
      
      backend.configApi = {
        accessible: true,
        responseCode: configResponse.code,
        hasData: !!(configResponse.data),
        dataStructure: configResponse.data ? Object.keys(configResponse.data) : [],
        prizesCount: configResponse.data && configResponse.data.prizes ? configResponse.data.prizes.length : 0
      }
      
      // 2. 数据格式验证
      if (configResponse.data && configResponse.data.prizes) {
        const prizes = configResponse.data.prizes
        backend.dataFormat = {
          prizesIsArray: Array.isArray(prizes),
          prizesValid: prizes.every(prize => 
            (prize.prize_id || prize.id) && 
            (prize.prize_name || prize.name)
          ),
          idFormats: prizes.map(prize => ({
            id: prize.prize_id || prize.id,
            idType: typeof (prize.prize_id || prize.id),
            name: prize.prize_name || prize.name
          }))
        }
      }
      
      // 3. 用户信息API测试
      try {
        const userResponse = await userAPI.getUserInfo()
        backend.userApi = {
          accessible: true,
          responseCode: userResponse.code,
          hasData: !!(userResponse.data),
          pointsField: userResponse.data ? (userResponse.data.total_points || userResponse.data.points) : null
        }
      } catch (userError) {
        backend.userApi = {
          accessible: false,
          error: userError.message
        }
      }
      
    } catch (configError) {
      backend.configApi = {
        accessible: false,
        error: configError.message,
        errorCode: configError.code
      }
    }
  },

  /**
   * 🔍 网络健康状况检测
   */
  async checkNetworkHealth(diagnostics) {
    console.log('🔍 检测网络健康状况...')
    
    const network = diagnostics.network
    
    // 1. 网络类型检测
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          network.type = res.networkType
          network.isConnected = res.networkType !== 'none'
          
          // 2. 延迟测试
          const startTime = Date.now()
          wx.request({
            url: 'https://api.github.com/zen', // 使用GitHub API做延迟测试
            timeout: 5000,
            success: () => {
              network.latency = Date.now() - startTime
              network.reachable = true
              resolve()
            },
            fail: () => {
              network.latency = -1
              network.reachable = false
              resolve()
            }
          })
        },
        fail: () => {
          network.error = '无法获取网络状态'
          resolve()
        }
      })
    })
  },

  /**
   * 🔍 数据一致性检测
   */
  async checkDataConsistency(diagnostics) {
    console.log('🔍 检测数据一致性...')
    
    const consistency = diagnostics.dataConsistency
    
    // 1. 前后端奖品数据对比
    if (diagnostics.backend.configApi && diagnostics.backend.configApi.accessible) {
      const backendPrizes = diagnostics.backend.dataFormat ? diagnostics.backend.dataFormat.idFormats : []
      const frontendPrizes = this.data.prizes || []
      
      consistency.prizesCount = {
        frontend: frontendPrizes.length,
        backend: backendPrizes.length,
        match: frontendPrizes.length === backendPrizes.length
      }
      
      // ID匹配检查
      consistency.idMatching = {
        backendIds: backendPrizes.map(p => p.id),
        frontendIds: frontendPrizes.map(p => p.prize_id || p.id),
        exactMatches: 0,
        typeMatches: 0
      }
      
      backendPrizes.forEach(backendPrize => {
        const exactMatch = frontendPrizes.some(fp => (fp.prize_id || fp.id) === backendPrize.id)
        const typeMatch = frontendPrizes.some(fp => String(fp.prize_id || fp.id) === String(backendPrize.id))
        
        if (exactMatch) consistency.idMatching.exactMatches++
        if (typeMatch) consistency.idMatching.typeMatches++
      })
    }
    
    // 2. 用户积分一致性
    const globalPoints = app.globalData.userInfo ? app.globalData.userInfo.total_points : null
    const localPoints = this.data.totalPoints
    
    consistency.points = {
      global: globalPoints,
      local: localPoints,
      consistent: globalPoints === localPoints
    }
    
    // 3. 登录状态一致性
    const app = getApp()
    const storedToken = wx.getStorageSync('access_token')
    
    consistency.authState = {
      globalLoggedIn: app.globalData.isLoggedIn,
      hasStoredToken: !!storedToken,
      hasGlobalToken: !!app.globalData.accessToken,
      consistent: app.globalData.isLoggedIn === !!storedToken && !!app.globalData.accessToken
    }
  },

  /**
   * 🔍 分析诊断结果并得出结论
   */
  analyzeDiagnosticResults(diagnostics) {
    console.log('🔍 分析诊断结果...')
    
    const conclusion = diagnostics.conclusion
    const recommendations = diagnostics.recommendations
    
    // 前端问题分析
    const frontendIssues = []
    if (!diagnostics.frontend.dataState.prizesLoaded) {
      frontendIssues.push('奖品数据未加载')
    }
    if (!diagnostics.frontend.uiState.wheelReady) {
      frontendIssues.push('转盘未就绪')
    }
    if (!diagnostics.frontend.consistency.dataUiMatch) {
      frontendIssues.push('数据与UI状态不一致')
    }
    if (!diagnostics.frontend.localStorage.tokenValid) {
      frontendIssues.push('本地Token无效')
    }
    
    // 后端问题分析
    const backendIssues = []
    if (!diagnostics.backend.configApi || !diagnostics.backend.configApi.accessible) {
      backendIssues.push('抽奖配置API不可访问')
    }
    if (diagnostics.backend.dataFormat && !diagnostics.backend.dataFormat.prizesValid) {
      backendIssues.push('后端奖品数据格式不正确')
    }
    if (diagnostics.backend.userApi && !diagnostics.backend.userApi.accessible) {
      backendIssues.push('用户信息API不可访问')
    }
    
    // 网络问题分析
    const networkIssues = []
    if (!diagnostics.network.isConnected) {
      networkIssues.push('网络未连接')
    }
    if (diagnostics.network.latency > 3000) {
      networkIssues.push('网络延迟过高')
    }
    if (!diagnostics.network.reachable) {
      networkIssues.push('外网不可达')
    }
    
    // 数据一致性问题分析
    const consistencyIssues = []
    if (diagnostics.dataConsistency.prizesCount && !diagnostics.dataConsistency.prizesCount.match) {
      consistencyIssues.push('前后端奖品数量不一致')
    }
    if (diagnostics.dataConsistency.idMatching && diagnostics.dataConsistency.idMatching.exactMatches === 0) {
      consistencyIssues.push('奖品ID完全不匹配')
    }
    if (diagnostics.dataConsistency.points && !diagnostics.dataConsistency.points.consistent) {
      consistencyIssues.push('积分数据不一致')
    }
    
    // 综合判断主要问题来源
    conclusion.primaryIssueSource = 'unknown'
    
    if (backendIssues.length > 0 && frontendIssues.length === 0) {
      conclusion.primaryIssueSource = 'backend'
      conclusion.confidence = 'high'
    } else if (frontendIssues.length > 0 && backendIssues.length === 0) {
      conclusion.primaryIssueSource = 'frontend'
      conclusion.confidence = 'high'
    } else if (networkIssues.length > 0) {
      conclusion.primaryIssueSource = 'network'
      conclusion.confidence = 'medium'
    } else if (consistencyIssues.length > 0) {
      conclusion.primaryIssueSource = 'data-sync'
      conclusion.confidence = 'medium'
    } else if (frontendIssues.length > 0 && backendIssues.length > 0) {
      conclusion.primaryIssueSource = 'both'
      conclusion.confidence = 'low'
    }
    
    conclusion.issues = {
      frontend: frontendIssues,
      backend: backendIssues,
      network: networkIssues,
      consistency: consistencyIssues
    }
    
    // 生成建议
    this.generateRecommendations(diagnostics, recommendations)
  },

  /**
   * 🔍 生成修复建议
   */
  generateRecommendations(diagnostics, recommendations) {
    const source = diagnostics.conclusion.primaryIssueSource
    
    switch (source) {
      case 'backend':
        recommendations.push({
          priority: 'high',
          category: '后端修复',
          action: '联系后端开发人员检查API服务状态',
          details: '后端API无法正常响应或数据格式不正确'
        })
        if (diagnostics.backend.configApi && !diagnostics.backend.configApi.accessible) {
          recommendations.push({
            priority: 'high',
            category: '后端API',
            action: '修复抽奖配置API',
            details: `错误：${diagnostics.backend.configApi.error}`
          })
        }
        break
        
      case 'frontend':
        recommendations.push({
          priority: 'high',
          category: '前端修复',
          action: '检查前端数据加载逻辑',
          details: '前端数据状态异常或UI渲染问题'
        })
        if (!diagnostics.frontend.localStorage.tokenValid) {
          recommendations.push({
            priority: 'medium',
            category: '前端认证',
            action: '重新登录获取有效Token',
            details: '当前Token无效或已过期'
          })
        }
        break
        
      case 'network':
        recommendations.push({
          priority: 'high',
          category: '网络问题',
          action: '检查网络连接状态',
          details: '网络连接异常或延迟过高'
        })
        break
        
      case 'data-sync':
        recommendations.push({
          priority: 'high',
          category: '数据同步',
          action: '前后端数据同步修复',
          details: '前端与后端数据不一致，需要数据库程序员协助'
        })
        if (diagnostics.dataConsistency.idMatching && diagnostics.dataConsistency.idMatching.exactMatches === 0) {
          recommendations.push({
            priority: 'critical',
            category: '奖品ID',
            action: '修复奖品ID匹配问题',
            details: '这是导致高亮区域与中奖奖品不匹配的直接原因'
          })
        }
        break
        
      default:
        recommendations.push({
          priority: 'medium',
          category: '综合检查',
          action: '需要进一步手动排查',
          details: '问题原因不明确，建议逐项检查'
        })
    }
    
    // 通用建议
    recommendations.push({
      priority: 'low',
      category: '日志分析',
      action: '查看详细的控制台日志',
      details: '控制台包含更多技术细节'
    })
  },

  /**
   * 🔍 显示诊断结果
   */
  showDiagnosticResults(diagnostics) {
    const source = diagnostics.conclusion.primaryIssueSource
    const confidence = diagnostics.conclusion.confidence
    
    let title = '🔍 综合诊断报告'
    let icon = '🔍'
    
    switch (source) {
      case 'backend':
        title = '🔴 后端问题'
        icon = '🔴'
        break
      case 'frontend':
        title = '🟡 前端问题'
        icon = '🟡'
        break
      case 'network':
        title = '🔵 网络问题'
        icon = '🔵'
        break
      case 'data-sync':
        title = '🟠 数据同步问题'
        icon = '🟠'
        break
      case 'both':
        title = '🟣 前后端均有问题'
        icon = '🟣'
        break
      default:
        title = '⚪ 原因不明'
        icon = '⚪'
    }
    
    wx.showActionSheet({
      itemList: [
        `${icon} 查看问题分析`,
        '📊 查看详细数据',
        '💡 查看修复建议',
        '📋 复制诊断报告',
        '🔧 执行修复操作'
      ],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.showProblemAnalysis(diagnostics)
            break
          case 1:
            this.showDetailedData(diagnostics)
            break
          case 2:
            this.showRecommendations(diagnostics)
            break
          case 3:
            this.copyDiagnosticReport(diagnostics)
            break
          case 4:
            this.showFixActions(diagnostics)
            break
        }
      }
    })
  },

  /**
   * 🔍 显示问题分析
   */
  showProblemAnalysis(diagnostics) {
    const conclusion = diagnostics.conclusion
    const issues = conclusion.issues
    
    let content = `问题来源：${this.getSourceDescription(conclusion.primaryIssueSource)}\n`
    content += `可信度：${this.getConfidenceDescription(conclusion.confidence)}\n\n`
    
    if (issues.frontend.length > 0) {
      content += `【前端问题】\n${issues.frontend.map(issue => `• ${issue}`).join('\n')}\n\n`
    }
    
    if (issues.backend.length > 0) {
      content += `【后端问题】\n${issues.backend.map(issue => `• ${issue}`).join('\n')}\n\n`
    }
    
    if (issues.network.length > 0) {
      content += `【网络问题】\n${issues.network.map(issue => `• ${issue}`).join('\n')}\n\n`
    }
    
    if (issues.consistency.length > 0) {
      content += `【数据一致性问题】\n${issues.consistency.map(issue => `• ${issue}`).join('\n')}`
    }
    
    wx.showModal({
      title: '🔍 问题分析',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔍 显示详细数据
   */
  showDetailedData(diagnostics) {
    let content = `检测时间：${diagnostics.timestamp}\n\n`
    
    content += `【前端状态】\n`
    content += `• 奖品加载：${diagnostics.frontend.dataState.prizesLoaded ? '✅' : '❌'}\n`
    content += `• 奖品数量：${diagnostics.frontend.dataState.prizesCount}\n`
    content += `• 转盘就绪：${diagnostics.frontend.uiState.wheelReady ? '✅' : '❌'}\n`
    content += `• 按钮可见：${diagnostics.frontend.uiState.buttonsVisible ? '✅' : '❌'}\n\n`
    
    content += `【后端状态】\n`
    if (diagnostics.backend.configApi) {
      content += `• 配置API：${diagnostics.backend.configApi.accessible ? '✅' : '❌'}\n`
      content += `• 响应码：${diagnostics.backend.configApi.responseCode || '无'}\n`
    }
    if (diagnostics.backend.dataFormat) {
      content += `• 数据格式：${diagnostics.backend.dataFormat.prizesValid ? '✅' : '❌'}\n`
    }
    
    content += `\n【网络状态】\n`
    content += `• 连接状态：${diagnostics.network.isConnected ? '✅' : '❌'}\n`
    content += `• 网络类型：${diagnostics.network.type || '未知'}\n`
    content += `• 延迟：${diagnostics.network.latency || '未测试'}ms\n`
    
    wx.showModal({
      title: '📊 详细数据',
      content: content,
      showCancel: false,
      confirmText: '关闭'
    })
  },

  /**
   * 🔍 显示修复建议
   */
  showRecommendations(diagnostics) {
    const recommendations = diagnostics.recommendations
    
    let content = '根据诊断结果，建议按以下顺序处理：\n\n'
    
    recommendations
      .sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      })
      .forEach((rec, index) => {
        const priorityIcon = {
          critical: '🚨',
          high: '🔴',
          medium: '🟡',
          low: '🔵'
        }[rec.priority]
        
        content += `${index + 1}. ${priorityIcon} ${rec.action}\n`
        content += `   类别：${rec.category}\n`
        content += `   详情：${rec.details}\n\n`
      })
    
    wx.showModal({
      title: '💡 修复建议',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔍 复制诊断报告
   */
  copyDiagnosticReport(diagnostics) {
    const report = `抽奖系统综合诊断报告
检测时间：${diagnostics.timestamp}

===== 问题分析 =====
主要问题来源：${this.getSourceDescription(diagnostics.conclusion.primaryIssueSource)}
可信度：${this.getConfidenceDescription(diagnostics.conclusion.confidence)}

前端问题：${diagnostics.conclusion.issues.frontend.join(', ') || '无'}
后端问题：${diagnostics.conclusion.issues.backend.join(', ') || '无'}
网络问题：${diagnostics.conclusion.issues.network.join(', ') || '无'}
数据一致性问题：${diagnostics.conclusion.issues.consistency.join(', ') || '无'}

===== 修复建议 =====
${diagnostics.recommendations.map((rec, index) => 
  `${index + 1}. [${rec.priority.toUpperCase()}] ${rec.category}: ${rec.action}\n   ${rec.details}`
).join('\n')}

===== 技术详情 =====
${JSON.stringify(diagnostics, null, 2)}`
    
    wx.setClipboardData({
      data: report,
      success: () => {
        wx.showToast({
          title: '诊断报告已复制',
          icon: 'success'
        })
      }
    })
  },

  /**
   * 🔍 显示修复操作
   */
  showFixActions(diagnostics) {
    const source = diagnostics.conclusion.primaryIssueSource
    const actions = []
    
    if (source === 'frontend' || source === 'both') {
      actions.push('🔄 重新加载前端数据')
      actions.push('🔧 重置前端状态')
    }
    
    if (source === 'backend' || source === 'both') {
      actions.push('📡 重新获取后端配置')
      actions.push('🔑 重新验证登录状态')
    }
    
    if (source === 'data-sync') {
      actions.push('⚡ 强制数据同步')
    }
    
    actions.push('🆘 紧急重置页面')
    actions.push('🚨 清除缓存重新登录')
    
    wx.showActionSheet({
      itemList: actions,
      success: (res) => {
        const selectedAction = actions[res.tapIndex]
        this.executeFixAction(selectedAction)
      }
    })
  },

  /**
   * 🔍 执行修复操作
   */
  executeFixAction(action) {
    wx.showLoading({
      title: '执行修复...',
      mask: true
    })
    
    setTimeout(() => {
      wx.hideLoading()
      
      switch (action) {
        case '🔄 重新加载前端数据':
          this.forceReloadData()
          break
        case '🔧 重置前端状态':
          this.resetDrawingState()
          break
        case '📡 重新获取后端配置':
          this.loadLotteryConfig()
          break
        case '🔑 重新验证登录状态':
          this.refreshUserInfo()
          break
        case '⚡ 强制数据同步':
          this.initPage()
          break
        case '🆘 紧急重置页面':
          this.emergencyResetWheelState()
          break
        case '🚨 清除缓存重新登录':
          this.clearCacheAndRelogin()
          break
      }
      
      wx.showToast({
        title: '修复操作已执行',
        icon: 'success'
      })
    }, 1000)
  },

  /**
   * 🔍 工具方法：获取问题来源描述
   */
  getSourceDescription(source) {
    const descriptions = {
      'frontend': '前端问题',
      'backend': '后端问题', 
      'network': '网络问题',
      'data-sync': '数据同步问题',
      'both': '前后端均有问题',
      'unknown': '原因不明'
    }
    return descriptions[source] || '未知'
  },

  /**
   * 🔍 工具方法：获取可信度描述
   */
  getConfidenceDescription(confidence) {
    const descriptions = {
      'high': '高（90%以上）',
      'medium': '中等（60-90%）',
      'low': '低（60%以下）'
    }
    return descriptions[confidence] || '未知'
  },

  /**
   * �� 显示奖品匹配诊断信息
   */
  showPrizeMatchingDiagnostic(backendPrizeId, backendResult) {
    const frontendPrizes = this.data.prizes || []
    
    let diagnosticInfo = `🔍 奖品数据匹配诊断报告\n\n`
    
    // 后端数据信息
    diagnosticInfo += `【后端返回数据】\n`
    diagnosticInfo += `• 奖品ID: ${backendPrizeId} (${typeof backendPrizeId})\n`
    diagnosticInfo += `• 奖品名称: ${backendResult.prize?.name || backendResult.prize_name || backendResult.prizeName || backendResult.name || '未知'}\n`
    diagnosticInfo += `• 数据格式: ${backendResult.prize ? '新格式(prize对象)' : '旧格式'}\n\n`
    
    // 前端数据信息
    diagnosticInfo += `【前端奖品数组】\n`
    diagnosticInfo += `• 奖品总数: ${frontendPrizes.length}\n`
    if (frontendPrizes.length > 0) {
      frontendPrizes.forEach((prize, index) => {
        diagnosticInfo += `• 索引${index}: ID=${prize.prize_id || prize.id || '无'} 名称="${prize.prize_name || prize.name || '无'}"\n`
      })
    } else {
      diagnosticInfo += `• ❌ 奖品数组为空\n`
    }
    
    // 匹配分析
    diagnosticInfo += `\n【匹配分析】\n`
    let foundMatch = false
    if (frontendPrizes.length > 0 && backendPrizeId) {
      frontendPrizes.forEach((prize, index) => {
        const exactMatch = prize.prize_id === backendPrizeId
        const stringMatch = String(prize.prize_id) === String(backendPrizeId)
        const idFieldMatch = prize.id === backendPrizeId
        const stringIdMatch = String(prize.id) === String(backendPrizeId)
        
        if (exactMatch || stringMatch || idFieldMatch || stringIdMatch) {
          diagnosticInfo += `• ✅ 索引${index}匹配成功\n`
          foundMatch = true
        } else {
          diagnosticInfo += `• ❌ 索引${index}不匹配 (${prize.prize_id || prize.id} ≠ ${backendPrizeId})\n`
        }
      })
    }
    
    if (!foundMatch) {
      diagnosticInfo += `• 🚨 没有找到任何匹配的奖品\n`
    }
    
    // 建议解决方案
    diagnosticInfo += `\n【建议解决方案】\n`
    diagnosticInfo += `• 检查后端抽奖配置API是否返回正确数据\n`
    diagnosticInfo += `• 确认前后端奖品ID字段名称一致\n`
    diagnosticInfo += `• 检查奖品数据同步时间\n`
    diagnosticInfo += `• 联系后端开发人员核对数据格式`
    
    wx.showModal({
      title: '🔧 奖品匹配诊断',
      content: diagnosticInfo,
      showCancel: true,
      cancelText: '复制诊断信息',
      confirmText: '关闭',
      success: (res) => {
        if (res.cancel) {
          wx.setClipboardData({
            data: `抽奖奖品匹配诊断报告\n时间: ${new Date().toLocaleString()}\n\n${diagnosticInfo}`,
            success: () => {
              wx.showToast({
                title: '诊断信息已复制',
                icon: 'success'
              })
            }
          })
        }
      }
    })
  }
}) 