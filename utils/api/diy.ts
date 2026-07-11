/**
 * DIY饰品设计引擎API模块
 *
 * 后端路由: /api/v4/diy/
 * 后端服务: DIYService.js (1345行)
 * 后端表: diy_templates(7条) + diy_works(0条) + diy_materials(61条)
 *
 * 接口清单（用户端13个 + 海报1个）:
 *   模板: GET templates / GET templates/:id / GET templates/:id/estimate（手围算珠）
 *   材料: GET templates/:id/payment-assets / GET templates/:id/beads / GET material-groups
 *   作品: GET works / GET works/:id / POST works / DELETE works/:id
 *   流程: POST works/:id/confirm / POST works/:id/complete / POST works/:id/cancel
 *   海报: GET works/:id/qrcode（⚠️ 需后端实现）
 *
 * 所有接口调用后端真实API，不使用Mock数据
 * 字段名使用后端蛇形命名，前端不做映射
 *
 * @file 天工平台 - DIY饰品设计API模块
 * @version 3.0.0
 * @since 2026-04-03
 */

const { apiClient } = require('./client')
const { generateIdempotencyKey } = require('../util')

/** DIY 小程序码接口未开通时的前端提示文案（避免生成伪二维码或静默降级为真实码） */
const DIY_QRCODE_UNAVAILABLE_MESSAGE =
  '后端暂未开通 DIY 小程序码接口，请让后端提供 GET /api/v4/diy/works/:id/qrcode'

// ========== 模板相关 ==========

/**
 * 获取已发布的款式模板列表
 * GET /api/v4/diy/templates?category_id=xxx
 *
 * 后端逻辑: DiyTemplate.findAll({ where: { status: 'published', is_enabled: 1 } })
 * 支持按 category_id 筛选（手链191/项链192/戒指193/吊坠194/耳饰291/手机链包挂292/108佛珠293，
 * 291~293 为 seeder 实际落库 ID，对接文档 13.1-F）
 *
 * 媒体字段（preview_media/base_image_media）经后端 toSafeJSON 收敛为 5 字段最小集
 * { media_id, width, height, public_url, thumbnails:{w375,w750,w1080} }（对接文档 13.1-D）
 *
 * @param categoryId - 可选，分类ID用于筛选（对应categories表的DIY子分类）
 * @returns 模板列表（含layout/bead_rules/sizing_rules/capacity_rules等完整配置）
 */
async function getDiyTemplates(categoryId?: number): Promise<API.ApiResponse<API.DiyTemplate[]>> {
  let url = '/diy/templates'
  if (categoryId) {
    url += `?category_id=${categoryId}`
  }
  return apiClient.request(url, { method: 'GET', needAuth: false })
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
 * 获取所有材料分组列表
 * GET /api/v4/diy/material-groups
 *
 * 后端路由: routes/v4/diy.js 第81行
 * 服务层: DIYService.getMaterialGroups()
 * 数据库: diy_materials 表（21条材料），通过 group_code 字段 GROUP BY 聚合
 * 无独立 diy_material_groups 表
 *
 * 返回: [{ group_code, count, sample_name }]
 * 6个颜色分组: red(红3)/orange(橙2)/yellow(黄8)/green(绿3)/blue(蓝2)/purple(紫3)
 *
 * ⚠️ 后端已确认: sample_name 字段已通过 MIN(display_name) 聚合返回
 *    后端返回 data 直接是数组 [{ group_code, count, sample_name }]，非 { groups: [...] }
 *    前端 diy-design.ts 从珠子数据自行聚合生成 sample_name 作为备用方案
 */
async function getDiyMaterialGroups(): Promise<API.ApiResponse<API.DiyMaterialGroup[]>> {
  return apiClient.request('/diy/material-groups', { method: 'GET', needAuth: false })
}

// ========== 作品相关 ==========

/**
 * 获取当前用户的作品列表
 * GET /api/v4/diy/works
 *
 * 后端逻辑: DiyWork.findAll({ where: { account_id } })
 * 返回所有状态的作品（draft/frozen/completed/cancelled）
 */
async function getDiyWorks(): Promise<API.ApiResponse<API.DiyWork[]>> {
  return apiClient.request('/diy/works', { method: 'GET' })
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
 * 保存设计草稿（创建或更新）
 * POST /api/v4/diy/works
 *
 * 后端逻辑: 校验模板+材料合法性，计算 total_cost
 * 返回: { diy_work_id, work_code, status: 'draft' }
 *
 * 幂等机制: 通过请求头 Idempotency-Key 保证
 *
 * @param workData - 作品数据（含模板ID、设计数据、材料消耗）
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
 * 获取作品小程序码图片URL（海报生成用）
 * GET /api/v4/diy/works/:id/qrcode
 *
 * 后端逻辑（对接文档 13.1-C，已实现）: 作者校验 → Sealos 确定性路径缓存命中检查 →
 *   未命中调微信 wxacode.getUnlimited（scene=diy_work_id={id}，page=packageDIY/diy-lite/diy-lite）
 *   → 上传 Sealos 回 URL。仅 frozen/completed 作品可生成。
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
  try {
    return await apiClient.request(`/diy/works/${workId}/qrcode`, { method: 'GET' })
  } catch (error: any) {
    const normalizedError = error || {}
    if (
      normalizedError.code === 'NOT_FOUND' ||
      normalizedError.statusCode === 404 ||
      normalizedError.code === 'BAD_REQUEST'
    ) {
      const unavailableError: any = new Error(DIY_QRCODE_UNAVAILABLE_MESSAGE)
      unavailableError.code = 'DIY_QRCODE_API_UNAVAILABLE'
      unavailableError.statusCode = normalizedError.statusCode || 404
      throw unavailableError
    }
    throw error
  }
}

// ========== 结算流程（三步状态机: draft → frozen → completed/cancelled） ==========

/**
 * 确认设计 — 冻结材料（draft → frozen）
 * POST /api/v4/diy/works/:id/confirm
 *
 * 后端逻辑:
 *   0. 冻结前设计约束硬校验 _validateDesignConstraints（颗数兜底 + 长度校验，拍板 Q4，§11.4）
 *   1. 根据 design_data 查 diy_materials 当前价格计算 total_price
 *   2. 校验 payments 总额覆盖 total_price
 *   3. 事务内逐项 BalanceService.freeze → 更新状态为 frozen
 *   4. 生成 total_cost 快照保存到 diy_works
 *
 * 返回: { diy_work_id, status: 'frozen', frozen_at }
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
): Promise<API.ApiResponse<API.DiyWorkStatusResponse>> {
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
 * 后端逻辑:
 *   1. BalanceService.settleFromFrozen — 从冻结余额扣减
 *   2. ItemService.mintItem — 铸造 items 实例（item_type='diy_product'）
 *   3. 写 item_ledger 双录流水
 *
 * 返回: { diy_work_id, status: 'completed', item_id, completed_at }
 *
 * @param workId - 作品主键 diy_work_id
 * @param addressId - 可选，收货地址ID，传入后后端快照收货地址到 exchange_records
 */
async function completeDiyWork(
  workId: number,
  addressId?: number
): Promise<API.ApiResponse<API.DiyWorkStatusResponse>> {
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
 * 后端逻辑: 事务内逐项 BalanceService.unfreeze → 更新状态为 cancelled
 * 超时保护: frozen 状态超过24小时自动 cancel
 *
 * 返回: { diy_work_id, status: 'cancelled' }
 *
 * @param workId - 作品主键 diy_work_id
 */
async function cancelDiyWork(workId: number): Promise<API.ApiResponse<API.DiyWorkStatusResponse>> {
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
