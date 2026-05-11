# Emoji 全面替换方案 — 图标设计规范

## 解决什么问题

本项目大量使用 emoji 字符作为 UI 图标，存在以下问题：

1. **跨平台渲染不一致** — 同一个 emoji 在 iOS、Android、微信开发者工具中显示效果差异明显（颜色、形状、大小）
2. **无法精确控制样式** — emoji 无法像 iconfont 一样通过 CSS 控制颜色、大小、阴影等
3. **视觉风格不统一** — 项目已有 iconfont 图标体系，emoji 与 iconfont 混用导致视觉割裂
4. **品牌感缺失** — 对比瑞幸、霸王茶姬等品牌小程序，它们的图标全部采用精心设计的矢量图标，视觉精致统一

**决策：项目中不再使用任何 emoji，全部替换为 iconfont（方案 A）或 SVG 图标组件（方案 B）。**

---

## 不涉及修改的部分

- **底部 TabBar（5个Tab）** — 已使用 `custom: true` 自定义 TabBar，图标通过 iconfont 渲染，无 emoji，无需修改
- **代码注释中的 emoji** — 分布在 `utils/api/*.ts`、`config/*.ts`、`store/*.ts`、`.eslintrc.js`、各 `.scss` 文件注释中，约 60+ 处，不影响用户界面，无需修改
- **测试文件** — `test/utils/jwt-test.spec.js` 中的 ✅❌⚡ 等，不影响生产环境
- **TS 日志/console 中的 emoji** — 如 `my-listings.ts` 中的 ⚠️ 日志警告，仅开发者可见，可选择性清理

---

## 图标设计标准

参考瑞幸咖啡、霸王茶姬等品牌小程序的图标设计水准，制定以下标准：

### 1. 视觉风格

| 维度 | 标准 | 说明 |
|------|------|------|
| 线条风格 | 圆润线性（Rounded Linear） | 线条末端圆角，转角柔和，不使用尖锐直角 |
| 线条粗细 | 统一 2px 视觉粗细 | 所有图标在同一尺寸下线条粗细一致 |
| 填充方式 | 线性为主，关键图标可用面性 | 导航栏/Tab 选中态可用面性填充 |
| 圆角 | 与项目 border-radius token 一致 | 图标内部圆角与 UI 圆角保持视觉协调 |
| 视觉重量 | 均匀分布 | 不同图标在同一尺寸下视觉重量感一致 |

### 2. 尺寸规范

| 场景 | 图标尺寸 | 对应 Token |
|------|---------|-----------|
| 导航栏图标 | 44rpx × 44rpx | — |
| 功能入口图标 | 48rpx × 48rpx | — |
| 列表行内图标 | 32rpx × 32rpx | --tg-font-size-headline |
| 按钮内图标 | 28rpx × 28rpx | --tg-font-size-title |
| 标签/角标图标 | 24rpx × 24rpx | --tg-font-size-caption |
| 状态小图标 | 20rpx × 20rpx | --tg-font-size-mini |

### 3. 颜色规范

图标颜色必须使用项目 Design Token：

| 场景 | 颜色 Token | 说明 |
|------|-----------|------|
| 默认状态 | var(--tg-text-primary) | 主要功能图标 |
| 次要状态 | var(--tg-text-secondary) | 辅助说明图标 |
| 禁用状态 | var(--tg-text-tertiary) | 不可用状态 |
| 品牌色 | var(--td-brand-color) | 品牌强调图标 |
| 成功 | var(--tg-color-success) | 成功状态图标 |
| 警告 | var(--tg-color-warning) | 警告状态图标 |
| 错误 | var(--tg-color-error) | 错误状态图标 |
| 信息 | var(--tg-color-info) | 信息提示图标 |
| 反色 | var(--tg-color-white) | 深色背景上的图标 |

### 4. 设计网格

