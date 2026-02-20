/**
 * 交易市场 Behavior — 决策D10: Behavior 替代 spread handler
 *
 * 包含交易市场 Tab 的全部业务方法：
 *   - 挂单列表加载（C2C 交易市场）
 *   - 搜索/筛选/排序
 *   - 分页
 *   - 购买弹窗
 *
 * 后端API: GET /api/v4/market/listings（QueryService 嵌套响应结构）
 *
 * @file packageExchange/exchange-market/handlers/market-behavior.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

const { API, Wechat, Logger, Utils } = require('../../../utils/index')
const marketLog = Logger.createLogger('market-behavior')
const { getMarketProducts, purchaseMarketProduct, getMyListingStatus } = API
const { showToast } = Wechat
const { debounce } = Utils
const { enrichProductDisplayFields } = require('../../utils/product-display')
const { userStore: marketUserStore } = require('../../../store/user')

module.exports = Behavior({
  methods: {
    /** 初始化筛选条件 */
    initFilters() {
      this.setData({
        currentFilter: 'all',
        categoryFilter: 'all',
        sortBy: 'default',
        searchKeyword: '',
        currentPage: 1
      })
    },

    /**
     * 从后端API加载交易市场挂单列表
     * 后端API: GET /api/v4/market/listings
     */
    async loadProducts() {
      marketLog.info('加载交易市场挂单列表...')
      this.setData({ loading: true })

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

        const response = await getMarketProducts({ page, limit })

        if (response && response.success && response.data) {
          const items = response.data.products || []

          /**
           * 适配后端 QueryService 嵌套响应结构
           * 物品类型: item_info.display_name, item_info.image_url
           * 资产类型: asset_info.display_name, asset_info.icon_url
           */
          const processedProducts = items.map((item: any) => {
            const itemInfo = item.item_info || {}
            const assetInfo = item.asset_info || {}
            const isAsset = item.listing_kind === 'fungible_asset'
            return {
              market_listing_id: item.market_listing_id,
              listing_kind: item.listing_kind || 'item_instance',
              seller_user_id: item.seller_user_id,
              seller_nickname: item.seller_nickname || '',
              seller_avatar_url: item.seller_avatar_url || null,
              item_name: itemInfo.display_name || assetInfo.display_name || '未知商品',
              description: isAsset
                ? `${assetInfo.asset_code || ''} × ${assetInfo.amount || 0}`
                : itemInfo.category_code || '',
              image: itemInfo.image_url || assetInfo.icon_url || '/images/default-product.png',
              price_asset_code: item.price_asset_code,
              price_amount: item.price_amount || 0,
              offer_asset_code: assetInfo.asset_code || null,
              offer_amount: assetInfo.amount || null,
              offer_asset_group_code: assetInfo.group_code || null,
              offer_item_rarity: itemInfo.rarity_code || null,
              offer_item_category_code: itemInfo.category_code || null,
              item_instance_id: itemInfo.item_instance_id || null,
              template_id: itemInfo.template_id || null,
              status: item.status || 'on_sale',
              created_at: item.created_at || '',
              imageStatus: 'loading'
            }
          })

          const pagination = response.data.pagination || {}
          const enrichedProducts = enrichProductDisplayFields(processedProducts)

          this.setData({
            loading: false,
            products: enrichedProducts,
            filteredProducts: enrichedProducts,
            totalCount: pagination.total || enrichedProducts.length,
            totalPages: Math.ceil((pagination.total || enrichedProducts.length) / limit) || 1
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

    /** 搜索输入处理（500ms防抖） */
    onSearchInput: debounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim(), currentPage: 1 })
      this.applyAdvancedFilters()
    }, 500),

    /** 筛选条件变更 */
    onFilterChange(e: any) {
      this.setData({
        currentFilter: e.currentTarget.dataset.filter,
        categoryFilter: e.currentTarget.dataset.filter,
        currentPage: 1
      })
      this.applyAdvancedFilters()
    },

    /** 切换高级筛选面板 */
    onToggleAdvancedFilter() {
      this.setData({ showAdvancedFilter: !this.data.showAdvancedFilter })
    },

    /** 分类筛选变更 */
    onCategoryFilterChange(e: any) {
      this.setData({
        categoryFilter: e.currentTarget.dataset.category,
        currentFilter: e.currentTarget.dataset.category,
        currentPage: 1
      })
      this.applyAdvancedFilters()
    },

    /** 排序方式变更 */
    onSortByChange(e: any) {
      this.setData({ sortBy: e.currentTarget.dataset.sort, currentPage: 1 })
      this.applyAdvancedFilters()
    },

    /** 重置筛选 */
    onResetFilters() {
      this.setData({
        currentFilter: 'all',
        categoryFilter: 'all',
        sortBy: 'default',
        searchKeyword: '',
        currentPage: 1,
        showAdvancedFilter: false
      })
      this.applyAdvancedFilters()
      showToast('筛选已重置', 'success')
    },

    /** 应用高级筛选条件 */
    applyAdvancedFilters() {
      const { products, searchKeyword, sortBy, categoryFilter } = this.data
      let filtered = [...products]

      if (categoryFilter && categoryFilter !== 'all') {
        filtered = filtered.filter((item: any) => item.listing_kind === categoryFilter)
      }

      if (searchKeyword) {
        const keyword = searchKeyword.toLowerCase()
        filtered = filtered.filter(
          (item: any) =>
            (item.item_name || '').toLowerCase().includes(keyword) ||
            (item.description || '').toLowerCase().includes(keyword)
        )
      }

      if (sortBy === 'price_amount_asc') {
        filtered.sort((a: any, b: any) => a.price_amount - b.price_amount)
      } else if (sortBy === 'price_amount_desc') {
        filtered.sort((a: any, b: any) => b.price_amount - a.price_amount)
      } else if (sortBy === 'created_at_desc') {
        filtered.sort(
          (a: any, b: any) =>
            (Utils.safeParseDateString(b.created_at) || new Date(0)).getTime() -
            (Utils.safeParseDateString(a.created_at) || new Date(0)).getTime()
        )
      }

      this.setData({ filteredProducts: filtered })
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
        const response = await purchaseMarketProduct(selectedProduct.market_listing_id)

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

    /** 图片加载失败 */
    onImageError(e: any) {
      const index = e.currentTarget.dataset.index
      this.setData({
        [`filteredProducts[${index}].image`]: '/images/products/default-product.png',
        [`filteredProducts[${index}].imageStatus`]: 'error'
      })
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

    /** 按价格排序快捷操作 */
    onSortByPoints() {
      const sorted = [...(this.data.filteredProducts || [])].sort(
        (a: any, b: any) => a.price_amount - b.price_amount
      )
      this.setData({ filteredProducts: sorted, sortBy: 'price_amount_asc' })
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
     * 用于在交易市场底部管理栏展示在售挂单数量
     */
    async loadMyListingStatus() {
      try {
        const result = await getMyListingStatus()
        if (result && result.success && result.data) {
          const onSaleCount = result.data.on_sale_count || 0
          this.setData({ myOnSaleCount: onSaleCount })
          marketLog.info('我的挂单统计:', onSaleCount, '个在售')
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
    }
  }
})

export {}
