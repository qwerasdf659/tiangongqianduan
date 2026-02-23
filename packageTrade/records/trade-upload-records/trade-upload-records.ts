/**
 * 📊 trade-upload-records.ts - 积分活动记录页面（交易+消费合并 MobX响应式状态）
 * @description
 * 将交易记录和消费记录合并到一个页面，使用Tab切换
 * Tab0 = 交易记录（资产流水），Tab1 = 消费记录（商家消费积分）
 *
 * @version 5.2.0
 * @author Restaurant Lottery Team
 * @since 2026-02-07
 *
 * API依赖:
 *   - API.getPointsTransactions() GET /api/v4/assets/transactions（交易流水）
 *   - API.getPointsBalance()     GET /api/v4/assets/balance（积分余额汇总）
 *   - API.getMyConsumptionRecords() GET /api/v4/shop/consumption/me（消费记录）
 */

// 🔴 统一工具函数导入
const { API, Utils, Wechat, Logger } = require('../../../utils/index')
const log = Logger.createLogger('trade-records')
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')
// 从Utils中解构认证助手和格式化函数
const { checkAuth, formatPoints } = Utils
// 从Wechat中解构Toast函数
const { showToast } = Wechat

/**
 * 安全转换时间字段为字符串
 * 防止后端返回Sequelize Date对象等非字符串类型导致显示[object Object]
 *
 * @param value - 需要转换的时间值
 * @returns 时间字符串
 */
