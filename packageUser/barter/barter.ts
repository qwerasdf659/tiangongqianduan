/**
 * 以物易物页面（B2C 官方合成）
 *
 * 业务语义: 用户用自己持有的旧物，按官方配方合成产出新物（用户↔官方单向，非 C2C 交易）。
 * 操作起点是用户已持有的旧物实例（old_item_ids），与游戏"合成/熔炼"同构。
 *
 * 后端API（对接文档 §十一-M1 + B-1 后端答复）:
 * - GET  /api/v4/exchange/barter/recipes — 配方列表（仅 is_enabled 配方，含限量字段与产出展示字段）
 * - POST /api/v4/exchange/barter         — 提交合成（Header 幂等键，body: recipe_code + old_item_ids + address_id?）
 * - GET  /api/v4/backpack/               — 用户背包（用于按 required_item_template_id 匹配可用旧物）
 * - GET  /api/v4/user/addresses          — 收货地址（实物产出快递履约，默认地址预选）
 *
 * 履约分流（拍板⑩，后端权威，判定源同源）:
 * - 配方 output_fulfillment_type='physical'（实物产出）→ 必传 address_id，订单 pending 走快递发货链，不 mint 进背包
 * - 券/道具产出（voucher/virtual）→ 无需地址，订单 completed 即时到账背包
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   配方: recipe_code / name / required_item_template_id / required_quantity /
 *         output_exchange_item_id / output_item_name / output_fulfillment_type /
 *         per_user_limit / total_limit
 *   背包物品: item_id / item_template_id / item_name / item_type / status
 *
 * @file packageUser/barter/barter.ts
 * @version 5.4.0
 * @since 2026-06-10
 */

