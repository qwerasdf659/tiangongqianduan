/**
 * 成长等级页面（纯展示）
 *
 * 业务语义: 用户查看自己的成长等级、累计积分与等级阶梯进度。
 * 成长等级由累计历史积分（history_total_points）单一派生，用于高价值实物"会员解锁"权益。
 *
 * 后端API:
 * - GET /api/v4/user/growth-level — 当前成长等级 + 等级阶梯（已脱敏，倍数/权重永不下发）
 *
 * 字段以后端为准（直接使用后端 snake_case 字段，不做映射）:
 *   current_level_key / current_level_name / history_total_points /
 *   thresholds_confirmed / levels[]{ level_key, level_name, min_history_points }
 *
 * 占位保护（拍板点⑨）: thresholds_confirmed=false 时后端将 min_history_points 下发为 null，
 *   前端只显示等级名、不显示"需达 Y 积分"的具体门槛数字，避免用占位值误导用户。
 *
 * @file packageUser/growth-level/growth-level.ts
 * @version 5.2.0
 * @since 2026-06-10
 */

const { API, Wechat, Logger } = require('../../utils/index')
const growthLog = Logger.createLogger('growth-level')
const { showToast } = Wechat

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

Page({
  data: {
    /** 功能后续开放蒙版（暂屏蔽成长等级功能，后续开放时置 false 即可恢复） */
    comingSoonVisible: true,
    /** 页面加载状态机 */
    loadStatus: 'loading' as 'loading' | 'success' | 'error',
    /** 当前等级 key（后端 current_level_key） */
    currentLevelKey: '',
    /** 当前等级中文名（后端 current_level_name） */
    currentLevelName: '',
    /** 累计历史积分（后端 history_total_points） */
    historyTotalPoints: 0,
    /** 阈值是否已定稿（后端 thresholds_confirmed，false=占位阶段不显示门槛数字） */
    thresholdsConfirmed: false,
    /** 等级阶梯（后端 levels[]，附加前端展示字段 _isCurrent / _isReached / _thresholdText） */
    levels: [] as any[],
    /** MobX 绑定字段 */
    isLoggedIn: false
  },

  /** MobX Store 绑定实例（onUnload 时销毁） */
  userBindings: null as any,

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
                : ''
          }
        })

        this.setData({
          currentLevelKey,
          currentLevelName: apiData.current_level_name || '',
          historyTotalPoints: apiData.history_total_points || 0,
          thresholdsConfirmed,
          levels: processedLevels,
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
