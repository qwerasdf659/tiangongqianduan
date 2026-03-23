/**
 * 两级分类联动选择器组件
 *
 * 业务场景: 兑换商品和交易市场的分类筛选（文档 8.5 / 10.15.4）
 * 数据来源: 后端 Category.getTree() 返回的树形分类结构
 *
 * 交互模式:
 *   - 横向滚动展示一级分类
 *   - 点击一级分类展开二级子分类列表
 *   - 选择一级分类时自动包含所有子分类（传 category_id 给后端）
 *   - 选择二级分类时精确筛选（传子分类 category_code 给后端）
 *
 * 对外事件:
 *   bind:change - 分类选择变更，detail: { categoryCode, categoryId, level, parentCode }
 *
 * @file components/category-cascade/category-cascade.ts
 * @version 1.0.0
 */

const { API: cascadeAPI, Logger: cascadeLogger } = require('../../utils/index')
const cascadeLog = cascadeLogger.createLogger('category-cascade')

Component({
  properties: {
    /** 当前选中的分类编码（外部绑定） */
    value: { type: String, value: 'all' },
    /** 扁平分类选项（降级用，后端 product-filter 下发的扁平列表） */
    flatOptions: { type: Array, value: [] }
  },

  data: {
    /** 树形分类数据（后端 Category.getTree() 返回） */
    categoryTree: [] as any[],
    /** 是否成功加载树形数据（false 时降级到扁平模式） */
    treeLoaded: false,
    /** 当前展开的一级分类编码 */
    expandedParent: '',
    /** 当前选中的分类编码 */
    selectedCode: 'all',
    /** 加载状态 */
    loading: false
  },

  lifetimes: {
    attached() {
      this.setData({ selectedCode: this.properties.value || 'all' })
      this._loadCategoryTree()
    }
  },

  observers: {
    value(newVal: string) {
      if (newVal !== this.data.selectedCode) {
        this.setData({ selectedCode: newVal })
      }
    }
  },

  methods: {
    /**
     * 加载分类树形结构
     * 优先使用后端 Category.getTree() API
     * 失败时降级到 flatOptions（单级扁平模式）
     */
    async _loadCategoryTree() {
      this.setData({ loading: true })
      try {
        const response = await cascadeAPI.getCategoryTree()
        if (response && response.success && response.data) {
          const categories = response.data.categories || response.data || []
          if (Array.isArray(categories) && categories.length > 0) {
            const hasChildren = categories.some(
              (cat: any) => Array.isArray(cat.children) && cat.children.length > 0
            )
            this.setData({
              categoryTree: categories,
              treeLoaded: hasChildren,
              loading: false
            })
            cascadeLog.info('分类树加载成功:', categories.length, '个一级分类')
            return
          }
        }
        this.setData({ treeLoaded: false, loading: false })
        cascadeLog.info('分类树为空或不支持，降级到扁平模式')
      } catch (treeError) {
        cascadeLog.warn('分类树加载失败，降级到扁平模式:', treeError)
        this.setData({ treeLoaded: false, loading: false })
      }
    },

    /** 点击一级分类: 展开/收起子分类 或 直接选中（无子分类时） */
    onTapParent(e: any) {
      const parentCode = e.currentTarget.dataset.code
      const parentCategoryId = e.currentTarget.dataset.categoryId

      if (!parentCode) {
        return
      }

      if (parentCode === 'all') {
        this.setData({ selectedCode: 'all', expandedParent: '' })
        this.triggerEvent('change', {
          categoryCode: 'all',
          categoryId: null,
          level: 0,
          parentCode: ''
        })
        return
      }

      const parentNode = this.data.categoryTree.find((cat: any) => cat.category_code === parentCode)

      if (parentNode && Array.isArray(parentNode.children) && parentNode.children.length > 0) {
        const willExpand = this.data.expandedParent !== parentCode
        this.setData({ expandedParent: willExpand ? parentCode : '' })

        if (willExpand) {
          this.setData({ selectedCode: parentCode })
          this.triggerEvent('change', {
            categoryCode: parentCode,
            categoryId: parentCategoryId,
            level: 1,
            parentCode: ''
          })
        }
      } else {
        this.setData({ selectedCode: parentCode, expandedParent: '' })
        this.triggerEvent('change', {
          categoryCode: parentCode,
          categoryId: parentCategoryId,
          level: 1,
          parentCode: ''
        })
      }
    },

    /** 点击二级子分类: 精确选中 */
    onTapChild(e: any) {
      const childCode = e.currentTarget.dataset.code
      const childCategoryId = e.currentTarget.dataset.categoryId
      const parentCode = e.currentTarget.dataset.parentCode

      if (!childCode) {
        return
      }

      this.setData({ selectedCode: childCode })
      this.triggerEvent('change', {
        categoryCode: childCode,
        categoryId: childCategoryId,
        level: 2,
        parentCode
      })
    },

    /** 扁平模式下的分类点击（降级方案） */
    onTapFlatCategory(e: any) {
      const categoryCode = e.currentTarget.dataset.category
      this.setData({ selectedCode: categoryCode || 'all' })
      this.triggerEvent('change', {
        categoryCode: categoryCode || 'all',
        categoryId: null,
        level: 1,
        parentCode: ''
      })
    }
  }
})
