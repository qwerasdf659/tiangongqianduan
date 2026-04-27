/**
 * P2P交易纠纷/申诉页面（文档 5.4）
 *
 * 功能:
 *   - 提交申诉: 选择类型 + 文字描述 + 图片证据上传
 *   - 查看进度: 已提交 / 处理中 / 已仲裁
 *   - 仲裁结果: 退款 / 驳回 / 部分退款
 *
 * 支持两种来源（通过路由参数 source 区分）:
 *   source=trade（默认）: C2C固定价交易订单争议
 *     POST /api/v4/marketplace/trade-orders/:trade_order_id/dispute
 *     GET  /api/v4/marketplace/trade-orders/:trade_order_id/dispute
 *   source=auction: C2C拍卖争议
 *     POST /api/v4/marketplace/auctions/:auction_listing_id/dispute
 *
 * @file packageTrade/trade/dispute/dispute.ts
 * @version 5.2.0
 */

const {
  API: DisputeAPI,
  Logger: DisputeLogger,
  Wechat: DisputeWechat
} = require('../../../utils/index')
const disputeLog = DisputeLogger.createLogger('dispute')
const { showToast: disputeShowToast } = DisputeWechat

/** 申诉类型选项 */
const DISPUTE_TYPES = [
  { value: 'item_mismatch', label: '物品不符', desc: '收到的物品与描述不一致' },
  { value: 'not_received', label: '未收到物品', desc: '交易完成但未收到物品' },
  { value: 'quality_issue', label: '质量问题', desc: '物品存在质量缺陷' },
  { value: 'other', label: '其他问题', desc: '其他交易相关问题' }
]

/** 申诉状态文案映射 */
const DISPUTE_STATUS_MAP: Record<string, { label: string; color: string; desc: string }> = {
  submitted: { label: '已提交', color: '#FF9800', desc: '申诉已提交，等待平台审核' },
  processing: { label: '处理中', color: '#2196F3', desc: '平台正在审核处理您的申诉' },
  arbitrated: { label: '已仲裁', color: '#4CAF50', desc: '仲裁已完成，请查看结果' }
}

/** 仲裁结果文案 */
const DISPUTE_RESULT_MAP: Record<string, { label: string; color: string }> = {
  refund: { label: '全额退款', color: '#4CAF50' },
  partial_refund: { label: '部分退款', color: '#FF9800' },
  rejected: { label: '申诉驳回', color: '#F44336' }
}

