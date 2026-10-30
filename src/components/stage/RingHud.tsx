import { Trophy } from 'lucide-react'
import type { Ref } from 'react'
import { useResolvedTheme } from '@/app/preferences'
import { ALGORITHM_BY_ID, type AlgorithmId } from '@/engine/algorithms'
import { count, ordinal, overOptimal } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useArena } from '@/state/store'

interface RingHudProps {
  id: AlgorithmId
  index: number
  ref?: Ref<HTMLDivElement>
}

/**
 * The scorebug hanging over a ring. The stage moves the outer element to the
 * ring's back-left corner every frame; React only renders the contents.
 */
export function RingHud({ id, index, ref }: RingHudProps) {
  const info = ALGORITHM_BY_ID[id]
  const theme = useResolvedTheme()
  const live = useArena((s) => (s.live[index]?.algorithm === id ? s.live[index] : undefined))
  const result = useArena((s) => (s.results[index]?.algorithm === id ? s.results[index] : undefined))
  const optimal = useArena((s) => s.analysis?.optimalCost ?? null)
  const phase = useArena((s) => s.phase)

  let status: string
  let detail: string | null = null
  if (!live || phase === 'setup' || phase === 'loading') {
    status = 'Ready'
  } else if (!live.done) {
    status = `${count(live.expanded)} expanded`
    detail = `${count(live.frontier)} on the frontier`
  } else if (result?.stats.found) {
    const over = overOptimal(result.stats.pathCost, optimal)
    status = `${count(result.stats.expanded)} expanded`
    detail = `Path cost ${result.stats.pathCost}${over ? `, ${over}` : ', optimal'}`
  } else {
    status = 'No path'
  }
  const place = live?.done ? live.place : null

  return (
    <div ref={ref} className="absolute top-0 left-0 will-change-transform" style={{ visibility: 'hidden' }}>
      <div className="-translate-y-full pb-2">
        <div className="flex items-stretch gap-2.5 rounded-md border bg-background/85 py-1.5 pr-3 pl-1.5 shadow-sm backdrop-blur-sm">
          <span aria-hidden="true" className="w-1 shrink-0 rounded-full" style={{ backgroundColor: info.color[theme] }} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-[1.35rem] leading-none font-bold whitespace-nowrap">{info.shortName}</span>
              {place !== null && (
                <span
                  className={cn(
                    'inline-flex h-5 items-center gap-1 rounded px-1.5 text-xs font-semibold',
                    place === 1 ? 'bg-primary text-primary-foreground' : 'border text-foreground',
                  )}
                >
                  {place === 1 && <Trophy className="size-3" aria-hidden="true" />}
                  {ordinal(place)}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-tight whitespace-nowrap tabular-nums">{status}</p>
            {detail && <p className="text-xs leading-tight whitespace-nowrap text-muted-foreground tabular-nums">{detail}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
