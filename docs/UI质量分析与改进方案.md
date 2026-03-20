# UI 质量分析与改进方案 — 天工小程序前端项目

> 创建日期：2026年3月20日  
> 文档性质：UI 设计评审 & 改进路线图  
> 对比基准：三套参考设计（暗紫游戏风、暖金商务风、浅蓝清新风）

---

## 一、三套参考设计的共同优点

| 维度 | 三套参考图的共同特征 |
|------|------|
| **色彩方向** | 每套只有一个明确的色彩主调，辅色克制 |
| **卡片设计** | 白底/浅底为主，边界清晰，不堆叠特效 |
| **留白** | 内容之间有足够呼吸空间，不拥挤 |
| **信息层级** | 主标题、副信息、辅助文字的大小/色彩差异明显 |
| **装饰性元素** | 有手绘感或定制感的图标和插画，而非纯 CSS 特效 |
| **底部导航** | 简洁图标 + 文字，不过度装饰 |

### 1.1 暗紫游戏风（参考图 1）

- 深紫/藏蓝渐变背景，整体色调统一
- 游戏角色插画融入卡片，视觉丰富但不杂乱
- VIP 卡片有高级感的金色描边和纹理
- 用户中心页面用网格布局组织大量功能入口，图标有统一的圆形底色
- 橙色只出现在极小面积（价格、角标），不与紫色抢注意力

### 1.2 暖金商务风（参考图 2）

- 全局暖金/橙黄色调，白色内容区占据 70% 以上面积
- 信息层级非常清晰：金色头部区 → 白色功能区 → 灰底列表区
- 排行榜前三名用金/银/铜色定制奖牌，视觉辨识度高
- 商家中心用分组卡片组织密集功能，每组有小标题，不压缩间距
- 会员卡片使用渐变背景图（非纯 CSS），质感明显优于代码渐变

### 1.3 浅蓝清新风（参考图 3）

- 淡蓝紫渐变做背景点缀，大面积留白
- 首页用卡片 + 列表混合布局，信息密度适中
- 订单详情页层次分明：状态区 → 商品信息 → 交易信息 → 参与人
- 排行榜用人物头像 + 纵向列表，信息排列简洁
- "我的"页面功能图标带有圆形底色和微妙的色彩区分

---

## 二、当前项目的"AI 塑料感"根源诊断

### 2.1 渐变滥用 — 最大的"塑料感"来源

**当前状态**：项目中至少存在 8 种以上渐变定义

| 渐变名称 | 色值 | 使用场景 |
|----------|------|----------|
| 主色渐变 | `#667eea → #764ba2` | 头部、CTA、激活态 |
| 橙色渐变 | `#ff6b35 → #f7931e` | 按钮、导航激活 |
| 青绿渐变 | `#4ecdc4 → #44a08d` | 货架头部 |
| 热门标签 | `#ff4757 → #ff6b81` | 徽章 |
| 新品标签 | `#2ed573 → #7bed9f` | 徽章 |
| 限定标签 | `#7c4dff → #b388ff` | 徽章 |
| 库存条 | 3 种渐变（绿/黄/红） | 库存指示器 |
| 卡片玻璃 | `rgba(255,255,255,0.98) → rgba(255,255,255,0.92)` | 所有卡片 |

**参考图对比**：暖金风格全页面只用了 1 种渐变（橙→金），浅蓝风格也只有 1 个主色渐变。

**核心结论**：渐变越多 → 视觉越碎 → 越像模板 → 塑料感越重。

### 2.2 玻璃拟态（Glassmorphism）过度使用

**当前状态**：大量使用以下效果

```
backdrop-filter: blur(15-25rpx)
background: rgba(255,255,255,0.15) ~ rgba(255,255,255,0.95)
多层径向渐变叠加做背景深度
```

**问题所在**：当页面上每个元素都是"半透明毛玻璃"，就没有视觉锚点了。玻璃拟态是一种**点缀手法**，不是全局设计语言。

**参考图做法**：只有个别卡片头部或 VIP 卡片用了类似效果，大部分内容区域是**纯白底**。

### 2.3 色彩方向不统一 — 双主色冲突

**当前状态**：系统中存在"三主色"矛盾

| 角色 | 色值 | 用途 |
|------|------|------|
| Brand 色 | `#ff6b35`（橙色） | 按钮、导航激活态 |
| CTA 色 | `#667eea → #764ba2`（蓝紫） | 头部、行动按钮 |
| 强调色 | `#4ecdc4`（青绿） | 货架头部 |

三个方向的色彩在同一个页面上竞争用户注意力。

**参考图做法**：
- 暗紫风格 → 全局紫色，橙色只做极小面积点缀（价格标签）
- 暖金风格 → 全局金色，蓝色只做链接文字色
- 浅蓝风格 → 全局蓝紫，橙色只做价格数字

### 2.4 阴影层次缺乏设计感

**当前定义**：

```scss
$shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
$shadow-md: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
$shadow-lg: 0 8rpx 24rpx rgba(0, 0, 0, 0.15);
```

这是非常标准的"教科书阴影"，每个 UI 模板都长这样。

**参考图做法**：卡片阴影带有色彩倾向（暗紫风格的阴影偏紫，暖金风格的阴影偏暖），让阴影"融入"画面而非生硬地"贴在上面"。

### 2.5 缺少定制视觉资产

**当前状态**：几乎所有视觉效果都是 CSS 实现的（渐变、阴影、动画），缺少：

| 缺失项 | 参考图中的对应实现 |
|--------|------------------|
| 定制插画 | 参考图中的游戏角色、品牌形象 |
| 品牌化图标 | 参考图中统一风格的功能图标组 |
| 背景纹理/图案 | 参考图中微妙的背景装饰元素 |
| 手绘感元素 | 排行榜的皇冠、勋章、奖牌 |
| VIP 卡片背景 | 用设计稿切图而非纯 CSS 堆叠 |

**核心结论**：纯 CSS 特效再多也无法替代视觉设计资产的质感。这是"AI 感"最根本的原因 — AI 擅长写 CSS，不擅长做品牌视觉。

### 2.6 动效过于均匀 — 什么都动 = 什么都不突出

**当前状态**：

| 动效 | 类型 |
|------|------|
| shimmer | 骨架屏闪烁 |
| pulse | 脉搏动画 |
| fadeIn | 渐入效果 |
| particle | 粒子效果 |
| card-glow-breath | 卡片呼吸发光 |

当页面上到处都在动，用户反而感知不到重点，体验变得"花哨但空洞"。

**参考图做法**：都很静态、克制，只在关键交互点有微动效。

### 2.7 项目特效完整清单与保留决策

全项目扫描后，特效总量如下：

| 类别 | 数量级 |
|------|--------|
| @keyframes 动画定义 | 200+ |
| backdrop-filter 玻璃拟态 | 80+ 处 |
| linear-gradient 渐变 | 150+ 处 |
| 彩色 glow box-shadow | 50+ 处 |
| filter（blur/brightness/drop-shadow） | 60+ 处 |
| transform 装饰效果 | 200+ 处 |
| transition 过渡 | 150+ 处 |
| JS/TS 粒子系统 | 6 个 |

#### A. 抽奖游戏特效（≈150+ 个动画）— 全部保留

这些是游戏玩法的核心体验，砍掉等于把游戏变成静态图片，不在"去塑料感"范围内。

