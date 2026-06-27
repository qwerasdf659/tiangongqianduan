/**
 * 顶部 Banner 运营可配 - 共享逻辑助手
 *
 * 业务背景: 5 个主 Tab 页（lottery/profile/diy/camera/exchange）顶部沉浸式横幅
 * 统一接入运营投放系统（ad-delivery 的 slot_type=top_banner），运营在 Web 管理端
 * 随时换图，前端零发版。各页面 banner 尺寸/样式不同（各页 .scss 自管），但
 * "拉取投放内容 + 兜底 + 单图/轮播判定 + 点击跳转 + 曝光/点击上报"逻辑完全一致，
 * 故抽取到本助手单一维护，避免 5 个页面各写一份造成重复与漂移。
 *
 * 数据契约（后端为权威，前端零映射直读 snake_case，见对接文档 §15.3）:
 *   GET /api/v4/system/ad-delivery?slot_type=top_banner&position={page}
 *   响应 data: {
 *     items: [{ ad_slot_id, ad_campaign_id, campaign_category, image_url, link_url, link_type, priority }],
 *     is_carousel: boolean,        // 该图片位是否轮播（槽位级展示形态）
 *     slide_interval_ms: number,   // 轮播间隔毫秒（顶层，槽位级）
 *     total: number
 *   }
 *   ⚠️ 图片字段是扁平 image_url（后端 JOIN media_files 拼好的完整代理 URL），
 *      不是 primary_media.public_url，前端直接用、不自行拼接。
 *
 * @file 天工平台 - 顶部 Banner 共享逻辑
 * @version 1.0.0
 * @since 2026-06-21
 */

const {
  getAdDelivery,
  reportInteractionLog,
  reportAdImpression,
  reportAdClick
} = require('./api/index')
const { createLogger } = require('./logger')

const log = createLogger('top-banner')

/** 轮播间隔下限（与后端 min=500 校验一致），低于此值用默认值兜底 */
const MIN_SLIDE_INTERVAL_MS = 500
/** 轮播间隔默认值（后端 DEFAULT 3000，与 ad_slots.slide_interval_ms 默认一致） */
const DEFAULT_SLIDE_INTERVAL_MS = 3000

/** 顶部 Banner 加载结果（供页面 setData，字段命名与页面 data 对齐） */
interface TopBannerResult {
  /** 投放项列表（空数组表示无运营配置，页面回退本地兜底图） */
  topBannerItems: API.AdDeliveryItem[]
  /** 是否轮播（来自后端槽位级 is_carousel） */
  topBannerCarousel: boolean
  /** 轮播间隔毫秒（来自后端槽位级 slide_interval_ms，已做下限兜底） */
  topBannerInterval: number
  /** 是否有运营配置的图（items 非空且首条有 image_url），页面据此决定用投放图还是本地兜底图 */
  topBannerReady: boolean
}

/**
 * 加载某页面的顶部 Banner 投放内容
 *
 * 失败/空数据时返回 topBannerReady=false，由页面回退本地兜底图，永不留白、不报错。
 * 加载成功且有图时，对首条（或轮播首张）上报一次曝光。
 *
 * @param position 页面位置标识: lottery / profile / diy / camera / exchange
 * @returns 供页面 setData 的结果对象
 */
async function loadTopBanner(position: string): Promise<TopBannerResult> {
  const empty: TopBannerResult = {
    topBannerItems: [],
    topBannerCarousel: false,
    topBannerInterval: DEFAULT_SLIDE_INTERVAL_MS,
    topBannerReady: false
  }

  try {
    const result: API.ApiResponse<API.AdDeliveryData> = await getAdDelivery({
      slot_type: 'top_banner',
      position
    })
    if (!result?.success || !result.data) {
      return empty
    }

    const data: API.AdDeliveryData = result.data
    const items: API.AdDeliveryItem[] = Array.isArray(data.items) ? data.items : []
    /* 过滤掉无图项（image_url 缺失则无法展示，按无配置处理，回退兜底图） */
    const validItems = items.filter(
      (bannerItem: API.AdDeliveryItem) => bannerItem && bannerItem.image_url
    )
    if (validItems.length === 0) {
      return empty
    }

    const isCarousel = data.is_carousel === true
    const rawInterval = Number(data.slide_interval_ms)
    const interval = rawInterval >= MIN_SLIDE_INTERVAL_MS ? rawInterval : DEFAULT_SLIDE_INTERVAL_MS

    /* 单图：只取优先级最高的第 1 条（后端已 priority 降序）；轮播：全部 */
    const finalItems = isCarousel ? validItems : [validItems[0]]

    /* 首屏曝光上报（首条/轮播首张），失败不影响展示 */
    reportTopBannerEvent(finalItems[0], 'impression', position)

    return {
      topBannerItems: finalItems,
      topBannerCarousel: isCarousel,
      topBannerInterval: interval,
      topBannerReady: true
    }
  } catch (bannerError: any) {
    log.warn(`顶部Banner加载失败（回退本地兜底图）position=${position}:`, bannerError?.message)
    return empty
  }
}

