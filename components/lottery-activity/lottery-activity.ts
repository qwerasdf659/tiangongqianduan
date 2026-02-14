/**
 * lottery-activity 万能抽奖组件 - 主逻辑
 *
 * 职责：
 *   1. 接收 campaignCode 属性，自动加载活动配置和奖品列表
 *   2. 根据 display.mode 路由到对应子组件（wxml wx:elif链）
 *   3. 根据 display.effect_theme 设置主题色CSS变量
 *   4. 统一处理13种标准玩法的抽奖API调用
 *   5. 管理组件内部运行时状态（架构决策1.5：不依赖lotteryStore）
 *   6. 根据 size 属性适配展示模式（full/medium/small/mini）
 *
 * 数据来源：调用真实后端API
 *
 * @file components/lottery-activity/lottery-activity.ts
 * @version 2.1.0 (清除mock，全部使用真实API)
 * @since 2026-02-11
 */

/** 引入主题映射表 */
const { getThemeStyle } = require('./themes/themes')

/** 引入API工具 */
const { API } = require('../../utils/index')

/**
 * prize_type → emoji 映射（与后端 DataSanitizer.getPrizeIcon 一致）
 * 仅管理员账号（无icon字段）时作为兜底使用，普通用户后端已返回icon
 * 数据库ENUM: points/physical/virtual/coupon/service
 */
const PRIZE_ICON_MAP: Record<string, string> = {
  points: '🪙',
  physical: '🎁',
  voucher: '🎫',
  virtual: '💎',
  special: '⭐',
  coupon: '🎁',
  service: '🎁'
}

/** 标准化奖品数据：兼容原始数据库字段和脱敏后字段 */
function normalizePrize(raw: any): any {
  return {
    id: raw.id ?? raw.lottery_prize_id,
    name: raw.name ?? raw.prize_name ?? '',
    type: raw.type ?? raw.prize_type ?? '',
    icon: raw.icon || PRIZE_ICON_MAP[raw.prize_type || raw.type || ''] || '🎁',
    sort_order: raw.sort_order ?? 0,
    rarity: raw.rarity ?? '',
    available: raw.available ?? raw.stock_quantity > 0,
    display_points: raw.display_points ?? raw.prize_value ?? 0,
    status: raw.status ?? 'active'
  }
}
/** 默认配置：当后端没有返回mode时使用弹珠机作为兜底玩法 */
const DEFAULT_DISPLAY = {
  mode: 'pinball',
  grid_cols: 3,
  effect_theme: 'default',
  rarity_effects_enabled: false,
  win_animation: 'simple',
  background_image_url: null
}

