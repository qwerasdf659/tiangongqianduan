/**
 * 瀑布流布局工具 - 通用两列瀑布流计算
 *
 * 从 exchange.ts 中提取的公共布局逻辑，消除 calculateWaterfallLayout()
 * 和 calculateWaterfallLayoutSafe() 两份重复实现。
 *
 * 使用方式：
 *   const { calculateWaterfallLayout, calculateContentHeight } = require('../../utils/waterfall')
 *   const result = calculateWaterfallLayout(products, { containerWidth: 327, cardGap: 15 })
 *   this.setData({
 *     layoutProducts: result.layoutProducts,
 *     columnHeights: result.columnHeights,
 *     containerHeight: result.containerHeight
 *   })
 *
 * @file 天工餐厅积分系统 - 瀑布流布局工具
 * @version 5.2.0
 * @since 2026-02-15
 */

const { createLogger } = require('./logger')
const log = createLogger('waterfall')

// ===== 类型定义 =====

/** 瀑布流布局配置 */
interface WaterfallOptions {
  /** 容器总宽度（px），默认327 */
  containerWidth?: number
  /** 列间距（px），默认15 */
  cardGap?: number
  /** 图片区域高度（px），默认100 */
  imageHeight?: number
  /** 卡片内边距（px），默认20 */
  cardPadding?: number
  /** 最小容器高度（px），默认300 */
  minContainerHeight?: number
}

/** 单个商品的布局信息 */
interface LayoutInfo {
  /** 所在列索引（0=左列，1=右列） */
  columnIndex: number
  /** 距左侧的偏移（px） */
  left: number
  /** 距顶部的偏移（px） */
  top: number
  /** 卡片宽度（px） */
  width: number
  /** 卡片高度（px） */
  height: number
  /** 层叠顺序 */
  zIndex: number
}

/** 带布局信息的商品 */
interface LayoutProduct {
  /** 布局定位信息 */
  layoutInfo: LayoutInfo
  [key: string]: any
}

/** 布局计算结果 */
interface WaterfallResult {
  /** 带布局信息的商品数组 */
  layoutProducts: LayoutProduct[]
  /** 左右两列的当前高度 [leftHeight, rightHeight] */
  columnHeights: number[]
  /** 容器总高度（取两列最大值） */
  containerHeight: number
}

// ===== 核心布局函数 =====

/**
 * 计算两列瀑布流布局
 *
 * 将商品数据分配到左右两列，每次将新商品添加到高度较低的列，
 * 实现两列高度平衡的瀑布流效果。
 *
 * @param products - 商品数组（任意带name/price等字段的对象）
 * @param options - 布局配置（容器宽度、间距等）
 * @returns 布局结果（含布局信息的商品数组、列高度、容器高度）
 *
 * @example
 * const result = calculateWaterfallLayout(products, { containerWidth: 327, cardGap: 15 })
 */
function calculateWaterfallLayout(
  products: any[],
  options: WaterfallOptions = {}
): WaterfallResult {
  const {
    containerWidth = 327,
    cardGap = 15,
    imageHeight = 100,
    cardPadding = 20,
    minContainerHeight = 300
  } = options

  log.info(`📐 计算瀑布流布局: ${products ? products.length : 0} 个商品`)

  // 空数据安全处理
  if (!products || !Array.isArray(products) || products.length === 0) {
    log.info('⚠️ 商品数据为空或无效')
    return {
      layoutProducts: [],
      columnHeights: [0, 0],
      containerHeight: minContainerHeight
    }
  }

  try {
    const columnHeights: number[] = [0, 0]
    const columnWidth: number = (containerWidth - cardGap) / 2

    const layoutProducts: LayoutProduct[] = products
      .map((product: any, index: number) => {
        try {
          // 商品有效性检查
          if (!product || typeof product !== 'object') {
            log.warn(`⚠️ 商品数据无效 [${index}]:`, product)
            return null
          }

          // 选择较短的列
          const shortestCol: number = columnHeights[0] <= columnHeights[1] ? 0 : 1

          // 计算卡片高度 = 图片高度 + 内容高度 + 内边距
          const contentHeight: number = calculateContentHeight(product)
          const cardHeight: number = imageHeight + contentHeight + cardPadding

          const layoutProduct: LayoutProduct = {
            ...product,
            layoutInfo: {
              columnIndex: shortestCol,
              left: shortestCol * (columnWidth + cardGap),
              top: columnHeights[shortestCol],
              width: columnWidth,
              height: cardHeight,
              zIndex: 1
            }
          }

          // 更新列高度（+2px最小间距，紧凑布局）
          columnHeights[shortestCol] += cardHeight + 2

          return layoutProduct
        } catch (productError) {
          log.error(`❌ 处理商品布局失败 [${index}]:`, productError)
          return null
        }
      })
      .filter(Boolean) as LayoutProduct[]

    const containerHeight: number = Math.max(Math.max(...columnHeights), minContainerHeight)

    log.info('✅ 瀑布流布局计算完成:', {
      totalProducts: layoutProducts.length,
      leftColumnHeight: columnHeights[0],
      rightColumnHeight: columnHeights[1],
      containerHeight
    })

    return { layoutProducts, columnHeights, containerHeight }
  } catch (error) {
    log.error('❌ 瀑布流布局计算失败:', error)
    return {
      layoutProducts: [],
      columnHeights: [0, 0],
      containerHeight: minContainerHeight
    }
  }
}

/**
 * 计算商品卡片内容区域高度（不含图片）
 *
 * 高度构成：
 * - 基础高度：70px
 * - 长标题（>20字）：+10px
 * - 原价显示：+8px
 * - 评分信息：+15px
 * - 标签区域：+12px
 * - 商家信息：+10px
 *
 * @param product - 商品对象
 * @returns 内容区域高度（px）
 */
function calculateContentHeight(product: any): number {
  if (!product || typeof product !== 'object') {
    return 70
  }

  try {
    let baseHeight = 70

    // 长标题额外高度（DataSanitizer 输出字段: name）
    const titleLength: number = product.name ? String(product.name).length : 0
    if (titleLength > 20) {
      baseHeight += 10
    }

    // 原价显示额外高度（后端字段: exchange_items.original_price / cost_amount）
    if (product.original_price && product.original_price !== product.cost_amount) {
      baseHeight += 8
    }

    // 评分信息额外高度
    if (product.rating) {
      baseHeight += 15
    }

    // 标签区域额外高度
    if (product.tags && product.tags.length > 0) {
      baseHeight += 12
    }

    // 商家信息额外高度
    if (product.seller) {
      baseHeight += 10
    }

    return baseHeight
  } catch (error) {
    log.error('❌ 计算内容高度失败:', error)
    return 70
  }
}

// ===== 导出 =====
module.exports = {
  calculateWaterfallLayout,
  calculateContentHeight
}

export {}