Page({
  data: {
    /** 争议来源: 'trade'(C2C固定价交易) / 'auction'(C2C拍卖) */
    disputeSource: 'trade' as string,
    /** 路由参数（交易订单ID，source=trade时使用） */
    tradeOrderId: 0,
    /** 路由参数（拍卖ID，source=auction时使用） */
    auctionListingId: 0,

    /** 页面模式: 'form'(提交申诉) / 'detail'(查看进度) */
    mode: 'form' as string,

    /** 申诉类型选项 */
    disputeTypes: DISPUTE_TYPES,
    /** 选中的申诉类型 */
    selectedType: '',
    selectedTypeDesc: '',
    /** 申诉描述 */
    description: '',
    /** 证据图片列表（本地路径 + 已上传URL） */
    evidenceImages: [] as any[],
    /** 提交中 */
    submitting: false,
    /** 描述字数 */
    descLength: 0,

    /** 已有申诉详情（查看进度模式） */
    dispute: null as any,
    disputeStatusLabel: '',
    disputeStatusColor: '',
    disputeStatusDesc: '',
    disputeResultLabel: '',
    disputeResultColor: '',

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: ''
  },

  onLoad(options: Record<string, string | undefined>) {
    const source = options.source || 'trade'

    if (source === 'auction') {
      const auctionListingIdText = options.auction_listing_id || ''
      const auctionListingId = Number(auctionListingIdText)
      if (!auctionListingIdText || !Number.isInteger(auctionListingId) || auctionListingId <= 0) {
        disputeLog.error('缺少有效的 auction_listing_id 路由参数')
        this.setData({ loading: false, hasError: true, errorMessage: '拍卖信息无效' })
        return
      }
      this.setData({ disputeSource: 'auction', auctionListingId, mode: 'form', loading: false })
      return
    }

    const tradeOrderIdText = options.trade_order_id || ''
    const tradeOrderId = Number(tradeOrderIdText)
    if (!tradeOrderIdText || !Number.isInteger(tradeOrderId) || tradeOrderId <= 0) {
      disputeLog.error('缺少有效的 trade_order_id 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '订单信息无效' })
      return
    }

    this.setData({ disputeSource: 'trade', tradeOrderId })
    this._checkExistingDispute(tradeOrderId)
  },

  /**
   * 检查是否已有申诉记录
   * 有 → 进入查看进度模式
   * 无 → 进入提交表单模式
   */
  async _checkExistingDispute(tradeOrderId: number) {
    this.setData({ loading: true })

    try {
      const response = await DisputeAPI.getTradeDispute(tradeOrderId)

      if (response && response.success && response.data && response.data.dispute_id) {
        const disputeData = response.data
        const statusInfo = DISPUTE_STATUS_MAP[disputeData.status] || {
          label: disputeData.status,
          color: '#999',
          desc: ''
        }

        let resultLabel = ''
        let resultColor = ''
        if (disputeData.status === 'arbitrated' && disputeData.result) {
          const resultInfo = DISPUTE_RESULT_MAP[disputeData.result]
          if (resultInfo) {
            resultLabel = resultInfo.label
            resultColor = resultInfo.color
          }
        }

        this.setData({
          mode: 'detail',
          dispute: disputeData,
          disputeStatusLabel: statusInfo.label,
          disputeStatusColor: statusInfo.color,
          disputeStatusDesc: statusInfo.desc,
          disputeResultLabel: resultLabel,
          disputeResultColor: resultColor,
          loading: false
        })
        disputeLog.info('已有申诉记录:', disputeData.status)
      } else {
        this.setData({ mode: 'form', loading: false })
        disputeLog.info('无申诉记录，进入表单模式')
      }
    } catch (checkError: any) {
      if (checkError.statusCode === 404) {
        this.setData({ mode: 'form', loading: false })
        return
      }
      disputeLog.error('检查申诉状态失败:', checkError)
      this.setData({ mode: 'form', loading: false })
    }
  },

  /** 选择申诉类型 */
  onSelectType(e: any) {
    const typeValue = e.currentTarget.dataset.type
    const typeItem = DISPUTE_TYPES.find(t => t.value === typeValue)
    this.setData({
      selectedType: typeValue,
      selectedTypeDesc: typeItem ? typeItem.desc : ''
    })
  },

  /** 申诉描述输入 */
  onDescInput(e: any) {
    const inputText = e.detail.value || ''
    this.setData({ description: inputText, descLength: inputText.length })
  },

  /** 选择证据图片 */
  onChooseImage() {
    const { evidenceImages } = this.data
    const remaining = 5 - evidenceImages.length
    if (remaining <= 0) {
      disputeShowToast('最多上传5张图片')
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        const newImages = res.tempFiles.map((file: any) => ({
          localPath: file.tempFilePath,
          uploadedUrl: '',
          uploading: false
        }))
        this.setData({
          evidenceImages: [...evidenceImages, ...newImages]
        })
      }
    })
  },

  /** 删除证据图片 */
  onRemoveImage(e: any) {
    const removeIndex = e.currentTarget.dataset.index
    const updatedImages = this.data.evidenceImages.filter(
      (_: any, idx: number) => idx !== removeIndex
    )
    this.setData({ evidenceImages: updatedImages })
  },

  /** 预览证据图片 */
  onPreviewEvidence(e: any) {
    const previewIdx = e.currentTarget.dataset.index
    const urls = this.data.evidenceImages
      .map((img: any) => img.uploadedUrl || img.localPath)
      .filter(Boolean)
    if (urls.length > 0) {
      wx.previewImage({ current: urls[previewIdx] || urls[0], urls })
    }
  },

  /** 提交申诉（支持交易订单和拍卖两种来源） */
  async onSubmitDispute() {
    const {
      disputeSource,
      tradeOrderId,
      auctionListingId,
      selectedType,
      description,
      evidenceImages,
      submitting
    } = this.data
    if (submitting) {
      return
    }

    if (!selectedType) {
      disputeShowToast('请选择申诉类型')
      return
    }
    if (!description || description.length < 20) {
      disputeShowToast('申诉描述不能少于20字')
      return
    }

    this.setData({ submitting: true })

    try {
      const evidenceUrls = evidenceImages
        .map((img: any) => img.uploadedUrl || img.localPath)
        .filter(Boolean)

      const disputePayload: Record<string, any> = {
        dispute_type: selectedType,
        description
      }
      if (evidenceUrls.length > 0) {
        disputePayload.evidence_urls = evidenceUrls
      }

      let response: any
      if (disputeSource === 'auction') {
        response = await DisputeAPI.createAuctionDispute(auctionListingId, disputePayload)
      } else {
        response = await DisputeAPI.createTradeDispute(tradeOrderId, disputePayload)
      }

      if (response && response.success) {
        disputeLog.info('申诉提交成功')
        disputeShowToast('申诉提交成功', 'success')
        if (disputeSource === 'trade') {
          this._checkExistingDispute(tradeOrderId)
        } else {
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        }
      } else {
        throw new Error((response && response.message) || '提交失败')
      }
    } catch (submitError: any) {
      disputeLog.error('申诉提交失败:', submitError)
      disputeShowToast(submitError.message || '提交失败，请重试')
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({ url: '/packageTrade/trade/my-orders/my-orders' })
      }
    })
  }
})
