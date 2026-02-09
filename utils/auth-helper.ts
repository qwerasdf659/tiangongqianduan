/**
 * 🔐 认证助手模块 - V4.0统一认证系统
 *
 * 提取认证检查逻辑，消除页面重复代码
 * 统一从 utils/index.ts 导出给外部使用
 *
 * 功能清单:
 * - checkAuth() - 检查用户登录状态
 * - checkAdmin() - 检查管理员权限
 * - getAccessToken() - 获取当前access_token
 * - getUserInfo() - 获取当前用户信息
 * - clearAuthData() - 清理认证数据
 *
 * @file 天工餐厅积分系统 - 认证助手
 * @version 3.0.0
 * @since 2026-02-10
 */

// ===== 类型定义 =====

/** checkAuth 配置选项 */
interface CheckAuthOptions {
  /** 未登录时是否自动跳转到登录页（默认true） */
  redirect?: boolean
  /** 自定义跳转URL（默认'/pages/auth/auth'） */
  redirectUrl?: string
  /** 未登录时是否显示提示（默认false） */
  showToast?: boolean
}

/** checkAdmin 配置选项 */
interface CheckAdminOptions {
  /** 无权限时是否显示提示（默认true） */
  showToast?: boolean
  /** 无权限时是否返回上一页（默认true） */
  navigateBack?: boolean
}

/** clearAuthData 配置选项 */
interface ClearAuthDataOptions {
  /** 是否清理本地存储（默认true） */
  clearStorage?: boolean
  /** 是否清理全局状态（默认true） */
  clearGlobal?: boolean
}

/** 用户信息结构（后端返回的snake_case字段） */
interface AuthUserInfo {
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

// ===== 延迟获取App实例 =====

/** 缓存的App实例 */
let appInstance: WechatMiniprogram.App.Instance<Record<string, any>> | null = null

/** 延迟获取App实例，避免模块加载时调用getApp() */
function getAppInstance(): WechatMiniprogram.App.Instance<Record<string, any>> | null {
  if (!appInstance && typeof getApp !== 'undefined') {
    try {
      appInstance = getApp()
    } catch (error) {
      console.warn('⚠️ 无法获取App实例:', error)
    }
  }
  return appInstance
}

// ===== 核心功能函数 =====

/**
 * 🔐 检查用户登录状态
 * 后端路由: GET /api/v4/auth/verify-token（验证Token有效性）
 *
 * @example
 * if (!checkAuth()) return;
 * if (!checkAuth({ redirect: false, showToast: true })) return;
 */
function checkAuth(options: CheckAuthOptions = {}): boolean {
  const { redirect = true, redirectUrl = '/pages/auth/auth', showToast = false } = options

  // V4.0规范: 从storage和全局状态检查access_token
  const token: string = wx.getStorageSync('access_token')
  const app = getAppInstance()
  const globalToken: string | null = app?.globalData?.access_token ?? null
  const isLoggedIn: boolean = app?.globalData?.isLoggedIn ?? false

  // 详细的登录状态检查
  const hasValidToken: boolean =
    !!token && typeof token === 'string' && token.trim() !== '' && token !== 'undefined'

  const isAuthenticated: boolean = hasValidToken && isLoggedIn && !!globalToken

  console.log('🔍 认证状态检查:', {
    hasToken: !!token,
    hasGlobalToken: !!globalToken,
    isLoggedIn,
    isAuthenticated
  })

  // 未登录处理
  if (!isAuthenticated) {
    console.warn('⚠️ 用户未登录或Token无效')

    if (showToast) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 2000
      })
    }

    if (redirect) {
      console.log('🔄 跳转到登录页:', redirectUrl)
      // 使用redirectTo清空页面栈，确保用户必须重新登录
      wx.redirectTo({
        url: redirectUrl,
        fail: (error: WechatMiniprogram.GeneralCallbackResult) => {
          console.error('❌ 跳转登录页失败:', error)
          // 备用方案: 使用reLaunch
          wx.reLaunch({ url: redirectUrl })
        }
      })
    }

    return false
  }

  console.log('✅ 认证检查通过')
  return true
}

