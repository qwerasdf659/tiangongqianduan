# DIY 饰品设计引擎 - 技术方案与待澄清问题

| 信息项   | 说明                                              |
| -------- | ------------------------------------------------- |
| 对应需求 | 微信小程序「养个石头」通用 DIY 饰品设计引擎 V2.0  |
| 编制日期 | 2026-03-28                                        |
| 编制角色 | 前端开发                                          |
| 文档状态 | 待产品确认                                        |

> **架构升级说明**：V1.0 仅支持手串单一款式，V2.0 升级为 **模板驱动的通用 DIY 设计引擎**。
> 后端上传款式模板（手链/项链/戒指等），前端根据模板参数动态渲染对应的排列形状、尺寸规则和专属素材。
>
> **双模式支持**：V2.0 同时支持两种设计模式：
> - **串珠模式**（circle / ellipse / arc / line）：珠子沿几何形状排列，适用于手链/项链/戒指等
> - **镶嵌模式**（slots）：吊坠/挂件提供预定义槽位，用户选择宝石填入指定位置，适用于吊坠/胸针等

---

## 一、核心架构：模板驱动设计

### 0. 款式模板体系（✅ 已确认）

系统不再仅支持手串，而是由 **后端定义款式模板**，前端根据模板参数动态渲染。

#### 用户操作流程

**先选款式 → 再进入设计页**。用户在款式列表页选择一个款式（手链/项链/戒指/吊坠等），跳转到设计页并加载该款式的模板参数和专属素材。设计页根据模板的 `layout.shape` 自动切换为串珠模式或镶嵌模式，两种模式共用同一个页面和渲染引擎。

#### 款式模板数据结构（后端定义）

```
Template {
  id: string                    // 款式 ID
  name: string                  // 款式名称（如"经典手链"、"锁骨项链"、"简约戒指"、"花瓣吊坠"）
  type: string                  // 款式类型标识（bracelet / necklace / ring / pendant）
  icon: string                  // 款式图标 URL

  // ========== 排列形状参数（后端完全自定义，判别联合体） ==========
  //
  // 根据 layout.shape 分为两大模式：
  //   串珠模式（circle / ellipse / arc / line）— 珠子沿几何形状排列
  //   镶嵌模式（slots）— 宝石填入吊坠/挂件的预定义槽位

  layout: {
    shape: string               // 形状类型（circle / ellipse / arc / line / slots）
    params: {                   // 形状参数，不同 shape 参数不同

      // ---- 串珠模式 ----

      // circle（圆形，手链/戒指）
      // 无额外参数，半径由屏幕自适应

      // ellipse（椭圆，项链）
      radiusRatioX: number      // 横轴半径比例（相对展示区宽度）
      radiusRatioY: number      // 纵轴半径比例（相对展示区高度）

      // arc（弧线，项链正面展示）
      arcAngle: number          // 弧线张角（度），如 180 = 半圆弧
      openDirection: string     // 开口方向（top / bottom）

      // line（直线，手链展开视图等）
      direction: string         // 方向（horizontal / vertical）

      // ---- 镶嵌模式 ----

      // slots（槽位镶嵌，吊坠/胸针）
      backgroundImage: string   // 吊坠/挂件背景图 URL（Sealos 对象存储）
      backgroundWidth: number   // 背景图设计宽度（px），用于坐标映射
      backgroundHeight: number  // 背景图设计高度（px）
      slots: SlotDefinition[]   // 预定义槽位列表（见下方定义）
    }
  }

  // 尺寸规则（串珠模式必填，镶嵌模式无此字段）
  sizing?: {
    label: string               // 尺寸标签（如"手围"、"颈围"、"指围"）
    unit: string                // 单位（mm / cm）
    options: number[]           // 可选尺寸档位（如 [140, 150, 160, 170, 180]）
    defaultValue: number        // 默认值
    margin: number              // 弹性余量（mm）
  }

  // 容量规则
  // 串珠模式：minBeads/maxBeads 为珠子数量限制，allowedDiameters 为可用直径
  // 镶嵌模式：minBeads = 必填槽位数，maxBeads = 总槽位数，allowedDiameters 为全局默认可用直径
  capacity: {
    minBeads: number            // 最少珠子/宝石数
    maxBeads: number            // 最多珠子/宝石数（串珠模式 0=仅受尺寸限制，镶嵌模式=总槽位数）
    allowedDiameters: number[]  // 该款式可用的珠子/宝石直径（mm）
  }

  // 专属素材分类 ID 列表
  categoryIds: string[]         // 该款式可用的素材分类，不同款式有各自专属素材
}

// ========== 槽位定义（镶嵌模式专用） ==========

SlotDefinition {
  slotId: string                // 槽位唯一标识（后端生成，如 "slot_center"、"slot_left_1"）
  label: string                 // 槽位显示名（如"主石位"、"副石位1"），用于 UI 提示

  // 位置与尺寸（均为 0~1 百分比，相对 backgroundWidth / backgroundHeight，屏幕自适应）
  x: number                     // 槽位中心 X 坐标百分比
  y: number                     // 槽位中心 Y 坐标百分比
  width: number                 // 槽位宽度百分比
  height: number                // 槽位高度百分比

  // 槽位形状（决定渲染裁剪蒙版和空槽位轮廓）
  slotShape: string             // circle / oval / square / rectangle

  // 约束规则（每个槽位独立约束）
  allowedDiameters: number[]    // 该槽位可容纳的宝石直径（mm），空数组表示不限
  allowedShapes?: string[]      // 该槽位允许的宝石形状（circle / oval / square / rectangle / marquise / pear / heart 等），空/不传表示仅匹配 slotShape
  allowedCategoryIds?: string[] // 该槽位允许的宝石分类 ID（可选，空/不传则继承模板级 categoryIds）

  // 必填标记
  required: boolean             // 是否为必填槽位（影响结算校验：required 槽位未填则不可提交）
}
```

#### 已支持的排列形状

| shape    | 适用款式     | 模式     | 说明                                     |
| -------- | ------------ | -------- | ---------------------------------------- |
| circle   | 手链、戒指   | 串珠模式 | 闭合圆形，等角度分布                      |
| ellipse  | 项链         | 串珠模式 | 椭圆形，等角度分布，适合展示长链          |
| arc      | 项链正面视图 | 串珠模式 | 弧线展示，仅渲染正面可见部分              |
| line     | 展开视图     | 串珠模式 | 直线排列，用于编辑或详情展示              |
| slots    | 吊坠、胸针   | 镶嵌模式 | 背景图 + 预定义槽位，宝石填入指定位置     |

> **扩展性**：新增款式时后端只需创建新的模板配置，前端渲染引擎根据 `layout.shape` 自动适配，无需发版。串珠模式和镶嵌模式共用同一个设计页和渲染引擎，通过 `shape` 值自动分发。

---

### 1. 核心计算规则

> **模式差异说明**：以下弹性余量和珠子规格规则仅适用于 **串珠模式**。**镶嵌模式** 不使用弹性余量和尺寸概念，其容量由模板定义的槽位数量和每个槽位的独立约束（`SlotDefinition.allowedDiameters` / `allowedCategoryIds`）决定。

#### 1.1 弹性余量（串珠模式）

PRD 公式：`所有珠子直径之和 ≤ 尺寸(mm) - 弹性余量`

弹性余量由款式模板的 `sizing.margin` 字段定义，不同款式可配置不同余量值。

> **建议值**：预留 **π × 绳径 ≈ 10mm**（按常见 1mm 弹力绳计算），即 15cm 手围 → 可用周长 = 150 - 10 = 140mm。
>
> **需产品确认**：具体弹性余量取多少？是否所有手围统一同一个余量值？

#### 1.2 珠子规格范围（串珠模式）

PRD 提到珠子有不同尺寸（单位 mm），但未列出具体可选尺寸。每个款式模板通过 `capacity.allowedDiameters` 定义该款式支持的珠子直径。

> 常见水晶珠规格为 4 / 6 / 8 / 10 / 12 / 14mm。
>
> **需产品确认**：支持哪些尺寸？是否所有材质都有全部尺寸？

---

### 2. 排列算法

> **✅ 已确认：采用等角度间隔分布**，所有珠子按添加顺序等角度排列，视觉对称、展示清晰。
>
> **✅ 已确认：排列形状由后端模板参数完全自定义**，前端渲染引擎支持 circle / ellipse / arc / line / slots 五种形状，根据模板 `layout.shape` 和 `layout.params` 动态计算珠子坐标或读取槽位坐标。
>
> **✅ 已确认：同时支持串珠模式和镶嵌模式**，镶嵌模式下宝石位置由模板预定义的槽位坐标决定（非算法计算），用户可先点槽位再选宝石，也可直接选宝石自动填入下一个空槽位。

---

### 3. 数据来源

#### 3.1 珠子素材数据

> **✅ 已确认：走后端 API**。素材的数量、价格、图片、库存均由后端动态管理，支持运营随时调整。
>
> **✅ 已确认：不同款式有各自专属素材**，通过款式模板的 `categoryIds` 字段关联，前端根据当前款式仅加载其专属分类。

#### 3.2 珠子图片资源

> **✅ 已确认**：图片托管在 **Sealos 对象存储** 中，前端通过后端返回的图片 URL 加载，不打包到小程序内。
>
> **仍需确认**：
> - 图片是 PNG 透明底还是 JPG 白底？
> - 图片尺寸规格？（建议缩略图 200×200px，Canvas 渲染用高清图 400×400px）

---

### 4. 价格体系

