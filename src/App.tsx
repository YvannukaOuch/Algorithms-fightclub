import { useEffect } from 'react'
import { useApplyTheme } from '@/app/preferences'
import { session } from '@/app/session'
import { ControlPanel } from '@/components/ControlPanel'
import { Scorecard } from '@/components/Scorecard'
import { ArenaView } from '@/components/stage/ArenaView'
import { TopBar } from '@/components/TopBar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useShortcuts } from '@/hooks/useShortcuts'

export default function App() {
  useApplyTheme()
  useShortcuts()
  useEffect(() => session.start(), [])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
        <TopBar />
        <div className="flex flex-1 flex-col lg:grid lg:min-h-0 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <aside className="order-2 border-t lg:order-1 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-r">
            <ControlPanel />
          </aside>
          <main className="order-1 flex min-h-0 flex-col lg:order-2">
            <div className="relative h-[70svh] min-h-[440px] lg:h-auto lg:min-h-0 lg:flex-1">
              <ArenaView />
            </div>
            <Scorecard />
          </main>
        </div>
      </div>
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}
