import { Link2 } from 'lucide-react'
import { session } from '@/app/session'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Logo } from './Logo'
import { SettingsMenu } from './SettingsMenu'

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b px-4">
      <Logo />
      <p className="hidden text-sm text-muted-foreground xl:block">Search algorithms racing on the same maze</p>
      <Tabs value="pathfinding" className="ml-auto hidden md:flex lg:ml-6">
        <TabsList aria-label="Arenas">
          <TabsTrigger value="pathfinding" className="px-3">
            Pathfinding
          </TabsTrigger>
          <TabsTrigger value="sorting" disabled className="px-3">
            Sorting <span className="text-[10px] text-muted-foreground">soon</span>
          </TabsTrigger>
          <TabsTrigger value="compression" disabled className="px-3">
            Compression <span className="text-[10px] text-muted-foreground">soon</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" onClick={() => void session.copyLink()}>
              <Link2 />
              <span className="hidden sm:inline">Copy link</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share this arena and lineup</TooltipContent>
        </Tooltip>
        <SettingsMenu />
      </div>
    </header>
  )
}