/**
 * 🔐 检查管理员权限
 * V4.0标准: is_admin === true 或 role_level >= 100
 *
 * @example
 * if (!checkAdmin()) return;
 * if (!checkAdmin({ showToast: true, navigateBack: false })) return;
 */
function checkAdmin(options: CheckAdminOptions = {}): boolean {
  const { showToast = true, navigateBack = true } = options

  // 先检查登录状态
  if (!checkAuth({ redirect: true, showToast: false })) {
    return false
  }

  // V4.0规范: 从JWT Token和用户信息检查管理员标识
  const app = getAppInstance()
  const userInfo: AuthUserInfo | null =
    app?.globalData?.userInfo || wx.getStorageSync('user_info') || null

  // 检查管理员标识 - V4.0标准: is_admin 或 role_level >= 100
  const isAdmin: boolean = !!(
    userInfo?.is_admin === true ||
    (userInfo?.role_level && userInfo.role_level >= 100)
  )

  console.log('🔍 管理员权限检查:', {
    hasUserInfo: !!userInfo,
    is_admin: userInfo?.is_admin,
    role_level: userInfo?.role_level,
    isAdmin
  })

  // 无权限处理
  if (!isAdmin) {
    console.warn('⚠️ 用户无管理员权限')

    if (showToast) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        duration: 2000
      })
    }

    if (navigateBack) {
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            // 如果无法返回，跳转到首页
            wx.switchTab({ url: '/pages/lottery/lottery' })
          }
        })
      }, 1500)
    }

    return false
  }

  console.log('✅ 管理员权限检查通过')
  return true
}

/**
 * 🔑 获取当前access_token
 *
 * @example
 * const token = getAccessToken();
 * if (token) { console.log('Token:', token); }
 */
function getAccessToken(): string | null {
  const token: string = wx.getStorageSync('access_token')
  return token || null
}

/**
 * 👤 获取当前用户信息
 *
 * @example
 * const userInfo = getUserInfo();
 * if (userInfo) { console.log('用户ID:', userInfo.user_id); }
 */
function getUserInfo(): AuthUserInfo | null {
  const app = getAppInstance()
  const userInfo: AuthUserInfo | null =
    app?.globalData?.userInfo || wx.getStorageSync('user_info') || null
  return userInfo
}

/**
 * 🧹 清理认证数据
 * 退出登录时调用，清理Storage和全局状态
 *
 * @example
 * clearAuthData(); // 清理所有认证数据
 * clearAuthData({ clearStorage: false }); // 只清理全局状态
 */
function clearAuthData(options: ClearAuthDataOptions = {}): void {
  const { clearStorage = true, clearGlobal = true } = options

  console.log('🧹 清理认证数据:', options)

  // 清理本地存储
  if (clearStorage) {
    try {
      wx.removeStorageSync('access_token')
      wx.removeStorageSync('refresh_token')
      wx.removeStorageSync('user_info')
      console.log('✅ 本地存储已清理')
    } catch (error) {
      console.error('❌ 清理本地存储失败:', error)
    }
  }

  // 清理全局状态
  if (clearGlobal) {
    try {
      const app = getAppInstance()
      if (app && app.globalData) {
        app.globalData.access_token = null
        app.globalData.refresh_token = null
        app.globalData.userInfo = null
        app.globalData.isLoggedIn = false
        app.globalData.points_balance = 0
        app.globalData.frozen_amount = 0
        console.log('✅ 全局状态已清理')
      }
    } catch (error) {
      console.error('❌ 清理全局状态失败:', error)
    }
  }

  console.log('✅ 认证数据清理完成')
}

// Token自动刷新已由 api.ts 的 APIClient.handleTokenExpired() 统一处理
// 认证助手只负责认证状态检查，不处理Token刷新

// ===== 导出模块 =====
module.exports = {
  checkAuth,
  checkAdmin,
  getAccessToken,
  getUserInfo,
  clearAuthData
}
