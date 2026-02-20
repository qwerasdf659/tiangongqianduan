/**
 * 兑换结果弹窗组件
 *
 * Properties: visible, success, orderData, message
 * 事件: bind:close / bind:vieworder
 *
 * @file packageExchange/shared/exchange-result/exchange-result.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

Component({
  properties: {
    visible: { type: Boolean, value: false },
    success: { type: Boolean, value: false },
    orderData: { type: Object, value: null },
    message: { type: String, value: '' }
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onViewOrder() {
      if (this.properties.orderData && this.properties.orderData.orderNo) {
        this.triggerEvent('vieworder', { orderNo: this.properties.orderData.orderNo })
      }
    }
  }
})

export {}
