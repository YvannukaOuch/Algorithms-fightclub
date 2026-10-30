import type { AlgorithmId } from './algorithms'

/** Cell values shared with the C++ engine (enum Cell in engine/src/common.hpp). */
export const Cell = {
  Floor: 0,
  Wall: 1,
  Mud: 2,
} as const
export type CellValue = (typeof Cell)[keyof typeof Cell]

export const CELL_COST = { floor: 1, mud: 5 } as const

/** Trace opcodes (enum Op in engine/src/trace.hpp). */
export const Op = {
  Open: 1,
  Update: 2,
  Close: 3,
  Path: 4,
  OpenB: 5,
  CloseB: 6,
} as const

export const opOf = (event: number) => event >>> 24
export const cellOf = (event: number) => event & 0xffffff

export interface Maze {
  width: number
  height: number
  cells: Uint8Array
  start: number
  goal: number
}

export interface SolveStats {
  found: boolean
  expanded: number
  discovered: number
  maxFrontier: number
  /** Cells on the path, including start and goal. */
  pathLength: number
  /** Sum of the cost of every cell entered after the start. */
  pathCost: number
  events: number
  updates: number
}

export interface SolveResult {
  stats: SolveStats
  events: Uint32Array
  path: Int32Array
}

/** A solver run prepared for playback. */
export interface FighterTrace {
  algorithm: AlgorithmId
  stats: SolveStats
  events: Uint32Array
  /** Index into `events` of every expansion (one lockstep "step"). */
  stepStarts: Uint32Array
  /** Index of the first path event, or events.length when no path was found. */
  searchEnd: number
  path: Int32Array
}

export interface ArenaAnalysis {
  /** Open cells reachable from the start. */
  reachable: number
  /** Cheapest possible path cost, or null when the goal is unreachable. */
  optimalCost: number | null
  /** Fewest possible moves, or null when the goal is unreachable. */
  optimalSteps: number | null
}

export interface BenchResult {
  algorithm: AlgorithmId
  /** Median wall time of one run, in microseconds. */
  medianUs: number
  minUs: number
  maxUs: number
  runsPerBatch: number
  batches: number
}
