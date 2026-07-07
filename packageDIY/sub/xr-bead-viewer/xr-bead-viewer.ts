/**
 * XR-Frame 3D珠子查看器组件
 *
 * 使用微信 XR-Frame 渲染3D珠子手串
 * 支持圆形排列、材质切换、触摸旋转
 */
import { BEAD_MODELS, calcBraceletPositions } from './bead-models'

Component({
  properties: {
    /** 珠子模型ID列表（对应 bead-models.ts 中的 key） */
    beads: {
      type: Array,
      value: [] as string[]
    },
    /** 手围大小（mm） */
    wristSize: {
      type: Number,
      value: 160
    },
    /** 珠子直径（mm），当所有珠子相同尺寸时使用 */
    beadDiameter: {
      type: Number,
      value: 10
    }
  },

  data: {
    beadPositions: [] as Array<{ x: string; y: string; z: string }>,
    beadScale: '0.005 0.005 0.005',
    cameraDistance: '0.12',
    materialUniforms: '',
    sceneReady: false
  },

  observers: {
    'beads, wristSize, beadDiameter'() {
      this.updateBraceletLayout()
    }
  },

  lifetimes: {
    attached() {
      this.updateBraceletLayout()
    }
  },

  methods: {
    onSceneReady() {
      this.setData({ sceneReady: true })
      this.triggerEvent('ready')
    },

    onTick() {
      // 可用于逐帧动画
    },

    updateBraceletLayout() {
      const { beads, wristSize, beadDiameter } = this.data as any
      const beadList: string[] = beads || []
      const count = beadList.length || 16

      const layout = calcBraceletPositions(count, wristSize, beadDiameter)

      const positions = layout.positions.map(pos => ({
        x: (pos.x / 1000).toFixed(5),
        y: (pos.y / 1000).toFixed(5),
        z: '0'
      }))

      const scale = layout.beadScale / 2
      const scaleStr = `${scale} ${scale} ${scale}`

      const cameraDistance = (layout.braceletRadius / 1000) * 3.5

      const firstBead = beadList[0]
      const model = BEAD_MODELS[firstBead] || BEAD_MODELS['obsidian_7a_10mm']
      const mat = model.material
      const uniforms = [
        `u_baseColorFactor:${mat.baseColor.join(' ')}`,
        `u_metallicFactor:${mat.metallic}`,
        `u_roughnessFactor:${mat.roughness}`
      ].join(',')

      this.setData({
        beadPositions: positions,
        beadScale: scaleStr,
        cameraDistance: cameraDistance.toFixed(4),
        materialUniforms: uniforms
      })
    },

    /** 外部调用：切换单颗珠子材质 */
    setBeadMaterial(index: number, modelId: string) {
      const model = BEAD_MODELS[modelId]
      if (!model) {
        return
      }
      this.triggerEvent('materialchange', { index, model })
    }
  }
})
