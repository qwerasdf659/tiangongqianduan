/**
 * 背包系统 + B2C兑换系统 + 竞价系统 API
 * 背包路由: routes/v4/backpack/（双轨结构 assets[] + items[]，仅保留物品查询/核销/使用）
 * 兑换路由（用户域 B2C）: `/api/v4/exchange/*`（Phase 3 迁移完成）
 * 竞价路由（用户域 B2C）: `/api/v4/exchange/bid/*`（Phase 3 迁移完成，从 /backpack/bid/ 移至 /exchange/bid/）
 *
 * 数据库表: items / item_ledger / item_holds（三表模型，2026-02-22 迁移完成）
 *           exchange_items / exchange_records / bid_products / bid_records
 *           account_asset_balances
 *
 * @file 天工餐厅积分系统 - 背包与兑换与竞价API模块
 * @version 6.0.0
 * @since 2026-03-25（Phase 3 路径迁移: /backpack/bid/ → /exchange/bid/）
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 背包 ====================

/**
 * 获取用户背包 双轨结构 assets[] + items[]
 * GET /api/v4/backpack/
 *
 * 响应: { assets: BackpackAsset[], items: BackpackItem[] }
 * assets 来源: account_asset_balances JOIN material_asset_types
 * items 来源: items 表 (status='available')
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
 * 获取物品详情（含 is_owner 标识 + tracking_code）
 * GET /api/v4/backpack/items/:item_id
 *
 * @param item_id - 物品ID（items表主键，BIGINT）
 */
async function getInventoryItem(item_id: number) {
  return apiClient.request(`/backpack/items/${item_id}`, { method: 'GET', needAuth: true })
}

/**
 * 使用物品
 * POST /api/v4/backpack/items/:item_id/use
 * 业务流程: 验证所有权 → status=available → consumeItem(双录: 用户-1, SYSTEM_BURN+1) → items.status→used
 *
 * @param item_id - 物品ID（items表主键，BIGINT）
 */
async function useInventoryItem(item_id: number) {
  const idempotencyKey = `backpack_use_${item_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/backpack/items/${item_id}/use`, {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true
  })
}

/**
 * 生成核销码（到店出示，商家扫码核销）
 * POST /api/v4/backpack/items/:item_id/redeem
 *
 * 响应: { order: { redemption_order_id: UUID, status, expires_at }, code: "ABCD1234EFGH" }
 * ⚠️ redemption_order_id 为 UUID(CHAR(36))，code 明文仅返回一次
 *
 * @param item_id - 物品ID（items表主键，BIGINT）
 */
async function redeemInventoryItem(item_id: number) {
  const idempotencyKey = `backpack_redeem_${item_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/backpack/items/${item_id}/redeem`, {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '生成核销码中...',
    showError: true,
    errorPrefix: '生成失败：'
  })
}

/**
 * 获取物品流转时间线（用户查看自己物品的完整追踪历史）
 * GET /api/v4/backpack/items/:item_id/timeline
 *
 * 后端服务: ItemLifecycleService 通过 items + item_ledger + item_holds 表 JOIN 拼装
 * 权限: 仅返回与当前用户相关的记录（通过JWT Token识别）
 *
 * 响应: { tracking_code, item, origin, timeline[], ledger_check }
 *
 * @param item_id - 物品ID（items表主键，BIGINT）
 */
async function getItemTimeline(item_id: number) {
  if (!item_id) {
    throw new Error('物品ID不能为空')
  }
  return apiClient.request(`/backpack/items/${item_id}/timeline`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载物品追踪...',
    showError: true,
    errorPrefix: '获取追踪失败：'
  })
}

// ==================== 兑换 ====================

