# DIY 饰品「本地演示」数据与图片资源备份

> 版本：v1.0（2026-07-15） | 来源：微信小程序前端 `packageDIY/diy-lite/bead-data.ts` + `packageDIY/diy-lite/assets/`
> 用途：交付给后端数据库项目 / Web 管理后台前端项目，作为录入真实模板与素材的**参考样例**。
> 说明：本文件为「本地演示模式」的数据快照。演示数据仅前端写死用于离线体验（保存/下单禁用），
> 正式功能以后端为权威。字段命名全部对齐后端 snake_case，可直接照此录入。

---

## 一、总览

本地演示共分两类玩法、7 个演示模板、27 颗串珠素材 + 3 颗镶嵌宝石素材、35 张图片。

| 玩法 | 模板 | 品类 | 图片底图 |
|---|---|---|---|
| 串珠模式 | 手串（本地演示） | 手链/手串 | 无底图（沿圆形排珠） |
| 串珠模式 | 108 佛珠（本地演示） | 108佛珠 | `demo-mala-thumb.jpg`（列表缩略图） |
| 镶嵌模式 | 托帕石项链（本地演示） | 项链 | `demo-necklace-base.jpg` |
| 镶嵌模式 | 主石戒指（本地演示） | 戒指 | `demo-ring-base.jpg` |
| 镶嵌模式 | 水滴吊坠（本地演示） | 吊坠 | `demo-pendant-base.jpg` |
| 镶嵌模式 | 一对耳钉（本地演示） | 耳饰 | `demo-earrings-base.jpg` |
| 镶嵌模式 | 手机链包挂（本地演示） | 手机链包挂 | `demo-charm-base.jpg` |

> 串珠模板（手串/佛珠）共用同一套 27 颗水晶珠素材；镶嵌模板（项链/戒指/吊坠/耳饰/手机链）共用同一套 3 颗宝石素材。

---

## 二、串珠素材库（27 颗，对应 diy_materials 珠子）

> 字段口径：`material_code`=前端演示 id；`price` 为演示价（元），正式版由后端定价（星石/源晶）；
> `weight` 为按球体体积估算的演示克重（水晶密度 2.65 g/cm³）；`cord_occupy_mm` 为单颗沿绳占用毫米
> （圆珠=直径、药片=短边、跑环=长边），正式版由后端派生。`shape`：round 圆珠 / special 异形。

### 2.1 白水晶系（group_code=white）

| material_code | 名称 display_name | 直径mm | 尺寸文本 | 演示价 | shape | material_type | bore_orientation | size_length_mm | size_width_mm | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| white-jingti-12 | 净体白水晶 | 12 | 12mm | 15 | round | crystal | none | - | - | 12 | white-jingti-12.png |
| white-jingti-8 | 净体白水晶 | 8 | 8mm | 5 | round | crystal | none | - | - | 8 | white-jingti-8.png |
| white-naibai-12 | 奶白晶 | 12 | 12mm | 11 | round | stone | none | - | - | 12 | white-naibai-12.png |
| white-naibai-8 | 奶白晶 | 8 | 8mm | 4 | round | stone | none | - | - | 8 | white-naibai-8.png |
| white-hunsha-12 | 婚纱闪白阿塞 | 12 | 12mm | 8 | round | crystal | none | - | - | 12 | white-hunsha-12.png |
| white-hunsha-8 | 婚纱闪白阿塞 | 8 | 8mm | 3.5 | round | crystal | none | - | - | 8 | white-hunsha-8.png |
| white-fangtang-9 | 白水晶刻面方糖 | 9 | 9mm | 10 | round | metal | none | - | - | 9 | white-fangtang-9.png |
| white-yaopian | 白水晶药片珠 | 8.7 | 3.6mmx8.7mm | 5 | special | crystal | along_width | 8.7 | 3.6 | 3.6 | white-yaopian.png |
| white-paohuan | 白水晶跑环 | 14.5 | 4.5mmx14.5mm | 16 | special | crystal | along_length | 14.5 | 4.5 | 14.5 | white-paohuan.png |

