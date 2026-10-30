import { useEffect } from 'react'
import { session } from '@/app/session'
import { TOOLS } from '@/components/panels/tools'
import { useArena } from '@/state/store'

// Keys belong to the focused control when it already uses them.
const OWNS_KEYS = 'input, textarea, select, [contenteditable="true"], [role="slider"], [role="combobox"], [role="listbox"], [role="menu"], [role="radio"], [role="tab"]'
const OWNS_SPACE = 'button, a, [role="button"], [role="switch"], [role="checkbox"]'

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return
      const target = e.target instanceof Element ? e.target : null
      if (target?.closest(OWNS_KEYS)) return
      if (document.querySelector('[data-slot="popover-content"], [data-slot="select-content"]')) return

      switch (e.key) {
        case ' ':
          if (target?.closest(OWNS_SPACE)) return
          e.preventDefault()
          void session.primary()
          break
        case 'ArrowRight':
          e.preventDefault()
          void session.step(1)
          break
        case 'ArrowLeft':
          e.preventDefault()
          void session.step(-1)
          break
        case 'r':
        case 'R':
          session.reset()
          break
        case 'n':
        case 'N':
          session.newSeed()
          break
        default: {
          const index = Number.parseInt(e.key, 10) - 1
          if (index >= 0 && index < TOOLS.length) useArena.setState({ tool: TOOLS[index].id })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
