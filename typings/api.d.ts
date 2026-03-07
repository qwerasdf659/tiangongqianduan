/**
 * 🌐 API响应类型声明
 *
 * 定义后端API统一响应格式和各业务模块的响应数据类型
 * 所有API交互字段使用snake_case命名（与后端一致）
 *
 * @file 天工餐厅积分系统 - API类型定义
 * @version 5.2.0
 * @since 2026-02-10
 */

declare namespace API {
  // ===== 统一响应格式 =====

  /** V4.0统一API响应格式 */
  interface ApiResponse<T = any> {
    /** 请求是否成功 */
    success: boolean
    /** 响应数据 */
    data?: T
    /** 响应消息 */
    message?: string
    /** 业务错误码 */
    code?: string
  }

  /** 分页信息结构（对齐后端实际返回格式） */
  interface Pagination {
    /** 当前页码 */
    page: number
    /** 每页条数 */
    page_size: number
    /** 记录总数 */
    total: number
    /** 总页数 */
    total_pages: number
  }

  /** 带分页的响应数据 */
  interface PaginatedData<T> {
    items: T[]
    pagination: Pagination
  }

  // ===== 认证系统 =====

  /**
   * 登录平台标识（多平台会话隔离）
   * 后端根据此字段将不同平台的登录会话隔离，同平台新登录替换旧会话，跨平台互不影响
   */
  type LoginPlatform = 'wechat_mp' | 'douyin_mp' | 'alipay_mp' | 'web' | 'app'

  /** 登录请求参数 - POST /api/v4/auth/login */
  interface LoginRequest {
    /** 手机号（11位，1开头） */
    mobile: string
    /** 短信验证码（6位数字） */
    verification_code: string
    /** 登录平台标识，微信小程序固定传 'wechat_mp'（用于多平台会话隔离） */
    platform: LoginPlatform
  }

  /** 登录响应数据 — 对齐后端 POST /api/v4/auth/login 实际返回格式 */
  interface LoginData {
    /** JWT访问令牌 */
    access_token: string
    /** 刷新令牌（用于 POST /api/v4/auth/refresh） */
    refresh_token: string
    /** 用户资料（users表 + RBAC角色系统） */
    user: UserProfile
    /** 是否为新注册用户（首次登录自动注册时为true） */
    is_new_user: boolean
    /** Token有效期（秒），默认604800（7天） */
    expires_in: number
  }

  /**
   * 用户资料（对齐后端 GET /api/v4/auth/profile 响应，数据来源: users 表 + RBAC角色系统）
   * 管理员判断: role_level >= 100（UUID角色系统）
   * ⚠️ 后端不返回 user_level 字段，角色判断使用 role_level + roles
   */
  interface UserProfile {
    /** 用户ID（INT PK） */
    user_id: number
    /** 手机号（脱敏为 136****7930 格式，STRING(20)） */
    mobile: string
    /** 昵称（STRING） */
    nickname: string
    /** 角色等级（>= 100 为管理员，来自UUID角色系统） */
    role_level: number
    /** 角色列表（登录响应返回，JWT恢复时可能缺失） */
    roles?: string[]
    /** 用户状态: active / inactive / banned */
    status: string
    /** 连续低档次数（保底机制计数器，非"未中奖"，后端登录响应返回，JWT恢复时可能缺失） */
    consecutive_fail_count?: number
    /** 历史累计积分（用于臻选空间解锁门槛判断，登录响应返回，JWT恢复时可能缺失） */
    history_total_points?: number
    /** 创建时间（ISO8601 北京时间） */
    created_at: string
    /** 最后登录时间（登录响应返回，JWT恢复时可能缺失） */
    last_login?: string
    /** 登录次数（登录响应返回，JWT恢复时可能缺失） */
    login_count?: number
    /** 头像URL（登录响应返回，profile接口可能不返回） */
    avatar_url?: string
    /**
     * 用户角色名称（部分接口可能直接返回）
     *
     * ⚠️ 后端 JWT 和登录响应均不包含 is_admin、user_uuid 字段：
     * - 管理员判断统一使用 role_level >= 100（对齐后端 authenticateToken）
     * - user_uuid 仅后端内部使用（QR码生成），前端不需要
     */
    user_role?: string
  }

  /** Token验证响应（GET /api/v4/auth/verify） */
  interface VerifyTokenData {
    valid: boolean
    user: UserProfile
  }

  // ===== 抽奖系统 =====

  /**
   * 奖品信息（后端 DataSanitizer.sanitizePrizes 输出，public级别）
   *
   * 字段对齐后端实际返回格式（2026-02-22 DataSanitizer 主键规范化后）：
   * - prize_id: 剥离 lottery_ 模块前缀（数据库主键 lottery_prize_id）
   * - image: 有图片时为 PrizeImage 对象，无图片时为 null（emoji兜底）
   * - icon 字段已移除（后端不再返回，前端根据 prize_type 自行生成 emoji）
   */
  interface Prize {
    /** 奖品ID（剥离 lottery_ 前缀，数据库主键 lottery_prize_id） */
    prize_id: number
    /** 奖品名称 */
    prize_name: string
    /** 奖品类型: points/physical/virtual/coupon/service */
    prize_type: string
    /** 奖品数值（积分数/面值等） */
    prize_value: number
    /** 稀有度代码（5级: common/uncommon/rare/epic/legendary） */
    rarity_code: string
    /** 展示排序权重 */
    sort_order: number
    /** 奖励层级: low/mid/high/fallback（对齐数据库 lottery_prizes.reward_tier 实际枚举值，所有值均代表中奖） */
    reward_tier: string
    /** 状态: active / inactive */
    status: string
    /** 图片资源ID（关联 image_resources 表，可为 null） */
    image_resource_id: number | null
    /**
     * 奖品图片对象（DataSanitizer 通过 ImageUrlHelper 生成完整URL）
     * 有图片时: { image_resource_id, url, mime, thumbnail_url }
     * 无图片时: null（前端使用 PRIZE_ICON_MAP[prize_type] emoji 兜底）
     */
    image: PrizeImage | null
    /** 材料资产代码（如 CRYSTAL） */
    material_asset_code: string
    /** 材料数量 */
    material_amount: number
    /**
     * 是否为兜底奖品（保底奖品标记）
     * true 时前端用降低饱和度 + "保底"角标区分展示
     * ⚠️ 需后端在 /lottery/campaigns/:code/prizes 接口中返回此字段
     */
    is_fallback?: boolean
    /**
     * 剩余库存数量
     * 0 时前端显示"已抢光"遮罩
     * ⚠️ 需后端在 /lottery/campaigns/:code/prizes 接口中返回此字段
     */
    stock_quantity?: number
  }

  /** 奖品关联图片（Sealos 对象存储公网URL） */
  interface PrizeImage {
    /** 图片资源ID（image_resources.image_resource_id） */
    image_resource_id: number
    /** 图片完整公网URL（Sealos 对象存储直连） */
    url: string
    /** MIME 类型（如 image/jpeg） */
    mime: string
    /** 缩略图URL（可为 null） */
    thumbnail_url: string | null
  }

  /** 抽奖配置（对齐后端 GET /api/v4/lottery/campaigns/:code/config 响应） */
  interface LotteryConfig {
    campaign_code: string
    campaign_name: string
    status: string
    /** 单抽基础定价（折扣前），由后端 LotteryPricingService 驱动 */
    base_cost: number
    /** 单抽实际花费（折扣后），用于积分不足判断和单抽价格展示 */
    per_draw_cost: number
    max_draws_per_user_daily: number
    draw_buttons: DrawButton[]
    /** 保底（Pity）信息 — 后端 config 接口 pity_info 字段 */
    pity_info: PityInfo | null
  }

