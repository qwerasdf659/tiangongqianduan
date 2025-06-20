// utils/ws.js - WebSocket管理模块

/**
 * 🔴 WebSocket管理器 - 根据后端文档实现
 * 
 * 支持的消息类型：
 * - stock_update: 库存更新推送
 * - points_update: 积分变更推送  
 * - review_result: 审核结果推送
 * - ping/pong: 心跳机制
 */
class WSManager {
  constructor() {
    this.ws = null
    this.isConnected = false
    this.reconnectCount = 0
    this.maxReconnectCount = 5
    this.reconnectInterval = 3000
    this.eventHandlers = new Map()
    this.heartbeatTimer = null
    this.heartbeatInterval = 30000 // 30秒心跳
    this.reconnectTimer = null
    this.messageQueue = [] // 消息队列，用于离线时缓存
    this.connectionUrl = null
  }

  /**
   * 🔴 连接WebSocket - 根据后端文档格式
   * @param {String} url WebSocket地址，格式：wss://domain:8080?token=xxx&version=1.0
   */
  connect(url = null) {
    // 开发环境可选择跳过WebSocket连接
    if (!url && (!getApp().globalData.wsUrl || (getApp().globalData.isDev && !getApp().globalData.needAuth))) {
      console.log('🔧 开发环境跳过WebSocket连接')
      return
    }

    // 保存连接URL供重连使用
    this.connectionUrl = url || this.buildWebSocketUrl()
    
    if (this.ws && this.isConnected) {
      console.log('🔗 WebSocket已连接，跳过重复连接')
      return
    }

    // 断开现有连接
    this.disconnect()

    try {
      console.log('🔗 正在连接WebSocket:', this.connectionUrl)
      
      this.ws = wx.connectSocket({
        url: this.connectionUrl,
        protocols: ['wss'], // 指定协议
        perMessageDeflate: false // 禁用压缩，提高兼容性
      })

      this.setupEventHandlers()

    } catch (error) {
      console.error('❌ WebSocket连接创建失败:', error)
      this.handleConnectionError(error)
    }
  }

  /**
   * 🔴 构建WebSocket连接URL - 根据后端文档规范
   */
  buildWebSocketUrl() {
    const baseUrl = getApp().globalData.wsUrl
    const token = getApp().globalData.accessToken
    const version = '1.0'
    
    if (!baseUrl) {
      throw new Error('WebSocket服务地址未配置')
    }
    
    if (!token) {
      throw new Error('访问令牌未配置')
    }
    
    // 构建符合后端规范的WebSocket URL
    return `${baseUrl}?token=${token}&version=${version}`
  }

  /**
   * 设置WebSocket事件处理器
   */
  setupEventHandlers() {
    this.ws.onOpen(() => {
      console.log('✅ WebSocket连接成功')
      this.isConnected = true
      this.reconnectCount = 0
      this.startHeartbeat()
      this.emit('connected')
      
      // 发送缓存的消息
      this.flushMessageQueue()
    })

    this.ws.onMessage((res) => {
      try {
        const data = JSON.parse(res.data)
        console.log('📨 收到WebSocket消息:', data)
        this.handleMessage(data)
      } catch (error) {
        console.error('❌ 解析WebSocket消息失败:', error, res.data)
      }
    })

    this.ws.onError((error) => {
      console.error('❌ WebSocket连接错误:', error)
      this.isConnected = false
      this.handleConnectionError(error)
    })

    this.ws.onClose((res) => {
      console.log('🔌 WebSocket连接关闭:', res)
      this.isConnected = false
      this.stopHeartbeat()
      this.emit('disconnected', res)
      
      // 自动重连
      this.scheduleReconnect()
    })
  }