### 2.2 粉水晶系（group_code=pink）

| material_code | 名称 | 直径mm | 尺寸文本 | 演示价 | shape | material_type | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|
| pink-xingguang-12 | 星光粉晶 | 12 | 12mm | 28 | round | crystal | 12 | pink-xingguang-12.png |
| pink-xingguang-8 | 星光粉晶 | 8 | 8mm | 9 | round | crystal | 8 | pink-xingguang-8.png |
| pink-zifen-12 | 紫粉晶 | 12 | 12mm | 16 | round | crystal | 12 | pink-zifen-12.png |
| pink-zifen-8 | 紫粉晶 | 8 | 8mm | 6 | round | crystal | 8 | pink-zifen-8.png |
| pink-mitao-12 | 蜜桃粉晶 | 12 | 12mm | 13 | round | stone | 12 | pink-mitao-12.png |
| pink-mitao-8 | 蜜桃粉晶 | 8 | 8mm | 4 | round | stone | 8 | pink-mitao-8.png |

### 2.3 紫水晶系（group_code=purple）

| material_code | 名称 | 直径mm | 尺寸文本 | 演示价 | shape | material_type | bore_orientation | size_length_mm | size_width_mm | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| purple-wulagui-12 | 乌拉圭紫水晶 | 12 | 12mm | 37 | round | crystal | none | - | - | 12 | purple-wulagui-12.png |
| purple-wulagui-8 | 乌拉圭紫水晶 | 8 | 8mm | 12 | round | crystal | none | - | - | 8 | purple-wulagui-8.png |
| purple-baxi-12 | 巴西紫水晶 | 12 | 12mm | 56 | round | crystal | none | - | - | 12 | purple-baxi-12.png |
| purple-baxi-8 | 巴西紫水晶 | 8 | 8mm | 18 | round | crystal | none | - | - | 8 | purple-baxi-8.png |
| purple-paohuan | 紫水晶跑环 | 14.5 | 4.2mmx14.5mm | 24 | special | crystal | along_length | 14.5 | 4.2 | 14.5 | purple-paohuan.png |
| purple-xunyicao-8 | 薰衣草紫水晶 | 8 | 8mm | 8 | round | matte | none | - | - | 8 | purple-xunyicao-8.png |

### 2.4 黄水晶系（group_code=yellow）

| material_code | 名称 | 直径mm | 尺寸文本 | 演示价 | shape | material_type | cord_occupy_mm | 图片 |
|---|---|---|---|---|---|---|---|---|
| yellow-baoli-10 | 暴力黄黄水晶 | 10 | 10mm | 67 | round | crystal | 10 | yellow-baoli-10.png |
| yellow-baoli-8 | 暴力黄黄水晶 | 8 | 8mm | 32 | round | crystal | 8 | yellow-baoli-8.png |
| yellow-ningmeng-12 | 透体柠檬黄水晶 | 12 | 12mm | 19 | round | crystal | 12 | yellow-ningmeng-12.png |
| yellow-ningmeng-8 | 透体柠檬黄水晶 | 8 | 8mm | 6 | round | crystal | 8 | yellow-ningmeng-8.png |
| yellow-huangta-12 | 黄塔晶 | 12 | 12mm | 20 | round | crystal | 12 | yellow-huangta-12.png |
| yellow-huangta-8 | 黄塔晶 | 8 | 8mm | 6.5 | round | crystal | 8 | yellow-huangta-8.png |

### 2.5 文案映射（寓意 meaning / 能量 energy / 搭配 pairing）

**寓意（按名称，同名不同尺寸共用）：**

