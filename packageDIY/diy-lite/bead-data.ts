/**
 * diy-lite 本地珠子数据（⚠️ 离线演示专用）
 *
 * 🚨 违规知悉项：本文件把珠子【价格/直径】等业务数据写死在前端，
 *   与「业务数据必须由后端权威提供」规则冲突，为用户明确同意的离线演示方案。
 *   正式版必须改为从后端 /api/v4/diy/... 下发（见文件底部“待后端提供”）。
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
    image: '/packageDIY/diy-lite/assets/white-yaopian.png'
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
    image: '/packageDIY/diy-lite/assets/white-paohuan.png'
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
    image: '/packageDIY/diy-lite/assets/purple-paohuan.png'
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
 * 最终珠子清单：为每颗注入 material + meaning + weight + energy + pairing
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
    pairing: attr.pairing
  }
})

/**
 * ⚠️ 待后端提供（正式版替换点）：
 *   演示版 export 本地数组；正式版应改为调用
 *   API.getDiyTemplateBeads(templateId) 获取后端下发的珠子
 *   （含 price/diameter/material/meaning/图片 media，image 支持 CDN URL）。
 */
module.exports = { LITE_BEADS, LITE_CATEGORIES }
