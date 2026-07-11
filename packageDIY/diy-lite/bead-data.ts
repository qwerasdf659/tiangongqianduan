/**
 * diy-lite 本地演示数据（📦 本地演示模式数据源 + 后端录入参考样例）
 *
 * ⚠️ 用途说明（2026-07-10，业务方决策）：
 *   diy-lite 已升级为生产页，正常链路走后端 /api/v4/diy/ 接口；
 *   本文件是「本地演示模式」的数据源——后端不可用/暂无串珠模板时，
 *   页面自动切换到本地数据展示（toast 告知切换原因，重新进入页面即重试后端；
 *   本地模式下保存/下单明确禁用，绝不伪造业务提交）。
 *   同时保留作后端录入素材的参考：
 *   1. 字段样例（寓意/能量/搭配文案、材质档位、克重估算口径、异形珠几何）；
 *   2. 尺码口径：颗数制（拍板①，size_options[].bead_count 为容量权威）——
 *      本地尺码档位按"手围cm×10÷默认珠径8mm"折算颗数，display 文案保留手围说明；
 *   3. 27 张实拍图作为素材库图片规范参考（透明通道 PNG、实物居中）。
 *   对应后端裁决见 docs/自由定制饰品diy-lite与S1-S5商品体系-对接方案与拍板决议.md 第 11/13 节。
 *
 * 数据来源：materials_manifest.json（4 分类）
 * 精简说明：为控制 packageDIY 分包体积（单分包上限 2MB），每款珠子保留
 *   代表性尺寸（多数保留 8mm / 12mm），删除了中间 10mm 尺寸与净体 6mm；
 *   仅单/双尺寸的款式（暴力黄、薰衣草、方糖、异形珠）全部保留。
 * 命名规则：{名称}-{尺寸}-{价格}.png；异形珠取较大边作视觉直径（圆形裁剪近似）。
 *
 * @file packageDIY/diy-lite/bead-data.ts
 */

/** 珠子分类（camelCase 前端业务层） */
export interface LiteCategory {
  /** 分类英文键 */
  key: string
  /** 分类中文展示名 */
  label: string
}

/** 单颗珠子数据结构 */
export interface LiteBead {
  /** 唯一标识 */
  id: string
  /** 珠子名称 */
  name: string
  /** 所属分类键 */
  category: string
  /** 所属分类中文名 */
  categoryLabel: string
  /** 视觉直径（mm）—— ⚠️ 演示写死，正式版由后端提供 */
  diameter: number
  /** 原始尺寸文本（圆珠如 10mm，异形如 3.6mmx8.7mm） */
  sizeText: string
  /** 单价（元）—— ⚠️ 演示写死，正式版由后端提供 */
  price: number
  /** 形状：round 圆珠 / special 异形（药片、跑环） */
  shape: 'round' | 'special'
  /**
   * 珠子图片地址：
   *   本地演示写 /packageDIY/diy-lite/assets/xxx.png
   *   正式版由后端下发 https://cdn.../xxx.webp（加载器已兼容 http URL）
   */
  image: string
  /**
   * 材质类型（影响 Canvas 立体高光参数）：
   *   crystal 水晶(透光强高光) / stone 玉石(柔和) / metal 金属(锐高光) / matte 哑光
   *   ⚠️ 演示阶段全部水晶，正式版由后端提供 material 字段
   */
  material: 'crystal' | 'stone' | 'metal' | 'matte'
  /** 寓意文案（珠子详情弹窗展示）—— ⚠️ 演示写死，正式版由后端提供 */
  meaning: string
  /** 参考重量（克，估算展示）—— ⚠️ 演示按直径估算，正式版由后端提供真实克重 */
  weight: number
  /** 能量属性文案（详情展示）—— ⚠️ 演示写死，正式版由后端提供 */
  energy: string
  /** 搭配建议文案（详情展示）—— ⚠️ 演示写死，正式版由后端提供 */
  pairing: string
  /**
   * 五行属性（金木水火土）—— ⚠️ 命理业务数据，仅由后端 `five_elements` 下发。
   * 取值：metal/wood/water/fire/earth，多值用逗号分隔（如 'water,wood'）。
   * 离线演示不写死此字段（前端无权威依据），故为可选；缺失时「五行雷达图」显示空态。
   */
  five_elements?: string
  /**
   * 库存数量 —— ⚠️ 业务数据，仅由后端 `stock` 下发（对齐 diy-design 的 stock===0 禁用逻辑）。
   * 离线演示不写死库存（前端无权威依据），故为可选；缺失时视为可选购，
   * stock === 0 时网格卡显示「售罄」并禁止加入手串。
   */
  stock?: number
  /**
   * 素材大类 —— ⚠️ 业务数据，仅由后端 `item_type` 下发（beads 珠子 / accessories 配饰 / pendants 吊坠）。
   * 注意与 `material`（材质光影档位 crystal/stone/metal/matte，对应后端 material_type）是两个不同概念。
   * 离线演示素材全部为珠子，故为可选；缺失时归入「饰品」Tab。
   */
  item_type?: string
  /**
   * 穿绳方向（对齐后端 bore_orientation，13.1-A 落库）：
   *   along_length 管珠/跑环沿长轴穿绳 / along_width 药片沿短边穿绳 / none 圆珠
   * 异形珠布局与朝向的权威依据；演示的 3 颗异形珠按实物标注，可作后端录入参考
   */
  bore_orientation?: 'along_length' | 'along_width' | 'none'
  /** 异形珠实物长边 mm（对齐后端 size_length_mm），圆珠不填 */
  size_length_mm?: number
  /** 异形珠实物短边 mm（对齐后端 size_width_mm），圆珠不填 */
  size_width_mm?: number
  /**
   * 单颗沿绳占用长度 mm（对齐后端派生字段 cord_occupy_mm，拍板 Q3）——
   * ⚠️ 生产链路该字段仅由后端序列化派生下发；演示数据在下方按与后端
   * deriveCordOccupyMm 完全相同的规则统一注入（along_length→长边 / along_width→短边 / none→直径），
   * 仅供本地演示模式的长度联动展示，不承担业务口径
   */
  cord_occupy_mm?: number
  /**
   * 实拍图去透明后的"宽:高"比例（演示用 sharp 实测常量）。
   * 生产链路此比例由 image_media.width / image_media.height 计算（11.7-2，图已裁透明边）。
   */
  imgRatio?: number
}

