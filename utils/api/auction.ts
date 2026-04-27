/**
 * C2C竞拍API（用户间拍卖交易）
 * 后端路由: routes/v4/marketplace/auctions.js
 *
 * 数据库表: auction_listings（7态状态机: pending/active/ended/cancelled/settled/settlement_failed/no_bid）
 *           auction_bids（出价记录）
 *
 * 核心概念:
 *   - seller_user_id: 卖方用户ID（普通用户，非管理员）
 *   - item_id: 拍卖物品ID（items表实例，非exchange_items）
 *   - price_asset_code: 出价资产类型（默认 star_stone，白名单校验）
 *   - buyout_price: 一口价（null=不支持，有值时出价>=此价即时结算）
 *   - item_snapshot: 物品快照JSON（创建时冻结物品状态，用于争议举证）
 *
 * 物品锁定机制:
 *   创建拍卖 → ItemService.holdItem({ hold_type: 'trade' }) → items.status='held'
 *   结算/流拍/取消 → ItemService.releaseHold() → items.status='available'
 *
 * 结算流程:
 *   中标者settleFromFrozen → FeeCalculator手续费 → ItemService.transferItem → 卖方入账 → 平台手续费
 *
 * 与C2C固定价交易(market.ts)的区别:
 *   - market: 挂单即定价，买方一次性购买
 *   - auction: 竞价机制，多人出价价高者得，支持一口价即时结算
 *
 * @file 天工餐厅积分系统 - C2C竞拍API模块
 * @version 5.2.0
 * @since 2026-03-25
 */

const { apiClient } = require('./client')
const { buildQueryString, generateIdempotencyKey } = require('../util')

// ==================== 拍卖列表与详情（买家/浏览视角） ====================

/**
 * 获取C2C拍卖列表
 * GET /api/v4/marketplace/auctions
 *
 * 后端服务: AuctionQueryService.getAuctionListings()
 *
 * 响应结构: { auctions: AuctionListing[], pagination: { page, page_size, total, total_pages } }
 *
 * AuctionListing 字段（基于 auction_listings 表）:
 *   auction_listing_id - BIGINT PK 拍卖ID
 *   seller_user_id     - INT FK 卖方用户ID
 *   seller_nickname    - VARCHAR 卖方昵称（JOIN users）
 *   item_id            - BIGINT FK 拍卖物品ID
 *   item_snapshot      - JSON 物品快照（item_name/item_type/rarity_code/item_value等）
 *   price_asset_code   - VARCHAR 出价资产类型（默认star_stone）
 *   start_price        - BIGINT 起拍价
 *   current_price      - BIGINT 当前最高出价
 *   min_bid_increment  - BIGINT 最小加价幅度
 *   buyout_price       - BIGINT|null 一口价
 *   start_time         - DATETIME 开始时间（北京时间）
 *   end_time           - DATETIME 结束时间（北京时间）
 *   status             - ENUM 状态（pending/active/ended/settled/no_bid/cancelled/settlement_failed）
 *   bid_count          - INT 出价次数
 *   unique_bidders     - INT 独立出价人数
 *   fee_rate           - DECIMAL 手续费率（默认5%）
 *   created_at         - DATETIME 创建时间
 *
 * @param params - 查询参数
 * @param params.page - 页码，默认1
 * @param params.page_size - 每页数量，默认20
 * @param params.status - 状态筛选: active/ended/settled（可选）
 * @param params.price_asset_code - 出价资产类型筛选（可选）
 * @param params.sort_by - 排序字段: end_time/current_price/bid_count/created_at（默认end_time）
 * @param params.sort_order - 排序方向: asc/desc（默认asc）
 */
