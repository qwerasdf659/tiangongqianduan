/**
 * pages/camera/camera.ts - 发现页面 - 活动聚合入口（方案C：标签页分类）+ MobX响应式状态
 *
 * ⚠️ 目录命名历史遗留：pages/camera/ 实际承载"发现"功能（活动聚合），
 * 非相机功能。因涉及 app.json tabBar、全项目跳转路径变更，暂保留目录名，
 * 后续统一重构时再改为 pages/discover/。
 */

// 🔴 统一工具函数导入
const {
  Wechat,
  API,
  Logger,
  Utils,
  ImageHelper,
  ThemeCache,
  GlobalTheme
} = require('../../utils/index')
const log = Logger.createLogger('camera')
const { showToast } = Wechat
const { checkAuth } = Utils
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 发现页面 - 活动聚合入口
 *
 * 📋 页面定位：
 * 活动聚合入口，使用标签页分类（方案C）
 * 结构：顶部搜索/筛选 → Tab（推荐/抽奖/签到/任务/兑换）→ 分类列表
 *
 * 🎯 核心功能：
 * - 活动分类浏览（按类型）
 * - 活动搜索和筛选
 * - 活动详情查看
 * - 倒计时/热度/名额显示
 * - 分页加载
 * - 下拉刷新
 *
 * 🔴 数据来源：
 * 后端路由: GET /api/v4/activities
 * API方法: API.getActivities()（已在utils/api.js中定义）
 * 数据来源: 后端真实API，无模拟数据
 */
