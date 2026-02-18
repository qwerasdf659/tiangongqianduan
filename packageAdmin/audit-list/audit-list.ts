// packageAdmin/audit-list/audit-list.ts - 审核列表页面（V4.0）+ MobX响应式状态

// 统一工具函数导入
const { API, Utils, Wechat, Logger } = require('../../utils/index')
const log = Logger.createLogger('audit-list')
const { checkAuth, formatPhoneNumber } = Utils
const { showToast } = Wechat

// 🆕 MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

/**
 * 从日期字符串中直接提取年月日时分秒（不依赖 new Date() 解析）
 *
 * 微信小程序的JS引擎对 ISO 8601 带时区偏移的字符串（如 "+08:00"）解析不可靠，
 * 使用正则直接提取数字分量，确保100%兼容所有运行环境。
 *
 * @param dateStr - 日期字符串（如 "2026-02-02T03:17:19+08:00" 或 "2026-02-02 03:17:19"）
 * @returns 中文格式时间（如 "2026年02月02日 03:17:19"），解析失败返回原始字符串
 */
function extractDateParts(dateStr: string): string {
  if (!dateStr) {
    return '时间未知'
  }

  const fullMatch = dateStr.match(
    /(\d{4})[/-](\d{1,2})[/-](\d{1,2})[T\s](\d{1,2}):(\d{1,2}):(\d{1,2})/
  )
  if (fullMatch) {
    const [, yr, mo, dy, hr, mi, sc] = fullMatch
    return `${yr}年${mo.padStart(2, '0')}月${dy.padStart(2, '0')}日 ${hr.padStart(2, '0')}:${mi.padStart(2, '0')}:${sc.padStart(2, '0')}`
  }

  const dateOnlyMatch = dateStr.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (dateOnlyMatch) {
    const [, yr, mo, dy] = dateOnlyMatch
    return `${yr}年${mo.padStart(2, '0')}月${dy.padStart(2, '0')}日`
  }

  return dateStr
}

/**
 * 审核列表页面（管理员）
 *
 * @description
 * 管理员查看和审核所有待审核的消费记录。
 *
 * 核心功能：
 * 1. 分页加载待审核消费记录列表
 * 2. 显示用户昵称、手机号码、消费金额、预计积分
 * 3. 审核通过：自动发放积分给用户
 * 4. 审核拒绝：需要填写拒绝原因（至少5个字符）
 *
 * 技术要点：
 * - 支持分页加载（默认20条/页）
 * - 支持下拉刷新
 * - 支持上拉加载更多
 * - 审核操作使用数据库事务（后端实现）
 * - 审核后自动刷新列表
 *
 * @file packageAdmin/audit-list/audit-list.ts
 * @version 5.2.0
 * @since 2026-02-10
 */
