/**
 * 竞价子组件 — 决策D9: 竞价提取为独立子组件
 *
 * 自行管理竞价数据、出价弹窗、倒计时等全部状态
 * 后端API:
 *   GET  /api/v4/backpack/bid/products   竞价商品列表
 *   GET  /api/v4/backpack/bid/products/:id  竞价商品详情
 *   POST /api/v4/backpack/bid            提交出价
 *   GET  /api/v4/backpack/bid/history    出价历史
 *
 * @file packageExchange/exchange-shelf/sub/bid-panel/bid-panel.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const {
  API: bidAPI,
  Wechat: bidWechat,
  Logger: bidLogger,
  Utils: bidUtils,
  ImageHelper: bidImageHelper
} = require('../../../../utils/index')
const bidLog = bidLogger.createLogger('bid-panel')
const {
  getBidProducts: bidGetBidProducts,
  getBidProductDetail: bidGetBidProductDetail,
  placeBid: bidPlaceBid,
  getBidHistory: bidGetBidHistory
} = bidAPI
const { showToast: bidShowToast } = bidWechat

Component({
  properties: {
    /** 可用积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 全局氛围主题标识（由 exchange-shelf 下传，如 'default' / 'gold_luxury'） */
    theme: { type: String, value: 'default' },
    /** 刷新令牌 */
    refreshToken: { type: Number, value: 0 }
  },

  data: {
    /** 竞价商品列表 */
    biddingProducts: [] as any[],
    /** 竞价弹窗状态 */
    showBidModal: false,
    selectedBidProduct: null as any,
    userBidAmount: 0,
    bidHistory: [] as any[],
    bidMinAmount: 0,
    bidAmountValid: false,
    bidSubmitting: false,
    showBidRules: false,
    bidModalCountdown: ''
  },

  lifetimes: {
    attached() {
      this.loadBidProducts()
    },
    detached() {
      if ((this as any)._bidListTimer) {
        clearInterval((this as any)._bidListTimer)
        ;(this as any)._bidListTimer = null
      }
      if ((this as any)._bidModalTimer) {
        clearInterval((this as any)._bidModalTimer)
        ;(this as any)._bidModalTimer = null
      }
    }
  },

  observers: {
    refreshToken(val: number) {
      if (val > 0) {
        this.loadBidProducts()
      }
    }
  },

  methods: {
    /**
     * 加载竞价商品列表
     * 后端API: GET /api/v4/backpack/bid/products
     */
    async loadBidProducts() {
      bidLog.info('加载竞价商品列表...')
      try {
        const response = await bidGetBidProducts(1, 20, 'active')

        if (response && response.success && response.data) {
          const bidProducts = response.data.products || []
          bidLog.info(`获取了 ${bidProducts.length} 个竞价商品`)

          const INITIAL_TEN_MIN_MS = 10 * 60 * 1000
          const mappedProducts = bidProducts.map((item: any) => {
            const endTs = item.end_time
              ? typeof item.end_time === 'number'
                ? item.end_time
                : (bidUtils.safeParseDateString(item.end_time) || new Date(0)).getTime()
              : 0
            const remainingMs = endTs - Date.now()

            return {
              bid_product_id: item.bid_product_id,
              exchange_item_id: item.exchange_item_id,
              item_name: item.item_name || '',
              description: item.description || '',
              image: item.image_url || bidImageHelper.DEFAULT_PRODUCT_IMAGE,
              category: item.category || '',
              start_price: item.start_price || 0,
              current_price: item.current_price || 0,
              min_bid_increment: item.min_bid_increment || 1,
              price_asset_code: item.price_asset_code,
              status: item.status,
              start_time: item.start_time,
              end_time: item.end_time,
              bid_count: item.bid_count || 0,
              winner_user_id: item.winner_user_id,
              _countdownText: this._formatBidCountdown(item.end_time),
              _isEndingSoon:
                item.status === 'active' && remainingMs > 0 && remainingMs < INITIAL_TEN_MIN_MS
            }
          })

          this.setData({ biddingProducts: mappedProducts })
          this._startBidListCountdown()
        } else {
          bidLog.info('暂无竞价商品')
          this.setData({ biddingProducts: [] })
        }
      } catch (error) {
        bidLog.error('加载竞价商品失败:', error)
        this.setData({ biddingProducts: [] })
      }
    },

    /** 加载用户竞价历史 */
    async loadBidHistory() {
      try {
        const response = await bidGetBidHistory(1, 50)
        if (response && response.success && response.data) {
          this.setData({ bidHistory: response.data.records || [] })
        }
      } catch (error) {
        bidLog.error('加载竞价历史失败:', error)
      }
    },

    /** 竞价按钮点击 — 打开竞价弹窗 */
    async onBidTap(e: any) {
      const product = e.currentTarget.dataset.product
      if (product.status !== 'active') {
        bidShowToast(product.status === 'pending' ? '竞拍尚未开始' : '竞拍已结束')
        return
      }

      try {
        wx.vibrateShort({ type: 'light' })
      } catch (_e) {
        /* 设备不支持 */
      }

      try {
        const detailResponse = await bidGetBidProductDetail(product.bid_product_id)
        if (detailResponse && detailResponse.success && detailResponse.data) {
          const detail = detailResponse.data
          const currentMinBid = (detail.current_price || 0) + (detail.min_bid_increment || 1)
          this.setData({
            selectedBidProduct: {
              bid_product_id: detail.bid_product_id,
              item_name: detail.item_name || '',
              description: detail.description || '',
              image: detail.image_url || product.image || bidImageHelper.DEFAULT_PRODUCT_IMAGE,
              category: detail.category || '',
              start_price: detail.start_price || 0,
              current_price: detail.current_price || 0,
              min_bid_increment: detail.min_bid_increment || 1,
              price_asset_code: detail.price_asset_code,
              status: detail.status,
              end_time: detail.end_time,
              bid_count: detail.bid_count || 0
            },
            showBidModal: true,
            userBidAmount: currentMinBid,
            bidMinAmount: currentMinBid,
            bidAmountValid: true,
            bidSubmitting: false,
            showBidRules: false,
            bidModalCountdown: this._formatBidCountdown(detail.end_time)
          })
        } else {
          bidLog.error('获取竞价详情失败:', detailResponse && detailResponse.message)
          wx.showToast({ title: '获取竞价详情失败，请稍后重试', icon: 'none' })
        }
        this._startBidModalCountdown()
      } catch (error: any) {
        bidLog.error('获取竞价详情异常:', error.message)
        wx.showToast({ title: '获取竞价详情失败，请检查网络', icon: 'none' })
      }
    },

    /** 竞价商品图片加载失败 — 替换为占位图 */
    onBidImageError(e: any) {
      const index = e.currentTarget.dataset.index
      if (index !== undefined) {
        this.setData({ [`biddingProducts[${index}].image`]: bidImageHelper.DEFAULT_PRODUCT_IMAGE })
      } else {
        this.setData({ 'selectedBidProduct.image': bidImageHelper.DEFAULT_PRODUCT_IMAGE })
      }
    },

    /** 竞价金额输入 — 实时校验 */
    onBidAmountInput(e: any) {
      const inputAmount = parseFloat(e.detail.value) || 0
      const { selectedBidProduct } = this.data
      if (!selectedBidProduct) {
        return
      }
      const localMinBid =
        (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
      this.setData({
        userBidAmount: inputAmount,
        bidAmountValid: inputAmount >= localMinBid,
        bidMinAmount: localMinBid
      })
    },

    /** 快捷加价按钮 */
    onQuickBidAdd(e: any) {
      const addAmount = Number(e.currentTarget.dataset.amount) || 0
      const { selectedBidProduct, userBidAmount } = this.data
      if (!selectedBidProduct) {
        return
      }
      try {
        wx.vibrateShort({ type: 'light' })
      } catch (_e) {
        /* 设备不支持 */
      }
      const baseAmount =
        userBidAmount > 0
          ? userBidAmount
          : selectedBidProduct.current_price + selectedBidProduct.min_bid_increment
      const newAmount = baseAmount + addAmount
      const quickMinBid =
        (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
      this.setData({ userBidAmount: newAmount, bidAmountValid: newAmount >= quickMinBid })
    },

    /** 一键填入最低出价 */
    onSetMinBid() {
      const { selectedBidProduct } = this.data
      if (!selectedBidProduct) {
        return
      }
      const setMinBidAmount =
        (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
      this.setData({
        userBidAmount: setMinBidAmount,
        bidAmountValid: true,
        bidMinAmount: setMinBidAmount
      })
    },

    /** 切换竞价规则显示 */
    onToggleBidRules() {
      this.setData({ showBidRules: !this.data.showBidRules })
    },

    /**
     * 确认竞价
     * 后端API: POST /api/v4/backpack/bid
     */
    async onConfirmBid() {
      const { selectedBidProduct, userBidAmount, bidSubmitting } = this.data
      if (!selectedBidProduct || bidSubmitting) {
        return
      }

      const confirmMinBid =
        (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
      if (userBidAmount < confirmMinBid) {
        bidShowToast(`出价不能低于 ${confirmMinBid} ${selectedBidProduct.price_asset_code}`)
        return
      }

      wx.showModal({
        title: '确认竞价',
        content: `您将以 ${userBidAmount} ${selectedBidProduct.price_asset_code} 出价，资产将被冻结直到被超越或竞价结束。`,
        confirmText: '确认出价',
        cancelText: '再想想',
        success: async (modalRes: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
          if (!modalRes.confirm) {
            return
          }
          this.setData({ bidSubmitting: true })
          try {
            try {
              wx.vibrateShort({ type: 'medium' })
            } catch (_e) {
              /* 设备不支持 */
            }
            const response = await bidPlaceBid(selectedBidProduct.bid_product_id, userBidAmount)
            if (response && response.success) {
              try {
                wx.vibrateShort({ type: 'heavy' })
              } catch (_e) {
                /* 设备不支持 */
              }
              bidShowToast('竞价成功')
              this._stopBidModalCountdown()
              this.setData({
                showBidModal: false,
                selectedBidProduct: null,
                userBidAmount: 0,
                bidSubmitting: false,
                bidAmountValid: false
              })
              this.loadBidProducts()
              this.loadBidHistory()
              this.triggerEvent('bidcomplete', { bidData: response.data })
            }
          } catch (error: any) {
            bidLog.error('竞价失败:', error)
            this.setData({ bidSubmitting: false })
          }
        }
      })
    },

    /** 取消竞价弹窗 */
    onCancelBid() {
      this._stopBidModalCountdown()
      this.setData({
        showBidModal: false,
        selectedBidProduct: null,
        userBidAmount: 0,
        bidAmountValid: false,
        bidSubmitting: false
      })
    },

    /** 格式化竞价倒计时文本 */
    _formatBidCountdown(endTime: string | number | undefined): string {
      if (!endTime) {
        return ''
      }
      const now = Date.now()
      const endTimestamp =
        typeof endTime === 'number'
          ? endTime
          : (bidUtils.safeParseDateString(endTime) || new Date(0)).getTime()
      const diff = endTimestamp - now
      if (diff <= 0) {
        return '已结束'
      }
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      if (hours > 24) {
        return `${Math.floor(hours / 24)}天${hours % 24}时`
      }
      if (hours > 0) {
        return `${hours}时${minutes}分`
      }
      if (minutes > 0) {
        return `${minutes}分${seconds}秒`
      }
      return `${seconds}秒`
    },

    /** 启动竞价列表倒计时 */
    _startBidListCountdown() {
      if ((this as any)._bidListTimer) {
        clearInterval((this as any)._bidListTimer)
      }
      ;(this as any)._bidListTimer = setInterval(() => {
        const { biddingProducts } = this.data
        if (!biddingProducts || biddingProducts.length === 0) {
          clearInterval((this as any)._bidListTimer)
          ;(this as any)._bidListTimer = null
          return
        }
        let needsUpdate = false
        const TEN_MINUTES_MS = 10 * 60 * 1000
        const updatedProducts = biddingProducts.map((item: any) => {
          if (item.status === 'active' && item.end_time) {
            const newText = this._formatBidCountdown(item.end_time)
            const endTs =
              typeof item.end_time === 'number'
                ? item.end_time
                : (bidUtils.safeParseDateString(item.end_time) || new Date(0)).getTime()
            const remaining = endTs - Date.now()
            const endingSoon = remaining > 0 && remaining < TEN_MINUTES_MS
            if (newText !== item._countdownText || endingSoon !== item._isEndingSoon) {
              needsUpdate = true
              return { ...item, _countdownText: newText, _isEndingSoon: endingSoon }
            }
          }
          return item
        })
        if (needsUpdate) {
          this.setData({ biddingProducts: updatedProducts })
        }
      }, 1000)
    },

    /** 启动弹窗内倒计时 */
    _startBidModalCountdown() {
      this._stopBidModalCountdown()
      ;(this as any)._bidModalTimer = setInterval(() => {
        const { selectedBidProduct, showBidModal } = this.data
        if (!showBidModal || !selectedBidProduct || !selectedBidProduct.end_time) {
          this._stopBidModalCountdown()
          return
        }
        const countdownText = this._formatBidCountdown(selectedBidProduct.end_time)
        this.setData({ bidModalCountdown: countdownText })
        if (countdownText === '已结束') {
          this._stopBidModalCountdown()
          bidShowToast('竞拍已结束')
          this.setData({ showBidModal: false, selectedBidProduct: null, userBidAmount: 0 })
          this.loadBidProducts()
        }
      }, 1000)
    },

    /** 停止弹窗倒计时 */
    _stopBidModalCountdown() {
      if ((this as any)._bidModalTimer) {
        clearInterval((this as any)._bidModalTimer)
        ;(this as any)._bidModalTimer = null
      }
    },

    /** 对外暴露的刷新方法 */
    refresh() {
      this.loadBidProducts()
    }
  }
})
