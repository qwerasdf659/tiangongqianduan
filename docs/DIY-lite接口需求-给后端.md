# DIY 手串设计台（diy-lite）· 前端接口需求（给后端）

> 面向对象：后端数据库开发同学
> 提出方：微信小程序前端
> 目的：把前端 diy-lite 离线演示页的**写死演示数据**替换为**后端权威数据**，实现正式上线。
> 现状核对时间：2026-07-09（以本项目 `utils/api/diy.ts` 与 `typings/api.d.ts` 现有定义为准）

---

## 0. 背景与结论（先说要点）

- 前端已完成 diy-lite 手串设计台（选珠、圆环排列、立体渲染、拖拽换位/删除、伪3D、手围容量、拍照、购物车、草稿、分享等），**功能完整**。
- 其中"草稿保存/还原/分享"目前是**本地临时方案**，正式版需接后端作品接口（见第 9 节）。
- 目前珠子数据（价格/直径/材质/寓意/重量/能量属性/搭配建议、手围绳长规则）是**前端写死的离线演示数据**，不能上线。
- 后端 **DIY 接口已存在**（`/api/v4/diy/...`，见 `utils/api/diy.ts`），`GET /api/v4/diy/templates/:id/beads` 已返回 `DiyBead`，含 `diameter/shape/price/group_code/image_media/stock` 等。
- **本需求不是从零建接口**，而是：① 复用现有接口；② 请后端在 `DiyBead` 上**补充 5 个渲染/展示字段**（material_type/meaning/weight/energy/pairing）；③ 明确几项业务规则由后端下发。

> 约定：全部字段 `snake_case`；主键 `{table}_id`；金额/库存/规则等业务数据以后端为准，前端不做本地计算与默认值。

---

## 1. 复用的现有接口（无需改动，前端已对接）

| 用途 | 方法与路径 | 说明 |
| --- | --- | --- |
| 珠子素材列表 | `GET /api/v4/diy/templates/:id/beads` | 支持 `group_code`/`diameter`/`keyword`/`slot_id` 查询参数 |
| 材料分组 | `GET /api/v4/diy/material-groups` | 返回 `[{ group_code, count, sample_name }]` |
| 模板详情 | `GET /api/v4/diy/templates/:id` | 含 `bead_rules`/`sizing_rules`/`capacity_rules` |
| 保存作品/草稿 | `POST /api/v4/diy/works` | 正式版替换前端"本地草稿"（见第 9 节） |
| 作品详情/还原 | `GET /api/v4/diy/works/:id` | 正式版替换前端"本地还原"、支撑分享还原（见第 9 节） |

前端 diy-lite 的珠子列表将改为调用 `getDiyTemplateBeads()`，把本地 `bead-data.ts` 整体替换。

---

## 2. 需要后端在 `DiyBead` 上补充的字段（核心需求）

现有 `DiyBead`（见 `typings/api.d.ts` 第 2488 行）已有：`diy_material_id / material_code / display_name / material_name / group_code / diameter / shape / price / price_asset_code / stock / image_media / sort_order / is_enabled`。

diy-lite 的渲染与详情展示还需要以下字段，请后端补充下发：

| 需补充字段 | 类型 | 用途 | 缺失时前端影响 |
| --- | --- | --- | --- |
| `material_type` | string 枚举 | 珠子立体渲染的材质光影档位 | 缺失则统一按水晶渲染，金属/玉石/哑光质感无法区分 |
| `meaning` | string | 珠子详情弹窗的寓意文案 | 缺失则详情无寓意介绍 |
| `weight` | number | 珠子参考克重（详情展示） | 缺失则详情不显示重量 |
| `energy` | string | 珠子详情的「能量属性」文案（如"财富·活力"） | 缺失则详情不显示能量属性 |
| `pairing` | string | 珠子详情的「搭配建议」文案（如"搭配白水晶提亮"） | 缺失则详情不显示搭配建议 |

