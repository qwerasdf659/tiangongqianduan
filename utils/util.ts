/**
 * 通用工具类v5.0 - 天工平台
 * 包含日期格式化、Base64编解码、JWT处理、深拷贝、防抖节流等
 *
 * @file 天工平台 - 通用工具函数
 * @version 5.2.0
 * @since 2026-02-10
 */

const { createLogger } = require('./logger')
const log = createLogger('util')

// ===== 类型定义 =====

/** JWT完整性验证结果 */
interface JWTIntegrityResult {
  isValid: boolean
  error?: string
  details?: Record<string, any>
}

/**
 * JWT Payload 结构（对齐后端 JWT 签发逻辑）
 *
 * ⚠️ 后端 JWT Payload 不包含 is_admin、user_uuid 字段
 * ⚠️ B1 精简后（2026-06-12）：JWT payload 仅承载"身份"，不再含任何敏感资料。
 *   后端 generateTokens 已移除 mobile/nickname/status/role_level/user_role，
 *   只保留 user_id(+session_token/device_id/iat/exp)。
 *   手机号、角色等一律由后端接口（/auth/profile、/auth/verify、登录响应 user{}）权威下发，
 *   前端禁止再从 Token 解码这些字段（既泄密又有权限漂移）。故此处接口同步收窄，
 *   且不保留 [key: string]: any 索引签名 —— 让 TS 在编译期拦截对已移除字段的读取。
 */
interface JWTPayload {
  /** 用户ID（唯一身份标识，鉴权用） */
  user_id?: number
  /** 会话票据（后端 Redis 会话校验用，可踢设备） */
  session_token?: string
  /** 设备标识（多端会话隔离用） */
  device_id?: string
  /** 过期时间（Unix 秒） */
  exp?: number
  /** 签发时间（Unix 秒） */
  iat?: number
}

// ===== 日期时间处理 =====

/** 格式化数字（补零，用于日期时间显示） */
const formatNumber = (n: number | string): string => {
  const str = n.toString()
  return str[1] ? str : `0${str}`
}

/**
 * 安全解析后端日期字符串为Date对象（iOS兼容）
 *
 * iOS JS引擎不支持 "YYYY-MM-DD HH:mm:ss" 空格分隔格式，
 * 仅支持 ISO 8601 标准格式 "YYYY-MM-DDTHH:mm:ss"。
 * 后端统一返回 "YYYY-MM-DD HH:mm:ss" 或 ISO 8601 两种格式，
 * 此函数使用正则提取数字分量，确保100%兼容所有运行环境。
 *
 * 业务场景: 所有后端返回的 created_at / updated_at / acquired_at / expires_at 字段
 *
 * @param dateStr - 后端返回的日期字符串（"2026-02-15 02:15:02" 或 "2026-02-15T02:15:02+08:00"）
 * @returns 解析后的Date对象，解析失败返回null
 */
const safeParseDateString = (dateStr: string | number | null | undefined): Date | null => {
  if (!dateStr) {
    return null
  }

  if (typeof dateStr === 'number') {
    return new Date(dateStr)
  }

  const str = String(dateStr)

  // 带时区标识（UTC `Z` 或 ±HH:MM 偏移）的 ISO 串：直接原生解析，得到正确绝对时刻。
  // 后端已统一下发 UTC ISO（如 2026-06-24T19:14:09.000Z），必须保留时区信息按绝对时刻解析，
  // 不能再用正则剥掉 `Z` 重组（那会被当本地时间、差 8 小时）。
  if (/T\d{2}:\d{2}:\d{2}.*(Z|[+-]\d{2}:?\d{2})$/.test(str)) {
    const native = new Date(str)
    if (!isNaN(native.getTime())) {
      return native
    }
  }

  const match = str.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})[\sT](\d{1,2}):(\d{1,2}):(\d{1,2})/)
  if (match) {
    const [, yr, mo, dy, hr, mi, sc] = match
    return new Date(
      `${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}T${hr.padStart(2, '0')}:${mi.padStart(2, '0')}:${sc.padStart(2, '0')}`
    )
  }

  const dateOnly = str.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (dateOnly) {
    const [, yr, mo, dy] = dateOnly
    return new Date(`${yr}-${mo.padStart(2, '0')}-${dy.padStart(2, '0')}T00:00:00`)
  }

  log.warn('无法解析日期字符串:', str)
  return null
}

