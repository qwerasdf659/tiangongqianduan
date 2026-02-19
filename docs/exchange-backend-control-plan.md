# 兑换页面后端配置化控制方案

> **项目**: 天工小程序前端  
> **涉及页面**: `pages/exchange/exchange` — 商品兑换Tab + 交易市场Tab  
> **前置依赖**: lottery-subpackage-plan.md 分包分离完成后执行  
> **创建时间**: 2026-02-19  
> **状态**: 待选择方案

---

## 一、现状对比分析（抽奖 vs 兑换）

### 1.1 抽奖系统的后端控制架构（已实现，可参考）

抽奖系统通过三层后端配置完全控制前端展示：

```
┌─────────────────────────────────────────────────────────────┐
│  第一层：PlacementConfig（位置配置，ConfigCache 缓存 24h）    │
│  GET /api/v4/system/config/placement                        │
│  → 控制哪个活动出现在哪个页面、什么位置、什么尺寸            │
│                                                             │
│  第二层：CampaignConfig（活动配置）                          │
│  GET /api/v4/lottery/campaigns/:code/config                 │
│  → 控制活动规则：消耗积分、抽奖次数、折扣、展示模式、主题     │
│                                                             │
│  第三层：PrizeList（奖品列表）                               │
│  GET /api/v4/lottery/campaigns/:code/prizes                 │
│  → 控制奖品池：名称、图片、稀有度、排序                      │
└─────────────────────────────────────────────────────────────┘
```

**关键设计模式**：
- `ConfigCache` 4层降级：本地缓存 → API → 过期缓存 → 内置默认
- `display` 配置对象：后端返回 `mode`/`effect_theme`/`grid_cols` 等控制前端UI
- `themes.ts` CSS变量系统：30+ CSS变量被后端主题名映射
- `placement` 位置系统：`page`/`position`/`size`/`priority` 控制组件渲染

### 1.2 兑换页面当前状态（硬编码项清单）

通过对 `pages/exchange/` 全部代码排查，以下配置目前**硬编码在前端**：

| 序号 | 配置项 | 硬编码位置 | 当前值 | 可配置价值 |
|------|--------|-----------|--------|-----------|
| 1 | 空间列表（幸运/臻选） | `exchange.ts:167-189` | 2个空间对象 | 高 — 可动态增减空间 |
| 2 | 空间名称/图标/颜色 | `exchange.ts:167-189` | `🎁 幸运空间`/`💎 臻选空间` | 高 — 运营可修改 |
| 3 | 空间布局类型 | `exchange.ts:167-189` | `waterfall`/`simple` | 高 — 可切换布局 |
| 4 | 基础筛选项 | `exchange.ts:86-93` | 全部/可兑换/低积分 | 中 — 运营可增减 |
| 5 | 分类选项 | `exchange.ts:94-100` | 优惠券/实物商品/虚拟物品 | 高 — 应从后端获取 |
| 6 | 积分范围选项 | `exchange.ts:101-108` | 0-500/500-1000/... | 中 — 可根据商品分布调整 |
| 7 | 库存状态选项 | `exchange.ts:109-114` | 有货/库存紧张 | 低 — 相对固定 |
| 8 | 排序方式 | `exchange.ts:115-121` | 默认/最新/价格升降 | 低 — 相对固定 |
| 9 | 卡片样式/主题 | `_exchange-shop.scss` | 固定一套样式 | 高 — 可后端控制主题 |
| 10 | 交易市场筛选项 | `exchange-market-handlers.ts` | 全部/物品/资产 | 中 |
| 11 | 分页大小 | `config/constants.ts` | GRID_SIZE=20, WATERFALL=30 | 低 |
| 12 | 页面Tab配置 | `exchange.wxml` | 商品兑换/交易市场 | 中 — 可增减Tab |
| 13 | 库存阈值 | 前端硬编码 | `< 10` 为低库存 | 中 |
| 14 | 搜索防抖延迟 | 前端硬编码 | 500ms | 低 |

### 1.3 差距总结