| 玩法 | 所在目录 | 代表性特效 | 数量 |
|------|----------|-----------|------|
| 弹珠机 | `sub/pinball/` | 灯泡追逐、球发射、爆裂飞散、金币下落、聚光灯呼吸 | 30+ |
| 打地鼠 | `sub/whackmole/` | 地鼠弹出、锤子挥击、爆裂粒子 1-4、冲击波扩散 | 50+ |
| 老虎机 | `sub/slotmachine/` | LED 追灯、霓虹流光、卷轴旋转、冲击波、爆裂增强 | 20+ |
| 扭蛋机 | `sub/gashapon/` | 胶囊掉落/拖尾、手柄旋转、光线旋转、爆裂弹出 | 10+ |
| 集卡 | `sub/cardcollect/` | 卡片翻转、全息光泽、emoji 弹出、3D 翻面 | 15+ |
| 刮刮卡 | `sub/scratch/` | 格子溶解、奖品弹入、引导滑动、提示脉冲 | 5+ |
| 九宫格 | `sub/grid/` | 高亮脉冲、中奖脉冲、按钮发光、旋转、脉搏 | 6+ |
| 盲盒 | `sub/blindbox/` | 蛋摇晃、曲柄旋转、蛋掉落弹跳、裂开、奖品弹出 | 10+ |
| 红包 | `sub/redpacket/` | 红包抖动、内容揭示、闪光 | 3 |
| 砸蛋 | `sub/egg/` | 蛋抖动、锤子挥动、碎片飞射 1-6、闪光 | 8+ |
| 福袋 | `sub/luckybag/` | 袋子抖动、福字闪光、浮起 | 3 |
| 闪购 | `sub/flashsale/` | 霓虹边框、数字翻转、全息偏移、火焰浮动 | 10+ |
| 转盘 | `sub/wheel/` | 灯光闪烁 + conic-gradient 扇区 | 2 |
| 翻牌 | `sub/card/` | 卡片入场、空闲漂浮、光泽脉冲 | 6 |
| 共享动效 | `shared/` | 爆裂环、爆裂星、闪光、稀有度发光、结果弹窗动画 | 15+ |

另外有 6 个 JS/TS 粒子系统（whackmole、slotmachine、pinball、luckybag、gashapon、blindbox），以 DOM 元素 + CSS 动画实现，均属于游戏内效果。

#### B. 页面级装饰特效（≈15 个动画）— 建议全部移除

这些不属于任何游戏玩法，纯粹是页面"氛围装饰"，是"塑料感"的主要来源：

| 特效名 | 文件 | 表现 | 循环时长 |
|--------|------|------|----------|
| `card-glow-breath` | `pages/user/user.scss` | 卡片边缘呼吸式发光 | 5s 无限循环 |
| `neon-pulse` | `pages/user/user.scss` | 霓虹脉冲 | 无限循环 |
| `pulse-glow` | `pages/user/user.scss` | 脉冲发光 | 无限循环 |
| `gold-fall` | `pages/user/user.scss` | 金币从天而降 | 9s 无限循环 |
| `star-twinkle` | `pages/user/user.scss` | 星星闪烁 | 无限循环 |
| `petal-fall` | `pages/user/user.scss` | 花瓣飘落 | 10s 无限循环 |
| `snow-fall` | `pages/user/user.scss` | 雪花飘落 | 11s 无限循环 |
| `bubble-rise` | `pages/user/user.scss` | 气泡上升 | 10s 无限循环 |
| `default-float` | `pages/user/user.scss` | 默认浮动粒子 | 无限循环 |
| `breatheGlow` | exchange-shelf-cards / bid-panel | 商品卡片呼吸发光 | 2s 无限循环 |
| `holoShimmer` | exchange-shelf-cards | 全息闪光 | 3s 无限循环 |
| `rotatingBorderColor` | exchange-shelf-cards | 边框颜色旋转 | 无限循环 |
| `rippleSpread` | exchange-shelf-cards | 涟漪扩散 | 无限循环 |

用户页面（`pages/user/user.scss`）是重灾区，集中了 6 种主题粒子特效（金币、星星、花瓣、雪花、气泡、默认浮动）+ 卡片呼吸发光。

#### C. 玻璃拟态 backdrop-filter（≈80+ 处）— 弹窗保留，卡片移除

| 使用区域 | blur 值 | 建议 |
|----------|---------|------|
| 抽奖结果弹窗 / 兑换确认弹窗 | 20-40rpx | ✅ 保留 — 弹窗毛玻璃是合理的聚焦手法 |
| 用户页个人信息卡、菜单区 | 5-20rpx | ❌ 移除 — 改纯白底 |
| 抽奖页头部、内容区 | 15-25rpx | ❌ 移除 — 改纯色底 |
| 登录页登录卡片 | 20rpx | ❌ 移除 — 改纯白底 |
| 交易市场瀑布流卡片、面板 | 10-20rpx | ❌ 移除 — 改纯白底 |
| 聊天页消息区域 | 10rpx | ❌ 移除 — 改纯白底 |
| 管理后台审核列表 | 10-20rpx | ❌ 移除 — 改纯白底 |
| 游戏内 UI（打地鼠、弹珠机等） | 10-20rpx | ✅ 保留 — 属于游戏沉浸感 |

#### D. 页面级渐变（不含游戏内渐变）— 只保留头部

除游戏内渐变外，页面级渐变集中在：

| 渐变用途 | 处理 |
|----------|------|
| 页面头部背景（6 套主题各一种） | ✅ 保留 |
| CTA 行动按钮（1-2 个/页面） | ✅ 保留 |
| 卡片背景渐变 | ❌ 改纯色 |
| 库存条渐变（绿/黄/红三种） | ❌ 改纯色 |
| 标签渐变（热门红、新品绿、限定紫） | ❌ 改纯色 |
| 货架头部青绿渐变 | ❌ 改为跟随主题色 |
| 导航激活态渐变 | ❌ 改纯色下划线/圆点 |
| 按钮渐变（非核心 CTA） | ❌ 改纯色 |

#### E. 功能性 UI 特效 — 全部保留

| 特效 | 所在位置 | 用途 |
|------|----------|------|
| `skeleton-shimmer` | 多个页面 | 骨架屏加载 |
| `fadeIn` | 多个页面 | 页面/列表项渐入 |
| `modalSlideUp` / `overlayFadeIn` | 弹窗组件 | 弹窗入场 |
| `cardFadeIn` / `fadeInUp` | 列表页面 | 列表卡片渐入 |
| `spin` | loading-spinner 等 | 加载旋转 |
| `dotBounce` | loading-spinner / price-chart | 加载点跳动 |
| transition 0.2-0.3s | 全局 | 状态切换过渡 |
| `scaleIn` | QR 码等 | 元素入场缩放 |

#### 分类决策汇总

| 分类 | 数量级 | 决策 | 理由 |
|------|--------|------|------|
| 抽奖游戏特效 | 150+ 动画 + 6 粒子系统 | **全部保留** | 游戏核心体验 |
| 页面装饰特效 | ≈15 个循环动画 | **全部移除** | "塑料感"主源 |
| 玻璃拟态 | 80+ 处 | **弹窗/游戏内保留，普通卡片移除** | 点缀可以，全局滥用不行 |
| 页面级渐变 | 大量 | **头部 + CTA 保留，其余改纯色** | 渐变越多越碎 |
| 功能性 UI 特效 | ≈10 种 | **全部保留** | 标准 UX 反馈 |

> 核心原则：**游戏里的一个不动，页面上的装饰是砍的重点**。两类泾渭分明，不会误伤。

---

## 三、当前项目样式系统现状

### 3.1 已有的工程化优势

| 模块 | 状态 | 说明 |
|------|------|------|
| Design Token 系统 | ✅ 已建立 | `styles/variables.scss` 集中管理色彩、间距、圆角、阴影 |
| Mixin 工具库 | ✅ 已建立 | `styles/mixins.scss` 提供布局、文字、卡片、按钮等复用样式 |
| CSS 变量主题切换 | ✅ 已建立 | `exchange-shelf` 等模块使用 `var(--xxx)` 实现主题化 |
| 全局主题系统 | ✅ 已建立 | 6 套主题，后端 API 控制切换 |
| 模块化 SCSS | ✅ 已建立 | 使用 partial 文件拆分样式（`_lottery-header` 等） |
| 响应式 & 安全区域 | ✅ 已建立 | `env(safe-area-inset-*)` 适配 |
| 暗色模式 | ✅ 已建立 | `@media (prefers-color-scheme: dark)` 支持 |

