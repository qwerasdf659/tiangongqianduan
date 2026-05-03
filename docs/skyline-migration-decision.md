# Skyline vs WebView 全面决策分析

> 项目：天工餐厅积分系统 v5.2  
> 日期：2026-04-30  
> 状态：✅ 已确认——全量 Skyline + Worklet/手势一期全做，不分阶段

---

## 一、Skyline 比 WebView 好在哪

### 1. 页面切换不白屏

WebView 下每个页面是一个独立的 WebView 实例，切换页面时会有短暂白屏（新 WebView 初始化 + 页面渲染）。Skyline 所有页面共享同一个渲染线程，切换时可以做到无缝过渡，支持共享元素动画（shared-element transition），类似原生 App 的体验。

### 2. 长列表性能

WebView 下长列表（比如交易市场、商品列表）滚动到几百条数据时会卡顿，因为 DOM 节点全部保留在内存里。Skyline 内置了组件级别的按需渲染，只渲染可视区域的节点，滚动性能接近原生。

### 3. Worklet 动画

WebView 的动画走的是 JS → 逻辑层 → 渲染层 的通信链路，每帧都有跨线程开销，复杂动画容易掉帧。Skyline 支持 Worklet 动画，动画逻辑直接跑在渲染线程上，不经过逻辑层，可以稳定 60fps。对抽奖游戏（转盘、弹珠、扭蛋）理论上有明显提升。

### 4. 手势系统

WebView 下手势处理要经过逻辑层中转，响应延迟大约 16-32ms。Skyline 提供了原生手势系统（tap、pan、pinch、long-press），直接在渲染线程处理，响应更快、不丢帧。对 DIY 设计器（拖拽、缩放）和刮刮卡这类交互密集的场景有用。

### 5. 内存占用更低

WebView 模式下每个页面栈里的页面都是一个独立 WebView，5 个页面 = 5 个 WebView 实例，内存占用高。Skyline 共享渲染线程，内存占用大约能降低 30%-50%。

### 6. 更一致的跨平台表现

WebView 在 iOS 用 WKWebView，Android 用 Chromium 内核，CSS 渲染行为有差异（比如 flex 布局、border-radius 裁剪、字体渲染）。Skyline 用自研渲染引擎，iOS 和 Android 表现一致。

---

## 二、Skyline 的明确短板

| 短板 | 说明 |
|---|---|
| CSS 支持不完整 | 部分选择器（后代选择器、通配符）、部分属性（position: sticky 行为不同）受限 |
| Canvas 差异大 | 不支持旧的 `wx.createCanvasContext`，必须用 Canvas 2D |
| 第三方库兼容性 | 很多老库假设 WebView 环境，在 Skyline 下可能出问题 |
| 调试工具不如 WebView 成熟 | WebView 可以用 Chrome DevTools，Skyline 的调试体验还在追赶 |
| 迁移成本 | 不是开个开关就行，样式、Canvas、动画代码都可能要改 |

---

## 三、2026 年行业实际做法（按公司类型分类）

### 3.1 互联网大厂

| 公司 | 小程序技术方案 | Skyline 状态 | 策略 |
|---|---|---|---|
| **京东购物** | 原生小程序 + TypeScript | ✅ 已上线 | 微信官方 Skyline 标杆案例。商品列表滚动帧率 60fps，冷启动从 4800ms 降到 2500ms。渐进式迁移，核心链路先上，AB 实验灰度放量。打开率从 86% 提升到 90%+，每天减少近百万用户流失。 |
| **同程旅行** | 原生小程序 | ✅ 已上线 | 2024 微信公开课"Skyline 最佳实践"案例。酒店相册页用了自定义路由 + 手势系统 + 共享元素动画。选择性迁移，只在交互密集页面用 Skyline。 |
| **朴朴超市** | 原生小程序 | ✅ 已上线 | 微信官方展示案例，长列表购物场景。核心购物链路迁移。 |
| **有赞** | 原生小程序 | ✅ 已上线 | 电商 SaaS，接入 Skyline 实现首帧无白屏、秒级直出。渐进式接入，预加载首屏数据 + 路由动画优化。 |
| **腾讯频道** | 原生小程序 | ✅ 全量 Skyline | 微信自家产品，全量使用 Skyline。 |
| **美团** | 原生小程序 + 微服务后端 | ⚠️ 评估中 | 2026 年重点在后端架构（微服务 + 云原生 + AIOps），前端小程序正在评估 Skyline。美团技术博客提到"尝试新的渲染引擎 Skyline"作为下一步优化方向。预加载优化页面切换已做到 <300ms。 |
| **阿里巴巴（1688）** | 原生小程序 → Taro 迁移中 | ⚠️ 关注中 | 2025 年 4 月技术文章披露：1688 微信小程序目前用原生 DSL 开发，正在迁移到 Taro（React）跨端方案。文中提到"微信类小程序还最新提供了 Skyline 渲染引擎，使得体验更接近 native"，但当前优先级是跨端化（投放支付宝、抖音）。 |
| **大众点评** | Qwik.js（M 站）/ 原生小程序 | — | 2026 年 3 月用 Qwik.js 重构 M 站，小程序端暂无 Skyline 公开信息。 |

### 3.2 餐饮品牌

| 品牌 | 小程序技术方案 | Skyline 状态 | 说明 |
|---|---|---|---|
| **喜茶** | 原生小程序 / 第三方 SaaS | ❌ WebView | 核心是点单 + 会员 + 优惠券，交互简单，无 Skyline 需求。页面以表单和列表为主。 |
| **瑞幸咖啡** | 原生小程序 | ❌ WebView | 同上，点单流程为主。瑞幸的技术投入集中在后端（高并发订单系统、推荐算法）。 |
| **塔斯汀** | 原生小程序 / 第三方 SaaS | ❌ WebView | 中式汉堡品牌，小程序以点单为核心，技术方案偏保守，使用第三方 SaaS 居多。 |
| **霸王茶姬** | 原生小程序 | ❌ WebView | 茶饮品牌，小程序功能与喜茶类似（点单 + 会员），无复杂交互场景。 |
| **麦当劳/肯德基** | 原生小程序 | ❌ WebView | 大型连锁，小程序成熟稳定，迁移风险大于收益，暂无 Skyline 计划。 |