/** 北京时区相对 UTC 的固定偏移（+08:00，毫秒）。中国不使用夏令时，偏移恒定。 */
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000

/**
 * 将后端时间统一格式化为北京时间展示串（设备时区无关）
 *
 * 后端已统一下发 UTC ISO8601 带 `Z`（如 `2026-06-24T19:14:09.000Z`，对接文档 2026-06-25 B-2）。
 * 前端必须先按绝对时刻解析，再强制按北京时区（+08:00）渲染——绝不能直接截取串里的数字
 * （那是 UTC 数字，会比北京时间少 8 小时）。
 *
 * 实现采用「绝对时刻 + 8h 偏移后取 UTC 分量」，而非 toLocaleString({timeZone})——
 * 后者在部分 Android 微信环境 ICU 不全时会被忽略；偏移法保证任意设备时区下都得到正确北京时间。
 *
 * @param value - 后端时间字段（UTC ISO 字符串 / 毫秒时间戳 / Date）
 * @param withSeconds - 是否包含秒（默认 true）
 * @returns 北京时间串 `YYYY-MM-DD HH:mm(:ss)`，无效输入返回空串
 */
const formatBeijing = (
  value: string | number | Date | null | undefined,
  withSeconds = true
): string => {
  if (value === null || value === undefined || value === '') {
    return ''
  }
  const parsed = value instanceof Date ? value : safeParseDateString(value as string | number)
  if (!parsed || isNaN(parsed.getTime())) {
    return ''
  }
  // 偏移到北京时刻后用 UTC 分量取值，规避设备本地时区影响
  const bj = new Date(parsed.getTime() + BEIJING_OFFSET_MS)
  const year = bj.getUTCFullYear()
  const month = formatNumber(bj.getUTCMonth() + 1)
  const day = formatNumber(bj.getUTCDate())
  const hour = formatNumber(bj.getUTCHours())
  const minute = formatNumber(bj.getUTCMinutes())
  const second = formatNumber(bj.getUTCSeconds())
  return withSeconds
    ? `${year}-${month}-${day} ${hour}:${minute}:${second}`
    : `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化日期时间（YYYY-MM-DD HH:mm:ss格式，按北京时区）
 * 业务场景: 积分记录时间、兑换记录时间、抽奖记录时间、聊天消息时间戳
 *
 * ⚠️ 入参可为 Date / UTC ISO 字符串 / 毫秒时间戳；统一按北京时区（+08:00）展示，
 * 与后端 B-2（UTC ISO 下发）契约一致，设备时区无关。
 */
const formatTime = (date: Date | string | number): string => {
  return formatBeijing(date, true)
}

// ===== Base64编解码 =====

/**
 * Base64解码（微信小程序兼容版）
 * 微信小程序环境下标准Base64库不可用，需手动实现
 * 核心依赖: JWT Token解码
 */
const base64Decode = (base64Str: string): string => {
  try {
    if (!base64Str || typeof base64Str !== 'string') {
      log.error('Base64解码错误：输入无效', { input: base64Str, type: typeof base64Str })
      throw new Error('Base64输入无效')
    }

    // Base64字符表（包含填充字符）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    let result = ''
    let i = 0

    // 保留 +, /, = 字符，只移除其他无关字符
    const cleanedStr: string = base64Str.replace(/[^A-Za-z0-9+/=]/g, '')

    log.info('Base64解码调试:', {
      original: base64Str.substring(0, 50) + (base64Str.length > 50 ? '...' : ''),
      cleaned: cleanedStr.substring(0, 50) + (cleanedStr.length > 50 ? '...' : ''),
      originalLength: base64Str.length,
      cleanedLength: cleanedStr.length,
      hasPadding: cleanedStr.includes('=')
    })

    if (cleanedStr.length === 0) {
      throw new Error('清理后的Base64字符串为空')
    }

    if (cleanedStr.length % 4 !== 0) {
      log.warn('Base64字符串长度不是4的倍数:', cleanedStr.length)
    }

    while (i < cleanedStr.length) {
      const char1 = cleanedStr.charAt(i++)
      const char2 = cleanedStr.charAt(i++)
      const char3 = cleanedStr.charAt(i++)
      const char4 = cleanedStr.charAt(i++)

      const encoded1 = chars.indexOf(char1)
      const encoded2 = chars.indexOf(char2)
      const encoded3 = chars.indexOf(char3)
      const encoded4 = chars.indexOf(char4)

      if (encoded1 === -1 || encoded2 === -1) {
        log.error('Base64字符无效:', { char1, char2, char3, char4 })
        throw new Error(`无效的Base64字符: ${char1}, ${char2}`)
      }

      const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4

      result += String.fromCharCode((bitmap >> 16) & 255)

      if (encoded3 !== 64 && encoded3 !== -1) {
        result += String.fromCharCode((bitmap >> 8) & 255)
      }
      if (encoded4 !== 64 && encoded4 !== -1) {
        result += String.fromCharCode(bitmap & 255)
      }
    }

    log.info('Base64解码成功:', {
      inputLength: base64Str.length,
      outputLength: result.length,
      preview: result.substring(0, 100) + (result.length > 100 ? '...' : '')
    })

    return result
  } catch (error: any) {
    log.error('Base64解码失败:', error)
    log.error('错误详情:', {
      input: base64Str ? base64Str.substring(0, 100) + '...' : 'NULL',
      inputLength: base64Str ? base64Str.length : 0,
      errorMessage: error.message
    })
    throw error
  }
}

// ===== JWT处理 =====

/**
 * JWT Token完整性验证（防止Token截断问题）
 * 检查内容: Token格式（三段式）、各部分长度、Base64字符合法性、总长度
 * 业务场景: API请求前的Token健康检查
 */
const validateJWTTokenIntegrity = (token: string): JWTIntegrityResult => {
  try {
    if (!token || typeof token !== 'string') {
      return {
        isValid: false,
        error: 'Token为空或类型错误',
        details: { tokenType: typeof token }
      }
    }

    const tokenParts: string[] = token.split('.')
    if (tokenParts.length !== 3) {
      return {
        isValid: false,
        error: `JWT Token格式错误，预期3个部分，实际${tokenParts.length}个`,
        details: {
          partsCount: tokenParts.length,
          parts: tokenParts.map((part, index) => ({ index, length: part.length }))
        }
      }
    }

    const [header, payload, signature] = tokenParts

    // Header至少20个字符
    if (header.length < 20) {
      return {
        isValid: false,
        error: 'JWT Header部分过短，可能被截断',
        details: { headerLength: header.length, expectedMin: 20 }
      }
    }

    // Payload至少50个字符
    if (payload.length < 50) {
      return {
        isValid: false,
        error: 'JWT Payload部分过短，可能被截断',
        details: { payloadLength: payload.length, expectedMin: 50 }
      }
    }

    // 签名长度验证 - HMAC-SHA256签名Base64编码通常43-44字符
    if (signature.length < 40) {
      return {
        isValid: false,
        error: 'JWT签名部分过短，明显被截断',
        details: {
          signatureLength: signature.length,
          expectedMin: 40,
          actualSignature: signature,
          possibleCause: '可能原因：微信小程序存储限制、网络传输截断或后端生成错误'
        }
      }
    }

    // Token总长度至少150字符
    const totalLength: number = token.length
    if (totalLength < 150) {
      return {
        isValid: false,
        error: 'JWT Token总长度过短，疑似截断',
        details: {
          totalLength,
          expectedMin: 150,
          storageInfo: '微信小程序单项存储限制1MB，但可能存在其他限制'
        }
      }
    }

    // Base64 URL字符检查
    const base64UrlPattern = /^[A-Za-z0-9_-]*$/
    if (
      !base64UrlPattern.test(header) ||
      !base64UrlPattern.test(payload) ||
      !base64UrlPattern.test(signature)
    ) {
      return {
        isValid: false,
        error: 'JWT Token包含无效的Base64 URL字符',
        details: {
          headerValid: base64UrlPattern.test(header),
          payloadValid: base64UrlPattern.test(payload),
          signatureValid: base64UrlPattern.test(signature)
        }
      }
    }

    return {
      isValid: true,
      details: {
        tokenLength: totalLength,
        headerLength: header.length,
        payloadLength: payload.length,
        signatureLength: signature.length
      }
    }
  } catch (error: any) {
    return {
      isValid: false,
      error: 'Token完整性验证过程出错',
      details: {
        originalError: error.message,
        tokenPreview: token ? token.substring(0, 50) + '...' : 'NO_TOKEN'
      }
    }
  }
}

/**
 * JWT Token解码（微信小程序兼容版）
 * 解码JWT Token的Payload部分，获取用户信息和Token元数据
 * 解码流程: 完整性验证 → Base64 URL解码 → JSON解析
 *
 * Token内容（B1 精简后）: user_id、session_token、device_id、exp、iat
 *   不再含 mobile/nickname/status/role_level/user_role —— 这些由后端接口权威下发
 */
const decodeJWTPayload = (token: string): JWTPayload | null => {
  try {
    // 完整性验证
    const integrityCheck = validateJWTTokenIntegrity(token)
    if (!integrityCheck.isValid) {
      log.error('JWT Token完整性验证失败:', integrityCheck.error)
      log.error('详细信息:', integrityCheck.details)

      if (integrityCheck.error && integrityCheck.error.includes('截断')) {
        log.error(' 检测到Token截断问题！')
        log.error('建议：1.检查网络 2.重新登录 3.联系后端检查Token生成')
      }

      return null
    }

    log.info('JWT Token完整性验证通过:', integrityCheck.details)

    const tokenParts: string[] = token.split('.')
    if (tokenParts.length !== 3) {
      log.warn('JWT Token格式错误')
      return null
    }

    // Base64 URL解码
    let payload: string = tokenParts[1]
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')

    // 添加必要的填充
    while (payload.length % 4) {
      payload += '='
    }

    log.info('JWT解码调试信息:', {
      originalPayload: tokenParts[1],
      processedPayload: payload,
      payloadLength: payload.length
    })

    // Base64解码
    log.info('开始Base64解码...')
    const decodedPayload: string = base64Decode(payload)

    log.info('开始JSON解析...', {
      decodedLength: decodedPayload.length,
      decodedPreview: decodedPayload.substring(0, 200)
    })

    // JSON解析（含错误恢复）
    let parsedPayload: JWTPayload | null = null
    try {
      parsedPayload = JSON.parse(decodedPayload)
    } catch (jsonError: any) {
      log.error('JSON解析失败:', jsonError.message)

      // 尝试清理无效字符后重新解析
      log.info('尝试清理JSON并重新解析...')
      try {
        const cleanedPayload: string = decodedPayload.replace(/[^\x20-\x7E]/g, '')
        log.info('清理后的Payload:', cleanedPayload)
        parsedPayload = JSON.parse(cleanedPayload)
        log.info('清理后JSON解析成功')
      } catch (retryError: any) {
        log.error('清理后仍然解析失败:', retryError.message)
        throw new Error(`JWT Payload JSON解析失败: ${jsonError.message}`)
      }
    }

    if (parsedPayload) {
      log.info('JWT解码成功', {
        exp: parsedPayload.exp,
        iat: parsedPayload.iat,
        userId: parsedPayload.user_id
      })
    }

    return parsedPayload
  } catch (error: any) {
    log.error('JWT解码失败:', error)
    log.error('Token信息:', {
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? token.substring(0, 50) + '...' : 'NO_TOKEN'
    })
    return null
  }
}

/**
 * 检查Token是否过期
 * 业务场景: 应用启动时检查Token有效性、API请求前验证Token
 */
const isTokenExpired = (token: string): boolean => {
  try {
    const payload = decodeJWTPayload(token)
    if (!payload || !payload.exp) {
      return true
    }

    const currentTime: number = Math.floor(Date.now() / 1000)
    const isExpired: boolean = currentTime >= payload.exp

    if (isExpired) {
      log.warn('Token已过期')
    }

    return isExpired
  } catch (error) {
    log.error('Token过期检查失败', error)
    return true
  }
}

// ===== 对象和数据处理 =====

/**
 * 深拷贝对象（递归复制）
 * 支持: 基本类型、Date对象、数组、普通对象
 * 业务场景: 复制配置对象、保存历史状态、避免对象引用污染
 */
const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as unknown as T
  }

  if (typeof obj === 'object') {
    const clonedObj: Record<string, any> = {}
    Object.keys(obj as Record<string, any>).forEach((key: string) => {
      clonedObj[key] = deepClone((obj as Record<string, any>)[key])
    })
    return clonedObj as T
  }

  return obj
}

/** 检查对象是否为空 - 支持null、undefined、空数组、空字符串、空对象 */
const isEmpty = (obj: any): boolean => {
  if (obj === null || obj === undefined) {
    return true
  }
  if (Array.isArray(obj) || typeof obj === 'string') {
    return obj.length === 0
  }
  return Object.keys(obj).length === 0
}

/**
 * 安全的JSON解析（不会抛出异常）
 * 解析失败时返回默认值
 */
const safeJsonParse = <T = any>(str: string, defaultValue: T | null = null): T | null => {
  try {
    return JSON.parse(str)
  } catch (error) {
    log.warn('JSON解析失败', error)
    return defaultValue
  }
}

// ===== 函数式编程工具 =====

/**
 * 防抖函数（延迟执行，最后一次触发才执行）
 * 业务场景: 搜索框输入、窗口resize、表单验证、按钮点击防重
 *
 * @example
 * const handleSearch = debounce((keyword: string) => { API.search(keyword) }, 500)
 */
const debounce = <T extends (..._args: any[]) => any>(
  func: T,
  wait: number
): ((..._args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null
  return function executedFunction(this: any, ...args: Parameters<T>): void {
    const later = (): void => {
      timeout = null
      func.apply(this, args)
    }
    if (timeout !== null) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(later, wait)
  }
}

/**
 * 节流函数（固定时间间隔执行）
 * 业务场景: 滚动事件处理、鼠标移动事件、按钮防连点
 *
 * @example
 * const handleScroll = throttle(() => { log.info('scroll') }, 200)
 */
const throttle = <T extends (..._args: any[]) => any>(
  func: T,
  limit: number
): ((..._args: Parameters<T>) => void) => {
  let inThrottle: boolean = false
  return function (this: any, ...args: Parameters<T>): void {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// ===== 格式化工具 =====

/**
 * 格式化文件大小（字节转人类可读格式）
 * 业务场景: 图片上传大小显示、文件列表显示
 */
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) {
    return '0 Bytes'
  }

  const k = 1024
  const sizes: string[] = ['Bytes', 'KB', 'MB', 'GB']
  const i: number = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/** 生成随机字符串（大小写字母+数字） - 用于临时ID、文件名等 */
const generateRandomString = (length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/** ArrayBuffer/Uint8Array → 十六进制字符串 */
const bytesToHex = (bytes: Uint8Array): string => {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 获取密码学安全随机十六进制串
 * 优先使用标准 Web Crypto，微信小程序环境降级到 wx.getRandomValues
 */
const generateSecureRandomHex = async (byteLength: number = 8): Promise<string> => {
  const globalObject: any = typeof globalThis !== 'undefined' ? globalThis : {}
  const webCrypto = globalObject.crypto

  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(byteLength)
    webCrypto.getRandomValues(bytes)
    return bytesToHex(bytes)
  }

  if (typeof wx !== 'undefined' && typeof (wx as any).getRandomValues === 'function') {
    return new Promise((resolve, reject) => {
      ;(wx as any).getRandomValues({
        length: byteLength,
        success(res: { randomValues?: ArrayBuffer }) {
          if (!res || !(res.randomValues instanceof ArrayBuffer)) {
            reject(new Error('安全随机数接口返回格式错误'))
            return
          }

          const bytes = new Uint8Array(res.randomValues)
          if (bytes.byteLength !== byteLength) {
            reject(new Error('安全随机数长度不符合预期'))
            return
          }

          resolve(bytesToHex(bytes))
        },
        fail(error: { errMsg?: string }) {
          reject(new Error(error?.errMsg || '获取安全随机数失败'))
        }
      })
    })
  }

  throw new Error('当前运行环境不支持安全随机数接口，无法生成幂等键')
}

/**
 * 统一生成 Idempotency-Key
 * 结构：{prefix}_{业务片段...}_{timestamp}_{16位hex随机段}
 */
const generateIdempotencyKey = async (
  prefix: string,
  ...parts: Array<string | number | null | undefined>
): Promise<string> => {
  if (!prefix || typeof prefix !== 'string') {
    throw new Error('幂等键前缀不能为空')
  }

  const normalizedParts = parts
    .filter(part => part !== null && part !== undefined && part !== '')
    .map(part => String(part).trim())
    .filter(Boolean)

  const randomHex = await generateSecureRandomHex(8)
  return [prefix, ...normalizedParts, String(Date.now()), randomHex].join('_')
}

/**
 * 格式化积分显示（千分位分隔符，完整数字）
 * 业务场景: 积分列表显示、排行榜显示、统计数据显示
 * 示例: 99000 → "99,000"  |  38000 → "38,000"  |  500 → "500"
 */
const formatPoints = (points: number): string => {
  if (typeof points !== 'number') {
    return '0'
  }

  return points.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/**
 * 格式化手机号（脱敏显示: 138****5678）
 * 业务场景: 用户信息展示、订单信息展示、记录列表展示
 */
const formatPhoneNumber = (phone: string): string => {
  if (!phone || typeof phone !== 'string') {
    return ''
  }

  if (phone.length === 11) {
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }

  return phone
}

/**
 * 格式化聊天消息时间显示（智能时间显示）
 * 显示规则: <60秒"刚刚"、<60分"N分钟前"、<24小时"N小时前"、昨天"昨天HH:mm"、
 *           <7天"周X HH:mm"、本年"MM-DD HH:mm"、跨年"YYYY-MM-DD HH:mm"
 */
const formatDateMessage = (timestamp: number | string | Date): string => {
  try {
    const parsed = timestamp instanceof Date ? timestamp : safeParseDateString(timestamp)
    if (!parsed || isNaN(parsed.getTime())) {
      return '未知时间'
    }
    const now = new Date()
    const diffMs: number = now.getTime() - parsed.getTime()
    const diffSeconds: number = Math.floor(diffMs / 1000)
    const diffMinutes: number = Math.floor(diffSeconds / 60)
    const diffHours: number = Math.floor(diffMinutes / 60)
    const diffDays: number = Math.floor(diffHours / 24)

    // 刚刚
    if (diffSeconds < 60) {
      return '刚刚'
    }

    // N分钟前
    if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`
    }

    // N小时前
    if (diffHours < 24) {
      return `${diffHours}小时前`
    }

    // 绝对时间分支统一按北京时区取分量（设备时区无关，与后端 UTC ISO 契约一致）
    const bj = new Date(parsed.getTime() + BEIJING_OFFSET_MS)
    const bjNow = new Date(now.getTime() + BEIJING_OFFSET_MS)

    // 昨天
    if (diffDays === 1) {
      return `昨天 ${formatNumber(bj.getUTCHours())}:${formatNumber(bj.getUTCMinutes())}`
    }

    // 本周内
    if (diffDays < 7) {
      const weekdays: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return `${weekdays[bj.getUTCDay()]} ${formatNumber(bj.getUTCHours())}:${formatNumber(bj.getUTCMinutes())}`
    }

    // 本年内
    if (bjNow.getUTCFullYear() === bj.getUTCFullYear()) {
      return `${formatNumber(bj.getUTCMonth() + 1)}-${formatNumber(bj.getUTCDate())} ${formatNumber(bj.getUTCHours())}:${formatNumber(bj.getUTCMinutes())}`
    }

    // 跨年显示
    return `${bj.getUTCFullYear()}-${formatNumber(bj.getUTCMonth() + 1)}-${formatNumber(bj.getUTCDate())} ${formatNumber(bj.getUTCHours())}:${formatNumber(bj.getUTCMinutes())}`
  } catch (error) {
    log.error('格式化消息时间失败:', error)
    return '未知时间'
  }
}

