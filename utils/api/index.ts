/**
 * API模块统一入口（Barrel Re-export）
 *
 * 拆分策略: 方案A — 只拆文件，不改调用方式
 *   utils/api.ts → utils/api/{client,auth,lottery,assets,backpack,market,shop,system,console}.ts
 *   本文件作为 barrel 文件 re-export 所有子模块
 *   utils/index.ts 通过 require('./api/index') 显式引用本barrel入口
 *   所有页面的 API.xxx() 调用方式零改动
 *
 * @file 天工餐厅积分系统 - API Barrel入口
 * @version 5.1.0
 * @since 2026-02-15
 */

const clientModule = require('./client')
const authModule = require('./auth')
const lotteryModule = require('./lottery')
const assetsModule = require('./assets')
const backpackModule = require('./backpack')
const marketModule = require('./market')
const shopModule = require('./shop')
const systemModule = require('./system')
const consoleModule = require('./console')

module.exports = {
  // 客户端核心
  APIClient: clientModule.APIClient,

  // ===== 认证系统 =====
  userLogin: authModule.userLogin,
  quickLogin: authModule.quickLogin,
  sendVerificationCode: authModule.sendVerificationCode,
  getUserInfo: authModule.getUserInfo,
  verifyToken: authModule.verifyToken,

  // ===== 抽奖系统 =====
  getLotteryCampaigns: lotteryModule.getLotteryCampaigns,
  getActiveCampaigns: lotteryModule.getActiveCampaigns,
  getLotteryPrizes: lotteryModule.getLotteryPrizes,
  getLotteryConfig: lotteryModule.getLotteryConfig,
  performLottery: lotteryModule.performLottery,
  getLotteryHistory: lotteryModule.getLotteryHistory,

  // ===== 资产系统 =====
  getPointsBalance: assetsModule.getPointsBalance,
  getPointsTransactions: assetsModule.getPointsTransactions,
  getAssetBalances: assetsModule.getAssetBalances,
  getConversionRules: assetsModule.getConversionRules,

  // ===== 背包系统 =====
  getUserInventory: backpackModule.getUserInventory,
  getBackpackStats: backpackModule.getBackpackStats,
  getInventoryItem: backpackModule.getInventoryItem,
  useInventoryItem: backpackModule.useInventoryItem,
  redeemInventoryItem: backpackModule.redeemInventoryItem,

  // ===== 兑换系统（backpack域）=====
  getExchangeProducts: backpackModule.getExchangeProducts,
  exchangeProduct: backpackModule.exchangeProduct,
  getExchangeRecords: backpackModule.getExchangeRecords,
  cancelExchange: backpackModule.cancelExchange,
  getExchangeItemDetail: backpackModule.getExchangeItemDetail,
  getExchangeOrderDetail: backpackModule.getExchangeOrderDetail,

  // ===== 臻选空间（高级兑换）=====
  getPremiumStatus: backpackModule.getPremiumStatus,
  unlockPremium: backpackModule.unlockPremium,

  // ===== 竞价系统（backpack/bid域）=====
  getBidProducts: backpackModule.getBidProducts,
  getBidProductDetail: backpackModule.getBidProductDetail,
  placeBid: backpackModule.placeBid,
  getBidHistory: backpackModule.getBidHistory,

  // ===== 交易市场 =====
  getMarketProducts: marketModule.getMarketProducts,
  getMarketProductDetail: marketModule.getMarketProductDetail,
  purchaseMarketProduct: marketModule.purchaseMarketProduct,
  withdrawMarketProduct: marketModule.withdrawMarketProduct,
  sellToMarket: marketModule.sellToMarket,
  getMyListingStatus: marketModule.getMyListingStatus,
  getMarketFacets: marketModule.getMarketFacets,
  sellFungibleAssets: marketModule.sellFungibleAssets,

  // ===== 消费积分系统（用户端）=====
  getUserQRCode: shopModule.getUserQRCode,
  getMyConsumptionRecords: shopModule.getMyConsumptionRecords,
  getConsumptionDetail: shopModule.getConsumptionDetail,

  // ===== 消费积分系统（商家端）=====
  getUserInfoByQRCode: shopModule.getUserInfoByQRCode,
  submitConsumption: shopModule.submitConsumption,
  getMerchantConsumptions: shopModule.getMerchantConsumptions,
  getMerchantConsumptionStats: shopModule.getMerchantConsumptionStats,
  createRedemptionOrder: shopModule.createRedemptionOrder,
  fulfillRedemption: shopModule.fulfillRedemption,

  // ===== 管理员消费审核 =====
  getPendingConsumption: consoleModule.getPendingConsumption,
  approveConsumption: consoleModule.approveConsumption,
  rejectConsumption: consoleModule.rejectConsumption,

  // ===== 系统通用 =====
  getPlacementConfig: systemModule.getPlacementConfig,
  getAnnouncements: systemModule.getAnnouncements,
  getHomeAnnouncements: systemModule.getHomeAnnouncements,
  submitFeedback: systemModule.submitFeedback,
  getMyFeedbacks: systemModule.getMyFeedbacks,
  getSystemStatus: systemModule.getSystemStatus,
  getPopupBanners: systemModule.getPopupBanners,
  getDictionaries: systemModule.getDictionaries,
  getNotifications: systemModule.getNotifications,
  getProductFilterConfig: systemModule.getProductFilterConfig,
  getFeedbackConfig: systemModule.getFeedbackConfig,

  // ===== 客服会话 =====
  createChatSession: systemModule.createChatSession,
  getChatSessions: systemModule.getChatSessions,
  getChatHistory: systemModule.getChatHistory,
  sendChatMessage: systemModule.sendChatMessage,
  uploadChatImage: systemModule.uploadChatImage,
  searchChatMessages: systemModule.searchChatMessages,

  // ===== 用户 =====
  getUserMe: systemModule.getUserMe,

  // ===== 用户统计（JWT解析身份）=====
  getUserStatistics: lotteryModule.getUserStatistics,
  getLotteryUserStatistics: lotteryModule.getLotteryUserStatistics,

  // ===== 管理员（console域）=====
  getAdminUserQRCode: consoleModule.getAdminUserQRCode,
  getAdminLotteryHistory: consoleModule.getAdminLotteryHistory,
  getAdminUserStatistics: consoleModule.getAdminUserStatistics,
  getAdminLotteryUserStatistics: consoleModule.getAdminLotteryUserStatistics,
  getAdminChatSessions: consoleModule.getAdminChatSessions,
  getAdminChatHistory: consoleModule.getAdminChatHistory,
  closeAdminChatSession: consoleModule.closeAdminChatSession,

  // ===== 管理员客服统计与在线状态 =====
  getAdminSessionStats: consoleModule.getAdminSessionStats,
  getAdminResponseStats: consoleModule.getAdminResponseStats,
  updateAdminOnlineStatus: consoleModule.updateAdminOnlineStatus,
  getAdminOnlineStatus: consoleModule.getAdminOnlineStatus,

  // ===== 活动 =====
  getActivities: systemModule.getActivities,

  // API版本信息
  version: '5.2.0',
  lastUpdated: '2026-02-15T00:00:00+08:00',
  apiCompatibility:
    'V4.7.0后端对齐+聊天图片上传+臻选空间解锁+商品筛选配置+反馈配置+客服响应统计+竞价系统'
}

export {}
