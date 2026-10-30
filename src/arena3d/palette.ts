export type ThemeMode = 'dark' | 'light'

/** Scene colours and lighting per theme. Fighter colours come from ALGORITHMS. */
export interface ScenePalette {
  background: string
  floor: string
  slab: string
  tile: string
  mud: string
  wallSide: string
  wallTop: string
  post: string
  marker: string
  markerGlow: number
  spot: string
  spotIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  keyIntensity: number
  /** Scales tile emissive glow; light backgrounds need far less. */
  glow: number
  /** Path tiles are the fighter colour mixed toward this, so they stand out from both floor and explored cells. */
  pathMix: string
  pathAmount: number
  /** Multiplier on the path tube colour (above 1 feeds the bloom). */
  pathBoost: number
  haze: boolean
  bloom: { strength: number; radius: number; threshold: number }
  exposure: number
}

export const PALETTES: Record<ThemeMode, ScenePalette> = {
  dark: {
    background: '#101319',
    floor: '#16191f',
    slab: '#1e222a',
    tile: '#b9b3a6',
    mud: '#5b4a33',
    wallSide: '#2a2f39',
    wallTop: '#4a5160',
    post: '#7d838f',
    marker: '#fff4dc',
    markerGlow: 2.2,
    spot: '#ffe9c7',
    spotIntensity: 190,
    hemiSky: '#9fb0cc',
    hemiGround: '#14161b',
    hemiIntensity: 0.42,
    keyIntensity: 1.9,
    glow: 1,
    pathMix: '#ffffff',
    pathAmount: 0.3,
    pathBoost: 1.7,
    haze: true,
    bloom: { strength: 0.42, radius: 0.32, threshold: 0.86 },
    exposure: 1.05,
  },
  light: {
    background: '#e3e4e8',
    floor: '#d6d8dd',
    slab: '#b9bdc5',
    tile: '#f6f6f4',
    mud: '#b39a6f',
    wallSide: '#3a404c',
    wallTop: '#5c6372',
    post: '#8e949f',
    marker: '#16181d',
    markerGlow: 0,
    spot: '#ffffff',
    spotIntensity: 40,
    hemiSky: '#ffffff',
    hemiGround: '#b6b9c0',
    hemiIntensity: 1.35,
    keyIntensity: 2.4,
    glow: 0.35,
    // A dark path would read as wall here; lift it to near-white and let the
    // deep-coloured tube on top carry the route.
    pathMix: '#ffffff',
    pathAmount: 0.8,
    pathBoost: 0.78,
    haze: false,
    bloom: { strength: 0.18, radius: 0.4, threshold: 0.95 },
    exposure: 1,
  },
}
