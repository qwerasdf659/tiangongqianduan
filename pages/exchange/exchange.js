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
    mockProducts: []
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
   */
  async refreshUserInfo() {
    if (app.globalData.isDev) {
      // 开发环境使用模拟数据
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return
    }

    // TODO: 对接用户信息接口
    try {
      const res = await userAPI.getUserInfo()
      this.setData({
        userInfo: res.data,
        totalPoints: res.data.total_points
      })
      app.globalData.userInfo = res.data
    } catch (error) {
      console.error('获取用户信息失败:', error)
    }
  },

  /**
   * 加载商品列表
   */
  async loadProducts() {
    this.setData({ loading: true })

    try {
      let productsData

      if (app.globalData.isDev) {
        // 开发环境使用模拟数据
        productsData = {
          code: 0,
          msg: 'success',
          data: {
            products: this.data.mockProducts
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 800))
      } else {
        // TODO: 对接真实商品列表接口
        productsData = await exchangeAPI.getProducts()
      }

      // 按积分值排序（从低到高）
      const sortedProducts = productsData.data.products.sort((a, b) => 
        a.exchange_points - b.exchange_points
      )

      this.setData({
        products: sortedProducts,
        loading: false
      })

    } catch (error) {
      console.error('加载商品列表失败:', error)
      this.setData({ 
        loading: false,
        products: this.data.mockProducts
      })
      wx.showToast({
        title: '加载失败，使用模拟数据',
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
  }
}) 