**结论**：CSS 工程化基础扎实，问题不在技术实现层面，而在设计决策层面。

### 3.2 当前 6 套主题体系

所有主题定义在 `utils/global-themes.ts`，架构如下：

```
后端 API  GET /api/v4/system/config/app-theme
    ↓ 返回当前主题名（如 "default"）
ThemeCache  (utils/theme-cache.ts)
    ↓ 4 层降级：本地缓存 → API → 过期缓存 → default
GlobalTheme  (utils/global-themes.ts)
    ↓ 生成 CSS 变量字符串（--theme-* 30+ 个，--shelf-* 25+ 个）
各页面 onLoad / onShow
    ↓ setData({ globalThemeStyle, currentThemeName })
WXML 渲染
    style="{{globalThemeStyle}}"  +  class="theme-{{currentThemeName}}"
```

6 套主题现状：

| # | 标识符 | 中文名 | 主色 | 页面渐变背景 | 当前问题 |
|---|--------|--------|------|-------------|----------|
| 1 | `default` | 暖橙日常 | 橙 `#e67e22` | 蓝紫 `#667eea → #764ba2` | 背景蓝紫 vs 按钮橙色，双色打架 |
| 2 | `gold_luxury` | 金色奢华 | 金 `#f1c40f` | 深蓝 `#2c3e50 → #1a1a2e` | 渐变过多，金色面积过大 |
| 3 | `purple_mystery` | 紫色神秘 | 紫 `#9b59b6` | 深紫 `#6c3483 → #512e5f` | 紫色渐变堆叠太多层 |
| 4 | `spring_festival` | 春节红金 | 红 `#e74c3c` | 红 `#e74c3c → #c0392b` | 红色面积过大，视觉疲劳 |
| 5 | `christmas` | 圣诞绿红 | 绿 `#27ae60` | 绿 `#27ae60 → #1e8449` | 绿红撞色处理不够好 |
| 6 | `summer` | 夏日蓝 | 蓝 `#3498db` | 蓝 `#3498db → #2471a3` | 蓝 + 青绿双色竞争 |

使用主题的页面/组件：

| 页面/组件 | 文件 |
|-----------|------|
| 用户页 | `pages/user/user.ts` + `user.wxml` + `user.scss` |
| 抽奖页 | `pages/lottery/lottery.ts` + `lottery.wxml` |
| 相机页 | `pages/camera/camera.ts` |
| 兑换页 | `pages/exchange/exchange.ts` |
| 登录页 | `packageUser/auth/auth.ts` + `auth.wxml` + `auth.scss` |
| 抽奖活动组件 | `packageLottery/lottery-activity/lottery-activity.ts` |
| 兑换货架组件 | `packageExchange/exchange-shelf/exchange-shelf.ts` |
| 兑换市场组件 | `packageExchange/exchange-market/exchange-market.ts` + `.wxml` |
| 竞价面板组件 | `packageExchange/exchange-shelf/sub/bid-panel/bid-panel.ts` |

---

## 四、全主题统一规则（6 套主题共同适用）

以下 6 条规则适用于所有主题，不分主题单独豁免：

### 规则 1：渐变只保留在页面头部区域

| 区域 | 规则 |
|------|------|
| 页面头部（顶部 status bar + 标题区） | ✅ 保留主题色渐变 |
| 1-2 个核心 CTA 按钮 | ✅ 可用渐变 |
| 卡片背景 | ❌ 改为纯色（白底或极浅主题色底） |
| 按钮（非核心 CTA） | ❌ 改为纯色 + 圆角 |
| 标签/徽章 | ❌ 改为纯色背景 + 白色文字 |
| 库存条 | ❌ 改为纯色条 |
| 导航激活态 | ❌ 改为纯色下划线/圆点 |
| 页面背景（非头部） | ❌ 改为单色或极微弱单向渐变 |

### 规则 2：卡片不用玻璃拟态

| 当前做法 | 改为 |
|----------|------|
| `backdrop-filter: blur(...)` | 移除 |
| `background: rgba(255,255,255,0.15~0.95)` | 改为 `#ffffff` 或极浅主题色底 |
| 多层径向渐变叠加做深度 | 移除，用品牌色阴影替代深度感 |

### 规则 3：每个主题只有 1 个主色方向

```
主色面积：15-20%（头部、关键按钮、激活态）
辅色面积：60-70%（背景、卡片底色、内容区）
强调色面积：≤ 5%（价格、角标、极小面积点缀）
中性色面积：15-20%（文字、分割线、次要信息）
```

如果一个主题有第二色（如春节的金色），第二色面积严格控制在 5% 以内。

### 规则 4：阴影改为带主题色调的品牌色阴影

| 层级 | 通用公式 |
|------|----------|
| 轻阴影 | `0 4rpx 12rpx rgba(主色RGB, 0.06)` |
| 中阴影 | `0 8rpx 20rpx rgba(主色RGB, 0.08), 0 2rpx 6rpx rgba(0,0,0,0.04)` |
| 重阴影 | `0 12rpx 32rpx rgba(主色RGB, 0.12), 0 4rpx 10rpx rgba(0,0,0,0.06)` |

每个主题用自己的主色 RGB 值填入公式。

### 规则 5：移除所有循环装饰动效

| 动效 | 处理 |
|------|------|
| card-glow-breath（呼吸发光） | ❌ 所有主题移除 |
| particle（粒子效果） | ❌ 所有主题移除 |
| pulse（脉搏动画） | ❌ 所有主题移除 |
| shimmer（骨架屏） | ✅ 保留，降低对比度 |
| fadeIn（渐入） | ✅ 保留，去掉位移只留透明度 |
| hover 上浮 | ✅ 保留，幅度 ≤ 2rpx |
| transition | ✅ 统一 0.2s |

### 规则 6：间距统一放大

| 区域 | 当前值 | 目标值 |
|------|--------|--------|
| 卡片间距 | ~20rpx | 24-32rpx |
| 卡片内边距 | ~20rpx | 28-36rpx |
| 列表项间距 | ~12-16rpx | 20-24rpx |
| 标题与内容 | ~8-12rpx | 16-20rpx |
| 页面水平边距 | ~20rpx | 28-32rpx |
| 区块之间 | ~20rpx | 32-40rpx |

---

## 五、6 套主题逐个重构方案

### 5.0 变化总览

一眼看出每套主题的核心变化：

| 主题 | 头部渐变 | 页面底色 | 卡片背景 | 核心改动 |
|------|----------|----------|----------|----------|
| **default** | 蓝紫 → **暖橙** | 渐变 → **`#faf6f1` 暖米白** | 玻璃拟态 → **`#fff`** | 最大改动：蓝紫色全部清除 |
| **gold_luxury** | 不变 | 渐变 → **`#1a1a2e` 纯深蓝** | 渐变 → **`#232340` 纯深色** | 金色从大面积降为线条/文字 |
| **purple_mystery** | 不变 | 多层渐变 → **`#1a1a3e` 纯深紫** | 渐变 → **`#2a2050` 纯深紫** | 删掉多余紫色层叠 |
| **spring_festival** | 不变 | 红渐变 → **`#fff8f5` 暖白** | 渐变 → **`#fff`** | 红色收缩到头部+按钮 |
| **christmas** | 不变 | 绿渐变 → **`#f0fff5` 浅绿白** | 不变（已是白底） | 红色从副色降到 ≤3% |
| **summer** | 不变 | 蓝渐变 → **`#f0f8ff` 浅蓝白** | 毛玻璃 → **`#fff`** | 青绿色完全移除 |

