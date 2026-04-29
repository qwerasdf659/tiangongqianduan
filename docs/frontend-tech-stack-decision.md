# 天工小程序前端技术栈决策文档

> **版本**: 1.3.0
> **日期**: 2026-04-30
> **状态**: 已批准，待执行
> **决策范围**: 前端技术栈选型、UI 组件库引入、主题架构重构
> **批准人**: 项目负责人
> **批准日期**: 2026-04-30

---

## 一、项目现状

| 项目 | 现状 |
|------|------|
| 项目名称 | tiangong-restaurant-lottery（天工餐厅积分抽奖系统） |
| 版本 | 5.2.0 |
| 平台 | 微信小程序（原生） |
| 渲染器 | Skyline + glass-easel（`"componentFramework": "glass-easel"`） |
| 基础库 | 3.15.0 |
| 语言 | TypeScript（strict 模式） |
| 样式 | Sass（.scss） |
| 状态管理 | MobX（mobx-miniprogram + mobx-miniprogram-bindings） |
| 实时通信 | Socket.IO（weapp.socket.io） |
| UI 组件库 | **无**，全部手写 |
| 主题 | 6 套动态主题（55+ CSS 变量/套） |
| 分包 | 7 个子包（Lottery、Exchange、Trade、User、Admin、Ad、DIY） |
| 后端 | REST API v4，Sealos 部署 |

### Production 依赖（仅 3 个）

| 包名 | 版本 |
|------|------|
| `mobx-miniprogram` | ^6.12.3 |
| `mobx-miniprogram-bindings` | ^5.1.1 |
| `weapp.socket.io` | ^3.0.0 |

### 全局组件（7 个，全部手写）

- `loading-spinner` — 加载指示器
- `empty-state` — 空状态
- `pagination` — 分页
- `price-chart` — 价格走势图
- `prize-detail-modal` — 奖品详情弹窗
- `category-cascade` — 分类级联选择
- `maintenance-overlay` — 维护模式遮罩

### 子包业务组件（20+）

- 14 种抽奖游戏（wheel、grid、scratch、egg、blindbox、gashapon、pinball、slotmachine、whackmole、redpacket、luckybag、flashsale、card、cardcollect）
- 交易面板、竞价面板、库存管理
- DIY 设计器（bead-card、shape-renderer、fly-animation、payment-panel）

### 样式架构现状

存在**两套变量体系并存**的问题：

1. **Sass 变量**（`styles/variables.scss`）：`$color-primary`、`$spacing-md` 等，编译时确定
2. **CSS 变量**（`utils/global-themes.ts`）：`--theme-primary`、`--shelf-*` 等，运行时动态切换

两套体系定义了大量重叠的值（如主色 `#ff6b35` 在两处都有定义），容易不一致。

---

## 二、技术概念分层关系

从底层到顶层共 5 层，它们不是互相替代的关系，而是从下到上叠加的关系：

```
┌─────────────────────────────────────────────┐
│  第5层：业务代码（页面、业务组件）               │  ← 每天写的东西
├─────────────────────────────────────────────┤
│  第4层：UI 组件库（TDesign / Vant）             │  ← 别人写好的积木
├─────────────────────────────────────────────┤
│  第3层：开发工具（MobX / Sass / TypeScript）    │  ← 让开发更高效的工具
├─────────────────────────────────────────────┤
│  第2层：渲染引擎（Skyline + glass-easel）       │  ← 把代码变成画面的引擎
├─────────────────────────────────────────────┤
│  第1层：画布（WXML 渲染 / Canvas / WebGL）      │  ← 最底层，画东西的方式
└─────────────────────────────────────────────┘
```

### 第 1 层：画布 — 三种绘制方式

| 方式 | 擅长什么 | 项目中的使用场景 |
|------|---------|----------------|
| WXML 普通渲染 | 列表、按钮、表单、文字 — 90% 的页面 | 商城、个人中心、订单、设置 |
| Canvas 2D | 2D 图形、图表、刮刮卡、QR 码 | `price-chart`、`qrcode`、刮刮卡抽奖 |
| WebGL | 3D 效果、粒子特效、复杂动画 | 目前未使用 |

它们不互斥，一个页面可以同时使用多种方式。

### 第 2 层：渲染引擎

| | 旧引擎（WebView） | 新引擎（Skyline + glass-easel） |
|---|---|---|
| 原理 | 浏览器内核渲染 | 微信自研原生渲染 |
| 性能 | 一般 | 更快（长列表、动画） |
| 本项目 | ❌ 未使用 | ✅ 正在使用 |

