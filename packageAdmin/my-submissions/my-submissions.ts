/**
 * packageAdmin/my-submissions/my-submissions.ts - 我的提交（店员查看本人/本店提交的消费记录及审核状态）
 *
 * 业务背景（对接文档 2026-06-24《店员商家功能按钮显示不全问题》§四）：
 *   - 「审核详情」是管理员（role_level>=100）在 console 域审核 pending 记录的功能；
 *   - 店员（merchant_staff, role_level>=20）只负责「提交消费记录」，提交后需要能查看自己
 *     这些记录的审核进度（待审核/已通过/已拒绝），这与 admin 审核是两回事。
 *   - 本页即店员侧「查自己提交记录审核状态」入口，数据走商家域只读接口，不碰 console 审核接口。
 *
 * 数据来源（均为后端真实接口，零映射直读 snake_case）：
 *   - GET /api/v4/shop/consumption/merchant/stats  顶部状态概况（by_status/total/timeout）
 *   - GET /api/v4/shop/consumption/merchant/list    提交记录分页列表（按当前登录人范围隔离）
 *
 * 权限：role_level>=20（店员及以上）。后端按登录人范围隔离数据，前端只展示。
 */

const { API, Utils, Wechat, Logger, Permission } = require('../../utils/index')
const log = Logger.createLogger('my-submissions')
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { checkAuth } = Utils
const { showToast } = Wechat

/** 审核状态展示映射（与 consumption_records.status 四态对齐：pending/approved/rejected/expired） */
const STATUS_DISPLAY: Record<string, { text: string; color: string; bgColor: string }> = {
  pending: { text: '待审核', color: '#c5a572', bgColor: 'rgba(197, 165, 114, 0.12)' },
  approved: { text: '已通过', color: '#27ae60', bgColor: 'rgba(39, 174, 96, 0.12)' },
  rejected: { text: '已拒绝', color: '#e74c3c', bgColor: 'rgba(231, 76, 60, 0.12)' },
  expired: { text: '已过期', color: '#999999', bgColor: 'rgba(153, 153, 153, 0.12)' }
}

/**
 * 多视角枚举（对接文档《消费提交记录-多视角查询》§16.3 契约，与后端同名零映射）
 *   self  = 仅本人提交（任何角色可用）
 *   store = 门店全部（店长及以上；不传 store_id = 聚合可见门店全部）
 *   staff = 指定门店指定员工（店长及以上；store_id + target_user_id 必传）
 *   all   = 全局（仅管理员）
 */
const VIEW = { SELF: 'self', STORE: 'store', STAFF: 'staff', ALL: 'all' } as const

/** 视角 Tab 文案（WXML 表达式不能内联对象，故在此预定义供页面引用） */
const VIEW_TAB_LABELS: Record<string, string> = {
  self: '我的',
  store: '门店',
  staff: '员工',
  all: '全部'
}

/**
 * 按角色 role_level 计算可用视角列表（门槛对齐 utils/permission.ts ROLE_LEVEL，非前端自定义）
 *   店员(<40)   → 仅 self（不展示切换）
 *   店长(40~99) → store(默认) / staff
 *   管理员(≥100)→ all(默认) / store / staff
 */
function buildViewTabs(roleLevel: number): Array<{ key: string; label: string }> {
  const toTab = (key: string) => ({ key, label: VIEW_TAB_LABELS[key] })
  if (roleLevel >= Permission.ROLE_LEVEL.ADMIN) {
    return [VIEW.ALL, VIEW.STORE, VIEW.STAFF].map(toTab)
  }
  if (roleLevel >= Permission.ROLE_LEVEL.MANAGER) {
    return [VIEW.STORE, VIEW.STAFF].map(toTab)
  }
  return [VIEW.SELF].map(toTab)
}

/** 按角色取缺省视角（与后端 viewResolver 缺省口径一致：店员 self / 店长 store / 管理员 all） */
function defaultViewByRole(roleLevel: number): string {
  if (roleLevel >= Permission.ROLE_LEVEL.ADMIN) {
    return VIEW.ALL
  }
  if (roleLevel >= Permission.ROLE_LEVEL.MANAGER) {
    return VIEW.STORE
  }
  return VIEW.SELF
}

