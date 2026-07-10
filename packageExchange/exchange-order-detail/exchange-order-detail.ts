/**
 * 兑换订单详情页
 *
 * 展示单个订单的完整信息:
 *   - 订单状态 + 来源标签
 *   - 商品快照（名称 + 图片 + 描述）
 *   - 支付信息（资产类型 + 金额）
 *   - 完整时间线（下单 / 审核 / 发货 / 收货 / 拒绝 / 退款）
 *   - 操作按钮（取消 / 确认收货 / 评价）
 *
 * 后端API:
 *   GET  /api/v4/exchange/orders/:order_no          — 获取订单详情
 *   POST /api/v4/exchange/orders/:order_no/cancel    — 取消订单
 *   POST /api/v4/exchange/orders/:order_no/confirm-receipt — 确认收货
 *   POST /api/v4/exchange/orders/:order_no/rate      — 评价订单
 *
 * @file packageExchange/exchange-order-detail/exchange-order-detail.ts
 */

const {
  API: OrderDetailAPI,
  Logger: OrderDetailLogger,
  Wechat: OrderDetailWechat,
  Utils: OrderDetailUtils
} = require('../../utils/index')

const detailLog = OrderDetailLogger.createLogger('exchange-order-detail')
const { showToast: detailShowToast } = OrderDetailWechat

/** 订单状态文案映射（9态，与后端 exchange_records.status 对齐） */
const DETAIL_STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: string; desc: string }
> = {
  pending: { label: '待审核', color: '#C5A572', icon: '⏳', desc: '您的订单正在等待管理员审核' },
  approved: { label: '审核通过', color: '#5B8DB8', icon: '✓', desc: '订单已通过审核，等待发货' },
  shipped: { label: '已发货', color: '#5BA877', icon: '🚚', desc: '商品已发出，请注意查收' },
  received: { label: '已收货', color: '#4FA8B5', icon: 'icon-package', desc: '您已确认收到商品' },
  rated: { label: '已评价', color: '#9B7BB0', icon: 'icon-star', desc: '感谢您的评价' },
  rejected: { label: '审核拒绝', color: '#C46B5E', icon: '✕', desc: '很抱歉，您的订单未通过审核' },
  refunded: { label: '已退款', color: '#7A8A95', icon: '↩', desc: '已退款，资产已退还至您的账户' },
  cancelled: { label: '已取消', color: '#A89F94', icon: '—', desc: '订单已取消，资产已退还' },
  completed: { label: '已完成', color: '#5BA877', icon: '✓', desc: '订单已完成' }
}

/**
 * 订单来源标签映射（source 字段区分普通兑换/竞价中标/以物易物）
 * barter 单不可取消/退款（后端能力位 refundable 恒 false，canCancel 自然隐藏，对接文档 §十一-M1）
 */
const DETAIL_SOURCE_LABELS: Record<string, string> = {
  exchange: '普通兑换',
  bid: '竞价中标',
  barter: '以物易物'
}

/** 评价文案 */
const DETAIL_RATING_HINTS: Record<number, string> = {
  0: '请点击星星评分',
  1: '非常差',
  2: '较差',
  3: '一般',
  4: '满意',
  5: '非常满意'
}

