/**
 * 全屏维护遮罩组件
 * 后端返回 503 + SYSTEM_MAINTENANCE 时，通过 App.enterMaintenanceMode() 触发显示
 * 阻止所有用户交互，提供"重试"按钮检测维护是否结束
 *
 * 生命周期:
 *   attached → 注册到 App._maintenanceOverlays（如果 App 已处于维护模式则立即显示）
 *   detached → 从 App._maintenanceOverlays 注销
 *
 * @file 天工平台 - 系统维护全屏遮罩
 * @version 5.2.0
 */

const { Logger } = require('../../utils/index')
const maintenanceLog = Logger.createLogger('maintenance')

Component({
  data: {
    visible: false as boolean,
    message: '系统正在进行数据维护，请稍后再试' as string,
    retrying: false as boolean,
    retryCount: 0 as number,
    /** 强制更新模式：true=显示"立即更新"按钮，false=显示"重试"按钮 */
    forceUpdate: false as boolean,
    /** 强制更新提示文案 */
    updateMessage: '检测到新版本，请更新后继续使用' as string
  },

  lifetimes: {
    attached(): void {
      const appInstance = getApp()
      if (appInstance) {
        appInstance.registerMaintenanceOverlay(this)
        if (appInstance.globalData.isForceUpdateMode) {
          this.showForceUpdate(appInstance.globalData.forceUpdateMessage)
        } else if (appInstance.globalData.isMaintenanceMode) {
          this.show(appInstance.globalData.maintenanceMessage)
        }
      }
    },

    detached(): void {
      const appInstance = getApp()
      if (appInstance) {
        appInstance.unregisterMaintenanceOverlay(this)
      }
    }
  },

  methods: {
    /** App.enterMaintenanceMode() 调用，显示全屏维护遮罩 */
    show(serverMessage?: string): void {
      this.setData({
        visible: true,
        message: serverMessage || '系统正在进行数据维护，请稍后再试'
      })
    },

    /** App.exitMaintenanceMode() 调用，隐藏遮罩恢复正常 */
    hide(): void {
      this.setData({
        visible: false,
        retrying: false,
        retryCount: 0
      })
    },

    /**
     * App.enterForceUpdateMode() 调用，显示全屏强制更新遮罩
     * 与维护遮罩复用同一全屏层，但按钮变为"立即更新"，不可重试绕过
     */
    showForceUpdate(updateMessage?: string): void {
      this.setData({
        visible: true,
        forceUpdate: true,
        updateMessage: updateMessage || '检测到新版本，请更新后继续使用'
      })
    },

    /**
     * 用户点击"立即更新"
     * 已下载好新版本时由微信 applyUpdate 重启；否则提示用户彻底关闭后重进
     */
    onUpdateConfirm(): void {
      const appInstance = getApp()
      if (appInstance && typeof appInstance.applyPendingUpdate === 'function') {
        appInstance.applyPendingUpdate()
      }
    },

    /**
     * 用户点击"重试"检测维护是否结束
     * 直接使用 wx.request 绕过 APIClient，避免维护期间触发 Token 刷新/重定向循环
     */
    async onRetry(): Promise<void> {
      if (this.data.retrying) {
        return
      }
      this.setData({ retrying: true })
      maintenanceLog.info('用户点击重试，检测系统维护状态...')

      try {
        const { getApiConfig } = require('../../config/env')
        const apiConfig = getApiConfig()
        const { getDeviceId } = require('../../utils/device')

        await new Promise<void>((resolve, reject) => {
          wx.request({
            url: `${apiConfig.fullUrl}/system/status`,
            method: 'GET',
            timeout: 10000,
            header: {
              'x-platform': 'wechat_mp',
              'X-Device-Id': getDeviceId()
            },
            success: (res: WechatMiniprogram.RequestSuccessCallbackResult) => {
              const responseData = res.data as Record<string, any>
              if (res.statusCode === 200 && responseData && responseData.success) {
                resolve()
              } else {
                reject(new Error('系统仍在维护中'))
              }
            },
            fail: (err: WechatMiniprogram.GeneralCallbackResult) => {
              reject(new Error(err.errMsg || '网络错误'))
            }
          })
        })

        maintenanceLog.info('系统维护已结束，恢复正常')
        const appInstance = getApp()
        if (appInstance && typeof appInstance.exitMaintenanceMode === 'function') {
          appInstance.exitMaintenanceMode()
        }
        wx.showToast({ title: '系统已恢复', icon: 'success', duration: 2000 })
      } catch (_retryError: any) {
        const updatedRetryCount = this.data.retryCount + 1
        maintenanceLog.info('系统仍在维护中，重试次数:', updatedRetryCount)
        this.setData({
          retryCount: updatedRetryCount,
          message: '系统仍在维护中，请稍后再试'
        })
      } finally {
        this.setData({ retrying: false })
      }
    },

    /** 阻止触摸事件穿透到遮罩下方 */
    preventTouchMove(): void {
      // no-op
    }
  }
})
