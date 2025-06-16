// utils/validate.js - 验证工具模块

/**
 * 节流函数
 * @param {Function} func 要节流的函数
 * @param {Number} wait 等待时间(ms)
 * @returns {Function} 节流后的函数
 */
function throttle(func, wait = 1000) {
  let lastTime = 0
  return function(...args) {
    const now = Date.now()
    if (now - lastTime >= wait) {
      lastTime = now
      func.apply(this, args)
    }
  }
}

/**
 * 防抖函数
 * @param {Function} func 要防抖的函数
 * @param {Number} wait 等待时间(ms)
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait = 500) {
  let timeout
  return function(...args) {
    const context = this
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      func.apply(context, args)
    }, wait)
  }
}

/**
 * 手机号验证
 * @param {String} phone 手机号
 * @returns {Boolean} 是否有效
 */
function validatePhone(phone) {
  const phoneReg = /^1[3-9]\d{9}$/
  return phoneReg.test(phone)
}

/**
 * 验证码验证
 * @param {String} code 验证码
 * @returns {Boolean} 是否有效
 */
function validateCode(code) {
  const codeReg = /^\d{4,6}$/
  return codeReg.test(code)
}

/**
 * 金额验证
 * @param {String|Number} amount 金额
 * @returns {Boolean} 是否有效
 */
function validateAmount(amount) {
  const amountReg = /^\d+(\.\d{1,2})?$/
  const num = parseFloat(amount)
  return amountReg.test(amount) && num > 0 && num <= 9999
}

/**
 * 图片验证
 * @param {String} filePath 图片路径
 * @returns {Promise} 验证结果
 */
function validateImage(filePath) {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: filePath,
      success: (res) => {
        // 检查图片大小 (最大5MB)
        if (res.size && res.size > 5 * 1024 * 1024) {
          reject({ msg: '图片大小不能超过5MB' })
          return
        }
        
        // 检查图片尺寸 (最小100x100)
        if (res.width < 100 || res.height < 100) {
          reject({ msg: '图片尺寸太小，请选择清晰的图片' })
          return
        }
        
        resolve(res)
      },
      fail: (error) => {
        reject({ msg: '图片格式不支持' })
      }
    })
  })
}

/**
 * 图片压缩
 * @param {String} filePath 图片路径
 * @param {Number} quality 压缩质量 0-1
 * @returns {Promise} 压缩后的图片路径
 */
function compressImage(filePath, quality = 0.8) {
  return new Promise((resolve, reject) => {
    // 微信小程序的图片压缩在选择时已完成
    // 这里直接返回原路径，生产环境可以加入更复杂的压缩逻辑
    resolve(filePath)
  })
}

/**
 * 表单验证器类
 */
class FormValidator {
  constructor() {
    this.rules = {}
    this.errors = {}
  }

  /**
   * 添加验证规则
   * @param {String} field 字段名
   * @param {Function} rule 验证规则函数
   */
  addRule(field, rule) {
    if (!this.rules[field]) {
      this.rules[field] = []
    }
    this.rules[field].push(rule)
  }

  /**
   * 验证单个字段
   * @param {String} field 字段名
   * @param {*} value 字段值
   * @returns {Boolean} 是否验证通过
   */
  validateField(field, value) {
    if (!this.rules[field]) return true

    // 清除该字段的错误
    delete this.errors[field]

    for (const rule of this.rules[field]) {
      const result = rule(value)
      if (result !== true) {
        this.errors[field] = result
        return false
      }
    }

    return true
  }

  /**
   * 验证所有字段
   * @param {Object} data 表单数据
   * @returns {Boolean} 是否全部验证通过
   */
  validateAll(data) {
    this.errors = {}
    let isValid = true

    for (const field in this.rules) {
      const fieldIsValid = this.validateField(field, data[field])
      if (!fieldIsValid) {
        isValid = false
      }
    }

    return isValid
  }

  /**
   * 获取错误信息
   * @returns {Object} 错误信息对象
   */
  getErrors() {
    return this.errors
  }

  /**
   * 清除所有错误
   */
  clearErrors() {
    this.errors = {}
  }
}

/**
 * 常用验证规则
 */
const commonRules = {
  // 必填验证
  required: (value) => {
    if (!value || (typeof value === 'string' && value.trim() === '')) {
      return '此项为必填项'
    }
    return true
  },

  // 手机号验证
  phone: (value) => {
    if (!validatePhone(value)) {
      return '请输入正确的手机号'
    }
    return true
  },

  // 验证码验证
  code: (value) => {
    if (!validateCode(value)) {
      return '请输入4-6位数字验证码'
    }
    return true
  },

  // 金额验证
  amount: (value) => {
    if (!validateAmount(value)) {
      return '请输入正确的金额'
    }
    return true
  },

  // 最小值验证
  min: (minValue) => (value) => {
    if (parseFloat(value) < minValue) {
      return `值不能小于${minValue}`
    }
    return true
  },

  // 最大值验证
  max: (maxValue) => (value) => {
    if (parseFloat(value) > maxValue) {
      return `值不能大于${maxValue}`
    }
    return true
  },

  // 长度验证
  length: (minLen, maxLen) => (value) => {
    const len = value ? value.toString().length : 0
    if (len < minLen || len > maxLen) {
      return `长度应在${minLen}-${maxLen}之间`
    }
    return true
  }
}

/**
 * 滑块验证类（占位实现）
 */
class SliderVerify {
  constructor() {
    this.verified = false
  }

  /**
   * 显示滑块验证
   * @returns {Promise} 验证结果
   */
  show() {
    return new Promise((resolve, reject) => {
      // 开发环境直接通过验证
      console.log('🔐 滑块验证（开发环境自动通过）')
      setTimeout(() => {
        this.verified = true
        resolve(true)
      }, 500)
    })
  }

  /**
   * 重置验证状态
   */
  reset() {
    this.verified = false
  }

  /**
   * 检查是否已验证
   * @returns {Boolean} 验证状态
   */
  isVerified() {
    return this.verified
  }
}

module.exports = {
  throttle,
  debounce,
  validatePhone,
  validateCode,
  validateAmount,
  validateImage,
  compressImage,
  FormValidator,
  commonRules,
  SliderVerify
}