Component({
  /** 外部属性 */
  properties: {
    /** 活动标识（必填） */
    campaignCode: {
      type: String,
      value: ''
    },
    /** 展示尺寸：full/medium/small/mini */
    size: {
      type: String,
      value: 'full'
    }
  },

  /** 组件内部数据（架构决策1.5：运行时状态全部在data中） */
  data: {
    /** 加载状态 */
    loading: true,
    /** 加载错误信息 */
    loadError: '',

    /** 奖品列表（后端数据） */
    prizes: [] as any[],
    /** 活动配置 */
    config: null as any,

    /** display配置解析后的字段 */
    displayMode: 'pinball',
    displayConfig: {} as any,
    effectTheme: 'default',
    rarityEffectsEnabled: false,
    winAnimation: 'simple',

    /** 主题CSS变量内联样式 */
    themeStyle: '',

    /** 单次抽奖消耗积分 */
    costPerDraw: 0,
    /** 连抽按钮配置 */
    drawButtons: [] as any[],
    /** 用户当前积分余额 */
    pointsBalance: 0,

    /** 刮刮卡当前格子数（由 draw-buttons 设置） */
    scratchDrawCount: 1,
    /** 刮刮卡抽奖结果（API返回后传给 scratch 子组件） */
    scratchResults: [] as any[],

    /** 是否正在抽奖（动画进行中） */
    isDrawing: false,

    /** 中奖奖品在prizes数组中的索引（传给wheel子组件定位指针） */
    targetPrizeIndex: -1,

    /** 抽奖结果相关 */
    showResult: false,
    drawResult: null as any,
    isMultiDraw: false,
    multiDrawResults: [] as any[],

    /** small/mini模式：全屏弹窗是否展开 */
    showFullPopup: false,
    /** 活动封面图URL */
    coverImage: '',
    /** 活动名称 */
    campaignName: '',

    /** 保底砸金蛋相关 */
    guaranteeInfo: null as any,
    /** 是否触发保底砸金蛋（current_pity >= guarantee_threshold） */
    showGuaranteeEgg: false,
    /** 保底金蛋状态：idle/shaking/cracked */
    guaranteeEggState: 'idle' as string,
    /** 保底金蛋抽奖结果 */
    guaranteeEggResult: null as any
  },

  /** 生命周期 */
  lifetimes: {
    attached() {
      if (this.properties.campaignCode) {
        this.initActivity(this.properties.campaignCode)
      }
    },

    detached() {
      /* 组件销毁时data自动清理，无需手动操作 */
    }
  },

  /** 属性监听 */
  observers: {
    campaignCode(newCode: string) {
      if (newCode) {
        this.initActivity(newCode)
      }
    }
  },

  /** 组件方法 */
  methods: {
    /**
     * 初始化活动 - 加载配置和奖品
     * @param campaignCode 活动标识
     */
    async initActivity(campaignCode: string) {
      this.setData({ loading: true, loadError: '' })

      try {
        /* 并行加载配置和奖品 */
        const [configRes, prizesRes] = await Promise.all([
          this._loadConfig(campaignCode),
          this._loadPrizes(campaignCode)
        ])

        if (!configRes.success) {
          this.setData({ loading: false, loadError: '活动配置加载失败' })
          return
        }
        if (!prizesRes.success) {
          this.setData({ loading: false, loadError: '奖品数据加载失败' })
          return
        }

        const config = configRes.data

        /* 先解析display配置，因为mode决定奖品截取策略 */
        const display = { ...DEFAULT_DISPLAY, ...(config.display || {}) }

        /* 标准化字段（兼容管理员原始字段和普通用户脱敏字段） */
        /* 后端返回的所有奖品都应展示（含fallback），不做前端过滤 */
        const prizesRaw = prizesRes.data || []
        const allPrizes = prizesRaw
          .map(normalizePrize)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)

        /* grid 固定8格需要截取，wheel等模式动态渲染全部奖品 */
        const prizes = display.mode === 'grid_3x3' ? allPrizes.slice(0, 8) : allPrizes

        /* 生成主题CSS变量内联样式 */
        const themeStyle = getThemeStyle(display.effect_theme)

        this.setData({
          loading: false,
          config,
          prizes,
          displayMode: display.mode,
          displayConfig: display,
          effectTheme: display.effect_theme,
          rarityEffectsEnabled: display.rarity_effects_enabled,
          winAnimation: display.win_animation,
          themeStyle,
          costPerDraw: config.cost_per_draw || 0,
          drawButtons: config.draw_buttons || [],
          campaignName: config.campaign_name || '',
          coverImage: config.cover_image || display.background_image_url || '',
          guaranteeInfo: config.guarantee_info || null,
          showGuaranteeEgg: this._checkGuaranteeReady(config.guarantee_info)
        })

        /* 读取用户积分余额（从pointsStore） */
        this._syncPointsBalance()
      } catch (err) {
        console.error('[lottery-activity] 初始化失败:', err)
        this.setData({ loading: false, loadError: '网络异常，请重试' })
      }
    },

    /**
     * 加载活动配置
     * @param campaignCode 活动标识
     */
    async _loadConfig(campaignCode: string) {
      return API.getLotteryConfig(campaignCode)
    },

    /**
     * 加载奖品列表
     * @param campaignCode 活动标识
     */
    async _loadPrizes(campaignCode: string) {
      return API.getLotteryPrizes(campaignCode)
    },

    /**
     * 执行抽奖（13种标准玩法通用）
     * 3种特殊玩法（集卡/秒杀/打地鼠）由子组件自行调用API
     * @param campaignCode 活动标识
     * @param count 抽奖次数（1=单抽，>1=连抽）
     */
    async _performDraw(campaignCode: string, count: number) {
      return API.performLottery(campaignCode, count)
    },

    /**
     * 同步用户积分余额（从全局pointsStore读取）
     */
    _syncPointsBalance() {
      try {
        const { pointsStore } = require('../../store/points')
        const pointsBalance = pointsStore.availableAmount || 0
        this.setData({ pointsBalance })
      } catch {
        /* 获取失败时保持默认值0 */
      }
    },

    /**
     * 重置子组件状态（抽奖失败/积分不足时调用）
     */
    _resetSubComponent() {
      try {
        const child = this.selectComponent('#lottery-sub')
        if (child) {
          if (typeof child.resetCards === 'function') { child.resetCards() }
          if (typeof child.resetEggs === 'function') { child.resetEggs() }
          if (typeof child.resetBox === 'function') { child.resetBox() }
          if (typeof child.resetBag === 'function') { child.resetBag() }
          if (typeof child.resetPacket === 'function') { child.resetPacket() }
          if (typeof child.resetGame === 'function') { child.resetGame() }
        }
      } catch (_e) {
        /* 静默失败 */
      }
    },

    /**
     * 子组件触发单抽事件
     */
    async onChildDraw(e: any) {
      const count = e?.detail?.count || 1

      /* 打地鼠模式：特殊处理，抽奖成功后需要通知子组件开始游戏 */
      if (this.data.displayMode === 'whack_mole') {
        await this._handleWhackMoleDraw(count)
        return
      }

      await this._handleDraw(count)
    },

    /**
     * 打地鼠专用抽奖处理
     * 抽奖成功后调用子组件的 startGameWithPrize 方法开始游戏
     */
    async _handleWhackMoleDraw(count: number) {
      if (this.data.isDrawing) { return }

      const campaignCode = this.properties.campaignCode
      const totalCost = this.data.costPerDraw * count

      /* 积分不足检查 */
      if (this.data.pointsBalance < totalCost) {
        wx.showToast({ title: '积分不足', icon: 'none' })
        this._resetSubComponent()
        return
      }

      this.setData({ isDrawing: true })

      try {
        const result = await this._performDraw(campaignCode, count)

        if (!result.success) {
          wx.showToast({ title: result.message || '抽奖失败', icon: 'none' })
          this.setData({ isDrawing: false })
          this._resetSubComponent()
          return
        }

        /* 更新积分余额 */
        if (result.data.remaining_balance !== undefined) {
          this.setData({ pointsBalance: result.data.remaining_balance })
        }

        /* 更新保底进度 */
        if (result.data.guarantee_info !== undefined) {
          this.setData({
            guaranteeInfo: result.data.guarantee_info,
            showGuaranteeEgg: this._checkGuaranteeReady(result.data.guarantee_info)
          })
        }

        /* 缓存奖品数据 */
        this.setData({
          drawResult: {
            prize: result.data.prizes?.[0] || {},
            isMultiDraw: false,
            isError: false
          }
        })

        /* 通知打地鼠子组件开始游戏 */
        const whackmoleComponent = this.selectComponent('#lottery-sub')
        if (whackmoleComponent && typeof whackmoleComponent.startGameWithPrize === 'function') {
          whackmoleComponent.startGameWithPrize(result.data)
        } else {
          console.error('[lottery-activity] 打地鼠组件未找到或方法不存在')
          wx.showToast({ title: '游戏启动失败', icon: 'none' })
          this.setData({ isDrawing: false })
        }

      } catch (err) {
        console.error('[lottery-activity] 打地鼠抽奖失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     * 连抽按钮触发多连抽事件
     */
    async onMultiDraw(e: any) {
      const count = e?.detail?.count || 1
      /* 刮刮卡模式：先更新格子数，等用户刮卡时由 scratch 子组件触发 draw 事件 */
      if (this.data.displayMode === 'scratch_card') {
        this.setData({ scratchDrawCount: count })
        return
      }
      /* 卡牌翻转模式连抽：走专用连翻流程 */
      if ((this.data.displayMode === 'card_flip' || this.data.displayMode === 'flip_card_multi') && count > 1) {
        await this._handleCardFlipMultiDraw(count)
        return
      }
      /* 砸金蛋模式连敲：走专用连敲流程 */
      if (this.data.displayMode === 'golden_egg' && count > 1) {
        await this._handleEggMultiDraw(count)
        return
      }
      /* 福袋模式连开：走专用连开流程 */
      if (this.data.displayMode === 'lucky_bag' && count > 1) {
        await this._handleBagMultiDraw(count)
        return
      }
      /* 红包模式连拆：走专用连拆流程 */
      if (this.data.displayMode === 'red_packet' && count > 1) {
        await this._handlePacketMultiDraw(count)
        return
      }
      await this._handleDraw(count)
    },

    /**
     * 卡牌翻转连抽专用处理
     * 结果传给 card 子组件由用户手动逐张翻开，不触发自动翻转
     */
    async _handleCardFlipMultiDraw(count: number) {
      if (this.data.isDrawing) { return }

      const campaignCode = this.properties.campaignCode
      const totalCost = this.data.costPerDraw * count

      if (this.data.pointsBalance < totalCost) {
        wx.showToast({ title: '积分不足', icon: 'none' })
        this._resetSubComponent()
        return
      }

      this.setData({ isDrawing: true })

      try {
        const result = await this._performDraw(campaignCode, count)

        if (!result.success) {
          wx.showToast({ title: result.message || '抽奖失败', icon: 'none' })
          this.setData({ isDrawing: false })
          this._resetSubComponent()
          return
        }

        const prizes = result.data.prizes || []

        this.setData({
          drawResult: {
            prizes,
            isMultiDraw: true,
            drawCount: count,
            isError: false
          },
          isMultiDraw: true,
          multiDrawResults: prizes
        })

        if (result.data.remaining_balance !== undefined) {
          this.setData({ pointsBalance: result.data.remaining_balance })
        }

        /* 🔧 优化用户体验：API调用完成、卡牌显示后，延迟500ms解除按钮禁用
         * 用户可以边查看当前连翻结果，边继续进行下一次抽奖，不必等待翻完所有卡牌 */
        setTimeout(() => {
          this.setData({
            isDrawing: false,
            showResult: false  /* 连翻模式不显示结果弹窗，直接在卡牌上查看 */
          })
        }, 500)
      } catch (err) {
        console.error('[lottery-activity] 卡牌连抽失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     * 砸金蛋连敲专用处理
     * 结果传给 egg 子组件由用户手动逐个砸开或一键全砸
     */
    async _handleEggMultiDraw(count: number) {
      if (this.data.isDrawing) { return }

      const campaignCode = this.properties.campaignCode
      const totalCost = this.data.costPerDraw * count

      if (this.data.pointsBalance < totalCost) {
        wx.showToast({ title: '积分不足', icon: 'none' })
        this._resetSubComponent()
        return
      }

      this.setData({ isDrawing: true })

      try {
        const result = await this._performDraw(campaignCode, count)

        if (!result.success) {
          wx.showToast({ title: result.message || '抽奖失败', icon: 'none' })
          this.setData({ isDrawing: false })
          this._resetSubComponent()
          return
        }

        const prizes = result.data.prizes || []

        this.setData({
          drawResult: {
            prizes,
            isMultiDraw: true,
            drawCount: count,
            isError: false
          },
          isMultiDraw: true,
          multiDrawResults: prizes
        })

        if (result.data.remaining_balance !== undefined) {
          this.setData({ pointsBalance: result.data.remaining_balance })
        }

        /* 🔧 优化用户体验：API调用完成、金蛋显示后，延迟500ms解除按钮禁用
         * 用户可以边砸金蛋查看结果，边继续进行下一次抽奖 */
        setTimeout(() => {
          this.setData({
            isDrawing: false,
            showResult: false  /* 连敲模式不显示结果弹窗，直接在金蛋上查看 */
          })
        }, 500)
      } catch (err) {
        console.error('[lottery-activity] 金蛋连敲失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     * 福袋连开专用处理
     * 结果传给 luckybag 子组件由用户手动逐个开启或一键全开
     */
    async _handleBagMultiDraw(count: number) {
      if (this.data.isDrawing) { return }

      const campaignCode = this.properties.campaignCode
      const totalCost = this.data.costPerDraw * count

      if (this.data.pointsBalance < totalCost) {
        wx.showToast({ title: '积分不足', icon: 'none' })
        this._resetSubComponent()
        return
      }

      this.setData({ isDrawing: true })

      try {
        const result = await this._performDraw(campaignCode, count)

        if (!result.success) {
          wx.showToast({ title: result.message || '抽奖失败', icon: 'none' })
          this.setData({ isDrawing: false })
          this._resetSubComponent()
          return
        }

        const prizes = result.data.prizes || []

        this.setData({
          drawResult: {
            prizes,
            isMultiDraw: true,
            drawCount: count,
            isError: false
          },
          isMultiDraw: true,
          multiDrawResults: prizes
        })

        if (result.data.remaining_balance !== undefined) {
          this.setData({ pointsBalance: result.data.remaining_balance })
        }

        /* 🔧 优化用户体验：API调用完成、福袋显示后，延迟500ms解除按钮禁用
         * 用户可以边开福袋查看结果，边继续进行下一次抽奖 */
        setTimeout(() => {
          this.setData({
            isDrawing: false,
            showResult: false  /* 连开模式不显示结果弹窗，直接在福袋上查看 */
          })
        }, 500)
      } catch (err) {
        console.error('[lottery-activity] 福袋连开失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     * 红包连拆专用处理
     * 结果传给 redpacket 子组件由用户手动逐个拆开或一键全拆
     */
    async _handlePacketMultiDraw(count: number) {
      if (this.data.isDrawing) { return }

      const campaignCode = this.properties.campaignCode
      const totalCost = this.data.costPerDraw * count

      if (this.data.pointsBalance < totalCost) {
        wx.showToast({ title: '积分不足', icon: 'none' })
        this._resetSubComponent()
        return
      }

      this.setData({ isDrawing: true })

      try {
        const result = await this._performDraw(campaignCode, count)

        if (!result.success) {
          wx.showToast({ title: result.message || '抽奖失败', icon: 'none' })
          this.setData({ isDrawing: false })
          this._resetSubComponent()
          return
        }

        const prizes = result.data.prizes || []

        this.setData({
          drawResult: {
            prizes,
            isMultiDraw: true,
            drawCount: count,
            isError: false
          },
          isMultiDraw: true,
          multiDrawResults: prizes
        })

        if (result.data.remaining_balance !== undefined) {
          this.setData({ pointsBalance: result.data.remaining_balance })
        }

        /* 优化用户体验：API调用完成、红包显示后，延迟500ms解除按钮禁用 */
        setTimeout(() => {
          this.setData({
            isDrawing: false,
            showResult: false
          })
        }, 500)
      } catch (err) {
        console.error('[lottery-activity] 红包连拆失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     */
    async _handleDraw(count: number) {
      if (this.data.isDrawing) {
        return
      }

      const campaignCode = this.properties.campaignCode
      const costPerDraw = this.data.costPerDraw
      const totalCost = costPerDraw * count

      /* 积分不足检查 */
      if (this.data.pointsBalance < totalCost) {
        wx.showToast({ title: '积分不足', icon: 'none' })
        this._resetSubComponent()
        return
      }

      try {
        const result = await this._performDraw(campaignCode, count)

        if (!result.success) {
          wx.showToast({ title: result.message || '抽奖失败', icon: 'none' })
          this._resetSubComponent()
          return
        }

        /* 后端统一返回 data.prizes 数组（单抽 length=1，连抽 length=N） */
        const prizes = result.data.prizes || []

        if (count === 1) {
          const item = prizes[0] || {}

          /* 根据中奖奖品ID在转盘prizes数组中查找对应索引 */
          const displayPrizes = this.data.prizes || []
          const targetPrizeIndex = displayPrizes.findIndex(
            (p: any) => p.id === item.id || p.id === item.sort_order
          )

          /* 先设置targetPrizeIndex，再设置isDrawing，确保wheel拿到正确索引后才开始转 */
          this.setData({
            targetPrizeIndex: targetPrizeIndex >= 0 ? targetPrizeIndex : 0,
            drawResult: {
              prize: item,
              isMultiDraw: false,
              isNotWinning: item.reward_tier === 'low',
              isError: false
            },
            isMultiDraw: false,
            multiDrawResults: [],
            scratchResults: prizes,
            isDrawing: true
          })
        } else {
          this.setData({
            drawResult: {
              prizes,
              isMultiDraw: true,
              drawCount: count,
              isError: false
            },
            isMultiDraw: true,
            multiDrawResults: prizes,
            scratchResults: prizes,
            isDrawing: true
          })
        }

        /* 用后端返回的余额直接更新，避免额外请求 */
        if (result.data.remaining_balance !== undefined) {
          this.setData({ pointsBalance: result.data.remaining_balance })
        }

        /* 更新保底进度（后端每次抽奖可能返回最新guarantee_info） */
        if (result.data.guarantee_info !== undefined) {
          this.setData({
            guaranteeInfo: result.data.guarantee_info,
            showGuaranteeEgg: this._checkGuaranteeReady(result.data.guarantee_info)
          })
        }
      } catch (err) {
        console.error('[lottery-activity] 抽奖失败:', err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     * 子组件动画播放结束回调
     */
    onAnimationEnd(e: any) {
      /* 打地鼠模式：游戏结束，显示奖品结果 */
      if (this.data.displayMode === 'whack_mole') {
        const prizeData = e?.detail?.prizeData
        if (prizeData && prizeData.prizes && prizeData.prizes.length > 0) {
          this.setData({
            isDrawing: false,
            showResult: true,
            drawResult: {
              prize: prizeData.prizes[0],
              isMultiDraw: false,
              isError: false,
              gameStats: e?.detail?.gameStats || {}
            }
          })
        } else {
          this.setData({ isDrawing: false })
        }
        this._syncPointsBalance()
        return
      }

      /* 其他模式：标准流程 */
      this.setData({
        isDrawing: false,
        showResult: true
      })

      /* 刷新积分余额 */
      this._syncPointsBalance()
    },

    /**
     * 结果弹窗关闭
     */
    onResultClose() {
      this.setData({
        showResult: false,
        drawResult: null,
        isMultiDraw: false,
        multiDrawResults: [],
        targetPrizeIndex: -1,
        scratchDrawCount: 1,
        scratchResults: [],
        guaranteeEggState: 'idle'
      })
      /* 重置子组件卡牌，允许再次抽奖 */
      this._resetSubComponent()
    },

    /**
     * 连抽逐个揭晓下一个
     */
    onRevealNext() {
      /* 由 result-modal 组件内部管理揭晓进度 */
    },

    /**
     * 检查是否达到保底条件
     */
    _checkGuaranteeReady(info: any): boolean {
      if (!info) { return false }
      return info.current_pity >= info.guarantee_threshold
    },

    /**
     * 保底砸金蛋：用户点击金蛋
     */
    async onGuaranteeEggTap() {
      if (this.data.guaranteeEggState !== 'idle') { return }
      if (this.data.isDrawing) { return }

      this.setData({ guaranteeEggState: 'shaking' })

      /* 晃动动画0.6s后发起抽奖 */
      setTimeout(async () => {
        try {
          const campaignCode = this.properties.campaignCode
          const result = await this._performDraw(campaignCode, 1)

          if (!result.success) {
            wx.showToast({ title: result.message || '保底抽奖失败', icon: 'none' })
            this.setData({ guaranteeEggState: 'idle' })
            return
          }

          const prizes = result.data.prizes || []
          const item = prizes[0] || {}

          /* 播放碎裂动画 */
          this.setData({ guaranteeEggState: 'cracked' })

          /* 更新余额 */
          if (result.data.remaining_balance !== undefined) {
            this.setData({ pointsBalance: result.data.remaining_balance })
          }

          /* 碎裂动画结束后弹出结果 */
          setTimeout(() => {
            this.setData({
              showResult: true,
              drawResult: {
                prize: item,
                isMultiDraw: false,
                isNotWinning: false,
                isError: false,
                isGuarantee: true
              },
              guaranteeEggState: 'idle',
              showGuaranteeEgg: false,
              guaranteeInfo: null
            })
            this._syncPointsBalance()
          }, 1300)
        } catch (err) {
          console.error('[lottery-activity] 保底砸金蛋失败:', err)
          wx.showToast({ title: '网络异常，请重试', icon: 'none' })
          this.setData({ guaranteeEggState: 'idle' })
        }
      }, 700)
    },

    /**
     * 重新加载（错误状态下点击重试）
     */
    onRetry() {
      if (this.properties.campaignCode) {
        this.initActivity(this.properties.campaignCode)
      }
    },

    /**
     * small/mini模式：点击入口展开全屏弹窗
     */
    onTapEntry() {
      this.setData({ showFullPopup: true })
    },

    /**
     * small/mini模式：关闭全屏弹窗
     */
    onClosePopup() {
      this.setData({ showFullPopup: false })
    }
  }
})

export { }

