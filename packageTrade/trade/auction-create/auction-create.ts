/**
 * 创建C2C拍卖页 — 从背包选物品 → 设置参数 → 提交
 *
 * 业务场景：
 *   用户从背包选择available状态的物品，设置起拍价/一口价/时间/出价币种等参数，
 *   提交后端创建拍卖。后端会锁定物品（holdItem）并保存物品快照。
 *
 * 后端API:
 *   GET  /api/v4/backpack              → 用户背包（获取可拍卖的物品列表）
 *   GET  /api/v4/marketplace/settlement-currencies → 结算币种列表（出价资产选择）
 *   POST /api/v4/marketplace/auctions  → 创建拍卖
 *
 * 业务规则:
 *   - 只有 status=available 且 allowed_actions 包含 'sell' 的物品可以拍卖
 *   - end_time - start_time >= 2小时（后端配置 auction_min_duration_hours）
 *   - buyout_price > start_price（若设置一口价）
 *   - 物品有 redemption/security 活跃锁时创建失败（后端holdItem校验）
 *
 * @file packageTrade/trade/auction-create/auction-create.ts
 * @version 5.2.0
 * @since 2026-03-25
 */

const {
  API,
  Logger: AuctionCreateLogger,
  Wechat: AuctionCreateWechat,
  AuctionHelpers: AuctionCreateHelpers
} = require('../../../utils/index')
const auctionCreateLog = AuctionCreateLogger.createLogger('auction-create')

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../../store/user')

/** 最小拍卖时长（小时），与后端 system_settings.auction_min_duration_hours 对齐 */
const MIN_DURATION_HOURS = 2