现有项目同时存在 **积分体系** 和 **人民币兑换体系**。

> **✅ 已确认**：
> - 珠子属于 **可叠加资产**（同一款珠子可拥有/使用多颗）
> - 兑换价格由 **后端设置和调整**，前端仅做展示，不硬编码价格
> - 价格单位为 **可叠加资产价格**（如水晶类资产），与项目现有资产体系一致
>
> **仍需确认**：
> - 是否存在套餐优惠/满减逻辑？

---

### 5. 结算对接

PRD 要求"跳转至下单结算流程，完成商业闭环"。

> **需产品确认**：
> - 是否有现成的结算页可复用？还是需要为 DIY 手串新建结算页？
> - 当前项目有 `exchange-orders` B2C 兑换流程和 `trade` C2C 交易流程，DIY 订单属于哪条业务线？
> - 传给结算页的数据结构需要包含哪些字段？（建议至少包含：已选珠子列表 `[{beadId, name, size, price, imageUrl}]`、总价、手围）

---

### 6. 分享设计

PRD 要求"生成小程序分享卡片，他人打开可直接加载对应设计"。

设计数据的传递有两种方案：

| 方案                     | 实现方式                                           | 限制                                             |
| ------------------------ | -------------------------------------------------- | ------------------------------------------------ |
| 方案 A：URL 参数传递     | 将珠子列表序列化后拼接到分享卡片 path 中           | 小程序 path 有长度限制（约 1024 字符），珠子多时会超限 |
| 方案 B：后端存储 + ID    | 先调接口保存设计，获取 designId，分享时携带 ID      | 需要后端接口支持，但无长度限制                    |

> **✅ 已确认：采用方案 B**（后端存储 + ID）。分享时先调接口保存设计获取 designId，分享卡片 path 仅携带 ID，他人打开时从后端拉取完整设计数据还原。需后端提供设计存储与查询接口。

---

### 7. 保存海报

PRD 要求"自动将预览区的完整手串生成高清海报"。

> **✅ 已确认**：海报内容包含以下三部分：
> 1. **饰品图** — 预览区的完整饰品渲染图（根据款式自适应）
> 2. **品牌 Logo** — "养个石头"品牌标识
> 3. **小程序码** — 扫码可直接打开该设计
>
> **仍需设计确认**：
> - 海报尺寸和分辨率？（建议 750×1334px @2x）
> - 三部分的布局排版（Logo 在顶部/底部？小程序码位置？背景色/背景图？）
> - 是否需要提供海报模板设计稿？

---

### 8. 交互细节补充

| 问题                         | 说明                                                                 |
| ---------------------------- | -------------------------------------------------------------------- |
| 手围修改的 UI 形式？         | **✅ 已确认**：采用 Picker 滚动选择器，尺寸档位由模板 `sizing.options` 定义 |
| 删除珠子是否支持多选？       | **✅ 已确认**：支持多选删除 + 一键清空                                |
| 是否需要撤销/重做？          | **✅ 已确认**：支持撤销和重做                                         |
| 珠子顺序能否调整？           | **✅ 已确认**：支持调整珠子顺序（串珠模式）                           |
| 相同珠子是否可重复添加？     | **✅ 已确认**：允许（珠子为可叠加资产）                               |
| 镶嵌模式交互方式？           | **✅ 已确认**：同时支持两种方式 — ① 点击槽位激活后选宝石填入 ② 直接选宝石自动填入下一个空槽位 |
| 镶嵌模式槽位数量？           | **✅ 已确认**：后端灵活配置，不限定数量                               |
| 镶嵌模式槽位独立约束？       | **✅ 已确认**：每个槽位有独立的尺寸/分类约束（allowedDiameters / allowedCategoryIds） |
| 镶嵌模式宝石互换？           | 支持长按拖拽交换两个槽位的宝石（swapSlots）                          |
| 空白预览区视觉样式？         | 串珠模式：没有珠子时圆环如何展示？虚线圆环？带提示文字？镶嵌模式：空槽位显示虚线轮廓 + "+"提示 |

---

## 二、技术方案

### 1. 分包与目录结构

新建独立分包 `packageDIY`，与现有 `packageTrade`/`packageExchange` 平级。

```
packageDIY/
├── diy-select/                      # 款式选择页（入口页）
│   ├── diy-select.ts
│   ├── diy-select.wxml
│   ├── diy-select.scss
│   └── diy-select.json
├── diy-design/                      # 通用 DIY 设计页（根据模板动态渲染）
│   ├── diy-design.ts
│   ├── diy-design.wxml
│   ├── diy-design.scss
│   └── diy-design.json
├── sub/                             # 页面级子组件
│   ├── shape-renderer/              # 通用形状渲染引擎（Canvas 2D）
│   │   ├── shape-renderer.ts        #   根据 layout.shape 分发渲染逻辑
│   │   ├── shape-renderer.wxml
│   │   ├── shape-renderer.scss
│   │   └── shape-renderer.json
│   ├── bead-card/                   # 珠子素材卡片组件
│   │   ├── bead-card.ts
│   │   ├── bead-card.wxml
│   │   ├── bead-card.scss
│   │   └── bead-card.json
│   ├── category-nav/                # 左侧分类导航组件
│   │   ├── category-nav.ts
│   │   ├── category-nav.wxml
│   │   ├── category-nav.scss
│   │   └── category-nav.json
│   └── fly-animation/               # 飞入动画浮动层组件
│       ├── fly-animation.ts
│       ├── fly-animation.wxml
│       ├── fly-animation.scss
│       └── fly-animation.json
└── diy-result/                      # 设计结果/结算中转页（可选）
    ├── diy-result.ts
    ├── diy-result.wxml
    ├── diy-result.scss
    └── diy-result.json
```

### 2. 核心技术选型

| 模块         | 技术方案                         | 理由                                                                                       |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------ |
| 形状渲染引擎 | **Canvas 2D**                    | 项目已有 `price-chart` Canvas 2D 组件经验；Canvas 对多种形状（圆/椭圆/弧/线）渲染性能优于 DOM；可直接导出海报图片 |
| 飞入动画     | **CSS Animation + fixed 浮动层** | 350ms 短距离动画用 CSS `transition` + `transform` 即可保证 30fps 流畅度，无需引入 Canvas 动画 |
| 状态管理     | **MobX Store**                   | 新增 `store/diy.ts`，统一管理当前模板、已选珠子、尺寸、总价等状态，与项目现有架构一致       |
| 本地缓存     | **wx.setStorageSync**            | 每次编辑后自动序列化设计数据到 Storage，附带过期时间戳（7 天），启动时检查并恢复              |
| 素材加载     | **分类懒加载 + 内存缓存**       | 仅加载当前款式的专属分类素材，已加载过的分类缓存在内存中，避免重复请求                       |
| 海报生成     | **Canvas 离屏渲染**              | 复用 `shape-renderer` 的绘制逻辑，在离屏 Canvas 上额外绘制背景/品牌元素后调用 `canvasToTempFilePath` 导出 |
| 搜索         | **前端本地过滤**                 | 素材总量有限，全量加载后前端 filter 即可，无需每次请求后端搜索接口                           |

### 3. 通用形状渲染引擎 — shape-renderer

核心思路：根据款式模板的 `layout.shape` 分发到不同的坐标计算策略，所有策略均采用等角度/等间距分布。渲染引擎是一个纯函数，输入模板参数 + 珠子列表，输出每颗珠子的 (x, y) 坐标。

