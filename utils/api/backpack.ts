/**
 * 🎒 背包系统 + 🎁 兑换系统 + 🎯 竞价系统 API
 * 后端路由: routes/v4/backpack/（双轨结 assets[] + items[] * 兑换路由: routes/v4/backpack/exchange/（用户域 * 竞价路由: routes/v4/backpack/bid/（用户域 *
 * 数据库表: exchange_items / exchange_records / bid_products / bid_records
 *           item_instances / account_asset_balances
 *
 * @file 天工餐厅积分系统 - 背包与兑换与竞价API模块
 * @version 5.2.0
 * @since 2026-02-16
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 🎒 背包 ====================

/**
 * 获取用户背包 双轨结构 assets[] + items[]
 * GET /api/v4/backpack/
 *
 * 响应: { assets: AssetBalance[], items: ItemInstance[] }
 * assets 来源: account_asset_balances JOIN material_asset_types
 * items 来源: item_instances (status='available') LEFT JOIN item_templates
 */
async function getUserInventory() {
  return apiClient.request('/backpack', { method: 'GET', needAuth: true })
}

/**
 * 获取背包统计
 * GET /api/v4/backpack/stats
 */
async function getBackpackStats() {
  return apiClient.request('/backpack/stats', { method: 'GET', needAuth: true })
}

/**
 * 获取物品详情（含 is_owner 标识 * GET /api/v4/backpack/items/:item_instance_id
 *
 * @param item_instance_id - 物品实例ID（BIGINT */
async function getInventoryItem(item_instance_id: number) {
  return apiClient.request(`/backpack/items/${item_instance_id}`, { method: 'GET', needAuth: true })
}

/**
 * 使用物品
 * POST /api/v4/backpack/items/:item_instance_id/use
 * 业务流程: 验证所有权 status=available consumeItem(status→used) 记录 item_instance_events
 *
 * @param item_instance_id - 物品实例ID（BIGINT */
async function useInventoryItem(item_instance_id: number) {
  return apiClient.request(`/backpack/items/${item_instance_id}/use`, {
    method: 'POST',
    needAuth: true
  })
}

/**
 * 生成核销码（到店出示，商家扫码核销 * POST /api/v4/backpack/items/:item_instance_id/redeem
 *
 * 响应: { order: { redemption_order_id: UUID, status, expires_at }, code: "ABCD1234EFGH" }
 * ⚠️ redemption_order_id UUID(CHAR(36))，code 明文仅返回一 *
 * @param item_instance_id - 物品实例ID（BIGINT */
async function redeemInventoryItem(item_instance_id: number) {
  return apiClient.request(`/backpack/items/${item_instance_id}/redeem`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '生成核销码中...',
    showError: true,
    errorPrefix: '生成失败：'
  })
}

// ==================== 🎁 兑换 ====================

/**
 * 获取兑换商品列表
 * GET /api/v4/backpack/exchange/items
 *
 * 后端服务: exchange_query（ExchangeQueryService.getMarketItems * 数据库表: exchange_items（字符 exchange_item_id, item_name, cost_asset_code, cost_amount 等）
 *
 * 响应结构: { items: ExchangeItem[], pagination: { page, page_size, total, total_pages }, summary }
 * ⚠️ 后端返回数组字段名是 items，不products
 *
 * @param params - 查询参数对象
 * @param params.space - 空间类型: 'lucky'(幸运空间) / 'premium'(臻选空
 * @param params.category - 商品分类（对category_defs.category_code * @param params.keyword - 模糊搜索（匹item_name * @param params.status - 商品状态 'active' / 'inactive'，默'active'
 * @param params.asset_code - 材料资产代码筛选（'red_shard', 'DIAMOND' * @param params.min_cost - 最低价格筛 * @param params.max_cost - 最高价格筛 * @param params.stock_status - 库存状态 'in_stock'(>5) / 'low_stock'(1-5)
 * @param params.page - 页码，默
 * @param params.page_size - 每页数量，默0，最0
 * @param params.sort_by - 排序字段，默'sort_order'
 * @param params.sort_order - 排序方向: 'ASC' / 'DESC'
 */
