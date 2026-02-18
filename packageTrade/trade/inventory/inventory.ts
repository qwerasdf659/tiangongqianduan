/**
 * 📦 库存管理页面（背包系统） - 对齐后端对接文档
 *
 * 业务功能：用户个人物品库存管理中 * 后端API（对齐后端真实路由） *   - GET  /api/v4/backpack/                        获取用户背包（双轨结构：assets[] + items[] *   - GET  /api/v4/backpack/stats                   获取背包统计（total_assets / total_items / total_asset_value *   - GET  /api/v4/backpack/items/:item_instance_id 物品详情
 *   - POST /api/v4/backpack/items/:id/use           使用物品
 *   - POST /api/v4/backpack/items/:id/redeem        生成核销码（12位Base320天有效，仅返回一次明文）
 *   - POST /api/v4/market/list                      上架物品到交易市场（需Idempotency-Key *
 * 后端返回的物品字段（snake_case，后端为权威来源）：
 *   item_instance_id  - 物品实例唯一ID（bigint *   item_type         - 物品类型编码（prize/product/voucher/tradable_item/service *   item_type_display - 物品类型中文名（后端自动附加 *   name              - 物品名称
 *   status            - 物品状态（available/locked/used/expired/transferred *   status_display    - 物品状态中文名（后端自动附加）
 *   rarity            - 稀有度编码（common/uncommon/rare/epic/legendary *   rarity_display    - 稀有度中文名（后端自动附加 *   description       - 物品描述
 *   acquired_at       - 获得时间（YYYY-MM-DD HH:mm:ss 格式 *   expires_at        - 过期时间（可null *   has_redemption_code - 是否已生成核销 *
 * ⚠️ 注意：背包列表只返回 status = 'available' 的物 *
 * @file packageTrade/trade/inventory/inventory.ts
 * @version 5.2.0
 * @since 2026-02-15
 */

// 🔴 统一工具函数导入（通过utils/index.ts）
const { Utils, Wechat, API, Logger, ApiWrapper } = require('../../../utils/index')
const log = Logger.createLogger('inventory')
const { showToast } = Wechat
const { checkAuth } = Utils
const { safeApiCall } = ApiWrapper

// MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { tradeStore } = require('../../../store/trade')
const { userStore } = require('../../../store/user')

