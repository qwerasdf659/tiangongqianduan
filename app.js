// app.js - 餐厅积分抽奖系统全局配置（基于产品功能结构文档v2.1.3优化）

App({
  /**
   * 🔴 增强版：应用启动时的状态恢复
   */
  onLaunch(options) {
    console.log('🚀 应用启动 - 权限简化版v2.2.0')
    
    // 🔧 初始化全局数据结构
    this.initGlobalData()
    
    // 🔴 修复：编译后启动优化，减少日志输出
    console.log('🔧 编译后启动优化：延迟登录检查和WebSocket连接')
    
    // 🔧 延迟检查登录状态，避免编译后立即产生大量日志
    setTimeout(() => {
      this.checkLoginStatus()
    }, 1000)
    
    console.log('✅ 应用启动完成')
  },

  /**
   * 🔴 新增：初始化全局数据结构
   */
  initGlobalData() {
    // 确保所有必要的全局数据字段都已初始化
    this.globalData = {
      ...this.globalData,
      isLoggedIn: false,
      accessToken: null,
      refreshToken: null,
      userInfo: null,
      lastLoginTime: null,
      wsConnected: false,
      
      // 🔴 编译后状态恢复控制
      tokenVerifyCooldown: 30000, // 30秒冷却期
      tokenVerifyInterval: 300000, // 5分钟验证间隔
      lastTokenVerifyTime: null,
      
      // 应用配置
      isDev: true,
      needAuth: true,
      config: {}
    }
  },

  /**
   * 🔴 修复：应用显示时的状态检查（优化版 - 减少编译后误判）
   */
  onShow(options) {
    console.log('🔄 应用显示 - 编译后状态检查（优化版）')
    
    // 🔴 关键修复：简化编译后处理 - 减少误判和用户干扰
    this.handleCompilationStateReset()
    
    // 保留原有的WebSocket重连逻辑
    this.handleCompilationWebSocketReconnect()
  },

  /**
   * 🔴 修复：编译后状态重置（优化版 - 减少误判）
   */
  handleCompilationStateReset() {
    try {
      console.log('🔍 编译后状态优化检查...')
      
      // 🔴 关键修复：增加编译检测冷却期，避免频繁检查
      const now = Date.now()
      if (this.lastCompilationCheck && (now - this.lastCompilationCheck) < 10000) {
        console.log('🕐 编译检查冷却期内，跳过状态检查')
        return
      }
      this.lastCompilationCheck = now
      
      // 🔴 修复：更宽松的状态异常检查
      const hasStateIssue = this.gentleCheckStateIssues()
      
      if (hasStateIssue) {
        console.warn('⚠️ 检测到编译后状态异常，执行温和修复')
        this.performGentleStateRecover()
      } else {
        console.log('✅ 编译后状态检查正常')
        // 执行轻量级同步，确保一致性
        this.lightweightStateSync()
      }
    } catch (error) {
      console.error('❌ 编译后状态检查失败:', error)
      // 不执行激进重置，仅记录错误
      console.log('🔧 状态检查失败，但不影响用户使用')
    }
  },

  /**
   * 🔴 新增：温和的状态异常检查（减少误判）
   */
  gentleCheckStateIssues() {
    try {
      // 🔴 修复：只检查明显的异常情况，不检查边缘情况
      
      // 检查1：全局数据基本完整性
      if (!this.globalData) {
        console.warn('⚠️ 全局数据对象不存在')
        return true
      }
      
      // 检查2：明显的异常值检查（只检查字符串化的异常）
      const token = this.globalData.accessToken
      const userInfo = this.globalData.userInfo
      
      // 只检查明显的字符串化异常
      if (token === 'undefined' || token === 'null') {
        console.warn('⚠️ Token值明显异常:', token)
        return true
      }
      
      if (userInfo === 'undefined' || userInfo === 'null') {
        console.warn('⚠️ 用户信息值明显异常:', userInfo)
        return true
      }
      
      // 🔴 移除过于严格的一致性检查，避免误判
      // 不再检查存储与全局数据的细微差异
      
      return false // 大部分情况认为正常
    } catch (error) {
      console.error('❌ 状态异常检查失败:', error)
      return false // 检查失败不视为异常，避免误判
    }
  },

  /**
   * 🔴 新增：温和的状态恢复（避免强制登出）
   */
  performGentleStateRecover() {
    console.log('🔧 执行温和状态恢复...')
    
    try {
      // 🔴 修复：只清理明显异常的字段，不清理整个登录状态
      if (this.globalData.accessToken === 'undefined' || this.globalData.accessToken === 'null') {
        this.globalData.accessToken = null
      }
      
      if (this.globalData.userInfo === 'undefined' || this.globalData.userInfo === 'null') {
        this.globalData.userInfo = null
      }
      
      // 🔴 关键修复：尝试从存储恢复，而不是直接清除
      const storedToken = wx.getStorageSync('access_token')
      const storedUserInfo = wx.getStorageSync('user_info')
      
      if (storedToken && storedUserInfo && 
          storedToken !== 'undefined' && storedToken !== 'null' &&
          typeof storedUserInfo === 'object' && storedUserInfo.user_id) {
        
        console.log('🔧 从存储恢复登录状态...')
        this.globalData.accessToken = storedToken
        this.globalData.refreshToken = wx.getStorageSync('refresh_token')
        this.globalData.userInfo = storedUserInfo
        this.globalData.isLoggedIn = true
        
        console.log('✅ 登录状态温和恢复完成')
        
        // 🔴 关键修复：不显示用户提示，静默恢复
        // 移除了强制跳转登录的逻辑
      } else {
        console.log('📝 无法恢复登录状态，但不强制登出')
        // 不执行强制登出，让用户自然发现登录过期
      }
      
    } catch (error) {
      console.error('❌ 温和状态恢复失败:', error)
    }
  },

  /**
   * 🔴 新增：快速状态异常检查
   */
  quickCheckStateIssues() {
    try {
      // 检查1：全局数据基本完整性
      if (!this.globalData) {
        console.warn('⚠️ 全局数据对象不存在')
        return true
      }
      
      // 检查2：关键字段异常值检查
      const token = this.globalData.accessToken
      const userInfo = this.globalData.userInfo
      
      // Token异常检查
      if (token === 'undefined' || token === 'null' || 
          (typeof token === 'string' && (token === 'undefined' || token === 'null'))) {
        console.warn('⚠️ Token值异常:', token)
        return true
      }
      
      // 用户信息异常检查
      if (userInfo === 'undefined' || userInfo === 'null' ||
          (typeof userInfo === 'string' && (userInfo === 'undefined' || userInfo === 'null'))) {
        console.warn('⚠️ 用户信息值异常:', userInfo)
        return true
      }
      
      // 检查3：存储与全局数据不一致
      if (this.globalData.isLoggedIn) {
        const storageToken = wx.getStorageSync('access_token')
        const storageUserInfo = wx.getStorageSync('user_info')
        
        if (!storageToken || !storageUserInfo) {
          console.warn('⚠️ 全局数据显示已登录但存储数据缺失')
          return true
        }
        
        // 简化的一致性检查
        if (token && storageToken && token !== storageToken) {
          console.warn('⚠️ Token不一致')
          return true
        }
      }
      
      return false
    } catch (error) {
      console.error('❌ 状态异常检查失败:', error)
      return true // 检查失败视为有异常，执行重置
    }
  },

  /**
   * 🔴 新增：直接状态重置（清除登录状态）
   */
  performDirectStateReset() {
    console.log('🧹 执行编译后状态直接重置...')
    
    try {
      // 步骤1：清除全局登录状态
      this.globalData.isLoggedIn = false
      this.globalData.accessToken = null
      this.globalData.refreshToken = null
      this.globalData.userInfo = null
      this.globalData.lastLoginTime = null
      
      // 步骤2：清除本地存储
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
      wx.removeStorageSync('last_login_time')
      
      console.log('✅ 编译后状态重置完成')
      
      // 步骤3：友好提示用户
      setTimeout(() => {
        // 检查当前页面，如果不在登录页面才显示提示
        const pages = getCurrentPages()
        const currentPage = pages[pages.length - 1]
        const currentRoute = currentPage ? currentPage.route : ''
        
        if (!currentRoute.includes('auth') && !currentRoute.includes('login')) {
          wx.showModal({
            title: '编译后状态重置',
            content: '检测到编译后状态异常，已自动清除登录状态。\n\n这是正常的保护机制，请重新登录即可。',
            showCancel: false,
            confirmText: '立即登录',
            confirmColor: '#FF6B35',
            success: () => {
              wx.reLaunch({
                url: '/pages/auth/auth'
              })
            }
          })
        }
      }, 1000)
      
    } catch (error) {
      console.error('❌ 状态重置失败:', error)
    }
  },

  /**
   * 🔴 新增：轻量级状态同步
   */
  lightweightStateSync() {
    try {
      console.log('🔄 执行轻量级状态同步...')
      
      // 如果全局状态显示未登录，但存储中有数据，进行恢复
      if (!this.globalData.isLoggedIn) {
        const storedToken = wx.getStorageSync('access_token')
        const storedUserInfo = wx.getStorageSync('user_info')
        
        if (storedToken && storedUserInfo && 
            storedToken !== 'undefined' && storedToken !== 'null' &&
            typeof storedUserInfo === 'object' && storedUserInfo.user_id) {
          
          console.log('🔧 从存储恢复登录状态...')
          this.globalData.accessToken = storedToken
          this.globalData.refreshToken = wx.getStorageSync('refresh_token')
          this.globalData.userInfo = storedUserInfo
          this.globalData.lastLoginTime = wx.getStorageSync('last_login_time')
          this.globalData.isLoggedIn = true
          
          console.log('✅ 登录状态轻量级恢复完成')
        }
      }
    } catch (error) {
      console.error('❌ 轻量级状态同步失败:', error)
    }
  },

  /**
   * 🔴 新增：检测和修复编译后状态异常
   */
  detectAndFixCompilationIssues() {
    try {
      console.log('🔍 检测编译后状态异常...')
      
      // 检测1：检查关键全局数据是否异常
      const hasInvalidGlobalData = this.checkInvalidGlobalData()
      
      // 检测2：检查本地存储与全局数据的一致性
      const hasInconsistentData = this.checkDataInconsistency()
      
      // 检测3：检查Token格式异常
      const hasInvalidToken = this.checkInvalidTokenFormat()
      
      // 如果发现任何异常，执行修复
      if (hasInvalidGlobalData || hasInconsistentData || hasInvalidToken) {
        console.warn('⚠️ 检测到编译后状态异常，执行自动修复...')
        this.performCompilationStateFix()
      } else {
        console.log('✅ 编译后状态检查正常')
      }
    } catch (error) {
      console.error('❌ 编译后状态检测失败:', error)
      // 检测失败时也执行修复，确保状态稳定
      this.performCompilationStateFix()
    }
  },

  /**
   * 🔴 新增：检查全局数据异常
   */
  checkInvalidGlobalData() {
    if (!this.globalData) {
      console.warn('⚠️ 全局数据对象不存在')
      return true
    }
    
    // 检查关键字段是否为undefined字符串（编译后常见问题）
    const invalidFields = []
    const checkFields = ['accessToken', 'refreshToken', 'userInfo']
    
    checkFields.forEach(field => {
      const value = this.globalData[field]
      if (value === 'undefined' || value === 'null' || 
          (typeof value === 'string' && (value === 'undefined' || value === 'null'))) {
        invalidFields.push(field)
      }
    })
    
    if (invalidFields.length > 0) {
      console.warn('⚠️ 检测到异常字段:', invalidFields)
      return true
    }
    
    return false
  },

  /**
   * 🔴 新增：检查数据一致性
   */
  checkDataInconsistency() {
    try {
      const globalToken = this.globalData.accessToken
      const storageToken = wx.getStorageSync('access_token')
      const globalUserInfo = this.globalData.userInfo
      const storageUserInfo = wx.getStorageSync('user_info')
      
      // 检查Token一致性
      if (globalToken && storageToken && globalToken !== storageToken) {
        console.warn('⚠️ Token不一致:', {
          global: globalToken?.substring(0, 20) + '...',
          storage: storageToken?.substring(0, 20) + '...'
        })
        return true
      }
      
      // 检查用户信息一致性
      if (globalUserInfo && storageUserInfo) {
        const globalUserId = globalUserInfo.user_id || globalUserInfo.id
        const storageUserId = storageUserInfo.user_id || storageUserInfo.id
        
        if (globalUserId !== storageUserId) {
          console.warn('⚠️ 用户ID不一致:', {
            global: globalUserId,
            storage: storageUserId
          })
          return true
        }
      }
      
      return false
    } catch (error) {
      console.error('❌ 数据一致性检查失败:', error)
      return true
    }
  },

  /**
   * 🔴 新增：检查Token格式异常
   */
  checkInvalidTokenFormat() {
    const token = this.globalData.accessToken
    
    if (token) {
      // 检查Token是否为异常字符串
      if (typeof token !== 'string' || token === 'undefined' || token === 'null' || 
          token.length < 10 || !token.includes('.')) {
        console.warn('⚠️ Token格式异常:', {
          type: typeof token,
          value: token,
          length: token.length
        })
        return true
      }
    }
    
    return false
  },

  /**
   * 🔴 新增：执行编译后状态修复
   */
  performCompilationStateFix() {
    console.log('🔧 执行编译后状态修复...')
    
    try {
      // 步骤1：清理异常的全局数据
      this.cleanInvalidGlobalData()
      
      // 步骤2：重新同步存储数据
      this.forceSyncStorageToGlobalData()
      
      // 步骤3：验证修复结果
      const isFixed = this.validateFixedState()
      
      if (isFixed) {
        console.log('✅ 编译后状态修复成功')
        
        // 显示用户友好提示
        setTimeout(() => {
          wx.showToast({
            title: '系统状态已自动修复',
            icon: 'success',
            duration: 2000
          })
        }, 1000)
      } else {
        console.warn('⚠️ 状态修复不完全，建议重新登录')
        this.showCompilationFixPrompt()
      }
    } catch (error) {
      console.error('❌ 状态修复失败:', error)
      this.showCompilationFixPrompt()
    }
  },

  /**
   * 🔴 新增：清理异常的全局数据
   */
  cleanInvalidGlobalData() {
    const fieldsToClean = ['accessToken', 'refreshToken', 'userInfo']
    
    fieldsToClean.forEach(field => {
      const value = this.globalData[field]
      if (value === 'undefined' || value === 'null' || 
          (typeof value === 'string' && (value === 'undefined' || value === 'null'))) {
        console.log(`🧹 清理异常字段 ${field}:`, value)
        this.globalData[field] = null
      }
    })
    
    // 重置登录状态
    if (!this.globalData.accessToken || !this.globalData.userInfo) {
      this.globalData.isLoggedIn = false
    }
  },

  /**
   * 🔴 新增：强制同步存储数据
   */
  forceSyncStorageToGlobalData() {
    try {
      console.log('🔄 强制同步存储数据到全局...')
      
      const storedToken = wx.getStorageSync('access_token')
      const storedRefreshToken = wx.getStorageSync('refresh_token')
      const storedUserInfo = wx.getStorageSync('user_info')
      const storedLastLoginTime = wx.getStorageSync('last_login_time')
      
      // 只有当存储数据有效时才恢复
      if (storedToken && storedUserInfo && 
          storedToken !== 'undefined' && storedToken !== 'null' &&
          typeof storedUserInfo === 'object' && storedUserInfo.user_id) {
        
        // 验证Token有效性
        const tokenValidation = this.preValidateToken(storedToken)
        if (tokenValidation.isValid) {
          console.log('🔧 从存储恢复有效状态...')
          
          this.globalData.accessToken = storedToken
          this.globalData.refreshToken = storedRefreshToken
          this.globalData.userInfo = storedUserInfo
          this.globalData.lastLoginTime = storedLastLoginTime
          this.globalData.isLoggedIn = true
          
          console.log('✅ 状态恢复完成')
        } else {
          console.warn('⚠️ 存储中的Token无效，清理状态')
          this.clearInvalidStorageData()
        }
      } else {
        console.log('📝 存储中无有效数据，保持未登录状态')
        this.globalData.isLoggedIn = false
        this.globalData.accessToken = null
        this.globalData.userInfo = null
      }
    } catch (error) {
      console.error('❌ 强制同步失败:', error)
      // 同步失败时清理状态，避免异常
      this.logout()
    }
  },

  /**
   * 🔴 新增：清理无效存储数据
   */
  clearInvalidStorageData() {
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token') 
      wx.removeStorageSync('user_info')
      wx.removeStorageSync('last_login_time')
      
      this.globalData.isLoggedIn = false
      this.globalData.accessToken = null
      this.globalData.refreshToken = null
      this.globalData.userInfo = null
      this.globalData.lastLoginTime = null
      
      console.log('🧹 无效存储数据已清理')
    } catch (error) {
      console.error('❌ 清理存储数据失败:', error)
    }
  },

  /**
   * 🔴 新增：验证修复结果
   */
  validateFixedState() {
    const hasValidToken = this.globalData.accessToken && 
                         typeof this.globalData.accessToken === 'string' && 
                         this.globalData.accessToken !== 'undefined' &&
                         this.globalData.accessToken !== 'null'
    
    const hasValidUserInfo = this.globalData.userInfo && 
                            typeof this.globalData.userInfo === 'object' &&
                            (this.globalData.userInfo.user_id || this.globalData.userInfo.id)
    
    const isConsistent = this.globalData.isLoggedIn === (hasValidToken && hasValidUserInfo)
    
    console.log('🔍 修复结果验证:', {
      hasValidToken,
      hasValidUserInfo, 
      isConsistent,
      loginStatus: this.globalData.isLoggedIn
    })
    
    return isConsistent
  },

  /**
   * 🔴 新增：显示编译修复提示
   */
  showCompilationFixPrompt() {
    wx.showModal({
      title: '系统状态异常',
      content: '检测到编译后状态异常，已尝试自动修复。\n\n如果仍有问题，建议清除缓存重新登录。',
      showCancel: true,
      cancelText: '稍后处理',
      confirmText: '重新登录',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          // 清理所有状态，重新登录
          this.logout()
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      }
    })
  },

  /**
   * 🔴 新增：处理编译后WebSocket重连（核心修复）
   */
  handleCompilationWebSocketReconnect() {
    // 检查用户是否已登录
    if (!this.globalData.isLoggedIn || !this.globalData.accessToken) {
      console.log('🚫 用户未登录，跳过WebSocket重连检查')
      return
    }

    // 检查WebSocket连接状态
    if (this.globalData.wsConnected) {
      console.log('✅ WebSocket已连接，无需重连')
      return
    }

    console.log('🔍 检测到编译后WebSocket可能需要重连')
    
    // 🔴 关键修复：延迟重连，避免与页面加载冲突
    setTimeout(() => {
      if (this.globalData.isLoggedIn && !this.globalData.wsConnected) {
        console.log('🔄 编译后自动重连WebSocket...')
        this.connectWebSocketWithRetry(3) // 最多重试3次
      }
    }, 2000) // 延迟2秒，确保页面加载完成
  },

  /**
   * 🔴 新增：带重试机制的WebSocket连接
   */
  connectWebSocketWithRetry(maxRetries = 3, currentRetry = 0) {
    console.log(`🔌 WebSocket连接尝试 ${currentRetry + 1}/${maxRetries}`)
    
    // 调用原有连接方法
    this.connectWebSocket()
    
    // 设置连接检查定时器
    setTimeout(() => {
      if (!this.globalData.wsConnected && currentRetry < maxRetries - 1) {
        console.log(`🔄 WebSocket连接失败，${2}秒后进行第${currentRetry + 2}次重试`)
        setTimeout(() => {
          this.connectWebSocketWithRetry(maxRetries, currentRetry + 1)
        }, 2000 * (currentRetry + 1)) // 递增延迟
      } else if (!this.globalData.wsConnected) {
        console.log('⚠️ WebSocket连接最终失败，但不影响应用使用')
        // 不显示错误提示，静默处理
      } else {
        console.log('✅ WebSocket重连成功')
      }
    }, 3000) // 3秒后检查连接状态
  },

  /**
   * 🔴 新增：同步本地存储到全局数据 - 解决编译后数据丢失问题（优化版）
   */
  syncStorageToGlobalData() {
    try {
      // 🔴 减少日志输出，避免控制台切换
      const storedToken = wx.getStorageSync('access_token')
      const storedRefreshToken = wx.getStorageSync('refresh_token')
      const storedUserInfo = wx.getStorageSync('user_info')
      const storedLastLoginTime = wx.getStorageSync('last_login_time')
      
      // 如果全局数据丢失但本地存储有数据，则恢复
      if (storedToken && storedUserInfo && !this.globalData.accessToken) {
        console.log('🔧 编译后状态恢复中...')
        
        // 预检查Token有效性
        const tokenValidation = this.preValidateToken(storedToken)
        if (tokenValidation.isValid) {
          this.globalData.accessToken = storedToken
          this.globalData.refreshToken = storedRefreshToken
          this.globalData.userInfo = storedUserInfo
          this.globalData.lastLoginTime = storedLastLoginTime
          this.globalData.isLoggedIn = true
          
          console.log('✅ 登录状态恢复成功')
          
          // 🔴 关键修复：延迟WebSocket连接，避免编译后立即连接
          setTimeout(() => {
            if (!this.globalData.wsConnected) {
              this.connectWebSocket()
            }
          }, 3000) // 延长到3秒，确保页面加载完成
        } else {
          console.log('❌ Token已过期，需要重新登录')
          this.logout()
        }
      }
    } catch (error) {
      console.error('❌ 状态同步异常:', error)
    }
  },

  /**
   * 🔴 新增：登录状态更新时保存标记
   */
  updateLoginTime() {
    const now = Date.now()
    this.globalData.lastLoginTime = now
    wx.setStorageSync('last_login_time', now)
    console.log('✅ 登录时间已更新')
  },

  /**
   * 系统初始化
   */
  initSystem() {
    // 初始化全局数据
    this.initGlobalData()
    
    // 初始化环境配置
    this.initEnvironmentConfig()
    
    // 初始化WebSocket管理器
    this.initWebSocket()
    
    // 设置全局错误处理
    this.setupGlobalErrorHandler()
    
    // 检查登录状态
    this.checkLoginStatus()
    
    console.log('✅ 系统初始化完成 - v2.1.3配置生效')
  },

  /**
   * 初始化全局数据
   */
  initGlobalData() {
    // 引入环境配置
    const ENV_CONFIG = require('./config/env.js')
    const envConfig = ENV_CONFIG.getConfig()
    
    // 确保全局数据结构完整
    this.globalData = {
      ...this.globalData,
      // 环境配置
      ...envConfig,
      // 添加config引用方便其他地方使用
      config: envConfig,
      // 确保关键字段有默认值
      userInfo: this.globalData.userInfo || null,
      // 🔴 v2.1.3版本标识
      version: 'v2.1.3',
      // 🔴 严禁硬编码用户数据 - 已移除mockUser违规代码
      // ✅ 所有用户数据必须通过后端API获取：userAPI.getUserInfo()
    }
  },

  /**
   * 初始化环境配置
   */
  initEnvironmentConfig() {
    const ENV_CONFIG = require('./config/env.js')
    const envConfig = ENV_CONFIG.getConfig()
    
    // 设置API地址
    this.globalData.baseUrl = envConfig.baseUrl
    this.globalData.wsUrl = envConfig.wsUrl
    this.globalData.sealosConfig = envConfig.sealosConfig
    this.globalData.isDev = envConfig.isDev
    this.globalData.needAuth = envConfig.needAuth
    
    // 🔴 v2.1.3开发阶段配置
    this.globalData.developmentMode = envConfig.developmentMode || {}
    
    console.log('🔧 环境配置初始化完成 - v2.1.3:', {
      env: require('./config/env.js').getCurrentEnv(),
      isDev: this.globalData.isDev,
      baseUrl: this.globalData.baseUrl,
      wsUrl: this.globalData.wsUrl,
      photoReviewMode: this.globalData.developmentMode.photoReviewMode || 'manual'
    })
  },

  /**
   * 设置全局错误处理
   */
  setupGlobalErrorHandler() {
    // 监听小程序错误
    wx.onError((error) => {
      console.error('🚨 小程序全局错误:', error)
      
      // 记录错误信息
      try {
        // 🔧 修复：使用异步版本替换已弃用的wx.getSystemInfoSync
        const systemInfo = {
          platform: 'miniprogram',
          version: 'unknown'
        }
        
        // 尝试获取系统信息（异步）
        wx.getSystemInfo({
          success: (res) => {
            systemInfo.platform = res.platform
            systemInfo.version = res.version
            systemInfo.model = res.model
            systemInfo.system = res.system
          },
          fail: (err) => {
            console.warn('获取系统信息失败:', err)
          }
        })
        
        const errorInfo = {
          error: error,
          timestamp: new Date().toISOString(),
          userAgent: systemInfo,
          path: getCurrentPages().length > 0 ? getCurrentPages()[getCurrentPages().length - 1].route : 'unknown',
          version: 'v2.1.3'
        }
        
        // 可以发送到错误监控服务
        this.reportError(errorInfo)
      } catch (reportError) {
        console.warn('错误上报失败:', reportError)
      }
    })

    // 🔧 修复：增强未处理的Promise拒绝处理
    wx.onUnhandledRejection((res) => {
      console.error('🚨 未处理的Promise拒绝:', res)
      
      // 防止因未捕获的Promise导致小程序崩溃
      if (res.reason) {
        console.error('拒绝原因:', res.reason)
        
        // 🔧 特殊处理WebSocket连接错误（基于用户规则修复[[memory:427681]]）
        if (res.reason && typeof res.reason === 'object') {
          if (res.reason.errMsg && res.reason.errMsg.includes('WebSocket')) {
            console.warn('⚠️ WebSocket连接Promise被拒绝，这是正常的，不影响应用使用')
            return // 不需要进一步处理WebSocket错误
          }
          
          if (res.reason.message && res.reason.message.includes('连接超时')) {
            console.warn('⚠️ 网络连接Promise被拒绝，可能是网络问题')
            return
          }
        }
      }
      
      // 🔧 记录其他类型的Promise错误
      if (this.globalData && this.globalData.isDev) {
        console.log('📊 开发环境Promise错误详情:', res)
      }
    })
  },

  /**
   * 错误上报
   */
  reportError(errorInfo) {
    // 开发环境下只打印，不上报
    if (this.globalData.isDev) {
      console.log('📊 错误信息:', errorInfo)
      return
    }
    
    // 生产环境可以上报到监控服务
    // TODO: 接入错误监控服务
    console.log('📊 错误信息已记录')
  },

  /**
   * 降级初始化 - 当主初始化失败时使用
   */
  initFallback() {
    console.log('🔄 启用降级初始化')
    
    // 确保最基本的全局数据存在
    if (!this.globalData) {
      this.globalData = {}
    }
    
    // 设置最基本的配置
    this.globalData.isDev = true
    this.globalData.needAuth = false
    
    // 显示系统异常提示
    setTimeout(() => {
      wx.showModal({
        title: '系统提示',
        content: '系统初始化遇到问题，已启用兼容模式。部分功能可能受限。',
        showCancel: false,
        confirmText: '知道了'
      })
    }, 1000)
  },

  onShow() {
    // 🔧 优化：避免在登录成功后立即验证Token
    // 每次前台时检查Token状态，但增加冷却期防止误操作
    this.refreshTokenIfNeededWithCooldown()
  },

  globalData: {
    // 用户信息
    userInfo: null,
    isLoggedIn: false,
    
    // 认证相关
    accessToken: null,
    refreshToken: null,
    
    // 🔧 新增：Token验证冷却期
    lastLoginTime: null,
    tokenVerifyCooldown: 10000, // 登录成功后10秒内不验证Token
    lastTokenVerifyTime: null,
    tokenVerifyInterval: 30000, // Token验证间隔30秒
    
    // 🔴 数据库字段映射 - 根据权限简化v2.2.0的核心表设计
    dbFieldMapping: {
      user: {
        id: 'user_id',
        mobile: 'mobile',
        points: 'total_points',
        isAdmin: 'is_admin',    // 🔴 权限简化：只保留管理员权限字段
        nickname: 'nickname',
        avatar: 'avatar',
        wxOpenid: 'wx_openid',
        lastLogin: 'last_login',
        status: 'status',
        createdAt: 'created_at',
        updatedAt: 'updated_at'
      },
      lottery: {
        prizeId: 'prize_id',
        prizeName: 'prize_name',
        prizeType: 'prize_type',
        prizeValue: 'prize_value',
        angle: 'angle',
        color: 'color',
        probability: 'probability',
        isActivity: 'is_activity',
        costPoints: 'cost_points',
        status: 'status'
      },
      product: {
        id: 'commodity_id',
        name: 'name',
        description: 'description',
        category: 'category',
        exchangePoints: 'exchange_points',
        stock: 'stock',
        image: 'image',
        status: 'status',
        isHot: 'is_hot',
        sortOrder: 'sort_order',
        salesCount: 'sales_count'
      },
      uploadReview: {
        uploadId: 'upload_id',
        userId: 'user_id',
        imageUrl: 'image_url',
        amount: 'amount',
        userAmount: 'user_amount',
        pointsAwarded: 'points_awarded',
        reviewStatus: 'review_status',
        reviewerId: 'reviewer_id',
        reviewReason: 'review_reason',
        reviewTime: 'review_time',
        createdAt: 'created_at'
      },
      // 🔴 v2.1.3新增：积分记录字段映射
      pointsRecord: {
        id: 'id',
        userId: 'user_id',
        type: 'type',
        points: 'points',
        balanceAfter: 'balance_after',
        description: 'description',
        source: 'source',
        relatedId: 'related_id',
        createdAt: 'created_at'
      },
      // 🔴 v2.1.3新增：抽奖记录字段映射
      lotteryRecord: {
        id: 'id',
        userId: 'user_id',
        prizeId: 'prize_id',
        prizeName: 'prize_name',
        prizeType: 'prize_type',
        drawType: 'draw_type',
        pointsCost: 'points_cost',
        isPityDraw: 'is_pity_draw',
        createdAt: 'created_at'
      }
    },
    
    // 🔴 严禁硬编码用户数据 - 已移除mockUser违规代码
    // ✅ 所有用户数据必须通过后端API获取：userAPI.getUserInfo()

    // 🔴 v2.1.3 WebSocket管理 - 基于后端技术规范文档优化
    wsManager: null,
    wsConnected: false,
    wsReconnectCount: 0,
    
    // 🔴 v2.1.3新增：WebSocket事件监听器
    statusListeners: [],
    webSocketMessageHandlers: new Map(),
    
    // 数据同步管理
    needRefreshExchangeProducts: false,
    merchantProductsLastUpdate: 0,
    productsCache: [],
    productsCacheTime: 0,
    updateExchangeProducts: null,
    
    // 🔴 v2.1.3新增：数据安全处理配置
    dataProcessing: {
      enableSafeSetData: true,
      filterUndefinedValues: true,
      validateApiResponseFormat: true,
      strictFieldMapping: true
    },

    // 🔧 修复：添加兑换页面更新回调管理函数
    exchangeUpdateCallback: null
  },

  /**
   * 初始化WebSocket管理器
   */
  initWebSocket() {
    // 🔧 修复：检查环境配置，确定是否启用WebSocket
    const envConfig = this.globalData.config || this.globalData
    const devConfig = envConfig.developmentMode || {}
    
    if (devConfig.enableWebSocket === false) {
      console.log('🔧 WebSocket已禁用，跳过初始化')
      return
    }
    
    // 🔧 优化：创建WebSocket管理器
    this.wsManager = {
      socket: null,
      connected: false,
      reconnectAttempts: 0,
      maxReconnectAttempts: devConfig.maxReconnectAttempts || 3,
      reconnectDelay: 1000,
      heartbeatInterval: null,
      messageQueue: [],
      silentErrors: devConfig.silentWebSocketErrors || false
    }
    
    // 设置WebSocket事件监听器
    this.setupWebSocketListeners()
    
    // 🔧 延迟连接，避免初始化过程中的连接错误
    setTimeout(() => {
      if (this.globalData.isLoggedIn) {
        this.connectWebSocket()
      }
    }, 2000)
  },

  /**
   * 设置WebSocket事件监听器
   */
  setupWebSocketListeners() {
    // 实时数据监听器
    this.wsEventListeners = {
      'point_updated': (data) => {
        console.log('💰 收到积分更新推送:', data)
        
        // 更新全局积分
        if (this.globalData.userInfo) {
          this.globalData.userInfo.total_points = data.points
        }
        
        // 通知所有页面更新积分显示
        this.notifyAllPages('pointsUpdated', data)
      },
      
      'stock_updated': (data) => {
        console.log('📦 收到库存更新推送:', data)
        this.updateProductStock(data.product_id, data.stock)
      },
      
      'review_completed': (data) => {
        console.log('📋 收到审核完成推送:', data)
        this.notifyAllPages('reviewCompleted', data)
      },
      
      'lottery_config_updated': (data) => {
        console.log('🎰 收到抽奖配置更新推送:', data)
        this.notifyAllPages('lotteryConfigUpdated', data)
      }
    }
  },

  /**
   * 🔧 修复：通知所有页面状态变化，添加防抖机制
   */
  notifyAllPages(eventName, data) {
    // 🔧 修复：添加防抖机制，避免相同事件频繁触发
    const eventKey = `${eventName}_${JSON.stringify(data)}`
    const now = Date.now()
    
    if (!this.lastNotifyTime) {
      this.lastNotifyTime = {}
    }
    
    const lastNotifyTime = this.lastNotifyTime[eventKey] || 0
    const notifyCooldown = 500 // 500ms冷却期
    
    if (now - lastNotifyTime < notifyCooldown) {
      console.log(`⏳ 事件${eventName}在冷却期内，跳过重复通知`)
      return
    }
    
    this.lastNotifyTime[eventKey] = now
    
    console.log(`📢 全局通知事件: ${eventName}`, data)
    
    // 🔧 修复：通知注册的状态监听器
    if (this.globalData.statusListeners && this.globalData.statusListeners.length > 0) {
      this.globalData.statusListeners.forEach(listener => {
        try {
          listener(data)
        } catch (error) {
          console.warn('⚠️ 状态监听器执行失败:', error)
        }
      })
    }
    
    // 获取当前页面栈
    const pages = getCurrentPages()
    
    // 通知所有页面
    pages.forEach(page => {
      if (page.onWebSocketMessage && typeof page.onWebSocketMessage === 'function') {
        try {
          page.onWebSocketMessage(eventName, data)
        } catch (error) {
          console.warn('⚠️ 页面WebSocket消息处理失败:', error)
        }
      }
    })
  },

  /**
   * 更新商品库存
   */
  updateProductStock(productId, newStock) {
    // 通知相关页面更新库存显示
    this.notifyAllPages('productStockUpdated', {
      productId,
      newStock
    })
  },

  /**
   * 检查登录状态
   * 🔴 新增：支持自动跳转到抽奖页面
   */
  checkLoginStatus() {
    const token = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const userInfo = wx.getStorageSync('user_info')
    const lastLoginTime = wx.getStorageSync('last_login_time')
    
    console.log('🔍 App启动时检查登录状态:', {
      hasToken: !!token,
      hasRefreshToken: !!refreshToken,
      hasUserInfo: !!userInfo,
      tokenPreview: token ? token.substring(0, 30) + '...' : 'NO_TOKEN'
    })
    
    if (token && refreshToken && userInfo) {
      // 🔴 修复：增强Token预检查 - 解决编译后Token失效问题
      const tokenValidation = this.preValidateToken(token)
      
      if (!tokenValidation.isValid) {
        console.error('❌ Token预检查失败:', tokenValidation.reason)
        this.logout() // 清理无效Token
        return
      }
      
      // 🔧 修复：在验证之前先设置token，确保API请求有Authorization头部
      this.globalData.accessToken = token
      this.globalData.refreshToken = refreshToken
      this.globalData.userInfo = userInfo
      this.globalData.lastLoginTime = lastLoginTime || null
      this.globalData.isLoggedIn = true // 先设置为已登录状态
      
      console.log('✅ 登录状态恢复成功，Token预检查通过')
      
      // 🔧 使用带冷却期的验证逻辑
      const now = Date.now()
      
      // 如果是刚登录不久，跳过验证直接认为有效
      if (this.globalData.lastLoginTime && (now - this.globalData.lastLoginTime) < this.globalData.tokenVerifyCooldown) {
        console.log('🔧 最近刚登录，跳过初始验证')
        
        // 🔴 新增：自动跳转到抽奖页面（用户需求）
        this.autoRedirectToLottery('recent_login')
        
        // 🔧 延迟连接WebSocket，确保用户状态已就绪
        setTimeout(() => {
          this.connectWebSocket()
        }, 1000)
        
        return
      }
      
      // 🔧 使用带重试的验证逻辑
      this.verifyTokenWithRetry().then(() => {
        console.log('✅ 登录状态验证成功')
        
        // 🔴 新增：验证成功后自动跳转到抽奖页面（用户需求）
        this.autoRedirectToLottery('token_verified')
        
        // 🔧 优化：延迟连接WebSocket，确保用户状态已就绪
        setTimeout(() => {
          this.connectWebSocket()
        }, 1000)
      }).catch((error) => {
        console.warn('⚠️ Token验证最终失败，需要重新登录:', error)
        // 🔧 验证失败时清除预设的认证信息
        this.logout()
      })
    } else {
      console.log('🔍 没有有效的登录凭据，保持未登录状态')
    }
  },

  /**
   * 🔴 新增：自动跳转到抽奖页面（响应用户需求）
   * @param {string} reason - 跳转原因，用于日志记录
   */
  autoRedirectToLottery(reason = 'auto') {
    console.log(`🎰 自动跳转到抽奖页面，原因: ${reason}`)
    
    try {
      // 检查当前页面路径，避免重复跳转
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentRoute = currentPage ? currentPage.route : ''
      
      console.log('📍 当前页面路径:', currentRoute)
      
      // 如果已经在抽奖页面，则不需要跳转
      if (currentRoute === 'pages/lottery/lottery') {
        console.log('✅ 已在抽奖页面，无需跳转')
        return
      }
      
      // 如果在登录页面，使用reLaunch避免堆栈问题
      if (currentRoute.includes('auth') || currentRoute.includes('login')) {
        console.log('🔄 从登录页面跳转到抽奖页面')
        wx.reLaunch({
          url: '/pages/lottery/lottery',
          success: () => {
            console.log('✅ 成功从登录页面跳转到抽奖页面')
          },
          fail: (error) => {
            console.error('❌ 从登录页面跳转到抽奖页面失败:', error)
          }
        })
      } else {
        // 从其他页面跳转，使用switchTab（如果抽奖页面是tabBar页面）
        // 或使用navigateTo（如果不是tabBar页面）
        console.log('🔄 从其他页面跳转到抽奖页面')
        
        // 🔴 关键：使用reLaunch确保清理页面栈，避免用户返回到之前的页面
        wx.reLaunch({
          url: '/pages/lottery/lottery',
          success: () => {
            console.log('✅ 成功自动跳转到抽奖页面')
            
            // 显示友好提示
            setTimeout(() => {
              wx.showToast({
                title: '欢迎回来！',
                icon: 'success',
                duration: 2000
              })
            }, 500)
          },
          fail: (error) => {
            console.error('❌ 自动跳转到抽奖页面失败:', error)
            
            // 跳转失败时，尝试使用switchTab（如果抽奖页面在tabBar中）
            wx.switchTab({
              url: '/pages/lottery/lottery',
              success: () => {
                console.log('✅ 使用switchTab成功跳转到抽奖页面')
              },
              fail: (switchError) => {
                console.error('❌ switchTab也失败了:', switchError)
                
                // 最后尝试navigateTo
                wx.navigateTo({
                  url: '/pages/lottery/lottery',
                  success: () => {
                    console.log('✅ 使用navigateTo成功跳转到抽奖页面')
                  },
                  fail: (navError) => {
                    console.error('❌ 所有跳转方式都失败了:', navError)
                  }
                })
              }
            })
          }
        })
      }
      
    } catch (error) {
      console.error('❌ 自动跳转到抽奖页面时出错:', error)
    }
  },

  /**
   * 🔴 新增：Token预检查 - 在发起API验证之前先检查基本有效性
   */
  preValidateToken(token) {
    try {
      // 基本格式检查
      if (!token || typeof token !== 'string' || token.trim() === '') {
        return { isValid: false, reason: 'Token为空或格式无效' }
      }

      // JWT格式检查
      const parts = token.split('.')
      if (parts.length !== 3) {
        return { isValid: false, reason: 'Token不是有效的JWT格式' }
      }

      // 解码并检查过期时间
      const payload = JSON.parse(atob(parts[1]))
      const now = Math.floor(Date.now() / 1000)
      
      if (payload.exp && payload.exp < now) {
        const expiredMinutes = Math.floor((now - payload.exp) / 60)
        return { 
          isValid: false, 
          reason: `Token已过期${expiredMinutes}分钟，需要重新登录` 
        }
      }

      // 检查必要字段
      if (!payload.user_id && !payload.userId && !payload.sub) {
        return { isValid: false, reason: 'Token缺少用户ID字段' }
      }

      console.log('✅ Token预检查通过:', {
        userId: payload.user_id || payload.userId || payload.sub,
        isAdmin: payload.is_admin || payload.isAdmin,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : '永不过期'
      })

      return { isValid: true, payload }
      
    } catch (error) {
      console.error('❌ Token预检查异常:', error.message)
      return { isValid: false, reason: 'Token解码失败：' + error.message }
    }
  },

  /**
   * 连接WebSocket（优化版）
   */
  connectWebSocket() {
    // 🔴 修复：增强连接前检查，避免重复连接
    if (this.globalData.wsConnected) {
      console.log('🔌 WebSocket已连接，跳过重复连接')
      return
    }
    
    if (!this.globalData.isLoggedIn || !this.globalData.accessToken) {
      console.log('🚫 用户未登录，跳过WebSocket连接')
      return
    }

    // 🔴 修复：添加连接冷却期，避免频繁连接
    const now = Date.now()
    if (this.lastWsConnectTime && (now - this.lastWsConnectTime) < 5000) {
      console.log('🕐 WebSocket连接冷却期，跳过连接')
      return
    }
    this.lastWsConnectTime = now

    console.log('🔌 开始连接WebSocket...')
    
    // 🔧 关闭现有连接
    this.closeWebSocket()

    const wsUrl = `wss://omqktqrtntnn.sealosbja.site/ws?token=${encodeURIComponent(this.globalData.accessToken)}`
    
    wx.connectSocket({
      url: wsUrl,
      protocols: ['websocket'],
      success: () => {
        console.log('✅ WebSocket连接请求已发送')
      },
      fail: (error) => {
        console.error('❌ WebSocket连接失败:', error)
        this.globalData.wsConnected = false
      }
    })

    // 🔴 修复：设置连接超时，避免长时间等待
    this.wsConnectTimeout = setTimeout(() => {
      if (!this.globalData.wsConnected) {
        console.log('⏰ WebSocket连接超时，关闭连接')
        wx.closeSocket()
      }
    }, 10000) // 10秒超时

    // WebSocket事件监听
    wx.onSocketOpen(() => {
      console.log('✅ WebSocket连接成功')
      this.globalData.wsConnected = true
      
      // 清除连接超时
      if (this.wsConnectTimeout) {
        clearTimeout(this.wsConnectTimeout)
        this.wsConnectTimeout = null
      }
      
      // 🔴 减少心跳频率，降低日志输出
      this.startWebSocketHeartbeat()
    })

    wx.onSocketMessage((res) => {
      try {
        const data = JSON.parse(res.data)
        this.handleWebSocketMessage(data)
      } catch (error) {
        console.error('❌ WebSocket消息解析失败:', error)
      }
    })

    wx.onSocketError((error) => {
      console.log('⚠️ WebSocket连接遇到问题:', error.errMsg || error)
      this.globalData.wsConnected = false
      this.stopWebSocketHeartbeat()
      
      // 🔴 关键修复：不显示错误界面，静默处理WebSocket错误
      // WebSocket连接失败不影响应用核心功能，用户可以正常使用抽奖、兑换等功能
      console.log('💡 WebSocket连接失败不影响应用核心功能，将在后台自动重试')
    })

    wx.onSocketClose((res) => {
      console.log('🔌 WebSocket连接已关闭，关闭码:', res.code)
      this.globalData.wsConnected = false
      this.stopWebSocketHeartbeat()
      
      // 🔴 修复：增强重连逻辑，包括编译断开的情况
      if (this.globalData.isLoggedIn) {
        // 编译断开通常是1001或1006，正常断开是1000
        const shouldReconnect = res.code !== 1000 // 非正常关闭都需要重连
        
        if (shouldReconnect) {
          console.log(`🔄 WebSocket非正常关闭（${res.code}），准备重连`)
          
          // 🔴 关键修复：区分编译断开和网络错误
          const isCompilationDisconnect = res.code === 1001 || res.code === 1006
          const reconnectDelay = isCompilationDisconnect ? 3000 : 5000 // 编译断开延迟短些
          
          setTimeout(() => {
            if (this.globalData.isLoggedIn && !this.globalData.wsConnected) {
              console.log('🔄 执行WebSocket自动重连')
              this.connectWebSocketWithRetry(2) // 重连最多2次
            }
          }, reconnectDelay)
        } else {
          console.log('✅ WebSocket正常关闭，无需重连')
        }
      }
    })
  },

  /**
   * 🔴 修复：增强WebSocket消息处理
   */
  handleWebSocketMessage(message) {
    if (!message || !message.type) {
      console.warn('⚠️ 无效的WebSocket消息格式')
      return
    }

    console.log('📨 处理WebSocket消息:', message.type)

    switch (message.type) {
      case 'auth_verify_result':
        if (message.data && message.data.success) {
          console.log('✅ WebSocket认证验证成功')
        } else {
          console.error('❌ WebSocket认证验证失败，断开连接')
          this.closeWebSocket()
        }
        break

      case 'points_update':
        // 积分更新通知
        if (message.data && message.data.user_id === this.globalData.userInfo?.user_id) {
          console.log('💰 收到积分更新通知:', message.data)
          this.globalData.userInfo.total_points = message.data.new_balance
          
          // 通知页面更新
          this.broadcastToPages('points_update', message.data)
        }
        break

      case 'review_result':
        // 审核结果通知
        console.log('📋 收到审核结果通知:', message.data)
        this.broadcastToPages('review_result', message.data)
        break

      case 'system_message':
        // 系统消息
        console.log('📢 收到系统消息:', message.data)
        if (message.data && message.data.show_popup) {
          wx.showModal({
            title: '系统通知',
            content: message.data.content,
            showCancel: false
          })
        }
        break

      default:
        console.log('❓ 未知WebSocket消息类型:', message.type)
    }
  },

  /**
   * 🔴 新增：向所有页面广播消息
   */
  broadcastToPages(eventName, data) {
    const pages = getCurrentPages()
    pages.forEach(page => {
      if (page.onWebSocketMessage && typeof page.onWebSocketMessage === 'function') {
        try {
          page.onWebSocketMessage(eventName, data)
        } catch (error) {
          console.warn('⚠️ 页面WebSocket消息处理失败:', error)
        }
      }
    })
  },

  /**
   * 🔴 修复：发送WebSocket消息
   */
  sendWebSocketMessage(messageData, showLog = true) {
    if (!this.globalData.wsConnected) {
      if (showLog) console.log('⚠️ WebSocket未连接，无法发送消息')
      return false
    }

    try {
      wx.sendSocketMessage({
        data: JSON.stringify(messageData),
        success: () => {
          if (showLog) console.log('✅ WebSocket消息发送成功:', messageData.type)
        },
        fail: (error) => {
          if (showLog) console.error('❌ WebSocket消息发送失败:', error)
        }
      })
      return true
    } catch (error) {
      if (showLog) console.error('❌ WebSocket消息发送异常:', error)
      return false
    }
  },

  /**
   * 🔧 新增：启动心跳
   */
  startHeartbeat() {
    if (this.wsManager && this.wsManager.heartbeatInterval) {
      clearInterval(this.wsManager.heartbeatInterval)
    }
    
    if (this.wsManager) {
      this.wsManager.heartbeatInterval = setInterval(() => {
        if (this.wsManager.connected && this.wsManager.socket) {
          this.wsManager.socket.send({
            data: JSON.stringify({ type: 'heartbeat' })
          })
        }
      }, 30000) // 每30秒发送一次心跳
    }
  },

  /**
   * 🔧 新增：发送队列中的消息
   */
  sendQueuedMessages() {
    if (this.wsManager && this.wsManager.messageQueue.length > 0) {
      this.wsManager.messageQueue.forEach(message => {
        if (this.wsManager.socket) {
          this.wsManager.socket.send({ data: JSON.stringify(message) })
        }
      })
      this.wsManager.messageQueue = []
    }
  },

  /**
   * 验证Token有效性
   */
  verifyToken() {
    // 🔧 修复：开发环境跳过认证时返回resolved Promise
    if (this.globalData.isDev && !this.globalData.needAuth) {
      console.log('🔧 开发环境跳过Token验证')
      return Promise.resolve({ code: 0, data: { valid: true, user_info: this.globalData.userInfo } })
    }
    
    // 🔧 修复：正确返回Promise
    const API = require('./utils/api.js')
    return API.authAPI.verifyToken().then((res) => {
      if (res.code === 0 && res.data.valid) {
        // 🔧 更新用户信息
        if (res.data.user_info) {
        this.globalData.userInfo = res.data.user_info
        }
        this.globalData.isLoggedIn = true
        console.log('✅ Token验证成功')
        
        return res // 返回成功结果
      } else {
        console.log('❌ Token验证失败，后端返回无效状态')
        throw new Error('Token验证失败')
      }
    }).catch((error) => {
      console.error('❌ Token验证失败:', error)
      throw error // 重新抛出错误，让调用者处理
    })
  },

  /**
   * 跳转到认证页面
   */
  redirectToAuth() {
    // 检查当前页面是否已经是认证页面
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    
    if (currentPage && currentPage.route !== 'pages/auth/auth') {
      wx.navigateTo({
        url: '/pages/auth/auth'
      })
    }
  },

  // 🔧 优化：带冷却期的Token检查
  refreshTokenIfNeededWithCooldown() {
    if (!this.globalData.isLoggedIn || (this.globalData.isDev && !this.globalData.needAuth)) return
    
    const now = Date.now()
    
    // 🔧 登录成功后的冷却期检查
    if (this.globalData.lastLoginTime && (now - this.globalData.lastLoginTime) < this.globalData.tokenVerifyCooldown) {
      console.log('🔧 登录冷却期内，跳过Token验证')
      return
    }
    
    // 🔧 避免频繁验证
    if (this.globalData.lastTokenVerifyTime && (now - this.globalData.lastTokenVerifyTime) < this.globalData.tokenVerifyInterval) {
      console.log('🔧 Token验证间隔未到，跳过验证')
      return
    }
    
    // 🔧 记录验证时间
    this.globalData.lastTokenVerifyTime = now
    
    // 检查Token过期时间
    if (this.globalData.tokenExpireTime && now >= this.globalData.tokenExpireTime - 300000) {
      // Token将在5分钟内过期，提前刷新
      console.log('🔧 Token即将过期，开始刷新')
      this.refreshToken()
    } else {
      // 🔧 定期验证Token有效性，但增加容错机制
      console.log('🔧 开始验证Token有效性（带容错）')
      this.verifyTokenWithRetry()
    }
  },

  // 🔧 新增：带重试的Token验证
  verifyTokenWithRetry(retryCount = 0) {
    const maxRetries = 2
    
    return new Promise((resolve, reject) => {
      this.verifyToken().then(() => {
        console.log('✅ Token验证成功')
        resolve()
      }).catch((error) => {
        console.warn(`⚠️ Token验证失败 (第${retryCount + 1}次):`, error)
        
        // 🔧 网络错误或临时故障时重试
        if (retryCount < maxRetries && this.isNetworkOrTemporaryError(error)) {
          console.log(`🔄 Token验证重试 (${retryCount + 1}/${maxRetries})`)
          setTimeout(() => {
            this.verifyTokenWithRetry(retryCount + 1).then(resolve).catch(reject)
          }, (retryCount + 1) * 2000) // 递增延迟
        } else {
          // 🔧 真正的认证失败才执行logout
          if (retryCount >= maxRetries || this.isAuthenticationError(error)) {
            console.error('❌ Token验证彻底失败，执行登出')
            reject(error)
          } else {
            console.warn('⚠️ Token验证失败但不影响使用，忽略此次验证')
            resolve() // 容错处理，继续使用
          }
        }
      })
    })
  },

  // 🔧 新增：判断是否为网络或临时错误
  isNetworkOrTemporaryError(error) {
    if (!error) return false
    
    // 网络错误
    if (error.isNetworkError === true) return true
    
    // 常见的临时错误码
    const temporaryErrorCodes = [
      'NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_FAILED', 
      500, 502, 503, 504, -1, -2, -3
    ]
    
    if (temporaryErrorCodes.includes(error.code)) return true
    
    // 错误消息包含网络相关关键词
    if (error.message) {
      const networkKeywords = ['timeout', '超时', '网络', 'network', 'connection', '连接']
      return networkKeywords.some(keyword => 
        error.message.toLowerCase().includes(keyword.toLowerCase())
      )
    }
    
    return false
  },

  // 🔧 新增：判断是否为认证错误
  isAuthenticationError(error) {
    if (!error) return false
    
    // 明确的认证错误码
    const authErrorCodes = [401, 403, 2001]
    if (authErrorCodes.includes(error.code)) return true
    
    // 错误消息包含认证相关关键词
    if (error.message) {
      const authKeywords = ['unauthorized', 'forbidden', 'token', 'auth', '认证', '授权', '令牌']
      return authKeywords.some(keyword => 
        error.message.toLowerCase().includes(keyword.toLowerCase())
      )
    }
    
    return false
  },

  // 刷新Token（保持原有逻辑）
  refreshTokenIfNeeded() {
    if (!this.globalData.isLoggedIn || (this.globalData.isDev && !this.globalData.needAuth)) return
    
    const now = Date.now()
    if (this.globalData.tokenExpireTime && now >= this.globalData.tokenExpireTime - 300000) {
      // Token将在5分钟内过期，提前刷新
      this.refreshToken()
    }
  },

  /**
   * 刷新Token
   */
  refreshToken() {
    const API = require('./utils/api.js')
    API.authAPI.refresh(this.globalData.refreshToken).then((res) => {
      if (res.code === 0) {
        // 更新Token信息
        this.globalData.accessToken = res.data.access_token
        this.globalData.refreshToken = res.data.refresh_token
        this.globalData.tokenExpireTime = Date.now() + res.data.expires_in * 1000
        
        // 保存到本地存储
        wx.setStorageSync('access_token', res.data.access_token)
        wx.setStorageSync('refresh_token', res.data.refresh_token)
        wx.setStorageSync('token_expire_time', this.globalData.tokenExpireTime)
        
        console.log('✅ Token刷新成功')
        
        // 🔧 修复：重新连接WebSocket（有错误处理）
        setTimeout(() => {
          this.connectWebSocket()
        }, 500)
      } else {
        console.log('❌ Token刷新失败，重新登录')
        this.logout()
      }
    }).catch((error) => {
      console.error('Token刷新失败:', error)
      this.logout()
    })
  },

  /**
   * 🔴 v2.1.3新增：数据安全处理方法
   */
  safeSetData(data) {
    if (!this.globalData.dataProcessing.enableSafeSetData) {
      return data
    }
    
    // 递归过滤undefined值
    const filterUndefined = (obj) => {
      if (obj === null || obj === undefined) {
        return null
      }
      
      if (Array.isArray(obj)) {
        return obj.map(item => filterUndefined(item)).filter(item => item !== undefined)
      }
      
      if (typeof obj === 'object') {
        const filtered = {}
        for (const [key, value] of Object.entries(obj)) {
          if (value !== undefined) {
            filtered[key] = filterUndefined(value)
          }
        }
        return filtered
      }
      
      return obj
    }
    
    return this.globalData.dataProcessing.filterUndefinedValues ? filterUndefined(data) : data
  },

  /**
   * 🔴 v2.1.3新增：API响应格式验证
   */
  validateApiResponse(response) {
    if (!this.globalData.dataProcessing.validateApiResponseFormat) {
      return true
    }
    
    // 检查基本格式
    if (!response || typeof response !== 'object') {
      console.warn('⚠️ API响应格式异常：不是对象')
      return false
    }
    
    // 检查必需字段
    if (!response.hasOwnProperty('code')) {
      console.warn('⚠️ API响应格式异常：缺少code字段')
      return false
    }
    
    if (!response.hasOwnProperty('msg') && !response.hasOwnProperty('message')) {
      console.warn('⚠️ API响应格式异常：缺少msg或message字段')
      return false
    }
    
    return true
  },

  /**
   * 🔴 v2.1.3新增：字段映射处理
   */
  mapFieldsToFrontend(data, entityType) {
    if (!this.globalData.dataProcessing.strictFieldMapping || !data) {
      return data
    }
    
    const mapping = this.globalData.dbFieldMapping[entityType]
    if (!mapping) {
      console.warn(`⚠️ 未找到${entityType}的字段映射配置`)
      return data
    }
    
    // 如果是数组，递归处理每个元素
    if (Array.isArray(data)) {
      return data.map(item => this.mapFieldsToFrontend(item, entityType))
    }
    
    // 对象字段映射
    const mappedData = {}
    for (const [frontendField, backendField] of Object.entries(mapping)) {
      if (data.hasOwnProperty(backendField)) {
        mappedData[frontendField] = data[backendField]
      }
    }
    
    return mappedData
  },

  /**
   * 🔴 v2.1.3新增：注册状态监听器
   */
  addStatusListener(listener) {
    if (typeof listener === 'function') {
      this.globalData.statusListeners.push(listener)
      console.log('✅ 状态监听器已注册，当前数量:', this.globalData.statusListeners.length)
    }
  },

  /**
   * 🔴 v2.1.3新增：移除状态监听器
   */
  removeStatusListener(listener) {
    const index = this.globalData.statusListeners.indexOf(listener)
    if (index > -1) {
      this.globalData.statusListeners.splice(index, 1)
      console.log('✅ 状态监听器已移除，当前数量:', this.globalData.statusListeners.length)
    }
  },

  /**
   * 🔴 v2.1.3新增：WebSocket消息处理器注册
   */
  registerWebSocketHandler(eventName, handler) {
    if (!this.globalData.webSocketMessageHandlers.has(eventName)) {
      this.globalData.webSocketMessageHandlers.set(eventName, [])
    }
    this.globalData.webSocketMessageHandlers.get(eventName).push(handler)
    console.log(`✅ WebSocket事件处理器已注册: ${eventName}`)
  },

  /**
   * 🔴 v2.1.3新增：WebSocket消息处理器移除
   */
  unregisterWebSocketHandler(eventName, handler) {
    if (this.globalData.webSocketMessageHandlers.has(eventName)) {
      const handlers = this.globalData.webSocketMessageHandlers.get(eventName)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
        console.log(`✅ WebSocket事件处理器已移除: ${eventName}`)
      }
    }
  },

  /**
   * 🔴 增强版登录成功处理 - 修复编译后Token验证和状态同步问题
   */
  onLoginSuccess(loginData) {
    console.log('✅ App.onLoginSuccess - 处理登录成功回调')
    console.log('🔍 登录数据验证:', {
      hasAccessToken: !!(loginData.data && loginData.data.access_token),
      hasRefreshToken: !!(loginData.data && loginData.data.refresh_token),
      hasUserInfo: !!(loginData.data && loginData.data.user_info),
      userNickname: loginData.data?.user_info?.nickname || 'UNKNOWN'
    })
    
    // 🔧 数据安全性检查
    if (!loginData || !loginData.data) {
      console.error('❌ 登录数据无效，缺少data字段')
      return
    }
    
    const { access_token, refresh_token, user_info } = loginData.data
    
    // 🔧 修复：Token验证和处理
    if (!access_token || typeof access_token !== 'string' || access_token.trim() === '') {
      console.error('❌ 登录响应中没有有效的access_token!')
      wx.showModal({
        title: '🔑 登录异常',
        content: '后端返回的访问令牌无效！\n\n可能原因：\n• 后端JWT配置问题\n• 用户认证流程异常\n• Token生成失败\n\n请联系技术支持。',
        showCancel: false,
        confirmText: '重试登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return
    }
    
    // 🔧 修复：用户信息验证和ID管理
    if (!user_info || typeof user_info !== 'object') {
      console.error('❌ 登录响应中没有有效的用户信息!')
      wx.showModal({
        title: '🔑 登录异常',
        content: '后端返回的用户信息无效！\n\n可能原因：\n• 后端用户信息格式错误\n• 数据库查询异常\n• 用户数据不完整\n\n请联系技术支持。',
        showCancel: false,
        confirmText: '重试登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return
    }
    
    // 🔧 修复：确保用户ID正确性
    let user_id = user_info.user_id || user_info.userId || user_info.id
    if (!user_id || (typeof user_id !== 'number' && typeof user_id !== 'string')) {
      console.error('❌ 登录响应中没有有效的用户ID!', user_info)
      wx.showModal({
        title: '🔑 用户ID异常',
        content: `后端返回的用户ID无效！\n\n当前用户ID: ${user_id}\n类型: ${typeof user_id}\n\n请确保后端返回正确的用户标识符。`,
        showCancel: false,
        confirmText: '重试登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return
    }
    
    // 🔴 修复：JWT Token预检查和解析 - 解决编译后Token失效问题
    const tokenValidation = this.preValidateToken(access_token)
    if (!tokenValidation.isValid) {
      console.error('❌ Token预检查失败:', tokenValidation.reason)
      wx.showModal({
        title: '🔑 Token验证失败',
        content: `Token验证失败：${tokenValidation.reason}\n\n这可能导致编译后认证异常，请重新登录。`,
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return
    }
    
    // 🔧 修复：安全保存登录状态到全局数据和本地存储
    console.log('💾 保存登录状态...')
    
    // 先保存到全局数据
    this.globalData.accessToken = access_token
    this.globalData.refreshToken = refresh_token || null
    this.globalData.userInfo = user_info
    this.globalData.isLoggedIn = true
    
    // 🔴 重要：记录登录时间，用于编译后状态恢复判断
    this.updateLoginTime()
    
    // 再保存到本地存储（确保编译后能恢复）
    try {
      wx.setStorageSync('access_token', access_token)
      wx.setStorageSync('refresh_token', refresh_token || '')
      wx.setStorageSync('user_info', user_info)
      console.log('✅ 登录状态已同步保存到全局数据和本地存储')
    } catch (storageError) {
      console.error('❌ 保存到本地存储失败:', storageError)
      wx.showToast({
        title: '存储失败，登录状态可能不稳定',
        icon: 'none',
        duration: 2000
      })
    }
    
    // 🔧 修复：登录成功后立即建立WebSocket连接
    console.log('🔌 登录成功，准备建立WebSocket连接...')
    setTimeout(() => {
      if (this.globalData.isLoggedIn && this.globalData.accessToken) {
        console.log('🔄 开始连接WebSocket...')
        this.connectWebSocketWithRetry(3) // 使用带重试的连接方法
      }
    }, 1500) // 延迟1.5秒确保状态完全稳定
    
    console.log('✅ 登录成功处理完成')
  },

  // 退出登录
  logout() {
    // 断开WebSocket连接
    if (this.globalData.wsManager) {
      this.globalData.wsManager.disconnect()
    }
    
    // 清除用户数据
    this.globalData.userInfo = null
    this.globalData.isLoggedIn = false
    this.globalData.accessToken = null
    this.globalData.refreshToken = null
    this.globalData.tokenExpireTime = null
    this.globalData.wsConnected = false
    
    // 清除本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('token_expire_time')
    wx.removeStorageSync('user_info')
    
    // 🔧 修复：退出登录时通知所有页面更新状态
    this.notifyAllPages('userStatusChanged', {
      isLoggedIn: false,
      userInfo: null,
      accessToken: null
    })
    
    // 跳转到认证页面
    wx.reLaunch({
      url: '/pages/auth/auth'
    })
    
    console.log('✅ 用户已退出登录')
  },

  /**
   * 🔧 修复：添加兑换页面更新回调管理函数
   * 用于商家管理页面向兑换页面推送数据更新通知
   */
  
  /**
   * 设置兑换页面更新回调
   * @param {Function} callback - 更新回调函数
   */
  setExchangeUpdateCallback(callback) {
    if (typeof callback === 'function') {
      this.globalData.exchangeUpdateCallback = callback
      console.log('✅ 兑换页面更新回调已设置')
    } else {
      console.warn('⚠️ 兑换页面更新回调必须是函数')
    }
  },

  /**
   * 清除兑换页面更新回调
   */
  clearExchangeUpdateCallback() {
    this.globalData.exchangeUpdateCallback = null
    console.log('✅ 兑换页面更新回调已清除')
  },

  /**
   * 触发兑换页面更新回调
   * @param {Object} data - 更新数据
   */
  triggerExchangeUpdate(data) {
    if (this.globalData.exchangeUpdateCallback && typeof this.globalData.exchangeUpdateCallback === 'function') {
      try {
        this.globalData.exchangeUpdateCallback(data)
        console.log('✅ 兑换页面更新回调已触发')
      } catch (error) {
        console.error('❌ 兑换页面更新回调执行失败:', error)
      }
    }
  },

  /**
   * 🔴 新增：启动WebSocket心跳机制
   */
  startWebSocketHeartbeat() {
    // 清除现有心跳
    this.stopWebSocketHeartbeat()
    
    console.log('💓 启动WebSocket心跳（90秒间隔）')
    this.wsHeartbeatInterval = setInterval(() => {
      if (this.globalData.wsConnected) {
        // 🔴 修复：减少心跳日志输出
        this.sendWebSocketMessage({
          type: 'heartbeat',
          data: {
            timestamp: Date.now(),
            user_id: this.globalData.userInfo?.user_id
          }
        }, false) // 不输出发送日志
      } else {
        console.log('⚠️ WebSocket未连接，停止心跳')
        this.stopWebSocketHeartbeat()
      }
    }, 90000) // 🔴 延长心跳间隔到90秒，减少日志
  },

  /**
   * 🔴 新增：停止WebSocket心跳机制
   */
  stopWebSocketHeartbeat() {
    if (this.wsHeartbeatInterval) {
      clearInterval(this.wsHeartbeatInterval)
      this.wsHeartbeatInterval = null
      console.log('💓 WebSocket心跳机制已停止')
    }
  },

  /**
   * 🔴 新增：关闭WebSocket连接
   */
  closeWebSocket() {
    console.log('🔌 关闭WebSocket连接')
    
    // 停止心跳
    this.stopWebSocketHeartbeat()
    
    // 更新连接状态
    this.globalData.wsConnected = false
    
    // 关闭连接
    try {
      wx.closeSocket({
        success: () => {
          console.log('✅ WebSocket连接已关闭')
        },
        fail: (error) => {
          console.warn('⚠️ 关闭WebSocket连接失败:', error)
        }
      })
    } catch (error) {
      console.warn('⚠️ 关闭WebSocket连接异常:', error)
    }
  }
})
