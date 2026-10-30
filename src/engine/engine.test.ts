import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ALGORITHMS, type AlgorithmId } from './algorithms'
import { ArenaEngine, EngineError } from './engine'
import { GENERATORS } from './generators'
import { eventBoundary, prepareTrace, stepCount } from './trace'
import { Cell, CELL_COST, Op, cellOf, opOf, type Maze, type SolveResult } from './types'

let engine: ArenaEngine

beforeAll(async () => {
  engine = await ArenaEngine.instantiate(readFileSync(new URL('./arena.wasm', import.meta.url)))
})

const cost = (maze: Maze, cell: number) => (maze.cells[cell] === Cell.Mud ? CELL_COST.mud : CELL_COST.floor)

function expectValidPath(maze: Maze, result: SolveResult) {
  const { path, stats } = result
  expect(stats.found).toBe(true)
  expect(path.length).toBe(stats.pathLength)
  expect(path[0]).toBe(maze.start)
  expect(path[path.length - 1]).toBe(maze.goal)
  let total = 0
  for (let i = 0; i < path.length; i++) {
    expect(maze.cells[path[i]]).not.toBe(Cell.Wall)
    if (i === 0) continue
    const a = path[i - 1]
    const b = path[i]
    const dx = Math.abs((a % maze.width) - (b % maze.width))
    const dy = Math.abs(Math.floor(a / maze.width) - Math.floor(b / maze.width))
    expect(dx + dy).toBe(1)
    total += cost(maze, b)
  }
  expect(total).toBe(stats.pathCost)
}

function countOps(events: Uint32Array) {
  const counts = new Map<number, number>()
  for (const e of events) counts.set(opOf(e), (counts.get(opOf(e)) ?? 0) + 1)
  return (op: number) => counts.get(op) ?? 0
}

describe('generators', () => {
  it('are deterministic for a given seed', () => {
    for (const g of GENERATORS) {
      const params = { generator: g.id, width: 31, height: 31, seed: 1234, loops: 10, mud: 15 }
      const a = engine.generate(params)
      const b = engine.generate(params)
      const c = engine.generate({ ...params, seed: 4321 })
      expect(a.cells).toEqual(b.cells)
      if (g.id !== 'open' && g.id !== 'deadend') expect(a.cells).not.toEqual(c.cells)
    }
  })

  it('keep endpoints open and the border walled', () => {
    for (const g of GENERATORS) {
      for (const size of [21, 41]) {
        const maze = engine.generate({ generator: g.id, width: size, height: size, seed: 7, loops: 0, mud: 20 })
        expect(maze.cells[maze.start]).toBe(Cell.Floor)
        expect(maze.cells[maze.goal]).toBe(Cell.Floor)
        for (let i = 0; i < size; i++) {
          expect(maze.cells[i]).toBe(Cell.Wall)
          expect(maze.cells[(size - 1) * size + i]).toBe(Cell.Wall)
          expect(maze.cells[i * size]).toBe(Cell.Wall)
          expect(maze.cells[i * size + size - 1]).toBe(Cell.Wall)
        }
      }
    }
  })

  it('build perfect mazes (a spanning tree) when loops are off', () => {
    for (const g of GENERATORS.filter((x) => x.maze)) {
      const maze = engine.generate({ generator: g.id, width: 31, height: 31, seed: 99, loops: 0, mud: 0 })
      let open = 0
      let edges = 0
      for (let i = 0; i < maze.cells.length; i++) {
        if (maze.cells[i] === Cell.Wall) continue
        open++
        if (maze.cells[i + 1] !== Cell.Wall && (i + 1) % 31 !== 0) edges++
        if (i + 31 < maze.cells.length && maze.cells[i + 31] !== Cell.Wall) edges++
      }
      expect(engine.reachable(maze)).toBe(open)
      expect(edges).toBe(open - 1)
    }
  })

  it('add loops and mud on request', () => {
    const plain = engine.generate({ generator: 'backtracker', width: 41, height: 41, seed: 5, loops: 0, mud: 0 })
    const braided = engine.generate({ generator: 'backtracker', width: 41, height: 41, seed: 5, loops: 30, mud: 25 })
    const walls = (m: Maze) => m.cells.filter((c) => c === Cell.Wall).length
    const mud = braided.cells.filter((c) => c === Cell.Mud).length
    const open = braided.cells.filter((c) => c !== Cell.Wall).length
    expect(walls(braided)).toBeLessThan(walls(plain))
    expect(mud / open).toBeGreaterThan(0.15)
    expect(mud / open).toBeLessThan(0.35)
  })

  it('always connect start and goal', () => {
    for (const g of GENERATORS) {
      for (let seed = 1; seed <= 12; seed++) {
        const maze = engine.generate({ generator: g.id, width: 31, height: 31, seed, loops: 5, mud: 10 })
        expect(engine.solve('bfs', maze, false).stats.found).toBe(true)
      }
    }
  })
})

