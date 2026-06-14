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
const { checkAuth, formatDateMessage, formatFileSize } = Utils

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/** 会话状态文案映射（对应后端 customer_service_sessions.status 字段） */
const SESSION_STATUS_MAP: Record<string, string> = {
  waiting: '等待客服',
  assigned: '已分配',
  active: '对话中',
  closed: '已结束'
}

/** 会话列表每页条数（后端默认 20，实测 total 会超 50，必须分页/下拉加载） */
const SESSION_PAGE_SIZE = 20

/** 聊天记录单页条数（后端默认 50） */
const MESSAGE_PAGE_SIZE = 50

/** 文件上传大小上限（20MB，与后端 upload-file 限制一致，前端预检） */
const FILE_MAX_SIZE = 20 * 1024 * 1024

/** 图片上传大小上限（5MB，与后端 chat upload 限制一致，前端预检） */
const IMAGE_MAX_SIZE = 5 * 1024 * 1024

/**
 * cs-agent 接口错误码 → 用户文案映射（按后端 code 精确区分，禁止一律弹「仅客服座席可访问」）
 * 对接《客服回复台发消息403根因与前端对接说明》第四节：
 * - NOT_CS_AGENT：当前账号非在岗座席
 * - CUSTOMER_SERVICE_FORBIDDEN：会话由其他客服接待，非超管无权回复（会话归属隔离）
 * - CUSTOMER_SERVICE_NOT_FOUND：会话不存在或已关闭
 * - FORBIDDEN：旧版/通用座席校验出口（兼容后端统一 403 文案）
 */
const CS_ERROR_MESSAGE_MAP: Record<string, string> = {
  NOT_CS_AGENT: '仅客服座席可访问',
  FORBIDDEN: '仅客服座席可访问',
  CUSTOMER_SERVICE_FORBIDDEN: '该会话由其他客服接待，您无权回复',
  CUSTOMER_SERVICE_NOT_FOUND: '会话不存在或已关闭'
}

/**
 * 解析 cs-agent 接口错误的展示文案：优先按后端 code 精确映射，
 * 命中不了再退回后端原始 message，最后兜底默认文案。
 * @param error - apiClient 抛出的 ApiError（含 code/statusCode/message）
 * @param fallback - 无 code 命中且无 message 时的兜底文案
 */
function resolveCsErrorMessage(error: any, fallback: string): string {
  const code = error && error.code
  if (code && CS_ERROR_MESSAGE_MAP[code]) {
    return CS_ERROR_MESSAGE_MAP[code]
  }
  return (error && error.message) || fallback
}

