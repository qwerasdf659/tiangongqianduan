/**
 * 管理员实时客服聊天页面 + MobX响应式状态
 *
 * 功能：实时聊天、会话管理、快捷回复
 *
 * 后端API：
 * - GET /api/v4/console/customer-service/sessions  （管理员会话列表）
 * - GET /api/v4/console/customer-service/sessions/:id/messages  （会话消息历史）
 * - POST /api/v4/system/chat/sessions/:id/messages  （发送消息）
 * - POST /api/v4/console/customer-service/sessions/:id/close  （关闭会话）
 *
 * 后端响应字段均为 snake_case，前端直接使用后端字段名。
 *
 * @file packageAdmin/customer-service/customer-service.ts
 * @version 5.2.0
 * @since 2026-02-15
 */

const { Wechat, API, Utils, Logger } = require('../../utils/index')
const log = Logger.createLogger('customer-service')
const { showToast } = Wechat
const { checkAdmin, formatDateMessage } = Utils

// MobX Store绑定 - 用户认证状态自动同步
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 会话状态文案映射（对应后端 customer_service_sessions.status 字段）
 */
const SESSION_STATUS_MAP: Record<string, string> = {
  waiting: '等待客服',
  assigned: '已分配',
  active: '对话中',
  closed: '已结束'
}

