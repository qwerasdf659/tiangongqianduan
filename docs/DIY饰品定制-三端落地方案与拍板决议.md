# DIY 饰品定制 — 三端落地方案与拍板决议

> 版本：v2.3（2026-07-15，**后端代码 + 管理端代码 + 数据落地已全部执行完成**，执行结果与小程序对接权威数据见**附录 F**）｜v2.1（2026-07-15，直连真实库 + 通读代码二次复核，见**附录 D**）｜**拍板状态：全部 16 项 + 分组字典载体已定案闭环并已落地** | 来源：微信小程序前端本地演示数据（`bead-data.ts` + `assets/`）+ 后端真实库 `restaurant_points_dev` 直连核对 + 当前代码审查
> 用途：后端数据库项目 / Web 管理后台 / 微信小程序三端落地的**唯一权威方案**——含支持度审查（附录 A）、行业对照选型（附录 B）、16 项拍板决议（B.7，全部定案且已执行）、素材录入对照表（附录 C）、v2.1 真实库复核新增发现（附录 D）、**v2.3 执行结果与真实落库数据（附录 F，小程序对接以此为准）**。
> 权威原则：接口路径 / 字段名 / 响应格式以**后端数据库项目为准**，前端直接用后端字段名、不做映射层。
> 说明：正文一~十一节为小程序前端提供的演示数据样例（历史参考）；**小程序对接请直接使用附录 F 的真实落库数据（真实 material_code / 模板 ID / 接口契约）**。演示数据仅前端离线体验用（保存/下单禁用），正式以后端为权威。
> 勘误：此前版本头部曾引用"附录 F：CDN 图片存储方案（拍板 17~21）"，但正文从未包含该附录（文档与实际内容不一致），v2.3 已修正——图片链路仍为既定方案：Sealos 对象存储 + 内容哈希 URL + w375/w750/w1080 衍生图（`image_media.public_url`/`thumbnails`），无新增 CDN 拍板项。

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
>
> ⚠️ **v2.1 重要提醒（底图默认尺寸口径不一致，见附录 D.6）**：本地演示底图是 **640×960**，但小程序渲染端与 admin 标注器的缺省值都是 **800×1000**（宽高比 0.667 vs 0.8 不同）。**每个镶嵌模板建库时 `layout.background_width/height` 必须按底图真实像素显式填写，不能留空吃缺省值**，否则 contain 缩放后槽位会错位。这是三处联动隐患（标注器/渲染端/后端），附录 D.6 给出根因与建议护栏。

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
> 渲染链路与本地演示一致。只需按 A.3 C 端 1~5 项把本地写死数据改为读后端字段，即等后端真实数据展示。
> **13 个用户端端点的完整接口契约（请求参数 + 真实响应结构）见附录 F.7**（基于真实代码 `routes/v4/diy.js` + 各 Service 实测，非独立文档）。

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

13 个用户端端点均已实现并联通（完整契约见附录 F.7）；本项无需额外开发。

---

## 九、请【Web 管理后台前端项目】做的事

1. **素材录入页**：支持第二节全部字段，尤其异形珠物理尺寸（diameter / size_length_mm / size_width_mm / bore_orientation）。
2. **镶嵌模板"位置标注"页**：用底图 + 可视化标注器（如 Konva）标注每个镶口的归一化坐标（x/y 中心、width/height 占比、rotation、required、allowed_* 约束），保存写回 `layout.slot_definitions`。坐标口径须与小程序一致（0~1 归一化、contain 缩放还原）；本地演示 5 个镶嵌模板实测坐标见第四节，可作标注校验参考。
3. **图片上传**：把 `packageDIY/diy-lite/assets/` 的 35 张图上传到对象存储，关联到模板底图（base_image_media）/素材图（image_media）。
4. **图片规范把关**：正式图替换时必须满足附录 D.7 的图片规范（居中、主体占满、透明/纯净底、珠子图正方形、宝石图接近槽位比例），否则填进槽位/珠位会显得错位或变形。

---

## 九-补、图片尺寸/规范说明（本地演示图尺寸不一，为什么不影响标注）

> 结论：**图片尺寸不一不影响标注正确性**。位置只由"槽位坐标 + 珠子直径"决定，图片是被缩放"填进框"的，与图片原始像素无关。详见附录 D.7（含 shape-renderer 渲染机制实证）。
> 但**图片构图规范会影响填充观感**（看着准不准），正式图替换须遵守 D.7 规范。

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
> 交付物：本文档 + 同目录 `assets/` 35 张图片（`docs/DIY饰品定制交付包/assets/`，整目录拷贝）。

---

# 附录 A：后端与管理端支持度审查（2026-07-15，直连真实库核对）

> 本附录由后端侧审查填写，回答"后端数据库项目 + Web 管理后台是否已支持本文档需求、还差什么"。
> **核对方式**：Node.js + mysql2 直连真实库 `restaurant_points_dev`（读 `.env`，非备份文件）+ 通读当前 worktree 实际代码（`routes/v4/diy.js`、`routes/v4/console/diy/*`、`services/diy/*`、`models/DiyTemplate.js`/`DiyWork.js`/`DiyMaterial.js`、`admin/src/modules/diy/*`）。不引用任何历史报告。
> **权威原则**：接口路径 / 字段名 / 响应格式 / 数据库查询以**后端数据库项目为唯一权威**；不兼容旧前端约定，前端直接改用后端字段名、不做映射层。

## A.0 一句话结论

**功能层面后端与管理端已支持本文档全部需求，无需新增任何接口、模型或表**；主体是**运营数据尚未录入/发布**（素材仅 3 颗启用且全无图、唯一发布模板无底图、图片未上传）。即：这基本是一个**"配置与数据落地"任务**。

v2.1 复核新增两点必须提请注意（详见附录 D）：

1. **`asset_group_defs` 是资产/源晶体系的字典，与 DIY 材料是不同业务域**（v2.0 漏了这张表，但经业务澄清后定案：不耦合）：库内有 6 个 `group_type='material'` 色系分组（red/orange/yellow/green/blue/purple，带 color_hex，是**可交易源晶资产**的分组）。DIY 饰品材料是实物商品，`diy_materials.group_code` **表级无外键、是自由字符串（正确设计，DIY 不该被资产字典约束）**。因此拍板 1 定案：**DIY 采用自有分组维度**（新增 white/pink 作 DIY 专属组，display_name/color_hex 走 DIY 自有来源，不 join/不污染 asset_group_defs）。详见改版 B.1 与附录 D.1。
2. **后端有 2 处代码补全项（非 1 处）**：除已知的槽位级 `allowed_group_codes`/`allowed_shapes` 过滤缺口（拍板 15，B.9.3）外，`getMaterialGroups`（`/material-groups` 接口）**只返回 diy_materials 里 group_by 出来的裸 group_code + count，不带 display_name/color_hex，也不 join `asset_group_defs`**——小程序若要"动态渲染分组 Tab"（拍板 1 的前端适配前提），后端得让该接口下发分组的展示名与色值，否则小程序只能拿到 `blue/green` 这种机器码没有中文名。详见附录 D.2。

本文档少量字段口径需按后端为准修正（见 A.4），且真实库存在 2 处历史脏数据（0 价启用素材、无底图 published 模板，见 A.1.1），由拍板 4/5「删档重来」一并清理。

## A.1 后端数据库项目支持度（技术栈：Express + Sequelize/MySQL8 + ServiceManager 三层架构）

功能已全部具备，逐项核对：

| 本文档需求 | 后端现状 | 结论 |
|---|---|---|
| 串珠 + 镶嵌两种模式 | `DiyTemplate.layout.shape` 已支持 circle/ellipse/arc/line/slots | ✅ 已支持 |
| 槽位位置标注（slot_definitions） | `layout.slot_definitions` JSON 字段完整（slot_id/x/y/width/height/rotation/allowed_*/required） | ✅ 已支持 |
| 手围算珠 | `GET /templates/:id/estimate`（TemplateService.estimateBeadCount，后端权威换算） | ✅ 已支持 |
| 异形珠物理尺寸 | `DiyMaterial` 有 `bore_orientation`/`size_length_mm`/`size_width_mm`，`deriveCordOccupyMm` 派生 `cord_occupy_mm` | ✅ 已支持 |
| 素材大类/材质档位/五行/寓意 | `item_type`/`material_type`/`five_elements`/`meaning`/`energy`/`pairing` 字段齐全 | ✅ 已支持 |
| 星石/源晶定价、整数定价、0 价禁用护栏 | `price`/`price_asset_code` + 整数校验 + `assertPriceGuard` | ✅ 已支持 |
| 用户端接口 | `routes/v4/diy.js` 实测 **14 个 handler**（对接文档口径称 13 端点：模板列表/详情/beads/estimate/payment-assets/material-groups + 作品列表/详情/qrcode/保存/删除/confirm/complete/cancel）。差 1 是 `/material-groups` 是否计入的口径差异，端点齐全 | ✅ 已支持 |
| 管理端接口 | `routes/v4/console/diy/{templates,materials,works,stats}.js`（模板 6：含 PUT `/:id/status`；素材 5：CRUD；作品 + 统计），全局 `authenticateToken + requireRoleLevel(60)`，模板 DELETE 额外要 `requireRoleLevel(80)` | ✅ 已支持 |
| 发布护栏 | 底图/预览图必填 + 串珠尺寸档位毫米数据 + 素材物理数据完整才可 published | ✅ 已支持 |
| 下单闭环 | confirm 冻结 → complete 扣减+铸造 items+写 exchange_records 发货 | ✅ 已支持 |

**后端需要新增的功能：无。** 现有模型、服务、路由、发布护栏完全覆盖本文档全部玩法。

### A.1.1 真实库现状（数据未就绪，非功能缺失）

直连 `restaurant_points_dev` 实测（v2.1 复核，逐条以真实库为准）：

- **分类**：7 个 DIY 二级分类**全部已存在且启用**（`is_enabled=1`）——手链191(DIY_BRACELET)/项链192(DIY_NECKLACE)/戒指193(DIY_RING)/吊坠194(DIY_PENDANT)/耳饰291(DIY_EARRING)/手机链包挂292(DIY_CHARM)/108佛珠293(DIY_MALA)，父级均为 `category_id=190`（DIY饰品，`category_code=DIY_JEWELRY`），字段用 `parent_category_id`。**本文档第十节问题 1（分类 ID 191~194+291~293）已确认全部正确落库，无需再问。**
- **素材**：库内共 **21 颗**（本文档目标 30 颗）。**启用状态精确核对：18 颗 `is_enabled=0` 禁用 + 3 颗 `is_enabled=1` 启用（v2.0 写「20 禁用」有误，实为 18 禁用/3 启用）**。**21 颗全部 `image_media_id=null` 无图**。分组码为 blue(2)/green(3)/orange(2)/purple(3)/red(3)/yellow(8)，**无 white/pink 组**（真实库素材命名与本交付包演示的 27 珠完全不同，是另一套：巴西黄水晶/透体柠檬黄水晶/黄塔晶/粉水晶/茶水晶/绿幽灵水晶/紫水晶/海蓝宝/白水晶/绿宝石01 等）。
  - ⚠️ **数据脏点（真实库存在护栏违例）**：3 颗启用素材中，`diy_material_id=27「绿宝石01」price=0 且 is_enabled=1`，**违反后端 `assertPriceGuard`（0 价禁止启用）**。这是历史脏数据（早于护栏或绕过 API 直接入库），拍板 4「废弃重录」会一并清掉。另 2 颗启用素材（绿幽灵水晶35/海蓝宝30）也无图，小程序渲染仍缺图。
