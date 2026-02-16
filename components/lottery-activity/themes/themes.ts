/**
 * 主题色CSS变量映射表
 * 根据后端 display.effect_theme 返回对应的CSS变量内联样式
 *
 * 6套主题覆盖：default / gold_luxury / purple_mystery / spring_festival / christmas / summer
 *
 * 变量命名规范：
 *   --theme-primary / -dark / -light / -lighter   主色调系列
 *   --theme-secondary / -dark / -light              次色调系列
 *   --theme-accent / -dark / -light / -bright       强调色系列（金色/亮色）
 *   --theme-text / -light / -lighter / -inverse     文字颜色系列
 *   --theme-bg-dark / -darker / -light / -lighter   背景色系列
 *   --theme-shadow-strong / -medium / -soft          阴影系列
 *   --theme-glow-intense / -medium / -soft           光效系列
 *   --theme-success / -danger / -warning             状态色系列
 *   --theme-border / -border-light                   边框色系列
 *
 * 保底机制：所有子组件的 var() 均带 fallback 默认值。当后端未返回主题配置或
 * 选择不使用主题色时，CSS变量不设置，子组件自动回退到各自的硬编码保底色。
 *
 * @file components/lottery-activity/themes/themes.ts
 * @version 5.2.0
 * @since 2026-02-11
 * @updated 2026-02-15 全面扩展变量覆盖，从7个基础变量扩展到30+个核心变量
 */

