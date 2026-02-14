/**
 * Utils统一导出模块 v4.2 - 对齐后端V4.7.0真实路由
 *
 * 集中管理所有工具函数，防止导入混乱
 * 统一使用分类导出：Utils / Validation / API / Wechat / ErrorHandler / Constants
 *
 * 命名规范:
 *   业务逻辑层: 100% camelCase（变量名、函数名）
 *   API交互层: 100% snake_case（请求参数、响应字段）
 *   工具类/类名: PascalCase（APIClient等）
 *
 * @file 天工餐厅积分系统 - 工具函数统一入口
 * @version 3.0.0
 * @since 2026-02-10
 */

// ===== 内部模块导入（index.ts内部直接引用，不通过自身循环引用） =====
const utilFunctions = require('./util')
const validateFunctions = require('./validate')
const apiFunctions = require('./api')
const wechatFunctions = require('./wechat')
const authHelperFunctions = require('./auth-helper')
const errorFunctions = require('./simple-error')
const configCacheFunctions = require('./config-cache')

// ===== 功能模块分类导出 =====

/** 基础工具函数 - 日期格式化、字符串处理、防抖节流、JWT处理、认证助手 */
const Utils: Record<string, any> = {
  // 日期时间处理
  formatTime: utilFunctions.formatTime,
  formatNumber: utilFunctions.formatNumber,
  formatDateMessage: utilFunctions.formatDateMessage,

  // 字符串和编码处理
  base64Decode: utilFunctions.base64Decode,
  generateRandomString: utilFunctions.generateRandomString,
  formatFileSize: utilFunctions.formatFileSize,
  formatPoints: utilFunctions.formatPoints,
  formatPhoneNumber: utilFunctions.formatPhoneNumber,

  // JWT和Token处理
  validateJWTTokenIntegrity: utilFunctions.validateJWTTokenIntegrity,
  decodeJWTPayload: utilFunctions.decodeJWTPayload,
  isTokenExpired: utilFunctions.isTokenExpired,

  // 对象和数据处理
  deepClone: utilFunctions.deepClone,
  isEmpty: utilFunctions.isEmpty,
  safeJsonParse: utilFunctions.safeJsonParse,

  // 函数式编程工具
  debounce: utilFunctions.debounce,
  throttle: utilFunctions.throttle,

  // 认证助手函数
  checkAuth: authHelperFunctions.checkAuth,
  checkAdmin: authHelperFunctions.checkAdmin,
  getAccessToken: authHelperFunctions.getAccessToken,
  getUserInfo: authHelperFunctions.getUserInfo,
  clearAuthData: authHelperFunctions.clearAuthData,
  restoreUserInfo: authHelperFunctions.restoreUserInfo
}

/** 数据验证函数 - 表单验证、字段检查、业务规则验证 */
const Validation: Record<string, any> = {
  validatePhoneNumber: validateFunctions.validatePhoneNumber,
  validateVerificationCode: validateFunctions.validateVerificationCode,
  validatePoints: validateFunctions.validatePoints,
  validateQuantity: validateFunctions.validateQuantity,
  validateNickname: validateFunctions.validateNickname,
  validateImageFile: validateFunctions.validateImageFile,
  validateBatch: validateFunctions.validateBatch,
  FormValidator: validateFunctions.FormValidator,
  commonRules: validateFunctions.commonRules
}

/**
 * API接口函数 - V4.0统一引擎（对齐后端V4.7.0真实路由）
 *
 * ⚠️ 新增API方法时，必须在此处添加导出！
 * 格式：methodName: apiFunctions.methodName,
 * 如果遗漏此步骤，页面调用时会报错：API.methodName is not a function
 */
