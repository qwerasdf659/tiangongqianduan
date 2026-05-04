/**
 * 聊天会话页面 — Page Shell + 生命周期 + 会话管理
 *
 * 消息收发逻辑已拆分到 chat-message-handlers.ts：
 *   聊天历史、WebSocket管理、消息收发、输入交互、V6.0交互功能
 *   通过展开运算符合并到 Page({})，WXML不变，用户无感知
 *
 * @file packageUser/chat/chat.ts
 * @version 5.2.0
 * @since 2026-02-10
 */

// 统一工具函数导入（从utils/index.ts）
const { Utils, Wechat, API, Constants, Logger } = require('../../utils/index')
const log = Logger.createLogger('chat')
const { formatDateMessage, checkAuth } = Utils
const { showToast } = Wechat
const { DELAY } = Constants
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
    isSearching: false, // 是否处于搜索结果模式
    searchResults: [] as any[], // 搜索结果列表（后端 messages 数组处理后的展示数据）
    searchLoading: false, // 搜索API请求中
    searchTotal: 0, // 搜索结果总数（后端 pagination.total）

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

    // 聊天消息（后端 GET /api/v4/system/chat/sessions/:id/messages 返回）
    messages: [] as API.ChatMessage[],
    inputContent: '',
    inputFocused: false,
    isLoadingHistory: false,
    scrollToBottom: false,
    showTypingIndicator: false,
    typingUser: '',

    // 聊天区域状态: idle | loading | success | empty | error
    chatLoadStatus: 'idle',

    // WebSocket相关（认证数据统一从 MobX userStore 读取，不在页面 data 中冗余存储）
    wsConnected: false,
    sessionId: '',

    // 会话状态
    sessionStatus: 'connecting',

    // UI交互状态 - V6.0新增
    showToolbar: false, // 工具栏展开面板
    showQuickReplies: false, // 快捷回复区域（后端未开通时默认隐藏）
    quickRepliesAvailable: false, // 快捷回复接口是否已开通
    quickRepliesUnavailableMessage: '快捷回复服务暂未开通，请直接输入问题内容',
    showScrollBottomBtn: false, // 回到底部浮动按钮
    newMsgCount: 0, // 新消息计数（滚动到底部时重置）

    // 满意度评分卡片（M1 — 内嵌评分，非弹窗）
    showSatisfactionCard: false, // 是否显示评分卡片
    satisfactionSessionId: null as number | null, // 评分关联的会话ID
    satisfactionScore: 0, // 用户选择的评分（1-5，0表示未选）
    satisfactionSubmitted: false // 是否已提交评分
  },

  /**
   * 生命周期函数--监听页面加载
   *
   * @description
   * 聊天会话列表页面入口函数，初始化用户信息和加载会话数据。
   *
   * **初始化流程**：
   * 1. 绑定MobX Store（isLoggedIn 响应式同步）
   * 2. 检查用户登录状态（未登录自动跳转到登录页）
   * 3. 验证用户认证状态（token/userId 从 userStore 直接读取）
   * 4. 加载客服会话列表数据
   */
  onLoad(_options: Record<string, string | undefined>) {
    log.info('聊天会话列表页面加载')

    // MobX Store绑定 - 仅同步 isLoggedIn 用于页面响应式更新
    // 认证数据（token/userId）统一从 userStore 直接读取，不通过 data 中转
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('用户未登录，已自动跳转')
      return
    }

    this.initializeUser()
    // 🔴 标记首次加载，避免onShow中重复调用
    this._isFirstLoad = true
    this.loadSessionData()
  },

  onShow() {
    log.info('聊天页面显示')

    // 🔴 首次加载时onLoad已调用loadSessionData，跳过onShow中的重复调用
    if (this._isFirstLoad) {
      this._isFirstLoad = false
      return
    }

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('用户未登录，已自动跳转')
      return
    }

    // 页面重新显示时退出搜索模式，展示最新会话列表
    this.exitSearchMode()
    // 从其他页面返回时刷新会话数据
    this.loadSessionData()
  },

  // 页面卸载时清理资源
  onUnload() {
    log.info('聊天页面卸载，清理WebSocket订阅')
    // 清理搜索防抖定时器
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    this.disconnectWebSocket()
  },

  // 下拉刷新
  async onPullDownRefresh() {
    log.info('下拉刷新会话列表')
    await this.loadSessionData()
    wx.stopPullDownRefresh()
  },

  /**
   * 验证用户认证状态
   *
   * @description
   * 检查 MobX userStore 中的认证数据是否就绪。
   * 认证数据统一从 userStore 读取，不在页面 data 中冗余存储，
   * 避免 MobX 绑定与 setData 的竞态覆盖问题。
   */
  initializeUser() {
    if (userStore.isLoggedIn) {
      log.info('用户认证状态就绪', {
        userId: userStore.userInfo?.user_id,
        hasToken: !!userStore.accessToken
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
    log.info('开始加载会话数据')
    this.setData({ sessionLoadStatus: 'loading' })

    try {
      const result = await API.getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const rawSessions = result.data.sessions
        log.info('会话列表数据获取成功，共', rawSessions.length, '个会话')

        this.processSessionList(rawSessions)
        this.setData({ sessionLoadStatus: 'success' })
      } else {
        log.warn('后端未返回有效的会话列表数据')
        // 空列表也是正常状态，设为success
        this.setData({ sessions: [] as API.ChatSession[], sessionLoadStatus: 'success' })
      }

      this.updateTotalUnreadCount()
    } catch (error) {
      log.error('加载会话数据失败:', error)
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
    /* 诊断日志: 打印第一条原始会话数据的字段名，确认后端实际返回结构 */
    if (rawSessions.length > 0) {
      log.info('原始会话字段:', Object.keys(rawSessions[0]))
    }

    const processed = rawSessions.map((session: any) => {
      let preview = ''
      if (session.last_message && session.last_message.content) {
        const senderPrefix =
          session.last_message.sender_type === 'user'
            ? '[我] '
            : session.last_message.sender_type === 'admin'
              ? '[客服] '
              : '[系统] '
        const msgType = session.last_message.message_type
        const contentText =
          msgType === 'image'
            ? '[图片]'
            : msgType === 'location'
              ? '[位置]'
              : session.last_message.content
        preview = senderPrefix + contentText
      }

      const rawSessionId = session.customer_service_session_id
      if (!rawSessionId) {
        log.error(
          '会话缺少 customer_service_session_id 字段，原始数据:',
          JSON.stringify(session).substring(0, 200)
        )
      }

      return {
        sessionId: rawSessionId,
        status: session.status || 'waiting',
        statusText: SESSION_STATUS_MAP[session.status] || '未知',
        preview,
        unread: session.unread_count || 0,
        time: session.updated_at ? formatDateMessage(session.updated_at) : '',
        name: '在线客服',
        icon: '🎧',
        avatarClass: 'customer-service'
      }
    })

    this.setData({ sessions: processed })
    log.info('会话列表处理完成，共', processed.length, '条')
  },

  /**
   * 重新加载会话列表（错误状态下的重试按钮）
   */
  retryLoadSession() {
    log.info('重试加载会话数据')
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
  // 搜索功能（对标微信消息搜索体验）
  // ============================================================================

  /**
   * 搜索输入事件 — 带300ms防抖，避免每个按键都触发API请求
   *
   * 交互流程（对标微信）：
   * 1. 用户输入 → 进入搜索模式，显示搜索加载态
   * 2. 停止输入300ms → 发起搜索API请求
   * 3. 返回结果 → 展示搜索结果列表（带关键词高亮）
   * 4. 清空输入 → 退出搜索模式，回到会话列表
   */
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 清空输入时退出搜索模式，回到会话列表
    if (!keyword.trim()) {
      this.exitSearchMode()
      return
    }

    // 进入搜索模式，显示搜索加载状态
    this.setData({ isSearching: true, searchLoading: true })

    // 防抖300ms：取消上一次未执行的搜索，重新计时
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
    this._searchTimer = setTimeout(() => {
      this.performSearch(keyword)
    }, DELAY.DEBOUNCE || 300)
  },

  /**
   * 搜索确认（键盘搜索按钮）— 立即触发搜索，不等防抖
   */
  onSearchConfirm(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    if (keyword && keyword.trim()) {
      if (this._searchTimer) {
        clearTimeout(this._searchTimer)
      }
      this.setData({ isSearching: true, searchLoading: true })
      this.performSearch(keyword)
    }
  },

  /**
   * 清除搜索 — 退出搜索模式，回到会话列表
   */
  clearSearch() {
    this.setData({ searchKeyword: '' })
    this.exitSearchMode()
  },

  /**
   * 退出搜索模式 — 清理搜索状态和定时器
   */
  exitSearchMode() {
    if (this._searchTimer) {
      clearTimeout(this._searchTimer)
    }
    this.setData({
      isSearching: false,
      searchResults: [] as any[],
      searchLoading: false,
      searchTotal: 0
    })
  },

  /**
   * 执行聊天消息搜索 — 展示搜索结果列表（对标微信消息搜索）
   *
   * 后端API: GET /api/v4/system/chat/sessions/search?keyword=xxx
   * 数据隔离: 用户端只能搜索自己会话中的消息
   *
   * 后端返回格式:
   * {
   *   messages: [{ chat_message_id, customer_service_session_id, sender_type, content, message_type, created_at }],
   *   pagination: { page, page_size, total, total_pages }
   * }
   *
   * 前端处理:
   * 1. 将后端 messages 映射为搜索结果展示数据
   * 2. 对 content 中的关键词进行高亮（通过 rich-text 渲染 HTML）
   * 3. 添加发送者标签（我/客服/系统）
   */
  async performSearch(keyword: string) {
    log.info('搜索关键词:', keyword)

    if (!keyword || !keyword.trim()) {
      return
    }

    this.setData({ searchLoading: true })

    try {
      const result = await API.searchChatMessages(keyword.trim(), 1, 20)

      if (result.success && result.data && result.data.messages) {
        const searchMessages = result.data.messages
        const total = result.data.pagination?.total || searchMessages.length
        log.info('搜索结果:', searchMessages.length, '条')

        /* 诊断日志: 确认搜索消息字段名 */
        if (searchMessages.length > 0) {
          log.info('搜索消息字段:', Object.keys(searchMessages[0]))
        }
        const searchResults = searchMessages.map((msg: any) => ({
          chatMessageId: msg.chat_message_id,
          sessionId: msg.customer_service_session_id,
          // 原始消息内容
          content: msg.content || '',
          // 关键词高亮后的HTML内容（供 rich-text 组件渲染）
          highlightContent: this.highlightKeyword(msg.content || '', keyword.trim()),
          // 发送者类型和标签
          senderType: msg.sender_type || 'user',
          senderLabel:
            msg.sender_type === 'user' ? '我' : msg.sender_type === 'admin' ? '客服' : '系统',
          // 格式化时间
          time: msg.created_at ? formatDateMessage(msg.created_at) : '',
          // 消息类型
          messageType: msg.message_type || 'text'
        }))

        this.setData({ searchResults, searchTotal: total, searchLoading: false })
      } else {
        this.setData({ searchResults: [] as any[], searchTotal: 0, searchLoading: false })
      }
    } catch (error: any) {
      log.error('搜索失败:', error)
      this.setData({ searchResults: [] as any[], searchTotal: 0, searchLoading: false })
      showToast(error.message || '搜索失败，请稍后重试')
    }
  },

  /**
   * 搜索关键词高亮 — 生成带内联样式的HTML供 rich-text 组件渲染
   *
   * @param content - 原始消息文本
   * @param keyword - 搜索关键词
   * @returns 带高亮标签的HTML字符串
   *
   * 示例: highlightKeyword("你好世界", "你好")
   *   → '<span style="color:#5B7A5E;font-weight:bold;">你好</span>世界'
   */
  highlightKeyword(content: string, keyword: string): string {
    if (!content || !keyword) {
      return content || ''
    }
    // 转义正则特殊字符，防止用户输入的特殊符号导致正则错误
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`(${escapedKeyword})`, 'gi')
    return content.replace(regex, '<span style="color:#5B7A5E;font-weight:bold;">$1</span>')
  },

  /**
   * 搜索结果点击 — 跳转到对应会话并打开聊天弹窗
   *
   * @param e - 点击事件，通过 data-session-id 获取会话ID
   */
  onSearchResultTap(e: WechatMiniprogram.BaseEvent) {
    const sessionId = e.currentTarget.dataset.sessionId as number
    if (!sessionId) {
      log.warn('搜索结果缺少会话ID')
      return
    }

    log.info('点击搜索结果，跳转到会话:', sessionId)

    // 保存会话信息，打开聊天弹窗
    this.setData({ sessionId, sessionStatus: 'active' })
    this.openChatModal('在线客服', '🎧')
    this.clearSessionUnread(sessionId)
    this.connectWebSocket()
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

    log.info('点击会话:', session.sessionId, session.name)

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
    log.info(' 开始新聊天')
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
    log.info('创建新客服会话')

    try {
      const sessionResult = await API.createChatSession({
        source: 'mobile'
      })

      if (sessionResult.success && sessionResult.data) {
        const session = sessionResult.data.session || sessionResult.data
        log.info('创建会话响应字段:', Object.keys(session))
        const createdSessionId = session.customer_service_session_id
        log.info('聊天会话创建成功，ID:', createdSessionId)

        this.setData({
          sessionId: createdSessionId,
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
        log.error('创建聊天会话失败:', sessionResult.message)
        showToast(sessionResult.message || '连接客服失败，请稍后重试')
      }
    } catch (error) {
      log.error('进入客服服务出错:', error)
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
      // 重置满意度评分状态（切换会话时清除上一个会话的评分状态）
      showSatisfactionCard: false,
      satisfactionSessionId: null,
      satisfactionScore: 0,
      satisfactionSubmitted: false,
      showQuickReplies: false,
      showScrollBottomBtn: false,
      newMsgCount: 0
    })

    // 加载当前会话的历史消息
    this.loadChatHistory()
  },

  /** 关闭聊天弹窗 */
  closeChatModal() {
    log.info('关闭聊天弹窗')
    this.setData({
      showChatModal: false,
      chatLoadStatus: 'idle',
      showSatisfactionCard: false,
      satisfactionScore: 0
    })
    this.disconnectWebSocket()
  },

  // ============================================================================
  // 消息处理方法（已拆分到 chat-message-handlers.ts，通过展开运算符合并）
  // ============================================================================
  ...chatMessageHandlers
})
