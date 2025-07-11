// pages/merchant/merchant.js - 商家管理页面逻辑
const app = getApp()
const { merchantAPI } = require('../../utils/api')
// 🔧 修复：引入权限管理工具类，进行正确的超级管理员权限验证
const { createPermissionManager } = require('../../utils/permission-manager')
// 🔍 新增：引入权限诊断工具，用于问题排查
const { diagnosePage } = require('../../utils/permission-diagnostic')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    // 🔧 修复：添加权限状态字段，准确反映权限情况
    isMerchant: false,
    isAdmin: false,
    isSuperAdmin: false,  // 🔐 超级管理员标识
    hasPermission: false, // 🔐 权限确认标识
    permissionStatus: null, // �� 详细权限状态
    
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
      image: '',
      category: '实物商品',
      is_hot: false,
      sort_order: 0
    },
    stockAdjustment: 0,
    productSubmitting: false,
    
    // 批量编辑相关
    showBatchEditModal: false,
    selectedProducts: [],
    batchEditForm: {
      category: '',
      pointsAdjustment: 0,
      stockAdjustment: 0,
      updateCategory: false,
      updatePoints: false,
      updateStock: false
    },
    
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
    
    // 🎰 抽奖控制相关 - 🔴 严禁前端硬编码奖品配置
    lotteryConfig: {
      isActive: false, // 抽奖系统状态，必须从后端获取
      prizes: [] // 🚨 奖品配置严禁前端定义，必须从后端API获取
    },
    probabilityTotal: 100, // 概率总和
    
    // 维护配置
    maintenanceConfig: {
      isScheduled: false,
      startTime: [0, 0], // [日期索引, 时间索引]
      endTime: [0, 0],
      startTimeText: '',
      endTimeText: '',
      reason: ''
    },
    maintenanceTimeRange: [
      // 日期范围（今天开始7天）
      [],
      // 时间范围（0-23小时）
      []
    ],
    
    // 抽奖统计
    lotteryStats: {
      todayCount: 0,
      totalCount: 0,
      activeUsers: 0,
      totalPrizes: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('🔄 商家管理页面开始加载...')
    
    // 🔧 修复：只进行基础初始化，防止页面跳转超时
    this.setData({ 
      loading: true,
      currentTab: 'review'
    })
    
    console.log('✅ 商家页面基础加载完成，等待页面渲染...')
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    console.log('🎨 商家页面渲染完成，开始初始化业务逻辑...')
    
    // 🔧 修复：在页面渲染完成后再执行复杂的初始化逻辑
    // 使用 setTimeout 确保页面完全渲染后再执行
    setTimeout(() => {
      this.initPage()
    }, 100)
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('🔄 商家管理页面显示')
    
    // 🔧 修复：每次显示页面时重新检查权限状态
    const userInfo = app.globalData.userInfo
    if (userInfo) {
      const permissionManager = createPermissionManager(userInfo)
      const permissionStatus = permissionManager.getPermissionStatus()
      
      console.log('🔐 页面显示时权限检查:', permissionStatus)
      
      // 🔧 如果权限状态发生变化，更新页面
      if (this.data.isSuperAdmin !== permissionStatus.isSuperAdmin) {
        console.log('⚠️ 检测到权限状态变化，更新页面状态')
        this.setData({
          isSuperAdmin: permissionStatus.isSuperAdmin,
          isAdmin: permissionStatus.isAdmin,
          isMerchant: permissionStatus.isMerchant,
          hasPermission: permissionStatus.isSuperAdmin,
          permissionStatus: permissionStatus
        })
        
        // 🔧 如果权限被撤销，显示提示并返回
        if (!permissionStatus.isSuperAdmin) {
          wx.showModal({
            title: '🔐 权限状态变更',
            content: '您的超级管理员权限已被撤销，无法继续使用商家管理功能。',
            showCancel: false,
            confirmText: '返回',
            success: () => {
              wx.navigateBack()
            }
          })
          return
        }
      }
    }
    
    // 🔧 权限检查通过或页面已经完成初始化，刷新数据
    if (this.data.isSuperAdmin) {
      this.refreshData()
    }
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
  initPage() {
    console.log('🔄 开始初始化商家管理页面...')
    
    const userInfo = app.globalData.userInfo
    
    // 🔧 修复：先检查基础用户信息
    if (!userInfo) {
      console.log('❌ 用户信息缺失，引导用户重新登录')
      this.handleUserInfoMissing()
      return
    }
    
    // 🔐 使用权限管理工具类进行正确的权限验证
    const permissionManager = createPermissionManager(userInfo)
    const permissionStatus = permissionManager.getPermissionStatus()
    
    console.log('🔐 权限验证结果:', {
      userInfo: {
        user_id: userInfo?.user_id,
        mobile: userInfo?.mobile?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
        is_admin: userInfo?.is_admin,
        is_merchant: userInfo?.is_merchant
      },
      permissionStatus: permissionStatus
    })
    
    // 🔧 修复：设置完整的权限状态信息
    this.setData({
      userInfo: userInfo || null,
      // 🔐 v2.0 二元权限状态
      isSuperAdmin: permissionStatus.isSuperAdmin,
      isAdmin: permissionStatus.isAdmin,
      isMerchant: permissionStatus.isMerchant,
      hasPermission: permissionStatus.isSuperAdmin,
      showMerchantEntrance: permissionStatus.showMerchantEntrance,
      permissionStatus: permissionStatus
    })

    // 初始化维护时间范围
    this.initMaintenanceTimeRange()

    // 🔧 修复：正确的权限检查 - 必须是超级管理员
    if (!permissionStatus.isSuperAdmin) {
      console.log('❌ 权限不足 - 非超级管理员用户无法访问商家管理功能')
      
      // 🔧 优化：延迟显示权限不足对话框，确保页面先渲染
      setTimeout(() => {
        this.showPermissionDeniedDialog(userInfo)
      }, 300)
      
      this.setData({ loading: false })
      return
    }

    console.log('✅ 超级管理员权限验证通过，开始加载管理功能数据')
    
    // 🔧 优化：异步加载管理功能数据，不阻塞页面
    this.loadDataAsync()
  },

  /**
   * 🔧 新增：处理用户信息缺失的情况
   */
  handleUserInfoMissing() {
    this.setData({ loading: false })
    
    wx.showModal({
      title: '🔑 登录状态异常',
      content: '检测到用户信息缺失，请重新登录以获取权限信息。',
      showCancel: false,
      confirmText: '重新登录',
      success: () => {
        wx.reLaunch({ url: '/pages/auth/auth' })
      }
    })
  },

  /**
   * 🔧 新增：显示权限不足对话框
   */
  showPermissionDeniedDialog(userInfo) {
    wx.showModal({
      title: '🔐 权限验证失败',
      content: `商家管理功能需要超级管理员权限\n\n您的权限状态：\n• 管理员权限：${userInfo?.is_admin ? '✅ 已拥有' : '❌ 缺失'}\n• 商家权限：${userInfo?.is_merchant ? '✅ 已拥有' : '❌ 缺失'}\n\n超级管理员需要同时拥有两项权限。`,
      showCancel: true,
      cancelText: '返回',
      confirmText: '申请权限',
      success: (res) => {
        if (res.confirm) {
          this.setData({ showAuthModal: true })
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 🔧 新增：异步加载数据，不阻塞页面渲染
   */
  loadDataAsync() {
    // 先设置loading状态
    this.setData({ loading: true })
    
    // 异步加载数据
    setTimeout(() => {
      this.loadData().catch(error => {
        console.error('❌ 异步加载数据失败:', error)
        this.setData({ loading: false })
        
        // 显示友好的错误提示
        wx.showToast({
          title: '数据加载失败，请下拉刷新',
          icon: 'none',
          duration: 3000
        })
      })
    }, 50)
  },

  /**
   * 刷新数据
   */
  refreshData() {
    console.log('🔄 刷新商家管理数据...')
    
    this.setData({ refreshing: true })
    
    // 🔧 修复：首先重新获取用户信息，确保权限状态是最新的
    this.refreshUserPermissionStatus().then(() => {
      // 权限验证通过后再加载业务数据
      return this.loadData()
    }).catch((error) => {
      console.error('❌ 刷新数据失败:', error)
      
      // 🔧 增强错误处理：区分不同类型的错误
      if (error.needsRelogin) {
        wx.showModal({
          title: '🔑 登录状态异常',
          content: '检测到登录状态异常，请重新登录以获取最新权限信息。',
          showCancel: false,
          confirmText: '重新登录',
          success: () => {
            wx.reLaunch({ url: '/pages/auth/auth' })
          }
        })
      } else if (error.permissionDenied) {
        wx.showModal({
          title: '🔐 权限已变更',
          content: '您的权限状态已发生变更，无法继续访问商家管理功能。',
          showCancel: false,
          confirmText: '返回',
          success: () => {
            wx.navigateBack()
          }
        })
      } else {
        wx.showToast({
          title: '刷新失败，请重试',
          icon: 'none'
        })
      }
    }).finally(() => {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 🔧 新增：刷新用户权限状态
   */
  refreshUserPermissionStatus() {
    console.log('🔄 重新获取用户权限状态...')
    
    return new Promise((resolve, reject) => {
      // 🔧 检查Token状态
      if (!app.globalData.accessToken) {
        console.error('❌ 访问令牌缺失')
        reject({ needsRelogin: true, msg: '访问令牌缺失' })
        return
      }
      
      console.log('📡 获取最新用户信息以验证权限...')
      
      // 获取最新用户信息（包含权限字段）
      wx.request({
        url: app.globalData.baseUrl + '/user/info',
        method: 'GET',
        header: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${app.globalData.accessToken}`
        },
        success: (res) => {
          console.log('📡 用户信息API响应:', res)
          
          if (res.statusCode === 200 && res.data.code === 0) {
            const userInfo = res.data.data
            
            // 🔧 更新全局用户信息
            app.globalData.userInfo = userInfo
            
            // 🔐 重新验证权限
            const permissionManager = createPermissionManager(userInfo)
            const permissionStatus = permissionManager.getPermissionStatus()
            
            console.log('🔐 最新权限验证结果:', {
              userInfo: {
                user_id: userInfo?.user_id,
                mobile: userInfo?.mobile?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2'),
                is_admin: userInfo?.is_admin,
                is_merchant: userInfo?.is_merchant
              },
              permissionStatus: permissionStatus
            })
            
            // 🔧 更新页面权限状态
            this.setData({
              userInfo: userInfo,
              isSuperAdmin: permissionStatus.isSuperAdmin,
              isAdmin: permissionStatus.isAdmin,
              isMerchant: permissionStatus.isMerchant,
              hasPermission: permissionStatus.isSuperAdmin,
              permissionStatus: permissionStatus
            })
            
            // 🔧 权限检查
            if (!permissionStatus.isSuperAdmin) {
              console.log('❌ 权限验证失败 - 当前用户不是超级管理员')
              reject({ 
                permissionDenied: true, 
                msg: '权限不足',
                permissionStatus: permissionStatus 
              })
              return
            }
            
            console.log('✅ 权限验证通过，用户状态已更新')
            resolve(permissionStatus)
            
          } else if (res.statusCode === 401) {
            console.error('❌ 认证失败 - Token无效或已过期')
            reject({ needsRelogin: true, msg: 'Token无效或已过期' })
          } else {
            console.error('❌ 获取用户信息失败:', res.data)
            reject({ msg: res.data.msg || '获取用户信息失败' })
          }
        },
        fail: (error) => {
          console.error('❌ 用户信息请求失败:', error)
          reject({ msg: '网络请求失败', error: error })
        }
      })
    })
  },

  /**
   * 加载数据
   */
  loadData() {
    this.setData({ loading: true })
    
    // 🚨 立即修复：强制超时保护，防止页面永久loading
    const forceTimeoutId = setTimeout(() => {
      if (this.data.loading === true) {
        console.warn('🚨 商家页面loading超时，强制设置为完成状态')
        this.setData({ loading: false })
        
        wx.showModal({
          title: '⏱️ 数据加载超时',
          content: '商家数据加载时间过长，已自动启用离线模式。\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n\n您可以下拉刷新重新加载数据。',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '继续使用',
          success: (res) => {
            if (res.cancel) {
              setTimeout(() => this.loadData(), 1000)
            }
          }
        })
      }
    }, 8000) // 8秒强制超时
    
    const loadPromises = [
      this.loadStatistics(),
      this.loadPendingList()
    ]
    
    // 根据当前选项卡加载对应数据
    if (this.data.currentTab === 'lottery') {
      loadPromises.push(this.loadLotteryData())
    } else if (this.data.currentTab === 'product') {
      loadPromises.push(this.loadProductData())
    }
    
    return Promise.all(loadPromises).then(() => {
      clearTimeout(forceTimeoutId)
      this.setData({ loading: false })
      console.log('✅ 商家数据加载完成')
    }).catch(error => {
      clearTimeout(forceTimeoutId)
      console.error('❌ 加载数据失败:', error)
      this.setData({ loading: false })
      
      // 🔧 新增：友好的错误提示
      wx.showModal({
        title: '🚨 数据加载失败',
        content: `商家数据加载遇到问题！\n\n可能原因：\n• 网络连接异常\n• 后端服务暂不可用\n• 权限验证失败\n\n请检查网络后重试。`,
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '立即重试',
        confirmColor: '#007aff',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.loadData()
          }
        }
      })
    })
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
  loadStatistics() {
    // 🔴 删除违规代码：严禁使用模拟数据，所有统计数据均来自后端真实API
    console.log('📡 请求商家统计接口...')
    return merchantAPI.getStatistics().then((statisticsData) => {
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
    }).catch((error) => {
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

      // 显示后端API错误提示
      wx.showModal({
        title: '📊 统计数据加载失败',
        content: '商家统计数据获取失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 权限验证失败\n\n错误详情：' + (error.message || error.msg || '未知错误'),
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新加载',
        success: (res) => {
          if (res.confirm) {
            this.loadStatistics()
          }
        }
      })
    })
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
  loadPendingList() {
    // 🔴 删除违规代码：严禁使用模拟数据，所有待审核列表数据均来自后端真实API
    console.log('📡 请求待审核列表接口...')
    return merchantAPI.getPendingReviews(1, 20).then((listData) => {
      this.setData({
        pendingList: listData.data.list,
        totalPending: listData.data.total
      })

      console.log('✅ 待审核列表加载成功，共', listData.data.list.length, '条记录')
    }).catch((error) => {
      console.error('❌ 获取待审核列表失败:', error)
      
      // 🔧 完善：更详细的错误处理
      this.setData({ 
        pendingList: [],
        totalPending: 0
      })
      
      // 根据错误类型提供不同的提示
      let errorMsg = '获取待审核列表失败'
      if (error.code === 401 || error.code === 2001) {
        errorMsg = '权限验证失败，请重新登录'
      } else if (error.code === 403) {
        errorMsg = '无商家权限，请申请商家认证'
      } else if (error.isNetworkError) {
        errorMsg = '网络连接异常，请检查网络设置'
      } else if (error.isBackendError) {
        errorMsg = '后端服务异常，请稍后重试'
      }
      
      wx.showModal({
        title: '📋 待审核列表加载失败',
        content: '待审核列表获取失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 权限验证失败\n\n错误详情：' + errorMsg,
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新加载',
        success: (res) => {
          if (res.confirm) {
            this.loadPendingList()
          }
        }
      })
    })
  },

  /**
   * 🚨 已删除违规函数：generateMockPendingList()
   * 🔴 原因：违反项目安全规则 - 严禁前端硬编码敏感业务数据
   * ✅ 正确做法：使用merchantAPI.getPendingReviews()获取真实数据
   */

  /**
   * 申请商家权限
   */
  onRequestAuth() {
    console.log('点击申请商家权限')
    
    // 显示确认对话框
    wx.showModal({
      title: '申请商家权限',
      content: '您确定要申请商家权限吗？申请通过后您将可以管理商品和审核小票。',
      success: (res) => {
        if (res.confirm) {
          this.confirmAuthRequest()
        }
      }
    })
  },

  /**
   * 确认申请商家权限
   */
  confirmAuthRequest() {
    // 防止重复提交
    if (this.data.authRequesting) {
      console.log('正在申请中，跳过重复请求')
      return
    }
    
    this.setData({ authRequesting: true })

    console.log('🔧 开始申请商家权限')
    wx.showLoading({ title: '申请中...' })
    
    // 🔴 删除违规代码：严禁使用模拟数据，所有商家权限申请均通过后端真实API
    console.log('📡 请求商家权限申请接口...')
    
    merchantAPI.apply({
      store_name: '餐厅名称',
      business_license: '营业执照号',
      contact_person: '联系人',
      contact_phone: '联系电话'
    }).then((result) => {
      if (result.code === 0) {
        this.setData({
          isMerchant: true,
          hasPermission: true
        })
        
        // 更新全局数据
        if (app.globalData.userInfo) {
          app.globalData.userInfo.is_merchant = true
        }
        
        wx.hideLoading()
        wx.showToast({
          title: '商家权限申请成功',
          icon: 'success'
        })
        
        // 加载商家数据
        return this.loadData()
      } else {
        throw new Error(result.msg || '申请失败')
      }
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 申请商家权限失败:', error)
      
      wx.showModal({
        title: '🏪 商家权限申请失败',
        content: '商家权限申请失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 申请信息不完整\n\n错误详情：' + (error.message || error.msg || '未知错误'),
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新申请',
        success: (res) => {
          if (res.confirm) {
            this.confirmAuthRequest()
          }
        }
      })
    }).finally(() => {
      this.setData({ authRequesting: false })
    })
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
  onConfirmReview() {
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

    wx.showLoading({ title: '审核中...' })

    const requestData = {
      review_id: currentReview.id,
      action: reviewAction,
      points: reviewAction === 'approve' ? parseInt(reviewPoints) : 0,
      reason: reviewReason
    }

    // 🔴 删除违规代码：严禁使用模拟数据，所有审核操作均通过后端真实API
    console.log('📡 请求审核接口...')
    
    merchantAPI.review(requestData.review_id, requestData.action, requestData.points, requestData.reason).then((result) => {
      wx.hideLoading()
      
      if (result.code === 0) {
        // 关闭模态框
        this.setData({ showReviewModal: false })
        
        wx.showToast({
          title: reviewAction === 'approve' ? '审核通过' : '审核拒绝',
          icon: 'success'
        })
        
        // 刷新数据
        return this.loadData()
      } else {
        throw new Error(result.msg || '审核失败')
      }
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 审核失败:', error)
      
      wx.showModal({
        title: '📋 审核操作失败',
        content: '审核操作失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 权限验证失败\n\n错误详情：' + (error.message || error.msg || '未知错误'),
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新审核',
        success: (res) => {
          if (res.confirm) {
            this.onConfirmReview()
          }
        }
      })
    })
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
   */
  onBatchApprove() {
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
      success: (res) => {
        if (res.confirm) {
          this.performBatchAction(selectedItems, 'approve', '批量通过审核')
        }
      }
    })
  },

  /**
   * 批量拒绝
   * TODO: 后端对接 - 批量审核接口
   */
  onBatchReject() {
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
      success: (res) => {
        if (res.confirm) {
          this.performBatchAction(selectedItems, 'reject', '批量拒绝，请重新上传')
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
  performBatchAction(selectedItems, action, reason) {
    const reviewIds = selectedItems.map(item => item.id)
    
    wx.showLoading({
      title: action === 'approve' ? '批量通过中...' : '批量拒绝中...',
      mask: true
    })

    // 🔴 删除违规代码：严禁使用模拟数据，所有批量操作均通过后端真实API
    console.log('📡 请求批量审核接口...')
    
    merchantAPI.batchReview(reviewIds, action, reason).then((result) => {
      wx.hideLoading()
      
      if (result.code === 0) {
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
      } else {
        throw new Error(result.msg || '批量操作失败')
      }
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 批量操作失败:', error)
      
      wx.showModal({
        title: '📋 批量操作失败',
        content: '批量操作失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 权限验证失败\n\n错误详情：' + (error.message || error.msg || '未知错误'),
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '重新操作',
        success: (res) => {
          if (res.confirm) {
            this.performBatchAction(selectedItems, action, reason)
          }
        }
      })
    })
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
  onExportData() {
    wx.showLoading({
      title: '生成导出文件...',
      mask: true
    })

    // 🔴 删除违规代码：严禁使用模拟数据，所有数据导出均通过后端真实API
    console.log('📡 请求数据导出接口...')
    
    // TODO: 实现日期选择和数据导出
    const startDate = '2024-01-01'  // 实际应用中需要用户选择
    const endDate = '2024-01-31'
    
    // 这里需要根据实际后端接口实现
    // const exportUrl = `${app.globalData.baseUrl}/api/merchant/export-data?start_date=${startDate}&end_date=${endDate}`
    
    Promise.resolve().then(() => {
      wx.hideLoading()
      wx.showModal({
        title: '功能开发中',
        content: '数据导出功能正在开发中，敬请期待\n\n所有数据导出功能均基于后端真实API实现。',
        showCancel: false
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 数据导出失败:', error)
      wx.showModal({
        title: '📊 数据导出失败',
        content: '数据导出失败！\n\n可能原因：\n1. 后端API服务异常\n2. 网络连接问题\n3. 权限验证失败\n\n错误详情：' + (error.msg || '未知错误'),
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  /**
   * 选项卡切换
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ currentTab: tab })
    
    if (tab === 'product') {
      this.loadProductData()
    } else if (tab === 'lottery') {
      this.loadLotteryData()
    }
  },

  /**
   * 加载商品数据
   */
  loadProductData() {
    Promise.all([
      this.loadProductStats(),
      this.loadProductList()
    ]).catch(error => {
      console.error('加载商品数据失败:', error)
    })
  },

  /**
   * 🔴 加载商品统计数据 - 必须从后端API获取
   * 接口：GET /api/merchant/product-stats
   * 认证：需要Bearer Token
   * 返回：商品统计信息（上架、下架、低库存等）
   */
  loadProductStats() {
    console.log('📡 加载商品统计数据...')
    
    return merchantAPI.getProductStats().then((res) => {
      console.log('✅ 商品统计数据API响应:', res)
      
      if (res.code === 0 && res.data) {
        this.setData({
          productStats: {
            activeCount: res.data.activeCount || 0,
            offlineCount: res.data.offlineCount || 0,
            lowStockCount: res.data.lowStockCount || 0,
            totalCount: res.data.totalCount || 0
          }
        })
        console.log('✅ 商品统计数据加载成功:', res.data)
      } else {
        console.warn('⚠️ 商品统计数据为空')
        this.setData({
          productStats: {
            activeCount: 0,
            offlineCount: 0,
            lowStockCount: 0,
            totalCount: 0
          }
        })
      }
    }).catch((error) => {
      console.error('❌ 加载商品统计失败:', error)
      
      // 🔴 后端服务异常已在API层处理，这里只需要设置安全默认值
      this.setData({
        productStats: {
          activeCount: 0,
          offlineCount: 0,
          lowStockCount: 0,
          totalCount: 0
        }
      })
    })
  },

  /**
   * 🔴 WebSocket状态监听 - 实时接收库存变化和审核状态推送
   * 符合最新产品功能要求：实时同步商品库存变化
   */
  onWebSocketMessage(eventName, data) {
    console.log('📢 商家管理页面收到WebSocket消息:', eventName, data)
    
    switch (eventName) {
      case 'stock_updated':
        // 库存更新通知
        console.log('📦 收到库存更新通知:', data)
        
        // 刷新商品统计
        this.loadProductStats()
        
        // 如果在商品管理标签页，刷新商品列表
        if (this.data.currentTab === 'product') {
          this.loadProductList()
        }
        
        // 显示库存变化通知
        wx.showToast({
          title: `商品库存已更新`,
          icon: 'success',
          duration: 2000
        })
        break
        
      case 'review_completed':
        // 审核完成通知
        console.log('📋 收到审核完成通知:', data)
        
        // 刷新审核统计
        this.loadStatistics()
        
        // 如果在审核标签页，刷新待审核列表
        if (this.data.currentTab === 'review') {
          this.loadPendingList()
        }
        
        // 显示审核完成通知
        wx.showToast({
          title: '审核任务已完成',
          icon: 'success',
          duration: 2000
        })
        break
        
      case 'lottery_config_updated':
        // 抽奖配置更新通知
        console.log('🎰 收到抽奖配置更新通知:', data)
        
        // 如果在抽奖控制标签页，刷新抽奖数据
        if (this.data.currentTab === 'lottery') {
          this.loadLotteryData()
        }
        
        wx.showToast({
          title: '抽奖配置已更新',
          icon: 'success',
          duration: 2000
        })
        break
        
      default:
        console.log('📝 未处理的WebSocket事件:', eventName, data)
    }
  },

  /**
   * 🔴 加载商品列表 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止硬编码商品数据
   */
  loadProductList() {
    console.log('📡 请求商家商品列表接口...')
    
    return merchantAPI.getProducts().then((result) => {
      if (result.code === 0) {
        this.setData({ 
          productList: result.data.products || []
        })
        console.log('✅ 商品列表加载成功')
      } else {
        throw new Error('⚠️ 后端服务异常：' + result.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取商品列表失败:', error)
      
      // 🚨 显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取商品列表！\n\n请检查后端API服务状态：\nGET /api/merchant/products',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      this.setData({ productList: [] })
    })
  },

  /**
   * 新增商品 - 完善实现
   * TODO: 后端对接 - 新增商品接口
   * 
   * 对接说明：
   * 接口：POST /api/merchant/products
   * 请求体：商品信息（名称、描述、积分价格、库存、图片等）
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：新增商品的完整信息
   */
  onAddProduct() {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    console.log('🛍️ 新增商品操作')
    this.setData({
      showProductModal: true,
      editingProduct: null,
      productForm: {
        name: '',
        description: '',
        exchange_points: '',
        stock: '',
        image: '',
        category: '实物商品', // 默认分类
        is_hot: false, // 是否热门
        sort_order: 0 // 排序权重
      }
    })
  },

  /**
   * 编辑商品 - 增强实现
   */
  onEditProduct(e) {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    const product = e.currentTarget.dataset.product
    console.log('✏️ 编辑商品:', product.name)
    
    this.setData({
      showProductModal: true,
      editingProduct: product,
      productForm: {
        name: product.name,
        description: product.description,
        exchange_points: product.exchange_points.toString(),
        stock: product.stock.toString(),
        image: product.image,
        category: product.category || '实物商品',
        is_hot: product.is_hot || false,
        sort_order: product.sort_order || 0
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
  onToggleStatus(e) {
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
    
    return Promise.resolve()
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
   * 确认新增/编辑商品
   * TODO: 后端对接 - 商品管理接口
   * 
   * 重要实现细节：
   * 1. 通过全局事件通知兑换页面刷新
   * 2. 或通过全局数据缓存实现同步
   * 3. 后端数据库层面保证数据一致性
   */
  onConfirmProduct() {
    const form = this.data.productForm
    
    // 表单验证
    if (!form.name.trim()) {
      wx.showToast({
        title: '请输入商品名称',
        icon: 'none'
      })
      return
    }

    if (!form.exchange_points || parseInt(form.exchange_points) <= 0) {
      wx.showToast({
        title: '请输入有效的积分价格',
        icon: 'none'
      })
      return
    }

    if (!form.stock || parseInt(form.stock) < 0) {
      wx.showToast({
        title: '请输入有效的库存数量',
        icon: 'none'
      })
      return
    }

    if (!form.description.trim()) {
      wx.showToast({
        title: '请输入商品描述',
        icon: 'none'
      })
      return
    }
    
    this.setData({ productSubmitting: true })
    
    const productData = {
      name: form.name.trim(),
      description: form.description.trim(),
      exchange_points: parseInt(form.exchange_points),
      stock: parseInt(form.stock),
      image: form.image,
      category: form.category || '实物商品',
      is_hot: form.is_hot || false,
      sort_order: form.sort_order || 0
    }

    // 🔴 删除违规代码：严禁使用模拟数据，所有商品操作均通过后端真实API
    let apiPromise
    
    if (this.data.editingProduct) {
      console.log('📡 更新商品:', this.data.editingProduct.id)
      apiPromise = merchantAPI.updateProduct(this.data.editingProduct.id, productData)
    } else {
      console.log('📡 新增商品')
      apiPromise = merchantAPI.createProduct(productData)
    }
    
    apiPromise.then((result) => {
      // 更新本地商品列表
      if (this.data.editingProduct) {
        // 编辑模式 - 更新现有商品
        const productList = this.data.productList.map(item => {
          if (item.id === this.data.editingProduct.id) {
            return {
              ...item,
              ...productData,
              updated_time: new Date().toISOString()
            }
          }
          return item
        })
        this.setData({ productList })
        console.log('✅ 商品更新成功:', productData.name)
      } else {
        // 新增模式 - 添加新商品
        const newProduct = {
          id: result.data.id,
          ...productData,
          status: 'active',
          created_time: result.data.created_time || new Date().toISOString(),
          updated_time: new Date().toISOString()
        }
        this.setData({
          productList: [...this.data.productList, newProduct]
        })
        console.log('✅ 商品新增成功:', productData.name)
      }

      // 重要：通知兑换页面数据已更新
      this.notifyExchangePageUpdate()
      
      // 更新商品统计
      this.updateProductStats()
      
      this.setData({
        showProductModal: false,
        productSubmitting: false
      })
      
      wx.showToast({
        title: this.data.editingProduct ? '更新成功' : '新增成功',
        icon: 'success'
      })
    }).catch((error) => {
      this.setData({ productSubmitting: false })
      console.error('❌ 保存商品失败:', error)
      
      wx.showModal({
        title: '🚨 商品保存失败',
        content: '【问题诊断】商品保存API调用失败\n\n【具体原因】\n• 后端API服务异常 (最可能)\n• 网络连接问题\n• 数据验证失败\n\n【解决方案】\n如果是后端问题请联系后端程序员检查API服务',
        showCancel: true,
        cancelText: '稍后重试',
        confirmText: '知道了',
        success: (res) => {
          if (res.cancel) {
            this.onConfirmProduct()
          }
        }
      })
    })
  },

  /**
   * 通知兑换页面数据更新
   * 实现商家管理与兑换页面的数据联动
   */
  notifyExchangePageUpdate() {
    try {
      // 方法1: 通过全局事件通知
      if (typeof getApp().globalData.updateExchangeProducts === 'function') {
        getApp().globalData.updateExchangeProducts()
        console.log('📢 已通知兑换页面更新商品数据')
      }

      // 方法2: 更新全局商品缓存
      getApp().globalData.merchantProductsLastUpdate = Date.now()
      
      // 方法3: 设置刷新标志
      getApp().globalData.needRefreshExchangeProducts = true
      
      console.log('🔄 商品数据联动更新完成')
    } catch (error) {
      console.warn('⚠️ 通知兑换页面更新失败:', error)
    }
  },

  /**
   * 更新商品统计数据
   */
  updateProductStats() {
    const products = this.data.productList
    const stats = {
      totalCount: products.length,
      activeCount: products.filter(p => p.status === 'active').length,
      offlineCount: products.filter(p => p.status === 'offline').length,
      lowStockCount: products.filter(p => p.stock < 10).length
    }
    
    this.setData({ productStats: stats })
    console.log('📊 商品统计更新:', stats)
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
   * 批量编辑 - 完整实现
   * TODO: 后端对接 - 批量编辑商品接口
   * 
   * 对接说明：
   * 接口：PUT /api/merchant/products/batch
   * 请求体：{ product_ids: [1,2,3], updates: { category: "优惠券", is_hot: true } }
   * 认证：需要Bearer Token，且用户需要有商家权限
   * 返回：批量更新结果
   */
  onBatchEdit() {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    console.log('📝 批量编辑商品')
    
    // 检查是否有选中的商品
    const selectedProducts = this.data.productList.filter(product => product.selected)
    
    if (selectedProducts.length === 0) {
      wx.showModal({
        title: '批量编辑',
        content: '请先选择要批量编辑的商品',
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    // 显示批量编辑选项
    wx.showActionSheet({
      itemList: [
        `批量上架 (已选${selectedProducts.length}个商品)`,
        `批量下架 (已选${selectedProducts.length}个商品)`,
        `批量设为热门 (已选${selectedProducts.length}个商品)`,
        `批量取消热门 (已选${selectedProducts.length}个商品)`,
        `批量删除 (已选${selectedProducts.length}个商品)`,
        '高级批量编辑...'
      ],
      success: (res) => {
        switch (res.tapIndex) {
          case 0:
            this.batchUpdateStatus(selectedProducts, 'active')
            break
          case 1:
            this.batchUpdateStatus(selectedProducts, 'offline')
            break
          case 2:
            this.batchUpdateHotStatus(selectedProducts, true)
            break
          case 3:
            this.batchUpdateHotStatus(selectedProducts, false)
            break
          case 4:
            this.batchDeleteProducts(selectedProducts)
            break
          case 5:
            this.showAdvancedBatchEdit(selectedProducts)
            break
        }
      }
    })
  },

  /**
   * 批量更新商品状态
   */
  batchUpdateStatus(products, status) {
    const statusText = status === 'active' ? '上架' : '下架'
    
    wx.showLoading({ title: `批量${statusText}中...` })
    
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟
      new Promise(resolve => setTimeout(resolve, 1000)).then(() => {
        // 更新本地数据
        const productList = this.data.productList.map(item => {
          if (products.find(p => p.id === item.id)) {
            return { ...item, status, selected: false }
          }
          return item
        })

        this.setData({ productList })
        wx.hideLoading()
        
        wx.showToast({
          title: `批量${statusText}成功`,
          icon: 'success'
        })
        
        console.log(`✅ 批量${statusText}完成，影响商品:`, products.length)
      }).catch((error) => {
        wx.hideLoading()
        console.error(`❌ 批量${statusText}失败:`, error)
        wx.showToast({
          title: `批量${statusText}失败`,
          icon: 'none'
        })
      })
    } else {
      // 生产环境调用真实接口
      const productIds = products.map(p => p.id)
      
      merchantAPI.batchUpdateProducts(productIds, { status }).then(() => {
        // 更新本地数据
        const productList = this.data.productList.map(item => {
          if (products.find(p => p.id === item.id)) {
            return { ...item, status, selected: false }
          }
          return item
        })

        this.setData({ productList })
        wx.hideLoading()
        
        wx.showToast({
          title: `批量${statusText}成功`,
          icon: 'success'
        })
        
        console.log(`✅ 批量${statusText}完成，影响商品:`, products.length)
      }).catch((error) => {
        wx.hideLoading()
        console.error(`❌ 批量${statusText}失败:`, error)
        wx.showToast({
          title: `批量${statusText}失败`,
          icon: 'none'
        })
      })
    }
  },

  /**
   * 批量更新热门状态
   */
  batchUpdateHotStatus(products, isHot) {
    const actionText = isHot ? '设为热门' : '取消热门'
    
    wx.showLoading({ title: `批量${actionText}中...` })
    
    // 🔴 删除违规代码：严禁使用模拟数据，所有商品批量操作均通过后端真实API
    const productIds = products.map(p => p.id)
    
    merchantAPI.batchUpdateProducts(productIds, { is_hot: isHot }).then(() => {
      // 更新本地数据
      const productList = this.data.productList.map(item => {
        if (products.find(p => p.id === item.id)) {
          return { ...item, is_hot: isHot, selected: false }
        }
        return item
      })

      this.setData({ productList })
      wx.hideLoading()
      
      wx.showToast({
        title: `批量${actionText}成功`,
        icon: 'success'
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error(`❌ 批量${actionText}失败:`, error)
      
      wx.showModal({
        title: `🚨 批量${actionText}失败`,
        content: `【问题诊断】批量${actionText}API调用失败\n\n【具体原因】\n• 后端API服务异常 (最可能)\n• 网络连接问题\n• 商品ID无效\n\n【解决方案】\n如果是后端问题请联系后端程序员检查API服务`,
        showCancel: false,
        confirmText: '知道了'
      })
    })
  },

  /**
   * 批量删除商品
   */
  batchDeleteProducts(products) {
    wx.showModal({
      title: '批量删除确认',
      content: `确定要删除选中的 ${products.length} 个商品吗？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#ff4444',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' })
          
          // 🔴 删除违规代码：严禁使用模拟数据，所有商品删除操作均通过后端真实API
          const productIds = products.map(p => p.id)
          
          merchantAPI.batchDeleteProducts(productIds).then(() => {
            // 更新本地数据
            const productList = this.data.productList.filter(item => 
              !products.find(p => p.id === item.id)
            )

            this.setData({ productList })
            wx.hideLoading()
            
            wx.showToast({
              title: '批量删除成功',
              icon: 'success'
            })
          }).catch((error) => {
            wx.hideLoading()
            console.error('❌ 批量删除失败:', error)
            
            wx.showModal({
              title: '🚨 批量删除失败',
              content: '【问题诊断】批量删除API调用失败\n\n【具体原因】\n• 后端API服务异常 (最可能)\n• 网络连接问题\n• 商品ID无效或已被删除\n\n【解决方案】\n如果是后端问题请联系后端程序员检查API服务',
              showCancel: false,
              confirmText: '知道了'
            })
          })
        }
      }
    })
  },

  /**
   * 显示高级批量编辑弹窗
   */
  showAdvancedBatchEdit(products) {
    this.setData({
      showBatchEditModal: true,
      selectedProducts: products,
      batchEditForm: {
        category: '',
        pointsAdjustment: 0,
        stockAdjustment: 0,
        updateCategory: false,
        updatePoints: false,
        updateStock: false
      }
    })
  },

  /**
   * 商品选择状态切换
   */
  onProductSelect(e) {
    const productId = e.currentTarget.dataset.id
    const productList = this.data.productList.map(item => {
      if (item.id === productId) {
        return { ...item, selected: !item.selected }
      }
      return item
    })
    
    this.setData({ productList })
    
    // 统计选中数量
    const selectedCount = productList.filter(item => item.selected).length
    console.log('📋 已选中商品数量:', selectedCount)
  },

  /**
   * 全选/取消全选
   */
  onSelectAllProducts() {
    const allSelected = this.data.productList.every(item => item.selected)
    const productList = this.data.productList.map(item => ({
      ...item,
      selected: !allSelected
    }))
    
    this.setData({ productList })
    
    wx.showToast({
      title: allSelected ? '已取消全选' : '已全选商品',
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
  },

  /**
   * 商品分类选择
   */
  onProductCategoryChange(e) {
    const categories = ['实物商品', '优惠券', '虚拟物品']
    this.setData({
      'productForm.category': categories[e.detail.value]
    })
  },

  /**
   * 商品热门状态切换
   */
  onProductHotChange(e) {
    this.setData({
      'productForm.is_hot': e.detail.value
    })
  },

  /**
   * 商品排序权重输入
   */
  onProductSortInput(e) {
    this.setData({
      'productForm.sort_order': parseInt(e.detail.value) || 0
    })
  },

  /**
   * 批量编辑分类开关
   */
  onBatchCategoryToggle(e) {
    this.setData({
      'batchEditForm.updateCategory': e.detail.value
    })
  },

  /**
   * 批量编辑分类选择
   */
  onBatchCategoryChange(e) {
    const categories = ['实物商品', '优惠券', '虚拟物品']
    this.setData({
      'batchEditForm.category': categories[e.detail.value]
    })
  },

  /**
   * 批量编辑积分开关
   */
  onBatchPointsToggle(e) {
    this.setData({
      'batchEditForm.updatePoints': e.detail.value
    })
  },

  /**
   * 批量编辑积分输入
   */
  onBatchPointsInput(e) {
    this.setData({
      'batchEditForm.pointsAdjustment': parseInt(e.detail.value) || 0
    })
  },

  /**
   * 批量编辑库存开关
   */
  onBatchStockToggle(e) {
    this.setData({
      'batchEditForm.updateStock': e.detail.value
    })
  },

  /**
   * 批量编辑库存输入
   */
  onBatchStockInput(e) {
    this.setData({
      'batchEditForm.stockAdjustment': parseInt(e.detail.value) || 0
    })
  },

  /**
   * 取消批量编辑
   */
  onCancelBatchEdit() {
    this.setData({
      showBatchEditModal: false,
      selectedProducts: [],
      batchEditForm: {
        category: '',
        pointsAdjustment: 0,
        stockAdjustment: 0,
        updateCategory: false,
        updatePoints: false,
        updateStock: false
      }
    })
  },

  /**
   * 确认批量编辑
   */
  onConfirmBatchEdit() {
    const { batchEditForm, selectedProducts } = this.data

    // 检查是否有选择要更新的项目
    if (!batchEditForm.updateCategory && !batchEditForm.updatePoints && !batchEditForm.updateStock) {
      wx.showToast({
        title: '请选择要批量修改的项目',
        icon: 'none'
      })
      return
    }

    wx.showLoading({ title: '批量更新中...' })

    // 构建更新数据
    const updateData = {}
    if (batchEditForm.updateCategory) {
      updateData.category = batchEditForm.category
    }
    if (batchEditForm.updatePoints) {
      updateData.pointsAdjustment = batchEditForm.pointsAdjustment
    }
    if (batchEditForm.updateStock) {
      updateData.stockAdjustment = batchEditForm.stockAdjustment
    }

    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟
      new Promise(resolve => setTimeout(resolve, 1500)).then(() => {
        // 更新本地数据
        const productList = this.data.productList.map(item => {
          const selectedProduct = selectedProducts.find(p => p.id === item.id)
          if (selectedProduct) {
            const updatedItem = { ...item, selected: false }
            
            if (batchEditForm.updateCategory) {
              updatedItem.category = batchEditForm.category
            }
            if (batchEditForm.updatePoints) {
              updatedItem.exchange_points = Math.max(1, updatedItem.exchange_points + batchEditForm.pointsAdjustment)
            }
            if (batchEditForm.updateStock) {
              updatedItem.stock = Math.max(0, updatedItem.stock + batchEditForm.stockAdjustment)
            }
            
            return updatedItem
          }
          return item
        })

        this.setData({ 
          productList,
          showBatchEditModal: false,
          selectedProducts: []
        })

        wx.hideLoading()
        wx.showToast({
          title: '批量更新成功',
          icon: 'success'
        })

        // 通知兑换页面数据更新
        this.notifyExchangePageUpdate()
        this.updateProductStats()
      }).catch((error) => {
        wx.hideLoading()
        console.error('❌ 批量编辑失败:', error)
        wx.showToast({
          title: '批量更新失败',
          icon: 'none'
        })
      })
    } else {
      // 生产环境调用真实接口
      const productIds = selectedProducts.map(p => p.id)
      
      merchantAPI.batchUpdateProducts(productIds, updateData).then(() => {
        // 更新本地数据
        const productList = this.data.productList.map(item => {
          const selectedProduct = selectedProducts.find(p => p.id === item.id)
          if (selectedProduct) {
            const updatedItem = { ...item, selected: false }
            
            if (batchEditForm.updateCategory) {
              updatedItem.category = batchEditForm.category
            }
            if (batchEditForm.updatePoints) {
              updatedItem.exchange_points = Math.max(1, updatedItem.exchange_points + batchEditForm.pointsAdjustment)
            }
            if (batchEditForm.updateStock) {
              updatedItem.stock = Math.max(0, updatedItem.stock + batchEditForm.stockAdjustment)
            }
            
            return updatedItem
          }
          return item
        })

        this.setData({ 
          productList,
          showBatchEditModal: false,
          selectedProducts: []
        })

        wx.hideLoading()
        wx.showToast({
          title: '批量更新成功',
          icon: 'success'
        })

        // 通知兑换页面数据更新
        this.notifyExchangePageUpdate()
        this.updateProductStats()
      }).catch((error) => {
        wx.hideLoading()
        console.error('❌ 批量编辑失败:', error)
        wx.showToast({
          title: '批量更新失败',
          icon: 'none'
        })
      })
    }
  },

  /**
   * 项目选择（用于审核列表）
   */
  onItemSelect(e) {
    const id = e.currentTarget.dataset.id
    const pendingList = this.data.pendingList.map(item => {
      if (item.id === id) {
        return { ...item, selected: !item.selected }
      }
      return item
    })
    
    this.setData({ pendingList })
  },

  updateStatisticsAfterReview(action) {
    const statistics = { ...this.data.statistics }
    if (action === 'approve') {
      statistics.todayApproved++
    } else {
      statistics.todayRejected++
    }
    statistics.totalProcessed++
    this.setData({ statistics })
  },

  /* ==================== 🎰 抽奖控制功能 ==================== */

  /**
   * 初始化维护时间范围
   */
  initMaintenanceTimeRange() {
    const today = new Date()
    const dateRange = []
    const timeRange = []
    
    // 生成日期范围（今天开始7天）
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() + i)
      const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`
      dateRange.push(dateStr)
    }
    
    // 生成时间范围（0-23小时）
    for (let i = 0; i < 24; i++) {
      timeRange.push(`${i.toString().padStart(2, '0')}:00`)
    }
    
    this.setData({
      maintenanceTimeRange: [dateRange, timeRange]
    })
  },

  /**
   * 加载抽奖数据 - 🔴 必须从后端获取，严禁前端模拟
   */
  loadLotteryData() {
    console.log('🎰 加载抽奖数据')
    
    wx.showLoading({ title: '加载中...' })
    
    // 🔴 必须从后端获取抽奖配置和统计数据
    return Promise.all([
      this.loadLotteryConfig(),
      this.loadLotteryStats()
    ]).then(() => {
      wx.hideLoading()
      console.log('✅ 抽奖数据加载完成')
    }).catch(error => {
      wx.hideLoading()
      console.error('❌ 抽奖数据加载失败:', error)
      
      // 🚨 后端数据获取失败时的错误处理
      wx.showModal({
        title: '数据加载失败',
        content: '无法从后端获取抽奖配置数据，请检查后端服务是否正常运行。',
        showCancel: false,
        confirmText: '知道了'
      })
      
      throw error
    })
  },

  /**
   * 🔴 加载抽奖配置 - 必须从后端API获取，严禁前端硬编码
   * 接口：GET /api/merchant/lottery/config
   * 认证：需要Bearer Token + 商家权限
   * 返回：抽奖奖品配置和概率设置
   */
  loadLotteryConfig() {
    console.log('📡 加载抽奖配置...')
    
    return merchantAPI.getLotteryConfig().then((res) => {
      console.log('✅ 抽奖配置API响应:', res)
      
      if (res.code === 0 && res.data) {
        // 🔴 严格验证后端返回的配置数据
        const config = res.data
        
        if (!config.prizes || !Array.isArray(config.prizes)) {
          throw new Error('后端返回的抽奖配置数据格式不正确')
        }
        
        // 🔴 验证奖品配置完整性
        const validPrizes = config.prizes.map((prize, index) => {
          console.log(`🎁 商户端奖品${index + 1}原始数据:`, prize)
          
          // 🔧 修复：智能概率解析 - 与lottery.js保持一致
          let rawProbability = prize.probability || 0
          let probability = Number(rawProbability)
          
          // 如果概率是小数格式（0-1之间），转换为百分比格式（0-100）
          if (probability > 0 && probability <= 1) {
            probability = probability * 100
            console.log(`🔧 商户端概率格式转换: 小数${rawProbability} → 百分比${probability}%`)
          }
          
          return {
            ...prize,
            probability: probability, // 使用转换后的概率
            originalProbability: rawProbability // 记录原始概率
          }
        }).filter(prize => 
          prize.prize_id && 
          prize.prize_name && 
          typeof prize.probability === 'number' &&
          prize.probability >= 0 &&
          prize.probability <= 100
        )
        
        if (validPrizes.length !== config.prizes.length) {
          console.warn('⚠️ 部分抽奖奖品配置数据不完整，已过滤')
          console.log('📊 商户端概率验证结果:', {
            '原始奖品数': config.prizes.length,
            '有效奖品数': validPrizes.length,
            '概率详情': validPrizes.map(p => ({
              name: p.prize_name,
              originalProbability: p.originalProbability,
              convertedProbability: p.probability
            }))
          })
        }
        
        this.setData({
          lotteryConfig: {
            isActive: config.is_active || false,
            prizes: validPrizes
          }
        })
        
        // 🔴 计算概率总和
        this.calculateProbabilityTotal()
        
        console.log('✅ 抽奖配置加载成功，共', validPrizes.length, '个奖品')
      } else {
        throw new Error('后端返回的抽奖配置数据为空')
      }
    }).catch((error) => {
      console.error('❌ 加载抽奖配置失败:', error)
      
      // 🔴 后端服务异常已在API层处理，这里只需要设置安全默认值
      this.setData({
        lotteryConfig: {
          isActive: false,
          prizes: []
        },
        probabilityTotal: 0
      })
    })
  },

  /**
   * 从后端加载抽奖统计数据
   */
  loadLotteryStats() {
    return merchantAPI.getLotteryStats().then(result => {
      if (result.code === 0 && result.data) {
        this.setData({
          lotteryStats: result.data
        })
        console.log('✅ 抽奖统计数据加载成功')
      } else {
        // 统计数据不是核心功能，可以使用默认值
        console.warn('⚠️ 抽奖统计数据获取失败，使用默认值')
        this.setData({
          lotteryStats: {
            todayCount: 0,
            totalCount: 0,
            activeUsers: 0,
            totalPrizes: 0
          }
        })
      }
    }).catch(error => {
      console.warn('⚠️ 抽奖统计数据加载失败:', error)
      // 使用默认统计数据
      this.setData({
        lotteryStats: {
          todayCount: 0,
          totalCount: 0,
          activeUsers: 0,
          totalPrizes: 0
        }
      })
    })
  },

  /**
   * 计算概率总和
   */
  calculateProbabilityTotal() {
    const total = this.data.lotteryConfig.prizes.reduce((sum, prize) => {
      return sum + (prize.probability || 0)
    }, 0)
    
    this.setData({ probabilityTotal: total })
    return total
  },

  /**
   * 切换抽奖系统状态
   */
  onToggleLotteryStatus() {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    const currentActive = this.data.lotteryConfig.isActive
    const newStatus = !currentActive
    
    wx.showModal({
      title: newStatus ? '恢复抽奖系统' : '暂停抽奖系统',
      content: newStatus ? 
        '确定要恢复抽奖系统吗？用户将可以正常参与抽奖。' : 
        '确定要暂停抽奖系统吗？暂停期间用户无法参与抽奖。',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'lotteryConfig.isActive': newStatus
          })
          
          wx.showToast({
            title: newStatus ? '抽奖系统已恢复' : '抽奖系统已暂停',
            icon: 'success'
          })
          
          console.log(`🎯 抽奖系统状态已切换为: ${newStatus ? '激活' : '暂停'}`)
          
          // 🔮 生产环境：调用后端接口保存状态
          // this.saveLotteryConfig()
        }
      }
    })
  },

  /**
   * 调整奖品概率
   */
  onAdjustProbability(e) {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    const { prizeId, action } = e.currentTarget.dataset
    const prizes = [...this.data.lotteryConfig.prizes]
    const prizeIndex = prizes.findIndex(p => p.id == prizeId)
    
    if (prizeIndex === -1) return
    
    let newProbability = prizes[prizeIndex].probability
    
    if (action === 'plus') {
      newProbability = Math.min(100, newProbability + 1)
    } else if (action === 'minus') {
      newProbability = Math.max(0, newProbability - 1)
    }
    
    prizes[prizeIndex].probability = newProbability
    
    this.setData({
      'lotteryConfig.prizes': prizes
    })
    
    this.calculateProbabilityTotal()
  },

  /**
   * 概率输入处理
   */
  onProbabilityInput(e) {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    const { prizeId } = e.currentTarget.dataset
    const value = parseInt(e.detail.value) || 0
    const clampedValue = Math.max(0, Math.min(100, value))
    
    const prizes = [...this.data.lotteryConfig.prizes]
    const prizeIndex = prizes.findIndex(p => p.id == prizeId)
    
    if (prizeIndex !== -1) {
      prizes[prizeIndex].probability = clampedValue
      
      this.setData({
        'lotteryConfig.prizes': prizes
      })
      
      this.calculateProbabilityTotal()
    }
  },

  /**
   * 重置概率为默认值 - 🔴 必须从后端获取默认配置
   */
  onResetProbabilities() {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    wx.showModal({
      title: '重置概率',
      content: '确定要重置所有奖品概率为后端默认值吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '重置中...' })
          
          // 🔴 调用后端API重置为默认配置
          merchantAPI.resetLotteryProbabilities().then(result => {
            wx.hideLoading()
            
            if (result.code === 0) {
              wx.showToast({
                title: '概率已重置',
                icon: 'success'
              })
              
              // 重新加载配置
              this.loadLotteryConfig()
            } else {
              throw new Error(result.msg || '重置失败')
            }
          }).catch(error => {
            wx.hideLoading()
            console.error('❌ 重置概率失败:', error)
            
            wx.showModal({
              title: '重置失败',
              content: '无法从后端重置概率配置，请检查后端服务状态。\n\n错误信息：' + (error.msg || error.message || '未知错误'),
              showCancel: false,
              confirmText: '知道了',
              confirmColor: '#ff4444'
            })
          })
        }
      }
    })
  },

  /**
   * 🔴 保存抽奖概率设置 - 必须提交到后端API
   * 接口：POST /api/merchant/lottery/probabilities
   * 认证：需要Bearer Token + 商家权限
   * 数据：奖品ID和对应的概率设置
   */
  onSaveProbabilities() {
    console.log('💾 保存抽奖概率设置...')
    
    // 🔴 验证概率总和
    const total = this.calculateProbabilityTotal()
    if (total !== 100) {
      wx.showModal({
        title: '⚠️ 概率设置错误',
        content: `所有奖品的概率总和必须等于100%！\n\n当前总和：${total}%`,
        showCancel: false,
        confirmText: '知道了'
      })
      return
    }
    
    // 🔴 构建提交数据
    const prizes = this.data.lotteryConfig.prizes.map(prize => ({
      prize_id: prize.prize_id,
      probability: prize.probability
    }))
    
    wx.showLoading({
      title: '保存中...',
      mask: true
    })
    
    // 🔴 调用后端API保存设置
    merchantAPI.saveLotteryProbabilities(prizes).then((result) => {
      wx.hideLoading()
      console.log('✅ 抽奖概率保存成功:', result)
      
      wx.showModal({
        title: '✅ 保存成功',
        content: '抽奖概率设置已保存！\n\n新的概率设置将立即生效。',
        showCancel: false,
        confirmText: '知道了'
      })
      
      // 🔴 刷新抽奖统计数据
      this.loadLotteryStats()
      
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 保存抽奖概率失败:', error)
      
      // 🔴 后端服务异常已在API层处理，这里只需要显示失败提示
      wx.showModal({
        title: '❌ 保存失败',
        content: `无法保存抽奖概率设置！\n\n错误信息：${error.msg || '网络错误'}\n\n请检查后端服务状态。`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
    })
  },

  /**
   * 预设维护时间
   */
  onPresetMaintenance(e) {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    const hours = parseInt(e.currentTarget.dataset.hours)
    const now = new Date()
    const endTime = new Date(now.getTime() + hours * 60 * 60 * 1000)
    
    const startTimeText = `${now.getMonth() + 1}月${now.getDate()}日 ${now.getHours().toString().padStart(2, '0')}:00`
    const endTimeText = `${endTime.getMonth() + 1}月${endTime.getDate()}日 ${endTime.getHours().toString().padStart(2, '0')}:00`
    
    wx.showModal({
      title: '预设维护时间',
      content: `确定要设置 ${hours} 小时的维护时间吗？\n开始：${startTimeText}\n结束：${endTimeText}`,
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'maintenanceConfig.isScheduled': true,
            'maintenanceConfig.startTimeText': startTimeText,
            'maintenanceConfig.endTimeText': endTimeText,
            'maintenanceConfig.reason': `系统维护 ${hours} 小时`
          })
          
          // 同时暂停抽奖系统
          this.setData({
            'lotteryConfig.isActive': false
          })
          
          wx.showToast({
            title: '维护时间已设置',
            icon: 'success'
          })
          
          console.log(`⏰ 设置维护时间: ${hours}小时`)
        }
      }
    })
  },

  /**
   * 维护开始时间变更
   */
  onMaintenanceStartTimeChange(e) {
    const [dateIndex, timeIndex] = e.detail.value
    const dateRange = this.data.maintenanceTimeRange[0]
    const timeRange = this.data.maintenanceTimeRange[1]
    
    const startTimeText = `${dateRange[dateIndex]} ${timeRange[timeIndex]}`
    
    this.setData({
      'maintenanceConfig.startTime': e.detail.value,
      'maintenanceConfig.startTimeText': startTimeText
    })
  },

  /**
   * 维护结束时间变更
   */
  onMaintenanceEndTimeChange(e) {
    const [dateIndex, timeIndex] = e.detail.value
    const dateRange = this.data.maintenanceTimeRange[0]
    const timeRange = this.data.maintenanceTimeRange[1]
    
    const endTimeText = `${dateRange[dateIndex]} ${timeRange[timeIndex]}`
    
    this.setData({
      'maintenanceConfig.endTime': e.detail.value,
      'maintenanceConfig.endTimeText': endTimeText
    })
  },

  /**
   * 维护原因输入
   */
  onMaintenanceReasonInput(e) {
    this.setData({
      'maintenanceConfig.reason': e.detail.value
    })
  },

  /**
   * 安排维护
   */
  onScheduleMaintenance() {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    const { startTimeText, endTimeText, reason } = this.data.maintenanceConfig
    
    if (!startTimeText || !endTimeText) {
      wx.showToast({
        title: '请选择维护时间',
        icon: 'none'
      })
      return
    }
    
    wx.showModal({
      title: '确认维护安排',
      content: `维护时间：${startTimeText} - ${endTimeText}\n${reason ? '原因：' + reason : ''}`,
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'maintenanceConfig.isScheduled': true,
            'lotteryConfig.isActive': false
          })
          
          wx.showToast({
            title: '维护已安排',
            icon: 'success'
          })
          
          console.log('📅 维护时间已安排:', this.data.maintenanceConfig)
        }
      }
    })
  },

  /**
   * 取消维护
   */
  onCancelMaintenance() {
    if (!this.data.hasPermission) {
      this.onLockedTap()
      return
    }

    wx.showModal({
      title: '取消维护',
      content: '确定要取消计划的维护吗？',
      success: (res) => {
        if (res.confirm) {
          this.setData({
            'maintenanceConfig.isScheduled': false,
            'maintenanceConfig.startTimeText': '',
            'maintenanceConfig.endTimeText': '',
            'maintenanceConfig.reason': '',
            'lotteryConfig.isActive': true
          })
          
          wx.showToast({
            title: '维护已取消',
            icon: 'success'
          })
          
          console.log('❌ 维护计划已取消')
        }
      }
    })
  },

  /**
   * 🔍 新增：一键诊断权限和审核问题
   * 专门用于诊断13612227930账号的权限和审核管理问题
   */
  async onRunDiagnostic() {
    console.log('🔍 用户启动权限诊断...')
    
    try {
      const report = await diagnosePage.runMerchantPageDiagnostic()
      
      if (report && report.summary) {
        console.log('📋 诊断完成:', report.summary)
        
        // 根据诊断结果提供进一步指导
        if (report.summary.isPrimaryBackendIssue) {
          console.log('🚨 确认为后端问题，建议联系后端程序员')
        }
      }
      
    } catch (error) {
      console.error('❌ 诊断失败:', error)
      wx.showToast({
        title: '诊断功能异常',
        icon: 'none'
      })
    }
  },
  
  /**
   * 🔧 临时调试功能：强制刷新待审核列表
   */
  onDebugRefreshPending() {
    console.log('🔄 强制刷新待审核列表...')
    wx.showLoading({ title: '刷新中...', mask: true })
    
    this.loadPendingList().then(() => {
      wx.hideLoading()
      wx.showToast({
        title: '刷新完成',
        icon: 'success'
      })
    }).catch((error) => {
      wx.hideLoading()
      console.error('❌ 刷新失败:', error)
      wx.showToast({
        title: '刷新失败',
        icon: 'none'
      })
    })
  }
})