| 规格 | 说明 |
|------|------|
| 画布尺寸 | 24×24px（设计稿），导出时按需缩放 |
| 安全区域 | 内容区域 20×20px，四周留 2px 出血 |
| 像素对齐 | 关键线条必须对齐像素网格，避免模糊 |
| 光学校正 | 圆形/三角形图标可适当超出内容区域以保持视觉等大 |

### 5. 品质对标

以下是本项目图标应达到的品质标准（对标品牌）：

- **瑞幸咖啡** — 功能入口图标：彩色插画风格 + 线性图标混搭，功能区图标统一线性风格
- **霸王茶姬** — 全线性图标，品牌绿色为主色调，线条优雅圆润，中国风细节点缀
- 共同特点：
  - 图标与文字间距舒适（≥8rpx）
  - 图标大小与文字比例协调
  - 同一区域内图标风格 100% 统一
  - 无任何 emoji 出现

---

## 方案 A：扩展 Iconfont（单色/双色图标）

适用于：通用状态图标、业务功能图标、导航图标

### 需要新增的 iconfont 图标清单

| 类名 | 语义 | 替换 Emoji | 风格要求 |
|------|------|-----------|---------|
| `icon-package` | 仓库/包裹 | 📦 | 圆润线性，立体感包裹 |
| `icon-diamond` | 星石/资产 | 💎 | 几何切面钻石，线性 |
| `icon-gold-coin` | 金币/积分 | 🪙💰 | 圆形硬币，中间有币纹 |
| `icon-hammer` | 拍卖锤 | 🔨 | 法槌造型，圆润手柄 |
| `icon-craft` | 铸造 | ⚒️ | 交叉锤子，工匠感 |
| `icon-gift` | 奖品/礼物 | 🎁 | 方形礼盒+蝴蝶结 |
| `icon-fire` | 热门/连击 | 🔥 | 火焰造型，动感曲线 |
| `icon-warning` | 警告 | ⚠️ | 三角形+感叹号 |
| `icon-success` | 成功 | ✅ | 圆形+对勾 |
| `icon-error` | 失败/关闭 | ❌ | 圆形+叉号 |
| `icon-question` | 未知 | ❓ | 圆形+问号 |
| `icon-star` | 评分/收藏 | ⭐ | 五角星，线性 |
| `icon-trophy` | 奖杯 | 🏆 | 经典奖杯造型 |
| `icon-slot-machine` | 抽奖 | 🎰 | 老虎机简化造型 |
| `icon-celebrate` | 庆祝 | 🎉 | 礼花/彩带 |
| `icon-target` | 目标/精准 | 🎯 | 靶心圆环 |
| `icon-link` | 连接 | 🔗 | 链条环扣 |
| `icon-dice` | 随机 | 🎲 | 骰子立体感 |
| `icon-lightning` | 闪电/快速 | ⚡ | 闪电符号 |
| `icon-clover` | 幸运 | 🍀 | 四叶草 |
| `icon-sparkle` | 闪光 | ✨ | 四角星光 |
| `icon-ribbon` | 彩带 | 🎊 | 飘带造型 |

### Iconfont 技术规范

