import { Dices } from 'lucide-react'
import { useId, useState } from 'react'
import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { GENERATOR_BY_ID, GENERATORS, SIZES, isGeneratorId, type ArenaSize } from '@/engine/generators'
import { useArena } from '@/state/store'

const MAX_SEED = 2 ** 31 - 1

/** Remounted (via key) whenever the seed changes elsewhere, which resets the draft. */
function SeedField({ seed }: { seed: number }) {
  const [text, setText] = useState(String(seed))
  const [error, setError] = useState<string | null>(null)
  const id = useId()

  const commit = () => {
    const trimmed = text.trim()
    if (!/^\d+$/.test(trimmed)) {
      setError('Use whole numbers only.')
      return
    }
    const value = Number(trimmed)
    if (value < 1 || value > MAX_SEED) {
      setError(`Pick a number from 1 to ${MAX_SEED.toLocaleString()}.`)
      return
    }
    setError(null)
    if (value !== seed) void session.regenerate({ seed: value })
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Seed</Label>
      <div className="flex gap-1.5">
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          className="tabular-nums"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Roll a new seed" onClick={() => session.newSeed()}>
              <Dices />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New arena</TooltipContent>
        </Tooltip>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

interface PercentFieldProps {
  label: string
  value: number
  max: number
  disabled?: boolean
  hint: string
  onCommit(value: number): void
}

/**
 * Slider that shows its value live while dragging and commits on release.
 * Remounted (via key) when the committed value changes.
 */
function PercentField({ label, value, max, disabled, hint, onCommit }: PercentFieldProps) {
  const [draft, setDraft] = useState(value)
  const id = useId()

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label id={id}>{label}</Label>
        <span className="text-xs text-muted-foreground tabular-nums">{draft}%</span>
      </div>
      <Slider
        aria-labelledby={id}
        aria-describedby={`${id}-hint`}
        min={0}
        max={max}
        step={1}
        value={[draft]}
        disabled={disabled}
        onValueChange={([v]) => setDraft(v)}
        onValueCommit={([v]) => onCommit(v)}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}

export function ArenaPanel() {
  const generator = useArena((s) => s.generator)
  const size = useArena((s) => s.size)
  const seed = useArena((s) => s.seed)
  const loops = useArena((s) => s.loops)
  const mud = useArena((s) => s.mud)
  const info = GENERATOR_BY_ID[generator]

  return (
    <section aria-labelledby="arena-heading" className="space-y-4">
      <h2 id="arena-heading" className="font-display text-2xl font-bold">
        Arena
      </h2>
      <div className="space-y-1.5">
        <Label htmlFor="arena-layout">Layout</Label>
        <Select value={generator} onValueChange={(v) => isGeneratorId(v) && void session.regenerate({ generator: v })}>
          <SelectTrigger id="arena-layout" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GENERATORS.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </div>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="arena-size">Size</Label>
          <Select
            value={String(size)}
            onValueChange={(v) => void session.regenerate({ size: Number(v) as ArenaSize })}
          >
            <SelectTrigger id="arena-size" className="w-full tabular-nums">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s} value={String(s)} className="tabular-nums">
                  {s} × {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <SeedField key={seed} seed={seed} />
      </div>
      <PercentField
        key={`loops-${loops}`}
        label="Loops"
        value={loops}
        max={40}
        disabled={!info.maze}
        hint={info.maze ? 'Knocks out walls so there is more than one route.' : 'Only applies to maze layouts.'}
        onCommit={(v) => void session.regenerate({ loops: v })}
      />
      <PercentField
        key={`mud-${mud}`}
        label="Mud"
        value={mud}
        max={40}
        hint="Mud costs 5 to cross instead of 1. BFS doesn’t notice."
        onCommit={(v) => void session.regenerate({ mud: v })}
      />
    </section>
  )
}
