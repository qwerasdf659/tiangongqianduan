# 抽奖玩法 UI 统一标准与修改记录

> 适用范围：微信小程序前端项目 `packageLottery/lottery-activity/` 下各抽奖玩法子组件
> 技术栈：原生微信小程序 + TypeScript + Sass + Skyline 渲染
> 维护说明：本文档记录抽奖玩法的 UI 统一标准、已完成修改、待办事项，供前端后续迭代对齐。
> 最近更新：2026-06-15（北京时间）

---

## 一、玩法清单与展示模式

抽奖玩法由后端 `display.mode` 字段驱动，前端在 `lottery-modes.wxml` 中按 mode 渲染对应子组件。

| 序号 | display.mode | 玩法名称 | 奖品格位 | 子组件目录 |
| --- | --- | --- | --- | --- |
| 1 | grid_3x3 | 九宫格 3×3 | 8 奖品 + 中央按钮 | sub/grid |
| 2 | grid_4x3 | 网格 4×3 | 12 奖品 + 下方按钮 | sub/grid |
| 3 | grid_4x4 | 网格 4×4 | 16 奖品 + 下方按钮 | sub/grid |
| 4 | wheel | 大转盘 | 扇区动态 | sub/wheel |
| 5 | golden_egg | 砸金蛋 | 单敲/连敲 | sub/egg |
| 6 | card_flip / flip_card_multi | 卡牌翻转 | 单抽/连翻/M选N | sub/card |
| 7 | scratch_card | 刮刮卡 | 一刮到底/连刮 | sub/scratch |
| 8 | gashapon | 扭蛋机 | 转动手柄抽取 | sub/gashapon |
| 9 | blind_box | 虚拟盲盒 | 点击礼盒开箱 | sub/blindbox |
| - | slotmachine / whackmole / redpacket / luckybag / flashsale / pinball / cardcollect | 其它玩法（未对齐） | - | sub/* |

> 说明：grid_3x3 / grid_4x3 / grid_4x4 共用同一个 `sub/grid` 组件，靠 `displayMode`（权威）+ `gridCols` + `centerButton` 区分布局。

---

## 二、UI 统一标准（暖金主题）

### 2.1 配色规范

全玩法统一使用暖金主题，呼应砸金蛋金蛋视觉，并与小程序整体暖棕调性协调。

| 用途 | 色值 |
| --- | --- |
| 浅档金（高光/浅扇区） | `#FBEDC0` / `#FDF2CF` |
| 中档金（主体/扇区深档） | `#EFCE78` / `#F0CE72` |
| 深档金（描边/收口） | `#D9AF48` / `#BD9433` |
| 按钮文字（金底上保证可读） | `#6B4A12` 深棕 |

- 禁止在抽奖按钮使用墨绿（旧 `#7A9E7E`）、橙红（旧 `#EE5A24`）等与金色冲突的颜色。
- 玩法级的渐变、阴影、动画可自由发挥（属玩法视觉创意），但金色基调需统一。
- 字号、字重、文字颜色等系统级规范仍走 Typography Token，不写死。

### 2.2 奖品名称显示规则

| 区域 | 规则 |
| --- | --- |
| 网格抽奖格子（grid） | 显示**完整** `prize_name`（名称 + 数量都要，如「星石 ×500」「红源晶碎片 ×50」「积分 +10」），不省略、不拆词 |
| 转盘扇区（wheel） | 使用精简标签 `_wheelLabel`：积分类显示全名（「积分 +10」），其它仅显示数量（「×500」），因扇区空间狭小 |
| 卡牌正面（card） | 翻牌揭晓显示**真实奖品图** `prize_image_url`（emoji/礼物图标兜底）+ 完整 `prize_name` |
| 刮卡格子（scratch） | 刮开揭晓显示**真实奖品图** `prize_image_url`（emoji/礼物图标兜底） |
| 底部奖品池（全玩法） | 名称自然换行**最多两行**，超出隐藏 |

精简标签 `_wheelLabel` 由父组件 `lottery-activity.ts` 的 `addPrizeIcon()` 统一预计算：
- `prize_type === 'points'` → `_wheelLabel = prize_name`（完整名）
- 其它类型 → 正则提取 `×/x/*` 后的数字，输出 `×{数量}`；无数量后缀则回退完整名

### 2.3 名称两行显示的正确写法（Skyline 兼容）

底部奖品池名称两行显示，**不要**用 `-webkit-line-clamp` + `word-break: break-all`：
- Skyline 对 `line-clamp` 支持不稳定，第二行可能被裁。
- `break-all` 会把数字从中间拆开（如「积分 +10」被拆成「积分 +1 / 0」）。

正确写法（已在 wheel / egg / grid / card / scratch 奖品池落地）：

```scss
.xxx-prizes__name {
  width: 120rpx;
  text-align: center;
  white-space: normal;
  word-break: break-all;
  line-height: 1.3;
  height: calc(var(--tg-font-size-small) * 1.3 * 2); /* 固定两行高度 */
  overflow: hidden;
}
```

网格抽奖格子要求完整显示，写法不同（不限行数、不拆词）：

```scss
.prize-name {
  white-space: normal;
  word-break: keep-all; /* 不拆词、不拆数字 */
  /* 不加 line-clamp / overflow，名称多长都完整显示 */
}
```

### 2.4 底部奖品池（预览区）

全玩法统一为**自动跑马灯**横向无缝循环：
- 触发条件：奖品数 > 4 时自动滚动（`previewMarquee`），≤4 静止。
- 速度：`previewMarqueeSpeed = max(奖品数 × 2.5, 8)` 秒/圈，由父组件 `lottery-activity.ts` 预计算并与 `prizesForPreview` 同帧下发。
- 实现：轨道内复制两份奖品列表，CSS `@keyframes` 平移 `translate3d(-50%)` 实现无缝循环。
- 卡片样式：白底 + 暖金描边 `rgba(200,160,106,0.2)` + 柔和阴影。

### 2.5 Skyline 布局必守项

- 玩法容器纵向堆叠必须显式写 `flex-direction: column`，否则多个子元素默认横向排列会互相挤压、重合（转盘曾因此与奖品列表重叠）。
- 滚动/跑马灯容器需配 `min-height: 0` 或固定高度，避免内容撑破父容器或被 `contain: paint` 裁切。
- 不在 flex 滚动容器父级随意加 padding，会破坏 `flex: 1` 的高度计算（订单详情页曾因此无法滚动）。

### 2.6 网格布局权威与空格消除（grid）

- **布局权威来源**：以后端 `display.mode`（grid_3x3 / grid_4x3 / grid_4x4）精确匹配布局，不靠 `gridCols` 数字猜。`gridCols` 仅作 mode 缺失时的回退。否则 grid_3x3 会被误判成 4 列布局、出现空格 + 底部按钮。
- **格位数 = 布局上限与实际奖品数的较小值**：`effectiveCellCount = min(layout.cellCount, prizeCount)`，奖品不足布局格位时不渲染多余空白格。
- **WXML 双保险**：4 列格子加 `wx:if="{{prizes[cellIdx]}}"`，无对应奖品的格子不渲染。
- 父组件按 mode 截取奖品上限（3×3 取前 8 / 4×3 取前 12 / 4×4 取前 16），多余奖品进底部奖品池预览。

### 2.7 卡牌卡背华丽标准（card）

- 亮金质感卡背：金质渐变 `#f0d292→#dcb368→#c89a4e→#ad7f38` + 顶部高光 + 描金边框 + 立体内阴影。
- 纯 CSS 花纹（不依赖图片）：`::before` 内描金圆角框 + `::after` 旋转 45° 菱形花纹。
- 四角烫金角花：`card-corner--tl/tr/bl/br` 四个 L 形描金角，带金色辉光。
- 金色流光 + 发光「?」字。
- 交互态金色光晕：选中态（`.selected`）强金光晕、待选悬浮态（`.idle-float`）柔金微光。

