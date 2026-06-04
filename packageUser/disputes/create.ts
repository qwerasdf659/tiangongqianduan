/**
 * 自助发起售后申诉提交页面（统一入口）
 *
 * 业务语义: 用户对自己的订单（交易/拍卖/消费）自助发起售后申诉，
 *           填写纠纷类型 + 标题 + 描述 + 证据图片后提交，无需先找客服。
 *
 * 后端API:
 * - POST /api/v4/user/images/upload — 上传证据图片，取 public_url
 * - POST /api/v4/system/disputes    — 提交售后申诉（自助发起）
 *
 * 路由参数（由各订单页传入，字段以后端为准）:
 *   order_type  关联订单类型: trade / consumption / auction（兑换订单 exchange 待后端确认 order_type 后再开）
 *   order_id    关联订单ID（字符串，兼容 BIGINT/UUID）
 *   order_title 订单标题（可选，仅用于页面展示当前申诉对象，不提交后端）
 *
 * 提交字段（直接使用后端 snake_case，不做映射）:
 *   order_type / order_id / dispute_type / title / description / evidence(public_url 数组)
 *
 * @file packageUser/disputes/create.ts
 * @version 5.2.0
 * @since 2026-06-05
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const createLog = Logger.createLogger('dispute-create')
const { checkAuth } = Utils
const { showToast } = Wechat

/** 纠纷类型选项（value 对齐后端 trade_disputes.dispute_type ENUM） */
const DISPUTE_TYPES = [
  { value: 'item_not_received', label: '未收到物品', desc: '订单完成但未收到物品' },
  { value: 'item_mismatch', label: '物品不符', desc: '收到的与描述不一致' },
  { value: 'quality_issue', label: '质量问题', desc: '物品存在质量缺陷' },
  { value: 'fraud', label: '欺诈', desc: '疑似欺诈或虚假交易' },
  { value: 'other', label: '其他问题', desc: '其他订单相关问题' }
]

/** 关联订单类型文案映射（对齐后端 order_type 枚举，用于展示当前申诉对象） */
const ORDER_TYPE_MAP: Record<string, string> = {
  trade: '交易订单',
  consumption: '消费订单',
  auction: '拍卖订单'
}

/** 允许自助发起的订单类型白名单（兑换订单 exchange 待后端确认 order_type 后再纳入） */
const ALLOWED_ORDER_TYPES = ['trade', 'consumption', 'auction']

/** 证据图片上限 */
const MAX_EVIDENCE = 5
/** 单图大小上限（2MB，与后端 MediaService 一致） */
const MAX_IMAGE_SIZE = 2 * 1024 * 1024
/** 描述最小字数 */
const MIN_DESC_LENGTH = 20