Page({
  /**
   * 页面数据
   */
  data: {
    // 列表数据
    records: [], // 消费记录数组

    // 分页参数
    page: 1, // 当前页码
    page_size: 20, // 每页数量
    total: 0, // 总记录数
    total_pages: 0, // 总页数

    // 页面状态
    loading: false, // 加载状态
    refreshing: false, // 下拉刷新状态
    loadingMore: false, // 加载更多状态
    hasMore: true, // 是否还有更多数据

    // 审核状态
    selectedRecord: null, // 选中的消费记录
    showApproveModal: false, // 显示审核通过确认弹窗
    showRejectModal: false, // 显示审核拒绝弹窗
    rejectReason: '', // 拒绝原因
    submitting: false // 审核提交状态
  },

  /**
   * 生命周期函数 - 监听页面加载
   */
  onLoad(_options) {
    log.info('审核列表页面加载')

    // 🆕 MobX Store绑定 - 用户认证状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 🔴 权限验证：必须是管理员
    if (!checkAuth()) {
      log.error('用户未登录，跳转到登录页')
      return
    }

    // 🔴 权限检查：仅管理员(role_level>=100)可访问审批功能（后端console域限制）
    const userInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const roleLevel = userInfo?.role_level || 0
    const hasAccess = roleLevel >= 100

    if (!hasAccess) {
      log.error('用户无审批权限，role_level:', roleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅管理员可查看和审核消费记录。',
        showCancel: false,
        success: () => {
          wx.navigateBack()
        }
      })
      return
    }

    // 🔴 加载待审核记录列表
    this.loadPendingRecords()
  },

  /**
   * 加载待审核消费记录列表
   *
   * @description
   * 调用后端API `GET /api/v4/consumption/pending`
   * 获取分页的待审核记录列表。
   *
   * [isRefresh=false] - 是否是刷新操作
   */
  async loadPendingRecords(isRefresh = false) {
    // 防止重复加载
    if (this.data.loading) {
      return
    }

    this.setData({
      loading: true,
      refreshing: isRefresh
    })

    try {
      // 🔴 刷新时重置页码
      const page = isRefresh ? 1 : this.data.page

      log.info('开始加载待审核记录，页码:', page)

      // 🔴 调用后端API获取待审核记录
      const result = await API.getPendingConsumption({
        page,
        page_size: this.data.page_size
      })

      if (result && result.success && result.data) {
        const { records, pagination } = result.data

        log.info('待审核记录加载成功:', {
          count: records.length,
          page: pagination.page,
          total: pagination.total
        })

        // 🔴 格式化时间显示（北京时间）+ 手机号脱敏
        const formattedRecords = records.map((record: any) => {
          return {
            ...record,
            // 后端 created_at 为对象 { iso, display }，格式化为中文时间
            created_at_formatted: this.formatBeijingTime(record.created_at),
            // 后端返回完整手机号，前端脱敏展示（如 138****5678）
            user_mobile_display: formatPhoneNumber(record.user_mobile)
          }
        })

        // 🔴 更新列表数据
        this.setData({
          records: isRefresh ? formattedRecords : [...this.data.records, ...formattedRecords],
          page: pagination.page,
          total: pagination.total,
          total_pages: pagination.total_pages,
          hasMore: pagination.page < pagination.total_pages
        })
      } else {
        throw new Error(result.message || '加载失败')
      }
    } catch (error: any) {
      log.error('加载待审核记录失败:', error)

      showToast(error.message || '加载失败')
    } finally {
      this.setData({
        loading: false,
        refreshing: false
      })
    }
  },

  /**
   * 格式化北京时间显示（兼容微信小程序JS引擎）
   *
   * 支持格式：
   * 1. 对象 { iso, display } — 后端标准返回格式
   * 2. ISO字符串 "2026-02-02T03:17:19+08:00"
   * 3. 标准字符串 "2026-02-02 03:17:19"
   * 4. Unix时间戳（毫秒）
   *
   * @param dateTimeValue - 后端返回的时间值
   * @returns 中文格式时间字符串（如 "2026年02月02日 03:17:19"）
   */
  formatBeijingTime(dateTimeValue: any): string {
    if (!dateTimeValue) {
      return '时间未知'
    }

    try {
      // 后端返回 created_at 为对象 { iso, display }
      if (typeof dateTimeValue === 'object' && dateTimeValue !== null) {
        if (dateTimeValue.display) {
          return String(dateTimeValue.display)
        }
        if (dateTimeValue.iso) {
          return extractDateParts(String(dateTimeValue.iso))
        }
        return '时间未知'
      }

      // Unix时间戳
      if (typeof dateTimeValue === 'number') {
        const dateObj = new Date(dateTimeValue)
        return isNaN(dateObj.getTime()) ? '时间未知' : extractDateParts(dateObj.toISOString())
      }

      // 字符串格式：使用正则直接提取，不依赖 new Date() 解析
      return extractDateParts(String(dateTimeValue))
    } catch (formatError: any) {
      log.error('时间格式化失败:', formatError, '原始值:', dateTimeValue)
      return typeof dateTimeValue === 'string' ? dateTimeValue : '时间未知'
    }
  },

  /**
   * 点击审核通过按钮
   *
   * e - 事件对象
   * e.currentTarget - 当前目标
   * e.currentTarget.dataset - 数据集
   * e.currentTarget.dataset.record - 消费记录
   */
  onApprove(e: any) {
    const record = e.currentTarget.dataset.record

    log.info('点击审核通过，记录:', record)

    // 二次确认
    wx.showModal({
      title: '确认审核通过',
      content: `用户：${record.user_nickname || record.user_mobile}\n消费金额：¥${record.consumption_amount}元\n预计积分：${record.points_to_award}分\n\n审核通过后，积分将自动发放给用户，此操作不可撤销。`,
      success: async res => {
        if (res.confirm) {
          await this.handleApprove(record)
        }
      }
    })
  },

  /**
   * 处理审核通过
   *
   * @description
   * 调用后端API `POST /api/v4/consumption/approve/:record_id`
   * 审核通过消费记录，自动发放积分给用户。
   *
   * record - 消费记录
   */
  async handleApprove(record: any) {
    this.setData({ submitting: true })

    try {
      log.info('开始审核通过，记录ID:', record.record_id)

      // 🔴 调用后端API审核通过
      const result = await API.approveConsumption(record.record_id, {
        admin_notes: '核实无误，审核通过'
      })

      log.info('审核通过成功:', result)

      showToast(result.message || '审核通过', 'success')

      // 刷新列表
      setTimeout(() => {
        this.loadPendingRecords(true)
      }, 1500)
    } catch (error: any) {
      log.error('审核通过失败:', error)

      showToast(error.message || '审核失败')
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 点击审核拒绝按钮
   *
   * e - 事件对象
   * e.currentTarget - 当前目标
   * e.currentTarget.dataset - 数据集
   * e.currentTarget.dataset.record - 消费记录
   */
  onReject(e: any) {
    const record = e.currentTarget.dataset.record

    log.info('点击审核拒绝，记录:', record)

    // 显示拒绝原因输入弹窗
    this.setData({
      selectedRecord: record,
      showRejectModal: true,
      rejectReason: ''
    })
  },

  /**
   * 拒绝原因输入事件
   *
   * e - 事件对象
   * e.detail - 事件详情
   * e.detail.value - 输入的拒绝原因
   */
  onRejectReasonInput(e: any) {
    const reason = e.detail.value

    this.setData({
      rejectReason: reason
    })
  },

  /**
   * 确认审核拒绝
   *
   * @description
   * 调用后端API `POST /api/v4/consumption/reject/:record_id`
   * 审核拒绝消费记录，需要填写拒绝原因。
   *
   */
  async confirmReject() {
    // 验证拒绝原因（至少5个字符，防止审核敷衍）
    if (!this.data.rejectReason || this.data.rejectReason.trim().length < 5) {
      showToast('拒绝原因至少5个字符')
      return
    }

    this.setData({ submitting: true })

    try {
      log.info('开始审核拒绝，记录ID:', this.data.selectedRecord.record_id)

      // 🔴 调用后端API审核拒绝
      const result = await API.rejectConsumption(this.data.selectedRecord.record_id, {
        admin_notes: this.data.rejectReason.trim()
      })

      log.info('审核拒绝成功:', result)

      // 🔴 关闭弹窗
      this.setData({
        showRejectModal: false,
        selectedRecord: null,
        rejectReason: ''
      })

      showToast(result.message || '已拒绝', 'success')

      // 刷新列表
      setTimeout(() => {
        this.loadPendingRecords(true)
      }, 1500)
    } catch (error: any) {
      log.error('审核拒绝失败:', error)

      showToast(error.message || '拒绝失败')
    } finally {
      this.setData({ submitting: false })
    }
  },

  /**
   * 阻止事件冒泡（用于弹窗内容区域，防止点击穿透到遮罩层）
   */
  stopPropagation() {
    // 空方法，仅用于catchtap阻止事件冒泡
  },

  /**
   * 取消审核拒绝
   */
  cancelReject() {
    this.setData({
      showRejectModal: false,
      selectedRecord: null,
      rejectReason: ''
    })
  },

  /**
   * 生命周期函数 - 监听页面显示
   */
  onShow() {
    log.info('审核列表页面显示')
  },

  /**
   * 生命周期函数 - 监听用户下拉刷新
   */
  onPullDownRefresh() {
    log.info('下拉刷新')

    this.loadPendingRecords(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 生命周期函数 - 监听用户上拉触底
   */
  onReachBottom() {
    log.info('上拉加载更多')

    // 🔴 判断是否还有更多数据
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) {
      return
    }

    // 🔴 加载下一页
    this.setData({
      page: this.data.page + 1,
      loadingMore: true
    })

    this.loadPendingRecords(false).finally(() => {
      this.setData({ loadingMore: false })
    })
  },

  /**
   * 生命周期函数 - 监听页面卸载
   */
  onUnload() {
    log.info('审核列表页面卸载')
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})

export {}
