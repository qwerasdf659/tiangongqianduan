/**
 * 道具商城组件（星石轨 · 娱乐零价值道具）
 *
 * 业务定位（对齐《道具商城与兑换空间关系及双轨合规模型》文档）：
 *   - 与「商品兑换」平级的顶层 Tab，属星石娱乐轨（零价值 prop，向下销毁）
 *   - 主货币星石 star_stone（聚合终点、只进不出、无现金出口）
 *   - 道具单禁退（后端 refundable=false / PROP_NO_REFUND），卡片不显示退款入口
 *
 * 数据契约（对接文档第 8 节，一律用后端 snake_case 原名，禁止前端映射层）：
 *   - 列表: GET /api/v4/exchange/items?item_type=prop（方案A，需后端支持 item_type 白名单筛选）
 *   - 详情: GET /api/v4/exchange/items/:exchange_item_id（复用商品详情页）
 *   - 下单: POST /api/v4/exchange（Header Idempotency-Key + body exchange_item_id/quantity/sku_id）
 *
 * 职责：
 *   1. 接收 Page 壳下传的 properties（资产余额、刷新令牌、登录态）
 *   2. 拉取 prop 道具列表（服务端分页 + 搜索）
 *   3. 通过 triggerEvent 通知 Page 壳（兑换成功、积分变动、认证错误、需登录）
 *
 * @file packageExchange/components/exchange/props-mall/props-mall.ts
 * @version 1.0.0
 * @since 2026-06-11
 */

const {
  API: propsAPI,
  Wechat: propsWechat,
  Logger: propsLogger,
  Constants: propsConstants,
  Utils: propsUtils,
  ImageHelper: propsImageHelper,
  ProductDisplay: propsProductDisplay
} = require('../../../../utils/index')

const propsLog = propsLogger.createLogger('props-mall')
const { getExchangeProducts: propsGetExchangeProducts, exchangeProduct: propsExchangeProduct } =
  propsAPI
const { showToast: propsShowToast } = propsWechat
const { debounce: propsDebounce } = propsUtils
const { PAGINATION: PROPS_PAGINATION } = propsConstants
const { enrichProductDisplayFields, resolveQuickExchangeSkuId: propsResolveQuickExchangeSkuId } =
  propsProductDisplay

