/**
 * 微信小程序工具类v3.0 - 餐厅积分抽奖系统
 * 封装微信API，提供统一的交互和导航能力
 *
 * @file 天工餐厅积分系统 - 微信API封装工具
 * @version 3.0.0
 * @since 2026-02-10
 */

const { getDevelopmentConfig } = require('../config/env')

// ===== 类型定义 =====

/** 微信环境初始化结果 */
interface WechatInitResult {
  success: boolean
  version: string
  developmentMode: boolean
}

/** 用户信息获取结果 */
interface UserProfileResult {
  success: boolean
  userInfo?: WechatMiniprogram.UserInfo
  source?: string
  error?: any
  message?: string
}

/** 授权结果 */
interface AuthorizationResult {
  success: boolean
  scope: string
  error?: any
}

/** 系统信息结果 */
interface SystemInfoResult {
  success: boolean
  systemInfo?: Record<string, any>
  error?: any
}

/** 导航参数对象 */
interface NavigateParams {
  [key: string]: string | number | boolean
}

// ===== 工具类 =====

/**
 * 微信小程序工具类 - 统一封装微信API
 * 包含环境初始化、用户信息获取、消息提示、导航跳转等功能
 */
class WechatUtils {
  /**
   * 初始化微信小程序环境（V3.0）
   * 业务场景: 应用启动时调用（app.ts onLaunch）
   */
  static initializeWechatEnvironment(): WechatInitResult {
    const devConfig = getDevelopmentConfig()

    console.log('🚀 微信环境初始化v3.0', {
      isDevelopment: devConfig.enableUnifiedAuth
      // 万能验证码123456完全由后端控制，前端不记录
    })

    return {
      success: true,
      version: '3.0.0',
      developmentMode: devConfig.enableUnifiedAuth
    }
  }

  /**
   * 获取微信用户信息
   * V4.0规范: 移除Mock数据，统一使用微信官方API
   * 用户信息完全由后端JWT Token提供，此处仅获取微信昵称头像
   * 业务场景: 用户首次登录时获取资料、完善用户档案
   */
  static getUserProfile(): Promise<UserProfileResult> {
    return new Promise((resolve, reject) => {
      wx.getUserProfile({
        desc: '用于完善会员资料',
        success(res: WechatMiniprogram.GetUserProfileSuccessCallbackResult) {
          console.log('✅ 获取用户信息成功', res.userInfo)
          resolve({
            success: true,
            userInfo: res.userInfo,
            source: 'wechat_official'
          })
        },
        fail(err: WechatMiniprogram.GeneralCallbackResult) {
          console.error('❌ 获取用户信息失败', err)
          reject({
            success: false,
            error: err,
            message: '获取用户信息失败，请重试'
          })
        }
      })
    })
  }

  /**
   * 请求微信用户授权
   * 常用授权类型: scope.camera（摄像头）、scope.album（相册）、scope.userLocation（定位）
   * 业务场景: 拍照上传前请求相机权限、选择图片前请求相册权限
   */
  static requestAuthorization(scope: string): Promise<AuthorizationResult> {
    return new Promise((resolve, reject) => {
      wx.authorize({
        scope,
        success() {
          console.log(`✅ 授权成功: ${scope}`)
          resolve({ success: true, scope })
        },
        fail(err: WechatMiniprogram.GeneralCallbackResult) {
          console.warn(`⚠️ 授权失败: ${scope}`, err)
          reject({ success: false, scope, error: err })
        }
      })
    })
  }

  /**
   * 显示消息提示框（Toast）
   * 业务场景: 操作成功/失败提示、验证错误提示、通用消息通知
   */
  static showToast(
    title: string,
    icon: 'success' | 'error' | 'loading' | 'none' = 'none',
    duration: number = 2000
  ): void {
    wx.showToast({ title, icon, duration, mask: true })
  }

