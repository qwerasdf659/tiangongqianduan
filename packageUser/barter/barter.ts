/**
 * 以物易物页面（B2C 官方合成）
 *
 * 业务语义: 用户用自己持有的旧物，按官方配方合成产出新物（用户↔官方单向，非 C2C 交易）。
 * 操作起点是用户已持有的旧物实例（old_item_ids），与游戏"合成/熔炼"同构。
 *
 * 后端API:
 * - GET  /api/v4/exchange/barter/recipes — 配方列表（仅 is_enabled 配方）
 * - POST /api/v4/exchange/barter         — 提交合成（Header 幂等键，body: recipe_code + old_item_ids）
 * - GET  /api/v4/backpack/               — 用户背包（用于按 required_item_template_id 匹配可用旧物）
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   配方: recipe_code / name / required_item_template_id / required_quantity / output_exchange_item_id
 *   背包物品: item_id / item_template_id / item_name / item_type / status
 *
 * @file packageUser/barter/barter.ts
 * @version 5.2.0
 * @since 2026-06-10
 */

const { API, Wechat, Logger } = require('../../utils/index')
const barterLog = Logger.createLogger('barter')
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 功能后续开放蒙版（暂屏蔽以物易物功能，后续开放时置 false 即可恢复） */
    comingSoonVisible: true,
    /** 页面加载状态机 */
    loadStatus: 'loading' as 'loading' | 'success' | 'empty' | 'error',
    /** 配方列表（当前页，附加前端展示字段 _ownedCount / _canMake） */
    recipes: [] as any[],
    /** 当前页码（前端分页，1 基，供页码翻页栏展示） */
    currentPage: 1,
    /** 总页数（按配方总数 / 每页数计算，供页码翻页栏使用） */
    totalPages: 1,
    /** 用户可用旧物（status=available 的背包物品，用于按模板匹配） */
    availableItems: [] as any[],

    /** 选择旧物弹窗是否显示 */
    showSelectPanel: false,
    /** 当前操作的配方 */
    activeRecipe: null as any,
    /** 当前配方可选的旧物列表（已按 required_item_template_id 过滤，附加 _selected） */
    candidateItems: [] as any[],
    /** 已选旧物 item_id 列表 */
    selectedItemIds: [] as number[],
    /** 提交中 */
    submitting: false,

    /** MobX 绑定字段 */
    isLoggedIn: false
  },

  /** MobX Store 绑定实例（onUnload 时销毁） */
  userBindings: null as any,

  /** 全量配方（前端分页数据源，不直接渲染，分页截取后写入 recipes） */
  _allRecipes: [] as any[],
  /** 配方每页条数（前端分页，UI 常量） */
  _recipePageSize: 10,

  /** 蒙版拦截所有点击/滑动（功能未开放期间阻止穿透到下层页面） */
  onComingSoonMaskTap() {},

  /** 蒙版「返回上一页」：功能未开放期间提供退出入口 */
  onComingSoonBack() {
    wx.navigateBack({
      fail: () => {
        wx.switchTab({ url: '/pages/user/user' })
      }
    })
  },

  onLoad() {
    barterLog.info('以物易物页面加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })
    this.loadData()
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  async onPullDownRefresh() {
    await this.loadData()
    wx.stopPullDownRefresh()
  },

  /** 并行加载配方列表与背包可用旧物 */
  async loadData() {
    this.setData({ loadStatus: 'loading' })

    try {
      const [recipeResult, backpackResult] = await Promise.all([
        API.getBarterRecipes(),
        API.getUserInventory()
      ])

      /** 背包可用物品（status=available），用于匹配配方所需旧物数量 */
      const availableItems =
        backpackResult && backpackResult.success && backpackResult.data
          ? (backpackResult.data.items || []).filter((it: any) => it.status === 'available')
          : []

      const rawRecipes =
        recipeResult && recipeResult.success && recipeResult.data
          ? recipeResult.data.recipes || []
          : []

      const processedRecipes = rawRecipes.map((recipe: any) =>
        this.enrichRecipe(recipe, availableItems)
      )

      /** 配方使用前端分页（后端一次返回全部配方），缓存全量后截取第 1 页 */
      this._allRecipes = processedRecipes
      const totalPages = Math.max(1, Math.ceil(processedRecipes.length / this._recipePageSize))

      this.setData({
        recipes: processedRecipes.slice(0, this._recipePageSize),
        currentPage: 1,
        totalPages,
        availableItems,
        loadStatus: processedRecipes.length > 0 ? 'success' : 'empty'
      })

      barterLog.info('以物易物加载成功:', processedRecipes.length, '个配方')
    } catch (error: any) {
      barterLog.error('加载以物易物失败:', error)
      this.setData({ loadStatus: 'error' })
      showToast(error.message || '加载失败，请重试')
    }
  },

  /**
   * 页码翻页栏跳转（exchange-pager 派发）。
   * 配方为前端分页，翻页为「替换式」：从 _allRecipes 截取目标页写入 recipes。
   */
  onPagerChange(e: any) {
    const page = e.detail && e.detail.page
    if (!page) {
      return
    }
    const start = (page - 1) * this._recipePageSize
    this.setData({
      currentPage: page,
      recipes: this._allRecipes.slice(start, start + this._recipePageSize)
    })
  },

  /**
   * 丰富配方展示字段（统计用户持有的可用旧物数量，判断是否够合成）
   * 以 _ 前缀标记前端展示辅助字段，与后端业务字段区分
   */
  enrichRecipe(recipe: any, availableItems: any[]) {
    const requiredTemplateId = recipe.required_item_template_id
    const requiredQuantity = recipe.required_quantity || 1
    const ownedCount = availableItems.filter(
      (it: any) => it.item_template_id === requiredTemplateId
    ).length

    return {
      ...recipe,
      _requiredQuantity: requiredQuantity,
      _ownedCount: ownedCount,
      _canMake: ownedCount >= requiredQuantity
    }
  },

  /** 点击配方"去合成" → 打开旧物选择弹窗 */
  onMakeRecipe(e: any) {
    const recipeCode = e.currentTarget.dataset.code
    const recipe = this.data.recipes.find((r: any) => r.recipe_code === recipeCode)
    if (!recipe) {
      return
    }

    if (!recipe._canMake) {
      showToast(`旧物不足，需 ${recipe._requiredQuantity} 件`)
      return
    }

    /** 过滤出该配方所需模板的可用旧物，附加未选中标记 */
    const candidateItems = this.data.availableItems
      .filter((it: any) => it.item_template_id === recipe.required_item_template_id)
      .map((it: any) => ({ ...it, _selected: false }))

    this.setData({
      showSelectPanel: true,
      activeRecipe: recipe,
      candidateItems,
      selectedItemIds: []
    })
  },

  /** 勾选/取消勾选旧物（达到所需数量后阻止继续勾选） */
  onToggleItem(e: any) {
    const itemId = e.currentTarget.dataset.id
    const { selectedItemIds, activeRecipe, candidateItems } = this.data
    const requiredQuantity = activeRecipe._requiredQuantity
    const isSelected = selectedItemIds.includes(itemId)

    let nextSelectedIds: number[]
    if (isSelected) {
      nextSelectedIds = selectedItemIds.filter((id: number) => id !== itemId)
    } else {
      if (selectedItemIds.length >= requiredQuantity) {
        showToast(`最多选择 ${requiredQuantity} 件`)
        return
      }
      nextSelectedIds = [...selectedItemIds, itemId]
    }

    const nextCandidates = candidateItems.map((it: any) => ({
      ...it,
      _selected: nextSelectedIds.includes(it.item_id)
    }))

    this.setData({ selectedItemIds: nextSelectedIds, candidateItems: nextCandidates })
  },

  /** 关闭旧物选择弹窗 */
  onCloseSelectPanel() {
    if (this.data.submitting) {
      return
    }
    this.setData({
      showSelectPanel: false,
      activeRecipe: null,
      candidateItems: [],
      selectedItemIds: []
    })
  },

  /**
   * 提交合成
   * POST /api/v4/exchange/barter（body: recipe_code + old_item_ids，幂等键由 API 层放入 Header）
   */
  async onSubmitBarter() {
    const { activeRecipe, selectedItemIds, submitting } = this.data
    if (submitting || !activeRecipe) {
      return
    }

    const requiredQuantity = activeRecipe._requiredQuantity
    if (selectedItemIds.length !== requiredQuantity) {
      showToast(`请选择 ${requiredQuantity} 件旧物`)
      return
    }

    this.setData({ submitting: true })

    try {
      const result = await API.submitBarter(activeRecipe.recipe_code, selectedItemIds)

      if (result && result.success) {
        const mintedItem = result.data && result.data.minted_item
        const mintedName = mintedItem ? mintedItem.item_name : '新物品'
        barterLog.info('以物易物成功:', activeRecipe.recipe_code)
        this.setData({
          submitting: false,
          showSelectPanel: false,
          activeRecipe: null,
          candidateItems: [],
          selectedItemIds: []
        })

        wx.showModal({
          title: '合成成功',
          content: `已合成「${mintedName}」并收入我的仓库`,
          showCancel: false,
          confirmText: '查看仓库',
          success: () => {
            wx.navigateTo({ url: '/packageUser/backpack/inventory/inventory' })
          }
        })

        /** 刷新配方与背包（旧物已消耗） */
        this.loadData()
      } else {
        throw new Error((result && result.message) || '合成失败')
      }
    } catch (error: any) {
      barterLog.error('以物易物提交失败:', error)
      this.setData({ submitting: false })
      showToast(error.message || '合成失败，请重试')
    }
  },

  /** 重试加载 */
  retryLoad() {
    this.loadData()
  },

  /** 跳转我的仓库 */
  goToInventory() {
    wx.navigateTo({ url: '/packageUser/backpack/inventory/inventory' })
  },

  onShareAppMessage() {
    return {
      title: '天工平台 - 以物易物',
      path: '/pages/user/user'
    }
  }
})
