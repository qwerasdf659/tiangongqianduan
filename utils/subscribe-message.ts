/**
 * 📬 微信订阅消息工具模块
 *
 * 封装 wx.requestSubscribeMessage 授权引导 + 模板ID管理
 *
 * 业务场景:
 *   1. 审核任务提醒 — 审核链推进到下一步时，通知新审核人有待办
 *   2. 审核结果通知 — 审核完成/拒绝后，通知提交者审核结果
 *
 * 微信订阅消息限制:
 *   - 一次性订阅：每次授权只能推送一条消息
 *   - 长期订阅：仅政务/公共服务小程序可用，本项目不适用
 *   - 需要用户主动触发（按钮 tap 事件中调用）
 *
 * ⚠️ 模板ID需要在微信公众平台 → 订阅消息 → 公共模板库 中选用后填入
 *    后端推送时需要调用 subscribeMessage.send 接口
 *
 * @file 天工餐厅积分系统 - 微信订阅消息工具
 * @version 6.0.0
 * @since 2026-03-15
 */

/* 内部模块直接引用，不通过 index.ts（避免循环依赖） */
const loggerModule = require('./logger')
const log = loggerModule.createLogger('subscribe-msg')

/**
 * 订阅消息模板ID配置
 *
 * ⚠️ TODO: 需要后端/运营在微信公众平台配置模板后，将模板ID填入此处
 * 配置路径: 微信公众平台 → 功能 → 订阅消息 → 公共模板库
 *
 * 建议模板:
 *   - 审核任务提醒: 包含「业务类型」「提交人」「金额」「提交时间」字段
 *   - 审核结果通知: 包含「审核结果」「审核意见」「业务类型」「处理时间」字段
 */
const SUBSCRIBE_TEMPLATE_IDS: Record<string, string> = {
  /** 审核任务提醒（审核人收到，有新待办时推送） — 模板ID待配置 */
  approval_task_reminder: '',
  /** 审核结果通知（提交者收到，审核完成/拒绝时推送） — 模板ID待配置 */
  approval_result_notice: ''
}

/**
 * 请求用户订阅指定类型的消息模板
 *
 * 调用时机（必须在用户交互事件中）：
 *   - consume-submit 提交成功后，引导审核人角色订阅「审核任务提醒」
 *   - audit-list 首次加载时，引导审核人订阅「审核结果通知」
 *
 * @param templateKeys - 要订阅的模板 key 数组（对应 SUBSCRIBE_TEMPLATE_IDS 的 key）
 * @returns 授权结果 { [templateId]: 'accept' | 'reject' | 'ban' } 或 null（失败）
 */
async function requestSubscribe(
  templateKeys: string[]
): Promise<Record<string, string> | null> {
  const tmplIds = templateKeys
    .map((key) => SUBSCRIBE_TEMPLATE_IDS[key])
    .filter((templateId) => !!templateId)

  if (tmplIds.length === 0) {
    log.warn('订阅消息模板ID未配置，跳过订阅引导')
    return null
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (res: any) => {
        log.info('订阅消息授权结果:', res)
        resolve(res)
      },
      fail: (err: any) => {
        /**
         * 常见失败原因:
         *   20004: 用户关闭了订阅消息总开关
         *   10002: 网络问题
         *   10003: 模板ID不合法
         */
        log.warn('订阅消息授权失败:', err)
        resolve(null)
      }
    })
  })
}

/**
 * 引导审核人订阅「审核任务提醒」
 *
 * 调用场景: audit-list 页面 onShow 时，检测是否需要引导订阅
 * 频率控制: 同一用户每天最多引导1次（Storage 记录上次引导日期）
 */
async function guideApprovalTaskSubscribe(): Promise<boolean> {
  const todayStr = new Date().toISOString().slice(0, 10)
  const lastGuideDate = wx.getStorageSync('_approval_subscribe_guide_date') || ''

  if (lastGuideDate === todayStr) {
    return false
  }

  const templateId = SUBSCRIBE_TEMPLATE_IDS.approval_task_reminder
  if (!templateId) {
    return false
  }

  const subscribeResult = await requestSubscribe(['approval_task_reminder'])
  wx.setStorageSync('_approval_subscribe_guide_date', todayStr)

  if (subscribeResult && subscribeResult[templateId] === 'accept') {
    log.info('审核人已授权「审核任务提醒」订阅消息')
    return true
  }

  return false
}

/**
 * 引导提交者订阅「审核结果通知」
 *
 * 调用场景: consume-submit 提交成功后
 * 频率控制: 每次提交都引导（因为一次性订阅只能推一条）
 */
async function guideApprovalResultSubscribe(): Promise<boolean> {
  const templateId = SUBSCRIBE_TEMPLATE_IDS.approval_result_notice
  if (!templateId) {
    return false
  }

  const subscribeResult = await requestSubscribe(['approval_result_notice'])

  if (subscribeResult && subscribeResult[templateId] === 'accept') {
    log.info('提交者已授权「审核结果通知」订阅消息')
    return true
  }

  return false
}

/**
 * 检查模板ID是否已配置（供业务代码判断是否展示订阅引导UI）
 */
function isSubscribeConfigured(templateKey: string): boolean {
  return !!SUBSCRIBE_TEMPLATE_IDS[templateKey]
}

module.exports = {
  SUBSCRIBE_TEMPLATE_IDS,
  requestSubscribe,
  guideApprovalTaskSubscribe,
  guideApprovalResultSubscribe,
  isSubscribeConfigured
}