| 名称 | meaning 寓意文案 |
|---|---|
| 净体白水晶 | 净化气场，提升专注与灵性，被誉为「水晶之王」。 |
| 奶白晶 | 温润柔和，助眠安神，适合日常佩戴。 |
| 婚纱闪白阿塞 | 通透闪耀，象征纯洁与新的开始。 |
| 白水晶刻面方糖 | 多切面折射光泽，招财纳福。 |
| 白水晶药片珠 | 小巧点缀，平衡整串比例。 |
| 白水晶跑环 | 管珠造型，串联点睛，增添层次。 |
| 星光粉晶 | 招桃花、旺人缘，柔化人际关系。 |
| 紫粉晶 | 兼具粉晶与紫晶能量，安抚情绪。 |
| 蜜桃粉晶 | 甜美温柔，提升亲和力与自信。 |
| 乌拉圭紫水晶 | 开智增慧，助眠安神，色泽浓郁。 |
| 巴西紫水晶 | 经典紫调，象征智慧与高贵。 |
| 紫水晶跑环 | 管珠造型，串联提亮整串气质。 |
| 薰衣草紫水晶 | 淡雅浪漫，舒缓压力，助放松。 |
| 暴力黄黄水晶 | 招正财、聚财气，色泽饱满明亮。 |
| 透体柠檬黄水晶 | 清透明黄，带来活力与好心情。 |
| 黄塔晶 | 能量聚焦，增强行动力与决断。 |

**能量 + 搭配（按 group_code）：**

| group_code | energy 能量 | pairing 搭配 |
|---|---|---|
| white | 净化 · 清明 | 百搭主珠，与紫/粉水晶皆宜 |
| pink | 爱情 · 人缘 | 搭配白水晶提亮，或紫水晶添柔 |
| purple | 智慧 · 安神 | 搭配白水晶点缀，气质沉静 |
| yellow | 财富 · 活力 | 搭配白水晶或作点睛主珠 |

> 说明：`five_elements`（五行）本地演示未写死（前端无权威依据），正式版由后端下发。

---

## 三、串珠模板配置（sizing_rules / bead_rules / capacity_rules）

### 3.1 手串模板（category=手链 191）

- `layout`: `{ shape: 'circle' }`
- `bead_rules`: `{ margin: 0, default_diameter: 8, allowed_diameters: [] }`（空=不限直径）
- `capacity_rules`: `{ min_beads: 1, max_beads: 0 }`（0=不限颗数上限）
- `sizing_rules.elastic_margin_mm`: 15（弹力/工艺余量 mm）
- `sizing_rules.default_size`: "15"
- `sizing_rules.size_options`（手围毫米字段口径：目标周长 = 手围 + 15mm 余量）：

| label | display | wrist_size_mm | target_length_mm | bead_count(兜底) |
|---|---|---|---|---|
| 12 | 手围 12cm（约 16 颗） | 120 | 135 | 16 |
| 13 | 手围 13cm（约 18 颗） | 130 | 145 | 18 |
| 14 | 手围 14cm（约 19 颗） | 140 | 155 | 19 |
| 15 | 手围 15cm（约 20 颗） | 150 | 165 | 20 |
| 16 | 手围 16cm（约 21 颗） | 160 | 175 | 21 |
| 17 | 手围 17cm（约 23 颗） | 170 | 185 | 23 |
| 18 | 手围 18cm（约 24 颗） | 180 | 195 | 24 |
| 15x2 | 手围 15cm 双圈（约 41 颗） | 150 | 330 | 41 |
| 15x3 | 手围 15cm 三圈（约 61 颗） | 150 | 495 | 61 |

### 3.2 108 佛珠模板（category=108佛珠 293）

- `layout`: `{ shape: 'circle' }`
- `bead_rules`: `{ margin: 0, default_diameter: 8, allowed_diameters: [] }`
- `capacity_rules`: `{ min_beads: 1, max_beads: 0 }`
- `sizing_rules.default_size`: "108x8"
- `sizing_rules.size_options`（佛珠按颗数制，无手围毫米）：

