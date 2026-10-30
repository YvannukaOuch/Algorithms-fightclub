import { Check, Loader2, Timer, Trophy } from 'lucide-react'
import { useResolvedTheme } from '@/app/preferences'
import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ALGORITHM_BY_ID } from '@/engine/algorithms'
import { count, duration, ordinal, overOptimal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useArena, type ArenaState } from '@/state/store'

/** One plain-language sentence or two on how the fight went. */
function verdict(s: ArenaState): string {
  if (s.phase === 'loading') return 'Starting the engine…'
  if (s.analysis && s.analysis.optimalCost === null) {
    return 'The goal can’t be reached from the start. Erase a wall or roll a new arena.'
  }
  if (s.phase === 'setup') return 'Press Fight. Results fill in as each fighter reaches the goal.'
  const done = s.live.filter((l) => l.done).length
  if (s.phase !== 'finished') return `${done} of ${s.live.length} fighters have reached the goal.`

  const optimal = s.analysis?.optimalCost ?? null
  const rows = s.live.map((l, i) => ({ live: l, result: s.results[i] })).filter((r) => r.result)
  const winners = rows.filter((r) => r.live.place === 1)
  if (winners.length === 0) return 'Fight over.'
  const names = winners.map((w) => ALGORITHM_BY_ID[w.live.algorithm].name)
  const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} tie` : `${names[0]} wins`
  const how = s.mode === 'lockstep' ? `with ${count(winners[0].result.stats.expanded)} expansions` : 'on measured speed'
  const best = winners[0].result.stats.pathCost
  if (optimal === null || best <= optimal) return `${who} ${how}, on an optimal path.`

  const firstOptimal = rows
    .filter((r) => r.result.stats.pathCost === optimal)
    .sort((a, b) => (a.live.place ?? 99) - (b.live.place ?? 99))[0]
  const over = overOptimal(best, optimal)?.replace(/^\+/, '')
  const tail = firstOptimal
    ? ` ${ALGORITHM_BY_ID[firstOptimal.live.algorithm].name} found the cheapest path, finishing ${ordinal(firstOptimal.live.place ?? rows.length)}.`
    : ''
  return `${who} ${how}, but the path costs ${over} more than the cheapest.${tail}`
}

export function Scorecard() {
  const state = useArena()
  const theme = useResolvedTheme()
  const { fighters, results, live, analysis, bench, benchRunning, phase, maze } = state
  const optimal = analysis?.optimalCost ?? null
  const maxExpanded = Math.max(1, ...results.map((r) => r.stats.expanded))
  const finished = phase === 'finished'

  return (
    <section aria-labelledby="scorecard-heading" className="shrink-0 border-t bg-card/60">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3">
        <h2 id="scorecard-heading" className="font-display text-2xl font-bold">
          Scorecard
        </h2>
        <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground" aria-live="polite">
          {verdict(state)}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" disabled={benchRunning || !maze} onClick={() => void session.benchmark()}>
              {benchRunning ? <Loader2 className="animate-spin" /> : <Timer />}
              {benchRunning ? 'Timing' : bench ? 'Time again' : 'Time each fighter'}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            Runs each search hundreds of times in WebAssembly with tracing compiled out, and reports the median.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="overflow-x-auto px-4 pt-1 pb-3">
        <Table className="w-full min-w-[54rem] table-fixed">
          <colgroup>
            <col className="w-[11rem]" />
            <col className="w-[6rem]" />
            <col className="w-[14rem]" />
            <col className="w-[7rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-[8rem]" />
            <col className="w-[7rem]" />
          </colgroup>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Fighter</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Cells expanded</TableHead>
              <TableHead className="text-right">Peak frontier</TableHead>
              <TableHead className="text-right">Path steps</TableHead>
              <TableHead className="text-right">Path cost</TableHead>
              <TableHead className="text-right">Time per run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fighters.map((id, i) => {
              const info = ALGORITHM_BY_ID[id]
              const color = info.color[theme]
              const l = live[i]?.algorithm === id ? live[i] : undefined
              const r = results[i]?.algorithm === id ? results[i] : undefined
              const revealed = !!r && (finished || !!l?.done)
              const stats = r?.stats
              const over = stats && overOptimal(stats.pathCost, optimal)
              const time = bench?.[id]
              const share = stats && analysis ? Math.round((stats.expanded / Math.max(1, analysis.reachable)) * 100) : 0

              let result: React.ReactNode = <span className="text-muted-foreground">—</span>
              if (revealed && stats && !stats.found) result = <span className="text-muted-foreground">No path</span>
              else if (revealed && l?.place) {
                result = (
                  <span
                    className={cn(
                      'inline-flex h-6 items-center gap-1 rounded px-2 text-xs font-semibold',
                      l.place === 1 ? 'bg-primary text-primary-foreground' : 'border',
                    )}
                  >
                    {l.place === 1 && <Trophy className="size-3" aria-hidden="true" />}
                    {ordinal(l.place)}
                  </span>
                )
              } else if (l && !l.done && (phase === 'running' || phase === 'paused')) {
                result = <span className="text-muted-foreground">Searching</span>
              }

              return (
                <TableRow key={id} className="tabular-nums">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="h-5 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate font-medium">{info.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{result}</TableCell>
                  <TableCell>
                    {revealed && stats ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex cursor-default items-center gap-2.5 py-1">
                            <div className="h-2 flex-1">
                              <div
                                className="h-full rounded-r-[4px]"
                                style={{ width: `${(stats.expanded / maxExpanded) * 100}%`, backgroundColor: color }}
                              />
                            </div>
                            <span className="w-12 text-right">{count(stats.expanded)}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {info.name} expanded {count(stats.expanded)} of {count(analysis?.reachable ?? 0)} reachable cells ({share}%)
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{revealed && stats ? count(stats.maxFrontier) : '—'}</TableCell>
                  <TableCell className="text-right">
                    {revealed && stats?.found ? count(stats.pathLength - 1) : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    {revealed && stats?.found ? (
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {count(stats.pathCost)}
                        {over ? (
                          <span className="text-xs text-muted-foreground">{over}</span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Check className="size-3" aria-hidden="true" />
                            optimal
                          </span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {time ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-default">{duration(time.medianUs)}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          Median of {time.batches} batches of {count(time.runsPerBatch)} runs. Fastest batch{' '}
                          {duration(time.minUs)}, slowest {duration(time.maxUs)}.
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