async function getExchangeProducts(
  params: {
    space?: string | null
    category?: string | null
    keyword?: string | null
    status?: string | null
    asset_code?: string | null
    min_cost?: number | null
    max_cost?: number | null
    stock_status?: string | null
    page?: number
    page_size?: number
    sort_by?: string | null
    sort_order?: string | null
  } = {}
) {
  const {
    space = null,
    category = null,
    keyword = null,
    status = 'active',
    asset_code = null,
    min_cost = null,
    max_cost = null,
    stock_status = null,
    page = 1,
    page_size = 20,
    sort_by = null,
    sort_order = null
  } = params

  const qs = buildQueryString({
    space,
    category,
    keyword,
    status,
    asset_code,
    min_cost,
    max_cost,
    stock_status,
    page,
    page_size,
    sort_by,
    sort_order
  })
  return apiClient.request(`/backpack/exchange/items?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 执行商品兑换
 * POST /api/v4/backpack/exchange
 *
 * 后端服务: exchange_core（CoreService.exchangeItem * 业务流程: 幂等键校商品状态校库存校验 BalanceService扣减资产 库存扣减 创建exchange_records
 * 全流程在 TransactionManager.execute() 事务 *
 * 响应字段: { order_no, id, quantity, pay_asset_code, pay_amount, status, exchange_time }
 * ⚠️ 后端不返回 remaining_points（安全考虑，余额需单独查询 GET /api/v4/assets/balance）
 *
 * @param id - 兑换商品ID（DataSanitizer 输出通用 id，数据库实际字段 exchange_item_id）
 * @param quantity - 兑换数量，默认 1
 */
async function exchangeProduct(id: number, quantity: number = 1) {
  if (!id) {
    throw new Error('兑换商品ID不能为空')
  }
  if (quantity < 1) {
    throw new Error('兑换数量必须大于0')
  }

  /* 生成幂等键，防止重复提交（exchange_records 表唯一约束） */
  const idempotencyKey = `exchange_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request('/backpack/exchange', {
    method: 'POST',
    data: {
      id,
      quantity
    },
    header: {
      /* 后端要求幂等键通过 HTTP Header 传递，而非请求体 */
      'Idempotency-Key': idempotencyKey
    },
    needAuth: true,
    showLoading: true,
    loadingText: '兑换中...',
    showError: true,
    errorPrefix: '兑换失败：'
  })
}

/**
 * 获取兑换订单记录
 * GET /api/v4/backpack/exchange/orders
 *
 * 订单状态枚举（数据库ENUM pending completed shipped / cancelled
 *
 * @param page - 页码，默
 * @param page_size - 每页数量，默0
 * @param status - 订单状态筛 */
async function getExchangeRecords(
  page: number = 1,
  page_size: number = 20,
  status: string | null = null
) {
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/backpack/exchange/orders?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 取消兑换订单（退还资产）
 * POST /api/v4/backpack/exchange/orders/:order_no/cancel
 *
 * @param order_no - 订单号（exchange_records.order_no，VARCHAR(50) UNIQUE */
async function cancelExchange(order_no: string) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }
  return apiClient.request(`/backpack/exchange/orders/${order_no}/cancel`, {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '取消订单中...',
    showError: true,
    errorPrefix: '取消失败：'
  })
}

/**
 * 获取兑换商品详情
 * GET /api/v4/backpack/exchange/items/:id
 *
 * @param id - 兑换商品ID（DataSanitizer 输出通用 id）
 */
