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
 * 会话频道定义（UI结构常量）
 * type: 前端内部路由标识
 * sessionType: 后端session_type字段匹配值
 * name: 频道显示名称
 * icon: 频道图标（emoji）
 * avatarClass: 头像渐变CSS类名前缀
 */
const SESSION_CHANNEL_DEFS = [
  {
    type: 'customer-service',
    sessionType: 'customer-service',
    name: '在线客服',
    icon: '🎧',
    avatarClass: 'customer-service'
  },
  {
    type: 'system-notify',
    sessionType: 'system-notify',
    name: '系统通知',
    icon: '🔔',
    avatarClass: 'system'
  },
  {
    type: 'ai-assistant',
    sessionType: 'ai-assistant',
    name: 'AI助手',
    icon: '🤖',
    avatarClass: 'ai'
  },
  {
    type: 'tech-support',
    sessionType: 'tech-support',
    name: '技术支持',
    icon: '🛠️',
    avatarClass: 'tech'
  },
  {
    type: 'activity',
    sessionType: 'activity',
    name: '活动咨询',
    icon: '🎉',
    avatarClass: 'activity'
  },
  {
    type: 'feedback',
    sessionType: 'feedback',
    name: '反馈建议',
    icon: '💬',
    avatarClass: 'feedback'
  }
] as const