  /**
   * 显示加载中提示框（Loading）
   * ⚠️ 必须与 hideLoading() 配对使用
   * 业务场景: API请求期间、数据处理中、异步操作等待
   */
  static showLoading(title: string = '加载中...'): void {
    wx.showLoading({ title, mask: true })
  }

  /** 隐藏加载中提示框 - 必须与 showLoading() 配对使用 */
  static hideLoading(): void {
    wx.hideLoading()
  }

  /**
   * 页面跳转（保留当前页面）
   * 自动构建URL查询参数，支持传递多个参数
   * 业务场景: 列表跳详情、首页跳抽奖、用户中心跳积分明细
   *
   * @example
   * navigateTo('/pages/detail/detail', { product_id: '123', source: 'exchange' })
   */
  static navigateTo(url: string, params: NavigateParams = {}): void {
    // 构建查询参数
    const queryString: string = Object.keys(params)
      .map((key: string) => `${key}=${encodeURIComponent(String(params[key]))}`)
      .join('&')

    const fullUrl: string = queryString ? `${url}?${queryString}` : url

    wx.navigateTo({
      url: fullUrl,
      success() {
        console.log(`✅ 页面跳转成功: ${fullUrl}`)
      },
      fail(err: WechatMiniprogram.GeneralCallbackResult) {
        console.error(`❌ 页面跳转失败: ${fullUrl}`, err)
        WechatUtils.showToast('页面跳转失败')
      }
    })
  }

  /**
   * 返回上一页或多层页面
   * 业务场景: 详情页返回列表页、表单提交成功后返回、取消操作返回上一页
   */
  static navigateBack(delta: number = 1): void {
    wx.navigateBack({
      delta,
      success() {
        console.log(`✅ 返回上一页成功, delta: ${delta}`)
      },
      fail(err: WechatMiniprogram.GeneralCallbackResult) {
        console.error('❌ 返回上一页失败', err)
        WechatUtils.showToast('返回失败')
      }
    })
  }

  /**
   * 获取系统信息（使用微信新API）
   * 微信已弃用 wx.getSystemInfo，使用 Promise.all 并行调用新API:
   * - wx.getWindowInfo() - 窗口信息
   * - wx.getSystemSetting() - 系统设置
   * - wx.getDeviceInfo() - 设备信息
   * - wx.getAppBaseInfo() - 应用基础信息
   * 业务场景: 页面布局适配、设备识别、功能兼容性检查
   */
  static getSystemInfo(): Promise<SystemInfoResult> {
    return new Promise((resolve, reject) => {
      try {
        // 同步获取各项系统信息
        const windowInfo = wx.getWindowInfo()
        const deviceInfo = wx.getDeviceInfo()
        const appBaseInfo = wx.getAppBaseInfo()

        // 合并所有信息
        const combinedSystemInfo: Record<string, any> = {
          ...windowInfo,
          ...deviceInfo,
          ...appBaseInfo,
          windowWidth: windowInfo.windowWidth,
          windowHeight: windowInfo.windowHeight,
          pixelRatio: windowInfo.pixelRatio,
          platform: deviceInfo.platform,
          system: deviceInfo.system,
          version: appBaseInfo.version
        }

        console.log('✅ 系统信息获取成功', combinedSystemInfo)
        resolve({ success: true, systemInfo: combinedSystemInfo })
      } catch (err) {
        console.error('❌ 系统信息获取失败', err)
        reject({ success: false, error: err })
      }
    })
  }
}

// ===== 导出工具类和快捷方法 =====
module.exports = {
  WechatUtils,
  initializeWechatEnvironment: WechatUtils.initializeWechatEnvironment,
  getUserProfile: WechatUtils.getUserProfile,
  showToast: WechatUtils.showToast,
  showLoading: WechatUtils.showLoading,
  hideLoading: WechatUtils.hideLoading,
  navigateTo: WechatUtils.navigateTo,
  navigateBack: WechatUtils.navigateBack
}

export {}
