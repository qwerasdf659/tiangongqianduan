/**
 * XR-Frame 3D 珠子手串渲染组件
 *
 * 从 diyStore 读取当前设计的珠子列表，计算圆环排列坐标，
 * 根据每颗珠子的 group_code 匹配 PBR 材质参数，渲染3D手串效果。
 *
 * 支持:
 *   - 动态珠子数量和尺寸
 *   - 每颗珠子独立材质（基于 group_code 颜色分组）
 *   - 触摸旋转（camera-orbit-control）
 *   - 自动旋转动画
 *   - 珠子间弹力绳渲染
 */

const { diyStore } = require('../../../store/diy')

/**
 * group_code → PBR 材质参数映射
 * baseColor: RGBA（线性空间）
 * metallic / roughness: PBR 金属度/粗糙度
 */
interface MatParams {
  baseColor: string
  metallic: number
  roughness: number
}

const GROUP_MATERIAL_MAP: Record<string, MatParams> = {
  red: { baseColor: '0.7 0.08 0.1 1.0', metallic: 0.05, roughness: 0.25 },
  orange: { baseColor: '0.8 0.4 0.05 1.0', metallic: 0.05, roughness: 0.3 },
  yellow: { baseColor: '0.85 0.75 0.2 1.0', metallic: 0.08, roughness: 0.28 },
  green: { baseColor: '0.15 0.55 0.3 1.0', metallic: 0.05, roughness: 0.3 },
  blue: { baseColor: '0.1 0.2 0.6 1.0', metallic: 0.08, roughness: 0.22 },
  purple: { baseColor: '0.4 0.15 0.55 1.0', metallic: 0.06, roughness: 0.25 },
}

/** 特殊材质名称匹配（优先级高于 group_code） */
const NAME_MATERIAL_MAP: Record<string, MatParams> = {
  '冰曜石': { baseColor: '0.12 0.08 0.06 1.0', metallic: 0.05, roughness: 0.2 },
  '银曜石': { baseColor: '0.2 0.2 0.22 1.0', metallic: 0.15, roughness: 0.18 },
  '金曜石': { baseColor: '0.35 0.25 0.08 1.0', metallic: 0.3, roughness: 0.22 },
  '白水晶': { baseColor: '0.92 0.92 0.95 0.6', metallic: 0.0, roughness: 0.12 },
  '粉水晶': { baseColor: '0.85 0.6 0.65 0.8', metallic: 0.0, roughness: 0.2 },
  '紫水晶': { baseColor: '0.45 0.2 0.55 0.75', metallic: 0.0, roughness: 0.18 },
  '黄水晶': { baseColor: '0.8 0.65 0.15 0.8', metallic: 0.0, roughness: 0.2 },
  '月光石': { baseColor: '0.8 0.82 0.88 0.7', metallic: 0.1, roughness: 0.15 },
  '奶白晶': { baseColor: '0.9 0.88 0.85 0.9', metallic: 0.0, roughness: 0.35 },
  '茶水晶': { baseColor: '0.4 0.28 0.15 0.85', metallic: 0.0, roughness: 0.25 },
  '黑曜石': { baseColor: '0.05 0.04 0.04 1.0', metallic: 0.02, roughness: 0.15 },
}

/** 默认材质（未匹配时使用） */
const DEFAULT_MATERIAL: MatParams = {
  baseColor: '0.5 0.5 0.5 1.0',
  metallic: 0.05,
  roughness: 0.3,
}

/** 根据珠子数据获取材质参数 */
function getBeadMaterial(bead: any): MatParams {
  const name = bead.display_name || bead.material_name || ''
  for (const [key, mat] of Object.entries(NAME_MATERIAL_MAP)) {
    if (name.includes(key)) {
      return mat
    }
  }
  if (bead.group_code && GROUP_MATERIAL_MAP[bead.group_code]) {
    return GROUP_MATERIAL_MAP[bead.group_code]
  }
  return DEFAULT_MATERIAL
}

/**
 * 计算手串圆环排列坐标（3D空间）
 * 珠子沿 XY 平面圆环排列，Z=0
 */
function calcRingPositions(count: number, ringRadius: number) {
  const positions: Array<{ x: number; y: number; z: number }> = []
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI / count) * i - Math.PI / 2
    positions.push({
      x: ringRadius * Math.cos(angle),
      y: ringRadius * Math.sin(angle),
      z: 0,
    })
  }
  return positions
}

