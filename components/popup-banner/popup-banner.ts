/**
 * 🎨 popup-banner 弹窗横幅组件
 *
 * @component popup-banner
 * @description
 * 用于在抽奖页等页面展示活动通知、运营横幅的自定义弹窗组件。
 * 支持图片、富文本、渐变样式、入场/退场动画。
 *
 * 📐 显示模式由后端 display_mode 字段决定（运营在管理后台选择模板）：
 *   - wide        : 宽屏模式（16:9）
 *   - horizontal  : 横版模式（3:2）
 *   - square      : 方图模式（1:1）
 *   - tall        : 竖图模式（3:4）
 *   - slim        : 窄长图模式（9:16）
 *   - full_image  : 纯图模式 → 无白色卡片壳，图片即弹窗
 *
 * 📐 图片动态适配方案（widthFix模式）：
 *   - 宽度撑满容器，高度由图片原始比例自动计算
 *   - 任何尺寸的图片都完整显示，不裁剪、不留白
 *   - 运营换图无需担心尺寸问题
 *
 * 数据来源：后端API GET /api/v4/system/popup-banners
 * 数据表：popup_banners
 *
 * @property {boolean} visible - 控制弹窗显示/隐藏
 * @property {Array} banners - 横幅数据列表（从后端API获取）
 *   banners[].title          {String} 标题
 *   banners[].content        {String} 正文内容
 *   banners[].image_url      {String} 横幅图片URL（可选）
 *   banners[].link_url       {String} 点击跳转链接（可选）
 *   banners[].display_mode   {String} 显示模式（后端必填字段）
 *   banners[].image_width    {Number} 原图宽度px（后端sharp检测）
 *   banners[].image_height   {Number} 原图高度px（后端sharp检测）
 *
 * @event {Function} close - 关闭弹窗时触发
 * @event {Function} action - 点击操作按钮时触发，detail: { banner, index }
 *
 * @example
 * <popup-banner
 *   visible="{{showPopupBanner}}"
 *   banners="{{popupBanners}}"
 *   bind:close="onPopupBannerClose"
 *   bind:action="onPopupBannerAction"
 * />
 *
 * @version 5.2.0
 * @since 2026-02-07
 * @updated 2026-02-08 修复图片裁剪：改用widthFix动态适配，任何尺寸图片都完整显示
 */

/**
 * 后端支持的6种显示模式（与数据库ENUM字段一一对应）
 * 用于前端校验 display_mode 字段值的合法性
 */
const { Logger } = require('../../utils/index')
const log = Logger.createLogger('popup-banner')

const VALID_DISPLAY_MODES = ['wide', 'horizontal', 'square', 'tall', 'slim', 'full_image']

