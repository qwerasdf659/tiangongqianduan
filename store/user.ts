/**
 * 🔐 用户状态管理 - MobX Store
 *
 * 管理内容: 登录状态、认证信息、用户角色、userInfo
 * 数据来源: 后端 POST /api/v4/auth/login、GET /api/v4/auth/profile
 *
 * @file 天工餐厅积分系统 - 用户Store
 * @version 3.0.0
 * @since 2026-02-10
 */

import { observable, action } from 'mobx-miniprogram'

/** 用户信息结构（后端返回的snake_case字段） */
interface UserInfo {
  user_id: number
  user_uuid: string
  mobile: string
  nickname: string
  status: string
  is_admin: boolean
  user_role: string
  role_level: number
  avatar_url?: string
  created_at: string
}

export const userStore = observable({
  // ===== 可观察状态 =====

  /** 是否已登录 */
  isLoggedIn: false as boolean,

  /** 用户信息（后端返回的完整用户数据） */
  userInfo: null as UserInfo | null,

  /** 当前访问令牌 */
  accessToken: '' as string,

  /** 刷新令牌 */
  refreshToken: '' as string,

  /** 用户角色: 'guest' | 'user' | 'admin' */
  userRole: 'guest' as string,

  // ===== 计算属性 =====

  /** 是否为管理员 */
  get isAdmin(): boolean {
    if (!this.userInfo) {
      return false
    }
    return (
      this.userInfo.is_admin === true ||
      this.userInfo.user_role === 'admin' ||
      (this.userInfo.role_level && this.userInfo.role_level >= 100)
    )
  },

  /** 用户ID */
  get userId(): number {
    return this.userInfo?.user_id || 0
  },

  /** 用户昵称 */
  get nickname(): string {
    return this.userInfo?.nickname || '用户'
  },

  /** 脱敏手机号 */
  get maskedMobile(): string {
    const mobile = this.userInfo?.mobile || ''
    if (mobile.length === 11) {
      return mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    }
    return mobile
  },

  // ===== 操作方法 =====

  /** 设置登录状态（登录成功后调用） */
  setLoginState: action(function (
    this: any,
    userInfo: UserInfo,
    accessToken: string,
    refreshToken: string
  ) {
    this.isLoggedIn = true
    this.userInfo = userInfo
    this.accessToken = accessToken
    this.refreshToken = refreshToken

    // 根据用户信息判断角色
    if (userInfo.is_admin || userInfo.user_role === 'admin' || userInfo.role_level >= 100) {
      this.userRole = 'admin'
    } else {
      this.userRole = 'user'
    }

    // 同步到本地存储
    wx.setStorageSync('access_token', accessToken)
    wx.setStorageSync('refresh_token', refreshToken)
    wx.setStorageSync('user_info', userInfo)
  }),

  /** 更新用户信息（刷新用户资料后调用） */
  updateUserInfo: action(function (this: any, userInfo: UserInfo) {
    this.userInfo = userInfo
    wx.setStorageSync('user_info', userInfo)
  }),

  /** 更新访问令牌（Token刷新后调用） */
  updateAccessToken: action(function (this: any, token: string) {
    this.accessToken = token
    wx.setStorageSync('access_token', token)
  }),

  /** 清除登录状态（退出登录时调用） */
  clearLoginState: action(function (this: any) {
    this.isLoggedIn = false
    this.userInfo = null
    this.accessToken = ''
    this.refreshToken = ''
    this.userRole = 'guest'

    wx.removeStorageSync('access_token')
    wx.removeStorageSync('refresh_token')
    wx.removeStorageSync('user_info')
  }),

  /** 从本地存储恢复登录状态（应用启动时调用） */
  restoreLoginState: action(function (this: any) {
    const token = wx.getStorageSync('access_token')
    const refreshToken = wx.getStorageSync('refresh_token')
    const userInfo = wx.getStorageSync('user_info')

    if (token && userInfo) {
      this.isLoggedIn = true
      this.accessToken = token
      this.refreshToken = refreshToken || ''
      this.userInfo = userInfo

      if (userInfo.is_admin || userInfo.user_role === 'admin' || userInfo.role_level >= 100) {
        this.userRole = 'admin'
      } else {
        this.userRole = 'user'
      }
    }
  })
})






