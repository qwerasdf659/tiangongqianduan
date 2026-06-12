/**
 * 🔐 认证助手模块 - V5.0统一认证系统
 *
 * 认证数据统一从MobX userStore 读取（废弃globalData业务字段）
 * 页面通过 createStoreBindings 自动同步，不再依赖 app.globalData
 *
 * 功能清单:
 * - checkAuth() - 检查用户登录状态
 * - checkAdmin() - 检查管理员权限
 * - getAccessToken() - 获取当前access_token
 * - getUserInfo() - 获取当前用户信息
 * - clearAuthData() - 清理认证数据
 * - restoreUserInfo() - 三级恢复用户信息
 *
 * @file 天工平台 - 认证助手
 * @version 5.2.0
 * @since 2026-02-15
 */

const { createLogger } = require('./logger')
/* 内部模块直接引用，不通过 utils/index.ts（避免循环依赖） */
const { determineUserRole, validateJWTTokenIntegrity, isTokenExpired } = require('./util')
const log = createLogger('auth-helper')

// ===== 类型定义 =====

/** checkAuth 配置选项 */
interface CheckAuthOptions {
  /** 未登录时是否自动弹出登录弹窗（默认true） */
  redirect?: boolean
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

/**
 * 用户信息结构 统一使用 API.UserProfile（typings/api.d.ts）
 * 禁止在此文件重复定义 UserInfo 接口
 */

// ===== 延迟获取 Store（避免循环依赖） =====

/** 延迟获取 userStore，避免模块加载阶段的循环依赖 */
function getUserStore() {
  return require('../store/user').userStore
}

/** 延迟获取 pointsStore */
function getPointsStore() {
  return require('../store/points').pointsStore
}

// ===== 核心功能函数 =====

/**
 * 🔐 检查用户登录状态
 * 数据来源: MobX userStore（唯一来源）
 *
 * @example
 * if (!checkAuth()) return;
 * if (!checkAuth({ redirect: false, showToast: true })) return;
 */
function checkAuth(options: CheckAuthOptions = {}): boolean {
  const { redirect = false, showToast = false } = options
  const store = getUserStore()

  // Store 校验登录状态（Store 是运行时唯一数据源）
  const storeToken: string = store.accessToken || ''
  const hasValidToken: boolean =
    !!storeToken &&
    typeof storeToken === 'string' &&
    storeToken.trim() !== '' &&
    storeToken !== 'undefined'

  const integrityCheck = hasValidToken ? validateJWTTokenIntegrity(storeToken) : { isValid: false }
  const tokenUsable = hasValidToken && integrityCheck.isValid && !isTokenExpired(storeToken)
  const isAuthenticated: boolean = tokenUsable && store.isLoggedIn

  log.info('认证状态检查', {
    storeHasToken: !!storeToken,
    storeIsLoggedIn: store.isLoggedIn,
    tokenUsable,
    isAuthenticated
  })

  if (!isAuthenticated) {
    log.warn('用户未登录或Token无效')

    if (showToast) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 2000 })
    }

    if (redirect) {
      // 弹出当前页面的登录弹窗（不再跳转到独立登录页）
      const pages = getCurrentPages()
      const currentPage: any = pages.length > 0 ? pages[pages.length - 1] : null
      if (currentPage && currentPage.onShowLoginPopup) {
        currentPage.onShowLoginPopup()
      }
    }

    return false
  }

  log.info('认证检查通过')
  return true
}

/**
 * 🔐 检查管理员权限
 * 统一标准: role_level >= 100（对齐后端 authenticateToken 中间件）
 *
 * @example
 * if (!checkAdmin()) return;
 */
