// pages/about/about.js - 关于我们页面
const app = getApp()

Page({
  
  /**
   * 页面的初始数据
   */
  data: {
    // 应用信息
    appInfo: {
      name: '餐厅积分系统',
      version: 'v1.0.0',
      buildTime: '2024-01-15',
      description: '一个专为餐厅打造的积分管理系统，让用户通过上传小票获得积分，体验抽奖和商品兑换的乐趣。'
    },
    
    // 公司信息
    companyInfo: {
      name: '天工前端科技有限公司',
      website: 'https://tiangong.com',
      email: 'contact@tiangong.com',
      phone: '400-8888-888',
      address: '北京市朝阳区科技园区创新大厦8层'
    },
    
    // 功能特色
    features: [
      {
        icon: '📸',
        title: '智能小票识别',
        description: '先进的OCR技术，快速识别小票信息获得积分'
      },
      {
        icon: '🎰',
        title: '趣味抽奖系统',
        description: '多样化的抽奖方式，让积分消费更有趣'
      },
      {
        icon: '🛍️',
        title: '丰富积分商城',
        description: '精选商品兑换，让积分更有价值'
      },
      {
        icon: '📊',
        title: '数据统计分析',
        description: '详细的消费和积分记录，清晰掌握账户动态'
      },
      {
        icon: '🏪',
        title: '商家管理后台',
        description: '为商家提供完善的审核和管理功能'
      },
      {
        icon: '🔒',
        title: '安全隐私保护',
        description: '严格的数据加密，保障用户隐私安全'
      }
    ],
    
    // 团队成员
    teamMembers: [
      {
        name: '张开发',
        role: '项目经理',
        avatar: 'https://via.placeholder.com/80x80/667eea/ffffff?text=张',
        description: '负责项目整体规划和进度管理'
      },
      {
        name: '李前端',
        role: '前端工程师',
        avatar: 'https://via.placeholder.com/80x80/4ECDC4/ffffff?text=李',
        description: '负责用户界面设计和前端开发'
      },
      {
        name: '王后端',
        role: '后端工程师',
        avatar: 'https://via.placeholder.com/80x80/FF6B35/ffffff?text=王',
        description: '负责服务器架构和接口开发'
      },
      {
        name: '陈设计',
        role: 'UI设计师',
        avatar: 'https://via.placeholder.com/80x80/9C27B0/ffffff?text=陈',
        description: '负责界面设计和用户体验优化'
      }
    ],
    
    // 更新日志
    updateLogs: [
      {
        version: 'v1.0.0',
        date: '2024-01-15',
        features: [
          '🎉 正式版本发布',
          '✨ 完整的积分系统功能',
          '🔧 优化用户体验',
          '🐛 修复已知问题'
        ]
      },
      {
        version: 'v0.9.0',
        date: '2024-01-10',
        features: [
          '🆕 新增商家管理功能',
          '🔄 优化抽奖算法',
          '📱 适配更多设备尺寸',
          '⚡ 提升应用性能'
        ]
      },
      {
        version: 'v0.8.0',
        date: '2024-01-05',
        features: [
          '🛍️ 积分商城上线',
          '📊 新增数据统计',
          '🎨 界面美化升级',
          '🔒 增强安全性'
        ]
      }
    ],
    
    // 联系方式展开状态
    showContact: false,
    
    // 当前展开的更新日志
    expandedLogIndex: -1
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('关于我们页面加载')
    this.initPage()
  },

  /**
   * 用户点击右上角分享
   */
  onShareAppMessage() {
    return {
      title: '餐厅积分系统 - 智能积分管理',
      path: '/pages/about/about'
    }
  },

  /**
   * 初始化页面
   */
  initPage() {
    // 可以在这里加载一些动态数据
    console.log('关于我们页面初始化完成')
  },

  /**
   * 切换联系信息显示
   */
  toggleContact() {
    this.setData({
      showContact: !this.data.showContact
    })
  },

  /**
   * 切换更新日志展开
   */
  toggleUpdateLog(e) {
    const index = e.currentTarget.dataset.index
    const currentIndex = this.data.expandedLogIndex
    
    this.setData({
      expandedLogIndex: currentIndex === index ? -1 : index
    })
  },

  /**
   * 复制联系方式
   */
  onCopyContact(e) {
    const { type, value } = e.currentTarget.dataset
    
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({
          title: `${type}已复制`,
          icon: 'success'
        })
      }
    })
  },

  /**
   * 拨打电话
   */
  onCallPhone() {
    wx.makePhoneCall({
      phoneNumber: this.data.companyInfo.phone
    })
  },

  /**
   * 访问官网
   */
  onVisitWebsite() {
    wx.showModal({
      title: '访问官网',
      content: `即将跳转到官网：${this.data.companyInfo.website}`,
      success: (res) => {
        if (res.confirm) {
          // 在小程序中无法直接打开外部链接，这里只是示例
          wx.setClipboardData({
            data: this.data.companyInfo.website,
            success: () => {
              wx.showToast({
                title: '网址已复制',
                icon: 'success'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 发送邮件
   */
  onSendEmail() {
    wx.setClipboardData({
      data: this.data.companyInfo.email,
      success: () => {
        wx.showToast({
          title: '邮箱地址已复制',
          icon: 'success'
        })
      }
    })
  },

  /**
   * 查看地图
   */
  onViewMap() {
    wx.showModal({
      title: '公司地址',
      content: this.data.companyInfo.address,
      confirmText: '复制地址',
      success: (res) => {
        if (res.confirm) {
          wx.setClipboardData({
            data: this.data.companyInfo.address,
            success: () => {
              wx.showToast({
                title: '地址已复制',
                icon: 'success'
              })
            }
          })
        }
      }
    })
  },

  /**
   * 查看团队成员详情
   */
  onViewMember(e) {
    const member = e.currentTarget.dataset.member
    
    wx.showModal({
      title: member.name,
      content: `职位：${member.role}\n\n${member.description}`,
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 检查更新
   */
  onCheckUpdate() {
    wx.showLoading({ title: '检查中...' })
    
    // 模拟检查更新
    setTimeout(() => {
      wx.hideLoading()
      wx.showModal({
        title: '检查更新',
        content: `当前版本：${this.data.appInfo.version}\n已是最新版本！`,
        showCancel: false,
        confirmText: '知道了'
      })
    }, 1000)
  },

  /**
   * 用户协议
   */
  onUserAgreement() {
    wx.showModal({
      title: '用户协议',
      content: '感谢您使用餐厅积分系统。使用本应用即表示您同意遵守相关服务条款。请合理使用积分功能，不要进行违规操作。我们保留对违规行为进行处理的权利。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 隐私政策
   */
  onPrivacyPolicy() {
    wx.showModal({
      title: '隐私政策',
      content: '我们重视您的隐私保护。收集的信息仅用于提供服务，包括：手机号用于身份验证、小票图片用于积分计算、使用数据用于功能优化。我们不会将您的个人信息用于其他用途或向第三方披露。',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  /**
   * 意见反馈
   */
  onFeedback() {
    wx.showModal({
      title: '意见反馈',
      editable: true,
      placeholderText: '请输入您的意见或建议...',
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.submitFeedback(res.content.trim())
        }
      }
    })
  },

  /**
   * 提交反馈
   */
  submitFeedback(content) {
    wx.showLoading({ title: '提交中...' })
    
    // 模拟提交反馈
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '感谢您的反馈！',
        icon: 'success'
      })
    }, 1000)
  },

  /**
   * 返回上一页
   */
  onBack() {
    wx.navigateBack()
  }
}) 