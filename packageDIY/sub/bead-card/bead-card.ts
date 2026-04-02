/**
 * 珠子素材卡片组件
 */
Component({
  properties: {
    bead: { type: Object, value: {} },
    disabled: { type: Boolean, value: false },
    previewSize: { type: Number, value: 80 }
  },

  methods: {
    onTap() {
      if (this.properties.disabled || (this.properties.bead as any).stock <= 0) {
        return
      }
      this.triggerEvent('select', { bead: this.properties.bead })
    }
  }
})
