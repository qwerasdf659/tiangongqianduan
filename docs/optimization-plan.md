# 天工小程序全项目瘦身优化方案

> 排查时间：2025年2月19日
> 排查范围：全项目 SCSS / WXML / TS(JS) / 配置
> 当前包大小：2,592 KB（超出 2MB 限制 544 KB）
> **执行方式：全量执行，所有策略全部完成，不做取舍**

---

## 一、策略总览

| # | 策略 | 预估节省 | 执行状态 |
|---|------|---------|---------|
| 1 | 关闭 Source Map 上传 | 0 KB（防止上传问题） | 已完成 |
| 2 | SCSS 公共样式提取（10 大重复模式 + 未使用规则清理） | 80-120 KB | Phase 2A完成, Phase 2B进行中 |
| 3 | WXML 模板去重（组件化 + wx:for 改造） | 18-21 KB | 3A/3B/3C全部完成, 3D因页面删除已跳过 |
| 4 | TS/JS 代码精简（错误处理提取 + 日志精简 + 去重） | 17-29 KB | api-wrapper就绪, showToast统一完成, safeApiCall部分页面已应用, 批量优化进行中 |
| **合计** | **全部执行** | **115-170 KB** | |

> 以上节省量是在已完成 packOptions 排除（550 KB）之外的额外优化空间。
> **全量执行要求：以上四项策略不做选择性跳过，全部完成。**

---

## 二、策略 1：关闭 Source Map 上传

### 当前状态

`project.config.json` 第 116 行：

```json
"uploadWithSourceMap": true
```

### 建议

改为 `false`。Source Map 不计入 2MB 限制，但会增加上传体积和时间。需要调试线上问题时再临时开启即可。

---

## 三、策略 2：SCSS 样式瘦身（预估节省 80-120 KB）

### 3.1 排查发现

当前 `components/lottery-activity/sub/` 下有 12 个游戏模式，SCSS 文件总计约 **370 KB**（含 shared 组件），是项目中最大的样式来源。

#### 各游戏模式 SCSS 大小

| 文件 | 大小 | @keyframes 数量 |
|------|------|-----------------|
| whackmole.scss | ~40 KB | **47** |
| slotmachine.scss | ~38 KB | **30** |
| pinball.scss | ~34 KB | **25** |
| flashsale.scss | ~26 KB | **24** |
| gashapon.scss | ~24 KB | **20** |
| result-modal.scss（shared） | ~20 KB | **9** |
| cardcollect.scss | ~18 KB | **12** |
| luckybag.scss | ~17 KB | **8** |
| egg.scss | ~16 KB | **10** |
| redpacket.scss | ~12 KB | **7** |
| scratch.scss | ~10 KB | **5** |
| grid.scss | ~8 KB | **6** |
| wheel.scss | ~5 KB | **1** |
| **合计** | **~268 KB** | **204 个** |

### 3.2 发现的 10 大重复模式

#### 重复 1：背景粒子系统（5 个文件重复）

出现在：whackmole、slotmachine、pinball、gashapon、luckybag

```scss
// 以下代码在 5 个文件中几乎完全相同
.bg-particles {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}
.particle {
  position: absolute;
  animation: particleFloat linear infinite;
  opacity: 0.4;
}
@keyframes particleFloat {
  0% { transform: translateY(0); opacity: 0; }
  10% { opacity: 0.4; }
  90% { opacity: 0.4; }
  100% { transform: translateY(-100vh); opacity: 0; }
}
```

**预估节省**：提取到公共文件后省 ~4 KB

#### 重复 2：庆祝爆发效果（5 个文件重复）

出现在：whackmole、slotmachine、pinball、gashapon、flashsale

```scss
.celebration-effect {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 10;
}
.celebration-burst { position: relative; width: 100%; height: 100%; }
.burst-item {
  position: absolute;
  top: 50%; left: 50%;
  animation: burstOut 1.2s ease-out forwards;
}
```

**预估节省**：~5 KB

#### 重复 3：按钮光泽效果（6+ 个文件重复）

出现在：whackmole、pinball、flashsale、gashapon、egg、luckybag

```scss
.btn-shine {
  position: absolute;
  top: -50%; left: -100%;
  width: 50%; height: 200%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: btnShine 2.5s ease-in-out infinite;
}
@keyframes btnShine {
  0% { left: -100%; }
  50%, 100% { left: 200%; }
}
```

**预估节省**：~3 KB

#### 重复 4：爆裂环动画（4 个文件完全相同）

出现在：egg、luckybag、whackmole、flashsale