| label | display | bead_count |
|---|---|---|
| 54x8 | 54颗 · 8mm珠 | 54 |
| 108x6 | 108颗 · 6mm珠 | 108 |
| 108x8 | 108颗 · 8mm珠 | 108 |

---

## 四、镶嵌模板配置（layout.slot_definitions）

> 底图统一 640×960（2:3 竖幅）；槽位坐标为归一化中心点（0~1），字段完全对齐后端
> `slot_definitions`：`slot_id / label / x / y / width / height / required / allowed_diameters / allowed_shapes / allowed_group_codes`。
> 高度按底图宽高比折算保证正圆：`height = round(width × 640/960 × 1000)/1000`。

### 4.1 托帕石项链（category=项链 192，底图 demo-necklace-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| main | 主石 | 0.51 | 0.672 | 0.15 | 0.100 | true |

### 4.2 主石戒指（category=戒指 193，底图 demo-ring-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| main | 主石 | 0.505 | 0.285 | 0.17 | 0.113 | true |

### 4.3 水滴吊坠（category=吊坠 194，底图 demo-pendant-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| main | 主石 | 0.49 | 0.605 | 0.28 | 0.187 | true |

### 4.4 一对耳钉（category=耳饰 291，底图 demo-earrings-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| left | 左耳 | 0.295 | 0.565 | 0.24 | 0.160 | true |
| right | 右耳 | 0.705 | 0.565 | 0.24 | 0.160 | true |

### 4.5 手机链包挂（category=手机链包挂 292，底图 demo-charm-base.jpg）

| slot_id | label | x | y | width | height | required |
|---|---|---|---|---|---|---|
| top | 上珠 | 0.502 | 0.362 | 0.145 | 0.097 | true |
| middle | 中珠 | 0.499 | 0.521 | 0.145 | 0.097 | true |
| bottom | 下珠 | 0.502 | 0.666 | 0.145 | 0.097 | true |

> 所有槽位的 `allowed_diameters / allowed_shapes / allowed_group_codes` 均为空数组（不限制），`rotation` 未设置（0）。

---

## 五、镶嵌宝石素材（3 颗，对应 diy_materials 宝石，供 5 个镶嵌模板共用）

> 演示价单位为"元"，正式版由后端定价（星石/源晶）。图片为白底顶视圆形切工宝石图。

| material_code | display_name | group_code | 直径mm | shape | 演示价 | meaning 寓意 | 图片 |
|---|---|---|---|---|---|---|---|
| demo-gem-blue | 托帕石·冰湖蓝 | blue | 8 | round | 30 | 十一月生辰石，象征真挚与好运，蓝调清澈如冰湖。 | demo-gem-blue.jpg |
| demo-gem-pink | 粉蓝宝·蔷薇粉 | red | 8 | round | 45 | 温柔而炽烈的蔷薇色调，寓意浪漫与忠贞。 | demo-gem-pink.jpg |
| demo-gem-green | 沙弗莱·翠绿 | green | 8 | round | 58 | 浓郁翠绿如初夏森林，象征生机与富足。 | demo-gem-green.jpg |

---

## 六、图片资源清单（35 张，路径 packageDIY/diy-lite/assets/）

### 6.1 镶嵌底图 + 宝石 + 缩略图（9 张 jpg）

| 文件名 | 大小(字节) | 用途 |
|---|---|---|
| demo-necklace-base.jpg | 38562 | 项链空托底图（640×960） |
| demo-ring-base.jpg | 39845 | 戒指空托底图 |
| demo-pendant-base.jpg | 50880 | 吊坠空托底图 |
| demo-earrings-base.jpg | 22737 | 耳钉空托底图（左右双槽） |
| demo-charm-base.jpg | 21312 | 手机链包挂底图（三珠位） |
| demo-gem-blue.jpg | 19347 | 托帕石·冰湖蓝 宝石图 |
| demo-gem-pink.jpg | 16618 | 粉蓝宝·蔷薇粉 宝石图 |
| demo-gem-green.jpg | 18850 | 沙弗莱·翠绿 宝石图 |
| demo-mala-thumb.jpg | 12546 | 108佛珠列表缩略图 |

