import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Inbox,
  ScrollText,
  Search,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
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

export function AppShell() {
  const { reviewers, current, setCurrentId } = useReviewer();
  const navigate = useNavigate();
  const { data: dash } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-[232px] shrink-0 flex-col border-r bg-surface">
        <div className="flex h-[60px] items-center px-5">
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
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-medium transition-colors",
                        isActive
                          ? "bg-brand-subtle text-brand-ink"
                          : "text-ink-2 hover:bg-subtle hover:text-ink",
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
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[60px] shrink-0 items-center gap-4 border-b bg-surface/80 px-6 backdrop-blur">
          <form
            className="relative w-full max-w-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const q = new FormData(e.currentTarget).get("q") as string;
              if (q?.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <input
              name="q"
              placeholder="Search patients by name or MRN"
              className="h-9 w-full rounded-md border bg-app pl-9 pr-3 text-sm text-ink placeholder:text-ink-3 focus-ring"
            />
          </form>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-2 text-[12px] text-ink-3">
              Acting as
              <select
                value={current?.id ?? ""}
                onChange={(e) => setCurrentId(Number(e.target.value))}
                className="h-8 rounded-md border bg-surface px-2 text-[13px] font-medium text-ink focus-ring"
              >
                {reviewers.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid size-8 place-items-center rounded-full bg-brand text-[12px] font-semibold text-white">
              {current ? initials(current.name) : "?"}
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