describe('solvers', () => {
  const cases: Maze[] = []
  beforeAll(() => {
    for (const g of GENERATORS) {
      for (const seed of [3, 17, 2024]) {
        cases.push(engine.generate({ generator: g.id, width: 31, height: 31, seed, loops: 12, mud: 18 }))
      }
    }
  })

  it('return valid paths', () => {
    for (const maze of cases) for (const a of ALGORITHMS) expectValidPath(maze, engine.solve(a.id, maze))
  })

  it('honour their optimality guarantees', () => {
    for (const maze of cases) {
      const r = Object.fromEntries(ALGORITHMS.map((a) => [a.id, engine.solve(a.id, maze).stats])) as Record<
        AlgorithmId,
        SolveResult['stats']
      >
      const best = r.dijkstra.pathCost
      const fewest = r.bfs.pathLength
      expect(r.astar.pathCost).toBe(best)
      expect(r.wastar.pathCost).toBeLessThanOrEqual(2 * best)
      expect(r.bidir.pathLength).toBe(fewest)
      for (const a of ALGORITHMS) {
        expect(r[a.id].pathCost).toBeGreaterThanOrEqual(best)
        expect(r[a.id].pathLength).toBeGreaterThanOrEqual(fewest)
      }
      // A* never expands more than Dijkstra with a consistent heuristic (same tie-breaking aside).
      expect(r.astar.expanded).toBeLessThanOrEqual(r.dijkstra.expanded)
    }
  })

  it('emit traces that agree with their stats', () => {
    for (const maze of cases) {
      for (const a of ALGORITHMS) {
        const res = engine.solve(a.id, maze)
        const n = countOps(res.events)
        expect(res.events.length).toBe(res.stats.events)
        expect(n(Op.Close) + n(Op.CloseB)).toBe(res.stats.expanded)
        expect(n(Op.Open) + n(Op.OpenB)).toBe(res.stats.discovered)
        expect(n(Op.Update)).toBe(res.stats.updates)
        expect(n(Op.Path)).toBe(res.stats.pathLength)
        expect(opOf(res.events[0])).toBe(Op.Open)
        expect(cellOf(res.events[0])).toBe(maze.start)
        const pathEvents = Array.from(res.events.subarray(res.events.length - res.stats.pathLength), cellOf)
        expect(pathEvents).toEqual(Array.from(res.path))
      }
    }
  })

  it('match the untraced build exactly', () => {
    for (const maze of cases.slice(0, 6)) {
      for (const a of ALGORITHMS) {
        const traced = engine.solve(a.id, maze, true).stats
        const plain = engine.solve(a.id, maze, false).stats
        expect({ ...plain, events: 0 }).toEqual({ ...traced, events: 0 })
      }
    }
  })

  it('report no path when the goal is walled off', () => {
    const maze = engine.generate({ generator: 'open', width: 21, height: 21, seed: 1, loops: 0, mud: 0 })
    const gx = maze.goal % 21
    const gy = Math.floor(maze.goal / 21)
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) maze.cells[(gy + dy) * 21 + gx + dx] = Cell.Wall
    for (const a of ALGORITHMS) {
      const res = engine.solve(a.id, maze)
      expect(res.stats.found).toBe(false)
      expect(res.path.length).toBe(0)
      expect(countOps(res.events)(Op.Path)).toBe(0)
    }
  })

  it('handle start == goal', () => {
    const maze = engine.generate({ generator: 'open', width: 9, height: 9, seed: 1, loops: 0, mud: 0 })
    maze.goal = maze.start
    for (const a of ALGORITHMS) {
      const res = engine.solve(a.id, maze)
      expect(res.stats.found).toBe(true)
      expect(Array.from(res.path)).toEqual([maze.start])
      expect(res.stats.pathCost).toBe(0)
    }
  })

  it('reject endpoints inside walls', () => {
    const maze = engine.generate({ generator: 'backtracker', width: 21, height: 21, seed: 1, loops: 0, mud: 0 })
    maze.start = 0
    expect(() => engine.solve('astar', maze)).toThrow(EngineError)
  })

  it('show the textbook behaviour on open floor', () => {
    const maze = engine.generate({ generator: 'open', width: 41, height: 41, seed: 1, loops: 0, mud: 0 })
    const astar = engine.solve('astar', maze).stats
    const greedy = engine.solve('greedy', maze).stats
    const bfs = engine.solve('bfs', maze).stats
    const dfs = engine.solve('dfs', maze).stats
    // With deeper-first tie-breaking A* walks a straight line instead of flooding.
    expect(astar.expanded).toBe(astar.pathLength)
    expect(greedy.expanded).toBe(greedy.pathLength)
    expect(bfs.expanded).toBeGreaterThan(10 * astar.expanded)
    // DFS wanders off along the walls before it stumbles onto the goal.
    expect(dfs.pathCost).toBeGreaterThan(2 * astar.pathCost)
  })

  it('make the dead end expensive for heuristic searches', () => {
    const cup = engine.generate({ generator: 'deadend', width: 41, height: 41, seed: 1, loops: 0, mud: 0 })
    for (const id of ['astar', 'greedy', 'wastar'] as const) {
      const s = engine.solve(id, cup).stats
      // They flood the cup: several times more expansions than cells on the path.
      expect(s.expanded).toBeGreaterThan(3 * s.pathLength)
    }
    const bfs = engine.solve('bfs', cup).stats
    expect(engine.solve('astar', cup).stats.expanded).toBeLessThan(bfs.expanded)
  })
})