  /** 抽奖按钮配置 */
  interface DrawButton {
    draw_count: number
    discount: number
    label: string
    per_draw: number
    total_cost: number
    original_cost: number
    saved_points: number
  }

  /** 保底（Pity）信息 — 对应后端 pity 系统（非旧版 guarantee） */
  interface PityInfo {
    exists: boolean
    pity_enabled: boolean
    guarantee_threshold: number
    current_pity: number
    remaining: number
    description: string
  }

  /** 抽奖结果（单抽和连抽统一结构） */
  interface DrawResult {
    campaign_code: string
    lottery_session_id: string
    prizes: Prize[]
    total_points_cost: number
    original_cost: number
    discount: number
    saved_points: number
    remaining_balance: number
    draw_count: number
    draw_type: string
    pity_info?: PityInfo | null
  }

  // ===== 资产系统 =====

  /** 资产余额（对齐后端 GET /api/v4/assets/balance 响应） */
  interface AssetBalance {
    asset_code: string
    available_amount: number
    frozen_amount: number
    total_amount: number
  }

  /**
   * 今日资产汇总（对齐后端 GET /api/v4/assets/today-summary 响应）
   *
   * 后端服务: AssetQueryService.getTodaySummary({ user_id, asset_code })
   * SQL逻辑: delta_amount > 0 汇总为 today_earned，delta_amount < 0 绝对值汇总为 today_consumed
   * 时间范围: 北京时间当日 00:00:00 ~ 23:59:59（BeijingTimeHelper.todayStart/todayEnd）
   * 统计范围: 覆盖所有 business_type（不限于抽奖）
   */
  interface TodaySummary {
    /** 资产代码（POINTS / DIAMOND / red_shard 等） */
    asset_code: string
    /** 今日获得总额（当日所有 delta_amount > 0 的交易合计） */
    today_earned: number
    /** 今日消费总额（当日所有 delta_amount < 0 的交易绝对值合计） */
    today_consumed: number
    /** 今日交易笔数 */
    transaction_count: number
  }

  /**
   * 资产交易记录（对齐后端 GET /api/v4/assets/transactions 路由层输出）
   *
   * 后端数据来源: routes/v4/assets/transactions.js 第 61-76 行 map 输出
   * delta_amount 正数=获得(earn)，负数=消费(consume)
   */
  interface AssetTransaction {
    /** 交易流水ID（BIGINT PK，对齐后端字段 asset_transaction_id） */
    asset_transaction_id: number
    /** 资产代码（POINTS / DIAMOND / red_shard 等） */
    asset_code: string
    /** 变动金额（正数=增加/earn，负数=扣减/consume），后端字段名为 delta_amount */
    delta_amount: number
    /** 变动前余额 */
    balance_before: number
    /** 变动后余额 */
    balance_after: number
    /** 业务类型枚举（lottery_consume / lottery_reward / exchange_debit / consumption_reward 等） */
    business_type: string
    /** 交易描述（来自后端 meta.description，约91.2%覆盖率，可为null） */
    description: string | null
    /** 交易标题（来自后端 meta.title，约79.2%覆盖率，可为null） */
    title: string | null
    /** 创建时间（ISO 8601 格式） */
    created_at: string
  }

  // ===== 背包系统 =====

  /** 背包数据（双轨结构） */
  interface BackpackData {
    assets: BackpackAsset[]
    items: BackpackItem[]
  }

  /**
   * 背包可叠加资产（对齐后端 GET /api/v4/backpack/ 的 assets[] 返回格式）
   * 示例: DIAMOND(钻石)、red_shard(红水晶碎片)
   */
  interface BackpackAsset {
    /** 资产类型编码（如 DIAMOND, red_shard） */
    asset_code: string
    /** 资产中文名称 */
    display_name: string
    /** 资产总数量（含冻结） */
    total_amount: number
    /** 冻结数量（交易中锁定的数量） */
    frozen_amount: number
    /** 可用数量（total_amount - frozen_amount） */
    available_amount: number
    /** 资产分类（currency / red 等） */
    category: string
    /** 稀有度编码（common / uncommon / rare / epic / legendary） */
    rarity: string
    /** 稀有度中文名（后端自动附加） */
    rarity_display: string
    /** 稀有度颜色（可为null） */
    rarity_color: string | null
    /** 是否可在交易市场上架（true=可交易，false=不可交易） */
    is_tradable: boolean
  }

  /**
   * 背包不可叠加物品（对齐后端三表模型 items 表 + GET /api/v4/backpack/ 的 items[] 返回格式）
   *
   * 三表模型迁移（2026-02-22 完成）:
   *   旧表 item_instances → 新表 items（独立一等实体）
   *   旧字段 item_instance_id → 新字段 item_id
   *   旧字段 meta.name → 正式列 item_name
   *   旧字段 meta.value → 正式列 item_value
   *   旧字段 meta.description → 正式列 item_description
   *   新增字段: tracking_code（人类可读追踪码，如 LT260219028738）
   *   新增字段: prize_definition_id（关联奖品定义）
   *   状态变更: locked → held, transferred 已消除
   *
   * 背包列表只返回 status='available' 的物品
   */
  interface BackpackItem {
    /** 物品唯一ID（items表主键，BIGINT） */
    item_id: number
    /** 追踪码（人类可读，格式: {来源2位}{YYMMDD}{item_id补零6位}，如 LT260219028738） */
    tracking_code: string
    /** 物品类型编码（prize/product/voucher/tradable_item/service） */
    item_type: string
    /** 物品类型中文名（后端自动附加） */
    item_type_display: string
    /** 物品名称（items表正式列，原 meta.name） */
    item_name: string
    /** 物品价值（积分计，items表正式列，原 meta.value） */
    item_value: number
    /** 物品状态编码（available/held/used/expired/destroyed） */
    status: string
    /** 物品状态中文名（后端自动附加） */
    status_display: string
    /** 稀有度编码（common/uncommon/rare/epic/legendary） */
    rarity_code: string
    /** 稀有度中文名（后端自动附加） */
    rarity_display: string
    /** 稀有度颜色十六进制值（后端自动附加，来源 system_dictionaries） */
    rarity_color: string | null
    /** 物品描述（items表正式列，原 meta.description） */
    item_description: string
    /** 来源奖品定义ID（关联 lottery_prizes 表，可为 null） */
    prize_definition_id: number | null
    /** 获得时间（YYYY-MM-DD HH:mm:ss 格式） */
    acquired_at: string
    /** 过期时间（可为 null） */
    expires_at: string | null
    /** 是否为当前用户所有（详情接口返回） */
    is_owner?: boolean
    /** 是否已生成核销码 */
    has_redemption_code: boolean
    /**
     * 后端根据 item_type 和 system_configs(item_type_action_rules) 计算的允许操作列表
     * 可能值: 'use'(直接使用) / 'redeem'(生成核销码) / 'sell'(上架交易市场)
     * 业务规则（后端权威）:
     *   product   → ["redeem", "sell"]   实物商品需到店核销
     *   voucher   → ["redeem", "sell"]   兑换券需到店核销
     *   prize     → ["redeem"]           奖品不可交易（防刷号倒卖）
     *   service   → ["use"]             线上权益直接激活
     *   tradable_item → ["use", "sell"]  虚拟道具可用可交易
     */
    allowed_actions: string[]
    /**
     * 商家ID（多商家架构 P1，来源: items 表 LEFT JOIN merchants 表）
     * 标识该物品由哪个商家/游戏发放，可为 null（系统发放的物品无商家归属）
     */
    merchant_id: number | null
    /**
     * 商家名称（多商家架构 P1，来源: merchants.merchant_name）
     * 用于前端展示"来自：XX商家"标签，可为 null
     */
    merchant_name: string | null
  }