- **Skyline** = 新渲染引擎（负责画）
- **glass-easel** = 新引擎的组件框架（负责组件生命周期、数据绑定）
- 在 `app.json` 中配置 `"componentFramework": "glass-easel"` 即启用

### 第 3 层：开发工具

| 工具 | 解决什么问题 |
|------|------------|
| TypeScript | 类型检查，减少运行时错误 |
| Sass | CSS 预处理器，支持变量、嵌套、混入 |
| MobX | 跨页面/组件的状态共享与管理 |

这三个与渲染引擎无关，是独立的工具层。

### 第 4 层：UI 组件库

| | 没有组件库（当前） | 有组件库（TDesign / Vant） |
|---|---|---|
| 要一个按钮 | 自己写 WXML + SCSS + TS | `<t-button>提交</t-button>` |
| 要一个弹窗 | 自己写遮罩 + 动画 + 关闭逻辑 | `<t-dialog>` |
| 出了 bug | 自己查、自己修 | 更新 npm 包 |

### 第 5 层：业务代码

- **可以用组件库的**：按钮、输入框、弹窗、标签页、空状态、加载动画
- **必须自己写的**：14 种抽奖游戏、价格走势图、DIY 设计器、竞价面板

---

## 三、行业技术栈对比

### 1. 大厂（美团、腾讯、阿里、京东、字节）

| 技术维度 | 做法 |
|---------|------|
| 开发框架 | 跨端框架：美团 Taro、京东 Taro、阿里 Rax、字节 Taro、腾讯 kbone |
| 语言 | TypeScript |
| UI 组件库 | 自研：美团 MTD、腾讯 TDesign、阿里 Ant Design Mini、京东 NutUI |
| 状态管理 | Redux / MobX / Vuex |
| 样式方案 | Sass/Less + 设计令牌（Design Token）驱动 |
| 渲染器 | 大部分 WebView，少数新项目试水 Skyline |
| 多端 | 一套代码编译到微信/支付宝/抖音/H5/App |
| 自研组件团队 | 10-50 人专职维护 |
| 年维护成本 | 百万级 |

**适合本项目吗：不适合。** 大厂选跨端框架是因为要同时发多个平台，自研组件库是因为有专职团队。本项目只做微信，没有专职设计系统团队。

### 2. 中型互联网公司（霸王茶姬、喜茶、瑞幸、叮咚买菜）

| 技术维度 | 做法 |
|---------|------|
| 开发框架 | 原生微信小程序 或 Taro/uni-app |
| 语言 | TypeScript 或 JavaScript |
| UI 组件库 | Vant Weapp / TDesign / WeUI，不自研 |
| 状态管理 | MobX 或简单全局变量 |
| 样式方案 | Sass/Less + 组件库自带主题变量 |
| 渲染器 | WebView |
| 团队规模 | 3-5 个前端 + 1-2 个设计师 |
| 自研比例 | 80% 组件库 + 20% 业务组件 |
| 主题 | 1 套品牌配色，不做多主题 |

**适合本项目吗：最接近，但业务复杂度更高。**

### 3. 小公司 / 创业团队

| 技术维度 | 做法 |
|---------|------|
| 开发框架 | uni-app（Vue 语法，上手快）或原生 |
| 语言 | JavaScript（不用 TS） |
| UI 组件库 | uView / Vant / 直接抄竞品样式 |
| 状态管理 | 无，用 globalData 或 getApp() |
| 样式方案 | 直接写 wxss |
| 渲染器 | WebView |

**适合本项目吗：不适合。** 业务复杂度（14 种抽奖、C2C 交易、拍卖、DIY）远超小公司水平。

### 4. 游戏公司小程序（米哈游、网易、腾讯游戏）

| 技术维度 | 做法 |
|---------|------|
| 开发框架 | 原生微信小程序 |
| 语言 | TypeScript |
| UI 组件库 | 不用通用库，核心交互全部 Canvas/WebGL |
| 状态管理 | 自研或 MobX |
| 样式方案 | 游戏部分不用 CSS（Canvas 自己画），框架页面用简单样式 |
| 渲染器 | Canvas 2D / WebGL 为主 |
| 特殊技术 | Cocos Creator、Laya、PixiJS 等游戏引擎 |
| 主题 | 多套（跟游戏 IP 绑定，有商业意义） |

