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
    
    // 上传表单
    selectedImage: null,
    imagePreview: null,
    consumeAmount: '',
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
  async initPage() {
    // 初始化用户信息
    const userInfo = app.globalData.userInfo || app.globalData.mockUser || {
      user_id: 1001,
      phone: '138****8000',
      total_points: 1500,
      is_merchant: false,
      nickname: '测试用户'
    }
    
    this.setData({
      userInfo: userInfo,
      totalPoints: userInfo.total_points || 1500
    })

    // 初始化表单验证器
    const validator = new FormValidator()
    validator.addRule('amount', commonRules.required)
    validator.addRule('amount', commonRules.amount)
    validator.addRule('amount', commonRules.min(1))
    validator.addRule('amount', commonRules.max(9999))
    
    this.data.formValidator = validator
    
    // 初始化上传历史
    this.loadUploadHistory()
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
   * 上传照片
   * TODO: 后端对接 - 图片上传和识别接口
   * 
   * 对接说明：
   * 接口：POST /api/photo/upload (multipart/form-data)
   * 请求体：file=图片文件, amount=用户输入金额
   * 认证：需要Bearer Token
   * 返回：上传结果，包括AI识别金额、匹配状态、获得积分等
   */
  async onSubmitUpload() {
    // 验证表单
    if (!this.data.selectedImage) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }

    if (!this.data.consumeAmount || parseFloat(this.data.consumeAmount) <= 0) {
      wx.showToast({
        title: '请输入正确的消费金额',
        icon: 'none'
      })
      return
    }

    // 防止重复提交
    if (this.data.uploading) return
    this.setData({ uploading: true })

    try {
      const amount = parseFloat(this.data.consumeAmount)
      
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟上传
        console.log('🔧 模拟图片上传和识别，金额:', amount)
        wx.showLoading({ title: '上传识别中...' })
        
        // 模拟上传和识别过程
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // 模拟识别结果
        const recognizedAmount = amount + (Math.random() - 0.5) * 5 // 模拟识别误差
        const matchStatus = Math.abs(recognizedAmount - amount) <= 2 ? 'matched' : 'mismatched'
        const pointsEarned = Math.floor(amount * 10) // 1元=10积分
        
        const uploadResult = {
          code: 0,
          msg: '上传成功',
          data: {
            upload_id: 'UP' + Date.now(),
            image_url: this.data.selectedImage,
            recognized_amount: recognizedAmount.toFixed(2),
            input_amount: amount.toFixed(2),
            match_status: matchStatus,
            points_earned: pointsEarned,
            review_status: matchStatus === 'matched' ? 'auto_approved' : 'pending',
            upload_time: new Date().toLocaleString()
          }
        }
        
        wx.hideLoading()
        this.showUploadResult(uploadResult.data)
        
        // 更新用户积分（仅自动通过的情况）
        if (uploadResult.data.review_status === 'auto_approved') {
          const newPoints = this.data.totalPoints + pointsEarned
          this.setData({ totalPoints: newPoints })
          
          if (app.globalData.mockUser) {
            app.globalData.mockUser.total_points = newPoints
          }
        }
        
        console.log('✅ 模拟上传完成，识别金额:', recognizedAmount.toFixed(2))
        
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求图片上传接口，金额:', amount)
        
        const uploadResult = await photoAPI.upload(this.data.selectedImage, amount)
        
        this.showUploadResult(uploadResult.data)
        
        // 更新用户积分
        if (uploadResult.data.review_status === 'auto_approved') {
          this.setData({
            totalPoints: this.data.totalPoints + uploadResult.data.points_earned
          })
          
          // 更新全局用户信息
          if (app.globalData.userInfo) {
            app.globalData.userInfo.total_points += uploadResult.data.points_earned
          }
        }
        
        console.log('✅ 图片上传成功，识别金额:', uploadResult.data.recognized_amount)
      }

      // 重置表单
      this.setData({
        selectedImage: null,
        imagePreview: null,
        consumeAmount: '',
        expectedPoints: 0
      })

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 图片上传失败:', error)
      
      let errorMsg = '上传失败，请重试'
      
      // 根据错误码显示不同的错误信息
      switch (error.code) {
        case 1001:
          errorMsg = '图片格式不支持'
          break
        case 1002:
          errorMsg = '图片太大，请选择小于5MB的图片'
          break
        case 1003:
          errorMsg = '图片识别失败，请重新拍照'
          break
        case 1004:
          errorMsg = '今日上传次数已达上限'
          break
        default:
          errorMsg = error.msg || error.message || errorMsg
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      })
      
    } finally {
      this.setData({ uploading: false })
    }
  },

  /**
   * 显示上传结果
   * @param {Object} result 上传结果数据
   */
  showUploadResult(result) {
    const isMatched = result.match_status === 'matched'
    const isAutoApproved = result.review_status === 'auto_approved'
    
    let title, content
    
    if (isAutoApproved) {
      title = '上传成功！'
      content = `识别金额：¥${result.recognized_amount}\n获得积分：${result.points_earned}分\n已自动通过审核`
    } else {
      title = '上传成功，等待审核'
      content = `识别金额：¥${result.recognized_amount}\n输入金额：¥${result.input_amount}\n${isMatched ? '金额匹配，等待商家审核' : '金额不匹配，需要人工审核'}`
    }
    
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '确定',
      success: () => {
        // 可以跳转到上传记录页面
        // wx.navigateTo({
        //   url: '/pages/records/upload-records'
        // })
      }
    })
  },

  /**
   * 加载上传记录
   * TODO: 后端对接 - 上传记录接口
   * 
   * 对接说明：
   * 接口：GET /api/photo/records?page=1&page_size=20
   * 认证：需要Bearer Token
   * 返回：用户的上传记录列表，包括审核状态等
   */
  async loadUploadRecords() {
    try {
      let recordsData

      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境使用模拟数据
        console.log('🔧 生成模拟上传记录数据')
        recordsData = {
          code: 0,
          data: {
            list: this.generateMockUploadRecords(),
            total: 10,
            page: 1,
            page_size: 20
          }
        }
        await new Promise(resolve => setTimeout(resolve, 300))
      } else {
        // 生产环境调用真实接口
        console.log('📡 请求上传记录接口...')
        recordsData = await photoAPI.getRecords(1, 10)
      }

      this.setData({
        uploadRecords: recordsData.data.list
      })
      
      console.log('✅ 上传记录加载成功，共', recordsData.data.list.length, '条记录')

    } catch (error) {
      console.error('❌ 获取上传记录失败:', error)
      this.setData({ uploadRecords: [] })
    }
  },

  /**
   * 生成模拟上传记录
   */
  generateMockUploadRecords() {
    const statuses = ['approved', 'pending', 'rejected']
    const statusTexts = { approved: '已通过', pending: '待审核', rejected: '已拒绝' }
    
    return Array.from({ length: 5 }, (_, i) => {
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      const amount = (Math.random() * 200 + 20).toFixed(2)
      
      return {
        id: i + 1,
        upload_id: 'UP' + (Date.now() - i * 86400000),
        image_url: `https://via.placeholder.com/300x400/f44336/ffffff?text=小票${i + 1}`,
        amount: parseFloat(amount),
        points_earned: status === 'approved' ? Math.floor(amount * 10) : 0,
        review_status: status,
        status_text: statusTexts[status],
        upload_time: new Date(Date.now() - i * 86400000).toLocaleDateString(),
        review_time: status !== 'pending' ? new Date(Date.now() - i * 86400000 + 3600000).toLocaleDateString() : null
      }
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