/**
 * 获取兑换商品列表
 * GET /api/v4/exchange/items
 *
 * 后端服务: exchange_query（ExchangeQueryService.getMarketItems）
 * 数据库表: exchange_items（字段 exchange_item_id, item_name, cost_asset_code, cost_amount 等）
 *
 * 响应结构: { items: ExchangeItem[], pagination: { page, page_size, total, total_pages }, summary }
 * ⚠️ 后端返回数组字段名是 items，不是 products
 *
 * @param params - 查询参数对象
 * @param params.space - 空间类型: 'lucky'(幸运空间) / 'premium'(臻选空间)
 * @param params.category_id - 商品分类ID（整数，对应 categories.category_id）
 * @param params.keyword - 模糊搜索（匹配 item_name）
 * @param params.status - 商品状态 'active' / 'inactive'，默认 'active'
 * @param params.asset_code - 材料资产代码筛选（'red_core_shard', 'star_stone'）
 * @param params.min_cost - 最低价格筛选
 * @param params.max_cost - 最高价格筛选
 * @param params.stock_status - 库存状态 'in_stock'(>5) / 'low_stock'(1-5)
 * @param params.page - 页码，默认 1
 * @param params.page_size - 每页数量，默认 20，最大 100
 * @param params.sort_by - 排序字段，默认 'sort_order'
 * @param params.sort_order - 排序方向: 'ASC' / 'DESC'
 */
