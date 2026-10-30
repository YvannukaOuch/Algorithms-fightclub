import type { AlgorithmId } from './algorithms'
import { Op, opOf, type FighterTrace, type SolveResult } from './types'

/** Splits a raw event stream into lockstep steps (one per expansion). */
export function prepareTrace(algorithm: AlgorithmId, result: SolveResult): FighterTrace {
  const { events } = result
  const starts = new Uint32Array(result.stats.expanded)
  let steps = 0
  let searchEnd = events.length
  for (let i = 0; i < events.length; i++) {
    const op = opOf(events[i])
    if (op === Op.Close || op === Op.CloseB) {
      starts[steps++] = i
    } else if (op === Op.Path) {
      searchEnd = i
      break
    }
  }
  return {
    algorithm,
    stats: result.stats,
    events,
    stepStarts: steps === starts.length ? starts : starts.slice(0, steps),
    searchEnd,
    path: result.path,
  }
}

/** Number of lockstep steps in a trace. */
export const stepCount = (trace: FighterTrace) => trace.stepStarts.length

/**
 * Event index reached after `step` expansions: everything before the next
 * expansion, including the cells the last one opened.
 */
export function eventBoundary(trace: FighterTrace, step: number): number {
  if (step <= 0) return trace.stepStarts.length > 0 ? trace.stepStarts[0] : trace.searchEnd
  if (step >= trace.stepStarts.length) return trace.searchEnd
  return trace.stepStarts[step]
}