```
算法伪代码：

输入：template.layout (形状配置)
      beads[] (已选珠子列表)
      canvasWidth, canvasHeight (画布尺寸)

// 根据 shape 分发计算
switch (template.layout.shape):

  case 'circle':  // 手链、戒指
    radius = min(canvasWidth, canvasHeight) * 0.35
    angleStep = (2 * π) / beads.length
    for (i = 0; i < beads.length; i++):
      angle = (i * angleStep) - π / 2
      beads[i].x = centerX + radius * cos(angle)
      beads[i].y = centerY + radius * sin(angle)

  case 'ellipse':  // 项链
    rx = canvasWidth * layout.params.radiusRatioX
    ry = canvasHeight * layout.params.radiusRatioY
    angleStep = (2 * π) / beads.length
    for (i = 0; i < beads.length; i++):
      angle = (i * angleStep) - π / 2
      beads[i].x = centerX + rx * cos(angle)
      beads[i].y = centerY + ry * sin(angle)

  case 'arc':  // 项链正面弧线
    arcRad = layout.params.arcAngle * π / 180
    startAngle = -π/2 - arcRad/2
    radius = canvasWidth * 0.4
    angleStep = arcRad / (beads.length - 1 || 1)
    for (i = 0; i < beads.length; i++):
      angle = startAngle + i * angleStep
      beads[i].x = centerX + radius * cos(angle)
      beads[i].y = centerY + radius * sin(angle)

  case 'line':  // 直线展开
    spacing = canvasWidth / (beads.length + 1)
    for (i = 0; i < beads.length; i++):
      beads[i].x = spacing * (i + 1)
      beads[i].y = centerY

  // ======== 镶嵌模式 ========

  case 'slots':  // 吊坠、胸针 — 背景图 + 槽位镶嵌
    params = template.layout.params
    slotDefs = params.slots              // SlotDefinition[]
    slotFillings = store.slotFillings    // Map<slotId, Bead>

    // 1. 绘制吊坠/挂件背景图（自适应画布，保持宽高比）
    bgAspect = params.backgroundWidth / params.backgroundHeight
    canvasAspect = canvasWidth / canvasHeight
    if (bgAspect > canvasAspect):
      drawWidth = canvasWidth * 0.85
      drawHeight = drawWidth / bgAspect
    else:
      drawHeight = canvasHeight * 0.85
      drawWidth = drawHeight * bgAspect
    offsetX = (canvasWidth - drawWidth) / 2
    offsetY = (canvasHeight - drawHeight) / 2
    ctx.drawImage(backgroundImage, offsetX, offsetY, drawWidth, drawHeight)

    // 2. 遍历槽位，绘制空槽位轮廓或已填入的宝石
    for (slot in slotDefs):
      slotX = offsetX + slot.x * drawWidth    // 百分比坐标 → 画布绝对坐标
      slotY = offsetY + slot.y * drawHeight
      slotW = slot.width * drawWidth
      slotH = slot.height * drawHeight

      gem = slotFillings.get(slot.slotId)
      if (gem):
        // 已填入宝石：按槽位形状裁剪绘制宝石图片
        ctx.save()
        clipByShape(ctx, slot.slotShape, slotX, slotY, slotW, slotH)
        ctx.drawImage(gem.imageUrl, slotX - slotW/2, slotY - slotH/2, slotW, slotH)
        ctx.restore()
      else:
        // 空槽位：绘制虚线轮廓 + 可选"+"提示
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = '#ccc'
        drawShapeOutline(ctx, slot.slotShape, slotX, slotY, slotW, slotH)

      // 3. 高亮当前激活槽位（activeSlotId）
      if (slot.slotId == store.activeSlotId):
        ctx.strokeStyle = '#FF6B35'
        ctx.lineWidth = 2
        ctx.setLineDash([])
        drawShapeOutline(ctx, slot.slotShape, slotX, slotY, slotW, slotH)

输出：
  串珠模式 → 每颗珠子的 (x, y) 坐标及角度
  镶嵌模式 → 背景图 + 每个槽位的渲染状态（空/已填/激活）

容量校验（按模式分发）：
  if (shape != 'slots'):
    // 串珠模式：直径之和校验
    usedDiameter = sum(beads.map(b => b.diameter))
    maxDiameter = template.sizing.selectedValue - template.sizing.margin
    canAdd = (usedDiameter + newBead.diameter) <= maxDiameter
  else:
    // 镶嵌模式：目标槽位约束校验（尺寸 + 形状 + 分类三重校验）
    targetSlot = activeSlotId ? getSlot(activeSlotId) : getNextEmptySlot()
    canAdd = targetSlot != null
             && (targetSlot.allowedDiameters.length == 0 || targetSlot.allowedDiameters.includes(gem.diameter))
             && (targetSlot.allowedShapes == null || targetSlot.allowedShapes.includes(gem.shape))
             && (targetSlot.allowedCategoryIds == null || targetSlot.allowedCategoryIds.includes(gem.categoryId))
```

增删珠子后全量重算坐标，Canvas 全量重绘（珠子数量有限，性能无压力）。镶嵌模式下每次操作后重绘背景图 + 所有槽位状态。

### 4. 飞入动画方案

```
实现步骤：

1. 用户点击素材卡片
2. 通过 wx.createSelectorQuery 获取素材卡片在页面中的绝对坐标 (startX, startY)
3. 计算目标坐标 (endX, endY)：
   - 串珠模式：目标为圆环上下一个珠子位置（由排列算法计算）
   - 镶嵌模式：目标为当前激活槽位的中心坐标（activeSlotId 对应的槽位），
     若无激活槽位则为下一个空槽位的中心坐标
4. 在 fixed 浮动层创建一个临时珠子元素（与选中珠子同样式同尺寸）
5. 初始位置设为 (startX, startY)
6. 通过 CSS transition 350ms ease-out 将 transform 设为 translate(endX-startX, endY-startY)
7. 中间控制点通过 CSS 动画关键帧模拟贝塞尔曲线弧线路径
8. 动画结束后（transitionend 事件）销毁临时元素，触发 Canvas 重绘正式渲染珠子/宝石
```

贝塞尔曲线模拟：使用 `@keyframes` 分别对 X 轴和 Y 轴设置不同缓动函数（X 轴 linear，Y 轴 ease-in），组合后视觉呈弧线飞入效果。

### 5. MobX Store 设计

新增 `store/diy.ts`：

```
状态字段：

  // ===== 通用状态（两种模式共用） =====
  currentTemplate: Template     // 当前款式模板（含排列形状、尺寸规则、容量规则）
  activeCategory: string        // 当前激活分类 ID（从模板 categoryIds 中选取）
  undoStack: Snapshot[]         // 撤销栈，记录每次操作前的完整状态快照
  redoStack: Snapshot[]         // 重做栈，撤销后可重做恢复

  // ===== 串珠模式专用 =====
  selectedSize: number          // 当前选择的尺寸值（mm），从模板 sizing.options 中选取
  selectedBeads: Bead[]         // 已选珠子列表（有序，支持调整顺序）
  highlightedBeadIndices: Set<number>  // 当前选中的预览区珠子索引集合（支持多选删除）

  // ===== 镶嵌模式专用 =====
  slotFillings: Map<string, Bead>  // 槽位填充状态（slotId → Bead），空槽位不在 Map 中
  activeSlotId: string | null      // 当前激活的槽位 ID（用户点击槽位后设置，选宝石时填入此槽位）

  // Snapshot 类型定义（撤销/重做用）：
  // 串珠模式: { mode: 'beads', selectedBeads: Bead[], selectedSize: number }
  // 镶嵌模式: { mode: 'slots', slotFillings: Map<string, Bead> }

计算属性：

  // ===== 模式判断 =====
  isSlotMode: boolean           // currentTemplate.layout.shape === 'slots'

  // ===== 串珠模式计算属性 =====
  totalDiameter: number         // 已选珠子直径之和（仅串珠模式）
  maxDiameter: number           // 当前尺寸可容纳最大直径 = selectedSize - template.sizing.margin（仅串珠模式）
  remainingSpace: number        // 剩余可用空间（仅串珠模式）
  sizeLabel: string             // 尺寸标签（从模板获取，如"手围"/"颈围"/"指围"）

  // ===== 镶嵌模式计算属性 =====
  filledSlotCount: number       // 已填入宝石的槽位数
  totalSlotCount: number        // 总槽位数（= template.layout.params.slots.length）
  nextEmptySlotId: string|null  // 下一个空槽位 ID（按模板 slots 数组顺序查找第一个未填充的）
  requiredSlotsFilled: boolean  // 所有 required 槽位是否已填充（结算校验用）
  activeSlotConstraints: {      // 当前激活槽位的约束信息（用于素材列表过滤：不匹配的宝石灰显不可选）
    allowedDiameters: number[]
    allowedShapes: string[]
    allowedCategoryIds: string[]
  } | null

  // ===== 通用计算属性 =====
  totalPrice: number            // 总价（串珠: sum(selectedBeads.price)，镶嵌: sum(slotFillings.values().price)）
  canUndo: boolean              // 撤销栈是否非空
  canRedo: boolean              // 重做栈是否非空
  availableCategories: Category[] // 当前款式的专属分类列表
  canSubmit: boolean            // 是否可提交（串珠: 珠子数 ≥ minBeads，镶嵌: requiredSlotsFilled）

操作方法：

  // ===== 通用方法 =====
  setTemplate(template)         // 设置款式模板（从款式选择页传入），根据 shape 初始化对应模式状态
  clearDesign()                 // 清空设计（串珠: 清空 selectedBeads，镶嵌: 清空 slotFillings），推入撤销栈
  undo()                        // 撤销：从 undoStack 弹出恢复，当前状态推入 redoStack
  redo()                        // 重做：从 redoStack 弹出恢复，当前状态推入 undoStack
  restoreFromCache()            // 从本地缓存恢复
  saveToCache()                 // 保存到本地缓存

  // ===== 串珠模式方法 =====
  addBead(bead)                 // 添加珠子（含容量校验），推入撤销栈
  removeBead(index)             // 删除指定位置珠子，推入撤销栈
  removeSelectedBeads()         // 批量删除所有选中珠子（多选删除）
  moveBead(fromIndex, toIndex)  // 调整珠子顺序，推入撤销栈
  toggleBeadSelection(index)    // 切换珠子选中状态（支持多选）
  clearSelection()              // 清空选中状态
  setSize(size)                 // 修改尺寸（手围/颈围/指围）

  // ===== 镶嵌模式方法 =====
  setActiveSlot(slotId)         // 设置当前激活槽位（用户点击预览区槽位时触发）
  fillSlot(bead, slotId?)       // 填入宝石到指定槽位（含约束校验），推入撤销栈
                                //   slotId 不传时：优先填入 activeSlotId，其次 nextEmptySlotId
                                //   校验：allowedDiameters + allowedShapes + allowedCategoryIds（三重匹配）
                                //   填入后自动将 activeSlotId 移到下一个空槽位
  clearSlot(slotId)             // 清空指定槽位的宝石，推入撤销栈
  swapSlots(slotIdA, slotIdB)   // 交换两个槽位的宝石（长按拖拽触发），推入撤销栈
```

### 6. API 层扩展

新增 `utils/api/diy.ts`，遵循项目现有 barrel re-export 模式，在 `utils/api/index.ts` 中聚合导出：

