// pages/chat/chat.ts - 聊天会话页面 + MobX响应式状态
// 🔴 统一工具函数导入
const { Utils, Wechat, API, Constants, Logger } = require('../../utils/index')
const log = Logger.createLogger('chat')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat
const { DELAY, TIME } = Constants
// 🆕 MobX Store绑定 - 用户登录状态自动同步
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 会话状态文案映射（对应后端 customer_service_sessions.status 字段）
 * waiting: 等待分配客服
 * assigned: 已分配客服
 * active: 对话进行中
 * closed: 会话已结束
 */
const SESSION_STATUS_MAP: Record<string, string> = {
  waiting: '等待客服',
  assigned: '已分配',
  active: '对话中',
  closed: '已结束'
}

Page({
  data: {
    // 搜索相关
    searchKeyword: '',

    // 会话列表（直接使用后端API返回的sessions数组，字段按后端实际返回格式）
    sessions: [] as any[],

    // 页面加载状态: loading=骨架屏 | success=正常显示 | error=错误+重试
    sessionLoadStatus: 'loading',

    // 总未读数
    totalUnreadCount: 0,

    // 弹窗聊天相关
    showChatModal: false,
    currentChatName: '在线客服',
    currentChatIcon: '🎧',

    // 聊天消息
    messages: [] as any[],
    inputContent: '',
    inputFocused: false,
    isLoadingHistory: false,
    scrollToBottom: false,
    showTypingIndicator: false,
    typingUser: '',

    // 聊天区域状态: idle | loading | success | empty | error
    chatLoadStatus: 'idle',

    // WebSocket相关
    wsConnected: false,
    sessionId: '',
    userId: '',
    token: '',

    // 会话状态
    sessionStatus: 'connecting',

    // UI交互状态 - V6.0新增
    showToolbar: false, // 工具栏展开面板
    showQuickReplies: true, // 快捷回复区域
    showScrollBottomBtn: false, // 回到底部浮动按钮
    newMsgCount: 0 // 新消息计数（滚动到底部时重置）
  },

  /**
   * 生命周期函数--监听页面加载
   *
   * @description
   * 聊天会话列表页面入口函数，初始化用户信息和加载会话数据。
   *
   * **初始化流程**：
   * 1. 绑定MobX Store（用户登录状态）
   * 2. 检查用户登录状态（未登录自动跳转到登录页）
   * 3. 初始化用户信息（userId, token）
   * 4. 加载客服会话列表数据
   */
  onLoad(_options: Record<string, string | undefined>) {
    log.info('🚀 聊天会话列表页面加载')

    // 🆕 MobX Store绑定 - 用户登录状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userId'],
      actions: []
    })

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    this.initializeUser()
    // 🔴 标记首次加载，避免onShow中重复调用
    this._isFirstLoad = true
    this.loadSessionData()
  },

  onShow() {
    log.info('📱 聊天页面显示')

    // 🔴 首次加载时onLoad已调用loadSessionData，跳过onShow中的重复调用
    if (this._isFirstLoad) {
      this._isFirstLoad = false
      return
    }

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    // 从其他页面返回时刷新会话数据
    this.loadSessionData()
  },

  // 页面卸载时清理资源
  onUnload() {
    log.info('📱 聊天页面卸载，清理WebSocket订阅')
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    this.disconnectWebSocket()
  },

  // 下拉刷新
  async onPullDownRefresh() {
    log.info('🔄 下拉刷新会话列表')
    await this.loadSessionData()
    wx.stopPullDownRefresh()
  },

  /**
   * 初始化用户信息
   *
   * @description
   * 从MobX Store获取用户信息和Token，用于后续API调用和WebSocket连接。
   */
  initializeUser() {
    if (userStore.isLoggedIn) {
      this.setData({
        userId: userStore.userInfo?.user_id || '',
        token: userStore.accessToken || ''
      })

      log.info('✅ 用户信息初始化完成', {
        userId: this.data.userId,
        hasToken: !!this.data.token
      })
    }
  },

  // ============================================================================
  // 会话列表数据管理
  // ============================================================================

  /**
   * 加载所有会话列表数据
   *
   * @description
   * 调用 getChatSessions() API，直接使用后端返回的 sessions 数组渲染列表。
   * 后端字段: customer_service_session_id, status, last_message(object), unread_count, updated_at
   * 使用 sessionLoadStatus 管理加载/成功/错误三种状态。
   */
  async loadSessionData() {
    log.info('📊 开始加载会话数据')
    this.setData({ sessionLoadStatus: 'loading' })

    try {
      const result = await API.getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const rawSessions = result.data.sessions
        log.info('✅ 会话列表数据获取成功，共', rawSessions.length, '个会话')

        this.processSessionList(rawSessions)
        this.setData({ sessionLoadStatus: 'success' })
      } else {
        log.warn('⚠️ 后端未返回有效的会话列表数据')
        // 空列表也是正常状态，设为success
        this.setData({ sessions: [] as any[], sessionLoadStatus: 'success' })
      }

      this.updateTotalUnreadCount()
    } catch (error) {
      log.error('❌ 加载会话数据失败:', error)
      this.setData({ sessionLoadStatus: 'error' })
      showToast('加载会话数据失败')
    }
  },

  /**
   * 处理后端返回的会话列表，映射为前端展示所需格式
   *
   * @param rawSessions - 后端返回的原始会话数组
   *
   * 后端每条会话字段：
   * - customer_service_session_id: 会话主键
   * - status: 'waiting' | 'assigned' | 'active' | 'closed'
   * - last_message: { chat_message_id, content, sender_type, created_at } | null
   * - unread_count: 未读消息数
   * - updated_at: 最后更新时间（ISO 8601）
   * - user: { user_id, nickname, mobile } （用户信息）
   */
  processSessionList(rawSessions: any[]) {
    const processed = rawSessions.map((session: any) => ({
      // 会话唯一标识（后端主键字段）
      sessionId: session.customer_service_session_id,
      // 会话状态
      status: session.status || 'waiting',
      statusText: SESSION_STATUS_MAP[session.status] || '未知',
      // 最后消息预览（last_message 是对象，取 .content 展示）
      preview:
        session.last_message && session.last_message.content ? session.last_message.content : '',
      // 未读消息数
      unread: session.unread_count || 0,
      // 最后更新时间（使用 updated_at 字段）
      time: session.updated_at ? formatDateMessage(session.updated_at) : '',
      // 显示名称：固定为"在线客服"（用户端只有客服会话）
      name: '在线客服',
      icon: '🎧',
      avatarClass: 'customer-service'
    }))

    this.setData({ sessions: processed })
    log.info('✅ 会话列表处理完成，共', processed.length, '条')
  },

  /**
   * 重新加载会话列表（错误状态下的重试按钮）
   */
  retryLoadSession() {
    log.info('🔄 重试加载会话数据')
    this.loadSessionData()
  },

  /**
   * 更新总未读消息数量
   * 遍历 sessions 累加 unread 字段
   */
  updateTotalUnreadCount() {
    const total = this.data.sessions.reduce((sum: number, s: any) => sum + (s.unread || 0), 0)
    this.setData({ totalUnreadCount: total })
  },

  /**
   * 清除指定会话的未读计数
   *
   * @param sessionId - 会话ID（customer_service_session_id）
   */
  clearSessionUnread(sessionId: number) {
    const sessions = this.data.sessions.map((s: any) => {
      if (s.sessionId === sessionId) {
        return { ...s, unread: 0 }
      }
      return s
    })
    this.setData({ sessions })
    this.updateTotalUnreadCount()
  },

  // ============================================================================
  // 搜索功能
  // ============================================================================

  // 搜索输入
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    if (keyword.trim()) {
      this.performSearch(keyword)
    }
  },

  // 清除搜索
  clearSearch() {
    this.setData({ searchKeyword: '' })
  },

  /**
   * 执行聊天消息搜索
   *
   * 后端API: GET /api/v4/system/chat/sessions/search?keyword=xxx
   * 数据隔离: 用户端只能搜索自己会话中的消息
   *
   * 返回格式:
   * {
   *   messages: [{ chat_message_id, customer_service_session_id, sender_type, content, message_type, created_at }],
   *   pagination: { page, page_size, total, total_pages }
   * }
   */
  async performSearch(keyword: string) {
    log.info('🔍 搜索关键词:', keyword)

    if (!keyword || !keyword.trim()) {
      return
    }

    try {
      const result = await API.searchChatMessages(keyword.trim(), 1, 20)

      if (result.success && result.data && result.data.messages) {
        const searchMessages = result.data.messages
        log.info('🔍 搜索结果:', searchMessages.length, '条')

        if (searchMessages.length === 0) {
          showToast('未找到相关消息')
          return
        }

        // 搜索结果中如果有会话ID，点击后可跳转到对应会话
        // 此处仅展示搜索到的消息数量提示，用户可在列表中找到对应会话
        showToast(`找到 ${result.data.pagination.total} 条相关消息`)
      } else {
        showToast('未找到相关消息')
      }
    } catch (error: any) {
      log.error('❌ 搜索失败:', error)
      showToast(error.message || '搜索失败，请稍后重试')
    }
  },

  // ============================================================================
  // 会话频道点击处理
  // ============================================================================

  /**
   * 会话列表点击事件处理器
   *
   * @param e - 点击事件，通过 data-id 获取会话ID
   * @description
   * 点击会话 → 保存sessionId → 打开聊天弹窗 → 加载历史消息 → 连接WebSocket
   */
  onSessionTap(e: WechatMiniprogram.BaseEvent) {
    const sessionId = e.currentTarget.dataset.id as number
    if (!sessionId) {
      return
    }

    const session = this.data.sessions.find((s: any) => s.sessionId === sessionId)
    if (!session) {
      return
    }

    log.info('🔗 点击会话:', session.sessionId, session.name)

    // 保存会话ID，打开聊天弹窗并加载历史消息
    this.setData({
      sessionId,
      sessionStatus: session.status || 'active'
    })
    this.openChatModal('在线客服', '🎧')
    this.clearSessionUnread(sessionId)

    // 连接WebSocket
    this.connectWebSocket()
  },

  // 开始新聊天
  startNewChat() {
    log.info('✨ 开始新聊天')
    this.enterCustomerService()
  },

  /**
   * 创建新客服会话（"+"按钮触发）
   *
   * @description
   * 调用 POST /api/v4/system/chat/sessions 创建新会话。
   * 后端返回的会话对象包含 customer_service_session_id。
   * 创建成功后打开聊天弹窗并连接WebSocket。
   */
  async enterCustomerService() {
    log.info('🎧 创建新客服会话')

    try {
      const sessionResult = await API.createChatSession({
        source: 'mobile'
      })

      if (sessionResult.success && sessionResult.data) {
        // 后端返回的会话对象（主键字段: customer_service_session_id）
        const session = sessionResult.data.session || sessionResult.data
        const sessionId = session.customer_service_session_id
        log.info('✅ 聊天会话创建成功，ID:', sessionId)

        // 保存会话信息
        this.setData({
          sessionId,
          sessionStatus: session.status || 'waiting'
        })

        // 打开聊天弹窗
        this.openChatModal('在线客服', '🎧')
        this.setData({ showChatModal: true })

        // 连接WebSocket
        this.connectWebSocket()

        // 刷新会话列表（新创建的会话需要显示在列表中）
        this.loadSessionData()

        showToast('客服连接成功')
      } else {
        log.error('❌ 创建聊天会话失败:', sessionResult.message)
        showToast(sessionResult.message || '连接客服失败，请稍后重试')
      }
    } catch (error) {
      log.error('❌ 进入客服服务出错:', error)
      showToast('连接客服时出现错误，请稍后重试')
    }
  },

  // ============================================================================
  // 聊天弹窗管理
  // ============================================================================

  /**
   * 打开聊天弹窗
   *
   * @param name - 聊天对象名称（如 '在线客服'）
   * @param icon - 聊天对象图标（如 '🎧'）
   */
  openChatModal(name: string, icon: string) {
    this.setData({
      showChatModal: true,
      currentChatName: name,
      currentChatIcon: icon,
      inputContent: '',
      chatLoadStatus: 'loading',
      // 重置UI交互状态
      showToolbar: false,
      showQuickReplies: true,
      showScrollBottomBtn: false,
      newMsgCount: 0
    })

    // 加载当前会话的历史消息
    this.loadChatHistory()
  },

  // 关闭聊天弹窗
  closeChatModal() {
    log.info('❌ 关闭聊天弹窗')
    this.setData({
      showChatModal: false,
      chatLoadStatus: 'idle'
    })
    this.disconnectWebSocket()
  },

  // ============================================================================
  // 聊天历史消息
  // ============================================================================

  /**
   * 加载当前会话的聊天历史
   *
   * @description
   * 后端路由: GET /api/v4/system/chat/sessions/:id/messages
   * 使用当前 sessionId 获取消息列表。
   *
   * 消息字段（后端snake_case）:
   * - chat_message_id: 消息主键
   * - content: 消息内容
   * - sender_type: 'user' | 'admin' | 'system'
   * - message_type: 'text' | 'image' | 'system'
   * - created_at: 创建时间（ISO 8601）
   */
  async loadChatHistory() {
    log.info('📚 加载聊天历史，会话ID:', this.data.sessionId)
    this.setData({
      isLoadingHistory: true,
      chatLoadStatus: 'loading'
    })

    try {
      if (!this.data.sessionId) {
        log.info('📝 无会话ID，显示空状态')
        this.setData({ messages: [] as any[], scrollToBottom: true, chatLoadStatus: 'empty' })
        return
      }

      const historyResult = await API.getChatHistory(this.data.sessionId, 1, 50)

      if (historyResult.success && historyResult.data && historyResult.data.messages) {
        const apiMessages = historyResult.data.messages.map((msg: any) => {
          // 判断消息方向: sender_type='user' → 自己发的(右侧)，其余 → 对方发的(左侧)
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

        // 按时间戳排序（最早的在前，最新的在后）
        const sortedMessages = apiMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)
        log.info('✅ 成功加载聊天历史:', sortedMessages.length, '条消息')

        this.setData({
          messages: sortedMessages,
          scrollToBottom: true,
          chatLoadStatus: sortedMessages.length > 0 ? 'success' : 'empty'
        })
      } else {
        log.warn('⚠️ API返回的历史消息为空')
        this.setData({ messages: [] as any[], scrollToBottom: true, chatLoadStatus: 'empty' })
      }
    } catch (error) {
      log.error('❌ 加载历史消息失败:', error)
      this.setData({ messages: [] as any[], chatLoadStatus: 'error' })
      showToast('加载历史消息失败')
    } finally {
      this.setData({ isLoadingHistory: false })
    }
  },

  // 格式化消息时间
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
      log.warn('⚠️ 时间格式化失败', error)
      return ''
    }
  },

  // ============================================================================
  // WebSocket管理
  // ============================================================================

  // 连接WebSocket
  connectWebSocket() {
    if (!this.data.token || !this.data.userId) {
      log.warn('⚠️ 缺少必要信息，无法连接WebSocket')
      return
    }

    const app = getApp()

    if (!app || typeof app.subscribeWebSocketMessages !== 'function') {
      log.error('❌ app对象或WebSocket管理方法不可用')
      wx.showModal({
        title: '连接失败',
        content: '系统初始化未完成，请重启小程序',
        showCancel: false,
        confirmText: '确定'
      })
      return
    }

    log.info('🔐 用户端使用统一WebSocket连接')

    // 订阅WebSocket消息
    app.subscribeWebSocketMessages('chat_page', (eventName: string, data: any) => {
      this.handleUnifiedWebSocketMessage(eventName, data)
    })

    app
      .connectWebSocket()
      .then(() => {
        log.info('✅ 用户端WebSocket连接成功')
        this.setData({
          wsConnected: true,
          sessionStatus: 'active'
        })

        wx.showToast({
          title: '客服连接成功',
          icon: 'success',
          duration: DELAY.TOAST_LONG
        })
      })
      .catch((error: any) => {
        log.error('❌ 用户端WebSocket连接失败:', error)
        this.setData({
          wsConnected: false,
          sessionStatus: 'connection_failed'
        })

        wx.showToast({
          title: '连接客服失败，请检查网络',
          icon: 'none',
          duration: DELAY.RETRY
        })
      })
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
   * - notification: { type, title, message, ... }
   */
  handleUnifiedWebSocketMessage(eventName: string, data: any) {
    log.info('📢 用户端收到Socket.IO消息:', eventName)

    switch (eventName) {
      case 'websocket_connected':
        this.setData({
          wsConnected: true,
          sessionStatus: 'active'
        })
        break

      case 'websocket_error':
      case 'websocket_closed':
        this.setData({
          wsConnected: false,
          sessionStatus: 'disconnected'
        })
        break

      case 'websocket_max_reconnect_reached':
        wx.showModal({
          title: '连接失败',
          content: '客服连接异常，请检查网络后重试',
          confirmText: '重试',
          cancelText: '取消',
          success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
            if (res.confirm) {
              const app = getApp()
              app.connectWebSocket()
            }
          }
        })
        break

      // 后端连接确认（含 user_id、is_admin、server_time）
      case 'connection_established':
        log.info('🤝 后端连接确认:', data)
        break

      // 新消息（后端 snake_case: chat_message_id, content, sender_type）
      case 'new_message':
        log.info('📨 用户端收到新消息:', data)
        if (data.sender_type === 'admin') {
          this.handleAdminMessage(data)
        } else {
          this.addMessage(data)
        }
        break

      // 消息发送确认（后端写库成功回执: chat_message_id, session_id, timestamp）
      case 'message_sent':
        log.info('✅ 消息发送确认:', data)
        this.handleMessageSentConfirm(data)
        break

      // 消息发送失败（后端处理出错: error, message, timestamp）
      case 'message_error':
        log.error('❌ 消息发送失败:', data)
        this.handleMessageSendError(data)
        break

      // 会话关闭（后端: session_id, close_reason）
      case 'session_closed':
        log.info('🔚 会话已关闭:', data)
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
        log.info('🔧 用户端未处理的消息类型', eventName)
    }
  },

  /**
   * 处理管理员消息
   * 后端统一使用 snake_case 字段: chat_message_id, sender_type, message_type, created_at
   */
  handleAdminMessage(messageData: any) {
    log.info('👨‍💼 处理管理员消息')

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
    log.info('✅ 管理员消息处理完成')
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

    // 找到最近一条 status='sending' 的自己的消息，更新为 sent
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
    log.error('❌ 后端消息处理失败:', data.message || data.error)

    // 将最近一条 'sending' 消息标记为 failed
    const messages = this.data.messages.map((msg: any) => {
      if (msg.isOwn && msg.status === 'sending') {
        return { ...msg, status: 'failed' }
      }
      return msg
    })
    this.setData({ messages })
    showToast(data.message || '消息发送失败')
  },

  // 断开WebSocket连接
  disconnectWebSocket() {
    const app = getApp()

    if (app && typeof app.unsubscribeWebSocketMessages === 'function') {
      app.unsubscribeWebSocketMessages('chat_page')
    } else {
      log.warn('⚠️ app对象或unsubscribeWebSocketMessages方法不可用')
    }

    this.setData({
      wsConnected: false,
      sessionStatus: 'disconnected'
    })

    log.info('📱 用户端已断开WebSocket连接')
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
    // 后端字段: sender_type（snake_case），直接使用
    const senderType = messageData.senderType || messageData.sender_type || ''

    // 基于 sender_type 判断消息显示位置
    const isOwn = senderType === 'user'

    const newMessage = {
      id: messageData.id || `msg_${Date.now()}`,
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      isOwn,
      status: isOwn ? 'sent' : 'read',
      timestamp: messageData.timestamp || Date.now(),
      timeText: formatDateMessage(messageData.timestamp || Date.now()),
      showTime: this.shouldShowTime(messageData.timestamp || Date.now()),
      attachments: messageData.attachments || []
    }

    const messages = [...this.data.messages, newMessage]

    // 如果用户正在查看历史消息（不在底部），增加新消息计数提示
    if (this.data.showScrollBottomBtn && !newMessage.isOwn) {
      this.setData({
        messages,
        chatLoadStatus: 'success',
        newMsgCount: this.data.newMsgCount + 1
      })
    } else {
      this.setData({
        messages,
        scrollToBottom: true,
        chatLoadStatus: 'success'
      })
    }

    // 如果是对方发送的消息，更新会话预览
    if (!newMessage.isOwn) {
      this.updateSessionPreview(messageData.content)
    }
  },

  // 判断是否显示时间
  shouldShowTime(timestamp: number) {
    const messages = this.data.messages
    if (messages.length === 0) {
      return true
    }

    const lastMessage = messages[messages.length - 1]
    const timeDiff = Math.abs(timestamp - lastMessage.timestamp)

    // 5分钟间隔显示时间
    return timeDiff > TIME.MINUTE * 5
  },

  /**
   * 更新会话预览（收到新消息时更新列表中的预览文字和未读数）
   *
   * @param content - 新消息文本内容
   */
  updateSessionPreview(content: string) {
    if (!this.data.sessionId) {
      return
    }

    const sessions = this.data.sessions.map((s: any) => {
      if (s.sessionId === this.data.sessionId) {
        return {
          ...s,
          preview: content,
          unread: this.data.showChatModal ? 0 : s.unread + 1
        }
      }
      return s
    })
    this.setData({ sessions })
    this.updateTotalUnreadCount()
  },

  // 处理输入状态指示器
  handleTypingIndicator(data: any) {
    this.setData({
      showTypingIndicator: data.isTyping,
      typingUser: data.userName
    })

    if (data.isTyping) {
      setTimeout(() => {
        this.setData({ showTypingIndicator: false })
      }, DELAY.RETRY)
    }
  },

  // 更新会话状态
  updateSessionStatus(data: any) {
    this.setData({ sessionStatus: data.status })
  },

  // ============================================================================
  // 输入与发送
  // ============================================================================

  // 输入内容变化
  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ inputContent: e.detail.value })
  },

  // 输入框获得焦点
  onInputFocus() {
    this.setData({
      inputFocused: true,
      scrollToBottom: true
    })
  },

  // 输入框失去焦点
  onInputBlur() {
    this.setData({ inputFocused: false })
  },

  // 发送消息
  async sendMessage() {
    const content = this.data.inputContent.trim()

    if (!content) {
      showToast('请输入消息内容')
      return
    }

    // 检查sessionId是否存在
    if (!this.data.sessionId) {
      showToast('会话连接中，请稍后重试')
      return
    }

    log.info('📨 [发送消息]', content.substring(0, 30) + '...')

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
      // 立即更新本地消息列表（乐观 UI）
      const messages = [...this.data.messages, message]
      this.setData({
        messages,
        inputContent: '',
        scrollToBottom: true,
        chatLoadStatus: 'success'
      })

      if (!this.data.sessionId) {
        log.warn('⚠️ 无有效会话ID，无法发送消息')
        showToast('会话连接中，请稍后重试')
        const updatedMessages = this.data.messages.filter((msg: any) => msg.id !== message.id)
        this.setData({ messages: updatedMessages })
        return
      }

      /**
       * 发送策略: Socket.IO 优先（后端自动写库 + 回执），API 降级兜底
       *
       * Socket.IO 通道:
       *   emit('send_message', { session_id, content, message_type })
       *   → 后端自动写库 → 回推 message_sent / message_error
       *   → handleMessageSentConfirm / handleMessageSendError 更新本地状态
       *
       * API 降级:
       *   Socket.IO 未连接时，走 POST /api/v4/system/chat/sessions/:id/messages
       */
      if (this.data.wsConnected) {
        // 主通道: Socket.IO（后端自动写库，回执 message_sent / message_error）
        try {
          const appInstance = getApp()
          appInstance.emitSocketMessage('send_message', {
            session_id: this.data.sessionId,
            content,
            message_type: 'text'
          })
          log.info('✅ Socket.IO send_message 已发送，等待后端回执')
          // 状态由 handleMessageSentConfirm / handleMessageSendError 自动更新
        } catch (wsError) {
          log.error('❌ Socket.IO emit 异常，降级到 API:', wsError)
          await this.sendMessageViaAPI(message.id, content)
        }
      } else {
        // 降级通道: REST API
        log.info('🔄 Socket.IO 未连接，使用 API 发送')
        await this.sendMessageViaAPI(message.id, content)
      }
    } catch (error) {
      log.error('❌ sendMessage函数执行出错:', error)
      showToast('发送消息时出现错误')

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
        log.info('✅ API 降级发送成功')
        const updatedMessages = this.data.messages.map((msg: any) =>
          msg.id === localMsgId
            ? { ...msg, status: 'sent', id: apiResult.data?.chat_message_id || msg.id }
            : msg
        )
        this.setData({ messages: updatedMessages })
      } else {
        log.error('❌ API 降级发送失败:', apiResult.message)
        const failedMessages = this.data.messages.map((msg: any) =>
          msg.id === localMsgId ? { ...msg, status: 'failed' } : msg
        )
        this.setData({ messages: failedMessages })
      }
    } catch (apiError) {
      log.error('❌ API 降级发送异常:', apiError)
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
   * 流程: 选择图片 → 上传获取URL → 发送image类型消息
   */
  sendImage() {
    if (!this.data.sessionId) {
      showToast('会话连接中，请稍后重试')
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
          showToast('图片不能超过5MB')
          return
        }

        log.info('📷 开始上传聊天图片:', {
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
            log.info('✅ 图片消息发送成功')
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
          log.error('❌ 图片发送失败:', error)
          showToast(error.message || '图片发送失败')
          const failedMessages = this.data.messages.map((msg: any) =>
            msg.id === localMsg.id ? { ...msg, status: 'failed' } : msg
          )
          this.setData({ messages: failedMessages })
        }
      }
    })
  },

  // 发送位置
  sendLocation() {
    log.info('📍 发送位置')
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
        this.setData({
          messages,
          scrollToBottom: true,
          chatLoadStatus: 'success'
        })
      }
    })
  },

  // 发送文件
  sendFile() {
    log.info('📎 发送文件')
    showToast('文件发送功能开发中')
  },

  // 预览图片
  previewImage(e: WechatMiniprogram.BaseEvent) {
    const src = e.currentTarget.dataset.src
    wx.previewImage({
      urls: [src],
      current: src
    })
  },

  // 显示聊天菜单
  showChatMenu() {
    log.info('☰ 显示聊天菜单')
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

  // 清空聊天记录
  clearChatHistory() {
    wx.showModal({
      title: '清空聊天记录',
      content: '确定要清空当前聊天记录吗？',
      success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (res.confirm) {
          this.setData({
            messages: [],
            chatLoadStatus: 'empty'
          })
          showToast('聊天记录已清空')
        }
      }
    })
  },

  // 显示会话信息
  showSessionInfo() {
    wx.showModal({
      title: '会话信息',
      content: `会话：${this.data.currentChatName}\n状态：${SESSION_STATUS_MAP[this.data.sessionStatus] || this.data.sessionStatus}`,
      showCancel: false
    })
  },

  // 举报聊天
  reportChat() {
    showToast('举报功能开发中')
  },

  // ============================================================================
  // 事件冒泡阻止（聊天弹窗内部）
  // ============================================================================

  // 遮罩层点击 → 关闭弹窗
  onModalMaskTap(e: WechatMiniprogram.BaseEvent) {
    if (e.target === e.currentTarget) {
      this.closeChatModal()
    }
  },

  // 以下方法均通过 catchtap 阻止事件冒泡到遮罩层
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

  // 内置发送按钮点击
  onInlineSendTap() {
    log.info('⌨️ 内置发送按钮被点击')
    this.sendMessage()
  },

  // ============================================================================
  // V6.0 新增交互功能
  // ============================================================================

  /**
   * 切换工具栏展开面板（+按钮）
   * 展开时显示相册、拍照、位置、文件等功能按钮
   */
  toggleToolbar() {
    const showToolbar = !this.data.showToolbar
    this.setData({ showToolbar })

    // 展开工具栏时收起快捷回复
    if (showToolbar) {
      this.setData({ showQuickReplies: false })
    }
  },

  /**
   * 切换快捷回复区域的显示/隐藏
   */
  toggleQuickReplies() {
    this.setData({ showQuickReplies: !this.data.showQuickReplies })
  },

  /**
   * 快捷回复点击 - 直接发送预设文字
   *
   * @param e - 点击事件，通过 data-text 获取预设文字内容
   * @description
   * 用户点击快捷回复按钮时，自动将预设文字填入输入框并发送，
   * 提供更便捷的交互体验，减少用户输入成本。
   */
  onQuickReply(e: WechatMiniprogram.BaseEvent) {
    const replyText = e.currentTarget.dataset.text as string
    if (!replyText) {
      return
    }

    log.info('⚡ 快捷回复:', replyText)

    // 设置输入内容并立即发送
    this.setData({ inputContent: replyText })

    // 延迟发送确保数据更新
    setTimeout(() => {
      this.sendMessage()
    }, 100)
  },

  /**
   * 快捷回复区域点击（阻止冒泡）
   */
  onQuickRepliesBarTap() {
    /* catchtap阻止冒泡 */
  },

  /**
   * 聊天区域滚动事件 - 控制回到底部按钮显示
   *
   * @param e - 滚动事件对象
   * @description
   * 当用户向上滚动查看历史消息时，显示"回到底部"浮动按钮。
   * 帮助用户快速返回最新消息位置。
   */
  onChatScroll(e: WechatMiniprogram.ScrollViewScroll) {
    // 判断是否已滚动到接近底部（阈值200rpx约100px）
    const scrollTop = e.detail.scrollTop
    const scrollHeight = e.detail.scrollHeight
    const clientHeight = (e.detail as any).clientHeight || 500

    // 如果距离底部超过200px，显示回到底部按钮
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    const shouldShowBtn = distanceFromBottom > 200

    if (shouldShowBtn !== this.data.showScrollBottomBtn) {
      this.setData({ showScrollBottomBtn: shouldShowBtn })
    }

    // 滚动到底部时重置新消息计数
    if (!shouldShowBtn) {
      this.setData({ newMsgCount: 0 })
    }
  },

  /**
   * 滚动到最新消息（回到底部按钮点击）
   */
  scrollToLatest() {
    this.setData({
      scrollToBottom: true,
      showScrollBottomBtn: false,
      newMsgCount: 0
    })

    // 重置scrollToBottom以允许下次触发
    setTimeout(() => {
      this.setData({ scrollToBottom: false })
    }, 300)
  },

  /**
   * 重新发送失败的消息
   *
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

    log.info('🔄 重新发送消息:', messageId)

    // 移除旧的失败消息
    const filteredMessages = this.data.messages.filter((msg: any) => msg.id !== messageId)
    this.setData({ messages: filteredMessages })

    // 重新设置输入内容并发送
    this.setData({ inputContent: failedMessage.content })
    setTimeout(() => {
      this.sendMessage()
    }, 100)
  }
})

export {}