**适合本项目吗：仅抽奖模块部分适合。** 14 种抽奖有游戏性，但框架页面不需要游戏化。本项目的抽奖不是真正的游戏，不需要游戏引擎。

### 5. 活动策划公司（蓝色光标、时趣、活动行）

| 技术维度 | 做法 |
|---------|------|
| 开发框架 | H5 为主，小程序用 WebView 嵌 H5 |
| 语言 | JavaScript |
| UI 组件库 | 不用，每次活动单独写 |
| 状态管理 | 无（活动页面是一次性的） |
| 样式方案 | 内联样式 + 后台配置换图换色 |
| 渲染器 | WebView |

**适合本项目吗：不适合。** 活动公司做一次性页面，本项目是长期产品。

### 6. 虚拟物品交易平台（BUFF、C5GAME、网易 BUFF、悠悠有品、闲鱼）

| 技术维度 | 做法 |
|---------|------|
| 开发框架 | 原生微信小程序 |
| 语言 | TypeScript |
| UI 组件库 | 基础用 Vant/TDesign，交易核心自研 |
| 状态管理 | MobX 或 Redux |
| 样式方案 | Sass + 单一主题 |
| 渲染器 | WebView |
| 自研重点 | 价格走势图、交易面板、竞价系统、实时推送 |
| 设计风格 | 信息密度高，数据展示为王，交易安全感 > 视觉美感 |

**适合本项目吗：packageTrade 模块高度吻合。** 思路是「基础组件用库，交易链路自研」。

---

## 四、方案总结对比表

| 方案 | 代表 | 组件来源 | 主题数 | 维护成本 | 视觉质量 | 适合本项目？ |
|------|------|---------|-------|---------|---------|------------|
| 大厂自研 | 美团/腾讯 | 100% 自研 | 1 | 极高 | 极高 | ❌ 否 |
| 组件库+品牌定制 | 霸王茶姬/喜茶 | 80% 库 + 20% 自研 | 1 | 低 | 高 | ✅ 最适合 |
| 组件库默认 | 小创业公司 | 99% 库 | 1 | 极低 | 中 | ❌ 否（业务太复杂） |
| 重度定制 | 游戏公司 | 90% 自研 | 多套 | 极高 | 极高 | ⚠️ 仅抽奖模块 |
| 模板化配置 | 活动公司 | 模板+配置 | 按活动换 | 中 | 中 | ❌ 否（长期产品） |
| 功能优先 | BUFF/C5 | 70% 库 + 30% 自研 | 1 | 中 | 中高 | ✅ 交易模块适合 |

---

## 五、本项目技术栈评估

### 选对了的（不动）

| 技术 | 理由 |
|------|------|
| 原生微信小程序（不用 Taro/uni-app） | 只做微信，不需要跨端。原生 + Skyline 性能最好 |
| TypeScript（strict 模式） | 行业共识，大厂和交易平台都用 TS |
| Sass | 行业标准预处理器 |
| MobX（mobx-miniprogram） | 微信小程序生态里最成熟的状态管理方案 |
| Skyline + glass-easel | 领先选择，性能优势明显 |
| 分包架构 + preloadRule | 正确做法，大厂也这么干 |
| Socket.IO 实时通信 | 交易平台标配 |
| JWT 双令牌认证 | 安全标准做法 |
| 所有 MobX store | 数据结构合理，不需要改 |
| 所有 API 模块 | 架构清晰，不需要改 |
| 14 种抽奖游戏组件 | 核心业务，必须自研 |
| price-chart | TDesign 没有图表组件，必须自研 |
| DIY 设计器 | 高度定制化业务，必须自研 |
| 交易/拍卖面板 | 核心交易链路，必须自研 |

### 需要改的

| 问题 | 现状 | 目标 | 理由 |
|------|------|------|------|
| 没有 UI 组件库 | 全部手写基础组件 | 引入 TDesign 小程序版 | 手写 `loading-spinner`、`empty-state`、`pagination`、`category-cascade` 是重复造轮子 |
| 6 套主题 | `global-themes.ts` 557 行，330+ 个值 | 砍到 1 套 | 全行业除游戏公司（跟 IP 绑定）没人维护多套主题 |
| 两套变量体系并存 | Sass 变量（`$color-primary`）+ CSS 变量（`--theme-primary`）重叠 | 统一为 TDesign `--td-*` + 业务 `--tg-*` | 消除不一致风险 |

