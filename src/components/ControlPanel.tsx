import { Separator } from '@/components/ui/separator'
import { ArenaPanel } from './panels/ArenaPanel'
import { EditPanel } from './panels/EditPanel'
import { FightersPanel } from './panels/FightersPanel'

export function ControlPanel() {
  return (
    <div className="space-y-6 p-4">
      <FightersPanel />
      <Separator />
      <ArenaPanel />
      <Separator />
      <EditPanel />
    </div>
  )
}