Component({
  properties: {
    width: { type: Number, value: 300 },
    height: { type: Number, value: 300 },
  },

  data: {
    /** 珠子渲染数据列表 */
    beadNodes: [] as Array<{
      position: string
      scale: string
      uniforms: string
      matId: string
    }>,
    /** 相机距离（根据珠子数量自适应） */
    cameraPosition: '0 0.5 4',
    /** 场景是否就绪 */
    sceneReady: false,
    /** 自动旋转角度 */
    autoRotateY: 0,
    /** 绳子节点数据 */
    ropeSegments: [] as Array<{
      position: string
      scale: string
      rotation: string
    }>,
    /** 材质定义列表（去重后的材质） */
    materials: [] as Array<{
      assetId: string
      uniforms: string
    }>,
  },

  lifetimes: {
    attached() {
      this._buildScene()
    },
  },

  methods: {
    /** 场景就绪回调 */
    onSceneReady() {
      this.setData({ sceneReady: true })
      this.triggerEvent('ready')
      this._startAutoRotate()
    },

    /** 构建3D场景数据 */
    _buildScene() {
      const beads = diyStore.selectedBeads as any[]
      if (!beads || beads.length === 0) {
        this._buildDefaultScene()
        return
      }

      const count = beads.length
      const avgDiameter = beads.reduce((s: number, b: any) => s + (b.diameter || 8), 0) / count
      const ringRadius = (avgDiameter * count) / (2 * Math.PI) / 10
      const beadRadius = avgDiameter / 20

      const positions = calcRingPositions(count, ringRadius)
      const materialMap = new Map<string, { assetId: string; uniforms: string }>()
      const beadNodes: any[] = []

      for (let i = 0; i < count; i++) {
        const bead = beads[i]
        const mat = getBeadMaterial(bead)
        const matKey = `${mat.baseColor}_${mat.metallic}_${mat.roughness}`
        const matId = `mat-bead-${materialMap.size}`

        if (!materialMap.has(matKey)) {
          materialMap.set(matKey, {
            assetId: matId,
            uniforms: `u_baseColorFactor:${mat.baseColor},u_metallicFactor:${mat.metallic},u_roughnessFactor:${mat.roughness}`,
          })
        }

        const actualMatId = materialMap.get(matKey)!.assetId
        const pos = positions[i]
        const scale = beadRadius

        beadNodes.push({
          position: `${pos.x.toFixed(4)} ${pos.y.toFixed(4)} ${pos.z.toFixed(4)}`,
          scale: `${scale.toFixed(4)} ${scale.toFixed(4)} ${scale.toFixed(4)}`,
          uniforms: '',
          matId: actualMatId,
        })
      }

      const cameraZ = ringRadius * 3.2
      const ropeSegments = this._buildRopeSegments(positions, beadRadius * 0.15)

      this.setData({
        beadNodes,
        materials: Array.from(materialMap.values()),
        cameraPosition: `0 0.3 ${cameraZ.toFixed(3)}`,
        ropeSegments,
      })
    },

    /** 无珠子时的默认展示场景（12颗占位珠） */
    _buildDefaultScene() {
      const count = 12
      const ringRadius = 1.0
      const beadRadius = 0.2
      const positions = calcRingPositions(count, ringRadius)

      const beadNodes = positions.map((pos) => ({
        position: `${pos.x.toFixed(4)} ${pos.y.toFixed(4)} ${pos.z.toFixed(4)}`,
        scale: `${beadRadius} ${beadRadius} ${beadRadius}`,
        uniforms: '',
        matId: 'mat-default',
      }))

      this.setData({
        beadNodes,
        materials: [{
          assetId: 'mat-default',
          uniforms: 'u_baseColorFactor:0.75 0.75 0.78 0.5,u_metallicFactor:0.0,u_roughnessFactor:0.15',
        }],
        cameraPosition: '0 0.3 3.8',
        ropeSegments: this._buildRopeSegments(positions, beadRadius * 0.15),
      })
    },

    /** 构建绳子段数据（连接相邻珠子的细圆柱） */
    _buildRopeSegments(
      positions: Array<{ x: number; y: number; z: number }>,
      ropeRadius: number
    ) {
      const segments: any[] = []
      const count = positions.length
      if (count < 2) return segments

      for (let i = 0; i < count; i++) {
        const curr = positions[i]
        const next = positions[(i + 1) % count]
        const midX = (curr.x + next.x) / 2
        const midY = (curr.y + next.y) / 2
        const midZ = (curr.z + next.z) / 2
        const dx = next.x - curr.x
        const dy = next.y - curr.y
        const length = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)

        segments.push({
          position: `${midX.toFixed(4)} ${midY.toFixed(4)} ${midZ.toFixed(4)}`,
          scale: `${(length / 2).toFixed(4)} ${ropeRadius.toFixed(4)} ${ropeRadius.toFixed(4)}`,
          rotation: `0 0 ${angle.toFixed(2)}`,
        })
      }
      return segments
    },

    /** 启动自动旋转动画 */
    _startAutoRotate() {
      // XR-Frame 的 camera-orbit-control 已提供触摸旋转
      // 此处可选添加自动旋转（通过 tick 事件）
    },

    /** 逐帧回调（可用于自动旋转） */
    onTick(_dt: number) {
      // 预留：如需自动旋转可在此更新 bracelet 节点 rotation
    },

    /** 外部调用：刷新场景（珠子数据变化后调用） */
    refresh() {
      this._buildScene()
    },
  },
})
