import { toast } from 'sonner'
import type { ArenaStage } from '@/arena3d/ArenaStage'
import { MAX_FIGHTERS, type AlgorithmId } from '@/engine/algorithms'
import { EngineClient } from '@/engine/client'
import type { GenerateParams } from '@/engine/engine'
import { Cell, type FighterTrace, type Maze } from '@/engine/types'
import { FightPlayer, type SyncMode } from '@/fight/player'
import { DEFAULT_PARAMS, useArena, type ArenaParams } from '@/state/store'
import { customFragment, paramsToHash, readHash } from './share'

const set = useArena.setState
const get = useArena.getState

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

function paramsOf(s: ArenaParams): ArenaParams {
  return { generator: s.generator, size: s.size, seed: s.seed, loops: s.loops, mud: s.mud }
}

function toGenerate(p: ArenaParams): GenerateParams {
  return { generator: p.generator, width: p.size, height: p.size, seed: p.seed, loops: p.loops, mud: p.mud }
}

export function randomSeed() {
  return Math.floor(Math.random() * 99999) + 1
}

/**
 * Orchestrates the app: owns the engine worker and the fight player, keeps the
 * stage in sync with the store, and implements every user command.
 */
class Session {
  private engine: EngineClient | null = null
  private stage: ArenaStage | null = null
  private readonly player = new FightPlayer(
    (s) => set({ tau: s.tau, end: s.end, live: s.live }),
    () => set({ phase: 'finished' }),
  )
  private traces: FighterTrace[] | null = null
  private prepareToken = 0
  private prepareTimer = 0
  private preparing: { token: number; job: Promise<void> } | null = null
  private generateToken = 0
  private stroke: { value: number | null; endpoint: 'start' | 'goal' | null; changed: boolean } | null = null
  private started = false

  start() {
    if (this.started) return
    this.started = true
    this.engine = new EngineClient()
    useArena.subscribe((s, prev) => {
      if (s.phase !== prev.phase) this.syncEditable()
    })
    void this.boot()
  }

  private async boot() {
    const shared = await readHash(location.hash)
    const params = { ...DEFAULT_PARAMS, ...shared.params }
    set({ ...params, fighters: shared.fighters ?? get().fighters })
    try {
      const maze = await this.engine!.generate(toGenerate(params))
      let edited = false
      if (shared.custom && shared.custom.cells.length === maze.cells.length && shared.custom.start !== shared.custom.goal) {
        maze.cells = shared.custom.cells
        maze.start = shared.custom.start
        maze.goal = shared.custom.goal
        maze.cells[maze.start] = maze.cells[maze.start] === Cell.Wall ? Cell.Floor : maze.cells[maze.start]
        maze.cells[maze.goal] = maze.cells[maze.goal] === Cell.Wall ? Cell.Floor : maze.cells[maze.goal]
        edited = true
      }
      set({ phase: 'setup', edited })
      this.installMaze(maze, 'intro')
    } catch (err) {
      set({ error: `The engine failed to start: ${message(err)}` })
    }
  }

  // --- Stage ----------------------------------------------------------------

  attachStage(stage: ArenaStage) {
    this.stage = stage
    stage.handlers = {
      onFrame: (dt) => {
        this.player.tick(dt)
        stage.playTime = this.player.clock
      },
      onStrokeStart: (cell, erase) => this.strokeStart(cell, erase),
      onStroke: (cell) => this.strokeMove(cell),
      onStrokeEnd: () => this.strokeEnd(),
    }
    const { maze, fighters } = get()
    if (maze) {
      stage.setMaze(maze, 'intro')
      stage.setFighters(fighters)
    }
    this.player.attach(stage.rings)
    // A rebuilt stage starts from a clean board.
    if (this.player.loaded) this.reset()
    this.syncEditable()
  }

  detachStage(stage: ArenaStage) {
    if (this.stage !== stage) return
    stage.handlers = {}
    this.stage = null
    this.player.attach([])
  }

  private syncEditable() {
    const phase = get().phase
    this.stage?.setEditable(phase === 'setup' || phase === 'finished')
  }

  // --- Arena ----------------------------------------------------------------

  private installMaze(maze: Maze, how: 'intro' | 'wave' | 'none') {
    this.player.unload()
    set((s) => ({
      maze,
      mazeVersion: s.mazeVersion + 1,
      phase: s.phase === 'loading' ? 'loading' : 'setup',
      live: [],
      tau: 0,
      end: 0,
    }))
    if (this.stage) {
      this.stage.setMaze(maze, how)
      this.stage.setFighters(get().fighters)
      this.player.attach(this.stage.rings)
    }
    this.schedulePrepare(0)
    this.syncHash()
  }

