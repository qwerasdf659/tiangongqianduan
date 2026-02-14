// packageAdmin/chat-management/chat-management.ts - 管理员聊天工作台 + MobX响应式状态
const app = getApp()
const { Wechat, API, Logger } = require('../../utils/index')
const log = Logger.createLogger('chat-management')
const { showToast } = Wechat

// 🆕 MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 管理员聊天工作台 - 仿淘宝/京东客服系统
 * 功能：多会话管理、实时聊天、快捷回复、工作统计
 */
Page({
  data: {
    // 管理员信息
    adminInfo: null,
    // online, busy, offline
    adminStatus: 'online',

    // 会话列表
    sessions: [],
    currentSessionId: null,
    loadingSessions: false,

    // 当前聊天
    currentMessages: [],
    inputContent: '',
    isTyping: false,

    // 界面状态
    showSessionList: true,
    showUserInfo: false,
    showQuickReplies: false,
    scrollToBottom: false,

    // 快捷回复
    quickReplies: [
      { id: 1, title: '欢迎', content: '您好！很高兴为您服务，请问有什么可以帮助您的吗？' },
      { id: 2, title: '稍等', content: '好的，请您稍等片刻，我来为您查询处理。' },
      { id: 3, title: '核实信息', content: '为了更好的为您处理，请提供您的订单号或联系方式。' },
      { id: 4, title: '感谢', content: '感谢您的耐心等待，如还有其他问题请随时联系我们。' },
      { id: 5, title: '结束', content: '本次服务到此结束，祝您生活愉快！如有问题请随时联系。' }
    ],

    // WebSocket状态
    wsConnected: false,
    reconnectCount: 0,

    // 统计信息
    todayStats: {
      totalSessions: 0,
      completedSessions: 0,
      avgResponseTime: '0分钟',
      customerSatisfaction: 0
    }
  },

  onLoad() {
    log.info('👨‍💼 管理员聊天工作台加载')

    // 🆕 MobX Store绑定 - 用户认证状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 🔴 功能已迁移提示
    wx.showModal({
      title: '功能已迁移',
      content: '聊天工作台功能已合并到客服管理页面中，请使用客服管理页面的"实时聊天"模式。',
      showCancel: true,
      cancelText: '了解',
      confirmText: '立即前往',
      success: res => {
        if (res.confirm) {
          wx.redirectTo({
            url: '/packageAdmin/customer-service/customer-service'
          })
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  onShow() {
    this.initWorkspace()
  },

  onHide() {
    this.stopTyping()
  },

  onUnload() {
    log.info('📱 管理员聊天管理页面卸载，取消WebSocket订阅')

    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }

    // 🔴 取消WebSocket消息订阅
    const appInstance = getApp()
    if (appInstance && typeof appInstance.unsubscribeWebSocketMessages === 'function') {
      appInstance.unsubscribeWebSocketMessages('admin_chat_management')
    }
  },

  // 🔐 检查管理员权限（优先从MobX Store获取）
  checkAdminAuth() {
    const userInfo = userStore.userInfo

    // 🔴 修复：从userInfo中读取JWT Token的权限字段（snake_case命名）
    const isAdmin =
      userInfo &&
      (userInfo.is_admin === true ||
        userInfo.user_role === 'admin' ||
        (userInfo.role_level && userInfo.role_level >= 100))

    log.info('🔐 聊天管理权限检查:', {
      isAdmin,
      userInfo_is_admin: userInfo?.is_admin,
      userInfo_user_role: userInfo?.user_role,
      userInfo_role_level: userInfo?.role_level
    })

    if (!userInfo || !isAdmin) {
      showToast('无管理员权限')
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return false
    }

    this.setData({
      adminInfo: {
        id: userInfo.user_id,
        name: userInfo.nickname || '客服',
        avatar: userInfo.avatar_url
      }
    })
    return true
  },

  // 📡 初始化聊天工作区
  async initWorkspace() {
    try {
      log.info('🔧 初始化管理员聊天工作区...')

      // 🔴 修复：使用统一WebSocket管理替代独立连接
      await this.connectToUnifiedWebSocket()

      // 加载会话列表
      await this.loadSessions()

      // 获取今日统计
      await this.loadTodayStats()

      showToast('工作区初始化完成')
    } catch (error) {
      log.error('❌ 初始化聊天工作区失败:', error)
      showToast('初始化失败，请稍后重试')
    }
  },

  // 📡 连接到统一WebSocket管理系统
  async connectToUnifiedWebSocket() {
    const appInstance = getApp()

    // 🔧 安全检查app对象和方法是否存在
    if (!appInstance || typeof appInstance.subscribeWebSocketMessages !== 'function') {
      log.error('❌ app对象或WebSocket管理方法不可用')
      throw new Error('WebSocket管理系统未就绪')
    }

    log.info('🔌 管理员聊天管理页面使用统一WebSocket连接')

    // 🔴 订阅WebSocket消息
    appInstance.subscribeWebSocketMessages('admin_chat_management', (eventName, data) => {
      this.handleUnifiedWebSocketMessage(eventName, data)
    })

    try {
      // 🔴 使用统一WebSocket连接
      await appInstance.connectWebSocket()

      log.info('✅ 管理员聊天管理页面WebSocket连接成功')
      this.setData({
        wsConnected: true,
        reconnectCount: 0
      })

      // 注册为管理员
      this.registerAsAdmin()
    } catch (error) {
      log.error('❌ 管理员聊天管理页面WebSocket连接失败:', error)
      this.setData({
        wsConnected: false
      })
      throw error
    }
  },

  // 🔧 处理统一WebSocket消息
  handleUnifiedWebSocketMessage(eventName, data) {
    log.info('📨 管理员聊天管理页面收到统一WebSocket消息:', eventName, data)

    switch (eventName) {
      case 'websocket_connected':
        this.setData({
          wsConnected: true,
          reconnectCount: 0
        })
        // 重新注册为管理员
        this.registerAsAdmin()
        break

      case 'websocket_error':
      case 'websocket_closed':
        this.setData({
          wsConnected: false
        })
        break

      case 'websocket_max_reconnect_reached':
        wx.showModal({
          title: '连接失败',
          content: '管理员聊天连接异常，请检查网络后重试',
          confirmText: '重试',
          cancelText: '取消',
          success: res => {
            if (res.confirm) {
              app.connectWebSocket()
            }
          }
        })
        break

      case 'new_chat_session':
        log.info('👤 新的聊天会话:', data)
        this.handleNewChatSession(data)
        break

      case 'user_chat_message':
        log.info('💬 收到用户消息:', data)
        this.handleUserMessage(data)
        break

      case 'session_status_update':
        log.info('📊 会话状态更新:', data)
        this.handleSessionStatusUpdate(data)
        break

      default:
        log.info('🔄 管理员聊天管理页面未处理的消息类型:', eventName)
    }
  },

  // 📨 注册为管理员
  registerAsAdmin() {
    if (!this.data.wsConnected) {
      log.warn('⚠️ WebSocket未连接，无法注册管理员')
      return
    }

    const appInstance = getApp()
    if (!appInstance || typeof appInstance.sendWebSocketMessage !== 'function') {
      log.error('❌ 无法发送WebSocket消息')
      return
    }

    const registerMessage = {
      type: 'admin_register',
      adminId: userStore.userInfo?.user_id,
      adminInfo: {
        name: userStore.userInfo?.nickname || '管理员',
        role: 'chat_admin'
      },
      timestamp: Date.now()
    }

    appInstance
      .sendWebSocketMessage(registerMessage)
      .then(() => {
        log.info('✅ 管理员注册消息已发送')
      })
      .catch(error => {
        log.error('❌ 管理员注册失败:', error)
      })
  },

  // 👤 处理新聊天会话
  handleNewChatSession(sessionData) {
    log.info('👤 处理新聊天会话:', sessionData)
    // 刷新会话列表
    this.loadSessions()

    // 可以添加通知提示
    wx.showToast({
      title: '收到新会话',
      icon: 'none',
      duration: 2000
    })
  },

  // 💬 处理用户消息
  handleUserMessage(messageData) {
    log.info('💬 处理用户消息:', messageData)

    // 如果消息属于当前选中的会话，更新消息列表
    if (messageData.sessionId === this.data.currentSessionId) {
      const newMessage = {
        id: messageData.messageId,
        senderId: messageData.senderId,
        senderType: messageData.senderType,
        content: messageData.content,
        messageType: messageData.messageType || 'text',
        createdAt: messageData.createdAt,
        isOwn: false
      }

      const currentMessages = [...this.data.currentMessages, newMessage]
      this.setData({
        currentMessages,
        scrollToBottom: true
      })
    }

    // 刷新会话列表以更新预览
    this.loadSessions()
  },

  // 📊 处理会话状态更新
  handleSessionStatusUpdate(statusData) {
    log.info('📊 处理会话状态更新:', statusData)
    // 更新会话列表中对应会话的状态
    const sessions = this.data.sessions.map(session => {
      if (session.sessionId === statusData.sessionId) {
        return { ...session, status: statusData.status }
      }
      return session
    })

    this.setData({ sessions })
  },

  // 📋 加载会话列表
  async loadSessions() {
    if (this.data.loadingSessions) {
      return
    }

    try {
      this.setData({ loadingSessions: true })

      const result = await API.getAdminChatSessions({
        status: 'all',
        page: 1,
        pageSize: 50
      })

      if (result.success) {
        this.setData({
          sessions: result.data.sessions || [],
          loadingSessions: false
        })
      }
    } catch (error) {
      log.error('❌ 加载会话列表失败:', error)
      this.setData({ loadingSessions: false })
    }
  },

  /**
   * 加载今日统计
   *
   * 🔴 后端缺失API: GET /api/v4/console/customer-service/stats
   * 期望响应: { total_sessions, completed_sessions, avg_response_time, customer_satisfaction }
   *
   * 当前仅使用本地会话列表长度作为总会话数，其余字段需后端提供
   */
  async loadTodayStats() {
    try {
      this.setData({
        todayStats: {
          totalSessions: this.data.sessions.length || 0,
          completedSessions: 0,
          avgResponseTime: '--',
          customerSatisfaction: 0
        }
      })
    } catch (error) {
      log.error('❌ 加载统计数据失败:', error)
    }
  },

  // 🎯 选择会话
  onSessionSelect(e) {
    const sessionId = e.currentTarget.dataset.sessionId
    this.selectSession(sessionId)
  },

  async selectSession(sessionId) {
    if (sessionId === this.data.currentSessionId) {
      return
    }

    try {
      this.setData({
        currentSessionId: sessionId,
        showSessionList: false
      })

      // 加载会话消息
      await this.loadSessionMessages(sessionId)

      // 标记会话为活跃
      this.markSessionActive(sessionId)
    } catch (error) {
      log.error('❌ 选择会话失败:', error)
    }
  },

  // 📜 加载会话消息（管理员端使用专用API）
  async loadSessionMessages(sessionId) {
    try {
      const result = await API.getAdminChatHistory({
        sessionId,
        page: 1,
        pageSize: 50
      })

      if (result.success) {
        const messages = result.data.messages.map(msg => ({
          id: msg.messageId,
          senderId: msg.senderId,
          senderType: msg.senderType,
          content: msg.content,
          messageType: msg.messageType,
          status: msg.status,
          createdAt: msg.createdAt,
          isOwn: msg.senderType === 'admin'
        }))

        this.setData({
          currentMessages: messages,
          scrollToBottom: true
        })
      }
    } catch (error) {
      log.error('❌ 加载会话消息失败:', error)
    }
  },

  // ✏️ 消息输入
  onInputChange(e) {
    const content = e.detail.value
    this.setData({ inputContent: content })

    // 发送输入状态
    if (content && !this.data.isTyping) {
      this.startTyping()
    } else if (!content && this.data.isTyping) {
      this.stopTyping()
    }
  },

  // ⌨️ 开始输入状态
  startTyping() {
    if (!this.data.wsConnected || !this.data.currentSessionId) {
      return
    }

    this.setData({ isTyping: true })

    const typingMessage = {
      type: 'admin_typing_start',
      data: {
        sessionId: this.data.currentSessionId,
        adminId: this.data.adminInfo.id,
        adminName: this.data.adminInfo.name
      }
    }

    wx.sendSocketMessage({
      data: JSON.stringify(typingMessage)
    })
  },

  // ⌨️ 停止输入状态
  stopTyping() {
    if (!this.data.wsConnected || !this.data.currentSessionId || !this.data.isTyping) {
      return
    }

    this.setData({ isTyping: false })

    const stopTypingMessage = {
      type: 'admin_typing_stop',
      data: {
        sessionId: this.data.currentSessionId,
        adminId: this.data.adminInfo.id
      }
    }

    wx.sendSocketMessage({
      data: JSON.stringify(stopTypingMessage)
    })
  },

  // 📤 发送消息
  async sendMessage() {
    const content = this.data.inputContent.trim()

    if (!content || !this.data.currentSessionId) {
      return
    }

    try {
      // 清空输入框
      this.setData({ inputContent: '' })
      this.stopTyping()

      // 乐观更新UI
      const tempMessage = {
        id: `temp_${Date.now()}`,
        senderId: this.data.adminInfo.id,
        senderType: 'admin',
        content,
        messageType: 'text',
        status: 'sending',
        createdAt: new Date().toISOString(),
        isOwn: true
      }

      this.setData({
        currentMessages: [...this.data.currentMessages, tempMessage],
        scrollToBottom: true
      })

      // 发送WebSocket消息
      const chatMessage = {
        type: 'admin_chat_message',
        data: {
          sessionId: this.data.currentSessionId,
          content,
          messageType: 'text',
          adminId: this.data.adminInfo.id
        }
      }

      wx.sendSocketMessage({
        data: JSON.stringify(chatMessage)
      })
    } catch (error) {
      log.error('❌ 发送消息失败:', error)
      showToast('发送失败，请重试')
    }
  },

  // ⚡ 快捷回复
  onQuickReply(e) {
    const replyId = e.currentTarget.dataset.id
    const reply = this.data.quickReplies.find(r => r.id === replyId)

    if (reply) {
      this.setData({
        inputContent: reply.content,
        showQuickReplies: false
      })
      this.sendMessage()
    }
  },

  // 🔄 刷新会话列表
  async refreshSessions() {
    await this.loadSessions()
    showToast('刷新成功')
  },

  /**
   * 🚪 关闭会话（修复：使用closeAdminChatSession替代不存在的closeChatSession）
   *
   * 后端API: POST /api/v4/console/customer-service/sessions/:id/close
   */
  async closeSession(sessionId) {
    try {
      wx.showModal({
        title: '确认关闭',
        content: '确定要关闭这个会话吗？',
        success: async res => {
          if (res.confirm) {
            const result = await API.closeAdminChatSession(sessionId)
            if (result.success) {
              const updatedSessions = this.data.sessions.filter(s => s.sessionId !== sessionId)
              this.setData({ sessions: updatedSessions })

              if (sessionId === this.data.currentSessionId) {
                this.setData({
                  currentSessionId: null,
                  currentMessages: [],
                  showSessionList: true
                })
              }

              showToast('会话已关闭')
            }
          }
        }
      })
    } catch (error) {
      log.error('❌ 关闭会话失败:', error)
      showToast('关闭失败')
    }
  },

  // 🎛️ 切换界面显示
  toggleSessionList() {
    this.setData({
      showSessionList: !this.data.showSessionList
    })
  },

  toggleQuickReplies() {
    this.setData({
      showQuickReplies: !this.data.showQuickReplies
    })
  },

  toggleUserInfo() {
    this.setData({
      showUserInfo: !this.data.showUserInfo
    })
  },

  /**
   * 更新管理员在线状态（当前仅更新本地状态）
   *
   * 🔴 后端缺失API: POST /api/v4/console/customer-service/status
   * 期望请求: { status: 'online' | 'offline' | 'busy' }
   * 后端提供API后，此处应同步推送在线状态到服务端
   */
  async updateAdminStatus(status: string) {
    log.info('ℹ️ 管理员状态已更新（本地）:', status)
    this.setData({ adminStatus: status })
  },

  // 🔧 工具函数
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) {
      return '刚刚'
    }
    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)}分钟前`
    }
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`
    }
    return date.toLocaleDateString()
  },

  // 🧹 清理资源
  cleanup() {
    this.stopTyping()
    if (this.data.wsConnected) {
      // 设置离线状态
      this.updateAdminStatus('offline')
      wx.closeSocket()
    }
  },

  // 🔄 下拉刷新
  onPullDownRefresh() {
    this.refreshSessions().finally(() => {
      wx.stopPullDownRefresh()
    })
  }
})

export {}