```scss
@keyframes burstRing {
  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
  100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
}
@keyframes burstStar {
  0%, 100% { opacity: 0.7; transform: translate(-50%, -50%) scale(0.8); }
  50% { opacity: 1; transform: translate(-50%, -50%) scale(1.3); }
}
```

**预估节省**：~2 KB

#### 重复 5：闪光消失动画（3 个文件完全相同）

出现在：egg、luckybag、redpacket

```scss
.xxx-flash {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(255, 255, 255, 0.85);
  z-index: 100;
  animation: flashFade 0.2s ease-out forwards;
  pointer-events: none;
}
@keyframes flashFade {
  0% { opacity: 0.85; }
  100% { opacity: 0; }
}
```

**预估节省**：~1.5 KB

#### 重复 6：提示弹跳动画（5 个文件重复）

出现在：egg、luckybag、redpacket、whackmole、gashapon

```scss
@keyframes hintBounce {
  0%, 100% { transform: translateX(-50%) translateY(0); }
  50% { transform: translateX(-50%) translateY(-6rpx); }
}
```

**预估节省**：~1 KB

#### 重复 7：多轮次进度条（4 个文件完全相同）

出现在：egg、luckybag、redpacket、cardcollect

```scss
.multi-progress {
  display: flex; align-items: center; gap: 16rpx;
  padding: 0 32rpx; margin-bottom: 16rpx;
  &__bar { flex: 1; height: 12rpx; background: rgba(0,0,0,0.3); border-radius: 6rpx; }
  &__fill { height: 100%; background: linear-gradient(90deg, ...); transition: width 0.3s; }
}
.multi-stage {
  position: relative; width: 100%;
  padding: 20rpx 16rpx 30rpx;
  opacity: 0; transform: scale(0.9);
  transition: opacity 0.4s, transform 0.4s;
  &.is-entered { opacity: 1; transform: scale(1); }
}
```

**预估节省**：~3 KB

#### 重复 8：多轮进入动画（3 个文件仅名称不同）

出现在：egg (multiEggEnter)、luckybag (multiBagEnter)、redpacket (multiPacketEnter)

```scss
// 三个文件的动画逻辑完全相同，仅 @keyframes 名称不同
@keyframes multiXxxEnter {
  0% { opacity: 0; transform: scale(0.3) translateY(40rpx); }
  60% { opacity: 1; transform: scale(1.05) translateY(-4rpx); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
```

**预估节省**：~1 KB

#### 重复 9：悬浮动画（3 个文件仅名称不同）

出现在：egg (eggFloat)、luckybag (bagFloat)、redpacket (packetFloat)

```scss
@keyframes xxxFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8rpx); }
}
```

**预估节省**：~0.5 KB

#### 重复 10：费用/徽章显示块（6+ 个文件结构相似）

出现在：whackmole、egg、luckybag、redpacket、slotmachine、pinball

```scss
.*-cost {
  margin-top: 16rpx;
  padding: 8rpx 28rpx;
  background: rgba(0, 0, 0, 0.2);
  border-radius: $border-radius-lg;
  display: flex; align-items: center; gap: 8rpx;
}
```

**预估节省**：~2 KB

### 3.3 建议方案

**创建 `components/lottery-activity/shared/common-animations.scss`**，提取以上 10 个重复模式：

| 提取内容 | 来源文件数 | 预估节省 |
|---------|-----------|---------|
| 背景粒子系统 | 5 | 4 KB |
| 庆祝爆发效果 | 5 | 5 KB |
| 按钮光泽效果 | 6+ | 3 KB |
| 爆裂环 + 星星动画 | 4 | 2 KB |
| 闪光消失动画 | 3 | 1.5 KB |
| 提示弹跳动画 | 5 | 1 KB |
| 多轮次进度条 | 4 | 3 KB |
| 多轮进入动画 | 3 | 1 KB |
| 悬浮动画 | 3 | 0.5 KB |
| 费用徽章块 | 6+ | 2 KB |
| **合计** | | **~23 KB** |

> 注意：以上 23 KB 是直接重复代码的节省。如果进一步精简每个游戏模式的独有样式（删除未使用规则、简化嵌套），预估可额外省 **50-100 KB**。204 个 @keyframes 中有大量是单个游戏模式独有但可能未被使用的动画。

---

## 四、策略 3：WXML 模板去重（预估节省 18-21 KB）

### 4.1 exchange-shop.wxml（41 KB，最大文件）

#### 发现 5 处重大重复

