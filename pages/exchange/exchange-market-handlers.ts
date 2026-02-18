/**
 * 交易市场 Tab 处理方法 — 从 exchange.ts 拆分
 *
 * 包含：市场挂单加载、搜索筛选、分页、购买弹窗、图片处理
 * 通过对象展开运算符合并到 Page({})，this 自动指向 Page 实例
 *
 * 后端API对齐 v4.0（C2C交易市场 — QueryService 嵌套响应结构）:
 *   - GET /api/v4/market/listings 响应: { products: MarketListing[], pagination: {...} }
 *   - 物品类型(item_instance): 商品信息在 item_info 嵌套对象中
 *     item_info: { item_instance_id, display_name, image_url, category_code, rarity_code, template_id }
 *   - 资产类型(fungible_asset): 资产信息在 asset_info 嵌套对象中
 *     asset_info: { asset_code, amount, display_name, icon_url, group_code }
 *   - 根级字段: market_listing_id, listing_kind, seller_user_id, seller_nickname,
 *     seller_avatar_url, price_asset_code, price_amount, status, created_at
 *   - purchaseMarketProduct 响应: { trade_order_id, ... }
 *
 * @file pages/exchange/exchange-market-handlers.ts
 * @version 5.3.0
 * @since 2026-02-18
 */

const { API, Wechat, Constants, Logger, Utils } = require('../../utils/index')
const marketLog = Logger.createLogger('exchange-market')
const { getMarketProducts, purchaseMarketProduct } = API
const { showToast } = Wechat
const { debounce } = Utils
const { DELAY } = Constants

// MobX Store 引用（用于 loadProducts 中的 Token 恢复）
const { userStore: marketUserStore } = require('../../store/user')

/**
 * 交易市场 Tab 全部处理方法
 * 在 exchange.ts 中通过 ...marketHandlers 合并到 Page({})
 */
