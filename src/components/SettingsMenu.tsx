import { Monitor, Moon, Settings2, Sun } from 'lucide-react'
import { setQuality, setThemePreference } from '@/app/preferences'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useArena, type ThemePreference } from '@/state/store'

const SHORTCUTS: [string, string][] = [
  ['Space', 'Fight, pause or resume'],
  ['← →', 'Step back or forward'],
  ['R', 'Reset the fight'],
  ['N', 'New arena'],
  ['1–5', 'Pick an edit tool'],
]

export function SettingsMenu() {
  const theme = useArena((s) => s.themePreference)
  const quality = useArena((s) => s.quality)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-4">
        <div className="space-y-2">
          <p id="theme-label" className="text-sm font-medium">
            Theme
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={theme}
            onValueChange={(v) => v && setThemePreference(v as ThemePreference)}
            aria-labelledby="theme-label"
            className="w-full"
          >
            <ToggleGroupItem value="dark" className="flex-1">
              <Moon /> Dark
            </ToggleGroupItem>
            <ToggleGroupItem value="light" className="flex-1">
              <Sun /> Light
            </ToggleGroupItem>
            <ToggleGroupItem value="system" className="flex-1">
              <Monitor /> System
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-2">
          <p id="quality-label" className="text-sm font-medium">
            Graphics
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={0}
            value={quality}
            onValueChange={(v) => (v === 'high' || v === 'low') && setQuality(v)}
            aria-labelledby="quality-label"
            className="w-full"
          >
            <ToggleGroupItem value="high" className="flex-1">
              High
            </ToggleGroupItem>
            <ToggleGroupItem value="low" className="flex-1">
              Low
            </ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">Low turns off glow and shadows for slower devices.</p>
        </div>
        <Separator />
        <div className="space-y-2">
          <p className="text-sm font-medium">Keyboard</p>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 text-xs">
            {SHORTCUTS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt>
                  <Kbd>{key}</Kbd>
                </dt>
                <dd className="text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </PopoverContent>
    </Popover>
  )
}
