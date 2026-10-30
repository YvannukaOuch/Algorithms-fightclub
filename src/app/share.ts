import { isAlgorithmId, MAX_FIGHTERS, type AlgorithmId } from '@/engine/algorithms'
import { isGeneratorId, SIZES, type ArenaSize } from '@/engine/generators'
import type { Maze } from '@/engine/types'
import type { ArenaParams } from '@/state/store'

/**
 * Shareable state lives in the URL hash:
 *   #g=backtracker&n=31&s=20251&l=12&m=12&f=astar,dijkstra,bfs
 * A hand-edited arena adds the grid itself (2 bits per cell, deflated,
 * base64url) plus its endpoints: &c=...&a=<start>&b=<goal>
 */
export interface SharedState {
  params: Partial<ArenaParams>
  fighters?: AlgorithmId[]
  custom?: { cells: Uint8Array; start: number; goal: number }
}

const clampInt = (v: string | null, lo: number, hi: number) => {
  const n = Number.parseInt(v ?? '', 10)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined
}

export function paramsToHash(params: ArenaParams, fighters: AlgorithmId[], custom?: string): string {
  const q = new URLSearchParams({
    g: params.generator,
    n: String(params.size),
    s: String(params.seed),
    l: String(params.loops),
    m: String(params.mud),
    f: fighters.join(','),
  })
  return `#${q.toString()}${custom ?? ''}`
}

export async function readHash(hash: string): Promise<SharedState> {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const params: Partial<ArenaParams> = {}
  const g = q.get('g')
  if (g && isGeneratorId(g)) params.generator = g
  const n = clampInt(q.get('n'), 0, 999)
  if (n !== undefined && (SIZES as readonly number[]).includes(n)) params.size = n as ArenaSize
  const s = clampInt(q.get('s'), 1, 2 ** 31 - 1)
  if (s !== undefined) params.seed = s
  const l = clampInt(q.get('l'), 0, 40)
  if (l !== undefined) params.loops = l
  const m = clampInt(q.get('m'), 0, 40)
  if (m !== undefined) params.mud = m

  const fighters = (q.get('f') ?? '')
    .split(',')
    .filter(isAlgorithmId)
    .filter((id, i, all) => all.indexOf(id) === i)
    .slice(0, MAX_FIGHTERS)

  const state: SharedState = { params, fighters: fighters.length > 0 ? fighters : undefined }

  const c = q.get('c')
  const size = params.size
  if (c && size) {
    try {
      const cells = await decodeCells(c, size * size)
      const start = clampInt(q.get('a'), 0, size * size - 1)
      const goal = clampInt(q.get('b'), 0, size * size - 1)
      if (start !== undefined && goal !== undefined) state.custom = { cells, start, goal }
    } catch {
      // A damaged link still opens the generated arena.
    }
  }
  return state
}

export async function customFragment(maze: Maze): Promise<string> {
  return `&c=${await encodeCells(maze.cells)}&a=${maze.start}&b=${maze.goal}`
}

async function encodeCells(cells: Uint8Array): Promise<string> {
  const packed = new Uint8Array(Math.ceil(cells.length / 4))
  for (let i = 0; i < cells.length; i++) packed[i >> 2] |= (cells[i] & 3) << ((i & 3) * 2)
  const bytes = await transform(packed, new CompressionStream('deflate-raw'))
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function decodeCells(text: string, count: number): Promise<Uint8Array> {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  const packed = await transform(bytes, new DecompressionStream('deflate-raw'))
  if (packed.length * 4 < count) throw new Error('Grid is too short.')
  const cells = new Uint8Array(count)
  for (let i = 0; i < count; i++) cells[i] = Math.min(2, (packed[i >> 2] >> ((i & 3) * 2)) & 3)
  return cells
}

async function transform(input: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const blob = new Blob([input as BlobPart])
  const out = await new Response(blob.stream().pipeThrough(stream)).arrayBuffer()
  return new Uint8Array(out)
}