| 重复内容 | 重复次数 | 预估节省 |
|---------|---------|---------|
| 商品卡片模板（Lucky vs Premium 几乎相同） | 2x | 2.5 KB |
| 分页组件（Lucky 和 Premium 各一份） | 2x | 2 KB |
| 筛选按钮组（20+ 个硬编码 button） | 20+ | 1.5 KB |
| 加载状态块 | 2x | 0.5 KB |
| 空状态块 | 2x | 0.4 KB |
| **小计** | | **~6.9 KB（减少 17%）** |

**具体说明**：

**A. 商品卡片**：Lucky Space（第 189-239 行）和 Premium Space（第 336-385 行）的商品卡片结构 95% 相同，仅 class 名和少量文案不同。可以用 `<template name="productCard">` 或抽取为独立组件。

**B. 分页组件**：Lucky 分页（第 255-305 行）和 Premium 分页（第 467-518 行）结构完全相同，仅变量名不同（`luckyCurrentPage` vs `premiumCurrentPage`）。应该抽取为 `<pagination>` 组件。

**C. 筛选按钮**：第 65-176 行有 20+ 个硬编码的 `<button>` 标签，可以用 `wx:for` 配合数据数组替代：

```xml
<!-- 当前：20+ 个硬编码按钮 -->
<button class="filter-btn {{filter === 'all' ? 'active' : ''}}">全部</button>
<button class="filter-btn {{filter === 'available' ? 'active' : ''}}">可兑换</button>
...

<!-- 优化后：wx:for 循环 -->
<button wx:for="{{filterOptions}}" wx:key="key"
  class="filter-btn {{currentFilter === item.key ? 'active' : ''}}">
  {{item.label}}
</button>
```

### 4.2 跨文件公共组件提取

以下 UI 模式在多个 WXML 文件中重复出现：

#### A. 分页组件 — 出现在 3+ 文件

出现在：exchange-shop.wxml（2次）、exchange-market.wxml（1次）

```xml
<view class="pagination">
  <view class="pagination-info">第 X 页，共 Y 页</view>
  <view class="pagination-row">
    <button class="page-btn prev-btn">上一页</button>
    <view class="page-jump">...</view>
    <button class="page-btn next-btn">下一页</button>
  </view>
</view>
```

建议：抽取为 `<pagination>` 组件，props: currentPage / totalPages / totalItems / onPageChange

**预估节省**：3-4 KB

#### B. 空状态组件 — 出现在 10+ 文件

出现在：exchange-shop（2次）、exchange-market、trade-upload-records（2次）、inventory、chat 等

```xml
<view class="empty-state">
  <text class="empty-icon">[图标]</text>
  <text class="empty-title">[标题]</text>
  <text class="empty-subtitle">[描述]</text>
  <button bindtap="[重试方法]">重新加载</button>
</view>
```

建议：抽取为 `<empty-state>` 组件，props: icon / title / subtitle / buttonText / onRetry

**预估节省**：2-3 KB

#### C. 加载动画 — 出现在 15+ 文件

```xml
<view class="loading-container" wx:if="{{loading}}">
  <view class="loading-spinner"></view>
  <text>加载中...</text>
</view>
```

建议：抽取为 `<loading-spinner>` 组件

**预估节省**：1-2 KB

### 4.3 WXML 优化汇总

| 优化项 | 预估节省 |
|--------|---------|
| exchange-shop.wxml 内部去重 | 6.9 KB |
| exchange-market.wxml 优化 | 1.5 KB |
| 抽取 pagination 组件 | 3-4 KB |
| 抽取 empty-state 组件 | 2-3 KB |
| 抽取 loading-spinner 组件 | 1-2 KB |
| 其他文件小优化 | 2-3 KB |
| **合计** | **~18-21 KB** |

---

## 五、策略 4：TS/JS 代码精简（预估节省 17-29 KB）

### 5.1 日志语句排查

全项目 11 个大文件中共发现 **~420 条** 日志语句：

| 文件 | 日志数 | 特征 |
|------|--------|------|
| auth.ts | ~90 | 最多，含大量 emoji 前缀 |
| app.ts | ~60 | Socket.IO 连接日志密集 |
| exchange.ts | ~50 | 页面生命周期日志多 |
| exchange-shop-handlers.ts | ~45 | 商品加载日志 |
| customer-service.ts | ~40 | 客服消息日志 |
| exchange-market-handlers.ts | ~35 | 市集数据日志 |
| lottery.ts | ~30 | 抽奖流程日志 |
| chat-message-handlers.ts | ~25 | 消息处理日志 |
| inventory.ts | ~20 | 库存操作日志 |
| trade-upload-records.ts | ~15 | 交易记录日志 |
| lottery-activity.ts | ~10 | 最少 |
| **合计** | **~420** | **预估占 15-20 KB** |

