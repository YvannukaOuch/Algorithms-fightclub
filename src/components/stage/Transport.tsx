import { Gauge, Loader2, Pause, Play, RotateCcw, Square, StepBack, StepForward, Swords } from 'lucide-react'
import type { Ref } from 'react'
import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { count, sliderFromSpeed, speedFromSlider } from '@/lib/format'
import { useArena } from '@/state/store'

function PrimaryButton() {
  const phase = useArena((s) => s.phase)
  const benchRunning = useArena((s) => s.benchRunning)
  const config = {
    loading: { label: 'Loading', icon: Loader2 },
    setup: { label: 'Fight', icon: Swords },
    running: { label: 'Pause', icon: Pause },
    paused: { label: 'Resume', icon: Play },
    finished: { label: 'Rematch', icon: RotateCcw },
  }[phase]
  const busy = phase === 'loading' || (phase === 'setup' && benchRunning)
  const Icon = busy ? Loader2 : config.icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="lg" className="h-10 min-w-30 gap-2 px-4 text-base font-semibold" disabled={busy} onClick={() => void session.primary()}>
          <Icon className={busy ? 'animate-spin' : undefined} />
          {busy && phase === 'setup' ? 'Timing' : config.label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {config.label} <Kbd>Space</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function IconAction({ label, shortcut, onClick, disabled, children }: { label: string; shortcut: string; onClick(): void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label} <Kbd>{shortcut}</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}

function Timeline() {
  const tau = useArena((s) => s.tau)
  const end = useArena((s) => s.end)
  const mode = useArena((s) => s.mode)
  const phase = useArena((s) => s.phase)
  const active = phase !== 'setup' && phase !== 'loading' && end > 0
  const label = !active
    ? 'Ready to fight'
    : mode === 'lockstep'
      ? `Step ${count(Math.min(Math.floor(tau), end))} of ${count(Math.ceil(end))}`
      : `${Math.round((tau / end) * 100)}% of the slowest run`

  return (
    <div className="flex min-w-44 flex-1 flex-col gap-1.5 px-1">
      <Slider
        aria-label="Fight timeline"
        min={0}
        max={Math.max(end, 1)}
        step={mode === 'lockstep' ? 1 : Math.max(end / 1000, 0.01)}
        value={[active ? tau : 0]}
        disabled={!active}
        onValueChange={([v]) => session.seek(v)}
      />
      <span className="text-xs text-muted-foreground tabular-nums">{label}</span>
    </div>
  )
}

function SpeedControl() {
  const speed = useArena((s) => s.speed)
  return (
    <div className="flex items-center gap-2">
      <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
      <Slider
        aria-label="Speed in expansions per second"
        className="w-20"
        min={0}
        max={100}
        step={1}
        value={[sliderFromSpeed(speed)]}
        onValueChange={([v]) => session.setSpeed(speedFromSlider(v))}
      />
      <span className="w-12 text-xs text-muted-foreground tabular-nums">{count(speed)}/s</span>
    </div>
  )
}

function ModeToggle() {
  const mode = useArena((s) => s.mode)
  const benchRunning = useArena((s) => s.benchRunning)
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={mode}
      onValueChange={(v) => (v === 'lockstep' || v === 'realtime') && void session.setMode(v)}
      aria-label="Race timing"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="lockstep">Lockstep</ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Every fighter expands one cell per tick. Compares work done.</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem value="realtime">
            {benchRunning && <Loader2 className="animate-spin" />}
            Real time
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Fighters move at their measured speed. Compares actual runtime.</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  )
}

export function Transport({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const phase = useArena((s) => s.phase)
  const loaded = phase !== 'setup' && phase !== 'loading'

  return (
    <div
      ref={ref}
      className="absolute inset-x-3 bottom-3 mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-background/85 p-2 shadow-lg backdrop-blur-md"
    >
      <PrimaryButton />
      <div className="flex items-center">
        <IconAction label="Step back" shortcut="←" disabled={!loaded} onClick={() => void session.step(-1)}>
          <StepBack />
        </IconAction>
        <IconAction label="Step forward" shortcut="→" disabled={phase === 'loading'} onClick={() => void session.step(1)}>
          <StepForward />
        </IconAction>
        <IconAction label="Reset" shortcut="R" disabled={!loaded} onClick={() => session.reset()}>
          <Square />
        </IconAction>
      </div>
      <Timeline />
      <SpeedControl />
      <ModeToggle />
    </div>
  )
}