### 5.1 default（暖橙日常） — 重构力度：大

**核心问题**：背景蓝紫 `#667eea → #764ba2` 和按钮橙色 `#e67e22` 方向完全矛盾。

**重构方向**：统一走暖橙方向，蓝紫色全部移除。

**视觉变化**：从"蓝紫头部 + 橙色按钮"变为"暖橙一体化"，整个页面色温统一。

**CSS 变量变更明细**（改动文件：`utils/global-themes.ts` → `default` 对象）：

| CSS 变量 | 当前值 | 重构值 | 原因 |
|----------|--------|--------|------|
| `--theme-page-start` | `#667eea`（蓝紫） | `#f7931e`（暖橙） | 统一色彩方向 |
| `--theme-page-end` | `#764ba2`（紫色） | `#e67e22`（深橙） | 统一色彩方向 |
| `--theme-primary` | `#e67e22` | `#ff6b35` | 统一为全局主色 `$color-primary`，消除双橙色冲突 |
| `--theme-primary-dark` | `#d35400` | `#e55a2b` | 跟随主色调整 |
| `--theme-accent` | `#ffd700`（金） | 不变（仅小面积） | — |
| `--theme-background` | `#fff8f0` | `#faf6f1`（暖米白） | 更柔和的底色 |
| `--theme-text` | `#333333` | 不变 | — |
| `--theme-text-light` | `#666666` | 不变 | — |
| `--theme-section-bg` | `rgba(255,255,255,0.92)` | `#ffffff` | 去掉半透明 |
| `--theme-item-bg` | `#ffffff` | 不变 | — |
| `--shelf-card-bg` | `#ffffff` | 不变（已是纯色） | — |
| `--shelf-header-bg` | `linear-gradient(135deg, #4ecdc4, #44a08d)`（青绿） | 跟随主题橙色 | 去掉第三色 |
| `--shelf-nav-slider-right` | `linear-gradient(135deg, #667eea, #764ba2)`（蓝紫） | 跟随主题橙色 | 去掉蓝紫残留 |
| `--shelf-accent` | `#667eea`（蓝紫） | `#e67e22`（橙） | 去掉蓝紫残留 |
| `--shelf-accent-light` | `rgba(102,126,234,0.15)` | `rgba(230,126,34,0.15)` | 跟随 accent 变化 |
| `--shelf-tag-hot` | `linear-gradient(135deg, #ff4757, #ff6b81)` | `#ff4757`（纯色） | 标签去渐变 |
| `--shelf-tag-new` | `linear-gradient(135deg, #2ed573, #7bed9f)` | `#2ed573`（纯色） | 标签去渐变 |
| `--shelf-tag-limited` | `linear-gradient(135deg, #7c4dff, #b388ff)` | `#7c4dff`（纯色） | 标签去渐变 |
| `--shelf-cta-bg` | `linear-gradient(135deg, #e67e22, #d35400)` | `#e67e22`（纯色） | CTA 按钮去渐变 |
| `--shelf-price-row-bg` | `linear-gradient(90deg, rgba(255,107,53,0.06), transparent)` | `transparent` | 去渐变 |
| `--shelf-fallback-bg` | `linear-gradient(135deg, #f5f5f5, #e8e8e8)` | `#f5f5f5`（纯色） | 去渐变 |

### 5.2 gold_luxury（金色奢华） — 重构力度：中

**核心问题**：渐变过多，金色面积过大显得廉价。

**重构方向**：保持深色底 + 金色路线，但金色降为线条和文字级别，不做大面积填充。

**视觉变化**：金色从"铺满全身"收缩为"线条 + 文字 + 图标"，深色底更沉稳，奢华感反而上来了。

**CSS 变量变更明细**（改动文件：`utils/global-themes.ts` → `gold_luxury` 对象）：

| CSS 变量 | 当前值 | 重构值 | 原因 |
|----------|--------|--------|------|
| `--theme-page-start` | `#2c3e50` | 不变 | 头部深蓝渐变保留 |
| `--theme-page-end` | `#1a1a2e` | 不变 | — |
| `--theme-primary` | `#f1c40f` | 不变（面积收缩） | 金色降为线条/文字/图标 |
| `--theme-background` | `#1a1a2e` | 不变 | 已是纯色深底 |
| `--theme-section-bg` | `rgba(42,42,78,0.92)` | `#232340`（纯色） | 去半透明 |
| `--theme-item-bg` | `rgba(58,58,94,0.85)` | `#2a2a50`（纯色） | 去半透明 |
| `--shelf-card-bg` | `linear-gradient(145deg, #1a1a2e, #16213e)` | `#232340`（纯色） | 卡片去渐变 |
| `--shelf-card-image-bg` | `linear-gradient(135deg, #1a1a2e, #2a2a4e)` | `#2a2a4e`（纯色） | 去渐变 |
| `--shelf-cta-bg` | `linear-gradient(135deg, #f1c40f, #d4ac0d)` | `#f1c40f`（纯色） | 按钮去渐变 |
| `--shelf-tag-hot` | `linear-gradient(135deg, #ff4757, #ff6b81)` | `#ff4757`（纯色） | 标签去渐变 |
| `--shelf-tag-new` | `linear-gradient(135deg, #2ed573, #7bed9f)` | `#2ed573`（纯色） | 标签去渐变 |
| `--shelf-tag-limited` | `linear-gradient(135deg, #7c4dff, #b388ff)` | `#7c4dff`（纯色） | 标签去渐变 |
| `--shelf-fallback-bg` | `linear-gradient(135deg, #1a1a2e, #2a2a4e)` | `#1a1a2e`（纯色） | 去渐变 |
| `--shelf-header-bg` | `linear-gradient(135deg, #1a1a2e, #16213e)` | `#1a1a2e`（纯色） | 去渐变 |

### 5.3 purple_mystery（紫色神秘） — 重构力度：中

**核心问题**：紫色渐变层数过多，多层叠加后显得浑浊。

**重构方向**：简化为单色深紫背景 + 浅紫卡片，渐变只留头部。

**视觉变化**：从"多层紫色叠在一起变成一坨暗紫"变为"层次清晰的深紫底 + 浅紫卡片"。

**CSS 变量变更明细**（改动文件：`utils/global-themes.ts` → `purple_mystery` 对象）：

| CSS 变量 | 当前值 | 重构值 | 原因 |
|----------|--------|--------|------|
| `--theme-page-start` | `#6c3483` | 不变 | 头部渐变保留 |
| `--theme-page-end` | `#512e5f` | 不变 | — |
| `--theme-primary` | `#9b59b6` | 不变 | — |
| `--theme-background` | `#1a1a3e` | 不变 | 已是纯色 |
| `--theme-section-bg` | `rgba(42,26,94,0.92)` | `#2a2050`（纯色） | 去半透明 |
| `--theme-item-bg` | `rgba(58,42,110,0.85)` | `#322860`（纯色） | 去半透明 |
| `--shelf-card-bg` | `linear-gradient(145deg, #1a1a3e, #16163a)` | `#2a2050`（纯色） | 卡片去渐变 |
| `--shelf-card-image-bg` | `linear-gradient(135deg, #1a1a3e, #2a1a5e)` | `#2a1a5e`（纯色） | 去渐变 |
| `--shelf-cta-bg` | `linear-gradient(135deg, #9b59b6, #6c3483)` | `#9b59b6`（纯色） | 按钮去渐变 |
| `--shelf-tag-hot` | `linear-gradient(135deg, #ff4757, #ff6b81)` | `#ff4757`（纯色） | 标签去渐变 |
| `--shelf-tag-new` | `linear-gradient(135deg, #2ed573, #7bed9f)` | `#2ed573`（纯色） | 标签去渐变 |
| `--shelf-tag-limited` | `linear-gradient(135deg, #9b59b6, #d7bde2)` | `#9b59b6`（纯色） | 标签去渐变 |
| `--shelf-fallback-bg` | `linear-gradient(135deg, #1a1a3e, #2a1a5e)` | `#1a1a3e`（纯色） | 去渐变 |
| `--shelf-header-bg` | `linear-gradient(135deg, #2c1654, #1a0a3e)` | `#2c1654`（纯色） | 去渐变 |

