# 兑换页面深度配置化 — 方案二执行文档

> **项目**: 天工小程序  
> **决策依据**: `exchange-backend-control-plan.md` 方案二  
> **前置条件**: `exchange-unified-card-design.md` 已执行完毕（5套主题 + 7项增强效果已在前端实现）  
> **创建时间**: 2026-02-20  
> **状态**: 待执行

---

## 一、目标

将兑换页面当前**硬编码在前端**的 14 项配置，改为**后端 API 下发**，运营无需前端发版即可：

- 增减/重排 Tab（商品兑换/交易市场）
- 增减/重排空间（幸运/臻选/未来新增）
- 修改筛选项（分类/积分范围/排序方式）
- 切换卡片主题（A~E 五套 + 7 项增强效果开关）
- 调整库存阈值、分页大小等运营参数

---

## 二、整体架构

```
┌──────────────────────────────────────────────────────────┐
│                    Web 管理后台                            │
│  运营人员在管理后台修改配置 → 保存到数据库                  │
└────────────────────────┬─────────────────────────────────┘
                         │ 写入
                         ▼
┌──────────────────────────────────────────────────────────┐
│                  后端数据库 + API                          │
│  page_configs 表存储 JSON 配置                             │
│  GET /api/v4/system/config/exchange-page 提供查询           │
└────────────────────────┬─────────────────────────────────┘
                         │ 读取
                         ▼
┌──────────────────────────────────────────────────────────┐
│                微信小程序端                                │
│  ExchangeConfigCache 缓存配置（4层降级）                    │
│  exchange.ts onLoad 加载配置 → 替代硬编码                   │
│  WXML 根据配置动态渲染 Tab/空间/筛选/卡片主题               │
└──────────────────────────────────────────────────────────┘
```

---

## 三、后端数据库项目工作内容

### 3.1 新建数据表

```sql
-- 页面配置表（通用，不仅用于兑换页面，未来其他页面也可用）
CREATE TABLE page_configs (
  id              SERIAL PRIMARY KEY,
  config_key      VARCHAR(100) UNIQUE NOT NULL,  -- 配置标识，如 'exchange_page'
  config_value    JSONB NOT NULL,                -- 完整配置 JSON
  version         VARCHAR(20) NOT NULL DEFAULT '1.0.0',
  status          VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active' | 'disabled'
  description     TEXT,                          -- 配置说明（运营备注用）
  created_by      VARCHAR(100),                  -- 创建人
  updated_by      VARCHAR(100),                  -- 最后修改人
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_page_configs_key ON page_configs(config_key);
CREATE INDEX idx_page_configs_status ON page_configs(status);
```

### 3.2 初始数据（与前端当前硬编码值完全一致）

> **校对基准**:
> - `tabs` → `exchange.wxml` 第10-50行硬编码的两个 `nav-item`
> - `spaces` → `exchange.ts` 第167-189行 `spaceList` 数组
> - `shop_filters` → `exchange.ts` 第87-120行各筛选项数组
> - `market_filters` → `exchange-market.wxml` 第34-99行硬编码的筛选按钮
> - `card_display.theme/effects` → `exchange.ts` 第231-247行 `cardTheme` + `effects`（两个Tab共用一套）
> - `card_display` 其余字段 → `exchange-shop.wxml` / `exchange-market.wxml` 硬编码值：
>   - `shop_cta_text:'立即兑换'` → `exchange-shop.wxml` 第215行
>   - `market_cta_text:'立即购买'` → `exchange-market.wxml` 第148行
>   - `show_stock_bar:true` → `exchange-shop.wxml` 第210行 `stock-bar`
>   - `show_sold_count:true` → `exchange-shop.wxml` 第197行 `sold-count-badge`
> - `ui.low_stock_threshold:10` → `exchange-shop.wxml` 第211/213行硬编码 `item.stock < 10` 比较
> - `ui` 其余字段 → `config/constants.ts` PAGINATION + DELAY 常量

