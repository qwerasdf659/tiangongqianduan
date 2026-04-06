/**
 * 珠子素材卡片组件
 *
 * 展示单个珠子/宝石的预览图、名称、规格和价格
 * 后端字段: diy_material_id / display_name / material_name / diameter / price / group_code
 */
Component({
  properties: {
    /** 珠子数据（API.DiyBead，后端 diy_materials 表） */
    bead: { type: Object, value: {} },
    /** 是否禁用（不匹配槽位约束或库存为0） */
    disabled: { type: Boolean, value: false },
    /** 预览图尺寸（rpx） */
    previewSize: { type: Number, value: 80 }
  },

  methods: {
    /** 点击选择珠子 */
    onTap() {
      const bead = this.properties.bead as any
      /* 库存为0时不可选（stock=-1表示无限库存） */
      if (this.properties.disabled || bead.stock === 0) {
        return
      }
      this.triggerEvent('select', { bead: this.properties.bead })
    }
  }
})
