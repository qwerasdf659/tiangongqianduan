/**
 * 资产转换组件 — 统一资产转换规则（合成/分解/兑换）
 *
 * 职责：
 *   1. 展示所有可用转换规则（asset_conversion_rules 表活跃规则）
 *   2. 用户选择规则后输入数量，实时预览转换结果
 *   3. 执行转换（POST /api/v4/assets/conversion/convert）
 *   4. 展示每日限额使用情况
 *   5. 通过 triggerEvent 通知 Page 壳刷新积分余额
 *
 * 后端API（统一资产转换规则，2026-04-05 合并 exchange_rates + material_conversion_rules）:
 *   GET  /api/v4/assets/conversion/rules    → 转换规则列表
 *   POST /api/v4/assets/conversion/preview  → 预览转换
 *   POST /api/v4/assets/conversion/convert  → 执行转换（Header: Idempotency-Key）
 *
 * 注意：后端 DECIMAL/BIGINT 字段返回字符串，前端使用时需 Number() 转换
 *
 * @file packageExchange/exchange-rate/exchange-rate.ts
 * @version 7.0.0
 * @since 2026-04-07（资产转换规则统一: /assets/rates → /assets/conversion）
 */

const { API, Logger: ExRateLogger, ImageHelper: ExRateImageHelper } = require('../../utils/index')
const exchangeRateLog = ExRateLogger.createLogger('exchange-rate')

