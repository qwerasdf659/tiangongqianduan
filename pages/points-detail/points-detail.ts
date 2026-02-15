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
      } catch (error) {
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
   * 🔴 加载积分记录 - 使用新项目V2.0 API
   * 注意：根据接口文档2.0，积分API已实现
   */
  async loadPointsRecords() {
    if (this.data.loading) {
      log.info('⚠️ 正在加载中，跳过重复请求')
      return
    }

    log.info('📊 开始加载积分记录...')
    this.setData({ loading: true, hasError: false })

    try {
      // 🔴 使用统一的认证检查（替代diagnoseTokenStatus）
      if (!checkAuth()) {
        log.warn('⚠️ 用户未登录，已自动跳转')
        this.setData({ loading: false })
        return
      }

      log.info('✅ 认证检查通过，继续API请求')

      // 🔑 API请求（通过Token识别用户）
      // 🔴 修复: 不传asset_code和business_type，加载全部积分交易记录
      // 筛选（全部/获得/消费）在前端客户端通过 filterPointsRecords() 完成
      const result = await API.getPointsTransactions(this.data.currentPage, this.data.pageSize)

      log.info('🔍 API响应详情:', {
        success: result.success,
        message: result.message,
        dataType: typeof result.data,
        // 🔴 V4.0修正: 字段名transactions，不是records
        transactionsCount: result.data?.transactions?.length || 0,
        hasData: !!result.data
      })

      if (result.success && result.data) {
        // 🔴 V4.0修正: 后端返回的字段名是transactions，不是records（文档Line 5871）
        const { transactions, pagination } = result.data

        // 🔑 处理记录数据
        let processedRecords = transactions || []

        // 🎰 智能聚合抽奖记录
        processedRecords = this.aggregateLotteryRecords(processedRecords)

        const formattedRecords = processedRecords.map(record => {
          // 使用后端返回的字段名points_amount
          const pointsValue = record.points_amount || record.points || 0

          // 根据transaction_type确定显示的符号
          const displayPoints = record.transaction_type === 'earn' ? pointsValue : -pointsValue

          // 优先使用后端返回的transaction_title（完整业务描述）
          const displayTitle =
            record.transaction_title || record.description || record.source_text || '积分记录'

          // 直接使用后端返回的时间（前端只负责展示）
          const displayTime = record.transaction_time || record.created_at || record.timestamp || ''

          // 格式化金额显示（带符号）
          const displayAmount =
            record.transaction_type === 'earn'
              ? `+${Math.abs(pointsValue)}`
              : `-${Math.abs(pointsValue)}`

          return {
            ...record,
            displayTitle, // 业务标题（如"兑换商品：测试商品"）
            displayTime, // 友好时间（如"2小时前"）
            displayAmount, // 带符号的金额（如"+100"）
            displayPoints // 数值（用于计算）
          }
        })

        // 🔴 修复: 加载更多时追加记录，首页加载时替换记录
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

        this.setData({
          pointsRecords: allRecords,
          hasMoreRecords: pagination?.hasMore || false,
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
    } catch (error) {
      log.error('❌ 获取积分记录失败:', error)
      this.setData({ loading: false })

      const errorMsg = error.message || '获取积分记录失败'
      const errorCode = error.code || error.status || -1

      log.info('🔍 错误详细信息:', {
        message: errorMsg,
        code: errorCode,
        needReauth: error.needReauth,
        fullError: error
      })

      // 特别处理404错误
      const ERROR_NOT_FOUND = 404
      if (errorCode === ERROR_NOT_FOUND || errorMsg.includes('404')) {
        log.warn('🚨 收到404错误 - 可能是API路径问题或服务未启动')

        wx.showModal({
          title: '⚠️ 服务暂时不可用',
          content:
            '积分记录服务暂时不可用，这是后端API问题。\n\n请联系技术支持处理：\n• API端点可能未部署\n• 服务器可能重启中\n• 路由配置可能有问题',
          showCancel: true,
          cancelText: '稍后重试',
          confirmText: '联系客服',
          confirmColor: '#FF6B35',
          success: res => {
            if (res.confirm) {
              wx.showToast({
                title: '请联系技术支持',
                icon: 'none'
              })
            }
          }
        })
        return
      }

      // 认证错误处理（checkAuth会自动处理跳转）
      const ERROR_UNAUTHORIZED = 401
      if (
        error.needReauth ||
        errorCode === ERROR_UNAUTHORIZED ||
        errorMsg.includes('身份验证已过期') ||
        errorMsg.includes('登录已过期')
      ) {
        log.info('🔒 认证错误，使用统一认证处理')
        // 会自动跳转到登录页
        checkAuth()
        return
      }

      // 服务器错误处理
      const ERROR_SERVER = 500
      if (errorCode >= ERROR_SERVER) {
        wx.showModal({
          title: '🚨 服务器暂时繁忙',
          content: `服务器遇到问题(${errorCode})：\n\n${errorMsg}\n\n建议操作：\n• 稍后重新尝试\n• 检查网络连接\n• 联系技术支持`,
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

      // 通用错误处理
      wx.showModal({
        title: '💔 数据加载失败',
        content: `积分记录加载遇到问题：\n\n${errorMsg}\n\n建议操作：\n• 检查网络连接\n• 稍后重新尝试\n• 如持续出现请联系客服`,
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
    } catch (error) {
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
  onPointsFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    log.info('🔍 切换积分筛选', filter)

    this.setData({ pointsFilter: filter })

    // 客户端筛选已加载的记录，不重新请求API
    this.filterPointsRecords()
  },

  /**
   * 🔴 筛选积分记录
   * 注意：后端返回字段是points_amount和transaction_type，不是points
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
        // 🔧 修正：根据transaction_type字段筛选，而不是points字段
        filtered = filtered.filter(record => record.transaction_type === 'earn')
        break
      case 'consume':
        // 🔧 修正：根据transaction_type字段筛选，而不是points字段
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
   */
  aggregateLotteryRecords(records) {
    if (!records || records.length === 0) {
      return []
    }

    log.info('🎰 开始聚合抽奖记录', { 原始记录数: records.length })

    const lotteryRecords = []
    const otherRecords = []

    records.forEach(record => {
      const desc = (record.description || record.reason || '').toLowerCase()
      const isLottery =
        desc.includes('抽奖') ||
        desc.includes('lottery') ||
        desc.includes('single') ||
        desc.includes('multi')
      // 🔧 修正：使用正确的字段transaction_type判断消耗类型
      const isConsume = record.transaction_type === 'consume'

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

    allRecords.sort((a, b) => {
      const timeA = new Date(a.createTime || a.created_at || a.timestamp).getTime()
      const timeB = new Date(b.createTime || b.created_at || b.timestamp).getTime()
      return timeB - timeA
    })

    log.info('✅ 抽奖记录聚合完成:', {
      最终记录数: allRecords.length
    })

    return allRecords
  },

  /**
   * 🎰 按时间分组聚合
   */
  groupLotteryByTime(lotteryRecords) {
    if (lotteryRecords.length === 0) {
      return []
    }

    const timeGroups = new Map()

    lotteryRecords.forEach(record => {
      const timestamp = record.createTime || record.created_at || record.timestamp
      if (!timestamp) {
        return
      }

      const date = new Date(timestamp)
      const minuteKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`

      if (!timeGroups.has(minuteKey)) {
        timeGroups.set(minuteKey, [])
      }
      timeGroups.get(minuteKey).push(record)
    })

    const aggregatedRecords = []
    timeGroups.forEach(groupRecords => {
      if (groupRecords.length === 1) {
        aggregatedRecords.push(groupRecords[0])
      } else {
        // 🔧 修正：使用正确的字段points_amount累加积分
        const totalPoints = groupRecords.reduce((sum, r) => sum + (r.points_amount || 0), 0)
        const drawCount = groupRecords.length

        const aggregatedRecord = {
          ...groupRecords[0],
          id: `aggregated_${groupRecords[0].id}_${drawCount}`,
          points_amount: totalPoints, // 🔧 修正：使用正确的字段名
          description: `multi抽奖-聚合${drawCount}次`,
          reason: '连抽聚合记录',
          createTime: groupRecords[0].createTime,
          created_at: groupRecords[0].created_at,
          timestamp: groupRecords[0].timestamp,
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
