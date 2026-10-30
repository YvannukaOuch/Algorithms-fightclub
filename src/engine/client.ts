import type { AlgorithmId } from './algorithms'
import type { GenerateParams } from './engine'
import type { EngineRequest, EngineResponse, PrepareResult } from './protocol'
import type { BenchResult, Maze } from './types'

type Pending = { resolve: (r: EngineResponse) => void; reject: (e: Error) => void }

// Distributes Omit over the request union so each variant keeps its own fields.
type RequestBody = EngineRequest extends infer R ? (R extends EngineRequest ? Omit<R, 'id'> : never) : never

/** Promise-based RPC to the engine worker. */
export class EngineClient {
  private readonly worker: Worker
  private readonly pending = new Map<number, Pending>()
  private seq = 0

  constructor() {
    this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    this.worker.addEventListener('message', (e: MessageEvent<EngineResponse>) => {
      const p = this.pending.get(e.data.id)
      if (!p) return
      this.pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data)
      else p.reject(new Error(e.data.error))
    })
    this.worker.addEventListener('error', (e) => {
      const err = new Error(e.message || 'The engine worker failed to start.')
      for (const p of this.pending.values()) p.reject(err)
      this.pending.clear()
    })
  }

  private call(body: RequestBody): Promise<EngineResponse> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ ...body, id } as EngineRequest)
    })
  }

  async generate(params: GenerateParams): Promise<Maze> {
    const res = await this.call({ type: 'generate', params })
    if (!res.ok || res.type !== 'generate') throw new Error('Unexpected engine response.')
    return res.maze
  }

  async prepare(maze: Maze, algorithms: AlgorithmId[]): Promise<PrepareResult> {
    const res = await this.call({ type: 'prepare', maze, algorithms })
    if (!res.ok || res.type !== 'prepare') throw new Error('Unexpected engine response.')
    return res.result
  }

  async bench(maze: Maze, algorithms: AlgorithmId[]): Promise<BenchResult[]> {
    const res = await this.call({ type: 'bench', maze, algorithms })
    if (!res.ok || res.type !== 'bench') throw new Error('Unexpected engine response.')
    return res.results
  }

  dispose() {
    this.worker.terminate()
    for (const p of this.pending.values()) p.reject(new Error('Engine stopped.'))
    this.pending.clear()
  }
}