Page({
  data: {
    /** 关联订单类型（路由参数） */
    orderType: '' as string,
    /** 关联订单ID（路由参数，统一为字符串） */
    orderId: '' as string,
    /** 订单类型中文（展示用） */
    orderTypeText: '',
    /** 订单标题（展示用，路由参数 order_title） */
    orderTitle: '',

    /** 纠纷类型选项 */
    disputeTypes: DISPUTE_TYPES,
    /** 选中的纠纷类型 */
    selectedType: '',

    /** 申诉标题 */
    title: '',
    /** 申诉描述 */
    description: '',
    /** 描述字数 */
    descLength: 0,

    /** 证据图片列表（{ localPath, publicUrl, uploading }） */
    evidenceImages: [] as any[],

    /** 提交中 */
    submitting: false,
    /** 路由参数是否合法 */
    paramValid: false,
    /** 参数错误提示 */
    paramErrorText: ''
  },

  onLoad(options: Record<string, string | undefined>) {
    if (!checkAuth()) {
      createLog.warn('用户未登录，已自动跳转')
      return
    }

    const orderType = options.order_type || ''
    const orderId = options.order_id || ''
    const orderTitle = options.order_title ? decodeURIComponent(options.order_title) : ''

    if (!ALLOWED_ORDER_TYPES.includes(orderType)) {
      createLog.error('不支持的 order_type:', orderType)
      this.setData({ paramValid: false, paramErrorText: '暂不支持该订单类型的售后申诉' })
      return
    }
    if (!orderId) {
      createLog.error('缺少 order_id 路由参数')
      this.setData({ paramValid: false, paramErrorText: '订单信息无效' })
      return
    }

    this.setData({
      orderType,
      orderId,
      orderTitle,
      orderTypeText: ORDER_TYPE_MAP[orderType] || '订单',
      paramValid: true
    })
  },

  /** 选择纠纷类型 */
  onSelectType(e: any) {
    const typeValue = e.currentTarget.dataset.type
    this.setData({ selectedType: typeValue })
  },

  /** 申诉标题输入 */
  onTitleInput(e: any) {
    this.setData({ title: e.detail.value || '' })
  },

  /** 申诉描述输入 */
  onDescInput(e: any) {
    const inputText = e.detail.value || ''
    this.setData({ description: inputText, descLength: inputText.length })
  },

  /** 选择并上传证据图片（选完即上传，取 public_url） */
  onChooseImage() {
    const { evidenceImages } = this.data
    const remaining = MAX_EVIDENCE - evidenceImages.length
    if (remaining <= 0) {
      showToast(`最多上传${MAX_EVIDENCE}张图片`)
      return
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: res => {
        res.tempFiles.forEach((file: any) => {
          if (file.size > MAX_IMAGE_SIZE) {
            showToast('图片不能超过2MB')
            return
          }
          this._uploadEvidence(file.tempFilePath)
        })
      }
    })
  },

  /** 上传单张证据图片 */
  async _uploadEvidence(localPath: string) {
    const placeholderIndex = this.data.evidenceImages.length
    this.setData({
      evidenceImages: [...this.data.evidenceImages, { localPath, publicUrl: '', uploading: true }]
    })

    try {
      const result = await API.uploadDisputeEvidence(localPath)
      if (result && result.success && result.data && result.data.public_url) {
        this.setData({
          [`evidenceImages[${placeholderIndex}].publicUrl`]: result.data.public_url,
          [`evidenceImages[${placeholderIndex}].uploading`]: false
        })
        createLog.info('证据图片上传成功')
      } else {
        throw new Error('上传未返回 public_url')
      }
    } catch (error: any) {
      createLog.error('证据图片上传失败:', error)
      showToast(error.message || '图片上传失败')
      const filtered = this.data.evidenceImages.filter(
        (_: any, idx: number) => idx !== placeholderIndex
      )
      this.setData({ evidenceImages: filtered })
    }
  },

  /** 删除证据图片 */
  onRemoveImage(e: any) {
    const removeIndex = e.currentTarget.dataset.index
    const updated = this.data.evidenceImages.filter((_: any, idx: number) => idx !== removeIndex)
    this.setData({ evidenceImages: updated })
  },

  /** 预览证据图片 */
  onPreviewImage(e: any) {
    const previewIdx = e.currentTarget.dataset.index
    const urls = this.data.evidenceImages
      .map((img: any) => img.publicUrl || img.localPath)
      .filter(Boolean)
    if (urls.length > 0) {
      wx.previewImage({ current: urls[previewIdx] || urls[0], urls })
    }
  },

  /** 提交申诉 */
  async onSubmit() {
    const { orderType, orderId, selectedType, title, description, evidenceImages, submitting } =
      this.data
    if (submitting) {
      return
    }

    if (!selectedType) {
      showToast('请选择申诉类型')
      return
    }
    if (!title.trim()) {
      showToast('请填写申诉标题')
      return
    }
    if (!description || description.length < MIN_DESC_LENGTH) {
      showToast(`申诉描述不能少于${MIN_DESC_LENGTH}字`)
      return
    }
    if (evidenceImages.some((img: any) => img.uploading)) {
      showToast('图片上传中，请稍候')
      return
    }

    const evidence = evidenceImages.map((img: any) => img.publicUrl).filter((url: string) => !!url)

    this.setData({ submitting: true })

    try {
      const payload: {
        order_type: string
        order_id: string
        dispute_type: string
        title: string
        description?: string
        evidence?: string[]
      } = {
        order_type: orderType,
        order_id: orderId,
        dispute_type: selectedType,
        title: title.trim(),
        description
      }
      if (evidence.length > 0) {
        payload.evidence = evidence
      }

      const result = await API.createSelfServiceDispute(payload)

      if (result && result.success) {
        createLog.info('售后申诉提交成功')
        showToast('申诉已提交', 'success')
        setTimeout(() => {
          wx.redirectTo({
            url: '/packageUser/disputes/disputes',
            fail: () => wx.navigateBack()
          })
        }, 1200)
      } else {
        throw new Error((result && result.message) || '提交失败')
      }
    } catch (error: any) {
      createLog.error('售后申诉提交失败:', error)
      showToast(error.message || '提交失败，请重试')
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack()
  }
})
