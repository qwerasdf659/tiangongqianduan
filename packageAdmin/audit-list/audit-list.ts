/**
 * 审核管理页面（审核链单一路径版）+ MobX响应式状态
 *
 * 单一视图：面向「我的待办步骤」——审核链分配给当前登录人的待审核步骤。
 * 消费审核完全收口到审核链：审批 = 操作审核链步骤（step），终审通过自动发积分。
 *
 * 权限：role_level>=20（店员及以上）可访问，对齐后端审核链门槛 lv60→lv20；
 *   具体能否审某一步由后端 ApprovalChainService.processStep() 按节点角色 + 门店/区域隔离精确鉴权。
 *
 * 接口（不做字段映射，直接用后端字段名）：
 *   列表  GET  /api/v4/console/approval-chain/my-pending
 *   通过  POST /api/v4/console/approval-chain/steps/:id/approve
 *   拒绝  POST /api/v4/console/approval-chain/steps/:id/reject
 *   批量  POST /api/v4/console/approval-chain/steps/batch
 *   详情  GET  /api/v4/console/approval-chain/instances/:id
 *
 * @file packageAdmin/audit-list/audit-list.ts
 * @version 7.0.0
 * @since 2026-06-12
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const auditLog = Logger.createLogger('audit-list')
const { checkAuth } = Utils
const { showToast } = Wechat

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
    // ===== textarea autosize 配置（WXML 不支持对象字面量） =====
    autosizeSmall: { minRows: 4, maxRows: 6 },
    autosizeLarge: { minRows: 4, maxRows: 8 },

    // ===== 顶部汇总条（GET /shop/consumption/merchant/stats，§12.5 B 简洁看板） =====
    /** 汇总数据已就绪标志（加载成功后展示，失败/无数据则不显示，不静默造假） */
    summaryReady: false,
    /** 未审核数（by_status.pending.count，范围内待审消费记录） */
    summaryPendingCount: 0,
    /** 已审核数（by_status.approved.count，范围内已通过消费记录） */
    summaryApprovedCount: 0,
    /** 审核总数（total.count，范围内全部消费记录 = 待审+已审结，口径见文档 8.6.4） */
    summaryTotalCount: 0,
    /** 已超时待审数（timeout.overdue，超时预警高亮用） */
    summaryOverdueCount: 0,
    /** 临近超时数（timeout.near_due，2小时内将超时） */
    summaryNearDueCount: 0,

    // ===== 本店核销概况卡（GET /shop/redemption/store-stats，门店专属券业务线） =====
    /**
     * 核销概况已就绪标志（加载成功后展示该卡）。
     * 加载失败 / 无门店 / 无权限（staff 未授权 403）时保持 false → 静默不显示该卡，
     * 不报错、不留白、不造假数字（符合文档 §5.3 / §11.2 静默降级要求）。
     */
    redemptionStatsReady: false,
    /** 本店待核销数（门店专属券，pending_count，后端按门店隔离直读） */
    redemptionPendingCount: 0,
    /** 本店已核销数（fulfilled_count，后端按 fulfilled_store_id 聚合直读） */
    redemptionFulfilledCount: 0,
    /**
     * 当前用户在本店是否为店长（role_in_store==='manager'）。
     * 仅店长显示"员工核销权限"管理入口（店员即使被授权查看概况，也无权管理他人权限）。
     */
    canManageStaffPerm: false,
    /** 员工权限管理页所需的门店ID（取核销概况当前选中门店） */
    redemptionStoreId: null as number | null,
    /**
     * 核销概况门店列表（GET /shop/my-stores 返回，含 role_in_store）。
     * 多门店店长可在卡片上切换门店查看各店核销概况，与授权页口径一致（文档 §11.2 门店隔离）。
     */
    redemptionStoreList: [] as any[],
    /** 当前选中门店在 redemptionStoreList 中的索引（picker 用） */
    redemptionStoreIndex: 0,
    /** 当前选中门店名称（卡片切换器展示用） */
    redemptionStoreName: '',
    /** 是否多门店（决定核销概况卡是否显示门店切换器） */
    redemptionIsMultiStore: false,
    /** 核销概况数字加载中标志（切店时显示，避免展示上一门店的旧数字） */
    redemptionStatsLoading: false,

    // ===== 审核链待办（唯一数据源：my-pending） =====
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

    // ===== 批量审核（基于审核链步骤 steps/batch） =====
    /** 已选步骤数量 */
    selectedCount: 0,
    /** 是否全选 */
    allSelected: false,
    /** 批量拒绝模式（拒绝弹窗共用，区分单条/批量） */
    batchRejectMode: false,
    /** 批量进度弹窗 */
    showBatchProgress: false,
    batchProgressText: '',
    batchProgressDetail: '',

    // ===== 审核链详情弹窗 =====
    showChainDetailModal: false,
    chainDetail: null as any,

    // ===== 权限相关 =====
    /** 当前用户角色等级 */
    currentRoleLevel: 0,
    /**
     * 是否可批量审核（role_level>=20，与后端 steps/batch 准入一致）
     * 后端批量逐条 processStep 精确鉴权，仅推进"轮到本人的步骤"，
     * 故店员(20)及以上均可使用批量，由后端按门店/区域隔离决定能审哪些。
     */
    canBatchReview: false
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
     * 权限准入线: role_level >= 20 (店员及以上)
     * 与后端路由 requireRoleLevel(20) 对齐（审核链升级：lv60→lv20）
     * 具体审核权限由 ApprovalChainService.processStep() 按节点角色 + 门店/区域隔离精校
     */
    if (localRoleLevel < 20) {
      auditLog.error('用户无审核权限，role_level:', localRoleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅店员及以上角色可查看和审核消费记录。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    this.setData({
      currentRoleLevel: localRoleLevel,
      /* 批量审核门槛与后端 steps/batch 一致（>=20）；能进本页即 >=20，故批量对所有审核人开放 */
      canBatchReview: localRoleLevel >= 20
    })

    /* 单一审核链视图：所有有权限的审核人都加载"我的待办步骤" */
    this.loadMyPendingSteps(1)

    /* 顶部汇总条：加载范围内消费审核统计（未审/已审/总数 + 超时预警） */
    this.loadMerchantSummary()

    /* 本店核销概况卡：加载门店专属兑换券核销数据（无门店/无权限静默降级） */
    this.loadRedemptionStats()
  },

  // ==================== 时间格式化（审核链卡片复用） ====================

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

  // ==================== 顶部汇总条 ====================

  /**
   * 加载范围内消费审核统计（顶部汇总条）
   * 调用后端API: GET /api/v4/shop/consumption/merchant/stats
   *
   * 数据按"当前登录人范围"由后端隔离（店员=自己/店长=本店/区域=管辖门店），
   * 前端只展示后端返回的汇总数字，不在前端做任何业务计算或范围过滤。
   * 加载失败静默处理（汇总条不显示），不影响主审核列表使用。
   */
  async loadMerchantSummary() {
    try {
      const statsResult = await API.getMerchantConsumptionStats()
      if (!statsResult?.success || !statsResult.data) {
        return
      }
      const statsData = statsResult.data
      const byStatus = statsData.by_status || {}
      const timeout = statsData.timeout || {}

      this.setData({
        summaryReady: true,
        summaryPendingCount: (byStatus.pending && byStatus.pending.count) || 0,
        summaryApprovedCount: (byStatus.approved && byStatus.approved.count) || 0,
        summaryTotalCount: (statsData.total && statsData.total.count) || 0,
        summaryOverdueCount: timeout.overdue || 0,
        summaryNearDueCount: timeout.near_due || 0
      })
    } catch (summaryError: any) {
      auditLog.warn('加载消费审核汇总失败（不影响审核列表）:', summaryError.message)
    }
  },

  /**
   * 加载本店核销概况卡（门店专属兑换券业务线）
   * 调用后端API: GET /api/v4/shop/redemption/store-stats?store_id=:id
   *
   * 流程：先取"我的门店"（GET /shop/my-stores）确定 store_id，再查该门店核销概况。
   *   - 多门店场景取首个在职门店（看板为概览性质，与汇总条同口径；后续如需切店可扩展选择器）
   *   - 后端按登录身份隔离：manager 放行；staff 未授权返回 403 REDEMPTION_STATS_FORBIDDEN
   *
   * 静默降级（符合文档 §5.3 / §11.2）：无门店 / 无权限 / 加载失败时不显示该卡，
   *   不报错、不留白、不造假数字；不影响主审核列表与汇总条使用。
   */
  async loadRedemptionStats() {
    try {
      /* 第一步：取"我的门店"列表（与消费录入页同一数据源 /shop/my-stores） */
      const storesResult = await API.getMyStores()
      const myStores =
        (storesResult && storesResult.success && storesResult.data && storesResult.data.stores) ||
        []
      if (!myStores.length) {
        /**
         * 无在职门店：核销概况卡不显示。但平台管理员（role_level>=100）有跨店管理特权，
         * 即使未挂门店也应能进入员工权限管理页，故单独放行入口（授权页内部再取门店）。
         */
        if (this.data.currentRoleLevel >= 100) {
          this.setData({ canManageStaffPerm: true })
        }
        return
      }

      /* 记录门店列表 + 是否多门店；默认选中首个门店（多门店店长可在卡片上切店） */
      this.setData({
        redemptionStoreList: myStores,
        redemptionIsMultiStore: myStores.length > 1,
        redemptionStoreIndex: 0
      })

      /**
       * 员工权限管理入口可见性：与核销概况卡解耦，取到门店即判定。
       * 条件：当前用户是某门店店长（role_in_store==='manager'）或平台管理员（role_level>=100，
       *   跨店管理特权）。这样即使本店暂无核销数据（store-stats 无数据/失败导致概况卡不显示），
       *   店长/管理员仍能进入授权页管理店员权限。实际授权动作仍由后端按 manager 身份精校。
       */
      const hasManagerStore = myStores.some((s: any) => s.role_in_store === 'manager')
      const isAdminLevel = this.data.currentRoleLevel >= 100
      this.setData({
        canManageStaffPerm: hasManagerStore || isAdminLevel,
        redemptionStoreId: myStores[0].store_id
      })

      /* 第二步：按默认门店（索引0）加载核销概况 */
      await this.loadRedemptionStatsByIndex(0)
    } catch (redemptionError: any) {
      /**
       * 静默降级：无门店、网络异常等一律不显示该卡，仅记录日志，
       * 不影响审核列表与汇总条。但管理员（role_level>=100）仍放行权限管理入口。
       */
      if (this.data.currentRoleLevel >= 100) {
        this.setData({ canManageStaffPerm: true })
      }
      auditLog.warn(
        '加载本店核销概况门店列表失败（静默降级，不影响审核列表）:',
        redemptionError?.code || '',
        redemptionError?.message || ''
      )
    }
  },

  /**
   * 按门店列表索引加载该门店核销概况（支持多门店店长切店查看）
   * 调用后端API: GET /api/v4/shop/redemption/store-stats?store_id=:id
   *
   * 与授权页 staff-redemption-perm 的多门店切换口径一致：每个门店独立查询、独立隔离。
   * staff 未授权某店返回 403 REDEMPTION_STATS_FORBIDDEN 时静默降级（该卡不显示/不更新）。
   *
   * @param targetIndex redemptionStoreList 中的门店索引
   */
  async loadRedemptionStatsByIndex(targetIndex: number) {
    const targetStore = this.data.redemptionStoreList[targetIndex]
    if (!targetStore || !targetStore.store_id) {
      return
    }

    this.setData({ redemptionStatsLoading: true })
    try {
      const statsResult = await API.getStoreRedemptionStats(targetStore.store_id)
      if (!statsResult?.success || !statsResult.data) {
        this.setData({ redemptionStatsLoading: false })
        return
      }
      const redemptionData = statsResult.data

      this.setData({
        redemptionStatsReady: true,
        redemptionStatsLoading: false,
        redemptionStoreIndex: targetIndex,
        redemptionStoreId: targetStore.store_id,
        redemptionStoreName: targetStore.store_name || '',
        redemptionPendingCount: redemptionData.pending_count || 0,
        redemptionFulfilledCount: redemptionData.fulfilled_count || 0,
        /* 入口可见性：当前门店店长 或 平台管理员（与 loadRedemptionStats 同口径，切店时同步更新） */
        canManageStaffPerm:
          targetStore.role_in_store === 'manager' || this.data.currentRoleLevel >= 100
      })
    } catch (statsError: any) {
      /**
       * 静默降级：staff 未授权该店（403 REDEMPTION_STATS_FORBIDDEN）、网络异常等。
       * 首次加载失败则不显示该卡；切店失败则保留上一门店数据并提示。
       */
      this.setData({ redemptionStatsLoading: false })
      auditLog.warn(
        '加载该门店核销概况失败（静默降级）:',
        statsError?.code || '',
        statsError?.message || ''
      )
      if (this.data.redemptionStatsReady) {
        /* 已展示过（切店场景）：明确提示该店无权限/加载失败，不静默吞掉用户操作 */
        showToast(statsError?.message || '该门店核销概况加载失败')
      }
    }
  },

  /**
   * 核销概况卡门店切换（多门店店长）
   * picker 绑定 bindchange，value 为门店在 redemptionStoreList 中的索引
   */
  onRedemptionStoreChange(e: any) {
    const selectedIndex = Number(e.detail.value)
    if (selectedIndex === this.data.redemptionStoreIndex) {
      return
    }
    this.loadRedemptionStatsByIndex(selectedIndex)
  },

  /**
   * 跳转到员工核销权限管理页（仅店长可见入口）
   * 店长在此管理本店店员能否查看"本店核销概况"。
   */
  goStaffRedemptionPerm() {
    auditLog.info('跳转员工核销权限管理页')
    wx.navigateTo({
      url: '/packageAdmin/staff-redemption-perm/staff-redemption-perm'
    })
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
        /**
         * 后端契约（文档 6.1）：data 直接是步骤数组，pagination 是与 data 平级的顶层字段。
         * 优先读顶层 apiResult.pagination；兼容极少数包装差异时回退。
         */
        const stepsData = Array.isArray(apiResult.data)
          ? apiResult.data
          : apiResult.data.steps || apiResult.data.records || []
        const pagination = apiResult.pagination ||
          apiResult.data.pagination || {
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

          /**
           * 业务类型/记录ID 以 instance 为准（文档 6.1：auditable_type/auditable_id 在 instance 内），
           * 兼容后端可能在 step 顶层也带一份的情况。
           */
          const auditableType =
            (stepItem.instance && stepItem.instance.auditable_type) || stepItem.auditable_type || ''
          const auditableId =
            (stepItem.instance && stepItem.instance.auditable_id) || stepItem.auditable_id || null

          /**
           * 业务类型中文：直读后端字典下发的 auditable_type_display（如「交易纠纷」），
           * 后端已统一中文化（system_dictionaries），前端零映射、不硬编码翻译表。
           * 后端缺该字段时回退原始英文码，明确暴露后端未下发，不静默造假中文。
           */
          const auditableTypeDisplay =
            (stepItem.instance && stepItem.instance.auditable_type_display) ||
            stepItem.auditable_type_display ||
            auditableType ||
            '未知类型'

          /**
           * 进度条数据预计算（避免 WXML 内联除法在 total_steps 缺失/为0时算出 NaN）：
           *   优先读后端已下发的零歧义进度字段 progress_current_step / progress_total_steps
           *   （数据源 = 已修正的 instance.current_step，1-based 真实序位），
           *   缺失时回退 instance.current_step / total_steps。
           *   ⚠️ 禁止使用 step_number（节点稀疏排序号，非进度序位，会算出"第9步"）。
           */
          const curStep =
            Number(stepItem.progress_current_step) ||
            Number(stepItem.instance && stepItem.instance.current_step) ||
            0
          const totalStep =
            Number(stepItem.progress_total_steps) ||
            Number(stepItem.instance && stepItem.instance.total_steps) ||
            0
          const hasProgress = curStep > 0 && totalStep > 0
          const progressPercent = hasProgress
            ? Math.min(100, Math.round((curStep / totalStep) * 100))
            : 0

          return {
            ...stepItem,
            /** 批量选择态（role_level>=20 可用） */
            selected: false,
            /** 归一后的业务类型/记录ID（供卡片与详情查询复用） */
            auditable_type: auditableType,
            auditable_id: auditableId,
            created_at_formatted: this.formatBeijingTime(stepItem.created_at),
            timeout_at_formatted: this.formatBeijingTime(stepItem.timeout_at),
            auditable_type_text: auditableTypeDisplay,
            status_text: STEP_STATUS_MAP[stepItem.status] || stepItem.status || '未知',
            chain_status_text: stepItem.instance
              ? CHAIN_STATUS_MAP[stepItem.instance.status] || stepItem.instance.status
              : '',
            /**
             * 审核链进度文案：优先直读后端零歧义字段 progress_text（如"第2步/共2步"，零拼接），
             * 缺失时用已修正的 curStep/totalStep 回退拼接。
             * ⚠️ 禁止用 step_number（稀疏序号），否则会显示"第9步/共2步"。
             */
            step_progress:
              stepItem.progress_text || (hasProgress ? `第${curStep}步 / 共${totalStep}步` : ''),
            /** 进度条预计算字段（WXML 只读，杜绝 NaN） */
            has_progress: hasProgress,
            progress_percent: progressPercent,
            progress_current: curStep,
            progress_total: totalStep,
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
          selectedCount: 0,
          allSelected: false
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
      ? `\n业务类型：${approveStep.auditable_type_text || approveStep.auditable_type}`
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

      /**
       * 按后端返回的链状态区分提示（契约 12.5 A）：
       *   countersign_pending=true → 会签未凑够人数，提示"会签 M/N 已通过"，步骤仍在本人/同角色待办
       *   is_chain_completed=false → 推进到下一步审核人
       *   is_chain_completed=true && final_result='approved' → 终审通过，积分已自动发放
       */
      const resultData = approvalResult.data || {}
      let successMsg = approvalResult.message || '审核通过'
      if (resultData.countersign_pending === true) {
        const approvedCount = resultData.approved_count || 0
        const requiredApprovals = resultData.required_approvals || 0
        successMsg = `会签进度 ${approvedCount}/${requiredApprovals}，已记录你的通过`
      } else if (resultData.is_chain_completed && resultData.final_result === 'approved') {
        successMsg = '终审通过，积分已自动发放'
      } else if (resultData.is_chain_completed === false) {
        successMsg = '已通过，进入下一步审核'
      }
      showToast(successMsg, 'success')

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

    /* 批量拒绝模式：走 steps/batch */
    if (this.data.batchRejectMode) {
      const checkedSteps = this.data.pendingSteps.filter((s: any) => s.selected)
      await this.executeBatchReject(checkedSteps, trimmedReason)
      return
    }

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
      chainRejectReason: '',
      batchRejectMode: false
    })
  },

  // ==================== 审核链批量选择 ====================

  /** 切换单个步骤选中态 */
  toggleStepSelect(e: any) {
    const stepIndex = e.currentTarget.dataset.index
    const currentChecked = this.data.pendingSteps[stepIndex].selected

    this.setData({
      [`pendingSteps[${stepIndex}].selected`]: !currentChecked
    })

    this.refreshStepSelectedCount()
  },

  /** 全选 / 取消全选 */
  toggleSelectAllSteps() {
    const newAllSelected = !this.data.allSelected
    const toggledSteps = this.data.pendingSteps.map((stepItem: any) => ({
      ...stepItem,
      selected: newAllSelected
    }))

    this.setData({
      pendingSteps: toggledSteps,
      allSelected: newAllSelected,
      selectedCount: newAllSelected ? toggledSteps.length : 0
    })
  },

  /** 重算选中数量 */
  refreshStepSelectedCount() {
    const localSelectedCount = this.data.pendingSteps.filter((s: any) => s.selected).length
    const localAllSelected =
      localSelectedCount === this.data.pendingSteps.length && localSelectedCount > 0

    this.setData({
      selectedCount: localSelectedCount,
      allSelected: localAllSelected
    })
  },

  // ==================== 审核链批量通过 ====================

  onBatchApprove() {
    const checkedSteps = this.data.pendingSteps.filter((s: any) => s.selected)
    if (checkedSteps.length === 0) {
      showToast('请先选择要审核的步骤')
      return
    }

    wx.showModal({
      title: '确认批量通过',
      content: `确定批量通过 ${checkedSteps.length} 个审核步骤？\n仅推进当前轮到你的步骤，终审步骤通过后将自动发放积分，此操作不可撤销。`,
      success: (confirmResult: any) => {
        if (confirmResult.confirm) {
          this.executeBatchApprove(checkedSteps)
        }
      }
    })
  },

  async executeBatchApprove(batchSteps: any[]) {
    this.setData({
      showBatchProgress: true,
      batchProgressText: '批量审核通过中...',
      batchProgressDetail: `正在处理 ${batchSteps.length} 个步骤...`,
      chainSubmitting: true
    })

    try {
      const stepIds = batchSteps.map((s: any) => s.step_id)
      const batchResult = await API.batchApprovalSteps({
        step_ids: stepIds,
        action: 'approve'
      })

      this.setData({ showBatchProgress: false, chainSubmitting: false })
      this._handleBatchResult(batchResult, '通过')
    } catch (batchError: any) {
      this.setData({ showBatchProgress: false, chainSubmitting: false })
      auditLog.error('批量审核通过失败:', batchError)
      showToast(batchError.message || '批量审核失败')
    }

    auditStore.refreshPendingCount(true)
    setTimeout(() => {
      this.loadMyPendingSteps(1)
    }, 1500)
  },

  // ==================== 审核链批量拒绝 ====================

  onBatchReject() {
    const checkedSteps = this.data.pendingSteps.filter((s: any) => s.selected)
    if (checkedSteps.length === 0) {
      showToast('请先选择要拒绝的步骤')
      return
    }

    /* 复用审核链拒绝弹窗，标记为批量模式 */
    this.setData({
      batchRejectMode: true,
      showChainRejectModal: true,
      chainRejectReason: ''
    })
  },

  async executeBatchReject(batchSteps: any[], rejectReasonText: string) {
    this.setData({
      showChainRejectModal: false,
      showBatchProgress: true,
      batchProgressText: '批量拒绝中...',
      batchProgressDetail: `正在处理 ${batchSteps.length} 个步骤...`,
      chainSubmitting: true
    })

    try {
      const stepIds = batchSteps.map((s: any) => s.step_id)
      const batchResult = await API.batchApprovalSteps({
        step_ids: stepIds,
        action: 'reject',
        reason: rejectReasonText
      })

      this.setData({
        showBatchProgress: false,
        chainSubmitting: false,
        batchRejectMode: false,
        chainRejectReason: ''
      })
      this._handleBatchResult(batchResult, '拒绝')
    } catch (batchError: any) {
      this.setData({
        showBatchProgress: false,
        chainSubmitting: false,
        batchRejectMode: false,
        chainRejectReason: ''
      })
      auditLog.error('批量拒绝失败:', batchError)
      showToast(batchError.message || '批量拒绝失败')
    }

    auditStore.refreshPendingCount(true)
    setTimeout(() => {
      this.loadMyPendingSteps(1)
    }, 1500)
  },

  /** 统一处理批量审核响应（按 stats 汇总提示） */
  _handleBatchResult(batchResult: any, actionLabel: string) {
    if (batchResult?.success && batchResult.data) {
      const stats = batchResult.data.stats || {}
      const successCount = stats.success_count || 0
      const failCount = stats.failed_count || 0

      let resultMsg = `成功${actionLabel}${successCount}个`
      if (failCount > 0) {
        resultMsg += `，失败${failCount}个`
      }
      showToast(resultMsg, failCount === 0 ? 'success' : 'none')
    } else {
      showToast(batchResult?.message || `批量${actionLabel}失败`)
    }
  },

  // ==================== 审核链详情 ====================

  /**
   * 查看审核链实例详情（时间线）
   *
   * 取数优先级（文档 6.1/6.2）：
   *   1. 有 instance_id → GET /approval-chain/instances/:id（最直接）
   *   2. 仅有业务标识 → GET /approval-chain/instances/by-auditable?auditable_type=&auditable_id=
   *      （从某条消费记录反查其审核链，覆盖 my-pending 未带 instance_id 的兜底场景）
   */
  async onViewChainDetail(e: any) {
    const dataset = e.currentTarget?.dataset || e.detail?.currentTarget?.dataset || {}
    const instanceId = dataset.instanceId
    const auditableType = dataset.auditableType
    const auditableId = dataset.auditableId

    try {
      let detailResult: any = null

      if (instanceId) {
        auditLog.info('查看审核链详情（按 instance_id）:', instanceId)
        detailResult = await API.getApprovalChainInstanceDetail(instanceId)
      } else if (auditableType && auditableId) {
        auditLog.info('查看审核链详情（按业务记录 by-auditable）:', auditableType, auditableId)
        detailResult = await API.getInstanceByAuditable(auditableType, auditableId)
      } else {
        showToast('无法定位审核链实例')
        return
      }

      if (detailResult?.success && detailResult.data) {
        this.setData({
          chainDetail: this._formatChainDetail(detailResult.data),
          showChainDetailModal: true
        })
      } else {
        showToast(detailResult?.message || '该记录暂无审核链进度')
      }
    } catch (detailError: any) {
      auditLog.error('加载审核链详情失败:', detailError)
      showToast(detailError.message || '加载详情失败')
    }
  },

  /** 格式化审核链实例详情（instances/:id 与 by-auditable 返回结构一致，统一处理） */
  _formatChainDetail(detailData: any) {
    return {
      ...detailData,
      submitted_at_formatted: this.formatBeijingTime(detailData.submitted_at),
      completed_at_formatted: detailData.completed_at
        ? this.formatBeijingTime(detailData.completed_at)
        : null,
      status_text: CHAIN_STATUS_MAP[detailData.status] || detailData.status,
      /** 业务类型中文：直读后端字典下发的 auditable_type_display，前端零映射；缺失回退英文码 */
      auditable_type_text: detailData.auditable_type_display || detailData.auditable_type,
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
  },

  closeChainDetailModal() {
    this.setData({
      showChainDetailModal: false,
      chainDetail: null
    })
  },

  // ==================== 弹窗控制 ====================

  stopPropagation() {},

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
    auditLog.info('下拉刷新待办列表')
    this.loadMerchantSummary()
    /* 核销概况：已加载过门店列表则只刷新当前选中门店（保留切店选择），否则重新拉列表 */
    if (this.data.redemptionStoreList.length > 0) {
      this.loadRedemptionStatsByIndex(this.data.redemptionStoreIndex)
    } else {
      this.loadRedemptionStats()
    }
    this.loadMyPendingSteps(1).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    auditLog.info('触底加载更多待办步骤')
    this.loadMoreMyPendingSteps()
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
   * WebSocket 事件处理 — 收到审核链相关事件时自动刷新待办列表
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
      auditLog.info('收到审核链实时推送，刷新待办列表:', eventName)
      this.loadMyPendingSteps(1)
      return
    }

    if (eventName === 'new_notification' && _eventData) {
      const notificationType = _eventData.type || ''
      if (notificationType.startsWith('approval_')) {
        auditLog.info('收到审核链通知推送，刷新待办列表:', notificationType)
        this.loadMyPendingSteps(1)
      }
    }
  }
})
