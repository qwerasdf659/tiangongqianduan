/**
 * C2C竞拍公共辅助函数与常量
 *
 * 提取自各竞拍页面的重复代码，统一维护。
 * 所有竞拍页面（auction-hall/auction-detail/auction-create/my-auctions/my-auction-bids）
 * 统一从此模块引用，避免重复定义。
 *
 * @file utils/auction-helpers.ts
 * @version 5.2.0
 * @since 2026-04-02
 */

const AuctionImageHelper = require('./image-helper')

// ==================== 拍卖状态UI配置（对齐后端 auction_listings 7态状态机） ====================

/**
 * 拍卖状态 → UI展示映射
 * 状态枚举对齐后端 auction_listings.status ENUM:
 *   pending / active / ended / cancelled / settled / settlement_failed / no_bid
 */
const AUCTION_STATUS_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  /** 待开始 — 定时任务在 start_time 到达时激活 */
  pending: { label: '即将开始', color: '#faad14', icon: '⏳' },
  /** 竞拍中 — 用户可出价 */
  active: { label: '竞拍中', color: '#52c41a', icon: '🔥' },
  /** 已结束 — 等待结算 */
  ended: { label: '已结束', color: '#999999', icon: '⏰' },
  /** 已成交 — 结算完成，物品已转移 */
  settled: { label: '已成交', color: '#1890ff', icon: '✅' },
  /** 流拍 — 无人出价，物品已释放回卖方背包 */
  no_bid: { label: '流拍', color: '#999999', icon: '😞' },
  /** 已取消 — 卖方取消或管理员强制取消 */
  cancelled: { label: '已取消', color: '#999999', icon: '❌' },
  /** 结算异常 — 最多重试3次后等待管理员处理 */
  settlement_failed: { label: '结算异常', color: '#ff4d4f', icon: '⚠️' }
}

/**
 * 出价状态 → UI展示映射（买方视角）
 * 用于 my-auction-bids 页面展示出价记录状态
 */
const BID_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  /** 当前领先 — is_winning=true */
  winning: { label: '当前领先 👑', color: '#52c41a' },
  /** 已被超越 — 有更高出价 */
  outbid: { label: '已被超越', color: '#faad14' },
  /** 已中标 — is_final_winner=true */
  won: { label: '已中标 🎉', color: '#1890ff' },
  /** 未中标 — 拍卖已结算但不是中标者 */
  lost: { label: '未中标', color: '#999999' }
}

/**
 * 拍卖大厅排序选项（对齐后端 AuctionQueryService 支持的排序字段）
 */
const AUCTION_SORT_OPTIONS = [
  { key: 'end_time_asc', label: '即将结束', sort_by: 'end_time', sort_order: 'asc' },
  { key: 'current_price_desc', label: '价格最高', sort_by: 'current_price', sort_order: 'desc' },
  { key: 'current_price_asc', label: '价格最低', sort_by: 'current_price', sort_order: 'asc' },
  { key: 'bid_count_desc', label: '最多出价', sort_by: 'bid_count', sort_order: 'desc' },
  { key: 'created_at_desc', label: '最新发布', sort_by: 'created_at', sort_order: 'desc' }
]

// ==================== 辅助函数 ====================

/**
 * 根据物品快照获取展示图片
 * 优先使用 item_type 匹配素材图标，无匹配时使用默认商品图
 *
 * @param snapshot - 物品快照对象（auction_listings.item_snapshot JSON）
 * @returns 图片路径
 */
function getAuctionItemImage(snapshot: any): string {
  if (!snapshot) {
    return AuctionImageHelper.DEFAULT_PRODUCT_IMAGE
  }
  if (snapshot.item_type) {
    return AuctionImageHelper.getMaterialIconPath(snapshot.item_type)
  }
  return AuctionImageHelper.DEFAULT_PRODUCT_IMAGE
}

/**
 * 根据物品类型获取展示图片（用于背包物品列表，非快照）
 *
 * @param itemType - 物品类型编码
 * @returns 图片路径
 */
function getAuctionItemImageByType(itemType: string | null): string {
  if (itemType) {
    return AuctionImageHelper.getMaterialIconPath(itemType)
  }
  return AuctionImageHelper.DEFAULT_PRODUCT_IMAGE
}

/**
 * 根据稀有度编码获取中文显示名
 * 通过 ImageHelper.getRarityStyle 获取稀有度配置
 *
 * @param rarityCode - 稀有度编码（如 common/rare/epic/legendary）
 * @returns 中文显示名（如 "普通"/"稀有"/"史诗"/"传说"），无匹配返回空字符串
 */
function getAuctionRarityLabel(rarityCode: string | null): string {
  if (!rarityCode) {
    return ''
  }
  const style = AuctionImageHelper.getRarityStyle(rarityCode)
  return style ? style.displayName : ''
}

/**
 * 获取拍卖状态UI配置
 * 安全访问，未知状态返回 active 配置作为降级
 *
 * @param status - 拍卖状态枚举值
 * @returns { label, color, icon }
 */
function getAuctionStatusConfig(status: string): { label: string; color: string; icon: string } {
  return AUCTION_STATUS_CONFIG[status] || AUCTION_STATUS_CONFIG.active
}

/**
 * 获取出价状态UI配置
 *
 * @param status - 出价状态: winning/outbid/won/lost
 * @returns { label, color }
 */
function getBidStatusConfig(status: string): { label: string; color: string } {
  return BID_STATUS_CONFIG[status] || BID_STATUS_CONFIG.outbid
}

/**
 * 计算倒计时文本
 * 根据拍卖状态区分"距开始"和"距结束"
 *
 * @param endTime - 结束时间（ISO8601字符串）
 * @param status - 拍卖状态
 * @param startTime - 开始时间（ISO8601字符串，pending状态时使用）
 * @returns 倒计时文本，非活跃状态返回空字符串
 */
function calcAuctionCountdown(endTime: string, status: string, startTime?: string): string {
  if (status !== 'active' && status !== 'pending') {
    return ''
  }

  const now = Date.now()
  const targetTime =
    status === 'pending' ? new Date(startTime || endTime).getTime() : new Date(endTime).getTime()
  const diff = targetTime - now

  if (diff <= 0) {
    return status === 'pending' ? '即将开始' : '已结束'
  }

  const hours = Math.floor(diff / 3600000)
  const minutes = Math.floor((diff % 3600000) / 60000)
  const seconds = Math.floor((diff % 60000) / 1000)

  if (hours > 24) {
    const days = Math.floor(hours / 24)
    return `${days}天${hours % 24}小时${minutes}分`
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分${seconds}秒`
  }
  return `${minutes}分${seconds}秒`
}

module.exports = {
  AUCTION_STATUS_CONFIG,
  BID_STATUS_CONFIG,
  AUCTION_SORT_OPTIONS,
  getAuctionItemImage,
  getAuctionItemImageByType,
  getAuctionRarityLabel,
  getAuctionStatusConfig,
  getBidStatusConfig,
  calcAuctionCountdown
}