```
接口规划：

GET  /api/v4/diy/templates              → getTemplates()
     返回：[{ id, name, type, icon, layout, sizing, capacity, categoryIds }]
     说明：获取所有款式模板列表，用于款式选择页

GET  /api/v4/diy/templates/:id          → getTemplateById(templateId)
     返回：完整模板数据
     说明：获取单个模板详情（款式选择后加载）

GET  /api/v4/diy/categories?templateId=xxx → getBeadCategories(templateId)
     返回：[{ id, name, icon, sortOrder }]
     说明：获取指定款式的专属素材分类

GET  /api/v4/diy/beads?categoryId=xxx   → getBeadsByCategory(categoryId)
     返回：[{ id, name, imageUrl, diameter, shape, price, material, stock, stackable: true }]
     说明：获取分类下的珠子/宝石列表
     shape 字段：宝石切割形状（circle / oval / square / rectangle / marquise / pear / heart 等），
                 用于镶嵌模式下与槽位形状约束匹配

POST /api/v4/diy/designs                → saveDesign(designData)
     请求（串珠模式）：{ templateId, mode: "beads", selectedSize, beads: [{beadId, position}], totalPrice }
     请求（镶嵌模式）：{ templateId, mode: "slots", slotFillings: [{slotId, beadId}], totalPrice }
     返回：{ designId, shareToken }

GET  /api/v4/diy/designs/:id            → getDesignById(designId)
     返回：完整设计数据（含模板信息，用于分享还原）

POST /api/v4/diy/orders                 → createDiyOrder(designId)
     请求：{ designId, addressId, ... }
     返回：{ orderId, paymentInfo }
```

### 7. 本地缓存策略

```
缓存 Key：DIY_DRAFT_{templateId}      // 按款式分别缓存
缓存结构（串珠模式）：{
  version: 3,                    // 数据版本号（V3 支持双模式）
  mode: "beads",                 // 模式标识
  templateId: "tpl_bracelet_01", // 款式模板 ID
  selectedSize: 150,             // 当前选择的尺寸
  beads: [{ beadId, name, diameter, price, imageUrl, position }],
  updatedAt: 1711526400000,      // 最后编辑时间戳
  expiresAt: 1712131200000       // 过期时间 = updatedAt + 7天
}

缓存结构（镶嵌模式）：{
  version: 3,
  mode: "slots",                 // 模式标识
  templateId: "tpl_pendant_01",  // 款式模板 ID
  slotFillings: {                // 槽位填充数据（slotId → Bead）
    "slot_center": { beadId, name, diameter, price, imageUrl },
    "slot_left_1": { beadId, name, diameter, price, imageUrl }
  },
  updatedAt: 1711526400000,
  expiresAt: 1712131200000
}

写入时机：
  串珠模式：每次 addBead / removeBead / moveBead / setSize 后自动写入
  镶嵌模式：每次 fillSlot / clearSlot / swapSlots 后自动写入
恢复时机：进入设计页 onLoad 时，根据 templateId 检查缓存，未过期则自动恢复并提示"已恢复上次未完成的设计"
清除时机：用户点击"清空设计" / 缓存过期 / 成功下单后
```

### 8. 性能保障措施

| 目标                    | 措施                                                                              |
| ----------------------- | --------------------------------------------------------------------------------- |
| 首屏 ≤ 2s              | 分包懒加载；款式选择页轻量加载模板列表；设计页仅加载当前款式专属分类素材；图片走 Sealos 对象存储 + webp 格式 |
| 动画 ≥ 30fps           | 飞入动画使用 CSS transform（GPU 加速）；Canvas 渲染珠子数 ≤ 25 颗，单次重绘 < 16ms |
| 内存 ≤ 50MB            | 图片使用缩略图（200×200）展示，仅 Canvas 渲染时加载高清图；已加载分类上限缓存 5 个 |
| 操作响应 ≤ 100ms       | 点击添加时先更新 Store 状态触发 UI 反馈，动画异步执行                              |

### 9. 兼容性处理

| 场景                         | 处理方案                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| Canvas 2D 不支持（低版本）    | 检测 `wx.canIUse('canvas.bindtap')`，降级为旧版 Canvas API     |
| 小屏手机（3.5-5 寸）         | 渲染引擎按屏幕宽度动态计算形状尺寸，各 shape 均自适应       |
| 大屏手机 / iPad              | 形状最大尺寸设上限，超出部分居中展示                         |
| 网络异常                     | 素材加载失败显示占位图 + 重试按钮；已缓存设计离线可查看不可提交 |

---

## 三、风险与依赖

| 风险项                         | 影响       | 应对措施                                                    |
| ------------------------------ | ---------- | ----------------------------------------------------------- |
| 后端接口未就绪                 | 阻塞联调   | 前端先用 Mock 数据开发，接口协议提前对齐                     |
| 珠子素材图片量大               | 分包超限   | 图片托管在 Sealos 对象存储，不打包到小程序内                  |
| Canvas 2D 在部分 Android 机型渲染异常 | 显示错位 | 预留 DOM 渲染降级方案（用 absolute 定位代替 Canvas）          |
| 分享路径长度超限               | ✅ 已解决  | 已确认采用后端存储 designId 方案，路径仅传 ID               |
| 海报生成耗时长                 | 用户等待   | 显示"正在生成海报…"loading，Canvas 绘制饰品图+Logo+小程序码完成后再调起保存 |
| 管理端槽位标注工具开发量       | 延长工期   | Web 管理后台独立项目，不影响小程序前端工期；镶嵌模式前置依赖，建议优先开发 |

---

## 四、镶嵌模式槽位标注方案

### 1. 核心问题

后端上传一张吊坠底图后，前端如何知道哪些位置需要镶嵌？

槽位坐标（`SlotDefinition.x/y/width/height`）不可能由前端自动识别，必须有人在底图上**标注**出来。这是镶嵌模式的前置依赖。

### 2. 行业方案对比

#### 大厂方案（腾讯/阿里/美团）

| 公司/场景 | 做法 | 核心特征 |
|-----------|------|----------|
| 腾讯游戏（装备镶嵌系统） | 内部编辑器工具链（如 Unity Editor 扩展），策划在编辑器中拖拽标注装备槽位，导出 JSON 配置 | **可视化编辑器 + 配置导出**，编辑器内部开发不对外 |
| 阿里（淘宝/天猫定制商品） | 商家后台提供「定制区域标注工具」，商家上传商品图 → 在图上框选可定制区域 → 保存为百分比坐标 | **Web 端可视化标注**，嵌入商家后台 |
| 美团（营销活动配置） | 运营后台的「图片热区编辑器」，运营人员在活动图上画框标注点击区域和跳转链接 | **图片热区编辑器**，技术栈 React + Canvas |

**共同点**：全部采用**可视化标注工具**，不让运营/策划手填坐标。一次投入开发成本，长期零配置错误。

#### 游戏公司方案

| 场景 | 做法 |
|------|------|
| MMORPG 装备镶嵌（魔兽世界/梦幻西游类） | 装备模板预定义固定槽位数和类型，**不需要图上标注**（槽位是逻辑概念，UI 固定布局） |
| 二次元换装游戏（奇迹暖暖/闪耀暖暖类） | 美术出图时同步输出挂点坐标 JSON，或在 Spine/Live2D 编辑器中标注 |
| 宝石镶嵌类玩法（暗黑破坏神类） | 物品模板定义槽位数和约束规则，**纯数据驱动**，UI 按固定布局排列 |

**关键洞察**：游戏行业的镶嵌槽位分两种 —— 如果槽位位置固定且少（1~5 个），用模板定义即可；如果位置必须精确对应图片，必须有可视化标注工具。你的场景属于后者。

#### 小公司/小众平台方案

| 方案 | 做法 | 问题 |
|------|------|------|
| 手填 JSON | 后端开发者量像素 → 算百分比 → 手写 JSON | 效率极低，反复调试，每个模板耗时 30min+ |
| Excel 配表 | 策划在 Excel 填坐标 → 导入系统 | 比手填 JSON 好一点，但仍然无法所见即所得 |
| 复用开源热区编辑器 | 嵌入 GrapesJS / 图片热区编辑器库 | 功能过重，需要大量裁剪适配 |

### 3. 方案选型（✅ 推荐方案）

基于项目实际情况的选型判断：

| 项目现状 | 影响选型 |
|----------|----------|
| 项目未上线，无旧接口包袱 | 可一步到位，不需要渐进迁移 |
| 后端已有图片上传能力（`POST /api/v4/user/images/upload` → Sealos 对象存储 → MediaObject） | 底图上传零成本复用 |
| 后端已有 `media_files` 表 + 缩略图自动生成（small/medium/large） | 底图存储和加载已有基础设施 |
| 愿意一次性投入，追求长期低维护 | 选可视化方案，一劳永逸 |
| 标注是精细操作，需要大屏 + 鼠标 | 必须在 Web 端，不适合手机小屏 |

**✅ 推荐：Web 管理后台可视化槽位标注工具**

行业标准做法：**标注配置在 Web 管理后台完成，小程序前端纯消费数据**。

#### 职责边界（明确分工）

```
Web 管理后台（标注端）                    小程序前端（消费端）
─────────────────────                    ─────────────────
上传吊坠底图                              ×
在底图上拖拽标注槽位坐标                   ×
配置每个槽位的约束规则                     ×
保存模板（含 SlotDefinition[]）            ×
发布/下线模板                              ×
                                          调 API 获取模板数据 ✓
                                          根据 layout.shape 分发渲染 ✓
                                          读取 slots[].x/y 渲染槽位 ✓
                                          校验宝石与槽位约束匹配 ✓
                                          用户交互（选宝石/填槽位）✓
```

