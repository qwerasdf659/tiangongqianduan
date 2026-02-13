/**
 * 用户身份二维码组件 - V2动态码（5分钟有效 + HMAC-SHA256 + 一次性nonce）
 *
 * @file components/qrcode/qrcode.js
 * @description
 * 用于生成和显示用户V2动态身份二维码的组件，供商家扫描使用。
 *
 * **V2核心变更**：
 * - V1永久码（QR_开头）全面废弃，切换为V2动态码（QRV2_开头）
 * - 5分钟有效期 + 倒计时显示 + 过期遮罩 + 刷新机制
 * - 禁止本地缓存（V2动态码5分钟过期，缓存无意义）
 * - 页面从后台恢复时自动检查过期状态
 * - 组件销毁时自动清除定时器（防内存泄漏）
 *
 * **技术方案**：
 * - Canvas 2D API（微信小程序）
 * - weapp-qrcode库（二维码生成）
 * - H级纠错（30%容错能力）
 *
 * @version 5.0.0
 * @since 2026-02-09
 */

const QRCode = require('../../utils/weapp-qrcode')
// 统一使用utils/index.js导入工具函数
const { API } = require('../../utils/index')

/**
 * 用户身份二维码组件（V2动态码版本）
 *
 * @component qrcode
 *
 * 业务流程：
 * 1. 用户消费后打开小程序，展示此V2动态二维码
 * 2. 二维码5分钟内有效，页面显示倒计时
 * 3. 商家扫描用户二维码，在商家端输入消费金额
 * 4. 提交后进入审核状态，积分冻结（24小时内审核）
 * 5. 审核通过后，冻结积分转为可用积分
 * 6. 二维码过期后显示过期遮罩，用户可点击刷新重新生成
 */
