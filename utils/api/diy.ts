/**
 * DIY饰品设计引擎API模块
 *
 * 后端路由: /api/v4/diy/
 * 后端服务: DIYService.js (1345行)
 * 后端表: diy_templates(7条) + diy_works(0条) + diy_materials(61条)
 *
 * 接口清单（用户端13个）:
 *   模板: GET templates / GET templates/:id
 *   材料: GET templates/:id/materials / GET templates/:id/beads / GET materials/user / GET material-groups
 *   作品: GET works / GET works/:id / POST works / DELETE works/:id
 *   流程: POST works/:id/confirm / POST works/:id/complete / POST works/:id/cancel
 *   海报: GET works/:id/qrcode（⚠️ 需后端实现）
 *
 * 所有接口调用后端真实API，不使用Mock数据
 * 字段名使用后端蛇形命名，前端不做映射
 *
 * @file 天工餐厅积分系统 - DIY饰品设计API模块
 * @version 3.0.0
 * @since 2026-04-03
 */

const { apiClient } = require('./client')

// ========== 模板相关 ==========

/**
 * 获取已发布的款式模板列表
 * GET /api/v4/diy/templates?category_id=xxx
 *
 * 后端逻辑: DiyTemplate.findAll({ where: { status: 'published', is_enabled: 1 } })
 * 支持按 category_id 筛选（手链191/项链192/戒指193/吊坠194）
 *
 * @param categoryId - 可选，分类ID用于筛选（对应categories表的DIY子分类）
 * @returns 模板列表（含layout/bead_rules/sizing_rules/capacity_rules等完整配置）
 */
async function getDiyTemplates(categoryId?: number): Promise<API.ApiResponse<API.DiyTemplate[]>> {
  let url = '/diy/templates'
  if (categoryId) {
    url += `?category_id=${categoryId}`
  }
  return apiClient.request(url, { method: 'GET' })
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
  return apiClient.request(`/diy/templates/${templateId}`, { method: 'GET' })
}

// ========== 材料相关 ==========

/**
 * 获取模板可用的虚拟资产材料列表（含用户持有量）
 * GET /api/v4/diy/templates/:id/materials
 *
 * 后端逻辑: 查 MaterialAssetType（按模板的 material_group_codes 过滤）
 *          + MediaFile（icon图片）+ AccountAssetBalance（用户持有量）
 *
 * 返回字段: asset_code, display_name, group_code, form, tier,
 *          visible_value_points, image_url, available_amount, frozen_amount
 *
 * 前端按 group_code 分组展示（红red/橙orange/黄yellow/绿green/蓝blue/紫purple）
 * available_amount = 0 时灰显不可选
 *
 * @param templateId - 模板主键 diy_template_id
 */
async function getDiyTemplateMaterials(
  templateId: number
): Promise<API.ApiResponse<API.DiyMaterial[]>> {
  return apiClient.request(`/diy/templates/${templateId}/materials`, { method: 'GET' })
}

/**
 * 获取模板可用的实物珠子/宝石素材列表
 * GET /api/v4/diy/templates/:id/beads
 *
 * 后端逻辑: 按模板的 material_group_codes 过滤 diy_materials 表
 * 返回实物珠子商品信息: material_code, display_name, group_code, diameter, shape, price等
 *
 * 注意: 与 materials 接口不同 —
 *   materials 返回虚拟资产（源晶碎片/源晶，存在用户账户余额中）
 *   beads 返回实物珠子（diy_materials表，有独立库存和定价）
 *
 * @param templateId - 模板主键 diy_template_id
 */
async function getDiyTemplateBeads(templateId: number): Promise<API.ApiResponse<API.DiyBead[]>> {
  return apiClient.request(`/diy/templates/${templateId}/beads`, { method: 'GET' })
}

/**
 * 获取用户持有的材料列表
 * GET /api/v4/diy/materials/user?template_id=xxx
 *
 * 支持按模板筛选，查 AccountAssetBalance + MaterialAssetType
 *
 * @param templateId - 可选，按模板筛选可用材料
 */
async function getDiyUserMaterials(
  templateId?: number
): Promise<API.ApiResponse<API.DiyMaterial[]>> {
  let url = '/diy/materials/user'
  if (templateId) {
    url += `?template_id=${templateId}`
  }
  return apiClient.request(url, { method: 'GET' })
}

/**
 * 获取所有材料分组列表
 * GET /api/v4/diy/material-groups
 *
 * 返回: group_code + display_name 列表
 * 6个颜色分组: red(红)/orange(橙)/yellow(黄)/green(绿)/blue(蓝)/purple(紫)
 */
async function getDiyMaterialGroups(): Promise<API.ApiResponse<API.DiyMaterialGroup[]>> {
  return apiClient.request('/diy/material-groups', { method: 'GET' })
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
 * 分享还原时他人打开可直接加载设计方案
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
  const idempotencyKey = `diy_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
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
 * 后端逻辑: 调用微信 wxacode.getUnlimited 生成小程序码
 *          → 上传 Sealos 对象存储 → 返回图片URL
 *
 * 小程序码扫码后路径: /packageDIY/diy-design/diy-design?workId={diy_work_id}
 *
 * 返回: { qrcode_url: string }
 *
 * ⚠️ 此接口需后端实现（当前后端尚未提供，前端已对接调用逻辑）
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
 * 后端逻辑: 事务内逐项 BalanceService.freeze → 更新状态为 frozen
 * 冻结后材料被锁定不会被其他操作消耗
 *
 * 返回: { diy_work_id, status: 'frozen', frozen_at }
 *
 * @param workId - 作品主键 diy_work_id
 */
async function confirmDiyWork(workId: number): Promise<API.ApiResponse<API.DiyWorkStatusResponse>> {
  return apiClient.request(`/diy/works/${workId}/confirm`, { method: 'POST' })
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
 */
async function completeDiyWork(
  workId: number
): Promise<API.ApiResponse<API.DiyWorkStatusResponse>> {
  return apiClient.request(`/diy/works/${workId}/complete`, { method: 'POST' })
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
  /* 材料 */
  getDiyTemplateMaterials,
  getDiyTemplateBeads,
  getDiyUserMaterials,
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