function safeTimeString(value: any): string {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  // 处理对象类型（如Sequelize Date对象）
  if (typeof value === 'object') {
    if (typeof value.toISOString === 'function') {
      return value.toISOString()
    }
    if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
      return value.toString()
    }
    // 尝试取常见日期字段
    if (value.val) {
      return String(value.val)
    }
    if (value.date) {
      return String(value.date)
    }
  }
  return String(value)
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 🔴 Tab切换状态
    activeTab: 0,
    tabs: [
      { id: 0, name: '交易记录', icon: '💰' },
      { id: 1, name: '消费记录', icon: '🧾' }
    ],

    // 🔴 用户信息
    isLoggedIn: false,

    // 🔴 积分余额汇总（来自 GET /api/v4/assets/balance）
    balanceSummary: {
      availableAmount: 0,
      frozenAmount: 0,
      totalAmount: 0
    },

    // 🔴 交易记录相关数据（来自 GET /api/v4/assets/transactions）
    transactionRecords: [] as any[],
    filteredRecords: [] as any[],
    // 筛选条件
    currentTimeFilter: 'all',
    currentTypeFilter: 'all',
    searchKeyword: '',
    showFilterPanel: false,

    // 🧾 消费记录相关数据（来自 GET /api/v4/shop/consumption/me）
    consumptionRecords: [] as any[],
    // all, pending, approved, rejected
    consumptionFilter: 'all',
    consumptionFilterOptions: [
      { key: 'all', name: '全部', icon: '📋' },
      { key: 'pending', name: '待审核', icon: '⏳' },
      { key: 'approved', name: '已通过', icon: '✅' },
      { key: 'rejected', name: '已拒绝', icon: '❌' }
    ],
    consumptionPage: 1,
    consumptionPageSize: 20,
    consumptionHasMore: true,

    // 🔴 页面状态
    loading: true,
    refreshing: false,
    loadingMore: false,
    // 是否已完成首次初始化（防止onLoad+onShow双重加载）
    initialized: false
  },

  /**
   * 生命周期函数--监听页面加载
   * 仅负责初始化绑定和UI配置，不加载数据（数据加载在onShow中）
   */
  onLoad(options: Record<string, string>) {
    log.info('积分活动记录页面加载')

    // 🆕 MobX Store绑定 - 用户登录状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userId'],
      actions: []
    })

    // 从URL参数获取初始Tab
    if (options.tab) {
      const tabId = parseInt(options.tab)
      if (tabId === 0 || tabId === 1) {
        this.setData({ activeTab: tabId })
      }
    }

    wx.setNavigationBarTitle({
      title: '积分活动记录'
    })
  },

  /**
   * 生命周期函数--监听页面显示
   * 首次进入执行初始化，后续返回本页时执行刷新
   */
  onShow() {
    log.info('积分活动记录页面显示')
    // 使用helper：检查登录状态
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })

    if (!this.data.initialized) {
      // 首次进入：初始化（含loading状态）
      this.initializePage()
    } else {
      // 非首次：静默刷新当前Tab
      this.refreshCurrentTab()
    }
  },

  /**
   * 🔴 初始化页面（首次进入时调用）
   */
  async initializePage() {
    try {
      // 并行加载：余额汇总 + 当前Tab数据
      await Promise.all([this.loadBalanceSummary(), this.loadCurrentTabData()])
    } catch (error) {
      log.error('积分活动记录页面初始化失败', error)
      showToast('页面加载失败')
    } finally {
      this.setData({ loading: false, initialized: true })
    }
  },

  /**
   * 🔴 Tab切换事件
   */
  onTabChange(e: WechatMiniprogram.BaseEvent) {
    const tabId = e.currentTarget.dataset.id
    if (tabId === this.data.activeTab) {
      return
    }

    log.info(`切换到Tab${tabId}`)
    this.setData({
      activeTab: tabId,
      loading: true
    })

    this.loadCurrentTabData().finally(() => {
      this.setData({ loading: false })
    })
  },

  /**
   * 🔴 加载当前Tab的数据
   */
  async loadCurrentTabData() {
    if (this.data.activeTab === 0) {
      // 交易记录Tab
      await this.loadTransactionData()
    } else {
      // 🧾 消费记录Tab
      await this.loadConsumptionRecords(true)
    }
  },

  /**
   * 🔴 刷新当前Tab的数据
   */
  async refreshCurrentTab() {
    this.setData({ refreshing: true })
    try {
      await Promise.all([this.loadBalanceSummary(), this.loadCurrentTabData()])
    } finally {
      this.setData({ refreshing: false })
    }
  },

  // ============================================================================
  // 💰 余额汇总相关方法
  // ============================================================================

  /**
   * 💰 加载积分余额汇总
   * API: GET /api/v4/assets/balance?asset_code=POINTS
   *
   * 返回字段: available_amount（可用余额）、frozen_amount（冻结余额）、total_amount（总资产）
   */
  async loadBalanceSummary() {
    try {
      const result = await API.getPointsBalance()
      const { success, data } = result

      if (success && data) {
        this.setData({
          balanceSummary: {
            availableAmount: data.available_amount || 0,
            frozenAmount: data.frozen_amount || 0,
            totalAmount: data.total_amount || 0
          }
        })
        log.info('余额汇总加载成功', this.data.balanceSummary)
      }
    } catch (error) {
      log.error('余额汇总加载失败', error)
      // 余额加载失败不阻断页面，保持默认值
    }
  },

  // ============================================================================
  // 💰 交易记录相关方法
  // ============================================================================

  /**
   * 加载交易数据
   *
   * API: GET /api/v4/assets/transactions
   *
   * 后端实际返回字段（对应typings/api.d.ts AssetTransaction）：
   *   asset_transaction_id - 交易流水ID（BIGINT PK）
   *   asset_code           - 资产代码（POINTS / DIAMOND / red_shard）
   *   delta_amount         - 变动金额（正=获得/earn，负=消费/consume）
   *   balance_before       - 变动前余额
   *   balance_after        - 变动后余额
   *   business_type        - 业务类型枚举（lottery_consume / lottery_reward / exchange_debit 等）
   *   description          - 交易描述（约44%有值，可为null）
   *   title                - 交易标题（约33%有值，可为null）
   *   created_at           - 创建时间
   *
   * 前端处理：将后端 snake_case 字段映射为WXML 模板所需的显示字段
   */
  async loadTransactionData() {
    try {
      const result = await API.getPointsTransactions()
      const { success, data } = result

      if (success && data) {
        // 后端返回字段名是 transactions
        const { transactions = [] } = data

        log.info('成功获取交易记录原始数据:', {
          transactionsCount: transactions.length
        })

        // 🔍 诊断日志：打印第一条原始记录字段
        if (transactions.length > 0) {
          log.info('[诊断] 第一条原始交易记录', {
            keys: Object.keys(transactions[0]),
            sample: transactions[0]
          })
        }

        // 处理交易记录：保留后端原始字段，仅新增前端计算的显示字段
        const processedRecords = transactions.map((record: any) => {
          // 🔴 使用后端实际字段 delta_amount（对齐后端路由层 transactions.js 1-76行）
          const rawDeltaAmount = record.delta_amount || 0

          return {
            // 保留后端原始字段（asset_transaction_id / delta_amount / business_type 等直接使用）
            ...record,
            // === 前端计算的显示辅助字段 ===
            // 标题显示：优先 title → description → 硬编码回退
            displayTitle: record.title || record.description || '积分记录',
            // 交易方向分类：根据 delta_amount 正负号判断（income=获得 / expense=消费）
            category: rawDeltaAmount > 0 ? 'income' : 'expense',
            // 时间：安全转换为字符串（防止 Sequelize Date 对象导致 [object Object]）
            created_at: safeTimeString(record.created_at)
          }
        })

        this.setData({ transactionRecords: processedRecords })

        log.info('交易记录处理完成:', {
          processedCount: processedRecords.length
        })

        // 应用筛选
        this.applyFilters()
      } else {
        this.setData({
          transactionRecords: [],
          filteredRecords: []
        })
        showToast('交易记录加载失败')
      }
    } catch (error) {
      log.error('加载交易记录失败:', error)
      this.setData({
        transactionRecords: [],
        filteredRecords: []
      })
      showToast('交易记录加载失败')
    }
  },

  /**
   * 🔴 应用筛选条件
   * 使用处理后的字段名（category/title/description/asset_transaction_id）
   */
  applyFilters() {
    let filteredRecords = [...this.data.transactionRecords]

    // 时间筛选
    if (this.data.currentTimeFilter !== 'all') {
      filteredRecords = this.filterByTime(filteredRecords, this.data.currentTimeFilter)
    }

    // 类型筛选（使用处理后的 category 字段：income/expense）
    if (this.data.currentTypeFilter !== 'all') {
      if (this.data.currentTypeFilter === 'income') {
        filteredRecords = filteredRecords.filter((record: any) => record.category === 'income')
      } else if (this.data.currentTypeFilter === 'expense') {
        filteredRecords = filteredRecords.filter((record: any) => record.category === 'expense')
      } else {
        // 按后端 business_type 筛选（lottery_consume / exchange_debit 等）
        filteredRecords = filteredRecords.filter(
          (record: any) => record.business_type === this.data.currentTypeFilter
        )
      }
    }

    // 关键词搜索（直接使用后端字段名）
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredRecords = filteredRecords.filter(
        (record: any) =>
          (record.displayTitle && record.displayTitle.toLowerCase().includes(keyword)) ||
          (record.description && record.description.toLowerCase().includes(keyword)) ||
          (record.asset_transaction_id && String(record.asset_transaction_id).includes(keyword))
      )
    }

    filteredRecords.sort(
      (a: any, b: any) =>
        (Utils.safeParseDateString(b.created_at) || new Date(0)).getTime() -
        (Utils.safeParseDateString(a.created_at) || new Date(0)).getTime()
    )

    this.setData({ filteredRecords })
  },

  /**
   * 🔴 按时间筛选
   */
  filterByTime(records: any[], timeFilter: string) {
    const now = new Date()
    let startDate: Date | null = null

    switch (timeFilter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1)
        break
      default:
        return records
    }

    return records.filter(
      (record: any) => (Utils.safeParseDateString(record.created_at) || new Date(0)) >= startDate!
    )
  },

  /**
   * 🔴 时间筛选事件
   */
  onTimeFilter(e: WechatMiniprogram.BaseEvent) {
    const timeFilter = e.currentTarget.dataset.filter
    this.setData({ currentTimeFilter: timeFilter })
    this.applyFilters()
  },

  /**
   * 🔴 类型筛选事件
   */
  onTypeFilter(e: WechatMiniprogram.BaseEvent) {
    const typeFilter = e.currentTarget.dataset.filter
    this.setData({ currentTypeFilter: typeFilter })
    this.applyFilters()
  },

  /**
   * 🔴 搜索输入（防抖500ms）
   */
  onSearchInput(e: WechatMiniprogram.Input) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 防抖搜索
    clearTimeout(this.searchTimer)
    this.searchTimer = setTimeout(() => {
      this.applyFilters()
    }, 500)
  },

  /**
   * 🔴 重置筛选条件
   */
  onResetFilters() {
    this.setData({
      currentTimeFilter: 'all',
      currentTypeFilter: 'all',
      searchKeyword: '',
      showFilterPanel: false
    })
    this.applyFilters()
  },

  /**
   * 🔴 显示/隐藏筛选面板
   */
  onToggleFilter() {
    this.setData({
      showFilterPanel: !this.data.showFilterPanel
    })
  },

  /**
   * 🔴 查看交易详情
   * 使用处理后的字段
   */
  onViewDetail(e: WechatMiniprogram.BaseEvent) {
    const record = e.currentTarget.dataset.record

    if (!record) {
      return
    }

    // 使用后端 delta_amount 字段格式化金额显示
    const deltaAmount = record.delta_amount || 0
    const amountDisplay = deltaAmount > 0 ? `+${deltaAmount}` : `${deltaAmount}`

    wx.showModal({
      title: '交易详情',
      content: `交易类型：${record.displayTitle || '积分记录'}\n交易金额：${amountDisplay}积分\n交易时间：${record.created_at || '未知'}\n交易ID：${record.asset_transaction_id || '无'}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 复制交易ID
   */
  onCopyTxnId(e: WechatMiniprogram.BaseEvent) {
    const txnId = e.currentTarget.dataset.txnId
    if (!txnId) {
      showToast('无交易ID')
      return
    }

    wx.setClipboardData({
      data: txnId,
      success: () => {
        showToast('交易ID已复制')
      }
    })
  },

  // ============================================================================
  // 🧾 消费记录相关方法
  // 后端API: GET /api/v4/shop/consumption/me（支持分页 + status筛选）
  // ============================================================================

  /**
   * 🧾 加载消费记录
   *
   * 后端返回字段（基于consumption_records 表，对齐v2.0文档）：
   *   - consumption_record_id: BIGINT PK 记录主键
   *   - user_id: INT FK 用户ID
   *   - merchant_id: INT FK 商家ID
   *   - consumption_amount: DECIMAL(10,2) 消费金额（元）
   *   - points_to_award: INT 待发放积分数（⚠不是 points_awarded）
   *   - status: ENUM pending/approved/rejected/expired 审核状态，含expired
   *   - final_status: ENUM pending_review/approved/rejected（双重状态）
   *   - merchant_notes: TEXT 商家备注
   *   - admin_notes: TEXT 管理员备注
   *   - store_id: INT FK 门店ID
   *   - created_at: DATETIME 创建时间 ⚠️ 后端可能返回非字符串类型，需安全转换
   *
   * @param refresh - 是否刷新（重置分页）
   */
  async loadConsumptionRecords(refresh = false) {
    if (!this.data.isLoggedIn) {
      return
    }

    if (refresh) {
      this.setData({
        consumptionPage: 1,
        consumptionHasMore: true,
        consumptionRecords: []
      })
    }

    const currentPage = this.data.consumptionPage
    const statusFilter = this.data.consumptionFilter === 'all' ? null : this.data.consumptionFilter

    try {
      const result = await API.getMyConsumptionRecords({
        page: currentPage,
        page_size: this.data.consumptionPageSize,
        status: statusFilter
      })
      const { success, data } = result

      if (success && data) {
        const rawRecords = data.records || []

        // 🔴 处理消费记录 - 安全转换时间字段（防止[object Object]）
        const processedRecords = rawRecords.map((record: any) => ({
          ...record,
          // 安全转换 created_at 为字符串
          created_at: safeTimeString(record.created_at)
        }))

        const allRecords = refresh
          ? processedRecords
          : [...this.data.consumptionRecords, ...processedRecords]

        this.setData({
          consumptionRecords: allRecords,
          consumptionHasMore: rawRecords.length === this.data.consumptionPageSize,
          consumptionPage: currentPage + 1
        })

        log.info(` 消费记录加载完成，共${allRecords.length}条`)
      }
    } catch (error) {
      log.error('加载消费记录失败:', error)
      showToast('消费记录加载失败')
    }
  },

  /**
   * 🧾 切换消费记录筛选条件
   */
  switchConsumptionFilter(e: WechatMiniprogram.BaseEvent) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.consumptionFilter) {
      return
    }

    this.setData({
      consumptionFilter: filter,
      consumptionPage: 1,
      consumptionRecords: []
    })

    this.loadConsumptionRecords(true)
  },

  /**
   * 🔴 格式化审核状态
   * @param status - 状态值
   */
  formatReviewStatus(status: string) {
    /* 后端 consumption_records 表有4种状态: pending/approved/rejected/expired */
    const statusMap: Record<string, { text: string; color: string; icon: string }> = {
      pending: { text: '待审核', color: '#FFC107', icon: '⏳' },
      approved: { text: '已通过', color: '#4CAF50', icon: '✅' },
      rejected: { text: '已拒绝', color: '#F44336', icon: '❌' },
      expired: { text: '已过期', color: '#9E9E9E', icon: '⌛' }
    }
    return statusMap[status] || { text: status, color: '#666', icon: '❓' }
  },

  /**
   * 🔴 预览图片
   */
  previewImage(e: WechatMiniprogram.BaseEvent) {
    const imageUrl = e.currentTarget.dataset.url

    if (!imageUrl) {
      return
    }

    wx.previewImage({
      current: imageUrl,
      urls: [imageUrl]
    })
  },

  /**
   * 🧾 查看消费记录详情
   *
   * @description 显示消费记录的详细信息弹窗
   * 字段来源：后端API GET /api/v4/shop/consumption/me 返回的记录
   * 使用status字段（与WXML模板和后端API一致）
   */
  viewReviewDetail(e: WechatMiniprogram.BaseEvent) {
    const record = e.currentTarget.dataset.record

    if (!record) {
      return
    }

    // 🔴 使用status字段（与后端API和WXML模板一致）
    const statusInfo = this.formatReviewStatus(record.status)
    let content = `消费时间：${record.created_at || '未知'}\n审核状态：${statusInfo.text}\n消费金额：${record.consumption_amount || 0}元`

    /* 后端字段: points_to_award（待发放积分数，⚠️ 不是 points_awarded） */
    if (record.status === 'approved' && record.points_to_award) {
      content += `\n获得积分：${formatPoints(record.points_to_award)}`
    }

    if (record.status === 'rejected' && record.admin_notes) {
      content += `\n拒绝原因：${record.admin_notes}`
    }

    if (record.merchant_notes) {
      content += `\n商家备注：${record.merchant_notes}`
    }

    wx.showModal({
      title: '消费记录详情',
      content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 重新上传
   */
  reuploadImage(_e: WechatMiniprogram.BaseEvent) {
    wx.showModal({
      title: '重新上传',
      content: '是否要重新上传照片？',
      success: (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/camera/camera'
          })
        }
      }
    })
  },

  /**
   * 🔴 跳转到拍照页面
   */
  goToCamera() {
    wx.navigateTo({
      url: '/pages/camera/camera'
    })
  },

  /**
   * 🔴 跳转到活动页面
   */
  goToActivity() {
    wx.switchTab({
      url: '/pages/lottery/lottery'
    })
  },

  // ============================================================================
  // 🔄 生命周期和事件处理
  // ============================================================================

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  async onPullDownRefresh() {
    await this.refreshCurrentTab()
    wx.stopPullDownRefresh()
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  async onReachBottom() {
    // 消费记录Tab支持分页加载更多
    if (this.data.activeTab === 1) {
      if (this.data.consumptionHasMore && !this.data.loadingMore) {
        this.setData({ loadingMore: true })
        await this.loadConsumptionRecords()
        this.setData({ loadingMore: false })
      }
    }
  },

  /**
   * 生命周期函数 - 页面卸载
   */
  onUnload() {
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的积分活动记录',
      path: '/packageTrade/records/trade-upload-records/trade-upload-records'
    }
  }
})
