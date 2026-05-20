/**
 * QR 码 Canvas 2D 渲染器 + 纯 JS base64 生成器
 *
 * - drawQrcode / drawQrcodeToImage: Canvas 2D 方案（WebView 兼容）
 * - drawQrcodeOffscreen: 离屏 Canvas 方案
 * - generateQrcodeBase64: 纯 JS 方案，不依赖任何 Canvas API，Skyline 首选
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

/**
 * 使用离屏 Canvas 生成 QR 码图片（不依赖页面 DOM 节点）
 *
 * 解决 Skyline 渲染引擎中页面 Canvas 节点在首次加载时不可用的问题。
 * 离屏 Canvas 由 JS 直接创建，不受页面渲染时序影响。
 *
 * 流程：离屏 Canvas 绘制 → toDataURL 获取 base64 → 写入临时文件 → 返回文件路径
 *
 * @param options - QR 码配置
 * @returns Promise<string> 临时图片文件路径
 */
export function drawQrcodeOffscreen(options: QRCodeOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const dpr = wx.getWindowInfo().pixelRatio
      const canvas = wx.createOffscreenCanvas({
        type: '2d',
        width: options.width * dpr,
        height: options.height * dpr
      })

      const ctx = canvas.getContext('2d') as any
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

      const dataUrl: string = (canvas as any).toDataURL('image/png')
      if (!dataUrl || !dataUrl.startsWith('data:image')) {
        reject(new Error('OffscreenCanvas toDataURL returned invalid data'))
        return
      }

      const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const filePath = `${wx.env.USER_DATA_PATH}/qrcode_${Date.now()}.png`
      const fs = wx.getFileSystemManager()
      fs.writeFile({
        filePath,
        data: base64Data,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: (err) => reject(new Error('writeFile failed: ' + (err.errMsg || '')))
      })
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 纯 JS 生成 QR 码图片文件（不依赖任何 Canvas API）
 *
 * 适用场景：Skyline 渲染引擎下 Canvas 节点不稳定，
 * 此方法通过纯算法生成 BMP 图片写入临时文件，返回文件路径供 <image src> 使用。
 *
 * @param options - QR 码配置（text, width, height 等）
 * @returns Promise<string> 临时图片文件路径
 */
export function generateQrcodeBase64(options: QRCodeOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const qr = new QRCode(
        options.typeNumber ?? -1,
        toErrorCorrectLevel(options.correctLevel)
      )
      qr.addData(options.text)
      qr.make()

      const moduleCount = qr.getModuleCount()
      const size = options.width || 428
      const scale = Math.floor(size / moduleCount)
      const imgSize = scale * moduleCount

      /* BMP 文件结构：文件头(14) + 信息头(40) + 像素数据 */
      const rowBytes = imgSize * 3
      const paddingPerRow = (4 - (rowBytes % 4)) % 4
      const rowSize = rowBytes + paddingPerRow
      const pixelDataSize = rowSize * imgSize
      const fileSize = 54 + pixelDataSize

      const buf = new ArrayBuffer(fileSize)
      const view = new DataView(buf)

      /* BMP 文件头 (14 bytes) */
      view.setUint8(0, 0x42)  // 'B'
      view.setUint8(1, 0x4d)  // 'M'
      view.setUint32(2, fileSize, true)
      view.setUint32(6, 0, true)
      view.setUint32(10, 54, true)

      /* BMP 信息头 (40 bytes) */
      view.setUint32(14, 40, true)
      view.setInt32(18, imgSize, true)
      view.setInt32(22, -imgSize, true)
      view.setUint16(26, 1, true)
      view.setUint16(28, 24, true)
      view.setUint32(30, 0, true)
      view.setUint32(34, pixelDataSize, true)
      view.setUint32(38, 2835, true)
      view.setUint32(42, 2835, true)
      view.setUint32(46, 0, true)
      view.setUint32(50, 0, true)

      /* 写入像素数据 */
      let offset = 54
      for (let y = 0; y < imgSize; y++) {
        const qrRow = Math.floor(y / scale)
        for (let x = 0; x < imgSize; x++) {
          const qrCol = Math.floor(x / scale)
          const isDark = qr.isDark(qrRow, qrCol)
          const color = isDark ? 0x00 : 0xff
          view.setUint8(offset++, color)
          view.setUint8(offset++, color)
          view.setUint8(offset++, color)
        }
        for (let p = 0; p < paddingPerRow; p++) {
          view.setUint8(offset++, 0)
        }
      }

      /* 写入用户临时文件目录 */
      const filePath = `${wx.env.USER_DATA_PATH}/qr_${Date.now()}.bmp`
      const base64Data = wx.arrayBufferToBase64(buf)
      const fs = wx.getFileSystemManager()
      fs.writeFile({
        filePath,
        data: base64Data,
        encoding: 'base64',
        success: () => resolve(filePath),
        fail: (err) => reject(new Error('QR写入文件失败: ' + (err.errMsg || '')))
      })
    } catch (err) {
      reject(err)
    }
  })
}
