/**
 * 奖品图片错误降级 Behavior
 *
 * 当网络图片加载失败时（如 Sealos 存储域名未在微信 downloadFile 白名单），
 * 自动清空 prize_image_url 使 WXML 切换到 emoji 兜底展示。
 *
 * 使用方式：
 *   const prizeImageBehavior = require('../../shared/prize-image-behavior')
 *   Component({ behaviors: [prizeImageBehavior], ... })
 *
 *   WXML 中：
 *   <image ... data-prize-idx="{{index}}" binderror="onPrizeImageError" />
 *
 * @file components/lottery-activity/shared/prize-image-behavior.ts
 */

module.exports = Behavior({
  methods: {
    /**
     * 奖品预览区图片加载失败 — 降级为 emoji 兜底
     *
     * 触发场景：
     *   1. 图片域名未在微信公众平台 downloadFile 白名单（真机）
     *   2. 图片 URL 过期或资源被删除
     *   3. 网络异常导致加载失败
     *
     * WXML 绑定: binderror="onPrizeImageError" data-prize-idx="{{index}}"
     */
    onPrizeImageError(e: WechatMiniprogram.ImageError) {
      const prizeIdx = e.currentTarget.dataset.prizeIdx
      if (typeof prizeIdx === 'number') {
        this.setData({
          [`prizesForPreview[${prizeIdx}].prize_image_url`]: ''
        })
      }
    }
  }
})