Page({
  data: {
    // 搜索相关
    searchKeyword: '',

    // 会话频道列表（后端API填充 preview/unread/time 数据）
    sessionChannels: SESSION_CHANNEL_DEFS.map(ch => ({
      ...ch,
      preview: '',
      unread: 0,
      time: '',
      isOnline: false
    })) as any[],

    // 页面加载状态: loading=骨架屏 | success=正常显示 | error=错误+重试
    sessionLoadStatus: 'loading',

    // 总未读数
    totalUnreadCount: 0,

    // 弹窗聊天相关
    showChatModal: false,
    currentChatType: '',
    currentChatName: '',
    currentChatIcon: '',
    isOnline: false,

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
    sessionStatus: 'connecting'
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
   * 4. 加载所有会话数据（客服、系统通知、AI助手等）
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
   * 调用一次 getChatSessions() API，将结果分发到 sessionChannels 数组中。
   * 使用 sessionLoadStatus 管理加载/成功/错误三种状态。
   */
  async loadSessionData() {
    log.info('📊 开始加载会话数据')
    this.setData({ sessionLoadStatus: 'loading' })

    try {
      const { getChatSessions } = API
      const result = await getChatSessions()

      if (result && result.success && result.data && result.data.sessions) {
        const sessions = result.data.sessions
        log.info('✅ 会话列表数据获取成功，共', sessions.length, '个会话')

        this.distributeSessionData(sessions)
        this.setData({ sessionLoadStatus: 'success' })
      } else {
        log.warn('⚠️ 后端未返回有效的会话列表数据')
        this.setData({ sessionLoadStatus: 'error' })
      }

      this.updateTotalUnreadCount()
    } catch (error) {
      log.error('❌ 加载会话数据失败:', error)
      this.setData({ sessionLoadStatus: 'error' })
      showToast('加载会话数据失败')
    }
  },

  /**
   * 分发会话数据到 sessionChannels 数组
   *
   * @param sessions - 后端返回的会话列表数组
   * @description
   * 遍历 sessionChannels，根据 sessionType 匹配后端数据并填充 preview/unread/time。
   */
  distributeSessionData(sessions: any[]) {
    const channels = this.data.sessionChannels.map((channel: any) => {
      const session = sessions.find((s: any) => s.session_type === channel.sessionType)
      if (session) {
        return {
          ...channel,
          preview: session.last_message || '',
          unread: session.unread_count || 0,
          time: session.last_update_time ? formatDateMessage(session.last_update_time) : '',
          isOnline: channel.type === 'customer-service' ? session.is_online || false : false
        }
      }
      return { ...channel, preview: '', unread: 0, time: '' }
    })

    this.setData({ sessionChannels: channels })
    log.info('✅ 会话数据分发完成')
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
   * 遍历 sessionChannels 累加 unread 字段
   */
  updateTotalUnreadCount() {
    const total = this.data.sessionChannels.reduce(
      (sum: number, ch: any) => sum + (ch.unread || 0),
      0
    )
    this.setData({ totalUnreadCount: total })
  },

  /**
   * 清除指定频道的未读计数
   *
   * @param channelType - 频道类型标识（如 'customer-service', 'system-notify'）
   */
  clearChannelUnread(channelType: string) {
    const channels = this.data.sessionChannels.map((ch: any) => {
      if (ch.type === channelType) {
        return { ...ch, unread: 0 }
      }
      return ch
    })
    this.setData({ sessionChannels: channels })
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

  // 执行搜索
  performSearch(keyword: string) {
    log.info('🔍 搜索关键词', keyword)
    // 🔴 后端需提供: GET /api/v4/system/chat/search?keyword=xxx
  },

  // ============================================================================
  // 会话频道点击处理
  // ============================================================================

  /**
   * 统一的会话频道点击事件处理器
   *
   * @param e - 点击事件，通过 data-type 获取频道类型
   * @description
   * 根据频道类型路由到不同的处理逻辑：
   * - customer-service: 创建聊天会话 → 连接WebSocket → 打开聊天弹窗
   * - 其他类型: 直接打开聊天弹窗并加载历史消息
   */
  onSessionTap(e: WechatMiniprogram.BaseEvent) {
    const type = e.currentTarget.dataset.type as string
    const channel = this.data.sessionChannels.find((ch: any) => ch.type === type)
    if (!channel) {
      return
    }

    log.info('🔗 点击会话频道:', channel.name)

    if (type === 'customer-service') {
      this.enterCustomerService()
    } else {
      this.openChatModal(channel.avatarClass, channel.name, channel.icon)
      this.clearChannelUnread(type)
    }
  },

  // 开始新聊天
  startNewChat() {
    log.info('✨ 开始新聊天')
    this.enterCustomerService()
  },

  // 进入在线客服
  async enterCustomerService() {
    log.info('🎧 进入在线客服')

    try {
      // 调用API创建聊天会话
      const sessionResult = await API.createChatSession({
        source: 'mobile'
      })

      if (sessionResult.success && sessionResult.data.session) {
        const session = sessionResult.data.session
        log.info('✅ 聊天会话创建成功:', session)

        // 保存会话信息
        this.setData({
          sessionId: session.sessionId,
          sessionStatus: session.status || 'waiting'
        })

        // 打开聊天弹窗
        this.openChatModal('customer-service', '在线客服', '🎧')

        // 清除未读消息
        this.clearChannelUnread('customer-service')
        this.setData({ showChatModal: true })

        // 连接WebSocket
        this.connectWebSocket()

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

  // 打开聊天弹窗
  openChatModal(type: string, name: string, icon: string) {
    this.setData({
      showChatModal: true,
      currentChatType: type,
      currentChatName: name,
      currentChatIcon: icon,
      isOnline: type === 'customer-service',
      inputContent: '',
      chatLoadStatus: 'loading'
    })

    // 加载对应类型的历史消息
    this.loadChatHistory(type)
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

  // 加载聊天历史
  async loadChatHistory(type: string) {
    log.info('📚 加载聊天历史:', type)
    this.setData({
      isLoadingHistory: true,
      chatLoadStatus: 'loading'
    })

    try {
      if (type === 'customer-service') {
        await this.loadCustomerServiceHistory()
      } else {
        await this.loadOtherTypeHistory(type)
      }
    } catch (error) {
      log.error('❌ 加载历史消息失败:', error)
      this.setData({ chatLoadStatus: 'error' })
      showToast('加载历史消息失败')
    } finally {
      this.setData({ isLoadingHistory: false })
    }
  },

  // 加载客服聊天历史
  async loadCustomerServiceHistory() {
    try {
      if (this.data.sessionId) {
        log.info('📚 从API加载聊天历史，会话ID:', this.data.sessionId)

        const historyResult = await API.getChatHistory(this.data.sessionId, 1, 50)

        if (historyResult.success && historyResult.data.messages) {
          const apiMessages = historyResult.data.messages.map((msg: any) => {
            const senderId = msg.senderId || msg.senderInfo?.userId || null

            // 基于messageSource判断消息显示位置（后端v2.0.1）
            let isOwn = false

            if (msg.messageSource) {
              switch (msg.messageSource) {
                case 'user_client':
                  isOwn = true
                  break
                case 'admin_client':
                case 'system':
                default:
                  isOwn = false
              }
            } else if (msg.senderType) {
              isOwn = msg.senderType === 'user'
            } else {
              isOwn = senderId === this.data.userId
              log.warn('⚠️ [历史消息] 缺少messageSource和senderType，使用senderId判断')
            }

            return {
              id: msg.messageId,
              content: msg.content,
              messageType: msg.messageType || 'text',
              isOwn,
              status: isOwn ? 'sent' : 'read',
              timestamp: new Date(msg.createdAt).getTime(),
              timeText: this.formatMessageTime(msg.createdAt),
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
          return
        } else {
          log.warn('⚠️ API返回的历史消息为空')
        }
      }

      // 没有sessionId或消息为空 → 显示空状态
      this.setData({
        messages: [],
        scrollToBottom: true,
        chatLoadStatus: 'empty'
      })
    } catch (error) {
      log.error('❌ 加载客服历史失败:', error)
      this.setData({
        messages: [],
        chatLoadStatus: 'error'
      })
    }
  },

  /**
   * 加载非客服类型的聊天历史 - 仅从后端API获取真实数据
   *
   * @param type - 会话类型（system/ai/tech/activity/feedback）
   */
  async loadOtherTypeHistory(type: string) {
    log.info('📱 开始加载聊天历史', type)

    this.setData({
      messages: [],
      chatLoadStatus: 'loading'
    })

    try {
      // 先获取该类型的会话session_id
      const sessionsResult = await API.getChatSessions()

      if (!sessionsResult || !sessionsResult.success || !sessionsResult.data?.sessions) {
        log.warn('⚠️ 无法获取会话列表')
        this.setData({ chatLoadStatus: 'empty' })
        return
      }

      // 根据type映射到session_type
      const typeMapping: Record<string, string> = {
        system: 'system-notify',
        ai: 'ai-assistant',
        tech: 'tech-support',
        activity: 'activity',
        feedback: 'feedback'
      }

      const sessionType = typeMapping[type] || type
      const targetSession = sessionsResult.data.sessions.find(
        (s: any) => s.session_type === sessionType
      )

      if (!targetSession || !targetSession.session_id) {
        log.info('📝 该类型暂无会话记录:', type)
        this.setData({ chatLoadStatus: 'empty' })
        return
      }

      // 使用session_id调用getChatHistory
      const response = await API.getChatHistory(targetSession.session_id, 1, 50)

      if (response.success && response.data && response.data.messages) {
        const realMessages = response.data.messages.map((msg: any) => ({
          id: msg.messageId || msg.id,
          content: msg.content || '',
          messageType: msg.messageType || 'text',
          isOwn: msg.senderType === 'user',
          timestamp: new Date(msg.createdAt || msg.timestamp).getTime(),
          timeText: this.formatMessageTime(msg.createdAt || msg.timestamp),
          showTime: true
        }))

        const sortedMessages = realMessages.sort((a: any, b: any) => a.timestamp - b.timestamp)

        log.info('📱 成功加载聊天历史:', type, sortedMessages.length, '条消息')

        this.setData({
          messages: sortedMessages,
          scrollToBottom: true,
          chatLoadStatus: sortedMessages.length > 0 ? 'success' : 'empty'
        })
      } else {
        log.warn('⚠️ 获取聊天历史失败:', response.message || '未知错误')
        this.setData({ chatLoadStatus: 'empty' })
      }
    } catch (error) {
      log.error('❌ 加载聊天历史异常:', error)
      this.setData({ chatLoadStatus: 'error' })
      showToast('系统异常，请稍后重试')
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

  // 处理统一WebSocket消息
  handleUnifiedWebSocketMessage(eventName: string, data: any) {
    log.info('📢 用户端收到统一WebSocket消息:', eventName)

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

      case 'new_user_message':
        this.addMessage(data)
        break

      case 'admin_message':
        log.info('👨‍💼 用户端收到管理员消息:', data)
        this.handleAdminMessage(data)
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

  // 处理管理员消息
  handleAdminMessage(messageData: any) {
    log.info('👨‍💼 处理管理员消息')

    const adminMessage = {
      id: messageData.messageId || `admin_msg_${Date.now()}`,
      content: messageData.content,
      messageType: messageData.messageType || 'text',
      senderId: messageData.adminId || messageData.senderId,
      senderType: 'admin',
      messageSource: messageData.messageSource || 'admin_client',
      timestamp: messageData.timestamp || Date.now(),
      createdAt: messageData.createdAt || new Date().toISOString(),
      attachments: messageData.attachments || []
    }

    this.addMessage(adminMessage)
    log.info('✅ 管理员消息处理完成')
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

  // 添加消息
  addMessage(messageData: any) {
    const senderId = messageData.senderId || messageData.senderInfo?.userId || null

    // 基于messageSource判断消息显示位置（后端v2.0.1）
    let isOwn = false

    if (messageData.messageSource) {
      switch (messageData.messageSource) {
        case 'user_client':
          isOwn = true
          break
        case 'admin_client':
        case 'system':
        default:
          isOwn = false
      }
    } else if (messageData.senderType) {
      isOwn = messageData.senderType === 'user'
    } else {
      isOwn = senderId === this.data.userId
      log.warn('⚠️ [聊天] 缺少messageSource和senderType，使用senderId判断')
    }

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
    this.setData({
      messages,
      scrollToBottom: true,
      chatLoadStatus: 'success'
    })

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

  // 更新会话预览（收到新消息时更新列表中的预览文字）
  updateSessionPreview(content: string) {
    if (this.data.currentChatType === 'customer-service') {
      const channels = this.data.sessionChannels.map((ch: any) => {
        if (ch.type === 'customer-service') {
          return {
            ...ch,
            preview: content,
            unread: this.data.showChatModal ? 0 : ch.unread + 1
          }
        }
        return ch
      })
      this.setData({ sessionChannels: channels })
      this.updateTotalUnreadCount()
    }
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
    if (!this.data.sessionId && this.data.currentChatType === 'customer-service') {
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
      // 立即更新本地消息列表
      const messages = [...this.data.messages, message]
      this.setData({
        messages,
        inputContent: '',
        scrollToBottom: true,
        chatLoadStatus: 'success'
      })

      // 客服聊天：API + WebSocket双通道发送
      if (this.data.currentChatType === 'customer-service' && this.data.sessionId) {
        // 1. 通过API发送消息（确保存储到数据库）
        try {
          const apiResult = await API.sendChatMessage({
            sessionId: this.data.sessionId,
            content,
            messageType: 'text',
            tempMessageId: message.id,
            messageSource: 'user_client',
            senderType: 'user'
          })

          if (apiResult.success) {
            log.info('✅ API消息发送成功')

            const updatedMessages = this.data.messages.map((msg: any) =>
              msg.id === message.id
                ? {
                    ...msg,
                    status: 'sent',
                    id: apiResult.data.messageId || msg.id
                  }
                : msg
            )
            this.setData({ messages: updatedMessages })
          } else {
            log.error('❌ API消息发送失败', apiResult.message)
            throw new Error(apiResult.message || 'API发送失败')
          }
        } catch (apiError) {
          log.error('❌ API发送消息出错', apiError)
        }

        // 2. 通过WebSocket发送消息（实时通知）
        if (this.websocket && this.data.wsConnected) {
          const wsMessage = {
            type: 'send_message',
            sessionId: this.data.sessionId,
            content,
            messageType: 'text',
            messageSource: 'user_client',
            senderType: 'user'
          }

          try {
            this.websocket.send({
              data: JSON.stringify(wsMessage)
            })
            log.info('✅ WebSocket消息发送成功')
          } catch (wsError) {
            log.error('❌ WebSocket发送失败', wsError)
          }
        }
      } else {
        // 非客服聊天功能暂未实现
        log.warn('⚠️ 非客服聊天功能暂未实现，等待后端API开发')
        showToast('该聊天类型暂未开放')

        const updatedMessages = this.data.messages.filter((msg: any) => msg.id !== message.id)
        this.setData({ messages: updatedMessages })
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
   * 发送图片 - 功能暂不可用（后端/photo/upload路由已废弃）
   * TODO: 等后端提供聊天专用图片上传接口后恢复
   */
  sendImage() {
    log.info('📷 发送图片 - 功能暂不可用')
    wx.showToast({
      title: '图片发送功能暂不可用',
      icon: 'none',
      duration: 2000
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
      content: `会话类型：${this.data.currentChatName}\n状态：${this.data.isOnline ? '在线' : '离线'}`,
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
  }
})

export {}