---

## 六、为什么要引入 UI 组件库 — 基于项目真实代码的痛点分析

以下痛点全部来自本项目 `components/` 目录下的真实代码，不是假设。

### 痛点 1：重复造轮子，且功能不完整

`loading-spinner` 组件（`components/loading-spinner/loading-spinner.ts`）：

```typescript
Component({
  properties: {
    text: {
      type: String,
      value: '加载中...'
    }
  }
})
```

14 行代码，只支持 1 个 `text` 属性。TDesign 的 `t-loading` 支持：多种动画类型（圆形、点状、菊花）、自定义大小/颜色、全屏/局部加载、加载遮罩层、延迟显示（防闪烁）、竖排/横排布局、无障碍 aria 标签。当前组件只实现了约 10% 的功能，未来每加一个功能就是一次开发 + 测试。

### 痛点 2：边界情况缺失，类型安全不足

`pagination` 组件（`components/pagination/pagination.ts`），共 119 行 TS + 103 行 SCSS + 50 行 WXML = **272 行代码**。存在的问题：

- 没有 `pageSize` 切换（每页显示多少条）
- 没有 `simple` 模式（只显示"1/10"）
- 没有 `mini` 模式（紧凑布局）
- 没有键盘无障碍支持
- 输入框没有防抖（快速输入会频繁触发）
- 到处使用 `(this.properties as any)` 绕过类型检查，说明类型定义不完善

这 272 行代码，TDesign `t-pagination` 全部覆盖，且经过腾讯内部几十个项目验证。

### 痛点 3：组件职责不清，与 API 强耦合

`category-cascade` 组件（`components/category-cascade/category-cascade.ts`）内部直接调用后端 API：

```typescript
async _loadCategoryTree() {
  this.setData({ loading: true })
  try {
    const response = await cascadeAPI.getCategoryTree()
    // ...处理数据
  } catch (treeError) {
    this.setData({ treeLoaded: false, loading: false })
  }
}
```

问题：
- 组件和 API 强耦合，换个接口就得改组件源码
- 没法复用到其他场景（如 DIY 模块也需要分类选择时，得复制代码或硬改）
- 没法做单元测试（依赖真实 API 调用）

TDesign 的 `t-cascader` 只负责 UI 交互，数据由外部通过 props 传入，职责清晰。

### 痛点 4：样式不统一，每个组件各写一套

`empty-state` 的按钮样式：

```scss
.empty-btn {
  height: 72rpx;
  line-height: 72rpx;
  border-radius: $border-radius-lg;   // 24rpx
  // ...
}
```

`pagination` 的按钮样式：

```scss
.page-btn {
  height: 64rpx;
  line-height: 64rpx;
  border-radius: $border-radius-md;   // 16rpx
  // ...
}
```

两个组件的按钮**各写了一遍样式**，高度不一样（72rpx vs 64rpx），圆角不一样（24rpx vs 16rpx）。没有统一按钮组件的后果：每个地方的按钮长得都不太一样，每次都要重新写。用 TDesign 后两处都是 `<t-button>`，样式自动统一。

### 痛点 5：微信更新需要自己适配

微信小程序基础库每隔几个月更新一次，Skyline 渲染器仍在快速迭代。如果某次更新导致自写组件出兼容性问题，需要自己排查、自己修。TDesign 是腾讯微信生态团队维护的，会第一时间适配自家的更新。

### 痛点总结

| 痛点 | 现状 | 引入 UI 组件库后 |
|------|------|----------------|
| 功能不完整 | `loading-spinner` 只有 1 个属性 | 开箱即用，需要时直接传参 |
| 边界情况缺失 | `pagination` 没有防抖、没有 pageSize、到处 `as any` | 经过大规模验证，边界情况已覆盖 |
| 组件职责不清 | `category-cascade` 内部直接调 API，耦合严重 | 组件只管 UI，数据外部传入 |
| 样式不统一 | 两个组件的按钮高度、圆角都不一样 | 统一的 `<t-button>`，全局一致 |
| 升级适配成本 | 微信更新后自己排查修复 | 组件库团队适配 |

**结论：UI 组件库解决的不是「能不能做」的问题，而是「做得好不好、维护得累不累」的问题。现有组件能用，但每一个都是未来的维护负担。**

---

## 七、推荐方案：交易平台模式

### 选型：TDesign 小程序版

选 TDesign 而不是 Vant Weapp 的原因：

