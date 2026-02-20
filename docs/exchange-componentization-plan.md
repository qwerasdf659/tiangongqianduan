# 兑换页面组件化升级方案（完全对标抽奖系统架构，一次性到位）

> **项目**: 天工小程序前端  
> **目标**: 将兑换页面从 `Page() + spread handlers` 架构升级为与抽奖系统完全一致的 `Component() + 分包 + CSS变量主题 + isolated隔离` 架构  
> **参照标杆**: `packageLottery/lottery-activity` 万能抽奖组件  
> **创建时间**: 2026-02-20  
> **最终方案确认**: 2026-02-20（项目未上线，不兼容旧接口，一次性投入，追求最低长期维护成本）  
> **基于**: 实际代码审查 + 抽奖系统架构逆向分析 + 全项目交叉验证

### 关键决策记录

| 编号 | 决策项 | 结论 | 理由 |
|------|--------|------|------|
| D1 | 主题设置面板位置 | **留在页面壳 exchange.ts** | 两个 Tab 共享主题偏好，壳统一管理后通过 properties 下传 |
| D2 | 共享组件层级 | **packageExchange/shared/（根级共享）** | exchange-shelf 和 exchange-market 都要用筛选器和弹窗 |
| D3 | 子空间是否独立组件 | **做成独立子组件** | lucky-space ~800行、premium-space ~950行，不拆等于没重构 |
| D4 | WebSocket 架构 | **页面壳订阅 + refreshToken property 驱动** | wx:if 销毁组件后 selectComponent 返回 null；用 property observer 更可靠 |
| D5 | 样式隔离策略 | **默认 `isolated`（不设 styleIsolation）** | 完全对标 lottery-activity.json — 每个组件自带完整 SCSS，不依赖页面穿透 |
| D6 | 主题系统 | **CSS 变量注入 `style="{{themeStyle}}"`** | 完全对标 lottery-activity themes.ts — `var(--xxx, fallback)` 模式 |
| D7 | SCSS 迁移 | **1:1 搬运 partial → 组件 SCSS + 主题转 var()** | 组件自包含样式，长期维护改组件样式只改组件文件 |
| D8 | Properties 命名 | **语义化命名（pointsBalance 非 totalPoints）** | 项目未上线，不兼容旧接口，接口清晰优先 |
| D9 | 竞价功能归属 | **独立 bid-panel 子组件** | 竞价有独立的12个data字段、480行handler、832行SCSS；与lottery每个玩法独立子组件对齐 |
| D10 | Handler 复用机制 | **Behavior 替代 spread handler** | Component 原生 behaviors 机制，生命周期自动合并，比展开运算符更规范 |
| D11 | SCSS 分配原则 | **按子组件边界分配，exchange-shelf.scss ≤500行** | 对齐 lottery-activity.scss 428行量级，每个子组件自带完整 SCSS |
| D12 | data 字段归属 | **子组件自行管理筛选/分页状态** | exchange-shelf data ~29字段，对齐 lottery-activity ~30字段 |
| D13 | Tab 切换组件可见性 | **`hidden` 替代 `wx:if`（二次排查新增）** | `wx:if` 销毁组件导致状态丢失，与当前 Page 行为不一致；`hidden` 保留组件实例 |

---

## 一、代码审查：当前两套系统的架构差异

### 1.1 逐项对比（基于实际代码）

| 维度 | 抽奖系统（当前状态） | 兑换系统（当前状态） | 差距 |
|------|---------------------|---------------------|------|
| **顶层类型** | `Component()`（lottery-activity.ts:74） | `Page()`（exchange.ts:33） | 根本性差异 |
| **外部接口** | 2个 properties：`campaignCode` + `size` | 无，Page 自己加载一切 | 根本性差异 |
| **代码组织** | 1个组件 828行 + 14个子组件各100-400行 | 1个Page壳 1019行 + 3个 handlers 合计 2059行 = **3078行混在一个 Page 实例** | 耦合度极高 |
| **模板组织** | 自定义组件（隔离作用域，properties 接口） | `<include>`编译期内联（共享全部 data 作用域，**无接口约束**） | 本质区别 |
| **样式隔离** | 默认 `isolated`（lottery-activity.json 无 styleIsolation 配置） | Page 级 SCSS，无隔离概念 | 完全不同 |
| **主题系统** | CSS 变量注入 `style="{{themeStyle}}"` + `getThemeStyle()` + 30+ 变量 + `var(--xxx, fallback)` | CSS 类名切换 `.theme-A`~`.theme-E`（1140行 SCSS） | 完全不同 |
| **组件 SCSS** | 每个组件独立 SCSS（lottery-activity.scss 430行 + 16个子组件各自 SCSS） | 无组件 SCSS，5个 partial 全挂在 Page 级 | 完全不同 |
| **父子通信** | `bind:draw` / `bind:animationEnd` / `triggerEvent` | 无，handlers 直接调 `this.setData()`（同一个 Page 实例） | 无隔离 |
| **分包部署** | 全部在 `packageLottery/`，主包只有薄壳 | 全部在主包 `pages/exchange/`，**占主包约 10,300+ 行** | 未分包 |
| **WebSocket** | **无** | 页面直接订阅 Socket.IO 事件 | 兑换独有 |
| **data 字段数** | 组件 ~30 个字段 | Page **101 个字段** | 10倍膨胀 |

### 1.2 exchange.ts Page data 膨胀分析

```
当前 exchange.ts data 字段逐个点数（101个）:

用户/积分:         3 个字段（userInfo, totalPoints, frozenPoints）
Tab/空间切换:      2 个字段（currentTab, currentSpace）
交易市场数据:      2 个字段（products, filteredProducts）
统计数据:          3 个字段（luckySpaceStats, premiumSpaceStats, marketStats）
页面状态:          2 个字段（loading, refreshing）
交易市场弹窗:      4 个字段（showConfirm, selectedProduct, showResult, resultData）
商品兑换弹窗:      6 个字段（showShopConfirm ~ shopResultData）
兑换交互:          2 个字段（exchangeQuantity, exchanging）
搜索/筛选:         2 个字段（searchKeyword, currentFilter）
Tab 配置:          1 个字段（tabs）
筛选项(商品):      5 个字段（luckyBasicFilters ~ sortByOptions）
筛选项(市场):      3 个字段（marketTypeFilters ~ marketSortOptions）
分页(主):          4 个字段（currentPage ~ totalProducts）
瀑布流配置:        2 个字段（waterfallPageSize, pageInputValue）
高级筛选(市场):    5 个字段（showAdvancedFilter ~ sortBy）
幸运空间筛选:      8 个字段（luckySearchKeyword ~ luckyFilteredProducts）
分页(幸运):        6 个字段（luckyCurrentPage ~ luckyPageInputValue）
分页(臻选):        6 个字段（premiumCurrentPage ~ premiumPageInputValue）
空间系统:          1 个字段（spaceList）
臻选解锁:          9 个字段（premiumUnlocked ~ premiumValidityHours，含 premiumTotalUnlockCount）
瀑布流布局:        7 个字段（waterfallProducts ~ renderOffset）
臻选商品:          1 个字段（premiumFilteredProducts）
竞价数据:          4 个字段（hotRankingList ~ realTimeTimer）
竞价交互:          9 个字段（showBidModal ~ bidModalCountdown）
主题系统:          4 个字段（cardTheme, effects, viewMode, showThemeSettings）
────────────────────────
合计:             101 个字段
```

### 1.3 当前 CSS 组织 vs 抽奖系统 CSS 组织

```
兑换系统（当前）:                          抽奖系统（标杆）:
exchange.scss (245行)                     lottery.scss (123行) ← 页面壳
  @import _exchange-nav.scss (427行)        @import lottery-header (...)
  @import _exchange-market.scss (1290行)    @import lottery-qrcode (...)
  @import _exchange-shop.scss (1214行)
  @import _exchange-premium.scss (1441行)  lottery-activity.scss (428行) ← 组件自有
  @import _exchange-card-themes.scss (1140行) sub/grid/grid.scss ← 子组件自有
────────────────────                       sub/wheel/wheel.scss
全部 5,757 行在 Page 级                     sub/card/card.scss
组件 SCSS: 无                              ... 共16个独立 SCSS 文件

问题: isolated 隔离下                      工作原理:
Page CSS 不穿透 → 组件无样式               组件自带样式 → 不需穿透
                                          CSS变量从根元素继承 → 主题跨组件生效
```

### 1.4 抽奖系统 CSS 变量主题的工作原理

```
1. themes.ts 定义6套主题，每套30+个CSS变量
2. getThemeStyle('gold_luxury') → "--theme-primary:#d4a017;--theme-accent:#ffd700;..."
3. 组件根元素: <view class="lottery-activity" style="{{themeStyle}}">
4. 组件 SCSS 用 var() 读取: background: var(--theme-primary, #e67e22);
5. CSS变量通过DOM继承穿透到子组件（即使 isolated 隔离，CSS自定义属性不受影响）
6. 每个 var() 带 fallback → 即使变量未注入，用 fallback 值渲染（保底 = default 主题）
```

**这就是为什么 isolated 模式下抽奖系统照常工作** — 普通 CSS 规则被隔离阻断，但 CSS 自定义属性通过 DOM 继承不受影响。

### 1.5 当前 SCSS partial 与组件的 1:1 对应关系

已验证：每个 SCSS partial 的根选择器就是其对应 WXML 的最外层元素，不依赖页面壳 `.exchange-container` 作为祖先。搬进组件后 DOM 结构关系不变，选择器全部匹配。

| SCSS partial | 根选择器 | 对应 WXML | 迁移目标组件 |
|-------------|---------|----------|------------|
| `_exchange-shop.scss` (1214行) | `.dual-space-market` | exchange-shop.wxml 第1行 | `exchange-shelf.scss` |
| `_exchange-market.scss` (1290行) | `.exchange-content` | exchange-market.wxml 第1行 | `exchange-market.scss` |
| `_exchange-premium.scss` (1441行) | 臻选空间内部类 | exchange-shop.wxml 臻选部分 | `premium-space.scss` |
| `_exchange-card-themes.scss` (1140行) | `.unified-card` / `.theme-X` | 各 WXML 中的卡片元素 | **转为 CSS 变量** → 分发到各组件 |
| `_exchange-nav.scss` (427行) | `.nav-module` | exchange.wxml Tab导航 | **留在 exchange.scss** |

---

## 二、目标架构（完全对标 lottery-activity）

### 2.1 架构图

```
╔══════════════════════════════════════════════════════════════════╗
║  兑换系统 — 最终架构（完全对标抽奖系统，决策D1-D12全量落地）       ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  pages/exchange/exchange.ts (薄壳 Page，~280行)                   ║
║    ├── 生命周期、积分、WebSocket、Tab 切换、主题设置                ║
║    ├── exchange.scss: 仅 ~150行（容器+Tab导航+主题面板）            ║
║    └── WXML:                                                     ║
║        <exchange-shelf                                           ║
║          hidden="{{currentTab !== 'exchange'}}"  ← D13修正       ║
║          active="{{currentTab === 'exchange'}}"                  ║
║          pointsBalance="{{totalPoints}}"                         ║
║          frozenPoints="{{frozenPoints}}"                         ║
║          theme="{{cardTheme}}"                                   ║
║          effects="{{effects}}"                                   ║
║          viewMode="{{viewMode}}"                                 ║
║          spaceId="{{currentSpace}}"                              ║
║          refreshToken="{{_shelfRefreshToken}}"                   ║
║          bind:exchange="onExchangeSuccess"                       ║
║          bind:pointsupdate="onPointsUpdate"                      ║
║          bind:viewmodechange="onViewModeChange"  ← 13.4补充     ║
║          bind:autherror="onAuthError"            ← 13.4补充     ║
║        />                                                        ║
║        <exchange-market                                          ║
║          hidden="{{currentTab !== 'market'}}"    ← D13修正       ║
║          active="{{currentTab === 'market'}}"                    ║
║          pointsBalance="{{totalPoints}}"                         ║
║          theme="{{cardTheme}}"                                   ║
║          effects="{{effects}}"                                   ║
║          viewMode="{{viewMode}}"                                 ║
║          refreshToken="{{_marketRefreshToken}}"                  ║
║          bind:purchase="onPurchaseSuccess"                       ║
║          bind:pointsupdate="onPointsUpdate"                      ║
║          bind:viewmodechange="onViewModeChange"  ← 13.4补充     ║
║          bind:autherror="onAuthError"            ← 13.4补充     ║
║        />                                                        ║
║                       │                                          ║
║      CSS变量通过DOM继承穿透 isolated 隔离                          ║
║                       ▼                                          ║
║                                                                  ║
║  packageExchange/ (兑换分包)                                      ║
║    ├── exchange-shelf/ (Component, behaviors: [shopBehavior])    ║
║    │   ├── exchange-shelf.scss (~490行，仅货架框架+CSS变量声明)    ║
║    │   ├── exchange-shelf.ts (~350行, data ~29字段)               ║
║    │   ├── handlers/shop-behavior.ts (Behavior，决策D10)          ║
║    │   ├── WXML: style="{{shelfThemeStyle}}" 注入CSS变量           ║
║    │   └── sub/                                                  ║
║    │       ├── lucky-space/   (~500行SCSS，自管筛选/分页状态)      ║
║    │       ├── premium-space/ (~650行SCSS，自管分页状态)           ║
║    │       └── bid-panel/    (~832行SCSS，竞价独立子组件，决策D9)  ║
║    │                                                              ║
║    ├── exchange-market/ (Component, behaviors: [marketBehavior]) ║
║    │   ├── exchange-market.scss (~1400行，自包含)                  ║
║    │   ├── handlers/market-behavior.ts (Behavior)                ║
║    │   └── WXML: style="{{marketThemeStyle}}" 注入CSS变量          ║
║    │                                                              ║
║    ├── shared/                                                   ║
║    │   ├── exchange-filter/   (通用筛选器，Properties 接口定义)    ║
║    │   ├── exchange-confirm/  (确认弹窗 ~566行SCSS，接口定义)      ║
║    │   └── exchange-result/   (结果弹窗，接口定义)                 ║
║    │                                                              ║
║    ├── themes/                                                    ║
║    │   └── exchange-themes.ts (5套主题完整定义 × ~25变量)          ║
║    │                                                              ║
║    └── utils/                                                    ║
║        └── product-display.ts (纯函数，asset映射配置驱动)          ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
```

