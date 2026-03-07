/**
 * 全局氛围主题 CSS 变量映射表（统一 source of truth）
 *
 * 合并原 packageLottery/lottery-activity/themes/themes.ts（6 套抽奖主题 --theme-* 变量）
 * 和 packageExchange/themes/exchange-themes.ts（5 套兑换主题 --shelf-* 变量）
 * 为 6 套全局统一主题，每套同时包含 --theme-* 和 --shelf-* 两组变量。
 *
 * 架构：全局氛围 + 活动级覆盖
 *   - 全局氛围：后端 system_configs 表 config_key='app_theme'，控制所有 Tab 页
 *   - 活动覆盖：后端 lottery_campaigns 表 display.effect_theme，仅控制 lottery-activity 组件内部
 *
 * 6 套主题标识：default / gold_luxury / purple_mystery / spring_festival / christmas / summer
 *
 * 变量命名规范：
 *   --theme-*  系列：抽奖模块、通用页面使用（主色调、文字、背景、阴影、光效、状态色）
 *   --shelf-*  系列：兑换模块使用（卡片、价格、按钮、库存、标签）
 *
 * 保底机制：所有组件的 var() 均带 fallback 默认值。
 * 当后端未返回主题配置时，CSS 变量不设置，组件自动回退到各自的硬编码保底色。
 *
 * ⚠️ 内部模块，不通过 utils/index.ts 引用其他工具（避免循环依赖）
 *    外部页面统一从 utils/index.ts 导入 GlobalTheme
 *
 * @file utils/global-themes.ts
 * @version 6.0.0
 * @since 2026-03-06
 */

/**
 * 全局主题配置映射
 * 每个主题包含两组 CSS 变量：
 *   --theme-* ：抽奖 + 通用页面视觉变量（30+ 个）
 *   --shelf-* ：兑换货架/市场视觉变量（25+ 个）
 */
