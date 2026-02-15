/**
 * 🌐 API响应类型声明
 *
 * 定义后端API统一响应格式和各业务模块的响应数据类型
 * 所有API交互字段使用snake_case命名（与后端一致）
 *
 * @file 天工餐厅积分系统 - API类型定义
 * @version 5.0.0
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

  /** 用户资料 */
  interface UserProfile {
    user_id: number
    user_uuid: string
    mobile: string
    nickname: string
    status: string
    is_admin: boolean
    user_role: string
    role_level: number
    avatar_url?: string
    created_at: string
  }

  /** Token验证响应 */
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
    /** 交易流水ID（主键，数字类型） */
    /** 交易流水ID（后端API响应字段名 transaction_id，非数据库列名 asset_transaction_id） */
    transaction_id: number
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

  /** 兑换商品 */
  interface ExchangeProduct {
    id: number
    name: string
    description: string
    cost_points: number
    category: string
    stock: number
    image_url: string
    space: string
  }

  /** 兑换订单 */
  interface ExchangeOrder {
    order_id: string
    order_no: string
    product_name: string
    cost_points: number
    quantity: number
    status: string
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
    /** 起拍价（最低出价金额） */
    starting_price: number
    /** 当前最高出价 */
    current_price: number
    /** 最小加价幅度 */
    min_bid_increment: number
    /** 竞价使用的资产类型编码（如 DIAMOND、red_shard） */
    asset_code: string
    /** 竞价状态: pending/active/settled/no_bid/cancelled */
    status: string
    /** 竞价开始时间（ISO 8601） */
    start_time: string
    /** 竞价结束时间（ISO 8601） */
    end_time: string
    /** 当前出价人数 */
    bid_count: number
    /** 最高出价者用户ID（可为null） */
    highest_bidder_id: number | null
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

  /** 市场挂单 */
  interface MarketListing {
    market_listing_id: number
    item_name: string
    price: number
    seller_nickname: string
    status: string
    listed_at: string
    description: string
  }

  // ===== 消费系统 =====

  /** 消费记录 */
  interface ConsumptionRecord {
    record_id: number
    user_id: number
    store_id: number
    consumption_amount: number
    points_to_award: number
    status: string
    status_name: string
    created_at: string
    merchant_notes?: string
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