```scss
@font-face {
  font-family: 'TGIcon';
  src: url('/assets/fonts/tg-icon.woff2') format('woff2');
  font-weight: normal;
  font-style: normal;
}

.iconfont {
  font-family: 'TGIcon' !important;
  font-style: normal;
  font-weight: normal;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

### 使用方式

```html
<!-- WXML 中使用 -->
<text class="iconfont icon-gift"></text>
<text class="iconfont icon-success"></text>
```

```scss
// SCSS 中控制样式
.icon-gift {
  font-size: var(--tg-font-size-headline);
  color: var(--td-brand-color);
}
```

---

## 方案 B：SVG 图标组件（多色/复杂图标）

适用于：游戏玩法图标、品牌特色图标、需要多色/渐变/动画的图标

### 需要设计为 SVG 的图标清单

| 组件名 | 语义 | 替换 Emoji | 设计要求 |
|--------|------|-----------|---------|
| `svg-golden-egg` | 金蛋 | 🥚 | 金色渐变蛋形，光泽高光，可带裂纹动画 |
| `svg-red-packet` | 红包 | 🧧 | 中国风红包，金色花纹，品牌色点缀 |
| `svg-playing-card` | 卡牌 | 🃏🎴 | 扑克牌造型，正反面设计，翻转动画 |
| `svg-mole` | 地鼠 | 🐹 | Q版地鼠角色，圆润可爱，多表情态 |
| `svg-circus-tent` | 马戏团 | 🎪 | 彩色帐篷，条纹装饰 |
| `svg-bow` | 蝴蝶结 | 🎀 | 丝带蝴蝶结，品牌色 |
| `svg-leaf` | 草叶 | 🌿🍃 | 自然风叶片，用于装饰 |
| `svg-coin-particle` | 金币粒子 | 🪙 | 小型金币，用于动画粒子 |
| `svg-star-particle` | 星光粒子 | ✨💫🌟 | 多种星光形态，用于动画 |

### SVG 组件技术规范

```html
<!-- 微信小程序 SVG 组件 -->
<image
  class="svg-icon svg-icon--md"
  src="/assets/icons/golden-egg.svg"
  mode="aspectFit"
