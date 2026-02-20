/**
 * 商品货架组件 — 对标 lottery-activity 万能抽奖组件
 *
 * 职责：
 *   1. 接收 Page 壳下传的 properties（积分、主题、空间、刷新令牌）
 *   2. 管理空间切换（幸运/臻选）、臻选解锁状态
 *   3. 通过 CSS 变量注入主题（style="{{shelfThemeStyle}}"）
 *   4. 通过 selectComponent 驱动子组件刷新
 *   5. 通过 triggerEvent 通知 Page 壳（兑换成功、积分变动、认证错误）
 *
 * 决策D10: 使用 Behavior 替代 spread handler
 * 决策D12: 子组件自行管理筛选/分页状态，shelf 仅保留 ~29 字段
 * 决策D13: 使用 hidden 替代 wx:if，组件始终存在
 *
 * @file packageExchange/exchange-shelf/exchange-shelf.ts
 * @version 1.0.0
 * @since 2026-02-21
 */

const { ExchangeConfig, Logger, API: shelfAPI } = require('../../utils/index')
const { enrichProductDisplayFields } = require('../utils/product-display')
const { getExchangeThemeStyle } = require('../themes/exchange-themes')
const shopBehavior = require('./handlers/shop-behavior')

const shelfLog = Logger.createLogger('exchange-shelf')