### 2.2 与抽奖系统逐项对标

| 维度 | 抽奖系统 | 兑换系统（改造后） | 对标状态 |
|------|---------|------------------|:-------:|
| 组件 JSON | `"component": true`，无 styleIsolation | `"component": true`，无 styleIsolation | 一致 |
| 组件自有 SCSS | lottery-activity.scss (428行) | exchange-shelf.scss (~490行，决策D11) | 一致 |
| 子组件 SCSS | sub/grid/grid.scss 等16个独立文件 | sub/lucky-space.scss, sub/premium-space.scss | 一致 |
| 主题定义 | themes.ts (294行, 6套主题 × 30+变量) | exchange-themes.ts (5套主题 × ~25变量) | 一致 |
| 主题注入 | `style="{{themeStyle}}"` | `style="{{shelfThemeStyle}}"` | 一致 |
| 变量读取 | `var(--theme-primary, #e67e22)` | `var(--shelf-card-bg, #ffffff)` | 一致 |
| 变量保底 | fallback = default 主题值 | fallback = theme-E 主题值 | 一致 |
| 页面 CSS 穿透 | 不依赖 | 不依赖 | 一致 |
| 父子通信 | properties + triggerEvent | properties + triggerEvent | 一致 |
| 分包 | packageLottery/ | packageExchange/ | 一致 |
| WebSocket | 无 | refreshToken property 驱动 | 兑换独有 |

---

## 三、CSS 变量主题系统

### 3.1 exchange-themes.ts（对标 lottery-activity/themes/themes.ts）

```typescript
// packageExchange/themes/exchange-themes.ts
// 对标: packageLottery/lottery-activity/themes/themes.ts (294行, 6套主题)

const EXCHANGE_THEME_MAP: Record<string, Record<string, string>> = {
  'E': {
    '--shelf-card-bg': '#ffffff',
    '--shelf-card-radius': '24rpx',
    '--shelf-card-shadow': '0 4rpx 16rpx rgba(0,0,0,0.08)',
    '--shelf-card-border': '2rpx solid rgba(102,126,234,0.08)',
    '--shelf-card-hover-shadow': '0 12rpx 28rpx rgba(0,0,0,0.12)',
    '--shelf-card-hover-translate': '-4rpx',
    '--shelf-price-color': '#ff6b35',
    '--shelf-price-original': '#999',
    '--shelf-cta-bg': 'linear-gradient(135deg, #ff6b35, #f7931e)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-shadow': '0 6rpx 16rpx rgba(255,107,53,0.35)',
    '--shelf-stock-normal': '#52c41a',
    '--shelf-stock-warn': '#faad14',
    '--shelf-stock-danger': '#ff4d4f',
    '--shelf-stock-bar-bg': 'rgba(0,0,0,0.06)',
    '--shelf-tag-hot': '#ff4757',
    '--shelf-tag-new': '#2ed573',
    '--shelf-tag-limited': '#7c4dff',
    '--shelf-tag-ending': '#ff6348',
    '--shelf-name-color': '#333',
    '--shelf-desc-color': '#888',
    '--shelf-type-bar-asset': 'linear-gradient(90deg, #667eea, #764ba2)',
    '--shelf-type-bar-item': 'linear-gradient(90deg, #ff6b35, #f7931e)',
    '--shelf-type-bar-lucky': 'linear-gradient(90deg, #4ecdc4, #44a08d)',
    '--shelf-placeholder-bg': 'linear-gradient(135deg, #f5f5f5, #e8e8e8)'
  },
  'A': {
    '--shelf-card-bg': 'rgba(255, 255, 255, 0.72)',
    '--shelf-card-radius': '28rpx',
    '--shelf-card-shadow': '0 8rpx 32rpx rgba(0,0,0,0.08)',
    '--shelf-card-border': '2rpx solid rgba(255,255,255,0.5)',
    '--shelf-card-hover-shadow': '0 16rpx 40rpx rgba(0,0,0,0.12)',
    '--shelf-card-hover-translate': '-6rpx',
    '--shelf-price-color': '#667eea',
    '--shelf-price-original': '#aaa',
    '--shelf-cta-bg': 'linear-gradient(135deg, #667eea, #764ba2)',
    '--shelf-cta-text': '#ffffff',
    '--shelf-cta-shadow': '0 8rpx 20rpx rgba(102,126,234,0.35)',
    // ... 与 E 相同的 key，不同的 value
  },
  'B': { /* 暖橙电商 — 全部 key 对齐 */ },
  'C': { /* 暗色游戏 — 全部 key 对齐 */ },
  'D': { /* 极简扁平 — 全部 key 对齐 */ }
}

function getExchangeThemeStyle(themeName: string): string {
  const theme = EXCHANGE_THEME_MAP[themeName] || EXCHANGE_THEME_MAP['E']
  return Object.entries(theme)
    .map(([key, value]) => `${key}:${value}`)
    .join(';')
}

module.exports = { getExchangeThemeStyle, EXCHANGE_THEME_MAP }
```

### 3.2 主题转换规则（.theme-X 类名 → var() 变量）

```scss
// ── 转换前: _exchange-card-themes.scss ──
.unified-card { position: relative; overflow: hidden; }
.unified-card .card-image-area image { width: 100%; height: 100%; }

// 5套主题各200行：
.theme-E .unified-card { background: #fff; border-radius: 24rpx; }
.theme-E .price-current { color: #ff6b35; }
.theme-A .unified-card { background: rgba(255,255,255,0.72); border-radius: 28rpx; }
.theme-A .price-current { color: #667eea; }
// ... 1,140行

// ── 转换后: 组件 SCSS 中 ──
.unified-card {
  position: relative;
  overflow: hidden;
  background: var(--shelf-card-bg, #ffffff);          // fallback = theme-E 值
  border-radius: var(--shelf-card-radius, 24rpx);
  box-shadow: var(--shelf-card-shadow, 0 4rpx 16rpx rgba(0,0,0,0.08));
}
.unified-card .card-image-area image { width: 100%; height: 100%; }  // 不变
.price-current { color: var(--shelf-price-color, #ff6b35); }
.cta-btn {
  background: var(--shelf-cta-bg, linear-gradient(135deg, #ff6b35, #f7931e));
  color: var(--shelf-cta-text, #ffffff);
}
// → 5套×200行 = 1,000行 压缩为 ~200行 var() 规则
// → fallback 值 = theme-E → 即使 CSS 变量完全未注入，UI 与当前默认外观一致
```

### 3.3 增强效果保留方式

增强效果（grain/holo/rotatingBorder/breathingGlow/ripple/fullbleed）不依赖主题切换，而是通过 CSS 类名开关。这些 **不转为 CSS 变量**，直接搬入组件 SCSS：

```scss
// 原样搬入组件 SCSS，不做转换
.grain-overlay::before { /* ... 噪点纹理 ... */ }
.holo-effect::after { /* ... 全息光效 ... */ }
.rotating-border { /* ... 旋转边框 ... */ }
.breathing-glow { /* ... 呼吸光圈 ... */ }
.ripple-layer .ripple-active { /* ... 墨水扩散 ... */ }
.fullbleed-mode .card-image-area { /* ... 全图叠字 ... */ }
.list-mode { /* ... 列表视图 ... */ }
```

WXML 中的类名绑定不变：`class="unified-card {{effects.grain ? 'grain-overlay' : ''}} ..."`

---

## 四、具体拆分方案

### 4.1 exchange-shelf 组件（对标 lottery-activity）

```typescript
// packageExchange/exchange-shelf/exchange-shelf.ts
// 对标: packageLottery/lottery-activity/lottery-activity.ts (828行)
// 决策D10: 使用 Behavior 替代 spread handler
// 决策D12: 子组件自行管理筛选/分页状态，shelf 仅保留 ~29 字段

const { ExchangeConfig } = require('../../utils/index')
const { enrichProductDisplayFields } = require('../utils/product-display')
const { getExchangeThemeStyle } = require('../themes/exchange-themes')
const shopBehavior = require('./handlers/shop-behavior')

Component({
  behaviors: [shopBehavior],

  properties: {
    pointsBalance: { type: Number, value: 0 },
    frozenPoints: { type: Number, value: 0 },
    theme: { type: String, value: 'E' },
    effects: { type: Object, value: {} },
    viewMode: { type: String, value: 'grid' },
    spaceId: { type: String, value: 'lucky' },
    refreshToken: { type: Number, value: 0 }
  },

  data: {
    shelfThemeStyle: '',

    // 空间切换 & 配置
    spaceList: [],
    currentSpace: 'lucky',
    loading: true,

    // 臻选解锁状态（后端 premium-status 接口）
    premiumUnlocked: false,
    premiumRemainingHours: 0,
    premiumIsValid: false,
    premiumTotalUnlockCount: 0,
    premiumCanUnlock: false,
    premiumIsExpired: false,
    premiumConditions: null,
    premiumUnlockCost: 0,
    premiumValidityHours: 24,

    // 兑换确认弹窗（两个空间共用，由 shared/exchange-confirm 驱动）
    showShopConfirm: false,
    selectedShopProduct: null,
    shopExchangeQuantity: 1,
    shopExchanging: false,
    showShopResult: false,
    shopResultData: null,

    // 筛选配置（初始化后通过 property 下传给 lucky-space / exchange-filter）
    luckyBasicFilters: [],
    categoryOptions: [],
    costRangeOptions: [],
    stockStatusOptions: [],
    sortByOptions: [],

    // 统计数据
    luckySpaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 },
    premiumSpaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 }
    // ───────────── 合计 ~29 字段（对齐 lottery-activity ~30字段）
  },

  lifetimes: {
    attached() { this._initShelf() }
  },

  observers: {
    theme(themeName) {
      this.setData({ shelfThemeStyle: getExchangeThemeStyle(themeName) })
    },
    spaceId(newSpace) {
      if (newSpace && newSpace !== this.data.currentSpace) {
        this.setData({ currentSpace: newSpace })
      }
    },
    refreshToken(val) {
      if (val > 0) this._refreshCurrentSpace()
    }
  },

  methods: {
    async _initShelf() {
      this.setData({ shelfThemeStyle: getExchangeThemeStyle(this.properties.theme) })

      const config = await ExchangeConfig.ExchangeConfigCache.getConfig()
      const shopFilters = config.shop_filters
      this.setData({
        spaceList: config.spaces.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order),
        luckyBasicFilters: shopFilters.basic_filters || [],
        categoryOptions: shopFilters.category_options || [],
        costRangeOptions: shopFilters.cost_ranges || [],
        stockStatusOptions: shopFilters.stock_statuses || [],
        sortByOptions: shopFilters.sort_options || [],
        loading: false
      })
      this.initPremiumUnlockStatus()
    },

    _refreshCurrentSpace() {
      const luckySpace = this.selectComponent('#lucky-space')
      const premiumSpace = this.selectComponent('#premium-space')
      const bidPanel = this.selectComponent('#bid-panel')
      if (this.data.currentSpace === 'lucky' && luckySpace) luckySpace.refresh()
      if (this.data.currentSpace === 'premium' && premiumSpace) premiumSpace.refresh()
      if (bidPanel) bidPanel.refresh()
    },

    enrichProductDisplayFields: enrichProductDisplayFields,

    _notifyExchangeSuccess(orderData) {
      this.triggerEvent('exchange', { orderData })
      this.triggerEvent('pointsupdate')
    },
    _notifyPointsChanged() {
      this.triggerEvent('pointsupdate')
    }
  }
})
```

**exchange-shelf.wxml 根元素**（对标 lottery-activity.wxml 第67行）：

```xml
<view class="exchange-shelf" style="{{shelfThemeStyle}}">
  <!-- CSS变量从此元素向下继承到所有子元素和子组件 -->
  <!-- 原 exchange-shop.wxml 内容搬入，去掉外层 wx:if -->
</view>
```

**exchange-shelf.json**（对标 lottery-activity.json）：

```json
{
  "component": true,
  "usingComponents": {
    "lucky-space": "./sub/lucky-space/lucky-space",
    "premium-space": "./sub/premium-space/premium-space",
    "exchange-filter": "../shared/exchange-filter/exchange-filter",
    "exchange-confirm": "../shared/exchange-confirm/exchange-confirm",
    "exchange-result": "../shared/exchange-result/exchange-result",
    "pagination": "/components/pagination/pagination",
    "empty-state": "/components/empty-state/empty-state",
    "loading-spinner": "/components/loading-spinner/loading-spinner"
  }
}
```