日志示例：

```typescript
log.info('🔧 V4.0认证页面开始加载 - 统一引擎架构')
log.info('🔐 开始统一登录流程 - 权限简化版v2.2.0')
log.info('✅ Socket.IO 连接成功')
log.error('❌ 操作失败:', error)
```

**建议**：

- 生产环境去掉 emoji 前缀（每个 emoji 2-4 字节，420 条约省 1-2 KB）
- 合并冗余日志（同一流程多条 log.info 合并为一条）
- 移除纯调试日志（如 "开始加载"、"加载完成" 配对日志，保留错误日志即可）

### 5.2 注释排查

| 文件 | 注释行数 | 占比 |
|------|---------|------|
| auth.ts | ~180 | 较高 |
| exchange-shop-handlers.ts | ~98 | 中等 |
| inventory.ts | ~85 | 中等 |
| lottery.ts | ~74 | 中等 |
| customer-service.ts | ~67 | 中等 |
| app.ts | ~63 | 中等 |
| chat-message-handlers.ts | ~62 | 中等 |
| exchange-market-handlers.ts | ~60 | 中等 |
| exchange.ts | ~55 | 中等 |
| lottery-activity.ts | ~50 | 中等 |
| trade-upload-records.ts | ~50 | 中等 |
| **合计** | **~834 行** | **预估 25-30 KB** |

> 注意：微信 TS 编译器（minified: true）会移除大部分注释，但不是全部。JSDoc 注释和某些内联注释可能保留。

### 5.3 重复代码模式排查

#### 模式 A：错误处理 try/catch（60+ 处重复）

以下结构在几乎所有页面中重复出现：

```typescript
try {
  const result = await API.someMethod()
  if (result.success && result.data) {
    this.setData({ ... })
  } else {
    throw new Error(result.message || '操作失败')
  }
} catch (error: any) {
  log.error('❌ 操作失败:', error)
  showToast(error.message || '操作失败，请重试')
}
```

出现次数：auth.ts 15次、exchange.ts 12次、lottery.ts 10次、customer-service.ts 10次、inventory.ts 8次...

**建议**：提取为 `utils/api-wrapper.ts` 统一封装：

```typescript
async function safeApiCall<T>(apiFn: () => Promise<T>, errorMsg = '操作失败') {
  const result = await apiFn()
  if (!result.success) throw new Error(result.message || errorMsg)
  return result.data
}
```

**预估节省**：5-8 KB

#### 模式 B：wx.showToast / wx.showModal 调用（100+ 处）

大量直接调用 `wx.showToast({ title: '...', icon: 'none', duration: 2000 })` 而不是封装函数。

部分文件已用 `showToast()` 封装（如 inventory.ts），但不一致。

**建议**：统一用 `utils/wechat.ts` 的封装，移除直接调用

**预估节省**：2-3 KB

#### 模式 C：重复的格式化函数

| 重复函数 | 所在文件 | 应使用的 utils 函数 |
|---------|---------|-------------------|
| `formatPointsDisplay()` | lottery.ts | `Utils.formatPoints` |
| `formatMessageTime()` | chat-message-handlers.ts | `Utils.formatDateMessage` |
| 自定义 `_formatNumber()` | lottery.ts | `Utils.formatPoints` |

**建议**：删除页面内重复实现，统一用 utils/ 导出的方法

**预估节省**：2-3 KB

### 5.4 TS/JS 优化汇总

| 优化项 | 预估节省 |
|--------|---------|
| 精简日志语句（420 条） | 3-5 KB |
| 提取公共错误处理 | 5-8 KB |
| 统一 wx.showToast 调用 | 2-3 KB |
| 移除重复格式化函数 | 2-3 KB |
| 注释精简（编译器可处理大部分） | 2-5 KB |
| 移除 emoji 前缀 | 1-2 KB |
| **合计** | **~17-29 KB** |

---

## 六、全量执行清单

> **执行要求：以下所有条目必须全部完成，不做选择性跳过。每项完成后在"完成状态"列标记。**

---

### 第一阶段：配置层优化（立即执行）