```sql
INSERT INTO page_configs (config_key, config_value, version, description) VALUES
('exchange_page', '{
  "version": "1.0.0",
  "tabs": [
    {
      "key": "market",
      "label": "商品兑换",
      "icon": "download",
      "enabled": true,
      "sort_order": 1
    },
    {
      "key": "exchange",
      "label": "交易市场",
      "icon": "success",
      "enabled": true,
      "sort_order": 2
    }
  ],
  "spaces": [
    {
      "id": "lucky",
      "name": "🎁 幸运空间",
      "subtitle": "瀑布流卡片",
      "description": "发现随机好物",
      "layout": "waterfall",
      "color": "#52c41a",
      "bgGradient": "linear-gradient(135deg, #52c41a 0%, #95de64 100%)",
      "locked": false,
      "enabled": true,
      "sort_order": 1
    },
    {
      "id": "premium",
      "name": "💎 臻选空间",
      "subtitle": "混合精品展示",
      "description": "解锁高级商品",
      "layout": "simple",
      "color": "#667eea",
      "bgGradient": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      "locked": true,
      "enabled": true,
      "sort_order": 2
    }
  ],
  "shop_filters": {
    "categories": [
      { "key": "all", "label": "全部" },
      { "key": "优惠券", "label": "优惠券" },
      { "key": "实物商品", "label": "实物商品" },
      { "key": "虚拟物品", "label": "虚拟物品" }
    ],
    "price_ranges": [
      { "key": "all", "label": "全部" },
      { "key": "0-500", "label": "0-500分" },
      { "key": "500-1000", "label": "500-1000分" },
      { "key": "1000-2000", "label": "1000-2000分" },
      { "key": "2000+", "label": "2000分以上" }
    ],
    "basic_filters": [
      { "key": "all", "label": "全部", "showCount": true },
      { "key": "available", "label": "可兑换", "showCount": false },
      { "key": "low-price", "label": "低积分", "showCount": false }
    ],
    "stock_filters": [
      { "key": "all", "label": "全部" },
      { "key": "in-stock", "label": "库存充足" },
      { "key": "low-stock", "label": "库存紧张" }
    ],
    "sort_options": [
      { "key": "default", "label": "默认" },
      { "key": "points-asc", "label": "积分升序" },
      { "key": "points-desc", "label": "积分降序" },
      { "key": "rating-desc", "label": "评分降序" },
      { "key": "stock-desc", "label": "库存降序" }
    ]
  },
  "market_filters": {
    "type_filters": [
      { "key": "all", "label": "全部", "showCount": true },
      { "key": "item_instance", "label": "物品", "showCount": false },
      { "key": "fungible_asset", "label": "资产", "showCount": false }
    ],
    "category_filters": [
      { "key": "all", "label": "全部" },
      { "key": "item_instance", "label": "物品实例" },
      { "key": "fungible_asset", "label": "可叠加资产" }
    ],
    "sort_options": [
      { "key": "default", "label": "默认" },
      { "key": "newest", "label": "最新上架" },
      { "key": "price_asc", "label": "价格升序" },
      { "key": "price_desc", "label": "价格降序" }
    ]
  },
  "card_display": {
    "theme": "E",
    "effects": {
      "grain": true,
      "holo": true,
      "rotatingBorder": true,
      "breathingGlow": true,
      "ripple": true,
      "fullbleed": true,
      "listView": false
    },
    "shop_cta_text": "立即兑换",
    "market_cta_text": "立即购买",
    "show_stock_bar": true,
    "stock_display_mode": "bar",
    "show_sold_count": true,
    "show_tags": true,
    "price_display_mode": "highlight",
    "image_placeholder_style": "gradient",
    "press_effect": "ripple",
    "show_type_badge": true,
    "price_color_mode": "type_based",
    "default_view_mode": "grid"
  },
  "ui": {
    "low_stock_threshold": 10,
    "grid_page_size": 4,
    "waterfall_page_size": 20,
    "default_api_page_size": 20,
    "search_debounce_ms": 500
  }
}', '1.0.0', '兑换页面配置 — 初始版本，与前端硬编码值一致');
```

### 3.3 新建 API 接口

**接口路径**: `GET /api/v4/system/config/exchange-page`

**鉴权**: 需要用户登录 Token

**请求参数**: 无（或可选 `?version=xxx` 用于增量更新判断）