Page({
  data: {
    /** 步骤: 'select_item' | 'set_params' */
    step: 'select_item',

    /** 背包物品列表（仅可拍卖的物品） */
    availableItems: [] as any[],
    itemsLoading: true,
    itemsEmpty: false,

    /** 选中的物品 */
    selectedItem: null as any,

    /** 结算币种列表 */
    currencies: [] as any[],
    selectedCurrencyIndex: 0,

    /** 拍卖参数表单 */
    startPrice: '',
    minBidIncrement: '10',
    buyoutPrice: '',
    enableBuyout: false,

    /** 时间选择 */
    startTimeType: 'now',
    customStartDate: '',
    customStartTime: '',
    durationHours: '24',

    /** 提交状态 */
    submitting: false
  },

  storeBindings: null as any,

  onLoad() {
    auctionCreateLog.info('创建拍卖页面加载')

    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    if (!(this.data as any).isLoggedIn) {
      AuctionCreateWechat.showToast('请先登录', 'none')
      setTimeout(() => {
        wx.navigateTo({ url: '/packageUser/auth/auth' })
      }, 1500)
      return
    }

    this._loadBackpackItems()
    this._loadCurrencies()
  },

  onUnload() {
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  /** 加载背包物品（仅可拍卖） */
  async _loadBackpackItems() {
    this.setData({ itemsLoading: true })

    try {
      const result = await API.getUserInventory()

      if (result.success && result.data) {
        const { items = [] } = result.data

        const availableItems = items
          .filter((item: any) => {
            const canSell = item.allowed_actions && item.allowed_actions.includes('sell')
            const isAvailable = item.status === 'available'
            return canSell && isAvailable
          })
          .map((item: any) => ({
            ...item,
            _displayName: item.item_name || item.display_name || '未知物品',
            _displayImage: AuctionCreateHelpers.getAuctionItemImageByType(item.item_type),
            _rarityLabel: AuctionCreateHelpers.getAuctionRarityLabel(item.rarity_code)
          }))

        this.setData({
          availableItems,
          itemsLoading: false,
          itemsEmpty: availableItems.length === 0
        })
      } else {
        this.setData({ itemsLoading: false, itemsEmpty: true })
      }
    } catch (error: any) {
      auctionCreateLog.error('加载背包失败', error)
      this.setData({ itemsLoading: false, itemsEmpty: true })
      AuctionCreateWechat.showToast('加载背包失败', 'none')
    }
  },

  /** 加载结算币种列表 */
  async _loadCurrencies() {
    try {
      const result = await API.getSettlementCurrencies()
      if (result.success && result.data && result.data.currencies) {
        this.setData({ currencies: result.data.currencies })
      }
    } catch (error: any) {
      auctionCreateLog.error('加载币种列表失败', error)
    }
  },

  // ==================== 步骤1：选择物品 ====================

  /** 选择物品 */
  onSelectItem(e: WechatMiniprogram.TouchEvent) {
    const item = e.currentTarget.dataset.item
    if (!item) {
      return
    }

    this.setData({
      selectedItem: item,
      step: 'set_params'
    })
  },

  /** 返回选择物品步骤 */
  onBackToSelectItem() {
    this.setData({
      step: 'select_item',
      selectedItem: null,
      startPrice: '',
      buyoutPrice: '',
      enableBuyout: false
    })
  },

  // ==================== 步骤2：设置参数 ====================

  onStartPriceInput(e: WechatMiniprogram.Input) {
    this.setData({ startPrice: e.detail.value })
  },

  onMinBidIncrementInput(e: WechatMiniprogram.Input) {
    this.setData({ minBidIncrement: e.detail.value })
  },

  onBuyoutPriceInput(e: WechatMiniprogram.Input) {
    this.setData({ buyoutPrice: e.detail.value })
  },

  onToggleBuyout() {
    this.setData({
      enableBuyout: !this.data.enableBuyout,
      buyoutPrice: ''
    })
  },

  onCurrencyChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ selectedCurrencyIndex: Number(e.detail.value) })
  },

  onStartTimeTypeChange(e: WechatMiniprogram.TouchEvent) {
    this.setData({ startTimeType: e.currentTarget.dataset.type })
  },

  onDurationChange(e: WechatMiniprogram.Input) {
    this.setData({ durationHours: e.detail.value })
  },

  onCustomStartDateChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ customStartDate: e.detail.value as string })
  },

  onCustomStartTimeChange(e: WechatMiniprogram.PickerChange) {
    this.setData({ customStartTime: e.detail.value as string })
  },

  /** 提交创建拍卖 */
  async onSubmitAuction() {
    const {
      selectedItem,
      startPrice,
      minBidIncrement,
      buyoutPrice,
      enableBuyout,
      currencies,
      selectedCurrencyIndex,
      startTimeType,
      customStartDate,
      customStartTime,
      durationHours,
      submitting
    } = this.data

    if (submitting) {
      return
    }

    if (!selectedItem) {
      AuctionCreateWechat.showToast('请选择拍卖物品', 'none')
      return
    }

    const startPriceNum = parseInt(startPrice, 10)
    if (isNaN(startPriceNum) || startPriceNum <= 0) {
      AuctionCreateWechat.showToast('起拍价必须大于0', 'none')
      return
    }

    const minBidIncrementNum = parseInt(minBidIncrement, 10) || 10
    if (minBidIncrementNum <= 0) {
      AuctionCreateWechat.showToast('最小加价幅度必须大于0', 'none')
      return
    }

    let buyoutPriceNum: number | null = null
    if (enableBuyout) {
      buyoutPriceNum = parseInt(buyoutPrice, 10)
      if (isNaN(buyoutPriceNum) || buyoutPriceNum <= 0) {
        AuctionCreateWechat.showToast('一口价必须大于0', 'none')
        return
      }
      if (buyoutPriceNum <= startPriceNum) {
        AuctionCreateWechat.showToast('一口价必须大于起拍价', 'none')
        return
      }
    }

    const durationNum = parseInt(durationHours, 10) || 24
    if (durationNum < MIN_DURATION_HOURS) {
      AuctionCreateWechat.showToast(`拍卖时长不能少于${MIN_DURATION_HOURS}小时`, 'none')
      return
    }

    let startTime: Date
    if (startTimeType === 'now') {
      startTime = new Date()
    } else {
      if (!customStartDate || !customStartTime) {
        AuctionCreateWechat.showToast('请选择拍卖开始时间', 'none')
        return
      }
      startTime = new Date(`${customStartDate}T${customStartTime}:00+08:00`)
      if (startTime.getTime() <= Date.now()) {
        AuctionCreateWechat.showToast('开始时间必须晚于当前时间', 'none')
        return
      }
    }

    const endTime = new Date(startTime.getTime() + durationNum * 3600000)

    const priceAssetCode =
      currencies.length > 0 ? currencies[selectedCurrencyIndex]?.asset_code || 'DIAMOND' : 'DIAMOND'

    const confirmResult = await new Promise<boolean>(resolve => {
      wx.showModal({
        title: '确认发起拍卖',
        content: `物品：${selectedItem._displayName}\n起拍价：${startPriceNum} ${priceAssetCode}\n时长：${durationNum}小时${buyoutPriceNum ? `\n一口价：${buyoutPriceNum} ${priceAssetCode}` : ''}`,
        confirmText: '确认发起',
        confirmColor: '#FF6B35',
        success: res => resolve(res.confirm)
      })
    })

    if (!confirmResult) {
      return
    }

    this.setData({ submitting: true })

    try {
      const params: any = {
        item_id: selectedItem.item_id,
        start_price: startPriceNum,
        price_asset_code: priceAssetCode,
        min_bid_increment: minBidIncrementNum,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString()
      }

      if (buyoutPriceNum) {
        params.buyout_price = buyoutPriceNum
      }

      const result = await API.createAuction(params)

      if (result.success) {
        AuctionCreateWechat.showToast('拍卖创建成功！', 'success')
        setTimeout(() => {
          wx.redirectTo({
            url: '/packageTrade/trade/my-auctions/my-auctions'
          })
        }, 1500)
      } else {
        this.setData({ submitting: false })
        AuctionCreateWechat.showToast(result.message || '创建拍卖失败', 'none')
      }
    } catch (error: any) {
      auctionCreateLog.error('创建拍卖失败', error)
      this.setData({ submitting: false })
      AuctionCreateWechat.showToast('网络错误，请稍后重试', 'none')
    }
  }
})
