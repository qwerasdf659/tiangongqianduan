/**
 * 图片加载处理工具
 * 提供统一的图片加载、错误处理和状态管理
 * @author AI Assistant
 * @version 1.0.0
 */

/**
 * 默认图片配置
 */
const DEFAULT_IMAGES = {
  // 默认产品图片
  product: '/images/products/default-product.png',
  // 默认用户头像
  avatar: '/images/default-avatar.png',
  // 加载中占位图
  loading: '/images/default-product.png'
}

/**
 * 图片加载状态枚举
 */
const IMAGE_STATUS = {
  LOADING: 'loading',     // 加载中
  SUCCESS: 'success',     // 加载成功
  ERROR: 'error',         // 加载失败
  DEFAULT: 'default'      // 使用默认图片
}

/**
 * 图片错误处理器
 * @param {Event} e - 图片错误事件
 * @param {Object} options - 处理选项
 * @param {string} options.defaultType - 默认图片类型 (product|avatar)
 * @param {Function} options.callback - 错误处理回调
 * @returns {string} 默认图片路径
 */
function handleImageError(e, options = {}) {
  const { defaultType = 'product', callback } = options
  const defaultSrc = DEFAULT_IMAGES[defaultType] || DEFAULT_IMAGES.product
  
  console.warn(`图片加载失败: ${e.detail?.errMsg || '未知错误'}`, {
    src: e.currentTarget?.dataset?.src || '未知路径',
    timestamp: new Date().toISOString()
  })
  
  // 执行回调函数
  if (typeof callback === 'function') {
    callback({
      status: IMAGE_STATUS.ERROR,
      defaultSrc,
      originalSrc: e.currentTarget?.dataset?.src,
      error: e.detail
    })
  }
  
  return defaultSrc
}

/**
 * 图片加载成功处理器
 * @param {Event} e - 图片加载事件
 * @param {Function} callback - 成功处理回调
 */
function handleImageLoad(e, callback) {
  if (typeof callback === 'function') {
    callback({
      status: IMAGE_STATUS.SUCCESS,
      src: e.currentTarget?.src,
      width: e.detail?.width,
      height: e.detail?.height
    })
  }
}

/**
 * 预处理图片路径
 * 检查图片路径是否有效，提供默认值
 * @param {string} src - 原始图片路径
 * @param {string} defaultType - 默认图片类型
 * @returns {string} 处理后的图片路径
 */
function preprocessImageSrc(src, defaultType = 'product') {
  // 如果没有提供路径或路径为空，使用默认图片
  if (!src || typeof src !== 'string' || src.trim() === '') {
    return DEFAULT_IMAGES[defaultType] || DEFAULT_IMAGES.product
  }
  
  // 如果是相对路径且不以/开头，添加/
  if (!src.startsWith('/') && !src.startsWith('http')) {
    src = '/' + src
  }
  
  return src
}

/**
 * 创建图片加载状态管理器
 * @param {Object} page - 页面实例
 * @param {string} dataKey - 数据键名
 * @returns {Object} 状态管理器
 */
function createImageStatusManager(page, dataKey = 'imageStatus') {
  return {
    // 设置图片加载状态
    setStatus(imageId, status, data = {}) {
      const statusData = page.data[dataKey] || {}
      statusData[imageId] = {
        status,
        timestamp: Date.now(),
        ...data
      }
      page.setData({
        [dataKey]: statusData
      })
    },
    
    // 获取图片加载状态
    getStatus(imageId) {
      const statusData = page.data[dataKey] || {}
      return statusData[imageId] || { status: IMAGE_STATUS.LOADING }
    },
    
    // 清除图片状态
    clearStatus(imageId) {
      const statusData = page.data[dataKey] || {}
      delete statusData[imageId]
      page.setData({
        [dataKey]: statusData
      })
    }
  }
}

/**
 * 批量处理产品数据中的图片
 * @param {Array} products - 产品数据数组
 * @returns {Array} 处理后的产品数据
 */
function preprocessProductImages(products) {
  if (!Array.isArray(products)) {
    return products
  }
  
  return products.map(product => {
    if (product && typeof product === 'object') {
      return {
        ...product,
        image: preprocessImageSrc(product.image, 'product'),
        // 添加图片状态字段
        imageStatus: IMAGE_STATUS.LOADING
      }
    }
    return product
  })
}

/**
 * 图片预加载功能
 * @param {string|Array} src - 图片路径或路径数组
 * @returns {Promise} 预加载Promise
 */
function preloadImages(src) {
  const sources = Array.isArray(src) ? src : [src]
  
  const loadPromises = sources.map(imageSrc => {
    return new Promise((resolve, reject) => {
      wx.downloadFile({
        url: imageSrc,
        success: (res) => {
          if (res.statusCode === 200) {
            resolve({
              src: imageSrc,
              localPath: res.tempFilePath,
              status: 'success'
            })
          } else {
            reject({
              src: imageSrc,
              error: `HTTP ${res.statusCode}`,
              status: 'error'
            })
          }
        },
        fail: (err) => {
          reject({
            src: imageSrc,
            error: err.errMsg || '下载失败',
            status: 'error'
          })
        }
      })
    })
  })
  
  return Promise.allSettled(loadPromises)
}

module.exports = {
  DEFAULT_IMAGES,
  IMAGE_STATUS,
  handleImageError,
  handleImageLoad,
  preprocessImageSrc,
  createImageStatusManager,
  preprocessProductImages,
  preloadImages
} 