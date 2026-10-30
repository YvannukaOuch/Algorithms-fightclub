import { useEffect, useSyncExternalStore } from 'react'
import type { Quality } from '@/arena3d/ArenaStage'
import type { ThemeMode } from '@/arena3d/palette'
import { useArena, type ThemePreference } from '@/state/store'

const THEME_KEY = 'fightclub.theme'
const QUALITY_KEY = 'fightclub.quality'

function read(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private mode or blocked storage: the choice just won't persist.
  }
}

function defaultQuality(): Quality {
  const coarse = window.matchMedia('(pointer: coarse)').matches
  return coarse && Math.min(window.screen.width, window.screen.height) < 820 ? 'low' : 'high'
}

export function loadPreferences() {
  const theme = read(THEME_KEY)
  const quality = read(QUALITY_KEY)
  useArena.setState({
    // The venue is designed dark-first; light and system are a click away.
    themePreference: theme === 'light' || theme === 'system' || theme === 'dark' ? theme : 'dark',
    quality: quality === 'high' || quality === 'low' ? quality : defaultQuality(),
  })
}

export function setThemePreference(preference: ThemePreference) {
  write(THEME_KEY, preference)
  useArena.setState({ themePreference: preference })
}

export function setQuality(quality: Quality) {
  write(QUALITY_KEY, quality)
  useArena.setState({ quality })
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

function subscribeSystemTheme(callback: () => void) {
  const q = darkQuery()
  q.addEventListener('change', callback)
  return () => q.removeEventListener('change', callback)
}

export function useResolvedTheme(): ThemeMode {
  const preference = useArena((s) => s.themePreference)
  const systemDark = useSyncExternalStore(subscribeSystemTheme, () => darkQuery().matches)
  if (preference === 'system') return systemDark ? 'dark' : 'light'
  return preference
}

/** Keeps the `dark` class on <html> in sync with the resolved theme. */
export function useApplyTheme(): ThemeMode {
  const theme = useResolvedTheme()
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101319' : '#e3e4e8')
  }, [theme])
  return theme
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