> **餐饮行业结论：** 餐饮品牌的小程序核心是点单流程，交互简单（列表 + 表单 + 支付），Skyline 的优势（动画、手势、长列表）对它们价值不大。但你的项目不是纯点单——你有抽奖游戏、DIY 设计器、交易市场，这些场景远比点单复杂。

### 3.3 游戏公司

| 公司/产品 | 技术方案 | 说明 |
|---|---|---|
| **微信小游戏生态** | 小游戏框架（非小程序） | 游戏公司做的是"小游戏"而非"小程序"。小游戏有自己的 Canvas/WebGL 渲染管线，不走 Skyline。微信 2026 年春节活动用的是小游戏圈（GameClub）+ 活跃任务 + 抽奖组件。 |
| **腾讯游戏** | 小游戏 + 游戏圈 | 游戏内社区用游戏圈组件，支持礼包、签到、抽奖、创作任务。不是小程序。 |
| **三七互娱/网易** | 原生 App + 小游戏 | 核心游戏是原生 App，营销活动用小游戏或 H5。不涉及小程序 Skyline。 |

> **游戏行业结论：** 游戏公司做的是"小游戏"（Canvas/WebGL），不是"小程序"。你的项目是小程序里做游戏化交互，这是一个独特的定位——用 Skyline 的 Worklet 动画 + 手势系统来实现类游戏体验，而不是做一个真正的小游戏。

### 3.4 活动策划 / 营销平台

| 平台 | 技术方案 | 说明 |
|---|---|---|
| **凡科互动** | SaaS 模板化 | 提供在线抽奖小程序模板，无需开发。底层是 WebView，模板化生成。2026 年指南仍推荐 WebView 方案。 |
| **一品威客** | 外包开发 | 推荐微信原生 / Taro / uni-app 开发抽奖小程序。技术选型偏保守，未提及 Skyline。 |
| **微信官方活动组件** | 游戏圈活跃任务 | 微信自己的活动系统（抽奖、签到、礼包）是内置组件，不需要开发者选择渲染引擎。 |
| **自研活动平台** | 原生小程序 | 有技术能力的公司自研，部分已开始用 Skyline 做转盘、刮刮卡等互动游戏。 |

> **活动策划行业结论：** SaaS 平台和外包公司还在 WebView，因为它们要兼容最广泛的客户。但自研团队已经开始用 Skyline 做互动游戏，因为动画体验差距明显。

### 3.5 游戏虚拟物品交易 / 小众二手平台

| 平台类型 | 技术方案 | 说明 |
|---|---|---|
| **闲鱼** | 原生 App（Flutter）为主，小程序为辅 | 闲鱼核心是 App，小程序是引流入口。小程序用原生开发，暂无 Skyline 公开信息。 |
| **得物（毒）** | 原生 App 为主 | 潮品交易平台，小程序是辅助渠道。 |
| **转转** | 原生 App + 小程序 | 二手交易，小程序用原生开发，WebView 渲染。 |
| **游戏账号交易平台** | SSM/SpringBoot + 原生小程序 WebView | 毕设级项目居多，技术栈老旧（Java + MySQL + 原生小程序）。无 Skyline。 |
| **电竞护航/游侠工单** | Uni-app + ThinkPHP | 跨端方案，PHP 后端。选择 Uni-app 是为了多端发布（小程序 + App + H5）。无 Skyline。 |
| **校园二手书商城** | 微信云开发（CloudBase） | 轻量级方案，云函数 + 云数据库 + 原生小程序。WebView 渲染。 |
| **2026 年二手平台行业趋势** | 原生小程序 / uni-app | 据艾瑞咨询，2026 年中国二手交易市场规模达 1.2 万亿元。技术选型建议仍以原生或 uni-app 为主，未提及 Skyline。 |

> **交易平台行业结论：** 这个领域几乎没有人用 Skyline。原因很简单——交易平台的核心是信任体系、支付流程、物流跟踪，不是动画和手势。但你的项目不一样：你有 14 种抽奖游戏 + DIY 设计器 + 实时拍卖，这些场景的交互密度远超普通交易平台。

### 3.6 各方案对比总结

| 方案 | 代表公司 | 适用场景 | 长期维护成本 | 性能天花板 |
|---|---|---|---|---|
| **全量 Skyline** | 腾讯频道、Skyline UI 开源社区 | 新项目、交互密集、追求原生体验 | 低（一套方案） | 接近原生 |
| **渐进式 Skyline** | 京东、同程、有赞 | 已上线大型项目、不能冒险 | 中（两套方案并存） | 核心页面接近原生 |
| **纯 WebView** | 喜茶、塔斯汀、大部分交易平台 | 简单交互、表单列表为主 | 低（但性能有天花板） | Web 级别 |
| **Taro/uni-app 跨端** | 1688、电竞护航 | 需要多端发布（微信+支付宝+抖音+App） | 中（框架抽象层开销） | 受框架限制 |
| **微信云开发** | 校园二手书商城 | 轻量级、无后端团队 | 低（但扩展性差） | Web 级别 |
| **小游戏** | 腾讯游戏、三七互娱 | 纯游戏场景 | 高（独立技术栈） | 游戏级别 |

---

## 四、本项目现状扫描

