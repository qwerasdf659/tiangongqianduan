/**
 * 聊天消息处理方法 — 从 chat.ts 拆分
 *
 * 包含：聊天历史加载、WebSocket管理、消息收发、输入交互、V6.0交互功能
 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * 后端API对齐（客服系统 /api/v4/system/chat/*）:
 *   - GET  /api/v4/system/chat/sessions/:id/messages — 加载历史消息
 *   - POST /api/v4/system/chat/sessions/:id/messages — 发送消息（API降级）
 *   - POST /api/v4/system/chat/sessions/:id/upload   — 上传聊天图片
 *
 * Socket.IO 事件协议（对齐后端 ChatWebSocketService）:
 *   - emit: send_message → { session_id, content, message_type }
 *   - on:   new_message / message_sent / message_error / session_closed / user_typing
 *
 * @file pages/chat/chat-message-handlers.ts
 * @version 5.0.0
 * @since 2026-02-16
 */

const { Utils, Wechat, API, Constants, Logger } = require('../../utils/index')
const msgLog = Logger.createLogger('chat-msg')
const { formatDateMessage } = Utils
const { showToast: msgShowToast } = Wechat
const { DELAY: MSG_DELAY } = Constants

// MobX Store — 直接引用 userStore 作为认证数据权威来源
const { userStore } = require('../../store/user')

/**
 * 会话状态文案映射（对应后端 customer_service_sessions.status 字段）
 * 复制自 chat.ts，供 showSessionInfo 等方法使用
 */
const MSG_SESSION_STATUS_MAP: Record<string, string> = {
  waiting: '等待客服',
  assigned: '已分配',
  active: '对话中',
  closed: '已结束'
}

/**
 * 聊天消息处理方法集合
 * 在 chat.ts 中通过 ...chatMessageHandlers 合并到 Page({})
 */