- **模板**：**4 个**（id=1 经典串珠手链/191/draft、id=2 锁骨项链/192/draft、id=40 吊坠01/194/draft、id=65 项链12/194/**published**）。仅 id=65 为 published，`layout.shape=slots` 镶嵌模式但**挂在吊坠194 分类**、`base_image_media_id=null` 且 `preview_media_id=null`、`material_group_codes=[]`。
  - ⚠️ **published 却无底图/预览图**：id=65 能处于 published 说明它**早于发布护栏就已发布**（护栏是后加的，只拦新的发布动作，不回溯存量）。即真实库存在一个「不满足当前护栏」的历史发布态模板 —— 拍板 5「归档/删除重建」会清掉。
- **作品**：**0**（`diy_works` 表 0 行，无外键阻塞，模板/素材可安全删）。

> 结论：功能通，但小程序现在拉不到可用数据（启用素材仅 3 颗且全无图、唯一发布模板无底图且挂错分类）。主体是**录数据**的事；但真实库存在 2 处**历史脏数据违反当前护栏**（0 价启用素材、无底图的 published 模板），拍板 4/5 的「删档重来」正好清理，不需要改后端护栏。

## A.2 Web 管理后台前端支持度（技术栈：Vite + Alpine.js + Tailwind 多页应用）

功能页面均已存在，逐项核对：

| 本文档需求（第九节） | admin 现状 | 结论 |
|---|---|---|
| 素材录入页（全字段 + 异形珠几何 + 图片上传） | `admin/diy-material-management.html` + `diy-material-management.js`：display_name/material_name/group_code/diameter/shape/item_type/material_type/five_elements(多选)/weight/meaning/energy/pairing/size_length_mm/size_width_mm/bore_orientation/price/price_asset_code/stock/image 上传 全覆盖 | ✅ 已支持 |
| 镶嵌模板"位置标注"页（Konva 可视化） | `admin/diy-slot-editor.html` + `diy-slot-editor.js`：底图加载 + 拖拽/缩放/旋转标注椭圆槽位 + 0~1 归一化坐标 + 保存写回 `layout.slot_definitions` | ✅ 已支持 |
| 图片上传对象存储 | `admin/src/alpine/mixins/image-upload.js` 复用 SealosStorage，素材/模板图上传后回填 media_id | ✅ 已支持 |
| 模板管理（CRUD + 发布 + 进入标注器） | `diy-template-management.html` 有槽位编辑器入口 | ✅ 已支持 |
| 数据完备度看板 | 缺图/缺文案/0价启用/缺物理数据 快捷筛选（missing_image/missing_copy/zero_price_enabled/missing_physical） | ✅ 已支持（超出本文档要求） |

**管理端需要新增的功能：无。** 素材录入页、位置标注页、图片上传、模板发布全部就绪，且坐标口径（0~1 归一化 + contain 缩放还原）与小程序渲染公式一致。

### A.2.1 管理端字段口径与后端一致性（技术路线符合性）

- admin 的 `diy-material-management.js` 表单直接读写后端 `GET /api/v4/console/diy/materials` 的原始 snake_case 字段（display_name/material_name/group_code/diameter/shape/item_type/material_type/five_elements/weight/meaning/energy/pairing/size_length_mm/size_width_mm/bore_orientation/price/price_asset_code/stock/is_stackable/sort_order/is_enabled + 图片上传回填 image_media_id），**直接用后端字段、无映射层**——符合本项目"前端直接用后端字段名 + `admin/scripts/check-frontend-mappings.cjs`（`npm run lint:mappings`）门禁"的既定技术路线。
- admin 分组下拉（`GROUP_LABELS` / `ALL_GROUP_OPTIONS`）实测为 **6 组**：yellow(黄水晶)/red(红/粉水晶)/orange(橙/茶水晶)/green(绿水晶)/blue(蓝水晶)/purple(紫水晶)，注释标"对齐 asset_group_defs"，**与真实库 6 个 material 色系字典完全一致，无 white/pink**（见 A.4 与附录 D 口径冲突）。若拍板 1 定案新增 white/pink，admin 这两处常量要加行（见 B.7.1）。
- admin 的槽位标注器 `diy-slot-editor.js`：新建槽位默认 `allowed_shapes:['circle','ellipse']`、`allowed_group_codes:[]`、`allowed_diameters:[]`，UI 可编辑三者并保存回 `layout.slot_definitions`；但**素材预览过滤（filteredMaterials）目前也只按 `allowed_diameters` 过滤**，与后端 `getUserMaterials` 的缺口一致（allowed_group_codes/allowed_shapes 存了但没用于过滤，见 B.9.3）。

## A.3 三方问题归属（谁的问题谁改）

**A. 后端数据库项目的问题：主体无功能缺陷，但有 2 处代码补全 + 1 处接口增强（均为小改，非新增功能）：**
- A1（拍板 15，已识别）：`MaterialService.getUserMaterials` 槽位级过滤只实现 `allowed_diameters`，缺 `allowed_group_codes` / `allowed_shapes`（B.9.3）。
- A2（v2.1 新增）：`MaterialService.getMaterialGroups`（`/material-groups`）只返回裸 `group_code + count`，不带展示名/色值。小程序动态渲染分组 Tab（拍板 1 前端适配前提）需要它 join `asset_group_defs` 下发 `display_name` + `color_hex`（附录 D.2）。
- A3（数据，非代码）：运营数据未就绪 + 2 处历史脏数据（0 价启用素材 id=27、无底图 published 模板 id=65），由拍板 4/5 删档重来清理，不改代码。

**B. Web 管理后台前端的问题：无功能缺陷。** 页面与能力齐全。待处理项：① 若拍板 1 定案加 white/pink，`GROUP_LABELS`/`ALL_GROUP_OPTIONS` 加两行；② 槽位标注器 `filteredMaterials` 预览过滤只按 allowed_diameters，若要所见即所得地预览 allowed_group_codes/allowed_shapes 约束，可同步补（与后端 A1 对称，非必须，属体验增强）。

**C. 微信小程序前端的问题（需前端适配后端，不兼容旧写法）：**
1. **分组码命名**：小程序本地演示用 `white/pink/purple/yellow`，后端权威分组是 `blue/green/orange/red/purple/yellow`（真实库 + admin 一致）。**以后端为准**：小程序删除 white/pink 硬编码，改用后端 `/material-groups` 与 `/beads` 返回的 `group_code`，Tab 动态渲染，不写死分组。
2. **material_code**：本地演示用 `white-jingti-8` 之类自造 id，后端权威格式是 `DM+日期+序列`（如 `DM26033100000191`）。**以后端为准**：小程序改用后端下发的 `material_code`，删除本地演示 id 映射。
3. **price 单位**：本地演示按"元"，后端按星石/源晶整数定价。**以后端为准**：小程序改用后端 `price`+`price_asset_code`，删"元"文案。
4. **cord_occupy_mm**：本地演示前端自算，后端已派生下发。**以后端为准**：小程序直接累加后端 `cord_occupy_mm`，删除前端按形状分支的自算逻辑。
5. **图片**：本地演示读 `packageDIY/diy-lite/assets/` 本地图，正式改用后端 `image_media.public_url`。**以后端为准**：小程序改读后端媒体 URL，本地图仅作离线演示回退。

> 以上第 1~5 项均为"小程序删除本地写死数据、改用后端字段"的适配，符合"不兼容旧内容、前端适配后端、直接用后端字段名不做映射层"的原则。13 个用户端端点的完整接口契约见附录 F.7，无需改接口调用，只需改数据来源。

## A.4 字段口径冲突（录入前必须先统一，否则三端错位）

| 冲突项 | 本地演示（小程序） | 后端权威（真实库+admin+字典） | 定案方向 |
|---|---|---|---|
| 分组码 group_code | white/pink/purple/yellow | `diy_materials.group_code` 表级无外键、自由字符串（DIY 自有维度）；资产侧另有 `asset_group_defs`（源晶字典，与 DIY 不同域，不耦合） | ✅ 定案（拍板 1）：DIY 自有分组，新增 white/pink，display_name/color_hex 走 DIY 自有来源，不 join/不污染 asset_group_defs（见 B.1/附录 D.1） |
| material_code | white-jingti-8 | DM+日期+序列（真实库如 `DM26033100000191`） | 以后端为准，小程序改用后端下发值 |
| price 单位 | 元 | 星石/源晶整数（真实库 price_asset_code 均为 star_stone） | 以后端为准（拍板 2 已定框架：运营出星石整数价，属执行录入非架构拍板） |
| 五行 five_elements | 未提供 | 字段就绪，**真实库 21 颗已填**（earth/fire/water/wood/metal 单值）——非"库内为空"（v2.0 表述有误） | 运营复核/补齐（拍板 3；删档重录时重新录） |
| 素材命名 | 27 颗色系演示珠（净体白水晶等） | 真实库 21 颗是另一套（巴西黄水晶/绿幽灵/海蓝宝等） | 两套素材不重叠，拍板 4 删档重录，按附录 C 的 30 颗为准 |

## A.5 拍板事项（2026-07-15 全部定案，完整 15 项见 B.7）

> 本节 6 项为最初识别的拍板点，均已按建议定案（下表"定案"列）；后续补充的 7~15 项见 B.7 汇总表。

| # | 决策点 | 定案（2026-07-15 采纳建议） |
|---|---|---|
| 1 | **分组码最终命名** | ✅ **DIY 自有分组、与资产字典解耦**：新增 white/pink 两组（DIY 专属，display_name/color_hex 走 DIY 自有来源，不 join/不污染 asset_group_defs）。见改版 B.1/附录 D.1 |
| 2 | **正式定价** | ✅ 运营出价，整数，按 star_stone |
| 3 | **五行属性** | ✅ 运营补录，缺失不影响下单（仅雷达图玩法） |
| 4 | **现存 21 颗禁用素材处置** | ✅ 废弃重录（未上线删档重来，符合"不兼容旧数据、降低技术债"） |
| 5 | **是否清掉 4 个旧模板** | ✅ 归档/删除旧的，按 7 模板重建 |
| 6 | **图片是否直接用演示图** | ✅ 先用演示图跑通，后续运营替换（image_media 可随时换） |

## A.6 执行步骤（数据落地，非开发；一次性投入、不留旧数据）

> 前提：功能零开发。以下全是 admin 后台操作 + 数据录入，走已有的 console/diy 接口，不写迁移、不改代码。

1. **拍板前置**：B.7 全部 16 项已定案（拍板 1 定为 DIY 自有分组、拍板 16 定为做接口增强、删档含 D.3 脏数据）。开工顺序：后端先建 DIY 自有分组字典（拍板 1）→ 再录素材（分组码取自该字典）。
2. **图片上传**（管理端）：把 `assets/` 35 张图经 admin 图片上传（SealosStorage）传入对象存储，得到各自 media_id。
3. **清理旧数据**（管理端，拍板 4/5 通过后）：归档/删除现存 4 模板与 21 颗禁用素材（走 DELETE console/diy 接口；有作品的模板不可删，当前作品数为 0，可清）。
4. **录素材**（管理端）：按本文档二/五节录 30 颗（27 珠+3 宝石），异形珠必填 bore_orientation+size_length_mm+size_width_mm，关联 image_media，star_stone 整数定价，`is_enabled=true`。分组按拍板 1 命名。
5. **录模板 + 标注**（管理端）：按三/四节建 7 模板，串珠模板配 sizing_rules 手围档位，镶嵌模板进"位置标注"页（diy-slot-editor）按第四节坐标标注槽位、关联底图。
6. **发布**（管理端）：逐个模板走 PUT `/status` 置 `published`（发布护栏会校验底图/尺寸/素材物理数据，缺则报错补齐）。
7. **小程序适配**（前端）：按 A.3 第 1~5 项删除本地写死数据、改用后端字段（分组/编码/价格/长度/图片）。
8. **验收**：按第十一节清单 + 小程序拉真实数据渲染不错位、下单闭环走通。

## A.7 可复用 / 可扩展盘点（基于后端现有技术栈，不引入新框架）

**可复用（零新增）：**
- 后端 DiyServiceFacade（getService('diy') 保键）+ TemplateService/WorkService/MaterialService/QRCodeService 四子服务，本次全部复用
- 发布护栏 `_assertPublishable`、沿绳占用派生 `deriveCordOccupyMm`、手围换算 `estimateBeadCount`——运营数据一录即生效
- admin 的 image-upload mixin、diy-slot-editor（Konva 标注器）、素材完备度看板
- 分类体系（190 DIY饰品 + 7 二级分类已就位）

**可扩展（字段已预留，无需改表）：**
- `group_code` 是自由字符串（无枚举/无外键，DIY 自有维度）：新增 white/pink 等 DIY 分组只需在 `system_dictionaries` 加 `dict_type='diy_material_group'` 的行（复用现成通用字典设施，见附录 E），与资产 `asset_group_defs` 完全解耦、互不影响
- `meta` JSON 字段（模板/素材都有）可承接未来扩展（如折扣规则）
- `item_type`（beads/accessories/pendants）支持未来加隔片/佛头/流苏配饰
- `five_elements` 雷达图玩法数据源已就绪，运营补录即启用
- FeatureFlag 机制可用于 DIY 玩法灰度

**符合性总结**：本方案完全在后端现有 Express+Sequelize+ServiceManager 三层架构、admin 现有 Vite+Alpine+Tailwind 多页架构内完成，不引入任何新技术、不新增接口/模型/表，仅录数据 + 小程序改数据来源，是长期维护成本最低的路径。

---

# 附录 B：拍板项行业对照与选型建议（2026-07-15）

> 针对 A.5 的 6 个拍板项，给出大厂（美团/腾讯/阿里）、小公司、游戏公司、活动策划公司、游戏虚拟物品/小众二手平台、奢侈品/快消品公司各自怎么做，差异在哪，以及**基于本项目现有技术栈（Express+Sequelize+MySQL8+ServiceManager 三层、admin Vite+Alpine）、未上线可一次性投入、不兼容旧数据、长期维护成本最低**的选型建议。
> 结论先行：本项目 DIY 本质是**「配置驱动的轻定制商品」**，不是重交易/重供应链系统，应走**大厂的"字典/配置化 + 素材库"轻量做法**，避免游戏公司式的重引擎和小公司式的写死。

## B.0 拍板项一览

> 拍板项 1~7 见 B.1~B.6 详解，8~12 见 B.7 汇总表与 B.8 详解。完整勾选清单以 **B.7** 为准。

| # | 拍板项 | 一句话建议 |
|---|---|---|
| 1 | 分组码命名 | 新增 white/pink 两组，group_code 保持自由字符串 |
| 2 | 正式定价 | 运营在 admin 配置，星石整数定价，不硬编码 |
| 3 | 五行属性 | 运营补录，作为可选展示维度，缺失不阻断 |
| 4 | 21 颗禁用素材 | 废弃重录（不兼容旧数据，最干净） |
| 5 | 4 个旧模板 | 归档/删除重建 |
| 6 | 图片 | 先用演示图跑通，后续替换 |
| 7 | 整体路线 | 大厂电商"配置化+素材库+字典化"轻量做法 |
| 8 | 一期模板范围 | 7 个全上 |
| 9 | 佛珠发布护栏冲突 | 补 target_length_mm（长度驱动数据基础），见 B.8 |
| 10 | 佛珠长度容差 | 沿用手串余量 15mm |
| 11/12 | 定价/五行责任人 | 运营（执行分工） |

## B.1 拍板项 1：素材分组（group_code）设计

**问题**：后端权威六组无 white/pink，白/粉水晶归哪？新增分组还是并入现有？

| 阵营 | 做法 |
|---|---|
| 阿里/京东（大厂电商） | 商品属性走「属性字典 + 属性值」（SPU attribute），颜色是一个可枚举扩展的字典维度，加值只是插一行字典，从不改表结构 |
| 美团（到店/商品） | 后台配置化标签体系，标签自由增删，前端动态渲染筛选项，绝不前端写死 |
| 小公司 | 前端 hardcode 一个颜色数组，加颜色要改前端发版——本文档小程序演示的 white/pink 写死正是此模式 |
| 游戏公司 | 道具走「稀有度/品质/元素」等强枚举（DB ENUM 或配置表），因为要参与掉率/合成等强逻辑计算 |
| 奢侈品/快消 | 商品分类走标准类目树（GPC/内部类目），颜色是 SKU 规格维度不是分类 |

**差异**：核心分歧是"分组是强枚举还是自由字典"。游戏公司因为分组参与数值逻辑必须强枚举；电商/到店因为分组只用于展示筛选，一律做成自由字典可动态扩展。

**本项目现状（v2.1 复核 + 业务澄清定案）**：`DiyMaterial.group_code` 是 `STRING(50)`、**表级无外键约束**（唯一外键是 image_media_id→media_files），技术上是自由字符串。库内确实另有一张 `asset_group_defs` 色系字典（6 个 material 组 red/orange/yellow/green/blue/purple，带 display_name/color_hex，`description` 写"红色系列源晶资产"），admin `GROUP_LABELS` 注释也写"对齐 asset_group_defs"。

> ✅ **业务澄清（2026-07-15 用户确认，关键）**：**DIY 饰品材料（实物水晶珠子）与资产系统的"源晶水晶"是两个不同的业务域**。`asset_group_defs` 是**资产/源晶体系**的色系字典（那套 red/green… 是可交易的虚拟源晶资产分组），DIY 材料是实物商品，二者只是碰巧共用了颜色命名，**语义上不该耦合**。因此：① `diy_materials.group_code` 无外键、是自由字符串，是**正确且刻意**的设计（DIY 不应被资产色系字典约束）；② admin 那句"对齐 asset_group_defs"属于历史误标的松耦合，不代表 DIY 必须复用资产字典；③ 把 white/pink 塞进 `asset_group_defs` 会**污染资产/源晶侧**（凭空多两个不产资产的色系），应避免。

**定案（拍板 1）：DIY 采用自有分组维度，与资产 `asset_group_defs` 解耦。** 新增 `white`(白水晶系)/`pink`(粉晶系) 作为 **DIY 专属分组**，共八组。这回到了 v2.0 的结论"加两组低成本"，但**理由更正**：不是因为"复用资产字典零成本"，而是因为**DIY 分组本就是独立域、有自己的命名空间**，加值只影响 DIY 自己。关键约束：
- **DIY 分组的 display_name/color_hex 必须来自 DIY 自有来源，不 join `asset_group_defs`**（否则又把两个域耦合回去，且资产字典里根本没有 white/pink）。
- **推荐复用项目现有的 `system_dictionaries` 通用字典设施**（加 `dict_type='diy_material_group'`），零新增表/服务、运营可后台维护、三端统一取名。备选 B1（配置常量）/B2（新建专表）见附录 D.1 与附录 E 的行业对照与选型理由。
- admin 的 `GROUP_LABELS`/`ALL_GROUP_OPTIONS` 改为消费同一份 DIY 分组来源（或加 white/pink 两行），去掉"对齐 asset_group_defs"的误标。

> 长期维护视角：小程序删掉本地 white/pink 硬编码，改从后端 `/material-groups` 动态拉分组渲染 Tab。**前提是后端 `/material-groups` 要先增强**（附录 D.2：下发 DIY 自有的 display_name+color_hex），否则小程序拿到的是没有中文名/色值的裸 group_code。这样以后运营再加"绿幽灵""钛晶"等 DIY 分组，三端零改代码，且完全不动资产/源晶体系。

## B.2 拍板项 2：定价体系（price / price_asset_code）

| 阵营 | 做法 |
|---|---|
| 大厂电商 | 价格是运营/商家在后台配置的数据，含定价中心、改价审计，绝不进代码 |
| 游戏公司 | 虚拟货币计价（钻石/点券），价格配置在后台数值表，支持活动折扣倍率 |
| 活动策划公司 | 积分/权益计价，按活动配置，强调可运营调整 |
| 小公司 | 前端/代码写死价格，改价发版 |
| 奢侈品 | 一口价 + 强管控，价格由总部统一下发 |

**本项目现状**：`DiyMaterial.price`(DECIMAL, 强制整数校验) + `price_asset_code`(星石/源晶，禁 points)，confirm 时**服务端权威计价**（不信任前端），已是大厂/游戏标准形态。

**建议**：运营在 admin 素材录入页按 `star_stone` 整数定价，价格是**数据不是代码**。演示价（元）仅参考，落地由运营出正式星石价。本项目已具备服务端权威定价 + 整数护栏 + 0 价禁用护栏，无需任何改动，只等运营填数。若未来要做活动折扣，用素材/模板的 `meta` JSON 承接折扣规则即可，不改表。

## B.3 拍板项 3：五行属性（five_elements）

| 阵营 | 做法 |
|---|---|
| 大厂 | 非核心的"内容标签"走可选字段，缺失不阻断主流程（渐进式补全） |
| 游戏公司 | 若参与数值（如五行相生加成）则强制必填并参与计算；纯展示则可选 |
| 活动策划/内容电商 | 玄学/内容属性作运营软标签，用于种草文案与筛选，非必填 |
| 小公司 | 要么不做，要么写死在前端 |

**本项目现状**：`five_elements` STRING(50) 可空，逗号分隔多值，注释标明是"五行雷达图玩法数据源"，admin 已有多选录入。

**建议**：作为**可选展示维度**，运营渐进补录，**缺失不阻断下单**（后端已 allowNull）。当前作"种草/详情展示 + 未来雷达图玩法"用途，不参与计价/校验逻辑。谁提供：运营按素材属性补录。这符合大厂"非核心属性渐进补全"做法，也匹配本项目玄学饰品的商业模式。

## B.4 拍板项 4 & 5：旧数据处置（21 颗禁用素材 + 4 个旧模板）

这两项本质是同一个问题：**未上线阶段，脏的存量数据是清掉重录还是修修补补复用？**

| 阵营 | 做法 |
|---|---|
| 大厂 | 上线前有专门的"数据初始化/灰度数据清理"，测试脏数据一律 wipe，不带进生产 |
| 游戏公司 | 内测数据（角色/道具）删档是标配，正式开服从干净数据起步 |
| 小公司 | 常把测试数据留到生产，日后成为脏数据源头（技术债起点） |
| 奢侈品/快消 | 商品主数据（MDM）有严格准入，不合规数据不进主库 |

**差异**：大厂/游戏公司在未上线窗口一律选"清干净重来"；小公司图省事复用脏数据，埋下长期维护成本。

**本项目现状（v2.1 真实库核对）**：21 颗素材分组命名与交付包不一致（真实库是巴西黄水晶/绿幽灵/海蓝宝等另一套）、**18 颗禁用 + 3 颗启用（v2.0 写「20 颗禁用」有误）**、全部无图，且启用的 id=27 还是 0 价违护栏脏数据；4 个模板与交付包 7 个对不上，仅 id=65 为 published 但挂错分类（吊坠194）且无底图。作品数为 0（无外键阻塞，可安全删）。

**建议（选大厂/游戏"删档重来"）**：**废弃重录**。理由完全契合你的三个前提——① 未上线：删数据零业务影响；② 愿一次性投入：重录 30 素材+7 模板成本可控；③ 不兼容旧数据/降低技术债：现存数据分组命名、字段完整度都与目标不一致，修补反而留下两套口径混用的隐患。清理走已有的 DELETE console/diy 接口即可（作品 0 无阻塞），不需要写迁移脚本。**不建议**在禁用素材上逐个改分组/补图复用——命名体系都不同，修补等于制造技术债。

## B.5 拍板项 6：图片素材

| 阵营 | 做法 |
|---|---|
| 大厂电商 | 商品图有拍摄规范 + CDN + 多规格衍生图，图与商品数据解耦（换图不动数据） |
| 游戏公司 | 美术资源版本化管理，可热更 |
| 小公司 | 图片和代码/本地耦合，换图麻烦 |
| 奢侈品 | 极高图片规范，专业拍摄 |

**本项目现状**：`image_media_id` 外键关联 `media_files`，走 SealosStorage 对象存储 + 衍生图（w375/w750/w1080），图与素材数据解耦。

**建议**：**先用 35 张演示图跑通全链路，后续运营随时替换高质量商品图**（换 image_media 不动素材数据，符合大厂"图数据解耦"）。这是成本最低的路径：不阻塞联调，上线前再由运营替换正式商品图。

## B.6 DIY 定制商品的商业模式定位（决定整体选型）

一个更高层的判断：**你的 DIY 属于哪类系统，决定了别过度设计**。

| 参照系 | 是否适合本项目 | 原因 |
|---|---|---|
| 大厂电商「配置化商品 + 素材库 + 后台字典」 | ✅ **最适合** | DIY 本质是"模板+素材配置驱动的轻定制商品"，与后端现有三层+字典化底子天然契合 |
| 游戏公司「装备合成引擎 + 强枚举数值」 | ❌ 过重 | DIY 无掉率/合成/数值平衡，上强引擎是过度设计、制造技术债 |
| 虚拟物品/二手交易平台「C2C 撮合 + 寄售」 | ❌ 不适用 | DIY 是 B2C 定制履约，非用户间交易（项目 C2C 已下线） |
| 奢侈品「MDM 主数据 + 强管控 + 一口价」 | ⚠️ 部分借鉴 | 借鉴"素材主数据准入、图片规范"，但不需要那套重管控 |
| 小公司「前端写死」 | ❌ 反面教材 | 正是要摆脱的模式（本地演示的 white/pink 硬编码） |

**最终结论**：本项目 DIY 走**大厂电商的"配置化 + 素材库 + 后台字典化"轻量做法**最合适，且后端现有技术栈（Sequelize 模型 + group_code 自由字符串 + meta JSON 扩展位 + 服务端权威计价 + 发布护栏 + 对象存储解耦）**已经就是这个形态**——不需要新建任何东西，只需：① 运营录干净数据；② 小程序从"写死"改为"读后端字典"。这就是长期维护成本最低、技术债最少的路径。

## B.7 拍板汇总（2026-07-15 全部定案）

> **v2.1 复核 + 用户澄清后定案**：拍板 1 经业务澄清（DIY 材料与资产/源晶是不同域，不耦合 `asset_group_defs`）已重新定案；新增拍板 16（`/material-groups` 增强）用户已定"做"。全 16 项均已定。

| # | 决策点 | 定案方案 | 状态 |
|---|---|---|---|
| 1 | 分组命名 | ✅ **DIY 自有分组、与资产字典解耦**：新增 white/pink 两组作为 DIY 专属分组，display_name/color_hex 走 DIY 自有来源（后端配置常量或 diy 专属小字典），**不 join/不污染 asset_group_defs**；小程序改读后端分组不写死。详见改版 B.1/附录 D.1 | ✅ 已定 |
| 2 | 定价 | 运营在 admin 按星石整数定价，价格是数据 | ✅ 已定 |
| 3 | 五行 | 可选展示维度，运营渐进补录，不阻断下单 | ✅ 已定 |
| 4 | 21 颗旧素材 | 废弃重录（未上线删档重来） | ✅ 已定 |
| 5 | 4 个旧模板 | 归档/删除，按 7 模板重建 | ✅ 已定 |
| 6 | 图片 | 先用演示图跑通，后续运营替换 | ✅ 已定 |
| 7 | 整体路线 | 大厂电商"配置化+素材库+字典化"轻量做法，不上游戏引擎/不过度设计 | ✅ 已定 |
| 8 | 一期模板范围 | 7 个全上（分类已就绪、成本可控） | ✅ 已定 |
| 9 | 佛珠发布护栏冲突 | 给佛珠档位补 `target_length_mm`（长度驱动的数据基础，零改后端代码），详见 B.8 | ✅ 已定 |
| 10 | 佛珠长度容差 | 沿用手串余量（elastic_margin_mm=15），给用户增减珠空间，不卡死 | ✅ 已定 |
| 11 | 定价责任人 | 运营出星石整数价（执行分工，非技术选型） | ✅ 已定 |
| 12 | 五行责任人 | 运营补录（执行分工，非技术选型） | ✅ 已定 |
| 13 | 镶嵌槽位素材范围 | **限定只填宝石**：镶嵌模板 material_group_codes 设为宝石分组，详见 B.9 | ✅ 已定 |
| 14 | 宝石 item_type 归类 | 归 `beads`（镶嵌主石本质也是主珠，归 beads 最简） | ✅ 已定 |
| 15 | 佛珠素材分组 | 一期共用 27 颗水晶珠跑通；**后端槽位级过滤代码先补全**，数据后补，详见 B.9 | ✅ 已定 |
| 16 | **`/material-groups` 接口增强**（v2.1 新增） | ✅ **做**：后端 `getMaterialGroups` 用 `DisplayNameService` 从 `system_dictionaries` 下发 `display_name` + `color_hex`（**DIY 自有字典，不是 asset_group_defs**），让小程序 Tab 显示中文名/色值而非裸 group_code；是拍板 1 前端"动态拉分组"的前提。详见附录 D.2 | ✅ 已定 |

### B.7.1 定案后行动项（按责任方，源自上表 16 项，全部已定案）

**后端数据库项目（2 处代码改动 + 1 处 DIY 自有分组字典，均小改）：**
- 【拍板 1】DIY 分组字典**复用现有 `system_dictionaries`**（加 `dict_type='diy_material_group'`，含 white/pink/purple/yellow/blue/red/green/orange，dict_name=中文名、dict_color=色值），**与 asset_group_defs 解耦**。零新增表/服务，运营在 admin 字典页维护（附录 E 详解为何选此方案）。
- 【拍板 15】补 `MaterialService.getUserMaterials` 的槽位级 `allowed_group_codes` + `allowed_shapes` 过滤（与现有 allowed_diameters 同款 `Op.in` 写法，详见 B.9.3）。
- 【拍板 16】增强 `MaterialService.getMaterialGroups`（`/material-groups`）：用 `DisplayNameService.batchGet` 从 `system_dictionaries` 取 `dict_name` + `dict_color` 下发（**不 join asset_group_defs**），供小程序动态渲染分组 Tab（附录 D.2）。
- 其余零改动（模型/CRUD/发布护栏/confirm 计价/complete 铸造发货链路均已就绪并核对无误）。

**微信小程序前端（前端适配后端，不做映射层）：**
- 分组 Tab 改从后端 `/material-groups` 动态拉取，删除本地 white/pink 硬编码（拍板 1）
- 改用后端下发的 `material_code` / `price`+`price_asset_code` / `cord_occupy_mm` / `image_media.public_url`，删除本地演示 id、"元"文案、前端自算长度、本地图（A.3 第 2~5 项）
- 佛珠品类展示"长度/颗数档位"选择组件，复用手串长度驱动逻辑（拍板 9/10，B.8）

**Web 管理后台前端：**
- `GROUP_LABELS` / `ALL_GROUP_OPTIONS` 增加 white/pink 两行常量（拍板 1）

**运营（数据录入，走 admin 现有页面）：**
- 清理现存 21 素材 + 4 模板（拍板 4/5，作品数 0 可安全删）
- 按附录 C 录 30 颗素材（含异形珠物理尺寸、star_stone 整数定价、五行渐进补录、关联演示图），分组用 white/pink/purple/yellow/blue/red/green/orange（拍板 1/2/3/6/14）
- 建 7 模板并发布：镶嵌模板配 `material_group_codes=["blue","red","green"]` 限定宝石（拍板 13）；佛珠档位补 `target_length_mm`（432/648/864）+ `elastic_margin_mm=15`（拍板 9/10）；一期 7 品类全上（拍板 8）

## B.8 佛珠与手串：长度驱动玩法（拍板 9/10 详解，含一处认知纠正）

**正确的交互模型**：手串和佛珠是**同一套「长度驱动」玩法**——先选长度档位 → 用户逐颗选珠 → 实时算剩余长度 → 排到接近目标即可下单。**颗数只是参考，不是硬约束**。两者区别仅在"长度"来源：

- **手串**：长度 = 手围 + 弹力余量（选手围档位，如"手围 15cm"）
- **佛珠**：长度 = 目标成品总长（选颗数档位，如"108颗·8mm≈86cm"），本质仍是给定一个目标长度

> ⚠️ 认知纠正：早前表述"佛珠按固定颗数、不显示手围组件"**不准确**。佛珠同样是长度驱动，前端要有**长度/档位选择组件**（文案叫"长度档位/颗数档位"而非"手围"），选完同样驱动"算剩余长度"流程。手串佛珠交互一致，仅档位展示文案不同。

**后端已全链路支持，零改代码**（核对 `services/diy/*`）：
1. 选长度→算参考颗数：`estimateBeadCount` 按 `target_length_mm ÷ 珠径` 算参考颗数 + 返回 `min_length_mm`/`max_length_mm` 区间；档位匹配按 `wrist_size_mm` 或 `target_length_mm` **任一命中**，佛珠配了 `target_length_mm` 即可用。
2. 选珠→算剩余：每颗珠子后端下发 `cord_occupy_mm`，前端累加即已排长度，`目标长度 − 已排长度 = 剩余`。
3. 下单校验：confirm 时 `_validateDesignConstraints` 累加 `cord_occupy_mm` 校验成品长度落在区间内（超报 `DIY_LENGTH_EXCEED_LIMIT`、不足报 `DIY_LENGTH_BELOW_MIN`）。

**为什么必须补 `target_length_mm`（拍板 9）**：它不只是"过发布护栏"，更是长度玩法的**数据基础**——没有它佛珠就没有"目标长度"，"算剩余"无从谈起。佛珠档位补上后一个字段打通四件事：① 发布护栏过关；② `/estimate` 能算；③ 选珠能算剩余；④ confirm 能校验。佛珠总长按"颗数 × 珠径"估算：

| 档位 label | bead_count | 珠径 | target_length_mm |
|---|---|---|---|
| 54x8 | 54 | 8mm | 432 |
| 108x6 | 108 | 6mm | 648 |
| 108x8 | 108 | 8mm | 864 |

**长度容差（拍板 10）**：后端可制作区间为 `[目标长度, 目标长度 + elastic_margin_mm]`。建议佛珠沿用手串余量 `elastic_margin_mm=15`，给用户增减珠的空间；否则差一颗珠就下不了单，体验太硬。

> 落地要点：佛珠模板 `sizing_rules.size_options` 每档在原有 `bead_count` 基础上补 `target_length_mm`（上表值）；小程序佛珠品类展示"长度/颗数档位"选择组件（复用手串的长度驱动逻辑，仅换文案），走同一套 `/estimate` + 累加 `cord_occupy_mm` + confirm 校验链路。

## B.9 素材范围约束与槽位过滤（拍板 13/14/15 详解，含一处后端代码缺口）

### B.9.1 拍板 13：镶嵌槽位只填宝石

**定案**：镶嵌模板（项链/戒指/吊坠/耳饰/手机链）**只允许填宝石，不允许填 27 颗水晶串珠**。

**落地方式（配置解决）**：镶嵌模板的 `material_group_codes` 设为宝石分组 `["blue","red","green"]`（对应 3 颗宝石 demo-gem-blue/pink/green）。后端 `getUserMaterials` 已按 `material_group_codes` 用 `Op.in` 过滤（第 465-468 行），配置即生效，此层零改代码。

> 若不配 material_group_codes（留空数组），后端视为"不限"，用户能把水晶珠填进宝石镶口——这是本次要堵的体验缺陷。

### B.9.2 拍板 14：宝石 item_type 归 beads

3 颗镶嵌宝石 `item_type=beads`（镶嵌主石本质也是主珠，归 beads 最简，不影响功能与 Tab 过滤）。已并入附录 C.5 录入表。

### B.9.3 拍板 15：佛珠一期共用素材 + 后端槽位级过滤代码先补全

**数据侧**：佛珠一期共用现有 27 颗水晶珠跑通，后续运营再按需给佛珠单独补素材分组（如菩提/玛瑙），数据后补。

**⚠️ 代码侧（后端真实缺口，需先补全）**：核对 `MaterialService.getUserMaterials`（第 470-476 行），**槽位级过滤当前只实现了 `allowed_diameters`，未实现 `allowed_group_codes` 和 `allowed_shapes`**：

```js
// 现状：只按 allowed_diameters 过滤
if (slot?.allowed_diameters?.length > 0) {
  where.diameter = { [Op.in]: slot.allowed_diameters }
}
// 缺口：slot.allowed_group_codes / slot.allowed_shapes 定义了但过滤逻辑没写
```

影响：即使运营在"位置标注"页给某槽位配了 `allowed_group_codes`（如该镶口只放蓝宝石），后端也不会据此过滤，槽位级素材约束形同虚设。**这是后端要补的代码**（补两段 `Op.in` 过滤，与现有 allowed_diameters 同款写法），补全后槽位级三种约束（直径/分组/形状）才齐全，为佛珠及未来精细化镶口约束打底。

**分工归属**：
- 后端数据库项目：补 `getUserMaterials` 的 `allowed_group_codes` + `allowed_shapes` 槽位级过滤（拍板 15 代码项）。
- 运营：镶嵌模板配 `material_group_codes=["blue","red","green"]`（拍板 13）；佛珠一期共用 27 珠（拍板 15 数据项）。

---

# 附录 C：素材尺寸录入对照表（admin 直接照填）

> 用途：管理端录素材时直接照本表填后端 `DiyMaterial` 的 4 个物理尺寸字段。
> **`cord_occupy_mm`（沿绳占用）不用填**——后端 `deriveCordOccupyMm` 按 `bore_orientation + 尺寸` 自动派生（圆珠=直径 / 药片=短边 / 跑环=长边）。
> 规则：圆珠（`bore_orientation=none`）只填 `diameter`，`size_length_mm`/`size_width_mm` 留空；异形珠（药片/跑环）三项都要填，否则发布护栏拒绝发布。
> ✅ **v2.1 定案提示**：下表 `group_code=white/pink` 即最终录入值——拍板 1 定为 **DIY 自有分组**，white/pink 是 DIY 专属分组（不进资产 `asset_group_defs`）。录入时 group_code 直接填 white/pink/purple/yellow/blue/red/green/orange，展示名/色值由 `system_dictionaries`（`dict_type='diy_material_group'`）提供（见附录 D.2/E）。物理尺寸字段不受影响。

## C.1 白水晶系（group_code=white，9 颗）

| material_code | diameter | bore_orientation | size_length_mm | size_width_mm |
|---|---|---|---|---|
| white-jingti-12 | 12 | none | 空 | 空 |
| white-jingti-8 | 8 | none | 空 | 空 |
| white-naibai-12 | 12 | none | 空 | 空 |
| white-naibai-8 | 8 | none | 空 | 空 |
| white-hunsha-12 | 12 | none | 空 | 空 |
| white-hunsha-8 | 8 | none | 空 | 空 |
| white-fangtang-9 | 9 | none | 空 | 空 |
| white-yaopian | 8.7 | along_width | 8.7 | 3.6 |
| white-paohuan | 14.5 | along_length | 14.5 | 4.5 |

## C.2 粉水晶系（group_code=pink，6 颗，全圆珠）

| material_code | diameter | bore_orientation | size_length_mm | size_width_mm |
|---|---|---|---|---|
| pink-xingguang-12 | 12 | none | 空 | 空 |
| pink-xingguang-8 | 8 | none | 空 | 空 |
| pink-zifen-12 | 12 | none | 空 | 空 |
| pink-zifen-8 | 8 | none | 空 | 空 |
| pink-mitao-12 | 12 | none | 空 | 空 |
| pink-mitao-8 | 8 | none | 空 | 空 |

## C.3 紫水晶系（group_code=purple，6 颗）

| material_code | diameter | bore_orientation | size_length_mm | size_width_mm |
|---|---|---|---|---|
| purple-wulagui-12 | 12 | none | 空 | 空 |
| purple-wulagui-8 | 8 | none | 空 | 空 |
| purple-baxi-12 | 12 | none | 空 | 空 |
| purple-baxi-8 | 8 | none | 空 | 空 |
| purple-paohuan | 14.5 | along_length | 14.5 | 4.2 |
| purple-xunyicao-8 | 8 | none | 空 | 空 |

## C.4 黄水晶系（group_code=yellow，6 颗，全圆珠）

| material_code | diameter | bore_orientation | size_length_mm | size_width_mm |
|---|---|---|---|---|
| yellow-baoli-10 | 10 | none | 空 | 空 |
| yellow-baoli-8 | 8 | none | 空 | 空 |
| yellow-ningmeng-12 | 12 | none | 空 | 空 |
| yellow-ningmeng-8 | 8 | none | 空 | 空 |
| yellow-huangta-12 | 12 | none | 空 | 空 |
| yellow-huangta-8 | 8 | none | 空 | 空 |

## C.5 镶嵌宝石（3 颗，全 8mm 圆珠，item_type=beads，拍板 14）

| material_code | group_code | item_type | diameter | bore_orientation | size_length_mm | size_width_mm |
|---|---|---|---|---|---|---|
| demo-gem-blue | blue | beads | 8 | none | 空 | 空 |
| demo-gem-pink | red | beads | 8 | none | 空 | 空 |
| demo-gem-green | green | beads | 8 | none | 空 | 空 |

## C.6 录入要点

- **圆珠（27 颗里的 24 颗 + 3 宝石）**：只填 `diameter`，穿绳方向选 `none（圆珠）`，两个 size 字段留空。
- **异形珠（3 颗：white-yaopian / white-paohuan / purple-paohuan）**：`diameter` 仍填（作展示直径），`bore_orientation` 选对（药片=along_width、跑环=along_length），并**必填** `size_length_mm` + `size_width_mm`，否则发布护栏报 `DIY_MATERIAL_SIZE_MISSING` 拒绝发布。
- `cord_occupy_mm` 全程不填，后端派生：圆珠=diameter、药片=size_width_mm、跑环=size_length_mm。
- 尺寸单位统一毫米（mm），异形珠尺寸支持 1 位小数（后端 DECIMAL(5,1)）。
- **镶嵌宝石（拍板 13/14）**：`item_type=beads`；镶嵌模板 `material_group_codes` 设 `["blue","red","green"]` 限定只镶这 3 颗宝石，不放水晶串珠。

---

# 附录 D：v2.1 直连真实库 + 代码复核的新增发现（2026-07-15）

> 本附录记录 v2.1 二次复核（Node.js + mysql2 直连 `restaurant_points_dev`，非备份；通读 `models/`、`services/diy/`、`routes/v4/`、`admin/src/modules/diy/`）相对 v2.0 的**新增/修正结论**。核对方式不引用任何历史报告。

## D.0 复核结论差异一览（v2.1 vs v2.0）

| 项 | v2.0 说法 | v2.1 真实库/代码实测 | 影响 |
|---|---|---|---|
| 禁用素材数 | 20 禁用 | **18 禁用 + 3 启用**（共 21） | 修正数字，不影响结论 |
| 五行数据 | 库内为空 | **21 颗均已填**（earth/fire/water/wood/metal 单值） | A.4 口径修正 |
| 分组字典 | group_code 自由字符串、加值零成本 | 存在 `asset_group_defs`（资产/源晶字典），但**DIY 材料与源晶是不同域、应解耦**（用户澄清）；DIY group_code 无外键是正确设计 | 拍板 1 定案：DIY 自有分组（D.1） |
| 后端代码缺口 | 仅 1 处（槽位过滤） | **2 处**（+ `/material-groups` 不带展示名） | 新增拍板 16（D.2） |
| 数据脏点 | 未提 | **id=27 素材 0 价却启用（违护栏）；id=65 模板无底图却 published** | 拍板 4/5 一并清（D.3） |
| 用户端端点 | 13 | 路由实测 14 个 handler（口径差异） | 仅澄清 |
| 镶嵌底图尺寸口径 | 未提 | **标注器/渲染端缺省 800×1000，演示底图 640×960，后端无校验** | 三处联动隐患，D.6 |

## D.1 【拍板 1 定案】DIY 自有分组 vs 资产字典 `asset_group_defs`（解耦）

**真实库实测**（`SELECT ... FROM asset_group_defs WHERE group_type='material'`）：

| group_code | display_name | color_hex | is_enabled | is_tradable |
|---|---|---|---|---|
| red | 红色材料 | #F44336 | 1 | 1 |
| orange | 橙色材料 | #FF9800 | 1 | 1 |
| yellow | 黄色材料 | #FFEB3B | 1 | 1 |
| green | 绿色材料 | #4CAF50 | 1 | 1 |
| blue | 蓝色材料 | #2196F3 | 1 | 1 |
| purple | 紫色材料 | #9C27B0 | 1 | 1 |

- 该表还有 system 组（currency/points/event 等）。`group_type` 是 ENUM('system','material','custom')。
- `models/AssetGroupDef.js` 确认：`group_code` 是主键，`AssetGroupDef.hasMany(MaterialAssetType)` + `hasMany(MarketListing)`——**说明这套色系分组被"源晶材料资产"和"市场交易"复用**，不是 DIY 私有。
- `DiyTemplate.material_group_codes` 注释也写"关联 asset_group_defs.group_code"。

**业务澄清后的定案（2026-07-15 用户确认）**：**DIY 饰品材料（实物水晶珠子）和资产系统的"源晶水晶"是两个不同的业务域**。上面这张 `asset_group_defs` 是**资产/源晶 + 市场交易**用的色系字典（`hasMany(MaterialAssetType)` + `hasMany(MarketListing)` 印证），DIY 材料是实物商品，二者只是碰巧共用颜色命名。所以：

- `diy_materials.group_code` **无外键、自由字符串**是**正确且刻意**的解耦设计——DIY 不该被资产色系字典约束。
- white/pink 是非光谱色（白=无彩色、粉=红系浅调），塞进资产字典会**污染源晶/市场侧**（多两个不产资产、不可交易的伪色系），必须避免。
- **定案：DIY 用自有分组维度**，新增 white/pink 作 DIY 专属分组，共八组。DIY 分组的 display_name/color_hex **来自 DIY 自有来源，不 join asset_group_defs**。

**DIY 自有分组字典的落地（v2.1 复核后新增：项目已有现成通用字典设施，见附录 E）：**

复核发现本项目**已经有一套成熟的通用字典基础设施**，不需要为 DIY 分组新造轮子：

- **E 方案（强烈推荐，复用 `system_dictionaries`）**：项目已有 `system_dictionaries` 表（`dict_type + dict_code → dict_name + dict_color`，85+ 种 dict_type 含 rarity/item_type，配 `DisplayNameService` + Redis 缓存 + admin CRUD + 版本审计）。DIY 分组只需**加一个 `dict_type='diy_material_group'`**，插 white/pink/purple/... 若干 `dict_code`，即得中文名(`dict_name`) + 色值(`dict_color`)。零新增表、零新增服务、运营可后台增删、三端统一取名口径。**这是与项目现有技术栈契合度最高、技术债最低的方案。**
- **B1（次选，配置常量）**：`constants/` 下建 `DIY_MATERIAL_GROUPS` map。改动最小但运营改分组要发版，不如 E 方案灵活。
- **B2（不推荐，新建专表）**：`diy_material_groups` 表。项目已有通用字典设施的前提下，再建专表属重复造轮子、增加维护面。

> 三者都与 `asset_group_defs`（资产/源晶字典）完全解耦。**推荐 E**：它就是项目为"中文化显示名称"专门建的通用机制，DIY 分组正是它的典型用例。详见附录 E 的行业对照与落地代码。

## D.2 【新增拍板 16】`/material-groups` 接口缺展示名/色值

**现状**（`services/diy/MaterialService.js` 第 507-521 行 `getMaterialGroups`）：只对 `diy_materials` 按 `group_code` 分组，返回 `group_code + count + sample_name`，**不 join `asset_group_defs`**，因此不下发中文 `display_name` 和 `color_hex`：

```507:521:services/diy/MaterialService.js
  static async getMaterialGroups() {
    const groups = await DiyMaterial.findAll({
      attributes: [
        'group_code',
        [fn('COUNT', col('diy_material_id')), 'count'],
        [fn('MIN', col('display_name')), 'sample_name']
      ],
      where: { is_enabled: true },
      group: ['group_code'],
      order: [['group_code', 'ASC']],
      raw: true
    })

    return groups
  }
```

**影响**：拍板 1 要求"小程序删本地 white/pink 硬编码，改从 `/material-groups` 动态拉分组渲染 Tab"。但此接口现在只给裸 `group_code`（如 `blue`），小程序 Tab 会显示英文机器码，没有"蓝水晶"中文名和主题色。要么小程序端再硬编码一份 label 映射（违背"不做映射层"原则），要么后端补上。**结论：后端补此接口最符合"以后端为权威、前端不做映射"的技术路线。**

**建议改法（后端，小改，复用 `system_dictionaries` + `DisplayNameService`，不 join asset_group_defs）**：运营先在 `system_dictionaries` 加 `dict_type='diy_material_group'` 的若干行（dict_code=white/pink/...，dict_name=中文名，dict_color=色值）；`getMaterialGroups` 查出 DIY 在用的 group_code 后，用 `DisplayNameService.batchGet` 补展示字段：

```javascript
// services/diy/MaterialService.js
const DisplayNameService = require('../DisplayNameService')

static async getMaterialGroups() {
  const groups = await DiyMaterial.findAll({
    attributes: ['group_code', [fn('COUNT', col('diy_material_id')), 'count']],
    where: { is_enabled: true },
    group: ['group_code'],
    raw: true
  })
  // 批量取中文名+色值（Redis 缓存命中，无 N+1）
  const items = groups.map(g => ({ dict_type: 'diy_material_group', dict_code: g.group_code }))
  const names = await DisplayNameService.batchGet(items)
  return groups.map(g => {
    const hit = names[`diy_material_group:${g.group_code}`] || {}
    return {
      group_code: g.group_code,
      count: Number(g.count),
      display_name: hit.dict_name || g.group_code,
      color_hex: hit.dict_color || null
    }
  })
}
```

> 小程序侧：Tab 直接消费后端下发的 `display_name` + `color_hex`，不做本地映射。分组名/色值由 `system_dictionaries` 统一管理，运营在 admin 字典页增删改即生效（Redis 缓存自动刷新），完全不碰资产/源晶的 `asset_group_defs`。admin 的 `GROUP_LABELS`/`ALL_GROUP_OPTIONS` 也改为消费同一字典源，去掉"对齐 asset_group_defs"误标。
> 注：`batchGet` 的返回结构以 `DisplayNameService` 实际实现为准（本示意为 `{ 'type:code': {dict_name, dict_color} }`），落地时对齐即可。

## D.3 真实库历史脏数据（拍板 4/5 删档时一并清）

直连实测两处违反当前护栏的存量数据（都是护栏加上线之前遗留的）：

1. **`diy_material_id=27「绿宝石01」`：`price=0.00` 且 `is_enabled=1`**。违反 `MaterialService.assertPriceGuard`（0 价禁止启用）。API 创建/更新会被拦，但此行早已在库（直接入库或早于护栏）。真机若命中会显示"0 星石"。
2. **`diy_template_id=65「项链12」`：`status=published` 但 `base_image_media_id=null` + `preview_media_id=null`，且挂在吊坠 194 分类**。违反 `TemplateService.updateTemplateStatus` 的发布护栏（底图+预览图必填）。同样是护栏上线前发布的存量。

> 这两处**不是后端代码缺陷**（护栏逻辑本身正确，只是不回溯存量），拍板 4（废弃重录素材）+ 拍板 5（归档/删除旧模板）执行后自动消失。**作品数为 0**，删除无外键阻塞。建议删档时用 admin 的 DELETE 接口逐个删，或运营确认后直接清表重录。

## D.4 可复用/可扩展复核（基于真实代码，修订 A.7）

**已核实可复用（零新增，与 A.7 一致，补充确认）：**
- `DiyServiceFacade`（`getService('diy')`）委托 5 子服务：Template/Work/Material/AdminQuery/QRCode，路由层不感知拆分。
- 手围/长度驱动全链路一套口径：`deriveCordOccupyMm`（唯一派生）+ `estimateBeadCount`（估算）+ `_validateDesignConstraints`（confirm 校验，含 4 个错误码 DIY_BEAD_COUNT_OUT_OF_RANGE/DIY_MATERIAL_SIZE_MISSING/DIY_LENGTH_BELOW_MIN/DIY_LENGTH_EXCEED_LIMIT）+ `DEFAULT_ELASTIC_MARGIN_MM=15`（单一定义）。**已核对三处同源，无口径漂移。**
- 发布护栏 `_assertPublishable`（尺寸档位毫米 + 素材物理数据）+ 图片必填护栏，均已就绪。
- confirm 服务端权威计价（`price_snapshot` 快照，不信任前端 total_cost）→ complete 铸造 items + 写 `exchange_records` 发货，闭环已核对。
- `_validateDesignMaterials` 两层校验（material_code 存在且启用 + group_code 在 material_group_codes 内）——**这是 confirm 时的兜底**，弥补了 D.2/B.9.3 槽位级过滤缺口的**下单安全性**（即使 beads 接口没按槽位过滤，confirm 仍会拦非法分组），但**不能替代**槽位级 `allowed_group_codes`（那是"按槽位精细约束"，本层只按模板级 group 校验）。

**可扩展（字段已预留）：** `meta` JSON（模板/素材）、`item_type`（beads/accessories/pendants）、`five_elements`、模板 `material_group_codes`。

**技术栈符合性（复核确认）：**
- 后端：Express + Sequelize(underscored) + MySQL8，三层（routes→ServiceFacade→子 Service）。本方案全部落在此栈内，仅 2 处 Service 方法小改 + 数据录入，**不新增接口/模型/表/迁移**（方案 A 下）。
- admin：Vite 6 + Alpine.js 3 + Tailwind 3 + Konva 10（`admin/package.json` 实测）。素材录入页、槽位标注器（Konva）、图片上传 mixin、完备度看板均就绪，符合其现有多页架构。
- 门禁：`admin/scripts/check-frontend-mappings.cjs`（`npm run lint:mappings`）+ 后端 `check:fields`/`check:api-contract`，保障"前端直接用后端字段名、不做映射层"落地。

## D.5 v2.1 拍板项 — 全部定案闭环（2026-07-15）

1. **【拍板 1】分组码方案** → ✅ 已定：**DIY 用自有分组维度，与资产 `asset_group_defs` 解耦**（业务澄清：DIY 材料 ≠ 源晶资产）。落地载体**复用现有 `system_dictionaries`**（`dict_type='diy_material_group'`）——见附录 E 行业对照，此为长期维护成本最低方案。
2. **【拍板 16】`/material-groups` 增强** → ✅ 已定：**做**。后端用 `DisplayNameService` 从 system_dictionaries 下发 dict_name+dict_color，小程序 Tab 直接消费、不做本地映射（见 D.2）。
3. **【拍板 4/5 删档范围】** → ✅ 已定：**连同 D.3 两处脏数据（id=27 素材、id=65 模板）一并删**。作品数 0，无外键阻塞，可安全清。
4. 其余 12 项（2/3/6/7/8/9/10/11/12/13/14/15）+ 拍板 5 v2.0 定案不变。

> **✅ 已定（2026-07-15 用户认可）**：DIY 分组字典的落地载体采用 **E 方案（复用 `system_dictionaries`，`dict_type='diy_material_group'`）**——零新增表/服务、运营可后台维护、三端统一取名。B1/B2 不采纳。
> 至此拍板全部收敛闭环，可进入执行（后端 3~4 处小改 → 运营录数据 → 小程序适配 → 验收，见 A.6）。

## D.6 镶嵌模板底图尺寸口径隐患（三端坐标标注/渲染，v2.1 新增）

> 三方坐标口径（小程序渲染 ↔ 后端对接文档 ↔ 本地演示）已逐处比对**一致**：坐标语义（归一化中心点 + 宽高占比 + rotation 度）、contain 等比缩放居中、还原公式三处等价。**唯一隐患是"底图默认尺寸"不统一**。

**口径一致的三项（无需处理）：**
- 坐标语义：`x/y`=归一化中心点(0~1，相对底图原始尺寸)、`width/height`=宽/高占比、`rotation`=度。
- 缩放：底图按 contain 等比缩放居中得 drawRect。
- 还原公式：`center = offset + slot.xy × drawWH`；`半径 = slot.width × drawW / 2`（小程序 sw 全宽、画椭圆取 sw/2，与文档 rx 等价）。

**唯一隐患——默认底图尺寸不一致（真实代码实测）：**
- 本地演示 `bead-data.ts`：底图 **640×960**（宽高比 0.667）。
- 小程序渲染端 `shape-renderer.ts`：缺省 `background_width||800, background_height||1000`（0.8）。
- admin 标注器 `diy-slot-editor.js` 第 66-67 行：同样缺省 **800×1000**，且 `img.onload`（第 171 行）**未回填底图真实像素尺寸**——标注阶段就用 800×1000 做 contain。

**为什么是"三处联动"而非单纯提醒后端：**
1. **标注端隐患**：若模板 `layout.background_width/height` 为空，标注器按 800×1000 显示底图并计算归一化坐标——底图真实是 640×960 时，**标注得到的归一化坐标本身就已偏差**。
2. **渲染端隐患**：小程序同样吃 800×1000 缺省，与 640×960 底图 contain 后位置再偏一次。
3. **后端隐患**：`TemplateService` 建/发布模板时**未校验 `layout.background_width/height`**（grep 实测无任何 background 校验），空值可长驱直入。

**建议修法（按性价比排序）：**
- **后端加发布护栏（推荐，一劳永逸）**：slots 模板发布时校验 `layout.background_width/height` 为正整数，缺失则拒绝发布（错误码如 `DIY_SLOT_BG_SIZE_MISSING`），与现有"底图/预览图必填"护栏同哲学。
- **admin 标注器回填真实像素（推荐，堵住源头）**：`img.onload` 里用 `img.naturalWidth/naturalHeight` 覆盖 `state.bgNaturalWidth/Height` 并写入保存的 layout，保证标注即所见、坐标基于真实比例。
- **运营录入强制填**：每个镶嵌模板 `background_width/height` 按底图真实像素填（本地演示 5 张底图均 640×960），不留空。

> 三者叠加最稳：源头（标注器回填）+ 护栏（后端拒空）+ 规范（运营填值）。**归属**：后端补护栏（1 处小改）+ admin 标注器补回填（1 处小改）+ 运营录入规范，均小改、无新增表/接口。

## D.7 图片尺寸不一为什么不影响标注 + 图片规范要求（v2.1 新增）

> 疑问："本地演示每张产品图/宝石图尺寸都不同，如何保证标注正确？" —— **图片尺寸不影响位置正确性**。位置只看"槽位坐标/珠子直径"，图片是被缩放填进框的。

**渲染机制实证（`shape-renderer` L626-640）：图片按"目标框"绘制，不按原尺寸：**

```text
镶嵌宝石（L626-633）：
  ctx.drawImage(宝石图, cx-halfW, cy-halfH, slotW, slotH)
    └─ 目标框 slotW×slotH 由【槽位归一化坐标】算出，非图片原尺寸
    → 宝石图 200×200 或 512×480，都被拉/裁到同一椭圆框
串珠珠子（L634-639）：
  ctx.drawImage(珠子图, cx-radius, cy-radius, radius*2, radius*2)
    └─ 目标框是【diameter 换算的圆】，非图片原尺寸
    → 珠子图多大都被画进"直径对应的圆"
```

同一逻辑在 admin 标注器 `renderPreviewToSlot`（`diy-slot-editor.js` L500+）也一致：宝石图被 `sw = slot.width × drawW × 2 × 1.15` 强制缩放填槽（放大 15% 盖住椭圆）。**即标注器与小程序都"丢弃图片原尺寸、按框缩放"，所以图片大小天然不影响位置。**

**结论：位置对不对，只取决于槽位 `x/y/width/height` 与珠子 `diameter` 标得准不准（已与后端口径统一，三方核对一致）。图片尺寸不一 → 不影响位置。**

**但"图片本身规范"影响填充观感（看着准不准、变不变形），正式图替换必须遵守：**

| 图类型 | 规范要求 | 不遵守的后果 |
|---|---|---|
| 底图（产品/空托图） | 每张可不同尺寸，但 `background_width/height` 须如实填真实像素（见 D.6） | 缺省吃 800×1000 → 槽位错位 |
| 宝石图 | 主体居中 + 占满 + 透明/纯净底 + **宽高比接近槽位** | 主体偏角/留白多 → 填进椭圆显得偏移；比例差太多 → 拉伸变形 |
| 珠子图 | 主体居中 + 透明底 PNG + **正方形（1:1）** | 非正方形填进正圆 → 压扁变形 |

> 本地演示图已符合规范（珠子图=透明通道 PNG 实物居中；宝石图=白底顶视圆形切工、圆形裁剪去白角）。**后端/运营替换正式图时必须保持此规范**，否则位置虽对但"看着没对准/变形"。此为图片构图问题，非标注问题。

### D.7.1 落地手段：复用现有 `sharp` 统一图片（不引入新工具）

> 疑问："要不要用什么工具让传给小程序的图片统一起来？" —— **不用引入新工具，后端已装 `sharp@0.34.5` 且 `MediaService` 已在用它做图片规整。** 完全符合"基于现有技术栈、不引入新框架、降技术债"的原则。

**复核实证（`services/MediaService.js`）：** 上传链路已具备 sharp 能力——超限自动压缩、生成三档衍生图（w375/w750/w1080 WebP）、**裁剪透明边距**（`trimTransparent` 参数，L230-233，本就是给 DIY 素材图用的）、`sharp.metadata()` 已取到图片真实 width/height（L285）。

**两类图各加一步（零新依赖）：**

- **宝石图/珠子图 → 上传时垫成统一正方形（透明底、主体居中）：** 现有 `trimTransparent` 只裁透明边，再补一步 `fit:'contain'` 垫正方形即可：

```javascript
// MediaService 上传处理：裁透明边后垫成正方形（TARGET 如 512）
processedBuffer = await sharp(processedBuffer)
  .resize({
    width: TARGET, height: TARGET,
    fit: 'contain',                              // 主体完整不裁切
    background: { r: 0, g: 0, b: 0, alpha: 0 }   // 透明底填充
  })
  .png()
  .toBuffer()
```

  效果：运营传 200×200 或 512×480 都无所谓，输出统一为正方形、居中、透明底 PNG，填进圆/椭圆槽位不变形不偏心。

- **底图（产品/空托图）→ 不统一尺寸，但自动回填真实尺寸：** 底图比例本就因款式而异，不强行统一；用上传时 `sharp.metadata()` 已取到的 width/height 回填模板 `layout.background_width/height`，即解决 D.6 的错位隐患（连运营手填都省了）。

**方案对比（为什么选 sharp）：**

| 方案 | 引入新东西 | 契合本项目栈 | 结论 |
|---|---|---|---|
| **复用现有 sharp + MediaService** | 否 | ✅ 已在用 | **推荐**：加一段 padToSquare，零新依赖 |
| 小程序端处理 | 是（端算力/包体） | ❌ 违背"后端权威" | 不选：应服务端规整好再下发 |
| 独立图片服务/云图片处理 | 是（新服务+成本） | ⚠️ 用 Sealos 对象存储 | 过度：sharp 已够 |
| 运营 PS 手工统一 | 否（靠人肉） | ❌ 易错不可持续 | 不选：应由程序保证 |

> 归属：后端（`MediaService` 补 padToSquare 一步 + 底图尺寸回填，均小改、复用 sharp、无新依赖）+ 运营（仍需保证图片主体居中、构图干净，程序只能规整尺寸/透明底，管不了构图取景）。渲染逻辑本身无需改（已正确按框缩放）。

---

# 附录 E：分组/字典设计的行业对照与本项目选型（2026-07-15）

> 回应"需要我拍板的分组字典，大厂/小公司/游戏/活动策划/虚拟物品二手/奢侈品快消各怎么做，哪种最适合本项目"。
> **前置事实（v2.1 复核）**：本项目**已经具备一套成熟的通用字典基础设施**（不是从零选型）——见 E.1，这决定了结论。

## E.0 到底还有哪些要你拍板？

**分组字典这块无需架构级拍板**——项目已有现成的 `system_dictionaries` 通用字典机制，DIY 分组直接复用即可。落地载体已定案：

| 决策点 | 选项 | 定案 |
|---|---|---|
| DIY 分组字典的落地载体 | E（复用 system_dictionaries）/ B1（配置常量）/ B2（新建专表） | ✅ **E（已定，2026-07-15 用户认可）**：复用现成设施，零新增表/服务，运营可后台维护、三端统一取名 |

> 至此文档全部拍板闭环。其余（拍板 1 解耦、拍板 16 做增强、删档范围）已在前几轮确认。E.1~E.4 是把"为什么选 E"讲透，供追溯。

## E.1 本项目已有的三套字典设施（复核实证）

复核代码 + 真实库确认，本项目**不是"没有字典"的小公司模式**，而是已经建了三层字典设施：

| 设施 | 形态 | 现状 | 适配 DIY 分组？ |
|---|---|---|---|
| `system_dictionaries` + `DisplayNameService` | 通用 `dict_type+dict_code→dict_name+dict_color`，Redis 缓存、版本审计、admin CRUD（`routes/v4/system/dictionaries.js`） | 真实库 **85+ 种 dict_type**（含 rarity/item_type/material_asset 等），已是全站中文化显示名的核心 | ✅ **最适合**：加个 `dict_type='diy_material_group'` 即可 |
| `DictionaryService` + `/console/dictionaries` | 管 categories/rarity_defs/asset_group_defs 三张业务字典表，`:code` 标识、snake_case 校验、软删 | 已上线，asset_group_defs 就归它管 | ⚠️ 可用但偏重（要建表+接模型），DIY 分组用不上这么重 |
| `constants/` 配置常量（如 `AssetCode`） | 冻结的 JS 枚举，代码级 | 用于 asset_code 等不可变强枚举 | ⚠️ 改分组要发版，适合永不变的枚举 |

> 结论：本项目的字典成熟度已接近大厂水平。DIY 分组**不需要新建任何东西**，复用第一套（system_dictionaries）即可。

## E.1.1 关键澄清：复用 system_dictionaries 为什么不会与资产/源晶混乱

> 常见疑问："复用会不会让 DIY 和资产/源晶混在一起？" —— **不会**。前提是分清"复用的是哪个东西"。

**先分清两个完全不同的表（这是关键）：**

| | `asset_group_defs`（资产分组表） | `system_dictionaries`（通用取名字典） |
|---|---|---|
| 是什么 | 源晶资产**业务实体**的分组（red 组=红色系源晶资产，可交易） | 全站**"代码→中文名+色值"翻译表** |
| 承载业务语义吗 | **是**：定义"有哪些可交易的源晶色系" | **否**：只管"某个码显示成什么中文/色" |
| DIY 该碰吗 | **不该**（塞 white/pink 会污染源晶 → 这才是混乱） | **该复用**（它就是干这个的） |

**本方案明确：DIY 与 `asset_group_defs` 解耦（不碰），复用的是 `system_dictionaries`。二者是不同的表。**

**为什么复用 system_dictionaries 不会乱 —— 靠 `dict_type` 命名空间隔离（真实库实证）：**

- 唯一约束是 **`uk_type_code = (dict_type, dict_code)` 联合唯一**（非 dict_code 单列唯一）→ 每个 `dict_type` 是独立命名空间，互不干扰。
- 库里已有多个 dict_type 和平共存、从不冲突：

```text
dict_type='rarity'          → common / rare / epic / legendary   (稀有度)
dict_type='item_type'       → prize / product / service          (物品类型)
dict_type='material_asset'  → red_crystal / red_shard            (源晶资产名)
dict_type='diy_material_group' → white / pink / purple / ...      (DIY 分组，本次新增)
```

- 查 DIY 分组名永远是 `getDisplayName('diy_material_group', 'white')`，**绝不可能串到 `material_asset` 或 `asset_group_defs`**。

**三层隔离保证不乱：**

1. **数据隔离**：`(dict_type, dict_code)` 联合唯一，`diy_material_group` 自成命名空间。
2. **业务隔离**：DIY 材料的 `group_code` 是自由字符串（无外键、不引用 asset_group_defs）；源晶资产走自己的 `asset_group_defs`。两条链完全独立。
3. **取值隔离**：`/material-groups` 只查 `dict_type='diy_material_group'`，拿不到也不会去查源晶的任何东西。

> 类比：`system_dictionaries` 像小区共用的快递柜，各业务有独立格口（dict_type），你新增一个"DIY 分组"格口不会动到别人的件；而 `asset_group_defs` 是源晶自己家的账户表，往里塞 white/pink 才叫混乱。**复用的是基础设施，隔离的是业务数据，两者不矛盾。**

## E.2 各阵营怎么设计"商品分组/属性字典"

| 阵营 | 典型做法 | 分组是什么 | 加一个分组的成本 | 适合本项目？ |
|---|---|---|---|---|
| **大厂电商（阿里/京东/美团）** | 属性字典 + 属性值（SPU attribute），后台配置化、可枚举扩展，前端动态渲染 | 一个可扩展的字典维度 | 插一行字典，从不改表/发版 | ✅ **正是本项目 system_dictionaries 的形态** |
| **小公司** | 前端 hardcode 颜色数组 | 写死的常量 | 改前端发版 | ❌ 要摆脱的模式（小程序本地 white/pink 硬编码正是这个） |
| **游戏公司（米哈游等）** | 稀有度/品质/元素走强枚举（DB ENUM 或配置表），参与掉率/合成数值 | 参与计算的强枚举 | 改枚举 + 数值表，较重 | ⚠️ 仅当分组参与数值逻辑才需要；DIY 分组纯展示，不必上强枚举 |
| **活动策划公司** | 标签/权益走运营软标签，按活动配置 | 可运营增删的软标签 | 后台配 | ✅ 与字典化理念一致（本项目 system_dictionaries 即可承载） |
| **游戏虚拟物品/小众二手平台** | 品类 + 成色 + 稀有度多维标签，撮合/寄售用；强调 code 不可变、可审计 | 交易撮合用的多维标签 | 加字典行 + 保证 code 稳定 | ⚠️ 本项目 DIY 是 B2C 定制履约、非 C2C 撮合（C2C 已下线），不需要撮合那套；但"code 不可变+可审计"本项目 system_dictionaries 已具备 |
| **奢侈品/快消（MDM）** | 标准类目树（GPC/内部类目）+ 主数据严格准入，颜色是 SKU 规格维度 | 类目树 + SKU 规格 | 走 MDM 流程，重管控 | ⚠️ 借鉴"主数据准入/图片规范"，但 DIY 分组维度单一，不需要 MDM 那套重流程 |

## E.3 差异的本质

各阵营的核心分歧就两条：

1. **分组是"强枚举"还是"自由字典"？** —— 只有当分组**参与数值计算**（游戏掉率/合成）时才需要强枚举；DIY 分组只用于**展示与筛选**，一律做成自由字典。本项目 `diy_materials.group_code` 无外键、自由字符串，正是自由字典底子。
2. **字典存"代码里"还是"数据里"？** —— 小公司存代码（写死、发版），大厂存数据（后台配、不发版）。本项目 `system_dictionaries` 就是"存数据"派，且带 Redis 缓存和审计，是大厂做法。

## E.4 本项目最适合的方案（结论）

**DIY 属于"配置驱动的轻定制商品"**（附录 B.6 已定），分组维度单一、纯展示、不参与数值。对照上表：

- **走大厂电商的"字典化"路线**（分组=数据、可后台增删、前端动态渲染），且**本项目已有 `system_dictionaries` 这一现成的字典化设施**——所以最适合的方案不是"选型新建"，而是**复用已有字典设施**（E 方案）。
- **不上游戏公司的强枚举**（DIY 分组不参与掉率/合成，上强枚举是过度设计、制造技术债）。
- **不学小公司写死**（正是要摆脱的 white/pink 硬编码）。
- **不上奢侈品 MDM / 二手撮合那套重系统**（DIY 是 B2C 轻定制，维度单一）。

**落地即拍板 1 的 E 方案 + 拍板 16**：`system_dictionaries` 加 `dict_type='diy_material_group'`（含 white/pink/purple/yellow/blue/red/green/orange）→ `/material-groups` 用 `DisplayNameService` 下发中文名+色值 → 小程序动态渲染 Tab 不写死 → 与 asset_group_defs（资产/源晶）彻底解耦。

**为什么这是长期维护成本最低、技术债最少的**：① 零新增表/模型/服务，全部复用现成设施；② 分组是数据，运营后台增删不发版；③ 三端统一取名口径（全站中文化显示名系统），不会出现 admin/小程序各写一份 label 的漂移；④ DIY 与资产/源晶解耦，互不污染。完全落在你现有 Express+Sequelize+ServiceManager+system_dictionaries 技术栈内，不引入任何新框架。

---

# 附录 F：v2.3 执行结果与小程序对接权威数据（2026-07-15 已落地）

> 本附录记录本文档全部拍板项的**实际执行结果**（后端代码 + 管理端代码 + 数据落地），
> 全部数据直连真实库 `restaurant_points_dev` 与真实运行服务核验（非预设值）。
> **微信小程序前端对接以本附录为准**：真实 material_code、真实模板 ID、接口契约、字段口径全部在此。
> 质量验证：DIY 测试套件 `tests/services/DIYService.test.js` **49/49 通过**（Jest+SuperTest 真实库），
> ESLint 0 error、Prettier 通过、`/health` healthy（database/redis connected）、PM2 4 实例 online。

## F.1 后端代码改动（已完成并验证）

| 拍板项 | 改动 | 文件 |
|---|---|---|
| 拍板 1/16 | 新增 DIY 材料分组字典迁移：`system_dictionaries` 插入 `dict_type='diy_material_group'` 八组（white/pink/purple/yellow/blue/red/green/orange，含中文名+色值，幂等可回滚） | `migrations/20260715210000-migrate-data-add-diy-material-group-dictionary.js`（已执行） |
| 拍板 16 | `getMaterialGroups` 经 `DisplayNameService.batchGet` 从字典下发 `display_name` + `color_hex`（Redis 缓存，不 join asset_group_defs；字典缺行时 display_name 降级为裸 group_code） | `services/diy/MaterialService.js` |
| 拍板 15 | `getUserMaterials` 槽位级过滤补全：`allowed_group_codes` + `allowed_shapes`（与 allowed_diameters 同款 `Op.in`），槽位三种约束齐全 | `services/diy/MaterialService.js` |
| D.6 | 发布护栏新增：slots 模板 `layout.background_width/height` 必须为正数，否则拒绝发布，错误码 **`DIY_SLOT_BG_SIZE_MISSING`**（400） | `services/diy/TemplateService.js` `_assertPublishable` |
| D.7.1 | 底图尺寸自动回填：创建/更新 slots 模板时若缺 `background_width/height`，自动从底图 `media_files.width/height` 回填（源头堵住 800×1000 缺省错位） | `services/diy/TemplateService.js` `_backfillBackgroundSize` |
| D.7.1 | 素材图垫正方形：`MediaService.upload` 新增 `pad_to_square` 选项（sharp `fit:'contain'` 透明底垫成 512×512 PNG），上传接口透传 `pad_to_square` 参数 | `services/MediaService.js`、`routes/v4/console/operations/media.js` |

## F.2 Web 管理后台改动（已完成并重新构建 dist）

- `admin/src/modules/diy/pages/diy-material-management.js`：`GROUP_LABELS`/`ALL_GROUP_OPTIONS` 补 white/pink 至八组，注释改为"DIY 自有分组（system_dictionaries dict_type=diy_material_group）"，去掉"对齐 asset_group_defs"误标；素材图上传改为 `{ trim_transparent: true, pad_to_square: true }`。
- `admin/src/modules/diy/pages/diy-slot-editor.js`：① `img.onload` 用 `naturalWidth/Height` 回填底图真实像素并按真实比例重建画布（D.6 标注端源头修复）；② 保存时 `background_width/height` 随 layout 写库；③ `filteredMaterials` 预览过滤从仅直径扩展为三种约束（直径/分组/形状，`_slotAllowed` 标记，与后端 beads 同口径）；④ `GROUP_LABELS` 补至八组。
- `admin/diy-slot-editor.html`：`_diameterAllowed` → `_slotAllowed` 同步改名；素材卡价格从"¥"改为"星石"（定价单位是资产非人民币）。
- `admin/src/alpine/mixins/image-upload.js`：`uploadImage` 透传 `pad_to_square`。
- 已执行 `npm run build` 重新构建，`npm run lint` + `npm run lint:mappings` + Prettier 全部通过。

## F.3 数据落地结果（真实库，拍板 4/5/6/8/9/10/13/14 全部执行）

- **旧数据已清**：4 个旧模板（含无底图 published 的 id=65）+ 21 颗旧素材（含 0 价启用的 id=27）全部删除，作品数 0 无阻塞。
- **35 张演示图已上传 Sealos 对象存储**：素材图（27 珠 PNG + 3 宝石 JPG）走裁透明边+垫正方形（512×512）；底图/缩略图原样上传；同内容图片按 content_hash 去重（同名不同尺寸的珠子图共用一份）。
- **30 颗素材已录入并启用**（走 MaterialService，全部护栏生效）：文案（寓意/能量/搭配）按第 2.5 节；异形珠物理尺寸按附录 C；`price_asset_code='star_stone'`；`meta.demo_code` 保存前端演示 id 对照。
- **7 个模板已创建并全部 published**（发布护栏全量校验通过）。

### F.3.1 模板清单（小程序对接用真实 ID）

| diy_template_id | template_code | display_name | category_id | layout.shape | background_w×h | material_group_codes |
|---|---|---|---|---|---|---|
| 116 | DT26071500011653 | 手串 | 191 手链 | circle | -（串珠无底图概念） | white,pink,purple,yellow |
| 117 | DT2607150001178B | 108佛珠 | 293 108佛珠 | circle | - | white,pink,purple,yellow |
| 118 | DT2607150001181B | 托帕石项链 | 192 项链 | slots | 640×960 | blue,red,green |
| 119 | DT26071500011946 | 主石戒指 | 193 戒指 | slots | 640×960 | blue,red,green |
| 120 | DT260715000120CB | 水滴吊坠 | 194 吊坠 | slots | 640×960 | blue,red,green |
| 121 | DT26071500012160 | 一对耳钉 | 291 耳饰 | slots | **512×768** | blue,red,green |
| 122 | DT2607150001229B | 手机链包挂 | 292 手机链包挂 | slots | **512×768** | blue,red,green |

> ⚠️ 口径修正（正文 6.1 曾写"底图统一 640×960"）：实测 `demo-earrings-base.jpg` 与 `demo-charm-base.jpg` 真实像素是 **512×768**（与 640×960 同为 2:3 宽高比）。落库值以真实像素回填（D.7.1 自动回填），**槽位坐标是归一化 0~1 值、宽高比相同，渲染不受影响**——这正是"必须按真实像素落库"护栏的意义。

- 手串档位（3.1 全 9 档含双圈/三圈）+ 佛珠档位（3.2 三档，已按拍板 9 补 `target_length_mm`：54x8→432 / 108x6→648 / 108x8→864）+ `elastic_margin_mm=15`（拍板 10）已配置，`/estimate` 实测通过（手围 150→档位 15 命中 target 165；佛珠 864→档位 108x8 命中）。
- 镶嵌槽位坐标按第四节照录（归一化中心点 + rotation=0 + required=true + 约束数组空=不限）。

### F.3.2 素材编码对照表（demo_code → 真实 material_code，小程序删除本地 id 后以此对照）

| demo_code | material_code | | demo_code | material_code |
|---|---|---|---|---|
| white-jingti-12 | DM26071500011736 | | purple-wulagui-12 | DM26071500013224 |
| white-jingti-8 | DM2607150001189D | | purple-wulagui-8 | DM260715000133B2 |
| white-naibai-12 | DM260715000119F4 | | purple-baxi-12 | DM260715000134AE |
| white-naibai-8 | DM2607150001203A | | purple-baxi-8 | DM26071500013562 |
| white-hunsha-12 | DM260715000121C2 | | purple-paohuan | DM26071500013667 |
| white-hunsha-8 | DM2607150001224B | | purple-xunyicao-8 | DM260715000137E8 |
| white-fangtang-9 | DM260715000123FD | | yellow-baoli-10 | DM260715000138F0 |
| white-yaopian | DM2607150001248A | | yellow-baoli-8 | DM260715000139A6 |
| white-paohuan | DM260715000125A9 | | yellow-ningmeng-12 | DM26071500014019 |
| pink-xingguang-12 | DM260715000126C3 | | yellow-ningmeng-8 | DM2607150001414A |
| pink-xingguang-8 | DM260715000127A9 | | yellow-huangta-12 | DM26071500014255 |
| pink-zifen-12 | DM260715000128E0 | | yellow-huangta-8 | DM26071500014395 |
| pink-zifen-8 | DM26071500012917 | | demo-gem-blue | DM2607150001448E |
| pink-mitao-12 | DM2607150001303C | | demo-gem-pink | DM260715000145F1 |
| pink-mitao-8 | DM26071500013181 | | demo-gem-green | DM260715000146D9 |

> 小程序不应写死此表：正常链路是 `/templates/:id/beads` 下发 `material_code`，本表仅用于与本地演示素材做视觉对照验收。

## F.4 小程序对接契约（真实运行服务实测返回）

**GET `/api/v4/diy/material-groups`（拍板 16 增强后，公开接口）**，实测返回：

```json
{
  "success": true,
  "data": [
    { "group_code": "blue",   "count": 1, "display_name": "蓝水晶系", "color_hex": "#2196F3" },
    { "group_code": "green",  "count": 1, "display_name": "绿水晶系", "color_hex": "#4CAF50" },
    { "group_code": "pink",   "count": 6, "display_name": "粉晶系",   "color_hex": "#F8BBD0" },
    { "group_code": "purple", "count": 6, "display_name": "紫水晶系", "color_hex": "#9C27B0" },
    { "group_code": "red",    "count": 1, "display_name": "红水晶系", "color_hex": "#F44336" },
    { "group_code": "white",  "count": 9, "display_name": "白水晶系", "color_hex": "#F5F5F5" },
    { "group_code": "yellow", "count": 6, "display_name": "黄水晶系", "color_hex": "#FFEB3B" }
  ]
}
```

- 字段变更说明：相比旧版**移除了 `sample_name`**（被 `display_name` 取代），**新增 `display_name` + `color_hex`**。小程序分组 Tab 直接消费，不做本地 label 映射（分组名/色值由运营在 admin 字典页维护 `dict_type='diy_material_group'` 即时生效）。
- **GET `/templates/:id/beads?slot_id=xxx`**：槽位级三种约束（allowed_diameters / allowed_group_codes / allowed_shapes）已全部生效（拍板 15），选中槽位拉素材时传 `slot_id` 即得到该镶口的合法素材集。
- 其余 13 个用户端端点（`routes/v4/diy.js`）契约不变；小程序适配项仍按 A.3 C 端 1~5 执行（删 white/pink 硬编码改读 `/material-groups`、改用后端 material_code / price+price_asset_code / cord_occupy_mm / image_media.public_url）。

## F.5 需要人工提供真实数据的地方（占位数据标注）

| # | 项 | 当前占位值 | 谁来填 | 填法 |
|---|---|---|---|---|
| 1 | **正式星石定价** | 演示价（元）**向上取整**作星石整数占位价（如 3.5 元→4 星石），已在每颗素材 `meta.price_note` 标注 | 运营（拍板 2/11） | admin 素材录入页逐颗改 `price` |
| 2 | **五行 five_elements** | 全部为空（未录） | 运营（拍板 3/12） | admin 素材录入页多选补录，缺失不阻断下单 |
| 3 | **正式商品图** | 35 张演示图（拍板 6：先跑通后替换） | 运营 | admin 上传新图换 `image_media_id`，须守 D.7 构图规范（上传链路已自动裁边+垫方） |
| 4 | **手串模板预览图/底图** | 占位用 `white-jingti-12.png`（交付包未提供手串产品图） | 运营 | admin 模板编辑页替换 preview/base 图 |
| 5 | **佛珠模板预览图/底图** | 占位用 `demo-mala-thumb.jpg`（列表缩略图，可接受） | 运营（可选） | 同上 |

## F.6 遗留清单与检查中发现的其它问题

**本次任务范围内未完成项：无**（16 项拍板 + D.6/D.7.1 护栏 + 数据落地全部执行完毕）。等待外部配合项：

1. 小程序前端适配（A.3 C 端 1~5 项 + 佛珠长度档位组件，B.7.1 小程序行动项）——前端程序员执行，后端无需再改。
2. F.5 表中 5 项运营数据（正式定价/五行/正式图），不阻塞联调。

**检查过程中发现的、不属于本次任务的其它问题（未改动，仅记录）：**

1. **本文档旧版头部引用了不存在的"附录 F：CDN 图片存储方案（拍板 17~21）"**——正文从未包含该内容，v2.3 头部已勘误；若确有 CDN 方案需求需另行拍板。
2. **全库 ESLint 存在 13 条历史 warning**（`no-await-in-loop`，分布在 `services/lottery/admin/CRUDService.js`、`DisplayService.js` 等非 DIY 模块），0 error，不影响运行；属存量代码，未在本次范围内处理。
3. **正文 6.1 图片尺寸口径与实物不完全一致**：耳钉/手机链底图实为 512×768（非 640×960），宽高比一致故渲染无影响，落库已按真实像素回填（见 F.3.1 修正说明）。
4. **`docs/DIY饰品定制交付包/技术债务排查与暴力重构统一方案.md`** 与本文档同目录共存，两份文档如出现口径冲突，以本文档 v2.3 + 当前代码实际状态为准。
5. **此前版本正文引用的《DIY饰品定制-微信小程序前端对接文档.md》在交付包内不存在**——v2.3 已将 13 个用户端端点的完整接口契约汇总进下方 **F.7**（基于真实代码 `routes/v4/diy.js` + 各 Service 实测），前端对接以 F.7 为准，不再依赖那份独立文档。

## F.7 微信小程序前端完整接口契约（13 个用户端端点，基于真实代码实测）

> 顶层前缀 `/api/v4/diy`。响应统一包裹 `{ success, code, message, data, timestamp, request_id }`（`res.apiSuccess`），下表 `data` 列只写 `data` 字段的结构。
> 鉴权：模板/素材类为**公开接口**（无需登录）；作品类（`/works*`）全部需登录，请求头带 `Authorization: Bearer <access_token>`（token 由 auth 域登录接口下发，非 DIY 范围）。
> 字段口径：全链路 snake_case；金额字段 `price` 为整数、单位由 `price_asset_code`（`star_stone` 星石）决定，**非人民币**；时间字段 UTC 存储、展示转北京由前端处理；媒体字段 `image_media`/`preview_media`/`base_image_media` 经脱敏只下发 `{ media_id, width, height, public_url, thumbnails{w375,w750,w1080} }`。

### F.7.1 模板类（3 个，公开）

**① GET `/templates` — 模板列表（仅 published + 启用）**
- 请求参数：无
- 响应 `data`：模板对象数组，每项字段：
  `diy_template_id`(数字ID) / `template_code`(DT+日期+序列) / `display_name` / `category_id` / `category`{category_id,category_name,category_code} / `layout`(见下) / `bead_rules` / `sizing_rules` / `capacity_rules` / `material_group_codes`(允许素材分组码数组) / `status`(published) / `is_enabled` / `sort_order` / `preview_media`(脱敏媒体) / `base_image_media`(脱敏媒体)
- `layout` 串珠模板：`{ shape:'circle', bead_count, radius_x, radius_y }`；镶嵌模板：`{ shape:'slots', background_width, background_height, slot_definitions:[{slot_id,label,x,y,width,height,rotation,required,allowed_shapes[],allowed_group_codes[],allowed_diameters[]}] }`（x/y/width/height 为 0~1 归一化，contain 缩放还原）

**② GET `/templates/:id` — 模板详情**
- 路径参数：`id`=diy_template_id（数字）
- 响应 `data`：单个模板对象（字段同上）

**③ GET `/templates/:id/beads` — 模板可用素材（珠子/宝石）**
- 路径参数：`id`；查询参数（可选）：`group_code` / `diameter` / `keyword` / `slot_id`（传入则按该槽位的 allowed_diameters/allowed_group_codes/allowed_shapes 过滤，拍板 15）/ `item_type`(beads/accessories/pendants)
- 响应 `data`：素材对象数组（上限 200，无分页），每项字段：
  `diy_material_id` / `material_code`(DM+日期+序列) / `display_name` / `material_name` / `group_code` / `diameter`(数字mm) / `shape` / `item_type` / `material_type` / `five_elements` / `weight` / `meaning` / `energy` / `pairing` / `size_length_mm` / `size_width_mm` / `bore_orientation` / `cord_occupy_mm`(后端派生，前端累加即已排长度，null=物理数据不全) / `price`(整数) / `price_asset_code` / `stock`(库存掩码：-1无限/0售罄/1有货) / `image_media`(脱敏) / `sort_order` / `is_enabled`

### F.7.2 素材分组 / 手围估算 / 支付资产（3 个）

**④ GET `/material-groups` — 分组 Tab 数据（公开，拍板 16）**
- 请求参数：无
- 响应 `data`：`[{ group_code, count, display_name, color_hex }]`（display_name/color_hex 来自后端字典，前端直接渲染 Tab，不做本地映射；实测返回见 F.4）

**⑤ GET `/templates/:id/estimate` — 手围/长度算珠估算（公开，后端权威换算）**
- 路径参数：`id`；查询参数（必填）：`wrist_size_mm`(手围毫米，佛珠/项链传目标长度) / `diameter`(主珠直径毫米)
- 响应 `data`：`{ wrist_size_mm, diameter, elastic_margin_mm, target_length_mm, recommend_bead_count, min_length_mm, max_length_mm, matched_size_label }`
- 镶嵌模板调用返回 400 `DIY_TEMPLATE_NOT_BEADING`（仅串珠/长度驱动模板支持）

**⑥ GET `/templates/:id/payment-assets` — 用户钱包可用支付资产（需登录）**
- 路径参数：`id`
- 响应 `data`：`[{ asset_code, display_name, form, available_amount, frozen_amount }]`（该模板素材实际用到的定价币种 + 用户余额，供确认设计时选支付方式）

### F.7.3 作品类（7 个，全部需登录）

**⑦ GET `/works` — 我的作品列表**
- 查询参数（可选）：`page` / `page_size`(默认20) / `status`(draft/frozen/completed/cancelled)
- 响应 `data`：`{ rows:[作品对象], count }`；作品对象含 `diy_work_id / work_code / work_name / diy_template_id / status / total_cost / preview_media / template{diy_template_id,template_code,display_name,layout} / created_at / updated_at`

**⑧ GET `/works/:id` — 作品详情**
- 路径参数：`id`=diy_work_id
- 响应 `data`：作品完整对象（作者返回含 `design_data / total_cost.price_snapshot / account_id`；非作者仅 frozen/completed 可读且脱敏，草稿/已取消返回 403）

**⑨ POST `/works` — 保存作品（创建或更新草稿）**
- 请求体：`{ diy_work_id?(传则更新), diy_template_id, work_name, design_data, preview_media_id? }`
  - `design_data` 串珠：`{ mode:'beading', size:{label,wrist_size_mm}, beads:[{material_code,position}] }`；镶嵌：`{ mode:'slots', fillings:{ slot_id:{material_code} } }`（`material_code` 用后端下发值）
  - `total_cost` 不接受前端传入（confirm 时服务端权威计价）
- 响应 `data`：保存后的作品对象（含 `diy_work_id / work_code`）

**⑩ DELETE `/works/:id` — 删除作品（仅 draft 可删）**
- 响应 `data`：null（成功 message 提示）

**⑪ POST `/works/:id/confirm` — 确认设计（draft→frozen，冻结资产）**
- 请求体：`{ payments:[{ asset_code:'star_stone', amount:整数 }] }`（总额需 ≥ 服务端计算的应付；后端从 design_data 提取 material_code 查真实价，不信任前端）
- 响应 `data`：冻结后的作品（`status='frozen'`，`total_cost={price_snapshot,payments}`）
- 失败错误码：`DIY_BEAD_COUNT_OUT_OF_RANGE`(颗数越界) / `DIY_MATERIAL_SIZE_MISSING`(素材缺沿绳尺寸) / `DIY_LENGTH_BELOW_MIN`(成品过短) / `DIY_LENGTH_EXCEED_LIMIT`(成品过长)，均 400 + `data` 带毫米明细

**⑫ POST `/works/:id/complete` — 完成设计（frozen→completed，扣减+铸造物品）**
- 请求体：`{ address_id?:number }`（收货地址 ID，不传则 exchange_records.address_snapshot 为 null，管理员可后台补录）
- 响应 `data`：完成后的作品（`status='completed'`，`item_id` 已铸造）

**⑬ POST `/works/:id/cancel` — 取消设计（frozen→cancelled，解冻资产）**
- 请求体：无
- 响应 `data`：取消后的作品（`status='cancelled'`，冻结资产已全额解冻）

**附：GET `/works/:id/qrcode` — 作品分享小程序码（需登录，仅作者）**
- 响应 `data`：`{ qrcode_url, cached }`（首次调微信生成并缓存 Sealos，后续走缓存；扫码可用性依赖小程序提审发布，提审前前端隐藏入口）

> 以上即小程序 DIY 玩法全部对接接口。下单闭环：保存草稿(⑨) → 确认冻结(⑪) → 完成铸造(⑫)；中途可取消(⑬)。渲染链路：模板列表(①)/详情(②) + 素材(③) + 分组 Tab(④) + 手围估算(⑤)。所有字段直接用后端 snake_case 名，不做映射层。