### 5.4 spring_festival（春节红金） — 重构力度：大

**核心问题**：红色面积过大，长时间看视觉疲劳严重。

**重构方向**：大面积用暖白底，红色收缩到头部和按钮，金色只做装饰线。

**视觉变化**：从"满眼红色"变为"白底 + 红色头部/按钮点缀 + 金色极小面积装饰"，喜庆但不刺眼。

**CSS 变量变更明细**（改动文件：`utils/global-themes.ts` → `spring_festival` 对象）：

| CSS 变量 | 当前值 | 重构值 | 原因 |
|----------|--------|--------|------|
| `--theme-page-start` | `#e74c3c` | 不变 | 头部红色保留 |
| `--theme-page-end` | `#c0392b` | 不变 | — |
| `--theme-primary` | `#e74c3c` | 不变（面积收缩） | 收缩到头部 + 按钮 |
| `--theme-background` | `#fff5f5` | `#fff8f5`（更浅暖白） | 红底色再减淡 |
| `--theme-text` | `#c0392b`（红色文字） | `#333333`（深灰） | 正文红色太累眼 |
| `--theme-text-light` | `#e74c3c`（红色） | `#666666`（灰色） | 次要文字不用红 |
| `--theme-section-bg` | `rgba(255,248,248,0.95)` | `#ffffff`（纯白） | 去半透明 + 减红 |
| `--theme-item-bg` | `#ffffff` | 不变 | — |
| `--shelf-card-bg` | `linear-gradient(180deg, #fff5f5, #ffffff)` | `#ffffff`（纯色） | 卡片去渐变 |
| `--shelf-cta-bg` | `linear-gradient(135deg, #e74c3c, #c0392b)` | `#e74c3c`（纯色） | 按钮去渐变 |
| `--shelf-tag-hot` | `linear-gradient(135deg, #e74c3c, #ff6b81)` | `#e74c3c`（纯色） | 标签去渐变 |
| `--shelf-tag-new` | `linear-gradient(135deg, #f1c40f, #ffd700)` | `#f1c40f`（纯色） | 标签去渐变 |
| `--shelf-tag-limited` | `linear-gradient(135deg, #7c4dff, #b388ff)` | `#7c4dff`（纯色） | 标签去渐变 |
| `--shelf-fallback-bg` | `linear-gradient(135deg, #fff5f5, #ffe0e0)` | `#fff5f5`（纯色） | 去渐变 |
| `--shelf-header-bg` | `linear-gradient(135deg, #c0392b, #a93226)` | `#c0392b`（纯色） | 去渐变 |

### 5.5 christmas（圣诞绿红） — 重构力度：大

**核心问题**：绿色和红色撞色处理不当，红绿大面积并存刺眼。

**重构方向**：绿色做主调，红色极小面积做点缀（角标、价格），白色做大面积底色。

**视觉变化**：从"红绿大面积对撞"变为"绿色主调 + 白底 + 红色仅在角标/价格等极小区域出现"。

**CSS 变量变更明细**（改动文件：`utils/global-themes.ts` → `christmas` 对象）：

| CSS 变量 | 当前值 | 重构值 | 原因 |
|----------|--------|--------|------|
| `--theme-page-start` | `#27ae60` | 不变 | 头部绿色保留 |
| `--theme-page-end` | `#1e8449` | 不变 | — |
| `--theme-primary` | `#27ae60` | 不变 | 头部 + 按钮 |
| `--theme-secondary` | `#e74c3c`（红色） | 不变（面积压缩到 ≤3%） | 只做角标/小图标 |
| `--theme-accent` | `#e74c3c`（红色） | `#ffd700`（金色） | 强调色换掉红色 |
| `--theme-accent-dark` | `#c0392b`（红色） | `#b8860b`（金色） | 跟随 accent 变化 |
| `--theme-accent-light` | `#f1948a`（红色） | `#ffe44d`（金色） | 跟随 accent 变化 |
| `--theme-background` | `#f0fff0` | `#f0fff5`（更偏白） | 绿底色减淡 |
| `--theme-text` | `#27ae60`（绿色文字） | `#333333`（深灰） | 正文绿色阅读性差 |
| `--theme-text-light` | `#2ecc71`（绿色） | `#666666`（灰色） | 次要文字不用绿 |
| `--theme-section-bg` | `rgba(240,255,240,0.95)` | `#ffffff`（纯白） | 去半透明 |
| `--theme-item-bg` | `rgba(248,255,248,0.95)` | `#ffffff`（纯白） | 去半透明 |
| `--shelf-nav-slider-right` | `linear-gradient(135deg, #e74c3c, #c0392b)`（红色） | `#27ae60`（绿色纯色，与左滑块同色） | 导航滑块统一主题色，消除红绿撞色 |
| `--shelf-cta-bg` | `linear-gradient(135deg, #27ae60, #1e8449)` | `#27ae60`（纯色） | 按钮去渐变 |
| `--shelf-tag-hot` | `linear-gradient(135deg, #e74c3c, #ff6b81)` | `#e74c3c`（纯色，小面积） | 标签去渐变 |
| `--shelf-tag-new` | `linear-gradient(135deg, #27ae60, #82e0aa)` | `#27ae60`（纯色） | 标签去渐变 |
| `--shelf-tag-limited` | `linear-gradient(135deg, #7c4dff, #b388ff)` | `#7c4dff`（纯色） | 标签去渐变 |
| `--shelf-fallback-bg` | `linear-gradient(135deg, #f0fff0, #e8f8e8)` | `#f0fff0`（纯色） | 去渐变 |
| `--shelf-header-bg` | `linear-gradient(135deg, #27ae60, #1e8449)` | `#27ae60`（纯色） | 去渐变 |
| `--shelf-price-row-bg` | `linear-gradient(90deg, rgba(39,174,96,0.06), transparent)` | `transparent` | 去渐变 |

### 5.6 summer（夏日蓝） — 重构力度：中

**核心问题**：蓝 `#3498db` 和青绿 `#1abc9c` 两个冷色竞争，方向模糊。并且兑换卡片使用了毛玻璃 `rgba(255,255,255,0.78)` + border。

**重构方向**：统一走清爽蓝，青绿色去掉。

**视觉变化**：从"蓝 + 青绿双色模糊"变为"纯蓝一个方向"，清爽感更强。

**CSS 变量变更明细**（改动文件：`utils/global-themes.ts` → `summer` 对象）：

