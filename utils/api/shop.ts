/**
 * 消费积分系统 + 核销API
 * 用户端路由: routes/v4/user/consumption/（QR码生成，所有已登录用户）
 * 商家端路由: routes/v4/shop/consumption/（扫码获取用户信息、提交消费）
 * 核销路由: routes/v4/shop/redemption/
 *
 * @file 天工平台 - 消费与核销API模块
 * @version 5.2.0
 * @since 2026-02-15
 */

const { apiClient } = require('./client')
const { buildQueryString, generateIdempotencyKey } = require('../util')

// ==================== 用户端消费 ====================

/**
 * 获取当前用户消费积分二维码 - GET /api/v4/user/consumption/qrcode
 *
 * DB-3修复后路径变更：/shop/consumption/qrcode → /user/consumption/qrcode
 * 所有已登录用户（含普通用户、商家员工、管理员）统一使用此端点。
 *
 * 后端 V2 动态码：5 分钟过期 + 一次性 nonce（提交时消耗，防重放）。
 * 响应字段（对接文档 2026-06-25 定稿，前端零映射直读）:
 *   qr_code（每次刷新全新）、user_id、user_uuid、nonce（全新）、
 *   validity_seconds（数值秒，倒计时直用；已替代废弃的 validity 死字段）、
 *   expires_at（北京时间对象 {iso,beijing,timestamp,relative}，取 .timestamp 抗时钟漂移）、
 *   generated_at、algorithm、note、usage
 */
async function getUserQRCode() {
  return apiClient.request('/user/consumption/qrcode', {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '生成二维码中...',
    showError: true,
    errorPrefix: '二维码生成失败：'
  })
}

/**
 * 获取当前生效的消费加成活动（C 端展示）- GET /api/v4/user/consumption-bonus
 *
 * 用途（方案C §十）：门店页/扫码页展示"本店当前有什么消费加成活动"（如"双11消费多送50%积分"），
 * 用于激励消费。用户无需选择活动——消费时后端按门店/商家/时间自动匹配，此接口仅告知展示。
 *
 * 查询参数（store_id / merchant_id 至少传一个查该门店/商家生效活动；都不传则查全平台活动）:
 *   - store_id    门店ID（可选）
 *   - merchant_id 商家ID（可选）
 *
 * 响应 data（脱敏，前端零映射直读，§10.3/§10.5）:
 *   active   boolean          是否有生效活动（false 时前端不展示活动条）
 *   activity {                有生效活动时的展示信息；无则为 null
 *     display_name string     活动展示名（直接展示，如"双11消费多送50%积分"）
 *     bonus_rate   number     加成率（0.5=多送50%，可 ×100 转百分比展示）
 *     start_at     string|null 生效开始（北京时间 ISO，null=不限）
 *     end_at       string|null 生效结束（北京时间 ISO，null=不限）
 *   }
 *
 * ⚠️ 数据边界（§10.5 安全红线）：本接口只下发 display_name/bonus_rate/start_at/end_at 营销展示字段；
 *   priority/max_bonus_rate/store_ids/merchant_ids/rule_name 等内部配置字段后端不下发，前端不应尝试获取。
 *
 * @param params 可选门店/商家过滤（都不传查全平台活动）
 */
