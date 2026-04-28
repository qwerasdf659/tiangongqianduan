/**
 * 资产系统API（余额 + 流水 + 资产转换）
 * 后端路由: routes/v4/assets/（通过Token识别用户）
 *
 * 包含功能:
 *   1. 余额查询: 单币种/多币种余额、今日汇总
 *   2. 流水查询: 资产交易记录
 *   3. 资产转换: 统一转换规则查询/预览/执行（对齐后端 asset_conversion_rules 统一表）
 *
 * 后端统一方案（2026-04-05）:
 *   旧 exchange_rates + material_conversion_rules 两套表已合并为 asset_conversion_rules
 *   旧 /assets/rates/* 路径已废弃，统一迁移到 /assets/conversion/*
 *   旧 exchange_rate_id 字段已更名为 conversion_rule_id
 *
 * @file 天工餐厅积分系统 - 资产API模块
 * @version 7.0.0
 * @since 2026-04-07（资产转换规则统一: /assets/rates → /assets/conversion）
 */

const { apiClient } = require('./client')
const { buildQueryString, generateIdempotencyKey } = require('../util')

// ==================== 余额与流水 ====================

/**
 * 获取当前用户资产余额 - GET /api/v4/assets/balance
 * 响应字段: asset_code, available_amount, frozen_amount, total_amount
 */
