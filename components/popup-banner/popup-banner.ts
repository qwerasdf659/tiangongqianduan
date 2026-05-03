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
 * 数据来源：后端API GET /api/v4/system/ad-delivery?slot_type=popup
 * 数据表：ad_campaigns + ad_creatives（统一内容投放系统）
 *
 * @property {boolean} visible - 控制弹窗显示/隐藏
 * @property {Array} banners - 横幅数据列表（后端 ad-delivery 接口返回的 AdDeliveryItem 数组）
 *   banners[].ad_campaign_id    {Number} 广告计划主键ID
 *   banners[].title             {String} 创意标题
 *   banners[].text_content      {String} 文字内容（content_type='text' 时有值）
 *   banners[].primary_media      {Object|null} 主图媒体对象（content_type='text' 时为 null）
 *     .public_url               {String} 图片完整公网URL（后端已拼接，前端直接使用）
 *     .width                    {Number} 原图宽度px
 *     .height                   {Number} 原图高度px
 *     .thumbnails               {Object|null} 缩略图 { small, medium, large }
 *   banners[].link_url          {String} 点击跳转链接（可选）
 *   banners[].display_mode      {String} 显示模式
 *   banners[].campaign_category {String} 分类: system=系统通知 / operational=运营内容 / commercial=商业广告
 *   banners[].force_show        {Boolean} 强制弹出（不可点遮罩关闭）
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
 * @version 6.0.0
 * @since 2026-02-07
 * @updated 2026-02-23 内容投放系统合并：popup_banners → ad_campaigns + ad_creatives
 */

const { Logger } = require('../../utils/index')
const log = Logger.createLogger('popup-banner')

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
    /** 🔴 图片加载是否最终失败（重试耗尽后为true，触发降级占位显示） */
    imageLoadFailed: false,
    /** 当前banner是否为强制弹出模式（不可点击遮罩关闭） */
    isForceShow: false,
    /** 当前内容分类: system=系统通知 / operational=运营内容 / commercial=商业广告 */
    currentBannerType: '' as string
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
        const currentBanner = this.data.banners[this.data.currentIndex]
        const bannerForceShow = currentBanner?.force_show === true
        const bannerType = currentBanner?.campaign_category || 'operational'

        this.setData({
          animateOut: false,
          imageLoadFailed: false,
          isForceShow: bannerForceShow,
          currentBannerType: bannerType
        })
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

      log.info(' 横幅图片加载成功:', loadedWidth + '×' + loadedHeight, '显示模式=' + displayMode)
    },

    // ========================================
    //  🎮 弹窗交互方法
    // ========================================

    /**
     * 关闭弹窗（带退场动画）
     * @param closeMethod - 关闭方式: close_btn / overlay / confirm_btn
     */
    _closeWithMethod(closeMethod: string) {
      this.setData({ animateOut: true, animateIn: false })
      setTimeout(() => {
        this.setData({
          animateOut: false,
          currentIndex: 0
        })
        this.triggerEvent('close', { close_method: closeMethod })
      }, 300)
    },

    /** 点击关闭按钮 */
    handleClose() {
      this._closeWithMethod('close_btn')
    },

    /**
     * 点击遮罩层关闭
     * force_show=true 时遮罩点击无效，必须通过按钮关闭
     */
    handleOverlayTap() {
      if (this.data.isForceShow) {
        return
      }
      this._closeWithMethod('overlay')
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

      if (banner.link_url) {
        this._closeWithMethod('close_btn')
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
     * notice类型"我知道了"确认按钮
     * 强制弹出(force_show)的系统公告必须通过此按钮关闭
     */
    handleNoticeConfirm() {
      this._closeWithMethod('confirm_btn')
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
      let mediaUrl = currentBanner?.primary_media?.public_url || ''

      if (this._imageRetryCount <= MAX_RETRY) {
        log.warn('弹窗横幅图片加载失败，第' + this._imageRetryCount + '次重试...', mediaUrl)

        let retryUrl = mediaUrl
        if (retryUrl && typeof retryUrl === 'string') {
          let separator = retryUrl.indexOf('?') === -1 ? '?' : '&'
          retryUrl = retryUrl + separator + '_retry=' + Date.now()
        }

        let banners = this.data.banners.slice()
        if (banners[this.data.currentIndex] && banners[this.data.currentIndex].primary_media) {
          let updatedMedia = Object.assign({}, banners[this.data.currentIndex].primary_media, {
            public_url: retryUrl
          })
          banners[this.data.currentIndex] = Object.assign({}, banners[this.data.currentIndex], {
            primary_media: updatedMedia
          })
          this.setData({ banners })
        }
      } else {
        log.error('弹窗横幅图片加载失败（已重试' + MAX_RETRY + '次），降级显示占位图:', mediaUrl)
        this.setData({ imageLoadFailed: true })
      }
    }
  }
})