Page({
  data: {
    /** 路由参数: 订单号 */
    orderNo: '',

    /** 订单详情数据 */
    order: null as any,

    /** 状态展示 */
    statusLabel: '',
    statusColor: '',
    statusIcon: '',
    statusDesc: '',

    /** 商品快照展示 */
    productName: '',
    productImage: '/images/default-product.png',
    productDescription: '',
    hasProductImage: false,

    /** 支付信息 */
    payInfo: '',
    /** 消耗资产图标 URL（后端 pay_asset_icon_url） */
    payAssetIconUrl: '',

    /** 来源标签 */
    sourceLabel: '',

    /** 时间线节点 */
    timeline: [] as any[],

    /** 操作按钮状态 */
    canCancel: false,
    canConfirmReceipt: false,
    canRate: false,

    /** 是否虚拟道具单（后端 BE-1 派生字段 is_prop，道具单即时到账禁退款） */
    isProp: false,

    /** 自动确认标识 */
    isAutoConfirmed: false,
    /** 已评价展示 */
    ratingStars: '',

    /** 物流信息（Phase 4: 快递100+快递鸟双通道） */
    hasShipping: false,
    shippingCompanyName: '',
    shippingNo: '',
    shippingTracks: [] as any[],
    shippingState: '',
    shippingLoading: false,

    /** 收货地址快照（实物订单，后端 address_snapshot，默认脱敏手机号） */
    hasAddress: false,
    addressReceiverName: '',
    addressReceiverPhone: '',
    addressRegion: '',
    addressDetail: '',
    /** 是否已展开完整手机号（点击「显示完整」后置 true，仅本人本单按需取） */
    showFullPhone: false,
    /** 完整手机号（按需从 contact 端点取，不缓存到列表） */
    fullPhone: '',
    /** 是否实物订单且可补录/改地址（pending/approved 且地址为空时引导补填） */
    canEditAddress: false,
    /** 是否实物订单缺地址（提示补填） */
    addressMissing: false,

    /** 评价弹窗 */
    showRatingModal: false,
    ratingScore: 0,
    ratingHint: DETAIL_RATING_HINTS[0],
    ratingSubmitting: false,

    /** 页面状态 */
    loading: true,
    hasError: false,
    errorMessage: ''
  },

  onLoad(options: Record<string, string | undefined>) {
    const orderNo = options.order_no
    if (!orderNo) {
      detailLog.error('缺少 order_no 路由参数')
      this.setData({ loading: false, hasError: true, errorMessage: '订单号无效' })
      return
    }

    this.setData({ orderNo })
    this._loadOrderDetail(orderNo)
  },

  /**
   * 加载订单详情
   * GET /api/v4/exchange/orders/:order_no
   */
  async _loadOrderDetail(orderNo: string) {
    this.setData({ loading: true, hasError: false })

    try {
      const result = await OrderDetailAPI.getExchangeOrderDetail(orderNo)

      if (!result || !result.success || !result.data) {
        throw new Error(result?.message || '订单不存在')
      }

      /** 后端 getOrderDetail() 返回 { order }，经 res.apiSuccess({ order }) 包装后结构为 { data: { order: {...} } } */
      const order = result.data.order || result.data
      const statusInfo = DETAIL_STATUS_MAP[order.status] || {
        label: order.status,
        color: '#999',
        icon: '?',
        desc: ''
      }

      const itemSnapshot = order.item_snapshot || {}
      /* 商品图：读快照 image_url（与订单列表页同口径），回退旧 primary_media.public_url */
      const imageUrl = itemSnapshot.image_url || itemSnapshot.primary_media?.public_url || ''

      /** 构建完整时间线 */
      const timeline = this._buildTimeline(order)

      /** 提取物流快递信息（后端 exchange_records 新增字段: shipping_company / shipping_company_name / shipping_no） */
      const hasShipping = !!(order.shipping_no && order.shipping_company_name)

      /**
       * 收货地址快照（实物订单 address_snapshot，后端默认脱敏手机号）。
       * 实物订单未发货（pending/approved）且无地址时，引导用户补填（拍板A：竞价中标实物单）。
       */
      const addr = order.address_snapshot || null
      const hasAddress = !!(addr && (addr.receiver_name || addr.detail_address))
      const isPhysicalOrder = !order.is_prop && order.source !== 'diy'
      const beforeShipped = order.status === 'pending' || order.status === 'approved'

      this.setData({
        order,
        statusLabel: statusInfo.label,
        statusColor: statusInfo.color,
        statusIcon: statusInfo.icon,
        statusDesc: statusInfo.desc,
        /* 商品名：读后端全链路通用快照字段 item_snapshot.item_name（含 barter 单，对接文档 §十一-M1），
           历史存量订单快照可能仅有旧 name 字段（快照为不可变历史数据），回退后再兜底占位 */
        productName: itemSnapshot.item_name || itemSnapshot.name || '兑换商品',
        productImage: imageUrl || '/images/default-product.png',
        productDescription: itemSnapshot.description || '',
        hasProductImage: !!imageUrl,
        payInfo: order.pay_amount
          ? `${order.pay_amount} ${order.pay_asset_name || order.pay_asset_code || ''}`
          : '',
        /* 消耗资产图标（后端 pay_asset_icon_url，完整URL，null 时不显示） */
        payAssetIconUrl: order.pay_asset_icon_url || '',
        sourceLabel: DETAIL_SOURCE_LABELS[order.source] || '',
        timeline,
        /**
         * 取消按钮显隐：以后端权威派生字段 refundable 为准（BE-1）
         * 道具单 refundable 恒 false（即时到账禁退）；实物单 pending 才可退
         * 前端不再用 status 自行推断"是否可退"，避免与后端规则脱节
         */
        canCancel: order.refundable === true && order.status === 'pending',
        isProp: order.is_prop === true,
        canConfirmReceipt: order.status === 'shipped',
        canRate: order.status === 'received',
        isAutoConfirmed: order.auto_confirmed === true,
        ratingStars: order.rating ? '★'.repeat(order.rating) + '☆'.repeat(5 - order.rating) : '',
        hasShipping,
        shippingCompanyName: order.shipping_company_name || '',
        shippingNo: order.shipping_no || '',
        hasAddress,
        addressReceiverName: hasAddress ? addr.receiver_name || '' : '',
        addressReceiverPhone: hasAddress ? addr.receiver_phone || '' : '',
        addressRegion: hasAddress
          ? `${addr.province || ''}${addr.city || ''}${addr.district || ''}`
          : '',
        addressDetail: hasAddress ? addr.detail_address || '' : '',
        showFullPhone: false,
        fullPhone: '',
        canEditAddress: isPhysicalOrder && beforeShipped,
        addressMissing: isPhysicalOrder && beforeShipped && !hasAddress,
        loading: false
      })

      detailLog.info('订单详情加载成功:', orderNo)
    } catch (error: any) {
      detailLog.error('订单详情加载失败:', error)
      this.setData({
        loading: false,
        hasError: true,
        errorMessage: error.message || '加载失败，请重试'
      })
    }
  },

  /**
   * 构建时间线节点数组
   * 按时间顺序排列所有已发生的时间节点
   */
  _buildTimeline(order: any): any[] {
    const nodes: any[] = []

    if (order.created_at) {
      nodes.push({ label: '提交订单', time: this._formatTime(order.created_at), dotClass: '' })
    }
    if (order.approved_at) {
      nodes.push({
        label: '审核通过',
        time: this._formatTime(order.approved_at),
        dotClass: 'dot-blue'
      })
    }
    if (order.shipped_at) {
      nodes.push({
        label: '商家发货',
        time: this._formatTime(order.shipped_at),
        dotClass: 'dot-green'
      })
    }
    if (order.received_at) {
      nodes.push({
        label: order.auto_confirmed ? '系统自动确认收货' : '用户确认收货',
        time: this._formatTime(order.received_at),
        dotClass: 'dot-cyan'
      })
    }
    if (order.rated_at) {
      nodes.push({
        label: '用户评价',
        time: this._formatTime(order.rated_at),
        dotClass: 'dot-purple'
      })
    }
    if (order.rejected_at) {
      nodes.push({
        label: '审核拒绝',
        time: this._formatTime(order.rejected_at),
        dotClass: 'dot-red'
      })
    }
    if (order.refunded_at) {
      nodes.push({
        label: '订单退款',
        time: this._formatTime(order.refunded_at),
        dotClass: 'dot-grey'
      })
    }
    if (order.status === 'cancelled') {
      /** 后端 exchange_records 表无 cancelled_at 列，cancelOrder() 仅更新 status + updated_at，用 updated_at 作为取消时间 */
      const cancelledTime = order.updated_at || order.created_at
      if (cancelledTime) {
        nodes.push({
          label: '订单取消',
          time: this._formatTime(cancelledTime),
          dotClass: 'dot-grey'
        })
      }
    }

    return nodes
  },

  /** 格式化时间（后端 B-2 单一 UTC ISO → 北京时间 YYYY-MM-DD HH:mm） */
  _formatTime(dateStr: string): string {
    return OrderDetailUtils.formatBeijing(dateStr, false) || dateStr
  },

  /** 复制订单号 */
  onCopyOrderNo() {
    const orderNo = this.data.orderNo
    if (!orderNo) {
      return
    }
    wx.setClipboardData({
      data: orderNo,
      success: () => detailShowToast('订单号已复制', 'success')
    })
  },

  /**
   * 取消订单
   * POST /api/v4/exchange/orders/:order_no/cancel
   */
  onCancelOrder() {
    const { orderNo, productName } = this.data

    wx.showModal({
      title: '取消订单',
      content: `确认取消「${productName || '商品'}」的兑换订单？取消后已扣除的资产将原路退还。`,
      confirmText: '确认取消',
      confirmColor: '#F44336',
      cancelText: '再想想',
      success: async (modalResult: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!modalResult.confirm) {
          return
        }

        try {
          const cancelResult = await OrderDetailAPI.cancelExchange(orderNo)

          if (cancelResult.success) {
            detailLog.info('取消订单成功:', orderNo)
            detailShowToast('订单已取消，资产已退还', 'success')
            this._loadOrderDetail(orderNo)
          } else {
            throw new Error(cancelResult.message || '取消订单失败')
          }
        } catch (cancelError: any) {
          detailLog.error('取消订单失败:', cancelError)
          detailShowToast(cancelError.message || '取消订单失败，请稍后重试')
        }
      }
    })
  },

  /**
   * 确认收货
   * POST /api/v4/exchange/orders/:order_no/confirm-receipt
   */
  onConfirmReceipt() {
    const { orderNo, productName } = this.data

    wx.showModal({
      title: '确认收货',
      content: `确认已收到「${productName || '商品'}」？确认后将无法撤销。`,
      confirmText: '确认收货',
      cancelText: '取消',
      success: async (modalResult: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!modalResult.confirm) {
          return
        }

        try {
          const receiptResult = await OrderDetailAPI.confirmExchangeReceipt(orderNo)

          if (receiptResult.success) {
            detailLog.info('确认收货成功:', orderNo)
            detailShowToast('确认收货成功', 'success')
            this._loadOrderDetail(orderNo)
          } else {
            throw new Error(receiptResult.message || '确认收货失败')
          }
        } catch (receiptError: any) {
          detailLog.error('确认收货失败:', receiptError)
          detailShowToast(receiptError.message || '确认收货失败，请稍后重试')
        }
      }
    })
  },

  /** 打开评价弹窗 */
  onOpenRating() {
    this.setData({
      showRatingModal: true,
      ratingScore: 0,
      ratingHint: DETAIL_RATING_HINTS[0]
    })
  },

  /** 选择评价星级 */
  onSelectStar(e: any) {
    const score = parseInt(e.currentTarget.dataset.score, 10)
    if (score >= 1 && score <= 5) {
      this.setData({
        ratingScore: score,
        ratingHint: DETAIL_RATING_HINTS[score] || ''
      })
    }
  },

  /**
   * 提交评价
   * POST /api/v4/exchange/orders/:order_no/rate
   */
  async onSubmitRating() {
    const { orderNo, ratingScore } = this.data

    if (!ratingScore || ratingScore < 1 || ratingScore > 5) {
      detailShowToast('请选择评价星级')
      return
    }
    if (this.data.ratingSubmitting) {
      return
    }

    this.setData({ ratingSubmitting: true })

    try {
      const rateResult = await OrderDetailAPI.rateExchangeOrder(orderNo, ratingScore)

      if (rateResult.success) {
        detailLog.info('评价提交成功:', orderNo, ratingScore)
        detailShowToast('评价成功', 'success')
        this.onCloseRatingModal()
        this._loadOrderDetail(orderNo)
      } else {
        throw new Error(rateResult.message || '评价失败')
      }
    } catch (rateError: any) {
      detailLog.error('评价提交失败:', rateError)
      detailShowToast(rateError.message || '评价失败，请稍后重试')
    } finally {
      this.setData({ ratingSubmitting: false })
    }
  },

  /** 关闭评价弹窗 */
  onCloseRatingModal() {
    this.setData({
      showRatingModal: false,
      ratingScore: 0,
      ratingHint: DETAIL_RATING_HINTS[0]
    })
  },

  /**
   * 查询物流轨迹
   * GET /api/v4/exchange/orders/:order_no/track
   */
  async onQueryShippingTrack() {
    const { orderNo, shippingLoading } = this.data
    if (!orderNo || shippingLoading) {
      return
    }

    this.setData({ shippingLoading: true })

    try {
      const trackResult = await OrderDetailAPI.getExchangeOrderTrack(orderNo)

      if (trackResult && trackResult.success && trackResult.data) {
        const trackData = trackResult.data
        const rawTracks = (trackData.track && trackData.track.tracks) || []

        /**
         * 兼容后端两种轨迹字段：
         *   - 自有轨迹表（source='local'）：track_status / track_detail / track_time
         *   - 第三方实时查降级：status / detail / time
         * 统一归一为展示字段 _detail / _time，前端零散映射收口在此。
         */
        const tracks = rawTracks.map((node: any) => ({
          ...node,
          _detail: node.track_detail || node.detail || '',
          _time: node.track_time || node.time || '',
          _status: node.track_status || node.status || ''
        }))

        this.setData({
          shippingTracks: tracks,
          shippingState: (trackData.track && trackData.track.state) || '',
          shippingLoading: false
        })
        detailLog.info('物流轨迹查询成功:', tracks.length, '条')
      } else {
        this.setData({ shippingLoading: false })
        detailShowToast(trackResult?.message || '暂无物流信息')
      }
    } catch (trackError: any) {
      detailLog.error('物流查询失败:', trackError)
      this.setData({ shippingLoading: false })
      detailShowToast(trackError.message || '物流查询失败')
    }
  },

  /**
   * 显示完整手机号（拍板⑤：按需明文，仅本人本单）
   * GET /api/v4/exchange/orders/:order_no/contact
   * ⚠️ 不缓存、点击触发，避免列表批量拉取
   */
  async onShowFullContact() {
    const { orderNo, showFullPhone } = this.data
    if (!orderNo || showFullPhone) {
      return
    }
    try {
      const result = await OrderDetailAPI.getExchangeOrderContact(orderNo)
      if (result && result.success && result.data) {
        const contact = result.data.contact || result.data
        this.setData({
          showFullPhone: true,
          fullPhone: contact.receiver_phone || ''
        })
      } else {
        throw new Error(result?.message || '获取联系人失败')
      }
    } catch (error: any) {
      detailLog.error('获取完整手机号失败:', error)
      detailShowToast(error.message || '获取失败，请重试')
    }
  },

  /**
   * 补录/修改收货地址（实物订单未发货阶段，拍板A）
   * 跳地址页选择模式 → 回传 → PUT /api/v4/exchange/orders/:order_no/address
   */
  onEditOrderAddress() {
    const { orderNo } = this.data
    if (!orderNo) {
      return
    }
    wx.navigateTo({
      url: '/packageUser/addresses/addresses?select=1',
      events: {
        selectAddress: async (payload: { address: API.UserAddress }) => {
          if (!payload || !payload.address) {
            return
          }
          try {
            const result = await OrderDetailAPI.updateExchangeOrderAddress(
              orderNo,
              payload.address.address_id
            )
            if (result && result.success) {
              detailShowToast('收货地址已更新', 'success')
              this._loadOrderDetail(orderNo)
            } else {
              throw new Error(result?.message || '保存地址失败')
            }
          } catch (error: any) {
            detailLog.error('补录订单地址失败:', error)
            detailShowToast(error.message || '保存地址失败，请重试')
          }
        }
      }
    })
  },

  /** 复制快递单号 */
  onCopyShippingNo() {
    const { shippingNo } = this.data
    if (!shippingNo) {
      return
    }
    wx.setClipboardData({
      data: shippingNo,
      success: () => detailShowToast('快递单号已复制', 'success')
    })
  },

  /** 重试加载 */
  onRetry() {
    if (this.data.orderNo) {
      this._loadOrderDetail(this.data.orderNo)
    }
  },

  /** 返回上一页 */
  onGoBack() {
    wx.navigateBack({
      fail: () => {
        wx.navigateTo({ url: '/packageExchange/exchange-orders/exchange-orders' })
      }
    })
  }
})
