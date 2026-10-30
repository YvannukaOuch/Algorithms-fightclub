import {
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Fog,
  HalfFloatType,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Points,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ALGORITHM_BY_ID, type AlgorithmId } from '@/engine/algorithms'
import type { Maze } from '@/engine/types'
import { createDustMaterial } from './materials'
import { PALETTES, type ScenePalette, type ThemeMode } from './palette'
import { Ring, SharedGeometry } from './Ring'

export type Quality = 'high' | 'low'

export interface StageOptions {
  theme: ThemeMode
  quality: Quality
  reducedMotion: boolean
}

export interface StageHandlers {
  /** Cell under the pointer (-1 when none); mirrored on every ring. */
  onHover?(cell: number): void
  onStrokeStart?(cell: number, erase: boolean): void
  onStroke?(cell: number): void
  onStrokeEnd?(): void
  /** Runs once per frame before rendering; drives playback. */
  onFrame?(dt: number): void
}

const FOV = 30
const POLAR = MathUtils.degToRad(40)
const GAP_X = 2.8
const GAP_Z = 4.6
const POST_HEIGHT = 1.4
/** Height of a ring scoreboard plus breathing room, in CSS px. */
const LABEL_PX = 74
const DUST_COUNT = 650
const DUST_HEIGHT = 11

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * The 3D venue. Owns the renderer, the rings (one per fighter), lighting,
 * post-processing, camera fitting and pointer input. Knows nothing about
 * playback: the fight player writes tile states into rings directly.
 */
export class ArenaStage {
  readonly rings: Ring[] = []
  handlers: StageHandlers = {}
  /** Playback clock in seconds, set by the fight player each frame. */
  playTime = 0

  private readonly container: HTMLElement
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly camera = new PerspectiveCamera(FOV, 1, 0.5, 500)
  private readonly controls: OrbitControls
  private readonly composer: EffectComposer | null = null
  private readonly bloom: UnrealBloomPass | null = null
  private readonly shared = new SharedGeometry()
  private readonly hemi: HemisphereLight
  private readonly key: DirectionalLight
  private readonly floor: Mesh<PlaneGeometry, MeshStandardMaterial>
  private readonly dust: Points<BufferGeometry, ReturnType<typeof createDustMaterial>>
  private readonly raycaster = new Raycaster()
  private readonly ndc = new Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly envTexture

  private palette: ScenePalette
  private theme: ThemeMode
  private readonly reducedMotion: boolean
  private maze: Maze | null = null
  private hud: (HTMLElement | null)[] = []
  private editable = false
  private hoverCell = -1
  private stroke: { pointerId: number; last: number } | null = null
  private frameId = 0
  private lastTime = 0
  private clock = 0
  private viewW = 1
  private viewH = 1
  private bottomInset = 0
  private tween: { fromPos: Vector3; toPos: Vector3; fromTarget: Vector3; toTarget: Vector3; t: number } | null = null
  private readonly anchorScratch = new Vector3()
  private readonly fitCamera = new PerspectiveCamera()
  private readonly fitPoint = new Vector3()

