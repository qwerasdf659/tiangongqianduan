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
    /** 积分余额（保留用于 POINTS 类型商品的余额展示） */
    pointsBalance: { type: Number, value: 0 },
    /** 钻石和水晶类资产余额列表（用于查找商品对应的资产余额） */
    assetBalances: { type: Array, value: [] },
    submitting: { type: Boolean, value: false }
  },

  data: {
    /** 默认商品占位图路径（来自 ImageHelper，避免 WXML 硬编码） */
    defaultProductImage: confirmImageHelper.DEFAULT_PRODUCT_IMAGE,
    /** 当前商品对应的资产余额（根据 cost_asset_code 从 assetBalances 中匹配） */
    currentAssetBalance: 0,
    /** 当前商品对应的资产名称 */
    currentAssetLabel: '积分'
  },

  observers: {
    /** 商品或资产余额变更时，重新计算对应资产余额 */
    'product, assetBalances, pointsBalance'() {
      const product = this.data.product
      if (!product) {
        return
      }
      const costCode = product.cost_asset_code || 'POINTS'
      const balances = this.data.assetBalances || []

      const match = (balances as any[]).find((a: any) => a.asset_code === costCode)
      if (match) {
        this.setData({
          currentAssetBalance: match.available_amount,
          currentAssetLabel: match.display_name
        })
      } else if (costCode === 'POINTS') {
        this.setData({
          currentAssetBalance: this.data.pointsBalance,
          currentAssetLabel: '积分'
        })
      } else {
        this.setData({
          currentAssetBalance: 0,
          currentAssetLabel: product._priceLabel || costCode
        })
      }
    }
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