**响应格式**:

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "version": "1.0.0",
    "updated_at": "2026-02-20T10:00:00Z",
    "tabs": [...],
    "spaces": [...],
    "shop_filters": {...},
    "market_filters": {...},
    "card_display": {...},
    "ui": {...}
  }
}
```

**后端实现逻辑**:

```
1. 从 page_configs 表查询 config_key = 'exchange_page' 且 status = 'active'
2. 返回 config_value JSON
3. 如果查不到，返回 404 或空对象（前端有兜底默认值）
```

**接口性能要求**:
- 响应时间 < 200ms（单表单行查询，无复杂逻辑）
- 建议加服务端缓存（Redis，TTL 5分钟），运营修改后主动清缓存

### 3.4 新建更新接口（供管理后台调用）

**接口路径**: `PUT /api/v4/system/config/exchange-page`

**鉴权**: 需要管理员权限

**请求体**:

```json
{
  "config_value": { ... },
  "version": "1.0.1",
  "description": "修改说明"
}
```

**后端实现逻辑**:

```
1. 校验 config_value JSON 格式合法性
2. 更新 page_configs 表中 config_key = 'exchange_page' 的记录
3. 更新 version、updated_at、updated_by
4. 清除 Redis 缓存
5. 返回更新后的完整配置
```

### 3.5 后端工作清单汇总

| 序号 | 任务 | 预估工时 | 优先级 |
|------|------|---------|--------|
| B1 | 建 `page_configs` 表 + 索引 | 0.5h | P0 |
| B2 | 插入初始配置数据 | 0.5h | P0 |
| B3 | 实现 `GET /api/v4/system/config/exchange-page` 查询接口 | 2h | P0 |
| B4 | 实现 `PUT /api/v4/system/config/exchange-page` 更新接口 | 2h | P1 |
| B5 | Redis 缓存层（可选，建议做） | 1h | P2 |
| B6 | 接口入参校验（JSON Schema 或手动校验） | 1h | P1 |
| | **合计** | **~7h（约1天）** | |

---

## 四、微信小程序端工作内容

### 4.1 前置条件

`exchange-unified-card-design.md` 已执行完毕，以下已存在于前端代码中：
- 5 套主题 CSS（`.theme-A` ~ `.theme-E`）
- 7 项增强效果（噪点/全息/旋转边框/呼吸光圈/墨水扩散/全图叠字/列表视图）
- 前端 `localStorage` 主题切换机制
- 设置面板 UI

### 4.2 需要改动的文件

> **注意**：现有 `utils/config-cache.ts` 已被活动位置配置（`campaign_placement_config`）占用，
> 兑换页面配置缓存需新建独立文件，避免模块耦合。

| 序号 | 文件 | 改动内容 | 备注 |
|------|------|---------|------|
| M1 | `utils/exchange-config-cache.ts` | **新建文件**，`ExchangeConfigCache` 类，参考现有 `config-cache.ts` 的 4 层降级架构 | 现有 `config-cache.ts` 用于活动位置配置，不在此文件追加 |
| M2 | `pages/exchange/exchange.ts` | `onLoad` 加载远程配置，替代 `data` 中的硬编码数组 | 涉及 spaceList / 各筛选项数组 / cardTheme / effects |
| M3 | `pages/exchange/exchange.ts` | 主题初始值从 `wx.getStorageSync('card_theme')` → 后端 `card_display`；用户手动切换仍写 Storage 作为本地覆盖 | 当前方法：`restoreThemePreferences()` |
| M4 | `pages/exchange/exchange.wxml` | Tab 导航改为 `wx:for="{{tabs}}"` 动态渲染 | 当前两个 Tab 硬编码在 WXML 中 |
| ~~M5~~ | ~~`exchange-shop.wxml` 空间导航~~ | ~~已完成~~ | **无需改动** — 空间导航已是 `wx:for="{{spaceList}}"` |
| ~~M6~~ | ~~`exchange-shop.wxml` 筛选项~~ | ~~已完成~~ | **无需改动** — 5 组筛选项已全部使用 `wx:for` 绑定 data 数组 |
| M7 | `pages/exchange/exchange-market.wxml` | 交易市场筛选项从 WXML 硬编码改为 `wx:for` 动态渲染 | 当前"全部/物品/资产"和高级筛选面板的选项均硬编码在 WXML 中 |
| M8 | `pages/exchange/exchange-shop-handlers.ts` | 筛选逻辑从硬编码 → 读取 `this.data.exchangeConfig.shop_filters` | 影响较小，筛选项数组已在 data 中 |
| M9 | `pages/exchange/exchange-market-handlers.ts` | 筛选逻辑 → 读取 `this.data.exchangeConfig.market_filters` | 需适配新的 market_filters 结构 |

### 4.3 核心代码改动说明

#### M1: ExchangeConfigCache（新建文件 `utils/exchange-config-cache.ts`，约 80 行）

> 参考现有 `utils/config-cache.ts`（活动位置配置缓存）的 4 层降级架构，
> 为兑换页面配置创建独立缓存管理器。

```typescript
// utils/exchange-config-cache.ts（新建文件）

class ExchangeConfigCache {
  static CACHE_KEY = 'exchange_page_config'
  static CACHE_EXPIRE = 24 * 60 * 60 * 1000  // 24小时

  /**
   * 获取兑换页面配置（4层降级，与 ConfigCacheManager 架构一致）
   * 1. 本地缓存（未过期）→ 立即返回，后台静默更新
   * 2. API 远程获取 → GET /api/v4/system/config/exchange-page
   * 3. 过期缓存（兜底）
   * 4. 内置默认值（终极兜底，= 当前硬编码值拷贝）
   */
  static async getConfig(): Promise<ExchangePageConfig> { ... }

  static async fetchFromAPI(): Promise<ExchangePageConfig | null> { ... }

  static getLocalCache(): ExchangePageConfig | null { ... }

