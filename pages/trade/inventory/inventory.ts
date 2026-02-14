/**
 * 📦 V5.0库存管理页面 - 餐厅积分抽奖系统（背包系统）
 *
 * 业务功能：用户个人物品库存管理中心
 * 后端API（对齐V4.7.0真实路由）：
 *   - GET  /api/v4/backpack/                       → 获取用户背包（双轨结构：assets[] + items[]）
 *   - GET  /api/v4/backpack/stats                  → 获取背包统计（总价值等）
 *   - POST /api/v4/backpack/items/:id/use          → 使用物品
 *   - POST /api/v4/backpack/items/:id/redeem       → 生成核销码（用户到店出示）
 *   - POST /api/v4/market/sell/list                → 上架物品到交易市场
 *
 * 后端返回的BackpackItem字段（snake_case，后端为权威来源）：
 *   item_instance_id  - 物品实例唯一ID
 *   item_type         - 物品类型（voucher/product/service）
 *   name              - 物品名称
 *   status            - 物品状态（available/pending/used/expired/transferred）
 *   rarity            - 稀有度（common/uncommon/rare/epic/legendary）
 *   description       - 物品描述
 *   acquired_at       - 获得时间（ISO 8601格式）
 *   expires_at        - 过期时间（ISO 8601格式，可为null）
 *   is_owner          - 是否为所有者
 *   has_redemption_code - 是否已生成核销码
 *
 * @file pages/trade/inventory/inventory.ts
 * @version 5.0.0
 * @since 2026-02-15
 */

// 🔴 统一工具函数导入（通过utils/index.ts）
const { Utils, Wechat, API, Logger } = require('../../../utils/index')
const log = Logger.createLogger('inventory')
const { showToast } = Wechat
const { checkAuth } = Utils

// MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { tradeStore } = require('../../../store/trade')
const { userStore } = require('../../../store/user')

