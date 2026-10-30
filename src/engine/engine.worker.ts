// Hosts the WebAssembly engine off the main thread, so a benchmark run never
// drops a frame of the arena.
import wasmUrl from './arena.wasm?url'
import { ArenaEngine } from './engine'
import type { EngineRequest, EngineResponse } from './protocol'
import { prepareTrace } from './trace'

const ready = ArenaEngine.instantiate(fetch(wasmUrl))

const scope = self as unknown as {
  postMessage(message: EngineResponse, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: (e: MessageEvent<EngineRequest>) => void): void
}

scope.addEventListener('message', async (e) => {
  const req = e.data
  try {
    const engine = await ready
    switch (req.type) {
      case 'generate': {
        const maze = engine.generate(req.params)
        scope.postMessage({ id: req.id, ok: true, type: 'generate', maze }, [maze.cells.buffer])
        break
      }
      case 'prepare': {
        const traces = req.algorithms.map((a) => prepareTrace(a, engine.solve(a, req.maze, true)))
        const optimal = engine.solve('dijkstra', req.maze, false).stats
        const fewest = engine.solve('bfs', req.maze, false).stats
        const analysis = {
          reachable: engine.reachable(req.maze),
          optimalCost: optimal.found ? optimal.pathCost : null,
          optimalSteps: fewest.found ? fewest.pathLength - 1 : null,
        }
        const transfer = traces.flatMap((t) => [t.events.buffer, t.stepStarts.buffer, t.path.buffer])
        scope.postMessage({ id: req.id, ok: true, type: 'prepare', result: { traces, analysis } }, transfer)
        break
      }
      case 'bench': {
        const results = req.algorithms.map((a) => engine.bench(a, req.maze))
        scope.postMessage({ id: req.id, ok: true, type: 'bench', results })
        break
      }
    }
  } catch (err) {
    scope.postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
})
