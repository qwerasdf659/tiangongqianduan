/**
 * 认证系统API
 * 后端路由: routes/v4/auth/
 *
 * @file 天工平台 - 认证API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { getDeviceId } = require('../device')

/**
 * 用户登录 - POST /api/v4/auth/login
 *
 * 请求体携带 platform: 'wechat_mp' 标识当前登录来源为微信小程序，
 * 后端据此实现多平台会话隔离（Web/微信/抖音各平台登录互不踢出）
 *
 * openid 可选：微信静默登录返回 need_bind 后，用户输入手机号+验证码时
 * 附带 openid 让后端将微信账号与手机号绑定
 */
async function userLogin(mobile: string, verification_code: string, openid?: string) {
  const data: Record<string, string> = { mobile, verification_code, platform: 'wechat_mp' }
  if (openid) {
    data.openid = openid
  }
  return apiClient.request('/auth/login', {
    method: 'POST',
    data,
    needAuth: false,
    showError: false,
    header: { 'X-Device-Id': getDeviceId() }
  })
}

/** 快速登录- POST /api/v4/auth/quick-login */
async function quickLogin(mobile: string, wx_openid?: string) {
  const data: Record<string, string> = { mobile }
  if (wx_openid) {
    data.wx_openid = wx_openid
  }
  return apiClient.request('/auth/quick-login', {
    method: 'POST',
    data,
    needAuth: false,
    header: { 'X-Device-Id': getDeviceId() }
  })
}

/**
 * 微信小程序登录 - POST /api/v4/auth/wx-code-login
 *
 * 两种模式：
 *   1. 仅 wx_code（静默登录）→ 后端换 openid，已绑定用户直接返回 Token，未绑定返回 need_bind
 *   2. wx_code + phone_code（一键登录）→ 后端同时换 openid 和手机号，自动绑定并返回 Token
 */
async function wxCodeLogin(code: string, phoneCode?: string) {
  if (!code) {
    throw new Error('微信登录凭证不能为空')
  }
  const data: Record<string, string> = { wx_code: code }
  if (phoneCode) {
    data.phone_code = phoneCode
  }
  return apiClient.request('/auth/wx-code-login', {
    method: 'POST',
    data,
    needAuth: false,
    showLoading: false,
    showError: false,
    header: { 'X-Device-Id': getDeviceId() }
  })
}

/**
 * 获取当前登录用户基本信息
 * GET /api/v4/auth/profile
 *
 * 后端路由: routes/v4/auth/profile.js router.get('/profile', ...)
 * 挂载入口: routes/v4/auth/index.js router.use('/', profileRoutes)
 *
 * 响应字段（基users + RBAC角色系统）：
 *   user_id: INT PK 用户ID
 *   mobile: STRING(20) 手机号（脱敏 136****7930 格式）
 *   nickname: STRING 昵称
 *   role_level: INT 角色等级（>= 100 为管理员）
 *   roles: Array 角色列表
 *   status: STRING 用户状态
 *   consecutive_fail_count: INT 连续低档次数（保底机制计数器）
 *   history_total_points: INT 历史累计积分（用于臻选空间解锁）
 *   created_at: ISO8601 创建时间（北京时间）
 *   last_login: ISO8601 最后登录时间（北京时间）
 *   login_count: INT 登录次数
 *
 * ⚠️ 后端不返回 user_level 字段，角色判断使用 role_level + roles
 */
async function getUserInfo() {
  return apiClient.request('/auth/profile', { method: 'GET', needAuth: true })
}

/**
 * 发送短信验证码 - POST /api/v4/auth/send-code
 *
 * 人机验证（腾讯云天御）契约：
 *   - 生产环境：后端强制校验，前端须先弹天御小程序插件 t-captcha 拿到 ticket，随发码请求提交 captcha_ticket。
 *   - 非生产环境：后端默认放行，可不传 captcha_ticket，方便联调短信链路。
 *   - ⚠️ 小程序插件回调只返回 ticket、不返回 randstr，故前端只传 captcha_ticket，不传 captcha_randstr
 *     （后端按是否带 randstr 自动分派小程序/Web 校验接口）。
 *   - 校验失败后端返回 CAPTCHA_FAILED(400)，前端需重置验证码后让用户重试。
 *
 * 非生产环境后端仍支持万能验证码 123456，无需实际下发短信。
 *
 * @param mobile         11 位中国大陆手机号（裸号，不带 +86）
 * @param captcha_ticket 天御验证码票据（生产必传；非生产可省略）
 */
