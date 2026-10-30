import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OctahedronGeometry,
  type Ray,
  SphereGeometry,
  SpotLight,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { AlgorithmInfo } from '@/engine/algorithms'
import { Cell, type Maze } from '@/engine/types'
import { createBeamMaterial, createTileMaterial, createWallMaterial, type TileUniforms, type WallUniforms } from './materials'
import type { ScenePalette, ThemeMode } from './palette'
import { TileKind, TileState } from './tiles'

export const APRON = 1.15
const TILE_H = 0.24
const WALL_H = 0.72
const SLAB_H = 0.9
const LIGHT_H = 17
const POST_H = 1.25
const ROPE_HEIGHTS = [0.55, 0.95]
const PATH_Y = 0.62
const PATH_RADIAL = 8

/** Geometry shared by every ring; owned and disposed by the stage. */
export class SharedGeometry {
  readonly tile = new BoxGeometry(0.92, TILE_H, 0.92)
  readonly wall = new BoxGeometry(1, 1, 1)
  readonly post = new CylinderGeometry(0.11, 0.13, 1, 14)
  readonly pad = new BoxGeometry(0.34, 0.42, 0.34)
  readonly rope = new CylinderGeometry(0.032, 0.032, 1, 6)
  readonly ring = new TorusGeometry(0.4, 0.065, 10, 48)
  readonly crystal = new OctahedronGeometry(0.42, 0)
  readonly head = new SphereGeometry(0.22, 16, 12)
  readonly pillar = new CylinderGeometry(0.4, 0.4, 2.4, 28, 1, true)

  dispose() {
    for (const g of Object.values(this)) g.dispose()
  }
}

const tmpMatrix = new Matrix4()
const tmpVec = new Vector3()
const ropeAxisX = new Matrix4().makeRotationZ(Math.PI / 2)
const ropeAxisZ = new Matrix4().makeRotationX(Math.PI / 2)

/**
 * One fighter's boxing ring: the shared maze rendered as instanced tiles and
 * walls on a slab, roped off in the fighter's colour, under its own light.
 */
export class Ring {
  readonly group = new Group()
  readonly width: number
  readonly height: number
  readonly tileUniforms: TileUniforms
  readonly wallUniforms: WallUniforms

  private readonly tiles: InstancedMesh
  private readonly walls: InstancedMesh
  private readonly aKind: InstancedBufferAttribute
  private readonly aState: InstancedBufferAttribute
  private readonly aT0: InstancedBufferAttribute
  private readonly aOrder: InstancedBufferAttribute
  private readonly aDelay: InstancedBufferAttribute
  /** Wall-clock time each wall started (or will start) rising, per cell. */
  private readonly wallBorn: Float32Array
  private readonly cells: Uint8Array

