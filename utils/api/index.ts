/**
 * API模块统一入口（Barrel Re-export）
 *
 * 拆分策略: 方案A — 只拆文件，不改调用方式
 *   utils/api.ts → utils/api/{client,auth,lottery,assets,backpack,market,shop,system,console}.ts
 *   本文件作为 barrel 文件 re-export 所有子模块
 *   utils/index.ts 通过 require('./api/index') 显式引用本barrel入口
 *   所有页面的 API.xxx() 调用方式零改动
 *
 * ✅ 使用展开运算符自动同步：新增API方法只需在子模块导出，无需手动维护映射
 * ❌ 已删除: 150+行逐一手动映射（维护成本高，新增函数需3处同步）
 *
 * @file 天工餐厅积分系统 - API Barrel入口
 * @version 5.2.0
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
const adCampaignsModule = require('./ad-campaigns')
const userNotificationsModule = require('./user-notifications')
const auctionModule = require('./auction')
const diyModule = require('./diy')

/**
 * 展开运算符自动同步所有子模块导出
 * 新增API方法只需在对应子模块 module.exports 中添加，此处自动同步
 *
 * 合并顺序说明: 后面的模块会覆盖前面同名的导出
 * 如果两个模块定义了同名函数，后面的模块优先（当前无冲突）
 */
module.exports = {
  /** APIClient 核心类（单独具名导出，确保不被展开覆盖） */
  APIClient: clientModule.APIClient,

  /** 认证系统: userLogin / quickLogin / sendVerificationCode / getUserInfo / verifyToken */
  ...authModule,

  /** 抽奖系统: getLotteryCampaigns / getActiveCampaigns / getLotteryPrizes / getLotteryConfig / performLottery / getLotteryHistory / getLotteryUserStatistics */
  ...lotteryModule,

  /** 资产系统+资产转换: getPointsBalance / getPointsTransactions / getAssetBalances / getConversionRules / getTodaySummary / previewConversion / executeConversion */
  ...assetsModule,

  /** 背包+B2C兑换+竞价: getUserInventory / getBackpackStats / getExchangeProducts / exchangeProduct / getBidProducts / placeBid 等 */
  ...backpackModule,

  /** C2C交易市场: getMarketProducts / purchaseMarketProduct / sellToMarket / getMarketFacets / sellFungibleAssets / confirmDelivery / cancelTradeOrder 等 */
  ...marketModule,

  /** 消费积分系统（用户端+商家端）: getUserQRCode / submitConsumption / createRedemptionOrder 等 */
  ...shopModule,

  /** 系统通用+客服+活动: getPlacementConfig / getAdDelivery / reportInteractionLog / createChatSession / getActivities / getDictionaryTypes / getDictionaryByType 等 */
  ...systemModule,

  /** 管理员: getPendingConsumption / approveConsumption / getAdminChatSessions / updateAdminOnlineStatus 等 */
  ...consoleModule,

  /** 广告系统(P2+P3): getMyAdCampaigns / createAdCampaign / submitAdCampaign / cancelAdCampaign / reportAdImpression / reportAdClick 等 */
  ...adCampaignsModule,

  /** 用户通知系统（方案B独立化）: getUserNotifications / getUserNotificationUnreadCount / markNotificationsAsRead / markSingleNotificationAsRead */
  ...userNotificationsModule,

  /** C2C竞拍系统: getAuctionListings / getAuctionDetail / createAuction / placeAuctionBid / getMyAuctions / cancelAuction / getMyAuctionBids / createAuctionDispute */
  ...auctionModule,

  /** DIY饰品设计引擎: getDiyTemplates / getDiyTemplateById / getDiyPaymentAssets / getDiyTemplateBeads / getDiyMaterialGroups / getDiyWorks / getDiyWorkById / saveDiyWork / deleteDiyWork / confirmDiyWork / completeDiyWork / cancelDiyWork */
  ...diyModule
}
