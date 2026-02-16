// pages/points-detail/points-detail.ts - 积分详情页面 + MobX响应式状态

// 🔴 统一工具函数导入
const { API, Utils, Logger } = require('../../utils/index')
const log = Logger.createLogger('points-detail')
const { checkAuth } = Utils
// 🆕 MobX Store绑定
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { pointsStore } = require('../../store/points')
const { userStore } = require('../../store/user')

/**
 * 积分详情页面 - 餐厅积分抽奖系统
 *
 * 功能清单：
 * - 可用积分余额展示（MobX Store响应式同步）
 * - 筛选功能（全部记录 / 积分获得 / 积分消费）— 客户端筛选
 * - 积分交易记录列表（分页加载，上拉加载更多）
 * - 统计信息（记录总数、当前筛选状态）
 * - 抽奖记录智能聚合（同分钟内的连抽合并为一条）
 *
 * API依赖：
 * - GET /api/v4/assets/transactions — 获取积分交易流水
 * - GET /api/v4/assets/balance — 获取积分余额
 */
Page({
  data: {
    // 用户信息
    loading: false,
    userInfo: null,
    totalPoints: 0,

    // 积分记录
    pointsRecords: [],
    filteredPointsRecords: [],
    // 筛选条件：all, earn, consume
    pointsFilter: 'all',
    hasMoreRecords: false,
    currentPage: 1,
    pageSize: 20,
    lastUpdateTime: '',

    // 页面状态
    refreshing: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(_options) {
    log.info('💰 积分明细页面加载 - v2.0实现')

    // 🆕 MobX Store绑定 - 积分余额自动同步
    this.pointsBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: {
        availablePoints: () => pointsStore.availableAmount,
        frozenPoints: () => pointsStore.frozenAmount
      },
      actions: ['setBalance']
    })

    this.initPage()
  },

  /** 🆕 页面卸载时销毁Store绑定 */
  onUnload() {
    if (this.pointsBindings) {
      this.pointsBindings.destroyStoreBindings()
    }
  },

  /**
   * 生命周期函数--监听页面初次渲染完成
   */
  onReady() {
    wx.setNavigationBarTitle({
      title: '积分明细'
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    log.info('💰 积分明细页面显示')
  },

  /**
   * 页面相关事件处理函数--监听用户下拉动作
   */
  onPullDownRefresh() {
    log.info('🔄 下拉刷新积分明细')
    this.refreshPointsData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 页面上拉触底事件的处理函数
   */
  onReachBottom() {
    if (this.data.hasMoreRecords && !this.data.loading) {
      this.loadMoreRecords()
    }
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '我的积分明细 - 餐厅积分系统',
      path: '/pages/points-detail/points-detail'
    }
  },

  /**
   * 🔴 初始化页面 - 基于旧项目逻辑
   */
  initPage() {
    log.info('🔧 开始初始化积分明细页面...')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    // 🔴 从全局获取用户信息，如果没有则从Storage恢复
    let globalUserInfo = userStore.userInfo

    if (!globalUserInfo || !globalUserInfo.user_id) {
      log.info('⚠️ globalData没有用户信息，尝试从Storage恢复...')
      try {
        const storedUserInfo = wx.getStorageSync('user_info')
        if (storedUserInfo && storedUserInfo.user_id) {
          globalUserInfo = storedUserInfo
          userStore.updateUserInfo(storedUserInfo)
          log.info('✅ 从Storage恢复用户信息成功:', {
            user_id: storedUserInfo.user_id,
            mobile: storedUserInfo.mobile
          })
        } else {
          log.error('❌ Storage中也没有用户信息，跳转登录页')
          checkAuth() // 会自动跳转到登录页
          return
        }
      } catch (error: any) {
        log.error('❌ 从Storage恢复用户信息失败:', error)
        checkAuth()
        return
      }
    }

    // 积分余额使用MobX Store（由资产余额API更新），不依赖globalData
    const totalPoints = pointsStore.availableAmount || 0

    if (globalUserInfo) {
      this.setData({
        userInfo: globalUserInfo,
        totalPoints
      })
    }

    // 🔴 加载积分记录
    this.loadPointsRecords()

    log.info('✅ 积分明细页面初始化完成')
  },

  /**
   * 🔴 加载积分记录
   *
   * API: GET /api/v4/assets/transactions
   *
   * 后端实际返回字段（对齐 typings/api.d.ts AssetTransaction）：
   *   asset_transaction_id - 交易流水ID（BIGINT PK）
   *   asset_code           - 资产代码（POINTS / DIAMOND / red_shard）
   *   delta_amount         - 变动金额（正数=获得/earn，负数=消费/consume）
   *   balance_before       - 变动前余额
   *   balance_after        - 变动后余额
   *   business_type        - 业务类型枚举（lottery_consume / lottery_reward / exchange_debit 等）
   *   description          - 交易描述（约91%有值，可为null）
   *   title                - 交易标题（约79%有值，可为null）
   *   created_at           - 创建时间
   *
   * 后端分页字段（pagination对象）：
   *   total        - 记录总数
   *   page         - 当前页码
   *   page_size    - 每页条数
   *   total_pages  - 总页数
   *
   * 前端筛选逻辑（earn/consume）：根据 delta_amount 正负号判断
   *   delta_amount > 0  → earn（积分获得）
   *   delta_amount < 0  → consume（积分消费）
   */
  async loadPointsRecords() {
    if (this.data.loading) {
      log.info('⚠️ 正在加载中，跳过重复请求')
      return
    }

    log.info('📊 开始加载积分记录...')
    this.setData({ loading: true, hasError: false })

    try {
      // 统一认证检查
      if (!checkAuth()) {
        log.warn('⚠️ 用户未登录，已自动跳转')
        this.setData({ loading: false })
        return
      }

      log.info('✅ 认证检查通过，继续API请求')

      // API请求（通过JWT Token识别用户，不传asset_code和business_type加载全部交易记录）
      // 筛选（全部/获得/消费）在前端客户端通过 filterPointsRecords() 完成
      const result = await API.getPointsTransactions(this.data.currentPage, this.data.pageSize)

      log.info('🔍 API响应详情:', {
        success: result.success,
        message: result.message,
        dataType: typeof result.data,
        transactionsCount: result.data?.transactions?.length || 0,
        hasData: !!result.data
      })

      if (result.success && result.data) {
        // 后端返回的字段名是 transactions
        const { transactions, pagination } = result.data

        let processedRecords = transactions || []

        // 🔍 诊断日志：打印第一条原始记录的字段，帮助确认后端实际返回格式
        if (processedRecords.length > 0) {
          log.info('🔍 [诊断] 第一条原始记录字段:', {
            keys: Object.keys(processedRecords[0]),
            sample: processedRecords[0]
          })
        }

        // 🎰 智能聚合抽奖记录
        processedRecords = this.aggregateLotteryRecords(processedRecords)

        const formattedRecords = processedRecords.map((record: any) => {
          // 🔴 使用后端实际返回的字段名 delta_amount（对齐后端路由层 transactions.js 第61-76行）
          // delta_amount > 0 表示获得积分，delta_amount < 0 表示消费积分
          const rawAmount = record.delta_amount || 0
          const absAmount = Math.abs(rawAmount)

          // 根据 delta_amount 正负号推导交易方向
          const transactionType = rawAmount > 0 ? 'earn' : 'consume'

          // 标题显示优先级：title → description → 业务类型中文回退
          const displayTitle =
            record.title || record.description || this.getBusinessTypeLabel(record.business_type)

          // 描述文本：当 title 和 description 都存在且不同时，显示 description 作为补充说明
          // 否则显示业务类型的中文标签
          const displayDescription =
            record.title && record.description && record.title !== record.description
              ? record.description
              : this.getBusinessTypeLabel(record.business_type)

          // 使用后端返回的 created_at 字段（ISO 8601 格式）
          const displayTime = record.created_at || ''

          // 格式化金额显示（带符号）
          const displayAmount = rawAmount > 0 ? `+${absAmount}` : `-${absAmount}`

          return {
            ...record,
            // 前端计算的交易方向（用于筛选和UI样式）
            transaction_type: transactionType,
            displayTitle,
            displayDescription,
            displayTime,
            displayAmount,
            displayPoints: rawAmount
          }
        })

        // 加载更多时追加记录，首页加载时替换记录
        const isLoadMore = this.data.currentPage > 1
        const allRecords = isLoadMore
          ? [...this.data.pointsRecords, ...formattedRecords]
          : formattedRecords

        log.info('✅ 格式化记录完成', {
          原始记录数: transactions?.length || 0,
          本次格式化: formattedRecords.length,
          累计记录数: allRecords.length,
          是否追加: isLoadMore
        })

        // 🔴 后端分页字段: total, page, page_size, total_pages（不含 hasMore / has_more）
        // 根据 page < total_pages 计算是否还有更多数据
        const hasMore = pagination ? pagination.page < pagination.total_pages : false

        this.setData({
          pointsRecords: allRecords,
          hasMoreRecords: hasMore,
          lastUpdateTime: new Date().toLocaleString(),
          loading: false,
          hasError: false
        })

        // 设置数据后立即调用筛选函数
        this.filterPointsRecords()

        log.info(`✅ 积分记录加载成功 - 共${allRecords.length}条记录`)
      } else {
        throw new Error(result.message || '获取积分记录失败')
      }
    } catch (error: any) {
      log.error('❌ 获取积分记录失败:', error)
      this.setData({ loading: false })

      const errorMsg = error.message || '获取积分记录失败'
      const errorCode = error.code || error.statusCode || -1

      log.info('🔍 错误详细信息:', {
        message: errorMsg,
        code: errorCode,
        fullError: error
      })

      // 404错误 - API路径问题
      const ERROR_NOT_FOUND = 404
      if (errorCode === ERROR_NOT_FOUND || errorMsg.includes('404')) {
        log.warn('🚨 收到404错误 - 可能是API路径问题或服务未启动')
        wx.showModal({
          title: '⚠️ 服务暂时不可用',
          content:
            '积分记录服务暂时不可用。\n\n请联系技术支持处理：\n• API端点可能未部署\n• 服务器可能重启中',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '知道了',
          confirmColor: '#FF6B35'
        })
        return
      }

      // 认证错误（APIClient已处理401自动刷新，此处处理其他认证场景）
      const ERROR_UNAUTHORIZED = 401
      if (error.isAuthError || errorCode === ERROR_UNAUTHORIZED) {
        log.info('🔒 认证错误，使用统一认证处理')
        checkAuth()
        return
      }

      // 服务器错误
      const ERROR_SERVER = 500
      if (errorCode >= ERROR_SERVER) {
        wx.showModal({
          title: '🚨 服务器暂时繁忙',
          content: `服务器遇到问题(${errorCode})：\n${errorMsg}\n\n建议稍后重新尝试`,
          showCancel: true,
          cancelText: '重新加载',
          confirmText: '返回上页',
          confirmColor: '#FF6B35',
          success: res => {
            if (res.confirm) {
              wx.navigateBack()
            } else {
              this.loadPointsRecords()
            }
          }
        })
        return
      }

      // 通用错误
      wx.showModal({
        title: '数据加载失败',
        content: `${errorMsg}\n\n建议检查网络后重试`,
        showCancel: true,
        cancelText: '重新加载',
        confirmText: '返回上页',
        confirmColor: '#FF6B35',
        success: res => {
          if (res.confirm) {
            wx.navigateBack()
          } else {
            this.loadPointsRecords()
          }
        }
      })
    }
  },

  /**
   * 🔴 刷新积分数据（下拉刷新时调用）
   * 重置分页状态，重新加载余额和交易记录
   */
  async refreshPointsData() {
    this.setData({
      currentPage: 1,
      pointsRecords: []
    })

    // 同时更新用户积分余额
    try {
      const result = await API.getPointsBalance()
      if (result.success && result.data) {
        this.setData({
          // 后端资产余额API返回字段：available_amount（可用余额）
          totalPoints: result.data.available_amount || 0
        })
      }
    } catch (error: any) {
      log.error('❌ 刷新积分余额失败:', error)
    }

    return this.loadPointsRecords()
  },

  /**
   * 🔴 加载更多记录
   */
  loadMoreRecords() {
    if (this.data.loading || !this.data.hasMoreRecords) {
      return
    }

    log.info('📄 加载更多积分记录...', {
      currentPage: this.data.currentPage,
      nextPage: this.data.currentPage + 1
    })

    this.setData({
      currentPage: this.data.currentPage + 1
    })

    this.loadPointsRecords()
  },

  /**
   * 🔴 积分明细筛选切换
   * 筛选逻辑在前端客户端执行，不需要重新请求API
   * 后端API的asset_code参数用于资产类型筛选（如POINTS），不是交易方向筛选
   */
  onPointsFilterChange(e: any) {
    const filter = e.currentTarget.dataset.filter
    log.info('🔍 切换积分筛选', filter)

    this.setData({ pointsFilter: filter })

    // 客户端筛选已加载的记录，不重新请求API
    this.filterPointsRecords()
  },

  /**
   * 🔴 筛选积分记录
   *
   * 筛选逻辑基于 loadPointsRecords() 中计算的 transaction_type 字段：
   *   - 'earn'    → delta_amount > 0（积分获得）
   *   - 'consume' → delta_amount < 0（积分消费）
   *
   * 筛选在前端客户端执行，不需要重新请求API
   */
  filterPointsRecords() {
    const pointsRecords = this.data.pointsRecords || []
    log.info('🔍 筛选积分记录', {
      原始记录数量: pointsRecords.length,
      筛选条件: this.data.pointsFilter
    })

    let filtered = [...pointsRecords]

    switch (this.data.pointsFilter) {
      case 'earn':
        // 根据前端计算的 transaction_type 筛选（来源：delta_amount > 0）
        filtered = filtered.filter(record => record.transaction_type === 'earn')
        break
      case 'consume':
        // 根据前端计算的 transaction_type 筛选（来源：delta_amount < 0）
        filtered = filtered.filter(record => record.transaction_type === 'consume')
        break
      default:
        break
    }

    log.info('✅ 筛选完成', { 筛选后记录数量: filtered.length })

    this.setData({
      filteredPointsRecords: filtered
    })

    if (pointsRecords.length > 0 && filtered.length === 0) {
      const filterText = this.data.pointsFilter === 'earn' ? '获得' : '消费'
      wx.showToast({
        title: `暂无${filterText}记录`,
        icon: 'none',
        duration: 2000
      })
    }
  },

  /**
   * 🏷️ 获取业务类型的中文标签
   *
   * 将后端 business_type 枚举码映射为用户可读的中文标签。
   * 当 title 和 description 均为 null 时，作为 displayTitle 的回退值。
   *
   * 枚举来源：数据库 asset_transactions.business_type 字段
   * 覆盖率参考：docs/backend-transaction-fields-request要求.md 第2.3节
   *
   * @param businessType - 后端 business_type 字段值
   * @returns 中文标签字符串
   */
  getBusinessTypeLabel(businessType: string): string {
    if (!businessType) {
      return '积分记录'
    }

    /** 后端 business_type 枚举 → 中文标签映射 */
    const labelMap: Record<string, string> = {
      // 抽奖系统
      lottery_consume: '抽奖消耗',
      lottery_reward: '抽奖奖励',
      lottery_budget_deduct: '抽奖预算扣减',
      // 消费奖励
      consumption_reward: '消费奖励',
      consumption_budget_allocation: '消费预算分配',
      // 兑换系统
      exchange_debit: '兑换扣减',
      // 管理员操作
      admin_adjustment: '管理员调整',
      // 商户
      merchant_points_reward: '商户积分奖励',
      // 开账
      opening_balance: '开账余额',
      // 材料转换
      material_convert_debit: '材料转换扣减',
      material_convert_credit: '材料转换获得',
      // 交易市场
      order_freeze_buyer: '交易冻结',
      order_settle_seller: '交易收款',
      order_settle_buyer: '交易扣款',
      order_cancel_unfreeze: '交易取消退回',
      market_listing_freeze: '挂单冻结',
      market_listing_cancel: '挂单取消退回'
    }

    return labelMap[businessType] || '积分记录'
  },

  /** 返回上一页 */
  onBackTap() {
    wx.navigateBack()
  },

  /**
   * 🔑 手动刷新
   */
  async handleManualRefresh() {
    log.info('🔧 执行手动刷新...')

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      log.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    this.setData({
      currentPage: 1,
      pointsRecords: [],
      hasMoreRecords: true
    })

    await this.loadPointsRecords()
  },

  /**
   * 🎰 智能聚合抽奖记录
   *
   * 将同一分钟内的连续抽奖消费记录合并为一条聚合记录。
   * 判断依据：business_type 含 lottery_consume 或 description 含"抽奖" 且 delta_amount < 0（消费）
   *
   * @param records - 后端原始交易记录（AssetTransaction 格式）
   * @returns 聚合后的记录数组
   */
  aggregateLotteryRecords(records: any[]) {
    if (!records || records.length === 0) {
      return []
    }

    log.info('🎰 开始聚合抽奖记录', { 原始记录数: records.length })

    const lotteryRecords: any[] = []
    const otherRecords: any[] = []

    records.forEach((record: any) => {
      // 优先使用 business_type 判断抽奖类型（比 description 文本匹配更可靠）
      const businessType = (record.business_type || '').toLowerCase()
      const desc = (record.description || record.title || '').toLowerCase()
      const isLottery =
        businessType === 'lottery_consume' || desc.includes('抽奖') || desc.includes('lottery')
      // 使用 delta_amount 字段判断消费方向（delta_amount < 0 表示消费）
      const isConsume = (record.delta_amount || 0) < 0

      if (isLottery && isConsume) {
        lotteryRecords.push(record)
      } else {
        otherRecords.push(record)
      }
    })

    log.info('🔍 记录分类:', {
      抽奖记录数: lotteryRecords.length,
      其他记录数: otherRecords.length
    })

    const aggregatedLottery = this.groupLotteryByTime(lotteryRecords)
    const allRecords = [...aggregatedLottery, ...otherRecords]

    // 按 created_at 降序排列（最新的在前）
    allRecords.sort((a, b) => {
      const timeA = new Date((a.created_at || '').replace(' ', 'T')).getTime()
      const timeB = new Date((b.created_at || '').replace(' ', 'T')).getTime()
      return timeB - timeA
    })

    log.info('✅ 抽奖记录聚合完成:', {
      最终记录数: allRecords.length
    })

    return allRecords
  },

  /**
   * 🎰 按时间分组聚合抽奖记录
   *
   * 将同一分钟内的抽奖消费记录合并：
   * - 单条记录：保持不变
   * - 多条记录：合并为一条聚合记录，delta_amount 累加
   *
   * @param lotteryRecords - 已筛选的抽奖消费记录
   * @returns 聚合后的记录数组
   */
  groupLotteryByTime(lotteryRecords: any[]) {
    if (lotteryRecords.length === 0) {
      return []
    }

    const timeGroups = new Map()

    lotteryRecords.forEach((record: any) => {
      // 使用后端实际字段 created_at（ISO 8601 格式）
      const timestamp = record.created_at
      if (!timestamp) {
        return
      }

      // ISO 8601 格式 "2026-02-15T19:41:15.000Z" 可直接解析
      const date = new Date(timestamp)
      const minuteKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`

      if (!timeGroups.has(minuteKey)) {
        timeGroups.set(minuteKey, [])
      }
      timeGroups.get(minuteKey).push(record)
    })

    const aggregatedRecords: any[] = []
    timeGroups.forEach((groupRecords: any[]) => {
      if (groupRecords.length === 1) {
        aggregatedRecords.push(groupRecords[0])
      } else {
        // 使用后端实际字段 delta_amount 累加积分消费（负数累加）
        const totalDeltaAmount = groupRecords.reduce(
          (sum: number, r: any) => sum + (r.delta_amount || 0),
          0
        )
        const drawCount = groupRecords.length

        const aggregatedRecord = {
          ...groupRecords[0],
          // 聚合记录使用首条记录的 asset_transaction_id 加后缀区分
          asset_transaction_id: `aggregated_${groupRecords[0].asset_transaction_id}_${drawCount}`,
          delta_amount: totalDeltaAmount,
          description: `连抽${drawCount}次（聚合记录）`,
          title: `连抽${drawCount}次`,
          created_at: groupRecords[0].created_at,
          isAggregated: true,
          originalCount: drawCount,
          originalRecords: groupRecords
        }

        aggregatedRecords.push(aggregatedRecord)
      }
    })

    return aggregatedRecords
  }
})

export {}
