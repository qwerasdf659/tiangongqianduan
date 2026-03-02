/**
 * 用户通知列表页 — 对接通知系统独立化方案B
 *
 * 业务功能:
 *   1. 统一通知列表（按时间倒序，类型标签区分）
 *   2. 下拉刷新 + 上拉加载更多（分页）
 *   3. 点击单条标记已读 + 跳转对应业务页面
 *   4. 全部已读按钮
 *   5. WebSocket 实时推送新通知更新
 *
 * API端点:
 *   GET  /api/v4/user/notifications          — 通知列表
 *   GET  /api/v4/user/notifications/unread-count — 未读数量
 *   POST /api/v4/user/notifications/mark-read    — 批量/全部已读
 *   POST /api/v4/user/notifications/:id/read     — 单条已读
 *
 * @file packageUser/notifications/notifications.ts
 * @version 5.2.0
 * @since 2026-02-25
 */

const { API, Utils, Logger, Constants, ApiWrapper } = require('../../utils/index')
const log = Logger.createLogger('notifications')
const { safeApiCall } = ApiWrapper
const { PAGINATION } = Constants

const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 通知类型 → 前端展示标签映射（对齐文档附录 D.4）
 * type值来自后端 user_notifications.type 字段，不做二次映射
 */
const NOTIFICATION_TYPE_MAP: Record<string, { text: string; tagClass: string }> = {
  listing_created: { text: '交易', tagClass: 'tag-trade' },
  listing_sold: { text: '交易', tagClass: 'tag-trade' },
  listing_withdrawn: { text: '交易', tagClass: 'tag-inactive' },
  listing_expired: { text: '交易', tagClass: 'tag-inactive' },
  purchase_completed: { text: '交易', tagClass: 'tag-purchase' },
  trade_complete_seller: { text: '交易', tagClass: 'tag-trade' },
  trade_complete_buyer: { text: '交易', tagClass: 'tag-purchase' },
  lottery_win: { text: '中奖', tagClass: 'tag-lottery' },
  lottery_result: { text: '中奖', tagClass: 'tag-lottery' },
  exchange_pending: { text: '兑换', tagClass: 'tag-exchange' },
  exchange_approved: { text: '兑换', tagClass: 'tag-purchase' },
  exchange_rejected: { text: '兑换', tagClass: 'tag-rejected' },
  points_change: { text: '积分', tagClass: 'tag-points' },
  announcement: { text: '系统', tagClass: 'tag-system' },
  security_event: { text: '安全', tagClass: 'tag-rejected' }
}

/**
 * 通知类型 → 点击跳转页面路径映射
 * 使用 metadata 中的业务数据辅助构建跳转参数
 */
const NOTIFICATION_LINK_MAP: Record<string, string> = {
  listing_created: '/packageTrade/trade/my-listings/my-listings',
  listing_sold: '/packageTrade/trade/my-orders/my-orders',
  listing_withdrawn: '/packageTrade/trade/my-listings/my-listings',
  listing_expired: '/packageTrade/trade/market/market',
  purchase_completed: '/packageTrade/trade/inventory/inventory',
  trade_complete_seller: '/packageTrade/trade/my-orders/my-orders',
  trade_complete_buyer: '/packageTrade/trade/inventory/inventory',
  lottery_win: '/pages/lottery/lottery',
  lottery_result: '/pages/lottery/lottery',
  exchange_pending: '/pages/exchange/exchange',
  exchange_approved: '/pages/exchange/exchange',
  exchange_rejected: '/pages/exchange/exchange',
  points_change: '/packageUser/points-detail/points-detail'
}

/** 将后端通知类型转为前端展示标签 */
function getTypeTag(notificationType: string): { text: string; tagClass: string } {
  return NOTIFICATION_TYPE_MAP[notificationType] || { text: '通知', tagClass: 'tag-system' }
}

/** 判断通知是否有跳转链接 */
function hasNotificationLink(notificationType: string): boolean {
  return notificationType in NOTIFICATION_LINK_MAP
}

