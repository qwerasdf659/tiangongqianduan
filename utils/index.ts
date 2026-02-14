/**
 * Utils统一导出模块 v5.0 - 对齐后端V4.7.0真实路由
 *
 * 集中管理所有工具函数，防止导入混乱
 * 统一使用分类导出：Utils / Validation / API / Wechat / ErrorHandler / Constants
 *
 * 使用展开运算符自动同步模块导出，新增函数无需手动维护映射
 *
 * 命名规范:
 *   业务逻辑层: 100% camelCase（变量名、函数名）
 *   API交互层: 100% snake_case（请求参数、响应字段）
 *   工具类/类名: PascalCase（APIClient等）
 *
 * @file 天工餐厅积分系统 - 工具函数统一入口
 * @version 5.0.0
 * @since 2026-02-10
 */

// ===== 内部模块导入（index.ts内部直接引用，不通过自身循环引用） =====
const utilFunctions = require('./util')
const validateFunctions = require('./validate')
const apiFunctions = require('./api')
const wechatFunctions = require('./wechat')
const authHelperFunctions = require('./auth-helper')
const errorFunctions = require('./simple-error')
const configCacheFunctions = require('./config-cache')
const loggerFunctions = require('./logger')
const waterfallFunctions = require('./waterfall')
const productFilterFunctions = require('./product-filter')

// ===== 功能模块分类导出（展开运算符自动同步，新增函数无需手动维护） =====

/** 基础工具函数 - 日期格式化、字符串处理、防抖节流、JWT处理、认证助手 */
const Utils = { ...utilFunctions, ...authHelperFunctions }

/** 数据验证函数 - 表单验证、字段检查、业务规则验证 */
const Validation = { ...validateFunctions }

/**
 * API接口函数 - V4.0统一引擎（对齐后端V4.7.0真实路由）
 * 新增API方法只需在 api.ts 的 module.exports 中添加，此处自动同步
 */
const API = { ...apiFunctions }

/** 微信小程序工具函数 - 微信API封装、用户交互、导航 */
const Wechat = { ...wechatFunctions }

/** 错误处理工具（极简方案） - 错误提示、成功提示、JWT过期处理 */
const ErrorHandler = { ...errorFunctions }

/** 活动位置配置缓存管理器（单例） */
const ConfigCache = { ...configCacheFunctions }

/** 统一日志工具 - 环境级别控制 */
const Logger = { ...loggerFunctions }

/** 瀑布流布局工具 - 两列瀑布流计算 */
const Waterfall = { ...waterfallFunctions }

/** 商品筛选工具 - 通用筛选/排序/搜索 */
const ProductFilter = { ...productFilterFunctions }

/** 项目核心常量 */
const Constants = require('../config/constants')

// ===== 统一导出接口 =====

/**
 * 标准导入方式:
 * const { Utils, Validation, API, Wechat, ErrorHandler, Constants, ConfigCache } = require('../../utils/index')
 */
module.exports = {
  Utils,
  Validation,
  API,
  Wechat,
  ErrorHandler,
  Constants,
  ConfigCache,
  Logger,
  Waterfall,
  ProductFilter
}

export {}
