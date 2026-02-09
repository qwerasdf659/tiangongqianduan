// packageAdmin/audit-list/audit-list.ts - 审核列表页面（V4.0）+ MobX响应式状态

const app = getApp()
// 🔴 使用统一的工具函数导入
const { API, Utils, Wechat } = require('../../utils/index')
const { checkAuth } = Utils

// 🆕 MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')

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
 * @version 3.0.0
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
  onLoad(options) {
    console.log('📋 审核列表页面加载')

    // 🆕 MobX Store绑定 - 用户认证状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'userInfo', 'isAdmin', 'userRole'],
      actions: []
    })

    // 🔴 权限验证：必须是管理员
    if (!checkAuth()) {
      console.error('❌ 用户未登录，跳转到登录页')
      return
    }

    // 🔴 权限检查：商家店长(role_level>=40)及以上可访问（从MobX Store获取）
    const userInfo = userStore.userInfo || wx.getStorageSync('user_info')
    const roleLevel = userInfo?.role_level || 0
    const hasAccess = roleLevel >= 40 || userInfo?.is_admin === true

    if (!hasAccess) {
      console.error('❌ 用户无审批权限，role_level:', roleLevel)
      wx.showModal({
        title: '权限不足',
        content: '您没有权限访问此页面，仅商家店长和管理员可查看审核列表。',
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

      console.log('🔍 开始加载待审核记录，页码:', page)

      // 🔴 调用后端API获取待审核记录
      const result = await API.getPendingConsumption({
        page,
        page_size: this.data.page_size
      })

      if (result && result.success && result.data) {
        const { records, pagination } = result.data

        console.log('✅ 待审核记录加载成功:', {
          count: records.length,
          page: pagination.page,
          total: pagination.total
        })

        // 🔴 格式化时间显示（北京时间）
        const formattedRecords = records.map(record => {
          return {
            ...record,
            created_at_formatted: this.formatBeijingTime(record.created_at)
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
    } catch (error) {
      console.error('❌ 加载待审核记录失败:', error)

      wx.showToast({
        title: error.message || '加载失败',
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({
        loading: false,
        refreshing: false
      })
    }
  },

  /**
   * 格式化北京时间显示
   *
   * @description
   * 将后端返回的时间格式化为中文友好格式：2025年11月07日 14:30:15
   * 后端返回的已经是北京时间（GMT+8），前端只需格式化显示。
   *
   * dateTimeString - 后端返回的时间字符串（北京时间，格式：2025-11-07 14:30:15）
   *
   * @example
   * this.formatBeijingTime('2025-11-07 14:30:15')
   * // 返回: "2025年11月07日 14:30:15"
   */
  formatBeijingTime(dateTimeString) {
    if (!dateTimeString) {
      return '时间未知'
    }

    try {
      // 后端返回的已经是北京时间，格式：2025-11-07 14:30:15
      // 转换为中文格式：2025年11月07日 14:30:15
      const date = new Date(dateTimeString.replace(/-/g, '/')) // 兼容iOS

      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      const hour = String(date.getHours()).padStart(2, '0')
      const minute = String(date.getMinutes()).padStart(2, '0')
      const second = String(date.getSeconds()).padStart(2, '0')

      return `${year}年${month}月${day}日 ${hour}:${minute}:${second}`
    } catch (error) {
      console.error('❌ 时间格式化失败:', error)
      return dateTimeString // 格式化失败时返回原始字符串
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
  onApprove(e) {
    const record = e.currentTarget.dataset.record

    console.log('✅ 点击审核通过，记录:', record)

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
  async handleApprove(record) {
    this.setData({ submitting: true })

    try {
      console.log('📤 开始审核通过，记录ID:', record.record_id)

      // 🔴 调用后端API审核通过
      const result = await API.approveConsumption(record.record_id, {
        admin_notes: '核实无误，审核通过'
      })

      console.log('✅ 审核通过成功:', result)

      // 🔴 显示成功提示
      wx.showToast({
        title: result.message || '审核通过',
        icon: 'success',
        duration: 2000
      })

      // 🔴 刷新列表
      setTimeout(() => {
        this.loadPendingRecords(true)
      }, 1500)
    } catch (error) {
      console.error('❌ 审核通过失败:', error)

      wx.showToast({
        title: error.message || '审核失败',
        icon: 'none',
        duration: 2000
      })
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
  onReject(e) {
    const record = e.currentTarget.dataset.record

    console.log('❌ 点击审核拒绝，记录:', record)

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
  onRejectReasonInput(e) {
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
    // 🔴 验证拒绝原因
    if (!this.data.rejectReason || this.data.rejectReason.trim().length < 5) {
      wx.showToast({
        title: '拒绝原因至少5个字符',
        icon: 'none',
        duration: 2000
      })
      return
    }

    this.setData({ submitting: true })

    try {
      console.log('📤 开始审核拒绝，记录ID:', this.data.selectedRecord.record_id)

      // 🔴 调用后端API审核拒绝
      const result = await API.rejectConsumption(this.data.selectedRecord.record_id, {
        admin_notes: this.data.rejectReason.trim()
      })

      console.log('✅ 审核拒绝成功:', result)

      // 🔴 关闭弹窗
      this.setData({
        showRejectModal: false,
        selectedRecord: null,
        rejectReason: ''
      })

      // 🔴 显示成功提示
      wx.showToast({
        title: result.message || '已拒绝',
        icon: 'success',
        duration: 2000
      })

      // 🔴 刷新列表
      setTimeout(() => {
        this.loadPendingRecords(true)
      }, 1500)
    } catch (error) {
      console.error('❌ 审核拒绝失败:', error)

      wx.showToast({
        title: error.message || '拒绝失败',
        icon: 'none',
        duration: 2000
      })
    } finally {
      this.setData({ submitting: false })
    }
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
    console.log('📋 审核列表页面显示')
  },

  /**
   * 生命周期函数 - 监听用户下拉刷新
   */
  onPullDownRefresh() {
    console.log('🔄 下拉刷新')

    this.loadPendingRecords(true).finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 生命周期函数 - 监听用户上拉触底
   */
  onReachBottom() {
    console.log('📄 上拉加载更多')

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
    console.log('📋 审核列表页面卸载')
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
  }
})
