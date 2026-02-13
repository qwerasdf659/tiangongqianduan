// pages/camera/camera.ts - 发现页面 - 活动聚合入口（方案C：标签页分类）+ MobX响应式状态

const app = getApp()
// 🔴 统一工具函数导入
const { Wechat, API } = require('../../utils/index')
const { showToast } = Wechat
// 🆕 MobX Store绑定
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
 * 当前状态: 调用后端真实API，mock数据已全部清除(2026-02-07)
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
    activities: [],
    filteredActivities: [], // 筛选后的活动列表

    // 分页
    page: 1,
    pageSize: 10,
    hasMore: true,

    // 页面状态
    loading: false,
    refreshing: false,
    isEmpty: false,
    errorMessage: ''
  },

  onLoad(options) {
    console.log('🔍 发现页面（活动聚合）加载', options)

    // 🆕 MobX Store绑定
    this.storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    this.initializePage()
  },

  /** 🆕 页面卸载时销毁Store绑定 */
  onUnload() {
    if (this.storeBindings) {
      this.storeBindings.destroyStoreBindings()
    }
  },

  onShow() {
    console.log('🔍 发现页面（活动聚合）显示')

    // 检查登录状态（活动页面可以未登录浏览）
    const globalData = app.globalData
    const isLoggedIn = globalData.isLoggedIn && globalData.access_token

    this.setData({
      isLoggedIn,
      userInfo: isLoggedIn ? globalData.userInfo || {} : {}
    })
  },

  /**
   * 初始化页面
   *
   * @description
   * 调用后端API获取活动列表数据。
   * 后端路由: GET /api/v4/activities
   * 如果API调用失败，显示空状态，不使用模拟数据。
   */
  async initializePage() {
    this.setData({ loading: true })

    try {
      // 调用后端活动列表API获取真实数据
      const result = await API.getActivities({ page: 1, page_size: 50 })

      if (result && result.success && result.data) {
        const activities = result.data.activities || result.data || []

        this.setData({
          activities,
          loading: false
        })

        // 应用筛选（根据当前Tab）
        this.filterActivities()

        console.log('✅ 活动数据加载完成，共', activities.length, '个活动')
      } else {
        // API返回失败，显示空状态
        this.setData({
          activities: [],
          loading: false
        })
        console.warn('⚠️ 活动API返回无数据')
      }
    } catch (error) {
      console.error('❌ 初始化失败:', error)
      this.setData({
        loading: false,
        errorMessage: '加载失败，请重试'
      })
      showToast('加载失败，请重试')
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
      filtered = filtered.filter(item => item.type === currentTab)
    }

    // 按搜索关键词筛选
    if (searchKeyword) {
      const keyword = searchKeyword.toLowerCase()
      filtered = filtered.filter(
        item =>
          item.title.toLowerCase().includes(keyword) ||
          item.subtitle.toLowerCase().includes(keyword)
      )
    }

    // 按热度排序
    filtered.sort((a, b) => (b.hot_score || 0) - (a.hot_score || 0))

    this.setData({
      filteredActivities: filtered,
      isEmpty: filtered.length === 0
    })

    console.log('✅ 筛选完成，共', filtered.length, '个活动')
  },

  /**
   * Tab切换
   * e - 事件对象
   */
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab

    if (this.data.currentTab === tab) {
      return
    }

    console.log('🔄 Tab切换:', tab)

    this.setData({ currentTab: tab })
    this.filterActivities()
  },

  /**
   * 搜索输入
   * e - 事件对象
   */
  onSearchInput(e) {
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
    console.log('🔄 下拉刷新')

    this.setData({ refreshing: true })

    try {
      // 重新加载活动数据
      await this.initializePage()
      showToast('刷新成功')
    } catch (error) {
      console.error('❌ 刷新失败:', error)
      showToast('刷新失败，请重试')
    } finally {
      wx.stopPullDownRefresh()
      this.setData({ refreshing: false })
    }
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    console.log('📄 已显示全部活动')
  },

  /**
   * 活动点击事件
   * e - 事件对象
   */
  onActivityTap(e) {
    const activity = e.currentTarget.dataset.activity

    if (!activity) {
      return
    }

    console.log('👆 点击活动:', activity.title)

    // 显示活动详情弹窗
    this.showActivityDetail(activity)
  },

  /**
   * 显示活动详情
   * activity - 活动数据
   */
  showActivityDetail(activity) {
    // 构建详情内容
    let content = `${activity.subtitle || ''}\n\n`

    // 状态信息
    const statusText = this.getStatusText(activity.status)
    content += `📋 状态：${statusText}\n`

    // 时间信息
    if (activity.status === 'ongoing' && activity.endTime) {
      const countdown = this.formatCountdown(activity.endTime)
      content += `⏰ 剩余时间：${countdown}\n`
    } else if (activity.status === 'upcoming' && activity.startTime) {
      const startTime = this.formatTime(activity.startTime)
      content += `🕐 开始时间：${startTime}\n`
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
  handleActivityAction(activity) {
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
              url: '/pages/auth/auth'
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
  getStatusText(status) {
    const statusMap = {
      ongoing: '进行中',
      upcoming: '即将开始',
      ended: '已结束'
    }
    return statusMap[status] || '未知'
  },

  /**
   * 格式化时间
   * timestamp - 时间戳
   */
  formatTime(timestamp) {
    if (!timestamp) {
      return '-'
    }

    const date = new Date(timestamp)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')

    return `${year}-${month}-${day} ${hour}:${minute}`
  },

  /**
   * 格式化倒计时
   * endTime - 结束时间戳
   */
  formatCountdown(endTime) {
    const now = Date.now()
    const diff = endTime - now

    if (diff <= 0) {
      return '已结束'
    }

    const days = Math.floor(diff / (24 * 60 * 60 * 1000))
    const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))

    if (days > 0) {
      return `${days}天${hours}小时`
    } else if (hours > 0) {
      return `${hours}小时${minutes}分钟`
    } else {
      return `${minutes}分钟`
    }
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

export {}
