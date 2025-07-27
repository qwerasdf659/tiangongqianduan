const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/**
 * 🔴 微信小程序兼容的Base64URL解码函数
 * 用于替代浏览器的atob()函数，解决"atob is not defined"错误
 * 🔧 修复：专门用于JWT Token的Base64URL解码
 */
function base64Decode(str) {
  try {
    console.log('🔧 开始Base64URL解码，输入长度:', str.length)
    
    // 微信小程序环境下的Base64URL解码
    if (typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      // 使用JavaScript原生Base64URL解码实现
      return decodeBase64(str)
    }
    
    // 浏览器环境：检查是否为Base64URL格式
    if (typeof atob !== 'undefined') {
      // 如果包含Base64URL特殊字符，使用自定义解码
      if (str.includes('-') || str.includes('_') || str.length % 4 !== 0) {
        console.log('🔧 检测到Base64URL格式，使用自定义解码')
        return decodeBase64(str)
      }
      // 标准Base64使用浏览器atob
      return atob(str)
    }
    
    // 都不可用时使用JavaScript实现
    return decodeBase64(str)
  } catch (error) {
    console.error('❌ Base64URL解码失败:', error.message)
    throw new Error(`Base64URL解码失败: ${error.message}`)
  }
}

/**
 * 🔴 Base64URL解码实现 - 专门用于JWT Token解码
 * 兼容微信小程序环境，正确处理JWT的Base64URL编码
 */
function decodeBase64(str) {
  try {
    // 🔧 关键修复：将Base64URL转换为标准Base64格式
    // JWT使用Base64URL编码：- 替代 +，_ 替代 /，无填充 =
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
    
    // 🔧 添加必要的填充字符
    const padding = base64.length % 4
    if (padding === 2) {
      base64 += '=='
    } else if (padding === 3) {
      base64 += '='
    }
    
    console.log('🔧 Base64URL转换:', {
      原始: str.substring(0, 20) + '...',
      转换后: base64.substring(0, 20) + '...',
      长度变化: `${str.length} -> ${base64.length}`
    })
    
    // 使用标准Base64字符集进行解码
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    let result = ''
    
    // 验证所有字符都在合法字符集中
    for (let i = 0; i < base64.length; i++) {
      const char = base64.charAt(i)
      if (char !== '=' && chars.indexOf(char) === -1) {
        throw new Error(`无效的Base64字符: ${char} (位置 ${i})`)
      }
    }
    
    // 按4字符一组进行解码
    for (let i = 0; i < base64.length; i += 4) {
      const a = chars.indexOf(base64.charAt(i))
      const b = chars.indexOf(base64.charAt(i + 1))
      const c = base64.charAt(i + 2) === '=' ? 64 : chars.indexOf(base64.charAt(i + 2))
      const d = base64.charAt(i + 3) === '=' ? 64 : chars.indexOf(base64.charAt(i + 3))
      
      if (a === -1 || b === -1) {
        throw new Error(`Base64解码错误：无效字符在位置 ${i}`)
      }
      
      const bitmap = (a << 18) | (b << 12) | (c << 6) | d
      
      result += String.fromCharCode((bitmap >> 16) & 255)
      if (c !== 64) result += String.fromCharCode((bitmap >> 8) & 255)
      if (d !== 64) result += String.fromCharCode(bitmap & 255)
    }
    
    console.log('✅ Base64解码成功，结果长度:', result.length)
    return result
    
  } catch (error) {
    console.error('❌ Base64URL解码失败:', error.message)
    console.error('🔍 输入字符串:', str.substring(0, 50) + '...')
    throw new Error(`Base64URL解码失败: ${error.message}`)
  }
}

/**
 * 🔴 JWT Token解码工具函数
 * 微信小程序兼容版本
 */
function decodeJWTPayload(token) {
  try {
    if (!token || typeof token !== 'string') {
      throw new Error('Token无效')
    }
    
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('JWT格式错误')
    }
    
    // 使用兼容的Base64解码
    const payload = base64Decode(parts[1])
    return JSON.parse(payload)
  } catch (error) {
    console.error('❌ JWT解码失败:', error.message)
    throw new Error(`JWT解码失败: ${error.message}`)
  }
}

/**
 * 🔴 JWT Header解码工具函数
 * 微信小程序兼容版本
 */
function decodeJWTHeader(token) {
  try {
    if (!token || typeof token !== 'string') {
      throw new Error('Token无效')
    }
    
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('JWT格式错误')
    }
    
    // 使用兼容的Base64解码
    const header = base64Decode(parts[0])
    return JSON.parse(header)
  } catch (error) {
    console.error('❌ JWT Header解码失败:', error.message)
    throw new Error(`JWT Header解码失败: ${error.message}`)
  }
}

module.exports = {
  formatTime,
  base64Decode,
  decodeJWTPayload,
  decodeJWTHeader
}