| 维度 | 现状 | Skyline 兼容性 |
|---|---|---|
| 组件框架 | `glass-easel` | ✅ 已满足前置条件 |
| 基础库 | 3.15.0 | ✅ 远超最低要求 2.30.4 |
| Canvas | 全部用 Canvas 2D | ✅ 无旧 API |
| `wx.createAnimation` | 未使用 | ✅ 无需适配 |
| Worklet | 未使用，`compileWorklet: false` | ⚠️ 需开启 |
| CSS 动画 | 50+ @keyframes | ✅ Skyline 支持 |
| Touch 事件 | scratch、whackmole、exchange 卡片 | ⚠️ 建议改用手势系统 |
| Gesture API | 未使用 | ⚠️ 建议引入 |
| `position: sticky` | 5 个文件 | ⚠️ 需适配 |
| 后代选择器 | 大量使用（`.parent text {}` 模式） | ❌ 需批量替换 |
| 通配符 `*` | 无 | ✅ |
| scroll-view | 30+ 文件 | ✅ |
| `skylineRenderEnable` | `false` | ⚠️ 需开启 |
| 状态管理 | MobX | ✅ 无影响 |
| 实时通信 | Socket.IO | ✅ 无影响 |
| 总页面数 | ~40 页（6 主包 + ~34 分包） | — |

---

## 五、逐包分析

### 收益最大（强烈推荐 Skyline）

| 分包 | 页面数 | 原因 |
|---|---|---|
| **packageLottery**（抽奖） | 14 种游戏组件 | 转盘、刮刮卡、打地鼠、弹珠、扭蛋、老虎机等，大量 CSS 动画 + touch 事件 + Canvas。Worklet 动画和手势系统能让游戏从"能用"变成"丝滑"。项目最大差异化卖点。 |
| **packageDIY**（DIY 设计器） | 5 页 + 子组件 | 串珠/镶嵌设计器，Canvas 2D 渲染 + 拖拽交互 + 形状渲染。手势系统能消除 16-32ms 延迟，设计体验质变。 |
| **packageTrade**（交易市场） | 12 页 | 大量长列表（市场、拍卖大厅、我的订单），scroll-view 密集。拍卖大厅有实时竞价（Socket.IO），高频 setData + 列表更新。 |

### 收益中等

| 分包 | 页面数 | 原因 |
|---|---|---|
| **pages/**（主包） | 6 页 | lottery 首页有 swiper 轮播 + Canvas QR 码 + 大量动画；exchange 商城有商品列表。tabBar 页面用 Skyline 能消除切换白屏。 |
| **packageExchange**（兑换） | 3+ 页 | 商品详情有图片 swiper、竞价面板、幸运空间等交互组件。 |

### 收益较小但无障碍

| 分包 | 页面数 | 原因 |
|---|---|---|
| **packageUser**（用户服务） | 8 页 | auth、chat、积分明细、反馈、通知。chat 有 Socket.IO 实时消息。功能性页面为主。 |
| **packageAdmin**（管理后台） | 4 页 | 核销提交、审核列表、扫码验证、客服。表单和列表为主。 |
| **packageAd**（广告） | 3 页 | 广告活动管理。纯 CRUD 页面。 |

---

## 六、最终方案：全量 Skyline

### 为什么不选其他方案

| 备选方案 | 排除原因 |
|---|---|
| **纯 WebView** | 你的项目有 14 种抽奖游戏 + DIY 设计器 + 实时拍卖，WebView 的动画和手势性能是硬伤。餐饮品牌可以用 WebView 是因为它们只有点单流程，你不行。 |
| **Taro/uni-app 跨端** | 你只投放微信平台，不需要跨端。1688 选 Taro 是因为要投放支付宝、抖音。跨端框架会引入额外的抽象层开销，且 Skyline 的高级特性（Worklet、手势系统）在跨端框架下支持不完整。你现在用的原生 TypeScript + MobX + glass-easel 已经是最优技术栈。 |
| **渐进式 Skyline（混合模式）** | 京东和同程选渐进式是因为已上线有几亿用户。你还没上线，混合模式意味着维护两套导航栏、两套滚动方案、两套动画方案，长期维护成本翻倍，纯粹制造技术债务。 |
| **微信云开发** | 你已经有独立后端（JWT + Socket.IO + RESTful API），云开发的 Serverless 模式反而限制了你的架构灵活性。 |
| **小游戏** | 小游戏是独立技术栈（Canvas/WebGL），不能复用你现有的 WXML/WXSS/MobX 代码。你的抽奖游戏是小程序页面里的组件，不是独立游戏。 |

### 基于项目实际技术栈的适配评估

| 你现有的技术 | 与 Skyline 的兼容性 | 需要改动吗 |
|---|---|---|
| TypeScript + Sass | ✅ 完全兼容，`useCompilerPlugins: ["typescript", "sass"]` 不受影响 | 不需要 |
| MobX（mobx-miniprogram） | ✅ 完全兼容，状态管理层不涉及渲染引擎 | 不需要 |
| Socket.IO（weapp.socket.io） | ✅ 完全兼容，WebSocket 是逻辑层能力，不涉及渲染 | 不需要 |
| JWT 双 Token 认证 | ✅ 完全兼容，纯逻辑层 | 不需要 |
| glass-easel 组件框架 | ✅ 已开启，这是 Skyline 的前置条件 | 不需要 |
| Canvas 2D（QR 码、价格图表、DIY） | ✅ Skyline 支持 Canvas 2D | 不需要 |
| 50+ CSS @keyframes 动画 | ✅ Skyline 支持 @keyframes | 不需要（可选升级 Worklet） |
| scroll-view（30+ 文件） | ✅ Skyline 增强了 scroll-view | 不需要 |
| 自定义 tabBar | ✅ 兼容 | 不需要 |
| 后代选择器（`.parent text {}`） | ❌ 性能差，需改为 class 选择器 | **需要改** |
| position: sticky（5 文件） | ⚠️ 行为有差异 | **需要改** |
| 页面全局滚动 | ❌ Skyline 不支持 | **需要改** |
| 原生导航栏 | ❌ Skyline 不支持 | **需要改** |

### 决策依据

1. **已具备 90% 前置条件**：glass-easel 已开启、Canvas 全部是 2D、没有 `wx.createAnimation`、没有通配符选择器、基础库版本远超要求。

2. **混合模式是技术债务的温床**。部分页面 Skyline、部分 WebView，需要维护两套导航栏、两套滚动方案、两套动画方案，长期维护成本翻倍。京东和同程选择渐进式是因为已上线有几亿用户不能冒险。本项目还没上线，没有这个包袱。

3. **项目特性完美匹配 Skyline 优势场景**：14 种抽奖游戏（动画密集）、DIY 设计器（手势密集）、实时拍卖（高频更新）、长列表交易市场。

4. **微信的方向很明确**：Skyline 接入量同比增长 17 倍，PV 增长 4 倍，鸿蒙 OS 已灰度支持。WebView 是过去，Skyline 是未来。

5. **同类竞品都还在 WebView**。全量 Skyline 上线，交互体验直接拉开一个档次，这是技术层面的竞争壁垒。

### 决策确认（2026-04-30）

> **决策人确认：全量 Skyline + Worklet/手势一期全做，不分阶段。**

| 决策项 | 结论 |
|---|---|
| 迁移策略 | ✅ **全量 Skyline，上线前完成迁移**。不走 WebView 先上线再迁移的路线，不搞混合模式。 |
| Worklet 动画 + 手势系统 | ✅ **一期同步完成**。不拆分为二期，抽奖游戏 Worklet 升级（第 6 步）和 DIY 设计器手势升级（第 7 步）与基础适配（第 1-5 步）一次性执行。 |
| 预估总工期 | **12-18 个工作日**（含充足的测试缓冲，原文 10-15 天偏乐观，14 种抽奖游戏 + DIY 设计器的全量测试需要更多时间） |

---

## 七、需要适配的问题清单

### 1. position: sticky（5 个文件）

Skyline 对 `position: sticky` 支持有差异。

**涉及文件：**
- `packageAdmin/audit-list/audit-list.scss`
- `packageDIY/diy-works/diy-works.scss`
- `packageTrade/records/trade-upload-records/trade-upload-records.scss`
- `packageAd/ad-campaigns/ad-campaigns.scss`
- `packageUser/notifications/notifications.scss`

**解决方案：** 改用 scroll-view 的 `sticky-header` 或用 `position: absolute` + JS 计算模拟。工作量小。

### 2. 后代选择器（大量文件）

这是最大的适配工作量。Skyline 对后代选择器（`.parent text {}`）性能不好，官方建议改为 class 选择器。项目中大量使用了 `.xxx text {}` 这种模式。

**典型示例：**
```scss
/* 改之前 */
.unified-card .card-image-area image { ... }
.tab-badge text { ... }
.status-tag.pending text { ... }

