/**
 * 🌐 API响应类型声明
 *
 * 定义后端API统一响应格式和各业务模块的响应数据类型
 * 所有API交互字段使用snake_case命名（与后端一致）
 *
 * @file 天工餐厅积分系统 - API类型定义
 * @version 3.0.0
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

  /** 分页信息结构 */
  interface Pagination {
    page: number
    page_size: number
    total: number
    has_more: boolean
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

  /** 奖品信息 */
  interface Prize {
    id: number
    name: string
    icon: string
    sort_order: number
    tier: string
    probability: number
    is_winner: boolean
    description?: string
  }

  /** 抽奖配置 */
  interface LotteryConfig {
    campaign_code: string
    campaign_name: string
    status: string
    cost_per_draw: number
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

  /** 抽奖结果 */
  interface DrawResult {
    prizes: Prize[]
  }

  // ===== 资产系统 =====

  /** 资产余额 */
  interface AssetBalance {
    asset_code: string
    available_amount: number
    frozen_amount: number
    total_amount: number
  }

  /** 资产交易记录 */
  interface AssetTransaction {
    transaction_id: number
    asset_code: string
    amount: number
    business_type: string
    description: string
    balance_after: number
    created_at: string
  }

  // ===== 背包系统 =====

  /** 背包数据（双轨结构） */
  interface BackpackData {
    assets: BackpackAsset[]
    items: BackpackItem[]
  }

  /** 背包可叠加资产 */
  interface BackpackAsset {
    asset_code: string
    display_name: string
    amount: number
    icon: string
  }

  /** 背包不可叠加物品 */
  interface BackpackItem {
    item_instance_id: number
    item_type: string
    name: string
    status: string
    rarity: string
    description: string
    acquired_at: string
    expires_at: string | null
    is_owner: boolean
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

  /** 客服会话 */
  interface ChatSession {
    session_id: number
    status: string
    created_at: string
    updated_at: string
    last_message?: string
  }

  /** 聊天消息 */
  interface ChatMessage {
    message_id: number
    session_id: number
    sender_type: string
    content: string
    created_at: string
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