Page({
  data: {
    /** 是否已登录（MobX 绑定） */
    isLoggedIn: false,

    // ===== 多视角切换状态（对接文档 §16.3 契约） =====
    /** 当前登录人角色等级（从 userStore.userInfo.role_level 取，决定可用视角） */
    roleLevel: 0,
    /** 可用视角 Tab（按角色构建：店员仅 self / 店长 store+staff / 管理员 all+store+staff） */
    viewTabs: [] as Array<{ key: string; label: string }>,
    /** 当前生效视角（self/store/staff/all），缺省按角色解析 */
    currentView: 'self',
    /** 是否展示视角切换条（仅店长及以上有多个视角时展示） */
    showViewSwitch: false,
    /** 后端回显的视角说明文案（data.view_note，前端零计算直读） */
    viewNote: '',

    // ===== 门店选择器（view=store/staff 时使用，数据源 GET /shop/my-stores） =====
    /** 可选门店列表（{ store_id, store_name, ... }） */
    storeList: [] as any[],
    /** 当前选中门店ID（store 视角不选=聚合全部；staff 视角必选） */
    selectedStoreId: null as number | null,
    /** 当前选中门店名称（用于展示） */
    selectedStoreName: '',
    /** 门店选择器弹层可见性 */
    storePickerVisible: false,

    // ===== 员工选择器（view=staff 时使用，数据源 GET /shop/staff/list） =====
    /** 当前门店员工列表（{ user_id, user_nickname, role_in_store, status } 等） */
    staffList: [] as any[],
    /** 当前选中员工 user_id（staff 视角必选） */
    selectedTargetUserId: null as number | null,
    /** 当前选中员工昵称（用于展示） */
    selectedStaffName: '',
    /** 员工选择器弹层可见性 */
    staffPickerVisible: false,
    /** 员工选择器是否含离职（C1：默认仅在职，可勾选含离职） */
    staffIncludeDeleted: false,

    /** 顶部状态概况（来自 merchant/stats 的 by_status，前端零计算直读） */
    summaryReady: false,
    pendingCount: 0,
    approvedCount: 0,
    rejectedCount: 0,

    /** 提交记录列表（已附前端展示辅助字段，原始 snake_case 字段保留） */
    submissionRecords: [] as any[],

    /** 分页状态（后端真分页） */
    page: 1,
    pageSize: 20,
    totalPages: 1,
    hasMore: true,

    /** 页面状态 */
    loading: true,
    loadingMore: false,
    initialized: false
  },

  onLoad() {
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    /**
     * 按角色初始化视角：role_level 取自 userStore.userInfo（登录态权威），
     * 缺省视角与后端 viewResolver 一致（店员 self / 店长 store / 管理员 all）。
     * 视角准入与数据范围最终由后端 DataScopeService 强制，前端仅控制 UI 可选项。
     */
    const localUserInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const localRoleLevel = localUserInfo?.role_level || 0
    const initialView = defaultViewByRole(localRoleLevel)
    const tabs = buildViewTabs(localRoleLevel)
    this.setData({
      roleLevel: localRoleLevel,
      viewTabs: tabs,
      currentView: initialView,
      showViewSwitch: tabs.length > 1
    })
  },

  onShow() {
    if (!checkAuth()) {
      return
    }
    this.setData({ isLoggedIn: true })
    if (!this.data.initialized) {
      this.initializePage()
    } else {
      this.refreshAll()
    }
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  /** 首次进入：（店长/管理员）预拉门店列表 + 并行加载状态概况 + 首页记录 */
  async initializePage() {
    this.setData({ loading: true })
    try {
      // 店长及以上才需要门店选择器数据源；店员仅 self 视角，无需拉门店
      if (this.data.showViewSwitch) {
        await this.loadMyStores()
      }
      await Promise.all([this.loadStats(), this.loadRecords(1, false)])
    } finally {
      this.setData({ loading: false, initialized: true })
    }
  },

  /** 刷新全部（返回本页/下拉刷新时调用） */
  async refreshAll() {
    await Promise.all([this.loadStats(), this.loadRecords(1, false)])
  },

  /**
   * 构建当前视角的查询参数（列表与统计共用，确保口径一致）
   *
   * 对接文档 §16.3：view/store_id/target_user_id 同名零映射传给后端。
   *   - self：仅传 view（后端锁 merchant_id=自己）
   *   - store：传 view + store_id（不选门店=不传 store_id，后端聚合可见门店全部）
   *   - staff：传 view + store_id + target_user_id（均必传）
   *   - all：仅传 view（后端全局，仅管理员）
   */
  _buildViewParams(): { view: string; store_id?: number; target_user_id?: number } {
    const { currentView, selectedStoreId, selectedTargetUserId } = this.data
    const params: { view: string; store_id?: number; target_user_id?: number } = {
      view: currentView
    }
    if (currentView === VIEW.STORE && selectedStoreId) {
      params.store_id = selectedStoreId
    }
    if (currentView === VIEW.STAFF) {
      if (selectedStoreId) {
        params.store_id = selectedStoreId
      }
      if (selectedTargetUserId) {
        params.target_user_id = selectedTargetUserId
      }
    }
    return params
  },

  /**
   * staff 视角下校验门店+员工是否都已选（未选齐时不发请求，提示用户先选）
   * @returns true=可查询 / false=缺必填项
   */
  _isStaffViewReady(): boolean {
    if (this.data.currentView !== VIEW.STAFF) {
      return true
    }
    return !!this.data.selectedStoreId && !!this.data.selectedTargetUserId
  },

  /**
   * 加载状态概况 - GET /api/v4/shop/consumption/merchant/stats
   * 直读后端 by_status.{pending,approved,rejected}.count，前端不自行累加计算。
   * 按当前视角传参，与列表口径统一（对接文档拍板项2）。
   */
  async loadStats() {
    if (!this._isStaffViewReady()) {
      return
    }
    try {
      const apiResult = await API.getMerchantConsumptionStats(this._buildViewParams())
      if (apiResult?.success && apiResult.data) {
        const byStatus = apiResult.data.by_status || {}
        this.setData({
          summaryReady: true,
          pendingCount: byStatus.pending?.count || 0,
          approvedCount: byStatus.approved?.count || 0,
          rejectedCount: byStatus.rejected?.count || 0
        })
      }
    } catch (statsError) {
      /* 概况加载失败不阻断列表展示，仅记录日志 */
      log.warn('提交状态概况加载失败（非阻断）:', statsError)
    }
  },

  /**
   * 加载提交记录 - GET /api/v4/shop/consumption/merchant/list
   *
   * 按当前视角传 view/store_id/target_user_id（对接文档 §16.3，零映射）。
   * 越权由后端返回 4xx + code（VIEW_NOT_ALLOWED/STORE_OUT_OF_SCOPE/STAFF_NOT_IN_STORE/
   * TARGET_USER_REQUIRED），前端按 code 提示、不降级吞错。
   *
   * @param page   目标页码（1 基）
   * @param append true=触底追加，false=首屏/下拉替换
   */
  async loadRecords(page: number = 1, append: boolean = false) {
    if (!this.data.isLoggedIn) {
      return
    }
    // staff 视角未选齐门店+员工时清空列表并提示，不发无效请求
    if (!this._isStaffViewReady()) {
      this.setData({ submissionRecords: [], hasMore: false })
      return
    }
    try {
      const apiResult = await API.getMerchantConsumptions({
        ...this._buildViewParams(),
        page,
        page_size: this.data.pageSize
      })
      if (!apiResult?.success || !apiResult.data) {
        throw new Error(apiResult?.message || '提交记录加载失败')
      }

      const rawRecords = apiResult.data.records || []
      const pagination = apiResult.data.pagination || {}
      const totalPages =
        pagination.total_pages || (rawRecords.length === this.data.pageSize ? page + 1 : page)

      const formattedRecords = rawRecords.map((record: any) => this._formatRecord(record))
      const mergedRecords = append
        ? [...this.data.submissionRecords, ...formattedRecords]
        : formattedRecords

      this.setData({
        submissionRecords: mergedRecords,
        page,
        totalPages,
        hasMore: page < totalPages,
        // 后端回显视角说明文案，零计算直读
        viewNote: apiResult.data.view_note || ''
      })
    } catch (loadError: any) {
      log.error('提交记录加载失败:', loadError)
      showToast(this._resolveErrorMessage(loadError), 'none', 2500)
    }
  },

  /**
   * 把后端越权/参数错误码转成用户可读提示（不吞错、按 code 明确告知）
   * 对接文档 §16.3 错误码契约。
   */
  _resolveErrorMessage(loadError: any): string {
    const code = loadError?.code || ''
    const codeMessageMap: Record<string, string> = {
      VIEW_NOT_ALLOWED: '当前角色不能使用该视角',
      STORE_OUT_OF_SCOPE: '所选门店超出你的可见范围',
      STAFF_NOT_IN_STORE: '所选员工不属于该门店',
      TARGET_USER_REQUIRED: '请先选择要查看的员工',
      STORE_ID_REQUIRED: '请先选择门店'
    }
    return codeMessageMap[code] || loadError?.message || '提交记录加载失败'
  },

  /** 为单条记录附加前端展示辅助字段（原始 snake_case 字段保留，前端零映射直读） */
  _formatRecord(record: any) {
    const amount = parseFloat(record.consumption_amount)
    return {
      ...record,
      statusDisplay: STATUS_DISPLAY[record.status] || STATUS_DISPLAY.pending,
      amountText: isNaN(amount) ? '0.00' : amount.toFixed(2),
      createdAtText: Utils.formatBeijingTimeField(record.created_at, 'relative')
    }
  },

  // ===== 多视角切换交互 =====

  /**
   * 切换视角 Tab（点击「我的/门店/员工/全部」）
   *
   * 切到 store/staff 需要门店数据源；staff 还需选员工。切换后重置分页并重新拉取。
   * 数据范围最终由后端按 view 强制，前端仅维护 UI 选择态。
   */
  async onViewTabTap(e: any) {
    const nextView = e.currentTarget.dataset.view
    if (!nextView || nextView === this.data.currentView) {
      return
    }
    /* 切换视角时清空门店/员工选择，避免上一视角的选择串到新视角 */
    this.setData({
      currentView: nextView,
      selectedStoreId: null,
      selectedStoreName: '',
      selectedTargetUserId: null,
      selectedStaffName: '',
      staffList: [],
      page: 1,
      submissionRecords: []
    })
    /* 门店列表为空且需要门店选择时补拉一次 */
    if ((nextView === VIEW.STORE || nextView === VIEW.STAFF) && this.data.storeList.length === 0) {
      await this.loadMyStores()
    }
    await this.refreshAll()
  },

  /**
   * 加载"我的门店"列表（门店选择器数据源）- GET /api/v4/shop/my-stores
   * 单门店自动选中；多门店等待用户在选择器中选择。
   */
  async loadMyStores() {
    try {
      const storesResult = await API.getMyStores()
      if (storesResult?.success && storesResult.data) {
        const apiStores = storesResult.data.stores || []
        const storePatch: Record<string, any> = { storeList: apiStores }
        // 仅单门店时自动选中，多门店保持未选中等待用户选择
        if (apiStores.length === 1) {
          storePatch.selectedStoreId = apiStores[0].store_id
          storePatch.selectedStoreName = apiStores[0].store_name || ''
        }
        this.setData(storePatch)
      }
    } catch (storesError: any) {
      log.warn('加载我的门店列表失败:', storesError?.message)
    }
  },

  /** 打开门店选择器弹层 */
  openStorePicker() {
    if (this.data.storeList.length === 0) {
      showToast('暂无可选门店', 'none', 2000)
      return
    }
    this.setData({ storePickerVisible: true })
  },

  /** 关闭门店选择器弹层（t-popup visible-change：遮罩点击/手势关闭时同步状态） */
  onStorePickerClose(e: any) {
    const nextVisible = e?.detail?.visible
    this.setData({ storePickerVisible: nextVisible === undefined ? false : !!nextVisible })
  },

  /**
   * 选中某个门店
   *   store 视角：选门店后直接刷新；
   *   staff 视角：选门店后清空已选员工并拉该门店员工列表，等待选员工。
   */
  async onStoreSelect(e: any) {
    const tappedStoreId = Number(e.currentTarget.dataset.storeId)
    const tappedStore = this.data.storeList.find((s: any) => s.store_id === tappedStoreId)
    if (!tappedStore) {
      return
    }
    this.setData({
      selectedStoreId: tappedStoreId,
      selectedStoreName: tappedStore.store_name || '',
      storePickerVisible: false,
      // 切门店后员工选择作废
      selectedTargetUserId: null,
      selectedStaffName: '',
      staffList: [],
      page: 1
    })
    if (this.data.currentView === VIEW.STAFF) {
      await this.loadStaffList()
    } else {
      await this.refreshAll()
    }
  },

  /**
   * 加载门店员工列表（员工视角选择器数据源）- GET /api/v4/shop/staff/list
   * C1：默认仅在职，勾选「含离职」时带 include_deleted=true 查历史员工。
   */
  async loadStaffList() {
    if (!this.data.selectedStoreId) {
      return
    }
    try {
      const staffResult = await API.getStoreStaffList({
        store_id: this.data.selectedStoreId,
        // 含离职时不限定 status（查全部），否则只看在职
        status: this.data.staffIncludeDeleted ? undefined : 'active',
        include_deleted: this.data.staffIncludeDeleted || undefined,
        page: 1,
        page_size: 50
      })
      if (staffResult?.success && staffResult.data) {
        this.setData({ staffList: staffResult.data.staff || [] })
      }
    } catch (staffError: any) {
      log.warn('加载门店员工列表失败:', staffError?.message)
      showToast('员工列表加载失败', 'none', 2000)
    }
  },

  /** 打开员工选择器弹层（需先选门店） */
  openStaffPicker() {
    if (!this.data.selectedStoreId) {
      showToast('请先选择门店', 'none', 2000)
      return
    }
    this.setData({ staffPickerVisible: true })
  },

  /** 关闭员工选择器弹层（t-popup visible-change：遮罩点击/手势关闭时同步状态） */
  onStaffPickerClose(e: any) {
    const nextVisible = e?.detail?.visible
    this.setData({ staffPickerVisible: nextVisible === undefined ? false : !!nextVisible })
  },

  /** 切换「含离职」开关，重新拉取员工列表 */
  async onToggleIncludeDeleted(e: any) {
    const nextInclude = !!e.detail.value
    this.setData({ staffIncludeDeleted: nextInclude })
    await this.loadStaffList()
  },

  /** 选中某个员工后刷新列表与统计 */
  async onStaffSelect(e: any) {
    const tappedUserId = Number(e.currentTarget.dataset.userId)
    const tappedStaff = this.data.staffList.find((s: any) => s.user_id === tappedUserId)
    if (!tappedStaff) {
      return
    }
    this.setData({
      selectedTargetUserId: tappedUserId,
      selectedStaffName: tappedStaff.user_nickname || `员工${tappedUserId}`,
      staffPickerVisible: false,
      page: 1
    })
    await this.refreshAll()
  },

  /** 下拉刷新 */
  async onPullDownRefresh() {
    await this.refreshAll()
    wx.stopPullDownRefresh()
  },

  /** 触底加载更多 */
  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore) {
      return
    }
    this.setData({ loadingMore: true })
    await this.loadRecords(this.data.page + 1, true)
    this.setData({ loadingMore: false })
  }
})