Page({
  data: {
    // ===== 用户基础信息 =====
    isLoggedIn: false,
    userInfo: null as any,

    // ===== 背包物品数据 =====
    /** 处理后的物品列表（含前端计算的操作标志 can_use/can_generate_code/can_transfer/can_contact） */
    inventoryItems: [] as any[],
    /** 筛选排序后的物品列表（WXML模板渲染数据源） */
    filteredItems: [] as any[],

    // ===== 统计数据 =====
    /**
     * 总价值（积分）
     * ⚠️ 依赖后端 GET /api/v4/backpack/stats 返回 total_value 字段
     * 前端不自行计算，以后端为业务权威来源
     */
    totalValue: 0,
    /** 分类统计（前端根据物品列表的 item_type 字段计算数量） */
    categoryStats: {
      all: 0,
      /** 优惠券 */
      voucher: 0,
      /** 实物商品 */
      product: 0,
      /** 服务权益 */
      service: 0
    },

    // ===== 筛选状态 =====
    /** 当前分类：all | voucher | product | service */
    currentCategory: 'all',
    /** 当前状态：all | available | pending | used | expired */
    currentStatus: 'all',
    /** 当前排序：newest | oldest | expire_soon */
    currentSort: 'newest',
    /** 搜索关键词 */
    searchKeyword: '',

    // ===== 页面状态 =====
    /** 首次加载中（显示loading占位） */
    loading: false,
    /** 静默刷新中（下拉刷新、回到页面时） */
    refreshing: false,

    // ===== UI状态 =====
    /** 筛选面板是否显示 */
    showFilterPanel: false,

    // ===== 错误状态管理 =====
    hasError: false,
    errorMessage: '',
    errorDetail: ''
  },

  // 防抖搜索定时器
  searchTimer: 0 as any,
  // MobX绑定实例
  tradeBindings: null as any,

  /**
   * 生命周期 - 页面加载
   */
  onLoad(_options: any) {
    log.info('📦 库存管理页面加载')

    // MobX Store绑定 - 库存加载状态同步
    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: ['inventoryLoading'],
      actions: ['setInventoryItems', 'setInventoryLoading']
    })

    this.initPage()
  },

  /**
   * 生命周期 - 页面显示
   * 每次页面显示时静默刷新数据（从其他页面返回、后台切回前台）
   */
  onShow() {
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
      // 检查登录状态，未登录自动跳转到 /pages/auth/auth
      if (!checkAuth()) {
        return
      }

      this.setData({
        isLoggedIn: true,
        userInfo: userStore.userInfo
      })

      // 首次加载：传false → 显示loading占位
      await this.loadInventoryData(false)
    } catch (error: any) {
      log.error('📦 初始化失败:', error)
      showToast('初始化失败，请重试')
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
   * 2. 解析双轨结构：assets（可叠加资产）+ items（不可叠加物品）
   * 3. 为每个物品计算前端操作标志（can_use/can_generate_code/can_transfer/can_contact）
   * 4. 计算分类统计数量
   * 5. 独立加载背包统计数据（总价值等）
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
      // ✅ getUserInventory() 不传参数，后端通过JWT Token自动识别用户身份
      const result = await API.getUserInventory()
      const { success, data } = result

      if (success && data) {
        // ✅ 后端返回双轨结构: { assets: BackpackAsset[], items: BackpackItem[] }
        const { items = [] } = data

        // 为每个物品添加前端计算的操作标志（基于物品状态决定UI按钮显示）
        const processedItems = items.map((item: any) => ({
          ...item,
          // 可用状态的物品 → 可使用、可生成核销码、可上架到交易市场
          can_use: item.status === 'available',
          can_generate_code: item.status === 'available',
          can_transfer: item.status === 'available',
          // 非可用状态的物品 → 显示联系客服按钮
          can_contact: item.status !== 'available'
        }))

        // 前端根据 item_type 字段计算分类数量
        const categoryStats = {
          all: processedItems.length,
          voucher: processedItems.filter((i: any) => i.item_type === 'voucher').length,
          product: processedItems.filter((i: any) => i.item_type === 'product').length,
          service: processedItems.filter((i: any) => i.item_type === 'service').length
        }

        log.info('📦 成功加载背包数据:', {
          itemCount: processedItems.length,
          categoryStats
        })

        this.setData({
          inventoryItems: processedItems,
          categoryStats,
          hasError: false,
          errorMessage: '',
          errorDetail: '',
          loading: false,
          refreshing: false
        })

        // 同步原始物品数据到MobX Store（供其他页面使用）
        if (typeof this.setInventoryItems === 'function') {
          this.setInventoryItems(items)
        }

        // 独立加载背包统计数据（总价值等，非关键数据）
        this.loadBackpackStats()

        // 应用当前筛选排序条件
        this.applyFilters()
      } else {
        this.handleLoadError('库存数据加载失败', '请稍后重试或联系客服')
      }
    } catch (error: any) {
      log.error('📦 加载背包数据失败:', error)
      this.handleLoadError('库存数据加载失败', error.message || '请稍后重试或联系客服')
    }
  },

  /**
   * 加载背包统计数据（总价值等）
   *
   * 后端API: GET /api/v4/backpack/stats
   * 非关键数据，加载失败不影响主流程（总价值显示为0）
   */
  async loadBackpackStats() {
    try {
      const result = await API.getBackpackStats()
      if (result.success && result.data) {
        // 后端统计数据（字段以后端实际返回为准）
        const totalValue = result.data.total_value || 0
        this.setData({ totalValue })
        log.info('📦 背包统计:', { totalValue })
      }
    } catch (error: any) {
      log.warn('📦 获取背包统计失败（非关键）:', error.message)
      // 统计数据加载失败不影响主流程，totalValue保持默认值0
    }
  },

  /**
   * 处理数据加载错误（统一错误状态设置）
   */
  handleLoadError(message: string, detail: string) {
    this.setData({
      inventoryItems: [],
      filteredItems: [],
      totalValue: 0,
      categoryStats: { all: 0, voucher: 0, product: 0, service: 0 },
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
   * 筛选字段使用后端snake_case命名：
   *   - 分类筛选：item_type 字段（all | voucher | product | service）
   *   - 状态筛选：status 字段（all | available | pending | used | expired）
   *   - 关键词搜索：name + description 字段
   *
   * 排序字段使用后端snake_case命名：
   *   - newest：按 acquired_at 降序（最新优先）
   *   - oldest：按 acquired_at 升序（最早优先）
   *   - expire_soon：按 expires_at 升序（即将过期优先）
   */
  applyFilters() {
    let filteredItems = [...this.data.inventoryItems]

    // 分类筛选（后端字段: item_type）
    if (this.data.currentCategory !== 'all') {
      filteredItems = filteredItems.filter(
        (item: any) => item.item_type === this.data.currentCategory
      )
    }

    // 状态筛选（后端字段: status）
    if (this.data.currentStatus !== 'all') {
      filteredItems = filteredItems.filter((item: any) => item.status === this.data.currentStatus)
    }

    // 关键词搜索（搜索 name 和 description）
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredItems = filteredItems.filter(
        (item: any) =>
          (item.name && item.name.toLowerCase().includes(keyword)) ||
          (item.description && item.description.toLowerCase().includes(keyword))
      )
    }

    // 排序（后端字段: acquired_at, expires_at）
    filteredItems.sort((a: any, b: any) => {
      switch (this.data.currentSort) {
        case 'newest':
          return new Date(b.acquired_at).getTime() - new Date(a.acquired_at).getTime()
        case 'oldest':
          return new Date(a.acquired_at).getTime() - new Date(b.acquired_at).getTime()
        case 'expire_soon':
          // 有过期时间的排在前面，按过期时间升序
          if (!a.expires_at && !b.expires_at) {
            return 0
          }
          if (!a.expires_at) {
            return 1
          }
          if (!b.expires_at) {
            return -1
          }
          return new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()
        default:
          return 0
      }
    })

    this.setData({ filteredItems })
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
   * 切换状态筛选
   * WXML绑定: <view bindtap="onStatusFilter" data-status="available">
   */
  onStatusFilter(e: any) {
    const status = e.currentTarget.dataset.status
    this.setData({
      currentStatus: status,
      showFilterPanel: false
    })
    this.applyFilters()
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
   * WXML绑定: <button bindtap="onUseItem" data-item="{{item}}">
   * 前置条件: item.can_use === true（物品状态为available）
   */
  onUseItem(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item || !item.can_use) {
      showToast('该物品暂不支持使用')
      return
    }

    wx.showModal({
      title: '确认使用',
      content: `确定要使用"${item.name}"吗？使用后将无法撤销。`,
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
   *
   * @param itemInstanceId - 物品实例ID（后端字段: item_instance_id）
   */
  async executeUseItem(itemInstanceId: number) {
    wx.showLoading({ title: '使用中...' })
    try {
      const result = await API.useInventoryItem(itemInstanceId)
      wx.hideLoading()

      if (result.success) {
        showToast('使用成功！')
        // 刷新背包数据
        this.loadInventoryData(true)
      } else {
        showToast(result.message || '使用失败，请重试')
      }
    } catch (error: any) {
      wx.hideLoading()
      log.error('❌ 使用物品失败:', error)
      showToast(error.message || '使用失败，请重试')
    }
  },

  /**
   * 生成核销码（用户到店出示，商家扫码核销）
   *
   * 后端API: POST /api/v4/backpack/items/:item_instance_id/redeem
   * 业务流程: 用户点击"生成核销码" → 后端生成核销码 → 用户到店出示 → 商家扫码核销
   *
   * WXML绑定: <button bindtap="onGenerateCode" data-item="{{item}}">
   */
  async onGenerateCode(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item) {
      showToast('物品信息无效')
      return
    }

    try {
      // 调用背包核销API生成核销码
      const response = await API.redeemInventoryItem(item.item_instance_id)

      if (response.success && response.data) {
        const codeHash = response.data.code_hash || response.data.redemption_code || ''

        wx.showModal({
          title: '核销码生成成功',
          content: `核销码：${codeHash}\n\n请在餐厅前台出示此码完成核销。`,
          showCancel: false,
          confirmText: '复制核销码',
          success: (res: any) => {
            if (res.confirm && codeHash) {
              wx.setClipboardData({
                data: codeHash,
                success: () => showToast('核销码已复制')
              })
            }
          }
        })

        // 刷新背包数据
        this.loadInventoryData(true)
      } else {
        throw new Error(response.message || '生成失败')
      }
    } catch (error: any) {
      log.error('📦 生成核销码失败:', error)
      showToast(error.message || '生成失败，请重试')
    }
  },

  /**
   * 上架物品到交易市场
   *
   * 后端API: POST /api/v4/market/sell/list
   * 请求参数: { item_instance_id: number, price: number }
   *
   * WXML绑定: <button bindtap="onTransferItem" data-item="{{item}}">
   */
  onTransferItem(e: any) {
    const { item } = e.currentTarget.dataset

    if (!item) {
      showToast('物品信息无效')
      return
    }

    wx.showModal({
      title: '上架到市场',
      content: `确定要将"${item.name}"上架到交易市场出售吗？`,
      editable: true,
      placeholderText: '请输入挂单价格（积分）',
      success: async (res: any) => {
        if (res.confirm) {
          const priceInput = res.content
          const price = parseInt(priceInput)

          if (!priceInput || isNaN(price) || price <= 0) {
            showToast('请输入有效的价格')
            return
          }

          try {
            const result = await API.sellToMarket({
              item_instance_id: item.item_instance_id,
              price
            })

            if (result.success) {
              showToast('上架成功！')
              // 刷新背包数据
              this.loadInventoryData(true)
            } else {
              showToast(result.message || '上架失败，请重试')
            }
          } catch (error: any) {
            log.error('❌ 上架到市场失败:', error)
            showToast(error.message || '上架失败，请重试')
          }
        }
      }
    })
  },

  /**
   * 查看物品详情（弹窗展示）
   *
   * WXML绑定: <view bindtap="onViewItem" data-item="{{item}}">
   */
  onViewItem(e: any) {
    const { item } = e.currentTarget.dataset
    wx.showModal({
      title: item.name,
      content: this.formatItemDetails(item),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 格式化物品详情为显示文本
   *
   * 使用后端snake_case字段名：
   *   description, rarity, acquired_at, expires_at, has_redemption_code, status
   */
  formatItemDetails(item: any): string {
    const statusMap: Record<string, string> = {
      available: '可用',
      pending: '待核销',
      used: '已使用',
      expired: '已过期',
      transferred: '已转让'
    }

    let details = ''

    if (item.description) {
      details += `描述：${item.description}\n`
    }
    if (item.rarity) {
      const rarityMap: Record<string, string> = {
        common: '普通',
        uncommon: '优良',
        rare: '稀有',
        epic: '史诗',
        legendary: '传说'
      }
      details += `稀有度：${rarityMap[item.rarity] || item.rarity}\n`
    }
    if (item.status) {
      details += `状态：${statusMap[item.status] || '未知'}\n`
    }
    if (item.acquired_at) {
      details += `获得时间：${item.acquired_at}\n`
    }
    if (item.expires_at) {
      details += `过期时间：${item.expires_at}\n`
    }
    if (item.has_redemption_code) {
      details += `核销码：已生成\n`
    }

    return details || '暂无详情'
  },

  /**
   * 联系客服
   */
  onContactService() {
    wx.makePhoneCall({
      phoneNumber: '400-123-4567',
      success: () => {
        log.info('📦 拨打客服电话成功')
      },
      fail: (error: any) => {
        log.error('📦 拨打客服电话失败:', error)
        showToast('无法拨打客服电话')
      }
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
   * 跳转到抽奖页面
   */
  goToLottery() {
    log.info('🎰 跳转到抽奖页面')
    wx.switchTab({
      url: '/pages/lottery/lottery',
      success: () => {
        log.info('✅ 成功跳转到抽奖页面')
        wx.showToast({
          title: '来试试手气吧！',
          icon: 'none',
          duration: 2000
        })
      },
      fail: (error: any) => {
        log.error('❌ 跳转失败:', error)
        showToast('页面跳转失败，请重试')
      }
    })
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
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的库存管理',
      path: '/pages/trade/inventory/inventory'
    }
  }
})

export { }

