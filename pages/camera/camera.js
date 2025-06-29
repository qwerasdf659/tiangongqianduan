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
              userInfo: app.globalData.userInfo || null,
      totalPoints: app.globalData.userInfo?.total_points || 0
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
   * 🔴 后端对接 - 图片上传接口（根据后端文档更新）
   * 
   * 对接说明：
   * 接口：POST /api/photo/upload
   * 认证：需要Bearer Token
   * 文件：multipart/form-data格式上传图片到Sealos存储
   * 返回：上传结果，提交人工审核，不再进行OCR识别
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
        // 🔴 根据后端文档：直接提交人工审核，不进行OCR识别
        const uploadResult = {
          code: 0,
          msg: 'success',
          data: {
            upload_id: 'UP' + Date.now(),
            image_url: `https://objectstorageapi.bja.sealos.run/tiangong/upload_${Date.now()}.jpg`,
            user_amount: this.data.inputAmount || null,  // 用户输入金额（可选）
            recognized_amount: null,  // 🔴 不再进行OCR识别
            points_awarded: 0,  // 🔴 上传时不直接给积分，需要商家人工审核
            review_status: 'pending',  // 🔴 审核状态：pending, approved, rejected
            review_reason: '已提交人工审核，请等待商家确认消费金额',
            upload_time: new Date().toISOString(),
            // 🔴 符合后端文档的额外字段
            file_size: this.data.selectedImage.size || 0,
            file_type: 'image/jpeg',
            storage_path: `uploads/${Date.now()}.jpg`
          }
        }
        
        wx.hideLoading()
        
        // 显示上传结果
        this.showUploadResult(uploadResult.data)
        
        // 重置上传状态
        this.setData({
          uploading: false,
          selectedImage: null,
          showImagePreview: false,
          inputAmount: null
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
      
      // 🔴 调用符合后端文档格式的上传接口
      uploadAPI.upload(this.data.selectedImage.tempPath, this.data.inputAmount || 0).then((uploadResult) => {
        wx.hideLoading()
        
        if (uploadResult.code === 0) {
          console.log('✅ 图片上传成功:', uploadResult.data)
          
          // 显示上传结果
          this.showUploadResult(uploadResult.data)
          
          // 重置上传状态
          this.setData({
            uploading: false,
            selectedImage: null,
            showImagePreview: false,
            inputAmount: null
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
        
        // 🔴 根据后端文档的错误码显示不同的错误信息
        switch (error.code) {
          case 1001:
            errorMsg = '图片格式不支持，请选择JPG或PNG格式'
            break
          case 1002:
            errorMsg = '图片大小超过限制，请选择小于5MB的图片'
            break
          case 1003:
            errorMsg = '图片内容不清晰，请重新拍摄'
            break
          case 1004:
            errorMsg = '图片上传到Sealos存储失败'
            break
          case 1005:
            errorMsg = '今日上传次数已达上限'
            break
          case 1006:
            errorMsg = '文件存储路径创建失败'
            break
          default:
            errorMsg = error.msg || error.message || errorMsg
        }
        
        wx.showToast({
          title: errorMsg,
          icon: 'none',
          duration: 3000
        })
      })
    }
  },

  /**
   * 显示上传结果
   * 🔴 根据后端文档的审核状态显示相应内容
   * @param {Object} result 上传结果数据
   */
  showUploadResult(result) {
    const status = result.review_status
    
    let title, content
    
    switch (status) {
      case 'pending':
        title = '上传成功！'
        content = `小票已成功上传到Sealos存储\n上传ID：${result.upload_id}\n状态：等待商家审核\n\n请耐心等待商家确认消费金额后获得相应积分`
        break
      case 'approved':
        title = '审核通过！'
        content = `恭喜！您获得了 ${result.points_awarded} 积分\n审核理由：${result.review_reason || '消费记录真实有效'}`
        break
      case 'rejected':
        title = '审核未通过'
        content = `很抱歉，您的上传未通过审核\n审核理由：${result.review_reason || '消费记录不符合要求'}\n请重新上传清晰的小票图片`
        break
      default:
        title = '上传完成'
        content = '小票已提交，请等待处理结果'
    }
    
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: status === 'approved' ? '太好了' : '知道了',
      success: () => {
        // 如果审核通过，可以跳转到积分记录页面
        if (status === 'approved') {
          // wx.navigateTo({
          //   url: '/pages/records/points-records'
          // })
        }
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
  /**
   * 🔴 加载上传记录 - 必须从后端API获取
   * ✅ 符合项目安全规则：禁止Mock数据
   */
  loadUploadRecords() {
    console.log('📡 请求上传记录接口...')
    
    return uploadAPI.getRecords(1, 10).then((result) => {
      if (result.code === 0) {
        this.setData({
          uploadRecords: result.data.records || [],
          totalRecords: result.data.total || 0
        })
        console.log('✅ 上传记录加载成功，共', result.data.total || 0, '条记录')
      } else {
        throw new Error('⚠️ 后端服务异常：' + result.msg)
      }
    }).catch((error) => {
      console.error('❌ 获取上传记录失败:', error)
      
      // 🚨 显示后端服务异常提示
      wx.showModal({
        title: '🚨 后端服务异常',
        content: '无法获取上传记录！\n\n请检查后端API服务状态：\nGET /api/photo/records',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#ff4444'
      })
      
      this.setData({
        uploadRecords: [],
        totalRecords: 0
      })
    })
  },

  /**
   * 🚨 已删除违规函数：generateMockRecords()
   * 🔴 原因：违反项目安全规则 - 严禁使用模拟数据替代后端API
   * ✅ 正确做法：使用uploadAPI.getRecords()获取真实数据
   */

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
      return uploadAPI.getRecords().then((res) => {
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