无 `styleIsolation` 配置 — 使用默认 `isolated`，与 lottery-activity.json 完全一致。

### 4.2 exchange-shelf.scss 构成（~490行，决策D11）

SCSS 按子组件边界分配后，exchange-shelf.scss 仅保留货架框架，对齐 lottery-activity.scss (428行) 量级。

```scss
// packageExchange/exchange-shelf/exchange-shelf.scss (~490行)
// 对标: packageLottery/lottery-activity/lottery-activity.scss (428行)
@import '../../styles/variables';
@import '../../styles/mixins';

// ① CSS 变量默认值声明（对标 lottery-activity.scss 第13-54行）
.exchange-shelf {
  --shelf-card-bg: #ffffff;
  --shelf-card-radius: 24rpx;
  --shelf-card-shadow: 0 4rpx 16rpx rgba(0,0,0,0.08);
  --shelf-price-color: #ff6b35;
  --shelf-cta-bg: linear-gradient(135deg, #ff6b35, #f7931e);
  --shelf-cta-text: #ffffff;
  --shelf-stock-normal: #52c41a;
  --shelf-stock-warn: #faad14;
  --shelf-stock-danger: #ff4d4f;
  --shelf-tag-hot: #ff4757;
  --shelf-tag-new: #2ed573;
  --shelf-tag-limited: #7c4dff;
  --shelf-name-color: #333;
  --shelf-desc-color: #888;
  // ... 全部变量，默认值 = theme-E
}

// ② 卡片主题 var() 规则（~200行，从 _exchange-card-themes.scss 转换）
.unified-card {
  background: var(--shelf-card-bg, #ffffff);
  border-radius: var(--shelf-card-radius, 24rpx);
  box-shadow: var(--shelf-card-shadow, 0 4rpx 16rpx rgba(0,0,0,0.08));
}
.unified-card .card-image-area image { width: 100%; height: 100%; }
.price-current { color: var(--shelf-price-color, #ff6b35); }
.cta-btn { background: var(--shelf-cta-bg, linear-gradient(135deg, #ff6b35, #f7931e)); }
// ...

// ③ 增强效果（原样搬，不转var）
.grain-overlay::before { /* ... */ }
.holo-effect::after { /* ... */ }
.rotating-border { /* ... */ }
// ...

// ④ 货架框架样式（从 _exchange-shop.scss 第1-189行搬入）
// 仅包含：双空间容器、空间切换器、固定头部
.dual-space-market { /* ... */ }
.shop-sticky-header { /* ... */ }
.space-selector-enhanced { /* ... */ }
// ...

// ⑤ 不再包含：
//    - 幸运空间样式 → lucky-space.scss
//    - 臻选空间样式 → premium-space.scss
//    - 竞价弹窗样式 → bid-panel.scss
//    - 确认/结果弹窗 → exchange-confirm.scss (shared)
```

### 4.3 bid-panel 子组件（决策D9）

竞价是一个独立功能域，拥有独立的数据、逻辑、模板和样式。提取为 exchange-shelf 的子组件，与 lottery-activity 每个玩法独立子组件对齐。

```typescript
// packageExchange/exchange-shelf/sub/bid-panel/bid-panel.ts
const { API, Logger } = require('../../../../utils/index')
const bidLog = Logger.createLogger('bid-panel')

Component({
  properties: {
    pointsBalance: { type: Number, value: 0 },
    theme: { type: String, value: 'E' },
    refreshToken: { type: Number, value: 0 }
  },

  data: {
    hotRankingList: [],
    biddingProducts: [],
    newProducts: [],
    showBidModal: false,
    selectedBidProduct: null,
    userBidAmount: 0,
    bidHistory: [],
    bidMinAmount: 0,
    bidAmountValid: false,
    bidSubmitting: false,
    showBidRules: false,
    bidModalCountdown: ''
    // ───────────── 12 字段（从 exchange-shelf 独立出来）
  },

  lifetimes: {
    attached() { this.loadBidProducts() },
    detached() {
      if (this._bidListTimer) clearInterval(this._bidListTimer)
      if (this._bidModalTimer) clearInterval(this._bidModalTimer)
    }
  },

  observers: {
    refreshToken(val) { if (val > 0) this.loadBidProducts() }
  },

  methods: {
    // 从 exchange-bid-handlers.ts (480行) 搬入，this 指向组件实例
    async loadBidProducts() { /* ... */ },
    onBidTap(e) { /* ... */ },
    onBidAmountInput(e) { /* ... */ },
    onConfirmBid() { /* ... */ },
    onQuickBidAdd(e) { /* ... */ },
    onSetMinBid() { /* ... */ },
    onToggleBidRules() { /* ... */ },
    onCloseBidModal() { /* ... */ },
    async loadBidHistory() { /* ... */ },
    _formatBidCountdown(endTime) { /* ... */ },
    _startBidListCountdown() { /* ... */ },
    _startBidModalCountdown() { /* ... */ },
    refresh() { this.loadBidProducts() },
    _notifyBidComplete(bidData) {
      this.triggerEvent('bidcomplete', { bidData })
    }
  }
})
```

**bid-panel.scss** (~832行)：从 `_exchange-premium.scss` 第610-1441行原样搬入（竞价弹窗全部样式）。

**bid-panel.json**：

```json
{ "component": true }
```

### 4.4 shared 组件 Properties 接口

```typescript
// shared/exchange-filter Properties
properties: {
  filterType: { type: String, value: 'lucky' },  // 'lucky' | 'premium' | 'market'
  basicFilters: { type: Array, value: [] },
  categoryOptions: { type: Array, value: [] },
  costRangeOptions: { type: Array, value: [] },
  stockStatusOptions: { type: Array, value: [] },
  sortByOptions: { type: Array, value: [] },
  currentFilter: { type: String, value: 'all' },
  searchKeyword: { type: String, value: '' }
}
// bind:filterchange → { keyword, filter, category, costRange, stockStatus, sortBy }

// shared/exchange-confirm Properties
properties: {
  visible: { type: Boolean, value: false },
  product: { type: Object, value: null },
  quantity: { type: Number, value: 1 },
  pointsBalance: { type: Number, value: 0 },
  submitting: { type: Boolean, value: false }
}
// bind:confirm → { product, quantity }
// bind:close

// shared/exchange-result Properties
properties: {
  visible: { type: Boolean, value: false },
  success: { type: Boolean, value: false },
  orderData: { type: Object, value: null },
  message: { type: String, value: '' }
}
// bind:close
// bind:vieworder → { orderNo }
```

### 4.5 exchange-market 组件

结构与 exchange-shelf 同理：

- `exchange-market.ts` — `behaviors: [marketBehavior]`，observer 监听 `theme` → `getExchangeThemeStyle()`
- `exchange-market.wxml` — 根元素 `style="{{marketThemeStyle}}"`
- `exchange-market.scss` — `_exchange-market.scss` 原样搬入(1290行) + 卡片主题 var() 规则
- `exchange-market.json` — 无 styleIsolation（默认 isolated）
- `handlers/market-behavior.ts` — `Behavior({})` 包裹 market handler 方法

### 4.6 product-display.ts 纯函数

```typescript
// packageExchange/utils/product-display.ts
const ASSET_DISPLAY_MAP = {
  POINTS: '积分', red_shard: '红色碎片', blue_shard: '蓝色碎片',
  gold_coin: '金币', diamond: '钻石'
}

function formatAssetLabel(assetCode) {
  return ASSET_DISPLAY_MAP[assetCode] || assetCode
}

function enrichProductDisplayFields(productList) {
  if (!Array.isArray(productList)) return productList
  const rarityMap = { '普通': 'common', '稀有': 'rare', '史诗': 'epic', '传说': 'legendary' }
  return productList.map(function(product) {
    return Object.assign({}, product, {
      _rarityClass: rarityMap[product.rarity] || '',
      _isLegendary: product.rarity === '传说',
      _isLimited: product.badge === 'limited' || product.badge === 'ending_soon',
      _hasImage: !!product.image_url,
      _costLabel: formatAssetLabel(product.cost_asset_code || 'POINTS')
    })
  })
}

module.exports = { enrichProductDisplayFields, formatAssetLabel, ASSET_DISPLAY_MAP }
```

---

## 五、薄壳 Page

### 5.1 exchange.ts（~280行）

保留职责：生命周期、积分刷新、Tab 切换、主题偏好管理、WebSocket refreshToken。

与当前文档中的薄壳 Page 代码一致（第四节 4.1），不再重复。主要区别：
- Properties 使用语义化命名（`pointsBalance` / `theme` / `spaceId`）
- 不再有 `options: { styleIsolation: 'apply-shared' }` 之类的配置

### 5.2 app.json 分包配置

```json
// app.json — 新增 packageExchange 分包（对标 packageLottery 模式）
{
  "subpackages": [
    { "root": "packageLottery", "name": "lottery", "pages": ["_placeholder/_placeholder"] },
    { "root": "packageExchange", "name": "exchange", "pages": ["_placeholder/_placeholder"] }
  ],
  "preloadRule": {
    "pages/exchange/exchange": {
      "network": "all",
      "packages": ["trade", "lottery", "exchange"]
    }
  }
}
```

**exchange.json 更新**（页面壳引用分包组件）：

```json
{
  "navigationBarTitleText": "兑换中心",
  "navigationBarBackgroundColor": "#FF6B35",
  "navigationBarTextStyle": "white",
  "backgroundColor": "#f8f9fa",
  "enablePullDownRefresh": false,
  "disableScroll": true,
  "onReachBottomDistance": 100,
  "backgroundTextStyle": "dark",
  "usingComponents": {
    "exchange-shelf": "/packageExchange/exchange-shelf/exchange-shelf",
    "exchange-market": "/packageExchange/exchange-market/exchange-market",
    "pagination": "/components/pagination/pagination",
    "empty-state": "/components/empty-state/empty-state",
    "loading-spinner": "/components/loading-spinner/loading-spinner"
  },
  "componentPlaceholder": {
    "exchange-shelf": "view",
    "exchange-market": "view"
  }
}
```

### 5.3 exchange.scss（~150行）

```scss
// pages/exchange/exchange.scss — 仅保留页面壳样式
@import '../../styles/variables';
@import '../../styles/mixins';

.exchange-container {
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.12) 50%, rgba(76,205,196,0.08) 100%);
  padding: 8rpx 12rpx 0;
  position: relative;
  box-sizing: border-box;
}

.exchange-container::before { /* 装饰背景 */ }

// Tab 导航（仅从 _exchange-nav.scss 保留导航部分）
@import 'exchange-nav';

// 主题设置面板样式（从 exchange.scss 原有的主题面板样式中提取）
.theme-settings-overlay { /* ... */ }
.theme-settings-panel { /* ... */ }
// ...
```

**删除的 @import**：`exchange-market`、`exchange-shop`、`exchange-premium`、`exchange-card-themes` — 全部迁入组件 SCSS。

---

## 六、分包目录结构

```
packageExchange/                              # 兑换分包
├── _placeholder/                            # 分包占位页面（对标 packageLottery/_placeholder）
│   ├── _placeholder.ts
│   ├── _placeholder.wxml
│   └── _placeholder.json
│
├── exchange-shelf/                           # 商品货架组件（对标 lottery-activity）
│   ├── exchange-shelf.ts                     # 组件逻辑（~350行，data ~29字段，决策D12）
│   ├── exchange-shelf.wxml                   # 模板（~500行，空间内容由子组件渲染）
│   ├── exchange-shelf.scss                   # 仅货架框架（~490行，决策D11）
│   │   ├── CSS变量默认值声明
│   │   ├── 从 _exchange-shop.scss 第1-189行搬入（货架框架）
│   │   └── 卡片主题 var() 规则 + 增强效果 (~300行)
│   ├── exchange-shelf.json                   # component:true，无 styleIsolation
│   │
│   ├── handlers/
│   │   └── shop-behavior.ts                  # Behavior（决策D10，从 exchange-shop-handlers.ts 搬入）
│   │
│   └── sub/
│       ├── lucky-space/                      # 幸运空间子组件（自管筛选/分页状态）
│       │   ├── lucky-space.ts                # ~20字段（搜索/筛选/分页/瀑布流全在此）
│       │   ├── lucky-space.wxml
│       │   ├── lucky-space.scss              # ~500行（从 _exchange-shop.scss 第190-647行搬入）
│       │   └── lucky-space.json
│       │
│       ├── premium-space/                    # 臻选空间子组件（自管分页状态）
│       │   ├── premium-space.ts              # ~16字段
│       │   ├── premium-space.wxml
│       │   ├── premium-space.scss            # ~650行（从 _exchange-premium.scss 第1-609行搬入）
│       │   └── premium-space.json
│       │
│       └── bid-panel/                        # 竞价子组件（决策D9）
│           ├── bid-panel.ts                  # ~200行，12字段，从 bid-handlers 搬入
│           ├── bid-panel.wxml                # ~200行（竞价卡片区+竞价弹窗）
│           ├── bid-panel.scss                # ~832行（从 _exchange-premium.scss 第610-1441行搬入）
│           └── bid-panel.json
│
├── exchange-market/                          # 交易市场组件
│   ├── exchange-market.ts
│   ├── exchange-market.wxml                  # 从 exchange-market.wxml 搬入 (375行)
│   ├── exchange-market.scss                  # 从 _exchange-market.scss 搬入 (1290行) + var()
│   ├── exchange-market.json                  # 无 styleIsolation
│   └── handlers/
│       └── market-behavior.ts                # Behavior（决策D10，从 market-handlers 搬入 603行）
│
├── shared/                                   # 根级共享组件（决策D2，含 Properties 接口）
│   ├── exchange-filter/                      # 通用筛选器（bind:filterchange）
│   │   ├── exchange-filter.ts
│   │   ├── exchange-filter.wxml
│   │   ├── exchange-filter.scss
│   │   └── exchange-filter.json
│   ├── exchange-confirm/                     # 确认弹窗（bind:confirm / bind:close）
│   │   ├── exchange-confirm.ts
│   │   ├── exchange-confirm.wxml
│   │   ├── exchange-confirm.scss             # ~566行（从 _exchange-shop.scss 第648-1214行搬入）
│   │   └── exchange-confirm.json
│   └── exchange-result/                      # 结果弹窗（bind:close / bind:vieworder）
│       ├── exchange-result.ts
│       ├── exchange-result.wxml
│       ├── exchange-result.scss
│       └── exchange-result.json
│
├── themes/
│   └── exchange-themes.ts                    # CSS变量主题 5套完整定义（对标 themes.ts）
│
└── utils/
    └── product-display.ts                    # enrichProductDisplayFields 纯函数（asset映射配置驱动）
```

