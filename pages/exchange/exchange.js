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
    
    // 开发环境模拟数据
    mockProducts: [],

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

  onLoad() {
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
    app.globalData.setExchangeUpdateCallback(() => {
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
    app.globalData.clearExchangeUpdateCallback()
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
    
    // 生成模拟商品数据（开发环境）
    if (app.globalData.isDev && !app.globalData.needAuth) {
      this.generateMockProducts()
    }
    
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
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟用户数据')
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return Promise.resolve()
    }

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
   * 生成模拟商品数据（开发环境）
   */
  generateMockProducts() {
    const productNames = [
      // 优惠券类 (1-20)
      '品牌钥匙扣', '限定保温杯', '定制餐具套装', '定制围裙',
      '精美马克杯', '竹制餐具', '环保购物袋', '品牌帽子',
      '定制T恤', '保鲜盒套装', '咖啡杯', '餐垫套装',
      '调料瓶套装', '厨房工具', '隔热手套', '切菜板',
      '保温饭盒', '水杯套装', '餐具收纳', '厨房围裙',
      
      // 实物商品类 (21-60)
      '蓝牙耳机', '充电宝', '数据线', '手机支架',
      '桌面音响', '无线充电器', '车载充电器', '移动硬盘',
      '鼠标垫', '键盘', '办公笔记本', '文具套装',
      '护肤套装', '洗护用品', '香薰蜡烛', '精油',
      '运动毛巾', '瑜伽垫', '运动水杯', '健身手套',
      '背包', '钱包', '皮带', '围巾',
      '太阳镜', '手表', '项链', '耳环',
      '茶叶礼盒', '咖啡豆', '巧克力', '坚果礼盒',
      '红酒', '白酒', '啤酒', '果汁',
      '小家电', '炖煮锅', '榨汁机', '咖啡机',
      
      // 虚拟物品类 (61-100)
      '会员月卡', '会员季卡', '会员年卡', 'VIP特权',
      '免费停车券', '洗车券', '按摩券', '美容券',
      '电影票', '演唱会票', '话剧票', '体验券',
      '健身房月卡', '游泳馆次卡', '瑜伽课程', '舞蹈课程',
      '在线课程', '知识付费', '电子书', '音乐VIP',
      '视频VIP', '游戏充值', '话费充值', '流量包',
      '外卖红包', '打车券', '快递券', '购物券',
      '生日蛋糕券', '下午茶券', '火锅券', '自助餐券',
      'KTV券', '桌游券', '密室逃脱', '剧本杀',
      '旅游券', '酒店券', '民宿券', '景点票',
      '摄影服务', '设计服务', '维修服务', '清洁服务'
    ]

    const categories = ['优惠券', '实物商品', '虚拟物品']
    
    // 生成100个商品
    this.data.mockProducts = Array.from({ length: 100 }, (_, index) => {
      const name = productNames[index] || `商品${index + 1}`
      let category
      
      if (index < 20) {
        category = '优惠券'
      } else if (index < 60) {
        category = '实物商品'
      } else {
        category = '虚拟物品'
      }

      return {
        id: index + 1,
        name: name,
        image: `https://via.placeholder.com/200x200/4ECDC4/ffffff?text=${encodeURIComponent(name)}`,
        exchange_points: 300 + Math.floor(index / 10) * 200 + (index % 10) * 50,
        stock: Math.floor(Math.random() * 50) + 1,
        description: `${name}的详细描述，优质材料制作，${category === '优惠券' ? '限时优惠' : category === '实物商品' ? '限量供应' : '虚拟兑换'}。`,
        is_hot: index < 5 || (index % 15 === 0), // 前5个商品和每15个商品标记为热门
        rating: (3.5 + Math.random() * 1.5).toFixed(1), // 3.5-5.0的评分
        category: category,
        created_time: new Date(Date.now() - index * 60 * 60 * 1000).toISOString()
      }
    })

    // 设置总商品数
    this.setData({
      totalProducts: this.data.mockProducts.length,
      totalPages: Math.ceil(this.data.mockProducts.length / this.data.pageSize)
    })
  },

  /**
   * 加载商品数据
   * TODO: 后端对接 - 商品列表接口
   * 
   * 对接说明：
   * 接口：GET /api/exchange/products?page=1&page_size=20&category=all&sort=points
   * 认证：需要Bearer Token
   * 返回：商品列表，支持分页和筛选
   */
  loadProducts() {
    this.setData({ loading: true })

    let productsPromise
    
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟商品数据')
      
      // 直接使用已生成的模拟数据
      productsPromise = Promise.resolve({
        code: 0,
        data: {
          products: this.data.mockProducts,
          total: this.data.mockProducts.length,
          page: 1,
          pageSize: this.data.pageSize,
          totalPages: Math.ceil(this.data.mockProducts.length / this.data.pageSize)
        }
      })
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求商品列表接口...')
      productsPromise = exchangeAPI.getProducts()
    }

    return productsPromise.then((productsData) => {
      // 检查数据有效性
      if (productsData && productsData.data && productsData.data.products) {
        this.setData({
          products: productsData.data.products,
          totalCount: productsData.data.total || productsData.data.products.length,
          loading: false
        })
        
        // 应用筛选和分页
        this.filterProducts()
        
        console.log('✅ 商品列表加载成功，共', productsData.data.products.length, '个商品')
      } else {
        console.warn('⚠️ 商品数据格式异常，使用默认数据')
        this.setDefaultProducts()
      }
    }).catch((error) => {
      console.error('❌ 加载商品失败:', error)
      this.setDefaultProducts()
      
      wx.showToast({
        title: '商品加载失败',
        icon: 'none'
      })
    })
  },

  /**
   * 设置默认商品数据
   */
  setDefaultProducts() {
    // 如果还没有模拟数据，则生成
    if (!this.data.mockProducts || this.data.mockProducts.length === 0) {
      this.generateMockProducts()
    }
    
    this.setData({
      products: this.data.mockProducts,
      totalCount: this.data.mockProducts.length,
      loading: false
    })
    
    // 应用筛选和分页
    this.filterProducts()
  },

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

    let exchangePromise
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟兑换
      exchangePromise = new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            code: 0,
            data: {
              order_id: 'EX' + Date.now(),
              product_id: product.id,
              remaining_points: this.data.totalPoints - product.exchange_points,
              status: 'success'
            }
          })
        }, 1500)
      })
    } else {
      // 生产环境调用真实接口
      exchangePromise = exchangeAPI.redeem(product.id, 1)
    }

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
      if (app.globalData.mockUser) {
        app.globalData.mockUser.total_points = newPoints
      }
      
      // 更新商品库存（模拟）
      if (app.globalData.isDev && !app.globalData.needAuth) {
        this.updateProductStock(product.id, product.stock - 1)
      }
      
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

      let exchangePromise
      
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟兑换过程
        console.log('🔧 模拟商品兑换流程')
        exchangePromise = new Promise(resolve => setTimeout(resolve, 1500)).then(() => ({
          code: 0,
          data: {
            order_id: 'ORDER_' + Date.now(),
            product_name: selectedProduct.name,
            quantity: exchangeQuantity,
            points_cost: totalCost,
            remaining_points: this.data.totalPoints - totalCost,
            delivery_info: {
              status: 'processing',
              estimated_time: '3-5个工作日',
              tracking_number: null
            }
          }
        }))
      } else {
        exchangePromise = exchangeAPI.redeem(selectedProduct.id, exchangeQuantity)
      }

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
        if (app.globalData.mockUser) {
          app.globalData.mockUser.total_points = newPoints
        }
        
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
    // 使用正确的数据源：如果是开发环境用mockProducts，否则用products
    let sourceProducts = []
    if (app.globalData.isDev && !app.globalData.needAuth) {
      sourceProducts = [...this.data.mockProducts]
    } else {
      sourceProducts = [...this.data.products]
    }
    
    // 如果没有商品数据，直接返回
    if (!sourceProducts || sourceProducts.length === 0) {
      this.setData({
        filteredProducts: [],
        totalProducts: 0,
        totalPages: 1
      })
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
}) 