  constructor(container: HTMLElement, options: StageOptions) {
    this.container = container
    this.theme = options.theme
    this.palette = PALETTES[options.theme]
    this.reducedMotion = options.reducedMotion
    const high = options.quality === 'high'

    this.renderer = new WebGLRenderer({ antialias: !high, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.25))
    this.renderer.toneMapping = NeutralToneMapping
    this.renderer.shadowMap.enabled = high
    this.renderer.shadowMap.type = PCFShadowMap
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.touchAction = 'none'
    container.appendChild(this.renderer.domElement)

    const pmrem = new PMREMGenerator(this.renderer)
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.environment = this.envTexture
    this.scene.environmentIntensity = 0.22

    this.hemi = new HemisphereLight()
    this.key = new DirectionalLight('#ffffff')
    this.key.castShadow = high
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.bias = -0.0004
    this.key.shadow.normalBias = 0.03
    this.key.shadow.radius = 3
    this.scene.add(this.hemi, this.key, this.key.target)

    this.floor = new Mesh(new PlaneGeometry(600, 600), new MeshStandardMaterial({ roughness: 0.96, metalness: 0 }))
    this.floor.rotation.x = -Math.PI / 2
    this.floor.position.y = -0.92
    this.floor.receiveShadow = true
    this.scene.add(this.floor)

    const dustGeometry = new BufferGeometry()
    const pos = new Float32Array(DUST_COUNT * 3)
    const seeds = new Float32Array(DUST_COUNT)
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = Math.random() - 0.5
      pos[i * 3 + 1] = Math.random() * DUST_HEIGHT
      pos[i * 3 + 2] = Math.random() - 0.5
      seeds[i] = Math.random()
    }
    dustGeometry.setAttribute('position', new Float32BufferAttribute(pos, 3))
    dustGeometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1))
    this.dust = new Points(dustGeometry, createDustMaterial())
    this.dust.material.uniforms.uHeight.value = DUST_HEIGHT
    this.dust.frustumCulled = false
    this.scene.add(this.dust)

    if (high) {
      const size = this.renderer.getDrawingBufferSize(new Vector2())
      const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 })
      this.composer = new EffectComposer(this.renderer, target)
      this.composer.addPass(new RenderPass(this.scene, this.camera))
      this.bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.6, 0.5, 0.85)
      this.composer.addPass(this.bloom)
      this.composer.addPass(new OutputPass())
    }

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.minPolarAngle = 0.1
    this.controls.maxPolarAngle = MathUtils.degToRad(72)
    this.controls.rotateSpeed = 0.6
    this.controls.zoomSpeed = 0.8
    this.controls.addEventListener('start', () => {
      this.tween = null
    })

    this.applyPalette()

    container.addEventListener('pointerdown', this.onPointerDown, { capture: true })
    container.addEventListener('pointermove', this.onPointerMove, { capture: true })
    container.addEventListener('pointerup', this.onPointerUp, { capture: true })
    container.addEventListener('pointercancel', this.onPointerUp, { capture: true })
    container.addEventListener('pointerleave', this.onPointerLeave)
    container.addEventListener('contextmenu', this.onContextMenu)

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.frameId = requestAnimationFrame(this.tick)
  }

  // --- Public API -----------------------------------------------------------

  /** Shows a maze on every ring. Rebuilds the rings if the arena size changed. */
  setMaze(maze: Maze, how: 'intro' | 'wave' | 'pop' | 'none') {
    const resized = !this.maze || this.maze.width !== maze.width || this.maze.height !== maze.height
    this.maze = maze
    if (resized && this.rings.length > 0) {
      // Ring geometry is sized to the arena, so rebuild them (new rings play the intro).
      const ids = this.rings.map((r) => r.algorithm)
      this.clearRings()
      this.setFighters(ids)
      return
    }
    for (const ring of this.rings) {
      ring.setMaze(maze, how === 'intro' ? 'wave' : how)
      if (how === 'intro') this.introduce(ring)
    }
  }

  /** Adds, removes and reorders rings to match the lineup. */
  setFighters(ids: AlgorithmId[]) {
    if (!this.maze) return
    const keep = new Map(this.rings.map((r) => [r.algorithm, r]))
    const next: Ring[] = []
    for (const id of ids) {
      let ring = keep.get(id)
      if (ring) {
        keep.delete(id)
      } else {
        ring = new Ring(this.shared, this.maze, ALGORITHM_BY_ID[id], this.palette, this.theme)
        ring.setReducedMotion(this.reducedMotion)
        this.scene.add(ring.group)
        this.introduce(ring)
      }
      next.push(ring)
    }
    for (const ring of keep.values()) {
      this.scene.remove(ring.group)
      ring.dispose()
    }
    const changed = next.length !== this.rings.length || next.some((ring, i) => ring !== this.rings[i])
    this.rings.length = 0
    this.rings.push(...next)
    // Only reframe when the lineup actually changed, so a new arena keeps the
    // viewer's camera angle.
    if (changed) this.layout(true)
  }

  setTheme(theme: ThemeMode) {
    if (theme === this.theme) return
    this.theme = theme
    this.palette = PALETTES[theme]
    this.applyPalette()
  }

  setEditable(editable: boolean) {
    this.editable = editable
    if (!editable) this.setHover(-1)
  }

  /** Scoreboard elements, one per ring, positioned over the ring every frame. */
  setHudElements(elements: (HTMLElement | null)[]) {
    this.hud = elements
  }

  /** Height in px of UI overlaid on the bottom of the stage; the camera frames above it. */
  setBottomInset(px: number) {
    if (Math.abs(px - this.bottomInset) < 1) return
    this.bottomInset = px
    this.resize()
  }

  resetView() {
    this.layout(true)
  }

  dispose() {
    cancelAnimationFrame(this.frameId)
    this.resizeObserver.disconnect()
    this.container.removeEventListener('pointerdown', this.onPointerDown, { capture: true })
    this.container.removeEventListener('pointermove', this.onPointerMove, { capture: true })
    this.container.removeEventListener('pointerup', this.onPointerUp, { capture: true })
    this.container.removeEventListener('pointercancel', this.onPointerUp, { capture: true })
    this.container.removeEventListener('pointerleave', this.onPointerLeave)
    this.container.removeEventListener('contextmenu', this.onContextMenu)
    this.controls.dispose()
    this.clearRings()
    this.shared.dispose()
    this.floor.geometry.dispose()
    this.floor.material.dispose()
    this.dust.geometry.dispose()
    this.dust.material.dispose()
    this.envTexture.dispose()
    if (this.composer) {
      for (const pass of this.composer.passes) pass.dispose()
      this.composer.dispose()
    }
    this.renderer.dispose()
    // Free the context now rather than at GC time; browsers cap live contexts.
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }

  // --- Internals ------------------------------------------------------------

  private introduce(ring: Ring) {
    if (this.reducedMotion) return
    ring.playIntro()
    if (this.maze) ring.setMaze(this.maze, 'wave')
  }

  private clearRings() {
    for (const ring of this.rings) {
      this.scene.remove(ring.group)
      ring.dispose()
    }
    this.rings.length = 0
  }

  private applyPalette() {
    const p = this.palette
    const bg = new Color(p.background)
    this.scene.background = bg
    this.scene.fog = new Fog(bg, 60, 180)
    this.floor.material.color.set(p.floor)
    this.hemi.color.set(p.hemiSky)
    this.hemi.groundColor.set(p.hemiGround)
    this.hemi.intensity = p.hemiIntensity
    this.key.intensity = p.keyIntensity
    this.renderer.toneMappingExposure = p.exposure
    this.dust.visible = p.haze && !this.reducedMotion
    if (this.bloom) {
      this.bloom.strength = p.bloom.strength
      this.bloom.radius = p.bloom.radius
      this.bloom.threshold = p.bloom.threshold
    }
    for (const ring of this.rings) ring.setPalette(p, this.theme)
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth)
    const h = Math.max(1, this.container.clientHeight)
    this.viewW = w
    this.viewH = h
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = `${w}px`
    this.renderer.domElement.style.height = `${h}px`
    this.composer?.setSize(w, h)
    this.camera.aspect = w / h
    this.layout(false)
  }

  /** Slides the rendered image up by `px` screen pixels (down when negative). */
  private applyShift(px: number) {
    const w = this.viewW
    const h = this.viewH
    const k = Math.round(px * 2)
    if (k > 0) this.camera.setViewOffset(w, h + k, 0, k, w, h)
    else if (k < 0) this.camera.setViewOffset(w, h - k, 0, 0, w, h)
    else this.camera.clearViewOffset()
    this.camera.updateProjectionMatrix()
  }

  /**
   * Camera distance at which a w × d layout fits the visible canvas: every
   * corner (including post height) inside the side margins, above the overlaid
   * controls, and below enough headroom for the scoreboards over the back row.
   * Projects real points, so perspective foreshortening is accounted for.
   */
  private fitDistance(w: number, d: number, target: Vector3): number {
    const { xLimit, top, bottom } = this.fitBounds()
    let lo = 2
    let hi = 600
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      const [minX, maxX, minY, maxY] = this.projectedExtent(w, d, target, mid)
      if (Math.max(-minX, maxX) <= xLimit && maxY <= top && minY >= bottom) hi = mid
      else lo = mid
    }
    return hi
  }

  /** Screen-space gap in px between the first row's front edge and the second row's back edge. */
  private rowGapPx(sd: number, gapZ: number, d: number, target: Vector3, distance: number) {
    const cam = this.fitCamera.copy(this.camera)
    cam.position.setFromSphericalCoords(distance, POLAR, 0).add(target)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    const front = -d / 2 + sd
    const yFront = this.fitPoint.set(0, 0, front).project(cam).y
    const yBack = this.fitPoint.set(0, 0, front + gapZ).project(cam).y
    return ((yFront - yBack) * this.viewH) / 2
  }

  /** NDC limits the layout must stay inside, leaving room for overlaid UI. */
  private fitBounds() {
    return {
      xLimit: 1 - (2 * 14) / this.viewW,
      top: 1 - (2 * 78) / this.viewH,
      bottom: -1 + (2 * (Math.min(this.bottomInset, this.viewH * 0.4) + 10)) / this.viewH,
    }
  }

  /** NDC bounding box [minX, maxX, minY, maxY] of a w × d layout seen from `distance`. */
  private projectedExtent(w: number, d: number, target: Vector3, distance: number) {
    const cam = this.fitCamera.copy(this.camera)
    cam.position.setFromSphericalCoords(distance, POLAR, 0).add(target)
    cam.lookAt(target)
    cam.updateMatrixWorld()
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const x of [-w / 2, w / 2]) {
      for (const z of [-d / 2, d / 2]) {
        for (const y of [0, POST_HEIGHT]) {
          const p = this.fitPoint.set(x, y, z).project(cam)
          minX = Math.min(minX, p.x)
          maxX = Math.max(maxX, p.x)
          minY = Math.min(minY, p.y)
          maxY = Math.max(maxY, p.y)
        }
      }
    }
    return [minX, maxX, minY, maxY]
  }

  /** Arranges rings in the grid that shows them largest and frames the camera. */
  private layout(animate: boolean) {
    const n = this.rings.length
    if (n === 0) return
    const { width: sw, depth: sd } = this.rings[0].footprint
    const target = new Vector3(0, 0, 0)
    // Fit with the image centred above the overlaid controls, then nudge it so
    // the free space above and below the rings is even.
    const baseShift = Math.min(this.bottomInset, this.viewH * 0.4) / 2
    this.applyShift(baseShift)
    let best = { cols: 1, rows: n, w: 0, d: 0, gapZ: GAP_Z, distance: Infinity }
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols)
      const w = cols * sw + (cols - 1) * GAP_X
      // Scoreboards are a fixed pixel height but row gaps are world units, so
      // widen the gap until a back-row label clears the row in front of it.
      let gapZ = GAP_Z
      let d = rows * sd
      let distance = 0
      for (let attempt = 0; attempt < 5; attempt++) {
        d = rows * sd + (rows - 1) * gapZ
        distance = this.fitDistance(w, d, target)
        if (rows === 1) break
        const gapPx = this.rowGapPx(sd, gapZ, d, target, distance)
        if (gapPx >= LABEL_PX) break
        gapZ *= Math.min(3, (LABEL_PX / Math.max(gapPx, 1)) * 1.06)
      }
      if (distance < best.distance - 1e-6) best = { cols, rows, w, d, gapZ, distance }
    }
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / best.cols)
      const inRow = Math.min(best.cols, n - row * best.cols)
      const col = i % best.cols
      const rowW = inRow * sw + (inRow - 1) * GAP_X
      const x = -rowW / 2 + sw / 2 + col * (sw + GAP_X)
      const z = -best.d / 2 + sd / 2 + row * (sd + best.gapZ)
      this.rings[i].group.position.set(x, 0, z)
    }

    const distance = best.distance
    const { top, bottom } = this.fitBounds()
    const [, , minY, maxY] = this.projectedExtent(best.w, best.d, target, distance)
    const centring = ((top + bottom - (maxY + minY)) / 2) * (this.viewH / 2)
    this.applyShift(baseShift + centring)
    const position = new Vector3().setFromSphericalCoords(distance, POLAR, 0).add(target)
    this.controls.minDistance = distance * 0.3
    this.controls.maxDistance = distance * 2.4

    if (animate && !this.reducedMotion && this.camera.position.lengthSq() > 0) {
      this.tween = {
        fromPos: this.camera.position.clone(),
        toPos: position,
        fromTarget: this.controls.target.clone(),
        toTarget: target,
        t: 0,
      }
    } else {
      this.tween = null
      this.camera.position.copy(position)
      this.controls.target.copy(target)
    }

    // Shadow frustum and haze follow the layout.
    const extent = Math.max(best.w, best.d) / 2 + 4
    const cam = this.key.shadow.camera
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = 120
    cam.updateProjectionMatrix()
    // Key light from behind-left: wall shadows fall toward the camera, onto
    // floor the viewer can see, which is what makes the walls read as raised.
    this.key.position.set(-extent * 0.75, 38, -extent * 0.55)
    this.key.target.position.set(0, 0, 0)
    this.dust.scale.set(best.w + 6, 1, best.d + 6)
    const fog = this.scene.fog as Fog
    fog.near = distance * 1.1
    fog.far = distance * 3.2
  }

  private tick = (now: number) => {
    this.frameId = requestAnimationFrame(this.tick)
    const dt = this.lastTime ? Math.min(0.05, (now - this.lastTime) / 1000) : 0
    this.lastTime = now
    this.clock += dt

    this.handlers.onFrame?.(dt)

    if (this.tween) {
      this.tween.t = Math.min(1, this.tween.t + dt / 0.8)
      const k = easeInOut(this.tween.t)
      this.camera.position.lerpVectors(this.tween.fromPos, this.tween.toPos, k)
      this.controls.target.lerpVectors(this.tween.fromTarget, this.tween.toTarget, k)
      if (this.tween.t >= 1) this.tween = null
    }
    this.controls.update(dt)

    for (const ring of this.rings) ring.update(dt, this.playTime)
    this.dust.material.uniforms.uTime.value = this.clock

    this.positionHud()
    if (this.composer) this.composer.render(dt)
    else this.renderer.render(this.scene, this.camera)
  }

  private positionHud() {
    for (let i = 0; i < this.hud.length; i++) {
      const el = this.hud[i]
      const ring = this.rings[i]
      if (!el || !ring) continue
      const p = ring.anchor(this.anchorScratch).project(this.camera)
      const visible = p.z < 1 && p.z > -1
      const x = (p.x * 0.5 + 0.5) * this.viewW
      const y = (-p.y * 0.5 + 0.5) * this.viewH
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
      el.style.visibility = visible ? 'visible' : 'hidden'
    }
  }

  // --- Pointer --------------------------------------------------------------

  private pickAt(e: PointerEvent): number {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.ndc, this.camera)
    for (const ring of this.rings) {
      const cell = ring.pick(this.raycaster.ray)
      if (cell >= 0) return cell
    }
    return -1
  }

  private setHover(cell: number) {
    if (cell === this.hoverCell) return
    this.hoverCell = cell
    for (const ring of this.rings) ring.setHover(cell)
    this.container.style.cursor = cell >= 0 ? 'crosshair' : ''
    this.handlers.onHover?.(cell)
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!this.editable || (e.button !== 0 && e.button !== 2)) return
    const cell = this.pickAt(e)
    if (cell < 0) return
    // Claim the gesture for painting before OrbitControls (on the canvas) sees it.
    e.stopPropagation()
    e.preventDefault()
    this.container.setPointerCapture(e.pointerId)
    this.stroke = { pointerId: e.pointerId, last: cell }
    this.handlers.onStrokeStart?.(cell, e.button === 2)
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.editable) return
    const cell = this.pickAt(e)
    this.setHover(cell)
    if (!this.stroke || e.pointerId !== this.stroke.pointerId || cell < 0 || !this.maze) return
    if (cell === this.stroke.last) return
    // Fill the gap between pointer samples so fast strokes stay continuous.
    const w = this.maze.width
    let x0 = this.stroke.last % w
    let y0 = Math.floor(this.stroke.last / w)
    const x1 = cell % w
    const y1 = Math.floor(cell / w)
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    while (x0 !== x1 || y0 !== y1) {
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
      this.handlers.onStroke?.(y0 * w + x0)
    }
    this.stroke.last = cell
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.stroke || e.pointerId !== this.stroke.pointerId) return
    this.stroke = null
    if (this.container.hasPointerCapture(e.pointerId)) this.container.releasePointerCapture(e.pointerId)
    this.handlers.onStrokeEnd?.()
  }

  private onPointerLeave = () => {
    if (!this.stroke) this.setHover(-1)
  }

  private onContextMenu = (e: Event) => e.preventDefault()
}