const GLOBAL_THEME_MAP: Record<string, Record<string, string>> = {
  /* =====================================================================
   * 默认主题（暖橙日常活动）
   * 抽奖：暖橙色主色调，浅暖色背景
   * 兑换：吸收原方案 E（彩色分类 + 电商价格），白底暖色
   * ===================================================================== */
  default: {
    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#e67e22',
    '--theme-primary-dark': '#d35400',
    '--theme-primary-light': '#f39c12',
    '--theme-primary-lighter': '#f5b041',
    '--theme-secondary': '#ff8c42',
    '--theme-secondary-dark': '#e07830',
    '--theme-secondary-light': '#ffab70',
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#ccac00',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ff8c00',
    '--theme-text': '#333333',
    '--theme-text-light': '#666666',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.5)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#7b241c',
    '--theme-background': '#fff8f0',
    '--theme-bg-dark': '#2c1810',
    '--theme-bg-darker': '#1a0e08',
    '--theme-bg-light': '#fffdf7',
    '--theme-bg-lighter': '#fff5eb',
    '--theme-shadow-strong': 'rgba(230, 126, 34, 0.4)',
    '--theme-shadow-medium': 'rgba(230, 126, 34, 0.25)',
    '--theme-shadow-soft': 'rgba(230, 126, 34, 0.15)',
    '--theme-glow-intense': 'rgba(230, 126, 34, 0.9)',
    '--theme-glow-medium': 'rgba(230, 126, 34, 0.6)',
    '--theme-glow-soft': 'rgba(230, 126, 34, 0.35)',
    '--theme-border': '#eeeeee',
    '--theme-border-light': 'rgba(230, 126, 34, 0.2)',
    '--theme-highlight': 'rgba(230, 126, 34, 0.3)',
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 吸收原方案 E：彩色分类 + 电商价格
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 4rpx 20rpx rgba(0,0,0,0.06)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 8rpx 28rpx rgba(0,0,0,0.1)',
    '--shelf-card-hover-translate': '-2rpx',
    '--shelf-card-image-bg': '#f5f7fa',
    '--shelf-price-color': '#ff6b35',
    '--shelf-price-unit': '#ff6b35',
    '--shelf-price-row-bg': 'linear-gradient(90deg, rgba(255,107,53,0.06), transparent)',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #e67e22, #d35400)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '14rpx',
    '--shelf-cta-shadow': 'none',
    '--shelf-type-bar-radius': '20rpx 20rpx 0 0',
    '--shelf-name-color': '#333333',
    '--shelf-desc-color': '#999999',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': '#f0f0f0',
    '--shelf-tag-hot': 'linear-gradient(135deg, #ff4757, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #2ed573, #7bed9f)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #f5f5f5, #e8e8e8)',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': 'linear-gradient(135deg, #4ecdc4 0%, #44a08d 100%)',
    '--shelf-nav-slider-left': 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)',
    '--shelf-nav-slider-right': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    '--shelf-accent': '#667eea',
    '--shelf-accent-light': 'rgba(102, 126, 234, 0.15)'
  },

  /* =====================================================================
   * 金色奢华主题（高端活动）
   * 抽奖：金色主色调，深色背景
   * 兑换：吸收原方案 C（暗色游戏风），深色背景 + 金色价格
   * ===================================================================== */
  gold_luxury: {
    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#f1c40f',
    '--theme-primary-dark': '#d4ac0d',
    '--theme-primary-light': '#f7dc6f',
    '--theme-primary-lighter': '#fce883',
    '--theme-secondary': '#2c3e50',
    '--theme-secondary-dark': '#1a252f',
    '--theme-secondary-light': '#5d6d7e',
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#b8860b',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ffa500',
    '--theme-text': '#f1c40f',
    '--theme-text-light': '#bdc3c7',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a1a2e',
    '--theme-background': '#1a1a2e',
    '--theme-bg-dark': '#12122a',
    '--theme-bg-darker': '#0a0a1e',
    '--theme-bg-light': '#2a2a4e',
    '--theme-bg-lighter': '#3a3a5e',
    '--theme-shadow-strong': 'rgba(241, 196, 15, 0.4)',
    '--theme-shadow-medium': 'rgba(241, 196, 15, 0.25)',
    '--theme-shadow-soft': 'rgba(241, 196, 15, 0.15)',
    '--theme-glow-intense': 'rgba(241, 196, 15, 0.9)',
    '--theme-glow-medium': 'rgba(241, 196, 15, 0.6)',
    '--theme-glow-soft': 'rgba(241, 196, 15, 0.35)',
    '--theme-border': '#34495e',
    '--theme-border-light': 'rgba(241, 196, 15, 0.25)',
    '--theme-highlight': 'rgba(241, 196, 15, 0.3)',
    '--theme-success': '#2ecc71',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 吸收原方案 C：暗色游戏风，金色价格
    '--shelf-card-bg': 'linear-gradient(145deg, #1a1a2e, #16213e)',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.25)',
    '--shelf-card-border': '1rpx solid rgba(241,196,15,0.15)',
    '--shelf-card-hover-shadow': '0 0 20rpx rgba(241,196,15,0.2)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': 'linear-gradient(135deg, #1a1a2e, #2a2a4e)',
    '--shelf-price-color': '#ffd700',
    '--shelf-price-unit': '#ffd700',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': 'rgba(255,255,255,0.35)',
    '--shelf-cta-bg': 'linear-gradient(135deg, #f1c40f, #d4ac0d)',
    '--shelf-cta-text': '#1a1a2e',
    '--shelf-cta-radius': '14rpx',
    '--shelf-cta-shadow': '0 0 16rpx rgba(241,196,15,0.35)',
    '--shelf-type-bar-radius': '20rpx 20rpx 0 0',
    '--shelf-name-color': '#e8e8f0',
    '--shelf-desc-color': 'rgba(255,255,255,0.5)',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': 'rgba(255,255,255,0.1)',
    '--shelf-tag-hot': 'linear-gradient(135deg, #ff4757, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #2ed573, #7bed9f)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #1a1a2e, #2a2a4e)',
    '--shelf-capsule-bg': 'rgba(241,196,15,0.12)',
    '--shelf-header-bg': 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    '--shelf-nav-slider-left': 'linear-gradient(135deg, #f1c40f 0%, #d4ac0d 100%)',
    '--shelf-nav-slider-right': 'linear-gradient(135deg, #f39c12 0%, #e67e22 100%)',
    '--shelf-accent': '#f1c40f',
    '--shelf-accent-light': 'rgba(241, 196, 15, 0.15)'
  },

  /* =====================================================================
   * 紫色神秘主题（神秘活动）
   * 抽奖：紫色主色调，深紫背景
   * 兑换：基于原方案 C（暗色游戏风），调整为紫色调
   * ===================================================================== */
  purple_mystery: {
    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#9b59b6',
    '--theme-primary-dark': '#7d3c98',
    '--theme-primary-light': '#bb8fce',
    '--theme-primary-lighter': '#d2b4de',
    '--theme-secondary': '#6c3483',
    '--theme-secondary-dark': '#512e5f',
    '--theme-secondary-light': '#a569bd',
    '--theme-accent': '#e8daef',
    '--theme-accent-dark': '#c39bd3',
    '--theme-accent-light': '#f4ecf7',
    '--theme-accent-bright': '#d7bde2',
    '--theme-text': '#ecf0f1',
    '--theme-text-light': '#bdc3c7',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.4)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a1a3e',
    '--theme-background': '#1a1a3e',
    '--theme-bg-dark': '#16163a',
    '--theme-bg-darker': '#0e0e2a',
    '--theme-bg-light': '#2a1a5e',
    '--theme-bg-lighter': '#3a2a6e',
    '--theme-shadow-strong': 'rgba(155, 89, 182, 0.4)',
    '--theme-shadow-medium': 'rgba(155, 89, 182, 0.25)',
    '--theme-shadow-soft': 'rgba(155, 89, 182, 0.15)',
    '--theme-glow-intense': 'rgba(155, 89, 182, 0.9)',
    '--theme-glow-medium': 'rgba(155, 89, 182, 0.6)',
    '--theme-glow-soft': 'rgba(155, 89, 182, 0.35)',
    '--theme-border': '#34495e',
    '--theme-border-light': 'rgba(155, 89, 182, 0.25)',
    '--theme-highlight': 'rgba(155, 89, 182, 0.3)',
    '--theme-success': '#2ecc71',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 基于方案 C 调整为紫色调
    '--shelf-card-bg': 'linear-gradient(145deg, #1a1a3e, #16163a)',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.25)',
    '--shelf-card-border': '1rpx solid rgba(155,89,182,0.15)',
    '--shelf-card-hover-shadow': '0 0 20rpx rgba(155,89,182,0.2)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': 'linear-gradient(135deg, #1a1a3e, #2a1a5e)',
    '--shelf-price-color': '#e8daef',
    '--shelf-price-unit': '#d7bde2',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': 'rgba(255,255,255,0.35)',
    '--shelf-cta-bg': 'linear-gradient(135deg, #9b59b6, #6c3483)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '14rpx',
    '--shelf-cta-shadow': '0 0 16rpx rgba(155,89,182,0.35)',
    '--shelf-type-bar-radius': '20rpx 20rpx 0 0',
    '--shelf-name-color': '#ecf0f1',
    '--shelf-desc-color': 'rgba(255,255,255,0.5)',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': 'rgba(255,255,255,0.1)',
    '--shelf-tag-hot': 'linear-gradient(135deg, #ff4757, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #2ed573, #7bed9f)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #9b59b6, #d7bde2)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #1a1a3e, #2a1a5e)',
    '--shelf-capsule-bg': 'rgba(155,89,182,0.12)',
    '--shelf-header-bg': 'linear-gradient(135deg, #2c1654 0%, #1a0a3e 100%)',
    '--shelf-nav-slider-left': 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)',
    '--shelf-nav-slider-right': 'linear-gradient(135deg, #7c4dff 0%, #6c3ce0 100%)',
    '--shelf-accent': '#9b59b6',
    '--shelf-accent-light': 'rgba(155, 89, 182, 0.15)'
  },

  /* =====================================================================
   * 春节主题（红金喜庆）
   * 抽奖：中国红主色调，浅红背景
   * 兑换：基于原方案 B（暖橙电商风），调整为红金色调
   * ===================================================================== */
  spring_festival: {
    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#e74c3c',
    '--theme-primary-dark': '#c0392b',
    '--theme-primary-light': '#f1948a',
    '--theme-primary-lighter': '#f5b7b1',
    '--theme-secondary': '#f1c40f',
    '--theme-secondary-dark': '#d4ac0d',
    '--theme-secondary-light': '#f7dc6f',
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#b8860b',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ff8c00',
    '--theme-text': '#c0392b',
    '--theme-text-light': '#e74c3c',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.5)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#7b241c',
    '--theme-background': '#fff5f5',
    '--theme-bg-dark': '#7b241c',
    '--theme-bg-darker': '#5a1a14',
    '--theme-bg-light': '#fff0f0',
    '--theme-bg-lighter': '#fff8f8',
    '--theme-shadow-strong': 'rgba(231, 76, 60, 0.4)',
    '--theme-shadow-medium': 'rgba(231, 76, 60, 0.25)',
    '--theme-shadow-soft': 'rgba(231, 76, 60, 0.15)',
    '--theme-glow-intense': 'rgba(231, 76, 60, 0.9)',
    '--theme-glow-medium': 'rgba(231, 76, 60, 0.6)',
    '--theme-glow-soft': 'rgba(231, 76, 60, 0.35)',
    '--theme-border': '#f5b7b1',
    '--theme-border-light': 'rgba(231, 76, 60, 0.2)',
    '--theme-highlight': 'rgba(231, 76, 60, 0.3)',
    '--theme-success': '#27ae60',
    '--theme-danger': '#c0392b',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 基于方案 B 调整为红金色调
    '--shelf-card-bg': 'linear-gradient(180deg, #fff5f5 0%, #ffffff 30%)',
    '--shelf-card-radius': '24rpx',
    '--shelf-card-shadow': '0 4rpx 20rpx rgba(231,76,60,0.08)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 2rpx 8rpx rgba(231,76,60,0.06)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': '#f5f7fa',
    '--shelf-price-color': '#e74c3c',
    '--shelf-price-unit': '#e74c3c',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #e74c3c, #c0392b)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '0 0 24rpx 24rpx',
    '--shelf-cta-shadow': 'none',
    '--shelf-type-bar-radius': '24rpx 24rpx 0 0',
    '--shelf-name-color': '#333333',
    '--shelf-desc-color': '#999999',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': '#f5f5f5',
    '--shelf-tag-hot': 'linear-gradient(135deg, #e74c3c, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #f1c40f, #ffd700)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #fff5f5, #ffe0e0)',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': 'linear-gradient(135deg, #c0392b 0%, #a93226 100%)',
    '--shelf-nav-slider-left': 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
    '--shelf-nav-slider-right': 'linear-gradient(135deg, #f1c40f 0%, #d4ac0d 100%)',
    '--shelf-accent': '#e74c3c',
    '--shelf-accent-light': 'rgba(231, 76, 60, 0.15)'
  },

  /* =====================================================================
   * 圣诞主题（红绿配色）
   * 抽奖：圣诞绿主色调，浅绿背景
   * 兑换：基于原方案 E（彩色分类），调整为绿色调
   * ===================================================================== */
  christmas: {
    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#27ae60',
    '--theme-primary-dark': '#1e8449',
    '--theme-primary-light': '#58d68d',
    '--theme-primary-lighter': '#82e0aa',
    '--theme-secondary': '#e74c3c',
    '--theme-secondary-dark': '#c0392b',
    '--theme-secondary-light': '#f1948a',
    '--theme-accent': '#e74c3c',
    '--theme-accent-dark': '#c0392b',
    '--theme-accent-light': '#f1948a',
    '--theme-accent-bright': '#ffd700',
    '--theme-text': '#27ae60',
    '--theme-text-light': '#2ecc71',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a3c2a',
    '--theme-background': '#f0fff0',
    '--theme-bg-dark': '#1a3c2a',
    '--theme-bg-darker': '#0e2a1e',
    '--theme-bg-light': '#e8f8e8',
    '--theme-bg-lighter': '#f0fff0',
    '--theme-shadow-strong': 'rgba(39, 174, 96, 0.4)',
    '--theme-shadow-medium': 'rgba(39, 174, 96, 0.25)',
    '--theme-shadow-soft': 'rgba(39, 174, 96, 0.15)',
    '--theme-glow-intense': 'rgba(39, 174, 96, 0.9)',
    '--theme-glow-medium': 'rgba(39, 174, 96, 0.6)',
    '--theme-glow-soft': 'rgba(39, 174, 96, 0.35)',
    '--theme-border': '#a9dfbf',
    '--theme-border-light': 'rgba(39, 174, 96, 0.2)',
    '--theme-highlight': 'rgba(39, 174, 96, 0.3)',
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 基于方案 E 调整为绿色调
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 4rpx 20rpx rgba(0,0,0,0.06)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 8rpx 28rpx rgba(0,0,0,0.1)',
    '--shelf-card-hover-translate': '-2rpx',
    '--shelf-card-image-bg': '#f0fff0',
    '--shelf-price-color': '#27ae60',
    '--shelf-price-unit': '#27ae60',
    '--shelf-price-row-bg': 'linear-gradient(90deg, rgba(39,174,96,0.06), transparent)',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #27ae60, #1e8449)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '14rpx',
    '--shelf-cta-shadow': 'none',
    '--shelf-type-bar-radius': '20rpx 20rpx 0 0',
    '--shelf-name-color': '#333333',
    '--shelf-desc-color': '#999999',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': '#f0f0f0',
    '--shelf-tag-hot': 'linear-gradient(135deg, #e74c3c, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #27ae60, #82e0aa)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #f0fff0, #e8f8e8)',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': 'linear-gradient(135deg, #27ae60 0%, #1e8449 100%)',
    '--shelf-nav-slider-left': 'linear-gradient(135deg, #27ae60 0%, #1e8449 100%)',
    '--shelf-nav-slider-right': 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
    '--shelf-accent': '#27ae60',
    '--shelf-accent-light': 'rgba(39, 174, 96, 0.15)'
  },

  /* =====================================================================
   * 夏日主题（清爽蓝色）
   * 抽奖：天空蓝主色调，浅蓝背景
   * 兑换：吸收原方案 A（毛玻璃质感），清透浅色系
   * ===================================================================== */
  summer: {
    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#3498db',
    '--theme-primary-dark': '#2471a3',
    '--theme-primary-light': '#5dade2',
    '--theme-primary-lighter': '#85c1e9',
    '--theme-secondary': '#1abc9c',
    '--theme-secondary-dark': '#148f77',
    '--theme-secondary-light': '#48c9b0',
    '--theme-accent': '#f39c12',
    '--theme-accent-dark': '#d68910',
    '--theme-accent-light': '#f7c948',
    '--theme-accent-bright': '#ff8c00',
    '--theme-text': '#2980b9',
    '--theme-text-light': '#5dade2',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a2a3e',
    '--theme-background': '#f0f8ff',
    '--theme-bg-dark': '#1a2a3e',
    '--theme-bg-darker': '#0e1e2e',
    '--theme-bg-light': '#e8f4fd',
    '--theme-bg-lighter': '#f0f8ff',
    '--theme-shadow-strong': 'rgba(52, 152, 219, 0.4)',
    '--theme-shadow-medium': 'rgba(52, 152, 219, 0.25)',
    '--theme-shadow-soft': 'rgba(52, 152, 219, 0.15)',
    '--theme-glow-intense': 'rgba(52, 152, 219, 0.9)',
    '--theme-glow-medium': 'rgba(52, 152, 219, 0.6)',
    '--theme-glow-soft': 'rgba(52, 152, 219, 0.35)',
    '--theme-border': '#aed6f1',
    '--theme-border-light': 'rgba(52, 152, 219, 0.2)',
    '--theme-highlight': 'rgba(52, 152, 219, 0.3)',
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 吸收原方案 A：毛玻璃质感
    '--shelf-card-bg': 'rgba(255,255,255,0.78)',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.06), inset 0 1rpx 0 rgba(255,255,255,0.9)',
    '--shelf-card-border': '1rpx solid rgba(255,255,255,0.6)',
    '--shelf-card-hover-shadow': '0 4rpx 16rpx rgba(0,0,0,0.04)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': 'linear-gradient(135deg, #e8f4fd, #f0f8ff)',
    '--shelf-price-color': '#3498db',
    '--shelf-price-unit': '#3498db',
    '--shelf-price-row-bg': 'linear-gradient(90deg, rgba(52,152,219,0.06), transparent)',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #3498db, #2471a3)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '14rpx',
    '--shelf-cta-shadow': 'none',
    '--shelf-type-bar-radius': '20rpx 20rpx 0 0',
    '--shelf-name-color': '#333333',
    '--shelf-desc-color': '#999999',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': '#f0f0f0',
    '--shelf-tag-hot': 'linear-gradient(135deg, #ff4757, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #3498db, #85c1e9)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #f0f8ff, #e8f4fd)',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
    '--shelf-nav-slider-left': 'linear-gradient(135deg, #3498db 0%, #2980b9 100%)',
    '--shelf-nav-slider-right': 'linear-gradient(135deg, #1abc9c 0%, #16a085 100%)',
    '--shelf-accent': '#3498db',
    '--shelf-accent-light': 'rgba(52, 152, 219, 0.15)'
  }
}

/**
 * 根据主题标识生成完整 CSS 变量内联样式字符串
 *
 * 返回值同时包含 --theme-* 和 --shelf-* 两组变量，
 * 抽奖组件读取 --theme-* 部分，兑换组件读取 --shelf-* 部分，互不干扰。
 *
 * @param themeName 主题标识（对应后端 system_configs.app_theme 或 lottery_campaigns.display.effect_theme）
 * @returns CSS 内联样式字符串，如 "--theme-primary:#e67e22;--shelf-card-bg:#ffffff;"
 */
function getGlobalThemeStyle(themeName: string): string {
  const theme = GLOBAL_THEME_MAP[themeName] || GLOBAL_THEME_MAP['default']
  return Object.entries(theme)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
}

/**
 * 获取所有可用的主题标识列表
 * @returns 主题标识数组，如 ['default', 'gold_luxury', 'purple_mystery', ...]
 */
function getAvailableThemes(): string[] {
  return Object.keys(GLOBAL_THEME_MAP)
}

module.exports = { getGlobalThemeStyle, getAvailableThemes, GLOBAL_THEME_MAP }
