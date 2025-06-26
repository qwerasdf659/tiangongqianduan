// pages/lottery/lottery-config.js - 统一的抽奖配置管理
// 🔴 这是项目中唯一的奖品数据源，所有其他地方都应该引用这里的配置

/**
 * 标准奖品配置 - 餐厅积分抽奖系统
 * 包含8个奖品，按照45度等分排列在转盘上
 */
const STANDARD_PRIZES = [
  { 
    id: 1, 
    name: '八八折券', 
    angle: 0, 
    color: '#FF6B35', 
    is_activity: true, 
    type: 'coupon', 
    value: 0.88, 
    probability: 0.15 
  },
  { 
    id: 2, 
    name: '九八折券', 
    angle: 45, 
    color: '#4ECDC4', 
    is_activity: false, 
    type: 'coupon', 
    value: 0.98, 
    probability: 0.20 
  },
  { 
    id: 3, 
    name: '甜品1份', 
    angle: 90, 
    color: '#FFD93D', 
    is_activity: false, 
    type: 'physical', 
    value: 0, 
    probability: 0.25 
  },
  { 
    id: 4, 
    name: '青菜1份', 
    angle: 135, 
    color: '#6BCF7F', 
    is_activity: false, 
    type: 'physical', 
    value: 0, 
    probability: 0.15 
  },
  { 
    id: 5, 
    name: '虾1份', 
    angle: 180, 
    color: '#FF6B6B', 
    is_activity: false, 
    type: 'physical', 
    value: 0, 
    probability: 0.10 
  },
  { 
    id: 6, 
    name: '花甲1份', 
    angle: 225, 
    color: '#4DABF7', 
    is_activity: false, 
    type: 'physical', 
    value: 0, 
    probability: 0.08 
  },
  { 
    id: 7, 
    name: '鱿鱼1份', 
    angle: 270, 
    color: '#9775FA', 
    is_activity: false, 
    type: 'physical', 
    value: 0, 
    probability: 0.05 
  },
  { 
    id: 8, 
    name: '生腌拼盘', 
    angle: 315, 
    color: '#FFB84D', 
    is_activity: true, 
    type: 'physical', 
    value: 0, 
    probability: 0.02 
  }
]

/**
 * 抽奖基础配置
 */
const LOTTERY_CONFIG = {
  costPoints: 100,        // 单次抽奖消耗积分
  dailyLimit: 10,         // 每日抽奖次数限制
  rules: '每次抽奖消耗100积分，每日最多可抽奖10次',
  wheelSize: 8,           // 转盘分割数量
  anglePerSlice: 45       // 每个扇形角度 (360/8)
}

/**
 * 应急后备奖品配置（仅用于Canvas绘制失败时的降级处理）
 */
const FALLBACK_PRIZES = [
  { id: 1, name: '八八折券', color: '#FF6B35' },
  { id: 2, name: '九八折券', color: '#4ECDC4' },
  { id: 3, name: '甜品1份', color: '#FFD93D' },
  { id: 4, name: '青菜1份', color: '#6BCF7F' },
  { id: 5, name: '虾1份', color: '#FF6B6B' },
  { id: 6, name: '花甲1份', color: '#4DABF7' },
  { id: 7, name: '鱿鱼1份', color: '#9775FA' },
  { id: 8, name: '生腌拼盘', color: '#FFB84D' }
]

/**
 * 获取标准奖品配置
 * @returns {Array} 标准奖品数组
 */
function getStandardPrizes() {
  return JSON.parse(JSON.stringify(STANDARD_PRIZES)) // 深拷贝避免修改原始数据
}

/**
 * 获取抽奖基础配置
 * @returns {Object} 抽奖配置对象
 */
function getLotteryConfig() {
  return { ...LOTTERY_CONFIG }
}

/**
 * 获取应急后备奖品配置
 * @returns {Array} 后备奖品数组
 */
function getFallbackPrizes() {
  return JSON.parse(JSON.stringify(FALLBACK_PRIZES))
}

/**
 * 验证奖品配置的完整性
 * @returns {Object} 验证结果
 */
function validatePrizeConfig() {
  const results = {
    valid: true,
    errors: [],
    warnings: []
  }

  // 验证奖品数量
  if (STANDARD_PRIZES.length !== LOTTERY_CONFIG.wheelSize) {
    results.valid = false
    results.errors.push(`奖品数量不匹配: ${STANDARD_PRIZES.length} !== ${LOTTERY_CONFIG.wheelSize}`)
  }

  // 验证角度配置
  const expectedAngles = Array.from({ length: 8 }, (_, i) => i * 45)
  STANDARD_PRIZES.forEach((prize, index) => {
    if (prize.angle !== expectedAngles[index]) {
      results.valid = false
      results.errors.push(`奖品${prize.id}角度错误: ${prize.angle} !== ${expectedAngles[index]}`)
    }
  })

  // 验证概率总和
  const totalProbability = STANDARD_PRIZES.reduce((sum, prize) => sum + prize.probability, 0)
  if (Math.abs(totalProbability - 1.0) > 0.01) {
    results.valid = false
    results.errors.push(`概率总和错误: ${totalProbability.toFixed(3)} !== 1.000`)
  }

  // 验证必要字段
  STANDARD_PRIZES.forEach(prize => {
    const requiredFields = ['id', 'name', 'angle', 'color', 'type', 'probability']
    requiredFields.forEach(field => {
      if (prize[field] === undefined || prize[field] === null) {
        results.valid = false
        results.errors.push(`奖品${prize.id}缺少字段: ${field}`)
      }
    })
  })

  return results
}

module.exports = {
  getStandardPrizes,
  getLotteryConfig,
  getFallbackPrizes,
  validatePrizeConfig,
  STANDARD_PRIZES,
  LOTTERY_CONFIG,
  FALLBACK_PRIZES
} 