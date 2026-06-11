/**
 * 设备会话标识工具 - 天工平台
 *
 * 职责: 为每台设备生成并持久化一个稳定、唯一的 device_id，
 * 供 APIClient 在所有请求头中携带 X-Device-Id，实现后端"设备级多会话"隔离。
 *
 * 业务背景:
 *   后端会话隔离 key 为 (user_id, user_type) + device_id。
 *   前端不传 device_id 时后端无法识别"同一台设备重登"，会跳过旧会话替换，
 *   导致同账号多次登录产生大量 device_id=NULL 的并存会话（会话堆积失控）。
 *   前端补上稳定的 device_id 后，"同设备重登自动替换旧会话"机制立即生效。
 *
 * device_id 约束（对齐后端字段 device_id VARCHAR(64)）:
 *   - 同一台设备保持不变（持久化到本地存储，不随启动改变）
 *   - 不同设备各不相同（UUID v4 保证唯一）
 *   - 长度不超过 64 字符（UUID v4 为 36 字符，满足约束）
 *
 * @file 天工平台 - 设备会话标识工具
 * @version 5.2.0
 * @since 2026-06-11
 */

const { createLogger } = require('./logger')
const log = createLogger('device')

/** 本地存储 key：持久化设备唯一标识，复用于应用全生命周期 */
const DEVICE_ID_KEY = 'app_device_id'

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
 * 获取本设备唯一标识（首次生成后持久化，后续复用）
 *
 * 读取本地存储中的 device_id：存在则直接返回；不存在则生成 UUID v4，
 * 写入本地存储后返回，保证同一台设备多次调用返回同一值。
 *
 * @returns device_id（UUID v4 格式，36字符）
 */
function getDeviceId(): string {
  let deviceId: string = wx.getStorageSync(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = generateUUID()
    wx.setStorageSync(DEVICE_ID_KEY, deviceId)
    log.info('已生成并持久化新的设备标识 device_id')
  }
  return deviceId
}

module.exports = {
  getDeviceId
}