async function getConsumptionBonusActivity(
  params: { store_id?: number; merchant_id?: number } = {}
) {
  const qs = buildQueryString({ store_id: params.store_id, merchant_id: params.merchant_id })
  const url = qs ? `/user/consumption-bonus?${qs}` : '/user/consumption-bonus'
  return apiClient.request(url, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/** 获取当前用户的消费记录 - GET /api/v4/shop/consumption/me */
async function getMyConsumptionRecords(
  params: { page?: number; page_size?: number; status?: string | null } = {}
) {
  const { page = 1, page_size = 20, status = null } = params
  const qs = buildQueryString({ page, page_size, status })
  return apiClient.request(`/shop/consumption/me?${qs}`, { method: 'GET', needAuth: true })
}

/**
 * 获取单条消费记录详情 - GET /api/v4/shop/consumption/detail/:id
 *
 * 后端路由: routes/v4/shop/consumption/query.js GET /detail/:id
 * 服务层: ConsumptionQueryService.getConsumptionDetailWithAuth(recordId, userId, isAdmin, options)
 * 数据库: consumption_records 表
 *
 * 注意: 路径参数名是 :id（不是 :record_id）
 * 权限: 支持三种身份 — 记录所有者(user_owner)、关联商家(merchant_owner)、管理员(admin_privilege)
 *
 * 响应 data（snake_case 原名，前端零映射直读）相比列表接口多出的详情字段:
 *   store_name              门店名称（后端已 JOIN store 返回）
 *   reward_points           奖励到账积分数（= 积分流水 delta_amount，仅 approved 记录有值；pending/拒绝为 null）
 *   reward_transaction_no   奖励积分流水单号（便于对账展示，仅 approved 记录有值；pending/拒绝为 null）
 *
 * ⚠️ 数据安全: 后端仅下发上述非敏感字段，不下发 balance_before/balance_after 等账户余额快照（防抓包泄露）。
 *    前端不得自行计算或补全余额类字段，所有数据以后端返回为准。
 *
 * @param record_id 消费记录主键 consumption_record_id（BIGINT）
 */
async function getConsumptionDetail(record_id: number) {
  return apiClient.request(`/shop/consumption/detail/${record_id}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '加载详情中...',
    showError: true,
    errorPrefix: '加载消费详情失败：'
  })
}

// ==================== 商家端消费 ====================

/**
 * 获取"我的门店"列表（门店选择器数据源）- GET /api/v4/shop/my-stores
 *
 * 用于消费录入/核销等需要落具体门店的场景：
 * - 普通员工：返回其 active 在职门店（后端复用 getUserStores）
 * - 管理员（role_level>=100）：返回全部 active 门店（跨店特权）
 *
 * 响应 data（snake_case 原名，前端不做映射）:
 *   is_admin_scope: 是否管理员全量范围
 *   stores[]: { store_id, store_name, store_code, role_in_store }
 */
async function getMyStores() {
  return apiClient.request('/shop/my-stores', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 根据V2动态二维码获取用户信息（商家扫码后调用）
 * GET /api/v4/shop/consumption/user-info?qr_code=xxx&store_id=xxx
 */
async function getUserInfoByQRCode(qr_code: string, store_id?: number) {
  if (!qr_code) {
    throw new Error('二维码不能为空')
  }
  if (!qr_code.startsWith('QRV2_')) {
    throw new Error('无效的二维码格式，请让用户刷新二维码')
  }

  const qs = buildQueryString({ qr_code, store_id })
  return apiClient.request(`/shop/consumption/user-info?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: true,
    loadingText: '获取用户信息中...',
    showError: true,
    errorPrefix: '获取用户信息失败：'
  })
}

/** 消费提交参数 */
interface SubmitConsumptionParams {
  qr_code: string
  consumption_amount: number
  store_id?: number
  merchant_notes?: string
}

/**
 * 商家提交消费记录（V2动态码 + 幂等键）
 * POST /api/v4/shop/consumption/submit
 */
async function submitConsumption(params: SubmitConsumptionParams) {
  if (!params || typeof params !== 'object') {
    throw new Error('参数格式错误')
  }
  if (!params.qr_code) {
    throw new Error('二维码不能为空')
  }
  if (!params.consumption_amount || params.consumption_amount <= 0) {
    throw new Error('消费金额必须大于0')
  }
  if (params.consumption_amount > 99999.99) {
    throw new Error('消费金额不能超过99999.99元')
  }
  if (params.merchant_notes && params.merchant_notes.length > 500) {
    throw new Error('商家备注不能超过500字')
  }

  const idempotencyKey: string = await generateIdempotencyKey('consumption_submit')

  return apiClient.request('/shop/consumption/submit', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: {
      qr_code: params.qr_code,
      consumption_amount: parseFloat(String(params.consumption_amount)),
      store_id: params.store_id || undefined,
      merchant_notes: params.merchant_notes || undefined
    },
    needAuth: true,
    showLoading: true,
    loadingText: '提交中...',
    showError: true,
    errorPrefix: '提交失败：'
  })
}

