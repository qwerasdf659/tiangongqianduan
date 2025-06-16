// pages/exchange/exchange.js - 商品兑换页面逻辑
const app = getApp()
const { exchangeAPI, mockRequest } = require('../../utils/api')
const { wsManager } = require('../../utils/ws')
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
    console.log('商品兑换页面加载')
    this.initPage()
  },

  onShow() {
    console.log('商品兑换页面显示')
    this.refreshUserInfo()
    this.connectWebSocket()
  },

  onHide() {
    console.log('商品兑换页面隐藏')
  },

  onUnload() {
    console.log('商品兑换页面卸载')
    this.disconnectWebSocket()
  },

  onPullDownRefresh() {
    console.log('下拉刷新')
    this.refreshPage()
  },

  /**
   * 初始化页面
   */
  async initPage() {
    // 初始化用户信息
    this.setData({
      userInfo: app.globalData.userInfo || app.globalData.mockUser,
      totalPoints: app.globalData.userInfo?.total_points || app.globalData.mockUser.total_points
    })

    // 生成模拟商品数据
    this.generateMockProducts()

    // 加载商品列表
    await this.loadProducts()
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
   * 加载商品列表
   * TODO: 后端对接 - 商品列表接口
   * 
   * 对接说明：
   * 接口：GET /api/exchange/products
   * 认证：需要Bearer Token
   * 返回：可兑换商品列表，包括分类、库存、价格等信息
   */
  async loadProducts() {
    this.setData({ loading: true })
    
    try {
      let productsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境使用模拟数据
        console.log('🔧 使用模拟商品数据')
        productsData = await mockRequest('/api/exchange/products')
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求商品列表接口...')
        productsData = await exchangeAPI.getProducts()
      }

      // 处理分类数据
      const categories = productsData.data.categories || ['全部']
      const products = productsData.data.products || []

      this.setData({
        categories: ['全部'].concat(categories),
        products: products,
        allProducts: products,
        loading: false
      })

      // 初始化筛选结果
      this.filterProducts()

      console.log('✅ 商品列表加载成功，共', products.length, '件商品')

    } catch (error) {
      console.error('❌ 获取商品列表失败:', error)
      
      // 使用默认商品数据，避免页面空白
      const defaultProducts = [
        {
          id: 1,
          name: '10元优惠券',
          description: '满50元可用',
          category: '优惠券',
          points_cost: 1000,
          exchange_points: 1000,
          stock: 100,
          image: 'https://via.placeholder.com/200x200/FF6B35/ffffff?text=10元券',
          status: 'available',
          is_hot: true,
          rating: '4.8'
        },
        {
          id: 2,
          name: '20元优惠券',
          description: '满100元可用',
          category: '优惠券',
          points_cost: 1800,
          exchange_points: 1800,
          stock: 50,
          image: 'https://via.placeholder.com/200x200/4ECDC4/ffffff?text=20元券',
          status: 'available',
          is_hot: true,
          rating: '4.6'
        },
        {
          id: 3,
          name: '小海鲜拼盘',
          description: '新鲜海鲜拼盘',
          category: '实物商品',
          points_cost: 2500,
          exchange_points: 2500,
          stock: 20,
          image: 'https://via.placeholder.com/200x200/FFD93D/000000?text=海鲜',
          status: 'available',
          is_hot: false,
          rating: '4.9'
        },
        {
          id: 4,
          name: '会员月卡',
          description: '30天会员特权',
          category: '虚拟物品',
          points_cost: 3000,
          exchange_points: 3000,
          stock: 999,
          image: 'https://via.placeholder.com/200x200/9775FA/ffffff?text=会员卡',
          status: 'available',
          is_hot: false,
          rating: '4.7'
        }
      ]
      
      this.setData({
        categories: ['全部', '优惠券', '实物商品', '虚拟物品'],
        products: defaultProducts,
        allProducts: defaultProducts,
        loading: false
      })
      
      // 初始化筛选结果
      this.filterProducts()
      
      wx.showToast({
        title: '使用默认商品数据',
        icon: 'none'
      })
    }
  },

  /**
   * 连接WebSocket监听库存变化
   */
  connectWebSocket() {
    wsManager.connect()
    
    // 监听库存更新
    wsManager.on('stock_update', (data) => {
      console.log('收到库存更新:', data)
      this.updateProductStock(data.data.product_id, data.data.stock)
    })
  },

  /**
   * 断开WebSocket连接
   */
  disconnectWebSocket() {
    wsManager.off('stock_update')
  },

  /**
   * 更新商品库存
   */
  updateProductStock(productId, newStock) {
    const products = this.data.products
    const productIndex = products.findIndex(p => p.id === productId)
    
    if (productIndex !== -1) {
      products[productIndex].stock = newStock
      this.setData({ products })
      
      // 显示库存更新提示
      wx.showToast({
        title: `${products[productIndex].name}库存已更新`,
        icon: 'none',
        duration: 1500
      })
    }
  },

  /**
   * 刷新页面
   */
  async refreshPage() {
    this.setData({ refreshing: true })
    await Promise.all([
      this.refreshUserInfo(),
      this.loadProducts()
    ])
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
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
  onConfirmExchange: debounce(async function() {
    const product = this.data.selectedProduct
    
    if (!product) return

    this.setData({ showConfirm: false })

    wx.showLoading({
      title: '兑换中...',
      mask: true
    })

    try {
      let exchangeResult

      if (app.globalData.isDev) {
        // 开发环境模拟兑换
        exchangeResult = {
          code: 0,
          msg: '兑换成功',
          data: {
            order_id: 'EX' + Date.now(),
            points_deducted: product.exchange_points,
            remaining_points: this.data.totalPoints - product.exchange_points,
            remaining_stock: product.stock - 1
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        // TODO: 对接真实兑换接口
        exchangeResult = await exchangeAPI.redeem(product.id, 1)
      }

      wx.hideLoading()

      // 更新本地数据
      this.setData({
        totalPoints: exchangeResult.data.remaining_points
      })

      // 更新商品库存
      this.updateProductStock(product.id, exchangeResult.data.remaining_stock)

      // 显示兑换结果
      this.setData({
        showResult: true,
        resultData: {
          product: product,
          orderId: exchangeResult.data.order_id,
          pointsDeducted: exchangeResult.data.points_deducted,
          remainingPoints: exchangeResult.data.remaining_points
        }
      })

      // 发送兑换成功的统计事件
      wx.reportAnalytics('exchange_success', {
        product_id: product.id,
        product_name: product.name,
        points_cost: product.exchange_points
      })

    } catch (error) {
      wx.hideLoading()
      console.error('兑换失败:', error)
      wx.showToast({
        title: error.msg || '兑换失败',
        icon: 'none'
      })
    }
  }, 1000),

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
    wx.navigateTo({
      url: '/pages/records/exchange-records'
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
      path: '/pages/exchange/exchange',
      imageUrl: '/images/share-exchange.jpg'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '餐厅积分兑换 - 精美商品等你来',
      imageUrl: '/images/share-exchange.jpg'
    }
  },

  /**
   * 兑换商品
   * TODO: 后端对接 - 商品兑换接口
   * 
   * 对接说明：
   * 接口：POST /api/exchange/redeem
   * 请求体：{ product_id: 1, quantity: 1 }
   * 认证：需要Bearer Token
   * 返回：兑换结果，包括订单信息、剩余积分等
   */
  async onExchangeProduct() {
    const { selectedProduct, exchangeQuantity } = this.data
    
    if (!selectedProduct || exchangeQuantity <= 0) {
      wx.showToast({
        title: '请选择商品和数量',
        icon: 'none'
      })
      return
    }

    // 检查积分是否足够
    const totalCost = selectedProduct.points_cost * exchangeQuantity
    if (this.data.totalPoints < totalCost) {
      wx.showToast({
        title: '积分不足',
        icon: 'none'
      })
      return
    }

    // 检查库存
    if (selectedProduct.stock < exchangeQuantity) {
      wx.showToast({
        title: '库存不足',
        icon: 'none'
      })
      return
    }

    // 确认兑换
    const confirmResult = await this.showExchangeConfirm(selectedProduct, exchangeQuantity, totalCost)
    if (!confirmResult) return

    // 防止重复提交
    if (this.data.exchanging) return
    this.setData({ exchanging: true })

    try {
      let exchangeResult

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟兑换
        console.log('🔧 模拟商品兑换，商品ID:', selectedProduct.id, '数量:', exchangeQuantity)
        wx.showLoading({ title: '兑换中...' })
        
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        exchangeResult = {
          code: 0,
          msg: '兑换成功',
          data: {
            order_id: 'ORD' + Date.now(),
            product_name: selectedProduct.name,
            quantity: exchangeQuantity,
            points_cost: totalCost,
            remaining_points: this.data.totalPoints - totalCost,
            redeem_time: new Date().toLocaleString(),
            delivery_info: selectedProduct.category === '优惠券' ? 
              '兑换码：COUPON' + Math.random().toString(36).substr(2, 8).toUpperCase() :
              '请到店出示此信息领取'
          }
        }
        
        wx.hideLoading()
        
        // 更新用户积分
        const newPoints = this.data.totalPoints - totalCost
        this.setData({ totalPoints: newPoints })
        
        if (app.globalData.mockUser) {
          app.globalData.mockUser.total_points = newPoints
        }
        
        console.log('✅ 模拟兑换完成，剩余积分:', newPoints)
        
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求商品兑换接口，商品ID:', selectedProduct.id)
        
        exchangeResult = await exchangeAPI.redeem(selectedProduct.id, exchangeQuantity)
        
        // 更新用户积分
        this.setData({
          totalPoints: exchangeResult.data.remaining_points
        })
        
        // 更新全局用户信息
        if (app.globalData.userInfo) {
          app.globalData.userInfo.total_points = exchangeResult.data.remaining_points
        }
        
        console.log('✅ 商品兑换成功，订单号:', exchangeResult.data.order_id)
      }

      // 显示兑换成功结果
      this.showExchangeResult(exchangeResult.data)

      // 关闭兑换弹窗
      this.setData({
        showExchangeModal: false,
        selectedProduct: null,
        exchangeQuantity: 1
      })

      // 刷新商品列表（更新库存）
      this.loadProducts()

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 商品兑换失败:', error)
      
      let errorMsg = '兑换失败，请重试'
      
      // 根据错误码显示不同的错误信息
      switch (error.code) {
        case 1001:
          errorMsg = '商品不存在或已下架'
          break
        case 1002:
          errorMsg = '积分不足'
          break
        case 1003:
          errorMsg = '库存不足'
          break
        case 1004:
          errorMsg = '兑换数量超过限制'
          break
        case 1005:
          errorMsg = '今日兑换次数已达上限'
          break
        default:
          errorMsg = error.msg || error.message || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      })
      
    } finally {
      this.setData({ exchanging: false })
    }
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
    let filtered = [...this.data.mockProducts] // 使用全部商品作为基础数据
    
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
        filtered.sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
        break
    }
    
    // 分页处理
    const startIndex = (this.data.currentPage - 1) * this.data.pageSize
    const endIndex = startIndex + this.data.pageSize
    const paginatedProducts = filtered.slice(startIndex, endIndex)
    
    // 更新总页数
    const totalPages = Math.ceil(filtered.length / this.data.pageSize)
    
    this.setData({
      filteredProducts: paginatedProducts,
      products: filtered, // 保存全部筛选结果用于统计
      totalPages,
      totalProducts: filtered.length
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
      currentPage: 1
    })
    this.filterProducts()
  },

  /**
   * 刷新商品列表
   */
  onRefreshProducts() {
    wx.showLoading({ title: '刷新中...' })
    this.loadProducts().finally(() => {
      wx.hideLoading()
      wx.showToast({
        title: '刷新完成',
        icon: 'success'
      })
    })
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
  }
}) 