  static saveToLocal(config: ExchangePageConfig): void { ... }
}
```

#### M2: exchange.ts onLoad 改动（约 30 行）

```typescript
// 改动前（当前硬编码，exchange.ts 第87-247行）:
data: {
  spaceList: [ { id: 'lucky', name: '🎁 幸运空间', ... }, { id: 'premium', ... } ],
  luckyBasicFilters: [ ... ],
  categoryOptions: [ ... ],
  cardTheme: 'E',
  effects: { grain: true, holo: true, ... },
  // ... 全部硬编码在 data 中
}

// 改动后（onLoad 中加载配置，替代硬编码初始值）:
async onLoad() {
  // 加载远程配置（有完整兜底默认值，不阻塞页面渲染）
  const exchangeConfig = await ExchangeConfigCache.getConfig()

  // 商品兑换 Tab 筛选项（来自 shop_filters）
  const shopFilters = exchangeConfig.shop_filters

  // 用后端配置替代硬编码
  this.setData({
    tabs: exchangeConfig.tabs.filter(t => t.enabled).sort((a, b) => a.sort_order - b.sort_order),
    spaceList: exchangeConfig.spaces.filter(s => s.enabled).sort((a, b) => a.sort_order - b.sort_order),
    luckyBasicFilters: shopFilters.basic_filters,
    categoryOptions: shopFilters.categories,
    pointsRangeOptions: shopFilters.price_ranges,
    stockFilterOptions: shopFilters.stock_filters,
    sortByOptions: shopFilters.sort_options,
    // 交易市场 Tab 筛选项（来自 market_filters）
    marketTypeFilters: exchangeConfig.market_filters.type_filters,
    marketCategoryFilters: exchangeConfig.market_filters.category_filters,
    marketSortOptions: exchangeConfig.market_filters.sort_options,
    // 卡片主题（两个 Tab 共用一套）
    cardTheme: exchangeConfig.card_display.theme,
    effects: exchangeConfig.card_display.effects,
    viewMode: exchangeConfig.card_display.default_view_mode || 'grid',
  })

  // 恢复用户本地偏好（如果用户手动切换过主题，优先用本地覆盖值）
  this.restoreThemePreferences()

  // 其他原有初始化不变
  this.initPage()
  this.initPremiumUnlockStatus()
}
```

> **主题优先级**: 后端配置提供默认主题 → 用户本地切换偏好覆盖 → `restoreThemePreferences()` 仍保留，
> 从 `wx.getStorageSync('card_theme')` 读取用户手动覆盖值。

#### M4: exchange.wxml Tab 动态化（约 20 行改动）

> **现状**: 两个 Tab 硬编码在 `exchange.wxml` 第10-50行，分别绑定
> `onGoToTradeMarket` 和 `onGoToExchange` 两个独立方法（内含异步数据初始化 + WebSocket 切换逻辑）。

```html
<!-- 改动前（exchange.wxml 第10-50行，硬编码两个Tab + 独立方法）: -->
<view class="nav-item ..." bindtap="onGoToTradeMarket">
  <icon type="download" size="20" />
  <text class="nav-text">商品兑换</text>
</view>
<view class="nav-item ..." bindtap="onGoToExchange">
  <icon type="success" size="20" />
  <text class="nav-text">交易市场</text>
</view>

<!-- 改动后（动态渲染，统一 onTabChange 方法）: -->
<view class="nav-item nav-item-horizontal {{currentTab === item.key ? 'active' : ''}}"
      wx:for="{{tabs}}" wx:key="key"
      data-tab="{{item.key}}" bindtap="onTabChange"
      hover-class="none">
  <view class="nav-content" hover-class="none">
    <view class="icon-wrapper" hover-class="none">
      <icon class="nav-icon" type="{{item.icon}}" size="20" />
    </view>
    <view class="text-wrapper" hover-class="none">
      <text class="nav-text">{{item.label}}</text>
    </view>
  </view>
  <view class="nav-status current" wx:if="{{currentTab === item.key}}">当前</view>
