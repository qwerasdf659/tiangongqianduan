// pages/exchange/exchange.js - 商品兑换页面逻辑
const app = getApp()
const { exchangeAPI, userAPI } = require('../../utils/api')
const { debounce } = require('../../utils/validate')

Page({
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 商品列表
    products: [],
    filteredProducts: [],
    
    // 页面状态
    loading: true,
    refreshing: false,
    
    // 兑换确认弹窗
    showConfirm: false,
    selectedProduct: null,
    
    // 兑换结果弹窗
    showResult: false,
    resultData: null,
    
    // 🚨 已删除：mockProducts违规字段

    // 新增的兑换相关数据
    exchangeQuantity: 1,
    exchanging: false,

    // 搜索和筛选
    searchKeyword: '',
    currentFilter: 'all', // 'all', 'available', 'low-price'
    
    // 分页功能
    currentPage: 1,
    totalPages: 5,
    pageSize: 20,
    totalProducts: 100,
    
    // 高级筛选
    showAdvancedFilter: false,
    categoryFilter: 'all', // 'all', '优惠券', '实物商品', '虚拟物品'
    pointsRange: 'all', // 'all', '0-500', '500-1000', '1000-2000', '2000+'
    stockFilter: 'all', // 'all', 'in-stock', 'low-stock'
    sortBy: 'default', // 'default', 'points-asc', 'points-desc', 'stock-desc', 'rating-desc'
  },

  onLoad(options) {
    console.log('兑换页面加载', options)
    
    // 🔴 新增：JWT认证诊断
    this.runJWTDiagnostics()
    
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('兑换页面显示')
    
    // 连接WebSocket监听库存变化
    this.connectWebSocket()
    
    // 检查商品数据是否需要同步更新
    this.checkAndRefreshProducts()
    
    // 设置兑换页面更新回调（用于接收商家管理的数据更新通知）
    const app = getApp()
    app.setExchangeUpdateCallback(() => {
      console.log('📢 收到商家管理数据更新通知，刷新商品列表')
      this.refreshProductsFromMerchant()
    })
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('兑换页面隐藏')
    this.disconnectWebSocket()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('兑换页面卸载')
    this.disconnectWebSocket()
    
    // 清理兑换页面更新回调
    const app = getApp()
    app.clearExchangeUpdateCallback()
  },

  onPullDownRefresh() {
    console.log('下拉刷新')
    this.refreshPage()
  },

  /**
   * 初始化页面
   */
  initPage() {
    // 获取用户信息
    this.refreshUserInfo()
    
    // 🚨 已删除：generateMockProducts()违规调用
    
    // 加载商品数据
    this.loadProducts()
    
    // 初始化筛选条件
    this.initFilters()
  },

  /**
   * 初始化筛选条件
   */
  initFilters() {
    // 设置默认筛选和排序
    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1
    })
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
    console.log('📡 刷新用户信息...')
    return userAPI.getUserInfo().then((res) => {
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
   * 🚨 已删除违规函数：generateMockProducts()
   * 🔴 原因：违反项目安全规则 - 严禁前端硬编码敏感业务数据
   * ✅ 正确做法：所有商品数据必须从后端API获取
   * 
   * 使用方式：exchangeAPI.getProducts()
   */

  /**
   * 🔴 增强版Token状态检查函数 - 修复商品显示空白问题的核心逻辑
   * 
   * 根据后端程序员分析，API返回401错误是商品显示空白的直接原因
   * 这个函数负责在API调用前检查Token有效性，避免无效请求
   */
  checkTokenStatus() {
    const app = getApp()
    
    console.log('🔍 开始Token状态检查...')
    
    // 检查app实例
    if (!app || !app.globalData) {
      console.error('❌ App实例或globalData未初始化')
      return {
        isValid: false,
        error: 'APP_NOT_INITIALIZED',
        message: '应用未初始化，请重新打开小程序'
      }
    }
    
    // 🔴 增强：优先检查全局Token，降级到本地存储
    let token = app.globalData.accessToken
    console.log('🔧 全局Token状态:', token ? `存在(${token.length}字符)` : '不存在')
    
    if (!token) {
      console.log('🔧 全局Token不存在，尝试从本地存储获取...')
      try {
        token = wx.getStorageSync('access_token')
        if (token) {
          console.log('🔧 从本地存储恢复Token:', token.length + '字符')
          // 同步到全局数据
          app.globalData.accessToken = token
        }
      } catch (storageError) {
        console.error('❌ 读取本地存储Token失败:', storageError)
      }
    }
    
    // 检查token存在性
    if (!token) {
      console.error('❌ Token完全不存在（全局和本地存储都没有）')
      return {
        isValid: false,
        error: 'TOKEN_MISSING',
        message: '未找到访问令牌，需要重新登录'
      }
    }
    
    // 检查token格式
    if (typeof token !== 'string' || token.trim() === '') {
      console.error('❌ Token格式错误:', { type: typeof token, value: token })
      return {
        isValid: false,
        error: 'TOKEN_INVALID_FORMAT',
        message: 'Token格式无效，请重新登录'
      }
    }
    
    // 🔴 增强：JWT token格式检查
    const tokenParts = token.split('.')
    if (tokenParts.length !== 3) {
      console.error('❌ JWT格式错误，部分数量:', tokenParts.length, '预期: 3')
      return {
        isValid: false,
        error: 'TOKEN_INVALID_JWT',
        message: 'Token不是有效的JWT格式，请重新登录'
      }
    }
    
    // 🔴 增强：JWT Payload解码和过期检查
    try {
      const payload = JSON.parse(atob(tokenParts[1]))
      const now = Math.floor(Date.now() / 1000)
      
      console.log('🔍 JWT Token解码成功:', {
        userId: payload.user_id || payload.userId || payload.sub,
        isAdmin: payload.is_admin || payload.isAdmin || false,
        issuedAt: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : '未设置',
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : '永不过期',
        currentTime: new Date().toLocaleString()
      })
      
      // 🔴 核心：检查token是否过期
      if (payload.exp && payload.exp < now) {
        const expiredTime = new Date(payload.exp * 1000).toLocaleString()
        const expiredMinutes = Math.floor((now - payload.exp) / 60)
        
        console.error('❌ Token已过期:', {
          过期时间: expiredTime,
          当前时间: new Date().toLocaleString(),
          过期时长: expiredMinutes + '分钟前'
        })
        
        return {
          isValid: false,
          error: 'TOKEN_EXPIRED',
          message: `Token已过期 (${expiredTime})，请重新登录`,
          expiredAt: expiredTime,
          expiredMinutes: expiredMinutes
        }
      }
      
      // 🔴 增强：检查即将过期的Token (5分钟内)
      const willExpireSoon = payload.exp && (payload.exp - now) < 300
      if (willExpireSoon) {
        const minutesLeft = Math.floor((payload.exp - now) / 60)
        console.warn('⚠️ Token即将过期:', minutesLeft + '分钟后')
      }
      
      // 🔴 增强：检查Token中的关键字段
      const hasUserId = !!(payload.user_id || payload.userId || payload.sub)
      if (!hasUserId) {
        console.warn('⚠️ Token中缺少用户ID字段')
        return {
          isValid: false,
          error: 'TOKEN_MISSING_USER_ID',
          message: 'Token缺少用户信息，请重新登录'
        }
      }
      
      console.log('✅ Token验证通过')
      return {
        isValid: true,
        token: token,
        payload: payload,
        info: `Token有效，${payload.exp ? '有效期至' + new Date(payload.exp * 1000).toLocaleString() : '无过期时间'}`,
        willExpireSoon: willExpireSoon,
        userId: payload.user_id || payload.userId || payload.sub,
        isAdmin: payload.is_admin || payload.isAdmin || false
      }
      
    } catch (decodeError) {
      console.error('❌ JWT解码失败:', decodeError.message)
      console.error('🔍 Token前50字符:', token.substring(0, 50))
      
      return {
        isValid: false,
        error: 'TOKEN_DECODE_ERROR',
        message: 'Token解码失败，可能已损坏，请重新登录',
        decodeError: decodeError.message
      }
    }
  },

  /**
   * 🔴 处理Token错误 - 根据错误类型采取相应措施
   */
  handleTokenError(errorType) {
    const app = getApp()
    
    console.log('🚨 处理Token错误:', errorType)
    
    switch (errorType) {
      case 'TOKEN_MISSING':
        wx.showModal({
          title: '🔑 需要登录',
          content: '请登录后查看商品列表',
          showCancel: false,
          confirmText: '立即登录',
          success: () => {
            wx.reLaunch({ url: '/pages/auth/auth' })
          }
        })
        break
        
      case 'TOKEN_EXPIRED':
        console.log('🔄 尝试刷新过期Token...')
        const refreshToken = app.globalData.refreshToken || wx.getStorageSync('refresh_token')
        if (refreshToken) {
          // 这里应该调用refreshToken，但为了简化，直接重新登录
          this.clearTokenAndRedirectLogin('Token已过期，请重新登录')
        } else {
          this.clearTokenAndRedirectLogin('Token已过期且无法刷新，请重新登录')
        }
        break
        
      case 'TOKEN_INVALID_JWT':
      case 'TOKEN_DECODE_ERROR':
        this.clearTokenAndRedirectLogin('Token格式无效，请重新登录')
        break
        
      default:
        this.clearTokenAndRedirectLogin('认证异常，请重新登录')
    }
  },

  /**
   * 🔴 清理Token并跳转登录
   */
  clearTokenAndRedirectLogin(message) {
    const app = getApp()
    
    console.log('🧹 清理无效Token:', message)
    
    // 清理全局数据
    app.globalData.accessToken = null
    app.globalData.refreshToken = null
    app.globalData.userInfo = null
    app.globalData.isLoggedIn = false
    
    // 清理本地存储
    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
    
    wx.showModal({
      title: '🔑 登录状态异常',
      content: message,
      showCancel: false,
      confirmText: '重新登录',
      success: () => {
        wx.reLaunch({ url: '/pages/auth/auth' })
      }
    })
  },

  /**
   * 🔴 加载商品数据 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据，强制后端依赖
   * 🔧 增强版：完善数据处理和错误调试
   * 🚨 修复版：解决JWT认证问题（根据后端程序员分析）
   * 🎯 修复商品显示空白问题 - 2025年01月12日
   * 
   * 接口：GET /api/exchange/products?page=1&page_size=20&category=all&sort=points
   * 认证：需要Bearer Token
   * 返回：商品列表，支持分页和筛选
   */
  loadProducts() {
    this.setData({ loading: true })

    console.log('\n🚀=================== 开始加载商品 ===================')
    console.log('📡 请求商品列表接口...')
    console.log('🕐 请求时间:', new Date().toLocaleString())
    
    // 🔴 增强：Token状态检查 - 解决商品显示空白的直接原因
    const tokenStatus = this.checkTokenStatus()
    if (!tokenStatus.isValid) {
      console.error('❌ Token状态异常，这是商品显示空白的直接原因:', tokenStatus.error)
      
      // 🔴 修复：Token问题时显示具体错误而不是空白商品列表
      this.setData({ 
        loading: false,
        products: [],
        filteredProducts: [],
        totalCount: 0
      })
      
      // 🔴 修复：使用增强的Token错误处理函数
      this.handleTokenError(tokenStatus.error, {
        expiredAt: tokenStatus.expiredAt,
        canRefresh: tokenStatus.canRefresh,
        message: tokenStatus.message
      })
      
      return Promise.reject(new Error('Token认证失败'))
    }
    
    console.log('✅ Token状态检查通过:', tokenStatus.info || '验证成功')
    console.log('🔧 调试信息 - 用户Token状态:', app.globalData.accessToken ? '已设置' : '未设置')
    
    // 🔴 新增：API调用前的详细状态检查
    console.log('\n📊 API调用前状态检查:')
    console.log('- 当前页面数据状态:', {
      loading: this.data.loading,
      products: this.data.products ? this.data.products.length : 0,
      totalCount: this.data.totalCount
    })
    
    console.log('\n📡 开始API请求: exchangeAPI.getProducts()')
    const requestStartTime = Date.now()
    
    // 🔴 修复：传递正确的参数，确保与后端测试参数一致
    const requestParams = {
      page: this.data.currentPage || 1,
      pageSize: this.data.pageSize || 20,
      category: this.data.categoryFilter === 'all' ? undefined : this.data.categoryFilter,
      sort: this.data.sortBy === 'default' ? 'points' : this.data.sortBy
    }
    
    console.log('📊 请求参数:', requestParams)
    
    return exchangeAPI.getProducts(
      requestParams.page,
      requestParams.pageSize,
      requestParams.category,
      requestParams.sort
    ).then((result) => {
      const requestEndTime = Date.now()
      const requestDuration = requestEndTime - requestStartTime
      
      console.log('\n✅ API请求成功完成!')
      console.log('⏱️ 请求耗时:', requestDuration + 'ms')
      console.log('📦 后端API返回完整数据:')
      console.log('- 返回数据类型:', typeof result)
      console.log('- 返回数据结构:', Object.keys(result))
      console.log('- 完整数据内容:', JSON.stringify(result, null, 2))
      
      // 🔴 增强：详细分析API响应结构
      if (result) {
        console.log('\n🔍 API响应结构分析:')
        console.log('- result.code:', result.code)
        console.log('- result.msg:', result.msg)
        console.log('- result.data存在:', !!result.data)
        
        if (result.data) {
          console.log('- result.data类型:', typeof result.data)
          console.log('- result.data.products存在:', !!result.data.products)
          console.log('- result.data.products类型:', Array.isArray(result.data.products) ? 'array' : typeof result.data.products)
          if (result.data.products) {
            console.log('- result.data.products长度:', result.data.products.length)
            if (result.data.products.length > 0) {
              console.log('- 第一个商品示例:', result.data.products[0])
            }
          }
          console.log('- result.data.total:', result.data.total)
        }
      }
      
      // 🔧 简化数据处理逻辑 - 修复商品显示空白问题
      if (result && result.code === 0) {
        console.log('\n🔄 开始简化数据处理和格式化...')
        console.log('📊 API返回的完整数据结构:', result)
        
        let products = []
        let totalCount = 0
        
        try {
          // 🔴 简化数据提取逻辑
          if (result.data && result.data.products && Array.isArray(result.data.products)) {
            // 标准格式：{ code: 0, data: { products: [...], total: N } }
            products = result.data.products
            totalCount = result.data.total || products.length
            console.log('✅ 提取到商品数据，数量:', products.length)
          } else {
            // 处理其他可能的格式
            console.error('❌ 数据格式不符合预期：', {
              hasData: !!result.data,
              hasProducts: !!(result.data && result.data.products),
              isProductsArray: !!(result.data && Array.isArray(result.data.products)),
              dataType: typeof result.data,
              dataKeys: result.data ? Object.keys(result.data) : 'null'
            })
            
            // 🚨 显示数据格式错误
            this.setData({ 
              loading: false,
              products: [],
              filteredProducts: [],
              totalCount: 0
            })
            
            wx.showModal({
              title: '🚨 商品数据格式错误',
              content: '后端API返回的数据格式不符合预期\n\n期望格式：\n{\n  "code": 0,\n  "data": {\n    "products": [...],\n    "total": N\n  }\n}\n\n请联系后端开发人员检查API接口',
              showCancel: false,
              confirmText: '知道了'
            })
            
            throw new Error('商品数据格式不符合预期（非对象错误）')
          }
          
          // 🔴 检查商品数组是否为空
          if (products.length === 0) {
            console.warn('⚠️ 后端返回的商品列表为空')
            
            this.setData({ 
              loading: false,
              products: [],
              filteredProducts: [],
              totalCount: 0
            })
            
            wx.showModal({
              title: '📦 暂无商品',
              content: '后端API返回成功但商品列表为空\n\n可能原因：\n• 数据库中暂无商品数据\n• 商品状态不是"active"\n• 权限或查询条件问题\n\n建议联系管理员添加商品',
              showCancel: true,
              cancelText: '知道了',
              confirmText: '重新加载',
              success: (res) => {
                if (res.confirm) {
                  setTimeout(() => this.loadProducts(), 1000)
                }
              }
            })
            
            return Promise.resolve() // 不要抛出错误，正常结束
          }
          
          // 🔧 简化数据标准化处理
          console.log('\n🔄 开始标准化处理，原始商品数量:', products.length)
          console.log('🔍 第一个商品原始数据:', products[0])
          
          const standardizedProducts = products.map((product, index) => {
            // 🔴 增强错误处理
            if (!product || typeof product !== 'object') {
              console.error(`❌ 商品${index + 1}数据无效:`, product)
              return null
            }
            
            try {
              const standardized = {
                // 保留原始数据
                ...product,
                // 标准化必要字段
                id: product.id || product.commodity_id || product.product_id || index,
                name: product.name || product.product_name || `商品${index + 1}`,
                description: product.description || product.desc || '',
                exchange_points: Number(product.exchange_points || product.points || product.price || 0),
                stock: Number(product.stock || product.inventory || 0),
                image: product.image || product.image_url || product.picture || '/images/default-product.png',
                category: product.category || '其他',
                status: product.status || 'active',
                is_hot: !!product.is_hot,
                rating: Number(product.rating || 5.0),
                created_time: product.created_at || product.created_time || new Date().toISOString()
              }
              
              console.log(`✅ 商品${index + 1}标准化成功:`, standardized.name)
              return standardized
            } catch (error) {
              console.error(`❌ 商品${index + 1}标准化失败:`, error, product)
              return null
            }
          }).filter(product => product !== null) // 过滤掉无效的商品
          
          console.log('\n✨ 标准化处理完成:')
          console.log('- 标准化后商品数量:', standardizedProducts.length)
          if (standardizedProducts.length > 0) {
            console.log('- 标准化后第一个商品:', standardizedProducts[0])
          }
          
          if (standardizedProducts.length > 0) {
            console.log('\n🎯 设置页面数据...')
            
            this.setData({
              products: standardizedProducts,
              totalCount: totalCount,
              loading: false
            })
            
            console.log('✅ setData完成，页面数据已更新')
            
            // 应用筛选和分页
            console.log('🔄 调用filterProducts()进行筛选...')
            this.filterProducts()
            
            console.log('✅ filterProducts()执行完成')
            console.log('📊 最终页面数据状态:', {
              'products.length': this.data.products.length,
              'filteredProducts.length': this.data.filteredProducts.length,
              'totalCount': this.data.totalCount,
              'loading': this.data.loading
            })
            
            console.log('\n🎉 商品列表加载成功！')
            console.log('   - 商品总数:', standardizedProducts.length)
            console.log('   - 第一个商品:', standardizedProducts[0]?.name)
            console.log('   - 库存状态:', standardizedProducts.map(p => `${p.name}:${p.stock}`))
            
            // 🎉 显示成功提示
            wx.showToast({
              title: `已加载${standardizedProducts.length}个商品`,
              icon: 'success',
              duration: 1500
            })
          } else {
            console.error('\n❌ 致命问题：处理后商品列表仍为空！')
            console.error('🔍 可能原因分析:')
            console.error('1. 后端返回的商品数组为空（后端问题）')
            console.error('2. 商品数据格式不符合预期（接口对接问题）')
            console.error('3. 数据处理逻辑有误（前端问题）')
            
            // 🔴 修复：处理后商品列表为空时的明确提示
            this.setData({ 
              loading: false,
              products: [],
              filteredProducts: [],
              totalCount: 0
            })
            
            wx.showModal({
              title: '📦 商品加载异常',
              content: '后端API响应成功但商品列表为空。\n\n这表明：\n• 后端数据库可能没有商品数据\n• 或者API查询逻辑有问题\n• 或者权限配置不正确\n\n请联系管理员检查后端系统。',
              showCancel: true,
              cancelText: '稍后重试',
              confirmText: '重新加载',
              success: (res) => {
                if (res.confirm) {
                  setTimeout(() => {
                    this.loadProducts()
                  }, 1000)
                }
              }
            })
            
            throw new Error('📦 处理后商品列表为空')
          }
          
        } catch (error) {
          console.error('\n❌ 数据处理过程中发生错误:', error)
          
          this.setData({ 
            loading: false,
            products: [],
            filteredProducts: [],
            totalCount: 0
          })
          
          wx.showModal({
            title: '🚨 数据处理错误',
            content: `商品数据处理失败：\n\n${error.message}\n\n这可能是：\n• 数据格式问题\n• 前端处理逻辑错误\n• 网络传输问题\n\n请尝试重新加载`,
            showCancel: true,
            cancelText: '稍后重试',
            confirmText: '重新加载',
            success: (res) => {
              if (res.confirm) {
                setTimeout(() => this.loadProducts(), 1000)
              }
            }
          })
          
          throw error
        }
      } else {
        console.error('\n❌ API返回错误:')
        console.error('- result.code:', result?.code)
        console.error('- result.msg:', result?.msg)
        
        // 🔴 修复：API返回错误时的详细提示
        this.setData({ 
          loading: false,
          products: [],
          filteredProducts: [],
          totalCount: 0
        })
        
        const errorMsg = result?.msg || '获取商品列表失败'
        
        wx.showModal({
          title: '🚨 后端API错误',
          content: `API接口返回错误：\n\n错误码：${result?.code || '未知'}\n错误信息：${errorMsg}\n\n这可能是：\n• 后端服务异常\n• API接口逻辑问题\n• 数据库查询失败\n\n请联系后端开发人员检查。`,
          showCancel: true,
          cancelText: '知道了',
          confirmText: '重试',
          success: (res) => {
            if (res.confirm) {
              setTimeout(() => {
                this.loadProducts()
              }, 2000)
            }
          }
        })
        
        throw new Error(errorMsg)
      }
      
      console.log('=================== 商品加载完成 ===================\n')
      
    }).catch((error) => {
      const requestEndTime = Date.now()
      const requestDuration = requestEndTime - requestStartTime
      
      console.error('\n❌ 商品加载失败!')
      console.error('⏱️ 失败前耗时:', requestDuration + 'ms')
      console.error('🚨 错误详情:', {
        message: error.message,
        code: error.code,
        statusCode: error.statusCode,
        isAuthError: error.isAuthError,
        needsRelogin: error.needsRelogin
      })
      
      this.setData({ 
        loading: false,
        products: [],
        filteredProducts: [],
        totalCount: 0
      })
      
      // 🔧 错误分类处理 - 增强版
      if (error.isAuthError || error.needsRelogin || error.statusCode === 401 || error.code === 2001) {
        console.error('🔑 认证错误，这是商品显示空白的常见原因')
        
        wx.showModal({
          title: '🔑 认证失败',
          content: `JWT认证失败导致无法获取商品：\n\n${error.message || '访问令牌无效'}\n\n根据后端程序员分析，这是商品显示空白的直接原因。\n\n解决方案：重新登录获取有效Token`,
          showCancel: false,
          confirmText: '重新登录',
          confirmColor: '#FF6B35',
          success: () => {
            this.redirectToLogin()
          }
        })
      } else {
        console.error('🌐 网络或服务器错误，显示友好提示')
        
        let errorContent = '获取商品列表失败，请稍后重试'
        
        if (error.code) {
          errorContent = `商品加载失败详情：\n\n错误信息：${error.msg || error.message || '未知错误'}\n错误代码：${error.code}\n\n调试信息：\n• 接口：GET /api/exchange/products\n• 时间：${new Date().toLocaleString()}\n• 状态：${error.statusCode || '无状态码'}\n\n可能原因：\n• 网络连接问题\n• 后端服务异常\n• JWT Token过期\n\n建议：\n1. 检查网络连接\n2. 重新登录\n3. 联系技术支持`
        }
        
        wx.showModal({
          title: '📦 商品加载失败',
          content: errorContent,
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '立即重试',
          success: (res) => {
            if (res.confirm) {
              setTimeout(() => {
                this.loadProducts()
              }, 1000)
            }
          }
        })
      }
      
      console.log('=================== 商品加载错误处理完成 ===================\n')
    })
  },

  /**
   * 🔴 使用统一的Token状态检查函数 - 解决商品显示空白问题
   */
  checkTokenStatus() {
    const app = getApp()
    
    // 检查app实例
    if (!app || !app.globalData) {
      return {
        isValid: false,
        error: 'APP_NOT_INITIALIZED',
        message: '应用未初始化，请重新打开小程序',
        needsRelogin: true
      }
    }
    
    // 获取Token - 优先从全局数据，降级到本地存储
    let token = app.globalData.accessToken
    if (!token) {
      token = wx.getStorageSync('access_token')
      if (token) {
        // 同步到全局数据
        app.globalData.accessToken = token
        console.log('🔧 从本地存储恢复Token到全局数据')
      }
    }
    
    if (!token) {
      return {
        isValid: false,
        error: 'TOKEN_MISSING',
        message: '未找到访问令牌，需要重新登录',
        needsRelogin: true
      }
    }
    
    // 🔴 使用utils/api.js中的validateToken函数，确保逻辑一致
    const { validateToken } = require('../../utils/api')
    const validationResult = validateToken(token)
    
    if (!validationResult.isValid) {
      console.error('❌ Token验证失败:', validationResult.error, validationResult.message)
      return {
        isValid: false,
        error: validationResult.error,
        message: validationResult.message,
        needsRelogin: validationResult.needsRelogin,
        canRefresh: validationResult.canRefresh,
        expiredAt: validationResult.expiredAt
      }
    }
    
    console.log('✅ Token验证通过')
    return {
      isValid: true,
      message: validationResult.message,
      info: {
        userId: validationResult.userId,
        mobile: validationResult.mobile,
        isAdmin: validationResult.isAdmin,
        expiresAt: validationResult.expiresAt,
        willExpireSoon: validationResult.willExpireSoon
      }
    }
  },

  /**
   * 🔴 增强版Token错误处理函数 - 解决商品显示空白问题
   */
  handleTokenError(errorType, errorDetails) {
    this.setData({ loading: false })
    
    let title = '🔑 认证问题'
    let content = ''
    let showCancel = false
    let cancelText = '稍后处理'
    let confirmText = '重新登录'
    
    switch (errorType) {
      case 'APP_NOT_INITIALIZED':
        title = '🚨 系统错误'
        content = '应用初始化异常\n\n请重启小程序后重试'
        break
        
      case 'TOKEN_MISSING':
        title = '🔑 需要登录'
        content = '检测到您尚未登录\n\n这是商品显示空白的原因，请先登录后查看商品列表'
        break
        
      case 'TOKEN_EXPIRED':
        title = '🔑 登录已过期'
        content = `您的登录状态已过期\n\n${errorDetails?.expiredAt ? '过期时间: ' + errorDetails.expiredAt + '\n\n' : ''}这是商品显示空白的直接原因，请重新登录获取有效访问令牌`
        showCancel = true
        break
        
      case 'TOKEN_INVALID_FORMAT':
      case 'TOKEN_INVALID':
        title = '🔑 Token格式错误'
        content = '登录信息格式异常\n\n可能原因：\n• Token数据损坏\n• 存储异常\n• 网络传输错误\n\n请重新登录修复此问题'
        showCancel = true
        break
        
      case 'TOKEN_INVALID_JWT':
        title = '🔑 JWT格式错误'
        content = 'JWT Token格式不正确\n\n可能原因：\n• Token被意外修改\n• 格式不符合JWT标准\n• 数据传输错误\n\n请重新登录获取正确格式的Token'
        showCancel = true
        break
        
      case 'TOKEN_DECODE_ERROR':
      case 'TOKEN_DECODE_FAILED':
        title = '🔑 Token解码失败'
        content = 'Token解码失败，数据可能已损坏\n\n可能原因：\n• Token内容被篡改\n• 编码格式错误\n• 密钥不匹配\n\n请重新登录获取有效Token'
        showCancel = true
        break
        
      case 'TOKEN_MISSING_USER_ID':
        title = '🔑 Token缺少用户信息'
        content = 'Token中缺少必要的用户信息\n\n这可能是Token生成时的问题，请重新登录获取完整的用户Token'
        break
        
      default:
        title = '🔑 认证状态异常'
        content = `认证状态检查失败\n\n错误类型: ${errorType}\n\n这是商品显示空白的可能原因，请重新登录后查看商品`
        showCancel = true
    }
    
    wx.showModal({
      title: title,
      content: content,
      showCancel: showCancel,
      cancelText: cancelText,
      confirmText: confirmText,
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          this.redirectToLogin()
        }
      }
    })
  },

  /**
   * 🔴 新增：认证失败处理函数
   */
  handleAuthFailure() {
    console.log('🔑 处理认证失败...')
    
    // 清除无效的认证信息
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.accessToken = null
      app.globalData.refreshToken = null
      app.globalData.userInfo = null
      app.globalData.isLoggedIn = false
    }
    
    // 清除本地存储
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
    } catch (error) {
      console.warn('⚠️ 清除本地存储失败:', error)
    }
    
    // 显示用户友好提示
    wx.showModal({
      title: '🔑 登录过期',
      content: '您的登录状态已过期\n\n为了查看商品列表，请重新登录',
      showCancel: false,
      confirmText: '重新登录',
      confirmColor: '#FF6B35',
      success: () => {
        this.redirectToLogin()
      }
    })
  },

  /**
   * 🔴 新增：安全跳转登录页面
   */
  redirectToLogin() {
    console.log('🔄 跳转到登录页面...')
    
    // 尝试多种跳转方式确保成功
    wx.reLaunch({
      url: '/pages/auth/auth',
      success: () => {
        console.log('✅ 成功跳转到登录页面')
      },
      fail: (error) => {
        console.error('❌ reLaunch失败，尝试redirectTo:', error)
        
        wx.redirectTo({
          url: '/pages/auth/auth',
          success: () => {
            console.log('✅ redirectTo跳转成功')
          },
          fail: (redirectError) => {
            console.error('❌ redirectTo也失败:', redirectError)
            
            // 最后尝试navigateTo
            wx.navigateTo({
              url: '/pages/auth/auth',
              fail: (navigateError) => {
                console.error('❌ 所有跳转方式都失败:', navigateError)
                
                wx.showToast({
                  title: '跳转失败，请手动重新打开小程序',
                  icon: 'none',
                  duration: 3000
                })
              }
            })
          }
        })
      }
    })
  },

  /**
   * 🚨 已删除违规函数：setDefaultProducts()
   * 🔴 原因：使用Mock数据违反项目安全规则
   * ✅ 正确做法：出错时显示明确的后端服务异常提示
   */

  /**
   * 连接WebSocket监听库存变化
   * 🔴 根据后端文档实现库存实时同步
   */
  connectWebSocket() {
    if (!app.globalData.wsManager) {
      console.log('WebSocket管理器未初始化')
      return
    }

    // 监听库存更新推送
    app.globalData.wsManager.on('stock_update', (data) => {
      console.log('📦 收到库存更新推送:', data)
      this.updateProductStock(data.data.product_id, data.data.stock)
    })

    console.log('✅ 已连接WebSocket，监听库存变化')
  },

  /**
   * 断开WebSocket连接
   */
  disconnectWebSocket() {
    if (app.globalData.wsManager) {
      app.globalData.wsManager.off('stock_update')
      console.log('🔌 已断开WebSocket库存监听')
    }
  },

  /**
   * 更新商品库存
   * 🔴 根据后端WebSocket推送更新库存
   * @param {Number} productId 商品ID
   * @param {Number} newStock 新库存数量
   */
  updateProductStock(productId, newStock) {
    const products = this.data.products
    const productIndex = products.findIndex(p => p.id === productId || p.commodity_id === productId)
    
    if (productIndex !== -1) {
      products[productIndex].stock = newStock
      this.setData({ products })
      
      console.log(`📦 商品库存已更新: ID${productId} -> ${newStock}`)
      
      // 如果库存为0，显示缺货提示
      if (newStock === 0) {
        wx.showToast({
          title: `${products[productIndex].name} 已售罄`,
          icon: 'none',
          duration: 2000
        })
      }
    }
  },

  /**
   * 刷新页面数据
   */
  refreshPage() {
    this.setData({ refreshing: true })
    
    return Promise.all([
      this.refreshUserInfo(),
      this.loadProducts()
    ]).then(() => {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    }).catch(error => {
      console.error('❌ 刷新页面失败:', error)
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 🔧 图片加载错误处理 - 2025年01月12日修复
   * 当商品图片加载失败时，使用默认图片替代
   */
  onImageError(e) {
    const index = e.currentTarget.dataset.index
    const defaultImage = '/images/default-product.png'
    
    console.log(`⚠️ 商品图片加载失败，索引: ${index}，使用默认图片`)
    
    // 更新对应商品的图片为默认图片
    const filteredProducts = this.data.filteredProducts.map((product, i) => {
      if (i === index) {
        return { ...product, image: defaultImage }
      }
      return product
    })
    
    this.setData({ filteredProducts })
    
    // 同时更新原始商品数据
    const products = this.data.products.map(product => {
      if (product.id === this.data.filteredProducts[index]?.id) {
        return { ...product, image: defaultImage }
      }
      return product
    })
    
    this.setData({ products })
  },

  /**
   * 商品点击事件
   */
  onProductTap(e) {
    const product = e.currentTarget.dataset.product
    console.log('点击商品:', product)

    // 检查库存
    if (product.stock <= 0) {
      wx.showToast({
        title: '商品已售罄',
        icon: 'none'
      })
      return
    }

    // 检查积分
    if (this.data.totalPoints < product.exchange_points) {
      wx.showToast({
        title: '积分不足',
        icon: 'none'
      })
      return
    }

    // 显示兑换确认弹窗
    this.setData({
      showConfirm: true,
      selectedProduct: product
    })
  },

  /**
   * 确认兑换
   */
  onConfirmExchange() {
    const selectedProduct = this.data.selectedProduct
    if (!selectedProduct) {
      wx.showToast({
        title: '未选择商品',
        icon: 'none'
      })
      return
    }

    // 再次检查积分和库存
    if (this.data.totalPoints < selectedProduct.exchange_points) {
      wx.showToast({
        title: '积分不足',
        icon: 'none'
      })
      return
    }

    if (selectedProduct.stock <= 0) {
      wx.showToast({
        title: '商品已售罄',
        icon: 'none'
      })
      return
    }

    // 关闭确认弹窗
    this.setData({
      showConfirm: false,
      exchanging: true
    })

    // 执行兑换
    this.performExchange(selectedProduct)
  },

  /**
   * 执行兑换操作
   */
  performExchange(product) {
    wx.showLoading({ title: '兑换中...' })

    // 🔴 删除违规代码：严禁使用模拟数据，所有兑换操作均通过后端真实API
    const exchangePromise = exchangeAPI.redeem(product.id, 1)

    exchangePromise.then((result) => {
      wx.hideLoading()
      
      // 更新用户积分
      const newPoints = result.data.remaining_points
      this.setData({
        totalPoints: newPoints,
        exchanging: false
      })
      
      // 更新全局积分
      if (app.globalData.userInfo) {
        app.globalData.userInfo.total_points = newPoints
      }
      // 🚨 已删除：mockUser违规代码 - 违反项目安全规则
      // ✅ 积分更新必须通过后端API同步
      
      // 🔴 删除违规代码：商品库存更新由后端API处理，前端不进行模拟操作
      
      // 显示成功提示
      wx.showToast({
        title: '兑换成功',
        icon: 'success'
      })
      
      // 刷新商品列表
      this.filterProducts()
      
    }).catch((error) => {
      wx.hideLoading()
      this.setData({ exchanging: false })
      console.error('❌ 商品兑换失败:', error)
      
      wx.showToast({
        title: error.msg || '兑换失败',
        icon: 'none'
      })
    })
  },

  /**
   * 取消兑换
   */
  onCancelExchange() {
    this.setData({
      showConfirm: false,
      selectedProduct: null
    })
  },

  /**
   * 关闭结果弹窗
   */
  onCloseResult() {
    this.setData({
      showResult: false,
      resultData: null
    })
  },

  /**
   * 查看兑换记录
   */
  onViewRecords() {
    wx.showModal({
      title: '兑换记录',
      content: '兑换记录功能正在开发中...\n\n您可以在个人中心查看积分明细了解兑换消费记录',
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
   * 查看商品详情
   */
  onViewProductDetail(e) {
    const product = e.currentTarget.dataset.product
    wx.navigateTo({
      url: `/pages/product/product-detail?id=${product.id}`
    })
  },

  /**
   * 预览商品图片
   */
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '精美商品等你兑换！',
      path: '/pages/exchange/exchange'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '餐厅积分兑换 - 精美商品等你来'
    }
  },

  /**
   * 商品兑换流程 - 增强版实现
   */
  onExchangeProduct() {
    const selectedProduct = this.data.selectedProduct
    const exchangeQuantity = this.data.exchangeQuantity || 1
    const totalCost = selectedProduct.exchange_points * exchangeQuantity

    // 最终确认
    this.showExchangeConfirm(selectedProduct, exchangeQuantity, totalCost).then((confirmResult) => {
      if (!confirmResult.confirmed) {
        console.log('用户取消兑换')
        return
      }

      this.setData({ 
        exchanging: true,
        exchangeProgress: 0 
      })
      
      // 显示兑换进度
      this.showExchangeProgress()

      // 🔴 删除违规代码：严禁使用模拟数据，所有商品兑换均通过后端真实API
      const exchangePromise = exchangeAPI.redeem(selectedProduct.id, exchangeQuantity)

      exchangePromise.then((exchangeResult) => {
        console.log('🎉 商品兑换成功:', exchangeResult.data)
        
        // 更新用户积分
        const newPoints = exchangeResult.data.remaining_points
        this.setData({
          totalPoints: newPoints,
          exchanging: false,
          showExchangeModal: false,
          exchangeProgress: 100
        })
        
        // 更新全局积分
        if (app.globalData.userInfo) {
          app.globalData.userInfo.total_points = newPoints
        }
        // 🚨 已删除：mockUser违规代码 - 违反项目安全规则
        // ✅ 积分更新必须通过后端API同步
        
        // 显示成功结果
        this.showExchangeSuccess(exchangeResult.data)
        
      }).catch((error) => {
        this.setData({ 
          exchanging: false,
          exchangeProgress: 0 
        })
        console.error('❌ 商品兑换失败:', error)
        this.showExchangeError(error)
      })
    })
  },

  /**
   * 显示兑换确认对话框
   * @param {Object} product 商品信息
   * @param {Number} quantity 兑换数量
   * @param {Number} totalCost 总积分消耗
   */
  showExchangeConfirm(product, quantity, totalCost) {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认兑换',
        content: `商品：${product.name}\n数量：${quantity}件\n消耗积分：${totalCost}分\n剩余积分：${this.data.totalPoints - totalCost}分`,
        confirmText: '确认兑换',
        cancelText: '取消',
        success: (res) => {
          resolve(res.confirm)
        }
      })
    })
  },

  /**
   * 显示兑换成功结果
   * @param {Object} result 兑换结果数据
   */
  showExchangeResult(result) {
    let content = `订单号：${result.order_id}\n商品：${result.product_name}\n数量：${result.quantity}件\n`
    
    if (result.delivery_info) {
      content += `\n${result.delivery_info}`
    }
    
    wx.showModal({
      title: '兑换成功！',
      content,
      showCancel: false,
      confirmText: '查看订单',
      success: () => {
        // 可以跳转到兑换记录页面
        // wx.navigateTo({
        //   url: '/pages/records/exchange-records'
        // })
      }
    })
  },

  /**
   * 搜索输入处理
   */
  onSearchInput(e) {
    const keyword = e.detail.value.trim()
    this.setData({
      searchKeyword: keyword
    })
    this.filterProducts()
  },

  /**
   * 筛选切换
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      currentFilter: filter
    })
    this.filterProducts()
  },

  /**
   * 筛选商品
   */
  filterProducts() {
    console.log('\n🔍 开始商品筛选过程...')
    console.log('📊 当前页面数据状态:', {
      'this.data.products': this.data.products?.length || 0,
      'this.data.filteredProducts': this.data.filteredProducts?.length || 0
    })
    
    // 🚨 已删除：mockProducts违规引用
    // ✅ 统一数据源：仅使用从后端API获取的products
    let sourceProducts = [...this.data.products]
    console.log('🔄 复制源商品数据，数量:', sourceProducts.length)
    
    // 如果没有商品数据，直接返回
    if (!sourceProducts || sourceProducts.length === 0) {
      console.warn('⚠️ 源商品数据为空，设置filteredProducts为空数组')
      this.setData({
        filteredProducts: [],
        totalProducts: 0,
        totalPages: 1
      })
      console.log('❌ filterProducts提前返回，原因：无源商品数据')
      return
    }
    
    let filtered = [...sourceProducts]
    
    // 搜索关键词筛选
    if (this.data.searchKeyword) {
      filtered = filtered.filter(product => 
        product.name.toLowerCase().includes(this.data.searchKeyword.toLowerCase()) ||
        product.description.toLowerCase().includes(this.data.searchKeyword.toLowerCase())
      )
    }
    
    // 基础筛选条件
    switch (this.data.currentFilter) {
      case 'available':
        filtered = filtered.filter(product => 
          product.stock > 0 && this.data.totalPoints >= product.exchange_points
        )
        break
      case 'low-price':
        filtered = filtered.filter(product => product.exchange_points <= 1000)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    // 高级筛选 - 分类
    if (this.data.categoryFilter !== 'all') {
      filtered = filtered.filter(product => product.category === this.data.categoryFilter)
    }
    
    // 高级筛选 - 积分范围
    switch (this.data.pointsRange) {
      case '0-500':
        filtered = filtered.filter(product => product.exchange_points >= 0 && product.exchange_points <= 500)
        break
      case '500-1000':
        filtered = filtered.filter(product => product.exchange_points > 500 && product.exchange_points <= 1000)
        break
      case '1000-2000':
        filtered = filtered.filter(product => product.exchange_points > 1000 && product.exchange_points <= 2000)
        break
      case '2000+':
        filtered = filtered.filter(product => product.exchange_points > 2000)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    // 高级筛选 - 库存状态
    switch (this.data.stockFilter) {
      case 'in-stock':
        filtered = filtered.filter(product => product.stock > 5)
        break
      case 'low-stock':
        filtered = filtered.filter(product => product.stock <= 5 && product.stock > 0)
        break
      default:
        // 'all' - 不过滤
        break
    }
    
    // 排序
    switch (this.data.sortBy) {
      case 'points-asc':
        filtered.sort((a, b) => a.exchange_points - b.exchange_points)
        break
      case 'points-desc':
        filtered.sort((a, b) => b.exchange_points - a.exchange_points)
        break
      case 'stock-desc':
        filtered.sort((a, b) => b.stock - a.stock)
        break
      case 'rating-desc':
        filtered.sort((a, b) => parseFloat(b.rating) - parseFloat(a.rating))
        break
      default:
        // 'default' - 按创建时间排序
        filtered.sort((a, b) => new Date(b.created_time || Date.now()) - new Date(a.created_time || Date.now()))
        break
    }
    
    // 计算总页数
    const totalPages = Math.ceil(filtered.length / this.data.pageSize)
    
    // 确保当前页码有效
    let currentPage = this.data.currentPage
    if (currentPage > totalPages) {
      currentPage = Math.max(1, totalPages)
      this.setData({ currentPage })
    }
    
    // 分页处理
    const startIndex = (currentPage - 1) * this.data.pageSize
    const endIndex = startIndex + this.data.pageSize
    const paginatedProducts = filtered.slice(startIndex, endIndex)
    
    this.setData({
      filteredProducts: paginatedProducts,
      totalPages,
      totalProducts: filtered.length
    })
    
    console.log('📦 商品筛选完成:', {
      total: sourceProducts.length,
      filtered: filtered.length,
      displayed: paginatedProducts.length,
      currentPage,
      totalPages
    })
  },

  /**
   * 页码变更
   */
  onPageChange(e) {
    const page = parseInt(e.currentTarget.dataset.page)
    
    if (page >= 1 && page <= this.data.totalPages) {
      this.setData({
        currentPage: page
      })
      this.filterProducts()
      
      // 滚动到顶部
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  /**
   * 上一页
   */
  onPrevPage() {
    if (this.data.currentPage > 1) {
      this.setData({
        currentPage: this.data.currentPage - 1
      })
      this.filterProducts()
      
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  /**
   * 下一页
   */
  onNextPage() {
    if (this.data.currentPage < this.data.totalPages) {
      this.setData({
        currentPage: this.data.currentPage + 1
      })
      this.filterProducts()
      
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    }
  },

  /**
   * 显示/隐藏高级筛选
   */
  onToggleAdvancedFilter() {
    this.setData({
      showAdvancedFilter: !this.data.showAdvancedFilter
    })
  },

  /**
   * 分类筛选变更
   */
  onCategoryFilterChange(e) {
    const category = e.currentTarget.dataset.category
    this.setData({
      categoryFilter: category,
      currentPage: 1 // 重置到第一页
    })
    this.filterProducts()
  },

  /**
   * 积分范围筛选变更
   */
  onPointsRangeChange(e) {
    const range = e.currentTarget.dataset.range
    this.setData({
      pointsRange: range,
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 库存状态筛选变更
   */
  onStockFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    this.setData({
      stockFilter: filter,
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 排序方式变更
   */
  onSortByChange(e) {
    const sortBy = e.currentTarget.dataset.sort
    this.setData({
      sortBy: sortBy,
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 重置筛选条件
   */
  onResetFilters() {
    this.setData({
      searchKeyword: '',
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      currentPage: 1
    })
    this.filterProducts()
    
    wx.showToast({
      title: '筛选条件已重置',
      icon: 'success'
    })
  },

  /**
   * 页面跳转输入变更
   */
  onPageInputChange(e) {
    this.setData({
      jumpPageNumber: e.detail.value
    })
  },

  /**
   * 页面跳转确认
   */
  onPageInputConfirm(e) {
    const pageNumber = parseInt(e.detail.value)
    
    if (pageNumber >= 1 && pageNumber <= this.data.totalPages) {
      this.setData({
        currentPage: pageNumber
      })
      this.filterProducts()
      
      wx.pageScrollTo({
        scrollTop: 0,
        duration: 300
      })
    } else {
      wx.showToast({
        title: '页码超出范围',
        icon: 'none'
      })
    }
  },

  /**
   * 清除搜索
   */
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      currentFilter: 'all'
    })
    this.applyFilters()
  },

  /**
   * 刷新商品列表
   */
  onRefreshProducts() {
    this.setData({ loading: true })
    this.loadProducts()
  },

  /**
   * 按积分排序
   */
  onSortByPoints() {
    this.setData({
      sortBy: 'points-asc',
      currentPage: 1
    })
    this.filterProducts()
    
    wx.showToast({
      title: '按积分排序完成',
      icon: 'success'
    })
  },

  /**
   * 筛选商品
   */
  applyFilters() {
    this.filterProducts()
  },

  /**
   * 检查并刷新商品数据
   * 实现与商家管理页面的数据联动
   */
  checkAndRefreshProducts() {
    try {
      const app = getApp()
      
      // 检查全局刷新标志
      if (app.globalData.needRefreshExchangeProducts) {
        console.log('🔄 检测到商品数据更新，刷新商品列表')
        this.refreshProductsFromMerchant()
        app.globalData.needRefreshExchangeProducts = false
      }
      
      // 检查商品更新时间戳
      const lastUpdate = app.globalData.merchantProductsLastUpdate || 0
      const currentTime = Date.now()
      if (currentTime - lastUpdate < 5000) { // 5秒内的更新
        console.log('🔄 检测到最近的商品更新，刷新商品列表')
        this.refreshProductsFromMerchant()
      }
    } catch (error) {
      console.warn('⚠️ 检查商品更新失败:', error)
    }
  },

  /**
   * 从商家管理同步商品数据
   * 当商家管理页面更新商品时，通过此方法同步最新数据
   */
  refreshProductsFromMerchant() {
    console.log('🔄 从商家管理同步商品数据...')
    
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟同步
      console.log('🔧 模拟商家数据同步')
      return new Promise(resolve => setTimeout(resolve, 500)).then(() => {
        // 重新加载商品列表
        return this.loadProducts()
      }).then(() => {
        console.log('✅ 商品数据同步完成')
        wx.showToast({
          title: '商品数据已更新',
          icon: 'success'
        })
      })
    } else {
      // 生产环境从后端同步
      return exchangeAPI.syncProducts().then((syncData) => {
        this.setData({
          products: syncData.data.products,
          totalCount: syncData.data.total
        })
        
        console.log('✅ 商品数据同步完成，共', syncData.data.products.length, '个商品')
        wx.showToast({
          title: '商品数据已更新',
          icon: 'success'
        })
      }).catch((error) => {
        console.error('❌ 商品数据同步失败:', error)
        // 降级方案：重新加载本地数据
        return this.loadProducts()
      })
    }
  },

  /**
   * 🔴 JWT认证诊断 - 帮助识别token问题
   */
  runJWTDiagnostics() {
    console.log('\n🔍=================== JWT认证诊断开始 ===================')    
    console.log('🕐 诊断时间:', new Date().toLocaleString())
    
    const app = getApp()
    
    // 1. 应用状态检查
    console.log('📱 应用状态:', {
      isAppReady: !!app,
      hasGlobalData: !!app.globalData,
      isLoggedIn: app.globalData ? app.globalData.isLoggedIn : false
    })
    
    // 2. Token存储检查
    const globalToken = app.globalData ? app.globalData.accessToken : null
    const storageToken = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const userInfo = wx.getStorageSync('user_info')
    
    console.log('🔑 Token存储状态:', {
      hasGlobalToken: !!globalToken,
      hasStorageToken: !!storageToken,
      hasRefreshToken: !!refreshToken,
      hasUserInfo: !!userInfo,
      globalTokenLength: globalToken ? globalToken.length : 0,
      storageTokenLength: storageToken ? storageToken.length : 0
    })
    
    // 3. 选择使用的token
    const activeToken = globalToken || storageToken
    
    if (!activeToken) {
      console.error('❌ 致命问题：没有任何可用的token！')
      console.log('🔄 建议：用户需要重新登录')
    } else {
      console.log('🔍 当前使用Token:', activeToken.substring(0, 30) + '...')
      
      // 4. JWT结构分析
      try {
        const parts = activeToken.split('.')
        console.log('🔍 JWT结构分析:', {
          totalParts: parts.length,
          isValidJWT: parts.length === 3,
          headerLength: parts[0] ? parts[0].length : 0,
          payloadLength: parts[1] ? parts[1].length : 0,
          signatureLength: parts[2] ? parts[2].length : 0
        })
        
        if (parts.length === 3) {
          // 解码header
          const header = JSON.parse(atob(parts[0]))
          console.log('🔍 JWT Header:', header)
          
          // 解码payload
          const payload = JSON.parse(atob(parts[1]))
          console.log('🔍 JWT Payload:', {
            userId: payload.userId || payload.user_id,
            mobile: payload.mobile,
            isAdmin: payload.is_admin,
            iat: payload.iat ? new Date(payload.iat * 1000).toLocaleString() : 'N/A',
            exp: payload.exp ? new Date(payload.exp * 1000).toLocaleString() : 'N/A',
            currentTime: new Date().toLocaleString()
          })
          
          // 检查过期状态
          const now = Math.floor(Date.now() / 1000)
          if (payload.exp) {
            const isExpired = payload.exp < now
            const timeLeft = payload.exp - now
            console.log('⏰ Token过期检查:', {
              isExpired: isExpired,
              timeLeft: isExpired ? `已过期${Math.abs(timeLeft)}秒` : `还有${timeLeft}秒`,
              expiresAt: new Date(payload.exp * 1000).toLocaleString()
            })
            
            if (isExpired) {
              console.error('🚨 Token已过期！这是401错误的直接原因')
            }
          }
        }
      } catch (error) {
        console.error('❌ JWT解析失败:', error.message)
        console.error('🚨 Token格式错误！这可能是401错误的原因')
      }
    }
    
    // 5. 环境配置检查
    console.log('🌍 环境配置:', {
      platform: 'wechat-miniprogram',
      apiBaseUrl: app.globalData ? app.globalData.apiBaseUrl : 'unknown'
    })
    
    console.log('=================== JWT认证诊断结束 ===================\n')
  },

  /**
   * 🔴 手动触发Token检查（调试用）
   */
  onDebugTokenCheck() {
    console.log('🔧 手动触发Token检查')
    
    const tokenStatus = this.checkTokenStatus()
    
    wx.showModal({
      title: '🔍 Token诊断结果',
      content: `Token状态：${tokenStatus.isValid ? '✅ 有效' : '❌ 无效'}\n\n${tokenStatus.message || tokenStatus.info}\n\n详细信息请查看控制台日志`,
      showCancel: false,
      confirmText: '知道了'
    })
    
    // 如果token无效，触发修复流程
    if (!tokenStatus.isValid) {
      setTimeout(() => {
        this.handleTokenError(tokenStatus.error)
      }, 1000)
    }
  },

  /**
   * 🔍 运行JWT诊断工具 - 解决商品显示空白问题
   */
  runJWTDiagnostics() {
    console.log('🔍 启动商品显示问题诊断工具...')
    
    // 引入诊断工具
    const ProductDisplayDiagnostic = require('../../utils/product-display-diagnostic.js')
    const diagnostic = new ProductDisplayDiagnostic()
    
    // 运行完整诊断
    diagnostic.runFullDiagnostic().then((results) => {
      console.log('🎯 诊断完成，结果数量:', results.length)
      
      // 检查是否有严重问题
      const criticalIssues = results.filter(r => r.type === 'FAIL' || r.type === 'ERROR')
      const solutions = results.filter(r => r.type === 'SOLUTION')
      
      if (criticalIssues.length > 0) {
        console.log('🚨 发现关键问题:', criticalIssues.length, '个')
        
        // 显示诊断结果给用户
        const issueMsg = criticalIssues.map(issue => `• ${issue.category}: ${issue.message}`).join('\n')
        const solutionMsg = solutions.length > 0 ? `\n\n🔧 建议解决方案:\n${solutions[0].message}` : ''
        
        wx.showModal({
          title: '🔍 商品显示问题诊断',
          content: `发现${criticalIssues.length}个问题:\n\n${issueMsg}${solutionMsg}`,
          showCancel: true,
          cancelText: '稍后处理',
          confirmText: '立即修复',
          success: (res) => {
            if (res.confirm && solutions.length > 0) {
              // 如果有自动修复方案，执行修复
              if (solutions[0].solution && solutions[0].solution.autoFix) {
                diagnostic.autoFixTokenIssue()
              } else {
                // 显示手动修复指导
                this.showManualFixGuide(solutions[0])
              }
            }
          }
        })
      } else {
        console.log('✅ 诊断通过，但商品仍显示异常，可能是数据处理问题')
        wx.showModal({
          title: '🔍 诊断结果',
          content: '未发现明显问题，可能是数据处理逻辑异常。\n\n建议：\n1. 检查API返回数据格式\n2. 验证数据映射逻辑\n3. 清除缓存重新加载',
          showCancel: true,
          cancelText: '手动处理',
          confirmText: '清除缓存',
          success: (res) => {
            if (res.confirm) {
              this.clearCacheAndReload()
            }
          }
        })
      }
      
    }).catch((error) => {
      console.error('❌ 诊断工具运行失败:', error)
      wx.showToast({
        title: '诊断工具异常',
        icon: 'none'
      })
    })
  },

  /**
   * 📋 显示手动修复指导
   */
  showManualFixGuide(solution) {
    const steps = solution.solution && solution.solution.steps ? 
      solution.solution.steps.join('\n') : '请参考诊断日志进行修复'
    
    wx.showModal({
      title: '🔧 修复指导',
      content: `${solution.message}\n\n修复步骤:\n${steps}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🧹 清除缓存并重新加载
   */
  clearCacheAndReload() {
    console.log('🧹 清除缓存并重新加载...')
    
    try {
      // 清除相关缓存
      wx.removeStorageSync('products_cache')
      wx.removeStorageSync('exchange_cache')
      
      // 设置需要刷新标志
      const app = getApp()
      app.globalData.needRefreshExchangeProducts = true
      
      wx.showLoading({ title: '清除缓存中...' })
      
      // 延迟重新加载
      setTimeout(() => {
        wx.hideLoading()
        this.loadProducts()
        wx.showToast({
          title: '缓存已清除',
          icon: 'success'
        })
      }, 1000)
      
    } catch (error) {
      console.error('❌ 清除缓存失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '清除缓存失败',
        icon: 'none'
      })
    }
  },

  /**
   * 🔍 测试Token状态和商品加载 - 验证修复效果
   * 这是一个调试用函数，用于验证Token认证修复是否生效
   */
  testTokenAndProductLoading() {
    console.log('\n🧪=================== 开始Token和商品加载测试 ===================')
    console.log('🕐 测试时间:', new Date().toLocaleString())
    
    // 1. 测试Token状态
    console.log('\n📊 第1步：测试Token状态检查')
    const tokenStatus = this.checkTokenStatus()
    console.log('🔍 Token检查结果:', {
      isValid: tokenStatus.isValid,
      error: tokenStatus.error,
      message: tokenStatus.message,
      userInfo: tokenStatus.info
    })
    
    if (!tokenStatus.isValid) {
      console.error('❌ Token状态异常，这会导致商品显示空白')
      console.error('🔧 建议修复方案：', {
        error: tokenStatus.error,
        needsRelogin: tokenStatus.needsRelogin,
        canRefresh: tokenStatus.canRefresh
      })
      
      wx.showModal({
        title: '🧪 Token测试结果',
        content: `Token状态：❌ 异常\n\n错误：${tokenStatus.error}\n消息：${tokenStatus.message}\n\n这就是商品显示空白的原因！`,
        showCancel: true,
        cancelText: '知道了',
        confirmText: '修复Token',
        success: (res) => {
          if (res.confirm) {
            this.handleTokenError(tokenStatus.error, {
              expiredAt: tokenStatus.expiredAt,
              canRefresh: tokenStatus.canRefresh,
              message: tokenStatus.message
            })
          }
        }
      })
      return
    }
    
    console.log('✅ Token状态正常，继续测试API调用')
    
    // 2. 测试商品API调用
    console.log('\n📊 第2步：测试商品API调用')
    const { exchangeAPI } = require('../../utils/api')
    
    exchangeAPI.getProducts(1, 20, undefined, 'points').then((result) => {
      console.log('✅ API调用成功!', result)
      
      const hasProducts = result && result.code === 0 && result.data && result.data.products && result.data.products.length > 0
      
      wx.showModal({
        title: '🧪 商品加载测试结果',
        content: `Token状态：✅ 正常\nAPI调用：✅ 成功\n商品数量：${hasProducts ? result.data.products.length : 0}\n\n${hasProducts ? '商品加载正常！' : '商品列表为空，请检查后端数据'}`,
        showCancel: false,
        confirmText: '知道了'
      })
      
      if (hasProducts) {
        console.log('🎉 测试完成：Token认证和商品加载都正常工作!')
      } else {
        console.warn('⚠️ API调用成功但商品列表为空，可能是后端数据问题')
      }
      
    }).catch((error) => {
      console.error('❌ API调用失败:', error)
      
      wx.showModal({
        title: '🧪 商品加载测试结果',
        content: `Token状态：✅ 正常\nAPI调用：❌ 失败\n\n错误：${error.msg || error.message}\n状态码：${error.statusCode || '未知'}\n\n这表明Token修复可能未完全解决问题`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
    
    console.log('=================== Token和商品加载测试完成 ===================\n')
  },

  /**
   * 🔧 重新加载商品 - 简化版测试函数
   */
  onReloadProducts() {
    console.log('\n🔄 手动重新加载商品...')
    
    // 重置状态
    this.setData({
      loading: true,
      products: [],
      filteredProducts: [],
      totalCount: 0
    })
    
    // 调用商品加载函数
    this.loadProducts().then(() => {
      console.log('✅ 手动重新加载完成')
    }).catch((error) => {
      console.error('❌ 手动重新加载失败:', error)
    })
  },

  /**
   * 🔧 调试：显示当前页面数据状态
   */
  onShowDebugInfo() {
    const debugInfo = {
      'Token状态': app.globalData.accessToken ? '已设置' : '未设置',
      'Loading状态': this.data.loading,
      'Products数量': this.data.products.length,
      'FilteredProducts数量': this.data.filteredProducts.length,
      'TotalCount': this.data.totalCount,
      '用户信息': this.data.userInfo ? '已加载' : '未加载',
      '用户积分': this.data.totalPoints
    }
    
    console.log('🔍 页面数据状态:', debugInfo)
    
    wx.showModal({
      title: '🔍 调试信息',
      content: Object.entries(debugInfo)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n'),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔍 API数据诊断 - 分析categories和products数据差异
   */
  diagnoseCategoriesVsProducts() {
    console.log('\n🔍 开始API数据诊断...')
    
    const { exchangeAPI } = require('../../utils/api')
    
    exchangeAPI.getProducts(1, 20, undefined, 'points').then((result) => {
      console.log('📊 API响应详细分析:')
      console.log('完整响应:', JSON.stringify(result, null, 2))
      
      if (result && result.code === 0 && result.data) {
        const data = result.data
        
        const diagnosis = {
          '✅ API调用': '成功',
          '📦 Products数组': data.products ? `存在，长度: ${data.products.length}` : '不存在',
          '📂 Categories数组': data.categories ? `存在，内容: [${data.categories.join(', ')}]` : '不存在',
          '🔢 Total字段': data.total !== undefined ? data.total : '未定义',
          '📄 Page字段': data.page !== undefined ? data.page : '未定义',
          '🔢 Limit字段': data.limit !== undefined ? data.limit : '未定义',
          '➡️ Has_more字段': data.has_more !== undefined ? data.has_more : '未定义'
        }
        
        console.log('🔍 诊断结果:', diagnosis)
        
        // 分析问题
        let problemAnalysis = '📋 问题分析:\n\n'
        
        if (data.categories && data.categories.length > 0 && (!data.products || data.products.length === 0)) {
          problemAnalysis += '🚨 发现关键问题：\n'
          problemAnalysis += '• Categories有数据但Products为空\n'
          problemAnalysis += '• 这表明后端分类查询正常，但商品查询有问题\n\n'
          
          problemAnalysis += '🔍 可能原因：\n'
          problemAnalysis += '1. 商品查询SQL条件过于严格\n'
          problemAnalysis += '2. 商品状态字段不是"active"\n'
          problemAnalysis += '3. 权限验证阻止了商品查询\n'
          problemAnalysis += '4. 商品和分类使用不同的数据源\n\n'
          
          problemAnalysis += '🔧 建议检查：\n'
          problemAnalysis += '• 后端商品查询的WHERE条件\n'
          problemAnalysis += '• 数据库中商品的status字段值\n'
          problemAnalysis += '• API接口的权限验证逻辑\n'
          problemAnalysis += '• 13612227930用户的权限配置'
        } else if (!data.categories || data.categories.length === 0) {
          problemAnalysis += '⚠️ Categories也为空，可能是全局API问题'
        } else if (data.products && data.products.length > 0) {
          problemAnalysis += '✅ Products和Categories都有数据，正常状态'
        }
        
        wx.showModal({
          title: '🔍 API数据诊断结果',
          content: Object.entries(diagnosis)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n') + '\n\n' + problemAnalysis,
          showCancel: true,
          cancelText: '知道了',
          confirmText: '查看日志',
          success: (res) => {
            if (res.confirm) {
              console.log('📋 详细诊断信息已输出到控制台')
            }
          }
        })
        
      } else {
        wx.showModal({
          title: '❌ API调用失败',
          content: `API返回异常:\n\nCode: ${result?.code}\nMessage: ${result?.msg || '未知错误'}`,
          showCancel: false,
          confirmText: '知道了'
        })
      }
    }).catch((error) => {
      console.error('❌ API诊断失败:', error)
      wx.showModal({
        title: '❌ API诊断失败',
        content: `网络或认证错误:\n\n${error.message || error}`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },
}) 