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

  /** 登录响应数据 */
  interface LoginData {
    access_token: string
    refresh_token: string
    user: UserProfile
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
    /** 角色列表（Array） */
    roles: string[]
    /** 用户状态: active / inactive / banned */
    status: string
    /** 连续未中奖次数（保底机制） */
    consecutive_fail_count: number
    /** 历史累计积分（用于臻选空间解锁门槛判断） */
    history_total_points: number
    /** 创建时间（ISO8601 北京时间） */
    created_at: string
    /** 最后登录时间（ISO8601 北京时间） */
    last_login: string
    /** 登录次数 */
    login_count: number
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
   * 字段对齐后端实际返回格式（2026-02-18 DataSanitizer字段对齐后）：
   * - id: 统一为通用 id（数据库实际字段 lottery_prize_id，DataSanitizer 安全映射）
   * - image: 新增字段，有图片时为 PrizeImage 对象，无图片时为 null（emoji兜底）
   * - icon 字段已移除（后端不再返回，前端根据 prize_type 自行生成 emoji）
   */
  interface Prize {
    /** 奖品ID（DataSanitizer 统一输出 id，数据库实际字段 lottery_prize_id） */
    id: number
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
    /** 奖励层级: low/medium/high/premium */
    reward_tier: string
    /** 状态: active / inactive */
    status: string
    /** 图片资源ID（关联 image_resources 表，可为 null） */
    image_resource_id: number | null
    /**
     * 奖品图片对象（DataSanitizer 通过 ImageUrlHelper 生成完整URL）
     * 有图片时: { id, url, mime, thumbnail_url }
     * 无图片时: null（前端使用 PRIZE_ICON_MAP[prize_type] emoji 兜底）
     */
    image: PrizeImage | null
    /** 材料资产代码（如 CRYSTAL） */
    material_asset_code: string
    /** 材料数量 */
    material_amount: number
  }

  /** 奖品关联图片（Sealos 对象存储公网URL） */
  interface PrizeImage {
    /** 图片资源ID */
    id: number
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
    guarantee_info: GuaranteeInfo | null
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

  /** 保底信息 */
  interface GuaranteeInfo {
    current_pity: number
    guarantee_threshold: number
    guaranteed_tier: string
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
    guarantee_info?: GuaranteeInfo | null
  }

  // ===== 资产系统 =====

  /** 资产余额 */
  interface AssetBalance {
    asset_code: string
    available_amount: number
    frozen_amount: number
    total_amount: number
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
   * 背包不可叠加物品（对齐后端 GET /api/v4/backpack/ 的 items[] 返回格式）
   * 背包列表只返回 status='available' 的物品
   */
  interface BackpackItem {
    /** 物品实例唯一ID（bigint） */
    item_instance_id: number
    /** 物品类型编码（prize/product/voucher/tradable_item/service） */
    item_type: string
    /** 物品类型中文名（后端自动附加） */
    item_type_display: string
    /** 物品名称 */
    name: string
    /** 物品状态编码（available/locked/used/expired/transferred） */
    status: string
    /** 物品状态中文名（后端自动附加） */
    status_display: string
    /** 稀有度编码（common/uncommon/rare/epic/legendary） */
    rarity: string
    /** 稀有度中文名（后端自动附加） */
    rarity_display: string
    /** 物品描述 */
    description: string
    /** 获得时间（YYYY-MM-DD HH:mm:ss 格式） */
    acquired_at: string
    /** 过期时间（可为 null） */
    expires_at: string | null
    /** 是否为当前用户所有（详情接口返回） */
    is_owner?: boolean
    /** 是否已生成核销码 */
    has_redemption_code: boolean
  }

  // ===== 兑换系统 =====

  /**
   * 兑换商品（对齐后端 exchange_items 表 + GET /api/v4/backpack/exchange/items 响应）
   * 后端使用多币种支付模型: cost_asset_code + cost_amount
   * 图片通过 primary_image_id 关联 image_resources 表
   */
  interface ExchangeProduct {
    /** 商品主键（DataSanitizer 输出通用 id，数据库实际字段 exchange_item_id） */
    id: number
    /** 商品名称（DataSanitizer 输出通用 name，数据库实际字段 item_name） */
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
   * 订单状态枚举（数据库ENUM）: pending → completed → shipped / cancelled
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
    /** 订单状态: pending / completed / shipped / cancelled */
    status: string
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

  // ===== 交易市场 =====

  /**
   * 市场挂单（对齐后端 market_listings 表 + GET /api/v4/market/listings 响应）
   * 双模式表: listing_kind 区分不可叠加物品(item_instance)和可叠加资产(fungible_asset)
   * 挂单状态: on_sale / locked / sold / withdrawn / admin_withdrawn
   */
  interface MarketListing {
    /** 挂单ID（BIGINT PK） */
    market_listing_id: number
    /** 挂牌类型: item_instance(不可叠加物品) / fungible_asset(可叠加资产) */
    listing_kind: string
    /** 卖家用户ID */
    seller_user_id: number
    /** 物品实例ID（item_instance类型使用，可为null） */
    offer_item_instance_id: number | null
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
    /** 挂单状态: on_sale / locked / sold / withdrawn / admin_withdrawn */
    status: string
    /** 创建时间 */
    created_at: string
  }

  /**
   * 我的挂单状态（对齐后端 GET /api/v4/market/listing-status 响应）
   * 与 MarketListing 共享核心字段，但字段更精简
   */
  interface MyListing {
    /** 挂单ID（BIGINT PK） */
    market_listing_id: number
    /** 挂牌类型: item_instance / fungible_asset */
    listing_kind: string
    /** 商品显示名称（物品实例 → offer_item_display_name，资产 → offer_asset_display_name） */
    display_name: string
    /** 物品稀有度编码（仅 item_instance 类型） */
    offer_item_rarity?: string
    /** 资产代码（仅 fungible_asset 类型，如 DIAMOND） */
    offer_asset_code?: string
    /** 上架数量（仅 fungible_asset 类型） */
    offer_amount?: number
    /** 定价币种（默认 DIAMOND） */
    price_asset_code: string
    /** 售价（BIGINT） */
    price_amount: number
    /** 挂单状态: on_sale / locked / sold / withdrawn / admin_withdrawn */
    status: string
    /** 挂单状态中文显示（后端返回） */
    status_display?: string
    /** 创建时间 */
    created_at: string
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
    /** 活动唯一标识（如 BASIC_LOTTERY、SPRING_2026） */
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

  /** 系统公告 */
  interface Announcement {
    id: number
    title: string
    content: string
    is_important: boolean
    created_at: string
  }

  /**
   * 弹窗横幅（对齐后端 popup_banners 表 + GET /api/v4/system/popup-banners 响应）
   *
   * 频率控制字段（banner_type / frequency_rule / frequency_value / force_show / priority）
   * 由后端运营后台配置，前端读取后在客户端执行频率判断逻辑
   *
   * @see docs/弹窗横幅频率控制系统设计文档.md
   */
  interface PopupBanner {
    /** 弹窗横幅主键（INT PK） */
    popup_banner_id: number
    /** 弹窗标题（后台识别用，VARCHAR(100)） */
    title: string
    /** 横幅图片URL（Sealos对象存储，VARCHAR(500)） */
    image_url: string
    /**
     * 显示模式（后端ENUM，运营在管理后台选择模板）
     * wide=宽屏16:9 / horizontal=横版3:2 / square=方图1:1 /
     * tall=竖图3:4 / slim=窄长图9:16 / full_image=纯图模式
     */
    display_mode: string
    /** 原图宽度px（后端sharp检测，可为null） */
    image_width: number | null
    /** 原图高度px（后端sharp检测，可为null） */
    image_height: number | null
    /** 跳转链接（可为null，VARCHAR(500)） */
    link_url: string | null
    /** 跳转类型: none=无跳转 / page=小程序页面 / miniprogram=其他小程序 / webview=网页 */
    link_type: string
    /** 显示位置（如 home，VARCHAR(50)） */
    position: string
    /** 显示顺序（数字小优先，用于列表排列，与priority职责不同） */
    display_order: number
    /** 开始展示时间（ISO8601，可为null） */
    start_time: string | null
    /** 结束展示时间（ISO8601，可为null） */
    end_time: string | null

    // ===== 频率控制字段（后端新增，运营后台配置） =====

    /**
     * banner类型分级: notice=系统公告 / event=活动推广 / promo=日常促销
     * notice: 强制弹出，必须点"我知道了"关闭，关闭后永不再弹
     * event: 活动期间弹一次，关闭后不再弹
     * promo: 按frequency_rule控制频率
     */
    banner_type: string
    /**
     * 频率规则枚举:
     * always=每次进入都弹 / once=整个周期只弹一次 / once_per_session=每次冷启动弹一次 /
     * once_per_day=每天最多弹一次 / once_per_n_days=每N天弹一次 / n_times_total=累计最多弹N次
     */
    frequency_rule: string
    /** 频率参数值（配合once_per_n_days的天数 或 n_times_total的次数） */
    frequency_value: number
    /** 是否强制弹出（true=不可点击遮罩关闭，必须点按钮） */
    force_show: boolean
    /** 弹出优先级（数字越大越优先弹出，多banner竞争时使用） */
    priority: number

    // ===== 可选字段（部分接口可能返回） =====

    /** 正文内容（可选，部分banner可能包含文案描述） */
    content?: string
    /** 描述（可选） */
    description?: string
  }

  /**
   * 弹窗横幅本地交互记录（wx.setStorageSync 存储）
   * Storage Key: 'popup_banner_records'
   * 数据结构: Record<string, BannerRecord>（key为popup_banner_id字符串）
   */
  interface BannerRecord {
    /** 最后一次展示的时间戳（毫秒） */
    lastSeen: number
    /** 累计展示次数 */
    seenCount: number
    /** 是否被用户主动关闭过 */
    dismissed: boolean
  }

  /**
   * 轮播图（对齐后端 carousel_items 表 + GET /api/v4/system/carousel-items 响应）
   * 显示位置: position='home'（首页抽奖页）
   * 轮播间隔: slide_interval_ms（毫秒，后端配置，最小1000ms）
   */
  interface CarouselItem {
    /** 轮播图主键（INT PK） */
    carousel_item_id: number
    /** 轮播图标题 */
    title: string
    /** 轮播图图片URL（Sealos对象存储完整公网URL） */
    image_url: string
    /** 显示模式: wide / horizontal / square */
    display_mode: string
    /** 原图宽度px（后端sharp检测，可为null） */
    image_width: number | null
    /** 原图高度px（后端sharp检测，可为null） */
    image_height: number | null
    /** 跳转链接 */
    link_url: string
    /** 跳转类型: none / page / miniprogram / webview */
    link_type: string
    /** 轮播间隔毫秒（默认3000ms，最小1000ms） */
    slide_interval_ms: number
    /** 广告标记（竞价结果附加字段，可选） */
    _is_ad?: boolean
    /** 广告活动ID（广告竞价结果附加字段，可选） */
    _ad_campaign_id?: number
    /** 广告创意ID（广告竞价结果附加字段，可选） */
    _ad_creative_id?: number
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
    /** 广告位类型: popup（弹窗） / carousel（轮播图） */
    slot_type: string
    /** 页面位置（home / lottery / profile） */
    position: string
    /** 该位每次最多展示广告数 */
    max_display_count: number
    /** 固定包天日价（钻石） */
    daily_price_diamond: number
    /** 竞价最低日出价（钻石，拍板决策: 50） */
    min_bid_diamond: number
    /** 竞价最低总预算（钻石，拍板决策: 500） */
    min_budget_diamond: number
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
   * 计费模式: fixed_daily（固定包天） / bidding（竞价排名）
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
    /** 计费模式: fixed_daily（固定包天） / bidding（竞价排名） */
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
   * 计费类型: freeze=冻结 / deduct=扣除 / refund=退款 / daily_deduct=竞价日扣费
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
    /** 计费类型: freeze / deduct / refund / daily_deduct */
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
   * 创建广告活动请求体（POST /api/v4/user/ad-campaigns）
   * 业务规则:
   *   fixed_daily模式: 必须传 fixed_days
   *   bidding模式: 必须传 daily_bid_diamond(≥50) + budget_total_diamond(≥500)
   */
  interface CreateAdCampaignParams {
    /** 活动名称（必填） */
    campaign_name: string
    /** 广告位ID（必填，从广告位列表获取） */
    ad_slot_id: number
    /** 计费模式（必填）: fixed_daily / bidding */
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
}
