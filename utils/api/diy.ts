/**
 * DIY饰品设计引擎API模块
 *
 * 后端路由: /api/v4/diy/（对接文档《DIY饰品定制-微信小程序前端对接文档.md》第三章）
 * 后端服务: DiyServiceFacade → TemplateService / WorkService / MaterialService / QRCodeService
 * 后端表: diy_templates（模板） + diy_materials（素材） + diy_works（用户作品）
 *
 * 接口清单（用户端 13 个端点 + 作品小程序码）:
 *   模板: GET templates / GET templates/:id / GET templates/:id/estimate（手围算珠）
 *   材料: GET templates/:id/payment-assets / GET templates/:id/beads / GET material-groups
 *   作品: GET works / GET works/:id / POST works / DELETE works/:id
 *   流程: POST works/:id/confirm / POST works/:id/complete / POST works/:id/cancel
 *   分享: GET works/:id/qrcode（作品小程序码）
 *
 * 所有接口调用后端真实API，不使用Mock数据
 * 字段名使用后端蛇形命名，前端不做映射层（对接文档 5.2）
 *
 * @file 天工平台 - DIY饰品设计API模块
 * @version 4.0.0
 * @since 2026-04-03
 */

const { apiClient } = require('./client')
const { generateIdempotencyKey } = require('../util')

// ========== 模板相关 ==========

/**
 * 获取已发布的款式模板列表
 * GET /api/v4/diy/templates
 *
 * 对接文档 3.3-①: 无查询参数。后端仅返回 status='published' 且 is_enabled=true 的模板，
 * 按 sort_order 升序；前端按返回的 category_id 自行分组/筛选展示（不向后端传分类参数）。
 *
 * 媒体字段（preview_media/base_image_media）经后端 toSafeJSON 收敛为 5 字段最小集
 * { media_id, width, height, public_url, thumbnails:{w375,w750,w1080} }
 *
 * @returns 模板对象数组（含layout/bead_rules/sizing_rules/capacity_rules等完整配置）
 */
async function getDiyTemplates(): Promise<API.ApiResponse<API.DiyTemplate[]>> {
  return apiClient.request('/diy/templates', { method: 'GET', needAuth: false })
}

/**
 * 获取单个模板详情
 * GET /api/v4/diy/templates/:id
 *
 * 返回完整模板数据: layout/bead_rules/sizing_rules/capacity_rules + 关联的Category和MediaFile
 * 前端据此判断串珠/镶嵌模式（layout.shape === 'slots' ? 镶嵌 : 串珠）
 *
 * @param templateId - 模板主键 diy_template_id
 */
async function getDiyTemplateById(templateId: number): Promise<API.ApiResponse<API.DiyTemplate>> {
  return apiClient.request(`/diy/templates/${templateId}`, { method: 'GET', needAuth: false })
}

// ========== 材料相关 ==========

/**
 * 手围算珠估算（后端权威换算，拍板 Q2 方案甲，手围驱动方案 §11.3）
 * GET /api/v4/diy/templates/:id/estimate?wrist_size_mm=150&diameter=8
 *
 * 后端逻辑: TemplateService.estimateBeadCount —
 *   target_length_mm 优先取 size_options 中 wrist_size_mm 完全匹配档位的配置值，
 *   否则 = wrist_size_mm + elastic_margin_mm；
 *   recommend_bead_count = round(target_length_mm / diameter)，并按 capacity_rules 收敛。
 * 换算规则收敛在后端一处，前端不写换算公式（§11.8-2）。
 *
 * 公开接口（与模板查询一致无需登录）；所有长度字段单位为毫米，展示层 ÷10 保留 1 位小数。
 * 项链模板: 把用户所选佩戴长度毫米值作为 wrist_size_mm 传入（后端按 target_length_mm 命中档位，§16.3-4）。
 *
 * 业务错误码（响应顶层 code）: DIY_TEMPLATE_NOT_BEADING / DIY_SIZING_RULES_MISSING
 *
 * @param templateId - 模板主键 diy_template_id
 * @param params - 估算参数（wrist_size_mm 手围毫米值 / diameter 主珠径毫米值）
 */
async function getDiyEstimate(
  templateId: number,
  params: { wrist_size_mm: number; diameter: number }
): Promise<API.ApiResponse<API.DiyEstimateResult>> {
  const query = `wrist_size_mm=${params.wrist_size_mm}&diameter=${params.diameter}`
  return apiClient.request(`/diy/templates/${templateId}/estimate?${query}`, {
    method: 'GET',
    needAuth: false
  })
}