/** 分类清单（用于底部分类切换 Tab） */
const LITE_CATEGORIES: LiteCategory[] = [
  { key: 'white', label: '白水晶' },
  { key: 'pink', label: '粉水晶' },
  { key: 'purple', label: '紫水晶' },
  { key: 'yellow', label: '黄水晶' }
]

/** 珠子基础字段（不含派生字段，由下方按名称/分类统一注入） */
type RawBead = Omit<LiteBead, 'material' | 'meaning' | 'weight' | 'energy' | 'pairing'>

/** 珠子清单（27 颗，4 分类；已精简中间尺寸控制分包体积） */
const RAW_BEADS: RawBead[] = [
  {
    id: 'white-jingti-12',
    name: '净体白水晶',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 15,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-jingti-12.png'
  },
  {
    id: 'white-jingti-8',
    name: '净体白水晶',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 5,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-jingti-8.png'
  },
  {
    id: 'white-naibai-12',
    name: '奶白晶',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 11,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-naibai-12.png'
  },
  {
    id: 'white-naibai-8',
    name: '奶白晶',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 4,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-naibai-8.png'
  },
  {
    id: 'white-hunsha-12',
    name: '婚纱闪白阿塞',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 8,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-hunsha-12.png'
  },
  {
    id: 'white-hunsha-8',
    name: '婚纱闪白阿塞',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 3.5,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-hunsha-8.png'
  },
  {
    id: 'white-fangtang-9',
    name: '白水晶刻面方糖',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 9,
    sizeText: '9mm',
    price: 10,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/white-fangtang-9.png'
  },
  {
    id: 'white-yaopian',
    name: '白水晶药片珠',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 8.7,
    sizeText: '3.6mmx8.7mm',
    price: 5,
    shape: 'special',
    image: '/packageDIY/diy-lite/assets/white-yaopian.png',
    /** 药片：绳穿短边（长轴沿径向立着排），实拍图宽:高 ≈ 0.5 */
    bore_orientation: 'along_width',
    size_length_mm: 8.7,
    size_width_mm: 3.6,
    imgRatio: 0.5
  },
  {
    id: 'white-paohuan',
    name: '白水晶跑环',
    category: 'white',
    categoryLabel: '白水晶',
    diameter: 14.5,
    sizeText: '4.5mmx14.5mm',
    price: 16,
    shape: 'special',
    image: '/packageDIY/diy-lite/assets/white-paohuan.png',
    /** 跑环（管珠）：绳穿长轴（长轴沿切向躺着排），实拍图宽:高 ≈ 0.28 */
    bore_orientation: 'along_length',
    size_length_mm: 14.5,
    size_width_mm: 4.5,
    imgRatio: 0.28
  },
  {
    id: 'pink-xingguang-12',
    name: '星光粉晶',
    category: 'pink',
    categoryLabel: '粉水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 28,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/pink-xingguang-12.png'
  },
  {
    id: 'pink-xingguang-8',
    name: '星光粉晶',
    category: 'pink',
    categoryLabel: '粉水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 9,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/pink-xingguang-8.png'
  },
  {
    id: 'pink-zifen-12',
    name: '紫粉晶',
    category: 'pink',
    categoryLabel: '粉水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 16,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/pink-zifen-12.png'
  },
  {
    id: 'pink-zifen-8',
    name: '紫粉晶',
    category: 'pink',
    categoryLabel: '粉水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 6,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/pink-zifen-8.png'
  },
  {
    id: 'pink-mitao-12',
    name: '蜜桃粉晶',
    category: 'pink',
    categoryLabel: '粉水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 13,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/pink-mitao-12.png'
  },
  {
    id: 'pink-mitao-8',
    name: '蜜桃粉晶',
    category: 'pink',
    categoryLabel: '粉水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 4,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/pink-mitao-8.png'
  },
  {
    id: 'purple-wulagui-12',
    name: '乌拉圭紫水晶',
    category: 'purple',
    categoryLabel: '紫水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 37,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/purple-wulagui-12.png'
  },
  {
    id: 'purple-wulagui-8',
    name: '乌拉圭紫水晶',
    category: 'purple',
    categoryLabel: '紫水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 12,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/purple-wulagui-8.png'
  },
  {
    id: 'purple-baxi-12',
    name: '巴西紫水晶',
    category: 'purple',
    categoryLabel: '紫水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 56,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/purple-baxi-12.png'
  },
  {
    id: 'purple-baxi-8',
    name: '巴西紫水晶',
    category: 'purple',
    categoryLabel: '紫水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 18,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/purple-baxi-8.png'
  },
  {
    id: 'purple-paohuan',
    name: '紫水晶跑环',
    category: 'purple',
    categoryLabel: '紫水晶',
    diameter: 14.5,
    sizeText: '4.2mmx14.5mm',
    price: 24,
    shape: 'special',
    image: '/packageDIY/diy-lite/assets/purple-paohuan.png',
    /** 跑环（管珠）：绳穿长轴（长轴沿切向躺着排），实拍图宽:高 ≈ 0.28 */
    bore_orientation: 'along_length',
    size_length_mm: 14.5,
    size_width_mm: 4.2,
    imgRatio: 0.28
  },
  {
    id: 'purple-xunyicao-8',
    name: '薰衣草紫水晶',
    category: 'purple',
    categoryLabel: '紫水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 8,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/purple-xunyicao-8.png'
  },
  {
    id: 'yellow-baoli-10',
    name: '暴力黄黄水晶',
    category: 'yellow',
    categoryLabel: '黄水晶',
    diameter: 10,
    sizeText: '10mm',
    price: 67,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/yellow-baoli-10.png'
  },
  {
    id: 'yellow-baoli-8',
    name: '暴力黄黄水晶',
    category: 'yellow',
    categoryLabel: '黄水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 32,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/yellow-baoli-8.png'
  },
  {
    id: 'yellow-ningmeng-12',
    name: '透体柠檬黄水晶',
    category: 'yellow',
    categoryLabel: '黄水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 19,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/yellow-ningmeng-12.png'
  },
  {
    id: 'yellow-ningmeng-8',
    name: '透体柠檬黄水晶',
    category: 'yellow',
    categoryLabel: '黄水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 6,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/yellow-ningmeng-8.png'
  },
  {
    id: 'yellow-huangta-12',
    name: '黄塔晶',
    category: 'yellow',
    categoryLabel: '黄水晶',
    diameter: 12,
    sizeText: '12mm',
    price: 20,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/yellow-huangta-12.png'
  },
  {
    id: 'yellow-huangta-8',
    name: '黄塔晶',
    category: 'yellow',
    categoryLabel: '黄水晶',
    diameter: 8,
    sizeText: '8mm',
    price: 6.5,
    shape: 'round',
    image: '/packageDIY/diy-lite/assets/yellow-huangta-8.png'
  }
]

