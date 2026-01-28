import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Inbox,
  ScrollText,
  Search,
  FlaskConical,
  ShieldCheck,
  Check,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { CommandPalette } from "@/components/CommandPalette";
import { Logo, LogoMark } from "@/components/Logo";
import { api, type DashboardData } from "@/lib/api";
import { useReviewer } from "@/lib/reviewer";
import { cn } from "@/lib/utils";

const NAV = [
  { group: "Work", items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/queue", label: "Review queue", icon: Inbox },
  ]},
  { group: "Identity", items: [
    { to: "/search", label: "Search", icon: Search },
    { to: "/sandbox", label: "Sandbox", icon: FlaskConical },
  ]},
  { group: "Governance", items: [
    { to: "/audit", label: "Audit log", icon: ScrollText },
  ]},
];

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

function NavContent({ dash, onNavigate }: { dash?: DashboardData; onNavigate?: () => void }) {
  return (
    <>
      <div className="flex h-[60px] items-center justify-between px-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-5 px-3 py-4">
        {NAV.map((section) => (
          <div key={section.group}>
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
              {section.group}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                      isActive ? "bg-brand-subtle text-brand-ink" : "text-ink-2 hover:bg-subtle hover:text-ink",
                    )
                  }
                >
                  <item.icon className="size-[18px]" strokeWidth={2} />
                  {item.label}
                  {item.to === "/queue" && dash?.pending ? (
                    <span className="tnum ml-auto rounded-full bg-muted px-1.5 text-[11px] font-semibold text-ink-2">
                      {dash.pending}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="flex items-center gap-2 border-t px-4 py-3 text-[11px] text-ink-3">
        <ShieldCheck className="size-3.5 text-brand" />
        Synthetic data only
      </div>
    </>
  );
}

export function AppShell() {
  const { reviewers, current, setCurrentId } = useReviewer();
  const navigate = useNavigate();
  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-[232px] shrink-0 flex-col border-r bg-surface md:flex">
        <NavContent dash={dash} />
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-[rgba(27,31,35,0.4)]" onClick={() => setNavOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-[252px] flex-col bg-surface shadow-xl">
            <button
              className="absolute right-3 top-4 text-ink-3 hover:text-ink"
              onClick={() => setNavOpen(false)}
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <NavContent dash={dash} onNavigate={() => setNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center gap-3 border-b bg-surface/80 px-4 backdrop-blur md:px-6">
          <button className="text-ink-2 hover:text-ink md:hidden" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="md:hidden">
            <LogoMark size={24} />
          </div>

          <form
            className="relative hidden w-full max-w-sm sm:block"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q") as string;
              if (q?.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              name="q"
              aria-label="Search patients by name or MRN"
              placeholder="Search patients by name or MRN"
              className="h-9 w-full rounded-md border bg-app pl-9 pr-14 text-sm text-ink placeholder:text-ink-3 focus-ring"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border bg-surface px-1.5 py-0.5 text-[11px] font-medium text-ink-3">
              ⌘K
            </kbd>
          </form>

          <div className="ml-auto flex items-center">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  aria-label="Acting as reviewer"
                  className="flex h-9 items-center gap-2 rounded-md border bg-surface pl-1 pr-2 transition-colors hover:bg-subtle focus-ring"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-semibold text-white">
                    {current ? initials(current.name) : "?"}
                  </span>
                  <span className="hidden text-left leading-none sm:block">
                    <span className="block text-[10px] uppercase tracking-wide text-ink-3">Acting as</span>
                    <span className="mt-0.5 block text-[13px] font-medium text-ink">{current?.name ?? "Select reviewer"}</span>
                  </span>
                  {current?.role === "lead" && (
                    <span className="hidden rounded-full bg-brand-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-ink sm:inline">
                      lead
                    </span>
                  )}
                  <ChevronDown className="size-3.5 text-ink-3" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-[80] min-w-[240px] rounded-lg border bg-surface p-1 shadow-[0_8px_28px_rgba(40,33,20,0.14)]"
                >
                  <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Act as reviewer</div>
                  {reviewers.map((r) => (
                    <DropdownMenu.Item
                      key={r.id}
                      onSelect={() => setCurrentId(r.id)}
                      className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-ink outline-none data-[highlighted]:bg-subtle"
                    >
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-subtle text-[11px] font-semibold text-brand-ink">
                        {initials(r.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate leading-tight">{r.name}</span>
                        <span className="block text-[11px] capitalize leading-tight text-ink-3">{r.role}</span>
                      </span>
                      {current?.id === r.id && <Check className="size-4 shrink-0 text-brand" />}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
