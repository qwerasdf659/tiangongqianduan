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
    
    // 审核统计
    statistics: {
      pendingCount: 0,
      todayApproved: 0,
      todayRejected: 0,
      totalProcessed: 0
    },
    
    // 待审核列表
    pendingList: [],
    
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
    authRequesting: false
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
      title: '餐厅积分系统 - 商家管理',
      path: '/pages/merchant/merchant',
      imageUrl: '/images/share-merchant.jpg'
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
   */
  async loadStatistics() {
    try {
      let statisticsData

      if (app.globalData.isDev) {
        // 开发环境模拟数据
        statisticsData = {
          code: 0,
          data: {
            pending_count: 8,
            today_approved: 15,
            today_rejected: 3,
            total_processed: 256
          }
        }
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        // TODO: 对接真实统计接口
        statisticsData = await merchantAPI.getStatistics()
      }

      this.setData({
        statistics: {
          pendingCount: statisticsData.data.pending_count,
          todayApproved: statisticsData.data.today_approved,
          todayRejected: statisticsData.data.today_rejected,
          totalProcessed: statisticsData.data.total_processed
        }
      })

    } catch (error) {
      console.error('获取审核统计失败:', error)
    }
  },

  /**
   * 加载待审核列表
   */
  async loadPendingList() {
    try {
      let listData

      if (app.globalData.isDev) {
        // 开发环境模拟数据
        listData = this.generateMockPendingList()
      } else {
        // TODO: 对接真实待审核列表接口
        const res = await merchantAPI.getPendingReviews()
        listData = res.data.list
      }

      this.setData({
        pendingList: listData
      })

    } catch (error) {
      console.error('获取待审核列表失败:', error)
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
    this.setData({ showAuthModal: true })
  },

  /**
   * 确认申请商家权限
   */
  async onConfirmAuth() {
    this.setData({ authRequesting: true })

    try {
      if (app.globalData.isDev) {
        // 开发环境模拟申请
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 模拟申请成功
        this.setData({
          isMerchant: true,
          showAuthModal: false
        })
        
        // 更新全局数据
        if (app.globalData.mockUser) {
          app.globalData.mockUser.is_merchant = true
        }
        
        wx.showToast({
          title: '商家权限申请成功',
          icon: 'success'
        })
        
        // 加载商家数据
        await this.loadData()
        
      } else {
        // TODO: 对接真实申请接口
        await merchantAPI.auth()
        
        this.setData({
          isMerchant: true,
          showAuthModal: false
        })
        
        wx.showToast({
          title: '商家权限申请成功',
          icon: 'success'
        })
      }

    } catch (error) {
      console.error('申请商家权限失败:', error)
      wx.showToast({
        title: error.msg || '申请失败',
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
      if (app.globalData.isDev) {
        // 开发环境模拟审核
        await new Promise(resolve => setTimeout(resolve, 1000))
      } else {
        // TODO: 对接真实审核接口
        await merchantAPI.review(
          currentReview.id,
          reviewAction,
          parseInt(reviewPoints) || 0,
          reviewReason
        )
      }

      wx.hideLoading()

      // 更新本地列表
      const pendingList = this.data.pendingList.filter(item => item.id !== currentReview.id)
      this.setData({
        pendingList,
        showReviewModal: false
      })

      // 更新统计数据
      const statistics = { ...this.data.statistics }
      statistics.pendingCount--
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

    } catch (error) {
      wx.hideLoading()
      console.error('审核失败:', error)
      wx.showToast({
        title: error.msg || '审核失败',
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
      content: `用户手机号：${phone}\n\n是否拨打电话？`,
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({
            phoneNumber: phone.replace(/\*/g, ''),
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
   */
  onBatchApprove() {
    wx.showModal({
      title: '批量通过',
      content: '确定要批量通过所有待审核项目吗？',
      success: (res) => {
        if (res.confirm) {
          // TODO: 实现批量通过逻辑
          wx.showToast({
            title: '批量操作功能开发中',
            icon: 'none'
          })
        }
      }
    })
  },

  /**
   * 批量拒绝
   */
  onBatchReject() {
    wx.showModal({
      title: '批量拒绝',
      content: '确定要批量拒绝所有待审核项目吗？',
      success: (res) => {
        if (res.confirm) {
          // TODO: 实现批量拒绝逻辑
          wx.showToast({
            title: '批量操作功能开发中',
            icon: 'none'
          })
        }
      }
    })
  },

  /**
   * 导出数据
   */
  onExportData() {
    // TODO: 实现数据导出功能
    wx.showToast({
      title: '数据导出功能开发中',
      icon: 'none'
    })
  }
})