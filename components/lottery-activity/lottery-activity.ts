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
 * @version 5.2.0
 * @since 2026-02-11
 */

/** 引入主题映射表 */
const { getThemeStyle } = require('./themes/themes')

/** 引入API工具和认证助手 */
const { API, Logger, Utils } = require('../../utils/index')
const log = Logger.createLogger('lottery-activity')
const { checkAuth } = Utils

/** 引入积分Store - 抽奖后同步更新全局积分状态，确保页面头部实时刷新 */
const { pointsStore } = require('../../store/points')

/**
 * prize_type → emoji 映射（UI展示常量）
 *
 * 后端不再返回 icon 字段（已从 DataSanitizer 移除），
 * 前端根据 prize_type 自行生成展示用 emoji。
 * 数据库 ENUM: points/physical/virtual/coupon/service
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

/**
 * 为奖品数据添加 UI 展示字段 prize_icon + prize_image_url
 *
 * 后端返回字段: id, prize_name, prize_type, prize_value, rarity_code, sort_order, reward_tier, image
 * - image: 有图片时为 { id, url, mime, thumbnail_url }，无图片时为 null
 * - 前端补充 prize_icon（emoji兜底）和 prize_image_url（图片优先展示）
 */
function addPrizeIcon(prize: any): any {
  prize.prize_icon = PRIZE_ICON_MAP[prize.prize_type] || '🎁'
  prize.prize_image_url =
    prize.image && prize.image.url ? prize.image.thumbnail_url || prize.image.url : ''
  return prize
}
/**
 * 默认display配置（降级策略）
 * 当后端未返回 display 字段时使用此默认值
 * 严格对齐文档《前端适配清单-多活动抽奖展示配置》降级策略定义
 */