  /**
   * 物品流转时间线（用户端 GET /api/v4/backpack/items/:item_id/timeline 响应）
   * 后端通过 items + item_ledger + item_holds 表 JOIN 拼装完整流转历史
   */
  interface ItemTimeline {
    /** 追踪码（如 LT260219028738） */
    tracking_code: string
    /** 物品基础信息 */
    item: {
      item_id: number
      item_name: string
      item_type: string
      rarity_code: string
      status: string
    }
    /** 来源信息 */
    origin: {
      /** 来源类型: lottery / bid_settlement / exchange / admin */
      source: string
      /** 来源关联ID（如 lottery_draw_id） */
      source_ref_id: string | null
    }
    /** 时间线事件列表（按时间正序） */
    timeline: ItemTimelineEvent[]
    /** 账本守恒验证（SUM(delta)=0 表示数据一致） */
    ledger_check: {
      sum_delta: number
      status: 'balanced' | 'imbalanced'
    }
  }

  /** 物品时间线单个事件 */
  interface ItemTimelineEvent {
    /** 事件时间（ISO8601 北京时间） */
    time: string
    /** 事件类型: mint / transfer / use / hold / release / expire */
    event: string
    /** 事件描述（中文，后端生成） */
    detail: string
  }

  // ===== 兑换系统 =====

  /**
   * 兑换商品（对齐后端 exchange_items 表 + GET /api/v4/backpack/exchange/items 响应）
   * 后端使用多币种支付模型: cost_asset_code + cost_amount
   * 图片通过 primary_image_id 关联 image_resources 表
   */
  interface ExchangeProduct {
    /** 商品主键（exchange_items.exchange_item_id） */
    exchange_item_id: number
    /** 商品名称（DataSanitizer 输出 name，数据库字段 item_name） */
    name: string
    /** 商品描述（TEXT） */
    description: string
    /** 支付资产代码（如 red_shard、DIAMOND、POINTS） */
    cost_asset_code: string
    /** 支付资产数量（BIGINT） */
    cost_amount: number
    /** 原价（用于展示折扣，可为null） */
    original_price: number | null
    /** 库存数量 */
    stock: number
    /** 已售数量 */
    sold_count: number
    /** 分类编码（关联 category_defs.category_code） */
    category: string
    /** 空间类型: lucky(幸运空间) / premium(臻选空间) */
    space: string
    /** 排序权重 */
    sort_order: number
    /** 状态: active / inactive */
    status: string
    /** 主图ID（关联 image_resources 表，可为null） */
    primary_image_id: number | null
    /** 标签数组（JSON） */
    tags: string[]
    /** 是否热销 */
    is_hot: boolean
    /** 是否新品 */
    is_new: boolean
    /** 是否幸运商品 */
    is_lucky: boolean
    /** 是否限量商品（触发旋转边框特效） */
    is_limited: boolean
    /** 稀有度代码（5级: common/uncommon/rare/epic/legendary，后端 B8 新增列） */
    rarity_code: string
    /** 是否有保修 */
    has_warranty: boolean
    /** 是否包邮 */
    free_shipping: boolean
    /** 商品卖点（VARCHAR(200)） */
    sell_point: string
    /** 创建时间 */
    created_at: string
  }

  /**
   * 兑换订单记录（对齐后端 exchange_records 表 + GET /api/v4/backpack/exchange/orders 响应）
   *
   * Phase 3 状态扩展后完整流转:
   *   pending(待审核) → approved(审核通过) → shipped(已发货) → received(已收货) → rated(已评价)
   *                   → rejected(审核拒绝) → refunded(已退款)
   *                   → cancelled(用户取消)
   */
  interface ExchangeOrder {
    /** 记录ID（BIGINT PK） */
    exchange_record_id: number
    /** 订单号（VARCHAR(50) UNIQUE） */
    order_no: string
    /** 关联兑换商品ID */
    exchange_item_id: number
    /** 支付资产代码 */
    pay_asset_code: string
    /** 支付金额 */
    pay_amount: number
    /** 兑换数量 */
    quantity: number
    /** 订单状态（Phase 3 扩展） */
    status:
      | 'pending'
      | 'approved'
      | 'shipped'
      | 'received'
      | 'rated'
      | 'rejected'
      | 'refunded'
      | 'cancelled'
    /** 来源（默认 'exchange'） */
    source: string
    /** 商品快照（JSON，兑换时冻结的商品信息副本，字段来自 exchange_items 表） */
    item_snapshot: {
      /** 商品名称（DataSanitizer 输出 name） */
      name: string
      /** 商品描述 */
      description?: string
      /** 支付资产代码 */
      cost_asset_code?: string
      /** 支付金额 */
      cost_amount?: number
      /** 商品分类 */
      category?: string
    }
    /** 兑换时间 */
    created_at: string
    /** 发货时间（shipped 状态后由后端填充） */
    shipped_at?: string
    /** 确认收货时间（received 状态后由后端填充） */
    received_at?: string
    /** 是否系统自动确认（7天未操作自动确认为true） */
    auto_confirmed?: boolean
    /** 评价分数（1-5，rated 状态后可用，数据库已有字段 rating TINYINT） */
    rating?: number
    /** 评价时间（数据库已有字段 rated_at DATETIME） */
    rated_at?: string
  }

  /**
   * C2C交易担保码信息（Phase 4：担保交易码）
   * 仅 listing_kind = 'item' 的实物交易使用
   * fungible_asset 交易自动完成，不需要担保码
   */
  interface EscrowCodeInfo {
    /** 6位数字担保码（如 582917） */
    escrow_code: string
    /** 担保码过期时间（ISO8601，Redis存储30分钟有效） */
    expires_at: string
    /** 关联的交易订单ID */
    trade_order_id: number
    /** 交易订单状态 */
    status: string
  }

  /**
   * 兑换空间统计数据（后端 GET /api/v4/backpack/exchange/space-stats 响应）
   * 空间类型: 'lucky'(幸运空间) / 'premium'(臻选空间)
   * ⚠️ 统计数据由后端计算返回，前端不自行统计
   */
  interface ExchangeSpaceStats {
    /** 空间类型: 'lucky' | 'premium' */
    space: string
    /** 新品数量 */
    new_count: number
    /** 热销数量 */
    hot_count: number
    /** 平均折扣率 */
    avg_discount: number
    /** 限时特价数量 */
    flash_deals: number
    /** 平均评分 */
    avg_rating: number
    /** 趋势商品数量 */
    trending_count: number
    /** 商品总数 */
    total_count: number
  }

  // ===== 竞价系统 =====

  /**
   * 竞价商品（后端 bid_products 表，7态状态机）
   * 状态流转: pending → active → settled/no_bid/cancelled
   * 后端API: GET /api/v4/backpack/bid/products
   */
  interface BidProduct {
    /** 竞价商品ID（主键） */
    bid_product_id: number
    /** 关联的兑换商品ID（exchange_items表） */
    exchange_item_id: number
    /** 商品名称 */
    name: string
    /** 商品描述 */
    description: string
    /** 商品图片URL */
    image_url: string
    /** 商品分类 */
    category: string
    /** 起拍价（BIGINT，最低出价金额） */
    start_price: number
    /** 当前最高出价（BIGINT） */
    current_price: number
    /** 最小加价幅度（BIGINT） */
    min_bid_increment: number
    /** 竞价使用的资产类型编码（如 DIAMOND、red_shard） */
    price_asset_code: string
    /** 竞价状态（7态）: pending/active/ended/settled/no_bid/cancelled/settlement_failed */
    status: string
    /** 竞价开始时间 */
    start_time: string
    /** 竞价结束时间 */
    end_time: string
    /** 当前出价人数 */
    bid_count: number
    /** 当前最高出价者用户ID（可为null） */
    winner_user_id: number | null
    /** 创建时间 */
    created_at: string
    /** 更新时间 */
    updated_at: string
  }

