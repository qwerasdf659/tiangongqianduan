/**
 * 权限管理工具类
 * v2.0 二元权限模型：只有超级管理员才有权限
 * 超级管理员 = is_admin === true && is_merchant === true
 */

class PermissionManager {
  constructor(userInfo) {
    this.userInfo = userInfo || {}
  }

  /**
   * 检查是否为超级管理员（唯一有权限的用户类型）
   * @returns {boolean} 是否为超级管理员
   */
  isSuperAdmin() {
    return this.userInfo?.is_admin === true && this.userInfo?.is_merchant === true
  }

  /**
   * 检查管理员权限（仅超级管理员）
   * @returns {boolean} 是否有管理员权限
   */
  isAdmin() {
    return this.isSuperAdmin()
  }

  /**
   * 检查商家权限（仅超级管理员）
   * @returns {boolean} 是否有商家权限
   */
  isMerchant() {
    return this.isSuperAdmin()
  }

  /**
   * 检查是否为普通用户
   * @returns {boolean} 是否为普通用户
   */
  isNormalUser() {
    return !this.isSuperAdmin()
  }

  /**
   * 检查是否有指定功能权限
   * @param {string} feature 功能名称
   * @returns {boolean} 是否有权限
   */
  hasPermission(feature) {
    // v2.0 简化权限检查：只有超级管理员才有任何特殊权限
    return this.isSuperAdmin()
  }

  /**
   * 获取权限状态详情
   * @returns {object} 权限状态对象
   */
  getPermissionStatus() {
    const isSuperAdmin = this.isSuperAdmin()
    return {
      isSuperAdmin,
      isAdmin: isSuperAdmin,
      isMerchant: isSuperAdmin,
      isNormalUser: !isSuperAdmin,
      showMerchantEntrance: isSuperAdmin,
      showAdminPanel: isSuperAdmin,
      permissionModel: 'v2.0_binary_permission',
      userInfo: {
        user_id: this.userInfo.user_id,
        is_admin: this.userInfo.is_admin,
        is_merchant: this.userInfo.is_merchant,
        qualifiesAsSuperAdmin: isSuperAdmin
      }
    }
  }

  /**
   * 检查特定功能权限并显示提示
   * @param {string} featureName 功能名称
   * @returns {boolean} 是否有权限
   */
  checkFeatureAccess(featureName) {
    if (this.isSuperAdmin()) {
      console.log(`✅ 超级管理员权限确认 - 可以访问${featureName}`)
      return true
    }

    console.log(`❌ 权限不足 - 无法访问${featureName}`, this.getPermissionStatus())
    
    // 显示权限不足提示
    wx.showModal({
      title: '🔐 权限不足',
      content: `您没有超级管理员权限，无法访问${featureName}功能。\n\n⚠️ 需要同时拥有管理员和商家权限\n\n如需申请权限，请联系系统管理员。`,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#ff4444'
    })
    
    return false
  }

  /**
   * 更新用户信息
   * @param {object} userInfo 新的用户信息
   */
  updateUserInfo(userInfo) {
    this.userInfo = userInfo || {}
  }

  /**
   * 获取脱敏后的手机号
   * @returns {string} 脱敏手机号
   */
  getMaskedMobile() {
    if (!this.userInfo.mobile) return '无'
    return this.userInfo.mobile.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }

  /**
   * 记录权限验证日志
   * @param {string} action 操作名称
   * @param {boolean} success 是否成功
   */
  logPermissionCheck(action, success) {
    const status = this.getPermissionStatus()
    console.log(`🔐 权限验证日志 - ${action}:`, {
      success,
      action,
      mobile: this.getMaskedMobile(),
      ...status
    })
  }
}

/**
 * 创建权限管理器实例
 * @param {object} userInfo 用户信息
 * @returns {PermissionManager} 权限管理器实例
 */
const createPermissionManager = (userInfo) => {
  return new PermissionManager(userInfo)
}

module.exports = {
  PermissionManager,
  createPermissionManager
} 