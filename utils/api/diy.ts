/**
 * DIY饰品设计引擎API
 * 后端路由: /api/v4/diy/
 *
 * 所有接口调用后端真实API，不使用Mock数据
 *
 * @file 天工餐厅积分系统 - DIY饰品设计API模块
 * @version 2.0.0
 * @since 2026-03-31
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ========== API 函数 ==========

/**
 * 获取款式模板列表
 * GET /api/v4/diy/templates
 */
async function getDiyTemplates(): Promise<API.ApiResponse<API.DiyTemplate[]>> {
  return apiClient.request('/diy/templates', { method: 'GET' })
}

/**
 * 获取单个模板详情
 * GET /api/v4/diy/templates/:id
 * @param templateId - 模板ID
 */
async function getDiyTemplateById(templateId: string): Promise<API.ApiResponse<API.DiyTemplate>> {
  return apiClient.request(`/diy/templates/${templateId}`, { method: 'GET' })
}

/**
 * 获取指定款式的素材分类
 * GET /api/v4/diy/categories?template_id=xxx
 * @param templateId - 模板ID，用于筛选该款式可用的素材分类
 */
async function getDiyCategories(templateId: string): Promise<API.ApiResponse<API.DiyCategory[]>> {
  const query = buildQueryString({ template_id: templateId })
  return apiClient.request(`/diy/categories${query}`, { method: 'GET' })
}

/**
 * 获取分类下的珠子/宝石列表
 * GET /api/v4/diy/beads?category_id=xxx
 * @param categoryId - 分类ID
 */
async function getDiyBeadsByCategory(categoryId: string): Promise<API.ApiResponse<API.DiyBead[]>> {
  const query = buildQueryString({ category_id: categoryId })
  return apiClient.request(`/diy/beads${query}`, { method: 'GET' })
}

/**
 * 保存设计
 * POST /api/v4/diy/designs
 * @param designData - 设计数据（手链/项链用beads格式，吊坠/戒指用slots格式）
 */
async function saveDiyDesign(
  designData: API.DiyDesignBeadsRequest | API.DiyDesignSlotsRequest
): Promise<API.ApiResponse<API.DiyDesignSaveResponse>> {
  return apiClient.request('/diy/designs', {
    method: 'POST',
    data: designData
  })
}

/**
 * 获取设计详情（分享还原）
 * GET /api/v4/diy/designs/:id
 * @param designId - 设计ID
 */
async function getDiyDesignById(designId: string): Promise<API.ApiResponse<API.DiyDesignDetail>> {
  return apiClient.request(`/diy/designs/${designId}`, { method: 'GET' })
}

module.exports = {
  getDiyTemplates,
  getDiyTemplateById,
  getDiyCategories,
  getDiyBeadsByCategory,
  saveDiyDesign,
  getDiyDesignById
}
