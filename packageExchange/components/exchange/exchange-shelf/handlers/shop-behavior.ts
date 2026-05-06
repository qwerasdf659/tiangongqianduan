/**
 * 商品货架 Behavior 决策D10: Behavior 替代 spread handler
 *
 * 包含 exchange-shelf 组件级别的共享方法：
 *   - 空间切换（幸臻选）
 *   - 臻选空间解锁流 *   - 商品数据转换
 *   - 布局参数初始 *   - 市场数据刷新
 *
 * 子组件级别方法（搜索/筛分页/竞价）已下沉到各自子组件 *   - lucky-space: 幸运空间筛选、分页、瀑布 *   - premium-space: 臻选空间分 *   - bid-panel: 竞价出价、倒计 *
 * @file components/exchange/exchange-shelf/handlers/shop-behavior.ts
 * @version 5.2.0
 * @since 2026-02-21
 */

const { API: shopAPI, Wechat: shopWechat, Logger: shopLogger } = require('../../../../../utils/index')
const shopLog = shopLogger.createLogger('shop-behavior')
const { showToast: shopShowToast } = shopWechat

module.exports = Behavior({
  methods: {
    /**
     * 切换幸运空间/臻选空     * 臻选空间需要先检查解锁状     */
    async onSpaceChange(e: any) {
      const targetSpace = e.currentTarget.dataset.space
      shopLog.info('切换空间:', targetSpace)

      if (targetSpace === 'premium' && !this.data.premiumUnlocked) {
        shopLog.info('臻选空间未解锁，尝试解')
        this.handlePremiumUnlock()
        return
      }

      if (targetSpace === this.data.currentSpace) {
        shopLog.info('当前已在目标空间，无需切换')
        return
      }

      this.setData({ currentSpace: targetSpace })

      if (targetSpace === 'lucky') {
        const luckySpace = this.selectComponent('#lucky-space')
        if (luckySpace) {
          luckySpace.initData()
        }
      } else if (targetSpace === 'premium') {
        const premiumSpace = this.selectComponent('#premium-space')
        if (premiumSpace) {
          premiumSpace.initData()
        }
      }

      shopLog.info('已切换到空间:', targetSpace)
    },

    /**
     * 检查臻选空间解锁状     * 后端API: GET /api/v4/exchange/premium-status
     */
    async checkPremiumUnlockStatus() {
      try {
        const result = await shopAPI.getPremiumStatus()
        if (result && result.success && result.data) {
          const status = result.data
          this.setData({
            premiumUnlocked: !!status.unlocked,
            premiumRemainingHours: status.remaining_hours || 0,
            premiumIsValid: !!status.is_valid,
            premiumTotalUnlockCount: status.total_unlock_count || 0,
            premiumCanUnlock: !!status.can_unlock,
            premiumIsExpired: !!status.is_expired,
            premiumConditions: status.conditions || null,
            premiumUnlockCost: status.unlock_cost || 0,
            premiumValidityHours: status.validity_hours || 24
          })
          shopLog.info('臻选空间解锁状', status)
        }
      } catch (error) {
        shopLog.error('查询臻选空间解锁状态失', error)
      }
    },

    /**
     * 处理臻选空间解锁（用户点击解锁按钮     * 后端API: POST /api/v4/exchange/unlock-premium
     */
    async handlePremiumUnlock() {
      await this.checkPremiumUnlockStatus()

      if (this.data.premiumUnlocked) {
        shopShowToast('臻选空间已解锁')
        return
      }

      if (this.data.premiumCanUnlock === false) {
        const conditions = this.data.premiumConditions
        const conditionText = conditions ? '解锁条件未满足，请查看详情' : '解锁条件未满足'
        wx.showModal({
          title: '暂时无法解锁',
          content: conditionText,
          showCancel: false,
          confirmText: '我知道了'
        })
        return
      }

      const validityHours = this.data.premiumValidityHours || 24
      wx.showModal({
        title: '解锁臻选空',
        content: `解锁需消{this.data.premiumUnlockCost}积分，有效期${validityHours}小时，是否确认？`,
        confirmText: '确认解锁',
        cancelText: '再想',
        success: async (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
          if (res.confirm) {
            await this.unlockPremiumSpace()
          }
        }
      })
    },

    /**
     * 执行臻选空间解锁请     * 后端API: POST /api/v4/exchange/unlock-premium
     */
    async unlockPremiumSpace() {
      try {
        const result = await shopAPI.unlockPremium()
        if (result && result.success && result.data) {
          this.setData({
            premiumUnlocked: true,
            premiumRemainingHours: result.data.remaining_hours || 0
          })
          shopShowToast('臻选空间解锁成')
          shopLog.info('臻选空间解锁成', result.data)
          const premiumSpace = this.selectComponent('#premium-space')
          if (premiumSpace) {
            premiumSpace.initData()
          }
        }
      } catch (error: any) {
        shopLog.error('臻选空间解锁失', error)
        shopShowToast(error.message || '解锁失败，请稍后重试')
      }
    },

    /** 初始化布局参数（获取屏幕宽度，计算列宽*/
    initLayoutParams() {
      try {
        const res = wx.getWindowInfo()
        const containerWidth = res.windowWidth - 40
        const columnWidth = Math.floor((containerWidth - 20) / 2)
        this.setData({ containerWidth, columnWidth })
        shopLog.info('布局参数初始化完', { containerWidth, columnWidth })
      } catch (err) {
        shopLog.error('获取窗口信息失败:', err)
        this.setData({ containerWidth: 335, columnWidth: 157 })
      }
    },

    /** 刷新当前空间数据 */
    async refreshMarketData() {
      const luckySpace = this.selectComponent('#lucky-space')
      const premiumSpace = this.selectComponent('#premium-space')
      const bidPanel = this.selectComponent('#bid-panel')

      if (this.data.currentSpace === 'lucky' && luckySpace) {
        await luckySpace.initData()
      } else if (this.data.currentSpace === 'premium' && premiumSpace) {
        await premiumSpace.initData()
      }
      if (bidPanel) {
        bidPanel.refresh()
      }
    },

    /** 刷新商品数据（对外暴露，用于下拉刷新*/
    onRefreshProducts() {
      shopLog.info('下拉刷新商品数据')
      this.refreshMarketData()
    },

    /** 货架内容滚动到底部时继续加载当前空间数据 */
    onShopScrollToLower() {
      const { currentSpace } = this.data
      if (currentSpace === 'lucky') {
        const luckySpace = this.selectComponent('#lucky-space')
        if (luckySpace && typeof luckySpace.loadMore === 'function') {
          luckySpace.loadMore()
        }
        return
      }
      if (currentSpace === 'premium') {
        const premiumSpace = this.selectComponent('#premium-space')
        if (premiumSpace && typeof premiumSpace.loadMore === 'function') {
          premiumSpace.loadMore()
        }
      }
    },

    /**
     * 商品兑换空间 - 按售价排     * 通知当前空间子组件执行排     */
    onShopSortByPoints() {
      shopLog.info('商品兑换空间按售价排')
      const { currentSpace } = this.data

      if (currentSpace === 'lucky') {
        const luckySpace = this.selectComponent('#lucky-space')
        if (luckySpace) {
          luckySpace.sortByPrice()
        }
      } else if (currentSpace === 'premium') {
        const premiumSpace = this.selectComponent('#premium-space')
        if (premiumSpace) {
          premiumSpace.sortByPrice()
        }
      }
    }
  }
})