async function getExchangeProducts(
  params: {
    space?: string | null
    category_id?: number | null
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
    /** 排除指定商品ID（用于详情页"相关推荐"排除当前商品） */
    exclude_id?: number | null
    /** 是否返回筛选维度聚合计数（C+++联动计数），后端交叉排除逻辑 */
    with_counts?: boolean
  } = {}
) {
  const {
    space = null,
    category_id = null,
    keyword = null,
    status = 'active',
    asset_code = null,
    min_cost = null,
    max_cost = null,
    stock_status = null,
    page = 1,
    page_size = 20,
    sort_by = null,
    sort_order = null,
    exclude_id = null,
    with_counts = false
  } = params

  const qs = buildQueryString({
    space,
    category_id,
    keyword,
    status,
    asset_code,
    min_cost,
    max_cost,
    stock_status,
    page,
    page_size,
    sort_by,
    sort_order,
    exclude_id,
    with_counts: with_counts ? 'true' : null
  })
  return apiClient.request(`/exchange/items?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 执行商品兑换（全量SKU模式）
 * POST /api/v4/exchange
 *
 * 后端服务: exchange_core（CoreService.exchangeItem）
 * 业务流程: 幂等键校验 → 商品状态校验 → SKU库存校验 → BalanceService扣减资产 → SKU库存扣减 → 创建exchange_records
 * 全流程在 TransactionManager.execute() 事务中
 *
 * 全量SKU模式说明（v4.0 Phase 0）:
 *   所有商品统一走 exchange_item_skus 表，单品商品有一个默认SKU（spec_values: {}）
 *   - 单品（skus.length === 1 且 spec_values 为 {}）: 前端自动选中默认SKU
 *   - 多规格（skus.length > 1）: 用户选择具体规格后传入 sku_id
 *   - 后端会根据 sku_id 扣减对应SKU的库存和价格
 *
 * 响应字段: { order_no, exchange_item_id, quantity, pay_asset_code, pay_amount, status, exchange_time }
 *
 * @param exchange_item_id - 兑换商品ID（BIGINT，exchange_items 表主键）
 * @param quantity - 兑换数量，默认 1
 * @param sku_id - SKU ID（BIGINT，exchange_item_skus 表主键），单品商品传默认SKU的ID
 */
async function exchangeProduct(exchange_item_id: number, quantity: number = 1, sku_id?: number) {
  if (!exchange_item_id) {
    throw new Error('兑换商品ID不能为空')
  }
  if (quantity < 1) {
    throw new Error('兑换数量必须大于0')
  }

  const idempotencyKey = `exchange_${exchange_item_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  const requestData: Record<string, any> = {
    exchange_item_id,
    quantity
  }

  /**
   * 全量 SKU 模式: 请求体须带 sku_id（单品为唯一默认 SKU 的 id）
   * 幂等键仅放在 Header（Idempotency-Key），不得放入 body
   */
  if (typeof sku_id === 'number' && sku_id > 0) {
    requestData.sku_id = sku_id
  }

  return apiClient.request('/exchange', {
    method: 'POST',
    data: requestData,
    header: {
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
 * GET /api/v4/exchange/orders
 *
 * 订单状态枚举（9态，Phase 3 扩展后）:
 *   pending    - 待审核
 *   approved   - 审核通过
 *   shipped    - 已发货
 *   received   - 已收货（用户确认或7天自动确认）
 *   rated      - 已评价
 *   rejected   - 审核拒绝
 *   refunded   - 已退款
 *   cancelled  - 已取消
 *   completed  - 已完成
 *
 * @param page - 页码，默认 1
 * @param page_size - 每页数量，默认 20
 * @param status - 订单状态筛选
 */
async function getExchangeRecords(
  page: number = 1,
  page_size: number = 20,
  status: string | null = null
) {
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/exchange/orders?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 取消兑换订单（退还资产）
 * POST /api/v4/exchange/orders/:order_no/cancel
 *
 * @param order_no - 订单号（exchange_records.order_no，VARCHAR(50) UNIQUE）
 */
async function cancelExchange(order_no: string) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }

  const idempotencyKey = `exchange_cancel_${order_no}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/exchange/orders/${order_no}/cancel`, {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '取消订单中...',
    showError: true,
    errorPrefix: '取消失败：'
  })
}

/**
 * 获取兑换商品详情
 * GET /api/v4/exchange/items/:exchange_item_id
 *
 * @param exchange_item_id - 兑换商品ID（exchange_items.exchange_item_id）
 */
async function getExchangeItemDetail(exchange_item_id: number | string) {
  if (!exchange_item_id) {
    throw new Error('商品ID不能为空')
  }
  return apiClient.request(`/exchange/items/${exchange_item_id}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 获取兑换订单详情
 * GET /api/v4/exchange/orders/:order_no
 *
 * @param order_no - 订单号（exchange_records.order_no）
 */
async function getExchangeOrderDetail(order_no: string) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }
  return apiClient.request(`/exchange/orders/${order_no}`, {
    method: 'GET',
    needAuth: true
  })
}

// ==================== 确认收货（Phase 3：积分商城发货单追踪） ====================

/**
 * 确认收货（用户手动 / 发货后7天系统自动确认）
 * POST /api/v4/exchange/orders/:order_no/confirm-receipt
 *
 * 后端服务: exchange_core（CoreService.confirmReceipt）
 * 状态流转: shipped → received（auto_confirmed=false 手动确认）
 * 系统自动: shipped 且 shipped_at + 7天 < NOW() → received（auto_confirmed=true）
 *
 * 响应字段:
 *   order_no      - 订单号
 *   status        - 更新后状态（received）
 *   received_at   - 确认收货时间（YYYY-MM-DD HH:mm:ss 北京时间）
 *
 * ⚠️ 此API需要后端 Phase 3 实施完成后才可调用
 *    后端需完成: exchange_records ENUM 扩展 + confirm-receipt 路由
 *
 * @param order_no - 订单号（exchange_records.order_no，VARCHAR(50) UNIQUE）
 */
async function confirmExchangeReceipt(order_no: string) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }

  const idempotencyKey = `exchange_confirm_${order_no}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/exchange/orders/${order_no}/confirm-receipt`, {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '确认收货中...',
    showError: true,
    errorPrefix: '确认收货失败：'
  })
}

/**
 * 评价兑换订单
 * POST /api/v4/exchange/orders/:order_no/rate
 *
 * 后端服务: exchange_core（CoreService.rateOrder）
 * 状态流转: received → rated（评价后不可修改）
 * 数据库字段: rating(TINYINT 1-5), rated_at(DATETIME) — 已存在于数据库
 *
 * 响应字段:
 *   order_no   - 订单号
 *   status     - 更新后状态（rated）
 *   rating     - 评价分数
 *   rated_at   - 评价时间
 *
 * ⚠️ 此API需要后端 Phase 3 状态扩展完成后才可调用
 *
 * @param order_no - 订单号
 * @param rating - 评价分数（1-5，1=非常差 5=非常好）
 */
async function rateExchangeOrder(order_no: string, rating: number) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }
  if (!rating || rating < 1 || rating > 5) {
    throw new Error('评价分数必须在1-5之间')
  }
  const idempotencyKey = `exchange_rate_${order_no}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/exchange/orders/${order_no}/rate`, {
    method: 'POST',
    data: { rating },
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '提交评价中...',
    showError: true,
    errorPrefix: '评价失败：'
  })
}

// ==================== 物流查询（Phase 4：快递100+快递鸟双通道） ====================

/**
 * 查询兑换订单物流轨迹
 * GET /api/v4/exchange/orders/:order_no/track
 *
 * 后端服务: ShippingTrackService（快递100主通道 + 快递鸟备用通道，自动降级）
 * 缓存策略: Redis TTL 10分钟（已签收延长到24小时）
 *
 * 响应字段:
 *   has_shipping          - boolean 是否有快递信息
 *   shipping_company_name - string 快递公司名称（如 "顺丰速运"）
 *   shipping_no           - string 快递单号
 *   track                 - object 物流轨迹数据
 *     success             - boolean 查询是否成功
 *     state               - string 统一状态: in_transit / delivering / delivered / returned
 *     tracks              - array 轨迹节点数组（按时间倒序）
 *       time              - string 时间（如 "2026-03-16 14:30"）
 *       status            - string 节点状态
 *       detail            - string 轨迹详情
 *
 * ⚠️ 用户端与运营端须分别注册：GET /api/v4/exchange/orders/:order_no/track（小程序）
 *    运营端参考：GET /api/v4/console/exchange/orders/:order_no/track（与 marketplace-stats-api 路由拆分一致）
 *
 * @param order_no - 订单号（exchange_records.order_no，VARCHAR(50) UNIQUE）
 */
async function getExchangeOrderTrack(order_no: string) {
  if (!order_no) {
    throw new Error('订单号不能为空')
  }
  return apiClient.request(`/exchange/orders/${order_no}/track`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '查询物流中...',
    showError: true,
    errorPrefix: '物流查询失败：'
  })
}

// ==================== 空间统计 ====================

/**
 * 获取兑换空间统计数据
 * GET /api/v4/exchange/space-stats
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
  return apiClient.request(`/exchange/space-stats?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

// ==================== 臻选空间（高级兑换） ====================

/**
 * 查询臻选空间解锁状态
 * GET /api/v4/exchange/premium-status
 *
 * 后端服务: premium（PremiumService.getPremiumStatus * 数据来源: PremiumService 服务层计算返回（️ user_premium_statuses 表不存在） *
 * 已解锁时响应字段:
 * - unlocked: true 当前已解锁（⚠️ 不是 is_unlocked）
 * - is_valid: boolean 是否在有效期内
 * - unlock_cost: 100 解锁花费（积分）
 * - validity_hours: 24 有效期（小时）
 * - remaining_hours: number 剩余有效时间（小时）（不返回 expires_at）
 * - total_unlock_count: number 累计解锁次数
 *
 * 未解锁时响应字段:
 *   - unlocked: false 当前未解锁
 *   - is_expired: boolean 是否已过期
 *   - can_unlock: boolean 是否满足解锁条件
 *   - unlock_cost: 100 解锁花费（积分）
 *   - validity_hours: 24 有效期（小时）
 *   - conditions: object 解锁条件详情
 */
async function getPremiumStatus() {
  return apiClient.request('/exchange/premium-status', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 解锁臻选空间
 * POST /api/v4/exchange/unlock-premium
 *
 * 后端服务: premium（PremiumService.unlockPremium）
 * 业务规则:
 *   1. users.history_total_points >= 100000（历史累计门槛）
 *   2. points 可用余额 >= 100（通过 BalanceService.changeBalance 扣减）
 *   3. 已解锁且未过期时拒绝重复解锁
 *   4. 解锁有效24小时
 *   5. 全流程在 TransactionManager.execute() 事务中
 */
async function unlockPremium() {
  const idempotencyKey = `unlock_premium_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request('/exchange/unlock-premium', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '解锁中...',
    showError: true,
    errorPrefix: '解锁失败：'
  })
}

// ==================== 竞价系统（bid域） ====================

/**
 * 获取竞价商品列表
 * GET /api/v4/exchange/bid/products
 *
 * 后端服务: bid_query（BidQueryService）
 * 数据库表: bid_products（关联 exchange_items）
 *
 * 竞价状态枚举（7态）: pending / active / ended / settled / no_bid / cancelled / settlement_failed
 *
 * 响应字段（基于 bid_products 表）:
 *   - bid_product_id: BIGINT PK
 *   - exchange_item_id: BIGINT FK
 *   - start_price: BIGINT（起拍价，不是 starting_price）
 *   - current_price: BIGINT（当前最高出价）
 *   - min_bid_increment: BIGINT（最小加价幅度）
 *   - price_asset_code: VARCHAR(50)（竞价资产类型，默认 star_stone，不是 asset_code）
 *   - status: ENUM（7态）
 *   - start_time / end_time: DATETIME
 *   - bid_count: INT
 *   - winner_user_id: INT（当前最高出价者，⚠️ 不是 highest_bidder_id）
 *
 * @param page - 页码，默认 1
 * @param page_size - 每页数量，默认 20
 * @param status - 竞价状态筛选（active/pending/ended/settled/no_bid/all），默认 'active'
 */
async function getBidProducts(
  page: number = 1,
  page_size: number = 20,
  status: string | null = null
) {
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/exchange/bid/products?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取竞价商品详情
 * GET /api/v4/exchange/bid/products/:bid_product_id
 *
 * @param bid_product_id - 竞价商品ID（BIGINT）
 */
async function getBidProductDetail(bid_product_id: number) {
  if (!bid_product_id) {
    throw new Error('竞价商品ID不能为空')
  }
  return apiClient.request(`/exchange/bid/products/${bid_product_id}`, {
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
 * POST /api/v4/exchange/bid
 *
 * 后端服务: bid（BidService.placeBid）
 * 业务流程:
 *   1. 资产白名单校验（material_asset_types.is_tradable = true）
 *   2. 悲观锁定竞价商品
 *   3. 金额校验: bid_amount >= current_price + min_bid_increment
 *   4. 旧冻结解冻（用户之前出过价，先解冻旧金额）
 *   5. 新金额冻结
 *   6. 更新 bid_records（含幂等键 idempotency_key）
 *   7. 更新 bid_products.current_price
 *
 * ⚠️ 后端从 bid_products.price_asset_code 读取竞价资产类型，无需前端传入 asset_code
 *
 * 响应字段（基于 bid_records 表）:
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

  const idempotencyKey = `bid_${bid_product_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request('/exchange/bid', {
    method: 'POST',
    data: { bid_product_id, bid_amount },
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: true,
    loadingText: '提交竞价中...',
    showError: true,
    errorPrefix: '竞价失败：'
  })
}

/**
 * 获取用户竞价历史
 * GET /api/v4/exchange/bid/history
 *
 * @param page - 页码，默认 1
 * @param page_size - 每页数量，默认 20
 */
async function getBidHistory(page: number = 1, page_size: number = 20) {
  const qs = buildQueryString({ page, page_size })
  return apiClient.request(`/exchange/bid/history?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 刷新核销码动态QR码（HMAC签名，5分钟有效）
 * POST /api/v4/backpack/items/:item_id/redeem/refresh-qr
 *
 * 后端服务: RedemptionQRSigner.js（独立于消费录入QR系统 QRCodeValidator.js）
 * QR码格式: RQRV1_{base64(JSON)}_{hmac_sha256_signature}
 * 密钥: REDEMPTION_QR_SECRET（独立于 CONSUMPTION_QR_SECRET）
 *
 * 响应字段:
 *   qr_payload   - RQRV1_前缀的动态QR码内容（含HMAC签名）
 *   qr_expires_at - QR码过期时间（ISO8601，5分钟有效）
 *   text_code    - 12位Base32文本码（备用，不变）
 *
 * @param item_id - 物品ID（items表主键，BIGINT，必须有已生成的pending状态核销订单）
 */
async function refreshRedemptionQR(item_id: number) {
  if (!item_id) {
    throw new Error('物品ID不能为空')
  }

  const idempotencyKey = `redeem_refresh_${item_id}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  return apiClient.request(`/backpack/items/${item_id}/redeem/refresh-qr`, {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: 'QR码刷新失败：'
  })
}

module.exports = {
  getUserInventory,
  getBackpackStats,
  getInventoryItem,
  useInventoryItem,
  redeemInventoryItem,
  refreshRedemptionQR,
  getItemTimeline,
  getExchangeProducts,
  exchangeProduct,
  getExchangeRecords,
  cancelExchange,
  getExchangeItemDetail,
  getExchangeOrderDetail,
  getExchangeOrderTrack,
  confirmExchangeReceipt,
  rateExchangeOrder,
  getExchangeSpaceStats,
  getPremiumStatus,
  unlockPremium,
  getBidProducts,
  getBidProductDetail,
  placeBid,
  getBidHistory
}