Page({
  data: {
    // ===== 用户基础信息 =====
    isLoggedIn: false,
    userInfo: null as any,

    // ===== 可叠加资产数据（后端 assets[] ====
    /**
     * 可叠加资产列表（积分、钻石、碎片等     * 后端字段：asset_code, display_name, total_amount, frozen_amount, available_amount, category, rarity, rarity_display
     */
    backpackAssets: [] as API.BackpackAsset[],

    // ===== 不可叠加物品数据（后端 items[]） =====
    /** 筛选排序后的物品列表（WXML模板渲染数据源，分页加载） */
    filteredItems: [] as API.BackpackItem[],
    /** 是否还有更多物品可加载（触底加载更多） */
    hasMoreItems: false,

    // ===== 统计数据（来GET /api/v4/backpack/stats====
    /** 资产种类数量 */
    totalAssets: 0,
    /** 可用物品数量 */
    totalItems: 0,
    /** 所有资产可用余额总和 */
    totalAssetValue: 0,

    // ===== 分类统计（来GET /api/v4/backpack/stats items_by_type====
    /** ?item_type 分组的物品数量统计，后端权威数据 */
    categoryStats: {
      /** 全部物品?*/
      all: 0,
      /** 奖品（prize?*/
      prize: 0,
      /** 兑换券（voucher?*/
      voucher: 0,
      /** 商品（product?*/
      product: 0,
      /** 可交易物品（tradable_item?*/
      tradable_item: 0,
      /** 服务权益（service?*/
      service: 0
    },

    // ===== 筛选状态=====
    /** 当前分类：all | prize | voucher | product | tradable_item | service */
    currentCategory: 'all',
    /** 当前排序：newest | oldest | expire_soon */
    currentSort: 'newest',
    /** 搜索关键?*/
    searchKeyword: '',

    // ===== 页面状态=====
    /** 首次加载中（显示loading占位?*/
    loading: false,
    /** 静默刷新中（下拉刷新、回到页面时间*/
    refreshing: false,

    // ===== UI状态=====
    /** 筛选面板是否显?*/
    showFilterPanel: false,

    // ===== 错误状态管=====
    hasError: false,
    errorMessage: '',
    errorDetail: ''
  },

  // 防抖搜索定时器
  searchTimer: 0 as any,
  // MobX绑定实例
  tradeBindings: null as any,
  /**
   * 全量物品数据（仅在JS逻辑层保留，不通过setData传输到WXML层）
   * 解决 setData 传输 1390KB 性能问题：3422个物品 × 每个约400字节
   * WXML层只接收分页后的 filteredItems（每页50条，约20KB）
   */
  _allItems: [] as any[],
  /** 当前已加载到WXML的filteredItems分页数 */
  _displayPage: 0,
  /** 筛选排序后的完整结果（JS逻辑层缓存，分页截取后传入data） */
  _filteredAllItems: [] as any[],
  /** 首次加载标志（防止onLoad+onShow重复调用loadInventoryData） */
  _isFirstLoad: true,

  /**
   * 生命周期 - 页面加载
   */
  onLoad(_options: any) {
    log.info(' 仓库页面加载')

    // MobX Store绑定 - 库存加载状态同
    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: ['inventoryLoading'],
      actions: ['setInventoryItems', 'setInventoryLoading']
    })

    this.initPage()
  },

  /**
   * 生命周期 - 页面显示
   * 仅在非首次加载时静默刷新（从其他页面返回、后台切回前台）
   * 首次加载由 initPage() 处理，避免与 onLoad 重复发起 backpack API 请求
   */
  onShow() {
    if (this._isFirstLoad) {
      return
    }
    if (this.data.isLoggedIn) {
      this.loadInventoryData(true)
    }
  },

  /**
   * 初始化库存管理页   *
   * 执行流程   * 1. 检查用户登录状态（未登录自动跳转认证页   * 2. 设置用户信息
   * 3. 首次加载背包数据（显示loading状态）
   */
  async initPage() {
    try {
      if (!checkAuth()) {
        return
      }

      this.setData({
        isLoggedIn: true,
        userInfo: userStore.userInfo
      })

      await this.loadInventoryData(false)
    } catch (error: any) {
      log.error('初始化失败', error)
      showToast('初始化失败，请重试')
    } finally {
      this._isFirstLoad = false
    }
  },

  /**
   * 加载用户背包数据
   *
   * 后端API: GET /api/v4/backpack/
   * 返回格式: { success: true, data: { assets: BackpackAsset[], items: BackpackItem[] } }
   *
   * 执行流程   * 1. 调用 getUserInventory() 获取背包数据（通过JWT Token识别用户，无需传userId   * 2. 解析双轨结构：assets（可叠加资产 items（不可叠加物品）
   * 3. 为每个物品计算前端操作标志（can_use / can_generate_code / can_sell   * 4. 计算分类统计数量
   * 5. 独立加载背包统计数据
   * 6. 应用当前筛选排序条   *
   * @param refresh - true=静默刷新（不显示loading），false=首次加载（显示loading占位   */
  async loadInventoryData(refresh: boolean = false) {
    if (refresh) {
      this.setData({ refreshing: true })
    } else {
      this.setData({ loading: true })
    }

    try {
      // getUserInventory() 不传参数，后端通过JWT Token自动识别用户身份
      const result = await API.getUserInventory()
      const { success, data } = result

      if (success && data) {
        // 后端返回双轨结构: { assets: BackpackAsset[], items: BackpackItem[] }
        const { assets = [], items = [] } = data

        /**
         * 处理可叠加资产（积分、钻石等         * 后端已返is_tradable 字段（boolean），精确控制"上架到市按钮显示
         * is_tradable=true 的资产才能上架到交易市场
         */
        const backpackAssets = assets

        // 为每个物品添加前端计算的操作标志（基于物品状态和字段决定UI按钮显示
        const processedItems = items.map((item: any) => ({
          ...item,
          /**
           * 前端计算的操作标志：
           * can_use           = status === 'available'              "立即使用"按钮
           * can_generate_code = status === 'available' && !has_redemption_code "生成核销按钮
           * can_sell          = status === 'available'              "上架到市按钮
           */
          can_use: item.status === 'available',
          can_generate_code: item.status === 'available' && !item.has_redemption_code,
          can_sell: item.status === 'available'
        }))

        log.info('成功加载背包数据:', {
          assetCount: backpackAssets.length,
          itemCount: processedItems.length
        })

        // 全量数据存储在JS逻辑层（不通过setData传输，避免1390KB传输瓶颈）
        this._allItems = processedItems

        this.setData({
          backpackAssets,
          hasError: false,
          errorMessage: '',
          errorDetail: '',
          loading: false,
          refreshing: false
        })

        if (typeof this.setInventoryItems === 'function') {
          this.setInventoryItems(items)
        }

        this.loadBackpackStats()
        this.applyFilters()
      } else {
        this.handleLoadError('库存数据加载失败', '请稍后重试或联系客服')
      }
    } catch (error: any) {
      log.error('加载背包数据失败:', error)
      this.handleLoadError('库存数据加载失败', error.message || '请稍后重试或联系客服')
    }
  },

  /**
   * 加载背包统计数据
   *
   * 后端API: GET /api/v4/backpack/stats
   * 返回字段:
   *   total_assets      - 资产种类数量（有余额的资产类型数据   *   total_items       - 可用物品数量（status=available   *   total_asset_value - 所有资产可用余额总和
   *   items_by_type     - 按item_type分组的物品数量（后端权威数据   *                       示例: { product: 1505, voucher: 1823, tradable_item: 28, prize: 1 }
   *
   * items_by_type 由后端直接返回，前端无需自行遍历 items[] 计算分类统计
   * 非关键数据，加载失败不影响主流程
   */
  async loadBackpackStats() {
    const statsData = await safeApiCall(() => API.getBackpackStats(), {
      context: '获取背包统计',
      silent: true
    })
    if (statsData) {
      const { total_assets, total_items, total_asset_value, items_by_type } = statsData

      const categoryStats = {
        all: total_items || 0,
        prize: (items_by_type && items_by_type.prize) || 0,
        voucher: (items_by_type && items_by_type.voucher) || 0,
        product: (items_by_type && items_by_type.product) || 0,
        tradable_item: (items_by_type && items_by_type.tradable_item) || 0,
        service: (items_by_type && items_by_type.service) || 0
      }

      this.setData({
        totalAssets: total_assets || 0,
        totalItems: total_items || 0,
        totalAssetValue: total_asset_value || 0,
        categoryStats
      })
      log.info('背包统计:', { total_assets, total_items, total_asset_value, items_by_type })
    }
  },

  /**
   * 处理数据加载错误（统一错误状态设置）
   */
  handleLoadError(message: string, detail: string) {
    this._allItems = []
    this._filteredAllItems = []
    this._displayPage = 0
    this.setData({
      backpackAssets: [],
      filteredItems: [],
      hasMoreItems: false,
      totalAssets: 0,
      totalItems: 0,
      totalAssetValue: 0,
      categoryStats: { all: 0, prize: 0, voucher: 0, product: 0, tradable_item: 0, service: 0 },
      errorMessage: message,
      errorDetail: detail,
      hasError: true,
      loading: false,
      refreshing: false
    })
  },

  /**
   * 应用筛选和排序条件
   *
   * 筛选字段使用后端snake_case命名   *   - 分类筛选：item_type 字段（all | prize | voucher | product | tradable_item | service   *   - 关键词搜索：name + description 字段
   *
   * 排序字段使用后端snake_case命名   *   - newest：按 acquired_at 降序（最新优先）
   *   - oldest：按 acquired_at 升序（最早优先）
   *   - expire_soon：按 expires_at 升序（即将过期优先）
   *
   * ⚠️ 背包列表只返status='available' 的物品，因此不提供状态筛   */
  /**
   * 每页加载物品数量（UI常量，前端自主决定）
   * 每页50条约20KB，远低于微信推荐的256KB限制
   */
  _pageSize: 50,

  applyFilters() {
    let filteredItems = [...this._allItems]

    if (this.data.currentCategory !== 'all') {
      filteredItems = filteredItems.filter(
        (item: any) => item.item_type === this.data.currentCategory
      )
    }

    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredItems = filteredItems.filter(
        (item: any) =>
          (item.name && item.name.toLowerCase().includes(keyword)) ||
          (item.description && item.description.toLowerCase().includes(keyword))
      )
    }

    filteredItems.sort((a: any, b: any) => {
      switch (this.data.currentSort) {
        case 'newest':
          return (
            (Utils.safeParseDateString(b.acquired_at) || new Date(0)).getTime() -
            (Utils.safeParseDateString(a.acquired_at) || new Date(0)).getTime()
          )
        case 'oldest':
          return (
            (Utils.safeParseDateString(a.acquired_at) || new Date(0)).getTime() -
            (Utils.safeParseDateString(b.acquired_at) || new Date(0)).getTime()
          )
        case 'expire_soon':
          if (!a.expires_at && !b.expires_at) {
            return 0
          }
          if (!a.expires_at) {
            return 1
          }
          if (!b.expires_at) {
            return -1
          }
          return (
            (Utils.safeParseDateString(a.expires_at) || new Date(0)).getTime() -
            (Utils.safeParseDateString(b.expires_at) || new Date(0)).getTime()
          )
        default:
          return 0
      }
    })

    // 缓存完整筛选结果到JS逻辑层，分页截取后传入WXML
    this._filteredAllItems = filteredItems
    this._displayPage = 1
    const firstPage = filteredItems.slice(0, this._pageSize)

    this.setData({
      filteredItems: firstPage,
      hasMoreItems: filteredItems.length > this._pageSize
    })
  },

  /**
   * 触底加载更多物品（无限滚动分页）
   * 从 _filteredAllItems 缓存中截取下一页追加到 filteredItems
   */
  onReachBottom() {
    if (!this.data.hasMoreItems) {
      return
    }

    this._displayPage += 1
    const endIndex = this._displayPage * this._pageSize
    const nextPage = this._filteredAllItems.slice(
      (this._displayPage - 1) * this._pageSize,
      endIndex
    )

    if (nextPage.length === 0) {
      this.setData({ hasMoreItems: false })
      return
    }

    // 追加数据到现有列表（避免重传已有数据）
    const currentItems = this.data.filteredItems
    this.setData({
      filteredItems: currentItems.concat(nextPage),
      hasMoreItems: endIndex < this._filteredAllItems.length
    })
  },

  /**
   * 切换物品分类
   * WXML绑定: <view bindtap="onCategoryChange" data-category="voucher">
   */
  onCategoryChange(e: any) {
    const category = e.currentTarget.dataset.category
    this.setData({ currentCategory: category })
    this.applyFilters()
  },

  /**
   * 搜索关键词输入（防抖500ms   * WXML绑定: <input bindinput="onSearchInput" />
   */
  onSearchInput(e: any) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 防抖搜索，避免频繁触发筛选
    clearTimeout(this.searchTimer)
    const searchDelay = 500
    this.searchTimer = setTimeout(() => {
      this.applyFilters()
    }, searchDelay)
  },

  /**
   * 显示筛选面   */
  onShowFilter() {
    this.setData({ showFilterPanel: true })
  },

  /**
   * 隐藏筛选面   */
  onHideFilter() {
    this.setData({ showFilterPanel: false })
  },

  /**
   * 切换排序方式
   * WXML绑定: <view bindtap="onSortChange" data-sort="newest">
   */
  onSortChange(e: any) {
    const sort = e.currentTarget.dataset.sort
    this.setData({
      currentSort: sort,
      showFilterPanel: false
    })
    this.applyFilters()
  },

  /**
   * 使用物品
   *
   * 后端API: POST /api/v4/backpack/items/:item_instance_id/use
   * 成功返回: { success: true, data: { item_instance_id, status: "used", is_duplicate } }
   *
   * WXML绑定: <button bindtap="onUseItem" data-item="{{item}}">
   * 前置条件: item.can_use === true（物品状态为available   */
  onUseItem(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item || !item.can_use) {
      showToast('该物品暂不支持使用')
      return
    }

    wx.showModal({
      title: '确认使用',
      content: `确定要使?${item.name}"吗？使用后将无法撤销。`,
      success: async (res: any) => {
        if (res.confirm) {
          await this.executeUseItem(item.item_instance_id)
        }
      }
    })
  },

  /**
   * 执行使用物品
   *
   * 后端API: POST /api/v4/backpack/items/:item_instance_id/use
   * 成功返回: { item_instance_id, status: "used", is_duplicate }
   * is_duplicate: true 表示幂等回放（重复请求返回首次结果）
   *
   * @param itemInstanceId - 物品实例ID（后端字符 item_instance_id   */
  async executeUseItem(itemInstanceId: number) {
    wx.showLoading({ title: '使用户..' })
    try {
      const result = await API.useInventoryItem(itemInstanceId)
      wx.hideLoading()

      if (result.success) {
        showToast(result.message || '使用成功')
        // 刷新背包数据
        this.loadInventoryData(true)
      } else {
        showToast(result.message || '使用失败，请重试')
      }
    } catch (error: any) {
      wx.hideLoading()
      log.error('使用物品失败:', error)
      showToast(error.message || '使用失败，请重试')
    }
  },

  /**
   * 生成核销码（用户到店出示，商家扫码核销   *
   * 后端API: POST /api/v4/backpack/items/:item_instance_id/redeem
   * 成功返回:
   *   {
   *     order: { redemption_order_id, status: "pending", expires_at },
   *     code: "ABCD1234EFGH"  12位Base32格式，仅此一次返回明文，30天有   *   }
   *
   * 业务流程: 用户点击"生成核销 后端生成核销用户到店出示 商家扫码核销
   * WXML绑定: <button bindtap="onGenerateCode" data-item="{{item}}">
   */
  async onGenerateCode(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item) {
      showToast('物品信息无效')
      return
    }

    if (item.has_redemption_code) {
      showToast('该物品已生成过核销码')
      return
    }

    try {
      const response = await API.redeemInventoryItem(item.item_instance_id)

      if (response.success && response.data) {
        // 后端返回字段: data.code2位Base32明文核销码，仅此一次返回）
        const redemptionCode = response.data.code || ''
        const expiresAt =
          response.data.order && response.data.order.expires_at
            ? response.data.order.expires_at
            : ''

        let modalContent = `核销码：${redemptionCode}`
        if (expiresAt) {
          modalContent += `\n有效期至：${expiresAt}`
        }
        modalContent += '\n\n⚠️ 核销码仅显示一次，请妥善保管！\n请在有效期内到店出示此码完成核销。'

        wx.showModal({
          title: response.message || '核销码生成成功',
          content: modalContent,
          showCancel: false,
          confirmText: '复制核销码',
          success: (res: any) => {
            if (res.confirm && redemptionCode) {
              wx.setClipboardData({
                data: redemptionCode,
                success: () => showToast('核销码已复制')
              })
            }
          }
        })

        // 刷新背包数据（物品状态可能变为locked
        this.loadInventoryData(true)
      } else {
        throw new Error(response.message || '生成失败')
      }
    } catch (error: any) {
      log.error('生成核销码失败', error)
      showToast(error.message || '生成失败，请重试')
    }
  },

  /**
   * 上架物品到交易市   *
   * 后端API: POST /api/v4/market/list
   * 请求Header: Idempotency-Key: market_list_<timestamp>_<random>（必填）
   * 请求Body: { item_instance_id, price_amount, price_asset_code }
   *
   * 定价币种: DIAMOND（钻石）red_shard（红水晶碎片）
   * 上架限制: 用户最多同时上0件商   *
   * WXML绑定: <button bindtap="onSellItem" data-item="{{item}}">
   */
  onSellItem(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item) {
      showToast('物品信息无效')
      return
    }

    if (!item.can_sell) {
      showToast('该物品暂不支持上架')
      return
    }

    this._selectCurrencyThenSellItem(item)
  },

  /**
   * 上架可叠加资产到交易市场
   *
   * 后端API: POST /api/v4/market/fungible-assets/list
   * 请求Header: Idempotency-Key（防止重复上架）
   * 请求Body: { asset_code, amount, price_amount, price_asset_code }
   *
   * 上架限制: 用户最多同时上0件商品（物品+材料共享额度   *
   * 前端根据后端返回is_tradable 字段精确控制"上架到市按钮   *   is_tradable=true  允许上架
   *   is_tradable=false 不可交易（如普通积分POINTS   *
   * WXML绑定: <button bindtap="onSellAsset" data-asset="{{item}}">
   */
  onSellAsset(e: any) {
    const asset = e.currentTarget.dataset.asset

    if (!asset || !asset.asset_code) {
      showToast('资产信息无效')
      return
    }

    // 根据后端 is_tradable 字段判断是否可交
    if (!asset.is_tradable) {
      showToast(`${asset.display_name || '该资产'}不支持交易`)
      return
    }

    if (!asset.available_amount || asset.available_amount <= 0) {
      showToast('可用余额不足，无法上架')
      return
    }

    this._selectCurrencyThenSellAsset(asset)
  },

  /**
   * 查看物品详情（调用后端API获取最新数据）
   *
   * 后端API: GET /api/v4/backpack/items/:item_instance_id
   * 返回字段（比列表is_owner 字段
   *   item_instance_id, item_type, item_type_display, item_type_color,
   *   name, status, status_display, status_color,
   *   rarity, rarity_display, rarity_color,
   *   description, acquired_at, expires_at, is_owner, has_redemption_code
   *
   * WXML绑定: <view bindtap="onViewItem" data-item="{{item}}">
   */
  async onViewItem(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item || !item.item_instance_id) {
      showToast('物品信息无效')
      return
    }

    try {
      // 调用后端API获取最新物品详情（比列表数据多 is_owner 等字段）
      const result = await API.getInventoryItem(item.item_instance_id)

      if (result.success && result.data) {
        const detail = result.data
        this.showItemDetailModal(detail)
      } else {
        // API调用失败，使用列表中的本地数据作为降级方案
        log.warn('获取物品详情失败，使用列表缓存数据')
        this.showItemDetailModal(item)
      }
    } catch (error: any) {
      log.warn('获取物品详情异常，使用列表缓存数据', error.message)
      // 降级方案：使用列表传入的本地数据
      this.showItemDetailModal(item)
    }
  },

  /**
   * 展示物品详情弹窗
   * 使用后端返回*_display 字段显示中文（后端为权威来源，前端不做映射）
   *
   * @param itemDetail - 物品详情数据（来自后端API或列表缓存）
   */
  showItemDetailModal(itemDetail: any) {
    let details = ''

    if (itemDetail.description) {
      details += `描述?{itemDetail.description}\n`
    }
    // 使用后端返回item_type_display 中文
    if (itemDetail.item_type_display) {
      details += `类型?{itemDetail.item_type_display}\n`
    }
    // 使用后端返回status_display 中文
    if (itemDetail.status_display) {
      details += `状态：${itemDetail.status_display}\n`
    }
    // 使用后端返回rarity_display 中文
    if (itemDetail.rarity_display) {
      details += `稀有度?{itemDetail.rarity_display}\n`
    }
    if (itemDetail.acquired_at) {
      details += `获得时间隔{itemDetail.acquired_at}\n`
    }
    if (itemDetail.expires_at) {
      details += `过期时间隔{itemDetail.expires_at}\n`
    }
    if (itemDetail.has_redemption_code) {
      details += `核销码：已生成\n`
    }

    wx.showModal({
      title: itemDetail.name || '物品详情',
      content: details || '暂无详情',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 下拉刷新处理
   */
  onPullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadInventoryData(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 跳转到抽奖页   */
  goToLottery() {
    log.info('跳转到抽奖页面')
    wx.switchTab({
      url: '/pages/lottery/lottery',
      fail: (error: any) => {
        log.error('跳转失败:', error)
        showToast('页面跳转失败，请重试')
      }
    })
  },

  /**
   * 从后端获取结算币种列表，让用户选择定价币种，然后上架物品实例
   * 后端API: GET /api/v4/market/settlement-currencies
   * 响应: { currencies: [{ asset_code, display_name }] }
   */
  async _selectCurrencyThenSellItem(item: any) {
    try {
      const currencyResult = await API.getSettlementCurrencies()
      if (!currencyResult.success || !currencyResult.data?.currencies?.length) {
        showToast('获取定价币种失败')
        return
      }
      const currencyList: Array<{ asset_code: string; display_name: string }> =
        currencyResult.data.currencies
      const displayLabels = currencyList.map((c: any) => `${c.display_name}（${c.asset_code}）`)

      wx.showActionSheet({
        itemList: displayLabels,
        success: (sheetRes: any) => {
          const selectedCurrency = currencyList[sheetRes.tapIndex]

          wx.showModal({
            title: `上架 "${item.name}"`,
            content: `请输入售价（单位：${selectedCurrency.display_name}）`,
            editable: true,
            placeholderText: `请输入${selectedCurrency.display_name}数量（正整数）`,
            success: async (modalRes: any) => {
              if (!modalRes.confirm) {
                return
              }
              const priceAmount = parseInt(modalRes.content)
              if (!modalRes.content || isNaN(priceAmount) || priceAmount <= 0) {
                showToast('请输入有效的正整数价格')
                return
              }
              try {
                const result = await API.sellToMarket({
                  item_instance_id: item.item_instance_id,
                  price_amount: priceAmount,
                  price_asset_code: selectedCurrency.asset_code
                })
                if (result.success) {
                  showToast(result.message || '上架成功')
                  this.loadInventoryData(true)
                } else {
                  showToast(result.message || '上架失败，请重试')
                }
              } catch (sellError: any) {
                log.error('上架到市场失败', sellError)
                showToast(sellError.message || '上架失败，请重试')
              }
            }
          })
        }
      })
    } catch (error: any) {
      log.error('获取结算币种失败', error)
      showToast('获取定价币种失败，请重试')
    }
  },

  /**
   * 从后端获取结算币种列表，让用户选择定价币种，然后上架可叠加资产
   * 后端API: GET /api/v4/market/settlement-currencies
   */
  async _selectCurrencyThenSellAsset(asset: any) {
    try {
      const currencyResult = await API.getSettlementCurrencies()
      if (!currencyResult.success || !currencyResult.data?.currencies?.length) {
        showToast('获取定价币种失败')
        return
      }
      const currencyList: Array<{ asset_code: string; display_name: string }> =
        currencyResult.data.currencies
      const displayLabels = currencyList.map((c: any) => `${c.display_name}（${c.asset_code}）`)

      wx.showActionSheet({
        itemList: displayLabels,
        success: (sheetRes: any) => {
          const selectedCurrency = currencyList[sheetRes.tapIndex]

          wx.showModal({
            title: `上架 "${asset.display_name}"`,
            content: `可用余额: ${asset.available_amount}\n请输入上架数量`,
            editable: true,
            placeholderText: '请输入上架数量（正整数）',
            success: (amountRes: any) => {
              if (!amountRes.confirm) {
                return
              }
              const sellAmount = parseInt(amountRes.content)
              if (!amountRes.content || isNaN(sellAmount) || sellAmount <= 0) {
                showToast('请输入有效的正整数数量')
                return
              }
              if (sellAmount > asset.available_amount) {
                showToast(`上架数量不能超过可用余额 ${asset.available_amount}`)
                return
              }

              wx.showModal({
                title: `定价（${selectedCurrency.display_name}）`,
                content: `上架 ${sellAmount} 个${asset.display_name}\n请输入总售价`,
                editable: true,
                placeholderText: `请输入${selectedCurrency.display_name}数量（正整数）`,
                success: async (priceRes: any) => {
                  if (!priceRes.confirm) {
                    return
                  }
                  const priceAmount = parseInt(priceRes.content)
                  if (!priceRes.content || isNaN(priceAmount) || priceAmount <= 0) {
                    showToast('请输入有效的正整数价格')
                    return
                  }
                  try {
                    const result = await API.sellFungibleAssets({
                      asset_code: asset.asset_code,
                      amount: sellAmount,
                      price_amount: priceAmount,
                      price_asset_code: selectedCurrency.asset_code
                    })
                    if (result.success) {
                      showToast(result.message || '上架成功')
                      this.loadInventoryData(true)
                    } else {
                      showToast(result.message || '上架失败，请重试')
                    }
                  } catch (sellError: any) {
                    log.error('上架资产到市场失败', sellError)
                    showToast(sellError.message || '上架失败，请重试')
                  }
                }
              })
            }
          })
        }
      })
    } catch (error: any) {
      log.error('获取结算币种失败', error)
      showToast('获取定价币种失败，请重试')
    }
  },

  /**
   * 生命周期 - 页面卸载
   */
  onUnload() {
    // 销毁MobX Store绑定
    if (this.tradeBindings) {
      this.tradeBindings.destroyStoreBindings()
    }
    // 清除搜索防抖定时器
    clearTimeout(this.searchTimer)
  },

  /**
   * 用户点击右上角分   */
  onShareAppMessage() {
    return {
      title: '我的仓库',
      path: '/packageTrade/trade/inventory/inventory'
    }
  }
})

export {}
