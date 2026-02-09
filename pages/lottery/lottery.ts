// pages/lottery/lottery.ts - V4.0抽奖页面 + MobX响应式状态

const app = getApp()
// 🔴 统一工具函数导入
const { Wechat, API, Utils, Constants } = require('../../utils/index')
const { showToast } = Wechat
const { checkAuth } = Utils
const { LOTTERY, DELAY } = Constants
// 🆕 MobX Store绑定 - 替代手动globalData取值
const { createStoreBindings } = require('mobx-miniprogram-bindings')
const { userStore } = require('../../store/user')
const { pointsStore } = require('../../store/points')
const { lotteryStore } = require('../../store/lottery')

/**
 * V4.0抽奖页面 - 餐厅积分抽奖系统
 * 🎰 V4.0统一抽奖引擎 - 使用campaign_code标识
 * 📊 支持3x3网格布局、区域轮流发亮效果、多连抽功能
 */
Page({
  data: {
    // 🔴 用户状态
    isLoggedIn: false,
    isAdmin: false, // 🆕 是否是管理员（用于显示管理员功能条）
    pointsBalance: 0,
    frozenPoints: 0, // 🆕 冻结积分（从后端API获取）
    userInfo: {},

    // 🆕 响应式字体类
    pointsClass: '', // 可用积分字体类
    frozenClass: '', // 冻结积分字体类（数据加载前为空）

    // 🆕 格式化显示的积分（带千分位）
    pointsBalanceFormatted: '0', // 可用积分格式化
    frozenPointsFormatted: '0', // 冻结积分格式化（初始为0，由后端API返回真实值）

    // 二维码相关数据（V2动态码：5分钟有效期 + 倒计时 + 过期机制）
    qrCodeImage: '', // 二维码图片临时路径
    qrCodeEnlarged: false, // 二维码是否放大显示
    qrCountdown: 300, // 二维码倒计时剩余秒数（默认5分钟）
    qrExpired: false, // 二维码是否已过期
    qrCountdownText: '5:00', // 格式化后的倒计时文字
    qrExpiresAt: 0, // 二维码过期时间戳（毫秒数）

    // 🆕 审核记录相关数据
    auditRecordsCount: 0, // 审核记录数量（用于徽章显示）
    auditRecordsData: [], // 审核记录详细数据
    showAuditModal: false, // 是否显示审核记录弹窗
    auditRecordsLoading: false, // 审核记录加载状态

    // 🎨 弹窗横幅相关数据（后端API: GET /api/v4/system/popup-banners）
    showPopupBanner: false, // 是否显示弹窗横幅
    popupBanners: [], // 横幅数据列表

    // 🔴 抽奖配置（从后端获取）
    // ⚠️ 初始值为 null 表示"尚未从后端加载"
    lotteryEnabled: false,
    lotteryConfig: {
      // 单次抽奖消耗（必须从后端获取）
      costPerDraw: null,
      // 每日最大抽奖次数
      maxDrawsPerDay: null
    },
    // 单次抽奖消耗（必须从后端获取）
    costPoints: null,

    // 🆕 连抽定价配置（从后端draw_pricing字段获取）
    // 参考文档：连抽按钮积分显示-前后端对接规范_V1.0.md
    drawPricing: {
      three: { total_cost: null, count: 3, label: '3连抽' },
      five: { total_cost: null, count: 5, label: '5连抽' },
      ten: { total_cost: null, count: 10, label: '10连抽', discount: 1.0 }
    },

    // 🔴 奖品列表（必须从后端API获取，不使用硬编码）
    prizes: [],

    // 抽奖状态
    isLotteryInProgress: false,
    highlightAnimation: false,
    currentHighlight: -1,
    winningIndex: -1,
    drawResult: null,
    showResult: false,

    // 🆕 多连抽逐个揭晓状态
    multiDrawCurrentIndex: 0, // 当前揭晓到第几个奖品（0开始）
    multiDrawRevealing: false, // 是否正在播放揭晓动画

    // 页面状态
    loading: true
  },

  /**
   * 生命周期函数 - 监听页面加载
   *
   * @description
   * 页面首次加载时调用，执行抽奖页面初始化操作。
   *
   * options - 页面参数对象
   * [options.scene] - 场景值
   *
   * @example
   * // 微信小程序自动调用
   * onLoad({ scene: '1001' })
   */
  onLoad(options) {
    console.log('🎰 抽奖页面加载', options)

    // 🆕 MobX Store绑定 - 用户/积分/抽奖状态自动同步
    this.userBindings = createStoreBindings(this, {
      store: userStore,
      fields: ['isLoggedIn', 'isAdmin'],
      actions: []
    })
    this.pointsBindings = createStoreBindings(this, {
      store: pointsStore,
      fields: {
        pointsBalance: () => pointsStore.availableAmount,
        frozenPoints: () => pointsStore.frozenAmount
      },
      actions: ['setBalance']
    })
    this.lotteryBindings = createStoreBindings(this, {
      store: lotteryStore,
      fields: ['isDrawing', 'currentHighlight'],
      actions: ['setPrizes', 'setConfig', 'setDrawing', 'setHighlight']
    })

    // 🔴 标记首次加载：首次加载时loading状态由initializePage统一控制
    // 确保页面内容和弹窗横幅同时出现，避免页面先显示、弹窗后弹出的体验问题
    this._isFirstLoad = true
    // 🆕 检查管理员权限（用于显示管理员功能条）
    this.checkAdminRole()
    this.initializePage()
  },

  /**
   * 🔴 生命周期函数 - 页面初次渲染完成
   *
   * @description
   * 页面初次渲染完成时触发，此时Canvas等DOM元素已经准备就绪。
   * 这是执行Canvas操作的最佳时机，确保避免"canvas is empty"错误。
   *
   * 重要：
   * - Canvas操作必须在onReady中进行，而不是onShow
   * - onReady只在页面首次加载时调用一次
   * - 此时DOM已完全渲染，可以安全地操作Canvas
   *
   *
   * @example
   * // 微信小程序自动调用
   * onReady()
   */
  onReady() {
    console.log('🎰 抽奖页面渲染完成（Canvas已准备就绪）')

    // 🆕 在Canvas准备就绪后生成用户身份二维码
    // 这是Canvas操作的最佳时机，确保DOM元素已完全渲染
    if (this.data.userInfo && this.data.userInfo.user_id) {
      console.log('✅ onReady中生成二维码（推荐时机）')
      this.generateUserQRCode()
    } else {
      console.warn('⚠️ onReady时用户信息未就绪，将在onShow中生成')
    }
  },

  /**
   * 生命周期函数 - 监听页面显示
   *
   * @description
   * 每次页面显示时调用，更新用户状态和积分数据。
   * 包括从其他页面返回、从后台切换到前台。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onShow()
   */
  async onShow() {
    console.log('🎰 抽奖页面显示')

    // 🔴 首次加载时不在这里设置loading:false
    // 首次加载的loading状态由initializePage统一控制（等待页面数据+弹窗图片全部就绪后再显示）
    // 避免页面先出现、弹窗后弹出的体验问题
    if (!this._isFirstLoad) {
      this.setData({
        loading: false,
        isLotteryInProgress: false
      })
    }
    // 💡 loading由APIClient自动处理，无需手动hideLoading

    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.warn('⚠️ 用户未登录，已自动跳转')
      return
    }

    // 🔧 修复：确保用户信息完整性
    const globalData = app.globalData
    let userInfo = globalData.userInfo

    // 🔴 如果globalData.userInfo为空，尝试从Storage或JWT Token恢复
    if (!userInfo || !userInfo.user_id) {
      console.warn('⚠️ globalData.userInfo缺失，尝试从Storage恢复')
      userInfo = wx.getStorageSync('user_info')

      // 🔴 如果Storage也没有，尝试从JWT Token中解析
      if (!userInfo || !userInfo.user_id) {
        console.warn('⚠️ Storage中也没有userInfo，尝试从JWT Token恢复')
        const token = wx.getStorageSync('access_token')

        if (token) {
          try {
            const { decodeJWTPayload } = Utils
            const jwtPayload = decodeJWTPayload(token)

            if (jwtPayload && jwtPayload.user_id) {
              // 从JWT Token重建userInfo
              userInfo = {
                user_id: jwtPayload.user_id,
                mobile: jwtPayload.mobile,
                nickname: jwtPayload.nickname || '用户',
                status: jwtPayload.status,
                is_admin: jwtPayload.is_admin || false,
                user_role: jwtPayload.user_role || 'user',
                role_level: jwtPayload.role_level || 0,
                iat: jwtPayload.iat,
                exp: jwtPayload.exp
              }

              // 保存到Storage和globalData
              wx.setStorageSync('user_info', userInfo)
              app.globalData.userInfo = userInfo

              console.log('✅ 从JWT Token恢复userInfo成功:', {
                user_id: userInfo.user_id,
                mobile: userInfo.mobile,
                nickname: userInfo.nickname,
                is_admin: userInfo.is_admin
              })
            } else {
              throw new Error('JWT Token中缺少用户信息')
            }
          } catch (jwtError) {
            console.error('❌ 从JWT Token恢复userInfo失败:', jwtError)
            wx.showToast({
              title: '登录信息异常，请重新登录',
              icon: 'none',
              duration: 2000
            })
            setTimeout(() => {
              wx.redirectTo({
                url: '/pages/auth/auth'
              })
            }, 2000)
            return
          }
        } else {
          console.error('❌ Token也不存在，需要重新登录')
          wx.showToast({
            title: '未登录，请先登录',
            icon: 'none',
            duration: 2000
          })
          setTimeout(() => {
            wx.redirectTo({
              url: '/pages/auth/auth'
            })
          }, 2000)
          return
        }
      } else {
        // Storage中有userInfo，恢复到globalData
        app.globalData.userInfo = userInfo
        console.log('✅ 从Storage恢复userInfo成功:', {
          user_id: userInfo.user_id,
          mobile: userInfo.mobile,
          nickname: userInfo.nickname
        })
      }
    }

    // 🔴 更新页面显示数据（从MobX Store获取，不再依赖globalData）
    const pointsBalance = pointsStore.availableAmount || 0
    const frozenPoints = pointsStore.frozenAmount || 0

    this.setData({
      isLoggedIn: true,
      pointsBalance,
      userInfo,
      // 🔴 更新用户昵称显示
      userNickname: userInfo.nickname || userInfo.mobile || '用户',
      // 🆕 响应式字体类
      pointsClass: this.getNumberClass(pointsBalance),
      frozenClass: this.getNumberClass(frozenPoints),
      // 🆕 格式化显示（千分位）
      pointsBalanceFormatted: this.formatNumberWithComma(pointsBalance),
      frozenPointsFormatted: this.formatNumberWithComma(frozenPoints)
    })

    console.log('📊 页面数据已更新:', {
      isLoggedIn: this.data.isLoggedIn,
      pointsBalance: this.data.pointsBalance,
      userNickname: this.data.userNickname,
      hasUserInfo: !!this.data.userInfo,
      user_id: this.data.userInfo?.user_id
    })

    // 🔴 决策7：加载弹窗横幅
    // 首次加载时由initializePage中的Promise.all统一处理（与抽奖数据并行加载）
    // 非首次（从其他页面返回）时才在这里单独加载
    if (!this._isFirstLoad) {
      this.loadPopupBanners()
    }

    // 🆕 加载消费记录数量（替代原审核记录，决策改用消费记录+status筛选）
    await this.loadConsumptionRecordsCount()

    // V2动态码：从后台恢复时检查二维码是否过期
    if (this.data.qrExpiresAt) {
      const now = Date.now()
      if (now >= this.data.qrExpiresAt) {
        // 二维码已过期
        if (this._qrTimer) {
          clearInterval(this._qrTimer)
        }
        this.setData({
          qrCountdown: 0,
          qrExpired: true,
          qrCountdownText: '已过期'
        })
      }
    }

    // 生成用户身份二维码（仅在首次显示且尚未生成时）
    if (!this.data.qrCodeImage && this.data.userInfo && this.data.userInfo.user_id) {
      console.log('🔄 onShow中生成二维码（onReady未生成）')
      this.generateUserQRCode()
    }

    // 🔴 刷新数据
    this.refreshData()
  },

  /**
   * 初始化抽奖页面
   *
   * @description
   * 页面初始化的核心方法，执行以下流程：
   * 1. 显示加载提示
   * 2. 检查用户登录状态
   * 3. 加载抽奖数据（积分、奖品列表、抽奖配置）
   * 4. 异常处理：提供重试选项
   *
   *
   *
   * @example
   * // 页面加载时调用
   * await this.initializePage()
   */
  async initializePage() {
    try {
      // 💡 loading由loadLotteryData中的API调用自动处理

      // 🔴 使用统一的认证检查
      if (!checkAuth()) {
        console.warn('⚠️ 用户未登录，已自动跳转')
        // 🔧 修复：即使跳转到登录页也要重置loading状态
        this.setData({ loading: false })
        return
      }

      // 🔴 并行加载：抽奖数据和弹窗横幅同时加载，确保页面和弹窗同时出现
      await Promise.all([
        this.loadLotteryData(),
        this.loadPopupBanners().catch(err => {
          console.error('❌ 弹窗横幅并行加载失败（不影响主功能）:', err)
        })
      ])
    } catch (error) {
      console.error('❌ 抽奖页面初始化失败', error)
      showToast('页面加载失败')
      // 🔧 修复：出错时提供用户友好的提示和重试选项
      wx.showModal({
        title: '页面加载失败',
        content: '抽奖页面初始化失败，可能是网络问题或后端服务异常。\n\n请检查网络连接后重试。',
        showCancel: true,
        cancelText: '稍后再试',
        confirmText: '重新加载',
        success: res => {
          if (res.confirm) {
            this.initializePage()
          }
        }
      })
    } finally {
      // 🔴 核心：单次setData同时移除loading遮罩 + 显示弹窗
      // 确保页面内容和弹窗横幅在同一渲染帧出现，用户不会看到"先页面后弹窗"
      const finalData = {
        loading: false,
        isLotteryInProgress: false
      }

      // 如果有预准备好的弹窗横幅数据，一并设置（同一帧显示）
      if (this._preparedBanners && this._preparedBanners.length > 0) {
        finalData.popupBanners = this._preparedBanners
        finalData.showPopupBanner = true
        this._preparedBanners = null // 清理临时数据
        console.log('✅ 弹窗横幅将与页面同步显示')
      }

      // 🔴 单次setData：loading遮罩消失 + 页面内容出现 + 弹窗出现 = 同一帧
      this.setData(finalData)

      // 标记首次加载完成，后续onShow不再走首次加载逻辑
      this._isFirstLoad = false
      console.log('✅ initializePage完成，页面和弹窗同时显示')
    }
  },

  // 🔴 已删除 checkLoginStatus() 方法，现在使用统一的 checkAuth() 从 auth-helper.ts

  /**
   * 生成用户V2动态身份二维码
   *
   * @description
   * V2动态码特性：QRV2_前缀、5分钟有效期、HMAC-SHA256签名、一次性nonce
   * 使用Canvas 2D渲染 + weapp-qrcode库 + H级纠错（30%容错能力）
   *
   * 后端接口：GET /api/v4/shop/consumption/qrcode/:user_id
   *
   */
  async generateUserQRCode() {
    try {
      const userInfo = this.data.userInfo || app.globalData.userInfo

      if (!userInfo || !userInfo.user_id) {
        console.error('❌ 用户信息不完整')
        showToast('请先登录', 'none', 2000)
        return
      }

      // 调用后端API生成V2动态二维码
      const qrCodeResult = await API.getUserQRCode(userInfo.user_id)

      if (!qrCodeResult || !qrCodeResult.success) {
        console.error('❌ 生成V2二维码失败:', qrCodeResult?.message)
        showToast(qrCodeResult?.message || '生成二维码失败', 'none', 2000)
        return
      }

      const qrCodeData = qrCodeResult.data
      const qrContent = qrCodeData.qr_code // V2动态码字符串（QRV2_开头）

      // 计算过期时间戳（expires_at 可能是对象或字符串）
      let expiresTimestamp = 0
      if (qrCodeData.expires_at && typeof qrCodeData.expires_at === 'object') {
        expiresTimestamp = qrCodeData.expires_at.timestamp
      } else {
        expiresTimestamp = new Date(qrCodeData.expires_at).getTime()
      }

      console.log('🔄 开始生成V2动态二维码...', {
        user_id: qrCodeData.user_id,
        qr_code_length: qrContent.length,
        expires_at: expiresTimestamp
      })

      const drawQrcode = require('../../utils/weapp-qrcode')

      // 生成正方形高分辨率二维码（428×428）
      drawQrcode({
        canvasId: 'qrcodeCanvas',
        text: qrContent,
        width: 428,
        height: 428,
        typeNumber: -1,
        correctLevel: 2, // H级纠错
        background: '#ffffff',
        foreground: '#000000',
        callback: () => {
          // 延迟500ms确保Canvas完全渲染后再转换图片
          setTimeout(() => {
            wx.canvasToTempFilePath(
              {
                canvasId: 'qrcodeCanvas',
                width: 428,
                height: 428,
                destWidth: 428,
                destHeight: 428,
                success: tempRes => {
                  // 计算倒计时剩余秒数
                  const remaining = Math.max(0, Math.floor((expiresTimestamp - Date.now()) / 1000))
                  const minutes = Math.floor(remaining / 60)
                  const seconds = remaining % 60
                  const countdownText = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`

                  this.setData({
                    qrCodeImage: tempRes.tempFilePath,
                    qrCountdown: remaining,
                    qrExpired: false,
                    qrCountdownText: countdownText,
                    qrExpiresAt: expiresTimestamp
                  })

                  // 启动倒计时
                  this.startQrCountdown()

                  console.log('✅ V2动态二维码生成成功:', {
                    path: tempRes.tempFilePath,
                    remaining_seconds: remaining,
                    expires_at: expiresTimestamp
                  })
                },
                fail: err => {
                  console.error('❌ 二维码转图片失败:', err)
                  wx.showToast({ title: '二维码生成失败', icon: 'none', duration: 2000 })
                }
              },
              this
            )
          }, 500)
        }
      })
    } catch (error) {
      console.error('❌ 生成V2二维码异常:', error)
      wx.showToast({
        title: `二维码生成异常: ${error.message}`,
        icon: 'none',
        duration: 2000
      })
    }
  },

  /**
   * V2二维码倒计时
   *
   * 每秒递减 qrCountdown，归零时设置 qrExpired = true。
   */
  startQrCountdown() {
    // 清除旧定时器
    if (this._qrTimer) {
      clearInterval(this._qrTimer)
    }

    this._qrTimer = setInterval(() => {
      const remaining = this.data.qrCountdown - 1

      if (remaining <= 0) {
        clearInterval(this._qrTimer)
        this._qrTimer = null
        this.setData({
          qrCountdown: 0,
          qrExpired: true,
          qrCountdownText: '已过期'
        })
        return
      }

      // 格式化为 M:SS
      const minutes = Math.floor(remaining / 60)
      const seconds = remaining % 60
      this.setData({
        qrCountdown: remaining,
        qrCountdownText: `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`
      })
    }, 1000)
  },

  /**
   * 刷新V2动态二维码（用户点击"刷新"或过期后点击"点击刷新"时调用）
   */
  onRefreshQRCode() {
    this.setData({
      qrCodeImage: '',
      qrExpired: false,
      qrCountdown: 300,
      qrCountdownText: '5:00'
    })
    this.generateUserQRCode()
  },

  /**
   * 加载抽奖页面数据
   *
   * @description
   * 从后端API加载抽奖页面所需的所有数据：
   * 1. 用户积分余额（getPointsBalance API）
   * 2. 奖品列表（getLotteryPrizes API，campaign_code='BASIC_LOTTERY'）
   * 3. 抽奖配置（getLotteryConfig API，包含免费次数、消耗积分、最大连抽等）
   *
   * 数据加载完成后自动更新页面显示。
   *
   *
   *
   * @example
   * // 页面初始化时调用
   * await this.loadLotteryData()
   *
   * @example
   * // 下拉刷新时调用
   * await this.loadLotteryData()
   */
  async loadLotteryData() {
    try {
      // 🔴 第1步：获取用户积分余额（V4.0文档规范）
      // 💡 loading由APIClient自动处理，无需手动showLoading
      console.log('💰 第1步：获取用户积分余额...')
      try {
        const { getPointsBalance } = API
        const balanceResult = await getPointsBalance()

        if (balanceResult && balanceResult.success && balanceResult.data) {
          // 后端资产余额API返回字段：available_amount（可用余额）、frozen_amount（冻结余额）
          const points = balanceResult.data.available_amount || 0
          const frozen = balanceResult.data.frozen_amount || 0
          console.log('✅ 积分余额获取成功:', { available: points, frozen })

          // 更新积分（同步到globalData和MobX Store）
          app.updatePointsBalance(points, frozen)

          // 立即更新页面显示（包含可用积分和冻结积分）
          // 🔴 使用后端真实数据，frozen_amount由后端资产API返回
          this.setData({
            pointsBalance: points,
            frozenPoints: frozen, // ✅ 使用后端返回的真实冻结积分
            // 🆕 响应式字体类
            pointsClass: this.getNumberClass(points),
            frozenClass: this.getNumberClass(frozen),
            // 🆕 格式化显示（千分位）
            pointsBalanceFormatted: this.formatNumberWithComma(points),
            frozenPointsFormatted: this.formatNumberWithComma(frozen)
          })
        } else {
          console.warn('⚠️ 积分余额API返回失败，使用MobX Store缓存值')
          const storePoints = pointsStore.availableAmount || 0
          const storeFrozen = pointsStore.frozenAmount || 0
          this.setData({
            pointsBalance: storePoints,
            frozenPoints: storeFrozen,
            pointsClass: this.getNumberClass(storePoints),
            frozenClass: this.getNumberClass(storeFrozen),
            pointsBalanceFormatted: this.formatNumberWithComma(storePoints),
            frozenPointsFormatted: this.formatNumberWithComma(storeFrozen)
          })
        }
      } catch (pointsError) {
        console.error('❌ 获取积分余额异常:', pointsError)
        // 使用MobX Store缓存值
        const storePoints = pointsStore.availableAmount || 0
        const storeFrozen = pointsStore.frozenAmount || 0
        this.setData({
          pointsBalance: storePoints,
          frozenPoints: storeFrozen,
          pointsClass: this.getNumberClass(storePoints),
          frozenClass: this.getNumberClass(storeFrozen),
          pointsBalanceFormatted: this.formatNumberWithComma(storePoints),
          frozenPointsFormatted: this.formatNumberWithComma(storeFrozen)
        })
      }

      // 🔴 第2步：获取奖品列表（V4.0文档规范 Line 1143-1253）
      // 💡 loading和错误提示由APIClient自动处理
      console.log('🎁 第2步：获取奖品列表...')
      const { getLotteryPrizes, getLotteryConfig } = API
      let prizesData = []

      try {
        const prizesResult = await getLotteryPrizes('BASIC_LOTTERY')

        if (prizesResult && prizesResult.success && prizesResult.data) {
          prizesData = Array.isArray(prizesResult.data) ? prizesResult.data : []
          console.log('✅ 奖品列表获取成功:', {
            count: prizesData.length,
            prizes: prizesData.map(p => ({
              id: p.id,
              name: p.name,
              type: p.type,
              icon: p.icon
            }))
          })
        } else {
          console.error('❌ 奖品列表API返回失败:', prizesResult?.message)
          // 💡 错误提示由APIClient自动显示
        }
      } catch (prizesError) {
        console.error('❌ 获取奖品列表异常:', prizesError)
        // 💡 错误提示由APIClient自动显示
      }

      // 🔴 第3步：获取抽奖配置（V4.0文档规范 Line 1256-1299）
      console.log('📊 第3步：获取抽奖配置...')
      const configResult = await getLotteryConfig('BASIC_LOTTERY')

      if (configResult && configResult.success) {
        console.log('✅ 抽奖配置加载成功:', configResult.data)

        // 🔴 数据转换：统一处理后端返回的snake_case字段
        const configData = configResult.data

        // 🚨 严格验证：后端必须返回所有必要的业务配置字段
        // 🔴 V4.0修正: 使用API文档标准字段名 cost_per_draw（文档Line 2918, 2953, 2998）
        if (!configData.cost_per_draw && configData.cost_per_draw !== 0) {
          console.error('❌ 后端配置缺失: cost_per_draw')
          wx.showModal({
            title: '后端配置缺失',
            content: '后端未返回 cost_per_draw（单次抽奖消耗）字段\n\n请检查后端API配置',
            showCancel: false,
            confirmText: '我知道了'
          })
          return
        }

        const drawCost = configData.cost_per_draw

        // 🔴 格式化奖品数据：统一字段名称（V4.0规范 - sort_order字段已修复）
        const formattedPrizes = prizesData.map(prize => ({
          // 🎯 统一字段名称
          id: prize.id || prize.prize_id,
          prizeName: prize.name || prize.prize_name,
          name: prize.name || prize.prize_name,
          type: prize.type || prize.prize_type || 'unknown',
          icon: prize.icon || '🎁',
          rarity: prize.rarity || 'common',
          available: prize.available !== false,
          displayValue: prize.display_value || prize.displayValue || '',
          status: prize.status || 'active',

          // ✅ V4.0新增：后端已修复的sort_order字段（用于计算中奖索引）
          sort_order: prize.sort_order
        }))

        // 🔴 V2.2适配：后端返回draw_buttons数组格式（非旧版draw_pricing对象）
        // 后端响应: draw_buttons: [{ draw_count, discount, label, per_draw, total_cost, original_cost, saved_points }]
        // 前端需要转换为 drawPricing 结构供WXML模板和积分校验使用
        const drawButtons = configData.draw_buttons || []
        console.log('🔍 后端返回的draw_buttons配置:', drawButtons)

        // 🔴 将draw_buttons数组转换为前端drawPricing结构
        // 通过draw_count字段匹配：1=单抽, 3=三连抽, 5=五连抽, 10=十连抽
        const findButton = count => drawButtons.find(btn => btn.draw_count === count)
        const btnThree = findButton(3)
        const btnFive = findButton(5)
        const btnTen = findButton(10)

        const drawPricingData = {
          three: {
            total_cost: btnThree ? btnThree.total_cost : drawCost * 3,
            count: 3,
            label: btnThree ? btnThree.label : '3连抽',
            discount: btnThree ? btnThree.discount : 1
          },
          five: {
            total_cost: btnFive ? btnFive.total_cost : drawCost * 5,
            count: 5,
            label: btnFive ? btnFive.label : '5连抽',
            discount: btnFive ? btnFive.discount : 1
          },
          ten: {
            total_cost: btnTen ? btnTen.total_cost : drawCost * 10,
            count: 10,
            label: btnTen ? btnTen.label : '10连抽',
            discount: btnTen ? btnTen.discount : 1.0
          }
        }

        console.log('✅ draw_buttons → drawPricing转换完成:', drawPricingData)

        // 更新页面数据
        this.setData({
          lotteryEnabled: configData.status === 'active',
          lotteryConfig: {
            campaign_id: configData.campaign_id,
            campaign_name: configData.campaign_name,
            // ✅ 单次抽奖价格从后端获取
            costPerDraw: drawCost,
            // 每日最大抽奖次数
            maxDrawsPerDay:
              configData.max_draws_per_user_daily || configData.max_draws_per_day || 50
          },
          // ✅ 单次抽奖价格（供积分校验使用）
          costPoints: drawCost,
          // 🆕 连抽定价配置（从后端获取）
          drawPricing: drawPricingData,
          prizes: formattedPrizes
          // 注意：pointsBalance已在上面单独更新
        })

        console.log('✅ 页面数据更新完成:', {
          prizesCount: this.data.prizes.length,
          costPoints: this.data.costPoints,
          pointsBalance: this.data.pointsBalance,
          lotteryEnabled: this.data.lotteryEnabled,
          // 🔴 连抽价格从后端draw_pricing获取
          drawPricing: this.data.drawPricing,
          prizes: this.data.prizes
        })

        // ✅ V4.0规范：验证sort_order字段（用于计算中奖索引）
        const missingFields = this.data.prizes.filter(prize => {
          return prize.sort_order === undefined || prize.sort_order === null
        })

        if (missingFields.length > 0) {
          console.error('❌ 警告：部分奖品缺少sort_order字段！', {
            missingCount: missingFields.length,
            affectedPrizes: missingFields.map(p => ({
              id: p.id,
              name: p.name,
              sort_order: p.sort_order
            }))
          })
          wx.showModal({
            title: '数据不完整',
            content: `检测到${missingFields.length}个奖品缺少sort_order字段，这会导致抽奖功能异常。\n\n请联系管理员检查后端配置。`,
            showCancel: false
          })
        } else {
          console.log('✅ sort_order字段验证通过，抽奖功能正常')
        }

        // 🔴 验证关键数据
        if (formattedPrizes.length === 0) {
          console.error('❌ 警告：奖品列表为空！这会导致抽奖时显示"未知奖品"')
          wx.showModal({
            title: '数据异常',
            content: '奖品列表为空，请联系管理员检查后端抽奖配置。',
            showCancel: false
          })
        }
      } else {
        console.error('❌ 抽奖配置加载失败:', configResult?.message)
        showToast(configResult?.message || '加载抽奖配置失败')

        // 保护措施：即使配置失败，也要保留已获取的奖品列表
        this.setData({
          prizes: prizesData.map(prize => ({
            id: prize.id,
            prizeName: prize.name,
            name: prize.name,
            type: prize.type,
            icon: prize.icon || '🎁',
            // ✅ V4.0规范：包含sort_order字段
            sort_order: prize.sort_order
          })),
          lotteryEnabled: false
        })
      }
    } catch (error) {
      console.error('❌ 加载抽奖数据异常:', error)
      showToast(`数据加载异常: ${error.message}`)

      // 🛡️ 保护措施
      this.setData({
        prizes: [],
        lotteryEnabled: false
      })

      // 🔴 提供详细错误信息给用户
      wx.showModal({
        title: '数据加载失败',
        content: `无法加载抽奖数据，可能原因：\n1. 网络连接异常\n2. 后端服务异常\n3. Token已过期\n\n错误详情：${error.message}`,
        showCancel: true,
        cancelText: '稍后再试',
        confirmText: '重新加载',
        success: res => {
          if (res.confirm) {
            this.loadLotteryData()
          }
        }
      })
    } finally {
      // 🔧 修复：确保加载状态结束
      // 💡 hideLoading由APIClient自动处理
    }
  },

  /**
   * 智能文字显示策略 - 判断奖品名称是否需要两行对齐显示
   *
   * @description
   * 根据奖品名称长度，智能判断最佳显示方式：
   * - 1-3个字：单行显示
   * - 4个字或6个字：两行对齐显示（2+2或3+3）
   * - 5个字或7个字以上：单行显示（避免不对齐）
   *
   * prizeName - 奖品名称
   *
   * @example
   * this.getTextDisplayMode('虾1份')    // 'single-line' (3字)
   * this.getTextDisplayMode('八八折券')  // 'double-line' (4字，分成2+2)
   * this.getTextDisplayMode('生腌拼盘')  // 'double-line' (4字，分成2+2)
   * this.getTextDisplayMode('甜品优惠券') // 'single-line' (5字，无法对齐)
   */
  getTextDisplayMode(prizeName) {
    if (!prizeName) {
      return 'single-line'
    }

    const textLength = prizeName.length

    // 1-3个字：单行显示
    if (textLength <= 3) {
      return 'single-line'
    }

    // 4个字或6个字：可以平均分成两行，显示两行
    if (textLength === 4 || textLength === 6) {
      return 'double-line'
    }

    // 5个字：无法平均分配（2+3不对齐），单行显示
    // 7个字以上：单行显示（避免过长换行）
    return 'single-line'
  },

  /**
   * 格式化奖品文字显示
   *
   * @description
   * 根据奖品名称长度，智能分割文字为单行或多行显示格式。
   * - 单行模式：返回完整文字
   * - 双行模式：将4字分为2+2，6字分为3+3，确保对齐美观
   *
   * prizeName - 奖品名称
   *
   * @example
   * this.formatPrizeText('虾1份')
   * // { fullText: '虾1份', isMultiLine: false }
   *
   * @example
   * this.formatPrizeText('八八折券')
   * // { firstLine: '八八', secondLine: '折券', isMultiLine: true }
   *
   * @example
   * this.formatPrizeText('生腌拼盘套餐')
   * // { firstLine: '生腌拼', secondLine: '盘套餐', isMultiLine: true }
   */
  formatPrizeText(prizeName) {
    if (!prizeName) {
      return ''
    }

    const displayMode = this.getTextDisplayMode(prizeName)
    const textLength = prizeName.length

    if (displayMode === 'double-line') {
      if (textLength === 4) {
        // 4个字分成2+2
        return {
          firstLine: prizeName.substring(0, 2),
          secondLine: prizeName.substring(2, 4),
          isMultiLine: true
        }
      } else if (textLength === 6) {
        // 6个字分成3+3
        return {
          firstLine: prizeName.substring(0, 3),
          secondLine: prizeName.substring(3, 6),
          isMultiLine: true
        }
      }
    }

    // 单行显示
    return {
      fullText: prizeName,
      isMultiLine: false
    }
  },

  /**
   * 🔴 V4.0 提取中奖索引（方案3：使用sort_order字段）
   *
   * ✅ V4.0 标准流程（后端已实施方案3）：
   * 1. 后端返回 prizes[0].sort_order (1-9)
   * 2. 前端计算：winning_index = sort_order - 1 (0-8)
   *
   * 索引位置对应关系：
   * ┌─────┬─────┬─────┐
   * │  0  │  1  │  2  │  sort_order: 1  2  3
   * ├─────┼─────┼─────┤
   * │  7  │ 抽奖│  3  │  sort_order: 8  -  4
   * ├─────┼─────┼─────┤
   * │  6  │  5  │  4  │  sort_order: 7  6  5
   * └─────┴─────┴─────┘
   *
   * data - 后端返回的抽奖结果数据
   */
  extractWinningIndex(data) {
    // 🎯 第1步：数据验证
    if (!data) {
      console.error('❌ 后端数据为空')
      showToast('抽奖数据异常，请重试')
      return null
    }

    // 🎯 第2步：验证prizes数组
    if (!data.prizes || !Array.isArray(data.prizes) || data.prizes.length === 0) {
      console.error('❌ prizes数组为空或格式错误', data)
      showToast('抽奖数据格式异常，请联系管理员')
      return null
    }

    const prize = data.prizes[0]

    // 🎯 第3步：验证奖品数据完整性
    if (!prize || typeof prize !== 'object') {
      console.error('❌ 奖品数据无效', prize)
      showToast('奖品数据格式异常')
      return null
    }

    // 🎯 第4步：【关键修复】先检查is_winner字段（必须优先判断）
    if (typeof prize.is_winner !== 'boolean') {
      console.error('❌ 缺少is_winner字段或类型错误', {
        prize,
        is_winner_type: typeof prize.is_winner,
        available_fields: Object.keys(prize)
      })
      showToast('奖品数据不完整：缺少中奖标识')
      return null
    }

    // 🎯 第5步：未中奖处理（is_winner === false）
    if (prize.is_winner === false) {
      console.log('💨 未中奖（is_winner = false），无需处理sort_order')
      console.log('📋 未中奖奖品信息：', {
        name: prize.name,
        type: prize.type,
        // 未中奖时为null
        sort_order: prize.sort_order,
        icon: prize.icon
      })
      // 返回null表示未中奖
      return null
    }

    // 🎯 第6步：中奖处理（is_winner === true）
    console.log('🎉 已中奖（is_winner = true），开始计算索引')

    // 🎯 第7步：验证sort_order字段（中奖时必须有有效值）
    if (typeof prize.sort_order !== 'number' || prize.sort_order === null) {
      console.error('❌ 中奖但缺少有效的sort_order字段', {
        is_winner: prize.is_winner,
        sort_order: prize.sort_order,
        sort_order_type: typeof prize.sort_order,
        prize
      })
      showToast('中奖数据异常：缺少位置信息')
      // 兜底返回第一个位置
      return 0
    }

    const sortOrder = prize.sort_order

    // 🎯 第8步：验证sort_order范围（1-9）
    if (sortOrder < 1 || sortOrder > LOTTERY.GRID_SIZE) {
      console.error('❌ sort_order超出有效范围', {
        sort_order: sortOrder,
        valid_range: `1-${LOTTERY.GRID_SIZE}`,
        prize
      })
      showToast('中奖位置数据异常')
      // 兜底返回第一个位置
      return 0
    }

    // 🎯 第9步：计算索引并返回
    const winningIndex = sortOrder - 1
    console.log('✅ 中奖索引计算成功：', {
      sort_order: sortOrder,
      winning_index: winningIndex,
      prize_name: prize.name || '未知奖品',
      prize_type: prize.type,
      prize_icon: prize.icon
    })

    return winningIndex
  },

  /**
   * 刷新抽奖页面数据
   *
   * @description
   * 静默刷新抽奖页面数据，不显示全局loading提示。
   * 用于下拉刷新或抽奖后更新数据。
   *
   * 执行流程：
   * 1. 检查用户登录状态
   * 2. 调用loadLotteryData刷新数据
   * 3. 异常处理：隐藏加载状态
   *
   *
   * @example
   * // 抽奖后刷新数据
   * await this.refreshData()
   *
   * @example
   * // 下拉刷新
   * this.refreshData().finally(() => wx.stopPullDownRefresh())
   */
  async refreshData() {
    if (!this.data.isLoggedIn) {
      return
    }

    try {
      // 🔧 修复：刷新数据时不显示全局loading，因为loadLotteryData已经处理了
      await this.loadLotteryData()
    } catch (error) {
      console.error('❌ 刷新数据失败', error)
      // 💡 错误提示由APIClient自动处理
    }
  },

  /**
   * 单次抽奖事件处理
   *
   * @description
   * 用户点击单次抽奖按钮时触发。执行完整的抽奖流程：
   *
   * 1. 前置检查：用户认证、积分是否充足、是否正在抽奖
   * 2. 调用后端抽奖API获取结果
   * 3. 解析中奖索引（判断is_winner字段）
   * 4. 播放轮盘高亮动画（动画停在中奖位置或随机位置）
   * 5. 显示抽奖结果弹窗：
   *    - 中奖：显示中奖奖品信息
   *    - 未中奖：显示"很遗憾，未中奖"
   * 6. 刷新用户积分余额
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onSingleDraw">单次抽奖</button>
   */
  async onSingleDraw() {
    if (!this.checkCanDraw()) {
      return
    }

    try {
      this.setData({ isLotteryInProgress: true })

      // 🔴 先执行抽奖获取结果
      const result = await this.performDraw('single')

      if (result.success) {
        // 🔴 使用extractWinningIndex提取中奖索引（已内置is_winner判断）
        const winningIndex = this.extractWinningIndex(result.data)
        console.log('🎯 解析后的中奖索引:', winningIndex)
        console.log('📋 后端原始响应数据:', result.data)

        // 🎯 【关键修复】无论中奖与否，都要播放抽奖动画
        let animationTargetIndex = winningIndex

        // 🔴 未中奖处理（winningIndex为null，表示is_winner = false）
        if (winningIndex === null) {
          console.log('💨 未中奖（is_winner = false），随机选择动画位置')
          // 随机选择一个位置播放动画（不影响实际结果，只是为了体验）
          animationTargetIndex = Math.floor(Math.random() * this.data.prizes.length)
          console.log('🎲 随机动画位置:', animationTargetIndex)
        } else {
          // 🔴 【修复】验证中奖索引有效性（0-8范围）
          if (winningIndex < 0 || winningIndex > 8 || winningIndex >= this.data.prizes.length) {
            console.error('❌ 中奖索引超出有效范围:', {
              winningIndex,
              validRange: '0-8',
              prizesLength: this.data.prizes.length,
              backendData: result.data
            })
            showToast('中奖位置数据异常，请联系管理员')
            this.setData({ isLotteryInProgress: false })
            return
          }

          console.log('✅ 中奖索引验证通过:', winningIndex)
          console.log('🎁 中奖奖品信息:', {
            index: winningIndex,
            prizeName:
              (this.data.prizes[winningIndex] &&
                (this.data.prizes[winningIndex].prizeName ||
                  this.data.prizes[winningIndex].name)) ||
              '未知奖品',
            totalPrizes: this.data.prizes.length
          })
        }

        // 🔴 播放高亮动画（无论中奖与否）
        console.log('🎮 开始播放轮盘动画，目标位置:', animationTargetIndex)
        await this.startHighlightAnimation(animationTargetIndex)
        console.log('🎯 轮盘动画播放完成，已停在位置:', animationTargetIndex)

        // 🔴 动画结束后显示结果
        if (winningIndex === null) {
          // 未中奖：显示未中奖弹窗
          console.log('💨 动画播放完成，显示未中奖结果弹窗')
          this.showNotWinningResult()
          await this.refreshData()
        } else {
          // 中奖：显示中奖结果
          console.log('🎉 动画播放完成，显示中奖结果')
          await this.showWinningResult(result.data, winningIndex)
          this.refreshData()
        }
      } else {
        showToast(result.message || '抽奖失败')
      }
    } catch (error) {
      console.error('❌ 单次抽奖失败', error)
      showToast('抽奖失败，请重试')
    } finally {
      this.setData({ isLotteryInProgress: false })
    }
  },

  /**
   * 三连抽事件处理
   *
   * @description
   * 用户点击三连抽按钮时触发，一次性抽奖3次。
   * 不播放轮盘动画，直接显示所有抽奖结果。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onTripleDraw">三连抽</button>
   */
  async onTripleDraw() {
    // ✅ 直接使用数字 3，因为"三连抽"是功能名称，不是业务配置
    await this.performMultiDraw(3)
  },

  /**
   * 五连抽事件处理
   *
   * @description
   * 用户点击五连抽按钮时触发，一次性抽奖5次。
   * 不播放轮盘动画，直接显示所有抽奖结果。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onFiveDraw">五连抽</button>
   */
  async onFiveDraw() {
    await this.performMultiDraw(5)
  },

  /**
   * 十连抽事件处理
   *
   * @description
   * 用户点击十连抽按钮时触发，一次性抽奖10次。
   * 不播放轮盘动画，直接显示所有抽奖结果。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="onTenDraw">十连抽</button>
   */
  async onTenDraw() {
    await this.performMultiDraw(10)
  },

  /**
   * 多连抽逻辑处理
   *
   * @description
   * 执行多连抽的核心逻辑。与单次抽奖不同，多连抽不播放轮盘动画，
   * 直接调用后端API并展示所有抽奖结果。
   *
   * 执行流程：
   * 1. 前置检查（用户认证、积分是否充足）
   * 2. 调用后端抽奖API（传入抽奖次数count）
   * 3. 解析抽奖结果（支持多个奖品）
   * 4. 直接显示结果弹窗（不播放动画）
   * 5. 刷新用户积分余额
   * 6. 异常处理：区分HTTP错误、积分不足、权限错误等类型
   *
   * count - 抽奖次数（3、5、10等）
   *
   * @example
   * // 3连抽
   * await this.performMultiDraw(3)
   *
   * @example
   * // 自定义连抽次数
   * await this.performMultiDraw(7)
   */
  async performMultiDraw(count) {
    if (!this.checkCanDraw(count)) {
      return
    }

    try {
      this.setData({ isLotteryInProgress: true })
      // 💡 loading由performDraw中的API调用自动处理

      console.log(`🎰 开始${count}连抽，可用积分: `, this.data.pointsBalance)
      console.log(`🔍 ${count}连抽参数准备: `, {
        type: 'multi',
        count,
        costPoints: this.data.costPoints,
        totalCost: this.data.costPoints * count,
        userPoints: this.data.pointsBalance
      })

      // 🔴 多连抽直接调用API，不播放高亮动画
      // 💡 performDraw底层会调用API.performLottery，自动显示loading
      const result = await this.performDraw('multi', count)

      console.log(`🎲 ${count}连抽API响应: `, result)
      console.log(`📊 ${count}连抽响应详情: `, {
        success: result.success,
        message: result.message,
        data: result.data,
        hasResults: result.data && result.data.results,
        resultsLength: result.data && result.data.results ? result.data.results.length : 0
      })

      if (result.success) {
        console.log(`✅ ${count}连抽成功，准备显示结果`)
        // 🔴 直接显示多连抽结果，跳过动画
        await this.showMultiDrawResult(result.data, count)
        // 刷新数据（积分余额等）
        this.refreshData()
      } else {
        // 🔴 增强错误处理：根据错误类型提供具体提示
        const errorMsg = this.getDetailedErrorMessage(result, count)
        console.error(`❌ ${count}连抽失败: `, result)

        // 🔴 如果是后端API问题，显示详细错误信息
        if (result.message && result.message.includes('HTTP错误: 400')) {
          console.error('🚨 后端API参数错误，连抽功能可能需要后端支持')
          console.error('🔍 请检查发送的参数:', {
            drawType: 'multi',
            drawCount: count,
            costPoints: this.data.costPoints * count,
            expectedFormat: {
              drawType: 'multi',
              drawCount: count,
              costPoints: this.data.costPoints * count,
              clientInfo: { source: 'lottery_page', timestamp: 'TIMESTAMP' }
            }
          })

          // 🔴 显示错误弹窗而不只是Toast
          this.showErrorDialog(count, result.message || 'HTTP 400错误')
        } else {
          // 其他错误只显示Toast
          showToast(errorMsg)
        }
      }
    } catch (error) {
      console.error(`❌ ${count}连抽异常: `, error)
      // 💡 错误提示由APIClient自动显示
      console.error(`❌ ${count}连抽失败:`, error)
    } finally {
      // 💡 hideLoading由APIClient自动处理
      this.setData({ isLotteryInProgress: false })
    }
  },

  /**
   * 获取详细错误信息
   *
   * @description
   * 根据后端返回的错误信息，提供用户友好的错误提示。
   * 支持的错误类型：
   * - HTTP 400错误：后端接口参数问题
   * - 积分不足：用户积分不足以完成抽奖
   * - 权限问题：登录已过期或无权限
   * - 其他错误：通用错误提示
   *
   * result - 后端API返回的结果对象
   * result.message - 错误消息
   * count - 抽奖次数（用于错误提示）
   *
   * @example
   * const errorMsg = this.getDetailedErrorMessage(
   *   { message: 'HTTP错误: 400' },
   *   3
   * )
   * // '连抽功能异常，可能是后端接口问题'
   */
  getDetailedErrorMessage(result, count) {
    if (!result.message) {
      return `${count}连抽失败，请重试`
    }

    // HTTP 400错误通常是参数问题
    if (result.message.includes('HTTP错误: 400')) {
      return '连抽功能异常，可能是后端接口问题'
    }

    // 积分不足
    if (result.message.includes('积分') || result.message.includes('余额')) {
      return `积分不足，无法进行${count}连抽`
    }

    // 权限问题
    if (result.message.includes('权限') || result.message.includes('认证')) {
      return '登录已过期，请重新登录'
    }

    // 其他错误
    return result.message || `${count}连抽失败`
  },

  /**
   * 显示错误信息弹窗
   *
   * @description
   * 以统一的格式展示抽奖错误信息，包含错误标题、描述和具体错误消息。
   * 错误信息会通过抽奖结果弹窗展示，用户体验更友好。
   *
   * count - 抽奖次数（用于错误标题）
   * errorMessage - 具体错误消息
   *
   * @example
   * this.showErrorDialog(3, 'HTTP错误: 400')
   * // 显示"3连抽失败"弹窗，包含错误描述
   */
  showErrorDialog(count, errorMessage) {
    console.log(`🚨 显示${count}连抽错误弹窗: `, errorMessage)

    const errorResult = {
      isMultiDraw: true,
      isError: true,
      drawCount: count,
      errorMessage,
      errorTitle: `${count}连抽失败`,
      errorDescription: '抽奖功能暂时异常，请稍后重试或联系客服'
    }

    this.setData(
      {
        drawResult: errorResult,
        showResult: true,
        winningIndex: -1
      },
      () => {
        console.log('✅ 错误弹窗显示完成，当前状态:', {
          showResult: this.data.showResult,
          drawResult: this.data.drawResult,
          isError: this.data.drawResult && this.data.drawResult.isError
        })
      }
    )
  },

  /**
   * 检查是否可以抽奖
   *
   * @description
   * 抽奖前的前置检查，确保满足抽奖条件：
   * 1. 用户认证状态有效（Token有效且未过期）
   * 2. 没有正在进行的抽奖（防止重复提交）
   * 3. 用户积分充足（积分 >= 消耗积分 × 抽奖次数）
   *
   * 任何一个条件不满足都会显示友好提示并返回false。
   *
   * [count=1] - 抽奖次数（默认1次）
   *
   * @example
   * // 单次抽奖检查
   * if (this.checkCanDraw(1)) {
   *   await this.performSingleDraw()
   * }
   *
   * @example
   * // 3连抽检查
   * if (this.checkCanDraw(3)) {
   *   await this.performMultiDraw(3)
   * }
   */
  checkCanDraw(count = 1) {
    // 🔴 使用统一的认证检查
    if (!checkAuth()) {
      console.error('❌ 抽奖失败：用户认证状态无效，已自动跳转登录')
      return false
    }

    if (this.data.isLotteryInProgress) {
      showToast('抽奖进行中，请稍等')
      return false
    }

    // 🔴 根据抽奖次数从drawPricing获取实际消耗积分
    let needPoints = this.data.costPoints * count // 默认计算方式（降级）

    // 优先使用后端返回的drawPricing配置
    if (this.data.drawPricing) {
      if (count === 3 && this.data.drawPricing.three.total_cost) {
        needPoints = this.data.drawPricing.three.total_cost
      } else if (count === 5 && this.data.drawPricing.five.total_cost) {
        needPoints = this.data.drawPricing.five.total_cost
      } else if (count === 10 && this.data.drawPricing.ten.total_cost) {
        needPoints = this.data.drawPricing.ten.total_cost
      }
    }

    console.log('🔍 积分检查:', {
      count,
      costPoints: this.data.costPoints,
      needPoints,
      pointsBalance: this.data.pointsBalance,
      sufficient: this.data.pointsBalance >= needPoints,
      source: this.data.drawPricing ? 'drawPricing（后端配置）' : 'costPoints计算（降级）'
    })

    if (this.data.pointsBalance < needPoints) {
      console.warn('❌ 积分不足:', {
        need: needPoints,
        have: this.data.pointsBalance,
        difference: needPoints - this.data.pointsBalance
      })
      showToast(`积分不足，需要${needPoints}积分，当前${this.data.pointsBalance}积分`)
      return false
    }

    console.log('✅ 积分检查通过')
    return true
  },

  /**
   * 执行抽奖API调用
   *
   * @description
   * 调用后端抽奖API（performLottery），执行实际的抽奖逻辑。
   * 使用V4.0统一引擎，通过campaign_code='BASIC_LOTTERY'标识抽奖活动。
   *
   * 支持单次抽奖和多连抽：
   * - count=1：单次抽奖
   * - count>1：多连抽（例如3连抽、5连抽）
   *
   * type - 抽奖类型（'single' | 'multi'），用于日志记录
   * [count=1] - 抽奖次数（默认1次）
   *
   *
   * @example
   * // 单次抽奖
   * const result = await this.performDraw('single', 1)
   *
   * @example
   * // 3连抽
   * const result = await this.performDraw('multi', 3)
   */
  async performDraw(type, count = 1) {
    const { performLottery } = API

    try {
      // 🔴 V4.2更新：严格按照文档规范传递参数，使用campaign_code
      console.log('🎰 V4.2准备执行抽奖（使用campaign_code）:', {
        campaign_code: 'BASIC_LOTTERY',
        draw_count: count,
        currentPrizes: this.data.prizes.length,
        userPoints: this.data.pointsBalance,
        lotteryEnabled: this.data.lotteryEnabled
      })

      const result = await performLottery('BASIC_LOTTERY', count)
      console.log('🎲 抽奖API响应:', result)

      if (result.success) {
        console.log('✅ 抽奖成功，结果数据:', result.data)
        return result
      } else {
        console.warn('⚠️ 抽奖失败，错误信息:', result.message)
        console.warn('⚠️ 完整失败响应:', result)
        return result
      }
    } catch (error) {
      console.error('❌ 抽奖异常，错误详情:', error)
      console.error('❌ 异常堆栈:', error.stack)
      return {
        success: false,
        message: error.message || '抽奖失败'
      }
    }
  },

  /**
   * 启动轮盘高亮动画
   *
   * @description
   * 播放抽奖轮盘的高亮动画效果，模拟转盘旋转并最终停在目标位置。
   * 这是单次抽奖的视觉呈现核心方法。
   *
   * 动画流程：
   * 1. 验证目标索引有效性（0-7范围）
   * 2. 验证目标奖品是否存在
   * 3. 启动高亮动画：
   *    - 初始速度：120ms/格
   *    - 完整旋转2圈
   *    - 倒数第二圈：稍微减速（+30ms）
   *    - 最后一圈：明显减速（200ms/格）
   * 4. 动画停在目标位置，保持800ms
   * 5. 返回Promise，供调用方await等待
   *
   * [targetIndex=0] - 目标索引（0-7），动画最终停止的位置
   *
   * @example
   * // 播放动画到索引3的位置
   * await this.startHighlightAnimation(3)
   * console.log('动画播放完成')
   *
   * @example
   * // 中奖时播放动画
   * const winningIndex = this.extractWinningIndex(result.data)
   * await this.startHighlightAnimation(winningIndex)
   * this.showWinningResult(result.data, winningIndex)
   */
  async startHighlightAnimation(targetIndex = 0) {
    // 🔴 验证目标索引的有效性
    if (targetIndex < 0 || targetIndex >= 8) {
      console.error('❌ 无效的目标索引:', targetIndex, '，使用索引0')
      targetIndex = 0
    }

    // 🔴 验证对应的奖品是否存在
    const targetPrize = this.data.prizes[targetIndex]
    if (!targetPrize) {
      console.error('❌ 目标索引对应的奖品不存在:', targetIndex)
    } else {
      console.log('✅ 目标奖品验证通过:', {
        index: targetIndex,
        prizeName: targetPrize.prizeName || targetPrize.name || '未命名奖品'
      })
    }

    return new Promise(resolve => {
      this.setData({ highlightAnimation: true })

      let currentIndex = 0
      let rounds = 0
      // 转2圈
      const totalRounds = 2
      // 初始速度
      const speed = 120
      // 减速阶段速度
      const slowDownSpeed = 200

      console.log('🎯 开始高亮动画，目标索引:', targetIndex)
      console.log('📊 动画参数:', {
        totalRounds,
        speed,
        slowDownSpeed,
        startIndex: currentIndex
      })

      const animate = () => {
        this.setData({ currentHighlight: currentIndex })

        // 计算下一个索引
        const nextIndex = (currentIndex + 1) % 8

        // 检查是否完成了基础轮数并到达目标位置
        if (rounds >= totalRounds && currentIndex === targetIndex) {
          // 动画结束，停在目标位置
          console.log('🎯 动画条件满足，准备停止:', {
            rounds,
            totalRounds,
            currentIndex,
            targetIndex,
            isMatch: currentIndex === targetIndex
          })

          setTimeout(() => {
            this.setData({
              highlightAnimation: false,
              // 保持高亮在中奖位置
              currentHighlight: targetIndex
            })
            console.log('✅ 高亮动画结束，停在索引:', targetIndex)
            console.log('🎁 最终高亮的奖品:', {
              index: targetIndex,
              prizeName:
                (this.data.prizes[targetIndex] &&
                  (this.data.prizes[targetIndex].prizeName ||
                    this.data.prizes[targetIndex].name)) ||
                '未知奖品'
            })
            resolve()
          }, 800)
          return
        }

        // 更新索引和轮数
        currentIndex = nextIndex
        if (currentIndex === 0) {
          rounds++
        }

        // 动态调整速度：最后一圈减速
        let currentSpeed = speed
        if (rounds >= totalRounds) {
          // 最后一圈减速
          currentSpeed = slowDownSpeed
        } else if (rounds >= totalRounds - 1) {
          // 倒数第二圈稍微减速
          currentSpeed = speed + 30
        }

        setTimeout(animate, currentSpeed)
      }

      animate()
    })
  },

  /**
   * 显示未中奖结果弹窗
   *
   * @description
   * 当用户抽奖未中奖时（后端返回is_winner=false），显示未中奖结果弹窗。
   *
   * 弹窗内容：
   * - 图标：💨（空气图标）
   * - 标题：未中奖
   * - 描述：很遗憾，未中奖！
   *
   *
   * @example
   * // 单次抽奖未中奖时调用
   * if (winningIndex === null) {
   *   this.showNotWinningResult()
   * }
   */
  showNotWinningResult() {
    console.log('💨 显示未中奖结果弹窗')

    const drawResult = {
      isMultiDraw: false,
      // 🔴 标识未中奖
      isNotWinning: true,
      prize: {
        name: '未中奖',
        icon: '💨',
        description: '很遗憾，未中奖！'
      }
    }

    this.setData({
      winningIndex: -1,
      drawResult,
      showResult: true
    })

    console.log('✅ 未中奖弹窗显示完成:', {
      showResult: this.data.showResult,
      drawResult: this.data.drawResult
    })
  },

  /**
   * 显示中奖结果弹窗（单次抽奖）
   *
   * @description
   * 当用户单次抽奖中奖时，显示中奖结果弹窗。
   * 支持多种奖品数据来源，优先使用确定的中奖索引（与动画一致）。
   *
   * 数据解析优先级：
   * 1. 使用confirmedWinningIndex参数（与动画一致，最高优先级）
   * 2. 使用result.data.prizes[0].sort_order字段
   * 3. 使用result.data.prizeIndex字段
   * 4. 使用result.data.prizes[0].name查找
   *
   * 弹窗内容：
   * - 奖品图标（后端prize.icon字段提供）
   * - 奖品名称
   * - 中奖描述："恭喜您获得 XXX！"
   *
   * result - 后端返回的抽奖结果数据
   * result.data - 抽奖数据
   * result.data.prizes - 奖品数组
   * [confirmedWinningIndex=null] - 确定的中奖索引（与动画一致）
   *
   * @example
   * // 使用确定的中奖索引（推荐）
   * const winningIndex = this.extractWinningIndex(result.data)
   * await this.showWinningResult(result.data, winningIndex)
   *
   * @example
   * // 仅传入result，自动解析中奖索引
   * await this.showWinningResult(result.data)
   */
  async showWinningResult(result, confirmedWinningIndex = null) {
    console.log('🎊 显示中奖结果，原始数据:', result)
    console.log('🎯 当前奖品列表:', this.data.prizes)
    console.log('🔗 传入的确定中奖索引:', confirmedWinningIndex)

    let winningIndex = -1
    let prizeName = ''
    let prizeDescription = ''

    // 🔴 最高优先级：使用已经确定的中奖索引（确保与动画一致）
    if (
      confirmedWinningIndex !== null &&
      confirmedWinningIndex >= 0 &&
      confirmedWinningIndex < this.data.prizes.length
    ) {
      winningIndex = confirmedWinningIndex
      console.log('✅ 使用确定的中奖索引（与动画一致）:', winningIndex)

      const winningPrize = this.data.prizes[winningIndex]
      prizeName = winningPrize.prizeName || winningPrize.name || '神秘奖品'
      prizeDescription = `恭喜您获得 ${prizeName}！`

      console.log('🎁 确定的中奖奖品信息:', {
        index: winningIndex,
        prizeName,
        description: prizeDescription
      })
    } else {
      // ❌ 没有确定的索引，无法显示结果
      console.error('❌ 无法确定中奖索引，后端数据不完整:', {
        result,
        confirmedWinningIndex,
        availableFields: Object.keys(result)
      })
      showToast('后端未返回中奖位置信息，请联系管理员')
      return
    }

    console.log('🎲 最终中奖信息:', { winningIndex, prizeName, prizeDescription })

    // 🔴 验证奖品名称
    if (!prizeName) {
      console.error('❌ 无法获取奖品名称:', result)
      showToast('奖品数据不完整：缺少奖品名称，请联系管理员')
      return
    }
    console.log('🎁 最终显示奖品名称:', prizeName)

    const drawResult = {
      // 🔴 标识这是单次抽奖
      isMultiDraw: false,
      prize: {
        name: prizeName,
        imageUrl: result.prize && result.prize.imageUrl ? result.prize.imageUrl : null,
        description: prizeDescription
      }
    }

    console.log('🎉 设置中奖结果显示:', drawResult)

    this.setData({
      winningIndex,
      drawResult,
      showResult: true
    })

    console.log('✅ 中奖结果显示完成，页面状态:', {
      winningIndex: this.data.winningIndex,
      showResult: this.data.showResult,
      drawResult: this.data.drawResult
    })

    // 2秒后自动清除中奖高亮效果
    setTimeout(() => {
      this.setData({ winningIndex: -1 })
    }, DELAY.TOAST_LONG)
  },

  /**
   * 显示多连抽结果弹窗
   *
   * @description
   * 处理并显示多连抽的所有抽奖结果。不播放轮盘动画，直接展示结果列表。
   * 支持多种后端数据格式，自动解析并统一处理。
   *
   * 支持的数据格式：
   * 1. `{results: Array, userStatus: {}, summary: {}}` - 标准格式
   * 2. `Array` - 直接数组格式
   * 3. `{data: Array}` - API统一响应格式
   * 4. `{prizes: Array}` - 奖品格式
   *
   * 数据处理流程：
   * 1. 验证数据结构，解析results数组
   * 2. 遍历每个抽奖结果，判断is_winner字段
   * 3. 中奖：显示奖品名称、图标、描述
   * 4. 未中奖：显示"未中奖"提示
   * 5. 展示结果弹窗，包含所有奖品列表
   *
   * resultData - 后端返回的多连抽结果数据
   * [resultData.results] - 抽奖结果数组（格式1）
   * [resultData.data] - 抽奖结果数组（格式3）
   * [resultData.prizes] - 抽奖结果数组（格式4）
   * count - 抽奖次数（用于验证和日志）
   *
   * @example
   * // 3连抽成功后调用
   * const result = await this.performDraw('multi', 3)
   * if (result.success) {
   *   await this.showMultiDrawResult(result.data, 3)
   * }
   *
   * @example
   * // 处理标准格式数据
   * await this.showMultiDrawResult({
   *   results: [
   *     { is_winner: true, prizeIndex: 2 },
   *     { is_winner: false },
   *     { is_winner: true, prizeIndex: 5 }
   *   ]
   * }, 3)
   */
  async showMultiDrawResult(resultData, count) {
    console.log(`🎊 开始处理${count}连抽结果: `, resultData)

    // 🔴 数据验证：检查基础数据结构
    if (!resultData) {
      console.error('❌ 结果数据为空，无法显示中奖弹窗')
      showToast(`${count}连抽数据异常：后端未返回结果数据`)
      return
    }

    // 🔴 解析后端返回的数据结构
    let results = null

    if (resultData && resultData.results && Array.isArray(resultData.results)) {
      // 格式1：{results: Array, userStatus: {}, summary: {}}
      results = resultData.results
      console.log('📋 解析到标准results数组:', results)
    } else if (Array.isArray(resultData)) {
      // 格式2：直接是数组格式
      results = resultData
      console.log('📋 直接使用数组格式:', results)
    } else if (resultData.data && Array.isArray(resultData.data)) {
      // 格式3：{data: Array} - API统一响应格式
      results = resultData.data
      console.log('📋 从data字段解析数组:', results)
    } else if (resultData.prizes && Array.isArray(resultData.prizes)) {
      // 格式4：{prizes: Array} - 可能的奖品格式
      results = resultData.prizes
      console.log('📋 从prizes字段解析数组:', results)
    } else {
      console.error('❌ 无法解析多连抽数据格式:', {
        resultData,
        hasResults: !!resultData.results,
        isArray: Array.isArray(resultData),
        hasData: !!resultData.data,
        hasPrizes: !!resultData.prizes,
        keys: Object.keys(resultData || {})
      })
      showToast(`${count}连抽数据格式异常，无法显示结果`)
      return
    }

    // 🔴 验证解析后的数据
    if (!results || !Array.isArray(results) || results.length === 0) {
      console.error('❌ 解析后的抽奖结果无效:', {
        results,
        isArray: Array.isArray(results),
        length: results ? results.length : 'null'
      })
      showToast(`${count}连抽结果为空，请联系管理员检查后端配置`)
      return
    }

    console.log(`🎯 准备显示${results.length}个奖品，期望${count}个`)

    // 🔴 验证结果数量是否符合预期
    if (results.length !== count) {
      console.warn(`⚠️ 结果数量不匹配: 期望${count}个，实际${results.length}个`)
    }

    // 🔴 【修复】处理多个奖品数据，先判断is_winner字段
    const prizes = results.map((result, index) => {
      let prizeName = ''
      let prizeDescription = ''
      let isWinner = false

      try {
        // 🎯 【关键】步骤1：先判断is_winner字段（业务必须字段）
        if (typeof result.is_winner === 'boolean') {
          isWinner = result.is_winner
          console.log(`🎯 奖品${index + 1}: is_winner = ${isWinner}`)
        } else {
          // 🔴 is_winner是业务必须字段，缺失时视为未中奖并记录错误
          console.error(`❌ 奖品${index + 1}: 缺少is_winner字段，视为未中奖`, result)
          isWinner = false
        }

        // 🎯 步骤2：根据is_winner字段处理奖品信息
        if (!isWinner) {
          // 未中奖处理
          prizeName = result.name || '未中奖'
          prizeDescription = '很遗憾，未中奖'
          console.log(`💨 奖品${index + 1}: 未中奖（is_winner = false）`)
        } else {
          // 中奖处理
          // 方法1：优先使用后端返回的prizeIndex获取奖品名称
          if (
            result.prizeIndex !== undefined &&
            result.prizeIndex >= 0 &&
            this.data.prizes &&
            this.data.prizes[result.prizeIndex]
          ) {
            const winningPrize = this.data.prizes[result.prizeIndex]
            prizeName = winningPrize.prizeName || winningPrize.name || `奖品${index + 1}`
            prizeDescription = `恭喜获得 ${prizeName}！`
            console.log(
              `🎁 奖品${index + 1}: 使用prizeIndex = ${result.prizeIndex}, 名称 = ${prizeName}`
            )
          } else if (result.prize && (result.prize.prizeName || result.prize.name)) {
            // 方法2：使用奖品信息
            prizeName = result.prize.prizeName || result.prize.name
            prizeDescription = result.prize.description || `恭喜获得 ${prizeName}！`
            console.log(`🎁 奖品${index + 1}: 使用prize对象, 名称 = ${prizeName}`)
          } else if (result.prizeName || result.name) {
            // 方法3：直接从result获取名称
            prizeName = result.prizeName || result.name
            prizeDescription = result.description || `恭喜获得 ${prizeName}！`
            console.log(`🎁 奖品${index + 1}: 直接使用result字段, 名称 = ${prizeName}`)
          } else {
            // 兜底方案
            prizeName = `神秘奖品${index + 1}`
            prizeDescription = `恭喜获得 ${prizeName}！`
            console.warn(`⚠️ 奖品${index + 1}: 使用兜底方案, 原始数据: `, result)
          }
        }
      } catch (error) {
        console.error(`❌ 处理奖品${index + 1}时出错: `, error, result)
        prizeName = `奖品${index + 1}`
        prizeDescription = '奖品信息异常'
        isWinner = false
      }

      return {
        name: prizeName,
        description: prizeDescription,
        // 🆕 新增：标识是否中奖
        isWinner,
        // 添加序号便于调试
        index: index + 1
      }
    })

    // 🔴 构建多连抽弹窗数据
    const drawResult = {
      isMultiDraw: true,
      drawCount: count,
      prizes,
      // 实际获得奖品数量
      actualCount: prizes.length
    }

    console.log('🎉 设置多连抽结果显示:', drawResult)

    // 🔴 逐个揭晓：从第一个奖品开始，不一次性显示所有
    this.setData(
      {
        drawResult,
        showResult: true,
        // 🆕 从第0个奖品开始逐个揭晓
        multiDrawCurrentIndex: 0,
        multiDrawRevealing: true,
        // 多连抽不需要高亮特定位置
        winningIndex: -1
      },
      () => {
        console.log('✅ setData回调执行，当前showResult状态:', this.data.showResult)
        // 🆕 短暂延迟后停止揭晓动画，展示第一个奖品
        setTimeout(() => {
          this.setData({ multiDrawRevealing: false })
        }, 400)
      }
    )

    console.log('✅ 多连抽结果开始逐个揭晓，页面状态:', {
      showResult: this.data.showResult,
      drawResult: this.data.drawResult,
      prizesCount: prizes.length,
      isMultiDraw: drawResult.isMultiDraw,
      startIndex: 0
    })
  },

  /**
   * 关闭抽奖结果弹窗
   *
   * @description
   * 关闭当前显示的抽奖结果弹窗（单次抽奖或多连抽结果）。
   * 重置所有相关状态，清空抽奖结果数据。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="closeResult">关闭</button>
   */
  /**
   * 🆕 揭晓下一个奖品（多连抽逐个揭晓）
   *
   * @description
   * 多连抽结果弹窗中，用户点击"揭晓下一个"按钮时调用。
   * 播放揭晓动画后切换到下一个奖品展示。
   *
   */
  revealNextPrize() {
    const { multiDrawCurrentIndex, drawResult } = this.data
    if (!drawResult || !drawResult.prizes) {
      return
    }

    const nextIndex = multiDrawCurrentIndex + 1
    if (nextIndex >= drawResult.prizes.length) {
      console.log('🎉 所有奖品已揭晓完毕')
      return
    }

    console.log(`🎲 揭晓第${nextIndex + 1}个奖品（共${drawResult.prizes.length}个）`)

    // 🔴 先播放揭晓动画
    this.setData({ multiDrawRevealing: true }, () => {
      // 🔴 动画结束后切换到下一个奖品
      setTimeout(() => {
        this.setData({
          multiDrawCurrentIndex: nextIndex,
          multiDrawRevealing: false
        })
        console.log(`✅ 第${nextIndex + 1}个奖品已揭晓: ${drawResult.prizes[nextIndex].name}`)
      }, 400)
    })
  },

  /**
   * 🆕 切换查看已揭晓的奖品（多连抽）
   *
   * @description
   * 在已揭晓的奖品缩略列表中，点击某个奖品可切换查看其详情。
   *
   * e - 事件对象
   */
  switchToRevealedPrize(e) {
    const index = e.currentTarget.dataset.index
    const { multiDrawCurrentIndex } = this.data
    // 只能查看已揭晓的奖品
    if (index > multiDrawCurrentIndex) {
      return
    }
    console.log(`🔍 切换查看第${index + 1}个奖品`)
    this.setData({ multiDrawCurrentIndex: index })
  },

  closeResult() {
    this.setData({
      showResult: false,
      drawResult: null,
      winningIndex: -1,
      // 🆕 重置多连抽逐个揭晓状态
      multiDrawCurrentIndex: 0,
      multiDrawRevealing: false
    })
  },

  /**
   * 🆕 点击二维码区域 - 放大显示
   *
   * @description
   * 用户点击二维码区域时，将二维码放大到全屏显示，
   * 方便商家更清晰地扫描。点击蒙层可关闭放大视图。
   *
   *
   * @example
   * // WXML中绑定
   * <view bindtap="enlargeQRCode">...</view>
   */
  enlargeQRCode() {
    console.log('🔍 点击放大二维码')
    console.log('📋 当前二维码图片路径:', this.data.qrCodeImage)
    console.log('📋 qrCodeEnlarged状态变更为: true')

    if (!this.data.qrCodeImage) {
      console.warn('⚠️ 二维码尚未生成，无法放大')
      wx.showToast({
        title: '二维码尚未生成',
        icon: 'none',
        duration: 2000
      })
      return
    }

    this.setData(
      {
        qrCodeEnlarged: true
      },
      () => {
        console.log('✅ setData回调：qrCodeEnlarged已设置为', this.data.qrCodeEnlarged)
      }
    )
  },

  /**
   * 🆕 关闭放大的二维码
   *
   * @description
   * 用户点击蒙层或任意区域时，关闭放大的二维码视图，
   * 恢复到正常大小显示。
   *
   *
   * @example
   * // WXML中绑定
   * <view bindtap="closeEnlargedQRCode">...</view>
   */
  closeEnlargedQRCode() {
    console.log('❌ 关闭放大二维码')
    this.setData({
      qrCodeEnlarged: false
    })
  },

  /**
   * 🆕 根据数字长度获取响应式字体CSS类
   *
   * @description
   * 根据积分数字的位数，返回对应的CSS类名，实现自动缩小字体。
   * 支持超长数字（最多18位）的完整显示。
   *
   * num - 积分数字
   *   - '' : 1-7位，使用32rpx正常字体
   *   - 'medium-number' : 8-10位，使用26rpx字体
   *   - 'small-number' : 11-13位，使用22rpx字体
   *   - 'tiny-number' : 14位及以上，使用18rpx字体
   *
   * @example
   * this.getNumberClass(999)           // 返回 ''
   * this.getNumberClass(99999999)      // 返回 'medium-number'
   * this.getNumberClass(999999999999)  // 返回 'small-number'
   */
  getNumberClass(num) {
    if (!num) {
      return ''
    }
    const length = num.toString().length

    if (length <= 7) {
      return '' // 正常字体 32rpx
    } else if (length <= 10) {
      return 'medium-number' // 26rpx
    } else if (length <= 13) {
      return 'small-number' // 22rpx
    } else {
      return 'tiny-number' // 18rpx（最小）
    }
  },

  /**
   * 🆕 数字千分位格式化
   *
   * @description
   * 将数字格式化为带千分位分隔符的字符串，提高可读性。
   * 使用逗号作为分隔符，每3位添加一个逗号。
   *
   * num - 需要格式化的数字
   *
   * @example
   * this.formatNumberWithComma(999)           // 返回 '999'
   * this.formatNumberWithComma(9999)          // 返回 '9,999'
   * this.formatNumberWithComma(9999999)       // 返回 '9,999,999'
   * this.formatNumberWithComma(999999999999)  // 返回 '999,999,999,999'
   */
  formatNumberWithComma(num) {
    if (!num && num !== 0) {
      return '0'
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  },

  /**
   * 跳转到兑换页面
   *
   * @description
   * 用户点击"去兑换"按钮时，跳转到积分兑换页面。
   * 使用wx.switchTab跳转TabBar页面。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="goToExchange">去兑换</button>
   */
  goToExchange() {
    wx.switchTab({
      url: '/pages/exchange/exchange'
    })
  },

  /**
   * 跳转到记录页面
   *
   * @description
   * 该功能已移除，显示"功能暂时不可用"提示。
   * 原计划用于跳转到抽奖记录页面。
   *
   *
   * @example
   * // WXML中绑定
   * <button bindtap="goToRecords">查看记录</button>
   */
  goToRecords() {
    wx.showToast({
      title: '该功能暂时不可用',
      icon: 'none',
      duration: DELAY.TOAST_LONG
    })
  },

  // 🔴 已删除 redirectToAuth() 方法，现在 checkAuth() 会自动处理跳转

  /**
   * 生命周期函数 - 监听用户下拉刷新
   *
   * @description
   * 用户在页面下拉时触发，刷新抽奖页面数据：
   * - 用户积分余额
   * - 抽奖配置信息
   * - 奖品列表
   *
   * 刷新完成后自动停止下拉刷新动画。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onPullDownRefresh()
   */
  onPullDownRefresh() {
    this.refreshData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  /**
   * 生命周期函数 - 页面卸载时清除V2二维码倒计时定时器
   */
  onUnload() {
    // 🆕 销毁MobX Store绑定
    if (this.userBindings) {
      this.userBindings.destroyStoreBindings()
    }
    if (this.pointsBindings) {
      this.pointsBindings.destroyStoreBindings()
    }
    if (this.lotteryBindings) {
      this.lotteryBindings.destroyStoreBindings()
    }

    if (this._qrTimer) {
      clearInterval(this._qrTimer)
      this._qrTimer = null
    }
  },

  /**
   * 生命周期函数 - 监听用户点击页面分享
   *
   * @description
   * 用户点击右上角分享按钮时触发，设置分享内容和路径。
   * 分享后的用户将直接进入抽奖页面。
   *
   *
   * @example
   * // 微信小程序自动调用
   * onShareAppMessage()
   * // { title: '我在抽奖，一起来试试手气！', path: '/pages/lottery/lottery' }
   */
  onShareAppMessage() {
    return {
      title: '我在抽奖，一起来试试手气！',
      path: '/pages/lottery/lottery'
    }
  },

  /**
   * 🆕 检查管理员角色
   *
   * @description
   * 检查当前用户是否是管理员，用于显示/隐藏管理员功能条。
   * 判断依据：userInfo.role === 'admin' 或 userInfo.is_admin === true
   *
   *
   * @example
   * // 页面加载时调用
   * this.checkAdminRole()
   */
  checkAdminRole() {
    try {
      const userInfo = app.globalData.userInfo

      // 判断是否是管理员（支持role字段和is_admin字段）
      const isAdmin =
        (userInfo && userInfo.role === 'admin') ||
        (userInfo && userInfo.is_admin === true) ||
        (userInfo && userInfo.user_role === 'admin')

      this.setData({ isAdmin })

      if (isAdmin) {
        console.log('✅ 管理员权限验证通过，显示管理员功能条')
      } else {
        console.log('ℹ️ 非管理员用户，隐藏管理员功能条')
      }
    } catch (error) {
      console.error('❌ 权限检查失败:', error)
      this.setData({ isAdmin: false })
    }
  },

  /**
   * 🆕 扫一扫功能（管理员）
   *
   * @description
   * 管理员点击"扫一扫"按钮，扫描用户的V2动态身份二维码。
   * 扫码成功后跳转到消费录入页面（consume-submit）。
   *
   * 核心流程：
   * 1. 二次验证管理员权限
   * 2. 调用wx.scanCode扫描二维码
   * 3. V2格式验证（QRV2_开头，不兼容V1旧码）
   * 4. 跳转到消费录入页面，传递二维码参数
   *
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onScanTap">扫一扫</view>
   */
  onScanTap() {
    // 二次验证管理员权限
    if (!this.data.isAdmin) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        duration: 2000
      })
      return
    }

    console.log('📷 管理员点击扫一扫')

    // 调用微信扫码API
    wx.scanCode({
      onlyFromCamera: false, // 允许从相册选择二维码
      scanType: ['qrCode'], // 只扫描二维码
      success: res => {
        console.log('✅ 扫码成功:', res.result)
        this.handleScanResult(res.result)
      },
      fail: err => {
        console.error('❌ 扫码失败:', err)
        // 用户取消扫码不提示错误
        if (err.errMsg !== 'scanCode:fail cancel') {
          wx.showToast({
            title: '扫码失败，请重试',
            icon: 'none',
            duration: 2000
          })
        }
      }
    })
  },

  /**
   * 处理扫码结果（V2动态码校验）
   *
   * @description
   * 验证扫描到的二维码格式（QRV2_开头），不兼容V1旧码。
   * 完整验证（签名、过期、nonce）由后端完成。
   *
   * qrCode - 扫描到的二维码内容
   */
  handleScanResult(qrCode) {
    // V2动态码前缀校验（不兼容V1旧码QR_开头）
    if (!qrCode || !qrCode.startsWith('QRV2_')) {
      wx.showModal({
        title: '二维码无效',
        content: '该二维码不是有效的V2身份二维码。请让用户在小程序中刷新二维码后重试。',
        showCancel: false
      })
      return
    }

    console.log('✅ V2二维码格式验证通过，跳转到消费录入页面')

    wx.navigateTo({
      url: `/packageAdmin/consume-submit/consume-submit?qrCode=${encodeURIComponent(qrCode)}`,
      success: () => {
        console.log('✅ 跳转到消费录入页面成功')
      },
      fail: err => {
        console.error('❌ 跳转失败:', err)
        wx.showToast({ title: '页面跳转失败，请重试', icon: 'none', duration: 2000 })
      }
    })
  },

  /**
   * 🆕 跳转到审核详情页（管理员）
   *
   * @description
   * 管理员点击"审核详情"按钮，跳转到待审核消费记录列表页面。
   *
   *
   * @example
   * // WXML中绑定
   * <view bindtap="onAuditTap">审核详情</view>
   */
  onAuditTap() {
    if (!this.data.isAdmin) {
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        duration: 2000
      })
      return
    }

    console.log('📋 管理员点击审核详情，跳转到审核列表页')

    wx.navigateTo({
      url: '/packageAdmin/audit-list/audit-list',
      success: () => {
        console.log('✅ 跳转到审核列表页成功')
      },
      fail: err => {
        console.error('❌ 跳转失败:', err)
        wx.showToast({
          title: '页面跳转失败，请重试',
          icon: 'none',
          duration: 2000
        })
      }
    })
  },

  // ========================================
  // 🆕 积分审核记录查询功能
  // ========================================

  /**
   * 加载消费记录数量（替代原getMyRecentAuditsCount，使用消费记录+status筛选）
   *
   * @description
   * 后端API: GET /api/v4/shop/consumption/me（支持分页和status筛选）
   * 替代原不存在的 /consumption/my-recent-audits/count 路由
   */
  async loadConsumptionRecordsCount() {
    try {
      // 使用消费记录API获取待审核记录数量
      const result = await API.getMyConsumptionRecords({
        page: 1,
        page_size: 1,
        status: 'pending'
      })

      if (result && result.success && result.data) {
        const totalCount = result.data.pagination?.total || 0
        this.setData({
          auditRecordsCount: totalCount
        })
        console.log('✅ 加载消费记录数量成功:', totalCount)
      }
    } catch (error) {
      console.error('❌ 加载消费记录数量失败:', error)
      // 静默失败，不影响主功能
    }
  },

  /**
   * 🎨 决策7：加载弹窗横幅（自定义弹窗组件方案）
   *
   * @description
   * 后端API: GET /api/v4/system/popup-banners
   * 数据库popup_banners表的数据，通过自定义popup-banner组件展示。
   * 组件支持6种显示模式（由后端 display_mode 字段决定）：
   *   wide / horizontal / square / tall / slim / full_image
   *
   * 后端返回字段（新增）：
   *   display_mode  - 显示模式（运营在管理后台选择的模板类型）
   *   image_width   - 原图宽度px（后端sharp自动检测）
   *   image_height  - 原图高度px（后端sharp自动检测）
   *
   */
  async loadPopupBanners() {
    try {
      const result = await API.getPopupBanners()

      if (result && result.success && result.data) {
        const banners = result.data.banners || result.data || []

        if (Array.isArray(banners) && banners.length > 0) {
          // 过滤有效横幅（后端API已过滤active状态，此处做二次保护）
          const activeBanners = banners.filter(
            banner => !banner.status || banner.status === 'active' || banner.is_active === true
          )

          if (activeBanners.length > 0) {
            // 🖼️ 先预加载所有横幅图片，图片就绪后再显示弹窗
            // 避免弹窗先出现白色空壳、图片后加载的闪烁问题
            await this._preloadBannerImages(activeBanners)

            // 🔴 首次加载时：只准备数据，不立即显示弹窗
            // 由initializePage的finally块统一setData，确保页面内容和弹窗同一帧出现
            if (this._isFirstLoad) {
              this._preparedBanners = activeBanners
              console.log(
                '✅ 弹窗横幅数据已准备（图片已预加载），等待与页面同步显示:',
                activeBanners.length,
                '条'
              )
            } else {
              // 非首次加载（如从其他页面返回），直接显示
              this.setData({
                popupBanners: activeBanners,
                showPopupBanner: true
              })
              console.log('✅ 弹窗横幅加载并显示:', activeBanners.length, '条有效横幅')
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ 加载弹窗横幅失败:', error)
      // 静默失败，不影响主功能
    }
  },

  /**
   * 🖼️ 预加载横幅图片（确保弹窗显示时图片已就绪）
   *
   * @description
   * 使用 wx.getImageInfo 预下载所有横幅图片到本地缓存。
   * 图片全部加载完成（或超时3秒）后才允许弹窗显示，
   * 避免弹窗先出现白色空壳再加载图片的不良体验。
   *
   * banners - 横幅数据列表
   * @private
   */
  async _preloadBannerImages(banners) {
    console.log('🖼️ 开始预加载横幅图片:', banners.length, '条横幅')

    // 并行预加载所有图片，下载到本地后替换URL为本地临时路径
    const PRELOAD_TIMEOUT = 5000
    const preloadPromises = banners.map((banner, index) => {
      // 没有图片URL的横幅跳过
      if (!banner.image_url || typeof banner.image_url !== 'string') {
        return Promise.resolve()
      }

      return new Promise(resolve => {
        // 超时保护：单张图片最多等5秒，超时保留远程URL
        const timer = setTimeout(() => {
          console.warn('⚠️ 横幅图片预加载超时（5秒），保留远程URL:', banner.image_url)
          resolve()
        }, PRELOAD_TIMEOUT)

        wx.getImageInfo({
          src: banner.image_url,
          success: res => {
            clearTimeout(timer)
            // 🔴 核心：用本地临时路径替换远程URL
            // 这样<image>组件直接读本地文件，无需网络请求，瞬间显示
            banners[index].image_url = res.path
            console.log(
              '✅ 横幅图片预加载成功:',
              res.width + '×' + res.height,
              '→ 本地路径:',
              res.path
            )
            resolve()
          },
          fail: err => {
            clearTimeout(timer)
            console.warn('⚠️ 横幅图片预加载失败（保留远程URL）:', err.errMsg)
            resolve() // 失败也放行，保留远程URL作降级
          }
        })
      })
    })

    await Promise.all(preloadPromises)
    console.log('✅ 所有横幅图片预加载完成，弹窗即将显示')
  },

  /**
   * 🎨 弹窗横幅关闭事件处理
   *
   * @description 用户点击关闭按钮或遮罩层时触发
   */
  onPopupBannerClose() {
    this.setData({ showPopupBanner: false })
    console.log('📢 弹窗横幅已关闭')
  },

  /**
   * 🎨 弹窗横幅操作按钮事件处理
   *
   * @description 用户点击"查看详情"按钮时触发，跳转到横幅指定链接
   * e - 事件对象，e.detail.banner包含横幅数据
   */
  onPopupBannerAction(e) {
    const { banner } = e.detail

    if (banner && banner.link_url) {
      console.log('📢 弹窗横幅跳转:', banner.link_url)
      wx.navigateTo({
        url: banner.link_url,
        fail: () => {
          // 如果是tabBar页面，使用switchTab
          wx.switchTab({
            url: banner.link_url,
            fail: err => {
              console.error('❌ 弹窗横幅跳转失败:', err)
            }
          })
        }
      })
    }
  },

  /**
   * 查看消费记录（替代原viewRecentAudits，使用消费记录API）
   *
   * @description
   * 显示最近的消费记录详情弹窗
   * 后端API: GET /api/v4/shop/consumption/me
   */
  async viewRecentAudits() {
    console.log('📋 查看消费记录')

    if (!checkAuth()) {
      wx.showModal({
        title: '未登录',
        content: '请先登录后查看消费记录',
        confirmText: '去登录',
        success: res => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/auth/auth' })
          }
        }
      })
      return
    }

    this.setData({ auditRecordsLoading: true })
    wx.showLoading({ title: '加载中...', mask: true })

    try {
      // 使用消费记录API替代原getMyRecentAudits
      const result = await API.getMyConsumptionRecords({
        page: 1,
        page_size: 5
      })

      wx.hideLoading()

      if (result && result.success && result.data) {
        const records = result.data.records || []

        if (records.length === 0) {
          wx.showModal({
            title: '暂无记录',
            content: '您还没有消费记录\n\n当您在商家消费后，记录将显示在这里',
            showCancel: false
          })
          return
        }

        const formattedRecords = this.formatAuditRecords(records)

        this.setData({
          auditRecordsData: formattedRecords,
          showAuditModal: true
        })

        console.log('✅ 加载消费记录成功:', formattedRecords.length, '条')
      } else {
        throw new Error(result.message || '获取消费记录失败')
      }
    } catch (error) {
      console.error('❌ 加载消费记录失败:', error)
      wx.hideLoading()

      wx.showModal({
        title: '加载失败',
        content: `无法获取消费记录：${error.message}`,
        confirmText: '重试',
        cancelText: '取消',
        success: res => {
          if (res.confirm) {
            this.viewRecentAudits()
          }
        }
      })
    } finally {
      this.setData({ auditRecordsLoading: false })
    }
  },

  /**
   * 🆕 格式化消费记录数据
   *
   * @description
   * 将后端返回的原始消费记录格式化为前端显示格式。
   * 对每条记录进行字段验证和安全格式化，防止字段缺失导致页面崩溃。
   *
   * records - 后端返回的原始记录数组
   */
  formatAuditRecords(records) {
    if (!Array.isArray(records)) {
      console.error('❌ formatAuditRecords: records不是数组', typeof records)
      return []
    }

    return records.map((record, index) => {
      // 🔴 字段存在性校验：防止后端返回null/undefined字段导致前端崩溃
      if (!record || typeof record !== 'object') {
        console.warn(`⚠️ 第${index + 1}条记录为空或非对象，跳过`)
        return {
          formattedTime: '时间未知',
          statusInfo: this.formatAuditStatus(null),
          formattedAmount: '0.00'
        }
      }

      // 格式化时间（安全处理：created_at可能为null/undefined/非字符串）
      const formattedTime = this.formatRelativeTime(record.created_at)

      // 格式化状态（安全处理：status可能缺失）
      const statusInfo = this.formatAuditStatus(record.status)

      // 格式化金额（安全处理：consumption_amount可能为null/undefined/非数字）
      const amount = parseFloat(record.consumption_amount)
      const formattedAmount = isNaN(amount) ? '0.00' : amount.toFixed(2)

      return {
        ...record,
        formattedTime,
        statusInfo,
        formattedAmount
      }
    })
  },

  /**
   * 🆕 格式化相对时间
   *
   * @description
   * 将时间戳转换为相对时间描述（如"2小时前"、"昨天"等）。
   * 安全处理各种时间格式：ISO 8601字符串、Date对象、数字时间戳、null/undefined。
   *
   * timestamp - 时间值（推荐ISO 8601格式字符串）
   */
  formatRelativeTime(timestamp) {
    // 🔴 空值保护：后端可能返回null或undefined
    if (timestamp === null || timestamp === undefined) {
      console.warn('⚠️ formatRelativeTime: timestamp为空')
      return '时间未知'
    }

    // 🔴 类型安全：确保能正确解析为时间
    const time = new Date(timestamp).getTime()
    if (isNaN(time)) {
      console.warn('⚠️ formatRelativeTime: 无法解析时间值:', timestamp)
      return '时间未知'
    }

    const now = Date.now()
    const diff = now - time

    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) {
      return '刚刚'
    }
    if (minutes < 60) {
      return `${minutes}分钟前`
    }
    if (hours < 24) {
      return `${hours}小时前`
    }
    if (days === 1) {
      return '昨天'
    }
    if (days < 7) {
      return `${days}天前`
    }

    // 超过7天显示完整日期（安全转换为字符串后截取）
    const timeStr = typeof timestamp === 'string' ? timestamp : new Date(timestamp).toISOString()
    return timeStr.substring(0, 16).replace('T', ' ')
  },

  /**
   * 🆕 格式化审核状态
   *
   * @description
   * 将后端状态值转换为前端显示的文本、图标和颜色
   *
   * status - 审核状态：pending/approved/rejected
   */
  formatAuditStatus(status) {
    const statusMap = {
      pending: {
        text: '待审核',
        icon: '⏳',
        color: '#FF9800',
        bgColor: '#FFF3E0'
      },
      approved: {
        text: '已通过',
        icon: '✅',
        color: '#4CAF50',
        bgColor: '#E8F5E9'
      },
      rejected: {
        text: '已拒绝',
        icon: '❌',
        color: '#F44336',
        bgColor: '#FFEBEE'
      }
    }

    return statusMap[status] || statusMap.pending
  },

  /**
   * 🆕 关闭审核记录弹窗
   *
   * @description
   * 关闭弹窗并清空数据
   */
  closeAuditModal() {
    this.setData({
      showAuditModal: false,
      auditRecordsData: []
    })
    console.log('✅ 关闭审核记录弹窗')
  }
})
