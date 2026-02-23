/**
 * 兑换系统 CSS 变量主题映射表
 * 对标: packageLottery/lottery-activity/themes/themes.ts
 *
 * 5套主题（A~E），每套包含完整的 CSS 变量定义
 * 组件通过 var(--shelf-xxx, fallback) 读取，fallback 值 = theme-E 默认值
 * CSS 变量通过 DOM 继承穿透 isolated 隔离（CSS 自定义属性不受 styleIsolation 影响）
 *
 * 使用方式:
 *   1. exchange-shelf.ts observer 监听 theme property 变化
 *   2. 调用 getExchangeThemeStyle('E') 获取内联样式字符串
 *   3. setData({ shelfThemeStyle: style }) 注入到组件根元素
 *   4. 子组件通过 var(--shelf-card-bg, #ffffff) 读取主题值
 *
 * @file packageExchange/themes/exchange-themes.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

/** 兑换系统主题 CSS 变量映射（5套完整定义） */
const EXCHANGE_THEME_MAP: Record<string, Record<string, string>> = {
  /* ===== 方案 E: 彩色分类 + 电商价格（默认推荐） ===== */
  E: {
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
    '--shelf-cta-bg': 'linear-gradient(135deg, #667eea, #764ba2)',
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
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)'
  },

  /* ===== 方案 A: 毛玻璃质感 ===== */
  A: {
    '--shelf-card-bg': 'rgba(255,255,255,0.78)',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.06), inset 0 1rpx 0 rgba(255,255,255,0.9)',
    '--shelf-card-border': '1rpx solid rgba(255,255,255,0.6)',
    '--shelf-card-hover-shadow': '0 4rpx 16rpx rgba(0,0,0,0.04)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': 'linear-gradient(135deg, #f0f2f5, #e8eaf0)',
    '--shelf-price-color': '#ff6b35',
    '--shelf-price-unit': '#ff6b35',
    '--shelf-price-row-bg': 'linear-gradient(90deg, rgba(255,107,53,0.1), transparent)',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #667eea, #764ba2)',
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
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)'
  },

  /* ===== 方案 B: 暖橙电商风 ===== */
  B: {
    '--shelf-card-bg': 'linear-gradient(180deg, #fff8f3 0%, #ffffff 30%)',
    '--shelf-card-radius': '24rpx',
    '--shelf-card-shadow': '0 4rpx 20rpx rgba(255,107,53,0.08)',
    '--shelf-card-border': 'none',
    '--shelf-card-hover-shadow': '0 2rpx 8rpx rgba(255,107,53,0.06)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': '#f5f7fa',
    '--shelf-price-color': '#ff4d4f',
    '--shelf-price-unit': '#ff4d4f',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #ff6b35, #f7931e)',
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
    '--shelf-tag-hot': 'linear-gradient(135deg, #ff4757, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #2ed573, #7bed9f)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)'
  },

  /* ===== 方案 C: 暗色游戏风 ===== */
  C: {
    '--shelf-card-bg': 'linear-gradient(145deg, #1a1a2e, #16213e)',
    '--shelf-card-radius': '20rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.25)',
    '--shelf-card-border': '1rpx solid rgba(255,107,53,0.15)',
    '--shelf-card-hover-shadow': '0 0 20rpx rgba(255,107,53,0.2)',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': 'linear-gradient(135deg, #1a1a2e, #2a1a3e)',
    '--shelf-price-color': '#ffd700',
    '--shelf-price-unit': '#ffd700',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': 'rgba(255,255,255,0.35)',
    '--shelf-cta-bg': 'linear-gradient(135deg, #ff6b35, #f7931e)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '14rpx',
    '--shelf-cta-shadow': '0 0 16rpx rgba(255,107,53,0.35)',
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
    '--shelf-fallback-bg': 'linear-gradient(135deg, #1a1a2e, #2a1a3e)',
    '--shelf-capsule-bg': 'rgba(102,126,234,0.12)'
  },

  /* ===== 方案 D: 极简扁平 ===== */
  D: {
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '16rpx',
    '--shelf-card-shadow': 'none',
    '--shelf-card-border': '1rpx solid #e8e8e8',
    '--shelf-card-hover-shadow': 'none',
    '--shelf-card-hover-translate': '0',
    '--shelf-card-image-bg': '#f5f5f5',
    '--shelf-price-color': '#ff6b35',
    '--shelf-price-unit': '#ff6b35',
    '--shelf-price-row-bg': 'transparent',
    '--shelf-price-original': '#bbb',
    '--shelf-cta-bg': 'linear-gradient(135deg, #667eea, #764ba2)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-radius': '0 0 16rpx 16rpx',
    '--shelf-cta-shadow': 'none',
    '--shelf-type-bar-radius': '0',
    '--shelf-name-color': '#333333',
    '--shelf-desc-color': '#999999',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': '#f0f0f0',
    '--shelf-tag-hot': 'linear-gradient(135deg, #ff4757, #ff6b81)',
    '--shelf-tag-new': 'linear-gradient(135deg, #2ed573, #7bed9f)',
    '--shelf-tag-limited': 'linear-gradient(135deg, #7c4dff, #b388ff)',
    '--shelf-fallback-bg': '#f5f5f5',
    '--shelf-capsule-bg': 'rgba(0,0,0,0.55)'
  }
}

/**
 * 根据主题名称生成 CSS 变量内联样式字符串
 * @param themeName 主题标识（'A'|'B'|'C'|'D'|'E'）
 * @returns CSS 内联样式字符串，用于组件根元素 style 属性
 */
function getExchangeThemeStyle(themeName: string): string {
  const theme = EXCHANGE_THEME_MAP[themeName] || EXCHANGE_THEME_MAP['E']
  return Object.entries(theme)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
}

module.exports = { getExchangeThemeStyle, EXCHANGE_THEME_MAP }