  /**
   * 竞价出价记录（后端 bid_records 表，含幂等键+冻结流水）
   * 后端API: GET /api/v4/backpack/bid/history
   */
  interface BidRecord {
    /** 出价记录ID（主键） */
    bid_record_id: number
    /** 关联的竞价商品ID */
    bid_product_id: number
    /** 出价用户ID */
    user_id: number
    /** 出价金额 */
    bid_amount: number
    /** 竞价使用的资产类型编码 */
    asset_code: string
    /** 冻结流水号（用于资产冻结/解冻追踪） */
    frozen_transaction_id: number | null
    /** 是否为当前最高出价 */
    is_highest: boolean
    /** 出价时间 */
    created_at: string
    /** 关联的竞价商品名称（联表查询返回） */
    product_name?: string
    /** 竞价商品状态（联表查询返回） */
    product_status?: string
  }

  // ===== 汇率兑换系统 =====

  /**
   * 汇率规则（对齐后端 exchange_rates 表 + GET /api/v4/market/exchange-rates 响应）
   * 表示一条源资产→目标资产的兑换规则
   */
  interface ExchangeRate {
    /** 汇率规则ID（BIGINT PK） */
    exchange_rate_id: number
    /** 源资产代码（如 red_shard） */
    from_asset_code: string
    /** 目标资产代码（如 DIAMOND） */
    to_asset_code: string
    /** 汇率分子 */
    rate_numerator: number
    /** 汇率分母 */
    rate_denominator: number
    /** 汇率文本描述（如 "10:1"） */
    rate_display: string
    /** 最小兑换数量 */
    min_from_amount: number
    /** 最大兑换数量（null=不限） */
    max_from_amount: number | null
    /** 每用户每日限额（null=不限） */
    daily_user_limit: number | null
    /** 手续费率（DECIMAL） */
    fee_rate: number
    /** 规则状态: active / paused / disabled */
    status: string
    /** 汇率说明（可为null） */
    description: string | null
  }

  /**
   * 兑换预览结果（POST /api/v4/market/exchange-rates/preview 响应）
   * 仅预览不执行实际兑换，用于前端展示确认信息
   */
  interface ExchangeRatePreview {
    /** 扣减数量 */
    from_amount: number
    /** 兑换总量（手续费前） */
    gross_to_amount: number
    /** 手续费 */
    fee_amount: number
    /** 实际到账量（手续费后） */
    net_to_amount: number
    /** 汇率文本 */
    rate_display: string
    /** 当前源资产余额 */
    user_balance: number
    /** 余额是否充足 */
    sufficient_balance: boolean
    /** 每日限额（null=不限） */
    daily_user_limit: number | null
    /** 今日已用 */
    daily_used: number
    /** 今日剩余（null=不限） */
    daily_remaining: number | null
  }

  /**
   * 兑换执行结果（POST /api/v4/market/exchange-rates/convert 响应）
   * 携带 Idempotency-Key 请求头防止重复兑换
   */
  interface ExchangeRateConvertResult {
    /** 是否成功 */
    success: boolean
    /** 扣减数量 */
    from_amount: number
    /** 实际到账量 */
    net_to_amount: number
    /** 兑换后源资产余额 */
    from_balance: number
    /** 兑换后目标资产余额 */
    to_balance: number
    /** 是否幂等重复请求 */
    is_duplicate: boolean
  }

  // ===== 价格发现系统 =====

  /**
   * 价格走势数据点（GET /api/v4/market/price/trend 响应中 data_points 数组项）
   * 后端按时间聚合 trade_orders JOIN market_listings 计算
   */
  interface PriceTrendPoint {
    /** 时间标签（如 '2026-02-16'） */
    time: string
    /** 均价 */
    avg_price: number
    /** 最低价 */
    min_price: number
    /** 最高价 */
    max_price: number
    /** 成交笔数 */
    trade_count: number
    /** 总成交量 */
    total_volume: number
  }

  /**
   * 成交量走势数据点（GET /api/v4/market/price/volume 响应中 data_points 数组项）
   * 与 PriceTrendPoint 结构类似，侧重成交量维度
   */
  interface VolumeTrendPoint {
    /** 时间标签 */
    time: string
    /** 成交笔数 */
    trade_count: number
    /** 总成交量 */
    total_volume: number
    /** 总成交额 */
    total_value: number
  }

  /**
   * 价格摘要统计（GET /api/v4/market/price/summary 响应）
   * 综合统计某资产/物品的历史成交数据
   */
  interface PriceSummary {
    /** 总成交笔数 */
    total_trades: number
    /** 历史最低价 */
    lowest_ever: number
    /** 历史最高价 */
    highest_ever: number
    /** 中位数价 */
    median_price: number
    /** 近7天均价 */
    avg_price_7d: number
    /** 近7天成交笔数 */
    trades_7d: number
  }

  /**
   * 最近成交记录（GET /api/v4/market/price/recent-trades 响应中数组项）
   * 展示实时成交流
   */
  interface RecentTrade {
    /** 交易订单ID */
    trade_order_id: number
    /** 成交价格 */
    price_amount: number
    /** 定价币种 */
    price_asset_code: string
    /** 挂牌类型: item / fungible_asset */
    listing_kind: string
    /** 商品显示名称 */
    display_name: string
    /** 成交数量（fungible_asset 类型使用） */
    amount: number | null
    /** 买家昵称 */
    buyer_nickname: string
    /** 卖家昵称 */
    seller_nickname: string
    /** 成交时间（ISO 8601） */
    completed_at: string
  }

  // ===== 市场数据分析 =====

  /**
   * 定价建议（GET /api/v4/market/analytics/pricing-advice 响应）
   * 算法: 建议最低价 = 近7天均价×0.8, 建议参考价 = 近7天均价, 建议最高价 = 近7天均价×1.5
   */
  interface PricingAdvice {
    /** 是否有成交数据（无成交数据时其他字段无意义） */
    has_trade_data: boolean
    /** 建议最低价 */
    suggested_min_price: number
    /** 建议参考价 */
    suggested_price: number
    /** 建议最高价 */
    suggested_max_price: number
    /** 当前在售最低价 */
    lowest_on_sale: number
    /** 定价建议文本 */
    advice_text: string
  }

  /**
   * 市场总览数据（GET /api/v4/market/analytics/overview 响应）
   * 各资产成交量排行、总交易额等宏观数据
   */
  interface MarketOverview {
    /** 总挂单数 */
    total_listings: number
    /** 在售挂单数 */
    active_listings: number
    /** 总成交笔数 */
    total_trades: number
    /** 总成交额（DIAMOND计） */
    total_volume: number
    /** 24小时成交笔数 */
    trades_24h: number
    /** 24小时成交额 */
    volume_24h: number
    /** 资产成交量排行（按成交额降序） */
    asset_rankings: AssetRanking[]
  }

  /** 市场总览中的资产排行项 */
  interface AssetRanking {
    /** 资产代码或分类标识 */
    asset_code: string
    /** 资产显示名称 */
    display_name: string
    /** 成交笔数 */
    trade_count: number
    /** 成交总额 */
    total_volume: number
  }

  /**
   * 价格历史数据（GET /api/v4/market/analytics/history 响应中数组项）
   * 卖家视角的价格历史，用于定价参考
   */
  interface PriceHistoryPoint {
    /** 日期（YYYY-MM-DD） */
    date: string
    /** 均价 */
    avg_price: number
    /** 最低价 */
    min_price: number
    /** 最高价 */
    max_price: number
    /** 成交笔数 */
    trade_count: number
  }

