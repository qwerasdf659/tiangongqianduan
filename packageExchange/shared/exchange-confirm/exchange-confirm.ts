/**
 * 兑换确认弹窗组件
 *
 * Properties 接口: visible, product, quantity, pointsBalance, submitting
 * 事件: bind:confirm / bind:close / bind:quantitychange
 *
 * @file packageExchange/shared/exchange-confirm/exchange-confirm.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const { ImageHelper: confirmImageHelper } = require('../../../utils/index')

Component({
  properties: {
    visible: { type: Boolean, value: false },
    product: { type: Object, value: null },
    quantity: { type: Number, value: 1 },
    pointsBalance: { type: Number, value: 0 },
    submitting: { type: Boolean, value: false }
  },

  data: {
    /** 默认商品占位图路径（来自 ImageHelper，避免 WXML 硬编码） */
    defaultProductImage: confirmImageHelper.DEFAULT_PRODUCT_IMAGE
  },

  methods: {
    onConfirm() {
      this.triggerEvent('confirm', {
        product: this.properties.product,
        quantity: this.properties.quantity
      })
    },

    onClose() {
      this.triggerEvent('close')
    },

    onQuantityChange(e: any) {
      this.triggerEvent('quantitychange', { action: e.currentTarget.dataset.action })
    }
  }
})
