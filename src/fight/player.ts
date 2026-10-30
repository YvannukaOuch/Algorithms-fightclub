import { TileState } from '@/arena3d/tiles'
import type { AlgorithmId } from '@/engine/algorithms'
import { eventBoundary, stepCount } from '@/engine/trace'
import { Op, cellOf, opOf, type BenchResult, type FighterTrace } from '@/engine/types'

/**
 * lockstep: every fighter makes one expansion per tick, so the race compares
 * work done. realtime: fighters advance in proportion to their benchmarked
 * wall-clock time, so the race compares actual speed.
 */
export type SyncMode = 'lockstep' | 'realtime'

export interface LiveFighter {
  algorithm: AlgorithmId
  expanded: number
  frontier: number
  /** Search complete (the path may still be drawing). */
  done: boolean
  /** 1-based finishing place, revealed when done; null if no path exists. */
  place: number | null
}

export interface PlayerSnapshot {
  /** Playback position in lockstep steps. */
  tau: number
  end: number
  playing: boolean
  finished: boolean
  live: LiveFighter[]
}

/** What the player needs from a ring; the 3D Ring implements it. */
export interface RingSink {
  resetTrace(): void
  setCell(cell: number, state: number, t0: number, order?: number): void
  preparePath(path: Int32Array): void
  setPathProgress(p: number): void
  markFinished(found: boolean): void
}

/** Seconds the path takes to draw once a fighter reaches the goal. */
export const PATH_SECONDS = 0.9
const PUBLISH_INTERVAL = 1 / 15

interface Runner {
  trace: FighterTrace
  total: number
  /** Playback position at which this fighter's search completes. */
  finishTau: number
  /** Steps per unit of tau. */
  rate: number
  applied: number
  expanded: number
  frontier: number
  done: boolean
  doneClock: number
  pathShown: number
  place: number | null
}

/**
 * Replays engine traces onto the rings. Playback position (tau) is measured in
 * lockstep steps and advances at `speed` steps per second. Each event's tile is
 * stamped with the playback-clock time it happened at, which the tile shader
 * turns into the flash, pop and settle; scrubbing re-stamps consistently.
 */
export class FightPlayer {
  tau = 0
  end = 0
  playing = false
  speed = 40
  mode: SyncMode = 'lockstep'
  /** Advances only while playing; drives tile animation. */
  clock = 0

  private runners: Runner[] = []
  private rings: readonly RingSink[] = []
  private sinceBroadcast = 0
  private finished = false
  private readonly onUpdate: (s: PlayerSnapshot) => void
  private readonly onFinish: () => void

  constructor(onUpdate: (s: PlayerSnapshot) => void, onFinish: () => void) {
    this.onUpdate = onUpdate
    this.onFinish = onFinish
  }

  get loaded() {
    return this.runners.length > 0
  }

  attach(rings: readonly RingSink[]) {
    this.rings = rings
  }

  load(traces: FighterTrace[], mode: SyncMode, bench: Partial<Record<AlgorithmId, BenchResult>> | null) {
    this.mode = mode
    const lockEnd = Math.max(1, ...traces.map(stepCount))
    const times = traces.map((t) => bench?.[t.algorithm]?.medianUs ?? 0)
    const slowest = Math.max(...times)
    const realtime = mode === 'realtime' && slowest > 0 && times.every((t) => t > 0)
    this.mode = realtime ? 'realtime' : 'lockstep'

    this.runners = traces.map((trace, i) => {
      const total = stepCount(trace)
      // Real time: the slowest fighter takes as long as the longest lockstep
      // search would, and everyone else finishes in proportion to their time.
      const finishTau = realtime ? Math.max(1, (times[i] / slowest) * lockEnd) : Math.max(total, 1)
      return {
        trace,
        total,
        finishTau,
        rate: total / finishTau,
        applied: 0,
        expanded: 0,
        frontier: 0,
        done: false,
        doneClock: 0,
        pathShown: 0,
        place: null,
      }
    })

    // Places by finishing position; equal finishes share a place.
    const order = this.runners
      .map((r, i) => ({ i, at: r.finishTau, found: r.trace.stats.found }))
      .filter((r) => r.found)
      .sort((a, b) => a.at - b.at)
    let place = 0
    let prev = -1
    order.forEach((r, k) => {
      if (Math.abs(r.at - prev) > 1e-6) place = k + 1
      prev = r.at
      this.runners[r.i].place = place
    })

    this.end = Math.max(...this.runners.map((r) => r.finishTau))
    this.tau = 0
    this.clock = 0
    this.finished = false
    this.playing = false
    for (const ring of this.rings) ring.resetTrace()
    this.apply()
    this.broadcast()
  }

