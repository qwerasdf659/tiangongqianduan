/**
 * 成长等级页面（纯展示，即"会员尊享"页）
 *
 * 业务语义: 用户查看自己的成长等级（9 档 v1~v9，铜卡~荣耀殿堂）、累计积分与等级阶梯进度。
 * 成长等级由累计历史积分（history_total_points）单一派生，等级终身有效只增不减（拍板⑦）。
 *
 * 后端API（对接文档《小程序成长等级页对接说明-给前端》2026-07-12）:
 * - GET /api/v4/user/growth-level — 当前成长等级 + 等级阶梯 + next_level 差值 + 积分加成倍率
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   current_level_key / current_level_name / current_earn_multiplier / history_total_points /
 *   thresholds_confirmed /
 *   levels[]{ level_key, level_name, min_history_points, earn_multiplier } /
 *   next_level{ level_key, level_name, points_needed }（顶档为 null）
 *
 * 积分加成倍率（earn_multiplier / current_earn_multiplier，2026-07-12 新增）:
 *   属营销激励信息（同淘宝/京东/有赞会员倍率），业务确认对用户公开以增强升级动力。
 *   earn_multiplier=1 表示 1.0 倍（无加成），展示统一 toFixed(2) 格式化（1.00/1.05/1.50）。
 *   ⚠️ 数据边界：本接口只下发成长等级积分倍率这类营销信息；抽奖中奖概率、分层权重等
 *   属商业机密，后端不下发、前端也不展示（对接文档 §六）。
 *
 * 占位保护: thresholds_confirmed=false 时后端将 min_history_points 下发为 null，
 *   前端只显示等级名、不显示"需达 Y 积分"的具体门槛数字，避免用占位值误导用户。
 *
 * @file packageUser/growth-level/growth-level.ts
 * @version 5.3.0
 * @since 2026-06-10
 */