  async regenerate(patch: Partial<ArenaParams> = {}) {
    if (!this.engine) return
    const params = { ...paramsOf(get()), ...patch }
    set({ ...patch, edited: false, error: null })
    const token = ++this.generateToken
    try {
      const maze = await this.engine.generate(toGenerate(params))
      if (token !== this.generateToken) return
      const resized = get().maze?.width !== maze.width
      this.installMaze(maze, resized ? 'intro' : 'wave')
    } catch (err) {
      if (token === this.generateToken) set({ error: message(err) })
    }
  }

  newSeed() {
    void this.regenerate({ seed: randomSeed() })
  }

  // --- Lineup ---------------------------------------------------------------

  toggleFighter(id: AlgorithmId) {
    const { fighters } = get()
    let next: AlgorithmId[]
    if (fighters.includes(id)) {
      if (fighters.length === 1) return
      next = fighters.filter((f) => f !== id)
    } else {
      if (fighters.length >= MAX_FIGHTERS) return
      next = [...fighters, id]
    }
    this.player.unload()
    set({ fighters: next, phase: get().phase === 'loading' ? 'loading' : 'setup', live: [], tau: 0, end: 0 })
    if (this.stage) {
      this.stage.setFighters(next)
      this.player.attach(this.stage.rings)
    }
    this.schedulePrepare(0)
    this.syncHash()
  }

  // --- Traces ---------------------------------------------------------------

  private invalidate() {
    this.traces = null
    this.prepareToken++
    window.clearTimeout(this.prepareTimer)
    set({ prepared: false, analysis: null, results: [], bench: null })
  }

  private schedulePrepare(delay: number) {
    this.invalidate()
    this.prepareTimer = window.setTimeout(() => void this.prepare(), delay)
  }

  private prepare(): Promise<void> {
    const { maze, fighters } = get()
    if (!maze || !this.engine) return Promise.resolve()
    const token = this.prepareToken
    if (this.preparing?.token === token) return this.preparing.job
    const job = this.engine
      .prepare(maze, fighters)
      .then((res) => {
        if (token !== this.prepareToken) return
        this.traces = res.traces
        set({
          prepared: true,
          analysis: res.analysis,
          results: res.traces.map((t) => ({ algorithm: t.algorithm, stats: t.stats })),
        })
      })
      .catch((err) => {
        if (token === this.prepareToken) set({ error: message(err) })
      })
    this.preparing = { token, job }
    return job
  }

  private async ensurePrepared(): Promise<FighterTrace[] | null> {
    if (this.traces) return this.traces
    window.clearTimeout(this.prepareTimer)
    const token = this.prepareToken
    await this.prepare()
    return token === this.prepareToken ? this.traces : null
  }

  // --- Fight ----------------------------------------------------------------

  /** The primary action: fight, pause, resume or rematch depending on phase. */
  async primary() {
    const { phase } = get()
    if (phase === 'running') return this.pause()
    if (phase === 'paused') return this.resume()
    if (phase === 'finished') {
      this.player.restart()
      this.player.play()
      set({ phase: 'running' })
      return
    }
    if (phase === 'setup') await this.fight()
  }

  private async load(): Promise<boolean> {
    const token = this.prepareToken
    const traces = await this.ensurePrepared()
    if (!traces || token !== this.prepareToken) return false
    if (get().mode === 'realtime' && !this.hasBench()) {
      await this.benchmark()
      if (token !== this.prepareToken) return false
    }
    this.player.setSpeed(get().speed)
    this.player.load(traces, get().mode, get().bench)
    return true
  }

  async fight() {
    if (get().phase !== 'setup') return
    if (!(await this.load())) return
    this.player.play()
    set({ phase: 'running' })
  }

  pause() {
    this.player.pause()
    if (get().phase === 'running') set({ phase: 'paused' })
  }

  resume() {
    this.player.play()
    set({ phase: 'running' })
  }

  reset() {
    this.player.unload()
    set({ phase: get().phase === 'loading' ? 'loading' : 'setup', live: [], tau: 0, end: 0 })
  }

  async step(direction: 1 | -1) {
    const { phase } = get()
    if (phase === 'loading') return
    if (phase === 'setup') {
      if (direction < 0 || !(await this.load())) return
    }
    this.player.step(direction)
    set({ phase: 'paused' })
  }

