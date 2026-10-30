export type AlgorithmId = 'astar' | 'dijkstra' | 'bfs' | 'dfs' | 'greedy' | 'bidir' | 'wastar'

export interface AlgorithmInfo {
  id: AlgorithmId
  /** Index understood by the C++ engine (enum Algo in engine/src/solvers.hpp). */
  engineId: number
  name: string
  /** Fits a ring's scoreboard. */
  shortName: string
  /** One line for the fighter list. */
  tagline: string
  /** Identity colour per theme. Slots follow the validated categorical order, so
   * the default lineup (A*, Dijkstra, BFS) is distinguishable for every viewer. */
  color: { light: string; dark: string }
  optimal: 'cost' | 'steps' | 'bounded' | 'none'
  summary: string
  detail: string
}

export const ALGORITHMS: readonly AlgorithmInfo[] = [
  {
    id: 'astar',
    engineId: 3,
    name: 'A*',
    shortName: 'A*',
    tagline: 'Dijkstra with a sense of direction',
    color: { light: '#2a78d6', dark: '#3987e5' },
    optimal: 'cost',
    summary: 'Dijkstra steered toward the goal by a distance estimate.',
    detail:
      'Expands the cell with the lowest cost-so-far plus Manhattan distance to the goal. The estimate never overshoots, so the path is optimal. Ties go to the deeper cell, which keeps the search narrow.',
  },
  {
    id: 'dijkstra',
    engineId: 2,
    name: 'Dijkstra',
    shortName: 'Dijkstra',
    tagline: 'Cheapest first, no sense of direction',
    color: { light: '#eb6834', dark: '#d95926' },
    optimal: 'cost',
    summary: 'Expands outward in order of path cost. Optimal, but has no idea where the goal is.',
    detail:
      'Always expands the cheapest cell found so far, so it treats mud correctly and returns the cheapest path. With no sense of direction it floods every cell cheaper than the goal.',
  },
  {
    id: 'bfs',
    engineId: 0,
    name: 'Breadth-first search',
    shortName: 'BFS',
    tagline: 'Ripples out one step at a time',
    color: { light: '#1baf7a', dark: '#199e70' },
    optimal: 'steps',
    summary: 'Explores in rings of equal step count. Fewest steps, but ignores terrain cost.',
    detail:
      'A plain FIFO queue. It finds the path with the fewest moves, which is the cheapest path only when every cell costs the same. On muddy ground it happily wades through.',
  },
  {
    id: 'dfs',
    engineId: 1,
    name: 'Depth-first search',
    shortName: 'DFS',
    tagline: 'Dives deep, backtracks late',
    color: { light: '#eda100', dark: '#c98500' },
    optimal: 'none',
    summary: 'Runs down one corridor until it dead-ends, then backtracks.',
    detail:
      'A stack instead of a queue. It always finds a path when one exists, but the path is whatever it stumbled into first, and on open ground it wanders.',
  },
  {
    id: 'greedy',
    engineId: 4,
    name: 'Greedy best-first',
    shortName: 'Greedy',
    tagline: 'Beelines for the goal',
    color: { light: '#e87ba4', dark: '#d55181' },
    optimal: 'none',
    summary: 'Always expands whatever looks closest to the goal. Fast in the open, easy to trap.',
    detail:
      'Orders the frontier by distance to the goal alone and ignores the cost already paid. Brilliant on open ground; a dead end that faces the goal swallows it.',
  },
  {
    id: 'bidir',
    engineId: 5,
    name: 'Bidirectional BFS',
    shortName: 'Bidirectional',
    tagline: 'Searches from both ends at once',
    color: { light: '#008300', dark: '#008300' },
    optimal: 'steps',
    summary: 'Two breadth-first searches, one from each end, meeting in the middle.',
    detail:
      'Grows a frontier from the start and another from the goal, always extending the smaller one. Two small circles cover far less ground than one big one. Fewest steps; ignores terrain.',
  },
  {
    id: 'wastar',
    engineId: 6,
    name: 'Weighted A*',
    shortName: 'Weighted A*',
    tagline: 'A* in a hurry',
    color: { light: '#4a3aa7', dark: '#9085e9' },
    optimal: 'bounded',
    summary: 'A* with the distance estimate doubled. Trades a little path quality for speed.',
    detail:
      'Uses cost-so-far plus twice the Manhattan distance. It rushes toward the goal and expands far fewer cells. The path is guaranteed to cost at most twice the optimum, and is usually much closer.',
  },
]

export const ALGORITHM_BY_ID: Readonly<Record<AlgorithmId, AlgorithmInfo>> = Object.fromEntries(
  ALGORITHMS.map((a) => [a.id, a]),
) as Record<AlgorithmId, AlgorithmInfo>

export const DEFAULT_FIGHTERS: readonly AlgorithmId[] = ['astar', 'dijkstra', 'bfs']
export const MAX_FIGHTERS = 4

export function isAlgorithmId(value: string): value is AlgorithmId {
  return value in ALGORITHM_BY_ID
}