const { API, Wechat, Logger } = require('../../utils/index')
const barterLog = Logger.createLogger('barter')
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 页面加载状态机 */
    loadStatus: 'loading' as 'loading' | 'success' | 'empty' | 'error',
    /** 配方列表（当前页，附加前端展示字段 _ownedCount / _canMake / _limitText） */
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
    /**
     * 产出是否为实物（后端产出商品 fulfillment_type='physical'）：
     * true 时提交必带 address_id，订单走快递发货链（拍板⑩）
     */
    needAddress: false,
    /** 已选收货地址（实物产出快递履约用，来自地址页选择回传或默认地址） */
    selectedAddress: null as API.UserAddress | null,
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
   * 丰富配方展示字段（统计用户持有的可用旧物数量，判断是否够合成；拼装限量说明）
   * 以 _ 前缀标记前端展示辅助字段，与后端业务字段区分
   */
  enrichRecipe(recipe: any, availableItems: any[]) {
    const requiredTemplateId = recipe.required_item_template_id
    const requiredQuantity = recipe.required_quantity || 1
    const ownedCount = availableItems.filter(
      (it: any) => it.item_template_id === requiredTemplateId
    ).length

    /** 限量说明（拍板⑬-(c)：per_user_limit 每人限换次数 / total_limit 配方总量，0 或缺省 = 不限） */
    const limitParts: string[] = []
    if (recipe.per_user_limit > 0) {
      limitParts.push(`每人限 ${recipe.per_user_limit} 次`)
    }
    if (recipe.total_limit > 0) {
      limitParts.push(`限量 ${recipe.total_limit} 份`)
    }

    /**
     * 产出展示文案（后端 output_item_name 直发；实物产出标注快递到家，拍板⑩履约方式）
     * output_item_name 为 null 表示产出商品已不存在（异常态），不展示产出行
     */
    const outputText = recipe.output_item_name
      ? `${recipe.output_item_name}${recipe.output_fulfillment_type === 'physical' ? '（快递到家）' : ''}`
      : ''

    return {
      ...recipe,
      _requiredQuantity: requiredQuantity,
      _ownedCount: ownedCount,
      _canMake: ownedCount >= requiredQuantity,
      _limitText: limitParts.join(' · '),
      _outputText: outputText
    }
  },

  /**
   * 点击配方"去合成" → 打开旧物选择弹窗
   * 实物产出（配方 output_fulfillment_type='physical'，与后端履约分流同源）需在提交前
   * 选收货地址（拍板⑩），直接读配方字段判定，展示地址行并预选默认地址；
   * 后端 BARTER_ADDRESS_REQUIRED 错误码仍作为兜底拦截（见 onSubmitBarter catch）
   */
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

    /** 实物产出判定：配方直发字段，与后端"必传 address_id"判定完全同源（B-1 后端答复） */
    const needAddress = recipe.output_fulfillment_type === 'physical'

    this.setData({
      showSelectPanel: true,
      activeRecipe: recipe,
      candidateItems,
      selectedItemIds: [],
      needAddress,
      selectedAddress: null
    })

    if (needAddress) {
      this.loadDefaultAddress()
    }
  },

  /**
   * 加载默认收货地址（实物产出初始选择）
   * GET /api/v4/user/addresses → 取 is_default 的地址；无默认则取第一条
   */
  async loadDefaultAddress() {
    try {
      const result = await API.getUserAddresses()
      /** 该接口 data 本身即地址数组（无 addresses/list 包裹），直接判定数组 */
      const addresses = Array.isArray(result.data) ? result.data : []
      if (result && result.success && addresses.length > 0) {
        const defaultAddr = addresses.find((a: any) => a.is_default) || addresses[0]
        this.setData({ selectedAddress: defaultAddr })
      }
    } catch (error) {
      barterLog.warn('加载默认地址失败（不阻断，用户可手动选）:', error)
    }
  },

  /** 点击收货地址行 → 跳转地址页选择模式，通过 eventChannel 回传所选地址 */
  onChooseAddress() {
    wx.navigateTo({
      url: '/packageUser/addresses/addresses?select=1',
      events: {
        selectAddress: (payload: { address: API.UserAddress }) => {
          if (payload && payload.address) {
            this.setData({ selectedAddress: payload.address })
          }
        }
      }
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
      selectedItemIds: [],
      needAddress: false,
      selectedAddress: null
    })
  },

  /**
   * 提交合成
   * POST /api/v4/exchange/barter（body: recipe_code + old_item_ids + address_id?，幂等键由 API 层放入 Header）
   *
   * 履约分流（以后端返回 order_status 为准）:
   *   pending   → 实物产出，走快递发货链，引导查看我的订单
   *   completed → 券/道具产出，即时到账背包，引导查看我的仓库
   */
  async onSubmitBarter() {
    const { activeRecipe, selectedItemIds, submitting, needAddress, selectedAddress } = this.data
    if (submitting || !activeRecipe) {
      return
    }

    const requiredQuantity = activeRecipe._requiredQuantity
    if (selectedItemIds.length !== requiredQuantity) {
      showToast(`请选择 ${requiredQuantity} 件旧物`)
      return
    }

    /** 实物产出必选收货地址（拍板⑩），前置拦截避免无效请求往返 */
    if (needAddress && !selectedAddress) {
      showToast('请先选择收货地址')
      return
    }

    this.setData({ submitting: true })

    try {
      const result = await API.submitBarter(
        activeRecipe.recipe_code,
        selectedItemIds,
        needAddress && selectedAddress ? selectedAddress.address_id : undefined
      )

      if (result && result.success && result.data) {
        barterLog.info('以物易物成功:', activeRecipe.recipe_code, result.data.order_status)
        this.setData({
          submitting: false,
          showSelectPanel: false,
          activeRecipe: null,
          candidateItems: [],
          selectedItemIds: [],
          needAddress: false,
          selectedAddress: null
        })

        if (result.data.order_status === 'pending') {
          /** 实物产出：订单 pending 走快递发货链（不 mint 进背包），引导到我的订单跟踪物流 */
          wx.showModal({
            title: '合成成功',
            content: '实物将通过快递寄送到您的收货地址，可在「我的订单」查看发货进度',
            showCancel: false,
            confirmText: '查看订单',
            success: () => {
              wx.navigateTo({ url: '/packageExchange/exchange-orders/exchange-orders' })
            }
          })
        } else {
          /** 券/道具产出：completed 即时到账背包 */
          const mintedItem = result.data.minted_item
          const mintedName = mintedItem ? mintedItem.item_name : '新物品'
          wx.showModal({
            title: '合成成功',
            content: `已合成「${mintedName}」并收入我的仓库`,
            showCancel: false,
            confirmText: '查看仓库',
            success: () => {
              wx.navigateTo({ url: '/packageUser/backpack/inventory/inventory' })
            }
          })
        }

        /** 刷新配方与背包（旧物已消耗） */
        this.loadData()
      } else {
        throw new Error((result && result.message) || '合成失败')
      }
    } catch (error: any) {
      barterLog.error('以物易物提交失败:', error)
      this.setData({ submitting: false })

      /**
       * 后端兜底拦截（前置履约类型查询失败时触发）：实物产出缺收货地址，
       * 展示地址选择行并引导用户补选后重新提交
       */
      if (error.code === 'BARTER_ADDRESS_REQUIRED') {
        this.setData({ needAddress: true })
        wx.showModal({
          title: '需要收货地址',
          content: '该配方产出为实物商品，将通过快递寄送，请先选择收货地址',
          showCancel: false,
          confirmText: '去选择',
          success: () => this.onChooseAddress()
        })
        return
      }

      /** 运营配置缺陷兜底（产出商品未挂模板，正常不会出现）：按对接文档提示稍后再试 */
      if (error.code === 'BARTER_OUTPUT_TEMPLATE_MISSING') {
        showToast('该配方暂时无法合成，请稍后再试')
        return
      }

      /**
       * 其余错误码（BARTER_RECIPE_NOT_FOUND / BARTER_ITEM_NOT_AVAILABLE /
       * BARTER_DIRECTION_UPWARD_FORBIDDEN / BARTER_PER_USER_LIMIT_EXCEEDED /
       * BARTER_TOTAL_LIMIT_EXCEEDED 等）透传后端中文 message 原样提示
       */
      showToast(error.message || '合成失败，请重试')

      /** 限量超限/旧物不可用等属数据已变化，刷新配方与背包纠正展示 */
      if (
        error.code === 'BARTER_PER_USER_LIMIT_EXCEEDED' ||
        error.code === 'BARTER_TOTAL_LIMIT_EXCEEDED' ||
        error.code === 'BARTER_ITEM_NOT_AVAILABLE'
      ) {
        this.loadData()
      }
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