Component({
  behaviors: [shopBehavior],

  properties: {
    /** 可用积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 冻结积分 */
    frozenPoints: { type: Number, value: 0 },
    /** 当前视觉主题标识 'A'|'B'|'C'|'D'|'E' */
    theme: { type: String, value: 'E' },
    /** 增强效果开关配置 */
    effects: { type: Object, value: {} },
    /** 视图模式 'grid'|'list' */
    viewMode: { type: String, value: 'grid' },
    /** 当前空间标识 'lucky'|'premium' */
    spaceId: { type: String, value: 'lucky' },
    /** 刷新令牌（WebSocket 事件驱动，值变化触发子组件刷新） */
    refreshToken: { type: Number, value: 0 },
    /** 组件是否激活（hidden 模式下判断当前 Tab） */
    active: { type: Boolean, value: true }
  },

  data: {
    /** CSS 变量主题样式字符串（注入到组件根元素 style） */
    shelfThemeStyle: '',

    /** 空间配置列表（后端 exchange_page 配置下发） */
    spaceList: [] as any[],
    /** 当前空间标识 */
    currentSpace: 'lucky',
    /** 加载状态 */
    loading: true,

    /** 臻选空间解锁状态（后端 premium-status API 返回） */
    premiumUnlocked: false,
    premiumRemainingHours: 0,
    premiumIsValid: false,
    premiumTotalUnlockCount: 0,
    premiumCanUnlock: false,
    premiumIsExpired: false,
    premiumConditions: null as any,
    premiumUnlockCost: 0,
    premiumValidityHours: 24,

    /** 兑换确认弹窗（两个空间共用） */
    showShopConfirm: false,
    selectedShopProduct: null as any,
    shopExchangeQuantity: 1,
    shopExchanging: false,
    showShopResult: false,
    shopResultData: null as any,

    /** 筛选配置（后端下发，通过 property 传给子组件 exchange-filter） */
    luckyBasicFilters: [] as any[],
    categoryOptions: [] as any[],
    costRangeOptions: [] as any[],
    stockStatusOptions: [] as any[],
    sortByOptions: [] as any[],

    /** 空间统计数据（后端 space-stats API 返回） */
    luckySpaceStats: { new_count: 0, avg_discount: 0, flash_deals: 0 },
    premiumSpaceStats: { hot_count: 0, avg_rating: 0, trending_count: 0 },

    /** 布局参数 */
    containerWidth: 375,
    columnWidth: 0
  },

  lifetimes: {
    attached() {
      this._initShelf()
    }
  },

  observers: {
    /** 主题变化时重新生成 CSS 变量样式字符串 */
    theme(themeName: string) {
      this.setData({ shelfThemeStyle: getExchangeThemeStyle(themeName) })
    },
    /** 空间标识变化时同步内部状态 */
    spaceId(newSpace: string) {
      if (newSpace && newSpace !== this.data.currentSpace) {
        this.setData({ currentSpace: newSpace })
      }
    },
    /** 刷新令牌变化时通知子组件刷新 */
    refreshToken(val: number) {
      if (val > 0) {
        this._refreshCurrentSpace()
      }
    }
  },

  methods: {
    /** 初始化货架（加载配置 + 设置主题 + 初始化子组件） */
    async _initShelf() {
      this.setData({
        shelfThemeStyle: getExchangeThemeStyle(this.properties.theme)
      })

      try {
        const config = await ExchangeConfig.ExchangeConfigCache.getConfig()
        const shopFilters = config.shop_filters

        this.setData({
          spaceList: config.spaces
            .filter((s: any) => s.enabled)
            .sort((a: any, b: any) => a.sort_order - b.sort_order),
          luckyBasicFilters: shopFilters.basic_filters || [],
          categoryOptions: shopFilters.categories || [],
          costRangeOptions: shopFilters.cost_ranges || [],
          stockStatusOptions: shopFilters.stock_statuses || [],
          sortByOptions: shopFilters.sort_options || [],
          loading: false
        })

        this.initLayoutParams()
        this.checkPremiumUnlockStatus()
        shelfLog.info('货架初始化完成')
      } catch (error) {
        shelfLog.error('货架初始化失败:', error)
        this.setData({ loading: false })
      }
    },

    /** 刷新当前空间子组件（WebSocket 事件驱动） */
    _refreshCurrentSpace() {
      const luckySpace = this.selectComponent('#lucky-space')
      const premiumSpace = this.selectComponent('#premium-space')
      const bidPanel = this.selectComponent('#bid-panel')
      if (this.data.currentSpace === 'lucky' && luckySpace) {
        luckySpace.refresh()
      }
      if (this.data.currentSpace === 'premium' && premiumSpace) {
        premiumSpace.refresh()
      }
      if (bidPanel) {
        bidPanel.refresh()
      }
    },

    /** enrichProductDisplayFields 纯函数引用（子组件可通过 selectComponent 调用） */
    enrichProductDisplayFields,

    /**
     * 商品点击事件（打开兑换确认弹窗）
     * 后端 DataSanitizer 脱敏: exchange_item_id → id（string）
     */
    onProductTap(e: any) {
      const product = e.detail ? e.detail.product : e.currentTarget.dataset.product
      shelfLog.info('点击商品:', product)

      if (!product || !product.id) {
        shelfLog.error('商品数据缺少 id（DataSanitizer 脱敏后的主键），无法兑换')
        wx.showToast({ title: '商品数据异常，请刷新页面重试', icon: 'none' })
        return
      }

      this.setData({
        selectedShopProduct: product,
        showShopConfirm: true,
        shopExchangeQuantity: 1,
        shopExchanging: false
      })
    },

    /** 取消商品兑换操作 */
    onCancelShopExchange() {
      shelfLog.info('取消商品兑换操作')
      this.setData({
        showShopConfirm: false,
        selectedShopProduct: null,
        shopExchangeQuantity: 1
      })
    },

    /**
     * 确认商品兑换操作
     * 后端API: POST /api/v4/backpack/exchange
     * 请求体: { exchange_item_id: number, quantity: number }
     * 请求头: Idempotency-Key（幂等键，防止重复提交）
     */
    async onConfirmShopExchange() {
      const { selectedShopProduct, shopExchangeQuantity, shopExchanging } = this.data
      const totalPoints = this.properties.pointsBalance

      if (!selectedShopProduct) {
        shelfLog.error('未选择兑换商品')
        wx.showToast({ title: '请选择要兑换的商品', icon: 'none' })
        return
      }

      if (shopExchanging) {
        shelfLog.info('正在兑换中，请勿重复操作')
        return
      }

      const shopProductId = selectedShopProduct.id
      const costAmount = Number(selectedShopProduct.cost_amount) || 0
      const costAssetCode = selectedShopProduct.cost_asset_code || 'POINTS'

      if (!shopProductId) {
        shelfLog.error('商品ID无效:', selectedShopProduct)
        wx.showToast({ title: '商品数据异常，请重试', icon: 'none' })
        return
      }

      if (
        costAssetCode === 'POINTS' &&
        costAmount > 0 &&
        totalPoints < costAmount * shopExchangeQuantity
      ) {
        wx.showToast({ title: '积分不足，无法兑换', icon: 'none' })
        return
      }

      this.setData({ shopExchanging: true })

      try {
        const exchangeItemIdNum = Number(shopProductId)
        shelfLog.info('执行商品兑换:', {
          exchangeItemId: exchangeItemIdNum,
          quantity: shopExchangeQuantity
        })
        const response = await shelfAPI.exchangeProduct(exchangeItemIdNum, shopExchangeQuantity)

        if (response && response.success && response.data) {
          shelfLog.info('兑换成功:', response.data)

          this.setData({
            showShopConfirm: false,
            selectedShopProduct: null,
            shopExchanging: false,
            showShopResult: true,
            shopResultData: {
              product: selectedShopProduct,
              orderNo: response.data.order_no || '',
              payAssetCode: response.data.pay_asset_code || costAssetCode,
              payAmount: response.data.pay_amount || costAmount,
              quantity: response.data.quantity || shopExchangeQuantity,
              exchangeTime: response.data.exchange_time || ''
            }
          })

          this.triggerEvent('exchange', { orderData: response.data })
          this.triggerEvent('pointsupdate')

          setTimeout(() => {
            this.refreshMarketData()
          }, 1000)
        } else {
          throw new Error((response && response.message) || '兑换失败')
        }
      } catch (error: any) {
        shelfLog.error('商品兑换失败:', error)
        this.setData({ shopExchanging: false })

        let errorMessage = '兑换失败，请重试'
        if (error.statusCode === 401) {
          errorMessage = '登录状态异常，请重新登录'
          this.triggerEvent('autherror')
          return
        } else if (error.statusCode === 400) {
          errorMessage = error.message || '请求参数错误'
        } else if (error.statusCode === 409) {
          errorMessage = error.message || '库存不足或余额不足'
        } else if (error.message) {
          errorMessage = error.message
        }

        wx.showModal({
          title: '兑换失败',
          content: errorMessage,
          showCancel: false,
          confirmText: '我知道了'
        })
      }
    },

    /** 商品兑换数量增减 */
    onShopQuantityChange(e: any) {
      const action = e.currentTarget.dataset.action
      let { shopExchangeQuantity } = this.data
      if (action === 'increase') {
        shopExchangeQuantity = Math.min(shopExchangeQuantity + 1, 99)
      } else if (action === 'decrease') {
        shopExchangeQuantity = Math.max(shopExchangeQuantity - 1, 1)
      }
      this.setData({ shopExchangeQuantity })
    },

    /** 关闭商品兑换结果弹窗 */
    onCloseShopResult() {
      shelfLog.info('关闭商品兑换结果弹窗')
      this.setData({ showShopResult: false, shopResultData: null })
    },

    /**
     * 卡片按压涟漪效果
     * 仅当启用 ripple 效果时生效
     */
    onCardTouchStart(e: any) {
      if (!this.properties.effects || !(this.properties.effects as any).ripple) {
        return
      }

      const touch = e.touches[0]
      if (!touch) {
        return
      }

      const cardIndex = e.currentTarget.dataset.cardIndex
      const tabSource = e.currentTarget.dataset.tab || this.data.currentSpace

      const query = wx.createSelectorQuery().in(this)
      query
        .select(`[data-card-index="${cardIndex}"][data-tab="${tabSource}"]`)
        .boundingClientRect((rect: any) => {
          if (!rect) {
            return
          }
          const rippleX = touch.clientX - rect.left
          const rippleY = touch.clientY - rect.top

          const subComponent =
            tabSource === 'lucky'
              ? this.selectComponent('#lucky-space')
              : this.selectComponent('#premium-space')

          if (subComponent && typeof subComponent.applyRipple === 'function') {
            subComponent.applyRipple(cardIndex, rippleX, rippleY)
          }
        })
        .exec()
    },

    /** 视图模式切换（组件内联按钮 → triggerEvent 通知 Page 壳） */
    onToggleViewMode(e: any) {
      const targetMode = e.currentTarget.dataset.mode
      if (!targetMode || targetMode === this.properties.viewMode) {
        return
      }
      this.triggerEvent('viewmodechange', { mode: targetMode })
    },

    /** 竞价完成事件（bid-panel 子组件触发） */
    onBidComplete(_e: any) {
      shelfLog.info('竞价完成，通知 Page 壳刷新积分')
      this.triggerEvent('pointsupdate')
    },

    /** 设置错误状态 */
    setErrorState(errorMessage: string, _errorDetail: string) {
      shelfLog.info('设置错误状态:', errorMessage)
      this.setData({ loading: false })
      wx.showToast({ title: errorMessage, icon: 'none', duration: 3000 })
    },

    /** 对外暴露的刷新方法 */
    refresh() {
      this._refreshCurrentSpace()
    }
  }
})

export {}