/**
 * 格式化后端时间字段为展示串（后端 B-2：统一单一 UTC ISO 字符串）
 *
 * 对接文档 2026-06-25：后端所有时间字段统一为单一 UTC ISO8601 带 `Z`（如
 * `2026-06-24T19:14:09.000Z`），不再是 `{iso,beijing,timestamp,relative}` 对象，
 * 也不再有 `xxx_beijing` 伴随字段。本函数按北京时区展示，相对时间前端实时算。
 *
 * @param value - 后端时间字段（UTC ISO 字符串 / 毫秒时间戳；null/空表示无时间）
 * @param mode - 'relative' 列表/卡片首选相对时间（如"2天前"）；'beijing' 精确北京时间
 * @param fallback - 取不到时的兜底文案
 * @returns 可直接展示的时间字符串
 */
const formatBeijingTimeField = (
  value: string | number | null | undefined,
  mode: 'relative' | 'beijing' = 'relative',
  fallback: string = '时间未知'
): string => {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (mode === 'beijing') {
    return formatBeijing(value, true) || fallback
  }
  const parsedDate = safeParseDateString(value)
  return parsedDate ? formatDateMessage(parsedDate.getTime()) : fallback
}

/**
 * 计算「今天 / 本周 / 本月」在北京时区下的 UTC ISO8601 起止区间（带 Z）
 *
 * 背景（资产明细日期筛选对接文档 2026-06-29）：流水 created_at 存 UTC，
 * 后端按 created_at 范围在 DB 层筛选+分页。前端必须先在北京时区确定日期边界，
 * 再换算成 UTC 传 start_date/end_date，否则直接按 UTC 截断会差 8 小时、夜间记录归错天。
 *
 * 铁律：北京 00:00 = 前一日 UTC 16:00（北京时刻对应的 UTC = 北京时刻 - 8 小时）。
 * 本周口径：周一为一周起点（北京周一 00:00 ~ 今天 23:59:59.999）。
 *
 * @param tab - 时间筛选项：'today' | 'week' | 'month'（其它值如 'all' 返回空对象=不筛选）
 * @returns { start_date, end_date } UTC ISO8601 字符串；'all'/未知返回 {} 表示不传日期
 */