| CSS 变量 | 当前值 | 重构值 | 原因 |
|----------|--------|--------|------|
| `--theme-page-start` | `#3498db` | 不变 | 头部蓝色保留 |
| `--theme-page-end` | `#2471a3` | 不变 | — |
| `--theme-primary` | `#3498db` | 不变 | — |
| `--theme-secondary` | `#1abc9c`（青绿） | ❌ 移除 | 不再使用第二色 |
| `--theme-secondary-dark` | `#148f77`（青绿） | 蓝色系替代 `#2471a3` | 统一蓝色方向 |
| `--theme-secondary-light` | `#48c9b0`（青绿） | 蓝色系替代 `#5dade2` | 统一蓝色方向 |
| `--theme-section-bg` | `rgba(240,248,255,0.95)` | `#ffffff`（纯白） | 去半透明 |
| `--theme-item-bg` | `#ffffff` | 不变 | — |
| `--shelf-card-bg` | `rgba(255,255,255,0.78)`（毛玻璃） | `#ffffff`（纯白） | 去玻璃拟态 |
| `--shelf-card-border` | `1rpx solid rgba(255,255,255,0.6)` | `none` | 配合去玻璃 |
| `--shelf-card-image-bg` | `linear-gradient(135deg, #e8f4fd, #f0f8ff)` | `#f0f8ff`（纯色） | 去渐变 |
| `--shelf-nav-slider-right` | `linear-gradient(135deg, #1abc9c, #16a085)`（青绿） | `#3498db`（蓝色纯色，与左滑块同色） | 导航滑块统一主题色，消除蓝绿撞色 |
| `--shelf-cta-bg` | `linear-gradient(135deg, #3498db, #2471a3)` | `#3498db`（纯色） | 按钮去渐变 |
| `--shelf-tag-hot` | `linear-gradient(135deg, #ff4757, #ff6b81)` | `#ff4757`（纯色） | 标签去渐变 |
| `--shelf-tag-new` | `linear-gradient(135deg, #3498db, #85c1e9)` | `#3498db`（纯色） | 标签去渐变 |
| `--shelf-tag-limited` | `linear-gradient(135deg, #7c4dff, #b388ff)` | `#7c4dff`（纯色） | 标签去渐变 |
| `--shelf-fallback-bg` | `linear-gradient(135deg, #f0f8ff, #e8f4fd)` | `#f0f8ff`（纯色） | 去渐变 |
| `--shelf-header-bg` | `linear-gradient(135deg, #3498db, #2980b9)` | `#3498db`（纯色） | 去渐变 |
| `--shelf-price-row-bg` | `linear-gradient(90deg, rgba(52,152,219,0.06), transparent)` | `transparent` | 去渐变 |

### 5.7 全主题共性改动汇总

以下变量在 **6 套主题中全部按统一规则处理**，不分主题单独豁免：

| 变量类别 | 统一改法 | 涉及变量 |
|----------|----------|----------|
| 标签渐变 | 全部改纯色 | `--shelf-tag-hot`、`--shelf-tag-new`、`--shelf-tag-limited` |
| CTA 按钮 | 渐变改纯色 | `--shelf-cta-bg` |
| 价格行背景 | 渐变改透明 | `--shelf-price-row-bg` |
| 兜底背景 | 渐变改纯色 | `--shelf-fallback-bg` |
| 货架头部 | 渐变改纯色 | `--shelf-header-bg` |
| 内容区背景 | `rgba(...)` 改纯色 | `--theme-section-bg`、`--theme-item-bg` |
| 卡片背景 | 玻璃拟态/渐变改纯色 | `--shelf-card-bg`、`--shelf-card-image-bg` |

---

## 六、视觉资产设计方案（批次 6）

### 6.1 行业调研：各类公司怎么做的

#### 头部背景纹理 — 行业做法

| 类型 | 代表 | 头部做法 | 是否有纹理 |
|------|------|----------|-----------|
| 大厂 App | 美团、支付宝、京东 | 纯色或简单渐变，无纹理 | 不用 |
| 大厂小程序 | 美团外卖、京东购物 | 纯色头部，内容区白底 | 不用 |
| 游戏交易平台 | BUFF、交易猫、5173 | 纯色/单渐变头部，内容白底 | 不用 |
| 游戏 App | 原神、王者荣耀 | 游戏内才用纹理/粒子，设置页/商城页无纹理 | 仅游戏场景 |
| 活动策划 H5 | 各种抽奖/红包活动 | 活动页有氛围纹理，常规页面不用 | 仅活动页 |
| 二手平台 | 闲鱼、转转 | 纯白底 + 绿/蓝头部纯色 | 不用 |

**结论**：头部纹理在常规页面几乎没人用。纹理只出现在活动营销页和游戏沉浸场景。

#### 功能菜单图标 — 行业做法

| 类型 | 代表 | 图标方案 | 技术实现 |
|------|------|----------|----------|
| 大厂 | 美团、支付宝、微信 | 自有设计团队出整套图标 | Iconfont（字体图标，Base64 嵌入） |
| 中厂 | 饿了么、哈啰 | 阿里 iconfont 平台 + 定制 | Iconfont |
| 小公司 | 大量小程序 | 阿里 iconfont 平台选图标 | Iconfont 或 PNG |
| 游戏交易 | BUFF、交易猫 | 统一线性图标集 | Iconfont / SVG |
| 低成本 | 模板小程序 | emoji | text 标签直接渲染 |

**结论**：没有任何正式上线的商业产品用 emoji 做菜单图标。emoji 是原型/demo 阶段的占位符。正式产品最低标准是 iconfont。

#### Tab 底部导航 — 行业做法

| 类型 | 代表 | Tab 方案 | 是否跟主题变色 |
|------|------|----------|---------------|
| 大厂 | 美团、京东、淘宝 | 原生 tabBar | 不变色（品牌色固定） |
| 游戏交易 | BUFF、交易猫 | 原生 tabBar | 不变色 |
| 主题型产品 | QQ（皮肤）、微博（夜间模式） | 自定义 tabBar | 跟主题变色 |
| 节日运营 | 支付宝（春节/双十一） | 自定义 tabBar | 活动期间临时换图标 |
| 二手平台 | 闲鱼、转转 | 原生 tabBar（闲鱼中间 + 号自定义） | 不变色 |

**结论**：只有品牌色固定不变的产品用原生 tabBar；有主题/皮肤/节日换肤需求的产品一定用自定义 tabBar。本项目有 6 套主题 → 自定义 tabBar 是必然选择。

#### 图标技术方案对比（微信小程序环境）

| 维度 | Iconfont（字体图标） | SVG 文件 | PNG 图片 | Emoji（当前） |
|------|---------------------|----------|----------|---------------|
| 小程序兼容性 | 最好 | 需用 image 组件 | 最稳 | 不同设备显示不一致 |
| 主题换色 | CSS `color` 一行搞定 | 需正则替换 fill 属性 | 每色一张图 | 不可能 |
| 包体积 | 一个字体文件包全部图标 | 每个图标一个文件 | 每个图标一张图 | 零（但质量也是零） |
| 6 套主题适配 | `color: var(--theme-primary)` 自动跟主题 | 需额外处理 | 需 6×N 张图 | 不支持 |
| 长期维护 | 阿里 iconfont 平台管理，团队可协作 | 手工管理文件 | 手工管理文件 | — |
| 性能 | 本质是文字，渲染性能最佳 | 节点多，渲染略差 | 性能稳定 | — |

### 6.2 方案决策（已定）

基于行业调研和项目实际情况（6 套后端控制主题、未上线无旧接口包袱、追求低长期维护成本），做出以下决策：

| 决策项 | 方案 | 理由 |
|--------|------|------|
| **头部纹理** | **暂不实施** | 行业无先例，增加 6 主题维护成本，与"做减法"方向矛盾。后续如需质感由设计师出头部背景图 |
| **菜单图标** | **Iconfont（Base64 嵌入）** | 兼容性最好，`color` 属性直接跟主题变色，零额外文件 |
| **Tab 方案** | **自定义 tabBar + Iconfont** | 6 套主题必须自定义 tabBar 才能主题化，图标和菜单共用一套 iconfont 字体 |
| **Tab 主题变色** | **做**（跟主题走） | 已选自定义 tabBar，变色是零额外成本 |

**一句话总结**：全部用 Iconfont，菜单图标和 Tab 图标共用一个 Base64 字体文件，自定义 tabBar 让 Tab 也跟主题变色，头部纹理不加。整个图标系统只有一个字体文件，6 套主题通过 CSS 变量自动适配，长期维护成本最低。