/**
 * 获取用户支付资产余额（需登录）
 * GET /api/v4/diy/templates/:id/payment-assets
 *
 * 返回该模板下珠子使用的定价货币 + 用户余额，用于确认设计前展示钱包
 *
 * 返回字段: asset_code, display_name, group_code, form, tier,
 *          visible_value_points, image_url, available_amount, frozen_amount
 *
 * 前端用途: 确认设计时弹出支付面板，展示用户可用资产余额
 *
 * @param templateId - 模板主键 diy_template_id
 */
async function getDiyPaymentAssets(
  templateId: number
): Promise<API.ApiResponse<API.DiyMaterial[]>> {
  return apiClient.request(`/diy/templates/${templateId}/payment-assets`, { method: 'GET' })
}

/**
 * 获取模板可用的实物珠子/宝石/配饰/吊坠素材列表
 * GET /api/v4/diy/templates/:id/beads
 *
 * 后端逻辑: 按模板的 material_group_codes 过滤 diy_materials 表（返回数组、无分页、上限 200 条）
 * 返回实物素材商品信息（对接文档 13.1-A/D）:
 *   基础: material_code / display_name / group_code / diameter / shape / price / price_asset_code
 *   库存: stock 掩码三值 -1无限 / 0售罄 / 1有货（拍板③，勿依赖精确数量）
 *   大类: item_type（beads珠子/accessories配饰/pendants吊坠，素材类型 Tab 数据源）
 *   展示: material_type / five_elements / weight / meaning / energy / pairing
 *   异形珠几何: size_length_mm / size_width_mm / bore_orientation
 *   图片: image_media 经 toSafeJSON 收敛为 5 字段最小集（降级链 thumbnails.w750/w375 → public_url）
 *
 * 查询参数:
 *   item_type  — 素材大类过滤：beads / accessories / pendants（默认不传返回全部大类，11.5-B）
 *   slot_id    — 传入槽位 ID 后，后端自动按该槽位的 allowed_diameters 过滤
 *   group_code — 按颜色分组筛选：red/orange/yellow/green/blue/purple
 *   diameter   — 按直径筛选（mm）
 *   keyword    — 关键词搜索
 *
 * @param templateId - 模板主键 diy_template_id
 * @param params - 可选查询参数（item_type / slot_id / group_code / diameter / keyword）
 */
async function getDiyTemplateBeads(
  templateId: number,
  params?: {
    item_type?: string
    slot_id?: string
    group_code?: string
    diameter?: number
    keyword?: string
  }
): Promise<API.ApiResponse<API.DiyBead[]>> {
  let url = `/diy/templates/${templateId}/beads`
  if (params) {
    const queryParts: string[] = []
    if (params.item_type) {
      queryParts.push(`item_type=${encodeURIComponent(params.item_type)}`)
    }
    if (params.slot_id) {
      queryParts.push(`slot_id=${encodeURIComponent(params.slot_id)}`)
    }
    if (params.group_code) {
      queryParts.push(`group_code=${encodeURIComponent(params.group_code)}`)
    }
    if (params.diameter !== undefined) {
      queryParts.push(`diameter=${params.diameter}`)
    }
    if (params.keyword) {
      queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`)
    }
    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`
    }
  }
  return apiClient.request(url, { method: 'GET', needAuth: false })
}

/**
 * 获取所有材料分组列表（分组 Tab 数据源）
 * GET /api/v4/diy/material-groups
 *
 * 后端逻辑（三端落地方案 拍板 16 / F.7-④）: diy_materials 按 group_code 聚合 count，
 * 再经 DisplayNameService 从 system_dictionaries(dict_type='diy_material_group')
 * 下发 display_name + color_hex（DIY 自有字典，不 join asset_group_defs）。
 *
 * 返回: [{ group_code, count, display_name, color_hex }]（公开接口，无需登录）
 * 小程序分组 Tab 直接消费 display_name / color_hex，不做本地 label 映射。
 */
async function getDiyMaterialGroups(): Promise<API.ApiResponse<API.DiyMaterialGroup[]>> {
  return apiClient.request('/diy/material-groups', { method: 'GET', needAuth: false })
}

// ========== 作品相关 ==========

/**
 * 获取当前用户的作品列表（需登录）
 * GET /api/v4/diy/works
 *
 * 三端落地方案 F.7-⑦（后端真实代码实测契约）:
 *   Query（可选）: page / page_size（默认 20） / status（draft/frozen/completed/cancelled）；
 *   响应 data 为 { rows, count }（rows=当前页作品数组，count=符合条件总数）。
 * ⚠️ 后端默认每页 20 条，作品多的用户必须分页翻页拉全（page 自增，累计 rows 达 count 即到底）。
 * 作品挂在 account_id 上，后端由登录态 user_id 自动换算，前端无需关心 account_id。
 *
 * @param params - 可选参数（page 页码 1 起 / page_size 每页条数 / status 状态 / template_id / keyword）
 */
