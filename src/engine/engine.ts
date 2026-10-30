import { ALGORITHM_BY_ID, type AlgorithmId } from './algorithms'
import { GENERATOR_BY_ID, type GeneratorId } from './generators'
import type { BenchResult, Maze, SolveResult, SolveStats } from './types'

interface EngineExports {
  memory: WebAssembly.Memory
  fc_version(): number
  fc_max_dim(): number
  fc_max_events(): number
  fc_cells_ptr(): number
  fc_events_ptr(): number
  fc_stats_ptr(): number
  fc_path_ptr(): number
  fc_meta_ptr(): number
  fc_generate(which: number, w: number, h: number, seed: number, loops: number, mud: number): number
  fc_solve(algo: number, w: number, h: number, start: number, goal: number, record: number): number
  fc_bench(algo: number, w: number, h: number, start: number, goal: number, reps: number): number
  fc_reachable(w: number, h: number, start: number): number
}

const ERRORS: Record<number, string> = {
  [-1]: 'Arena size is out of range.',
  [-2]: 'Unknown algorithm or generator.',
  [-3]: 'Start or goal is outside the arena.',
  [-4]: 'Start or goal is inside a wall.',
  [-5]: 'The trace outgrew the event buffer.',
}

export class EngineError extends Error {
  readonly code: number
  constructor(code: number) {
    super(ERRORS[code] ?? `Engine error ${code}`)
    this.code = code
  }
}

export interface GenerateParams {
  generator: GeneratorId
  width: number
  height: number
  seed: number
  /** Percent of separating walls knocked out to create loops (mazes only). */
  loops: number
  /** Percent of open floor turned into mud. */
  mud: number
}

export interface BenchOptions {
  /** Each timed batch runs until at least this long, to beat coarse timers. */
  minBatchMs?: number
  batches?: number
  now?: () => number
}

/**
 * Typed wrapper over the WebAssembly engine. Inputs are written into, and
 * results read from, the module's static buffers, so a call is a few memcpys
 * plus the search itself.
 */
export class ArenaEngine {
  readonly maxDim: number
  private readonly x: EngineExports
  private readonly cellsPtr: number
  private readonly eventsPtr: number
  private readonly statsPtr: number
  private readonly pathPtr: number
  private readonly metaPtr: number

  private constructor(exports: EngineExports) {
    this.x = exports
    this.maxDim = exports.fc_max_dim()
    this.cellsPtr = exports.fc_cells_ptr()
    this.eventsPtr = exports.fc_events_ptr()
    this.statsPtr = exports.fc_stats_ptr()
    this.pathPtr = exports.fc_path_ptr()
    this.metaPtr = exports.fc_meta_ptr()
  }

  static async instantiate(source: BufferSource | Response | PromiseLike<Response>): Promise<ArenaEngine> {
    let instance: WebAssembly.Instance
    if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) {
      instance = (await WebAssembly.instantiate(source, {})).instance
    } else {
      const response = await source
      try {
        instance = (await WebAssembly.instantiateStreaming(response.clone(), {})).instance
      } catch {
        // Some hosts serve .wasm without application/wasm; fall back to bytes.
        instance = (await WebAssembly.instantiate(await response.arrayBuffer(), {})).instance
      }
    }
    return new ArenaEngine(instance.exports as unknown as EngineExports)
  }

  // The memory never grows, but views are cheap and this stays correct if it ever does.
  private u8(ptr: number, len: number) {
    return new Uint8Array(this.x.memory.buffer, ptr, len)
  }
  private i32(ptr: number, len: number) {
    return new Int32Array(this.x.memory.buffer, ptr, len)
  }
  private u32(ptr: number, len: number) {
    return new Uint32Array(this.x.memory.buffer, ptr, len)
  }

  private check(code: number) {
    if (code < 0) throw new EngineError(code)
    return code
  }

  private load(maze: Maze) {
    const n = maze.width * maze.height
    if (maze.cells.length !== n) throw new Error('Maze cells do not match its size.')
    this.u8(this.cellsPtr, n).set(maze.cells)
  }

  generate(p: GenerateParams): Maze {
    const info = GENERATOR_BY_ID[p.generator]
    this.check(this.x.fc_generate(info.engineId, p.width, p.height, p.seed >>> 0, p.loops, p.mud))
    const meta = this.i32(this.metaPtr, 2)
    return {
      width: p.width,
      height: p.height,
      cells: this.u8(this.cellsPtr, p.width * p.height).slice(),
      start: meta[0],
      goal: meta[1],
    }
  }

  private readStats(): SolveStats {
    const s = this.i32(this.statsPtr, 8)
    return {
      found: s[0] === 1,
      expanded: s[1],
      discovered: s[2],
      maxFrontier: s[3],
      pathLength: s[4],
      pathCost: s[5],
      events: s[6],
      updates: s[7],
    }
  }

  solve(algorithm: AlgorithmId, maze: Maze, record = true): SolveResult {
    this.load(maze)
    const algo = ALGORITHM_BY_ID[algorithm].engineId
    const count = this.check(this.x.fc_solve(algo, maze.width, maze.height, maze.start, maze.goal, record ? 1 : 0))
    const stats = this.readStats()
    return {
      stats,
      events: record ? this.u32(this.eventsPtr, count).slice() : new Uint32Array(0),
      path: this.i32(this.pathPtr, stats.found ? stats.pathLength : 0).slice(),
    }
  }

  reachable(maze: Maze): number {
    this.load(maze)
    return this.check(this.x.fc_reachable(maze.width, maze.height, maze.start))
  }

  /**
   * Times the untraced solver. Runs are batched until a batch takes at least
   * `minBatchMs`, because browsers deliberately coarsen performance.now(); the
   * reported figure is the median per-run time across batches.
   */
  bench(algorithm: AlgorithmId, maze: Maze, options: BenchOptions = {}): BenchResult {
    const { minBatchMs = 25, batches = 7, now = () => performance.now() } = options
    this.load(maze)
    const algo = ALGORITHM_BY_ID[algorithm].engineId
    const run = (reps: number) => {
      const t0 = now()
      this.check(this.x.fc_bench(algo, maze.width, maze.height, maze.start, maze.goal, reps))
      return now() - t0
    }

    run(3) // warm-up: let the JIT tier up the wasm
    let reps = 1
    for (;;) {
      const ms = run(reps)
      if (ms >= minBatchMs || reps >= 1 << 20) break
      reps = ms <= 0.5 ? reps * 16 : Math.min(reps * 16, Math.ceil((reps * minBatchMs * 1.15) / ms))
    }

    const samples: number[] = []
    for (let b = 0; b < batches; b++) samples.push((run(reps) * 1000) / reps)
    samples.sort((a, b) => a - b)
    return {
      algorithm,
      medianUs: samples[Math.floor(samples.length / 2)],
      minUs: samples[0],
      maxUs: samples[samples.length - 1],
      runsPerBatch: reps,
      batches,
    }
  }
}