  private readonly slab: Mesh
  private readonly slabMaterial = new MeshStandardMaterial({ roughness: 0.82, metalness: 0.05 })
  private readonly posts: InstancedMesh
  private readonly postMaterial = new MeshStandardMaterial({ roughness: 0.3, metalness: 0.85 })
  private readonly ropes: InstancedMesh
  private readonly pads: InstancedMesh
  private readonly ropeMaterial = new MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 })

  private readonly startMarker = new Group()
  private readonly goalMarker = new Group()
  private readonly markerMaterial = new MeshBasicMaterial({ toneMapped: true })
  private readonly crystalMaterial = new MeshStandardMaterial({ roughness: 0.18, metalness: 0.3, flatShading: true })
  private readonly pillarMaterial = createBeamMaterial()
  private readonly crystal: Mesh

  private readonly spot: SpotLight
  private readonly beam: Mesh
  private readonly beamMaterial = createBeamMaterial()

  private pathMesh: Mesh<TubeGeometry, MeshBasicMaterial> | null = null
  private pathCurve: CatmullRomCurve3 | null = null
  private readonly pathHead: Mesh
  private readonly pathMaterial = new MeshBasicMaterial()
  private readonly headMaterial = new MeshBasicMaterial()

  private fighter: AlgorithmInfo
  private theme: ThemeMode
  private palette: ScenePalette
  private stateDirty = false
  private finishedAt: number | null = null
  private clock = 0

  constructor(shared: SharedGeometry, maze: Maze, fighter: AlgorithmInfo, palette: ScenePalette, theme: ThemeMode) {
    this.width = maze.width
    this.height = maze.height
    this.fighter = fighter
    this.palette = palette
    this.theme = theme
    const n = maze.width * maze.height
    this.cells = new Uint8Array(n)
    this.wallBorn = new Float32Array(n).fill(-100)

    this.tileUniforms = {
      uPlayTime: { value: 0 },
      uBuild: { value: 100 },
      uGrid: { value: new Vector2(maze.width, maze.height) },
      uHover: { value: new Vector2(-10, -10) },
      uColor: { value: new Color() },
      uColorB: { value: new Color() },
      uBase: { value: new Color() },
      uMud: { value: new Color() },
      uGlowScale: { value: 1 },
      uMotion: { value: 1 },
      uPathMix: { value: new Color() },
      uPathAmount: { value: 0.3 },
    }
    this.wallUniforms = {
      uWallBuild: { value: 0 },
      uWallTop: { value: new Color() },
      uWallSide: { value: new Color() },
    }

    // Tiles: one instance per cell, so instance id == cell index. Per-instance
    // attributes live on the geometry, so each ring gets its own copy.
    this.aKind = new InstancedBufferAttribute(new Float32Array(n), 1)
    this.aState = new InstancedBufferAttribute(new Float32Array(n), 1)
    this.aT0 = new InstancedBufferAttribute(new Float32Array(n).fill(-100), 1)
    this.aOrder = new InstancedBufferAttribute(new Float32Array(n), 1)
    const tileGeometry = shared.tile.clone()
    tileGeometry.setAttribute('aKind', this.aKind)
    tileGeometry.setAttribute('aState', this.aState)
    tileGeometry.setAttribute('aT0', this.aT0)
    tileGeometry.setAttribute('aOrder', this.aOrder)
    this.tiles = new InstancedMesh(tileGeometry, createTileMaterial(this.tileUniforms), n)
    this.tiles.frustumCulled = false
    this.tiles.receiveShadow = true
    for (let i = 0; i < n; i++) {
      const [x, z] = this.cellCenter(i)
      tmpMatrix.makeTranslation(x, TILE_H / 2, z)
      this.tiles.setMatrixAt(i, tmpMatrix)
    }

    this.aDelay = new InstancedBufferAttribute(new Float32Array(n), 1)
    const wallGeometry = shared.wall.clone()
    wallGeometry.setAttribute('aDelay', this.aDelay)
    this.walls = new InstancedMesh(wallGeometry, createWallMaterial(this.wallUniforms), n)
    this.walls.frustumCulled = false
    this.walls.castShadow = true
    this.walls.receiveShadow = true

    // The ring itself.
    const slabW = maze.width + APRON * 2
    const slabD = maze.height + APRON * 2
    this.slab = new Mesh(new RoundedBoxGeometry(slabW, SLAB_H, slabD, 3, 0.32), this.slabMaterial)
    this.slab.position.y = -SLAB_H / 2
    this.slab.receiveShadow = true

    this.posts = new InstancedMesh(shared.post, this.postMaterial, 4)
    this.pads = new InstancedMesh(shared.pad, this.ropeMaterial, 4)
    this.ropes = new InstancedMesh(shared.rope, this.ropeMaterial, 4 * ROPE_HEIGHTS.length)
    this.posts.castShadow = true
    const px = slabW / 2 - 0.32
    const pz = slabD / 2 - 0.32
    const corners: [number, number][] = [
      [-px, -pz],
      [px, -pz],
      [px, pz],
      [-px, pz],
    ]
    corners.forEach(([x, z], i) => {
      this.posts.setMatrixAt(i, tmpMatrix.makeScale(1, POST_H, 1).setPosition(x, POST_H / 2, z))
      this.pads.setMatrixAt(i, tmpMatrix.makeTranslation(x, POST_H - 0.12, z))
    })
    let r = 0
    for (const y of ROPE_HEIGHTS) {
      for (const z of [-pz, pz]) {
        tmpMatrix.makeTranslation(0, y, z).multiply(ropeAxisX).scale(tmpVec.set(1, px * 2, 1))
        this.ropes.setMatrixAt(r++, tmpMatrix)
      }
      for (const x of [-px, px]) {
        tmpMatrix.makeTranslation(x, y, 0).multiply(ropeAxisZ).scale(tmpVec.set(1, pz * 2, 1))
        this.ropes.setMatrixAt(r++, tmpMatrix)
      }
    }

    // Start: a glowing ring on the floor with a faint column of light.
    const startRing = new Mesh(shared.ring, this.markerMaterial)
    startRing.rotation.x = -Math.PI / 2
    startRing.position.y = TILE_H + 0.06
    const pillar = new Mesh(shared.pillar, this.pillarMaterial)
    pillar.position.y = TILE_H + 1.2
    this.startMarker.add(startRing, pillar)

    // Goal: a floating crystal over a ring.
    const goalRing = new Mesh(shared.ring, this.markerMaterial)
    goalRing.rotation.x = -Math.PI / 2
    goalRing.position.y = TILE_H + 0.06
    this.crystal = new Mesh(shared.crystal, this.crystalMaterial)
    this.crystal.position.y = 1.3
    this.crystal.castShadow = true
    this.goalMarker.add(goalRing, this.crystal)

    this.pathHead = new Mesh(shared.head, this.headMaterial)
    this.pathHead.visible = false

    // Overhead light and the haze it cuts through.
    const radius = Math.hypot(slabW, slabD) / 2
    this.spot = new SpotLight('#ffffff', 0, 0, Math.atan((radius * 1.25) / LIGHT_H), 0.75, 2)
    this.spot.position.set(0, LIGHT_H, 0)
    const target = new Object3D()
    this.spot.target = target
    this.beam = new Mesh(new CylinderGeometry(0.7, radius * 1.05, LIGHT_H, 48, 1, true), this.beamMaterial)
    this.beam.position.y = LIGHT_H / 2 - SLAB_H
    this.beam.renderOrder = 10

    this.group.add(
      this.slab,
      this.tiles,
      this.walls,
      this.posts,
      this.pads,
      this.ropes,
      this.startMarker,
      this.goalMarker,
      this.pathHead,
      this.spot,
      target,
      this.beam,
    )

    this.setPalette(palette, theme)
    this.setFighter(fighter)
    this.setMaze(maze, 'none')
  }

  private cellCenter(i: number): [number, number] {
    const x = i % this.width
    const y = Math.floor(i / this.width)
    return [x - this.width / 2 + 0.5, y - this.height / 2 + 0.5]
  }

  get algorithm() {
    return this.fighter.id
  }

  setFighter(fighter: AlgorithmInfo) {
    this.fighter = fighter
    const c = new Color(fighter.color[this.theme])
    this.tileUniforms.uColor.value.copy(c)
    this.tileUniforms.uColorB.value.copy(c).lerp(new Color('#ffffff'), 0.42)
    this.ropeMaterial.color.copy(c)
    this.ropeMaterial.emissive.copy(c)
    this.ropeMaterial.emissiveIntensity = this.theme === 'dark' ? 0.55 : 0.15
    const boost = this.palette.pathBoost
    this.pathMaterial.color.copy(c).multiplyScalar(boost)
    this.headMaterial.color.copy(c).lerp(new Color('#ffffff'), 0.6).multiplyScalar(Math.max(1, boost * 1.4))
    this.refreshCrystal()
  }

  setPalette(palette: ScenePalette, theme: ThemeMode) {
    this.palette = palette
    const themeChanged = theme !== this.theme
    this.theme = theme
    this.tileUniforms.uBase.value.set(palette.tile)
    this.tileUniforms.uMud.value.set(palette.mud)
    this.tileUniforms.uGlowScale.value = palette.glow
    this.tileUniforms.uPathMix.value.set(palette.pathMix)
    this.tileUniforms.uPathAmount.value = palette.pathAmount
    this.wallUniforms.uWallTop.value.set(palette.wallTop)
    this.wallUniforms.uWallSide.value.set(palette.wallSide)
    this.slabMaterial.color.set(palette.slab)
    this.postMaterial.color.set(palette.post)
    this.markerMaterial.color.set(palette.marker).multiplyScalar(Math.max(1, palette.markerGlow))
    this.pillarMaterial.uniforms.uColor.value.set(palette.marker)
    this.pillarMaterial.uniforms.uOpacity.value = palette.haze ? 0.55 : 0
    this.spot.color.set(palette.spot)
    this.spot.intensity = palette.spotIntensity
    this.beam.visible = palette.haze
    this.beamMaterial.uniforms.uColor.value.set(palette.spot)
    this.beamMaterial.uniforms.uOpacity.value = 0.075
    if (themeChanged) this.setFighter(this.fighter)
    else this.refreshCrystal()
  }

  private refreshCrystal() {
    const done = this.finishedAt !== null
    const c = done ? new Color(this.fighter.color[this.theme]) : new Color(this.palette.marker)
    this.crystalMaterial.color.copy(c)
    this.crystalMaterial.emissive.copy(c)
    this.crystalMaterial.emissiveIntensity = this.palette.haze ? (done ? 1.6 : 0.9) : done ? 0.4 : 0.05
  }

  setReducedMotion(reduced: boolean) {
    this.tileUniforms.uMotion.value = reduced ? 0 : 1
  }

  /** Plays the tile build-up wave from the beginning. */
  playIntro() {
    this.tileUniforms.uBuild.value = 0
  }

  /**
   * Syncs tiles and walls with the maze. `animate` decides how new walls appear:
   * 'wave' grows them in a sweep from the start corner, 'pop' grows only walls
   * that weren't there before, 'none' places them instantly.
   */
  setMaze(maze: Maze, animate: 'wave' | 'pop' | 'none') {
    const n = this.width * this.height
    const now = this.clock
    for (let i = 0; i < n; i++) {
      const v = maze.cells[i]
      const wasWall = this.cells[i] === Cell.Wall
      this.cells[i] = v
      this.aKind.array[i] = v === Cell.Wall ? TileKind.Hidden : v === Cell.Mud ? TileKind.Mud : TileKind.Floor
      if (v !== Cell.Wall) continue
      if (animate === 'wave') {
        const x = i % this.width
        const y = Math.floor(i / this.width)
        this.wallBorn[i] = now + 0.3 + ((x + y) / (this.width + this.height)) * 0.75
      } else if (animate === 'pop' && !wasWall) {
        this.wallBorn[i] = now
      } else if (animate === 'none') {
        this.wallBorn[i] = -100
      }
    }
    this.aKind.needsUpdate = true
    this.rebuildWalls()
    this.setEndpoints(maze.start, maze.goal)
  }

  private rebuildWalls() {
    let count = 0
    for (let i = 0; i < this.cells.length; i++) {
      if (this.cells[i] !== Cell.Wall) continue
      const [x, z] = this.cellCenter(i)
      tmpMatrix.makeScale(1, WALL_H, 1).setPosition(x, WALL_H / 2, z)
      this.walls.setMatrixAt(count, tmpMatrix)
      this.aDelay.array[count] = this.wallBorn[i]
      count++
    }
    this.walls.count = count
    this.walls.instanceMatrix.needsUpdate = true
    this.aDelay.needsUpdate = true
  }

  setEndpoints(start: number, goal: number) {
    const [sx, sz] = this.cellCenter(start)
    const [gx, gz] = this.cellCenter(goal)
    this.startMarker.position.set(sx, 0, sz)
    this.goalMarker.position.set(gx, 0, gz)
  }

  setHover(cell: number) {
    const v = this.tileUniforms.uHover.value
    if (cell < 0) v.set(-10, -10)
    else v.set(cell % this.width, Math.floor(cell / this.width))
  }

  // --- Trace playback --------------------------------------------------------

  resetTrace() {
    ;(this.aState.array as Float32Array).fill(TileState.Idle)
    ;(this.aT0.array as Float32Array).fill(-100)
    ;(this.aOrder.array as Float32Array).fill(0)
    this.stateDirty = true
    this.clearPath()
    this.finishedAt = null
    this.refreshCrystal()
  }

  setCell(cell: number, state: number, t0: number, order = 0) {
    this.aState.array[cell] = state
    this.aT0.array[cell] = t0
    if (order > 0) this.aOrder.array[cell] = order
    this.stateDirty = true
  }

  /** Builds the path tube; it is revealed with setPathProgress. */
  preparePath(path: Int32Array) {
    this.clearPath()
    if (path.length < 2) return
    const points = Array.from(path, (cell) => {
      const [x, z] = this.cellCenter(cell)
      return new Vector3(x, PATH_Y, z)
    })
    this.pathCurve = new CatmullRomCurve3(points, false, 'centripetal')
    const geometry = new TubeGeometry(this.pathCurve, Math.max(8, points.length * 6), 0.14, PATH_RADIAL, false)
    geometry.setDrawRange(0, 0)
    this.pathMesh = new Mesh(geometry, this.pathMaterial)
    this.group.add(this.pathMesh)
  }

  setPathProgress(p: number) {
    if (!this.pathMesh || !this.pathCurve) return
    const geometry = this.pathMesh.geometry
    const segments = geometry.parameters.tubularSegments
    const shown = Math.round(Math.min(1, Math.max(0, p)) * segments)
    geometry.setDrawRange(0, shown * PATH_RADIAL * 6)
    this.pathHead.visible = p > 0 && p < 1
    if (this.pathHead.visible) this.pathCurve.getPointAt(Math.min(1, p), this.pathHead.position)
  }

  private clearPath() {
    if (this.pathMesh) {
      this.group.remove(this.pathMesh)
      this.pathMesh.geometry.dispose()
      this.pathMesh = null
    }
    this.pathCurve = null
    this.pathHead.visible = false
  }

  markFinished(found: boolean) {
    this.finishedAt = found ? this.clock : null
    this.refreshCrystal()
  }

  // --- Frame --------------------------------------------------------------------

  update(dt: number, playTime: number) {
    this.clock += dt
    this.tileUniforms.uPlayTime.value = playTime
    this.tileUniforms.uBuild.value += dt
    this.wallUniforms.uWallBuild.value = this.clock
    if (this.stateDirty) {
      this.aState.needsUpdate = true
      this.aT0.needsUpdate = true
      this.aOrder.needsUpdate = true
      this.stateDirty = false
    }
    // The goal crystal idles; it spins up and pulses once the fighter arrives.
    const motion = this.tileUniforms.uMotion.value
    const done = this.finishedAt !== null
    this.crystal.rotation.y += dt * (done ? 2.4 : 0.6) * motion
    this.crystal.position.y = 1.3 + Math.sin(this.clock * 1.7) * 0.08 * motion
    const pulse = done ? 1 + 0.35 * Math.exp(-(this.clock - (this.finishedAt ?? 0)) * 3) : 1
    this.crystal.scale.setScalar(pulse)
  }

  /** World-space point the scoreboard label hangs from: the ring's back-left corner. */
  anchor(target: Vector3) {
    return this.group.localToWorld(target.set(-this.width / 2 - APRON + 0.2, 0.2, -this.height / 2 - APRON))
  }

  /** Cell under a world-space ray, or -1. */
  pick(ray: Ray): number {
    const o = tmpVec.copy(ray.origin).sub(this.group.position)
    const d = ray.direction
    if (d.y >= -1e-6) return -1
    const t = (TILE_H - o.y) / d.y
    if (t < 0) return -1
    const x = Math.floor(o.x + d.x * t + this.width / 2)
    const z = Math.floor(o.z + d.z * t + this.height / 2)
    if (x < 0 || z < 0 || x >= this.width || z >= this.height) return -1
    return z * this.width + x
  }

  get footprint() {
    return { width: this.width + APRON * 2, depth: this.height + APRON * 2 }
  }

  dispose() {
    this.clearPath()
    this.tiles.geometry.dispose()
    this.walls.geometry.dispose()
    ;(this.tiles.material as MeshStandardMaterial).dispose()
    ;(this.walls.material as MeshStandardMaterial).dispose()
    this.slab.geometry.dispose()
    this.beam.geometry.dispose()
    for (const m of [
      this.slabMaterial,
      this.postMaterial,
      this.ropeMaterial,
      this.markerMaterial,
      this.crystalMaterial,
      this.pillarMaterial,
      this.beamMaterial,
      this.pathMaterial,
      this.headMaterial,
    ]) {
      m.dispose()
    }
    this.tiles.dispose()
    this.walls.dispose()
    this.posts.dispose()
    this.pads.dispose()
    this.ropes.dispose()
    this.spot.dispose()
  }
}
