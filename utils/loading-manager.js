// utils/loading-manager.js - Loading状态管理器
// 解决showLoading与hideLoading必须配对使用的问题

class LoadingManager {
  constructor() {
    this.isShowing = false
    this.loadingStack = []
    this.currentTitle = ''
  }

  /**
   * 显示Loading
   * @param {String} title 加载提示文本
   * @param {Boolean} mask 是否显示遮罩
   */
  show(title = '加载中...', mask = true) {
    try {
      // 记录到栈中
      this.loadingStack.push({
        title,
        mask,
        timestamp: Date.now()
      })

      // 如果已经在显示，只更新标题
      if (this.isShowing) {
        console.log('🔄 更新Loading标题:', title)
        return
      }

      console.log('📱 显示Loading:', title)
      this.isShowing = true
      this.currentTitle = title

      wx.showLoading({
        title,
        mask
      })

    } catch (error) {
      console.error('❌ 显示Loading失败:', error)
      this.isShowing = false
    }
  }

  /**
   * 隐藏Loading
   * @param {Boolean} force 强制隐藏，忽略栈状态
   */
  hide(force = false) {
    try {
      if (this.loadingStack.length > 0) {
        this.loadingStack.pop()
      }

      // 如果还有其他Loading请求在栈中，不隐藏
      if (!force && this.loadingStack.length > 0) {
        console.log('📱 仍有Loading请求，保持显示:', this.loadingStack.length)
        return
      }

      // 只有在确实显示了Loading的情况下才隐藏
      if (this.isShowing) {
        console.log('📱 隐藏Loading')
        this.isShowing = false
        this.currentTitle = ''
        wx.hideLoading()
      } else {
        console.warn('⚠️ 试图隐藏未显示的Loading')
      }

    } catch (error) {
      console.error('❌ 隐藏Loading失败:', error)
      // 强制重置状态
      this.isShowing = false
      this.currentTitle = ''
      this.loadingStack = []
    }
  }

  /**
   * 强制重置Loading状态
   */
  reset() {
    console.log('🔄 重置Loading状态')
    this.isShowing = false
    this.currentTitle = ''
    this.loadingStack = []
    
    try {
      wx.hideLoading()
    } catch (error) {
      console.warn('重置时隐藏Loading失败:', error)
    }
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      isShowing: this.isShowing,
      currentTitle: this.currentTitle,
      stackLength: this.loadingStack.length
    }
  }

  /**
   * 安全的显示Toast（会先隐藏Loading）
   */
  showToast(options) {
    if (this.isShowing) {
      this.hide(true)
    }
    
    wx.showToast(options)
  }

  /**
   * 安全的显示Modal（会先隐藏Loading）
   */
  showModal(options) {
    if (this.isShowing) {
      this.hide(true)
    }
    
    return new Promise((resolve) => {
      wx.showModal({
        ...options,
        success: (res) => {
          resolve(res)
          if (options.success) {
            options.success(res)
          }
        },
        fail: (error) => {
          resolve({ confirm: false, cancel: true })
          if (options.fail) {
            options.fail(error)
          }
        }
      })
    })
  }
}

// 创建全局实例
const loadingManager = new LoadingManager()

// 导出实例和类
module.exports = {
  LoadingManager,
  loadingManager
} 