/**
 * 商家查询门店消费记录 - GET /api/v4/shop/consumption/merchant/list
 *
 * 多视角分层查询（对接文档《消费提交记录-多视角查询》§16.3 契约，零映射直传同名参数）：
 *   - view：self/store/staff/all，不传则后端按角色取缺省（店员 self / 店长 store / 管理员 all）；
 *     视角准入与数据范围由后端 DataScopeService 强制，前端越不过；
 *   - store_id：view=staff 必传；view=store 选传（不传=聚合可见门店全部）；
 *   - target_user_id：view=staff 必传，目标员工 user_id（可查其离职后历史）；
 *   - status：列表选传（pending/approved/rejected/expired）。
 *
 * 响应 data（snake_case 原名，前端零映射直读）:
 *   records[]、pagination{page,page_size,total,total_pages}、view、view_note。
 * 越权时后端返回 4xx + code（VIEW_NOT_ALLOWED/STORE_OUT_OF_SCOPE/STAFF_NOT_IN_STORE/TARGET_USER_REQUIRED）。
 *
 * @param params.view            视角枚举（可选，缺省由后端按角色解析）
 * @param params.store_id        目标门店ID（staff 必传 / store 选传）
 * @param params.target_user_id  目标员工ID（staff 必传）
 * @param params.status          审核状态过滤（可选）
 * @param params.page            页码（默认1）
 * @param params.page_size       每页数量（默认20，上限50）
 */
async function getMerchantConsumptions(
  params: {
    view?: string
    store_id?: number
    target_user_id?: number
    status?: string
    page?: number
    page_size?: number
  } = {}
) {
  const { view, store_id, target_user_id, status, page = 1, page_size = 20 } = params
  const qs = buildQueryString({ view, store_id, target_user_id, status, page, page_size })
  return apiClient.request(`/shop/consumption/merchant/list?${qs}`, {
    method: 'GET',
    needAuth: true
  })
}

/**
 * 商家门店消费统计 - GET /api/v4/shop/consumption/merchant/stats
 *
 * 权限: role_level>=20（店员及以上）。按"当前登录人范围"隔离：
 *   店员=自己录入口径，店长=本店口径，区域负责人=管辖门店集合（后端控制，前端只展示）。
 *
 * 响应 data（snake_case 原名，前端不做映射）:
 *   by_status: { pending:{count,amount,points}, approved:{...}, rejected:{...} }  按审核状态分组
 *   total:     { count, amount, approved_points }                                范围内全部消费记录
 *   timeout:   { pending_total, overdue, near_due }                              超时预警（2小时内临近/已超时）
 */
/**
 * 商家门店消费统计 - GET /api/v4/shop/consumption/merchant/stats
 *
 * 权限: role_level>=20（店员及以上）。支持多视角分层（对接文档 §16.3，与列表口径统一）：
 *   传 view/store_id/target_user_id 同名参数，后端按视角强制数据范围，列表与统计口径一致。
 *   - view：self/store/staff/all，不传则后端按角色取缺省；
 *   - store_id：view=staff 必传 / view=store 选传（不传=聚合可见门店全部）；
 *   - target_user_id：view=staff 必传。
 *
 * 响应 data（snake_case 原名，前端不做映射）:
 *   view: 当前生效视角
 *   by_status: { pending:{count,amount,points}, approved:{...}, rejected:{...}, expired:{...} }  按审核状态分组
 *   total:     { count, amount, approved_points }                                范围内全部消费记录
 *   timeout:   { pending_total, overdue, near_due }                              超时预警（2小时内临近/已超时）
 *
 * @param params.view            视角枚举（可选，缺省由后端按角色解析）
 * @param params.store_id        目标门店ID（staff 必传 / store 选传）
 * @param params.target_user_id  目标员工ID（staff 必传）
 */
