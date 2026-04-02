/**
 * 素材分类导航组件
 */
Component({
  properties: {
    categories: { type: Array, value: [] },
    activeId: { type: String, value: '' }
  },

  methods: {
    onSelect(e: WechatMiniprogram.BaseEvent) {
      const id = e.currentTarget.dataset.id as string
      if (id !== this.properties.activeId) {
        this.triggerEvent('change', { categoryId: id })
      }
    }
  }
})
