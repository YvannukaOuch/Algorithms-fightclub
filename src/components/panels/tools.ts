import { BrickWall, CircleDot, Droplets, Eraser, Gem, type LucideIcon } from 'lucide-react'
import type { Tool } from '@/state/store'

export const TOOLS: { id: Tool; label: string; icon: LucideIcon; help: string }[] = [
  { id: 'wall', label: 'Wall', icon: BrickWall, help: 'Draw walls. Start on a wall to remove walls instead.' },
  { id: 'erase', label: 'Erase', icon: Eraser, help: 'Clear walls and mud back to plain floor.' },
  { id: 'mud', label: 'Mud', icon: Droplets, help: 'Paint mud, which costs 5 to cross.' },
  { id: 'start', label: 'Start', icon: CircleDot, help: 'Move the starting point.' },
  { id: 'goal', label: 'Goal', icon: Gem, help: 'Move the goal.' },
]

export const isTool = (v: string): v is Tool => TOOLS.some((t) => t.id === v)
