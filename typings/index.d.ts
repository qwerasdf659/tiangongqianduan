/**
 * 🌐 全局类型声明
 *
 * 声明微信小程序全局类型、App实例类型、扩展声明等
 * 业务数据（用户认证积分）统一从MobX Store 管理，globalData 仅保留系统配置 *
 * @file 天工餐厅积分系统 - 全局类型定义
 * @version 5.2.0
 * @since 2026-02-15
 */

/// <reference path="../node_modules/miniprogram-api-typings/index.d.ts" />
/// <reference path="./api.d.ts" />
/// <reference path="./store.d.ts" />

/** 微信小程序App实例扩展（globalData类型声明）- 与app.ts实际定义严格一致 */
interface IAppOption {
  globalData: {
    // ===== 系统基础信息 =====
    /** 系统版本 */
    version: string
    /** 系统名称 */
    systemName: string
    /** 构建时间 */
    buildTime: string

    // ===== 系统状态=====
    /** 网络状态*/
    network_status: string
    /** 当前页面路径 */
    current_page: string

    // ===== WebSocket配置 =====
    /** WebSocket地址 */
    ws_url: string | null
    /** WebSocket连接状态*/
    ws_connected: boolean
    /** WebSocket配置 */
    ws_config: any | null

    // ===== 内容投放频率控制 =====
    /** 当前会话已展示过的 ad_campaign_id 集合（用于 once_per_session 频率规则判断） */
    sessionSeenCampaigns: Set<number>

    // ===== 开发阶段配置=====
    /** 是否开发模式 */
    is_development: boolean

    // ===== 多业务线存储配置 =====
    /** 存储配置 */
    storage_config: {
      /** 最大图片文件大小（字节） */
      max_image_size: number
      /** 允许的图片类型 */
      allowed_image_types: string[]
      /** 业务线类型 */
      business_types: string[]
    }
  }

  /** 清空认证数据（委托给 MobX Store） */
  clearAuthData(): void
  /** 设置访问令牌（委托给 userStore，api.ts Token刷新时调用） */
  setAccessToken(token: string): void
  /** 设置刷新令牌（委托给 userStore，api.ts Token刷新时调用） */
  setRefreshToken(token: string): void
  /** 安全获取系统信息 */
  getSafeSystemInfo(): any
  /** 连接 Socket.IO（weapp.socket.io，心跳重连/事件路由?Socket.IO 内建管理）*/
  connectWebSocket(): Promise<void>
  /** 断开 Socket.IO 连接 */
  disconnectWebSocket(): void
  /**
   * 发送 Socket.IO 事件消息
   * @param eventName - 事件名称（如 'send_message'、'admin_register'）
   * @param data - 消息数据对象（Socket.IO 自动序列化，无需手动 JSON.stringify）
   */
  emitSocketMessage(eventName: string, data: any): boolean
  /** 订阅 Socket.IO 消息（页面级） */
  subscribeWebSocketMessages(pageId: string, callback: Function): void
  /** 取消订阅 Socket.IO 消息（页面卸载时调用） */
  unsubscribeWebSocketMessages(pageId: string): void
}

/** App命名空间 - 项目级类型 */
declare namespace App {
  /**
   * 用户信息结构 统一引用 API.UserProfile
   * 权威定义typings/api.d.ts API.UserProfile
   * 所有文件统一使用此类型，禁止重复定义
   */
  type UserInfo = API.UserProfile

  /** 页面通用数据 */
  interface PageData {
    /** 页面加载状态*/
    loading: boolean
    /** 页面错误信息 */
    errorMessage: string
  }
}