  // ===== 交易市场 =====

  /**
   * 市场挂单（对齐后端 market_listings 表 + GET /api/v4/market/listings 响应）
   * 双模式表: listing_kind 区分不可叠加物品(item)和可叠加资产(fungible_asset)
   * 挂单状态: active / sold / withdrawn / expired（文档枚举）
   *
   * 三表模型迁移（2026-02-22）:
   *   listing_kind 枚举: item_instance → item
   *   FK列名: offer_item_instance_id → offer_item_id
   */
  interface MarketListing {
    /** 挂单ID（BIGINT PK，后端API返回字段名为 listing_id） */
    listing_id: number
    /** 挂牌类型: item(不可叠加物品) / fungible_asset(可叠加资产) */
    listing_kind: string
    /** 卖家用户ID */
    seller_user_id: number
    /** 物品ID（item类型使用，关联items表，可为null） */
    offer_item_id: number | null
    /** 物品模板ID（可为null） */
    offer_item_template_id: number | null
    /** 物品显示名称 */
    offer_item_display_name: string | null
    /** 物品分类编码 */
    offer_item_category_code: string | null
    /** 物品稀有度编码 */
    offer_item_rarity: string | null
    /** 资产代码（fungible_asset类型使用，可为null） */
    offer_asset_code: string | null
    /** 资产分组代码 */
    offer_asset_group_code: string | null
    /** 资产显示名称 */
    offer_asset_display_name: string | null
    /** 上架数量（fungible_asset类型使用，可为null） */
    offer_amount: number | null
    /** 定价币种（默认 DIAMOND） */
    price_asset_code: string
    /** 售价（BIGINT） */
    price_amount: number
    /** 挂单状态: active / sold / withdrawn / expired */
    status: string
    /** 创建时间 */
    created_at: string
  }

  /**
   * 我的挂单（对齐后端 GET /api/v4/market/my-listings 响应）
   * 与 MarketListing 共享核心字段，但字段更精简
   */
  interface MyListing {
    /** 挂单ID（BIGINT PK，后端API返回字段名为 listing_id） */
    listing_id: number
    /** 挂牌类型: item / fungible_asset */
    listing_kind: string
    /** 商品显示名称 */
    display_name: string
    /** 物品稀有度编码（仅 item 类型） */
    offer_item_rarity?: string
    /** 资产代码（仅 fungible_asset 类型，如 DIAMOND） */
    offer_asset_code?: string
    /** 上架数量（仅 fungible_asset 类型） */
    offer_amount?: number
    /** 定价币种（默认 DIAMOND） */
    price_asset_code: string
    /** 售价（BIGINT） */
    price_amount: number
    /** 挂单状态: active / sold / withdrawn / expired */
    status: string
    /** 挂单状态中文显示（后端返回） */
    status_display?: string
    /** 创建时间 */
    created_at: string
    /** 关联交易订单ID（locked/sold状态时后端返回，用于担保码查询） */
    trade_order_id?: number | null
  }

  // ===== 消费系统 =====

  /**
   * 消费记录（对齐后端 consumption_records 表 + GET /api/v4/shop/consumption/me 响应）
   * 状态枚举（4态）: pending / approved / rejected / expired
   * 后端有 final_status 双重状态: pending_review / approved / rejected
   */
  interface ConsumptionRecord {
    /** 记录主键（BIGINT PK） */
    consumption_record_id: number
    /** 用户ID */
    user_id: number
    /** 商家ID */
    merchant_id: number
    /** 消费金额（元，DECIMAL(10,2)） */
    consumption_amount: number
    /** 待发放积分数（⚠️ 不是 points_awarded） */
    points_to_award: number
    /** 状态: pending / approved / rejected / expired */
    status: string
    /** 最终状态: pending_review / approved / rejected */
    final_status: string
    /** 商家备注 */
    merchant_notes?: string
    /** 管理员备注 */
    admin_notes?: string
    /** 门店ID */
    store_id: number
    /** 创建时间 */
    created_at: string
  }

  /** 二维码数据 */
  interface QRCodeData {
    qr_code: string
    user_id: number
    generated_at: string
    validity: number
    note: string
    usage: string
  }

  // ===== 客服系统 =====

  /** 客服会话（对齐后端 GET /api/v4/system/chat/sessions 返回格式） */
  interface ChatSession {
    /** 会话主键（后端字段: customer_service_session_id） */
    customer_service_session_id: number
    /** 会话状态: waiting | assigned | active | closed */
    status: string
    /** 满意度评分（1-5星，NULL表示未评分） */
    satisfaction_score: number | null
    /** 首响时间 */
    first_response_at: string | null
    /** 创建时间（ISO 8601） */
    created_at: string
    /** 最后更新时间（ISO 8601） */
    updated_at: string
    /** 最后消息对象（含 chat_message_id, content, sender_type, created_at） */
    last_message: {
      chat_message_id: number
      content: string
      sender_type: string
      created_at: string
    } | null
    /** 未读消息数 */
    unread_count: number
    /** 用户信息 */
    user?: {
      user_id: number
      nickname: string
      mobile: string
    }
  }

  /** 聊天消息（对齐后端消息字段格式） */
  interface ChatMessage {
    /** 消息主键（后端字段: chat_message_id） */
    chat_message_id: number
    /** 所属会话ID */
    customer_service_session_id: number
    /** 发送者类型: user | admin | system */
    sender_type: string
    /** 消息内容 */
    content: string
    /** 消息类型: text | image | system */
    message_type: string
    /** 创建时间（ISO 8601） */
    created_at: string
  }

  /** 用户工单（对齐后端 GET /api/v4/system/chat/issues 返回格式，已脱敏） */
  interface CustomerServiceIssue {
    /** 工单主键 */
    issue_id: number
    /** 问题类型: asset | trade | lottery | item | account | consumption | feedback | other */
    issue_type: string
    /** 优先级: low | medium | high | urgent */
    priority: string
    /** 工单状态: open | processing | resolved | closed */
    status: string
    /** 问题标题 */
    title: string
    /** 创建时间（ISO 8601） */
    created_at: string
    /** 解决时间（ISO 8601，未解决时为null） */
    resolved_at: string | null
  }

  /** 背包统计（对齐后端 GET /api/v4/backpack/stats 返回格式） */
  interface BackpackStats {
    /** 资产种类数量 */
    total_assets: number
    /** 可用物品数量 */
    total_items: number
    /** 所有资产可用余额总和 */
    total_asset_value: number
    /** 按item_type分组的物品数量 */
    items_by_type: Record<string, number>
  }

  // ===== 活动位置配置 =====

  /** 单个活动的位置配置项（后端 GET /api/v4/system/config/placement 响应中的数组项） */
  interface PlacementItem {
    /** 活动唯一标识（后端数据库 lottery_campaigns.campaign_code，如 CAMP20250901001） */
    campaign_code: string
    /** 位置配置详情 */
    placement: {
      /** 展示页面（lottery | discover | user） */
      page: string
      /** 页面位置（main | secondary | floating | top | bottom） */
      position: string
      /** 组件尺寸（full | medium | small | mini） */
      size: string
      /** 优先级，数字越大越靠前（默认0） */
      priority: number
    }
  }

  /** 活动位置配置完整数据（后端 GET /api/v4/system/config/placement 响应的 data 字段） */
  interface PlacementConfig {
    /** 配置版本号（语义化版本，如 "1.0.5"，用于缓存版本对比） */
    version: string
    /** 配置更新时间（ISO 8601 格式，如 "2026-02-14T10:30:00+08:00"） */
    updated_at: string
    /** 活动位置配置列表 */
    placements: PlacementItem[]
  }

