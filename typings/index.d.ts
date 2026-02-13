/**
 * 🌐 全局类型声明
 *
 * 声明微信小程序全局类型、App实例类型、扩展声明等
 *
 * @file 天工餐厅积分系统 - 全局类型定义
 * @version 3.0.0
 * @since 2026-02-10
 */

/// <reference path="../node_modules/miniprogram-api-typings/index.d.ts" />
/// <reference path="./api.d.ts" />
/// <reference path="./store.d.ts" />

/** 微信小程序App实例扩展（globalData类型声明） - 与app.ts实际定义严格一致 */
interface IAppOption {
  globalData: {
    // ===== 系统基础信息 =====
    /** 系统版本号 */
    version: string
    /** 系统名称 */
    systemName: string
    /** 构建时间 */
    buildTime: string

    // ===== 用户认证状态（snake_case与后端一致） =====
    /** 是否已登录 */
    isLoggedIn: boolean
    /** 用户信息（后端返回的完整用户数据） */
    userInfo: App.UserInfo | null
    /** 访问令牌（snake_case，与后端一致） */
    access_token: string | null
    /** 刷新令牌（snake_case，与后端一致） */
    refresh_token: string | null
    /** 用户角色: 'guest' | 'user' | 'admin' */
    userRole: string

    // ===== 业务数据缓存（后续将完全迁移到MobX Store） =====
    /** 可用积分余额（后端字段: available_amount） */
    points_balance: number
    /** 冻结积分余额（后端字段: frozen_amount） */
    frozen_amount: number

    // ===== 系统状态 =====
    /** 网络状态 */
    network_status: string
    /** 当前页面路径 */
    current_page: string

    // ===== WebSocket配置 =====
    /** WebSocket地址 */
    ws_url: string | null
    /** WebSocket连接状态 */
    ws_connected: boolean
    /** WebSocket配置 */
    ws_config: any | null

    // ===== 开发阶段配置 =====
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

  /** 清空认证数据 */
  clearAuthData(): void
  /** 更新用户信息 */
  updateUserInfo(userInfo: App.UserInfo): void
  /** 更新积分余额 */
  updatePointsBalance(points: number): void
  /** 设置访问令牌 */
  setAccessToken(token: string): void
  /** 设置刷新令牌 */
  setRefreshToken(token: string): void
  /** 获取用户角色 */
  getUserRole(): string
  /** 从V4信息获取角色 */
  getUserRoleFromV4(userInfo: App.UserInfo): string
  /** 安全获取系统信息 */
  getSafeSystemInfo(): any
  /** 连接WebSocket */
  connectWebSocket(): Promise<void>
  /** 断开WebSocket */
  disconnectWebSocket(): void
  /** 发送WebSocket消息 */
  sendWebSocketMessage(message: any): Promise<void>
  /** 订阅WebSocket消息 */
  subscribeWebSocketMessages(pageId: string, callback: Function): void
  /** 取消订阅WebSocket消息 */
  unsubscribeWebSocketMessages(pageId: string): void
}

/** App命名空间 - 项目级类型 */
declare namespace App {
  /** 用户信息结构（后端返回的snake_case字段） */
  interface UserInfo {
    user_id: number
    mobile: string
    nickname: string
    status: string
    is_admin: boolean
    user_role: string
    role_level: number
    avatar_url?: string
    points?: number
  }

  /** 页面通用数据 */
  interface PageData {
    /** 页面加载状态 */
    loading: boolean
    /** 页面错误信息 */
    errorMessage: string
  }
}
