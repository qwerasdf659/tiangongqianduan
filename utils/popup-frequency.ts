/**
 * 🎯 内容投放频率控制工具
 *
 * 服务端驱动 + 客户端执行的弹窗频率控制系统：
 * - 后端通过 campaign_category / frequency_rule / frequency_value 配置弹出策略
 * - 前端读取配置，结合本地存储的交互记录，判断是否展示
 * - 运营通过管理后台即可灵活调整，前端无需发版
 *
 * 本地存储结构: wx.setStorageSync('ad_delivery_records')
 * { "15": { lastSeen: 1740000000000, seenCount: 3, dismissed: true } }
 * 其中 key 为 ad_campaign_id 字符串
 *
 * @file 天工餐厅积分系统 - 内容投放频率控制工具
 * @version 6.0.0
 * @since 2026-02-23
 */

// 内部模块直接引用，不通过index.ts（避免循环依赖）
const loggerModule = require('./logger')
const log = loggerModule.createLogger('popup-frequency')

/** 本地存储Key */
const STORAGE_KEY = 'ad_delivery_records'

/** 过期记录清理阈值: 90天（毫秒） */
const EXPIRED_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000

/** 一天的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * 读取本地内容投放交互记录
 * @returns 以 ad_campaign_id(字符串) 为 key 的记录字典
 */
function getStoredRecords(): Record<string, API.DeliveryRecord> {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'object') {
      return stored
    }
  } catch (err) {
    log.error('读取投放记录失败:', err)
  }
  return {}
}

/**
 * 写入本地内容投放交互记录
 */
function saveStoredRecords(records: Record<string, API.DeliveryRecord>): void {
  try {
    wx.setStorageSync(STORAGE_KEY, records)
  } catch (err) {
    log.error('写入投放记录失败:', err)
  }
}

/**
 * 获取今天零点时间戳（北京时间）
 * 用于 once_per_day / once_per_n_days 规则判断
 */
function getTodayStartTimestamp(): number {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
}

/**
 * 判断内容是否应该展示
 *
 * 根据后端配置的 frequency_rule + 本地存储的交互记录，
 * 在客户端执行频率判断逻辑，决定是否弹出。
 *
 * @param item - 后端返回的统一投放内容项（含频率控制字段）
 * @param record - 本地存储的该内容交互记录（可能为undefined表示从未看过）
 * @param sessionSeenIds - 当前会话已展示过的 ad_campaign_id 集合（用于 once_per_session）
 * @returns true=应该展示，false=跳过
 */
function shouldShowBanner(
  item: API.AdDeliveryItem,
  record: API.DeliveryRecord | undefined,
  sessionSeenIds: Set<number>
): boolean {
  if (!item || !item.frequency_rule) {
    log.warn('投放内容缺少frequency_rule字段，跳过展示:', item?.ad_campaign_id)
    return false
  }

  const rule = item.frequency_rule
  const frequencyValue = item.frequency_value || 1
  const seenCount = record ? record.seenCount : 0
  const lastSeen = record ? record.lastSeen : 0
  const campaignId = item.ad_campaign_id

  switch (rule) {
    case 'always':
      return true

    case 'once':
      return seenCount === 0

    case 'once_per_session':
      return !sessionSeenIds.has(campaignId)

    case 'once_per_day': {
      if (seenCount === 0) {
        return true
      }
      const todayStart = getTodayStartTimestamp()
      return lastSeen < todayStart
    }

    case 'once_per_n_days': {
      if (seenCount === 0) {
        return true
      }
      const daysSinceLastSeen = (Date.now() - lastSeen) / ONE_DAY_MS
      return daysSinceLastSeen >= frequencyValue
    }

    case 'n_times_total':
      return seenCount < frequencyValue

    default:
      log.warn('未知的frequency_rule:', rule, '，campaignId:', campaignId)
      return false
  }
}

/**
 * 标记内容已展示
 *
 * 展示内容后调用，更新本地存储的交互记录：
 * - seenCount + 1
 * - lastSeen = 当前时间戳
 * - 同时更新会话级已展示集合（用于 once_per_session）
 *
 * @param campaignId - ad_campaign_id
 * @param sessionSeenIds - 当前会话已展示集合（引用传递，直接修改）
 */
