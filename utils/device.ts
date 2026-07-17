/**
 * 设备会话标识工具 - 天工平台
 *
 * 职责: 为每台设备生成并持久化一个稳定、唯一的 device_id，
 * 供 APIClient 在所有请求头中携带 X-Device-Id，实现后端"设备级多会话"隔离。
 *
 * 业务背景:
 *   后端会话隔离 key 为 (user_id, user_type) + device_id（从请求头 X-Device-Id 读取）。
 *   device_id 一旦变化，后端按 (user_id, 新device_id) 查不到 active 会话 → 返回
 *   401 SESSION_NOT_FOUND → 前端清 token 掉线。因此 device_id 的稳定性直接决定登录态稳定性。
 *
 * 稳定性三重保障（2026-07-16 加固，修复"偶发 device_id 变化导致掉线"）:
 *   1. 内存缓存：单次运行内首次解析后常驻内存，避免 storage 读写抖动导致重复生成；
 *   2. JWT 兜底恢复：storage 丢了 device_id 但本地仍有 token 时，优先从 token 载荷里的
 *      device_id 恢复（该值即后端签发会话时绑定的 device_id），保持与后端会话连续、不掉线；
 *   3. 写入 try/catch + 回写：仅在既无 storage 又无 token 可恢复时才生成新 UUID，并容错写入。
 *
 * device_id 约束（对齐后端字段 device_id VARCHAR(64)）:
 *   - 同一台设备保持不变（持久化到本地存储，不随启动改变）
 *   - 不同设备各不相同（UUID v4 保证唯一）
 *   - 长度不超过 64 字符（UUID v4 为 36 字符，满足约束）
 *
 * @file 天工平台 - 设备会话标识工具
 * @version 5.3.0
 * @since 2026-06-11
 */

const { createLogger } = require('./logger')
const log = createLogger('device')

/**
 * 本地存储 key：持久化设备唯一标识，复用于应用全生命周期。
 * ⚠️ 历史值为 'app_device_id'，不可更名——更名会使所有存量用户的已持久化 device_id 失效，
 * 触发一轮集体掉线（后端按旧 device_id 绑定的会话全部对不上）。
 */
const DEVICE_ID_KEY = 'app_device_id'

/** 内存缓存：单次运行生命周期内复用，避免多次 storage 读写抖动导致的不一致 */
let cachedDeviceId = ''

/**
 * 生成 UUID v4（微信小程序环境无 crypto.randomUUID，手动实现）
 *
 * device_id 仅用于设备识别（非加密令牌），使用 Math.random 满足唯一性即可，
 * 无需密码学安全随机数。生成结果形如 7cd777fe-5a8e-4b41-97a8-ff6270368a29（36字符）。
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const randomNibble: number = (Math.random() * 16) | 0
    const hexValue: number = char === 'x' ? randomNibble : (randomNibble & 0x3) | 0x8
    return hexValue.toString(16)
  })
}

/**
 * 从本地已存的 access_token 载荷里恢复 device_id（storage 丢失时的兜底）。
 *
 * 后端签发 JWT 时把当初绑定会话的 device_id 写进了载荷（util.ts JWTPayload.device_id）。
 * 当 storage 里的 device_id 意外丢失、但 token 仍在时，用 token 里的 device_id 恢复，
 * 能让请求头 X-Device-Id 继续匹配后端会话，避免"生成新 UUID → 会话对不上 → 掉线"。
 *
 * @returns token 载荷中的合法 device_id；无 token / 无该字段 / 解析失败均返回空串
 */
function recoverDeviceIdFromToken(): string {
  try {
    const token: string = wx.getStorageSync('access_token') || ''
    if (!token) {
      return ''
    }
    /* 延迟 require 避免与 util 的潜在循环依赖（device 被 client 依赖，client 又依赖 util） */
    const { decodeJWTPayload } = require('./util')
    const payload = decodeJWTPayload(token)
    const tokenDeviceId: string = (payload && payload.device_id) || ''
    /* 仅接受合法长度（≤64，对齐后端字段约束），异常值不采用 */
    if (tokenDeviceId && tokenDeviceId.length <= 64) {
      return tokenDeviceId
    }
  } catch (_e) {
    /* 解析失败按无可恢复处理，走新生成分支 */
  }
  return ''
}

/**
 * 获取本设备唯一标识（一次生成、永久持久化、全程复用）
 *
 * 取值优先级（保证稳定，杜绝偶发变化）:
 *   1. 内存缓存（本次运行已解析过）
 *   2. 本地 storage（跨启动持久化的权威值）
 *   3. 从 access_token 载荷恢复（storage 丢失但已登录时，保持与后端会话连续）
 *   4. 生成新 UUID v4（仅全新设备/未登录且无缓存时）
 * 解析结果统一回写内存与 storage，后续调用恒返回同一值。
 *
 * @returns device_id（UUID v4 格式，36字符）
 */
function getDeviceId(): string {
  /* 1. 内存缓存优先 */
  if (cachedDeviceId) {
    return cachedDeviceId
  }

  /* 2. storage 权威值 */
  let deviceId = ''
  try {
    deviceId = wx.getStorageSync(DEVICE_ID_KEY) || ''
  } catch (_e) {
    deviceId = ''
  }

  /* 3. storage 缺失 → 尝试从 token 恢复（避免生成新值导致会话对不上而掉线） */
  if (!deviceId) {
    const recovered = recoverDeviceIdFromToken()
    if (recovered) {
      deviceId = recovered
      log.info('storage 缺失 device_id，已从 token 恢复以保持会话连续')
    }
  }

  /* 4. 仍无 → 生成新 UUID（全新设备/未登录首次） */
  if (!deviceId) {
    deviceId = generateUUID()
    log.info('已生成新的设备标识 device_id')
  }

  /* 统一回写内存 + storage（容错：写失败不影响本次返回，内存缓存仍保证本次运行一致） */
  cachedDeviceId = deviceId
  try {
    wx.setStorageSync(DEVICE_ID_KEY, deviceId)
  } catch (writeError) {
    log.warn('device_id 持久化写入失败，本次运行使用内存缓存值', writeError)
  }

  return deviceId
}

module.exports = {
  getDeviceId
}
