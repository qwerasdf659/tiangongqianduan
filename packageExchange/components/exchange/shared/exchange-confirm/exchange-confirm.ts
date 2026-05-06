/**
 * 兑换确认弹窗组件
 *
 * Properties 接口: visible, product, quantity, pointsBalance, submitting
 * 事件: bind:confirm / bind:close / bind:quantitychange
 *
 * @file components/exchange/shared/exchange-confirm/exchange-confirm.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const {
  ImageHelper: confirmImageHelper,
  AssetCodes: confirmAssetCodes
} = require('../../../../../utils/index')

Component({
  properties: {
    visible: { type: Boolean, value: false },
    product: { type: Object, value: null },
    quantity: { type: Number, value: 1 },
    /** 积分余额（保留用于 points 类型商品的余额展示） */
    pointsBalance: { type: Number, value: 0 },
    /** 星石和源晶类资产余额列表（用于查找商品对应的资产余额） */
    assetBalances: { type: Array, value: [] },
    /** 已选 SKU 展示信息（可选，多规格商品详情页使用） */
    selectedSkuInfo: { type: Object, value: null },
    /** 自定义余额值（可选，详情页已提前按实际币种算出余额时使用） */
    currentBalance: { type: Number, value: null },
    /** 自定义余额标签（可选，详情页直接展示当前商品币种标签时使用） */
    currentBalanceLabel: { type: String, value: '' },
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
    'product, assetBalances, pointsBalance, currentBalance, currentBalanceLabel'() {
      const product = this.data.product
      if (!product) {
        return
      }

      if (
        typeof this.properties.currentBalance === 'number' &&
        this.properties.currentBalance >= 0
      ) {
        this.setData({
          currentAssetBalance: this.properties.currentBalance,
          currentAssetLabel: this.properties.currentBalanceLabel || product._priceLabel || '积分'
        })
        return
      }

      const costCode = product.cost_asset_code || confirmAssetCodes.POINTS
      const balances = this.data.assetBalances || []

      const match = (balances as any[]).find((a: any) => a.asset_code === costCode)
      if (match) {
        this.setData({
          currentAssetBalance: match.available_amount,
          currentAssetLabel: match.display_name
        })
      } else if (costCode === confirmAssetCodes.POINTS) {
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
        quantity: this.properties.quantity,
        selectedSkuInfo: this.properties.selectedSkuInfo
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