/**
 * 寓意文案映射（按珠子名称）—— ⚠️ 演示写死，正式版由后端提供
 * 珠子详情弹窗展示用；缺省时回落到通用文案。
 */
const MEANING_MAP: Record<string, string> = {
  净体白水晶: '净化气场，提升专注与灵性，被誉为「水晶之王」。',
  奶白晶: '温润柔和，助眠安神，适合日常佩戴。',
  婚纱闪白阿塞: '通透闪耀，象征纯洁与新的开始。',
  白水晶刻面方糖: '多切面折射光泽，招财纳福。',
  白水晶药片珠: '小巧点缀，平衡整串比例。',
  白水晶跑环: '管珠造型，串联点睛，增添层次。',
  星光粉晶: '招桃花、旺人缘，柔化人际关系。',
  紫粉晶: '兼具粉晶与紫晶能量，安抚情绪。',
  蜜桃粉晶: '甜美温柔，提升亲和力与自信。',
  乌拉圭紫水晶: '开智增慧，助眠安神，色泽浓郁。',
  巴西紫水晶: '经典紫调，象征智慧与高贵。',
  紫水晶跑环: '管珠造型，串联提亮整串气质。',
  薰衣草紫水晶: '淡雅浪漫，舒缓压力，助放松。',
  暴力黄黄水晶: '招正财、聚财气，色泽饱满明亮。',
  透体柠檬黄水晶: '清透明黄，带来活力与好心情。',
  黄塔晶: '能量聚焦，增强行动力与决断。'
}