---

## 七、SCSS 迁移对照表

### 7.1 搬运规则（按子组件边界分配，决策D11）

| 原文件 | 原行范围 | 行数 | 目标文件 | 操作 |
|--------|---------|------|---------|------|
| `_exchange-shop.scss` | 第1-189行 | ~189 | `exchange-shelf.scss` | **搬入**（货架框架：容器/空间切换器/头部） |
| `_exchange-shop.scss` | 第190-647行 | ~457 | `lucky-space.scss` | **搬入**（幸运空间：瀑布流/网格/卡片/加载态） |
| `_exchange-shop.scss` | 第648-1214行 | ~566 | `exchange-confirm.scss` (shared) | **搬入**（确认/结果弹窗） |
| `_exchange-market.scss` | 全部 | 1290 | `exchange-market.scss` | **原样搬入** |
| `_exchange-premium.scss` | 第1-609行 | ~609 | `premium-space.scss` | **搬入**（臻选空间：解锁UI/网格/特性） |
| `_exchange-premium.scss` | 第610-1441行 | ~832 | `bid-panel.scss` | **搬入**（竞价弹窗全部样式） |
| `_exchange-nav.scss` | 全部 | 427 | **留在 exchange.scss** | **不动** |
| `_exchange-card-themes.scss` 结构+效果 | ~140 | `exchange-shelf.scss` | **原样搬入**（`.unified-card` 基础结构、增强效果） |
| `_exchange-card-themes.scss` 主题样式 | ~1000 | `exchange-themes.ts` + 各组件 var() | **转为 CSS 变量**（5套 `.theme-X` → 1套 `var()` + fallback） |
| `exchange.scss` 容器+主题面板 | ~150 | **留在 exchange.scss** | **保留，删除已迁出的 @import** |

### 7.2 @import 路径调整

组件 SCSS 中的 `@import '../../styles/variables'` 路径需要根据分包位置调整。

抽奖系统的实际做法（已验证）：

```scss
// packageLottery/lottery-activity/sub/grid/grid.scss
@import '../../../../styles/variables';
@import '../../../../styles/mixins';
```

兑换系统对应：

```scss
// packageExchange/exchange-shelf/exchange-shelf.scss
@import '../../styles/variables';
@import '../../styles/mixins';

// packageExchange/exchange-shelf/sub/lucky-space/lucky-space.scss
@import '../../../../styles/variables';
@import '../../../../styles/mixins';
```

---

## 八、事件通信设计

### 8.1 事件流

```
pages/exchange/exchange.ts (薄壳 Page)
  │
  │  properties 下传: pointsBalance, frozenPoints, theme, effects, viewMode, spaceId, refreshToken
  │
  ├── bind:exchange="onExchangeSuccess"     ← exchange-shelf
  ├── bind:purchase="onPurchaseSuccess"     ← exchange-market
  ├── bind:pointsupdate="onPointsUpdate"   ← 两个组件共用
  │
  exchange-shelf style="{{shelfThemeStyle}}"   ← CSS变量注入点
    ├── lucky-space #lucky-space
    │   ├── triggerEvent('producttap')
    │   ├── triggerEvent('refresh')         ← 被 _refreshCurrentSpace 调用
    │   └── 内含 exchange-filter → triggerEvent('filterchange')
    ├── premium-space #premium-space
    │   ├── triggerEvent('producttap')
    │   ├── triggerEvent('unlock')
    │   └── triggerEvent('refresh')
    ├── bid-panel #bid-panel               ← 决策D9：竞价独立子组件
    │   ├── triggerEvent('bidcomplete')
    │   └── triggerEvent('refresh')
    ├── exchange-confirm (shared)           → bind:confirm / bind:close
    └── exchange-result (shared)            → bind:close / bind:vieworder
```

### 8.2 WebSocket 事件驱动流

refreshToken property + observer 模式（与当前文档第七节 7.2 一致）。

---

## 九、实施步骤（一次性完成，18步）

| 步骤 | 工作内容 | 产出 |
|------|---------|------|
| 1 | 创建 `packageExchange/` 完整目录结构 + `_placeholder` 占位页面，app.json 添加分包 + preloadRule + componentPlaceholder | 分包骨架 |
| 2 | 编写 `exchange-themes.ts`：从 `_exchange-card-themes.scss` 提取**全部5套**主题的变量值，生成完整 CSS 变量 map | 主题系统 |
| 3 | 提取 `product-display.ts` 纯函数（消除 this 依赖，asset 映射改为配置驱动） | 工具模块 |
| 4 | 构建 `exchange-shelf.scss`（~490行）：搬入 `_exchange-shop.scss` **第1-189行**（货架框架）+ 卡片结构/增强效果 + CSS变量声明 + var()规则 | 组件样式 |
| 5 | 构建 `lucky-space.scss`（~500行）：搬入 `_exchange-shop.scss` **第190-647行**（幸运空间）+ var() 卡片规则 | 子组件样式 |
| 6 | 构建 `premium-space.scss`（~650行）：搬入 `_exchange-premium.scss` **第1-609行**（臻选空间）+ var() 规则 | 子组件样式 |
| 7 | 构建 `bid-panel.scss`（~832行）：搬入 `_exchange-premium.scss` **第610-1441行**（竞价弹窗） | 子组件样式 |
| 8 | 构建 `exchange-confirm.scss`（~566行）：搬入 `_exchange-shop.scss` **第648-1214行**（确认/结果弹窗） | 共享组件样式 |
| 9 | 构建 `exchange-market.scss`：搬入 `_exchange-market.scss` (1290行) + 卡片 var() 规则 | 组件样式 |
| 10 | 编写 `shop-behavior.ts` Behavior：从 exchange-shop-handlers.ts 搬入，`module.exports = Behavior({methods:{...}})` | 行为模块 |
| 11 | 编写 `bid-panel.ts` Component：从 exchange-bid-handlers.ts 搬入，独立 data/methods/lifetimes | 竞价组件 |
| 12 | 编写 `lucky-space.ts` / `premium-space.ts` Component：各自管理筛选/分页状态（决策D12） | 空间子组件 |
| 13 | 编写 `exchange-shelf.ts` Component：`behaviors: [shopBehavior]` + properties + theme observer + ~29字段 data | 组件逻辑 |
| 14 | 搬运 WXML：exchange-shop.wxml 拆分为 shelf/lucky-space/premium-space/bid-panel 四份，各去掉外层 wx:if，根元素加 `style="{{shelfThemeStyle}}"` | 组件模板 |
| 15 | WXML 全局替换：`{{totalPoints}}` → `{{pointsBalance}}`，`{{cardTheme}}` → `{{theme}}`（语义化命名，决策D8） | 模板更新 |
| 16 | 编写 `market-behavior.ts` + `exchange-market.ts` + 搬运 WXML + 同样的语义化替换 | 交易市场组件 |
| 17 | 编写薄壳 `exchange.ts`（~280行）、`exchange.wxml`（组件标签替代 include）、`exchange.scss`（删除已迁出的 @import）、更新 exchange.json（引用分包组件） | 页面壳 |
| 18 | 编写共享组件（exchange-filter / exchange-confirm / exchange-result），含 Properties 接口 | 共享组件 |
| 19 | 删除旧文件：3个 handler TS + 2个 include WXML + 5个已迁出的 SCSS partial | 清理 |
| 20 | 全功能回归验证 | 质量保证 |

---

## 十、主包体积影响

```
改造前（主包 pages/exchange/）:
  exchange.ts                1019 行
  exchange-shop-handlers.ts   976 行
  exchange-market-handlers.ts 603 行
  exchange-bid-handlers.ts    480 行
  exchange.wxml               199 行
  exchange-shop.wxml          883 行
  exchange-market.wxml        375 行
  _exchange-card-themes.scss  1140 行
  _exchange-market.scss       1290 行
  _exchange-shop.scss         1214 行
  _exchange-nav.scss           427 行
  _exchange-premium.scss      1441 行
  exchange.scss                245 行
  ─────────────────────────────────
  合计: 10,292 行

改造后（主包 pages/exchange/）:
  exchange.ts    ~280 行（薄壳）
  exchange.wxml  ~80 行（薄壳）
  exchange.scss  ~150 行（容器+Tab导航+主题面板）
  _exchange-nav.scss 427 行（Tab导航）
  ─────────────────────────────────
  合计: ~937 行

分包 packageExchange/ — SCSS 按子组件边界分配（决策D11）:
  exchange-shelf.ts    ~350行（data ~29字段，决策D12）
  exchange-shelf.scss  ~490行（仅货架框架，对齐 lottery-activity.scss 428行）
  exchange-shelf.wxml  ~500行
  shop-behavior.ts     ~976行（Behavior，决策D10）
  lucky-space.*        ~500行SCSS + ~400行TS + ~300行WXML（自管筛选/分页）
  premium-space.*      ~650行SCSS + ~300行TS + ~250行WXML（自管分页）
  bid-panel.*          ~832行SCSS + ~200行TS + ~200行WXML（竞价独立，决策D9）
  exchange-market.*    ~1400行SCSS + ~250行TS + ~375行WXML
  market-behavior.ts   ~603行（Behavior）
  shared/confirm       ~566行SCSS + ~100行TS（确认/结果弹窗）
  shared/filter        ~150行（筛选器）
  shared/result        ~100行（结果弹窗）
  themes               ~200行（exchange-themes.ts 5套完整主题）
  utils                ~40行（product-display.ts）
  ─────────────────────────────────
  合计: ~9,640 行

减少: 主包从 10,292 行 → ~937 行（减少约 9,355 行）
预计主包体积减少: 约 150-200KB（编译后）

SCSS 分配对比（决策D11 优化效果）:
  exchange-shelf.scss: ~490行  (原方案 ~1600行, -69%, 对齐 lottery-activity 428行)
  exchange-shelf data: ~29字段  (原方案 ~77字段, -62%, 对齐 lottery-activity ~30字段)
```

---

## 十一、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| SCSS 搬运遗漏 | 某个组件缺少样式 | partial 与组件 1:1 对应（已验证根选择器匹配），机械搬运 |
| 主题 var() 转换遗漏 | 某个属性未用变量 | `var(--xxx, fallback)` 的 fallback 值 = theme-E 当前值 → 即使遗漏也显示当前默认外观 |
| @import 路径错误 | SCSS 编译失败 | 参照 lottery 子组件的实际路径模式 `../../../../styles/variables` |
| CSS 变量未注入 | 组件样式回退 fallback | fallback = theme-E → 视觉与当前默认一致，不会"没有样式" |
| 分包加载延迟 | 首次白屏 | preloadRule 预加载 + componentPlaceholder 占位 |

**核心安全机制**：`var(--shelf-xxx, fallback)` 中的 fallback 值就是当前默认主题 E 的实际值。这意味着在最坏情况下（CSS 变量完全未注入），所有 UI 元素会以当前默认主题的外观渲染 — 与改造前完全一致。这和抽奖系统的安全机制一模一样。

---

## 十二、验收标准

### 功能验收

- [ ] 商品兑换 Tab：幸运空间瀑布流、筛选、分页、兑换确认、兑换结果
- [ ] 商品兑换 Tab：臻选空间解锁、网格布局、竞价出价、倒计时
- [ ] 交易市场 Tab：搜索、筛选、分页、购买确认、购买结果
- [ ] Tab 切换、空间切换功能正常
- [ ] WebSocket 实时通知正常（商品更新、竞价通知）
- [ ] 主题切换功能正常（5套方案 × CSS变量动态注入）
- [ ] 6种增强效果正常（grain/holo/rotatingBorder/breathingGlow/ripple/fullbleed）
- [ ] 4层配置降级策略正常（缓存→API→过期缓存→默认）
- [ ] 卡片涟漪按压效果正常
- [ ] 视图模式切换（网格/列表）正常

### 架构验收（对标抽奖系统 + 决策D9-D12）

