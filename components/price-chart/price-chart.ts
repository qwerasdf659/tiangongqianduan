/**
 * 价格走势图组件 — Canvas 2D 轻量折线图
 *
 * 零依赖：使用微信小程序 Canvas 2D API 绘制折线图
 * 不引入 echarts（400KB+），适合小程序包体积限制
 *
 * 后端API:
 *   GET /api/v4/marketplace/price/trend   → 价格走势数据点
 *   GET /api/v4/marketplace/price/summary → 价格摘要统计
 *
 * 使用方式:
 *   <price-chart asset-code="red_core_shard" title="价格走势" />
 *
 * @file components/price-chart/price-chart.ts
 * @version 5.3.0
 * @since 2026-02-24
 */

const { API: ChartAPI, Logger: ChartLogger } = require('../../utils/index')
const chartLog = ChartLogger.createLogger('price-chart')

/** 折线图颜色配置（与项目渐变色系保持一致） */
const CHART_COLORS = {
  /** 价格折线 — 品牌橙色 */
  line: '#FF6B35',
  /** 折线下方填充（实色，与 $gradient-blue-start 一致） */
  fillSolid: '#f7931e',
  /** 网格线 */
  grid: 'rgba(102, 126, 234, 0.10)',
  /** 坐标轴文字 */
  axisText: '#999999',
  /** 数据圆点 */
  dot: '#FF6B35',
  dotBorder: '#ffffff',
  /** 成交量柱体（实色 $color-primary） */
  volumeBar: '#FF6B35'
} as const

