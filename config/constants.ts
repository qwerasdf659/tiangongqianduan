/**
 * 项目核心常量配置 - V4.0 TypeScript版
 * 只提取真正需要复用和语义不明确的常量
 * ⚠️ 业务数据必须从后端API获取，此处只包含UI常量
 *
 * @file 天工餐厅积分系统 - 核心常量定义
 * @version 5.2.0
 * @since 2026-02-10
 */

/** ⏱️ 时间相关常量（毫秒） - 用于时间计算和延迟操作 */
const TIME = {
  SECOND: 1000, // 1秒
  MINUTE: 60000, // 1分钟
  HOUR: 3600000, // 1小时
  DAY: 86400000 // 1天
} as const

/** ⏳ 延迟时间常量（毫秒） - 用于UI交互和用户体验优化 */
const DELAY = {
  TOAST_SHORT: 1500, // 短提示显示时间
  TOAST_LONG: 2000, // 长提示显示时间
  LOADING: 2000, // 加载提示延迟
  DEBOUNCE: 500, // 防抖延迟（搜索、输入）
  THROTTLE: 300, // 节流延迟（滚动、点击）
  RETRY: 3000, // 重试延迟
  ANIMATION: 800 // 动画持续时间
} as const

/** 🌐 API请求相关常量 - 用于网络请求配置和超时设置 */
const API_CONFIG = {
  TIMEOUT: 30000, // API请求超时时间（30秒）
  RETRY_TIMES: 3, // 最大重试次数
  RETRY_DELAY: 2000, // 重试间隔
  HEALTH_CHECK_TIMEOUT: 8000 // 健康检查超时
} as const

/** 📄 分页相关常量 - 用于列表数据分页显示 */
const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20, // 默认每页显示数量
  WATERFALL_SIZE: 20, // 瀑布流每页数量
  GRID_SIZE: 4, // 网格布局每页数量（2×2）
  MAX_PAGE_SIZE: 50 // 最大每页数量
} as const

/**
 * 🎰 抽奖系统UI常量
 * ⚠️ 只包含UI相关常量，业务数据必须从后端API获取
 * ❌ 已移除: DEFAULT_COST、FREE_COUNT、MAX_MULTI_DRAW → 从后端getLotteryConfig获取
 */
const LOTTERY = {
  GRID_SIZE: 9, // 3×3网格布局总数
  ANIMATION_DURATION: 3000, // 抽奖动画持续时间（毫秒）
  HIGHLIGHT_INTERVAL: 100, // 高亮切换间隔（毫秒）
  ANIMATION_SPEED: 120, // 轮盘初始速度（毫秒/格）
  SLOWDOWN_SPEED: 200, // 轮盘减速阶段速度（毫秒/格）
  STOP_DELAY: 800, // 动画停止后保持高亮延迟（毫秒）
  IMAGE_PRELOAD_TIMEOUT: 5000 // 横幅图片预加载超时（毫秒）
  // ❌ 已移除: QR_COUNTDOWN_SECONDS → 从后端getUserQRCode返回的expires_at字段计算
} as const

/** 📏 UI尺寸常量（rpx单位） - 用于微信小程序界面布局 */
const UI_SIZE = {
  ICON_SMALL: 40, // 小图标尺寸
  ICON_MEDIUM: 48, // 中等图标尺寸
  ICON_LARGE: 70, // 大图标尺寸
  AVATAR_SIZE: 120, // 头像尺寸
  SPACING_SMALL: 8, // 小间距
  SPACING_MEDIUM: 12, // 中等间距
  SPACING_LARGE: 15, // 大间距
  SPACING_XLARGE: 20, // 超大间距
  BORDER_RADIUS: 8 // 标准圆角
} as const

/**
 * 📝 表单验证常量
 * ⚠️ 只包含技术标准，业务规则必须从后端API获取
 * ❌ 已移除: VERIFICATION_CODE_LENGTH、MIN/MAX_NICKNAME_LENGTH → 从后端getSystemConfig获取
 */
const VALIDATION = {
  PHONE_LENGTH: 11 // 中国手机号固定11位（国家标准 GB/T 15120-1994）
} as const

/** 🎨 UI状态常量 - 用于界面状态切换 */
const UI_STATE = {
  LOADING: 'loading' as const, // 加载中
  SUCCESS: 'success' as const, // 成功
  ERROR: 'error' as const, // 错误
  EMPTY: 'empty' as const // 空状态
} as const

/**
 * 🔢 UI显示范围常量
 * ⚠️ 只包含UI显示规则，业务限制必须从后端API获取
 * ❌ 已移除: MIN_POINTS/MAX_POINTS → 从后端getSystemConfig获取
 */
const RANGE = {
  MIN_UNREAD_COUNT: 0, // UI显示：最小未读数
  MAX_UNREAD_COUNT: 99 // UI显示：超过99显示"99+"（类似微信）
} as const

/** 导出所有常量 */
module.exports = {
  TIME,
  DELAY,
  API_CONFIG,
  PAGINATION,
  LOTTERY,
  UI_SIZE,
  VALIDATION,
  UI_STATE,
  RANGE
}