function checkAdmin(options: CheckAdminOptions = {}): boolean {
  const { showToast = true, navigateBack = true } = options

  if (!checkAuth({ redirect: true, showToast: false })) {
    return false
  }

  const store = getUserStore()
  const userInfo: API.UserProfile | null = store.userInfo || null

  /* 统一使用 determineUserRole()（utils/util.ts），禁止重复编写判断逻辑 */
  const isAdmin: boolean = !!userInfo && determineUserRole(userInfo) === 'admin'

  log.info('管理员权限检查', {
    hasUserInfo: !!userInfo,
    role_level: userInfo?.role_level,
    isAdmin
  })

  if (!isAdmin) {
    log.warn('用户无管理员权限')

    if (showToast) {
      wx.showToast({ title: '无权限访问', icon: 'none', duration: 2000 })
    }

    if (navigateBack) {
      setTimeout(() => {
        wx.navigateBack({
          fail: () => {
            wx.switchTab({ url: '/pages/lottery/lottery' })
          }
        })
      }, 1500)
    }

    return false
  }

  log.info('管理员权限检查通过')
  return true
}

/**
 * 🔑 获取当前access_token（Store优先）
 *
 * @example
 * const token = getAccessToken();
 */
function getAccessToken(): string | null {
  const store = getUserStore()
  const token: string = store.accessToken || ''
  return token || null
}

/**
 * 👤 获取当前用户信息（从 userStore 读取，Store是唯一数据源）
 *
 * @example
 * const userInfo = getUserInfo();
 * if (userInfo) { log.info('用户ID:', userInfo.user_id); }
 */
function getUserInfo(): API.UserProfile | null {
  const store = getUserStore()
  return store.userInfo || null
}

/**
 * 🧹 清理认证数据（委托给 MobX Store）
 * 退出登录时调用，Store 内部自动清理 Storage
 */
function clearAuthData(): void {
  log.info('清理认证数据')
  const uStore = getUserStore()
  const pStore = getPointsStore()
  uStore.clearLoginState()
  pStore.clearPoints()
  log.info('认证数据清理完成')
}

/**
 * 🔄 恢复用户信息
 * userStore → Storage → JWT Token 三级恢复用户信息
 * 恢复失败时自动跳转登录页
 *
 * @returns 恢复成功返回 userInfo 对象，失败返回 null
 */
function restoreUserInfo(): any {
  const store = getUserStore()
  let userInfo = store.userInfo

  // 第一级：userStore 读取
  if (userInfo && userInfo.user_id) {
    return userInfo
  }

  // 第二级：Storage 降级恢复到 Store（仅 Store 数据丢失时触发）
  const cachedUserInfo = wx.getStorageSync('user_info')
  if (cachedUserInfo && cachedUserInfo.user_id) {
    store.updateUserInfo(cachedUserInfo)
    return cachedUserInfo
  }

  // 第三级：仅凭 Token 身份 → 调后端 /auth/profile 权威获取资料
  // （B1：Token 已不含 mobile/role_level 等资料，禁止从 Token 解码重建 userInfo）
  const token = store.accessToken || wx.getStorageSync('access_token')
  if (!token) {
    _redirectToLogin('未登录，请先登录')
    return null
  }

  // 校验 Token 仍可用（完整性 + 未过期），不可用则跳登录
  const integrityCheck = validateJWTTokenIntegrity(token)
  if (!integrityCheck.isValid || isTokenExpired(token)) {
    _redirectToLogin('登录信息异常，请重新登录')
    return null
  }

  /**
   * 此处为同步函数（页面 onLoad 同步调用），无法等待异步 /auth/profile。
   * 触发一次后台权威拉取，拉到后写回 Store；本次先返回 null，
   * 由页面的认证流程或下次进入时读取到已恢复的 userInfo。
   * app.ts checkAuthStatus 启动时已调用 /auth/profile 兜底，正常不会走到这里。
   * 内部模块直接 require 子模块，不通过 utils/index.ts（避免循环依赖）。
   */
  const { getUserInfo: fetchProfile } = require('./api/auth')
  fetchProfile()
    .then((profileResult: any) => {
      if (profileResult && profileResult.success && profileResult.data) {
        const apiUserInfo = profileResult.data.user || profileResult.data
        store.updateUserInfo(apiUserInfo)
      }
    })
    .catch((profileError: any) => {
      log.warn('restoreUserInfo: /auth/profile 拉取失败:', profileError?.message)
    })

  _redirectToLogin('正在恢复登录信息，请稍候重试')
  return null
}

