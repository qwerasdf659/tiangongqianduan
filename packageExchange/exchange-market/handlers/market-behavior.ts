/**
 * 交易市场 Behavior — 决策D10: Behavior 替代 spread handler
 *
 * 包含交易市场 Tab 的全部业务方法：
 *   - 挂单列表加载（服务端筛选/排序/分页）
 *   - 搜索/筛选/排序（全部参数传递给后端 QueryService）
 *   - 筛选维度从 facets API 动态获取
 *   - 购买弹窗
 *
 * 筛选机制（C+++方案，对齐独立交易市场页面 market.ts）：
 *   - listing_kind / sort / category_def_id / rarity_code / asset_group_code
 *     / asset_code / min_price / max_price / with_counts 全部通过 API 查询参数传递
 *   - 筛选维度从 GET /api/v4/market/listings/facets 动态获取
 *
 * 后端API:
 *   GET /api/v4/market/listings（QueryService 嵌套响应结构）
 *   GET /api/v4/market/listings/facets（筛选维度字典表）
 *
 * @file packageExchange/exchange-market/handlers/market-behavior.ts
 * @version 7.0.0
 * @since 2026-03-15
 */

const { API, Wechat, Logger, Utils, ImageHelper } = require('../../../utils/index')
const marketLog = Logger.createLogger('market-behavior')
const {
  getMarketProducts,
  getAdDelivery,
  reportAdImpression,
  reportAdClick,
  reportInteractionLog,
  purchaseMarketProduct,
  getMyListingStatus,
  confirmDelivery,
  getMarketFacets
} = API

/** 每隔多少条商品穿插一条 feed 广告 */
const EXCHANGE_FEED_AD_INTERVAL = 5
const { showToast } = Wechat
const { debounce } = Utils
const { enrichProductDisplayFields } = require('../../utils/product-display')
const { userStore: marketUserStore } = require('../../../store/user')

/**
 * 前端排序值 → 后端 sort 参数映射
 * 后端 GET /api/v4/market/listings 支持: recommended / newest / price_asc / price_desc / hot
 */
const SORT_VALUE_MAP: Record<string, string> = {
  default: 'recommended',
  price_amount_asc: 'price_asc',
  price_amount_desc: 'price_desc',
  created_at_desc: 'newest',
  recommended: 'recommended'
}