const marketHandlers = {
  // ============================================
  // 📦 商品数据加载
  // ============================================

  /** 初始化筛选条件（重置所有筛选为默认值） */
  initFilters() {
    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1
    })
  },

  /**
   * 从后端API加载交易市场挂单列表（C2C用户交易）
   * 后端API: GET /api/v4/market/listings
   * 响应: { products: MarketListing[], pagination: { page, page_size, total } }
   */
  async loadProducts() {
    marketLog.info('🏪 开始加载交易市场挂单列表...')

    // 在商品兑换模式下不加载交易市场列表
    if (this.data.currentTab === 'market') {
      marketLog.info('🏪 当前在商品兑换模式，跳过交易市场列表加载')
      return
    }

    const requestStartTime = Date.now()
    this.setData({ loading: true })

    // 获取Token（从 MobX Store 读取）
    let token = marketUserStore.accessToken
    if (!token) {
      token = wx.getStorageSync('access_token')
      if (token) {
        marketUserStore.updateAccessToken(token)
        marketLog.info('🔑 从本地存储恢复Token到Store')
      }
    }

    if (!token) {
      marketLog.info('🔐 用户未登录，需要先登录')
      this.setData({ loading: false })
      wx.showModal({
        title: '未登录',
        content: '请先登录后再查看交易市场',
        showCancel: false,
        confirmText: '立即登录',
        success: () => {
          wx.reLaunch({ url: '/pages/auth/auth' })
        }
      })
      return
    }

    marketLog.info('🎫 Token已准备，开始请求交易市场数据')

    try {
      const page = this.data.currentPage || 1
      const limit = this.data.pageSize || 20

      marketLog.info(`📦 请求参数: page=${page}, limit=${limit}`)

      // 调用交易市场API（GET /api/v4/market/listings）
      const response = await getMarketProducts({ page, limit })
      const requestDuration = Date.now() - requestStartTime

      marketLog.info('✅ 交易市场数据加载成功!')
      marketLog.info('⏱️ 请求耗时:', requestDuration + 'ms')

      if (response && response.success && response.data) {
        // 后端返回字段名是 products（基于 market_listings 表）
        const items = response.data.products || []

        /**
         * 适配后端 QueryService 嵌套响应结构（2026-02-18 后端已更新）
         *
         * 物品类型(item_instance): 商品名称/图片在 item_info 嵌套对象中
         *   item_info: { item_instance_id, display_name, image_url, category_code, rarity_code, template_id }
         *
         * 资产类型(fungible_asset): 资产名称/图标在 asset_info 嵌套对象中
         *   asset_info: { asset_code, amount, display_name, icon_url, group_code }
         *
         * 根级字段: market_listing_id, listing_kind, seller_user_id, seller_nickname,
         *           seller_avatar_url, price_asset_code, price_amount, status, created_at
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
            /* 商品名称：物品从 item_info.display_name 取，资产从 asset_info.display_name 取 */
            item_name: itemInfo.display_name || assetInfo.display_name || '未知商品',
            description: isAsset
              ? `${assetInfo.asset_code || ''} × ${assetInfo.amount || 0}`
              : itemInfo.category_code || '',
            /* 商品图片：物品从 item_info.image_url 取，资产从 asset_info.icon_url 取 */
            image: itemInfo.image_url || assetInfo.icon_url || '/images/default-product.png',
            /* 挂单定价信息（根级字段） */
            price_asset_code: item.price_asset_code,
            price_amount: item.price_amount || 0,
            /* 资产相关字段（从 asset_info 嵌套对象提取） */
            offer_asset_code: assetInfo.asset_code || null,
            offer_amount: assetInfo.amount || null,
            offer_asset_group_code: assetInfo.group_code || null,
            /* 物品相关字段（从 item_info 嵌套对象提取） */
            offer_item_rarity: itemInfo.rarity_code || null,
            offer_item_category_code: itemInfo.category_code || null,
            item_instance_id: itemInfo.item_instance_id || null,
            template_id: itemInfo.template_id || null,
            /* 挂单状态 */
            status: item.status || 'on_sale',
            created_at: item.created_at || '',
            imageStatus: 'loading'
          }
        })

        // 分页信息
        const pagination = response.data.pagination || {}

        this.setData({
          loading: false,
          products: processedProducts,
          filteredProducts: processedProducts,
          totalCount: pagination.total || processedProducts.length,
          totalPages: Math.ceil((pagination.total || processedProducts.length) / limit) || 1
        })

        this.calculateTotalPages()
        this.loadCurrentPageProducts()

        marketLog.info(`✅ 成功加载 ${processedProducts.length} 个交易市场挂单`)
        showToast({
          title: `加载 ${processedProducts.length} 个挂单`,
          icon: 'success',
          duration: DELAY.TOAST_SHORT
        })
      } else {
        throw new Error((response && response.message) || '交易市场数据加载失败')
      }
    } catch (error: any) {
      const requestDuration = Date.now() - requestStartTime
      marketLog.error('❌ 交易市场数据加载失败:', error)
      marketLog.info('⏱️ 失败请求耗时:', requestDuration + 'ms')
      this.setData({ loading: false })

      if (error.statusCode === 401) {
        this.clearTokenAndRedirectLogin()
      }
    }
  },

  /** 检查并刷新商品数据（距上次加载超60秒自动刷新） */
  checkAndRefreshProducts() {
    const lastLoadTime: number = (this as any)._lastProductLoadTime || 0
    const now: number = Date.now()
    if (now - lastLoadTime > 60000) {
      marketLog.info('🔄 商品数据已过期，自动刷新')
      this.loadProducts()
    }
  },

  // ============================================
  // 🔍 搜索和筛选
  // ============================================

  /** 搜索输入处理（500ms防抖） */
  onSearchInput: debounce(function (e: any) {
    const keyword = e.detail.value.trim()
    marketLog.info('🔍 搜索关键词:', keyword)
    this.setData({ searchKeyword: keyword, currentPage: 1 })
    this.applyFilters()
  }, 500),

  /** 筛选条件变更（全部/物品/资产） */
  onFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    marketLog.info('🔍 切换筛选:', filter)
    this.setData({ currentFilter: filter, currentPage: 1 })

    // 按 listing_kind 筛选
    const { products } = this.data
    let filtered = [...products]
    if (filter === 'item_instance') {
      filtered = products.filter((item: any) => item.listing_kind === 'item_instance')
    } else if (filter === 'fungible_asset') {
      filtered = products.filter((item: any) => item.listing_kind === 'fungible_asset')
    }
    this.setData({ filteredProducts: filtered })
  },

  /** 切换高级筛选面板 */
  onToggleAdvancedFilter() {
    const { showAdvancedFilter } = this.data
    marketLog.info('🔍 切换高级筛选:', !showAdvancedFilter)
    this.setData({ showAdvancedFilter: !showAdvancedFilter })
  },

  /** 商品分类筛选变更 */
  onCategoryFilterChange(e: any) {
    const category = e.currentTarget.dataset.category
    marketLog.info('🔍 切换分类筛选:', category)
    this.setData({ categoryFilter: category, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 积分范围筛选变更 */
  onPointsRangeChange(e: any) {
    const range = e.currentTarget.dataset.range
    marketLog.info('🔍 切换积分范围:', range)
    this.setData({ pointsRange: range, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 库存状态筛选变更 */
  onStockFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    marketLog.info('🔍 切换库存筛选:', filter)
    this.setData({ stockFilter: filter, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 排序方式变更 */
  onSortByChange(e: any) {
    const sort = e.currentTarget.dataset.sort
    marketLog.info('🔍 切换排序:', sort)
    this.setData({ sortBy: sort, currentPage: 1 })
    this.applyAdvancedFilters()
  },

  /** 重置所有筛选条件 */
  onResetFilters() {
    marketLog.info('🔄 重置所有筛选条件')
    this.setData({
      currentFilter: 'all',
      categoryFilter: 'all',
      pointsRange: 'all',
      stockFilter: 'all',
      sortBy: 'default',
      searchKeyword: '',
      currentPage: 1,
      showAdvancedFilter: false
    })
    this.applyFilters()
    showToast({ title: '✅ 筛选已重置', icon: 'success' })
  },

  /** 应用高级筛选条件（交易市场挂单筛选） */
  applyAdvancedFilters() {
    const { products, searchKeyword, sortBy } = this.data
    let filtered = [...products]

    // 按关键词搜索（搜索商品名称）
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(
        (item: any) =>
          (item.item_name || '').toLowerCase().includes(keyword) ||
          (item.description || '').toLowerCase().includes(keyword) ||
          (item.offer_asset_code || '').toLowerCase().includes(keyword)
      )
    }

    // 排序
    if (sortBy === 'points-asc' || sortBy === 'price_asc') {
      filtered.sort((a: any, b: any) => a.price_amount - b.price_amount)
    } else if (sortBy === 'points-desc' || sortBy === 'price_desc') {
      filtered.sort((a: any, b: any) => b.price_amount - a.price_amount)
    } else if (sortBy === 'newest') {
      filtered.sort(
        (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }

    this.setData({ filteredProducts: filtered })
  },

  /** 应用基础筛选条件（交易市场挂单筛选） */
  applyFilters() {
    const { products, searchKeyword } = this.data
    let filtered = [...products]

    // 按关键词搜索
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(
        (item: any) =>
          (item.item_name || '').toLowerCase().includes(keyword) ||
          (item.description || '').toLowerCase().includes(keyword) ||
          (item.offer_asset_code || '').toLowerCase().includes(keyword)
      )
    }

    this.setData({ filteredProducts: filtered })
  },

  // ============================================
  // 🔄 刷新和排序
  // ============================================

  /** 手动刷新商品列表 */
  async onRefreshProducts() {
    marketLog.info('🔧 手动刷新商品列表')

    if (this.data.currentTab === 'market') {
      const { currentSpace } = this.data
      marketLog.info(`🏪 商品兑换模式，刷新${currentSpace === 'premium' ? '臻选' : '幸运'}空间数据`)
      try {
        if (currentSpace === 'premium') {
          await this.initPremiumSpaceData()
        } else {
          await this.initLuckySpaceData()
        }
        showToast({ title: '✅ 刷新成功', icon: 'success' })
      } catch (error) {
        marketLog.error('❌ 刷新失败:', error)
      }
      return
    }

    try {
      await this.loadProducts()
      showToast({ title: '✅ 刷新成功', icon: 'success' })
    } catch (error) {
      marketLog.error('❌ 刷新失败:', error)
      showToast({ title: '刷新失败，请重试', icon: 'none' })
    }
  },

  /** 按 price_amount 升序排序 */
  onSortByPoints() {
    marketLog.info('🔍 按售价排序')
    const { filteredProducts } = this.data
    const sorted = [...filteredProducts].sort((a: any, b: any) => a.price_amount - b.price_amount)
    this.setData({ filteredProducts: sorted, sortBy: 'price_asc' })
    showToast({ title: '已按售价升序排列', icon: 'success' })
  },

  // ============================================
  // 🖼️ 图片处理
  // ============================================

  /** 图片加载错误处理 */
  onImageError(e: any) {
    const { index } = e.currentTarget.dataset
    marketLog.info(`⚠️ 图片加载失败 [${index}]`)
    this.setData({
      [`filteredProducts[${index}].imageStatus`]: 'error',
      [`filteredProducts[${index}].image`]: '/images/default-product.png'
    })
  },

  /** 图片加载成功处理 */
  onImageLoad(e: any) {
    const { index } = e.currentTarget.dataset
    this.setData({ [`filteredProducts[${index}].imageStatus`]: 'loaded' })
  },

  /** 预览商品图片 */
  onPreviewImage(e: any) {
    const { url } = e.currentTarget.dataset
    marketLog.info('🖼️ 预览图片:', url)
    if (url && url !== '/images/default-product.png') {
      wx.previewImage({
        current: url,
        urls: [url],
        success: () => marketLog.info('✅ 图片预览成功'),
        fail: (error: any) => {
          marketLog.error('❌ 图片预览失败:', error)
          showToast({ title: '图片预览失败', icon: 'none' })
        }
      })
    }
  },

  // ============================================
  // 🛒 购买弹窗（C2C交易市场）
  // ============================================

  /** 取消购买操作 */
  onCancelExchange() {
    marketLog.info('❌ 取消购买操作')
    this.setData({ showConfirm: false, selectedProduct: null })
  },

  /**
   * 确认购买操作（C2C交易市场）
   * 后端API: POST /api/v4/market/listings/:market_listing_id/purchase
   * 响应: { trade_order_id, business_id, market_listing_id, buyer_user_id, seller_user_id,
   *          asset_code, gross_amount, fee_amount, net_amount, status }
   */
  async onConfirmExchange() {
    const { selectedProduct } = this.data

    if (!selectedProduct) {
      marketLog.error('❌ 未选择商品')
      showToast({ title: '请选择要购买的商品', icon: 'none' })
      return
    }

    if (selectedProduct.status !== 'on_sale') {
      marketLog.error('❌ 商品已下架或已售出')
      showToast({ title: '该商品已不可购买', icon: 'none' })
      return
    }

    if (this.data.exchanging) {
      marketLog.info('⏳ 正在购买中，请勿重复操作')
      return
    }

    this.setData({ exchanging: true })

    try {
      // 调用购买API（POST /api/v4/market/listings/:id/purchase）
      const response = await purchaseMarketProduct(selectedProduct.market_listing_id)

      if (response && response.success && response.data) {
        marketLog.info('✅ 购买成功:', response.data)

        this.setData({
          showConfirm: false,
          selectedProduct: null,
          exchanging: false,
          showResult: true,
          resultData: {
            product: selectedProduct,
            orderNo: response.data.trade_order_id || response.data.business_id || '',
            payAssetCode: response.data.asset_code || selectedProduct.price_asset_code,
            payAmount: response.data.gross_amount || selectedProduct.price_amount,
            feeAmount: response.data.fee_amount || 0
          }
        })

        marketLog.info('🎉 购买流程完成')

        // 延迟刷新列表
        setTimeout(() => {
          this.loadProducts()
        }, 1000)
      } else {
        throw new Error((response && response.message) || '购买失败')
      }
    } catch (error: any) {
      marketLog.error('❌ 购买失败:', error)
      this.setData({ exchanging: false })

      let errorMessage = '购买失败，请重试'
      if (error.statusCode === 401) {
        errorMessage = '登录状态异常，请重新登录'
      } else if (error.statusCode === 400) {
        errorMessage = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        errorMessage = error.message || '商品已售出或资产余额不足'
      } else if (error.statusCode === 403) {
        errorMessage = '不能购买自己的商品'
      } else if (error.message) {
        errorMessage = error.message
      }

      wx.showModal({
        title: '🚨 购买失败',
        content: errorMessage,
        showCancel: true,
        cancelText: '重试',
        confirmText: '我知道了',
        success: (res: any) => {
          if (res.cancel) {
            setTimeout(() => {
              this.onConfirmExchange()
            }, 1000)
          }
        }
      })
    }
  },

  /** 关闭购买结果弹窗 */
  onCloseResult() {
    marketLog.info('📝 关闭购买结果弹窗')
    this.setData({ showResult: false, resultData: null })
  },

  // ============================================
  // 📖 分页
  // ============================================

  /** 上一页 */
  onPrevPage() {
    const { currentPage } = this.data
    if (currentPage > 1) {
      this.setData({ currentPage: currentPage - 1 })
      this.loadCurrentPageProducts()
      marketLog.info(`📖 切换到第 ${currentPage - 1} 页`)
    }
  },

  /** 下一页 */
  onNextPage() {
    const { currentPage, totalPages } = this.data
    if (currentPage < totalPages) {
      this.setData({ currentPage: currentPage + 1 })
      this.loadCurrentPageProducts()
      marketLog.info(`📖 切换到第 ${currentPage + 1} 页`)
    }
  },

  /** 跳转到指定页 */
  onPageChange(e: any) {
    const { page } = e.currentTarget.dataset
    const targetPage = parseInt(page)
    if (targetPage !== this.data.currentPage) {
      this.setData({ currentPage: targetPage })
      this.loadCurrentPageProducts()
      marketLog.info(`📖 跳转到第 ${targetPage} 页`)
    }
  },

  /** 页码输入变更 */
  onPageInputChange(e: any) {
    this.setData({ pageInputValue: e.detail.value })
  },

  /** 页码输入确认 */
  onPageInputConfirm(e: any) {
    const { totalPages } = this.data
    const inputValue = e.detail.value || this.data.pageInputValue
    const targetPage = parseInt(inputValue)

    marketLog.info(`📖 输入跳转页码: ${targetPage}`)

    if (isNaN(targetPage)) {
      showToast({ title: '请输入有效页码', icon: 'none' })
      return
    }
    if (targetPage < 1 || targetPage > totalPages) {
      showToast({ title: `页码范围: 1 - ${totalPages}`, icon: 'none' })
      return
    }
    if (targetPage !== this.data.currentPage) {
      this.setData({ currentPage: targetPage, pageInputValue: '' })
      this.loadCurrentPageProducts()
      showToast({ title: `已跳转到第 ${targetPage} 页`, icon: 'success' })
    }
  },

  /** 加载当前页商品数据 */
  loadCurrentPageProducts() {
    const { products, currentPage, pageSize } = this.data
    const startIndex = (currentPage - 1) * pageSize
    const endIndex = Math.min(startIndex + pageSize, products.length)
    const currentPageProducts = products.slice(startIndex, endIndex)

    marketLog.info(
      `📖 加载第${currentPage}页商品 [${startIndex}-${endIndex - 1}], 共${currentPageProducts.length}个`
    )

    this.setData({ filteredProducts: currentPageProducts })
    this.applyFilters()
  },

  /** 计算总页数 */
  calculateTotalPages() {
    const { products, pageSize } = this.data
    const totalPages = Math.max(1, Math.ceil(products.length / pageSize))
    this.setData({ totalPages, totalProducts: products.length })
    marketLog.info(
      `📊 计算分页信息: 共${products.length}个商品, 每页${pageSize}个, 共${totalPages}页`
    )
  },

  /** 清除搜索关键词 */
  onClearSearch() {
    this.setData({ searchKeyword: '', currentPage: 1 })
    this.applyFilters()
  },

  /** 跳转到"我的挂单"页面 */
  goToMyListings() {
    marketLog.info('📋 跳转到我的挂单页面')
    wx.navigateTo({
      url: '/pages/trade/my-listings/my-listings',
      fail: (error: any) => {
        marketLog.error('❌ 跳转我的挂单页面失败:', error)
        showToast({ title: '页面跳转失败', icon: 'none' })
      }
    })
  }
}

module.exports = marketHandlers

export {}
