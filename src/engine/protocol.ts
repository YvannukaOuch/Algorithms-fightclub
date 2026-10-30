import type { AlgorithmId } from './algorithms'
import type { GenerateParams } from './engine'
import type { ArenaAnalysis, BenchResult, FighterTrace, Maze } from './types'

export type EngineRequest =
  | { id: number; type: 'generate'; params: GenerateParams }
  | { id: number; type: 'prepare'; maze: Maze; algorithms: AlgorithmId[] }
  | { id: number; type: 'bench'; maze: Maze; algorithms: AlgorithmId[] }

export interface PrepareResult {
  traces: FighterTrace[]
  analysis: ArenaAnalysis
}

export type EngineResponse =
  | { id: number; ok: true; type: 'generate'; maze: Maze }
  | { id: number; ok: true; type: 'prepare'; result: PrepareResult }
  | { id: number; ok: true; type: 'bench'; results: BenchResult[] }
  | { id: number; ok: false; error: string }
