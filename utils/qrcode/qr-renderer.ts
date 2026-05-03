/**
 * QR 码 Canvas 2D 渲染器
 *
 * 使用新版 Canvas 2D 接口（type="2d"），兼容 WebView 和 Skyline
 * 替代旧版 wx.createCanvasContext 方案
 */

import { QRCode, ErrorCorrectLevel } from './qr-encoder'

export interface QRCodeOptions {
  /** 要编码的文本内容 */
  text: string
  /** 画布宽度（逻辑像素） */
  width: number
  /** 画布高度（逻辑像素） */
  height: number
  /** QR 码类型号，-1 为自动检测（默认 -1） */
  typeNumber?: number
  /** 纠错等级：0=M, 1=L, 2=H, 3=Q（默认 2=H） */
  correctLevel?: number
  /** 前景色（默认 #000000） */
  foreground?: string
  /** 背景色（默认 #ffffff） */
  background?: string
}

/** 纠错等级数字到枚举的映射（兼容旧调用方的数字参数） */
function toErrorCorrectLevel(level?: number): ErrorCorrectLevel {
  switch (level) {
    case 0:
      return ErrorCorrectLevel.M
    case 1:
      return ErrorCorrectLevel.L
    case 2:
      return ErrorCorrectLevel.H
    case 3:
      return ErrorCorrectLevel.Q
    default:
      return ErrorCorrectLevel.H
  }
}

/**
 * 在 Canvas 2D 上绘制 QR 码（同步绘制，无需 draw() 回调）
 *
 * @param canvas - 通过 SelectorQuery 获取的 Canvas node
 * @param options - QR 码配置
 */
export function drawQrcode(canvas: WechatMiniprogram.Canvas, options: QRCodeOptions): void {
  const ctx = canvas.getContext(
    '2d'
  ) as WechatMiniprogram.CanvasRenderingContext.CanvasRenderingContext2D
  const dpr = wx.getWindowInfo().pixelRatio

  canvas.width = options.width * dpr
  canvas.height = options.height * dpr
  ctx.scale(dpr, dpr)

  const qr = new QRCode(options.typeNumber ?? -1, toErrorCorrectLevel(options.correctLevel))
  qr.addData(options.text)
  qr.make()

  const moduleCount = qr.getModuleCount()
  const cellWidth = options.width / moduleCount
  const cellHeight = options.height / moduleCount

  ctx.fillStyle = options.background || '#ffffff'
  ctx.fillRect(0, 0, options.width, options.height)

  ctx.fillStyle = options.foreground || '#000000'
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (qr.isDark(row, col)) {
        const w = Math.ceil((col + 1) * cellWidth) - Math.floor(col * cellWidth)
        const h = Math.ceil((row + 1) * cellHeight) - Math.floor(row * cellHeight)
        ctx.fillRect(Math.round(col * cellWidth), Math.round(row * cellHeight), w, h)
      }
    }
  }
}

/**
 * 便捷方法：通过选择器查找 Canvas 并绘制 QR 码，然后导出为临时图片
 *
 * @param component - 页面或组件实例（this）
 * @param selector - Canvas 的 CSS 选择器（如 '#qrcodeCanvas'）
 * @param options - QR 码配置
 * @returns Promise<string> 临时图片路径
 */
export function drawQrcodeToImage(
  component: WechatMiniprogram.Component.TrivialInstance | WechatMiniprogram.Page.TrivialInstance,
  selector: string,
  options: QRCodeOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    const query = component.createSelectorQuery()
    query
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res: any[]) => {
        if (!res || !res[0] || !res[0].node) {
          reject(new Error('Canvas node not found: ' + selector))
          return
        }
        const canvas = res[0].node as WechatMiniprogram.Canvas
        drawQrcode(canvas, options)

        const dpr = wx.getWindowInfo().pixelRatio
        const tryExport = (attempt: number) => {
          const delay = attempt === 0 ? 150 : 500 * attempt
          setTimeout(() => {
            wx.canvasToTempFilePath(
              {
                canvas,
                width: options.width * dpr,
                height: options.height * dpr,
                destWidth: options.width,
                destHeight: options.height,
                success: tempRes => resolve(tempRes.tempFilePath),
                fail: err => {
                  if (attempt < 3) {
                    tryExport(attempt + 1)
                  } else {
                    reject(err)
                  }
                }
              },
              component
            )
          }, delay)
        }
        tryExport(0)
      })
  })
}
