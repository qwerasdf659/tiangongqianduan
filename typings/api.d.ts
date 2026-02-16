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
    /** 用户UUID（登录响应返回，profile接口可能不返回） */
    user_uuid?: string
    /** 头像URL（登录响应返回，profile接口可能不返回） */
    avatar_url?: string
    /** 是否管理员（前端根据 role_level >= 100 派生，部分接口可能直接返回） */
    is_admin?: boolean
    /** 用户角色名称（部分接口可能直接返回） */
    user_role?: string
  }

  /** Token验证响应（GET /api/v4/auth/verify） */
  interface VerifyTokenData {
    valid: boolean
    user: UserProfile
  }

  // ===== 抽奖系统 =====

  /** 奖品信息（后端 DataSanitizer.sanitizePrizes 输出） */
  interface Prize {
    id: number
    name: string
    type: string
    icon: string
    /** 稀有度代码（5级: common/uncommon/rare/epic/legendary） */
    rarity_code: string
    available: boolean
    display_points: number
    display_value: string
    status: string
    sort_order: number
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
   * 示例: DIAMOND(钻石)、red_shard(红色碎片)
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
    /** 商品主键（BIGINT PK） */
    exchange_item_id: number
    /** 商品名称（VARCHAR(200)） */
    item_name: string
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
      /** 商品名称（⚠️ 后端已直接返回 item_name，前端不再使用旧映射 name） */
      item_name: string
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
    /** 定价币种（默认 DIAMOND） */
    price_asset_code: string
    /** 售价（BIGINT） */
    price_amount: number
    /** 挂单状态: on_sale / locked / sold / withdrawn / admin_withdrawn */
    status: string
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

  /** 弹窗横幅 */
  interface PopupBanner {
    id: number
    title: string
    content: string
    image_url?: string
    link_url?: string
    display_type: string
  }

  /** 用户反馈 */
  interface Feedback {
    feedback_id: number
    category: string
    content: string
    priority: string
    status: string
    created_at: string
    reply?: string
  }
}