/>
```

```scss
.svg-icon {
  display: inline-block;
  vertical-align: middle;

  &--sm { width: 32rpx; height: 32rpx; }
  &--md { width: 48rpx; height: 48rpx; }
  &--lg { width: 64rpx; height: 64rpx; }
  &--xl { width: 80rpx; height: 80rpx; }
}
```

### SVG 设计规范

| 维度 | 标准 |
|------|------|
| 文件格式 | SVG（压缩后 < 2KB） |
| 画布尺寸 | 24×24 / 48×48（根据复杂度） |
| 颜色模式 | 使用 currentColor 或固定品牌色 |
| 路径优化 | 合并路径，移除冗余节点，SVGO 压缩 |
| 命名规范 | kebab-case，如 `golden-egg.svg` |
| 存放路径 | `/assets/icons/` 目录 |

---

## 动画粒子替换方案

原来使用 emoji 数组作为动画粒子的场景，统一替换为 SVG 粒子或 CSS 伪元素：

### 替换前（emoji 粒子）

```typescript
// ❌ 不再使用
const particles = ['✨', '⭐', '💫', '🌟', '🎉', '🎊'];
```

### 替换后（SVG 粒子路径）

```typescript
// ✅ 使用 SVG 图标路径
const particles = [
  '/assets/icons/particles/sparkle-1.svg',
  '/assets/icons/particles/sparkle-2.svg',
  '/assets/icons/particles/star-1.svg',
  '/assets/icons/particles/star-2.svg',
  '/assets/icons/particles/ribbon.svg',
  '/assets/icons/particles/confetti.svg',
];
```

### 或使用 CSS 纯色粒子（更轻量）

```scss
.particle {
  &::before {
    content: '';
    display: block;
    width: 8rpx;
    height: 8rpx;
    border-radius: 50%;
    background: var(--td-brand-color);
  }

  &--star::before {
    clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
  }
}
```

---

## Emoji 使用位置完整清单

### 一、WXML 模板中的 Emoji

#### 通用状态图标

| Emoji | 语义 | 出现文件 |
|-------|------|---------|
| ✅ | 成功/已通过 | scan-verify.wxml, inventory.wxml, exchange-result.wxml, my-listings.wxml, audit-list.wxml |
| ❌ | 失败/已拒绝 | scan-verify.wxml, camera.wxml, result-modal.wxml, exchange-result.wxml, customer-service.wxml |
| ⚠️ | 警告/错误 | auth.wxml, dispute.wxml, listing-detail.wxml, my-orders.wxml, exchange-detail.wxml, exchange-order-detail.wxml, consume-submit.wxml, inventory.wxml, chat.wxml, market.wxml, lottery.wxml |
| ❓ | 未知/未揭示 | result-modal.wxml |

#### 业务功能图标

| Emoji | 语义 | 出现文件 |
|-------|------|---------|
| 📦 | 仓库/物品/发货 | inventory.wxml, market.wxml, my-listings.wxml, exchange-detail.wxml, exchange-market.wxml, exchange-orders.wxml, auction-hall.wxml |
| 💎 | 星石/资产/高级 | ad-campaigns.wxml, ad-detail.wxml, ad-create.wxml, auction-detail.wxml, auction-hall.wxml, exchange-shelf.wxml, premium-space.wxml, grid.wxml |
| 💰 | 积分/价格/出价 | auction-detail.wxml, gashapon.wxml, trade-upload-records.wxml, whackmole.wxml |
| 🪙 | 金币 | exchange-market.wxml, lucky-space.wxml, pinball.wxml |
| 🔨 | 拍卖锤/砸蛋 | auction-hall.wxml, auction-create.wxml, whackmole.wxml, lottery-modes.wxml |
| ⚒️ | 铸造 | exchange-detail.wxml, lucky-space.wxml, premium-space.wxml, exchange-result.wxml |
| 🎁 | 奖品/礼物 | grid.wxml, wheel.wxml, scratch.wxml, card.wxml, result-modal.wxml, flashsale.wxml, luckybag.wxml, redpacket.wxml, pinball.wxml, exchange-detail.wxml, exchange-market.wxml, prize-detail-modal.wxml, auth.wxml |
| 🔥 | 热门/连击 | camera.wxml, market.wxml, whackmole.wxml, flashsale.wxml |
| ⭐ | 评分/得分 | exchange-orders.wxml, whackmole.wxml, inventory.wxml |
| 🏆 | 奖杯/奖励 | inventory.wxml, whackmole.wxml |
| 🎰 | 抽奖 | auth.wxml |
| 🎉 | 庆祝/成功 | my-listings.wxml, listing-detail.wxml, flashsale.wxml, result-modal.wxml, blindbox.wxml, pinball.wxml, popup-banner.wxml, trade-upload-records.wxml |
| 🎯 | 目标/精准 | whackmole.wxml |
| 🔗 | 连接 | customer-service.wxml |
| 🎲 | 随机 | result-modal.wxml |
| ⚡ | 闪电 | flashsale.wxml, pinball.wxml |
| 🍀 | 幸运 | exchange-shelf.wxml, lucky-space.wxml |

#### 抽奖玩法专用图标

| Emoji | 语义 | 出现文件 |
|-------|------|---------|
| 🥚 | 金蛋 | lottery-modes.wxml |
| 🧧 | 红包 | redpacket.wxml |
| 🃏 / 🎴 | 卡牌 | cardcollect.wxml, card.wxml |
| 🐹 | 地鼠 | whackmole.wxml |
| 🎪 | 马戏团 | grid.wxml |
| 🎊 | 彩带 | cardcollect.wxml, grid.wxml |

#### 装饰性粒子

| Emoji | 用途 | 出现文件 |
|-------|------|---------|
| ✨ | 闪光 | blindbox, gashapon, pinball, whackmole, cardcollect, redpacket, result-modal |
| 💫 | 旋转星 | blindbox, gashapon, pinball, whackmole, inventory |
| 🌟 | 发光星 | blindbox, pinball, luckybag |
| 🎀 | 蝴蝶结 | blindbox, luckybag |
| 🌿 / 🍃 / ☘️ / 🌱 | 草地 | whackmole |

---

### 二、TypeScript 中的 Emoji

| 文件 | Emoji | 用途 |
|------|-------|------|
| `utils/auction-helpers.ts` | 🔥, ✅, ❌, ⚠️, 🎉 | 拍卖状态图标映射 |
| `trade-upload-records.ts` | 💰, ✅, ❌, ❓ | 记录状态/筛选图标 |
| `ad-detail.ts` | ✅, ❌ | 广告审核状态 |
| `exchange-orders.ts` | 📦, ⭐ | 订单步骤图标 |
| `exchange-order-detail.ts` | 📦, ⭐ | 订单详情步骤 |
| `inventory.ts` | 🎁, ✅ | 物品类型图标 |
| `auction-detail.ts` | 🔨, 🎉 | 页面标题/toast |
| `auction-hall.ts` | 🔨 | 页面标题 |
| `exchange-detail.ts` | 🔥, 📦, 🎉 | 标签/toast |
| `lottery.ts` | ✅, ❌ | 审核状态 |
| `points-detail.ts` | ⚠️ | 错误提示 |
| `auth.ts` | ⚠️ | 错误提示 |
| `feedback.ts` | ⚠️ | 分类图标 |
| `issues.ts` | 💎, 🎰 | 分类图标 |
| `whackmole.ts` | 🌿, 🍃, ☘️, 🌱, ✨, 🏆, ⭐, 🎯 | 粒子/结果文案 |
| `blindbox.ts` | ✨, ⭐, 🎁, 🎀, 💫, 🌟, 🎉, 🎊 | 动画粒子 |
| `pinball.ts` | ✨, ⭐, 💫, 🌟 | 动画粒子 |
| `luckybag.ts` | ✨, 🧧, 🎁, 💰, 🎀, 🌟, 💫, 🪙 | 动画粒子 |
| `gashapon.ts` | ⭐, ✨, 💫 | 动画粒子 |
| `my-listings.ts` | ⚠️ | 日志警告 |
| `customer-service.ts` | ✅ | 注释标记 |

---

### 三、JSON 配置

| 文件 | Emoji | 用途 |
|------|-------|------|
| `pages/lottery/lottery.json` | 🎰 | 导航栏标题 |

---

## 执行计划

### P0 — 立即执行

1. 设计并导出所有 iconfont 图标（22 个新图标）
2. 更新 `styles/_iconfont.scss` 字体文件
3. 替换所有 WXML 中的 emoji 为 `<text class="iconfont icon-xxx">`
4. 替换所有 TS 中的 emoji 字符串为 iconfont 类名引用

### P1 — 设计完成后执行

1. 设计 SVG 游戏图标（金蛋、红包、卡牌、地鼠等）
2. 创建 `/assets/icons/` 目录结构
3. 替换游戏玩法中的 emoji 为 SVG image 组件

### P2 — 动画优化

1. 设计 SVG 粒子图标或实现 CSS 纯色粒子
2. 替换所有 TS 中的 emoji 粒子数组
3. 移除 lottery.json 标题中的 emoji

---

## 文件目录结构

```
assets/
└── icons/
    ├── common/          # 通用图标 SVG（状态、功能）
    │   ├── success.svg
    │   ├── error.svg
    │   ├── warning.svg
    │   └── ...
    ├── game/            # 游戏玩法图标 SVG
    │   ├── golden-egg.svg
    │   ├── red-packet.svg
    │   ├── playing-card.svg
    │   ├── mole.svg
    │   └── ...
    └── particles/       # 动画粒子 SVG
        ├── sparkle-1.svg
        ├── sparkle-2.svg
        ├── star-1.svg
        ├── confetti.svg
        └── ...
```

---

## 验收标准

- [ ] 项目中 0 个 emoji 字符出现在用户可见的 UI 中
- [ ] 所有图标通过 iconfont 或 SVG 渲染
- [ ] 图标在 iOS / Android / 开发者工具中渲染完全一致
- [ ] 图标颜色全部使用 Design Token 变量控制
- [ ] 图标尺寸全部使用规范中定义的尺寸档位
- [ ] 同一功能区域内图标风格 100% 统一
- [ ] SVG 文件单个 < 2KB（压缩后）
- [ ] iconfont 字体文件总大小 < 50KB
