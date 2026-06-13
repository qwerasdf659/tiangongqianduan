/**
 * 简版客服座席回复端
 *
 * 业务定位（对接文档《微信小程序简版客服回复端》）：
 *   给「客服座席」用的极简回复端，只做三件事——看待回复会话列表、看聊天记录、发文字/图片消息。
 *   准入基于「客服座席」身份（后端 customer_service_agents 表 status=active），非管理员等级；
 *   非座席账号调用后端返回 403（code: FORBIDDEN），前端据此提示「仅客服座席可访问」。
 *   与 Web 后台客服工作台共用同一套 customer_service_sessions / chat_messages 表，数据天然互通。
 *
 * 明确不做：统计、用户画像、工单、分配、会话转接/关闭等管理能力（这些在 Web 后台客服工作台）。
 *
 * 后端API（前缀 /api/v4/system/cs-agent，均需 Bearer Token）：
 *   - GET  /sessions                 待回复会话列表
 *   - GET  /sessions/:id/messages    某会话聊天记录
 *   - POST /sessions/:id/send        发文字/图片消息
 *   - 图片上传复用 POST /api/v4/system/chat/sessions/:id/upload
 *
 * @file packageAdmin/customer-service/customer-service.ts
 * @version 6.0.0
 * @since 2026-06-14
 */

const { Wechat, API, Utils, Logger } = require('../../utils/index')
const log = Logger.createLogger('cs-agent')
const { showToast } = Wechat
const { checkAuth, formatDateMessage } = Utils

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/** 会话状态文案映射（对应后端 customer_service_sessions.status 字段） */
const SESSION_STATUS_MAP: Record<string, string> = {
  waiting: '等待客服',
  assigned: '已分配',
  active: '对话中',
  closed: '已结束'
}

