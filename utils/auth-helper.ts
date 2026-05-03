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
 * @file 天工餐厅积分系统 - 认证助手
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
  /** 未登录时是否自动跳转到登录页（默认true） */
  redirect?: boolean
  /** 自定义跳转URL（默认'/packageUser/auth/auth'） */
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
  const { redirect = true, redirectUrl = '/packageUser/auth/auth', showToast = false } = options
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
      log.info('跳转到登录页:', redirectUrl)
      wx.redirectTo({
        url: redirectUrl,
        fail: () => {
          wx.reLaunch({ url: redirectUrl })
        }
      })
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

  // 第三级：JWT Token 解码恢复
  const token = store.accessToken || wx.getStorageSync('access_token')
  if (!token) {
    _redirectToLogin('未登录，请先登录')
    return null
  }

  try {
    const utilFunctions = require('./util')
    const jwtPayload = utilFunctions.decodeJWTPayload(token)

    if (jwtPayload && jwtPayload.user_id) {
      userInfo = {
        user_id: jwtPayload.user_id,
        mobile: jwtPayload.mobile,
        nickname: jwtPayload.nickname || '用户',
        status: jwtPayload.status || 'active',
        user_role: jwtPayload.user_role || 'user',
        role_level: jwtPayload.role_level || 0,
        created_at: jwtPayload.created_at || ''
      }
      wx.setStorageSync('user_info', userInfo)
      store.updateUserInfo(userInfo)
      return userInfo
    }

    _redirectToLogin('登录信息异常，请重新登录')
    return null
  } catch (error) {
    log.error('从JWT Token恢复userInfo失败:', error)
    _redirectToLogin('登录信息异常，请重新登录')
    return null
  }
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
 *   if (status.needsRelogin) wx.redirectTo({ url: '/packageUser/auth/auth' })
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
        mobile: payload.mobile,
        roleLevel: payload.role_level || 0,
        roles: payload.roles || ['user'],
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

/** 跳转登录页（内部方法） */
function _redirectToLogin(message: string) {
  wx.showToast({ title: message, icon: 'none', duration: 2000 })
  setTimeout(() => {
    wx.redirectTo({ url: '/packageUser/auth/auth' })
  }, 2000)
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