### 2.8 刮刮卡金箔涂层标准（scratch）

- 涂层金箔化：金箔渐变 `#f2d692→…→#b8862f`（替代旧灰色涂层），编号文字金白色 + 描边。
- 涂层中心徽记：礼物图标 + 编号 +「刮开有奖」提示语（`cover-emblem`，图标 `coverEmblemBob` 上下浮动），中心不再大片留白。
- 涂层装饰层次：内描金虚线框 `.cover-frame`（彩票质感）+ 三颗漂浮闪烁星点 `.cover-spark`（`coverSparkTwinkle` 微光呼吸）。
- 涂层动态视觉：斜向流光扫过（`scratchSheen`）+ 45° 交叉斜纹金箔纹理 + 中心徽记呼吸光泽（`scratchCenterPulse`）+ 整条暖金外发光 + 四角描金。
- 窄格适配：10 格布局自动隐藏中心图标/提示语/虚线框/星点，仅留编号，避免拥挤。
- 刮开揭晓特效：金光迸发圆环（`scratchBurstRing`）+ 四溅星屑（`scratchSparkle`），叠加奖品 `pop-in` 弹入。
- 多格特效不裁切：揭晓格 `.cell--revealed { overflow: visible; z-index: 4 }`，让迸发/星屑完整飞出窄格边界。

