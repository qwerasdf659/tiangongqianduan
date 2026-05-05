/**
 * 担保码状态弹窗组件
 *
 * 仅展示担保状态信息，不展示明文担保码。
 */
Component({
  properties: {
    visible: { type: Boolean, value: false },
    loading: { type: Boolean, value: false },
    title: { type: String, value: '担保码状态' },
    orderNo: { type: String, value: '' },
    statusText: { type: String, value: '' },
    expiresAt: { type: String, value: '' },
    notice: { type: String, value: '' },
    errorText: { type: String, value: '担保状态不可用，请稍后重试' },
    showCopyOrderNo: { type: Boolean, value: false },
    hasData: { type: Boolean, value: false }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onCopyOrderNo() {
      if (!this.properties.orderNo) {
        return
      }
      this.triggerEvent('copyorderno', { orderNo: this.properties.orderNo })
    }
  }
})
