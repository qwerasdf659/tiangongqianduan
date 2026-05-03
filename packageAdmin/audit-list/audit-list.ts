/**
 * 审核管理页面（V6.0 审核链对接版）+ MobX响应式状态
 *
 * 双模式视图：
 * - 「消费审核」标签页：传统消费记录审核（单条/批量），保持原有功能
 * - 「我的待办」标签页：审核链分配给当前用户的待审核步骤
 *
 * 权限：business_manager(role_level>=60) 及以上可访问
 *   - 消费审核：保持原有API（后端内部已集成审核链路由判断）
 *   - 审核链步骤：通过 ApprovalChainService.processStep() 精确鉴权
 *
 * @file packageAdmin/audit-list/audit-list.ts
 * @version 6.0.0
 * @since 2026-03-14
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const auditLog = Logger.createLogger('audit-list')
const { checkAuth, formatPhoneNumber } = Utils
const { showToast } = Wechat

const AUDIT_TAB_ITEMS = [
  { key: 'consumption', label: '消费审核' },
  { key: 'myPending', label: '我的待办' }
]

function buildAuditTabs(total: number, pendingTotal: number) {
  return AUDIT_TAB_ITEMS.map((tabItem: any) => {
    const count = tabItem.key === 'consumption' ? total : pendingTotal
    return {
      ...tabItem,
      badgeProps: count > 0 ? { count: count > 99 ? '99+' : count } : null
    }
  })
}

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { auditStore } = require('../../store/audit')

/** 审核链实例状态枚举（后端定义，前端展示用） */
const CHAIN_STATUS_MAP: Record<string, string> = {
  in_progress: '审核中',
  completed: '已通过',
  rejected: '已拒绝',
  cancelled: '已取消',
  timeout: '已超时'
}

/** 审核链步骤状态枚举 */
const STEP_STATUS_MAP: Record<string, string> = {
  waiting: '等待中',
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  skipped: '已跳过',
  timeout: '已超时'
}

/** 业务类型中文映射 */
const AUDITABLE_TYPE_MAP: Record<string, string> = {
  consumption: '消费审核',
  merchant_points: '商家积分审核',
  exchange: '兑换审核'
}

