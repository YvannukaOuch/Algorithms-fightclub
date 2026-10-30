import { describe, expect, it } from 'vitest'
import { Cell, type Maze } from '@/engine/types'
import { DEFAULT_PARAMS } from '@/state/store'
import { customFragment, paramsToHash, readHash } from './share'

describe('share links', () => {
  it('round-trip arena params and lineup', async () => {
    const params = { ...DEFAULT_PARAMS, generator: 'caves' as const, size: 41 as const, seed: 777, loops: 5, mud: 20 }
    const hash = paramsToHash(params, ['greedy', 'astar'])
    const state = await readHash(hash)
    expect(state.params).toEqual(params)
    expect(state.fighters).toEqual(['greedy', 'astar'])
    expect(state.custom).toBeUndefined()
  })

  it('round-trip a hand-edited grid', async () => {
    const size = 21
    const cells = new Uint8Array(size * size)
    for (let i = 0; i < cells.length; i++) cells[i] = (i * 7) % 3 === 0 ? Cell.Wall : i % 5 === 0 ? Cell.Mud : Cell.Floor
    const maze: Maze = { width: size, height: size, cells, start: 22, goal: 418 }
    const hash = paramsToHash({ ...DEFAULT_PARAMS, size }, ['bfs'], await customFragment(maze))
    const state = await readHash(hash)
    expect(state.custom?.start).toBe(22)
    expect(state.custom?.goal).toBe(418)
    expect(Array.from(state.custom!.cells)).toEqual(Array.from(cells))
  })

  it('ignore junk instead of failing', async () => {
    const state = await readHash('#g=nope&n=33&s=-4&l=900&m=abc&f=astar,astar,warp,bfs,dfs,greedy,wastar&c=!!!&a=1&b=2')
    expect(state.params.generator).toBeUndefined()
    expect(state.params.size).toBeUndefined()
    expect(state.params.seed).toBe(1)
    expect(state.params.loops).toBe(40)
    expect(state.params.mud).toBeUndefined()
    expect(state.fighters).toEqual(['astar', 'bfs', 'dfs', 'greedy'])
    expect(state.custom).toBeUndefined()
  })
})
