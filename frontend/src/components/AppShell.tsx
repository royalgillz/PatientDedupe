import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Inbox,
  ScrollText,
  Search,
  FlaskConical,
  ShieldCheck,
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

          <div className="ml-auto flex items-center gap-2.5">
            <label className="flex items-center gap-2 text-[12px] text-ink-3">
              <span className="hidden sm:inline">Acting as</span>
              <select
                value={current?.id ?? ""}
                onChange={(e) => setCurrentId(Number(e.target.value))}
                aria-label="Acting as reviewer"
                className="h-8 max-w-[120px] rounded-md border bg-surface px-2 text-[13px] font-medium text-ink focus-ring"
              >
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}{r.role === "lead" ? " (lead)" : ""}</option>
                ))}
              </select>
            </label>
            <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-white">
              {current ? initials(current.name) : "?"}
            </div>
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