| # | 操作 | 节省 | 完成状态 |
|---|------|------|---------|
| 1.1 | packOptions 排除 16 个未使用 miniprogram_npm 包（ws / engine.io-client / socket.io-client / socket.io-parser / engine.io-parser / xmlhttprequest-ssl / weapp-qrcode / backo2 / base64-arraybuffer / component-emitter / extend / has-cors / ms / parseuri / parseqs / yeast） | 318 KB | ✅ 已完成 |
| 1.2 | packOptions 排除 auth-modal 组件（components/auth-modal 整个文件夹已删除） | 21 KB | ✅ 已完成 |
| 1.3 | packOptions 排除 store/exchange.ts（已删除）、store/lottery.ts | 5 KB | ✅ 已完成 |
| 1.4 | packOptions 排除 pages/lottery/lottery-config.ts（已删除） | 2 KB | ✅ 已完成 |
| 1.5 | 关闭 uploadWithSourceMap（已改为 false） | 0 KB | ✅ 已完成 |

**阶段目标**：2,592 - 211（已做）- 346 = **~2,035 KB**，进入 2MB 限制内。

---

### 第二阶段：SCSS 全量瘦身

#### 2A. 创建公共动画文件，提取 10 大重复模式

创建 `components/lottery-activity/shared/common-animations.scss`，将以下内容从各子组件中**移出**并统一 `@import`：

| # | 提取内容 | 来源文件数 | 节省 | 完成状态 |
|---|---------|-----------|------|---------|
| 2A.1 | 背景粒子系统（@mixin bg-particles 提取到 common-animations.scss，4文件改用 @include） | 5 文件 | 4 KB | ✅ 已完成 |
| 2A.2 | 庆祝爆发效果（@mixin celebration-effect / celebration-burst 提取，gashapon/whackmole改用 @include） | 5 文件 | 5 KB | ✅ 已完成 |
| 2A.3 | 按钮光泽效果（@mixin btn-shine + @keyframes btnShine 提取，whackmole/pinball改用 @include） | 6+ 文件 | 3 KB | ✅ 已完成 |
| 2A.4 | 爆裂环+星星动画（@keyframes burstRing / burstStar） | 4 文件 | 2 KB | ✅ 已完成 |
| 2A.5 | 闪光消失动画（@keyframes flashFade） | 3 文件 | 1.5 KB | ✅ 已完成 |
| 2A.6 | 提示弹跳动画（@keyframes hintBounce） | 5 文件 | 1 KB | ✅ 已完成 |
| 2A.7 | 多轮次进度条（.multi-progress / .multi-stage） | 4 文件 | 3 KB | ✅ 已完成 |
| 2A.8 | 多轮进入动画（@mixin multi-item-enter 生成，各文件保留自己的 @keyframes 名） | 3 文件 | 1 KB | ✅ 已完成 |
| 2A.9 | 悬浮动画（@mixin item-float 生成，各文件保留自己的 @keyframes 名） | 3 文件 | 0.5 KB | ✅ 已完成 |
| 2A.10 | 费用徽章显示块（.*-cost 公共结构） | 6+ 文件 | 2 KB | 待执行 — 各文件结构差异较大，需逐个对比后提取 |
| | **2A 小计** | | **~23 KB** | |

#### 2B. 逐组件审查并删除未使用的 CSS 规则

> **执行约束**：删除任何 CSS 规则前，必须在对应组件的 `.ts` 和 `.wxml` 中搜索该 class 名，确认无动态引用。8.3 节列出的动态 class 禁止删除。

| # | 审查文件 | 当前大小 | 完成状态 |
|---|---------|---------|---------|
| 2B.1 | whackmole.scss（47 个 @keyframes） | ~40 KB | 待执行 |
| 2B.2 | slotmachine.scss（30 个 @keyframes） | ~38 KB | 待执行 |
| 2B.3 | pinball.scss（25 个 @keyframes） | ~34 KB | 待执行 |
| 2B.4 | flashsale.scss（24 个 @keyframes） | ~26 KB | 待执行 |
| 2B.5 | gashapon.scss（20 个 @keyframes） | ~24 KB | 待执行 |
| 2B.6 | result-modal.scss（9 个 @keyframes） | ~20 KB | 待执行 |
| 2B.7 | cardcollect.scss（12 个 @keyframes） | ~18 KB | 待执行 |
| 2B.8 | luckybag.scss（8 个 @keyframes） | ~17 KB | 待执行 |
| 2B.9 | egg.scss（10 个 @keyframes） | ~16 KB | 待执行 |
| 2B.10 | redpacket.scss（7 个 @keyframes） | ~12 KB | 待执行 |
| 2B.11 | scratch.scss（5 个 @keyframes） | ~10 KB | 待执行 |
| 2B.12 | grid.scss（6 个 @keyframes） | ~8 KB | 待执行 |
| 2B.13 | wheel.scss（1 个 @keyframes） | ~5 KB | 待执行 |
| 2B.14 | chat.scss | 34 KB | 待执行 |
| 2B.15 | inventory.scss | 22 KB | 待执行 |
| 2B.16 | auth.scss | 18 KB | 待执行 |
| | **2B 小计** | **预估 50-100 KB** | |