async function getDiyWorks(params?: {
  page?: number
  page_size?: number
  status?: string
  template_id?: number
  keyword?: string
}): Promise<API.ApiResponse<API.DiyWorksListResult>> {
  let url = '/diy/works'
  if (params) {
    const queryParts: string[] = []
    if (params.page) {
      queryParts.push(`page=${params.page}`)
    }
    if (params.page_size) {
      queryParts.push(`page_size=${params.page_size}`)
    }
    if (params.status) {
      queryParts.push(`status=${encodeURIComponent(params.status)}`)
    }
    if (params.template_id) {
      queryParts.push(`template_id=${params.template_id}`)
    }
    if (params.keyword) {
      queryParts.push(`keyword=${encodeURIComponent(params.keyword)}`)
    }
    if (queryParts.length > 0) {
      url += `?${queryParts.join('&')}`
    }
  }
  return apiClient.request(url, { method: 'GET' })
}

/**
 * 获取作品详情（也用于分享还原）
 * GET /api/v4/diy/works/:id
 *
 * 返回完整作品数据: 含 template（完整layout/rules）+ design_data + total_cost + preview_media
 *
 * 非作者只读（拍板②，对接文档 13.1-E）:
 *   仅 status IN ('frozen','completed') 的作品可被非作者读取（草稿/已取消返回 403），仍要求登录；
 *   非作者拿到的是脱敏版（去 account_id / idempotency_key / total_cost.price_snapshot，
 *   保留 payments 汇总 + design_data / work_name / template，媒体字段 toSafeJSON 5 字段最小集）
 *   → 分享还原场景：好友打开 workId 链接可直接加载设计方案；草稿分享仍 403，落地页兜底
 *
 * @param workId - 作品主键 diy_work_id
 */
async function getDiyWorkById(workId: number): Promise<API.ApiResponse<API.DiyWork>> {
  return apiClient.request(`/diy/works/${workId}`, { method: 'GET' })
}

/**
 * 保存作品（创建 / 更新草稿）
 * POST /api/v4/diy/works
 *
 * 对接文档 3.3-⑨: 请求体不传 diy_work_id = 新建草稿；传了 = 更新该草稿。
 * 保存阶段后端只校验所用 material_code 存在且启用（不计价、不冻结），
 * total_cost 由后端在 confirm 阶段计算，saveWork 不接受前端传入的 total_cost。
 *
 * 幂等机制: 通过请求头 Idempotency-Key 保证（HTTP 标准实践，幂等键属请求元数据放 Header）
 *
 * @param workData - 作品数据（diy_template_id / work_name / design_data / 可选 diy_work_id、preview_media_id）
 */
async function saveDiyWork(
  workData: API.DiyWorkCreateRequest
): Promise<API.ApiResponse<API.DiyWorkCreateResponse>> {
  /** 生成幂等键（时间戳 + 随机数，防止重复提交） */
  const idempotencyKey = await generateIdempotencyKey('diy_save_work')
  return apiClient.request('/diy/works', {
    method: 'POST',
    data: workData,
    header: {
      'Idempotency-Key': idempotencyKey
    }
  })
}

/**
 * 删除作品（仅 draft 状态可删）
 * DELETE /api/v4/diy/works/:id
 *
 * @param workId - 作品主键 diy_work_id
 */
async function deleteDiyWork(workId: number): Promise<API.ApiResponse<void>> {
  return apiClient.request(`/diy/works/${workId}`, { method: 'DELETE' })
}

// ========== 海报/分享 ==========

/**
 * 获取作品小程序码图片URL（海报/分享用，需登录）
 * GET /api/v4/diy/works/:id/qrcode
 *
 * 对接文档 3.3-⑭: 首次调用生成微信小程序码并缓存到对象存储返回 URL，后续直接返回缓存 URL；
 * scene 参数格式为 diy_work_id={id}，他人扫码进入该作品。仅 frozen/completed 作品可生成。
 *
 * 返回: { qrcode_url: string }
 *
 * ⚠️ 可用性依赖小程序首次提审发布页面路径（拍板⑦）:
 *   提审前 wxacode 生成会失败，前端按 DIY_QRCODE_ENABLED 常量隐藏二维码入口（diy-result），
 *   提审通过后置 true 即启用，本方法零改动
 *
 * @param workId - 作品主键 diy_work_id
 */
async function getDiyWorkQrcode(workId: number): Promise<API.ApiResponse<{ qrcode_url: string }>> {
  return apiClient.request(`/diy/works/${workId}/qrcode`, { method: 'GET' })
}