小程序前端**不需要关心槽位坐标怎么来的**，只需要：
1. 从 `GET /api/v4/diy/templates/:id` 拿到完整模板数据（含 `layout.params.slots[]`）
2. 把 `slots[].x/y` 百分比坐标映射到 Canvas 像素坐标
3. 画底图 + 画槽位 + 处理用户交互

### 4. Web 管理后台槽位标注工具

> **说明**：此部分为 Web 管理后台的技术方案，不属于小程序前端工程范畴。
> 小程序前端仅消费后端 API 返回的模板数据，不参与模板创建和槽位标注。
> 此处列出方案是为了与后端对齐接口协议和数据结构。

#### 4.1 技术栈建议

| 模块 | 建议方案 | 理由 |
|------|----------|------|
| 前端框架 | Vue 3 + Element Plus / React + Ant Design | 管理后台主流选型 |
| 标注画布 | Fabric.js / Konva.js | 成熟的 Canvas 交互库，原生支持拖拽、缩放、框选、对象序列化 |
| API 对接 | 复用后端现有 `/api/v4/console/` 路由体系 | 与小程序管理端共用权限和认证 |
| 图片上传 | 复用现有 `POST /api/v4/user/images/upload` → Sealos 对象存储 | 零成本复用 |

#### 4.2 标注工具交互流程

```
管理员操作流程（Web 端，大屏 + 鼠标操作）：

1. 进入「DIY 模板管理」列表页 → 点击「新建模板」
2. 填写基本信息：款式名称、类型（bracelet/necklace/ring/pendant）、专属素材分类
3. 选择模式：
   - 串珠模式 → 配置 shape（circle/ellipse/arc/line）+ sizing 参数 → 保存即可，无需标注
   - 镶嵌模式 → 进入可视化标注编辑器
4. 上传吊坠底图 → 图片显示在 Canvas 画布上
5. 在底图上操作（Fabric.js / Konva.js 提供开箱即用能力）：
   - 鼠标拖拽画矩形/圆形/椭圆 → 创建一个槽位
   - 拖拽移动槽位位置（精确对齐底图镶嵌位）
   - 拖拽边角调整槽位大小
   - 双击槽位 → 弹出约束配置面板：
     ┌─────────────────────────────────────┐
     │ 槽位名称：[主石位                ]  │
     │ 槽位形状：○圆形 ○椭圆 ○方形 ○矩形  │
     │ 允许宝石尺寸：□4 □6 □8 ☑10 ☑12 mm │
     │ 允许宝石形状：☑圆形 □椭圆 □方形     │
     │ 允许素材分类：[全部分类        ▼]   │
     │ 是否必填：☑是                        │
     │              [确定]  [删除槽位]      │
     └─────────────────────────────────────┘
   - 右侧面板实时显示所有槽位列表及其参数
6. 点击「保存」→ Canvas 像素坐标自动转换为 0~1 百分比 → 调 API 保存
7. 点击「预览」→ 模拟小程序端渲染效果，确认槽位位置准确
8. 确认无误 → 点击「发布」→ 用户端可见

坐标转换公式（标注工具自动计算）：
  slot.x = slotCenterX / canvasImageWidth         // 0~1 百分比
  slot.y = slotCenterY / canvasImageHeight         // 0~1 百分比
  slot.width = slotPixelWidth / canvasImageWidth   // 0~1 百分比
  slot.height = slotPixelHeight / canvasImageHeight // 0~1 百分比
```

#### 4.3 管理端 API

```
// 后端路由：/api/v4/console/diy/（与小程序管理端共用认证和权限体系）

POST /api/v4/console/diy/templates             → createTemplate(templateData)
     请求：{ name, type, icon, layout, sizing?, capacity, categoryIds }
     说明：创建款式模板（含完整 SlotDefinition[]）
     权限：role_level >= 60（业务管理员）

PUT  /api/v4/console/diy/templates/:id         → updateTemplate(templateId, templateData)
     说明：更新款式模板（槽位标注后保存）

GET  /api/v4/console/diy/templates             → getAdminTemplates()
     说明：管理端获取模板列表（含草稿状态）

DELETE /api/v4/console/diy/templates/:id       → deleteTemplate(templateId)
     说明：删除款式模板

POST /api/v4/console/diy/templates/:id/publish → publishTemplate(templateId)
     说明：发布模板（草稿 → 上线，用户端可见）
```

#### 4.4 模板生命周期

```
草稿（draft）→ 已发布（published）→ 已下线（archived）

管理员创建模板 → 上传底图 → 标注槽位 → 保存（草稿状态）
→ 预览确认无误 → 点击发布 → 用户端可见
→ 需要调整 → 下线 → 编辑 → 重新发布
```

---

## 五、待产品确认汇总

| 序号 | 问题                                       | 建议                        | 状态       |
| ---- | ------------------------------------------ | --------------------------- | ---------- |
| 0    | 系统为模板驱动通用 DIY 设计引擎            | 后端定义款式模板            | ✅ 已确认  |
| 0.1  | 用户流程：先选款式 → 再进入设计页          | 款式选择页 → 设计页         | ✅ 已确认  |
| 0.2  | 排列形状由后端参数完全自定义               | circle/ellipse/arc/line/slots | ✅ 已确认  |
| 0.3  | 不同款式有各自专属素材                     | 通过 categoryIds 关联       | ✅ 已确认  |
| 0.4  | 同时支持串珠模式和镶嵌模式                 | shape 值自动分发            | ✅ 已确认  |
| 0.5  | 镶嵌模式交互：点槽位选宝石 + 选宝石自动填入 | 两种方式并存              | ✅ 已确认  |
| 0.6  | 镶嵌模式槽位数量由后端灵活配置             | 不限定数量                  | ✅ 已确认  |
| 0.7  | 镶嵌模式每个槽位有独立约束                 | allowedDiameters/allowedShapes/allowedCategoryIds | ✅ 已确认  |
| 0.8  | 槽位标注方案：Web 管理后台可视化标注工具   | 小程序前端纯消费数据        | ✅ 已确认  |
| 1    | 弹性余量具体值                             | 由模板 sizing.margin 定义   | 待确认     |
| 2    | 可选珠子尺寸规格                           | 由模板 capacity 定义        | 待确认     |
| 3    | 排列方式（等角度分布）                     | 等角度分布                  | ✅ 已确认  |
| 4    | 素材数据来源（后端 API）                   | 后端 API                    | ✅ 已确认  |
| 5    | 图片托管方式                               | Sealos 对象存储             | ✅ 已确认  |
| 5.1  | 图片格式（PNG 透明底 / JPG）与尺寸规格     | PNG 透明底，200×200 + 400×400 | 待确认   |
| 6    | 价格由后端设置调整                         | 后端管理                    | ✅ 已确认  |
| 6.1  | 价格单位为可叠加资产价格                   | 资产体系                    | ✅ 已确认  |
| 7    | 珠子为可叠加资产                           | 同款可多颗                  | ✅ 已确认  |
| 8    | 结算页复用还是新建                         | -                           | 待确认     |
| 9    | 分享方案（后端存储 + ID）                  | 后端存储 ID                 | ✅ 已确认  |
| 10   | 海报内容：饰品图 + 品牌 Logo + 小程序码   | 需布局设计稿                | ✅ 已确认  |
| 10.1 | 海报尺寸、布局排版、背景样式               | 建议 750×1334px @2x         | 待确认     |
| 11   | 尺寸选择 UI 形式（Picker）                 | Picker 滚动选择器           | ✅ 已确认  |
| 12   | 支持多选删除 + 一键清空                    | 多选删除 + 一键清空         | ✅ 已确认  |
| 13   | 支持撤销和重做                             | 撤销 + 重做                 | ✅ 已确认  |
| 14   | 珠子顺序可调整                             | 支持调整顺序（串珠模式）    | ✅ 已确认  |
| 15   | 空白预览区视觉样式                         | 需设计稿                    | 待确认     |

---

## 六、前后端数据对接清单

> **本章说明**：以下是小程序前端需要后端提供的**完整数据清单**。
> 前端不参与模板创建、槽位标注、素材管理等管理端操作，只负责**接收数据 → 渲染 → 用户交互 → 提交结果**。

### 1. 款式模板数据

**接口**：`GET /api/v4/diy/templates`（列表）、`GET /api/v4/diy/templates/:id`（详情）

前端在款式选择页调用列表接口，用户选择后调用详情接口获取完整模板。

