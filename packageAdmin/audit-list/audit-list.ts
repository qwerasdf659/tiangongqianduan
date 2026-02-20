// packageAdmin/audit-list/audit-list.ts - 审核列表页面（V5.3.0）+ MobX响应式状态
// 核心功能：分页加载待审核记录 → 单条/批量审核通过或拒绝 → 刷新列表

// 统一工具函数导入（通过 utils/index.ts 入口）
const { API, Utils, Wechat, Logger } = require('../../utils/index')
const log = Logger.createLogger('audit-list')
const { checkAuth, formatPhoneNumber } = Utils
const { showToast } = Wechat

// MobX Store绑定 - 用户认证状态自动同步
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 从日期字符串中直接提取年月日时分秒（不依赖 new Date() 解析）
 *
 * 微信小程序的JS引擎对 ISO 8601 带时区偏移的字符串（如 "+08:00"）解析不可靠，
 * 使用正则直接提取数字分量，确保100%兼容所有运行环境。
 *
 * @param dateStr - 日期字符串（如 "2026-02-02T03:17:19+08:00" 或 "2026-02-02 03:17:19"）
 * @returns 中文格式时间（如 "2026年02月02日 03:17:19"），解析失败返回原始字符串
 */
function extractDateParts(dateStr: string): string {
  if (!dateStr) {
    return '时间未知'
  }

  const fullMatch = dateStr.match(
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})[T\s](\d{1,2}):(\d{1,2}):(\d{1,2})/
  )
  if (fullMatch) {
    const [, yr, mo, dy, hr, mi, sc] = fullMatch
    return `${yr}年${mo.padStart(2, '0')}月${dy.padStart(2, '0')}日 ${hr.padStart(2, '0')}:${mi.padStart(2, '0')}:${sc.padStart(2, '0')}`
  }

  const dateOnlyMatch = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (dateOnlyMatch) {
    const [, yr, mo, dy] = dateOnlyMatch
    return `${yr}年${mo.padStart(2, '0')}月${dy.padStart(2, '0')}日`
  }

  return dateStr
}

/**
 * 审核列表页面（管理员）
 *
 * 核心功能：
 * 1. 分页加载待审核消费记录列表（每页10条，页码水平导航）
 * 2. 单条审核通过/拒绝
 * 3. 批量勾选 → 批量审核通过/拒绝
 * 4. 下拉刷新
 */