Component({
  properties: {
    /** 资产代码（如 'red_core_shard'），与 templateId 二选一 */
    assetCode: { type: String, value: '' },
    /** 物品模板ID，与 assetCode 二选一 */
    templateId: { type: Number, value: 0 },
    /** 图表标题 */
    title: { type: String, value: '价格走势' },
    /** Canvas高度（px） */
    canvasHeight: { type: Number, value: 180 }
  },

  data: {
    loading: false,
    /** 当前选中的时间周期 */
    currentPeriod: '7d',
    /** 可选周期列表（含长周期 getPriceHistory） */
    periods: [
      { value: '1d', label: '1天' },
      { value: '7d', label: '7天' },
      { value: '30d', label: '30天' },
      { value: '90d', label: '90天' }
    ] as any[],
    /** 走势数据点（后端返回） */
    dataPoints: [] as any[],
    /** 成交量走势数据（后端 GET /api/v4/marketplace/price/volume 返回） */
    volumePoints: [] as any[],
    /** 价格摘要统计 */
    summary: null as any,
    /** 当前选中的图表标签页: 'price' 价格走势 / 'volume' 成交量 */
    activeChartTab: 'price'
  },

  observers: {
    'assetCode, templateId'() {
      if (this.data.assetCode || this.data.templateId) {
        this._fetchData()
      }
    }
  },

  lifetimes: {
    attached() {
      if (this.data.assetCode || this.data.templateId) {
        this._fetchData()
      }
    }
  },

  methods: {
    /** 切换时间周期 */
    onPeriodChange(e: any) {
      const period = e.currentTarget.dataset.period
      if (period === this.data.currentPeriod) {
        return
      }
      this.setData({ currentPeriod: period })
      this._fetchData()
    },

    /** 切换图表标签页: price / volume */
    onChartTabChange(e: any) {
      const tab = e.currentTarget.dataset.tab
      if (tab === this.data.activeChartTab) {
        return
      }
      this.setData({ activeChartTab: tab })

      if (tab === 'price' && this.data.dataPoints.length > 0) {
        setTimeout(() => this._drawChart(this.data.dataPoints), 100)
      } else if (tab === 'volume' && this.data.volumePoints.length > 0) {
        setTimeout(() => this._drawVolumeChart(this.data.volumePoints), 100)
      }
    },

    /**
     * 并行获取走势数据 + 摘要数据 + 成交量数据
     * 后端API:
     *   GET /api/v4/marketplace/price/trend   → 价格走势
     *   GET /api/v4/marketplace/price/summary → 价格摘要
     *   GET /api/v4/marketplace/price/volume  → 成交量走势
     */
    async _fetchData() {
      this.setData({ loading: true })

      const queryParams: any = {}
      if (this.data.assetCode) {
        queryParams.asset_code = this.data.assetCode
      }
      if (this.data.templateId) {
        queryParams.template_id = this.data.templateId
      }

      const isLongPeriod = this.data.currentPeriod === '90d'
      const periodGranularity = this.data.currentPeriod === '1d' ? '1h' : '1d'

      try {
        /**
         * 90天周期使用 getPriceHistory（长周期分析数据）
         * 其他周期使用 getPriceTrend（短周期发现数据）
         */
        const trendPromise =
          isLongPeriod && queryParams.asset_code
            ? ChartAPI.getPriceHistory({ asset_code: queryParams.asset_code, days: 90 })
            : ChartAPI.getPriceTrend({
                ...queryParams,
                period: this.data.currentPeriod,
                granularity: periodGranularity
              })

        const [trendResponse, summaryResponse, volumeResponse] = await Promise.all([
          trendPromise,
          ChartAPI.getPriceSummary(queryParams),
          ChartAPI.getVolumeTrend({
            ...queryParams,
            period: isLongPeriod ? '90d' : this.data.currentPeriod,
            granularity: periodGranularity
          })
        ])

        const trendPoints =
          trendResponse && trendResponse.success && trendResponse.data
            ? trendResponse.data.data_points || []
            : []

        const summaryData = summaryResponse && summaryResponse.success ? summaryResponse.data : null

        const volumeDataPoints =
          volumeResponse && volumeResponse.success && volumeResponse.data
            ? volumeResponse.data.data_points || []
            : []

        this.setData({
          dataPoints: trendPoints,
          volumePoints: volumeDataPoints,
          summary: summaryData,
          loading: false
        })

        if (this.data.activeChartTab === 'price' && trendPoints.length > 0) {
          setTimeout(() => this._drawChart(trendPoints), 100)
        } else if (this.data.activeChartTab === 'volume' && volumeDataPoints.length > 0) {
          setTimeout(() => this._drawVolumeChart(volumeDataPoints), 100)
        }
      } catch (fetchError) {
        chartLog.error('获取走势数据失败:', fetchError)
        this.setData({ dataPoints: [], volumePoints: [], summary: null, loading: false })
      }
    },

    /** Canvas 2D 绘制折线图 */
    _drawChart(points: any[]) {
      const query = this.createSelectorQuery()
      query
        .select('#priceChartCanvas')
        .fields({ node: true, size: true })
        .exec((res: any) => {
          if (!res || !res[0] || !res[0].node) {
            chartLog.warn('Canvas节点未就绪')
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getWindowInfo().pixelRatio || 2
          const canvasWidth = res[0].width
          const chartHeight = res[0].height

          canvas.width = canvasWidth * dpr
          canvas.height = chartHeight * dpr
          ctx.scale(dpr, dpr)

          this._renderLineChart(ctx, points, canvasWidth, chartHeight)
        })
    },

    /**
     * 绘制折线图核心逻辑
     * 包含：背景网格 → 折线 → 渐变填充 → 数据点 → X轴标签
     */
    _renderLineChart(ctx: any, points: any[], chartWidth: number, chartHeight: number) {
      const padding = { top: 16, right: 16, bottom: 32, left: 48 }
      const plotWidth = chartWidth - padding.left - padding.right
      const plotHeight = chartHeight - padding.top - padding.bottom

      ctx.clearRect(0, 0, chartWidth, chartHeight)

      if (points.length === 0) {
        return
      }

      const prices = points.map((p: any) => p.avg_price || 0)
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)
      const priceRange = maxPrice - minPrice || 1

      /* 绘制水平网格线（4条）— 使用品牌色调淡化网格 */
      ctx.strokeStyle = CHART_COLORS.grid
      ctx.lineWidth = 0.5
      ctx.setLineDash([4, 4])
      for (let gridIdx = 0; gridIdx <= 3; gridIdx++) {
        const gridY = padding.top + (plotHeight / 3) * gridIdx
        ctx.beginPath()
        ctx.moveTo(padding.left, gridY)
        ctx.lineTo(padding.left + plotWidth, gridY)
        ctx.stroke()

        const gridPrice = maxPrice - (priceRange / 3) * gridIdx
        ctx.fillStyle = CHART_COLORS.axisText
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(String(Math.round(gridPrice)), padding.left - 6, gridY + 4)
      }
      ctx.setLineDash([])

      /* 坐标映射函数 */
      const pointX = (idx: number) => padding.left + (plotWidth / (points.length - 1 || 1)) * idx
      const pointY = (price: number) =>
        padding.top + plotHeight - ((price - minPrice) / priceRange) * plotHeight

      /* 折线下方填充区域 — 实色 */
      ctx.beginPath()
      ctx.moveTo(pointX(0), pointY(prices[0]))
      for (let fillIdx = 1; fillIdx < points.length; fillIdx++) {
        ctx.lineTo(pointX(fillIdx), pointY(prices[fillIdx]))
      }
      ctx.lineTo(pointX(points.length - 1), padding.top + plotHeight)
      ctx.lineTo(pointX(0), padding.top + plotHeight)
      ctx.closePath()
      ctx.fillStyle = CHART_COLORS.fillSolid
      ctx.fill()

      /* 绘制折线（带阴影增强立体感） */
      ctx.shadowColor = 'rgba(255, 107, 53, 0.25)'
      ctx.shadowBlur = 6
      ctx.shadowOffsetY = 3
      ctx.beginPath()
      ctx.strokeStyle = CHART_COLORS.line
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.moveTo(pointX(0), pointY(prices[0]))
      for (let lineIdx = 1; lineIdx < points.length; lineIdx++) {
        ctx.lineTo(pointX(lineIdx), pointY(prices[lineIdx]))
      }
      ctx.stroke()
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
      ctx.shadowOffsetY = 0

      /* 绘制数据点（≤15个点时显示圆点） */
      if (points.length <= 15) {
        for (let dotIdx = 0; dotIdx < points.length; dotIdx++) {
          const dx = pointX(dotIdx)
          const dy = pointY(prices[dotIdx])

          ctx.beginPath()
          ctx.arc(dx, dy, 5, 0, Math.PI * 2)
          ctx.fillStyle = CHART_COLORS.dotBorder
          ctx.fill()
          ctx.strokeStyle = CHART_COLORS.dot
          ctx.lineWidth = 2.5
          ctx.stroke()
        }
      }

      /* 绘制X轴标签（均匀取5个标签） */
      ctx.fillStyle = CHART_COLORS.axisText
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      const labelCount = Math.min(5, points.length)
      const labelStep = Math.max(1, Math.floor((points.length - 1) / (labelCount - 1)))
      for (let labelIdx = 0; labelIdx < points.length; labelIdx += labelStep) {
        const timeStr = points[labelIdx].time || ''
        const shortLabel = timeStr.length > 5 ? timeStr.slice(5) : timeStr
        ctx.fillText(shortLabel, pointX(labelIdx), chartHeight - 4)
      }
    },

    /**
     * Canvas 2D 绘制成交量柱状图
     * 后端API: GET /api/v4/marketplace/price/volume → data_points[]
     */
    _drawVolumeChart(volumeData: any[]) {
      const query = this.createSelectorQuery()
      query
        .select('#priceChartCanvas')
        .fields({ node: true, size: true })
        .exec((res: any) => {
          if (!res || !res[0] || !res[0].node) {
            chartLog.warn('Canvas节点未就绪（成交量图）')
            return
          }

          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = wx.getWindowInfo().pixelRatio || 2
          const canvasWidth = res[0].width
          const chartHeight = res[0].height

          canvas.width = canvasWidth * dpr
          canvas.height = chartHeight * dpr
          ctx.scale(dpr, dpr)

          this._renderVolumeBarChart(ctx, volumeData, canvasWidth, chartHeight)
        })
    },

    /**
     * 绘制成交量柱状图核心逻辑
     * 品牌色实色柱体展示每个时间段的成交量
     */
    _renderVolumeBarChart(ctx: any, points: any[], chartWidth: number, chartHeight: number) {
      const padding = { top: 16, right: 16, bottom: 32, left: 48 }
      const plotWidth = chartWidth - padding.left - padding.right
      const plotHeight = chartHeight - padding.top - padding.bottom

      ctx.clearRect(0, 0, chartWidth, chartHeight)

      if (points.length === 0) {
        return
      }

      const volumes = points.map((p: any) => p.total_volume || p.trade_count || 0)
      const maxVolume = Math.max(...volumes) || 1

      /* 绘制水平网格线 — 统一品牌色系 */
      ctx.strokeStyle = CHART_COLORS.grid
      ctx.lineWidth = 0.5
      ctx.setLineDash([4, 4])
      for (let gridIdx = 0; gridIdx <= 3; gridIdx++) {
        const gridY = padding.top + (plotHeight / 3) * gridIdx
        ctx.beginPath()
        ctx.moveTo(padding.left, gridY)
        ctx.lineTo(padding.left + plotWidth, gridY)
        ctx.stroke()

        const gridValue = maxVolume - (maxVolume / 3) * gridIdx
        ctx.fillStyle = CHART_COLORS.axisText
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(String(Math.round(gridValue)), padding.left - 6, gridY + 4)
      }
      ctx.setLineDash([])

      /* 绘制柱状图 — 品牌色实色 */
      const barGap = 4
      const totalBarWidth = plotWidth / points.length
      const barWidth = Math.max(4, totalBarWidth - barGap)

      for (let barIdx = 0; barIdx < points.length; barIdx++) {
        const volume = volumes[barIdx]
        const barHeight = Math.max(2, (volume / maxVolume) * plotHeight)
        const barX = padding.left + totalBarWidth * barIdx + (totalBarWidth - barWidth) / 2
        const barY = padding.top + plotHeight - barHeight

        const cornerRadius = Math.min(3, barWidth / 2)
        ctx.beginPath()
        ctx.moveTo(barX + cornerRadius, barY)
        ctx.lineTo(barX + barWidth - cornerRadius, barY)
        ctx.quadraticCurveTo(barX + barWidth, barY, barX + barWidth, barY + cornerRadius)
        ctx.lineTo(barX + barWidth, barY + barHeight)
        ctx.lineTo(barX, barY + barHeight)
        ctx.lineTo(barX, barY + cornerRadius)
        ctx.quadraticCurveTo(barX, barY, barX + cornerRadius, barY)
        ctx.closePath()
        ctx.fillStyle = CHART_COLORS.volumeBar
        ctx.fill()
      }

      /* X轴标签 */
      ctx.fillStyle = CHART_COLORS.axisText
      ctx.font = '9px sans-serif'
      ctx.textAlign = 'center'
      const volumeLabelCount = Math.min(5, points.length)
      const volumeLabelStep = Math.max(1, Math.floor((points.length - 1) / (volumeLabelCount - 1)))
      for (let volLblIdx = 0; volLblIdx < points.length; volLblIdx += volumeLabelStep) {
        const timeStr = points[volLblIdx].time || ''
        const shortLabel = timeStr.length > 5 ? timeStr.slice(5) : timeStr
        const labelX = padding.left + totalBarWidth * volLblIdx + totalBarWidth / 2
        ctx.fillText(shortLabel, labelX, chartHeight - 4)
      }
    }
  }
})