| 对比项 | TDesign Mini | Vant Weapp |
|--------|-------------|------------|
| 出品方 | 腾讯 | 有赞 |
| Skyline 支持 | 原生支持 | 部分支持 |
| glass-easel 兼容 | 同一团队，完全兼容 | 需要额外测试 |
| TypeScript | 原生 TS | JS 为主 |
| CSS 变量定制 | 完整支持 | 支持 |
| 与微信生态契合度 | 最高（腾讯自家） | 高 |

本项目使用 glass-easel 和 Skyline，TDesign 是同一生态出品，兼容性最好。

### 架构分层

```
┌─────────────────────────────────────────────┐
│              页面层 (Pages)                   │
│  lottery / exchange / user / diy / trade     │
├─────────────────────────────────────────────┤
│           业务组件层 (自研，保留)               │
│  抽奖游戏(14种) / 价格图表 / 竞价面板         │
│  DIY设计器 / 交易卡片 / 库存管理              │
├─────────────────────────────────────────────┤
│           基础组件层 (TDesign)                │
│  Button / Cell / Dialog / Popup / Toast      │
│  Tabs / Tag / Loading / Empty / Cascader     │
│  NavBar / TabBar / Grid / Card / Image       │
├─────────────────────────────────────────────┤
│           设计令牌层 (统一)                    │
│  CSS Variables: --td-* (TDesign) + --tg-*    │
│  只保留1套主题，20-25个变量                    │
├─────────────────────────────────────────────┤
│           状态管理层 (MobX，保持不变)          │
│  userStore / pointsStore / tradeStore ...    │
└─────────────────────────────────────────────┘
```

### 改造清单

#### 删除的

| 文件 | 说明 |
|------|------|
| `utils/global-themes.ts` | 6 套主题全删，换成 TDesign CSS 变量覆盖 |
| `utils/theme-cache.ts` | 主题缓存逻辑全删 |
| `styles/variables.scss` | Sass 变量全部废弃，改用 `styles/td-overrides.scss` 中的 CSS 变量 |
| 后端 `/api/v4/system/config/app-theme` 接口 | 废弃，前端删除调用代码，后端保留但不再调用 |

#### 替换的（一步到位直接替换）

| 现有组件 | 替换为 | 迁移方式 |
|---------|--------|---------|
| `components/loading-spinner` | TDesign `t-loading` | 直接替换所有页面引用 |
| `components/empty-state` | TDesign `t-empty` | 直接替换所有页面引用 |
| `components/pagination` | TDesign 分页或自定义滚动加载 | 直接替换所有页面引用 |
| `components/category-cascade` | TDesign `t-cascader` | 直接替换，数据获取逻辑移到页面层（仅 2 个页面） |
| `custom-tab-bar` | TDesign `t-tab-bar` | 直接替换 |
| `styles/variables.scss` | `styles/td-overrides.scss`（CSS 变量） | 11 个 scss 文件改用 `var(--td-*)` |

项目未上线，不需要包装器过渡，一步到位最干净。

#### 保留不动的

- 所有 MobX store
- 所有 API 模块
- `utils/` 下的工具函数（除主题相关）
- `config/` 配置
- Socket.IO 实时通信
- 分包架构和 preloadRule
- TypeScript + Sass 编译链
- 14 种抽奖游戏组件（保留逻辑，用 TDesign 设计令牌统一配色）
- `price-chart`（TDesign 没有图表组件）
- `prize-detail-modal`（用 TDesign `t-popup` 重写外壳，保留内容）
- `maintenance-overlay`
- DIY 设计器组件
- 交易/拍卖面板

### 设计令牌策略

从 6 套 × 55 个变量 → **1 套 × 20-25 个变量**。废弃 `styles/variables.scss`，新建 `styles/td-overrides.scss`：

