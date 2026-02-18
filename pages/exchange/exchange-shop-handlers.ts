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
  getExchangeSpaceStats: shopGetExchangeSpaceStats
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

      /* 并行加载：商品列表 + 空间统计（节省请求时间） */
      const [response, statsResponse] = await Promise.all([
        shopGetExchangeProducts({
          space: 'lucky',
          page: 1,
          page_size: waterfallPageSize
        }),
        shopGetExchangeSpaceStats('lucky')
      ])
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

        // 布局计算（保留用于筛选功能，Flex网格不依赖layoutInfo定位）
        const layoutResult = this.calculateWaterfallLayout(waterfallProducts) || {
          layoutProducts: [],
          columnHeights: [0, 0],
          containerHeight: 500
        }
        const layoutProducts = layoutResult.layoutProducts || []
        shopLog.info(`📐 布局计算完成: ${layoutProducts.length} 个商品`)

        // 保存全部商品数据用于分页
        const allLayoutProducts = Array.isArray(layoutProducts) ? layoutProducts : []

        /* 空间统计数据：优先使用后端 space-stats API 返回值，前端不自行计算 */
        const luckyStats =
          statsResponse && statsResponse.success && statsResponse.data
            ? {
              new_count: statsResponse.data.new_count || 0,
              avg_discount: statsResponse.data.avg_discount || 0,
              flash_deals: statsResponse.data.flash_deals || 0
            }
            : { new_count: 0, avg_discount: 0, flash_deals: 0 }

        if (!statsResponse || !statsResponse.success) {
          shopLog.warn('⚠️ 幸运空间统计API返回失败，统计数据为空')
        }

        this.setData({
          waterfallProducts: allLayoutProducts,
          luckyAllProducts: allLayoutProducts,
          luckySpaceStats: luckyStats,
          loading: false,
          luckySearchKeyword: '',
          luckyCurrentFilter: 'all',
          luckyCategoryFilter: 'all',
          luckyPointsRange: 'all',
          luckyStockFilter: 'all',
          luckySortBy: 'default',
          showLuckyAdvancedFilter: false,
          luckyCurrentPage: 1,
          luckyPageInputValue: ''
        })

        // 计算分页并加载第一页
        this.calculateLuckyTotalPages()
        this.loadLuckyCurrentPageProducts()

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

      /* 并行加载：臻选商品 + 竞价商品 + 空间统计 */
      const [exchangeResponse, , premiumStatsResponse] = await Promise.all([
        shopGetExchangeProducts({ space: 'premium', page: 1, page_size: 30 }),
        this.loadBidProducts(),
        shopGetExchangeSpaceStats('premium')
      ])

      if (exchangeResponse && exchangeResponse.success && exchangeResponse.data) {
        // ⚠️ 后端返回字段名是 items（不是 products）
        const rawItems = exchangeResponse.data.items || []

        /**
         * 🔒 数据完整性校验（与幸运空间 convertToWaterfallData 保持一致的验证逻辑）
         * 后端 DataSanitizer 将 exchange_item_id 脱敏为 id（string 类型）
         * 缺少 id 的商品无法执行 POST /api/v4/backpack/exchange 兑换请求，必须在入口处过滤
         */
        const items = rawItems.filter((item: any, idx: number) => {
          if (!item || typeof item !== 'object') {
            shopLog.warn(`⚠️ 臻选空间第${idx}个商品数据无效，跳过`)
            return false
          }
          /* 后端 DataSanitizer 脱敏: exchange_item_id → id（string） */
          if (!item.id) {
            shopLog.error(
              `❌ 臻选空间第${idx}个商品缺少 id（DataSanitizer 脱敏后的商品主键），数据异常:`,
              `keys=${Object.keys(item).join(',')}, name=${item.name || '空'}`
            )
            return false
          }
          /* 后端 DataSanitizer 脱敏: item_name → name */
          if (!item.name) {
            shopLog.warn(`⚠️ 臻选空间商品 id=${item.id} 的 name 为空`)
          }
          return true
        })

        if (rawItems.length > 0 && items.length === 0) {
          shopLog.error(
            `❌ 后端API返回 ${rawItems.length} 个商品全部缺少 id，` +
            `请检查 DataSanitizer 是否正常处理 GET /api/v4/backpack/exchange/items 响应`
          )
          this.setErrorState('商品数据异常', '后端返回的商品缺少必要字段(id)，请联系管理员')
          return
        }

        if (rawItems.length !== items.length) {
          shopLog.warn(
            `⚠️ 臻选空间数据校验: 原始${rawItems.length}个, 有效${items.length}个, ` +
            `过滤${rawItems.length - items.length}个`
          )
        }

        /* 空间统计数据：优先使用后端 space-stats API 返回值，前端不自行计算 */
        const premiumStats =
          premiumStatsResponse && premiumStatsResponse.success && premiumStatsResponse.data
            ? {
              hot_count: premiumStatsResponse.data.hot_count || 0,
              avg_rating: premiumStatsResponse.data.avg_rating || 0,
              trending_count: premiumStatsResponse.data.trending_count || 0
            }
            : { hot_count: 0, avg_rating: 0, trending_count: 0 }

        if (!premiumStatsResponse || !premiumStatsResponse.success) {
          shopLog.warn('⚠️ 臻选空间统计API返回失败，统计数据为空')
        }

        // 保存校验通过的商品数据用于分页
        this.setData({
          premiumAllProducts: items,
          premiumSpaceStats: premiumStats,
          loading: false,
          premiumCurrentPage: 1,
          premiumPageInputValue: ''
        })

        // 计算分页并加载第一页
        this.calculatePremiumTotalPages()
        this.loadPremiumCurrentPageProducts()

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

  /* 竞价功能已拆分到 exchange-bid-handlers.ts */

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
   * 转换后端商品数据为瀑布流格式
   * 使用后端 DataSanitizer 脱敏后的真实字段名（id / name）
   *
   * 后端字段映射（DataSanitizer 安全脱敏）:
   *   exchange_item_id → id（string，BIGINT 主键转字符串）
   *   item_name → name
   *   cost_amount / original_price → string（bigNumberStrings: true）
   *
   * @param items - 后端 GET /api/v4/backpack/exchange/items 返回的 items 数组
   * @returns 瀑布流格式的商品数组
   */
  convertToWaterfallData(items: any) {
    if (!items || !Array.isArray(items)) {
      shopLog.warn('⚠️ convertToWaterfallData: 传入的items无效，返回空数组')
      return []
    }
    try {
      const result = items
        .map((item: any, index: number) => {
          if (!item || typeof item !== 'object') {
            shopLog.warn(`⚠️ convertToWaterfallData: 第${index}个商品数据无效`, item)
            return null
          }

          /**
           * 后端 DataSanitizer 脱敏后的字段名（后端是权威数据源）:
           *   id: string — 商品主键（原 exchange_item_id，BIGINT→string）
           *   name: string — 商品名称（原 item_name）
           */
          const itemId = item.id || null
          const itemName = item.name || ''

          if (!itemName || !itemId) {
            shopLog.warn(
              `⚠️ 商品数据不完整，缺少id或name，跳过索引${index}:`,
              `keys=${Object.keys(item).join(',')}, id=${itemId}, name=${itemName}`
            )
            return null
          }

          /* 商品图片: 优先 primary_image 嵌套对象，兜底默认图 */
          const imageUrl =
            (item.primary_image && (item.primary_image.url || item.primary_image.thumbnail_url)) ||
            '/images/products/default-product.png'

          /**
           * 使用后端 DataSanitizer 脱敏后的字段名
           * BIGINT 字段（cost_amount / original_price）在此统一转 Number，下游无需重复转换
           */
          return {
            /* 商品主键（DataSanitizer: exchange_item_id → id，string 类型） */
            id: itemId,
            /* 商品名称（DataSanitizer: item_name → name） */
            name: itemName,
            /* 商品图片 */
            image: imageUrl,
            /* 主图ID */
            primary_image_id: item.primary_image_id || null,
            /* 兑换价格（BIGINT→string，统一转 Number） */
            cost_amount: Number(item.cost_amount) || 0,
            /* 支付资产类型 */
            cost_asset_code: item.cost_asset_code || 'POINTS',
            /* 原价（BIGINT→string，统一转 Number） */
            original_price: item.original_price ? Number(item.original_price) : null,
            /* 销量 */
            sold_count: item.sold_count || 0,
            tags: item.tags || [],
            is_lucky: item.is_lucky || false,
            is_hot: item.is_hot || false,
            is_new: item.is_new || false,
            sell_point: item.sell_point || '',
            created_at: item.created_at || '',
            description: item.description || '',
            stock: item.stock || 0,
            /* 排序序号 */
            sort_order: item.sort_order || 0,
            /* 质保 / 包邮标记 */
            has_warranty: item.has_warranty || false,
            free_shipping: item.free_shipping || false
          }
        })
        .filter(Boolean)

      shopLog.info(`🔍 convertToWaterfallData: 输入${items.length}个, 输出${result.length}个`)
      return result
    } catch (error) {
      shopLog.error('❌ convertToWaterfallData 转换失败:', error)
      return []
    }
  },

  /* createCardSections / getCarouselBackground 已移除
   * 臻选空间已改为与幸运空间一致的双列网格布局，不再需要轮播/卡片分组/列表三层混合布局 */

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

  /** 商品兑换空间 - 按售价排序（和交易市场一致的快捷操作） */
  onShopSortByPoints() {
    shopLog.info('📊 商品兑换空间按售价排序')
    const { currentSpace } = this.data

    if (currentSpace === 'lucky') {
      // 幸运空间：对 luckyFilteredProducts 按价格升序排序
      const luckyFilteredProducts = [...(this.data.luckyFilteredProducts || [])]
      const sortedProducts = luckyFilteredProducts.sort((a: any, b: any) => {
        const priceA = a.cost_amount || 0
        const priceB = b.cost_amount || 0
        return priceA - priceB
      })
      this.setData({ luckyFilteredProducts: sortedProducts, luckySortBy: 'points-asc' })
    } else if (currentSpace === 'premium') {
      // 臻选空间：对商品列表按价格升序排序（与幸运空间一致的排序逻辑）
      const premiumProducts = [...(this.data.premiumFilteredProducts || [])]
      const sortedPremiumProducts = premiumProducts.sort((a: any, b: any) => {
        const priceA = a.cost_amount || 0
        const priceB = b.cost_amount || 0
        return priceA - priceB
      })
      this.setData({ premiumFilteredProducts: sortedPremiumProducts })
    }
    shopShowToast({ title: '已按售价升序排列', icon: 'success' })
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
      /* 后端 exchange_items 表价格字段: cost_amount */
      priceField: 'cost_amount'
    })

    // 筛选后更新全部商品列表并重新计算分页
    const allFiltered = filterResult.filtered || []
    this.setData({ luckyAllProducts: allFiltered })
    this.calculateLuckyTotalPages()
    this.loadLuckyCurrentPageProducts()
  },

  // ============================================
  // 📖 幸运空间分页
  // ============================================

  /** 幸运空间 - 计算总页数 */
  calculateLuckyTotalPages() {
    const { luckyAllProducts, luckyPageSize } = this.data
    const allProducts = luckyAllProducts || []
    const luckyTotalPages = Math.max(1, Math.ceil(allProducts.length / luckyPageSize))
    this.setData({
      luckyTotalPages,
      luckyTotalProducts: allProducts.length
    })
    shopLog.info(
      `📊 幸运空间分页: 共${allProducts.length}个商品, 每页${luckyPageSize}个, 共${luckyTotalPages}页`
    )
  },

  /** 幸运空间 - 加载当前页商品数据 */
  loadLuckyCurrentPageProducts() {
    const { luckyAllProducts, luckyCurrentPage, luckyPageSize } = this.data
    const allProducts = luckyAllProducts || []
    const startIndex = (luckyCurrentPage - 1) * luckyPageSize
    const endIndex = Math.min(startIndex + luckyPageSize, allProducts.length)
    const currentPageProducts = allProducts.slice(startIndex, endIndex)

    shopLog.info(
      `📖 幸运空间加载第${luckyCurrentPage}页 [${startIndex}-${endIndex - 1}], 共${currentPageProducts.length}个`
    )

    // 对当前页商品计算瀑布流布局
    const layoutResult = this.calculateWaterfallLayout(currentPageProducts)
    this.setData({
      luckyFilteredProducts: layoutResult.layoutProducts || [],
      containerHeight: layoutResult.containerHeight || 500,
      columnHeights: layoutResult.columnHeights || [0, 0]
    })
  },

  /** 幸运空间 - 上一页 */
  onLuckyPrevPage() {
    const { luckyCurrentPage } = this.data
    if (luckyCurrentPage > 1) {
      this.setData({ luckyCurrentPage: luckyCurrentPage - 1 })
      this.loadLuckyCurrentPageProducts()
      shopLog.info(`📖 幸运空间切换到第 ${luckyCurrentPage - 1} 页`)
    }
  },

  /** 幸运空间 - 下一页 */
  onLuckyNextPage() {
    const { luckyCurrentPage, luckyTotalPages } = this.data
    if (luckyCurrentPage < luckyTotalPages) {
      this.setData({ luckyCurrentPage: luckyCurrentPage + 1 })
      this.loadLuckyCurrentPageProducts()
      shopLog.info(`📖 幸运空间切换到第 ${luckyCurrentPage + 1} 页`)
    }
  },

  /** 幸运空间 - 跳转到指定页 */
  onLuckyPageChange(e: any) {
    const { page } = e.currentTarget.dataset
    const targetPage = parseInt(page)
    if (targetPage !== this.data.luckyCurrentPage) {
      this.setData({ luckyCurrentPage: targetPage })
      this.loadLuckyCurrentPageProducts()
      shopLog.info(`📖 幸运空间跳转到第 ${targetPage} 页`)
    }
  },

  /** 幸运空间 - 页码输入变更 */
  onLuckyPageInputChange(e: any) {
    this.setData({ luckyPageInputValue: e.detail.value })
  },

  /** 幸运空间 - 页码输入确认 */
  onLuckyPageInputConfirm(e: any) {
    const { luckyTotalPages } = this.data
    const inputValue = e.detail.value || this.data.luckyPageInputValue
    const targetPage = parseInt(inputValue)

    shopLog.info(`📖 幸运空间输入跳转页码: ${targetPage}`)

    if (isNaN(targetPage)) {
      shopShowToast({ title: '请输入有效页码', icon: 'none' })
      return
    }
    if (targetPage < 1 || targetPage > luckyTotalPages) {
      shopShowToast({ title: `页码范围: 1 - ${luckyTotalPages}`, icon: 'none' })
      return
    }
    if (targetPage !== this.data.luckyCurrentPage) {
      this.setData({ luckyCurrentPage: targetPage, luckyPageInputValue: '' })
      this.loadLuckyCurrentPageProducts()
      shopShowToast({ title: `已跳转到第 ${targetPage} 页`, icon: 'success' })
    }
  },

  // ============================================
  // 📖 臻选空间分页
  // ============================================

  /** 臻选空间 - 计算总页数 */
  calculatePremiumTotalPages() {
    const { premiumAllProducts, premiumPageSize } = this.data
    const allProducts = premiumAllProducts || []
    const premiumTotalPages = Math.max(1, Math.ceil(allProducts.length / premiumPageSize))
    this.setData({
      premiumTotalPages,
      premiumTotalProducts: allProducts.length
    })
    shopLog.info(
      `📊 臻选空间分页: 共${allProducts.length}个商品, 每页${premiumPageSize}个, 共${premiumTotalPages}页`
    )
  },

  /**
   * 臻选空间 - 加载当前页商品数据
   * 使用与幸运空间一致的双列网格布局展示
   * 数据格式统一使用后端 DataSanitizer 脱敏后的字段名（id / name）
   */
  loadPremiumCurrentPageProducts() {
    const { premiumAllProducts, premiumCurrentPage, premiumPageSize } = this.data
    const allProducts = premiumAllProducts || []
    const startIndex = (premiumCurrentPage - 1) * premiumPageSize
    const endIndex = Math.min(startIndex + premiumPageSize, allProducts.length)
    const currentPageProducts = allProducts.slice(startIndex, endIndex)

    shopLog.info(
      `📖 臻选空间加载第${premiumCurrentPage}页 [${startIndex}-${endIndex - 1}], 共${currentPageProducts.length}个`
    )

    /**
     * 统一使用后端 DataSanitizer 脱敏后的字段名，与幸运空间卡片格式一致
     * BIGINT 字段（cost_amount / original_price）统一转 Number
     */
    const premiumFilteredProducts = currentPageProducts.map((item: any) => ({
      /* 商品主键（DataSanitizer: exchange_item_id → id，string 类型） */
      id: item.id,
      /* 商品名称（DataSanitizer: item_name → name） */
      name: item.name || '',
      description: item.description || '',
      /* 商品图片 - 优先使用 primary_image 嵌套对象 */
      image:
        (item.primary_image && (item.primary_image.url || item.primary_image.thumbnail_url)) ||
        '/images/products/default-product.png',
      /* 兑换价格（BIGINT→string，转 Number） */
      cost_amount: Number(item.cost_amount) || 0,
      cost_asset_code: item.cost_asset_code || 'POINTS',
      /* 原价（BIGINT→string，转 Number） */
      original_price: item.original_price ? Number(item.original_price) : null,
      stock: item.stock || 0,
      sold_count: item.sold_count || 0,
      tags: item.tags || [],
      is_hot: item.is_hot || false,
      is_new: item.is_new || false,
      sell_point: item.sell_point || '',
      has_warranty: item.has_warranty || false,
      free_shipping: item.free_shipping || false
    }))

    this.setData({ premiumFilteredProducts })
  },

  /** 臻选空间 - 上一页 */
  onPremiumPrevPage() {
    const { premiumCurrentPage } = this.data
    if (premiumCurrentPage > 1) {
      this.setData({ premiumCurrentPage: premiumCurrentPage - 1 })
      this.loadPremiumCurrentPageProducts()
      shopLog.info(`📖 臻选空间切换到第 ${premiumCurrentPage - 1} 页`)
    }
  },

  /** 臻选空间 - 下一页 */
  onPremiumNextPage() {
    const { premiumCurrentPage, premiumTotalPages } = this.data
    if (premiumCurrentPage < premiumTotalPages) {
      this.setData({ premiumCurrentPage: premiumCurrentPage + 1 })
      this.loadPremiumCurrentPageProducts()
      shopLog.info(`📖 臻选空间切换到第 ${premiumCurrentPage + 1} 页`)
    }
  },

  /** 臻选空间 - 跳转到指定页 */
  onPremiumPageChange(e: any) {
    const { page } = e.currentTarget.dataset
    const targetPage = parseInt(page)
    if (targetPage !== this.data.premiumCurrentPage) {
      this.setData({ premiumCurrentPage: targetPage })
      this.loadPremiumCurrentPageProducts()
      shopLog.info(`📖 臻选空间跳转到第 ${targetPage} 页`)
    }
  },

  /** 臻选空间 - 页码输入变更 */
  onPremiumPageInputChange(e: any) {
    this.setData({ premiumPageInputValue: e.detail.value })
  },

  /** 臻选空间 - 页码输入确认 */
  onPremiumPageInputConfirm(e: any) {
    const { premiumTotalPages } = this.data
    const inputValue = e.detail.value || this.data.premiumPageInputValue
    const targetPage = parseInt(inputValue)

    shopLog.info(`📖 臻选空间输入跳转页码: ${targetPage}`)

    if (isNaN(targetPage)) {
      shopShowToast({ title: '请输入有效页码', icon: 'none' })
      return
    }
    if (targetPage < 1 || targetPage > premiumTotalPages) {
      shopShowToast({ title: `页码范围: 1 - ${premiumTotalPages}`, icon: 'none' })
      return
    }
    if (targetPage !== this.data.premiumCurrentPage) {
      this.setData({ premiumCurrentPage: targetPage, premiumPageInputValue: '' })
      this.loadPremiumCurrentPageProducts()
      shopShowToast({ title: `已跳转到第 ${targetPage} 页`, icon: 'success' })
    }
  },

  // ============================================
  // 🖼️ 图片加载错误处理
  // ============================================

  /**
   * 商品图片加载失败回调（幸运空间 + 臻选空间统一处理）
   * 当后端返回的 image_url 无效（如对象存储 key 而非完整 URL）时触发
   * 将 image 设置为本地默认图，同时触发 WXML placeholder 显示
   */
  onShopImageError(e: any) {
    const { index, space } = e.currentTarget.dataset
    shopLog.info(`⚠️ 商品图片加载失败 [space=${space}, index=${index}]`)

    const defaultImg = '/images/products/default-product.png'

    if (space === 'premium') {
      this.setData({ [`premiumFilteredProducts[${index}].image`]: defaultImg })
    } else {
      const useLuckyFiltered =
        this.data.luckyFilteredProducts && this.data.luckyFilteredProducts.length > 0
      const listKey = useLuckyFiltered ? 'luckyFilteredProducts' : 'waterfallProducts'
      this.setData({ [`${listKey}[${index}].image`]: defaultImg })
    }
  }
}

module.exports = shopHandlers

export { }