const getBeijingDateRange = (tab: string): { start_date?: string; end_date?: string } => {
  /* 把「北京时区的 Y-M-D H:m:s」换算成 UTC ISO8601：先按 UTC 拼毫秒再减 8h */
  const beijingToUtcIso = (
    year: number,
    monthZeroBased: number,
    day: number,
    hh: number,
    mm: number,
    ss: number,
    ms: number
  ): string =>
    new Date(Date.UTC(year, monthZeroBased, day, hh, mm, ss, ms) - 8 * 3600 * 1000).toISOString()

  /* 取「此刻的北京日期」：偏移到北京后用 getUTC* 读，避免依赖设备本地时区 */
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  const y = bj.getUTCFullYear()
  const m = bj.getUTCMonth()
  const d = bj.getUTCDate()
  const wd = bj.getUTCDay()

  /* 今天结束时刻（北京 23:59:59.999）三档共用 */
  const endOfToday = beijingToUtcIso(y, m, d, 23, 59, 59, 999)

  if (tab === 'today') {
    return { start_date: beijingToUtcIso(y, m, d, 0, 0, 0, 0), end_date: endOfToday }
  }
  if (tab === 'week') {
    /* 周日(0)→6，周一(1)→0…，定位到本周一；Date 自动处理跨月跨年进位 */
    const offsetToMonday = (wd + 6) % 7
    return {
      start_date: beijingToUtcIso(y, m, d - offsetToMonday, 0, 0, 0, 0),
      end_date: endOfToday
    }
  }
  if (tab === 'month') {
    return { start_date: beijingToUtcIso(y, m, 1, 0, 0, 0, 0), end_date: endOfToday }
  }
  /* 'all' 或未知：不传日期，由后端返回全部 */
  return {}
}