async function getAuctionListings(
  params: {
    page?: number
    page_size?: number
    status?: string | null
    price_asset_code?: string | null
    sort_by?: string | null
    sort_order?: string | null
  } = {}
) {
  const {
    page = 1,
    page_size = 20,
    status = null,
    price_asset_code = null,
    sort_by = null,
    sort_order = null
  } = params

  const qs = buildQueryString({
    page,
    page_size,
    status,
    price_asset_code,
    sort_by,
    sort_order
  })
  return apiClient.request(`/marketplace/auctions?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取拍卖详情（含出价排行top10、物品快照、卖方信息）
 * GET /api/v4/marketplace/auctions/:auction_listing_id
 *
 * 后端服务: AuctionQueryService.getAuctionDetail()
 *
 * 响应 data 包含:
 *   auction  - 拍卖主信息（同列表字段 + winner_user_id/winner_bid_id/gross_amount/fee_amount/net_amount）
 *   top_bids - 出价排行前10（auction_bid_id/user_id/nickname/bid_amount/created_at/is_winning）
 *   my_bids  - 当前用户在此拍卖的出价记录（仅登录用户，未登录为空数组）
 *
 * @param auctionListingId - 拍卖ID（BIGINT）
 */
async function getAuctionDetail(auctionListingId: number) {
  if (!auctionListingId) {
    throw new Error('拍卖ID不能为空')
  }
  return apiClient.request(`/marketplace/auctions/${auctionListingId}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 创建拍卖（卖方操作） ====================

/**
 * 创建C2C拍卖（从背包选物品 → 设置参数 → 提交）
 * POST /api/v4/marketplace/auctions
 * 携带 Idempotency-Key 请求头防止重复创建
 *
 * 后端服务: AuctionService.createAuction()
 * 业务流程:
 *   1. 校验物品所有权（Item → Account → user_id）
 *   2. 校验物品状态 = available（held/used/expired/destroyed 不可拍卖）
 *   3. ItemService.holdItem({ hold_type: 'trade' }) 锁定物品
 *   4. 保存 item_snapshot（物品当时状态快照）
 *   5. 创建 auction_listings 记录（status='pending'）
 *   6. 定时任务在 start_time 到达时激活（pending → active）
 *
 * ⚠️ 如果物品有 redemption 或 security 活跃锁，创建将失败
 *    返回错误: "物品正在核销中/被安全冻结，请稍后再试"
 *
 * @param params - 拍卖参数
 * @param params.item_id - 拍卖物品ID（items表主键，必须为available状态）
 * @param params.start_price - 起拍价（大于0的整数）
 * @param params.price_asset_code - 出价资产类型（默认star_stone，白名单校验）
 * @param params.min_bid_increment - 最小加价幅度（默认10）
 * @param params.buyout_price - 一口价（null=不支持，有值时出价>=此价即时结算）
 * @param params.start_time - 开始时间（ISO8601格式，北京时间）
 * @param params.end_time - 结束时间（ISO8601格式，与start_time间隔>=2小时）
 */
async function createAuction(params: {
  item_id: number
  start_price: number
  price_asset_code?: string
  min_bid_increment?: number
  buyout_price?: number | null
  start_time: string
  end_time: string
}) {
  if (!params.item_id) {
    throw new Error('请选择要拍卖的物品')
  }
  if (!params.start_price || params.start_price <= 0) {
    throw new Error('起拍价必须大于0')
  }
  if (!params.start_time) {
    throw new Error('请设置拍卖开始时间')
  }
  if (!params.end_time) {
    throw new Error('请设置拍卖结束时间')
  }

  const requestBody: Record<string, any> = {
    item_id: params.item_id,
    start_price: params.start_price,
    start_time: params.start_time,
    end_time: params.end_time
  }

  if (params.price_asset_code) {
    requestBody.price_asset_code = params.price_asset_code
  }
  if (params.min_bid_increment && params.min_bid_increment > 0) {
    requestBody.min_bid_increment = params.min_bid_increment
  }
  if (params.buyout_price && params.buyout_price > 0) {
    requestBody.buyout_price = params.buyout_price
  }

  const idempotencyKey = await generateIdempotencyKey('auction_create')
  return apiClient.request('/marketplace/auctions', {
    method: 'POST',
    data: requestBody,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '创建拍卖中...',
    showError: true,
    errorPrefix: '创建拍卖失败：'
  })
}

// ==================== 出价（买方操作） ====================

/**
 * 对拍卖出价
 * POST /api/v4/marketplace/auctions/:auction_listing_id/bid
 * 携带 Idempotency-Key 请求头防止重复出价
 *
 * 后端服务: AuctionService.placeBid()
 * 业务流程:
 *   1. 校验 seller_user_id !== userId（卖方不能出价自己的拍卖）
 *   2. 校验拍卖状态 = active
 *   3. 校验出价金额（首次 >= start_price，后续 >= current_price + min_bid_increment）
 *   4. BalanceService.freeze() 冻结出价金额
 *   5. 前一最高出价者 BalanceService.unfreeze() 解冻
 *   6. 创建 auction_bids 记录
 *   7. 更新 auction_listings.current_price/bid_count/unique_bidders
 *   8. 若 buyout_price 存在且 bid_amount >= buyout_price → 立即结算（一口价触发）
 *   9. WebSocket推送: auction_outbid(被超越者) / auction_new_bid(卖方)
 *
 * @param auctionListingId - 拍卖ID（BIGINT）
 * @param bidAmount - 出价金额（正整数）
 */
async function placeAuctionBid(auctionListingId: number, bidAmount: number) {
  if (!auctionListingId) {
    throw new Error('拍卖ID不能为空')
  }
  if (!bidAmount || bidAmount <= 0) {
    throw new Error('出价金额必须大于0')
  }

  const idempotencyKey = await generateIdempotencyKey('auction_bid', auctionListingId)
  return apiClient.request(`/marketplace/auctions/${auctionListingId}/bid`, {
    method: 'POST',
    data: { bid_amount: bidAmount },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '出价中...',
    showError: true,
    errorPrefix: '出价失败：'
  })
}

// ==================== 卖方操作 ====================

/**
 * 获取我发起的拍卖列表（卖方视角）
 * GET /api/v4/marketplace/auctions/my
 *
 * 后端服务: AuctionQueryService.getUserAuctions()
 * 后端通过JWT Token识别当前用户（卖方），返回该用户创建的所有拍卖记录
 *
 * 响应结构: { auctions: AuctionListing[], pagination: Pagination }
 *
 * @param params - 查询参数
 * @param params.page - 页码，默认1
 * @param params.page_size - 每页数量，默认20
 * @param params.status - 状态筛选（可选）
 */
async function getMyAuctions(
  params: {
    page?: number
    page_size?: number
    status?: string | null
  } = {}
) {
  const { page = 1, page_size = 20, status = null } = params
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/marketplace/auctions/my?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 卖方取消拍卖
 * POST /api/v4/marketplace/auctions/:auction_listing_id/cancel
 *
 * 后端服务: AuctionService.cancelAuction()
 * 业务规则:
 *   - bid_count === 0 时卖方可自行取消（无出价时）
 *   - bid_count > 0 时卖方不可取消（需联系管理员强制取消）
 *   - 取消后: 所有出价者解冻 + ItemService.releaseHold() 释放物品
 *
 * @param auctionListingId - 拍卖ID（BIGINT）
 */
async function cancelAuction(auctionListingId: number) {
  if (!auctionListingId) {
    throw new Error('拍卖ID不能为空')
  }

  const idempotencyKey = await generateIdempotencyKey('auction_cancel', auctionListingId)
  return apiClient.request(`/marketplace/auctions/${auctionListingId}/cancel`, {
    method: 'POST',
    data: {},
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '取消拍卖中...',
    showError: true,
    errorPrefix: '取消失败：'
  })
}

// ==================== 买方出价记录 ====================

/**
 * 获取我的出价记录（买方视角）
 * GET /api/v4/marketplace/auctions/my-bids
 *
 * 后端服务: AuctionQueryService.getUserBidHistory()
 * 后端通过JWT Token识别当前用户（买方），返回该用户的所有出价记录
 *
 * 响应结构: { bids: AuctionBidRecord[], pagination: Pagination }
 *
 * AuctionBidRecord 包含:
 *   auction_bid_id      - BIGINT 出价记录ID
 *   auction_listing_id  - BIGINT 关联拍卖ID
 *   bid_amount          - BIGINT 出价金额
 *   is_winning          - BOOLEAN 当前是否领先
 *   is_final_winner     - BOOLEAN 是否最终中标
 *   created_at          - DATETIME 出价时间
 *   auction_info        - 关联拍卖摘要（item_snapshot/status/current_price/end_time等）
 *
 * @param params - 查询参数
 * @param params.page - 页码，默认1
 * @param params.page_size - 每页数量，默认20
 */
async function getMyAuctionBids(
  params: {
    page?: number
    page_size?: number
  } = {}
) {
  const { page = 1, page_size = 20 } = params
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/marketplace/auctions/my-bids?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 争议（买方操作，仅已结算拍卖） ====================

/**
 * 买方对已结算拍卖发起争议
 * POST /api/v4/marketplace/auctions/:auction_listing_id/dispute
 *
 * 后端服务: 接入已有 TradeDisputeService（customer_service_issues表）
 * 适用条件: 拍卖 status=settled 且中标者为当前用户
 *
 * 请求体:
 *   dispute_type  - 争议类型: 'item_mismatch'(物品不符) / 'quality_issue'(质量问题) / 'other'(其他)
 *   description   - 争议描述（必填，20-500字）
 *   evidence_urls - 证据图片URL数组（可选，最多5张）
 *
 * @param auctionListingId - 拍卖ID（BIGINT）
 * @param disputeData - 争议表单数据
 */
async function createAuctionDispute(
  auctionListingId: number,
  disputeData: {
    dispute_type: string
    description: string
    evidence_urls?: string[]
  }
) {
  if (!auctionListingId) {
    throw new Error('拍卖ID不能为空')
  }
  if (!disputeData.dispute_type) {
    throw new Error('请选择争议类型')
  }
  if (!disputeData.description || disputeData.description.length < 20) {
    throw new Error('争议描述不能少于20字')
  }
  if (disputeData.description.length > 500) {
    throw new Error('争议描述不能超过500字')
  }

  const idempotencyKey = await generateIdempotencyKey('auction_dispute', auctionListingId)
  return apiClient.request(`/marketplace/auctions/${auctionListingId}/dispute`, {
    method: 'POST',
    data: disputeData,
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '提交争议中...',
    showError: true,
    errorPrefix: '提交争议失败：'
  })
}

module.exports = {
  getAuctionListings,
  getAuctionDetail,
  createAuction,
  placeAuctionBid,
  getMyAuctions,
  cancelAuction,
  getMyAuctionBids,
  createAuctionDispute
}