/**
 * 顶部 Banner 曝光/点击上报 — 按 campaign_category 分流（与轮播图同款逻辑）
 *   commercial  → 商业广告计费链路 reportAdImpression / reportAdClick（依赖 ad_slot_id）
 *   operational / system → 统一交互日志 reportInteractionLog
 *
 * @param item 投放项
 * @param eventType 'impression' 曝光 / 'click' 点击
 * @param position 页面位置（写入扩展数据便于运营按位分析）
 */
function reportTopBannerEvent(
  item: API.AdDeliveryItem,
  eventType: 'impression' | 'click',
  position: string
): void {
  if (!item?.ad_campaign_id) {
    return
  }

  if (item.campaign_category === 'commercial') {
    if (!item.ad_slot_id) {
      log.error('顶部Banner商业广告缺少 ad_slot_id，无法上报计费事件:', item.ad_campaign_id)
      return
    }
    if (eventType === 'impression') {
      reportAdImpression({
        ad_campaign_id: item.ad_campaign_id,
        ad_slot_id: item.ad_slot_id
      }).catch((err: any) => log.warn('顶部Banner曝光上报失败:', err?.message))
    } else {
      reportAdClick({
        ad_campaign_id: item.ad_campaign_id,
        ad_slot_id: item.ad_slot_id,
        click_target: item.link_url || undefined
      }).catch((err: any) => log.warn('顶部Banner点击上报失败:', err?.message))
    }
    return
  }

  /* 运营内容 / 系统通知 → 统一交互日志 */
  reportInteractionLog({
    ad_campaign_id: item.ad_campaign_id,
    interaction_type: eventType,
    extra_data: { slot_type: 'top_banner', position }
  }).catch((err: any) => log.warn('顶部Banner交互日志上报失败（不影响业务）:', err?.message))
}

/**
 * 顶部 Banner 点击跳转 — 复用全站统一跳转语义
 * link_type: none=纯展示不跳 / page=小程序页面 / miniprogram=其他小程序 / webview=网页
 * 跳转前先上报一次点击。
 *
 * @param item 被点击的投放项
 * @param position 页面位置（上报用）
 */
function handleTopBannerTap(item: API.AdDeliveryItem, position: string): void {
  if (!item) {
    return
  }
  /* 先上报点击 */
  reportTopBannerEvent(item, 'click', position)

  if (!item.link_url || !item.link_type || item.link_type === 'none') {
    return
  }

  switch (item.link_type) {
    case 'page':
      wx.navigateTo({
        url: item.link_url,
        fail: () => {
          wx.switchTab({
            url: item.link_url as string,
            fail: (err: any) => log.error('顶部Banner跳转页面失败:', err)
          })
        }
      })
      break
    case 'miniprogram':
      wx.navigateToMiniProgram({
        appId: item.link_url,
        fail: (err: any) => log.error('顶部Banner跳转小程序失败:', err)
      })
      break
    case 'webview':
      wx.navigateTo({
        url: '/pages/webview/webview?url=' + encodeURIComponent(item.link_url),
        fail: (err: any) => log.error('顶部Banner跳转webview失败:', err)
      })
      break
    default:
      log.warn('顶部Banner未知跳转类型:', item.link_type)
  }
}

/**
 * 顶部 Banner 图片加载失败处理 — <image> binderror 触发
 *
 * 背景: 真机 <image> 加载网络图失败是「静默」的（不报错、只留白），
 * 导致「接口正常拿到 image_url、却看不见图」这类问题极难定位。
 * 此处把失败的 image_url 与微信错误详情打到日志，便于一眼定位真因
 * （downloadFile 域名未加白 / 代理鉴权 403 / 图片本身不可达 / 解码失败等）。
 *
 * @param item 加载失败的投放项（含 image_url）
 * @param position 页面位置（lottery/profile/camera/exchange）
 * @param errDetail 微信 image binderror 的 e.detail（含 errMsg）
 */
function handleTopBannerImageError(
  item: API.AdDeliveryItem,
  position: string,
  errDetail: any
): void {
  log.error('顶部Banner图片加载失败（真机<image>未渲染出图）', {
    position,
    ad_campaign_id: item?.ad_campaign_id,
    image_url: item?.image_url,
    errMsg: errDetail?.errMsg || errDetail
  })
}

/**
 * 顶部 Banner 轮播切换上报 — swiper bindchange 触发，对新切入的当前张上报曝光
 *
 * 背景: loadTopBanner 仅对首张（finalItems[0]）上报了首屏曝光，轮播切换到第 2…N 张时
 * 需要逐张补报曝光，否则非首张永远无曝光数据、运营看板失真。
 * 单图模式（非轮播）不会绑定/触发本回调，无需在此判断。
 *
 * @param items 当前页 data.topBannerItems（与渲染顺序一致）
 * @param currentIndex swiper 切换后的当前索引（e.detail.current）
 * @param position 页面位置（上报扩展数据）
 */
function handleTopBannerChange(
  items: API.AdDeliveryItem[],
  currentIndex: number,
  position: string
): void {
  if (!Array.isArray(items) || currentIndex < 0 || currentIndex >= items.length) {
    return
  }
  reportTopBannerEvent(items[currentIndex], 'impression', position)
}

module.exports = {
  loadTopBanner,
  handleTopBannerTap,
  handleTopBannerChange,
  handleTopBannerImageError,
  reportTopBannerEvent
}
