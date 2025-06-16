// pages/settings/settings.js - 设置页面
const app = getApp()

Page({
  
  /**
   * 页面的初始数据
   */
  data: {
    // 用户信息
    userInfo: {},
    
    // 设置项
    settings: {
      // 通知设置
      notifications: {
        lottery: true,    // 抽奖通知
        exchange: true,   // 兑换通知
        points: true,     // 积分变动通知
        system: true      // 系统通知
      },
      
      // 隐私设置
      privacy: {
        showPhone: false,     // 显示手机号
        showActivity: true,   // 显示活动记录
        allowShare: true      // 允许分享
      },
      
      // 其他设置
      others: {
        autoLogin: true,      // 自动登录
        soundEffect: true,    // 音效
        vibration: true,      // 震动反馈
        darkMode: false       // 深色模式
      }
    },
    
    // 缓存信息
    cacheInfo: {
      size: '12.5MB',
      lastClean: '2024-01-10'
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('设置页面加载')
    this.initPage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.loadUserInfo()
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统',
      path: '/pages/user/user'
    }
  },

  /**
   * 初始化页面
   */
  async initPage() {
    this.loadUserInfo()
    this.loadSettings()
    this.calculateCacheSize()
  },

  /**
   * 加载用户信息
   */
  loadUserInfo() {
    this.setData({
      userInfo: app.globalData.userInfo || app.globalData.mockUser
    })
  },

  /**
   * 加载设置信息
   */
  loadSettings() {
    try {
      const savedSettings = wx.getStorageSync('user_settings')
      if (savedSettings) {
        this.setData({
          settings: { ...this.data.settings, ...savedSettings }
        })
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    }
  },

  /**
   * 保存设置
   */
  saveSettings() {
    try {
      wx.setStorageSync('user_settings', this.data.settings)
      console.log('设置保存成功')
    } catch (error) {
      console.error('保存设置失败:', error)
    }
  },

  /**
   * 通知设置改变
   */
  onNotificationChange(e) {
    const { type } = e.currentTarget.dataset
    const value = e.detail.value
    
    this.setData({
      [`settings.notifications.${type}`]: value
    })
    
    this.saveSettings()
    
    wx.showToast({
      title: value ? '已开启通知' : '已关闭通知',
      icon: 'success'
    })
  },

  /**
   * 隐私设置改变
   */
  onPrivacyChange(e) {
    const { type } = e.currentTarget.dataset
    const value = e.detail.value
    
    this.setData({
      [`settings.privacy.${type}`]: value
    })
    
    this.saveSettings()
    
    wx.showToast({
      title: '设置已更新',
      icon: 'success'
    })
  },

  /**
   * 其他设置改变
   */
  onOthersChange(e) {
    const { type } = e.currentTarget.dataset
    const value = e.detail.value
    
    this.setData({
      [`settings.others.${type}`]: value
    })
    
    this.saveSettings()
    
    // 特殊处理
    if (type === 'darkMode') {
      wx.showToast({
        title: value ? '深色模式开启' : '浅色模式开启',
        icon: 'success'
      })
    }
  },

  /**
   * 修改昵称
   */
  onEditNickname() {
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: this.data.userInfo.nickname || '请输入昵称',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.updateNickname(res.content.trim())
        }
      }
    })
  },

  /**
   * 更新昵称
   */
  async updateNickname(nickname) {
    try {
      // TODO: 调用后端接口更新昵称
      // await userAPI.updateUserInfo({ nickname })
      
      // 更新本地数据
      const updatedUserInfo = { ...this.data.userInfo, nickname }
      this.setData({ userInfo: updatedUserInfo })
      app.globalData.userInfo = updatedUserInfo
      
      wx.showToast({
        title: '昵称修改成功',
        icon: 'success'
      })
      
    } catch (error) {
      console.error('修改昵称失败:', error)
      wx.showToast({
        title: '修改失败',
        icon: 'none'
      })
    }
  },

  /**
   * 修改头像
   */
  onEditAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.uploadAvatar(res.tempFilePaths[0])
      }
    })
  },

  /**
   * 上传头像
   */
  async uploadAvatar(filePath) {
    wx.showLoading({ title: '上传中...' })
    
    try {
      // TODO: 调用后端接口上传头像
      // const res = await userAPI.uploadAvatar(filePath)
      
      // 模拟上传成功
      const updatedUserInfo = { ...this.data.userInfo, avatar: filePath }
      this.setData({ userInfo: updatedUserInfo })
      app.globalData.userInfo = updatedUserInfo
      
      wx.hideLoading()
      wx.showToast({
        title: '头像更新成功',
        icon: 'success'
      })
      
    } catch (error) {
      console.error('上传头像失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      })
    }
  },

  /**
   * 修改手机号
   */
  onEditPhone() {
    wx.showModal({
      title: '修改手机号',
      content: '修改手机号需要重新验证，是否继续？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/auth/auth?action=change_phone'
          })
        }
      }
    })
  },

  /**
   * 计算缓存大小
   */
  calculateCacheSize() {
    try {
      const info = wx.getStorageInfoSync()
      const sizeKB = info.currentSize
      const sizeMB = (sizeKB / 1024).toFixed(1)
      
      this.setData({
        'cacheInfo.size': sizeMB + 'MB'
      })
    } catch (error) {
      console.error('计算缓存大小失败:', error)
    }
  },

  /**
   * 清理缓存
   */
  onClearCache() {
    wx.showModal({
      title: '清理缓存',
      content: '确定要清理应用缓存吗？这将删除本地存储的数据（不包括用户设置）。',
      success: (res) => {
        if (res.confirm) {
          this.clearCache()
        }
      }
    })
  },

  /**
   * 执行清理缓存
   */
  clearCache() {
    wx.showLoading({ title: '清理中...' })
    
    try {
      // 保留重要数据
      const userSettings = wx.getStorageSync('user_settings')
      const userInfo = wx.getStorageSync('user_info')
      
      // 清理所有缓存
      wx.clearStorageSync()
      
      // 恢复重要数据
      if (userSettings) {
        wx.setStorageSync('user_settings', userSettings)
      }
      if (userInfo) {
        wx.setStorageSync('user_info', userInfo)
      }
      
      this.setData({
        'cacheInfo.size': '0.1MB',
        'cacheInfo.lastClean': new Date().toLocaleDateString()
      })
      
      wx.hideLoading()
      wx.showToast({
        title: '缓存清理完成',
        icon: 'success'
      })
      
    } catch (error) {
      console.error('清理缓存失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '清理失败',
        icon: 'none'
      })
    }
  },

  /**
   * 关于我们
   */
  onAbout() {
    wx.navigateTo({
      url: '/pages/about/about'
    })
  },

  /**
   * 隐私政策
   */
  onPrivacyPolicy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们非常重视您的隐私保护。本应用收集的个人信息仅用于提供更好的服务体验，不会用于其他用途。详细信息请访问我们的官网查看完整的隐私政策。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 用户协议
   */
  onUserAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '感谢您使用餐厅积分系统。请遵守平台规则，不要进行违法违规操作。我们保留对违规用户进行处理的权利。完整协议请访问官网查看。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 检查更新
   */
  onCheckUpdate() {
    wx.showLoading({ title: '检查中...' })
    
    // 模拟检查更新
    setTimeout(() => {
      wx.hideLoading()
      wx.showModal({
        title: '检查更新',
        content: '当前已是最新版本 v1.0.0',
        showCancel: false,
        confirmText: '知道了'
      })
    }, 1000)
  },

  /**
   * 意见反馈
   */
  onFeedback() {
    wx.showModal({
      title: '意见反馈',
      editable: true,
      placeholderText: '请输入您的意见或建议...',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.submitFeedback(res.content.trim())
        }
      }
    })
  },

  /**
   * 提交反馈
   */
  submitFeedback(content) {
    wx.showLoading({ title: '提交中...' })
    
    // 模拟提交反馈
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '反馈提交成功',
        icon: 'success'
      })
    }, 1000)
  },

  /**
   * 联系客服
   */
  onContactService() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：400-8888-888\n服务时间：9:00-18:00\n\n您也可以通过意见反馈功能联系我们。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack()
  }
}) 