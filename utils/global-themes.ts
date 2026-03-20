/**
 * 全局氛围主题 CSS 变量映射表（统一 source of truth）
 *
 * 合并抽奖主题（--theme-*）和兑换主题（--shelf-*）为 6 套全局统一主题。
 *
 * 架构：全局氛围 + 活动级覆盖
 *   - 全局氛围：后端 system_configs 表 config_key='app_theme'，控制所有 Tab 页
 *   - 活动覆盖：后端 lottery_campaigns 表 display.effect_theme，仅控制 lottery-activity 组件内部
 *
 * 6 套主题标识：default / gold_luxury / purple_mystery / spring_festival / christmas / summer
 *
 * 设计规范（v4.0 去塑料感重构）：
 *   1. 每套主题只有 1 个主色方向，渐变仅保留在页面头部
 *   2. 卡片/标签/按钮等一律改纯色，去掉玻璃拟态和渐变
 *   3. 内容区块用纯色背景（去掉 rgba 半透明）
 *   4. 阴影带主题色调，融入画面
 *
 * 变量命名规范：
 *   --theme-*  系列：抽奖模块、通用页面使用（主色调、文字、背景、阴影、光效、状态色）
 *   --shelf-*  系列：兑换模块使用（卡片、价格、按钮、库存、标签）
 *
 * 保底机制：所有组件的 var() 均带 fallback 默认值。
 *
 * ⚠️ 内部模块，不通过 utils/index.ts 引用其他工具（避免循环依赖）
 *    外部页面统一从 utils/index.ts 导入 GlobalTheme
 *
 * @file utils/global-themes.ts
 * @version 7.0.0
 * @since 2026-03-21
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
   * v4.0 重构：蓝紫色全部清除，统一走暖橙方向
   * 头部渐变改为暖橙，卡片纯白底，标签纯色
   * ===================================================================== */
  default: {
    // ── 页面级渐变背景（头部区域，暖橙方向统一） ──
    '--theme-page-start': '#f7931e',
    '--theme-page-end': '#e67e22',

    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#ff6b35',
    '--theme-primary-dark': '#e55a2b',
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
    '--theme-background': '#faf6f1',
    '--theme-bg-dark': '#2c1810',
    '--theme-bg-darker': '#1a0e08',
    '--theme-bg-light': '#fffdf7',
    '--theme-bg-lighter': '#fff5eb',
    '--theme-shadow-strong': 'rgba(255, 107, 53, 0.4)',
    '--theme-shadow-medium': 'rgba(255, 107, 53, 0.25)',
    '--theme-shadow-soft': 'rgba(255, 107, 53, 0.15)',
    '--theme-glow-intense': 'rgba(255, 107, 53, 0.9)',
    '--theme-glow-medium': 'rgba(255, 107, 53, 0.6)',
    '--theme-glow-soft': 'rgba(255, 107, 53, 0.35)',
    '--theme-border': '#eeeeee',
    '--theme-border-light': 'rgba(255, 107, 53, 0.2)',
    '--theme-highlight': 'rgba(255, 107, 53, 0.3)',
    '--theme-success': '#27ae60',
    '--theme-danger': '#e74c3c',
    '--theme-warning': '#f39c12',

    // ── 兑换变量（--shelf-*）── 纯色化，去掉所有渐变和玻璃拟态
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 4rpx 20rpx rgba(255,107,53,0.06)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 8rpx 28rpx rgba(255,107,53,0.1)',
    '--shelf-card-hover-translate': '-2rpx',
    '--shelf-card-image-bg': '#f5f7fa',
    '--shelf-price-color': '#ff6b35',
    '--shelf-price-unit': '#ff6b35',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': '#ff6b35',
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
    '--shelf-tag-hot': '#ff4757',
    '--shelf-tag-new': '#2ed573',
    '--shelf-tag-limited': '#7c4dff',
    '--shelf-fallback-bg': '#f5f5f5',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': '#e67e22',
    '--shelf-nav-slider-left': '#ff6b35',
    '--shelf-nav-slider-right': '#e67e22',
    '--shelf-accent': '#e67e22',
    '--shelf-accent-light': 'rgba(230, 126, 34, 0.15)',

    // ── 内容区块变量（纯白底，去掉半透明） ──
    '--theme-section-bg': '#ffffff',
    '--theme-item-bg': '#ffffff',
    '--theme-section-text': '#333333',
    '--theme-section-text-sub': '#999999',
    '--theme-section-border': 'rgba(0, 0, 0, 0.06)'
  },

  /* =====================================================================
   * 金色奢华主题（高端活动）
   * v4.0 重构：金色从大面积降为线条/文字，卡片去渐变改纯深色
   * ===================================================================== */
  gold_luxury: {
    // ── 页面级渐变背景（保留头部深蓝渐变） ──
    '--theme-page-start': '#2c3e50',
    '--theme-page-end': '#1a1a2e',

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

    // ── 兑换变量（--shelf-*）── 卡片去渐变改纯色深底
    '--shelf-card-bg': '#232340',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.25)',
    '--shelf-card-border': '1rpx solid rgba(241,196,15,0.15)',
    '--shelf-card-hover-shadow': '0 0 20rpx rgba(241,196,15,0.2)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': '#2a2a4e',
    '--shelf-price-color': '#ffd700',
    '--shelf-price-unit': '#ffd700',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': 'rgba(255,255,255,0.35)',
    '--shelf-cta-bg': '#f1c40f',
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
    '--shelf-tag-hot': '#ff4757',
    '--shelf-tag-new': '#2ed573',
    '--shelf-tag-limited': '#7c4dff',
    '--shelf-fallback-bg': '#1a1a2e',
    '--shelf-capsule-bg': 'rgba(241,196,15,0.12)',
    '--shelf-header-bg': '#1a1a2e',
    '--shelf-nav-slider-left': '#f1c40f',
    '--shelf-nav-slider-right': '#f39c12',
    '--shelf-accent': '#f1c40f',
    '--shelf-accent-light': 'rgba(241, 196, 15, 0.15)',

    // ── 内容区块变量（纯色深底，去掉半透明） ──
    '--theme-section-bg': '#232340',
    '--theme-item-bg': '#2a2a50',
    '--theme-section-text': '#e8e8f0',
    '--theme-section-text-sub': 'rgba(255, 255, 255, 0.5)',
    '--theme-section-border': 'rgba(255, 255, 255, 0.08)'
  },

  /* =====================================================================
   * 紫色神秘主题（神秘活动）
   * v4.0 重构：简化为单色深紫底 + 浅紫卡片，去掉多层叠加
   * ===================================================================== */
  purple_mystery: {
    // ── 页面级渐变背景（保留头部紫色渐变） ──
    '--theme-page-start': '#6c3483',
    '--theme-page-end': '#512e5f',

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

    // ── 兑换变量（--shelf-*）── 卡片去渐变改纯色深紫
    '--shelf-card-bg': '#2a2050',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.25)',
    '--shelf-card-border': '1rpx solid rgba(155,89,182,0.15)',
    '--shelf-card-hover-shadow': '0 0 20rpx rgba(155,89,182,0.2)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': '#2a1a5e',
    '--shelf-price-color': '#e8daef',
    '--shelf-price-unit': '#d7bde2',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': 'rgba(255,255,255,0.35)',
    '--shelf-cta-bg': '#9b59b6',
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
    '--shelf-tag-hot': '#ff4757',
    '--shelf-tag-new': '#2ed573',
    '--shelf-tag-limited': '#9b59b6',
    '--shelf-fallback-bg': '#1a1a3e',
    '--shelf-capsule-bg': 'rgba(155,89,182,0.12)',
    '--shelf-header-bg': '#2c1654',
    '--shelf-nav-slider-left': '#9b59b6',
    '--shelf-nav-slider-right': '#7c4dff',
    '--shelf-accent': '#9b59b6',
    '--shelf-accent-light': 'rgba(155, 89, 182, 0.15)',

    // ── 内容区块变量（纯色深紫底，去掉半透明） ──
    '--theme-section-bg': '#2a2050',
    '--theme-item-bg': '#322860',
    '--theme-section-text': '#ecf0f1',
    '--theme-section-text-sub': 'rgba(255, 255, 255, 0.5)',
    '--theme-section-border': 'rgba(255, 255, 255, 0.08)'
  },

  /* =====================================================================
   * 春节主题（红金喜庆）
   * v4.0 重构：红色收缩到头部+按钮，正文改灰色，大面积暖白底
   * ===================================================================== */
  spring_festival: {
    // ── 页面级渐变背景（保留头部红色） ──
    '--theme-page-start': '#e74c3c',
    '--theme-page-end': '#c0392b',

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
    '--theme-text': '#333333',
    '--theme-text-light': '#666666',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.5)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#7b241c',
    '--theme-background': '#fff8f5',
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

    // ── 兑换变量（--shelf-*）── 卡片纯白底，标签纯色
    '--shelf-card-bg': '#ffffff',
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
    '--shelf-cta-bg': '#e74c3c',
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
    '--shelf-tag-hot': '#e74c3c',
    '--shelf-tag-new': '#f1c40f',
    '--shelf-tag-limited': '#7c4dff',
    '--shelf-fallback-bg': '#fff5f5',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': '#c0392b',
    '--shelf-nav-slider-left': '#e74c3c',
    '--shelf-nav-slider-right': '#f1c40f',
    '--shelf-accent': '#e74c3c',
    '--shelf-accent-light': 'rgba(231, 76, 60, 0.15)',

    // ── 内容区块变量（纯白底，去掉半透明） ──
    '--theme-section-bg': '#ffffff',
    '--theme-item-bg': '#ffffff',
    '--theme-section-text': '#333333',
    '--theme-section-text-sub': '#999999',
    '--theme-section-border': 'rgba(231, 76, 60, 0.08)'
  },

  /* =====================================================================
   * 圣诞主题（绿色主调 + 极小面积红色点缀）
   * v4.0 重构：红色从副色降到 ≤3%，强调色换金色，正文改灰色
   * ===================================================================== */
  christmas: {
    // ── 页面级渐变背景（保留头部绿色） ──
    '--theme-page-start': '#27ae60',
    '--theme-page-end': '#1e8449',

    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#27ae60',
    '--theme-primary-dark': '#1e8449',
    '--theme-primary-light': '#58d68d',
    '--theme-primary-lighter': '#82e0aa',
    '--theme-secondary': '#e74c3c',
    '--theme-secondary-dark': '#c0392b',
    '--theme-secondary-light': '#f1948a',
    '--theme-accent': '#ffd700',
    '--theme-accent-dark': '#b8860b',
    '--theme-accent-light': '#ffe44d',
    '--theme-accent-bright': '#ffd700',
    '--theme-text': '#333333',
    '--theme-text-light': '#666666',
    '--theme-text-lighter': 'rgba(255, 255, 255, 0.45)',
    '--theme-text-inverse': '#ffffff',
    '--theme-text-dark': '#1a3c2a',
    '--theme-background': '#f0fff5',
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

    // ── 兑换变量（--shelf-*）── 标签纯色，导航滑块统一绿色
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 4rpx 20rpx rgba(0,0,0,0.06)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 8rpx 28rpx rgba(0,0,0,0.1)',
    '--shelf-card-hover-translate': '-2rpx',
    '--shelf-card-image-bg': '#f0fff0',
    '--shelf-price-color': '#27ae60',
    '--shelf-price-unit': '#27ae60',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': '#27ae60',
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
    '--shelf-tag-hot': '#e74c3c',
    '--shelf-tag-new': '#27ae60',
    '--shelf-tag-limited': '#7c4dff',
    '--shelf-fallback-bg': '#f0fff0',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': '#27ae60',
    '--shelf-nav-slider-left': '#27ae60',
    '--shelf-nav-slider-right': '#27ae60',
    '--shelf-accent': '#27ae60',
    '--shelf-accent-light': 'rgba(39, 174, 96, 0.15)',

    // ── 内容区块变量（纯白底，去掉半透明） ──
    '--theme-section-bg': '#ffffff',
    '--theme-item-bg': '#ffffff',
    '--theme-section-text': '#333333',
    '--theme-section-text-sub': '#999999',
    '--theme-section-border': 'rgba(39, 174, 96, 0.08)'
  },

  /* =====================================================================
   * 夏日主题（清爽蓝色）
   * v4.0 重构：青绿色完全移除，统一走纯蓝，卡片去玻璃拟态改纯白
   * ===================================================================== */
  summer: {
    // ── 页面级渐变背景（保留头部蓝色） ──
    '--theme-page-start': '#3498db',
    '--theme-page-end': '#2471a3',

    // ── 抽奖 / 通用变量（--theme-*） ──
    '--theme-primary': '#3498db',
    '--theme-primary-dark': '#2471a3',
    '--theme-primary-light': '#5dade2',
    '--theme-primary-lighter': '#85c1e9',
    '--theme-secondary': '#2471a3',
    '--theme-secondary-dark': '#2471a3',
    '--theme-secondary-light': '#5dade2',
    '--theme-accent': '#f39c12',
    '--theme-accent-dark': '#d68910',
    '--theme-accent-light': '#f7c948',
    '--theme-accent-bright': '#ff8c00',
    '--theme-text': '#333333',
    '--theme-text-light': '#666666',
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

    // ── 兑换变量（--shelf-*）── 去玻璃拟态改纯白底
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(52,152,219,0.06)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 4rpx 16rpx rgba(52,152,219,0.04)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': '#f0f8ff',
    '--shelf-price-color': '#3498db',
    '--shelf-price-unit': '#3498db',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': '#3498db',
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
    '--shelf-tag-hot': '#ff4757',
    '--shelf-tag-new': '#3498db',
    '--shelf-tag-limited': '#7c4dff',
    '--shelf-fallback-bg': '#f0f8ff',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)',
    '--shelf-header-bg': '#3498db',
    '--shelf-nav-slider-left': '#3498db',
    '--shelf-nav-slider-right': '#3498db',
    '--shelf-accent': '#3498db',
    '--shelf-accent-light': 'rgba(52, 152, 219, 0.15)',

    // ── 内容区块变量（纯白底，去掉半透明） ──
    '--theme-section-bg': '#ffffff',
    '--theme-item-bg': '#ffffff',
    '--theme-section-text': '#333333',
    '--theme-section-text-sub': '#999999',
    '--theme-section-border': 'rgba(52, 152, 219, 0.08)'
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

/**
 * 获取主题的原生导航组件颜色（用于 wx.setNavigationBarColor / wx.setTabBarStyle）
 *
 * CSS 变量只能控制页面 WXML 内的样式，微信原生导航栏和 TabBar 必须通过 JS API 设置。
 * 此函数从主题配置中提取关键色值，供页面调用原生 API 使用。
 *
 * @param themeName 主题标识
 * @returns { navBg: 导航栏背景色, navText: 导航栏文字色(仅支持#ffffff/#000000), tabSelected: TabBar选中色 }
 */
function getThemeNavColors(themeName: string): {
  navBg: string
  navText: string
  tabSelected: string
} {
  const theme = GLOBAL_THEME_MAP[themeName] || GLOBAL_THEME_MAP['default']
  return {
    navBg: theme['--theme-page-start'] || '#f7931e',
    navText: '#ffffff',
    tabSelected: theme['--theme-primary'] || '#ff6b35'
  }
}

module.exports = { getGlobalThemeStyle, getAvailableThemes, getThemeNavColors, GLOBAL_THEME_MAP }