/** 格式化时间显示（今天显示时分，昨天显示"昨天 HH:mm"，更早显示日期） */
function formatNotificationTime(createdAt: string): string {
  if (!createdAt) {
    return ''
  }
  try {
    const date = new Date(createdAt.replace(/-/g, '/'))
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')

    if (diffDays === 0) {
      return `${hours}:${minutes}`
    } else if (diffDays === 1) {
      return `昨天 ${hours}:${minutes}`
    } else if (diffDays < 7) {
      return `${diffDays}天前`
    } else {
      const month = (date.getMonth() + 1).toString().padStart(2, '0')
      const day = date.getDate().toString().padStart(2, '0')
      return `${month}-${day} ${hours}:${minutes}`
    }
  } catch (_formatError) {
    return createdAt
  }
}

/** 为通知列表数据补充前端展示字段（_tagText, _tagClass, _displayTime, _hasLink） */
function enrichNotification(notification: any): any {
  const typeTag = getTypeTag(notification.type)
  return {
    ...notification,
    _tagText: typeTag.text,
    _tagClass: typeTag.tagClass,
    _displayTime: formatNotificationTime(notification.created_at),
    _hasLink: hasNotificationLink(notification.type)
  }
}

Page({
  data: {
    /* 用户状态（MobX绑定） */
    isLoggedIn: false,

    /* 通知列表数据（类型见 typings/api.d.ts → API.UserNotification） */
    notifications: [] as any[],
    unreadCount: 0,

    /* 分页状态 */
    currentPage: 1,
    pageSize: PAGINATION.DEFAULT_PAGE_SIZE,
    totalCount: 0,
    hasMore: true,

    /* 加载状态 */
    loading: true,
    loadingMore: false
  },

  /** MobX Store 绑定实例 */
  _storeBindings: null as any,

  /** WebSocket 订阅页面ID */
  _pageId: 'notifications',

  onLoad() {
    this._storeBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn'],
      actions: []
    })

    if (userStore.isLoggedIn) {
      this.loadNotifications()
      this.loadUnreadCount()
    } else {
      this.setData({ loading: false })
    }
  },

  onShow() {
    if (!userStore.isLoggedIn) {
      return
    }

    const app = getApp() as any

    /* 主动连接WebSocket（修复隐患3：直接从首页跳入时WebSocket可能未连接） */
    const tokenStatus = Utils.checkTokenValidity()
    if (tokenStatus.isValid) {
      app
        .connectWebSocket()
        .then(() => {
          app.subscribeWebSocketMessages(this._pageId, this.handleWebSocketEvent.bind(this))
        })
        .catch((_wsErr: any) => {
          log.warn('[notifications] WebSocket连接失败，回退API拉取')
          app.subscribeWebSocketMessages(this._pageId, this.handleWebSocketEvent.bind(this))
        })
    } else {
      app.subscribeWebSocketMessages(this._pageId, this.handleWebSocketEvent.bind(this))
    }

    if (this.data.notifications.length > 0) {
      this.loadUnreadCount()
    }
  },

  onHide() {
    const app = getApp() as any
    app.unsubscribeWebSocketMessages(this._pageId)
  },

  onUnload() {
    const app = getApp() as any
    app.unsubscribeWebSocketMessages(this._pageId)

    if (this._storeBindings) {
      this._storeBindings.destroyStoreBindings()
    }
  },

  /** 下拉刷新 */
  onPullDownRefresh() {
    this.setData({ currentPage: 1, hasMore: true })
    this.loadNotifications().finally(() => {
      wx.stopPullDownRefresh()
    })
    this.loadUnreadCount()
  },

  /** 上拉加载更多 */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadMoreNotifications()
    }
  },

  /** 加载通知列表（首页/刷新） */
  async loadNotifications(): Promise<void> {
    this.setData({ loading: true })

    const listData = await safeApiCall(
      () =>
        API.getUserNotifications({
          page: 1,
          page_size: this.data.pageSize
        }),
      { context: '获取通知列表', silent: true }
    )

    if (listData && listData.notifications) {
      const enrichedList = listData.notifications.map(enrichNotification)
      const paginationData = listData.pagination || {}
      this.setData({
        notifications: enrichedList,
        currentPage: paginationData.current_page || 1,
        totalCount: paginationData.total_count || 0,
        hasMore: paginationData.has_next || false,
        loading: false
      })
    } else {
      this.setData({ notifications: [], loading: false, hasMore: false })
    }
  },

  /** 加载更多（分页） */
  async loadMoreNotifications(): Promise<void> {
    const nextPage = this.data.currentPage + 1
    this.setData({ loadingMore: true })

    const listData = await safeApiCall(
      () =>
        API.getUserNotifications({
          page: nextPage,
          page_size: this.data.pageSize
        }),
      { context: '加载更多通知', silent: true }
    )

    if (listData && listData.notifications) {
      const enrichedList = listData.notifications.map(enrichNotification)
      const paginationData = listData.pagination || {}
      this.setData({
        notifications: [...this.data.notifications, ...enrichedList],
        currentPage: paginationData.current_page || nextPage,
        hasMore: paginationData.has_next || false,
        loadingMore: false
      })
    } else {
      this.setData({ loadingMore: false, hasMore: false })
    }
  },

  /** 获取未读数量 */
  async loadUnreadCount(): Promise<void> {
    const countData = await safeApiCall(() => API.getUserNotificationUnreadCount(), {
      context: '获取未读数量',
      silent: true
    })

    if (countData && typeof countData.unread_count === 'number') {
      this.setData({ unreadCount: countData.unread_count })
    }
  },

  /** 点击通知项：标记已读 + 跳转业务页面 */
  async handleNotificationTap(e: WechatMiniprogram.TouchEvent): Promise<void> {
    const notification = e.currentTarget.dataset.notification
    if (!notification) {
      return
    }

    if (notification.is_read === 0) {
      const readResult = await safeApiCall(
        () => API.markSingleNotificationAsRead(notification.notification_id),
        { context: '标记已读', silent: true }
      )

      if (readResult) {
        const updatedList = this.data.notifications.map((item: any) => {
          if (item.notification_id === notification.notification_id) {
            return { ...item, is_read: 1 }
          }
          return item
        })
        const newUnreadCount = Math.max(0, this.data.unreadCount - 1)
        this.setData({ notifications: updatedList, unreadCount: newUnreadCount })
      }
    }

    const targetUrl = NOTIFICATION_LINK_MAP[notification.type]
    if (targetUrl) {
      const isTabBarPage =
        targetUrl.startsWith('/pages/lottery/') ||
        targetUrl.startsWith('/pages/exchange/') ||
        targetUrl.startsWith('/pages/user/') ||
        targetUrl.startsWith('/pages/camera/')

      if (isTabBarPage) {
        wx.switchTab({ url: targetUrl })
      } else {
        wx.navigateTo({ url: targetUrl })
      }
    }
  },

  /** 全部已读按钮 */
  async handleMarkAllRead(): Promise<void> {
    if (this.data.unreadCount === 0) {
      return
    }

    const markResult = await safeApiCall(() => API.markNotificationsAsRead([]), {
      context: '全部标记已读'
    })

    if (markResult) {
      const allReadList = this.data.notifications.map((item: any) => ({
        ...item,
        is_read: 1
      }))
      this.setData({ notifications: allReadList, unreadCount: 0 })
      wx.showToast({ title: '已全部标记为已读', icon: 'success', duration: 1500 })
    }
  },

  /** WebSocket 事件处理 — 收到 new_notification 时实时更新列表 */
  handleWebSocketEvent(eventName: string, eventData: any): void {
    if (eventName === 'new_notification' && eventData) {
      log.info('通知页收到实时推送:', eventData)
      const enrichedItem = enrichNotification(eventData)
      this.setData({
        notifications: [enrichedItem, ...this.data.notifications],
        unreadCount: this.data.unreadCount + 1,
        totalCount: this.data.totalCount + 1
      })
    }
  },

  /** 跳转登录页 */
  goToLogin(): void {
    wx.navigateTo({ url: '/packageUser/auth/auth' })
  }
})
