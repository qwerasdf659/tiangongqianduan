/**
 * 通用加载动画组件
 * 用于数据请求期间展示加载占位
 * 支持自定义加载文案
 */
Component({
  properties: {
    /** 加载提示文案 */
    text: {
      type: String,
      value: '加载中...'
    }
  }
})