// ========== 结算流程（三步状态机: draft → frozen → completed/cancelled） ==========

/**
 * 确认设计 — 冻结材料（draft → frozen）
 * POST /api/v4/diy/works/:id/confirm
 *
 * 后端流程（对接文档 3.3-⑪）:
 *   1. 从 design_data 提取逐颗 material_code → 查真实单价按币种汇总应付（Math.ceil 向上取整）
 *   2. 校验颗数/成品长度硬约束（串珠模式）→ 校验 payments 每币种实付 ≥ 应付
 *   3. 逐项冻结资产 → 写 total_cost 快照（price_snapshot 定价快照 + payments 实冻明细）
 *
 * 返回: 冻结后的完整作品对象（status='frozen'，含 total_cost）
 * payments 约束（对接文档 5.3）: asset_code 仅限 star_stone / 源晶体系，禁止 points/budget_points；
 * amount 必须为正数，金额以后端返回为准（前端只做预估展示）。
 *
 * 业务错误码（HTTP 400，错误码在响应顶层 code 字段，data 内带毫米/颗数明细，§16.3-5）:
 *   DIY_BEAD_COUNT_OUT_OF_RANGE — 颗数超出 capacity_rules 范围，data: { bead_count, min_beads, max_beads }
 *   DIY_LENGTH_EXCEED_LIMIT    — 成品长度超上限，data: { current_length_mm, target_length_mm, max_length_mm }
 *   DIY_LENGTH_BELOW_MIN       — 成品长度低于下限，data: { current_length_mm, min_length_mm }
 *   DIY_MATERIAL_SIZE_MISSING  — 素材物理数据不完整无法精确校验，data: { material_codes: [...] }
 * showError:false — 错误展示由调用方（diy-result 页）按错误码做引导文案，不走客户端通用 toast
 *
 * @param workId - 作品主键 diy_work_id
 * @param payments - 支付明细（按 asset_code 分组，每项指定用哪种资产支付多少）
 */
async function confirmDiyWork(
  workId: number,
  payments: API.DiyTotalCostItem[]
): Promise<API.ApiResponse<API.DiyWork>> {
  return apiClient.request(`/diy/works/${workId}/confirm`, {
    method: 'POST',
    data: { payments },
    showError: false
  })
}

/**
 * 完成设计 — 从冻结扣减 + 铸造物品（frozen → completed）
 * POST /api/v4/diy/works/:id/complete
 *
 * 后端流程（对接文档 3.3-⑫）:
 *   1. 从冻结余额扣减 → 铸造 items 物品实例（写 item_ledger 双录）→ 回填 item_id
 *   2. 写 exchange_records（含地址快照，打通实物发货）
 *
 * 返回: 完成后的完整作品对象（status='completed'，含 item_id / completed_at）
 *
 * @param workId - 作品主键 diy_work_id
 * @param addressId - 可选，收货地址ID（user_addresses 表）；传入后后端生成 address_snapshot，
 *                    不传则订单地址为空，可由管理员后台补录（或后续引导用户补填）
 */
async function completeDiyWork(
  workId: number,
  addressId?: number
): Promise<API.ApiResponse<API.DiyWork>> {
  const requestData: Record<string, any> = {}
  if (addressId) {
    requestData.address_id = addressId
  }
  return apiClient.request(`/diy/works/${workId}/complete`, {
    method: 'POST',
    data: requestData
  })
}

/**
 * 取消设计 — 解冻材料（frozen → cancelled）
 * POST /api/v4/diy/works/:id/cancel
 *
 * 对接文档 3.3-⑬: 无请求体。仅 frozen 状态可取消（其他状态返回 409），
 * 后端事务内逐项解冻已冻结资产，作品变 cancelled（终态，只读）。
 *
 * 返回: 取消后的完整作品对象（status='cancelled'）
 *
 * @param workId - 作品主键 diy_work_id
 */
async function cancelDiyWork(workId: number): Promise<API.ApiResponse<API.DiyWork>> {
  return apiClient.request(`/diy/works/${workId}/cancel`, { method: 'POST' })
}

module.exports = {
  /* 模板 */
  getDiyTemplates,
  getDiyTemplateById,
  getDiyEstimate,
  /* 材料 */
  getDiyPaymentAssets,
  getDiyTemplateBeads,
  getDiyMaterialGroups,
  /* 作品 */
  getDiyWorks,
  getDiyWorkById,
  saveDiyWork,
  deleteDiyWork,
  /* 结算流程 */
  confirmDiyWork,
  completeDiyWork,
  cancelDiyWork,
  /* 海报/分享 */
  getDiyWorkQrcode
}
