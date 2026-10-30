import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { TileState } from '@/arena3d/tiles'
import type { AlgorithmId } from '@/engine/algorithms'
import { ArenaEngine } from '@/engine/engine'
import { prepareTrace, stepCount } from '@/engine/trace'
import type { BenchResult, FighterTrace } from '@/engine/types'
import { DEFAULT_PARAMS } from '@/state/store'
import { FightPlayer, PATH_SECONDS, type PlayerSnapshot, type RingSink } from './player'

class FakeRing implements RingSink {
  states = new Map<number, number>()
  finished: boolean | null = null
  progress = 0
  resetTrace() {
    this.states.clear()
    this.finished = null
    this.progress = 0
  }
  setCell(cell: number, state: number) {
    this.states.set(cell, state)
  }
  preparePath() {}
  setPathProgress(p: number) {
    this.progress = p
  }
  markFinished(found: boolean) {
    this.finished = found
  }
  count(state: number) {
    let n = 0
    for (const s of this.states.values()) if (s === state) n++
    return n
  }
}

const lineup: AlgorithmId[] = ['astar', 'dijkstra', 'bfs']
let traces: FighterTrace[]

beforeAll(async () => {
  const engine = await ArenaEngine.instantiate(readFileSync(new URL('../engine/arena.wasm', import.meta.url)))
  const p = DEFAULT_PARAMS
  const maze = engine.generate({ generator: p.generator, width: p.size, height: p.size, seed: p.seed, loops: p.loops, mud: p.mud })
  traces = lineup.map((a) => prepareTrace(a, engine.solve(a, maze)))
})

function setup() {
  const snapshots: PlayerSnapshot[] = []
  let finishes = 0
  const player = new FightPlayer(
    (s) => snapshots.push(s),
    () => finishes++,
  )
  const rings = lineup.map(() => new FakeRing())
  player.attach(rings)
  return { player, rings, snapshots, finishes: () => finishes }
}

const bench = (us: Partial<Record<AlgorithmId, number>>) =>
  Object.fromEntries(
    Object.entries(us).map(([a, t]) => [a, { algorithm: a, medianUs: t, minUs: t, maxUs: t, runsPerBatch: 1, batches: 1 } as BenchResult]),
  ) as Partial<Record<AlgorithmId, BenchResult>>

describe('FightPlayer', () => {
  it('ranks lockstep fights by expansions', () => {
    const { player, snapshots } = setup()
    player.load(traces, 'lockstep', null)
    player.seek(player.end)
    const places = snapshots.at(-1)!.live.map((l) => l.place)
    // Default arena: A* 222, Dijkstra 434, BFS 462 expansions.
    expect(places).toEqual([1, 2, 3])
    expect(player.end).toBe(Math.max(...traces.map(stepCount)))
  })

  it('applies exactly one expansion per lockstep step, forwards and backwards', () => {
    const { player, rings } = setup()
    player.load(traces, 'lockstep', null)
    player.seek(40)
    for (const ring of rings) expect(ring.count(TileState.Closed)).toBe(40)
    player.seek(15)
    for (const ring of rings) expect(ring.count(TileState.Closed)).toBe(15)
    player.step(1)
    for (const ring of rings) expect(ring.count(TileState.Closed)).toBe(16)
    player.step(-1)
    player.step(-1)
    for (const ring of rings) expect(ring.count(TileState.Closed)).toBe(14)
  })

  it('reveals the whole path when seeking past the finish', () => {
    const { player, rings } = setup()
    player.load(traces, 'lockstep', null)
    player.seek(traces[0].stats.expanded)
    expect(rings[0].finished).toBe(true)
    expect(rings[0].progress).toBe(1)
    expect(rings[0].count(TileState.Path)).toBe(traces[0].stats.pathLength)
    expect(rings[1].finished).toBeNull()
  })

  it('plays to the end, draws paths, then finishes once', () => {
    const { player, rings, finishes } = setup()
    player.load(traces, 'lockstep', null)
    player.setSpeed(400)
    player.play()
    for (let i = 0; i < 400 && finishes() === 0; i++) player.tick(1 / 30)
    expect(finishes()).toBe(1)
    expect(player.playing).toBe(false)
    for (const ring of rings) expect(ring.progress).toBe(1)
    player.tick(1)
    expect(finishes()).toBe(1)
    // Pressing play again restarts from the first step.
    player.play()
    expect(player.tau).toBe(0)
    expect(rings[0].count(TileState.Closed)).toBe(0)
  })

  it('ranks real-time fights by measured speed', () => {
    const { player, snapshots } = setup()
    player.load(traces, 'realtime', bench({ astar: 12, dijkstra: 18, bfs: 8 }))
    expect(player.mode).toBe('realtime')
    player.seek(player.end)
    expect(snapshots.at(-1)!.live.map((l) => l.place)).toEqual([2, 3, 1])
  })

  it('falls back to lockstep when a fighter has no timing', () => {
    const { player } = setup()
    player.load(traces, 'realtime', bench({ astar: 12 }))
    expect(player.mode).toBe('lockstep')
  })

  it('gives tied fighters the same place', () => {
    const snapshots: PlayerSnapshot[] = []
    const player = new FightPlayer(
      (s) => snapshots.push(s),
      () => {},
    )
    player.attach([new FakeRing(), new FakeRing()])
    player.load([traces[0], traces[0]], 'lockstep', null)
    player.seek(player.end)
    expect(snapshots.at(-1)!.live.map((l) => l.place)).toEqual([1, 1])
  })

  it('stamps tiles so the newest expansion is the freshest', () => {
    const stamps = new Map<number, number>()
    const ring: RingSink = {
      resetTrace: () => stamps.clear(),
      setCell: (cell, state, t0) => {
        if (state === TileState.Closed) stamps.set(cell, t0)
      },
      preparePath: () => {},
      setPathProgress: () => {},
      markFinished: () => {},
    }
    const player = new FightPlayer(
      () => {},
      () => {},
    )
    player.attach([ring])
    player.load([traces[0]], 'lockstep', null)
    player.setSpeed(10)
    player.play()
    player.tick(1) // ten steps in one frame
    const times = [...stamps.values()]
    expect(times).toHaveLength(10)
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
    expect(times.at(-1)).toBeCloseTo(player.clock, 5)
    expect(PATH_SECONDS).toBeGreaterThan(0)
  })
})