  unload() {
    this.runners = []
    this.playing = false
    this.finished = false
    this.tau = 0
    this.end = 0
    for (const ring of this.rings) ring.resetTrace()
  }

  play() {
    if (!this.loaded) return
    if (this.finished || this.tau >= this.end) this.restart()
    this.playing = true
    this.broadcast()
  }

  pause() {
    this.playing = false
    this.broadcast()
  }

  /** Back to the first step, keeping the loaded traces. */
  restart() {
    this.seek(0)
    this.finished = false
  }

  seek(tau: number) {
    if (!this.loaded) return
    this.tau = Math.max(0, Math.min(this.end, tau))
    this.finished = false
    this.apply()
    this.broadcast()
  }

  /** One lockstep step in either direction (a slice of the timeline in real time). */
  step(direction: 1 | -1) {
    if (!this.loaded) return
    this.playing = false
    const unit = this.mode === 'lockstep' ? 1 : Math.max(this.end / 240, 0.5)
    const next = direction > 0 ? Math.floor(this.tau / unit + 1e-6) + 1 : Math.ceil(this.tau / unit - 1e-6) - 1
    this.seek(next * unit)
  }

  setSpeed(stepsPerSecond: number) {
    this.speed = stepsPerSecond
  }

  tick(dt: number) {
    if (!this.loaded) return
    if (this.playing) {
      this.clock += dt
      this.tau = Math.min(this.end, this.tau + this.speed * dt)
      this.apply()
      const drawing = this.runners.some((r) => r.done && r.pathShown < r.trace.path.length)
      if (this.tau >= this.end && !drawing && !this.finished) {
        this.finished = true
        this.playing = false
        this.broadcast()
        this.onFinish()
        return
      }
    }
    this.sinceBroadcast += dt
    if (this.sinceBroadcast >= PUBLISH_INTERVAL && this.playing) this.broadcast()
  }

  private apply() {
    for (let i = 0; i < this.runners.length; i++) {
      const ring = this.rings[i]
      if (ring) this.applyRunner(this.runners[i], ring)
    }
  }

  private applyRunner(r: Runner, ring: RingSink) {
    const steps = Math.min(r.total, Math.floor(this.tau * r.rate + 1e-9))
    const target = eventBoundary(r.trace, steps)

    if (target < r.applied) {
      ring.resetTrace()
      r.applied = 0
      r.expanded = 0
      r.frontier = 0
      r.done = false
      r.pathShown = 0
    }

    const { events } = r.trace
    const stampFor = (step: number) => this.clock - (this.tau - step / r.rate) / this.speed
    for (let i = r.applied; i < target; i++) {
      const e = events[i]
      const cell = cellOf(e)
      switch (opOf(e)) {
        case Op.Open:
          ring.setCell(cell, TileState.Open, stampFor(r.expanded))
          r.frontier++
          break
        case Op.OpenB:
          ring.setCell(cell, TileState.OpenB, stampFor(r.expanded))
          r.frontier++
          break
        case Op.Update:
          ring.setCell(cell, TileState.Open, stampFor(r.expanded))
          break
        case Op.Close:
        case Op.CloseB:
          r.expanded++
          r.frontier--
          ring.setCell(
            cell,
            opOf(e) === Op.Close ? TileState.Closed : TileState.ClosedB,
            stampFor(r.expanded),
            r.expanded / Math.max(1, r.total),
          )
          break
      }
    }
    r.applied = target

    // Search complete: reveal the path. Live playback draws it over PATH_SECONDS;
    // landing here by seeking shows it whole.
    if (!r.done && steps >= r.total) {
      r.done = true
      r.doneClock = this.playing ? this.clock : this.clock - PATH_SECONDS
      ring.preparePath(r.trace.path)
      ring.markFinished(r.trace.stats.found)
      this.broadcast()
    }
    if (r.done && r.pathShown < r.trace.path.length) {
      const p = Math.min(1, (this.clock - r.doneClock) / PATH_SECONDS)
      const upto = Math.round(p * r.trace.path.length)
      for (let k = r.pathShown; k < upto; k++) ring.setCell(r.trace.path[k], TileState.Path, this.clock)
      r.pathShown = upto
      ring.setPathProgress(p)
    }
  }

  private broadcast() {
    this.sinceBroadcast = 0
    this.onUpdate({
      tau: this.tau,
      end: this.end,
      playing: this.playing,
      finished: this.finished,
      live: this.runners.map((r) => ({
        algorithm: r.trace.algorithm,
        expanded: r.expanded,
        frontier: Math.max(0, r.frontier),
        done: r.done,
        place: r.done ? r.place : null,
      })),
    })
  }
}