</view>
```

> **exchange.ts 配套改动**: 新增统一的 `onTabChange(e)` 方法，内部根据 `e.currentTarget.dataset.tab`
> 分发到原有的 `onGoToTradeMarket` / `onGoToExchange` 逻辑（保留异步初始化和 WebSocket 重连）。
> 原有两个方法保留为内部实现，不直接从 WXML 调用。

### 4.4 兜底默认值（核心安全保障）

```typescript
// utils/exchange-config-cache.ts 内置默认值
// 数据来源：exchange.ts data 字段 + config/constants.ts + exchange-market.wxml 硬编码值
// 即使后端接口完全不可用，页面表现与当前版本完全一致
const DEFAULT_EXCHANGE_CONFIG: ExchangePageConfig = {
  version: '1.0.0',
  tabs: [
    { key: 'market', label: '商品兑换', icon: 'download', enabled: true, sort_order: 1 },
    { key: 'exchange', label: '交易市场', icon: 'success', enabled: true, sort_order: 2 }
  ],
  spaces: [
    { id: 'lucky', name: '🎁 幸运空间', subtitle: '瀑布流卡片', description: '发现随机好物',
      layout: 'waterfall', color: '#52c41a',
      bgGradient: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
      locked: false, enabled: true, sort_order: 1 },
    { id: 'premium', name: '💎 臻选空间', subtitle: '混合精品展示', description: '解锁高级商品',
      layout: 'simple', color: '#667eea',
      bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      locked: true, enabled: true, sort_order: 2 }
  ],
  shop_filters: {
    basic_filters: [
      { key: 'all', label: '全部', showCount: true },
      { key: 'available', label: '可兑换', showCount: false },
      { key: 'low-price', label: '低积分', showCount: false }
    ],
    categories: [
      { key: 'all', label: '全部' }, { key: '优惠券', label: '优惠券' },
      { key: '实物商品', label: '实物商品' }, { key: '虚拟物品', label: '虚拟物品' }
    ],
    price_ranges: [
      { key: 'all', label: '全部' }, { key: '0-500', label: '0-500分' },
      { key: '500-1000', label: '500-1000分' }, { key: '1000-2000', label: '1000-2000分' },
      { key: '2000+', label: '2000分以上' }
    ],
    stock_filters: [
      { key: 'all', label: '全部' }, { key: 'in-stock', label: '库存充足' },
      { key: 'low-stock', label: '库存紧张' }
    ],
    sort_options: [
      { key: 'default', label: '默认' }, { key: 'points-asc', label: '积分升序' },
      { key: 'points-desc', label: '积分降序' }, { key: 'rating-desc', label: '评分降序' },
      { key: 'stock-desc', label: '库存降序' }
    ]
  },
  market_filters: {
    type_filters: [
      { key: 'all', label: '全部', showCount: true },
      { key: 'item_instance', label: '物品', showCount: false },
      { key: 'fungible_asset', label: '资产', showCount: false }
    ],
    category_filters: [
      { key: 'all', label: '全部' }, { key: 'item_instance', label: '物品实例' },
      { key: 'fungible_asset', label: '可叠加资产' }
    ],
    sort_options: [
      { key: 'default', label: '默认' }, { key: 'newest', label: '最新上架' },
      { key: 'price_asc', label: '价格升序' }, { key: 'price_desc', label: '价格降序' }
    ]
  },
  card_display: {
    theme: 'E',
    effects: { grain: true, holo: true, rotatingBorder: true,
               breathingGlow: true, ripple: true, fullbleed: true, listView: false },
    shop_cta_text: '立即兑换', market_cta_text: '立即购买',
    show_stock_bar: true, stock_display_mode: 'bar',
    show_sold_count: true, show_tags: true,
    price_display_mode: 'highlight', image_placeholder_style: 'gradient',
    press_effect: 'ripple', show_type_badge: true,
    price_color_mode: 'type_based', default_view_mode: 'grid'
  },
  ui: { low_stock_threshold: 10, grid_page_size: 4,
        waterfall_page_size: 20, default_api_page_size: 20,
        search_debounce_ms: 500 }
}
```

### 4.5 小程序端工作清单汇总

| 序号 | 任务 | 预估工时 | 优先级 | 是否依赖后端 |
|------|------|---------|--------|-------------|
| M1 | 新建 `exchange-config-cache.ts` 缓存类 | 2h | P0 | 否（有兜底值） |
| M2 | exchange.ts onLoad 配置加载 + data 映射 | 2h | P0 | 否 |
| M3 | 主题数据源切换（localStorage → config，保留本地覆盖） | 1h | P0 | 否 |
| M4 | exchange.wxml Tab 动态化 + 新增 onTabChange 分发方法 | 1.5h | P0 | 否 |
| ~~M5~~ | ~~exchange-shop.wxml 空间导航~~ | 0h | — | **已完成**，当前已是 `wx:for="{{spaceList}}"` |
| ~~M6~~ | ~~exchange-shop.wxml 筛选项~~ | 0h | — | **已完成**，5 组筛选项均已 `wx:for` 绑定 data 数组 |
| M7 | exchange-market.wxml 筛选项动态化 | 1.5h | P1 | 否 |
| M8 | exchange-shop-handlers.ts 筛选逻辑适配 | 0.5h | P1 | 否（筛选项数组已在 data 中，改动较小） |
| M9 | exchange-market-handlers.ts 筛选逻辑适配 | 1h | P1 | 否 |
| M10 | 联调测试（后端接口就绪后） | 2h | P0 | **是** |
| | **合计** | **~11.5h（约1.5天）** | | |

**关键：小程序端可以独立开发**，因为有完整的兜底默认值。后端接口就绪后只需联调验证。
M5/M6 已在 `exchange-unified-card-design.md` 执行阶段完成（空间切换和筛选项早已是动态渲染），实际节省 2.5h。

---

## 五、Web 管理后台前端工作内容

### 5.1 需要新建的页面

在管理后台中新增一个「兑换页面配置」管理页面。

### 5.2 页面布局

```
┌─────────────────────────────────────────────────────────┐
│  兑换页面配置管理                           [保存] [重置] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ Tab 配置 ─────────────────────────────────────────┐ │
│  │ [拖拽排序]                                         │ │
│  │  ☑ 商品兑换  标签文字: [______]  图标: [______]     │ │
│  │  ☑ 交易市场  标签文字: [______]  图标: [______]     │ │
│  │  [+ 添加Tab]                                       │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 空间配置 ─────────────────────────────────────────┐ │
│  │ [拖拽排序]                                         │ │
│  │  ☑ 幸运空间  名称: [______]  图标: [__]            │ │
│  │    布局: (●瀑布流 ○网格 ○列表)  主题色: [#52c41a]   │ │
│  │    需要解锁: (○是 ●否)                              │ │
│  │  ☑ 臻选空间  名称: [______]  图标: [__]            │ │
│  │    布局: (○瀑布流 ●网格 ○列表)  主题色: [#667eea]   │ │
│  │    需要解锁: (●是 ○否)                              │ │
│  │  [+ 添加空间]                                      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 商品兑换筛选项配置 (shop_filters) ──────────────┐ │
│  │  基础筛选:  [全部✓] [可兑换] [低积分]           [+]│ │
│  │  商品分类:  [全部] [优惠券] [实物商品] [虚拟物品] [+]│ │
│  │  积分范围:  [全部] [0-500] [500-1000] [1000+]   [+]│ │
│  │  库存状态:  [全部] [库存充足] [库存紧张]         [+]│ │
│  │  排序方式:  [默认] [积分升序] [积分降序] [评分] [+] │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 交易市场筛选项配置 (market_filters) ────────────┐ │
│  │  类型筛选:  [全部✓] [物品] [资产]               [+]│ │
│  │  挂单类型:  [全部] [物品实例] [可叠加资产]       [+]│ │
│  │  排序方式:  [默认] [最新上架] [价格升序] [价格降序][+]│
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 卡片主题配置 (card_display，两个Tab共用) ────────┐ │
│  │  主题: (○A毛玻璃 ○B电商 ○C暗色 ○D极简 ●E推荐)      │ │
│  │  增强效果:                                         │ │
│  │    ☑ 噪点纹理  ☑ 全息光效  ☑ 旋转边框             │ │
│  │    ☑ 呼吸光圈  ☑ 墨水扩散  ☑ 全图叠字             │ │
│  │    ☐ 列表视图（默认关闭）                           │ │
│  │  默认视图: (●网格 ○列表)                            │ │
│  │  商品兑换按钮: [立即兑换]                           │ │
│  │  交易市场按钮: [立即购买]                           │ │
│  │  显示库存: ☑   库存样式: (●进度条 ○文字 ○角标)     │ │
│  │  显示已售: ☑   显示标签: ☑                         │ │
│  │  显示类型标签: ☑   价格颜色: (○固定色 ●按类型变色)  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 运营参数 (ui) ───────────────────────────────────┐ │
│  │  低库存阈值: [10]                                  │ │
│  │  网格分页大小(grid_page_size): [4]   （2×2网格）   │ │
│  │  瀑布流分页(waterfall_page_size): [20]             │ │
│  │  默认API分页(default_api_page_size): [20]          │ │
│  │  搜索防抖:   [500] ms                              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ 操作记录 ─────────────────────────────────────────┐ │
│  │  v1.0.1 - 张三 - 2026-02-21 - 修改卡片主题为C暗色  │ │
│  │  v1.0.0 - 系统 - 2026-02-20 - 初始配置             │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### 5.3 技术实现

#### API 调用

```javascript
// 加载配置
const loadConfig = async () => {
  const res = await request.get('/api/v4/system/config/exchange-page')
  return res.data
}

// 保存配置
const saveConfig = async (configValue, description) => {
  await request.put('/api/v4/system/config/exchange-page', {
    config_value: configValue,
    version: bumpVersion(currentVersion),
    description
  })
}
```

#### 关键交互

| 交互 | 说明 |
|------|------|
| Tab/空间拖拽排序 | 拖拽后自动更新 `sort_order` 字段 |
| 启用/禁用开关 | 切换 `enabled` 字段 |
| 筛选项增删 | 动态增减数组元素，每项包含 `key` + `label` |
| 主题单选 | 单选 A/B/C/D/E，修改 `card_display.theme`（两个 Tab 共用） |
| 效果开关 | 独立开关，修改 `card_display.effects` 对象（两个 Tab 共用） |
| 保存 | 调用 PUT 接口，写入数据库，弹出保存成功提示 |
| 重置 | 恢复到上次保存的值 |
| 版本记录 | 每次保存自动 bump 版本号，记录操作人和时间 |

### 5.4 管理后台工作清单汇总

| 序号 | 任务 | 预估工时 | 优先级 |
|------|------|---------|--------|
| W1 | 新增「兑换页面配置」菜单入口 + 路由 | 0.5h | P0 |
| W2 | 页面框架搭建（Tab/空间/筛选/主题 四个配置区块） | 2h | P0 |
| W3 | Tab 配置区（表格 + 拖拽排序 + 启用开关 + 文字编辑） | 2h | P0 |
| W4 | 空间配置区（表格 + 拖拽排序 + 布局选择 + 颜色选择器） | 3h | P1 |
| W5 | 筛选项配置区（可增删的标签列表） | 2h | P1 |
| W6 | 卡片主题配置区（主题单选 + 效果开关组 + 文案输入） | 3h | P1 |
| W7 | 运营参数配置区（数字输入框） | 0.5h | P2 |
| W8 | 保存/重置/版本记录功能 | 2h | P0 |
| W9 | API 对接（GET 加载 + PUT 保存） | 1h | P0 |
| W10 | JSON 预览/手动编辑（高级模式，直接编辑 JSON） | 1.5h | P2 |
| | **合计** | **~17.5h（约2.5天）** | |

---

## 六、三端联调计划

### 6.1 开发顺序（可并行）

```
         第1天              第2天              第3天
后端   ┃ B1-B3 建表        ┃ B4-B6 更新       ┃ 联调支持        ┃
       ┃ +查询接口         ┃ 接口+校验        ┃                 ┃
       ┃                   ┃                  ┃                 ┃
小程序 ┃ M1-M3 缓存        ┃ M4+M7 WXML动态化 ┃ M8-M9+M10联调  ┃
       ┃ +配置加载+主题适配 ┃ (M5/M6已完成)    ┃                 ┃
       ┃                   ┃                  ┃                 ┃
管理   ┃                   ┃ W1-W3 框架       ┃ W4-W10          ┃
后台   ┃                   ┃ +Tab配置区       ┃ 配置区块+联调   ┃
```

### 6.2 联调检查清单

| 序号 | 检查项 | 验证方法 |
|------|--------|---------|
| 1 | 后端接口返回格式正确 | Postman 调用 GET 接口，对比 JSON 结构 |
| 2 | 小程序能正确加载远程配置 | 开发者工具 Network 面板查看请求 |
| 3 | 配置加载失败时降级到默认值 | 断网后打开页面，功能完全正常 |
| 4 | 管理后台修改后小程序生效 | 后台改主题为 C → 小程序清缓存后刷新 → 卡片变为暗色 |
| 5 | Tab 禁用生效 | 后台禁用"交易市场"Tab → 小程序只显示"商品兑换" |
| 6 | 空间增减生效 | 后台新增第三个空间 → 小程序显示三个空间切换 |
| 7 | 筛选项增减生效 | 后台新增分类"数字藏品" → 小程序筛选栏出现该选项 |
| 8 | 主题切换生效 | 后台切主题 A→B→C→D→E → 小程序卡片风格逐一验证 |
| 9 | 增强效果开关生效 | 后台关闭噪点纹理 → 小程序卡片渐变区域无噪点 |
| 10 | 缓存机制正常 | 修改配置后 24h 内小程序自动更新（或手动下拉刷新） |

---

## 七、接口协议完整定义

### 7.1 ExchangePageConfig 完整 TypeScript 类型

```typescript
interface ExchangePageConfig {
  version: string
  updated_at?: string

  tabs: TabConfig[]
  spaces: SpaceConfig[]

  /** 商品兑换 Tab 筛选项（幸运空间/臻选空间共用） */
  shop_filters: {
    categories: FilterOption[]
    price_ranges: FilterOption[]
    basic_filters: FilterOption[]
    stock_filters: FilterOption[]
    sort_options: FilterOption[]
  }

  /** 交易市场 Tab 筛选项（C2C 挂单筛选，与商品兑换完全不同） */
  market_filters: {
    type_filters: FilterOption[]
    category_filters: FilterOption[]
    sort_options: FilterOption[]
  }

  /** 卡片视觉配置（两个 Tab 共用一套主题和效果） */
  card_display: CardDisplayConfig

  ui: UIConfig
}

interface TabConfig {
  key: string
  label: string
  icon?: string
  enabled: boolean
  sort_order: number
}

/**
 * 字段对齐 exchange.ts 第167-189行 spaceList 数组
 * name 中包含 emoji 前缀（如 "🎁 幸运空间"），不再使用独立 icon 字段
 */
interface SpaceConfig {
  id: string
  /** 含 emoji 前缀，如 "🎁 幸运空间" */
  name: string
  subtitle: string
  description?: string
  layout: 'waterfall' | 'grid' | 'list' | 'simple'
  color: string
  /** CSS 渐变值，如 "linear-gradient(135deg, #52c41a 0%, #95de64 100%)" */
  bgGradient?: string
  /** true = 需要解锁才能访问（对应代码中的 locked 字段） */
  locked: boolean
  enabled: boolean
  sort_order: number
}

interface FilterOption {
  key: string
  label: string
  value?: any
  showCount?: boolean
}

/**
 * 卡片视觉配置 — 两个 Tab 共用
 * 对齐 exchange.ts 第231-247行（cardTheme + effects + viewMode 共享状态）
 */
interface CardDisplayConfig {
  theme: 'A' | 'B' | 'C' | 'D' | 'E'
  effects: EffectsConfig
  /** 商品兑换 Tab 的 CTA 按钮文案 */
  shop_cta_text: string
  /** 交易市场 Tab 的 CTA 按钮文案 */
  market_cta_text: string
  show_stock_bar: boolean
  stock_display_mode: 'bar' | 'text' | 'badge'
  show_sold_count: boolean
  show_tags: boolean
  price_display_mode: 'normal' | 'highlight' | 'capsule'
  image_placeholder_style: 'gradient' | 'emoji' | 'icon'
  press_effect: 'scale' | 'ripple' | 'glow' | 'none'
  show_type_badge: boolean
  price_color_mode: 'fixed' | 'type_based'
  default_view_mode: 'grid' | 'list'
}

interface EffectsConfig {
  grain: boolean
  holo: boolean
  rotatingBorder: boolean
  breathingGlow: boolean
  ripple: boolean
  fullbleed: boolean
  listView: boolean
}

/**
 * 对齐 config/constants.ts 中的 PAGINATION + DELAY 常量
 * grid_page_size = PAGINATION.GRID_SIZE (4)
 * waterfall_page_size = PAGINATION.WATERFALL_SIZE (20)
 * default_api_page_size = PAGINATION.DEFAULT_PAGE_SIZE (20)
 */
interface UIConfig {
  low_stock_threshold: number
  /** 网格布局每页数量（当前 2×2 = 4） */
  grid_page_size: number
  /** 瀑布流每页数量（当前 20） */
  waterfall_page_size: number
  /** 默认 API 分页大小（当前 20） */
  default_api_page_size: number
  search_debounce_ms: number
}
```

---

## 八、工时汇总

| 端 | 工时 | 是否可并行 |
|----|------|-----------|
| 后端数据库 | ~7h（1天） | 可独立开发 |
| 微信小程序 | ~11.5h（1.5天） | 可独立开发（有兜底值，M5/M6 已完成省 2.5h） |
| Web管理后台 | ~17.5h（2.5天） | 需后端接口就绪后联调 |
| 三端联调 | ~4h（0.5天） | 需三端都就绪 |
| **合计** | **~40h** | **并行开发约3天完成** |

---

## 附录：代码核对修正记录

本文档于 2026-02-20 基于实际代码全量核对后修正，主要修正项：

| 修正项 | 原文档描述 | 实际代码 | 修正内容 |
|--------|-----------|----------|---------|
| spaces 字段 | `name:"幸运空间"` + 独立 `icon` + `unlock_required` | `name:"🎁 幸运空间"` + `bgGradient` + `locked` | 对齐 exchange.ts 第167-189行 |
| 筛选体系 | 统一 `filters` 对象 | 商品兑换和交易市场是完全不同的筛选维度 | 拆分为 `shop_filters` + `market_filters` |
| 卡片主题 | 拆为 `card_display` + `market_card_display` | 两个 Tab 共用一套 `cardTheme` + `effects` | 合并为单一 `card_display` |
| UI 参数 | `page_size:20`, `waterfall_page_size:30` | `GRID_SIZE:4`, `WATERFALL_SIZE:20` | 对齐 config/constants.ts |
| M5 空间导航 | "需要改为 wx:for 动态渲染" | 已是 `wx:for="{{spaceList}}"` | 标注为已完成 |
| M6 筛选项 | "需要改为 wx:for 动态渲染" | 5 组筛选项均已 `wx:for` 绑定 data 数组 | 标注为已完成 |
| M1 文件 | `utils/config-cache.ts` 中新增 | 该文件已被活动位置配置占用 | 改为新建 `utils/exchange-config-cache.ts` |
| Tab 切换 | 简单的 `onTabChange` | 实际是 `onGoToTradeMarket`/`onGoToExchange`（含异步初始化） | 补充分发逻辑说明 |

---

*文档结束*
