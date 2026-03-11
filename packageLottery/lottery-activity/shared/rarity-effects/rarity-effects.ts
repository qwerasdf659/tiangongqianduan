/**
 * 稀有度光效 共享组件
 *
 * 作为包裹容器使用，根据 rarity 属性（对应后端 rarity_code 字段）为子内容添加对应光效
 * 纯CSS实现，不依赖Canvas或JS动画
 *
 * 5级光效（对齐后端 rarity_code 枚举）：
 *   common    → #9E9E9E 灰色边框，无特效
 *   uncommon  → #4CAF50 绿色边框
 *   rare      → #2196F3 蓝色呼吸光，CSS pulse动画
 *   epic      → #9C27B0 紫色闪烁光环，CSS box-shadow闪烁
 *   legendary → #FF9800 金色旋转光环，conic-gradient + rotate + 星星
 *
 * @file shared/rarity-effects/rarity-effects.ts
 */

/** 有效的5级稀有度枚举值（对齐后端 rarity_code 字段） */
const VALID_RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary']

Component({
  properties: {
    /** 稀有度等级：common / uncommon / rare / epic / legendary */
    rarity: {
      type: String,
      value: 'common'
    },
    /** 是否启用光效（父组件通过 rarityEffectsEnabled 控制） */
    enabled: {
      type: Boolean,
      value: true
    }
  },

  data: {
    /** 计算后的CSS类名 */
    rarityClass: 'rarity--common'
  },

  observers: {
    'rarity, enabled'(rarity: string, enabled: boolean) {
      const safeRarity = VALID_RARITIES.includes(rarity) ? rarity : 'common'
      const newClass = enabled ? `rarity--${safeRarity}` : ''
      /* 值未变化时跳过 setData，避免父组件 diff 时级联触发大量子组件重渲染 */
      if (newClass !== this.data.rarityClass) {
        this.setData({ rarityClass: newClass })
      }
    }
  },

  methods: {}
})
