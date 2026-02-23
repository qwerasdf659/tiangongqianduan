/**
 * 🔐 用户状态管理 - MobX Store
 *
 * 管理内容: 登录状态、认证信息、用户角色、userInfo
 * 数据来源: 后端 POST /api/v4/auth/login、GET /api/v4/auth/profile
 *
 * 用户信息类型统一使用 API.UserProfile（typings/api.d.ts）
 * 角色判断统一使用 determineUserRole()（utils/util.ts）
 *
 * @file 天工餐厅积分系统 - 用户Store
 * @version 5.2.0
 * @since 2026-02-10
 */

import { action, observable } from 'mobx-miniprogram'

/* 内部模块直接引用，不通过 utils/index.ts（避免循环依赖） */
const { determineUserRole, formatPhoneNumber } = require('../utils/util')

export const userStore = observable({
  // ===== 可观察状态 =====

  /** 是否已登录 */
  isLoggedIn: false as boolean,

  /** 用户信息（后端返回的完整用户数据，类型见 API.UserProfile） */
  userInfo: null as API.UserProfile | null,

  /** 当前访问令牌 */
  accessToken: '' as string,

  /** 刷新令牌 */
  refreshToken: '' as string,

  /** 用户角色: 'guest' | 'user' | 'admin' */
  userRole: 'guest' as string,

  // ===== 计算属性 =====

  /** 是否为管理员（统一调用 determineUserRole 判断） */
  get isAdmin(): boolean {
    if (!this.userInfo) {
      return false
    }
    return determineUserRole(this.userInfo) === 'admin'
  },

  /** 用户ID */
  get userId(): number {
    return this.userInfo?.user_id || 0
  },

  /** 用户昵称 */
  get nickname(): string {
    return this.userInfo?.nickname || '用户'
  },

  /** 脱敏手机号（统一调用 utils/util.ts formatPhoneNumber，消除重复逻辑） */
  get maskedMobile(): string {
    return formatPhoneNumber(this.userInfo?.mobile || '')
  },

  // ===== 操作方法 =====

  /** 设置登录状态（登录成功后调用） */
  setLoginState: action(function (
    this: any,
    userInfo: API.UserProfile,
    accessToken: string,
    refreshToken: string
  ) {
    this.isLoggedIn = true
    this.userInfo = userInfo
    this.accessToken = accessToken
    this.refreshToken = refreshToken

    // 统一角色判断（唯一逻辑入口）
    this.userRole = determineUserRole(userInfo)

    // 同步到本地存储
    wx.setStorageSync('access_token', accessToken)
    wx.setStorageSync('refresh_token', refreshToken)
    wx.setStorageSync('user_info', userInfo)
  }),

  /** 更新用户信息（刷新用户资料后调用） */
  updateUserInfo: action(function (this: any, userInfo: API.UserProfile) {
    this.userInfo = userInfo
    wx.setStorageSync('user_info', userInfo)
  }),

  /** 更新访问令牌（Token刷新后调用） */
  updateAccessToken: action(function (this: any, token: string) {
    this.accessToken = token
    wx.setStorageSync('access_token', token)
  }),

  /** 更新刷新令牌（Token刷新后调用） */
  updateRefreshToken: action(function (this: any, token: string) {
    this.refreshToken = token
    wx.setStorageSync('refresh_token', token)
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

      // 统一角色判断（唯一逻辑入口）
      this.userRole = determineUserRole(userInfo)
    }
  }),

  /**
   * 确保 userInfo 可用（Store → Storage 两级恢复，不跳转登录页）
   *
   * 消除 user.ts、exchange.ts 等页面中重复的手动恢复逻辑：
   *   let userInfo = userStore.userInfo
   *   if (!userInfo || !userInfo.user_id) {
   *     userInfo = wx.getStorageSync('user_info')
   *     if (userInfo && userInfo.user_id) userStore.updateUserInfo(userInfo)
   *   }
   *
   * @returns 当前 userInfo，可能为 null（表示用户确实未登录）
   */
  ensureUserInfo: action(function (this: any): API.UserProfile | null {
    if (this.userInfo && this.userInfo.user_id) {
      return this.userInfo
    }

    const cached = wx.getStorageSync('user_info')
    if (cached && cached.user_id) {
      this.userInfo = cached
      this.userRole = determineUserRole(cached)
      return cached
    }

    return null
  })
})
