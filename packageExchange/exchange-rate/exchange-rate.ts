/**
 * 汇率兑换组件 — 固定汇率资产兑换
 *
 * 职责：
 *   1. 展示所有可用汇率规则（exchange_rates 表活跃规则）
 *   2. 用户选择币对后输入数量，实时预览兑换结果
 *   3. 执行兑换（POST /api/v4/market/exchange-rates/convert）
 *   4. 展示每日限额使用情况
 *   5. 通过 triggerEvent 通知 Page 壳刷新积分余额
 *
 * 后端API:
 *   GET  /api/v4/market/exchange-rates         → 汇率列表
 *   POST /api/v4/market/exchange-rates/preview  → 预览兑换
 *   POST /api/v4/market/exchange-rates/convert  → 执行兑换
 *
 * @file packageExchange/exchange-rate/exchange-rate.ts
 * @version 5.2.0
 * @since 2026-02-24
 */

const { API, Logger: ExRateLogger, ImageHelper: ExRateImageHelper } = require('../../utils/index')
const exchangeRateLog = ExRateLogger.createLogger('exchange-rate')

Component({
  properties: {
    /** 可用积分余额（DIAMOND，Page壳下传） */
    pointsBalance: { type: Number, value: 0 },
    /** 刷新令牌（值变化触发重新加载汇率列表） */
    refreshToken: { type: Number, value: 0 },
    /** 组件是否激活（Tab切换控制） */
    active: { type: Boolean, value: false }
  },

  data: {
    /** 页面加载状态 */
    pageLoading: true,
    /** 所有可用汇率规则列表（后端 exchange_rates 表） */
    rateList: [] as any[],

    /** 当前选中的汇率规则（用户点击某条汇率后） */
    selectedRate: null as any,
    /** 用户输入的兑换数量 */
    inputAmount: '',
    /** 预览结果（调用 preview API 返回） */
    previewResult: null as any,
    /** 预览加载中 */
    previewing: false,

    /** 兑换操作进行中（防止重复提交） */
    converting: false,
    /** 兑换成功结果弹窗数据 */
    convertResult: null as any,
    /** 是否显示兑换成功弹窗 */
    showResultPopup: false,

    /** 错误提示 */
    errorMessage: ''
  },

  observers: {
    /** refreshToken 变化时重新加载汇率列表 */
    refreshToken(_newVal: number) {
      if (this.data.active) {
        this._loadExchangeRates()
      }
    },
    /** 激活时加载数据 */
    active(isActive: boolean) {
      if (isActive && this.data.rateList.length === 0) {
        this._loadExchangeRates()
      }
    }
  },

  lifetimes: {
    attached() {
      exchangeRateLog.info('汇率兑换组件挂载')
      if (this.data.active) {
        this._loadExchangeRates()
      }
    }
  },

  methods: {
    /**
     * 加载所有可用汇率规则
     * 后端: GET /api/v4/market/exchange-rates
     */
    async _loadExchangeRates() {
      this.setData({ pageLoading: true, errorMessage: '' })

      try {
        const response = await API.getExchangeRates()
        if (!response || !response.success) {
          const apiMessage = (response && response.message) || '获取汇率列表失败'
          exchangeRateLog.warn('汇率列表API返回非成功:', apiMessage)
          this.setData({ pageLoading: false, rateList: [], errorMessage: apiMessage })
          return
        }

        const rawRates: any[] = response.data || []
        /* 为每条汇率规则补充前端展示字段（图标、颜色等） */
        const enrichedRates = rawRates.map((rate: any) => ({
          ...rate,
          fromIcon: ExRateImageHelper.getMaterialIconPath(rate.from_asset_code),
          toIcon: ExRateImageHelper.getMaterialIconPath(rate.to_asset_code),
          fromDisplayName: ExRateImageHelper.getAssetDisplayName(rate.from_asset_code),
          toDisplayName: ExRateImageHelper.getAssetDisplayName(rate.to_asset_code),
          rateText: `${rate.rate_denominator} : ${rate.rate_numerator}`,
          feePercent: rate.fee_rate ? `${(rate.fee_rate * 100).toFixed(1)}%` : '0%'
        }))

        this.setData({ rateList: enrichedRates, pageLoading: false })
        exchangeRateLog.info(`汇率列表加载成功: ${enrichedRates.length} 条规则`)
      } catch (error: any) {
        exchangeRateLog.error('加载汇率列表异常:', error)
        this.setData({
          pageLoading: false,
          rateList: [],
          errorMessage: error.message || '网络异常，请稍后重试'
        })
      }
    },

    /** 用户点击某条汇率 → 展开兑换面板 */
    onSelectRate(e: any) {
      const rateId = e.currentTarget.dataset.rateId
      const targetRate = this.data.rateList.find((r: any) => r.exchange_rate_id === rateId)

      if (!targetRate) {
        return
      }

      /* 如果点击同一条，切换折叠状态 */
      if (this.data.selectedRate && this.data.selectedRate.exchange_rate_id === rateId) {
        this.setData({
          selectedRate: null,
          inputAmount: '',
          previewResult: null,
          errorMessage: ''
        })
        return
      }

      this.setData({
        selectedRate: targetRate,
        inputAmount: '',
        previewResult: null,
        errorMessage: ''
      })
    },

    /** 用户输入兑换数量 */
    onAmountInput(e: any) {
      const rawValue = e.detail.value || ''
      /* 仅允许正整数（资产数量为 BIGINT 整数） */
      const sanitizedValue = rawValue.replace(/[^0-9]/g, '')
      this.setData({ inputAmount: sanitizedValue, errorMessage: '' })

      /* 输入后自动预览（防抖 500ms） */
      if (sanitizedValue && parseInt(sanitizedValue, 10) > 0) {
        this._debouncePreview()
      } else {
        this.setData({ previewResult: null })
      }
    },

    /** 防抖预览（避免每次按键都调 API） */
    _debouncePreview() {
      if ((this as any)._previewTimer) {
        clearTimeout((this as any)._previewTimer)
      }
      ;(this as any)._previewTimer = setTimeout(() => {
        this._doPreview()
      }, 500)
    },

    /**
     * 调用预览API
     * 后端: POST /api/v4/market/exchange-rates/preview
     */
    async _doPreview() {
      const currentRate = this.data.selectedRate
      const amountStr = this.data.inputAmount
      if (!currentRate || !amountStr) {
        return
      }

      const fromAmount = parseInt(amountStr, 10)
      if (isNaN(fromAmount) || fromAmount <= 0) {
        this.setData({ previewResult: null, errorMessage: '请输入有效的兑换数量' })
        return
      }

      /* 客户端前置校验：最小/最大数量 */
      if (currentRate.min_from_amount && fromAmount < currentRate.min_from_amount) {
        this.setData({
          previewResult: null,
          errorMessage: `最小兑换数量为 ${currentRate.min_from_amount}`
        })
        return
      }
      if (currentRate.max_from_amount && fromAmount > currentRate.max_from_amount) {
        this.setData({
          previewResult: null,
          errorMessage: `最大兑换数量为 ${currentRate.max_from_amount}`
        })
        return
      }

      this.setData({ previewing: true })

      try {
        const response = await API.previewExchangeRate({
          from_asset_code: currentRate.from_asset_code,
          to_asset_code: currentRate.to_asset_code,
          from_amount: fromAmount
        })

        if (response && response.success && response.data) {
          this.setData({
            previewResult: response.data,
            previewing: false,
            errorMessage: response.data.sufficient_balance ? '' : '余额不足'
          })
        } else {
          const apiMessage = (response && response.message) || '预览失败'
          this.setData({ previewResult: null, previewing: false, errorMessage: apiMessage })
        }
      } catch (error: any) {
        exchangeRateLog.error('预览兑换异常:', error)
        this.setData({
          previewResult: null,
          previewing: false,
          errorMessage: error.message || '预览失败'
        })
      }
    },

    /** 用户点击"确认兑换"按钮 */
    async onConfirmConvert() {
      const currentRate = this.data.selectedRate
      const preview = this.data.previewResult
      if (!currentRate || !preview) {
        return
      }

      if (this.data.converting) {
        return
      }

      if (!preview.sufficient_balance) {
        wx.showToast({ title: '余额不足', icon: 'none' })
        return
      }

      /* 二次确认弹窗 */
      const confirmResult = await new Promise<boolean>(resolve => {
        wx.showModal({
          title: '确认兑换',
          content: `消耗 ${preview.from_amount} ${currentRate.from_asset_code}\n获得 ${preview.net_to_amount} ${currentRate.to_asset_code}\n${preview.fee_amount > 0 ? `手续费: ${preview.fee_amount}` : ''}`,
          confirmText: '确认兑换',
          cancelText: '取消',
          success: (res: any) => resolve(res.confirm)
        })
      })

      if (!confirmResult) {
        return
      }

      this.setData({ converting: true })

      try {
        const response = await API.executeExchangeRate({
          from_asset_code: currentRate.from_asset_code,
          to_asset_code: currentRate.to_asset_code,
          from_amount: preview.from_amount
        })

        if (response && response.success && response.data) {
          exchangeRateLog.info('兑换成功:', response.data)
          this.setData({
            converting: false,
            convertResult: response.data,
            showResultPopup: true,
            inputAmount: '',
            previewResult: null
          })

          /* 通知 Page 壳刷新积分余额 */
          this.triggerEvent('exchangeratesuccess', response.data)
        } else {
          const apiMessage = (response && response.message) || '兑换失败'
          wx.showToast({ title: apiMessage, icon: 'none', duration: 2500 })
          this.setData({ converting: false })
        }
      } catch (error: any) {
        exchangeRateLog.error('兑换异常:', error)

        /* 根据后端错误码提供针对性提示 */
        let errorTip = error.message || '兑换失败，请稍后重试'
        if (error.code === 'DAILY_LIMIT_EXCEEDED') {
          errorTip = '今日兑换额度已用完，明天再来'
        } else if (error.code === 'AMOUNT_BELOW_MINIMUM') {
          errorTip = `兑换数量低于最小限制`
        } else if (error.code === 'RATE_NOT_FOUND') {
          errorTip = '该兑换暂未开放'
        }

        wx.showToast({ title: errorTip, icon: 'none', duration: 2500 })
        this.setData({ converting: false })
      }
    },

    /** 关闭兑换成功弹窗 */
    onCloseResultPopup() {
      this.setData({ showResultPopup: false, convertResult: null })
    },

    /** 快捷填入最大可兑换数量 */
    onFillMaxAmount() {
      const currentRate = this.data.selectedRate
      if (!currentRate) {
        return
      }

      /* 根据预览返回的余额确定最大值，否则用 properties 积分余额做粗估 */
      const preview = this.data.previewResult
      const userBalance = preview ? preview.user_balance : this.data.pointsBalance

      let maxAmount = userBalance
      if (currentRate.max_from_amount && currentRate.max_from_amount < maxAmount) {
        maxAmount = currentRate.max_from_amount
      }

      if (maxAmount > 0) {
        this.setData({ inputAmount: String(maxAmount) })
        this._debouncePreview()
      }
    },

    /** 手动刷新汇率列表 */
    onRefreshRates() {
      this._loadExchangeRates()
    },

    /** 跳转到交易记录页面（查看兑换历史） */
    onViewExchangeHistory() {
      wx.navigateTo({
        url: '/packageTrade/records/trade-upload-records/trade-upload-records?source=exchange_rate'
      })
    }
  }
})
