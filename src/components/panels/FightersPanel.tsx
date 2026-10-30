import { Info } from 'lucide-react'
import { useResolvedTheme } from '@/app/preferences'
import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ALGORITHMS, MAX_FIGHTERS, type AlgorithmInfo } from '@/engine/algorithms'
import { cn } from '@/lib/utils'
import { useArena } from '@/state/store'

const GUARANTEE: Record<AlgorithmInfo['optimal'], string> = {
  cost: 'Always finds the cheapest path.',
  steps: 'Fewest steps, but not always the cheapest path.',
  bounded: 'Path costs at most twice the optimum.',
  none: 'No guarantee on path quality.',
}

export function FightersPanel() {
  const fighters = useArena((s) => s.fighters)
  const theme = useResolvedTheme()
  const full = fighters.length >= MAX_FIGHTERS

  return (
    <section aria-labelledby="fighters-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="fighters-heading" className="font-display text-2xl font-bold">
          Fighters
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {fighters.length} of {MAX_FIGHTERS}
        </span>
      </div>
      <ul className="space-y-1">
        {ALGORITHMS.map((a) => {
          const selected = fighters.includes(a.id)
          const color = a.color[theme]
          const locked = selected && fighters.length === 1
          return (
            <li key={a.id}>
              <div
                className={cn(
                  'flex items-start rounded-lg border transition-colors',
                  selected ? 'border-border bg-card' : 'border-transparent hover:bg-muted/60',
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  disabled={(!selected && full) || locked}
                  onClick={() => session.toggleFighter(a.id)}
                  className="flex min-w-0 flex-1 items-start gap-3 rounded-lg py-1.5 pr-1 pl-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed enabled:cursor-pointer [&:disabled:not([aria-pressed=true])]:opacity-45"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 rounded-[5px] border-2 transition-colors"
                    style={{ borderColor: color, backgroundColor: selected ? color : 'transparent' }}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm leading-5 font-semibold">{a.name}</span>
                    <span className="block truncate text-xs leading-4 text-muted-foreground">{a.tagline}</span>
                  </span>
                </button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="my-1.5 mr-1 shrink-0 text-muted-foreground" aria-label={`About ${a.name}`}>
                      <Info />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent side="right" align="start" className="w-80 space-y-2">
                    <div className="flex items-center gap-2">
                      <span aria-hidden="true" className="h-5 w-1 rounded-full" style={{ backgroundColor: color }} />
                      <p className="font-display text-xl leading-none font-bold">{a.name}</p>
                    </div>
                    <p className="text-sm font-medium">{a.summary}</p>
                    <p className="text-sm leading-relaxed text-muted-foreground">{a.detail}</p>
                    <p className="text-xs font-medium">{GUARANTEE[a.optimal]}</p>
                  </PopoverContent>
                </Popover>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {full ? 'That’s a full card. Remove a fighter to add another.' : 'Pick up to four. Each gets its own ring.'}
      </p>
    </section>
  )
}