/**
 * 材质映射（按珠子名称）—— ⚠️ 演示写死，正式版由后端 material 字段提供。
 * 材质影响 Canvas 立体高光：crystal 通透 / stone 温润 / metal 镜面 / matte 漫反射。
 * 演示为了让四种材质效果都能被看到，按珠子特性分配不同材质：
 *   刻面方糖=metal(切面镜面感) 奶白晶/蜜桃粉晶=stone(奶体温润) 其余透体水晶=crystal
 */
const MATERIAL_MAP: Record<string, LiteBead['material']> = {
  白水晶刻面方糖: 'metal',
  奶白晶: 'stone',
  蜜桃粉晶: 'stone',
  薰衣草紫水晶: 'matte'
}

/** 水晶密度约 2.65 g/cm³，按球体体积估算参考克重（演示用） */
function estimateWeight(diameterMm: number): number {
  const rCm = diameterMm / 10 / 2
  const volumeCm3 = (4 / 3) * Math.PI * rCm * rCm * rCm
  return Math.round(volumeCm3 * 2.65 * 10) / 10
}

/** 能量属性 + 搭配建议（按分类）—— ⚠️ 演示写死，正式版由后端提供 */
const CATEGORY_ATTR: Record<string, { energy: string; pairing: string }> = {
  white: { energy: '净化 · 清明', pairing: '百搭主珠，与紫/粉水晶皆宜' },
  pink: { energy: '爱情 · 人缘', pairing: '搭配白水晶提亮，或紫水晶添柔' },
  purple: { energy: '智慧 · 安神', pairing: '搭配白水晶点缀，气质沉静' },
  yellow: { energy: '财富 · 活力', pairing: '搭配白水晶或作点睛主珠' }
}

/**
 * 单颗沿绳占用长度（mm，演示口径）——规则与后端 deriveCordOccupyMm 完全一致（§11.2）:
 * along_length（管珠，绳穿长轴）→ 长边；along_width（药片，绳穿短边）→ 短边；none（圆珠）→ 直径。
 * ⚠️ 仅本地演示模式使用；生产链路该字段由后端序列化派生下发，前端只读不推算。
 */
function deriveDemoCordOccupyMm(bead: RawBead): number {
  if (bead.bore_orientation === 'along_length') {
    return bead.size_length_mm || bead.diameter
  }
  if (bead.bore_orientation === 'along_width') {
    return bead.size_width_mm || bead.diameter
  }
  return bead.diameter
}

/**
 * 最终珠子清单：为每颗注入 material + meaning + weight + energy + pairing + cord_occupy_mm
 * ⚠️ 均为演示数据，正式版由后端下发。
 */