Component({
  properties: {
    /** 星石和源晶类资产余额列表（Page 壳从 API.getAssetBalances 获取后下传） */
    assetBalances: { type: Array, value: [] },
    /** 可用积分余额（保留用于兑换余额校验，部分道具可能以积分计价） */
    pointsBalance: { type: Number, value: 0 },
    /** 增强效果配置（与商品兑换共用，由后端 card_display 下发） */
    effects: { type: Object, value: {} },
    /** 视图模式 'grid'|'list' */
    viewMode: { type: String, value: 'grid' },
    /** 刷新令牌（WebSocket 事件驱动，值变化触发刷新） */
    refreshToken: { type: Number, value: 0 },
    /** 组件是否激活（hidden 模式下判断当前 Tab） */
    active: { type: Boolean, value: false },
    /** 是否已登录 */
    isLoggedIn: { type: Boolean, value: false }
  },

  data: {
    /** 加载状态 */
    loading: true,
    loadingMore: false,

    /** 搜索关键词 */
    searchKeyword: '',

    /** 当前页道具列表（服务端分页） */
    propsList: [] as any[],

    /** 分页（服务端分页） */
    currentPage: 1,
    totalPages: 1,
    totalProps: 0,

    /** 兑换确认弹窗 */
    showPropConfirm: false,
    selectedProp: null as any,
    propExchangeQuantity: 1,
    propExchanging: false,
    showPropResult: false,
    propResultData: null as any
  },

  lifetimes: {
    attached() {
      this.initData()
    }
  },

  observers: {
    /** 刷新令牌变化时重新拉取道具列表 */
    refreshToken(val: number) {
      if (val > 0) {
        this.initData()
      }
    }
  },

  methods: {
    /** 搜索输入处理（500ms 防抖）→ 调用服务端筛选 */
    onSearchInput: propsDebounce(function (this: any, e: any) {
      this.setData({ searchKeyword: e.detail.value.trim() })
      this._loadProps()
    }, 500),

    /**
     * 转换后端道具数据为卡片格式
     * 后端字段: exchange_item_id（主键）、item_name（道具名称）、cost_asset_code（计价资产，星石轨多为 star_stone）
     */
    _convertToCardData(items: any[]) {
      if (!items || !Array.isArray(items)) {
        return []
      }
      return items
        .map((item: any) => {
          if (!item || !item.exchange_item_id) {
            return null
          }
          const imageUrl =
            (item.primary_image && (item.primary_image.thumbnail_url || item.primary_image.url)) ||
            propsImageHelper.DEFAULT_PRODUCT_IMAGE
          return {
            exchange_item_id: item.exchange_item_id,
            item_name: item.item_name || '',
            image: imageUrl,
            primary_media_id: item.primary_media_id || null,
            cost_amount: item.cost_amount || 0,
            cost_asset_code: item.cost_asset_code || '',
            /** 计价资产中文名 + 图标（后端 GET /exchange/items 新增下发，前端零映射直读） */
            cost_asset_name: item.cost_asset_name || '',
            cost_asset_icon_url: item.cost_asset_icon_url || null,
            sold_count: item.sold_count || 0,
            tags: item.tags || [],
            is_hot: item.is_hot || false,
            is_new: item.is_new || false,
            is_limited: item.is_limited || false,
            is_recommended: item.is_recommended || false,
            sell_point: item.sell_point || '',
            description: item.description || '',
            stock: item.stock || 0,
            sort_order: item.sort_order || 0,
            rarity_code: item.rarity_code || 'common',
            skus: Array.isArray(item.skus) ? item.skus : [],
            /** 一键兑换需要：列表接口下发的默认 SKU（单 active SKU 给值；多 SKU 为 null） */
            default_sku_id: item.default_sku_id === undefined ? null : item.default_sku_id
          }
        })
        .filter(Boolean)
    },

    /**
     * 初始化道具列表（服务端分页，item_type=prop 白名单）
     * 后端API: GET /api/v4/exchange/items?item_type=prop
     */
    async initData() {
      propsLog.info('初始化道具商城数据...')
      this.setData({ loading: true })
      await this._loadProps(1, false)
    },

    /**
     * 核心方法：构建查询参数并请求后端道具列表
     *
     * 数据流：
     *   item_type=prop + 关键词 → GET /api/v4/exchange/items
     *   → 后端 QueryService WHERE item_type='prop' → 返回道具列表 → setData 渲染
     *
     * @param page - 请求页码，默认重置到第 1 页
     * @param append - 是否追加到当前列表（加载更多）
     */
    async _loadProps(page: number = 1, append: boolean = false) {
      const { searchKeyword } = this.data
      this.setData(append ? { loadingMore: true } : { loading: true })

      try {
        const apiParams: Record<string, any> = {
          item_type: 'prop',
          page,
          page_size: PROPS_PAGINATION.WATERFALL_SIZE
        }
        if (searchKeyword) {
          apiParams.keyword = searchKeyword
        }

        const response = await propsGetExchangeProducts(apiParams)
        this._applyPropsResponse(response, page, append)
      } catch (error) {
        propsLog.error('道具列表请求失败:', error)
        this.setData({ loading: false, loadingMore: false })
      }
    },

    /** 处理道具列表响应（统一 ApiResponse：response.success + response.data） */
    _applyPropsResponse(response: any, page: number, append: boolean) {
      if (!response || !response.success || !response.data) {
        this.setData({ loading: false, loadingMore: false })
        return
      }
      const items = response.data.items || []
      const pagination = response.data.pagination || {}
      const cardProps = enrichProductDisplayFields(this._convertToCardData(items))
      const nextProps = append ? [...(this.data.propsList || []), ...cardProps] : cardProps

      this.setData({
        propsList: nextProps,
        loading: false,
        loadingMore: false,
        currentPage: page,
        totalProps: pagination.total || nextProps.length,
        totalPages: pagination.total_pages || 1
      })
    },

    /** 滚动到底部加载更多 */
    loadMore() {
      if (
        this.data.loading ||
        this.data.loadingMore ||
        this.data.currentPage >= this.data.totalPages
      ) {
        return
      }
      this._loadProps(this.data.currentPage + 1, true)
    },

    /**
     * 页码翻页栏跳转（exchange-pager 派发）。
     * 与无限滚动的「追加」语义不同：翻页是「替换式」加载，只展示目标页，
     * append=false 让列表重置为该页内容。页码合法性已由 pager 组件校验。
     */
    onPagerChange(e: any) {
      const page = e.detail && e.detail.page
      if (!page || this.data.loading || this.data.loadingMore) {
        return
      }
      this._loadProps(page, false)
    },

    /** 图片加载失败回调 */
    onImageError(e: any) {
      const index = e.currentTarget.dataset.index
      this.setData({
        [`propsList[${index}].image`]: propsImageHelper.DEFAULT_PRODUCT_IMAGE,
        [`propsList[${index}]._hasImage`]: false
      })
    },

    /** 刷新道具数据（头部刷新按钮 / 下拉刷新） */
    onRefreshProps() {
      propsLog.info('刷新道具商城数据')
      this.initData()
    },

    /** 跳转"我的订单"列表（与商品兑换共用订单页） */
    onGoToMyOrders() {
      wx.navigateTo({
        url: '/packageExchange/exchange-orders/exchange-orders'
      })
    },

    /** 未登录时点击"请登录"，通知 Page 壳弹出登录弹窗 */
    onNeedLogin() {
      this.triggerEvent('needlogin')
    },

    /**
     * 道具点击 → 跳转商品详情页（与商品兑换共用详情页）
     * 后端字段: exchange_item_id（exchange_items 表主键）
     */
    onPropTap(e: any) {
      const prop = e.currentTarget.dataset.prop
      if (!this.data.isLoggedIn) {
        this.triggerEvent('needlogin')
        return
      }
      if (!prop || !prop.exchange_item_id) {
        propsLog.error('道具数据缺少 exchange_item_id（主键），无法跳转')
        propsShowToast('道具数据异常，请刷新页面重试')
        return
      }
      wx.navigateTo({
        url: `/packageExchange/exchange-detail/exchange-detail?exchange_item_id=${prop.exchange_item_id}`,
        fail: (navError: any) => {
          propsLog.error('跳转详情页失败，降级为弹窗确认:', navError)
          this.setData({
            selectedProp: prop,
            showPropConfirm: true,
            propExchangeQuantity: 1,
            propExchanging: false
          })
        }
      })
    },

    /** 取消道具兑换操作 */
    onCancelPropExchange() {
      this.setData({
        showPropConfirm: false,
        selectedProp: null,
        propExchangeQuantity: 1
      })
    },

    /** 道具兑换数量增减 */
    onPropQuantityChange(e: any) {
      const action = e.currentTarget.dataset.action
      let { propExchangeQuantity } = this.data
      /**
       * 每单上限：优先读后端商品级 max_quantity_per_order，未下发时回退接口契约上限
       * （对接文档 16.2），再与库存取 Math.min。
       */
      const prop = this.data.selectedProp || {}
      const perOrderMax =
        typeof prop.max_quantity_per_order === 'number' && prop.max_quantity_per_order > 0
          ? prop.max_quantity_per_order
          : propsAPI.EXCHANGE_QUANTITY_CONTRACT_MAX
      const maxQty = Math.min(typeof prop.stock === 'number' ? prop.stock : 0, perOrderMax)
      if (action === 'increase') {
        propExchangeQuantity = Math.min(propExchangeQuantity + 1, maxQty)
      } else if (action === 'decrease') {
        propExchangeQuantity = Math.max(propExchangeQuantity - 1, 1)
      }
      this.setData({ propExchangeQuantity })
    },

    /**
     * 确认道具兑换（仅详情页跳转失败时的降级弹窗路径使用）
     * 后端API: POST /api/v4/exchange（Header Idempotency-Key；body exchange_item_id/quantity/sku_id）
     * 道具为零价值 prop，兑换后即时到账、禁退（refundable=false）
     */
    async onConfirmPropExchange() {
      const { selectedProp, propExchangeQuantity, propExchanging } = this.data
      if (!selectedProp || !selectedProp.exchange_item_id) {
        propsShowToast('请选择要兑换的道具')
        return
      }
      if (propExchanging) {
        return
      }

      /** 货架一键兑换仅支持「单默认 SKU」，多规格须进详情选规格 */
      const skuResolve = propsResolveQuickExchangeSkuId(selectedProp)
      if (!skuResolve.ok) {
        this._handleQuickSkuBlocked(skuResolve, selectedProp.exchange_item_id)
        return
      }

      this.setData({ propExchanging: true })
      await this._executePropExchange(
        selectedProp,
        propExchangeQuantity,
        skuResolve.sku_id as number
      )
    },

    /** 一键兑换被拦截时的提示（多规格进详情 / 无货 / 数据异常） */
    _handleQuickSkuBlocked(skuResolve: any, exchangeItemId: number) {
      if (skuResolve.reason === 'need_detail') {
        wx.showModal({
          title: '需要选择规格',
          content: skuResolve.message || '请进入道具详情选择规格',
          confirmText: '去详情',
          cancelText: '取消',
          success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
            if (res.confirm) {
              wx.navigateTo({
                url: `/packageExchange/exchange-detail/exchange-detail?exchange_item_id=${exchangeItemId}`
              })
            }
          }
        })
      } else {
        propsShowToast(skuResolve.message || '暂时无法兑换')
      }
    },

    /** 执行道具兑换请求并处理结果 */
    async _executePropExchange(selectedProp: any, quantity: number, skuId: number) {
      try {
        const response = await propsExchangeProduct(
          Number(selectedProp.exchange_item_id),
          quantity,
          skuId
        )
        if (response && response.success && response.data) {
          this.setData({
            showPropConfirm: false,
            selectedProp: null,
            propExchanging: false,
            showPropResult: true,
            propResultData: {
              product: selectedProp,
              orderNo: response.data.order_no || '',
              payAssetCode: response.data.pay_asset_code || selectedProp.cost_asset_code,
              payAmount: response.data.pay_amount || selectedProp.cost_amount,
              quantity: response.data.quantity || quantity,
              exchangeTime: response.data.exchange_time || ''
            }
          })
          this.triggerEvent('exchange', { orderData: response.data })
          this.triggerEvent('pointsupdate')
          setTimeout(() => this.initData(), 1000)
        } else {
          throw new Error((response && response.message) || '兑换失败')
        }
      } catch (error: any) {
        this._handlePropExchangeError(error)
      }
    },

    /** 道具兑换异常分类处理（401 透传认证错误，其余弹窗提示） */
    _handlePropExchangeError(error: any) {
      propsLog.error('道具兑换失败:', error)
      this.setData({ propExchanging: false })
      if (error.statusCode === 401) {
        this.triggerEvent('autherror')
        return
      }
      let errorMessage = '兑换失败，请重试'
      if (error.statusCode === 400) {
        errorMessage = error.message || '请求参数错误'
      } else if (error.statusCode === 409) {
        errorMessage = error.message || '库存不足或余额不足'
      } else if (error.message) {
        errorMessage = error.message
      }
      wx.showModal({
        title: '兑换失败',
        content: errorMessage,
        showCancel: false,
        confirmText: '我知道了'
      })
    },

    /** 关闭道具兑换结果弹窗 */
    onClosePropResult() {
      this.setData({ showPropResult: false, propResultData: null })
    },

    /** 兑换成功弹窗 → 查看订单详情（与商品兑换共用订单详情页） */
    onViewPropOrder(e: any) {
      const orderNo = e.detail?.orderNo
      this.setData({ showPropResult: false, propResultData: null })
      if (orderNo) {
        wx.navigateTo({
          url: `/packageExchange/exchange-order-detail/exchange-order-detail?order_no=${orderNo}`
        })
      } else {
        wx.navigateTo({ url: '/packageExchange/exchange-orders/exchange-orders' })
      }
    },

    /** 对外暴露的刷新方法（供 Page 壳 selectComponent 调用） */
    refresh() {
      this.initData()
    }
  }
})
