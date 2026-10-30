// Per-tile values shared by the playback engine and the tile shader. Kept free
// of three.js imports so playback logic (and its tests) never pull in WebGL.

/**
 * Tile states written per instance by the playback engine. All animation
 * (lift, flash, settle) is computed on the GPU from the state and the playback
 * time it was set, so the CPU only touches cells that change.
 */
export const TileState = {
  Idle: 0,
  Open: 1,
  Closed: 2,
  Path: 3,
  OpenB: 4,
  ClosedB: 5,
} as const

export const TileKind = {
  Floor: 0,
  Mud: 1,
  Hidden: 2,
} as const