function markBannerSeen(campaignId: number, sessionSeenIds: Set<number>): void {
  if (!campaignId) {
    return
  }

  const records = getStoredRecords()
  const campaignKey = String(campaignId)
  const existingRecord = records[campaignKey]

  records[campaignKey] = {
    lastSeen: Date.now(),
    seenCount: (existingRecord ? existingRecord.seenCount : 0) + 1,
    dismissed: existingRecord ? existingRecord.dismissed : false
  }

  saveStoredRecords(records)
  sessionSeenIds.add(campaignId)

  log.info('标记内容已展示:', campaignId, '累计次数:', records[campaignKey].seenCount)
}

/**
 * 标记内容被用户主动关闭
 *
 * 用户点击关闭按钮或"我知道了"按钮时调用。
 * dismissed=true 配合 frequency_rule 共同决定下次是否再弹。
 *
 * @param campaignId - ad_campaign_id
 */
function markBannerDismissed(campaignId: number): void {
  if (!campaignId) {
    return
  }

  const records = getStoredRecords()
  const campaignKey = String(campaignId)
  const existingRecord = records[campaignKey]

  records[campaignKey] = {
    lastSeen: existingRecord ? existingRecord.lastSeen : Date.now(),
    seenCount: existingRecord ? existingRecord.seenCount : 1,
    dismissed: true
  }

  saveStoredRecords(records)
  log.info('标记内容已关闭:', campaignId)
}

/**
 * 清理过期的交互记录
 *
 * 删除 lastSeen 超过90天的记录，防止本地存储无限增长。
 * 建议在小程序 onLaunch 时调用一次。
 *
 * 存储预估: 每条记录约100字节，100条约10KB，远低于微信10MB上限
 */
function cleanExpiredRecords(): void {
  try {
    const records = getStoredRecords()
    const recordKeys = Object.keys(records)
    if (recordKeys.length === 0) {
      return
    }

    const now = Date.now()
    let cleanedCount = 0

    const cleanedRecords: Record<string, API.DeliveryRecord> = {}
    for (let i = 0; i < recordKeys.length; i++) {
      const recordKey = recordKeys[i]
      const recordItem = records[recordKey]
      if (now - recordItem.lastSeen < EXPIRED_THRESHOLD_MS) {
        cleanedRecords[recordKey] = recordItem
      } else {
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      saveStoredRecords(cleanedRecords)
      log.info('清理过期投放记录:', cleanedCount, '条')
    }
  } catch (err) {
    log.error('清理过期投放记录失败:', err)
  }
}

/**
 * 过滤并排序待展示的投放内容
 *
 * 完整的客户端频率过滤流程:
 * 1. 读取本地存储记录
 * 2. 逐个执行 shouldShowBanner 判断
 * 3. 过滤后按 priority 降序排序（数字大的先弹）
 *
 * @param items - 后端返回的活跃投放内容列表（已过滤状态和时间范围）
 * @param sessionSeenIds - 当前会话已展示集合
 * @returns 过滤+排序后应该展示的内容项
 */
function filterBannersByFrequency(
  items: API.AdDeliveryItem[],
  sessionSeenIds: Set<number>
): API.AdDeliveryItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return []
  }

  const records = getStoredRecords()

  const filteredItems = items.filter(item => {
    const campaignKey = String(item.ad_campaign_id)
    const itemRecord = records[campaignKey]
    return shouldShowBanner(item, itemRecord, sessionSeenIds)
  })

  filteredItems.sort((a, b) => (b.priority || 0) - (a.priority || 0))

  log.info('频率过滤结果: 总计', items.length, '条, 通过', filteredItems.length, '条')

  return filteredItems
}

module.exports = {
  shouldShowBanner,
  markBannerSeen,
  markBannerDismissed,
  cleanExpiredRecords,
  filterBannersByFrequency,
  getStoredRecords,
  STORAGE_KEY
}