| 维度 | 抽奖系统 | 兑换页面 | 差距 |
|------|---------|---------|------|
| 页面结构 | 后端 placement 控制 | 前端硬编码 Tab/空间 | 大 |
| UI 主题 | 后端 6 套主题 + CSS变量 | 固定一套样式 | 大 |
| 展示模式 | 后端 13 种 display.mode | 固定 waterfall/simple | 大 |
| 筛选项 | N/A（抽奖无筛选） | 前端硬编码 | 中 |
| 数据加载 | API 并行 + 缓存 | API 并行但无缓存 | 小 |
| 降级策略 | 4层降级 | 简单 try/catch | 中 |

---

## 二、方案设计

### 方案一：「轻量配置化」— 最小改动，快速见效

**核心思路**：借鉴 `ConfigCache` 的缓存架构，新增一个 `ExchangePageConfig` 配置接口，只配置化高价值的几项，其余保持前端控制。

**改动范围**：中等（约 3-5 天）

#### 2.1.1 新增后端接口

```
GET /api/v4/system/config/exchange-page
```

返回结构：

```typescript
interface ExchangePageConfig {
  version: string                    // 配置版本号
  updated_at: string                 // 更新时间

  // Tab 配置
  tabs: TabConfig[]

  // 空间配置（商品兑换 Tab 内）
  spaces: SpaceConfig[]

  // 筛选配置
  filters: {
    categories: FilterOption[]       // 分类选项（从后端商品分类表动态生成）
    price_ranges: FilterOption[]     // 积分范围选项
    basic_filters: FilterOption[]    // 基础快捷筛选
  }

  // UI 配置
  ui: {
    card_theme: string               // 卡片主题名（映射到前端主题系统）
    low_stock_threshold: number      // 低库存阈值（默认 10）
    page_size: number                // 分页大小
  }
}

interface TabConfig {
  key: string                        // 'exchange' | 'market'
  label: string                      // Tab 显示名
  icon?: string                      // Tab 图标
  enabled: boolean                   // 是否启用
  sort_order: number                 // 排序
}

interface SpaceConfig {
  id: string                         // 'lucky' | 'premium' | 自定义
  name: string                       // '🎁 幸运空间'
  subtitle: string                   // 描述文字
  layout: 'waterfall' | 'grid' | 'list'  // 布局类型
  color: string                      // 主题色 hex
  icon: string                       // 图标
  enabled: boolean                   // 是否启用
  sort_order: number                 // 排序
  unlock_required: boolean           // 是否需要解锁
}

interface FilterOption {
  key: string
  label: string
  value?: any
}
```

#### 2.1.2 前端改动清单

| 文件 | 改动内容 |
|------|---------|
| `utils/config-cache.ts` | 扩展 ConfigCacheManager，新增 `getExchangeConfig()` 方法 |
| `pages/exchange/exchange.ts` | onLoad 时并行加载 ExchangePageConfig，用后端数据替代硬编码 |
| `pages/exchange/exchange-shop-handlers.ts` | 筛选项改为从 config 读取 |
| `pages/exchange/exchange-market-handlers.ts` | Tab 配置改为动态 |
| `pages/exchange/exchange.wxml` | Tab 列表改为 `wx:for` 动态渲染 |
| `pages/exchange/exchange-shop.wxml` | 空间列表改为 `wx:for` 动态渲染 |

#### 2.1.3 ConfigCache 扩展设计

```typescript
// utils/config-cache.ts 新增
const EXCHANGE_CACHE_KEY = 'exchange_page_config'
const EXCHANGE_VERSION_KEY = 'exchange_page_version'
const EXCHANGE_LAST_UPDATE_KEY = 'exchange_page_last_update'

// 默认兜底配置（与当前硬编码值一致，保证零风险降级）
const DEFAULT_EXCHANGE_CONFIG: ExchangePageConfig = {
  version: '1.0.0',
  updated_at: '',
  tabs: [
    { key: 'exchange', label: '商品兑换', enabled: true, sort_order: 1 },
    { key: 'market', label: '交易市场', enabled: true, sort_order: 2 }
  ],
  spaces: [
    {
      id: 'lucky', name: '🎁 幸运空间', subtitle: '瀑布流卡片',
      layout: 'waterfall', color: '#52c41a', icon: '🎁',
      enabled: true, sort_order: 1, unlock_required: false
    },
    {
      id: 'premium', name: '💎 臻选空间', subtitle: '混合精品展示',
      layout: 'simple', color: '#667eea', icon: '💎',
      enabled: true, sort_order: 2, unlock_required: true
    }
  ],
  filters: {
    categories: [
      { key: 'all', label: '全部' },
      { key: '优惠券', label: '优惠券' },
      { key: '实物商品', label: '实物商品' },
      { key: '虚拟物品', label: '虚拟物品' }
    ],
    price_ranges: [
      { key: 'all', label: '全部' },
      { key: '0-500', label: '0-500分' },
      { key: '500-1000', label: '500-1000分' },
      { key: '1000-5000', label: '1000-5000分' },
      { key: '5000+', label: '5000+分' }
    ],
    basic_filters: [
      { key: 'all', label: '全部' },
      { key: 'available', label: '可兑换' },
      { key: 'low-price', label: '低积分' }
    ]
  },
  ui: {
    card_theme: 'default',
    low_stock_threshold: 10,
    page_size: 20
  }
}
```

