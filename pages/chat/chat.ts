/**
 * 聊天会话页面 — Page Shell + 生命周期 + 会话管理
 *
 * 消息收发逻辑已拆分到 chat-message-handlers.ts：
 *   聊天历史、WebSocket管理、消息收发、输入交互、V6.0交互功能
 *   通过展开运算符合并到 Page({})，WXML不变，用户无感知
 *
 * @file pages/chat/chat.ts
 * @version 5.0.0
 * @since 2026-02-10
 */

// 统一工具函数导入（从utils/index.ts）
const { Utils, Wechat, API, Constants, Logger } = require('../../utils/index')
const log = Logger.createLogger('chat')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat
const { DELAY, TIME } = Constants
// MobX Store绑定 - 用户登录状态自动同步
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

// 拆分的消息处理方法模块
const chatMessageHandlers = require('./chat-message-handlers')

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

    // 会话列表（后端 GET /api/v4/system/chat/sessions 返回）
    sessions: [] as API.ChatSession[],

    // 页面加载状态: loading=骨架屏 | success=正常显示 | error=错误+重试
    sessionLoadStatus: 'loading',

    // 总未读数
    totalUnreadCount: 0,

    // 弹窗聊天相关
    showChatModal: false,
    currentChatName: '在线客服',
    currentChatIcon: '🎧',

    // 聊天消息（后端 GET /api/v4/system/chat/history 返回）
    messages: [] as API.ChatMessage[],
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
        this.setData({ sessions: [] as API.ChatSession[], sessionLoadStatus: 'success' })
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

  /** 关闭聊天弹窗 */
  closeChatModal() {
    log.info('❌ 关闭聊天弹窗')
    this.setData({
      showChatModal: false,
      chatLoadStatus: 'idle'
    })
    this.disconnectWebSocket()
  },

  // ============================================================================
  // 消息处理方法（已拆分到 chat-message-handlers.ts，通过展开运算符合并）
  // ============================================================================
  ...chatMessageHandlers
})

export { }