### 6.3 现状诊断

| 资产类型 | 当前实现 | 问题 | 决策 |
|----------|----------|------|------|
| 功能菜单图标 | **emoji 字符**（💰📦🛒📋📊🧾📢📞🚪） | 不同设备显示不一致，廉价感严重 | → Iconfont 替换 |
| Tab 图标 | 原生 tabBar + PNG 图片 4 组 8 张 | 不跟主题变色，无法主题化 | → 自定义 tabBar + Iconfont |
| 空状态 | emoji + 纯文字（组件 `empty-state`） | 没有插画，观感简陋 | → SVG 插画 |
| 排行榜装饰 | CSS 实现 | 缺少皇冠/奖牌等辨识元素 | → SVG 奖牌 |
| 头部背景 | 纯 CSS 渐变 | — | → 暂不加纹理 |

**功能菜单用 emoji 做图标是"塑料感"的重要来源之一**。

### 6.4 统一设计语言规范

所有视觉资产遵循同一套规范，确保从 Tab 到菜单到空状态"看起来像同一个人画的"：

```
图标技术：Iconfont（Base64 WOFF 嵌入 app.wxss）
线条粗细：2px（全局统一）
端点样式：圆角（round cap / round join）
填充方式：普通态 — 线性描边（空心）；激活态 — 填充（实心）
色彩来源：CSS 变量 var(--theme-primary)，自动跟 6 套主题变色
最大用色数：每个图标 ≤ 2 色（主色 + 透明）
风格：扁平、几何、无光泽、无 3D、无渐变
```

### 6.5 Cursor 可独立完成 vs 需设计师的分类

| 资产 | Cursor 可做 | 需设计师 | 说明 |
|------|-------------|----------|------|
| 功能菜单图标（10 个） | ✅ | — | 从 iconfont.cn 选取统一风格图标集 |
| 自定义 tabBar 组件 | ✅ | — | `custom-tab-bar/` 官方方案 |
| Tab 图标（4 个） | ✅ | — | Iconfont，与菜单共用一个字体文件 |
| 排行榜皇冠/奖牌（3 个） | ✅ | — | 手写 SVG，简单几何图形 |
| 空状态插画（3-4 张） | ✅ | — | SVG 简笔线条画 |
| 品牌吉祥物/角色形象 | — | ✅ | 需要独特品牌辨识度 |
| VIP 卡片背景（金属质感） | — | ✅ | 需要位图光影纹理 |
| 品牌加载动画（Lottie） | — | ✅ | 需 After Effects + Bodymovin |

### 6.6 功能菜单图标方案（Iconfont 替换 emoji）

**当前**：`icon: '💰'` + `style="background: {{item.color}}"` 圆形色底

**改为**：Iconfont 字体图标 + 保留圆形色底（CSS 实现）

**技术实现步骤**：