async function getPointsBalance(asset_code: string = 'points') {
  const qs = buildQueryString({ asset_code })
  return apiClient.request(`/assets/balance?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/** 获取用户资产流水 - GET /api/v4/assets/transactions */
async function getPointsTransactions(
  page: number = 1,
  page_size: number = 20,
  asset_code: string | null = null,
  business_type: string | null = null
) {
  const qs = buildQueryString({ page, page_size, asset_code, business_type })
  return apiClient.request(`/assets/transactions?${qs}`, { method: 'GET', needAuth: true })
}

/** 获取多种资产余额明细 - GET /api/v4/assets/balances */
async function getAssetBalances() {
  return apiClient.request('/assets/balances', { method: 'GET', needAuth: true })
}

/**
 * 获取今日资产汇总 - GET /api/v4/assets/today-summary
 *
 * 后端路由: routes/v4/assets/today-summary.js（决策D-1新增，资产域通用接口）
 * 后端服务: AssetQueryService.getTodaySummary({ user_id, asset_code })
 *
 * 响应字段:
 *   asset_code: 资产代码（如 'points'）
 *   today_earned: 今日获得总额（delta_amount > 0 的交易合计）
 *   today_consumed: 今日消费总额（delta_amount < 0 的交易绝对值合计）
 *   transaction_count: 今日交易笔数
 *
 * 支持任意 asset_code（points/star_stone/red_core_shard 等），前端只需更换查询参数
 *
 * @param asset_code - 资产代码，默认 'points'（积分）
 */
async function getTodaySummary(asset_code: string = 'points') {
  const qs = buildQueryString({ asset_code })
  return apiClient.request(`/assets/today-summary?${qs}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

// ==================== 资产转换（统一转换规则系统，对齐后端 asset_conversion_rules 表） ====================

/**
 * 获取所有可用资产转换规则
 * GET /api/v4/assets/conversion/rules
 *
 * 后端服务: AssetConversionRuleService.getAvailableRules()
 * 数据来源: asset_conversion_rules 表（status='active' + is_visible=true + 时间窗内）
 *
 * 响应 data 为数组，每条包含:
 *   conversion_rule_id - BIGINT 转换规则ID（主键）
 *   from_asset_code    - VARCHAR 源资产代码（如 red_core_shard）
 *   to_asset_code      - VARCHAR 目标资产代码（如 star_stone）
 *   rate_numerator     - STRING 汇率分子（后端返回字符串，前端需 Number() 转换）
 *   rate_denominator   - STRING 汇率分母（后端返回字符串，前端需 Number() 转换）
 *   rounding_mode      - ENUM floor/ceil/round 舍入模式
 *   min_from_amount    - STRING 最小转换数量
 *   max_from_amount    - STRING|null 最大转换数量
 *   daily_user_limit   - STRING|null 每用户每日限额
 *   fee_rate           - STRING 手续费率（DECIMAL，后端返回字符串）
 *   fee_min_amount     - STRING 最低手续费
 *   title              - VARCHAR|null 规则标题
 *   description        - TEXT|null 规则说明
 *   display_icon       - VARCHAR|null 展示图标
 *   display_category   - VARCHAR|null 运营自定义展示分类
 *   priority           - INT 优先级
 *   conversion_type    - VARCHAR 虚拟字段：compose（合成）/ decompose（分解）/ exchange（兑换）
 *   conversion_label   - VARCHAR 虚拟字段：中文标签（合成/分解/兑换）
 *   type_source        - VARCHAR 虚拟字段：auto（tier自动推导）/ manual（运营手动设置）
 *   from_display_name  - VARCHAR 源资产中文名
 *   to_display_name    - VARCHAR 目标资产中文名
 *   from_form          - VARCHAR 源资产形态（shard/gem/currency）
 *   to_form            - VARCHAR 目标资产形态
 *   from_tier          - INT 源资产阶级
 *   to_tier            - INT 目标资产阶级
 *   from_group_code    - VARCHAR 源资产颜色组（red/blue/...）
 *   to_group_code      - VARCHAR 目标资产颜色组
 */
async function getConversionRules() {
  return apiClient.request('/assets/conversion/rules', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 预览资产转换结果（不执行实际转换）
 * POST /api/v4/assets/conversion/preview
 *
 * 后端服务: AssetConversionRuleService.previewConvert()
 *
 * 请求体: { from_asset_code, to_asset_code, from_amount }
 *
 * 响应 data 包含:
 *   conversion_rule_id - STRING 匹配的转换规则ID
 *   from_asset_code    - VARCHAR 源资产代码
 *   to_asset_code      - VARCHAR 目标资产代码
 *   from_amount        - INT 扣减数量
 *   gross_amount       - INT 转换总量（手续费前）
 *   fee_amount         - INT 手续费
 *   net_amount         - INT 实际到账量（手续费后）
 *   fee_rate           - STRING 手续费率
 *   rate_numerator     - STRING 汇率分子
 *   rate_denominator   - STRING 汇率分母
 *   rounding_mode      - ENUM 舍入模式
 *   from_balance       - INT 当前源资产余额
 *   sufficient         - BOOLEAN 余额是否充足
 *
 * @param params.from_asset_code - 源资产代码
 * @param params.to_asset_code - 目标资产代码
 * @param params.from_amount - 转换数量（正整数）
 */
async function previewConversion(params: {
  from_asset_code: string
  to_asset_code: string
  from_amount: number
}) {
  if (!params.from_asset_code) {
    throw new Error('源资产代码不能为空')
  }
  if (!params.to_asset_code) {
    throw new Error('目标资产代码不能为空')
  }
  if (!params.from_amount || params.from_amount <= 0) {
    throw new Error('转换数量必须大于0')
  }

  return apiClient.request('/assets/conversion/preview', {
    method: 'POST',
    data: {
      from_asset_code: params.from_asset_code,
      to_asset_code: params.to_asset_code,
      from_amount: params.from_amount
    },
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: '预览转换失败：'
  })
}

/**
 * 执行资产转换
 * POST /api/v4/assets/conversion/convert
 * 携带 Idempotency-Key 请求头（幂等键属于请求元数据，放在 Header 中，非请求体字段）
 *
 * 后端服务: AssetConversionRuleService.executeConvert()（事务内三方记账）
 *
 * 核心流程:
 *   1. 查 asset_conversion_rules 表匹配转换规则（时间窗+优先级+status=active）
 *   2. 计算 to_amount = rounding_mode(from_amount × rate_numerator ÷ rate_denominator)
 *   3. 校验 daily_user_limit / daily_global_limit
 *   4. 事务内三方记账：
 *      a. BalanceService.changeBalance: 用户扣减源资产（business_type='asset_convert_debit', counterpart=SYSTEM_BURN）
 *      b. BalanceService.changeBalance: 用户增加目标资产（business_type='asset_convert_credit', counterpart=SYSTEM_MINT）
 *      c. 手续费入 SYSTEM_PLATFORM_FEE（business_type='asset_convert_fee'）
 *   5. 双录记账流水自动产生
 *
 * 响应 data 包含:
 *   conversion_rule_id - INT 匹配的转换规则ID
 *   from_asset_code    - VARCHAR 源资产代码
 *   to_asset_code      - VARCHAR 目标资产代码
 *   from_amount        - INT 扣减数量
 *   gross_amount       - INT 转换总量（手续费前）
 *   fee_amount         - INT 手续费
 *   net_amount         - INT 实际到账量
 *   idempotency_key    - VARCHAR 幂等键
 *
 * @param params.from_asset_code - 源资产代码
 * @param params.to_asset_code - 目标资产代码
 * @param params.from_amount - 转换数量（正整数）
 */
async function executeConversion(params: {
  from_asset_code: string
  to_asset_code: string
  from_amount: number
}) {
  if (!params.from_asset_code) {
    throw new Error('源资产代码不能为空')
  }
  if (!params.to_asset_code) {
    throw new Error('目标资产代码不能为空')
  }
  if (!params.from_amount || params.from_amount <= 0) {
    throw new Error('转换数量必须大于0')
  }

  /* 幂等键格式: convert_{user_id}_{from}_{to}_{amount}_{timestamp}（文档建议格式） */
  const idempotencyKey = await generateIdempotencyKey(
    'convert',
    params.from_asset_code,
    params.to_asset_code,
    params.from_amount
  )
  return apiClient.request('/assets/conversion/convert', {
    method: 'POST',
    data: {
      from_asset_code: params.from_asset_code,
      to_asset_code: params.to_asset_code,
      from_amount: params.from_amount
    },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '转换中...',
    showError: true,
    errorPrefix: '转换失败：'
  })
}

module.exports = {
  getPointsBalance,
  getPointsTransactions,
  getAssetBalances,
  getConversionRules,
  getTodaySummary,
  previewConversion,
  executeConversion
}