```scss
// styles/td-overrides.scss

page {
  // === 品牌色（覆盖 TDesign 默认蓝色） ===
  --td-brand-color: #ff6b35;
  --td-brand-color-light: #fff3ed;
  --td-brand-color-focus: #ff8c5a;
  --td-brand-color-active: #e55a2b;
  --td-brand-color-disabled: #ffcbb3;
  --td-brand-color-rgb: 255, 107, 53;  // RGB 分量，用于 rgba() 透明度计算

  // === 功能色（保持 TDesign 默认即可） ===
  // success, warning, error, info 不需要改

  // === 圆角（统一） ===
  --td-radius-default: 16rpx;
  --td-radius-small: 8rpx;
  --td-radius-large: 24rpx;
  --td-radius-round: 999px;
  --td-radius-circle: 50%;

  // === 字体 ===
  --td-font-size-base: 28rpx;
  --td-font-size-s: 24rpx;
  --td-font-size-m: 32rpx;
  --td-font-size-l: 36rpx;

  // === 间距 ===
  --tg-spacing-xs: 8rpx;
  --tg-spacing-sm: 16rpx;
  --tg-spacing-md: 24rpx;
  --tg-spacing-lg: 32rpx;
  --tg-spacing-xl: 40rpx;

  // === 自定义业务变量（以 --tg- 前缀区分） ===
  --tg-lottery-bg: linear-gradient(135deg, #fff5f0, #ffffff);
  --tg-trade-accent: #1890ff;
  --tg-diy-canvas-bg: #f5f5f5;
  --tg-price-up: #e74c3c;
  --tg-price-down: #27ae60;
  --tg-auction-highlight: #ff6b35;
}
```

**阴影写法迁移：** 原来使用 Sass `rgba()` 函数的地方，改用 CSS 原生 `rgba()` + RGB 分量变量：

```scss
// 旧写法（Sass 变量 + Sass rgba 函数）
$shadow-md: 0 8rpx 20rpx rgba($color-primary, 0.08);

// 新写法（CSS 变量 + CSS 原生 rgba 函数）
.card {
  box-shadow: 0 8rpx 20rpx rgba(var(--td-brand-color-rgb), 0.08);
}
```

**Sass 技术本身继续使用：** 废弃的只是 Sass 变量（`$color-*`、`$spacing-*`），Sass 的嵌套、混入（`@include flex-center`）、导入（`@import 'mixins'`）功能没有替代品，`styles/mixins.scss` 保留不动。

### 与后端的关系

后端不需要改动：

- API v4 接口全部保持
- MobX store 数据结构不变
- Socket.IO 通信不变
- Sealos 部署不变
- 唯一可废弃的：`/api/v4/system/config/app-theme` 接口

---

## 八、长期维护成本对比

| 维度 | 现在（全自研 + 6 主题） | 改造后（TDesign + 1 主题） |
|------|----------------------|--------------------------|
| 新页面开发 | 每个页面从零写样式 | 拼 TDesign 组件，只写业务逻辑 |
| 基础组件 bug | 自己查、自己修 | 更新 npm 包 |
| 新人上手 | 学私有组件 API | 看 TDesign 文档就能干活 |
| 微信 SDK 升级适配 | 自己适配每个组件 | TDesign 团队适配 |
| 无障碍（a11y） | 自己实现 | TDesign 内置 |
| 暗色模式 | 从零写 6 套暗色主题 | TDesign 开箱支持 |
| 主题维护 | 6 套 × 55 变量 = 330 个值 | 1 套 × 25 变量 |
| 组件一致性 | 靠人工保证 | 组件库统一保证 |

---

## 九、改造工期估算

| 步骤 | 内容 | 预估工时 |
|------|------|---------|
| 1 | 安装 `tdesign-miniprogram`，构建 npm | 30 分钟 |
| 2 | 创建 `styles/td-overrides.scss`，定义 25 个品牌/业务变量 | 2 小时 |
| 3 | 替换 `custom-tab-bar` 为 TDesign `t-tab-bar` | 4 小时 |
| 4 | 一步到位替换 4 个基础组件（直接改所有页面引用） | 1-2 天 |
| 5 | 删除 `global-themes.ts`、`theme-cache.ts`、清理主题相关调用（6 个页面） | 4 小时 |
| 6 | 废弃 `styles/variables.scss`，11 个 scss 文件改用 CSS 变量，阴影写法迁移 | 1 天 |
| 7 | 逐页替换自写的按钮/单元格/弹窗/标签为 TDesign 组件 | 3-5 天 |
| 8 | 业务组件样式统一（用 TDesign 设计令牌替换硬编码颜色） | 2-3 天 |
| 9 | 全量测试 | 1-2 天 |
| **合计** | | **约 2 周** |

---

## 十、关键决策点讨论记录

以下 6 个决策点经过行业对比分析和项目实际情况评估后确定。

### 决策点 1：UI 组件库选 TDesign 还是 Vant？

**行业做法：**

