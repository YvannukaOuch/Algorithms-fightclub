export type GeneratorId = 'backtracker' | 'prim' | 'kruskal' | 'division' | 'caves' | 'open' | 'deadend'

export interface GeneratorInfo {
  id: GeneratorId
  /** Index understood by the C++ engine (enum Gen in engine/src/generators.hpp). */
  engineId: number
  name: string
  description: string
  /** Perfect mazes have exactly one route until loops are added. */
  maze: boolean
}

export const GENERATORS: readonly GeneratorInfo[] = [
  {
    id: 'backtracker',
    engineId: 0,
    name: 'Labyrinth',
    description: 'Recursive backtracker. Long, winding corridors.',
    maze: true,
  },
  {
    id: 'prim',
    engineId: 1,
    name: 'Thicket',
    description: "Randomized Prim's. Short branches and lots of dead ends.",
    maze: true,
  },
  {
    id: 'kruskal',
    engineId: 2,
    name: 'Patchwork',
    description: "Randomized Kruskal's. Evenly tangled, no long runs.",
    maze: true,
  },
  {
    id: 'division',
    engineId: 3,
    name: 'Rooms',
    description: 'Recursive division. Straight walls, rooms and doorways.',
    maze: true,
  },
  {
    id: 'caves',
    engineId: 4,
    name: 'Caves',
    description: 'Cellular automaton. Organic chambers and tunnels.',
    maze: false,
  },
  {
    id: 'open',
    engineId: 5,
    name: 'Open floor',
    description: 'No walls at all. Shows each search in its purest shape.',
    maze: false,
  },
  {
    id: 'deadend',
    engineId: 6,
    name: 'Dead end',
    description: 'A cup facing the goal. Every heuristic search charges in.',
    maze: false,
  },
]

export const GENERATOR_BY_ID: Readonly<Record<GeneratorId, GeneratorInfo>> = Object.fromEntries(
  GENERATORS.map((g) => [g.id, g]),
) as Record<GeneratorId, GeneratorInfo>

export function isGeneratorId(value: string): value is GeneratorId {
  return value in GENERATOR_BY_ID
}

export const SIZES = [21, 31, 41, 61, 81] as const
export type ArenaSize = (typeof SIZES)[number]