---

## 三、本次已完成修改（2026-06-15）

### 3.1 砸金蛋 egg
- 蛋体渐变改亮金质感：冷白高光 `#fffef5` → 亮金 `#ffd700/#f5c518` → 深金 `#8b6914`，明暗对比增强。
- 放大并柔化弧形高光（50×70rpx → 96×130rpx），腰带与星点加金色辉光。
- 底座加深 + 暖金落地光晕，立体感增强。
- 奖品池名称改两行显示。
- 动态视觉增强：舞台光晕呼吸（`eggStageGlow`）、四周飘浮金色光斑（`eggFloatDust`，stage + eggs-row 共 4 颗）、待选金蛋金光脉冲（`eggIdleGlow`）、选中金蛋强光爆发脉冲（`eggSelectedBurst`）。

### 3.2 转盘 wheel
- **修复布局 bug**：`.wheel-container` 缺 `flex-direction: column`，导致 600rpx 转盘与奖品列表横向挤压重合 → 改纵向，转盘 `flex-shrink: 0`，奖品池占满宽度。
- 扇区配色：8 色彩虹 → 暖金双色交替，经多轮微调定为柔和暖金 `#FBEDC0 / #EFCE78`（奇数扇区防首尾撞色用 `#F5DE9C`）。
- 中心「回馈」按钮、指针：墨绿+橙红 → 暖金渐变，文字深棕。
- 扇区内渲染奖品缩略图（图片优先、图标兜底）。
- 转盘放大：盘面半径 280 → 312rpx，外框 600 → 668rpx。
- 奖品池：静态滑动 → 自动跑马灯，卡片白底金边，名称两行。

### 3.3 网格 grid（3×3 / 4×3 / 4×4）
- 「开启回馈」按钮（中央圆钮 + 整行钮）金色化，文字深棕；中央钮升级为亮金径向渐变 + 双光圈 + 立体阴影。
- 底部奖品池：加自动跑马灯，卡片视觉升级，名称两行。
- 抽奖格子名称：最终定为完整显示 `prize_name`（名称 + 数量），不省略、不拆词、不拆数字。
- **修复布局误判**：`_resolveLayout` 改为按 `display.mode` 权威匹配布局，新增 `displayMode` 属性；grid_3x3 不再被误判成 4 列布局。
- **修复多余空格**：渲染格位数取 `min(布局上限, 实际奖品数)`，且 4 列格子加 `wx:if="{{prizes[cellIdx]}}"`，奖品不足时不再出现空白格。

### 3.4 卡牌 card（card_flip / flip_card_multi）
- 底部奖品池：静态 `scroll-x` → 自动跑马灯，卡片白底金边，名称两行。
- 卡牌正面（单抽/连翻/M选N 三模式）：emoji → 真实奖品图 `prize_image_url`（emoji/礼物图标兜底），新增 `.card-prize-img`。
- 「全部翻开」按钮金色化，文字深棕。
- 卡背华丽升级：亮金渐变 + 描金花纹 + 四角烫金角花 + 金色流光 + 发光「?」。
- 交互态金色光晕：选中态强金光晕、待选悬浮态柔金微光。