async function getExchangeItemDetail(id: number | string) {
  if (!id) {
    throw new Error('商品ID不能为空')
  }
  return apiClient.request(`/backpack/exchange/items/${id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取兑换订单详情
 * GET /api/v4/backpack/exchange/orders/:order_no
 *
 * @param order_no - 订单号（exchange_records.order_no */
async function getExchangeOrderDetail(order_no: string) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }
  return apiClient.request(`/backpack/exchange/orders/${order_no}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 📊 空间统计 ====================

/**
 * 获取兑换空间统计数据
 * GET /api/v4/backpack/exchange/space-stats
 *
 * 后端服务: exchange_query（ExchangeQueryService）
 * 空间类型: 'lucky'(幸运空间) / 'premium'(臻选空间)
 *
 * @param space - 空间类型: 'lucky' | 'premium'
 */
async function getExchangeSpaceStats(space: string) {
  if (!space) {
    throw new Error('空间类型不能为空')
  }
  const qs = buildQueryString({ space })
  return apiClient.request(`/backpack/exchange/space-stats?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

// ==================== 🌟 臻选空间（高级兑换） ====================

/**
 * 查询臻选空间解锁状态
 * GET /api/v4/backpack/exchange/premium-status
 *
 * 后端服务: premium（PremiumService.getPremiumStatus * 数据来源: PremiumService 服务层计算返回（⚠️ user_premium_statuses 表不存在） *
 * 已解锁时响应字段:
 *   - unlocked: true 当前已解锁（⚠️ 不是 is_unlocked *   - is_valid: boolean 是否在有效期 *   - unlock_cost: 100 解锁花费（积分）
 *   - validity_hours: 24 有效期（小时间 *   - remaining_hours: number 剩余有效时间（小时）（⚠不返expires_at *   - total_unlock_count: number 累计解锁次数
 *
 * 未解锁时响应字段:
 *   - unlocked: false 当前未解锁 *   - is_expired: boolean 是否已过期 *   - can_unlock: boolean 是否满足解锁条件
 *   - unlock_cost: 100 解锁花费（积分）
 *   - validity_hours: 24 有效期（小时间 *   - conditions: object 解锁条件详情
 */
async function getPremiumStatus() {
  return apiClient.request('/backpack/exchange/premium-status', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 解锁臻选空 * POST /api/v4/backpack/exchange/unlock-premium
 *
 * 后端服务: premium（PremiumService.unlockPremium * 业务规则:
 *   1. users.history_total_points >= 100000（历史累计门槛）
 *   2. POINTS 可用余额 >= 100（通过 BalanceService.changeBalance 扣减 *   3. 已解锁且未过期拒绝重复解锁
 *   4. 解锁有效4小时
 *   5. 全流程在 TransactionManager.execute() 事务 */
async function unlockPremium() {
  return apiClient.request('/backpack/exchange/unlock-premium', {
    method: 'POST',
    needAuth: true,
    showLoading: true,
    loadingText: '解锁中...',
    showError: true,
    errorPrefix: '解锁失败：'
  })
}

// ==================== 🎯 竞价系统（bid域） ====================

/**
 * 获取竞价商品列表
 * GET /api/v4/backpack/bid/products
 *
 * 后端服务: bid_query（BidQueryService * 数据库表: bid_products（关exchange_items *
 * 竞价状态枚举（7态）: pending active ended settled / no_bid / cancelled / settlement_failed
 *
 * 响应字段（基bid_products 表）:
 *   - bid_product_id: BIGINT PK
 *   - exchange_item_id: BIGINT FK
 *   - start_price: BIGINT（起拍价，⚠不是 starting_price *   - current_price: BIGINT（当前最高出价）
 *   - min_bid_increment: BIGINT（最小加价幅度）
 *   - price_asset_code: VARCHAR(50)（竞价资产类型，默认 DIAMOND，⚠不是 asset_code *   - status: ENUM态）
 *   - start_time / end_time: DATETIME
 *   - bid_count: INT
 *   - winner_user_id: INT（当前最高出价者，⚠️ 不是 highest_bidder_id *
 * @param page - 页码，默
 * @param page_size - 每页数量，默0
 * @param status - 竞价状态筛选（active/pending/ended/settled/no_bid/all），默认 'active'
 */
async function getBidProducts(
  page: number = 1,
  page_size: number = 20,
  status: string | null = null
) {
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/backpack/bid/products?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取竞价商品详情
 * GET /api/v4/backpack/bid/products/:bid_product_id
 *
 * @param bid_product_id - 竞价商品ID（BIGINT */
async function getBidProductDetail(bid_product_id: number) {
  if (!bid_product_id) {
    throw new Error('竞价商品ID不能为空')
  }
  return apiClient.request(`/backpack/bid/products/${bid_product_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载竞价详情...',
    showError: true,
    errorPrefix: '获取详情失败：'
  })
}

/**
 * 提交竞价出价
 * POST /api/v4/backpack/bid
 *
 * 后端服务: bid（BidService.placeBid * 业务流程:
 *   1. 资产白名单校验（material_asset_types.is_tradable = true *   2. 悲观锁定竞价商品
 *   3. 金额校验: bid_amount >= current_price + min_bid_increment
 *   4. 旧冻结解冻（用户之前出过价，先解冻旧金额 *   5. 新金额冻 *   6. 更新 bid_records（含幂等idempotency_key *   7. 更新 bid_products.current_price
 *
 * ⚠️ 后端口bid_products.price_asset_code 读取竞价资产类型，无需前端传入 asset_code
 *
 * 响应字段（基bid_records 表）:
 *   - bid_record_id: 出价记录ID
 *   - bid_amount: 出价金额
 *   - previous_highest: 出价前最高价
 *   - is_winning: 是否当前领先
 *
 * @param bid_product_id - 竞价商品ID
 * @param bid_amount - 出价金额
 */
async function placeBid(bid_product_id: number, bid_amount: number) {
  if (!bid_product_id) {
    throw new Error('竞价商品ID不能为空')
  }
  if (!bid_amount || bid_amount <= 0) {
    throw new Error('出价金额必须大于0')
  }
  return apiClient.request('/backpack/bid', {
    method: 'POST',
    data: { bid_product_id, bid_amount },
    needAuth: true,
    showLoading: true,
    loadingText: '提交竞价中...',
    showError: true,
    errorPrefix: '竞价失败：'
  })
}

/**
 * 获取用户竞价历史
 * GET /api/v4/backpack/bid/history
 *
 * @param page - 页码，默
 * @param page_size - 每页数量，默0
 */
async function getBidHistory(page: number = 1, page_size: number = 20) {
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/backpack/bid/history?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

module.exports = {
  getUserInventory,
  getBackpackStats,
  getInventoryItem,
  useInventoryItem,
  redeemInventoryItem,
  getExchangeProducts,
  exchangeProduct,
  getExchangeRecords,
  cancelExchange,
  getExchangeItemDetail,
  getExchangeOrderDetail,
  getExchangeSpaceStats,
  getPremiumStatus,
  unlockPremium,
  getBidProducts,
  getBidProductDetail,
  placeBid,
  getBidHistory
}

export {}