const LITE_BEADS: LiteBead[] = RAW_BEADS.map(bead => {
  const attr = CATEGORY_ATTR[bead.category] || { energy: '天然能量', pairing: '百搭' }
  return {
    ...bead,
    material: MATERIAL_MAP[bead.name] || 'crystal',
    meaning: MEANING_MAP[bead.name] || '天然水晶，佩戴增添气质。',
    weight: estimateWeight(bead.diameter),
    energy: attr.energy,
    pairing: attr.pairing,
    cord_occupy_mm: deriveDemoCordOccupyMm(bead)
  }
})

/** 本地演示模板的弹力/工艺余量（mm，对齐拍板 Q7 行业默认 15mm；仅演示口径） */
const LOCAL_ELASTIC_MARGIN_MM = 15

/**
 * 本地演示模板（结构对齐后端 DiyTemplate 的 sizing_rules/bead_rules/capacity_rules）
 *
 * 让「本地演示模式」复用生产页同一套尺码/长度联动逻辑——手围驱动方案 §11.1 Schema：
 *   每档含 wrist_size_mm（手围毫米）+ target_length_mm（目标周长 = 手围 + 余量15mm，拍板 Q7 口径）；
 *   bead_count 保留为兜底防呆（按"目标周长 ÷ 默认珠径8mm"折算），display 保留运营文案口径。
 *   单圈 12~18cm + 双圈15cm/三圈15cm（演示多圈戴法，目标周长×圈数折算）。
 * ⚠️ 仅本地演示模式使用；后端接通后走真实模板，本模板不参与生产链路。
 */
const LOCAL_TEMPLATE = {
  /** 本地模板主键固定 0（区别于后端真实模板 id，草稿按此隔离） */
  diy_template_id: 0,
  display_name: '手串（本地演示）',
  layout: { shape: 'circle' },
  bead_rules: { margin: 0, default_diameter: 8, allowed_diameters: [] },
  sizing_rules: {
    default_size: '15',
    /** 模板级弹力/工艺余量（§11.1，可戴范围提示用） */
    elastic_margin_mm: LOCAL_ELASTIC_MARGIN_MM,
    size_options: [12, 13, 14, 15, 16, 17, 18]
      .map(cm => ({
        label: String(cm),
        display: `手围 ${cm}cm（约 ${Math.floor((cm * 10 + LOCAL_ELASTIC_MARGIN_MM) / 8)} 颗）`,
        /** 手围毫米值（用户入口值，§11.1） */
        wrist_size_mm: cm * 10,
        /** 目标成品周长 = 手围 + 弹力余量（拍板 Q7 行业默认口径） */
        target_length_mm: cm * 10 + LOCAL_ELASTIC_MARGIN_MM,
        /** 颗数兜底防呆：目标周长 ÷ 默认珠径8mm 向下取整 */
        bead_count: Math.floor((cm * 10 + LOCAL_ELASTIC_MARGIN_MM) / 8),
        radius_x: 0,
        radius_y: 0
      }))
      .concat([
        {
          label: '15x2',
          display: '手围 15cm 双圈（约 41 颗）',
          wrist_size_mm: 150,
          /** 双圈目标周长 = 单圈目标 × 2（演示折算口径） */
          target_length_mm: 330,
          bead_count: 41,
          radius_x: 0,
          radius_y: 0
        },
        {
          label: '15x3',
          display: '手围 15cm 三圈（约 61 颗）',
          wrist_size_mm: 150,
          /** 三圈目标周长 = 单圈目标 × 3（演示折算口径） */
          target_length_mm: 495,
          bead_count: 61,
          radius_x: 0,
          radius_y: 0
        }
      ])
  },
  capacity_rules: { min_beads: 1, max_beads: 0 }
}

/**
 * 构造本地镶嵌演示模板（结构对齐后端 DiyTemplate 的 slots 形态）
 *
 * 底图均为 640×960（2:3 竖幅）AI 生成的"空托"商品图；槽位坐标为归一化中心点
 * （对齐 shape-renderer._drawSlotOverlay 的坐标语义）：width 相对底图宽、height 相对底图高，
 * 圆形槽两值需按底图宽高比折算（宽 w ≙ 高 w × 640/960 = w × 2/3）。
 * ⚠️ 仅本地演示模式使用；保存/下单禁用，不参与生产链路。
 * 同时可作为后端录入镶嵌模板的字段参考样例。
 *
 * @param id 本地模板主键（负数，区别于本地串珠模板 0 与后端真实模板，草稿缓存按此隔离）
 * @param name 模板展示名
 * @param categoryId 分类（192 项链 / 193 戒指 / 194 吊坠 / 291 耳饰 / 292 手机链包挂 / 293 108佛珠，
 *                    291~293 为后端 seeder 实际落库 ID，对接文档 13.1-F）
 * @param baseImage 空托底图本地路径
 * @param slots 槽位归一化坐标列表 [{ id, label, x, y, w }]（w 为相对底图宽的直径）
 */