Page({
  data: {
    /** 会话列表（后端 GET /sessions 的 data.sessions 精简后） */
    sessions: [] as any[],
    loadingSessions: false,
    /** 分页：当前页码 / 是否还有更多 / 加载更多中 / 会话总数（后端 pagination） */
    sessionPage: 1,
    sessionHasMore: true,
    loadingMoreSessions: false,
    sessionTotal: 0,
    /** 座席身份校验失败（后端 403），用于整页提示 */
    forbidden: false,

    /** 当前选中会话 */
    currentSessionId: null as number | null,
    currentSessionUserName: '',
    currentMessages: [] as any[],
    loadingMessages: false,

    /** 聊天面板是否展开（移动端单栏：列表 ↔ 聊天切换） */
    chatExpanded: false,

    /** WebSocket 是否已连接（座席端实时收用户新消息） */
    wsConnected: false,

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
    /* 座席端接入 WebSocket：以管理端身份握手后监听 new_message，实时收用户新消息 */
    this.connectAgentSocket()
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
    this.disconnectAgentSocket()
  },

  // ============================================================================
  // 会话列表
  // ============================================================================

  /**
   * 刷新待回复会话列表（重置到第 1 页）
   * 后端API: GET /api/v4/system/cs-agent/sessions?page=&page_size=
   * 返回: data.sessions[]（含 customer_service_session_id / user / status /
   *       last_message{content,sender_type,created_at,created_at_beijing} / unread_count /
   *       last_message_at_beijing 等）+ data.pagination{page,page_size,total,total_pages}
   */
  async refreshSessions() {
    if (this.data.loadingSessions) {
      return
    }
    this.setData({ loadingSessions: true })
    try {
      const result = await API.getCsAgentSessions({ page: 1, page_size: SESSION_PAGE_SIZE })
      if (result && result.success && result.data) {
        const rawSessions = result.data.sessions || []
        const sessions = rawSessions.map((session: any) => this._mapSession(session))
        const pagination = result.data.pagination || {}
        const total = parseInt(pagination.total, 10) || sessions.length
        this.setData({
          sessions,
          sessionPage: 1,
          sessionTotal: total,
          sessionHasMore: sessions.length < total,
          loadingSessions: false,
          forbidden: false
        })
        log.info('会话列表刷新成功:', sessions.length, '/', total)
      } else {
        this.setData({ loadingSessions: false })
      }
    } catch (error: any) {
      log.error('刷新会话列表失败:', error)
      /*
       * 列表接口的座席身份校验失败（NOT_CS_AGENT / FORBIDDEN）→ 整页提示"仅客服座席可访问"；
       * 其它错误（如网络）按 code 精确文案 toast，不blanken整页。
       */
      const code = error && error.code
      const isNotAgent = code === 'NOT_CS_AGENT' || code === 'FORBIDDEN'
      if (isNotAgent) {
        this.setData({ forbidden: true, loadingSessions: false, sessions: [] })
      } else {
        this.setData({ loadingSessions: false })
        showToast(resolveCsErrorMessage(error, '获取会话列表失败，请稍后重试'))
      }
    }
  },

  /**
   * 上拉加载更多会话（下一页，追加到现有列表）
   * 由会话列表 scroll-view 的 bindscrolltolower 触发
   */
  async loadMoreSessions() {
    if (this.data.loadingMoreSessions || !this.data.sessionHasMore || this.data.loadingSessions) {
      return
    }
    const nextPage = this.data.sessionPage + 1
    this.setData({ loadingMoreSessions: true })
    try {
      const result = await API.getCsAgentSessions({ page: nextPage, page_size: SESSION_PAGE_SIZE })
      if (result && result.success && result.data) {
        const rawSessions = result.data.sessions || []
        const appended = rawSessions.map((session: any) => this._mapSession(session))
        const mergedSessions = [...this.data.sessions, ...appended]
        const pagination = result.data.pagination || {}
        const total = parseInt(pagination.total, 10) || mergedSessions.length
        this.setData({
          sessions: mergedSessions,
          sessionPage: nextPage,
          sessionTotal: total,
          sessionHasMore: mergedSessions.length < total,
          loadingMoreSessions: false
        })
        log.info('会话列表加载更多:', mergedSessions.length, '/', total)
      } else {
        this.setData({ loadingMoreSessions: false })
      }
    } catch (error: any) {
      log.error('加载更多会话失败:', error)
      this.setData({ loadingMoreSessions: false })
      showToast(resolveCsErrorMessage(error, '加载更多失败'))
    }
  },

  /**
   * 将后端单条会话映射为列表展示对象（前端零字段映射，直读后端 snake_case）
   *
   * 关键字段对齐后端实测返回（文档第12.1节）：
   * - last_message: 对象 { content, sender_type, created_at, created_at_beijing }，null 仅当无消息
   * - unread_count: 座席未读的用户消息条数（红点）
   * - 时间优先用后端下发的北京时间字段（xxx_beijing，零转换直显），无则降级 formatDateMessage
   */
  _mapSession(session: any) {
    const user = session.user || {}
    const userName = user.nickname || (user.user_id ? `用户${user.user_id}` : '未知用户')

    let lastMessage = '暂无消息'
    if (session.last_message && session.last_message.content) {
      const msgType = session.last_message.message_type
      if (msgType === 'image') {
        lastMessage = '[图片]'
      } else if (msgType === 'file') {
        lastMessage = '[文件]'
      } else {
        lastMessage = String(session.last_message.content)
      }
    }

    /* 列表时间：优先后端北京时间字段（无需 +8h），其次 UTC 字段经 formatDateMessage 友好化 */
    const beijingTime = session.last_message_at_beijing || session.updated_at_beijing
    const utcTime = session.last_message_at || session.updated_at || session.created_at || ''
    const lastMessageTime = beijingTime || (utcTime ? formatDateMessage(utcTime) : '')

    const status = session.status || 'waiting'
    return {
      sessionId: session.customer_service_session_id,
      userName,
      avatarText: userName.charAt(0),
      lastMessage,
      lastMessageTime,
      unreadCount: parseInt(session.unread_count, 10) || 0,
      status,
      statusText: session.status_display || SESSION_STATUS_MAP[status] || '未知'
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
    /* 座席打开会话 → 标记该会话用户消息已读，红点（unread_count）清零 */
    this.markSessionRead(sessionId)
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
   * 返回: data.messages[]（含 chat_message_id / sender_type=user/admin / content /
   *       message_type=text/image/file / file_name / file_size / created_at / created_at_beijing）
   */
  async loadMessages(sessionId: number) {
    this.setData({ loadingMessages: true })
    try {
      const result = await API.getCsAgentMessages(sessionId, { page_size: MESSAGE_PAGE_SIZE })
      if (result && result.success && result.data) {
        const rawMessages = result.data.messages || []
        /* 后端已按时间正序返回，仍按主键兜底排序，保证顺序稳定 */
        const messages = rawMessages
          .map((msg: any) => this._mapMessage(msg))
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
      /* 按后端 code 精确区分文案（座席身份/会话归属/会话不存在），不一律弹"仅客服座席可访问" */
      showToast(resolveCsErrorMessage(error, '加载聊天记录失败'))
    }
  },

  /**
   * 将后端单条消息映射为展示对象（前端零字段映射，直读后端 snake_case）
   *
   * - 座席端视角：sender_type='admin'（含本座席）发的为"自己"，靠右展示
   * - 时间优先用后端北京时间字段 created_at_beijing（零转换），无则降级 formatDateMessage
   * - file 类型：带 fileName/fileSize（后端 file_name/file_size），渲染文件卡片
   */
  _mapMessage(msg: any) {
    const senderType = msg.sender_type || 'user'
    const messageType = msg.message_type || 'text'
    return {
      id: msg.chat_message_id,
      senderType,
      isOwn: senderType === 'admin',
      content: msg.content || '',
      messageType,
      fileName: msg.file_name || '',
      fileSize: msg.file_size ? formatFileSize(msg.file_size) : '',
      createdAt:
        msg.created_at_beijing || (msg.created_at ? formatDateMessage(msg.created_at) : ''),
      status: 'sent'
    }
  },

  /**
   * 标记会话已读（座席打开会话时清红点）
   * 后端API: POST /api/v4/system/cs-agent/sessions/:id/read
   * 成功后本地把该会话 unreadCount 置 0，避免再次拉列表才更新
   */
  async markSessionRead(sessionId: number) {
    try {
      await API.markCsAgentSessionRead(sessionId)
      const sessions = this.data.sessions.map((s: any) =>
        s.sessionId === sessionId ? { ...s, unreadCount: 0 } : s
      )
      this.setData({ sessions })
    } catch (error: any) {
      /* 标记已读失败不阻断查看消息，仅记录 */
      log.warn('标记会话已读失败:', error && error.message)
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
   * 上传: POST /api/v4/system/chat/sessions/:id/upload（字段名 image，限 5MB，jpg/png/gif/webp）
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
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async res => {
        const tempFile = res.tempFiles && res.tempFiles[0]
        const filePath = tempFile && tempFile.tempFilePath
        if (!filePath) {
          return
        }
        /* 前端预检：5MB 大小上限（与后端图片上传限制一致） */
        if (tempFile.size && tempFile.size > IMAGE_MAX_SIZE) {
          showToast('图片不能超过5MB')
          return
        }
        this.setData({ sending: true })
        try {
          const uploadResult = await API.uploadChatImage(sessionId, filePath)
          /* 上传图片URL权威字段为 data.image_url（后端已是完整代理URL，直接用） */
          const imageUrl = uploadResult && uploadResult.data ? uploadResult.data.image_url : ''
          if (!imageUrl) {
            throw new Error('图片上传未返回 image_url')
          }
          await this._send({ content: imageUrl, message_type: 'image' })
        } catch (error: any) {
          log.error('发送图片失败:', error)
          showToast(resolveCsErrorMessage(error, '图片发送失败'))
        } finally {
          this.setData({ sending: false })
        }
      }
    })
  },

  /**
   * 统一发送：调用 cs-agent send 接口，成功后追加到消息流（乐观更新）
   * @param params.content - 文字内容 / 图片URL / 文件URL
   * @param params.message_type - text / image / file
   * @param params.file_name - 文件名（message_type='file' 时必填）
   * @param params.file_size - 文件字节数（message_type='file' 时随消息落库）
   */
  async _send(params: {
    content: string
    message_type: string
    file_name?: string
    file_size?: number
  }) {
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
          fileName: params.file_name || '',
          fileSize: params.file_size ? formatFileSize(params.file_size) : '',
          /* 时间优先用后端北京时间字段（零转换），无则降级本地格式化 */
          createdAt:
            result.data.created_at_beijing ||
            (result.data.created_at ? formatDateMessage(result.data.created_at) : ''),
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
      /* 按后端 code 精确区分：CUSTOMER_SERVICE_FORBIDDEN=会话归属保护、NOT_CS_AGENT=非座席等 */
      showToast(resolveCsErrorMessage(error, '发送失败，请重试'))
    } finally {
      this.setData({ sending: false })
    }
  },

  /**
   * 发送文件消息（两步：先上传拿 file_url，再以 message_type='file' 发送）
   * 上传: POST /api/v4/system/chat/sessions/:id/upload-file（字段名 file，限 20MB）
   * 发送: POST /api/v4/system/cs-agent/sessions/:id/send（content=file_url + file_name + file_size）
   * 类型白名单（后端）：pdf/doc/docx/xls/xlsx/ppt/pptx/txt/zip/rar
   */
  onSendFile() {
    if (this.data.sending) {
      return
    }
    if (!this.data.currentSessionId) {
      showToast('请先选择会话')
      return
    }
    const sessionId = this.data.currentSessionId
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      success: async res => {
        const file = res.tempFiles && res.tempFiles[0]
        if (!file || !file.path) {
          return
        }
        /* 前端预检：20MB 大小上限（与后端一致） */
        if (file.size > FILE_MAX_SIZE) {
          showToast('文件不能超过20MB')
          return
        }
        this.setData({ sending: true })
        try {
          const uploadResult = await API.uploadChatFile(sessionId, file.path)
          const uploadData = (uploadResult && uploadResult.data) || {}
          const fileUrl = uploadData.file_url || ''
          if (!fileUrl) {
            throw new Error('文件上传未返回 file_url')
          }
          await this._send({
            content: fileUrl,
            message_type: 'file',
            file_name: uploadData.file_name || file.name,
            file_size: uploadData.file_size || file.size
          })
        } catch (error: any) {
          log.error('发送文件失败:', error)
          showToast(resolveCsErrorMessage(error, '文件发送失败'))
        } finally {
          this.setData({ sending: false })
        }
      }
    })
  },

  /** 预览图片消息 */
  onPreviewImage(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url
    if (url) {
      wx.previewImage({ urls: [url], current: url })
    }
  },

  /**
   * 打开文件消息（下载后用系统能力打开文档）
   * 微信小程序无法直接预览任意远程文件，需先 downloadFile 到本地再 openDocument
   */
  onOpenFile(e: WechatMiniprogram.BaseEvent) {
    const url = e.currentTarget.dataset.url
    if (!url) {
      return
    }
    wx.showLoading({ title: '加载文件中...', mask: true })
    wx.downloadFile({
      url,
      success: downloadRes => {
        if (downloadRes.statusCode === 200) {
          wx.openDocument({
            filePath: downloadRes.tempFilePath,
            showMenu: true,
            fail: (openError: any) => {
              log.error('打开文件失败:', openError)
              showToast('该文件类型暂不支持预览')
            }
          })
        } else {
          showToast('文件下载失败')
        }
      },
      fail: (downloadError: any) => {
        log.error('下载文件失败:', downloadError)
        showToast('文件下载失败')
      },
      complete: () => {
        wx.hideLoading()
      }
    })
  },

  // ============================================================================
  // WebSocket 实时收消息（座席端以管理端身份握手，监听 new_message）
  // ============================================================================

  /**
   * 连接 WebSocket 并订阅消息（复用 App 全局 Socket.IO 连接）
   *
   * 关键前提（对接文档第六节）：座席端必须以"管理端身份"握手（座席账号 role_level>=100），
   * 后端按 user_type=admin 自动加入 admin:{user_id} 与 admins 房间，才能收到精准推送的 new_message。
   * 座席自己发的消息只走 REST（_send），后端不回推给座席自己，故不会重复。
   */
  connectAgentSocket() {
    const token = userStore.accessToken
    if (!token) {
      log.warn('未登录或Token不存在，座席端跳过WebSocket连接')
      return
    }

    const app = getApp()
    if (!app || typeof app.subscribeWebSocketMessages !== 'function') {
      log.error('app对象或WebSocket管理方法不可用，座席端无法接入实时推送')
      return
    }

    /* 订阅全局 Socket.IO 消息（按页面标识隔离，卸载时取消订阅） */
    app.subscribeWebSocketMessages('cs_agent_page', (eventName: string, data: any) => {
      this.handleAgentSocketMessage(eventName, data)
    })

    app
      .connectWebSocket()
      .then(() => {
        log.info('座席端WebSocket连接成功')
        this.setData({ wsConnected: true })
      })
      .catch((error: any) => {
        log.error('座席端WebSocket连接失败:', error)
        this.setData({ wsConnected: false })
      })
  },

  /**
   * 处理座席端 Socket.IO 消息（只关心用户发来的 new_message）
   *
   * new_message payload（后端 snake_case，前端零映射）：
   *   { chat_message_id, customer_service_session_id, sender_id, sender_type, content, message_type, created_at }
   * 命中当前打开会话 → 追加到消息流并标记已读；否则刷新会话列表（红点/预览更新）
   */
  handleAgentSocketMessage(eventName: string, data: any) {
    switch (eventName) {
      case 'websocket_connected':
        this.setData({ wsConnected: true })
        break

      case 'websocket_error':
      case 'websocket_closed':
        this.setData({ wsConnected: false })
        break

      case 'new_message': {
        /* 座席端只会收到"用户发来的"新消息（后端不回推座席自己的消息） */
        if (!data || data.sender_type !== 'user') {
          return
        }
        const incomingSessionId = data.customer_service_session_id
        if (
          this.data.chatExpanded &&
          this.data.currentSessionId &&
          Number(incomingSessionId) === Number(this.data.currentSessionId)
        ) {
          /* 正打开该会话：去重后追加到消息流，并即时标记已读 */
          const exists = this.data.currentMessages.some((m: any) => m.id === data.chat_message_id)
          if (!exists) {
            const appended = this._mapMessage(data)
            this.setData({
              currentMessages: [...this.data.currentMessages, appended],
              scrollToBottom: true
            })
          }
          this.markSessionRead(this.data.currentSessionId)
        } else {
          /* 未打开该会话：刷新列表，更新红点与最后消息预览 */
          this.refreshSessions()
        }
        break
      }

      /* 会话列表有变动（新会话/状态变化）→ 刷新列表 */
      case 'session_list_update':
      case 'session_started':
      case 'session_closed':
        this.refreshSessions()
        break

      default:
        break
    }
  },

  /** 断开 WebSocket 订阅（仅取消本页订阅，全局连接由 App 统一管理） */
  disconnectAgentSocket() {
    const app = getApp()
    if (app && typeof app.unsubscribeWebSocketMessages === 'function') {
      app.unsubscribeWebSocketMessages('cs_agent_page')
    }
    this.setData({ wsConnected: false })
  }
})