Page({
  data: {
    // 列表数据
    records: [] as any[],

    // 分页参数
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 0,
    pageNumbers: [] as number[],

    // 页面状态
    loading: false,

    // 批量选择
    selectedCount: 0,
    allSelected: false,

    // 审核弹窗
    selectedRecord: null,
    showRejectModal: false,
    rejectReason: '',
    submitting: false,
    batchRejectMode: false,

    // 批量操作进度
    showBatchProgress: false,
    batchProgressText: '',
    batchProgressDetail: ''
  },

  // MobX绑定实例引用（在onUnload中销毁）
  userBindings: null as any,

  onLoad(_options: any) {
    log.info('审核列表页面加载')

    // MobX Store绑定 - 用户认证状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 权限验证：必须已登录
    if (!checkAuth()) {
      log.error('用户未登录，跳转到登录页')
      return
    }

    // 权限检查：仅管理员(role_level>=100)可访问审批功能
    const localUserInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const localRoleLevel = localUserInfo?.role_level || 0

    if (localRoleLevel < 100) {
      log.error('用户无审批权限，role_level:', localRoleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅管理员可查看和审核消费记录。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    this.loadPendingRecords(1)
  },

  // ==================== 数据加载 ====================

  /**
   * 加载待审核消费记录列表
   *
   * 调用后端API: GET /api/v4/console/consumption/pending
   *
   * @param targetPage - 目标页码（默认第1页）
   */
  async loadPendingRecords(targetPage: number = 1) {
    if (this.data.loading) {
      return
    }

    this.setData({ loading: true })

    try {
      log.info('加载待审核记录，页码:', targetPage)

      const apiResult = await API.getPendingConsumption({
        page: targetPage,
        page_size: this.data.page_size
      })

      if (apiResult?.success && apiResult.data) {
        const { records: apiRecords, pagination } = apiResult.data

        log.info('待审核记录加载成功:', {
          count: apiRecords.length,
          page: pagination.page,
          total: pagination.total
        })

        // 格式化时间 + 手机号脱敏 + 添加前端UI选择状态
        const formattedRecords = apiRecords.map((recordItem: any) => ({
          ...recordItem,
          created_at_formatted: this.formatBeijingTime(recordItem.created_at),
          user_mobile_display: formatPhoneNumber(recordItem.user_mobile),
          selected: false
        }))

        // 当前页无数据但总数>0（批量操作后可能出现），回退到第1页
        if (formattedRecords.length === 0 && pagination.total > 0) {
          this.setData({ loading: false })
          this.loadPendingRecords(1)
          return
        }

        this.setData({
          records: formattedRecords,
          page: pagination.page,
          total: pagination.total,
          total_pages: pagination.total_pages,
          selectedCount: 0,
          allSelected: false
        })

        this.computePageNumbers()
      } else {
        throw new Error(apiResult?.message || '加载失败')
      }
    } catch (loadError: any) {
      log.error('加载待审核记录失败:', loadError)
      showToast(loadError.message || '加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },

  // ==================== 分页导航 ====================

  /**
   * 计算分页页码数组（最多显示5个页码，当前页居中）
   */
  computePageNumbers() {
    const localTotalPages = this.data.total_pages
    const localCurrentPage = this.data.page
    const maxVisiblePages = 5

    let computedNumbers: number[] = []

    if (localTotalPages <= maxVisiblePages) {
      computedNumbers = Array.from({ length: localTotalPages }, (_, idx) => idx + 1)
    } else {
      let startPage = Math.max(1, localCurrentPage - Math.floor(maxVisiblePages / 2))
      let endPage = startPage + maxVisiblePages - 1

      if (endPage > localTotalPages) {
        endPage = localTotalPages
        startPage = Math.max(1, endPage - maxVisiblePages + 1)
      }

      computedNumbers = Array.from({ length: endPage - startPage + 1 }, (_, idx) => startPage + idx)
    }

    this.setData({ pageNumbers: computedNumbers })
  },

  /** 点击页码跳转 */
  goToPage(e: any) {
    const targetPage = e.currentTarget.dataset.page
    if (targetPage === this.data.page) {
      return
    }
    this.loadPendingRecords(targetPage)
  },

  /** 上一页 */
  goToPrevPage() {
    if (this.data.page <= 1) {
      return
    }
    this.loadPendingRecords(this.data.page - 1)
  },

  /** 下一页 */
  goToNextPage() {
    if (this.data.page >= this.data.total_pages) {
      return
    }
    this.loadPendingRecords(this.data.page + 1)
  },

  // ==================== 批量选择 ====================

  /** 切换单条记录选中状态 */
  toggleSelect(e: any) {
    const recordIndex = e.currentTarget.dataset.index
    const currentChecked = this.data.records[recordIndex].selected

    this.setData({
      [`records[${recordIndex}].selected`]: !currentChecked
    })

    this.refreshSelectedCount()
  },

  /** 全选/取消全选 */
  toggleSelectAll() {
    const newAllSelected = !this.data.allSelected

    const toggledRecords = this.data.records.map((recordItem: any) => ({
      ...recordItem,
      selected: newAllSelected
    }))

    this.setData({
      records: toggledRecords,
      allSelected: newAllSelected,
      selectedCount: newAllSelected ? toggledRecords.length : 0
    })
  },

  /** 重新统计已选数量和全选状态 */
  refreshSelectedCount() {
    const localSelectedCount = this.data.records.filter((r: any) => r.selected).length
    const localAllSelected =
      localSelectedCount === this.data.records.length && localSelectedCount > 0

    this.setData({
      selectedCount: localSelectedCount,
      allSelected: localAllSelected
    })
  },

  // ==================== 批量审核通过 ====================

  /** 点击批量通过按钮 → 弹出确认框 */
  onBatchApprove() {
    const localCheckedRecords = this.data.records.filter((r: any) => r.selected)
    if (localCheckedRecords.length === 0) {
      showToast('请先选择要审核的记录')
      return
    }

    wx.showModal({
      title: '确认批量通过',
      content: `确定批量通过 ${localCheckedRecords.length} 条消费记录？\n审核通过后积分将自动发放，此操作不可撤销。`,
      success: (confirmResult: any) => {
        if (confirmResult.confirm) {
          this.executeBatchApprove(localCheckedRecords)
        }
      }
    })
  },

  /**
   * 执行批量审核通过
   *
   * 调用后端统一批量审核接口:
   * POST /api/v4/console/consumption/batch-review
   * Body: { record_ids, action: 'approve' }
   *
   * 响应: data.stats.success_count / failed_count / skipped_count
   */
  async executeBatchApprove(batchApproveRecords: any[]) {
    this.setData({
      showBatchProgress: true,
      batchProgressText: '批量审核通过中...',
      batchProgressDetail: `正在处理 ${batchApproveRecords.length} 条记录...`,
      submitting: true
    })

    try {
      const recordIds = batchApproveRecords.map((r: any) => r.record_id)
      const batchResult = await API.batchReviewConsumption({
        record_ids: recordIds,
        action: 'approve'
      })

      this.setData({ showBatchProgress: false, submitting: false })

      if (batchResult?.success && batchResult.data) {
        const { stats } = batchResult.data
        const approveSuccessCount = stats.success_count || 0
        const approveFailCount = stats.failed_count || 0
        const approveSkippedCount = stats.skipped_count || 0

        let approveResultMsg = `成功${approveSuccessCount}条`
        if (approveFailCount > 0) {
          approveResultMsg += `，失败${approveFailCount}条`
        }
        if (approveSkippedCount > 0) {
          approveResultMsg += `，跳过${approveSkippedCount}条`
        }

        showToast(approveResultMsg, approveFailCount === 0 ? 'success' : 'none')
      } else {
        showToast(batchResult?.message || '批量审核失败')
      }
    } catch (batchError: any) {
      this.setData({ showBatchProgress: false, submitting: false })
      log.error('批量审核通过失败:', batchError)
      showToast(batchError.message || '批量审核失败')
    }

    setTimeout(() => {
      this.loadPendingRecords(this.data.page)
    }, 1500)
  },

  // ==================== 批量审核拒绝 ====================

  /** 点击批量拒绝按钮 → 打开拒绝原因弹窗（批量模式） */
  onBatchReject() {
    const localCheckedRecords = this.data.records.filter((r: any) => r.selected)
    if (localCheckedRecords.length === 0) {
      showToast('请先选择要拒绝的记录')
      return
    }

    this.setData({
      batchRejectMode: true,
      showRejectModal: true,
      rejectReason: ''
    })
  },

  /**
   * 执行批量审核拒绝
   *
   * 调用后端统一批量审核接口:
   * POST /api/v4/console/consumption/batch-review
   * Body: { record_ids, action: 'reject', reason }
   *
   * 响应: data.stats.success_count / failed_count / skipped_count
   */
  async executeBatchReject(batchRejectRecords: any[], rejectReasonText: string) {
    this.setData({
      showRejectModal: false,
      showBatchProgress: true,
      batchProgressText: '批量拒绝中...',
      batchProgressDetail: `正在处理 ${batchRejectRecords.length} 条记录...`,
      submitting: true
    })

    try {
      const recordIds = batchRejectRecords.map((r: any) => r.record_id)
      const batchResult = await API.batchReviewConsumption({
        record_ids: recordIds,
        action: 'reject',
        reason: rejectReasonText
      })

      this.setData({
        showBatchProgress: false,
        submitting: false,
        batchRejectMode: false,
        selectedRecord: null,
        rejectReason: ''
      })

      if (batchResult?.success && batchResult.data) {
        const { stats } = batchResult.data
        const rejectSuccessCount = stats.success_count || 0
        const rejectFailCount = stats.failed_count || 0
        const rejectSkippedCount = stats.skipped_count || 0

        let rejectResultMsg = `成功拒绝${rejectSuccessCount}条`
        if (rejectFailCount > 0) {
          rejectResultMsg += `，失败${rejectFailCount}条`
        }
        if (rejectSkippedCount > 0) {
          rejectResultMsg += `，跳过${rejectSkippedCount}条`
        }

        showToast(rejectResultMsg, rejectFailCount === 0 ? 'success' : 'none')
      } else {
        showToast(batchResult?.message || '批量拒绝失败')
      }
    } catch (batchError: any) {
      this.setData({
        showBatchProgress: false,
        submitting: false,
        batchRejectMode: false,
        selectedRecord: null,
        rejectReason: ''
      })
      log.error('批量拒绝失败:', batchError)
      showToast(batchError.message || '批量拒绝失败')
    }

    setTimeout(() => {
      this.loadPendingRecords(this.data.page)
    }, 1500)
  },

  // ==================== 单条审核 ====================

  /**
   * 格式化北京时间显示（兼容微信小程序JS引擎）
   *
   * 支持格式：
   * 1. 对象 { iso, display } — 后端标准返回格式
   * 2. ISO字符串 "2026-02-02T03:17:19+08:00"
   * 3. 标准字符串 "2026-02-02 03:17:19"
   * 4. Unix时间戳（毫秒）
   */
  formatBeijingTime(dateTimeValue: any): string {
    if (!dateTimeValue) {
      return '时间未知'
    }

    try {
      if (typeof dateTimeValue === 'object' && dateTimeValue !== null) {
        if (dateTimeValue.display) {
          return String(dateTimeValue.display)
        }
        if (dateTimeValue.iso) {
          return extractDateParts(String(dateTimeValue.iso))
        }
        return '时间未知'
      }

      if (typeof dateTimeValue === 'number') {
        const dateObj = new Date(dateTimeValue)
        return isNaN(dateObj.getTime()) ? '时间未知' : extractDateParts(dateObj.toISOString())
      }

      return extractDateParts(String(dateTimeValue))
    } catch (formatError: any) {
      log.error('时间格式化失败:', formatError, '原始值:', dateTimeValue)
      return typeof dateTimeValue === 'string' ? dateTimeValue : '时间未知'
    }
  },

  /** 点击审核通过按钮 → 弹出确认框 */
  onApprove(e: any) {
    const approveTargetRecord = e.currentTarget.dataset.record

    log.info('点击审核通过，记录:', approveTargetRecord)

    wx.showModal({
      title: '确认审核通过',
      content: `用户：${approveTargetRecord.user_nickname || approveTargetRecord.user_mobile}\n消费金额：¥${approveTargetRecord.consumption_amount}元\n预计积分：${approveTargetRecord.points_to_award}分\n\n审核通过后，积分将自动发放给用户，此操作不可撤销。`,
      success: async (confirmResult: any) => {
        if (confirmResult.confirm) {
          await this.handleApprove(approveTargetRecord)
        }
      }
    })
  },

  /**
   * 处理单条审核通过
   * 调用后端API: POST /api/v4/console/consumption/approve/:record_id
   */
  async handleApprove(approveRecord: any) {
    this.setData({ submitting: true })

    try {
      log.info('开始审核通过，记录ID:', approveRecord.record_id)

      const approvalResult = await API.approveConsumption(approveRecord.record_id, {
        admin_notes: '核实无误，审核通过'
      })

      log.info('审核通过成功:', approvalResult)
      showToast(approvalResult.message || '审核通过', 'success')

      setTimeout(() => {
        this.loadPendingRecords(this.data.page)
      }, 1500)
    } catch (approveError: any) {
      log.error('审核通过失败:', approveError)
      showToast(approveError.message || '审核失败')
    } finally {
      this.setData({ submitting: false })
    }
  },

  /** 点击审核拒绝按钮 → 打开拒绝原因弹窗（单条模式） */
  onReject(e: any) {
    const rejectTargetRecord = e.currentTarget.dataset.record
    log.info('点击审核拒绝，记录:', rejectTargetRecord)

    this.setData({
      selectedRecord: rejectTargetRecord,
      showRejectModal: true,
      rejectReason: '',
      batchRejectMode: false
    })
  },

  /** 拒绝原因输入 */
  onRejectReasonInput(e: any) {
    this.setData({ rejectReason: e.detail.value })
  },

  /**
   * 确认审核拒绝（单条/批量共用）
   * 根据 batchRejectMode 区分模式
   */
  async confirmReject() {
    if (!this.data.rejectReason || this.data.rejectReason.trim().length < 5) {
      showToast('拒绝原因至少5个字符')
      return
    }

    const trimmedReason = this.data.rejectReason.trim()

    // 批量拒绝模式：收集已勾选记录，调用批量执行
    if (this.data.batchRejectMode) {
      const batchSelectedRecords = this.data.records.filter((r: any) => r.selected)
      await this.executeBatchReject(batchSelectedRecords, trimmedReason)
      return
    }

    // 单条拒绝模式
    this.setData({ submitting: true })

    try {
      log.info('开始审核拒绝，记录ID:', this.data.selectedRecord.record_id)

      const rejectionResult = await API.rejectConsumption(this.data.selectedRecord.record_id, {
        admin_notes: trimmedReason
      })

      log.info('审核拒绝成功:', rejectionResult)

      this.setData({
        showRejectModal: false,
        selectedRecord: null,
        rejectReason: ''
      })

      showToast(rejectionResult.message || '已拒绝', 'success')

      setTimeout(() => {
        this.loadPendingRecords(this.data.page)
      }, 1500)
    } catch (rejectError: any) {
      log.error('审核拒绝失败:', rejectError)
      showToast(rejectError.message || '拒绝失败')
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ==================== 弹窗控制 ====================

  /** 阻止事件冒泡（弹窗内容区域，防止点击穿透到遮罩层） */
  stopPropagation() {},

  /** 取消拒绝弹窗 */
  cancelReject() {
    this.setData({
      showRejectModal: false,
      selectedRecord: null,
      rejectReason: '',
      batchRejectMode: false
    })
  },

  // ==================== 生命周期 ====================

  onShow() {
    log.info('审核列表页面显示')
  },

  /** 下拉刷新 → 重新加载第1页 */
  onPullDownRefresh() {
    log.info('下拉刷新')
    this.loadPendingRecords(1).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onUnload() {
    log.info('审核列表页面卸载')
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})

export {}