```
后端需返回的字段（以镶嵌模式吊坠为例）：

{
  "id": "tpl_pendant_flower",
  "name": "花瓣吊坠",
  "type": "pendant",
  "icon": "https://sealos.xxx/icons/pendant_flower.png",   // 款式选择页展示用图标

  "layout": {
    "shape": "slots",                                        // ← 前端据此判断进入镶嵌模式
    "params": {
      "backgroundImage": "https://sealos.xxx/pendants/flower_bg.png",  // 吊坠底图 URL
      "backgroundWidth": 800,                                // 底图原始设计宽度（px）
      "backgroundHeight": 1000,                              // 底图原始设计高度（px）
      "slots": [                                             // ← 核心：Web 管理后台标注后生成的槽位列表
        {
          "slotId": "slot_center",
          "label": "主石位",
          "x": 0.50,                                         // 槽位中心 X（0~1 百分比）
          "y": 0.30,                                         // 槽位中心 Y（0~1 百分比）
          "width": 0.15,                                     // 槽位宽度（0~1 百分比）
          "height": 0.12,                                    // 槽位高度（0~1 百分比）
          "slotShape": "circle",                             // 槽位形状（决定渲染裁剪蒙版）
          "allowedDiameters": [10, 12],                      // 该槽位只接受 10mm 或 12mm 的宝石
          "allowedShapes": ["circle"],                       // 该槽位只接受圆形切割宝石
          "allowedCategoryIds": [],                          // 空 = 不限分类，继承模板级 categoryIds
          "required": true                                   // 必填（不填不能提交订单）
        },
        {
          "slotId": "slot_left_1",
          "label": "左副石位",
          "x": 0.30,
          "y": 0.50,
          "width": 0.08,
          "height": 0.08,
          "slotShape": "circle",
          "allowedDiameters": [4, 6],
          "allowedShapes": ["circle"],
          "allowedCategoryIds": [],
          "required": false                                  // 非必填（可以留空）
        },
        {
          "slotId": "slot_right_1",
          "label": "右副石位",
          "x": 0.70,
          "y": 0.50,
          "width": 0.08,
          "height": 0.08,
          "slotShape": "oval",
          "allowedDiameters": [4, 6],
          "allowedShapes": ["circle", "oval"],
          "allowedCategoryIds": [],
          "required": false
        }
      ]
    }
  },

  "sizing": null,                                            // 镶嵌模式无尺寸概念，null

  "capacity": {
    "minBeads": 1,                                           // 至少填 1 个槽位（= required 槽位数）
    "maxBeads": 3,                                           // 总共 3 个槽位
    "allowedDiameters": [4, 6, 8, 10, 12]                   // 全局可用直径（槽位级约束优先）
  },

  "categoryIds": ["cat_crystal", "cat_jade", "cat_agate"]   // 该款式可用的素材分类 ID
}
```

```
串珠模式示例（经典手链）：

{
  "id": "tpl_bracelet_classic",
  "name": "经典手链",
  "type": "bracelet",
  "icon": "https://sealos.xxx/icons/bracelet_classic.png",

  "layout": {
    "shape": "circle",                                       // ← 前端据此进入串珠模式
    "params": {}                                             // circle 无额外参数
  },

  "sizing": {
    "label": "手围",
    "unit": "mm",
    "options": [140, 150, 160, 170, 180],
    "defaultValue": 160,
    "margin": 10                                             // 弹性余量 10mm
  },

  "capacity": {
    "minBeads": 1,
    "maxBeads": 0,                                           // 0 = 仅受尺寸限制
    "allowedDiameters": [4, 6, 8, 10, 12, 14]
  },

  "categoryIds": ["cat_crystal", "cat_obsidian", "cat_tiger_eye"]
}
```

### 2. 素材分类数据

**接口**：`GET /api/v4/diy/categories?templateId=xxx`

前端进入设计页后，按当前模板的 `categoryIds` 加载对应分类。

```
后端需返回的字段：

[
  {
    "id": "cat_crystal",
    "name": "水晶",
    "icon": "https://sealos.xxx/categories/crystal.png",    // 分类图标
    "sortOrder": 1                                           // 排序权重
  },
  {
    "id": "cat_jade",
    "name": "翡翠",
    "icon": "https://sealos.xxx/categories/jade.png",
    "sortOrder": 2
  }
]
```

### 3. 珠子/宝石素材数据

**接口**：`GET /api/v4/diy/beads?categoryId=xxx`

前端按分类懒加载素材列表，展示在底部素材选择区。

```
后端需返回的字段：

[
  {
    "id": "bead_rose_quartz_10",
    "name": "粉晶圆珠",
    "imageUrl": "https://sealos.xxx/beads/rose_quartz_10.png",  // 珠子/宝石图片（PNG 透明底）
    "thumbnailUrl": "https://sealos.xxx/beads/rose_quartz_10_thumb.png",  // 缩略图（列表展示用）
    "diameter": 10,                                          // 直径（mm）— 用于容量校验和槽位匹配
    "shape": "circle",                                       // 切割形状 — 用于镶嵌模式槽位形状匹配
    "price": 50,                                             // 单价（资产单位）
    "priceAssetCode": "DIAMOND",                             // 定价币种（对齐项目现有资产体系）
    "material": "粉晶",                                      // 材质名称（展示用）
    "stock": 999,                                            // 库存（0 = 售罄，前端灰显不可选）
    "stackable": true                                        // 可叠加标识（同款可多颗）
  }
]
```

**前端使用方式**：
- 串珠模式：展示全部素材，用户点击即添加到珠串末尾
- 镶嵌模式：根据当前激活槽位的 `allowedDiameters` + `allowedShapes` + `allowedCategoryIds` **过滤**素材列表，不匹配的灰显不可选

### 4. 设计保存与分享还原

**保存接口**：`POST /api/v4/diy/designs`

```
前端提交的数据：

串珠模式：
{
  "templateId": "tpl_bracelet_classic",
  "mode": "beads",
  "selectedSize": 160,
  "beads": [
    { "beadId": "bead_rose_quartz_10", "position": 0 },
    { "beadId": "bead_obsidian_10", "position": 1 },
    { "beadId": "bead_rose_quartz_10", "position": 2 }      // 同款可重复
  ],
  "totalPrice": 150
}

镶嵌模式：
{
  "templateId": "tpl_pendant_flower",
  "mode": "slots",
  "slotFillings": [
    { "slotId": "slot_center", "beadId": "bead_ruby_12" },
    { "slotId": "slot_left_1", "beadId": "bead_sapphire_4" }
    // slot_right_1 未填（非必填，可省略）
  ],
  "totalPrice": 280
}

后端需返回：
{
  "designId": "design_abc123",           // 设计 ID（分享用）
  "shareToken": "token_xyz"              // 分享 token（可选，用于权限控制）
}
```

**还原接口**：`GET /api/v4/diy/designs/:id`

```
后端需返回的字段（他人通过分享打开时调用）：

{
  "designId": "design_abc123",
  "template": { ... },                   // 完整模板数据（同 getTemplateById 返回结构）
  "mode": "slots",
  "slotFillings": [                      // 镶嵌模式：每个槽位填了什么
    {
      "slotId": "slot_center",
      "bead": {                          // 完整珠子信息（含图片 URL，前端直接渲染，不需要再调素材接口）
        "id": "bead_ruby_12",
        "name": "红宝石",
        "imageUrl": "https://sealos.xxx/beads/ruby_12.png",
        "diameter": 12,
        "shape": "circle",
        "price": 200
      }
    }
  ],
  "totalPrice": 280,
  "creatorNickname": "用户A",            // 设计者昵称（展示用）
  "createdAt": "2026-03-28T10:00:00Z"
}
```

### 5. 下单接口

**接口**：`POST /api/v4/diy/orders`

```
前端提交：
{
  "designId": "design_abc123",           // 设计 ID（后端据此还原完整设计内容和价格）
  "addressId": "addr_001"               // 收货地址 ID（如需实物发货）
}

后端需返回：
{
  "orderId": "order_xyz",
  "paymentInfo": {                       // 支付信息（对齐项目现有支付流程）
    "totalAmount": 280,
    "assetCode": "DIAMOND",
    "balanceSufficient": true            // 余额是否足够（前端据此决定展示支付确认还是余额不足提示）
  }
}
```

### 6. 海报小程序码

**接口**：`GET /api/v4/diy/designs/:id/qrcode`（或复用微信现有接口）

```
后端需返回：
{
  "qrcodeUrl": "https://sealos.xxx/qrcodes/design_abc123.png"   // 小程序码图片 URL
}

小程序码扫码后的路径：
  /packageDIY/diy-design/diy-design?designId=design_abc123
```

### 7. 数据流总览

```
┌──────────────────────────────────────────────────────────────────┐
│                        Web 管理后台                               │
│  上传底图 → 标注槽位坐标 → 配置约束规则 → 保存模板               │
│  管理素材分类 → 上传珠子/宝石图片 → 配置价格/库存                │
└──────────────────────┬───────────────────────────────────────────┘
                       │ 写入数据库
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                         后端 API                                  │
│  模板数据（含槽位坐标）、素材数据（含图片URL）、设计存储、订单    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ HTTP JSON
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                      小程序前端（纯消费端）                        │
│                                                                   │
│  款式选择页                                                       │
│    ← GET /templates（列表）                                       │
│    展示款式卡片，用户点击选择                                     │
│                                                                   │
│  设计页                                                           │
│    ← GET /templates/:id（完整模板，含 slots[] 坐标）              │
│    ← GET /categories?templateId（素材分类）                       │
│    ← GET /beads?categoryId（素材列表，含图片URL/直径/形状/价格）  │
│    根据 layout.shape 自动切换串珠/镶嵌渲染模式                   │
│    用户操作：选珠子/宝石 → 添加/填入 → 调整 → 预览              │
│                                                                   │
│  提交                                                             │
│    → POST /designs（保存设计）                                    │
│    → POST /orders（下单结算）                                     │
│                                                                   │
│  分享还原                                                         │
│    ← GET /designs/:id（完整设计数据，含模板+珠子信息，直接渲染）  │
└──────────────────────────────────────────────────────────────────┘
```

### 8. 前端对后端的关键要求

| 要求 | 说明 | 影响 |
|------|------|------|
| 图片必须 PNG 透明底 | Canvas 绘制宝石需要透明背景，JPG 白底会遮挡底图 | 渲染正确性 |
| 图片需提供缩略图 | 列表展示用缩略图（200×200），Canvas 渲染用高清图（400×400） | 性能（内存/加载速度） |
| 槽位坐标必须是 0~1 百分比 | 前端按屏幕宽度自适应缩放，像素绝对坐标无法适配不同机型 | 多机型兼容 |
| 模板需返回完整 slots[] | 前端不二次请求槽位数据，一次 getTemplateById 拿到全部 | 减少请求数 |
| 设计还原需返回完整珠子信息 | getDesignById 返回的 bead 需含 imageUrl/name/price，前端不再调素材接口 | 分享页秒开 |
| 素材 stock=0 时前端灰显 | 后端返回实时库存，前端据此控制可选状态 | 库存准确性 |
| 价格由后端计算和校验 | 前端展示的总价仅供参考，下单时后端根据 designId 重新计算真实价格 | 防篡改 |

