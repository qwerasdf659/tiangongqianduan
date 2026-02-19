/**
 * 弹珠机 子组件 - Plinko风格弹珠台
 * @file sub/pinball/pinball.ts
 * @version 5.2.0
 *
 * 核心流程（与父组件 lottery-activity 协同）：
 *   1. 用户点"发射弹珠" → 触发 draw 事件 → 父组件调用后端API
 *   2. 父组件设置 isInProgress=true + targetPrizeIndex → 本组件开始动画
 *   3. 弹珠沿预计算路径在钉阵中弹跳下落（含尾迹+碰撞波纹）
 *   4. 弹珠落入目标奖品槽 → 庆祝特效 → 触发 animationEnd
 *
 * v6.0 优化：
 *   - 金色金属弹珠 + 动态旋转角度
 *   - 弹珠尾迹粒子（5个拖尾光点）
 *   - 碰撞冲击波视觉反馈
 *   - 更多中间路径点（更自然的物理弹跳）
 *   - 优化动画时序（更丝滑的节奏感）
 *   - 入场动画支持
 */

Component({
  properties: {
    /** 奖品列表 */
    prizes: { type: Array, value: [] },
    /** 单次消耗积分 */
    costPoints: { type: Number, value: 0 },
    /** 用户积分余额 */
    pointsBalance: { type: Number, value: 0 },
    /** 是否正在抽奖（父组件API返回后设为true） */
    isInProgress: { type: Boolean, value: false },
    /** 中奖奖品在prizes数组中的索引（父组件传入） */
    targetPrizeIndex: { type: Number, value: -1 },
    /** 主题 */
    effectTheme: { type: String, value: 'default' },
    /** 稀有度光效 */
    rarityEffects: { type: Boolean, value: false },
    /** 中奖动画 */
    winAnimation: { type: String, value: 'simple' },
    /** display配置 */
    displayConfig: { type: Object, value: {} }
  },

  data: {
    /** 状态机: ready → launching → bouncing → landed */
    ballState: 'ready' as string,
    /** 弹珠当前X位置（百分比） */
    ballX: 50,
    /** 弹珠当前Y位置（百分比） */
    ballY: 3,
    /** 弹珠旋转角度 */
    ballAngle: 0,
    /** 钉子数组 [{id, x, y, row, col, lit}] */
    pegs: [] as any[],
    /** 钉阵行数 */
    pegRows: 7,
    /** 奖品槽数组 [{index, prize, active, winner}] */
    slots: [] as any[],
    /** 奖品槽数量 */
    slotCount: 6,
    /** 背景粒子 */
    particles: [] as any[],
    /** 是否显示庆祝特效 */
    showCelebration: false,
    /** 落入的槽位索引 */
    landedSlot: -1,
    /** 弹珠尾迹粒子 [{id, x, y, opacity, scale}] */
    trailDots: [] as any[],
    /** 碰撞冲击波 */
    impactRipple: { show: false, x: 0, y: 0 } as any
  },

  lifetimes: {
    attached() {
      this._initBoard()
      this._initParticles()
    },
    detached() {
      this._cleanupTimers()
    }
  },

  observers: {
    /** 奖品或配置变化时重新初始化面板 */
    'prizes, displayConfig'() {
      if (this.data.ballState === 'ready') {
        this._initBoard()
      }
    },
    /** 父组件API返回后触发弹珠下落动画；API结束后自动重置 */
    isInProgress(val: boolean) {
      if (val && this.data.ballState === 'launching') {
        /* isInProgress 从 false→true：开始弹珠动画 */
        const apiTargetIndex = this.properties.targetPrizeIndex as number
        this._startBouncing(apiTargetIndex >= 0 ? apiTargetIndex : 0)
      } else if (!val && this.data.ballState === 'landed') {
        /* isInProgress 从 true→false：动画结束后父组件已收到结果，延迟重置弹珠台 */
        this._resetTimer = setTimeout(() => {
          this.resetBall()
        }, 600)
      }
    }
  },

  methods: {
    // ========================================
    // 初始化
    // ========================================

    /**
     * 初始化游戏面板：钉阵 + 奖品槽
     * 钉阵采用Plinko交错布局，偶数行少1颗钉
     */
    _initBoard() {
      const cfg = this.properties.displayConfig as any
      const prizesData = this.properties.prizes as any[]
      const slotCount = Math.min(cfg?.path_count || prizesData.length || 6, 8)

      /* 生成Plinko钉阵（交错排列，7行） */
      const pegRows = 7
      const generatedPegs: any[] = []

      for (let row = 0; row < pegRows; row++) {
        const isEvenRow = row % 2 === 0
        /** 偶数行 slotCount-1 颗，奇数行 slotCount 颗 */
        const count = isEvenRow ? slotCount - 1 : slotCount

        for (let col = 0; col < count; col++) {
          /** 偶数行钉子对齐槽位边界，奇数行对齐槽位中心 */
          const pegX = isEvenRow
            ? ((col + 1) / slotCount) * 80 + 10
            : ((col + 0.5) / slotCount) * 80 + 10
          const pegY = 10 + (row / (pegRows - 1)) * 55

          generatedPegs.push({
            id: `p${row}-${col}`,
            x: Math.round(pegX * 10) / 10,
            y: Math.round(pegY * 10) / 10,
            row,
            col,
            lit: false
          })
        }
      }

      /* 生成奖品槽 */
      const generatedSlots = Array.from({ length: slotCount }, (_, i) => ({
        index: i,
        prize: prizesData[i % prizesData.length] || { name: '奖品', icon: '🎁' },
        active: false,
        winner: false
      }))

      this.setData({
        pegs: generatedPegs,
        pegRows,
        slots: generatedSlots,
        slotCount,
        ballState: 'ready',
        ballX: 50,
        ballY: 3,
        ballAngle: 0,
        showCelebration: false,
        landedSlot: -1,
        trailDots: [],
        impactRipple: { show: false, x: 0, y: 0 }
      })
    },

    /** 初始化背景装饰粒子 */
    _initParticles() {
      const decorIcons = ['✨', '⭐', '💫', '🌟', '·', '°', '✦']
      const generatedParticles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        icon: decorIcons[i % decorIcons.length],
        delay: Math.random() * 8,
        duration: 3 + Math.random() * 6
      }))
      this.setData({ particles: generatedParticles })
    },

    // ========================================
    // 用户交互
    // ========================================

    /** 点击发射按钮 */
    onLaunch() {
      if (this.data.ballState !== 'ready') {
        return
      }

      /* 重置钉子和槽位状态 */
      const resetPegs = this.data.pegs.map((p: any) => ({ ...p, lit: false }))
      const resetSlots = this.data.slots.map((s: any) => ({ ...s, active: false, winner: false }))

      /* 切换到 launching 状态，等待API返回 */
      this.setData({
        ballState: 'launching',
        ballX: 50,
        ballY: 3,
        ballAngle: 0,
        showCelebration: false,
        pegs: resetPegs,
        slots: resetSlots,
        trailDots: [],
        impactRipple: { show: false, x: 0, y: 0 }
      })

      /* 触发 draw 事件，父组件调用后端API */
      this.triggerEvent('draw', { count: 1 })
    },

    // ========================================
    // 弹珠动画
    // ========================================

    /**
     * 开始弹珠弹跳动画
     * @param targetSlotIndex 目标槽位索引（由API结果决定）
     */
    _startBouncing(targetSlotIndex: number) {
      const { slotCount, pegRows } = this.data
      const safeTargetSlot = Math.min(targetSlotIndex, slotCount - 1)

      /* 生成弹珠下落路径（含中间插值点，更自然的物理轨迹） */
      const generatedPath = this._generatePath(safeTargetSlot, slotCount, pegRows)

      /* 初始化尾迹历史队列 */
      this._trailHistory = []

      this.setData({ ballState: 'bouncing' })

      /* 开始逐帧动画 */
      this._animateStep(0, generatedPath, safeTargetSlot)
    },

    /**
     * 生成弹珠路径（v6.0增强版）
     * 每行钉子产生2个waypoint（碰撞点+弹开点），使弹跳更自然
     *
     * @param targetIndex 目标槽位索引
     * @param totalSlots 总槽位数
     * @param rowCount 钉阵行数
     * @returns waypoints数组 [{x, y}]
     */
    _generatePath(targetIndex: number, totalSlots: number, rowCount: number) {
      const waypoints: any[] = []
      /** 目标槽位中心X坐标 */
      const targetX = ((targetIndex + 0.5) / totalSlots) * 80 + 10
      let currentX = 50

      /* 起始：发射口位置 */
      waypoints.push({ x: 50, y: 3 })

      /* 发射下降（从发射口到第一行钉子的过渡） */
      waypoints.push({ x: 50, y: 7 })

      /* 经过每行钉子，生成碰撞点+弹开点 */
      for (let i = 0; i < rowCount; i++) {
        const progress = (i + 1) / rowCount

        /** 向目标方向的吸引力（越深越强，保证最终能到目标） */
        const pull = (targetX - currentX) * (0.1 + progress * 0.2)
        /** 随机偏移（越深越小，模拟收敛） */
        const wobble = (Math.random() - 0.5) * (25 * (1 - progress * 0.75))
        currentX += pull + wobble
        currentX = Math.max(8, Math.min(92, currentX))

        const waypointY = 10 + progress * 55

        /* 碰撞点（接近钉子） */
        waypoints.push({
          x: Math.round(currentX * 10) / 10,
          y: Math.round(waypointY * 10) / 10,
          isCollision: true // 标记碰撞点用于触发视觉效果
        })

        /* 弹开微偏移（碰撞后的小幅弹跳，更自然） */
        if (i < rowCount - 1) {
          const bounceX = currentX + (Math.random() - 0.5) * 6
          const bounceY = waypointY + 3 + Math.random() * 2
          waypoints.push({
            x: Math.round(Math.max(8, Math.min(92, bounceX)) * 10) / 10,
            y: Math.round(bounceY * 10) / 10,
            isCollision: false
          })
        }
      }

      /* 从最后一行钉子滑向槽位入口（过渡段 - 添加更多中间点） */
      const transX1 = currentX + (targetX - currentX) * 0.4
      const transX2 = currentX + (targetX - currentX) * 0.75
      waypoints.push({
        x: Math.round(transX1 * 10) / 10,
        y: 70
      })
      waypoints.push({
        x: Math.round(transX2 * 10) / 10,
        y: 74
      })

      /* 最终落入目标槽位 */
      waypoints.push({
        x: Math.round(targetX * 10) / 10,
        y: 80
      })

      return waypoints
    },

    /**
     * 逐步执行弹珠动画：沿路径移动弹珠 + 尾迹 + 碰撞反馈
     *
     * @param step 当前步骤索引
     * @param path 路径点数组
     * @param targetSlot 目标槽位索引
     */
    _animateStep(step: number, path: any[], targetSlot: number) {
      if (step >= path.length) {
        this._onLanded(targetSlot)
        return
      }

      const point = path[step]
      const prevPoint = step > 0 ? path[step - 1] : point
      const updateData: any = {
        ballX: point.x,
        ballY: point.y
      }

      /* 计算弹珠旋转角度（基于水平移动方向） */
      const deltaX = point.x - prevPoint.x
      updateData.ballAngle = (this.data.ballAngle + deltaX * 8) % 360

      /* 更新弹珠尾迹 */
      this._updateTrail(point.x, point.y, updateData)

      /* 碰撞检测 + 钉子发光 + 冲击波 */
      const isMiddlePhase = step > 1 && step < path.length - 3
      if (isMiddlePhase) {
        const litPegs = this.data.pegs.map((peg: any) => {
          const dist = Math.sqrt(Math.pow(point.x - peg.x, 2) + Math.pow(point.y - peg.y, 2))
          return { ...peg, lit: dist < 10 }
        })
        updateData.pegs = litPegs

        /* 碰撞点触发冲击波 */
        if (point.isCollision) {
          updateData.impactRipple = { show: true, x: point.x, y: point.y }
          /* 定时隐藏冲击波 */
          if (this._rippleTimer) {
            clearTimeout(this._rippleTimer)
          }
          this._rippleTimer = setTimeout(() => {
            this.setData({ 'impactRipple.show': false })
          }, 500)
        }
      }

      this.setData(updateData)

      /* 碰撞点震动反馈 */
      if (point.isCollision && isMiddlePhase) {
        try {
          wx.vibrateShort({ type: 'light' })
        } catch (_e) {
          /* 部分设备不支持震动API，静默降级 */
        }
      }

      /**
       * 动态延迟（v6.0优化版）：
       *   - 发射阶段（前10%）：较慢，体现蓄力
       *   - 碰撞点：稍慢（模拟碰撞停顿）
       *   - 弹跳点：较快（弹开感）
       *   - 接近底部（后15%）：减速收敛
       */
      const progress = step / path.length
      let stepDelay: number
      if (progress < 0.1) {
        stepDelay = 340 // 发射蓄力
      } else if (progress > 0.88) {
        stepDelay = 280 // 底部减速
      } else if (point.isCollision) {
        stepDelay = 200 + Math.random() * 40 // 碰撞稍停
      } else {
        stepDelay = 140 + Math.random() * 50 // 弹跳较快
      }

      this._stepTimer = setTimeout(() => {
        this._animateStep(step + 1, path, targetSlot)
      }, stepDelay)
    },

    /**
     * 更新弹珠尾迹粒子（维护最多5个拖尾点）
     */
    _updateTrail(x: number, y: number, updateData: any) {
      if (!this._trailHistory) {
        this._trailHistory = []
      }

      /* 记录当前位置 */
      this._trailHistory.push({ x, y })

      /* 保留最近6个位置点 */
      if (this._trailHistory.length > 6) {
        this._trailHistory.shift()
      }

      /* 生成5个尾迹粒子（越远越透明越小） */
      const trailDots = this._trailHistory.slice(0, -1).map((pos: any, i: number) => {
        const age = this._trailHistory.length - 1 - i
        return {
          id: i,
          x: pos.x,
          y: pos.y,
          opacity: Math.max(0.1, 0.6 - age * 0.12),
          scale: Math.max(0.2, 0.8 - age * 0.12)
        }
      })

      updateData.trailDots = trailDots
    },

    // ========================================
    // 落槽处理
    // ========================================

    /** 弹珠落入槽位 - 播放庆祝特效 */
    _onLanded(slotIndex: number) {
      /* 高亮中奖槽位 */
      const landedSlots = this.data.slots.map((s: any, i: number) => ({
        ...s,
        active: i === slotIndex,
        winner: i === slotIndex
      }))

      /* 清除所有钉子高亮和尾迹 */
      const finalPegs = this.data.pegs.map((p: any) => ({ ...p, lit: false }))

      this.setData({
        ballState: 'landed',
        slots: landedSlots,
        pegs: finalPegs,
        landedSlot: slotIndex,
        showCelebration: true,
        trailDots: [],
        impactRipple: { show: false, x: 0, y: 0 }
      })

      /* 长震动反馈（中奖仪式感） */
      try {
        wx.vibrateLong()
      } catch (_e) {
        /* 部分设备不支持震动API，静默降级 */
      }

      /* 延迟通知父组件动画结束（让庆祝特效充分播放） */
      this._endTimer = setTimeout(() => {
        this.triggerEvent('animationEnd')
      }, 2000)
    },

    // ========================================
    // 工具方法
    // ========================================

    /** 重置弹珠状态（父组件调用） */
    resetBall() {
      this._cleanupTimers()
      this._trailHistory = []
      this._initBoard()
    },

    /** 统一重置接口（父组件调用） */
    reset() {
      this.resetBall()
    },

    /** 清理所有定时器，防止内存泄漏 */
    _cleanupTimers() {
      if (this._stepTimer) {
        clearTimeout(this._stepTimer)
        this._stepTimer = null
      }
      if (this._endTimer) {
        clearTimeout(this._endTimer)
        this._endTimer = null
      }
      if (this._resetTimer) {
        clearTimeout(this._resetTimer)
        this._resetTimer = null
      }
      if (this._rippleTimer) {
        clearTimeout(this._rippleTimer)
        this._rippleTimer = null
      }
    }
  }
})