const API: Record<string, any> = {
  // API客户端类
  APIClient: apiFunctions.APIClient,

  // ========== 认证系统 ==========
  userLogin: apiFunctions.userLogin,
  quickLogin: apiFunctions.quickLogin,
  sendVerificationCode: apiFunctions.sendVerificationCode,
  getUserInfo: apiFunctions.getUserInfo,
  verifyToken: apiFunctions.verifyToken,

  // ========== 抽奖系统 ==========
  getLotteryCampaigns: apiFunctions.getLotteryCampaigns,
  getLotteryPrizes: apiFunctions.getLotteryPrizes,
  getLotteryConfig: apiFunctions.getLotteryConfig,
  performLottery: apiFunctions.performLottery,
  getLotteryHistory: apiFunctions.getLotteryHistory,

  // ========== 资产系统（原积分系统）==========
  getCurrentUserBalance: apiFunctions.getCurrentUserBalance,
  getPointsBalance: apiFunctions.getPointsBalance,
  getPointsTransactions: apiFunctions.getPointsTransactions,
  getAssetBalances: apiFunctions.getAssetBalances,
  getConversionRules: apiFunctions.getConversionRules,

  // ========== 背包系统 ==========
  getUserInventory: apiFunctions.getUserInventory,
  getBackpackStats: apiFunctions.getBackpackStats,
  getInventoryItem: apiFunctions.getInventoryItem,
  useInventoryItem: apiFunctions.useInventoryItem,
  redeemInventoryItem: apiFunctions.redeemInventoryItem,

  // ========== 兑换系统（backpack域）==========
  getExchangeProducts: apiFunctions.getExchangeProducts,
  exchangeProduct: apiFunctions.exchangeProduct,
  getExchangeRecords: apiFunctions.getExchangeRecords,
  cancelExchange: apiFunctions.cancelExchange,
  getExchangeItemDetail: apiFunctions.getExchangeItemDetail,
  getExchangeOrderDetail: apiFunctions.getExchangeOrderDetail,
  createRedemptionOrder: apiFunctions.createRedemptionOrder,

  // ========== 交易市场 ==========
  getMarketProducts: apiFunctions.getMarketProducts,
  getMarketProductDetail: apiFunctions.getMarketProductDetail,
  purchaseMarketProduct: apiFunctions.purchaseMarketProduct,
  withdrawMarketProduct: apiFunctions.withdrawMarketProduct,
  sellToMarket: apiFunctions.sellToMarket,
  getMyListingStatus: apiFunctions.getMyListingStatus,
  getMarketFacets: apiFunctions.getMarketFacets,
  sellFungibleAssets: apiFunctions.sellFungibleAssets,

  // ========== 消费积分系统（用户端）==========
  getUserQRCode: apiFunctions.getUserQRCode,
  // ========== 消费积分系统（管理端）==========
  getAdminUserQRCode: apiFunctions.getAdminUserQRCode,
  getUserInfoByQRCode: apiFunctions.getUserInfoByQRCode,
  submitConsumption: apiFunctions.submitConsumption,
  getMyConsumptionRecords: apiFunctions.getMyConsumptionRecords,
  getConsumptionDetail: apiFunctions.getConsumptionDetail,
  getMerchantConsumptions: apiFunctions.getMerchantConsumptions,
  getMerchantConsumptionStats: apiFunctions.getMerchantConsumptionStats,

  // ========== 消费审核（管理员）==========
  getPendingConsumption: apiFunctions.getPendingConsumption,
  approveConsumption: apiFunctions.approveConsumption,
  rejectConsumption: apiFunctions.rejectConsumption,

  // ========== 系统通用 - 位置配置 ==========
  getPlacementConfig: apiFunctions.getPlacementConfig,

  // ========== 系统通用 - 公告/反馈/状态 ==========
  getAnnouncements: apiFunctions.getAnnouncements,
  getHomeAnnouncements: apiFunctions.getHomeAnnouncements,
  submitFeedback: apiFunctions.submitFeedback,
  getMyFeedbacks: apiFunctions.getMyFeedbacks,
  getSystemStatus: apiFunctions.getSystemStatus,
  getPopupBanners: apiFunctions.getPopupBanners,
  getDictionaries: apiFunctions.getDictionaries,
  getNotifications: apiFunctions.getNotifications,

  // ========== 客服会话 ==========
  createChatSession: apiFunctions.createChatSession,
  getChatSessions: apiFunctions.getChatSessions,
  getChatHistory: apiFunctions.getChatHistory,
  sendChatMessage: apiFunctions.sendChatMessage,

  // ========== 用户 ==========
  getUserMe: apiFunctions.getUserMe,

  // ========== 用户统计（用户端，JWT解析身份）==========
  getUserStatistics: apiFunctions.getUserStatistics,
  getLotteryUserStatistics: apiFunctions.getLotteryUserStatistics,

  // ========== 管理员查看用户数据（console域，需admin权限）==========
  getAdminLotteryHistory: apiFunctions.getAdminLotteryHistory,
  getAdminUserStatistics: apiFunctions.getAdminUserStatistics,
  getAdminLotteryUserStatistics: apiFunctions.getAdminLotteryUserStatistics,

  // ========== 商家核销 ==========
  fulfillRedemption: apiFunctions.fulfillRedemption,

  // ========== 管理员（console域）==========
  getAdminChatSessions: apiFunctions.getAdminChatSessions,
  getAdminChatHistory: apiFunctions.getAdminChatHistory,
  closeAdminChatSession: apiFunctions.closeAdminChatSession,

  // ========== 活动 ==========
  getActivities: apiFunctions.getActivities,

  // API版本信息
  version: apiFunctions.version,
  lastUpdated: apiFunctions.lastUpdated,
  apiCompatibility: apiFunctions.apiCompatibility
}

/** 微信小程序工具函数 - 微信API封装、用户交互、导航 */
const Wechat: Record<string, any> = {
  WechatUtils: wechatFunctions.WechatUtils,
  initializeWechatEnvironment: wechatFunctions.initializeWechatEnvironment,
  getUserProfile: wechatFunctions.getUserProfile,
  showToast: wechatFunctions.showToast,
  showLoading: wechatFunctions.showLoading,
  hideLoading: wechatFunctions.hideLoading,
  navigateTo: wechatFunctions.navigateTo,
  navigateBack: wechatFunctions.navigateBack
}

/** 错误处理工具（极简方案） - 错误提示、成功提示、JWT过期处理 */
const ErrorHandler: Record<string, any> = {
  showError: errorFunctions.showError,
  showSuccess: errorFunctions.showSuccess,
  handleJWTExpired: errorFunctions.handleJWTExpired,
  handleError: errorFunctions.handleError
}

/** 活动位置配置缓存管理器（单例） */
const ConfigCache: Record<string, any> = {
  configCache: configCacheFunctions.configCache,
  validatePlacementConfig: configCacheFunctions.validatePlacementConfig
}

/** 项目核心常量 */
const Constants: Record<string, any> = require('../config/constants')

// ===== 统一导出接口 =====

/**
 * 标准导入方式:
 * const { Utils, Validation, API, Wechat, ErrorHandler, Constants, ConfigCache } = require('../../utils/index')
 */
module.exports = {
  Utils,
  Validation,
  API,
  Wechat,
  ErrorHandler,
  Constants,
  ConfigCache
}

export { }