1. 去 [iconfont.cn](https://www.iconfont.cn) 创建项目，选 10 个线性图标（用"线性"标签筛选，确保风格统一）
2. 下载为 Base64 格式的 WOFF 字体文件
3. 嵌入到 `app.wxss` 的 `@font-face` 中
4. `pages/user/user.ts` — `menuItems` 的 `icon` 字段从 emoji 改为 iconfont class 名
5. `pages/user/user.wxml` — `<text>{{item.icon}}</text>` 改为 `<text class="iconfont {{item.iconClass}}"></text>`
6. 商家区域的 emoji（📱💰✅）同步替换

**代码改动范围**：

| 文件 | 改动 |
|------|------|
| `app.wxss` | 新增 `@font-face` + `.iconfont` 基础样式 |
| `pages/user/user.ts` | `menuItems` 的 `icon` 字段改为 iconfont class |
| `pages/user/user.wxml` | `<text>` 渲染方式改为 iconfont |
| `pages/user/user.scss` | 图标样式调整（`font-size` 替代固定尺寸） |

**图标映射表**：

| 功能 | 当前 emoji | Iconfont 图标描述 | 底色 |
|------|-----------|------------------|------|
| 积分明细 | 💰 | 圆形硬币 + 上箭头（收支含义） | `#4CAF50` 绿 |
| 我的背包 | 📦 | 背包/箱子轮廓 | `#00BCD4` 青 |
| 兑换订单 | 🛒 | 购物袋轮廓 | `#667eea` 蓝紫 |
| 市场挂单 | 📋 | 价签 + 上架箭头 | `#FF9800` 橙 |
| 交易记录 | 📊 | 折线图轮廓 | `#3F51B5` 靛蓝 |
| 消费记录 | 🧾 | 账单/收据轮廓 | `#9C27B0` 紫 |
| 广告管理 | 📢 | 喇叭/扩音器轮廓 | `#FF6B35` 橙 |
| 客服工单 | 📋 | 对话气泡 + 扳手 | `#795548` 棕 |
| 在线客服 | 📞 | 耳机/话筒轮廓 | `#607D8B` 灰蓝 |
| 退出登录 | 🚪 | 门 + 右箭头 | `#F44336` 红 |

图标渲染尺寸：48rpx，线条白色 `#ffffff`（在色底上显示为白色线条图标）。主题色自动跟随 `var(--theme-primary)`。

### 6.7 自定义 tabBar + Iconfont 方案（替代原生 tabBar）

**当前方案**：原生 tabBar + 8 张 PNG 图标，`selectedColor` 固定为 `#FF6B35`，不跟主题变色。

**改为**：自定义 tabBar 组件 + Iconfont 字体图标，图标/文字颜色跟主题走。

**为什么必须改**：

| 原生 tabBar | 自定义 tabBar |
|------------|--------------|
| `selectedColor` 只能设一个固定色 | `color: var(--theme-primary)` 跟 6 套主题走 |
| 强制 PNG 81×81px，8 张图 | Iconfont，和菜单图标共用一套字体文件 |
| 改图标 = 换 8 张 PNG 文件 | 改图标 = 改一个 unicode 字符 |
| 如果后续要主题化 Tab 必须重写 | 一步到位，零技术债 |

**技术实现步骤**：

1. 创建 `custom-tab-bar/` 目录（微信官方约定路径）
2. `app.json` 的 `tabBar` 加 `"custom": true`（保留原配置做降级兜底）
3. 自定义组件内使用 Iconfont 渲染图标（和菜单图标共用同一个字体文件）
4. 图标色和文字色读 CSS 变量：未选中 `#999999`，选中 `var(--theme-primary)`
5. 每个 tab 页 `onShow` 中调用 `this.getTabBar().setData({ selected: N })` 同步选中态
6. 删掉 `images/icons/` 下的 8 张 PNG（减少包体积）

**代码改动范围**：

| 文件 | 改动 |
|------|------|
| `custom-tab-bar/index.ts` | 新增：自定义 tabBar 组件逻辑 |
| `custom-tab-bar/index.wxml` | 新增：自定义 tabBar 模板 |
| `custom-tab-bar/index.scss` | 新增：自定义 tabBar 样式 |
| `custom-tab-bar/index.json` | 新增：`{ "component": true }` |
| `app.json` | tabBar 加 `"custom": true` |
| `pages/lottery/lottery.ts` | onShow 加 `getTabBar().setData({ selected: 0 })` |
| `pages/camera/camera.ts` | onShow 加 `getTabBar().setData({ selected: 1 })` |
| `pages/exchange/exchange.ts` | onShow 加 `getTabBar().setData({ selected: 2 })` |
| `pages/user/user.ts` | onShow 加 `getTabBar().setData({ selected: 3 })` |
| `images/icons/*.png` | 删除 8 张 PNG 图标文件 |

**Tab 图标映射表**：

| Tab | 图标描述 | 未选中 | 选中 |
|-----|----------|--------|------|
| 抽奖 | 转盘 | 灰色 `#999999` | `var(--theme-primary)` 跟主题 |
| 发现 | 指南针 | 灰色 `#999999` | `var(--theme-primary)` 跟主题 |
| 商城 | 商店门面轮廓 | 灰色 `#999999` | `var(--theme-primary)` 跟主题 |
| 我的 | 人物头像轮廓 | 灰色 `#999999` | `var(--theme-primary)` 跟主题 |

**防闪烁要点**（基于微信官方最佳实践）：
- 不在 `custom-tab-bar` 的 `switchTab` 方法内调用 `this.setData()`
- 选中态更新统一由各 tab 页面的 `onShow` 驱动
- 使用绝对路径：`wx.switchTab({ url: '/pages/lottery/lottery' })`

### 6.8 排行榜皇冠/奖牌设计方案（3 个 SVG）

**存放路径**：`images/icons/rank/`

| 名次 | 元素 | 主色 | 辅助色（阴影层） | 尺寸 |
|------|------|------|------------------|------|
| 第 1 名 | 皇冠（三尖顶 + 底座弧线） | 金 `#FFD700` | 深金 `#DAA520` | 64rpx × 64rpx |
| 第 2 名 | 圆形奖牌 + "2" 数字 | 银 `#C0C0C0` | 深灰 `#A9A9A9` | 64rpx × 64rpx |
| 第 3 名 | 圆形奖牌 + "3" 数字 | 铜 `#CD7F32` | 深棕 `#8B4513` | 64rpx × 64rpx |

风格：扁平化，纯色 + 一层深色做简单层次，不加光泽、不加 3D 效果。

### 6.9 头部背景纹理 — 暂不实施

~~不需要图片文件，用 CSS 在头部渐变之上叠加一层极低透明度的几何图案。~~

**决策：暂不实施**。原因如下：

| 考量 | 分析 |
|------|------|
| 行业惯例 | 美团/京东/BUFF/交易猫/闲鱼等同类产品均无头部纹理 |
| 6 套主题维护 | 纹理 × 6 主题 = 透明度/对比度需逐主题调参，维护成本翻倍 |
| 减法原则 | 本方案核心方向是"做减法"，不应一边砍特效一边加新纹理 |
| 真正的质感来源 | 参考图的质感来自定制插画/品牌图形，不是 CSS 图案 |

**后续路径**：如确实需要头部质感，正确做法是让设计师出 6 张头部背景图（每主题一张），用 `background-image` 替换纯色渐变。代码层面已预留 `--theme-page-start/end` 变量，改为图片路径即可。

### 6.10 空状态插画设计方案（3-4 张 SVG）

**当前**：`<text class="empty-icon">{{icon}}</text>` + 纯文字

**改为**：SVG 插画 + 文字标题 + 可选副标题 + 可选按钮

**存放路径**：`images/empty/`

| 场景 | 文件名 | 画面描述 | 配色 |
|------|--------|----------|------|
| 无数据 | `empty-data.svg` | 一个打开的空盒子，旁边几颗散落的星星 | 主题色浅色调 + 灰 |
| 无网络 | `empty-network.svg` | 一朵断开的云（虚线断裂）+ 叉号 | 灰色 + 主题色点缀 |
| 搜索无结果 | `empty-search.svg` | 放大镜下方是空白区域 + 问号 | 灰色 + 主题色点缀 |
| 无订单 | `empty-order.svg` | 一张空白的订单纸 + 一支斜放的笔 | 主题色浅色调 + 灰 |

尺寸：240rpx × 240rpx。风格：极简线条画，线条粗细和功能图标统一（2px），不超过 3 种颜色。

### 6.11 Cursor 暂不能做的资产（需设计师后续补充）

| 资产 | 原因 | 建议 |
|------|------|------|
| 品牌吉祥物/角色形象 | 需要独特品牌辨识度，手写 SVG 做不出"灵魂" | 委托插画师 |
| VIP 卡片背景（金属/光泽质感） | 需要位图级别的光影纹理 | 设计师出图，Cursor 接入代码 |
| 品牌加载动画（Lottie） | 需要 After Effects + Bodymovin 插件 | 动效设计师出 JSON，Cursor 集成 `lottie-miniprogram` |

> 批次 6 分两步执行：Cursor 先完成 6.6-6.10 的资产和自定义 tabBar 改造，设计师后续补充 6.11 的资产。代码层面只需换图片路径，结构不用动。

---

## 七、核心结论

### 一句话诊断

项目的 CSS 工程化能力是到位的（Token 系统、Mixin、6 套主题切换、暗色模式都做了），但问题出在**设计决策层面** — 给了太多选择、叠了太多特效、功能图标用 emoji、缺少定制视觉资产。

### 改进方向

**做减法 + 加资产**

```
减法（Cursor 独立完成，批次 1-5）：
  - 渐变数量：8+ 种/主题 → 仅头部 1 处
  - 玻璃拟态：全局使用 → 全部移除
  - 副色竞争：2-3 个方向/主题 → 严格 1 主色 + ≤5% 强调色
  - 循环动效：5 种 → 0 种
  - 阴影：通用黑色 → 品牌色阴影
  - 间距：偏紧凑 → 放大 30-50%

加法（Cursor 可做部分，批次 6-7）：
  + 功能菜单 Iconfont（替换 emoji）            ← Cursor
  + 自定义 tabBar + Iconfont（替换原生 tabBar） ← Cursor
  + 排行榜皇冠/奖牌 SVG                        ← Cursor
  + 空状态 SVG 插画                             ← Cursor
  + 品牌吉祥物 / VIP 背景 / Lottie             ← 设计师

不做：
  × 头部 CSS 纹理 — 行业无先例，6 主题维护成本高，暂不实施
```

### 执行批次总览（最终版）

| 批次 | 内容 | Cursor 独立 | 工作量 |
|------|------|-------------|--------|
| **1** | 全局基础变量重构（色彩 + 阴影 + 间距 + transition） | ✅ | 中 |
| **2** | 6 套主题色值重构（`utils/global-themes.ts`） | ✅ | 大 |
| **3** | 全项目去渐变化 | ✅ | 中 |
| **4** | 动效清理（页面级装饰动效，不动游戏特效） | ✅ | 低 |
| **5** | 间距优化 | ✅ | 低 |
| **6** | Iconfont 图标系统（菜单图标 + 自定义 tabBar + 排行榜奖牌 + 空状态插画） | ✅ | 中 |
| **7** | 设计师补充资产（吉祥物、VIP 背景、Lottie 加载动画） | ⚠️ 需设计师 | — |

### 关键技术决策记录

| 决策项 | 方案 | 决策依据 |
|--------|------|----------|
| 菜单图标 | Iconfont（Base64 WOFF 嵌入） | 微信小程序兼容性最好，CSS color 直接跟主题变色 |
| Tab 导航 | 自定义 tabBar + Iconfont | 6 套主题必须自定义 tabBar，与菜单共用一个字体文件 |
| Tab 主题变色 | 做（跟主题走） | 已选自定义 tabBar，变色零额外成本 |
| 头部纹理 | 暂不实施 | 行业无先例，维护成本高，与减法方向矛盾 |
| 图标技术栈 | 统一 Iconfont | 菜单 + Tab + 商家区 emoji 全部用同一个字体文件 |

### 参考设计中最值得学习的三点

1. **克制** — 好设计不是堆特效，而是在对的位置用对的手法
2. **统一** — 一个页面只有一个视觉焦点，一套色彩只有一个主调
3. **资产** — 真正的质感来自定制视觉元素，不是 emoji 和 CSS 渐变

---

*本文档基于对项目完整样式系统（variables.scss、mixins.scss、global-themes.ts、各页面 SCSS、组件样式）的深度分析，结合三套参考设计图的对比评审和行业调研生成。*  
*最后更新：2026年3月20日*
