/**
 * 兑换结果弹窗组件
 *
 * Properties: visible, success, orderData, message, mintedItem
 * 事件: bind:close / bind:vieworder / bind:viewbackpack
 *
 * mintedItem 数据来自后端兑换响应（mint_instance=true 时返回）
 * 包含铸造物品的品质分、限量编号、纹理编号等实例属性
 *
 * @file packageExchange/shared/exchange-result/exchange-result.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const { ImageHelper: resultImageHelper } = require('../../../../utils/index')
const { getQualityGradeStyle, formatEdition } = resultImageHelper

Component({
  properties: {
    visible: { type: Boolean, value: false },
    success: { type: Boolean, value: false },
    orderData: { type: Object, value: null },
    message: { type: String, value: '' },
    /** 铸造物品信息（后端 minted_item，mint_instance=true 时传入） */
    mintedItem: { type: Object, value: null }
  },

  observers: {
    /** 铸造物品变更时计算展示字段 */
    mintedItem(item: any) {
      if (!item) {
        this.setData({ _hasMinted: false })
        return
      }
      const attrs = item.instance_attributes || {}
      const qualityStyle = attrs.quality_grade ? getQualityGradeStyle(attrs.quality_grade) : null
      const editionText = formatEdition(item.serial_number, item.edition_total)

      this.setData({
        _hasMinted: true,
        _trackingCode: item.tracking_code || '',
        _qualityGrade: attrs.quality_grade || '',
        _qualityScore: attrs.quality_score || null,
        _qualityColorHex: qualityStyle ? qualityStyle.colorHex : '',
        _qualityGlowClass: qualityStyle ? qualityStyle.glowClass : '',
        _patternId: attrs.pattern_id || null,
        _editionText: editionText
      })
    }
  },

  data: {
    _hasMinted: false,
    _trackingCode: '',
    _qualityGrade: '',
    _qualityScore: null as number | null,
    _qualityColorHex: '',
    _qualityGlowClass: '',
    _patternId: null as number | null,
    _editionText: ''
  },

  methods: {
    onClose() {
      this.triggerEvent('close')
    },

    onViewOrder() {
      if (this.properties.orderData && this.properties.orderData.orderNo) {
        this.triggerEvent('vieworder', { orderNo: this.properties.orderData.orderNo })
      }
    },

    /** 查看背包（铸造成功后跳转） */
    onViewBackpack() {
      this.triggerEvent('viewbackpack')
    }
  }
})