### 6.2 串珠水晶素材图（26 张 png，透明通道，实物居中）

| 文件名 | 大小(字节) | 对应素材 |
|---|---|---|
| white-jingti-12.png | 54403 | 净体白水晶 12mm |
| white-jingti-8.png | 54403 | 净体白水晶 8mm |
| white-naibai-12.png | 37118 | 奶白晶 12mm |
| white-naibai-8.png | 37118 | 奶白晶 8mm |
| white-hunsha-12.png | 51515 | 婚纱闪白阿塞 12mm |
| white-hunsha-8.png | 51515 | 婚纱闪白阿塞 8mm |
| white-fangtang-9.png | 52883 | 白水晶刻面方糖 9mm |
| white-yaopian.png | 23449 | 白水晶药片珠（异形） |
| white-paohuan.png | 23269 | 白水晶跑环（异形管珠） |
| pink-xingguang-12.png | 38062 | 星光粉晶 12mm |
| pink-xingguang-8.png | 38062 | 星光粉晶 8mm |
| pink-zifen-12.png | 47710 | 紫粉晶 12mm |
| pink-zifen-8.png | 47710 | 紫粉晶 8mm |
| pink-mitao-12.png | 40316 | 蜜桃粉晶 12mm |
| pink-mitao-8.png | 40316 | 蜜桃粉晶 8mm |
| purple-wulagui-12.png | 53648 | 乌拉圭紫水晶 12mm |
| purple-wulagui-8.png | 53648 | 乌拉圭紫水晶 8mm |
| purple-baxi-12.png | 57163 | 巴西紫水晶 12mm |
| purple-baxi-8.png | 57163 | 巴西紫水晶 8mm |
| purple-paohuan.png | 27677 | 紫水晶跑环（异形管珠） |
| purple-xunyicao-8.png | 62808 | 薰衣草紫水晶 8mm |
| yellow-baoli-10.png | 57424 | 暴力黄黄水晶 10mm |
| yellow-baoli-8.png | 57424 | 暴力黄黄水晶 8mm |
| yellow-ningmeng-12.png | 51955 | 透体柠檬黄水晶 12mm |
| yellow-ningmeng-8.png | 51955 | 透体柠檬黄水晶 8mm |
| yellow-huangta-12.png | 67212 | 黄塔晶 12mm |
| yellow-huangta-8.png | 67212 | 黄塔晶 8mm |

> 交付图片时，直接拷贝 `packageDIY/diy-lite/assets/` 整个目录即可（共 35 个文件）。

---

## 七、字段口径备注（交付给后端/管理端时对齐）

1. **material_code**：本备份用的是前端演示 id（如 `white-jingti-8`）。正式录入后端由后端生成 `DM+日期+序列` 格式编码，前端会改用后端下发的 `material_code`，此处 id 仅作素材对应关系参考。
2. **price**：演示价为"元"，仅体验用。正式版按星石（`star_stone`）/源晶体系整数定价，由后端配置。
3. **cord_occupy_mm**：本备份已列出每颗的沿绳占用（圆珠=直径、药片=短边、跑环=长边），正式版由后端按 `bore_orientation + 物理尺寸` 派生下发，管理端只需录入 `diameter / size_length_mm / size_width_mm / bore_orientation`。
4. **weight**：演示克重为按球体体积估算，正式版由后端/运营录入真实克重。
5. **five_elements（五行）**：本地演示未提供，需运营补充。
6. **图片**：正式版由管理端上传到对象存储，前端改用后端下发的 `image_media.public_url`。

---

## 八、请【后端数据库项目】按本地演示落地的事

