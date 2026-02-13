// pages/trade/inventory/inventory.ts - V4.0库存管理页面 + MobX响应式状态
const app = getApp()
// 🔴 统一工具函数导入
const { Utils, Wechat, API } = require('../../../utils/index')
const { showToast } = Wechat
const { checkAuth } = Utils
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { tradeStore } = require('../../../store/trade')

/**
 * 📦 V4.0库存管理页面 - 餐厅积分抽奖系统
 * 🎯 完全符合V4.0统一引擎架构
 * 功能：用户个人物品库存管理中心
 * 包含：物品分类、状态管理、使用转让、过期提醒
 */
Page({
  data: {
    // 用户基础信息
    isLoggedIn: false,
    userInfo: null,

    // 库存数据
    inventoryItems: [],
    filteredItems: [],
    totalValue: 0,

    // 统计数据
    categoryStats: {
      all: 0,
      // 优惠券
      voucher: 0,
      // 实物商品
      product: 0,
      // 服务权益
      service: 0
    },

    // 筛选状态
    currentCategory: 'all',
    currentStatus: 'all',
    currentSort: 'newest',
    searchKeyword: '',

    // 页面状态
    loading: false,
    refreshing: false,
    hasMoreData: false,
    currentPage: 1,
    pageSize: 20,

    // UI状态
    showFilterPanel: false,
    selectedItems: [],
    showBatchActions: false,

    // 错误状态管理
    hasError: false,
    errorMessage: '',
    errorDetail: ''
  },

  /**
   * 生命周期函数 - 监听页面加载
   *
   * @description
   * 页面首次加载时调用，执行库存管理页面初始化操作。
   *
   * options - 页面参数对象
   * [options.scene] - 场景值
   *
   * @example
   * // 微信小程序自动调用
   * onLoad({ scene: '1001' })
   */
  onLoad(_options) {
    console.log('📦 库存管理页面加载')

    // 🆕 MobX Store绑定 - 交易/库存状态自动同步
    this.tradeBindings = createStoreBindings(this, {
      store: tradeStore,
      fields: ['inventoryItems', 'inventoryLoading'],
      actions: ['setInventoryItems', 'setInventoryLoading']
    })

    this.initPage()
  },

  /**
   * 生命周期函数 - 监听页面显示
   *
   * @description
   * 每次页面显示时调用，更新库存数据。
   * 包括从其他页面返回、从后台切换到前台。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onShow()
   */
  onShow() {
    // 页面显示时刷新数据
    if (this.data.isLoggedIn) {
      this.loadInventoryData(true)
    }
  },

  /**
   * 初始化库存管理页面
   *
   * @description
   * 页面初始化的核心方法，执行以下流程：
   * 1. 检查用户登录状态
   * 2. 加载库存数据（物品列表、统计数据）
   * 3. 应用默认筛选条件
   * 4. 异常处理：提供重试选项
   *
   *
   *
   * @example
   * // 页面加载时调用
   * await this.initPage()
   */
  async initPage() {
    try {
      // 💡 loading由APIClient自动处理，无需手动showLoading

      // ✅ 使用新helper：检查登录状态
      if (!checkAuth()) {
        return
      }

      this.setData({
        isLoggedIn: true,
        userInfo: app.globalData.userInfo
      })

      // 加载库存数据
      await this.loadInventoryData(true)
    } catch (error) {
      console.error('📦 初始化失败:', error)
      showToast('初始化失败，请重试')
    } finally {
      // 💡 loading由APIClient自动处理，无需手动hideLoading
    }
  },

  /**
   * 加载用户库存数据
   *
   * @description
   * 从V4.0统一引擎API获取用户的物品库存列表和统计数据。
   *
   * 执行流程：
   * 1. 调用getUserInventory API获取库存数据
   * 2. 解析返回的inventory、totalValue、categoryStats
   * 3. 更新页面数据和显示状态
   * 4. 应用当前的筛选条件
   * 5. 异常处理：显示友好错误提示
   *
   * [refresh=false] - 是否为刷新操作（刷新时显示不同的loading状态）
   *
   *
   * @example
   * // 首次加载
   * await this.loadInventoryData()
   *
   * @example
   * // 下拉刷新
   * await this.loadInventoryData(true)
   */
  async loadInventoryData(refresh = false) {
    if (!refresh) {
      this.setData({ loading: true })
    } else {
      this.setData({ refreshing: true })
    }

    // ✅ V4.2: 直接调用API方法
    const userId = app.globalData.userInfo?.user_id
    const result = await API.getUserInventory(userId)
    const { success, data } = result

    if (success && data) {
      // 🔴 V4.0修正: 后端返回的字段名是inventory，不是items（文档Line 40, 51）
      const { inventory = [], totalValue = 0, categoryStats = {} } = data

      console.log('📦 成功加载库存数据:', {
        inventoryCount: inventory.length,
        totalValue,
        categoryStats
      })

      this.setData({
        inventoryItems: inventory,
        totalValue,
        categoryStats,
        hasError: false,
        errorMessage: '',
        errorDetail: '',
        loading: false,
        refreshing: false
      })

      // 应用筛选
      this.applyFilters()
    } else {
      // 显示友好的错误提示
      this.setData({
        inventoryItems: [],
        totalValue: 0,
        categoryStats: {
          all: 0,
          voucher: 0,
          product: 0,
          service: 0
        },
        errorMessage: '库存数据加载失败',
        errorDetail: '请稍后重试或联系客服',
        hasError: true,
        loading: false,
        refreshing: false
      })
    }
  },

  /**
   * 应用筛选和排序条件
   *
   * @description
   * 根据当前选中的筛选条件（分类、状态、关键词）和排序方式，
   * 对库存物品列表进行过滤和排序处理。
   *
   * 筛选条件：
   * - 分类筛选：all | voucher | product | service
   * - 状态筛选：all | available | used | expired
   * - 关键词搜索：物品名称和描述
   *
   * 排序方式：
   * - newest：按获得时间降序（最新优先）
   * - oldest：按获得时间升序（最早优先）
   * - value_high：按价值降序（高价值优先）
   * - value_low：按价值升序（低价值优先）
   * - expire_soon：按过期时间升序（即将过期优先）
   *
   *
   * @example
   * // 切换分类后应用筛选
   * this.setData({ currentCategory: 'voucher' })
   * this.applyFilters()
   */
  applyFilters() {
    let filteredItems = [...this.data.inventoryItems]

    // 分类筛选
    if (this.data.currentCategory !== 'all') {
      filteredItems = filteredItems.filter(item => item.type === this.data.currentCategory)
    }

    // 状态筛选
    if (this.data.currentStatus !== 'all') {
      filteredItems = filteredItems.filter(item => item.status === this.data.currentStatus)
    }

    // 关键词搜索
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredItems = filteredItems.filter(
        item =>
          item.name.toLowerCase().includes(keyword) ||
          item.description.toLowerCase().includes(keyword)
      )
    }

    // 排序
    filteredItems.sort((a, b) => {
      switch (this.data.currentSort) {
        case 'newest':
          return new Date(b.acquiredAt).getTime() - new Date(a.acquiredAt).getTime()
        case 'oldest':
          return new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime()
        case 'value_high':
          return b.value - a.value
        case 'value_low':
          return a.value - b.value
        case 'expire_soon':
          // 有过期时间的排在前面，按过期时间排序
          if (!a.expiresAt && !b.expiresAt) {
            return 0
          }
          if (!a.expiresAt) {
            return 1
          }
          if (!b.expiresAt) {
            return -1
          }
          return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
        default:
          return 0
      }
    })

    this.setData({ filteredItems })
  },

  /**
   * 切换物品分类
   *
   * @description
   * 用户点击分类标签时触发，切换当前选中的物品分类，
   * 并重新应用筛选条件。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素的data-*属性
   * e.currentTarget.dataset.category - 分类值（all | voucher | product | service）
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onCategoryChange" data-category="voucher">优惠券</view>
   */
  onCategoryChange(e) {
    const category = e.currentTarget.dataset.category
    this.setData({ currentCategory: category })
    this.applyFilters()
  },

  /**
   * 搜索关键词输入
   *
   * @description
   * 用户输入搜索关键词时触发，使用防抖技术延迟500ms执行搜索，
   * 避免频繁触发筛选操作。
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 用户输入的关键词
   *
   * @example
   * // WXML中绑定
   * <input bindinput="onSearchInput" placeholder="搜索物品" />
   */
  onSearchInput(e) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 防抖搜索
    clearTimeout(this.searchTimer)
    // 设置500ms的搜索延迟
    const searchDelay = 500
    this.searchTimer = setTimeout(() => {
      this.applyFilters()
    }, searchDelay)
  },

  /**
   * 显示筛选面板
   *
   * @description
   * 用户点击筛选按钮时触发，显示状态和排序选项面板。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onShowFilter">筛选</button>
   */
  onShowFilter() {
    this.setData({ showFilterPanel: true })
  },

  /**
   * 隐藏筛选面板
   *
   * @description
   * 用户点击遮罩层或关闭按钮时触发，隐藏筛选面板。
   *
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onHideFilter" class="mask"></view>
   */
  onHideFilter() {
    this.setData({ showFilterPanel: false })
  },

  /**
   * 切换状态筛选
   *
   * @description
   * 用户选择物品状态筛选条件时触发，更新筛选状态并关闭面板。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素的data-*属性
   * e.currentTarget.dataset.status - 状态值（all | available | used | expired）
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onStatusFilter" data-status="available">可用</view>
   */
  onStatusFilter(e) {
    const status = e.currentTarget.dataset.status
    this.setData({
      currentStatus: status,
      showFilterPanel: false
    })
    this.applyFilters()
  },

  /**
   * 切换排序方式
   *
   * @description
   * 用户选择排序方式时触发，更新排序条件并关闭面板。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素的data-*属性
   * e.currentTarget.dataset.sort - 排序方式（newest | oldest | value_high | value_low | expire_soon）
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onSortChange" data-sort="value_high">价值优先</view>
   */
  onSortChange(e) {
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
   * @description
   * 用户点击"使用"按钮时触发，确认后调用API使用该物品。
   * 使用后更新库存列表和状态。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素的data-*属性
   * e.currentTarget.dataset.item - 物品完整信息对象
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onUseItem" data-item="{{item}}">使用</button>
   */
  async onUseItem(e) {
    const { item } = e.currentTarget.dataset

    if (!item.actions.includes('use')) {
      showToast('该物品暂不支持使用')
      return
    }

    wx.showModal({
      title: '确认使用',
      content: `确定要使用"${item.name}"吗？使用后将无法撤销。`,
      success: async res => {
        if (res.confirm) {
          await this.useItem(item.id)
        }
      }
    })
  },

  /**
   * ✅ 执行使用物品 - V4.2直接调用API方法
   */
  async useItem(itemId) {
    // 显示加载提示
    wx.showLoading({ title: '使用中...' })

    try {
      // ✅ V4.2: 直接调用API方法
      const result = await API.useInventoryItem(itemId)
      const { success } = result

      wx.hideLoading()

      if (success) {
        showToast('使用成功！')
        // 刷新数据
        this.loadInventoryData(true)
      } else {
        showToast('使用失败，请重试')
      }
    } catch (error) {
      wx.hideLoading()
      console.error('❌ 使用物品失败:', error)
      showToast('使用失败，请重试')
    }
  },

  /**
   * 上架到交易市场（决策4：替代原"转移物品给好友"功能）
   *
   * @description
   * 用户点击"上架到市场"按钮时触发，将物品上架到交易市场出售。
   * 后端API: POST /api/v4/market/sell/list
   *
   * e - 事件对象
   * e.currentTarget.dataset.item - 物品完整信息对象
   */
  onTransferItem(e) {
    const { item } = e.currentTarget.dataset

    if (!item) {
      showToast('物品信息无效')
      return
    }

    // 弹出上架确认和定价输入
    wx.showModal({
      title: '上架到市场',
      content: `确定要将"${item.name}"上架到交易市场出售吗？`,
      editable: true,
      placeholderText: '请输入挂单价格（积分）',
      success: async res => {
        if (res.confirm) {
          const priceInput = res.content
          const price = parseInt(priceInput)

          if (!priceInput || isNaN(price) || price <= 0) {
            showToast('请输入有效的价格')
            return
          }

          try {
            const result = await API.sellToMarket({
              item_instance_id: item.id,
              price
            })

            if (result.success) {
              showToast('上架成功！')
              // 刷新库存数据
              this.loadInventoryData(true)
            } else {
              showToast(result.message || '上架失败，请重试')
            }
          } catch (error) {
            console.error('❌ 上架到市场失败:', error)
            showToast('上架失败，请重试')
          }
        }
      }
    })
  },

  /**
   * 查看物品详情
   *
   * @description
   * 用户点击物品卡片时触发，显示物品的详细信息弹窗。
   *
   * e - 事件对象
   * e.currentTarget - 触发事件的元素
   * e.currentTarget.dataset - 元素的data-*属性
   * e.currentTarget.dataset.item - 物品完整信息对象
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onViewItem" data-item="{{item}}">{{item.name}}</view>
   */
  onViewItem(e) {
    const { item } = e.currentTarget.dataset

    // 显示详情弹窗
    wx.showModal({
      title: item.name,
      content: this.formatItemDetails(item),
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 格式化物品详情
   */
  /**
   * 格式化物品详情为显示文本
   *
   * @description
   * 将物品对象转换为用户友好的详情文本，包含类型、价值、状态、
   * 获得时间和过期时间等信息。
   *
   * item - 物品对象
   * item.type - 物品类型
   * item.value - 物品价值
   * item.status - 物品状态
   * item.acquiredAt - 获得时间
   * [item.expiresAt] - 过期时间（可选）
   * [item.usedAt] - 使用时间（可选）
   *
   * @example
   * const details = this.formatItemDetails(item)
   * // 返回: "类型：优惠券\n价值：50积分\n状态：可用\n..."
   */
  formatItemDetails(item) {
    let details = `描述：${item.description}\n`
    details += `获得方式：${item.sourceType}\n`
    details += `获得时间：${item.acquiredAt}\n`
    details += `积分价值：${item.value}积分\n`

    if (item.expiresAt) {
      details += `过期时间：${item.expiresAt}\n`
    }

    if (item.verificationCode) {
      details += `核销码：${item.verificationCode}\n`
    }

    if (item.usedAt) {
      details += `使用时间：${item.usedAt}\n`
    }

    return details
  },

  /**
   * 创建核销订单（决策9：替代原"生成核销码"功能）
   *
   * @description
   * 用户点击"创建核销订单"按钮时触发。
   * 后端API: POST /api/v4/shop/redemption/orders
   * 创建订单时自动生成code_hash核销码。
   *
   * e - 事件对象
   * e.currentTarget.dataset.item - 物品完整信息对象
   */
  async onGenerateCode(e) {
    const { item } = e.currentTarget.dataset

    try {
      // 调用创建核销订单API（决策9：替代generateVerificationCode）
      const response = await API.createRedemptionOrder({
        item_instance_id: item.id
      })

      if (response.success && response.data) {
        const codeHash = response.data.code_hash || response.data.verification_code
        const orderId = response.data.order_id

        wx.showModal({
          title: '核销订单创建成功',
          content: `订单编号：${orderId}\n核销码：${codeHash}\n\n请在餐厅前台出示此码完成核销。`,
          showCancel: false,
          confirmText: '复制核销码',
          success: res => {
            if (res.confirm && codeHash) {
              wx.setClipboardData({
                data: codeHash,
                success: () => showToast('核销码已复制')
              })
            }
          }
        })

        // 刷新数据
        this.loadInventoryData(true)
      } else {
        throw new Error(response.message || '创建失败')
      }
    } catch (error) {
      console.error('📦 创建核销订单失败:', error)
      showToast(error.message || '创建失败，请重试')
    }
  },

  /**
   * 联系客服
   */
  onContactService() {
    wx.makePhoneCall({
      phoneNumber: '400-123-4567',
      success: () => {
        console.log('📦 拨打客服电话成功')
      },
      fail: error => {
        console.error('📦 拨打客服电话失败:', error)
        showToast('无法拨打客服电话')
      }
    })
  },

  /**
   * 下拉刷新处理
   */
  handlePullDownRefresh() {
    this.setData({ refreshing: true })
    this.loadInventoryData(true).then(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 上拉加载更多处理
   */
  handleReachBottom() {
    if (this.data.hasMoreData && !this.data.loading) {
      this.loadInventoryData(false)
    }
  },

  /**
   * 获取状态显示文本
   */
  /**
   * 获取物品状态的中文显示文本
   *
   * @description
   * 将物品状态代码转换为用户友好的中文显示文本。
   *
   * status - 状态代码（available | used | expired）
   *
   * @example
   * this.getStatusText('available') // '可用'
   * this.getStatusText('used')      // '已使用'
   * this.getStatusText('expired')   // '已过期'
   */
  getStatusText(status) {
    const statusMap = {
      available: '可用',
      pending: '待核销',
      used: '已使用',
      expired: '已过期',
      transferred: '已转让'
    }
    return statusMap[status] || '未知'
  },

  /**
   * 获取状态样式类名
   */
  /**
   * 获取物品状态的CSS类名
   *
   * @description
   * 根据物品状态返回对应的CSS类名，用于样式区分。
   *
   * status - 状态代码（available | used | expired）
   *
   * @example
   * this.getStatusClass('available') // 'status-available'
   * this.getStatusClass('used')      // 'status-used'
   * this.getStatusClass('expired')   // 'status-expired'
   */
  getStatusClass(status) {
    const classMap = {
      available: 'status-available',
      pending: 'status-pending',
      used: 'status-used',
      expired: 'status-expired',
      transferred: 'status-transferred'
    }
    return classMap[status] || 'status-unknown'
  },

  /**
   * 检查是否即将过期
   */
  /**
   * 判断物品是否即将过期
   *
   * @description
   * 检查物品是否在3天内过期，用于显示过期提醒。
   *
   * expiresAt - 过期时间（ISO 8601格式）
   *
   * @example
   * // 2天后过期
   * const expiring = this.isExpiringSoon('2025-11-02T00:00:00Z')
   * console.log(expiring) // true
   *
   * @example
   * // 5天后过期
   * const expiring = this.isExpiringSoon('2025-11-05T00:00:00Z')
   * console.log(expiring) // false
   */
  isExpiringSoon(expiresAt) {
    if (!expiresAt) {
      return false
    }

    const expireTime = new Date(expiresAt).getTime()
    const nowTime = Date.now()
    // 3天的毫秒数
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000

    return expireTime - nowTime < threeDaysInMs && expireTime > nowTime
  },

  /**
   * 跳转到登录页面
   */
  redirectToLogin() {
    wx.navigateTo({
      url: '/pages/auth/auth'
    })
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    this.handlePullDownRefresh()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    this.handleReachBottom()
  },

  /**
   * 🎰 跳转到抽奖页面 - 立即抽奖
   */
  goToLottery() {
    console.log('🎰 跳转到抽奖页面')

    // 尝试跳转到抽奖页面
    wx.switchTab({
      url: '/pages/lottery/lottery',
      success: () => {
        console.log('✅ 成功跳转到抽奖页面')
        // 显示提示信息
        wx.showToast({
          title: '来试试手气吧！',
          icon: 'none',
          duration: 2000
        })
      },
      fail: error => {
        console.error('❌ 跳转失败:', error)

        // 备选方案：跳转到抽奖页面
        wx.switchTab({
          url: '/pages/lottery/lottery',
          success: () => {
            console.log('✅ 备选方案：跳转到抽奖页面')
            wx.showToast({
              title: '去抽奖页面参与活动吧！',
              icon: 'none',
              duration: 2000
            })
          },
          fail: fallbackError => {
            console.error('❌ 备选跳转也失败:', fallbackError)
            showToast('页面跳转失败，请重试')
          }
        })
      }
    })
  },

  /**
   * 生命周期函数 - 页面卸载
   */
  onUnload() {
    // 🆕 销毁MobX Store绑定
    if (this.tradeBindings) {
      this.tradeBindings.destroyStoreBindings()
    }
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

export {}