/** 主题配置映射 - 每个主题包含完整的CSS变量定义 */
const THEME_MAP: Record<string, Record<string, string>> = {
  /* ===== 默认主题（橙色日常活动） ===== */
  default: {
    // 主色调 - 暖橙色
    '--theme-primary': '#e67e22',
    '--theme-primary-dark': '#d35400',
    '--theme-primary-light': '#f39c12',
    '--theme-primary-lighter': '#f5b041',
    // 次色调
    '--theme-secondary': '#ff8c42',
    '--theme-secondary-dark': '#e07830',
    '--theme-secondary-light': '#ffab70',
    // 强调色 - 金色
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#ccac00',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ff8c00',
    // 文字颜色
    '--theme-text': '#333333',
    '--theme-text-light': '#666666',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.5)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#7b241c',
    // 背景色
    '--theme-background': '#fff8f0',
    '--theme-bg-dark': '#2c1810',
    '--theme-bg-darker': '#1a0e08',
    '--theme-bg-light': '#fffdf7',
    '--theme-bg-lighter': '#fff5eb',
    // 阴影 / 光效
    '--theme-shadow-strong': 'rgba(230, 126, 34, 0.4)',
    '--theme-shadow-medium': 'rgba(230, 126, 34, 0.25)',
    '--theme-shadow-soft': 'rgba(230, 126, 34, 0.15)',
    '--theme-glow-intense': 'rgba(230, 126, 34, 0.9)',
    '--theme-glow-medium': 'rgba(230, 126, 34, 0.6)',
    '--theme-glow-soft': 'rgba(230, 126, 34, 0.35)',
    // 边框
    '--theme-border': '#eeeeee',
    '--theme-border-light': 'rgba(230, 126, 34, 0.2)',
    '--theme-highlight': 'rgba(230, 126, 34, 0.3)',
    // 状态色
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12'
  },

  /* ===== 金色奢华主题（高端活动） ===== */
  gold_luxury: {
    // 主色调 - 金色
    '--theme-primary': '#f1c40f',
    '--theme-primary-dark': '#d4ac0d',
    '--theme-primary-light': '#f7dc6f',
    '--theme-primary-lighter': '#fce883',
    // 次色调 - 深色
    '--theme-secondary': '#2c3e50',
    '--theme-secondary-dark': '#1a252f',
    '--theme-secondary-light': '#5d6d7e',
    // 强调色 - 亮金
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#b8860b',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ffa500',
    // 文字颜色
    '--theme-text': '#f1c40f',
    '--theme-text-light': '#bdc3c7',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a1a2e',
    // 背景色 - 深色系
    '--theme-background': '#1a1a2e',
    '--theme-bg-dark': '#12122a',
    '--theme-bg-darker': '#0a0a1e',
    '--theme-bg-light': '#2a2a4e',
    '--theme-bg-lighter': '#3a3a5e',
    // 阴影 / 光效
    '--theme-shadow-strong': 'rgba(241, 196, 15, 0.4)',
    '--theme-shadow-medium': 'rgba(241, 196, 15, 0.25)',
    '--theme-shadow-soft': 'rgba(241, 196, 15, 0.15)',
    '--theme-glow-intense': 'rgba(241, 196, 15, 0.9)',
    '--theme-glow-medium': 'rgba(241, 196, 15, 0.6)',
    '--theme-glow-soft': 'rgba(241, 196, 15, 0.35)',
    // 边框
    '--theme-border': '#34495e',
    '--theme-border-light': 'rgba(241, 196, 15, 0.25)',
    '--theme-highlight': 'rgba(241, 196, 15, 0.3)',
    // 状态色
    '--theme-success': '#2ecc71',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12'
  },

  /* ===== 紫色神秘主题（神秘活动） ===== */
  purple_mystery: {
    // 主色调 - 紫色
    '--theme-primary': '#9b59b6',
    '--theme-primary-dark': '#7d3c98',
    '--theme-primary-light': '#bb8fce',
    '--theme-primary-lighter': '#d2b4de',
    // 次色调 - 深蓝紫
    '--theme-secondary': '#6c3483',
    '--theme-secondary-dark': '#512e5f',
    '--theme-secondary-light': '#a569bd',
    // 强调色 - 银紫色
    '--theme-accent': '#e8daef',
    '--theme-accent-dark': '#c39bd3',
    '--theme-accent-light': '#f4ecf7',
    '--theme-accent-bright': '#d7bde2',
    // 文字颜色
    '--theme-text': '#ecf0f1',
    '--theme-text-light': '#bdc3c7',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.4)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a1a3e',
    // 背景色 - 深紫色系
    '--theme-background': '#1a1a3e',
    '--theme-bg-dark': '#16163a',
    '--theme-bg-darker': '#0e0e2a',
    '--theme-bg-light': '#2a1a5e',
    '--theme-bg-lighter': '#3a2a6e',
    // 阴影 / 光效
    '--theme-shadow-strong': 'rgba(155, 89, 182, 0.4)',
    '--theme-shadow-medium': 'rgba(155, 89, 182, 0.25)',
    '--theme-shadow-soft': 'rgba(155, 89, 182, 0.15)',
    '--theme-glow-intense': 'rgba(155, 89, 182, 0.9)',
    '--theme-glow-medium': 'rgba(155, 89, 182, 0.6)',
    '--theme-glow-soft': 'rgba(155, 89, 182, 0.35)',
    // 边框
    '--theme-border': '#34495e',
    '--theme-border-light': 'rgba(155, 89, 182, 0.25)',
    '--theme-highlight': 'rgba(155, 89, 182, 0.3)',
    // 状态色
    '--theme-success': '#2ecc71',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12'
  },

  /* ===== 春节主题（红金喜庆） ===== */
  spring_festival: {
    // 主色调 - 中国红
    '--theme-primary': '#e74c3c',
    '--theme-primary-dark': '#c0392b',
    '--theme-primary-light': '#f1948a',
    '--theme-primary-lighter': '#f5b7b1',
    // 次色调 - 金色
    '--theme-secondary': '#f1c40f',
    '--theme-secondary-dark': '#d4ac0d',
    '--theme-secondary-light': '#f7dc6f',
    // 强调色 - 金色
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#b8860b',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ff8c00',
    // 文字颜色
    '--theme-text': '#c0392b',
    '--theme-text-light': '#e74c3c',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.5)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#7b241c',
    // 背景色 - 红色系
    '--theme-background': '#fff5f5',
    '--theme-bg-dark': '#7b241c',
    '--theme-bg-darker': '#5a1a14',
    '--theme-bg-light': '#fff0f0',
    '--theme-bg-lighter': '#fff8f8',
    // 阴影 / 光效
    '--theme-shadow-strong': 'rgba(231, 76, 60, 0.4)',
    '--theme-shadow-medium': 'rgba(231, 76, 60, 0.25)',
    '--theme-shadow-soft': 'rgba(231, 76, 60, 0.15)',
    '--theme-glow-intense': 'rgba(231, 76, 60, 0.9)',
    '--theme-glow-medium': 'rgba(231, 76, 60, 0.6)',
    '--theme-glow-soft': 'rgba(231, 76, 60, 0.35)',
    // 边框
    '--theme-border': '#f5b7b1',
    '--theme-border-light': 'rgba(231, 76, 60, 0.2)',
    '--theme-highlight': 'rgba(231, 76, 60, 0.3)',
    // 状态色
    '--theme-success': '#27ae60',
    '--theme-danger': '#c0392b',
    '--theme-warning': '#f39c12'
  },

  /* ===== 圣诞主题（红绿配色） ===== */
  christmas: {
    // 主色调 - 圣诞绿
    '--theme-primary': '#27ae60',
    '--theme-primary-dark': '#1e8449',
    '--theme-primary-light': '#58d68d',
    '--theme-primary-lighter': '#82e0aa',
    // 次色调 - 圣诞红
    '--theme-secondary': '#e74c3c',
    '--theme-secondary-dark': '#c0392b',
    '--theme-secondary-light': '#f1948a',
    // 强调色 - 红色+金色
    '--theme-accent': '#e74c3c',
    '--theme-accent-dark': '#c0392b',
    '--theme-accent-light': '#f1948a',
    '--theme-accent-bright': '#ffd700',
    // 文字颜色
    '--theme-text': '#27ae60',
    '--theme-text-light': '#2ecc71',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a3c2a',
    // 背景色 - 深绿色系
    '--theme-background': '#f0fff0',
    '--theme-bg-dark': '#1a3c2a',
    '--theme-bg-darker': '#0e2a1e',
    '--theme-bg-light': '#e8f8e8',
    '--theme-bg-lighter': '#f0fff0',
    // 阴影 / 光效
    '--theme-shadow-strong': 'rgba(39, 174, 96, 0.4)',
    '--theme-shadow-medium': 'rgba(39, 174, 96, 0.25)',
    '--theme-shadow-soft': 'rgba(39, 174, 96, 0.15)',
    '--theme-glow-intense': 'rgba(39, 174, 96, 0.9)',
    '--theme-glow-medium': 'rgba(39, 174, 96, 0.6)',
    '--theme-glow-soft': 'rgba(39, 174, 96, 0.35)',
    // 边框
    '--theme-border': '#a9dfbf',
    '--theme-border-light': 'rgba(39, 174, 96, 0.2)',
    '--theme-highlight': 'rgba(39, 174, 96, 0.3)',
    // 状态色
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12'
  },

  /* ===== 夏日主题（清爽蓝色） ===== */
  summer: {
    // 主色调 - 天空蓝
    '--theme-primary': '#3498db',
    '--theme-primary-dark': '#2471a3',
    '--theme-primary-light': '#5dade2',
    '--theme-primary-lighter': '#85c1e9',
    // 次色调
    '--theme-secondary': '#1abc9c',
    '--theme-secondary-dark': '#148f77',
    '--theme-secondary-light': '#48c9b0',
    // 强调色 - 暖金色
    '--theme-accent': '#f39c12',
    '--theme-accent-dark': '#d68910',
    '--theme-accent-light': '#f7c948',
    '--theme-accent-bright': '#ff8c00',
    // 文字颜色
    '--theme-text': '#2980b9',
    '--theme-text-light': '#5dade2',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a2a3e',
    // 背景色 - 浅蓝色系
    '--theme-background': '#f0f8ff',
    '--theme-bg-dark': '#1a2a3e',
    '--theme-bg-darker': '#0e1e2e',
    '--theme-bg-light': '#e8f4fd',
    '--theme-bg-lighter': '#f0f8ff',
    // 阴影 / 光效
    '--theme-shadow-strong': 'rgba(52, 152, 219, 0.4)',
    '--theme-shadow-medium': 'rgba(52, 152, 219, 0.25)',
    '--theme-shadow-soft': 'rgba(52, 152, 219, 0.15)',
    '--theme-glow-intense': 'rgba(52, 152, 219, 0.9)',
    '--theme-glow-medium': 'rgba(52, 152, 219, 0.6)',
    '--theme-glow-soft': 'rgba(52, 152, 219, 0.35)',
    // 边框
    '--theme-border': '#aed6f1',
    '--theme-border-light': 'rgba(52, 152, 219, 0.2)',
    '--theme-highlight': 'rgba(52, 152, 219, 0.3)',
    // 状态色
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12'
  }
}

/**
 * 根据主题名称生成CSS变量内联样式字符串
 * @param themeName 主题名称（对应后端 display.effect_theme）
 * @returns CSS内联样式字符串，如 "--theme-primary:#e67e22;--theme-secondary:#ffffff;"
 *
 * 使用方式：
 *   lottery-activity.ts 中调用 getThemeStyle(display.effect_theme)
 *   将返回值设置到组件根元素的 style 属性上
 *   子组件通过 var(--theme-primary, fallback) 读取主题色
 *   若未设置主题（style为空），子组件自动使用 fallback 硬编码保底色
 */
function getThemeStyle(themeName: string): string {
  const theme = THEME_MAP[themeName] || THEME_MAP['default']
  return Object.entries(theme)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
}

module.exports = { getThemeStyle, THEME_MAP }

export {}