---

## 七、Mock 数据与开发验证方案

> **说明**：后端接口未就绪前，前端使用 Mock 数据 + Canvas 绘制模拟图形独立开发和验证全部功能。
> 不依赖任何真实图片资源，所有视觉元素均由 Canvas 实时绘制。

### 1. Canvas 绘制模拟底图（替代真实吊坠图片）

后端未提供底图时，渲染引擎在 `backgroundImage` 为空的情况下自动切换为 Canvas 简笔绘制模式：

```
// shape-renderer 中 slots 模式的 Mock 底图绘制

function drawMockPendantBackground(ctx, drawWidth, drawHeight, offsetX, offsetY) {
  const cx = offsetX + drawWidth / 2
  const cy = offsetY + drawHeight / 2

  // 1. 吊坠主体 — 水滴形轮廓（贝塞尔曲线）
  ctx.beginPath()
  ctx.moveTo(cx, offsetY + drawHeight * 0.05)                     // 顶部尖角
  ctx.bezierCurveTo(
    cx + drawWidth * 0.45, offsetY + drawHeight * 0.25,            // 右侧控制点
    cx + drawWidth * 0.40, offsetY + drawHeight * 0.75,            // 右下控制点
    cx, offsetY + drawHeight * 0.92                                // 底部圆弧
  )
  ctx.bezierCurveTo(
    cx - drawWidth * 0.40, offsetY + drawHeight * 0.75,            // 左下控制点
    cx - drawWidth * 0.45, offsetY + drawHeight * 0.25,            // 左侧控制点
    cx, offsetY + drawHeight * 0.05                                // 回到顶部
  )
  ctx.closePath()

  // 填充：淡金色渐变模拟金属质感
  const gradient = ctx.createLinearGradient(offsetX, offsetY, offsetX, offsetY + drawHeight)
  gradient.addColorStop(0, '#F5E6CC')
  gradient.addColorStop(0.5, '#D4AF37')
  gradient.addColorStop(1, '#B8860B')
  ctx.fillStyle = gradient
  ctx.fill()

  // 边框：深金色
  ctx.strokeStyle = '#8B6914'
  ctx.lineWidth = 2
  ctx.stroke()

  // 2. 顶部吊环 — 小圆环
  ctx.beginPath()
  ctx.arc(cx, offsetY - drawHeight * 0.02, drawWidth * 0.06, 0, Math.PI * 2)
  ctx.strokeStyle = '#8B6914'
  ctx.lineWidth = 3
  ctx.stroke()

  // 3. 装饰花纹 — 几条弧线
  ctx.strokeStyle = 'rgba(139, 105, 20, 0.3)'
  ctx.lineWidth = 1
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath()
    ctx.arc(cx, cy + drawHeight * 0.1, drawWidth * 0.12 * i, -Math.PI * 0.8, -Math.PI * 0.2)
    ctx.stroke()
  }
}
```

### 2. Canvas 绘制模拟宝石（替代真实宝石图片）

素材列表中的宝石图片用 Canvas 纯色形状 + 光泽效果模拟：

```
// bead-card 组件和 shape-renderer 中的 Mock 宝石绘制

function drawMockGem(ctx, x, y, radius, color, gemShape) {
  ctx.save()

  // 1. 宝石主体
  switch (gemShape) {
    case 'circle':
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      break
    case 'oval':
      ctx.beginPath()
      ctx.ellipse(x, y, radius, radius * 0.7, 0, 0, Math.PI * 2)
      break
    case 'square':
      const half = radius * 0.85
      ctx.beginPath()
      ctx.rect(x - half, y - half, half * 2, half * 2)
      break
    case 'heart':
      ctx.beginPath()
      ctx.moveTo(x, y + radius * 0.6)
      ctx.bezierCurveTo(x - radius * 1.2, y - radius * 0.3, x - radius * 0.4, y - radius, x, y - radius * 0.4)
      ctx.bezierCurveTo(x + radius * 0.4, y - radius, x + radius * 1.2, y - radius * 0.3, x, y + radius * 0.6)
      break
  }
  ctx.closePath()

  // 径向渐变模拟宝石光泽
  const gradient = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.3, radius * 0.1,    // 高光点（偏左上）
    x, y, radius                                           // 外圈
  )
  gradient.addColorStop(0, lightenColor(color, 60))         // 高光：亮色
  gradient.addColorStop(0.4, color)                         // 主色
  gradient.addColorStop(1, darkenColor(color, 40))          // 边缘：暗色
  ctx.fillStyle = gradient
  ctx.fill()

  // 2. 边缘描边
  ctx.strokeStyle = darkenColor(color, 60)
  ctx.lineWidth = 1
  ctx.stroke()

  // 3. 高光点（左上角小白圆）
  ctx.beginPath()
  ctx.arc(x - radius * 0.25, y - radius * 0.25, radius * 0.15, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.fill()

  ctx.restore()
}

// 辅助函数
function lightenColor(hex, percent) { /* 颜色变亮 */ }
function darkenColor(hex, percent) { /* 颜色变暗 */ }
```

### 3. Mock 数据定义

