/**
 * 🧾 consumption-records.ts - 消费记录页面（独立页，从 trade-upload-records 拆分而来）
 *
 * 业务定位：用户查看自己在商家的消费记录及审核状态（待审核/已通过/已拒绝/已过期），
 *   可查看详情（含审核链进度）、对已消费记录发起售后申诉。与「资产明细」「积分明细」彻底分开。
 *
 * 数据来源（后端真实接口，零映射直读 snake_case）：
 *   - GET /api/v4/shop/consumption/me           消费记录分页列表（status 服务端筛选）
 *   - GET /api/v4/shop/consumption/detail/:id   单条消费记录详情（含 store/积分流水）
 *
 * @since 2026-06-29（资产/积分/消费三页分家）
 */

const { API, Utils, Wechat, Logger } = require('../../../utils/index')
const log = Logger.createLogger('consumption-records')
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')
const { checkAuth, formatPoints } = Utils
const { showToast } = Wechat

/**
 * 安全转换时间字段为字符串
 * 防止后端返回 Sequelize Date 对象等非字符串类型导致显示 [object Object]
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
  if (typeof value === 'object') {
    if (typeof value.toISOString === 'function') {
      return value.toISOString()
    }
    if (typeof value.toString === 'function' && value.toString() !== '[object Object]') {
      return value.toString()
    }
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
  data: {
    isLoggedIn: false,

    // 🧾 消费记录数据（来自 GET /api/v4/shop/consumption/me）
    consumptionRecords: [] as any[],
    // 状态筛选：all, pending, approved, rejected
    consumptionFilter: 'all',
    consumptionFilterOptions: [
      { key: 'all', name: '全部', icon: '📋', tIcon: 'view-list' },
      { key: 'pending', name: '待审核', icon: '⏳', tIcon: 'time' },
      { key: 'approved', name: '已通过', icon: '✅', tIcon: 'check-circle' },
      { key: 'rejected', name: '已拒绝', icon: '❌', tIcon: 'close-circle' }
    ],
    consumptionPage: 1,
    consumptionPageSize: 20,
    consumptionHasMore: true,
    /** 消费记录-总页数（以后端 pagination.total_pages 为权威，供页码翻页栏使用） */
    consumptionTotalPages: 1,
    /** 消费记录-当前页码（1 基，供页码翻页栏展示） */
    consumptionCurrentPage: 1,

    // 页面状态
    loading: true,
    refreshing: false,
    loadingMore: false,
    initialized: false
  },

  onLoad() {
    log.info('消费记录页面加载')
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userId'],
      actions: []
    })
    wx.setNavigationBarTitle({ title: '消费记录' })
  },

  onShow() {
    log.info('消费记录页面显示')
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })
    if (!this.data.initialized) {
      this.initializePage()
    } else {
      this.refreshRecords()
    }
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  /** 首次进入：加载消费记录 */
  async initializePage() {
    try {
      await this.loadConsumptionRecords(1, false)
    } catch (error) {
      log.error('消费记录页面初始化失败', error)
      showToast('页面加载失败')
    } finally {
      this.setData({ loading: false, initialized: true })
    }
  },

  /** 静默刷新（返回本页/下拉刷新时调用） */
  async refreshRecords() {
    this.setData({ refreshing: true })
    try {
      await this.loadConsumptionRecords(1, false)
    } finally {
      this.setData({ refreshing: false })
    }
  },

  /**
   * 🧾 加载消费记录 - GET /api/v4/shop/consumption/me
   * 后端真分页（status 为服务端筛选），支持页码跳转（替换式）与触底加载（追加式）。
   *
   * @param page   目标页码（1 基）
   * @param append true=追加（触底加载），false=替换（首屏/切筛选/页码跳转）
   */
  async loadConsumptionRecords(page: number = 1, append: boolean = false) {
    if (!this.data.isLoggedIn) {
      return
    }

    if (!append) {
      this.setData({ consumptionRecords: [] })
    }

    const statusFilter = this.data.consumptionFilter === 'all' ? null : this.data.consumptionFilter

    try {
      const result = await API.getMyConsumptionRecords({
        page,
        page_size: this.data.consumptionPageSize,
        status: statusFilter
      })
      const { success, data } = result

      if (success && data) {
        const rawRecords = data.records || []
        const pagination = data.pagination || {}
        const totalPages =
          pagination.total_pages ||
          (rawRecords.length === this.data.consumptionPageSize ? page + 1 : page)

        // 安全转换时间字段（防止 [object Object]）
        const processedRecords = rawRecords.map((record: any) => ({
          ...record,
          created_at: safeTimeString(record.created_at)
        }))

        const allRecords = append
          ? [...this.data.consumptionRecords, ...processedRecords]
          : processedRecords

        this.setData({
          consumptionRecords: allRecords,
          consumptionHasMore: page < totalPages,
          consumptionPage: page + 1,
          consumptionCurrentPage: page,
          consumptionTotalPages: totalPages
        })

        log.info(`消费记录加载完成，共${allRecords.length}条，第${page}页`)
      }
    } catch (error) {
      log.error('加载消费记录失败:', error)
      showToast('消费记录加载失败')
    }
  },

  /**
   * 🧾 消费记录页码翻页栏跳转（exchange-pager 派发）。
   * 后端真分页，翻页为替换式加载，只展示目标页。
   */
  onConsumptionPagerChange(e: any) {
    const page = e.detail && e.detail.page
    if (!page || this.data.loadingMore) {
      return
    }
    this.loadConsumptionRecords(page, false)
  },

  /** 🧾 切换消费记录筛选条件 */
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
    this.loadConsumptionRecords(1, false)
  },

  /** 格式化审核状态（后端 consumption_records 4 态：pending/approved/rejected/expired） */
  formatReviewStatus(status: string) {
    const statusMap: Record<string, { text: string; color: string; icon: string }> = {
      pending: { text: '待审核', color: '#FFC107', icon: '⏳' },
      approved: { text: '已通过', color: '#4CAF50', icon: '✅' },
      rejected: { text: '已拒绝', color: '#F44336', icon: '❌' },
      expired: { text: '已过期', color: '#9E9E9E', icon: '⌛' }
    }
    return statusMap[status] || { text: status, color: '#666', icon: '❓' }
  },

  /**
   * 🧾 查看消费记录详情（调用详情接口 + 审核链进度）
   * 数据来源：GET /api/v4/shop/consumption/detail/:id（后端 JOIN store、积分流水）
   * 所有展示字段以后端详情接口返回为准，前端不自行计算、不静默补全。
   */
  async viewReviewDetail(e: WechatMiniprogram.BaseEvent) {
    const listRecord = e.currentTarget.dataset.record
    if (!listRecord) {
      return
    }

    const recordId = listRecord.consumption_record_id
    if (recordId === undefined || recordId === null || recordId === '') {
      log.error('查看详情失败：消费记录缺少 consumption_record_id 字段', listRecord)
      showToast('记录信息缺失，无法查看详情')
      return
    }

    let detail: any
    try {
      const result = await API.getConsumptionDetail(recordId)
      if (!result || !result.success || !result.data) {
        log.error('消费详情接口返回异常（success/data 缺失）', result)
        showToast('消费详情加载失败')
        return
      }
      detail = result.data
    } catch (error) {
      log.error('加载消费详情失败:', error)
      return
    }

    const statusInfo = this.formatReviewStatus(detail.status)
    let content = `消费时间：${safeTimeString(detail.created_at) || '未知'}\n审核状态：${statusInfo.text}\n消费金额：${detail.consumption_amount || 0}元`

    if (detail.store_name) {
      content += `\n消费门店：${detail.store_name}`
    }

    if (detail.status === 'approved') {
      if (detail.reward_points !== null && detail.reward_points !== undefined) {
        content += `\n到账积分：${formatPoints(detail.reward_points)}`
      }
      if (detail.reward_transaction_no) {
        content += `\n流水单号：${detail.reward_transaction_no}`
      }
    }

    if (detail.status === 'rejected' && detail.admin_notes) {
      content += `\n拒绝原因：${detail.admin_notes}`
    }

    if (detail.merchant_notes) {
      content += `\n商家备注：${detail.merchant_notes}`
    }

    if (detail.status === 'pending') {
      const chainProgress = await this.fetchChainProgressForRecord(detail)
      if (chainProgress) {
        content += `\n\n── 审核链进度 ──\n当前进度：第${chainProgress.current_step}步 / 共${chainProgress.total_steps}步\n审核状态：${chainProgress.status_text}`
        if (chainProgress.current_node_name) {
          content += `\n当前节点：${chainProgress.current_node_name}`
        }
      }
    }

    wx.showModal({
      title: '消费记录详情',
      content,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 获取某条消费记录的审核链进度
   * 优先用后端附带 chain_info；否则当前用户 role_level>=60 时调审核链实例API；都无则返回 null。
   */
  async fetchChainProgressForRecord(record: any): Promise<{
    current_step: number
    total_steps: number
    status_text: string
    current_node_name?: string
  } | null> {
    if (record.chain_info) {
      const localChainInfo = record.chain_info
      return {
        current_step: localChainInfo.current_step || 1,
        total_steps: localChainInfo.total_steps || 1,
        status_text:
          localChainInfo.status === 'in_progress' ? '审核中' : localChainInfo.status || '未知',
        current_node_name: localChainInfo.current_node_name
      }
    }

    const localUserInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const localRoleLevel = localUserInfo?.role_level || 0

    if (localRoleLevel >= 60 && record.consumption_record_id) {
      try {
        const chainResult = await API.getApprovalChainInstances({
          auditable_type: 'consumption',
          auditable_id: record.consumption_record_id,
          page: 1,
          page_size: 1
        })

        if (chainResult?.success && chainResult.data?.items?.length > 0) {
          const chainInstance = chainResult.data.items[0]
          return {
            current_step: chainInstance.current_step || 1,
            total_steps: chainInstance.total_steps || 1,
            status_text:
              chainInstance.status === 'in_progress' ? '审核中' : chainInstance.status || '未知',
            current_node_name: chainInstance.current_node_name
          }
        }
      } catch (chainQueryError) {
        log.warn('查询审核链进度失败（非阻断）:', chainQueryError)
      }
    }

    return null
  },

  /**
   * 申请售后（消费记录自助发起售后申诉，统一走 POST /system/disputes）
   * order_type=consumption，order_id=consumption_record_id（消费记录主键）
   */
  onApplyAfterSale(e: WechatMiniprogram.BaseEvent) {
    const recordId = e.currentTarget.dataset.recordId
    const orderTitle = e.currentTarget.dataset.orderTitle || ''
    if (recordId === undefined || recordId === null || recordId === '') {
      log.error('申请售后失败：消费记录缺少 consumption_record_id 字段', e.currentTarget.dataset)
      showToast('订单信息缺失，无法发起售后')
      return
    }
    const titleParam = orderTitle ? `&order_title=${encodeURIComponent(orderTitle)}` : ''
    wx.navigateTo({
      url: `/packageUser/disputes/create?order_type=consumption&order_id=${recordId}${titleParam}`,
      fail: err => {
        log.error('跳转售后申诉页失败:', err)
        showToast('页面跳转失败，请重试')
      }
    })
  },

  /** 跳转到活动页面（空状态引导） */
  goToActivity() {
    wx.switchTab({ url: '/pages/lottery/lottery' })
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    await this.refreshRecords()
    wx.stopPullDownRefresh()
  },

  /** 触底加载更多 */
  async onReachBottom() {
    if (this.data.consumptionHasMore && !this.data.loadingMore) {
      this.setData({ loadingMore: true })
      await this.loadConsumptionRecords(this.data.consumptionPage, true)
      this.setData({ loadingMore: false })
    }
  },

  onShareAppMessage() {
    return {
      title: '我的消费记录',
      path: '/packageUser/records/consumption-records/consumption-records'
    }
  }
})