// ===== 用户角色判断 =====

/**
 * 判断用户角色（管理员 or 普通用户）
 *
 * 判断标准（对齐后端 authenticateToken 中间件）:
 *   role_level >= 100 → 管理员
 *
 * ⚠️ 后端 JWT 和登录响应均不包含 is_admin 字段，
 * 管理员身份完全由 role_level 决定（后端 role_level >= 100）。
 *
 * 此函数为唯一的角色判断逻辑，store/user.ts 的 isAdmin 计算属性、
 * setLoginState、restoreLoginState 均统一调用此函数，禁止重复编写。
 *
 * @param userInfo - 后端返回的用户信息（API.UserProfile）
 * @returns 'admin' | 'user' | 'guest'
 */
const determineUserRole = (userInfo: { user_role?: string; role_level?: number }): string => {
  if (!userInfo) {
    return 'guest'
  }
  if (typeof userInfo.role_level === 'number' && userInfo.role_level >= 100) {
    return 'admin'
  }
  return 'user'
}

// ===== URL查询参数构建 =====

/**
 * 构建URL查询参数字符串
 * 统一处理空值过滤、encodeURIComponent编码、参数拼接
 *
 * 替代 api.ts 中多处手动字符串拼接，消除重复代码和编码遗漏。
 *
 * @param params - 参数键值对（值为 null/undefined/'' 的参数自动过滤）
 * @returns 拼接好的查询字符串（不含前导 ?），如 "page=1&page_size=20&status=active"
 *
 * @example
 * buildQueryString({ page: 1, page_size: 20, status: null })
 * // → "page=1&page_size=20"
 */
