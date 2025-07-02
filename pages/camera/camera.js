// pages/camera/camera.js - 拍照上传页面逻辑
const app = getApp()
const { uploadAPI, userAPI } = require('../../utils/api')
const { validateImage, compressImage, validateAmount, FormValidator, commonRules } = require('../../utils/validate')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 上传表单
    selectedImage: null,
    imagePreview: null,
    expectedPoints: 0,
    
    // 表单验证
    formErrors: {},
    
    // 上传状态
    uploading: false,
    uploadProgress: 0,
    
    // 上传历史
    uploadHistory: [],
    showHistory: false,
    
    // 状态映射
    statusMap: {
      'pending': { text: '待审核', icon: '⏳', color: '#FFC107' },
      'approved': { text: '已通过', icon: '✅', color: '#4CAF50' },
      'rejected': { text: '已拒绝', icon: '❌', color: '#F44336' },
      'processing': { text: '审核中', icon: '🔄', color: '#2196F3' }
    },
    
    // 表单验证器
    formValidator: null
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('拍照上传页面加载')
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
    console.log('拍照上传页面显示')
    this.refreshUserInfo()
    this.loadUploadHistory()
  },

  /**
   * 生命周期函数--监听页面隐藏
   */
  onHide() {
    console.log('拍照上传页面隐藏')
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    console.log('拍照上传页面卸载')
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {

  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {

  },

  /**
   * 初始化页面
   */
  initPage() {
    console.log('📷 拍照上传页面初始化')
    this.refreshUserInfo()
    this.loadUploadHistory()
  },

  /**
   * 刷新用户信息
   * 🔴 后端对接 - 用户信息接口 GET /api/user/info
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
      
      // 🔧 优化：显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取用户信息！\n\n请检查后端API服务状态。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
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
   * 拍照
   */
  onTakePhoto() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera'],
      camera: 'back',
      success: (res) => {
        that.handleImageSelected(res.tempFiles[0])
      },
      fail: (error) => {
        console.error('拍照失败:', error)
        wx.showToast({
          title: '拍照失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 从相册选择
   */
  onChooseImage() {
    const that = this
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        that.handleImageSelected(res.tempFiles[0])
      },
      fail: (error) => {
        console.error('选择图片失败:', error)
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        })
      }
    })
  },

  /**
   * 处理图片选择
   * @param {Object} file 选择的文件对象
   */
  handleImageSelected(file) {
    console.log('🖼️ 处理选择的图片:', file)
    
    // 🔴 v2.1.2图片验证和处理 - 纯人工审核模式
    try {
      // 基础图片验证
      const validation = validateImage(file)
      if (!validation.isValid) {
        wx.showToast({
          title: validation.error,
          icon: 'none',
          duration: 2000
        })
        return
      }
      
      // 设置预览图片
      this.setData({
        selectedImage: file.tempFilePath,
        imagePreview: file.tempFilePath
      })
      
      console.log('✅ 图片选择成功')
      
      // 🔴 v2.1.2提示：需要用户手动输入消费金额
      wx.showModal({
        title: '📋 v2.1.2纯人工审核模式',
        content: '请在下方手动输入您的消费金额，\n商家将人工审核您的小票并确认实际金额。',
        showCancel: false,
        confirmText: '知道了'
      })
      
    } catch (error) {
      console.error('❌ 图片处理失败:', error)
      wx.showToast({
        title: '图片处理失败',
        icon: 'none'
      })
    }
  },

  /**
   * 预览图片
   */
  onPreviewImage() {
    if (this.data.imagePreview) {
      wx.previewImage({
        current: this.data.imagePreview,
        urls: [this.data.imagePreview]
      })
    }
  },

  /**
   * 删除图片
   */
  onDeleteImage() {
    this.setData({
      selectedImage: null,
      imagePreview: null
    })
  },

  /**
   * 🔴 v2.1.2 提交上传 - 纯人工审核模式
   * 后端对接：POST /api/photo/upload
   * 参数：image文件 + amount(用户手动输入的消费金额)
   * 返回：upload_id, 等待人工审核
   */
  onSubmitUpload() {
    // 基础验证
    if (!this.data.selectedImage) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }
    
    // 🔴 v2.1.2 关键验证：用户必须手动输入消费金额
    if (!this.data.userAmount || this.data.userAmount <= 0) {
      wx.showToast({
        title: '请输入消费金额',
        icon: 'none'
      })
      return
    }
    
    // 金额验证
    if (!validateAmount(this.data.userAmount)) {
      wx.showToast({
        title: '金额格式不正确',
        icon: 'none'
      })
      return
    }
    
    console.log('📤 开始提交上传，v2.1.2纯人工审核模式')
    
    this.setData({ uploading: true, uploadProgress: 0 })
    
    // 🔴 v2.1.2上传逻辑：图片+用户输入金额
    uploadAPI.upload(this.data.selectedImage, this.data.userAmount)
      .then((result) => {
        console.log('✅ 上传成功:', result)
        
        this.setData({
          uploading: false,
          uploadProgress: 100
        })
        
        // 显示上传成功结果
        this.showUploadResult(result.data)
        
        // 清空表单
        this.clearForm()
        
        // 刷新上传历史
        this.loadUploadHistory()
        
        // 🔴 v2.1.2成功提示
        wx.showToast({
          title: '提交成功，等待审核',
          icon: 'success',
          duration: 2000
        })
      })
      .catch((error) => {
        console.error('❌ 上传失败:', error)
        
        this.setData({
          uploading: false,
          uploadProgress: 0
        })
        
        // 🔧 优化：显示后端服务异常提示
        wx.showModal({
          title: '🚨 后端服务异常',
          content: `上传失败！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态。`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
      })
  },
  
  /**
   * 🔴 v2.1.2 用户金额输入处理
   */
  onAmountInput(e) {
    const amount = parseFloat(e.detail.value)
    this.setData({ userAmount: amount })
    
    // 计算预期积分 (1元=10积分)
    const expectedPoints = Math.floor(amount * 10)
    this.setData({ expectedPoints })
    
    console.log('💰 用户输入金额:', amount, '预期积分:', expectedPoints)
  },
  
  /**
   * 清空表单
   */
  clearForm() {
    this.setData({
      selectedImage: null,
      imagePreview: null,
      userAmount: 0,
      expectedPoints: 0,
      formErrors: {}
    })
  },

  /**
   * 🔴 v2.1.2 显示上传结果 - 纯人工审核模式
   */
  showUploadResult(result) {
    const { upload_id, image_url, amount, status } = result
    
    wx.showModal({
      title: '📋 上传成功',
      content: `上传ID：${upload_id}\n消费金额：￥${amount}\n当前状态：等待人工审核\n\n商家将查看您的小票照片并确认实际消费金额，请耐心等待审核结果。`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 v2.1.2 加载上传历史记录 - 纯人工审核模式
   * 后端对接：GET /api/photo/history
   * 参数：limit, status
   * 返回：上传历史列表，包含审核状态和结果
   */
  loadUploadHistory() {
    console.log('📋 加载上传历史记录...')
    
    uploadAPI.getRecords(1, 10, 'all')
      .then((res) => {
        console.log('✅ 上传历史加载成功:', res.data)
        
        const records = res.data.list || []
        
        // 🔴 v2.1.2数据处理：纯人工审核模式字段映射
        const processedRecords = records.map(record => ({
          ...record,
          // 确保状态映射正确
          statusInfo: this.data.statusMap[record.status] || {
            text: '未知状态',
            icon: '❓',
            color: '#666'
          },
          // 格式化时间显示
          upload_time_formatted: this.formatTime(record.created_at),
          review_time_formatted: record.review_time ? this.formatTime(record.review_time) : '未审核'
        }))
        
        this.setData({
          uploadHistory: processedRecords
        })
        
        console.log('✅ 上传历史处理完成，记录数:', processedRecords.length)
      })
      .catch((error) => {
        console.error('❌ 加载上传历史失败:', error)
        
        // 🔧 优化：显示后端服务异常提示
        wx.showModal({
          title: '🚨 后端服务异常',
          content: `无法获取上传历史！\n\n错误信息：${error.msg || error.message || '未知错误'}\n\n请检查后端API服务状态。`,
          showCancel: false,
          confirmText: '知道了',
          confirmColor: '#ff4444'
        })
        
        // 设置安全的默认值
        this.setData({
          uploadHistory: []
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
   * 切换历史记录显示
   */
  onToggleHistory() {
    this.setData({
      showHistory: !this.data.showHistory
    })
  },

  /**
   * 预览历史图片
   */
  onPreviewHistoryImage(e) {
    const url = e.currentTarget.dataset.url
    wx.previewImage({
      current: url,
      urls: [url]
    })
  },

  /**
   * 查看上传详情
   */
  onViewUploadDetail(e) {
    const item = e.currentTarget.dataset.item
    wx.showModal({
      title: '上传详情',
      content: `小票ID：${item.id}\n审核金额：¥${item.amount}\n获得积分：${item.points_awarded}分\n状态：${this.data.statusMap[item.status].text}\n上传时间：${item.created_at}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '拍照赚积分，快来试试！',
      path: '/pages/camera/camera'
    }
  }
})