#### 2.1.4 数据流

```
用户进入兑换页面
  ↓
exchange.ts onLoad() 并行请求：
  ├─ ExchangeConfigCache.getConfig()   // 页面配置（缓存优先）
  ├─ loadProducts()                     // 商品数据
  └─ pointsStore refresh               // 积分数据
  ↓
配置返回后 → 动态设置 tabs / spaces / filters
  ↓
exchange.wxml 根据配置渲染 Tab / 空间 / 筛选项
```

#### 2.1.5 优缺点

| 优点 | 缺点 |
|------|------|
| 改动量小（约 200-300 行代码） | 卡片样式仍由前端控制 |
| 完全复用现有 ConfigCache 架构 | 布局变化有限（只能选预设类型） |
| 4层降级保证安全（默认值=当前硬编码） | 不支持完全自定义的页面结构 |
| 后端不需要新建复杂数据表 | 交易市场的卡片UI无法独立配置 |

---

### 方案二：「深度配置化」— 参照抽奖 Display 系统，卡片级主题控制

**核心思路**：在方案一的基础上，增加卡片级的主题系统（类似 lottery-activity 的 `display` + `themes`），让后端不仅控制页面结构，还能控制卡片的视觉风格。

**改动范围**：较大（约 5-8 天）

#### 2.2.1 在方案一基础上新增的能力

```typescript
// ExchangePageConfig 新增字段
interface ExchangePageConfig {
  // ... 方案一的所有字段 ...

  // 卡片主题系统（新增）
  card_display: CardDisplayConfig

  // 交易市场卡片配置（新增）
  market_card_display: MarketCardDisplayConfig
}

interface CardDisplayConfig {
  theme: string                      // 主题名：对应 exchange-themes.ts 中的主题
  layout_mode: 'waterfall' | 'grid_2x2' | 'list' | 'bento'  // 布局模式
  show_cta_button: boolean           // 是否显示行动按钮
  cta_text: string                   // 按钮文案（'立即兑换' / '马上换' / '抢兑'）
  show_stock_bar: boolean            // 是否显示库存进度条
  stock_display_mode: 'bar' | 'text' | 'badge'  // 库存展示方式
  show_sold_count: boolean           // 是否显示已售数量
  show_tags: boolean                 // 是否显示标签（热销/新品/限量）
  price_display_mode: 'normal' | 'highlight' | 'capsule'  // 价格展示方式
  image_placeholder_style: 'gradient' | 'emoji' | 'icon'  // 图片占位风格
  press_effect: 'scale' | 'float' | 'glow' | 'none'       // 按压效果
}

interface MarketCardDisplayConfig {
  theme: string
  show_seller_info: boolean          // 是否显示卖家信息
  show_type_badge: boolean           // 是否显示类型标识
  price_color_mode: 'fixed' | 'type_based'  // 价格颜色模式
}
```

#### 2.2.2 卡片主题系统（exchange-themes.ts）

参照 `lottery-activity/themes/themes.ts` 的架构，新建兑换页专属主题：

