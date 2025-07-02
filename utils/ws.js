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
   * @param {String} url WebSocket地址，格式：wss://domain/ws?token=xxx&client_type=miniprogram
   */
  connect(url = null) {
    // 🔧 修复：开发环境增强错误处理
    const app = getApp()
    const devConfig = app.globalData.developmentMode || {}
    
    if (!url && (!app.globalData.wsUrl || (app.globalData.isDev && !app.globalData.needAuth))) {
      console.log('🔧 开发环境跳过WebSocket连接')
      return Promise.resolve() // 返回resolved Promise
    }

    // 🔧 修复：开发环境静默处理WebSocket错误
    if (devConfig.silentWebSocketErrors) {
      console.log('🔧 开发环境启用WebSocket静默模式')
    }

    // 保存连接URL供重连使用
    try {
      this.connectionUrl = url || this.buildWebSocketUrl()
    } catch (error) {
      console.error('❌ WebSocket URL构建失败:', error)
      // 🔧 修复：开发环境静默处理URL构建失败
      if (devConfig.silentWebSocketErrors) {
        console.log('🔧 开发环境静默处理WebSocket URL构建失败')
        return Promise.resolve() // 静默返回成功
      }
      this.handleConnectionError(error)
      return Promise.reject(error)
    }
    
    if (this.ws && this.isConnected) {
      console.log('🔗 WebSocket已连接，跳过重复连接')
      return Promise.resolve()
    }

    // 断开现有连接
    this.disconnect()

    return new Promise((resolve, reject) => {
      try {
        console.log('🔗 正在连接WebSocket:', this.connectionUrl)
        
        // 🔧 修复：增加连接超时处理
        const connectTimeout = setTimeout(() => {
          console.warn('⏰ WebSocket连接超时 (10秒)')
          if (this.ws) {
            this.ws.close()
          }
          
          // 🔧 修复：开发环境静默处理连接超时
          if (devConfig.silentWebSocketErrors) {
            console.log('🔧 开发环境静默处理WebSocket连接超时')
            resolve() // 静默返回成功
          } else {
            this.handleConnectionError(new Error('连接超时'))
            reject(new Error('WebSocket连接超时'))
          }
        }, devConfig.webSocketTimeout || 10000) // 使用配置的超时时间
        
        this.ws = wx.connectSocket({
          url: this.connectionUrl,
          protocols: ['wss'], // 指定协议
          perMessageDeflate: false // 禁用压缩，提高兼容性
        })

        // 🔧 修复：临时保存resolve/reject，供事件处理器使用
        this._connectResolve = resolve
        this._connectReject = reject
        this._connectTimeout = connectTimeout

        this.setupEventHandlers()

      } catch (error) {
        console.error('❌ WebSocket连接创建失败:', error)
        
        // 🔧 修复：开发环境静默处理连接创建失败
        if (devConfig.silentWebSocketErrors) {
          console.log('🔧 开发环境静默处理WebSocket连接创建失败')
          resolve() // 静默返回成功
        } else {
          this.handleConnectionError(error)
          reject(error)
        }
      }
    })
  }

  /**
   * 🔴 构建WebSocket连接URL - 根据后端文档规范
   */
  buildWebSocketUrl() {
    // 🔧 修复：增强错误处理和配置检查
    let baseUrl, token
    
    try {
      const app = getApp()
      baseUrl = app.globalData.wsUrl
      token = app.globalData.accessToken
    } catch (error) {
      console.error('❌ 获取全局配置失败:', error)
      throw new Error('无法获取应用全局配置')
    }
    
    if (!baseUrl) {
      console.warn('⚠️ WebSocket服务地址未配置，跳过连接')
      throw new Error('WebSocket服务地址未配置')
    }
    
    if (!token) {
      console.warn('⚠️ 访问令牌未配置，跳过连接')  
      throw new Error('访问令牌未配置')
    }
    
    // 🔧 修复：增加URL格式验证
    if (!baseUrl.startsWith('ws://') && !baseUrl.startsWith('wss://')) {
      console.warn('⚠️ WebSocket URL格式可能不正确:', baseUrl)
    }
    
    // 🔴 构建符合后端规范的WebSocket URL 
    // 格式：ws://localhost:8080?token=xxx&client_type=miniprogram
    // 或生产环境：wss://domain/ws?token=xxx&client_type=miniprogram
    let wsUrl = baseUrl
    
    try {
      // 确保URL格式正确
      if (baseUrl.includes('/ws')) {
        // 如果已包含/ws路径，直接使用
        wsUrl = `${baseUrl}?token=${encodeURIComponent(token)}&client_type=miniprogram`
      } else {
        // 如果是纯域名端口格式，添加查询参数
        wsUrl = `${baseUrl}?token=${encodeURIComponent(token)}&client_type=miniprogram`
      }
      
      console.log('🔗 构建的WebSocket URL:', wsUrl.replace(token, '***TOKEN***')) // 隐藏token日志
      
      return wsUrl
      
    } catch (error) {
      console.error('❌ URL构建过程中出错:', error)
      throw new Error('WebSocket URL构建失败')
    }
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
      
      // 🔧 修复：清除连接超时并调用resolve
      if (this._connectTimeout) {
        clearTimeout(this._connectTimeout)
        this._connectTimeout = null
      }
      if (this._connectResolve) {
        this._connectResolve()
        this._connectResolve = null
        this._connectReject = null
      }
      
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
      
      // 🔧 修复：开发环境静默处理WebSocket错误
      const app = getApp()
      const devConfig = app.globalData.developmentMode || {}
      
      // 🔧 修复：清除连接超时并调用reject
      if (this._connectTimeout) {
        clearTimeout(this._connectTimeout)
        this._connectTimeout = null
      }
      if (this._connectReject) {
        if (devConfig.silentWebSocketErrors) {
          console.log('🔧 开发环境静默处理WebSocket连接错误')
          this._connectResolve() // 静默返回成功
        } else {
          this._connectReject(error)
        }
        this._connectResolve = null
        this._connectReject = null
      }
      
      // 🔧 修复：开发环境静默处理错误
      if (!devConfig.silentWebSocketErrors) {
        this.handleConnectionError(error)
      } else {
        console.log('🔧 开发环境静默处理WebSocket错误，不显示错误提示')
      }
    })

    this.ws.onClose((res) => {
      console.log('🔌 WebSocket连接关闭:', res)
      this.isConnected = false
      this.stopHeartbeat()
      this.emit('disconnected', res)
      
      // 🔧 修复：连接关闭时也要处理Promise
      if (this._connectReject && !this.isConnected) {
        this._connectReject(new Error('WebSocket连接被关闭'))
        this._connectResolve = null
        this._connectReject = null
      }
      
      // 自动重连
      this.scheduleReconnect()
    })
  }

  /**
   * 🔴 处理收到的消息 - 根据后端文档的消息格式
   * @param {Object} data 消息数据
   */
  handleMessage(data) {
    const { type, data: payload, timestamp } = data

    // 记录消息接收
    console.log(`📨 处理消息:`, type, payload)

    switch (type) {
      case 'pong':
        // 🔴 心跳响应
        this.handlePong(payload)
        break
        
      case 'points_update':
        // 🔴 积分更新推送 - 根据后端文档格式
        this.handlePointsUpdate(payload)
        break
        
      case 'stock_update':
        // 🔴 库存更新推送 - 根据后端文档格式
        this.handleStockUpdate(payload)
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
   * 🔴 处理积分更新推送 - 根据后端文档实现
   */
  handlePointsUpdate(payload) {
    const { user_id, total_points, change_points, reason, reason_text, timestamp } = payload
    
    console.log('💰 积分更新:', {
      userId: user_id,
      totalPoints: total_points,
      changePoints: change_points,
      reason,
      reasonText: reason_text,
      timestamp
    })
    
    // 通知应用层处理积分更新
    this.emit('points_update', {
      data: {
        user_id,
        total_points,
        change_points,
        reason,
        reason_text,
        timestamp
      }
    })
  }

  /**
   * 🔴 处理库存更新推送 - 根据后端文档实现
   */
  handleStockUpdate(payload) {
    const { product_id, stock, product_name, timestamp } = payload
    
    console.log('📦 库存更新:', {
      productId: product_id,
      newStock: stock,
      productName: product_name,
      timestamp
    })
    
    // 通知应用层处理库存更新
    this.emit('stock_update', {
      data: {
        product_id,
        stock,
        product_name,
        timestamp
      }
    })
    
    // 显示库存变更提示（仅在库存较少时）
    if (stock <= 5 && stock > 0) {
      wx.showToast({
        title: `${product_name} 库存不足`,
        icon: 'none',
        duration: 2000
      })
    } else if (stock === 0) {
      wx.showToast({
        title: `${product_name} 已售罄`,
        icon: 'none',
        duration: 2000
      })
    }
  }

  /**
   * 🔴 处理审核结果推送 - 根据后端文档实现
   */
  handleReviewResult(payload) {
    const { upload_id, status, points_awarded, review_reason, timestamp } = payload
    
    console.log('📋 审核结果:', {
      uploadId: upload_id,
      status,
      pointsAwarded: points_awarded,
      reviewReason: review_reason,
      timestamp
    })
    
    // 通知应用层处理审核结果
    this.emit('review_result', {
      data: {
        upload_id,
        status,
        points_awarded,
        review_reason,
        timestamp
      }
    })
  }

  /**
   * 处理心跳响应
   */
  handlePong(payload) {
    console.log('💓 收到心跳响应')
    
    // 如果服务器返回时间，可以用来同步时间
    if (payload && payload.server_time) {
      const serverTime = new Date(payload.server_time)
      const clientTime = new Date()
      const timeDiff = Math.abs(serverTime.getTime() - clientTime.getTime())
      
      if (timeDiff > 30000) { // 时间差超过30秒
        console.warn('⚠️ 客户端与服务器时间差较大:', timeDiff / 1000, '秒')
      }
    }
  }

  /**
   * 处理系统通知
   */
  handleSystemNotice(payload) {
    const { title, content, type = 'info' } = payload
    
    console.log('🔔 系统通知:', { title, content, type })
    
    // 显示系统通知
    wx.showModal({
      title: title || '系统通知',
      content: content || '收到系统消息',
      showCancel: false,
      confirmText: '知道了'
    })
    
    this.emit('system_notice', { data: payload })
  }

  /**
   * 发送消息到服务器
   */
  send(data) {
    if (!this.isConnected || !this.ws) {
      console.warn('⚠️ WebSocket未连接，消息加入队列:', data)
      this.messageQueue.push(data)
      return false
    }

    try {
      const message = JSON.stringify({
        ...data,
        timestamp: new Date().toISOString(),
        message_id: this.generateMessageId()
      })
      
      this.ws.send({
        data: message
      })
      
      console.log('📤 发送WebSocket消息:', data)
      return true
    } catch (error) {
      console.error('❌ 发送WebSocket消息失败:', error)
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
    
    console.log(`📤 发送缓存消息 ${this.messageQueue.length} 条`)
    
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift()
      this.send(message)
    }
  }

  /**
   * 发送心跳
   */
  sendHeartbeat() {
    this.send({
      type: 'ping',
      data: {
        client_time: new Date().toISOString()
      }
    })
  }

  /**
   * 开始心跳
   */
  startHeartbeat() {
    this.stopHeartbeat() // 先停止现有心跳
    
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendHeartbeat()
      }
    }, this.heartbeatInterval)
    
    console.log('💓 开始心跳检测')
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
      console.log('💓 停止心跳检测')
    }
  }

  /**
   * 🔧 修复：处理连接错误（静默处理）
   */
  handleConnectionError(error) {
    // 🔧 静默处理WebSocket连接错误，不显示醒目的错误日志
    console.log('⚠️ WebSocket连接异常:', error.errMsg || error.message || '连接失败')
    
    this.isConnected = false
    this.stopHeartbeat()
    
    // 🔧 清理连接Promise状态
    if (this._connectTimeout) {
      clearTimeout(this._connectTimeout)
      this._connectTimeout = null
    }
    
    // 🔧 静默发送错误事件，不显示用户弹窗
    this.emit('error', {
      ...error,
      handled: true,  // 标记为已处理
      silent: true    // 静默处理
    })
    
    console.log('💡 提示：WebSocket连接失败不影响应用核心功能')
  }

  /**
   * 🔧 修复：计划重连（减少重连频率）
   */
  scheduleReconnect() {
    if (this.reconnectCount >= this.maxReconnectCount) {
      console.log('⚠️ 达到最大WebSocket重连次数，停止重连（不影响应用使用）')
      this.emit('max_reconnect_reached')
      return
    }

    // 🔧 修复：增加重连延迟，减少网络压力
    const delay = Math.min(3000 * Math.pow(2, this.reconnectCount), 60000) // 起始3秒，最大60秒
    
    console.log(`🔄 计划 ${delay/1000} 秒后进行第 ${this.reconnectCount + 1} 次WebSocket重连`)
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectCount++
      console.log(`🔄 执行第 ${this.reconnectCount} 次WebSocket重连`)
      
      // 🔧 修复：重连时也要处理Promise错误
      this.connect().catch((error) => {
        console.log('⚠️ WebSocket重连失败:', error.message)
        // 继续计划下次重连
        this.scheduleReconnect()
      })
    }, delay)
  }

  /**
   * 断开连接
   */
  disconnect() {
    console.log('🔌 断开WebSocket连接')
    
    // 清理定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    this.stopHeartbeat()
    
    // 关闭连接
    if (this.ws) {
      try {
        this.ws.close({
          code: 1000,
          reason: 'Client disconnect'
        })
      } catch (error) {
        console.warn('关闭WebSocket时出错:', error)
      }
      this.ws = null
    }
    
    this.isConnected = false
    this.reconnectCount = 0
    
    this.emit('disconnected')
  }

  /**
   * 订阅商品更新（可用于特定商品的库存监听）
   */
  subscribeProducts(productIds) {
    if (!Array.isArray(productIds)) {
      productIds = [productIds]
    }
    
    this.send({
      type: 'subscribe',
      data: {
        target: 'products',
        product_ids: productIds
      }
    })
  }

  /**
   * 事件监听
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    
    this.eventHandlers.get(event).push(handler)
  }

  /**
   * 移除事件监听
   */
  off(event, handler = null) {
    if (!this.eventHandlers.has(event)) return
    
    if (handler === null) {
      // 移除所有监听器
      this.eventHandlers.delete(event)
    } else {
      // 移除特定监听器
      const handlers = this.eventHandlers.get(event)
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
      
      // 如果没有监听器了，删除事件
      if (handlers.length === 0) {
        this.eventHandlers.delete(event)
      }
    }
  }

  /**
   * 触发事件
   */
  emit(event, data = null) {
    if (!this.eventHandlers.has(event)) return
    
    const handlers = this.eventHandlers.get(event)
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error(`❌ 执行事件处理器失败 [${event}]:`, error)
      }
    })
  }

  /**
   * 检查连接状态
   */
  isConnectionActive() {
    return this.isConnected && this.ws !== null
  }

  /**
   * 获取连接统计信息
   */
  getConnectionStats() {
    return {
      isConnected: this.isConnected,
      reconnectCount: this.reconnectCount,
      messageQueueLength: this.messageQueue.length,
      hasHeartbeat: this.heartbeatTimer !== null
    }
  }

  /**
   * 强制重连
   */
  forceReconnect() {
    console.log('🔄 强制重连WebSocket')
    this.disconnect()
    this.reconnectCount = 0
    this.connect()
  }
}

module.exports = WSManager 