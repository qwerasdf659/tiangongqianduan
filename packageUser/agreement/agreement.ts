/**
 * 协议页（用户协议 / 隐私政策）
 *
 * 入口: components/login-popup → onViewAgreement(type)
 * 参数: type — user_agreement（用户协议，默认）/ privacy_policy（隐私政策）
 * 数据来源: GET /api/v4/system/agreement/:doc_type（后端 BE-6 接口已上线，正文待运营录入）
 *
 * 设计原则: 协议正文为法务文本，前端不硬编码，统一由后端接口下发；
 *   正文未录入时后端返 404（AGREEMENT_NOT_CONFIGURED），前端明确报错提示，
 *   不静默降级、不展示假内容。
 *   品牌名"天工平台"、运营主体"东莞市墨珩数字科技有限公司"为前端已知展示元素，写在模板中。
 *
 * @file 天工平台 - 协议页
 * @version 5.2.0
 * @since 2026-06-09
 */

const { API, Logger } = require('../../utils/index')
const agreementLog = Logger.createLogger('agreement')

/** 文档类型 → 页面标题映射 */
const DOC_TYPE_TITLE: Record<string, string> = {
  user_agreement: '用户协议',
  privacy_policy: '隐私政策'
}

Page({
  data: {
    /** 文档类型（后端 doc_type 枚举） */
    docType: 'user_agreement' as string,
    /** 页面标题 */
    pageTitle: '用户协议' as string,
    /** 协议更新日期（后端 updated_at） */
    updatedAt: '' as string,
    /** 协议正文段落数组（后端 sections） */
    sections: [] as Array<{ heading?: string; text: string }>,
    /** 加载状态 */
    loading: true as boolean,
    /** 加载失败标志 */
    loadError: false as boolean,
    /** 错误标题 */
    errorTitle: '' as string,
    /** 错误说明 */
    errorDesc: '' as string,
    /** 自定义导航栏占位高度（px） */
    navbarHeight: 64 as number
  },

  onLoad(options: Record<string, string | undefined>) {
    const docType = options.type === 'privacy_policy' ? 'privacy_policy' : 'user_agreement'
    this.setData({
      docType,
      pageTitle: DOC_TYPE_TITLE[docType] || '用户协议'
    })
    this.loadAgreement()
  },

  /** 加载协议内容（后端接口缺失时明确报错，不静默降级） */
  async loadAgreement() {
    this.setData({ loading: true, loadError: false })
    try {
      const result = await API.getAgreementDocument(this.data.docType)
      if (result && result.success === true && result.data) {
        const sections = Array.isArray(result.data.sections) ? result.data.sections : []
        if (sections.length === 0) {
          this.showError('协议内容暂未配置', '后端尚未配置该协议正文，请稍后再试或联系客服')
          return
        }
        this.setData({
          sections,
          updatedAt: result.data.updated_at || '',
          pageTitle: result.data.title || this.data.pageTitle,
          loading: false,
          loadError: false
        })
      } else {
        this.showError(
          '协议内容获取失败',
          (result && result.message) || '后端协议接口暂不可用，请稍后重试'
        )
      }
    } catch (error: any) {
      agreementLog.error('加载协议失败:', error)
      this.showError('协议内容获取失败', '网络异常或后端协议接口未就绪，请稍后重试')
    }
  },

  /** 展示错误态 */
  showError(title: string, desc: string) {
    this.setData({
      loading: false,
      loadError: true,
      errorTitle: title,
      errorDesc: desc
    })
  }
})