const DEFAULT_DISPLAY = {
  mode: 'grid_3x3',
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

    /** display配置解析后的字段（默认值对齐 DEFAULT_DISPLAY） */
    displayMode: 'grid_3x3',
    displayConfig: {} as any,
    effectTheme: 'default',
    rarityEffectsEnabled: false,
    winAnimation: 'simple',
    /** 活动背景图URL（display.background_image_url，null表示无背景图） */
    backgroundImageUrl: '' as string,

    /** 主题CSS变量内联样式 */
    themeStyle: '',

    /** 单抽实际消耗积分（折扣后per_draw_cost，由后端LotteryPricingService驱动） */
    costPerDraw: 0,
    /** 连抽按钮渲染配置（转换后的draw_buttons，仅draw_count>1的连抽档位） */
    drawButtons: [] as any[],
    /** 后端原始 draw_buttons 全量数组（含单抽，用于 _getDrawTotalCost 精确匹配） */
    rawDrawButtons: [] as any[],
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
    guaranteeEggResult: null as any,

    /** 连抽按钮是否显示（由 size 和 drawButtons 共同决定，供 lottery-modes.wxml 绑定） */
    showDrawButtons: false
  },

  /** 生命周期 */
  lifetimes: {
    attached() {
      if (this.properties.campaignCode) {
        this._initFromLifecycle(this.properties.campaignCode)
      }
    },

    detached() {
      this._currentCampaign = null
    }
  },

  /** 属性监听 */
  observers: {
    campaignCode(newCode: string) {
      if (newCode && newCode !== this._currentCampaign) {
        this._initFromLifecycle(newCode)
      }
    }
  },

  /** 组件方法 */
  methods: {
    /**
     * 生命周期统一入口 — 防止 attached + observer 双重触发
     * 记录当前活动标识，相同标识不重复初始化
     */
    _initFromLifecycle(campaignCode: string) {
      if (this._currentCampaign === campaignCode) {
        return
      }
      this._currentCampaign = campaignCode
      this.initActivity(campaignCode)
    },

    /**
     * 初始化活动 - 加载配置和奖品
     * 前置校验: 认证状态检查，未登录时显示友好提示而非触发API报错
     * @param campaignCode 活动标识
     */
    async initActivity(campaignCode: string) {
      if (!checkAuth({ redirect: false, showToast: false })) {
        this.setData({ loading: false, loadError: '请先登录后查看活动' })
        return
      }

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

        /**
         * 奖品列表: ApiResponse 标准信封，data 直接是数组
         * 后端字段: id, prize_name, prize_type, prize_value, rarity_code, sort_order, reward_tier, image
         */
        const prizesRaw: any[] = prizesRes.data

        if (!Array.isArray(prizesRaw) || prizesRaw.length === 0) {
          log.warn('[lottery-activity] 奖品数据为空, data:', prizesRaw)
        }

        const allPrizes = (Array.isArray(prizesRaw) ? prizesRaw : [])
          .map(addPrizeIcon)
          .sort((a: any, b: any) => a.sort_order - b.sort_order)

        /* grid 固定8格需要截取，wheel等模式动态渲染全部奖品 */
        const prizes = display.mode === 'grid_3x3' ? allPrizes.slice(0, 8) : allPrizes

        /* 生成主题CSS变量内联样式 */
        const themeStyle = getThemeStyle(display.effect_theme)

        /* 后端原始 draw_buttons 全量数组（含单抽，用于积分判断） */
        const rawDrawButtons = config.draw_buttons || []
        /* 将后端 draw_buttons 转换为 draw-buttons 组件所需的渲染格式（仅连抽） */
        const drawButtons = this._transformDrawButtons(rawDrawButtons)

        const currentSize = this.properties.size || 'full'
        this.setData({
          loading: false,
          config,
          prizes,
          displayMode: display.mode,
          displayConfig: display,
          effectTheme: display.effect_theme,
          rarityEffectsEnabled: display.rarity_effects_enabled,
          winAnimation: display.win_animation,
          backgroundImageUrl: display.background_image_url || '',
          themeStyle,
          costPerDraw: config.per_draw_cost || 0,
          drawButtons,
          rawDrawButtons,
          showDrawButtons:
            drawButtons.length > 0 &&
            (currentSize === 'full' || currentSize === 'small' || currentSize === 'mini'),
          campaignName: config.campaign_name || '',
          coverImage: config.cover_image || display.background_image_url || '',
          guaranteeInfo: config.guarantee_info || null,
          showGuaranteeEgg: this._checkGuaranteeReady(config.guarantee_info)
        })

        /* 读取用户积分余额（从pointsStore） */
        this._syncPointsBalance()
      } catch (err) {
        log.error('[lottery-activity] 初始化失败:', err)
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
     * 抽奖后更新积分余额 - 同时更新组件状态、全局Store、并通知父页面
     *
     * @param remainingBalance 后端返回的 remaining_balance（扣除后的可用积分）
     */
    _updateBalanceAfterDraw(remainingBalance: number) {
      /* 更新组件内部积分（用于组件内积分不足判断） */
      this.setData({ pointsBalance: remainingBalance })

      /* 同步更新全局积分Store */
      const currentFrozen = pointsStore.frozenAmount || 0
      pointsStore.setBalance(remainingBalance, currentFrozen)
    },

    /**
     * 通知父页面积分已变化 - 使用 triggerEvent 标准组件通信
     *
     * 解决的问题：抽奖后页面头部"可用积分"不立即刷新
     * 原因：MobX createStoreBindings 的 computed 字段在微信小程序中
     *       不一定能同步触发 setData 更新格式化显示值
     * 方案：通过 triggerEvent 显式通知父页面调用 _refreshPoints()，
     *       该方法会调用 API.getPointsBalance() 并显式执行
     *       updatePointsDisplay() → this.setData({ pointsBalanceFormatted })
     *       这是最可靠的更新路径，与切换Tab返回时触发的更新逻辑完全一致
     */
    _notifyPointsChanged() {
      this.triggerEvent('pointsupdate')
    },

    /**
     * 同步用户积分余额（从全局pointsStore读取）
     * 用于组件初始化和动画结束后同步最新余额
     */
    _syncPointsBalance() {
      try {
        const pointsBalance = pointsStore.availableAmount || 0
        this.setData({ pointsBalance })
      } catch {
        /* 获取失败时保持默认值0 */
      }
    },

    /**
     * 重置子组件状态（抽奖失败/积分不足时调用）
     * 所有子组件统一实现 reset() 方法，父组件无需关心具体玩法类型
     */
    _resetSubComponent() {
      try {
        const child = this.selectComponent('#lottery-sub')
        if (child && typeof child.reset === 'function') {
          child.reset()
        }
      } catch (resetError) {
        log.warn('[lottery-activity] 子组件重置失败:', resetError)
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
      if (this.data.isDrawing) {
        return
      }

      const campaignCode = this.properties.campaignCode
      /* 优先从 draw_buttons 获取对应档位的 total_cost（含折扣），回退到 per_draw_cost * count */
      const totalCost = this._getDrawTotalCost(count)

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

        /* 更新积分余额 → 同步组件状态 + 全局Store */
        if (result.data.remaining_balance !== undefined) {
          this._updateBalanceAfterDraw(result.data.remaining_balance)
        }
        /* 通知父页面刷新积分显示（无论后端是否返回remaining_balance都触发） */
        this._notifyPointsChanged()

        /* 更新保底进度 */
        if (result.data.guarantee_info !== undefined) {
          this.setData({
            guaranteeInfo: result.data.guarantee_info,
            showGuaranteeEgg: this._checkGuaranteeReady(result.data.guarantee_info)
          })
        }

        /* 缓存奖品数据（添加 prize_icon UI展示字段） */
        const whackmolePrize = addPrizeIcon(result.data.prizes?.[0] || {})
        this.setData({
          drawResult: {
            prize: whackmolePrize,
            isMultiDraw: false,
            isError: false
          }
        })

        /* 通知打地鼠子组件开始游戏 */
        const whackmoleComponent = this.selectComponent('#lottery-sub')
        if (whackmoleComponent && typeof whackmoleComponent.startGameWithPrize === 'function') {
          whackmoleComponent.startGameWithPrize(result.data)
        } else {
          log.error('[lottery-activity] 打地鼠组件未找到或方法不存在')
          wx.showToast({ title: '游戏启动失败', icon: 'none' })
          this.setData({ isDrawing: false })
        }
      } catch (err) {
        log.error('[lottery-activity] 打地鼠抽奖失败:', err)
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
      /* 支持手动逐个查看的连抽模式（卡牌翻转、砸金蛋、福袋、红包） */
      const multiDrawModeNames: Record<string, string> = {
        card_flip: '卡牌连抽',
        flip_card_multi: '卡牌连抽',
        golden_egg: '金蛋连敲',
        lucky_bag: '福袋连开',
        red_packet: '红包连拆'
      }
      const modeName = multiDrawModeNames[this.data.displayMode]
      if (modeName && count > 1) {
        await this._handleGenericMultiDraw(modeName, count)
        return
      }
      await this._handleDraw(count)
    },

    /**
     * 通用连抽处理（卡牌翻转、砸金蛋、福袋、红包等）
     * 结果传给对应子组件由用户手动逐个查看，不触发自动动画
     * @param modeName 玩法中文名（用于日志输出，如"卡牌连抽"、"金蛋连敲"）
     * @param count 连抽次数
     */
    async _handleGenericMultiDraw(modeName: string, count: number) {
      if (this.data.isDrawing) {
        return
      }

      const campaignCode = this.properties.campaignCode
      /* 优先从 draw_buttons 获取对应档位的 total_cost（含折扣），回退到 per_draw_cost * count */
      const totalCost = this._getDrawTotalCost(count)

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

        const prizes = (result.data.prizes || []).map(addPrizeIcon)

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

        /* 更新积分余额 → 同步组件状态 + 全局Store */
        if (result.data.remaining_balance !== undefined) {
          this._updateBalanceAfterDraw(result.data.remaining_balance)
        }
        /* 通知父页面刷新积分显示（无论后端是否返回remaining_balance都触发） */
        this._notifyPointsChanged()

        /* 🔧 优化用户体验：API调用完成后，延迟500ms解除按钮禁用
         * 用户可以边查看当前结果，边继续进行下一次抽奖 */
        setTimeout(() => {
          this.setData({
            isDrawing: false,
            showResult: false /* 连抽模式不显示结果弹窗，直接在子组件上查看 */
          })
        }, 500)
      } catch (err) {
        log.error(`[lottery-activity] ${modeName}失败:`, err)
        wx.showToast({ title: '网络异常，请重试', icon: 'none' })
        this.setData({ isDrawing: false })
        this._resetSubComponent()
      }
    },

    /**
     * 通用抽奖处理（单抽和非特殊模式的连抽）
     * @param count 抽奖次数（1=单抽，>1=连抽）
     */
    async _handleDraw(count: number) {
      if (this.data.isDrawing) {
        return
      }

      const campaignCode = this.properties.campaignCode
      /* 优先从 draw_buttons 获取对应档位的 total_cost（含折扣），回退到 per_draw_cost * count */
      const totalCost = this._getDrawTotalCost(count)

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

        /**
         * 后端统一返回 data.prizes 数组（单抽 length=1，连抽 length=N）
         * 字段: id, prize_name, prize_type, prize_value, rarity_code, sort_order, reward_tier, image
         */
        const prizes = (result.data.prizes || []).map(addPrizeIcon)

        if (count === 1) {
          const item = prizes[0] || {}

          /**
           * 根据抽奖结果的 sort_order 计算九宫格目标索引
           * 文档定义: index = sort_order - 1
           * sort_order 1-8 顺时针排列，对应 prizes 数组索引 0-7
           */
          const sortOrder = item.sort_order || 0
          const targetPrizeIndex = sortOrder > 0 ? sortOrder - 1 : 0

          /* 先设置targetPrizeIndex，再设置isDrawing，确保wheel/grid拿到正确索引后才开始动画 */
          this.setData({
            targetPrizeIndex,
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

        /* 更新积分余额 → 同步组件状态 + 全局Store */
        if (result.data.remaining_balance !== undefined) {
          this._updateBalanceAfterDraw(result.data.remaining_balance)
        }
        /* 通知父页面刷新积分显示（无论后端是否返回remaining_balance都触发） */
        this._notifyPointsChanged()

        /* 更新保底进度（后端每次抽奖可能返回最新guarantee_info） */
        if (result.data.guarantee_info !== undefined) {
          this.setData({
            guaranteeInfo: result.data.guarantee_info,
            showGuaranteeEgg: this._checkGuaranteeReady(result.data.guarantee_info)
          })
        }
      } catch (err) {
        log.error('[lottery-activity] 抽奖失败:', err)
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
     * 获取指定抽奖次数的实际总花费积分
     * 优先从后端原始 draw_buttons 全量数组查找对应档位的 total_cost（含折扣），
     * 找不到时回退到 per_draw_cost * count（无折扣估算）
     *
     * @param count 抽奖次数（1/3/5/10等）
     * @returns 该次数的实际总花费积分
     */
    _getDrawTotalCost(count: number): number {
      /* 使用后端原始全量数组（含单抽），确保所有档位都能精确匹配 */
      const rawButtons = this.data.rawDrawButtons || []
      const matchedButton = rawButtons.find((btn: any) => btn.draw_count === count)
      if (matchedButton && matchedButton.total_cost !== undefined) {
        return matchedButton.total_cost
      }
      /* 未匹配到档位（如自定义次数），使用单抽价 * 次数作为保守估算 */
      return this.data.costPerDraw * count
    },

    /**
     * 将后端 draw_buttons 数组转换为 draw-buttons 组件所需的渲染格式
     * 过滤掉单抽（draw_count=1，由子玩法组件处理），仅保留连抽档位
     * 附加UI渲染属性：btnClass、fullWidth、showGuarantee
     *
     * 后端 draw_buttons 数组项字段：
     *   draw_count, discount, label, per_draw, total_cost, original_cost, saved_points
     *
     * @param rawButtons 后端返回的 draw_buttons 原始数组
     * @returns 转换后的连抽按钮渲染数组
     */
    _transformDrawButtons(rawButtons: any[]): any[] {
      if (!Array.isArray(rawButtons) || rawButtons.length === 0) {
        return []
      }

      /** 连抽次数 → 按钮样式类名映射 */
      const btnClassMap: Record<number, string> = {
        3: 'triple-btn',
        5: 'five-btn',
        10: 'ten-btn special full-width'
      }

      return rawButtons
        .filter((btn: any) => btn.draw_count > 1) /* 过滤掉单抽 */
        .map((btn: any) => ({
          /* 保留后端原始字段（snake_case，WXS通过getCost/getCount读取） */
          draw_count: btn.draw_count,
          label: btn.label,
          total_cost: btn.total_cost,
          original_cost: btn.original_cost,
          saved_points: btn.saved_points,
          discount: btn.discount,
          per_draw: btn.per_draw,
          /* 附加UI渲染属性 */
          btnClass: btnClassMap[btn.draw_count] || 'multi-btn',
          fullWidth: btn.draw_count >= 10,
          showGuarantee: btn.draw_count >= 10,
          guaranteeText: btn.draw_count >= 10 ? '保底好礼' : ''
        }))
    },

    /**
     * 检查是否达到保底条件
     */
    _checkGuaranteeReady(info: any): boolean {
      if (!info) {
        return false
      }
      return info.current_pity >= info.guarantee_threshold
    },

    /**
     * 保底砸金蛋：用户点击金蛋
     */
    async onGuaranteeEggTap() {
      if (this.data.guaranteeEggState !== 'idle') {
        return
      }
      if (this.data.isDrawing) {
        return
      }

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

          const prizes = (result.data.prizes || []).map(addPrizeIcon)
          const item = prizes[0] || {}

          /* 播放碎裂动画 */
          this.setData({ guaranteeEggState: 'cracked' })

          /* 更新积分余额 → 同步组件状态 + 全局Store */
          if (result.data.remaining_balance !== undefined) {
            this._updateBalanceAfterDraw(result.data.remaining_balance)
          }
          /* 通知父页面刷新积分显示 */
          this._notifyPointsChanged()

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
          log.error('[lottery-activity] 保底砸金蛋失败:', err)
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

export {}
