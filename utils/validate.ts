/**
 * 数据验证工具类v3.0 - 餐厅积分抽奖系统
 * 支持多业务线分层存储架构
 * 包含开发阶段123456万能验证码验证（后端控制）
 *
 * @file 天工餐厅积分系统 - 数据验证工具
 * @version 3.0.0
 * @since 2026-02-10
 */

const { getDevelopmentConfig } = require('../config/env')

// ===== 验证结果类型定义 =====

/** 基础验证结果 */
interface ValidationResult {
  isValid: boolean
  message: string
}

/** 手机号验证结果 */
interface PhoneValidationResult extends ValidationResult {
  cleanPhone?: string
}

/** 验证码验证结果 */
interface CodeValidationResult extends ValidationResult {
  cleanCode?: string
  isDevelopmentCode?: boolean
}

/** 积分验证结果 */
interface PointsValidationResult extends ValidationResult {
  cleanPoints?: number
}

/** 数量验证结果 */
interface QuantityValidationResult extends ValidationResult {
  cleanQuantity?: number
}

/** 昵称验证结果 */
interface NicknameValidationResult extends ValidationResult {
  cleanNickname?: string
}

/** 图片文件信息 */
interface ImageFileInfo {
  name: string
  size: number
  type: string
  sizeFormatted: string
}

/** 图片文件验证结果 */
interface ImageValidationResult extends ValidationResult {
  fileInfo?: ImageFileInfo
}

/** 待验证的图片文件对象 */
interface ImageFile {
  name?: string
  size: number
  type: string
}

/** 批量验证配置项 */
interface BatchValidationItem {
  validator: (value: any) => ValidationResult
  value: any
  fieldName?: string
}

/** 批量验证字段结果 */
interface BatchFieldResult {
  fieldName: string
  isValid: boolean
  message: string
  cleanValue?: any
}

/** 批量验证结果 */
interface BatchValidationResult {
  isValid: boolean
  results: BatchFieldResult[]
  firstErrorMessage: string | null
}

/** 表单验证规则函数 */
type ValidatorFunction = (value: any) => ValidationResult

/** 表单验证规则配置 */
interface FormValidatorRules {
  [fieldName: string]: ValidatorFunction | ValidatorFunction[]
}

/** 表单验证结果 */
interface FormValidationResult {
  isValid: boolean
  errors: Record<string, string>
}

// ===== 验证函数 =====

/**
 * 手机号验证（中国大陆11位手机号）
 * 业务场景: 用户登录验证、手机号绑定、找回密码
 *
 * @example
 * validatePhoneNumber('13812345678') // => { isValid: true, cleanPhone: '13812345678' }
 * validatePhoneNumber('138 1234 5678') // => { isValid: true, cleanPhone: '13812345678' }
 */
const validatePhoneNumber = (phone: string): PhoneValidationResult => {
  if (!phone || typeof phone !== 'string') {
    return { isValid: false, message: '请输入手机号' }
  }

  // 去除空格和横线
  const cleanPhone: string = phone.replace(/\s+/g, '').replace(/[-]/g, '')

  // 中国大陆手机号格式: 第一位1，第二位3-9，共11位数字
  const phoneRegex = /^1[3-9]\d{9}$/

  if (!phoneRegex.test(cleanPhone)) {
    return { isValid: false, message: '请输入正确的手机号格式' }
  }

  return { isValid: true, cleanPhone, message: '手机号格式正确' }
}

/**
 * 验证码验证（支持开发环境万能验证码123456）
 *
 * 🔴 特殊说明: 开发/测试环境支持万能验证码123456（后端控制）
 * 通过 config/env.ts 的 enableUnifiedAuth 配置控制
 * 业务场景: 用户手机号登录验证、敏感操作二次验证
 *
 * @example
 * validateVerificationCode('123456') // 开发环境 => { isValid: true, isDevelopmentCode: true }
 * validateVerificationCode('654321') // => { isValid: true, isDevelopmentCode: false }
 */