```typescript
// 新文件：pages/exchange/themes/exchange-themes.ts

const EXCHANGE_THEME_MAP: Record<string, Record<string, string>> = {
  'default': {
    '--card-bg': '#ffffff',
    '--card-border': 'rgba(0,0,0,0.06)',
    '--card-shadow': '0 4rpx 16rpx rgba(0,0,0,0.08)',
    '--card-radius': '24rpx',
    '--price-color': '#ff6b35',
    '--price-bg': 'transparent',
    '--cta-bg': 'linear-gradient(135deg, #ff6b35, #f7931e)',
    '--cta-text-color': '#ffffff',
    '--stock-bar-color': '#52c41a',
    '--stock-warn-color': '#faad14',
    '--stock-danger-color': '#ff4d4f',
    '--tag-hot-bg': '#ff4757',
    '--tag-new-bg': '#2ed573',
    '--tag-limited-bg': '#7c4dff',
    '--placeholder-bg': 'linear-gradient(135deg, #f5f5f5, #e8e8e8)',
    // ... 20+ CSS 变量
  },

  'warm_orange': {
    // 方案A：暖橙活力卡片
    '--card-bg': 'linear-gradient(180deg, #fff8f3, #ffffff)',
    '--card-border': 'none',
    '--card-shadow': '0 4rpx 20rpx rgba(255,107,53,0.1)',
    '--price-color': '#ff6b35',
    '--price-bg': 'linear-gradient(135deg, #ff6b35, #f7931e)',
    '--cta-bg': 'linear-gradient(135deg, #ff6b35, #f7931e)',
    '--placeholder-bg': 'linear-gradient(135deg, #fff3e0, #ffe0b2)',
    // ...
  },

  'glass_frost': {
    // 方案B：毛玻璃质感
    '--card-bg': 'rgba(255, 255, 255, 0.72)',
    '--card-blur': 'blur(20rpx)',
    '--card-border': '1rpx solid rgba(255, 255, 255, 0.5)',
    // ...
  },

  'dark_game': {
    // 方案C：暗色游戏风
    '--card-bg': 'linear-gradient(145deg, #1a1a2e, #16213e, #0f3460)',
    '--card-border': '1rpx solid rgba(255, 107, 53, 0.2)',
    '--price-color': '#ff6b35',
    '--price-glow': '0 0 12rpx rgba(255, 107, 53, 0.6)',
    // ...
  },

  'neumorphism': {
    // 方案D：新拟态柔光
  },

  'aurora_gradient': {
    // 方案E：极光渐变
  },

  'cartoon': {
    // 方案F：卡通插画风
  }
}

export function getExchangeThemeStyle(themeName: string): string {
  const theme = EXCHANGE_THEME_MAP[themeName] || EXCHANGE_THEME_MAP['default']
  return Object.entries(theme)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ')
}
```

#### 2.2.3 WXML 卡片模板改造

```xml
<!-- exchange-shop.wxml 改造后 -->
<view class="waterfall-card modern-card"
      style="{{exchangeThemeStyle}}"
      data-id="{{item.id}}"
      bindtap="onProductTap">

  <!-- 图片区 -->
  <view class="card-image-area" style="background: var(--placeholder-bg)">
    <image wx:if="{{item.image}}" src="{{item.image}}" mode="aspectFill" />
    <view wx:else class="card-placeholder">
      <text class="placeholder-icon">{{item.categoryEmoji || '🎁'}}</text>
    </view>
    <!-- 标签 -->
    <view wx:if="{{cardDisplay.show_tags && item.is_hot}}"
          class="card-tag hot" style="background: var(--tag-hot-bg)">热销</view>
  </view>

  <!-- 信息区 -->
  <view class="card-info-area">
    <text class="card-name">{{item.name}}</text>

    <!-- 价格区 -->
    <view class="card-price {{cardDisplay.price_display_mode}}">
      <text class="price-value" style="color: var(--price-color)">
        {{item.cost_amount}}
      </text>
      <text class="price-unit">{{item.costAssetLabel || '积分'}}</text>
    </view>

    <!-- 库存展示 -->
    <view wx:if="{{cardDisplay.show_stock_bar}}" class="stock-area">
      <view wx:if="{{cardDisplay.stock_display_mode === 'bar'}}" class="stock-bar">
        <view class="stock-fill" style="width: {{item.stockPercent}}%; background: var({{item.stockColor}})"></view>
      </view>
      <text wx:elif="{{cardDisplay.stock_display_mode === 'text'}}"
            class="stock-text" style="color: var({{item.stockColor}})">
        {{item.stockLabel}}
      </text>
    </view>

    <!-- CTA 按钮 -->
    <view wx:if="{{cardDisplay.show_cta_button}}"
          class="card-cta" style="background: var(--cta-bg); color: var(--cta-text-color)">
      {{item.stock > 0 ? cardDisplay.cta_text : '已售罄'}}
    </view>
  </view>
</view>
```

