/**
 * QR 码模块统一入口
 *
 * 使用 Canvas 2D 新接口，兼容 WebView 和 Skyline
 */

export { QRCode, ErrorCorrectLevel } from './qr-encoder'
export { drawQrcode, drawQrcodeToImage } from './qr-renderer'
export type { QRCodeOptions } from './qr-renderer'
