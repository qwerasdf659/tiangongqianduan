// pages/merchant/merchant.js - 商家管理页面逻辑
const app = getApp()
const { merchantAPI, mockRequest } = require('../../utils/api')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    isMerchant: false,
    
    // 选项卡管理
    currentTab: 'review',
    
    // 审核统计
    statistics: {
      pendingCount: 0,
      todayApproved: 0,
      todayRejected: 0,
      totalProcessed: 0
    },
    
    // 待审核列表
    pendingList: [],
    
    // 商品管理相关
    productStats: {
      activeCount: 0,
      offlineCount: 0,
      lowStockCount: 0,
      totalCount: 0
    },
    productList: [],
    showProductModal: false,
    showStockModal: false,
    editingProduct: null,
    currentProduct: null,
    productForm: {
      name: '',
      description: '',
      exchange_points: '',
      stock: '',
      image: ''
    },
    stockAdjustment: 0,
    productSubmitting: false,
    
    // 页面状态
    loading: true,
    refreshing: false,
    
    // 审核操作
    showReviewModal: false,
    currentReview: null,
    reviewAction: '', // 'approve' or 'reject'
    reviewPoints: '',
    reviewReason: '',
    
    // 权限申请
    showAuthModal: false,
    authRequesting: false,
    hasPermission: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('商家管理页面加载')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {

  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('商家管理页面显示')
    this.refreshData()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('商家管理页面隐藏')
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {

  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    console.log('下拉刷新')
    this.refreshData()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '商家管理后台，高效审核',
      path: '/pages/merchant/merchant'
    }
  },

  /**
   * 初始化页面
   */
  async initPage() {
    // 初始化用户信息
    this.setData({
      userInfo: app.globalData.userInfo || app.globalData.mockUser,
      isMerchant: app.globalData.userInfo?.is_merchant || app.globalData.mockUser.is_merchant
    })

    // 检查商家权限
    if (!this.data.isMerchant) {
      this.setData({ loading: false })
      return
    }

    // 加载数据
    await this.loadData()
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    if (!this.data.isMerchant) return
    
    this.setData({ refreshing: true })
    await this.loadData()
    this.setData({ refreshing: false })
    wx.stopPullDownRefresh()
  },

  /**
   * 加载数据
   */
  async loadData() {
    this.setData({ loading: true })
    
    await Promise.all([
      this.loadStatistics(),
      this.loadPendingList()
    ])
    
    this.setData({ loading: false })
  },

  /**
   * 加载审核统计
   * TODO: 后端对接 - 商家统计接口
   * 
   * 对接说明：
   * 接口：GET /api/merchant/statistics
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：审核统计数据，包括待审核数量、今日处理数量等
   */
  async loadStatistics() {
    try {
      let statisticsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟数据
        console.log('🔧 使用模拟商家统计数据')
        statisticsData = {
          code: 0,
          data: {
            pending_count: 8,
            today_approved: 15,
            today_rejected: 3,
            total_processed: 256,
            this_week_processed: 89,
            average_processing_time: 5.2 // 平均处理时间（分钟）
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求商家统计接口...')
        statisticsData = await merchantAPI.getStatistics()
      }

      this.setData({
        statistics: {
          pendingCount: statisticsData.data.pending_count,
          todayApproved: statisticsData.data.today_approved,
          todayRejected: statisticsData.data.today_rejected,
          totalProcessed: statisticsData.data.total_processed,
          thisWeekProcessed: statisticsData.data.this_week_processed || 0,
          averageProcessingTime: statisticsData.data.average_processing_time || 0
        }
      })

      console.log('✅ 商家统计数据加载成功，待审核:', statisticsData.data.pending_count)

    } catch (error) {
      console.error('❌ 获取审核统计失败:', error)
      
      // 使用默认数据，避免页面异常
      this.setData({
        statistics: {
          pendingCount: 0,
          todayApproved: 0,
          todayRejected: 0,
          totalProcessed: 0,
          thisWeekProcessed: 0,
          averageProcessingTime: 0
        }
      })
    }
  },

  /**
   * 加载待审核列表
   * TODO: 后端对接 - 待审核列表接口
   * 
   * 对接说明：
   * 接口：GET /api/merchant/pending-reviews?page=1&page_size=20
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：待审核的小票上传记录列表，支持分页
   */
  async loadPendingList() {
    try {
      let listData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟数据
        console.log('🔧 生成模拟待审核列表数据')
        listData = {
          code: 0,
          data: {
            list: this.generateMockPendingList(),
            total: 8,
            page: 1,
            page_size: 20
          }
        }
        await new Promise(resolve => setTimeout(resolve, 200))
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求待审核列表接口...')
        const res = await merchantAPI.getPendingReviews(1, 20)
        listData = res
      }

      this.setData({
        pendingList: listData.data.list,
        totalPending: listData.data.total
      })

      console.log('✅ 待审核列表加载成功，共', listData.data.list.length, '条记录')

    } catch (error) {
      console.error('❌ 获取待审核列表失败:', error)
      this.setData({ 
        pendingList: [],
        totalPending: 0
      })
    }
  },

  /**
   * 生成模拟待审核列表
   */
  generateMockPendingList() {
    const users = [
      '138****1001', '139****2002', '158****3003', '188****4004',
      '137****5005', '159****6006', '177****7007', '185****8008'
    ]

    return users.map((phone, index) => ({
      id: index + 1,
      user_id: 1000 + index + 1,
      user_phone: phone,
      image_url: `https://via.placeholder.com/300x400/f44336/ffffff?text=小票${index + 1}`,
      amount: (50 + Math.random() * 200).toFixed(2),
      expected_points: Math.floor((50 + Math.random() * 200) * 10),
      upload_time: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toLocaleString(),
      status: 'pending'
    }))
  },

  /**
   * 申请商家权限
   */
  onRequestAuth() {
    console.log('点击申请商家权限')
    this.setData({ showAuthModal: true })
  },

  /**
   * 确认申请商家权限
   */
  async onConfirmAuth() {
    // 防止重复提交
    if (this.data.authRequesting) return
    this.setData({ authRequesting: true })

    try {
      console.log('🔧 开始申请商家权限')
      wx.showLoading({ title: '申请中...' })
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // 申请成功，更新状态
      this.setData({
        isMerchant: true,
        showAuthModal: false,
        hasPermission: true // 添加权限状态
      })
      
      // 更新全局数据
      if (app.globalData.mockUser) {
        app.globalData.mockUser.is_merchant = true
      }
      if (app.globalData.userInfo) {
        app.globalData.userInfo.is_merchant = true
      }
      
      wx.hideLoading()
      wx.showToast({
        title: '商家权限申请成功',
        icon: 'success'
      })
      
      console.log('✅ 商家权限申请成功')
      
      // 加载商家数据
      await this.loadData()

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 申请商家权限失败:', error)
      
      wx.showToast({
        title: '申请失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({ authRequesting: false })
    }
  },

  /**
   * 取消申请
   */
  onCancelAuth() {
    this.setData({ showAuthModal: false })
  },

  /**
   * 预览小票图片
   */
  onPreviewImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  /**
   * 开始审核
   */
  onStartReview(e) {
    const item = e.currentTarget.dataset.item
    const action = e.currentTarget.dataset.action
    
    this.setData({
      showReviewModal: true,
      currentReview: item,
      reviewAction: action,
      reviewPoints: action === 'approve' ? String(item.expected_points) : '',
      reviewReason: ''
    })
  },

  /**
   * 积分输入
   */
  onPointsInput(e) {
    this.setData({
      reviewPoints: e.detail.value
    })
  },

  /**
   * 理由输入
   */
  onReasonInput(e) {
    this.setData({
      reviewReason: e.detail.value
    })
  },

  /**
   * 确认审核
   * TODO: 后端对接 - 审核接口
   * 
   * 对接说明：
   * 接口：POST /api/merchant/review
   * 请求体：{ review_id: 1, action: "approve", points: 500, reason: "审核理由" }
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：审核结果
   */
  async onConfirmReview() {
    const { currentReview, reviewAction, reviewPoints, reviewReason } = this.data

    // 验证输入
    if (reviewAction === 'approve' && (!reviewPoints || parseInt(reviewPoints) <= 0)) {
      wx.showToast({
        title: '请输入正确的积分数量',
        icon: 'none'
      })
      return
    }

    if (reviewAction === 'reject' && !reviewReason.trim()) {
      wx.showToast({
        title: '请输入拒绝理由',
        icon: 'none'
      })
      return
    }

    wx.showLoading({
      title: '处理中...',
      mask: true
    })

    try {
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟审核
        console.log('🔧 模拟审核操作，ID:', currentReview.id, '动作:', reviewAction)
        await new Promise(resolve => setTimeout(resolve, 1000))
        console.log('✅ 模拟审核完成')
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求审核接口，ID:', currentReview.id, '动作:', reviewAction)
        await merchantAPI.review(
          currentReview.id,
          reviewAction,
          parseInt(reviewPoints) || 0,
          reviewReason
        )
        console.log('✅ 审核接口调用成功')
      }

      wx.hideLoading()

      // 更新本地列表
      const pendingList = this.data.pendingList.filter(item => item.id !== currentReview.id)
      this.setData({
        pendingList,
        showReviewModal: false,
        totalPending: this.data.totalPending - 1
      })

      // 更新统计数据
      const statistics = { ...this.data.statistics }
      statistics.pendingCount = Math.max(0, statistics.pendingCount - 1)
      if (reviewAction === 'approve') {
        statistics.todayApproved++
      } else {
        statistics.todayRejected++
      }
      statistics.totalProcessed++
      this.setData({ statistics })

      wx.showToast({
        title: reviewAction === 'approve' ? '审核通过' : '已拒绝',
        icon: 'success'
      })

      console.log('🎉 审核操作完成，结果:', reviewAction)

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 审核失败:', error)
      
      let errorMsg = '审核失败'
      switch (error.code) {
        case 1001:
          errorMsg = '审核记录不存在'
          break
        case 1002:
          errorMsg = '该记录已被处理'
          break
        case 1003:
          errorMsg = '积分数量不合法'
          break
        default:
          errorMsg = error.msg || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      })
    }
  },

  /**
   * 取消审核
   */
  onCancelReview() {
    this.setData({
      showReviewModal: false,
      currentReview: null,
      reviewAction: '',
      reviewPoints: '',
      reviewReason: ''
    })
  },

  /**
   * 联系用户
   */
  onContactUser(e) {
    const phone = e.currentTarget.dataset.phone
    wx.showModal({
      title: '联系用户',
      content: `用户手机号：${phone}\n\n您可以直接拨打电话联系用户`,
      confirmText: '拨打电话',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: phone,
            fail: () => {
              wx.showToast({
                title: '拨号失败',
                icon: 'none'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 批量操作
   */
  onBatchOperation() {
    wx.showActionSheet({
      itemList: ['批量通过', '批量拒绝', '导出数据'],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.onBatchApprove()
            break
          case 1:
            this.onBatchReject()
            break
          case 2:
            this.onExportData()
            break
        }
      }
    })
  },

  /**
   * 批量通过
   * TODO: 后端对接 - 批量审核接口
   * 
   * 对接说明：
   * 接口：POST /api/merchant/batch-review
   * 请求体：{ review_ids: [1,2,3], action: "approve", reason: "批量通过" }
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：批量处理结果
   */
  async onBatchApprove() {
    const selectedItems = this.data.pendingList.filter(item => item.selected)
    
    if (selectedItems.length === 0) {
      wx.showToast({
        title: '请选择要批量通过的记录',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '批量通过',
      content: `确定要批量通过选中的 ${selectedItems.length} 条记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          await this.performBatchAction(selectedItems, 'approve', '批量通过审核')
        }
      }
    })
  },

  /**
   * 批量拒绝
   * TODO: 后端对接 - 批量审核接口
   */
  async onBatchReject() {
    const selectedItems = this.data.pendingList.filter(item => item.selected)
    
    if (selectedItems.length === 0) {
      wx.showToast({
        title: '请选择要批量拒绝的记录',
        icon: 'none'
      })
      return
    }

    wx.showModal({
      title: '批量拒绝',
      content: `确定要批量拒绝选中的 ${selectedItems.length} 条记录吗？`,
      success: async (res) => {
        if (res.confirm) {
          await this.performBatchAction(selectedItems, 'reject', '批量拒绝，请重新上传')
        }
      }
    })
  },

  /**
   * 执行批量操作
   * @param {Array} selectedItems 选中的项目
   * @param {String} action 操作类型
   * @param {String} reason 操作理由
   */
  async performBatchAction(selectedItems, action, reason) {
    const reviewIds = selectedItems.map(item => item.id)
    
    wx.showLoading({
      title: action === 'approve' ? '批量通过中...' : '批量拒绝中...',
      mask: true
    })

    try {
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟批量操作
        console.log('🔧 模拟批量操作，IDs:', reviewIds, '动作:', action)
        await new Promise(resolve => setTimeout(resolve, 2000))
        console.log('✅ 模拟批量操作完成')
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求批量审核接口，IDs:', reviewIds, '动作:', action)
        const result = await merchantAPI.batchReview(reviewIds, action, reason)
        console.log('✅ 批量审核接口调用成功，成功数量:', result.data.success_count)
      }

      wx.hideLoading()

      // 更新本地列表，移除已处理的项目
      const newPendingList = this.data.pendingList.filter(item => !reviewIds.includes(item.id))
      this.setData({
        pendingList: newPendingList,
        totalPending: this.data.totalPending - selectedItems.length
      })

      // 更新统计数据
      const statistics = { ...this.data.statistics }
      statistics.pendingCount = Math.max(0, statistics.pendingCount - selectedItems.length)
      if (action === 'approve') {
        statistics.todayApproved += selectedItems.length
      } else {
        statistics.todayRejected += selectedItems.length
      }
      statistics.totalProcessed += selectedItems.length
      this.setData({ statistics })

      wx.showToast({
        title: `批量${action === 'approve' ? '通过' : '拒绝'}成功`,
        icon: 'success'
      })

      console.log('🎉 批量操作完成，处理数量:', selectedItems.length)

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 批量操作失败:', error)
      
      let errorMsg = '批量操作失败'
      switch (error.code) {
        case 1001:
          errorMsg = '部分记录不存在或已被处理'
          break
        case 1002:
          errorMsg = '批量操作数量超过限制'
          break
        default:
          errorMsg = error.msg || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      })
    }
  },

  /**
   * 数据导出功能
   * TODO: 后端对接 - 数据导出接口
   * 
   * 对接说明：
   * 接口：GET /api/merchant/export-data?start_date=2024-01-01&end_date=2024-01-31
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：Excel文件下载链接或直接返回文件流
   */
  async onExportData() {
    try {
      wx.showLoading({
        title: '生成导出文件...',
        mask: true
      })

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟导出
        console.log('🔧 模拟数据导出功能')
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        wx.hideLoading()
        wx.showModal({
          title: '导出成功',
          content: '开发环境模拟导出，实际部署时会生成Excel文件',
          showCancel: false
        })
      } else {
        // 生产环境实现数据导出
        console.log('📡 请求数据导出接口...')
        
        // TODO: 实现日期选择和数据导出
        const startDate = '2024-01-01'  // 实际应用中需要用户选择
        const endDate = '2024-01-31'
        
        // 这里需要根据实际后端接口实现
        // const exportUrl = `${app.globalData.baseUrl}/api/merchant/export-data?start_date=${startDate}&end_date=${endDate}`
        
        wx.hideLoading()
        wx.showModal({
          title: '功能开发中',
          content: '数据导出功能正在开发中，敬请期待',
          showCancel: false
        })
      }

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 数据导出失败:', error)
      wx.showToast({
        title: error.msg || '导出失败',
        icon: 'none'
      })
    }
  },

  /**
   * 选项卡切换
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    
    if (tab === 'product') {
      this.loadProductData()
    }
  },

  /**
   * 加载商品数据
   */
  async loadProductData() {
    try {
      await Promise.all([
        this.loadProductStats(),
        this.loadProductList()
      ])
    } catch (error) {
      console.error('加载商品数据失败:', error)
    }
  },

  /**
   * 加载商品统计
   */
  async loadProductStats() {
    // 模拟商品统计数据
    const mockStats = {
      activeCount: 12,
      offlineCount: 3,
      lowStockCount: 5,
      totalCount: 15
    }
    
    this.setData({ productStats: mockStats })
  },

  /**
   * 加载商品列表
   */
  async loadProductList() {
    // 模拟商品列表数据
    const mockProducts = [
      {
        id: 1,
        name: '八八折券',
        description: '全场商品八八折优惠',
        exchange_points: 800,
        stock: 50,
        status: 'active',
        image: 'https://via.placeholder.com/200x200/FF6B35/ffffff?text=🎫'
      },
      {
        id: 2,
        name: '九九折券',
        description: '全场商品九九折优惠',
        exchange_points: 500,
        stock: 100,
        status: 'active',
        image: 'https://via.placeholder.com/200x200/667eea/ffffff?text=🎫'
      }
    ]
    
    this.setData({ productList: mockProducts })
  },

  /**
   * 新增商品
   */
  onAddProduct() {
    this.setData({
      showProductModal: true,
      editingProduct: null,
      productForm: {
        name: '',
        description: '',
        exchange_points: '',
        stock: '',
        image: ''
      }
    })
  },

  /**
   * 编辑商品
   */
  onEditProduct(e) {
    const product = e.currentTarget.dataset.product
    this.setData({
      showProductModal: true,
      editingProduct: product,
      productForm: {
        name: product.name,
        description: product.description,
        exchange_points: product.exchange_points.toString(),
        stock: product.stock.toString(),
        image: product.image
      }
    })
  },

  /**
   * 库存管理
   */
  onManageStock(e) {
    const product = e.currentTarget.dataset.product
    this.setData({
      showStockModal: true,
      currentProduct: product,
      stockAdjustment: 0
    })
  },

  /**
   * 切换商品状态
   */
  async onToggleStatus(e) {
    const product = e.currentTarget.dataset.product
    const newStatus = product.status === 'active' ? 'offline' : 'active'
    
    // 更新商品状态（这里应该调用后端接口）
    const productList = this.data.productList.map(item => {
      if (item.id === product.id) {
        return { ...item, status: newStatus }
      }
      return item
    })
    
    this.setData({ productList })
    
    wx.showToast({
      title: newStatus === 'active' ? '商品已上架' : '商品已下架',
      icon: 'success'
    })
  },

  /**
   * 删除商品
   */
  onDeleteProduct(e) {
    const product = e.currentTarget.dataset.product
    
    wx.showModal({
      title: '删除商品',
      content: `确定要删除商品"${product.name}"吗？`,
      success: (res) => {
        if (res.confirm) {
          const productList = this.data.productList.filter(item => item.id !== product.id)
          this.setData({ productList })
          
          wx.showToast({
            title: '删除成功',
            icon: 'success'
          })
        }
      }
    })
  },

  /**
   * 商品表单输入处理
   */
  onProductNameInput(e) {
    this.setData({
      'productForm.name': e.detail.value
    })
  },

  onProductDescInput(e) {
    this.setData({
      'productForm.description': e.detail.value
    })
  },

  onProductPointsInput(e) {
    this.setData({
      'productForm.exchange_points': e.detail.value
    })
  },

  onProductStockInput(e) {
    this.setData({
      'productForm.stock': e.detail.value
    })
  },

  /**
   * 上传商品图片
   */
  onUploadProductImage() {
    wx.chooseImage({
      count: 1,
      success: (res) => {
        this.setData({
          'productForm.image': res.tempFilePaths[0]
        })
      }
    })
  },

  /**
   * 删除商品图片
   */
  onDeleteProductImage() {
    this.setData({
      'productForm.image': ''
    })
  },

  /**
   * 确认保存商品
   */
  async onConfirmProduct() {
    const form = this.data.productForm
    
    if (!form.name.trim()) {
      wx.showToast({
        title: '请输入商品名称',
        icon: 'none'
      })
      return
    }
    
    this.setData({ productSubmitting: true })
    
    try {
      // 这里应该调用后端接口保存商品
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      if (this.data.editingProduct) {
        // 编辑模式
        const productList = this.data.productList.map(item => {
          if (item.id === this.data.editingProduct.id) {
            return {
              ...item,
              name: form.name,
              description: form.description,
              exchange_points: parseInt(form.exchange_points),
              stock: parseInt(form.stock),
              image: form.image
            }
          }
          return item
        })
        this.setData({ productList })
      } else {
        // 新增模式
        const newProduct = {
          id: Date.now(),
          name: form.name,
          description: form.description,
          exchange_points: parseInt(form.exchange_points),
          stock: parseInt(form.stock),
          status: 'active',
          image: form.image || 'https://via.placeholder.com/200x200/FF6B35/ffffff?text=📦'
        }
        this.setData({
          productList: [...this.data.productList, newProduct]
        })
      }
      
      this.setData({
        showProductModal: false,
        productSubmitting: false
      })
      
      wx.showToast({
        title: '保存成功',
        icon: 'success'
      })
      
    } catch (error) {
      this.setData({ productSubmitting: false })
      wx.showToast({
        title: '保存失败',
        icon: 'none'
      })
    }
  },

  /**
   * 取消商品操作
   */
  onCancelProduct() {
    this.setData({ showProductModal: false })
  },

  /**
   * 库存调整
   */
  onQuantityChange(e) {
    const change = parseInt(e.currentTarget.dataset.change)
    this.setData({
      stockAdjustment: this.data.stockAdjustment + change
    })
  },

  onStockAdjustmentInput(e) {
    this.setData({
      stockAdjustment: parseInt(e.detail.value) || 0
    })
  },

  /**
   * 确认库存调整
   */
  onConfirmStock() {
    const { currentProduct, stockAdjustment } = this.data
    const newStock = currentProduct.stock + stockAdjustment
    
    if (newStock < 0) {
      wx.showToast({
        title: '库存不能为负数',
        icon: 'none'
      })
      return
    }
    
    // 更新商品库存
    const productList = this.data.productList.map(item => {
      if (item.id === currentProduct.id) {
        return { ...item, stock: newStock }
      }
      return item
    })
    
    this.setData({
      productList,
      showStockModal: false
    })
    
    wx.showToast({
      title: '库存调整成功',
      icon: 'success'
    })
  },

  /**
   * 取消库存操作
   */
  onCancelStock() {
    this.setData({ showStockModal: false })
  },

  /**
   * 刷新商品数据
   */
  refreshProducts() {
    this.loadProductData()
  },

  /**
   * 批量编辑
   */
  onBatchEdit() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  },

  /**
   * 解锁权限
   */
  onUnlockPermission() {
    wx.showModal({
      title: '身份验证',
      content: '为保护您的账户安全，请输入手机验证码进行身份验证',
      confirmText: '验证',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 模拟验证过程
          wx.showLoading({ title: '验证中...' })
          setTimeout(() => {
            wx.hideLoading()
            this.setData({ hasPermission: true })
            wx.showToast({
              title: '验证成功，功能已解锁',
              icon: 'success'
            })
          }, 2000)
        }
      }
    })
  },

  /**
   * 功能锁定提示
   */
  onLockedTap() {
    wx.showToast({
      title: '功能已锁定，请先完成身份验证',
      icon: 'none'
    })
  },

  /**
   * 审核通过
   */
  onApprove(e) {
    const item = e.currentTarget.dataset.item
    this.onStartReview({ 
      currentTarget: { 
        dataset: { 
          item: item, 
          action: 'approve' 
        } 
      } 
    })
  },

  /**
   * 审核拒绝
   */
  onReject(e) {
    const item = e.currentTarget.dataset.item
    this.onStartReview({ 
      currentTarget: { 
        dataset: { 
          item: item, 
          action: 'reject' 
        } 
      } 
    })
  }
})