async function getMerchantConsumptionStats(
  params: { view?: string; store_id?: number; target_user_id?: number } = {}
) {
  const { view, store_id, target_user_id } = params
  const qs = buildQueryString({ view, store_id, target_user_id })
  return apiClient.request(`/shop/consumption/merchant/stats?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取当前用户的核销订单列表 - GET /api/v4/shop/redemption/me
 *
 * 业务语义: 用户查看自己的兑换/核销订单（按 redeemer_user_id 过滤，仅本人）。
 * 「我的核销订单」页数据源；对 status==='fulfilled'（已核销）项可发起售后申诉。
 *
 * 响应 data（snake_case 原名，前端不做映射）:
 *   records[]: { redemption_order_id(UUID), order_no, status, fulfilled_at, created_at, item:{ item_id, item_name } }
 *   pagination: { total, page, page_size, total_pages }
 *
 * @param params.status     可选状态过滤（取 'fulfilled' 即可申诉的已核销订单）
 * @param params.page       页码（默认1）
 * @param params.page_size  每页数量（默认20）
 */
async function getMyRedemptionOrders(
  params: { status?: string | null; page?: number; page_size?: number } = {}
) {
  const { status = null, page = 1, page_size = 20 } = params
  const qs = buildQueryString({ status, page, page_size })
  return apiClient.request(`/shop/redemption/me?${qs}`, { method: 'GET', needAuth: true })
}

// ==================== 商家核销 ====================

/**
 * 用户创建核销订单（为自己的物品生成核销码）- POST /api/v4/shop/redemption/orders
 *
 * ⚠️ 业务澄清: 是用户自己为自己的物品生成核销码，不是商家为用户创建
 * req.user.user_id 作为 creator_user_id
 *
 * 请求Body: 仅需 { item_id: number }（item_id 必须是正整数）
 * 返回: 12位Base32格式核销码 XXXX-YYYY-ZZZZ（仅返回一次，系统不存储明文，只存SHA-256哈希）
 * 有效期: 30天（expires_at 字段标记过期时间）
 * 防重复: 依赖 code_hash 唯一约束（SHA-256），当前路由未读取 Header 幂等键
 *
 * Idempotency-Key 仍通过 Header 发送（符合 HTTP 标准实践，待后端补充读取逻辑）
 */
async function createRedemptionOrder(item_id: number) {
  if (!item_id || item_id <= 0 || !Number.isInteger(item_id)) {
    throw new Error('物品ID必须是正整数')
  }

  const idempotencyKey: string = await generateIdempotencyKey('redemption_create')

  return apiClient.request('/shop/redemption/orders', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: { item_id },
    needAuth: true,
    showLoading: true,
    loadingText: '生成核销码中...',
    showError: true,
    errorPrefix: '生成失败：'
  })
}

/**
 * 商家核销用户物品 - POST /api/v4/shop/redemption/fulfill
 * 需要商家权限（role_level>=20）
 */
async function fulfillRedemption(params: { redeem_code: string; store_id?: number }) {
  if (!params || !params.redeem_code) {
    throw new Error('核销码不能为空')
  }

  const idempotencyKey: string = await generateIdempotencyKey('redemption_fulfill')

  return apiClient.request('/shop/redemption/fulfill', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '核销中...',
    showError: true,
    errorPrefix: '核销失败：'
  })
}

/**
 * 商家扫描QR码核销 - POST /api/v4/shop/redemption/scan
 *
 * 解析 RQRV1_ 前缀的动态QR码内容，验证HMAC签名后执行核销。
 * 与 fulfillRedemption 区别：
 *   - fulfillRedemption: 手动输入12位Base32文本码（备用方式）
 *   - scanRedemptionQR:  扫描动态QR码（主要方式，含签名验证）
 *
 * 两个接口共用后端 RedemptionService.fulfillOrder()，区别在于入参来源。
 *
 * 后端服务: RedemptionQRSigner.js 验签 → RedemptionService.fulfillOrder() 核销
 * 权限要求: role_level >= 20（商家店员及以上）+ store_staff 活跃绑定校验
 *
 * 请求参数:
 *   qr_content - 扫码获取的完整QR码字符串（RQRV1_前缀）
 *   store_id   - 门店ID（多门店商家必填，单门店自动识别）
 *
 * 响应格式（同 fulfillRedemption，三表模型迁移后 item_instance → item）:
 *   order:    { redemption_order_id, fulfilled_at, fulfilled_store_id, fulfilled_by_staff_id }
 *   item:     { item_id, item_name, status }（原 item_instance 字段）
 *   redeemer: { user_id, nickname }
 *   store:    { store_id, store_name }
 *
 * @param params.qr_content - RQRV1_ 前缀的QR码完整内容
 * @param params.store_id - 门店ID（可选，多门店场景必填）
 */
async function scanRedemptionQR(params: { qr_content: string; store_id?: number }) {
  if (!params || !params.qr_content) {
    throw new Error('QR码内容不能为空')
  }
  if (!params.qr_content.startsWith('RQRV1_')) {
    throw new Error('无效的核销QR码格式，请确认扫描的是核销二维码')
  }

  const idempotencyKey: string = await generateIdempotencyKey('redemption_scan')

  return apiClient.request('/shop/redemption/scan', {
    method: 'POST',
    header: { 'Idempotency-Key': idempotencyKey },
    data: params,
    needAuth: true,
    showLoading: true,
    loadingText: '核销中...',
    showError: true,
    errorPrefix: '核销失败：'
  })
}

/**
 * 本店核销概况 - GET /api/v4/shop/redemption/store-stats?store_id=:id
 *
 * 门店专属兑换券业务线看板数据。返回本店待核销数 / 已核销数（按门店隔离，无 PII）。
 * 口径（以后端为准，前端零映射直读）：
 *   - fulfilled_count：本店已核销（redemption_orders.fulfilled_store_id = 本店）
 *   - pending_count：门店专属券待核销（scoped_store_id_list 含本店），通用券不计入
 *
 * 鉴权：登录 + 在职校验。manager 放行；staff 须被授权（can_view_redemption_stats=1），
 *   否则后端返回 403 + code='REDEMPTION_STATS_FORBIDDEN'。调用方应静默降级（不显示该卡），
 *   故此处 showLoading/showError 均关闭，由页面 try/catch 兜底，不打扰用户。
 *
 * @param store_id 门店ID（必填，多门店场景由调用方从 getMyStores 选定）
 */
async function getStoreRedemptionStats(store_id: number) {
  if (!store_id || store_id <= 0 || !Number.isInteger(store_id)) {
    throw new Error('门店ID必须是正整数')
  }

  const qs = buildQueryString({ store_id })
  return apiClient.request(`/shop/redemption/store-stats?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 查询本店员工列表（含核销概况查看授权状态）
 * GET /api/v4/shop/staff/list?store_id=:store_id&status=active
 *
 * 用途：员工核销权限管理页数据源。店长据此渲染员工列表 + 授权开关。
 *   复用后端现有门店员工管理接口（非新增），按门店上下文隔离：
 *   店长查本店；单店员工自动填充 store_id，多店须带 store_id。
 *
 * 鉴权（后端校验）：登录 + staff:read 能力 + 门店上下文隔离。
 *
 * 响应 data（snake_case，零映射直读）：
 *   staff[]: { store_staff_id, user_id, user_nickname, user_mobile,
 *              role_in_store('manager'|'staff'), can_view_redemption_stats, status }
 *   pagination: { total, page, page_size, total_pages }
 *
 * @param params.store_id   门店ID（多门店店长必填；单店可省略由后端填充）
 * @param params.status     在职状态过滤（默认 'active' 只看在职员工）
 * @param params.page       页码（默认1）
 * @param params.page_size  每页数量（默认20）
 */
/**
 * 查询本店员工列表（含核销概况查看授权状态）
 * GET /api/v4/shop/staff/list?store_id=:store_id&status=active
 *
 * 用途：员工核销权限管理页 + 「我的提交」员工视角选择器数据源。
 *   复用后端现有门店员工管理接口（非新增），按门店上下文隔离：
 *   店长查本店；单店员工自动填充 store_id，多店须带 store_id。
 *   后端已修复分页 bug（对接文档 §16.1）：page/page_size/include_deleted/role_in_store 均生效。
 *
 * 鉴权（后端校验）：登录 + staff:read 能力 + 门店上下文隔离。
 *
 * 响应 data（snake_case，零映射直读）：
 *   staff[]: { store_staff_id, user_id, user_nickname, user_mobile,
 *              role_in_store('manager'|'staff'), can_view_redemption_stats, status }
 *   pagination: { total, page, page_size, total_pages }
 *
 * @param params.store_id        门店ID（多门店店长必填；单店可省略由后端填充）
 * @param params.status          在职状态过滤（默认 'active' 只看在职员工）
 * @param params.role_in_store   角色过滤（'manager'/'staff'，可选）
 * @param params.include_deleted 是否含离职员工（true 查历史，员工视角查离职历史用，默认 false）
 * @param params.page            页码（默认1）
 * @param params.page_size       每页数量（默认20）
 */
async function getStoreStaffList(
  params: {
    store_id?: number
    status?: string
    role_in_store?: string
    include_deleted?: boolean
    page?: number
    page_size?: number
  } = {}
) {
  const {
    store_id,
    status = 'active',
    role_in_store,
    include_deleted,
    page = 1,
    page_size = 20
  } = params
  const qs = buildQueryString({
    store_id,
    status,
    role_in_store,
    include_deleted,
    page,
    page_size
  })
  return apiClient.request(`/shop/staff/list?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 店长授权店员查看本店核销概况
 * PUT /api/v4/shop/redemption/staff/:store_staff_id/stats-permission
 *
 * 业务语义：店长（manager）开关本店店员（staff）查看"本店核销概况"的权限。
 *   写 store_staff.can_view_redemption_stats。小程序 + Web 后台共用此后端接口。
 *
 * 鉴权（后端校验）：操作人须为该门店 active manager 或平台 admin；
 *   只能授权 role_in_store='staff'（对 manager 授权返回 REDEMPTION_NOT_ALLOWED）。
 *
 * 员工列表数据源：GET /shop/staff/list（getStoreStaffList，复用门店员工管理接口）。
 *
 * @param store_staff_id            门店员工记录ID（store_staff 主键，非 user_id）
 * @param can_view_redemption_stats true=授权查看 / false=取消授权
 */
async function setStaffRedemptionStatsPermission(
  store_staff_id: number,
  can_view_redemption_stats: boolean
) {
  if (!store_staff_id || store_staff_id <= 0 || !Number.isInteger(store_staff_id)) {
    throw new Error('门店员工ID必须是正整数')
  }

  return apiClient.request(`/shop/redemption/staff/${store_staff_id}/stats-permission`, {
    method: 'PUT',
    data: { can_view_redemption_stats: !!can_view_redemption_stats },
    needAuth: true,
    showLoading: true,
    loadingText: '处理中...',
    showError: true,
    errorPrefix: '授权操作失败：'
  })
}

module.exports = {
  getUserQRCode,
  getConsumptionBonusActivity,
  getMyConsumptionRecords,
  getConsumptionDetail,
  getMyStores,
  getUserInfoByQRCode,
  submitConsumption,
  getMerchantConsumptions,
  getMerchantConsumptionStats,
  createRedemptionOrder,
  fulfillRedemption,
  scanRedemptionQR,
  getMyRedemptionOrders,
  getStoreRedemptionStats,
  getStoreStaffList,
  setStaffRedemptionStatsPermission
}
