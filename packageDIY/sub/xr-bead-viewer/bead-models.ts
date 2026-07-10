/**
 * 珠子3D模型配置数据
 *
 * 定义每种珠子的 PBR 材质参数，供 XR-Frame 渲染使用
 * 球体网格由 XR-Frame 内置 geometry 生成，无需外部模型文件
 */

export interface BeadMaterial {
  baseColor: [number, number, number, number]
  metallic: number
  roughness: number
  transmission: number
  clearcoat: number
  clearcoatRoughness: number
}

export interface BeadModelConfig {
  id: string
  name: string
  diameter: number
  material: BeadMaterial
  /** 球体细分段数，影响精度和性能 */
  segments: number
}

/** 珠子材质库 */
export const BEAD_MODELS: Record<string, BeadModelConfig> = {
  obsidian_7a_6mm: {
    id: 'obsidian_7a_6mm',
    name: '7A冰曜石',
    diameter: 6,
    segments: 24,
    material: {
      baseColor: [0.12, 0.08, 0.06, 1.0],
      metallic: 0.05,
      roughness: 0.25,
      transmission: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1
    }
  },
  obsidian_7a_10mm: {
    id: 'obsidian_7a_10mm',
    name: '7A冰曜石',
    diameter: 10,
    segments: 32,
    material: {
      baseColor: [0.12, 0.08, 0.06, 1.0],
      metallic: 0.05,
      roughness: 0.25,
      transmission: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1
    }
  },
  obsidian_7a_12mm: {
    id: 'obsidian_7a_12mm',
    name: '7A冰曜石',
    diameter: 12,
    segments: 32,
    material: {
      baseColor: [0.12, 0.08, 0.06, 1.0],
      metallic: 0.05,
      roughness: 0.25,
      transmission: 0.15,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1
    }
  },
  obsidian_silver_6mm: {
    id: 'obsidian_silver_6mm',
    name: '7A银曜石',
    diameter: 6,
    segments: 24,
    material: {
      baseColor: [0.18, 0.18, 0.2, 1.0],
      metallic: 0.15,
      roughness: 0.2,
      transmission: 0.1,
      clearcoat: 0.85,
      clearcoatRoughness: 0.08
    }
  },
  white_crystal_6mm: {
    id: 'white_crystal_6mm',
    name: '净体白水晶',
    diameter: 6,
    segments: 24,
    material: {
      baseColor: [0.95, 0.95, 0.97, 0.6],
      metallic: 0.0,
      roughness: 0.15,
      transmission: 0.7,
      clearcoat: 0.9,
      clearcoatRoughness: 0.05
    }
  },
  white_crystal_8mm: {
    id: 'white_crystal_8mm',
    name: '净体白水晶',
    diameter: 8,
    segments: 28,
    material: {
      baseColor: [0.95, 0.95, 0.97, 0.6],
      metallic: 0.0,
      roughness: 0.15,
      transmission: 0.7,
      clearcoat: 0.9,
      clearcoatRoughness: 0.05
    }
  },
  white_crystal_10mm: {
    id: 'white_crystal_10mm',
    name: '净体白水晶',
    diameter: 10,
    segments: 32,
    material: {
      baseColor: [0.95, 0.95, 0.97, 0.6],
      metallic: 0.0,
      roughness: 0.15,
      transmission: 0.7,
      clearcoat: 0.9,
      clearcoatRoughness: 0.05
    }
  },
  milky_crystal_8mm: {
    id: 'milky_crystal_8mm',
    name: '奶白晶',
    diameter: 8,
    segments: 28,
    material: {
      baseColor: [0.92, 0.9, 0.88, 0.9],
      metallic: 0.0,
      roughness: 0.35,
      transmission: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15
    }
  },
  milky_crystal_10mm: {
    id: 'milky_crystal_10mm',
    name: '奶白晶',
    diameter: 10,
    segments: 32,
    material: {
      baseColor: [0.92, 0.9, 0.88, 0.9],
      metallic: 0.0,
      roughness: 0.35,
      transmission: 0.3,
      clearcoat: 0.6,
      clearcoatRoughness: 0.15
    }
  }
}

/**
 * 手串圆形排列坐标计算
 * @param beadCount 珠子总数
 * @param wristSize 手围（mm）
 * @param beadDiameter 珠子直径（mm）
 */
export function calcBraceletPositions(
  beadCount: number,
  wristSize: number = 160,
  beadDiameter: number = 10
) {
  const braceletRadius = wristSize / (2 * Math.PI)
  const positions: Array<{ x: number; y: number; z: number; angle: number }> = []

  for (let i = 0; i < beadCount; i++) {
    const angle = ((2 * Math.PI) / beadCount) * i
    positions.push({
      x: braceletRadius * Math.cos(angle),
      y: braceletRadius * Math.sin(angle),
      z: 0,
      angle: angle * (180 / Math.PI)
    })
  }

  return {
    braceletRadius,
    beadDiameter,
    beadScale: beadDiameter / 1000,
    positions
  }
}
