/**
 * 通用工具类v3.0 - 餐厅积分抽奖系统
 * 包含日期格式化、Base64编解码、JWT处理、深拷贝、防抖节流等
 *
 * @file 天工餐厅积分系统 - 通用工具函数
 * @version 3.0.0
 * @since 2026-02-10
 */

// ===== 类型定义 =====

/** JWT完整性验证结果 */
interface JWTIntegrityResult {
  isValid: boolean
  error?: string
  details?: Record<string, any>
}

/** JWT Payload结构（后端返回的字段） */
interface JWTPayload {
  user_id?: number
  mobile?: string
  nickname?: string
  is_admin?: boolean
  user_role?: string
  role_level?: number
  status?: string
  exp?: number
  iat?: number
  [key: string]: any
}

// ===== 日期时间处理 =====

/** 格式化数字（补零，用于日期时间显示） */
const formatNumber = (n: number | string): string => {
  const str = n.toString()
  return str[1] ? str : `0${str}`
}

/**
 * 格式化日期时间（YYYY-MM-DD HH:mm:ss格式）
 * 业务场景: 积分记录时间、兑换记录时间、抽奖记录时间、聊天消息时间戳
 */
const formatTime = (date: Date): string => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('-')} ${[hour, minute, second].map(formatNumber).join(':')}`
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
      console.error('❌ Base64解码错误：输入无效', { input: base64Str, type: typeof base64Str })
      throw new Error('Base64输入无效')
    }

    // Base64字符表（包含填充字符）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    let result = ''
    let i = 0

    // 保留 +, /, = 字符，只移除其他无关字符
    const cleanedStr: string = base64Str.replace(/[^A-Za-z0-9+/=]/g, '')

    console.log('🔍 Base64解码调试:', {
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
      console.warn('⚠️ Base64字符串长度不是4的倍数:', cleanedStr.length)
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
        console.error('❌ Base64字符无效:', { char1, char2, char3, char4 })
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

    console.log('✅ Base64解码成功:', {
      inputLength: base64Str.length,
      outputLength: result.length,
      preview: result.substring(0, 100) + (result.length > 100 ? '...' : '')
    })

    return result
  } catch (error: any) {
    console.error('❌ Base64解码失败:', error)
    console.error('📊 错误详情:', {
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
 * Token内容: user_id、mobile、is_admin、exp、iat等
 */
const decodeJWTPayload = (token: string): JWTPayload | null => {
  try {
    // 完整性验证
    const integrityCheck = validateJWTTokenIntegrity(token)
    if (!integrityCheck.isValid) {
      console.error('❌ JWT Token完整性验证失败:', integrityCheck.error)
      console.error('🔍 详细信息:', integrityCheck.details)

      if (integrityCheck.error && integrityCheck.error.includes('截断')) {
        console.error('🚨 检测到Token截断问题！')
        console.error('💡 建议：1.检查网络 2.重新登录 3.联系后端检查Token生成')
      }

      return null
    }

    console.log('✅ JWT Token完整性验证通过:', integrityCheck.details)

    const tokenParts: string[] = token.split('.')
    if (tokenParts.length !== 3) {
      console.warn('⚠️ JWT Token格式错误')
      return null
    }

    // Base64 URL解码
    let payload: string = tokenParts[1]
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')

    // 添加必要的填充
    while (payload.length % 4) {
      payload += '='
    }

    console.log('🔍 JWT解码调试信息:', {
      originalPayload: tokenParts[1],
      processedPayload: payload,
      payloadLength: payload.length
    })

    // Base64解码
    console.log('🔄 开始Base64解码...')
    const decodedPayload: string = base64Decode(payload)

    console.log('🔄 开始JSON解析...', {
      decodedLength: decodedPayload.length,
      decodedPreview: decodedPayload.substring(0, 200)
    })

    // JSON解析（含错误恢复）
    let parsedPayload: JWTPayload | null = null
    try {
      parsedPayload = JSON.parse(decodedPayload)
    } catch (jsonError: any) {
      console.error('❌ JSON解析失败:', jsonError.message)

      // 尝试清理无效字符后重新解析
      console.log('🔧 尝试清理JSON并重新解析...')
      try {
        const cleanedPayload: string = decodedPayload.replace(/[^\x20-\x7E]/g, '')
        console.log('🔍 清理后的Payload:', cleanedPayload)
        parsedPayload = JSON.parse(cleanedPayload)
        console.log('✅ 清理后JSON解析成功')
      } catch (retryError: any) {
        console.error('❌ 清理后仍然解析失败:', retryError.message)
        throw new Error(`JWT Payload JSON解析失败: ${jsonError.message}`)
      }
    }

    if (parsedPayload) {
      console.log('✅ JWT解码成功', {
        exp: parsedPayload.exp,
        iat: parsedPayload.iat,
        userId: parsedPayload.user_id,
        mobile: parsedPayload.mobile,
        isAdmin: parsedPayload.is_admin
      })
    }

    return parsedPayload
  } catch (error: any) {
    console.error('❌ JWT解码失败:', error)
    console.error('Token信息:', {
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
      console.warn('⚠️ Token已过期')
    }

    return isExpired
  } catch (error) {
    console.error('❌ Token过期检查失败', error)
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
    console.warn('⚠️ JSON解析失败', error)
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
const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
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
 * const handleScroll = throttle(() => { console.log('scroll') }, 200)
 */
const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
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

/**
 * 格式化积分显示（1000→1k，10000→1万）
 * 业务场景: 积分列表显示、排行榜显示、统计数据显示
 */
const formatPoints = (points: number): string => {
  if (typeof points !== 'number') {
    return '0'
  }

  if (points >= 10000) {
    return (points / 10000).toFixed(1) + '万'
  } else if (points >= 1000) {
    return (points / 1000).toFixed(1) + 'k'
  }

  return points.toString()
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
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs: number = now.getTime() - date.getTime()
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

    // 昨天
    if (diffDays === 1) {
      return `昨天 ${formatNumber(date.getHours())}:${formatNumber(date.getMinutes())}`
    }

    // 本周内
    if (diffDays < 7) {
      const weekdays: string[] = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      return `${weekdays[date.getDay()]} ${formatNumber(date.getHours())}:${formatNumber(date.getMinutes())}`
    }

    // 本年内
    if (now.getFullYear() === date.getFullYear()) {
      return `${formatNumber(date.getMonth() + 1)}-${formatNumber(date.getDate())} ${formatNumber(date.getHours())}:${formatNumber(date.getMinutes())}`
    }

    // 跨年显示
    return `${date.getFullYear()}-${formatNumber(date.getMonth() + 1)}-${formatNumber(date.getDate())} ${formatNumber(date.getHours())}:${formatNumber(date.getMinutes())}`
  } catch (error) {
    console.error('❌ 格式化消息时间失败:', error)
    return '未知时间'
  }
}

// ===== 导出模块 =====
module.exports = {
  formatTime,
  formatNumber,
  base64Decode,
  validateJWTTokenIntegrity,
  decodeJWTPayload,
  isTokenExpired,
  deepClone,
  debounce,
  throttle,
  formatFileSize,
  generateRandomString,
  isEmpty,
  safeJsonParse,
  formatPoints,
  formatPhoneNumber,
  formatDateMessage
}