const { API, Wechat, Logger } = require('../../utils/index')
const growthLog = Logger.createLogger('growth-level')
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 页面加载状态机 */
    loadStatus: 'loading' as 'loading' | 'success' | 'error',
    /** 当前等级 key（后端 current_level_key） */
    currentLevelKey: '',
    /** 当前等级中文名（后端 current_level_name） */
    currentLevelName: '',
    /**
     * 当前等级积分加成倍率展示文案（后端 current_earn_multiplier，2026-07-12 新增）:
     * 已 toFixed(2) 格式化的"积分加成 X.XX 倍"文案；后端未下发有效倍率时为空不展示。
     */
    currentMultiplierText: '',
    /** 累计历史积分（后端 history_total_points） */
    historyTotalPoints: 0,
    /** 阈值是否已定稿（后端 thresholds_confirmed，false=占位阶段不显示门槛数字） */
    thresholdsConfirmed: false,
    /** 等级阶梯（后端 levels[]，附加前端展示字段 _isCurrent / _isReached / _thresholdText） */
    levels: [] as any[],
    /**
     * 升级提示文案（后端 next_level 差值字段，§9-9）:
     * "再消费 X 元升{下一级名}"（1 元≈1 积分，拍板①业务前提）；顶档或占位期为空不展示
     */
    nextLevelText: '',
    /** 当前等级在阶梯中的序号（1-based，纯展示：来自后端 levels[] 数组位置，非前端自算业务数据） */
    currentLevelIndex: 0,
    /** 是否已达最高等级（levels[] 末位即当前等级，用于展示荣耀文案） */
    isTopLevel: false,
    /**
     * 升级进度条填充百分比（0~100，仅 UI 可视化）:
     * 由后端权威数字（history_total_points / 当前档与下一档 min_history_points）换算为条宽，
     * 页面不展示任何前端自算的数字文案，具体差值仍以后端 nextLevelText 为准。
     * 阈值未定稿（thresholds_confirmed=false）或顶档时为 -1 不展示。
     */
    progressPercent: -1,
    /** MobX 绑定字段 */
    isLoggedIn: false
  },

  /** MobX Store 绑定实例（onUnload 时销毁） */
  userBindings: null as any,

  onLoad() {
    growthLog.info('成长等级页面加载')

    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this.loadGrowthLevel()
  },

  onUnload() {
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  },

  async onPullDownRefresh() {
    await this.loadGrowthLevel()
    wx.stopPullDownRefresh()
  },

  /** 加载成长等级（后端按 JWT 中的 user_id 返回本人数据） */
  async loadGrowthLevel() {
    this.setData({ loadStatus: 'loading' })

    try {
      const result = await API.getUserGrowthLevel()

      if (result && result.success && result.data) {
        const apiData = result.data
        const thresholdsConfirmed = apiData.thresholds_confirmed === true
        const currentLevelKey = apiData.current_level_key || ''
        const rawLevels = Array.isArray(apiData.levels) ? apiData.levels : []

        /** 标记当前等级 / 已达等级 / 门槛文案（占位阶段不展示数字） */
        let reachedCurrent = false
        const processedLevels = rawLevels.map((level: any) => {
          const isCurrent = level.level_key === currentLevelKey
          /** 阶梯升序：当前等级及之前的均视为已达成 */
          const isReached = !reachedCurrent
          if (isCurrent) {
            reachedCurrent = true
          }
          return {
            levelKey: level.level_key,
            levelName: level.level_name,
            isCurrent,
            isReached,
            /** 门槛文案：阈值已定稿且后端下发数字时才展示，否则留空 */
            thresholdText:
              thresholdsConfirmed &&
              level.min_history_points !== null &&
              level.min_history_points !== undefined
                ? `累计 ${level.min_history_points} 积分`
                : '',
            /**
             * 积分加成倍率文案（后端 earn_multiplier，2026-07-12 新增）:
             * 数值型倍率 toFixed(2) 格式化为"积分 ×X.XX"；后端未下发有效数字时留空不展示。
             */
            multiplierText:
              typeof level.earn_multiplier === 'number'
                ? `积分 ×${level.earn_multiplier.toFixed(2)}`
                : ''
          }
        })

        /**
         * "再消费 X 元升{下一级名}"升级提示（后端 next_level 差值字段）:
         * 后端权威计算差值，前端不自算；顶档（next_level=null）不展示。
         * 1 元 = 1 积分（拍板①业务前提），points_needed 即"再消费 X 元"。
         */
        const nextLevel = apiData.next_level
        const nextLevelText =
          nextLevel && nextLevel.level_name && typeof nextLevel.points_needed === 'number'
            ? `再消费 ${nextLevel.points_needed} 元即可升级${nextLevel.level_name}`
            : ''

        /** 当前等级序号（1-based）与顶档标记：来自后端 levels[] 数组位置，纯展示 */
        const currentIndex = processedLevels.findIndex((level: any) => level.isCurrent)
        const currentLevelIndex = currentIndex >= 0 ? currentIndex + 1 : 0
        const isTopLevel = currentIndex >= 0 && currentIndex === processedLevels.length - 1

        /**
         * 升级进度条填充百分比（仅 UI 可视化，不产生任何数字文案）:
         * 分段进度 = (累计积分 - 当前档门槛) / (下一档门槛 - 当前档门槛)
         * 全部输入均为后端权威数字；阈值未定稿 / 顶档 / 数据不齐时为 -1 不渲染进度条
         */
        let progressPercent = -1
        if (thresholdsConfirmed && !isTopLevel && currentIndex >= 0) {
          const currentMin = rawLevels[currentIndex] && rawLevels[currentIndex].min_history_points
          const nextMin =
            rawLevels[currentIndex + 1] && rawLevels[currentIndex + 1].min_history_points
          const historyPoints = apiData.history_total_points
          if (
            typeof currentMin === 'number' &&
            typeof nextMin === 'number' &&
            typeof historyPoints === 'number' &&
            nextMin > currentMin
          ) {
            const ratio = ((historyPoints - currentMin) / (nextMin - currentMin)) * 100
            progressPercent = Math.max(0, Math.min(100, Math.round(ratio)))
          }
        }

        /**
         * 当前等级积分加成倍率文案（后端 current_earn_multiplier，2026-07-12 新增）:
         * toFixed(2) 统一两位小数展示"积分加成 X.XX 倍"；后端未下发有效数字时留空不展示。
         */
        const currentMultiplier = apiData.current_earn_multiplier
        const currentMultiplierText =
          typeof currentMultiplier === 'number' ? `积分加成 ${currentMultiplier.toFixed(2)} 倍` : ''

        this.setData({
          currentLevelKey,
          currentLevelName: apiData.current_level_name || '',
          currentMultiplierText,
          historyTotalPoints: apiData.history_total_points || 0,
          thresholdsConfirmed,
          levels: processedLevels,
          nextLevelText,
          currentLevelIndex,
          isTopLevel,
          progressPercent,
          loadStatus: 'success'
        })

        growthLog.info('成长等级加载成功:', currentLevelKey)
      } else {
        throw new Error((result && result.message) || '成长等级数据为空')
      }
    } catch (error: any) {
      growthLog.error('加载成长等级失败:', error)
      this.setData({ loadStatus: 'error' })
      showToast(error.message || '加载失败，请重试')
    }
  },

  /** 重试加载 */
  retryLoad() {
    this.loadGrowthLevel()
  },

  onShareAppMessage() {
    return {
      title: '天工平台 - 我的成长等级',
      path: '/pages/user/user'
    }
  }
})