  /**
   * 🔴 处理收到的消息 - 根据后端文档的消息格式
   * @param {Object} data 消息数据
   */
  handleMessage(data) {
    const { type, data: payload, timestamp, message_id } = data

    // 记录消息接收时间和ID
    if (message_id) {
      console.log(`📨 处理消息 [${message_id}]:`, type)
    }

    switch (type) {
      case 'pong':
        // 🔴 心跳响应 - 更新服务器时间
        this.handlePong(payload)
        break
        
      case 'stock_update':
        // 🔴 库存更新推送 - 根据后端文档格式
        this.handleStockUpdate(payload)
        break
        
      case 'points_update':
        // 🔴 积分更新推送 - 根据后端文档格式
        this.handlePointsUpdate(payload)
        break
        
      case 'review_result':
        // 🔴 审核结果推送 - 根据后端文档格式
        this.handleReviewResult(payload)
        break
        
      case 'system_notice':
        // 系统通知
        this.handleSystemNotice(payload)
        break
        
      case 'connected':
        // 连接确认
        console.log('✅ 服务器确认连接:', payload)
        break
        
      default:
        console.log('❓ 未处理的消息类型:', type, payload)
        this.emit('unknown_message', { type, payload })
    }
  }

  /**
   * 🔴 处理库存更新推送 - 根据后端文档实现
   */
  handleStockUpdate(payload) {
    const { product_id, stock, operation, timestamp } = payload
    
    console.log('📦 库存更新:', {
      productId: product_id,
      newStock: stock,
      operation,
      timestamp
    })
    
    // 通知应用层处理库存更新
    this.emit('stock_update', {
      data: {
        product_id,
        stock,
        operation,
        timestamp
      }
    })
    
    // 显示库存变更提示（仅在有意义的变更时）
    if (operation === 'purchase' && stock <= 5) {
      wx.showToast({
        title: `商品库存不足(${stock})`,
        icon: 'none',
        duration: 2000
      })
    }
  }

  /**
   * 🔴 处理积分更新推送 - 根据后端文档实现
   */
  handlePointsUpdate(payload) {
    const { user_id, total_points, change_points, reason, operation_id } = payload
    
    console.log('💰 积分更新:', {
      userId: user_id,
      totalPoints: total_points,
      changePoints: change_points,
      reason,
      operationId: operation_id
    })
    
    // 通知应用层处理积分更新
    this.emit('points_update', {
      data: {
        user_id,
        total_points,
        change_points,
        reason,
        operation_id
      }
    })
  }

  /**
   * 🔴 处理审核结果推送 - 根据后端文档实现
   */
  handleReviewResult(payload) {
    const { upload_id, user_id, status, points_awarded, review_reason } = payload
    
    console.log('📋 审核结果:', {
      uploadId: upload_id,
      userId: user_id,
      status,
      pointsAwarded: points_awarded,
      reason: review_reason
    })
    
    // 通知应用层处理审核结果
    this.emit('review_result', {
      data: {
        upload_id,
        user_id,
        status,
        points_awarded,
        review_reason
      }
    })
  }

  /**
   * 处理心跳响应
   */
  handlePong(payload) {
    const { timestamp, server_time } = payload || {}
    
    if (server_time) {
      // 可以用于同步服务器时间
      const serverTime = new Date(server_time)
      const localTime = new Date()
      const timeDiff = serverTime.getTime() - localTime.getTime()
      
      if (Math.abs(timeDiff) > 5000) { // 时间差超过5秒
        console.warn('⏰ 本地时间与服务器时间差异较大:', timeDiff, 'ms')
      }
    }
  }

  /**
   * 处理系统通知
   */
  handleSystemNotice(payload) {
    const { title, content, type = 'info' } = payload
    
    console.log('📢 系统通知:', { title, content, type })
    
    // 显示系统通知
    if (title && content) {
      wx.showModal({
        title: title,
        content: content,
        showCancel: type !== 'info',
        confirmText: '知道了'
      })
    }
    
    this.emit('system_notice', { data: payload })
  }

  /**
   * 🔴 发送消息 - 根据后端文档的消息格式
   * @param {Object} data 消息数据
   */
  send(data) {
    const message = {
      ...data,
      timestamp: Date.now(),
      message_id: this.generateMessageId()
    }

    if (!this.isConnected || !this.ws) {
      console.warn('⚠️ WebSocket未连接，消息已缓存')
      this.messageQueue.push(message)
      return false
    }

    try {
      this.ws.send({
        data: JSON.stringify(message)
      })
      console.log('📤 发送WebSocket消息:', message)
      return true
    } catch (error) {
      console.error('❌ 发送WebSocket消息失败:', error)
      this.messageQueue.push(message) // 发送失败时缓存消息
      return false
    }
  }