Component({
  /**
   * 组件属性
   */
  properties: {
    /** 控制弹窗是否可见 */
    visible: {
      type: Boolean,
      value: false
    },
    /** 横幅数据列表（后端API返回的banners数组，每条含display_mode字段） */
    banners: {
      type: Array,
      value: []
    }
  },

  /**
   * 组件内部数据
   */
  data: {
    /** 当前显示的横幅索引 */
    currentIndex: 0,
    /** 入场动画是否完成（控制CSS动画类） */
    animateIn: false,
    /** 退场动画是否进行中 */
    animateOut: false,
    /** 🖼️ 图片是否已加载完成（配合预加载，防止白屏闪烁） */
    imageReady: false,
    /** 🔴 图片加载是否最终失败（重试耗尽后为true，触发降级占位显示） */
    imageLoadFailed: false
  },

  /**
   * 属性监听器
   */
  observers: {
    /**
     * 监听visible变化，触发入场/退场动画
     * 🔴 图片已在父页面预加载到缓存，组件显示时图片可直接从缓存读取
     * val - 新的visible值
     */
    visible(val) {
      if (val) {
        // 入场：先渲染DOM，再延迟添加动画类（触发CSS transition）
        // 🔴 重置图片状态（新弹窗打开时清除之前的失败状态）
        this.setData({ animateOut: false, imageReady: false, imageLoadFailed: false })
        this._imageRetryCount = 0 // 重置重试计数器
        setTimeout(() => {
          this.setData({ animateIn: true })
        }, 50)
      }
    }
  },

  /**
   * 组件方法
   */
  methods: {
    // ========================================
    //  📐 显示模式处理（基于后端 display_mode 字段）
    // ========================================

    /**
     * 获取当前横幅的显示模式
     *
     * @description
     * 直接读取后端返回的 display_mode 字段，不再前端自动检测。
     * 如果后端返回的值不在合法范围内，降级为 'wide' 模式。
     *
     * banner - 横幅数据对象
     */
    getDisplayMode(banner: any) {
      if (!banner || !banner.display_mode) {
        log.warn('⚠️ 横幅缺少 display_mode 字段，降级为 wide 模式')
        return 'wide'
      }

      if (VALID_DISPLAY_MODES.indexOf(banner.display_mode) === -1) {
        log.warn('⚠️ 无效的 display_mode 值:', banner.display_mode, '，降级为 wide 模式')
        return 'wide'
      }

      return banner.display_mode
    },

    /**
     * 判断当前横幅是否为纯图模式
     *
     * @description
     * 纯图模式下弹窗没有白色卡片壳，图片直接作为弹窗展示，
     * 不显示标题、正文、渐变装饰等内容区域。
     *
     * banner - 横幅数据对象
     */
    isFullImageMode(banner: any) {
      return banner && banner.display_mode === 'full_image'
    },

    /**
     * 横幅图片加载成功回调
     *
     * @description
     * 图片加载成功时记录日志，用于运营排查图片问题。
     * 显示模式已由后端 display_mode 字段决定，无需前端检测。
     *
     * e - bindload事件对象
     * e.detail.width - 图片原始宽度
     * e.detail.height - 图片原始高度
     */
    handleImageLoad(e: WechatMiniprogram.CustomEvent) {
      let loadedWidth = e.detail.width
      let loadedHeight = e.detail.height
      let currentBanner = this.data.banners[this.data.currentIndex]
      let displayMode = currentBanner ? currentBanner.display_mode : 'unknown'

      // 🖼️ 标记图片已加载完成（配合预加载机制，确保弹窗内容可见）
      if (!this.data.imageReady) {
        this.setData({ imageReady: true })
      }

      log.info('📐 横幅图片加载成功:', loadedWidth + '×' + loadedHeight, '显示模式=' + displayMode)
    },

    // ========================================
    //  🎮 弹窗交互方法
    // ========================================

    /**
     * 关闭弹窗（带退场动画）
     * 先播放退场动画，动画结束后通知父组件隐藏
     */
    handleClose() {
      this.setData({ animateOut: true, animateIn: false })
      // 等待退场动画完成（300ms）后通知父组件
      setTimeout(() => {
        this.setData({
          animateOut: false,
          currentIndex: 0
        })
        this.triggerEvent('close')
      }, 300)
    },

    /**
     * 点击遮罩层关闭
     */
    handleOverlayTap() {
      this.handleClose()
    },

    /**
     * 阻止弹窗内容区域的点击事件冒泡到遮罩层
     */
    preventBubble() {
      // 空方法，仅用于catchtap阻止冒泡
    },

    /**
     * 点击操作按钮（查看详情/跳转链接）
     * 通知父组件处理跳转逻辑
     */
    handleAction() {
      let banner = this.data.banners[this.data.currentIndex]
      if (!banner) {
        return
      }

      this.triggerEvent('action', {
        banner,
        index: this.data.currentIndex
      })

      // 有链接时自动关闭弹窗
      if (banner.link_url) {
        this.handleClose()
      }
    },

    /**
     * 切换到下一个横幅
     */
    handleNext() {
      let nextIndex = this.data.currentIndex + 1
      if (nextIndex < this.data.banners.length) {
        this.setData({ currentIndex: nextIndex })
      } else {
        // 最后一个横幅，关闭弹窗
        this.handleClose()
      }
    },

    /**
     * 切换到上一个横幅
     */
    handlePrev() {
      let prevIndex = this.data.currentIndex - 1
      if (prevIndex >= 0) {
        this.setData({ currentIndex: prevIndex })
      }
    },

    /**
     * 横幅图片加载失败处理（含自动重试 + 降级显示）
     *
     * @description
     * 图片加载失败时自动重试最多2次（添加时间戳绕过缓存）。
     * 如果所有重试均失败，标记 imageLoadFailed=true，
     * 触发模板中的降级占位显示（渐变装饰替代空白图片）。
     *
     * e - binderror事件对象
     */
    handleImageError(_e: WechatMiniprogram.CustomEvent) {
      // 最大重试次数
      const MAX_RETRY = 2
      if (!this._imageRetryCount) {
        this._imageRetryCount = 0
      }
      this._imageRetryCount++

      let currentBanner = this.data.banners[this.data.currentIndex]
      let imageUrl = currentBanner ? currentBanner.image_url : ''

      if (this._imageRetryCount <= MAX_RETRY) {
        // 🔄 自动重试：添加时间戳参数绕过缓存
        log.warn('⚠️ 弹窗横幅图片加载失败，第' + this._imageRetryCount + '次重试...', imageUrl)

        // 构造重试URL（添加_retry参数绕过缓存）
        let retryUrl = imageUrl
        if (retryUrl && typeof retryUrl === 'string') {
          let separator = retryUrl.indexOf('?') === -1 ? '?' : '&'
          retryUrl = retryUrl + separator + '_retry=' + Date.now()
        }

        // 更新当前横幅的image_url触发重新加载
        let banners = this.data.banners.slice()
        if (banners[this.data.currentIndex]) {
          banners[this.data.currentIndex] = Object.assign({}, banners[this.data.currentIndex], {
            image_url: retryUrl
          })
          this.setData({ banners })
        }
      } else {
        // ❌ 重试耗尽，标记加载失败，触发降级占位显示
        log.error('❌ 弹窗横幅图片加载失败（已重试' + MAX_RETRY + '次），降级显示占位图:', imageUrl)
        this.setData({ imageLoadFailed: true })
      }
    }
  }
})

export {}