> 小程序前端已按接口契约完成全部对接代码（模板列表/详情/素材/手围估算/保存/确认/完成/小程序码），
> 渲染链路与本地演示一致。**前端无需再改**，只等后端有真实已发布模板 + 素材数据即可自动展示。
> 接口契约详见《DIY饰品定制-微信小程序前端对接文档.md》。

### 8.1 配置分类（categories）

确认 DIY 饰品下 7 个二级分类均存在且启用：手链 / 项链 / 戒指 / 吊坠 / 耳饰 / 手机链包挂 / 108佛珠。
若耳饰、手机链、佛珠尚未落库请补齐（前端本地演示分类 ID 为 291/292/293）。

### 8.2 录入素材库（diy_materials）

- 串珠水晶 27 颗：字段见第二节；异形珠（药片/跑环）务必录 `bore_orientation + size_length_mm + size_width_mm`，后端据此派生 `cord_occupy_mm`。
- 镶嵌宝石 3 颗：见第五节。
- 定价按星石 / 源晶体系整数定价（演示价"元"仅参考）；`five_elements` 需运营补充。

### 8.3 发布模板（diy_templates，status=published）

- 7 个模板的 `layout` / `bead_rules` / `sizing_rules` / `capacity_rules` 见第三、四节，可直接照录。
- ⚠️ 后端 `/templates` 只返回 `status='published'` 且 `is_enabled=true` 的模板——**必须发布，否则小程序列表看不到**。

### 8.4 接口

按《DIY饰品定制-微信小程序前端对接文档.md》13 个用户端端点；若均已实现并联通，本项无需额外开发。

---

## 九、请【Web 管理后台前端项目】做的事

1. **素材录入页**：支持第二节全部字段，尤其异形珠物理尺寸（diameter / size_length_mm / size_width_mm / bore_orientation）。
2. **镶嵌模板"位置标注"页**：用底图 + 可视化标注器（如 Konva）标注每个镶口的归一化坐标（x/y 中心、width/height 占比、rotation、required、allowed_* 约束），保存写回 `layout.slot_definitions`。坐标口径须与小程序一致（0~1 归一化、contain 缩放还原）；本地演示 5 个镶嵌模板实测坐标见第四节，可作标注校验参考。
3. **图片上传**：把 `packageDIY/diy-lite/assets/` 的 35 张图上传到对象存储，关联到模板底图（base_image_media）/素材图（image_media）。

---

## 十、请后端/运营确认的问题（前端等回复）

1. **7 个分类的真实落库 category_id** 是否为 191~194 + 291~293？若不同请给出实际 ID（前端按后端返回的 category_id 展示，不写死）。
2. **耳饰(291) / 手机链(292) / 108佛珠(293)** 三类是否会正式配置并发布模板？
3. **定价方案**：27 颗水晶珠 + 3 颗宝石的星石/源晶正式价格由谁定？
4. **五行（five_elements）** 是否录入？由谁提供各素材五行属性？
5. **图片**：35 张演示图直接用作正式图，还是运营替换为更高质量商品图？

---

## 十一、验收标准（落地后小程序即可自动生效）

- [ ] 7 个分类在小程序款式页 Tab 齐全
- [ ] 每个分类下至少 1 个 `published` 模板（串珠配手围档位，镶嵌配槽位+底图）
- [ ] 素材库录入完整（含异形珠物理尺寸、宝石），`/beads` 能按模板返回可用素材
- [ ] 串珠模板 `/estimate` 手围算珠返回正常
- [ ] 镶嵌模板槽位坐标与底图镶口位置吻合（小程序渲染不错位）
- [ ] 下单闭环可走通：保存草稿 → confirm 冻结 → complete 铸造物品

> 全部就绪后，小程序前端**无需改代码**，本地演示同款饰品即以真实数据形态自动上架。
> 交付物：本文档 + `packageDIY/diy-lite/assets/` 目录 35 张图片（整目录拷贝）。