#### 2.2.4 数据流

```
用户进入兑换页面
  ↓
exchange.ts onLoad() 并行请求：
  ├─ ExchangeConfigCache.getConfig()   // 页面 + 卡片配置（缓存优先）
  ├─ loadProducts()                     // 商品数据
  └─ pointsStore refresh               // 积分数据
  ↓
配置返回后：
  ├─ 动态设置 tabs / spaces / filters
  ├─ getExchangeThemeStyle(config.card_display.theme) → CSS 变量字符串
  └─ setData({ cardDisplay: config.card_display, exchangeThemeStyle: ... })
  ↓
WXML 根据 cardDisplay 和 CSS 变量渲染卡片
```

#### 2.2.5 与 exchange-card-ui-design-proposals.md 的关系

这些方案（A~G）将成为 `EXCHANGE_THEME_MAP` 中的预设主题：

| 文档方案 | 主题名 | 备注 |
|---------|--------|------|
| A 暖橙活力 | `warm_orange` | 积分商城常规运营 |
| B 毛玻璃质感 | `glass_frost` | 高级质感 |
| C 暗色游戏风 | `dark_game` | 幸运空间专属 |
| D 新拟态柔光 | `neumorphism` | 独特UI |
| E 极光渐变 | `aurora_gradient` | 品类差异化 |
| F 卡通插画 | `cartoon` | 趣味亲和 |
| G Bento网格 | `bento` | 需额外改布局逻辑 |

后端只需在数据库中将 `card_theme` 设为对应主题名，前端自动切换整套卡片样式。

#### 2.2.6 优缺点

| 优点 | 缺点 |
|------|------|
| 卡片样式可后端热切换 | 改动量较大（需编写主题系统） |
| 与抽奖系统架构统一 | 需要设计交易市场的独立卡片主题 |
| 7 套卡片方案可随时切换 | 新增主题需前端发版（但频率很低） |
| 页面结构 + 卡片样式全覆盖 | 初始开发周期长（5-8天） |

---

### 方案三：「全面组件化」— 兑换页面组件化 + 分包 + 后端驱动

**核心思路**：将兑换页面的核心展示逻辑抽象为独立组件（类似 `lottery-activity`），未来可以被多个页面引用，并支持分包独立部署。

**改动范围**：大（约 8-15 天）

#### 2.3.1 组件设计

```
新组件架构：
exchange/
├── components/
│   ├── exchange-shelf/              # 商品货架组件（核心展示组件）
│   │   ├── exchange-shelf.ts
│   │   ├── exchange-shelf.wxml
│   │   ├── exchange-shelf.scss
│   │   ├── exchange-shelf.json
│   │   ├── themes/
│   │   │   └── shelf-themes.ts      # 货架主题系统
│   │   ├── layouts/
│   │   │   ├── waterfall.wxml       # 瀑布流布局
│   │   │   ├── grid.wxml            # 网格布局
│   │   │   ├── list.wxml            # 列表布局
│   │   │   └── bento.wxml           # Bento 布局
│   │   └── cards/
│   │       ├── shop-card.wxml       # 兑换商品卡片
│   │       └── market-card.wxml     # 交易市场卡片
│   │
│   ├── exchange-filter/             # 筛选器组件（配置驱动）
│   │   ├── exchange-filter.ts
│   │   ├── exchange-filter.wxml
│   │   └── exchange-filter.scss
│   │
│   └── exchange-space-nav/          # 空间导航组件（配置驱动）
│       ├── exchange-space-nav.ts
│       ├── exchange-space-nav.wxml
│       └── exchange-space-nav.scss
```

#### 2.3.2 exchange-shelf 组件接口