  // ===== 系统通用 =====

  /**
   * 统一内容投放项（对齐后端 ad_campaigns + ad_creatives 合并输出）
   *
   * 数据来源: GET /api/v4/system/ad-delivery?slot_type=popup|carousel|announcement
   * 后端将弹窗横幅、轮播图、系统公告统一通过 Ad System 管理和输出
   *
   * campaign_category 分类:
   *   commercial  — 商业广告（广告主付费投放，完整竞价/计费/审核流程）
   *   operational — 运营内容（运营人员创建的弹窗/轮播，免费，无审核）
   *   system      — 系统通知（系统公告，强制展示，优先级最高）
   *
   * 前端按 slot_type 区分展示形态:
   *   popup        → 弹窗组件（popup-banner）
   *   carousel     → 轮播图（swiper）
   *   announcement → 公告滚动条
   */
  interface AdDeliveryItem {
    /** 广告计划主键（ad_campaigns.ad_campaign_id） */
    ad_campaign_id: number
    /**
     * 广告位ID（ad_slots.ad_slot_id）
     * commercial 类型必需 — reportAdImpression / reportAdClick 依赖此字段
     * operational / system 类型可为 null（运营/系统内容无需广告位绑定）
     */
    ad_slot_id: number | null
    /** 计划名称（运营后台填写，用于后台管理识别） */
    campaign_name: string
    /** 计划分类: commercial=商业广告 / operational=运营内容 / system=系统通知 */
    campaign_category: string
    /** 广告创意主键（ad_creatives.ad_creative_id） */
    ad_creative_id: number
    /** 创意标题（面向用户展示的标题） */
    title: string
    /** 内容类型: image=图片创意 / text=纯文字创意（系统公告） */
    content_type: string
    /** 图片URL（Sealos对象存储，content_type='text' 时为 null） */
    image_url: string | null
    /** 原图宽度px（后端 sharp 检测，可为 null） */
    image_width: number | null
    /** 原图高度px（后端 sharp 检测，可为 null） */
    image_height: number | null
    /** 文字内容（content_type='text' 时有值，系统公告正文） */
    text_content: string | null
    /** 跳转链接（可为 null） */
    link_url: string | null
    /** 跳转类型: none=无跳转 / page=小程序页面 / miniprogram=其他小程序 / webview=网页 */
    link_type: string
    /**
     * 显示模式（仅 content_type='image' 时有值）
     * wide=宽屏16:9 / horizontal=横版3:2 / square=方图1:1 /
     * tall=竖图3:4 / slim=窄长图9:16 / full_image=纯图模式
     */
    display_mode: string | null
    /**
     * 频率规则（弹窗专用，轮播/公告可为 null）
     * always / once / once_per_session / once_per_day / once_per_n_days / n_times_total
     */
    frequency_rule: string | null
    /** 频率参数值（配合 once_per_n_days 的天数 或 n_times_total 的次数） */
    frequency_value: number
    /** 是否强制弹出（true=不可点击遮罩关闭，必须点按钮关闭） */
    force_show: boolean
    /** 展示优先级（数字越大越优先，system:900-999, operational:100-899, commercial:1-99） */
    priority: number
    /** 轮播间隔毫秒（仅 slot_type=carousel 时有值，最小1000ms） */
    slide_interval_ms: number | null
    /** 计划开始日期 YYYY-MM-DD */
    start_date: string | null
    /** 计划结束日期 YYYY-MM-DD */
    end_date: string | null
  }

  /**
   * 统一交互日志上报参数
   *
   * 后端API: POST /api/v4/system/ad-events/interaction-log
   * 合并原 popup_show_log / carousel_show_log 为统一交互日志
   */
  interface InteractionLogParams {
    /** 广告计划ID（必填，来自 AdDeliveryItem.ad_campaign_id） */
    ad_campaign_id: number
    /** 交互类型: impression=曝光 / click=点击 / close=关闭 / swipe=滑动 */
    interaction_type: string
    /** 扩展数据（按场景携带不同的交互详情，JSON 格式存储） */
    extra_data?: {
      /** 广告位类型: popup / carousel / announcement（区分不同投放场景） */
      slot_type?: string
      /** 弹窗场景：展示时长毫秒（弹出到关闭的时间差） */
      show_duration_ms?: number
      /** 弹窗场景：关闭方式 close_btn / overlay / confirm_btn / auto_timeout */
      close_method?: string
      /** 弹窗场景：弹出队列位置（从1开始） */
      queue_position?: number
      /** 轮播场景：曝光时长毫秒 */
      exposure_duration_ms?: number
      /** 轮播场景：是否手动滑动触发 */
      is_manual_swipe?: boolean
      /** 轮播场景：是否被点击 */
      is_clicked?: boolean
      /** 轮播场景：点击的轮播索引 */
      slide_index?: number
    }
  }

  /**
   * 内容投放频次本地交互记录（wx.setStorageSync 存储）
   * Storage Key: 'ad_delivery_records'
   * 数据结构: Record<string, DeliveryRecord>（key 为 ad_campaign_id 字符串）
   */
  interface DeliveryRecord {
    /** 最后一次展示的时间戳（毫秒） */
    lastSeen: number
    /** 累计展示次数 */
    seenCount: number
    /** 是否被用户主动关闭过 */
    dismissed: boolean
  }

  /**
   * 用户反馈（对齐后端 feedbacks 表 + GET /api/v4/system/feedback/:id 响应）
   * 状态流转: pending → processing → replied → closed
   * 认证方式: JWT Bearer Token（普通用户只能查看自己的反馈）
   */
  interface Feedback {
    /** 反馈ID（INT 自增主键） */
    feedback_id: number
    /** 反馈分类: technical / feature / bug / complaint / suggestion / other */
    category: string
    /** 反馈内容（1-5000字符） */
    content: string
    /** 附件URL数组（无附件时为 []） */
    attachments: any[]
    /** 反馈状态: pending=待处理 / processing=处理中 / replied=已回复 / closed=已关闭 */
    status: string
    /** 优先级: high / medium / low */
    priority: string
    /** 用户信息（mobile 非管理员显示为 ****，由 DataSanitizer 脱敏） */
    user_info: { user_id: number; mobile: string; nickname: string }
    /** 管理员回复内容（未回复时为 null） */
    reply_content: string | null
    /** 管理员信息（未回复时为 null） */
    admin_info: { admin_id: number; admin_name: string } | null
    /** 创建时间（北京时间格式，如 "2026年02月18日 14:00:00"） */
    created_at: string
    /** 回复时间（北京时间格式，未回复时为 null） */
    replied_at: string | null
    /** 预计响应时间: "4小时内" / "24小时内" / "72小时内"（未设定时为 null） */
    estimated_response_time: string | null
  }

  // ===== 广告系统（Phase 2-6） =====

