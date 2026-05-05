/**
 * 担保码输入弹窗组件
 *
 * 用于买方输入卖方提供的6位数字担保码，完成实物交易确认收货。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    value: { type: String, value: '' },
    submitting: { type: Boolean, value: false },
    title: { type: String, value: '输入担保码' },
    hint: { type: String, value: '请输入卖方提供的6位数字担保码，确认后交易完成' },
    /** 输入展示模式：plain=普通输入框，dots=圆点占位输入 */
    inputMode: { type: String, value: 'plain' },
    /** 圆点输入模式下是否自动聚焦 */
    focused: { type: Boolean, value: false }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onInput(e: WechatMiniprogram.Input) {
      const normalizedValue = (e.detail.value || '').replace(/[^0-9]/g, '').slice(0, 6)
      this.triggerEvent('inputchange', { value: normalizedValue })
    },

    onFocusInput() {
      this.triggerEvent('focusinput')
    },

    onSubmit() {
      if (this.properties.submitting || this.properties.value.length !== 6) {
        return
      }
      this.triggerEvent('submit', { value: this.properties.value })
    }
  }
})
