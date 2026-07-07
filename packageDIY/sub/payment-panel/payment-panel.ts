/**
 * DIY 支付确认面板组件
 *
 * 确认设计时弹出，展示费用明细 + 用户资产余额 + 余额充足性校验
 *
 * Properties: visible, costBreakdown, submitting, templateId
 * 事件: bind:confirm（携带 payments 数组） / bind:close
 *
 * 数据流:
 *   1. 父页面传入 costBreakdown（从 diyStore.costBreakdown 获取）
 *   2. 组件 visible 变为 true 时调用 API.getDiyPaymentAssets(templateId) 获取用户资产余额
 *   3. 将 costBreakdown 与余额匹配，计算每项是否充足
 *   4. 用户点击确认 → triggerEvent('confirm', { payments })
 *
 * @file packageDIY/sub/payment-panel/payment-panel.ts
 */

const { API } = require('../../../utils/index')

/**
 * 资产代码 → 中文名称映射（UI展示用）
 * 后端 material_asset_types.display_name 是权威来源
 * 此处仅作为后端数据加载前的降级展示
 */
const ASSET_NAME_FALLBACK: Record<string, string> = {
  star_stone: '星石',
  red_core_shard: '红源晶碎片',
  red_core_gem: '红源晶',
  orange_core_shard: '橙源晶碎片',
  orange_core_gem: '橙源晶',
  yellow_core_shard: '黄源晶碎片',
  yellow_core_gem: '黄源晶',
  green_core_shard: '绿源晶碎片',
  green_core_gem: '绿源晶',
  blue_core_shard: '蓝源晶碎片',
  blue_core_gem: '蓝源晶',
  purple_core_shard: '紫源晶碎片',
  purple_core_gem: '紫源晶'
}

Component({
  properties: {
    /** 是否显示面板 */
    visible: { type: Boolean, value: false },
    /** 费用明细（从 diyStore.costBreakdown 传入） */
    costBreakdown: { type: Array, value: [] },
    /** 是否正在提交中（防重复点击） */
    submitting: { type: Boolean, value: false },
    /** 模板ID（用于获取该模板下的支付资产余额） */
    templateId: { type: Number, value: 0 }
  },

  data: {
    /** 合并后的支付明细（costBreakdown + 余额 + 充足性标记） */
    paymentItems: [] as any[],
    /** 是否所有资产余额充足 */
    allSufficient: false,
    /** 资产余额加载中 */
    balanceLoading: false,
    /** 资产余额加载失败 */
    balanceError: false
  },

  observers: {
    /**
     * 面板显示时加载用户资产余额
     * 每次打开都重新加载，确保余额是最新的
     */
    visible(visible: boolean) {
      if (visible) {
        this._loadPaymentAssets()
      }
    },

    /**
     * costBreakdown 变更时重新匹配余额
     * 场景: 父页面在面板打开状态下更新了设计（理论上不会，但防御性处理）
     */
    costBreakdown() {
      if (this.data.visible && !this.data.balanceLoading) {
        this._mergeBreakdownWithBalances()
      }
    }
  },

  methods: {
    /**
     * 加载用户 DIY 可用支付资产余额
     * 后端API: GET /api/v4/diy/payment-assets
     * 返回: 用户持有的各种可叠加资产余额（排除 points 和 budget_points）
     */
    async _loadPaymentAssets() {
      this.setData({ balanceLoading: true, balanceError: false })
      try {
        const templateId = this.properties.templateId as unknown as number
        if (!templateId) {
          this.setData({ balanceError: true })
          return
        }
        const res = await API.getDiyPaymentAssets(templateId)
        if (res.success && res.data) {
          /** 缓存余额数据，用于后续匹配 */
          ;(this as any)._assetBalances = res.data
          this._mergeBreakdownWithBalances()
        } else {
          this.setData({ balanceError: true })
        }
      } catch (_err) {
        this.setData({ balanceError: true })
      } finally {
        this.setData({ balanceLoading: false })
      }
    },

    /**
     * 将 costBreakdown 与用户资产余额合并
     * 生成 paymentItems 用于 WXML 渲染
     */
    _mergeBreakdownWithBalances() {
      const breakdown = this.properties.costBreakdown as API.DiyCostBreakdownItem[]
      const balances = (this as any)._assetBalances || []

      const paymentItems = breakdown.map((item: API.DiyCostBreakdownItem) => {
        /** 从余额列表中查找对应资产 */
        const balance = (balances as any[]).find((b: any) => b.asset_code === item.asset_code)
        const availableAmount = balance ? balance.available_amount : 0
        /** 优先使用后端返回的 display_name，降级使用本地映射 */
        const assetName = balance
          ? balance.display_name
          : ASSET_NAME_FALLBACK[item.asset_code] || item.asset_code
        const sufficient = availableAmount >= item.amount

        return {
          asset_code: item.asset_code,
          amount: item.amount,
          bead_count: item.bead_count,
          asset_name: assetName,
          available_amount: availableAmount,
          sufficient
        }
      })

      const allSufficient = paymentItems.length > 0 && paymentItems.every((p: any) => p.sufficient)
      this.setData({ paymentItems, allSufficient })
    },

    /** 确认支付 → 触发 confirm 事件，携带 payments 数组 */
    onConfirm() {
      if (!this.data.allSufficient || this.data.submitting) {
        return
      }
      /**
       * 构造 payments 数组（对齐文档第二部分 3.2 节 total_cost.payments 格式）
       * 当前版本: 直接按 price_asset_code 分组的金额作为 payments
       * 即"纯按定价货币支付"模式，不做跨资产换算
       */
      const payments: API.DiyTotalCostItem[] = this.data.paymentItems.map((item: any) => ({
        asset_code: item.asset_code,
        amount: item.amount
      }))
      this.triggerEvent('confirm', { payments })
    },

    /** 关闭面板 */
    onClose() {
      this.triggerEvent('close')
    },

    /** 余额加载失败后重试 */
    onRetryLoadBalance() {
      this._loadPaymentAssets()
    }
  }
})