  /**
   * 广告位配置（对齐后端 ad_slots 表 + GET /api/v4/console/ad-slots 响应）
   * 每个广告位可独立配置日价、最低竞价、最大展示数
   */
  interface AdSlot {
    /** 广告位ID（INT PK） */
    ad_slot_id: number
    /** 广告位标识（如 home_popup / home_carousel，UNIQUE） */
    slot_key: string
    /** 广告位名称（如「首页弹窗位」） */
    slot_name: string
    /** 广告位类型: popup（弹窗） / carousel（轮播图） / announcement（公告） / feed（信息流） */
    slot_type: string
    /** 页面位置（home / lottery / profile） */
    position: string
    /** 该位每次最多展示广告数 */
    max_display_count: number
    /** 固定包天日价（钻石） */
    daily_price_diamond: number
    /** 竞价最低日出价（钻石） */
    min_bid_diamond: number
    /** 竞价最低总预算（钻石） */
    min_budget_diamond: number
    /** 包天模式最低日价下限（DAU系数计算结果不得低于此值） */
    min_daily_price_diamond?: number
    /** 广告位分类: display（展示类，按天/竞价） / feed（信息流，CPM曝光计费） */
    slot_category?: string
    /** CPM每千次曝光价格（钻石，仅 slot_category=feed 时使用） */
    cpm_price_diamond?: number
    /** 关联地域ID（NULL=全站级别，关联 ad_target_zones 表） */
    zone_id?: number | null
    /** 运营手动覆盖的底价（优先于动态底价自动计算值） */
    floor_price_override?: number | null
    /** 是否开放投放 */
    is_active: boolean
    /** 广告位描述 */
    description: string | null
    /** 创建时间（ISO 8601） */
    created_at: string
    /** 更新时间（ISO 8601） */
    updated_at: string
  }

  /**
   * 广告投放计划（对齐后端 ad_campaigns 表 + GET /api/v4/user/ad-campaigns 响应）
   * 状态流转: draft → pending_review → approved/rejected → active → completed/cancelled
   * 计费模式: fixed_daily（固定包天） / bidding（竞价排名） / cpm（CPM曝光计费）
   */
  interface AdCampaign {
    /** 广告计划ID（INT PK） */
    ad_campaign_id: number
    /** 幂等键（复用 IdempotencyService） */
    business_id: string
    /** 广告主用户ID */
    advertiser_user_id: number
    /** 投放广告位ID */
    ad_slot_id: number
    /** 计划名称 */
    campaign_name: string
    /** 计费模式: free（免费投放） / fixed_daily（固定包天） / bidding（竞价排名） / cpm（CPM曝光计费） */
    billing_mode: string
    /**
     * 广告状态（8态状态机）:
     * draft=草稿 / pending_review=待审核 / approved=已通过 / active=投放中 /
     * paused=已暂停 / completed=已完成 / rejected=已拒绝 / cancelled=已取消
     */
    status: string
    /** 竞价日出价（钻石，bidding 模式使用） */
    daily_bid_diamond: number | null
    /** 总预算（钻石，bidding 模式使用） */
    budget_total_diamond: number | null
    /** 已消耗钻石 */
    budget_spent_diamond: number
    /** 固定包天天数（fixed_daily 模式使用） */
    fixed_days: number | null
    /** 固定包天总价 = daily_price × days（钻石） */
    fixed_total_diamond: number | null
    /** 定向规则（Phase 5 启用，JSON） */
    targeting_rules: AdTargetingRules | null
    /** 展示优先级（广告范围 1~99） */
    priority: number
    /** 投放开始日期（YYYY-MM-DD） */
    start_date: string | null
    /** 投放结束日期（YYYY-MM-DD） */
    end_date: string | null
    /** 审核备注 */
    review_note: string | null
    /** 审核人ID */
    reviewed_by: number | null
    /** 审核时间（ISO 8601） */
    reviewed_at: string | null
    /** 创建时间（ISO 8601） */
    created_at: string
    /** 更新时间（ISO 8601） */
    updated_at: string
    /** 关联的广告位信息（联表查询返回，可选） */
    ad_slot?: AdSlot
    /** 关联的素材列表（联表查询返回，可选） */
    creatives?: AdCreative[]
  }

  /**
   * 广告定向规则（存储在 ad_campaigns.targeting_rules JSON字段中）
   * Phase 5 启用，基于用户行为标签做精准定向
   */
  interface AdTargetingRules {
    /** AND条件: 所有条件都满足才投放 */
    match_all?: AdTargetCondition[]
    /** OR条件: 任一条件满足即投放 */
    match_any?: AdTargetCondition[]
  }

  /** 定向条件（单条规则） */
  interface AdTargetCondition {
    /** 标签键（如 lottery_active_7d / diamond_balance） */
    tag_key: string
    /** 比较运算符: eq / neq / gt / gte / lt / lte */
    operator: string
    /** 目标值 */
    value: string
  }

  /**
   * 广告素材（对齐后端 ad_creatives 表）
   * 审核状态: pending=待审核 / approved=已通过 / rejected=已拒绝
   */
  interface AdCreative {
    /** 素材ID（INT PK） */
    ad_creative_id: number
    /** 所属广告计划ID */
    ad_campaign_id: number
    /** 素材标题 */
    title: string
    /** 图片URL（Sealos对象存储，后端自动转CDN） */
    image_url: string
    /** 原图宽度px */
    image_width: number | null
    /** 原图高度px */
    image_height: number | null
    /** 跳转链接 */
    link_url: string | null
    /** 跳转类型: none / page / miniprogram / webview */
    link_type: string
    /** 审核状态: pending / approved / rejected */
    review_status: string
    /** 审核备注 */
    review_note: string | null
    /** 审核人ID */
    reviewed_by: number | null
    /** 审核时间 */
    reviewed_at: string | null
    /** 创建时间 */
    created_at: string
    /** 更新时间 */
    updated_at: string
  }

  /**
   * 广告计费流水（对齐后端 ad_billing_records 表）
   * 计费类型: freeze=冻结 / deduct=扣除 / refund=退款 / daily_deduct=竞价日扣费 / cpm_deduct=CPM曝光日扣费
   */
  interface AdBillingRecord {
    /** 流水ID（BIGINT PK） */
    ad_billing_record_id: number
    /** 幂等键 */
    business_id: string
    /** 关联广告计划ID */
    ad_campaign_id: number
    /** 广告主用户ID */
    advertiser_user_id: number
    /** 计费日期（YYYY-MM-DD） */
    billing_date: string
    /** 钻石金额 */
    amount_diamond: number
    /** 计费类型: freeze / deduct / refund / daily_deduct / cpm_deduct */
    billing_type: string
    /** 关联资产交易流水ID */
    asset_transaction_id: number | null
    /** 备注 */
    remark: string | null
    /** 创建时间 */
    created_at: string
  }

  /**
   * 广告活动报表（对齐后端 GET /api/v4/user/ad-campaigns/:id/report 响应）
   * 包含曝光、点击、消耗等统计维度
   */
  interface AdCampaignReport {
    /** 广告计划ID */
    ad_campaign_id: number
    /** 总曝光次数 */
    impressions_total: number
    /** 有效曝光次数 */
    impressions_valid: number
    /** 总点击次数 */
    clicks_total: number
    /** 有效点击次数 */
    clicks_valid: number
    /** 转化数 */
    conversions: number
    /** 消耗钻石总量 */
    spend_diamond: number
    /** 点击率（clicks_valid / impressions_valid × 100） */
    ctr: number
    /** 报表数据区间 */
    date_range: {
      start_date: string
      end_date: string
    }
  }

  /**
   * 广告投放价格预览（GET /api/v4/user/ad-pricing/preview 响应 data 字段）
   *
   * 后端 AdPricingService.calculateFinalDailyPrice() 返回:
   *   effective_daily_price = max(base_price × dau_coefficient, min_daily_price)
   *   total_price = effective_daily_price × days × discount
   */
  interface AdPricingPreview {
    /** 广告位ID */
    ad_slot_id: number
    /** 广告位标识（如 home_announcement） */
    slot_key: string
    /** 基础日价（ad_slots.daily_price_diamond） */
    base_price: number
    /** 当前 DAU 系数（ad_dau_pricing_enabled=false 时为 1.0） */
    dau_coefficient: number
    /** DAU 调整后价格 = base_price × dau_coefficient */
    adjusted_price: number
    /** 最低日价下限（ad_slots.min_daily_price） */
    min_daily_price: number
    /** 实际日价 = max(adjusted_price, min_daily_price) */
    effective_daily_price: number
    /** 投放天数 */
    days: number
    /** 阶梯折扣率（1.0=无折扣，0.85=85折，ad_discount_enabled=false 时为 1.0） */
    discount: number
    /** 折扣档位标签（如"双周85折"，无折扣时为"无折扣"） */
    discount_label: string
    /** 折后总价 = effective_daily_price × days × discount */
    total_price: number
    /** 节省钻石 = effective_daily_price × days × (1 - discount) */
    saved: number
  }

