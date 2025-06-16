// pages/camera/camera.js - 拍照上传页面逻辑
const app = getApp()
const { photoAPI, userAPI, mockRequest } = require('../../utils/api')
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
   * 删除图片
   */
  onDeleteImage() {
    this.setData({
      selectedImage: null,
      imagePreview: null
    })
  },

  /**
   * 上传照片 - 自动识别模式
   * TODO: 后端对接 - 图片上传和识别接口
   * 
   * 对接说明：
   * 接口：POST /api/photo/upload (multipart/form-data)
   * 请求体：file=图片文件（无需用户输入金额）
   * 认证：需要Bearer Token
   * 返回：上传结果，包括AI自动识别金额、获得积分等
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

    // 防止重复提交
    if (this.data.uploading) return
    this.setData({ uploading: true })

    try {
      if (app.globalData.isDev && !app.globalData.needAuth) {
        // 开发环境模拟自动识别上传
        console.log('🔧 模拟图片自动识别上传')
        wx.showLoading({ title: '智能识别中...' })
        
        // 模拟上传和识别过程
        await new Promise(resolve => setTimeout(resolve, 3000))
        
        // 模拟AI自动识别结果
        const recognizedAmount = (Math.random() * 150 + 20).toFixed(2) // 随机生成20-170元
        const pointsEarned = Math.floor(recognizedAmount * 10) // 1元=10积分
        
        const uploadResult = {
          code: 0,
          msg: '识别上传成功',
          data: {
            upload_id: 'UP' + Date.now(),
            image_url: this.data.selectedImage,
            recognized_amount: recognizedAmount,
            points_earned: pointsEarned,
            review_status: 'pending', // 改为待审核状态，需要人工审核
            upload_time: new Date().toLocaleString(),
            confidence: (Math.random() * 0.3 + 0.7).toFixed(2) // 70%-100%识别置信度
          }
        }
        
        wx.hideLoading()
        this.showUploadResult(uploadResult.data)
        
        // 不再自动更新用户积分，需要等待审核通过
        console.log('✅ 模拟识别完成，识别金额:', recognizedAmount, '等待人工审核')
        
      } else {
        // 生产环境调用真实AI识别接口
        console.log('📡 请求AI图片识别接口')
        
        const uploadResult = await photoAPI.uploadAndRecognize(this.data.selectedImage)
        
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
        
        console.log('✅ AI识别上传成功，识别金额:', uploadResult.data.recognized_amount)
      }

      // 重置表单
      this.setData({
        selectedImage: null,
        imagePreview: null,
        expectedPoints: 0
      })

    } catch (error) {
      wx.hideLoading()
      console.error('❌ 图片识别上传失败:', error)
      
      let errorMsg = '识别上传失败，请重试'
      
      // 根据错误码显示不同的错误信息
      switch (error.code) {
        case 1001:
          errorMsg = '图片格式不支持'
          break
        case 1002:
          errorMsg = '图片太大，请选择小于5MB的图片'
          break
        case 1003:
          errorMsg = '小票内容识别失败，请重新拍照'
          break
        case 1004:
          errorMsg = '今日上传次数已达上限'
          break
        case 1005:
          errorMsg = '图片不清晰，请重新拍照'
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
    const isPending = result.review_status === 'pending'
    
    let title, content
    
    if (isAutoApproved) {
      title = '上传成功！'
      content = `识别金额：¥${result.recognized_amount}\n获得积分：${result.points_earned}分\n已自动通过审核`
    } else if (isPending) {
      title = '上传成功，等待审核'
      content = `识别金额：¥${result.recognized_amount}\n预计积分：${result.points_earned}分\n已提交审核，请等待商家人工审核通过后获得积分`
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
    wx.showModal({
      title: '上传详情',
      content: `小票ID：${item.id}\n识别金额：¥${item.amount}\n获得积分：${item.points_awarded}分\n状态：${this.data.statusMap[item.status].text}\n上传时间：${item.created_at}`,
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