const validateVerificationCode = (code: string): CodeValidationResult => {
  const devConfig = getDevelopmentConfig()

  if (!code || typeof code !== 'string') {
    return { isValid: false, message: '请输入验证码' }
  }

  // 去除空格
  const cleanCode: string = code.replace(/\s+/g, '')

  // 开发阶段: 支持123456万能验证码（后端控制，非mock数据）
  if (devConfig.enableUnifiedAuth && cleanCode === '123456') {
    return {
      isValid: true,
      cleanCode,
      message: '开发阶段万能验证码验证通过',
      isDevelopmentCode: true
    }
  }

  // 正常验证码格式: 6位数字
  const codeRegex = /^\d{6}$/

  if (!codeRegex.test(cleanCode)) {
    return { isValid: false, message: '验证码应为6位数字' }
  }

  return {
    isValid: true,
    cleanCode,
    message: '验证码格式正确',
    isDevelopmentCode: false
  }
}

/**
 * 积分验证（0-999999范围）
 * 业务场景: 积分兑换验证、抽奖扣除积分验证、积分转账验证
 *
 * @example
 * validatePoints(1000) // => { isValid: true, cleanPoints: 1000 }
 * validatePoints(-100) // => { isValid: false, message: '积分不能为负数' }
 */
const validatePoints = (points: number | string | null | undefined): PointsValidationResult => {
  if (points === undefined || points === null) {
    return { isValid: false, message: '请输入积分数量' }
  }

  const numPoints: number = Number(points)

  if (isNaN(numPoints)) {
    return { isValid: false, message: '积分必须是数字' }
  }

  if (numPoints < 0) {
    return { isValid: false, message: '积分不能为负数' }
  }

  if (numPoints > 999999) {
    return { isValid: false, message: '积分不能超过999999' }
  }

  if (!Number.isInteger(numPoints)) {
    return { isValid: false, message: '积分必须是整数' }
  }

  return { isValid: true, cleanPoints: numPoints, message: '积分验证通过' }
}

/**
 * 数量验证（1-9999范围）
 * 业务场景: 兑换商品数量验证、批量操作数量验证、库存数量验证
 *
 * @example
 * validateQuantity(5) // => { isValid: true, cleanQuantity: 5 }
 * validateQuantity(0) // => { isValid: false, message: '数量必须大于0' }
 */
const validateQuantity = (
  quantity: number | string | null | undefined
): QuantityValidationResult => {
  if (quantity === undefined || quantity === null) {
    return { isValid: false, message: '请输入数量' }
  }

  const numQuantity: number = Number(quantity)

  if (isNaN(numQuantity)) {
    return { isValid: false, message: '数量必须是数字' }
  }

  if (numQuantity <= 0) {
    return { isValid: false, message: '数量必须大于0' }
  }

  if (numQuantity > 9999) {
    return { isValid: false, message: '数量不能超过9999' }
  }

  if (!Number.isInteger(numQuantity)) {
    return { isValid: false, message: '数量必须是整数' }
  }

  return { isValid: true, cleanQuantity: numQuantity, message: '数量验证通过' }
}

/**
 * 昵称验证（2-20字符，支持中英文数字下划线）
 * 业务场景: 用户资料修改、用户注册、个人信息完善
 *
 * @example
 * validateNickname('张三') // => { isValid: true, cleanNickname: '张三' }
 * validateNickname('A') // => { isValid: false, message: '昵称至少需要2个字符' }
 */
const validateNickname = (nickname: string): NicknameValidationResult => {
  if (!nickname || typeof nickname !== 'string') {
    return { isValid: false, message: '请输入昵称' }
  }

  // 去除首尾空格
  const cleanNickname: string = nickname.trim()

  if (cleanNickname.length === 0) {
    return { isValid: false, message: '昵称不能为空' }
  }

  if (cleanNickname.length < 2) {
    return { isValid: false, message: '昵称至少需要2个字符' }
  }

  if (cleanNickname.length > 20) {
    return { isValid: false, message: '昵称不能超过20个字符' }
  }

  // 允许: 中文、英文、数字、下划线
  const nicknameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/

  if (!nicknameRegex.test(cleanNickname)) {
    return { isValid: false, message: '昵称只能包含中文、英文、数字和下划线' }
  }

  return { isValid: true, cleanNickname, message: '昵称验证通过' }
}

