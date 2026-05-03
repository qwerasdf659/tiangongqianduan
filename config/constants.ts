/**
 * 项目核心常量配置 - V4.0 TypeScript版
 * 只提取真正需要复用和语义不明确的常量
 * ⚠️ 业务数据必须从后端API获取，此处只包含UI常量
 *
 * @file 天工餐厅积分系统 - 核心常量定义
 * @version 5.2.0
 * @since 2026-02-10
 */

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
 * ⚠️ 只包含UI相关常量，业务数据（费用、次数等）从后端 getLotteryConfig 获取
 */
const LOTTERY = {
  GRID_SIZE: 9, // 3×3网格布局总数
  ANIMATION_DURATION: 3000, // 抽奖动画持续时间（毫秒）
  HIGHLIGHT_INTERVAL: 100, // 高亮切换间隔（毫秒）
  ANIMATION_SPEED: 120, // 轮盘初始速度（毫秒/格）
  SLOWDOWN_SPEED: 200, // 轮盘减速阶段速度（毫秒/格）
  STOP_DELAY: 800, // 动画停止后保持高亮延迟（毫秒）
  IMAGE_PRELOAD_TIMEOUT: 5000 // 横幅图片预加载超时（毫秒）
} as const

/** 导出所有常量 */
module.exports = {
  DELAY,
  API_CONFIG,
  PAGINATION,
  LOTTERY
}