| 公司类型 | 选择 | 原因 |
|---------|------|------|
| 腾讯内部项目 | TDesign | 自家产品 |
| 有赞、电商类 | Vant | 有赞自家，电商场景打磨多年 |
| 霸王茶姬、喜茶 | Vant 居多 | 社区大、教程多、招人容易 |
| BUFF、C5GAME | Vant 居多 | 选型时 TDesign 还没出 |
| 2025 年后新项目 | TDesign 增长快 | Skyline 推广后成为官方推荐 |

**项目约束：** `project.config.json` 配置了 `"componentFramework": "glass-easel"`，使用 Skyline 新渲染器。Vant Weapp 的组件大部分基于 WebView 开发，在 Skyline 下部分组件的动画、overlay、scroll 行为可能不一致，需要逐个验证。TDesign 从一开始就考虑了 glass-easel 兼容。

**✅ 决策：选 TDesign。** 不是因为它更好，而是因为项目用了 Skyline，选 Vant 的验证成本更高。

> **负责人确认（2026-04-30）：** 接受 TDesign 社区较小的风险，确认选用 TDesign。

---

### 决策点 2：6 套主题砍到几套？

**行业做法：**

| 公司类型 | 主题数 | 原因 |
|---------|-------|------|
| 美团/腾讯/阿里 | 1 套 + 暗色模式 | 品牌统一 |
| 霸王茶姬/喜茶 | 1 套 | 品牌色就是品牌，不换 |
| 游戏公司（米哈游） | 多套 | 跟游戏版本/IP 绑定，有商业价值 |
| BUFF/C5GAME | 1 套（暗色） | 交易平台需要信息清晰，不需要氛围感 |
| 活动公司 | 按活动换 | 一次性页面，不是长期产品 |

**项目现状：** 6 套主题（default、gold_luxury、purple_mystery、spring_festival、christmas、summer），通过后端 `system_configs` 表控制。每套 55+ CSS 变量，6 套 = 330+ 个值。影响 6 个页面/组件（`GlobalTheme.getGlobalThemeStyle()`）和 8 个文件（`ThemeCache`）。

**分析：** 本项目是餐厅积分系统，不是游戏 IP。春节主题一年用一次，圣诞主题一年用一次。维护 330 个值换来的是一年用几次的氛围感。如果以后需要节日氛围，可以只在抽奖页面做局部装饰（换背景图、加飘雪动画），不需要全局换肤。

**✅ 决策：砍到 1 套（default 暖橙主题）。** 1 套 × 25 变量 vs 6 套 × 55 变量，维护量差 13 倍。

> **负责人确认（2026-04-30）：** 不需要节日氛围，确认砍到 1 套。

---

### 决策点 3：迁移方式 — 包装器过渡还是一步到位？

**行业做法：**

| 场景 | 选择 | 原因 |
|------|------|------|
| 已上线项目迁移 | 包装器过渡 | 不能停服，要灰度 |
| 未上线项目 | 一步到位 | 没有历史包袱 |
| 大厂重构 | 包装器 + 逐步替换 | 团队大，不能一次性改完 |

**项目现状：** 项目未上线，没有灰度需求。基础组件使用范围不大：`category-cascade` 只有 2 个页面在用（`premium-space` 和 `lucky-space`），其他组件使用范围也有限。

**✅ 决策：一步到位直接替换。** 项目没上线，包装器只会留下多余的中间层，是新的技术债。

---

### 决策点 4：`category-cascade` 换掉还是重构？

**行业做法：**

| 做法 | 谁在用 | 原因 |
|------|-------|------|
| 组件库 cascader + 外部传数据 | 中型公司、交易平台 | 组件职责清晰，可复用 |
| 自研 cascader 内部调 API | 小公司 | 图省事，但耦合严重 |

**项目现状：** 组件只在 2 个页面使用（`premium-space` 和 `lucky-space`），内部直接调用 `API.getCategoryTree()`，与后端强耦合。TDesign `t-cascader` 功能更完整（支持多级、异步加载、搜索），数据由外部传入。

**✅ 决策：直接换成 TDesign `t-cascader`。** 只改 2 个页面，工作量小。换完后组件与 API 解耦，以后 DIY 模块需要分类选择也能直接复用。

---

### 决策点 5：Sass 变量废弃还是保留？

**行业做法：**

| 做法 | 谁在用 | 原因 |
|------|-------|------|
| 纯 CSS 变量 | 腾讯 TDesign 体系、新项目 | 运行时可动态修改 |
| Sass 变量 + CSS 变量混用 | 大部分中型公司 | 历史原因 |
| Sass 变量指向 CSS 变量 | 迁移期折中 | 改动最小 |