const chatMessageHandlers = {
  // ============================================================================
  // 聊天历史消息
  // ============================================================================

  /**
   * 加载当前会话的聊天历史
   *
   * 后端路由: GET /api/v4/system/chat/sessions/:id/messages
   *
   * 消息字段（后端snake_case）:
   * - chat_message_id: 消息主键
   * - content: 消息内容
   * - sender_type: 'user' | 'admin' | 'system'
   * - message_type: 'text' | 'image' | 'system'
   * - created_at: 创建时间（ISO 8601）
   */
  async loadChatHistory() {
    msgLog.info('📚 加载聊天历史，会话ID:', this.data.sessionId)
    this.setData({
      isLoadingHistory: true,
      chatLoadStatus: 'loading'
    })

    try {
      if (!this.data.sessionId) {
        msgLog.info('📝 无会话ID，显示空状态')
        this.setData({
          messages: [] as API.ChatMessage[],
          scrollToBottom: true,
          chatLoadStatus: 'empty'
        })
        return
      }

      const historyResult = await API.getChatHistory(this.data.sessionId, 1, 50)

      if (historyResult.success && historyResult.data && historyResult.data.messages) {
        const apiMessages = historyResult.data.messages.map((msg: any) => {
          /* 判断消息方向: sender_type='user' → 自己发的(右侧)，其余 → 对方发的(左侧) */
          const isOwn = msg.sender_type === 'user'

          return {
            id: msg.chat_message_id || msg.id,
            content: msg.content || '',
            messageType: msg.message_type || 'text',
            isOwn,
            status: isOwn ? 'sent' : 'read',
            timestamp: new Date(msg.created_at).getTime(),
            timeText: this.formatMessageTime(msg.created_at),
            showTime: true,
            attachments: msg.attachments || []
          }
        })

        /* 按时间戳排序（最早的在前，最新的在后） */
        const sortedMessages = apiMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)
        msgLog.info('✅ 成功加载聊天历史:', sortedMessages.length, '条消息')

        this.setData({
          messages: sortedMessages,
          scrollToBottom: true,
          chatLoadStatus: sortedMessages.length > 0 ? 'success' : 'empty'
        })
      } else {
        msgLog.warn('⚠️ API返回的历史消息为空')
        this.setData({
          messages: [] as API.ChatMessage[],
          scrollToBottom: true,
          chatLoadStatus: 'empty'
        })
      }
    } catch (error) {
      msgLog.error('❌ 加载历史消息失败:', error)
      this.setData({ messages: [] as API.ChatMessage[], chatLoadStatus: 'error' })
      msgShowToast('加载历史消息失败')
    } finally {
      this.setData({ isLoadingHistory: false })
    }
  },

  /** 格式化消息时间（智能时间显示） */
  formatMessageTime(timeString: string) {
    try {
      const messageTime = new Date(timeString)
      const now = new Date()
      const diffMinutes = Math.floor((now.getTime() - messageTime.getTime()) / (1000 * 60))

      if (diffMinutes < 1) {
        return '刚刚'
      }
      if (diffMinutes < 60) {
        return `${diffMinutes}分钟前`
      }

      const diffHours = Math.floor(diffMinutes / 60)
      if (diffHours < 24) {
        return `${diffHours}小时前`
      }

      const diffDays = Math.floor(diffHours / 24)
      if (diffDays < 7) {
        return `${diffDays}天前`
      }

      return messageTime.toLocaleDateString()
    } catch (error) {
      msgLog.warn('⚠️ 时间格式化失败', error)
      return ''
    }
  },

  // ============================================================================
  // WebSocket管理
  // ============================================================================

  /**
   * 连接WebSocket（通过App全局Socket.IO连接）
   *
   * 后端 ChatWebSocketService 握手鉴权流程:
   *   1. 前端传递 { auth: { token: accessToken } }
   *   2. 后端 jwt.verify(token) 解码出 user_id、role_level
   *   3. 后端自动注册用户/管理员（role_level >= 100）
   *   4. 后端推送 connection_established 事件确认
   *
   * 前端只需检查 accessToken 存在即可，userId 由后端从 JWT 解码获取。
   */
  connectWebSocket() {
    // 从 MobX Store 读取 accessToken（权威数据源，后端从 JWT 解码 userId）
    const token = userStore.accessToken

    if (!token) {
      msgLog.warn('⚠️ 未登录或Token不存在，无法连接WebSocket')
      return
    }

    const app = getApp()

    if (!app || typeof app.subscribeWebSocketMessages !== 'function') {
      msgLog.error('❌ app对象或WebSocket管理方法不可用')
      wx.showModal({
        title: '连接失败',
        content: '系统初始化未完成，请重启小程序',
        showCancel: false,
        confirmText: '确定'
      })
      return
    }

    msgLog.info('🔐 用户端使用统一WebSocket连接')

    /* 订阅WebSocket消息（通过App的Socket.IO页面订阅机制） */
    app.subscribeWebSocketMessages('chat_page', (eventName: string, data: any) => {
      this.handleUnifiedWebSocketMessage(eventName, data)
    })

    app
      .connectWebSocket()
      .then(() => {
        msgLog.info('✅ 用户端WebSocket连接成功')
        this.setData({ wsConnected: true, sessionStatus: 'active' })
        wx.showToast({ title: '客服连接成功', icon: 'success', duration: MSG_DELAY.TOAST_LONG })
      })
      .catch((error: any) => {
        msgLog.error('❌ 用户端WebSocket连接失败:', error)
        this.setData({ wsConnected: false, sessionStatus: 'connection_failed' })
        wx.showToast({ title: '连接客服失败，请检查网络', icon: 'none', duration: MSG_DELAY.RETRY })
      })
  },

  /**
   * 处理统一Socket.IO消息（对齐后端 ChatWebSocketService 事件协议）
   *
   * 后端事件协议（ChatWebSocketService）:
   * - connection_established: { user_id, socket_id, server_time, timestamp }
   * - new_message: { chat_message_id, content, sender_type, session_id, ... }
   * - message_sent: { chat_message_id, session_id, timestamp } — 发送确认
   * - message_error: { error, message, timestamp } — 发送失败
   * - session_closed: { session_id, close_reason, ... }
   */
  handleUnifiedWebSocketMessage(eventName: string, data: any) {
    msgLog.info('📢 用户端收到Socket.IO消息:', eventName)

    switch (eventName) {
      case 'websocket_connected':
        this.setData({ wsConnected: true, sessionStatus: 'active' })
        break

      case 'websocket_error':
      case 'websocket_closed':
        this.setData({ wsConnected: false, sessionStatus: 'disconnected' })
        break

      case 'websocket_max_reconnect_reached':
        wx.showModal({
          title: '连接失败',
          content: '客服连接异常，请检查网络后重试',
          confirmText: '重试',
          cancelText: '取消',
          success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
            if (res.confirm) {
              const appInstance = getApp()
              appInstance.connectWebSocket()
            }
          }
        })
        break

      /* 后端连接确认（含 user_id、socket_id、server_time） */
      case 'connection_established':
        msgLog.info('🤝 后端连接确认:', data)
        break

      /* 新消息（后端 snake_case: chat_message_id, content, sender_type） */
      case 'new_message':
        msgLog.info('📨 用户端收到新消息:', data)
        if (data.sender_type === 'admin') {
          this.handleAdminMessage(data)
        } else {
          this.addMessage(data)
        }
        break

      /* 消息发送确认（后端写库成功回执: chat_message_id, session_id, timestamp） */
      case 'message_sent':
        msgLog.info('✅ 消息发送确认:', data)
        this.handleMessageSentConfirm(data)
        break

      /* 消息发送失败（后端处理出错: error, message, timestamp） */
      case 'message_error':
        msgLog.error('❌ 消息发送失败:', data)
        this.handleMessageSendError(data)
        break

      /* 会话关闭（后端: session_id, close_reason） */
      case 'session_closed':
        msgLog.info('🔚 会话已关闭:', data)
        this.setData({ sessionStatus: 'closed' })
        this.loadSessionData()
        break

      case 'user_typing':
        this.handleTypingIndicator(data)
        break

      case 'session_status':
        this.updateSessionStatus(data)
        break

      default:
        msgLog.info('🔧 用户端未处理的消息类型', eventName)
    }
  },

  /**
   * 处理管理员消息
   * 后端统一使用 snake_case 字段: chat_message_id, sender_type, message_type, created_at
   */
  handleAdminMessage(messageData: any) {
    msgLog.info('👨‍💼 处理管理员消息')

    const adminMessage = {
      id: messageData.chat_message_id || `admin_msg_${Date.now()}`,
      content: messageData.content,
      messageType: messageData.message_type || 'text',
      senderId: messageData.sender_id,
      senderType: 'admin',
      messageSource: messageData.message_source || 'admin_client',
      timestamp: messageData.created_at ? new Date(messageData.created_at).getTime() : Date.now(),
      createdAt: messageData.created_at || new Date().toISOString(),
      attachments: messageData.attachments || []
    }

    this.addMessage(adminMessage)
    msgLog.info('✅ 管理员消息处理完成')
  },

  /**
   * 处理 message_sent 确认（后端通过 Socket.IO 写库成功的回执）
   * 后端返回: { chat_message_id, session_id, timestamp }
   * 用于将本地 'sending' 状态的消息更新为 'sent'，并替换临时 ID 为真实 ID
   */
  handleMessageSentConfirm(data: any) {
    const serverMsgId = data.chat_message_id
    if (!serverMsgId) {
      return
    }

    const messages = this.data.messages.map((msg: any) => {
      if (msg.isOwn && msg.status === 'sending') {
        return { ...msg, status: 'sent', id: serverMsgId }
      }
      return msg
    })
    this.setData({ messages })
  },

  /**
   * 处理 message_error（后端处理 send_message 失败的回执）
   * 后端返回: { error, message, timestamp }
   */
  handleMessageSendError(data: any) {
    msgLog.error('❌ 后端消息处理失败:', data.message || data.error)

    const messages = this.data.messages.map((msg: any) => {
      if (msg.isOwn && msg.status === 'sending') {
        return { ...msg, status: 'failed' }
      }
      return msg
    })
    this.setData({ messages })
    msgShowToast(data.message || '消息发送失败')
  },

  /** 断开WebSocket连接 */
  disconnectWebSocket() {
    const app = getApp()

    if (app && typeof app.unsubscribeWebSocketMessages === 'function') {
      app.unsubscribeWebSocketMessages('chat_page')
    } else {
      msgLog.warn('⚠️ app对象或unsubscribeWebSocketMessages方法不可用')
    }

    this.setData({ wsConnected: false, sessionStatus: 'disconnected' })
    msgLog.info('📱 用户端已断开WebSocket连接')
  },

  // ============================================================================
  // 消息管理
  // ============================================================================

  /**
   * 添加消息到聊天列表
   *
   * 后端统一事件 new_message 字段: sender_type = 'user' | 'admin' | 'system'
   * 判断消息方向: sender_type='user' → 自己发的(右侧)，其余 → 对方发的(左侧)
   */
  addMessage(messageData: any) {
    const isOwn =
      messageData.isOwn !== undefined ? messageData.isOwn : messageData.sender_type === 'user'

    const timestamp =
      messageData.timestamp ||
      (messageData.created_at ? new Date(messageData.created_at).getTime() : Date.now())

    const newMessage = {
      id: messageData.id || messageData.chat_message_id || `msg_${Date.now()}`,
      content: messageData.content || '',
      messageType: messageData.messageType || messageData.message_type || 'text',
      isOwn,
      status: messageData.status || (isOwn ? 'sent' : 'read'),
      timestamp,
      timeText:
        messageData.timeText ||
        (messageData.created_at
          ? this.formatMessageTime(messageData.created_at)
          : formatDateMessage(timestamp)),
      showTime:
        messageData.showTime !== undefined ? messageData.showTime : this.shouldShowTime(timestamp),
      senderType: messageData.senderType || messageData.sender_type || 'user',
      attachments: messageData.attachments || []
    }

    const messages = [...this.data.messages, newMessage]
    const updateData: Record<string, any> = {
      messages,
      scrollToBottom: true,
      chatLoadStatus: 'success'
    }

    /* 如果用户已滚动到上方查看历史，增加新消息计数 */
    if (this.data.showScrollBottomBtn && !isOwn) {
      updateData.newMsgCount = (this.data.newMsgCount || 0) + 1
    }

    this.setData(updateData)
  },

  /** 判断是否显示时间标签（相邻消息间隔超过5分钟则显示） */
  shouldShowTime(timestamp: number) {
    const messages = this.data.messages
    if (!messages || messages.length === 0) {
      return true
    }

    const lastMessage = messages[messages.length - 1]
    const lastTimestamp = lastMessage.timestamp || 0
    const TIME_GAP = 5 * 60 * 1000 /* 5分钟 */
    return timestamp - lastTimestamp > TIME_GAP
  },

  /**
   * 更新会话列表中当前会话的最后消息预览
   * 用于聊天弹窗中发送消息后，同步更新会话列表的最新消息展示
   */
  updateSessionPreview(content: string) {
    const sessionId = this.data.sessionId
    if (!sessionId) {
      return
    }

    const sessions = this.data.sessions.map((session: any) => {
      if (String(session.customer_service_session_id) === String(sessionId)) {
        return {
          ...session,
          last_message: {
            ...session.last_message,
            content,
            created_at: new Date().toISOString()
          }
        }
      }
      return session
    })
    this.setData({ sessions })
  },

  /** 处理对方正在输入状态指示器 */
  handleTypingIndicator(data: any) {
    if (data.sender_type === 'admin') {
      this.setData({
        showTypingIndicator: true,
        typingUser: data.nickname || '客服'
      })

      /* 3秒后自动隐藏 */
      setTimeout(() => {
        this.setData({ showTypingIndicator: false })
      }, MSG_DELAY.RETRY)
    }
  },

  /** 更新会话状态 */
  updateSessionStatus(data: any) {
    this.setData({ sessionStatus: data.status })
  },

  // ============================================================================
  // 输入与发送
  // ============================================================================

  /** 输入内容变化 */
  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ inputContent: e.detail.value })
  },

  /** 输入框获得焦点 */
  onInputFocus() {
    this.setData({ inputFocused: true, scrollToBottom: true })
  },

  /** 输入框失去焦点 */
  onInputBlur() {
    this.setData({ inputFocused: false })
  },

  /**
   * 发送消息
   *
   * 发送策略: Socket.IO 优先（后端自动写库 + 回执），API 降级兜底
   * Socket.IO: emit('send_message', { session_id, content, message_type })
   * API降级:  POST /api/v4/system/chat/sessions/:id/messages
   */
  async sendMessage() {
    const content = this.data.inputContent.trim()

    if (!content) {
      msgShowToast('请输入消息内容')
      return
    }

    if (!this.data.sessionId) {
      msgShowToast('会话连接中，请稍后重试')
      return
    }

    msgLog.info('📨 [发送消息]', content.substring(0, 30) + '...')

    const message = {
      id: `local_${Date.now()}`,
      content,
      messageType: 'text',
      isOwn: true,
      status: 'sending',
      timestamp: Date.now(),
      timeText: formatDateMessage(Date.now()),
      showTime: this.shouldShowTime(Date.now())
    }

    try {
      /* 立即更新本地消息列表（乐观 UI） */
      const messages = [...this.data.messages, message]
      this.setData({
        messages,
        inputContent: '',
        scrollToBottom: true,
        chatLoadStatus: 'success'
      })

      if (!this.data.sessionId) {
        msgLog.warn('⚠️ 无有效会话ID，无法发送消息')
        msgShowToast('会话连接中，请稍后重试')
        const updatedMessages = this.data.messages.filter((msg: any) => msg.id !== message.id)
        this.setData({ messages: updatedMessages })
        return
      }

      if (this.data.wsConnected) {
        /* 主通道: Socket.IO（后端自动写库，回执 message_sent / message_error） */
        try {
          const appInstance = getApp()
          appInstance.emitSocketMessage('send_message', {
            session_id: this.data.sessionId,
            content,
            message_type: 'text'
          })
          msgLog.info('✅ Socket.IO send_message 已发送，等待后端回执')
        } catch (wsError) {
          msgLog.error('❌ Socket.IO emit 异常，降级到 API:', wsError)
          await this.sendMessageViaAPI(message.id, content)
        }
      } else {
        /* 降级通道: REST API */
        msgLog.info('🔄 Socket.IO 未连接，使用 API 发送')
        await this.sendMessageViaAPI(message.id, content)
      }
    } catch (error) {
      msgLog.error('❌ sendMessage函数执行出错:', error)
      msgShowToast('发送消息时出现错误')

      const updatedMessages = this.data.messages.map((msg: any) =>
        msg.id === message.id ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ messages: updatedMessages })
    }
  },

  /**
   * API 降级发送（Socket.IO 不可用时的兜底）
   * 后端路由: POST /api/v4/system/chat/sessions/:id/messages
   */
  async sendMessageViaAPI(localMsgId: string, content: string) {
    try {
      const apiResult = await API.sendChatMessage(this.data.sessionId, {
        content,
        message_type: 'text',
        sender_type: 'user'
      })

      if (apiResult.success) {
        msgLog.info('✅ API 降级发送成功')
        const updatedMessages = this.data.messages.map((msg: any) =>
          msg.id === localMsgId
            ? { ...msg, status: 'sent', id: apiResult.data?.chat_message_id || msg.id }
            : msg
        )
        this.setData({ messages: updatedMessages })
      } else {
        msgLog.error('❌ API 降级发送失败:', apiResult.message)
        const failedMessages = this.data.messages.map((msg: any) =>
          msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
        )
        this.setData({ messages: failedMessages })
      }
    } catch (apiError) {
      msgLog.error('❌ API 降级发送异常:', apiError)
      const failedMessages = this.data.messages.map((msg: any) =>
        msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ messages: failedMessages })
    }
  },

  /**
   * 发送图片 — 上传到后端Sealos对象存储后以image消息发送
   * 后端API: POST /api/v4/system/chat/sessions/:id/upload
   * 安全限制: 5MB大小 + jpg/png/gif/webp类型
   */
  sendImage() {
    if (!this.data.sessionId) {
      msgShowToast('会话连接中，请稍后重试')
      return
    }

    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res: WechatMiniprogram.ChooseMediaSuccessCallbackResult) => {
        const tempFile = res.tempFiles[0]
        if (!tempFile) {
          return
        }

        /* 前端预检: 5MB大小限制 */
        if (tempFile.size > 5 * 1024 * 1024) {
          msgShowToast('图片不能超过5MB')
          return
        }

        msgLog.info('📷 开始上传聊天图片:', {
          size: tempFile.size,
          tempFilePath: tempFile.tempFilePath
        })

        /* 本地乐观消息 */
        const localMsg = {
          id: `img_${Date.now()}`,
          content: tempFile.tempFilePath,
          messageType: 'image',
          isOwn: true,
          status: 'sending',
          timestamp: Date.now(),
          timeText: formatDateMessage(Date.now()),
          showTime: this.shouldShowTime(Date.now())
        }
        this.setData({
          messages: [...this.data.messages, localMsg],
          scrollToBottom: true
        })

        try {
          /* 第1步: 上传图片到后端 */
          const uploadResult: any = await API.uploadChatImage(
            this.data.sessionId,
            tempFile.tempFilePath
          )
          const imageUrl: string = uploadResult.data.image_url

          /* 第2步: 发送image类型消息（content填图片URL） */
          const sendResult = await API.sendChatMessage(this.data.sessionId, {
            content: imageUrl,
            message_type: 'image',
            sender_type: 'user'
          })

          if (sendResult.success) {
            msgLog.info('✅ 图片消息发送成功')
            const updatedMessages = this.data.messages.map((msg: any) =>
              msg.id === localMsg.id
                ? {
                    ...msg,
                    content: imageUrl,
                    status: 'sent',
                    id: sendResult.data?.chat_message_id || msg.id
                  }
                : msg
            )
            this.setData({ messages: updatedMessages })
          }
        } catch (error: any) {
          msgLog.error('❌ 图片发送失败:', error)
          msgShowToast(error.message || '图片发送失败')
          const failedMessages = this.data.messages.map((msg: any) =>
            msg.id === localMsg.id ? { ...msg, status: 'failed' } : msg
          )
          this.setData({ messages: failedMessages })
        }
      }
    })
  },

  /** 发送位置（使用微信地图选择） */
  sendLocation() {
    msgLog.info('📍 发送位置')
    wx.chooseLocation({
      success: (res: WechatMiniprogram.ChooseLocationSuccessCallbackResult) => {
        const locMessage = {
          id: `loc_${Date.now()}`,
          content: `[位置] ${res.name}`,
          messageType: 'location',
          isOwn: true,
          status: 'sent',
          timestamp: Date.now(),
          timeText: formatDateMessage(Date.now()),
          showTime: this.shouldShowTime(Date.now()),
          location: res
        }

        const messages = [...this.data.messages, locMessage]
        this.setData({ messages, scrollToBottom: true, chatLoadStatus: 'success' })
      }
    })
  },

  /** 发送文件（功能开发中） */
  sendFile() {
    msgLog.info('📎 发送文件')
    msgShowToast('文件发送功能开发中')
  },

  /** 预览图片（全屏预览） */
  previewImage(e: WechatMiniprogram.BaseEvent) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({ urls: [src], current: src })
  },

  /** 显示聊天菜单（清空记录、查看信息、举报） */
  showChatMenu() {
    msgLog.info('☰ 显示聊天菜单')
    wx.showActionSheet({
      itemList: ['清空聊天记录', '查看会话信息', '举报'],
      success: (res: WechatMiniprogram.ShowActionSheetSuccessCallbackResult) => {
        switch (res.tapIndex) {
          case 0:
            this.clearChatHistory()
            break
          case 1:
            this.showSessionInfo()
            break
          case 2:
            this.reportChat()
            break
          default:
            break
        }
      }
    })
  },

  /** 清空本地聊天记录 */
  clearChatHistory() {
    wx.showModal({
      title: '清空聊天记录',
      content: '确定要清空当前聊天记录吗？',
      success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (res.confirm) {
          this.setData({ messages: [], chatLoadStatus: 'empty' })
          msgShowToast('聊天记录已清空')
        }
      }
    })
  },

  /** 显示当前会话信息 */
  showSessionInfo() {
    wx.showModal({
      title: '会话信息',
      content: `会话：${this.data.currentChatName}\n状态：${MSG_SESSION_STATUS_MAP[this.data.sessionStatus] || this.data.sessionStatus}`,
      showCancel: false
    })
  },

  /** 举报聊天（功能开发中） */
  reportChat() {
    msgShowToast('举报功能开发中')
  },

  // ============================================================================
  // 事件冒泡阻止（聊天弹窗内部 catchtap）
  // ============================================================================

  /** 遮罩层点击 → 关闭弹窗 */
  onModalMaskTap(e: WechatMiniprogram.BaseEvent) {
    if (e.target === e.currentTarget) {
      this.closeChatModal()
    }
  },

  /* 以下方法均通过 catchtap 阻止事件冒泡到遮罩层 */
  onModalContentTap() {
    /* catchtap阻止冒泡 */
  },
  onMessagesAreaTap() {
    /* catchtap阻止冒泡 */
  },
  onInputAreaTap() {
    /* catchtap阻止冒泡 */
  },
  onInputToolbarTap() {
    /* catchtap阻止冒泡 */
  },
  onInputWrapperTap() {
    /* catchtap阻止冒泡 */
  },
  onTextareaTap() {
    /* catchtap阻止冒泡 */
  },
  onSendWrapperTap() {
    /* catchtap阻止冒泡 */
  },

  /** 内置发送按钮点击 */
  onInlineSendTap() {
    msgLog.info('⌨️ 内置发送按钮被点击')
    this.sendMessage()
  },

  // ============================================================================
  // V6.0 新增交互功能
  // ============================================================================

  /** 切换工具栏展开面板（+按钮，展开时显示相册、拍照、位置、文件等） */
  toggleToolbar() {
    const showToolbar = !this.data.showToolbar
    this.setData({ showToolbar })

    /* 展开工具栏时收起快捷回复 */
    if (showToolbar) {
      this.setData({ showQuickReplies: false })
    }
  },

  /** 切换快捷回复区域的显示/隐藏 */
  toggleQuickReplies() {
    this.setData({ showQuickReplies: !this.data.showQuickReplies })
  },

  /**
   * 快捷回复点击 — 直接发送预设文字
   * @param e - 点击事件，通过 data-text 获取预设文字内容
   */
  onQuickReply(e: WechatMiniprogram.BaseEvent) {
    const replyText = e.currentTarget.dataset.text as string
    if (!replyText) {
      return
    }

    msgLog.info('⚡ 快捷回复:', replyText)
    this.setData({ inputContent: replyText })

    /* 延迟发送确保数据更新 */
    setTimeout(() => {
      this.sendMessage()
    }, 100)
  },

  /** 快捷回复区域点击（阻止冒泡） */
  onQuickRepliesBarTap() {
    /* catchtap阻止冒泡 */
  },

  /**
   * 聊天区域滚动事件 — 控制回到底部按钮显示
   * 当用户向上滚动查看历史消息时，显示"回到底部"浮动按钮
   */
  onChatScroll(e: WechatMiniprogram.ScrollViewScroll) {
    const scrollTop = e.detail.scrollTop
    const scrollHeight = e.detail.scrollHeight
    const clientHeight = (e.detail as any).clientHeight || 500

    /* 距离底部超过200px显示回到底部按钮 */
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const shouldShowBtn = distanceFromBottom > 200

    if (shouldShowBtn !== this.data.showScrollBottomBtn) {
      this.setData({ showScrollBottomBtn: shouldShowBtn })
    }

    /* 滚动到底部时重置新消息计数 */
    if (!shouldShowBtn) {
      this.setData({ newMsgCount: 0 })
    }
  },

  /** 滚动到最新消息（回到底部按钮点击） */
  scrollToLatest() {
    this.setData({ scrollToBottom: true, showScrollBottomBtn: false, newMsgCount: 0 })

    /* 重置scrollToBottom以允许下次触发 */
    setTimeout(() => {
      this.setData({ scrollToBottom: false })
    }, 300)
  },

  /**
   * 重新发送失败的消息
   * @param e - 点击事件，通过 data-id 获取消息ID
   */
  resendMessage(e: WechatMiniprogram.BaseEvent) {
    const messageId = e.currentTarget.dataset.id as string
    if (!messageId) {
      return
    }

    const failedMessage = this.data.messages.find((msg: any) => msg.id === messageId)
    if (!failedMessage) {
      return
    }

    msgLog.info('🔄 重新发送消息:', messageId)

    /* 移除旧的失败消息 */
    const filteredMessages = this.data.messages.filter((msg: any) => msg.id !== messageId)
    this.setData({ messages: filteredMessages })

    /* 重新设置输入内容并发送 */
    this.setData({ inputContent: failedMessage.content })
    setTimeout(() => {
      this.sendMessage()
    }, 100)
  }
}

module.exports = chatMessageHandlers

export {}
