import { PALETTES } from '@/arena3d/palette'
import { useResolvedTheme } from '@/app/preferences'
import { ALGORITHM_BY_ID } from '@/engine/algorithms'
import { useArena } from '@/state/store'

/**
 * Key to the tile states, drawn in the first fighter's colour. Each state also
 * has its own shape (outlined, solid, line), so the key never relies on shade.
 */
export function StageLegend() {
  const theme = useResolvedTheme()
  const first = useArena((s) => s.fighters[0])
  const color = ALGORITHM_BY_ID[first].color[theme]
  const palette = PALETTES[theme]
  const pathColor = theme === 'dark' ? `color-mix(in oklch, ${color} 70%, white)` : color

  return (
    <div className="pointer-events-none absolute top-3 left-3 hidden rounded-md border bg-background/70 px-2.5 py-2 backdrop-blur-sm @4xl:block">
      <ul className="space-y-1.5 text-xs text-muted-foreground">
        <li className="flex items-center gap-2">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <rect x="1" y="1" width="10" height="10" rx="2" fill={`color-mix(in oklch, ${color} 35%, ${palette.tile})`} stroke={color} strokeWidth="1.6" />
          </svg>
          Frontier
        </li>
        <li className="flex items-center gap-2">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={color} />
          </svg>
          Expanded
        </li>
        <li className="flex items-center gap-2">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path d="M1 9 L5 9 L5 3 L11 3" fill="none" stroke={pathColor} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Path
        </li>
        <li className="flex items-center gap-2">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={palette.mud} />
          </svg>
          Mud, costs 5
        </li>
        <li className="flex items-center gap-2">
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <rect x="0.5" y="0.5" width="11" height="11" rx="2" fill={palette.wallSide} stroke={palette.wallTop} strokeWidth="1.4" />
          </svg>
          Wall
        </li>
      </ul>
    </div>
  )
}