> `energy` / `pairing` 是提升"选珠像了解一件宝贝"体验的软性运营文案，可按珠子或按分类维度提供。前端当前按分类兜底演示。

### 2.1 `material_type` 取值约定（请后端在此集合内取值）

用于前端 Canvas 立体高光参数选择：

| 值 | 含义 | 视觉表现 |
| --- | --- | --- |
| `crystal` | 通透水晶（默认） | 大而亮的高光 + 底部反光 |
| `stone` | 玉石/奶体 | 柔和高光，温润 |
| `metal` | 金属/刻面镜面 | 小而锐的高光 |
| `matte` | 哑光/不透光 | 几乎无高光，漫反射 |

> 若后端暂不能提供，前端会按 `crystal` 兜底，但会丢失材质差异，建议纳入。

### 2.2 `weight` 单位与口径

- 单位：**克(g)**，保留 1 位小数。
- 口径：请明确是"单颗珠子净重"还是"含配件"。前端仅做展示，不参与计算。

---

## 3. 异形珠（管珠/药片等）渲染所需元数据（重要）

现有 `shape` 字段（circle/ellipse/oval/square/heart/teardrop）**不足以支撑异形珠的正确摆放**。前端渲染异形珠时需要知道它在手串上的真实几何与朝向，否则只能靠前端猜测（当前离线演示就是猜的）。

请后端为异形珠提供：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `size_length_mm` | number | 实物长边（mm），如跑环 14.5 |
| `size_width_mm` | number | 实物短边（mm），如跑环 4.5 |
| `bore_orientation` | string 枚举 | 穿绳方向：`along_length`(绳穿长轴，如管珠) / `along_width`(绳穿短边，如药片) / `none`(圆珠) |
| `image_bbox_ratio` | number | 实拍图去透明后"宽:高"比例（如药片 0.5、跑环 0.28），用于按真实比例绘制 |

> 若这些拿不到，前端只能对异形珠做近似摆放（朝向可能不准），建议随实拍图一并录入。圆珠（shape=circle）不需要这些字段。

---

## 4. 图片要求（image_media）

- 现有 `image_media.public_url` 已满足加载。前端加载器**同时支持** `http(s)://` 与包内本地路径，可无缝切 CDN。
- 请确认珠子图为**带透明通道的 PNG/WebP、实物居中**（异形珠依赖透明区域计算真实边界）。
- 几百种珠子请走 **CDN**，前端已做超时兜底与失败降级。

---

## 5. 手围/绳长/容量规则（请后端下发，勿由前端写死）

diy-lite 目前把"手围→绳长→最大珠数"写死在前端（违反"业务规则由后端提供"）。请后端通过模板的 `sizing_rules` / `capacity_rules`（已存在）或新增字段下发以下规则：

| 规则 | 期望来源 | 说明 |
| --- | --- | --- |
| 可选手围范围（cm） | 后端下发 | 如 10~22cm |
| 戴法圈数 | 后端下发 | 单/双/三圈及对应绳长倍率 |
| 绳长容量算法 | 后端明确 | 目前前端用 `手围×10×圈数(mm)`，请确认或给出正确公式 |
| 弹性余量 | `bead_rules.margin`（已有） | 行业标准约 10mm |
| 最少/最多珠数 | `capacity_rules.min_beads/max_beads`（已有） | 前端据此限制加珠 |

> 前端诉求：给出"容量如何由手围换算"的权威口径，前端严格按此实现，不再自行估算。

---

## 6. 前端不需要、请勿下发的（避免泄密）

按数据最小化与防抓包原则，以下**不要**下发到前端：

- 珠子**成本价、进货价、利润**等内部定价数据（前端只需展示售价 `price`）。
- 库存的**精确数量**（若涉及商业机密）；前端只需"是否有货"即可，可用 `stock: -1` 表无限、`0` 表无货、正数表有货，无需真实库存量。
- 供应商、内部编码等后台字段。