- [ ] exchange.ts 行数 < 300 行
- [ ] 主包 exchange 相关代码 < 1,000 行
- [ ] exchange-shelf 是 Component，JSON 无 styleIsolation（默认 isolated，与 lottery-activity 一致）
- [ ] exchange-market 是 Component，JSON 无 styleIsolation
- [ ] 每个组件有完整独立 SCSS（不依赖页面 CSS 穿透）
- [ ] 主题系统使用 CSS 变量注入（exchange-themes.ts，与 lottery themes.ts 一致）
- [ ] 根元素 `style="{{shelfThemeStyle}}"` 注入变量（与 lottery `style="{{themeStyle}}"` 一致）
- [ ] 所有 var() 带 fallback 值（= theme-E 当前值）
- [ ] 增强效果通过 CSS 类名开关（不转变量，与 lottery 子组件模式一致）
- [ ] 父子通信使用 properties + triggerEvent
- [ ] WebSocket 使用 refreshToken property 驱动
- [ ] enrichProductDisplayFields 为纯函数，无 this 依赖
- [ ] 所有组件 SCSS import 全局 variables/mixins（路径正确）
- [ ] **（D9）** bid-panel 是独立子组件，有自己的 data/methods/lifetimes/detached 清理
- [ ] **（D10）** exchange-shelf 使用 `behaviors: [shopBehavior]`（非 spread handler）
- [ ] **（D10）** exchange-market 使用 `behaviors: [marketBehavior]`（非 spread handler）
- [ ] **（D11）** exchange-shelf.scss < 500 行（货架框架，不含空间/竞价/弹窗样式）
- [ ] **（D12）** exchange-shelf data 字段 < 35 个
- [ ] **（D12）** lucky-space 自行管理搜索/筛选/分页/瀑布流状态
- [ ] **（D12）** premium-space 自行管理分页状态
- [ ] shared 组件（filter/confirm/result）有完整 Properties 接口
- [ ] app.json 包含 packageExchange 分包 + preloadRule + componentPlaceholder
- [ ] exchange-themes.ts 包含 5 套主题的完整变量定义（非注释占位）

### 性能验收

- [ ] 主包编译后体积减少 > 150KB
- [ ] 商品筛选 setData 不触发交易市场 Tab 的 WXML diff
- [ ] 交易市场购买 setData 不触发商品兑换 Tab 的 WXML diff
- [ ] **（D12）** lucky-space 筛选 setData 不触发 premium-space 或 bid-panel 的 WXML diff

---

---

## 十三、代码一致性全面验证报告

> **验证时间**: 2026-02-20  
> **验证方式**: 逐文件读取源码 + 行数精确统计 + 架构特征比对  
> **验证结论**: 文档与实际代码高度一致，2处微小行数偏差已修正

### 13.1 行数精确验证

| 文件 | 文档声明 | 实际行数 | 一致性 | 说明 |
|------|---------|---------|:------:|------|
| exchange.ts | 1019 | 1019 | ✅ | 完全匹配 |
| exchange-shop-handlers.ts | 976 | 976 | ✅ | 完全匹配 |
| exchange-market-handlers.ts | 603 | 603 | ✅ | 完全匹配 |
| exchange-bid-handlers.ts | 480 | 480 | ✅ | 完全匹配 |
| exchange.wxml | 199 | 199 | ✅ | 完全匹配 |
| exchange-shop.wxml | 883 | 883 | ✅ | 完全匹配 |
| exchange-market.wxml | 375 | 375 | ✅ | 完全匹配 |
| _exchange-card-themes.scss | 1140 | 1140 | ✅ | 完全匹配 |
| _exchange-market.scss | 1290 | 1290 | ✅ | 完全匹配 |
| _exchange-shop.scss | 1214 | 1214 | ✅ | 完全匹配 |
| _exchange-premium.scss | 1441 | 1441 | ✅ | 完全匹配 |
| _exchange-nav.scss | 427 | 427 | ✅ | 完全匹配 |
| exchange.scss | 245 | 245 | ✅ | 完全匹配 |
| lottery-activity.ts | 828 | 828 | ✅ | 完全匹配 |
| lottery-activity.scss | 430 | **428** | ⚠️ | 差2行，已修正 |
| themes.ts | 321 | **294** | ⚠️ | 差27行，已修正 |
| **主包兑换代码合计** | **10,292** | **10,292** | ✅ | 完全匹配 |

### 13.2 架构特征逐项验证

| 文档声明 | 验证方式 | 实际代码 | 一致性 |
|---------|---------|---------|:------:|
| exchange.ts 使用 `Page()` | 读取 exchange.ts:33 | `Page({` | ✅ |
| lottery-activity.ts 使用 `Component()` | 读取 lottery-activity.ts:74 | `Component({` | ✅ |
| lottery-activity.json 无 styleIsolation | 读取 JSON 完整内容 | 仅 `"component": true` + usingComponents | ✅ |
| lottery-activity 有2个 properties | 读取 lottery-activity.ts:76-87 | `campaignCode` + `size` | ✅ |
| exchange.wxml 使用 `<include>` | 读取 exchange.wxml:35,38 | `<include src="./exchange-market.wxml"/>` | ✅ |
| lottery-activity CSS变量注入 `style="{{themeStyle}}"` | 读取 lottery-activity.wxml:67 | `style="{{themeStyle}}..."` | ✅ |
| lottery-activity 使用 `getThemeStyle()` | 读取 lottery-activity.ts:20,247 | `const { getThemeStyle } = require('./themes/themes')` | ✅ |
| exchange 使用 CSS类名切换 `.theme-X` | grep _exchange-card-themes.scss | 59处 `.theme-[A-E]` 匹配 | ✅ |
| SCSS partial 根选择器与 WXML 匹配 | 交叉比对 | `_exchange-shop.scss` → `.dual-space-market` = exchange-shop.wxml:6 | ✅ |
| | | `_exchange-market.scss` → `.exchange-content` = exchange-market.wxml:5 | ✅ |
| exchange.ts data 字段膨胀 | 逐行计数 exchange.ts:34-211 | 101个字段（Tab/空间/筛选/分页/弹窗/竞价/主题） | ✅ |
| handlers 通过展开运算符合并 | 读取 exchange.ts:218-223 | `...marketHandlers, ...shopHandlers, ...bidHandlers` | ✅ |
| exchange.json 使用3个组件 | 读取 exchange.json | pagination + empty-state + loading-spinner | ✅ |
| 3个 handler 文件独立导入 utils | 读取各 handler 开头 | 每个 handler 独立 `require('../../utils/index')` | ✅ |

### 13.3 发现的跨处理器方法调用

**当前架构中存在跨 handler 模块的方法调用**，因为所有 handler 合并到同一个 Page 实例，`this` 上所有方法互通：

| 调用方 | 被调用方法 | 方法定义所在 handler | 影响评估 |
|--------|----------|-------------------|---------|
| exchange-market-handlers.ts:329 | `this.initPremiumSpaceData()` | exchange-shop-handlers.ts | ⚠️ 跨模块 |
| exchange-market-handlers.ts:331 | `this.initLuckySpaceData()` | exchange-shop-handlers.ts | ⚠️ 跨模块 |
| exchange-shop-handlers.ts:248 | `this.loadBidProducts()` | exchange-bid-handlers.ts | ⚠️ 跨模块 |
| exchange.ts:514 | `this.loadProducts()` | exchange-market-handlers.ts | Page壳调handler |
| exchange.ts:519,523 | `this.loadBidProducts()` | exchange-bid-handlers.ts | Page壳调handler |
| exchange.ts:431 | `this.initLuckySpaceData()` | exchange-shop-handlers.ts | Page壳调handler |
| exchange-market-handlers.ts:169 | `this.enrichProductDisplayFields()` | exchange.ts | handler调Page壳 |
| exchange-shop-handlers.ts:147,903 | `this.enrichProductDisplayFields()` | exchange.ts | handler调Page壳 |
| exchange-market-handlers.ts:196 | `this.clearTokenAndRedirectLogin()` | exchange.ts | ⚠️ handler调Page壳 |

### 13.4 发现的 Page 壳共享方法（二次排查补充）

> **补充时间**: 2026-02-20（二次深度排查）

以下方法定义在 `exchange.ts` Page 壳中（非 handler 文件），但被两个 include WXML **同时绑定调用**。组件化后必须妥善处理：

| Page 壳方法 | 定义位置 | 绑定的 WXML | 组件化后处理方式 |
|------------|---------|------------|----------------|
| **`onProductTap`** | exchange.ts:654-681 | exchange-shop.wxml:197,332 + exchange-market.wxml:134 | ⚠️ **需拆分** — 当前用 `currentTab` 分支判断，exchange-shelf 只需 shop 分支，exchange-market 只需 market 分支 |
| **`onCardTouchStart`** | exchange.ts:953-1009 | exchange-shop.wxml:198,333 + exchange-market.wxml:135 | ⚠️ **需迁入各组件** — 当前用 `dataKeyMap` 根据 `tabSource` 选择产品列表，各组件内简化为单一列表 |
| **`onToggleViewMode`** | exchange.ts:931-941 | exchange-shop.wxml:72,78 + exchange-market.wxml:32,38 + **exchange.wxml:184,190** | ⚠️ **需双路处理** — 设置面板内的按钮留在 Page 壳；组件内联按钮需 triggerEvent 通知 Page 壳 |
| **`onCancelShopExchange`** | exchange.ts:683-687 | exchange-shop.wxml:714,719,834 | 迁入 exchange-shelf 或 shared/exchange-confirm |
| **`onConfirmShopExchange`** | exchange.ts:701-757 | exchange-shop.wxml:837 | 迁入 exchange-shelf shop-behavior |
| **`onCloseShopResult`** | exchange.ts:758+ | exchange-shop.wxml:847,852,880 | 迁入 exchange-shelf 或 shared/exchange-result |
| **`clearTokenAndRedirectLogin`** | exchange.ts:491 | 无直接WXML绑定，被 market-handlers:196 调用 | market-behavior 中 401 错误改为 `triggerEvent('autherror')` → Page 壳处理跳转 |

**关键处理原则**：
- `onProductTap` 当前用 `this.data.currentTab` 做分支 — 组件化后每个组件只处理自己的分支，**逻辑简化而非复杂化**
- `onCardTouchStart` 当前用 `dataKeyMap` 选择产品列表 — 组件化后每个组件只有自己的产品列表，**直接操作即可**
- `onToggleViewMode` 的组件内联按钮 → 组件内调 `triggerEvent('viewmodechange', {mode})` → Page 壳更新 `viewMode` data + localStorage
- `clearTokenAndRedirectLogin` → 组件遇到 401 错误统一 `triggerEvent('autherror')` → Page 壳执行 `app.clearAuthData()` + 跳转

### 13.5 跨模块调用的组件化处理方式（汇总）

1. **`onRefreshProducts` 跨 Tab 刷新**：当前定义在 market-handlers 中，但被 exchange-shop.wxml（第66行）和 exchange-market.wxml（第26行）**同时调用**。组件化后，每个组件拥有自己的 refresh 方法 — 这个跨切面问题会被组件边界**自然解决**。
2. **`enrichProductDisplayFields` 纯函数**：文档已规划提取为 `product-display.ts` 纯函数（第四节 4.4），消除 `this` 依赖 — ✅ 已正确处理。
3. **`loadBidProducts` 被 shop-handlers 调用**：决策D9将 bid 提取为独立子组件 bid-panel，shop-behavior 不再直接调用 `loadBidProducts`，而是 exchange-shelf 通过 `selectComponent('#bid-panel').refresh()` 驱动 — ✅ 已正确处理。
4. **Page壳调用 handler 方法（WebSocket 事件）**：文档已规划使用 `refreshToken` property + observer 模式替代（第四节 D4） — ✅ 已正确处理。
5. **`onProductTap` 跨 Tab 分支**：当前一个方法用 `currentTab` 做两种逻辑 — 组件化后各组件只含自己的分支，**复杂度降低**。
6. **`onCardTouchStart` 涟漪效果**：当前一个方法用 `dataKeyMap` 选择三个列表 — 各组件只操作自己的产品列表，**逻辑简化**。
7. **`onToggleViewMode` 内联按钮**：组件内按钮 → `triggerEvent('viewmodechange')` → Page 壳更新共享状态。
8. **`clearTokenAndRedirectLogin` 认证错误**：组件遇 401 → `triggerEvent('autherror')` → Page 壳处理。

---

## 十四、安全性深度评估 — 不会影响用户可见的 UI 和交互

> **核心结论**: 本方案是**纯粹的代码结构重构**，不改变任何业务逻辑、数据流、API 调用、用户交互流程。所有用户可见的内容和交互**完全不受影响**。

### 14.1 五层安全机制分析

| 安全层 | 机制 | 原理 | 最坏情况 |
|--------|------|------|---------|
| **L1: CSS变量 fallback** | 每个 `var(--xxx, fallback)` 的 fallback = theme-E 当前值 | CSS 规范保证：变量未定义时使用 fallback | UI 与当前默认外观**完全一致** |
| **L2: SCSS 1:1 搬运** | partial 根选择器 = WXML 根元素类名 | DOM 结构不变，选择器 100% 命中 | 样式匹配关系**不变** |
| **L3: 数据绑定完整** | properties 接口覆盖所有外传数据 | 组件内部数据由组件自行加载 | 数据来源**不变** |
| **L4: API 调用不变** | 所有 API 调用的 endpoint、参数、处理逻辑原封搬入组件 | 后端接口**零改动** | 数据内容**不变** |
| **L5: 事件处理不变** | WXML 中的 `bindtap`、`bindinput` 等事件绑定原样迁移 | 用户点击/输入的处理函数逻辑不变 | 交互行为**不变** |