  /**
   * 生成消息ID
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 发送缓存的消息
   */
  flushMessageQueue() {
    if (this.messageQueue.length === 0) return

    console.log(`📤 发送缓存的${this.messageQueue.length}条消息`)
    
    const messages = [...this.messageQueue]
    this.messageQueue = []
    
    messages.forEach(message => {
      this.send(message)
    })
  }

  /**
   * 🔴 发送心跳 - 根据后端文档格式
   */
  sendHeartbeat() {
    this.send({
      type: 'ping',
      timestamp: Date.now()
    })
  }

  /**
   * 开始心跳
   */
  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendHeartbeat()
      }
    }, this.heartbeatInterval)
    
    console.log('💓 WebSocket心跳已启动，间隔:', this.heartbeatInterval, 'ms')
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
      console.log('💔 WebSocket心跳已停止')
    }
  }

  /**
   * 处理连接错误
   */
  handleConnectionError(error) {
    this.isConnected = false
    this.emit('error', error)
    
    // 根据错误类型显示不同提示
    if (error && error.errMsg) {
      if (error.errMsg.includes('timeout')) {
        console.log('⏰ WebSocket连接超时')
      } else if (error.errMsg.includes('fail')) {
        console.log('🔌 WebSocket连接失败')
      }
    }
  }

  /**
   * 安排重连
   */
  scheduleReconnect() {
    if (this.reconnectCount >= this.maxReconnectCount) {
      console.log('❌ WebSocket重连次数超限，停止重连')
      this.emit('max_reconnect_reached')
      return
    }

    // 清除之前的重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }

    const delay = this.reconnectInterval * Math.pow(2, this.reconnectCount) // 指数退避
    this.reconnectCount++
    
    console.log(`🔄 将在 ${delay}ms 后进行第 ${this.reconnectCount} 次重连`)
    
    this.reconnectTimer = setTimeout(() => {
      if (!this.isConnected) {
        this.connect(this.connectionUrl)
      }
    }, delay)
  }

  /**
   * 断开WebSocket连接
   */
  disconnect() {
    console.log('🔌 断开WebSocket连接')
    
    // 停止心跳
    this.stopHeartbeat()
    
    // 停止重连
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    // 断开连接
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.isConnected = false
    this.reconnectCount = 0
  }

  /**
   * 🔴 订阅商品库存更新 - 用于兑换页面
   * @param {Array} productIds 商品ID列表
   */
  subscribeProducts(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      console.warn('⚠️ 商品ID列表为空，跳过订阅')
      return
    }
    
    this.send({
      type: 'subscribe_product',
      product_ids: productIds
    })
    
    console.log('📦 已订阅商品库存更新:', productIds)
  }

  /**
   * 监听事件
   * @param {String} event 事件名
   * @param {Function} handler 处理函数
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event).push(handler)
  }

  /**
   * 取消监听事件
   * @param {String} event 事件名
   * @param {Function} handler 处理函数（可选）
   */
  off(event, handler = null) {
    if (!this.eventHandlers.has(event)) {
      return
    }

    if (handler) {
      const handlers = this.eventHandlers.get(event)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    } else {
      this.eventHandlers.delete(event)
    }
  }

  /**
   * 触发事件
   * @param {String} event 事件名
   * @param {*} data 事件数据
   */
  emit(event, data = null) {
    if (!this.eventHandlers.has(event)) {
      return
    }

    const handlers = this.eventHandlers.get(event)
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error(`事件处理器错误 [${event}]:`, error)
      }
    })
  }

  /**
   * 检查连接状态
   */
  isConnectionActive() {
    return this.isConnected && this.ws
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      reconnectCount: this.reconnectCount,
      maxReconnectCount: this.maxReconnectCount,
      messageQueueLength: this.messageQueue.length,
      hasHeartbeat: !!this.heartbeatTimer,
      connectionUrl: this.connectionUrl
    }
  }

  /**
   * 手动触发重连
   */
  forceReconnect() {
    console.log('🔄 手动触发WebSocket重连')
    this.disconnect()
    setTimeout(() => {
      this.reconnectCount = 0 // 重置重连计数
      this.connect(this.connectionUrl)
    }, 1000)
  }
}

module.exports = WSManager 