Page({
  data: {
    /** 会话列表（后端 GET /sessions 的 data.sessions 精简后） */
    sessions: [] as any[],
    loadingSessions: false,
    /** 座席身份校验失败（后端 403），用于整页提示 */
    forbidden: false,

    /** 当前选中会话 */
    currentSessionId: null as number | null,
    currentSessionUserName: '',
    currentMessages: [] as any[],
    loadingMessages: false,

    /** 聊天面板是否展开（移动端单栏：列表 ↔ 聊天切换） */
    chatExpanded: false,

    /** 输入框内容与发送态 */
    inputContent: '',
    sending: false,
    scrollToBottom: false
  },

  onLoad() {
    log.info('简版客服回复端加载')
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo'],
      actions: []
    })

    /* 仅需登录态；是否为座席由后端 cs-agent 接口现查座席表后用 403 裁决 */
    if (!checkAuth()) {
      return
    }
    this.refreshSessions()
  },

  onShow() {
    if (!checkAuth({ redirect: false })) {
      return
    }
    /* 进页/返回时重新拉列表，避免显示过期数据 */
    this.refreshSessions()
    /* 若正打开某会话，刷新其聊天记录以看到用户最新回复 */
    if (this.data.currentSessionId) {
      this.loadMessages(this.data.currentSessionId)
    }
  },

  /** 下拉刷新会话列表 */
  onPullDownRefresh() {
    this.refreshSessions().finally(() => wx.stopPullDownRefresh())
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  // ============================================================================
  // 会话列表
  // ============================================================================

  /**
   * 刷新待回复会话列表
   * 后端API: GET /api/v4/system/cs-agent/sessions
   * 返回: data.sessions[]（含 customer_service_session_id / user / status / last_message / unread_count）
   */
  async refreshSessions() {
    if (this.data.loadingSessions) {
      return
    }
    this.setData({ loadingSessions: true })
    try {
      const result = await API.getCsAgentSessions({ page: 1, page_size: 50 })
      if (result && result.success && result.data) {
        const rawSessions = result.data.sessions || []
        const sessions = rawSessions.map((session: any) => {
          const user = session.user || {}
          const userName = user.nickname || (user.user_id ? `用户${user.user_id}` : '未知用户')
          const lastMessage =
            session.last_message && session.last_message.content
              ? String(session.last_message.content)
              : '暂无消息'
          const timeSource = session.updated_at || session.created_at || ''
          const status = session.status || 'waiting'
          return {
            sessionId: session.customer_service_session_id,
            userName,
            avatarText: userName.charAt(0),
            lastMessage,
            lastMessageTime: timeSource ? formatDateMessage(timeSource) : '',
            unreadCount: parseInt(session.unread_count, 10) || 0,
            status,
            statusText: SESSION_STATUS_MAP[status] || '未知'
          }
        })
        this.setData({ sessions, loadingSessions: false, forbidden: false })
        log.info('会话列表刷新成功:', sessions.length)
      } else {
        this.setData({ loadingSessions: false })
      }
    } catch (error: any) {
      log.error('刷新会话列表失败:', error)
      /* 后端座席校验失败（403 FORBIDDEN）：整页提示，不是座席无法使用本端 */
      if (error && (error.statusCode === 403 || error.code === 'FORBIDDEN')) {
        this.setData({ forbidden: true, loadingSessions: false, sessions: [] })
      } else {
        this.setData({ loadingSessions: false })
        showToast(error.message || '获取会话列表失败，请稍后重试')
      }
    }
  },

  // ============================================================================
  // 会话选择与聊天记录
  // ============================================================================

  /** 选择会话 → 展开聊天面板并加载记录 */
  onSelectSession(e: WechatMiniprogram.BaseEvent) {
    const sessionId = e.currentTarget.dataset.sessionId
    const session = this.data.sessions.find((s: any) => s.sessionId === sessionId)
    this.setData({
      currentSessionId: sessionId,
      currentSessionUserName: session ? session.userName : '用户',
      currentMessages: [],
      chatExpanded: true,
      scrollToBottom: false
    })
    this.loadMessages(sessionId)
  },

  /** 返回会话列表 */
  onBackToList() {
    this.setData({ chatExpanded: false })
  },

  /** 手动刷新当前会话聊天记录（看用户最新回复） */
  onRefreshMessages() {
    if (this.data.currentSessionId) {
      this.loadMessages(this.data.currentSessionId)
    }
  },

  /**
   * 加载某会话聊天记录
   * 后端API: GET /api/v4/system/cs-agent/sessions/:id/messages
   * 返回: data.messages[]（含 sender_type=user/admin / content / message_type / created_at）
   */
  async loadMessages(sessionId: number) {
    this.setData({ loadingMessages: true })
    try {
      const result = await API.getCsAgentMessages(sessionId, { page_size: 50 })
      if (result && result.success && result.data) {
        const rawMessages = result.data.messages || []
        const messages = rawMessages
          .map((msg: any) => {
            const senderType = msg.sender_type || 'user'
            return {
              id: msg.chat_message_id,
              senderType,
              /* 座席端视角：admin（含本座席）发的为"自己"，靠右展示 */
              isOwn: senderType === 'admin',
              content: msg.content || '',
              messageType: msg.message_type || 'text',
              createdAt: msg.created_at ? formatDateMessage(msg.created_at) : '',
              status: 'sent'
            }
          })
          .sort((a: any, b: any) => a.id - b.id)
        this.setData({
          currentMessages: messages,
          loadingMessages: false,
          scrollToBottom: true
        })
      } else {
        this.setData({ loadingMessages: false })
      }
    } catch (error: any) {
      log.error('加载聊天记录失败:', error)
      this.setData({ loadingMessages: false })
      if (error && (error.statusCode === 403 || error.code === 'FORBIDDEN')) {
        showToast('仅客服座席可访问')
      } else {
        showToast(error.message || '加载聊天记录失败')
      }
    }
  },

  // ============================================================================
  // 发送消息
  // ============================================================================

  /** 输入框内容变化 */
  onInputChange(e: WechatMiniprogram.Input) {
    this.setData({ inputContent: e.detail.value })
  },

  /**
   * 发送文字消息
   * 后端API: POST /api/v4/system/cs-agent/sessions/:id/send
   */
  async onSendText() {
    if (this.data.sending) {
      return
    }
    const content = (this.data.inputContent || '').trim()
    if (!content) {
      showToast('请输入回复内容')
      return
    }
    if (!this.data.currentSessionId) {
      showToast('请先选择会话')
      return
    }
    await this._send({ content, message_type: 'text' })
    this.setData({ inputContent: '' })
  },

  /**
   * 发送图片消息（两步：先上传拿 URL，再以 message_type='image' 发送）
   * 上传: POST /api/v4/system/chat/sessions/:id/upload（字段名 image，限 5MB）
   * 发送: POST /api/v4/system/cs-agent/sessions/:id/send（content = 图片URL）
   */
  onSendImage() {
    if (this.data.sending) {
      return
    }
    if (!this.data.currentSessionId) {
      showToast('请先选择会话')
      return
    }
    const sessionId = this.data.currentSessionId
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        const filePath = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
        if (!filePath) {
          return
        }
        this.setData({ sending: true })
        try {
          const uploadResult = await API.uploadChatImage(sessionId, filePath)
          /* 上传图片URL权威字段固定为 public_url（聊天图片上传契约） */
          const imageUrl = uploadResult && uploadResult.data ? uploadResult.data.public_url : ''
          if (!imageUrl) {
            throw new Error('图片上传未返回 public_url')
          }
          await this._send({ content: imageUrl, message_type: 'image' })
        } catch (error: any) {
          log.error('发送图片失败:', error)
          showToast(error.message || '图片发送失败')
        } finally {
          this.setData({ sending: false })
        }
      }
    })
  },

  /**
   * 统一发送：调用 cs-agent send 接口，成功后追加到消息流（乐观更新）
   * @param params.content - 文字内容或图片URL
   * @param params.message_type - text / image
   */
  async _send(params: { content: string; message_type: string }) {
    const sessionId = this.data.currentSessionId
    if (!sessionId) {
      return
    }
    this.setData({ sending: true })
    try {
      const result = await API.sendCsAgentMessage(sessionId, params)
      if (result && result.success && result.data) {
        const appended = {
          id: result.data.chat_message_id,
          senderType: 'admin',
          isOwn: true,
          content: result.data.content || params.content,
          messageType: result.data.message_type || params.message_type,
          createdAt: result.data.created_at ? formatDateMessage(result.data.created_at) : '',
          status: 'sent'
        }
        this.setData({
          currentMessages: [...this.data.currentMessages, appended],
          scrollToBottom: true
        })
        /* 同步刷新会话列表的"最后消息"预览 */
        this.refreshSessions()
      } else {
        showToast((result && result.message) || '发送失败')
      }
    } catch (error: any) {
      log.error('发送消息失败:', error)
      if (error && (error.statusCode === 403 || error.code === 'FORBIDDEN')) {
        showToast('仅客服座席可访问')
      } else {
        showToast(error.message || '发送失败，请重试')
      }
    } finally {
      this.setData({ sending: false })
    }
  },

  /** 预览图片消息 */
  onPreviewImage(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({ urls: [url], current: url })
    }
  }
})