### 14.2 用户可见内容逐项排查

| 用户可见内容 | 当前实现 | 重构后 | 是否变化 |
|-------------|---------|--------|:-------:|
| Tab 导航（商品兑换/交易市场） | exchange.wxml Tab 区域 | 留在 Page 壳 exchange.wxml | ❌ 不变 |
| 空间切换（幸运/臻选） | exchange-shop.wxml 胶囊切换器 | 搬入 exchange-shelf.wxml | ❌ 不变 |
| 商品卡片外观 | `.theme-E .unified-card` CSS 类 | `var(--shelf-card-bg, #ffffff)` | ❌ 不变（fallback = 当前值） |
| 商品图片/名称/价格 | 后端 API 数据 → WXML 绑定 | 同样的 API → 同样的绑定 | ❌ 不变 |
| 瀑布流布局 | Waterfall.calculateLayout() | 同一个纯函数 | ❌ 不变 |
| 筛选面板 | 后端 shop_filters 配置下发 | 同一个配置来源 | ❌ 不变 |
| 兑换确认弹窗 | `showShopConfirm` + `onConfirmShopExchange` | 同样的弹窗逻辑 | ❌ 不变 |
| 竞价出价弹窗 | `showBidModal` + `onConfirmBid` | 同样的弹窗逻辑 | ❌ 不变 |
| 主题切换效果 | CSS 类名切换 → 5套 `.theme-X` 样式 | CSS 变量注入 → 同样的视觉值 | ❌ 不变 |
| 增强效果（噪点/全息/旋转等） | CSS 类名开关 | **原样搬入组件 SCSS** | ❌ 不变 |
| 积分余额显示 | `totalPoints` Page data | `pointsBalance` property → 同值 | ❌ 不变 |
| WebSocket 实时通知 | Page 直接订阅 → 调 handler 方法 | Page 订阅 → refreshToken property | ❌ 用户无感 |
| 下拉刷新 | `onRefreshProducts` 方法 | 每个组件内部 refresh 方法 | ❌ 不变 |

### 14.3 潜在风险点与缓解措施

| 风险点 | 详细说明 | 严重度 | 缓解措施 | 残余风险 |
|--------|---------|:------:|---------|:-------:|
| **SCSS @import 路径错误** | 分包后 `../../styles/variables` 需改为 `../../../../styles/variables` | 中 | 参照 lottery 子组件实际路径模式（已验证 grid.scss 使用 `../../../../`） | 极低 |
| **⚠️ Tab 切换状态丢失（二次排查修正）** | `wx:if` 控制 Component 时会**销毁**组件实例，内部 data 全部丢失。**与当前行为不一致** — 当前 Page data 持久存在，筛选/分页/搜索状态跨 Tab 保留 | **高** | 见下方 14.3.1 三种解决方案（新增决策 D13） | 取决于方案选择 |
| **CSS 变量继承链断裂** | `style="{{shelfThemeStyle}}"` 未注入 | 低 | 所有 `var()` 带 fallback = theme-E 值 → 自动回退默认外观 | 零 |
| **Properties 遗漏** | 组件内 WXML 绑定的某个字段未通过 property 或内部 data 提供 | 中 | 组件内部自行加载数据（ExchangeConfigCache），仅积分/主题等共享数据通过 property | 低 |
| **定时器泄漏** | 竞价倒计时 `setInterval` 在组件销毁时未清理 | 中 | 文档已规划 `detached()` 清理；组件化后定时器随组件生命周期管理实际上是**更优行为** | 极低 |
| **`onRefreshProducts` 拆分** | 当前是一个跨 Tab 的统一刷新方法（market-handlers 定义，两个 WXML 都调） | 中 | 组件化后各组件拥有独立 refresh — 跨切面问题自然解决 | 极低 |
| **Page 壳共享方法迁移（二次排查新增）** | `onProductTap`/`onCardTouchStart`/`onToggleViewMode` 等6个方法定义在 Page 壳，被两个 include WXML 同时绑定 | 中 | 详见第 13.4 节 — 各组件拆分为自己的分支版本，逻辑简化 | 低 |
| **`clearTokenAndRedirectLogin`（二次排查新增）** | market-handlers:196 调用 Page 壳的认证清理方法 | 中 | market-behavior 中 401 错误改为 `triggerEvent('autherror')` → Page 壳处理跳转 | 极低 |

#### 14.3.1 Tab 切换状态丢失 — 三种解决方案（新增决策 D13）

> **二次排查修正**: 原文档声称 `wx:if` 行为"与当前 `<include>` 的 `wx:if` 一致" — **这一说法有误**。
>
> **当前行为分析**：
> - `<include>` 是**编译期内联指令**，WXML 内容直接嵌入 Page 的 DOM 树
> - `wx:if="{{currentTab === 'exchange'}}"` 控制外层 `<view>` 的 DOM 创建/销毁
> - 但 **Page data 中的101个字段始终存在**，不受 `wx:if` 影响
> - 用户在幸运空间设置了筛选条件 → 切到交易市场 → 切回来，筛选条件**仍然保留**
>
> **改造后行为**：
> - `wx:if` 控制 Component 的**创建/销毁**
> - 组件销毁时 `detached()` 触发，**组件内部 data 全部丢失**
> - 切回来时 `attached()` 重新初始化 → 所有筛选/分页/搜索/滚动位置**重置为默认值**
> - 这是用户可感知的行为变化

| 方案 | 实现方式 | 状态保留 | 内存占用 | 复杂度 | 推荐场景 |
|------|---------|:-------:|:-------:|:------:|---------|
| **D13-a: `hidden` 替代 `wx:if`** | `<exchange-shelf hidden="{{currentTab !== 'exchange'}}" />`<br>`<exchange-market hidden="{{currentTab !== 'market'}}" />` | ✅ 完全保留 | 较高（两组件始终在内存） | **最低** | **推荐** |
| **D13-b: 状态持久化** | 组件 `detached()` 时 `triggerEvent('statesave', currentState)`<br>Page 壳存入 data，组件重建时通过 `savedState` property 恢复 | ✅ 可恢复 | 低 | 高（需定义状态快照结构） | 内存敏感场景 |
| **D13-c: 接受状态重置** | 保持 `wx:if`/`wx:elif`，组件每次 `attached()` 从 API/缓存重新加载 | ❌ 重置 | 最低 | 最低 | 筛选使用频率低 |

**推荐 D13-a**（`hidden` 替代 `wx:if`）。理由：
1. 项目未上线，两个组件同时在内存不构成性能瓶颈
2. **与当前 Page 行为完全一致** — 用户体验零差异，真正做到"不影响用户可见的交互"
3. `hidden` 组件仍然接收 property 更新（`pointsBalance`、`refreshToken`），数据实时同步不受影响
4. 竞价定时器需额外处理：组件不可见时暂停 → 监听自定义 `active` property 或组件 `show`/`hide` 事件
5. 对标说明：抽奖系统 lottery-activity 是单组件（不存在 Tab 切换问题），此处是兑换系统独有的决策

**采用 D13-a 后，exchange.wxml 调整为**：
```xml
<!-- 原方案: wx:if / wx:elif（状态丢失） -->
<!-- <exchange-shelf wx:if="{{currentTab === 'exchange'}}" ... /> -->
<!-- <exchange-market wx:elif="{{currentTab === 'market'}}" ... /> -->

<!-- D13-a 方案: hidden（状态保留，与当前 Page 行为一致） -->
<exchange-shelf
  hidden="{{currentTab !== 'exchange'}}"
  active="{{currentTab === 'exchange'}}"
  pointsBalance="{{totalPoints}}" ... />
<exchange-market
  hidden="{{currentTab !== 'market'}}"
  active="{{currentTab === 'market'}}"
  pointsBalance="{{totalPoints}}" ... />
```

### 14.4 安全性结论（二次排查修正版）

```
┌──────────────────────────────────────────────────────────────────┐
│  安全性判定：✅ 可安全执行（采用 D13-a hidden 方案后）              │
│                                                                    │
│  · 用户可见的 UI 内容：不变（同样的 DOM 结构 + 同样的 CSS 值）     │
│  · 用户交互行为：不变（同样的事件处理函数 + 同样的业务逻辑）        │
│  · Tab 切换体验：不变（hidden 保留组件状态，与当前 Page 行为一致）  │
│  · API 调用：不变（同样的 endpoint + 同样的参数 + 同样的处理）      │
│  · 数据来源：不变（同一个后端 + 同一个配置缓存）                    │
│  · 最坏情况保底：fallback 值 = 当前默认外观 → 不会"没有样式"       │
│                                                                    │
│  关键修正：                                                         │
│  · 使用 hidden 替代 wx:if，消除 Tab 切换状态丢失风险                │
│  · Page 壳共享方法已规划迁移路径（第13.4节）                        │
│  · 认证错误改为 triggerEvent 通知 Page 壳处理                       │
│                                                                    │
│  本质：纯代码结构重组，不触碰业务逻辑和视觉输出                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 十五、替代方案分析与比较

> 除了本文档的"完全对标抽奖系统"方案外，还有以下替代方案可达到"降低长期维护成本、减少技术债务"的需求。

### 方案 A（本文档方案）：Component() + 分包 + CSS 变量 + isolated

- **思路**：完全对标 lottery-activity 架构，一次性到位
- **工作量**：~5-7天
- **主包减少**：~9,355行（10,292 → ~937）
- **长期维护成本**：⭐⭐⭐⭐⭐（最低）
- **技术债务清理**：⭐⭐⭐⭐⭐（最彻底）

### 方案 B：Component() 就地组件化（不分包）

- **思路**：将 exchange-shelf、exchange-market 转为 Component()，但**保留在主包 `pages/exchange/` 目录**，不创建 packageExchange 分包
- **工作量**：~3-4天
- **主包减少**：0（不分包，代码仍在主包）
- **架构收益**：
  - ✅ 样式隔离（isolated）
  - ✅ CSS 变量主题
  - ✅ Properties 接口约束
  - ✅ 组件独立 SCSS
  - ❌ 主包体积不减
  - ❌ 无 preloadRule 预加载优势
  - ❌ 无 componentPlaceholder 占位
- **长期维护成本**：⭐⭐⭐⭐（较低）
- **技术债务清理**：⭐⭐⭐⭐（大部分清理）
- **适用场景**：主包体积不是瓶颈，或分包配置有顾虑

### 方案 C：保持 Page() + Behaviors 抽取

- **思路**：保持 Page() 架构不变，但使用微信小程序 `Behavior` 机制将 handler 模块重构为可复用的 Behavior
- **工作量**：~2天
- **主包减少**：0
- **架构收益**：
  - ✅ 代码复用（Behavior 可跨页面共享）
  - ✅ 生命周期钩子规范化
  - ❌ 无样式隔离
  - ❌ 无 CSS 变量主题
  - ❌ 仍然共享 Page data 作用域（101个字段）
  - ❌ WXML 仍用 `<include>`（无接口约束）
  - ❌ 无分包体积优化
- **长期维护成本**：⭐⭐⭐（中等）
- **技术债务清理**：⭐⭐（仅组织层面）
- **适用场景**：最小改动需求，不想动 Page 架构

### 方案 D：MobX Store 集中管理 + Page 瘦身

- **思路**：保持 Page() 架构，但将 101 个 data 字段中的业务状态全部迁移到 MobX Store（新建 exchangeStore），Page 只保留 UI 展示状态
- **工作量**：~3-4天
- **主包减少**：0
- **架构收益**：
  - ✅ 状态管理规范化（单一数据源）
  - ✅ 跨页面/组件状态共享（其他页面读取兑换状态）
  - ✅ 状态持久化（Store 不随页面销毁）
  - ❌ 无样式隔离
  - ❌ 无 CSS 变量主题
  - ❌ Page data 仍然是 Store 的镜像（`createStoreBindings`）
  - ❌ WXML 仍用 `<include>`
  - ❌ 无分包体积优化
- **长期维护成本**：⭐⭐⭐（中等）
- **技术债务清理**：⭐⭐⭐（状态管理层面清理）
- **适用场景**：需要跨页面共享兑换状态

### 方案 E：渐进式三阶段迁移

- **思路**：分三个阶段逐步完成完整迁移，每个阶段可独立验证
  - 阶段1（2天）：CSS 变量主题系统（themes.ts + var() 替换 .theme-X）
  - 阶段2（3天）：Component() 转换 + 分包
  - 阶段3（1天）：子组件抽取（lucky-space / premium-space）
- **工作量**：~6天（含阶段间验证时间）
- **主包减少**：阶段1无变化 → 阶段2减少 ~9,355行
- **架构收益**：与方案 A 最终一致
- **长期维护成本**：⭐⭐⭐⭐⭐（最终与方案A一致）
- **技术债务清理**：⭐⭐⭐⭐⭐（最终与方案A一致）
- **额外代价**：总工作量比方案A多~1天（阶段间切换 + 重复验证）
- **适用场景**：风险偏好保守，希望分步验证

### 方案对比总览

| 维度 | A（本文档） | B（不分包） | C（Behaviors） | D（MobX Store） | E（渐进式） |
|------|:----------:|:----------:|:--------------:|:--------------:|:----------:|
| 样式隔离 | ✅ | ✅ | ❌ | ❌ | ✅ |
| CSS变量主题 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 分包体积优化 | ✅ | ❌ | ❌ | ❌ | ✅ |
| Properties 接口 | ✅ | ✅ | ❌ | ❌ | ✅ |
| 组件独立 SCSS | ✅ | ✅ | ❌ | ❌ | ✅ |
| 状态管理改进 | 中等 | 中等 | 低 | ✅ 最优 | 中等 |
| data 字段膨胀 | ✅ 消除 | ✅ 消除 | ❌ 仍在 | ❌ 仍在 | ✅ 消除 |
| 与抽奖系统一致 | ✅ | 部分 | ❌ | ❌ | ✅ |
| 工作量 | 5-7天 | 3-4天 | 2天 | 3-4天 | 6天 |
| 长期维护成本 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 技术债务清理 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 风险等级 | 中低 | 低 | 极低 | 中 | 最低 |

### 推荐

**项目未上线 + 愿意一次性投入 + 追求最低长期维护成本** → **方案 A（本文档方案）是最优选择**。

理由：
1. 与已验证的抽奖系统架构完全对标，降低认知成本
2. CSS 变量 fallback 机制保证安全（最坏情况 = 当前外观）
3. 一次性到位避免中间状态的额外维护负担
4. 分包带来主包体积优化，后续扩展空间最大
5. 项目未上线，无需考虑兼容、灰度、回滚策略

如果风险偏好极度保守，方案 E（渐进式）可作为次优选择 — 最终效果相同，但可以分步验证。

---

## ~~十七、方案 A 优化建议~~ → 已全量合并到主方案（决策D9-D12）

> **状态**: ✅ 全部8项优化已合并到第二~十二节主方案中，本节仅保留合并记录。
> **合并时间**: 2026-02-20

| 优化项 | 合并到 | 对应决策 |
|--------|--------|---------|
| 优化1：竞价提取为 bid-panel 子组件 | 第四节 4.3 + 第六节目录 + 第九节步骤7/11 | D9 |
| 优化2：SCSS 按子组件边界分配 | 第四节 4.2 + 第七节迁移表 + 第十节体积 | D11 |
| 优化3：Behaviors 替代 spread | 第四节 4.1/4.5 + 第六节目录 + 第九节步骤10/16 | D10 |
| 优化4：补充 app.json 配置 | 第五节 5.2 + 第九节步骤1 | — |
| 优化5：shared 组件接口定义 | 第四节 4.4 + 第六节目录 | — |
| 优化6：子组件 data 下沉 | 第四节 4.1 data + 第九节步骤12 | D12 |
| 优化7：themes.ts 补全5套主题 | 第九节步骤2 说明 | — |
| 优化8：asset 映射配置驱动 | 第九节步骤3 说明 | — |

<details>
<summary>原始优化分析内容（已合并，点击展开查看历史记录）</summary>

#### 优化1：竞价功能提取为 bid-panel 子组件

**现状问题**：当前方案将 `bidHandlers` 通过 `...bidHandlers` spread 混入 exchange-shelf。但竞价是一个功能独立的模块，拥有自己的：
- 9个独立 data 字段（showBidModal ~ bidModalCountdown）
- 3个列表数据字段（hotRankingList, biddingProducts, newProducts）
- 480行独立 handler 逻辑
- ~200行独立 WXML（exchange-shop.wxml 第409-883行中的竞价区域和弹窗）
- **832行独立 SCSS**（_exchange-premium.scss 第610-1441行，全部是竞价弹窗样式）

**优化方案**：提取为 `exchange-shelf/sub/bid-panel/` 子组件

```
exchange-shelf/sub/
  ├── lucky-space/
  ├── premium-space/
  └── bid-panel/          ← 新增
      ├── bid-panel.ts    # 竞价逻辑（~200行，从 bid-handlers 精简）
      ├── bid-panel.wxml  # 竞价卡片区 + 竞价弹窗（~200行）
      ├── bid-panel.scss  # 竞价样式（~832行，从 _exchange-premium.scss 610+ 搬入）
      └── bid-panel.json