### 3.5 刮刮卡 scratch（scratch_card）
- 底部奖品池：静态 `scroll-x` → 自动跑马灯（两个 `<scratch>` 实例均接入），卡片白底金边，名称两行。
- 涂层金箔化：灰色冷工业涂层 → 金箔渐变，编号文字金白色 + 描边。
- 刮开格子用真实奖品图 `prize_image_url`（emoji/礼物图标兜底），新增 `.cell-prize-img`。
- 连刮按钮：经核查为共享组件 `draw-buttons`，本就是金色系（`#D4A85A→#B8864A`），未改（改它影响全玩法）。
- 涂层动态视觉：斜向流光（`scratchSheen`）、45° 斜纹金箔纹理、中心徽记呼吸光泽（`scratchCenterPulse`）、暖金外发光、四角描金。
- 刮开揭晓特效：金光迸发圆环（`scratchBurstRing`）+ 四溅星屑（`scratchSparkle`）；揭晓格 `overflow: visible` 让特效在多格下完整展现。
- **涂层丰富化（2026-06-15 二次迭代，解决单格涂层单调问题）**：刮开前的金箔涂层原来仅有一个编号数字，中心大片留白显单调。新增——中心徽记（礼物图标 `gift` + 编号 +「刮开有奖」提示语，图标上下浮动 `coverEmblemBob`）、内描金虚线框 `.cover-frame`（彩票质感）、三颗漂浮闪烁星点 `.cover-spark`（`coverSparkTwinkle` 微光呼吸）。10 格窄格自动隐藏图标/提示/虚线框/星点，避免拥挤；字体走 Typography Token，金色基调统一，纯 CSS 实现兼容 Skyline。

### 3.6 扭蛋机 gashapon（2026-06-15 对齐暖金主题）
- **胶囊球配色统一**：原为高饱和卡通彩虹色（含违规旧墨绿 `#7A9E7E`，且注释与色值不符），与全局暖金主题割裂、显廉价。改为暖金体系 8 色（亮金/琥珀金/浅香槟/深金/蜜糖金/玫瑰金/暖棕金/古铜），深浅冷暖错落避免死板；修正错误注释。
- **出口配色统一**：银灰金属出口（`#f0f0f0→#c0c0c0`）与暖金最冲突，改为暖金属渐变（`#e8c878→#b8862f`），阴影同步调暖。
- **圆顶玻璃通透化**：圆顶渐变由偏厚重棕调改为更通透的暖金玻璃罩（香槟金 → 亮金 → 琥珀金），提升高级感。
- 说明：胶囊配色属 UI 常量（前端可自主决定），后端若下发 `capsule_colors` 仍会覆盖默认值；本次仅改前端默认值与机身样式，未动业务逻辑。

### 3.7 虚拟盲盒 blindbox（2026-06-15 重做，与扭蛋机区分）
- **根因**：`blindbox` 组件（后端 `blind_box` 模式）此前被错误做成扭蛋机外观——标题硬编码「扭蛋机」「转动手柄」、结构全是 `gashapon__dome`/`handle`，与真正的扭蛋机 `sub/gashapon` 几乎重复，导致「后端发盲盒、显示扭蛋机」「奖品池不会跑马灯」两个问题。
- **重做为真正的盲盒**：神秘礼盒外观（盒身 + 盒盖 + 蝴蝶结 + 竖横丝带 + 问号徽记 + 底部光环），暖金主题。交互改为「点击礼盒 → 抖动蓄力（boxShake）→ 开盖（lidOpen）+ 光束迸发（beamBurst）+ 环形粒子（burstFly）→ 揭晓」状态机（idle/shaking/opening/opened），保留 Worklet timing 动画驱动。
- **奖品池接入跑马灯**：标题改「盲盒奖品」，由手动 `scroll-view` 改为跑马灯轨道结构（双列表复制 + `bbPrizeMarquee`），接入父组件 `previewMarquee`/`previewMarqueeSpeed`，与其它玩法一致；`lottery-modes.wxml` 补传这两个属性。
- 质量门禁：ESLint / tsc --noEmit / Prettier 全通过。

1. **网格底部奖品池信息重复**：满格时上方格子已列出全部奖品，下方奖品池又滚动一遍。是否在满格时隐藏底部奖品池，待业务确认。
2. **其它玩法对齐**：blindbox / gashapon / slotmachine / whackmole / redpacket / luckybag / flashsale / pinball / cardcollect 本次未处理，配色、名称显示、奖品池是否按本标准统一，待确认是否逐个处理。
3. **中奖高亮态验证**：网格 4×3 / 4×4 的中奖格高亮需真机抽奖确认有明显视觉落点。

---

## 五、质量门禁

每次修改抽奖玩法后必须执行（工具真实输出，禁止预设数据）：

| 文件类型 | 检查命令 |
| --- | --- |
| `.ts` 语法与规则 | `npm run lint`（ESLint） |
| `.ts` 类型 | `npx tsc --noEmit -p tsconfig.json` |
| 样式/模板格式 | `npx prettier --check`（或 `--write` 自动修正） |

> 注意：Windows PowerShell 环境，命令用 `;` 连接，不用 `&&`。
> `.ts` 文件不可用 `node -c`（不支持 TS 语法）。