Component({
  /**
   * 组件的属性列表
   */
  properties: {
    /** 二维码尺寸（单位：px） */
    size: {
      type: Number,
      value: 300
    },
    /** 是否显示标题 */
    showTitle: {
      type: Boolean,
      value: true
    },
    /** 标题文字 */
    title: {
      type: String,
      value: '我的身份二维码'
    },
    /** 是否显示用户信息 */
    showUserInfo: {
      type: Boolean,
      value: false
    },
    /** 是否显示操作按钮（刷新/保存） */
    showActions: {
      type: Boolean,
      value: true
    },
    /** 是否自动生成（组件加载后自动生成二维码） */
    autoGenerate: {
      type: Boolean,
      value: true
    }
  },

  /**
   * 组件的初始数据
   *
   * V2变更：
   * - 删除 qrContent（前端不需要解析二维码payload）
   * - 新增 countdown（倒计时剩余秒数）
   * - 新增 countdownText（格式化后的倒计时文字，如 "4:32"）
   * - 新增 expired（是否已过期）
   * - 新增 expiresAt（过期时间戳，来自后端 data.expires_at）
   * - 新增 note（提示文案，来自后端 data.note）
   */
  data: {
    qrCodeImage: '', // 二维码图片路径
    loading: false, // 加载状态
    errorMessage: '', // 错误信息
    userInfo: null, // 用户信息 { nickname, phone, points }
    countdown: 300, // 倒计时剩余秒数（5分钟）
    countdownText: '5:00', // 格式化后的倒计时文字
    expired: false, // 是否已过期
    expiresAt: 0, // 过期时间戳（毫秒数）
    note: '' // 后端返回的提示文案
  },

  /**
   * 组件生命周期 - 进入页面节点树时
   */
  attached() {
    console.log('🔲 V2二维码组件已加载')

    if (this.properties.autoGenerate) {
      this.generateQRCode()
    }
  },

  /**
   * 组件生命周期 - 从页面节点树移除时
   * 清除倒计时定时器，防止内存泄漏
   */
  detached() {
    console.log('🔲 V2二维码组件已卸载，清除定时器')
    if (this._countdownTimer) {
      clearInterval(this._countdownTimer)
      this._countdownTimer = null
    }
  },

  /**
   * 页面生命周期（组件所在页面的生命周期）
   * 从后台恢复前台时，检查二维码是否已过期
   */
  pageLifetimes: {
    show() {
      this.checkExpired()
    }
  },

  /**
   * 组件的方法列表
   */
  methods: {
    /**
     * 生成V2动态二维码（主要方法）
     *
     * 完整流程：
     * 1. 调用 GET /auth/profile 获取用户信息（user_id）
     * 2. 调用 GET /shop/consumption/qrcode/{user_id} 获取V2动态码
     * 3. 从响应中提取 qr_code、expires_at、note
     * 4. 使用 expires_at.timestamp 计算倒计时剩余秒数
     * 5. Canvas渲染二维码 → 转为图片
     * 6. 启动倒计时
     *
     */
    async generateQRCode() {
      console.log('🔲 开始生成V2动态二维码...')

      this.setData({
        loading: true,
        errorMessage: '',
        expired: false
      })

      try {
        // 步骤1：获取用户信息（profile接口获取user_id）
        const profileResponse = await API.getUserInfo()
        if (!profileResponse.success || !profileResponse.data) {
          throw new Error(profileResponse.message || '获取用户信息失败')
        }

        const profileData = profileResponse.data.user || profileResponse.data
        const userId = profileData.user_id
        if (!userId) {
          throw new Error('用户信息中缺少user_id')
        }

        console.log('✅ 用户信息获取成功:', { user_id: userId, nickname: profileData.nickname })

        // 步骤2：调用后端API获取V2动态二维码（JWT解析身份，无需传user_id）
        const qrResponse = await API.getUserQRCode()
        if (!qrResponse.success || !qrResponse.data) {
          throw new Error(qrResponse.message || '获取二维码失败')
        }

        const qrData = qrResponse.data
        const qrContent = qrData.qr_code // 核心：二维码字符串（QRV2_开头）
        const note = qrData.note || '' // 提示文案

        // 步骤3：计算倒计时剩余秒数
        // expires_at 可能是对象 { iso, beijing, timestamp } 或字符串
        let expiresTimestamp = 0
        if (qrData.expires_at && typeof qrData.expires_at === 'object') {
          // 后端返回对象格式，使用 timestamp 字段（最可靠）
          expiresTimestamp = qrData.expires_at.timestamp
        } else {
          // 后端返回字符串格式（北京时间），解析为时间戳
          expiresTimestamp = new Date(qrData.expires_at).getTime()
        }

        const remaining = Math.max(0, Math.floor((expiresTimestamp - Date.now()) / 1000))

        console.log('📋 V2二维码信息:', {
          qr_code_length: qrContent.length,
          expires_at: expiresTimestamp,
          remaining_seconds: remaining,
          note
        })

        // 步骤4：Canvas渲染二维码
        await this.drawQRCode(qrContent)

        // 步骤5：转换Canvas为图片
        await this.canvasToImage()

        // 步骤6：更新状态并启动倒计时
        const minutes = Math.floor(remaining / 60)
        const seconds = remaining % 60
        const countdownText = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`

        this.setData({
          userInfo: {
            nickname: profileData.nickname,
            phone: profileData.mobile,
            points: profileData.points || 0
          },
          countdown: remaining,
          countdownText,
          expiresAt: expiresTimestamp,
          note,
          loading: false
        })

        // 启动倒计时
        this.startCountdown()

        console.log('✅ V2动态二维码生成成功')

        // 触发成功事件
        this.triggerEvent('success', {
          image: this.data.qrCodeImage,
          userInfo: {
            user_id: userId,
            nickname: profileData.nickname,
            phone: profileData.mobile,
            points: profileData.points || 0
          }
        })
      } catch (error) {
        console.error('❌ V2二维码生成失败:', error)

        this.setData({
          loading: false,
          errorMessage: error.message || '二维码生成失败，请重试'
        })

        // 触发失败事件
        this.triggerEvent('error', { message: error.message })

        wx.showToast({ title: '生成失败', icon: 'none' })
      }
    },

    /**
     * 启动倒计时
     *
     * 每秒递减 countdown，归零时设置 expired = true。
     * WXML中不支持 Math.floor()，因此在JS中计算格式化后的 countdownText。
     */
    startCountdown() {
      // 清除旧定时器
      if (this._countdownTimer) {
        clearInterval(this._countdownTimer)
      }

      this._countdownTimer = setInterval(() => {
        const remaining = this.data.countdown - 1

        if (remaining <= 0) {
          clearInterval(this._countdownTimer)
          this._countdownTimer = null
          this.setData({
            countdown: 0,
            countdownText: '已过期',
            expired: true
          })
          return
        }

        // 格式化为 M:SS
        const minutes = Math.floor(remaining / 60)
        const seconds = remaining % 60
        const countdownText = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`

        this.setData({
          countdown: remaining,
          countdownText
        })
      }, 1000)
    },

    /**
     * 检查二维码是否已过期
     *
     * 用于 pageLifetimes.show 中，从后台恢复前台时调用。
     * 如果已过期，停止倒计时并显示过期状态。
     * 如果未过期，重新计算剩余秒数并继续倒计时。
     */
    checkExpired() {
      if (!this.data.expiresAt) {
        return
      }

      const now = Date.now()

      if (now >= this.data.expiresAt) {
        // 已过期：停止倒计时，显示过期状态
        if (this._countdownTimer) {
          clearInterval(this._countdownTimer)
          this._countdownTimer = null
        }
        this.setData({
          countdown: 0,
          countdownText: '已过期',
          expired: true
        })
      } else {
        // 未过期：重新计算剩余秒数并继续倒计时
        const remaining = Math.max(0, Math.floor((this.data.expiresAt - now) / 1000))
        const minutes = Math.floor(remaining / 60)
        const seconds = remaining % 60
        const countdownText = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`

        this.setData({
          countdown: remaining,
          countdownText,
          expired: false
        })
        this.startCountdown()
      }
    },

    /**
     * 绘制二维码到Canvas（Canvas 2D API）
     *
     * content - 二维码内容（QRV2_开头的完整字符串）
     */
    drawQRCode(content) {
      return new Promise<void>((resolve, reject) => {
        try {
          console.log('🎨 开始绘制V2二维码到Canvas（Canvas 2D API）...')

          const query = this.createSelectorQuery()
          query
            .select('#qrCanvas')
            .fields({ node: true, size: true })
            .exec(res => {
              if (!res || !res[0]) {
                const error = new Error('Canvas 2D节点获取失败，请确保微信基础库版本≥2.9.0')
                console.error('❌', error.message)
                reject(error)
                return
              }

              const canvas = res[0].node
              const ctx = canvas.getContext('2d')

              // 设置Canvas尺寸（支持高分辨率屏幕）
              const dpr = wx.getSystemInfoSync().pixelRatio
              canvas.width = this.properties.size * dpr
              canvas.height = this.properties.size * dpr
              ctx.scale(dpr, dpr)

              // 使用weapp-qrcode生成二维码（H级纠错，30%容错能力）
              QRCode.toCanvas(
                {
                  canvas,
                  canvasId: 'qrCanvas',
                  width: this.properties.size,
                  height: this.properties.size,
                  text: content,
                  correctLevel: QRCode.CorrectLevel.H,
                  background: '#ffffff',
                  foreground: '#000000'
                },
                error => {
                  if (error) {
                    console.error('❌ V2二维码绘制失败:', error)
                    reject(error)
                  } else {
                    console.log('✅ V2二维码绘制成功（Canvas 2D API）')
                    resolve()
                  }
                }
              )
            })
        } catch (error) {
          console.error('❌ 绘制二维码异常:', error)
          reject(error)
        }
      })
    },

    /**
     * 将Canvas转换为图片
     *
     */
    canvasToImage() {
      return new Promise<string>((resolve, reject) => {
        console.log('🖼️ 开始转换Canvas为图片...')

        // 延迟执行以确保Canvas绘制完成
        setTimeout(() => {
          wx.canvasToTempFilePath(
            {
              canvasId: 'qrCanvas',
              success: res => {
                console.log('✅ Canvas转换为图片成功:', res.tempFilePath)
                this.setData({ qrCodeImage: res.tempFilePath })
                resolve(res.tempFilePath)
              },
              fail: error => {
                console.error('❌ Canvas转换失败:', error)
                reject(error)
              }
            },
            this
          )
        }, 500)
      })
    },

    /**
     * 刷新二维码（V2版本：直接重新生成，无需清除缓存）
     */
    handleRefresh() {
      console.log('🔄 刷新V2动态二维码')
      this.generateQRCode()
    },

    /**
     * 保存二维码到相册
     */
    async handleSave() {
      console.log('💾 保存二维码到相册')

      if (!this.data.qrCodeImage) {
        wx.showToast({ title: '二维码尚未生成', icon: 'none' })
        return
      }

      try {
        await wx.saveImageToPhotosAlbum({
          filePath: this.data.qrCodeImage
        })

        wx.showToast({ title: '保存成功', icon: 'success' })

        this.triggerEvent('saved', { filePath: this.data.qrCodeImage })
      } catch (error) {
        console.error('❌ 保存失败:', error)

        if (error.errMsg && error.errMsg.includes('auth')) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许访问相册',
            confirmText: '去设置',
            success: res => {
              if (res.confirm) {
                wx.openSetting()
              }
            }
          })
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      }
    }
  }
})

export {}
