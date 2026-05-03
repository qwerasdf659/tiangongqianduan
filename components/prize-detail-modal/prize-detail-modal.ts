/**
 * 奖品详情弹窗 - 全局公共组件
 *
 * 展示字段：奖品名称、描述、稀有度（带光效）
 * 已拍板决策：不展示概率数字、不展示库存数量（对标海底捞/瑞幸模式，惊喜感优先）
 *
 * 使用场景：抽奖预览 / 抽奖结果 / 兑换商城 / 道具仓库 / 交易市场
 * 架构决策4：放置于 components/ 全局目录，所有分包均可引用
 *
 * @file components/prize-detail-modal/prize-detail-modal.ts
 */

/** prize_type → 中文标签映射 */
const PRIZE_TYPE_LABEL: Record<string, string> = {
  points: '积分奖励',
  physical: '实物奖品',
  voucher: '优惠券',
  virtual: '虚拟道具',
  special: '特殊奖品',
  coupon: '优惠券',
  service: '服务权益'
}

/** rarity_code → 中文标签映射 */
const RARITY_LABEL: Record<string, string> = {
  common: '普通',
  uncommon: '优良',
  rare: '稀有',
  epic: '史诗',
  legendary: '传说'
}

Component({
  properties: {
    /** 是否显示弹窗 */
    visible: {
      type: Boolean,
      value: false
    },
    /** 奖品数据对象 */
    prize: {
      type: Object,
      value: null
    }
  },

  data: {
    /** 奖品类型中文标签 */
    prizeTypeLabel: '',
    /** 稀有度中文标签 */
    rarityLabel: ''
  },

  observers: {
    prize(prizeData: any) {
      if (!prizeData) {
        return
      }
      this.setData({
        prizeTypeLabel: PRIZE_TYPE_LABEL[prizeData.prize_type] || '奖品',
        rarityLabel: RARITY_LABEL[prizeData.rarity_code] || '普通'
      })
    }
  },

  methods: {
    /** 关闭弹窗 */
    onClose() {
      this.triggerEvent('close')
    },

    onPopupVisibleChange(e: any) {
      if (!e.detail?.visible) {
        this.onClose()
      }
    },

    /** 阻止事件穿透 */
    preventTouchMove() {
      return
    }
  }
})
