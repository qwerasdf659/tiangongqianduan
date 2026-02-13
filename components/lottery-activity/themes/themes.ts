/**
 * 主题色CSS变量映射表
 * 根据后端 display.effect_theme 返回对应的CSS变量内联样式
 *
 * 6套主题覆盖：default / gold_luxury / purple_mystery / spring_festival / christmas / summer
 *
 * @file components/lottery-activity/themes/themes.ts
 * @version 1.0.0
 * @since 2026-02-11
 */

/** 主题配置映射 */
const THEME_MAP: Record<string, Record<string, string>> = {
  default: {
    '--theme-primary': '#e67e22',
    '--theme-secondary': '#ffffff',
    '--theme-background': '#fff8f0',
    '--theme-text': '#333333',
    '--theme-text-light': '#666666',
    '--theme-border': '#eeeeee',
    '--theme-highlight': 'rgba(230, 126, 34, 0.3)'
  },
  gold_luxury: {
    '--theme-primary': '#f1c40f',
    '--theme-secondary': '#2c3e50',
    '--theme-background': '#1a1a2e',
    '--theme-text': '#f1c40f',
    '--theme-text-light': '#bdc3c7',
    '--theme-border': '#34495e',
    '--theme-highlight': 'rgba(241, 196, 15, 0.3)'
  },
  purple_mystery: {
    '--theme-primary': '#9b59b6',
    '--theme-secondary': '#2c3e50',
    '--theme-background': '#1a1a3e',
    '--theme-text': '#ecf0f1',
    '--theme-text-light': '#bdc3c7',
    '--theme-border': '#34495e',
    '--theme-highlight': 'rgba(155, 89, 182, 0.3)'
  },
  spring_festival: {
    '--theme-primary': '#e74c3c',
    '--theme-secondary': '#f1c40f',
    '--theme-background': '#fff5f5',
    '--theme-text': '#c0392b',
    '--theme-text-light': '#e74c3c',
    '--theme-border': '#f5b7b1',
    '--theme-highlight': 'rgba(231, 76, 60, 0.3)'
  },
  christmas: {
    '--theme-primary': '#27ae60',
    '--theme-secondary': '#e74c3c',
    '--theme-background': '#f0fff0',
    '--theme-text': '#27ae60',
    '--theme-text-light': '#2ecc71',
    '--theme-border': '#a9dfbf',
    '--theme-highlight': 'rgba(39, 174, 96, 0.3)'
  },
  summer: {
    '--theme-primary': '#3498db',
    '--theme-secondary': '#ffffff',
    '--theme-background': '#f0f8ff',
    '--theme-text': '#2980b9',
    '--theme-text-light': '#5dade2',
    '--theme-border': '#aed6f1',
    '--theme-highlight': 'rgba(52, 152, 219, 0.3)'
  }
}

/**
 * 根据主题名称生成CSS变量内联样式字符串
 * @param themeName 主题名称（对应后端 display.effect_theme）
 * @returns CSS内联样式字符串，如 "--theme-primary:#e67e22;--theme-secondary:#ffffff;"
 */
function getThemeStyle(themeName: string): string {
  const theme = THEME_MAP[themeName] || THEME_MAP['default']
  return Object.entries(theme)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
}

module.exports = { getThemeStyle, THEME_MAP }

export {}