/**
 * 图片文件验证（支持JPG/PNG/WEBP，最大20MB）
 * 业务场景: 用户头像上传、商品图片上传、凭证图片上传、反馈图片上传
 * 存储架构: 基于Sealos对象存储规范
 *
 * @example
 * validateImageFile({ name: 'avatar.jpg', size: 1048576, type: 'image/jpeg' })
 * // => { isValid: true, fileInfo: { name: 'avatar.jpg', size: 1048576, ... } }
 */
const validateImageFile = (file: ImageFile | null | undefined): ImageValidationResult => {
  if (!file) {
    return { isValid: false, message: '请选择图片文件' }
  }

  // 文件大小限制: 20MB
  const maxSize: number = 20 * 1024 * 1024
  if (file.size > maxSize) {
    return { isValid: false, message: '图片文件大小不能超过20MB' }
  }

  // 支持的图片格式（基于Sealos对象存储规范）
  const allowedTypes: string[] = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return { isValid: false, message: '仅支持JPG、PNG、WEBP格式的图片' }
  }

  // 文件名长度限制
  if (file.name && file.name.length > 200) {
    return { isValid: false, message: '文件名过长，请重命名后上传' }
  }

  return {
    isValid: true,
    fileInfo: {
      name: file.name || '',
      size: file.size,
      type: file.type,
      sizeFormatted: (file.size / 1024 / 1024).toFixed(2) + 'MB'
    },
    message: '图片文件验证通过'
  }
}

/**
 * 批量验证函数（一次性验证多个字段）
 * 业务场景: 表单提交前批量验证、复杂数据验证
 *
 * @example
 * validateBatch([
 *   { validator: validatePhoneNumber, value: '13812345678', fieldName: 'phone' },
 *   { validator: validatePoints, value: 1000, fieldName: 'points' }
 * ])
 */
const validateBatch = (validations: BatchValidationItem[]): BatchValidationResult => {
  if (!Array.isArray(validations)) {
    return { isValid: false, results: [], firstErrorMessage: '验证配置错误' }
  }

  const results: BatchFieldResult[] = []
  let hasError: boolean = false
  let firstErrorMessage: string | null = null

  for (const validation of validations) {
    const { validator, value, fieldName } = validation

    if (typeof validator !== 'function') {
      const errorResult: BatchFieldResult = {
        fieldName: fieldName || 'unknown',
        isValid: false,
        message: '验证器配置错误'
      }
      results.push(errorResult)
      hasError = true
      if (!firstErrorMessage) {
        firstErrorMessage = errorResult.message
      }
      continue
    }

    const result: any = validator(value)
    const fieldResult: BatchFieldResult = {
      fieldName: fieldName || 'unknown',
      isValid: result.isValid,
      message: result.message,
      cleanValue:
        result.cleanValue ||
        result.cleanPhone ||
        result.cleanCode ||
        result.cleanPoints ||
        result.cleanQuantity ||
        result.cleanNickname
    }

    results.push(fieldResult)

    if (!result.isValid) {
      hasError = true
      if (!firstErrorMessage) {
        firstErrorMessage = result.message
      }
    }
  }

  return { isValid: !hasError, results, firstErrorMessage }
}

// ===== 通用验证规则 =====

