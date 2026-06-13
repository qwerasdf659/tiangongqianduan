/**
 * 收货地址管理页（实物兑换发货链路）
 *
 * 业务功能：用户收货地址列表 / 新增 / 编辑 / 删除 / 设默认；支持「选择模式」供下单流程选地址。
 *
 * 后端API（用户域，snake_case，前端零映射）:
 *   - GET    /api/v4/user/addresses              地址列表
 *   - POST   /api/v4/user/addresses              新增
 *   - PUT    /api/v4/user/addresses/:id          编辑
 *   - DELETE /api/v4/user/addresses/:id          删除
 *   - PUT    /api/v4/user/addresses/:id/default  设默认
 *
 * 选择模式：路由带 ?select=1 进入；点击某地址时通过上一页 eventChannel 回传 selectedAddress 并返回。
 *
 * @file packageUser/addresses/addresses.ts
 * @version 1.0.0
 * @since 2026-06-14
 */

const { API, Logger, Wechat, Utils } = require('../../utils/index')
const addrLog = Logger.createLogger('addresses')
const { showToast } = Wechat
const { checkAuth } = Utils

/** 手机号校验正则（中国大陆 11 位） */
const PHONE_REGEX = /^1[3-9]\d{9}$/

Page({
  data: {
    /** 地址列表（后端 UserAddress[]，snake_case 直接渲染） */
    addresses: [] as API.UserAddress[],
    /** 页面加载状态: loading | success | empty | error */
    loadStatus: 'loading' as 'loading' | 'success' | 'empty' | 'error',

    /** 是否选择模式（下单流程进入，点击地址回传上一页） */
    selectMode: false,

    /** 地址表单半屏面板 */
    showForm: false,
    /** 表单标题：新增收货地址 / 编辑收货地址 */
    formTitle: '新增收货地址',
    /** 编辑中的地址 ID（0=新增） */
    editingAddressId: 0,
    /** 表单字段（snake_case，与后端一致） */
    formReceiverName: '',
    formReceiverPhone: '',
    formProvince: '',
    formCity: '',
    formDistrict: '',
    formDetailAddress: '',
    formIsDefault: false,
    /** 提交中 */
    submitting: false
  },

  onLoad(options: Record<string, string | undefined>) {
    addrLog.info('收货地址页面加载', options)
    if (!checkAuth()) {
      return
    }
    if (options.select === '1') {
      this.setData({ selectMode: true })
      wx.setNavigationBarTitle({ title: '选择收货地址' })
    }
    this.loadAddresses()
  },

  async onPullDownRefresh() {
    await this.loadAddresses()
    wx.stopPullDownRefresh()
  },

  /** 加载地址列表（后端按 JWT 识别用户，仅返回本人地址） */
  async loadAddresses() {
    this.setData({ loadStatus: 'loading' })
    try {
      const result = await API.getUserAddresses()
      if (result.success && result.data) {
        const addresses = result.data.addresses || []
        this.setData({
          addresses,
          loadStatus: addresses.length > 0 ? 'success' : 'empty'
        })
        addrLog.info('地址列表加载成功:', addresses.length, '条')
      } else {
        this.setData({ addresses: [], loadStatus: 'empty' })
      }
    } catch (error: any) {
      addrLog.error('地址列表加载失败:', error)
      this.setData({ loadStatus: 'error' })
      showToast(error.message || '加载失败，请重试')
    }
  },

  /** 选择模式下点击地址 → 通过上一页 eventChannel 回传并返回 */
  onSelectAddress(e: any) {
    if (!this.data.selectMode) {
      return
    }
    const addressId = e.currentTarget.dataset.id
    const selected = this.data.addresses.find(
      (addr: API.UserAddress) => addr.address_id === addressId
    )
    if (!selected) {
      return
    }
    const eventChannel = (this as any).getOpenerEventChannel
      ? (this as any).getOpenerEventChannel()
      : null
    if (eventChannel && typeof eventChannel.emit === 'function') {
      eventChannel.emit('selectAddress', { address: selected })
    }
    wx.navigateBack()
  },

  /** 打开新增地址表单 */
  onAddAddress() {
    this.setData({
      showForm: true,
      formTitle: '新增收货地址',
      editingAddressId: 0,
      formReceiverName: '',
      formReceiverPhone: '',
      formProvince: '',
      formCity: '',
      formDistrict: '',
      formDetailAddress: '',
      formIsDefault: false,
      submitting: false
    })
  },

  /** 打开编辑地址表单 */
  onEditAddress(e: any) {
    const addressId = e.currentTarget.dataset.id
    const addr = this.data.addresses.find((a: API.UserAddress) => a.address_id === addressId)
    if (!addr) {
      return
    }
    this.setData({
      showForm: true,
      formTitle: '编辑收货地址',
      editingAddressId: addr.address_id,
      formReceiverName: addr.receiver_name || '',
      formReceiverPhone: addr.receiver_phone || '',
      formProvince: addr.province || '',
      formCity: addr.city || '',
      formDistrict: addr.district || '',
      formDetailAddress: addr.detail_address || '',
      formIsDefault: addr.is_default || false,
      submitting: false
    })
  },

  /** 关闭表单 */
  onCloseForm() {
    if (this.data.submitting) {
      return
    }
    this.setData({ showForm: false })
  },

  /** 表单输入绑定（通过 data-field 区分字段） */
  onFormInput(e: any) {
    const field = e.currentTarget.dataset.field
    if (!field) {
      return
    }
    this.setData({ [field]: e.detail.value })
  },

  /** 省市区选择器变更（picker 返回 [省, 市, 区]） */
  onRegionChange(e: any) {
    const region = e.detail.value || []
    this.setData({
      formProvince: region[0] || '',
      formCity: region[1] || '',
      formDistrict: region[2] || ''
    })
  },

  /** 切换默认地址开关 */
  onToggleDefault() {
    this.setData({ formIsDefault: !this.data.formIsDefault })
  },

  /** 表单校验 */
  _validateForm(): string {
    const { formReceiverName, formReceiverPhone, formProvince, formDetailAddress } = this.data
    if (!formReceiverName || !formReceiverName.trim()) {
      return '请填写收货人姓名'
    }
    if (!PHONE_REGEX.test(formReceiverPhone)) {
      return '请填写正确的手机号'
    }
    if (!formProvince) {
      return '请选择所在地区'
    }
    if (!formDetailAddress || !formDetailAddress.trim()) {
      return '请填写详细地址'
    }
    return ''
  },

  /** 提交表单（新增或编辑） */
  async onSubmitForm() {
    if (this.data.submitting) {
      return
    }
    const errMsg = this._validateForm()
    if (errMsg) {
      showToast(errMsg)
      return
    }

    this.setData({ submitting: true })

    const params = {
      receiver_name: this.data.formReceiverName.trim(),
      receiver_phone: this.data.formReceiverPhone.trim(),
      province: this.data.formProvince,
      city: this.data.formCity,
      district: this.data.formDistrict,
      detail_address: this.data.formDetailAddress.trim(),
      is_default: this.data.formIsDefault
    }

    try {
      const result =
        this.data.editingAddressId > 0
          ? await API.updateUserAddress(this.data.editingAddressId, params)
          : await API.createUserAddress(params)

      if (result.success) {
        showToast(this.data.editingAddressId > 0 ? '修改成功' : '保存成功', 'success')
        this.setData({ showForm: false, submitting: false })
        this.loadAddresses()
      } else {
        throw new Error(result.message || '保存失败')
      }
    } catch (error: any) {
      addrLog.error('保存地址失败:', error)
      this.setData({ submitting: false })
      showToast(error.message || '保存失败，请重试')
    }
  },

  /** 设为默认地址 */
  async onSetDefault(e: any) {
    const addressId = e.currentTarget.dataset.id
    if (!addressId) {
      return
    }
    try {
      const result = await API.setDefaultUserAddress(addressId)
      if (result.success) {
        showToast('已设为默认', 'success')
        this.loadAddresses()
      } else {
        throw new Error(result.message || '设置失败')
      }
    } catch (error: any) {
      addrLog.error('设置默认地址失败:', error)
      showToast(error.message || '设置失败，请重试')
    }
  },

  /** 删除地址 */
  onDeleteAddress(e: any) {
    const addressId = e.currentTarget.dataset.id
    if (!addressId) {
      return
    }
    wx.showModal({
      title: '删除地址',
      content: '确认删除该收货地址？',
      confirmText: '删除',
      confirmColor: '#F44336',
      success: async (res: WechatMiniprogram.ShowModalSuccessCallbackResult) => {
        if (!res.confirm) {
          return
        }
        try {
          const result = await API.deleteUserAddress(addressId)
          if (result.success) {
            showToast('已删除', 'success')
            this.loadAddresses()
          } else {
            throw new Error(result.message || '删除失败')
          }
        } catch (error: any) {
          addrLog.error('删除地址失败:', error)
          showToast(error.message || '删除失败，请重试')
        }
      }
    })
  },

  /** 重试加载 */
  retryLoad() {
    this.loadAddresses()
  }
})