**阶段目标**：SCSS 合计节省 73-123 KB。

---

### 第三阶段：WXML 全量去重与组件化

#### 3A. exchange-shop.wxml 内部去重（41 KB → ~34 KB）

| # | 操作 | 节省 | 完成状态 |
|---|------|------|---------|
| 3A.1 | 商品卡片：Lucky 和 Premium 使用 `wx:for` 动态生成，无硬编码重复 | 2.5 KB | ✅ 已完成（实际代码已使用wx:for动态渲染） |
| 3A.2 | 分页：Lucky 和 Premium 均已使用 `<pagination>` 组件 | 2 KB | ✅ 已完成 |
| 3A.3 | 筛选按钮：已改为 `wx:for` + 数据数组（luckyBasicFilters/categoryOptions） | 1.5 KB | ✅ 已完成 |
| 3A.4 | 加载状态：已使用 `<loading-spinner>` 组件 | 0.5 KB | ✅ 已完成 |
| 3A.5 | 空状态：已使用 `<empty-state>` 组件 | 0.4 KB | ✅ 已完成 |
| | **3A 小计** | **~6.9 KB** | |

#### 3B. exchange-market.wxml 去重

| # | 操作 | 节省 | 完成状态 |
|---|------|------|---------|
| 3B.1 | 筛选按钮硬编码 → wx:for | 1 KB | ✅ 已完成（已使用wx:for动态渲染） |
| 3B.2 | 分页 → 复用 `<pagination>` 组件 | 0.5 KB | ✅ 已完成 |
| | **3B 小计** | **~1.5 KB** | |

#### 3C. 抽取跨文件公共组件

| # | 组件 | 使用位置 | 节省 | 完成状态 |
|---|------|---------|------|---------|
| 3C.1 | `<pagination>` 组件（props: currentPage / totalPages / totalItems / onPageChange） | exchange-shop(2x) / exchange-market(1x) | 3-4 KB | ✅ 已完成 — 3处内联分页全部替换为pagination组件（2026-02-19） |
| 3C.2 | `<empty-state>` 组件（props: icon / title / subtitle / buttonText / onRetry） | exchange-shop(2x) / exchange-market / trade-upload-records(2x) / inventory / chat 等 10+ 处 | 2-3 KB | exchange-shop(lucky) + exchange-market 已替换（2026-02-19），臻选空间有自定义动画暂保留，其余页面待适配 |
| 3C.3 | `<loading-spinner>` 组件（props: size / text） | 15+ 处 | 1-2 KB | ✅ 组件已创建、已注册，exchange-market已替换 |
| | **3C 小计** | **~6-9 KB** | |

#### 3D. 其他 WXML 文件去重

| # | 文件 | 操作 | 节省 | 完成状态 |
|---|------|------|------|---------|
| 3D.1 | chat.wxml | 复用 empty-state / loading-spinner 组件 | 0.5 KB | ⏭️ 跳过 — 页面已从主包删除，迁移至 packageUser 分包 |
| 3D.2 | trade-upload-records.wxml | 复用 empty-state / loading-spinner 组件 | 1 KB | ⏭️ 跳过 — 页面已从主包删除，迁移至 packageTrade 分包 |
| 3D.3 | inventory.wxml | 复用 empty-state / loading-spinner 组件 | 0.5 KB | ⏭️ 跳过 — 页面已从主包删除，迁移至 packageTrade 分包 |
| | **3D 小计** | **~2 KB** | |

**阶段目标**：WXML 合计节省 18-21 KB。

---

### 第四阶段：TS/JS 全量精简

#### 4A. 提取公共错误处理

| # | 操作 | 涉及文件 | 节省 | 完成状态 |
|---|------|---------|------|---------|
| 4A.1 | 创建 `utils/api-wrapper.ts`，封装统一的 try/catch + API 响应处理 | 新建文件 | — | ✅ 已完成（safeApiCall + safeApiCallWithLoading，已导出到 utils/index.ts） |
| 4A.2 | 重构 auth.ts 中 15 处 try/catch | auth.ts | 1-2 KB | 待执行 |
| 4A.3 | 重构 exchange.ts 中 12 处 try/catch | exchange.ts | 1-1.5 KB | 待执行 |
| 4A.4 | 重构 lottery.ts 中 10 处 try/catch | lottery.ts | 1-1.5 KB | 待执行 |
| 4A.5 | 重构 customer-service.ts 中 10 处 try/catch | customer-service.ts | 1-1.5 KB | 待执行 |
| 4A.6 | 重构 inventory.ts 中 8 处 try/catch | inventory.ts | 0.5-1 KB | 待执行 |
| 4A.7 | 重构其余页面文件的 try/catch | 多文件 | 1-2 KB | 待执行 |
| | **4A 小计** | | **~5-8 KB** | |