describe('trace playback helpers', () => {
  it('split traces into one step per expansion', () => {
    const maze = engine.generate({ generator: 'backtracker', width: 31, height: 31, seed: 8, loops: 10, mud: 10 })
    for (const a of ALGORITHMS) {
      const trace = prepareTrace(a.id, engine.solve(a.id, maze))
      expect(stepCount(trace)).toBe(trace.stats.expanded)
      expect(trace.searchEnd).toBe(trace.events.length - trace.stats.pathLength)
      expect(eventBoundary(trace, 0)).toBeGreaterThanOrEqual(1)
      expect(eventBoundary(trace, stepCount(trace))).toBe(trace.searchEnd)
      for (let s = 1; s < stepCount(trace); s++) {
        expect(eventBoundary(trace, s)).toBeGreaterThan(eventBoundary(trace, s - 1))
      }
    }
  })
})

describe('benchmark', () => {
  it('produces a sane per-run timing', () => {
    const maze = engine.generate({ generator: 'backtracker', width: 31, height: 31, seed: 1, loops: 10, mud: 10 })
    const r = engine.bench('astar', maze, { minBatchMs: 5, batches: 3 })
    expect(r.medianUs).toBeGreaterThan(0)
    expect(r.minUs).toBeLessThanOrEqual(r.medianUs)
    expect(r.maxUs).toBeGreaterThanOrEqual(r.medianUs)
  })
})
