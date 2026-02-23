/**
 * 🔇 统一日志工具 - 根据环境配置控制日志输出级别
 *
 * 日志级别: DEBUG < INFO < WARN < ERROR
 * - development/mobile 环境: 输出所有级别
 * - testing 环境: INFO 及以上
 * - production 环境: 仅 WARN + ERROR
 *
 * 使用方式:
 *   const { Logger } = require('../../utils/index')
 *   const log = Logger.createLogger('exchange')
 *   log.info('商品加载完成')
 *   log.error('加载失败:', err)
 *
 * @file 天工餐厅积分系统 - 统一日志工具
 * @version 5.2.0
 * @since 2026-02-15
 */

const { getCurrentEnv } = require('../config/env')

// ===== 日志级别常量 =====

/** 日志级别（数值越大优先级越高） */
const LOG_LEVEL = {
  /** 调试信息（开发阶段详细日志） */
  DEBUG: 0,
  /** 常规信息（业务流程关键节点） */
  INFO: 1,
  /** 警告信息（异常但不影响功能运行） */
  WARN: 2,
  /** 错误信息（功能异常，需排查修复） */
  ERROR: 3,
  /** 静默模式（关闭所有日志） */
  SILENT: 4
} as const

// ===== 内部工具 =====

/** 获取当前环境对应的最低日志输出级别 */
function getMinLevel(): number {
  const env = getCurrentEnv()
  switch (env) {
    case 'development':
    case 'mobile':
      return LOG_LEVEL.DEBUG
    case 'testing':
      return LOG_LEVEL.INFO
    case 'production':
      return LOG_LEVEL.WARN
    default:
      return LOG_LEVEL.DEBUG
  }
}

/** 格式化当前时间为 HH:MM:SS */
function timestamp(): string {
  return new Date().toTimeString().slice(0, 8)
}

// ===== 日志器工厂 =====

/**
 * 创建带模块标签的日志器
 *
 * @param tag 模块标签（如 'app'、'exchange'、'lottery'、'auth'）
 * @returns 含 debug/info/warn/error 四个方法的日志对象
 *
 * @example
 * const log = createLogger('exchange')
 * log.info('商品列表加载完成', { count: 10 })
 * log.error('兑换失败:', err)
 */
function createLogger(tag: string) {
  return {
    /** 调试日志（仅开发/真机环境输出） */
    debug(msg: string, ...args: any[]): void {
      if (getMinLevel() <= LOG_LEVEL.DEBUG) {
        console.log(`[${timestamp()}][DEBUG][${tag}]`, msg, ...args)
      }
    },
    /** 信息日志（开发/真机/测试环境输出） */
    info(msg: string, ...args: any[]): void {
      if (getMinLevel() <= LOG_LEVEL.INFO) {
        console.log(`[${timestamp()}][INFO][${tag}]`, msg, ...args)
      }
    },
    /** 警告日志（所有环境均输出） */
    warn(msg: string, ...args: any[]): void {
      if (getMinLevel() <= LOG_LEVEL.WARN) {
        console.warn(`[${timestamp()}][WARN][${tag}]`, msg, ...args)
      }
    },
    /** 错误日志（所有环境均输出） */
    error(msg: string, ...args: any[]): void {
      if (getMinLevel() <= LOG_LEVEL.ERROR) {
        console.error(`[${timestamp()}][ERROR][${tag}]`, msg, ...args)
      }
    }
  }
}

/** 默认日志器（标签: app） */
const logger = createLogger('app')

// ===== 导出 =====
module.exports = {
  logger,
  createLogger,
  LOG_LEVEL
}