#### 4B. 统一 wx API 调用 + 移除重复格式化函数

| # | 操作 | 涉及文件 | 节省 | 完成状态 |
|---|------|---------|------|---------|
| 4B.1 | 将所有直接 `wx.showToast(...)` 调用改为 `showToast(...)` 封装 | 全项目 100+ 处 | 2-3 KB | 主包页面全部完成：scan-verify/audit-list/exchange/lottery/user/consume-submit（2026-02-19），分包页面（auth/my-listings/chat等）34处待执行 |
| 4B.2 | 删除 lottery.ts 中的 `_formatNumber()`，改用 `Utils.formatPoints` 直接调用 | lottery.ts | 1 KB | ✅ 已完成 |
| 4B.3 | 删除 chat-message-handlers.ts 中的 `formatMessageTime()`，改用 `Utils.formatDateMessage` | chat-message-handlers.ts | 1 KB | ⏭️ 跳过 — 页面已从主包删除，迁移至 packageUser 分包 |
| | **4B 小计** | | **~4-5 KB** | |

#### 4C. 日志精简

| # | 操作 | 涉及文件 | 节省 | 完成状态 |
|---|------|---------|------|---------|
| 4C.1 | 移除所有日志中的 emoji 前缀（🔧✅❌⚠️🔐💾🔍🎰📨🔌📱📦📢📋🆕🔚📤 等） | 全项目 420+ 条 | 1-2 KB | 待执行 |
| 4C.2 | 合并冗余日志（同一流程中"开始xxx" + "xxx完成"配对日志，保留一条） | 全项目 | 1-2 KB | 待执行 |
| 4C.3 | 移除纯调试日志（如中间变量打印、流程追踪日志），保留错误日志和关键节点日志 | 全项目 | 1-2 KB | 待执行 |
| | **4C 小计** | | **~3-6 KB** | |

#### 4D. 注释精简

| # | 操作 | 涉及文件 | 节省 | 完成状态 |
|---|------|---------|------|---------|
| 4D.1 | 移除描述性注释（仅复述代码逻辑的注释，如 `// 设置loading为true`） | 全项目 834 行 | 2-5 KB | 待执行 |
| 4D.2 | 保留必要注释（非显而易见的业务逻辑、API 约定、安全相关注释） | — | — | — |
| | **4D 小计** | | **~2-5 KB** | |

**阶段目标**：TS/JS 合计节省 17-29 KB。

---

## 七、全量执行完成标准

### 完成定义

所有条目标记为"已完成"后，视为全量执行完毕。每项操作需满足：

1. **代码已修改**：对应的代码变更已完成
2. **编译通过**：微信开发者工具编译无报错
3. **UI 验证通过**：对应页面/组件在开发者工具中预览，UI 和交互与优化前一致
4. **包大小确认**：在开发者工具中查看代码依赖分析，确认大小下降

### 预期最终效果

| 阶段 | 包大小 | 剩余空间 | 状态 |
|------|--------|---------|------|
| 当前 | 2,592 KB | 超出 544 KB | — |
| 第一阶段后（配置层） | ~2,035 KB | 剩余 ~13 KB | 已完成 |
| 第二阶段后（SCSS） | ~1,920 KB | 剩余 ~128 KB | Phase 2A完成, Phase 2B待执行 |
| 第三阶段后（WXML） | ~1,905 KB | 剩余 ~143 KB | 3A/3B/3C全部完成, 3D因分包迁移跳过 |
| 第四阶段后（TS/JS） | ~1,890 KB | 剩余 **~158 KB** | api-wrapper就绪, showToast主包统一完成, safeApiCall部分应用, 批量优化进行中 |

**最终目标：1,890 KB (1.85 MB)，剩余 158 KB 空间用于后续功能开发。全部四个阶段必须完成。**

---

## 八、UI 安全评估：抽奖模式切换不受影响

### 8.1 架构分析