module.exports = Behavior({
  methods: {
    /** 筛选操作防抖加载（300ms），避免用户快速连续点击触发多次API请求 */
    _debouncedLoadProducts: debounce(function (this: any) {
      this.loadProducts()
    }, 300),

    /** 初始化筛选条件 + 加载筛选维度 + feed广告 */
    initFilters() {
      this.setData({
        currentFilter: 'all',
        categoryFilter: 'all',
        sortBy: 'default',
        searchKeyword: '',
        currentPage: 1,
        filterCategoryCode: '',
        filterRarityCode: '',
        filterAssetGroupCode: '',
        filterAssetCode: '',
        filterMinPrice: '',
        filterMaxPrice: '',
        facetsData: null,
        facetsLoaded: false,
        filtersCount: null
      })
      this._feedAdsReady = this._loadExchangeFeedAds()
    },

    /**
     * 从后端API加载交易市场挂单列表（服务端筛选）
     *
     * 数据流:
     *   筛选状态 → 构建API参数 → GET /api/v4/market/listings?listing_kind=xxx&sort=xxx
     *   → 后端 QueryService WHERE/ORDER BY → 返回筛选结果
     *   → enrichProductDisplayFields → setData渲染
     */
    async loadProducts() {
      marketLog.info('加载交易市场挂单列表...')
      this.setData({ loading: true })

      if (this._feedAdsReady) {
        await this._feedAdsReady.catch(() => {})
      }

      let token = marketUserStore.accessToken
      if (!token) {
        token = wx.getStorageSync('access_token')
        if (token) {
          marketUserStore.updateAccessToken(token)
        }
      }

      if (!token) {
        this.setData({ loading: false })
        wx.showModal({
          title: '未登录',
          content: '请先登录后再查看交易市场',
          showCancel: false,
          confirmText: '立即登录',
          success: () => {
            wx.reLaunch({ url: '/packageUser/auth/auth' })
          }
        })
        return
      }

      try {
        const page = this.data.currentPage || 1
        const limit = this.data.pageSize || 20
        const {
          categoryFilter,
          sortBy,
          searchKeyword,
          filterCategoryCode,
          filterRarityCode,
          filterAssetGroupCode,
          filterAssetCode,
          filterMinPrice,
          filterMaxPrice
        } = this.data

        /**
         * 构建后端API查询参数（对齐独立市场页面 market.ts 的完整筛选参数集）
         * 后端 GET /api/v4/market/listings 支持:
         *   listing_kind / sort / category_def_id / rarity_code
         *   asset_group_code / asset_code / min_price / max_price / with_counts
         */
        const apiParams: Record<string, any> = {
          page,
          limit,
          with_counts: true
        }

        if (categoryFilter && categoryFilter !== 'all') {
          apiParams.listing_kind = categoryFilter
        }

        const mappedSort = SORT_VALUE_MAP[sortBy] || 'newest'
        apiParams.sort = mappedSort

        if (filterCategoryCode) {
          apiParams.category_def_id = filterCategoryCode
        }
        if (filterRarityCode) {
          apiParams.rarity_code = filterRarityCode
        }
        if (filterAssetGroupCode) {
          apiParams.asset_group_code = filterAssetGroupCode
        }
        if (filterAssetCode) {
          apiParams.asset_code = filterAssetCode
        }
        if (filterMinPrice) {
          const parsedMin = parseInt(filterMinPrice, 10)
          if (!isNaN(parsedMin) && parsedMin > 0) {
            apiParams.min_price = parsedMin
          }
        }
        if (filterMaxPrice) {
          const parsedMax = parseInt(filterMaxPrice, 10)
          if (!isNaN(parsedMax) && parsedMax > 0) {
            apiParams.max_price = parsedMax
          }
        }

        const response = await getMarketProducts(apiParams)

        if (response && response.success && response.data) {
          const items = response.data.products || []

          /**
           * 适配后端 QueryService 嵌套响应，使用 ImageHelper 统一图片降级链
           * fungible_asset 类型 → 本地材料图标（按 asset_code 映射）
           * item 类型 → 后端 primary_media.public_url → 分类图标 → 占位图
           */
          const processedProducts = items.map((item: any, idx: number) => {
            if (!item.listing_id) {
              marketLog.warn(`products[${idx}] 缺少 listing_id，后端响应字段:`, Object.keys(item))
            }
            const itemInfo = item.item_info || {}
            const assetInfo = item.asset_info || {}
            const isAsset = item.listing_kind === 'fungible_asset'
            return {
              listing_id: item.listing_id,
              listing_kind: item.listing_kind || 'item',
              seller_user_id: item.seller_user_id,
              seller_nickname: item.seller_nickname || '',
              seller_avatar_url: item.seller_avatar_url || null,
              item_name: ImageHelper.getListingDisplayName(item),
              description: isAsset
                ? `${ImageHelper.getAssetDisplayName(assetInfo.asset_code || '')} × ${assetInfo.amount || 0}`
                : itemInfo.category_code || '',
              image: ImageHelper.getListingDisplayImage(item),
              price_asset_code: item.price_asset_code,
              price_amount: item.price_amount || 0,
              offer_asset_code: assetInfo.asset_code || null,
              offer_amount: assetInfo.amount || null,
              offer_asset_group_code: assetInfo.group_code || null,
              offer_item_rarity: itemInfo.rarity_code || null,
              offer_category_def_id: itemInfo.category_def_id || null,
              item_id: itemInfo.item_id || null,
              template_id: itemInfo.template_id || null,
              is_pinned: item.is_pinned || false,
              is_recommended: item.is_recommended || false,
              status: item.status || 'active',
              created_at: item.created_at || '',
              imageStatus: 'loading'
            }
          })

          const pagination = response.data.pagination || {}
          const enrichedProducts = enrichProductDisplayFields(processedProducts)

          /**
           * 搜索关键词：后端市场 listings API 暂不支持 keyword 参数
           * 保留客户端辅助筛选，待后端支持后移除此段
           * ⚠️ 需要后端在 GET /api/v4/market/listings 新增 keyword 查询参数
           */
          let displayProducts = enrichedProducts
          if (searchKeyword) {
            const keyword = searchKeyword.toLowerCase()
            displayProducts = enrichedProducts.filter(
              (item: any) =>
                (item.item_name || '').toLowerCase().includes(keyword) ||
                (item.description || '').toLowerCase().includes(keyword)
            )
          }

          const interleavedProducts = this._interleaveExchangeFeedAds(displayProducts)

          this.setData({
            loading: false,
            filteredProducts: interleavedProducts,
            totalCount: pagination.total || enrichedProducts.length,
            totalPages: Math.ceil((pagination.total || enrichedProducts.length) / limit) || 1,
            filtersCount: response.data.filters_count || null
          })

          marketLog.info(`成功加载 ${processedProducts.length} 个交易市场挂单`)
        } else {
          throw new Error((response && response.message) || '交易市场数据加载失败')
        }
      } catch (error: any) {
        marketLog.error('交易市场数据加载失败:', error)
        this.setData({ loading: false })
        if (error.statusCode === 401) {
          this.triggerEvent('autherror')
        }
      }
    },

    /** 搜索输入处理（500ms防抖）→ 重新加载 */
    onSearchInput: debounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim(), currentPage: 1 })
      this.loadProducts()
    }, 500),

    /** 筛选条件变更 → 防抖加载 */
    onFilterChange(e: any) {
      this.setData({
        currentFilter: e.currentTarget.dataset.filter,
        categoryFilter: e.currentTarget.dataset.filter,
        currentPage: 1
      })
      this._debouncedLoadProducts()
    },

    /** 分类筛选变更 → 防抖加载 */
    onCategoryFilterChange(e: any) {
      this.setData({
        categoryFilter: e.currentTarget.dataset.category,
        currentFilter: e.currentTarget.dataset.category,
        currentPage: 1
      })
      this._debouncedLoadProducts()
    },

    /** 排序方式变更 → 防抖加载 */
    onSortByChange(e: any) {
      this.setData({ sortBy: e.currentTarget.dataset.sort, currentPage: 1 })
      this._debouncedLoadProducts()
    },

    /** 重置筛选 → 重新加载 */
    onResetFilters() {
      this.setData({
        currentFilter: 'all',
        categoryFilter: 'all',
        sortBy: 'default',
        searchKeyword: '',
        currentPage: 1,
        showAdvancedFilter: false,
        filterCategoryCode: '',
        filterRarityCode: '',
        filterAssetGroupCode: '',
        filterAssetCode: '',
        filterMinPrice: '',
        filterMaxPrice: ''
      })
      this.loadProducts()
      showToast('筛选已重置', 'success')
    },

    /**
     * 加载筛选维度数据（首次展开高级筛选面板时触发）
     * 后端API: GET /api/v4/market/listings/facets
     */
    async loadFacets() {
      if (this.data.facetsLoaded) {
        return
      }
      try {
        const facetsResponse = await getMarketFacets()
        if (facetsResponse && facetsResponse.success && facetsResponse.data) {
          this.setData({ facetsData: facetsResponse.data, facetsLoaded: true })
          marketLog.info('筛选维度加载成功')
        }
      } catch (facetsError: any) {
        marketLog.warn('加载筛选维度失败:', facetsError.message)
      }
    },

    /** 切换高级筛选面板（首次展开时加载 facets） */
    onToggleAdvancedFilter() {
      const willShow = !this.data.showAdvancedFilter
      this.setData({ showAdvancedFilter: willShow })
      if (willShow && !this.data.facetsLoaded) {
        this.loadFacets()
      }
    },

    /** 物品分类筛选（来自 facets.categories）→ 防抖加载 */
    onItemCategorySelect(e: any) {
      const code = e.currentTarget.dataset.code || ''
      this.setData({
        filterCategoryCode: code === this.data.filterCategoryCode ? '' : code,
        currentPage: 1
      })
      this._debouncedLoadProducts()
    },

    /** 稀有度筛选（来自 facets.rarities）→ 防抖加载 */
    onRaritySelect(e: any) {
      const code = e.currentTarget.dataset.code || ''
      this.setData({
        filterRarityCode: code === this.data.filterRarityCode ? '' : code,
        currentPage: 1
      })
      this._debouncedLoadProducts()
    },

    /** 资产分组筛选（来自 facets.asset_groups）→ 防抖加载 */
    onAssetGroupSelect(e: any) {
      const code = e.currentTarget.dataset.code || ''
      this.setData({
        filterAssetGroupCode: code === this.data.filterAssetGroupCode ? '' : code,
        currentPage: 1
      })
      this._debouncedLoadProducts()
    },

    /** 最低价格输入 */
    onMinPriceInput(e: any) {
      this.setData({ filterMinPrice: (e.detail.value || '').replace(/[^0-9]/g, '') })
    },

    /** 最高价格输入 */
    onMaxPriceInput(e: any) {
      this.setData({ filterMaxPrice: (e.detail.value || '').replace(/[^0-9]/g, '') })
    },

    /** 价格区间确认筛选 → 重新加载 */
    onPriceRangeConfirm() {
      this.setData({ currentPage: 1 })
      this.loadProducts()
    },

    /** pagination组件分页事件处理 */
    onPaginationChange(e: any) {
      const targetPage = e.detail.page
      if (targetPage !== this.data.currentPage) {
        this.setData({ currentPage: targetPage })
        this.loadProducts()
      }
    },

    /** 商品点击（打开购买确认弹窗） */
    onProductTap(e: any) {
      const product = e.currentTarget.dataset.product
      marketLog.info('点击市场商品:', product)

      if (!product || !product.listing_id) {
        marketLog.error('商品缺少 listing_id，无法发起购买', {
          listing_kind: product?.listing_kind,
          item_name: product?.item_name,
          available_keys: product ? Object.keys(product) : []
        })
        wx.showModal({
          title: '数据异常',
          content: '该商品缺少挂单ID信息，请刷新页面后重试',
          showCancel: false
        })
        return
      }

      this.setData({ selectedProduct: product, showConfirm: true })
    },

    /**
     * 确认购买市场挂单
     * 后端API: POST /api/v4/market/listings/:id/purchase
     */
    async onConfirmPurchase() {
      const { selectedProduct } = this.data
      if (!selectedProduct) {
        return
      }

      try {
        this.setData({ purchasing: true })
        const response = await purchaseMarketProduct(selectedProduct.listing_id)

        if (response && response.success && response.data) {
          marketLog.info('购买成功:', response.data)
          this.setData({
            showConfirm: false,
            selectedProduct: null,
            purchasing: false,
            showResult: true,
            resultData: {
              product: selectedProduct,
              tradeOrderId: response.data.trade_order_id || '',
              payAmount: response.data.price_amount || selectedProduct.price_amount
            }
          })
          this.triggerEvent('purchase', { orderData: response.data })
          this.triggerEvent('pointsupdate')
          setTimeout(() => {
            this.loadProducts()
          }, 1000)
        } else {
          throw new Error((response && response.message) || '购买失败')
        }
      } catch (error: any) {
        marketLog.error('购买失败:', error)
        this.setData({ purchasing: false })
        if (error.statusCode === 401) {
          this.triggerEvent('autherror')
          return
        }
        wx.showModal({
          title: '购买失败',
          content: error.message || '购买失败，请重试',
          showCancel: false
        })
      }
    },

    /** 取消购买 */
    onCancelPurchase() {
      this.setData({ showConfirm: false, selectedProduct: null })
    },

    /** 关闭购买结果弹窗 */
    onCloseResult() {
      this.setData({ showResult: false, resultData: null })
    },

    /** 商品列表图片加载失败 — 替换为占位图 */
    onImageError(e: any) {
      const index = e.currentTarget.dataset.index
      this.setData({
        [`filteredProducts[${index}].image`]: ImageHelper.DEFAULT_PRODUCT_IMAGE,
        [`filteredProducts[${index}].imageStatus`]: 'error'
      })
    },

    /** 购买确认弹窗图片加载失败 — 替换为占位图 */
    onConfirmImageError() {
      this.setData({ 'selectedProduct.image': ImageHelper.DEFAULT_PRODUCT_IMAGE })
    },

    /** 图片加载成功 */
    onImageLoad(e: any) {
      const index = e.currentTarget.dataset.index
      this.setData({ [`filteredProducts[${index}].imageStatus`]: 'loaded' })
    },

    /** 视图模式切换 */
    onToggleViewMode(e: any) {
      const targetMode = e.currentTarget.dataset.mode
      if (!targetMode || targetMode === this.properties.viewMode) {
        return
      }
      this.triggerEvent('viewmodechange', { mode: targetMode })
    },

    /** 按价格排序快捷操作 → 调用服务端排序 */
    onSortByPoints() {
      this.setData({ sortBy: 'price_amount_asc', currentPage: 1 })
      this.loadProducts()
      showToast('已按价格升序排列', 'success')
    },

    /** 涟漪效果 */
    onCardTouchStart(e: any) {
      if (!this.properties.effects || !(this.properties.effects as any).ripple) {
        return
      }
      const touch = e.touches[0]
      if (!touch) {
        return
      }
      const cardIndex = e.currentTarget.dataset.cardIndex
      const query = wx.createSelectorQuery().in(this)
      query
        .select(`[data-card-index="${cardIndex}"]`)
        .boundingClientRect((rect: any) => {
          if (!rect) {
            return
          }
          const rippleX = touch.clientX - rect.left
          const rippleY = touch.clientY - rect.top
          const productList = [...(this.data.filteredProducts || [])]
          if (!productList[cardIndex]) {
            return
          }
          productList[cardIndex] = {
            ...productList[cardIndex],
            _rippleActive: true,
            _rippleX: rippleX,
            _rippleY: rippleY
          }
          this.setData({ filteredProducts: productList })
          setTimeout(() => {
            productList[cardIndex] = { ...productList[cardIndex], _rippleActive: false }
            this.setData({ filteredProducts: productList })
          }, 500)
        })
        .exec()
    },

    /** 刷新 */
    onRefreshProducts() {
      this.loadProducts()
      this.loadMyListingStatus()
    },

    /** 检查并刷新 */
    checkAndRefreshProducts() {
      const lastLoadTime = (this as any)._lastProductLoadTime || 0
      if (Date.now() - lastLoadTime > 60000) {
        this.loadProducts()
      }
    },

    /** 对外暴露的刷新方法 */
    refresh() {
      this.loadProducts()
      this.loadMyListingStatus()
    },

    // ===== 我的交易管理 =====

    /**
     * 加载当前用户的挂单状态统计
     * 后端API: GET /api/v4/market/listing-status
     * 响应: { current, limit, remaining, percentage }
     */
    async loadMyListingStatus() {
      try {
        const result = await getMyListingStatus()
        if (result && result.success && result.data) {
          const onSaleCount = result.data.current || 0
          this.setData({ myOnSaleCount: onSaleCount })
          marketLog.info('我的挂单统计:', onSaleCount, '/', result.data.limit || 0)
        }
      } catch (error: any) {
        marketLog.warn('获取挂单状态失败（不影响浏览）:', error.message)
      }
    },

    /** 跳转到"我的挂单"管理页面 */
    onGoToMyListings() {
      wx.navigateTo({ url: '/packageTrade/trade/my-listings/my-listings' })
    },

    /** 跳转到仓库页面（去上架） */
    onGoToInventory() {
      wx.navigateTo({ url: '/packageTrade/trade/inventory/inventory' })
    },

    // ===== Phase 4：C2C担保码（买方确认收货） =====

    /**
     * 打开担保码输入弹窗
     * 仅 listing_kind = 'item' 的实物交易需要担保码
     */
    onOpenEscrowInput(e: any) {
      const tradeOrderId = e.currentTarget.dataset.trade_order_id
      if (!tradeOrderId) {
        showToast('交易订单信息无效')
        return
      }

      this.setData({
        showEscrowInput: true,
        escrowInputCode: '',
        escrowTradeOrderId: tradeOrderId,
        escrowSubmitting: false
      })
    },

    /**
     * 担保码输入事件
     */
    onEscrowCodeInput(e: any) {
      this.setData({ escrowInputCode: e.detail.value || '' })
    },

    /**
     * 提交担保码确认收货
     * POST /api/v4/market/trade-orders/:trade_order_id/confirm-delivery
     *
     * ⚠️ 需要后端 Phase 4 EscrowCodeService 实施完成后才可调用
     */
    async onSubmitEscrowCode() {
      const { escrowTradeOrderId, escrowInputCode, escrowSubmitting } = this.data

      if (!escrowTradeOrderId || !escrowInputCode || escrowInputCode.length !== 6) {
        showToast('请输入完整的6位担保码')
        return
      }
      if (escrowSubmitting) {
        return
      }

      this.setData({ escrowSubmitting: true })

      try {
        const result = await confirmDelivery(escrowTradeOrderId, escrowInputCode)

        if (result && result.success) {
          marketLog.info('担保码确认成功:', escrowTradeOrderId)
          showToast('交易完成', 'success')
          this.setData({
            showEscrowInput: false,
            showResult: false,
            escrowInputCode: '',
            escrowTradeOrderId: 0
          })
          this.loadProducts()
          this.triggerEvent('pointsupdate')
        } else {
          throw new Error((result && result.message) || '担保码验证失败')
        }
      } catch (error: any) {
        marketLog.error('担保码确认失败:', error)
        showToast(error.message || '担保码验证失败，请检查后重试')
      } finally {
        this.setData({ escrowSubmitting: false })
      }
    },

    /**
     * 关闭担保码输入弹窗
     */
    onCloseEscrowInput() {
      this.setData({
        showEscrowInput: false,
        escrowInputCode: '',
        escrowTradeOrderId: 0
      })
    },

    // ========================================
    // Feed 信息流广告（后端 GET /api/v4/system/ad-delivery?slot_type=feed&position=exchange_list）
    // ========================================

    /**
     * 加载兑换商城 feed 信息流广告
     *
     * 对应广告位: exchange_list_feed（ID:15，日价25钻石，CPM 3钻石）
     * 广告穿插由前端控制，后端只负责下发广告内容
     */
    async _loadExchangeFeedAds() {
      try {
        const feedResult = await getAdDelivery({ slot_type: 'feed', position: 'exchange_list' })
        if (!feedResult?.success || !feedResult.data) {
          return
        }

        const feedItems: API.AdDeliveryItem[] = feedResult.data.items || []
        if (!Array.isArray(feedItems) || feedItems.length === 0) {
          this._exchangeFeedAds = []
          return
        }

        this._exchangeFeedAds = feedItems
        marketLog.info('兑换商城Feed广告加载成功:', feedItems.length, '条')
      } catch (feedError) {
        marketLog.warn('兑换商城Feed广告加载失败（不影响商品列表）:', feedError)
        this._exchangeFeedAds = []
      }
    },

    /**
     * 将 feed 广告穿插到商品列表中
     * 穿插规则: 每隔 EXCHANGE_FEED_AD_INTERVAL 条商品插入一条广告
     */
    _interleaveExchangeFeedAds(products: any[]): any[] {
      const feedAds = this._exchangeFeedAds
      if (!feedAds || feedAds.length === 0) {
        return products
      }

      const interleavedList: any[] = []
      let adIndex = 0

      for (let i = 0; i < products.length; i++) {
        interleavedList.push(products[i])

        if ((i + 1) % EXCHANGE_FEED_AD_INTERVAL === 0 && adIndex < feedAds.length) {
          const adItem = feedAds[adIndex]
          interleavedList.push({
            listing_id: `ad_${adItem.ad_campaign_id}`,
            _isAdItem: true,
            _adData: adItem,
            item_name: adItem.title || '推荐',
            image: adItem.primary_media?.public_url || '',
            imageStatus: 'loaded'
          })
          adIndex++
        }
      }

      return interleavedList
    },

    /**
     * Feed 广告点击事件处理
     */
    onExchangeFeedAdTap(e: WechatMiniprogram.CustomEvent) {
      const adData: API.AdDeliveryItem = e.currentTarget.dataset.ad
      if (!adData) {
        return
      }

      this._reportExchangeFeedEvent(adData, 'click')

      if (adData.link_url && adData.link_type && adData.link_type !== 'none') {
        switch (adData.link_type) {
          case 'page':
            wx.navigateTo({
              url: adData.link_url,
              fail: () => {
                wx.switchTab({
                  url: adData.link_url!,
                  fail: (err: any) => marketLog.error('广告跳转页面失败:', err)
                })
              }
            })
            break

          case 'miniprogram':
            wx.navigateToMiniProgram({
              appId: adData.link_url,
              fail: (err: any) => marketLog.error('广告跳转小程序失败:', err)
            })
            break

          case 'webview':
            wx.navigateTo({
              url: '/pages/webview/webview?url=' + encodeURIComponent(adData.link_url),
              fail: (err: any) => marketLog.error('广告跳转webview失败:', err)
            })
            break

          default:
            marketLog.warn('未知的广告跳转类型:', adData.link_type)
        }
      }
    },

    /**
     * Feed 广告事件上报 — 按 campaign_category 分流
     */
    _reportExchangeFeedEvent(adItem: API.AdDeliveryItem, eventType: 'impression' | 'click') {
      if (!adItem?.ad_campaign_id) {
        return
      }

      if (adItem.campaign_category === 'commercial') {
        if (!adItem.ad_slot_id) {
          marketLog.error('商业Feed广告缺少 ad_slot_id:', adItem.ad_campaign_id)
          return
        }

        if (eventType === 'impression') {
          reportAdImpression({
            ad_campaign_id: adItem.ad_campaign_id,
            ad_slot_id: adItem.ad_slot_id
          }).catch((err: any) => {
            marketLog.warn('Feed广告曝光上报失败:', err)
          })
        } else {
          reportAdClick({
            ad_campaign_id: adItem.ad_campaign_id,
            ad_slot_id: adItem.ad_slot_id,
            click_target: adItem.link_url || undefined
          }).catch((err: any) => {
            marketLog.warn('Feed广告点击上报失败:', err)
          })
        }
      } else {
        reportInteractionLog({
          ad_campaign_id: adItem.ad_campaign_id,
          interaction_type: eventType,
          extra_data: { slot_type: 'feed', position: 'exchange_list' }
        }).catch((err: any) => {
          marketLog.warn('Feed交互日志上报失败:', err)
        })
      }
    }
  }
})
