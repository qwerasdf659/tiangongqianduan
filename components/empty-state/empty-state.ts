/**
 * 通用空状态组件
 * 用于列表数据为空时展示占位提示
 * 支持自定义图标、标题、描述文案和重试按钮
 */
Component({
  properties: {
    /** 空状态图标（emoji 或 icon 类名） */
    icon: {
      type: String,
      value: '📭'
    },
    /** 主标题 */
    title: {
      type: String,
      value: '暂无数据'
    },
    /** 副标题描述 */
    subtitle: {
      type: String,
      value: ''
    },
    /** 重试按钮文案，为空则不显示按钮 */
    buttonText: {
      type: String,
      value: ''
    }
  },

  methods: {
    /** 重试按钮点击 */
    onRetry() {
      this.triggerEvent('retry')
    }
  }
})