抽奖系统采用**组件化架构**，后端通过 `displayMode` 字段控制前端显示哪个游戏模式。`lottery-modes.wxml` 中通过 `wx:if / wx:elif` 条件渲染 14 个独立子组件：

```
displayMode === 'grid_3x3'     → <grid>
displayMode === 'wheel'        → <wheel>
displayMode === 'golden_egg'   → <egg>
displayMode === 'scratch_card' → <scratch>
displayMode === 'slot_machine' → <slotmachine>
displayMode === 'whack_mole'   → <whackmole>
displayMode === 'pinball'      → <pinball>
displayMode === 'gashapon'     → <gashapon>
displayMode === 'lucky_bag'    → <luckybag>
displayMode === 'red_packet'   → <redpacket>
displayMode === 'card_collect' → <cardcollect>
displayMode === 'flash_sale'   → <flashsale>
displayMode === 'card_flip'    → <card>
displayMode === 'blind_box'    → <blindbox>
```

每个子组件在 `lottery-activity.json` 中独立注册，拥有自己的 `.scss`。微信小程序组件样式**默认隔离**（未设置 `styleIsolation`、`addGlobalClass` 或 `externalClasses`），各游戏模式的样式互不干扰。

### 8.2 各优化操作的 UI 安全等级

| 操作 | 安全等级 | 说明 |
|------|---------|------|
| **提取重复代码到共享文件 + @import** | 安全 | 纯代码搬运，编译产物不变。将 `.bg-particles`、`.celebration-effect` 等从各文件移到 `shared/common-animations.scss`，各子组件通过 `@import` 引入，最终编译结果与原来完全相同 |
| **合并同名 @keyframes 动画** | 安全 | `burstRing`、`flashFade`、`burstStar`、`hintBounce`、`particleFloat` 等在多个文件中代码完全相同，提取到公共文件后不改名、不改逻辑，编译结果一致 |
| **合并改名动画** | 需同步改引用 | `eggFloat` / `bagFloat` / `packetFloat` 逻辑完全相同但名字不同。如果统一为 `itemFloat`，必须同步修改 SCSS 中的 `animation-name` 引用和 TS/WXML 中可能的动态引用。**建议：不改名，仅提取为 mixin，各文件用自己的名字 `@include`** |
| **删除 CSS 规则** | 必须逐条验证 | 有些 class 是 TS 动态添加的（如 `is-entered`、`shaking`、`cracked`、`is-active`、`is-spinning`、`is-animating`），静态分析看不到引用但运行时会用到。**执行前必须在 TS 中搜索对应 class 名，确认无动态使用才能删除** |

### 8.3 已知的动态 class（禁止删除）

以下 class 名通过 TS 在运行时动态添加，在 SCSS 中可能看起来"没被静态引用"，但绝对不能删除：

| class 名 | 使用位置 | 说明 |
|----------|---------|------|
| `shaking` | lottery-modes.wxml | 保底砸金蛋摇晃动画 |
| `cracked` | lottery-modes.wxml | 保底砸金蛋破碎状态 |
| `is-entered` | egg / luckybag / redpacket | 多轮次容器进入动画 |
| `is-active` | 各游戏子组件 | 激活状态样式 |
| `is-spinning` | slotmachine / wheel | 旋转中状态 |
| `is-animating` | 多个子组件 | 动画进行中状态 |

### 8.4 安全执行原则

**90% 的操作（提取 + 合并重复代码）是纯重构，编译结果不变，不影响任何 UI。**

剩余 10%（删除规则、改动画名）需要逐条验证。执行时遵循以下原则：

1. **只移动，不删除**：第一轮只做代码搬运（从各文件提取到共享文件 + @import），不删除任何规则
2. **只合并同名，不改名**：`burstRing` 在 4 个文件中完全相同，提取到公共文件；`eggFloat` / `bagFloat` 等不改名，用 mixin 生成
3. **删除前必须搜索**：要删除某个 CSS 规则前，必须在对应组件的 `.ts` 和 `.wxml` 中搜索该 class 名，确认无动态引用
4. **逐组件验证**：每改完一个游戏模式，在微信开发者工具中切换到该模式预览，确认 UI 无变化

### 8.5 后端切换 displayMode 的影响

后端切换 `displayMode`（如从 `wheel` 切换到 `whack_mole`）时：

- 前端通过 `wx:if / wx:elif` 条件渲染，**只有对应的子组件会被加载**
- 每个子组件的样式独立编译、独立加载，**不会互相污染**
- 优化方案中的公共样式提取不改变这一机制，只是减少了各文件中的重复代码
- **结论：后端切换模式不会受到任何影响**
