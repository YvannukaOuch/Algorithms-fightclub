import { create } from 'zustand'
import type { Quality } from '@/arena3d/ArenaStage'
import { DEFAULT_FIGHTERS, type AlgorithmId } from '@/engine/algorithms'
import type { ArenaSize, GeneratorId } from '@/engine/generators'
import type { ArenaAnalysis, BenchResult, Maze, SolveStats } from '@/engine/types'
import type { LiveFighter, SyncMode } from '@/fight/player'

export type Tool = 'wall' | 'erase' | 'mud' | 'start' | 'goal'
export type Phase = 'loading' | 'setup' | 'running' | 'paused' | 'finished'
export type ThemePreference = 'dark' | 'light' | 'system'

export interface ArenaParams {
  generator: GeneratorId
  size: ArenaSize
  seed: number
  loops: number
  mud: number
}

export interface FighterResult {
  algorithm: AlgorithmId
  stats: SolveStats
}

export interface ArenaState extends ArenaParams {
  maze: Maze | null
  /** Bumps on every change to the maze's cells or endpoints. */
  mazeVersion: number
  edited: boolean
  fighters: AlgorithmId[]
  tool: Tool
  phase: Phase
  mode: SyncMode
  speed: number
  /** Traces for the current maze and lineup are computed and ready. */
  prepared: boolean
  analysis: ArenaAnalysis | null
  /** Final stats per fighter, in lineup order (hidden in the UI until each finishes). */
  results: FighterResult[]
  live: LiveFighter[]
  tau: number
  end: number
  bench: Partial<Record<AlgorithmId, BenchResult>> | null
  benchRunning: boolean
  error: string | null
  themePreference: ThemePreference
  quality: Quality
}

// Seed 1469 tells the classic story with the default lineup: A* reaches the
// optimal path in about half Dijkstra's expansions, and BFS wades through mud
// to a path more than twice as expensive.
export const DEFAULT_PARAMS: ArenaParams = {
  generator: 'backtracker',
  size: 31,
  seed: 1469,
  loops: 12,
  mud: 12,
}

export const useArena = create<ArenaState>()(() => ({
  ...DEFAULT_PARAMS,
  maze: null,
  mazeVersion: 0,
  edited: false,
  fighters: [...DEFAULT_FIGHTERS],
  tool: 'wall',
  phase: 'loading',
  mode: 'lockstep',
  speed: 45,
  prepared: false,
  analysis: null,
  results: [],
  live: [],
  tau: 0,
  end: 0,
  bench: null,
  benchRunning: false,
  error: null,
  themePreference: 'system',
  quality: 'high',
}))
