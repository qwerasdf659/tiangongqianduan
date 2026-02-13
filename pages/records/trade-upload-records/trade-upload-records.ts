/**
 * 📊 trade-upload-records.ts - 积分活动记录页面（交易+消费合并）+ MobX响应式状态
 *
 * @description
 * 将交易记录和消费记录合并到一个页面，使用Tab切换。
 * Tab0 = 交易记录（资产流水），Tab1 = 消费记录（商家消费积分）
 *
 * @version 2.0.0
 * @author Restaurant Lottery Team
 * @since 2026-02-07
 *
 * API依赖:
 *   - API.getPointsTransactions() → GET /api/v4/assets/transactions（交易流水）
 *   - API.getMyConsumptionRecords() → GET /api/v4/shop/consumption/me（消费记录）
 */

const app = getApp()
// 🔴 统一工具函数导入
const { API, Utils, Wechat } = require('../../../utils/index')
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')
// 从Utils中解构认证助手和格式化函数
const { checkAuth, formatPoints } = Utils
// 从Wechat中解构Toast函数
const { showToast } = Wechat

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

    // 🔴 交易记录相关数据
    transactionRecords: [],
    filteredRecords: [],
    monthlyStats: {
      totalIncome: 0,
      totalExpense: 0,
      netIncome: 0,
      transactionCount: 0
    },
    // 筛选条件
    currentTimeFilter: 'all',
    currentTypeFilter: 'all',
    searchKeyword: '',
    showFilterPanel: false,

    // 🧾 消费记录相关数据（决策2：原"上传记录"改为"消费记录"）
    consumptionRecords: [],
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
    loadingMore: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('📊 积分活动记录页面加载')

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

    this.initializePage()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    console.log('📊 积分活动记录页面显示')
    // ✅ 使用helper：检查登录状态
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })
    this.refreshCurrentTab()
  },

  /**
   * 🔴 初始化页面
   */
  async initializePage() {
    try {
      // ✅ 使用helper：检查登录状态
      if (!checkAuth()) {
        return
      }
      this.setData({ isLoggedIn: true })

      // 加载当前Tab的数据
      await this.loadCurrentTabData()
    } catch (error) {
      console.error('❌ 积分活动记录页面初始化失败', error)
      showToast('页面加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  /**
   * 🔴 Tab切换事件
   */
  onTabChange(e) {
    const tabId = e.currentTarget.dataset.id
    if (tabId === this.data.activeTab) {
      return
    }

    console.log(`🔄 切换到Tab${tabId}`)
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
      // 🧾 消费记录Tab（决策2：替代原"上传记录"）
      await this.loadConsumptionRecords(true)
    }
  },

  /**
   * 🔴 刷新当前Tab的数据
   */
  async refreshCurrentTab() {
    this.setData({ refreshing: true })
    await this.loadCurrentTabData()
    this.setData({ refreshing: false })
  },

  // ============================================================================
  // 💰 交易记录相关方法
  // ============================================================================

  /**
   * ✅ 加载交易数据 - V4.2直接调用API方法
   */
  async loadTransactionData() {
    // ✅ V4.2: 直接调用API方法（通过Token识别用户，无需传userId）
    const result = await API.getPointsTransactions()
    const { success, data } = result

    if (success && data) {
      // 🔴 V4.0修正: 后端返回的字段名是transactions，不是records（文档Line 5871）
      const { transactions = [], stats = {} } = data

      console.log('📊 成功加载交易记录:', {
        transactionsCount: transactions.length,
        stats
      })

      this.setData({
        transactionRecords: transactions,
        monthlyStats: stats || {
          totalIncome: 0,
          totalExpense: 0,
          netIncome: 0,
          transactionCount: 0
        }
      })

      // 应用筛选
      this.applyFilters()
    } else {
      // 显示友好的错误提示
      this.setData({
        transactionRecords: [],
        filteredRecords: [],
        monthlyStats: {
          totalIncome: 0,
          totalExpense: 0,
          netIncome: 0,
          transactionCount: 0
        }
      })
      showToast('交易记录加载失败')
    }
  },

  /**
   * 🔴 应用筛选条件
   */
  applyFilters() {
    let filteredRecords = [...this.data.transactionRecords]

    // 时间筛选
    if (this.data.currentTimeFilter !== 'all') {
      filteredRecords = this.filterByTime(filteredRecords, this.data.currentTimeFilter)
    }

    // 类型筛选
    if (this.data.currentTypeFilter !== 'all') {
      if (this.data.currentTypeFilter === 'income') {
        filteredRecords = filteredRecords.filter(record => record.category === 'income')
      } else if (this.data.currentTypeFilter === 'expense') {
        filteredRecords = filteredRecords.filter(record => record.category === 'expense')
      } else {
        filteredRecords = filteredRecords.filter(
          record => record.type === this.data.currentTypeFilter
        )
      }
    }

    // 关键词搜索
    if (this.data.searchKeyword) {
      const keyword = this.data.searchKeyword.toLowerCase()
      filteredRecords = filteredRecords.filter(
        record =>
          (record.title && record.title.toLowerCase().includes(keyword)) ||
          (record.description && record.description.toLowerCase().includes(keyword)) ||
          (record.txn_id && record.txn_id.toLowerCase().includes(keyword))
      )
    }

    // 按时间倒序排列
    filteredRecords.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    this.setData({ filteredRecords })
  },

  /**
   * 🔴 按时间筛选
   */
  filterByTime(records, timeFilter) {
    const now = new Date()
    let startDate = null

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

    return records.filter(record => new Date(record.created_at) >= startDate)
  },

  /**
   * 🔴 时间筛选
   */
  onTimeFilter(e) {
    const timeFilter = e.currentTarget.dataset.filter
    this.setData({ currentTimeFilter: timeFilter })
    this.applyFilters()
  },

  /**
   * 🔴 类型筛选
   */
  onTypeFilter(e) {
    const typeFilter = e.currentTarget.dataset.filter
    this.setData({ currentTypeFilter: typeFilter })
    this.applyFilters()
  },

  /**
   * 🔴 搜索输入
   */
  onSearchInput(e) {
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
   * 🔴 格式化金额显示
   */
  formatAmount(amount) {
    if (amount > 0) {
      return `+${amount}`
    }
    return `${amount}`
  },

  /**
   * 🔴 获取交易类型图标
   */
  getTypeIcon(type) {
    const iconMap = {
      lottery: '🎰',
      upload: '📸',
      exchange: '🛒',
      trade: '🏪',
      compensation: '💰',
      checkin: '✅',
      activity: '🎁',
      referral: '👥'
    }
    return iconMap[type] || '📄'
  },

  /**
   * 🔴 查看交易详情
   */
  onViewDetail(e) {
    const record = e.currentTarget.dataset.record

    wx.showModal({
      title: '交易详情',
      content: `交易类型：${record.title}\n交易金额：${this.formatAmount(record.amount)}积分\n交易时间：${this.formatTime(record.created_at)}\n交易ID：${record.txn_id}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 🔴 复制交易ID
   */
  onCopyTxnId(e) {
    const { txnId } = e.currentTarget.dataset
    wx.setClipboardData({
      data: txnId,
      success: () => {
        showToast('交易ID已复制')
      }
    })
  },

  // ============================================================================
  // 🧾 消费记录相关方法（决策2：替代原"上传记录"）
  // 后端API: GET /api/v4/shop/consumption/me（支持分页 + status筛选）
  // ============================================================================

  /**
   * 🧾 加载消费记录（决策2：替代原getMyUploads/getMyUploadStats）
   *
   * refresh - 是否刷新（重置分页）
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
        const newRecords = data.records || []
        const allRecords = refresh ? newRecords : [...this.data.consumptionRecords, ...newRecords]

        this.setData({
          consumptionRecords: allRecords,
          consumptionHasMore: newRecords.length === this.data.consumptionPageSize,
          consumptionPage: currentPage + 1
        })

        console.log(`✅ 消费记录加载完成，共${allRecords.length}条`)
      }
    } catch (error) {
      console.error('❌ 加载消费记录失败:', error)
      showToast('消费记录加载失败')
    }
  },

  /**
   * 🧾 切换消费记录筛选条件
   */
  switchConsumptionFilter(e) {
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
   * status - 状态值
   */
  formatReviewStatus(status) {
    const statusMap = {
      pending: { text: '待审核', color: '#FFC107', icon: '⏳' },
      approved: { text: '已通过', color: '#4CAF50', icon: '✅' },
      rejected: { text: '已拒绝', color: '#F44336', icon: '❌' },
      processing: { text: '审核中', color: '#2196F3', icon: '🔄' }
    }
    return statusMap[status] || { text: status, color: '#666', icon: '❓' }
  },

  /**
   * 🔴 预览图片
   */
  previewImage(e) {
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
  viewReviewDetail(e) {
    const record = e.currentTarget.dataset.record

    if (!record) {
      return
    }

    // 🔴 使用status字段（与后端API和WXML模板一致，不是review_status）
    const statusInfo = this.formatReviewStatus(record.status)
    let content = `消费时间：${record.created_at}\n审核状态：${statusInfo.text}\n消费金额：¥${record.consumption_amount || 0}`

    if (record.status === 'approved' && record.points_awarded) {
      content += `\n获得积分：${formatPoints(record.points_awarded)}`
    }

    if (record.status === 'rejected' && record.reject_reason) {
      content += `\n拒绝原因：${record.reject_reason}`
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
  reuploadImage(_e) {
    wx.showModal({
      title: '重新上传',
      content: '是否要重新上传照片？',
      success: res => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/camera/camera'
          })
        }
      }
    })
  },

  /**
   * 🔴 删除记录
   */
  deleteRecord(_e) {
    // ⚠️ 删除功能待后端实现删除API后启用

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这条上传记录吗？',
      success: async res => {
        if (res.confirm) {
          showToast('删除功能开发中')
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
  // 🔧 通用工具方法
  // ============================================================================

  /**
   * 🔴 格式化时间
   * timestamp - 时间戳
   */
  formatTime(timestamp) {
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()

    if (diff < 60000) {
      // 1分钟内
      return '刚刚'
    } else if (diff < 3600000) {
      // 1小时内
      return `${Math.floor(diff / 60000)}分钟前`
    } else if (diff < 86400000) {
      // 1天内
      return `${Math.floor(diff / 3600000)}小时前`
    } else {
      return date.toLocaleDateString('zh-CN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
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
      path: '/pages/records/trade-upload-records/trade-upload-records'
    }
  }
})

export {}