/** 通用验证规则对象（用于FormValidator快速配置） */
const commonRules = {
  /** 必填验证 */
  required: (message: string = '此字段不能为空'): ValidatorFunction => {
    return (value: any): ValidationResult => {
      if (value === null || value === undefined || value === '') {
        return { isValid: false, message }
      }
      return { isValid: true, message: '' }
    }
  },

  /** 手机号验证 */
  mobile: (message: string = '请输入正确的手机号'): ValidatorFunction => {
    return (value: any): ValidationResult => {
      const result = validatePhoneNumber(value)
      return {
        isValid: result.isValid,
        message: result.isValid ? '' : message || result.message
      }
    }
  },

  /** 长度验证 */
  length: (expectedLength: number, message?: string): ValidatorFunction => {
    return (value: any): ValidationResult => {
      if (!value || value.length !== expectedLength) {
        return {
          isValid: false,
          message: message || `长度必须为${expectedLength}位`
        }
      }
      return { isValid: true, message: '' }
    }
  },

  /** 积分验证 */
  points: (message: string = '请输入有效的积分数量'): ValidatorFunction => {
    return (value: any): ValidationResult => {
      const result = validatePoints(value)
      return {
        isValid: result.isValid,
        message: result.isValid ? '' : message || result.message
      }
    }
  },

  /** 数量验证 */
  quantity: (message: string = '请输入有效的数量'): ValidatorFunction => {
    return (value: any): ValidationResult => {
      const result = validateQuantity(value)
      return {
        isValid: result.isValid,
        message: result.isValid ? '' : message || result.message
      }
    }
  }
}

// ===== 表单验证器类 =====

/**
 * 表单验证器类（面向对象的表单验证方案）
 * 支持多规则串联验证、首个失败规则即停止、单字段实时验证
 *
 * @example
 * const validator = new FormValidator({
 *   phone: [commonRules.required(), commonRules.mobile()],
 *   code: [commonRules.required(), commonRules.length(6)]
 * })
 * const result = validator.validate({ phone: '13812345678', code: '123456' })
 */
class FormValidator {
  /** 验证规则配置 */
  private rules: FormValidatorRules

  constructor(rules: FormValidatorRules = {}) {
    this.rules = rules
  }

  /** 验证完整表单数据 */
  validate(formData: Record<string, any>): FormValidationResult {
    const errors: Record<string, string> = {}
    let isValid: boolean = true

    // 遍历所有验证规则
    for (const [fieldName, fieldRules] of Object.entries(this.rules)) {
      const fieldValue = formData[fieldName]

      // 字段有多个验证规则
      if (Array.isArray(fieldRules)) {
        for (const rule of fieldRules) {
          if (typeof rule === 'function') {
            const result: ValidationResult = rule(fieldValue)
            // 第一个验证失败就停止该字段的后续验证
            if (!result.isValid) {
              errors[fieldName] = result.message
              isValid = false
              break
            }
          }
        }
      } else if (typeof fieldRules === 'function') {
        // 字段只有一个验证规则
        const result: ValidationResult = fieldRules(fieldValue)
        if (!result.isValid) {
          errors[fieldName] = result.message
          isValid = false
        }
      }
    }

    return { isValid, errors }
  }

  /** 验证单个字段（用于实时验证场景） */
  validateField(fieldName: string, fieldValue: any): ValidationResult {
    const fieldRules = this.rules[fieldName]
    if (!fieldRules) {
      return { isValid: true, message: '' }
    }

    // 字段有多个验证规则
    if (Array.isArray(fieldRules)) {
      for (const rule of fieldRules) {
        if (typeof rule === 'function') {
          const result: ValidationResult = rule(fieldValue)
          if (!result.isValid) {
            return result
          }
        }
      }
    } else if (typeof fieldRules === 'function') {
      return fieldRules(fieldValue)
    }

    return { isValid: true, message: '' }
  }
}

// ===== 导出模块 =====
module.exports = {
  // 基础验证函数
  validatePhoneNumber,
  validateVerificationCode,
  validatePoints,
  validateQuantity,
  validateNickname,
  validateImageFile,
  validateBatch,

  // 表单验证相关
  FormValidator,
  commonRules
}

export {}
