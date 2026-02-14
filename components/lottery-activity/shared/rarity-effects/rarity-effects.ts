/**
 * 稀有度光效 共享组件
 *
 * 作为包裹容器使用，根据 rarity 属性为子内容添加对应光效
 * 纯CSS实现，不依赖Canvas或JS动画
 *
 * 4级光效：
 *   common    → 蓝色边框，无特效
 *   rare      → 紫色呼吸光，CSS pulse动画
 *   epic      → 橙色光环，CSS box-shadow闪烁
 *   legendary → 金色旋转光环，conic-gradient + rotate + 星星
 *
 * @file shared/rarity-effects/rarity-effects.ts
 */

Component({
  properties: {
    /** 稀有度等级：common / rare / epic / legendary */
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
      const validRarities = ['common', 'rare', 'epic', 'legendary']
      const safeRarity = validRarities.includes(rarity) ? rarity : 'common'
      // 🔴 enabled=false 时不添加任何class，让硬编码样式作为保底
      this.setData({
        rarityClass: enabled ? `rarity--${safeRarity}` : ''
      })
    }
  },

  lifetimes: {
    attached() {
      const { rarity, enabled } = this.properties
      const validRarities = ['common', 'rare', 'epic', 'legendary']
      const safeRarity = validRarities.includes(rarity) ? rarity : 'common'
      // 🔴 enabled=false 时不添加任何class，让硬编码样式作为保底
      this.setData({
        rarityClass: enabled ? `rarity--${safeRarity}` : ''
      })
    }
  },

  methods: {}
})