  seek(tau: number) {
    if (!this.player.loaded) return
    this.player.pause()
    this.player.seek(tau)
    set({ phase: 'paused' })
  }

  setSpeed(speed: number) {
    set({ speed })
    this.player.setSpeed(speed)
  }

  async setMode(mode: SyncMode) {
    if (mode === get().mode) return
    set({ mode })
    if (mode === 'realtime' && !this.hasBench()) await this.benchmark()
    if (!this.player.loaded || !this.traces) return
    const fraction = this.player.end > 0 ? this.player.tau / this.player.end : 0
    const wasPlaying = this.player.playing
    this.player.load(this.traces, get().mode, get().bench)
    this.player.seek(fraction * this.player.end)
    if (wasPlaying) this.player.play()
  }

  private hasBench() {
    const { bench, fighters } = get()
    return !!bench && fighters.every((f) => bench[f])
  }

  async benchmark() {
    const { maze, fighters } = get()
    if (!maze || !this.engine || get().benchRunning) return
    const token = this.prepareToken
    set({ benchRunning: true })
    try {
      const results = await this.engine.bench(maze, fighters)
      if (token !== this.prepareToken) return
      set({ bench: Object.fromEntries(results.map((r) => [r.algorithm, r])) })
    } catch (err) {
      toast.error(`Benchmark failed: ${message(err)}`)
    } finally {
      set({ benchRunning: false })
    }
  }

  // --- Editing --------------------------------------------------------------

  private strokeStart(cell: number, erase: boolean) {
    const s = get()
    if (!s.maze || s.phase === 'running' || s.phase === 'paused' || s.phase === 'loading') return
    if (s.phase === 'finished') this.reset()
    const tool = erase ? 'erase' : s.tool
    if (tool === 'start' || tool === 'goal') {
      this.stroke = { value: null, endpoint: tool, changed: false }
      this.moveEndpoint(tool, cell)
      return
    }
    const current = s.maze.cells[cell]
    const value =
      tool === 'erase'
        ? Cell.Floor
        : tool === 'wall'
          ? current === Cell.Wall
            ? Cell.Floor
            : Cell.Wall
          : current === Cell.Mud
            ? Cell.Floor
            : Cell.Mud
    this.stroke = { value, endpoint: null, changed: false }
    this.paintCell(cell)
  }

  private strokeMove(cell: number) {
    if (!this.stroke) return
    if (this.stroke.endpoint) this.moveEndpoint(this.stroke.endpoint, cell)
    else this.paintCell(cell)
  }

  private strokeEnd() {
    if (this.stroke?.changed) this.schedulePrepare(40)
    this.stroke = null
  }

  private paintCell(cell: number) {
    const maze = get().maze
    if (!maze || !this.stroke || this.stroke.value === null) return
    if (cell === maze.start || cell === maze.goal || maze.cells[cell] === this.stroke.value) return
    maze.cells[cell] = this.stroke.value
    this.afterEdit(maze, 'pop')
  }

  private moveEndpoint(which: 'start' | 'goal', cell: number) {
    const maze = get().maze
    if (!maze) return
    if (cell === (which === 'start' ? maze.goal : maze.start)) return
    if (cell === (which === 'start' ? maze.start : maze.goal)) return
    if (maze.cells[cell] === Cell.Wall) maze.cells[cell] = Cell.Floor
    if (which === 'start') maze.start = cell
    else maze.goal = cell
    this.afterEdit(maze, 'none')
  }

  private afterEdit(maze: Maze, how: 'pop' | 'none') {
    if (this.stroke) this.stroke.changed = true
    this.invalidate()
    set((s) => ({ mazeVersion: s.mazeVersion + 1, edited: true }))
    this.stage?.setMaze(maze, how)
  }

  // --- Sharing --------------------------------------------------------------

  private syncHash() {
    const s = get()
    history.replaceState(null, '', paramsToHash(paramsOf(s), s.fighters))
  }

  async copyLink() {
    const s = get()
    try {
      const custom = s.edited && s.maze ? await customFragment(s.maze) : ''
      const url = `${location.origin}${location.pathname}${paramsToHash(paramsOf(s), s.fighters, custom)}`
      await navigator.clipboard.writeText(url)
      toast.success(s.edited ? 'Link copied, including your edits.' : 'Link copied.')
    } catch {
      toast.error('Could not copy the link. Copy it from the address bar instead.')
    }
  }

  resetView() {
    this.stage?.resetView()
  }
}

export const session = new Session()
