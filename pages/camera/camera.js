// pages/camera/camera.js - 拍照上传页面逻辑
const app = getApp()
const { photoAPI, mockRequest } = require('../../utils/api')
const { validateImage, compressImage, validateAmount, FormValidator, commonRules } = require('../../utils/validate')

Page({

  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 上传状态
    uploading: false,
    uploadProgress: 0,
    
    // 拍照/选择图片
    selectedImage: null,
    imagePreview: null,
    
    // 消费金额
    consumeAmount: '',
    expectedPoints: 0,
    
    // 表单验证
    formValidator: null,
    formErrors: {},
    
    // 上传历史
    uploadHistory: [],
    showHistory: false,
    
    // 审核状态说明
    statusMap: {
      'pending': { text: '审核中', color: '#ff9800', icon: '⏳' },
      'approved': { text: '已通过', color: '#4caf50', icon: '✅' },
      'rejected': { text: '已拒绝', color: '#f44336', icon: '❌' }
    }
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
  async initPage() {
    // 初始化用户信息
    this.setData({
      userInfo: app.globalData.userInfo || app.globalData.mockUser,
      totalPoints: app.globalData.userInfo?.total_points || app.globalData.mockUser.total_points
    })

    // 初始化表单验证器
    const validator = new FormValidator()
    validator.addRule('amount', commonRules.required)
    validator.addRule('amount', commonRules.amount)
    validator.addRule('amount', commonRules.min(1))
    validator.addRule('amount', commonRules.max(9999))
    
    this.data.formValidator = validator
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
   */
  async handleImageSelected(file) {
    console.log('选择的图片:', file)
    
    try {
      // 验证图片
      await validateImage(file.tempFilePath)
      
      // 压缩图片
      const compressedPath = await compressImage(file.tempFilePath, 0.8)
      
      this.setData({
        selectedImage: compressedPath,
        imagePreview: compressedPath
      })

      wx.showToast({
        title: '图片选择成功',
        icon: 'success'
      })
      
    } catch (error) {
      console.error('图片处理失败:', error)
      wx.showToast({
        title: error.msg || '图片处理失败',
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
   * 删除选择的图片
   */
  onDeleteImage() {
    this.setData({
      selectedImage: null,
      imagePreview: null
    })
  },

  /**
   * 输入消费金额
   */
  onAmountInput(e) {
    const amount = e.detail.value
    this.setData({
      consumeAmount: amount,
      expectedPoints: amount ? Math.floor(parseFloat(amount) * 10) : 0
    })

    // 实时验证
    this.validateAmount(amount)
  },

  /**
   * 验证金额
   */
  validateAmount(amount) {
    const isValid = this.data.formValidator.validateField('amount', amount)
    const errors = this.data.formValidator.getErrors()
    
    this.setData({
      formErrors: errors
    })
    
    return isValid
  },

  /**
   * 提交上传
   */
  async onSubmitUpload() {
    // 验证图片
    if (!this.data.selectedImage) {
      wx.showToast({
        title: '请先拍照或选择图片',
        icon: 'none'
      })
      return
    }

    // 验证金额
    if (!this.validateAmount(this.data.consumeAmount)) {
      const firstError = this.data.formValidator.getFirstError()
      wx.showToast({
        title: firstError || '请输入正确的消费金额',
        icon: 'none'
      })
      return
    }

    // 二次确认
    const confirmResult = await this.showConfirmDialog()
    if (!confirmResult) return

    this.setData({ uploading: true, uploadProgress: 0 })

    try {
      let uploadResult

      if (app.globalData.isDev) {
        // 开发环境模拟上传
        uploadResult = await this.mockUpload()
      } else {
        // TODO: 对接真实上传接口
        uploadResult = await photoAPI.upload(this.data.selectedImage, this.data.consumeAmount)
      }

      // 上传成功
      wx.showToast({
        title: '上传成功，等待审核',
        icon: 'success'
      })

      // 重置表单
      this.resetForm()

      // 刷新上传历史
      this.loadUploadHistory()

      // 发送上传成功统计事件
      wx.reportAnalytics('photo_upload_success', {
        amount: parseFloat(this.data.consumeAmount),
        expected_points: this.data.expectedPoints
      })

    } catch (error) {
      console.error('上传失败:', error)
      wx.showToast({
        title: error.msg || '上传失败',
        icon: 'none'
      })
    } finally {
      this.setData({ uploading: false, uploadProgress: 0 })
    }
  },

  /**
   * 显示确认对话框
   */
  showConfirmDialog() {
    return new Promise((resolve) => {
      wx.showModal({
        title: '确认上传',
        content: `消费金额：${this.data.consumeAmount}元\n预计积分：${this.data.expectedPoints}分\n\n上传后将进入审核流程`,
        confirmText: '确认上传',
        cancelText: '取消',
        success: (res) => {
          resolve(res.confirm)
        }
      })
    })
  },

  /**
   * 模拟上传（开发环境）
   */
  mockUpload() {
    return new Promise((resolve) => {
      let progress = 0
      const interval = setInterval(() => {
        progress += 20
        this.setData({ uploadProgress: progress })
        
        if (progress >= 100) {
          clearInterval(interval)
          setTimeout(() => {
            resolve({
              code: 0,
              msg: '上传成功',
              data: {
                upload_id: Date.now(),
                image_url: this.data.selectedImage,
                points_awarded: this.data.expectedPoints,
                status: 'pending'
              }
            })
          }, 500)
        }
      }, 200)
    })
  },

  /**
   * 重置表单
   */
  resetForm() {
    this.setData({
      selectedImage: null,
      imagePreview: null,
      consumeAmount: '',
      expectedPoints: 0,
      formErrors: {}
    })
  },

  /**
   * 加载上传历史
   */
  async loadUploadHistory() {
    try {
      let historyData

      if (app.globalData.isDev) {
        // 开发环境模拟数据
        historyData = this.generateMockHistory()
      } else {
        // TODO: 对接真实上传记录接口
        const res = await photoAPI.getRecords()
        historyData = res.data.list
      }

      this.setData({
        uploadHistory: historyData
      })

    } catch (error) {
      console.error('加载上传历史失败:', error)
    }
  },

  /**
   * 生成模拟历史数据
   */
  generateMockHistory() {
    const statuses = ['pending', 'approved', 'rejected']
    return Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      image_url: `https://via.placeholder.com/200x200/9C27B0/ffffff?text=小票${i + 1}`,
      amount: (50 + i * 20).toFixed(2),
      points_awarded: (50 + i * 20) * 10,
      status: statuses[i % 3],
      created_at: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toLocaleDateString(),
      reviewed_at: i % 3 === 0 ? null : new Date(Date.now() - i * 12 * 60 * 60 * 1000).toLocaleDateString()
    }))
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
    wx.navigateTo({
      url: `/pages/upload/upload-detail?id=${item.id}`
    })
  },

  /**
   * 分享功能
   */
  onShareAppMessage() {
    return {
      title: '拍照上传小票，轻松获取积分！',
      path: '/pages/camera/camera',
      imageUrl: '/images/share-camera.jpg'
    }
  }
})