// pages/records/upload-records.js - 上传记录页面
const app = getApp()
const { uploadAPI } = require('../../utils/api')
// 🔧 修复：删除对不存在模块的引用，避免模块加载错误
// const UploadRecordsDebug = require('../../utils/upload-records-debug') // 🔧 临时：添加诊断工具
// const UploadStatusDiagnostic = require('../../utils/upload-status-diagnostic') // 🔧 新增：状态筛选诊断工具

Page({
  
  /**
   * 页面的初始数据
   */
  data: {
    // 记录列表
    records: [],
    
    // 分页信息
    currentPage: 1,
    pageSize: 20,
    total: 0,
    hasMore: true,
    
    // 页面状态
    loading: false,
    refreshing: false,
    
    // 筛选条件
    filterStatus: 'all', // all全部/pending待审核/approved已通过/rejected已拒绝
    
    // 统计数据
    statistics: {
      totalCount: 0,
      totalPoints: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('上传记录页面加载')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('📱 上传记录页面显示，开始刷新数据...')
    
    // 🔧 新增：每次显示页面时强制刷新数据，解决缓存问题
    const app = getApp()
    console.log('🔍 当前Token状态:', {
      hasToken: !!app.globalData.accessToken,
      isLoggedIn: app.globalData.isLoggedIn,
      tokenPreview: app.globalData.accessToken ? `${app.globalData.accessToken.substring(0, 20)}...` : null
    })
    
    // 强制刷新数据
    this.refreshData()
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.refreshData()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMoreRecords()
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的上传记录',
      path: '/pages/records/upload-records'
    }
  },

  /**
   * 初始化页面
   */
  initPage() {
    this.setData({ loading: true })
    
    // 🔧 新增：添加强制超时保护，防止后端服务无响应导致无限loading
    const timeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('🚨 后端API服务响应超时！请联系后端程序员检查服务状态。'))
      }, 15000) // 15秒强制超时
    })
    
    const loadDataPromise = Promise.all([
      this.loadRecords(),
      this.loadStatistics()
    ])
    
    // 使用Promise.race确保15秒内必须有响应
    Promise.race([loadDataPromise, timeoutPromise])
      .then(() => {
        this.setData({ loading: false })
      }).catch(error => {
        console.error('❌ 页面初始化失败:', error)
        this.setData({ loading: false })
        
        // 🔧 新增：区分超时错误和其他错误
        if (error.message && error.message.includes('响应超时')) {
          wx.showModal({
            title: '🚨 后端服务异常',
            content: `API响应超时！\n\n🔗 问题接口：/api/photo/history\n🌐 服务器：${getApp().globalData.baseUrl}\n\n这是后端服务问题，请联系后端程序员：\n• 检查服务器状态\n• 检查数据库连接\n• 查看接口日志`,
            showCancel: true,
            cancelText: '稍后重试',
            confirmText: '联系技术',
            confirmColor: '#ff4444',
            success: (res) => {
              if (res.confirm) {
                wx.showModal({
                  title: '📞 联系信息',
                  content: '请将以下信息发送给后端程序员：\n\n❌ API接口：GET /api/photo/history\n🌐 服务器：' + getApp().globalData.baseUrl + '\n⏰ 时间：' + new Date().toLocaleString() + '\n🔍 问题：请求超时无响应',
                  showCancel: false,
                  confirmText: '已复制'
                })
              }
            }
          })
        } else {
          // 其他错误的处理
          wx.showModal({
            title: '❌ 加载失败',
            content: error.message || '页面初始化失败，请检查网络连接',
            showCancel: false,
            confirmText: '知道了'
          })
        }
      })
  },

  /**
   * 刷新数据
   */
  refreshData() {
    console.log('🔄 强制刷新上传记录数据...')
    
    // 🔧 新增：Token状态检查
    const app = getApp()
    if (!app.globalData.accessToken) {
      console.warn('⚠️ 刷新时检测到Token缺失')
      wx.showModal({
        title: '🔑 登录状态异常',
        content: 'Token已丢失，请重新登录获取访问权限。',
        showCancel: false,
        confirmText: '重新登录',
        confirmColor: '#ff4444',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
      return
    }
    
    this.setData({ 
      refreshing: true,
      currentPage: 1,
      hasMore: true,
      records: []  // 🔧 清空现有数据，强制重新获取
    })
    
    // 🔧 新增：添加刷新超时保护
    const refreshTimeoutPromise = new Promise((resolve, reject) => {
      setTimeout(() => {
        reject(new Error('🚨 刷新超时！后端API服务无响应。'))
      }, 20000) // 刷新给20秒超时时间
    })
    
    const refreshDataPromise = Promise.all([
      this.loadRecords(true), // 传递强制刷新参数
      this.loadStatistics()
    ])
    
    // 🔧 修复：添加强制刷新标志，避免缓存问题
    Promise.race([refreshDataPromise, refreshTimeoutPromise])
      .then(() => {
        this.setData({ refreshing: false })
        wx.stopPullDownRefresh()
        console.log('✅ 数据刷新完成')
      }).catch(error => {
        console.error('❌ 刷新数据失败:', error)
        this.setData({ refreshing: false })
        wx.stopPullDownRefresh()
        
        // 🔧 新增：刷新失败时的智能处理
        if (error.message && error.message.includes('刷新超时')) {
          wx.showModal({
            title: '🚨 后端服务异常',
            content: `数据刷新超时！\n\n后端API服务无响应，这不是前端问题。\n\n请联系后端程序员检查：\n• 服务器状态\n• 数据库性能\n• /api/photo/history接口`,
            showCancel: true,
            cancelText: '知道了',
            confirmText: '重试',
            success: (res) => {
              if (res.confirm) {
                // 用户选择重试
                setTimeout(() => {
                  this.refreshData()
                }, 2000)
              }
            }
          })
        } else if (error.code === 2001 || error.needsRelogin) {
          wx.showModal({
            title: '🔑 认证失败',
            content: 'Token已过期，请重新登录以继续使用。',
            showCancel: false,
            confirmText: '重新登录',
            success: () => {
              wx.reLaunch({
                url: '/pages/auth/auth'
              })
            }
          })
        } else {
          wx.showModal({
            title: '❌ 刷新失败',
            content: error.message || '数据刷新失败，请稍后重试',
            showCancel: false,
            confirmText: '知道了'
          })
        }
      })
  },

  /**
   * 🔴 加载上传记录 - 必须从后端API获取
   * 接口：GET /api/photo/records?page=1&page_size=20&status=all
   * 认证：需要Bearer Token
   * 返回：v2.1.2纯人工审核模式的上传记录列表
   */
  loadRecords(forceRefresh = false) {
    console.log('📡 请求上传记录接口...')
    
    // 🔧 修复：使用强制刷新机制，避免缓存问题
    return uploadAPI.getRecords(this.data.currentPage, this.data.pageSize, this.data.filterStatus, forceRefresh).then((res) => {
      if (res.code === 0) {
        // 🔧 修复：支持多种后端数据字段名
        const newRecords = res.data.records || res.data.history || res.data.recent_uploads || res.data.data || []
        
        console.log('📊 后端返回的数据结构:', {
          code: res.code,
          dataKeys: Object.keys(res.data || {}),
          recordsLength: newRecords.length,
          fullData: res.data,
          sampleRecord: newRecords.length > 0 ? newRecords[0] : null
        })
        
        // 🔴 v2.1.2数据处理：纯人工审核模式 - 修复状态显示问题
        const processedRecords = newRecords.map(record => {
          // 🔧 修复：统一状态字段名（兼容多种后端字段格式）
          let status = record.status || record.review_status || record.audit_status || 'pending'
          
          // 🔧 修复：标准化状态值（确保状态值一致性）
          if (typeof status === 'string') {
            status = status.toLowerCase().trim()
          }
          
          // 🔧 修复：状态值映射（处理各种可能的状态值）
          const statusMapping = {
            'pending': 'pending',
            'wait': 'pending',
            'waiting': 'pending',
            'review': 'pending',
            'reviewing': 'pending',
            'approved': 'approved',
            'passed': 'approved',
            'success': 'approved',
            'accept': 'approved',
            'rejected': 'rejected',
            'failed': 'rejected',
            'refuse': 'rejected',
            'deny': 'rejected'
          }
          
          const normalizedStatus = statusMapping[status] || 'pending'
          
          // 🔧 修复：状态文本和样式映射
          const statusInfo = this.getStatusInfo(normalizedStatus)
          
          console.log('🔧 状态处理结果:', {
            原始状态: record.status || record.review_status,
            标准化状态: normalizedStatus,
            显示文本: statusInfo.text,
            样式类: statusInfo.class
          })
          
          return {
            ...record,
            // 🔧 修复：统一状态字段
            status: normalizedStatus,
            original_status: record.status || record.review_status,
            
            // 🔧 修复：时间格式化
            created_at_formatted: this.formatTime(record.created_at || record.upload_time || record.create_time),
            review_time_formatted: record.review_time ? this.formatTime(record.review_time) : null,
            
            // 🔧 修复：状态显示
            status_text: statusInfo.text,
            status_class: statusInfo.class,
            status_icon: statusInfo.icon,
            
            // 🔧 修复：金额显示（兼容多种字段格式）
            amount: record.amount || record.user_amount || record.money || 0,
            amount_display: `￥${record.amount || record.user_amount || record.money || 0}`,
            
            // 🔧 修复：积分显示（兼容多种字段格式）
            points_earned: record.points_earned || record.points_awarded || record.points || 0,
            points_display: (record.points_earned || record.points_awarded || record.points || 0) > 0 
              ? `+${record.points_earned || record.points_awarded || record.points || 0}` 
              : '0',
              
            // 🔧 修复：图片URL处理
            image_url: record.image_url || record.imageUrl || record.photo_url || '',
            
            // 🔧 修复：审核信息
            review_reason: record.review_reason || record.reason || record.note || '',
            reviewer_id: record.reviewer_id || record.reviewer || null
          }
        })
        
        // 🔧 修复：状态筛选验证
        if (this.data.filterStatus !== 'all') {
          const filteredRecords = processedRecords.filter(record => record.status === this.data.filterStatus)
          console.log('📊 状态筛选结果:', {
            筛选条件: this.data.filterStatus,
            原始记录数: processedRecords.length,
            筛选后记录数: filteredRecords.length,
            不符合条件的记录: processedRecords.filter(record => record.status !== this.data.filterStatus).length
          })
        }
        
        this.setData({
          records: this.data.currentPage === 1 ? processedRecords : [...this.data.records, ...processedRecords],
          hasMore: processedRecords.length === this.data.pageSize,
          totalRecords: res.data.total || res.data.total_count || processedRecords.length
        })
        
        console.log('✅ 上传记录加载成功，共', processedRecords.length, '条记录，状态分布:', {
          pending: processedRecords.filter(r => r.status === 'pending').length,
          approved: processedRecords.filter(r => r.status === 'approved').length,
          rejected: processedRecords.filter(r => r.status === 'rejected').length
        })
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取上传记录失败:', error)
      
      // 🔧 优化：显示详细错误信息用于诊断
      const errorInfo = {
        message: error.msg || error.message || '未知错误',
        code: error.code || 'N/A',
        isTokenError: error.code === 2001,
        needsRelogin: error.needsRelogin || false,
        isNetworkError: error.isNetworkError || false
      }
      
      console.log('🔍 错误详情:', errorInfo)
      
      if (errorInfo.isTokenError) {
        wx.showModal({
          title: '🔑 Token认证问题',
          content: `检测到Token认证失败！\n\n错误码：${errorInfo.code}\n错误信息：${errorInfo.message}\n\n建议操作：\n1. 重新登录刷新Token\n2. 清除应用缓存`,
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '重新登录',
          confirmColor: '#ff4444',
          success: (modalRes) => {
            if (modalRes.confirm) {
              wx.reLaunch({
                url: '/pages/auth/auth'
              })
            }
          }
        })
      } else {
        wx.showModal({
          title: '🚨 获取记录失败',
          content: `无法获取上传记录！\n\n错误信息：${errorInfo.message}\n错误码：${errorInfo.code}\n网络错误：${errorInfo.isNetworkError ? '是' : '否'}\n\n请检查网络连接和后端API服务状态。`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
      }
      
      // 设置安全的默认值
      if (this.data.currentPage === 1) {
        this.setData({
          records: [],
          hasMore: false,
          totalRecords: 0
        })
      }
    })
  },

  /**
   * 🔧 修复：获取状态信息（文本、样式、图标）
   */
  getStatusInfo(status) {
    const statusMap = {
      'pending': {
        text: '待审核',
        class: 'status-pending',
        icon: '⏳',
        color: '#FFC107'
      },
      'approved': {
        text: '已通过',
        class: 'status-approved', 
        icon: '✅',
        color: '#4CAF50'
      },
      'rejected': {
        text: '已拒绝',
        class: 'status-rejected',
        icon: '❌', 
        color: '#F44336'
      },
      'processing': {
        text: '审核中',
        class: 'status-processing',
        icon: '🔄',
        color: '#2196F3'
      }
    }
    
    return statusMap[status] || {
      text: '未知状态',
      class: 'status-unknown',
      icon: '❓',
      color: '#757575'
    }
  },

  /**
   * 获取状态文本 - 兼容原有方法
   */
  getStatusText(status) {
    return this.getStatusInfo(status).text
  },

  /**
   * 获取状态样式类 - 兼容原有方法
   */
  getStatusClass(status) {
    return this.getStatusInfo(status).class
  },

  /**
   * 加载更多记录
   */
  loadMoreRecords() {
    if (!this.data.hasMore || this.data.loadingMore) return
    
    this.setData({ 
      loadingMore: true,
      currentPage: this.data.currentPage + 1
    })
    
    this.loadRecords().then(() => {
      this.setData({ loadingMore: false })
    }).catch(error => {
      console.error('❌ 加载更多失败:', error)
      this.setData({ loadingMore: false })
    })
  },

  /**
   * 🔴 加载统计数据 - 必须从后端API获取
   * 接口：GET /api/photo/statistics
   * 认证：需要Bearer Token
   * 返回：用户上传统计信息
   */
  loadStatistics() {
    console.log('📊 请求上传统计接口...')
    
    return uploadAPI.getStatistics().then((res) => {
      if (res.code === 0) {
        // 🔧 修复：兼容多种后端统计数据字段格式
        const statsData = res.data || {}
        
        this.setData({
          statistics: {
            totalCount: statsData.total_uploads || statsData.total_count || statsData.totalUploads || 0,
            totalPoints: statsData.total_points_earned || statsData.total_points || statsData.totalPoints || 0,
            pendingCount: statsData.pending_uploads || statsData.pending_count || statsData.pendingCount || 0,
            approvedCount: statsData.approved_uploads || statsData.approved_count || statsData.approvedCount || 0,
            rejectedCount: statsData.rejected_uploads || statsData.rejected_count || statsData.rejectedCount || 0,
            approvalRate: statsData.approval_rate || statsData.approvalRate || 0
          }
        })
        
        console.log('✅ 统计数据加载成功:', {
          totalCount: this.data.statistics.totalCount,
          approvedCount: this.data.statistics.approvedCount,
          rejectedCount: this.data.statistics.rejectedCount,
          pendingCount: this.data.statistics.pendingCount
        })
      } else {
        throw new Error('⚠️ 后端服务异常：' + res.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取统计数据失败:', error)
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: `无法获取统计数据！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态：\nGET /api/photo/statistics`,
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      // 设置安全的默认值
      this.setData({
        statistics: {
          totalCount: 0,
          totalPoints: 0,
          pendingCount: 0,
          approvedCount: 0,
          rejectedCount: 0,
          approvalRate: 0
        }
      })
    })
  },

  /**
   * 格式化时间显示
   */
  formatTime(timeString) {
    if (!timeString) return '未知时间'
    
    try {
      const date = new Date(timeString)
      return `${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`
    } catch (error) {
      return '时间格式错误'
    }
  },

  /**
   * 筛选状态改变
   */
  onFilterChange(e) {
    const filterStatus = e.currentTarget.dataset.status
    this.setData({ 
      filterStatus,
      currentPage: 1,
      records: []
    })
    this.loadRecords()
  },

  /**
   * 查看详情
   */
  onViewDetail(e) {
    const record = e.currentTarget.dataset.record
    
    let content = `上传时间：${record.created_at}\n小票金额：￥${record.amount}\n审核状态：${record.status_text}`
    
    if (record.review_time) {
      content += `\n审核时间：${record.review_time}`
    }
    
    if (record.review_reason) {
      content += `\n审核说明：${record.review_reason}`
    }
    
    if (record.points_earned > 0) {
      content += `\n获得积分：${record.points_earned}`
    }
    
    wx.showModal({
      title: '上传详情',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 预览图片
   */
  onPreviewImage(e) {
    const imageUrl = e.currentTarget.dataset.image
    wx.previewImage({
      current: imageUrl,
      urls: [imageUrl]
    })
  },

  /**
   * 去上传小票
   */
  onGoToUpload() {
    wx.switchTab({
      url: '/pages/camera/camera'
    })
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack()
  }
}) 