// packageUser/feedback/feedback.ts - 客服反馈页面 + MobX响应式状态
const app = getApp()
// 🔴 统一工具函数导入
const { Utils, Wechat, API, Logger } = require('../../utils/index')
const log = Logger.createLogger('feedback')
const { showToast } = Wechat
const { checkAuth } = Utils
// 🆕 MobX Store绑定 - 用户登录状态自动同步
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 客服反馈页面 - 支持三层实时消息保障
 * 功能：用户提交反馈、查看回复状态、实时消息推送
 */
Page({
  data: {
    // 表单数据
    feedbackContent: '',
    selectedCategory: 'general',
    attachedImages: [],

    // 反馈分类
    categories: [
      { value: 'general', label: '一般咨询', icon: '💬' },
      { value: 'technical', label: '技术问题', icon: '🔧' },
      { value: 'account', label: '账户问题', icon: '👤' },
      { value: 'payment', label: '支付问题', icon: '💳' },
      { value: 'suggestion', label: '建议意见', icon: '💡' },
      { value: 'complaint', label: '投诉举报', icon: '⚠️' }
    ],

    // 页面状态
    submitting: false,
    canSubmit: false,

    // 🔴 反馈配置（必须从后端获取）
    // ⚠️ 初始值为 null 表示"尚未从后端加载"
    feedbackConfig: {
      // 反馈内容最大长度
      maxLength: null,
      // 反馈内容最小长度
      minLength: null,
      // 最多上传图片数量
      maxImages: null,
      // 轮询间隔
      pollingInterval: null
    },

    // 字符计数（当前字符长度统计）
    // ⚠️ 初始值500，实际使用 feedbackConfig.maxLength
    maxLength: 500,
    currentLength: 0,

    // 我的反馈记录
    myFeedbacks: [],
    showHistoryModal: false,
    loadingHistory: false
  },

  async onLoad() {
    log.info('客服反馈页面加载')

    // 🆕 MobX Store绑定 - 用户登录状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userId'],
      actions: []
    })

    // 🔴 第1步：加载反馈配置（从后端获取）
    await this.loadFeedbackConfig()

    // 第2步：更新提交状态
    this.updateSubmitState()

    // 第3步：加载我的反馈历史
    this.loadMyFeedbacks()
  },

  /**
   * 加载反馈配置（从后端API获取业务规则）
   * 后端API: GET /api/v4/system/config/feedback
   *
   * 从 system_configs 表读取 config_key='feedback_config'
   * 不存在时后端返回兜底默认配置
   */
  async loadFeedbackConfig() {
    try {
      const result = await API.getFeedbackConfig()
      if (result && result.success && result.data) {
        const config = result.data
        this.setData({
          feedbackConfig: {
            maxLength: config.max_length || config.max_content_length || 500,
            minLength: config.min_length || config.min_content_length || 10,
            maxImages: config.max_images || config.max_image_count || 3,
            pollingInterval: config.polling_interval || 5000
          },
          maxLength: config.max_length || config.max_content_length || 500
        })
        log.info('反馈配置加载成功:', config)
        return
      }
      log.warn('后端返回反馈配置数据为空，使用后端兜底默认值')
    } catch (error: any) {
      log.error('加载反馈配置异常:', error)
    }
  },

  onShow() {
    // 页面显示时刷新反馈列表
    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('用户未登录，已自动跳转')
      return
    }

    this.loadMyFeedbacks()
  },

  // 加载我的反馈历史
  async loadMyFeedbacks() {
    try {
      this.setData({ loadingHistory: true })

      // 只显示最近5条
      const result = await API.getMyFeedbacks(1, 5)

      if (result.success) {
        this.setData({
          myFeedbacks: result.data.feedbacks
        })
      }
    } catch (error: any) {
      log.error('加载反馈历史失败:', error)
    } finally {
      this.setData({ loadingHistory: false })
    }
  },

  // 反馈内容输入
  onContentInput(e: any) {
    const content = e.detail.value
    const length = content.length

    this.setData({
      feedbackContent: content,
      currentLength: length
    })

    this.updateSubmitState()
  },

  // 分类选择
  onCategoryChange(e: any) {
    const category = e.currentTarget.dataset.category
    this.setData({ selectedCategory: category })
    log.info('选择反馈分类:', category)
  },

  // 添加图片
  onAddImage() {
    // 🔴 使用从后端获取的配置
    const maxImages = this.data.feedbackConfig.maxImages || 3
    const currentCount = this.data.attachedImages.length

    if (currentCount >= maxImages) {
      showToast(`最多只能上传${maxImages}张图片`)
      return
    }

    wx.chooseImage({
      count: maxImages - currentCount,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const newImages = res.tempFilePaths.map(path => ({
          path,
          size: 0,
          name: `feedback_${Date.now()}.jpg`
        }))

        this.setData({
          attachedImages: [...this.data.attachedImages, ...newImages]
        })

        log.info('添加图片:', newImages.length)
      },
      fail: error => {
        log.error('选择图片失败:', error)
        showToast('选择图片失败')
      }
    })
  },

  // 预览图片
  onPreviewImage(e: any) {
    const index = e.currentTarget.dataset.index
    const images = this.data.attachedImages

    wx.previewImage({
      current: images[index].path,
      urls: images.map((img: any) => img.path)
    })
  },

  // 删除图片
  onDeleteImage(e: any) {
    const index = e.currentTarget.dataset.index
    const images = [...this.data.attachedImages]
    images.splice(index, 1)

    this.setData({ attachedImages: images })
    log.info('删除图片，剩余:', images.length)
  },

  // 更新提交按钮状态
  updateSubmitState() {
    // 🔴 使用从后端获取的配置
    const minLength = this.data.feedbackConfig.minLength || 10
    const maxLength = this.data.feedbackConfig.maxLength || this.data.maxLength

    const canSubmit =
      this.data.feedbackContent.trim().length >= minLength &&
      this.data.feedbackContent.length <= maxLength

    this.setData({ canSubmit })
  },

  // 提交反馈
  async onSubmitFeedback() {
    if (!this.data.canSubmit || this.data.submitting) {
      return
    }

    const { feedbackContent, selectedCategory, attachedImages, feedbackConfig } = this.data

    // 🔴 使用从后端获取的配置
    const minLength = feedbackConfig.minLength || 10

    if (feedbackContent.trim().length < minLength) {
      showToast(`反馈内容至少需要${minLength}个字符`)
      return
    }

    try {
      this.setData({ submitting: true })
      // 💡 loading由APIClient自动处理，无需手动showLoading

      log.info('准备提交反馈:', {
        content: feedbackContent,
        category: selectedCategory,
        imageCount: attachedImages.length
      })

      // 准备图片数据
      const imageData = attachedImages.map((img: any) => ({
        path: img.path,
        name: img.name
      }))

      // 提交反馈（修复参数签名：按后端要求传 category, content, priority）
      const result = await API.submitFeedback(
        selectedCategory,
        feedbackContent,
        'medium',
        imageData.length > 0 ? imageData : null
      )

      if (result.success) {
        // 提交成功
        log.info('反馈提交成功:', result.data.feedbackId)

        showToast('反馈提交成功，我们会尽快处理')

        // 🔔 启动实时监听
        this.startRealtimeMonitoring(result.data.feedbackId)

        // 清空表单
        this.resetForm()

        // 刷新历史记录
        await this.loadMyFeedbacks()

        // 显示提交成功页面
        this.showSubmitSuccess(result.data.feedbackId)
      } else {
        showToast(result.message || '提交失败，请稍后重试')
      }
    } catch (error: any) {
      log.error('提交反馈失败:', error)
      showToast('网络异常，请稍后重试')
    } finally {
      // 💡 loading由APIClient自动处理，无需手动hideLoading
      this.setData({ submitting: false })
    }
  },

  // 🚀 启动实时监听（三层保障）
  startRealtimeMonitoring(feedbackId: any) {
    log.info('启动反馈实时监听:', feedbackId)

    // 第一层：WebSocket实时推送
    if (app.globalData.ws_connected) {
      this.subscribeWebSocketFeedback(feedbackId)
    }

    // 第二层：页面激活时检查
    this.enablePageActiveCheck(feedbackId)

    // 第三层：定时轮询机制（兜底）
    this.startPollingCheck(feedbackId)
  },

  // Socket.IO 订阅反馈通知（替代原 wx.sendSocketMessage + JSON.stringify）
  subscribeWebSocketFeedback(feedbackId: any) {
    try {
      const appInstance = getApp()
      appInstance.emitSocketMessage('subscribe_feedback', { feedbackId })
      log.info('已订阅Socket.IO反馈通知')
    } catch (error: any) {
      log.warn('Socket.IO订阅失败:', error)
    }
  },

  // 页面激活检查
  enablePageActiveCheck(feedbackId: any) {
    this.feedbackId = feedbackId

    // 重写onShow方法，添加实时检查
    const originalOnShow = this.onShow
    this.onShow = function () {
      originalOnShow.call(this)
      if (this.feedbackId) {
        this.checkFeedbackUpdate(this.feedbackId)
      }
    }
  },

  // 定时轮询检查
  startPollingCheck(feedbackId: any) {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }

    // 🔴 使用从后端获取的配置
    const pollingInterval = this.data.feedbackConfig.pollingInterval || 5000

    this.pollingTimer = setInterval(async () => {
      try {
        // 🔴 修复：直接调用 checkFeedbackUpdate 方法复用逻辑
        await this.checkFeedbackUpdate(feedbackId)
      } catch (error: any) {
        log.error('轮询检查失败:', error)
      }
    }, pollingInterval)

    log.info(`⏰ 启动轮询检查，间隔: ${pollingInterval}ms`)
  },

  // 检查反馈更新
  async checkFeedbackUpdate(feedbackId: any) {
    try {
      // 🔴 修复：使用 getMyFeedbacks API 获取反馈列表，然后筛选目标反馈
      // 获取最近20条反馈
      const result = await API.getMyFeedbacks(1, 20)
      if (result.success && result.data && result.data.feedbacks) {
        // 从列表中找到对应的反馈
        const feedback = result.data.feedbacks.find((f: any) => f.feedback_id === feedbackId)
        if (feedback && feedback.status === 'replied' && feedback.reply_content) {
          this.handleRealtimeReply({
            feedbackId: feedback.feedback_id,
            adminReply: feedback.reply_content,
            replyTime: feedback.replied_at
          })
          // 收到回复后停止轮询
          if (this.pollingTimer) {
            clearInterval(this.pollingTimer)
            this.pollingTimer = null
          }
        }
      }
    } catch (error: any) {
      log.error('检查反馈更新失败:', error)
    }
  },

  // 🔔 处理实时回复
  handleRealtimeReply(replyData: any) {
    const { feedbackId, adminReply } = replyData

    // 振动提醒
    wx.vibrateShort({ type: 'medium' })

    // 显示回复通知
    wx.showModal({
      title: '收到客服回复',
      content: `您的反馈已收到回复：\n\n${adminReply.substring(0, 50)}${adminReply.length > 50 ? '...' : ''}`,
      confirmText: '查看详情',
      cancelText: '稍后查看',
      success: res => {
        if (res.confirm) {
          this.viewFeedbackDetail(feedbackId)
        }
      }
    })

    // 刷新历史记录
    this.loadMyFeedbacks()
  },

  // 显示提交成功
  showSubmitSuccess(feedbackId: any) {
    wx.showModal({
      title: '提交成功',
      content: '您的反馈已成功提交，我们会在24小时内处理并回复。您可以在"我的反馈"中查看处理进度。',
      confirmText: '查看进度',
      cancelText: '知道了',
      success: res => {
        if (res.confirm) {
          this.viewFeedbackDetail(feedbackId)
        }
      }
    })
  },

  // 查看反馈详情
  viewFeedbackDetail(feedbackId: any) {
    wx.navigateTo({
      url: `/packageUser/feedback/detail?id=${feedbackId}`
    })
  },

  // 重置表单
  resetForm() {
    this.setData({
      feedbackContent: '',
      selectedCategory: 'general',
      attachedImages: [],
      currentLength: 0,
      canSubmit: false
    })
  },

  // 查看历史记录
  onViewHistory() {
    wx.navigateTo({
      url: '/packageUser/feedback/list'
    })
  },

  // 显示历史记录模态框
  onShowHistoryModal() {
    this.setData({ showHistoryModal: true })
  },

  // 隐藏历史记录模态框
  onHideHistoryModal() {
    this.setData({ showHistoryModal: false })
  },

  // 点击历史记录项
  onHistoryItemTap(e: any) {
    const feedbackId = e.currentTarget.dataset.feedbackId
    this.onHideHistoryModal()
    this.viewFeedbackDetail(feedbackId)
  },

  // 页面卸载
  onUnload() {
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    // 清理轮询定时器
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }
  },

  // 分享功能
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 客服反馈',
      path: '/packageUser/feedback/feedback'
    }
  }
})

export { }