Page({
  data: {
    // 用户信息
    isLoggedIn: false,
    userInfo: {},

    // 搜索关键词
    searchKeyword: '',

    // Tab 分类
    currentTab: 'recommend', // 当前选中的Tab
    tabs: [
      { key: 'recommend', name: '推荐', icon: '🔥' },
      { key: 'lottery', name: '抽奖', icon: '🎁' },
      { key: 'signin', name: '签到', icon: '✅' },
      { key: 'task', name: '任务', icon: '🏆' },
      { key: 'exchange', name: '兑换', icon: '🎪' }
    ],

    // 活动列表
    activities: [] as any[],
    filteredActivities: [] as any[],

    // 分页状态（后端 GET /api/v4/activities 分页参数）
    currentPage: 1,
    pageSize: 20,
    hasMore: true,
    loadingMore: false,

    /* 全局氛围主题（后端 GET /api/v4/system/config/app-theme 驱动） */
    globalThemeStyle: '',

    // 页面状态
    loading: false,
    refreshing: false,
    isEmpty: false,
    errorMessage: ''
  },

  onLoad(options) {
    log.info('发现页面（活动聚合）加载', options)

    // 🆕 MobX Store绑定
    this.userStoreBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this.initializePage()
  },

  /** 页面卸载时清理定时器 + 销毁Store绑定 */
  onUnload() {
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
      this.searchTimer = null
    }
    if (this.userStoreBindings) {
      this.userStoreBindings.destroyStoreBindings()
    }
  },

  /**
   * 将微信原生导航栏、TabBar 颜色同步为当前主题色
   * CSS 变量只能控制 WXML 内元素，导航栏和 TabBar 属于框架层需通过 JS API 设置
   */
  applyNativeThemeColors(themeName: string) {
    const navColors = GlobalTheme.getThemeNavColors(themeName)
    wx.setNavigationBarColor({
      frontColor: navColors.navText as '#ffffff' | '#000000',
      backgroundColor: navColors.navBg,
      animation: { duration: 300, timingFunc: 'easeIn' }
    })
    wx.setTabBarStyle({
      selectedColor: navColors.tabSelected
    })
  },

  onShow() {
    if (typeof this.getTabBar === 'function') {
      this.getTabBar().setData({ selected: 1 })
    }
    log.info('发现页面（活动聚合）显示')

    /* 每次 onShow 重新检查全局主题（管理后台切换主题后生效） */
    const discoverShowThemeName = ThemeCache.getThemeNameSync()
    const discoverShowThemeStyle = GlobalTheme.getGlobalThemeStyle(discoverShowThemeName)
    if (discoverShowThemeStyle !== this.data.globalThemeStyle) {
      this.setData({ globalThemeStyle: discoverShowThemeStyle })
    }
    this.applyNativeThemeColors(discoverShowThemeName)

    // 检查登录状态（活动页面可以未登录浏览，不跳转登录页）
    const isLoggedIn = checkAuth({ redirect: false })

    this.setData({
      isLoggedIn,
      userInfo: isLoggedIn ? userStore.userInfo || {} : {}
    })
  },

  /**
   * 初始化页面（重置分页状态并加载首页数据）
   *
   * 后端路由: GET /api/v4/activities?page=1&page_size=20
   * 如果API调用失败，显示空状态，不使用模拟数据。
   */
  async initializePage() {
    /* 加载全局氛围主题（同步注入 CSS 变量到页面根元素，无需登录） */
    const discoverThemeName = await ThemeCache.getThemeName()
    this.setData({ globalThemeStyle: GlobalTheme.getGlobalThemeStyle(discoverThemeName) })
    this.applyNativeThemeColors(discoverThemeName)

    this.setData({ loading: true, currentPage: 1, hasMore: true, activities: [] })

    try {
      const result = await API.getActivities({ page: 1, page_size: this.data.pageSize })

      if (result && result.success && result.data) {
        const activityList = result.data.activities || result.data || []
        const pagination = result.data.pagination

        this.setData({
          activities: activityList,
          currentPage: 1,
          hasMore: pagination
            ? pagination.current_page < pagination.total_pages
            : activityList.length >= this.data.pageSize,
          loading: false
        })

        this.filterActivities()
        log.info('活动数据加载完成，共', activityList.length, '个活动')
      } else {
        this.setData({ activities: [], loading: false, hasMore: false })
        log.warn('活动API返回无数据')
      }
    } catch (error: any) {
      log.error('初始化失败:', error)
      this.setData({ loading: false, errorMessage: '加载失败，请重试' })
      showToast('加载失败，请重试')
    }
  },

  /**
   * 触底加载更多活动（分页）
   *
   * 后端路由: GET /api/v4/activities?page=N&page_size=20
   * 新数据追加到已有列表末尾，筛选条件不变
   */
  async onReachBottom() {
    if (!this.data.hasMore || this.data.loadingMore || this.data.loading) {
      return
    }

    const nextPage = this.data.currentPage + 1
    log.info('加载更多活动, 第', nextPage, '页')

    this.setData({ loadingMore: true })

    try {
      const result = await API.getActivities({ page: nextPage, page_size: this.data.pageSize })

      if (result && result.success && result.data) {
        const newActivities = result.data.activities || result.data || []
        const pagination = result.data.pagination

        if (newActivities.length > 0) {
          const mergedActivities = [...this.data.activities, ...newActivities]
          this.setData({
            activities: mergedActivities,
            currentPage: nextPage,
            hasMore: pagination
              ? pagination.current_page < pagination.total_pages
              : newActivities.length >= this.data.pageSize,
            loadingMore: false
          })
          this.filterActivities()
          log.info('追加活动数据', newActivities.length, '条，总计', mergedActivities.length, '条')
        } else {
          this.setData({ hasMore: false, loadingMore: false })
          log.info('已加载全部活动数据')
        }
      } else {
        this.setData({ hasMore: false, loadingMore: false })
      }
    } catch (error: any) {
      log.error('加载更多失败:', error)
      this.setData({ loadingMore: false })
      showToast('加载更多失败')
    }
  },

  /**
   * 筛选活动列表
   * 根据当前Tab和搜索关键词筛选
   */
  filterActivities() {
    const { activities, currentTab, searchKeyword } = this.data

    let filtered = activities

    // 按Tab筛选
    if (currentTab !== 'recommend') {
      filtered = filtered.filter((item: any) => item.type === currentTab)
    }

    // 按搜索关键词筛选
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(
        (item: any) =>
          item.title.toLowerCase().includes(keyword) ||
          item.subtitle.toLowerCase().includes(keyword)
      )
    }

    // 按热度排序
    filtered.sort((a: any, b: any) => (b.hot_score || 0) - (a.hot_score || 0))

    this.setData({
      filteredActivities: filtered,
      isEmpty: filtered.length === 0
    })

    log.info('筛选完成，共', filtered.length, '个活动')
  },

  /**
   * Tab切换
   * e - 事件对象
   */
  /** 活动封面图片加载失败 — 替换为占位图 */
  onCoverImageError(e: any) {
    const index = e.currentTarget.dataset.index
    if (index !== undefined) {
      this.setData({ [`filteredActivities[${index}].cover`]: ImageHelper.DEFAULT_PRODUCT_IMAGE })
    }
  },

  onTabChange(e: any) {
    const tab = e.currentTarget.dataset.tab

    if (this.data.currentTab === tab) {
      return
    }

    log.info('Tab切换:', tab)

    this.setData({ currentTab: tab })
    this.filterActivities()
  },

  /**
   * 搜索输入
   * e - 事件对象
   */
  onSearchInput(e: any) {
    const keyword = e.detail.value
    this.setData({ searchKeyword: keyword })

    // 延迟300ms执行搜索（防抖）
    if (this.searchTimer) {
      clearTimeout(this.searchTimer)
    }

    this.searchTimer = setTimeout(() => {
      this.filterActivities()
    }, 300)
  },

  /**
   * 清空搜索
   */
  onClearSearch() {
    this.setData({ searchKeyword: '' })
    this.filterActivities()
  },

  /**
   * 下拉刷新
   */
  async onPullDownRefresh() {
    log.info('下拉刷新')

    this.setData({ refreshing: true })

    try {
      // 重新加载活动数据
      await this.initializePage()
      showToast('刷新成功')
    } catch (error: any) {
      log.error('刷新失败:', error)
      showToast('刷新失败，请重试')
    } finally {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    }
  },

  /**
   * 活动点击事件
   * e - 事件对象
   */
  onActivityTap(e: any) {
    const activity = e.currentTarget.dataset.activity

    if (!activity) {
      return
    }

    log.info(' 点击活动:', activity.title)

    // 显示活动详情弹窗
    this.showActivityDetail(activity)
  },

  /**
   * 显示活动详情
   * activity - 活动数据
   */
  showActivityDetail(activity: any) {
    // 构建详情内容
    let content = `${activity.subtitle || ''}\n\n`

    // 状态信息
    const statusText = this.getStatusText(activity.status)
    content += `📋 状态：${statusText}\n`

    // 时间信息
    if (activity.status === 'ongoing' && activity.end_time) {
      const endDate = Utils.safeParseDateString(activity.end_time)
      if (endDate) {
        const diffMs = endDate.getTime() - Date.now()
        if (diffMs > 0) {
          const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
          const hours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
          const mins = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000))
          const countdown =
            days > 0
              ? `${days}天${hours}小时`
              : hours > 0
                ? `${hours}小时${mins}分钟`
                : `${mins}分钟`
          content += `⏰ 剩余时间：${countdown}\n`
        } else {
          content += `⏰ 已结束\n`
        }
      }
    } else if (activity.status === 'upcoming' && activity.start_time) {
      const startDate = Utils.safeParseDateString(activity.start_time)
      if (startDate) {
        content += `🕐 开始时间：${Utils.formatTime(startDate)}\n`
      }
    }

    // 参与信息
    if (activity.participants_count) {
      content += `👥 参与人数：${activity.participants_count}人\n`
    }

    // 名额信息
    if (activity.quota_total) {
      content += `📊 剩余名额：${activity.quota_left}/${activity.quota_total}\n`
    }

    // 奖励信息
    if (activity.reward_type === 'points' && activity.reward_value) {
      content += `🎁 奖励：${activity.reward_value}积分\n`
    }

    // 标签信息
    if (activity.tags && activity.tags.length > 0) {
      content += `🏷️ 标签：${activity.tags.join('、')}`
    }

    wx.showModal({
      title: activity.title,
      content,
      confirmText: activity.cta_text || '查看详情',
      cancelText: '关闭',
      success: res => {
        if (res.confirm) {
          this.handleActivityAction(activity)
        }
      }
    })
  },

  /**
   * 处理活动操作
   * activity - 活动数据
   */
  handleActivityAction(activity: any) {
    // 检查登录状态
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '需要登录',
        content: '参与活动需要先登录',
        confirmText: '去登录',
        cancelText: '取消',
        success: res => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/packageUser/auth/auth'
            })
          }
        }
      })
      return
    }

    // 根据活动类型跳转
    switch (activity.type) {
      case 'lottery':
        wx.switchTab({
          url: '/pages/lottery/lottery'
        })
        break
      case 'signin':
      case 'task':
        showToast('功能开发中，敬请期待')
        break
      case 'exchange':
        wx.switchTab({
          url: '/pages/exchange/exchange'
        })
        break
      default:
        showToast('活动详情功能开发中')
    }
  },

  /**
   * 获取状态文本
   * status - 状态值
   */
  getStatusText(status: string) {
    const statusMap = {
      ongoing: '进行中',
      upcoming: '即将开始',
      ended: '已结束'
    }
    return statusMap[status as keyof typeof statusMap] || '未知'
  },

  /**
   * 分享给好友
   */
  onShareAppMessage() {
    return {
      title: '发现精彩活动，快来参与！',
      path: '/pages/camera/camera'
    }
  }
})