const buildQueryString = (params: Record<string, any>): string => {
  return Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}

/**
 * 比较两个语义化版本号（如 "5.2.0" vs "5.3.1"）
 *
 * 用于前端强制更新闸门：将本地 app 版本与后端返回的最低可用版本比较。
 * 缺失的段按 0 补齐（"5.2" 视为 "5.2.0"），非数字段按 0 处理。
 *
 * @param v1 - 版本号A
 * @param v2 - 版本号B
 * @returns v1<v2 返回 -1；v1>v2 返回 1；相等返回 0
 *
 * @example
 * compareVersion('5.2.0', '5.3.0') // -1
 * compareVersion('5.3.0', '5.3')   //  0
 */
function compareVersion(v1: string, v2: string): number {
  const a = String(v1 || '0').split('.')
  const b = String(v2 || '0').split('.')
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const n1 = parseInt(a[i], 10) || 0
    const n2 = parseInt(b[i], 10) || 0
    if (n1 > n2) {
      return 1
    }
    if (n1 < n2) {
      return -1
    }
  }
  return 0
}

/**
 * 格式化倒计时文案（距离目标时间的剩余时长）
 * @param endTime - 结束时间戳（毫秒）
 * @returns 可读的倒计时文案，如 "3天12小时" / "2小时30分钟" / "15分钟" / "已结束"
 */
function formatCountdown(endTime: number): string {
  const diff = endTime - Date.now()
  if (diff <= 0) {
    return '已结束'
  }
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))
  if (days > 0) {
    return `${days}天${hours}小时`
  }
  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  }
  return `${minutes}分钟`
}

// ===== 导出模块 =====
module.exports = {
  formatTime,
  formatNumber,
  formatCountdown,
  compareVersion,
  safeParseDateString,
  base64Decode,
  validateJWTTokenIntegrity,
  decodeJWTPayload,
  isTokenExpired,
  deepClone,
  debounce,
  throttle,
  formatFileSize,
  generateRandomString,
  generateSecureRandomHex,
  generateIdempotencyKey,
  isEmpty,
  safeJsonParse,
  formatPoints,
  formatPhoneNumber,
  formatDateMessage,
  formatBeijing,
  formatBeijingTimeField,
  getBeijingDateRange,
  determineUserRole,
  buildQueryString
}