/**
 * 🔍 Token有效性详细检查
 * 返回丰富的状态信息（isValid / error / needsRelogin 等），供页面做细粒度处理
 *
 * 检查项:
 * 1. 应用是否已初始化
 * 2. 用户是否已登录（MobX Store + Storage 双重校验）
 * 3. Token字符串格式是否正确
 * 4. JWT 解码是否成功
 * 5. Token是否已过期
 *
 * @example
 * const status = checkTokenValidity()
 * if (!status.isValid) {
 *   if (status.needsRelogin) { // 弹出登录弹窗 }
 * }
 */
function checkTokenValidity(): {
  isValid: boolean
  error?: string
  message: string
  needsRelogin?: boolean
  isNormalUnauth?: boolean
  info?: Record<string, any>
} {
  let appInstance: any = null
  try {
    if (typeof getApp === 'function') {
      appInstance = getApp()
    }
  } catch (_error) {
    appInstance = null
  }

  if (!appInstance) {
    log.warn('应用尚未完成初始化')
    return {
      isValid: false,
      error: 'APP_NOT_INITIALIZED',
      message: '应用尚未完成初始化',
      needsRelogin: false,
      isNormalUnauth: false
    }
  }

  const store = getUserStore()

  // 检查登录状态
  const isLoggedIn: boolean = store.isLoggedIn
  const accessToken: string | null = store.accessToken

  if (!isLoggedIn || !accessToken) {
    log.info('用户未登录')
    return {
      isValid: false,
      error: 'NOT_LOGGED_IN',
      message: '用户未登录',
      needsRelogin: false,
      isNormalUnauth: true
    }
  }

  // Token格式校验
  if (typeof accessToken !== 'string' || accessToken.trim() === '' || accessToken === 'undefined') {
    log.error('Token格式异常')
    return {
      isValid: false,
      error: 'TOKEN_INVALID_FORMAT',
      message: 'Token格式无效',
      needsRelogin: true,
      isNormalUnauth: false
    }
  }

  // JWT 解码和过期检查
  const { decodeJWTPayload } = require('./util')

  try {
    const payload = decodeJWTPayload(accessToken)

    if (!payload) {
      log.error('Token解码失败')
      return {
        isValid: false,
        error: 'TOKEN_INVALID',
        message: 'Token无效',
        needsRelogin: true,
        isNormalUnauth: false
      }
    }

    if (isTokenExpired(accessToken)) {
      log.error('Token已过期')
      return {
        isValid: false,
        error: 'TOKEN_EXPIRED',
        message: 'Token已过期',
        needsRelogin: true,
        isNormalUnauth: false
      }
    }

    log.info('Token验证通过')
    return {
      isValid: true,
      message: 'Token有效',
      info: {
        userId: payload.user_id,
        expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
      },
      isNormalUnauth: false
    }
  } catch (error) {
    log.error('Token验证异常:', error)
    return {
      isValid: false,
      error: 'TOKEN_CHECK_ERROR',
      message: 'Token验证异常',
      needsRelogin: true,
      isNormalUnauth: false
    }
  }
}

/** 弹出登录弹窗（内部方法） */
function _redirectToLogin(message: string) {
  wx.showToast({ title: message, icon: 'none', duration: 2000 })
  setTimeout(() => {
    const pages = getCurrentPages()
    const currentPage: any = pages[pages.length - 1]
    if (currentPage && currentPage.onShowLoginPopup) {
      currentPage.onShowLoginPopup()
    }
  }, 500)
}

// ===== 导出模块 =====
module.exports = {
  checkAuth,
  checkAdmin,
  getAccessToken,
  getUserInfo,
  clearAuthData,
  restoreUserInfo,
  checkTokenValidity
}