  /**
   * 竞价排名状态（GET /api/v4/user/ad-campaigns/:id 响应中 bidding_status 字段）
   * 仅 billing_mode='bidding' 且 status='active' 时有值
   */
  interface AdBiddingStatus {
    /** 当前出价排名位次（1=最高出价者） */
    rank: number
    /** 是否在展示名额内 */
    is_winning: boolean
    /** 当日该广告位竞价参与者总数 */
    total_bidders: number
    /** 该广告位最大展示名额（ad_slots.max_display_count） */
    max_display: number
  }

  /**
   * 创建广告活动请求体（POST /api/v4/user/ad-campaigns）
   * 业务规则:
   *   fixed_daily模式: 必须传 fixed_days
   *   bidding模式: 必须传 daily_bid_diamond(≥min_bid_diamond) + budget_total_diamond(≥min_budget_diamond)
   *   cpm模式: 必须传 budget_total_diamond(≥min_budget_diamond)，CPM单价由广告位决定
   */
  interface CreateAdCampaignParams {
    /** 活动名称（必填） */
    campaign_name: string
    /** 广告位ID（必填，从广告位列表获取） */
    ad_slot_id: number
    /** 计费模式（必填）: fixed_daily / bidding / cpm */
    billing_mode: string
    /** 固定包天天数（fixed_daily 模式必填） */
    fixed_days?: number
    /** 竞价日出价钻石数（bidding 模式必填，≥50） */
    daily_bid_diamond?: number
    /** 竞价总预算钻石数（bidding 模式必填，≥500） */
    budget_total_diamond?: number
    /** 投放开始日期（YYYY-MM-DD） */
    start_date?: string
    /** 投放结束日期（YYYY-MM-DD） */
    end_date?: string
    /** 展示优先级（1~99，默认50） */
    priority?: number
  }

  // ===== 核销码系统（模型A：O2O动态码 — 到店核销） =====

  /**
   * 核销码生成响应（POST /api/v4/backpack/items/:item_id/redeem）
   *
   * Phase 1 升级后新增 qr_payload / qr_expires_at 字段（动态HMAC签名QR码）
   * code（12位Base32文本码）仅此一次返回明文，后端只存 SHA-256 哈希，不可逆
   */
  interface RedemptionCreateData {
    /** 核销订单信息 */
    order: {
      /** 订单ID（UUID, CHAR(36)） */
      redemption_order_id: string
      /** 订单状态: pending */
      status: 'pending'
      /** 核销码过期时间（ISO8601，运营可配置，默认30天） */
      expires_at: string
    }
    /** 12位Base32文本码（明文，仅此一次返回，格式 XXXX-YYYY-ZZZZ） */
    code: string
    /** 动态QR码内容（RQRV1_前缀，含HMAC-SHA256签名，5分钟有效） */
    qr_payload?: string
    /** QR码过期时间（ISO8601，5分钟有效） */
    qr_expires_at?: string
  }

  /**
   * QR码刷新响应（POST /api/v4/backpack/items/:item_id/redeem/refresh-qr）
   *
   * 后端服务: RedemptionQRSigner.js（独立于消费录入QR系统 QRCodeValidator.js）
   * QR码格式: RQRV1_{base64(JSON.stringify({ oid, ch, ts }))}_{hmac_sha256_signature}
   * 密钥: REDEMPTION_QR_SECRET（独立于 CONSUMPTION_QR_SECRET）
   */
  interface RedemptionQRRefreshData {
    /** RQRV1_前缀的动态QR码内容（含HMAC签名） */
    qr_payload: string
    /** QR码过期时间（ISO8601，5分钟有效） */
    qr_expires_at: string
    /** 12位Base32文本码（备用，不变） */
    text_code: string
  }

  /**
   * 核销执行响应（POST /api/v4/shop/redemption/fulfill 或 /scan）
   *
   * fulfillRedemption: 商家手动输入12位文本码核销（备用方式）
   * scanRedemptionQR:  商家扫描RQRV1_动态QR码核销（主要方式）
   * 两个接口共用后端 RedemptionService.fulfillOrder()
   *
   * Phase 1 升级后新增 fulfilled_store_id / fulfilled_by_staff_id / store 字段
   */
  interface RedemptionFulfillData {
    /** 核销订单信息 */
    order: {
      /** 订单ID（UUID） */
      redemption_order_id: string
      /** 核销完成时间（ISO8601 北京时间） */
      fulfilled_at: string
      /** 核销门店ID（store_staff 自动匹配） */
      fulfilled_store_id?: number
      /** 核销操作员工ID */
      fulfilled_by_staff_id?: number
    }
    /** 被核销的物品（三表模型迁移后 item_instance → item） */
    item: {
      /** 物品ID（BIGINT，items表主键） */
      item_id: number
      /** 物品名称（items表 item_name 正式列） */
      item_name: string
      /** 物品状态（核销后变为 used） */
      status: string
    }
    /** 物品所有者信息（核销码生成者） */
    redeemer: {
      /** 用户ID */
      user_id: number
      /** 用户昵称 */
      nickname: string
    }
    /** 核销门店信息（Phase 1 新增） */
    store?: {
      /** 门店ID */
      store_id: number
      /** 门店名称 */
      store_name: string
    }
  }

  /**
   * 核销订单状态枚举
   * redemption_orders.status 数据库ENUM
   */
  type RedemptionOrderStatus = 'pending' | 'fulfilled' | 'cancelled' | 'expired'

  // ===== 用户通知系统（方案B独立化） =====

  /**
   * 用户通知数据结构
   * 数据来源: user_notifications 表
   * API路径: GET /api/v4/user/notifications
   * WebSocket事件: new_notification
   * 字段100% snake_case，直接使用后端返回，不做映射
   */
  interface UserNotification {
    /** 通知ID（BIGINT主键） */
    notification_id: string
    /** 通知类型（listing_created / purchase_completed / lottery_win 等） */
    type: string
    /** 通知标题（可直接展示，如 "📦 挂牌成功"） */
    title: string
    /** 通知正文 */
    content: string
    /** 附加业务数据（用于跳转对应页面，如 market_listing_id、offer_asset_code） */
    metadata: Record<string, any> | null
    /** 已读标记: 0=未读, 1=已读 */
    is_read: number
    /** 已读时间（北京时间，未读时为null） */
    read_at: string | null
    /** 创建时间（北京时间） */
    created_at: string
  }

  /**
   * 通知类型枚举（后端 user_notifications.type 字段值）
   * 来源: 后端 NotificationService 的 30 个 notifyXxx() 方法
   */
  type NotificationType =
    | 'listing_created'
    | 'listing_sold'
    | 'listing_withdrawn'
    | 'listing_expired'
    | 'purchase_completed'
    | 'trade_complete_seller'
    | 'trade_complete_buyer'
    | 'lottery_win'
    | 'lottery_result'
    | 'exchange_pending'
    | 'exchange_approved'
    | 'exchange_rejected'
    | 'points_change'
    | 'announcement'
    | 'security_event'
}
