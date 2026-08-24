import * as React from "react"
import { PanelLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type SidebarContextValue = {
  open: boolean
  mobileOpen: boolean
  setMobileOpen: React.Dispatch<React.SetStateAction<boolean>>
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

function SidebarProvider({
  defaultOpen = true,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const toggleSidebar = React.useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      setOpen((value) => !value)
    } else {
      setMobileOpen((value) => !value)
    }
  }, [])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  return (
    <SidebarContext.Provider value={{ open, mobileOpen, setMobileOpen, toggleSidebar }}>
      <div
        data-slot="sidebar-wrapper"
        className={cn("flex h-svh min-h-0 w-full overflow-hidden bg-background", className)}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )
}

function Sidebar({ className, children, ...props }: React.ComponentProps<"aside">) {
  const { open, mobileOpen, setMobileOpen } = useSidebar()

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          aria-label="关闭侧栏"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        data-slot="sidebar"
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "fixed bottom-0 left-0 top-[var(--window-safe-top)] z-50 flex h-[calc(100svh-var(--window-safe-top))] w-64 shrink-0 -translate-x-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 ease-out md:sticky md:top-[var(--window-safe-top)] md:self-start md:translate-x-0",
          mobileOpen && "translate-x-0",
          open ? "md:w-60" : "md:w-16",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    </>
  )
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-header" className={cn("flex shrink-0 flex-col gap-2 p-3", className)} {...props} />
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-content" className={cn("flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2", className)} {...props} />
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-footer" className={cn("flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3", className)} {...props} />
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group" className={cn("flex w-full flex-col gap-1", className)} {...props} />
}

function SidebarGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  const { open } = useSidebar()
  return (
    <div
      data-slot="sidebar-group-label"
      className={cn(
        "h-7 overflow-hidden px-2 text-xs font-medium text-sidebar-foreground/55 transition-opacity",
        open ? "opacity-100" : "md:opacity-0",
        className,
      )}
      {...props}
    />
  )
}

function SidebarGroupContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="sidebar-group-content" className={cn("w-full", className)} {...props} />
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
  return <ul data-slot="sidebar-menu" className={cn("flex w-full flex-col gap-1", className)} {...props} />
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="sidebar-menu-item" className={cn("relative", className)} {...props} />
}

function SidebarMenuButton({
  isActive = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { isActive?: boolean }) {
  const { open, setMobileOpen } = useSidebar()

  return (
    <button
      type="button"
      data-slot="sidebar-menu-button"
      data-active={isActive}
      className={cn(
        "flex h-9 w-full items-center gap-3 overflow-hidden rounded-lg px-2.5 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
        !open && "md:justify-center md:px-0",
        className,
      )}
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        setMobileOpen(false)
      }}
    >
      {children}
    </button>
  )
}

function SidebarTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()
  return (
    <Button
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon"
      className={cn("shrink-0", className)}
      {...props}
      onClick={(event) => {
        props.onClick?.(event)
        toggleSidebar()
      }}
    >
      <PanelLeft />
      <span className="sr-only">切换侧栏</span>
    </Button>
  )
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn("relative mt-[var(--window-safe-top)] flex h-[calc(100svh-var(--window-safe-top))] min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-background [scrollbar-gutter:stable]", className)}
      {...props}
    />
  )
}

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
}
