/**
 * 商品兑换/双空间 Tab 处理方法 — 从 exchange.ts 拆分
 *
 * 包含：幸运空间（瀑布流）、臻选空间（混合布局）、竞价、空间筛选
 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * @file pages/exchange/exchange-shop-handlers.ts
 * @version 5.0.0
 * @since 2026-02-15
 */

const {
  API: shopAPI,
  Wechat: shopWechat,
  Constants: shopConstants,
  Logger: shopLogger,
  Waterfall: shopWaterfall,
  ProductFilter: shopProductFilter,
  Utils: shopUtils
} = require('../../utils/index')
const shopLog = shopLogger.createLogger('exchange-shop')
const {
  getExchangeProducts: shopGetExchangeProducts,
  getBidProducts: shopGetBidProducts,
  getBidProductDetail: shopGetBidProductDetail,
  placeBid: shopPlaceBid,
  getBidHistory: shopGetBidHistory
} = shopAPI
const { showToast: shopShowToast } = shopWechat
const { debounce: shopDebounce } = shopUtils
const { PAGINATION: SHOP_PAGINATION } = shopConstants

/**
 * 商品兑换/双空间 Tab 全部处理方法
 * 在 exchange.ts 中通过 ...shopHandlers 合并到 Page({})
 */
const shopHandlers = {
  // ============================================
  // 🔄 空间切换
  // ============================================

  /** 切换幸运空间/臻选空间 */
  async onSpaceChange(e: any) {
    const targetSpace = e.currentTarget.dataset.space
    shopLog.info(`🔄 切换空间: ${targetSpace}`)

    // 检查臻选空间解锁状态
    if (targetSpace === 'premium' && !this.data.premiumUnlockStatus.isUnlocked) {
      shopLog.info('🔒 臻选空间未解锁，尝试解锁...')
      this.handlePremiumUnlock()
      return
    }

    if (targetSpace === this.data.currentSpace) {
      shopLog.info('当前已在目标空间，无需切换')
      return
    }

    this.setData({ currentSpace: targetSpace })

    if (targetSpace === 'lucky') {
      await this.initLuckySpaceData()
    } else if (targetSpace === 'premium') {
      await this.initPremiumSpaceData()
    }

    shopLog.info(`✅ 已切换到空间: ${targetSpace}`)
  },

  // ============================================
  // 🍀 幸运空间（瀑布流布局）
  // ============================================

  /** 初始化幸运空间数据 */
  async initLuckySpaceData() {
    shopLog.info('🎁 初始化幸运空间数据（方案1瀑布流布局）...')

    try {
      this.setData({ loading: true })
      await this.initWaterfallLayout()

      const waterfallPageSize = this.data.waterfallPageSize || SHOP_PAGINATION.WATERFALL_SIZE
      // 参数顺序: getExchangeProducts(space, category, page, limit)
      const response = await shopGetExchangeProducts('lucky', null, 1, waterfallPageSize)
      shopLog.info('📦 API返回数据:', { space: 'lucky', page: 1, pageSize: waterfallPageSize })

      if (response && response.success && response.data) {
        const products = response.data.products || []
        shopLog.info(`✅ 获取到 ${products.length} 个商品`)

        if (products.length < 1) {
          shopLog.info('⚠️ API返回商品数量不足')
          this.setData({
            luckySpaceProducts: [],
            errorMessage: '暂无商品数据',
            errorDetail: '后端商品数据不足，请联系管理员添加商品',
            hasError: true
          })
          return
        }

        const waterfallProducts = this.convertToWaterfallData(products) || []
        shopLog.info(`🌊 转换为瀑布流数据: ${waterfallProducts.length} 个`)
        const layoutProducts = this.calculateWaterfallLayout(waterfallProducts) || []
        shopLog.info(`📐 计算布局完成: ${layoutProducts.length} 个`)

        this.setData({
          waterfallProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckyFilteredProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckySpaceStats: {
            new_count: products.length,
            avg_discount: this.calculateAvgDiscount(products),
            flash_deals: products.filter((p: any) => p.is_hot).length
          },
          containerHeight: Math.max(...this.data.columnHeights) || 500,
          loading: false,
          luckySearchKeyword: '',
          luckyCurrentFilter: 'all',
          luckyCategoryFilter: 'all',
          luckyPointsRange: 'all',
          luckyStockFilter: 'all',
          luckySortBy: 'default',
          showLuckyAdvancedFilter: false
        })

        shopLog.info('✅ 幸运空间数据初始化完成')
      } else {
        shopLog.info('❌ API返回失败')
        this.setErrorState('加载商品失败', '幸运空间接口调用失败，请稍后重试')
      }
    } catch (error) {
      shopLog.error('❌ 幸运空间初始化失败:', error)
      this.setErrorState('系统错误', '幸运空间初始化失败，请联系开发者')
    }
  },

  /** 初始化瀑布流布局配置 */
  async initWaterfallLayout() {
    shopLog.info('🔑 初始化瀑布流布局配置')

    try {
      let systemInfo: Record<string, any> = {}
      try {
        const deviceInfo = wx.getDeviceInfo()
        const windowInfo = wx.getWindowInfo()
        const appBaseInfo = wx.getAppBaseInfo()
        systemInfo = { ...deviceInfo, ...windowInfo, ...appBaseInfo }
      } catch (error) {
        shopLog.error('❌ 获取系统信息失败:', error)
        systemInfo = { windowWidth: 375, windowHeight: 667 }
      }

      const containerWidth = (systemInfo.windowWidth || 375) - 48
      this.setData({ containerWidth, columnHeights: [0, 0], cardGap: 15, cardPadding: 24 })
      shopLog.info('✅ 瀑布流布局配置完成:', {
        screenWidth: systemInfo.windowWidth,
        containerWidth,
        cardGap: this.data.cardGap
      })
    } catch (error) {
      shopLog.error('❌ 初始化瀑布流布局失败:', error)
      this.setData({ containerWidth: 327, columnHeights: [0, 0], cardGap: 15, cardPadding: 24 })
    }
  },

  /** 计算瀑布流布局（委托给 utils/waterfall.ts） */
  calculateWaterfallLayout(products: any) {
    const result = shopWaterfall.calculateWaterfallLayout(products, {
      containerWidth: this.data.containerWidth || 327,
      cardGap: this.data.cardGap || 15
    })
    this.setData({ columnHeights: result.columnHeights })
    return result.layoutProducts
  },

  /** 计算商品卡片内容高度（委托给 utils/waterfall.ts） */
  calculateContentHeight(product: any) {
    return shopWaterfall.calculateContentHeight(product)
  },

  // ============================================
  // 💎 臻选空间（混合布局）
  // ============================================

  /**
   * 初始化臻选空间数据（含竞价商品）
   * 并行加载臻选商品列表 + 竞价商品列表
   */
  async initPremiumSpaceData() {
    shopLog.info('💎 初始化臻选空间数据（含竞价商品）...')

    try {
      this.setData({ loading: true })

      /* 并行加载: 臻选商品 + 竞价商品 */
      const [exchangeResponse] = await Promise.all([
        shopGetExchangeProducts('premium', null, 1, 30),
        this.loadBidProducts()
      ])

      if (exchangeResponse && exchangeResponse.success && exchangeResponse.data) {
        const products = exchangeResponse.data.products || []

        const carouselItems = products.slice(0, 5).map((item: any, index: number) => ({
          id: item.id,
          title: item.name,
          subtitle: item.description,
          image: item.image,
          price: item.exchange_points,
          /* original_price、discount、rating 由后端返回，前端不自行计算 */
          originalPrice: item.original_price || null,
          discount: item.discount || 0,
          rating: item.rating || 0,
          background: this.getCarouselBackground(index),
          tags: item.tags || []
        }))

        const cardSections = this.createCardSections(products.slice(5, 20))
        const listProducts = products.slice(20).map((item: any) => ({
          ...item,
          showDescription: true,
          showSeller: !!item.seller
          /* seller、hasWarranty、freeShipping 等字段应由后端在商品详情中返回 */
        }))

        this.setData({
          carouselItems,
          cardSections,
          listProducts,
          premiumSpaceStats: {
            hot_count: products.filter((p: any) => p.is_hot).length,
            /* avg_rating、trending_count 应由后端统计接口返回 */
            avg_rating: exchangeResponse.data.avg_rating || 0,
            trending_count: exchangeResponse.data.trending_count || products.length
          },
          loading: false
        })

        shopLog.info('✅ 臻选空间数据初始化完成')
      } else {
        shopLog.info('ℹ️ 臻选空间商品为空（后端尚未配置premium商品）')
        this.setData({ loading: false })
        /* 即使臻选商品为空，竞价商品仍然可展示 */
      }
    } catch (error) {
      shopLog.error('❌ 臻选空间初始化失败:', error)
      this.setErrorState('系统错误', '臻选空间初始化失败，请联系开发者')
    }
  },

  /**
   * 加载臻选空间商品（解锁后刷新专用）
   * 后端API: GET /api/v4/backpack/exchange/items?space=premium
   */
  async loadPremiumProducts() {
    shopLog.info('💎 解锁后刷新臻选空间商品...')
    await this.initPremiumSpaceData()
  },

  /**
   * 检查臻选空间解锁状态
   * 后端API: GET /api/v4/backpack/exchange/premium-status
   * 业务规则: 100积分费用、历史积分10万门槛、24小时有效期
   */
  async checkPremiumUnlockStatus() {
    try {
      const result = await shopAPI.getPremiumStatus()
      if (result && result.success && result.data) {
        const status = result.data
        this.setData({
          premiumUnlocked: !!status.is_unlocked,
          premiumExpiresAt: status.unlock_expires_at || '',
          premiumRequiredPoints: status.required_total_points || 0,
          premiumCurrentPoints: status.current_total_points || 0,
          premiumUnlockCost: status.unlock_cost || 0
        })
        shopLog.info('✅ 臻选空间解锁状态:', status)
      }
    } catch (error) {
      shopLog.error('❌ 查询臻选空间解锁状态失败:', error)
    }
  },

  /**
   * 处理臻选空间解锁（用户点击解锁按钮）
   * 后端API: POST /api/v4/backpack/exchange/unlock-premium
   */
  async handlePremiumUnlock() {
    /* 先检查最新解锁状态 */
    await this.checkPremiumUnlockStatus()

    if (this.data.premiumUnlocked) {
      shopShowToast('臻选空间已解锁')
      return
    }

    /* 积分门槛未达标时提示 */
    if (this.data.premiumCurrentPoints < this.data.premiumRequiredPoints) {
      wx.showModal({
        title: '积分不足',
        content: `臻选空间需要历史积分达到${this.data.premiumRequiredPoints}才可解锁，您当前历史积分为${this.data.premiumCurrentPoints}`,
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    /* 确认扣费解锁 */
    wx.showModal({
      title: '解锁臻选空间',
      content: `解锁需消耗${this.data.premiumUnlockCost}积分，有效期24小时，是否确认？`,
      confirmText: '确认解锁',
      cancelText: '再想想',
      success: async (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (res.confirm) {
          await this.unlockPremiumSpace()
        }
      }
    })
  },

  /**
   * 解锁臻选空间（执行解锁请求）
   * 后端API: POST /api/v4/backpack/exchange/unlock-premium
   */
  async unlockPremiumSpace() {
    try {
      const result = await shopAPI.unlockPremium()
      if (result && result.success && result.data) {
        this.setData({
          premiumUnlocked: true,
          premiumExpiresAt: result.data.unlock_expires_at || ''
        })
        shopShowToast('🎉 臻选空间解锁成功！')
        shopLog.info('✅ 臻选空间解锁成功:', result.data)
        /* 解锁后刷新臻选空间商品列表 */
        this.loadPremiumProducts()
      }
    } catch (error: any) {
      shopLog.error('❌ 臻选空间解锁失败:', error)
      shopShowToast(error.message || '解锁失败，请稍后重试')
    }
  },

  /** 初始化布局参数 */
  initLayoutParams() {
    try {
      const res = wx.getWindowInfo()
      const containerWidth = res.windowWidth - 40
      const columnWidth = Math.floor((containerWidth - 20) / 2)
      this.setData({ containerWidth, columnWidth })
      shopLog.info('✅ 布局参数初始化完成:', {
        windowWidth: res.windowWidth,
        containerWidth,
        columnWidth
      })
    } catch (err) {
      shopLog.error('❌ 获取窗口信息失败:', err)
      this.setData({ containerWidth: 335, columnWidth: 157 })
    }
  },

  /** 轮播图变化事件 */
  onCarouselChange(e: any) {
    this.setData({ carouselActiveIndex: e.detail.current })
  },

  // ============================================
  // 🎯 竞价功能（后端API: /api/v4/backpack/bid/*）
  // ============================================

  /**
   * 加载竞价商品列表
   * 后端API: GET /api/v4/backpack/bid/products
   * 竞价商品展示在臻选空间中，使用 DIAMOND（钻石）或 red_shard（红色碎片）出价
   */
  async loadBidProducts() {
    shopLog.info('🎯 加载竞价商品列表...')
    try {
      const response = await shopGetBidProducts(1, 20, 'active')

      if (response && response.success && response.data) {
        const bidProducts = response.data.products || []
        shopLog.info(`✅ 获取到 ${bidProducts.length} 个竞价商品`)

        const mappedProducts = bidProducts.map((item: any) => ({
          bid_product_id: item.bid_product_id,
          exchange_item_id: item.exchange_item_id,
          name: item.name,
          description: item.description,
          image: item.image_url || '/images/products/default-product.png',
          category: item.category || '',
          starting_price: item.starting_price || 0,
          current_price: item.current_price || 0,
          min_bid_increment: item.min_bid_increment || 1,
          asset_code: item.asset_code || 'DIAMOND',
          status: item.status,
          start_time: item.start_time,
          end_time: item.end_time,
          bid_count: item.bid_count || 0,
          highest_bidder_id: item.highest_bidder_id,
          /* 计算倒计时文本（初始化时计算一次，定时器会持续更新） */
          _countdownText: this._formatBidCountdown(item.end_time)
        }))

        this.setData({ biddingProducts: mappedProducts })

        /* 启动竞价列表倒计时定时器 */
        this._startBidListCountdown()
      } else {
        shopLog.info('ℹ️ 暂无竞价商品或API返回空数据')
        this.setData({ biddingProducts: [] })
      }
    } catch (error) {
      shopLog.error('❌ 加载竞价商品失败:', error)
      this.setData({ biddingProducts: [] })
    }
  },

  /**
   * 加载用户竞价历史
   * 后端API: GET /api/v4/backpack/bid/history
   */
  async loadBidHistory() {
    shopLog.info('📋 加载竞价历史...')
    try {
      const response = await shopGetBidHistory(1, 50)
      if (response && response.success && response.data) {
        const records = response.data.records || []
        this.setData({ bidHistory: records })
        shopLog.info(`✅ 获取到 ${records.length} 条竞价历史`)
      }
    } catch (error) {
      shopLog.error('❌ 加载竞价历史失败:', error)
      this.setData({ bidHistory: [] })
    }
  },

  /**
   * 竞价按钮点击 - 打开竞价弹窗并加载商品详情
   * 增加震动反馈和实时校验状态初始化
   */
  async onBidTap(e: any) {
    const product = e.currentTarget.dataset.product
    shopLog.info('🏷️ 点击竞价:', product)

    /* 仅允许 active 状态的商品出价 */
    if (product.status !== 'active') {
      shopShowToast(product.status === 'pending' ? '竞拍尚未开始' : '竞拍已结束')
      return
    }

    /* 轻触震动反馈 */
    try { wx.vibrateShort({ type: 'light' }) } catch (_vibrateErr) { /* 忽略不支持的设备 */ }

    /* 先从后端获取最新的竞价商品详情（确保价格是实时的） */
    try {
      const detailResponse = await shopGetBidProductDetail(product.bid_product_id)
      if (detailResponse && detailResponse.success && detailResponse.data) {
        const detail = detailResponse.data
        const currentMinBid = (detail.current_price || 0) + (detail.min_bid_increment || 1)

        this.setData({
          selectedBidProduct: {
            bid_product_id: detail.bid_product_id,
            name: detail.name,
            description: detail.description,
            image: detail.image_url || product.image || '/images/products/default-product.png',
            category: detail.category || '',
            starting_price: detail.starting_price || 0,
            current_price: detail.current_price || 0,
            min_bid_increment: detail.min_bid_increment || 1,
            asset_code: detail.asset_code || 'DIAMOND',
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
        /* 详情获取失败时使用列表数据 */
        const fallbackMinBid = (product.current_price || 0) + (product.min_bid_increment || 1)
        this.setData({
          selectedBidProduct: product,
          showBidModal: true,
          userBidAmount: fallbackMinBid,
          bidMinAmount: fallbackMinBid,
          bidAmountValid: true,
          bidSubmitting: false,
          showBidRules: false,
          bidModalCountdown: this._formatBidCountdown(product.end_time)
        })
      }

      /* 启动弹窗内倒计时 */
      this._startBidModalCountdown()
    } catch (error) {
      shopLog.error('❌ 获取竞价详情失败，使用列表数据:', error)
      const errorMinBid = (product.current_price || 0) + (product.min_bid_increment || 1)
      this.setData({
        selectedBidProduct: product,
        showBidModal: true,
        userBidAmount: errorMinBid,
        bidMinAmount: errorMinBid,
        bidAmountValid: true,
        bidSubmitting: false,
        showBidRules: false,
        bidModalCountdown: this._formatBidCountdown(product.end_time)
      })
      this._startBidModalCountdown()
    }
  },

  /**
   * 竞价金额输入 - 实时校验并更新状态
   * 输入金额 ≥ 最低出价时显示绿色✓，否则显示红色提示
   */
  onBidAmountInput(e: any) {
    const inputAmount = parseFloat(e.detail.value) || 0
    const { selectedBidProduct } = this.data
    if (!selectedBidProduct) return

    const localMinBid = (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
    this.setData({
      userBidAmount: inputAmount,
      bidAmountValid: inputAmount >= localMinBid,
      bidMinAmount: localMinBid
    })
  },

  /**
   * 快捷加价按钮
   * 在当前出价基础上增加固定金额，提升竞价操作效率
   */
  onQuickBidAdd(e: any) {
    const addAmount = Number(e.currentTarget.dataset.amount) || 0
    const { selectedBidProduct, userBidAmount } = this.data
    if (!selectedBidProduct) return

    /* 震动反馈 */
    try { wx.vibrateShort({ type: 'light' }) } catch (_vibErr) { /* 静默 */ }

    const baseAmount =
      userBidAmount > 0
        ? userBidAmount
        : selectedBidProduct.current_price + selectedBidProduct.min_bid_increment

    const newAmount = baseAmount + addAmount
    const quickMinBid = (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
    this.setData({
      userBidAmount: newAmount,
      bidAmountValid: newAmount >= quickMinBid
    })
  },

  /** 一键填入最低出价 */
  onSetMinBid() {
    const { selectedBidProduct } = this.data
    if (!selectedBidProduct) return

    const setMinBidAmount = (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
    this.setData({
      userBidAmount: setMinBidAmount,
      bidAmountValid: true,
      bidMinAmount: setMinBidAmount
    })
  },

  /** 切换竞价规则显示/隐藏 */
  onToggleBidRules() {
    this.setData({ showBidRules: !this.data.showBidRules })
  },

  /**
   * 确认竞价 - 调用后端 POST /api/v4/backpack/bid
   * 后端 placeBid() 完整流程:
   *   资产白名单校验 → 悲观锁定 → 金额校验 → 旧冻结解冻 → 新金额冻结 → 更新出价记录 → 更新最高价
   */
  async onConfirmBid() {
    const { selectedBidProduct, userBidAmount, bidSubmitting } = this.data

    if (!selectedBidProduct) {
      shopShowToast('请选择竞价商品')
      return
    }

    /* 防止重复提交 */
    if (bidSubmitting) return

    /* 前端基础校验（后端会做完整校验，这里是提前拦截明显错误） */
    const confirmMinBid =
      (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
    if (userBidAmount < confirmMinBid) {
      shopShowToast(`出价不能低于 ${confirmMinBid} ${selectedBidProduct.asset_code || 'DIAMOND'}`)
      return
    }

    /* 二次确认弹窗 */
    wx.showModal({
      title: '确认竞价',
      content: `您将以 ${userBidAmount} ${selectedBidProduct.asset_code || 'DIAMOND'} 出价，资产将被冻结直到被超越或竞价结束。`,
      confirmText: '确认出价',
      cancelText: '再想想',
      success: async (modalRes: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!modalRes.confirm) return

        this.setData({ bidSubmitting: true })

        try {
          /* 提交时震动反馈 */
          try { wx.vibrateShort({ type: 'medium' }) } catch (_e) { /* 静默 */ }

          shopLog.info('🎯 提交竞价:', {
            bid_product_id: selectedBidProduct.bid_product_id,
            bid_amount: userBidAmount,
            asset_code: selectedBidProduct.asset_code || 'DIAMOND'
          })

          const response = await shopPlaceBid(
            selectedBidProduct.bid_product_id,
            userBidAmount,
            selectedBidProduct.asset_code || 'DIAMOND'
          )

          if (response && response.success) {
            shopLog.info('✅ 竞价成功:', response.data)

            /* 成功震动 */
            try { wx.vibrateShort({ type: 'heavy' }) } catch (_e) { /* 静默 */ }

            shopShowToast('🎉 竞价成功！')
            this._stopBidModalCountdown()
            this.setData({
              showBidModal: false,
              selectedBidProduct: null,
              userBidAmount: 0,
              bidSubmitting: false,
              bidAmountValid: false
            })

            /* 竞价成功后刷新竞价商品列表和历史 */
            this.loadBidProducts()
            this.loadBidHistory()
          }
        } catch (error: any) {
          shopLog.error('❌ 竞价失败:', error)
          this.setData({ bidSubmitting: false })
          /* 后端返回的错误信息已由 APIClient.showError 自动展示 */
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

  // ============================================
  // ⏱ 竞价倒计时工具方法
  // ============================================

  /**
   * 格式化竞价倒计时文本
   * @param endTime - 竞价结束时间（ISO字符串或时间戳）
   * @returns 格式化后的倒计时文本，如 "2时30分" / "15分32秒" / "已结束"
   */
  _formatBidCountdown(endTime: string | number | undefined): string {
    if (!endTime) return ''
    const now = Date.now()
    const endTimestamp = typeof endTime === 'number' ? endTime : new Date(endTime).getTime()
    const diff = endTimestamp - now

    if (diff <= 0) return '已结束'

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}天${hours % 24}时`
    }
    if (hours > 0) return `${hours}时${minutes}分`
    if (minutes > 0) return `${minutes}分${seconds}秒`
    return `${seconds}秒`
  },

  /**
   * 启动竞价列表倒计时（每秒更新卡片上的倒计时文本）
   * 使用 _bidListTimer 存储定时器ID，避免重复启动
   */
  _startBidListCountdown() {
    /* 先清理旧定时器 */
    if (this._bidListTimer) {
      clearInterval(this._bidListTimer)
      this._bidListTimer = null
    }

    this._bidListTimer = setInterval(() => {
      const { biddingProducts } = this.data
      if (!biddingProducts || biddingProducts.length === 0) {
        clearInterval(this._bidListTimer)
        this._bidListTimer = null
        return
      }

      let needsUpdate = false
      const updatedProducts = biddingProducts.map((item: any) => {
        if (item.status === 'active' && item.end_time) {
          const newText = this._formatBidCountdown(item.end_time)
          if (newText !== item._countdownText) {
            needsUpdate = true
            return { ...item, _countdownText: newText }
          }
        }
        return item
      })

      if (needsUpdate) {
        this.setData({ biddingProducts: updatedProducts })
      }
    }, 1000)
  },

  /**
   * 启动弹窗内倒计时（每秒更新弹窗内的倒计时显示）
   * 使用 _bidModalTimer 存储定时器ID
   */
  _startBidModalCountdown() {
    this._stopBidModalCountdown()

    this._bidModalTimer = setInterval(() => {
      const { selectedBidProduct, showBidModal } = this.data
      if (!showBidModal || !selectedBidProduct || !selectedBidProduct.end_time) {
        this._stopBidModalCountdown()
        return
      }

      const countdownText = this._formatBidCountdown(selectedBidProduct.end_time)
      this.setData({ bidModalCountdown: countdownText })

      /* 竞价已结束时自动关闭弹窗 */
      if (countdownText === '已结束') {
        this._stopBidModalCountdown()
        shopShowToast('竞拍已结束')
        this.setData({
          showBidModal: false,
          selectedBidProduct: null,
          userBidAmount: 0
        })
        this.loadBidProducts()
      }
    }, 1000)
  },

  /** 停止弹窗倒计时 */
  _stopBidModalCountdown() {
    if (this._bidModalTimer) {
      clearInterval(this._bidModalTimer)
      this._bidModalTimer = null
    }
  },

  /** 刷新市场数据（根据当前空间类型） */
  async refreshMarketData() {
    if (this.data.currentSpace === 'lucky') {
      await this.initLuckySpaceData()
    } else if (this.data.currentSpace === 'premium') {
      await this.initPremiumSpaceData()
    }
  },

  // ============================================
  // 🛠️ 数据转换和工具方法
  // ============================================

  /** 转换商品数据为瀑布流格式（仅使用后端真实数据） */
  convertToWaterfallData(products: any) {
    if (!products || !Array.isArray(products)) {
      shopLog.warn('⚠️ convertToWaterfallData: 传入的products无效，返回空数组')
      return []
    }
    try {
      return products
        .map((item: any, index: number) => {
          if (!item || typeof item !== 'object') {
            shopLog.warn(`⚠️ convertToWaterfallData: 第${index}个商品数据无效:`, item)
            return null
          }
          if (!item.name || !item.id) {
            shopLog.warn(`⚠️ 商品数据不完整，缺少必要字段，跳过索引 ${index}: `, item)
            return null
          }
          // 从后端API读取snake_case字段 → 转换为前端展示层camelCase
          return {
            id: item.id,
            name: item.name,
            image: item.image_url || item.image || '/images/products/default-product.png',
            price: item.exchange_points || 0,
            originalPrice: item.original_price || null,
            discount: item.discount || 0,
            rating: item.rating || null,
            sales: item.sales || 0,
            tags: item.tags || [],
            isLucky: item.is_lucky || false,
            isHot: item.is_hot || false,
            isNew: item.is_new || false,
            seller: item.seller || null,
            imageRatio: item.image_ratio || 1.0,
            createdAt: item.created_at || '',
            description: item.description || '',
            stock: item.stock || 0,
            category: item.category || ''
          }
        })
        .filter(Boolean)
    } catch (error) {
      shopLog.error('❌ convertToWaterfallData 转换失败:', error)
      return []
    }
  },

  /**
   * 计算平均折扣
   * 🔴 折扣数据应由后端在商品列表接口中统计返回
   * 📋 待后端实现: GET /api/v4/backpack/exchange/items 响应中增加 avg_discount 字段
   */
  calculateAvgDiscount(products: any) {
    if (!products || products.length === 0) {
      return 0
    }
    // 使用后端返回的discount字段计算，不使用前端硬编码倍率
    const validProducts = products.filter((p: any) => p.discount && p.discount > 0)
    if (validProducts.length === 0) {
      return 0
    }
    const totalDiscount = validProducts.reduce(
      (sum: number, product: any) => sum + (product.discount || 0),
      0
    )
    return Math.floor(totalDiscount / validProducts.length)
  },

  /**
   * 创建卡片分组（使用后端返回的真实数据，不使用Math.random模拟数据）
   * 分组依据后端返回的 is_hot / is_new / category 等字段
   */
  createCardSections(products: any[]) {
    // UI常量: 分组展示配置（视觉呈现，前端可自主决定）
    const sections = [
      {
        id: 'hot',
        title: '🔥 热销爆款',
        subtitle: '限时特惠，抢完即止',
        icon: '🔥',
        backgroundColor: 'linear-gradient(135deg, #ff6b35, #f7931e)',
        titleColor: '#fff',
        products: products.slice(0, 5)
      },
      {
        id: 'new',
        title: '✨ 新品首发',
        subtitle: '新鲜上架，抢先体验',
        icon: '✨',
        backgroundColor: 'linear-gradient(135deg, #667eea, #764ba2)',
        titleColor: '#fff',
        products: products.slice(5, 10)
      },
      {
        id: 'premium',
        title: '💎 品质臻选',
        subtitle: '精心挑选，品质保证',
        icon: '💎',
        backgroundColor: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
        titleColor: '#fff',
        products: products.slice(10, 15)
      }
    ]
    // 直接使用后端返回的字段，不用Math.random()生成假数据
    return sections.map(section => ({
      ...section,
      products: section.products.map((product: any) => ({
        ...product,
        discount: product.discount || 0,
        isHot: product.is_hot || false,
        isNew: product.is_new || false,
        sellPoint: product.sell_point || ''
      }))
    }))
  },

  /** 获取轮播背景色 */
  getCarouselBackground(index: number) {
    const backgrounds = [
      'linear-gradient(135deg, #667eea, #764ba2)',
      'linear-gradient(135deg, #f093fb, #f5576c)',
      'linear-gradient(135deg, #4facfe, #00f2fe)',
      'linear-gradient(135deg, #43e97b, #38f9d7)',
      'linear-gradient(135deg, #fa709a, #fee140)'
    ]
    return backgrounds[index % backgrounds.length]
  },

  // ============================================
  // 🔍 幸运空间搜索和筛选
  // ============================================

  /** 幸运空间搜索输入处理（500ms防抖） */
  onLuckySearchInput: shopDebounce(function (e: any) {
    const keyword = e.detail.value.trim()
    shopLog.info('🔍 幸运空间搜索关键词:', keyword)
    this.setData({ luckySearchKeyword: keyword })
    this.applyLuckyFilters()
  }, 500),

  /** 幸运空间筛选条件变更 */
  onLuckyFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    shopLog.info('🔍 幸运空间切换筛选:', filter)
    this.setData({ luckyCurrentFilter: filter })
    this.applyLuckyFilters()
  },

  /** 切换幸运空间高级筛选面板 */
  onToggleLuckyAdvancedFilter() {
    const { showLuckyAdvancedFilter } = this.data
    shopLog.info('🔍 切换幸运空间高级筛选:', !showLuckyAdvancedFilter)
    this.setData({ showLuckyAdvancedFilter: !showLuckyAdvancedFilter })
  },

  /** 幸运空间分类筛选变更 */
  onLuckyCategoryFilterChange(e: any) {
    const category = e.currentTarget.dataset.category
    shopLog.info('🔍 幸运空间切换分类筛选:', category)
    this.setData({ luckyCategoryFilter: category })
    this.applyLuckyFilters()
  },

  /** 幸运空间积分范围筛选变更 */
  onLuckyPointsRangeChange(e: any) {
    const range = e.currentTarget.dataset.range
    shopLog.info('🔍 幸运空间切换积分范围:', range)
    this.setData({ luckyPointsRange: range })
    this.applyLuckyFilters()
  },

  /** 幸运空间排序方式变更 */
  onLuckySortByChange(e: any) {
    const sort = e.currentTarget.dataset.sort
    shopLog.info('🔍 幸运空间切换排序:', sort)
    this.setData({ luckySortBy: sort })
    this.applyLuckyFilters()
  },

  /** 幸运空间库存状态筛选 */
  onLuckyStockFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    shopLog.info(`🔍 幸运空间库存状态筛选: ${filter}`)
    this.setData({ luckyStockFilter: filter })
    this.applyLuckyFilters()
  },

  /** 重置幸运空间所有筛选条件 */
  onResetLuckyFilters() {
    shopLog.info('🔄 重置幸运空间所有筛选条件')
    this.setData({
      luckySearchKeyword: '',
      luckyCurrentFilter: 'all',
      luckyCategoryFilter: 'all',
      luckyPointsRange: 'all',
      luckyStockFilter: 'all',
      luckySortBy: 'default',
      showLuckyAdvancedFilter: false
    })
    this.applyLuckyFilters()
    shopShowToast({ title: '✅ 筛选已重置', icon: 'success' })
  },

  /** 应用幸运空间筛选条件（委托给 utils/product-filter.ts + utils/waterfall.ts） */
  applyLuckyFilters() {
    const {
      waterfallProducts,
      luckySearchKeyword,
      luckyCurrentFilter,
      luckyCategoryFilter,
      luckyPointsRange,
      luckyStockFilter,
      luckySortBy,
      totalPoints
    } = this.data

    const filterResult = shopProductFilter.applyProductFilters(waterfallProducts, {
      searchKeyword: luckySearchKeyword,
      currentFilter: luckyCurrentFilter,
      categoryFilter: luckyCategoryFilter,
      pointsRange: luckyPointsRange,
      stockFilter: luckyStockFilter,
      sortBy: luckySortBy,
      totalPoints,
      priceField: 'price'
    })

    const layoutProducts = this.calculateWaterfallLayout(filterResult.filtered)
    this.setData({
      luckyFilteredProducts: layoutProducts,
      containerHeight: Math.max(...this.data.columnHeights) || 500
    })
  }
}

module.exports = shopHandlers

export {}
