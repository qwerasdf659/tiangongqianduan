/**
 * 会话列表管理处理方法 — 从 chat.ts 拆分
 *
 * 包含：会话数据加载、搜索、会话创建、会话列表处理
 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * 后端API对齐:
 *   - GET /api/v4/system/chat/sessions — 会话列表
 *   - POST /api/v4/system/chat/sessions — 创建新会话
 *   - GET /api/v4/system/chat/sessions/search — 搜索消息
 *
 * @file pages/chat/chat-session-handlers.ts
 * @version 5.2.0
 * @since 2026-02-16
 */

const { API: sessionAPI, Wechat: sessionWechat, Logger: sessionLogger, Utils: sessionUtils } =
  require('../../utils/index')
const sessionLog = sessionLogger.createLogger('chat-session')
const { showToast: sessionShowToast } = sessionWechat
const { formatDateMessage: sessionFormatDate } = sessionUtils

/**
 * 会话状态文案映射（对应后端 customer_service_sessions.status 字段）
 * waiting: 等待分配客服 | assigned: 已分配 | active: 对话中 | closed: 已结束
 */
const SESSION_STATUS_MAP: Record<string, string> = {
  waiting: '等待客服',
  assigned: '已分配',
  active: '对话中',
  closed: '已结束'
}

/**
 * 会话列表管理全部处理方法
 * 在 chat.ts 中通过 ...sessionHandlers 合并到 Page({})
 */
const sessionHandlers = {
  // ============================================================================
  // 会话列表数据管理
  // ============================================================================

  /**
   * 加载所有会话列表数据
   *
   * 后端API: GET /api/v4/system/chat/sessions
   * 后端字段: customer_service_session_id, status, last_message(object), unread_count, updated_at
   * 使用 sessionLoadStatus 管理加载/成功/错误三种状态
   */
  async loadSessionData() {
    sessionLog.info('📊 开始加载会话数据')
    this.setData({ sessionLoadStatus: 'loading' })

    try {
      const result = await sessionAPI.getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const rawSessions = result.data.sessions
        sessionLog.info('✅ 会话列表数据获取成功，共', rawSessions.length, '个会话')

        this.processSessionList(rawSessions)
        this.setData({ sessionLoadStatus: 'success' })
      } else {
        sessionLog.warn('⚠️ 后端未返回有效的会话列表数据')
        this.setData({ sessions: [] as API.ChatSession[], sessionLoadStatus: 'success' })
      }

      this.updateTotalUnreadCount()
    } catch (error) {
      sessionLog.error('❌ 加载会话数据失败:', error)
      this.setData({ sessionLoadStatus: 'error' })
      sessionShowToast('加载会话数据失败')
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
   */
  processSessionList(rawSessions: any[]) {
    const processed = rawSessions.map((session: any) => ({
      sessionId: session.customer_service_session_id,
      status: session.status || 'waiting',
      statusText: SESSION_STATUS_MAP[session.status] || '未知',
      preview:
        session.last_message && session.last_message.content ? session.last_message.content : '',
      unread: session.unread_count || 0,
      time: session.updated_at ? sessionFormatDate(session.updated_at) : '',
      name: '在线客服',
      icon: '🎧',
      avatarClass: 'customer-service'
    }))

    this.setData({ sessions: processed })
    sessionLog.info('✅ 会话列表处理完成，共', processed.length, '条')
  },

  /** 重新加载会话列表（错误状态下的重试按钮） */
  retryLoadSession() {
    sessionLog.info('🔄 重试加载会话数据')
    this.loadSessionData()
  },

  /** 更新总未读消息数量（遍历 sessions 累加 unread 字段） */
  updateTotalUnreadCount() {
    const total = this.data.sessions.reduce((sum: number, s: any) => sum + (s.unread || 0), 0)
    this.setData({ totalUnreadCount: total })
  },

  /**
   * 清除指定会话的未读计数
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

  /** 搜索输入 */
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    if (keyword.trim()) {
      this.performSearch(keyword)
    }
  },

  /** 清除搜索 */
  clearSearch() {
    this.setData({ searchKeyword: '' })
  },

  /**
   * 执行聊天消息搜索
   * 后端API: GET /api/v4/system/chat/sessions/search?keyword=xxx
   * 数据隔离: 用户端只能搜索自己会话中的消息
   */
  async performSearch(keyword: string) {
    sessionLog.info('🔍 搜索关键词:', keyword)

    if (!keyword || !keyword.trim()) {
      return
    }

    try {
      const result = await sessionAPI.searchChatMessages(keyword.trim(), 1, 20)

      if (result.success && result.data && result.data.messages) {
        const searchMessages = result.data.messages
        sessionLog.info('🔍 搜索结果:', searchMessages.length, '条')

        if (searchMessages.length === 0) {
          sessionShowToast('未找到相关消息')
          return
        }

        sessionShowToast(`找到 ${result.data.pagination.total} 条相关消息`)
      } else {
        sessionShowToast('未找到相关消息')
      }
    } catch (error: any) {
      sessionLog.error('❌ 搜索失败:', error)
      sessionShowToast(error.message || '搜索失败，请稍后重试')
    }
  },

  // ============================================================================
  // 会话频道点击处理
  // ============================================================================

  /**
   * 会话列表点击事件处理器
   * @param e - 点击事件，通过 data-id 获取会话ID
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

    sessionLog.info('🔗 点击会话:', session.sessionId, session.name)

    this.setData({
      sessionId,
      sessionStatus: session.status || 'active'
    })
    this.openChatModal('在线客服', '🎧')
    this.clearSessionUnread(sessionId)

    this.connectWebSocket()
  },

  /** 开始新聊天 */
  startNewChat() {
    sessionLog.info('✨ 开始新聊天')
    this.enterCustomerService()
  },

  /**
   * 创建新客服会话（"+"按钮触发）
   * 后端API: POST /api/v4/system/chat/sessions
   * 后端返回的会话对象包含 customer_service_session_id
   */
  async enterCustomerService() {
    sessionLog.info('🎧 创建新客服会话')

    try {
      const sessionResult = await sessionAPI.createChatSession({
        source: 'mobile'
      })

      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data.session || sessionResult.data
        const sessionId = session.customer_service_session_id
        sessionLog.info('✅ 聊天会话创建成功，ID:', sessionId)

        this.setData({
          sessionId,
          sessionStatus: session.status || 'waiting'
        })

        this.openChatModal('在线客服', '🎧')
        this.setData({ showChatModal: true })

        this.connectWebSocket()
        this.loadSessionData()

        sessionShowToast('客服连接成功')
      } else {
        sessionLog.error('❌ 创建聊天会话失败:', sessionResult.message)
        sessionShowToast(sessionResult.message || '连接客服失败，请稍后重试')
      }
    } catch (error) {
      sessionLog.error('❌ 进入客服服务出错:', error)
      sessionShowToast('连接客服时出现错误，请稍后重试')
    }
  },

  /**
   * 更新会话预览（收到新消息时更新列表中的预览文字和未读数）
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
  }
}

module.exports = { sessionHandlers, SESSION_STATUS_MAP }

export { }




