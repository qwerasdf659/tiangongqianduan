// pages/camera/camera.js - 拍照页面逻辑
const app = getApp()
const { photoAPI, userAPI, uploadAPI } = require('../../utils/api')
const { throttle } = require('../../utils/validate')
const { loadingManager } = require('../../utils/loading-manager')

// 🔧 修复：改进图片质量设置
const PHOTO_QUALITY = 80 // 设置为80%，平衡质量和大小

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    totalPoints: 0,
    
    // 🔴 权限简化v2.2.0：简化上传表单，删除金额相关字段
    selectedImage: null,
    imagePreview: null,
    // 删除：expectedPoints（因为用户不再输入金额）
    
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
    console.log('拍照上传页面加载 - 权限简化版v2.2.0')
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
    console.log('拍照上传页面显示 - 权限简化版v2.2.0')
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
    console.log('📷 拍照上传页面初始化 - 权限简化版v2.2.0')
    this.refreshUserInfo()
    this.loadUploadHistory()
  },

  /**
   * 刷新用户信息 - 修复字段映射问题
   * 🔴 后端对接 - 用户信息接口 GET /api/user/info
   * 认证：需要Bearer Token
   * 返回：用户详细信息，主要获取最新的积分余额
   */
  refreshUserInfo() {
    console.log('📡 刷新用户信息...')
    return userAPI.getUserInfo().then((res) => {
      console.log('🔍 相机页面原始用户数据:', res.data)
      
      const rawUserInfo = res.data
      
      // 🔧 关键修复：统一字段映射 - 将后端数据格式转换为前端期待格式
      const mappedUserInfo = {
        // 🔴 基础字段映射
        user_id: rawUserInfo.user_id || rawUserInfo.id || 'unknown',
        mobile: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
        nickname: rawUserInfo.nickname || rawUserInfo.nickName || rawUserInfo.name || '用户',
        total_points: parseInt(rawUserInfo.total_points || rawUserInfo.totalPoints || rawUserInfo.points || 0),
        
        // 🔴 头像字段映射
        avatar_url: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
        avatar: rawUserInfo.avatar_url || rawUserInfo.avatarUrl || rawUserInfo.avatar || '/images/default-avatar.png',
        
        // 🔴 兼容字段
        phone: rawUserInfo.mobile || rawUserInfo.phone || rawUserInfo.phone_number || '未知',
        
        // 🔴 权限字段映射
        is_admin: Boolean(rawUserInfo.is_admin || rawUserInfo.isAdmin || false)
      }
      
      console.log('🔧 相机页面字段映射结果:', {
        原始: rawUserInfo,
        映射后: mappedUserInfo
      })
      
      this.setData({
        userInfo: mappedUserInfo,
        totalPoints: mappedUserInfo.total_points
      })
      
      // 更新全局用户信息
      app.globalData.userInfo = mappedUserInfo
      console.log('✅ 用户信息刷新成功，当前积分:', mappedUserInfo.total_points)
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
    
    // 🔧 修复：检查file对象结构
    if (!file || !file.tempFilePath) {
      console.error('❌ 文件对象无效:', file)
      wx.showToast({
        title: '选择的文件无效',
        icon: 'none',
        duration: 2000
      })
      return
    }
    
    // 🔴 v2.2.0权限简化：纯人工审核模式，用户只需上传照片
    console.log('🔧 开始验证图片:', file.tempFilePath)
    
    // 🔧 修复：正确使用Promise调用validateImage
    validateImage(file.tempFilePath)
      .then((imageInfo) => {
        console.log('✅ 图片验证成功:', imageInfo)
        
        // 设置预览图片
        this.setData({
          selectedImage: file.tempFilePath,
          imagePreview: file.tempFilePath
        })
        
        console.log('✅ 图片选择成功，用户可直接提交审核')
      })
      .catch((error) => {
        console.error('❌ 图片验证失败:', error)
        wx.showToast({
          title: error.msg || '图片验证失败',
          icon: 'none',
          duration: 2000
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
   * 🔴 权限简化v2.2.0：简化提交上传逻辑
   * 后端对接：POST /api/photo/upload
   * 参数：仅需要image文件，不需要amount参数
   * 返回：upload_id, 等待管理员审核并设置消费金额
   */
  onSubmitUpload() {
    // 🔧 修复：增强基础验证
    if (!this.data.selectedImage) {
      wx.showToast({
        title: '请先选择图片',
        icon: 'none'
      })
      return
    }
    
    // 🔧 修复：检查用户登录状态
    if (!app.globalData.accessToken) {
      wx.showModal({
        title: '🚨 请先登录',
        content: '您还未登录，请先登录后再上传图片！',
        showCancel: true,
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/auth/auth'
            })
          }
        }
      })
      return
    }
    
    // 🔧 修复：检查网络状态
    wx.getNetworkType({
      success: (res) => {
        if (res.networkType === 'none') {
          wx.showModal({
            title: '🚨 网络错误',
            content: '当前无网络连接，请检查网络设置！',
            showCancel: false
          })
          return
        }
        
        // 网络正常，继续上传
        this.performSimplifiedUpload()
      },
      fail: () => {
        // 获取网络状态失败，但仍尝试上传
        this.performSimplifiedUpload()
      }
    })
  },

  /**
   * 🔴 权限简化v2.2.0：执行简化上传操作
   */
  performSimplifiedUpload() {
    console.log('📤 开始简化上传流程 - 仅上传照片，管理员审核时设置金额')
    
    this.setData({ uploading: true, uploadProgress: 0 })
    
    console.log('📤 准备调用简化上传API:', {
      selectedImage: this.data.selectedImage,
      用户信息: this.data.userInfo ? '已获取' : '未获取',
      全局配置: {
        baseUrl: app.globalData.baseUrl,
        hasToken: !!app.globalData.accessToken
      }
    })
    
    // 🔴 权限简化：调用简化上传API，不传递金额参数
    uploadAPI.uploadSimplified(this.data.selectedImage)
      .then((result) => {
        console.log('✅ 简化上传成功:', result)
        
        this.setData({
          uploading: false,
          uploadProgress: 100
        })
        
        // 显示上传成功结果
        this.showSimplifiedUploadResult(result.data)
        
        // 清空表单
        this.clearForm()
        
        // 刷新上传历史
        this.loadUploadHistory()
        
        // 刷新用户信息（可能积分有变化）
        this.refreshUserInfo()
        
        // 🔧 修复：成功提示
        wx.showToast({
          title: '提交成功，等待审核',
          icon: 'success',
          duration: 2000
        })
      })
      .catch((error) => {
        console.error('❌ 简化上传失败:', error)
        
        this.setData({
          uploading: false,
          uploadProgress: 0
        })
        
        // 🔧 修复：详细的错误处理和用户指导
        this.handleUploadError(error)
      })
  },

  /**
   * 🔧 修复：处理上传错误
   */
  handleUploadError(error) {
    console.error('📊 上传错误详情:', error)
    
    let errorTitle = '🚨 上传失败'
    let errorContent = '上传失败，请重试'
    let showRetry = true
    
    // 🔧 修复：根据错误类型提供不同的处理方案
    if (error.isNetworkError) {
      errorTitle = '🚨 网络错误'
      errorContent = `网络连接失败！\n\n错误详情：${error.errMsg || '未知网络错误'}\n\n请检查：\n1. 网络连接是否正常\n2. 服务器是否可访问\n3. 稍后重试`
      
      if (error.uploadUrl) {
        errorContent += `\n\n上传地址：${error.uploadUrl}`
      }
    } else if (error.isBusinessError) {
      errorTitle = '🚨 业务错误'
      
      if (error.code === 1002) {
        errorContent = '系统错误：消费金额参数异常\n\n这可能是系统配置问题，请联系技术支持！'
        showRetry = false
      } else if (error.code === 1003) {
        errorContent = '系统错误：消费金额超出范围\n\n这可能是系统配置问题，请联系技术支持！'
        showRetry = false
      } else if (error.code === 1004) {
        errorContent = '系统配置错误：API地址未设置\n\n这是系统配置问题，请联系技术支持！'
        showRetry = false
      } else if (error.code === 1005) {
        errorContent = '用户未登录，请先登录！'
        showRetry = false
        
        // 直接跳转到登录页
        setTimeout(() => {
          wx.navigateTo({
            url: '/pages/auth/auth'
          })
        }, 1500)
      } else if (error.msg) {
        errorContent = error.msg
      } else {
        errorContent = `业务错误：${error.code || '未知错误'}`
      }
    } else if (error.code === 1001) {
      errorTitle = '🚨 参数错误'
      errorContent = '文件路径不能为空\n\n这可能是程序bug，请重新选择图片！'
    } else {
      // 其他未知错误
      errorContent = `未知错误：${error.msg || error.message || '请重试'}\n\n错误码：${error.code || '未知'}`
    }
    
    // 🔧 修复：显示错误对话框
    wx.showModal({
      title: errorTitle,
      content: errorContent,
      showCancel: showRetry,
      cancelText: showRetry ? '重试' : '取消',
      confirmText: '知道了',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.cancel && showRetry) {
          // 用户选择重试
          this.onSubmitUpload()
        }
      }
    })
  },

  /**
   * 🔧 修复：清空表单
   */
  clearForm() {
    this.setData({
      selectedImage: null,
      imagePreview: null,
      formErrors: {}
      // 删除：expectedPoints 相关字段
    })
  },
  
  /**
   * 🔴 权限简化v2.2.0：显示简化上传结果
   */
  showSimplifiedUploadResult(result) {
    const { upload_id, image_url, status } = result
    
    // 🔴 权限简化：说明管理员将设置消费金额
    let content = `上传ID：${upload_id}\n当前状态：等待管理员审核\n\n管理员将查看您的小票照片并设置实际消费金额，审核通过后您将获得相应积分奖励。\n\n积分规则：消费金额 × 10 = 获得积分`
    
    wx.showModal({
      title: '📋 照片上传成功',
      content: content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 加载上传历史记录 - 必须从后端API获取
   * 接口：GET /api/photo/history?page=1&limit=10&status=all
   * 认证：需要Bearer Token
   * 返回：用户的上传历史记录列表
   */
  loadUploadHistory() {
    console.log('📡 加载上传历史记录...')
    
    return uploadAPI.getHistory(1, 10, 'all').then((res) => {
      console.log('✅ 上传历史记录API响应:', res)
      
      if (res.code === 0 && res.data && res.data.records) {
        this.setData({
          uploadHistory: res.data.records
        })
        console.log('✅ 上传历史记录加载成功，共', res.data.records.length, '条记录')
      } else {
        console.warn('⚠️ 上传历史记录数据为空')
        this.setData({
          uploadHistory: []
        })
      }
    }).catch((error) => {
      console.error('❌ 加载上传历史失败:', error)
      
      // 🔧 增强：Token问题的智能处理
      if (error.code === 2001 || error.code === 401 || error.needsRelogin) {
        console.log('🔧 检测到Token问题，启动修复流程...')
        this.handleTokenError(error)
      } else {
        // 🔴 其他错误，后端服务异常已在API层处理
        this.setData({
          uploadHistory: []
        })
      }
    })
  },

  /**
   * 🔧 处理Token错误
   */
  async handleTokenError(error) {
    console.log('🔧 处理Token错误:', error)
    
    try {
      const repairResult = await TokenRepair.showRepairDialog()
      
      if (repairResult.success) {
        // Token修复成功，重新加载数据
        console.log('✅ Token修复成功，重新加载数据')
        this.loadUploadHistory()
        this.refreshUserInfo()
      }
    } catch (repairError) {
      console.error('❌ Token修复失败:', repairError)
      
      wx.showModal({
        title: '登录状态异常',
        content: '检测到登录状态异常，请重新登录以查看上传记录',
        showCancel: false,
        confirmText: '重新登录',
        success: () => {
          wx.reLaunch({
            url: '/pages/auth/auth'
          })
        }
      })
    }
  },

  /**
   * 🔴 WebSocket状态监听 - 实时接收审核结果推送
   * 符合最新产品功能要求：实时通知用户审核结果
   */
  onWebSocketMessage(eventName, data) {
    console.log('📢 拍照上传页面收到WebSocket消息:', eventName, data)
    
    switch (eventName) {
      case 'reviewCompleted':
        // 审核完成通知
        if (data.user_id === this.data.userInfo.user_id) {
          console.log('✅ 收到审核完成通知:', data)
          
          // 刷新上传历史
          this.loadUploadHistory()
          
          // 刷新用户积分
          this.refreshUserInfo()
          
          // 显示审核结果通知
          const statusText = data.status === 'approved' ? '已通过' : '已拒绝'
          const statusIcon = data.status === 'approved' ? '✅' : '❌'
          
          wx.showModal({
            title: `${statusIcon} 审核完成`,
            content: `您的照片审核${statusText}！\n\n${data.status === 'approved' ? `获得积分：${data.points_awarded}` : `拒绝原因：${data.review_reason || '未提供原因'}`}`,
            showCancel: false,
            confirmText: '知道了'
          })
        }
        break
        
      case 'pointsUpdated':
        // 积分更新通知
        if (data.user_id === this.data.userInfo.user_id) {
          console.log('💰 收到积分更新通知:', data)
          this.setData({
            totalPoints: data.points
          })
          
          // 更新全局积分
          if (app.globalData.userInfo) {
            app.globalData.userInfo.total_points = data.points
          }
        }
        break
        
      default:
        console.log('📝 未处理的WebSocket事件:', eventName, data)
    }
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
  },


})