function buildLocalSlotTemplate(
  id: number,
  name: string,
  categoryId: number,
  baseImage: string,
  slots: { id: string; label: string; x: number; y: number; w: number }[]
) {
  return {
    diy_template_id: id,
    display_name: name,
    category_id: categoryId,
    layout: {
      shape: 'slots',
      background_width: 640,
      background_height: 960,
      /** 槽位结构对齐后端标注器输出字段（无 slot_shape，11.7-4：轮廓按 width/height 比例画椭圆/圆） */
      slot_definitions: slots.map(s => ({
        slot_id: s.id,
        label: s.label,
        x: s.x,
        y: s.y,
        width: s.w,
        /** 圆形槽：高相对底图高，按 2:3 底图折算保证像素上是正圆 */
        height: Math.round(s.w * (640 / 960) * 1000) / 1000,
        required: true,
        allowed_diameters: [],
        allowed_shapes: [],
        allowed_group_codes: []
      }))
    },
    /** 空托底图（对齐后端 base_image_media 结构，本地路径） */
    base_image_media: { public_url: baseImage },
    bead_rules: { margin: 0, default_diameter: 8, allowed_diameters: [] },
    sizing_rules: { default_size: '', size_options: [] },
    capacity_rules: { min_beads: 1, max_beads: slots.length }
  }
}

/**
 * 本地镶嵌演示模板集合（key 对应 diy-lite 入口参数 local=2/3/4）
 * 槽位坐标均已按底图逐张合成验证（宝石落点与空托爪位/包边严丝合缝）。
 */
const LOCAL_SLOT_TEMPLATES: Record<string, any> = {
  /** local=2 项链：银色六爪空托 + 链条 */
  necklace: buildLocalSlotTemplate(
    -1,
    '托帕石项链（本地演示）',
    192,
    '/packageDIY/diy-lite/assets/demo-necklace-base.jpg',
    [{ id: 'main', label: '主石', x: 0.51, y: 0.672, w: 0.15 }]
  ),
  /** local=3 戒指：顶视银戒 + 六爪空托 */
  ring: buildLocalSlotTemplate(
    -2,
    '主石戒指（本地演示）',
    193,
    '/packageDIY/diy-lite/assets/demo-ring-base.jpg',
    [{ id: 'main', label: '主石', x: 0.505, y: 0.285, w: 0.17 }]
  ),
  /** local=4 吊坠：金色水滴碎钻围镶空托 */
  pendant: buildLocalSlotTemplate(
    -3,
    '水滴吊坠（本地演示）',
    194,
    '/packageDIY/diy-lite/assets/demo-pendant-base.jpg',
    [{ id: 'main', label: '主石', x: 0.49, y: 0.605, w: 0.28 }]
  ),
  /** local=5 耳饰：一对银色六爪空托耳钉（2 槽位，填完左耳自动跳右耳；分类 291=DIY_EARRING 真实落库 ID） */
  earrings: buildLocalSlotTemplate(
    -4,
    '一对耳钉（本地演示）',
    291,
    '/packageDIY/diy-lite/assets/demo-earrings-base.jpg',
    [
      { id: 'left', label: '左耳', x: 0.295, y: 0.565, w: 0.24 },
      { id: 'right', label: '右耳', x: 0.705, y: 0.565, w: 0.24 }
    ]
  ),
  /** local=6 手机链/包挂：编绳 + 3 个空珠位 + 流苏（3 槽位竖排；分类 292=DIY_CHARM 真实落库 ID） */
  charm: buildLocalSlotTemplate(
    -5,
    '手机链包挂（本地演示）',
    292,
    '/packageDIY/diy-lite/assets/demo-charm-base.jpg',
    [
      { id: 'top', label: '上珠', x: 0.502, y: 0.362, w: 0.145 },
      { id: 'middle', label: '中珠', x: 0.499, y: 0.521, w: 0.145 },
      { id: 'bottom', label: '下珠', x: 0.502, y: 0.666, w: 0.145 }
    ]
  )
}