Component({
  properties: {
    /** 可用积分余额（star_stone，Page壳下传） */
    pointsBalance: { type: Number, value: 0 },
    /** 刷新令牌（值变化触发重新加载汇率列表） */
    refreshToken: { type: Number, value: 0 },
    /** 组件是否激活（Tab切换控制） */
    active: { type: Boolean, value: false },
    /** 指定源币种（外部传入时自动定位到对应汇率规则） */
    fromAssetCode: { type: String, value: '' },
    /** 指定目标币种（外部传入时自动定位到对应汇率规则） */
    toAssetCode: { type: String, value: '' }
  },

  data: {
    /** 页面加载状态 */
    pageLoading: true,
    /** 所有可用转换规则列表（后端 asset_conversion_rules 表） */
    rateList: [] as any[],

    /** 当前选中的转换规则（用户点击某条规则后） */
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
    /** refreshToken 变化时重新加载转换规则列表 */
    refreshToken(_newVal: number) {
      if (this.data.active) {
        this._loadConversionRules()
      }
    },
    /** 激活时加载数据 */
    active(isActive: boolean) {
      if (isActive && this.data.rateList.length === 0) {
        this._loadConversionRules()
      }
    }
  },

  lifetimes: {
    attached() {
      exchangeRateLog.info('资产转换组件挂载')
      if (this.data.active) {
        this._loadConversionRules()
      }
    }
  },

  methods: {
    /**
     * 加载所有可用转换规则
     * 后端: GET /api/v4/assets/conversion/rules
     * 注意: 后端 DECIMAL/BIGINT 字段返回字符串，需 Number() 转换后使用
     */
    async _loadConversionRules() {
      this.setData({ pageLoading: true, errorMessage: '' })

      try {
        const response = await API.getConversionRules()
        if (!response || !response.success) {
          const apiMessage = (response && response.message) || '获取转换规则列表失败'
          exchangeRateLog.warn('转换规则API返回非成功:', apiMessage)
          this.setData({ pageLoading: false, rateList: [], errorMessage: apiMessage })
          return
        }

        const rawRules: any[] = response.data || []
        /* 为每条转换规则补充前端展示字段（图标、Number转换等） */
        const enrichedRules = rawRules.map((rule: any) => ({
          ...rule,
          /* 后端 DECIMAL/BIGINT 字段返回字符串，转为数字供前端计算和展示 */
          rate_numerator: Number(rule.rate_numerator),
          rate_denominator: Number(rule.rate_denominator),
          min_from_amount: Number(rule.min_from_amount),
          max_from_amount: rule.max_from_amount ? Number(rule.max_from_amount) : null,
          daily_user_limit: rule.daily_user_limit ? Number(rule.daily_user_limit) : null,
          fee_rate: Number(rule.fee_rate),
          fee_min_amount: Number(rule.fee_min_amount),
          /* 前端展示字段 */
          fromIcon: ExRateImageHelper.getMaterialIconPath(rule.from_asset_code),
          toIcon: ExRateImageHelper.getMaterialIconPath(rule.to_asset_code),
          /* 优先使用后端返回的中文名，降级到 ImageHelper 本地映射 */
          fromDisplayName:
            rule.from_display_name || ExRateImageHelper.getAssetDisplayName(rule.from_asset_code),
          toDisplayName:
            rule.to_display_name || ExRateImageHelper.getAssetDisplayName(rule.to_asset_code),
          /* 转换比例展示文案: {rate_denominator}个{from} = {rate_numerator}个{to} */
          rateText: `${rule.rate_denominator} : ${rule.rate_numerator}`,
          feePercent: Number(rule.fee_rate) ? `${(Number(rule.fee_rate) * 100).toFixed(1)}%` : '0%'
        }))

        this.setData({ rateList: enrichedRules, pageLoading: false })
        exchangeRateLog.info(`转换规则加载成功: ${enrichedRules.length} 条规则`)

        /* 外部传入指定币对时，自动定位并展开对应转换面板 */
        const targetFrom = this.properties.fromAssetCode
        const targetTo = this.properties.toAssetCode
        if (targetFrom && enrichedRules.length > 0) {
          const matchedRule = enrichedRules.find(
            (r: any) =>
              r.from_asset_code === targetFrom && (!targetTo || r.to_asset_code === targetTo)
          )
          if (matchedRule) {
            this.setData({ selectedRate: matchedRule })
            exchangeRateLog.info('自动定位到指定币对:', targetFrom, '→', targetTo || '(任意)')
          }
        }
      } catch (error: any) {
        exchangeRateLog.error('加载转换规则异常:', error)
        this.setData({
          pageLoading: false,
          rateList: [],
          errorMessage: error.message || '网络异常，请稍后重试'
        })
      }
    },

    /** 用户点击某条转换规则 → 展开转换面板 */
    onSelectRate(e: any) {
      const ruleId = e.currentTarget.dataset.rateId
      const targetRule = this.data.rateList.find((r: any) => r.conversion_rule_id === ruleId)

      if (!targetRule) {
        return
      }

      /* 如果点击同一条，切换折叠状态 */
      if (this.data.selectedRate && this.data.selectedRate.conversion_rule_id === ruleId) {
        this.setData({
          selectedRate: null,
          inputAmount: '',
          previewResult: null,
          errorMessage: ''
        })
        return
      }

      this.setData({
        selectedRate: targetRule,
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
     * 后端: POST /api/v4/assets/conversion/preview
     * 响应字段变更: sufficient_balance → sufficient, gross_to_amount → gross_amount, net_to_amount → net_amount
     */
    async _doPreview() {
      const currentRate = this.data.selectedRate
      const amountStr = this.data.inputAmount
      if (!currentRate || !amountStr) {
        return
      }

      const fromAmount = parseInt(amountStr, 10)
      if (isNaN(fromAmount) || fromAmount <= 0) {
        this.setData({ previewResult: null, errorMessage: '请输入有效的转换数量' })
        return
      }

      /* 客户端前置校验：最小/最大数量 */
      if (currentRate.min_from_amount && fromAmount < currentRate.min_from_amount) {
        this.setData({
          previewResult: null,
          errorMessage: `最小转换数量为 ${currentRate.min_from_amount}`
        })
        return
      }
      if (currentRate.max_from_amount && fromAmount > currentRate.max_from_amount) {
        this.setData({
          previewResult: null,
          errorMessage: `最大转换数量为 ${currentRate.max_from_amount}`
        })
        return
      }

      this.setData({ previewing: true })

      try {
        const response = await API.previewConversion({
          from_asset_code: currentRate.from_asset_code,
          to_asset_code: currentRate.to_asset_code,
          from_amount: fromAmount
        })

        if (response && response.success && response.data) {
          this.setData({
            previewResult: response.data,
            previewing: false,
            /* 后端新字段名: sufficient（旧 sufficient_balance） */
            errorMessage: response.data.sufficient ? '' : '余额不足'
          })
        } else {
          const apiMessage = (response && response.message) || '预览失败'
          this.setData({ previewResult: null, previewing: false, errorMessage: apiMessage })
        }
      } catch (error: any) {
        exchangeRateLog.error('预览转换异常:', error)
        this.setData({
          previewResult: null,
          previewing: false,
          errorMessage: error.message || '预览失败'
        })
      }
    },

    /** 用户点击"确认转换"按钮 */
    async onConfirmConvert() {
      const currentRate = this.data.selectedRate
      const preview = this.data.previewResult
      if (!currentRate || !preview) {
        return
      }

      if (this.data.converting) {
        return
      }

      /* 后端新字段名: sufficient（旧 sufficient_balance） */
      if (!preview.sufficient) {
        wx.showToast({ title: '余额不足', icon: 'none' })
        return
      }

      /* 二次确认弹窗 — 响应字段: net_amount（旧 net_to_amount） */
      const confirmResult = await new Promise<boolean>(resolve => {
        wx.showModal({
          title: '确认转换',
          content: `消耗 ${preview.from_amount} ${currentRate.fromDisplayName}\n获得 ${preview.net_amount} ${currentRate.toDisplayName}\n${preview.fee_amount > 0 ? `手续费: ${preview.fee_amount}` : ''}`,
          confirmText: '确认转换',
          cancelText: '取消',
          success: (res: any) => resolve(res.confirm)
        })
      })

      if (!confirmResult) {
        return
      }

      this.setData({ converting: true })

      try {
        const response = await API.executeConversion({
          from_asset_code: currentRate.from_asset_code,
          to_asset_code: currentRate.to_asset_code,
          from_amount: preview.from_amount
        })

        if (response && response.success && response.data) {
          exchangeRateLog.info('转换成功:', response.data)
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
          const apiMessage = (response && response.message) || '转换失败'
          wx.showToast({ title: apiMessage, icon: 'none', duration: 2500 })
          this.setData({ converting: false })
        }
      } catch (error: any) {
        exchangeRateLog.error('转换异常:', error)

        /* 根据后端错误码提供针对性提示 */
        let errorTip = error.message || '转换失败，请稍后重试'
        if (error.code === 'DAILY_LIMIT_EXCEEDED') {
          errorTip = '今日转换额度已用完，明天再来'
        } else if (error.code === 'AMOUNT_BELOW_MINIMUM') {
          errorTip = '转换数量低于最小限制'
        } else if (error.code === 'AMOUNT_ABOVE_MAXIMUM') {
          errorTip = '转换数量超过最大限制'
        } else if (error.code === 'INVALID_AMOUNT') {
          errorTip = '请输入有效的转换数量'
        } else if (error.code === 'RATE_NOT_FOUND') {
          errorTip = '该转换暂未开放'
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
      /* 后端新字段名: from_balance（旧 user_balance） */
      const preview = this.data.previewResult
      const userBalance = preview ? preview.from_balance : this.data.pointsBalance

      let maxAmount = userBalance
      if (currentRate.max_from_amount && currentRate.max_from_amount < maxAmount) {
        maxAmount = currentRate.max_from_amount
      }

      if (maxAmount > 0) {
        this.setData({ inputAmount: String(maxAmount) })
        this._debouncePreview()
      }
    },

    /** 手动刷新转换规则列表 */
    onRefreshRates() {
      this._loadConversionRules()
    },

    /** 跳转到交易记录页面（查看转换历史） */
    onViewExchangeHistory() {
      wx.navigateTo({
        url: '/packageTrade/records/trade-upload-records/trade-upload-records?source=asset_convert'
      })
    }
  }
})
