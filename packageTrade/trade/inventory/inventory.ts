/**
 * 📦 库存管理页面（背包系统） - 对齐后端对接文档
 *
 * 业务功能：用户个人物品库存管理中 * 后端API（对齐后端真实路由） *   - GET  /api/v4/backpack/                        获取用户背包（双轨结构：assets[] + items[] *   - GET  /api/v4/backpack/stats                   获取背包统计（total_assets / total_items / total_asset_value *   - GET  /api/v4/backpack/items/:item_instance_id 物品详情
 *   - POST /api/v4/backpack/items/:item_instance_id/use    使用物品
 *   - POST /api/v4/backpack/items/:item_instance_id/redeem 生成核销码（12位Base320天有效，仅返回一次明文）
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
const {
  Utils,
  Wechat,
  API,
  Logger,
  ApiWrapper,
  QRCode,
  ImageHelper
} = require('../../../utils/index')
const log = Logger.createLogger('inventory')
const { showToast } = Wechat
const { checkAuth } = Utils
const { safeApiCall } = ApiWrapper
const { getMaterialIconPath } = ImageHelper

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
    /** 按item_type分组的物品数量统计，后端权威数据 */
    categoryStats: {
      /** 全部物品 */
      all: 0,
      /** 奖品（prize） */
      prize: 0,
      /** 兑换券（voucher） */
      voucher: 0,
      /** 商品（product） */
      product: 0,
      /** 可交易物品（tradable_item） */
      tradable_item: 0,
      /** 服务权益（service） */
      service: 0
    },

    // ===== 筛选状态=====
    /** 当前分类：all | prize | voucher | product | tradable_item | service */
    currentCategory: 'all',
    /** 当前排序：newest | oldest | expire_soon */
    currentSort: 'newest',
    /** 搜索关键词 */
    searchKeyword: '',

    // ===== 页面状态=====
    /** 首次加载中（显示loading占位） */
    loading: false,
    /** 静默刷新中（下拉刷新、回到页面时间*/
    refreshing: false,

    // ===== UI状态=====
    /** 筛选面板是否显示 */
    showFilterPanel: false,

    // ===== 错误状态管=====
    hasError: false,
    errorMessage: '',
    errorDetail: '',

    // ===== 核销码QR码展示（模型A：O2O动态码） =====
    /** 是否显示核销码QR码弹窗 */
    showRedemptionQR: false,
    /** QR码图片临时路径（Canvas导出） */
    redemptionQRImage: '',
    /** 12位Base32文本码（备用，格式 XXXX-YYYY-ZZZZ） */
    redemptionTextCode: '',
    /** 当前核销的物品名称 */
    redemptionItemName: '',
    /** 核销码有效期至（ISO8601，运营配置的核销码过期时间） */
    redemptionExpiresAt: '',
    /** QR码倒计时（秒，5分钟=300秒） */
    qrCountdown: 0,
    /** QR码倒计时文字（如 "4:30"） */
    qrCountdownText: '',
    /** QR码是否已过期（需刷新） */
    qrExpired: false,
    /** QR码刷新中状态 */
    qrRefreshing: false,
    /** 当前核销物品的 item_instance_id（刷新QR码用） */
    _redemptionItemId: 0,
    /** 当前核销按钮文案（"到店领取" / "到店使用" / "核销"） */
    redemptionActionLabel: ''
  },

  // 防抖搜索定时器
  searchTimer: 0 as any,
  // MobX绑定实例
  tradeBindings: null as any,
  // 核销码QR码倒计时定时器
  _qrTimer: null as any,
  // QR码过期时间戳（ms）
  _qrExpiresAt: 0,
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
   * 初始化库存管理页面
   *
   * 执行流程：
   * 1. 检查用户登录状态（未登录自动跳转认证页）
   * 2. 设置用户信息
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
   * 执行流程：
   * 1. 调用 getUserInventory() 获取背包数据（通过JWT Token识别用户，无需传userId）
   * 2. 解析双轨结构：assets（可叠加资产）、items（不可叠加物品）
   * 3. 基于后端 allowed_actions 数组计算 WXML 操作标志（can_use / can_generate_code / can_sell）
   * 4. 计算分类统计数量
   * 5. 独立加载背包统计数据
   * 6. 应用当前筛选排序条件
   *
   * @param refresh - true=静默刷新（不显示loading），false=首次加载（显示loading占位）
   */
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
         * 处理可叠加资产（积分、钻石等）
         * 后端已返回 is_tradable 字段（boolean），精确控制"上架到市场"按钮显示
         * is_tradable=true 的资产才能上架到交易市场
         *
         * icon_path: 由前端 image-helper.ts 根据 asset_code 映射本地 WebP 图标路径
         * 图标规格：256×256 WebP（quality 90），存放于 images/icons/materials/
         */
        const backpackAssets = assets.map((asset: any) => ({
          ...asset,
          icon_path: getMaterialIconPath(asset.asset_code)
        }))

        /**
         * 基于后端 allowed_actions 数组计算 WXML 模板所需的布尔标志
         *
         * 数据流: 后端 system_configs(item_type_action_rules) → BackpackService._getItems() → allowed_actions[]
         *         → 前端 Array.includes() 转布尔 → WXML wx:if 绑定
         *
         * 业务规则（后端权威，前端不硬编码）:
         *   product/voucher → ["redeem","sell"]  实物需到店核销，不支持线上"使用"
         *   prize           → ["redeem"]         奖品不可交易
         *   service         → ["use"]            线上权益直接激活
         *   tradable_item   → ["use","sell"]     虚拟道具可用可交易
         */
        const processedItems = items.map((item: any) => {
          const actions: string[] = Array.isArray(item.allowed_actions) ? item.allowed_actions : []
          return {
            ...item,
            can_use: actions.includes('use'),
            can_generate_code: actions.includes('redeem') && !item.has_redemption_code,
            can_sell: actions.includes('sell')
          }
        })

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
   *   total_assets      - 资产种类数量（有余额的资产类型数）
   *   total_items       - 可用物品数量（status=available）
   *   total_asset_value - 所有资产可用余额总和
   *   items_by_type     - 按item_type分组的物品数量（后端权威数据）
   *                       示例: { product: 1505, voucher: 1823, tradable_item: 28, prize: 1 }
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
   * 筛选字段使用后端 snake_case 命名：
   *   - 分类筛选：item_type 字段（all | prize | voucher | product | tradable_item | service）
   *   - 关键词搜索：name + description 字段
   *
   * 排序字段使用后端 snake_case 命名：
   *   - newest：按 acquired_at 降序（最新优先）
   *   - oldest：按 acquired_at 升序（最早优先）
   *   - expire_soon：按 expires_at 升序（即将过期优先）
   *
   * ⚠️ 背包列表只返回 status='available' 的物品，因此不提供状态筛选
   */
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
   * 搜索关键词输入（防抖500ms）
   * WXML绑定: <input bindinput="onSearchInput" />
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
   * 显示筛选面板
   */
  onShowFilter() {
    this.setData({ showFilterPanel: true })
  },

  /**
   * 隐藏筛选面板
   */
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
   * 前置条件: item.can_use === true（后端 allowed_actions 包含 'use'）
   */
  onUseItem(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item || !item.can_use) {
      showToast('该物品暂不支持使用')
      return
    }

    wx.showModal({
      title: '确认使用',
      content: `确定要使用「${item.name}」吗？使用后将无法撤销。`,
      success: async (res: any) => {
        if (res.confirm) {
          await this.executeUseItem(item)
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
   * 使用结果通过 wx.showModal 展示给用户，包含：
   *   - 物品名称（来自列表传入的 item.name）
   *   - 后端返回的 message（使用结果说明）
   *   - 后端返回的 instructions（使用指引，如有）
   *   - 幂等回放提示（is_duplicate 为 true 时）
   *
   * @param item - 物品对象（包含 item_instance_id、name、item_type 等字段）
   */
  async executeUseItem(item: any) {
    wx.showLoading({ title: '使用中...' })
    try {
      const result = await API.useInventoryItem(item.item_instance_id)
      wx.hideLoading()

      if (result.success) {
        const itemName = item.name || '物品'
        const resultData = result.data || {}

        let resultContent = `「${itemName}」${result.message || '使用成功'}`

        /* 后端若返回 instructions 字段则优先展示使用指引 */
        if (resultData.instructions) {
          resultContent += `\n\n${resultData.instructions}`
        }

        /* 幂等回放提示（重复请求时后端返回 is_duplicate: true） */
        if (resultData.is_duplicate) {
          resultContent += '\n\n（该物品此前已使用，本次为重复确认）'
        }

        wx.showModal({
          title: '使用成功',
          content: resultContent,
          showCancel: false,
          confirmText: '我知道了'
        })

        this.loadInventoryData(true)
      } else {
        wx.showModal({
          title: '使用失败',
          content: result.message || '使用失败，请重试',
          showCancel: false,
          confirmText: '我知道了'
        })
      }
    } catch (error: any) {
      wx.hideLoading()
      log.error('使用物品失败:', error)
      showToast(error.message || '使用失败，请重试')
    }
  },

  /**
   * 生成核销码 → 展示QR码弹窗（Phase 1 升级：QR码 + 文本码并存）
   *
   * 后端API: POST /api/v4/backpack/items/:item_instance_id/redeem
   * 响应字段（Phase 1 升级后）:
   *   order:        { redemption_order_id, status: "pending", expires_at }
   *   code:         "ABCD-1234-EFGH"（12位Base32文本码，仅此一次返回明文）
   *   qr_payload:   "RQRV1_{base64}_{signature}"（动态HMAC签名QR码内容，5分钟有效）
   *   qr_expires_at: ISO8601（QR码过期时间）
   *
   * 交互流程:
   *   1. 调用API生成核销码
   *   2. 弹出QR码展示弹窗（主展示 + 文本码备用）
   *   3. QR码5分钟自动刷新 + 倒计时显示
   *   4. 用户到店出示QR码，商家扫码核销
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
        const redemptionCode = response.data.code || ''
        const orderData = response.data.order || {}
        const expiresAt = orderData.expires_at || ''
        const itemName = item.name || '物品'
        const qrPayload = response.data.qr_payload || ''
        const qrExpiresAt = response.data.qr_expires_at || ''

        const actionLabel =
          item.item_type === 'product'
            ? '到店领取'
            : item.item_type === 'voucher'
              ? '到店使用'
              : '核销'

        this.setData(
          {
            _redemptionItemId: item.item_instance_id,
            redemptionTextCode: redemptionCode,
            redemptionItemName: itemName,
            redemptionExpiresAt: expiresAt ? this.formatReadableTime(expiresAt) : '',
            redemptionActionLabel: actionLabel,
            showRedemptionQR: true,
            qrExpired: false,
            qrRefreshing: false,
            redemptionQRImage: ''
          },
          () => {
            /* setData回调：DOM已更新，Canvas已进入DOM树，可安全执行绑定和绘制 */
            if (qrPayload) {
              this.renderRedemptionQR(qrPayload, qrExpiresAt)
            } else {
              log.info('后端未返回qr_payload，仅展示文本码')
              this.setData({ qrCountdownText: '', qrCountdown: 0 })
            }
          }
        )

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
   * Canvas渲染核销码QR码 + 启动5分钟倒计时
   *
   * 参考 lottery.ts 的 generateUserQRCode() 实现模式：
   *   QRCode.drawQrcode() → canvasToTempFilePath → setData image
   *
   * @param qrContent - RQRV1_前缀的动态QR码内容
   * @param qrExpiresAt - QR码过期时间（ISO8601）
   */
  renderRedemptionQR(qrContent: string, qrExpiresAt: string) {
    if (!qrContent) {
      log.warn('QR码内容为空，跳过渲染')
      return
    }

    let expiresTimestamp = 0
    if (qrExpiresAt) {
      const parsed = Utils.safeParseDateString
        ? Utils.safeParseDateString(qrExpiresAt)
        : new Date(qrExpiresAt)
      expiresTimestamp = (parsed || new Date()).getTime()
    }
    this._qrExpiresAt = expiresTimestamp

    QRCode.drawQrcode({
      canvasId: 'redemptionQRCanvas',
      text: qrContent,
      width: 400,
      height: 400,
      typeNumber: -1,
      correctLevel: 2,
      callback: () => {
        const tryExport = (attempt: number) => {
          const delay = attempt === 0 ? 500 : 1000 * attempt
          setTimeout(() => {
            wx.canvasToTempFilePath(
              {
                canvasId: 'redemptionQRCanvas',
                width: 400,
                height: 400,
                destWidth: 400,
                destHeight: 400,
                success: (tempRes: any) => {
                  log.info('核销码QR码渲染成功')

                  const remaining = Math.max(0, Math.floor((expiresTimestamp - Date.now()) / 1000))
                  const minutes = Math.floor(remaining / 60)
                  const seconds = remaining % 60

                  this.setData({
                    redemptionQRImage: tempRes.tempFilePath,
                    qrCountdown: remaining,
                    qrExpired: false,
                    qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
                  })

                  this.startQRCountdown()
                },
                fail: (err: any) => {
                  const maxRetry = 3
                  if (attempt < maxRetry) {
                    log.warn(`Canvas导出失败(第${attempt + 1}次)，重试...`, err)
                    tryExport(attempt + 1)
                  } else {
                    log.error('Canvas导出最终失败:', err)
                  }
                }
              },
              this
            )
          }, delay)
        }
        tryExport(0)
      }
    })
  },

  /**
   * 启动QR码5分钟倒计时（每秒更新）
   * QR码过期后自动刷新（调用 refreshRedemptionQR API）
   */
  startQRCountdown() {
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
    }

    this._qrTimer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((this._qrExpiresAt - Date.now()) / 1000))

      if (remaining <= 0) {
        clearInterval(this._qrTimer)
        this._qrTimer = null
        this.setData({ qrCountdown: 0, qrExpired: true, qrCountdownText: '已过期' })
        this.autoRefreshRedemptionQR()
        return
      }

      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      this.setData({
        qrCountdown: remaining,
        qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      })
    }, 1000)
  },

  /**
   * QR码过期后自动刷新
   * 后端API: POST /api/v4/backpack/items/:item_instance_id/redeem/refresh-qr
   */
  async autoRefreshRedemptionQR() {
    const itemId = this.data._redemptionItemId
    if (!itemId || !this.data.showRedemptionQR) {
      return
    }

    this.setData({ qrRefreshing: true, qrExpired: true })
    log.info('QR码已过期，自动刷新...')

    try {
      const result = await API.refreshRedemptionQR(itemId)
      if (result.success && result.data) {
        const { qr_payload, qr_expires_at, text_code } = result.data

        if (text_code) {
          this.setData({ redemptionTextCode: text_code })
        }

        this.setData({ qrRefreshing: false, qrExpired: false, redemptionQRImage: '' }, () => {
          if (qr_payload && this.data.showRedemptionQR) {
            this.renderRedemptionQR(qr_payload, qr_expires_at)
          }
        })
      } else {
        throw new Error(result.message || 'QR码刷新失败')
      }
    } catch (error: any) {
      log.error('QR码刷新失败:', error)
      this.setData({ qrRefreshing: false })
      showToast('QR码刷新失败，请手动刷新')
    }
  },

  /**
   * 手动刷新QR码（用户点击刷新按钮）
   */
  onRefreshRedemptionQR() {
    if (this.data.qrRefreshing) {
      return
    }
    this.autoRefreshRedemptionQR()
  },

  /**
   * 复制文本核销码到剪贴板（备用方案：扫码不便时口述文本码）
   */
  onCopyRedemptionCode() {
    const code = this.data.redemptionTextCode
    if (!code) {
      showToast('核销码不可用')
      return
    }
    wx.setClipboardData({
      data: code,
      success: () => showToast('核销码已复制', 'success')
    })
  },

  /**
   * 关闭核销码QR码弹窗 + 清理倒计时定时器
   */
  closeRedemptionQR() {
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
    }
    this.setData({
      showRedemptionQR: false,
      redemptionQRImage: '',
      qrCountdown: 0,
      qrExpired: false,
      qrRefreshing: false
    })
  },

  /**
   * 上架物品到交易市场
   *
   * 后端API: POST /api/v4/market/list
   * 请求Header: Idempotency-Key: market_list_<timestamp>_<random>（必填）
   * 请求Body: { item_instance_id, price_amount, price_asset_code }
   *
   * 定价币种: DIAMOND（钻石）/ red_shard（红水晶碎片）
   * 上架限制: 用户最多同时上架10件商品
   *
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
   * 上架限制: 用户最多同时上架10件商品（物品+材料共享额度）
   *
   * 前端根据后端返回 is_tradable 字段精确控制"上架到市场"按钮：
   *   is_tradable=true  → 允许上架
   *   is_tradable=false → 不可交易（如普通积分 POINTS）
   *
   * WXML绑定: <button bindtap="onSellAsset" data-asset="{{item}}">
   */
  onSellAsset(e: any) {
    const asset = e.currentTarget.dataset.asset

    if (!asset || !asset.asset_code) {
      showToast('资产信息无效')
      return
    }

    // 根据后端 is_tradable 字段判断是否可交易
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
      const result = await API.getInventoryItem(item.item_instance_id)

      if (result.success && result.data) {
        this.showItemDetailModal(result.data)
      } else {
        log.error('获取物品详情失败:', result.message)
        showToast(result.message || '获取物品详情失败，请稍后重试')
      }
    } catch (error: any) {
      log.error('获取物品详情异常:', error.message)
      showToast('获取物品详情失败，请检查网络后重试')
    }
  },

  /**
   * 展示物品详情弹窗
   * 使用后端返回 *_display 字段显示中文（后端为权威来源，前端不做映射）
   *
   * @param itemDetail - 物品详情数据（来自后端API GET /api/v4/backpack/items/:id）
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
   * 格式化后端ISO时间为用户可读格式
   *
   * 后端返回格式：ISO 8601（如 2026-02-20T03:50:51.318+08:00）
   * 前端展示格式：YYYY-MM-DD HH:mm（去掉秒和毫秒，对用户更友好）
   *
   * @param isoString - ISO 8601 格式时间字符串
   * @returns 格式化后的时间字符串，解析失败时返回原始字符串
   */
  formatReadableTime(isoString: string): string {
    try {
      const date = new Date(isoString)
      if (isNaN(date.getTime())) {
        return isoString
      }
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hours = String(date.getHours()).padStart(2, '0')
      const minutes = String(date.getMinutes()).padStart(2, '0')
      return `${year}-${month}-${day} ${hours}:${minutes}`
    } catch {
      return isoString
    }
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
   * 跳转到抽奖页面
   */
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
    // 清除核销码QR码倒计时定时器
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的仓库',
      path: '/packageTrade/trade/inventory/inventory'
    }
  }
})
