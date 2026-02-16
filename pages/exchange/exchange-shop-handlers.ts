/**
 * 商品兑换/双空Tab 处理方法 exchange.ts 拆分
 *
 * 包含：幸运空间（瀑布流）、臻选空间（混合布局）、竞价、空间筛 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * 后端API对齐 v2.0:
 *   - exchange_items 表字符 exchange_item_id, item_name, cost_asset_code, cost_amount, primary_image_id
 *   - bid_products 表字符 bid_product_id, start_price, current_price, price_asset_code, winner_user_id
 *   - premium-status 响应（已解锁 unlocked, is_valid, unlock_cost, validity_hours, remaining_hours, total_unlock_count
 *   - premium-status 响应（未解锁 unlocked, is_expired, can_unlock, unlock_cost, validity_hours, conditions
 *   - getExchangeProducts 响应: { items: [...] }（字段名items，不products *
 * @file pages/exchange/exchange-shop-handlers.ts
 * @version 5.2.0
 * @since 2026-02-16
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
 * 商品兑换/双空Tab 全部处理方法
 * exchange.ts 中通过 ...shopHandlers 合并Page({})
 */
const shopHandlers = {
  // ============================================
  // 🔄 空间切换
  // ============================================

  /** 切换幸运空间/臻选空间?*/
  async onSpaceChange(e: any) {
    const targetSpace = e.currentTarget.dataset.space
    shopLog.info(`🔄 切换空间: ${targetSpace}`)

    // 检查臻选空间解锁状态
    if (targetSpace === 'premium' && !this.data.premiumUnlocked) {
      shopLog.info('🔒 臻选空间未解锁，尝试解锁..')
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
  // 🍀 幸运空间（瀑布流布局  // ============================================

  /**
   * 初始化幸运空间数据   * 后端API: GET /api/v4/backpack/exchange/items?space=lucky
   * 响应: { items: ExchangeItem[], pagination: {...} }
   */
  async initLuckySpaceData() {
    shopLog.info('🎁 初始化幸运空间数据（方案1瀑布流布局）...')

    try {
      this.setData({ loading: true })
      await this.initWaterfallLayout()

      const waterfallPageSize = this.data.waterfallPageSize || SHOP_PAGINATION.WATERFALL_SIZE

      // 参数已改为对象形式，对齐后端 getExchangeProducts 新签
      const response = await shopGetExchangeProducts({
        space: 'lucky',
        page: 1,
        page_size: waterfallPageSize
      })
      shopLog.info('📦 API返回数据:', { space: 'lucky', page: 1, page_size: waterfallPageSize })

      if (response && response.success && response.data) {
        // ⚠️ 后端返回字段名是 items（不products
        const items = response.data.items || []
        shopLog.info(`✅ 获取了 ${items.length} 个商品`)

        if (items.length < 1) {
          shopLog.info('⚠️ API返回商品数量不足')
          this.setData({
            luckySpaceProducts: [],
            errorMessage: '暂无商品数据',
            errorDetail: '后端商品数据不足，请联系管理员添加商品',
            hasError: true,
            loading: false
          })
          return
        }

        const waterfallProducts = this.convertToWaterfallData(items) || []
        shopLog.info(`🌊 转换为瀑布流数据 ${waterfallProducts.length} 个`)
        const layoutResult = this.calculateWaterfallLayout(waterfallProducts) || { layoutProducts: [], columnHeights: [0, 0], containerHeight: 500 }
        const layoutProducts = layoutResult.layoutProducts || []
        shopLog.info(`📐 计算布局完成: ${layoutProducts.length} 个, 容器高度: ${layoutResult.containerHeight}px`)

        this.setData({
          waterfallProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckyFilteredProducts: Array.isArray(layoutProducts) ? layoutProducts : [],
          luckySpaceStats: {
            new_count: items.length,
            /* avg_discount 应由后端统计返回，前端不自行计算 */
            avg_discount: 0,
            flash_deals: items.filter((p: any) => p.is_hot).length
          },
          /* 直接使用布局计算返回的 containerHeight，避免 setData 异步读取旧值 */
          containerHeight: layoutResult.containerHeight || 500,
          columnHeights: layoutResult.columnHeights || [0, 0],
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
      shopLog.error('❌ 幸运空间初始化失败', error)
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

  /**
   * 计算瀑布流布局（委托给 utils/waterfall.ts）
   * 返回完整的布局结果，包括 layoutProducts、columnHeights、containerHeight
   */
  calculateWaterfallLayout(products: any) {
    const result = shopWaterfall.calculateWaterfallLayout(products, {
      containerWidth: this.data.containerWidth || 327,
      cardGap: this.data.cardGap || 15
    })
    // 同步更新 columnHeights 到 data
    this.setData({ columnHeights: result.columnHeights })
    // 返回完整结果，调用方可获取 containerHeight
    return result
  },

  /** 计算商品卡片内容高度（委托给 utils/waterfall.ts?*/
  calculateContentHeight(product: any) {
    return shopWaterfall.calculateContentHeight(product)
  },

  // ============================================
  // 💎 臻选空间（混合布局  // ============================================

  /**
   * 初始化臻选空间数据（含竞价商品）
   * 并行加载臻选商品列+ 竞价商品列表
   * 后端API: GET /api/v4/backpack/exchange/items?space=premium
   */
  async initPremiumSpaceData() {
    shopLog.info('💎 初始化臻选空间数据（含竞价商品）...')

    try {
      this.setData({ loading: true })

      /* 并行加载: 臻选商品?+ 竞价商品 */
      const [exchangeResponse] = await Promise.all([
        shopGetExchangeProducts({ space: 'premium', page: 1, page_size: 30 }),
        this.loadBidProducts()
      ])

      if (exchangeResponse && exchangeResponse.success && exchangeResponse.data) {
        // ⚠️ 后端返回字段名是 items（不products
        const items = exchangeResponse.data.items || []

        /* 轮播图数据?使用后端真实字段（exchange_items 表） */
        const carouselItems = items.slice(0, 5).map((item: any, index: number) => ({
          exchange_item_id: item.exchange_item_id,
          item_name: item.item_name || '',
          description: item.description || '',
          /* 后端 primary_image 字段?primary_image_id 非null时自动返?url/thumbnail_url（当?7条商品均为null，需运营上传图片?*/
          image:
            (item.primary_image && item.primary_image.url) ||
            item.image_url ||
            '/images/products/default-product.png',
          cost_amount: item.cost_amount || 0,
          cost_asset_code: item.cost_asset_code || 'POINTS',
          original_price: item.original_price || null,
          tags: item.tags || [],
          is_hot: item.is_hot || false,
          is_new: item.is_new || false,
          sell_point: item.sell_point || '',
          background: this.getCarouselBackground(index)
        }))

        /* 卡片分组 ?使用后端真实字段 */
        const cardSections = this.createCardSections(items.slice(5, 20))

        /* 列表商品 ?使用后端真实字段 */
        const listProducts = items.slice(20).map((item: any) => ({
          exchange_item_id: item.exchange_item_id,
          item_name: item.item_name || '',
          description: item.description || '',
          image: item.image_url || '/images/products/default-product.png',
          cost_amount: item.cost_amount || 0,
          cost_asset_code: item.cost_asset_code || 'POINTS',
          original_price: item.original_price || null,
          stock: item.stock || 0,
          sold_count: item.sold_count || 0,
          tags: item.tags || [],
          is_hot: item.is_hot || false,
          has_warranty: item.has_warranty || false,
          free_shipping: item.free_shipping || false,
          sell_point: item.sell_point || ''
        }))

        this.setData({
          carouselItems,
          cardSections,
          listProducts,
          premiumSpaceStats: {
            hot_count: items.filter((p: any) => p.is_hot).length,
            /* 🔴 avg_rating ?trending_count 应由后端统计接口返回，前端不自行计算 */
            avg_rating: 0,
            trending_count: items.length
          },
          loading: false
        })

        shopLog.info('✅ 臻选空间数据初始化完成')
      } else {
        shopLog.info('ℹ️ 臻选空间商品为空（后端尚未配置premium商品）')
        this.setData({ loading: false })
        /* 即使臻选商品为空，竞价商品仍然可展示?*/
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
    shopLog.info('💎 解锁后刷新臻选空间商品?..')
    await this.initPremiumSpaceData()
  },

  /**
   * 检查臻选空间解锁状态   * 后端API: GET /api/v4/backpack/exchange/premium-status
   *
   * 响应字段（PremiumService 服务层计算返回，⚠️ user_premium_statuses 表不存在）
   * 已解锁时:
   *   - unlocked: true（⚠不是 is_unlocked   *   - is_valid: boolean
   *   - unlock_cost: 100
   *   - validity_hours: 24
   *   - remaining_hours: number（⚠不返expires_at   *   - total_unlock_count: number
   * 未解锁时:
   *   - unlocked: false
   *   - is_expired: boolean
   *   - can_unlock: boolean
   *   - unlock_cost: 100
   *   - validity_hours: 24
   *   - conditions: object（解锁条件详情）
   */
  async checkPremiumUnlockStatus() {
    try {
      const result = await shopAPI.getPremiumStatus()
      if (result && result.success && result.data) {
        const status = result.data
        this.setData({
          /* 后端字段?unlocked（⚠不是 is_unlocked?*/
          premiumUnlocked: !!status.unlocked,
          /* 后端返回 remaining_hours（⚠不返?expires_at 也不返回 unlock_expires_at?*/
          premiumRemainingHours: status.remaining_hours || 0,
          premiumIsValid: !!status.is_valid,
          premiumTotalUnlockCount: status.total_unlock_count || 0,
          premiumCanUnlock: !!status.can_unlock,
          premiumIsExpired: !!status.is_expired,
          /* 解锁条件（未解锁时后端返回） */
          premiumConditions: status.conditions || null,
          premiumUnlockCost: status.unlock_cost || 0,
          premiumValidityHours: status.validity_hours || 24
        })
        shopLog.info('✅ 臻选空间解锁状态', status)
      }
    } catch (error) {
      shopLog.error('❌ 查询臻选空间解锁状态失败', error)
    }
  },

  /**
   * 处理臻选空间解锁（用户点击解锁按钮   * 后端API: POST /api/v4/backpack/exchange/unlock-premium
   */
  async handlePremiumUnlock() {
    /* 先检查最新解锁状态*/
    await this.checkPremiumUnlockStatus()

    if (this.data.premiumUnlocked) {
      shopShowToast('臻选空间已解锁')
      return
    }

    /* 后端返回 can_unlock 标识是否满足解锁条件 */
    if (this.data.premiumCanUnlock === false) {
      /* 后端 conditions 对象包含解锁条件详情，展示给用户 */
      const conditions = this.data.premiumConditions
      const conditionText = conditions ? `解锁条件未满足，请查看详情` : '解锁条件未满足'
      wx.showModal({
        title: '暂时无法解锁',
        content: conditionText,
        showCancel: false,
        confirmText: '我知道了'
      })
      return
    }

    /* 确认扣费解锁 */
    const validityHours = this.data.premiumValidityHours || 24
    wx.showModal({
      title: '解锁臻选空间',
      content: `解锁需消耗${this.data.premiumUnlockCost}积分，有效期${validityHours}小时，是否确认？`,
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
   * 解锁臻选空间（执行解锁请求   * 后端API: POST /api/v4/backpack/exchange/unlock-premium
   */
  async unlockPremiumSpace() {
    try {
      const result = await shopAPI.unlockPremium()
      if (result && result.success && result.data) {
        this.setData({
          premiumUnlocked: true,
          /* 解锁成功后后端返?remaining_hours（不返回 expires_at?*/
          premiumRemainingHours: result.data.remaining_hours || 0
        })
        shopShowToast('🎉 臻选空间解锁成功！')
        shopLog.info('✅ 臻选空间解锁成功', result.data)
        /* 解锁后刷新臻选空间商品列表?*/
        this.loadPremiumProducts()
      }
    } catch (error: any) {
      shopLog.error('❌ 臻选空间解锁失败', error)
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
      shopLog.info('✅ 布局参数初始化完成', {
        windowWidth: res.windowWidth,
        containerWidth,
        columnWidth
      })
    } catch (err) {
      shopLog.error('✅ 获取窗口信息失败:', err)
      this.setData({ containerWidth: 335, columnWidth: 157 })
    }
  },

  /** 轮播图变化事?*/
  onCarouselChange(e: any) {
    this.setData({ carouselActiveIndex: e.detail.current })
  },

  // ============================================
  // 🎯 竞价功能（后端API: /api/v4/backpack/bid/*  // ============================================

  /**
   * 加载竞价商品列表
   * 后端API: GET /api/v4/backpack/bid/products
   *
   * 响应字段（对bid_products 表）:
   *   - bid_product_id: BIGINT PK
   *   - exchange_item_id: BIGINT FK
   *   - start_price: BIGINT（⚠不是 starting_price   *   - current_price: BIGINT
   *   - min_bid_increment: BIGINT
   *   - price_asset_code: VARCHAR(50)（⚠不是 asset_code   *   - status: ENUM态）
   *   - start_time / end_time: DATETIME
   *   - bid_count: INT
   *   - winner_user_id: INT（⚠不是 highest_bidder_id   */
  async loadBidProducts() {
    shopLog.info('🎯 加载竞价商品列表...')
    try {
      const response = await shopGetBidProducts(1, 20, 'active')

      if (response && response.success && response.data) {
        const bidProducts = response.data.products || []
        shopLog.info(`✅ 获取了 ${bidProducts.length} 个竞价商品`)

        /* 使用后端真实字段名（bid_products 表） */
        const mappedProducts = bidProducts.map((item: any) => ({
          bid_product_id: item.bid_product_id,
          exchange_item_id: item.exchange_item_id,
          /* 📋 待后? bid products API 是否在JOIN exchange_items时返?item_name? */
          item_name: item.item_name || item.name || '',
          description: item.description || '',
          image: item.image_url || '/images/products/default-product.png',
          category: item.category || '',
          /* 后端字段: start_price（不?starting_price?*/
          start_price: item.start_price || 0,
          current_price: item.current_price || 0,
          min_bid_increment: item.min_bid_increment || 1,
          /* 后端字段: price_asset_code（不?asset_code?*/
          price_asset_code: item.price_asset_code || 'DIAMOND',
          status: item.status,
          start_time: item.start_time,
          end_time: item.end_time,
          bid_count: item.bid_count || 0,
          /* 后端字段: winner_user_id（不?highest_bidder_id?*/
          winner_user_id: item.winner_user_id,
          /* 倒计时文本（初始化时计算一次，定时器持续更新） */
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
        shopLog.info(`✅ 获取了 ${records.length} 条竞价历史`)
      }
    } catch (error) {
      shopLog.error('❌ 加载竞价历史失败:', error)
      this.setData({ bidHistory: [] })
    }
  },

  /**
   * 竞价按钮点击 - 打开竞价弹窗并加载商品详   * 增加震动反馈和实时校验状态初始化
   */
  async onBidTap(e: any) {
    const product = e.currentTarget.dataset.product
    shopLog.info('🏷️ ?点击竞价:', product)

    /* 仅允?active 状态的商品出价 */
    if (product.status !== 'active') {
      shopShowToast(product.status === 'pending' ? '竞拍尚未开始' : '竞拍已结束')
      return
    }

    /* 轻触震动反馈 */
    try {
      wx.vibrateShort({ type: 'light' })
    } catch (_vibrateErr) {
      /* 忽略不支持的设备 */
    }

    /* 先从后端获取最新的竞价商品详情（确保价格是实时的） */
    try {
      const detailResponse = await shopGetBidProductDetail(product.bid_product_id)
      if (detailResponse && detailResponse.success && detailResponse.data) {
        const detail = detailResponse.data
        const currentMinBid = (detail.current_price || 0) + (detail.min_bid_increment || 1)

        this.setData({
          selectedBidProduct: {
            bid_product_id: detail.bid_product_id,
            item_name: detail.item_name || detail.name || '',
            description: detail.description || '',
            image: detail.image_url || product.image || '/images/products/default-product.png',
            category: detail.category || '',
            /* 后端字段: start_price */
            start_price: detail.start_price || 0,
            current_price: detail.current_price || 0,
            min_bid_increment: detail.min_bid_increment || 1,
            /* 后端字段: price_asset_code */
            price_asset_code: detail.price_asset_code || 'DIAMOND',
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
        /* 详情获取失败时使用列表数据*/
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

      /* 启动弹窗内倒计时?*/
      this._startBidModalCountdown()
    } catch (error) {
      shopLog.error('❌ 获取竞价详情失败，使用列表数据', error)
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
   * 竞价金额输入 - 实时校验并更新状态   * 输入金额 最低出价时显示绿色✓，否则显示红色提示
   */
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

  /**
   * 快捷加价按钮
   * 在当前出价基础上增加固定金额，提升竞价操作效率
   */
  onQuickBidAdd(e: any) {
    const addAmount = Number(e.currentTarget.dataset.amount) || 0
    const { selectedBidProduct, userBidAmount } = this.data
    if (!selectedBidProduct) {
      return
    }

    /* 震动反馈 */
    try {
      wx.vibrateShort({ type: 'light' })
    } catch (_vibErr) {
      /* 静默 */
    }

    const baseAmount =
      userBidAmount > 0
        ? userBidAmount
        : selectedBidProduct.current_price + selectedBidProduct.min_bid_increment

    const newAmount = baseAmount + addAmount
    const quickMinBid =
      (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
    this.setData({
      userBidAmount: newAmount,
      bidAmountValid: newAmount >= quickMinBid
    })
  },

  /** 一键填入最低出?*/
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

  /** 切换竞价规则显示/隐藏 */
  onToggleBidRules() {
    this.setData({ showBidRules: !this.data.showBidRules })
  },

  /**
   * 确认竞价 - 调用后端 POST /api/v4/backpack/bid
   * ⚠️ 后端口bid_products.price_asset_code 读取竞价资产类型，无需前端传入 asset_code
   */
  async onConfirmBid() {
    const { selectedBidProduct, userBidAmount, bidSubmitting } = this.data

    if (!selectedBidProduct) {
      shopShowToast('请选择竞价商品')
      return
    }

    /* 防止重复提交 */
    if (bidSubmitting) {
      return
    }

    /* 前端基础校验（后端会做完整校验，这里是提前拦截明显错误） */
    const confirmMinBid =
      (selectedBidProduct.current_price || 0) + (selectedBidProduct.min_bid_increment || 1)
    if (userBidAmount < confirmMinBid) {
      shopShowToast(
        `出价不能低于 ${confirmMinBid} ${selectedBidProduct.price_asset_code || 'DIAMOND'}`
      )
      return
    }

    /* 二次确认弹窗 */
    wx.showModal({
      title: '确认竞价',
      content: `您将以 ${userBidAmount} ${selectedBidProduct.price_asset_code || 'DIAMOND'} 出价，资产将被冻结直到被超越或竞价结束。`,
      confirmText: '确认出价',
      cancelText: '再想想',
      success: async (modalRes: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!modalRes.confirm) {
          return
        }

        this.setData({ bidSubmitting: true })

        try {
          /* 提交时震动反?*/
          try {
            wx.vibrateShort({ type: 'medium' })
          } catch (_e) {
            /* 静默 */
          }

          shopLog.info('🎯 提交竞价:', {
            bid_product_id: selectedBidProduct.bid_product_id,
            bid_amount: userBidAmount
          })

          /* ⚠️ placeBid 不再?asset_code（后端从 bid_products.price_asset_code 读取消*/
          const response = await shopPlaceBid(selectedBidProduct.bid_product_id, userBidAmount)

          if (response && response.success) {
            shopLog.info('✅ 竞价成功:', response.data)

            /* 成功震动 */
            try {
              wx.vibrateShort({ type: 'heavy' })
            } catch (_e) {
              /* 静默 */
            }

            shopShowToast('🎉 竞价成功')
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
          /* 后端返回的错误信息已?APIClient.showError 自动展示 */
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
  // 竞价倒计时工具方  // ============================================

  /**
   * 格式化竞价倒计时文   * @param endTime - 竞价结束时间（ISO字符串或时间戳）
   * @returns 格式化后的倒计时文本，"20 / "152 / "已结
   */
  _formatBidCountdown(endTime: string | number | undefined): string {
    if (!endTime) {
      return ''
    }
    const now = Date.now()
    const endTimestamp = typeof endTime === 'number' ? endTime : new Date(endTime).getTime()
    const diff = endTimestamp - now

    if (diff <= 0) {
      return '已结束'
    }

    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    if (hours > 24) {
      const days = Math.floor(hours / 24)
      return `${days}天${hours % 24}时`
    }
    if (hours > 0) {
      return `${hours}时${minutes}分`
    }
    if (minutes > 0) {
      return `${minutes}分${seconds}秒`
    }
    return `${seconds}秒`
  },

  /**
   * 启动竞价列表倒计时（每秒更新卡片上的倒计时文本）
   * 使用 _bidListTimer 存储定时器ID，避免重复启   */
  _startBidListCountdown() {
    /* 先清理旧定时间*/
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

  /** 停止弹窗倒计时?*/
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
  // 🛠数据转换和工具方  // ============================================

  /**
   * 转换后端商品数据为瀑布流格式   * 使用后端 exchange_items 表真实字段名
   *
   * @param items - 后端返回exchange_items 数组
   * @returns 瀑布流格式的商品数组
   */
  convertToWaterfallData(items: any) {
    if (!items || !Array.isArray(items)) {
      shopLog.warn('⚠️ convertToWaterfallData: 传入的items无效，返回空数组')
      return []
    }
    try {
      return items
        .map((item: any, index: number) => {
          if (!item || typeof item !== 'object') {
            shopLog.warn(`⚠️ convertToWaterfallData: 第${index}个商品数据无效`, item)
            return null
          }
          /* 后端字段: exchange_item_id 是主键，item_name 是名称?*/
          if (!item.item_name || !item.exchange_item_id) {
            shopLog.warn(
              `⚠️ 商品数据不完整，缺少 exchange_item_id 或 item_name，跳过索引${index}:`,
              item
            )
            return null
          }
          /* 从后端API读取 snake_case 字段 ?转换为前端展示层 camelCase */
          return {
            /* 后端主键: exchange_item_id（不?id?*/
            exchange_item_id: item.exchange_item_id,
            /* 后端名称: item_name（不?name?*/
            item_name: item.item_name,
            /* 后端 primary_image 字段?primary_image_id 非null时自动返?url/thumbnail_url（当?7条商品均为null，需运营上传图片?*/
            image:
              (item.primary_image && item.primary_image.url) ||
              item.image_url ||
              '/images/products/default-product.png',
            primaryImageId: item.primary_image_id || null,
            /* 后端价格: cost_amount + cost_asset_code（多币种支付模型，不?exchange_points?*/
            price: item.cost_amount || 0,
            costAssetCode: item.cost_asset_code || 'POINTS',
            originalPrice: item.original_price || null,
            /* 后端销? sold_count（不?sales?*/
            soldCount: item.sold_count || 0,
            tags: item.tags || [],
            isLucky: item.is_lucky || false,
            isHot: item.is_hot || false,
            isNew: item.is_new || false,
            sellPoint: item.sell_point || '',
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
   * 创建卡片分组（使用后端返回的真实数据，不使用 Math.random 模拟数据   * 分组依据后端返回is_hot / is_new / category 等字符   *
   * @param items - 后端返回exchange_items 数组
   */
  createCardSections(items: any[]) {
    /* UI常量: 分组展示配置（视觉呈现，前端可自主决定） */
    const sections = [
      {
        id: 'hot',
        title: '🔥 热销爆款',
        subtitle: '限时特惠，抢完即止',
        icon: '🔥',
        backgroundColor: 'linear-gradient(135deg, #ff6b35, #f7931e)',
        titleColor: '#fff',
        products: items.slice(0, 5)
      },
      {
        id: 'new',
        title: '✨ 新品首发',
        subtitle: '新鲜上架，抢先体验',
        icon: '✨',
        backgroundColor: 'linear-gradient(135deg, #667eea, #764ba2)',
        titleColor: '#fff',
        products: items.slice(5, 10)
      },
      {
        id: 'premium',
        title: '💎 品质臻选',
        subtitle: '精心挑选，品质保证',
        icon: '💎',
        backgroundColor: 'linear-gradient(135deg, #4ecdc4, #44a08d)',
        titleColor: '#fff',
        products: items.slice(10, 15)
      }
    ]
    /* 使用后端 exchange_items 真实字段（不?Math.random() 生成假数据） */
    return sections.map(section => ({
      ...section,
      products: section.products.map((item: any) => ({
        exchange_item_id: item.exchange_item_id,
        item_name: item.item_name || '',
        description: item.description || '',
        image: item.image_url || '/images/products/default-product.png',
        cost_amount: item.cost_amount || 0,
        cost_asset_code: item.cost_asset_code || 'POINTS',
        original_price: item.original_price || null,
        isHot: item.is_hot || false,
        isNew: item.is_new || false,
        sellPoint: item.sell_point || '',
        stock: item.stock || 0,
        tags: item.tags || []
      }))
    }))
  },

  /** 获取轮播背景色（UI常量，前端可自主决定?*/
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
  // 🔍 幸运空间搜索和筛  // ============================================

  /** 幸运空间搜索输入处理?00ms防抖?*/
  onLuckySearchInput: shopDebounce(function (e: any) {
    const keyword = e.detail.value.trim()
    shopLog.info('🔍 幸运空间搜索关键词', keyword)
    this.setData({ luckySearchKeyword: keyword })
    this.applyLuckyFilters()
  }, 500),

  /** 幸运空间筛选条件变?*/
  onLuckyFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    shopLog.info('🔍 幸运空间切换筛选', filter)
    this.setData({ luckyCurrentFilter: filter })
    this.applyLuckyFilters()
  },

  /** 切换幸运空间高级筛选面?*/
  onToggleLuckyAdvancedFilter() {
    const { showLuckyAdvancedFilter } = this.data
    shopLog.info('🔍 切换幸运空间高级筛选', !showLuckyAdvancedFilter)
    this.setData({ showLuckyAdvancedFilter: !showLuckyAdvancedFilter })
  },

  /** 幸运空间分类筛选变?*/
  onLuckyCategoryFilterChange(e: any) {
    const category = e.currentTarget.dataset.category
    shopLog.info('🔍 幸运空间切换分类筛选', category)
    this.setData({ luckyCategoryFilter: category })
    this.applyLuckyFilters()
  },

  /** 幸运空间积分范围筛选变?*/
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

  /** 幸运空间库存状态筛?*/
  onLuckyStockFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    shopLog.info(`🔍 幸运空间库存状态筛选: ${filter}`)
    this.setData({ luckyStockFilter: filter })
    this.applyLuckyFilters()
  },

  /** 重置幸运空间所有筛选条?*/
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

  /** 应用幸运空间筛选条件（委托?utils/product-filter.ts + utils/waterfall.ts?*/
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
      /* 瀑布流数据中 price 对应后端 cost_amount */
      priceField: 'price'
    })

    const layoutResult = this.calculateWaterfallLayout(filterResult.filtered)
    this.setData({
      luckyFilteredProducts: layoutResult.layoutProducts || [],
      containerHeight: layoutResult.containerHeight || 500,
      columnHeights: layoutResult.columnHeights || [0, 0]
    })
  }
}

module.exports = shopHandlers

export {}
