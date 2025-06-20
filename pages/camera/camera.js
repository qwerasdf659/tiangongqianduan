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
  initPage() {
    console.log('📷 拍照上传页面初始化')
    this.refreshUserInfo()
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
  refreshUserInfo() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      console.log('🔧 使用模拟用户数据')
      this.setData({
        userInfo: app.globalData.mockUser,
        totalPoints: app.globalData.mockUser.total_points
      })
      return Promise.resolve()
    }

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
    
    // 图片验证和压缩
    return validateImage(file.tempFilePath).then(() => {
      return compressImage(file.tempFilePath, 0.8)
    }).then((compressedPath) => {
      const imageData = {
        tempPath: compressedPath,
        originalPath: file.tempFilePath,
        size: file.size
      }
      
      this.setData({
        selectedImage: imageData,
        showImagePreview: true
      })
      
      console.log('✅ 图片处理完成')
    }).catch((error) => {
      console.error('❌ 图片处理失败:', error)
      
      let errorMsg = '图片处理失败'
      if (error.code === 'INVALID_FORMAT') {
        errorMsg = '请选择JPG或PNG格式的图片'
      } else if (error.code === 'SIZE_TOO_LARGE') {
        errorMsg = '图片大小不能超过5MB'
      } else if (error.code === 'COMPRESS_FAILED') {
        errorMsg = '图片压缩失败，请重试'
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'none'
      })
    })
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
   * 提交上传
   * TODO: 后端对接 - 图片上传接口
   * 
   * 对接说明：
   * 接口：POST /api/photo/upload
   * 认证：需要Bearer Token
   * 文件：multipart/form-data格式上传图片
   * 返回：上传结果，包括人工审核获得的积分等
   */
  onSubmitUpload() {
    // 验证是否已选择图片
    if (!this.data.selectedImage) {
      wx.showToast({
        title: '请先选择小票图片',
        icon: 'none'
      })
      return
    }

    // 防止重复提交
    if (this.data.uploading) {
      console.log('正在上传中，跳过重复提交')
      return
    }

    this.setData({ uploading: true })
    wx.showLoading({ title: '上传中...' })

    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境模拟上传过程
      console.log('🔧 模拟图片上传和人工审核过程')
      console.log('📤 上传参数:', {
        imagePath: this.data.selectedImage.tempPath,
        timestamp: new Date().toISOString()
      })
      
      new Promise(resolve => setTimeout(resolve, 2000)).then(() => {
        // 模拟人工审核流程 - 不再有OCR识别
        const estimatedAmount = 50 + Math.random() * 200 // 随机估算消费金额50-250元
        const points = Math.floor(estimatedAmount * 10) // 1元=10积分
        
        const uploadResult = {
          code: 0,
          data: {
            upload_id: 'UP' + Date.now(),
            image_url: this.data.selectedImage.tempPath,
            estimated_amount: estimatedAmount.toFixed(2),
            points_awarded: 0, // 上传时不直接给积分，需要人工审核
            review_status: 'pending',
            review_reason: '已提交人工审核，请等待商家确认消费金额',
            upload_time: new Date().toISOString()
          }
        }
        
        wx.hideLoading()
        
        // 显示上传结果
        this.showUploadResult(uploadResult.data)
        
        // 重置上传状态
        this.setData({
          uploading: false,
          selectedImage: null,
          showImagePreview: false
        })
        
        // 刷新上传记录
        this.loadUploadHistory()
        
        console.log('✅ 模拟上传完成:', uploadResult.data)
      }).catch((error) => {
        wx.hideLoading()
        this.setData({ uploading: false })
        console.error('❌ 模拟上传失败:', error)
        
        wx.showToast({
          title: '上传失败，请重试',
          icon: 'none'
        })
      })
    } else {
      // 生产环境调用真实上传接口
      console.log('📡 请求图片上传接口...')
      
      photoAPI.upload(this.data.selectedImage.tempPath).then((uploadResult) => {
        wx.hideLoading()
        
        if (uploadResult.code === 0) {
          console.log('✅ 图片上传成功:', uploadResult.data)
          
          // 显示上传结果
          this.showUploadResult(uploadResult.data)
          
          // 重置上传状态
          this.setData({
            uploading: false,
            selectedImage: null,
            showImagePreview: false
          })
          
          // 刷新上传记录
          this.loadUploadHistory()
          
        } else {
          throw new Error(uploadResult.msg || '上传失败')
        }
      }).catch((error) => {
        wx.hideLoading()
        this.setData({ uploading: false })
        console.error('❌ 图片上传失败:', error)
        
        let errorMsg = '上传失败，请重试'
        
        // 根据错误码显示不同的错误信息
        switch (error.code) {
          case 1001:
            errorMsg = '图片格式不支持'
            break
          case 1002:
            errorMsg = '图片大小超过限制'
            break
          case 1003:
            errorMsg = '图片内容不清晰'
            break
          case 1004:
            errorMsg = '小票内容需要人工审核'
            break
          case 1005:
            errorMsg = '今日上传次数已达上限'
            break
          default:
            errorMsg = error.msg || error.message || errorMsg
        }
        
        wx.showToast({
          title: errorMsg,
          icon: 'none'
        })
      })
    }
  },

  /**
   * 显示上传结果
   * @param {Object} result 上传结果数据
   */
  showUploadResult(result) {
    const isPending = result.review_status === 'pending'
    
    let title, content
    
    if (isPending) {
      title = '上传成功！'
      content = `小票已成功上传\n预估金额：¥${result.estimated_amount}\n请等待商家人工审核确认消费金额后获得相应积分`
    } else {
      title = '上传成功，等待审核'
      content = `小票已提交审核\n请等待商家确认后获得积分`
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
   * 接口：GET /api/photo/records?page=1&page_size=10&status=all
   * 认证：需要Bearer Token
   * 返回：用户的上传记录列表，包括审核状态、积分等信息
   */
  loadUploadRecords() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境生成模拟记录
      console.log('🔧 生成模拟上传记录')
      const mockRecords = this.generateMockRecords()
      
      new Promise(resolve => setTimeout(resolve, 300)).then(() => {
        this.setData({
          uploadRecords: mockRecords,
          totalRecords: mockRecords.length
        })
        console.log('✅ 上传记录加载成功，共', mockRecords.length, '条记录')
      })
    } else {
      // 生产环境调用真实接口
      console.log('📡 请求上传记录接口...')
      
      return photoAPI.getRecords(1, 10).then((res) => {
        this.setData({
          uploadRecords: res.data.records || [],
          totalRecords: res.data.total || 0
        })
        console.log('✅ 上传记录加载成功，共', res.data.total, '条记录')
      }).catch((error) => {
        console.error('❌ 获取上传记录失败:', error)
        this.setData({
          uploadRecords: [],
          totalRecords: 0
        })
      })
    }
  },

  /**
   * 生成模拟上传记录
   */
  generateMockRecords() {
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
   * TODO: 后端对接 - 上传历史接口
   * 
   * 对接说明：
   * 接口：GET /api/photo/history?limit=5
   * 认证：需要Bearer Token
   * 返回：最近的上传记录，用于首页展示
   */
  loadUploadHistory() {
    if (app.globalData.isDev && !app.globalData.needAuth) {
      // 开发环境使用模拟数据
      const mockHistory = [
        {
          id: 1,
          image_url: 'https://via.placeholder.com/200x300/FF6B35/ffffff?text=小票1',
          amount: 58.50,
          points: 585,
          status: 'approved',
          upload_time: '2024-12-19 14:30:00'
        },
        {
          id: 2,
          image_url: 'https://via.placeholder.com/200x300/4ECDC4/ffffff?text=小票2',
          amount: 23.80,
          points: 238,
          status: 'pending',
          upload_time: '2024-12-19 10:15:00'
        }
      ]
      
      this.setData({ uploadHistory: mockHistory })
      return Promise.resolve()
    } else {
      // 生产环境调用真实接口
      return photoAPI.getRecords().then((res) => {
        this.setData({
          uploadHistory: res.data.list ? res.data.list.slice(0, 5) : []
        })
      }).catch((error) => {
        console.error('❌ 获取上传历史失败:', error)
        this.setData({ uploadHistory: [] })
      })
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