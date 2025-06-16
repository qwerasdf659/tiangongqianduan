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
    exchanging: false
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
      '品牌钥匙扣', '限定保温杯', '定制餐具套装', '定制围裙',
      '精美马克杯', '竹制餐具', '环保购物袋', '品牌帽子',
      '定制T恤', '保鲜盒套装', '咖啡杯', '餐垫套装',
      '调料瓶套装', '厨房工具', '隔热手套', '切菜板',
      '保温饭盒', '水杯套装', '餐具收纳', '厨房围裙'
    ]

    this.data.mockProducts = productNames.map((name, index) => ({
      id: index + 1,
      name: name,
      image: 'https://via.placeholder.com/200x200/4ECDC4/ffffff?text=' + encodeURIComponent(name),
      exchange_points: 800 + index * 100,
      stock: Math.floor(Math.random() * 20) + 1,
      description: `${name}的详细描述，优质材料制作，限量供应。`
    }))
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
        allProducts: products,
        filteredProducts: products
      })

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
          stock: 100,
          image: 'https://via.placeholder.com/200x200/FF6B35/ffffff?text=10元券',
          status: 'available'
        }
      ]
      
      this.setData({
        categories: ['全部', '优惠券'],
        allProducts: defaultProducts,
        filteredProducts: defaultProducts
      })
      
      wx.showToast({
        title: '商品加载失败',
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
  }
}) 