```typescript
// exchange-shelf 组件的 properties（外部传入）
Component({
  properties: {
    // 核心配置（由后端驱动）
    shelfConfig: {
      type: Object,
      value: null
      // ShelfConfig 类型
    },
    // 商品数据
    products: {
      type: Array,
      value: []
    },
    // 加载状态
    loading: {
      type: Boolean,
      value: false
    }
  },

  lifetimes: {
    attached() {
      if (this.properties.shelfConfig) {
        this._applyConfig(this.properties.shelfConfig)
      }
    }
  },

  methods: {
    _applyConfig(config: ShelfConfig) {
      const themeStyle = getShelfThemeStyle(config.theme)
      this.setData({
        themeStyle,
        layoutMode: config.layout_mode,
        cardDisplay: config.card_display,
        // ...
      })
    }
  }
})
```

```typescript
interface ShelfConfig {
  shelf_code: string                  // 货架标识（如 'LUCKY_SHELF'）
  theme: string                       // 主题名
  layout_mode: string                 // 布局模式
  card_display: CardDisplayConfig     // 卡片展示配置
  filter_config: FilterConfig         // 筛选器配置
  pagination: PaginationConfig        // 分页配置
}
```

#### 2.3.3 后端接口设计

```
# 页面整体配置
GET /api/v4/system/config/exchange-page
→ 返回 tabs + spaces + 全局UI配置

# 货架配置（每个空间对应一个货架）
GET /api/v4/system/config/shelves/:shelf_code
→ 返回 ShelfConfig（主题、布局、卡片样式、筛选器配置）

# 或者合并为一个接口
GET /api/v4/system/config/exchange-page?include=shelves
→ 返回页面配置 + 所有货架配置
```

#### 2.3.4 与分包方案的结合

```
lottery-subpackage-plan.md 完成后的目录：

packageLottery/                      # 抽奖分包（已分离）
  lottery-activity/
  popup-banner/

packageExchange/                     # 兑换分包（新增，方案三）
  exchange-shelf/                    # 货架组件
  exchange-filter/                   # 筛选器组件
  exchange-space-nav/                # 空间导航组件

pages/exchange/                      # 页面保留在主包
  exchange.ts                        # 页面壳（精简后）
  exchange.wxml                      # 页面模板（引用分包组件）
  exchange.json                      # componentPlaceholder 配置
```

#### 2.3.5 优缺点

| 优点 | 缺点 |
|------|------|
| 架构最完整，与抽奖系统一致 | 改动量最大（8-15天） |
| 组件可复用（其他页面可用） | 需要大幅重构现有代码 |
| 支持分包独立部署 | 测试工作量大 |
| 后端可完全控制页面展示 | 开发周期长 |
| 未来扩展性最强 | 需要后端同步开发接口 |

---

## 三、方案对比总览

| 维度 | 方案一：轻量配置化 | 方案二：深度配置化 | 方案三：全面组件化 |
|------|-------------------|-------------------|-------------------|
| **改动范围** | 中等（200-300行） | 较大（500-800行） | 大（1500+行） |
| **开发周期** | 3-5 天 | 5-8 天 | 8-15 天 |
| **后端配置控制范围** | 页面结构 + 筛选项 | 页面结构 + 卡片样式 | 全页面组件级控制 |
| **卡片UI方案热切换** | 不支持 | 支持（前端预置） | 支持（组件化） |
| **分包支持** | 不需要 | 不需要 | 支持 |
| **与现有代码兼容性** | 高（增量修改） | 中（需改WXML/SCSS） | 低（大幅重构） |
| **降级安全性** | 高（默认值=当前） | 高（默认值=当前） | 中（需充分测试） |
| **运营灵活度** | 中 | 高 | 最高 |
| **后端开发量** | 小（1个接口） | 中（1-2个接口） | 较大（2-3个接口） |
| **主包体积影响** | 基本不变 | 略增（主题代码） | 减少（组件分包） |
| **风险等级** | 低 | 中 | 较高 |

---

## 四、推荐实施路径（分阶段递进）

考虑到前置依赖（lottery 分包分离先完成），建议分三个阶段递进执行：

### 阶段一：分包分离（前置）

执行 `lottery-subpackage-plan.md`，完成 lottery-activity + popup-banner 分包迁移。

**产出**：主包减少 600KB，验证分包异步化机制可靠性。

### 阶段二：轻量配置化（方案一）

在分包分离验证通过后，实施方案一：

1. 扩展 ConfigCache，新增 ExchangeConfigCache
2. 新增 `GET /api/v4/system/config/exchange-page` 接口
3. 前端硬编码 → 动态配置（Tab/空间/筛选项）
4. 默认兜底值设为当前硬编码值