/* 改之后 */
.unified-card .card-image-area .card-img { ... }
.tab-badge .badge-text { ... }
.status-tag.pending .tag-text { ... }
```

**解决方案：** 全局搜索替换，给 `text`、`image` 组件加上 class，改为 `.xxx .xxx-text {}`。机械性工作，量大但不难。

### 3. 页面全局滚动

Skyline 不支持页面全局滚动，需要 `"disableScroll": true` + 用 scroll-view 包裹。项目已经大量使用 scroll-view，适配成本不高。

### 4. 原生导航栏

Skyline 不支持原生导航栏，需要 `"navigationStyle": "custom"` + 自定义导航栏组件。需要做一个通用的 `components/custom-navbar/` 组件。

### 5. compileWorklet 需要开启

当前是 `false`，迁移后需要改为 `true`，以便使用 Worklet 动画替代部分 CSS 动画。

---

## 八、实施步骤

### 第 1 步：全局配置

```jsonc
// app.json 新增/修改
{
  "renderer": "skyline",
  "rendererOptions": {
    "skyline": {
      "defaultDisplayBlock": true,
      "defaultContentBox": true
    }
  },
  "lazyCodeLoading": "requiredComponents"  // 已有
}

// project.config.json
{
  "setting": {
    "compileWorklet": true  // false → true
  }
}

// project.private.config.json
{
  "setting": {
    "skylineRenderEnable": true  // false → true
  }
}