```

**Properties 接口**：

```typescript
properties: {
  pointsBalance: { type: Number, value: 0 },
  theme: { type: String, value: 'E' },
  refreshToken: { type: Number, value: 0 }
}
// bind:bidcomplete → 通知父组件刷新积分
```

**收益**：
- exchange-shelf data 字段减少 12 个（77 → 65）
- exchange-shelf 不再 spread bidHandlers
- 竞价逻辑、模板、样式完全内聚
- 与 lottery-activity 的子组件粒度更一致（lottery 每个玩法是独立子组件）

---

#### 优化2：SCSS 按子组件边界重新分配（exchange-shelf.scss 从 ~1600行 降至 ~490行）

**现状问题**：当前方案将 `_exchange-shop.scss` 全部 1214行 + 卡片主题 ~400行堆入 exchange-shelf.scss，导致 ~1600行。而对标的 lottery-activity.scss 仅 428行。

**实际 SCSS 结构分析**（逐段审查）：

```
_exchange-shop.scss (1214行) 内部结构：
  第1-189行:   货架框架（双空间容器、空间切换器、Header）  → exchange-shelf.scss
  第190-647行: 幸运空间样式（瀑布流、网格、卡片、加载态）  → lucky-space.scss
  第648-1214行: 兑换确认/结果弹窗样式                      → exchange-confirm.scss (shared)

_exchange-premium.scss (1441行) 内部结构：
  第1-609行:   臻选空间样式（解锁UI、网格、特性展示）      → premium-space.scss
  第610-1441行: 竞价弹窗样式                               → bid-panel.scss (新增子组件)
```

**优化后 SCSS 分配**：

| 组件 | 来源 | 行数 | 说明 |
|------|------|------|------|
| exchange-shelf.scss | _exchange-shop.scss 第1-189行 + CSS变量默认值 + var()卡片规则 + 增强效果 | **~490行** | 接近 lottery-activity.scss 的 428行 |
| lucky-space.scss | _exchange-shop.scss 第190-647行 + var() 卡片规则 | **~500行** | 幸运空间完全自包含 |
| premium-space.scss | _exchange-premium.scss 第1-609行 + var() 卡片规则 | **~650行** | 臻选空间完全自包含 |
| bid-panel.scss | _exchange-premium.scss 第610-1441行 | **~832行** | 竞价弹窗完全自包含 |
| exchange-confirm.scss | _exchange-shop.scss 第648-1214行 | **~566行** | shared 确认/结果弹窗 |

**收益**：
- exchange-shelf.scss 从 ~1600行 降至 ~490行（与 lottery-activity.scss 428行量级对齐）
- 每个子组件的 SCSS 完全自包含，修改样式只动一个文件
- 卡片主题 `var()` 规则分发到使用卡片的子组件中（不集中堆积）

---

#### 优化3：Behaviors 替代 spread handlers

**现状问题**：当前方案用 `...shopHandlers` spread 对象展开，这在 Page() 中合理，但在 Component() 中有更规范的方式 — 微信小程序原生 `behaviors` 机制。

**优化前**：

```typescript
const shopHandlers = require('./handlers/shop-handlers')
Component({
  methods: {
    ...shopHandlers,  // 对象展开 — Page 时代的做法
  }
})
```

**优化后**：

```typescript
// handlers/shop-behavior.ts
module.exports = Behavior({
  methods: {
    initLuckySpaceData() { /* ... */ },
    initPremiumSpaceData() { /* ... */ },
    // ...
  }
})

// exchange-shelf.ts
const shopBehavior = require('./handlers/shop-behavior')
Component({
  behaviors: [shopBehavior],  // Component 原生方式
  methods: {
    // 组件自身方法
  }
})
```

**收益**：
- 符合微信小程序 Component 规范（Behavior 是官方推荐的代码复用机制）
- 生命周期钩子（attached/detached）自动按顺序合并
- 多个 Behavior 之间的同名方法有明确的合并规则（后定义优先）
- 对标 lottery-activity 子组件的最佳实践
- 未来可跨组件共享 Behavior（如果 market 和 shelf 有共享逻辑）

---

### 中影响（完整性补充，3项）

#### 优化4：补充 app.json 分包配置

文档缺少 packageExchange 的具体 app.json 配置。实施时需要添加：

```json
// app.json 需要新增的配置
{
  "subpackages": [
    // ... 现有分包 ...
    {
      "root": "packageExchange",
      "name": "exchange",
      "pages": ["_placeholder/_placeholder"]
    }
  ],
  "preloadRule": {
    "pages/exchange/exchange": {
      "network": "all",
      "packages": ["trade", "lottery", "exchange"]
    }
  },
  "componentPlaceholder": {
    "exchange-shelf": "view",
    "exchange-market": "view"
  }
}
```

对标参照：`packageLottery` 使用 `_placeholder/_placeholder` 作为占位页面（已验证 app.json:13），exchange 分包应采用同样模式。

---

#### 优化5：补充 shared 组件 Properties 接口定义

文档第六节列出了 shared 目录（exchange-filter / exchange-confirm / exchange-result），但没有定义它们的 Properties 接口。建议补充：

```typescript
// shared/exchange-filter Properties
properties: {
  filterType: String,       // 'lucky' | 'premium' | 'market'
  basicFilters: Array,      // 基础筛选项
  categoryOptions: Array,   // 分类选项
  costRangeOptions: Array,  // 价格区间
  stockStatusOptions: Array,// 库存状态
  sortByOptions: Array,     // 排序方式
  currentFilter: String,    // 当前选中筛选
  searchKeyword: String     // 当前搜索词
}
// bind:filterchange → { keyword, filter, category, costRange, stockStatus, sortBy }

// shared/exchange-confirm Properties
properties: {
  visible: Boolean,
  product: Object,          // 选中商品
  quantity: Number,
  pointsBalance: Number,
  submitting: Boolean
}
// bind:confirm → { product, quantity }
// bind:close → {}

// shared/exchange-result Properties
properties: {
  visible: Boolean,
  success: Boolean,
  orderData: Object,
  message: String
}
// bind:close → {}
// bind:vieworder → { orderNo }
```

---

#### 优化6：子组件 data 下沉 — 进一步瘦身 exchange-shelf

**现状问题**：当前方案的 exchange-shelf data 有 ~77 个字段，其中大量是 lucky-space 和 premium-space 的专属状态。

**优化方案**：让子组件自行管理各自的搜索/筛选/分页状态：

```
exchange-shelf data 字段分配（优化后）：

exchange-shelf（~29字段）:
  shelfThemeStyle, spaceList, currentSpace, loading
  premiumUnlocked 相关（9字段）— 控制空间解锁逻辑
  showShopConfirm 相关（6字段）— 确认弹窗状态
  luckyBasicFilters 等筛选配置（5字段）— 初始化后下传给子组件
  luckySpaceStats, premiumSpaceStats（2字段）

lucky-space（~20字段）:                    ← 自行管理
  luckySearchKeyword, luckyCurrentFilter, showLuckyAdvancedFilter
  luckyCategoryFilter, luckyCostRangeIndex, luckyStockStatus, luckySortBy
  luckyFilteredProducts, luckyCurrentPage ~ luckyPageInputValue
  waterfallProducts, waterfallColumns ~ renderOffset

premium-space（~16字段）:                  ← 自行管理
  premiumFilteredProducts
  premiumCurrentPage ~ premiumPageInputValue
  premiumAllProducts

bid-panel（~12字段）:                      ← 自行管理（优化1）
  hotRankingList, biddingProducts, newProducts
  showBidModal ~ bidModalCountdown
```

**收益**：
- exchange-shelf data 从 77 → ~29 字段（接近 lottery-activity 的 ~30 字段）
- 每个子组件只关心自己的状态，`setData` 不触发兄弟组件的 WXML diff
- 筛选操作不再触发整个 exchange-shelf 的更新

---

### 低影响（细节打磨，2项）

#### 优化7：exchange-themes.ts 补全全部5套主题

文档第三节 3.1 只定义了 E 和 A 的完整变量值，B/C/D 用注释 `/* ... 全部 key 对齐 */` 代替。实施前需从 `_exchange-card-themes.scss` 的 `.theme-B` / `.theme-C` / `.theme-D` 提取完整值。

---

#### 优化8：_assetDisplayMap 从后端配置获取

当前 `enrichProductDisplayFields` 中的资产代码→中文标签映射是前端硬编码（exchange.ts:862-868）。建议：
- 将映射添加到后端 exchange_page 配置中
- `ExchangeConfigCache.getConfig()` 返回 `asset_labels` 字段
- `product-display.ts` 从配置读取，而非硬编码

---

### 优化后的目录结构（对比原方案）

```
packageExchange/
├── exchange-shelf/
│   ├── exchange-shelf.ts               # ~350行（减少了，因为 bid 和筛选状态下沉）
│   ├── exchange-shelf.wxml             # ~500行（bid区域和空间内容移入子组件）
│   ├── exchange-shelf.scss             # ~490行 ← 原 ~1600行（接近 lottery-activity 428行）
│   ├── exchange-shelf.json
│   ├── handlers/
│   │   └── shop-behavior.ts            # Behavior 而非 plain object
│   └── sub/
│       ├── lucky-space/
│       │   ├── lucky-space.ts          # 自行管理筛选/分页状态
│       │   ├── lucky-space.wxml
│       │   ├── lucky-space.scss        # ~500行（从 _exchange-shop.scss 190-647行搬入）
│       │   └── lucky-space.json
│       ├── premium-space/
│       │   ├── premium-space.ts        # 自行管理分页状态
│       │   ├── premium-space.wxml
│       │   ├── premium-space.scss      # ~650行（从 _exchange-premium.scss 1-609行搬入）
│       │   └── premium-space.json
│       └── bid-panel/                  # ← 新增子组件
│           ├── bid-panel.ts            # ~200行
│           ├── bid-panel.wxml          # ~200行
│           ├── bid-panel.scss          # ~832行（从 _exchange-premium.scss 610-1441行搬入）
│           └── bid-panel.json
│
├── exchange-market/                    # 不变
│   ├── ...
│   └── handlers/
│       └── market-behavior.ts          # Behavior 而非 plain object
│
├── shared/
│   ├── exchange-filter/                # 补充 Properties 接口（优化5）
│   ├── exchange-confirm/               # 补充 Properties 接口 + 吸收确认弹窗 SCSS
│   └── exchange-result/
│
├── themes/
│   └── exchange-themes.ts              # 补全5套主题（优化7）
│
└── utils/
    └── product-display.ts              # _assetDisplayMap 改为配置驱动（优化8）
