// utils/ws.js - WebSocket管理模块

/**
 * WebSocket管理器
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
  }

  /**
   * 连接WebSocket
   * @param {String} url WebSocket地址
   */
  connect(url = null) {
    // 开发环境暂不连接WebSocket
    if (!url && (!getApp().globalData.wsUrl || getApp().globalData.isDev)) {
      console.log('🔧 开发环境跳过WebSocket连接')
      return
    }

    const wsUrl = url || getApp().globalData.wsUrl
    
    if (this.ws && this.isConnected) {
      console.log('WebSocket已连接')
      return
    }

    try {
      console.log('🔗 连接WebSocket:', wsUrl)
      
      this.ws = wx.connectSocket({
        url: wsUrl,
        header: {
          'Authorization': `Bearer ${getApp().globalData.accessToken}`
        }
      })

      this.ws.onOpen(() => {
        console.log('✅ WebSocket连接成功')
        this.isConnected = true
        this.reconnectCount = 0
        this.startHeartbeat()
        this.emit('connected')
      })

      this.ws.onMessage((res) => {
        try {
          const data = JSON.parse(res.data)
          console.log('📨 收到WebSocket消息:', data)
          this.handleMessage(data)
        } catch (error) {
          console.error('❌ 解析WebSocket消息失败:', error)
        }
      })

      this.ws.onError((error) => {
        console.error('❌ WebSocket连接错误:', error)
        this.isConnected = false
        this.emit('error', error)
      })

      this.ws.onClose((res) => {
        console.log('🔌 WebSocket连接关闭:', res)
        this.isConnected = false
        this.stopHeartbeat()
        this.emit('disconnected')
        
        // 自动重连
        if (this.reconnectCount < this.maxReconnectCount) {
          this.reconnect()
        }
      })

    } catch (error) {
      console.error('❌ WebSocket连接失败:', error)
    }
  }

  /**
   * 重连WebSocket
   */
  reconnect() {
    if (this.reconnectCount >= this.maxReconnectCount) {
      console.log('❌ WebSocket重连次数超限，停止重连')
      return
    }

    this.reconnectCount++
    console.log(`🔄 WebSocket重连中... (${this.reconnectCount}/${this.maxReconnectCount})`)

    setTimeout(() => {
      this.connect()
    }, this.reconnectInterval * this.reconnectCount) // 递增重连间隔
  }

  /**
   * 断开WebSocket连接
   */
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
    this.stopHeartbeat()
  }

  /**
   * 发送消息
   * @param {Object} data 消息数据
   */
  send(data) {
    if (!this.isConnected || !this.ws) {
      console.warn('⚠️ WebSocket未连接，无法发送消息')
      return false
    }

    try {
      this.ws.send({
        data: JSON.stringify(data)
      })
      console.log('📤 发送WebSocket消息:', data)
      return true
    } catch (error) {
      console.error('❌ 发送WebSocket消息失败:', error)
      return false
    }
  }

  /**
   * 处理收到的消息
   * @param {Object} data 消息数据
   */
  handleMessage(data) {
    const { type, payload } = data

    switch (type) {
      case 'heartbeat':
        // 心跳响应
        break
      case 'stock_update':
        // 库存更新
        this.emit('stock_update', { data: payload })
        break
      case 'points_update':
        // 积分更新
        this.emit('points_update', { data: payload })
        break
      case 'system_notice':
        // 系统通知
        this.emit('system_notice', { data: payload })
        break
      default:
        console.log('未处理的消息类型:', type)
    }
  }

  /**
   * 开始心跳
   */
  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.send({ type: 'heartbeat', timestamp: Date.now() })
      }
    }, this.heartbeatInterval)
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
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
   * 移除事件监听
   * @param {String} event 事件名
   * @param {Function} handler 处理函数
   */
  off(event, handler = null) {
    if (!this.eventHandlers.has(event)) return

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
    if (!this.eventHandlers.has(event)) return

    const handlers = this.eventHandlers.get(event)
    handlers.forEach(handler => {
      try {
        handler(data)
      } catch (error) {
        console.error('❌ 事件处理器执行失败:', error)
      }
    })
  }

  /**
   * 获取连接状态
   * @returns {Boolean} 是否已连接
   */
  isConnected() {
    return this.isConnected
  }
}

// 创建全局WebSocket管理器实例
const wsManager = new WSManager()

module.exports = {
  wsManager,
  WSManager
} 