**项目现状：** `styles/variables.scss` 被 11 个 `.scss` 文件引用（DIY 模块 7 个、广告模块 3 个、`pages/diy` 1 个）。其中使用了 Sass 特有函数：

```scss
$shadow-md: 0 8rpx 20rpx rgba($color-primary, 0.08);
```

`rgba()` 是 Sass 函数，如果把 `$color-primary` 改成 `var(--td-brand-color)`，Sass 编译会报错。但可以改用 CSS 原生写法绕过：

```scss
// 定义时多存一个 RGB 分量值
page {
  --td-brand-color: #ff6b35;
  --td-brand-color-rgb: 255, 107, 53;
}

// 使用时用 CSS 原生 rgba()，不用 Sass 的 rgba()
.card {
  box-shadow: 0 8rpx 20rpx rgba(var(--td-brand-color-rgb), 0.08);
}
```

**关于 Sass 本身：** 废弃 Sass 变量 ≠ 废弃 Sass 技术。Sass 的嵌套、混入（mixin）、导入（import）功能没有替代品，继续使用。只是不再用 Sass 来定义颜色/间距变量，改用 CSS 变量统一管理。

| Sass 功能 | 是否继续使用 |
|-----------|------------|
| 变量（`$color-primary`） | ❌ 废弃，改用 CSS 变量 `var(--td-brand-color)` |
| 嵌套（`.card { .title { } }`） | ✅ 继续使用，CSS 不支持 |
| 混入（`@include flex-center`） | ✅ 继续使用，CSS 不支持 |
| 导入（`@import 'mixins'`） | ✅ 继续使用 |

**✅ 决策：废弃 Sass 变量，只用 CSS 变量。** 改动量可控（11 个文件 + 阴影写法改 3-4 处），换来的是只维护一套变量，改一处全局生效。`styles/variables.scss` 废弃，`styles/mixins.scss` 保留。

---

### 决策点 6：后端 `/api/v4/system/config/app-theme` 接口是否废弃？

**项目现状：** 砍到 1 套主题后，这个接口不再有调用方。涉及的前端文件：`utils/theme-cache.ts`（调用方）、`utils/api/system.ts`（接口定义）。后端对应 `system_configs` 表 `config_key='app_theme'`。

**✅ 决策：废弃。** 前端删除调用代码，后端接口保留但不再调用（避免删后端代码的风险）。

> **负责人确认（2026-04-30）：** 已与后端同步完毕，确认废弃该接口。

---

### 决策总览

| # | 决策点 | 结论 | 核心理由 |
|---|--------|------|---------|
| 1 | UI 组件库 | **TDesign** | Skyline + glass-easel 同生态，兼容性最好 |
| 2 | 主题数量 | **砍到 1 套** | 不是游戏 IP，节日氛围用局部装饰替代 |
| 3 | 迁移方式 | **一步到位** | 项目没上线，包装器是多余的中间层 |
| 4 | category-cascade | **换成 TDesign t-cascader** | 只有 2 个页面在用，换完解耦 |
| 5 | Sass 变量 | **废弃，只用 CSS 变量** | 一套变量，改一处全局生效；Sass 嵌套/混入继续用 |
| 6 | 后端 app-theme 接口 | **废弃** | 砍到 1 套主题后不再需要 |

---

## 十一、决策结论

| 决策项 | 结论 |
|--------|------|
| 开发框架 | 保持原生微信小程序，不引入跨端框架 |
| 渲染器 | 保持 Skyline + glass-easel |
| 语言 | 保持 TypeScript strict 模式 |
| 样式预处理器 | 保持 Sass（嵌套、混入、导入继续用） |
| 状态管理 | 保持 MobX |
| UI 组件库 | **引入 TDesign 小程序版** |
| 主题策略 | **从 6 套砍到 1 套**，用 TDesign CSS 变量覆盖机制 |
| 变量体系 | **只用 CSS 变量（`--td-*` + `--tg-*`）**，废弃 `styles/variables.scss` 中的 Sass 变量，保留 `styles/mixins.scss` |
| 自研范围 | 14 种抽奖、价格图表、DIY 设计器、交易/拍卖面板 |
| 迁移方式 | **一步到位直接替换**，不使用包装器过渡 |
| 后端 app-theme 接口 | **废弃**，前端删除调用代码 |
