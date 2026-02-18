/**
 * 🎯 弹窗横幅频率控制工具
 *
 * 服务端驱动 + 客户端执行的弹窗频率控制系统：
 * - 后端通过 banner_type / frequency_rule / frequency_value 配置弹出策略
 * - 前端读取配置，结合本地存储的交互记录，判断是否展示
 * - 运营通过管理后台即可灵活调整，前端无需发版
 *
 * 本地存储结构: wx.setStorageSync('popup_banner_records')
 * { "15": { lastSeen: 1740000000000, seenCount: 3, dismissed: true } }
 *
 * @see docs/弹窗横幅频率控制系统设计文档.md
 * @file 天工餐厅积分系统 - 弹窗频率控制工具
 * @version 1.0.0
 * @since 2026-02-18
 */

// 内部模块直接引用，不通过index.ts（避免循环依赖）
const loggerModule = require('./logger')
const log = loggerModule.createLogger('popup-frequency')

/** 本地存储Key（与设计文档一致） */
const STORAGE_KEY = 'popup_banner_records'

/** 过期记录清理阈值: 90天（毫秒） */
const EXPIRED_THRESHOLD_MS = 90 * 24 * 60 * 60 * 1000

/** 一天的毫秒数 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * 读取本地弹窗交互记录
 * @returns 以 popup_banner_id(字符串) 为 key 的记录字典
 */
function getStoredRecords(): Record<string, API.BannerRecord> {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY)
    if (stored && typeof stored === 'object') {
      return stored
    }
  } catch (err) {
    log.error('读取弹窗记录失败:', err)
  }
  return {}
}

/**
 * 写入本地弹窗交互记录
 */
function saveStoredRecords(records: Record<string, API.BannerRecord>): void {
  try {
    wx.setStorageSync(STORAGE_KEY, records)
  } catch (err) {
    log.error('写入弹窗记录失败:', err)
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
 * 判断 banner 是否应该展示
 *
 * 根据后端配置的 frequency_rule + 本地存储的交互记录，
 * 在客户端执行频率判断逻辑，决定是否弹出。
 *
 * @param banner - 后端返回的banner数据（含频率控制字段）
 * @param record - 本地存储的该banner交互记录（可能为undefined表示从未看过）
 * @param sessionSeenIds - 当前会话已展示过的popup_banner_id集合（用于once_per_session）
 * @returns true=应该展示，false=跳过
 */
function shouldShowBanner(
  banner: API.PopupBanner,
  record: API.BannerRecord | undefined,
  sessionSeenIds: Set<number>
): boolean {
  if (!banner || !banner.frequency_rule) {
    log.warn('banner缺少frequency_rule字段，跳过展示:', banner?.popup_banner_id)
    return false
  }

  const rule = banner.frequency_rule
  const frequencyValue = banner.frequency_value || 1
  const seenCount = record ? record.seenCount : 0
  const lastSeen = record ? record.lastSeen : 0
  const bannerId = banner.popup_banner_id

  switch (rule) {
    case 'always':
      return true

    case 'once':
      return seenCount === 0

    case 'once_per_session':
      return !sessionSeenIds.has(bannerId)

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
      log.warn('未知的frequency_rule:', rule, '，bannerId:', bannerId)
      return false
  }
}

/**
 * 标记 banner 已展示
 *
 * 展示banner后调用，更新本地存储的交互记录：
 * - seenCount + 1
 * - lastSeen = 当前时间戳
 * - 同时更新会话级已展示集合（用于 once_per_session）
 *
 * @param bannerId - popup_banner_id
 * @param sessionSeenIds - 当前会话已展示集合（引用传递，直接修改）
 */
function markBannerSeen(bannerId: number, sessionSeenIds: Set<number>): void {
  if (!bannerId) {
    return
  }

  const records = getStoredRecords()
  const bannerKey = String(bannerId)
  const existingRecord = records[bannerKey]

  records[bannerKey] = {
    lastSeen: Date.now(),
    seenCount: (existingRecord ? existingRecord.seenCount : 0) + 1,
    dismissed: existingRecord ? existingRecord.dismissed : false
  }

  saveStoredRecords(records)
  sessionSeenIds.add(bannerId)

  log.info('标记banner已展示:', bannerId, '累计次数:', records[bannerKey].seenCount)
}

/**
 * 标记 banner 被用户主动关闭
 *
 * 用户点击关闭按钮或"我知道了"按钮时调用。
 * dismissed=true 配合 frequency_rule 共同决定下次是否再弹。
 *
 * @param bannerId - popup_banner_id
 */
function markBannerDismissed(bannerId: number): void {
  if (!bannerId) {
    return
  }

  const records = getStoredRecords()
  const bannerKey = String(bannerId)
  const existingRecord = records[bannerKey]

  records[bannerKey] = {
    lastSeen: existingRecord ? existingRecord.lastSeen : Date.now(),
    seenCount: existingRecord ? existingRecord.seenCount : 1,
    dismissed: true
  }

  saveStoredRecords(records)
  log.info('标记banner已关闭:', bannerId)
}

/**
 * 清理过期的弹窗交互记录
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

    const cleanedRecords: Record<string, API.BannerRecord> = {}
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
      log.info('清理过期弹窗记录:', cleanedCount, '条')
    }
  } catch (err) {
    log.error('清理过期弹窗记录失败:', err)
  }
}

/**
 * 过滤并排序待展示的banners
 *
 * 完整的客户端频率过滤流程:
 * 1. 读取本地存储记录
 * 2. 逐个执行 shouldShowBanner 判断
 * 3. 过滤后按 priority 降序排序（数字大的先弹）
 *
 * @param banners - 后端返回的活跃banner列表（已过滤 is_active + 时间范围）
 * @param sessionSeenIds - 当前会话已展示集合
 * @returns 过滤+排序后应该展示的banners
 */
function filterBannersByFrequency(
  banners: API.PopupBanner[],
  sessionSeenIds: Set<number>
): API.PopupBanner[] {
  if (!Array.isArray(banners) || banners.length === 0) {
    return []
  }

  const records = getStoredRecords()

  const filteredBanners = banners.filter(banner => {
    const bannerKey = String(banner.popup_banner_id)
    const bannerRecord = records[bannerKey]
    return shouldShowBanner(banner, bannerRecord, sessionSeenIds)
  })

  filteredBanners.sort((a, b) => (b.priority || 0) - (a.priority || 0))

  log.info('频率过滤结果: 总计', banners.length, '条, 通过', filteredBanners.length, '条')

  return filteredBanners
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

export {}