```

### 优化效果量化

| 指标 | 原方案 A | 优化后 | 改善 |
|------|---------|--------|------|
| exchange-shelf.scss 行数 | ~1600 | ~490 | -69%，对齐 lottery-activity |
| exchange-shelf data 字段 | ~77 | ~29 | -62%，对齐 lottery-activity |
| spread handler 混入 | 2个（shop + bid） | 0个（改 Behavior） | 100% 消除 |
| 子组件数量 | 2个 | **3个**（+bid-panel） | 竞价解耦 |
| 共享组件接口定义 | 未定义 | 完整定义 | 实施可执行性提升 |
| app.json 配置 | 未提供 | 完整提供 | 实施可执行性提升 |
| 与 lottery-activity 对标度 | ~80% | **~95%** | 架构一致性提升 |

</details>

---

## 十六、修正记录

> 本次全面验证中发现并修正的文档偏差

| 位置 | 原值 | 修正值 | 说明 |
|------|------|--------|------|
| 第一节 1.1 对比表 lottery-activity.scss | 430行 | **428行** | 实际文件比文档少2行 |
| 第二节 2.2 对标表 themes.ts | 321行 | **294行** | 实际文件比文档少27行（可能版本更新精简了注释） |
| 文档末尾总结行 | lottery-activity.scss(430行) | **lottery-activity.scss(428行)** | 同上 |
| 文档末尾总结行 | themes.ts(321行) | **themes.ts(294行)** | 同上 |
| 新增 | - | **第十三节 跨 handler 方法调用分析** | 文档原未显式提及 onRefreshProducts 跨 Tab 刷新的拆分处理 |

---

## 十八、二次深度排查报告

> **排查时间**: 2026-02-20  
> **排查范围**: 全项目 exchange 相关 13个文件 + lottery 标杆 4个文件，逐行验证  
> **排查目的**: 验证文档与实际代码一致性 + 评估方案安全性 + 寻找替代方案  
> **排查方法**: PowerShell 精确行数统计 + ripgrep 全项目方法调用链搜索 + 源码逐段比对

### 18.1 文件行数全量验证

```
PowerShell Get-Content 精确统计结果:

兑换系统（13个文件）:
  exchange.ts:                 1019 ✅ 完全匹配
  exchange-shop-handlers.ts:    976 ✅ 完全匹配
  exchange-market-handlers.ts:  603 ✅ 完全匹配
  exchange-bid-handlers.ts:     480 ✅ 完全匹配
  exchange.wxml:                199 ✅ 完全匹配
  exchange-shop.wxml:           883 ✅ 完全匹配
  exchange-market.wxml:         375 ✅ 完全匹配
  _exchange-card-themes.scss:  1140 ✅ 完全匹配
  _exchange-market.scss:       1290 ✅ 完全匹配
  _exchange-shop.scss:         1214 ✅ 完全匹配
  _exchange-premium.scss:      1441 ✅ 完全匹配
  _exchange-nav.scss:           427 ✅ 完全匹配
  exchange.scss:                245 ✅ 完全匹配
  ─────────────────────────
  合计: 10,292 ✅

抽奖标杆系统（4个文件）:
  lottery-activity.ts:          828 ✅ 完全匹配
  lottery-activity.scss:        428 ✅ 完全匹配（文档修正后的值）
  themes.ts:                    294 ✅ 完全匹配（文档修正后的值）
  lottery-activity.json:         21 ✅ 含 component:true，无 styleIsolation
```

### 18.2 架构特征逐项验证

| 文档声明 | 验证方式 | 实际代码 | 一致性 |
|---------|---------|---------|:------:|
| exchange.ts 使用 `Page()` | 读取 exchange.ts:33 | `Page({` | ✅ |
| handlers 通过展开运算符合并 | 读取 exchange.ts:218-223 | `...marketHandlers, ...shopHandlers, ...bidHandlers` | ✅ |
| exchange.wxml 使用 `<include>` | 读取 exchange.wxml:35,38 | `<include src="./exchange-market.wxml"/>` / `<include src="./exchange-shop.wxml"/>` | ✅ |
| exchange.json 引用3个组件 | 读取 exchange.json | pagination + empty-state + loading-spinner | ✅ |
| exchange.ts data 101个字段 | 逐行计数 exchange.ts:34-211 | 101个字段（逐组验证） | ✅ |
| lottery-activity.ts 使用 `Component()` | 读取 lottery-activity.ts:74 | `Component({` | ✅ |
| lottery-activity 有2个 properties | 读取 | `campaignCode` + `size` | ✅ |
| lottery-activity.json 无 styleIsolation | 读取完整 JSON | 仅 `"component": true` + usingComponents | ✅ |
| lottery 使用 CSS 变量注入 `style="{{themeStyle}}"` | 读取 wxml:15,28,50,67 | 多处含 `style="{{themeStyle}}"` | ✅ |
| lottery 有14个玩法子组件 + 3个共享组件 | 遍历 sub/ 和 shared/ | 14 + 3 = 17 个组件 | ✅ |
| packageLottery 使用 `_placeholder` 占位页面 | 读取 app.json:10-14 | `"pages": ["_placeholder/_placeholder"]` | ✅ |

### 18.3 SCSS 根选择器匹配验证

| SCSS 文件 | 根选择器 | WXML 匹配 | DOM 结构关系 | 迁移安全 |
|-----------|---------|----------|------------|:-------:|
| `_exchange-shop.scss` | `.dual-space-market`（第10行） | exchange-shop.wxml:6 `<view class="dual-space-market">` | 不依赖 `.exchange-container` 祖先 | ✅ |
| `_exchange-market.scss` | `.exchange-content`（第7行） | exchange-market.wxml:5 `<view class="exchange-content">` | 不依赖 `.exchange-container` 祖先 | ✅ |
| `_exchange-premium.scss` | `.space-selector-enhanced`（第10行） | exchange-shop.wxml 内部 | 嵌套在 `.dual-space-market` 内，不依赖其作为 CSS 祖先选择器 | ✅ |
| `_exchange-card-themes.scss` | `.unified-card`（第27行） | exchange-shop.wxml:193+ / exchange-market.wxml:131+ | 卡片元素不依赖页面壳类名 | ✅ |
| `_exchange-nav.scss` | `.nav-module`（第1行） | exchange.wxml:7 `<view class="nav-module horizontal">` | 留在 Page 壳，不迁移 | ✅ 不动 |

### 18.4 二次排查发现的问题（原文档未覆盖）

| 编号 | 发现 | 严重度 | 已修正位置 |
|:----:|------|:------:|-----------|
| **F1** | `wx:if` 行为与 `<include>` 不一致 — Tab 切换会导致组件状态丢失（筛选/分页/搜索/滚动位置），当前 Page 行为是保留的 | **高** | 第14.3.1节 — 新增决策D13，推荐 `hidden` 替代 `wx:if` |
| **F2** | `onProductTap`（exchange.ts:654）定义在 Page 壳，被两个 WXML 同时绑定，用 `currentTab` 分支 — 文档第13.3节未列出 | 中 | 第13.4节 — 组件化后各组件只含自己的分支 |
| **F3** | `onCardTouchStart`（exchange.ts:953）涟漪效果方法在 Page 壳，用 `dataKeyMap` 操作三个产品列表 — 需迁入各组件 | 中 | 第13.4节 — 各组件只操作自己的产品列表 |
| **F4** | `onToggleViewMode`（exchange.ts:931）有两个入口：Page 壳设置面板 + 组件内联按钮 — 需双路处理 | 中 | 第13.4节 — 组件内联按钮 triggerEvent 通知 Page 壳 |
| **F5** | `clearTokenAndRedirectLogin`（exchange.ts:491）被 market-handlers:196 调用 — 跨模块认证错误处理 | 中 | 第13.4节 — 组件遇401统一 triggerEvent('autherror') |
| **F6** | `onCancelShopExchange` / `onConfirmShopExchange` / `onCloseShopResult` 定义在 Page 壳而非 handler | 低 | 第13.4节 — 迁入 exchange-shelf 或 shared 组件 |

### 18.5 决策更新记录

| 编号 | 决策项 | 结论 | 来源 |
|------|--------|------|------|
| **D13** | Tab 切换组件可见性控制 | **使用 `hidden` 替代 `wx:if`** | 二次排查 F1 发现 |

D13 加入后需调整的文档位置：
- 第二节 2.1 架构图：`wx:if` → `hidden`
- 第五节 5.1 exchange.wxml：更新组件标签属性
- 第八节 8.1 事件流：补充 `active` property
- 第九节步骤17：薄壳 WXML 使用 `hidden` + `active` property

### 18.6 最终安全性结论

```
┌───────────────────────────────────────────────────────────────────────────────┐
│  二次排查安全性判定：✅ 可安全执行（采用 D13-a hidden 方案 + 第13.4节修正后）  │
│                                                                               │
│  ✅ 文件行数：13个兑换文件 + 4个抽奖标杆全部精确匹配                           │
│  ✅ 架构特征：Page/Component/include/spread/CSS变量/isolated 全部验证通过       │
│  ✅ SCSS根选择器：5个 partial 全部与 WXML 匹配，不依赖页面壳祖先选择器         │
│  ✅ 跨模块调用：原8处 + 新发现6处 Page壳共享方法，全部有明确迁移路径            │
│  ✅ CSS变量安全网：var(--xxx, fallback) 的 fallback = theme-E 值 → 保底渲染     │
│  ✅ Tab切换体验：使用 hidden 替代 wx:if → 状态保留 → 用户体验零差异             │
│                                                                               │
│  本方案（方案A + D13修正）仍是最优选择：                                       │
│  · 与抽奖系统架构一致性 ~95%（仅 Tab 切换为兑换独有决策）                      │
│  · 长期维护成本最低 ⭐⭐⭐⭐⭐                                                │
│  · 技术债务清理最彻底 ⭐⭐⭐⭐⭐                                              │
│  · 主包体积减少 ~9,355行 → ~937行                                             │
│  · 用户可见的 UI 内容和交互行为完全不受影响                                    │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 十六、修正记录

> 本次全面验证中发现并修正的文档偏差

| 位置 | 原值 | 修正值 | 说明 |
|------|------|--------|------|
| 第一节 1.1 对比表 lottery-activity.scss | 430行 | **428行** | 实际文件比文档少2行 |
| 第二节 2.2 对标表 themes.ts | 321行 | **294行** | 实际文件比文档少27行（可能版本更新精简了注释） |
| 文档末尾总结行 | lottery-activity.scss(430行) | **lottery-activity.scss(428行)** | 同上 |
| 文档末尾总结行 | themes.ts(321行) | **themes.ts(294行)** | 同上 |
| 新增 | - | **第十三节 跨 handler 方法调用分析** | 文档原未显式提及 onRefreshProducts 跨 Tab 刷新的拆分处理 |
| **二次排查修正** | 14.3 `wx:if` 风险评估"极低" | **14.3.1 新增决策D13** | 原声称与 `<include>` 行为一致 — 实际不一致，Tab 切换会丢失组件状态 |
| **二次排查新增** | - | **第13.4节 Page壳共享方法** | 6个方法定义在 Page 壳被两个 WXML 调用，需显式迁移 |
| **二次排查新增** | - | **第13.5节 处理方式汇总** | 跨模块调用从8处扩展到14处，全部有迁移路径 |
| **二次排查新增** | - | **第十八节 完整排查报告** | 全面的代码-文档一致性验证 + 安全性深度评估 |

---

*文档结束 — 完全对标抽奖系统架构，一次性到位。基于实际代码逐文件核查 + 抽奖系统架构逆向分析 + **二次深度排查（2026-02-20）**：exchange.ts(1019行) / exchange-shop-handlers.ts(976行) / exchange-market-handlers.ts(603行) / exchange-bid-handlers.ts(480行) / exchange-shop.wxml(883行) / exchange-market.wxml(375行) / _exchange-card-themes.scss(1140行) / _exchange-market.scss(1290行) / _exchange-shop.scss(1214行) / _exchange-premium.scss(1441行) / _exchange-nav.scss(427行) / lottery-activity.ts(828行) / lottery-activity.json(默认isolated) / lottery-activity.scss(428行) / themes.ts(294行，CSS变量主题) / 17个子组件独立SCSS — 主包兑换代码合计 10,292行。二次排查新增：D13决策（hidden替代wx:if）+ 6个Page壳共享方法迁移路径 + wx:if行为修正*