/**
 * 本地 108 佛珠/念珠演示模板（串珠模式，结构对齐 LOCAL_TEMPLATE）
 *
 * 走 bracelet-tray 串珠链路（复用 27 颗水晶珠演示数据），与手串演示的区别只在尺码档位：
 * 佛珠天然颗数制（拍板①）——54颗/108颗档位直接就是 bead_count 容量，
 * 与五行雷达图/寓意文案玩法天然契合（盘珠人群核心诉求）。
 * ⚠️ 仅本地演示模式使用（diy-lite?local=7）；保存/下单禁用，不参与生产链路。
 * 分类 293=DIY_MALA 为后端 seeder 实际落库 ID（对接文档 13.1-F）。
 */
const LOCAL_MALA_TEMPLATE = {
  /** 本地佛珠模板主键固定 -6（草稿缓存按此与手串演示模板 0 隔离） */
  diy_template_id: -6,
  display_name: '108佛珠（本地演示）',
  category_id: 293,
  layout: { shape: 'circle' },
  bead_rules: { margin: 0, default_diameter: 8, allowed_diameters: [] },
  sizing_rules: {
    default_size: '108x8',
    size_options: [
      {
        label: '54x8',
        display: '54颗 · 8mm珠',
        bead_count: 54,
        radius_x: 0,
        radius_y: 0
      },
      {
        label: '108x6',
        display: '108颗 · 6mm珠',
        bead_count: 108,
        radius_x: 0,
        radius_y: 0
      },
      {
        label: '108x8',
        display: '108颗 · 8mm珠',
        bead_count: 108,
        radius_x: 0,
        radius_y: 0
      }
    ]
  },
  capacity_rules: { min_beads: 1, max_beads: 0 }
}

/**
 * 本地镶嵌演示宝石（结构对齐后端 DiyBead 原始字段，直接走 _mapBead 映射；三个演示模板共用）
 * price_asset_code 用 '元' 使费用条展示为 "30 元"（演示计价口径，与本地串珠演示一致）。
 * ⚠️ 仅本地演示模式使用；图片为 AI 生成的顶视圆形切工宝石图（白底，渲染时圆形裁剪去白角）。
 */
const LOCAL_SLOT_GEMS = [
  {
    diy_material_id: 0,
    material_code: 'demo-gem-blue',
    display_name: '托帕石·冰湖蓝',
    material_name: '托帕石·冰湖蓝',
    group_code: 'blue',
    diameter: 8,
    shape: 'round',
    price: 30,
    price_asset_code: '元',
    stock: -1,
    is_stackable: 1,
    sort_order: 0,
    is_enabled: 1,
    meaning: '十一月生辰石，象征真挚与好运，蓝调清澈如冰湖。',
    image_media: { public_url: '/packageDIY/diy-lite/assets/demo-gem-blue.jpg' }
  },
  {
    diy_material_id: 0,
    material_code: 'demo-gem-pink',
    display_name: '粉蓝宝·蔷薇粉',
    material_name: '粉蓝宝·蔷薇粉',
    group_code: 'red',
    diameter: 8,
    shape: 'round',
    price: 45,
    price_asset_code: '元',
    stock: -1,
    is_stackable: 1,
    sort_order: 1,
    is_enabled: 1,
    meaning: '温柔而炽烈的蔷薇色调，寓意浪漫与忠贞。',
    image_media: { public_url: '/packageDIY/diy-lite/assets/demo-gem-pink.jpg' }
  },
  {
    diy_material_id: 0,
    material_code: 'demo-gem-green',
    display_name: '沙弗莱·翠绿',
    material_name: '沙弗莱·翠绿',
    group_code: 'green',
    diameter: 8,
    shape: 'round',
    price: 58,
    price_asset_code: '元',
    stock: -1,
    is_stackable: 1,
    sort_order: 2,
    is_enabled: 1,
    meaning: '浓郁翠绿如初夏森林，象征生机与富足。',
    image_media: { public_url: '/packageDIY/diy-lite/assets/demo-gem-green.jpg' }
  }
]

module.exports = {
  LITE_BEADS,
  LITE_CATEGORIES,
  LOCAL_TEMPLATE,
  LOCAL_MALA_TEMPLATE,
  LOCAL_SLOT_TEMPLATES,
  LOCAL_SLOT_GEMS
}
