/**
 * 资产系统API（余额 + 流水 + 汇率兑换）
 * 后端路由: routes/v4/assets/（通过Token识别用户）
 *
 * 包含功能:
 *   1. 余额查询: 单币种/多币种余额、今日汇总
 *   2. 流水查询: 资产交易记录
 *   3. 汇率兑换: 规则查询/预览/执行（Phase 3 从 /market/exchange-rates 迁移到 /assets/rates）
 *
 * @file 天工餐厅积分系统 - 资产API模块
 * @version 6.0.0
 * @since 2026-03-25（Phase 3 路径迁移: 汇率兑换 /market/exchange-rates → /assets/rates）
 */

const { apiClient } = require('./client')
const { buildQueryString } = require('../util')

// ==================== 余额与流水 ====================

/**
 * 获取当前用户资产余额 - GET /api/v4/assets/balance
 * 响应字段: asset_code, available_amount, frozen_amount, total_amount
 */
async function getPointsBalance(asset_code: string = 'points') {
  const qs = buildQueryString({ asset_code })
  return apiClient.request(`/assets/balance?${qs}`, { method: 'GET', needAuth: true })
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

/** 获取资产转换规则 - GET /api/v4/assets/conversion-rules */
async function getConversionRules() {
  return apiClient.request('/assets/conversion-rules', { method: 'GET', needAuth: true })
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
  return apiClient.request(`/assets/today-summary?${qs}`, { method: 'GET', needAuth: true })
}

// ==================== 汇率兑换（固定汇率兑换系统，Phase 3 迁移到资产域） ====================

/**
 * 获取所有可用汇率规则
 * GET /api/v4/assets/rates
 *
 * 后端服务: ExchangeRateService.getAllRates()
 * 数据来源: exchange_rates 表（status='active' 且在生效时间窗内）
 *
 * 响应 data 为数组，每条包含:
 *   exchange_rate_id - BIGINT 汇率规则ID
 *   from_asset_code  - VARCHAR 源资产代码（如 red_core_shard）
 *   to_asset_code    - VARCHAR 目标资产代码（如 star_stone）
 *   rate_numerator   - BIGINT 汇率分子
 *   rate_denominator - BIGINT 汇率分母
 *   rate_display     - VARCHAR 汇率文本描述（如 "10:1"）
 *   min_from_amount  - BIGINT 最小兑换数量
 *   max_from_amount  - BIGINT|null 最大兑换数量
 *   daily_user_limit - BIGINT|null 每用户每日限额
 *   fee_rate         - DECIMAL 手续费率
 *   status           - ENUM active/paused/disabled
 *   description      - VARCHAR|null 汇率说明
 */
async function getExchangeRates() {
  return apiClient.request('/assets/rates', {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: false
  })
}

/**
 * 获取特定币对汇率
 * GET /api/v4/assets/rates/:from/:to
 *
 * @param fromAssetCode - 源资产代码（如 'red_core_shard'）
 * @param toAssetCode - 目标资产代码（如 'star_stone'）
 */
async function getExchangeRatePair(fromAssetCode: string, toAssetCode: string) {
  if (!fromAssetCode || !toAssetCode) {
    throw new Error('源资产代码和目标资产代码不能为空')
  }
  return apiClient.request(`/assets/rates/${fromAssetCode}/${toAssetCode}`, {
    method: 'GET',
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: '获取汇率失败：'
  })
}

/**
 * 预览兑换结果（不执行实际兑换）
 * POST /api/v4/assets/rates/preview
 *
 * 后端服务: ExchangeRateService.previewConvert()
 *
 * 请求体: { from_asset_code, to_asset_code, from_amount }
 *
 * 响应 data 包含:
 *   from_amount       - BIGINT 扣减数量
 *   gross_to_amount   - BIGINT 兑换总量（手续费前）
 *   fee_amount        - BIGINT 手续费
 *   net_to_amount     - BIGINT 实际到账量（手续费后）
 *   rate_display      - VARCHAR 汇率文本
 *   user_balance      - BIGINT 当前源资产余额
 *   sufficient_balance - BOOLEAN 余额是否充足
 *   daily_user_limit  - BIGINT|null 每日限额
 *   daily_used        - BIGINT 今日已用
 *   daily_remaining   - BIGINT|null 今日剩余
 *
 * @param params.from_asset_code - 源资产代码
 * @param params.to_asset_code - 目标资产代码
 * @param params.from_amount - 兑换数量
 */
async function previewExchangeRate(params: {
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
    throw new Error('兑换数量必须大于0')
  }

  return apiClient.request('/assets/rates/preview', {
    method: 'POST',
    data: {
      from_asset_code: params.from_asset_code,
      to_asset_code: params.to_asset_code,
      from_amount: params.from_amount
    },
    needAuth: true,
    showLoading: false,
    showError: true,
    errorPrefix: '预览兑换失败：'
  })
}

/**
 * 执行汇率兑换
 * POST /api/v4/assets/rates/convert
 * 携带 Idempotency-Key 请求头（幂等键属于请求元数据，放在 Header 中）
 *
 * 后端服务: ExchangeRateService.executeConvert()（事务内双录记账）
 *
 * 核心流程:
 *   1. 查 exchange_rates 表匹配汇率规则
 *   2. 计算 to_amount = FLOOR(from_amount × rate_numerator ÷ rate_denominator)
 *   3. 校验 daily_user_limit / daily_global_limit
 *   4. assertAndGetTransaction 事务内：
 *      a. BalanceService.changeBalance: 用户扣减源资产（business_type='exchange_rate_debit'）
 *      b. BalanceService.changeBalance: 用户增加目标资产（business_type='exchange_rate_credit'）
 *      c. 手续费入 SYSTEM_PLATFORM_FEE（business_type='exchange_rate_fee'）
 *   5. 双录记账流水自动产生
 *
 * 响应 data 包含:
 *   success       - BOOLEAN 是否成功
 *   from_amount   - BIGINT 扣减数量
 *   net_to_amount - BIGINT 实际到账量
 *   from_balance  - BIGINT 兑换后源资产余额
 *   to_balance    - BIGINT 兑换后目标资产余额
 *   is_duplicate  - BOOLEAN 是否幂等重复请求
 *
 * @param params.from_asset_code - 源资产代码
 * @param params.to_asset_code - 目标资产代码
 * @param params.from_amount - 兑换数量
 */
async function executeExchangeRate(params: {
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
    throw new Error('兑换数量必须大于0')
  }

  const idempotencyKey = `exchange_rate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return apiClient.request('/assets/rates/convert', {
    method: 'POST',
    data: {
      from_asset_code: params.from_asset_code,
      to_asset_code: params.to_asset_code,
      from_amount: params.from_amount
    },
    needAuth: true,
    header: { 'Idempotency-Key': idempotencyKey },
    showLoading: true,
    loadingText: '兑换中...',
    showError: true,
    errorPrefix: '兑换失败：'
  })
}

module.exports = {
  getPointsBalance,
  getPointsTransactions,
  getAssetBalances,
  getConversionRules,
  getTodaySummary,
  getExchangeRates,
  getExchangeRatePair,
  previewExchangeRate,
  executeExchangeRate
}