```
// packageDIY/mock/mock-data.ts — 开发阶段使用，上线前删除

// ========== 模拟宝石颜色表（替代真实图片） ==========
export const MOCK_GEM_COLORS = {
  ruby:      '#E0115F',   // 红宝石 — 深红
  sapphire:  '#0F52BA',   // 蓝宝石 — 皇家蓝
  emerald:   '#50C878',   // 祖母绿 — 翠绿
  amethyst:  '#9966CC',   // 紫水晶 — 紫色
  topaz:     '#FFC87C',   // 黄玉 — 琥珀黄
  diamond:   '#B9F2FF',   // 钻石 — 冰蓝白
  rose:      '#FF69B4',   // 粉晶 — 粉色
  obsidian:  '#1C1C1C',   // 黑曜石 — 近黑
}

// ========== 模拟模板：花瓣吊坠（镶嵌模式） ==========
export const MOCK_TEMPLATE_PENDANT = {
  id: 'tpl_pendant_flower',
  name: '花瓣吊坠',
  type: 'pendant',
  icon: '',  // 空 = 用 Canvas 绘制简笔图标

  layout: {
    shape: 'slots',
    params: {
      backgroundImage: '',    // 空 = 触发 Canvas 简笔吊坠绘制
      backgroundWidth: 400,
      backgroundHeight: 500,
      slots: [
        {
          slotId: 'slot_center',
          label: '主石位',
          x: 0.50, y: 0.38,
          width: 0.20, height: 0.16,
          slotShape: 'circle',
          allowedDiameters: [10, 12],
          allowedShapes: ['circle'],
          allowedCategoryIds: [],
          required: true
        },
        {
          slotId: 'slot_left',
          label: '左副石',
          x: 0.28, y: 0.55,
          width: 0.12, height: 0.12,
          slotShape: 'circle',
          allowedDiameters: [4, 6],
          allowedShapes: ['circle', 'oval'],
          allowedCategoryIds: [],
          required: false
        },
        {
          slotId: 'slot_right',
          label: '右副石',
          x: 0.72, y: 0.55,
          width: 0.12, height: 0.12,
          slotShape: 'circle',
          allowedDiameters: [4, 6],
          allowedShapes: ['circle', 'oval'],
          allowedCategoryIds: [],
          required: false
        },
        {
          slotId: 'slot_bottom',
          label: '底部点缀',
          x: 0.50, y: 0.72,
          width: 0.10, height: 0.10,
          slotShape: 'oval',
          allowedDiameters: [4],
          allowedShapes: ['circle', 'oval', 'heart'],
          allowedCategoryIds: [],
          required: false
        }
      ]
    }
  },

  sizing: null,  // 镶嵌模式无尺寸

  capacity: {
    minBeads: 1,
    maxBeads: 4,
    allowedDiameters: [4, 6, 8, 10, 12]
  },

  categoryIds: ['cat_precious', 'cat_semi_precious']
}

// ========== 模拟模板：经典手链（串珠模式） ==========
export const MOCK_TEMPLATE_BRACELET = {
  id: 'tpl_bracelet_classic',
  name: '经典手链',
  type: 'bracelet',
  icon: '',

  layout: {
    shape: 'circle',
    params: {}
  },

  sizing: {
    label: '手围',
    unit: 'mm',
    options: [140, 150, 160, 170, 180],
    defaultValue: 160,
    margin: 10
  },

  capacity: {
    minBeads: 1,
    maxBeads: 0,
    allowedDiameters: [6, 8, 10, 12]
  },

  categoryIds: ['cat_precious', 'cat_semi_precious']
}

// ========== 模拟模板：镶嵌戒指（镶嵌模式） ==========
export const MOCK_TEMPLATE_RING = {
  id: 'tpl_ring_solitaire',
  name: '经典独钻戒',
  type: 'ring',
  icon: '',

  layout: {
    shape: 'slots',
    params: {
      backgroundImage: '',    // Canvas 绘制戒指简笔轮廓
      backgroundWidth: 300,
      backgroundHeight: 300,
      slots: [
        {
          slotId: 'slot_main',
          label: '主石位',
          x: 0.50, y: 0.25,
          width: 0.25, height: 0.25,
          slotShape: 'circle',
          allowedDiameters: [8, 10],
          allowedShapes: ['circle'],
          allowedCategoryIds: [],
          required: true
        }
      ]
    }
  },

  sizing: null,

  capacity: {
    minBeads: 1,
    maxBeads: 1,
    allowedDiameters: [8, 10]
  },

  categoryIds: ['cat_precious']
}

// ========== 模拟素材分类 ==========
export const MOCK_CATEGORIES = [
  { id: 'cat_precious', name: '贵重宝石', icon: '', sortOrder: 1 },
  { id: 'cat_semi_precious', name: '半宝石', icon: '', sortOrder: 2 }
]

// ========== 模拟宝石素材（用颜色替代图片） ==========
export const MOCK_BEADS = [
  {
    id: 'gem_ruby_12', name: '红宝石', imageUrl: '', thumbnailUrl: '',
    diameter: 12, shape: 'circle', price: 200, priceAssetCode: 'DIAMOND',
    material: '红宝石', stock: 99, stackable: true,
    _mockColor: '#E0115F'       // Mock 专用字段：Canvas 绘制用颜色
  },
  {
    id: 'gem_ruby_10', name: '红宝石(小)', imageUrl: '', thumbnailUrl: '',
    diameter: 10, shape: 'circle', price: 150, priceAssetCode: 'DIAMOND',
    material: '红宝石', stock: 99, stackable: true,
    _mockColor: '#E0115F'
  },
  {
    id: 'gem_sapphire_10', name: '蓝宝石', imageUrl: '', thumbnailUrl: '',
    diameter: 10, shape: 'circle', price: 180, priceAssetCode: 'DIAMOND',
    material: '蓝宝石', stock: 99, stackable: true,
    _mockColor: '#0F52BA'
  },
  {
    id: 'gem_sapphire_6', name: '蓝宝石(小)', imageUrl: '', thumbnailUrl: '',
    diameter: 6, shape: 'circle', price: 80, priceAssetCode: 'DIAMOND',
    material: '蓝宝石', stock: 99, stackable: true,
    _mockColor: '#0F52BA'
  },
  {
    id: 'gem_emerald_6', name: '祖母绿', imageUrl: '', thumbnailUrl: '',
    diameter: 6, shape: 'oval', price: 120, priceAssetCode: 'DIAMOND',
    material: '祖母绿', stock: 99, stackable: true,
    _mockColor: '#50C878'
  },
  {
    id: 'gem_amethyst_4', name: '紫水晶', imageUrl: '', thumbnailUrl: '',
    diameter: 4, shape: 'circle', price: 40, priceAssetCode: 'DIAMOND',
    material: '紫水晶', stock: 99, stackable: true,
    _mockColor: '#9966CC'
  },
  {
    id: 'gem_topaz_4', name: '黄玉', imageUrl: '', thumbnailUrl: '',
    diameter: 4, shape: 'heart', price: 60, priceAssetCode: 'DIAMOND',
    material: '黄玉', stock: 99, stackable: true,
    _mockColor: '#FFC87C'
  },
  {
    id: 'gem_diamond_10', name: '钻石', imageUrl: '', thumbnailUrl: '',
    diameter: 10, shape: 'circle', price: 500, priceAssetCode: 'DIAMOND',
    material: '钻石', stock: 10, stackable: true,
    _mockColor: '#B9F2FF'
  },
  {
    id: 'gem_rose_8', name: '粉晶', imageUrl: '', thumbnailUrl: '',
    diameter: 8, shape: 'circle', price: 30, priceAssetCode: 'DIAMOND',
    material: '粉晶', stock: 999, stackable: true,
    _mockColor: '#FF69B4'
  },
  {
    id: 'gem_obsidian_8', name: '黑曜石', imageUrl: '', thumbnailUrl: '',
    diameter: 8, shape: 'circle', price: 25, priceAssetCode: 'DIAMOND',
    material: '黑曜石', stock: 999, stackable: true,
    _mockColor: '#1C1C1C'
  }
]

// ========== 模拟模板列表（款式选择页用） ==========
export const MOCK_TEMPLATES = [
  MOCK_TEMPLATE_PENDANT,
  MOCK_TEMPLATE_BRACELET,
  MOCK_TEMPLATE_RING
]
```

### 4. 渲染引擎 Mock 适配逻辑

```
// shape-renderer 中根据 imageUrl 是否为空决定绘制方式

case 'slots':
  params = template.layout.params

  // 底图绘制：真实图片 vs Mock 简笔画
  if (params.backgroundImage) {
    // 正式模式：绘制后端返回的真实底图
    ctx.drawImage(loadedImage, offsetX, offsetY, drawWidth, drawHeight)
  } else {
    // Mock 模式：Canvas 绘制简笔吊坠/戒指轮廓
    if (template.type === 'pendant') {
      drawMockPendantBackground(ctx, drawWidth, drawHeight, offsetX, offsetY)
    } else if (template.type === 'ring') {
      drawMockRingBackground(ctx, drawWidth, drawHeight, offsetX, offsetY)
    }
  }

  // 槽位内宝石绘制：真实图片 vs Mock 纯色形状
  for (slot in slotDefs) {
    gem = slotFillings.get(slot.slotId)
    if (gem) {
      if (gem.imageUrl) {
        // 正式模式：绘制真实宝石图片（带裁剪蒙版）
        ctx.save()
        clipByShape(ctx, slot.slotShape, slotX, slotY, slotW, slotH)
        ctx.drawImage(gem.imageUrl, ...)
        ctx.restore()
      } else {
        // Mock 模式：Canvas 绘制纯色宝石（带渐变光泽）
        drawMockGem(ctx, slotX, slotY, slotW / 2, gem._mockColor, gem.shape)
      }
    } else {
      // 空槽位：虚线轮廓 + "+" 提示（两种模式通用）
      drawEmptySlot(ctx, slot, slotX, slotY, slotW, slotH)
    }
  }
```

### 5. Mock 戒指底图绘制

```
function drawMockRingBackground(ctx, drawWidth, drawHeight, offsetX, offsetY) {
  const cx = offsetX + drawWidth / 2
  const cy = offsetY + drawHeight / 2

  // 1. 戒指环体 — 椭圆环
  const outerRx = drawWidth * 0.40
  const outerRy = drawHeight * 0.35
  const innerRx = drawWidth * 0.30
  const innerRy = drawHeight * 0.25

  // 外圈
  ctx.beginPath()
  ctx.ellipse(cx, cy + drawHeight * 0.1, outerRx, outerRy, 0, 0, Math.PI * 2)
  const ringGradient = ctx.createLinearGradient(offsetX, offsetY, offsetX + drawWidth, offsetY + drawHeight)
  ringGradient.addColorStop(0, '#E8E8E8')
  ringGradient.addColorStop(0.5, '#C0C0C0')
  ringGradient.addColorStop(1, '#A0A0A0')
  ctx.fillStyle = ringGradient
  ctx.fill()
  ctx.strokeStyle = '#808080'
  ctx.lineWidth = 2
  ctx.stroke()

  // 内圈镂空
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.beginPath()
  ctx.ellipse(cx, cy + drawHeight * 0.1, innerRx, innerRy, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // 2. 戒托 — 顶部梯形凸起
  ctx.beginPath()
  ctx.moveTo(cx - drawWidth * 0.12, cy - drawHeight * 0.15)
  ctx.lineTo(cx - drawWidth * 0.08, cy - drawHeight * 0.30)
  ctx.lineTo(cx + drawWidth * 0.08, cy - drawHeight * 0.30)
  ctx.lineTo(cx + drawWidth * 0.12, cy - drawHeight * 0.15)
  ctx.closePath()
  ctx.fillStyle = '#C0C0C0'
  ctx.fill()
  ctx.strokeStyle = '#808080'
  ctx.lineWidth = 1.5
  ctx.stroke()
}
```

### 6. 素材卡片 Mock 绘制

```
// bead-card 组件中：小 Canvas 绘制宝石缩略图（替代 <image> 标签）

素材卡片布局：
  ┌─────────────────┐
  │  ┌───────────┐  │
  │  │ Canvas    │  │  ← 40×40rpx 小画布，drawMockGem() 绘制宝石
  │  │ 纯色宝石  │  │
  │  └───────────┘  │
  │   粉晶圆珠      │  ← 名称
  │   8mm · 圆形    │  ← 规格
  │   💎 30         │  ← 价格
  └─────────────────┘

当 bead.imageUrl 非空时，直接用 <image src="{{imageUrl}}"> 替换 Canvas 绘制。
Mock 模式和正式模式通过 imageUrl 是否为空自动切换，无需改代码。
```

### 7. Mock 切换策略

```
开发流程（零配置切换）：

1. Mock 阶段（后端未就绪）：
   - API 层拦截：getTemplates() 直接返回 MOCK_TEMPLATES
   - API 层拦截：getBeadsByCategory() 直接返回 MOCK_BEADS
   - 渲染引擎检测 imageUrl 为空 → 自动 Canvas 绘制
   - 开发、调试、验证全部功能

2. 联调阶段（后端就绪后）：
   - API 层切换为真实请求（删除 Mock 拦截）
   - 后端返回真实 imageUrl → 渲染引擎自动切换为图片模式
   - 无需改任何渲染代码，imageUrl 空/非空自动分发

3. 上线前：
   - 删除 packageDIY/mock/ 目录
   - 删除 _mockColor 字段引用（全局搜索 _mockColor 即可定位）
```
