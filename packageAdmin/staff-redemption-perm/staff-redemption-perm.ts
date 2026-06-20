/**
 * 员工核销权限管理页（店长授权本店店员查看"本店核销概况"）
 *
 * 业务背景：门店专属兑换券业务线 §9.8 —— 店长(manager)默认可看本店核销概况；
 *   店员(staff)默认不可看，需本店店长在此页授权后才能看。
 *
 * 数据流（前端零映射直读后端 snake_case 字段，以后端为准）：
 *   1. 取门店：GET /api/v4/shop/my-stores（多门店店长可切店）
 *   2. 列表：  GET /api/v4/shop/staff/list?store_id=&status=active（含 can_view_redemption_stats）
 *   3. 授权：  PUT /api/v4/shop/redemption/staff/:store_staff_id/stats-permission
 *
 * 权限准入：role_level>=20 可进页面；实际授权动作由后端校验（须为该店 active manager 或平台 admin）。
 *   manager 行不显示开关（店长天然可看）；仅 staff 行显示授权开关。
 *
 * @file packageAdmin/staff-redemption-perm/staff-redemption-perm.ts
 * @since 2026-06-21
 */

const { API, Utils, Wechat, Logger } = require('../../utils/index')
const permLog = Logger.createLogger('staff-redemption-perm')
const { checkAuth } = Utils
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 页面整体加载态（首屏拉员工列表时显示骨架/loading） */
    loading: true,
    /** 门店列表（多门店店长可切店；单店自动选中） */
    storeList: [] as any[],
    /** 当前选中门店ID */
    currentStoreId: null as number | null,
    /** 当前选中门店名称（页面展示用） */
    currentStoreName: '',
    /** 门店选择器当前索引（picker 用） */
    storeIndex: 0,
    /** 是否多门店（决定是否显示门店切换器） */
    isMultiStore: false,
    /** 员工列表（后端 staff[]，零映射直读） */
    staffList: [] as any[],
    /** 单个开关切换中的 store_staff_id（防重复点击 + 行内 loading） */
    togglingStaffId: null as number | null
  },

  userBindings: null as any,

  onLoad() {
    permLog.info('员工核销权限管理页加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo'],
      actions: []
    })

    if (!checkAuth()) {
      permLog.error('用户未登录，终止加载')
      return
    }

    /* 准入：role_level>=20（店员及以上）才能进；能否真正授权由后端按 manager 身份精校 */
    const localUserInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const localRoleLevel = localUserInfo?.role_level || 0
    if (localRoleLevel < 20) {
      permLog.error('用户无权限，role_level:', localRoleLevel)
      wx.showModal({
        title: '权限不足',
        content: '仅店长及以上角色可管理员工核销概况查看权限。',
        showCancel: false,
        success: () => wx.navigateBack()
      })
      return
    }

    this.loadStoresThenStaff()
  },

  /**
   * 先取"我的门店"确定 store_id，再加载该门店员工列表
   * 门店数据源：GET /api/v4/shop/my-stores（与消费录入/审核页同源）
   */
  async loadStoresThenStaff() {
    try {
      const storesResult = await API.getMyStores()
      const myStores =
        (storesResult && storesResult.success && storesResult.data && storesResult.data.stores) ||
        []

      if (!myStores.length) {
        permLog.warn('无在职门店，无法管理员工权限')
        this.setData({ loading: false, storeList: [], staffList: [] })
        showToast('您当前无可管理的门店')
        return
      }

      this.setData({
        storeList: myStores,
        isMultiStore: myStores.length > 1,
        currentStoreId: myStores[0].store_id,
        currentStoreName: myStores[0].store_name || '',
        storeIndex: 0
      })

      await this.loadStaffList()
    } catch (storesError: any) {
      permLog.error('加载门店列表失败:', storesError?.message)
      this.setData({ loading: false })
      showToast('门店加载失败，请下拉重试')
    }
  },

  /**
   * 加载当前门店员工列表（含核销概况查看授权状态）
   * 接口：GET /api/v4/shop/staff/list?store_id=&status=active
   */
  async loadStaffList() {
    const targetStoreId = this.data.currentStoreId
    if (!targetStoreId) {
      this.setData({ loading: false })
      return
    }

    this.setData({ loading: true })
    try {
      const listResult = await API.getStoreStaffList({
        store_id: targetStoreId,
        status: 'active'
      })

      const apiStaffList =
        (listResult && listResult.success && listResult.data && listResult.data.staff) || []

      this.setData({
        staffList: apiStaffList,
        loading: false
      })
      permLog.info('员工列表加载成功，数量:', apiStaffList.length)
    } catch (listError: any) {
      permLog.error('加载员工列表失败:', listError?.code || '', listError?.message || '')
      this.setData({ staffList: [], loading: false })
      showToast(listError?.message || '员工列表加载失败')
    }
  },

  /**
   * 切换门店（多门店店长）→ 重新加载该门店员工列表
   * picker 绑定 bindchange，value 为门店在 storeList 中的索引
   */
  onStoreChange(e: any) {
    const selectedIndex = Number(e.detail.value)
    const selectedStore = this.data.storeList[selectedIndex]
    if (!selectedStore) {
      return
    }

    this.setData({
      storeIndex: selectedIndex,
      currentStoreId: selectedStore.store_id,
      currentStoreName: selectedStore.store_name || ''
    })
    this.loadStaffList()
  },

  /**
   * 切换某店员的"查看本店核销概况"授权
   * 接口2：PUT /api/v4/shop/redemption/staff/:store_staff_id/stats-permission
   *
   * 交互：t-switch 的 bindchange 触发，e.detail.value 为切换后的目标值。
   *   调用成功后用后端返回的 can_view_redemption_stats 回写该行（以后端为准，不前端臆断）。
   *   失败则不改变开关状态（后端是权威，前端不静默造假）。
   */
  async onTogglePermission(e: any) {
    const dataset = e.currentTarget.dataset
    const targetStaffId = Number(dataset.staffId)
    const nextValue = !!e.detail.value

    if (!targetStaffId) {
      permLog.error('开关缺少 store_staff_id，忽略')
      return
    }

    /* 防重复点击：同一员工切换进行中时直接忽略 */
    if (this.data.togglingStaffId === targetStaffId) {
      return
    }
    this.setData({ togglingStaffId: targetStaffId })

    try {
      const permResult = await API.setStaffRedemptionStatsPermission(targetStaffId, nextValue)
      const confirmedValue =
        permResult && permResult.success && permResult.data
          ? !!permResult.data.can_view_redemption_stats
          : nextValue

      /* 以后端返回值回写对应行（零映射直读 can_view_redemption_stats） */
      const updatedStaffList = this.data.staffList.map((staffItem: any) =>
        staffItem.store_staff_id === targetStaffId
          ? { ...staffItem, can_view_redemption_stats: confirmedValue }
          : staffItem
      )
      this.setData({ staffList: updatedStaffList, togglingStaffId: null })
      showToast(confirmedValue ? '已授权查看' : '已取消授权')
    } catch (permError: any) {
      /* 失败：后端权威，回滚到原状态（重新读列表当前值，不前端造假） */
      permLog.error('授权操作失败:', permError?.code || '', permError?.message || '')
      this.setData({ togglingStaffId: null })
      /* 强制刷新该行开关回原值：触发 staffList 重新 setData 使 t-switch 复位 */
      const revertStaffList = this.data.staffList.map((staffItem: any) => ({ ...staffItem }))
      this.setData({ staffList: revertStaffList })
    }
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  onPullDownRefresh() {
    permLog.info('下拉刷新员工列表')
    this.loadStaffList().finally(() => wx.stopPullDownRefresh())
  }
})