**产出**：运营可通过后端数据库调整 Tab/空间/筛选项，无需前端发版。

### 阶段三：卡片主题化（方案二增量部分）

在方案一运行稳定后：

1. 新建 `exchange-themes.ts`，将 7 套卡片方案编码为预设主题
2. WXML/SCSS 改造为 CSS 变量驱动
3. 配置接口增加 `card_display` 字段
4. 后端切换 `card_theme` 即可热切换卡片样式

**产出**：exchange-card-ui-design-proposals.md 中的 7 套方案可通过后端热切换。

### 阶段四（可选）：全面组件化（方案三增量部分）

当业务需要更高灵活度时：

1. 抽取 exchange-shelf 等独立组件
2. 组件分包到 packageExchange
3. 页面壳精简化

**产出**：兑换页面架构与抽奖系统完全对齐，最大灵活度。

---

## 五、与 exchange-market-ui-optimization.md 的关系

交易市场的 8 套卡片方案（A~H）在本方案中的处理方式：

| 阶段 | 交易市场卡片方案处理 |
|------|---------------------|
| 阶段二（方案一） | 先选定一个方案实施，硬编码前端 |
| 阶段三（方案二） | 将多套方案编码为 `MarketCardTheme`，后端可切换 |
| 阶段四（方案三） | 抽取 `market-card` 组件，主题系统完全独立 |

建议在阶段二时先让运营选定一个首选方案，后续再做多方案热切换支持。

---

## 六、后端数据库表设计建议（供后端参考）

### 6.1 page_configs 表（页面配置表）

```sql
CREATE TABLE page_configs (
  id            SERIAL PRIMARY KEY,
  config_key    VARCHAR(100) UNIQUE NOT NULL,    -- 如 'exchange_page'
  config_value  JSONB NOT NULL,                  -- ExchangePageConfig JSON
  version       VARCHAR(20) NOT NULL,            -- 语义化版本号
  status        VARCHAR(20) DEFAULT 'active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 初始数据
INSERT INTO page_configs (config_key, config_value, version) VALUES
('exchange_page', '{
  "tabs": [...],
  "spaces": [...],
  "filters": {...},
  "ui": {...}
}', '1.0.0');
```

### 6.2 与现有 placement_configs 表的关系

抽奖系统已有 `placement_configs` 表管理活动位置，兑换页面配置建议使用同一个 `page_configs` 表（或复用 `system_configs`），保持配置管理入口统一。

---

## 七、技术风险评估

| 风险项 | 影响 | 缓解措施 |
|--------|------|---------|
| 配置接口延迟/失败 | 页面可能渲染异常 | 4层降级策略 + 默认兜底值 |
| 配置数据格式错误 | 页面部分功能异常 | validateConfig 校验 + 默认值降级 |
| 主题CSS变量兼容性 | 低端设备样式异常 | 所有 var() 带 fallback 值 |
| 分阶段迁移期间新旧逻辑并存 | 维护复杂度增加 | 特性开关控制（`useRemoteConfig: boolean`） |
| 后端接口未就绪 | 前端开发阻塞 | 默认兜底配置保证独立开发 |

---

## 八、待决策事项

> 请确认以下选项：

### 8.1 实施方案选择
- [ ] 方案一：轻量配置化（推荐首选，快速见效）
- [ ] 方案二：深度配置化（推荐最终目标）
- [ ] 方案三：全面组件化（长期架构目标）
- [ ] 分阶段递进（推荐：二 → 三 → 四阶段）

### 8.2 卡片UI方案首选（阶段二使用）
- [ ] 商品兑换卡片：方案 A/B/C/D/E/F/G（参考 exchange-card-ui-design-proposals.md）
- [ ] 交易市场卡片：方案 A/B/C/D/E/F/G/H（参考 exchange-market-ui-optimization.md）

### 8.3 后端接口优先级
- [ ] 后端先开发 `GET /api/v4/system/config/exchange-page` 接口
- [ ] 前端先用默认兜底值开发，后端后续补接口

### 8.4 执行时间
- [ ] lottery 分包分离完成后立即开始
- [ ] 其他时间点：______________

---

*文档结束*
