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
 * @file packageUser/chat/chat-message-handlers.ts
 * @version 5.2.0
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
        msgLog.info('无会话ID，显示空状态')
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
            id: msg.chat_message_id,
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
        msgLog.info('成功加载聊天历史:', sortedMessages.length, '条消息')

        this.setData({
          messages: sortedMessages,
          scrollToBottom: true,
          chatLoadStatus: sortedMessages.length > 0 ? 'success' : 'empty'
        })
      } else {
        msgLog.warn('API返回的历史消息为空')
        this.setData({
          messages: [] as API.ChatMessage[],
          scrollToBottom: true,
          chatLoadStatus: 'empty'
        })
      }
    } catch (error) {
      msgLog.error('加载历史消息失败:', error)
      this.setData({ messages: [] as API.ChatMessage[], chatLoadStatus: 'error' })
      msgShowToast('加载历史消息失败')
    } finally {
      this.setData({ isLoadingHistory: false })
    }
  },

  /**
   * 格式化消息时间（统一委托 Utils.formatDateMessage，消除重复逻辑）
   * Utils.formatDateMessage 已包含完整的智能时间显示规则：
   *   <60秒"刚刚"、<60分"N分钟前"、<24小时"N小时前"、昨天、本周、本年、跨年
   */
  formatMessageTime(timeString: string) {
    try {
      const messageTime = new Date(timeString)
      if (isNaN(messageTime.getTime())) {
        return ''
      }
      return Utils.formatDateMessage(messageTime.getTime())
    } catch (error) {
      msgLog.warn('时间格式化失败', error)
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
      msgLog.warn('未登录或Token不存在，无法连接WebSocket')
      return
    }

    const app = getApp()

    if (!app || typeof app.subscribeWebSocketMessages !== 'function') {
      msgLog.error('app对象或WebSocket管理方法不可用')
      wx.showModal({
        title: '连接失败',
        content: '系统初始化未完成，请重启小程序',
        showCancel: false,
        confirmText: '确定'
      })
      return
    }

    msgLog.info('用户端使用统一WebSocket连接')

    /* 订阅WebSocket消息（通过App的Socket.IO页面订阅机制） */
    app.subscribeWebSocketMessages('chat_page', (eventName: string, data: any) => {
      this.handleUnifiedWebSocketMessage(eventName, data)
    })

    app
      .connectWebSocket()
      .then(() => {
        msgLog.info('用户端WebSocket连接成功')
        this.setData({ wsConnected: true, sessionStatus: 'active' })
        wx.showToast({ title: '客服连接成功', icon: 'success', duration: MSG_DELAY.TOAST_LONG })
      })
      .catch((error: any) => {
        msgLog.error('用户端WebSocket连接失败:', error)
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
    msgLog.info('用户端收到Socket.IO消息:', eventName)

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
        msgLog.info('用户端收到新消息:', {
          chat_message_id: data.chat_message_id,
          sender_type: data.sender_type,
          customer_service_session_id: data.customer_service_session_id
        })
        if (data.sender_type === 'user') {
          /*
           * 用户自己发送的消息回显 — 跳过
           *
           * 后端 Socket.IO 对所有订阅者广播 new_message（包括发送者本人），
           * 但前端已通过以下两步处理了自己的消息:
           *   1. sendMessage() 乐观UI — 立即添加本地消息（status: 'sending'）
           *   2. message_sent 确认 — 更新 status → 'sent'，替换临时ID为真实 chat_message_id
           *
           * 如果不跳过，会导致同一条消息在界面出现两次（wx:key 冲突: "Do not set same key"）
           */
          msgLog.info(
            '跳过自己发送的消息回显（已通过乐观UI展示），chat_message_id:',
            data.chat_message_id
          )
        } else if (data.sender_type === 'admin') {
          this.handleAdminMessage(data)
        } else {
          this.addMessage(data)
        }
        break

      /* 消息发送确认（后端写库成功回执: chat_message_id, session_id, timestamp） */
      case 'message_sent':
        msgLog.info('消息发送确认:', data)
        this.handleMessageSentConfirm(data)
        break

      /* 消息发送失败（后端处理出错: error, message, timestamp） */
      case 'message_error':
        msgLog.error('消息发送失败:', data)
        this.handleMessageSendError(data)
        break

      /* 会话关闭（后端: session_id, close_reason） */
      case 'session_closed':
        msgLog.info('会话已关闭:', data)
        this.setData({ sessionStatus: 'closed' })
        this.loadSessionData()
        break

      case 'user_typing':
        this.handleTypingIndicator(data)
        break

      case 'session_status':
        this.updateSessionStatus(data)
        break

      /**
       * 满意度评分邀请（后端 session_closed → 自动推送）
       * 后端事件: satisfaction_request { session_id }
       * 触发: 客服关闭会话时 / 管理端手动点击[请求评分]按钮
       * 前端: 在聊天页底部渲染内嵌评分卡片（非弹窗，不阻断操作）
       */
      case 'satisfaction_request':
        msgLog.info('收到满意度评分邀请:', data)
        this.handleSatisfactionRequest(data)
        break

      /**
       * 会话状态变更通知（后端: session_id, status, ...）
       * 场景: 客服接单(waiting→assigned) / 开始处理(assigned→active) / 关闭(→closed)
       */
      case 'session_update':
        msgLog.info('会话状态变更:', data)
        this.handleSessionUpdate(data)
        break

      default:
        msgLog.info('用户端未处理的消息类型', eventName)
    }
  },

  /**
   * 处理管理员消息
   * 后端统一使用 snake_case 字段: chat_message_id, sender_type, message_type, created_at
   */
  handleAdminMessage(messageData: any) {
    msgLog.info('👨‍💼 处理管理员消息')

    msgLog.info('admin消息字段:', Object.keys(messageData))
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
    msgLog.info('管理员消息处理完成')
  },

  /**
   * 处理 message_sent 确认（后端通过 Socket.IO 写库成功的回执）
   * 后端返回: { chat_message_id, session_id, timestamp }
   * 用于将本地 'sending' 状态的消息更新为 'sent'，并替换临时 ID 为真实 ID
   */
  handleMessageSentConfirm(data: any) {
    msgLog.info('message_sent 字段:', Object.keys(data))
    const serverMsgId = data.chat_message_id
    if (!serverMsgId) {
      return
    }

    /*
     * FIFO: 只更新第一条 status='sending' 的自己消息
     * 快速连发场景: 如果用户连续发送A、B两条消息，后端按序返回确认，
     * 需要确保 A 的确认对应 A 的临时消息，B 的确认对应 B 的临时消息，
     * 而不是把所有 sending 消息都更新为同一个 serverMsgId
     */
    let updated = false
    const messages = this.data.messages.map((msg: any) => {
      if (!updated && msg.isOwn && msg.status === 'sending') {
        updated = true
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
    msgLog.error('后端消息处理失败:', data.message || data.error)

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
      msgLog.warn('app对象或unsubscribeWebSocketMessages方法不可用')
    }

    this.setData({ wsConnected: false, sessionStatus: 'disconnected' })
    msgLog.info('用户端已断开WebSocket连接')
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
    const msgId = messageData.chat_message_id || messageData.id
    /*
     * 去重检查: 防止同一条消息被重复添加
     * 场景: Socket.IO 网络抖动、重连后补推、或 new_message 与 message_sent 竞态
     */
    if (msgId) {
      const exists = this.data.messages.some((msg: any) => msg.id === msgId)
      if (exists) {
        msgLog.info('消息去重 — 已存在相同ID的消息，跳过:', msgId)
        return
      }
    }

    const isOwn =
      messageData.isOwn !== undefined ? messageData.isOwn : messageData.sender_type === 'user'

    const timestamp =
      messageData.timestamp ||
      (messageData.created_at ? new Date(messageData.created_at).getTime() : Date.now())

    const newMessage = {
      id: msgId || `msg_${Date.now()}`,
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
   *
   * 注意: sessions 列表经 processSessionList 处理后，主键字段为 sessionId（非原始 customer_service_session_id）
   */
  updateSessionPreview(content: string) {
    const currentSessionId = this.data.sessionId
    if (!currentSessionId) {
      return
    }

    const updatedSessions = this.data.sessions.map((session: any) => {
      if (String(session.sessionId) === String(currentSessionId)) {
        return {
          ...session,
          preview: `[我] ${content}`
        }
      }
      return session
    })
    this.setData({ sessions: updatedSessions })
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
    /* 发送锁: 防止用户快速连点导致同一条消息被重复发送 */
    if (this._isSending) {
      msgLog.warn('消息正在发送中，忽略重复点击')
      return
    }

    const rawInput = this.data.inputContent
    const content = (rawInput || '').trim()

    msgLog.info('sendMessage 调用', {
      inputContent: rawInput,
      contentLength: content.length,
      sessionId: this.data.sessionId,
      wsConnected: this.data.wsConnected
    })

    if (!content) {
      msgLog.warn('消息内容为空，inputContent 原始值:', JSON.stringify(rawInput))
      msgShowToast('请输入消息内容')
      return
    }

    if (!this.data.sessionId) {
      msgLog.warn('会话ID为空，无法发送消息')
      msgShowToast('会话连接中，请稍后重试')
      return
    }

    this._isSending = true

    const localMsgId = `local_${Date.now()}`
    const message = {
      id: localMsgId,
      content,
      messageType: 'text',
      isOwn: true,
      status: 'sending',
      timestamp: Date.now(),
      timeText: formatDateMessage(Date.now()),
      showTime: this.shouldShowTime(Date.now())
    }

    try {
      /* 立即更新本地消息列表（乐观 UI），同时清空输入框 */
      const localMessages = [...this.data.messages, message]
      this.setData({
        messages: localMessages,
        inputContent: '',
        scrollToBottom: true,
        chatLoadStatus: 'success'
      })

      /* 同步更新会话列表的最后消息预览 */
      this.updateSessionPreview(content)

      const sessionIdNum = Number(this.data.sessionId)
      if (this.data.wsConnected) {
        /* 主通道: Socket.IO（后端自动写库，回执 message_sent / message_error） */
        const appInstance = getApp()
        if (appInstance && typeof appInstance.emitSocketMessage === 'function') {
          const emitOk = appInstance.emitSocketMessage('send_message', {
            session_id: sessionIdNum,
            content,
            message_type: 'text'
          })
          if (emitOk === false) {
            msgLog.warn('Socket.IO 实际未连接，降级到 API')
            await this.sendMessageViaAPI(localMsgId, content)
          } else {
            msgLog.info('Socket.IO send_message 已发送，等待后端回执')
          }
        } else {
          msgLog.warn('app.emitSocketMessage 不可用，降级到 API')
          await this.sendMessageViaAPI(localMsgId, content)
        }
      } else {
        /* 降级通道: REST API */
        msgLog.info('Socket.IO 未连接，使用 API 发送')
        await this.sendMessageViaAPI(localMsgId, content)
      }
    } catch (error) {
      msgLog.error('sendMessage 执行出错:', error)
      msgShowToast('发送消息时出现错误')

      const failedMessages = this.data.messages.map((msg: any) =>
        msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ messages: failedMessages })
    } finally {
      this._isSending = false
    }
  },

  /**
   * API 降级发送（Socket.IO 不可用时的兜底）
   * 后端路由: POST /api/v4/system/chat/sessions/:id/messages
   */
  async sendMessageViaAPI(localMsgId: string, content: string) {
    try {
      const sessionIdNum = Number(this.data.sessionId)
      const apiResult = await API.sendChatMessage(sessionIdNum, {
        content,
        message_type: 'text',
        sender_type: 'user'
      })

      if (apiResult.success) {
        msgLog.info('API 降级发送成功')
        const updatedMessages = this.data.messages.map((msg: any) =>
          msg.id === localMsgId
            ? { ...msg, status: 'sent', id: apiResult.data?.chat_message_id || msg.id }
            : msg
        )
        this.setData({ messages: updatedMessages })
      } else {
        msgLog.error('API 降级发送失败:', apiResult.message)
        const failedMessages = this.data.messages.map((msg: any) =>
          msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
        )
        this.setData({ messages: failedMessages })
      }
    } catch (apiError) {
      msgLog.error('API 降级发送异常:', apiError)
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
            msgLog.info('图片消息发送成功')
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
          msgLog.error('图片发送失败:', error)
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
    msgLog.info('发送位置')
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

  /**
   * 内置发送按钮点击 / textarea键盘发送
   *
   * 触发来源:
   * 1. catchtap="onInlineSendTap" — 点击发送按钮（e.detail 无 value）
   * 2. bindconfirm="onInlineSendTap" — textarea 键盘 send 按钮（e.detail.value 有值）
   *
   * 中文输入法场景: Pinyin 组合结束选词后，bindinput 可能未同步最终值，
   * 通过 bindconfirm 的 e.detail.value 补偿，确保发送时 inputContent 为最新。
   */
  onInlineSendTap(e?: WechatMiniprogram.CustomEvent) {
    msgLog.info('⌨️ 内置发送按钮被点击')

    /* bindconfirm 携带 textarea 最新值，补偿 bindinput 可能的延迟 */
    if (e && e.detail && typeof (e.detail as any).value === 'string') {
      const confirmValue = (e.detail as any).value as string
      if (confirmValue && confirmValue !== this.data.inputContent) {
        msgLog.info('bindconfirm 补偿更新 inputContent')
        this.setData({ inputContent: confirmValue })
      }
    }

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

    msgLog.info('快捷回复:', replyText)
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

    msgLog.info('重新发送消息:', messageId)

    /* 移除旧的失败消息 */
    const filteredMessages = this.data.messages.filter((msg: any) => msg.id !== messageId)
    this.setData({ messages: filteredMessages })

    /* 重新设置输入内容并发送 */
    this.setData({ inputContent: failedMessage.content })
    setTimeout(() => {
      this.sendMessage()
    }, 100)
  },

  // ============================================================================
  // 满意度评分（M1 — 内嵌评分卡片，非弹窗）
  // ============================================================================

  /**
   * 处理满意度评分邀请（后端推送 satisfaction_request 事件）
   *
   * 触发场景:
   *   1. 客服关闭会话 → 后端自动推送 satisfaction_request
   *   2. 管理端手动点击 [请求评分] 按钮
   *
   * 前端行为: 显示内嵌评分卡片，24小时未评分保持 NULL
   *
   * @param data - { session_id } 后端推送的数据
   */
  handleSatisfactionRequest(data: any) {
    const targetSessionId = data.session_id || data.customer_service_session_id
    const currentSessionId = Number(this.data.sessionId)

    if (targetSessionId && Number(targetSessionId) === currentSessionId) {
      this.setData({
        showSatisfactionCard: true,
        satisfactionSessionId: targetSessionId,
        satisfactionScore: 0,
        satisfactionSubmitted: false
      })
      msgLog.info('显示满意度评分卡片，会话ID:', targetSessionId)
    }
  },

  /**
   * 用户选择评分星级（1-5星）
   * @param e - 点击事件，通过 data-score 获取选择的星级
   */
  onSelectSatisfactionScore(e: WechatMiniprogram.BaseEvent) {
    const selectedScore = Number(e.currentTarget.dataset.score)
    if (selectedScore >= 1 && selectedScore <= 5) {
      this.setData({ satisfactionScore: selectedScore })
    }
  },

  /**
   * 提交满意度评分
   * 后端API: POST /api/v4/system/chat/sessions/:id/rate
   * 请求体: { score: 1-5 }
   */
  async submitSatisfaction() {
    const targetScore = this.data.satisfactionScore
    const targetSessionId = this.data.satisfactionSessionId

    if (!targetScore || targetScore < 1 || targetScore > 5) {
      msgShowToast('请先选择评分')
      return
    }

    if (!targetSessionId) {
      msgShowToast('会话信息异常')
      return
    }

    try {
      const rateResult = await API.rateSession(Number(targetSessionId), targetScore)

      if (rateResult.success) {
        this.setData({
          satisfactionSubmitted: true,
          showSatisfactionCard: false
        })
        msgShowToast('感谢您的评价')
        msgLog.info('满意度评分提交成功:', targetScore)
      } else {
        msgShowToast(rateResult.message || '评分提交失败')
      }
    } catch (error: any) {
      msgLog.error('满意度评分提交失败:', error)
      msgShowToast(error.message || '评分提交失败，请稍后重试')
    }
  },

  /** 关闭满意度评分卡片（用户选择不评分） */
  dismissSatisfaction() {
    this.setData({ showSatisfactionCard: false })
    msgLog.info('用户关闭评分卡片，评分保持NULL')
  },

  // ============================================================================
  // 会话状态变更（M4 — WebSocket事件对齐）
  // ============================================================================

  /**
   * 处理 session_update 事件（后端推送会话状态变更）
   *
   * 场景:
   *   - 客服接单: waiting → assigned（显示"客服已接单"提示）
   *   - 开始处理: assigned → active（显示"客服正在处理"提示）
   *   - 关闭会话: → closed（触发满意度评分）
   *
   * @param data - { session_id, status, admin_name?, ... }
   */
  handleSessionUpdate(data: any) {
    const targetSessionId = data.session_id || data.customer_service_session_id
    const currentSessionId = Number(this.data.sessionId)

    if (targetSessionId && Number(targetSessionId) === currentSessionId) {
      const newStatus = data.status
      this.setData({ sessionStatus: newStatus })

      if (newStatus === 'assigned') {
        msgShowToast('客服已接单')
      } else if (newStatus === 'active') {
        msgShowToast('客服正在处理')
      } else if (newStatus === 'closed') {
        this.loadSessionData()
      }
    }

    /* 刷新会话列表以同步最新状态 */
    this.loadSessionData()
  }
}

module.exports = chatMessageHandlers
