const ORDINAL = new Intl.PluralRules('en-US', { type: 'ordinal' })
const SUFFIX: Record<string, string> = { one: 'st', two: 'nd', few: 'rd', other: 'th' }

export const ordinal = (n: number) => `${n}${SUFFIX[ORDINAL.select(n)]}`

export const count = (n: number) => n.toLocaleString('en-US')

/** Microseconds with three significant figures, switching to ms past 1000 µs. */
export function duration(us: number) {
  if (us >= 1000) return `${(us / 1000).toPrecision(3)} ms`
  if (us >= 100) return `${Math.round(us)} µs`
  return `${us.toPrecision(3)} µs`
}

/** How much worse than optimal a path cost is, as "+12%", or null when optimal. */
export function overOptimal(cost: number, optimal: number | null) {
  if (optimal === null || cost <= optimal) return null
  if (optimal === 0) return '+∞'
  return `+${Math.max(1, Math.round(((cost - optimal) / optimal) * 100))}%`
}

/** Maps a 0–100 slider position to steps per second on a log scale (2 to 2000). */
export const speedFromSlider = (v: number) => Math.round(2 * 1000 ** (v / 100))
export const sliderFromSpeed = (s: number) => (Math.log(s / 2) / Math.log(1000)) * 100
