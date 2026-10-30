import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useArena } from '@/state/store'
import { isTool, TOOLS } from './tools'

export function EditPanel() {
  const tool = useArena((s) => s.tool)
  const phase = useArena((s) => s.phase)
  const edited = useArena((s) => s.edited)
  const locked = phase === 'running' || phase === 'paused'

  return (
    <section aria-labelledby="edit-heading" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 id="edit-heading" className="font-display text-2xl font-bold">
          Edit
        </h2>
        {edited && (
          <Button variant="link" size="xs" className="h-auto px-0" onClick={() => void session.regenerate()}>
            Discard edits
          </Button>
        )}
      </div>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={0}
        value={tool}
        onValueChange={(v) => isTool(v) && useArena.setState({ tool: v })}
        aria-label="Edit tool"
        className="w-full"
      >
        {TOOLS.map((t, i) => (
          <Tooltip key={t.id}>
            <TooltipTrigger asChild>
              <ToggleGroupItem value={t.id} aria-label={t.label} className="h-14 flex-1 flex-col gap-1 px-0">
                <t.icon />
                <span className="text-[11px] leading-none">{t.label}</span>
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent>
              {t.help} <Kbd>{i + 1}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {locked
          ? 'Reset the fight to edit the arena.'
          : 'Drag on any ring to paint; every ring shares the arena. Right-drag erases, drag empty space to turn the camera.'}
      </p>
    </section>
  )
}
