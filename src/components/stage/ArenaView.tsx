import { Focus, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ArenaStage } from '@/arena3d/ArenaStage'
import { prefersReducedMotion, useResolvedTheme } from '@/app/preferences'
import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ALGORITHM_BY_ID } from '@/engine/algorithms'
import { useArena } from '@/state/store'
import { RingHud } from './RingHud'
import { StageLegend } from './StageLegend'
import { Transport } from './Transport'

export function ArenaView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const transportRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<ArenaStage | null>(null)
  const hudRefs = useRef<(HTMLDivElement | null)[]>([])
  const theme = useResolvedTheme()
  const themeRef = useRef(theme)
  const quality = useArena((s) => s.quality)
  const fighters = useArena((s) => s.fighters)
  const phase = useArena((s) => s.phase)
  const error = useArena((s) => s.error)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let cancelled = false
    let cleanup: (() => void) | null = null

    // three.js is the bulk of the bundle; load it after the UI has painted.
    import('@/arena3d/ArenaStage')
      .then(({ ArenaStage }) => {
        if (cancelled) return
        let stage: ArenaStage
        try {
          stage = new ArenaStage(el, { theme: themeRef.current, quality, reducedMotion: prefersReducedMotion() })
        } catch (err) {
          console.error(err)
          setFailure('This browser could not start WebGL, so the arena can’t be drawn. The scorecard below still works.')
          return
        }
        stageRef.current = stage
        stage.setHudElements(hudRefs.current)
        session.attachStage(stage)
        if (import.meta.env.DEV) Object.assign(window, { __fightclubStage: stage })
        const transport = transportRef.current
        const ro = new ResizeObserver(() => stage.setBottomInset((transport?.offsetHeight ?? 0) + 16))
        if (transport) ro.observe(transport)
        cleanup = () => {
          ro.disconnect()
          session.detachStage(stage)
          stage.dispose()
          stageRef.current = null
        }
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setFailure('The 3D arena failed to load. Check your connection and reload the page.')
      })

    return () => {
      cancelled = true
      cleanup?.()
    }
  }, [quality])

  useEffect(() => {
    themeRef.current = theme
    stageRef.current?.setTheme(theme)
  }, [theme])

  const registerHud = useCallback((index: number, el: HTMLDivElement | null) => {
    hudRefs.current[index] = el
    stageRef.current?.setHudElements(hudRefs.current)
  }, [])

  const names = fighters.map((f) => ALGORITHM_BY_ID[f].name).join(', ')

  return (
    <div className="@container relative h-full overflow-hidden bg-venue">
      <div
        ref={containerRef}
        className="absolute inset-0"
        role="img"
        aria-label={`3D arena with one ring per fighter: ${names}. Results are listed in the scorecard.`}
      />
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {fighters.map((id, i) => (
          <RingHud key={id} id={id} index={i} ref={(el) => registerHud(i, el)} />
        ))}
      </div>

      <StageLegend />

      <div className="absolute top-3 right-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              className="bg-background/70 backdrop-blur-sm"
              aria-label="Recenter the camera"
              onClick={() => session.resetView()}
            >
              <Focus />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Recenter the camera</TooltipContent>
        </Tooltip>
      </div>

      {(failure || error) && (
        <div className="absolute inset-x-3 top-3 mx-auto flex max-w-xl items-start gap-2 rounded-lg border bg-background/90 p-3 text-sm shadow-sm backdrop-blur-sm sm:right-14">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p role="alert">{failure ?? error}</p>
        </div>
      )}

      {phase === 'loading' && !failure && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="text-sm text-muted-foreground">Starting the engine…</p>
        </div>
      )}

      <Transport ref={transportRef} />
    </div>
  )
}