> 如果某字段可能涉及商业机密，请在对接时告知，由业务方决定是否下发。

---

## 7. 前端改造对应关系（供后端理解前端如何用）

| 前端当前（写死） | 替换为后端字段 |
| --- | --- |
| `bead-data.ts` 的 `price` | `DiyBead.price` |
| `bead-data.ts` 的 `diameter` | `DiyBead.diameter` |
| `bead-data.ts` 的 `material`(4档) | `DiyBead.material_type` |
| `bead-data.ts` 的 `meaning` | `DiyBead.meaning` |
| `bead-data.ts` 的 `weight` | `DiyBead.weight` |
| `bead-data.ts` 的 `energy` | `DiyBead.energy` |
| `bead-data.ts` 的 `pairing` | `DiyBead.pairing` |
| 前端写死的手围/圈数/容量 | `sizing_rules` / `capacity_rules` + 容量公式 |
| 本地 assets 图片 | `image_media.public_url`（CDN） |

---

## 8. 需要后端确认/回复的问题清单

1. `DiyBead` 能否补充 `material_type` / `meaning` / `weight` / `energy` / `pairing` 五个字段？各自数据来源与录入方式（按珠子还是按分类）？
2. 异形珠的 `size_length_mm` / `size_width_mm` / `bore_orientation` / `image_bbox_ratio` 能否随素材录入并下发？
3. 珠子图片是否为"带透明通道、实物居中"的规范图？CDN 地址与命名规范？
4. 绳长容量的权威换算公式是什么？以 `sizing_rules`/`capacity_rules` 下发还是新增字段？
5. 库存对前端的暴露口径（是否可只给"有货/无货"而非精确数量）？
6. 是否有字段涉及商业机密、需要脱敏或不下发？
7. 草稿保存/还原与分享还原，是否直接用现有 `POST /diy/works` + `GET /diy/works/:id`？作品数据结构 `design_data` 的字段约定？（见第 9 节）

---

## 9. 草稿保存 / 作品还原 / 分享（前端现为本地临时方案，待接后端）

diy-lite 目前对以下三处做了**本地临时实现**，正式版需接后端：

| 功能 | 前端当前（临时） | 正式版应改为 |
| --- | --- | --- |
| 保存草稿 | `wx.setStorage` 存珠子 id + 手围/戴法（本地，换设备/清缓存即失效） | `POST /api/v4/diy/works` 保存到后端 |
| 进入还原 | 从本地 storage 读回并重建 | `GET /api/v4/diy/works/:id` 拉取作品 `design_data` 还原 |
| 分享好友 | `onShareAppMessage` 仅带落地页，**不含具体设计** | 分享路径带 `?workId=xxx`，好友打开用 `GET /diy/works/:id` 还原对方的设计 |

需要后端明确：

- `POST /diy/works` 的 `design_data` 应包含哪些字段才能完整还原一串手串？前端建议至少包含：**有序的珠子列表**（每颗 `diy_material_id` + `diameter`）、**手围 `wrist_size`**、**戴法 `wear_type`（单/双/三圈）**。
- 分享还原路径约定：前端计划用 `/packageDIY/diy-lite/diy-lite?workId={diy_work_id}`，好友打开后调 `GET /diy/works/:id` 拉取 `design_data` 重建。请确认该接口对**非作者**是否可读（分享场景需要）。
- 作品预览图：分享卡片若要显示手串缩略图，需要作品的 `preview_media`（后端 `diy_works` 已有 `preview_media` 字段），前端可在保存时用 Canvas 导出图上传，请确认上传通道。

> 前端诉求：草稿/还原/分享统一走后端作品体系，前端删除本地 storage 临时逻辑。字段以后端 `diy_works.design_data` 约定为准。

---

**说明**：本文档仅描述前端对后端数据的需求，不含前端实现细节。字段命名遵循项目 `snake_case` 约定，接口沿用现有 `/api/v4/diy/` 体系，前端不做字段映射、按后端返回格式直接使用。