async function sendVerificationCode(mobile: string, captcha_ticket?: string) {
  if (!mobile || !/^1[3-9]\d{9}$/.test(mobile)) {
    throw new Error('请输入正确的11位手机号')
  }
  const data: Record<string, string> = { mobile }
  if (captcha_ticket) {
    data.captcha_ticket = captcha_ticket
  }
  return apiClient.request('/auth/send-code', {
    method: 'POST',
    data,
    needAuth: false,
    showLoading: true,
    loadingText: '发送中...',
    showError: false
  })
}

/** 验证Token有效性 - GET /api/v4/auth/verify */
async function verifyToken() {
  return apiClient.request('/auth/verify', { method: 'GET', needAuth: true })
}

/**
 * 获取当前登录用户的权限清单 - GET /api/v4/permissions/me
 *
 * 后端路由: routes/v4/auth/permissions.js（调 UserRoleService.getUserPermissions）
 * 后端会合并该用户所有 active 角色的权限位统一下发，是按钮显隐的唯一权威数据源。
 *
 * 响应 data 字段（snake_case 原名，前端零映射直读）:
 *   role_level: INT 最高角色等级（>=100 管理员，>=20 商家店员）
 *   roles: Array<{ role_name: string; role_level: number }> 角色列表
 *   permissions: string[] 权限位数组，如 consumption:create / consumption:scan_user
 *
 * ⚠️ 权限 key 必须与后端完全一致（冒号、下划线、大小写），前端不得自造或映射。
 * 用于首页商家功能区三个按钮（扫码核销/消费录入/审核详情）的统一显隐判定。
 */
async function getMyPermissions() {
  return apiClient.request('/permissions/me', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 刷新 access_token - POST /api/v4/auth/refresh
 *
 * 携带旧 access_token（即使已过期）在 Authorization 头中，
 * 后端从旧 JWT 提取 session_token 来复用会话并继承 login_platform，
 * 避免创建新会话导致同平台会话被误覆盖（方案B平台隔离策略）
 *
 * @param refreshToken - 刷新令牌
 * @param oldAccessToken - 旧的 access_token（可选，用于会话复用和平台继承）
 */
async function refreshAccessToken(refreshToken: string, oldAccessToken?: string) {
  const refreshHeaders: Record<string, string> = {}
  if (oldAccessToken) {
    refreshHeaders.Authorization = `Bearer ${oldAccessToken}`
  }
  return apiClient.request('/auth/refresh', {
    method: 'POST',
    data: { refresh_token: refreshToken },
    needAuth: false,
    showLoading: false,
    showError: false,
    header: refreshHeaders
  })
}

/**
 * 退出登录 - POST /api/v4/auth/logout
 * 通知后端将当前会话标记为 is_active=false，释放认证会话资源
 * 前端在调用成功或失败后都应清理本地认证数据
 */
async function logout() {
  return apiClient.request('/auth/logout', {
    method: 'POST',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取当前用户成长等级（需登录）- GET /api/v4/user/growth-level
 *
 * 会员成长等级（9 档 v1~v9，铜卡~荣耀殿堂）由累计积分 history_total_points 实时派生。
 *
 * 响应 data 字段（snake_case 原名，前端不做映射层，对接文档《小程序成长等级页对接说明》2026-07-12）:
 *   current_level_key        当前等级 key（如 v9）
 *   current_level_name       当前等级中文名（如 荣耀殿堂）
 *   current_earn_multiplier  当前等级积分加成倍率（2026-07-12 新增，如 1.5，营销激励公开信息）
 *   history_total_points     累计积分（成长等级单一派生源）
 *   thresholds_confirmed     阈值是否已定稿（false=占位阶段）
 *   levels[]                 等级阶梯（升序）: { level_key, level_name, min_history_points, earn_multiplier }
 *   next_level               距下一级差值: { level_key, level_name, points_needed }，顶档 v9 为 null
 *                            → 渲染"再消费 X 元升{下一级名}"（1 元≈1 积分）
 *
 * ⚠️ 占位保护：thresholds_confirmed=false 时，后端将每个
 *    min_history_points 下发为 null，前端只显示等级名、不显示"需达 Y 积分"。
 * ⚠️ 数据边界：本接口只下发成长等级积分倍率这类营销信息；抽奖概率、分层权重等商业机密不下发。
 */
async function getUserGrowthLevel() {
  return apiClient.request('/user/growth-level', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  userLogin,
  quickLogin,
  wxCodeLogin,
  getUserInfo,
  getUserGrowthLevel,
  getMyPermissions,
  sendVerificationCode,
  verifyToken,
  refreshAccessToken,
  logout
}