Page({
  data: {
    // 权限验证
    isAdmin: false,
    userInfo: null,

    // 实时聊天模式数据（后端 GET /api/v4/console/chat/sessions 返回）
    sessions: [] as API.ChatSession[],
    currentSessionId: null as number | null,
    currentSessionUserName: '',
    currentMessages: [] as API.ChatMessage[],
    loadingSessions: false,
    inputContent: '',
    isTyping: false,

    // 布局控制 - 聊天面板是否展开全屏显示
    chatExpanded: false,

    // 聊天工作台功能
    adminStatus: 'online', // online, busy, offline
    wsConnected: false,
    reconnectCount: 0,
    scrollToBottom: false,
    showQuickReplies: false,

    // Socket.IO 连接质量（心跳+重连由 Socket.IO 内建管理）
    connectionQuality: 'good', // good, poor, lost

    // 发送按钮状态
    sendButtonEnabled: false,

    // 快捷回复模板
    quickReplies: [
      { id: 1, title: '欢迎', content: '您好！很高兴为您服务，请问有什么可以帮助您的吗？' },
      { id: 2, title: '稍等', content: '好的，请您稍等片刻，我来为您查询处理。' },
      { id: 3, title: '核实信息', content: '为了更好的为您处理，请提供您的订单号或联系方式。' },
      { id: 4, title: '感谢', content: '感谢您的耐心等待，如还有其他问题请随时联系我们。' },
      { id: 5, title: '结束', content: '本次服务到此结束，祝您生活愉快！如有问题请随时联系。' }
    ],

    // 今日工作统计
    todayStats: {
      totalSessions: 0,
      completedSessions: 0,
      avgResponseTime: '--',
      customerSatisfaction: 0
    }
  },

  onLoad() {
    log.info('📊 管理员实时客服聊天页面加载')

    // MobX Store绑定 - 用户认证状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 使用统一的管理员权限检查
    if (!checkAdmin()) {
      log.warn('⚠️ 管理员权限检查失败，已自动处理')
      return
    }

    this.initChatWorkspace()
    this.updateSendButtonState()
  },

  onShow() {
    log.info('📱 管理员客服页面显示')

    if (!checkAdmin()) {
      return
    }

    // 页面显示时刷新会话列表
    this.refreshSessions()
  },

  // 页面卸载时清理资源
  onUnload() {
    log.info('📱 管理员客服页面卸载，清理资源')

    // 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }

    // 取消 Socket.IO 消息订阅（心跳无需手动停止，Socket.IO 内建管理）
    const appInstance = getApp()
    if (appInstance && typeof appInstance.unsubscribeWebSocketMessages === 'function') {
      appInstance.unsubscribeWebSocketMessages('admin_customer_service')
    }

    this.setData({
      wsConnected: false,
      connectionQuality: 'lost'
    })
  },

  // ============================================================================
  // 初始化
  // ============================================================================

  /** 初始化聊天工作台 */
  async initChatWorkspace() {
    try {
      const userInfo = userStore.userInfo
      if (userInfo) {
        this.setData({
          adminInfo: {
            id: userInfo.user_id,
            name: userInfo.nickname || '管理员',
            avatar: userInfo.avatar_url
          }
        })
      }

      await this.connectWebSocket()
      await this.refreshSessions()
      await this.loadAdminTodayStats()

      // 进入页面时自动更新管理员在线状态为 online
      this.updateOnlineStatus('online')
    } catch (error) {
      log.error('❌ 初始化聊天工作台失败:', error)
    }
  },

  // ============================================================================
  // WebSocket连接管理
  // ============================================================================

  /** 连接 Socket.IO（使用统一 Socket.IO 管理，心跳+重连由 Socket.IO 内建） */
  async connectWebSocket() {
    const appInstance = getApp()

    if (!appInstance || typeof appInstance.subscribeWebSocketMessages !== 'function') {
      log.error('❌ Socket.IO管理方法不可用')
      throw new Error('Socket.IO管理系统未就绪')
    }

    log.info('🔒 管理员端使用统一Socket.IO连接')

    // 订阅Socket.IO消息
    appInstance.subscribeWebSocketMessages(
      'admin_customer_service',
      (eventName: string, data: any) => {
        this.handleUnifiedWebSocketMessage(eventName, data)
      }
    )

    try {
      await appInstance.connectWebSocket()

      log.info('✅ 管理员端Socket.IO连接成功')
      this.setData({
        wsConnected: true,
        reconnectCount: 0,
        connectionQuality: 'good'
      })

      this.registerAsAdmin()
    } catch (error) {
      log.error('❌ 管理员端Socket.IO连接失败:', error)
      this.setData({
        wsConnected: false,
        connectionQuality: 'lost'
      })
      throw error
    }
  },

  /** 注册为管理员（通过 Socket.IO emit） */
  registerAsAdmin() {
    if (!this.data.wsConnected) {
      return
    }

    const appInstance = getApp()
    appInstance.emitSocketMessage('admin_register', {
      adminId: this.data.userInfo?.userId,
      adminName: this.data.userInfo?.nickname || '管理员'
    })
    log.info('✅ 管理员注册消息已发送')
  },

  /**
   * 处理统一Socket.IO消息（对齐后端 ChatWebSocketService 事件协议）
   *
   * 后端事件协议:
   * - connection_established: { user_id, is_admin, socket_id, server_time }
   * - new_message: { chat_message_id, content, sender_type, session_id, ... }
   * - message_sent: { chat_message_id, session_id, timestamp } — 发送确认
   * - message_error: { error, message, timestamp } — 发送失败
   * - session_closed: { session_id, close_reason, ... }
   */
  handleUnifiedWebSocketMessage(eventName: string, data: any) {
    log.info('📢 管理员端收到Socket.IO消息:', eventName)

    switch (eventName) {
      case 'websocket_connected':
        this.setData({
          wsConnected: true,
          connectionQuality: 'good'
        })
        this.registerAsAdmin()
        break

      case 'websocket_error':
      case 'websocket_closed':
        this.setData({
          wsConnected: false,
          connectionQuality: 'lost'
        })
        break

      case 'websocket_max_reconnect_reached':
        this.setData({ connectionQuality: 'lost' })
        showToast('连接已断开，请刷新页面重试')
        break

      // 后端连接确认
      case 'connection_established':
        log.info('🤝 后端连接确认:', data)
        break

      // 新消息（后端 snake_case: chat_message_id, content, sender_type, session_id）
      case 'new_message':
        this.handleNewUserMessage(data)
        break

      // 消息发送确认（后端写库成功: chat_message_id, session_id, timestamp）
      case 'message_sent':
        log.info('✅ 消息发送确认:', data)
        this.handleMessageSentConfirm(data)
        break

      // 消息发送失败（后端处理出错: error, message, timestamp）
      case 'message_error':
        log.error('❌ 消息发送失败:', data)
        this.handleMessageSendError(data)
        break

      case 'session_started':
        this.handleSessionStarted(data)
        break

      // 会话关闭（后端: session_id, close_reason）
      case 'session_closed':
        this.handleSessionClosed(data)
        break

      default:
        log.info('🔧 管理员端未处理的消息类型:', eventName)
    }
  },

  /**
   * 处理新用户消息
   * 后端统一使用 snake_case 字段: chat_message_id, sender_type, session_id, created_at
   */
  handleNewUserMessage(messageData: any) {
    if (!messageData || !messageData.content) {
      log.warn('⚠️ 收到空消息或格式错误的消息')
      return
    }

    // 后端字段: session_id（snake_case）
    const msgSessionId = messageData.session_id

    if (msgSessionId === this.data.currentSessionId) {
      const senderType = messageData.sender_type || 'user'
      const newMessage = {
        id: messageData.chat_message_id || `msg_${Date.now()}`,
        senderId: messageData.sender_id,
        senderType,
        content: String(messageData.content || ''),
        messageType: messageData.message_type || 'text',
        createdAt: messageData.created_at || new Date().toISOString(),
        isOwn: senderType === 'admin'
      }

      this.setData({
        currentMessages: [...this.data.currentMessages, newMessage],
        scrollToBottom: true
      })
    }

    // 实时消息到达时刷新会话列表
    this.refreshSessions()
  },

  /**
   * 处理 message_sent 确认（后端写库成功回执）
   * 后端返回: { chat_message_id, session_id, timestamp }
   */
  handleMessageSentConfirm(data: any) {
    const serverMsgId = data.chat_message_id
    if (!serverMsgId) {
      return
    }

    const updatedMessages = this.data.currentMessages.map((msg: any) => {
      if (msg.isOwn && msg.status === 'sending') {
        return { ...msg, status: 'sent', id: serverMsgId }
      }
      return msg
    })
    this.setData({ currentMessages: updatedMessages })
  },

  /**
   * 处理 message_error（后端处理 send_message 失败回执）
   * 后端返回: { error, message, timestamp }
   */
  handleMessageSendError(data: any) {
    log.error('❌ 后端消息处理失败:', data.message || data.error)

    const failedMessages = this.data.currentMessages.map((msg: any) => {
      if (msg.isOwn && msg.status === 'sending') {
        return { ...msg, status: 'failed' }
      }
      return msg
    })
    this.setData({ currentMessages: failedMessages })
    showToast(data.message || '消息发送失败')
  },

  /** 处理会话开始 */
  handleSessionStarted(_sessionData: any) {
    log.info('🆕 新会话开始')
    this.refreshSessions()
  },

  /** 处理会话关闭（后端 session_closed 事件: session_id, close_reason） */
  handleSessionClosed(sessionData: any) {
    const closedSessionId = sessionData.session_id
    log.info('🔚 会话关闭:', closedSessionId, sessionData.close_reason)

    if (closedSessionId === this.data.currentSessionId) {
      this.setData({
        currentSessionId: null,
        currentMessages: [] as API.ChatMessage[],
        chatExpanded: false
      })
    }
    this.refreshSessions()
  },

  // ✅ 心跳：已删除，Socket.IO 内建心跳（25秒一次）
  // ✅ 重连：已删除，Socket.IO 内建重连（指数退避）

  // ============================================================================
  // 会话列表管理
  // ============================================================================

  /**
   * 刷新会话列表
   *
   * 后端API: GET /api/v4/console/customer-service/sessions
   *
   * 后端返回字段（snake_case）:
   * - customer_service_session_id: 会话主键
   * - user: { user_id, nickname, mobile }
   * - admin: { user_id, nickname } | null
   * - status: 'waiting' | 'assigned' | 'active' | 'closed'
   * - last_message: { chat_message_id, content, sender_type, created_at } | null
   * - unread_count: 未读消息数
   * - updated_at: 最后更新时间
   * - created_at: 创建时间
   */
  async refreshSessions() {
    try {
      this.setData({ loadingSessions: true })

      const result = await API.getAdminChatSessions({
        status: 'active',
        page: 1,
        pageSize: 50
      })

      if (result.success && result.data) {
        const rawSessions = result.data.sessions || []

        // 直接使用后端 snake_case 字段，不做兼容性转换
        const processedSessions = rawSessions.map((session: any) => {
          // 用户信息（后端字段: user 对象）
          const user = session.user || {}
          const userName = user.nickname || (user.user_id ? `用户${user.user_id}` : '未知用户')

          // 最后消息预览（后端字段: last_message 对象，取 .content）
          let lastMessagePreview = '等待客服回复...'
          if (session.last_message && session.last_message.content) {
            lastMessagePreview = String(session.last_message.content)
          }

          // 时间格式化（后端字段: updated_at / last_message_at）
          const timeSource =
            session.last_message_at || session.updated_at || session.created_at || ''
          const formattedTime = timeSource ? formatDateMessage(timeSource) : ''

          // 未读消息数（后端字段: unread_count）
          const unreadCount = parseInt(session.unread_count) || 0

          // 会话状态标准化（后端字段: status）
          const status = session.status || 'waiting'

          return {
            sessionId: session.customer_service_session_id,
            userId: user.user_id,
            userInfo: {
              nickname: userName,
              userId: user.user_id
            },
            lastMessage: lastMessagePreview,
            lastMessageTime: formattedTime,
            unreadCount,
            status,
            statusText: SESSION_STATUS_MAP[status] || '未知',
            createdAt: session.created_at,
            updatedAt: session.updated_at
          }
        })

        this.setData({
          sessions: processedSessions,
          loadingSessions: false
        })

        log.info('✅ 会话列表刷新成功:', processedSessions.length, '个会话')
      } else {
        throw new Error(result.message || '获取会话列表失败')
      }
    } catch (error) {
      log.error('❌ 刷新会话列表失败:', error)
      this.setData({ loadingSessions: false })
      showToast('获取会话列表失败，请稍后重试')
    }
  },

  // ============================================================================
  // 会话选择与消息加载
  // ============================================================================

  /** 选择会话 */
  onSelectSession(e: WechatMiniprogram.BaseEvent) {
    const sessionId = e.currentTarget.dataset.sessionId
    log.info('📋 选择会话:', sessionId)

    if (sessionId === this.data.currentSessionId) {
      this.setData({ chatExpanded: !this.data.chatExpanded })
      return
    }

    const currentSession = this.data.sessions.find((s: any) => s.sessionId === sessionId)
    const currentSessionUserName = currentSession?.userInfo?.nickname || '用户'

    this.setData({
      currentSessionId: sessionId,
      currentSessionUserName,
      currentMessages: [] as API.ChatMessage[],
      scrollToBottom: true,
      chatExpanded: true
    })

    this.updateSendButtonState()
    this.loadSessionMessages(sessionId)
  },

  /** 关闭展开模式 */
  onCloseChatExpanded() {
    this.setData({ chatExpanded: false })
  },

  /**
   * 加载会话消息历史
   *
   * 后端API: GET /api/v4/console/customer-service/sessions/:id/messages
   *
   * 后端返回消息字段（snake_case）:
   * - chat_message_id: 消息主键
   * - content: 消息内容
   * - sender_type: 'user' | 'admin' | 'system'
   * - message_type: 'text' | 'image' | 'system'
   * - created_at: 创建时间（ISO 8601）
   */
  async loadSessionMessages(sessionId: number) {
    try {
      log.info('📖 加载会话消息:', sessionId)

      const result = await API.getAdminChatHistory({
        sessionId,
        page: 1,
        pageSize: 50
      })

      if (result.success && result.data) {
        const rawMessages = result.data.messages || []

        const messages = rawMessages.map((msg: any) => {
          // 后端字段统一 snake_case: sender_type, chat_message_id, created_at
          const senderType = msg.sender_type || 'user'
          const isOwn = senderType === 'admin'

          return {
            id: msg.chat_message_id || msg.id,
            senderId: msg.sender_id,
            senderType,
            content: msg.content || '',
            messageType: msg.message_type || 'text',
            createdAt: msg.created_at || '',
            isOwn
          }
        })

        // 按时间升序排列：旧消息在前，新消息在后
        const sortedMessages = messages.sort((a: any, b: any) => {
          const timeA = new Date(a.createdAt).getTime()
          const timeB = new Date(b.createdAt).getTime()
          return timeA - timeB
        })

        this.setData({
          currentMessages: sortedMessages,
          scrollToBottom: true
        })

        log.info('✅ 会话消息加载成功:', sortedMessages.length, '条')
      }
    } catch (error) {
      log.error('❌ 加载会话消息失败:', error)
    }
  },

  // ============================================================================
  // 输入与发送
  // ============================================================================

  /** 聊天输入框内容变化 */
  onChatInputChange(e: WechatMiniprogram.Input) {
    const content = e.detail.value
    this.setData({ inputContent: content })
    this.updateSendButtonState()

    if (content.trim()) {
      this.startTyping()
    } else {
      this.stopTyping()
    }
  },

  /** 输入框获得焦点 */
  onChatInputFocus() {
    this.setData({ scrollToBottom: true })
  },

  /** 输入框失去焦点 */
  onChatInputBlur() {
    // 预留
  },

  /**
   * 发送聊天消息
   *
   * 发送流程：
   * 1. 验证输入内容和会话ID
   * 2. 乐观更新本地消息列表（status: 'sending'）
   * 3. 通过API发送消息到后端（持久化存储）
   * 4. 通过WebSocket发送实时通知
   * 5. 更新消息状态（sent / failed）
   */
  async sendChatMessage() {
    // 立即保存输入内容（防止被异步操作影响）
    const originalInputContent = this.data.inputContent
    const content = originalInputContent ? originalInputContent.trim() : ''

    if (!content) {
      wx.showToast({ title: '请输入消息内容', icon: 'none' })
      return
    }

    if (!this.data.currentSessionId) {
      wx.showToast({ title: '请先选择一个聊天会话', icon: 'none' })
      return
    }

    log.info('📤 发送管理员消息:', content.substring(0, 30))

    const tempMessage = {
      id: `temp_${Date.now()}`,
      senderId: this.data.userInfo?.userId,
      senderType: 'admin',
      content,
      messageType: 'text',
      status: 'sending',
      createdAt: new Date().toISOString(),
      isOwn: true
    }

    try {
      // 清空输入框，乐观更新UI
      this.setData({ inputContent: '' })
      this.stopTyping()
      this.setData({
        currentMessages: [...this.data.currentMessages, tempMessage],
        scrollToBottom: true
      })

      /**
       * 发送策略: Socket.IO 优先（后端自动写库 + 回执），API 降级兜底
       *
       * Socket.IO 通道: emit('send_message', { session_id, content, message_type })
       *   → 后端自动写库 → 回推 message_sent / message_error
       *
       * API 降级: POST /api/v4/system/chat/sessions/:id/messages
       */
      if (this.data.wsConnected) {
        // 主通道: Socket.IO（后端自动写库，回执 message_sent / message_error）
        try {
          const appInstance = getApp()
          appInstance.emitSocketMessage('send_message', {
            session_id: this.data.currentSessionId,
            content,
            message_type: 'text'
          })
          log.info('✅ Socket.IO send_message 已发送，等待后端回执')
          // 状态由 handleMessageSentConfirm / handleMessageSendError 自动更新
        } catch (wsError) {
          log.error('❌ Socket.IO emit 异常，降级到 API:', wsError)
          await this.sendMessageViaAPI(tempMessage.id, content)
        }
      } else {
        // 降级通道: REST API
        log.info('🔄 Socket.IO 未连接，使用 API 发送')
        await this.sendMessageViaAPI(tempMessage.id, content)
      }
    } catch (error) {
      log.error('❌ 发送聊天消息失败:', error)

      const failedMessages = this.data.currentMessages.map((msg: any) =>
        msg.id === tempMessage.id ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ currentMessages: failedMessages })

      showToast('消息发送失败，请重试')
    }
  },

  /**
   * API 降级发送（Socket.IO 不可用时的兜底）
   * 后端路由: POST /api/v4/system/chat/sessions/:id/messages
   */
  async sendMessageViaAPI(localMsgId: string, content: string) {
    try {
      const apiResult = await API.sendChatMessage(this.data.currentSessionId, {
        content,
        message_type: 'text',
        sender_type: 'admin'
      })

      if (apiResult && apiResult.success === true) {
        log.info('✅ API 降级发送成功')
        const updatedMessages = this.data.currentMessages.map((msg: any) =>
          msg.id === localMsgId
            ? { ...msg, status: 'sent', id: apiResult.data?.chat_message_id || msg.id }
            : msg
        )
        this.setData({ currentMessages: updatedMessages })
      } else {
        log.error('❌ API 降级发送失败:', apiResult?.message)
        const failedMessages = this.data.currentMessages.map((msg: any) =>
          msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
        )
        this.setData({ currentMessages: failedMessages })
      }
    } catch (apiError: any) {
      log.error('❌ API 降级发送异常:', apiError.message)
      const failedMessages = this.data.currentMessages.map((msg: any) =>
        msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
      )
      this.setData({ currentMessages: failedMessages })
    }
  },

  // ============================================================================
  // 输入状态管理
  // ============================================================================

  /** 开始输入状态（通过 Socket.IO emit） */
  startTyping() {
    if (!this.data.wsConnected || !this.data.currentSessionId || this.data.isTyping) {
      return
    }

    this.setData({ isTyping: true })

    const appInstance = getApp()
    appInstance.emitSocketMessage('admin_typing_start', {
      sessionId: this.data.currentSessionId,
      adminId: this.data.userInfo?.userId
    })
  },

  /** 停止输入状态（通过 Socket.IO emit） */
  stopTyping() {
    if (!this.data.wsConnected || !this.data.currentSessionId || !this.data.isTyping) {
      return
    }

    this.setData({ isTyping: false })

    const appInstance = getApp()
    appInstance.emitSocketMessage('admin_typing_stop', {
      sessionId: this.data.currentSessionId,
      adminId: this.data.userInfo?.userId
    })
  },

  // ============================================================================
  // 快捷回复
  // ============================================================================

  /** 切换快捷回复面板 */
  toggleQuickReplies() {
    this.setData({ showQuickReplies: !this.data.showQuickReplies })
  },

  /** 选择快捷回复 */
  onQuickReplySelect(e: WechatMiniprogram.BaseEvent) {
    const content = e.currentTarget.dataset.content
    this.setData({ inputContent: content, showQuickReplies: false })
  },

  // ============================================================================
  // 会话管理操作
  // ============================================================================

  /**
   * 结束会话
   * 后端API: POST /api/v4/console/customer-service/sessions/:id/close
   */
  async onEndSession() {
    if (!this.data.currentSessionId) {
      showToast('请先选择一个会话')
      return
    }

    log.info('🔚 结束会话:', this.data.currentSessionId)

    try {
      const result = await API.closeAdminChatSession(this.data.currentSessionId)

      if (result.success) {
        this.setData({
          currentSessionId: null,
          currentMessages: [] as API.ChatMessage[],
          chatExpanded: false
        })

        this.refreshSessions()
        showToast('会话已结束')
      } else {
        throw new Error(result.message || '结束会话失败')
      }
    } catch (error) {
      log.error('❌ 结束会话失败:', error)
      showToast('结束会话失败，请重试')
    }
  },

  // ============================================================================
  // 统计信息
  // ============================================================================

  /**
   * 加载今日客服统计
   *
   * 后端API: GET /api/v4/console/customer-service/sessions/stats
   * 可选参数: ?admin_id=31（筛选指定客服的统计）
   *
   * 后端返回字段:
   *   total_sessions       - 总会话数
   *   completed_sessions   - 已完成会话数
   *   avg_response_time    - 平均响应时间
   *   customer_satisfaction - 客户满意度
   */
  async loadAdminTodayStats() {
    try {
      const result = await API.getAdminSessionStats()

      if (result.success && result.data) {
        this.setData({
          todayStats: {
            totalSessions: result.data.total_sessions || 0,
            completedSessions: result.data.completed_sessions || 0,
            avgResponseTime: result.data.avg_response_time || '--',
            customerSatisfaction: result.data.customer_satisfaction || 0
          }
        })
        log.info('📊 客服统计加载成功:', result.data)
      } else {
        log.warn('⚠️ 客服统计API返回空数据，使用默认值')
        this.setData({
          todayStats: {
            totalSessions: 0,
            completedSessions: 0,
            avgResponseTime: '--',
            customerSatisfaction: 0
          }
        })
      }
    } catch (error) {
      log.error('❌ 加载今日统计失败:', error)
      // 统计加载失败不影响主流程
    }
  },

  // ============================================================================
  // 按钮状态管理
  // ============================================================================

  /** 更新发送按钮状态 */
  updateSendButtonState() {
    const hasContent = !!(this.data.inputContent && this.data.inputContent.trim())
    const hasSession = !!this.data.currentSessionId
    const shouldEnable = hasContent && hasSession

    if (this.data.sendButtonEnabled !== shouldEnable) {
      this.setData({ sendButtonEnabled: shouldEnable })
    }
  },

  // ============================================================================
  // 资源清理
  // ============================================================================

  /**
   * 更新管理员在线状态
   *
   * 后端API: POST /api/v4/console/customer-service/sessions/status
   * 状态枚举: 'online' | 'busy' | 'offline'
   * 存储: Redis（4小时自动过期，未设置或过期视为offline）
   */
  async updateOnlineStatus(status: 'online' | 'busy' | 'offline') {
    try {
      const result = await API.updateAdminOnlineStatus(status)
      if (result.success) {
        this.setData({ adminStatus: status })
        log.info(`✅ 管理员在线状态更新为: ${status}`)
      }
    } catch (error) {
      log.error('❌ 更新在线状态失败:', error)
      // 状态更新失败不影响主流程
    }
  },

  /** 切换管理员在线状态（供页面按钮调用） */
  onToggleAdminStatus(e: WechatMiniprogram.BaseEvent) {
    const status = e.currentTarget.dataset.status as 'online' | 'busy' | 'offline'
    if (status && ['online', 'busy', 'offline'].includes(status)) {
      this.updateOnlineStatus(status)
    }
  },

  /** 清理所有资源 */
  cleanup() {
    this.stopTyping()

    // 离开页面时更新管理员状态为 offline
    this.updateOnlineStatus('offline')

    // 取消 Socket.IO 消息订阅
    const appInstance = getApp()
    if (appInstance && typeof appInstance.unsubscribeWebSocketMessages === 'function') {
      appInstance.unsubscribeWebSocketMessages('admin_customer_service')
    }

    this.setData({
      wsConnected: false,
      currentSessionId: null,
      currentMessages: [] as API.ChatMessage[],
      sessions: [] as API.ChatSession[]
    })
  }
})

export {}