// 每个页面 .json
{
  "disableScroll": true,
  "navigationStyle": "custom"
}
```

### 第 2 步：通用自定义导航栏组件

创建 `components/custom-navbar/`，支持返回按钮、标题、自定义右侧按钮、安全区域适配。

### 第 3 步：后代选择器批量替换

全局搜索 `.xxx text {` 模式，给 text/image 组件加 class，改为 `.xxx .xxx-text {` 模式。

### 第 4 步：position: sticky 适配（5 个文件）

改为 scroll-view sticky-header 或 absolute 定位。

### 第 5 步：页面滚动适配

检查所有页面是否已用 scroll-view，未用的页面外层包一个 `<scroll-view type="list" scroll-y>`。

### 第 6 步：抽奖游戏升级 Worklet 动画

- 转盘、弹珠、扭蛋等核心动画改用 Worklet
- CSS @keyframes 保留（Skyline 支持）
- touch 事件改用 Skyline 手势系统（pan-gesture-handler 等）

### 第 7 步：DIY 设计器升级手势系统

拖拽/缩放改用 `pan-gesture-handler` + `pinch-gesture-handler`。

### 第 8 步：全量测试

- 开发者工具 Skyline 调试
- 真机 Android + iOS 测试
- 重点测试：抽奖动画、DIY 拖拽、长列表滚动、拍卖实时竞价

---

## 九、预估工作量

| 任务 | 工作量 |
|---|---|
| 全局配置 + 导航栏组件 | 1-2 天 |
| 后代选择器批量替换（~40 个文件） | 2-3 天 |
| position: sticky 适配 | 0.5 天 |
| 页面滚动适配 | 1-2 天 |
| 抽奖游戏 Worklet + 手势升级 | 3-5 天 |
| DIY 设计器手势升级 | 1-2 天 |
| 全量测试 + 修 bug | 4-5 天 |
| **总计** | **约 12-18 个工作日** |

> **注：** 决策人已确认全部步骤（第 1-8 步）一次性执行，不分阶段。测试预估从 2-3 天上调至 4-5 天，因为 14 种抽奖游戏 + DIY 设计器 + 实时拍卖的交互场景多，需要充足的真机测试时间。

---

## 十、收益总结

| 维度 | 收益 |
|---|---|
| 用户体验 | 页面切换无白屏、抽奖动画 60fps、DIY 拖拽零延迟、长列表丝滑 |
| 技术债务 | 零（不维护两套方案） |
| 内存占用 | 降低 30%-50% |
| 跨平台一致性 | iOS / Android 渲染行为完全一致 |
| 竞争壁垒 | 同类竞品全部还在 WebView，交互体验领先一个档次 |
| 未来扩展 | 可直接使用微信后续推出的 3D、粒子系统等新特性 |

---

## 十一、代码扫描结果与精确执行计划

> 扫描日期：2026-05-03
> 扫描方式：全项目自动化搜索（排除 node_modules / miniprogram_npm）
> 状态：待执行

### 项目现状扫描摘要

| 检查项 | 结果 | 说明 |
|--------|------|------|
| `app.json` renderer | `"renderer": "skyline"` 已配置 | 无需修改 |
| `componentFramework` | `"glass-easel"` 已配置 | 无需修改 |
| `rendererOptions` | `defaultDisplayBlock: true`, `defaultContentBox: true` 已配置 | 无需修改 |
| `lazyCodeLoading` | `"requiredComponents"` 已配置 | 无需修改 |
| `window.navigationStyle` | 未设置（使用默认原生导航栏） | 需改为 `"custom"` |
| `compileWorklet` | `false` | 需改为 `true` |
| `skylineRenderEnable` | `false` | 需改为 `true` |
| Canvas 旧 API | `wx.createCanvasContext` 零调用 | 无需适配 |
| Canvas 2D | 全部 7 处 canvas 均为 `type="2d"` | 无需适配 |
| `wx.createAnimation` | 零调用 | 无需适配 |
| `this.animate()` | 零调用 | 无需适配 |
| 通配符选择器 `*` | 零使用 | 无需适配 |
| 页面根节点 | 34 个页面全部单根 `<view>` | 无需适配 |
| `page-meta` 组件 | 零使用 | 无需适配 |
| 第三方库 | tdesign（官方支持 Skyline）、MobX（纯逻辑层）、Socket.IO（纯网络层） | 无需适配 |

---

### Step 1: 全局配置（预计 0.5 天）

#### 1.1 app.json

`renderer`、`componentFramework`、`rendererOptions`、`lazyCodeLoading` 已就绪，只需在 `window` 中添加：

```jsonc
"window": {
  "navigationStyle": "custom",   // 新增：Skyline 不支持原生导航栏
  // ... 其余保留
}
```

#### 1.2 project.config.json

```jsonc
"setting": {
  "compileWorklet": true   // false → true
}
```

#### 1.3 project.private.config.json

```jsonc
"setting": {
  "skylineRenderEnable": true   // false → true
}
```

#### 1.4 每个页面 .json

所有 34 个页面 + 组件的 `.json` 中添加：

```jsonc
{
  "disableScroll": true   // Skyline 不支持页面全局滚动
}
```

涉及的页面 JSON 文件（34 个）：

**主包（6 个）：**
- `pages/lottery/lottery.json`
- `pages/exchange/exchange.json`
- `pages/user/user.json`
- `pages/diy/diy.json`
- `pages/camera/camera.json`
- `pages/webview/webview.json`

**packageUser（8 个）：**
- `packageUser/auth/auth.json`
- `packageUser/chat/chat.json`
- `packageUser/points-detail/points-detail.json`
- `packageUser/feedback/feedback.json`
- `packageUser/feedback/detail.json`
- `packageUser/feedback/list.json`
- `packageUser/issues/issues.json`
- `packageUser/notifications/notifications.json`

**packageAdmin（4 个）：**
- `packageAdmin/consume-submit/consume-submit.json`
- `packageAdmin/audit-list/audit-list.json`
- `packageAdmin/scan-verify/scan-verify.json`
- `packageAdmin/customer-service/customer-service.json`

**packageTrade（12 个）：**
- `packageTrade/trade/market/market.json`
- `packageTrade/trade/listing-detail/listing-detail.json`
- `packageTrade/trade/my-orders/my-orders.json`
- `packageTrade/trade/inventory/inventory.json`
- `packageTrade/trade/my-listings/my-listings.json`
- `packageTrade/records/trade-upload-records/trade-upload-records.json`
- `packageTrade/trade/dispute/dispute.json`
- `packageTrade/trade/auction-hall/auction-hall.json`
- `packageTrade/trade/auction-create/auction-create.json`
- `packageTrade/trade/my-auctions/my-auctions.json`
- `packageTrade/trade/my-auction-bids/my-auction-bids.json`
- `packageTrade/trade/auction-detail/auction-detail.json`

**packageExchange（3 个）：**
- `packageExchange/exchange-detail/exchange-detail.json`
- `packageExchange/exchange-orders/exchange-orders.json`
- `packageExchange/exchange-order-detail/exchange-order-detail.json`

**packageAd（3 个）：**
- `packageAd/ad-campaigns/ad-campaigns.json`
- `packageAd/ad-create/ad-create.json`
- `packageAd/ad-detail/ad-detail.json`

**packageDIY（5 个）：**
- `packageDIY/diy-select/diy-select.json`
- `packageDIY/diy-templates/diy-templates.json`
- `packageDIY/diy-design/diy-design.json`
- `packageDIY/diy-result/diy-result.json`
- `packageDIY/diy-works/diy-works.json`

---

### Step 2: 自定义导航栏组件（预计 1 天）

项目当前无自定义导航栏组件。Skyline 下原生导航栏不可用，需要创建。

#### 2.1 创建 `components/custom-navbar/`

文件清单：
- `components/custom-navbar/custom-navbar.wxml`
- `components/custom-navbar/custom-navbar.ts`
- `components/custom-navbar/custom-navbar.scss`
- `components/custom-navbar/custom-navbar.json`

功能需求：
- 安全区适配：`wx.getWindowInfo()` 获取 `statusBarHeight`，计算导航栏总高度 = statusBarHeight + 44px
- 返回按钮：页面栈 > 1 时显示，点击调用 `wx.navigateBack()`
- 标题文字：通过 `title` 属性传入
- 背景色：通过 `bgColor` 属性传入，默认 `#FF6B35`（品牌色）
- 文字颜色：通过 `textColor` 属性传入，默认 `#ffffff`
- 自定义右侧 slot：支持放置按钮（如通知铃铛）
- tabBar 页面特殊处理：不显示返回按钮

#### 2.2 全局注册

在 `app.json` 的 `usingComponents` 中添加：

```jsonc
"usingComponents": {
  "maintenance-overlay": "/components/maintenance-overlay/maintenance-overlay",
  "custom-navbar": "/components/custom-navbar/custom-navbar"   // 新增
}
```

#### 2.3 所有页面插入导航栏

在每个页面 WXML 的根 `<view>` 内部最顶部插入：

```xml
<custom-navbar title="页面标题" />
```

title 取自各页面 JSON 的 `navigationBarTitleText`，bgColor 取自 `navigationBarBackgroundColor`。

各页面的导航栏参数：

| 页面 | title | bgColor | 特殊处理 |
|------|-------|---------|---------|
| `pages/lottery` | 幸运抽奖 | #667eea | tabBar 页，无返回按钮 |
| `pages/exchange` | 积分商城 | #667eea | tabBar 页，无返回按钮 |
| `pages/user` | 个人中心 | #667eea | tabBar 页，无返回按钮 |
| `pages/diy` | DIY 工坊 | #667eea | tabBar 页，无返回按钮 |
| `pages/camera` | 发现 | #667eea | tabBar 页，无返回按钮 |
| `packageUser/auth` | （无标题） | 默认 | 登录页，无返回按钮 |
| `packageUser/chat` | 在线客服 | #667eea | |
| `packageUser/points-detail` | 积分明细 | #667eea | |
| `packageAdmin/consume-submit` | 消费录入 | #667eea | |
| `packageAdmin/audit-list` | 审核管理 | #667eea | |
| `packageAdmin/scan-verify` | 扫码核销 | #667eea | |
| `packageAdmin/customer-service` | 客服管理 | #4CAF50 | |
| `packageTrade/trade/market` | 交易市场 | #667eea | |
| `packageTrade/trade/listing-detail` | 商品详情 | #667eea | |
| `packageExchange/exchange-detail` | 商品详情 | #667eea | |
| `packageExchange/exchange-orders` | 我的订单 | #667eea | |
| `packageExchange/exchange-order-detail` | 订单详情 | #667eea | |
| `packageAd/ad-campaigns` | 广告活动 | #FF6B35 | |
| `packageAd/ad-create` | 创建广告活动 | #FF6B35 | |
| `packageAd/ad-detail` | 广告详情 | #FF6B35 | |
| `packageDIY/diy-select` | DIY 设计 | 默认 | |
| `packageDIY/diy-templates` | 选择款式 | 默认 | |
| `packageDIY/diy-design` | 工作台 | 默认 | |
| `packageDIY/diy-result` | 设计完成 | 默认 | |
| `packageDIY/diy-works` | 我的设计 | 默认 | |
| 其余页面 | 取自各自 JSON | 取自各自 JSON | |

---

### Step 3: scroll-view 适配（预计 1 天）

#### 3.1 添加 type 属性

扫描发现 28 个文件、约 45 处 scroll-view 缺少 `type` 属性。规则：

- 纵向滚动列表（`scroll-y`）→ 添加 `type="list"`
- 横向滚动（`scroll-x`，如分类 Tab 栏）→ 添加 `type="custom"`
- 已有 `enhanced` 属性的保留

涉及文件（28 个）：

| 文件 | scroll-view 数量 | 类型 |
|------|-----------------|------|
| `packageTrade/trade/inventory/inventory.wxml` | 3 | list + custom |
| `packageUser/chat/chat.wxml` | 3 | list |
| `packageDIY/diy-design/diy-design.wxml` | 2 | list + custom |
| `packageDIY/diy-templates/diy-templates.wxml` | 2 | list + custom |
| `packageAd/ad-campaigns/ad-campaigns.wxml` | 2 | list + custom |
| `components/exchange/exchange-market/exchange-market.wxml` | 2 | list + custom |
| `components/exchange/exchange-shelf/exchange-shelf.wxml` | 2 | list + custom |
| `components/lottery-activity/sub/scratch/scratch.wxml` | 2 | list |
| `components/lottery-activity/sub/flashsale/flashsale.wxml` | 2 | list |
| 其余 19 个文件 | 各 1 | list 或 custom |

#### 3.2 页面级滚动包裹

Skyline 不支持页面全局滚动。检查所有页面，如果页面内容没有被 scroll-view 包裹，需要在根 `<view>` 内部用 `<scroll-view type="list" scroll-y style="height: 100vh">` 包裹全部内容（custom-navbar 除外）。

---

### Step 4: CSS 兼容性修复（预计 3 天）

#### 4a. 后代选择器替换（55 处，21 个文件）

Skyline 对以标签名结尾的后代选择器（`.parent text {}`）性能差，需改为 class 选择器。

同时修改 SCSS 和 WXML：
- SCSS: `.parent text {}` → `.parent .parent-text {}`
- WXML: 对应的 `<text>` 添加 `class="parent-text"`

**SCSS 嵌套形式（32 处，12 个文件）：**

| 文件 | 数量 |
|------|------|
| `packageAdmin/consume-submit/consume-submit.scss` | 9 |
| `packageExchange/exchange-detail/exchange-detail.scss` | 7 |
| `packageTrade/trade/listing-detail/listing-detail.scss` | 4 |
| `packageTrade/trade/market/market.scss` | 2 |
| `packageDIY/diy-design/diy-design.scss` | 2 |
| `components/lottery-activity/sub/flashsale/flashsale.scss` | 2 |
| `packageTrade/trade/my-orders/my-orders.scss` | 1 |
| `packageDIY/sub/bead-card/bead-card.scss` | 1 |
| `components/lottery-activity/sub/whackmole/whackmole.scss` | 1 |
| `components/lottery-activity/sub/slotmachine/slotmachine.scss` | 1 |
| `components/lottery-activity/sub/gashapon/gashapon.scss` | 1 |
| `components/lottery-activity/sub/pinball/pinball.scss` | 1 |

**平铺形式 `.parent text {}`（21 处，8 个文件）：**

| 文件 | 数量 |
|------|------|
| `packageAdmin/audit-list/audit-list.scss` | 6 |
| `components/lottery-activity/sub/luckybag/luckybag.scss` | 6 |
| `components/lottery-activity/sub/egg/egg.scss` | 3 |
| `components/lottery-activity/sub/redpacket/redpacket.scss` | 2 |
| `packageUser/chat/chat.scss` | 1 |
| `packageAdmin/customer-service/customer-service.scss` | 1 |
| `components/exchange/exchange-market/exchange-market.scss` | 1 |
| `components/exchange/exchange-shelf/sub/bid-panel/bid-panel.scss` | 1 |

**image 标签后代选择器（2 处）：**

| 文件 | 数量 |
|------|------|
| `components/exchange/exchange-shelf/exchange-shelf-cards.scss` | 1 |
| `packageExchange/exchange-detail/exchange-detail.scss` | 1 |

#### 4b. position: sticky 适配（5 个文件）

改为 scroll-view 内的 `sticky-section` / `sticky-header` 方案：

| 文件 | 当前用途 |
|------|---------|
| `packageAdmin/audit-list/audit-list.scss` | 筛选栏吸顶 |
| `packageDIY/diy-works/diy-works.scss` | Tab 栏吸顶 |
| `packageTrade/records/trade-upload-records/trade-upload-records.scss` | Tab 栏吸顶 |
| `packageAd/ad-campaigns/ad-campaigns.scss` | 筛选栏吸顶 |
| `packageUser/notifications/notifications.scss` | 分类栏吸顶 |

#### 4c. ::-webkit- 前缀移除（5 处）

直接删除或替换为标准属性：

| 文件 | 属性 |
|------|------|
| 搜索 `::-webkit-scrollbar` | 隐藏滚动条（Skyline 用 `show-scrollbar="{{false}}"` 替代） |
| 搜索 `::-webkit-input-placeholder` | 改为 `::placeholder` |

---

### Step 5: Canvas 兼容性验证（预计 0.5 天）

项目 Canvas 已全部使用 `type="2d"` API，Skyline 兼容。需要确认的点：

| 组件 | Canvas 用途 | 检查项 |
|------|------------|--------|
| `components/price-chart/price-chart.ts` | 价格走势图绘制 | `createSelectorQuery` 在 Skyline 下改用 `this.createSelectorQuery()` |
| `packageDIY/diy-result/diy-result.ts` | DIY 海报合成 | 同上 |
| `packageDIY/sub/shape-renderer/shape-renderer.ts` | 形状渲染 | 同上 |
| `utils/qrcode/qr-renderer.ts` | 二维码生成 | 同上 |
| `components/lottery-activity/sub/scratch/scratch.ts` | 刮刮卡 | 同上 |

主要工作：确保所有 `wx.createSelectorQuery()` 改为组件内的 `this.createSelectorQuery()`（Skyline 下推荐用法）。

---

### Step 6: Worklet 动画升级（预计 3-5 天）

#### 核心策略

CSS @keyframes 在 Skyline 下兼容，不需要全部重写。重点是将 setTimeout 链式动画中的 setData 调用优化为 Worklet shared values，减少跨线程通信。

#### 14 种抽奖游戏分批处理

**批次 1 — 简单（CSS transition 驱动，改动最小）：**

| 组件 | 动画机制 | Worklet 升级方案 |
|------|---------|-----------------|
| wheel（转盘） | CSS `transition: transform 4s` + setData | 旋转角度改用 `shared()` + `timing()` |
| grid（九宫格） | setTimeout 链 + setData 高亮 | 高亮索引改用 `shared()` + `sequence()` |
| scratch（刮刮卡） | CSS transition + touch 事件 | 保留 CSS，touch 改手势（Step 7） |

**批次 2 — 中等（CSS @keyframes + setTimeout 链）：**

| 组件 | 动画机制 | Worklet 升级方案 |
|------|---------|-----------------|
| redpacket（红包） | @keyframes burstRing/burstStar + setTimeout | 保留 @keyframes，编排层改 Worklet `delay()` |
| luckybag（福袋） | @keyframes floatUp/bagShake + setTimeout | 同上 |
| egg（砸金蛋） | @keyframes eggShake/hammerSwing + setTimeout | 同上 |
| gashapon（扭蛋v2） | CSS transition + 状态机 | 状态切换改 `shared()` |

**批次 3 — 复杂（大量 @keyframes + 复杂状态机）：**

| 组件 | 动画机制 | Worklet 升级方案 |
|------|---------|-----------------|
| card（卡牌翻转） | CSS 3D transform + @keyframes | 3D 翻转改 Worklet `timing()` + `withTiming()` |
| blindbox（扭蛋机） | @keyframes eggWobble/eggDrop/eggBounce + setTimeout 链 | 编排层改 Worklet `sequence()` |
| cardcollect（集卡） | @keyframes + 多卡片状态管理 | 卡片翻转/收集动画改 Worklet |

**批次 4 — 极复杂（1500+ 行 SCSS + 复杂动画编排）：**

| 组件 | 动画机制 | Worklet 升级方案 |
|------|---------|-----------------|
| slotmachine（老虎机） | @keyframes slotSpin + 多列独立控制 | 每列滚动改 Worklet `shared()` + `timing()` |
| pinball（弹珠机） | @keyframes + 物理模拟 | 弹珠轨迹改 Worklet `withSpring()` |
| flashsale（限时秒杀） | @keyframes + 倒计时 + 列表动画 | 倒计时保留 JS，列表入场改 Worklet |
| whackmole（打地鼠） | @keyframes + touch 计时 | 地鼠出没改 Worklet，touch 改手势（Step 7） |

#### 每个组件的 Worklet 升级模式

```typescript
// 改之前：setData 驱动
this.setData({ spinning: true })
setTimeout(() => {
  this.setData({ spinning: false, result: prize })
}, 4000)

// 改之后：Worklet shared value 驱动
const rotation = wx.worklet.shared(0)
wx.worklet.timing(rotation, { toValue: 1440 + targetAngle, duration: 4000 }, () => {
  'worklet'
  // 动画完成回调
})
```

---

### Step 7: 手势系统迁移（预计 1 天）

#### 需要真正手势迁移的组件（2 个）

| 组件 | 当前实现 | 迁移方案 |
|------|---------|---------|
| scratch（刮刮卡） | `bindtouchstart/move/end` 追踪滑动轨迹 | 改为 `<pan-gesture-handler>`，在渲染线程处理滑动 |
| whackmole（打地鼠） | `catchtouchstart/end` 处理点击计时 | 改为 `<tap-gesture-handler>`，在渲染线程处理点击 |

#### 其他 touch 事件适配

| 场景 | 当前实现 | 迁移方案 |
|------|---------|---------|
| `catchtouchmove="noop"`（3 处） | 阻止滚动穿透 | 改为 Skyline 的 `disableScroll` 或 `catch:touchmove` |
| ripple 效果（2 处） | `bindtouchstart` 获取坐标 | 保留，Skyline 兼容 |
| DIY 设计器拖拽 | `bindtouchstart/move/end` | 改为 `<pan-gesture-handler>` + `<pinch-gesture-handler>` |

---

### Step 8: 第三方库兼容性验证（预计 0.5 天）

| 库 | 兼容性 | 需要改动 |
|----|--------|---------|
| tdesign-miniprogram ^1.14.0 | 官方支持 Skyline | 无需改动 |
| mobx-miniprogram ^6.12.3 | 纯逻辑层，不涉及渲染 | 无需改动 |
| mobx-miniprogram-bindings ^3.1.1 | 纯逻辑层 | 无需改动 |
| weapp.socket.io ^1.7.2 | 纯网络层 | 无需改动 |
| custom-tab-bar（t-tab-bar） | TDesign 组件，Skyline 兼容 | 确认渲染行为 |

---

### 最终验证清单

| 验证项 | 方式 |
|--------|------|
| ESLint 零错误 | `npm run lint` |
| TypeScript 零错误 | `npx tsc --noEmit` |
| Prettier 格式一致 | `npm run format:check` |
| 微信开发者工具编译 | 手动操作，确认 Skyline 模式下无报错 |
| 真机 Android 测试 | 重点：抽奖动画、DIY 拖拽、长列表滚动 |
| 真机 iOS 测试 | 重点：导航栏安全区、Canvas 渲染、手势响应 |

---

### 修订后的工作量预估

| 任务 | 文件数 | 预估工时 |
|------|--------|---------|
| Step 1: 全局配置 + 34 个页面 JSON | 37 | 0.5 天 |
| Step 2: custom-navbar 组件 + 34 个页面插入 | 38 | 1 天 |
| Step 3: scroll-view type 属性 + 页面滚动包裹 | 28 | 1 天 |
| Step 4a: 后代选择器替换 | 21 SCSS + 21 WXML | 2 天 |
| Step 4b: position: sticky 适配 | 5 | 0.5 天 |
| Step 4c: ::-webkit- 前缀移除 | 5 | 0.5 天 |
| Step 5: Canvas 兼容性验证 | 5 | 0.5 天 |
| Step 6: Worklet 动画升级（4 批 14 个组件） | 14 | 3-5 天 |
| Step 7: 手势系统迁移 | 5 | 1 天 |
| Step 8: 第三方库验证 | — | 0.5 天 |
| 最终验证 + 修 bug | — | 2-3 天 |
| **总计** | **约 160+ 文件** | **约 12-18 个工作日** |

---

## 参考资料

- [微信官方 Skyline 介绍](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html)
- [从 WebView 迁移指引](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/migration/)
- [glass-easel 适配指引](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/glass-easel/migration)
- [同程旅行 Skyline 最佳实践](https://developers.weixin.qq.com/community/minihome/article/doc/000446af0645d08058af5021b50013)
- [京东购物小程序性能优化实践](https://cloud.tencent.com/developer/article/2390784)
- [Skyline 渲染引擎入门指南](https://developers.weixin.qq.com/community/develop/article/doc/000486ced40318ad16a3c483c63413)