/**
 * 从日期字符串中直接提取年月日时分秒（不依赖 new Date() 解析）
 *
 * 微信小程序的JS引擎对 ISO 8601 带时区偏移的字符串解析不可靠，
 * 使用正则直接提取数字分量，确保100%兼容所有运行环境。
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

Page({
  data: {
    // ===== 标签页切换 =====
    /** 当前激活的标签页: 'consumption' = 消费审核, 'myPending' = 我的待办 */
    activeTab: 'consumption' as 'consumption' | 'myPending',
    auditTabs: buildAuditTabs(0, 0),

    // ===== 消费审核（原有功能） =====
    records: [] as any[],
    page: 1,
    page_size: 10,
    total: 0,
    total_pages: 0,
    loading: false,
    loadingMore: false,
    noMore: false,
    selectedCount: 0,
    allSelected: false,
    selectedRecord: null as any,
    showRejectModal: false,
    rejectReason: '',
    submitting: false,
    batchRejectMode: false,
    showBatchProgress: false,
    batchProgressText: '',
    batchProgressDetail: '',

    // ===== 审核链待办（新增功能） =====
    /** 我的待审核步骤列表 */
    pendingSteps: [] as any[],
    /** 待办分页 */
    pendingPage: 1,
    pendingPageSize: 10,
    pendingTotal: 0,
    pendingTotalPages: 0,
    /** 待办加载状态 */
    pendingLoading: false,
    pendingLoadingMore: false,
    pendingNoMore: false,
    /** 当前操作的审核链步骤（用于拒绝弹窗） */
    selectedStep: null as any,
    /** 审核链拒绝弹窗 */
    showChainRejectModal: false,
    chainRejectReason: '',
    chainSubmitting: false,

    // ===== 审核链详情弹窗 =====
    showChainDetailModal: false,
    chainDetail: null as any,

    // ===== 权限相关 =====
    /** 当前用户角色等级 */
    currentRoleLevel: 0,
    /** 是否为admin（role_level>=100），admin可使用批量审核和传统消费审核 */
    isAdminUser: false
  },

  /** WebSocket 订阅页面ID（用于 app.subscribeWebSocketMessages / unsubscribe） */
  _pageId: 'audit-list',

  userBindings: null as any,

  onLoad(_options: any) {
    auditLog.info('审核管理页面加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    if (!checkAuth()) {
      auditLog.error('用户未登录，跳转到登录页')
      return
    }

    const localUserInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const localRoleLevel = localUserInfo?.role_level || 0

    /**
     * 权限准入线: role_level >= 60 (business_manager及以上)
     * 与后端路由 requireRoleLevel(60) 对齐
     * 具体审核权限由 ApprovalChainService.processStep() 精确校验
     */
    if (localRoleLevel < 60) {
      auditLog.error('用户无审核权限，role_level:', localRoleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅业务经理及以上角色可查看和审核消费记录。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    const isAdminUser = localRoleLevel >= 100

    this.setData({
      currentRoleLevel: localRoleLevel,
      isAdminUser
    })

    /**
     * 初始加载策略:
     * - admin(role_level>=100): 默认显示「消费审核」标签页（传统功能）
     * - 非admin审核人(60<=role_level<100): 默认显示「我的待办」标签页（审核链）
     */
    if (isAdminUser) {
      this.setData({ activeTab: 'consumption' })
      this.loadPendingRecords(1)
    } else {
      this.setData({ activeTab: 'myPending' })
      this.loadMyPendingSteps(1)
    }
  },

  // ==================== 标签页切换 ====================

  /** 切换标签页 */
  onTabSwitch(e: any) {
    const targetTab = (e.detail?.value || e.currentTarget?.dataset?.tab) as
      | 'consumption'
      | 'myPending'
    if (targetTab === this.data.activeTab) {
      return
    }

    auditLog.info('切换标签页:', targetTab)
    this.setData({ activeTab: targetTab })

    if (targetTab === 'consumption') {
      if (this.data.records.length === 0) {
        this.loadPendingRecords(1)
      }
    } else if (targetTab === 'myPending') {
      if (this.data.pendingSteps.length === 0) {
        this.loadMyPendingSteps(1)
      }
    }
  },

  // ==================== 消费审核（原有功能，保持不变） ====================

  /**
   * 加载待审核消费记录列表
   * 调用后端API: GET /api/v4/console/consumption/pending
   */
  async loadPendingRecords(targetPage: number = 1, append: boolean = false) {
    if (this.data.loading || this.data.loadingMore) {
      return
    }

    this.setData({
      loading: !append,
      loadingMore: append
    })

    try {
      auditLog.info('加载待审核记录，页码:', targetPage)

      const apiResult = await API.getPendingConsumption({
        page: targetPage,
        page_size: this.data.page_size
      })

      if (apiResult?.success && apiResult.data) {
        const { records: apiRecords, pagination } = apiResult.data

        auditLog.info('待审核记录加载成功:', {
          count: apiRecords.length,
          page: pagination.page,
          total: pagination.total
        })

        const formattedRecords = apiRecords.map((recordItem: any) => ({
          ...recordItem,
          created_at_formatted: this.formatBeijingTime(recordItem.created_at),
          user_mobile_display: formatPhoneNumber(recordItem.user_mobile),
          selected: false
        }))

        if (!append && formattedRecords.length === 0 && pagination.total > 0 && targetPage !== 1) {
          this.setData({ loading: false, loadingMore: false })
          this.loadPendingRecords(1)
          return
        }

        const mergedRecords = append
          ? [...this.data.records, ...formattedRecords]
          : formattedRecords
        const noMore = pagination.page >= pagination.total_pages

        this.setData({
          records: mergedRecords,
          page: pagination.page,
          total: pagination.total,
          total_pages: pagination.total_pages,
          selectedCount: 0,
          allSelected: false,
          noMore,
          auditTabs: buildAuditTabs(pagination.total, this.data.pendingTotal)
        })
      } else {
        throw new Error(apiResult?.message || '加载失败')
      }
    } catch (loadError: any) {
      auditLog.error('加载待审核记录失败:', loadError)
      showToast(loadError.message || '加载失败')
    } finally {
      this.setData({ loading: false, loadingMore: false })
    }
  },

  loadMorePendingRecords() {
    if (this.data.loading || this.data.loadingMore || this.data.noMore) {
      return
    }

    this.loadPendingRecords(this.data.page + 1, true)
  },

  // ==================== 消费审核批量选择 ====================

  toggleSelect(e: any) {
    const recordIndex = e.currentTarget.dataset.index
    const currentChecked = this.data.records[recordIndex].selected

    this.setData({
      [`records[${recordIndex}].selected`]: !currentChecked
    })

    this.refreshSelectedCount()
  },

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

  refreshSelectedCount() {
    const localSelectedCount = this.data.records.filter((r: any) => r.selected).length
    const localAllSelected =
      localSelectedCount === this.data.records.length && localSelectedCount > 0

    this.setData({
      selectedCount: localSelectedCount,
      allSelected: localAllSelected
    })
  },

  // ==================== 消费审核批量通过 ====================

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
      auditLog.error('批量审核通过失败:', batchError)
      showToast(batchError.message || '批量审核失败')
    }

    setTimeout(() => {
      this.loadPendingRecords(this.data.page)
    }, 1500)
  },

  // ==================== 消费审核批量拒绝 ====================

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
      auditLog.error('批量拒绝失败:', batchError)
      showToast(batchError.message || '批量拒绝失败')
    }

    setTimeout(() => {
      this.loadPendingRecords(this.data.page)
    }, 1500)
  },

  // ==================== 消费审核单条操作 ====================

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
      auditLog.error('时间格式化失败:', formatError, '原始值:', dateTimeValue)
      return typeof dateTimeValue === 'string' ? dateTimeValue : '时间未知'
    }
  },

  onApprove(e: any) {
    const approveTargetRecord =
      e.currentTarget?.dataset?.record || e.detail?.currentTarget?.dataset?.record

    auditLog.info('点击审核通过，记录:', approveTargetRecord)

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

  async handleApprove(approveRecord: any) {
    this.setData({ submitting: true })

    try {
      auditLog.info('开始审核通过，记录ID:', approveRecord.record_id)

      const approvalResult = await API.approveConsumption(approveRecord.record_id, {
        admin_notes: '核实无误，审核通过'
      })

      auditLog.info('审核通过成功:', approvalResult)
      showToast(approvalResult.message || '审核通过', 'success')

      setTimeout(() => {
        this.loadPendingRecords(this.data.page)
      }, 1500)
    } catch (approveError: any) {
      auditLog.error('审核通过失败:', approveError)
      showToast(approveError.message || '审核失败')
    } finally {
      this.setData({ submitting: false })
    }
  },

  onReject(e: any) {
    const rejectTargetRecord =
      e.currentTarget?.dataset?.record || e.detail?.currentTarget?.dataset?.record
    auditLog.info('点击审核拒绝，记录:', rejectTargetRecord)

    this.setData({
      selectedRecord: rejectTargetRecord,
      showRejectModal: true,
      rejectReason: '',
      batchRejectMode: false
    })
  },

  onRejectReasonInput(e: any) {
    this.setData({ rejectReason: e.detail?.value || '' })
  },

  async confirmReject() {
    if (!this.data.rejectReason || this.data.rejectReason.trim().length < 5) {
      showToast('拒绝原因至少5个字符')
      return
    }

    const trimmedReason = this.data.rejectReason.trim()

    if (this.data.batchRejectMode) {
      const batchSelectedRecords = this.data.records.filter((r: any) => r.selected)
      await this.executeBatchReject(batchSelectedRecords, trimmedReason)
      return
    }

    this.setData({ submitting: true })

    try {
      auditLog.info('开始审核拒绝，记录ID:', this.data.selectedRecord.record_id)

      const rejectionResult = await API.rejectConsumption(this.data.selectedRecord.record_id, {
        admin_notes: trimmedReason
      })

      auditLog.info('审核拒绝成功:', rejectionResult)

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
      auditLog.error('审核拒绝失败:', rejectError)
      showToast(rejectError.message || '拒绝失败')
    } finally {
      this.setData({ submitting: false })
    }
  },

  // ==================== 审核链：我的待办 ====================

  /**
   * 加载当前用户的待审核步骤
   * 调用后端API: GET /api/v4/console/approval-chain/my-pending
   */
  async loadMyPendingSteps(targetPage: number = 1, append: boolean = false) {
    if (this.data.pendingLoading || this.data.pendingLoadingMore) {
      return
    }

    this.setData({
      pendingLoading: !append,
      pendingLoadingMore: append
    })

    try {
      auditLog.info('加载我的待办步骤，页码:', targetPage)

      const apiResult = await API.getMyPendingApprovalSteps({
        page: targetPage,
        page_size: this.data.pendingPageSize
      })

      if (apiResult?.success && apiResult.data) {
        const stepsData = apiResult.data.steps || apiResult.data.records || apiResult.data || []
        const pagination = apiResult.data.pagination || {
          page: targetPage,
          total: stepsData.length,
          total_pages: 1
        }

        auditLog.info('待办步骤加载成功:', {
          count: stepsData.length,
          page: pagination.page,
          total: pagination.total
        })

        const formattedSteps = stepsData.map((stepItem: any) => {
          /**
           * 业务快照预计算: WXML不支持 (a||b).field 链式访问，
           * 在TS层合并 step.business_snapshot 和 instance.business_snapshot
           */
          const mergedSnapshot =
            stepItem.business_snapshot ||
            (stepItem.instance && stepItem.instance.business_snapshot) ||
            {}

          return {
            ...stepItem,
            created_at_formatted: this.formatBeijingTime(stepItem.created_at),
            timeout_at_formatted: this.formatBeijingTime(stepItem.timeout_at),
            auditable_type_text:
              AUDITABLE_TYPE_MAP[stepItem.auditable_type] || stepItem.auditable_type || '未知类型',
            status_text: STEP_STATUS_MAP[stepItem.status] || stepItem.status || '未知',
            chain_status_text: stepItem.instance
              ? CHAIN_STATUS_MAP[stepItem.instance.status] || stepItem.instance.status
              : '',
            step_progress: stepItem.instance
              ? `第${stepItem.step_number || stepItem.instance?.current_step || '?'}步 / 共${stepItem.instance?.total_steps || '?'}步`
              : '',
            is_final_text: stepItem.is_final ? '终审' : '初审',
            snapshot_consumption_amount: mergedSnapshot.consumption_amount || null,
            snapshot_points_to_award: mergedSnapshot.points_to_award || null,
            has_snapshot: !!(mergedSnapshot.consumption_amount || mergedSnapshot.points_to_award)
          }
        })

        const mergedPendingSteps = append
          ? [...this.data.pendingSteps, ...formattedSteps]
          : formattedSteps
        const pendingNoMore = pagination.page >= pagination.total_pages

        this.setData({
          pendingSteps: mergedPendingSteps,
          pendingPage: pagination.page,
          pendingTotal: pagination.total,
          pendingTotalPages: pagination.total_pages,
          pendingNoMore,
          auditTabs: buildAuditTabs(this.data.total, pagination.total)
        })
      } else {
        throw new Error(apiResult?.message || '加载失败')
      }
    } catch (loadError: any) {
      auditLog.error('加载待办步骤失败:', loadError)
      showToast(loadError.message || '加载待办失败')
    } finally {
      this.setData({ pendingLoading: false, pendingLoadingMore: false })
    }
  },

  loadMoreMyPendingSteps() {
    if (this.data.pendingLoading || this.data.pendingLoadingMore || this.data.pendingNoMore) {
      return
    }

    this.loadMyPendingSteps(this.data.pendingPage + 1, true)
  },

  // ==================== 审核链步骤操作 ====================

  /**
   * 审核链步骤 — 通过
   * 调用后端API: POST /api/v4/console/approval-chain/steps/:step_id/approve
   */
  onChainApprove(e: any) {
    const approveStep = e.currentTarget?.dataset?.step || e.detail?.currentTarget?.dataset?.step

    auditLog.info('审核链步骤通过，步骤:', approveStep)

    const stepDetail = approveStep.instance
      ? `\n业务类型：${AUDITABLE_TYPE_MAP[approveStep.auditable_type] || approveStep.auditable_type}`
      : ''

    const finalWarning = approveStep.is_final
      ? '\n\n此步骤为终审，通过后业务将生效（如积分自动发放），此操作不可撤销。'
      : '\n\n通过后将推进到下一步审核人。'

    wx.showModal({
      title: approveStep.is_final ? '确认终审通过' : '确认审核通过',
      content: `审核步骤：${approveStep.is_final_text}${stepDetail}${finalWarning}`,
      success: async (confirmResult: any) => {
        if (confirmResult.confirm) {
          await this.executeChainApprove(approveStep)
        }
      }
    })
  },

  async executeChainApprove(approveStep: any) {
    this.setData({ chainSubmitting: true })

    try {
      auditLog.info('执行审核链步骤通过，step_id:', approveStep.step_id)

      const approvalResult = await API.approveApprovalStep(approveStep.step_id, {
        reason: '核实无误，审核通过'
      })

      auditLog.info('审核链步骤通过成功:', approvalResult)
      showToast(approvalResult.message || '审核通过', 'success')

      /* 同步刷新全局待办角标（user.ts 等页面通过 MobX 绑定自动更新） */
      auditStore.refreshPendingCount(true)

      setTimeout(() => {
        this.loadMyPendingSteps(this.data.pendingPage)
      }, 1500)
    } catch (chainApproveError: any) {
      auditLog.error('审核链步骤通过失败:', chainApproveError)
      showToast(chainApproveError.message || '审核通过失败')
    } finally {
      this.setData({ chainSubmitting: false })
    }
  },

  /**
   * 审核链步骤 — 拒绝（打开拒绝原因弹窗）
   */
  onChainReject(e: any) {
    const rejectStep = e.currentTarget?.dataset?.step || e.detail?.currentTarget?.dataset?.step
    auditLog.info('审核链步骤拒绝，步骤:', rejectStep)

    this.setData({
      selectedStep: rejectStep,
      showChainRejectModal: true,
      chainRejectReason: ''
    })
  },

  onChainRejectReasonInput(e: any) {
    this.setData({ chainRejectReason: e.detail?.value || '' })
  },

  /**
   * 确认审核链步骤拒绝
   * 调用后端API: POST /api/v4/console/approval-chain/steps/:step_id/reject
   */
  async confirmChainReject() {
    if (!this.data.chainRejectReason || this.data.chainRejectReason.trim().length < 5) {
      showToast('拒绝原因至少5个字符')
      return
    }

    const trimmedReason = this.data.chainRejectReason.trim()
    this.setData({ chainSubmitting: true })

    try {
      auditLog.info('执行审核链步骤拒绝，step_id:', this.data.selectedStep.step_id)

      const rejectionResult = await API.rejectApprovalStep(this.data.selectedStep.step_id, {
        reason: trimmedReason
      })

      auditLog.info('审核链步骤拒绝成功:', rejectionResult)

      this.setData({
        showChainRejectModal: false,
        selectedStep: null,
        chainRejectReason: ''
      })

      showToast(rejectionResult.message || '已拒绝', 'success')

      /* 同步刷新全局待办角标 */
      auditStore.refreshPendingCount(true)

      setTimeout(() => {
        this.loadMyPendingSteps(this.data.pendingPage)
      }, 1500)
    } catch (chainRejectError: any) {
      auditLog.error('审核链步骤拒绝失败:', chainRejectError)
      showToast(chainRejectError.message || '拒绝失败')
    } finally {
      this.setData({ chainSubmitting: false })
    }
  },

  cancelChainReject() {
    this.setData({
      showChainRejectModal: false,
      selectedStep: null,
      chainRejectReason: ''
    })
  },

  // ==================== 审核链详情 ====================

  /**
   * 查看审核链实例详情（时间线）
   * 调用后端API: GET /api/v4/console/approval-chain/instances/:id
   */
  async onViewChainDetail(e: any) {
    const instanceId =
      e.currentTarget?.dataset?.instanceId || e.detail?.currentTarget?.dataset?.instanceId
    if (!instanceId) {
      return
    }

    auditLog.info('查看审核链详情，instance_id:', instanceId)

    try {
      const detailResult = await API.getApprovalChainInstanceDetail(instanceId)

      if (detailResult?.success && detailResult.data) {
        const detailData = detailResult.data

        const formattedDetail = {
          ...detailData,
          submitted_at_formatted: this.formatBeijingTime(detailData.submitted_at),
          completed_at_formatted: detailData.completed_at
            ? this.formatBeijingTime(detailData.completed_at)
            : null,
          status_text: CHAIN_STATUS_MAP[detailData.status] || detailData.status,
          auditable_type_text:
            AUDITABLE_TYPE_MAP[detailData.auditable_type] || detailData.auditable_type,
          steps: (detailData.steps || []).map((stepItem: any) => ({
            ...stepItem,
            status_text: STEP_STATUS_MAP[stepItem.status] || stepItem.status,
            actioned_at_formatted: stepItem.actioned_at
              ? this.formatBeijingTime(stepItem.actioned_at)
              : null,
            timeout_at_formatted: stepItem.timeout_at
              ? this.formatBeijingTime(stepItem.timeout_at)
              : null
          }))
        }

        this.setData({
          chainDetail: formattedDetail,
          showChainDetailModal: true
        })
      }
    } catch (detailError: any) {
      auditLog.error('加载审核链详情失败:', detailError)
      showToast(detailError.message || '加载详情失败')
    }
  },

  closeChainDetailModal() {
    this.setData({
      showChainDetailModal: false,
      chainDetail: null
    })
  },

  // ==================== 弹窗控制 ====================

  stopPropagation() {},

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
    auditLog.info('审核管理页面显示')

    const app = getApp() as any

    const tokenStatus = Utils.checkTokenValidity()
    if (!tokenStatus.isValid) {
      auditLog.warn('Token无效，跳过WebSocket订阅', tokenStatus)
      return
    }

    app
      .connectWebSocket()
      .then(() => {
        app.subscribeWebSocketMessages(this._pageId, this.handleWebSocketEvent.bind(this))
      })
      .catch((_wsErr: any) => {
        auditLog.warn('WebSocket连接失败，仅依赖手动刷新')
        app.subscribeWebSocketMessages(this._pageId, this.handleWebSocketEvent.bind(this))
      })
  },

  onHide() {
    const app = getApp() as any
    app.unsubscribeWebSocketMessages(this._pageId)
  },

  onPullDownRefresh() {
    auditLog.info('下拉刷新，当前标签页:', this.data.activeTab)

    if (this.data.activeTab === 'consumption') {
      this.loadPendingRecords(1).finally(() => {
        wx.stopPullDownRefresh()
      })
    } else {
      this.loadMyPendingSteps(1).finally(() => {
        wx.stopPullDownRefresh()
      })
    }
  },

  onReachBottom() {
    auditLog.info('触底加载，当前标签页:', this.data.activeTab)

    if (this.data.activeTab === 'consumption') {
      this.loadMorePendingRecords()
    } else {
      this.loadMoreMyPendingSteps()
    }
  },

  onUnload() {
    auditLog.info('审核管理页面卸载')

    const app = getApp() as any
    app.unsubscribeWebSocketMessages(this._pageId)

    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  // ==================== WebSocket 实时推送处理 ====================

  /**
   * WebSocket 事件处理 — 收到审核链相关事件时自动刷新当前标签页数据
   *
   * 监听事件:
   *   - approval_timeout_escalation: 超时升级，待办列表可能有新步骤
   *   - approval_final_timeout_reminder: 终审超时提醒
   *   - approval_step_assigned: 新步骤分配给当前用户
   *   - new_notification: 通用通知（审核链类型时刷新）
   */
  handleWebSocketEvent(eventName: string, _eventData: any): void {
    const approvalEvents = [
      'approval_timeout_escalation',
      'approval_final_timeout_reminder',
      'approval_step_assigned'
    ]

    if (approvalEvents.includes(eventName)) {
      auditLog.info('收到审核链实时推送，刷新当前视图:', eventName)
      this.refreshCurrentTab()
      return
    }

    if (eventName === 'new_notification' && _eventData) {
      const notificationType = _eventData.type || ''
      if (notificationType.startsWith('approval_')) {
        auditLog.info('收到审核链通知推送，刷新当前视图:', notificationType)
        this.refreshCurrentTab()
      }
    }
  },

  /** 刷新当前激活标签页的数据 */
  refreshCurrentTab() {
    if (this.data.activeTab === 'consumption') {
      this.loadPendingRecords(1)
    } else if (this.data.activeTab === 'myPending') {
      this.loadMyPendingSteps(1)
    }
  }
})
